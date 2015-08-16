import Kefir from 'kefir';

const TYPES = {
	lyph:             {
		singular: "lyph",
		plural:   "lyphs",
		schema:   {
			properties: {
				name:     { type: 'string',  required: true },
				species:  { type: 'string',  required: true },
				template: { type: 'integer', required: true, db: false }
			}
		}
	},
	layer:            {
		singular: "layer",
		plural:   "layers",
		schema:   {
			properties: {}
		}
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
				name:      { type: 'string' },
				thickness: {
					type:       'object',
					properties: {
						min: { type: 'number', required: true },
						max: { type: 'number', required: true }
					},
					required:   true
				},
				position:  { type: 'integer', db: false }
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
	clinicalIndice:   {
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

for (let key of Object.keys(TYPES)) {
	let type = TYPES[key];
	type.onCreate = Kefir.pool();
	type.onUpdate = Kefir.pool();
	type.onDelete = Kefir.pool();
}

export default TYPES;
