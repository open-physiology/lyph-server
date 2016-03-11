////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* external libs */
import _, {trim, matches} from './libs/lodash.es6.js';
import util               from 'util';


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

export const inspect = (obj, options = {}) => {
	console.log(util.inspect(obj, Object.assign({
		colors: true,
		depth:  2
	}, options)));
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
export const dataToNeo4j = (type, properties) => _(properties).omit((__, key) =>
	type.schema.properties[key] &&
	type.schema.properties[key]['x-skip-db']
).mapValues((val, key) => sw(type.schema.properties[key] && type.schema.properties[key].type)(
	[['object', 'array'],()=> JSON.stringify(val)],
	[                   ,()=>                val ]
)).value();

/* get an object from Neo4j and prepare it to be sent over the lyph-server API */
export const neo4jToData = (type, properties) => {
	return _(properties).mapValues((val, key) => sw(type.schema.properties[key] && !type.schema.properties[key]['x-skip-db'] && type.schema.properties[key].type)(
		[['object', 'array'],()=> JSON.parse(val)],
		[                   ,()=>            val ]
	)).value();
};

/* to get the arrow-parts for a Cypher relationship */
export const arrowEnds = (relA) => (relA.symmetric)  ? [' -','- '] :
                                   (relA.side === 1) ? [' -','->'] :
	                                                   ['<-','- '] ;

/* creating a Neo4j arrow matcher with nicer syntax */
export const arrowMatch = (relTypes, a, l, r, b) => relTypes.length > 0
	? `OPTIONAL MATCH (${a}) ${l}[:${relTypes.map(({relationship:{name}})=>name).join('|')}]${r} (${b})`
	: ``;

/* given a type and given fields, return an array of useful relationship type info */
export function relationshipTypeSummaries(type, fields) {
	return type.relationships.map(rel => ({
		rel,
		fieldName: rel.fieldName,
		given:     (!rel.disambiguation || matches(rel.disambiguation)(fields)) ? fields[rel.fieldName] : undefined,
		implicit:  rel.implicit,
		get ids()  { return (rel.fieldCardinality === 'many') ? this.given : [this.given] }
	}));
}

/* to get query-fragments to get relationship-info for a given resource */
export function relationshipQueryFragments(type, nodeName) {
	let optionalMatches = [];
	let objectMembers = [];
	let handledFieldNames = {}; // to avoid duplicates (can happen with symmetric relationships)
	for (let relA of type.relationships) {
		if (handledFieldNames[relA.fieldName]) { continue }
		handledFieldNames[relA.fieldName] = true;
		let [l, r] = arrowEnds(relA);
		optionalMatches.push(`
			OPTIONAL MATCH (${nodeName})
			               ${l}[:${relA.relationship.name}]${r}
			               (rel_${relA.fieldName}:${relA.otherSide.type.name})
        `);
		objectMembers.push(
			relA.fieldCardinality === 'many'
				? `${relA.fieldName}: collect(DISTINCT rel_${relA.fieldName}.id)`
				: `${relA.fieldName}: rel_${relA.fieldName}.id`
		);
		for (let fieldName of Object.keys(relA.setFields || {})) {
			objectMembers.push(`${fieldName}: ${JSON.stringify(relA.setFields[fieldName])}`);
		}
	}
	return { optionalMatches, objectMembers };
}
