import _                  from 'lodash';
import Kefir              from 'kefir';
import {GraphDatabase}    from 'neo4j';
import {promisify}        from './util.es6.js';
import {validate}         from 'revalidator';
import NODE_TYPES         from './node-types.es6.js';
import RELATIONSHIP_TYPES from './relationship-types.es6.js';

const EXEC = `WITH 1 AS dummy`; // to separate Cypher queries

const {username, password, server, port} = require('../neo4j-credentials.json');

var db = new GraphDatabase(`http://${username}:${password}@${server}:${port}`);

// TODO: We cannot rely on Neo4j ids, so we need to roll our own
//     : http://neo4j.com/docs/stable/query-match.html#_get_node_or_relationship_by_id

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

export function createDatabaseNode(type, data) {
	let validation = validateObject({ type, ...data });
	if (!validation.valid) { return new Promise((__, reject) => { reject(validation.error) }) }
	let node = db.createNode({ type, ...data }); // TODO: remove fields with `db: false`
	return promisify(db, 'query', `CREATE (n:${type} {data}) RETURN n`, { data })
			.then(arr => arr[0].n)
			.then((node) => {
				// Do all ad-hoc stuff related to this creation, and wait for it, then return the new node
				return NODE_TYPES[type].onCreate ?
				       NODE_TYPES[type].onCreate(data, node).then(() => node) :
				       node;
			});
}

export function getDatabaseNode(type, id) {
	return promisify(db, 'getNodeById', id);
}

export function updateDatabaseNode(type, id, data) {
	let validation = validateObject({ type, ...data }, { required: false });
	if (!validation.valid) { return new Promise((__, reject) => { reject(validation.error) }) }
	return promisify(db, 'getNodeById', id).then((node) => {
		Object.assign(node.data, data);
		return promisify(node, 'save');
	}).then((node) => {
		// Do all ad-hoc stuff related to this update, and wait for it, then return the new node
		return NODE_TYPES[type].onUpdate ?
		       NODE_TYPES[type].onUpdate(data, node).then(() => node) :
		       node;
	});
}

export function deleteDatabaseNode(type, id) {
	return promisify(db, 'query', `
		MATCH (n)
		WHERE id(n) = ${id}
		OPTIONAL MATCH (n)-[r]-()
		DELETE n, r
	`, {}).then(() => {
		// Do all ad-hoc stuff related to this update, and wait for it, then return the new node
		return NODE_TYPES[type].onDelete && NODE_TYPES[type].onDelete();
	});
	// TODO: for some types of nodes, we don't want to auto-delete relationships,
	//     : also, make use of 'sustains' and 'anchors' properties on relationships
}

export function replaceDatabaseNode(type, id, data) {
	let validation = validateObject({ type, ...data });
	if (!validation.valid) { return new Promise((__, reject) => { reject(validation.error) }) }
	return promisify(db, 'getNodeById', id).then((node) => {
		node.data = { type: node.data.type, ...data };
		return promisify(node, 'save');
	}).then((node) => {
		// Do all ad-hoc stuff related to this update, and wait for it, then return the new node
		return NODE_TYPES[type].onUpdate ?
		       NODE_TYPES[type].onUpdate(data, node).then(() => node) :
		       node;
	});
}

export function getAllDatabaseNodes(type) {
	return promisify(db, 'query', `MATCH (n) WHERE n.type = {type} RETURN n`, { type })
			.then(res => res.map(node => node.n));
}

export function createDatabaseRelationship(type, from, to, data) {
	let {anchors, sustains} = RELATIONSHIP_TYPES[type];
	let validation = validateObject({ type, anchors, sustains, ...data });
	if (!validation.valid) { return new Promise((__, reject) => { reject(validation.error) }) }
	return promisify(db, 'query', `
		MATCH (a), (b)
		WHERE id(a) = ${from} AND id(b) = ${to}
		CREATE (a)-[r:${type} {data}]->(b)
		RETURN r
	`, { data });
}

export function deleteDatabaseRelationship(from, to) {
	return promisify(db, 'query', `
		MATCH (a)-[r]->(b)
		WHERE id(a) = ${from} AND id(b) = ${to}
		DELETE r
	`, {});
}

export function updateDatabaseRelationship(type, from, to, data) {
	let validation = validateObject({ type, ...data }, { required: false });
	if (!validation.valid) { return new Promise((__, reject) => { reject(validation.error) }) }
	return promisify(db, 'query', `
		MATCH (a)-[r]->(b)
		WHERE id(a) = ${from} AND id(b) = ${to}
		SET r += {data}
		RETURN r
	`, { data });
}


// TODO: avoid race conditions when one REST request involves multiple queries executed on the database




