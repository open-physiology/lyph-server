////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* external libs */
import isUndefined from 'lodash-bound/isUndefined';
import isEmpty     from 'lodash-bound/isEmpty';
import cloneDeep   from 'lodash-bound/cloneDeep';
import camelCase   from 'lodash-bound/camelCase';

/* local stuff */
import {resourceClasses} from './utils/utility.es6.js';
import {OK, CREATED, NO_CONTENT} from './http-status-codes.es6.js';

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// utilities                                                                                                          //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const $ref = (className) => ({ $ref: `#/definitions/${className}` });

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// swagger data types                                                                                                 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let swaggerDataTypes = {};

//Creates definitions for resources (assuming that any entry in manifest is one of those)
for (let [className, cls] of Object.entries(resourceClasses)) {

    let xTag = (cls.isResource)? 'x-resource-type': 'x-other-type';

    let exposedRelationshipShortcuts = cls.relationshipShortcuts? cls.relationshipShortcuts: {};
    let allExposedFields = {...cls.properties, ...exposedRelationshipShortcuts};

    function replaceProperties(properties){
        for (let prop of Object.values(properties)) {
            delete prop.default;
            delete prop.key;
            if (prop.required) {
                prop['x-required'] = prop.required;
                delete prop.required;
            }
            if (prop.readonly) {
                prop['readOnly'] = prop.readonly;
                delete prop.readonly;
            }
            if (prop.patternProperties){
                prop['x-patternProperties'] = prop.patternProperties;
                delete prop.patternProperties;
            }
            //Select required fields from inline models
            if (prop.properties){
                let required = [];
                for (let [key, value] of Object.entries(prop.properties)){
                    if (value.required) { required.push(key) }
                    delete value.required;
                }
                if (required.length > 0){
                    prop['required'] = required;
                }
            }
        }
        for (let [fieldName, fieldSpec] of Object.entries(exposedRelationshipShortcuts)) {
            if (properties[fieldName]::isEmpty()) {
                if (fieldSpec.cardinality.max === 1) {
                    properties[fieldName] = {
                        type: "integer"
                    }
                }
                else {
                    properties[fieldName] = {
                        type: "array",
                        items: {
                            type: "integer"
                        },
                        uniqueItems: true
                    }
                }
            }
        }
        return properties;
    }

    swaggerDataTypes[className] = {
		type:       'object',
		properties: (() => { return replaceProperties(allExposedFields::cloneDeep()); })()
	};

    swaggerDataTypes[className][xTag] = cls.name;

	let required = Object.entries(allExposedFields)
			.filter(([fieldName, {'required': required}]) => required)
			.map(([fieldName]) => fieldName);


	if (required.length > 0) { swaggerDataTypes[className].required = required; }

	swaggerDataTypes[`partial_${className}`] = {
		// partial = allow required fields to be absent for update commands
		type: 'object',
		properties: (() => { return replaceProperties(allExposedFields::cloneDeep()); })()
	};
    swaggerDataTypes[`partial_${className}`][xTag] = cls.name;

}

let resourceEndpoints = {};
let operationEndpoints = {};

///////////////////////////////////////////
//Resource endpoints
///////////////////////////////////////////

function addResourceEndpoint(cls) {

    const {singular, plural, abstract} = cls;

	resourceEndpoints[`/${cls.name}`] = {
		'x-path-type': 'resources',
		'x-resource-type': cls.name,
		get: {
			summary: `retrieve all ${plural}`,
			responses: {
				[OK]: {
					description: `an array containing all ${plural}`,
					schema: { type: 'array', items: $ref(cls.name) }
				}
			}
		},
		...(abstract || {
			post: {
				summary: `create a new ${singular}`,
				parameters: [{
					name:        `new ${singular}`::camelCase(),
					in:          'body',
					description: `the new ${singular} to create`,
					required:    true,
					schema:      $ref(cls.name)
				}],
				responses: {
					[CREATED]: {
						description: `an array containing one element: the newly created ${singular}`,
						schema: { type: 'array', items: $ref(cls.name), minItems: 1, maxItems: 1 }
					}
				}
			}
		})
	};

}


