////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import {toCamelCase, a} from './util.es6';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// utility functions for constructing certain JSON constructs                                                         //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const $allOf = (...objs) => ({ allOf: objs });
const $ref   = (name)    => ({ $ref: `#/definitions/${name}` });
const $list  = (items)   => ({ type: 'array', items });


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// simple data types                                                                                                  //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export let simpleDataTypes = {

	key: {
		type: 'object',
		properties: {
			href: { type: 'string' }
		},
		required: ['href'],
		'x-skip-db': true
	},

	uri: {
		type: 'string'
	},

	side: {
		type: 'string',
		enum: ['plus', 'minus', 'inner', 'outer']
	},

	polarity: {
		type: 'string',
		enum: ['plus', 'minus']
	}

};


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// resource types                                                                                                     //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export let resourceTypes = {

	LyphTemplate: {
		'x-singular': "lyph template",
		'x-plural':   "lyph templates",
		type: 'object',
		properties: {
			name: { type: 'string' }
		},
		required: ['name']
	},

	LayerTemplate: {
		'x-singular': "layer template",
		'x-plural':   "layer templates",
		type: 'object',
		properties: {
			name:      { type: 'string' },
			thickness: {
				type: 'array', // [min, max]
				items: { type: 'number', minimum: 0 },
				minItems: 2,
				maxItems: 2
			}
		}
	},

	Lyph: {
		'x-singular': "lyph",
		'x-plural':   "lyphs",
		type: 'object',
		properties: {
			name:     { type: 'string' },
			species:  { type: 'string' },
			length:   { type: 'number', minimum: 0 },
			closedAt: {
				type: 'array',
				items: $ref('polarity'),
				uniqueItems: true,
				maxItems:    2
			}
		},
		required: ['name', 'species']
		//required: ['name', 'species', 'template']
	},

	Layer: {
		'x-singular': "layer",
		'x-plural':   "layers",
		type: 'object',
		properties: {}
		//required: ['template', 'lyph']
	},

	Compartment: {
		'x-singular': "compartment",
		'x-plural':   "compartments",
		properties: {}
	},

	Border: {
		'x-singular': "border",
		'x-plural':   "borders",
		type: 'object',
		properties: {}
		//required: ['layer', 'side']
	},

	Node: {
		'x-singular': "node",
		'x-plural':   "nodes",
		type: 'object',
		properties: {}
	},

	Correlation: {
		'x-singular': "correlation",
		'x-plural':   "correlations",
		type: 'object',
		properties: {
			comment: { type: 'string' }
		}
		//required: ['publication']
	},

	Publication: {
		'x-singular': "publication",
		'x-plural':   "publications",
		type: 'object',
		properties: {
			uri:          $ref('uri'),
			title:        { type: 'string' }
		},
		required: ['uri']
	},

	ClinicalIndex: {
		'x-singular': "clinical index",
		'x-plural':   "clinical indices",
		type: 'object',
		properties: {
			uri:   $ref('uri'),
			title: { type: 'string' }
		},
		required: ['uri']
	},

	LocatedMeasure: {
		'x-singular': "located measure",
		'x-plural':   "located measures",
		type: 'object',
		properties: {
			quality: { type: 'string' }
		},
		required: ['quality']
	},

	BagOfPathologies: {
		'x-singular': "bag of pathologies",
		'x-plural':   "bags of pathologies",
		type: 'object',
		properties: {}
	},

	Process: {
		'x-singular': "process",
		'x-plural':   "processes",
		type: 'object',
		properties: {}
		//required: ['source', 'target']
	},

	PotentialProcess: {
		'x-singular': "potential process",
		'x-plural':   "potential processes",
		type: 'object',
		properties: {}
		//required: ['source', 'target']
	}
};



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// resource relationships                                                                                             //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export let resourceRelationships = [];

export const ONE  = Symbol('many');
export const MANY = Symbol('many');
function addRelationship(c1, TypeName1, fieldName1, c2, options1, TypeName2, fieldName2, options2, options = {}) {
	let rel = {
		1: {
			cardinality: c1 === 1 ? ONE : c1,
			TypeName:    TypeName1,
			fieldName:   fieldName1,
			...options,
			...options1
		},
		2: {
			cardinality: c2 === 1 ? ONE : c2,
			TypeName:    TypeName2,
			fieldName:   fieldName2,
			...options,
			...options2
		},
		...options
	};
	resourceRelationships.push(rel);

	// TODO: put the following changes into the abstract resource representation, not directly in the swagger thing
	for (let i of [1, 2]) {
		if (rel[i].cardinality === ONE) {
			resourceTypes[rel[i].TypeName].properties[rel[i].fieldName] = $ref('key');
			a(resourceTypes[rel[i].TypeName], 'required').push(rel[i].fieldName);
		}

		if (rel[i].cardinality === MANY && rel[i].indexFieldName) {
			resourceTypes[rel[i].TypeName].properties[rel[i].indexFieldName] = $ref('key');
			a(resourceTypes[rel[i].TypeName], 'required').push(rel[i].indexFieldName);
		}

		if (rel[i].setFields) {
			for (let fieldName of Object.keys(rel[i].setFields)) {
				resourceTypes[rel[i].TypeName].properties[fieldName] = $ref('key');
			}
		}
	}
}

