////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
'use strict';

/* external libs */
import _ from 'lodash';
import isArray from 'lodash-bound/isArray';
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
	isCustomError,
	cleanCustomError,
	sw
} from './utils/utility.es6.js';
import {
	OK,
	CREATED,
	NO_CONTENT,
	NOT_FOUND,
	INTERNAL_SERVER_ERROR
} from './http-status-codes.es6.js';
import { createModelWithFrontend } from './model.es6.js';
//import {sw} from 'utilities'; //TODO: replace sw from utility.es6.js after it is fixed


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// request handlers                                                                                                   //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
let model;

/*Helpers*/
async function createModelResource(db, cls, fields, options = {}){
	for (let [fieldName, fieldSpec] of Object.entries(cls.relationshipShortcuts)){
		let ids = fields[fieldName];
		if (ids::isUndefined() || ids::isNull()) { continue }
		let fieldCls = fieldSpec.codomain.resourceClass;
		if (fieldSpec.cardinality.max === 1){
			fields[fieldName] = await fieldCls.get(ids);
		} else {
			fields[fieldName] = [...await fieldCls.get(ids)];
		}
	}
	return cls.new(fields, options);
}

async function getRelatedResources(db, cls, id, relName){
	let resource = await cls.get(id);
	return [...resource[relName]];
}

const getInfo = (
	pathObj) => sw(pathObj['x-path-type'])(
		[['clear'], ()=>({})],
		[['batch'], ()=>({})],
		[['resources', 'specificResources'], ()=>({
			cls: model[pathObj['x-resource-type']]
		})],
		[['relatedResources', 'specificRelatedResource'], ()=> ({
			cls: model[pathObj['x-resource-type']],
			relA: model[pathObj['x-resource-type']].relationships[pathObj['x-relationship-type']]
		})]
);

