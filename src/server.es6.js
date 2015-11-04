////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* external libs */
import _                 from 'lodash';
import co                from 'co';
import util              from 'util';
import express           from 'express';
import promisify         from 'es6-promisify';
const swaggerMiddleware = promisify(require('swagger-express-middleware'));

/* local stuff */
import LyphNeo4j from './LyphNeo4j.es6.js';
import swagger   from './swagger.es6';
import {
	debugPromise,
	customError,
	isCustomError,
	cleanCustomError
} from './utility.es6.js';
import {
	relationships,
	resources
} from './resources.es6.js';
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
// request handlers                                                                                                   //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// TODO: to avoid race conditions, use a Neo4j REST transactions to get some ACID around these multiple queries

const requestHandler = {
	resources: {
		*get({db, type}, req, res) {
			res.status(OK).send( yield db.getAllResources(type) );
		},
		*post({db, type}, req, res) {
			let id = yield db.createResource(type, req.body);
			res.status(CREATED).send(yield db.getSingleResource(type, id));
		}
	},
	specificResource: {
		*get({db, type}, req, res) {
			res.status(OK).send(yield db.getSingleResource(type, req.pathParams.id));
		},
		*post({db, type}, req, res) {
			yield db.updateResource(type, req.pathParams.id, req.body);
			res.status(OK).send(yield db.getSingleResource(type, req.pathParams.id));
		},
		*put({db, type}, req, res) {
			yield db.replaceResource(type, req.pathParams.id, req.body);
			res.status(OK).send(yield db.getSingleResource(type, req.pathParams.id));
		},
		*delete({db, type, resources, relationships}, req, res) {
			yield db.deleteResource(type, req.pathParams.id);
			res.status(NO_CONTENT).send();
		}
	},
	relationships: {
		*get({db, relA}, req, res) {
			res.status(OK).send( yield db.getRelatedResources(relA, req.pathParams.idA) );
		}
	},
	specificRelationship: {
		*put({db, relA}, req, res) {
			yield db.addNewRelationship(relA, req.pathParams.idA, req.pathParams.idB);
			res.status(NO_CONTENT).send();
		},
		*delete({db, relA}, req, res) {
			yield db.deleteRelationship(relA, req.pathParams.idA, req.pathParams.idB);
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
// the server                                                                                                         //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export default co.wrap(function* (distDir, config) {

	/* the express application */
	let server = express();

	/* load the middleware */
	let [middleware] = yield swaggerMiddleware(`${distDir}/swagger.json`, server);

	/* serve swagger-ui based documentation */
	server.use('/docs', express.static(`${distDir}/docs/`));

	/* use Swagger middleware */
	server.use(
		middleware.files({ apiPath: false, rawFilesPath: '/' }),
		middleware.metadata(),
		middleware.parseRequest(),
		middleware.validateRequest()
	);

	/* set up database */
	let db = new LyphNeo4j({
		user: config.dbUser,
		pass: config.dbPass,
		host: config.dbHost,
		port: config.dbPort
	});

	/* create uniqueness constraints for all resource types (once per db) */
	yield Object.keys(resources).map(_.bindKey(db, 'createUniqueIdConstraintOn'));

	/* normalize parameter names */
	server.use(parameterNormalizer);

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
			Object.assign(info, { db });
			server[method](expressStylePath, (req, res, next) => {
				try { requestHandler[pathObj['x-path-type']][method](info, req, res).catch(next) }
				catch (err) { next(err) }
			});
		}
	}

	/* handling error messages */
	server.use(errorNormalizer);
	if (config.consoleLogging !== false) { server.use(errorLogger) }
	server.use(errorTransmitter);
	server.use(doneWithError);

	/* return the server app and possibly database */
	return config.exposeDB ? {database: db, server} : server;

});
