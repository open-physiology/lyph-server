////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* external libs */
import _                 from 'lodash';
import util              from 'util';
import express           from 'express';
import swaggerMiddleware from 'swagger-express-middleware';

/* local stuff */
import {relationships, resources, ONE, MANY} from '../resources.es6.js';
import swagger                               from '../swagger.es6';
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
	PRECONDITION_FAILED,
	INTERNAL_SERVER_ERROR
} from '../http-status-codes.es6.js';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// convenience functions                                                                                              //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* get right to the data from a Neo4j response */
const pluckData = (name) => (res) => res.map((obj) => obj[name]);

/* to pick only those properties that should not be skipped from the database */
const dbOnly = (type, allProperties) => _.omit(allProperties, (__, prop) =>
	type.schema.properties[prop] &&
	type.schema.properties[prop]['x-skip-db']
);


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// request handlers                                                                                                   //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const requestHandler = {
	resources: {
		get: ({type}) => (req, res, next) => {

			console.log(`Getting all ${type.plural}...`);

			/* preparing the part of the query that adds relationship info */
			let optionalMatches = [];
			let objectMembers = [];
			let handledFieldNames = {}; // to avoid duplicates
			for (let [relA, relB] of type.relationships) {
				if (handledFieldNames[relA.fieldName]) { continue }
				handledFieldNames[relA.fieldName] = true;
				let [l, r] = (relA.side === 1) ? ['-','->'] : ['<-','-'];
				optionalMatches.push(`
					OPTIONAL MATCH (n)
					               ${l}[:${relA.relationship.name}]${r}
					               (rel_${relA.fieldName}:${relB.type.name})
		        `);
				objectMembers.push(
					relA.fieldCardinality === MANY
						? `${relA.fieldName}: collect(DISTINCT rel_${relA.fieldName}.id)`
						: `${relA.fieldName}: rel_${relA.fieldName}.id`
				);
			}

			/* formulating and sending the query; pass errors to Express through 'next' */
			query(`
				MATCH (n:${type.name})
				${optionalMatches.join(' ')}
				WITH n, { ${objectMembers.join(', ')} } AS relationships
				RETURN n, relationships
			`).then((result) => {
				console.log(JSON.stringify(result, null, 4));
				let [{n, relationships}] = result;
				return Object.assign(n, relationships);
			}).then((nodes) => {
				res.status(OK).send(nodes);
			}, next);

		},
		post: ({type}) => (req, res, next) => {

			console.log(`Creating a new ${type.singular}...`);

			// TODO: to avoid race conditions, use a Neo4j REST transaction to envelop these two steps
			Promise.resolve()

				/* the main query for creating the node */
				.then(() => {
					if (type.create) {
						return type.create({type}, req);
					} else {
						return query([
							LOCK_UID,
							{
								statement: `
									${WITH_NEW_ID('newID')}
									CREATE (n:${type.name} { id: newID, type: "${type.name}" })
									SET n += {dbProperties}
									RETURN n
								`,
								parameters: {  dbProperties: dbOnly(req.body)  }
							}
						]).then(pluckData('n'));
					}
				})

				/* add all required relationships */
				.then((nodes) => {
					let relationshipPatterns = [];
					for (let [relA, relB] of type.relationships) {
						// if given is absent, but should be an array, that's OK, we use an empty array
						// TODO: if given is absent, and shouldn't be an array, 400 ERROR
						// TODO: if given is an array but shouldn't be,         400 ERROR
						// TODO: if given is NOT an array but should be,        400 ERROR
						let given = req.body[relA.fieldName];
						let relatedIds = (relA.fieldCardinality === ONE) ? [given] : (given || []);
						let [l, r] = (relA.side === 1) ? ['-','->'] : ['<-','-'];
						relationshipPatterns.push(...relatedIds.map(id => `
							WITH A
							MATCH (B:${relB.type.name} { id: ${id} })
							CREATE UNIQUE (A) ${l}[:${relA.relationship.name}]${r} (B)
						`));
					}
					if (relationshipPatterns.length > 0) {
						return query(`
							MATCH (A:${type.name} { id: ${nodes[0].id} })
							${relationshipPatterns}
						`).then(() => nodes);
					} else {
						return nodes;
					}
				})

				/* send the response; pass any error to Express through 'next' */
				.then((nodes) => {
					res.status(CREATED).send(nodes);
				}, next);

		}
	},
	specificResource: {
		get: ({type}) => (req, res, next) => {

			console.log(`Getting ${type.singular} ${req.pathParams.id}...`);

			// TODO: extract duplicate code from the two GETs (this one, and the one above)

			/* preparing the part of the query that adds relationship info */
			let optionalMatches = [];
			let objectMembers = [];
			let handledFieldNames = {}; // to avoid duplicates
			for (let [relA, relB] of type.relationships) {
				if (handledFieldNames[relA.fieldName]) { continue }
				handledFieldNames[relA.fieldName] = true;
				let [l, r] = (relA.side === 1) ? ['-','->'] : ['<-','-'];
				optionalMatches.push(`
					OPTIONAL MATCH (n)
					               ${l}[:${relA.relationship.name}]${r}
					               (rel_${relA.fieldName}:${relB.type.name})
		        `);
				objectMembers.push(
					relA.fieldCardinality === MANY
						? `${relA.fieldName}: collect(DISTINCT rel_${relA.fieldName}.id)`
						: `${relA.fieldName}: rel_${relA.fieldName}.id`
				);
			}

			/* formulating and sending the query; pass errors to Express through 'next' */
			// TODO: the id-matcher of the MATCH clause below is probably the only part not a duplicate of the other GET
			query(`
				MATCH (n:${type.name} { id: ${req.pathParams.id} })
				${optionalMatches.join(' ')}
				WITH n, { ${objectMembers.join(', ')} } AS relationships
				RETURN n, relationships
			`).then((result) => {
				console.log(JSON.stringify(result, null, 4));
				let [{n, relationships}] = result;
				return Object.assign(n, relationships);
			}).then((nodes) => {
				res.status(OK).send(nodes);
			}, next);

		},
		post: ({type}) => (req, res, next) => {

			console.log(`Updating ${type.singular} ${req.pathParams.id}...`);

			// TODO: update relationships in the database based on new data in this 'post'
			//     : (note: missing relationship fields are ignored, not seen as empty arrays)

			let nodesP;
			if (type.update) {
				nodesP = type.update({type}, req);
			} else {
				nodesP = query({
					statement: `
						MATCH (n:${type.name} {id: ${req.pathParams.id}})
						SET n += {dbProperties}
						RETURN n
					`,
					parameters: {  dbProperties: dbOnly(req.body)  }
				}).then(pluckData('n'));
			}

			nodesP.then((nodes) => {
				res.status(OK).send(nodes);
			}, next);

		},
		put: ({type}) => (req, res, next) => {

			console.log(`Replacing ${type.singular} ${req.pathParams.id}...`);

			// TODO: update relationships in the database based on new data in this 'post'
			//     : (missing relationship fields are seen as empty arrays, and can therefore remove existing relationships)

			let nodesP;
			if (type.replace) {
				nodesP = type.replace({type}, req);
			} else {
				nodesP = query({
					statement: `
						MATCH (n:${type.name} {id: ${req.pathParams.id}})
						SET n = {dbProperties}
						RETURN n
					`,
					parameters: {  dbProperties: dbOnly(req.body)  }
				}).then(pluckData('n'));
			}

			nodesP.then((nodes) => {
				res.status(OK).send(nodes);
			}, next);

		},
		delete: ({type}) => (req, res, next) => {

			console.log(`Deleting ${type.singular} ${req.pathParams.id}...`);

			// TODO: handle relationships properly
			//     : (make use of 'sustains' and 'anchors' properties on relationships)
			//     : (this may delete connected nodes, or abort the operation, respectively)

			let nodesP;
			if (type.delete) {
				nodesP = type.delete({type}, req);
			} else {
				nodesP = query(`
					MATCH (n:${type.name} {id: ${req.pathParams.id}})
					OPTIONAL MATCH (n)-[r]-()
					DELETE n, r
				`);
			}

			nodesP.then(() => {
				res.status(NO_CONTENT).send();
			}, next);

		}
	},
	relationships: {
		get: ({type, relA, relB, rel1, rel2}) => (req, res, next) => {

			console.log(`Getting all ${relB.type.plural} that are '${relA.fieldName}' of ${relA.type.singular} ${req.pathParams.idA}...`);

			// TODO: in the list of returned nodes, insert relationship-related fields, like in the GETs above (probably lots of duplication)

			let nodesP;
			if (type.get) {
				nodesP = type.get({type, relA, relB, rel1, rel2}, req);
			} else {
				let [l, r] = (relA.side === 1) ? ['-','->'] : ['<-','-'];
				nodesP = query(`
					MATCH (A:${relA.type.name} {id: ${req.pathParams.idA})
					      ${l}[:${type.name}]${r}
					      (B:${relB.type.name})
					RETURN B
				`).then(pluckData('B'));
			}

			nodesP.then((nodes) => {
				res.status(OK).send(nodes);
			}, next);

		}
	},
	specificRelationship: {
		put: ({type, relA, relB}) => (req, res, next) => {

			console.log(`Adding ${relB.type.singular} ${req.pathParams.idB} to the '${relA.fieldName}' of ${relA.type.singular} ${req.pathParams.idA}...`);

			// TODO: can the cardinality on the other side be ONE? If so, do we replace the existing relationship on the other side?
			//     : then this should be subject to relationship deletion criteria (based on 'substains' and 'anchors')

			let nodesP;
			if (type.set) {
				nodesP = type.set({type, relA, relB}, req);
			} else {
				let [l, r] = (relA.side === 1) ? ['-','->'] : ['<-','-'];
				nodesP = query(`
					MATCH (A:${relA.type.name} {id: ${req.pathParams.idA}}),
					      (B:${relB.type.name} {id: ${req.pathParams.idB}})
					CREATE UNIQUE (A)
					              ${l}[:${type.name}]${r}
					              (B)
				`);
			}

			nodesP.then(() => {
				res.status(NO_CONTENT).send();
			}, next);

		},
		delete: ({type, relA, relB, rel1, rel2}) => (req, res, next) => {

			console.log(`Removing ${relB.type.singular} ${req.pathParams.idB} from the '${relA.fieldName}' of ${relA.type.singular} ${req.pathParams.idA}...`);

			// TODO: follow relationship deletion criteria;
			//     : is the cardinality on the other side ONE? (use 'substains' and 'anchors')

			let nodesP;
			if (type.delete) {
				nodesP = type.delete({type, relA, relB, rel1, rel2}, req);
			} else {
				let [l, r] = (relA.side === 1) ? ['-','->'] : ['<-','-'];
				nodesP = query(`
					MATCH (A:${relA.type.name} {id: ${req.pathParams.idA}})
					      ${l}[rel:${type.name}]${r}
					      (B:${relB.type.name} {id: ${req.pathParams.idB}})
					DELETE rel
				`);
			}

			nodesP.then(() => {
				res.status(NO_CONTENT).send();
			}, next);

		}
	}
};

