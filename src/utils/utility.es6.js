////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* external libs */
import _, {trim, matches} from 'lodash';
import isUndefined from 'lodash-bound/isUndefined';
import isNumber from 'lodash-bound/isNumber';
import isArray from 'lodash-bound/isArray';
import isNull from 'lodash-bound/isNull';

import './loadRxjs.es6.js';
import modelFactory from "../../node_modules/open-physiology-model/src/index.js"

export const modelRef = modelFactory();
export const modelClasses = modelRef.classes;

export const resources = {};
export const relationships = {};

for (let [key, value] of Object.entries(modelRef.classes)){
	if (value.isResource) {resources[key] = value;}
	if (value.isRelationship) {relationships[key] = value;}
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// very general stuff                                                                                                 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const debugPromise = (marker) => [
	(data) => { console.log  (`(${marker}) RESOLVED:`, JSON.stringify(data)); return data; },
	(data) => { console.error(`(${marker}) REJECTED:`, JSON.stringify(data)); throw  data; }
];

//TODO remove after sw from utilities is fixed
export const sw = (val) => (...map) => {
	if (map.length === 1) { // one case per result
		return ( (val in map[0]) ? map[0][val] : map[0].default );
	} else { // multiple cases per result, array syntax
		for (let [cases, result] of map) {
			if      (!cases)              { return result() } // default
			else if (cases.includes(val)) { return result() }
		}
	}
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// more application-specific stuff                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* a way to specify 'custom' errors */
export const customError = (obj) => Object.assign({}, obj, { '-custom-lyph-server-error-': true });

/* a way to recognize 'custom' errors */
export const isCustomError = (obj) => !!obj['-custom-lyph-server-error-'];

/* a way to clean up 'custom' errors for transmission */
export const cleanCustomError = (obj) => Object.assign({}, obj, { '-custom-lyph-server-error-': undefined });

/* get a specific field from the rows returned from a Neo4j response */
export const pluckData  = (name) => (res) => res.map((obj) => obj[name]);

/* get a specific field from the first row returned from a Neo4j response */
export const pluckDatum = (name) => (res) => (res[0] ? res[0][name] : null);

/* prepare an object to be sent directly to Neo4j */
export const dataToNeo4j = (cls, fields) => {
	let mappedFields = {};
	for (let [fieldName, fieldSpec] of Object.entries(cls.properties)) {
		let val = fields[fieldName];
		if (val:: isUndefined()) continue;
		mappedFields[fieldName] = (['array', 'object'].includes(fieldSpec.type))? JSON.stringify(val): val;
	}
	return mappedFields;
};

/* get an object from Neo4j and prepare it to be sent over the lyph-server API */
export const neo4jToData = (cls, properties) => {
	let mappedFields = {};
	for (let [key, val] of Object.entries(properties)){
		let fieldName = key.replace(/["'`]/g, "");
		mappedFields[fieldName] =
			(cls.properties[fieldName] && ['object', 'array'].includes(cls.properties[fieldName].type))?
			JSON.parse(val): val;
	}
	return mappedFields;
};

/* to get the arrow-parts for a Cypher relationship */
export const arrowEnds = (relA) =>
	  (relA.keyInRelationship === 1) ? [' -','->']
	: (relA.keyInRelationship === 2) ? ['<-','- ']
	: 								   [' -','- '];

export const extractFieldValues = (r) => (r.fields)? _(r.fields).mapValues((x) => x.value).value(): r;

/* extracts IDs from resource or relationship fields */
export const extractIds = (obj) => {
	let values = _(obj).map(val => extractFieldValues(val));
	return values.filter(x => x::isNumber() || x.id ).map(x => x::isNumber() ? x : x.id);
};

/* creating a Neo4j arrow matcher with nicer syntax */
export const arrowMatch = (relTypes, a, l, r, b) => relTypes.length > 0
	? `OPTIONAL MATCH (${a}) ${l}[:${relTypes.map(({relationshipClass:{name}})=>name).join('|')}]${r} (${b})`
	: ``;

/* to get node or relationship match labels for a given entity class */
export function matchLabelsQueryFragment(cls, entityName){

	/* We do not keep abstract resources or relationships in DB, so they can be skipped in queries*/
	let subClasses = (cls.allSubclasses)? [...cls.allSubclasses()]
		.filter(x => !x.abstract).map(x => x.name): [cls.name];
	if (entityName::isUndefined() || cls.isRelationship){ return subClasses; }
	return subClasses.map((label) => (`${entityName}: ${label}`));
}

/* to get relationships of a given resource*/
export function extractRelationshipFields(A, rels, includeShortcuts = true){
	let objA = neo4jToData(resources[A.class], A);
	let relFields = {};
	for (let {rel, B, s} of rels){
		if (rel::isNull() || B::isNull()) { continue }
		if (rel.class::isUndefined() || B.class::isUndefined()) { continue }
		let objB = neo4jToData(resources[B.class], B);

		let fieldName = ((s === A.id)? "-->": "<--") + rel.class;
		let props = neo4jToData(relationships[rel.class], rel);
		//let relObj = {...props, 1: (s === A.id)? objA: objB, 2: (s === A.id)? objB: objA};
		let relObj = { id: props.id, class: props.class };

		if (relFields[fieldName]::isUndefined()){ relFields[fieldName] = []; }
		if (relFields[fieldName]::isArray()){
			relFields[fieldName].push(relObj);
		} else {
			relFields[fieldName] = relObj;
		}

		let relA = resources[A.class].relationships[fieldName];
		if ((relA.cardinality.max === 1) && relFields[fieldName]::isArray()) {
			relFields[fieldName] = relFields[fieldName][0];
		}
		if (includeShortcuts){
            if (!relA::isUndefined() && !relA.shortcutKey::isUndefined()){
                if (relFields[relA.shortcutKey]::isUndefined()) { relFields[relA.shortcutKey] = []; }
                //relFields[relA.shortcutKey].push(objB);
				relFields[relA.shortcutKey].push({id: objB.href, class: objB.class});
				if (relA.cardinality.max === 1) {
					relFields[relA.shortcutKey] = relFields[relA.shortcutKey][0];
				}
            }
        }
	}
	return {...objA, ...relFields};
}

