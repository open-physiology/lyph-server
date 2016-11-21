////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import modelFactory from "open-physiology-model/src/index.js";
export const modelRef = modelFactory();

export const resources = {};
export const relationships = {};

for (let [key, value] of Object.entries(modelRef.classes)){
	if (value.isResource) {resources[key] = value;}
	if (value.isRelationship) {relationships[key] = value;}
}
//console.log("Resources", resources);
//console.log("Relationships", relationships);

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// TODOs related to maintaining data constraints                                                                      //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// TODO: enforce that name/uri-ish fields are not empty strings
// TODO: enforce that if a lyph is in more than 1 layer, that all those layers coalesce
// TODO: enforce symmetry of coalescence
// TODO: enforce that each coalescing layer is the outermost layer of its lyph
// TODO: enforce that all coalescing layers have the same layer template
// TODO: avoid loops in "/layerTemplates/{id}/materials" + "/lyphTemplates/{id}/layers" relationships
// TODO: avoid loops in "/lyphs/{id}/layers"             + "/layers/{id}/lyphs"         relationships
// TODO: enforce that the positions of layers start at 0 and are sequential / without gaps
// TODO: enforce that a node is not on the inner border of layer 0 (the axis)
// TODO: enforce that a node cannot be on more than one border of the same layer
// TODO: enforce that when a node is placed 'between' layers, it is registered on both (inner, outer)
// TODO: enforce node placement w.r.t. coalescence
// TODO: if a node is on plus/minus of lyphA(layer i), and on outer/inner of lyphB(layer j),
//     : then lyphA is inside of lyphB(layer j +/- 1)
//     : (unless it's the outer border of the outer layer of lyphB; then it's not necessary)
//     : IN OTHER WORDS: orthogonal placement of lyph inside housing layer
// TODO: enforce that a correlation has >= 2 variables associated with it
// TODO: enforce that no two publications have the same 'pubmed uri'
// TODO: enforce that a (potential) process does not go from x to y, when x and y are on the same border
// TODO: enforce that a bag of pathologies has at least one 'thing' in it
// TODO: enforce that min thickness is <= max thickness

// DONE: enforce that layers of instantiated lyphs correspond to the layer(Template)s of the lyph template
// done by auto-syncing from layerTemplates to layers
