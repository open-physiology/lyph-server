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
import {NOT_FOUND} from './http-status-codes.es6.js';

import ENTITIES from './entity-types.json';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// REST interface
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// the express application
let app = express();

// middleware
app.use(bodyParser.json());

// to implement an API for a specific type of entity (e.g., lyphs)
function implementEntity(type) {
	const jsonBody = req => JSON.stringify(req.body, null, '    ');
	app.get(`/${type}`, (req, res) => {
		getAllDatabaseNodes(type).then((nodes) => {
			let result = nodes.map(({id, data}) => ({ id, ...data }));
			res.send(result);
		});
	});
	app.get(`/${type}/:id`, (req, res) => {
		getDatabaseNode(req.params.id)
				.then(({id, data}) => { res.send({ id, ...data }) })
				.catch((err) => {
					if (err.message.startsWith("No node at")) {
						res.sendStatus(NOT_FOUND);
						res.send({
							status: NOT_FOUND,
							message: `There is no ${type} with id ${req.params.id}.`
						});
					} else {
						res.sendStatus(INTERNAL_SERVER_ERROR);
						res.send({
							status: INTERNAL_SERVER_ERROR,
							message: `The server encountered an unknown error.`,
							rawError: err
						});
					}
				});
	});
	app.post(`/${type}`, (req, res) => {
		createDatabaseNode(type, req.body)
				.then(({id, data}) => { res.send({ id, ...data }) })
				.catch((err) => {
					res.sendStatus(INTERNAL_SERVER_ERROR);
					res.send({
						status: INTERNAL_SERVER_ERROR,
						message: `The server encountered an unknown error.`,
						rawError: err
					});
				});
	});
	app.post(`/${type}/:id`, (req, res) => {
		updateDatabaseNode(req.params.id, req.body)
				.then(({id, data}) => { res.send({ id, ...data }) })
				.catch((err) => {
					if (err.message.startsWith("No node at")) {
						res.sendStatus(NOT_FOUND);
						res.send({
							status: NOT_FOUND,
							message: `There is no ${type} with id ${req.params.id}.`
						});
					} else {
						res.sendStatus(INTERNAL_SERVER_ERROR);
						res.send({
							status: INTERNAL_SERVER_ERROR,
							message: `The server encountered an unknown error.`,
							rawError: err
						});
					}
				});
	});
	app.put(`/${type}`, (req, res) => {
		createDatabaseNode(type, req.body)
				.then(({id, data}) => { res.send({ id, ...data }) })
				.catch((err) => {
					res.sendStatus(INTERNAL_SERVER_ERROR);
					res.send({
						status: INTERNAL_SERVER_ERROR,
						message: `The server encountered an unknown error.`,
						rawError: err
					});
				});
	});
	app.put(`/${type}/:id`, (req, res) => {
		replaceDatabaseNode(req.params.id, req.body)
				.then(({id, data}) => { res.send({ id, ...data }) })
				.catch((err) => {
					if (err.message.startsWith("No node at")) {
						res.sendStatus(NOT_FOUND);
						res.send({
							status: NOT_FOUND,
							message: `There is no ${type} with id ${req.params.id}.`
						});
					} else {
						res.sendStatus(INTERNAL_SERVER_ERROR);
						res.send({
							status: INTERNAL_SERVER_ERROR,
							message: `The server encountered an unknown error.`,
							rawError: err
						});
					}
				});
	});
	app.delete(`/${type}/:id`, (req, res) => {
		deleteDatabaseNode(req.params.id)
				.then(({id, data}) => { res.send({ id, ...data }) })
				.catch((err) => {
					if (err.message.startsWith("No node at")) {
						res.sendStatus(NOT_FOUND);
						res.send({
							status: NOT_FOUND,
							message: `There is no ${type} with id ${req.params.id}.`
						});
					} else {
						res.sendStatus(INTERNAL_SERVER_ERROR);
						res.send({
							status: INTERNAL_SERVER_ERROR,
							message: `The server encountered an unknown error.`,
							rawError: err
						});
					}
				});
	});
}


// Test stuff
ENTITIES.forEach(implementEntity);


// start listening on port 3000 (temporary)
let server = app.listen(3000);
