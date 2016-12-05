////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import {template, isString, isFunction, isArray, isUndefined} from 'lodash';
import {expect}                            from 'chai';
import swaggerSpec from '../swagger.es6.js';
import {testResources} from './testResources.es6.js';
import {testRelationships} from './testRelationships.es6.js';
import {api} from './testUtils.es6.js';

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

	it.skip("is an html page available through the server", () => api
		.get('/docs')
		.redirects(5)
		.expect(200)
		.expect('Content-Type', /text\/html/));

});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//testResources();

testRelationships();



