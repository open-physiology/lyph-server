////////// Imports /////////////////////////////////////////////////////////////////////////////////////////////////////

import _                  from 'lodash';
import {GraphDatabase}    from 'neo4j';
import {validate}         from 'revalidator';
import {promisify}        from './util.es6.js';
import NODE_TYPES         from './node-types.es6.js';
import RELATIONSHIP_TYPES from './relationship-types.es6.js';


////////// Helpful snippets for Cypher Queries /////////////////////////////////////////////////////////////////////////

const THEN = `WITH 1 AS XdummyX`;
const END = `RETURN 0`;
const NEW_ID = (id) => {
	return `
		MERGE (meta:meta)
		ON CREATE SET meta.newID = 0
		ON MATCH  SET meta.newID = meta.newID + 1
		WITH meta.newID AS ${id}
	`;
};


////////// Get and possibly initialize the database ////////////////////////////////////////////////////////////////////

const {username, password, server, port} = require('../neo4j-credentials.json');
let db = new GraphDatabase(`http://${username}:${password}@${server}:${port}`);


////////// Convenience function to run queries /////////////////////////////////////////////////////////////////////////

const query = (query, params = {}) => promisify(db, 'query', query, params);


////////// Validation of data objects through JSON schemas /////////////////////////////////////////////////////////////

function validateObject(object, {required} = { required: true }) {
	let nodeAndRelationshipTypes = { ...NODE_TYPES, ...RELATIONSHIP_TYPES };
	let result;
	if (typeof object.type === 'undefined') {
		result = {
			valid:  false,
			errors: [{
				type:      'json-schema-validation',
				attribute: 'required',
				property:  'type',
				expected:  true,
				actual:    undefined,
				message:   'is required'
			}]
		};
	} else {
		let {schema} = nodeAndRelationshipTypes[object.type];
		if (!required) {
			schema = _.cloneDeep(schema, (__, key) => {
				if (key === 'required') { return false }
			});
		}
		result = validate(object, schema);
	}
	if (result.errors && result.errors.length > 0) {
		result.error = new Error(`${result.errors[0].property} ${result.errors[0].message}`);
		result.error.type = 'json-schema-validation';
	}
	return result;
}

// TODO: check that min thickness is <= max thickness


////////// CRUD operations on the database /////////////////////////////////////////////////////////////////////////////

export function createDatabaseNode(type, data) {
	// validate the incoming data
	let validation = validateObject({ type, ...data });
	if (!validation.valid) { return new Promise((__, reject) => { reject(validation.error) }) }

	// extract the data that actually goes into the database
	let originalData = data;
	data = _.omit(originalData, (__, prop) =>
		(typeof NODE_TYPES[type].schema.properties[prop] !== 'undefined') &&
		(NODE_TYPES[type].schema.properties[prop].skipDB)
	);

	// add the new node to the database
	return query(`
		${NEW_ID('newID')}
		CREATE (n:${type} {data})
		SET n.id = newID
		RETURN n
	`, { data }).then(([{n}]) => {
		// Do all ad-hoc stuff related to this creation, and wait for it, then return the new node
		return NODE_TYPES[type].onCreate ?
		       NODE_TYPES[type].onCreate(originalData, n).then(() => n) :
		       n;
	});
}

export function getDatabaseNode(type, id) {
	return query(`MATCH (n:${type} {id:${id}}) RETURN n`).then(([{n}]) => n);
	// TODO: remove old code below after above code is tested
	//return promisify(db, 'getNodeById', id);
}

export function updateDatabaseNode(type, id, data) {
	// validate the incoming data
	let validation = validateObject({ type, ...data }, { required: false });
	if (!validation.valid) { return new Promise((__, reject) => { reject(validation.error) }) }

	// extract the data that actually goes into the database
	let originalData = data;
	data = _.omit(originalData, (__, prop) => NODE_TYPES[type].schema.properties[prop].skipDB);

	// update the node in the database
	return query(`
		MATCH (n:${type} {id:${id}})
		SET n += {data}
		RETURN n
	`, { data }).then(([{n}]) => {
		return NODE_TYPES[type].onUpdate ?
		       NODE_TYPES[type].onUpdate(originalData, n).then(() => n) :
		       n;
	});
	// TODO: remove old code below after above code is tested
	//return promisify(db, 'getNodeById', id).then((node) => {
	//	Object.assign(node.data, data);
	//	return promisify(node, 'save');
	//}).then((node) => {
	//	// Do all ad-hoc stuff related to this update, and wait for it, then return the new node
	//	return NODE_TYPES[type].onUpdate ?
	//	       NODE_TYPES[type].onUpdate(originalData, node).then(() => node) :
	//	       node;
	//});
}

export function deleteDatabaseNode(type, id) {
	return query(`
		MATCH (n {id:${id}})
		OPTIONAL MATCH (n)-[r]-()
		DELETE n, r
	`, {}).then(() => {
		// Do all ad-hoc stuff related to this update, and wait for it, then return the new node
		return NODE_TYPES[type].onDelete && NODE_TYPES[type].onDelete();
	});
	// TODO: make use of 'sustains' and 'anchors' properties on relationships
}

