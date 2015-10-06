////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* libraries */
import _  from 'lodash';
import co from 'co';

/* local stuff */
import {
	debugPromise,
	dbOnly,
	pluckDatum
} from '../util.es6.js';
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
import {
	assertResourceExists,
	getSingleResource,
	getAllResources
} from '../common-queries.es6.js';


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
		},
		create: co.wrap(function* ({id, resources}, req) {

			/* assert that the linked lyph template exists */
			// TODO: when this is checked generally in server.es6.js, remove the check here
			yield assertResourceExists(resources['LyphTemplate'], req.body.lyphTemplate);

			/* get that lyph template */
			let [lyphTemplate] = yield getSingleResource(resources['LyphTemplate'], req.body.lyphTemplate);

			/* calculate the position of the new layer */
			let newPosition = Math.min(
				lyphTemplate.layers.length,
				_.isNumber(req.body.position) ? req.body.position : lyphTemplate.layers.length
			);

			/* set correct positions for layer templates and layers, and add new layers */
			yield query([`
				MATCH (layerTemplate:LayerTemplate { id: ${id} })
				SET layerTemplate.position = ${newPosition}
			`, `
				MATCH (lyphTemplate:LyphTemplate { id: ${lyphTemplate.id} })
				      -[:LyphTemplateLayer]->
				      (otherLayerTemplate:LayerTemplate)
				WHERE otherLayerTemplate.position >= ${newPosition} AND NOT otherLayerTemplate.id = ${id}
				SET otherLayerTemplate.position = otherLayerTemplate.position + 1
				WITH otherLayerTemplate
				MATCH (otherLayerTemplate) -[:LayerTemplateInstantiation]-> (layer:Layer)
				SET layer.position = layer.position + 1
			`, LOCK_UID, `
				MATCH (layerTemplate:LayerTemplate { id: ${id} })
				      <-[:LyphTemplateLayer]-
				      (lyphTemplate:LyphTemplate   { id: ${lyphTemplate.id} })
				      -[:LyphTemplateInstantiation]->
				      (lyph:Lyph)
				${WITH_NEW_IDS('lyph', 'newLayerID', ['layerTemplate'])}
				CREATE UNIQUE (lyph)
				              -[:LyphLayer]->
				              (layer:Layer { id: newLayerID, type: 'Layer', position: ${newPosition} })
				              <-[:LayerTemplateInstantiation]-
				              (layerTemplate)
			`]);

		}),
		delete: co.wrap(function* ({id}) {
			yield query(`
				MATCH (otherLayerTemplate:LayerTemplate)
				      <-[:LyphTemplateLayer]-
				      (lyphTemplate:LyphTemplate)
				      -[:LyphTemplateLayer]->
				      (layerTemplate:LayerTemplate { id: ${id} })
				WHERE otherLayerTemplate.position > layerTemplate.position
				SET otherLayerTemplate.position = otherLayerTemplate.position - 1
				WITH otherLayerTemplate
				MATCH (otherLayerTemplate) -[:LayerTemplateInstantiation]-> (layer:Layer)
				SET layer.position = layer.position - 1
			`);
		})
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
		create: co.wrap(function* ({id, resources}, req) {

			/* assert that the specified lyph template exists */
			// TODO: when this is checked generally in server.es6.js, remove the check here
			yield assertResourceExists(resources['LyphTemplate'], req.body.template);

			/* add layers to that new lyph corresponding to the lyph template */
			yield query([LOCK_UID, `
				MATCH (lyphTemplate:LyphTemplate { id: ${req.body.template} })
				      -[:LyphTemplateLayer]->
				      (layerTemplate:LayerTemplate)
				${WITH_NEW_IDS('layerTemplate', 'newLayerId')}
				MATCH (lyph:Lyph { id: ${id} })
				CREATE UNIQUE (lyph)
				              -[:LyphLayer]->
				              (layer:Layer {id: newLayerId, type: "Layer", position: layerTemplate.position})
				              <-[:LayerTemplateInstantiation]-
				              (layerTemplate)
			`]);

		})
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
