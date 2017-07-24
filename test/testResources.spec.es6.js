'use strict';

import _, {template, isString, isFunction, isArray, isUndefined} from 'lodash';
import {expect} from 'chai';
import {initial, dynamic, describeResourceClass, describeEndpoint,
    GET, POST, PUT, DELETE,
    withInvalidPathParams, withValidPathParams,
    requestSingleResource} from './testUtils.es6.js';
import {OK, NO_CONTENT} from "../src/http-status-codes.es6";

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    //Resource is tested separately because general "wrong-class" test is not applicable to it
    for (let className of [
        "ExternalResource", "Border", "Material", "Measurable",
        "Causality", "Lyph", "Node", "Process",
        "Group", "CanonicalTree", "Publication", "ClinicalIndex", "Correlation", "Coalescence",
        "CoalescenceScenario", "Type"
    ]){
        describeResourceClass(className, () => {
            describeEndpoint(`/${className}`, ['GET', 'POST']);

            describeEndpoint(`/${className}/{id}`, ['GET', 'POST', 'PUT', 'DELETE'], () => {

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
        describeResourceClass(className, () => {
            describeEndpoint(`/${className}`, ['GET']);

            describeEndpoint(`/${className}/{id}`, ['GET', 'POST', 'DELETE'], () => {

                withInvalidPathParams("non-existing", {id: 999999});

                withInvalidPathParams("wrong-class", ()=>({id:
                    (className === "ExternalResource")
                        ? initial.mainLyph1.id
                        : initial.externalResource1.id}));
            });
        });
    }


    describeResourceClass('ExternalResource', () => {

        describeEndpoint('/ExternalResource/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.externalResource1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('class');
                    expect(res).to.have.property('name');
                    expect(res).to.have.property('uri');
                    expect(res).to.have.property('type').that.equals("fma");  //{ type: 'string'}

                }));

                POST("updates a given resource", r=>r.send({
                    type: "obo",
                    name: "socket cell (sensu Nematoda)"
                }).expect(OK).then(async() => {
                    let res = await requestSingleResource(`/ExternalResource/${initial.externalResource1.id}`);
                    expect(res).to.have.property('type').that.equals("obo");
                    expect(res).to.have.property('name').that.equals("socket cell (sensu Nematoda)");
                }));

                // DELETE("delete a given external resource", r=>r.expect(NO_CONTENT)); // TODO: Note that this messes up the related resources test below
            });

            // withValidPathParams(()=>({id: dynamic.externalResource1.id}), () => {
            //     PUT("replace a given external resource", r=>r.send(
            //         dynamic.externalResource1
            //     ).expect(OK).then(async() => {
            //         let res = await requestSingleResource(`/ExternalResource/${dynamic.externalResource1.id}`);
            //         expect(res).to.have.property('name').that.equals("Right fourth dorsal metatarsal vein");
            //     }));
            // }); // TODO MH: Ask NK about this one
        });

        describeEndpoint('/ExternalResource/{id}/locals', ['GET'], () => {
            withValidPathParams(()=>({id: initial.externalResource1.id}), () => {
                GET("returns locals", r=>r.expect(OK).expect(isArray).resources((resources) =>  {
                    for (let res of resources) {
                        expect(res).to.have.property('id');
                        expect(res).to.have.property('class');
                    }
                }));
            });
        });
    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Border', () => {

        describeEndpoint('/Border/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.border1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('class');
                    expect(res).to.have.property('nature');
                }));
            });
        });
    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Material', () => {


        describeEndpoint('/Material/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.material1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('class');
                    expect(res).to.have.property('name');
                }));
            });
        });

        describeEndpoint('/Material/{id}/materials', ['GET'], () => {
            withValidPathParams(()=>({id: initial.material1.id}), () => {
                GET("returns materials",  r=>r.expect(OK).expect(isArray).resources((resources) => {
                    //TODO test extracted resource properties if we have time
                    //This is true for other places in this file
                }));
            });
        });
    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Measurable', () => {


        describeEndpoint('/Measurable/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.measurable1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('class');
                    expect(res).to.have.property('name');
                    //expect(res).to.have.property('materials').with.members([ initial.materialType1.id]);
                }));
            });
        });

        describeEndpoint('/Measurable/{id}/materials', ['GET'], () => {
            withValidPathParams(()=>({id: initial.measurable1.id}), () => {
                GET("returns materials",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/Measurable/{id}/locations', ['GET'], () => {
            withValidPathParams(()=>({id: initial.measurable1.id}), () => {
                GET("returns locations",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/Measurable/{id}/effects', ['GET'], () => {
            withValidPathParams(()=>({id: initial.measurable1.id}), () => {
                GET("returns effects",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/Measurable/{id}/causes', ['GET'], () => {
            withValidPathParams(()=>({id: initial.measurable1.id}), () => {
                GET("returns causes",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Causality', () => {


        describeEndpoint('/Causality/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.causality1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('class');
                    //expect(res).to.have.property('cause').that.equals(initial.measurable1.id);
                    //expect(res).to.have.property('effect').that.equals(initial.measurable2.id);
                }));
            });
        });
    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    //Lyph - copy from selected test


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Node', () => {


        describeEndpoint('/Node/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.node1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('class');
                    //expect(res).to.have.property('measurables').with.members([initial.measurable1.id]);
                    //expect(res).to.have.property('outgoingProcesses');
                    //expect(res).to.have.property('incomingProcesses');
                    //expect(res).to.have.property('channels');
                    //expect(res).to.have.property('locations').with.members( [initial.mainLyph1.id]);
                }));
            });
        });

        describeEndpoint('/Node/{id}/outgoingProcesses', ['GET'], () => {
            withValidPathParams(()=>({id: initial.node1.id}), () => {
                GET("returns outgoing processes",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/Node/{id}/incomingProcesses', ['GET'], () => {
            withValidPathParams(()=>({id: initial.node1.id}), () => {
                GET("returns incoming processes",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/Node/{id}/channels', ['GET'], () => {
            withValidPathParams(()=>({id: initial.node1.id}), () => {
                GET("returns channels",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/Node/{id}/locations', ['GET'], () => {
            withValidPathParams(()=>({id: initial.node1.id}), () => {
                GET("returns locations",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Process', () => {


        describeEndpoint('/Process/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.process1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('class');
                    expect(res).to.have.property('transportPhenomenon').that.equals("advection")//,
                    // expect(res).to.have.property('sourceLyph').that.equals(initial.lyph1.id);
                    // expect(res).to.have.property('targetLyph').that.equals(initial.lyph2.id);
                    // expect(res).to.have.property('conveyingLyph').with.members([initial.mainLyph1.id]);
                }));
            });
        });

        describeEndpoint('/Process/{id}/conveyingLyph', ['GET'], () => {
            withValidPathParams(()=>({id: initial.process1.id}), () => {
                GET("returns outgoing processes",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/Process/{id}/materials', ['GET'], () => {
            withValidPathParams(()=>({id: initial.process1.id}), () => {
                GET("returns materials",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/Process/{id}/channels', ['GET'], () => {
            withValidPathParams(()=>({id: initial.process1.id}), () => {
                GET("returns channels",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/Process/{id}/segments', ['GET'], () => {
            withValidPathParams(()=>({id: initial.process1.id}), () => {
                GET("returns segments",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Group', () => {


        describeEndpoint('/Group/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.group1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('class');
                    expect(res).to.have.property('name');
                    //expect(res).to.have.property('elements').with.members([ initial.lyph1.id, initial.node1.id]);
                }));
            });
        });

        describeEndpoint('/Group/{id}/elements', ['GET'], () => {
            withValidPathParams(()=>({id: initial.group1.id}), () => {
                GET("returns elements",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('CanonicalTree', () => {


        describeEndpoint('/CanonicalTree/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.canonicalTree1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('class');
                    expect(res).to.have.property('name');
                    //expect(res).to.have.property('childBranches');
                }));
            });
        });

        describeEndpoint('/CanonicalTree/{id}/childBranches', ['GET'], () => {
            withValidPathParams(()=>({id: initial.canonicalTree1.id}), () => {
                GET("returns tree branches",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Publication', () => {


        describeEndpoint('/Publication/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.publication1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('class');
                    expect(res).to.have.property('name');
                }));
            });
        });

        // describeEndpoint('Publication/{id}/correlations', ['GET'], () => {
        describeEndpoint('/Publication/{id}/correlations', ['GET'], () => {
            withValidPathParams(()=>({id: initial.publication1.id}), () => {
                GET("returns correlations",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('ClinicalIndex', () => {


        describeEndpoint('/ClinicalIndex/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.clinicalIndex2.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('class');
                    expect(res).to.have.property('name');
                }));
            });
        });

        // describeEndpoint('ClinicalIndex/{id}/children', ['GET'], () => {
        describeEndpoint('/ClinicalIndex/{id}/children', ['GET'], () => {
            withValidPathParams(()=>({id: initial.clinicalIndex1.id}), () => {
                GET("returns clinical indices",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    describeResourceClass('Correlation', () => {

        describeEndpoint('/Correlation/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.correlation1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('class');
                    //expect(res).to.have.property('publication').that.equals(initial.publication1.id);
                    //expect(res).to.have.property('clinicalIndices').with.members([initial.clinicalIndex1.id, initial.clinicalIndex2.id]);
                    //expect(res).to.have.property('measurables').with.members([initial.measurable1.id, initial.measurable2.id]);
                }));
            });
        });

        describeEndpoint('/Correlation/{id}/measurables', ['GET'], () => {
            withValidPathParams(()=>({id: initial.correlation1.id}), () => {
                GET("returns measurables",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/Correlation/{id}/clinicalIndices', ['GET'], () => {
            withValidPathParams(()=>({id: initial.correlation1.id}), () => {
                GET("returns clinical indices",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Coalescence', () => {

        describeEndpoint('/Coalescence/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.coalescence1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('class');
                    //expect(res).to.have.property('lyphs').with.members([initial.lyph1.id, initial.lyph2.id]);
                }));
            });
        });

        describeEndpoint('/Coalescence/{id}/lyphs', ['GET'], () => {
            withValidPathParams(()=>({id: initial.coalescence1.id}), () => {
                GET("returns lyphs",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/Coalescence/{id}/scenarios', ['GET'], () => {
            withValidPathParams(()=>({id: initial.coalescence1.id}), () => {
                GET("returns scenarios",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('CoalescenceScenario', () => {

        describeEndpoint('/CoalescenceScenario/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.coalescenceScenario1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('class');
                    //expect(res).to.have.property('lyphs').with.members([initial.mainLyph1.id, initial.mainLyph2.id]);
                }));
            });
        });

        describeEndpoint('/CoalescenceScenario/{id}/lyphs', ['GET'], () => {
            withValidPathParams(()=>({id: initial.coalescenceScenario1.id}), () => {
                GET("returns lyphs",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Type', () => {


        describeEndpoint('/Type/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            //TODO uncomment when materialType1 is created
            withValidPathParams(()=>({id: initial.materialType1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('class');
                    expect(res).to.have.property('name');
                    //expect(res).to.have.property('definition').that.equals(initial.material1.id);
                }));

            });
        });

        describeEndpoint('/Type/{id}/subtypes', ['GET'], () => {
            withValidPathParams(()=>({id: initial.materialType1.id}), () => {
                GET("returns subtypes",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/Type/{id}/supertypes', ['GET'], () => {
            withValidPathParams(()=>({id: initial.materialType2.id}), () => {
                GET("returns supertypes",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });

    });

    //////////////////////////////
    /* Test abstract resources */
    /////////////////////////////
    describeResourceClass('Resource', () => {

        describeEndpoint(`/Resource`, ['GET', 'POST'], () => {
            withValidPathParams(()=>{}, () => {
                GET("returns resources", r=>r.expect(OK).expect(isArray).resources((resources) =>  {
                    for (let res of resources) {
                        expect(res).to.have.property('id');
                        expect(res).to.have.property('class');
                    }
                }));
            });
        });

        describeEndpoint('/Resource/{id}', ['GET', 'POST', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withValidPathParams(()=>({id: initial.externalResource1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('class').that.equals(initial.externalResource1.class);
                    expect(res).to.have.property('name');
                }));
            });
        });

        describeEndpoint('/Resource/{id}/externals', ['GET', 'POST'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns externals",  r=>r.expect(OK).expect(isArray).resources((resources) => {
                    for (let res of resources) {
                        expect(res).to.have.property('id');
                        expect(res).to.have.property('class').that.equals("ExternalResource");
                    }
                }));
            });
        });

        // describeEndpoint('/Resource/{id}/themes', ['GET', 'POST'], () => {
        //     withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
        //         GET("returns themes",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
        //     });
        // }); // NOTE: themes are not available as of this writing

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('Template', () => {

        describeEndpoint('/Template/{id}', ['GET', 'POST', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('class');
                    expect(res).to.have.property('name');
                    expect(res).to.have.property('cardinalityBase');
                    expect(res).to.have.property('species');
                }));
            });
        });

        describeEndpoint('/Template/{id}/cardinalityMultipliers', ['GET', 'POST'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns cardinality multipliers",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/Template/{id}/types', ['GET', 'POST'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns types",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/Template/{id}/children', ['GET', 'POST'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns children",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });
        describeEndpoint('/Template/{id}/parents', ['GET', 'POST'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns parents",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('NodeLocation', () => {

        describeEndpoint('/NodeLocation/{id}', ['GET', 'POST', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('class');
                    expect(res).to.have.property('name');
                    expect(res).to.have.property('cardinalityBase');
                }));
            });
        });

        describeEndpoint('/NodeLocation/{id}/nodes', ['GET', 'POST'], () => {
            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {
                GET("returns nodes",  r=>r.expect(OK).expect(isArray).resources((resources) => {}));
            });
        });

    });


    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    describeResourceClass('MeasurableLocation', () => {

        describeEndpoint('/MeasurableLocation/{id}', ['GET', 'POST', 'DELETE'], () => {

            withValidPathParams(()=>({id: initial.node1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');
                    expect(res).to.have.property('class');
                    expect(res).to.have.property('cardinalityBase');
                }));
            });
        });

        describeEndpoint('/MeasurableLocation/{id}/measurables', ['GET', 'POST'], () => {
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




