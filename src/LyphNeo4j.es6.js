////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
'use strict';

/* libraries */
import _, {difference, find, property} from 'lodash';
import isNull from 'lodash-bound/isNull';
import isUndefined from 'lodash-bound/isUndefined';
import isNumber from 'lodash-bound/isNumber';

/* local stuff */
import Neo4j from './Neo4j.es6.js';
import {
	customError,
	pluckData,
	dataToNeo4j,
	neo4jToData,
	arrowEnds,
	matchLabelsQueryFragment,
	extractRelationshipFields,
	humanMsg,
	arrowMatch,
	extractIds,
    resources
} from './utils/utility.es6.js';
import {
	OK,
	CREATED,
	NO_CONTENT,
	BAD_REQUEST,
	NOT_FOUND,
	CONFLICT,
	GONE,
	PRECONDITION_FAILED,
	INTERNAL_SERVER_ERROR
} from './http-status-codes.es6.js';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// LyphNeo4j class                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* Symbols for private methods */
const createAllResourceRelationships      = Symbol('createAllResourceRelationships');
const removeUnspecifiedRelationships      = Symbol('removeUnspecifiedRelationships');
const getResourcesToDelete                = Symbol('getResourcesToDelete');
const anythingAnchoredFromOutside         = Symbol('anythingAnchoredFromOutside');

/* The LyphNeo4j class */
export default class LyphNeo4j extends Neo4j {

	assignId(fields = {}){
		if (!fields.id || fields.id < 0){
			fields.id = ++this.newUID;
		}
	}

	////////////////////////////////////////////
	// Common functionality for other methods //
	////////////////////////////////////////////
	async [createAllResourceRelationships](cls, id, fields) {
		for (let fieldName of Object.keys(fields).filter(key => !!cls.relationships[key])){

			let val = fields[fieldName];
			if (val::isUndefined() || val::isNull()) { continue }

			let rels = (val::isSet())? [...val]: [val];
			for (let rel of rels){
				if (rel::isNull() || rel::isUndefined()) { continue; }
				//Skip more general collections, only create top most relationships
				//Relationships to create have to correspond to the relationship field, e.g., -->HasLayer vs HasLayer
				if (fieldName.substring(3) !== rel.class){ continue; }

				let resA = rel[1], resB = rel[2];

				let error = resA::isUndefined() || resB::isUndefined()
					|| resA::isNull() || resB::isNull()
					|| !resA.class || !resB.class;

				if (!error && !resA.id::isNumber() && !resB.id::isNumber()) {
					//assign a newly created id to one of relationship ends
				}

				if (error){
					throw customError({
						status:  BAD_REQUEST,
						class:   rel.class,
						rel:     rel,
						message: humanMsg`Invalid resource definition found while creating relationship ${fieldName}.`
					});
				}

				//If only one resource ID is missing, this entity has not been added to DB yet
				if (!resA.id::isNumber() || !resB.id::isNumber()){ continue; }

				let fields = rel.toJSON();
				let relCls = relationships[rel.class];

				await this.createRelationship(relCls,
					{clsA: modelClasses[resA.class], idA: resA.id},
					{clsB: modelClasses[resB.class], idB: resB.id}, fields);
			}
		}
	}


	async [removeUnspecifiedRelationships](cls, id, fields, {includeUngivenFields = false} = {}) {
		let relDeletionStatements = [];
		for (let fieldName of Object.keys(fields).filter((key) => !!cls.relationships[key])){
			let val = fields[fieldName];

			if (val::isUndefined()){ continue }
			let fieldSpec = cls.relationships[fieldName];
			//We do not create abstract relationships and do need to delete them
			if (fieldName.substring(3) !== fieldSpec.relationshipClass.name){ continue; }

			let ids = [];
            if (!val::isNull()) {
				val = _(val).mapValues((x) => (x.value)).value();
				ids = extractIds(val);
			}

			let [l, r] = arrowEnds(fieldSpec);
			relDeletionStatements.push(`
				MATCH (A { id: ${id} }) 
					   ${l}[rel: ${matchLabelsQueryFragment(fieldSpec.relationshipClass).join('|')}]${r} 
					  (B)
				WHERE NOT B.id IN [${ids.join(', ')}]
				   AND (${matchLabelsQueryFragment(cls, 'A').join(' OR ')})
				   AND (${matchLabelsQueryFragment(fieldSpec.codomain.resourceClass, 'B').join(' OR ')}) 			 	  
				DELETE rel
			`);
		}
		if (relDeletionStatements.length > 0) {
			await this.query(relDeletionStatements);
		}
	}

