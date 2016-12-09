////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* external libs */
import _, {isUndefined} from 'lodash';
import cloneDeep from 'lodash/cloneDeep';
import pick from 'lodash/pick';

/* local stuff */
import {toCamelCase} from './utility.es6.js';
import {resources, relationships, algorithms, model} from './resources.es6.js';
import {
	OK,
	CREATED,
	NO_CONTENT,
	NOT_FOUND,
	PRECONDITION_FAILED,
	INTERNAL_SERVER_ERROR
} from './http-status-codes.es6.js';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// utilities                                                                                                          //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//NK TODO: remove overriding of specific types
//Reason: model library exports Type but uses secific types, e.g., MaterialType in relationships
//This causes a problem with generated Swagger end points
const $ref = (className) => (
	(className.indexOf("Type") > -1)?
		  { $ref: `#/definitions/Type`}
		: { $ref: `#/definitions/${className}` }
	);

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// swagger data types                                                                                                 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let swaggerDataTypes = {};

//Creates definitions for resources and relationships (assuming that any entry in manifest is one of those)
for (let [className, cls] of Object.entries(model)) {

    let xTag = (cls.isResource)? 'x-resource-type': 'x-relationship-type';

    function replaceProperties(properties){
        for (let prop of Object.values(properties)) {
            delete prop.default;
            delete prop.key;
            if (prop.readonly) {
                prop['x-readonly'] = prop.readonly;
                delete prop.readonly;
            }
            if (prop.patternProperties){
                prop['x-patternProperties'] = prop.patternProperties;
                delete prop.patternProperties;
            }
        }
        return properties;
    }

	swaggerDataTypes[className] = {
		type:       'object',
		properties: (() => { return replaceProperties(cloneDeep(cls.properties)); })()
	};
    swaggerDataTypes[className][xTag] = cls.name;

	let required = [...Object.entries(cls.properties)]
			.filter(([fieldName, {'x-required': required}]) => required)
			.map(([fieldName]) => fieldName);

	if (required.length > 0) { swaggerDataTypes[className].required = required; }

	swaggerDataTypes[`partial_${className}`] = {
		// partial = allow required fields to be absent for update commands
		type: 'object',
		properties: (() => { return replaceProperties(cloneDeep(cls.properties)); })()
	};
    swaggerDataTypes[`partial_${className}`][xTag] = cls.name;

}

let resourceEndpoints = {};
let relationshipEndpoints = {};
const FORWARD  = Symbol('FORWARD' );
const BACKWARD = Symbol('BACKWARD');

///////////////////////////////////////////
//Resource endpoints
///////////////////////////////////////////

