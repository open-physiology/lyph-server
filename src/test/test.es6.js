////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import _        from 'lodash';
import {expect} from 'chai';

import supertest                  from './custom-supertest.es6.js';
import getServer                  from '../server.es6.js';
import swaggerSpec                from '../swagger.es6.js';
import {resources, relationships} from '../resources.es6.js';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// setup                                                                                                              //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* before testing: start server, wait for it, get the supertest library rolling */
let api, db;
before(() => getServer(`${__dirname}/../`, {
	exposeDB: true,
	dbUser: 'neo4j',
	dbPass: 'neo4j',
	dbHost: 'localhost',
	dbPort: 7474,
	consoleLogging: false
}).then(({database, server}) => {
	db  = database;
	api = supertest(Promise)(server);
}));


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// utility                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* database operations (bypassing our REST server */
const getSingleResource = async (typeName, id)     => (await db.getSingleResource(resources[typeName], id))[0];
const refreshResource   = async (res)              => Object.assign(res, await getSingleResource(res.type, res.id));
const createResource    = async (typeName, fields) => await getSingleResource(typeName, await db.createResource(resources[typeName], fields));

/* server request api (through our REST server) */
const requestSingleResource = async (path) => (await api.get(path)).body[0];

/* dynamically created, specialized functions and variables used in describing our tests */
let GET, POST, PUT, DELETE;
let type;
let setInvalidPathParams, setValidPathParams, withInvalidPathParams, withValidPathParams;
let describeEndpoint;

