// imports
import express    from 'express';
import bodyParser from 'body-parser';
import {
		createDatabaseNode,
		getDatabaseNode,
		updateDatabaseNode,
		deleteDatabaseNode,
		replaceDatabaseNode,
		getAllDatabaseNodes
} from './neo4j.es6.js';
import './http-status-codes.es6.js';

import NODE_TYPES from './node-types.es6.js';
import RELATIONSHIP_TYPES from './relationship-types.es6.js';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// REST interface
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// the express application
let app = express();

// middleware
app.use(bodyParser.json());

// sending error responses
const errorHandler = (spec, res) => (err) => {
	if (err.message.startsWith("No node at")) {
		res.sendStatus(NOT_FOUND);
		res.send({
			status: NOT_FOUND,
			message: `There is no ${spec.singular} with id ${req.params.id}.`,
			rawError: err
		});
	} else if (err.type === 'json-schema-validation') {
		res.sendStatus(PRECONDITION_FAILED);
		res.send({
			status: PRECONDITION_FAILED,
			message: `The submitted entity violates the data-type constraints.`,
			rawError: err
		});
	} else {
		res.sendStatus(INTERNAL_SERVER_ERROR);
		res.send({
			status: INTERNAL_SERVER_ERROR,
			message: `The server encountered an unknown error.`,
			rawError: err
		});
	}
};

// sending result response
const resultResponder = (res) => ({id, data}) => { res.send({ id, ...data }) };

// to implement an API for a specific type of entity (e.g., lyphs)
function implementNodeREST(type, spec) {
	if (NODE_TYPES[type].noRestCrud) { return }
	app.get(`/${type}`, (req, res) => {
		getAllDatabaseNodes(type).then((nodes) => {
			let result = nodes.map(({id, data}) => ({ id, ...data }));
			res.send(result);
		});
	});
	app.get(`/${type}/:id`, (req, res) => {
		getDatabaseNode(type, req.params.id)
				.then(resultResponder(res))
				.catch(errorHandler(spec, res));
	});
	app.post(`/${type}`, (req, res) => {
		createDatabaseNode(type, req.body)
				.then(resultResponder(res))
				.catch(errorHandler(spec, res));
	});
	app.post(`/${type}/:id`, (req, res) => {
		updateDatabaseNode(type, req.params.id, req.body)
				.then(resultResponder(res))
				.catch(errorHandler(spec, res));
	});
	app.put(`/${type}`, (req, res) => {
		createDatabaseNode(type, req.body)
				.then(resultResponder(res))
				.catch(errorHandler(spec, res));
	});
	app.put(`/${type}/:id`, (req, res) => {
		replaceDatabaseNode(type, req.params.id, req.body)
				.then(resultResponder(res))
				.catch(errorHandler(spec, res));
	});
	app.delete(`/${type}/:id`, (req, res) => {
		deleteDatabaseNode(type, req.params.id)
				.then(resultResponder(res))
				.catch(errorHandler(spec, res));
	});
}

// to implement an API for a specific type of entity (e.g., lyphs)
function implementRelationshipREST(type, spec) {
	app.get(`/${type}`, (req, res) => {
		getAllDatabaseRelationships(type).then((nodes) => {
			let result = nodes.map(({id, data}) => ({ id, ...data }));
			res.send(result);
		});
	});
	app.get(`/${type}/:id`, (req, res) => {
		getDatabaseRelationship(req.params.id)
				.then(resultResponder(res))
				.catch(errorHandler(spec, res));
	});
	app.post(`/${type}`, (req, res) => {
		createDatabaseRelationship(type, req.body)
				.then(resultResponder(res))
				.catch(errorHandler(spec, res));
	});
	app.post(`/${type}/:id`, (req, res) => {
		updateDatabaseRelationship(req.params.id, req.body)
				.then(resultResponder(res))
				.catch(errorHandler(spec, res));
	});
	app.put(`/${type}`, (req, res) => {
		createDatabaseRelationship(type, req.body)
				.then(resultResponder(res))
				.catch(errorHandler(spec, res));
	});
	app.put(`/${type}/:id`, (req, res) => {
		replaceDatabaseRelationship(req.params.id, req.body)
				.then(resultResponder(res))
				.catch(errorHandler(spec, res));
	});
	app.delete(`/${type}/:id`, (req, res) => {
		deleteDatabaseRelationship(req.params.id)
				.then(resultResponder(res))
				.catch(errorHandler(spec, res));
	});
}


// Implement REST interfaces for all node types
for (let type of Object.keys(NODE_TYPES)) { implementNodeREST(type, NODE_TYPES[type]) }


// start listening on port 3000 (temporary)
let server = app.listen(3000);
