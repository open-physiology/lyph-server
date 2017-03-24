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


    /* Test that endpoints for all relationships exist */
    for (let className of [
        "Causes",
        "Coalesces",
        "CoalescesLike",
        "ContainsArtefact",
        "ContainsArtefact_00",
        "ContainsArtefact_10",
        "ContainsArtefact_11",
        "ContainsArtefact_20",
        "ContainsArtefact_21",
        "ContainsArtefact_22",
        "ContainsMaterial",
        "ContainsNode",
        "ConveysProcess",
        "CorrespondsTo",
        "EncompassesClinicalIndex",
        "FlowsTo",
        "Has",
        "HasAsRoot",
        "HasAxis",
        "HasBorder",
        "HasCardinalityMultipliedByThatOf",
        "HasChannel",
        "HasLayer",
        "HasLongitudinalBorder",
        "HasMeasurable",
        "HasPart",
        "HasPatch",
        "HasRadialBorder",
        "HasSegment",
        "HasTreeChildren",
        "HasTreePart",
        "HasType",
        "IncludesElement",
        "InvolvesClinicalIndex",
        "InvolvesMeasurable",
        "InvolvesPublication",
        "IsExternallyRelatedTo",
        "IsRelatedTo",
        "IsSubtypeOf",
        "JoinsLyph",
        "MeasuresMaterial",
        "PrescribesStyleFor",
        "PresentsModel",
        "PullsIntoTypeDefinition",
        "TransportsMaterial"
    ]){
        describeResourceClass(className, () => {
            describeEndpoint(`/${className}`, ['GET', 'POST']);

            describeEndpoint(`/${className}/{id}`, ['GET', 'POST', 'PUT', 'DELETE'], () => {

                withInvalidPathParams("non-existing", {id: 999999});

                withInvalidPathParams("wrong-class", ()=>({id: initial.border1.id}));
            });
        });
    }

    /////////////////////////////////////////////////////
    //Relationships                                    //
    /////////////////////////////////////////////////////

    describeResourceClass('HasLayer', () => {
        describeEndpoint(`/HasLayer`, ['GET', 'POST'], () => {
            withValidPathParams(()=>{}, () => {

                GET("returns HasLayer relationships", r=>r.expect(OK).expect(isArray)
                    .resources((resources) => {
                        for (let res of resources) {
                            expect(res).to.have.property('href');
                            expect(res).to.have.property('class').that.equals("HasLayer");
                            expect(res).to.have.property('1');
                            expect(res).to.have.property('2');
                            expect(res[1]).to.have.property('class').that.equals("Lyph");
                            expect(res[2]).to.have.property('class').that.equals("Lyph");
                        }
                    }));
            })
        });
    });

    /////////////////////////////////////////////////////
    // Specific relationships                          //
    /////////////////////////////////////////////////////

    describeResourceClass('HasLayer', () => {

        describeEndpoint('/HasLayer/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: 200}), () => {

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
                    relativePosition: 2
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
                    expect(res.map(x => x.id)).to.not.include(200);
                }));
            });
        });
    });

    describeResourceClass('HasBorder', () => {

        describeEndpoint('/HasBorder/{ids}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: [...initial.mainLyph1["-->HasBorder"]][0].id}), () => {

                GET("returns a relationship with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('href');
                    expect(res).to.have.property('class'); 
                    expect(res).to.have.property('name');  
                }));
            });
        });
    });


    /////////////////////////////////////////////////////
    // Related relationships                           //
    /////////////////////////////////////////////////////


    describeResourceClass('HasLayer', () => {

        describeEndpoint('/lyphs/{id}/-->HasLayer', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {

                GET("returns relationships with expected fields", r=>r.expect(OK).expect(isArray)
                    .resources((resources) => {
                        for (let res of resources) {
                            expect(res).to.have.property('href');
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
    });


    /////////////////////////////////////////////////////
    // Specific related relationships                  //
    /////////////////////////////////////////////////////





