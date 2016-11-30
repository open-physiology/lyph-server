////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import {template, isString, isFunction, isArray, isUndefined} from 'lodash';
import chai, {expect}                            from 'chai';

import supertest   from './custom-supertest.es6.js';
import getServer   from '../server.es6.js';
import swaggerSpec from '../swagger.es6.js';
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
let api, db;
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

/* database operations (bypassing our REST server */
const getAllResources   = async (className)         => await db.getAllResources(resources[className]);
const getResources      = async (className, ids)    => await db.getSpecificResources(resources[className], ids);
const getSingleResource = async (className, id)     => (await getResources(className, [id]))[0];
const refreshResource   = async (res)              => Object.assign(res, await getSingleResource(res.class, res.id));
const createResource    = async (className, fields) => await getSingleResource(className, await db.createResource(resources[className], fields));

/* database operations to work with manifest resources */
const createCLResource = async (resource) => await getSingleResource(resource.constructor.name, await db.createCLResource(resource));

/* server request api (through our REST server) */
const requestResources      = async (path) => (await api.get(path)).body;
const requestSingleResource = async (path) => (await requestResources(path))[0];

/* dynamically created, specialized functions and variables used in describing our tests */
let GET, POST, PUT, DELETE;
let cls;
let setInvalidPathParams, setValidPathParams, withInvalidPathParams, withValidPathParams;
let describeEndpoint;

/* DESCRIBE BLOCK: given resource class */
const describeResourceClass = (className, runResourceClassTests) => {
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
let initial = {};
let clInitial = {};

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
	// clInitial.clLyph1    = await createCLResource(clLyph1);
	// clInitial.clLyph2    = await createCLResource(clLyph2);
	// clInitial.clLyph3    = await createCLResource(clLyph3);
	// clInitial.clMainLyph1     = await createCLResource(clMainLyph1);
	// clInitial.clMaterail1 	  = await createCLResource(clMaterial1);
	// clInitial.clMaterailType1 = await createCLResource(clMaterialType1);

	//TODO override refreshResource to work with new objects
	//await Promise.all(Object.values(clInitial).map(refreshResource));

});

/* clear database for every tear-down */
afterEach(() => { db.clear('Yes! Delete all everythings!'); });

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// tests                                                                                                              //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
describe("swagger.json", () => {


	it("is a JSON file available through the server", () => api
		.get('/swagger.json')
		.expect(200)
		.expect('Content-Type', /application\/json/)
    );

    //TODO: deep matching fails: isRefinement, max = Infinity
    it.skip("is consistent with expected ", () => api
        .get('/swagger.json')
        .expect(({body}) => { expect(body).to.deep.equal(swaggerSpec) })
    );

});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describe("docs", () => {

	it("is an html page available through the server", () => api
		.get('/docs')
		.redirects(5)
		.expect(200)
		.expect('Content-Type', /text\/html/));

});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// //TODO: test '/resources'
//
describeResourceClass('ExternalResource', () => {
	 describeEndpoint('/externalResources',      ['GET', 'POST']);

	 describeEndpoint('/externalResources/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

		 withInvalidPathParams("non-existing", { id: 999999 });

		 withInvalidPathParams("wrong-class", ()=>({ id: initial.border1.id }));

		 withValidPathParams(()=>({ id: initial.externalResource1.id }), () => {

			 GET("returns a resource with expected fields", r=>r.resource((res) => {
				 expect(res).to.have.property('id');    //{ ...idSchema,         readonly: true },
				 expect(res).to.have.property('href');  //{ ...uriSchema,        readonly: true },
				 expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
				 expect(res).to.have.property('name');  //{ type: 'string' }
				 expect(res).to.have.property('uri');   //{ ...uriSchema, required: true },
				 expect(res).to.have.property('type').that.equals("fma");  //{ type: 'string'}

			 }));
             //TODO add tests
             //POST
             //PUT
             //DELETE
		 });
	 });

	///resources/{resourceID}/externals/{externalResourceID}

	 describeEndpoint('/externalResources/{externalResourceID}/locals', ['GET', 'POST'], () => {
		withValidPathParams(()=>({ externalResourceID: initial.externalResource1.id }), () => {
				GET("returns locals", r=>{});
                //TODO what is r?
        });
	});
});

//
// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
describeResourceClass('Border', () => {

	describeEndpoint('/borders',      ['GET', 'POST']);

	describeEndpoint('/borders/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

		withInvalidPathParams("non-existing", { id: 999999 });

		withInvalidPathParams("wrong-class", ()=>({ id: initial.externalResource1.id }));

		withValidPathParams(()=>({ id: initial.border1.id }), () => {

			GET("returns a resource with expected fields", r=>r.resource((res) => {
				expect(res).to.have.property('id');     //{ ...idSchema,         readonly: true },
				expect(res).to.have.property('href');   //{ ...uriSchema,        readonly: true },
				expect(res).to.have.property('class');  //{ ...identifierSchema, readonly: true },
				expect(res).to.have.property('nature'); //{ ...},
			}));
		});
	});
});

