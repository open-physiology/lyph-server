/**
 * Created by Natallia on 12/1/2016.
 */
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import _, {template, isString, isFunction, isArray, isUndefined} from 'lodash';
import {expect} from 'chai';
import {initial, portable, describeResourceClass, describeEndpoint,
    GET, POST, PUT, DELETE,
    withInvalidPathParams, withValidPathParams,
    requestSingleResource, requestResources, api} from './testUtils.es6.js';


import {extractFieldValues} from "../utility.es6";

import {model} from '../resources.es6.js';
import {OK, NO_CONTENT, CREATED} from "../http-status-codes.es6";

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//Run just one test (helps to check one thing at the development time )
export function runSelectedTest(){
    describeResourceClass('Lyph', () => {

        //Resources
        describeEndpoint('/lyphs', ['GET', 'POST'], () => {
            withValidPathParams(()=>{}, () => {

                GET("returns lyphs", r=>r.expectArrayWith((res) => {
                    expect(res).to.have.property('id');    
                    expect(res).to.have.property('href');  
                    expect(res).to.have.property('class').that.equals("Lyph");
                }));
                
               //TODO: POST
            });
        });

        //Specific resource
        describeEndpoint('/lyphs/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('href');
                    expect(res).to.have.property('class');
                    expect(res).to.have.property('name');
                    expect(res).to.have.property('species');
                    expect(res).to.have.property('layers').with.members([initial.lyph1.id, initial.lyph2.id]);
                    //expect(res).to.have.property('parts').with.members([initial.lyph1.id, initial.lyph2.id]);
                    expect(res).to.have.property('externals').with.members([initial.externalResource1.id]);
                    //expect(res).to.have.property('longitudinalBorders').with.members([initial.border1.id, initial.border2.id]);
                    expect(res).to.have.property('radialBorders');
                    expect(res).to.have.property('axis');
                    expect(res).to.have.property('thickness').that.deep.equals({value: 1});
                    expect(res).to.have.property('length').that.deep.equals({min: 1, max: 10});
                    //expect(res).to.have.property('segments');
                    //expect(res).to.have.property('patches');
                    //expect(res).to.have.property('coalecences');
                    //expect(res).to.have.property('incomingProcesses');
                    //expect(res).to.have.property('outgoingProcesses');
                    //expect(res).to.have.property('processes');
                    //expect(res).to.have.property('nodes');
                    //expect(res).to.have.property('materials').with.members([ initial.materialType1.id]);
                    expect(res).to.have.property('measurables').with.members([initial.measurable1.id]);
                }));
            });
        });

        //Related resources
        describeEndpoint('/lyphs/{id}/layers', ['GET'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns layers", r=>r.expectArrayWith((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('href');
                    expect(res).to.have.property('class').that.equals("Lyph");
                }));
            });
        });

        //Specific related resource
        describeEndpoint('/lyphs/{lyphID}/layers/{otherLyphID}', ['PUT', 'DELETE'], () => {

            withValidPathParams(()=>({lyphID: initial.mainLyph1.id, otherLyphID: initial.lyph3.id}), () => {

                PUT("returns a lyph with added layer", r=>r.expect(NO_CONTENT).then(async() => {
                    let res = await requestResources(`/lyphs/${initial.mainLyph1.id}/layers`);
                    expect(res).to.have.length.of(3);
                }));

                DELETE("returns a lyph with removed layer", r=>r.expect(NO_CONTENT).then(async() => {
                    let res = await requestResources(`/lyphs/${initial.mainLyph1.id}/layers`);
                    expect(res).to.have.length.of(2);
                }));
            });
        });
    });
}

