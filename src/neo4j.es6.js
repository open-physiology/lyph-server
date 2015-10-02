////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import _                      from 'lodash';
import {Client as RestClient} from 'node-rest-client';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Helpful snippets for Cypher Queries                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const THEN = `WITH 1 AS XdummyX`;
export const END = `RETURN 0`;
export const LOCK_UID = `
	MATCH (UID:UID)
	SET UID.__lock = true
	RETURN UID.__lock
`;
export const WITH_NEW_IDS = (matchName, newIdName, staticIdNames = [], preserve = []) => `
	WITH collect(${matchName}) AS matchedNodes, ${preserve.join(', ')}
	MATCH (UID:UID)
	SET UID.counter = UID.counter + ${staticIdNames.length} + size(matchedNodes)
	SET UID.__lock = false
	WITH matchedNodes,
	     UID.counter - ${staticIdNames.length} - size(matchedNodes) AS oldIdCount
	     ${preserve.map(p => `, ${p}`)}
	UNWIND range(0, size(matchedNodes) - 1) AS i
	WITH matchedNodes[i]                                         AS ${matchName},
	     oldIdCount + ${staticIdNames.length} + i                AS ${newIdName}
	     ${staticIdNames.map((idName, j) => `, oldIdCount + ${j} AS ${idName}`)}
	     ${preserve.map(p => `, ${p}`)}
`;
export const WITH_NEW_ID = (newIdName) => `
	MERGE (UID:UID)
	SET UID.counter = UID.counter + 1
	SET UID.__lock = false
	WITH UID.counter as ${newIdName}
`;


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// set up the database connection and provide a way to send queries                                                   //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const {user, password, server, port} = require('../neo4j.config.json');
let restClient = new RestClient({ user, password });

let waitingFor = Promise.resolve();
function waitFor(p) { waitingFor = waitingFor.then(() => p) }

export const query = (statements) => {
	/* normalize main Cypher statements */
	if (Array.isArray(statements)) {
		statements = statements.map((stmt) => {
			if (_.isObject(stmt) && _.isString(stmt.statement)) { return stmt                }
			if (_.isString(stmt))                               { return { statement: stmt } }
			throw new Error(`Invalid query parameter: ${statements}`);
		});
	} else if (_.isObject(statements) && statements.statement) {
		statements = [statements];
	} else if (_.isString(statements)) {
		statements = [{ statement: statements }];
	} else {
		throw new Error(`Invalid query parameter: ${statements}`);
	}

	//console.log('----------------------------------------------------------------------------------------------------');
	//console.log(JSON.stringify(statements, null, 4));
	//console.log('----------------------------------------------------------------------------------------------------');

	/* launch the REST call to Neo4j, return a promise */
	return waitingFor.then(() => new Promise((resolve, reject) => {
		restClient.post(`http://${server}:${port}/db/data/transaction/commit`, {
			data: {
				statements
			}
		}, ({results, errors}) => {
			if (errors.length > 0) {
				reject(errors);
			} else {
				let result = results[statements.length-1];
				resolve(result.data.map(({row}) => _.zipObject(result.columns, row)));
			}
		}).on('error', (err) => {
			reject(err);
		});
	}));
};


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// initialize database (for when it's the first time starting the server)                                             //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* a UID node to keep track of unique ids */
waitFor(query(`
	MERGE (UID:UID)
	SET UID.counter = coalesce(UID.counter, 0)
`));

/* enforce uniqueness of node ids */
export function createUniqueIdConstraintOn(label) {
	waitFor(query(`
		CREATE CONSTRAINT ON (n:${label})
		ASSERT n.id IS UNIQUE
	`));
}


