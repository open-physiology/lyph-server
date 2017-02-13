////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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
	inspect,
	customError,
	isCustomError,
	cleanCustomError,
	sw,
    id2Href,
	href2Id,
	humanMsg
} from './utility.es6.js';
import {
	OK,
	CREATED,
	NO_CONTENT,
	NOT_FOUND,
	INTERNAL_SERVER_ERROR
} from './http-status-codes.es6.js';
import modelFactory from "../node_modules/open-physiology-model/src/index.js";


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// request handlers                                                                                                   //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
let model;
const resources = {};
const relationships = {};

// TODO: to avoid race conditions, use a Neo4j REST transactions to get some ACID around these multiple queries

async function createModelResource(db, cls, fields, options = {}){
	for (let [fieldName, fieldSpec] of Object.entries(cls.relationshipShortcuts)){
		let val = fields[fieldName];
		if (val::isUndefined() || val::isNull()) { continue }
		if (fieldSpec.cardinality.max === 1){ val = [val] }
		if (val.length > 0){
			let fieldCls = fieldSpec.codomain.resourceClass;
			let hrefs = val.map(v => id2Href(db.config.host, fieldCls, v));
			fields[fieldName] = [...await fieldCls.get(hrefs)];
			if (fieldSpec.cardinality.max === 1){ fields[fieldName] = fields[fieldName][0] }
		}
	}
	return cls.new(fields, options);
}