export function replaceDatabaseNode(type, id, data) {
	// validate the incoming data
	let validation = validateObject({ type, ...data });
	if (!validation.valid) { return new Promise((__, reject) => { reject(validation.error) }) }

	// extract the data that actually goes into the database
	let originalData = data;
	data = _.omit(originalData, (__, prop) => NODE_TYPES[type].schema.properties[prop].skipDB);

	// update the node in the database
	return query(`
		MATCH (n:${type} {id:${id}})
		SET n = {data}
		RETURN n
	`, { data }).then(([{n}]) => {
		// Do all ad-hoc stuff related to this update, and wait for it, then return the new node
		return NODE_TYPES[type].onUpdate ?
		       NODE_TYPES[type].onUpdate(originalData, n).then(() => n) :
		       n;
	});
	// TODO: remove old code below after above code is tested
	//return promisify(db, 'getNodeById', id).then((node) => {
	//	node.data = { type: node.data.type, ...data };
	//	return promisify(node, 'save');
	//}).then((node) => {
	//	// Do all ad-hoc stuff related to this update, and wait for it, then return the new node
	//	return NODE_TYPES[type].onUpdate ?
	//	       NODE_TYPES[type].onUpdate(originalData, node).then(() => node) :
	//	       node;
	//});
}

export function getAllDatabaseNodes(type) {
	return query(`MATCH (n:${type}) RETURN n`)
			.then(res => res.map(({n}) => n));
}


// TODO: remove these 'create database relationship' functions if they're not used
//export function createDatabaseRelationship(type, from, to, data) {
//	let {anchors, sustains} = RELATIONSHIP_TYPES[type];
//
//	// validate the incoming data
//	let validation = validateObject({ type, anchors, sustains, ...data });
//	if (!validation.valid) { return new Promise((__, reject) => { reject(validation.error) }) }
//
//	// extract the data that actually goes into the database
//	let originalData = data;
//	data = _.omit(originalData, (__, prop) => RELATIONSHIP_TYPES[type].schema.properties[prop].skipDB);
//
//	return query(`
//		MATCH (a {id: ${from}}), (b {id: ${to}}), (meta:meta)
//		CREATE (a)-[r:${type} {data}]->(b)
//		SET r.id = meta.newID, meta.newID = meta.newID + 1
//		RETURN r
//	`, { data }); // TODO: ad hoc things?
//}
//
//export function deleteDatabaseRelationship(from, to) {
//	return query(`
//		MATCH (a {id: ${from}}) -[r]-> (b {id: ${to}})
//		DELETE r
//	`, {});
//}
//
//export function updateDatabaseRelationship(type, from, to, data) {
//	let validation = validateObject({ type, ...data }, { required: false });
//	if (!validation.valid) { return new Promise((__, reject) => { reject(validation.error) }) }
//	return query(`
//		MATCH (a {id: ${from}}) -[r]-> (b {id: ${to}})
//		SET r += {data}
//		RETURN r
//	`, { data });
//}


// TODO: avoid race conditions when one REST request involves multiple queries executed on the database


/////////// Ad-hoc actions after creating/updating/deleting nodes or relationships /////////////////////////////////////

// When creating a lyph:
//
NODE_TYPES.lyphs.onCreate = (data, lyph) => {
	return query(`
		MATCH (lyphTemplate:lyphTemplates {id: ${data.template}}) -[:hasLayer]-> (layerTemplate:layerTemplates)
		RETURN layerTemplate
	`).then((layerTemplates) => {
		return query(`
			MATCH         (lyph:lyphs {id: ${lyph.data.id}}), (lyphTemplate:lyphTemplates {id: ${data.template}})
			CREATE UNIQUE (lyph) -[:instantiates]-> (lyphTemplate)
			${THEN}
		` + layerTemplates.map(({layerTemplate}) => `
			${NEW_ID('nid')}
			MATCH         (lyph:lyphs {id: ${lyph.data.id}}), (layerTemplate:layerTemplates {id: ${layerTemplate.data.id}})
			CREATE UNIQUE (lyph) -[:hasLayer]-> (layer:layers {id: nid, position: layerTemplate.position}) -[:instantiates]-> (layerTemplate)
		`).join(THEN) + END);
	});
};