/* error handler */
// NOTE: keep all 4 arguments in the signature, so Express recognizes it as
//       an error handler, even if the 'next' parameter is not being used
// noinspection JSUnusedLocalSymbols
function errorHandler(err, req, res, next) {

	/* swagger-originated errors */
	if (err.message) {
		let match = err.message.match(/\d\d\d Error: (.*)/);
		if (match) {
			res.status(err.status).send({
				status:  err.status,
				message: match[1]
			});
			return;
		}
	}

	/* other errors */
	if (Array.isArray(err) && err.length === 1) { err = err[0] }
	console.error(err); // TODO: remove direct console output; instead, do proper logging
	res.status(INTERNAL_SERVER_ERROR).send({
		status:        INTERNAL_SERVER_ERROR,
		message:       "An unknown error occurred on the server.",
		originalError: err
	});

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
		middleware.metadata(),
		middleware.parseRequest(),
		middleware.validateRequest()
	);

	/* normalize parameter names */
	app.use((req, res, next) => {
		for (let newIdKey of Object.keys(req.swagger.path['x-param-map'] || {})) {
			let oldIdKey = req.swagger.path['x-param-map'][newIdKey];
			req.pathParams[newIdKey] = req.pathParams[oldIdKey];
		}
		next();
	});

	/* additional validation on requests */
	// TODO: check required fields
	// TODO: check other constraints

	/* all endpoints / paths */
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

	/* normalizing error messages */
	app.use(errorHandler);

	/* start listening for requests */
	app.listen(3000, () => {
		console.log('Listening on http://localhost:3000');
	});

});


