export default {
	lyphs:             {
		singular: "lyph",
		plural:   "lyphs",
		schema:   {
			properties: {
				name:    { type: 'string' },
				species: { type: 'string' }
			},
			required:   ['name', 'species']
		}
	},
	layers:            {
		singular: "layer",
		plural:   "layers",
		schema:   {
			properties: {
				name:      { type: 'string' },
				thickness: {
					type:       'object',
					properties: { min: { type: 'number' }, max: { type: 'number' } },
					required:   ['min', 'max']
				}
			},
			required:   ['thickness']
		}
	},
	lyphTemplates:     {
		singular: "lyph template",
		plural:   "lyph templates",
		schema:   {
			properties: {
				name:      { type: 'string' },
				thickness: {
					type:       'object',
					properties: { min: { type: 'number' }, max: { type: 'number' } },
					required:   ['min', 'max']
				}
			},
			required:   ['name', 'thickness']
		}
	},
	layerTemplates:    {
		singular: "layer template",
		plural:   "layer templates",
		schema:   {
			properties: {
				name:      { type: 'string' },
				thickness: {
					type:       'object',
					properties: { min: { type: 'number' }, max: { type: 'number' } },
					required:   ['min', 'max']
				}
			},
			required:   ['thickness']
		}
	},
	nodes:             {
		singular: "node",
		plural:   "nodes",
		schema:   {
			properties: {},
			required:   []
		}
	},
	correlations:      {
		singular: "correlation",
		plural:   "correlations",
		schema:   {
			properties: {
				comment: { type: 'string' }
			},
			required:   []
		}
	},
	publications:      {
		singular: "publication",
		plural:   "publications",
		schema:   {
			properties: {
				uri:   { type: 'string' },
				title: { type: 'string' }
			},
			required:   ['uri']
		}
	},
	clinicalIndices:   {
		singular: "clinical index",
		plural:   "clinical indices",
		schema:   {
			properties: {
				label: { type: 'string' },
				index: { type: 'number' }
			},
			required:   ['index']
		}
	},
	locatedMeasures:   {
		singular: "located measures",
		plural:   "located measures",
		schema:   {
			properties: {
				quality: { type: 'string' }
			},
			required:   ['quality']
		}
	},
	bagsOfPathologies: {
		singular: "bag of pathologies",
		plural:   "bags of pathologies",
		schema:   {
			properties: {},
			required:   []
		}
	}
};
