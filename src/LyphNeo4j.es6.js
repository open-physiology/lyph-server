////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* libraries */
import _, {difference, find, property} from 'lodash';
import isNull from 'lodash-bound/isNull';
import isUndefined from 'lodash-bound/isUndefined';
import isSet from 'lodash-bound/isSet';
import isNumber from 'lodash-bound/isNumber';

/* local stuff */
import Neo4j from './Neo4j.es6.js';
import {
	or,
	customError,
	pluckData,
	dataToNeo4j,
	neo4jToData,
	arrowEnds,
	matchLabelsQueryFragment,
	extractRelationshipFields,
	humanMsg,
	arrowMatch,
    extractFieldValues,
	extractIds
} from './utility.es6.js';
import {relationships, resources} from './resources.es6.js';
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

//TODO delete when all calls are routed via client library
const assertRelatedResourcesExists        = Symbol('assertRelatedResourcesExists');
const assertRequiredFieldsAreGiven        = Symbol('assertRequiredFieldsAreGiven');
const assertReferencedResourcesExist      = Symbol('assertReferencedResourcesExist');

const assertIdIsGiven                     = Symbol('assertIdIsGiven');
const createAllResourceRelationships      = Symbol('createAllResourceRelationships');
const removeUnspecifiedRelationships      = Symbol('removeUnspecifiedRelationships');
const getResourcesToDelete                = Symbol('getResourcesToDelete');
const anythingAnchoredFromOutside         = Symbol('anythingAnchoredFromOutside');

/* The LyphNeo4j class */
export default class LyphNeo4j extends Neo4j {

	////////////////////////////////////////////
	// Common functionality for other methods //
	////////////////////////////////////////////


	async [assertRelatedResourcesExists](ids, fieldSpec) {
		let cls = fieldSpec.codomain.resourceClass;

		let [{existing}] = await this.query(`
			MATCH (n)
			WHERE (${matchLabelsQueryFragment(cls, 'n').join(' OR ')})
			AND n.id IN [${ids.join(',')}]
			RETURN collect(n.id) as existing
		`);
		let nonexisting = difference(ids, existing);
		if (nonexisting.length > 0) {
			let c = (fieldSpec.cardinality.max === 1) ? 'singular' : 'plural';
			throw customError({
				status:  NOT_FOUND,
				class:   cls.name,
				ids:     nonexisting,
				...((c === 'singular') ? { id: nonexisting[0] } : {}),
				message: humanMsg`
					The specified ${cls[c]}
					${nonexisting.join(',')}
					${(c === 'singular') ? 'does' : 'do'} not exist.
				`
			});
		}
	}


	async [assertRequiredFieldsAreGiven](cls, fields) {
		let allFields = Object.entries(cls.properties);
		for (let [fieldName, fieldSpec] of allFields) {
			if (fieldSpec.required && fields[fieldName]::isUndefined()) {
				throw customError({
					status: BAD_REQUEST,
					class:  cls.name,
					field:  fieldName,
					message: humanMsg`
						You tried to create a new ${cls.singular},
						but the required field '${fieldName}' was not given.
					`
				});
			}
		}
	}


	async [assertIdIsGiven](cls, fields) {
		if (!fields.id::isNumber()) {
			//TODO remove when server side model library assigns IDs to relationships
			/*Assign ID to relationship given ids of its pairs*/
			if (cls.isRelationship){
				/* Cantor pairing function */
				let a = fields[1].id;
				let b = fields[2].id;
				fields.id = 0.5 * (a + b) * (a + b + 1) + b;
				//console.log("Relationship ", cls.name, " gets ID ", fields.id, " given ", a, b);
			} else {
				throw customError({
					status: BAD_REQUEST,
					class:  cls.name,
					field:  "id",
					message: humanMsg`
						You tried to create a new ${cls.singular} without valid ID.
						`
				});
			}
		}
	}

	

