/**
 * Created by Natallia on 12/4/2016.
 */
/**
 * Created by Natallia on 12/1/2016.
 */
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import {template, isString, isFunction, isArray, isUndefined} from 'lodash';
import {expect} from 'chai';
import {initial, describeResourceClass, describeEndpoint,
    GET, POST, PUT, DELETE,
    withInvalidPathParams, withValidPathParams} from './testUtils.es6.js';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
export function testRelationships() {

    //test that endpoints for all relationships exist
    for (let className of [
        // "Causes",
        // "Coalesces",
        // "CoalescesLike",
        // "ContainsArtefact",
        // "ContainsArtefact_00",
        // "ContainsArtefact_10",
        // "ContainsArtefact_11",
        // "ContainsArtefact_20",
        // "ContainsArtefact_21",
        // "ContainsArtefact_22",
        // "ContainsMaterial",
        // "ContainsNode",
        // "ConveysProcess",
        // "CorrespondsTo",
        // "EncompassesClinicalIndex",
        // "FlowsTo",
        // "Has",
        // "HasAsRoot",
        // "HasAxis",
        "HasBorder",
        // "HasCardinalityMultipliedByThatOf",
        // "HasChannel",
        "HasLayer" //,
        // "HasLongitudinalBorder",
        // "HasMeasurable",
        // "HasPart",
        // "HasPatch",
        // "HasRadialBorder",
        // "HasSegment",
        // "HasTreeChildren",
        // "HasTreePart",
        // "HasType",
        // "IncludesElement",
        // "InvolvesClinicalIndex",
        // "InvolvesMeasurable",
        // "InvolvesPublication",
        // "IsExternallyRelatedTo",
        // "IsRelatedTo",
        // "IsSubtypeOf",
        // "JoinsLyph",
        // "MeasuresMaterial",
        // "PrescribesStyleFor",
        // "PresentsModel",
        // "PullsIntoTypeDefinition",
        // "TransportsMaterial",
        // "provisional_FlowsTo"
    ]){
        describeResourceClass(className, () => {
            describeEndpoint(`/${className}`, ['GET', 'POST']);

            describeEndpoint(`/${className}/{id}`, ['GET', 'POST', 'PUT', 'DELETE'], () => {

                withInvalidPathParams("non-existing", {id: 999999});

                withInvalidPathParams("wrong-class", ()=>({id: initial.border1.id}));
            });
        });
    }


    describeResourceClass('HasLayer', () => {

        // describeEndpoint('/HasLayer/{id}', ['GET', 'POST', 'PUT', 'DELETE'], () => {
        //
        //     withInvalidPathParams("non-existing", {id: 999999});
        //
        //     withInvalidPathParams("wrong-class", ()=>({id: initial.border1.id}));
        //
        //     withValidPathParams(()=>({id: [...initial.mainLyph1["-->HasLayer"]][0].id}), () => {
        //
        //         GET("returns a relationship with expected fields", r=>r.resource((res) => {
        //             expect(res).to.have.property('id');    //{ ...idSchema,         readonly: true },
        //             expect(res).to.have.property('href');  //{ ...uriSchema,        readonly: true },
        //             expect(res).to.have.property('class'); //{ ...identifierSchema, readonly: true },
        //             expect(res).to.have.property('name');  //{ type: 'string' }
        //         }));
        //     });
        // });
    });



}



