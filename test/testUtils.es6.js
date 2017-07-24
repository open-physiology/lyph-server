////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
'use strict';

import process from 'process';

import {template} from 'lodash';
import isString from 'lodash-bound/isString';
import isFunction from 'lodash-bound/isFunction';
import isArray from 'lodash-bound/isArray';

import chai, {expect} from 'chai';

import supertest   from './custom-supertest.es6.js';
import getServer   from '../src/server.es6.js';
import {OK, NOT_FOUND} from '../src/http-status-codes.es6.js';
import { createModelWithBackend } from '../src/model.es6.js';

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

// NOTE: The server is only generated once. Therefore, events from one test may bleed into another test.
//     : However, this is justified because of how slow it would run otherwise.

//escaping out of .tmp/mocha-webpack/dist
before(() => getServer(`${__dirname}/../../../dist/`, {
    exposeDB: true,
    dbDocker: 'neo4j',
    dbUser: 'neo4j',
    dbPass: 'mhmh13',
    dbHost: '0.0.0.0',
    dbPort: 7474,
    host: 'localhost',
    port: '8888',
    dbConsoleLogging: false,
    consoleLogging: false
}).then(({database, server}) => {
    db  = database;
    api = supertest(Promise)(server);
}));

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// utils                                                                                                              //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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
        beforeEach(() => { cls = model.entityClasses[className] });

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
// NOTE: The database is only initiated once. Therefore, events from one test may bleed into another test.
//     : However, this is justified because of how slow it would run otherwise.
before(async () => {
    db.clear('Yes! Delete all everythings!');
    model = createModelWithBackend(db);

    /* external resources */
    initial.externalResource1 = model.new({
        class: 'ExternalResource',
        name:  "Third plantar metatarsal vein",
        uri :  "http://purl.obolibrary.org/obo/FMA_44539",
        type:  "fma"
    });

    // initial.externalResource1.fields['name'].set("BLABLA");
    // initial.externalResource1.fields['type'].set("FMA");

    /* borders */
    for (let i = 1; i <= 10; i++){
        initial["border" + i] = model.new({ class: 'Border', nature: "open", name: "Initial border #" + i});
    }

    /* materials */
    initial.material1 = model.new({ class: 'Material', name: "Blood"});
    initial.material2 = model.new({ class: 'Material', name: "Urine"});

    /* measurables */
    initial.measurable1 =  model.new({ class: 'Measurable', name:  "Concentration of water"});
    initial.measurable2 =  model.new({ class: 'Measurable', name:  "Concentration of ion"});

    /* types */
    initial.materialType1 = model.new({ class: 'Type',
        name: "Blood", definition: initial.material1});
    initial.materialType2 = model.new({ class: 'Type',
        name: "Urine", definition: initial.material2});

    /* causalities */
    initial.causality1 = model.new({ class: 'Causality',
        name:   "Functional dependency",
        cause:  initial.measurable1,
        effect: initial.measurable2});


    /* lyphs */
    initial.lyph1 = model.new({ class: 'Lyph',name: "Renal hilum", longitudinalBorders: [initial.border5, initial.border6] });
    initial.lyph2 = model.new({ class: 'Lyph',name: "Renal parenchyma", longitudinalBorders: [initial.border7, initial.border8] });
    initial.lyph3 = model.new({ class: 'Lyph',name: "Renal capsule", longitudinalBorders: [initial.border9, initial.border10] });

    initial.mainLyph1 = model.new({ class: 'Lyph',
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

    initial.mainLyph2 = model.new({ class: 'Lyph',
        name:  "Stomach",
        layers: [initial.lyph3, initial.lyph2],
        measurables: [initial.measurable2],
        longitudinalBorders: [initial.border3, initial.border4]
    });

    initial.mainLyph3 = model.new({ class: 'Lyph',
        name:  "Liver",
        layers: [initial.lyph3, initial.lyph2],
        measurables: [initial.measurable2]
    });

    initial.mainLyph4 = model.new({ class: 'Lyph',
        name:  "Liver 2",
        layers: [initial.lyph3, initial.lyph2],
        measurables: [initial.measurable2]
    });

    initial.lyphType1 = model.new({ class: 'Type',
        name: "Renal hilum type",
        definition: initial.lyph1});

    initial.lyphType2 = model.new({ class: 'Type',
        name: "Renal parenchyma type",
        definition: initial.lyph2});

    initial.lyphType3 = model.new({ class: 'Type',
        name: "Renal capsule type",
        definition: initial.lyph3});

    /* processes */
    initial.process1 = model.new({ class: 'Process',
        name : "Blood advective process",
        transportPhenomenon: "advection",
        conveyingLyph: [initial.mainLyph1]});

    /* nodes */
    initial.node1 = model.new({ class: 'Node',
        measurables: [initial.measurable1],
        incomingProcesses:  [initial.process1],
        locations: [initial.mainLyph1]});

    /* groups */
    initial.group1 = model.new({ class: 'Group',
        name:  "Mixed group",
        elements: [initial.lyph1, initial.node1, initial.process1]
    });

    /* canonical trees */
    initial.canonicalTree1 = model.new({ class: 'CanonicalTree',
        name:  "SLN"});

    initial.canonicalTree1_2 = model.new({ class: 'CanonicalTree',
        name:  "SLN tail 1"});

    initial.canonicalTree1_3 = model.new({ class: 'CanonicalTree',
        name:  "SLN tail 2"});

    initial.canonicalTreeBranch1_2 = model.new({ class: 'CanonicalTreeBranch',
        name:  "SLN 1st level branch",
        conveyingLyphType: initial.lyphType1,
        parentTree: initial.canonicalTree1,
        childTree: initial.canonicalTree1_2
    });

    /* publications */
    initial.publication1 = model.new({ class: 'Publication',
        name:  "Multimodal MRI of the hippocampus in Parkinson's disease with visual hallucinations"
    });

    /* clinical indices */
    initial.clinicalIndex1 = model.new({ class: 'ClinicalIndex',
        name:  "NP3FRZGT MDS - Unified Parkinson's Disease Rating Scale (3.11 Freezing of Gait)",
    });

    initial.clinicalIndex2 = model.new({ class: 'ClinicalIndex',
        name:  "NP1HALL MDS - Unified Parkinson's Disease Rating Scale (1.2 Hallucinations and Psychosis)",
        parent: initial.clinicalIndex1});

    /* correlations */
    initial.correlation1 = model.new({ class: 'Correlation',
        publication: initial.publication1,
        clinicalIndices: [initial.clinicalIndex1, initial.clinicalIndex2],
        measurables: [initial.measurable1, initial.measurable2]
    });

    /* coalescences */
    initial.coalescence1 = model.new({ class: 'Coalescence',
        lyphs: [initial.lyph1, initial.lyph2]
    });

    /* coalescence scenarios */
    initial.coalescenceScenario1 = model.new({
        class: 'CoalescenceScenario',
        lyphs: [initial.mainLyph1, initial.mainLyph2]
    });

    dynamic.externalResource1 = model.new({ class: 'ExternalResource',
        name: "Right fourth dorsal metatarsal vein",
        uri: "http://purl.obolibrary.org/obo/FMA_44515",
        type: "fma"
    });

    for (let i = 1; i <= 6; i++){ dynamic["borders" + i] = model.new({ class: 'Border',nature: "open" })}

    dynamic.lyph1 = model.new({ class: 'Lyph',name:  "Aorta", longitudinalBorders: [dynamic.borders3, dynamic.borders4]});
    dynamic.lyph2 = model.new({ class: 'Lyph',name:  "Heart", longitudinalBorders: [dynamic.borders5, dynamic.borders6]});

    await model.commit();


    console.log();


    // process.exit(); // UNCOMMENT TO EXIT WHILE LEAVING THE DB POPULATED


});


/* clear database for every tear-down */
//after(() => {db.clear('Yes! Delete all everythings!');});


