/**
 * Created by Natallia on 12/1/2016.
 */
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import _, {template, isString, isFunction, isArray, isUndefined} from 'lodash';
import {expect} from 'chai';
import {initial, describeResourceClass, describeEndpoint,
    GET, POST, PUT, DELETE,
    withInvalidPathParams, withValidPathParams,
    requestSingleResource} from './testUtils.es6.js';

import {model} from '../resources.es6.js';
import {OK, NO_CONTENT} from "../http-status-codes.es6";

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
export function testResources() {

    describeResourceClass('ExternalResource', () => {

        let newExternalResource = async () => {
            let newRes = model.ExternalResource.new({
                name: "Right fourth dorsal metatarsal vein",
                uri: "http://purl.obolibrary.org/obo/FMA_44515",
                type: "fma"
            });
            await newRes.commit();
            return _(newRes.fields).mapValues((val) => (val.value)).value();
        };
        describeEndpoint('/externalResources', ['GET', 'POST']);

        describeEndpoint('/externalResources/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.border1.id}));

            withValidPathParams(()=>({id: initial.externalResource1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    //{ ...idSchema,         readonly: true },
                    expect(res).to.have.property('href');  //{ ...uriSchema,        readonly: true },
                    expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
                    expect(res).to.have.property('name');  //{ type: 'string' }
                    expect(res).to.have.property('uri');   //{ ...uriSchema, required: true },
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

                //TODO: why bad request?
                // PUT("replace a given external resource", r=>r.send(
                //     newExternalResource
                // ).expect(OK).then(async() => {
                //     let res = await requestSingleResource(`/externalResources/${newExternalResource.id}`);
                //     expect(res).to.have.property('name').that.equals("Right fourth dorsal metatarsal vein");
                // }));

                //DELETE("delete a given external resource", r=>r.expect(NO_CONTENT));
            });

            describeEndpoint('/externalResources/{externalResourceID}/locals', ['GET', 'POST'], () => {
                withValidPathParams(()=>({externalResourceID: initial.externalResource1.id}), () => {
                    GET("returns locals", r =>r.expectArrayWith((res) => {
                            expect(res).to.have.property('id');    //{ ...idSchema,         readonly: true },
                            expect(res).to.have.property('href');  //{ ...uriSchema,        readonly: true },
                            expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
                        })
                    );
                });
            });
        });

    });

    //
    // ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    describeResourceClass('Border', () => {

        describeEndpoint('/borders', ['GET', 'POST']);

        describeEndpoint('/borders/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

            withValidPathParams(()=>({id: initial.border1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');     //{ ...idSchema,         readonly: true },
                    expect(res).to.have.property('href');   //{ ...uriSchema,        readonly: true },
                    expect(res).to.have.property('class');  //{ ...identifierSchema, readonly: true },
                    expect(res).to.have.property('nature'); //{ ...},
                }));
            });
        });
    });

    //
    // ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    describeResourceClass('Material', () => {

        describeEndpoint('/materials', ['GET', 'POST']);

        describeEndpoint('/materials/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

            withValidPathParams(()=>({id: initial.material1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    //{ ...idSchema,         readonly: true },
                    expect(res).to.have.property('href');  //{ ...uriSchema,        readonly: true },
                    expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
                    expect(res).to.have.property('name');  //{ type: 'string' }
                }));
            });
        });
    });

    //
    // ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //

    describeResourceClass('Measurable', () => {

        describeEndpoint('/measurables', ['GET', 'POST']);

        describeEndpoint('/measurables/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

            withValidPathParams(()=>({id: initial.measurable1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id'); //{ ...idSchema,         readonly: true },
                    expect(res).to.have.property('href'); //{ ...uriSchema,        readonly: true },
                    expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
                    expect(res).to.have.property('name'); //{ type: 'string' }
                    //expect(res).to.have.property('materials').with.members([ initial.materialType1.id]);
                }));
            });
        });
    });

    //
    // ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //

    describeResourceClass('Causality', () => {

        describeEndpoint('/causalities', ['GET', 'POST']);

        describeEndpoint('/causalities/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

            withValidPathParams(()=>({id: initial.causality1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id'); //{ ...idSchema,         readonly: true },
                    expect(res).to.have.property('href'); //{ ...uriSchema,        readonly: true },
                    expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
                    expect(res).to.have.property('cause').that.equals(initial.measurable1.id);
                    expect(res).to.have.property('effect').that.equals(initial.measurable2.id);
                }));
            });
        });
    });

    //
    // ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //

    describeResourceClass('Lyph', () => {

        describeEndpoint('/lyphs', ['GET', 'POST']);

        describeEndpoint('/lyphs/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

            withValidPathParams(()=>({id: initial.mainLyph1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id'); //{ ...idSchema,         readonly: true },
                    expect(res).to.have.property('href'); //{ ...uriSchema,        readonly: true },
                    expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
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
                    //segments
                    //patches
                    //coalecences
                    //in/out/- processes
                    //nodes
                    //expect(res).to.have.property('materials'          ).with.members([ initial.materialType1.id]);
                    expect(res).to.have.property('measurables').with.members([initial.measurable1.id]);
                }));
            });
        });
    });

    //
    // ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //

    // describeResourceClass('Process', () => {
    //
    //     describeEndpoint('/processes', ['GET', 'POST']);
    //
    //     describeEndpoint('/processes/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {
    //
    //         withInvalidPathParams("non-existing", {id: 999999});
    //
    //         withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));
    //
    //         withValidPathParams(()=>({id: initial.process1.id}), () => {
    //
    //             GET("returns a resource with expected fields", r=>r.resource((res) => {
    //                 expect(res).to.have.property('id'); //{ ...idSchema,         readonly: true },
    //                 expect(res).to.have.property('href'); //{ ...uriSchema,        readonly: true },
    //                 expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
    //                 expect(res).to.have.property('transportPhenomenon').that.equals("advection"),
    //                     expect(res).to.have.property('sourceLyph').that.equals(initial.lyph1.id);
    //                 expect(res).to.have.property('targetLyph').that.equals(initial.lyph2.id);
    //                 expect(res).to.have.property('conveyingLyph').with.members([initial.mainLyph1.id]);
    //             }));
    //         });
    //     });
    // });

    //
    // ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //

    describeResourceClass('Group', () => {

        describeEndpoint('/groups', ['GET', 'POST']);

        describeEndpoint('/groups/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

            withValidPathParams(()=>({id: initial.group1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    //{ ...idSchema,         readonly: true },
                    expect(res).to.have.property('href');  //{ ...uriSchema,        readonly: true },
                    expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
                    expect(res).to.have.property('name');  //{ type: 'string' }
                    //expect(res).to.have.property('elements').with.members([ initial.lyph1.id, initial.node1.id, initial.process1.id ]);
                }));
            });
        });
    });


    //
    // ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //

    describeResourceClass('OmegaTree', () => {

        describeEndpoint('/omegaTrees', ['GET', 'POST']);

        describeEndpoint('/omegaTrees/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

            withValidPathParams(()=>({id: initial.omegaTree1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    //{ ...idSchema,         readonly: true },
                    expect(res).to.have.property('href');  //{ ...uriSchema,        readonly: true },
                    expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
                    expect(res).to.have.property('name');  //{ type: 'string' }
                    //expect(res).to.have.property('parts').with.members([ initial.lyph1.id, initial.lyph2.id, initial.lyph3.id ]);
                }));
            });
        });
    });

    //
    // ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //

    describeResourceClass('Publication', () => {

        describeEndpoint('/publications', ['GET', 'POST']);

        describeEndpoint('/publications/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

            withValidPathParams(()=>({id: initial.publication1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    //{ ...idSchema,         readonly: true },
                    expect(res).to.have.property('href');  //{ ...uriSchema,        readonly: true },
                    expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
                    expect(res).to.have.property('name');  //{ type: 'string' }
                }));
            });
        });
    });

    //
    // ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //

    describeResourceClass('ClinicalIndex', () => {

        describeEndpoint('/clinicalIndices', ['GET', 'POST']);

        describeEndpoint('/clinicalIndices/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

            withValidPathParams(()=>({id: initial.clinicalIndex2.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    //{ ...idSchema,         readonly: true },
                    expect(res).to.have.property('href');  //{ ...uriSchema,        readonly: true },
                    expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
                    expect(res).to.have.property('name');  //{ type: 'string' }
                    expect(res).to.have.property('parent').that.equals(initial.clinicalIndex1.id);
                }));
            });
        });
    });

    //
    // ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //

    describeResourceClass('Correlation', () => {

        describeEndpoint('/correlations', ['GET', 'POST']);

        describeEndpoint('/correlations/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

            withValidPathParams(()=>({id: initial.correlation1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    //{ ...idSchema,         readonly: true },
                    expect(res).to.have.property('href');  //{ ...uriSchema,        readonly: true },
                    expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
                    expect(res).to.have.property('publication').that.equals(initial.publication1.id);
                    expect(res).to.have.property('clinicalIndices').with.members([initial.clinicalIndex1.id, initial.clinicalIndex2.id]);
                    expect(res).to.have.property('measurables').with.members([initial.measurable1.id, initial.measurable2.id]);
                }));
            });
        });
    });

    //
    // ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //

    describeResourceClass('Coalescence', () => {

        describeEndpoint('/coalescences', ['GET', 'POST']);

        describeEndpoint('/coalescences/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

            withValidPathParams(()=>({id: initial.coalescence1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    //{ ...idSchema,         readonly: true },
                    expect(res).to.have.property('href');  //{ ...uriSchema,        readonly: true },
                    expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
                    expect(res).to.have.property('lyphs').with.members([initial.lyph1.id, initial.lyph2.id]);
                }));
            });
        });
    });

    //
    // ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //

    describeResourceClass('CoalescenceScenario', () => {

        describeEndpoint('/coalescenceScenarios', ['GET', 'POST']);

        describeEndpoint('/coalescenceScenarios/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

            withValidPathParams(()=>({id: initial.coalescenceScenario1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    //{ ...idSchema,         readonly: true },
                    expect(res).to.have.property('href');  //{ ...uriSchema,        readonly: true },
                    expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
                    expect(res).to.have.property('lyphs').with.members([initial.mainLyph1.id, initial.mainLyph2.id]);
                }));
            });
        });
    });

    //
    // ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //

    describeResourceClass('Type', () => {

        describeEndpoint('/types', ['GET', 'POST']);

        describeEndpoint('/types/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {

            withInvalidPathParams("non-existing", {id: 999999});

            withInvalidPathParams("wrong-class", ()=>({id: initial.externalResource1.id}));

            withValidPathParams(()=>({id: initial.materialType1.id}), () => {

                GET("returns a resource with expected fields", r=>r.resource((res) => {
                    expect(res).to.have.property('id');    //{ ...idSchema,         readonly: true },
                    expect(res).to.have.property('href');  //{ ...uriSchema,        readonly: true },
                    expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
                    expect(res).to.have.property('name');  //{ type: 'string' }
                    expect(res).to.have.property('definition').that.equals(initial.material1.id);
                }));

            });
        });
    });
}




