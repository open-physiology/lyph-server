export const resources = {

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
				type:     'array', // [min, max]
				items:    { type: 'number', minimum: 0 },
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
				type:        'array',
				items:       $ref('polarity'),
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
			uri:   $ref('uri'),
			title: { type: 'string' }
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
