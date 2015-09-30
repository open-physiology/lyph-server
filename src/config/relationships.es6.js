import {sideSchema} from '../simpleDataTypes.es6.js';


/* cardinalities */
export const ONE  = Symbol('ONE');
export const MANY = Symbol('MANY');
const $ = MANY;


/* relationships */
export const relationships = {
	LyphTemplateLayer: [
		'LyphTemplate',     $, 'layers',       {},
		'LayerTemplate',    1, 'lyphTemplate', { indexFieldName: 'position' }
	],
	LayerTemplateMaterial: [
		'LayerTemplate',    $, 'materials',  {
			getSummary:    "find all lyph templates acting as materials in a given layer template",
			putSummary:    "add a given lyph template to a given layer template as a material",
			deleteSummary: "remove a given lyph template from a given layer template as material"
		},
		'LyphTemplate',     $, 'materialIn', {
			getSummary:    "find the layer templates in which a given lyph template is a material",
			putSummary:    "add a given lyph template to a given layer template as a material",
			deleteSummary: "remove a given lyph template from a given layer template as material"
		}
	],
	LyphTemplateInstantiation: [
		'LyphTemplate',     $, 'instantiations', {
			getSummary: "find all lyphs instantiated from a given lyph template"
		},
		'Lyph',             1, 'template',       {},
		{
			readOnly: true // instantiation has 1 template from creation
		}
	],
	LayerTemplateInstantiation: [
		'LayerTemplate',    $, 'instantiations', {
			getSummary: "find all layers instantiated from a given layer template"
		},
		'Layer',            1, 'template',       {},
		{
			readOnly: true // instantiation has 1 template from creation
		}
	],
	LyphLayer: [
		'Lyph',             $, 'layers', {},
		'Layer',            1, 'lyph',   { indexFieldName: 'position' },
		{
			readOnly: true // layers sync through templates
		}
	],
	LayerChildLyph: [
		'Layer',            $, 'childLyphs', {
			getSummary:    "find all lyphs that are located in a given layer",
			putSummary:    "add a given lyph into a given layer",
			deleteSummary: "remove a given lyph from inside a given layer"
		},
		'Lyph',             $, 'inLayers',   {
			getSummary:    "find the layer(s) in which a given lyph is located",
			putSummary:    "add a given lyph to a given layer location",
			deleteSummary: "remove a given lyph from a given layer location"
		}
	],
	LayerCoalescence: [
		'Layer',            $, 'coalescesWith', {},
		'Layer',            $, 'coalescesWith', {},
		{
			symmetric:     true,
			antiReflexive: true,
			getSummary:    "find all layers that coalesce with a given layer",
			putSummary:    "make two given layers coalesce",
			deleteSummary: "make two coalescing layers not coalesce"
		}
	],
	LyphInCompartment: [
		'Lyph',             $, 'inCompartments', {
			getSummary:    "find all compartments in which a given lyph is a member",
			putSummary:    "add a given lyph to a given compartment as a member",
			deleteSummary: "remove a given lyph from a given compartment as a member"
		},
		'Compartment',      $, 'lyphs',          {}
	],
	LyphLocatedMeasure: [
		'Lyph',             $, 'locatedMeasures', {
			getSummary:    "find all located measures associated with a given lyph",
			putSummary:    "associate a given located measure with a given lyph",
			deleteSummary: "remove a given located measure associated with a given lyph"
		},
		'LocatedMeasure',   1, 'lyph',            {}
	],
	BorderNode: [
		'Border',           $, 'nodes',   {},
		'Node',             $, 'borders', {}
	],
	NodeProcess: [
		'Node',    $, 'outgoingProcesses', {},
		'Process', 1, 'source',            {}
	],
	ProcessNode: [ // swapped sides to directionally align with above
		'Process', 1, 'target',            {},
		'Node',    $, `incomingProcesses`, {}
	],
	NodePotentialProcess: [
		'Node',             $, 'outgoingPotentialProcesses', {},
		'PotentialProcess', 1, 'source',                     {}
	],
	PotentialProcessNode: [ // swapped sides to directionally align with above
		'PotentialProcess', 1, 'target',                     {},
		'Node',             $, `incomingPotentialProcesses`, {}
	],
	CorrelationPublication: [
		'Correlation',      1, 'publication',   {},
		'Publication',      $, 'correlations',  {}
	],
	CorrelationLocatedMeasure: [
		'Correlation',      $, 'locatedMeasures', {},
		'LocatedMeasure',   $, 'correlations',    {}
	],
	CorrelationClinicalIndex: [
		'Correlation',      $, 'clinicalIndices', {},
		'ClinicalIndex',    $, 'correlations',    {}
	],
	LocatedMeasureBagOfPathologies: [
		'LocatedMeasure',   $, 'bagsOfPathologies', {},
		'BagOfPathologies', $, 'locatedMeasures',   {}
	],
	LocatedMeasureRemovedProcess: [
		'LocatedMeasure',   $, 'removedProcesses',           {
			getSummary:    "find all processes 'removed' by a given bag of pathologies",
			putSummary:    "make a given bag of pathologies 'remove' a given process",
			deleteSummary: "stop a given bag of pathologies from 'removing' a given process"
		},
		'Process',          $, 'removedByBagsOfPathologies', {
			getSummary:    "find all bags of pathologies that 'remove' a given process",
			putSummary:    "make a given bag of pathologies 'remove' a given process",
			deleteSummary: "stop a given bag of pathologies from 'removing' a given process"
		}
	],
	LocatedMeasureAddedProcess: [
		'LocatedMeasure',   $, 'addedProcesses',           {
			getSummary:    "find all potential processes 'added' by a given bag of pathologies",
			putSummary:    "make a given bag of pathologies 'add' a given potential process",
			deleteSummary: "stop a given bag of pathologies from 'adding' a given potential process"
		},
		'PotentialProcess', $, 'addedByBagsOfPathologies', {
			getSummary:    "find all bags of pathologies that 'add' a given potential process",
			putSummary:    "make a given bag of pathologies 'add' a given potential process",
			deleteSummary: "stop a given bag of pathologies from 'adding' a given potential process"
		}
	]
};

/* adding some relationships through loops, to avoid duplication */
for (let side of sideSchema.enum) {
	relationships[`LayerBorder_${side}`] = [
		'Layer',  1,  side,   {},
		'Border', 1, 'layer', {
			setFields: {
				side: { value: side }
			}
		}
	];
}
for (let [edgeEnd, direction] of [['source', 'outgoing'], ['target', 'incoming']]) {
	relationships[`NodeProcess_${direction}`] = [
		'Node',    $, `${direction}Processes`, {},
		'Process', 1, edgeEnd,                 {}
	];
}
for (let [edgeEnd, direction] of [['source', 'outgoing'], ['target', 'incoming']]) {
	relationships[`NodePotentialProcess_${direction}`] = [
		'Node',             $, direction+'PotentialProcesses', {},
		'PotentialProcess', 1, edgeEnd,                        {}
	];
}

/* cardinality shorthand */
for (let relName of Object.keys(relationships)) {
	if (relationships[relName][1] === 1) { relationships[relName][1] = ONE }
	if (relationships[relName][5] === 1) { relationships[relName][5] = ONE }
}
