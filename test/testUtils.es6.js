////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import _, {template} from 'lodash';
import isString from 'lodash-bound/isString';
import isFunction from 'lodash-bound/isFunction';
import isArray from 'lodash-bound/isArray';
import isNull from 'lodash-bound/isNull';
import isUndefined from 'lodash-bound/isUndefined';

import chai, {expect} from 'chai';

import supertest   from './custom-supertest.es6.js';
import getServer   from '../src/server.es6.js';
import {resources, relationships} from '../src/resources.es6.js';
import {OK, NOT_FOUND, CREATED} from "../src/http-status-codes.es6";
import {href2Id} from "../src/utility.es6";
import modelFactory from "../node_modules/open-physiology-model/src/index.js";

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// chai helpers                                                                                                       //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

chai.use((_chai, utils) => {
    utils.addProperty(chai.Assertion.prototype, 'sole', function () {
        /* object must be an array */
        this.assert(
            (this._obj)::isArray()
            , 'expected #{this} to be an array'
            , 'expected #{this} not to be an array'
        );
        /* set 'sole' flag */
        utils.flag(this, 'sole', true);
    });
    utils.addProperty(chai.Assertion.prototype, 'element', function () {
        /* object must be an array */
        this.assert(
            this._obj::isArray()
            , 'expected #{this} to be an array'
            , 'expected #{this} not to be an array'
        );
        /* array must have at least one element */
        this.assert(
            this._obj.length >= 1
            , 'expected #{this} to have at least one element'
            , 'expected #{this} not to have at least one element'
        );
        /* if 'sole' is set, array must have exactly one element */
        let sole = utils.flag(this, 'sole');
        if (sole) {
            this.assert(
                this._obj.length === 1
                , 'expected #{this} to have exactly one element'
                , 'expected #{this} not to have exactly one element'
            );
        }
        utils.flag(this, 'object', this._obj[0]);
    });
});


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// setup                                                                                                              //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* before testing: start server, wait for it, get the supertest library rolling */
export let api, db;

//escaping out of .tmp/mocha-webpack/dist
before(() => getServer(`${__dirname}/../../dist/`, {
    exposeDB: true,
    dbDocker: 'neo4j',
    dbUser: 'neo4j',
    dbPass: 'nknk14',
    dbHost: '192.168.99.100',//localhost
    dbPort: 32769, //7474
    dbConsoleLogging: false,
    consoleLogging: false
}).then(({database, server}) => {
    db  = database;
    api = supertest(Promise)(server);
}));


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// utility                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* database operations (bypassing REST server) */
const getAllResources   = async (className)         => await db.getAllResources(resources[className]);
const getResources      = async (className, ids)    => await db.getSpecificResources(resources[className], ids);
const getSingleResource = async (className, id)     => (await getResources(className, [id]))[0];
const refreshResource   = async (res)              => Object.assign(res, await getSingleResource(res.class, res.id));
const createResource    = async (className, fields) => await getSingleResource(className,
                                                       await db.createResource(resources[className], fields));

/* database operations that work with manifest resources (bypassing REST server) */

/* server request api (through our REST server) */
export const requestResources      = async (path) => (await api.get(path)).body;
export const requestSingleResource = async (path) => (await requestResources(path))[0];

/* dynamically created, specialized functions and variables used in describing our test */
export let GET, POST, PUT, DELETE;
export let setInvalidPathParams, setValidPathParams, withInvalidPathParams, withValidPathParams;
export let describeEndpoint;

let cls;

