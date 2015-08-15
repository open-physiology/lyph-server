import _                  from 'lodash';
import {GraphDatabase}    from 'neo4j';
import {promisify}        from './util.es6.js';
import {validate}         from 'revalidator';
import NODE_TYPES         from './node-types.es6.js';
import RELATIONSHIP_TYPES from './relationship-types.es6.js';

let {username, password, server, port} = require('../neo4j-credentials.json');

var db = new GraphDatabase(`http://${username}:${password}@${server}:${port}`);

function validateObject(object, {required} = {required: true}) {
	let nodeAndRelationTypes = {...NODE_TYPES, ...RELATIONSHIP_TYPES};
	if (typeof object.type === 'undefined') {
		return {
			valid:  false,
			errors: [{
				attribute: 'required',
				property:  'type',
				expected:  true,
				actual:    undefined,
				message:   'is required'
			}]
		};
	}
	let {schema} = nodeAndRelationTypes[object.type];
	if (!required) {
		schema = _.cloneDeep(schema, (__, key) => {
			if (key === 'required') { return false }
		});
	}
	return validate(object, schema);
}

export function createDatabaseNode(type, data) {
	let validation = validateObject({ type, ...data });
	if (!validation.valid) { return new Promise((__, reject) => { reject(validation.errors) }) }
	let node = db.createNode({ type, ...data });
	return promisify(node, 'save')
			.then(({id}) => promisify(db, 'query', `MATCH (n) WHERE id(n) = ${id} SET n :${type} RETURN n`))
			.then(arr => arr[0].n);
}

export function getDatabaseNode(id) {
	return promisify(db, 'getNodeById', id);
}

export function updateDatabaseNode(id, data) {
	let validation = validateObject({ type, ...data }, { required: false });
	if (!validation.valid) { return new Promise((__, reject) => { reject(validation.errors) }) }
	return promisify(db, 'getNodeById', id).then((node) => {
		Object.assign(node.data, data);
		return promisify(node, 'save');
	});
}

export function deleteDatabaseNode(id) {
	return promisify(db, 'getNodeById', id).then((node) => {
		return promisify(node, 'delete');
	});
}

export function replaceDatabaseNode(id, data) {
	let validation = validateObject({ type, ...data });
	if (!validation.valid) { return new Promise((__, reject) => { reject(validation.errors) }) }
	return promisify(db, 'getNodeById', id).then((node) => {
		node.data = { type: node.data.type, ...data };
		return promisify(node, 'save');
	});
}

export function getAllDatabaseNodes(type) {
	return promisify(db, 'query', `MATCH (n) WHERE n.type = {type} RETURN n`, { type })
			.then(res => res.map(node => node.n));
}

export function createDatabaseRelationship(type, from, to, data) {
	let validation = validateObject({ type, ...data });
	if (!validation.valid) { return new Promise((__, reject) => { reject(validation.errors) }) }
	return promisify(from, 'createRelationshipTo', to, type, data);
}




///// TESTING CODE /////

//Promise.all([
//	createDatabaseNode('node', {}),
//	createDatabaseNode('node', {})
//]).then(([a, b]) => {
//	return createDatabaseRelationship('process', a, b, {});
//}).then((doc) => {
//	console.log("OK: ", doc);
//}, (err) => {
//	console.error(err);
//});


//getAllDatabaseNodes('lyphs').then((doc) => {
//	console.log("OK: ", doc);
//}, (err) => {
//	console.error(JSON.stringify(err, null, '    '));
//});


//replaceDatabaseNode(9, { species: 'Monkey' }).then((doc) => {
//	console.log("OK: ", doc);
//}, (err) => {
//	console.error("ERROR: ", err);
//});
//
//deleteDatabaseNode(8).then((doc) => {
//	console.log("OK: ", doc);
//}, (err) => {
//	console.error("ERROR: ", err);
//});
//
//updateDatabaseNode(8, { species: 'Monkey' }).then((doc) => {
//	console.log("OK: ", doc);
//}, (err) => {
//	console.error("ERROR: ", err);
//});
//
//readDatabaseNode(8).then((doc) => {
//	console.log("OK: ", doc);
//}, (err) => {
//	console.error("ERROR: ", err);
//});
//
//createDatabaseNode('lyphs', {
//	name: "Heart",
//	species: "Human"
//}).then((doc) => {
//	console.log("OK: ", doc);
//}, (err) => {
//	console.error("ERROR: ", err);
//});
