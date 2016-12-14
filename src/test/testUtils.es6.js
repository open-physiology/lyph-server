////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import _, {template, isArray} from 'lodash';
import isString from 'lodash-bound/isString';
import isFunction from 'lodash-bound/isFunction';

import chai, {expect} from 'chai';

import supertest   from './custom-supertest.es6.js';
import getServer   from '../server.es6.js';
import {resources, relationships, model} from '../resources.es6.js';
import {OK, NOT_FOUND, CREATED} from "../http-status-codes.es6";
import {extractFieldValues} from '../utility.es6';

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// chai helpers                                                                                                       //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

chai.use((_chai, utils) => {
    utils.addProperty(chai.Assertion.prototype, 'sole', function () {
        /* object must be an array */
        this.assert(
            Array.isArray(this._obj)
            , 'expected #{this} to be an array'
            , 'expected #{this} not to be an array'
        );
        /* set 'sole' flag */
        utils.flag(this, 'sole', true);
    });
    utils.addProperty(chai.Assertion.prototype, 'element', function () {
        /* object must be an array */
        this.assert(
            Array.isArray(this._obj)
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

before(() => getServer(`${__dirname}/../`, {
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
const createCLResource = async (resource) => {
    let fields = extractFieldValues(resource);
    return await getSingleResource(resource.constructor.name, await db.createResource(resource.constructor, fields));
};

/* server request api (through our REST server) */
export const requestResources      = async (path) => (await api.get(path)).body;
export const requestSingleResource = async (path) => (await requestResources(path))[0];

/* dynamically created, specialized functions and variables used in describing our tests */
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
        //before(() => { cls = resources[className] });
        before(() => { cls = model[className] });

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

                        /* run tests common to all endpoints with valid path params */
                        if (/^\/\w+\/{\w+}$/.test(givenPath)) {
                            GET("returns an array with at least one resource of the expected class", r=>r
                                .expect(OK)
                                .expect(isArray)
                                .resources((resources) => {
                                    expect(resources).to.have.length.of.at.least(1);
                                    for (let res of resources) {
                                        expect(res).to.have.property('class', cls.name);
                                    }
                                })
                            );
                        }

                        /* run given tests */
                        if (runParamTests) { runParamTests() }
                    });
                };

                /* DESCRIBE BLOCK: given invalid path parameters */
                withInvalidPathParams = (desc, params, runParamTests) => {
                    if (!desc::isString()) { [desc, params, runParamTests] = ["invalid", desc, params] }
                    describe(`(${desc} path parameters)`, () => {
                        /* set the compiled path before each test */
                        beforeEach(() => { compiledPath = compilePath(params::isFunction() ? params() : params) });

                        /* run tests common to all endpoints with invalid path params  */
                        if (/^\/\w+\/{\w+}$/.test(givenPath)) {
                            for (let verb of supportedVerbs) {
                                // TODO: to test this on POST and PUT, supply 'example' body from swagger
                                if (verb !== 'POST' && verb !== 'PUT') {
                                    VERB[verb]("responds with a 404 error", r=>r.expect(NOT_FOUND));
                                }
                            }
                        }

                        /* run given tests */
                        if (runParamTests) { runParamTests() }
                    });
                };

                /* run tests common to all endpoints */
                if (/^\/\w+$/.test(givenPath)) {
                    GET("returns an array with resources of the expected class", r=>r
                        .expect(OK)
                        .expect(isArray)
                        .resources((resources) => {
                            expect(resources).to.have.instanceOf(Array);
                            for (let res of resources) {
                                expect(res).to.have.property('class', cls.name);
                            }
                        })
                    );
                }

                /* run given tests */
                if (runEndpointTests) { runEndpointTests() }

            });
        };

        /* run given tests */
        if (runResourceClassTests) { runResourceClassTests() }

    });
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// before each test, reset the database                                                                               //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* variables to store all resources created at the beginning of each test */
export let initial = {};
export let portable = {};

/* initial database clearing */
before(() => db.clear('Yes! Delete all everythings!'));

