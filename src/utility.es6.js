////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* external libs */
import _, {trim, matches} from 'lodash';
import isUndefined from 'lodash-bound/isUndefined';
import isSet from 'lodash-bound/isSet';
import isArray from 'lodash-bound/isArray';
import isNumber from 'lodash-bound/isNumber';

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// very general stuff                                                                                                 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const debugPromise = (marker) => [
	(data) => { console.log  (`(${marker}) RESOLVED:`, JSON.stringify(data)); return data; },
	(data) => { console.error(`(${marker}) REJECTED:`, JSON.stringify(data)); throw  data; }
];

export function toCamelCase(str) {
	return str
			.replace(/\s(.)/g, l => l.toUpperCase())
			.replace(/\s/g,    ''                  )
			.replace(/^(.)/,   l => l.toLowerCase());
}

export function def(object, field, defaultValue) {
	if (typeof object[field] === 'undefined') {
		object[field] = defaultValue;
	}
	return object[field];
}

export const or = (v, ...rest) => {
	if (typeof v !== undefined) { return v }
	return or(rest);
};

export const a = (object, field) => def(object, field, []);
export const o = (object, field) => def(object, field, {});

export const simpleSpaced = (str) => str.replace(/\s+/mg, ' ');

export const humanMsg = (strings, ...values) => {
	let result = strings[0];
	for (let [val, str] of _(values).zip(strings.slice(1))) {
		result += val + simpleSpaced(str);
	}
	return trim(result);
};

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
		let fieldName = key.replace('o__', '<--').replace('__o', '-->');
		mappedFields[fieldName] =
			(cls.properties[fieldName] && ['object', 'array'].includes(cls.properties[fieldName].type))?
			JSON.parse(val): val;
	}
	return mappedFields;
};

/* to get the arrow-parts for a Cypher relationship */
export const arrowEnds = (relA) => (relA.symmetric)               ? [' -','- '] :
                                   (relA.keyInRelationship === 1) ? [' -','->'] :
									   								['<-','- '] ;


export const extractFieldValues = (r) =>
	(r.fields)? _(r.fields).mapValues((x) => x.value).value(): r;

//(value)? x.value: x

/* extracts IDs frome resource or relationship fields */
export const extractIds = (array) => {
	let values = _(array).map(val => extractFieldValues(val));
	return values.filter(x => x::isNumber() || x.id ).map(x => x::isNumber() ? x : x.id);
};

/* creating a Neo4j arrow matcher with nicer syntax */
export const arrowMatch = (relTypes, a, l, r, b) => relTypes.length > 0
	? `OPTIONAL MATCH (${a}) ${l}[:${relTypes.map(({relationship:{name}})=>name).join('|')}]${r} (${b})`
	: ``;


/* to get query-fragments to get relationship-info for a given resource */
export function relationshipQueryFragments(cls, nodeName) {
	let optionalMatches = [], objectMembers = [];
    if (cls::isUndefined()) {return {}}

        let handledFieldNames = {}; // to avoid duplicates (can happen with symmetric relationships)
	let allRelationFields = Object.entries(cls.relationships);

	for (let [fieldName, fieldSpec] of allRelationFields) {

		let relName = (fieldSpec.shortcutKey::isUndefined())?
			fieldName.replace('-->', '__o').replace('<--', 'o__')
			: fieldSpec.shortcutKey;

		if (handledFieldNames[fieldName]) { continue }
		handledFieldNames[fieldName] = true;

		let [l, r] = arrowEnds(fieldSpec);
		optionalMatches.push(`
			OPTIONAL MATCH (${nodeName})
		    ${l}[:${fieldSpec.relationshipClass.name}]${r}
		    (rel_${relName}:${fieldSpec.codomain.resourceClass.name})
		`);
		objectMembers.push((fieldSpec.cardinality.max === 1)
				? `${relName}: rel_${relName}.id`
				: `${relName}: collect(DISTINCT rel_${relName}.id)`
		);
	}

	return { optionalMatches, objectMembers };
}
