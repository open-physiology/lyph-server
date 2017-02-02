////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* external libs */
import _, {mapValues} from 'lodash';
import isArray from 'lodash-bound/isArray';
import isNumber from 'lodash-bound/isNumber';
import isNull from 'lodash-bound/isNull';
import isUndefined from 'lodash-bound/isUndefined';
import cloneDeep   from 'lodash-bound/cloneDeep';

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

async function createModelResource(db, cls, fields, id){
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
	if (id::isNumber()){ fields.id = id; }
	return cls.new(fields);
}

async function createModelRelationship(db, cls, relA, idA, idB, requestedFields){
	/*Extract relationship ends*/
	let hrefA = id2Href(db.config.host, relA.resourceClass, idA);
	let resA = await relA.resourceClass.get(hrefA);
	let hrefB = id2Href(db.config.host, relA.codomain.resourceClass, idB);
	let resB = relA.codomain.resourceClass.get(hrefB);
	/*Create new relationship*/
	return cls.new({...requestedFields, 1: resA, 2: resB});
}


const requestHandler = {

	batch: { //TODO rewrite batch
		async post({db}, req, res){
			let responses = [], ids = [];
			let {temporaryIDs, operations} = req.body;
			let modelObjects = [];
			let operationTempIDs = {};
			//Create model resource by given fields, retrieve resources for existing IDs in its properties
			for (let operation of operations) {
				let {method, path, body} = operation;
				let pathObj = swagger.paths[path];
				let cls = model[pathObj['x-resource-type']];
				let objectTempIDs = {};
				//filter and store separately temporary IDs
				for (let [fieldName, fieldSpec] of Object.entries(cls.relationshipShortcuts)) {
					if (body[fieldName]::isUndefined() || body[fieldName]::isNull()) { continue; }
					if (fieldSpec.cardinality.max === 1) { body[fieldName] = [body[fieldName]] }
					objectTempIDs[fieldName] = body[fieldName].filter(x => temporaryIDs.includes(x));
					body[fieldName] = body[fieldName].filter(x => !temporaryIDs.includes(x));
				}
				let object = await createModelResource(db, cls, body, body.id);
				operationTempIDs[object.id]= objectTempIDs;
				modelObjects.push(object);
			}
			//Replace temporary IDs with newly created model resources
			for (let object of modelObjects) {
				let cls = model[object.class];
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

			//Add missing resources to DB
			for (let i = 0; i < operations.length; i++){
				let object = modelObjects[i];
				let cls = model[object.class];
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
			let results;
            try{
			    results = [...await cls.getAll()].map(resource => resource.toJSON());
            } catch(e){
                console.log("Error", e);
                throw(e);
            }
			res.status(OK).jsonp(results);
		},
		async post({db, cls}, req, res) {
			let resource = await createModelResource(db, cls, req.body);
			await resource.commit();
			res.status(CREATED).jsonp(resource.toJSON());
		}
	},
	specificResources: /*get, post, put, delete*/ {
		async get({db, cls}, req, res) {
			let ids = req.pathParams.ids;
			let hrefs = ids.map(id => id2Href(db.config.host, cls, id));
			let response = await cls.get(hrefs);
			response = response.map(x => x.toJSON());
			res.status(OK).jsonp(response);
		},
		async post({db, cls}, req, res) {
			let href = id2Href(db.config.host, cls, req.pathParams.id);
			console.log("POST", href);
			let resource = await cls.get(href);
			console.log("current resource", resource);
			for (let fieldName of Object.keys(req.body)){
				resource[fieldName] = req.body[fieldName];
			}
			await resource.commit();
			res.status(OK).jsonp(resource.toJSON());
		},
		async put({db, cls}, req, res) {
			let href = id2Href(db.config.host, cls, req.pathParams.id);
			console.log("PUT", href);
			let resource = await cls.get(href);
			console.log("current resource", resource);
			//Empty out old fields
			for (let fieldName of Object.keys(resource.fields)){
				if (!["id", "href", "class"].includes(fieldName)){
					delete resource[fieldName];
				}
			}
			for (let fieldName of Object.keys(req.body)){
				resource[fieldName] = req.body[fieldName];
			}
			await resource.commit();
			res.status(OK).jsonp(resource.toJSON());
		},
		async delete({db, cls}, req, res) {
			let href = id2Href(db.config.host, cls, req.pathParams.id);
			console.log("DELETE", href);
			let resource = await cls.get(href);
			await resource.delete();
			res.status(NO_CONTENT).jsonp();
		}
	},
	relatedResources: /*get*/ {
		async get({db, relA}, req, res) {
			let href = id2Href(db.config.host, relA.resourceClass, req.pathParams.idA);
			let resource = await relA.resourceClass.get(href);
			console.log("Getting now related resources for resource", resource);
			let related = resource[relA.name].map(rel => rel[2]);
			console.log("Related resources", related);
			res.status(OK).jsonp( related.map(r => r.toJSON()));
			//res.status(OK).jsonp( await db.getRelatedResources(relA, req.pathParams.idA) );
		}
	},
	specificRelatedResource: /*put, delete*/ {
		async put({db, cls, relA}, req, res) {
			let {idA, idB} = req.pathParams;
			let rel = await createModelRelationship(db, cls, relA, idA, idB, req.body);
			await rel.commit();
			res.status(OK).jsonp(rel.toJSON());
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
			let results = [...await cls.getAll()].map(resource => resource.toJSON());
			res.status(OK).jsonp(results);
        },
		//TODO rewrite
		async delete({db, cls}, req, res) {
            await db.deleteAllRelationships(cls);
            res.status(NO_CONTENT).jsonp();
        }
    },
    specificRelationships: /*get, post, put, delete*/ {
		async get({db, cls}, req, res) {
			let ids = req.pathParams.ids;
			let hrefs = ids.map(id => id2Href(db.config.host, cls, id));
			let response = await cls.get(hrefs);
			response = response.map(x => x.toJSON());
			res.status(OK).jsonp(response);
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
			await db.updateRelationship(relA, idA, idB,  await createModelRelationship(db, cls, relA, idA, idB, req.body));
			res.status(OK).jsonp(await db.getRelationships(relA, idA, idB));
		},
		async put({db, cls, relA}, req, res) {
			let {idA, idB} = req.pathParams;
			await db.replaceRelationship(relA, idA, idB, await createModelRelationship(db, cls, relA, idA, idB, req.body));
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
			let fields = values::cloneDeep();
			fields.href = id2Href(db.config.host, cls, fields.id);
			let res;
			if (cls.isResource){
				let id = await db.createResource(cls, fields);
				res = await db.getSpecificResources(cls, [id]);
			} else {
				if (cls.isRelationship){
					//TODO: test
					let relA = model[fields[0].class].relationships[cls.name];
					let idA = fields[0].id;
					let idB = fields[1].id;
					let id = await db.createRelationship(relA, idA, idB, fields);
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
			let res;
            console.log("Class". cls);
			let id = href2Id(entity.href);
			if (cls.isResource){
                id = await db.updateResource(cls, id, newValues);
				res = await db.getSpecificResources(cls, [id]);
            } else {
            	if (cls.isRelationship){
					id = await db.updateRelationshipByID(cls, id, newValues);
					res = await db.getSpecificRelationships(cls, [id]);
				}
			}
			console.log("commit_edit returns", res[0]);
			return res[0];
		},

		/* Commit changes after deleting entity to DB */
		async commit_delete({entity}) {
			console.log("commit_delete", entity);
			let cls = entity.constructor;
			if (cls.isResource){
				await db.deleteResource(cls, entity.id);
			} else {
				if (cls.isRelationship){
					await db.deleteRelationshipByID(cls, entity.id);
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
				//TODO make it work with relationships
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
			let info = sw(pathObj['x-path-type'])(
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
