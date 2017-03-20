/**
 * Created by Natallia on 12/1/2016.
 */
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
'use strict';

import _, {template, isString, isFunction, isArray, isUndefined} from 'lodash';
import {expect} from 'chai';
import {initial, dynamic, describeResourceClass, describeEndpoint,
    GET, POST, PUT, DELETE,
    withInvalidPathParams, withValidPathParams,
    requestSingleResource} from './testUtils.es6.js';
import {OK, NO_CONTENT} from "../src/http-status-codes.es6";
import {resources} from '../src/utility.es6.js';

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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


    //Lyph - copy from selected test


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

        describeEndpoint('/types/{id}/subtypes', ['GET'], () => {
            withValidPathParams(()=>({id: initial.materialType1.id}), () => {
                GET("returns subtypes",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/types/{typeID}/supertypes', ['GET'], () => {
            withValidPathParams(()=>({id: initial.materialType2.id}), () => {
                GET("returns supertypes",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });

    });

    //////////////////////////////
    /* Test abstract resources */
    /////////////////////////////
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