////////////////////////////////////////////////////////////////////////////////////////////////////////////
// When creating a lyph:
// * link lyph and lyph-template through ':instantiates' relationship
// * automatically create and link its layers based on the templates
NODE_TYPES.lyph.onCreate = (data, lyph) => {
	return promisify(db, 'query', `
		MATCH  (lyph:lyph), (lyphTemplate:lyphTemplate)
		WHERE  id(lyph) = ${lyph.id} AND id(lyphTemplate) = ${data.template}
		CREATE UNIQUE (lyphTemplate) <-[:instantiates]- (lyph)
		${EXEC}
		MATCH  (lyph:lyph), (lyphTemplate:lyphTemplate) -[hl:hasLayer]-> (layerTemplate:layerTemplate)
		WHERE  id(lyph) = ${lyph.id} AND id(lyphTemplate) = ${data.template}
		CREATE UNIQUE (lyph) -[:hasLayer]-> (layer:layer { position: layerTemplate.position }) -[:instantiates]-> (layerTemplate)
	`, {});
};
////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////
// When creating a layerTemplate:
// * properly position the layerTemplate in its lyphTemplate; if necessary, move subsequent ones
// * add corresponding layer to all instantiated lyphs
NODE_TYPES.layerTemplate.onCreate = (data, layerTemplate) => {
	let handlePositioning;
	if (typeof data.position === 'undefined') {
		handlePositioning = `
			MATCH (lyphTemplate:lyphTemplate) -[:hasLayer]-> (:layerTemplate)
			WHERE id(lyphTemplate) = ${data.lyphTemplate}
			WITH count(*) AS newPosition
		`;
	} else {
		handlePositioning = `
			MATCH (lyphTemplate:lyphTemplate) -[:hasLayer]-> (layerTemplate:layerTemplate) <-[:instantiates]- (layer:layer),
			WHERE id(lyphTemplate) = ${data.lyphTemplate} AND layerTemplate.position >= ${data.position}
			SET layerTemplate.position = layerTemplate.position + 1, layer.position = layer.position + 1
			WITH ${data.position} AS newPosition
		`;
	}
	return promisify(db, 'query', `
		${handlePositioning}
		// Set the position on the new layerTemplate
		MATCH (layerTemplate:layerTemplate)
		WHERE id(layerTemplate) = ${layerTemplate.id}
		SET   layerTemplate.position = newPosition
		${EXEC}
		// Add :hasLayer relationship
		MATCH (lyphTemplate:lyphTemplate), (layerTemplate:layerTemplate)
		WHERE id(layerTemplate) = ${layerTemplate.id} AND id(lyphTemplate) = ${data.lyphTemplate}
		CREATE UNIQUE (lyphTemplate) -[:hasLayer]-> (layerTemplate)
		${EXEC}
		// Add corresponding layer to all instantiated lyphs
		MATCH (lyph:lyph) -[:instantiates]-> (lyphTemplate:lyphTemplate), (layerTemplate:layerTemplate)
		WHERE id(layerTemplate) = ${layerTemplate.id} AND id(lyphTemplate) = ${data.lyphTemplate}
		CREATE (lyph) -[:hasLayer]-> (layer:layer { position: layerTemplate.position }) -[:instantiates]-> (layerTemplate)
	`, {});
};
////////////////////////////////////////////////////////////////////////////////////////////////////////////

// TODO: check that min thickness is <= max thickness

createDatabaseNode('lyphTemplate', {
	name: 'first lyph-template'
}).then((lyphTemplate) => {
	return createDatabaseNode('layerTemplate', {
		thickness: [1, 5],
		lyphTemplate: lyphTemplate.id
	}).then(() => lyphTemplate);
}).then((lyphTemplate) => {
	return createDatabaseNode('layerTemplate', {
		thickness: [2, 6],
		lyphTemplate: lyphTemplate.id
	}).then(() => lyphTemplate);
}).then((lyphTemplate) => {
	return createDatabaseNode('layerTemplate', {
		thickness: [3, 7],
		lyphTemplate: lyphTemplate.id
	}).then(() => lyphTemplate);
}).then((lyphTemplate) => {
	return createDatabaseNode('lyph', {
		name: "first lyph!",
		species: "Human",
		template: lyphTemplate.id
	}).then(() => lyphTemplate);
}).then((res) => {
	console.log("OK: ", res);
}, (err) => {
	console.error("ERR: ", err);
});





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
//	createDatabaseNode('node', {}),
//	createDatabaseNode('node', {})
//]).then(([a, b]) => {
//	return createDatabaseRelationship('process', a.id, b.id, { class: 'vascular' });
//}).then((res) => {
//	console.log("OK: ", res);
//}, (err) => {
//	console.error("ERR: ", err);
//});


//deleteDatabaseNode(48).then((res) => {
//	console.log("OK: ", res);
//}, (err) => {
//	console.error("ERR: ", err);
//});




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
