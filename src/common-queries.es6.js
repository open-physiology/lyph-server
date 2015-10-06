////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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
	relationshipQueryFragments
	} from './util.es6.js';
import {
	relationships,
	resources
} from './resources.es6.js';
import {
	createUniqueIdConstraintOn,
	query,
	LOCK_UID,
	THEN,
	END,
	WITH_NEW_ID,
	WITH_NEW_IDS
} from './neo4j.es6.js';
import {
	OK,
	CREATED,
	NO_CONTENT,
	NOT_FOUND,
	CONFLICT,
	GONE,
	PRECONDITION_FAILED,
	INTERNAL_SERVER_ERROR
} from './http-status-codes.es6.js';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Neo4j-based functions returning promises                                                                           //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const assertResourceExists = (type, id) => {
	return Promise.resolve()

		/* a query for checking existence of this resource */
		.then(() => query(`
			MATCH (n:${type.name} { id:${id} })
			RETURN count(n) > 0 AS exists
		`)).then(pluckData('exists'))

		/* throw the 404 error if 'exists' is false */
		.then(([exists]) => {
			if (!exists) {
				throw customError({
					status: NOT_FOUND,
					type:   type.name,
					id:     id,
					message: `The specified ${type.singular} does not exist.`
				});
			}
		});
};

export const getSingleResource = (type, id) => {
	/* preparing the part of the query that adds relationship info */
	let {optionalMatches, objectMembers} = relationshipQueryFragments(type, 'n');
	return Promise.resolve()
		/* formulating and sending the query */
		.then(() => query(`
			MATCH (n:${type.name} { id: ${id} })
			${optionalMatches.join(' ')}
			RETURN n, { ${objectMembers.join(', ')} } AS relationships
		`))
		/* integrate relationship data into the resource object */
		.then(results => results.map(({n, relationships}) => Object.assign({}, n, relationships)));
};

export const getAllResources = (type) => {
	/* preparing the part of the query that adds relationship info */
	let {optionalMatches, objectMembers} = relationshipQueryFragments(type, 'n');
	return Promise.resolve()
		/* formulating and sending the query */
		.then(() => query(`
			MATCH (n:${type.name})
			${optionalMatches.join(' ')}
			RETURN n, { ${objectMembers.join(', ')} } AS relationships
		`))
		/* integrate relationship data into the resource object */
		.then(results => results.map(({n, relationships}) => Object.assign({}, n, relationships)));
};