// When creating a layerTemplate:
//
NODE_TYPES.layerTemplates.onCreate = (data, layerTemplate) => {
	return query(`
		MATCH  (lyph:lyphs) -[:instantiates]-> (lyphTemplate:lyphTemplates {id: ${data.lyphTemplate}})
		RETURN lyph
	`).then((lyphs) => {
		let handlePositioning;
		if (typeof data.position === 'undefined') {
			handlePositioning = `
				MATCH (lyphTemplate:lyphTemplates {id: ${data.lyphTemplate}}) -[:hasLayer]-> (:layerTemplates)
				WITH  count(*) AS newPosition
			`;
		} else {
			handlePositioning = `
				MATCH (lyphTemplate:lyphTemplates {id: ${data.lyphTemplate}}) -[:hasLayer]-> (layerTemplate:layerTemplates)
				WHERE layerTemplate.position >= ${data.position}
				OPTIONAL MATCH (layerTemplate) <-[:instantiates]- (layer:layers)
				WHERE layer.position >= ${data.position}
				SET   layerTemplate.position = layerTemplate.position + 1
				SET   layer.position = layer.position + 1
				WITH  ${data.position} AS newPosition
			`;
		}
		return query(`
			${handlePositioning}
			// Set the position on the new layerTemplate
			MATCH (layerTemplate:layerTemplates {id: ${layerTemplate.data.id}})
			SET   layerTemplate.position = newPosition
			${THEN}
			// Add :hasLayer relationship
			MATCH         (lyphTemplate:lyphTemplates {id: ${data.lyphTemplate}}), (layerTemplate:layerTemplates {id: ${layerTemplate.data.id}})
			CREATE UNIQUE (lyphTemplate) -[:hasLayer]-> (layerTemplate)
			${THEN}
		` + lyphs.map(({lyph}) => `
			// Add corresponding layer to all instantiated lyphs
			${NEW_ID('nid')}
			MATCH         (lyph:lyphs {id: ${lyph.data.id}}), (layerTemplate:layerTemplates {id: ${layerTemplate.data.id}})
			CREATE UNIQUE (lyph) -[:hasLayer]-> (layer:layers { id: nid, position: layerTemplate.position }) -[:instantiates]-> (layerTemplate)
		`).join(THEN) + END);
	});
};

// When creating a node:
//
NODE_TYPES.nodes.onCreate = (data, node) => {
	return query(data.attachments.map(attachment => `
		MATCH         (node:nodes {id:${node.data.id}}), (layer:layers {id:${attachment.layer}})
		CREATE UNIQUE (layer) -[:hasOnBorder {border: '${attachment.border}'}]-> (node)
	`).join(THEN));
};


/////////// Test code, and so on ///////////////////////////////////////////////////////////////////////////////////////

setTimeout(() => {


	//createDatabaseNode('lyphTemplates', {
	//	name: 'first lyph-template'
	//}).then((lyphTemplate) => {
	//
	//	return createDatabaseNode('lyphs', {
	//		name:     "first lyph!",
	//		species:  "Human",
	//		template: lyphTemplate.data.id
	//	})
	//			.then(() => {
	//				return createDatabaseNode('layerTemplates', {
	//					name:         "First (should get position 0)",
	//					thickness:    [1, 5],
	//					lyphTemplate: lyphTemplate.data.id
	//				}).then((layerTemplate) => [layerTemplate]);
	//			})
	//			.then((layerTemplates) => {
	//				return createDatabaseNode('layerTemplates', {
	//					name:         "Second (should get position 2)",
	//					thickness:    [2, 6],
	//					lyphTemplate: lyphTemplate.data.id
	//				}).then((layerTemplate) => [...layerTemplates, layerTemplate]);
	//			})
	//			.then((layerTemplates) => {
	//				return createDatabaseNode('layerTemplates', {
	//					name:         "Third (should get position 1)",
	//					position:     1,
	//					thickness:    [3, 7],
	//					lyphTemplate: lyphTemplate.data.id
	//				}).then((layerTemplate) => [...layerTemplates, layerTemplate]);
	//			})
	//			.then(([lt1, lt2, lt3]) => {
	//				return query(`
	//					MATCH (layer:layers) -[:instantiates]-> (layerTemplate:layerTemplates {id: ${lt1.data.id}})
	//					RETURN layer
	//				`);
	//			})
	//			.then(([{layer}]) => {
	//				return createDatabaseNode('nodes', {
	//					attachments: [
	//						{ layer: layer.data.id, border: 'plus' },
	//						{ layer: layer.data.id, border: 'minus' }
	//					]
	//				});
	//			});
	//
	//
	//}).then((res) => {
	//	console.log("OK: ", res);
	//}, (err) => {
	//	console.error("ERR: ", err);
	//});


	//updateDatabaseRelationship('process', 52, 53, { foo: 'bar' }).then((res) => {
	//	console.log("OK: ", res);
	//}, (err) => {
	//	console.error("ERR: ", err);
	//});


	//deleteDatabaseRelationship(50, 51).then((res) => {
	//	console.log("OK: ", res);
	//}, (err) => {
	//	console.error("ERR: ", err);
	//});


	//Promise.all([
	//	createDatabaseNode('nodes', {}),
	//	createDatabaseNode('nodes', {})
	//]).then(([a, b]) => {
	//	return createDatabaseRelationship('process', a.data.id, b.data.id, { class: 'vascular' });
	//}).then((res) => {
	//	console.log("OK: ", res);
	//}, (err) => {
	//	console.error("ERR: ", err);
	//});


}, 1000);