function addResourceEndpoint(cls) {

    const {singular, plural, abstract} = cls;
	const pluralKey     = toCamelCase(plural);

	resourceEndpoints[`/${pluralKey}`] = {
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
					name:        toCamelCase(`new ${singular}`),
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

    const singularIdKey = `${toCamelCase(singular)}ID`;
    const pluralKey     = toCamelCase(plural);

    resourceEndpoints[`/${pluralKey}/{${singularIdKey}}`] = {
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
                name:        toCamelCase(`new ${singular}`),
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
                    name:        toCamelCase(`new ${singular}`),
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


function addRelatedResourceEndpoint(cls, i, direction) {
	const relA = cls.domainPairs[i][(direction === FORWARD)? 1: 2];
	const relB = cls.domainPairs[i][(direction === FORWARD)? 2: 1];

    const fieldName = relA.shortcutKey;
    if (isUndefined(fieldName)) return;

    const {getSummary, putSummary, deleteSummary} = relA;

    const pluralA       = relA.resourceClass.plural;
    const singularA 	= relA.resourceClass.singular;
    const pluralB   	= relB.resourceClass.plural;

    const singularIdKeyA = `${toCamelCase(singularA )}ID`;
    const pluralKeyA     = toCamelCase(pluralA);

    resourceEndpoints[`/${pluralKeyA}/{${singularIdKeyA}}/${fieldName}`] = {
        'x-path-type': 'relatedResources',
        'x-param-map': {
            idA: singularIdKeyA,
            [direction === FORWARD ? 'id1' : 'id2']: singularIdKeyA
        },
        'x-i': i,
        'x-A': (direction === FORWARD ? 1 : 2),
        'x-B': (direction === FORWARD ? 2 : 1),
        'x-relationship-type': cls.name,
        get: {
            summary: getSummary || `retrieve all the ${pluralB} of a given ${singularA}`,
            parameters: [
                {
                    name:        singularIdKeyA,
                    in:          'path',
                    description: `ID of the ${singularA} of which to retrieve the ${pluralB}`,
                    required:    true,
                    type:        'integer'
                }
            ],
            responses: {
                [OK]: {
                    description: `an array containing the ${pluralB} of the given ${singularA}`,
                    schema: { type: 'array', items: $ref(relB.resourceClass.name)}
                }
            }
        }
    };
}


function addSpecificRelatedResourceEndpoint(cls, i, direction) {
    const relA = cls.domainPairs[i][(direction === FORWARD)? 1: 2];
    const relB = cls.domainPairs[i][(direction === FORWARD)? 2: 1];

    const fieldName = relA.shortcutKey;
    if (isUndefined(fieldName)) return;

    const {getSummary, putSummary, deleteSummary, abstract} = relA;

    const pluralA       = relA.resourceClass.plural;
    const singularA 	= relA.resourceClass.singular;
    const pluralB   	= relB.resourceClass.plural;
    const singularB 	= relB.resourceClass.singular;

    const singularIdKeyA = `${toCamelCase(singularA )}ID`;
    const singularIdKeyB = `${toCamelCase((relA.resourceClass === relB.resourceClass? "other " : "") + (singularB))}ID`;
    const pluralKeyA     = toCamelCase(pluralA);

    resourceEndpoints[`/${pluralKeyA}/{${singularIdKeyA}}/${fieldName}/{${singularIdKeyB}}`] = {
        'x-path-type': 'specificRelatedResource',
        'x-param-map': {
            idA: singularIdKeyA,
            idB: singularIdKeyB,
            [direction === FORWARD ? 'id1' : 'id2']: singularIdKeyA,
            [direction === FORWARD ? 'id2' : 'id1']: singularIdKeyB
        },
        'x-i': i,
        'x-A': (direction === FORWARD ? 1 : 2),
        'x-B': (direction === FORWARD ? 2 : 1),
        'x-relationship-type': cls.name,
        put: {
            summary: putSummary || `add a given ${pluralB} to a given ${singularA}`,
            parameters: [
                {
                    name:        singularIdKeyA,
                    in:          'path',
                    description: `ID of the ${singularA} to which to add the '${fieldName}' ${singularB}`,
                    required:    true,
                    type:        'integer'
                }, {
                    name:        singularIdKeyB,
                    in:          'path',
                    description: `ID of the '${fieldName}' ${singularB} to add to the given ${singularA}`,
                    required:    true,
                    type:        'integer'
                }//,
                // {
                //     name:        'properties',
                //     in:          'body',
                //     description: `properties of the relationship`,
                //     required:    true,
                //     type:        $ref(`partial_${cls.name}`)
                // }
            ],
            responses: {
                [NO_CONTENT]: {
                    description: `successfully added the ${singularB}`
                }
            }
        },
        delete: {
            summary: deleteSummary || `remove a ${pluralB} from a given ${singularA}`,
            parameters: [
                {
                    name:        singularIdKeyA,
                    in:          'path',
                    description: `ID of the ${singularA} from which to remove the '${fieldName}' ${singularB}`,
                    required:    true,
                    type:        'integer'
                }, {
                    name:        singularIdKeyB,
                    in:          'path',
                    description: `ID of the '${fieldName}' ${singularB} to remove from the given ${singularA}`,
                    required:    true,
                    type:        'integer'
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

///////////////////////////////////////////
//Relationship endpoints
///////////////////////////////////////////

function addRelationshipEndpoint(cls) {

    //Phrase in "singular" is not used, cls.name looks nicer

    relationshipEndpoints[`/${cls.name}`] = {
        'x-path-type': 'relationships',
        'x-relationship-type': cls.name,
        get: {
            summary: `retrieve all ${cls.name} relationships`,
            responses: {
                [OK]: {
                    description: `an array containing all ${cls.name} relationships`,
                    schema: { type: 'array', items: $ref(cls.name) }
                }
            }
        },
        ...(cls.abstract || {
            post: {
                summary: `create a new ${cls.name} relationship`,
                parameters: [{
                    name:        `new ${cls.name}`,
                    in:          'body',
                    description: `the new ${cls.name} relationship to create`,
                    required:    true,
                    schema:      $ref(cls.name)
                }],
                responses: {
                    [CREATED]: {
                        description: `an array containing one element: the newly created ${cls.name} relationship`,
                        schema: { type: 'array', items: $ref(cls.name), minItems: 1, maxItems: 1 }
                    }
                }
            }
        })
    };
}


function addSpecificRelationshipEndpoint(cls) {

    const {abstract} = cls;

    const singularIdKey = `${toCamelCase(cls.name)}ID`;

    relationshipEndpoints[`/${cls.name}/{${singularIdKey}}`] = {
        'x-path-type': 'specificRelationships',
        'x-relationship-type': cls.name,
        'x-param-map': {
            id: singularIdKey,
            ids: singularIdKey
        },
        get: {
            summary: `retrieve ${cls.name} relationships by id`,
            parameters: [{
                name: singularIdKey,
                in: 'path',
                description: `IDs of the ${cls.name} relationships to retrieve`,
                required: true,
                type: 'array',
                items: { type: 'number' },
                collectionFormat: 'csv'
            }],
            responses: {
                [OK]: {
                    description: `an array containing the requested ${cls.name} relationships in matching order`,
                    schema: { type: 'array', items: $ref(cls.name), minItems: 1, maxItems: 1 }
                }
            }
        },
        post: {
            summary: `update a given ${cls.name} relationship`,
            parameters: [{
                name:        singularIdKey,
                in:          'path',
                description: `ID of the ${cls.name} relationship to update`,
                required:    true,
                type:        'integer'
            }, {
                name:        toCamelCase(`new ${cls.name}`),
                in:          'body',
                description: `a (partial) ${cls.name} relationship object with the data that should be updated`,
                required:    true,
                schema:      $ref(`partial_${cls.name}`)
            }],
            responses: {
                [OK]: {
                    description: `an array containing one element: the full ${cls.name} relationship after the update`,
                    schema: { type: 'array', items: $ref(cls.name), minItems: 1, maxItems: 1 }
                }
            }
        },
        delete: {
            summary: `delete a given ${cls.name} relationship`,
            parameters: [{
                name:        singularIdKey,
                in:          'path',
                description: `ID of the ${cls.name} relationship to delete`,
                required:    true,
                type:        'integer'
            }],
            responses: {
                [NO_CONTENT]: {
                    description: `successfully deleted the ${cls.name} relationship`
                }
            }
        },
        ...(abstract || {
            put: {
                summary: `replace a given ${cls.name} relationship`,
                parameters: [{
                    name:        singularIdKey,
                    in:          'path',
                    description: `ID of the ${cls.name} relationship to replace`,
                    required:    true,
                    type:        'integer'
                }, {
                    name:        toCamelCase(`new ${cls.name}`),
                    in:          'body',
                    description: `the new ${cls.name} relationship to replace the old one with`,
                    required:    true,
                    schema:      $ref(cls.name)
                }],
                responses: {
                    [OK]: {
                        description: `an array containing one element: the full ${cls.name} relationship after the replacement`,
                        schema: { type: 'array', items: $ref(cls.name), minItems: 1, maxItems: 1 }
                    }
                }
            },
        })
    };
}


function addSpecificRelationshipByResourceEndpoint(cls, i, direction) {
    const relA = cls.domainPairs[i][(direction === FORWARD)? 1: 2];
    const relB = cls.domainPairs[i][(direction === FORWARD)? 2: 1];

    const relName = relA.keyInResource;
    const abstract = relA.abstract;

    const pluralA       = relA.resourceClass.plural;
    const singularA 	= relA.resourceClass.singular;
    const pluralB   	= relB.resourceClass.plural;
    const singularB 	= relB.resourceClass.singular;

    const singularIdKeyA = `${toCamelCase(singularA )}ID`;
    const singularIdKeyB = `${toCamelCase((relA.resourceClass === relB.resourceClass? "other " : "") + (singularB))}ID`;
    const pluralKeyA     = toCamelCase(pluralA);

    const msg = relA.resourceClass === relB.resourceClass? pluralA: singularA + " and " + singularB;

    relationshipEndpoints[`/${pluralKeyA}/{${singularIdKeyA}}/${relName}/{${singularIdKeyB}}`] = {
        'x-path-type': 'specificRelationshipByResources',
        'x-param-map': {
            idA: singularIdKeyA,
            idB: singularIdKeyB,
            [direction === FORWARD ? 'id1' : 'id2']: singularIdKeyA,
            [direction === FORWARD ? 'id2' : 'id1']: singularIdKeyB
        },
        'x-i': i,
        'x-A': (direction === FORWARD ? 1 : 2),
        'x-B': (direction === FORWARD ? 2 : 1),
        'x-relationship-type': cls.name,
        get: {
            summary: `retrieve ${relName} relationships between given ${msg}`,
            parameters: [
                {
                    name: singularIdKeyA,
                    in: 'path',
                    description: `ID of the ${singularA} which is the start node of the relationship ${relName}`,
                    required: true,
                    type: 'integer'
                }, {
                    name: singularIdKeyB,
                    in: 'path',
                    description: `ID of the ${singularB} which is the end node of the relationship ${relName}`,
                    required: true,
                    type: 'integer'
                }
            ],
            responses: {
                [OK]: {
                    description: `an array containing ${relName} relationships between given ${msg}`,
                    schema: { type: 'array', items: $ref(cls.name)}
                }
            }
        },
        delete: {
            summary: `remove a ${relName} relationship between given ${msg}`,
            parameters: [
                {
                    name:        singularIdKeyA,
                    in:          'path',
                    description: `ID of the ${singularA} which is the start node of the relationship ${relName}`,
                    required:    true,
                    type:        'integer'
                }, {
                    name:        singularIdKeyB,
                    in:          'path',
                    description: `ID of the ${singularB} which is the end node of the relationship ${relName}`,
                    required:    true,
                    type:        'integer'
                }
            ],
            responses: {
                [NO_CONTENT]: {
                    description: `successfully removed the relationship ${relName}`
                }
            }
        },
        ...(abstract || {
            put: {
                summary: `add a ${relName} relationship between given ${msg}`,
                parameters: [
                    {
                        name: singularIdKeyA,
                        in: 'path',
                        description: `ID of the ${singularA} which is the start node of the relationship ${relName}`,
                        required: true,
                        type: 'integer'
                    }, {
                        name: singularIdKeyB,
                        in: 'path',
                        description: `ID of the ${singularB} which is the end node of the relationship ${relName}`,
                        required: true,
                        type: 'integer'
                    }
                ],
                responses: {
                    [NO_CONTENT]: {
                        description: `successfully added the relationship ${relName}`
                    }
                }
            }
        })
    }
}


function addRelatedRelationshipEndpoint(cls, i, direction) {
    const relA = cls.domainPairs[i][(direction === FORWARD)? 1: 2];
    const nameRelA = relA.keyInResource;

    const {getSummary, putSummary, deleteSummary} = relA;

    const pluralA       = relA.resourceClass.plural;
    const singularA 	= relA.resourceClass.singular;
    const singularIdKeyA = `${toCamelCase(singularA )}ID`;
    const pluralKeyA     = toCamelCase(pluralA);

    relationshipEndpoints[`/${pluralKeyA}/{${singularIdKeyA}}/${nameRelA}`] = {
        'x-path-type': 'relatedRelationships',
        'x-param-map': {
            idA: singularIdKeyA,
            [direction === FORWARD ? 'id1' : 'id2']: singularIdKeyA
        },
        'x-i': i,
        'x-A': (direction === FORWARD ? 1 : 2),
        'x-B': (direction === FORWARD ? 2 : 1),
        'x-relationship-type': cls.name,
        get: {
            summary: getSummary || `retrieve all the ${nameRelA} relationships of a given ${singularA}`,
            parameters: [
                {
                    name:        singularIdKeyA,
                    in:          'path',
                    description: `ID of the ${singularA} of which to retrieve the ${nameRelA} relationships`,
                    required:    true,
                    type:        'integer'
                }
            ],
            responses: {
                [OK]: {
                    description: `an array containing the ${nameRelA} relationships of the given ${singularA}`,
                    schema: { type: 'array', items: $ref(cls.name), minItems: 1, maxItems: 1 }
                }
            }
        }
    };
}


//TODO: addSpecificRelatedRelationshipEndpoint
//extracting relationships of a given resource with given relationship ID is not first priority
//one can get relationship by ID and filter to find the resource (or vice versa)
//also likely to cause path clash with SpecificRelationshipByResource

////////////////////////////////////////////////////////////////

for (let resource of Object.values(resources)) {
    addResourceEndpoint(resource);
    addSpecificResourceEndpoint(resource);
}

for (let rel of Object.values(relationships)) {
	for (let i = 0; i < rel.domainPairs.length; i++) {
        if (rel.domainPairs[i][1].cardinality.max !== 1) {
            addRelatedResourceEndpoint(rel, i, FORWARD);
            addSpecificRelatedResourceEndpoint(rel, i, FORWARD );
            addSpecificRelationshipByResourceEndpoint(rel, i, FORWARD);
            addRelatedRelationshipEndpoint(rel, i, FORWARD);
        }
        if (rel.domainPairs[i][2].cardinality.max !== 1) {
            addRelatedResourceEndpoint(rel, i, BACKWARD);
            addSpecificRelatedResourceEndpoint(rel, i, BACKWARD);
            addSpecificRelationshipByResourceEndpoint(rel, i, BACKWARD);
            addRelatedRelationshipEndpoint(rel, i, BACKWARD);
        }

    }

    addRelationshipEndpoint(rel);
    addSpecificRelationshipEndpoint(rel);
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// algorithm endpoints                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let algorithmEndpoints = {};

function addAlgorithmEndpoint(algorithm) {
	let pathParamNames = algorithm.parameters.filter(p => p.in === 'path').map(p => p.name);
	algorithmEndpoints[`/${algorithm.name}${pathParamNames.map(p => `/{${p}}`)}`] = {
		'x-path-type': 'algorithm',
		'x-algorithm-name': algorithm.name,
		get: pick(algorithm, [
			'summary',
			'parameters',
			'responses'
		])
	};
}

for (let algorithm of _(algorithms).values()) {
	addAlgorithmEndpoint(algorithm);
}


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
		...resourceEndpoints,
		...relationshipEndpoints,
		...algorithmEndpoints
	}
};
