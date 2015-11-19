////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// relationship specifications                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// RelationshipName: [
//     'ResourceType1', c1, 'fieldName1', { /* options1 */ },
//     'ResourceType2', c2, 'fieldName2', { /* options2 */ },
//     { /* options */ }
// ]
// This means that RelationshipName is a type of c1-to-c2 relationship
// (c stands for cardinality: many-to-many, one-to-many, many-to-one, one-to-one)
// between ResourceType1 resources and ResourceType2 resources.
// So: "a ResourceType1 resource can be related to 'c1' ResourceType2 resource(s),
//      exposed through fieldName1 in that resource"
// and vice versa.
//
// A couple of possible options:
// - options.readOnly:       this relationship type is managed programmatically, not to be exposed through the API directly
// - options.symmetric:      this relationship type is bidirectional, 1->2 always implies 2->1
// - options.anti-reflexive: a resource may not be related to itself with this type
// - options1.sustains:      when a ResourceType1 instance is deleted,
//                           the ResourceType2 instance that is being sustained by it is deleted automatically
// - options1.anchors:       a ResourceType2 instance cannot be deleted
//                           while there are still ResourceType1 instances pointing to it
// - options1.implicit:      (only when c2 = 'one') a new ResourceType2 instance, plus this kind of relationship,
//                           is automatically created for a new ResourceType1 instance
// - options1.getSummary:    an explanation in English of the corresponding REST endpoint for HTTP GET
// - options1.putSummary:    an explanation in English of the corresponding REST endpoint for HTTP PUT
// - options1.deleteSummary: an explanation in English of the corresponding REST endpoint for HTTP DELETE

const $ = 'many';
export const relationships = {
	LyphTemplateLayer: [
		'LyphTemplate',     $, 'layers',       { sustains: true },
		'LayerTemplate',    1, 'lyphTemplate', { indexFieldName: 'position' }
	], // TODO: somehow unify 'indexFieldName' (if only in style) with the 'disambiguation' property used at the bottom
	LyphTemplateMaterial: [
		'LyphTemplate',     $, 'materials',  {
			getSummary:    "find all lyph templates acting as materials in a given lyph template",
			putSummary:    "add a given lyph template to a given lyph template as a material",
			deleteSummary: "remove a given lyph template from a given lyph template as material"
		},
		'LyphTemplate',     $, 'materialInLyphs', {
			// TODO: what would go wrong if this was also called 'materialIn', overloaded with the relationship type below?
			getSummary:    "find the lyph templates in which a given lyph template is a material",
			putSummary:    "add a given lyph template to a given lyph template as a material",
			deleteSummary: "remove a given lyph template from a given lyph template as material"
		}
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
			sustains: true,
			getSummary: "find all lyphs instantiated from a given lyph template"
		},
		'Lyph',             1, 'template',       {},
		{ readOnly: true } // instantiation has a single template from creation
	],
	LayerTemplateInstantiation: [
		'LayerTemplate',    $, 'instantiations', {
			sustains: true,
			getSummary: "find all layers instantiated from a given layer template"
		},
		'Layer',            1, 'template',       {},
		{ readOnly: true } // instantiation has a single template from creation
	],
	LyphLayer: [
		'Lyph',             $, 'layers', { sustains: true },
		'Layer',            1, 'lyph',   { indexFieldName: 'position' },
		{ readOnly: true } // layers sync through templates
	],
	LayerChildLyph: [
		'Layer',            $, 'childLyphs', {
			sustains:      true,
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
		'Compartment',      $, 'lyphs',          { anchors: true }
	],
	LyphTemplateLocatedMeasure: [
		'LyphTemplate',     $, 'locatedMeasures', { // TODO: this should probably be 'Lyph', but we need it to be 'LyphTemplate' right now for the correlation editor (should discuss)
			sustains:      true,
			getSummary:    "find all located measures associated with a given lyph template",
			putSummary:    "associate a given located measure with a given lyph template",
			deleteSummary: "remove a given located measure associated with a given lyph template"
		},
		'LocatedMeasure',   1, 'lyphTemplate',    {}
	],
	BorderNode: [
		'Border',           $, 'nodes',   { sustains: true },
		'Node',             $, 'borders', {}
	],
	NodeProcess: [
		'Node',             $, 'outgoingProcesses', { sustains: true },
		'Process',          1, 'source',            {}
	],
	ProcessNode: [ // swapped sides to directionally align with above
		'Process',          1, 'target',            {},
		'Node',             $, `incomingProcesses`, { sustains: true }
	],
	NodePotentialProcess: [
		'Node',             $, 'outgoingPotentialProcesses', { sustains: true },
		'PotentialProcess', 1, 'source',                     {}
	],
	PotentialProcessNode: [ // swapped sides to directionally align with above
		'PotentialProcess', 1, 'target',                     {},
		'Node',             $, `incomingPotentialProcesses`, { sustains: true }
	],
	CorrelationPublication: [
		'Correlation',      1, 'publication',   { anchors: true },
		'Publication',      $, 'correlations',  {}
	],
	CorrelationLocatedMeasure: [
		'Correlation',      $, 'locatedMeasures', { anchors: true },
		'LocatedMeasure',   $, 'correlations',    {}
	],
	CorrelationClinicalIndex: [
		'Correlation',      $, 'clinicalIndices', { anchors: true },
		'ClinicalIndex',    $, 'correlations',    {}
	],
	ClinicalIndexChildren: [
		'ClinicalIndex',    $, 'children', {},
		'ClinicalIndex',    $, 'parents',  {}
	],
	LocatedMeasureBagOfPathologies: [
		'BagOfPathologies', $, 'locatedMeasures',   { anchors: true },
		'LocatedMeasure',   $, 'bagsOfPathologies', {}
	],
	BagOfPathologiesRemovedProcess: [
		'BagOfPathologies', $, 'removedProcesses',           {
			anchors:       true,
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
	BagOfPathologiesAddedProcess: [
		'BagOfPathologies', $, 'addedProcesses',           {
			anchors:       true,
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

/* adding these four relationships through a loop, to avoid duplication */
for (let side of ['plus', 'minus', 'inner', 'outer']) {
	relationships[`LayerBorder_${side}`] = [
		'Layer',  1,  side,   {
			sustains: true,
			anchors:  true,
			implicit: true
		},
		'Border', 1, 'layer', {
			disambiguation: { side }
		}
	];
}
