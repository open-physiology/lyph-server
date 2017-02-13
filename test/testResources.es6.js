/**
 * Created by Natallia on 12/1/2016.
 */
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import _, {template, isString, isFunction, isArray, isUndefined} from 'lodash';
import {expect} from 'chai';
import {initial, dynamic, describeResourceClass, describeEndpoint, describeBatch,
    GET, POST, PUT, DELETE,
    withInvalidPathParams, withValidPathParams,
    requestSingleResource, requestResources} from './testUtils.es6.js';
import {OK, NO_CONTENT, CREATED} from "../src/http-status-codes.es6";
import {resources} from '../src/resources.es6.js';

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//Run just one test (helps to check one thing at the development time )
export function runSelectedResourceTest(){

    describeBatch(() => {
        describeEndpoint('/batch', ['POST'], () => {
            withValidPathParams(()=> {}, () => {
                POST("creates a lyph with 2 borders", r=>r.send({
                    "temporaryIDs": [-1, -2, -3],
                    "operations": [
                        {
                            "method": "POST",
                            "path": "/borders",
                            "body": { "id": -1 }
                        },
                        {
                            "method": "POST",
                            "path": "/borders",
                            "body": { "id": -2}
                        },
                        {
                            "method": "POST",
                            "path": "/lyphs",
                            "body": {
                                "id": -3,
                                "name": "Heart",
                                "longitudinalBorders": [-1, -2]
                            }
                        }
                    ]}).expect(OK).then(async() => {}));
            });
        });
    });

    // describeResourceClass('CanonicalTreeBranch', () => {
    //
    //     describeEndpoint('/canonicalTreeBranches', ['POST'], () => {
    //
    //         withValidPathParams(()=> {}, () => {
    //
    //             POST("creates a new canonical tree branch", r=>r.send({
    //                 name: "SLN 2st level branch",
    //                 conveyingLyphType: initial.lyphType2.id,
    //                 parentTree: initial.canonicalTree1_2.id,
    //                 childTree: initial.canonicalTree1_3.id
    //             }).expect(CREATED).then(async() => {}));
    //
    //             // {
    //             //     "name": "SLN 2st level branch",
    //             //     "conveyingLyphType": 107,
    //             //     "parentTree": 114,
    //             //     "childTree": 115
    //             // }
    //
    //         });
    //     });
    // });

    describeResourceClass('Lyph', () => {

        //Resources
        // describeEndpoint('/lyphs', ['GET', 'POST'], () => {
        //     withValidPathParams(()=>{}, () => {
        //
        //         GET("returns lyphs", r=>r.expect(OK).expect(isArray).resources((resources) =>  {
        //             for (let res of resources) {
        //                 expect(res).to.have.property('id');
        //                 expect(res).to.have.property('class').that.equals("Lyph");
        //             }
        //         }));
        //
        //         POST("creates a new lyph", r=>r.send(
        //             {
        //                 "thickness": { "min": 0, "class": "Range" },
        //                 "length": { "min": 0, "class": "Range" },
        //                 "cardinalityBase": {"value": 1, "class": "Value"},
        //                 "id": dynamic.lyph.id,
        //                 "class": "Lyph",
        //                 "name": "Liver",
        //                 "axis": dynamic.borders[0].id,
        //                 "longitudinalBorders": [ dynamic.borders[1].id ]
        //             }
        //         ).expect(CREATED).then(async() => {
        //             let res = await requestSingleResource(`/lyphs/${dynamic.lyph.id}`);
        //             expect(res).to.have.property('id').that.equals(dynamic.lyph.id);
        //         }));
        //     });
        // });

        //Specific resource
        describeEndpoint('/lyphs/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            // withInvalidPathParams("non-existing", {id: 999999});
            //
            // withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {

                // GET("returns a resource with expected fields", r=>r.resource((res) => {
                //     expect(res).to.have.property('id');
                //     expect(res).to.have.property('href');
                //     expect(res).to.have.property('class');
                //     expect(res).to.have.property('name');
                //     expect(res).to.have.property('species');
                //     expect(res).to.have.property('layers');
                //     expect(res.layers.map(x => x.id)).with.members([initial.lyph1.id, initial.lyph2.id]);
                //     expect(res).to.have.property('externals');
                //     expect(res.externals.map(x => x.id)).with.members([initial.externalResource1.id]);
                //     expect(res).to.have.property('longitudinalBorders');
                //     //w3expect(res.longitudinalBorders.map(x => x.id)).with.members([initial.border1.id, initial.border2.id]);
                //     //expect(res).to.have.property('radialBorders');
                //     expect(res).to.have.property('axis');
                //     expect(res).to.have.property('thickness').that.deep.equals({value: 1});
                //     expect(res).to.have.property('length').that.deep.equals({min: 1, max: 10});
                //     //expect(res).to.have.property('segments');
                //     //expect(res).to.have.property('patches');
                //     //expect(res).to.have.property('coalecences');
                //     //expect(res).to.have.property('incomingProcesses');
                //     //expect(res).to.have.property('outgoingProcesses');
                //     expect(res).to.have.property('processes');
                //     //expect(res).to.have.property('nodes');
                //     expect(res).to.have.property('materials');
                //     expect(res.materials.map(x => x.id)).with.members([ initial.materialType1.id]);
                //     expect(res).to.have.property('measurables');
                //     expect(res.measurables.map(x => x.id)).with.members([initial.measurable1.id]);
                // }));

                // POST("updates a given resource", r=>r.send({
                //     name: "Brain"
                // }).expect(OK).expect(isArray)
                //     .resources((resources) => {
                //     expect(resources).to.have.length.of.at.least(1);
                //     for (let res of resources) {
                //         expect(res).to.have.property('name').that.equals("Brain");
                //     }
                // }));
                //
                // PUT("replaces properties of a given resource", r=>r.send({
                //     "name": "Head"
                // }).expect(OK).expect(isArray)
                //     .resources((resources) => {
                //         expect(resources).to.have.length.of.at.least(1);
                //         for (let res of resources) {
                //             expect(res).to.have.property('name').that.equals("Head");
                //         }
                //     }));

                DELETE("delete a given external resource", r=>r.expect(NO_CONTENT).then(async() => {
                    let res = await requestSingleResource(`/lyphs/${initial.mainLyph1.id}`);
                    let res2 = await requestSingleResource(`/lyphs/${initial.mainLyph2.id}`);
                    expect(res).to.be.undefined;
                    expect(res2).to.have.property("id").that.equals(initial.mainLyph2.id);
                }));
            });
        });

        //Related resources
        describeEndpoint('/lyphs/{id}/layers', ['GET'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns layers", r=>r.expect(OK).expect(isArray).resources((resources) =>  {
                    for (let res of resources) {
                        expect(res).to.have.property('id');
                        expect(res).to.have.property('href');
                        expect(res).to.have.property('class').that.equals("Lyph");
                    }
                }));
            });
        });

        //Specific related resource
        describeEndpoint('/lyphs/{lyphID}/layers/{otherLyphID}', ['PUT', 'DELETE'], () => {

            withValidPathParams(()=>({lyphID: initial.mainLyph1.id, otherLyphID: initial.lyph3.id}), () => {

                PUT("adds layer", r=>r.send({relativePosition: 1})
                    .expect(OK).then(async() => {
                    let res = await requestResources(`/lyphs/${initial.mainLyph1.id}/layers`);
                    expect(res).to.have.length.of(3);
                }));

                DELETE("removes layer", r=>r.expect(NO_CONTENT).then(async() => {
                    let res = await requestResources(`/lyphs/${initial.mainLyph1.id}/layers`);
                    expect(res).to.have.length.of(2);
                }));
            });
        });
    });
}

