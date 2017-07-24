/**
 * Created by Natallia on 12/1/2016.
 */
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
'use strict';

import _, {template, isString, isFunction, isArray, isUndefined} from 'lodash';
import {pick} from 'lodash-bound';
import {expect} from 'chai';
import {initial, dynamic, describeResourceClass, describeEndpoint, describeBatch,
    GET, POST, PUT, DELETE,
    withInvalidPathParams, withValidPathParams,
    requestSingleResource, requestResources} from './testUtils.es6.js';
import {OK, NO_CONTENT, CREATED} from "../src/http-status-codes.es6";

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// NOTE: We don't support batch as of writing this.
//Run just one test (helps to check one thing at the development time )
//     describeBatch(() => {
//         describeEndpoint('/batch', ['POST'], () => {
//             withValidPathParams(()=> {}, () => {
//                 POST("creates a lyph with 2 borders", r=>r.send({
//                     "temporaryIDs": [-1, -2, -3],
//                     "operations": [
//                         {
//                             "method": "POST",
//                             "path": "/borders",
//                             "body": { "id": -1 }
//                         },
//                         {
//                             "method": "POST",
//                             "path": "/borders",
//                             "body": { "id": -2}
//                         },
//                         {
//                             "method": "POST",
//                             "path": "/lyphs",
//                             "body": {
//                                 "id": -3,
//                                 "name": "Ovary",
//                                 "longitudinalBorders": [-1, -2]
//                             }
//                         }
//                     ]}).expect(OK).expect(isArray)
//                     .resources((response) => {
//                         let {ids, responses} = response;
//                         expect(responses).to.have.property('length').that.equals(3);
//                         for (let response of responses){
//                             expect(response).has.property("statusCode");
//                             expect(response.statusCode === CREATED).to.be.equal(true);
//                             //NK: this is to make sure working structure retaining initial method call is not returned back in response
//                             expect(response).not.to.have.property("operation");
//                         }
//                     }));
//             });
//         });
//     }); // NOTE: We don't support batch as of writing this.






describeResourceClass('Type', () => {

    describeEndpoint('/Type', ['GET', 'POST'], () => {

        withValidPathParams(()=>({}), () => {

            GET("returns types", r=>r.expect(OK).expect(isArray).resources((resources) =>  {
                for (let res of resources) {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('class').that.equals("Type");
                    expect(res).to.have.property('<--DefinesType');
                }
            }));

            POST("creates a new type", r=>r.send({
                name:       "Urine",
                definition: initial.material2::pick('class', 'id')
            }).expect(CREATED).expect(isArray).resources((resources) => {
                expect(resources).to.have.length.of(1);
                for (let res of resources) {
                    expect(res).to.have.property('name').that.equals("Urine");
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('<--DefinesType');
                }
            }));

        });
    });
});

describeResourceClass('CanonicalTreeBranch', () => {

    describeEndpoint('/CanonicalTreeBranch', ['POST'], () => {

        withValidPathParams(()=> {}, () => {

            POST("creates a new canonical tree branch", r=>r.send({
                name: "SLN 2st level branch",
                conveyingLyphType: initial.lyphType2       ::pick('class', 'id'),
                parentTree:        initial.canonicalTree1_2::pick('class', 'id'),
                childTree:         initial.canonicalTree1_3::pick('class', 'id')
            }).expect(CREATED).then(async() => {

                let nodes    = await requestResources(`/CanonicalTree`);
                let branches = await requestResources(`/CanonicalTreeBranch`);
                expect(nodes)   .to.have.length.of(3);
                expect(branches).to.have.length.of(2);

            }));
        });
    });

    describeEndpoint('/CanonicalTreeBranch/{id}', ['GET'], () => {
        withValidPathParams(()=>({id: initial.canonicalTreeBranch1_2.id}), () => {

            GET("returns a resource with expected fields", r=>r.resource((res) => {
                expect(res).to.have.property('id').that.equals(initial.canonicalTreeBranch1_2.id);
                expect(res).to.have.property('name');
                expect(res).to.have.property('id');
                expect(res).to.have.property('class').that.equals("CanonicalTreeBranch");
                expect(res['-->BranchesTo']).not.to.be.null;
                expect(res['<--HasBranch']).not.to.be.null;
                expect(res['-->IsConveyedBy']).not.to.be.null;
                expect([...res['-->BranchesTo']].map(x => x.id)).to.include.members(
                    [...initial.canonicalTreeBranch1_2['-->BranchesTo']].map(x => x.id));
                expect([...res['<--HasBranch']].map(x => x.id)).to.include.members(
                    [...initial.canonicalTreeBranch1_2['<--HasBranch']].map(x => x.id));
                expect([...res['-->IsConveyedBy']].map(x => x.id)).to.include.members(
                    [...initial.canonicalTreeBranch1_2['-->IsConveyedBy']].map(x => x.id));
            }));
        });
    });
});

