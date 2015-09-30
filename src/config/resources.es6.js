////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* external libs */
import _ from 'lodash';

/* local stuff */
import {
	uriSchema,
	polaritySchema
} from '../simpleDataTypes.es6.js';
import {
	query,
	LOCK_UID,
	THEN,
	END,
	WITH_NEW_ID,
	WITH_NEW_IDS
} from '../neo4j.es6.js';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// convenience functions                                                                                              //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* get right to the data from a Neo4j response */
const pluckData = (name) => (res) => res.map((obj) => obj[name]);

/* to pick only those properties that should not be skipped from the database */
const dbOnly = (type, allProperties) => _.omit(allProperties, (__, prop) =>
	type.schema.properties[prop] &&
	type.schema.properties[prop]['x-skip-db']
);


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// the resource types                                                                                                 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const resources = {

	LyphTemplate: {
		singular: "lyph template",
		plural:   "lyph templates",
		schema: {
			properties: {
				name: { type: 'string', 'x-required': true }
			}
		}
	},

	LayerTemplate: {
		singular: "layer template",
		plural:   "layer templates",
		schema: {
			properties: {
				name:      { type: 'string' },
				thickness: {
					type:     'array', // [min, max]
					items:    { type: 'number', minimum: 0 },
					minItems: 2,
					maxItems: 2
				}
			}
		}
	},

	Lyph: {
		singular: "lyph",
		plural:   "lyphs",
		schema: {
			properties: {
				name:     { type: 'string', 'x-required': true },
				species:  { type: 'string', 'x-required': true },
				length:   { type: 'number', minimum: 0 },
				closedAt: {
					type:        'array',
					items:       polaritySchema,
					uniqueItems: true,
					maxItems:    2
				}
			}
		},
		create({type}, req) {
			return query([
				LOCK_UID,
				{
					statement: `
						MATCH (lyphTemplate:LyphTemplate {id: ${req.body.template}}) -[:LyphTemplateLayer]-> (layerTemplate:LayerTemplate)
						${WITH_NEW_IDS('layerTemplate', 'newLayerId', ['newLyphId'], ['lyphTemplate'])}
						CREATE UNIQUE (lyphTemplate)
						                   -[:LyphTemplateInstantiation]->
						              (lyph:Lyph {id: newLyphId,  type: "Lyph"})
						                   -[:LyphLayer]->
						              (layer:Layer {id: newLayerId, type: "Layer", position: layerTemplate.position})
						                  <-[:LayerTemplateInstantiation]-
						              (layerTemplate)
						SET lyph += {dbProperties}
						WITH DISTINCT lyph
						RETURN lyph
					`,
					parameters: {  dbProperties: dbOnly(type, req.body)  }
				}
			]).then(pluckData('lyph'));
		}
	},

	Layer: {
		singular: "layer",
		plural:   "layers",
		readOnly: true, // layers are added automatically for each lyph based on layer templates
		schema: {
			properties: {}
		}
	},

	Compartment: {
		singular: "compartment",
		plural:   "compartments",
		schema: {
			properties: {}
		}
	},

	Border: {
		singular: "border",
		plural:   "borders",
		schema: {
			properties: {}
		}
	},

	Node: {
		singular: "node",
		plural:   "nodes",
		schema: {
			properties: {}
		}
	},

	Correlation: {
		singular: "correlation",
		plural:   "correlations",
		schema: {
			properties: {
				comment: { type: 'string' }
			}
		}
	},

	Publication: {
		singular: "publication",
		plural:   "publications",
		schema: {
			properties: {
				uri:   { ...uriSchema, 'x-required': true },
				title: { type: 'string' }
			}
		}
	},

	ClinicalIndex: {
		singular: "clinical index",
		plural:   "clinical indices",
		schema: {
			properties: {
				uri:   { ...uriSchema, 'x-required': true },
				title: { type: 'string' }
			}
		}
	},

	LocatedMeasure: {
		singular: "located measure",
		plural:   "located measures",
		schema: {
			properties: {
				quality: { type: 'string', 'x-required': true }
			}
		}
	},

	BagOfPathologies: {
		singular: "bag of pathologies",
		plural:   "bags of pathologies",
		schema: {
			properties: {}
		}
	},

	Process: {
		singular: "process",
		plural:   "processes",
		schema: {
			properties: {}
		}
	},

	PotentialProcess: {
		singular: "potential process",
		plural:   "potential processes",
		schema: {
			properties: {}
		}
	}
};

// TODO: LyphMap     (a sort of superclass of LyphTemplate, which also knows about thickness distributions of layers)
//     : LyphFactory (a superclass of LyphMap, which also has outside thickness distribution)