export function testResourcesGeneral(){

    //Resource is tested separately because general "wrong-class" test is not applicable to it
    for (let className of [
        "ExternalResource", "Border", "Material", "Measurable",
        "Causality", "Lyph", "Node", "Process",
        "Group", "CanonicalTree", "Publication", "ClinicalIndex", "Correlation", "Coalescence",
        "CoalescenceScenario", "Type"
    ]){
        let plural = resources[className].plural;
        // it(`plural of class ${className} is defined`, () =>
        //     expect(plural).to.not.be.undefined
        // );

        describeResourceClass(className, () => {
            describeEndpoint(`/${plural}`, ['GET', 'POST']);

            describeEndpoint(`/${plural}/{id}`, ['GET', 'POST', 'PUT', 'DELETE'], () => {

                withInvalidPathParams("non-existing", {id: 999999});

                withInvalidPathParams("wrong-class", ()=>({id:
                    (className === "ExternalResource")
                        ? initial.mainLyph1.id
                        : initial.externalResource1.id}));
            });
        });
    }

    //Abstract
    for (let className of [
        "Template", "NodeLocation", "MeasurableLocation"
    ]){
        let plural = resources[className].plural;
        // it(`plural of class ${className} is defined`, () =>
        //     expect(plural).to.not.be.undefined
        // );

        describeResourceClass(className, () => {
            describeEndpoint(`/${plural}`, ['GET']);

            describeEndpoint(`/${plural}/{id}`, ['GET', 'POST', 'DELETE'], () => {

                withInvalidPathParams("non-existing", {id: 999999});

                withInvalidPathParams("wrong-class", ()=>({id:
                    (className === "ExternalResource")
                        ? initial.mainLyph1.id
                        : initial.externalResource1.id}));
            });
        });
    }
}

