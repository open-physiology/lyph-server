////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* external libraries */
import _ from 'lodash';

/* local stuff */
import {toCamelCase, a}                                     from './util.es6';
import {resources     as specifiedResources}                from './config/resources.es6.js';
import {relationships as specifiedRelationships, ONE, MANY} from './config/relationships.es6.js';
import {idSchema}                                           from './simpleDataTypes.es6.js';

/* direct exports */
export {ONE, MANY};


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

export let relationships = {};

for (let relName of Object.keys(specifiedRelationships)) {
	/* unpacking the relationship data */
	let [
		typeName1, fieldCardinality1, fieldName1, options1,
		typeName2, fieldCardinality2, fieldName2, options2,
		options
	] = specifiedRelationships[relName];

	/* creating the relationship object */
	if (!options1) { options1 = {} }
	if (!options2) { options2 = {} }
	if (!options)  { options  = {} }
	let rel = {
		...options,
		name: relName,
		1: {
			...options,
			...options1,
			type:             resources[typeName1],
			fieldCardinality: fieldCardinality1,
			fieldName:        fieldName1,
			side:             1
		},
		2: {
			...options,
			...options2,
			type:             resources[typeName2],
			fieldCardinality: fieldCardinality2,
			fieldName:        fieldName2,
			side:             2
		}
	};
	rel[1].relationship = rel;
	rel[2].relationship = rel;
	rel[1].otherSide = rel[2];
	rel[2].otherSide = rel[1];
	relationships[relName] = rel;

	/* supplementing the resource type object(s) */
	for (let i of [1, 2]) {
		/* ordered pair of pointers to the sides of this relationship */
		if (!rel[i].type.relationships) { rel[i].type.relationships = [] }
		rel[i].type.relationships.push([ rel[i], rel[i==1?2:1] ]);

		/* a field pointing to the related entity|-ies */
		if (rel[i].fieldCardinality === ONE) {
			rel[i].type.schema.properties[rel[i].fieldName] = {
				...idSchema,
				'x-skip-db':  true,
				'x-required': true
			};
		} else {
			rel[i].type.schema.properties[rel[i].fieldName] = {
				type: 'array',
				items: idSchema,
				'x-skip-db':  true,
				'x-required': true
			};
		}

		/* a field containing the index this entity occupies in the related entity */
		if (rel[i].fieldCardinality === ONE && rel[i==1?2:1].fieldCardinality === MANY && rel[i].indexFieldName) {
			rel[i].type.schema.properties[rel[i].indexFieldName] = {
				type: 'integer',
				minimum: 0,
				'x-required': true
			};
		}

		/* other fields that should be set */
		if (rel[i].setFields) {
			for (let fieldName of Object.keys(rel[i].setFields)) {
				rel[i].type.schema.properties[fieldName] = {
					type: (typeof rel[i].setFields[fieldName])
				};
			}
		}
	}
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
// TODO: enforce that min thickness is <= max thickness

// DONE: enforce that layers of instantiated lyphs correspond to the layer(Template)s of the lyph template
// done by auto-syncing from layerTemplates to layers