function addSpecificResourceEndpoint(cls) {

    const {singular, plural, abstract} = cls;

    const singularIdKey = `${singular::camelCase()}ID`;

    resourceEndpoints[`/${cls.name}/{${singularIdKey}}`] = {
        'x-path-type': 'specificResources',
        'x-resource-type': cls.name,
        'x-param-map': {
            id: singularIdKey,
            ids: singularIdKey
        },
        get: {
            summary: `retrieve ${plural} by id`,
            parameters: [{
                name: singularIdKey,
                in: 'path',
                description: `IDs of the ${plural} to retrieve`,
                required: true,
                type: 'array',
                items: { type: 'number' },
                collectionFormat: 'csv'
            }],
            responses: {
                [OK]: {
                    description: `an array containing the requested ${plural} in matching order`,
                    schema: { type: 'array', items: $ref(cls.name), minItems: 1, maxItems: 1 }
                }
            }
        },
        post: {
            summary: `update a given ${singular}`,
            parameters: [{
                name:        singularIdKey,
                in:          'path',
                description: `ID of the ${singular} to update`,
                required:    true,
                type:        'integer'
            }, {
                name:        `new ${singular}`::camelCase(),
                in:          'body',
                description: `a (partial) ${singular} object with the data that should be updated`,
                required:    true,
                schema:      $ref(`partial_${cls.name}`)
            }],
            responses: {
                [OK]: {
                    description: `an array containing one element: the full ${singular} after the update`,
                    schema: { type: 'array', items: $ref(cls.name), minItems: 1, maxItems: 1 }
                }
            }
        },
        delete: {
            summary: `delete a given ${singular}`,
            parameters: [{
                name:        singularIdKey,
                in:          'path',
                description: `ID of the ${singular} to delete`,
                required:    true,
                type:        'integer'
            }],
            responses: {
                [NO_CONTENT]: {
                    description: `successfully deleted the ${singular}`
                }
            }
        },
        ...(abstract || {
            put: {
                summary: `replace a given ${singular}`,
                parameters: [{
                    name:        singularIdKey,
                    in:          'path',
                    description: `ID of the ${singular} to replace`,
                    required:    true,
                    type:        'integer'
                }, {
                    name:        `new ${singular}`::camelCase(),
                    in:          'body',
                    description: `the new ${singular} to replace the old one with`,
                    required:    true,
                    schema:      $ref(cls.name)
                }],
                responses: {
                    [OK]: {
                        description: `an array containing one element: the full ${singular} after the replacement`,
                        schema: { type: 'array', items: $ref(cls.name), minItems: 1, maxItems: 1 }
                    }
                }
            },
        })
    };
}


function addRelatedResourceEndpoint(relA) {

    const {getSummary, putSummary, deleteSummary} = relA;

    const pluralA       = relA.resourceClass.plural;
    const singularA 	= relA.resourceClass.singular;
    const pluralB   	= relA.codomain.resourceClass.plural;

    const singularIdKeyA = `${singularA::camelCase()}ID`;

    let fieldNames = [relA.keyInResource];
    if (!relA.shortcutKey::isUndefined()) {
        fieldNames.push(relA.shortcutKey);
    }

    for (let fieldName of fieldNames) {
        resourceEndpoints[`/${relA.resourceClass.name}/{${singularIdKeyA}}/${fieldName}`] = {
            'x-path-type': 'relatedResources',
            'x-param-map': {
                idA: singularIdKeyA,
                [(relA.keyInRelationship === 1) ? 'id1' : 'id2']: singularIdKeyA
            },
            'x-resource-type': relA.resourceClass.name,
            'x-relationship-type': relA.keyInResource,
            get: {
                summary: getSummary || `retrieve all the ${pluralB} of a given ${singularA}`,
                parameters: [
                    {
                        name: singularIdKeyA,
                        in: 'path',
                        description: `ID of the ${singularA} of which to retrieve the ${pluralB}`,
                        required: true,
                        type: 'integer'
                    }
                ],
                responses: {
                    [OK]: {
                        description: `an array containing the ${pluralB} of the given ${singularA}`,
                        schema: {type: 'array', items: $ref(relA.codomain.resourceClass.name)}
                    }
                }
            }
            //TODO add delete
        };
    }
}


