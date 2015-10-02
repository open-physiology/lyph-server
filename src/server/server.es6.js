////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* external libs */
import _                 from 'lodash';
import util              from 'util';
import express           from 'express';
import swaggerMiddleware from 'swagger-express-middleware';

/* local stuff */
import swagger                               from '../swagger.es6';
import {
	sustainingRelationships,
	anchoringRelationships,
	relationships,
	resources,
	ONE,
	MANY
} from '../resources.es6.js';
import {
	createUniqueIdConstraintOn,
	query,
	LOCK_UID,
	THEN,
	END,
	WITH_NEW_ID,
	WITH_NEW_IDS
} from '../neo4j.es6.js';
import {
	OK,
	CREATED,
	NO_CONTENT,
	NOT_FOUND,
	CONFLICT,
	GONE,
	PRECONDITION_FAILED,
	INTERNAL_SERVER_ERROR
} from '../http-status-codes.es6.js';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// some preprocessing                                                                                                 //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let symmetricSustaining = sustainingRelationships.filter(([relA]) => relA.symmetric);
let l2rSustaining       = sustainingRelationships.filter(([relA]) => !relA.symmetric && relA.side === 1);
let r2lSustaining       = sustainingRelationships.filter(([relA]) => !relA.symmetric && relA.side === 2);

let symmetricAnchoring = anchoringRelationships.filter(([relA]) => relA.symmetric);
let l2rAnchoring       = anchoringRelationships.filter(([relA]) => !relA.symmetric && relA.side === 1);
let r2lAnchoring       = anchoringRelationships.filter(([relA]) => !relA.symmetric && relA.side === 2);


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// convenience functions                                                                                              //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* a way to specify 'custom' errors */
function customError(obj) {
	return Object.assign({}, obj, {
		'-custom-lyph-server-error-': true
	});
}

/* a way to recognize 'custom' errors */
function isCustomError(obj) {
	return !!obj['-custom-lyph-server-error-'];
}

/* a way to clean up 'custom' errors for transmission */
function cleanCustomError(obj) {
	return Object.assign({}, obj, {
		'-custom-lyph-server-error-': undefined
	});
}

/* to get the relevant data from a Neo4j response */
const pluckData = (name) => (res) => res.map((obj) => obj[name]);

/* to pick only those properties that should not be skipped from the database */
const dbOnly = (type, allProperties) => _.omit(allProperties, (__, prop) =>
	type.schema.properties[prop] &&
	type.schema.properties[prop]['x-skip-db']
);

/* to get the arrow-parts for a Cypher relationship */
const arrowEnds = (relA) => (relA.symmetric)  ? ['-','-']  :
                            (relA.side === 1) ? ['-','->'] : ['<-','-'];