/* Test all resource endpoints */
export function testResources() {

    describeResourceClass('ExternalResource', () => {

        describeEndpoint('/externalResources', ['GET', 'POST']);

        describeEndpoint('/externalResources/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.border1.id}));

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

                PUT("replace a given external resource", r=>r.send(
                    portable.externalResource1
                ).expect(OK).then(async() => {
                    let res = await requestSingleResource(`/externalResources/${portable.externalResource1.id}`);
                    expect(res).to.have.property('name').that.equals("Right fourth dorsal metatarsal vein");
                }));

                DELETE("delete a given external resource", r=>r.send("")).expect(NO_CONTENT);
            });
        });

        describeEndpoint('/externalResources/{id}/locals', ['GET'], () => {
            withValidPathParams(()=>({id: initial.externalResource1.id}), () => {
                GET("returns locals", r =>r.expectArrayWith((res) => {
                    expect(res).to.have.property('id');    
                    expect(res).to.have.property('href');  
                    expect(res).to.have.property('class'); 
                }));
            });
        });
    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Border', () => {

        describeEndpoint('/borders', ['GET', 'POST']);

        describeEndpoint('/borders/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

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

        describeEndpoint('/materials', ['GET', 'POST']);

        describeEndpoint('/materials/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

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
                GET("returns materials", r=>r.expectArrayWith((res) => {}));
            });
        });
    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Measurable', () => {

        describeEndpoint('/measurables', ['GET', 'POST']);

        describeEndpoint('/measurables/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

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
                GET("returns materials", r=>r.expectArrayWith((res) => {}));
            });
        });
        describeEndpoint('/measurables/{id}/locations', ['GET'], () => {
            withValidPathParams(()=>({id: initial.measurable1.id}), () => {
                GET("returns locations", r=>r.expectArrayWith((res) => {}));
            });
        });
        describeEndpoint('/measurables/{id}/effects', ['GET'], () => {
            withValidPathParams(()=>({id: initial.measurable1.id}), () => {
                GET("returns effects", r=>r.expectArrayWith((res) => {}));
            });
        });
        describeEndpoint('/measurables/{id}/causes', ['GET'], () => {
            withValidPathParams(()=>({id: initial.measurable1.id}), () => {
                GET("returns causes", r=>r.expectArrayWith((res) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Causality', () => {

        describeEndpoint('/causalities', ['GET', 'POST']);

        describeEndpoint('/causalities/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

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

    describeResourceClass('Lyph', () => {

        //Resources
        describeEndpoint('/lyphs', ['GET', 'POST'], () => {
            withValidPathParams(()=>{}, () => {

                GET("returns lyphs", r=>r.expectArrayWith((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('href');
                    expect(res).to.have.property('class').that.equals("Lyph");
                }));

                //TODO: POST
            });
        });

        //Specific resource
        describeEndpoint('/lyphs/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('href');
                    expect(res).to.have.property('class');
                    expect(res).to.have.property('name');
                    expect(res).to.have.property('species');
                    expect(res).to.have.property('layers').with.members([initial.lyph1.id, initial.lyph2.id]);
                    expect(res).to.have.property('parts').with.members([initial.lyph1.id, initial.lyph2.id]);
                    expect(res).to.have.property('externals').with.members([initial.externalResource1.id]);
                    expect(res).to.have.property('longitudinalBorders').with.members([initial.border1.id, initial.border2.id]);
                    expect(res).to.have.property('radialBorders');
                    expect(res).to.have.property('axis');
                    expect(res).to.have.property('thickness').that.deep.equals({value: 1});
                    expect(res).to.have.property('length').that.deep.equals({min: 1, max: 10});
                    //expect(res).to.have.property('segments');
                    //expect(res).to.have.property('patches');
                    //expect(res).to.have.property('coalecences');
                    //expect(res).to.have.property('incomingProcesses');
                    //expect(res).to.have.property('outgoingProcesses');
                    //expect(res).to.have.property('processes');
                    //expect(res).to.have.property('nodes');
                    //expect(res).to.have.property('materials').with.members([ initial.materialType1.id]);
                    expect(res).to.have.property('measurables').with.members([initial.measurable1.id]);
                }));
            });
        });


        //Specific related resource
        describeEndpoint('/lyphs/{lyphID}/layers/{otherLyphID}', ['PUT', 'DELETE'], () => {

            withValidPathParams(()=>({lyphID: initial.mainLyph1.id, otherLyphID: initial.lyph3.id}), () => {

                PUT("returns a lyph with added layer", r=>r.expect(NO_CONTENT).then(async() => {
                    let res = await requestResources(`/lyphs/${initial.mainLyph1.id}/layers`);
                    expect(res).to.have.length.of(3);
                }));

                DELETE("returns a lyph with removed layer", r=>r.expect(NO_CONTENT).then(async() => {
                    let res = await requestResources(`/lyphs/${initial.mainLyph1.id}/layers`);
                    expect(res).to.have.length.of(2);
                }));
            });
        });

        //Related resources - all
        describeEndpoint('/lyphs/{id}/layers', ['GET'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns layers", r=>r.expectArrayWith((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('href');
                    expect(res).to.have.property('class').that.equals("Lyph");
                }));
            });
        });

        describeEndpoint('/lyphs/{id}/parts', ['GET'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns parts", r=>r.expectArrayWith((res) => {}));
            });
        });

        describeEndpoint('/lyphs/{id}/patches', ['GET'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns patches", r=>r.expectArrayWith((res) => {}));
            });
        });

        describeEndpoint('/lyphs/{id}/segments', ['GET'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns segments", r=>r.expectArrayWith((res) => {}));
            });
        });

        describeEndpoint('/lyphs/{id}/borders', ['GET'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns borders", r=>r.expectArrayWith((res) => {}));
            });
        });

        describeEndpoint('/lyphs/{id}/longitudinalBorders', ['GET'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns longitudinal borders", r=>r.expectArrayWith((res) => {}));
            });
        });

        describeEndpoint('/lyphs/{id}/radialBorders', ['GET'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns radial borders", r=>r.expectArrayWith((res) => {}));
            });
        });

        describeEndpoint('/lyphs/{id}/coalescences', ['GET'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns coalescences", r=>r.expectArrayWith((res) => {}));
            });
        });

        describeEndpoint('/lyphs/{id}/outgoingProcesses', ['GET'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns ongoing processes", r=>r.expectArrayWith((res) => {}));
            });
        });

        describeEndpoint('/lyphs/{id}/incomingProcesses', ['GET'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns incoming processes", r=>r.expectArrayWith((res) => {}));
            });
        });

        describeEndpoint('/lyphs/{id}/processes', ['GET'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns processes", r=>r.expectArrayWith((res) => {}));
            });
        });
    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Node', () => {

        describeEndpoint('/nodes', ['GET', 'POST']);

        describeEndpoint('/nodes/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

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
                GET("returns outgoing processes", r=>r.expectArrayWith((res) => {}));
            });
        });
        describeEndpoint('/nodes/{nodeID}/incomingProcesses', ['GET'], () => {
            withValidPathParams(()=>({id: initial.node1.id}), () => {
                GET("returns incoming processes", r=>r.expectArrayWith((res) => {}));
            });
        });
        describeEndpoint('/nodes/{nodeID}/channels', ['GET'], () => {
            withValidPathParams(()=>({id: initial.node1.id}), () => {
                GET("returns channels", r=>r.expectArrayWith((res) => {}));
            });
        });
        describeEndpoint('/nodes/{nodeID}/locations', ['GET'], () => {
            withValidPathParams(()=>({id: initial.node1.id}), () => {
                GET("returns locations", r=>r.expectArrayWith((res) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Process', () => {

        describeEndpoint('/processes', ['GET', 'POST']);

        describeEndpoint('/processes/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

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
                GET("returns outgoing processes", r=>r.expectArrayWith((res) => {}));
            });
        });
        describeEndpoint('/processes/{id}/materials', ['GET'], () => {
            withValidPathParams(()=>({id: initial.process1.id}), () => {
                GET("returns materials", r=>r.expectArrayWith((res) => {}));
            });
        });
        describeEndpoint('/processes/{id}/channels', ['GET'], () => {
            withValidPathParams(()=>({id: initial.process1.id}), () => {
                GET("returns channels", r=>r.expectArrayWith((res) => {}));
            });
        });
        describeEndpoint('/processes/{id}/segments', ['GET'], () => {
            withValidPathParams(()=>({id: initial.process1.id}), () => {
                GET("returns segments", r=>r.expectArrayWith((res) => {}));
            });
        });
    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Group', () => {

        describeEndpoint('/groups', ['GET', 'POST']);

        describeEndpoint('/groups/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

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
                GET("returns elements", r=>r.expectArrayWith((res) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('OmegaTree', () => {

        describeEndpoint('/omegaTrees', ['GET', 'POST']);

        describeEndpoint('/omegaTrees/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

            withValidPathParams(()=>({id: initial.omegaTree1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    
                    expect(res).to.have.property('href');  
                    expect(res).to.have.property('class'); 
                    expect(res).to.have.property('name');  
                    //expect(res).to.have.property('parts').with.members([ initial.lyph1.id, initial.lyph2.id, initial.lyph3.id ]);
                }));
            });
        });

        describeEndpoint('/omegaTrees/{id}/root', ['GET'], () => {
            withValidPathParams(()=>({id: initial.omegaTree1.id}), () => {
                GET("returns root nodes", r=>r.expectArrayWith((res) => {}));
            });
        });
        describeEndpoint('/omegaTrees/{id}/parts', ['GET'], () => {
            withValidPathParams(()=>({id: initial.process1.id}), () => {
                GET("returns parts", r=>r.expectArrayWith((res) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Publication', () => {

        describeEndpoint('/publications', ['GET', 'POST']);

        describeEndpoint('/publications/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

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
                GET("returns correlations", r=>r.expectArrayWith((res) => {}));
            });
        });
    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('ClinicalIndex', () => {

        describeEndpoint('/clinicalIndices', ['GET', 'POST']);

        describeEndpoint('/clinicalIndices/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

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
                GET("returns clinical indices", r=>r.expectArrayWith((res) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Correlation', () => {

        describeEndpoint('/correlations', ['GET', 'POST']);

        describeEndpoint('/correlations/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

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
                GET("returns measurables", r=>r.expectArrayWith((res) => {}));
            });
        });
        describeEndpoint('/correlations/{id}/clinicalIndices', ['GET'], () => {
            withValidPathParams(()=>({id: initial.correlation1.id}), () => {
                GET("returns clinical indices", r=>r.expectArrayWith((res) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Coalescence', () => {

        describeEndpoint('/coalescences', ['GET', 'POST']);

        describeEndpoint('/coalescences/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

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
                GET("returns lyphs", r=>r.expectArrayWith((res) => {}));
            });
        });
        describeEndpoint('/coalescences/{id}/scenarios', ['GET'], () => {
            withValidPathParams(()=>({id: initial.coalescence1.id}), () => {
                GET("returns scenarios", r=>r.expectArrayWith((res) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('CoalescenceScenario', () => {

        describeEndpoint('/coalescenceScenarios', ['GET', 'POST']);

        describeEndpoint('/coalescenceScenarios/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

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
                GET("returns lyphs", r=>r.expectArrayWith((res) => {}));
            });
        });
    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Type', () => {

        describeEndpoint('/types', ['GET', 'POST']);

        describeEndpoint('/types/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

            //TODO uncomment when materialType1 is created
            // withValidPathParams(()=>({id: initial.materialType1.id}), () => {
            //
            //     GET("returns a resource with expected fields", r=>r.resource((res) => {
            //         expect(res).to.have.property('id');    
            //         expect(res).to.have.property('href');  
            //         expect(res).to.have.property('class'); 
            //         expect(res).to.have.property('name');  
            //         expect(res).to.have.property('definition').that.equals(initial.material1.id);
            //     }));
            //
            // });
        });

        //TODO uncomment when materialType1 is created
        // describeEndpoint('/types/{id}/subtypes', ['GET'], () => {
        //     withValidPathParams(()=>({id: initial.materialType1.id}), () => {
        //         GET("returns subtypes", r=>r.expectArrayWith((res) => {}));
        //     });
        // });
        // describeEndpoint('/types/{typeID}/supertypes', ['GET'], () => {
        //     withValidPathParams(()=>({id: initial.materialType2.id}), () => {
        //         GET("returns supertypes", r=>r.expectArrayWith((res) => {}));
        //     });
        // });

    });


}


/* Test abstract resources */
export function testAbstractResources(){


    describeResourceClass('Resource', () => {

        describeEndpoint('/resources', ['GET', 'POST']);

        describeEndpoint('/resources/{id}', ['GET', 'POST', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withValidPathParams(()=>({id: initial.externalResource1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    
                    expect(res).to.have.property('href');  
                    expect(res).to.have.property('class'); 
                    expect(res).to.have.property('name');  
                }));
            });
        });

        describeEndpoint('/resources/{id}/externals', ['GET', 'POST'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns externals", r=>r.expectArrayWith((res) => {}));
            });
        });
        describeEndpoint('/resources/{id}/themes', ['GET', 'POST'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns themes", r=>r.expectArrayWith((res) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Template', () => {

        describeEndpoint('/templates', ['GET', 'POST']);

        describeEndpoint('/templates/{id}', ['GET', 'POST', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

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
                GET("returns cardinality multipliers", r=>r.expectArrayWith((res) => {}));
            });
        });
        describeEndpoint('/templates/{id}/types', ['GET', 'POST'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns types", r=>r.expectArrayWith((res) => {}));
            });
        });
        describeEndpoint('/templates/{id}/children', ['GET', 'POST'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns children", r=>r.expectArrayWith((res) => {}));
            });
        });
        describeEndpoint('/templates/{id}/parents', ['GET', 'POST'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns parents", r=>r.expectArrayWith((res) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('NodeLocation', () => {

        describeEndpoint('/nodeLocations', ['GET', 'POST']);

        describeEndpoint('/nodeLocations/{id}', ['GET', 'POST', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

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
                GET("returns nodes", r=>r.expectArrayWith((res) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('MeasurableLocation', () => {

        describeEndpoint('/measurableLocations', ['GET', 'POST']);

        describeEndpoint('/measurableLocations/{id}', ['GET', 'POST', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

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
                GET("returns measurables", r=>r.expectArrayWith((res) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('OmegaTreePart', () => {

        describeEndpoint('/omegaTreeParts', ['GET', 'POST']);

        describeEndpoint('/omegaTreeParts/{id}', ['GET', 'POST', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

            withValidPathParams(()=>({id: initial.lyph1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    
                    expect(res).to.have.property('href');  
                    expect(res).to.have.property('class'); 
                    expect(res).to.have.property('name');  
                }));
            });
        });

        describeEndpoint('/omegaTreeParts/{id}/treeChildren', ['GET', 'POST'], () => {
            withValidPathParams(()=>({id: initial.lyph1.id}), () => {
                GET("returns tree children", r=>r.expectArrayWith((res) => {}));
            });
        });
    });

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





