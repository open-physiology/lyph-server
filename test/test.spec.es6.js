////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import {expect}                            from 'chai';
import swaggerSpec from '../src/swagger.es6.js';
import {runSelectedResourceTest, testResourcesGeneral, testResources, testAbstractResources} from './testResources.es6.js';
import {runSelectedRelationshipTest, testRelationshipsGeneral, testRelationships} from './testRelationships.es6.js';
import {api} from './testUtils.es6.js';
import {OK} from '../src/http-status-codes.es6.js'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// tests                                                                                                              //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// describe("swagger.json", () => {
// 	it("is a JSON file available through the server", () => api
// 		.get('/swagger.json')
// 		.expect(OK)
// 		.expect('Content-Type', /application\/json/)
//     );

//     //TODO: deep matching fails: isRefinement, max = Infinity
//     it.skip("is consistent with expected ", () => api
//         .get('/swagger.json')
//         .expect(({body}) => { expect(body).to.deep.equal(swaggerSpec) })
//     );

//});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describe("docs", () => {

    it("is an html page available through the server", () => api
        .get('/docs')
        .redirects(5)
        .expect(OK)
        .expect('Content-Type', /text\/html/));

});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


//runSelectedRelationshipTest();

runSelectedResourceTest();

//testResources();

//testAbstractResources();

//testRelationships();

//testResourcesGeneral();

//testRelationshipsGeneral();