//
// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
describeResourceClass('Material', () => {

	describeEndpoint('/materials',      ['GET', 'POST']);

	describeEndpoint('/materials/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

		withInvalidPathParams("non-existing", { id: 999999 });

		withInvalidPathParams("wrong-class", ()=>({ id: initial.externalResource1.id }));

		withValidPathParams(()=>({ id: initial.material1.id }), () => {

			GET("returns a resource with expected fields", r=>r.resource((res) => {
				expect(res).to.have.property('id');    //{ ...idSchema,         readonly: true },
				expect(res).to.have.property('href');  //{ ...uriSchema,        readonly: true },
				expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
				expect(res).to.have.property('name');  //{ type: 'string' }
			}));
		});
	});
});

//
// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//

describeResourceClass('Measurable', () => {

	describeEndpoint('/measurables',      ['GET', 'POST']);

	describeEndpoint('/measurables/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

		withInvalidPathParams("non-existing", { id: 999999 });

		withInvalidPathParams("wrong-class", ()=>({ id: initial.externalResource1.id }));

		withValidPathParams(()=>({ id: initial.measurable1.id }), () => {

			GET("returns a resource with expected fields", r=>r.resource((res) => {
				expect(res).to.have.property('id'       ); //{ ...idSchema,         readonly: true },
				expect(res).to.have.property('href'     ); //{ ...uriSchema,        readonly: true },
				expect(res).to.have.property('class'    ); //{ ...identifierSchema, readonly: true },
				expect(res).to.have.property('name'     ); //{ type: 'string' }
				//expect(res).to.have.property('materials').with.members([ initial.materialType1.id]);
			}));
		});
	});
});

//
// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//

describeResourceClass('Causality', () => {

    describeEndpoint('/causalities',      ['GET', 'POST']);

    describeEndpoint('/causalities/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

        withInvalidPathParams("non-existing", { id: 999999 });

        withInvalidPathParams("wrong-class", ()=>({ id: initial.externalResource1.id }));

        withValidPathParams(()=>({ id: initial.causality1.id }), () => {

            GET("returns a resource with expected fields", r=>r.resource((res) => {
                expect(res).to.have.property('id'       ); //{ ...idSchema,         readonly: true },
                expect(res).to.have.property('href'     ); //{ ...uriSchema,        readonly: true },
                expect(res).to.have.property('class'    ); //{ ...identifierSchema, readonly: true },
                expect(res).to.have.property('cause').that.equals(initial.measurable1.id);
                expect(res).to.have.property('effect').that.equals(initial.measurable2.id);
            }));
        });
    });
});

//
// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//

describeResourceClass('Lyph', () => {

	describeEndpoint('/lyphs',      ['GET', 'POST']);

	describeEndpoint('/lyphs/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

		withInvalidPathParams("non-existing", { id: 999999 });

		withInvalidPathParams("wrong-class", ()=>({ id: initial.externalResource1.id }));

		withValidPathParams(()=>({ id: initial.mainLyph1.id }), () => {

			GET("returns a resource with expected fields", r=>r.resource((res) => {
				expect(res).to.have.property('id'				  ); //{ ...idSchema,         readonly: true },
				expect(res).to.have.property('href'				  ); //{ ...uriSchema,        readonly: true },
				expect(res).to.have.property('class'			  ); //{ ...identifierSchema, readonly: true },
				expect(res).to.have.property('name'               );
                expect(res).to.have.property('species'            );
				expect(res).to.have.property('layers'             ).with.members([ initial.lyph1.id, initial.lyph2.id]);
				expect(res).to.have.property('externals'          ).with.members([ initial.externalResource1.id]);
				expect(res).to.have.property('longitudinalBorders').with.members([ initial.border1.id, initial.border2.id]);
                expect(res).to.have.property('radialBorders'      ).with.members([ initial.border1Radial.id, initial.border2Radial.id]);
                expect(res).to.have.property('axis'               ).that.equals(initial.borderAxis.id);
                expect(res).to.have.property('thickness'          ).that.deep.equals({value: 1});
                expect(res).to.have.property('length'             ).that.deep.equals({min: 1, max: 10});
                //segments
                //parts
                //patches
                //coalecences
                //in/out/- processes
                //nodes
                //expect(res).to.have.property('materials'          ).with.members([ initial.materialType1.id]);
				expect(res).to.have.property('measurables'        ).with.members([ initial.measurable1.id]);
			}));
		});
	});
});

