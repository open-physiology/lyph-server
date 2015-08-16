const TYPES = {
	lyph:             {
		singular: "lyph",
		plural:   "lyphs",
		schema:   {
			properties: {
				name:     { type: 'string', required: true },
				species:  { type: 'string', required: true },
				template: { type: 'integer', required: true, db: false }
			}
		}
	},
	layer:            {
		singular:   "layer",
		plural:     "layers",
		schema:     {
			properties: {}
		},
		noRestCrud: true
	},
	lyphTemplate:     {
		singular: "lyph template",
		plural:   "lyph templates",
		schema:   {
			properties: {
				name: { type: 'string', required: true }
			}
		}
	},
	layerTemplate:    {
		singular: "layer template",
		plural:   "layer templates",
		schema:   {
			properties: {
				name:         { type: 'string' },
				thickness:    {
					// array of [min, max]
					type:     'array',
					items:    { type: 'number' },
					required: true
				},
				lyphTemplate: { type: 'integer', required: true, db: false },
				position:     { type: 'integer' }
			}
		}
	},
	node:             {
		singular: "node",
		plural:   "nodes",
		schema:   {
			properties: {}
		}
	},
	correlation:      {
		singular: "correlation",
		plural:   "correlations",
		schema:   {
			properties: {
				comment: { type: 'string' }
			}
		}
	},
	publication:      {
		singular: "publication",
		plural:   "publications",
		schema:   {
			properties: {
				uri:   { type: 'string', required: true },
				title: { type: 'string' }
			}
		}
	},
	clinicalIndex:    {
		singular: "clinical index",
		plural:   "clinical indices",
		schema:   {
			properties: {
				index: { type: 'number', required: true },
				label: { type: 'string' }
			}
		}
	},
	locatedMeasure:   {
		singular: "located measures",
		plural:   "located measures",
		schema:   {
			properties: {
				quality: { type: 'string', required: true }
			}
		}
	},
	bagOfPathologies: {
		singular: "bag of pathologies",
		plural:   "bags of pathologies",
		schema:   {
			properties: {
				excludedProcesses:   { type: 'array', items: { type: 'number' }, uniqueItems: true },
				introducedProcesses: { type: 'array', items: { type: 'number' }, uniqueItems: true }
			}
		}
	}
};

export default TYPES;
