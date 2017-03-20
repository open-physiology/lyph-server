////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import {expect} from 'chai';
import swaggerSpec from '../src/swagger.es6.js';
import {api, db} from './testUtils.es6.js';
import {OK, NO_CONTENT} from '../src/http-status-codes.es6.js'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// test                                                                                                              //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
describe("swagger.json", () => {
	it("is a JSON file available through the server", () => api
		.get('/swagger.json')
		.expect(OK)
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
        .expect(OK)
        .expect('Content-Type', /text\/html/));
});

describe("/clear", () => {
    it("DB is cleared", () => api.post('/clear')
        .expect(NO_CONTENT)
        .then(async () => {
                let [{count}] = await db.query(`MATCH (n) RETURN count(*) as count`);
                expect(count).to.be.equal(0);
            }
        )
    )
});