describeResourceClass('Lyph', () => {

    //Resources
    describeEndpoint('/Lyph', ['GET', 'POST'], () => {
        withValidPathParams(()=>{}, () => {

            GET("returns lyphs", r=>r.expect(OK).expect(isArray).resources((resources) =>  {
                for (let res of resources) {
                    expect(res).to.have.property('id').that.is.not.null;
                    expect(res).to.have.property('class').that.equals("Lyph");
                }
            }));

            POST("creates a new lyph", r=>r.send({
                "name":  "Liver",
                "longitudinalBorders": [dynamic.borders1::pick('class', 'id'), dynamic.borders2::pick('class', 'id')],
                "layers": [dynamic.lyph1::pick('class', 'id'), dynamic.lyph2::pick('class', 'id')]
            }).expect(CREATED).expect(isArray).resources((resources) => {
                expect(resources).to.have.length.of(1);
                for (let res of resources) {
                    expect(res).to.have.property('name').that.equals("Liver");
                }
            }));
        });
    });

    //Specific resource
    describeEndpoint('/Lyph/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

        withInvalidPathParams("non-existing", {id: 999999});

        withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

        withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {

            GET("returns a resource with expected fields", r=>r.resource((res) => {
                expect(res).to.have.property('id').that.equals(initial.mainLyph1.id);
                expect(res).to.have.property('class').that.equals("Lyph");
                expect(res).to.have.property('name');
                expect(res).to.have.property('species');
                expect(res).to.have.property('thickness').that.deep.equals({value: 1});
                expect(res).to.have.property('length').that.deep.equals({min: 1, max: 10});
                //TODO: HasAxis relationship does not turn into HasLongitudinalBorder
                expect([...res['-->HasLongitudinalBorder']].map(x => x.id)).to.include.members(
                  [...initial.mainLyph1['-->HasLongitudinalBorder']].map(x => x.id));
                expect([...res['-->HasLayer']].map(x => x.id)).to.include.members(
                    [...initial.mainLyph1['-->HasLayer']].map(x => x.id));
                expect([...res['-->CorrespondsTo']].map(x => x.id)).to.include.members(
                    [...initial.mainLyph1['-->CorrespondsTo']].map(x => x.id));
                expect([...res['-->ContainsMaterial']].map(x => x.id)).to.include.members(
                    [...initial.mainLyph1['-->ContainsMaterial']].map(x => x.id));
                expect([...res['-->HasMeasurable']].map(x => x.id)).to.include.members(
                    [...initial.mainLyph1['-->HasMeasurable']].map(x => x.id));
            }));

            POST("updates a given resource", r=>r.send({
                name: "Kidney 1",
                materials: [initial.materialType2::pick('class', 'id')]
            }).expect(OK).expect(isArray)
                .resources((resources) => {
                expect(resources).to.have.length.of.at.least(1);
                for (let res of resources) {
                    expect(res).to.have.property('name').that.equals("Kidney 1");
                    expect([...res['-->ContainsMaterial']].map(x => x.id)).to.include.members([initial.materialType2.id]);
                }
            }));
        });
    });

    //Specific resource
    describeEndpoint('/Lyph/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {
        withValidPathParams(()=>({id: initial.mainLyph3.id}), () => {

            PUT("replaces properties of a given resource", r=>r.send({
                "name": "Kidney 2"
            }).expect(OK).expect(isArray)
                .resources((resources) => {
                    expect(resources).to.have.length.of.at.least(1);
                    for (let res of resources) {
                        expect(res).to.have.property('name').that.equals("Kidney 2");
                    }
                }));

            DELETE("delete a specific resource", r=>r.expect(NO_CONTENT).then(async() => {
                let res = await requestSingleResource(`/Lyph/${initial.mainLyph3.id}`);
                let res2 = await requestSingleResource(`/Lyph/${initial.mainLyph2.id}`);
                expect(res).to.be.undefined;
                expect(res2).to.have.property("id").that.equals(initial.mainLyph2.id);
            }));

        });
    });

    //Related resources
    describeEndpoint('/Lyph/{id}/layers', ['GET'], () => {
        withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
            GET("returns layers", r=>r.expect(OK).expect(isArray).resources((resources) =>  {
                for (let res of resources) {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('class').that.equals("Lyph");
                }
            }));
        });
    });

    //Specific related resource
    describeEndpoint('/Lyph/{lyphID}/layers/{otherLyphID}', ['PUT', 'DELETE'], () => {

        withValidPathParams(()=>({lyphID: initial.mainLyph1.id, otherLyphID: initial.lyph2.id}), () => {
            PUT("adds layer", r=>r.send().expect(NO_CONTENT).then(async () => {
                let res = [...await requestResources(`/Lyph/${initial.mainLyph1.id}/layers`)];
                expect(res).to.have.length.of(2);
            }));
        });

        withValidPathParams(()=>({lyphID: initial.mainLyph1.id, otherLyphID: initial.lyph3.id}), () => {
            PUT("adds layer", r=>r.send().expect(NO_CONTENT).then(async () => {
                let res = await requestResources(`/Lyph/${initial.mainLyph1.id}/layers`);
                expect(res).to.have.length.of(3);
            }));
        });

        withValidPathParams(()=>({lyphID: initial.mainLyph2.id, otherLyphID: initial.lyph1.id}), () => {
            DELETE("removes layer", r=>r.expect(NO_CONTENT).then(async () => {
                let res = await requestResources(`/Lyph/${initial.mainLyph2.id}/layers`);
                expect(res).to.have.length.of(2);
            }));
        });
        withValidPathParams(()=>({lyphID: initial.mainLyph2.id, otherLyphID: initial.lyph3.id}), () => {
            DELETE("removes layer", r=>r.expect(NO_CONTENT).then(async () => {
                let res = await requestResources(`/Lyph/${initial.mainLyph2.id}/layers`);
                expect(res).to.have.length.of(1);
            }));
        });
    });
});