//
// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//

describeResourceClass('Process', () => {

    describeEndpoint('/processes',      ['GET', 'POST']);

    describeEndpoint('/processes/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

        withInvalidPathParams("non-existing", { id: 999999 });

        withInvalidPathParams("wrong-class", ()=>({ id: initial.externalResource1.id }));

        withValidPathParams(()=>({ id: initial.process1.id }), () => {

            GET("returns a resource with expected fields", r=>r.resource((res) => {
                expect(res).to.have.property('id'       ); //{ ...idSchema,         readonly: true },
                expect(res).to.have.property('href'     ); //{ ...uriSchema,        readonly: true },
                expect(res).to.have.property('class'    ); //{ ...identifierSchema, readonly: true },
                expect(res).to.have.property('transportPhenomenon').that.equals("advection"),
                expect(res).to.have.property('sourceLyph'   ).that.equals(initial.lyph1.id);
                expect(res).to.have.property('targetLyph'   ).that.equals(initial.lyph2.id);
                expect(res).to.have.property('conveyingLyph').with.members([ initial.mainLyph1.id]);
            }));
        });
    });
});

//
// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//

describeResourceClass('Group', () => {

	describeEndpoint('/groups',      ['GET', 'POST']);

	describeEndpoint('/groups/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

		withInvalidPathParams("non-existing", { id: 999999 });

		withInvalidPathParams("wrong-class", ()=>({ id: initial.externalResource1.id }));

		withValidPathParams(()=>({ id: initial.group1.id }), () => {

			GET("returns a resource with expected fields", r=>r.resource((res) => {
				expect(res).to.have.property('id');    //{ ...idSchema,         readonly: true },
				expect(res).to.have.property('href');  //{ ...uriSchema,        readonly: true },
				expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
				expect(res).to.have.property('name');  //{ type: 'string' }
				//expect(res).to.have.property('elements').with.members([ initial.lyph1.id, initial.node1.id, initial.process1.id ]);
			}));
		});
	});
});


//
// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//

describeResourceClass('OmegaTree', () => {

	describeEndpoint('/omegaTrees',      ['GET', 'POST']);

	describeEndpoint('/omegaTrees/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

		withInvalidPathParams("non-existing", { id: 999999 });

		withInvalidPathParams("wrong-class", ()=>({ id: initial.externalResource1.id }));

		withValidPathParams(()=>({ id: initial.omegaTree1.id }), () => {

			GET("returns a resource with expected fields", r=>r.resource((res) => {
				expect(res).to.have.property('id');    //{ ...idSchema,         readonly: true },
				expect(res).to.have.property('href');  //{ ...uriSchema,        readonly: true },
				expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
				expect(res).to.have.property('name');  //{ type: 'string' }
				//expect(res).to.have.property('parts').with.members([ initial.lyph1.id, initial.lyph2.id, initial.lyph3.id ]);
			}));
		});
	});
});

//
// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//

describeResourceClass('Publication', () => {

    describeEndpoint('/publications',      ['GET', 'POST']);

    describeEndpoint('/publications/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

        withInvalidPathParams("non-existing", { id: 999999 });

        withInvalidPathParams("wrong-class", ()=>({ id: initial.externalResource1.id }));

        withValidPathParams(()=>({ id: initial.publication1.id }), () => {

            GET("returns a resource with expected fields", r=>r.resource((res) => {
                expect(res).to.have.property('id');    //{ ...idSchema,         readonly: true },
                expect(res).to.have.property('href');  //{ ...uriSchema,        readonly: true },
                expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
                expect(res).to.have.property('name');  //{ type: 'string' }
            }));
        });
    });
});

//
// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//

describeResourceClass('ClinicalIndex', () => {

    describeEndpoint('/clinicalIndices',      ['GET', 'POST']);

    describeEndpoint('/clinicalIndices/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

        withInvalidPathParams("non-existing", { id: 999999 });

        withInvalidPathParams("wrong-class", ()=>({ id: initial.externalResource1.id }));

        withValidPathParams(()=>({ id: initial.clinicalIndex2.id }), () => {

            GET("returns a resource with expected fields", r=>r.resource((res) => {
                expect(res).to.have.property('id');    //{ ...idSchema,         readonly: true },
                expect(res).to.have.property('href');  //{ ...uriSchema,        readonly: true },
                expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
                expect(res).to.have.property('name');  //{ type: 'string' }
                expect(res).to.have.property('parent').that.equals(initial.clinicalIndex1.id);
            }));
        });
    });
});

//
// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//

