const TYPES = {
	lyphs: {
		singularKey: "lyph",
		singular: "lyph",
		plural: "lyphs",
		schema: {
			properties: {
				name: {type: 'string', required: true},
				species: {type: 'string', required: true},
				template: {type: 'integer', required: true, skipDB: true},
				location: {type: 'integer', skipDB: true} // a layer, or nothing
			}
		}
	},
	layers: {
		singular: "layer",
		plural: "layers",
		schema: {
			properties: {}
		},
		noRestCrud: true
	},
	compartments: {
		singular: "compartment",
		plural: "compartments",
		schema: {
			properties: {
				lyphs: {
					type: 'array',
					items: {type: 'integer'},
					skipDB: true
				}
			}
		}
	},
	lyphTemplates: {
		singular: "lyph template",
		plural: "lyph templates",
		schema: {
			properties: {
				name: {type: 'string', required: true}
			}
		}
	},
	layerTemplates: {
		singular: "layer template",
		plural: "layer templates",
		schema: {
			properties: {
				name: {type: 'string'},
				thickness: {
					// array of [min, max]
					type: 'array',
					items: {type: 'number'},
					required: true
				},
				lyphTemplate: {type: 'integer', required: true, skipDB: true},
				position: {type: 'integer'}
			}
		}
	},
	nodes: {
		singular: "node",
		plural: "nodes",
		schema: {
			properties: {
				attachments: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							layer: {type: 'integer', required: true},
							border: {enum: ['plus', 'minus', 'inner', 'outer'], required: true}
						}
					},
					minItems: 1,
					required: true,
					skipDB: true
				}
			}
		}
	},
	correlations: {
		singular: "correlation",
		plural: "correlations",
		schema: {
			properties: {
				comment: {type: 'string'}
			}
		}
	},
	publications: {
		singular: "publication",
		plural: "publications",
		schema: {
			properties: {
				uri: {type: 'string', required: true},
				title: {type: 'string'}
			}
		}
	},
	clinicalIndices: {
		singular: "clinical index",
		plural: "clinical indices",
		schema: {
			properties: {
				index: {type: 'number', required: true},
				label: {type: 'string'}
			}
		}
	},
	locatedMeasures: {
		singular: "located measures",
		plural: "located measures",
		schema: {
			properties: {
				quality: {type: 'string', required: true}
			}
		}
	},
	bagsOfPathologies: {
		singular: "bag of pathologies",
		plural: "bags of pathologies",
		schema: {
			properties: {
				excludedProcesses: {type: 'array', items: {type: 'number'}, uniqueItems: true},
				introducedProcesses: {type: 'array', items: {type: 'number'}, uniqueItems: true}
			}
		}
	}
};

export default TYPES;
