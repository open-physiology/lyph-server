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
} from './utility.es6.js';
import {
	OK,
	CREATED,
	NO_CONTENT,
	NOT_FOUND,
	INTERNAL_SERVER_ERROR
} from './http-status-codes.es6.js';
import { createModelWithFrontend } from './commandHandlers.es6';

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// request handlers                                                                                                   //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
let model;

// TODO: direct calls to DB are needed to establish correct class of the entity by its id

async function createModelResource(db, cls, fields, options = {}){
	for (let [fieldName, fieldSpec] of Object.entries(cls.relationshipShortcuts)){
		let val = fields[fieldName];
		if (val::isUndefined() || val::isNull()) { continue }
		if (fieldSpec.cardinality.max === 1){ val = [val] }
		if (val.length > 0){
			let fieldCls = fieldSpec.codomain.resourceClass;
			await db.assertResourcesExist(fieldCls, val);
			let hrefs = [...await db.getSpecificResources(fieldCls, val)].map(r => r.href);
			fields[fieldName] = [...await fieldCls.get(hrefs)];
			if (fieldSpec.cardinality.max === 1){ fields[fieldName] = fields[fieldName][0] }
		}
	}
	return cls.new(fields, options);
}

const getInfo = (pathObj) => sw(pathObj['x-path-type'])(
		[['batch'], ()=>({})],
		[['resources', 'specificResources'], ()=>({
			cls: model[pathObj['x-resource-type']]
		})],
		[['relatedResources', 'specificRelatedResource'], ()=> ({
			cls: model[pathObj['x-relationship-type']],
			relA: model[pathObj['x-relationship-type']].domainPairs[pathObj['x-i']][pathObj['x-A']]
		})],
		[['relationships', 'specificRelationships'], ()=>({
			cls: model[pathObj['x-relationship-type']]
		})],
		[['relatedRelationships', 'specificRelationshipByResources'], ()=>({
			cls: model[pathObj['x-relationship-type']],
			relA: model[pathObj['x-relationship-type']].domainPairs[pathObj['x-i']][pathObj['x-A']]
		})]
);

