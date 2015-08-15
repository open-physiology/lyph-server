import {GraphDatabase, _} from 'neo4j';
import {promisify} from './util.es6.js';

let {username, password, server, port} = require('../neo4j-credentials.json');

var db = new GraphDatabase(`http://${username}:${password}@${server}:${port}`);

export function createDatabaseNode(type, data) {
	let node = db.createNode({ type, ...data });
	return promisify(node, 'save');
}

export function readDatabaseNode(id) {
	return promisify(db, 'getNodeById', id);
}

export function updateDatabaseNode(id, data) {
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
	return promisify(db, 'getNodeById', id).then((node) => {
		node.data = data;
		return promisify(node, 'save');
	});
}






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