describeResourceClass('Correlation', () => {

    describeEndpoint('/correlations',      ['GET', 'POST']);

    describeEndpoint('/correlations/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

        withInvalidPathParams("non-existing", { id: 999999 });

        withInvalidPathParams("wrong-class", ()=>({ id: initial.externalResource1.id }));

        withValidPathParams(()=>({ id: initial.correlation1.id }), () => {

            GET("returns a resource with expected fields", r=>r.resource((res) => {
                expect(res).to.have.property('id');    //{ ...idSchema,         readonly: true },
                expect(res).to.have.property('href');  //{ ...uriSchema,        readonly: true },
                expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
                expect(res).to.have.property('publication'    ).that.equals(initial.publication1.id);
                expect(res).to.have.property('clinicalIndices').with.members([initial.clinicalIndex1.id, initial.clinicalIndex2.id]);
                expect(res).to.have.property('measurables'    ).with.members([initial.measurable1.id, initial.measurable2.id]);
            }));
        });
    });
});

//
// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//

describeResourceClass('Coalescence', () => {

    describeEndpoint('/coalescences',      ['GET', 'POST']);

    describeEndpoint('/coalescences/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

        withInvalidPathParams("non-existing", { id: 999999 });

        withInvalidPathParams("wrong-class", ()=>({ id: initial.externalResource1.id }));

        withValidPathParams(()=>({ id: initial.coalescence1.id }), () => {

            GET("returns a resource with expected fields", r=>r.resource((res) => {
                expect(res).to.have.property('id');    //{ ...idSchema,         readonly: true },
                expect(res).to.have.property('href');  //{ ...uriSchema,        readonly: true },
                expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
                expect(res).to.have.property('lyphs').with.members([initial.lyph1.id, initial.lyph2.id]);
            }));
        });
    });
});

//
// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//

describeResourceClass('CoalescenceScenario', () => {

    describeEndpoint('/coalescenceScenarios',      ['GET', 'POST']);

    describeEndpoint('/coalescenceScenarios/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

        withInvalidPathParams("non-existing", { id: 999999 });

        withInvalidPathParams("wrong-class", ()=>({ id: initial.externalResource1.id }));

        withValidPathParams(()=>({ id: initial.coalescenceScenario1.id }), () => {

            GET("returns a resource with expected fields", r=>r.resource((res) => {
                expect(res).to.have.property('id');    //{ ...idSchema,         readonly: true },
                expect(res).to.have.property('href');  //{ ...uriSchema,        readonly: true },
                expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
                expect(res).to.have.property('lyphs').with.members([initial.mainLyph1.id, initial.mainLyph2.id]);
            }));
        });
    });
});

//
// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//

describeResourceClass('Type', () => {

	describeEndpoint('/types',      ['GET', 'POST']);

	describeEndpoint('/types/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

		withInvalidPathParams("non-existing", { id: 999999 });

		withInvalidPathParams("wrong-class", ()=>({ id: initial.externalResource1.id }));

		withValidPathParams(()=>({ id: initial.materialType1.id }), () => {

			GET("returns a resource with expected fields", r=>r.resource((res) => {
				expect(res).to.have.property('id');    //{ ...idSchema,         readonly: true },
				expect(res).to.have.property('href');  //{ ...uriSchema,        readonly: true },
				expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
				expect(res).to.have.property('name');  //{ type: 'string' }
				expect(res).to.have.property('definition').that.equals(initial.material1.id);
			}));

		});
	});
});


/////////////////////////////////////////////////////////////////////
//Test resources created by client library
/////////////////////////////////////////////////////////////////////

// describeResourceType('Lyph', () => {
//
// 	describeEndpoint('/lyphs',      ['GET', 'POST']);
//
// 	describeEndpoint('/lyphs/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {
//
// 		withInvalidPathParams("non-existing", { id: 999999 });
//
// 		withInvalidPathParams("wrong-class", ()=>({ id: initial.externalResource1.id }));
//
// 		withValidPathParams(()=>({ id: initial.kidney.id }), () => {
//
// 			GET("returns a resource with expected fields", r=>r.resource((res) => {
// 				expect(res).to.have.property('id'				  ); //{ ...idSchema,         readonly: true },
// 				expect(res).to.have.property('href'				  ); //{ ...uriSchema,        readonly: true },
// 				expect(res).to.have.property('class'			  ); //{ ...identifierSchema, readonly: true },
// 				expect(res).to.have.property('name'               );
// 				expect(res).to.have.property('layers'             ).with.members([ initial.renalH.id, initial.renalP.id,initial.renalC.id]);
// 				expect(res).to.have.property('longitudinalBorders');
// 				expect(res).to.have.property('radialBorders'      );
// 			}));
// 		});
// 	});
// });