/* DESCRIBE BLOCK: given resource class */
export const describeResourceClass = (className, runResourceClassTests) => {
    let only = (className[0] === '*');
    if (only) { className = className.slice(1) }
    (only ? describe.only : describe)(className, () => {

        /* set useful variables */
        before(() => { cls = model[className];});

        /* DESCRIBE BLOCK: given endpoint */
        describeEndpoint = (givenPath, supportedVerbs, runEndpointTests) => {
            describe(givenPath, () => {

                /* for setting the path parameters */
                let compiledPath = givenPath;
                let compilePath  = template(compiledPath, { interpolate: /{(\w+?)}/g });

                /* the verb testers */
                const verbTester = (verb) => (claim, expectations) => {
                    it(`${verb.toUpperCase()} ${claim}`, () => expectations(api[verb](compiledPath)));
                };
                GET    = verbTester('get');
                POST   = verbTester('post');
                PUT    = verbTester('put');
                DELETE = verbTester('delete');
                let VERB = {GET, POST, PUT, DELETE};

                /* DESCRIBE BLOCK: given valid path parameters */
                withValidPathParams = (desc, params, runParamTests) => {
                    if (!desc::isString()) { [desc, params, runParamTests] = ["valid", desc, params] }
                    describe(`(${desc} path parameters)`, () => {
                        beforeEach(() => { compiledPath = compilePath(params::isFunction() ? params() : params) });

                        /* run test common to all endpoints with valid path params */
                        if (/^\/\w+\/{\w+}$/.test(givenPath)) {
                            GET("returns an array with at least one resource of the expected class", r=>r
                                .expect(OK)
                                .expect(isArray)
                                .resources((resources) => {
                                    expect(resources).to.have.length.of.at.least(1);
                                    let subClasses = [...cls.allSubclasses()].map(x => x.name);
                                    for (let res of resources) {
                                        expect(res).to.have.property('class');
                                        expect(subClasses).to.include(res.class);
                                    }
                                })
                            );
                        }

                        /* run given test */
                        if (runParamTests) { runParamTests() }
                    });
                };

                /* DESCRIBE BLOCK: given invalid path parameters */
                withInvalidPathParams = (desc, params, runParamTests) => {
                    if (!desc::isString()) { [desc, params, runParamTests] = ["invalid", desc, params] }
                    describe(`(${desc} path parameters)`, () => {
                        /* set the compiled path before each test */
                        beforeEach(() => { compiledPath = compilePath(params::isFunction() ? params() : params) });

                        /* run test common to all endpoints with invalid path params  */
                        if (/^\/\w+\/{\w+}$/.test(givenPath)) {
                            for (let verb of supportedVerbs) {
                                // TODO: to test this on POST and PUT, supply 'example' body from swagger
                                if (verb !== 'POST' && verb !== 'PUT') {
                                    VERB[verb]("responds with a 404 error", r=>r.expect(NOT_FOUND));
                                }
                            }
                        }

                        /* run given test */
                        if (runParamTests) { runParamTests() }
                    });
                };

                /* run test common to all endpoints */
                if (/^\/\w+$/.test(givenPath)) {
                    GET("returns an array with resources of the expected class", r=>r
                        .expect(OK)
                        .expect(isArray)
                        .resources((resources) => {
                            expect(resources).to.have.instanceOf(Array);
                            let subClasses = [...cls.allSubclasses()].map(x => x.name);
                            for (let res of resources) {
                                expect(res).to.have.property('class');
                                expect(subClasses).to.include(res.class);
                            }
                        })
                    );
                }

                /* run given test */
                if (runEndpointTests) { runEndpointTests() }

            });
        };

        /* run given test */
        if (runResourceClassTests) { runResourceClassTests() }

    });
};

