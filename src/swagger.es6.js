////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* external libs */
import _ from 'lodash';

/* local stuff */
import {toCamelCase}              from './utility.es6.js';
import {resources, relationships} from './resources.es6.js';
import {
	OK,
	CREATED,
	NO_CONTENT,
	NOT_FOUND,
	PRECONDITION_FAILED,
	INTERNAL_SERVER_ERROR
} from './http-status-codes.es6.js';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// swagger data types                                                                                                 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let swaggerDataTypes = {};

for (let resName of Object.keys(resources)) {
	let type = resources[resName];
	swaggerDataTypes[resName] = {
		'x-resource-type': type.name,
		type:       'object',
		properties: _.cloneDeep(type.schema.properties),
		required:   [...Object.entries(type.schema.properties)]
		                .filter(([fieldName, {'x-required': required}]) => required)
		                .map(([fieldName]) => fieldName)
	};
	swaggerDataTypes[`partial_${resName}`] = { // partial = allow required fields to be absent for update commands
		'x-resource-type': type.name,
		type: 'object',
		properties: (() => {
			let properties = _.cloneDeep(type.schema.properties);
			for (let prop of Object.values(properties)) { delete prop.default }
			return properties;
		})()
	};
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// resource endpoints                                                                                                 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let resourceEndpoints = {};

const $ref = (type) => ({ $ref: `#/definitions/${type}` });

function addResourceEndpoint(type) {

	const {singular, plural, readOnly} = type;

	const singularIdKey = toCamelCase(singular) + 'ID';
	const pluralKey     = toCamelCase(plural);

	resourceEndpoints[`/${pluralKey}`] = Object.assign({
		'x-path-type': 'resources',
		'x-resource-type': type.name,
		get: {
			summary: `retrieve all ${plural}`,
			responses: {
				[OK]: {
					description: `an array containing all ${plural}`,
					schema: { type: 'array', items: $ref(type.name) }
				}
			}
		}
	}, readOnly ? null : {
		post: {
			summary: `create a new ${singular}`,
			parameters: [{
				name:        toCamelCase(`new ${singular}`),
				in:          'body',
				description: `the new ${singular} to create`,
				required:    true,
				schema:      $ref(type.name)
			}],
			responses: {
				[CREATED]: {
					description: `an array containing one element: the newly created ${singular}`,
					schema: { type: 'array', items: $ref(type.name), minItems: 1, maxItems: 1 }
				}
			}
		}
	});

	resourceEndpoints[`/${pluralKey}/{${singularIdKey}}`] = Object.assign({
		'x-path-type': 'specificResource',
		'x-param-map': {
			id: singularIdKey
		},
		'x-resource-type': type.name,
		get: {
			summary: `retrieve ${plural} by id`,
			parameters: [{
				name:        singularIdKey,
				in:          'path',
				description: `ID of the ${singular} to retrieve`,
				required:    true,
				type:        'integer'
			}],
			responses: {
				[OK]: {
					description: `an array containing one element: the requested ${singular}`,
					schema: { type: 'array', items: $ref(type.name), minItems: 1, maxItems: 1 }
				}
			}
		}
	}, readOnly ? null : {
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
				schema:      $ref(type.name)
			}],
			responses: {
				[OK]: {
					description: `an array containing one element: the full ${singular} after the replacement`,
					schema: { type: 'array', items: $ref(type.name), minItems: 1, maxItems: 1 }
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
				schema:      $ref(`partial_${type.name}`)
			}],
			responses: {
				[OK]: {
					description: `an array containing one element: the full ${singular} after the update`,
					schema: { type: 'array', items: $ref(type.name), minItems: 1, maxItems: 1 }
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

const FORWARD  = Symbol('FORWARD' );
const BACKWARD = Symbol('BACKWARD');
function addRelationshipEndpoints(rel, direction) {
	const relA = rel[direction === FORWARD ? 1 : 2];
	const relB = rel[direction === FORWARD ? 2 : 1];

	const pluralA   = relA.type.plural;
	const singularA = relA.type.singular;
	const pluralB   = relB.type.plural;
	const singularB = (relA.type === relB.type ? "other " : "") + relB.type.singular;
	const fieldName = relA.fieldName;
	const {getSummary, putSummary, deleteSummary, readOnly} = relA;

	const singularIdKeyA = toCamelCase(singularA) + 'ID';
	const singularIdKeyB = toCamelCase(singularB) + 'ID';
	const pluralKeyA     = toCamelCase(pluralA);

	relationshipEndpoints[`/${pluralKeyA}/{${singularIdKeyA}}/${fieldName}`] = {
		'x-path-type': 'relationships',
		'x-param-map': {
			idA: singularIdKeyA,
			[direction === FORWARD ? 'id1' : 'id2']: singularIdKeyA
		},
		'x-A': (direction === FORWARD ? 1 : 2),
		'x-B': (direction === FORWARD ? 2 : 1),
		'x-relationship-type': rel.name,
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
					schema: { type: 'array', items: $ref(relB.type.name), minItems: 1, maxItems: 1 }
				}
			}
		}
	};

	if (!readOnly) {
		relationshipEndpoints[`/${pluralKeyA}/{${singularIdKeyA}}/${fieldName}/{${singularIdKeyB}}`] = {
			'x-path-type': 'specificRelationship',
			'x-param-map': {
				idA: singularIdKeyA,
				idB: singularIdKeyB,
				[direction === FORWARD ? 'id1' : 'id2']: singularIdKeyA,
				[direction === FORWARD ? 'id2' : 'id1']: singularIdKeyB
			},
			'x-A': (direction === FORWARD ? 1 : 2),
			'x-B': (direction === FORWARD ? 2 : 1),
			'x-relationship-type': rel.name,
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
					}
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
}

for (let relName of Object.keys(relationships)) {
	let rel = relationships[relName];
	if (rel[1].fieldCardinality === 'many') { addRelationshipEndpoints(rel, FORWARD ) }
	if (rel[2].fieldCardinality === 'many') { addRelationshipEndpoints(rel, BACKWARD) }
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
		...relationshipEndpoints
	}
};
