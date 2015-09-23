////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* external libs */
import _ from 'lodash';

/* local stuff */
import {toCamelCase}                         from './util.es6';
import {resources, relationships, ONE, MANY} from './resources.es6.js';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// swagger data types                                                                                                 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let swaggerDataTypes = {};

for (let resName of Object.keys(resources)) {
	let Type = resources[resName];
	swaggerDataTypes[resName] = {
		'x-model':  Type,
		type:       'object',
		properties: _.cloneDeep(Type.properties)
	};
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// resource endpoints                                                                                                 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let resourceEndpoints = {};

const $ref = (Type) => ({ $ref: `#/definitions/${Type.name}` });

function addResourceEndpoint(Type) {

	const {singular, plural, readOnly} = Type;

	const singularKey = toCamelCase(singular);
	const pluralKey   = toCamelCase(plural);

	resourceEndpoints[`/${pluralKey}`] = Object.assign({
		'x-resource-model': Type,
		get: {
			summary: `retrieve all ${plural}`,
			responses: {
				200: {
					description: `an array containing all ${plural}`,
					schema: { type: 'array', items: $ref(Type) }
				}
			}
		}
	}, readOnly || {
			post: {
				summary: `create a new ${singular}`,
				parameters: [
					{
						name:        toCamelCase(`new ${singular}`),
						in:          'body',
						description: `the new ${singular} to create`,
						required:    true,
						schema:      $ref(Type)
					}
				],
				responses: {
					201: {
						description: `an array containing one element: the newly created ${singular}`,
						schema: { type: 'array', items: $ref(Type), minItems: 1, maxItems: 1 }
					}
				}
			}
		});

	resourceEndpoints[`/${pluralKey}/{${singularKey}}`] = Object.assign({
		'x-resource-model': Type,
		get: {
			summary: `retrieve ${plural} by id`,
			parameters: [
				{
					name:        singularKey,
					in:          'path',
					description: `ID of the ${singular} to retrieve`,
					required:    true,
					type:        'string'
				}
			],
			responses: {
				200: {
					description: `an array containing one element: the requested ${singular}`,
					schema: { type: 'array', items: $ref(Type), minItems: 1, maxItems: 1 }
				}
			}
		}
	}, readOnly || {
			put: {
				summary: `replace a given ${singular}`,
				parameters: [
					{
						name:        singularKey,
						in:          'path',
						description: `ID of the ${singular} to replace`,
						required:    true,
						type:        'string'
					}, {
						name:        toCamelCase(`new ${singular}`),
						in:          'body',
						description: `the new ${singular} to replace the old one with`,
						required:    true,
						schema:      $ref(Type)
					}
				],
				responses: {
					200: {
						description: `an array containing one element: the full ${singular} after the replacement`,
						schema: { type: 'array', items: $ref(Type), minItems: 1, maxItems: 1 }
					}
				}
			},
			post: {
				summary: `update a given ${singular}`,
				parameters: [
					{
						name:        singularKey,
						in:          'path',
						description: `ID of the ${singular} to update`,
						required:    true,
						type:        'string'
					}, {
						name:        toCamelCase(`new ${singular}`),
						in:          'body',
						description: `a (partial) ${singular} object with the data that should be updated`,
						required:    true,
						schema:      $ref(Type) // TODO: should this be a different schema, given that partial info is allowed?
					}
				],
				responses: {
					200: {
						description: `an array containing one element: the full ${singular} after the update`,
						schema: { type: 'array', items: $ref(Type), minItems: 1, maxItems: 1 }
					}
				}
			},
			delete: {
				summary: `delete a given ${singular}`,
				parameters: [
					{
						name:        singularKey,
						in:          'path',
						description: `ID of the ${singular} to delete`,
						required:    true,
						type:        'string'
					}
				],
				responses: {
					204: {
						description: `successfully deleted the ${singular}`
					}
				}
			}
		});
}

for (let resourceName of Object.keys(resources)) {
	addResourceEndpoint(resources[resourceName]);
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// creating swagger resource relation endpoints                                                                       //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let relationshipEndpoints = {};

function addRelationshipEndpoints(rel, rel1, rel2) {

	const plural1   = rel1.type.plural;
	const singular1 = rel1.type.singular;
	const plural2   = rel2.type.plural;
	const singular2 = (rel1.type === rel2.type ? "other " : "") + rel2.type.singular;
	const fieldName = rel1.fieldName;
	const {getSummary, putSummary, deleteSummary, readOnly} = rel1;

	const singularKey1 = toCamelCase(singular1);
	const pluralKey1   = toCamelCase(plural1);
	const singularKey2 = toCamelCase(singular2);

	relationshipEndpoints[`/${pluralKey1}/{${singularKey1}}/${fieldName}`] = {
		'x-relationship-model': rel,
		get: {
			summary: getSummary || `retrieve all the ${plural2} of a given ${singular1}`,
			parameters: [
				{
					name:        singularKey1,
					in:          'path',
					description: `ID of the ${singular1} of which to retrieve the ${plural2}`,
					required:    true,
					type:        'string'
				}
			],
			responses: {
				200: {
					description: `an array containing the ${plural2} of the given ${singular1}`,
					schema: { type: 'array', items: $ref(rel2.type), minItems: 1, maxItems: 1 }
				}
			}
		}
	};

	if (!readOnly) {
		relationshipEndpoints[`/${pluralKey1}/{${singularKey1}}/${fieldName}/{${singularKey2}}`] = {
			'x-relationship-model': rel,
			put: {
				summary: putSummary || `add a given ${plural2} to a given ${singular1}`,
				parameters: [
					{
						name:        singularKey1,
						in:          'path',
						description: `ID of the ${singular1} to which to add the '${fieldName}' ${singular2}`,
						required:    true,
						type:        'string'
					}, {
						name:        singularKey2,
						in:          'path',
						description: `ID of the '${fieldName}' ${singular2} to add to the given ${singular1}`,
						required:    true,
						type:        'string'
					}
				],
				responses: {
					204: {
						description: `successfully added the ${singular2}`
					}
				}
			},
			delete: {
				summary: deleteSummary || `remove a ${plural2} from a given ${singular1}`,
				parameters: [
					{
						name:        singularKey1,
						in:          'path',
						description: `ID of the ${singular1} from which to remove the '${fieldName}' ${singular2}`,
						required:    true,
						type:        'string'
					}, {
						name:        singularKey2,
						in:          'path',
						description: `ID of the '${fieldName}' ${singular2} to remove from the given ${singular1}`,
						required:    true,
						type:        'string'
					}
				],
				responses: {
					204: {
						description: `successfully removed the ${singular2}`
					}
				}
			}
		}
	}
}

for (let rel of relationships) {
	if (rel[1].fieldCardinality === MANY) { addRelationshipEndpoints(rel, rel[1], rel[2]) }
	if (rel[2].fieldCardinality === MANY) { addRelationshipEndpoints(rel, rel[2], rel[1]) }
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// final Swagger spec                                                                                                 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export default {
	swagger: '2.0',
	info: {
		title: "Open Physiology Lyph System",
		description: "REST API for anatomical lyph systems and related constructs",
		version: '1'
	},
	host: 'localhost:3000',
	consumes: ['application/json'],
	produces: ['application/json'],
	definitions: {
		...swaggerDataTypes
	},
	paths: {
		...resourceEndpoints,
		...relationshipEndpoints
	}
};
