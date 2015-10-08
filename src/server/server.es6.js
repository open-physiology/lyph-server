////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* argument parsing (could auto-exit the process when --help is asked) */
import config from '../config.es6.js';

/* external libs */
import _                 from 'lodash';
import co                from 'co';
import util              from 'util';
import express           from 'express';
import swaggerMiddleware from 'swagger-express-middleware';

/* local stuff */
import swagger from '../swagger.es6';
import {
	debugPromise,
	customError,
	isCustomError,
	cleanCustomError,
	pluckData,
	pluckDatum,
	dbOnly,
	arrowEnds,
	arrowMatch,
	relationshipQueryFragments
} from '../util.es6.js';
import {
	sustainingRelationships,
	anchoringRelationships,
	relationships,
	resources
} from '../resources.es6.js';
import {
	createUniqueIdConstraintOn,
	query
} from '../neo4j.es6.js';
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
} from '../http-status-codes.es6.js';
import {
	assertResourceExists,
	getSingleResource,
	getAllResources,
	createResource
} from '../common-queries.es6.js';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// complex delete-related queries                                                                                     //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let symmetricSustaining = sustainingRelationships.filter((relA) =>  relA.symmetric);
let l2rSustaining       = sustainingRelationships.filter((relA) => !relA.symmetric && relA.side === 1);
let r2lSustaining       = sustainingRelationships.filter((relA) => !relA.symmetric && relA.side === 2);

let symmetricAnchoring  = anchoringRelationships .filter((relA) =>  relA.symmetric);
let l2rAnchoring        = anchoringRelationships .filter((relA) => !relA.symmetric && relA.side === 1);
let r2lAnchoring        = anchoringRelationships .filter((relA) => !relA.symmetric && relA.side === 2);


// TODO: use co.wrap on these functions not yet co.wrap-ified

const getResourcesToDelete = co.wrap(function* (type, id) {

	/* collect nodes to delete */
	let markedNodes = new Map();

	/* traverse graph to find nodes to delete, based on 'sustaining' relationships */
	const recurse = co.wrap(function* ({type, id}) {
		if (markedNodes.has(id)) { return }
		markedNodes.set(id, { type, id });
		let nResources = yield query(`
			MATCH (a:${type.name} { id: ${id} })
			${arrowMatch(symmetricSustaining, 'a', ' -','- ', 'x')}
			${arrowMatch(l2rSustaining,       'a', ' -','->', 'y')}
			${arrowMatch(r2lSustaining,       'a', '<-','- ', 'z')}
			WITH ${symmetricSustaining.length ? 'collect(x)' : '[]'} +
			     ${l2rSustaining      .length ? 'collect(y)' : '[]'} +
			     ${r2lSustaining      .length ? 'collect(z)' : '[]'} AS coll UNWIND coll AS n
			WITH DISTINCT n
			RETURN { id: n.id, type: n.type } AS n
		`).then(pluckData('n'));
		yield nResources.map(({id, type}) => ({id, type: resources[type]})).map(recurse);
	});
	yield recurse({ type, id });

	/* return the nodes that would be deleted */
	return [...markedNodes.values()];
});

const anythingAnchoredFromOutside = co.wrap(function* (ids) {
	return yield query(`
		WITH [${ids.join(',')}] AS ids
		${ symmetricAnchoring.length ? `
			OPTIONAL MATCH (x) -[:${symmetricAnchoring.map(({relationship:{name}})=>name).join('|')}]- (a)
			WHERE (NOT x.id in ids) AND (a.id in ids)
			WITH ids, collect({ anchoring: x.id, anchored: a.id }) AS anchors1
		` : 'WITH ids, [] AS anchors1' }
		${ l2rAnchoring.length ? `
			OPTIONAL MATCH (y) -[:${l2rAnchoring.map(({relationship:{name}})=>name).join('|')}]-> (b)
			WHERE (NOT y.id in ids) AND (b.id in ids)
			WITH ids, anchors1 + collect({ anchoring: y.id, anchored: b.id }) AS anchors2
		` : 'WITH ids, anchors1 AS anchors2' }
		${ r2lAnchoring.length ? `
			OPTIONAL MATCH (z) <-[:${r2lAnchoring.map(({relationship:{name}})=>name).join('|')}]- (c)
			WHERE (NOT z.id in ids) AND (c.id in ids)
			WITH ids, anchors2 + collect({ anchoring: z.id, anchored: c.id }) AS anchors3
		` : 'WITH ids, anchors2 AS anchors3' }
		UNWIND anchors3 AS n
		WITH DISTINCT n
		WHERE n.anchoring IS NOT NULL
		RETURN DISTINCT n
	`).then(pluckData('n'));
});


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// request handlers                                                                                                   //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// TODO: to avoid race conditions, use a Neo4j REST transactions to get some ACID around these multiple queries

