////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* libraries */
import _    from 'lodash';
import co   from 'co';

/* local stuff */
import {
	debugPromise,
	customError,
	isCustomError,
	cleanCustomError,
	pluckData,
	pluckDatum,
	dbOnly,
	arrowEnds,
	relationshipQueryFragments,
	humanMsg,
	inspect
} from './util.es6.js';
import {
	relationships,
	resources
} from './resources.es6.js';
import {
	query,
	creationQuery
} from './neo4j.es6.js';
import {
	OK,
	CREATED,
	NO_CONTENT,
	BAD_REQUEST,
	NOT_FOUND,
	CONFLICT,
	GONE,
	PRECONDITION_FAILED,
	INTERNAL_SERVER_ERROR
} from './http-status-codes.es6.js';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Neo4j-based functions returning promises                                                                           //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const assertResourceExists = co.wrap(function* (type, id) {
	/* a query for checking existence of this resource */
	let [{exists}] = yield query(`
		MATCH (n:${type.name} { id:${id} })
		RETURN count(n) > 0 AS exists
	`);

	/* throw the 404 error if 'exists' is false */
	if (!exists) {
		throw customError({
			status: NOT_FOUND,
			type:   type.name,
			id:     id,
			message: humanMsg`The specified ${type.singular} does not exist.`
		});
	}
});

export const getSingleResource = co.wrap(function* (type, id) {
	/* preparing the part of the query that adds relationship info */
	let {optionalMatches, objectMembers} = relationshipQueryFragments(type, 'n');

	/* formulating and sending the query */
	let results = yield query(`
		MATCH (n:${type.name} { id: ${id} })
		${optionalMatches.join(' ')}
		RETURN n, { ${objectMembers.join(', ')} } AS relationships
	`);

	/* integrate relationship data into the resource object */
	return results.map(({n, relationships}) => Object.assign(n, relationships));
});

export const getAllResources = co.wrap(function* (type) {
	/* preparing the part of the query that adds relationship info */
	let {optionalMatches, objectMembers} = relationshipQueryFragments(type, 'n');

	/* formulating and sending the query */
	let results = yield query(`
		MATCH (n:${type.name})
		${optionalMatches.join(' ')}
		RETURN n, { ${objectMembers.join(', ')} } AS relationships
	`);

	/* integrate relationship data into the resource object */
	return results.map(({n, relationships}) => Object.assign(n, relationships));
});

export const createResource = co.wrap(function* (type, fields) {

	/* process relevant relationships */
	let rels = type.relationships.map(rel => ({
		rel,
		fieldName: rel.fieldName,
		given:    (!rel.disambiguation || _.matches(rel.disambiguation)(fields)) ? fields[rel.fieldName] : undefined,
		implicit: rel.implicit,
		get ids() { return (rel.fieldCardinality === 'one') ? [this.given] : this.given }
	}));

	/* assert that all required fields are given */
	for (let [fieldName, fieldSchema] of Object.entries(type.schema.properties)) {
		let rel = _.find(rels, { fieldName });
		if (fieldSchema['x-required'] && !(rel && rel.implicit) && _.isUndefined(fields[fieldName])) {
			throw customError({
				status: BAD_REQUEST,
				type:   type.name,
				field:  fieldName,
				message: humanMsg`
					You tried to create a new ${type.singular},
					but the required field '${fieldName}' was not given.
				`
			});
		}
	}

	/* if relationship cardinality is confused in the request, error out */
	for (let {fieldName, rel, given} of _.filter(rels, 'given')) {
		let tooMany = ( Array.isArray(given) && rel.fieldCardinality === 'one' );
		let tooFew  = (!Array.isArray(given) && rel.fieldCardinality === 'many');
		if (tooMany || tooFew) {
			throw customError({
				status:  BAD_REQUEST,
				type:    type.name,
				field:   fieldName,
				message: tooMany
					? humanMsg`The '${fieldName}' field expects a single ${rel.otherSide.singular}, but an array was provided.`
					: humanMsg`The '${fieldName}' field expects an array of ${rel.otherSide.plural}, but a single value was provided.`
			});
		}
	}

	/* for all relationships specified in the request, assert that those resources exist */
	for (let {fieldName, rel, ids, given} of _.filter(rels, 'given')) {
		let [{existing}] = yield query(`
			MATCH (n:${rel.otherSide.type.name})
			WHERE n.id IN [${ids.join(',')}]
			RETURN collect(n.id) as existing
		`);
		let nonexisting = _.difference(ids, existing);
		if (nonexisting.length > 0) {
			let c = (rel.fieldCardinality === 'one') ? 'singular' : 'plural';
			throw customError({
				status:   NOT_FOUND,
				type:     type.name,
				field:    fieldName,
				ids:      nonexisting,
				id:      (c === 'singular' ? nonexisting[0] : undefined),
				message: humanMsg`
					The specified ${rel.otherSide.type[c]}
					${nonexisting.join(',')}
					${c === 'singular' ? 'does' : 'do'} not exist.
				`
			});
		}
	}

	/* the main query for creating the resource */
	let [{id}] = yield creationQuery(({withNewId}) => ({
		statement: `
			${withNewId('newID')}
			CREATE (n:${type.name} { id: newID, type: "${type.name}" })
			SET n += {dbProperties}
			RETURN newID as id
		`,
		parameters: {  dbProperties: dbOnly(type, fields)  }
	}));

	/* for all un-given relationships that should be 'implicit': create the other resource and adjust the 'rels' array */
	for (let {rel:{otherSide: rel}} of _(rels).filter('implicit').reject('given').value()) {
		let implicitId = yield createResource(rel.type, Object.assign({ // NOTE: recursive call
			[rel.fieldName]: id
		}, rel.disambiguation || {}));
	}

	/* create the required relationships */
	let relationshipPatterns = _(rels).filter('given').map(({rel, ids}) => {
		let [l, r] = arrowEnds(rel);
		return ids.map(id => `
			WITH A
			MATCH (B:${rel.otherSide.type.name} { id: ${id} })
			CREATE UNIQUE (A) ${l}[:${rel.relationship.name}]${r} (B)
		`);
	}).flatten().value();
	if (relationshipPatterns.length > 0) {
		yield query(`
			MATCH (A:${type.name} { id: ${id} })
			${relationshipPatterns.join(' ')}
		`);
	}

	return id;

});
