////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import {template, isString, isFunction, isArray, isUndefined} from 'lodash';
import chai, {expect}                            from 'chai';

import supertest   from './custom-supertest.es6.js';
import getServer   from '../server.es6.js';
import {resources, relationships, model} from '../resources.es6.js';
import {NOT_FOUND} from "../http-status-codes.es6";


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
const createResource    = async (className, fields) => await getSingleResource(className, await db.createResource(resources[className], fields));

/* database operations that work with manifest resources (bypassing REST server) */
const createCLResource = async (resource) => {
    let fields = _(resource.fields).mapValues((val) => (val.value)).value();
    return await getSingleResource(resource.constructor.name, await db.createResource(resource.constructor, fields));
};

/* server request api (through our REST server) */
const requestResources      = async (path) => (await api.get(path)).body;
const requestSingleResource = async (path) => (await requestResources(path))[0];

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
        before(() => { cls = resources[className] });

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
                    if (!isString(desc)) { [desc, params, runParamTests] = ["valid", desc, params] }
                    describe(`(${desc} path parameters)`, () => {
                        beforeEach(() => { compiledPath = compilePath(isFunction(params) ? params() : params) });

                        /* run tests common to all endpoints with valid path params */
                        if (/^\/\w+\/{\w+}$/.test(givenPath)) {
                            GET("returns an array with at least one resource of the expected class", r=>r
                                .expect(200)
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
                    if (!isString(desc)) { [desc, params, runParamTests] = ["invalid", desc, params] }
                    describe(`(${desc} path parameters)`, () => {
                        /* set the compiled path before each test */
                        beforeEach(() => { compiledPath = compilePath(isFunction(params) ? params() : params) });

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
                        .expect(200)
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

/* initial database clearing */
before(() => db.clear('Yes! Delete all everythings!'));

/* before each test, reset the database */
beforeEach(async () => {

    /* external resources */
    initial.externalResource1 = await createResource('ExternalResource', {
        href:  "href 1",
        name:  "Third plantar metatarsal vein",
        class: "ExternalResource",
        uri :  "http://purl.obolibrary.org/obo/FMA_44539",
        type:  "fma"
    });

    /* borders */
    initial.border1 = await createResource('Border', {
        href:   "href 2",
        class:  "Border",
        nature: "open"
    });

    initial.border2 = await createResource('Border', {
        href:   "href 3",
        class:  "Border",
        nature: "closed"
    });

    initial.border1Radial = await createResource('Border', {
        href:   "href 2 radial",
        class:  "Border",
        nature: "open"
    });

    initial.border2Radial = await createResource('Border', {
        href:   "href 3 radial",
        class:  "Border",
        nature: "closed"
    });

    initial.borderAxis = await createResource('Border', {
        href:   "href axis",
        class:  "Border",
        nature: "open"
    });

    // /* materials */
    initial.material1 = await createResource('Material', {
        href:  "href 4",
        name:  "Blood",
        class: "Material"
    });

    initial.material2 = await createResource('Material', {
        href:  "href 5",
        name:  "Urine",
        class: "Material"
    });

    /* material types*/
    initial.materialType1 = await createResource('Type', {
        href:  "href mt1",
        name:  "Blood type",
        class: "Type",
        definition: initial.material1 //TODO: causes UnhandledPromiseRejectionWarning
    });

    /* measurables */
    initial.measurable1 = await createResource('Measurable', {
        href:  "href 6",
        name:  "Concentration of water",
        class: "Measurable"
    });

    initial.measurable2 = await createResource('Measurable', {
        href:  "href 7",
        name:  "Concentration of ion",
        class: "Measurable"
    });

    /* causalities */
    initial.causality1 = await createResource('Causality', {
        href:   "href 8",
        name:   "Functional dependency",
        cause:  initial.measurable1,
        effect: initial.measurable2
    });

    /* lyphs */
    initial.lyph1 = await createResource('Lyph', {
        href:  "href 9",
        name:  "Renal hilum",
        longitudinalBorders: [initial.border1.id, initial.border2.id]
    });

    initial.lyph2 = await createResource('Lyph', {
        href:  "href 10",
        name:  "Renal parenchyma",
        longitudinalBorders: [initial.border1.id, initial.border2.id]
    });

    initial.lyph3 = await createResource('Lyph', {
        href:  "href 11",
        name:  "Renal capsule",
        longitudinalBorders: [initial.border1.id, initial.border2.id]
    });

    initial.mainLyph1 = await createResource('Lyph', {
        href:  "href 12",
        name:  "Kidney",
        class: "Lyph",
        species: "Homo sapiens",
        materials: [initial.materialType1],
        layers: [initial.lyph1.id, initial.lyph2.id],
        externals: [initial.externalResource1],
        longitudinalBorders: [initial.border1.id, initial.border2.id],
        radialBorders: [initial.border1Radial, initial.border2Radial],
        axis: initial.borderAxis,
        thickness: {value: 1},
        length: {min: 1, max: 10},
        measurables: [initial.measurable1]
    });

    initial.mainLyph2 = await createResource('Lyph', {
        href:  "href 13",
        name:  "Stomach",
        class: "Lyph",
        //materials: [initial.materialType1],
        layers: [initial.lyph3.id, initial.lyph2.id],
        longitudinalBorders: [initial.border1.id, initial.border2.id],
        measurables: [initial.measurable2]
    });


    /* processes */
    initial.process1 = await createResource('Process', {
        href: "href 14",
        name: "Blood advective process",
        class: "Process",
        transportPhenomenon: "advection",  //TODO test with array
        sourceLyph: initial.lyph1,
        targetLyph: initial.lyph2,
        conveyingLyph: [initial.mainLyph1]
    });

    /* nodes */
    initial.node1 = await createResource('Node', {
        href:   "href 15",
        class:  "Node",
        measurables: [initial.measurable1],
        incomingProcesses:  [initial.process1],
        locations: [initial.mainLyph1] //TODO: causes UnhandledPromiseRejectionWarning
    });

    /* groups */
    initial.group1 = await createResource ('Group',{
        href:  "href 16",
        name:  "Mixed group",
        class: "Group",
        elements: [initial.lyph1, initial.node1, initial.process1] //TODO: causes UnhandledPromiseRejectionWarning
    });

    /* omega trees */
    initial.omegaTree1 = await createResource ('OmegaTree',{
        href: "href 17",
        name:  "Short Looped Nephrone",
        class: "OmegaTree",
        parts: [initial.lyph1, initial.lyph2, initial.lyph3] //TODO: causes UnhandledPromiseRejectionWarning
    });

    /* publications */
    initial.publication1 = await createResource ('Publication',{
        href:  "href 18",
        name:  "Multimodal MRI of the hippocampus in Parkinson's disease with visual hallucinations",
        class: "Publication"
    });

    /* clinical indices */
    initial.clinicalIndex1 = await createResource ('ClinicalIndex',{
        href:  "href 19",
        name:  "NP3FRZGT MDS - Unified Parkinson's Disease Rating Scale (3.11 Freezing of Gait)",
        class: "ClinicalIndex"
    });

    initial.clinicalIndex2 = await createResource ('ClinicalIndex',{
        href:  "href 20",
        name:  "NP1HALL MDS - Unified Parkinson's Disease Rating Scale (1.2 Hallucinations and Psychosis)",
        class: "ClinicalIndex",
        parent: initial.clinicalIndex1
    });

    /* correlations */
    initial.correlation1 = await createResource ('Correlation',{
        href:  "href 21",
        class: "Correlation",
        publication: initial.publication1,
        clinicalIndices: [initial.clinicalIndex1, initial.clinicalIndex2],
        measurables: [initial.measurable1, initial.measurable2]
    });

    /* coalescences */
    initial.coalescence1 = await createResource ('Coalescence',{
        href:  "href 22",
        class: "Coalescence",
        lyphs: [initial.lyph1, initial.lyph2]
    });

    /* coalescence scenarios */
    initial.coalescenceScenario1 = await createResource ('CoalescenceScenario',{
        href:  "href 23",
        class: "CoalescenceScenario",
        lyphs: [initial.mainLyph1, initial.mainLyph2]
    });

    /* refresh all resource objects */
    await Promise.all(Object.values(initial).map(refreshResource));

    ////////////////////////////////////////////////////////////////////////

    /*Create test resources via client library*/
    // let clLyph1 = model.Lyph.new({name: "Renal hilum"});
    // let clLyph2 = model.Lyph.new({name: "Renal parenchyma"});
    // let clLyph3 = model.Lyph.new({name: "Renal capsule"});
    // let cLyphsGroup = [clLyph1, clLyph2, clLyph3];
    // await Promise.all(cLyphsGroup.map(p => p.commit()));
    //
    // let clMainLyph1 = model.Lyph.new({name: "Kidney", layers: cLyphsGroup});
    // await clMainLyph1.commit();
    //
    // let clMaterial1 	= model.Material.new({name: "Blood"});
    // await clMaterial1.commit();
    // let clMaterialType1 = model.Type.new({name: "Blood", definition: clMaterial1});
    // await clMaterialType1.commit();

    /*Create DB nodes for test resources*/
    // initial.clLyph1    = await createCLResource(clLyph1);
    // initial.clLyph2    = await createCLResource(clLyph2);
    // initial.clLyph3    = await createCLResource(clLyph3);
    // initial.clMainLyph1     = await createCLResource(clMainLyph1);
    // initial.clMaterail1 	  = await createCLResource(clMaterial1);
    // initial.clMaterailType1 = await createCLResource(clMaterialType1);

    //TODO override refreshResource to work with new objects
    //await Promise.all(Object.values(initial).map(refreshResource));

});

/* clear database for every tear-down */
afterEach(() => { db.clear('Yes! Delete all everythings!'); });