const requestHandler = {
	resources: {
		get: co.wrap(function* ({type}, req, res, next) {
			try {

				res.status(OK).send(yield getAllResources(type));

			} catch (err) { next(err) }
		}),
		post: co.wrap(function* ({type}, req, res, next) {
			try {

				/* the main query for creating the node */
				let id = yield createResource(type, req.body);

				/* allow specific resource types to do extra 'ad-hoc' stuff */
				if (type.create) { yield type.create({id, resources, relationships}, req) }

				/* send the newly created resource */
				res.status(CREATED).send(yield getSingleResource(type, id));

			} catch (err) { next(err) }
		})
	},
	specificResource: {
		get: co.wrap(function* ({type}, req, res, next) {
			try {

				/* extract the id */
				let {id} = req.pathParams;

				/* throw a 404 if the resource doesn't exist */
				yield assertResourceExists(type, id);

				// TODO: allow ad-hoc 'type.get' code here

				/* send the response */
				res.status(OK).send(yield getSingleResource(type, id))

			} catch (err) { next(err) }
		}),
		post: co.wrap(function* ({type}, req, res, next) {
			try {

				/* extract the id */
				let {id} = req.pathParams;

				/* throw a 404 if the resource doesn't exist */
				yield assertResourceExists(type, id);

				/* the main query for updating the resource */
				query({
					statement: `
						MATCH (n:${type.name} {id: ${id}})
						SET n += {dbProperties}
						SET n.id   =  ${id}
						SET n.type = "${type.name}"
					`,
					parameters: {  dbProperties: dbOnly(type, req.body)  }
				});

				/* add all required relationships, remove others */
				let relationshipQueries = [];
				for (let relA of type.relationships) {
					// TODO: if given is an array but shouldn't be,  400 ERROR
					// TODO: if given is NOT an array but should be, 400 ERROR
					let given = req.body[relA.fieldName];
					if (!given) { continue }
					let relatedIds = (relA.fieldCardinality === 'one') ? [given] : (given || []);
					let [l, r] = arrowEnds(relA);
					//noinspection JSReferencingMutableVariableFromClosure
					relationshipQueries.push(`
						MATCH (A:${type.name} { id: ${id} })
						      ${l}[r:${relA.relationship.name}]${r}
						      (B)
						WHERE NOT B.id IN [${relatedIds.join(', ')}]
						DELETE r
					`, ...relatedIds.map(rId => `
						MATCH (A:${type.name} { id: ${id} }),
						      (B:${relA.otherSide.type.name} { id: ${rId} })
						CREATE UNIQUE (A) ${l}[:${relA.relationship.name}]${r} (B)
					`));
				}
				if (relationshipQueries.length > 0) {
					yield query(relationshipQueries);
				}

				/* allow specific resource types to do extra 'ad-hoc' stuff */
				if (type.update) { yield type.update({id, resources, relationships}, req) }

				/* send the response */
				res.status(OK).send(yield getSingleResource(type, id));

			} catch (err) { next(err) }
		}),
		put: co.wrap(function* ({type}, req, res, next) {
			try {

				/* extract the id */
				let {id} = req.pathParams;

				/* throw a 404 if the resource doesn't exist */
				yield assertResourceExists(type, id);

				/* the main query for updating the resource */
				yield query({
					statement: `
						MATCH (n:${type.name} {id: ${id}})
						SET n += {dbProperties}
					`,
					parameters: {  dbProperties: dbOnly(type, req.body)  }
				});

				/* the main query for replacing the resource */
				yield query({
					statement: `
						MATCH (n:${type.name} { id: ${id} })
						SET n      =  {dbProperties}
						SET n.id   =  ${id}
						SET n.type = "${type.name}"
					`,
					parameters: {  dbProperties: dbOnly(type, req.body)  }
				});

				/* add all required relationships, remove others */
				let relationshipPatterns = [];
				for (let relA of type.relationships) {
					// if given is absent, but should be an array, that's OK, we use an empty array
					// TODO: if given is absent, and shouldn't be an array, 400 ERROR
					// TODO: if given is an array but shouldn't be,  400 ERROR
					// TODO: if given is NOT an array but should be, 400 ERROR
					let given = req.body[relA.fieldName];
					let relatedIds = (relA.fieldCardinality === 'one') ? [given] : (given || []);
					let [l, r] = arrowEnds(relA);
					//noinspection JSReferencingMutableVariableFromClosure
					relationshipPatterns.push(`
						WITH A
						MATCH (A) ${l}[rel:${relA.relationship.name}]${r} (B)
						${relatedIds.length > 0 ? `WHERE NOT B.id IN [${relatedIds.join(', ')}]` : ''}
						REMOVE rel
					`, ...relatedIds.map(id => `
						WITH A
						MATCH (B:${relA.otherSide.type.name} { id: ${id} })
						CREATE UNIQUE (A) ${l}[:${relA.relationship.name}]${r} (B)
					`));
				}
				if (relationshipPatterns.length > 0) {
					yield query(`
						MATCH (A:${type.name} { id: ${id} })
						${relationshipPatterns.join(' ')}
					`);
				}

				/* allow specific resource types to do extra 'ad-hoc' stuff */
				if (type.replace) { yield type.replace({id, resources, relationships}, req) }

				/* send the response */
				res.status(OK).send(yield getSingleResource(type, id))

			} catch (err) { next(err) }
		}),
		delete: co.wrap(function* ({type, resources, relationships}, req, res, next) {
			try {

				/* extract the id */
				let {id} = req.pathParams;

				/* throw a 404 if the resource doesn't exist */
				yield assertResourceExists(type, id);

				/* get all ids+types that would be auto-deleted by deleting this particular node */
				let dResources = yield getResourcesToDelete(type, id);

				/* then test whether of those are still anchored, and we have to abort the delete operation */
				let anchors = yield anythingAnchoredFromOutside(dResources.map(_.property('id')));
				if (anchors.length > 0) {
					throw customError({
						status: CONFLICT,
						anchors,
						message: `Certain resources would need to be deleted in response to this request, ` +
							/**/ `but they are being kept alive by other resources.`
					});
				}

				/* allow ad-hoc things to take place before deletion */
				yield dResources.reverse().map(({id: dId, type: dType}) => {
					if (dType.delete) {
						return dType.delete({
							type: dType,
							id:   dId,
							resources,
							relationships
						}, req);
					}
				});

				/* the main query for deleting the node */
				yield query(`
					MATCH (n)
					WHERE n.id IN [${dResources.map(_.property('id')).join(',')}]
					OPTIONAL MATCH (n)-[r]-()
					DELETE n, r
				`);

				/* send the response */
				res.status(NO_CONTENT).send();

			} catch (err) { next(err) }
		})
	},
	relationships: {
		get: co.wrap(function* ({type, relA, relB}, req, res, next) {
			try {

				/* throw a 404 if the resource doesn't exist */
				yield assertResourceExists(relA.type, req.pathParams.idA);

				/* formulating and sending the query */
				let {optionalMatches, objectMembers} = relationshipQueryFragments(relB.type, 'B');
				let [l, r] = arrowEnds(relA);
				let results = yield query(`
					MATCH (A:${relA.type.name} { id: ${req.pathParams.idA} })
					      ${l}[:${type.name}]${r}
					      (B:${relB.type.name})
					${optionalMatches.join(' ')}
					RETURN B, { ${objectMembers.join(', ')} } AS relationships
				`);

				/* integrate relationship data into the resource object */
				results = results.map(({B, relationships}) => Object.assign(B, relationships));

				/* send the response */
				res.status(OK).send(results);

			} catch (err) { next(err) }
		})
	},
	specificRelationship: {
		put: co.wrap(function* ({type, relA, relB}, req, res, next) {
			// TODO: check whether adding or deleting any relationships below violates any constraints
			try {

				/* throw a 404 if either of the resources doesn't exist */
				yield [
					assertResourceExists(relA.type, req.pathParams.idA),
					assertResourceExists(relB.type, req.pathParams.idB)
				];

				/* the main query for adding the new relationship, and possibly deleting an existing one that needs to be replaced */
				yield query(`
					MATCH (A:${relA.type.name} { id: ${req.pathParams.idA} }),
					      (B:${relB.type.name} { id: ${req.pathParams.idB} })
					${relB.fieldCardinality === 'one' ? `
						WITH A, B
						MATCH (other) ${l}[rel:${type.name}]${r} (B)
						WHERE NOT other = A
						REMOVE rel
					` : ''}
					CREATE UNIQUE (A) ${l}[:${type.name}]${r} (B)
				`);

				// TODO: ad-hoc 'set' stuff, but also 'delete' for any removed relationships
				// type.set ? type.set({type, relA, relB, resources, relationships}, req)

				/* send the response; pass any error to Express through 'next' */
				res.status(NO_CONTENT).send();

			} catch (err) { next(err) }
		}),
		delete: co.wrap(function* ({type, relA, relB}, req, res, next) {
			// TODO: check whether deleting this relationship violates any constraints
			try {

				/* throw a 404 if either of the resources doesn't exist */
				yield [
					assertResourceExists(relA.type, req.pathParams.idA),
					assertResourceExists(relB.type, req.pathParams.idB)
				];

				// TODO: ad-hoc 'delete' stuff
				//type.delete ? type.delete({type, relA, relB, resources, relationships}, req)

				/* the main query for deleting the existing relationship */
				let [l, r] = arrowEnds(relA);
				yield query(`
					MATCH (A:${relA.type.name} {id: ${req.pathParams.idA}})
					      ${l}[rel:${type.name}]${r}
					      (B:${relB.type.name} {id: ${req.pathParams.idB}})
					DELETE rel
				`);

				/* send the response */
				res.status(NO_CONTENT).send();

			} catch (err) { next(err) }
		})
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

	/* custom errors coming from our own code */
	if (isCustomError(err)) {
		return next(cleanCustomError(err));
	}

	/* swagger errors */
	if (err.message && err.message.match(/^\d\d\d Error:/)) {
		let messages = [];
		let properties = {};
		for (let msgPart of err.message.split('\n')) {
			let match = msgPart.match(/\d\d\d Error: (.*)/);
			if (match) {
				messages.push(match[1]);
				continue;
			}
			match = msgPart.match(/(.*?): \s*"?([^"]*)"?\s*/);
			if (match) {
				properties[match[1]] = match[2];
				continue;
			}
		}
		return next({
			info:    properties,
			status:  err.status,
			message: messages.map(msg => msg.replace(/"([\w\d\-_\s]+?)"/g, "'$1'")).join(' ')
			//       ^ we like single-quoted strings
		});
	}

	/* Neo4j errors */
	if (_.isArray(err) && _.isString(err[0].code) && err[0].code.startsWith('Neo.')) {
		if (Array.isArray(err) && err.length === 1) { err = err[0] }
		return next({
			status:        INTERNAL_SERVER_ERROR,
			message:       "An error occurred in the database that we did not expect. Please let us know!",
			originalError: err
		});
	}

	/* any other errors */
	return next({
		status:        INTERNAL_SERVER_ERROR,
		message:       "An error occurred on the server that we did not expect. Please let us know!",
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


/* done with error */
function doneWithError(err, req, res, next) {}


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
app.use('/docs', express.static(`${__dirname}/../docs/`));


///* serve client files (for testing purposes) */
//['index.html', 'index.js', 'index.js.map'].forEach((filename) => {
//	app.get(`/${filename}`, (req, res) => {
//		res.status(OK).sendFile(filename, { root: `${__dirname}/../client/` });
//	});
//});

/* load and apply the middleware, configure paths, and start the server  */
swaggerMiddleware(`${__dirname}/../swagger.json`, app, (err, middleware) => {

	/* report any immediate errors */
	if (err) { console.error(err) }

	/* use Swagger middleware */
	app.use(
		middleware.files({ apiPath: false, rawFilesPath: '/' }),
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
						requestHandler[pathObj['x-path-type']][method].bind(null, {
							type: resources[pathObj['x-resource-name']]
						})
					);
					break;
				case 'relationships':
				case 'specificRelationship':
					app[method](
						expressStylePath,
						requestHandler[pathObj['x-path-type']][method].bind(null, {
							type: relationships[pathObj['x-relationship-name']],
							relA: relationships[pathObj['x-relationship-name']][pathObj['x-A']],
							relB: relationships[pathObj['x-relationship-name']][pathObj['x-B']]
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
		errorTransmitter,
		doneWithError
	);

	/* start listening for requests */
	app.listen(config.port, () => {
		console.log(`Listening on http://${config.host}:${config.port}`);
	});

});
