////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* external libs */
import _, {mapValues} from 'lodash';
import isArray from 'lodash-bound/isArray';
import isNumber from 'lodash-bound/isNumber';
import isNull from 'lodash-bound/isNull';
import isUndefined from 'lodash-bound/isUndefined';

import express                from 'express';
import promisify              from 'es6-promisify';
import cors                   from 'cors';
const swaggerMiddleware = promisify(require('swagger-express-middleware'));

/* local stuff */
import LyphNeo4j from './LyphNeo4j.es6.js';
import swagger   from './swagger.es6';
import {
	inspect,
	customError,
	isCustomError,
	cleanCustomError,
	sw,
	extractFieldValues,
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
let newUID = 0;

// TODO: to avoid race conditions, use a Neo4j REST transactions to get some ACID around these multiple queries

async function getModelResource(db, cls, reqFields, id){
	for (let [fieldName, fieldSpec] of Object.entries(cls.relationshipShortcuts)){
		let val = reqFields[fieldName];
		if (val::isUndefined() || val::isNull()) { continue }
		if (fieldSpec.cardinality.max === 1){ val = [val] }
		if (val.length > 0){
			let objects = await db.getSpecificResources(fieldSpec.codomain.resourceClass, val);
			reqFields[fieldName] = objects.map(o => {
				let props = {};
				for (let key of Object.keys(resources[o.class].properties)){ props[key] = o[key]; }
				return resources[o.class].new(props);
			});
			if (fieldSpec.cardinality.max === 1){ reqFields[fieldName] = reqFields[fieldName][0] }
		}
	}
	let resource = cls.new(reqFields);
	let resID = id::isNumber()? id: ++newUID;
	if (!resource.id::isNumber()){
		resource.set('id', resID, { ignoreReadonly: true });
	}
	return resource;
}

async function getModelRelationshipFields(db, cls, relA, idA, idB, reqFields){
	/*Extract relationship ends*/
	let [{objA}] = await db.getSpecificResources(relA.resourceClass, [idA]);
	let resA = relA.resourceClass.new(objA); //get
	let [{objB}] = await db.getSpecificResources(relA.codomain.resourceClass, [idB]);
	let resB = relA.codomain.resourceClass.new(objB); //get

	/*Reconstruct existing model library relationship entity to validate constraints*/
	//TODO: replace .new() with .get() and remove .id assignment from fields
	let fields = extractFieldValues(cls.new({...reqFields, 1: resA, 2: resB}));

	/*Extract fields and reassign proper IDs*/
	//TODO: remove after transition to .load() which will assign ids internally
	fields[1] = extractFieldValues(resA);
	fields[2] = extractFieldValues(resB);
	fields[1].id = idA;
	fields[2].id = idB;

	//resA.delete(); resB.delete();
	return fields;
}

const requestHandler = {
	batch: {
		async post({db}, req, res){
			let responses = [], ids = [];
			let {temporaryIDs, operations} = req.body;
			let modelObjects = [];
			let operationTempIDs = {};
			//Create model resource by given fields, retrieve resources for existing IDs in its properties
			for (let operation of operations) {
				let {method, path, body} = operation;
				let pathObj = swagger.paths[path];
				let cls = resources[pathObj['x-resource-type']];
				let objectTempIDs = {};
				//filter and store separately temporary IDs
				for (let [fieldName, fieldSpec] of Object.entries(cls.relationshipShortcuts)) {
					if (body[fieldName]::isUndefined() || body[fieldName]::isNull()) { continue; }
					if (fieldSpec.cardinality.max === 1) { body[fieldName] = [body[fieldName]] }
					objectTempIDs[fieldName] = body[fieldName].filter(x => temporaryIDs.includes(x));
					body[fieldName] = body[fieldName].filter(x => !temporaryIDs.includes(x));
				}
				let object = await getModelResource(db, cls, body, body.id);
				operationTempIDs[object.id]= objectTempIDs;
				modelObjects.push(object);
			}
			//Replace temporary IDs with newly created model resources
			for (let object of modelObjects) {
				let cls = resources[object.class];
				for (let [fieldName, fieldSpec] of Object.entries(cls.relationshipShortcuts)) {
					if (!operationTempIDs[object.id]::isUndefined() &&
						!operationTempIDs[object.id][fieldName]::isUndefined()) {
						object[fieldName] = [
							...object[fieldName],
							...operationTempIDs[object.id][fieldName]
								.map(tempID => modelObjects.find(o => (o.id === tempID)))];
					}
					if (object[fieldName] && (object[fieldName].length === 1) && (fieldSpec.cardinality.max === 1)) {
						object[fieldName] = object[fieldName][0];
					}
				}
			}
			//Constraints on longitudinal borders fail (-->HasLongitudinalBorder has only one element)?
			//Validate the constraints on resources in the batch by committing them all
			//await Promise.all(modelObjects.map(r => r.commit()));

			//Add missing resources to DB
			for (let i = 0; i < operations.length; i++){
				let object = modelObjects[i];
				let cls = resources[object.class];
				let id = await db.createResource(cls, extractFieldValues(object));
				let response = await db.getSpecificResources(cls, [id]);
				ids.push(id);
				responses.push(response);
			}
			res.status(OK).jsonp([{ids: ids, responses: responses}]);
		}
	},
	resources: /*get, post*/ {
		async get({db, cls}, req, res) {
			res.status(OK).jsonp( await db.getAllResources(cls));
		},
		async post({db, cls}, req, res) {
			let resource = await getModelResource(db, cls, req.body);
			await resource.commit(); //validation
			let id = await db.createResource(cls, extractFieldValues(resource));
			res.status(CREATED).jsonp(await db.getSpecificResources(cls, [id]));
		}
	},
	specificResources: /*get, post, put, delete*/ {
		async get({db, cls}, req, res) {
			await db.assertResourcesExist(cls, req.pathParams.ids);
			res.status(OK).jsonp(await db.getSpecificResources(cls, req.pathParams.ids));
		},
		async post({db, cls}, req, res) {
			await db.assertResourcesExist(cls, [req.pathParams.id]);
			let resource = await getModelResource(db, cls, req.body, req.pathParams.id);
			await db.updateResource(cls, req.pathParams.id, extractFieldValues(resource));
			res.status(OK).jsonp( await db.getSpecificResources(cls, [req.pathParams.id]));
		},
		async put({db, cls}, req, res) {
			await db.assertResourcesExist(cls, [req.pathParams.id]);
			let resource = await getModelResource(db, cls, req.body, req.pathParams.id);
			await db.replaceResource(cls, req.pathParams.id, extractFieldValues(resource));
			res.status(OK).jsonp(await db.getSpecificResources(cls, [req.pathParams.id]));
		},
		async delete({db, cls}, req, res) {
			await db.assertResourcesExist(cls, [req.pathParams.id]);
			await db.deleteResource(cls, req.pathParams.id);
			res.status(NO_CONTENT).jsonp();
		}
	},
	relatedResources: /*get*/ {
		async get({db, relA}, req, res) {
			await db.assertResourcesExist(relA.resourceClass, [req.pathParams.idA]);
			res.status(OK).jsonp( await db.getRelatedResources(relA, req.pathParams.idA) );
		}
	},
	specificRelatedResource: /*put, delete*/ {
		async put({db, cls, relA}, req, res) {
			let {idA, idB} = req.pathParams;
			await db.addRelationship(relA, idA, idB, await getModelRelationshipFields(db, cls, relA, idA, idB, req.body));
			res.status(OK).jsonp(await db.getRelationships(relA, idA, idB));
		},
		async delete({db, cls, relA}, req, res) {
			let {idA, idB} = req.pathParams;
			await Promise.all([
				db.assertResourcesExist(relA.resourceClass 		   , [idA]),
				db.assertResourcesExist(relA.codomain.resourceClass, [idB])
			]);
			await db.deleteRelationship(relA, idA, idB);
			res.status(NO_CONTENT).jsonp();
		}
	},
	relationships: /*get, delete*/  {
        async get({db, cls}, req, res) {
            res.status(OK).jsonp( await db.getAllRelationships(cls));
        },
        async delete({db, cls}, req, res) {
            await db.deleteAllRelationships(cls);
            res.status(NO_CONTENT).jsonp();
        }
    },
    specificRelationships: /*get, post, put, delete*/ {
		async get({db, cls}, req, res) {
			await db.assertRelationshipsExist(cls, req.pathParams.ids);
			res.status(OK).jsonp( await db.getSpecificRelationships(cls, req.pathParams.ids));
		},
		async post({db, cls}, req, res) {
			await db.assertRelationshipsExist(cls, [req.pathParams.id]);
			await db.updateRelationshipByID(cls, req.pathParams.id, req.body);
			res.status(OK).jsonp(await db.getSpecificRelationships(cls, [req.pathParams.id]));
		},
		async put({db, cls}, req, res) {
			await db.replaceRelationshipByID(cls, req.pathParams.id, req.body);
            res.status(OK).jsonp(await db.getSpecificRelationships(cls, [req.pathParams.id]));
		},
		async delete({db, cls}, req, res) {
			await db.assertRelationshipsExist(cls, [req.pathParams.id]);
			await db.deleteRelationshipByID(cls, req.pathParams.id);
			res.status(NO_CONTENT).jsonp();
		}
	},
    relatedRelationships: /* get, delete */{
		async get({db, relA}, req, res) {
			res.status(OK).jsonp( await db.getRelatedRelationships(relA, req.pathParams.idA));
		}
	},
	specificRelationshipByResources: /*get, post, put, delete*/ {
		async get({db, cls, relA}, req, res) {
			let {idA, idB} = req.pathParams;
			await Promise.all([
				db.assertResourcesExist(relA.resourceClass	   	   , [idA]),
				db.assertResourcesExist(relA.codomain.resourceClass, [idB])
			]);
			res.status(OK).jsonp(await db.getRelationships(relA, idA, idB));
		},
		async post({db, cls, relA}, req, res) {
			let {idA, idB} = req.pathParams;
			await db.updateRelationship(relA, idA, idB,  await getModelRelationshipFields(db, cls, relA, idA, idB, req.body));
			res.status(OK).jsonp(await db.getRelationships(relA, idA, idB));
		},
		async put({db, cls, relA}, req, res) {
			let {idA, idB} = req.pathParams;
			await db.replaceRelationship(relA, idA, idB, await getModelRelationshipFields(db, cls, relA, idA, idB, req.body));
			res.status(OK).jsonp(await db.getRelationships(relA, idA, idB));
		},
		async delete({db, cls, relA}, req, res) {
			let {idA, idB} = req.pathParams;
			await Promise.all([
				db.assertResourcesExist(relA.resourceClass	   	   , [idA]),
				db.assertResourcesExist(relA.codomain.resourceClass, [idB])
			]);
			await db.deleteRelationship(relA, idA, idB);
			res.status(NO_CONTENT).jsonp();
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
	if (err::isArray() && err[0].code::isString() && err[0].code.startsWith('Neo.')) {
		if (err::isArray() && err.length === 1) { err = err[0] }
		return next({
			status:  INTERNAL_SERVER_ERROR,
			message: "An error occurred in the database that we did not expect. Please let us know!",
			originalError: err
		});
	}

	/* any other errors */
	return next({
		status:  INTERNAL_SERVER_ERROR,
		message: "An error occurred on the server that we did not expect. Please let us know!",
		originalError: err
	});

}


/* error logging */
function errorLogger(err, req, res, next) {
	console.error(`[Server] [${Date()}]`, JSON.stringify(err, null, 4));
	return next(err);
}


/* error transmission */
function errorTransmitter(err, req, res, next) {
	res.status(err.status).jsonp(err);
	return next(err);
}


/* done with error */
function doneWithError(err, req, res, next) {}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// the server                                                                                                         //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export default async (distDir, config) => {

	/* the express application */
	let server = express();

	/* serve swagger-ui based documentation */
	server.use('/docs', express.static(`${distDir}/docs/`));

	/* enable CORS (Cross Origin Resource Sharing) */
	server.use(cors());

	/* load the middleware */
	let [middleware] = await swaggerMiddleware(`${distDir}/swagger.json`, server);

	server.use(decodePath);

	/* use Swagger middleware */
	//noinspection JSUnresolvedFunction (there is no .d.ts file for swagger-express-middleware)
	server.use(
		middleware.files({ apiPath: false, rawFilesPath: '/' }),
		middleware.metadata(),
		middleware.parseRequest(),
		middleware.validateRequest()
	);

	console.log("DB CONFIG", config);

	/* set up database */
	let db = new LyphNeo4j({
		user:           config.dbUser,
		pass:           config.dbPass,
		host:           config.dbHost,
		port:           config.dbPort,
		docker:         config.dbDocker,
		consoleLogging: config.dbConsoleLogging
	});

	/* create uniqueness constraints for all resource types (only if database is new) */
	await Promise.all(_(resources).keys().map(r => db.createUniqueIdConstraintOn(r)));

	/* normalize parameter names */
	server.use(parameterNormalizer);

	function decodePath (req, res, next) {
		req.url = decodeURI(req.url);
		return next();
	}

	/* request handling */
	for (let path of Object.keys(swagger.paths)) {
		let expressStylePath = path.replace(/{(\w+)}/g, ':$1');
		let pathObj = swagger.paths[path];

		for (let method of _(pathObj).keys().intersection(['get', 'post', 'put', 'delete'])) {
			let info = sw(pathObj['x-path-type'])(
				[['batch'], ()=>({})],
				[['resources', 'specificResources'], ()=>({
					cls: resources[pathObj['x-resource-type']]
				})],
				[['relatedResources', 'specificRelatedResource'], ()=> ({
					cls: relationships[pathObj['x-relationship-type']],
					relA: relationships[pathObj['x-relationship-type']].domainPairs[pathObj['x-i']][pathObj['x-A']]
				})],
				[['relationships', 'specificRelationships'], ()=>({
					cls: relationships[pathObj['x-relationship-type']]
				})],
				[['relatedRelationships', 'specificRelationshipByResources'], ()=>({
					cls: relationships[pathObj['x-relationship-type']],
					relA: relationships[pathObj['x-relationship-type']].domainPairs[pathObj['x-i']][pathObj['x-A']]
				})],
				[['algorithm'], ()=>({
					algorithmName: pathObj['x-algorithm-name']
				})]
			);
			Object.assign(info, { db });
			server[method](expressStylePath, (req, res, next) => {
				try {
					req.url = encodeURI(req.url);
					requestHandler[pathObj['x-path-type']][method](info, req, res).catch(next) }
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
	return config.exposeDB ? { database: db, server } : server;

};
