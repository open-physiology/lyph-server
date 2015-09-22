import {simpleDataTypes} from '../simpleDataTypes.es6.js';


/* cardinalities */
export const ONE  = Symbol('ONE');
export const MANY = Symbol('MANY');
const $ = MANY;


/* relationships */
export const relationships = [[
	1, 'LyphTemplate',  'layers',       {},
	$, 'LayerTemplate', 'lyphTemplate', { indexFieldName: 'position' }
], [
	$, 'LayerTemplate', 'materials',  {
		getSummary:    "find all lyph templates acting as materials in a given layer template",
		putSummary:    "add a given lyph template to a given layer template as a material",
		deleteSummary: "remove a given lyph template from a given layer template as material"
	},
	$, 'LyphTemplate',  'materialIn', {
		getSummary:    "find the layer templates in which a given lyph template is a material",
		putSummary:    "add a given lyph template to a given layer template as a material",
		deleteSummary: "remove a given lyph template from a given layer template as material"
	}
], [
	1, 'LyphTemplate',  'instantiations', {
		getSummary: "find all lyphs instantiated from a given lyph template"
	},
	$, 'Lyph',          'template',       {},
	{
		readOnly: true // instantiation has 1 template from creation
	}
], [
	1, 'LayerTemplate', 'instantiations', {
		getSummary: "find all layers instantiated from a given layer template"
	},
	$, 'Layer',         'template',       {},
	{
		readOnly: true // instantiation has 1 template from creation
	}
], [
	1, 'Lyph',  'layers', {},
	$, 'Layer', 'lyph',   {},
	{
		readOnly: true // layers sync through templates
	}
], [
	$, 'Layer', 'childLyphs', {
		getSummary:    "find all lyphs that are located in a given layer",
		putSummary:    "add a given lyph into a given layer",
		deleteSummary: "remove a given lyph from inside a given layer"
	},
	$, 'Lyph',  'inLayers',   {
		getSummary:    "find the layer(s) in which a given lyph is located",
		putSummary:    "add a given lyph to a given layer location",
		deleteSummary: "remove a given lyph from a given layer location"
	}
], [
	$, 'Layer', 'coalescesWith', {},
	$, 'Layer', 'coalescesWith', {},
	{
		symmetric:     true,
		antiReflexive: true,
		getSummary:    "find all layers that coalesce with a given layer",
		putSummary:    "make two given layers coalesce",
		deleteSummary: "make two coalescing layers not coalesce"
	}
], [
	$, 'Lyph',        'inCompartments', {
		getSummary:    "find all compartments in which a given lyph is a member",
		putSummary:    "add a given lyph to a given compartment as a member",
		deleteSummary: "remove a given lyph from a given compartment as a member"
	},
	$, 'Compartment', 'lyphs',          {}
], [
	1, 'Lyph',           'locatedMeasures', {
		getSummary:    "find all located measures associated with a given lyph",
		putSummary:    "associate a given located measure with a given lyph",
		deleteSummary: "remove a given located measure associated with a given lyph"
	},
	$, 'LocatedMeasure', 'lyph',            {}
], ...(simpleDataTypes.side.enum.map(side => [
	1, 'Border', 'layer', {
		setFields: {
			side: { value: side }
		}
	},
	1, 'Layer',   side,   {}
])), [
	$, 'Border', 'nodes',   {},
	$, 'Node',   'borders', {}
], ...([['source', 'outgoing'], ['target', 'incoming']].map(([edgeEnd, direction]) => [
	1, 'Node',    direction+'Processes', {},
	$, 'Process', edgeEnd,               {}
])), ...([['source', 'outgoing'], ['target', 'incoming']].map(([edgeEnd, direction]) => [
	1, 'Node',             direction+'PotentialProcesses', {},
	$, 'PotentialProcess', edgeEnd,                        {}
])), [
	$, 'Correlation', 'publication',   {},
	1, 'Publication', 'correlations',  {}
], [
	$, 'Correlation',    'locatedMeasures', {},
	$, 'LocatedMeasure', 'correlations',    {}
], [
	$, 'Correlation',   'clinicalIndices', {},
	$, 'ClinicalIndex', 'correlations',    {}
], [
	$, 'LocatedMeasure',   'bagsOfPathologies', {},
	$, 'BagOfPathologies', 'locatedMeasures',   {}
], [
	$, 'LocatedMeasure', 'removedProcesses',           {
		getSummary:    "find all processes 'removed' by a given bag of pathologies",
		putSummary:    "make a given bag of pathologies 'remove' a given process",
		deleteSummary: "stop a given bag of pathologies from 'removing' a given process"
	},
	$, 'Process',        'removedByBagsOfPathologies', {
		getSummary:    "find all bags of pathologies that 'remove' a given process",
		putSummary:    "make a given bag of pathologies 'remove' a given process",
		deleteSummary: "stop a given bag of pathologies from 'removing' a given process"
	}
], [
	$, 'LocatedMeasure',   'addedProcesses',           {
		getSummary:    "find all potential processes 'added' by a given bag of pathologies",
		putSummary:    "make a given bag of pathologies 'add' a given potential process",
		deleteSummary: "stop a given bag of pathologies from 'adding' a given potential process"
	},
	$, 'PotentialProcess', 'addedByBagsOfPathologies', {
		getSummary:    "find all bags of pathologies that 'add' a given potential process",
		putSummary:    "make a given bag of pathologies 'add' a given potential process",
		deleteSummary: "stop a given bag of pathologies from 'adding' a given potential process"
	}
]];


/* cardinality shorthand */
for (let rel of relationships) {
	if (rel[0] === 1) { rel[0] = ONE }
}
