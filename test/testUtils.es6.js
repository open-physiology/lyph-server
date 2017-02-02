////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import _, {template} from 'lodash';
import isString from 'lodash-bound/isString';
import isFunction from 'lodash-bound/isFunction';
import isNumber from 'lodash-bound/isNumber';
import isArray from 'lodash-bound/isArray';
import isNull from 'lodash-bound/isNull';
import isUndefined from 'lodash-bound/isUndefined';

import chai, {expect} from 'chai';

import supertest   from './custom-supertest.es6.js';
import getServer   from '../src/server.es6.js';
import {resources, relationships} from '../src/resources.es6.js';
import {OK, NOT_FOUND, CREATED} from "../src/http-status-codes.es6";
import {extractFieldValues, setsToArrayOfIds} from '../src/utility.es6';
import modelFactory from "../node_modules/open-physiology-model/src/index.js";
import {simpleMockHandlers}   from '../node_modules/open-physiology-model/test/mock-handlers.helper';

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
before(() => getServer(`${__dirname}/../../../dist/`, {
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

                        /* run tests common to all endpoints with valid path params */
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
                            let subClasses = [...cls.allSubclasses()].map(x => x.name);
                            for (let res of resources) {
                                expect(res).to.have.property('class');
                                expect(subClasses).to.include(res.class);
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
export let dynamic = {};
let model;

/* initial database clearing */
before(() => {
    db.clear('Yes! Delete all everythings!');
    let {frontend} = simpleMockHandlers();
    model = modelFactory(frontend).classes;
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
    initial.border1 = model.Border.new({ nature: "open" });
    initial.border2 = model.Border.new({ nature: "closed" });
    initial.border3 = model.Border.new({ nature: "open" });
    initial.border4 = model.Border.new({ nature: "closed" });
    //for lyph1, lyph2, lyph3
    initial.border5  = model.Border.new({ nature: "open" });
    initial.border6  = model.Border.new({ nature: "closed" });
    initial.border7  = model.Border.new({ nature: "open" });
    initial.border8  = model.Border.new({ nature: "closed" });
    initial.border9  = model.Border.new({ nature: "open" });
    initial.border10 = model.Border.new({ nature: "closed" });

    /* materials */
    initial.material1 = model.Material.new({ name: "Blood" });
    initial.material2 = model.Material.new({ name: "Urine" });

    /* types */
    initial.materialType1 = model.Type.new({
    name: "Blood",
    definition: initial.material1});

    /* measurables */
    initial.measurable1 =  model.Measurable.new({ name:  "Concentration of water" });
    initial.measurable2 =  model.Measurable.new({ name:  "Concentration of ion" });

    /* causalities */
    initial.causality1 = model.Causality.new({
        name:   "Functional dependency",
        cause:  initial.measurable1,
        effect: initial.measurable2
    });

    /* lyphs */
    initial.lyph1 = model.Lyph.new({name: "Renal hilum", longitudinalBorders: [initial.border5, initial.border6] });
    initial.lyph2 = model.Lyph.new({name: "Renal parenchyma", longitudinalBorders: [initial.border7, initial.border8] });
    initial.lyph = model.Lyph.new({name: "Renal capsule", longitudinalBorders: [initial.border9, initial.border10] });

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
        layers: [initial.lyph, initial.lyph2],
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
        definition: initial.lyph});

    /* processes */
    initial.process1 = model.Process.new({
        name : "Blood advective process",
        transportPhenomenon: "advection",
        //sourceLyph: initial.lyph1,       //TODO - these will be removed from model library for now
        //targetLyph: initial.lyph2,
        conveyingLyph: [initial.mainLyph1]
    });

    /* nodes */
    initial.node1 = model.Node.new({
        //measurables: [initial.measurable1], //Note: if we uncomment this, test DELETE lyphs/{id} will fail as node anchors the lyph's measurable
        incomingProcesses:  [initial.process1],
        locations: [initial.mainLyph1]
    });

    /* groups */
    initial.group1 = model.Group.new({
        name:  "Mixed group",
        elements: [initial.lyph1, initial.node1, initial.process1]
    });

    /* canonical trees */
    initial.canonicalTree1 = model.CanonicalTree.new({
        name:  "SLN"
    });

    initial.canonicalTree1_2 = model.CanonicalTree.new({
        name:  "SLN tail 1"
    });

    initial.canonicalTree1_3 = model.CanonicalTree.new({
        name:  "SLN tail 2"
    });

    initial.canonicalTreeBranch1_2 = model.CanonicalTreeBranch.new({
        name:  "SLN 1st level branch",
        conveyingLyphType: initial.lyphType1,
        parentTree: initial.canonicalTree1,
        childTree: initial.canonicalTree1_2
    });

    // initial.canonicalTreeBranch2_3 = model.CanonicalTreeBranch.new({
    //     name:  "SLN 2st level branch",
    //     conveyingLyphType: initial.lyphType2,
    //     parentTree: initial.canonicalTree1_2,
    //     childTree: initial.canonicalTree1_3
    // });


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


    //Assign IDs
    let UID = 0;
    Object.values(initial).map(p => p.id = ++UID);


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
        id: ++UID,
        uri: "http://purl.obolibrary.org/obo/FMA_44515",
        type: "fma"
    });

    let borders = [];
    for (let i = 0; i <6; i++){
        borders.push(model.Border.new({id: 500 + i, nature: "open" }));
    }
    let lyph  = model.Lyph.new({name:  "Liver", longitudinalBorders: [borders[0], borders[1]]});
    let lyph1 = model.Lyph.new({name:  "Heart chamber", longitudinalBorders: [borders[2], borders[3]]});
    let lyph2 = model.Lyph.new({name:  "Heart", longitudinalBorders: [borders[4], borders[5]]});

    borders.map(p => p.id = ++UID);
    lyph.id = ++UID;
    lyph1.id = ++UID;
    lyph2.id = ++UID;

    /* "dynamic" contains objects with arrays of values instead of Rel$Field etc. */
    dynamic.externalResource1 = extractFieldValues(await createCLResource(newExternalResource1));
    dynamic.borders = [];
    for (let i = 0; i < 6; i++){
        dynamic.borders.push(extractFieldValues(await createCLResource(borders[i])));
    }
    dynamic.lyph              = setsToArrayOfIds(extractFieldValues(lyph));
    dynamic.lyph1             = extractFieldValues(await createCLResource(lyph1));
    dynamic.lyph2             = extractFieldValues(await createCLResource(lyph2));

    //HasLayer with ID
    await db.createRelationship(
        resources["Lyph"].relationships["-->HasLayer"],
        dynamic.lyph1.id, dynamic.lyph2.id, {id: 200, class: "HasLayer"});
    await db.assertRelationshipsExist(relationships["HasLayer"], [200]);

    //await testDBOperationsViaModelLibrary();
    console.log("Test utils successfully completed!");

});

