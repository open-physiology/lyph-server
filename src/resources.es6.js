import modelFactory from "open-physiology-model/src/index.js";

export const modelRef = modelFactory();
export const model = modelRef.classes;

export const resources = {};
export const relationships = {};

for (let [key, value] of Object.entries(modelRef.classes)){
	if (value.isResource) {resources[key] = value;}
	if (value.isRelationship) {relationships[key] = value;}
}