/* DESCRIBE BLOCK: given resource type */
const describeResourceType = (typeName, runResourceTypeTests) => {
	describe(typeName, () => {

		/* set useful variables */
		before(() => { type = resources[typeName] });

		/* DESCRIBE BLOCK: given endpoint */
		describeEndpoint = (givenPath, supportedVerbs, runEndpointTests) => {
			describe(givenPath, () => {

				/* for setting the path parameters */
				let compiledPath = givenPath;
				let compilePath  = _.template(compiledPath, { interpolate: /{(\w+?)}/g });

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
					if (!_.isString(desc)) { [desc, params, runParamTests] = ["valid", desc, params] }
					describe(`(${desc} path parameters)`, () => {
						beforeEach(() => { compiledPath = compilePath(_.isFunction(params) ? params() : params) });

						/* run tests common to all endpoints with valid path params */
						if (/^\/\w+\/{\w+}$/.test(givenPath)) {
							GET("returns an array with at least one resource of the expected type", r=>r
								.expect(200)
								.expect(_.isArray)
								.resources((resources) => {
									expect(resources).to.have.length.of.at.least(1);
									for (let res of resources) {
										expect(res).to.have.property('type', type.name);
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
					if (!_.isString(desc)) { [desc, params, runParamTests] = ["invalid", desc, params] }
					describe(`(${desc} path parameters)`, () => {
						/* set the compiled path before each test */
						beforeEach(() => { compiledPath = compilePath(_.isFunction(params) ? params() : params) });

						/* run tests common to all endpoints with invalid path params  */
						if (/^\/\w+\/{\w+}$/.test(givenPath)) {
							for (let verb of supportedVerbs) {
								// TODO: to test this on POST and PUT, supply 'example' body from swagger
								if (verb !== 'POST' && verb !== 'PUT') {
									VERB[verb]("responds with a 404 error", r=>r.expect(404));
								}
							}
						}

						/* run given tests */
						if (runParamTests) { runParamTests() }
					});
				};

				/* run tests common to all endpoints */
				if (/^\/\w+$/.test(givenPath)) {
					GET("returns an array with resources of the expected type", r=>r
						.expect(200)
						.expect(_.isArray)
						.resources((resources) => {
							expect(resources).to.have.instanceOf(Array);
							for (let res of resources) {
								expect(res).to.have.property('type', type.name);
							}
						})
					);
				}

				/* run given tests */
				if (runEndpointTests) { runEndpointTests() }

			});
		};

		/* run given tests */
		if (runResourceTypeTests) { runResourceTypeTests() }

	});
};




function* bla() {


	let x = 5;

	let y = 1 + 2 + yield foo();

	x = 9;

	console.log(y);
	console.log(y);
	console.log(y);



}



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// before each test, reset the database                                                                               //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* variables to store all resources created at the beginning of each test */
let lyphTmp1,
	layerTmp1, layerTmp2, layerTmp3,
	initLayerTmp1, initLayerTmp2, initLayerTmp3,
	lyph1,
	layer1, layer2, layer3,
	layer1plus, layer1minus, layer1outer, layer1inner;

/* before each test, reset the database */
beforeEach(async () => {

	/* initial database clearing */
	await db.clear();

	/* lyph template */
	lyphTmp1 = await createResource('LyphTemplate', { name: "lyph template 1" });

	/* lyphs */
	lyph1 = await createResource('Lyph', { name: "lyph 1", species: "dragon", template: lyphTmp1.id });

	/* layer templates (in sequential order, so their positions are predictable) */
	layerTmp1 = await createResource('LayerTemplate', { lyphTemplate: lyphTmp1.id });
	layerTmp2 = await createResource('LayerTemplate', { lyphTemplate: lyphTmp1.id });
	layerTmp3 = await createResource('LayerTemplate', { lyphTemplate: lyphTmp1.id });

	/* layers */
	layer1 = await getSingleResource('Layer', layerTmp1.instantiations[0]);
	layer2 = await getSingleResource('Layer', layerTmp2.instantiations[0]);
	layer3 = await getSingleResource('Layer', layerTmp3.instantiations[0]);

	/* borders */
	layer1plus  = await getSingleResource('Border', layer1.plus);
	layer1minus = await getSingleResource('Border', layer1.minus);
	layer1outer = await getSingleResource('Border', layer1.outer);
	layer1inner = await getSingleResource('Border', layer1.inner);

	// TODO: add other stuff to the database (at least one instance of each resource type)
});


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// tests                                                                                                              //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describe("swagger.json", () => {

	it("is a JSON file available through the server", () => api
		.get('/swagger.json')
		.expect(200)
		.expect('Content-Type', /application\/json/)
		.expect(({body}) => { expect(body).to.deep.equal(swaggerSpec) }));

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

describeResourceType('LyphTemplate', () => {

	describeEndpoint('/lyphTemplates',      ['GET', 'POST']);

	describeEndpoint('/lyphTemplates/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

		withInvalidPathParams("non-existing", { id: 999999 });

		withInvalidPathParams("wrong-type", ()=>({ id: layerTmp1.id }));

		withValidPathParams(()=>({ id: lyphTmp1.id }), () => {

			GET("returns a resource with expected fields", r=>r.resource((res) => {
				expect(res).to.have.property('name'           ).that.equals("lyph template 1");
				expect(res).to.have.property('layers'         ).with.members([ layerTmp1.id, layerTmp2.id, layerTmp3.id ]);
				expect(res).to.have.property('instantiations' ).with.members([ lyph1.id ]);
				expect(res).to.have.property('materialIn'     ).that.is.instanceOf(Array); // TODO: make specific when appropriate
				expect(res).to.have.property('materialInLyphs').that.is.instanceOf(Array); // TODO: make specific when appropriate
				expect(res).to.have.property('materials'      ).that.is.instanceOf(Array); // TODO: make specific when appropriate
			}));

		});

	});

});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describeResourceType('LayerTemplate', () => {

	/* local utility function */
	async function requestLayerTemplatesAndLayers() {
		return await* [
			requestSingleResource(`/layerTemplates/${layerTmp1.id}`),
			requestSingleResource(`/layerTemplates/${layerTmp2.id}`),
			requestSingleResource(`/layerTemplates/${layerTmp3.id}`),
			requestSingleResource(`/layers/${layer1.id}`),
			requestSingleResource(`/layers/${layer2.id}`),
			requestSingleResource(`/layers/${layer3.id}`)
		];
	}

	describeEndpoint('/layerTemplates',      ['GET', 'POST']);

	describeEndpoint('/layerTemplates/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

		withInvalidPathParams("non-existing", { id: 999999 });

		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1.id }));

		withValidPathParams(()=>({ id: layerTmp1.id }), () => {

			GET("returns a resource with expected fields", r=>r.resource((res) => {
				expect(res).to.have.property('lyphTemplate'  ).that.equals(lyphTmp1.id);
				expect(res).to.have.property('position'      ).that.equals(1);
				expect(res).to.have.property('instantiations').that.has.members([ layer1.id ]);
				expect(res).to.have.property('materials'     ).that.is.instanceOf(Array); // TODO: make specific when appropriate
			}));

			POST("properly shifts layer positions around (1)", r=>r.send({
				position: 2 // move position 1 to position 2
			}).expect(200).then(async () => {
				let [
					n_layerTmp1, n_layerTmp2, n_layerTmp3,
					n_layer1,    n_layer2,    n_layer3
				] = await requestLayerTemplatesAndLayers();
				expect(n_layerTmp1).to.have.property('position').that.equals(2);
				expect(n_layerTmp2).to.have.property('position').that.equals(1);
				expect(n_layerTmp3).to.have.property('position').that.equals(3);
				expect(n_layer1)   .to.have.property('position').that.equals(2);
				expect(n_layer2)   .to.have.property('position').that.equals(1);
				expect(n_layer3)   .to.have.property('position').that.equals(3);
			}));

		});

		withValidPathParams(()=>({ id: layerTmp3.id }), () => {

			POST("properly shifts layer positions around (2)", r=>r.send({
				position: 1 // move position 3 to position 1
			}).expect(200).then(async () => {
				let [
					n_layerTmp1, n_layerTmp2, n_layerTmp3,
					n_layer1,    n_layer2,    n_layer3
				] = await requestLayerTemplatesAndLayers();
				expect(n_layerTmp1).to.have.property('position').that.equals(2);
				expect(n_layerTmp2).to.have.property('position').that.equals(3);
				expect(n_layerTmp3).to.have.property('position').that.equals(1);
				expect(n_layer1)   .to.have.property('position').that.equals(2);
				expect(n_layer2)   .to.have.property('position').that.equals(3);
				expect(n_layer3)   .to.have.property('position').that.equals(1);
			}));

		});

	});

});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describeResourceType('Lyph', () => {

	describeEndpoint('/lyphs',      ['GET', 'POST']);

	describeEndpoint('/lyphs/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

		withInvalidPathParams("non-existing", { id: 999999 });

		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1.id }));

		withValidPathParams(()=>({ id: lyph1.id }), () => {

			GET("returns a resource with expected fields", r=>r.resource((res) => {
				expect(res).to.have.property('name'           ).that.equals("lyph 1");
				expect(res).to.have.property('species'        ).that.equals("dragon");
				expect(res).to.have.property('template'       ).that.equals(lyphTmp1.id);
				expect(res).to.have.property('layers'         ).with.members([ layer1.id, layer2.id, layer3.id ]);
				expect(res).to.have.property('inLayers'       ).that.is.instanceOf(Array); // TODO: make specific when appropriate
				expect(res).to.have.property('inCompartments' ).that.is.instanceOf(Array); // TODO: make specific when appropriate
				expect(res).to.have.property('locatedMeasures').that.is.instanceOf(Array); // TODO: make specific when appropriate
			}));

		});

	});

});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describeResourceType('Layer', () => {

	describeEndpoint('/layers',      ['GET']);

	describeEndpoint('/layers/{id}', ['GET'], () => {

		withInvalidPathParams("non-existing", { id: 999999 });

		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1.id }));

		withValidPathParams(()=>({ id: layer1.id }), () => {

			GET("returns a resource with expected fields", r=>r.resource((res) => {
				expect(res).to.have.property('template'     ).that.equals(layerTmp1.id);
				expect(res).to.have.property('lyph'         ).that.equals(lyph1.id);
				expect(res).to.have.property('position'     ).that.is.within(1, 3);
				expect(res).to.have.property('coalescesWith').that.is.instanceOf(Array); // TODO: make specific when appropriate
				expect(res).to.have.property('childLyphs'   ).that.is.instanceOf(Array); // TODO: make specific when appropriate
			}));

		});

	});

});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describeResourceType('Compartments', () => {

	describeEndpoint('/compartments',      ['GET', 'POST']);

	describeEndpoint('/compartments/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

		withInvalidPathParams("non-existing", { id: 999999 });

		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1.id }));

		// TODO: uncomment and fill in when there is a compartment in the setup
		//withValidPathParams(()=>({ id: SOME_ID }), () => {
		//
		//	GET("returns a resource with expected fields", r=>r.resource((res) => {
		//		expect(res).to.have.property('lyphs').that.is.instanceOf(Array);
		//	}));
		//
		//});

	});

});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describeResourceType('Border', () => {

	describeEndpoint('/borders',      ['GET']);

	describeEndpoint('/borders/{id}', ['GET'], () => {

		withInvalidPathParams("non-existing", { id: 999999 });

		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1.id }));

		withValidPathParams(()=>({ id: layer1plus.id }), () => {

			GET("returns a resource with expected fields", r=>r.resource((res) => {
				expect(res).to.have.property('layer').that.equals(layer1.id);
				expect(res).to.have.property('nodes').that.is.instanceOf(Array); // TODO: make specific when appropriate
			}));

		});

	});

});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//describeResourceType('RESOURCE-TYPE', () => {
//
//	describeEndpoint('/PATH-1',      ['GET', 'POST']);
//
//	describeEndpoint('/PATH-1/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {
//
//		withInvalidPathParams("non-existing",    { id: 999999   });
//
//		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1.id }));
//
//		withValidPathParams(()=>({ id: SOME_ID }), () => {
//
//			GET("returns a resource with expected fields", r=>r.resource((res) => {
//
//			}));
//
//		});
//
//	});
//
//});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//describeResourceType('RESOURCE-TYPE', () => {
//
//	describeEndpoint('/PATH-1',      ['GET', 'POST']);
//
//	describeEndpoint('/PATH-1/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {
//
//		withInvalidPathParams("non-existing", { id: 999999 });
//
//		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1.id }));
//
//		withValidPathParams(()=>({ id: SOME_ID }), () => {
//
//			GET("returns a resource with expected fields", r=>r.resource((res) => {
//
//			}));
//
//		});
//
//	});
//
//});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//describeResourceType('RESOURCE-TYPE', () => {
//
//	describeEndpoint('/PATH-1',      ['GET', 'POST']);
//
//	describeEndpoint('/PATH-1/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {
//
//		withInvalidPathParams("non-existing", { id: 999999 });
//
//		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1.id }));
//
//		withValidPathParams(()=>({ id: SOME_ID }), () => {
//
//			GET("returns a resource with expected fields", r=>r.resource((res) => {
//
//			}));
//
//		});
//
//	});
//
//});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//describeResourceType('RESOURCE-TYPE', () => {
//
//	describeEndpoint('/PATH-1',      ['GET', 'POST']);
//
//	describeEndpoint('/PATH-1/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {
//
//		withInvalidPathParams("non-existing", { id: 999999 });
//
//		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1.id }));
//
//		withValidPathParams(()=>({ id: SOME_ID }), () => {
//
//			GET("returns a resource with expected fields", r=>r.resource((res) => {
//
//			}));
//
//		});
//
//	});
//
//});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//describeResourceType('RESOURCE-TYPE', () => {
//
//	describeEndpoint('/PATH-1',      ['GET', 'POST']);
//
//	describeEndpoint('/PATH-1/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {
//
//		withInvalidPathParams("non-existing", { id: 999999 });
//
//		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1.id }));
//
//		withValidPathParams(()=>({ id: SOME_ID }), () => {
//
//			GET("returns a resource with expected fields", r=>r.resource((res) => {
//
//			}));
//
//		});
//
//	});
//
//});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//describeResourceType('RESOURCE-TYPE', () => {
//
//	describeEndpoint('/PATH-1',      ['GET', 'POST']);
//
//	describeEndpoint('/PATH-1/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {
//
//		withInvalidPathParams("non-existing", { id: 999999 });
//
//		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1.id }));
//
//		withValidPathParams(()=>({ id: SOME_ID }), () => {
//
//			GET("returns a resource with expected fields", r=>r.resource((res) => {
//
//			}));
//
//		});
//
//	});
//
//});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//describeResourceType('RESOURCE-TYPE', () => {
//
//	describeEndpoint('/PATH-1',      ['GET', 'POST']);
//
//	describeEndpoint('/PATH-1/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {
//
//		withInvalidPathParams("non-existing", { id: 999999 });
//
//		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1.id }));
//
//		withValidPathParams(()=>({ id: SOME_ID }), () => {
//
//			GET("returns a resource with expected fields", r=>r.resource((res) => {
//
//			}));
//
//		});
//
//	});
//
//});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//describeResourceType('RESOURCE-TYPE', () => {
//
//	describeEndpoint('/PATH-1',      ['GET', 'POST']);
//
//	describeEndpoint('/PATH-1/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {
//
//		withInvalidPathParams("non-existing", { id: 999999 });
//
//		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1.id }));
//
//		withValidPathParams(()=>({ id: SOME_ID }), () => {
//
//			GET("returns a resource with expected fields", r=>r.resource((res) => {
//
//			}));
//
//		});
//
//	});
//
//});
