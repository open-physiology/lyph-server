export default {
	process:        { // node --> node
		singular: "process",
		plural:   "processes",
		schema:   {
			properties: {
				class:    { type: 'string', required: true },
				subclass: { type: 'string' }
			}
		}
	},
	instantiates:   { // lyph --> lyphTemplate, layer --> layerTemplate
		schema: {
			properties: {}
		},
		anchors: true // (x) [anchors] (x)Template
	},
	hasLayer:       { // lyph --> layer, lyphTemplate --> layerTemplate
		schema: {
			properties: {}
		},
		sustains: true // lyph(Template) [sustains] layer(Template)
	},
	hasMaterial:    { // layer --> lyph, from layerTemplate, to lyphTemplate
		schema: {
			properties: {}
		},
		anchors: true // layer(Template) [anchors] lyph(Template)
	},
	hasOnBorder:    { // layer --> node
		schema: {
			properties: {
				border: { enum: ['plus', 'minus', 'inner', 'outer'], required: true }
			}
		},
		sustains: true // layer [sustains] node
	},
	publishedIn:    { // correlation --> publication
		schema: {
			properties: {}
		},
		anchors: true // correlation [anchors] publication
	},
	correlates:     { // correlation --> clinicalIndex/locatedMeasure
		schema: {
			properties: {}
		}
	},
	super:          { // clinicalIndex --> clinicalIndex
		schema: {
			properties: {}
		},
		anchors: true // clinicalIndex [anchors] (super) clinicalIndex
	},
	contains:      { // lyph --> locatedMeasure
		schema: {
			properties: {}
		},
		sustains: true // lyph [sustains] locatedMeasure
	},
	associatedWith: { // bagOfPathologies --> locatedMeasure
		schema: {
			properties: {}
		},
		anchors: true // bagOfPathologies [anchors] locatedMeasure
	}
};
