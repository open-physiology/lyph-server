////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import _                      from 'lodash';
import {Client as RestClient} from 'node-rest-client';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// set up the database connection                                                                                     //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import config from './config.es6.js';
let restClient = new RestClient({ user: config.dbUser, password: config.dbPass});


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// set up a queue to wait for certain database-tasks                                                                  //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let waitingFor = Promise.resolve();
function waitFor(p) { waitingFor = waitingFor.then(() => p) }


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// provide a way to send queries                                                                                      //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export function query(statements, returnIndex) {
	/* normalize main Cypher statements */
	if (!Array.isArray(statements)) { statements = [statements] }
	statements = statements.map((stmt) => {
		if (_.isObject(stmt) && _.isString(stmt.statement)) { return stmt                }
		if (_.isString(stmt))                               { return { statement: stmt } }
		throw new Error(`Invalid query parameter: ${statements}`);
	});

	///* dumping queries to the console */
	//console.log('----------------------------------------------------------------------------------------------------');
	//for (let {statement} of statements) {
	//	console.log(statement.replace(/^\s+/mg, '').replace(/\n$/, ''));
	//	console.log('- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ');
	//}

	/* launch the REST call to Neo4j, return a promise */
	return waitingFor.then(() => new Promise((resolve, reject) => {
		restClient.post(`http://${config.dbHost}:${config.dbPort}/db/data/transaction/commit`, {
			data: {
				statements
			}
		}, ({results, errors}) => {
			if (errors.length > 0) {
				reject(errors);
			} else {
				if (_.isUndefined(returnIndex)) { returnIndex = statements.length-1 }
				let result = results[returnIndex];
				resolve(result.data.map(({row}) => _.zipObject(result.columns, row)));
			}
		}).on('error', (err) => {
			reject(err);
		});
	}));
}


export const creationQuery = (statements) => {
	statements = statements({
		withNewId: (newIdName) => `
			MATCH (UID:UID)
			SET UID.counter = UID.counter + 1
			WITH UID.counter as ${newIdName}
		`,
		withNewIds: (matchName, newIdName, preserve = []) => `
			WITH collect(${matchName}) AS matchedNodes ${preserve.map(p => `, ${p}`).join('')}
			MATCH (UID:UID)
			SET UID.counter = UID.counter + size(matchedNodes)
			WITH matchedNodes,
			     UID.counter - size(matchedNodes) AS oldIdCount
			     ${preserve.map(p => `, ${p}`).join('')}
			UNWIND range(0, size(matchedNodes) - 1) AS i
			WITH matchedNodes[i]     AS ${matchName},
			     oldIdCount + i + 1  AS ${newIdName}
			     ${preserve.map(p => `, ${p}`).join('')}
		`
	});
	if (!Array.isArray(statements)) { statements = [statements] }
	return query([`
		MATCH (UID:UID)
		SET UID.__lock = true
		RETURN UID.__lock
	`, ...statements, `
		MATCH (UID:UID)
		SET UID.__lock = false
		RETURN UID.__lock
	`], statements.length);
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