function addSpecificRelatedResourceEndpoint(relA) {

    const {getSummary, putSummary, postSummary, deleteSummary, abstract} = relA;

    const pluralA       = relA.resourceClass.plural;
    const singularA 	= relA.resourceClass.singular;
    const pluralB   	= relA.codomain.resourceClass.plural;
    const singularB 	= relA.codomain.resourceClass.singular;

    const singularIdKeyA = `${singularA::camelCase()}ID`;
    const singularIdKeyB = `${((relA.resourceClass === relA.codomain.resourceClass? "other " : "") + singularB)::camelCase()}ID`;

    const msg = relA.resourceClass === relA.codomain.resourceClass? pluralA: singularA + " and " + singularB;

    let fieldNames = [relA.keyInResource];
    if (!relA.shortcutKey::isUndefined()) {
        fieldNames.push(relA.shortcutKey);
    }

    for (let fieldName of fieldNames) {
        resourceEndpoints[`/${relA.resourceClass.name}/{${singularIdKeyA}}/${fieldName}/{${singularIdKeyB}}`] = {
            'x-path-type': 'specificRelatedResource',
            'x-param-map': {
                idA: singularIdKeyA,
                idB: singularIdKeyB,
                [(relA.keyInRelationship === 1) ? 'id1' : 'id2']: singularIdKeyA,
                [(relA.keyInRelationship === 1) ? 'id2' : 'id1']: singularIdKeyB
            },
            'x-resource-type': relA.resourceClass.name,
            'x-relationship-type': relA.keyInResource,
            put: {
                summary: putSummary || `add a given ${singularB} to a given ${singularA}`,
                parameters: [
                    {
                        name: singularIdKeyA,
                        in: 'path',
                        description: `ID of the ${singularA} to which the ${singularB} is added`,
                        required: true,
                        type: 'integer'
                    }, {
                        name: singularIdKeyB,
                        in: 'path',
                        description: `ID of the ${singularB} which is added to the given ${singularA}`,
                        required: true,
                        type: 'integer'
                    }
                ],
                responses: {
                    [NO_CONTENT]: {
                        description: `successfully added the relationship with the ${singularB}`
                    }
                }
            },
            delete: {
                summary: deleteSummary || `remove a ${singularB} from a given ${singularA}`,
                parameters: [
                    {
                        name: singularIdKeyA,
                        in: 'path',
                        description: `ID of the ${singularA} from which to remove the '${fieldName}' ${singularB}`,
                        required: true,
                        type: 'integer'
                    }, {
                        name: singularIdKeyB,
                        in: 'path',
                        description: `ID of the '${fieldName}' ${singularB} to remove from the given ${singularA}`,
                        required: true,
                        type: 'integer'
                    }
                ],
                responses: {
                    [NO_CONTENT]: {
                        description: `successfully removed the ${singularB}`
                    }
                }
            }
        }
    }
}

////////////////////////////////////////////////////////////////
//Advanced operations: batch processing, search
////////////////////////////////////////////////////////////////

function addOperationEndpoints() {
    operationEndpoints['/clear'] = {
        'x-path-type': 'clear',
        post: {
            summary: "Clears the database.",
            responses: {
                [NO_CONTENT]: {
                    description: `successfully deleted all entities`
                }
            }
        }
    };
}

////////////////////////////////////////////////////////////////

for (let resource of Object.values(resourceClasses)) {
    addResourceEndpoint(resource);
    addSpecificResourceEndpoint(resource);
    for (let rel of Object.values(resource.relationships)){
        addRelatedResourceEndpoint(rel);
        addSpecificRelatedResourceEndpoint(rel);
    }
}
addOperationEndpoints();

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// final Swagger spec                                                                                                 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import config from './config.es6.js';

export default {
	swagger: '2.0',
	info: {
		title: "Open Physiology Lyph Server",
		description: "REST API for anatomical lyph systems and related constructs",
		version: '1'
	},
	host: `${config['host']}:${config['port']}`,
	consumes: ['application/json'],
	produces: ['application/json'],
	definitions: {
		...swaggerDataTypes
	},
	paths: {
        ...operationEndpoints,
        ...resourceEndpoints
	}
};