	async [assertReferencedResourcesExist](cls, fields) {
		let allRelationFields = Object.entries(cls.relationships);
		for (let [fieldName, fieldSpec] of allRelationFields) {
			let val = fields[fieldName];

			if (val::isUndefined() || val::isNull()) { continue }
			let ids = extractIds(val);

			try { this[assertRelatedResourcesExists](ids, fieldSpec) }
			catch (err) {
				Object.assign(err, {
					class: cls,
					field: fieldName
				});
				throw err;
			}
		}
	}

	
	async [createAllResourceRelationships](cls, id, fields) {
        for (let fieldName of Object.keys(fields).filter(key => !!cls.relationships[key])){

            let val = fields[fieldName];
			if (val::isUndefined() || val::isNull()) { continue }

			let rels = (val::isSet())? [...val]: [val];
			for (let rel of rels){
				//Skip more general collections, only create top most relationships
				//Relationships to create have to correspond to the relationship field, e.g., -->HasLayer vs HasLayer
				if (fieldName.substring(3) !== rel.class){ continue; }

				const resA = rel[1], resB = rel[2];

				if (resA::isUndefined() || resB::isUndefined()
					|| resA::isNull() || resB::isNull()) {
					throw customError({
						status:  BAD_REQUEST,
						class:   rel.class,
						rel:     rel,
						message: humanMsg`Invalid resource definition found while creating relationship ${fieldName}.`
					});
				}

				if (!resA.id::isNumber() || !resB.id::isNumber()) { continue; } //TODO: what to do in general?

				let cls = relationships[rel.class];
				let fields = extractFieldValues(rel);

				await this.query({
					statement: `
                    MATCH (A:${resA.class} { id: ${resA.id} }), (B:${resB.class} { id: ${resB.id} })
                    CREATE UNIQUE (A) -[rel:${rel.class}]-> (B)
                    SET rel += {dbProperties}
                    SET rel.class = "${rel.class}"
                `,
					parameters: {  dbProperties:  dataToNeo4j(cls, fields) } });
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
	// Main methods used directly for lyph-server calls //
	//////////////////////////////////////////////////////

	async assertResourcesExist(cls, ids) {

		/* eliminate duplication */
		ids = [...new Set(ids)];

		/* a query for checking existence of these resources */
		let [{count}] = await this.query(`
			MATCH (n)
			WHERE (${matchLabelsQueryFragment(cls, 'n').join(' OR ')})
			AND n.id IN [${ids.join(',')}]
			RETURN count(n) AS count
		`);

		/* throw the 404 error if 'exists' is false */
		if (count < ids.length) {
			throw customError({
				status:  NOT_FOUND,
				class:   cls.name,
				ids:     ids,
				message: humanMsg`Not all specified ${cls.plural} with given IDs exist.`
			});
		}
	}

	
	async getSpecificResources(cls, ids, options) {

		options = options || {};
		/* throw a 404 if any of the resources don't exist */
		await this.assertResourcesExist(cls, ids);

		let queryEnd = (options.withoutRelationships)? ` RETURN A, [] as rels` : `
			OPTIONAL MATCH (A)-[rel]-(B) 
			RETURN A, collect({rel: rel, B: B, s: startNode(rel).id}) as rels`;

			/* preparing the part of the query that adds relationship info */
		let result = await this.query(`
			UNWIND [${ids.join(',')}] AS id WITH id
		 	MATCH (A { id: id })
			WHERE ${matchLabelsQueryFragment(cls, 'A').join(' OR ')}
			${queryEnd}
		 `);

		/* integrate relationship data into the resource object */
		result = result.map(({A, rels}) => extractRelationshipFields(A, rels, options.withoutShortcuts));

		/* return results in proper order */
		return ids.map((id1) => result.find(({id}) => id1 === id));
	}

	
	async getAllResources(cls, options) {
		options = options || {};

		let queryEnd = (options.withoutRelationships)? ` RETURN A, [] as rels` : `
			OPTIONAL MATCH (A)-[rel]-(B) 
			RETURN A, collect({rel: rel, B: B, s: startNode(rel).id}) as rels`;

		let result = await this.query(`
			MATCH (A) where ${matchLabelsQueryFragment(cls, 'A').join(' OR ')} 
			${queryEnd}
		`);

		return result.map(({A, rels}) => extractRelationshipFields(A, rels, options.withoutShortcuts));
	}


	async createResource(cls, fields) {

		/* assert that all required fields are given */
		await this[assertRequiredFieldsAreGiven](cls, fields);
		await this[assertIdIsGiven](cls, fields);

		/* for all relationships specified in the request, assert that those resources exist */
		await this[assertReferencedResourcesExist](cls, fields);

        //Create resources with given ids
		let [{id}] = await this.query({
			statement: `
				CREATE (n:${cls.name})
				SET n += {dbProperties}
				SET n.class = "${cls.name}"
				RETURN n.id as id
			`,
			parameters: {  dbProperties: dataToNeo4j(cls, fields) } // TODO: serialize nested objects/arrays
		});

		/* create the required relationships */
		await this[createAllResourceRelationships](cls, id, fields);

		return id;
	}


	async updateResource(cls, id, fields) {

		/* get the current fields of the resource */
		let [oldResource] = await this.getSpecificResources(cls, [id]);

		/* for all relationships specified in the request, assert that those resources exist */
		await this[assertReferencedResourcesExist](cls, fields);

		/* the main query for creating the resource */
		await this.query({
			statement: `
				MATCH (n { id: ${id} })
				WHERE ${matchLabelsQueryFragment(cls, 'n').join(' OR ')}
				SET n      += {dbProperties}
				SET n.id    = ${id}
				SET n.class = n.class
			`,
			parameters: {  dbProperties: dataToNeo4j(cls, fields) } // TODO: serialize nested objects/arrays
		});

		/* remove the relationships explicitly left out */
		await this[removeUnspecifiedRelationships](cls, id, fields);

		/* create the required relationships */
		await this[createAllResourceRelationships](cls, id, fields);
	}


	async replaceResource(cls, id, fields) {

		/* get the current fields of the resource */
		let [oldResource] = await this.getSpecificResources(cls, [id]);

		/* assert that all required fields are given */
		await this[assertRequiredFieldsAreGiven](cls, fields);

		/* for all relationships specified in the request, assert that those resources exist */
		await this[assertReferencedResourcesExist](cls, fields);

		/* the main query for creating the resource */
		await this.query({
			statement: `
				MATCH (n { id: ${id} })
				WHERE ${matchLabelsQueryFragment(cls, 'n').join(' OR ')}
				SET n       = {dbProperties}
				SET n.id    = ${id}
				SET n.class = "${cls.name}"
			`,
			parameters: {  dbProperties: dataToNeo4j(cls, fields) } // TODO: serialize nested objects/arrays
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

		/* the main query for deleting the node */
		await this.query(`
			MATCH (n)
			WHERE n.id IN [${dResources.map(property('id')).join(',')}]
			OPTIONAL MATCH (n)-[r]-()
			DELETE n, r
		`);

	}

	async getRelatedResources(relA, idA, options) {
		options = options || {};
		let cls = relA.relationshipClass;
		let relB = relA.codomain;

		let [l, r] = arrowEnds(relA);

		let queryEnd = (options.withoutRelationships)? ` RETURN B, [] as rels` : `
			OPTIONAL MATCH (B)-[r]-(C) 
			RETURN B, collect({rel: r, B: C, s: startNode(r).id}) as rels`;

		/* formulating and sending the query */
		let result = await this.query(`
			MATCH (A { id: ${idA} }) ${l}[rel: ${matchLabelsQueryFragment(cls).join('|')}]${r} (B)
			WHERE (${matchLabelsQueryFragment(relA.resourceClass, 'A').join(' OR ')})
			  AND (${matchLabelsQueryFragment(relB.resourceClass, 'B').join(' OR ')})
			${queryEnd}			
		`);

		return result.map(({B, rels}) => extractRelationshipFields(B, rels, options.withoutShortcuts));

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


	async getRelatedRelationships(relA, idA){
		let cls = relA.relationshipClass;
		let relB = relA.codomain;

		await this.assertResourcesExist(relA.resourceClass, [idA]);

		/* formulating and sending the query */
		let [l, r] = arrowEnds(relA);
		let result = await this.query(`
			MATCH (A { id: ${idA} }) ${l}[rel:${matchLabelsQueryFragment(cls).join(' |')}]${r} (B)
			WHERE (${matchLabelsQueryFragment(relA.resourceClass, 'A').join(' OR ')})
			  AND (${matchLabelsQueryFragment(relB.resourceClass, 'B').join(' OR ')})      
			RETURN A, rel, B
		`);

		/* integrate relationship data into the resource object */
		return result.map(({A, rel, B}) => ({
			...neo4jToData(cls, rel),
			1: neo4jToData(resources[A.class], A),
			2: neo4jToData(resources[B.class], B)
		}));
	}


	////////////////////////////////////////////////////
	//Relationships by ID                             //
	////////////////////////////////////////////////////
	async assertRelationshipsExist(cls, ids){
		/* eliminate duplication */
		ids = [...new Set(ids)];

		/* a query for checking existence of these relationships */

		let [{count}] = await this.query(`
			MATCH (A) -[rel:${matchLabelsQueryFragment(cls).join('|')}]-> (B) 
			WHERE rel.id IN [${ids.join(',')}]
			RETURN count(rel) AS count
		`);

		/* throw the 404 error if 'exists' is false */
		if (count < ids.length) {
			throw customError({
				status:  NOT_FOUND,
				class:   cls.name,
				ids:     ids,
				message: humanMsg`Not all specified ${cls.name} relationships with IDs '${ids.join(',')}' exist.`
			});
		}
	}

	//Assertions were removed from these functions to improve performance
	//It is job of server requestHandler to check that entities in request params exist

	async getSpecificRelationships(cls, ids){
		/* formulating and sending the query */
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
		/* get the current fields of the relationship */
		let [oldRelationship] = await this.getSpecificRelationships(cls, [id]);

		/* the main query for creating the resource */
		await this.query({
			statement: `
				MATCH () -[rel:${matchLabelsQueryFragment(cls).join('|')} { id: ${id} }]-> () 
				SET rel += {dbProperties}
			`,
			parameters: {  dbProperties: dataToNeo4j(cls, fields) } // TODO: serialize nested objects/arrays
		});
	}


    async replaceRelationshipByID(cls, id, fields){
		/* get the current fields of the relationship */
		let [oldRelationship] = await this.getSpecificRelationships(cls, [id]);

		/* the main query for creating the resource */
		await this.query({
			statement: `
				MATCH (A) -[old:${cls.name} { id: ${id} }]-> (B)
				MERGE (A) -[rel:${cls.name}]-> (B)
				SET rel      += {dbProperties}
				SET rel.id    = ${id}
				SET rel.class = "${cls.name}"
			`,
			parameters: {  dbProperties: dataToNeo4j(cls, fields) } // TODO: serialize nested objects/arrays
		});
    }


    async deleteRelationshipByID(cls, id){
		await this.assertRelationshipsExist(cls, [id]);

		await this.query(`
			MATCH () -[rel:${matchLabelsQueryFragment(cls).join('|')} {id: ${id}}]- () 
			DELETE rel
		`);
    }


    ////////////////////////////////////////////////////
	//Relationships by resources                      //
	////////////////////////////////////////////////////

	//Assertions were removed from these functions to improve performance
	//It is job of server requestHandler to check that entities in request params exist

	async getRelationships(relA, idA, idB){
		let cls = relA.relationshipClass;
		let relB = relA.codomain;

		/* formulating and sending the query */
		let [l, r] = arrowEnds(relA);
		let result = await this.query(`
			MATCH (A { id: ${idA} }) ${l}[rel:${matchLabelsQueryFragment(cls).join('|')}]${r} (B { id: ${idB} })
			WHERE (${matchLabelsQueryFragment(relA.resourceClass, 'A').join(' OR ')})
			  AND (${matchLabelsQueryFragment(relB.resourceClass, 'B').join(' OR ')})    
			RETURN A, rel, B
		`);

		/* integrate relationship data into the resource object */
		return result.map(({A, rel, B}) => ({
			...neo4jToData(cls, rel),
			1: neo4jToData(relA.resourceClass, A),
			2: neo4jToData(relB.resourceClass, B)}));
	}


	async addRelationship(relA, idA, idB, fields) {
		let cls = relA.relationshipClass;
		let relB = relA.codomain;

		await this[assertIdIsGiven](cls, fields);

		/* the main query for adding the new relationship */
		let [l, r] = arrowEnds(relA);
		await this.query({
			statement: `
				MATCH (A:${relA.resourceClass.name} { id: ${idA} }),
					  (B:${relB.resourceClass.name} { id: ${idB} })
				CREATE UNIQUE (A) ${l}[rel:${cls.name}]${r} (B)
				SET rel += {dbProperties}
				SET rel.class = "${cls.name}"
            `,
			parameters: {  dbProperties:  dataToNeo4j(cls, fields) } }
		);
	}

	async updateRelationship(relA, idA, idB, fields){
		let cls = relA.relationshipClass;
		let relB = relA.codomain;

		let [l, r] = arrowEnds(relA);

		/* formulating and sending the query */
		await this.query({
			statement: `
				MATCH (A { id: ${idA} }) ${l}[rel:${matchLabelsQueryFragment(cls).join('|')}]${r} (B { id: ${idB} })
			    WHERE (${matchLabelsQueryFragment(relA.resourceClass, 'A').join(' OR ')})
			  	  AND (${matchLabelsQueryFragment(relB.resourceClass, 'B').join(' OR ')})      	  
				SET rel += {dbProperties}
			`,
			parameters: {  dbProperties: dataToNeo4j(cls, fields) } // TODO: serialize nested objects/arrays
		});
	}

	async replaceRelationship(relA, idA, idB, fields){
		let cls = relA.relationshipClass;
		let relB = relA.codomain;

		/* formulating and sending the query */
		let [l, r] = arrowEnds(relA);
		/* the main query for creating the resource */
		await this.query({
			statement: `
				MATCH (A { id: ${idA} }), (B { id: ${idB} })
			    WHERE (${matchLabelsQueryFragment(relA.resourceClass, 'A').join(' OR ')})
			  	  AND (${matchLabelsQueryFragment(relB.resourceClass, 'B').join(' OR ')})    
			  	MERGE (A) ${l}[rel:${cls.name}]${r} (B)
				SET rel += {dbProperties}
				SET rel.class = "${cls.name}"    	  
			`,
			parameters: {  dbProperties: dataToNeo4j(cls, fields) } // TODO: serialize nested objects/arrays
		});
	}


	async deleteRelationship(relA, idA, idB) {

		let cls = relA.relationshipClass;
		let relB = relA.codomain;

		/* the main query for removing the relationship */
		let [l, r] = arrowEnds(relA);
		await this.query(`
			MATCH (A { id: ${idA} }) ${l}[rel:${matchLabelsQueryFragment(cls).join('|')}]${r} (B { id: ${idB} })
			WHERE (${matchLabelsQueryFragment(relA.resourceClass, 'A').join(' OR ')})
			  AND (${matchLabelsQueryFragment(relB.resourceClass, 'B').join(' OR ')})          
			DELETE rel
		`);
	}
}
