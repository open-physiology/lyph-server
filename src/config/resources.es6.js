////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* libraries */
import _ from '../libs/lodash.es6.js';

/* local stuff */
import {
	customError,
	isCustomError,
	cleanCustomError,
	inspect
} from '../utility.es6.js';
import {
	uriSchema,
	polaritySchema,
	distributionSchema
} from '../simple-data-types.es6.js';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// the resource types                                                                                                 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* symbols for private methods */
const setPosition = ('setPosition');

/* the resources object */
export const resources = {

	LyphTemplate: {
		singular:     "lyph template",
		plural:       "lyph templates",
		abbreviation: "lyphTmp",
		schema: {
			properties: {
				name:  { type: 'string', 'x-required': true },
				fmaID: { type: 'number' },
				oldID: { type: 'number' },
				lengthDistribution: { ...distributionSchema },
				widthDistribution:  { ...distributionSchema }
			}
		}
	},

	LayerTemplate: {
		singular:     "layer template",
		plural:       "layer templates",
		abbreviation: "layerTmp",
		schema: {
			properties: {
				name:      { type: 'string' },
				thickness: {
					type: 'object',
					properties: {
						min: { type: 'number' },
						max: { type: 'number' }
					},
					required: ['min', 'max']
				}
			}
		},
		async [setPosition]({db, id, oldPosition, newPosition}) {
			if (oldPosition === newPosition) { return }
			await db.query([`
				MATCH (layerTemplate:LayerTemplate { id: ${id} })
				SET layerTemplate.position = ${newPosition}
				WITH layerTemplate
				MATCH (layerTemplate)
				      -[:LayerTemplateInstantiation]->
				      (layer:Layer)
				SET layer.position = layerTemplate.position
			`, `
				MATCH (layerTemplate:LayerTemplate { id: ${id} })
				      <-[:LyphTemplateLayer]-
				      (:LyphTemplate)
				      -[:LyphTemplateLayer]->
				      (otherLayerTemplate:LayerTemplate)
				${oldPosition < newPosition ? `
					WHERE ${oldPosition} < otherLayerTemplate.position  AND
					      otherLayerTemplate.position <= ${newPosition} AND
					      NOT otherLayerTemplate.id = ${id}
					SET otherLayerTemplate.position = otherLayerTemplate.position - 1
				` : `
					WHERE ${newPosition} <= otherLayerTemplate.position AND
					      NOT otherLayerTemplate.id = layerTemplate.id
					SET otherLayerTemplate.position = otherLayerTemplate.position + 1
				`}
				WITH otherLayerTemplate
				MATCH (otherLayerTemplate)
				      -[:LayerTemplateInstantiation]->
				      (otherLayer:Layer)
				SET otherLayer.position = otherLayerTemplate.position
			`]);
		},
		async afterCreate({db, id, fields, resources}) {

			/* get that lyph template */
			let [lyphTemplate] = await db.getSpecificResources(resources.LyphTemplate, [fields.lyphTemplate]);

			/* calculate the position of the new layer */
			let newPosition = Math.min(
				lyphTemplate.layers.length,
				_.isNumber(fields.position) ? fields.position : lyphTemplate.layers.length
			);

			/* set correct positions for existing layer templates and layers, and return info on relevant lyphs */
			let lyphsIdsToAddLayerTo = await db.query(`
				MATCH (:LyphTemplate { id: ${lyphTemplate.id} })
				      -[:LyphTemplateInstantiation]->
				      (lyph:Lyph)
				RETURN lyph.id AS id
			`);

			/* add the new layers */
			for (let {id: lyphId} of lyphsIdsToAddLayerTo) {
				try {
					await db.createResource(resources.Layer, {
						position: newPosition,
						lyph:     lyphId,
						template: id
					});
				} catch (err) {
					if (isCustomError(err)) { throw cleanCustomError(err) }
					throw err;
				}
			}

			/* shift all the layers around based on the new position */
			await this[setPosition]({db, id, oldPosition: Infinity, newPosition});

		},
		async afterUpdate({db, id, oldResource, fields, resources}) {

			/* get that lyph template */
			let [lyphTemplate] = await db.getSpecificResources(resources.LyphTemplate, [oldResource.lyphTemplate]);

			/* calculate the new position of the layer */
			let newPosition = Math.min(
				lyphTemplate.layers.length,
				_.isNumber(fields.position) ? fields.position : oldResource.position
			);

			/* shift all the layers around based on the new position */
			await this[setPosition]({db, id, oldPosition: oldResource.position, newPosition});

		},
		async afterReplace({db, id, fields, resources}) {

			/* get this layer template */
			let [layerTemplate] = await db.getSpecificResources(resources.LayerTemplate, [id]);

			/* get that lyph template */
			let [lyphTemplate] = await db.getSpecificResources(resources.LyphTemplate, [layerTemplate.lyphTemplate]);

			/* calculate the new position of the layer */
			let newPosition = Math.min(
				lyphTemplate.layers.length,
				_.isNumber(fields.position) ? fields.position : lyphTemplate.layers.length
			);

			/* shift all the layers around based on the new position */
			await this[setPosition]({db, id, oldPosition: layerTemplate.position, newPosition});

		},
		async beforeDelete({db, id}) {
			/* shift layer positioning after deletion of this layer */
			await db.query(`
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
		async afterCreate({db, id, fields, resources}) {
			/* get info on all relevant layer templates */
			let layerTemplateIds = await db.query(`
				MATCH (lyphTemplate:LyphTemplate { id: ${fields.template} })
				      -[:LyphTemplateLayer]->
				      (layerTemplate:LayerTemplate)
				RETURN layerTemplate.id AS id, layerTemplate.position AS position
			`);

			/* and add layers to the new lyph corresponding to those layer templates */
			for (let {id: layerTemplateId, position} of layerTemplateIds) {
				try {
					await db.createResource(resources.Layer, {
						position: position,
						lyph:     id,
						template: layerTemplateId
					});
				} catch (err) {
					if (isCustomError(err)) { throw cleanCustomError(err) }
					throw err;
				}
			}
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
		readOnly: true, // four borders are added automatically to all layers
		schema: {
			properties: {}
		}
	},

	Correlation: {
		singular:     "correlation",
		plural:       "correlations",
		abbreviation: "corr",
		schema: {
			properties: {
				comment: { type: 'string' }
			}
		}
	},

	Publication: {
		singular:     "publication",
		plural:       "publications",
		abbreviation: "pub",
		schema: {
			properties: {
				uri:   { ...uriSchema, 'x-required': true },
				title: { type: 'string' }
			}
		}
	},

	ClinicalIndex: {
		singular:     "clinical index",
		plural:       "clinical indices",
		abbreviation: "cli",
		schema: {
			properties: {
				uri:   { ...uriSchema, 'x-required': true },
				title: { type: 'string' }
			}
		}
	},

	LocatedMeasure: {
		singular:     "located measure",
		plural:       "located measures",
		abbreviation: "lm",
		schema: {
			properties: {
				quality: { type: 'string', 'x-required': true }
			}
		}
	},

	BagOfPathologies: {
		singular:     "bag of pathologies",
		plural:       "bags of pathologies",
		abbreviation: "bop",
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

	Process: {
		singular:     "process",
		plural:       "processes",
		abbreviation: "p",
		schema: {
			properties: {
				// TODO: integrate potential processes here. no need for two types
			}
		}
	},

	PotentialProcess: {
		singular:     "potential process",
		plural:       "potential processes",
		abbreviation: "pp",
		schema: {
			properties: {}
		}
	},

	CanonicalTree: {
		singular: "canonical tree",
		plural: "canonical trees",
		abbreviation: "ct",
		schema: {
			properties: {
				name: { type: 'string' }
			}
		}
	},

	CanonicalTreeLevel: {
		singular: "canonical tree level",
		plural:   "canonical tree level",
		abbreviation: "ctl",
		schema: {
			properties: {
				name:               { type: 'string' },
				branchingFactor:    { type: 'number' },
				skipProbability:    { type: 'number' }
			}
		},
		async [setPosition]({db, id, oldPosition, newPosition}) {
			if (oldPosition === newPosition) { return }
			await db.query([`
				MATCH (canonicalTreeLevel:CanonicalTreeLevel { id: ${id} })
				SET canonicalTreeLevel.position = ${newPosition}
			`, `
				MATCH (canonicalTreeLevel:CanonicalTreeLevel { id: ${id} })
				      <-[:CanonicalTreeLevel]-
				      (:CanonicalTree)
				      -[:CanonicalTreeLevel]->
				      (otherCanonicalTreeLevel:CanonicalTreeLevel)
				${oldPosition < newPosition ? `
					WHERE ${oldPosition} < otherCanonicalTreeLevel.position  AND
					      otherCanonicalTreeLevel.position <= ${newPosition} AND
					      NOT otherCanonicalTreeLevel.id = ${id}
					SET otherCanonicalTreeLevel.position = otherCanonicalTreeLevel.position - 1
				` : `
					WHERE ${newPosition} <= otherCanonicalTreeLevel.position AND
					      NOT otherCanonicalTreeLevel.id = canonicalTreeLevel.id
					SET otherCanonicalTreeLevel.position = otherCanonicalTreeLevel.position + 1
				`}
			`]);
		},
		async afterCreate({db, id, fields, resources}) {

			/* get that tree level */
			let [tree] = await db.getSpecificResources(resources.CanonicalTree, [fields.tree]);

			/* calculate the position of the new tree level */
			let newPosition = Math.min(
				tree.levels.length,
				_.isNumber(fields.position) ? fields.position : tree.levels.length
			);

			/* shift all the tree levels around based on the new position */
			await this[setPosition]({db, id, oldPosition: Infinity, newPosition});

		},
		async afterUpdate({db, id, oldResource, fields, resources}) {

			/* get that tree */
			let [tree] = await db.getSpecificResources(resources.CanonicalTree, [oldResource.tree]);

			/* calculate the new position of the tree level */
			let newPosition = Math.min(
				tree.levels.length,
				_.isNumber(fields.position) ? fields.position : oldResource.position
			);

			/* shift all the tree levels around based on the new position */
			await this[setPosition]({db, id, oldPosition: oldResource.position, newPosition});

		},
		async afterReplace({db, id, fields, resources}) {

			/* get this tree level */
			let [treeLevel] = await db.getSpecificResources(resources.CanonicalTreeLevel, [id]);

			/* get that tree */
			let [tree] = await db.getSpecificResources(resources.CanonicalTree, [treeLevel.tree]);

			/* calculate the new position of the tree level */
			let newPosition = Math.min(
				tree.levels.length,
				_.isNumber(fields.position) ? fields.position : tree.levels.length
			);

			/* shift all the tree levels around based on the new position */
			await this[setPosition]({db, id, oldPosition: treeLevel.position, newPosition});

		},
		async beforeDelete({db, id}) {
			/* shift level positioning after deletion of this tree level */
			await db.query(`
				MATCH (otherCanonicalTreeLevel:CanonicalTreeLevel)
				      <-[:CanonicalTreeLevel]-
				      (:CanonicalTree)
				      -[:CanonicalTreeLevel]->
				      (canonicalTreeLevel:CanonicalTreeLevel { id: ${id} })
				WHERE otherCanonicalTreeLevel.position > canonicalTreeLevel.position
				SET otherCanonicalTreeLevel.position = otherCanonicalTreeLevel.position - 1
			`);
		}
	},
};