	async [getResourcesToDelete](cls, id) {
		/* collect nodes to delete */
		let markedNodes = new Map();

		let sustainingRelationships = [];
		for (let rel of Object.values(cls.relationships)){
			if (rel.options.sustains) { sustainingRelationships.push(rel)}
		}

		/* traverse graph to find nodes to delete, based on 'sustaining' relationships */
		const l2rSustaining       = sustainingRelationships.filter((relA) => relA.keyInRelationship === 1);
		const r2lSustaining       = sustainingRelationships.filter((relA) => relA.keyInRelationship === 2);

		const recurse = async ({cls, id}) => {
			if (markedNodes.has(id)) { return }
			markedNodes.set(id, { cls, id });
			let nResources = await this.query(`
				MATCH (a { id: ${id} })
				${arrowMatch(l2rSustaining,       'a', ' -','->', 'y')}
				${arrowMatch(r2lSustaining,       'a', '<-','- ', 'z')}
				WHERE ${matchLabelsQueryFragment(cls, 'a').join(' OR ')}
				WITH ${l2rSustaining      .length ? 'collect(y)' : '[]'} +
				     ${r2lSustaining      .length ? 'collect(z)' : '[]'} AS coll UNWIND coll AS n
				WITH DISTINCT n
				RETURN { id: n.id, cls: n.class } AS n
			`).then(pluckData('n'));

			await Promise.all(nResources.map(({id, cls}) => ({id, cls: resources[cls]})).map(recurse));
		};
		await recurse({ cls, id });

		/* return the nodes that would be deleted */
		return [...markedNodes.values()];
	}


	async [anythingAnchoredFromOutside](cls, ids) {

		let anchoringRelationships = [];
		for (let rel of Object.values(cls.relationships)){
			if (rel.options.anchors) { anchoringRelationships.push(rel)}
		}

		const l2rAnchoring       = anchoringRelationships.filter((relA) => relA.keyInRelationship === 1);
		const r2lAnchoring       = anchoringRelationships.filter((relA) => relA.keyInRelationship === 2);

		return await this.query(`
			WITH [${ids.join(',')}] AS ids
			${ l2rAnchoring.length ? `
				OPTIONAL MATCH (y) -[:${l2rAnchoring.map(({relationshipClass:{name}})=>name).join('|')}]-> (b)
				WHERE (NOT y.id in ids) AND (b.id in ids)
				WITH ids, collect({ anchoring: y.id, anchored: b.id }) AS anchors1
			` : 'WITH ids, [] AS anchors1' }
			${ r2lAnchoring.length ? `
				OPTIONAL MATCH (z) <-[:${r2lAnchoring.map(({relationshipClass:{name}})=>name).join('|')}]- (c)
				WHERE (NOT z.id in ids) AND (c.id in ids)
				WITH ids, anchors1 + collect({ anchoring: z.id, anchored: c.id }) AS anchors2
			` : 'WITH ids, anchors1 AS anchors2' }
			UNWIND anchors2 AS n
			WITH DISTINCT n
			WHERE n.anchoring IS NOT NULL
			RETURN DISTINCT n
		`).then(pluckData('n'));
	}


	//////////////////////////////////////////////////////
	// Main methods to handle data in the DB            //
	//////////////////////////////////////////////////////

	async getSpecificResources(cls, ids, options = {includeRelationships: true, includeShortcuts: false}) {

		let queryEnd = (options.includeRelationships)? `
			OPTIONAL MATCH (A)-[rel]-(B) 
			RETURN A, collect({rel: rel, B: B, s: startNode(rel).id}) as rels`
			: ` RETURN A, [] as rels`;

		/* preparing the part of the query that adds relationship info */
		let result = await this.query(`
			UNWIND [${ids.join(',')}] AS id WITH id
		 	MATCH (A { id: id })
			WHERE ${matchLabelsQueryFragment(cls, 'A').join(' OR ')}
			${queryEnd}
		 `);

		/* integrate relationship data into the resource object */
		result = result.map(({A, rels}) => extractRelationshipFields(A, rels, options.includeShortcuts));

		/* return results in proper order */
		return ids.map((id1) => result.find(({id}) => id1 === id));
	}

	
	async getAllResources(cls, options = {includeRelationships: true, includeShortcuts: false}) {
		let queryEnd = (options.includeRelationships)? `
			OPTIONAL MATCH (A)-[rel]-(B) 
			RETURN A, collect({rel: rel, B: B, s: startNode(rel).id}) as rels`
			: ` RETURN A, [] as rels`;

		let result = await this.query(`
			MATCH (A) where ${matchLabelsQueryFragment(cls, 'A').join(' OR ')} 
			${queryEnd}
		`);

		return result.map(({A, rels}) => extractRelationshipFields(A, rels, options.includeShortcuts));
	}


