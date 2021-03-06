////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


import {zipObject} from 'lodash';
import isString from 'lodash-bound/isString';
import isObject from 'lodash-bound/isObject';
import isUndefined from 'lodash-bound/isUndefined';
import isArray from 'lodash-bound/isArray';

import {Client as RestClient}                       from 'node-rest-client';
import {exec}                                       from 'child_process';

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const MAX_TRIES = 8;

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// set up the database connection                                                                                     //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


const _restClient = Symbol('_restClient');
const _waitingFor = Symbol('_waitingFor');
export default class Neo4j {

	newUID = 0;

	constructor(config) {
		/* set up */
		this.config = config;
		this[_restClient] = new RestClient({ user: this.config.user, password: this.config.pass });
		this[_waitingFor] = Promise.resolve();

  	    this.waitFor(this.init());
		console.log("Start with counter", this.newUID);
	}

	async init() {
		let [{maxID}] = await this.query(`
			MATCH (n) WITH collect(n.id) as nodeIds
			OPTIONAL MATCH ()-[r]-() WITH nodeIds + collect(r.id) as allIds
			UNWIND allIds as ids
			RETURN coalesce(max(ids), 0) as maxID
		`);
		this.newUID = maxID;
		console.log("Last index in DB: ", this.newUID);
	};

	/**
	 * Clear the database and set up meta-data.
	 * This only works if you pass along the string 'Yes! Delete all everythings!'.
	 * WARNING: This deletes all everythings in the Neo4j database.
	 */
	clear(confirmation) {
		if (confirmation !== 'Yes! Delete all everythings!') {
			throw new Error("You almost deleted everything in the database, but you didn't provide the proper confirmation phrase.");
		}
		this.waitFor(this.query(`		
			MATCH (n)
			OPTIONAL MATCH (n) -[r]-> ()
			DELETE n, r`)
		);
		this.newUID = 0;
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
	async query(statements, returnIndex) {
		/* first, perform operations we're waiting for */
		await this[_waitingFor];

		/* normalize main Cypher statements */
		if (!statements::isArray()) { statements = [statements] }
		statements = statements.map((stmt) => {
			if (stmt::isObject() && stmt.statement::isString()) { return stmt                }
			if (stmt::isString())                               { return { statement: stmt } }
			throw new Error(`Invalid query parameter: ${statements}`);
		});

		///* dumping queries to the console */
		//console.log('----------------------------------------------------------------------------------------------------');
		//for (let {statement} of statements) {
		//	console.log(statement.replace(/^\s+/mg, '').replace(/\n$/, ''));
		//	console.log('- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ');
		//}


		/* launch the REST call to Neo4j, return a promise */
		const attemptRestCall = () => new Promise((resolve, reject) => {
			this[_restClient].post(`http://${this.config.host}:${this.config.port}/db/data/transaction/commit`, {
				data: { statements }
			}, ({results, errors}) => {
				if (errors.length > 0) { return reject(errors) }
				if (returnIndex::isUndefined()) { returnIndex = statements.length-1 }
				let result = results[returnIndex];
				resolve(result.data.map(({row}) => zipObject(result.columns, row)));
			}).on('error', reject);
		});

		/* try a number of times, possibly (re)starting Neo4j itself if necessary */
		for (let tries = 1; tries <= MAX_TRIES; ++tries) {
			try {
				if (this.config.consoleLogging) {console.log(`[Neo4j] [${Date()}] Sending query (try ${tries})...`);}
				let result = await attemptRestCall();
				if (this.config.consoleLogging) { console.log(`[Neo4j] [${Date()}] Query succeeded!`) }
				return result;
			} catch (err) {
				if (err && err.code && err.code === 'ECONNREFUSED') {
					console.error(`[Neo4j] [${Date()}] Connection to Neo4j failed.`);
					if (this.config.consoleLogging) { console.log(`[Neo4j] [${Date()}] Restarting Neo4j...`) }
					await new Promise((resolve, reject) => {
						if (this.config.consoleLogging) {console.log("CONFIG", this.config);}
						exec(`docker start ${this.config.docker}`, (error) => {
							if (error) { reject(error) }
							else       { resolve()     }
						});
					});
					await new Promise((resolve) => { setTimeout(resolve, Math.pow(2, tries) * 1000) });
				} else if (err && err.code && err.code === 'ECONNRESET') {
					console.error(`[Neo4j] [${Date()}] Request to Neo4j was reset.`);
					await new Promise((resolve) => { setTimeout(resolve, Math.pow(2, tries) * 1000) });
				} else {
					throw err;
				}
			}
		}

	}

	createUniqueIdConstraintOn(label) {
		return this.waitFor(this.query(`
			CREATE CONSTRAINT ON (n:${label})
			ASSERT n.id IS UNIQUE
		`));
	}

};