async function testDirectDBOperations(){

    /* Add, update, replace, delete, get relationships (layers) */
    let fields = extractFieldValues(module["HasLayer"]
        .new({...{relativePosition: 1},
            1: resources["Lyph"].new({id: initial.mainLyph1.id}),
            2: resources["Lyph"].new({id: initial.lyph.id})}));

    await db.createRelationship(resources["Lyph"].relationships["-->HasLayer"],
        initial.mainLyph1.id, initial.lyph.id, fields);

    await db.updateRelationship(resources["Lyph"].relationships["-->HasLayer"],
       initial.mainLyph1.id, initial.lyph2.id, {relativePosition: 1});
    await db.assertRelationshipsExist(relationships["HasLayer"], [201]);

    await db.replaceRelationship(resources["Lyph"].relationships["-->HasLayer"],
        initial.mainLyph1.id, initial.lyph2.id, {id: 202, class: "HasLayer"});
    await db.assertRelationshipsExist(relationships["HasLayer"], [202]);

    let res = await db.getAllRelationships(relationships["HasLayer"]);
    res = [...res].map(val => extractFieldValues(val));

    /* Add, update, replace, delete, get resources (various, including abstract) */
    await db.replaceResource(resources["Lyph"], initial.mainLyph1.id, {"name": "Head"});
    let replacedLyph = await db.getSpecificResources(resources["Lyph"], [initial.mainLyph1.id]);
    console.log("Replaced lyph", replacedLyph);

    await db.replaceResource(resources["ExternalResource"], 300, dynamic.externalResource1);
    await db.getSpecificResources(resources["ExternalResource"], [300]);

    await db.createResource(resources["Lyph"], dynamic.lyph);
    await db.getSpecificResources(resources["Lyph"], [dynamic.lyph.id]);

    await db.deleteResource(resources["Lyph"], initial.mainLyph1.id);
    await db.deleteResource(resources["Border"], initial.border1.id);

    let lyphs = await db.getAllResources(resources["Lyph"]);
    console.log("All lyphs:", lyphs);

    let allRes = await db.getAllResources(resources["Resource"]);
    console.log("All resources:", allRes);

    let relatedResources = await db.getRelatedResources(resources["Lyph"].relationships['-->HasLayer'], initial.mainLyph1.id);
    console.log("Related resources",  relatedResources);

    let mainLyph = await db.getSpecificResources(resources["Lyph"], [initial.mainLyph1.id]);
    console.log("Main lyph", mainLyph);


}