	async createResource(cls, fields = {}) {

		if (!fields.class){ fields.class = cls.name; }
		this.assignId(fields);

		await this.query({
			statement: `
				CREATE (n:${cls.name})
				SET n += {dbProperties}
				SET n.class = "${cls.name}"
			`,
			parameters: {  dbProperties: dataToNeo4j(cls, fields) }
		});

		return fields.id;
	}


	async updateResource(cls, id, fields) {

		/* get the current fields of the resource */
		let [oldResource] = await this.getSpecificResources(cls, [id]);

		/* the main query for creating the resource */
		await this.query({
			statement: `
				MATCH (n { id: ${id} })
				WHERE ${matchLabelsQueryFragment(cls, 'n').join(' OR ')}
				SET n      += {dbProperties}
				SET n.id    = ${id}
				SET n.class = n.class
			`,
			parameters: {  dbProperties: dataToNeo4j(cls, fields) }
		});

		/* remove the relationships explicitly left out */
		await this[removeUnspecifiedRelationships](cls, id, fields);

		/* create the required relationships */
		await this[createAllResourceRelationships](cls, id, fields);
	}


	async replaceResource(cls, id, fields) {

		/* get the current fields of the resource */
		let [oldResource] = await this.getSpecificResources(cls, [id]);

		/* the main query for creating the resource */
		await this.query({
			statement: `
				MATCH (n { id: ${id} })
				WHERE ${matchLabelsQueryFragment(cls, 'n').join(' OR ')}
				SET n       = {dbProperties}
				SET n.id    = ${id}
				SET n.class = "${cls.name}"
			`,
			parameters: {  dbProperties: dataToNeo4j(cls, fields) }
		});

		/* remove the relationships explicitly left out */
		await this[removeUnspecifiedRelationships](cls, id, fields, { includeUngivenFields: true });

		/* create the required relationships */
		await this[createAllResourceRelationships](cls, id, fields);

	}


	async deleteResource(cls, id) {

		/* get all ids+classes that would be auto-deleted by deleting this particular node */
		let dResources = await this[getResourcesToDelete](cls, id);

		/* then test whether of those are still anchored, and we have to abort the delete operation */
		let anchors = await this[anythingAnchoredFromOutside](cls, dResources.map(property('id')));
		if (anchors.length > 0) {
			throw customError({
				status: CONFLICT,
				anchors,
				message: humanMsg`
					Certain resources would need to be deleted in response to this request,
					but they are being kept alive by other resources 
					[${anchors.map(x => x.anchoring + "=>" + x.anchored).join(', ')}]
				`
			});
		}
		let ids = dResources.map(property('id')).join(',');

		await this.query(`
			MATCH (n)
			WHERE n.id IN [${ids}]
			OPTIONAL MATCH (n)-[r]-()
			DELETE n, r
		`);

		return [ids];
	}

	///////////////////////////////////////////////////////////////
    //Operations on relationships                                //
    ///////////////////////////////////////////////////////////////

	async getAllRelationships(cls) {
		/* formulating and sending the query */
		let result = await this.query(`
			MATCH (A) -[rel:${matchLabelsQueryFragment(cls).join('|')}]-> (B) 
			RETURN A, rel, B
		`);

		return result.map(({A, rel, B}) => ({
			...neo4jToData(cls, rel),
			1: neo4jToData(resources[A.class], A),
			2: neo4jToData(resources[B.class], B)
		}));
    }


	async deleteAllRelationships(cls){
		await this.query(`
			MATCH () -[rel:${matchLabelsQueryFragment(cls, 'rel').join('|')}]- ()
			DELETE rel
		`);
	}

	////////////////////////////////////////////////////
	//Relationships by ID                             //
	////////////////////////////////////////////////////

	async getSpecificRelationships(cls, ids){
		let result = await this.query(`
			MATCH (A) -[rel:${matchLabelsQueryFragment(cls).join('|')}]-> (B) 
			WHERE rel.id IN [${ids.join(',')}]
			RETURN A, rel, B
		`);

		result = result.map(({A, rel, B}) => ({
			...neo4jToData(cls, rel),
			1: neo4jToData(resources[A.class], A),
			2: neo4jToData(resources[B.class], B)}));

		/* return results in proper order */
		return ids.map((id1) => result.find(({id}) => id1 === id));
	}