async function createModelRelationship(db, cls, relA, idA, idB, requestedFields){
	/*Extract relationship ends*/
	let hrefA = id2Href(db.config.host, relA.resourceClass, idA);
	let resA = await relA.resourceClass.get(hrefA);
	let hrefB = id2Href(db.config.host, relA.codomain.resourceClass, idB);
	let resB = await relA.codomain.resourceClass.get(hrefB);
	/*Create new relationship*/
	return cls.new({...requestedFields, 1: resA, 2: resB});
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
				if (temporaryIDs.includes(body.id)){
					delete body.id;
					db.assignHref(info.cls, body);
					ids.push(body.id);
				}
				try{
					response = await requestHandler[pathObj['x-path-type']][method.toLowerCase()]({...info, ...{db}}, {body: body});
				} catch(err){
					response = {statusCode: err.status, response: err};
					if (batchStatusCode === OK) {
						batchStatusCode = err.status;
					}
				}
				response.operation = operation;

				responses.push(response);
				if ((method === "POST") && (response.statusCode === CREATED)) {
					//assign permanent ID and replace temporary IDs in the subsequent operations
					if (temporaryIDs.includes(tmpID)) {
						for (let o of operations) {
							for (let key of Object.keys(o.body)) {
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
			for (let response of responses){
				if (response.entity){
					await response.entity.commit();
					if (response.statusCode === OK || response.statusCode === CREATED){
						response.response = [response.entity.toJSON()];
					}
					delete response.entity;
				}
			}
			res.status(batchStatusCode).jsonp({ids: ids, responses: responses});
		}
	},
	resources: /*get, post*/ {
		async get({db, cls, doCommit}, req, res) {
			let response = [...await cls.getAll()].map(resource => resource.toJSON());
			if (doCommit){
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
	specificResources: /*get, post, put, delete*/ {
		async get({db, cls, doCommit}, req, res) {
			let hrefs = req.pathParams.ids.map(id => id2Href(db.config.host, cls, id));
			let response = [...await cls.get(hrefs)].map(resource => resource.toJSON());
			if (doCommit){
				res.status(OK).jsonp(response);
			} else {
				return {statusCode: OK, response: response}
			}
		},
		async post({db, cls, doCommit}, req, res) {
			let href = id2Href(db.config.host, cls, req.pathParams.id);
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
			let href = id2Href(db.config.host, cls, req.pathParams.id);
			let entity = await cls.get(href);
			for (let fieldName of Object.keys(entity.fields)){
				if (!["id", "href", "class"].includes(fieldName)){ delete entity[fieldName]; }
			}
			for (let fieldName of Object.keys(req.body)){ entity[fieldName] = req.body[fieldName]; }
			if (doCommit) {
				await entity.commit();
				res.status(OK).jsonp([entity.toJSON()]);
			} else {
				return {statusCode: OK, entity: entity}
			}
		},
		async delete({db, cls, doCommit}, req, res) {
			let href = id2Href(db.config.host, cls, req.pathParams.id);
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
	relatedResources: /*get*/ {
		async get({db, cls, relA, doCommit}, req, res) {
			let href = id2Href(db.config.host, relA.resourceClass, req.pathParams.idA);
			let resource = await relA.resourceClass.get(href);
			let related = [...resource[relA.keyInResource]].map(rel => rel[2]);
			let response = related.map(resource => resource.toJSON());
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
			let entity = await createModelRelationship(db, cls, relA, idA, idB, req.body);
			if (doCommit) {
				await entity.commit();
				res.status(OK).jsonp([entity.toJSON()]);
			} else {
				return {statusCode: OK, entity: entity}
			}
		},
		async delete({db, cls, relA, doCommit}, req, res) {
			let {idA, idB} = req.pathParams;
			let hrefA = id2Href(db.config.host, relA.resourceClass, idA);
			let hrefB = id2Href(db.config.host, relA.codomain.resourceClass, idB);
			let resA = await relA.resourceClass.get(hrefA);
			let entity = [...resA[relA.keyInResource]].find(rel => (rel[2].href === hrefB));
			if (!entity){ res.status(NOT_FOUND).jsonp(); }
			entity.delete();
			if (doCommit){
				await entity.commit();
				res.status(NO_CONTENT).jsonp();
			} else {
				return {statusCode: NO_CONTENT, entity: entity};
			}
		}
	},
	relationships: /*get */  {
        async get({db, cls, doCommit}, req, res) {
        	try {
				let response = [...await cls.getAll()].map(rel => rel.toJSON());
				if (doCommit) {
					res.status(OK).jsonp(response);
				} else {
					return {statusCode: OK, response: response}
				}
			} catch(e){
				console.log(e);
			}
        }
    },
    specificRelationships: /*get, post, put, delete*/ {
		async get({db, cls, doCommit}, req, res) {
			let ids = req.pathParams.ids;
			let hrefs = ids.map(id => id2Href(db.config.host, cls, id));
			let response = [...await cls.get(hrefs)].map(resource => resource.toJSON());
			if (doCommit){
				res.status(OK).jsonp(response);
			} else {
				return {statusCode: OK, response: response}
			}
		},
		async post({db, cls, doCommit}, req, res) {
			let href = id2Href(db.config.host, cls, req.pathParams.id);
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
			let href = id2Href(db.config.host, cls, req.pathParams.id);
			let entity = await cls.get(href);
			for (let fieldName of Object.keys(entity.fields)){
				if (!["id", "href", "class"].includes(fieldName)){ delete entity[fieldName]; }
			}
			for (let fieldName of Object.keys(req.body)){ entity[fieldName] = req.body[fieldName]; }
			if (doCommit) {
				await entity.commit();
				res.status(OK).jsonp([entity.toJSON()]);
			} else {
				return {statusCode: OK, entity: entity}
			}
		},
		async delete({db, cls, doCommit}, req, res) {
			let href = id2Href(db.config.host, cls, req.pathParams.id);
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
    relatedRelationships: /* get */{
		async get({db, cls, relA, doCommit}, req, res) {
			let href = id2Href(db.config.host, relA.resourceClass, req.pathParams.idA);
			let resource = await relA.resourceClass.get(href);
			let related = [...resource[relA.keyInResource]];
			let response = related.map(rel => rel.toJSON());
			if (doCommit){
				res.status(OK).jsonp(response);
			} else {
				return {statusCode: OK, response: response}
			}
		}
	},
	specificRelationshipByResources: /*get, post, put, delete*/ {
		async get({db, cls, relA, doCommit}, req, res) {
			let {idA, idB} = req.pathParams;
			let hrefA = id2Href(db.config.host, relA.resourceClass, idA);
			let hrefB = id2Href(db.config.host, relA.codomain.resourceClass, idB);
			let resA = await relA.resourceClass.get(hrefA);
			let related = [...resA[relA.keyInResource]].filter(rel => (rel[2].href === hrefB));
			let response = related.map(rel => rel.toJSON());
			if (doCommit){
				res.status(OK).jsonp(response);
			} else {
				return {statusCode: OK, response: response}
			}
		},
		async post({db, cls, relA, doCommit}, req, res) {
			let {idA, idB} = req.pathParams;
			let hrefA = id2Href(db.config.host, relA.resourceClass, idA);
			let hrefB = id2Href(db.config.host, relA.codomain.resourceClass, idB);
			let resA = await relA.resourceClass.get(hrefA);
			let entity = [...resA[relA.keyInResource]].find(rel => (rel[2].href === hrefB));
			if (!entity){ res.status(NOT_FOUND).jsonp(); }
			for (let fieldName of Object.keys(req.body)){ entity[fieldName] = req.body[fieldName]; }
			if (doCommit) {
				await entity.commit();
				res.status(OK).jsonp([entity.toJSON()]);
			} else {
				return {statusCode: OK, entity: entity}
			}
		},
		//TODO: test fails, fix
		async put({db, cls, relA, doCommit}, req, res) {
			let {idA, idB} = req.pathParams;
			let hrefA = id2Href(db.config.host, relA.resourceClass, idA);
			let hrefB = id2Href(db.config.host, relA.codomain.resourceClass, idB);
			let resA = await relA.resourceClass.get(hrefA);
			let entity = [...resA[relA.keyInResource]].find(rel => (rel[2].href === hrefB));
			if (!entity){ res.status(NOT_FOUND).jsonp(); }
			for (let fieldName of Object.keys(entity.fields)){
				if (!["id", "href", "class"].includes(fieldName)){ delete entity[fieldName]; }
			}
			for (let fieldName of Object.keys(req.body)){ entity[fieldName] = req.body[fieldName]; }
			if (doCommit) {
				await entity.commit();
				res.status(OK).jsonp([entity.toJSON()]);
			} else {
				return {statusCode: OK, entity: entity}
			}
		},
		async delete({db, cls, relA, doCommit}, req, res) {
			let {idA, idB} = req.pathParams;
			let hrefA = id2Href(db.config.host, relA.resourceClass, idA);
			let hrefB = id2Href(db.config.host, relA.codomain.resourceClass, idB);
			let resA = await relA.resourceClass.get(hrefA);
			let entity = [...resA[relA.keyInResource]].find(rel => (rel[2].href === hrefB));
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
		consoleLogging: config.dbConsoleLogging
	});

	/* create uniqueness constraints for all resource types (only if database is new) */
	await Promise.all(Object.keys(resources).map(r => db.createUniqueIdConstraintOn(r)));

	/* normalize parameter names */
	server.use(parameterNormalizer);

	function decodePath (req, res, next) {
		req.url = decodeURI(req.url);
		return next();
	}

	//Implement model library methods
	const frontend = {
		/* Commit a newly created entity to DB */
		async commit_new({commandType, values}) {
			let cls = model[values.class];
			let res;
			if (cls.isResource){
				let id = await db.createResource(cls, values);
				res = await db.getSpecificResources(cls, [id]);
			} else {
				if (cls.isRelationship){
					let id = await db.createRelationship(cls,
						model[values[1].class], model[values[2].class],
						href2Id(values[1].href), href2Id(values[2].href),
						values);
					res = await db.getSpecificRelationships(cls, [id]);
				}
			}
			console.log("commit_new returns", res[0]);
			return res[0];
		},

		/* Commit an edited entity to DB */
		async commit_edit({entity, newValues}) {
			console.log("commit_edit", entity, newValues);
			let cls = model[entity.class];
			let id = href2Id(entity.href);
			let res;
			if (cls.isResource){
                await db.updateResource(cls, id, newValues);
				res = await db.getSpecificResources(cls, [id]);
            } else {
            	if (cls.isRelationship){
					await db.updateRelationshipByID(cls, id, newValues);
					res = await db.getSpecificRelationships(cls, [id]);
				}
			}
			console.log("commit_edit returns", res[0]);
			return res[0];
		},

		/* Commit changes after deleting entity to DB */
		async commit_delete({entity}) {
			console.log("commit_delete", entity);
			let cls = model[entity.class];
			let id = href2Id(entity.href);
			if (cls.isResource){
				await db.deleteResource(cls, id);
			} else {
				if (cls.isRelationship){
					await db.deleteRelationshipByID(cls, id);
				}
			}
		},

		/* Load from DB all entities with given IDs */
		async load(addresses, options = {}) {
			let clsMaps = {};
			for (let address of Object.values(addresses)){
				let cls = model[address.class];
				let id = href2Id(address.href);
				if (clsMaps[cls.name]::isUndefined()){
					clsMaps[cls.name] = {cls: cls, ids: [id]}
				} else {
					clsMaps[cls.name].ids.push(id);
				}
			}
			let results = [];
			for (let {cls, ids} of Object.values(clsMaps)){
				let clsResults = (cls.isResource)?
					await db.getSpecificResources(cls, ids, {withoutShortcuts: true}):
					await db.getSpecificRelationships(cls, ids);
				clsResults = clsResults.filter(x => !x::isNull() && !x::isUndefined());
				if (clsResults.length < ids.length){
					throw customError({
						status:  NOT_FOUND,
						class:   cls.name,
						ids:     ids,
						message: humanMsg`Not all specified ${cls.name} entities with IDs '${ids.join(',')}' exist.`
					});
				}
				if (clsResults.length > 0){
					results.push(...clsResults);
				}
			}
			console.log("load returns", JSON.stringify(results, null, 4));
			return results;
		},

		/* Load from DB all entities of a given class */
		async loadAll(cls, options = {}) {
			let results = [];
			if (cls.isResource){
				results = await db.getAllResources(cls, {withoutShortcuts: true});
			} else {
				if (cls.isRelationship){
					results = await db.getAllRelationships(cls);
				}
			}
			console.log("loadAll returns", JSON.stringify(results, null, 4));
			return results;
		}
	};

	model = modelFactory(frontend).classes;
	for (let [key, value] of Object.entries(model)){
		if (value.isResource) {resources[key] = value;}
		if (value.isRelationship) {relationships[key] = value;}
	}

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
