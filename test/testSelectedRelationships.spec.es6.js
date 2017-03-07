/**
 * Created by Natallia on 12/4/2016.
 */
////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import {template, isString, isFunction, isArray, isUndefined} from 'lodash';
import {expect} from 'chai';
import {initial, describeResourceClass, describeEndpoint,
    GET, POST, PUT, DELETE,
    withInvalidPathParams, withValidPathParams, requestResources, db} from './testUtils.es6.js';
import {OK, NO_CONTENT} from "../src/http-status-codes.es6";
import {resources, relationships} from '../src/utility.es6.js';


    //Integrated test for HasLayer enpoints
    describeResourceClass('HasLayer', () => {

        //Relationships
        describeEndpoint(`/HasLayer`, ['GET', 'POST'], () => {
            withValidPathParams(()=>{}, () => {

                GET("returns HasLayer relationships", r=>r.expect(OK).expect(isArray)
                    .resources((resources) => {
                        for (let res of resources) {
                            //Currently relationships craeted by model library dont have id and href filled
                            //expect(res).to.have.property('id');
                            //expect(res).to.have.property('href');
                            expect(res).to.have.property('class').that.equals("HasLayer");
                            expect(res).to.have.property('1');
                            expect(res).to.have.property('2');
                            expect(res[1]).to.have.property('class').that.equals("Lyph");
                            expect(res[2]).to.have.property('class').that.equals("Lyph");
                        }
                    }));
            })
        });

        //Specific relationships
        describeEndpoint('/HasLayer/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: [...initial.mainLyph1["-->HasLayer"]][0].id}), () => {

                GET("returns a relationship with expected fields", r=>r.expect(OK)
                    .expect(isArray)
                    .resources((resources) => {
                        expect(resources).to.have.length.of.at.least(1);
                        for (let res of resources) {
                            expect(res).to.have.property('href');
                            expect(res).to.have.property('class').that.equals("HasLayer");
                        }
                }));

                POST("update a given relationship", r=>r.send({
                    "relativePosition": 2
                }).expect(OK).expect(isArray)
                    .resources((resources) => {
                        expect(resources).to.have.length.of.at.least(1);
                        for (let res of resources) {
                            expect(res).to.have.property('relativePosition').that.equals(2);
                        }
                    }));

                PUT("replace a given relationship", r=>r.send({
                    relativePosition: 1
                }).expect(OK).expect(isArray)
                    .resources((resources) => {
                        expect(resources).to.have.length.of.at.least(1);
                        for (let res of resources) {
                            expect(res).to.have.property('relativePosition').that.equals(1);
                        }
                    }));

                DELETE("delete a given relationship", r=>r.expect(NO_CONTENT).then(async() => {
                    let res = await requestResources(`/HasLayer`);
                    expect(res).to.be.instanceof(Array);
                    expect(res.map(x => x.id)).to.not.include(initial.mainLyph1["-->HasLayer"].id);
                }));
            });
        });

        //Related relationships
        describeEndpoint('/lyphs/{id}/-->HasLayer', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {

                GET("returns relationships with expected fields", r=>r.expect(OK).expect(isArray)
                    .resources((resources) => {
                        for (let res of resources) {
                            expect(res).to.have.property('class').that.equals("HasLayer");
                            expect(res).to.have.property('1');
                            expect(res).to.have.property('2');
                            expect(res[1]).to.have.property('class').that.equals("Lyph");
                            expect(res[1]).to.have.property('href');
                            expect(res[2]).to.have.property('class').that.equals("Lyph");
                        }
                }));
            });
        });

        //Specific relationships by resources (= specific related relationships)
        describeEndpoint('/lyphs/{lyphID}/-->HasLayer/{otherLyphID}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({lyphID: initial.mainLyph1.id, otherLyphID: initial.lyph2.id}), () => {

                GET("returns HasLayer relationships with expected fields", r=>
                    r.expect(OK).expect(isArray)
                    .resources((resources) => {
                        for (let res of resources) {
                            expect(res).to.have.property('class').that.equals("HasLayer");
                            expect(res).to.have.property('1');
                            expect(res).to.have.property('2');
                            expect(res[1]).to.have.property('class').that.equals("Lyph");
                            expect(res[1]).to.have.property('href');
                            expect(res[2]).to.have.property('class').that.equals("Lyph");
                            expect(res[2]).to.have.property('href');
                        }
                    }));

                POST("updates HasLayer relationship", r=>r.send({relativePosition: 1})
                    .expect(OK).expect(isArray)
                    .resources((resources) => {
                        expect(resources).to.have.length.of.at.least(1);
                        for (let res of resources) {
                            expect(res).to.have.property('class').that.equals("HasLayer");
                            expect(res).to.have.property('relativePosition').that.equals(1);
                            expect(res).to.have.property('1');
                            expect(res).to.have.property('2');
                            expect(res[1]).to.have.property('class').that.equals("Lyph");
                            expect(res[1]).to.have.property('href');
                            expect(res[2]).to.have.property('class').that.equals("Lyph");
                            expect(res[2]).to.have.property('href');                        }
                    }));

                PUT("replaces HasLayer relationship", r=>r.send({
                    id: 201,
                    relativePosition: 1,
                    class: "HasLayer"
                })
                    .expect(OK).expect(isArray)
                    .resources((resources) => {
                        expect(resources).to.have.length.of.at.least(1);
                        for (let res of resources) {
                            expect(res).to.have.property('href');
                            expect(res).to.have.property('class').that.equals("HasLayer");
                            expect(res).to.have.property('1');
                            expect(res).to.have.property('2');
                            expect(res[1]).to.have.property('class').that.equals("Lyph");
                            expect(res[1]).to.have.property('href');
                            expect(res[2]).to.have.property('class').that.equals("Lyph");
                            expect(res[2]).to.have.property('href');                        }
                    }));

                DELETE("removes HasLayer relationship", r=>r.expect(NO_CONTENT).then(async() => {
                    let res = await db.getRelationships(
                        relationships["-->HasLayer"], resources.Lyph, resources.Lyph,
                        initial.mainLyph1.id, initial.lyph2.id);
                    expect(res).to.have.length.of(0);
                }));
            });
        });
    });