const $ = MANY;
addRelationship(
	1, 'LyphTemplate',  'layers',       {},
	$, 'LayerTemplate', 'lyphTemplate', { indexFieldName: 'position' }
);
addRelationship(
	$, 'LayerTemplate', 'materials',  {
		getSummary:    "find all lyph templates acting as materials in a given layer template",
		putSummary:    "add a given lyph template to a given layer template as a material",
		deleteSummary: "remove a given lyph template from a given layer template as material"
	},
	$, 'LyphTemplate',  'materialIn', {
		getSummary:    "find the layer templates in which a given lyph template is a material",
		putSummary:    "add a given lyph template to a given layer template as a material",
		deleteSummary: "remove a given lyph template from a given layer template as material"
	}
);
addRelationship(
	1, 'LyphTemplate',  'instantiations', {
		getSummary: "find all lyphs instantiated from a given lyph template"
	},
	$, 'Lyph',          'template',       {},
	{
		readOnly: true // instantiation has 1 template from creation
	}
);
addRelationship(
	1, 'LayerTemplate', 'instantiations', {
		getSummary: "find all layers instantiated from a given layer template"
	},
	$, 'Layer',         'template',       {},
	{
		readOnly: true // instantiation has 1 template from creation
	}
);
addRelationship(
	1, 'Lyph',  'layers', {},
	$, 'Layer', 'lyph',   {},
	{
		readOnly: true // layers sync through templates
	}
);
addRelationship(
	$, 'Layer', 'childLyphs', {
		getSummary:    "find all lyphs that are located in a given layer",
		putSummary:    "add a given lyph into a given layer",
		deleteSummary: "remove a given lyph from inside a given layer"
	},
	$, 'Lyph',  'inLayers',   {
		getSummary:    "find the layer(s) in which a given lyph is located",
		putSummary:    "add a given lyph to a given layer location",
		deleteSummary: "remove a given lyph from a given layer location"
	}
);
addRelationship(
	$, 'Layer', 'coalescesWith', {},
	$, 'Layer', 'coalescesWith', {},
	{
		symmetric:     true,
		antiReflexive: true,
		getSummary:    "find all layers that coalesce with a given layer",
		putSummary:    "make two given layers coalesce",
		deleteSummary: "make two coalescing layers not coalesce"
	}
);
addRelationship(
	$, 'Lyph',        'inCompartments', {
		getSummary:    "find all compartments in which a given lyph is a member",
		putSummary:    "add a given lyph to a given compartment as a member",
		deleteSummary: "remove a given lyph from a given compartment as a member"
	},
	$, 'Compartment', 'lyphs',          {}
);
addRelationship(
	1, 'Lyph',           'locatedMeasures', {
		getSummary:    "find all located measures associated with a given lyph",
		putSummary:    "associate a given located measure with a given lyph",
		deleteSummary: "remove a given located measure associated with a given lyph"
	},
	$, 'LocatedMeasure', 'lyph',            {}
);
for (let side of simpleDataTypes.side.enum) {
	addRelationship(
		1, 'Border', 'layer', {
			setFields: {
				side: { value: side }
			}
		},
		1, 'Layer',   side,   {}
	);
}
addRelationship(
	$, 'Border', 'nodes',   {},
	$, 'Node',   'borders', {}
);
for (let [edgeEnd, direction] of [['source', 'outgoing'], ['target', 'incoming']]) {
	addRelationship(
			1, 'Node',    direction+'Processes', {},
			$, 'Process', edgeEnd,               {}
	);
}
for (let [edgeEnd, direction] of [['source', 'outgoing'], ['target', 'incoming']]) {
	addRelationship(
		1, 'Node',             direction+'PotentialProcesses', {},
		$, 'PotentialProcess', edgeEnd,                        {}
	);
}
addRelationship(
	$, 'Correlation', 'publication',   {},
	1, 'Publication', 'correlations',  {}
);
addRelationship(
	$, 'Correlation',    'locatedMeasures', {},
	$, 'LocatedMeasure', 'correlations',    {}
);
addRelationship(
	$, 'Correlation',   'clinicalIndices', {},
	$, 'ClinicalIndex', 'correlations',    {}
);
addRelationship(
	$, 'LocatedMeasure',   'bagsOfPathologies', {},
	$, 'BagOfPathologies', 'locatedMeasures',   {}
);
addRelationship(
	$, 'LocatedMeasure', 'removedProcesses',           {
		getSummary:    "find all processes 'removed' by a given bag of pathologies",
		putSummary:    "make a given bag of pathologies 'remove' a given process",
		deleteSummary: "stop a given bag of pathologies from 'removing' a given process"
	},
	$, 'Process',        'removedByBagsOfPathologies', {
		getSummary:    "find all bags of pathologies that 'remove' a given process",
		putSummary:    "make a given bag of pathologies 'remove' a given process",
		deleteSummary: "stop a given bag of pathologies from 'removing' a given process"
	}
);
addRelationship(
	$, 'LocatedMeasure',   'addedProcesses',           {
		getSummary:    "find all potential processes 'added' by a given bag of pathologies",
		putSummary:    "make a given bag of pathologies 'add' a given potential process",
		deleteSummary: "stop a given bag of pathologies from 'adding' a given potential process"
	},
	$, 'PotentialProcess', 'addedByBagsOfPathologies', {
		getSummary:    "find all bags of pathologies that 'add' a given potential process",
		putSummary:    "make a given bag of pathologies 'add' a given potential process",
		deleteSummary: "stop a given bag of pathologies from 'adding' a given potential process"
	}
);



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// response templates                                                                                                 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const respondWithListOf = (DataType) => ({
	description: `the list of requested ${resourceTypes[DataType]['x-plural']}`,
	schema: { type: 'array', items: { $ref: `#/definitions/${DataType}` } }
});


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// resource templates                                                                                                 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function basicRestResource(TypeName, {readOnly} = {}) {
	const Type     = resourceTypes[TypeName];
	const plural   = Type['x-plural'];
	const singular = Type['x-singular'];
	return {
		[`/${toCamelCase(plural)}`]: Object.assign({
			get: {
				summary: `find all ${plural}`,
				responses: {
					200: respondWithListOf(TypeName)
				}
			}
		}, readOnly ? {} : {
			post: {
				summary: `create a new ${singular}`,
				responses: {
					201: respondWithListOf(TypeName)
				}
			}
		}),
		[`/${toCamelCase(plural)}/{${toCamelCase(singular)}}`]: Object.assign({
			get: {
				summary: `find ${plural} by id`,
				responses: {
					200: respondWithListOf(TypeName)
				}
			}
		}, readOnly ? {} : {
			put: {
				summary: `replace a given ${singular}`,
				responses: {
					200: respondWithListOf(TypeName)
				}
			},
			post: {
				summary: `update a given ${singular}`,
				responses: {
					200: respondWithListOf(TypeName)
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
		})
	};
}

function basicRestRelation(TypeName1, relName, TypeName2, {getSummary, putSummary, deleteSummary, readOnly} = {}) {
	const Type1     = resourceTypes[TypeName1];
	const plural1   = Type1['x-plural'];
	const singular1 = Type1['x-singular'];
	const Type2     = resourceTypes[TypeName2];
	const plural2   = Type2['x-plural'];
	const singular2 = (TypeName1 === TypeName2 ? "other " : "") + Type2['x-singular'];
	return Object.assign({
		[`/${toCamelCase(plural1)}/{${toCamelCase(singular1)}}/${relName}`]: {
			get: {
				summary: getSummary || `find all the ${plural2} of a given ${singular1}`,
				responses: {
					200: respondWithListOf(TypeName2)
				}
			}
		}
	}, readOnly ? {} : {
		[`/${toCamelCase(plural1)}/{${toCamelCase(singular1)}}/${relName}/{${toCamelCase(singular2)}}`]: {
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
	});
}

function layerBorderRestRelation() {
	return {
		'/layers/{layer}/{side}': {
			get: {
				summary: "find the border on a given side of a given layer",
				responses: {
					200: respondWithListOf('Border')
				}
			}
		}
		// borders are accessed by layer+side, and are automatically (lazily) created when requested
	};
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// creating swagger 'paths' for the resource relations                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let resourceRelationshipsPaths = {};

for (let rel of resourceRelationships) {
	if (rel[1].cardinality === MANY) {
		Object.assign(resourceRelationships,
			basicRestRelation(rel[1].TypeName, rel[1].fieldName, rel[2].TypeName, rel[1].options));
	}
	if (rel[2].cardinality === MANY) {
		Object.assign(resourceRelationships,
			basicRestRelation(rel[2].TypeName, rel[2].fieldName, rel[1].TypeName, rel[2].options));
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

// DONE: enforce that layers of instantiated lyphs correspond to the layer(Template)s of the lyph template
// done by auto-syncing from layerTemplates to layers


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// final Swagger spec                                                                                                 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export let swagger = {
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
		...resourceTypes
	},
	paths: Object.assign(

		resourceRelationships,

		basicRestResource('LyphTemplate'),
		basicRestResource('LayerTemplate'),
		basicRestResource('Lyph'),
		basicRestResource('Compartment'),
		basicRestResource('Layer', { readOnly: true /* layers sync through templates */ }),
		//layerBorderRestRelation(),
		basicRestResource('Border'),
		basicRestResource('Node'),
		basicRestResource('Process'),
		basicRestResource('PotentialProcess'),
		basicRestResource('Correlation'),
		basicRestResource('Publication'),
		basicRestResource('ClinicalIndex'),
		basicRestResource('LocatedMeasure'),
		basicRestResource('BagOfPathologies')

	)
};
