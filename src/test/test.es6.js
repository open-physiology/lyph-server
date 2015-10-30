////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import _ from 'lodash';

import supertest from './custom-supertest.es6.js';
import getServer from '../server.es6';


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
}).then(({ database, server }) => {
	db = database;
	api = supertest(Promise)(server);
}));


/* before each test, reset the database */
beforeEach(() => {
	db.clear();
	// TODO: put dummy data in there
});


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// utility                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let GET, POST, PUT, DELETE, request, setPathParams;
function describeEndpoint(path, descriptions) {

	/* setting the path parameters */
	let compiledPath = _.template(path, {interpolate: /{(\w+?)}/g});
	setPathParams = (params) => {
		path = compiledPath(params)
	};

	/* creating the verb testers */
	const verbTester = (verb) => (claim, expectations) => {
		it(`${verb.toUpperCase()} ${claim}`, () => {
			request = api[verb](path);
			return expectations();
		})
	};
	GET = verbTester('get');
	POST = verbTester('post');
	PUT = verbTester('put');
	DELETE = verbTester('delete');

	/* run the Mocha describe function */
	describe(path, descriptions);

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// tests                                                                                                              //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describeEndpoint("/lyphTemplates", () => {

	GET("returns an array", () => request
		.expect(200)
		.expect(_.isArray)
	);


});

describeEndpoint("/lyphTemplates/{id}", () => {

	setPathParams({ id: 17 });
	GET("returns an array", () => request
		.expect(200)
		.expect(_.isArray)
	);


});
