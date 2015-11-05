////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

import _                      from 'lodash';
import {Client as RestClient} from 'node-rest-client';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// set up the database connection                                                                                     //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const _restClient = Symbol('_restClient');
const _waitingFor = Symbol('_waitingFor');
export default class Neo4j {

	constructor(config) {
		/* set up */
		this.config = config;
		this[_restClient] = new RestClient({ user: this.config.user, password: this.config.pass});
		this[_waitingFor] = Promise.resolve();

		/* initialize database if not yet done */
		this.waitFor(this.query(`
			MERGE (UID:UID)
			SET UID.counter = coalesce(UID.counter, 0)
		`));
	}

	/**
	 * Clear the database and set up meta-data.
	 * WARNING: This deletes all everythings!
	 */
	clear() {
		return this.query([`
			MATCH (n)
			OPTIONAL MATCH (n) -[r]-> ()
			DELETE n, r
		`, `
			MERGE (UID:UID)
			SET UID.counter = 0
		`]);
	}

	/**
	 * Wait for the given promise to resolve before performing any database actions.
	 * @param p the promise to wait on
	 */
	waitFor(p) { return this[_waitingFor] = this[_waitingFor].then(() => p) }


	/**
	 * Perform the given Cypher statements.
	 * @param statements  {Array.<string|object>|string|object} the statement(s) to run
	 * @param returnIndex {number}                              the index of the statement from which to return the result value
	 * @returns {Promise} the promise representing the database query finishing (and its return value if applicable)
	 */
	query(statements, returnIndex) {
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
		return this[_waitingFor].then(() => new Promise((resolve, reject) => {
			this[_restClient].post(`http://${this.config.host}:${this.config.port}/db/data/transaction/commit`, {
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

	/**
	 * Perform Cypher statements that require one or more uniquely generated IDs.
	 * @param statements {function} a function taking functions to generate IDs and returning statements
	 * @returns {Promise} the promise representing the database query finishing (and its return value if applicable)
	 */
	creationQuery(statements) {
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
		return this.query([`
			MATCH (UID:UID)
			SET UID.__lock = true
			RETURN UID.__lock
		`, ...statements, `
			MATCH (UID:UID)
			SET UID.__lock = false
			RETURN UID.__lock
		`], statements.length);
	}

	createUniqueIdConstraintOn(label) {
		return this.waitFor(this.query(`
			CREATE CONSTRAINT ON (n:${label})
			ASSERT n.id IS UNIQUE
		`));
	}

};