/* Test all resource endpoints */
export function testResources() {


    describeResourceClass('ExternalResource', () => {

        describeEndpoint('/externalResources/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.externalResource1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    
                    expect(res).to.have.property('href');  
                    expect(res).to.have.property('class'); 
                    expect(res).to.have.property('name');  
                    expect(res).to.have.property('uri');   
                    expect(res).to.have.property('type').that.equals("fma");  //{ type: 'string'}

                }));

                POST("updates a given resource", r=>r.send({
                    type: "obo",
                    name: "socket cell (sensu Nematoda)"
                }).expect(OK).then(async() => {
                    let res = await requestSingleResource(`/externalResources/${initial.externalResource1.id}`);
                    expect(res).to.have.property('type').that.equals("obo");
                    expect(res).to.have.property('name').that.equals("socket cell (sensu Nematoda)");
                }));

                DELETE("delete a given external resource", r=>r.expect(NO_CONTENT));
            });

            withValidPathParams(()=>({id: dynamic.externalResource1.id}), () => {
                PUT("replace a given external resource", r=>r.send(
                    dynamic.externalResource1
                ).expect(OK).then(async() => {
                    let res = await requestSingleResource(`/externalResources/${dynamic.externalResource1.id}`);
                    expect(res).to.have.property('name').that.equals("Right fourth dorsal metatarsal vein");
                }));
            });
        });

        describeEndpoint('/externalResources/{id}/locals', ['GET'], () => {
            withValidPathParams(()=>({id: initial.externalResource1.id}), () => {
                GET("returns locals", r=>r.expect(OK).expect(isArray).resources((resources) =>  {
                    for (let res of resources) {
                        expect(res).to.have.property('id');
                        expect(res).to.have.property('href');
                        expect(res).to.have.property('class');
                    }
                }));
            });
        });
    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Border', () => {

        describeEndpoint('/borders/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.border1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');     
                    expect(res).to.have.property('href');   
                    expect(res).to.have.property('class');  
                    expect(res).to.have.property('nature');
                }));
            });
        });
    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Material', () => {


        describeEndpoint('/materials/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.material1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    
                    expect(res).to.have.property('href');  
                    expect(res).to.have.property('class'); 
                    expect(res).to.have.property('name');  
                }));
            });
        });

        describeEndpoint('/materials/{id}/materials', ['GET'], () => {
            withValidPathParams(()=>({id: initial.material1.id}), () => {
                GET("returns materials",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Measurable', () => {


        describeEndpoint('/measurables/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.measurable1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id'); 
                    expect(res).to.have.property('href'); 
                    expect(res).to.have.property('class'); 
                    expect(res).to.have.property('name'); 
                    //expect(res).to.have.property('materials').with.members([ initial.materialType1.id]);
                }));
            });
        });

        describeEndpoint('/measurables/{id}/materials', ['GET'], () => {
            withValidPathParams(()=>({id: initial.measurable1.id}), () => {
                GET("returns materials",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/measurables/{id}/locations', ['GET'], () => {
            withValidPathParams(()=>({id: initial.measurable1.id}), () => {
                GET("returns locations",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/measurables/{id}/effects', ['GET'], () => {
            withValidPathParams(()=>({id: initial.measurable1.id}), () => {
                GET("returns effects",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/measurables/{id}/causes', ['GET'], () => {
            withValidPathParams(()=>({id: initial.measurable1.id}), () => {
                GET("returns causes",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Causality', () => {


        describeEndpoint('/causalities/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.causality1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id'); 
                    expect(res).to.have.property('href'); 
                    expect(res).to.have.property('class'); 
                    expect(res).to.have.property('cause').that.equals(initial.measurable1.id);
                    expect(res).to.have.property('effect').that.equals(initial.measurable2.id);
                }));
            });
        });
    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    //Lyph - copy from selected tests


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Node', () => {


        describeEndpoint('/nodes/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.node1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id'); 
                    expect(res).to.have.property('href'); 
                    expect(res).to.have.property('class'); 
                    expect(res).to.have.property('measurables').with.members([initial.measurable1.id]);
                    //expect(res).to.have.property('outgoingProcesses');
                    //expect(res).to.have.property('incomingProcesses');
                    //expect(res).to.have.property('channels');
                    expect(res).to.have.property('locations').with.members( [initial.mainLyph1.id]);
                }));
            });
        });

        describeEndpoint('/nodes/{id}/outgoingProcesses', ['GET'], () => {
            withValidPathParams(()=>({id: initial.node1.id}), () => {
                GET("returns outgoing processes",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/nodes/{nodeID}/incomingProcesses', ['GET'], () => {
            withValidPathParams(()=>({id: initial.node1.id}), () => {
                GET("returns incoming processes",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/nodes/{nodeID}/channels', ['GET'], () => {
            withValidPathParams(()=>({id: initial.node1.id}), () => {
                GET("returns channels",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/nodes/{nodeID}/locations', ['GET'], () => {
            withValidPathParams(()=>({id: initial.node1.id}), () => {
                GET("returns locations",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Process', () => {


        describeEndpoint('/processes/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.process1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id'); 
                    expect(res).to.have.property('href'); 
                    expect(res).to.have.property('class'); 
                    expect(res).to.have.property('transportPhenomenon').that.equals("advection")//,
                    // expect(res).to.have.property('sourceLyph').that.equals(initial.lyph1.id);
                    // expect(res).to.have.property('targetLyph').that.equals(initial.lyph2.id);
                    // expect(res).to.have.property('conveyingLyph').with.members([initial.mainLyph1.id]);
                }));
            });
        });

        describeEndpoint('/processes/{id}/conveyingLyph', ['GET'], () => {
            withValidPathParams(()=>({id: initial.process1.id}), () => {
                GET("returns outgoing processes",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/processes/{id}/materials', ['GET'], () => {
            withValidPathParams(()=>({id: initial.process1.id}), () => {
                GET("returns materials",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/processes/{id}/channels', ['GET'], () => {
            withValidPathParams(()=>({id: initial.process1.id}), () => {
                GET("returns channels",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/processes/{id}/segments', ['GET'], () => {
            withValidPathParams(()=>({id: initial.process1.id}), () => {
                GET("returns segments",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Group', () => {


        describeEndpoint('/groups/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.group1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    
                    expect(res).to.have.property('href');  
                    expect(res).to.have.property('class'); 
                    expect(res).to.have.property('name');  
                    expect(res).to.have.property('elements').with.members([ initial.lyph1.id, initial.node1.id]);
                }));
            });
        });

        describeEndpoint('/groups/{id}/elements', ['GET'], () => {
            withValidPathParams(()=>({id: initial.group1.id}), () => {
                GET("returns elements",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('CanonicalTree', () => {


        describeEndpoint('/canonicalTrees/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.canonicalTree1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    
                    expect(res).to.have.property('href');  
                    expect(res).to.have.property('class'); 
                    expect(res).to.have.property('name');  
                    expect(res).to.have.property('childBranches');

                }));
            });
        });

        describeEndpoint('/canonicalTrees/{id}/childBranches', ['GET'], () => {
            withValidPathParams(()=>({id: initial.canonicalTree1.id}), () => {
                GET("returns tree branches",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Publication', () => {


        describeEndpoint('/publications/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.publication1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    
                    expect(res).to.have.property('href');  
                    expect(res).to.have.property('class'); 
                    expect(res).to.have.property('name');  
                }));
            });
        });

        describeEndpoint('publications/{id}/correlations', ['GET'], () => {
            withValidPathParams(()=>({id: initial.publication1.id}), () => {
                GET("returns correlations",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('ClinicalIndex', () => {


        describeEndpoint('/clinicalIndices/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.clinicalIndex2.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    
                    expect(res).to.have.property('href');  
                    expect(res).to.have.property('class'); 
                    expect(res).to.have.property('name');  
                    expect(res).to.have.property('parent').that.equals(initial.clinicalIndex1.id);
                }));
            });
        });

        describeEndpoint('clinicalIndices/{id}/children', ['GET'], () => {
            withValidPathParams(()=>({id: initial.clinicalIndex1.id}), () => {
                GET("returns clinical indices",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Correlation', () => {

        describeEndpoint('/correlations/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.correlation1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    
                    expect(res).to.have.property('href');  
                    expect(res).to.have.property('class'); 
                    expect(res).to.have.property('publication').that.equals(initial.publication1.id);
                    expect(res).to.have.property('clinicalIndices').with.members([initial.clinicalIndex1.id, initial.clinicalIndex2.id]);
                    expect(res).to.have.property('measurables').with.members([initial.measurable1.id, initial.measurable2.id]);
                }));
            });
        });

        describeEndpoint('/correlations/{id}/measurables', ['GET'], () => {
            withValidPathParams(()=>({id: initial.correlation1.id}), () => {
                GET("returns measurables",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/correlations/{id}/clinicalIndices', ['GET'], () => {
            withValidPathParams(()=>({id: initial.correlation1.id}), () => {
                GET("returns clinical indices",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Coalescence', () => {

        describeEndpoint('/coalescences/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.coalescence1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    
                    expect(res).to.have.property('href');  
                    expect(res).to.have.property('class'); 
                    expect(res).to.have.property('lyphs').with.members([initial.lyph1.id, initial.lyph2.id]);
                }));
            });
        });

        describeEndpoint('/coalescences/{id}/lyphs', ['GET'], () => {
            withValidPathParams(()=>({id: initial.coalescence1.id}), () => {
                GET("returns lyphs",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/coalescences/{id}/scenarios', ['GET'], () => {
            withValidPathParams(()=>({id: initial.coalescence1.id}), () => {
                GET("returns scenarios",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('CoalescenceScenario', () => {

        describeEndpoint('/coalescenceScenarios/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.coalescenceScenario1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    
                    expect(res).to.have.property('href');  
                    expect(res).to.have.property('class'); 
                    expect(res).to.have.property('lyphs').with.members([initial.mainLyph1.id, initial.mainLyph2.id]);
                }));
            });
        });

        describeEndpoint('/coalescenceScenarios/{id}/lyphs', ['GET'], () => {
            withValidPathParams(()=>({id: initial.coalescenceScenario1.id}), () => {
                GET("returns lyphs",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Type', () => {


        describeEndpoint('/types/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            //TODO uncomment when materialType1 is created
            withValidPathParams(()=>({id: initial.materialType1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('href');
                    expect(res).to.have.property('class');
                    expect(res).to.have.property('name');
                    expect(res).to.have.property('definition').that.equals(initial.material1.id);
                }));

            });
        });

        //TODO uncomment when materialType1 is created
        // describeEndpoint('/types/{id}/subtypes', ['GET'], () => {
        //     withValidPathParams(()=>({id: initial.materialType1.id}), () => {
        //         GET("returns subtypes",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
        //     });
        // });
        // describeEndpoint('/types/{typeID}/supertypes', ['GET'], () => {
        //     withValidPathParams(()=>({id: initial.materialType2.id}), () => {
        //         GET("returns supertypes",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
        //     });
        // });

    });


}


/* Test abstract resources */
export function testAbstractResources(){

    describeResourceClass('Resource', () => {

        describeEndpoint(`/resources`, ['GET', 'POST'], () => {
            withValidPathParams(()=>{}, () => {
                GET("returns resources", r=>r.expect(OK).expect(isArray).resources((resources) =>  {
                    for (let res of resources) {
                        expect(res).to.have.property('id');
                        expect(res).to.have.property('href');
                        expect(res).to.have.property('class');
                    }
                }));
            });
        });


        describeEndpoint('/resources/{id}', ['GET', 'POST', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withValidPathParams(()=>({id: initial.externalResource1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    
                    expect(res).to.have.property('href');  
                    expect(res).to.have.property('class').that.equals(initial.externalResource1.class);
                    expect(res).to.have.property('name');  
                }));
            });
        });

        describeEndpoint('/resources/{id}/externals', ['GET', 'POST'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns externals",  r=>r.expect(OK).expect(isArray).resources((resources) => {
                    for (let res of resources) {
                        expect(res).to.have.property('id');
                        expect(res).to.have.property('href');
                        expect(res).to.have.property('class').that.equals("ExternalResource");
                    }
                }));
            });
        });

        describeEndpoint('/resources/{id}/themes', ['GET', 'POST'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns themes",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Template', () => {


        describeEndpoint('/templates/{id}', ['GET', 'POST', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    
                    expect(res).to.have.property('href');  
                    expect(res).to.have.property('class'); 
                    expect(res).to.have.property('name');  
                    expect(res).to.have.property('cardinalityBase');
                    expect(res).to.have.property('species');
                }));
            });
        });

        describeEndpoint('/templates/{id}/cardinalityMultipliers', ['GET', 'POST'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns cardinality multipliers",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/templates/{id}/types', ['GET', 'POST'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns types",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/templates/{id}/children', ['GET', 'POST'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns children",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/templates/{id}/parents', ['GET', 'POST'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns parents",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('NodeLocation', () => {

        describeEndpoint('/nodeLocations/{id}', ['GET', 'POST', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    
                    expect(res).to.have.property('href');  
                    expect(res).to.have.property('class'); 
                    expect(res).to.have.property('name');  
                    expect(res).to.have.property('cardinalityBase');
                    expect(res).to.have.property('species');
                }));
            });
        });

        describeEndpoint('/nodeLocations/{id}/nodes', ['GET', 'POST'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns nodes",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('MeasurableLocation', () => {

        describeEndpoint('/measurableLocations/{id}', ['GET', 'POST', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.node1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    
                    expect(res).to.have.property('href');  
                    expect(res).to.have.property('class'); 
                    expect(res).to.have.property('name');  
                    expect(res).to.have.property('cardinalityBase');
                    expect(res).to.have.property('species');
                }));
            });
        });

        describeEndpoint('/measurableLocations/{id}/measurables', ['GET', 'POST'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns measurables",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
}

////////////////////////////////////
//Untested relatedResource endpoints
////////////////////////////////////

// describeEndpoint('/themes/{themeID}/resources', ['GET', 'POST']);
// describeEndpoint('/artefactContainers/{artefactContainerID}/children', ['GET', 'POST']);
// describeEndpoint('/0-dimensionalContainers/{0-dimensionalContainerID}/children', ['GET', 'POST']);
// describeEndpoint('/1-dimensionalContainers/{1-dimensionalContainerID}/children', ['GET', 'POST']);
// describeEndpoint('/1-dimensionalContainers/{1-dimensionalContainerID}/children', ['GET', 'POST']);
// describeEndpoint('/2-dimensionalContainers/{2-dimensionalContainerID}/children', ['GET', 'POST']);
// describeEndpoint('/2-dimensionalContainers/{2-dimensionalContainerID}/children', ['GET', 'POST']);
// describeEndpoint('/2-dimensionalContainers/{2-dimensionalContainerID}/children', ['GET', 'POST']);

// Lyph3 { thickness: { min: 0, max: Infinity },
//     length: { min: 0, max: Infinity },
//     cardinalityBase: 1,
//     species: undefined,
//     id: 170,
//     href: 'cache://170',
//     class: 'Lyph',
//     name: 'Liver',
//     '-->DefinesType': null,
//     '-->HasAxis': null,
//     '<--HasTreeChildren': null,
//     definedType: undefined,
//     axis: undefined,
//     treeParent: undefined,
//     '-->IsRelatedTo': Set { HasLongitudinalBorder {}, HasLongitudinalBorder {} },
//     '<--IsRelatedTo': Set {},
//     '-->CorrespondsTo': Set {},
//     '-->HasCardinalityMultipliedByThatOf': Set {},
//     '<--HasCardinalityMultipliedByThatOf': Set {},
//     '-->HasType': Set {},
//     '-->PullsIntoTypeDefinition': Set { HasLongitudinalBorder {}, HasLongitudinalBorder {} },
//     '<--PullsIntoTypeDefinition': Set {},
//     '-->Has': Set { HasLongitudinalBorder {}, HasLongitudinalBorder {} },
//     '<--Has': Set {},
//     '-->ContainsMaterial': Set {},
//     '-->HasPart': Set {},
//     '<--HasPart': Set {},
//     '-->HasLayer': Set {},
//     '<--HasLayer': Set {},
//     '-->HasPatch': Set {},
//     '<--HasPatch': Set {},
//     '-->HasSegment': Set {},
//     '<--HasSegment': Set {},
//     '-->HasBorder': Set { HasLongitudinalBorder {}, HasLongitudinalBorder {} },
//     '-->HasLongitudinalBorder': Set { HasLongitudinalBorder {}, HasLongitudinalBorder {} },
//     '-->HasRadialBorder': Set {},
//     '<--JoinsLyph': Set {},
//     '<--Coalesces': Set {},
//     '-->ContainsNode': Set {},
//     '<--IncludesElement': Set {},
//     '-->provisional_FlowsTo': Set {},
//     '<--provisional_FlowsTo': Set {},
//     '-->ConveysProcess': Set {},
//     '-->HasMeasurable': Set {},
//     '<--PrescribesStyleFor': Set {},
//     '<--PresentsModel': Set {},
//     '-->HasTreeChildren': Set {},
//     '<--HasTreePart': Set {},
//     externals: Set {},
//     cardinalityMultipliers: Set {},
//     types: Set {},
//     children: Set { Border {}, Border {} },
//     parents: Set {},
//     materials: Set {},
//     parts: Set {},
//     layers: Set {},
//     patches: Set {},
//     segments: Set {},
//     borders: Set { Border {}, Border {} },
//     longitudinalBorders: Set { Border {}, Border {} },
//     radialBorders: Set {},
//     coalescences: Set {},
//     nodes: Set {},
//     outgoingProcesses: Set {},
//     incomingProcesses: Set {},
//     processes: Set {},
//     measurables: Set {},
//     themes: Set {},
//     treeChildren: Set {} }



