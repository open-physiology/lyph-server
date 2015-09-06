////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// general utility functions                                                                                          //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function toCamelCase(str) {
	return str
		.replace(/\s(.)/g, (l) => l.toUpperCase())
		.replace(/\s/g, '')
		.replace(/^(.)/,   (l) => l.toLowerCase());
}


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
// data types                                                                                                         //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export let dataTypes = {

	LyphTemplate: {
		'x-singular':     "lyph template",
		'x-plural':       "lyph templates",
		type: 'object',
		properties: {
			name:           { type: 'string' },
			layers:         $list($ref('key')), //
			materialIn:     $list($ref('key')), //
			instantiations: $list($ref('key'))  //
		},
		required: ['name']
	},

	LayerTemplate: {
		'x-singular': "layer template",
		'x-plural':   "layer templates",
		type: 'object',
		properties: {
			name:           { type: 'string' },
			lyphTemplate:   $ref('key'),        //
			materials:      $list($ref('key')), //
			instantiations: $list($ref('key')), //
			position:       { type: 'integer', minimum: 0 },
			thickness:      {
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
			name:            { type: 'string' },
			species:         { type: 'string' },
			template:        $ref('key'),        //
			layers:          $list($ref('key')), //
			location:        $ref('key'),        //
			inLayers:        $list($ref('key')),
			locatedMeasures: $list($ref('key')),
			inCompartments:  $list($ref('key')),
			closedAt: {
				type: 'array',
				items: $ref('polarity'),
				uniqueItems: true,
				maxItems:    2
			}
		},
		required: ['name', 'species', 'template']
	},

	Layer: {
		'x-singular': "layer",
		'x-plural':   "layers",
		type: 'object',
		properties: {
			template:      $ref('key'),        //
			lyph:          $ref('key'),        //
			lyphs:         $list($ref('key')), //
			coalescesWith: $list($ref('key')),
			'plus':        $list($ref('key')),
			'minus':       $list($ref('key')),
			'inner':       $list($ref('key')),
			'outer':       $list($ref('key'))
		},
		required: ['template', 'lyph']
	},

	Compartment: {
		'x-singular': "compartment",
		'x-plural':   "compartments",
		properties: {
			lyphs: $list($ref('key'))
		}
	},

	Border: {
		'x-singular': "border",
		'x-plural':   "borders",
		type: 'object',
		properties: {
			layer: $ref('key'),
			side:  $ref('side'),
			nodes: $list($ref('key'))
		},
		required: ['layer', 'side']
	},

	Node: {
		'x-singular': "node",
		'x-plural':   "nodes",
		type: 'object',
		properties: {
			borders: $list($ref('key'))
			// TODO: incomingProcesses, outgoingProcesses
		}
	},

	Correlation: {
		'x-singular': "correlation",
		'x-plural':   "correlations",
		type: 'object',
		properties: {
			publication:     $ref('key'),
			comment:         { type: 'string' },
			clinicalIndices: $list($ref('key')),
			locatedMeasures: $list($ref('key'))
		},
		required: ['publication']
	},

	Publication: {
		'x-singular': "publication",
		'x-plural':   "publications",
		type: 'object',
		properties: {
			uri:          $ref('uri'),
			title:        { type: 'string' },
			correlations: $list($ref('key'))
		},
		required: ['uri']
	},

	ClinicalIndex: {
		'x-singular': "clinical index",
		'x-plural':   "clinical indices",
		type: 'object',
		properties: {
			uri:          $ref('uri'),
			title:        { type: 'string' },
			correlations: $list($ref('key'))
		},
		required: ['uri']
	},

	LocatedMeasure: {
		'x-singular': "located measure",
		'x-plural':   "located measures",
		type: 'object',
		properties: {
			quality:           { type: 'string' },
			lyph:              $ref('key'),
			correlations:      $list($ref('key')),
			bagsOfPathologies: $list($ref('key'))
		},
		required: ['quality']
	},

	BagOfPathologies: {
		'x-singular': "bag of pathologies",
		'x-plural':   "bags of pathologies",
		type: 'object',
		properties: {
			locatedMeasures:  $list($ref('key')),
			removedProcesses: $list($ref('key')),
			addedProcesses:   $list($ref('key'))
		}
	},

	Process: {
		'x-singular': "process",
		'x-plural':   "processes",
		type: 'object',
		properties: {
			source:                     $ref('key'),
			target:                     $ref('key'),
			removedByBagsOfPathologies: $list($ref('key'))
		},
		required: ['source', 'target']
	},

	PotentialProcess: {
		'x-singular': "potential process",
		'x-plural':   "potential processes",
		type: 'object',
		properties: {
			source:                   $ref('key'),
			target:                   $ref('key'),
			addedByBagsOfPathologies: $list($ref('key'))
		},
		required: ['source', 'target']
	}
};



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// resource relationships                                                                                             //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export let dataRelationships = {};