export const describeBatch = (runBatchTests) => {
    describe("/batch", () => {
        /* DESCRIBE BLOCK: given endpoint */
        describeEndpoint = (givenPath, supportedVerbs, runEndpointTests) => {
            describe(givenPath, () => {

                /* for setting the path parameters */
                let compiledPath = givenPath;
                let compilePath  = template(compiledPath, { interpolate: /{(\w+?)}/g });

                /* the verb testers */
                const verbTester = (verb) => (claim, expectations) => {
                    it(`${verb.toUpperCase()} ${claim}`, () => expectations(api[verb](compiledPath)));
                };
                GET    = verbTester('get');
                POST   = verbTester('post');
                PUT    = verbTester('put');
                DELETE = verbTester('delete');
                let VERB = {GET, POST, PUT, DELETE};

                /* DESCRIBE BLOCK: given valid path parameters */
                withValidPathParams = (desc, params, runParamTests) => {
                    if (!desc::isString()) { [desc, params, runParamTests] = ["valid", desc, params] }
                    describe(`(${desc} path parameters)`, () => {
                        beforeEach(() => { compiledPath = compilePath(params::isFunction() ? params() : params) });
                        /* run given test */
                        if (runParamTests) { runParamTests() }
                    });
                };

                /* run given test */
                if (runEndpointTests) { runEndpointTests() }
            });
        };

        /* run given test */
        if (runBatchTests) { runBatchTests() }

    });
};


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// before each test, reset the database                                                                               //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* variables to store all resources created at the beginning of each test */
export let initial = {};
export let dynamic = {};
let model;

/* initial database clearing */
before(() => {
    db.clear('Yes! Delete all everythings!');
    model = modelFactory({
            /* Commit a newly created entity to DB */
            async commit_new({commandType, values}) {
                let cls = model[values.class];
                let res;
                if (cls.isResource){
                    let id = await db.createResource(cls, values);
                    res = await db.getSpecificResources(cls, [id], {withoutShortcuts: true});
                } else {
                    if (cls.isRelationship){
                        let id = await db.createRelationship(cls,
                            model[values[1].class], model[values[2].class],
                            href2Id(values[1].href), href2Id(values[2].href),
                            values);
                        res = await db.getSpecificRelationships(cls, [id]);
                    }
                }
                return res[0];
            },

            /* Commit an edited entity to DB */
            async commit_edit({entity, newValues}) {
                let cls = model[entity.class];
                let id = href2Id(entity.href);
                let res;
                if (cls.isResource){
                    await db.updateResource(cls, id, newValues);
                    res = await db.getSpecificResources(cls, [id], {withoutShortcuts: true});
                } else {
                    if (cls.isRelationship){
                        await db.updateRelationshipByID(cls, id, newValues);
                        res = await db.getSpecificRelationships(cls, [id]);
                    }
                }
                return res[0];
            },

            /* Commit changes after deleting entity to DB */
            async commit_delete({entity}) {
                let cls = model[entity.class];
                let id = href2Id(entity.href);
                if (cls.isResource){
                    await db.deleteResource(cls, id);
                } else {
                    if (cls.isRelationship){
                        await db.deleteRelationshipByID(cls, id);
                    }
                }
            },

            /* Load from DB all entities with given IDs */
            async load(addresses, options = {}) {
                let clsMaps = {};
                for (let address of Object.values(addresses)){
                    let cls = model[address.class];
                    let id = href2Id(address.href);
                    if (clsMaps[cls.name]::isUndefined()){
                        clsMaps[cls.name] = {cls: cls, ids: [id]}
                    } else {
                        clsMaps[cls.name].ids.push(id);
                    }
                }
                let results = [];
                for (let {cls, ids} of Object.values(clsMaps)){
                    let clsResults = (cls.isResource)?
                        await db.getSpecificResources(cls, ids, {withoutShortcuts: true}):
                        await db.getSpecificRelationships(cls, ids);
                    clsResults = clsResults.filter(x => !x::isNull() && !x::isUndefined());
                    if (clsResults.length < ids.length){
                        throw customError({
                            status:  NOT_FOUND,
                            class:   cls.name,
                            ids:     ids,
                            message: humanMsg`Not all specified ${cls.name} entities with IDs '${ids.join(',')}' exist.`
                        });
                    }
                    if (clsResults.length > 0){
                        results.push(...clsResults);
                    }
                }
                return results;
            },

            /* Load from DB all entities of a given class */
            async loadAll(cls, options = {}) {
                let results = [];
                if (cls.isResource){
                    results = await db.getAllResources(cls, {withoutShortcuts: true});
                } else {
                    if (cls.isRelationship){
                        results = await db.getAllRelationships(cls);
                    }
                }
                return results;
            }
    }).classes;
});