/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
// TODO: implement these AD HOC actions into the new code
//
///////////// Ad-hoc actions after creating/updating/deleting nodes or relationships /////////////////////////////////////
//
//// When creating a lyph:
////
					//NODE_TYPES.lyphs.onCreate = (data, lyph) => {
					//	return query(`
					//		MATCH (lyphTemplate:lyphTemplates {id: ${data.template}}) -[:hasLayer]-> (layerTemplate:layerTemplates)
					//		RETURN layerTemplate
					//	`).then((layerTemplates) => {
					//		return query(`
					//			MATCH         (lyph:lyphs {id: ${lyph.data.id}}), (lyphTemplate:lyphTemplates {id: ${data.template}})
					//			CREATE UNIQUE (lyph) -[:instantiates]-> (lyphTemplate)
					//			${THEN}
					//		` + layerTemplates.map(({layerTemplate}) => `
					//			${WITH_NEW_ID('nid')}
					//			MATCH         (lyph:lyphs {id: ${lyph.data.id}}), (layerTemplate:layerTemplates {id: ${layerTemplate.data.id}})
					//			CREATE UNIQUE (lyph) -[:hasLayer]-> (layer:layers {id: nid, position: layerTemplate.position}) -[:instantiates]-> (layerTemplate)
					//		`).join(THEN) + END);
					//	});
					//};
//
//// When creating a layerTemplate:
//// TODO: implement the ad-hoc thing below
//NODE_TYPES.layerTemplates.onCreate = (data, layerTemplate) => {
//	return query(`
//		MATCH  (lyph:lyphs) -[:instantiates]-> (lyphTemplate:lyphTemplates {id: ${data.lyphTemplate}})
//		RETURN lyph
//	`).then((lyphs) => {
//		let handlePositioning;
//		if (typeof data.position === 'undefined') {
//			handlePositioning = `
//				MATCH (lyphTemplate:lyphTemplates {id: ${data.lyphTemplate}}) -[:hasLayer]-> (:layerTemplates)
//				WITH  count(*) AS newPosition
//			`;
//		} else {
//			handlePositioning = `
//				MATCH (lyphTemplate:lyphTemplates {id: ${data.lyphTemplate}}) -[:hasLayer]-> (layerTemplate:layerTemplates)
//				WHERE layerTemplate.position >= ${data.position}
//				OPTIONAL MATCH (layerTemplate) <-[:instantiates]- (layer:layers)
//				WHERE layer.position >= ${data.position}
//				SET   layerTemplate.position = layerTemplate.position + 1
//				SET   layer.position = layer.position + 1
//				WITH  ${data.position} AS newPosition
//			`;
//		}
//		return query(`
//			${handlePositioning}
//			// Set the position on the new layerTemplate
//			MATCH (layerTemplate:layerTemplates {id: ${layerTemplate.data.id}})
//			SET   layerTemplate.position = newPosition
//			${THEN}
//			// Add :hasLayer relationship
//			MATCH         (lyphTemplate:lyphTemplates {id: ${data.lyphTemplate}}), (layerTemplate:layerTemplates {id: ${layerTemplate.data.id}})
//			CREATE UNIQUE (lyphTemplate) -[:hasLayer]-> (layerTemplate)
//			${THEN}
//		` + lyphs.map(({lyph}) => `
//			// Add corresponding layer to all instantiated lyphs
//			${WITH_NEW_ID('nid')}
//			MATCH         (lyph:lyphs {id: ${lyph.data.id}}), (layerTemplate:layerTemplates {id: ${layerTemplate.data.id}})
//			CREATE UNIQUE (lyph) -[:hasLayer]-> (layer:layers { id: nid, position: layerTemplate.position }) -[:instantiates]-> (layerTemplate)
//		`).join(THEN) + END);
//	});
//};
//
//// When creating a node:
//// TODO: check if I need to implement the ad-hoc thing below
//NODE_TYPES.nodes.onCreate = (data, node) => {
//	return query(data.attachments.map(attachment => `
//		MATCH         (node:nodes {id:${node.data.id}}), (layer:layers {id:${attachment.layer}})
//		CREATE UNIQUE (layer) -[:hasOnBorder {border: '${attachment.border}'}]-> (node)
//	`).join(THEN));
//};
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
