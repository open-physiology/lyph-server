////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import _ from 'lodash';

import {toCamelCase, a}                                     from './util.es6';
import {simpleDataTypes}                                    from './simpleDataTypes.es6.js';
import {resources     as specifiedResources}                from './resources.es6.js';
import {relationships as specifiedRelationships, ONE, MANY} from './relationships.es6.js';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// processing resources                                                                                               //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export let resources = _.cloneDeep(specifiedResources);

for (let resName of Object.keys(resources)) {
	resources[resName].name = resName;
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// processing relationships                                                                                           //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export let relationships = [];

for (let [
	cardinality1, typeName1, fieldName1, options1,
	cardinality2, typeName2, fieldName2, options2,
	options
] of specifiedRelationships) {
	/* cleaning up the relationship object */
	if (!options1) { options1 = {} }
	if (!options2) { options2 = {} }
	if (!options)  { options  = {} }
	let rel = {
		1: {
			cardinality: cardinality1,
			type:        resources[typeName1],
			fieldName:   fieldName1,
			...options,
			...options1
		},
		2: {
			cardinality: cardinality2,
			type:        resources[typeName1],
			fieldName:   fieldName2,
			...options,
			...options2
		},
		...options
	};
	relationships.push(rel);

	/* supplementing the resource object(s) */
	for (let i of [1, 2]) {
		if (rel[i].cardinality === ONE) {
			rel[i].type.properties[rel[i].fieldName] = simpleDataTypes.uri;
			a(rel[i].type, 'required').push(rel[i].fieldName);
		}

		if (rel[i].cardinality === MANY && rel[i].indexFieldName) {
			rel[i].type.properties[rel[i].indexFieldName] = simpleDataTypes.uri;
			a(rel[i].type, 'required').push(rel[i].indexFieldName);
		}

		if (rel[i].setFields) {
			for (let fieldName of Object.keys(rel[i].setFields)) {
				rel[i].type.properties[fieldName] = simpleDataTypes.uri;
			}
		}
	}
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// swagger data types                                                                                                 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let swaggerDataTypes = {};

for (let resName of Object.keys(resources)) {
	let res = resources[resName];
	swaggerDataTypes[resName] = {
		type:       'object',
		properties: _.cloneDeep(res.properties),
		required:   res.required && _.uniq(res.required)
	};
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// resource endpoints                                                                                                 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let resourceEndpoints = {};

const $ref = (name) => ({ $ref: `#/definitions/${name}` });

const respondWithListOf = (Type) => ({
	description: `the list of requested ${Type.plural}`,
	schema: { type: 'array', items: $ref(Type.name) }
});

function addResourceEndpoint(Type) {

	const singular = Type.singular;
	const plural   = Type.plural;
	const readOnly = Type.readOnly;

	resourceEndpoints[`/${toCamelCase(plural)}`] = Object.assign({
		get: {
			summary: `find all ${plural}`,
			responses: {
				200: respondWithListOf(Type)
			}
		}
	}, readOnly || {
		post: {
			summary: `create a new ${singular}`,
			responses: {
				201: respondWithListOf(Type)
			}
		}
	});

	resourceEndpoints[`/${toCamelCase(plural)}/{${toCamelCase(singular)}}`] = Object.assign({
		get: {
			summary: `find ${plural} by id`,
			responses: {
				200: respondWithListOf(Type)
			}
		}
	}, readOnly || {
		put: {
			summary: `replace a given ${singular}`,
			responses: {
				200: respondWithListOf(Type)
			}
		},
		post: {
			summary: `update a given ${singular}`,
			responses: {
				200: respondWithListOf(Type)
			}
		},
		delete: {
			summary: `delete a given ${singular}`,
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

function addRelationshipEndpoints(rel1, rel2) {

	const plural1   = rel1.type.plural;
	const singular1 = rel1.type.singular;
	const plural2   = rel2.type.plural;
	const singular2 = (rel1.type === rel2.type ? "other " : "") + rel2.type.singular;
	const {getSummary, putSummary, deleteSummary, readOnly} = rel1;

	relationshipEndpoints[`/${toCamelCase(plural1)}/{${toCamelCase(singular1)}}/${rel1.fieldName}`] = {
		get: {
			summary: getSummary || `find all the ${plural2} of a given ${singular1}`,
			responses: {
				200: respondWithListOf(rel2.type)
			}
		}
	};

	if (!readOnly) {
		relationshipEndpoints[`/${toCamelCase(plural1)}/{${toCamelCase(singular1)}}/${rel1.fieldName}/{${toCamelCase(singular2)}}`] = {
			put: {
				summary: putSummary || `add a given ${plural2} to a given ${singular1}`,
				responses: {
					204: {
						description: `successfully added the ${singular2}`
					}
				}
			},
			delete: {
				summary: deleteSummary || `remove a ${plural2} from a given ${singular1}`,
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
	if (rel[1].cardinality === MANY) { addRelationshipEndpoints(rel[2], rel[1]) }
	if (rel[2].cardinality === MANY) { addRelationshipEndpoints(rel[1], rel[2]) }
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// TODOs related to maintaining data constraints                                                                      //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// TODO: enforce that name/uri-ish fields are not empty strings
// TODO: enforce that if a lyph is in more than 1 layer, that all those layers coalesce
// TODO: enforce symmetry of coalescence
// TODO: enforce that each coalescing layer is the outermost layer of its lyph
// TODO: enforce that all coalescing layers have the same layer template
// TODO: avoid loops in "/layerTemplates/{id}/materials" + "/lyphTemplates/{id}/layers" relationships
// TODO: avoid loops in "/lyphs/{id}/layers"             + "/layers/{id}/lyphs"         relationships
// TODO: enforce that the positions of layers start at 0 and are sequential / without gaps
// TODO: enforce that a node is not on the inner border of layer 0 (the axis)
// TODO: enforce that a node cannot be on more than one border of the same layer
// TODO: enforce that when a node is placed 'between' layers, it is registered on both (inner, outer)
// TODO: enforce node placement w.r.t. coalescence
// TODO: if a node is on plus/minus of lyphA(layer i), and on outer/inner of lyphB(layer j),
//     : then lyphA is inside of lyphB(layer j +/- 1)
//     : (unless it's the outer border of the outer layer of lyphB; then it's not necessary)
//     : IN OTHER WORDS: orthogonal placement of lyph inside housing layer
// TODO: enforce that a correlation has >= 2 variables associated with it
// TODO: enforce that no two publications have the same 'pubmed uri'
// TODO: enforce that a (potential) process does not go from x to y, when x and y are on the same border
// TODO: enforce that a bag of pathologies has at least one 'thing' in it

// DONE: enforce that layers of instantiated lyphs correspond to the layer(Template)s of the lyph template
// done by auto-syncing from layerTemplates to layers


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// final Swagger spec                                                                                                 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const swagger = {
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
		...simpleDataTypes,
		...swaggerDataTypes
	},
	paths: {
		...resourceEndpoints,
		...relationshipEndpoints
	}
};