/* before each test, reset the database */
beforeEach(async () => {

    /* external resources */
    initial.externalResource1 = model.ExternalResource.new({
        name:  "Third plantar metatarsal vein",
        uri :  "http://purl.obolibrary.org/obo/FMA_44539",
        type:  "fma"});
    /* borders */
    //for mainLyph1, mainLyph2
    initial.border1 = model.Border.new({ nature: "open"});
    initial.border2 = model.Border.new({ nature: "closed"});
    initial.border3 = model.Border.new({ nature: "open"});
    initial.border4 = model.Border.new({ nature: "closed"});
    //for lyph1, lyph2, lyph3
    initial.border5  = model.Border.new({ nature: "open"});
    initial.border6  = model.Border.new({ nature: "closed"});
    initial.border7  = model.Border.new({ nature: "open"});
    initial.border8  = model.Border.new({ nature: "closed"});
    initial.border9  = model.Border.new({ nature: "open"});
    initial.border10 = model.Border.new({ nature: "closed"});

    /* materials */
    initial.material1 = model.Material.new({ name: "Blood"});
    initial.material2 = model.Material.new({ name: "Urine"});

    /* measurables */
    initial.measurable1 =  model.Measurable.new({ name:  "Concentration of water"});
    initial.measurable2 =  model.Measurable.new({ name:  "Concentration of ion"});

    /* types */
    initial.materialType1 = model.Type.new({
        name: "Blood", definition: initial.material1});

    /* causalities */
    initial.causality1 = model.Causality.new({
        name:   "Functional dependency",
        cause:  initial.measurable1,
        effect: initial.measurable2});


    /* lyphs */
    initial.lyph1 = model.Lyph.new({name: "Renal hilum", longitudinalBorders: [initial.border5, initial.border6] });
    initial.lyph2 = model.Lyph.new({name: "Renal parenchyma", longitudinalBorders: [initial.border7, initial.border8] });
    initial.lyph3 = model.Lyph.new({name: "Renal capsule", longitudinalBorders: [initial.border9, initial.border10] });

    initial.mainLyph1 = model.Lyph.new({
        name      : "Kidney",
        species   : "Homo sapiens",
        thickness : {value: 1},
        length    : {min: 1, max: 10},
        externals: [initial.externalResource1],
        materials: [initial.materialType1],
        longitudinalBorders: [initial.border1, initial.border2],
        axis: initial.border1,
        layers:    [initial.lyph1, initial.lyph2],
        measurables: [initial.measurable1]
    });

    initial.mainLyph2 = model.Lyph.new({
        name:  "Stomach",
        layers: [initial.lyph3, initial.lyph2],
        measurables: [initial.measurable2],
        longitudinalBorders: [initial.border3, initial.border4]
    });

    initial.lyphType1 = model.Type.new({
        name: "Renal hilum type",
        definition: initial.lyph1});

    initial.lyphType2 = model.Type.new({
        name: "Renal parenchyma type",
        definition: initial.lyph2});

    initial.lyphType3 = model.Type.new({
        name: "Renal capsule type",
        definition: initial.lyph3});

    /* processes */
    initial.process1 = model.Process.new({
        name : "Blood advective process",
        transportPhenomenon: "advection",
        conveyingLyph: [initial.mainLyph1]});

    /* nodes */
    initial.node1 = model.Node.new({
        // Note: if we uncomment this, test DELETE lyphs/{id} will fail as node anchors the lyph's measurable
        //measurables: [initial.measurable1],
        incomingProcesses:  [initial.process1],
        locations: [initial.mainLyph1]});

    /* groups */
    initial.group1 = model.Group.new({
        name:  "Mixed group",
        elements: [initial.lyph1, initial.node1, initial.process1]
    });

    /* canonical trees */
    initial.canonicalTree1 = model.CanonicalTree.new({
        name:  "SLN"});

    initial.canonicalTree1_2 = model.CanonicalTree.new({
        name:  "SLN tail 1"});

    initial.canonicalTree1_3 = model.CanonicalTree.new({
        name:  "SLN tail 2"});

    initial.canonicalTreeBranch1_2 = model.CanonicalTreeBranch.new({
        name:  "SLN 1st level branch",
        conveyingLyphType: initial.lyphType1,
        parentTree: initial.canonicalTree1,
        childTree: initial.canonicalTree1_2
    });

    initial.canonicalTreeBranch2_3 = model.CanonicalTreeBranch.new({
        name:  "SLN 2st level branch",
        conveyingLyphType: initial.lyphType2,
        parentTree: initial.canonicalTree1_2,
        childTree: initial.canonicalTree1_3
    });

    /* publications */
    initial.publication1 = model.Publication.new({
        name:  "Multimodal MRI of the hippocampus in Parkinson's disease with visual hallucinations"
    });

    /* clinical indices */
    initial.clinicalIndex1 = model.ClinicalIndex.new({
        name:  "NP3FRZGT MDS - Unified Parkinson's Disease Rating Scale (3.11 Freezing of Gait)",
    });

    initial.clinicalIndex2 = model.ClinicalIndex.new({
        name:  "NP1HALL MDS - Unified Parkinson's Disease Rating Scale (1.2 Hallucinations and Psychosis)",
        parent: initial.clinicalIndex1});

    /* correlations */
    initial.correlation1 = model.Correlation.new({
        publication: initial.publication1,
        clinicalIndices: [initial.clinicalIndex1, initial.clinicalIndex2],
        measurables: [initial.measurable1, initial.measurable2]
    });

    /* coalescences */
    initial.coalescence1 = model.Coalescence.new({
        lyphs: [initial.lyph1, initial.lyph2]
    });

    /* coalescence scenarios */
    initial.coalescenceScenario1 = model.CoalescenceScenario.new({
        lyphs: [initial.mainLyph1, initial.mainLyph2]});

    console.log("OK so far");

    for (let key of Object.keys(initial)){
        await initial[key].commit();
    }

    ///////////////////////////////////////////////////
    //Test various direct DB operations here         //
    ///////////////////////////////////////////////////

    //Testing DB creation of resources
    dynamic.externalResource1 = model.ExternalResource.new({
        name: "Right fourth dorsal metatarsal vein",
        uri: "http://purl.obolibrary.org/obo/FMA_44515",
        type: "fma"
    });

    dynamic.borders = [];
    for (let i = 0; i < 6; i++){
        dynamic.borders.push(model.Border.new({nature: "open" }));
    }

    dynamic.lyph  = model.Lyph.new({name:  "Liver", longitudinalBorders: [dynamic.borders[0], dynamic.borders[1]]});
    dynamic.lyph1 = model.Lyph.new({name:  "Aorta", longitudinalBorders: [dynamic.borders[2], dynamic.borders[3]]});
    dynamic.lyph2 = model.Lyph.new({name:  "Heart", longitudinalBorders: [dynamic.borders[4], dynamic.borders[5]]});

    await dynamic.externalResource1.commit();
    for (let i = 0; i <6; i++){
        await dynamic.borders[i].commit();
    }

    await dynamic.lyph.commit();
    await dynamic.lyph1.commit();
    await dynamic.lyph2.commit();

    dynamic.lyph = dynamic.lyph.toJSON();

    console.log("Test utils successfully completed!");
});


/* clear database for every tear-down */
afterEach(() => {db.clear('Yes! Delete all everythings!');});