const requestHandler = {
	clear: {
		async post({db}, req, res){
			db.clear('Yes! Delete all everythings!');
			return {statusCode: NO_CONTENT};
		}
	},

	batch: {
		async post({db}, req, res){
			let batchStatusCode = OK;
			let responses = [];
			let ids = [];
			let {temporaryIDs, operations} = req.body;
			for (let operation of operations) {
				let {method, path, body} = operation;
				let pathObj = swagger.paths[path];
				let info = getInfo(pathObj);
				if (!body.class) { body.class = info.cls.name; }

				let tmpID = body.id;
				if (temporaryIDs.includes(body.id)) {
					db.assignId(body);
					ids.push(body.id);
				}
				let result = {};
				try {
					result = await requestHandler[pathObj['x-path-type']][method.toLowerCase()]({...info, ...{db}}, {body});
				} catch (err) {
					result = {statusCode: err.status, response: err};
					if (batchStatusCode === OK) {
						batchStatusCode = err.status;
					}
				}
				responses.push(result);

				if ((method === "POST") && (result.statusCode === CREATED)) {
					//assign permanent ID and replace temporary IDs in the subsequent operations
					if (temporaryIDs.includes(tmpID)) {
						for (let o of operations.filter(o => !!o.body)) {
							let {cls} = getInfo(swagger.paths[o.path]);
							if (cls.isResource) {
								for (let key of Object.keys(cls.relationshipShortcuts).filter(key => !!o.body[key])) {
									if (o.body[key] === tmpID) {
										o.body[key] = result.entity.id;
									} else {
										let index = [...o.body[key]].indexOf(tmpID);
										if (index > -1) {
											o.body[key][index] = result.entity.id;
										}
									}
								}
							}
						}
					}
				}

				for (let response of responses) {
					if (response.entity) {
						await response.entity.commit();
						if (response.statusCode === OK || response.statusCode === CREATED) {
							response.response = [response.entity.toJSON()];
						}
						delete response.entity;
					}
				}
			}
			return {statusCode: batchStatusCode, response: {ids: ids, responses: responses}}
		}
	},

	resources: /*get, post*/ {
		async get({db, cls}, req, res) {
			let response = [...await cls.getAll()].map(r => r.toJSON());
			return {statusCode: OK, response: response};
		},
		async post({db, cls, doCommit}, req, res) {
			let entity = await createModelResource(db, cls, req.body, {acceptId: !doCommit});
			return {statusCode: CREATED, entity: entity};
		}
	},

	specificResources: /*get, post, put, delete*/ {
		async get({db, cls }, req, res) {
			let response = [...await cls.get(req.pathParams.ids)].map(r => r.toJSON());
			return {statusCode: OK, response: response};
		},
		async post({db, cls }, req, res) {
			let entity = await cls.get(req.pathParams.id);
			for (let fieldName of Object.keys(req.body)) { entity[fieldName] = req.body[fieldName]; }
			return {statusCode: OK, entity: entity};
		},
		async put({db, cls}, req, res) {
			let entity = await cls.get(req.pathParams.id);
			for (let fieldName of Object.keys(entity.fields)) {
				let fieldSpec = entity.constructor.properties[fieldName];
				if (!(fieldSpec && fieldSpec.readonly)) { delete entity[fieldName]; }
			}
			for (let fieldName of Object.keys(req.body)) {
				let fieldSpec = entity.constructor.properties[fieldName];
				if (!(fieldSpec && fieldSpec.readonly)) { entity[fieldName] = req.body[fieldName]; }
			}
			return {statusCode: OK, entity: entity};
		},
		async delete({db, cls, doCommit}, req, res) {
			let entity = await cls.get(req.pathParams.id);
			entity.delete();
			return {statusCode: NO_CONTENT, entity: entity};
		}
	},

	relatedResources: /*get*/ {
		async get({db, cls, relA}, req, res) {
			let rels = await getRelatedResources(db, relA.resourceClass, req.pathParams.idA, relA.keyInResource);
			let related = await Promise.all(rels.map(x => model[x.class].get(x.id)));
			let response = related.map(r => r.toJSON());
			return {statusCode: OK, response: response};
		}
	},

	specificRelatedResource: /*put, delete*/ {
		async put({db, cls, relA}, req, res) {
			let {idA, idB} = req.pathParams;
			let resA = await relA.resourceClass.get(idA);
			let resB = await relA.codomain.resourceClass.get(idB);

            //TODO How to create a new relationship?
            //resA[relA.keyInResource].add(resB);
			let entity = relA.new({
				1: {class: resA.class, id: resA.id},
				2: {class: resB.class, id: resB.id}
			});
			return {statusCode: NO_CONTENT, entity: entity}; //TODO
		},
		async delete({db, cls, relA}, req, res) {
			let {idA, idB} = req.pathParams;
			let rels = await getRelatedResources(db, relA.resourceClass, req.pathParams.idA, relA.keyInResource);
			let entity = rels.find(rel => (rel.id === idB));
			if (!entity){ return {statusCode: NOT_FOUND}; }
			entity.delete();
			return {statusCode: NO_CONTENT, entity: entity};
		}
	},
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
		consoleLogging: config.dbConsoleLogging,
		baseURL: 		`http://${config.host}:${config.port}`
	});

	/* normalize parameter names */
	server.use(parameterNormalizer);

	function decodePath (req, res, next) {
		req.url = decodeURI(req.url);
		return next();
	}

	//Assign model library methods
	model = createModelWithFrontend(db);

	/* create uniqueness constraints for all resource types (only if database is new) */
	await Promise.all(Object.keys(model).filter(key => model[key].isResource).map(r => db.createUniqueIdConstraintOn(r)));

	/* request handling */
	for (let path of Object.keys(swagger.paths)) {
		let expressStylePath = path.replace(/{(\w+)}/g, ':$1');
		let pathObj = swagger.paths[path];

		for (let method of _(pathObj).keys().intersection(['get', 'post', 'put', 'delete'])) {
			let info = getInfo(pathObj);
			server[method](expressStylePath, async (req, res, next) => {
				let result = {};
				try {
					req.url = encodeURI(req.url);
					result = await requestHandler[pathObj['x-path-type']][method]({...info, doCommit: true, ...{db}}, req, res);
					if (result.entity){
						await result.entity.commit();
						if (result.status !== NO_CONTENT){
							result.response = [result.entity.toJSON()];
						}
					}
				}
				catch (err) {
					result = {statusCode: err.status, response: err};
				}
				res.status(result.statusCode).jsonp(result.response);
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