    async updateRelationshipByID(cls, id, fields){
		let [oldRelationship] = await this.getSpecificRelationships(cls, [id]);

		await this.query({
			statement: `
				MATCH () -[rel:${matchLabelsQueryFragment(cls).join('|')} { id: ${id} }]-> () 
				SET rel += {dbProperties}
			`,
			parameters: {  dbProperties: dataToNeo4j(cls, fields) }
		});
	}


    async replaceRelationshipByID(cls, id, fields){
		let [oldRelationship] = await this.getSpecificRelationships(cls, [id]);

		await this.query({
			statement: `
				MATCH (A) -[old:${cls.name} { id: ${id} }]-> (B)
				MERGE (A) -[rel:${cls.name}]-> (B)
				SET rel      += {dbProperties}
				SET rel.id    = ${id}
				SET rel.class = "${cls.name}"
			`,
			parameters: {  dbProperties: dataToNeo4j(cls, fields) }
		});
    }


    async deleteRelationshipByID(cls, id){
		await this.query(`
			MATCH () -[rel:${matchLabelsQueryFragment(cls).join('|')} {id: ${id}}]- () 
			DELETE rel
		`);
    }


    ////////////////////////////////////////////////////
	//Relationships by resources                      //
	////////////////////////////////////////////////////

	async getRelationships(cls, {clsA, idA}, {clsB, idB}){
		let result = await this.query(`
			MATCH (A { id: ${idA} }) -[rel:${matchLabelsQueryFragment(cls).join('|')}]-> (B { id: ${idB} })
			WHERE (${matchLabelsQueryFragment(clsA, 'A').join(' OR ')})
			  AND (${matchLabelsQueryFragment(clsB, 'B').join(' OR ')})    
			RETURN A, rel, B
		`);

		return result.map(({A, rel, B}) => ({
			...neo4jToData(cls, rel),
			1: neo4jToData(clsA, A),
			2: neo4jToData(clsB, B)}));
	}


	async createRelationship(cls, {clsA, idA}, {clsB, idB}, fields = {}) {
		if (!fields.class){ fields.class = cls.name; }
		this.assignId(fields);

		await this.query({
			statement: `
				MATCH (A:${clsA.name} { id: ${idA} }),
					  (B:${clsB.name} { id: ${idB} })
				CREATE UNIQUE (A) -[rel:${cls.name}]-> (B)
				SET rel += {dbProperties}
				SET rel.class = "${cls.name}"
            `,
			parameters: {  dbProperties:  dataToNeo4j(cls, fields) } }
		);

		return fields.id;
	}


	async updateRelationship(cls, {clsA, idA}, {clsB, idB}, fields){
		await this.query({
			statement: `
				MATCH (A { id: ${idA} }) -[rel:${matchLabelsQueryFragment(cls).join('|')}]-> (B { id: ${idB} })
			    WHERE (${matchLabelsQueryFragment(clsA, 'A').join(' OR ')})
			  	  AND (${matchLabelsQueryFragment(clsB, 'B').join(' OR ')})      	  
				SET rel += {dbProperties}
			`,
			parameters: {  dbProperties: dataToNeo4j(cls, fields) }
		});
	}


	async replaceRelationship(cls, {clsA, idA}, {clsB, idB}, fields){
		await this.query({
			statement: `
				MATCH (A { id: ${idA} }), (B { id: ${idB} })
			    WHERE (${matchLabelsQueryFragment(clsA, 'A').join(' OR ')})
			  	  AND (${matchLabelsQueryFragment(clsB, 'B').join(' OR ')})    
			  	MERGE (A) -[rel:${cls.name}]-> (B)
				SET rel += {dbProperties}
				SET rel.class = "${cls.name}"    	  
			`,
			parameters: {  dbProperties: dataToNeo4j(cls, fields) }
		});
	}


	async deleteRelationship(cls, {clsA, idA}, {clsB, idB}) {
		await this.query(`
			MATCH (A { id: ${idA} }) -[rel:${matchLabelsQueryFragment(cls).join('|')}]-> (B { id: ${idB} })
			WHERE (${matchLabelsQueryFragment(clsA, 'A').join(' OR ')})
			  AND (${matchLabelsQueryFragment(clsB, 'B').join(' OR ')})          
			DELETE rel
		`);
	}
}
