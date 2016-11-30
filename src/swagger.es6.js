////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* external libs */
import _, {isUndefined} from 'lodash';
import cloneDeep from 'lodash/cloneDeep';
import pick from 'lodash/pick';

/* local stuff */
import {toCamelCase}                          from './utility.es6.js';
import {resources, relationships, algorithms} from './resources.es6.js';
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
const $ref = (className) => (
	(className.indexOf("Type") > -1)?
		  { $ref: `#/definitions/Type`}
		: { $ref: `#/definitions/${className}` }
	);

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// swagger data types                                                                                                 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let swaggerDataTypes = {};

for (let resName of Object.keys(resources)) {
	let cls = resources[resName];
	swaggerDataTypes[resName] = {
		'x-resource-type': cls.name,
		type:       'object',
		properties: (() => {
			let properties = cloneDeep(cls.properties);
			for (let prop of Object.values(properties)) {
				delete prop.key;
				if (prop.readonly) {
					prop['x-readonly'] = prop.readonly;
					delete prop.readonly;
				}
			}
			return properties;
		})()
	};
	let required = [...Object.entries(cls.properties)]
			.filter(([fieldName, {'x-required': required}]) => required)
			.map(([fieldName]) => fieldName);
	if (required.length > 0) { swaggerDataTypes[resName].required = required; }
	swaggerDataTypes[`partial_${resName}`] = {
		// partial = allow required fields to be absent for update commands
		'x-resource-type': cls.name,
		type: 'object',
		properties: (() => {
			let properties = cloneDeep(cls.properties);
			for (let prop of Object.values(properties)) {
				delete prop.default;
				delete prop.key;
				if (prop.readonly) {
					prop['x-readonly'] = prop.readonly;
					delete prop.readonly;
				}
			}
			return properties;
		})()
	};
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// resource endpoints                                                                                                 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let resourceEndpoints = {};

function addResourceEndpoint(cls) {

    //NK 'abbreviation' removed
    const {singular, plural, abstract} = cls;

	const singularIdKey = `${toCamelCase(singular)}ID`;
	const pluralIdKey   = `${toCamelCase(singular)}IDs`;
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

for (let resource of _(resources).values()) {
	addResourceEndpoint(resource);
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// creating swagger resource relation endpoints                                                                       //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let relationshipEndpoints = {};

const FORWARD  = Symbol('FORWARD' );
const BACKWARD = Symbol('BACKWARD');

function addRelationshipEndpoints(rel, i, direction) {
	const relA = rel.domainPairs[i][(direction === FORWARD)? 1: 2];
	const relB = rel.domainPairs[i][(direction === FORWARD)? 2: 1];

    const pluralA       = relA.resourceClass.plural;
	const singularA 	= relA.resourceClass.singular;
	const pluralB   	= relB.resourceClass.plural;
	const singularB 	= relB.resourceClass.singular;

	const {getSummary, putSummary, deleteSummary, abstract} = relA;
	const fieldName = relA.shortcutKey;

	//NK TODO: make sure shortcutKey is available for all relationships
	if (isUndefined(fieldName)){
		//console.log("Relationship skipped: ",
		//	relA.resourceClass.name + " " + relA.keyInResource + " " + relB.resourceClass.name);
		return;
	}

    const singularIdKeyA = `${toCamelCase(singularA )}ID`;
    const singularIdKeyB = `${toCamelCase((relA.resourceClass === relB.resourceClass? "other " : "") + (singularB))}ID`;
    const pluralKeyA     = toCamelCase(pluralA);

    relationshipEndpoints[`/${pluralKeyA}/{${singularIdKeyA}}/${fieldName}`] = {
		'x-path-type': 'relationships',
		'x-param-map': {
			idA: singularIdKeyA,
			[direction === FORWARD ? 'id1' : 'id2']: singularIdKeyA
		},
		'x-A': (direction === FORWARD ? 1 : 2),
		'x-B': (direction === FORWARD ? 2 : 1),
		'x-relationship-type': rel.name, //TODO: check
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
					schema: { type: 'array', items: $ref(relB.resourceClass.name), minItems: 1, maxItems: 1 }
				}
			}
		}
	};

	if (!abstract) {
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
			//TODO NK: deal with relationships with properties
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

for (let rel of Object.values(relationships)) {
	for (let i = 0; i < rel.domainPairs.length; i++){
		if (rel.domainPairs[i][1].cardinality.max !== 1) { addRelationshipEndpoints(rel, i, FORWARD ) }
		if (rel.domainPairs[i][2].cardinality.max !== 1) { addRelationshipEndpoints(rel, i, BACKWARD) }
	}
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
