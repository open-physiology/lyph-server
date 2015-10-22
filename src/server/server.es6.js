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
	relationshipQueryFragments,
	humanMsg
} from '../utility.es6.js';
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
	getSingleResource,
	getAllResources,
	createResource,
	updateResource,
	replaceResource,
	deleteResource,
	getRelatedResources,
	addNewRelationship,
	deleteRelationship
} from '../common-queries.es6.js';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// request handlers                                                                                                   //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// TODO: to avoid race conditions, use a Neo4j REST transactions to get some ACID around these multiple queries

const requestHandler = {
	resources: {
		*get({type}, req, res) {

			/* send the requested resources */
			res.status(OK).send( yield getAllResources(type) );

		},
		*post({type}, req, res) {

			/* create the resource as requested */
			let id = yield createResource(type, req.body);

			/* send the newly created resource */
			res.status(CREATED).send(yield getSingleResource(type, id));

		}
	},
	specificResource: {
		*get({type}, req, res) {

			/* send the requested resource */
			res.status(OK).send(yield getSingleResource(type, req.pathParams.id))

		},
		*post({type}, req, res) {

			/* update the resource as requested */
			yield updateResource(type, req.pathParams.id, req.body);

			/* send the response */
			res.status(OK).send(yield getSingleResource(type, id));

		},
		*put({type}, req, res) {

			/* replace the resource as requested */
			yield replaceResource(type, req.pathParams.id, req.body);

			/* send the response */
			res.status(OK).send(yield getSingleResource(type, id))

		},
		*delete({type, resources, relationships}, req, res) {

			/* delete the resource as requested */
			yield deleteResource(type, req.pathParams.id);

			/* send the response */
			res.status(NO_CONTENT).send();

		}
	},
	relationships: {
		*get({relA}, req, res) {

			/* send the requested relationships */
			res.status(OK).send( yield getRelatedResources(relA, req.pathParams.idA) );

		}
	},
	specificRelationship: {
		*put({relA}, req, res) {

			/* add the new relationship as requested */
			yield addNewRelationship(relA, req.pathParams.idA, req.pathParams.idB);

			/* send the response */
			res.status(NO_CONTENT).send();

		},
		*delete({relA}, req, res) {

			/* add the new relationship as requested */
			yield deleteRelationship(relA, req.pathParams.idA, req.pathParams.idB);

			/* send the response */
			res.status(NO_CONTENT).send();

		}
	}
};

/* wrapping the functions above with co.wrap */
for (let type of Object.values(requestHandler)) {
	for (let [verb, behavior] of Object.entries(type)) {
		type[verb] = co.wrap(behavior);
	}
}


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

	/* request handling */
	for (let path of Object.keys(swagger.paths)) {
		let pathObj          = swagger.paths[path];
		let expressStylePath = path.replace(/{(\w+)}/g, ':$1');
		for (let method of Object.keys(pathObj).filter(p => !/x-/.test(p))) {
			let info = (['resources', 'specificResource'].includes(pathObj['x-path-type'])) ? {
				type: resources[pathObj['x-resource-type']]
			} : {
				type: relationships[pathObj['x-relationship-type']],
				relA: relationships[pathObj['x-relationship-type']][pathObj['x-A']],
				relB: relationships[pathObj['x-relationship-type']][pathObj['x-B']]
			};
			app[method](expressStylePath, (req, res, next) => {
				try {
					requestHandler[pathObj['x-path-type']][method](info, req, res);
				} catch (err) {
					next(err);
				}
			});
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
