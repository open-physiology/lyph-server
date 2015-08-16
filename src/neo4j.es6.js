import _                  from 'lodash';
import Kefir              from 'kefir';
import {GraphDatabase}    from 'neo4j';
import {promisify}        from './util.es6.js';
import {validate}         from 'revalidator';
import NODE_TYPES         from './node-types.es6.js';
import RELATIONSHIP_TYPES from './relationship-types.es6.js';

let {username, password, server, port} = require('../neo4j-credentials.json');

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
	return promisify(node, 'save')
			.then(({id}) => promisify(db, 'query', `MATCH (n) WHERE id(n) = ${id} SET n :${type} RETURN n`))
			.then(arr => arr[0].n)
			.then((node) => {
				NODE_TYPES[type].onCreate.plug(Kefir.constant([data, node]));
				return node;
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
		NODE_TYPES[type].onUpdate.plug(Kefir.constant([data, node]));
		return node;
	});
}

export function deleteDatabaseNode(type, id) {
	return promisify(db, 'query', `
		MATCH (n)
		WHERE id(n) = ${id}
		OPTIONAL MATCH (n)-[r]-()
		DELETE n, r
	`, {}).then((node) => {
		NODE_TYPES[type].onDelete.plug(Kefir.constant([]));
		return node;
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
		NODE_TYPES[type].onUpdate.plug(Kefir.constant([data, node]));
		return node;
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
// * automatically create and link its layers based on the templates
NODE_TYPES.lyph.onCreate.onValue(([data, lyph]) => {
	promisify(db, 'query', `
		MATCH  (lyph) -[:instantiates]-> (lyphTemplate) -[hl:hasLayer]-> (layerTemplate)
		WHERE  id(lyph) = ${lyph.id}, id(lyphTemplate) = ${data.template}
		CREATE UNIQUE (lyph) -[:hasLayer { position: hl.position }]-> (l),
		              (l) -[:instantiates]-> (layerTemplate)
	`, {}); // TODO: test
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////
// When creating a layerTemplate:
// * add corresponding layer to all instantiated lyphs
// *
NODE_TYPES.lyph.onCreate.onValue(([data, layerTemplate]) => {
	promisify(db, 'query', `
		MATCH (lyph:lyph) -[:instantiates]-> (lyphTemplate:lyphTemplate) -[hl:hasLayer]-> (layerTemplate:layerTemplate)
		WHERE id(layerTemplate) = ${layerTemplate.id}
		CREATE UNIQUE (lyph) -[:hasLayer { position: hl.position }]-> (layer) -[:instantiates]-> (layerTemplate)
	`, {});
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////




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
