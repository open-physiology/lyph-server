////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import {template, isString, isFunction, isArray} from 'lodash';
import chai, {expect}                            from 'chai';

import supertest   from './custom-supertest.es6.js';
import getServer   from '../server.es6.js';
import swaggerSpec from '../swagger.es6.js';
import {resources} from '../resources.es6.js';


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
	consoleLogging: false
}).then(({database, server}) => {
	db  = database;
	api = supertest(Promise)(server);
}));


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// utility                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* database operations (bypassing our REST server */
const getAllResources   = async (typeName)         => await db.getAllResources(resources[typeName]);
const getResources      = async (typeName, ids)    => {
		console.log("TypeName", typeName);
		console.log("Calling getSpecificResources for ", resources[typeName]);
		return await db.getSpecificResources(resources[typeName], ids)
	};
const getSingleResource = async (typeName, id)     => (await getResources(typeName, [id]))[0];

const refreshResource   = async (res)              => Object.assign(res, await getSingleResource(res.type, res.id));
const createResource    = async (typeName, fields) => await getSingleResource(typeName, await db.createResource(resources[typeName], fields));

/* server request api (through our REST server) */
const requestResources      = async (path) => (await api.get(path)).body;
const requestSingleResource = async (path) => (await requestResources(path))[0];

/* dynamically created, specialized functions and variables used in describing our tests */
let GET, POST, PUT, DELETE;
let type;
let setInvalidPathParams, setValidPathParams, withInvalidPathParams, withValidPathParams;
let describeEndpoint;

/* DESCRIBE BLOCK: given resource type */
const describeResourceType = (typeName, runResourceTypeTests) => {
	let only = (typeName[0] === '*');
	if (only) { typeName = typeName.slice(1) }
	(only ? describe.only : describe)(typeName, () => {

		/* set useful variables */
		before(() => { type = resources[typeName] });

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
							GET("returns an array with at least one resource of the expected type", r=>r
								.expect(200)
								.expect(isArray)
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
					if (!isString(desc)) { [desc, params, runParamTests] = ["invalid", desc, params] }
					describe(`(${desc} path parameters)`, () => {
						/* set the compiled path before each test */
						beforeEach(() => { compiledPath = compilePath(isFunction(params) ? params() : params) });

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
						.expect(isArray)
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
// before each test, reset the database                                                                               //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* variables to store all resources created at the beginning of each test */
let initial = {};

/* initial database clearing */
before(() => db.clear('Yes! Delete all everythings!'));

/* before each test, reset the database */
beforeEach(async () => {

	/* external resources */
	initial.vein = await createResource('ExternalResource', {
		name: "Third plantar metatarsal vein",
		href: "href 1",
		uri : "http://purl.obolibrary.org/obo/FMA_44539"
	    //type: "fma" - causes error?
		//locals: []
	});

	/* borders */
	initial.border1 = await createResource('Border', {
		href: "href b1",
		nature: "open"
	});

	initial.border2 = await createResource('Border', {
		href: "href b2",
		nature: "closed"
	});

	/* lyphs */
	initial.renalH = await createResource('Lyph', {
		name: "Renal hilum",
		href: "href 2",
		longitudinalBorders: [initial.border1, initial.border2]
	});

	initial.renalP = await createResource('Lyph', {
		name: "Renal parenchyma",
		href: "href 3",
		longitudinalBorders: [initial.border1, initial.border2]
	});

	initial.renalC = await createResource('Lyph', {
		name: "Renal capsule",
		href: "href 4",
		longitudinalBorders: [initial.border1, initial.border2]
	});

	initial.kidney = await createResource('Lyph', {
		name: "Kidney",
		href: "href 5",
		layers: [initial.renalH, initial.renalP, initial.renalC],
		externals: [initial.vein],
		longitudinalBorders: [initial.border1, initial.border2]
	});

	/* materials */
	initial.blood = await createResource('Material', {
		name: "Blood"
	});

	/* processes */

	/* measurables */

	/* causalities */

	/* nodes */

	/* groups */

	/* omega trees */
	initial.slp = await createResource ('OmegaTree',
		{name: "Short Looped Nephrone"
	});

	/* publication */

	/* correlation */

	/* clinical index */

	/* coalescence */

	/* coalescence scenario */

	/* type */

	/* refresh all resource objects */
	await Promise.all(Object.values(initial).map(refreshResource));

});

/* clear database for every tear-down */
afterEach(() => db.clear('Yes! Delete all everythings!'));

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