const $ = Symbol('many');
function addRelationship(c1, TypeName1, name2to1, c2, TypeName2, name1to2) {
	
}

addRelationship(
	1, 'LyphTemplate',  'lyphTemplate',
	$, 'LayerTemplate', 'layers'
);
addRelationship(
	$, 'LayerTemplate', 'materialIn',
	$, 'LyphTemplate',  'materials'
);
addRelationship(
	1, 'LyphTemplate',  'template',
	$, 'Lyph',          'instantiations'
);
addRelationship(
	1, 'LayerTemplate', 'template',
	$, 'Layer',         'instantiations'
);
addRelationship(
	1, 'Lyph',  'lyph',
	$, 'Layer', 'layers'
);
addRelationship(
	$, 'Layer', 'locatedIn',
	$, 'Lyph',  'locations'
);
addRelationship(
	$, 'Layer', 'coalescesWith',
	$, 'Layer', 'coalescesWith'
);
addRelationship(
	1, '', '',
	$, '', ''
);
addRelationship(
	1, '', '',
	$, '', ''
);
addRelationship(
	1, '', '',
	$, '', ''
);
addRelationship(
	1, '', '',
	$, '', ''
);



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// response templates                                                                                                 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const respondWithListOf = (DataType) => ({
	description: `the list of requested ${dataTypes[DataType]['x-plural']}`,
	schema: { type: 'array', items: { $ref: `#/definitions/${DataType}` } }
});


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// resource templates                                                                                                 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function basicResource(TypeName, {readOnly} = {}) {
	const Type     = dataTypes[TypeName];
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

