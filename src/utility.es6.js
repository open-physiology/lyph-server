////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* external libs */
import _, {trim, matches, isUndefined} from 'lodash';

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
//NK modified: x-skip-db no longer exists, all resource properties are listed in type.properties
export const dataToNeo4j = (type, fields) => {
	let allPropertyFields = Object.entries(type.properties);
	let mappedFields = {};
	for (let [fieldName, fieldSpec] of allPropertyFields) {
		let val = fields[fieldName];
		if (isUndefined(val)) continue;
		//NK TODO test for 'array' and 'object'
		mappedFields[fieldName] = (['array', 'object'].includes(fieldSpec.type))? JSON.stringify(val): val;
	}
	return mappedFields;
};

/* get an object from Neo4j and prepare it to be sent over the lyph-server API */
export const neo4jToData = (type, properties) => {
	return _(properties).mapValues((val, key) => sw(type.properties[key] && type.properties[key].type)(
		[['object', 'array'],()=> JSON.parse(val)],
		[                   ,()=>            val ]
	)).value();
};

/* to get the arrow-parts for a Cypher relationship */
export const arrowEnds = (relA) => (relA.symmetric)               ? [' -','- '] :
                                   (relA.keyInRelationship === 1) ? [' -','->'] :
	                                                   				['<-','- '] ;

/* creating a Neo4j arrow matcher with nicer syntax */
export const arrowMatch = (relTypes, a, l, r, b) => relTypes.length > 0
	? `OPTIONAL MATCH (${a}) ${l}[:${relTypes.map(({relationship:{name}})=>name).join('|')}]${r} (${b})`
	: ``;


/* to get query-fragments to get relationship-info for a given resource */
export function relationshipQueryFragments(type, nodeName) {
	let optionalMatches = [];
	let objectMembers = [];
	let handledFieldNames = {}; // to avoid duplicates (can happen with symmetric relationships)
	let allRelationFields = Object.entries(type.relationshipShortcuts);
	// TODO: (MH+NK) Use .relationships up here ^, encode -->ish names.
	// TODO: The client library will set the shortcut fields.
	for (let [fieldName, fieldSpec] of allRelationFields) {
		if (handledFieldNames[fieldName]) { continue }
		handledFieldNames[fieldName] = true;

		let [l, r] = arrowEnds(fieldSpec);
		optionalMatches.push(`
			OPTIONAL MATCH (${nodeName})
		    ${l}[:${fieldSpec.relationshipClass.name}]${r}
		    (rel_${fieldName}:${fieldSpec.codomain.resourceClass.name})
		`);
		objectMembers.push((fieldSpec.cardinality.max === 1)
				? `${fieldName}: rel_${fieldName}.id`
				: `${fieldName}: collect(DISTINCT rel_${fieldName}.id)`
		);
	}
	return { optionalMatches, objectMembers };
}
