import {simpleDataTypes} from '../simpleDataTypes.es6.js';

export const resources = {

	LyphTemplate: {
		singular: "lyph template",
		plural:   "lyph templates",
		properties: {
			name: { type: 'string' }
		},
		required: ['name']
	},

	LayerTemplate: {
		singular: "layer template",
		plural:   "layer templates",
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
		singular: "lyph",
		plural:   "lyphs",
		properties: {
			name:     { type: 'string' },
			species:  { type: 'string' },
			length:   { type: 'number', minimum: 0 },
			closedAt: {
				type:        'array',
				items:       simpleDataTypes.polarity,
				uniqueItems: true,
				maxItems:    2
			}
		},
		required: ['name', 'species']
	},

	Layer: {
		singular: "layer",
		plural:   "layers",
		properties: {},
		readOnly:   true // layers are added automatically for each lyph based on layer templates
	},

	Compartment: {
		singular: "compartment",
		plural:   "compartments",
		properties: {}
	},

	Border: {
		singular: "border",
		plural:   "borders",
		properties: {}
	},

	Node: {
		singular: "node",
		plural:   "nodes",
		properties: {}
	},

	Correlation: {
		singular: "correlation",
		plural:   "correlations",
		properties: {
			comment: { type: 'string' }
		}
	},

	Publication: {
		singular: "publication",
		plural:   "publications",
		properties: {
			uri:   simpleDataTypes.uri,
			title: { type: 'string' }
		},
		required: ['uri']
	},

	ClinicalIndex: {
		singular: "clinical index",
		plural:   "clinical indices",
		properties: {
			uri:   simpleDataTypes.uri,
			title: { type: 'string' }
		},
		required: ['uri']
	},

	LocatedMeasure: {
		singular: "located measure",
		plural:   "located measures",
		properties: {
			quality: { type: 'string' }
		},
		required: ['quality']
	},

	BagOfPathologies: {
		singular: "bag of pathologies",
		plural:   "bags of pathologies",
		properties: {}
	},

	Process: {
		singular: "process",
		plural:   "processes",
		properties: {}
	},

	PotentialProcess: {
		singular: "potential process",
		plural:   "potential processes",
		properties: {}
	}
};

// TODO: for swagger, set "type: 'object'" on each of these
// TODO: for swagger, put singular / plural / etc as "x-<property>"