function basicRelation(TypeName1, relName, TypeName2, {getSummary, putSummary, deleteSummary, readOnly} = {}) {
	const Type1     = dataTypes[TypeName1];
	const plural1   = Type1['x-plural'];
	const singular1 = Type1['x-singular'];
	const Type2     = dataTypes[TypeName2];
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

function layerBorderRelation() {
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
		...dataTypes
	},
	paths: Object.assign(

		// // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // //

		basicResource('LyphTemplate'),
		basicRelation('LyphTemplate', 'layers', 'LayerTemplate'),
		basicRelation('LyphTemplate', 'materialIn', 'LayerTemplate', {
			getSummary:    "find the layer templates in which a given lyph template is a material",
			putSummary:    "add a given lyph template to a given layer template as a material",
			deleteSummary: "remove a given lyph template from a given layer template as material"
		}),
		basicRelation('LyphTemplate', 'instantiations', 'Lyph', {
			getSummary:    "find all lyphs instantiated from a given lyph template",
			readOnly:      true // instantiation has 1 template from creation
		}),

		// // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // //

		basicResource('LayerTemplate'),
		basicRelation('LayerTemplate', 'materials', 'LyphTemplate', {
			getSummary:    "find all lyph templates acting as materials in a given layer template",
			putSummary:    "add a given lyph template to a given layer template as a material",
			deleteSummary: "remove a given lyph template from a given layer template as material"
		}),
		basicRelation('LayerTemplate', 'instantiations', 'Layer', {
			getSummary:    "find all layers instantiated from a given layer template",
			readOnly:      true // instantiation has 1 template from creation
		}),

		// // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // //

		basicResource('Lyph'),
		basicRelation('Lyph', 'layers', 'Layer', {
			readOnly:      true // layers sync through templates
		}),
		basicRelation('Lyph', 'locatedMeasures', 'LocatedMeasure', {
			getSummary:    "find all located measures associated with a given lyph",
			putSummary:    "associate a given located measure with a given lyph",
			deleteSummary: "remove a given located measure associated with a given lyph"
		}),
		basicRelation('Lyph', 'inCompartments', 'Compartment', {
			getSummary:    "find all compartments in which a given lyph is a member",
			putSummary:    "add a given lyph to a given compartment as a member",
			deleteSummary: "remove a given lyph from a given compartment as a member"
		}),
		basicRelation('Lyph', 'inLayers', 'Layer', {
			getSummary:    "find the layer(s) in which a given lyph is located",
			putSummary:    "add a given lyph to a given layer location",
			deleteSummary: "remove a given lyph from a given layer location"
		}),

		// // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // //

		basicResource('Compartment'),
		basicRelation('Compartment', 'lyphs', 'Lyph'),

		// // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // //

		basicResource('Layer', {
			readOnly:      true // layers sync through templates
		}),
		basicRelation('Layer', 'lyphs', 'Lyph', {
			getSummary:    "find all lyphs that are located in a given layer",
			putSummary:    "add a given lyph into a given layer",
			deleteSummary: "remove a given lyph from inside a given layer"
		}),
		basicRelation('Layer', 'coalescesWith', 'Layer', {
			getSummary:    "find all layers that coalesce with a given layer",
			putSummary:    "make two given layers coalesce",
			deleteSummary: "make two coalescing layers not coalesce"
		}),
		layerBorderRelation(),

		// // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // //

		basicResource('Border'),
		basicRelation('Border', 'nodes', 'Node'),

		// // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // //

		basicResource('Node'),
		basicRelation('Node', 'borders', 'Border'),

		// // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // //

		basicResource('Process'),
		basicRelation('Process', 'removedByBagsOfPathologies', 'BagOfPathologies', {
			getSummary:    "find all bags of pathologies that 'remove' a given process",
			putSummary:    "make a given bag of pathologies 'remove' a given process",
			deleteSummary: "stop a given bag of pathologies from 'removing' a given process"
		}),

		// // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // //

		basicResource('PotentialProcess'),
		basicRelation('PotentialProcess', 'addedByBagsOfPathologies', 'BagOfPathologies', {
			getSummary:    "find all bags of pathologies that 'add' a given potential process",
			putSummary:    "make a given bag of pathologies 'add' a given potential process",
			deleteSummary: "stop a given bag of pathologies from 'adding' a given potential process"
		}),

		// // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // //

		basicResource('Correlation'),
		basicRelation('Correlation', 'clinicalIndices', 'ClinicalIndex'),
		basicRelation('Correlation', 'locatedMeasures', 'LocatedMeasure'),

		// // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // //

		basicResource('Publication'),
		basicRelation('Publication', 'correlations', 'Correlation'),

		// // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // //

		basicResource('ClinicalIndex'),
		basicRelation('ClinicalIndex', 'correlations', 'Correlation'),

		// // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // //

		basicResource('LocatedMeasure'),
		basicRelation('LocatedMeasure', 'correlations', 'Correlation'),
		basicRelation('LocatedMeasure', 'bagsOfPathologies', 'BagOfPathologies'),

		// // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // //

		basicResource('BagOfPathologies'),
		basicRelation('BagOfPathologies', 'locatedMeasures', 'LocatedMeasure'),
		basicRelation('BagOfPathologies', 'removedProcesses', 'Process', {
			getSummary:    "find all processes 'removed' by a given bag of pathologies",
			putSummary:    "make a given bag of pathologies 'remove' a given process",
			deleteSummary: "stop a given bag of pathologies from 'removing' a given process"
		}),
		basicRelation('BagOfPathologies', 'addedProcesses', 'PotentialProcess', {
			getSummary:    "find all potential processes 'added' by a given bag of pathologies",
			putSummary:    "make a given bag of pathologies 'add' a given potential process",
			deleteSummary: "stop a given bag of pathologies from 'adding' a given potential process"
		})

		// // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // //

	)
};
