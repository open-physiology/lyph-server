////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import co from 'co';
import _  from 'lodash';
import chai from 'chai';
const {expect} = chai;

import supertest                  from './custom-supertest.es6.js';
import getServer                  from '../server.es6.js';
import swaggerSpec                from '../swagger.es6.js';
import {resources, relationships} from '../resources.es6.js';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// setup                                                                                                              //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* before all tests: start server, wait for it, get the supertest library rolling */
let api, db;
before(() => getServer(`${__dirname}/../`, {
	exposeDB: true,
	dbUser: 'neo4j',
	dbPass: 'neo4j',
	dbHost: 'localhost',
	dbPort: 7474,
	consoleLogging: false
}).then(({database, server}) => {
	db = database;
	api = supertest(Promise)(server);
}));


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// utility                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* database operations */
const createResource = (typeName, fields) => db.createResource(resources[typeName], fields);
const getSingleResource = (typeName, id) => db.getSingleResource(resources[typeName], id);

/* co-wrapped mocha test-functions */
const coBefore = (generator) => { before(co.wrap(generator)) };
const coAfter = (generator) => { after(co.wrap(generator)) };
const coBeforeEach = (generator) => { beforeEach(co.wrap(generator)) };
const coAfterEach = (generator) => { afterEach(co.wrap(generator)) };
const coIt = (claim, generator) => { it(claim, co.wrap(generator)) };

/* specialized describe-functions */
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
				let compilePath = _.template(compiledPath, { interpolate: /{(\w+?)}/g });

				/* the verb testers */
				const verbTester = (verb) => (claim, expectations) => {
					it(`${verb.toUpperCase()} ${claim}`, () =>
							co.wrap(expectations)(api[verb](compiledPath)));
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
						/* set the compiled path */
						compiledPath = compilePath(_.isFunction(params) ? params() : params);
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



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// one-time setup                                                                                                     //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* before each test, reset the database to a set of dummy data */
let lyphTmp1,
	layerTmp1, layerTmp2, layerTmp3,
	lyph1,
	layer1, layer2, layer3,
	layer1plus, layer1minus, layer1outer, layer1inner;
coBeforeEach(function* () {

	/* initial database clearing */
	yield db.clear();

	/* lyph template */
	lyphTmp1 = yield createResource('LyphTemplate', { name: "lyph template 1" });

	/* layer templates */
	[   layerTmp1,
		layerTmp2,
		layerTmp3
	] = yield _.times(3, () => createResource('LayerTemplate', { lyphTemplate: lyphTmp1 }));

	/* lyphs */
	lyph1 = yield createResource('Lyph', { name: "lyph 1", species: "dragon", template: lyphTmp1 });

	/* layers */
	[   [{instantiations:[layer1]}],
		[{instantiations:[layer2]}],
		[{instantiations:[layer3]}]
	] = yield [layerTmp1, layerTmp2, layerTmp3].map((id) => getSingleResource('LayerTemplate', id));

	/* borders */
	[{
		plus:  layer1plus ,
		minus: layer1minus,
		outer: layer1outer,
		inner: layer1inner
	}] = yield getSingleResource('Layer', layer1);

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
		.get('/docs').redirects(5)
		.expect(200)
		.expect('Content-Type', /text\/html/));

});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describeResourceType('LyphTemplate', () => {

	describeEndpoint('/lyphTemplates',      ['GET', 'POST']);

	describeEndpoint('/lyphTemplates/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

		withInvalidPathParams("non-existing",    { id: 999999    });

		withInvalidPathParams("wrong-type", ()=>({ id: layerTmp1 }));

		withValidPathParams(()=>({ id: lyphTmp1 }), () => {

			GET("returns a resource with expected fields", r=>r.resource((res) => {
				expect(res).to.have.property('name'           ).that.equals("lyph template 1");
				expect(res).to.have.property('layers'         ).that.has.members([layerTmp1, layerTmp2, layerTmp3]);
				expect(res).to.have.property('instantiations' ).that.has.members([lyph1]);
				expect(res).to.have.property('materialIn'     ).that.is.instanceOf(Array); // TODO: make specific when appropriate
				expect(res).to.have.property('materialInLyphs').that.is.instanceOf(Array); // TODO: make specific when appropriate
				expect(res).to.have.property('materials'      ).that.is.instanceOf(Array); // TODO: make specific when appropriate
			}));

		});

	});

});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describeResourceType('LayerTemplate', () => {

	describeEndpoint('/layerTemplates',      ['GET', 'POST']);

	describeEndpoint('/layerTemplates/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

		withInvalidPathParams("non-existing",    { id: 999999   });

		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1 }));

		withValidPathParams(()=>({ id: layerTmp1 }), () => {

			GET("returns a resource with expected fields", r=>r.resource((res) => {
				expect(res).to.have.property('lyphTemplate'  ).that.equals(lyphTmp1);
				expect(res).to.have.property('position'      ).that.is.within(1, 3);
				expect(res).to.have.property('instantiations').that.has.members([layer1]);
				expect(res).to.have.property('materials'     ).that.is.instanceOf(Array); // TODO: make specific when appropriate
			}));

		});

	});

});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describeResourceType('Lyph', () => {

	describeEndpoint('/lyphs',      ['GET', 'POST']);

	describeEndpoint('/lyphs/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

		withInvalidPathParams("non-existing",    { id: 999999   });

		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1 }));

		withValidPathParams(()=>({ id: lyph1 }), () => {

			GET("returns a resource with expected fields", r=>r.resource((res) => {
				expect(res).to.have.property('name'           ).that.equals("lyph 1");
				expect(res).to.have.property('species'        ).that.equals("dragon");
				expect(res).to.have.property('template'       ).that.equals(lyphTmp1);
				expect(res).to.have.property('layers'         ).that.has.members([layer1, layer2, layer3]);
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

		withInvalidPathParams("non-existing",    { id: 999999   });

		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1 }));

		withValidPathParams(()=>({ id: layer1 }), () => {

			GET("returns a resource with expected fields", r=>r.resource((res) => {
				expect(res).to.have.property('template'     ).that.equals(layerTmp1);
				expect(res).to.have.property('lyph'         ).that.equals(lyph1);
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

		withInvalidPathParams("non-existing",    { id: 999999   });

		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1 }));

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

		withInvalidPathParams("non-existing",    { id: 999999   });

		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1 }));

		withValidPathParams(()=>({ id: layer1plus }), () => {

			GET("returns a resource with expected fields", r=>r.resource((res) => {
				expect(res).to.have.property('layer').that.equals(layer1);
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
//		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1 }));
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
//		withInvalidPathParams("non-existing",    { id: 999999   });
//
//		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1 }));
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
//		withInvalidPathParams("non-existing",    { id: 999999   });
//
//		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1 }));
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
//		withInvalidPathParams("non-existing",    { id: 999999   });
//
//		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1 }));
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
//		withInvalidPathParams("non-existing",    { id: 999999   });
//
//		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1 }));
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
//		withInvalidPathParams("non-existing",    { id: 999999   });
//
//		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1 }));
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
//		withInvalidPathParams("non-existing",    { id: 999999   });
//
//		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1 }));
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
//		withInvalidPathParams("non-existing",    { id: 999999   });
//
//		withInvalidPathParams("wrong-type", ()=>({ id: lyphTmp1 }));
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
