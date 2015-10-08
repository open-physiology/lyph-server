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
	pluckDatum,
	customError,
	isCustomError,
	cleanCustomError,
	inspect
} from '../util.es6.js';
import {
	uriSchema,
	polaritySchema
} from '../simpleDataTypes.es6.js';
import {
	query,
	creationQuery
} from '../neo4j.es6.js';
import {
	assertResourceExists,
	getSingleResource,
	getAllResources,
	createResource
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
			yield assertResourceExists(resources.LyphTemplate, req.body.lyphTemplate);

			/* get that lyph template */
			let [lyphTemplate] = yield getSingleResource(resources.LyphTemplate, req.body.lyphTemplate);

			/* calculate the position of the new layer */
			let newPosition = Math.min(
				lyphTemplate.layers.length,
				_.isNumber(req.body.position) ? req.body.position : lyphTemplate.layers.length
			);

			/* set correct positions for existing layer templates and layers, and return info on relevant lyphs */
			let lyphsIdsToAddLayerTo = yield query([`
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
			`, `
				MATCH (layerTemplate:LayerTemplate { id: ${id} })
				      <-[:LyphTemplateLayer]-
				      (lyphTemplate:LyphTemplate   { id: ${lyphTemplate.id} })
				      -[:LyphTemplateInstantiation]->
				      (lyph:Lyph)
				RETURN lyph.id AS id
			`]);

			/* add the new layers */
			for (let {id: lyphId} of lyphsIdsToAddLayerTo) {
				try {
					yield createResource(resources.Layer, {
						position: newPosition,
						lyph:     lyphId,
						template: id
					});
				} catch (err) {
					if (isCustomError(err)) { throw cleanCustomError(err) }
					throw err;
				}
			}

		}),
		delete: co.wrap(function* ({id}) {
			/* shift layer positioning after deletion of this layer */
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
			/* get info on all relevant layer templates */
			let layerTemplateIds = yield query(`
				MATCH (lyphTemplate:LyphTemplate { id: ${req.body.template} })
				      -[:LyphTemplateLayer]->
				      (layerTemplate:LayerTemplate)
				RETURN layerTemplate.id AS id, layerTemplate.position AS position
			`);

			/* and add layers to the new lyph corresponding to those layer templates */
			for (let {id: layerTemplateId, position} of layerTemplateIds) {
				try {
					yield createResource(resources.Layer, {
						position: position,
						lyph:     id,
						template: layerTemplateId
					});
				} catch (err) {
					if (isCustomError(err)) { throw cleanCustomError(err) }
					throw err;
				}
			}
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
		readOnly: true, // four borders are added automatically to all layers
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