/* before each test, reset the database */
beforeEach(async () => {

    ////////////////////////////////////////////////////////////////////////
    /*Create test resources via client library*/

    /* external resources */
    initial.externalResource1 = model.ExternalResource.new({
        name:  "Third plantar metatarsal vein",
        uri :  "http://purl.obolibrary.org/obo/FMA_44539",
        type:  "fma"});

    /* borders */
    initial.border1 = model.Border.new({ nature: "open" });
    initial.border2 = model.Border.new({ nature: "closed" });
    initial.border3 = model.Border.new({ nature: "open" });
    initial.border4 = model.Border.new({ nature: "closed" });

    /* materials */
    initial.material1 = model.Material.new({ name: "Blood" });
    initial.material2 = model.Material.new({ name: "Urine" });

    /* types */
    //initial.materialType1 = model.Type.new({
    // name: "Blood",
    // definition: initial.material1});
    //await initial.materialType1.commit();

    /* measurables */
    initial.measurable1 =  model.Measurable.new({ name:  "Concentration of water" });
    initial.measurable2 =  model.Measurable.new({ name:  "Concentration of ion" });

    /* causalities */
    // initial.causality1 = model.Causality.new({
    //     name:   "Functional dependency",
    //     cause:  initial.measurable1,
    //     effect: initial.measurable2
    // });

    /* lyphs */
    initial.lyph1 = model.Lyph.new({name: "Renal hilum" });
    initial.lyph2 = model.Lyph.new({name: "Renal parenchyma" });
    initial.lyph3 = model.Lyph.new({name: "Renal capsule" });

    initial.mainLyph1 = model.Lyph.new({
        name      : "Kidney",
        species   : "Homo sapiens",
        thickness : {value: 1},
        length    : {min: 1, max: 10},
        externals: [initial.externalResource1],
        //materials: [initial.materialType1],
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

    /* processes */
    initial.process1 = model.Process.new({
        name : "Blood advective process",
        transportPhenomenon: "advection"//,  //TODO test with array
        //sourceLyph: initial.lyph1,
        //targetLyph: initial.lyph2,
        //conveyingLyph: [initial.mainLyph1]
    });

    /* nodes */
    initial.node1 = model.Node.new({
        measurables: [initial.measurable1],
       // incomingProcesses:  [initial.process1],
        locations: [initial.mainLyph1]
    });

    /* groups */
    initial.group1 = model.Group.new({
        name:  "Mixed group",
        elements: [initial.lyph1, initial.node1, initial.process1]
    });

    /* omega trees */
    initial.omegaTree1 = model.OmegaTree.new({
        name:  "Short Looped Nephrone",
        parts: [initial.lyph1, initial.lyph2, initial.lyph3]
    });

    /* publications */
    initial.publication1 = model.Publication.new({
        name:  "Multimodal MRI of the hippocampus in Parkinson's disease with visual hallucinations"
    });

    /* clinical indices */
    initial.clinicalIndex1 = model.ClinicalIndex.new({
        name:  "NP3FRZGT MDS - Unified Parkinson's Disease Rating Scale (3.11 Freezing of Gait)"
    });

    initial.clinicalIndex2 = model.ClinicalIndex.new({
        name:  "NP1HALL MDS - Unified Parkinson's Disease Rating Scale (1.2 Hallucinations and Psychosis)",
        parent: initial.clinicalIndex1
    });

    /* correlations */
    initial.correlation1 = model.Correlation.new({
        class: "Correlation",
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
        lyphs: [initial.mainLyph1, initial.mainLyph2]
    });

    //Commit all to get IDs assigned
    await Promise.all(Object.values(initial).map(p => p.commit()));

    /*Create DB nodes for test resources*/
    for (let [resName, resSpec] of Object.entries(initial)){
        initial[resName] = await createCLResource(resSpec);
    }

    /* refresh all resource objects */
    await Promise.all(Object.values(initial).map(refreshResource));


    ///////////////////////////////////////////////////
    //Test various direct DB operations here         //
    ///////////////////////////////////////////////////

    //Testing DB creation of resources
    let newExternalResource1 = model.ExternalResource.new({
        name: "Right fourth dorsal metatarsal vein",
        uri: "http://purl.obolibrary.org/obo/FMA_44515",
        type: "fma"
    });
    await newExternalResource1.commit();

    let newLyph1 = model.Lyph.new({name:  "Heart chamber"});
    await newLyph1.commit();

    let newLyph2 = model.Lyph.new({ name:  "Heart"});
    await newLyph2.commit();

    //Portable contains object with arrays of values instead of Rel$Field etc.

    portable.externalResource1 = extractFieldValues(newExternalResource1);
    portable.lyph1             = extractFieldValues(await createCLResource(newLyph1));
    portable.lyph2             = extractFieldValues(await createCLResource(newLyph2));

    //HasLayer with ID
    await db.addRelationship(resources["Lyph"].relationships["-->HasLayer"],
        portable.lyph1.id, portable.lyph2.id, {id: 200, class: "HasLayer"});
    await db.assertRelationshipsExist(relationships["HasLayer"], [200]);

    // await db.updateRelationship(resources["Lyph"].relationships["-->HasLayer"],
    //    initial.mainLyph1.id, initial.lyph2.id, {relativePosition: 1});
    // await db.assertRelationshipsExist(relationships["HasLayer"], [201]);

    // await db.replaceRelationship(resources["Lyph"].relationships["-->HasLayer"],
    //     initial.mainLyph1.id, initial.lyph2.id, {id: 202, class: "HasLayer"});
    // await db.assertRelationshipsExist(relationships["HasLayer"], [202]);

    // await db.getAllRelationships(relationships["HasLayer"]);

    // await db.replaceResource(resources["Lyph"], initial.mainLyph1.id, {name: "Head"});
    // await db.deleteResource(resources["Lyph"], initial.mainLyph1.id);

    // await db.deleteResource(resources["Lyph"], initial.mainLyph1.id);

    let res = await db.getAllRelationships(relationships["HasLayer"]);
    res = [...res].map(val => extractFieldValues(val));


});

/* clear database for every tear-down */
afterEach(() => { db.clear('Yes! Delete all everythings!'); });


//TODO: add test to model library for layers:
//let newLyph2 = model.Lyph.new({ name:  "Heart", layers: [newLyph1, initial.lyph3]});
//await newLyph2.commit();

//TODO: add tests to model library to detect UnhandledPromiseRejectionWarning
//     class: "Type", definition: initial.material1

//     class:  "Node", locations: [initial.mainLyph1]

//     class: "Group", elements: [initial.lyph1, initial.node1, initial.process1]

//     class: "OmegaTree", parts: [initial.lyph1, initial.lyph2, initial.lyph3]