/* to get query-fragments to get relationship-info for a given resource */
function relationshipQueryFragments(type, nodeName) {
	let optionalMatches = [];
	let objectMembers = [];
	let handledFieldNames = {}; // to avoid duplicates (can happen with symmetric relationships)
	for (let [relA, relB] of type.relationships) {
		if (handledFieldNames[relA.fieldName]) { continue }
		handledFieldNames[relA.fieldName] = true;
		let [l, r] = arrowEnds(relA);
		optionalMatches.push(`
					OPTIONAL MATCH (${nodeName})
					               ${l}[:${relA.relationship.name}]${r}
					               (rel_${relA.fieldName}:${relB.type.name})
		        `);
		objectMembers.push(
			relA.fieldCardinality === MANY
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
// Neo4j-based functions returning promises                                                                           //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function getIdsToDelete(firstId, forceFirst = true) {

	firstId = parseInt(firstId, 10);

	let markedNodes = new Set();

	return (function recurse(id, force) {

		if (markedNodes.has(id)) { return Promise.resolve() }

		return Promise.resolve()
			.then(() => {
				if (force) {
					return true;
				} else {
					/* Are all nodes that sustain this one marked for deletion? */
					return query(`
						MATCH (a {id:${id}})
						${ symmetricSustaining.length ? `
							OPTIONAL MATCH (x) -[:${symmetricSustaining.map(([{relationship:{name}}])=>name).join('|')}]- (a)
						` : '' }
						${ l2rSustaining.length ? `
							OPTIONAL MATCH (y) -[:${l2rSustaining.map(([{relationship:{name}}])=>name).join('|')}]-> (a)
						` : '' }
						${ r2lSustaining.length ? `
							OPTIONAL MATCH (z) <-[:${r2lSustaining.map(([{relationship:{name}}])=>name).join('|')}]- (a)
						` : '' }
						WITH ${symmetricSustaining.length ? 'collect(x)' : '[]'} +
						     ${l2rSustaining      .length ? 'collect(y)' : '[]'} +
						     ${r2lSustaining      .length ? 'collect(z)' : '[]'} AS coll UNWIND coll AS n
						WITH DISTINCT n
						RETURN n.id AS id
					`).then(pluckData('id')).then((prevIds) => prevIds.every(prevId => markedNodes.has(prevId)));
				}
			})
			.then((mark) => {
				if (mark) {
					markedNodes.add(id);
					/* Now give all nodes sustained by this one a chance to be deleted. */
					return query(`
						MATCH (a {id:${id}})
						${ symmetricSustaining.length ? `
							OPTIONAL MATCH (a) -[:${symmetricSustaining.map(([{relationship:{name}}])=>+name).join('|')}]- (x)
						` : '' }
						${ l2rSustaining.length ? `
							OPTIONAL MATCH (a) -[:${l2rSustaining.map(([{relationship:{name}}])=>name).join('|')}]-> (y)
						` : '' }
						${ r2lSustaining.length ? `
							OPTIONAL MATCH (a) <-[:${r2lSustaining.map(([{relationship:{name}}])=>name).join('|')}]- (z)
						` : '' }
						WITH ${symmetricSustaining.length ? 'collect(x)' : '[]'} +
						     ${l2rSustaining      .length ? 'collect(y)' : '[]'} +
						     ${r2lSustaining      .length ? 'collect(z)' : '[]'} AS coll UNWIND coll AS n
						WITH DISTINCT n
						RETURN n.id AS id
					`).then(pluckData('id')).then((nIds) => Promise.all(nIds.map(nId => recurse(nId, false))));
				}
			});

	})(firstId, forceFirst).then(() => [...markedNodes.values()]);

}

function anythingAnchoredFromOutside(ids) {
	return query(`
		WITH [${ids.join(',')}] AS ids
		${ symmetricAnchoring.length ? `
			OPTIONAL MATCH (x) -[:${symmetricAnchoring.map(([{relationship:{name}}])=>name).join('|')}]- (a)
			WHERE (NOT x.id in ids) AND (a.id in ids)
			WITH ids, collect({ anchoring: x.id, anchored: a.id }) AS anchors1
		` : 'WITH ids, [] AS anchors1' }
		${ l2rAnchoring.length ? `
			OPTIONAL MATCH (y) -[:${l2rAnchoring.map(([{relationship:{name}}])=>name).join('|')}]-> (b)
			WHERE (NOT y.id in ids) AND (b.id in ids)
			WITH ids, anchors1 + collect({ anchoring: y.id, anchored: b.id }) AS anchors2
		` : 'WITH ids, anchors1 AS anchors2' }
		${ r2lAnchoring.length ? `
			OPTIONAL MATCH (z) <-[:${r2lAnchoring.map(([{relationship:{name}}])=>name).join('|')}]- (c)
			WHERE (NOT z.id in ids) AND (c.id in ids)
			WITH ids, anchors2 + collect({ anchoring: z.id, anchored: c.id }) AS anchors3
		` : 'WITH ids, anchors2 AS anchors3' }
		UNWIND anchors3 AS n
		WITH DISTINCT n
		WHERE n.anchoring IS NOT NULL
		RETURN DISTINCT n
	`).then(pluckData('n'));
}

const assertResourceExists = (type, id, passthrough) => {
	return Promise.resolve()
		/* a query for checking existence of this resource */
		.then(() => query(`
			MATCH (n:${type.name} {id:${id}})
			RETURN count(n) > 0 AS exists
		`)).then(pluckData('exists'))
		/* throw the 404 error if 'exists' is false */
		.then(([exists]) => {
			if (!exists) {
				throw customError({
					status: NOT_FOUND,
					type: type.name,
					id:   id,
					message: `The specified ${type.singular} does not exist.`
				});
			}
		})
		/* passing along the original data */
		.then(() => passthrough);
};

const getSingleResource = (type, id) => {
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
		.then(([{n, relationships}]) => Object.assign({}, n, relationships))
};

const getAllResources = (type) => {
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
		.then((results) => results.map(([{n, relationships}]) => Object.assign({}, n, relationships)))
};


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// request handlers                                                                                                   //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// TODO: to avoid race conditions, use a Neo4j REST transactions to get some ACID around these multiple queries

const requestHandler = {
	resources: {
		get: ({type}) => (req, res, next) => {

			console.log(`Getting all ${type.plural}...`);

			Promise.resolve()

				/* formulating and sending the query */
				.then(() => getAllResources(type))

				/* send the response; pass any error to Express through 'next' */
				.then((resources) => {  res.status(OK).send(resources)  }, next);

		},
		post: ({type}) => (req, res, next) => {

			console.log(`Creating a new ${type.singular}...`);

			// TODO: add resources specified 'implicit' by a relationship type
			// TODO: to avoid race conditions, use a Neo4j REST transaction to envelop these two steps

			Promise.resolve()

				/* the main query for creating the node */
				.then(() => type.create ? type.create({type}, req) : query([
					LOCK_UID,
					{
						statement: `
							${WITH_NEW_ID('newID')}
							CREATE (n:${type.name} { id: newID, type: "${type.name}" })
							SET n += {dbProperties}
							RETURN newID as id
						`,
						parameters: {  dbProperties: dbOnly(type, req.body)  }
					}
				]).then(pluckData('id')))

				/* add all required relationships */
				.then(([id]) => {
					let relationshipPatterns = [];
					for (let [relA, relB] of type.relationships) {
						// if given is absent, but should be an array, that's OK, we use an empty array
						// TODO: if given is absent, and shouldn't be an array, 400 ERROR
						// TODO: if given is an array but shouldn't be,         400 ERROR
						// TODO: if given is NOT an array but should be,        400 ERROR
						let given = req.body[relA.fieldName];
						let relatedIds = (relA.fieldCardinality === ONE) ? [given] : (given || []);
						let [l, r] = arrowEnds(relA);
						//noinspection JSReferencingMutableVariableFromClosure
						relationshipPatterns.push(...relatedIds.map(id => `
							WITH A
							MATCH (B:${relB.type.name} { id: ${id} })
							CREATE UNIQUE (A) ${l}[:${relA.relationship.name}]${r} (B)
						`));
					}
					if (relationshipPatterns.length > 0) {
						return query(`
							MATCH (A:${type.name} { id: ${id} })
							${relationshipPatterns}
						`).then(() => id);
					} else {
						return id;
					}
				})

				/* fetch the newly created resource */
				.then((id) => getSingleResource(type, id))

				/* send the response; pass any error to Express through 'next' */
				.then((resources) => {  res.status(CREATED).send(resources)  }, next);

		}
	},
	specificResource: {
		get: ({type}) => (req, res, next) => {

			console.log(`Getting ${type.singular} ${req.pathParams.id}...`);

			// TODO: extract duplicate code from the two GETs (this one, and the one above)

			/* preparing the part of the query that adds relationship info */
			let {optionalMatches, objectMembers} = relationshipQueryFragments(type, 'n');

			Promise.resolve()

				/* throw a 404 if the resource doesn't exist */
				.then(() => assertResourceExists(type, req.pathParams.id))

				/* send the query */
				.then(() => getSingleResource(type, req.pathParams.id))

				/* send the response; pass any error to Express through 'next' */
				.then((nodes) => {  res.status(OK).send(nodes)  }, next);

		},
		post: ({type}) => (req, res, next) => {

			console.log(`Updating ${type.singular} ${req.pathParams.id}...`);

			Promise.resolve()

				/* throw a 404 if the resource doesn't exist */
				.then(() => assertResourceExists(type, req.pathParams.id))

				/* the main query for updating the node */
				.then(() => type.update ? type.update({type}, req) : query({
					statement: `
						MATCH (n:${type.name} {id: ${req.pathParams.id}})
						SET n += {dbProperties}
						RETURN n
					`,
					parameters: {  dbProperties: dbOnly(type, req.body)  }
				}).then(pluckData('n')))

				/* add all required relationships, remove others */
				.then((nodes) => {
					let relationshipPatterns = [];
					for (let [relA, relB] of type.relationships) {
						// TODO: if given is an array but shouldn't be,  400 ERROR
						// TODO: if given is NOT an array but should be, 400 ERROR
						let given = req.body[relA.fieldName];
						if (!given) { continue }
						let relatedIds = (relA.fieldCardinality === ONE) ? [given] : (given || []);
						let [l, r] = arrowEnds(relA);
						//noinspection JSReferencingMutableVariableFromClosure
						relationshipPatterns.push(`
							WITH A
							MATCH (A) ${l}[r:${relA.relationship.name}]${r} (B)
							${relatedIds.length > 0 ? `WHERE NOT B.id IN [${relatedIds.join(', ')}]` : ''}
							REMOVE r
						`, ...relatedIds.map(id => `
							WITH A
							MATCH (B:${relB.type.name} { id: ${id} })
							CREATE UNIQUE (A) ${l}[:${relA.relationship.name}]${r} (B)
						`));
					}
					if (relationshipPatterns.length > 0) {
						return query(`
							MATCH (A:${type.name} { id: ${nodes[0].id} })
							${relationshipPatterns}
						`);
					}
				})

				/* re-fetch the resource */
				.then(() => getSingleResource(type, req.pathParams.id))

				/* send the response; pass any error to Express through 'next' */
				.then((nodes) => {  res.status(OK).send(nodes)  }, next);

		},
		put: ({type}) => (req, res, next) => {

			console.log(`Replacing ${type.singular} ${req.pathParams.id}...`);

			Promise.resolve()

				/* throw a 404 if the resource doesn't exist */
				.then(() => assertResourceExists(type, req.pathParams.id))

				/* the main query for updating the node */
				.then(() => type.update ? type.update({type}, req) : query({
					statement: `
						MATCH (n:${type.name} { id: ${req.pathParams.id} })
						SET n      =  {dbProperties}
						SET n.id   =  ${req.pathParams.id}
						SET n.type = "${type.name}"
						RETURN n
					`,
					parameters: {  dbProperties: dbOnly(type, req.body)  }
				}).then(pluckData('n')))

				/* add all required relationships, remove others */
				.then((nodes) => {
					let relationshipPatterns = [];
					for (let [relA, relB] of type.relationships) {
						// if given is absent, but should be an array, that's OK, we use an empty array
						// TODO: if given is absent, and shouldn't be an array, 400 ERROR
						// TODO: if given is an array but shouldn't be,  400 ERROR
						// TODO: if given is NOT an array but should be, 400 ERROR
						let given = req.body[relA.fieldName];
						let relatedIds = (relA.fieldCardinality === ONE) ? [given] : (given || []);
						let [l, r] = arrowEnds(relA);
						//noinspection JSReferencingMutableVariableFromClosure
						relationshipPatterns.push(`
							WITH A
							MATCH (A) ${l}[rel:${relA.relationship.name}]${r} (B)
							${relatedIds.length > 0 ? `WHERE NOT B.id IN [${relatedIds.join(', ')}]` : ''}
							REMOVE rel
						`, ...relatedIds.map(id => `
							WITH A
							MATCH (B:${relB.type.name} { id: ${id} })
							CREATE UNIQUE (A) ${l}[:${relA.relationship.name}]${r} (B)
						`));
					}
					if (relationshipPatterns.length > 0) {
						return query(`
							MATCH (A:${type.name} { id: ${nodes[0].id} })
							${relationshipPatterns}
						`);
					}
				})

				/* re-fetch the resource */
				.then(() => getSingleResource(type, req.pathParams.id))

				/* send the response; pass any error to Express through 'next' */
				.then((resources) => {  res.status(OK).send(resources)  }, next);

		},
		delete: ({type}) => (req, res, next) => {

			console.log(`Deleting ${type.singular} ${req.pathParams.id}...`);

			Promise.resolve()

				/* throw a 404 if the resource doesn't exist */
				.then(() => assertResourceExists(type, req.pathParams.id))

				/* get all ids that would be auto-deleted by deleting this particular node */
				.then(() => getIdsToDelete(req.pathParams.id))

				/* then test whether of those are still anchored, and we have to abort the delete operation */
				.then((ids) => anythingAnchoredFromOutside(ids).then((anchors) => {
					if (anchors.length > 0) {
						throw customError({
							status: CONFLICT,
							anchors,
							message: `Certain resources would need to be deleted in response to this request, ` +
							         `but they are being kept alive by other resources.`
						});
					} else {
						return ids;
					}
				}))

				/* the main query for updating the node */
				.then((ids) => type.delete ? type.delete({type}, req, ids) : query(`
					MATCH (n)
					WHERE n.id IN [${ids.join(',')}]
					OPTIONAL MATCH (n)-[r]-()
					DELETE n, r
				`))

				/* send the response; pass any error to Express through 'next' */
				.then(() => {  res.status(NO_CONTENT).send()  }, next);

		}
	},
	relationships: {
		get: ({type, relA, relB}) => (req, res, next) => {

			console.log(`Getting all ${relB.type.plural} that are '${relA.fieldName}' of ${relA.type.singular} ${req.pathParams.idA}...`);

			/* preparing the part of the query that adds relationship info for relB */
			let {optionalMatches, objectMembers} = relationshipQueryFragments(relB.type, 'B');
			let [l, r] = arrowEnds(relA);

			Promise.resolve()

				/* throw a 404 if the resource doesn't exist */
				.then(() => assertResourceExists(relA.type, req.pathParams.idA))

				/* formulating and sending the query */
				.then(() => query(`
					MATCH (A:${relA.type.name} {id: ${req.pathParams.idA})
					      ${l}[:${type.name}]${r}
					      (B:${relB.type.name})
					${optionalMatches.join(' ')}
					RETURN B, { ${objectMembers.join(', ')} } AS relationships
				`))

				/* integrate relationship data into the resource object */
				.then(([{B, relationships}]) => Object.assign({}, B, relationships))

				/* send the response; pass any error to Express through 'next' */
				.then((nodes) => {  res.status(OK).send(nodes)  }, next);

		}
	},
	specificRelationship: {
		put: ({type, relA, relB}) => (req, res, next) => {

			console.log(`Adding ${relB.type.singular} ${req.pathParams.idB} to the '${relA.fieldName}' of ${relA.type.singular} ${req.pathParams.idA}...`);

			// TODO: check whether adding or deleting any relationships below violates any constraints

			Promise.resolve()

				/* throw a 404 if the A resource doesn't exist */
				.then(() => assertResourceExists(relA.type, req.pathParams.idA))

				/* throw a 404 if the B resource doesn't exist */
				.then(() => assertResourceExists(relB.type, req.pathParams.idB))

				/* the main query for adding the new relationship, and possibly deleting an existing one that needs to be replaced */
				.then(() => type.set ? type.set({type, relA, relB}, req) : query(`
					MATCH (A:${relA.type.name} {id: ${req.pathParams.idA}}),
					      (B:${relB.type.name} {id: ${req.pathParams.idB}})
					${relB.fieldCardinality === ONE ? `
						WITH A, B
						MATCH (other) ${l}[rel:${type.name}]${r} (B)
						WHERE NOT other = A
						REMOVE rel
					` : ''}
					CREATE UNIQUE (A) ${l}[:${type.name}]${r} (B)
				`))

				/* send the response; pass any error to Express through 'next' */
				.then(() => {  res.status(NO_CONTENT).send()  }, next);

		},
		delete: ({type, relA, relB}) => (req, res, next) => {

			console.log(`Removing ${relB.type.singular} ${req.pathParams.idB} from the '${relA.fieldName}' of ${relA.type.singular} ${req.pathParams.idA}...`);

			// TODO: check whether deleting this relationship violates any constraints

			let [l, r] = arrowEnds(relA);

			Promise.resolve()

				/* throw a 404 if the A resource doesn't exist */
				.then(() => assertResourceExists(relA.type, req.pathParams.idA))

				/* throw a 404 if the B resource doesn't exist */
				.then(() => assertResourceExists(relB.type, req.pathParams.idB))

				/* the main query for deleting the existing relationship */
				.then(() => type.delete ? type.delete({type, relA, relB}, req) : query(`
					MATCH (A:${relA.type.name} {id: ${req.pathParams.idA}})
					      ${l}[rel:${type.name}]${r}
					      (B:${relB.type.name} {id: ${req.pathParams.idB}})
					DELETE rel
				`))

				/* send the response; pass any error to Express through 'next' */
				.then(() => {  res.status(NO_CONTENT).send()  }, next);

		}
	}
};


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// internal middleware                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* parameter normalizer */
function parameterNormalizer(req, res, next) {
	for (let newIdKey of Object.keys(req.swagger.path['x-param-map'] || {})) {
		let oldIdKey = req.swagger.path['x-param-map'][newIdKey];
		req.pathParams[newIdKey] = req.pathParams[oldIdKey];
	}
	return next();
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// simple internal error-handling middleware                                                                          //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* error normalizer */
function errorNormalizer(err, req, res, next) {

	/* swagger errors */
	if (err.message) {
		let match = err.message.match(/\d\d\d Error: (.*)/);
		if (match) {
			return next({
				status:  err.status,
				message: match[1]
			});
		}
	}

	/* Neo4j errors */
	if (_.isArray(err) && _.isString(err[0].code) && err[0].code.startsWith('Neo.')) {
		if (Array.isArray(err) && err.length === 1) { err = err[0] }
		return next({
			status:        INTERNAL_SERVER_ERROR,
			message:       "An unknown error occurred in the database.",
			originalError: err
		});
	}

	/* custom errors coming from our own code */
	if (isCustomError(err)) {
		return next(cleanCustomError(err));
	}

	/* any other errors */
	return next({
		status:        INTERNAL_SERVER_ERROR,
		message:       "An unknown error occurred on the server.",
		originalError: err
	});

}


/* error logging */
function errorLogger(err, req, res, next) {
	console.error(JSON.stringify(err, null, 4));
	return next(err);
}


/* error transmission */
function errorTransmitter(err, req, res, next) {
	res.status(err.status).send(err);
	return next(err);
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// create uniqueness constraints on ids for all node types                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

for (let typeName of Object.keys(resources)) {
	createUniqueIdConstraintOn(typeName);
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// the server                                                                                                         //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* the express application */
let app = express();


/* serve swagger-ui based documentation */
app.use('/docs', express.static(__dirname + '/../../dist/docs/'));


/* serve client files (for testing purposes) */
['index.html', 'index.js', 'index.js.map'].forEach((filename) => {
	app.get('/'+filename, (req, res) => {
		res.status(OK).sendFile(filename, { root: __dirname + '/../../dist/client/' });
	});
});

/* load and apply the middleware, configure paths, and start the server  */
swaggerMiddleware(swagger, app, (err, middleware) => {

	/* report any immediate errors */
	if (err) { console.error(err) }

	/* use Swagger middleware */
	app.use(
		middleware.files({ apiPath: '/swagger.json', rawFilesPath: false }),
		middleware.metadata(),
		middleware.parseRequest(),
		middleware.validateRequest()
	);

	/* normalize parameter names */
	app.use(parameterNormalizer);

	/* additional validation on requests */
	// TODO: check required fields
	// TODO: check other constraints

	/* request handling */
	for (let path of Object.keys(swagger.paths)) {
		let pathObj          = swagger.paths[path];
		let expressStylePath = path.replace(/{(\w+)}/g, ':$1');
		for (let method of Object.keys(pathObj).filter(p => !/x-/.test(p))) {
			switch (pathObj['x-path-type']) {
				case 'resources':
				case 'specificResource':
					app[method](
						expressStylePath,
						requestHandler[pathObj['x-path-type']][method]({
							type: resources[pathObj['x-resource-name']]
						})
					);
					break;
				case 'relationships':
				case 'specificRelationship':
					app[method](
						expressStylePath,
						requestHandler[pathObj['x-path-type']][method]({
							type: relationships[pathObj['x-relationship-name']],
							relA: relationships[pathObj['x-relationship-name']][pathObj['x-A']],
							relB: relationships[pathObj['x-relationship-name']][pathObj['x-B']],
							rel1: relationships[pathObj['x-relationship-name']][1],
							rel2: relationships[pathObj['x-relationship-name']][2]
						})
					);
					break;
			}
		}
	}

	/* handling error messages */
	app.use(
		errorNormalizer,
		errorLogger,
		errorTransmitter
	);

	/* start listening for requests */
	app.listen(3000, () => {
		console.log('Listening on http://localhost:3000');
	});

});