async function testDBOperationsViaModelLibrary(){
    let newUID = 1000;

    /*Copy of the server function that replaces submitted JSON object fields with Model Library object fields*/
    async function getFields(cls, reqFields, id){
        let fields = {};
        for (let [fieldName, fieldSpec] of Object.entries(cls.relationshipShortcuts)){
            let val = reqFields[fieldName];
            if (val::isUndefined() || val::isNull()) { continue }
            if (fieldSpec.cardinality.max === 1){ val = [val] }
            if (val.length > 0){
                let objects = await db.getSpecificResources(fieldSpec.codomain.resourceClass, val);
                reqFields[fieldName] = objects.map(o => {
                    let props = {};
                    for (let key of Object.keys(resources[o.class].properties)){ props[key] = o[key]; }
                    return resources[o.class].new(props);
                });
                if (fieldSpec.cardinality.max === 1){ reqFields[fieldName] = reqFields[fieldName][0] }
            }
        }
        if (id::isNumber()){
            let res = cls.new(reqFields);
            fields = extractFieldValues(res);
            fields.id = id;
        } else {
            let res = cls.new(reqFields);
            //assign new ID only if it was not given by user
            if (!reqFields.id::isNumber()){
                res.set('id', ++newUID, { ignoreReadonly: true });
            }
            await res.commit();
            fields = extractFieldValues(res);
        }
        return fields;
    }

    /* Testing field replacement by model library */

    // let reqFields1 = {
    //     "thickness": { "min": 0, "class": "Range" },
    //     "length": { "min": 0, "class": "Range" },
    //     "cardinalityBase": {"value": 1, "class": "Value"},
    //     "id": dynamic.lyph3.id,
    //     "href": dynamic.lyph3.href,
    //     "class": "Lyph",
    //     "name": "Liver",
    //     "axis": 500,
    //     "longitudinalBorders": [ 501 ]
    // };
    //
    // let id1 = await db.createResource(resources["Lyph"], await getFields(resources["Lyph"], reqFields1));
    // let res1 = await db.getSpecificResources(resources["Lyph"], [id1]);
    // console.log(res2);

    let reqFields2 = {
        name:  "SLN 2st level branch",
        conveyingLyphType: initial.lyphType2.id,
        parentTree: initial.canonicalTree1_2.id,
        childTree: initial.canonicalTree1_3.id
    };

    let cls = resources["CanonicalTreeBranch"];

    let id2 = await db.createResource(cls, await getFields(cls, reqFields2));
    let res2 = await db.getSpecificResources(cls, [id2]);
    console.log("Created resource", res2);
}

/* clear database for every tear-down */
afterEach(() => {db.clear('Yes! Delete all everythings!');});


