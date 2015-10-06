////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* external libs */
import _ from 'lodash';


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

export const a = (object, field) => def(object, field, []);
export const o = (object, field) => def(object, field, {});


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

/* to pick only those properties that should not be skipped from the database */
export const dbOnly = (type, allProperties) => _.omit(allProperties, (__, prop) =>
	type.schema.properties[prop] &&
	type.schema.properties[prop]['x-skip-db']
);

/* to get the arrow-parts for a Cypher relationship */
export const arrowEnds = (relA) => (relA.symmetric)  ? [' -','- '] :
                                   (relA.side === 1) ? [' -','->'] :
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


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// extending some core prototypes for convenience                                                                     //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

if (!_.isFunction(Error.prototype.toJSON)) {
	Object.defineProperty(Error.prototype, 'toJSON', {
		value: function () {
			var alt = {};
			Object.getOwnPropertyNames(this).forEach(function (key) {
				alt[key] = this[key];
			}, this);
			return alt;
		},
		configurable: true
	});
}

if (!_.isFunction(Object.entries)) {
	Object.defineProperty(Object, 'entries', {
		*value(obj) {
			for (let key of Object.keys(obj)) {
				yield [key, obj[key]];
			}
		}
	});
}

if (!_.isFunction(Object.values)) {
	Object.defineProperty(Object, 'values', {
		*value(obj) {
			for (let key of Object.keys(obj)) {
				yield obj[key];
			}
		}
	});
}
