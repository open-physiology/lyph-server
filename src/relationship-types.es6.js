export default {
	processes:      { // node --> node
		singular: "process",
		plural:   "processes",
		schema:   {
			properties: {
				type:    { type: 'string', required: true },
				subtype: { type: 'string' }
			}
		}
	},
	instantiates:   { // lyph --> lyphTemplate, layer --> layerTemplate
		schema: {
			properties: {}
		}
	},
	hasLayer:       { // lyph --> layer, lyphTemplate --> layerTemplate
		schema: {
			properties: {
				position: { type: 'number', required: true }
			}
		}
	},
	hasMaterial:    { // layer --> lyph, from layerTemplate, to lyphTemplate
		schema: {
			properties: {}
		}
	},
	onBorderOf:     { // node --> layer
		schema: {
			properties: {
				border: { enum: ['plus', 'minus', 'inner', 'outer'], required: true }
			}
		}
	},
	publishedIn:    { // correlation --> publication
		schema: {
			properties: {}
		}
	},
	correlates:     { // correlation --> clinicalIndex/locatedMeasure
		schema: {
			properties: {}
		}
	},
	sub:            { // clinicalIndex --> clinicalIndex
		schema: {
			properties: {}
		}
	},
	locatedIn:      { // locatedMeasure --> lyph
		schema: {
			properties: {}
		}
	},
	associatedWith: { // bagOfPathologies --> locatedMeasure
		schema: {
			properties: {}
		}
	}
};