const requestHandler = {
	batch: {
		async post({db}, req, res){
			let batchStatusCode = OK;
			let responses = []; let ids = [];
			let {temporaryIDs, operations} = req.body;
			for (let operation of operations) {
				let {method, path, body} = operation;
				let pathObj = swagger.paths[path];
				let info = getInfo(pathObj);
				let response = {};

				let tmpID = body.id;
				if (temporaryIDs.includes(body.id)) {
					delete body.id;
					if (!body.class) { body.class = info.cls.name; }
					db.assignHref(body);
					ids.push(body.id);
				}
				try {
					response = await requestHandler[pathObj['x-path-type']][method.toLowerCase()]({...info, ...{db}}, {body: body});
				} catch (err) {
					response = {statusCode: err.status, response: err};
					if (batchStatusCode === OK) { batchStatusCode = err.status; }
				}
				response.operation = operation;
				responses.push(response);

				if ((method === "POST") && (response.statusCode === CREATED)) {
					//assign permanent ID and replace temporary IDs in the subsequent operations
					if (temporaryIDs.includes(tmpID)) {
						for (let o of operations.filter(o => !!o.body)) {
							let {cls} = getInfo(swagger.paths[o.path]);
							if (cls.isResource) {
								for (let key of Object.keys(cls.relationshipShortcuts).filter(key => !!o.body[key])) {
									if (o.body[key] === tmpID) {
										o.body[key] = response.entity.id;
									} else {
										let index = [...o.body[key]].indexOf(tmpID);
										if (index > -1) {
											o.body[key][index] = response.entity.id;
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
			res.status(batchStatusCode).jsonp({ids: ids, responses: responses});
		}
	},

	resources: /*get, post*/ {
		async get({db, cls, doCommit}, req, res) {
			let response = [...await cls.getAll()].map(r => r.toJSON());
			if (doCommit) {
				res.status(OK).jsonp(response);
			} else {
				return {statusCode: OK, response: response}
			}
		},
		async post({db, cls, doCommit}, req, res) {
			let entity = await createModelResource(db, cls, req.body, {acceptHref: !doCommit});
			if (doCommit) {
				await entity.commit();
				res.status(CREATED).jsonp([entity.toJSON()]);
			} else {
				return {statusCode: CREATED, entity: entity}
			}
		}
	},
	relationships: /*get */  {
		async get({db, cls, doCommit}, req, res) {
			let response = [...await cls.getAll()].map(r => r.toJSON());
			if (doCommit) {
				res.status(OK).jsonp(response);
			} else {
				return {statusCode: OK, response: response}
			}
		}
	},

	specificResources: /*get, post, put, delete*/ {
		async get({db, cls, doCommit}, req, res) {
			//TODO req.pathParams.ids => req.pathParams.hrefs
			await db.assertResourcesExist(cls, [req.pathParams.ids]);
			let hrefs = [...await db.getSpecificResources(cls, req.pathParams.ids)].map(r => r.href);

			let response = [...await cls.get(hrefs)].map(r => r.toJSON());
			//console.log("Response", response);
			if (doCommit){
				res.status(OK).jsonp(response);
			} else {
				return {statusCode: OK, response: response}
			}
		},
		async post({db, cls, doCommit}, req, res) {
			//TODO req.pathParams.id => req.pathParams.href
			await db.assertResourcesExist(cls, [req.pathParams.id]);
			let [{href}] = await db.getSpecificResources(cls, [req.pathParams.id]);

			let entity = await cls.get(href);
			for (let fieldName of Object.keys(req.body)) {
				entity[fieldName] = req.body[fieldName];
			}
			if (doCommit) {
				await entity.commit();
				res.status(OK).jsonp([entity.toJSON()]);
			} else {
				return {statusCode: OK, entity: entity}
			}
		},
		async put({db, cls, doCommit}, req, res) {
			//TODO req.pathParams.id => req.pathParams.href
			await db.assertResourcesExist(cls, [req.pathParams.id]);
			let [{href}] = await db.getSpecificResources(cls, [req.pathParams.id]);

			let entity = await cls.get(href);
			for (let fieldName of Object.keys(entity.fields)) {
				let fieldSpec = entity.constructor.properties[fieldName];
				if (!(fieldSpec && fieldSpec.readonly)) { delete entity[fieldName]; }
			}
			for (let fieldName of Object.keys(req.body)) {
				let fieldSpec = entity.constructor.properties[fieldName];
				if (!(fieldSpec && fieldSpec.readonly)) { entity[fieldName] = req.body[fieldName]; }
			}
			if (doCommit) {
				await entity.commit();
				res.status(OK).jsonp([entity.toJSON()]);
			} else {
				return {statusCode: OK, entity: entity}
			}
		},
		async delete({db, cls, doCommit}, req, res) {
			//TODO req.pathParams.id => req.pathParams.href
			await db.assertResourcesExist(cls, [req.pathParams.id]);
			let [{href}] = await db.getSpecificResources(cls, [req.pathParams.id], {withoutRelationships: true});
			let entity = await cls.get(href);
			entity.delete();
			if (doCommit){
				await entity.commit();
				res.status(NO_CONTENT).jsonp();
			} else {
				return {statusCode: NO_CONTENT, entity: entity}
			}
		}
	},
	specificRelationships: /*get, post, put, delete*/ {
		async get({db, cls, doCommit}, req, res) {
			//TODO req.pathParams.ids => req.pathParams.hrefs
			await db.assertRelationshipsExist(cls, req.pathParams.ids);
			let hrefs = [...await db.getSpecificRelationships(cls, req.pathParams.ids)].map(r => r.href);
			let response = [...await cls.get(hrefs)].map(r => r.toJSON());
			if (doCommit){
				res.status(OK).jsonp(response);
			} else {
				return {statusCode: OK, response: response}
			}
		},
		async post({db, cls, doCommit}, req, res) {
			//TODO req.pathParams.id => req.pathParams.href
			await db.assertRelationshipsExist(cls, [req.pathParams.id]);
			let [{href}] = await db.getSpecificRelationships(cls, [req.pathParams.id]);
			let entity = await cls.get(href);
			for (let fieldName of Object.keys(req.body)){ entity[fieldName] = req.body[fieldName]; }
			if (doCommit) {
				await entity.commit();
				res.status(OK).jsonp([entity.toJSON()]);
			} else {
				return {statusCode: OK, entity: entity}
			}
		},
		async put({db, cls, doCommit}, req, res) {
			//TODO req.pathParams.id => req.pathParams.href
			await db.assertRelationshipsExist(cls, [req.pathParams.id]);
			let [{href}] = await db.getSpecificRelationships(cls, [req.pathParams.id]);
			let entity = await cls.get(href);
			for (let fieldName of Object.keys(entity.fields)) {
				let fieldSpec = entity.constructor.properties[fieldName];
				if (!(fieldSpec && fieldSpec.readonly)) { delete entity[fieldName]; }
			}
			for (let fieldName of Object.keys(req.body)) {
				let fieldSpec = entity.constructor.properties[fieldName];
				if (!(fieldSpec && fieldSpec.readonly)) { entity[fieldName] = req.body[fieldName]; }
			}
			if (doCommit) {
				await entity.commit();
				res.status(OK).jsonp([entity.toJSON()]);
			} else {
				return {statusCode: OK, entity: entity}
			}
		},
		async delete({db, cls, doCommit}, req, res) {
			await db.assertRelationshipsExist(cls, [req.pathParams.id]);
			let [{href}] = await db.getSpecificRelationships(cls, [req.pathParams.id]);
			let entity = await cls.get(href);
			entity.delete();
			if (doCommit){
				await entity.commit();
				res.status(NO_CONTENT).jsonp();
			} else {
				return {statusCode: NO_CONTENT, entity: entity};
			}
		}
	},

	relatedResources: /*get*/ {
		async get({db, cls, relA, doCommit}, req, res) {
			//TODO req.pathParams.idA => req.pathParams.hrefA
			await db.assertResourcesExist(relA.resourceClass, [req.pathParams.idA]);
			let [{href}] = await db.getSpecificResources(relA.resourceClass, [req.pathParams.idA], {withoutRelationships: true});
			let resource = await relA.resourceClass.get(href);
			let related = [...resource[relA.keyInResource]].map(rel => rel[2]);
			let response = related.map(r => r.toJSON());
			if (doCommit){
				res.status(OK).jsonp(response);
			} else {
				return {statusCode: OK, response: response}
			}
		}
	},
	relatedRelationships: /* get */{
		async get({db, cls, relA, doCommit}, req, res) {
			//TODO idA => hrefA
			let {idA} = req.pathParams;
			await db.assertResourcesExist(relA.resourceClass, [idA]);
			let [{href}] = await db.getSpecificResources(relA.resourceClass, [idA], {withoutRelationships: true});
			let resource = await relA.resourceClass.get(href);
			let response = [...resource[relA.keyInResource]].map(r => r.toJSON());
			if (doCommit){
				res.status(OK).jsonp(response);
			} else {
				return {statusCode: OK, response: response}
			}
		}
	},

	specificRelatedResource: /*put, delete*/ {
		async put({db, cls, relA, doCommit}, req, res) {
			let {idA, idB} = req.pathParams;
			//TODO idA => hrefA, idB => hrefB
			await db.assertResourcesExist(relA.resourceClass, [idA]);
			await db.assertResourcesExist(relA.codomain.resourceClass, [idB]);
			let [resA] = await db.getSpecificResources(relA.resourceClass, [idA], {withoutRelationships: true});
			let [resB] = await db.getSpecificResources(relA.codomain.resourceClass, [idB], {withoutRelationships: true});
			let entity = cls.new({...req.body, 1: resA.href, 2: resB.href});
			if (doCommit) {
				await entity.commit();
				res.status(OK).jsonp([entity.toJSON()]);
			} else {
				return {statusCode: OK, entity: entity}
			}
		},
		async delete({db, cls, relA, doCommit}, req, res) {
			let {idA, idB} = req.pathParams;
			//TODO idA => hrefA, idB => hrefB
			await db.assertResourcesExist(relA.resourceClass, [idA]);
			await db.assertResourcesExist(relA.codomain.resourceClass, [idB]);
			let [{href}]  = await db.getRelationships(cls, relA.resourceClass, relA.codomain.resourceClass, idA, idB);
			if (!href){ res.status(NOT_FOUND).jsonp(); }
			let entity = await cls.get(href);
			entity.delete();
			if (doCommit){
				await entity.commit();
				res.status(NO_CONTENT).jsonp();
			} else {
				return {statusCode: NO_CONTENT, entity: entity};
			}
		}
	},
	specificRelationshipByResources: /*get, post, put, delete*/ {
		async get({db, cls, relA, doCommit}, req, res) {
			//TODO idA, idB => hrefA, hrefB
			let {idA, idB} = req.pathParams;
			await db.assertResourcesExist(relA.resourceClass, [idA]);
			await db.assertResourcesExist(relA.codomain.resourceClass, [idB]);
			let [resA] = await db.getSpecificResources(relA.resourceClass, [idA], {withoutRelationships: true});
			let [resB] = await db.getSpecificResources(relA.codomain.resourceClass, [idB], {withoutRelationships: true});
			let resource = await relA.resourceClass.get(resA.href);
			let related = [...resource[relA.keyInResource]].find(rel => (rel[2].href === resB.href));
			if (!related) { res.status(NOT_FOUND).jsonp(); }
			let response = [...related].map(r => r.toJSON());
			if (doCommit) {
				res.status(OK).jsonp(response);
			} else {
				return {statusCode: OK, response: response}
			}
		},

		async post({db, cls, relA, doCommit}, req, res) {
			//TODO idA, idB => hrefA, hrefB
			let {idA, idB} = req.pathParams;
			await db.assertResourcesExist(relA.resourceClass, [idA]);
			await db.assertResourcesExist(relA.codomain.resourceClass, [idB]);
			let [resA] = await db.getSpecificResources(relA.resourceClass, [idA], {withoutRelationships: true});
			let [resB] = await db.getSpecificResources(relA.codomain.resourceClass, [idB], {withoutRelationships: true});
			let resource = await relA.resourceClass.get(resA.href);
			let entity = [...resource[relA.keyInResource]].find(rel => (rel[2].href === resB.href));
			if (!entity){ res.status(NOT_FOUND).jsonp(); }
			for (let fieldName of Object.keys(req.body)){ entity[fieldName] = req.body[fieldName]; }
			if (doCommit) {
				await entity.commit();
				res.status(OK).jsonp([entity.toJSON()]);
			} else {
				return {statusCode: OK, entity: entity}
			}
		},
		async put({db, cls, relA, doCommit}, req, res) {
			//TODO idA, idB => hrefA, hrefB
			let {idA, idB} = req.pathParams;
			await db.assertResourcesExist(relA.resourceClass, [idA]);
			await db.assertResourcesExist(relA.codomain.resourceClass, [idB]);
			let [resA] = await db.getSpecificResources(relA.resourceClass, [idA], {withoutRelationships: true});
			let [resB] = await db.getSpecificResources(relA.codomain.resourceClass, [idB], {withoutRelationships: true});
			let resource = await relA.resourceClass.get(resA.href);
			let entity = [...resource[relA.keyInResource]].find(rel => (rel[2].href === resB.href));
			if (!entity) { res.status(NOT_FOUND).jsonp(); }
			for (let fieldName of Object.keys(entity.fields)) {
				let fieldSpec = entity.constructor.properties[fieldName];
				if (!(fieldSpec && fieldSpec.readonly)) { delete entity[fieldName]; }
			}
			for (let fieldName of Object.keys(req.body)) {
				let fieldSpec = entity.constructor.properties[fieldName];
				if (!(fieldSpec && fieldSpec.readonly)) { entity[fieldName] = req.body[fieldName]; }
			}
			if (doCommit) {
				await entity.commit();
				res.status(OK).jsonp([entity.toJSON()]);
			} else {
				return {statusCode: OK, entity: entity}
			}
		},
		async delete({db, cls, relA, doCommit}, req, res) {
			let {idA, idB} = req.pathParams;
			await db.assertResourcesExist(relA.resourceClass, [idA]);
			await db.assertResourcesExist(relA.codomain.resourceClass, [idB]);
			let [resA] = await db.getSpecificResources(relA.resourceClass, [idA], {withoutRelationships: true});
			let [resB] = await db.getSpecificResources(relA.codomain.resourceClass, [idB], {withoutRelationships: true});
			let resource = await relA.resourceClass.get(resA.href);
			let entity = [...resource[relA.keyInResource]].find(rel => (rel[2].href === resB.href));
			if (!entity){ res.status(NOT_FOUND).jsonp(); }
			entity.delete();
			if (doCommit){
				await entity.commit();
				res.status(NO_CONTENT).jsonp();
			} else {
				return {statusCode: NO_CONTENT, entity: entity};
			}
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
			server[method](expressStylePath, (req, res, next) => {
				try {
					req.url = encodeURI(req.url);
					requestHandler[pathObj['x-path-type']][method]({...info, doCommit: true, ...{db}}, req, res).catch(next) }
				catch (err) {
					next(err)
				}
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
