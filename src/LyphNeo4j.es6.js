////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* libraries */
import _, {difference, find, property} from 'lodash';
import isNull from 'lodash-bound/isNull';
import isUndefined from 'lodash-bound/isUndefined';
import isSet from 'lodash-bound/isSet';
import isArray from 'lodash-bound/isArray';
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
	relationshipQueryFragments,
	humanMsg,
	arrowMatch,
	extractIds
} from './utility.es6.js';
import {
	sustainingRelationships,
	anchoringRelationships,
	relationships,
	resources
} from './resources.es6.js';
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
const runClassSpecificHook                = Symbol('runClassSpecificHook');
const assertRelatedResourcesExists        = Symbol('assertRelatedResourcesExists');
const assertRequiredFieldsAreGiven        = Symbol('assertRequiredFieldsAreGiven');
const assertProperCardinalityInFields     = Symbol('assertProperCardinalityInFields');
const assertReferencedResourcesExist      = Symbol('assertReferencedResourcesExist');
const createAllResourceRelationships      = Symbol('createAllResourceRelationships');
const removeUnspecifiedRelationships      = Symbol('removeUnspecifiedRelationships');
const getResourcesToDelete                = Symbol('getResourcesToDelete');
const anythingAnchoredFromOutside         = Symbol('anythingAnchoredFromOutside');
const createRelationshipSet		          = Symbol('createRelationshipSet');
const removeRelationshipSet		          = Symbol('removeRelationshipSet');

/* The LyphNeo4j class */
export default class LyphNeo4j extends Neo4j {

	////////////////////////////////////////////
	// Common functionality for other methods //
	////////////////////////////////////////////

	async [runClassSpecificHook](cls, hook, info) {
		if (!cls[hook]::isUndefined()) {
			return or(await cls[hook]({...info, resources, relationships, db: this}), {});
		}
	}

	
	async [assertRelatedResourcesExists](ids, fieldSpec) {
		let cls = fieldSpec.codomain.resourceClass;

		let [{existing}] = await this.query(`
			MATCH (n:${cls.name})
			WHERE n.id IN [${ids.join(',')}]
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

		//TODO - remove later: ids will eb assigned by server, not model library
		//id is not required according to the manifest but we require id before commit to DB
		if (!fields.id::isNumber()) {
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

	
	async [assertProperCardinalityInFields](cls, fields) {
		let allRelationFields = Object.entries(cls.relationships);
		for (let [fieldName, fieldSpec] of allRelationFields) {
		    let val = fields[fieldName];
			let cardinality =
				val::isUndefined() ? 0:
				val::isArray()     ? val.length :
				val::isSet()       ? val.size   : 1;
			if ((cardinality < fieldSpec.cardinality.min) || (cardinality > (fieldSpec.cardinality.max || Infinity))){
				throw customError({
					status:  BAD_REQUEST,
					class:   cls.name,
					field:   fieldName,
					message: humanMsg`
						The '${fieldName}' of class '${cls.name}' expects cardinality 
						${fieldSpec.cardinality.min}..${fieldSpec.cardinality.max || '*'}.
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
			this[createRelationshipSet](fieldName, val);
		}
	}


	async [removeUnspecifiedRelationships](cls, id, fields, {includeUngivenFields = false} = {}) {
		let relDeletionStatements = [];
		for (let fieldName of Object.keys(fields).filter((key) => (cls.relationships[key]))){
			let val = fields[fieldName]; //-->HasLayer
            if (val::isUndefined() || val::isNull()) { continue }

            val = _(val).mapValues((x) => (x.value)).value();
			let ids = extractIds(val);

            console.log("Removing ", ids);
            let fieldSpec = cls.relationships[fieldName];

			let [l, r] = arrowEnds(fieldSpec);
            await this.query(`
				MATCH (A:${cls.name} { id: ${id} }) 
            ${l}[rel:${fieldSpec.relationshipClass.name}]${r} 
			 	(B:${fieldSpec.codomain.resourceClass.name})
			 	WHERE NOT B.id IN [${ids.join(', ')}]
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

		/* traverse graph to find nodes to delete, based on 'sustaining' relationships */
		const symmetricSustaining = sustainingRelationships.filter((relA) =>  relA.symmetric);
		const l2rSustaining       = sustainingRelationships.filter((relA) => !relA.symmetric && relA.keyInRelationship === 1);
		const r2lSustaining       = sustainingRelationships.filter((relA) => !relA.symmetric && relA.keyInRelationship === 2);
		const recurse = async ({cls, id}) => {
			if (markedNodes.has(id)) { return }
			markedNodes.set(id, { cls, id });
			let nResources = await this.query(`
				MATCH (a:${cls.name} { id: ${id} })
				${arrowMatch(symmetricSustaining, 'a', ' -','- ', 'x')}
				${arrowMatch(l2rSustaining,       'a', ' -','->', 'y')}
				${arrowMatch(r2lSustaining,       'a', '<-','- ', 'z')}
				WITH ${symmetricSustaining.length ? 'collect(x)' : '[]'} +
				     ${l2rSustaining      .length ? 'collect(y)' : '[]'} +
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


	async [anythingAnchoredFromOutside](ids) {
		const symmetricAnchoring = anchoringRelationships.filter((relA) =>  relA.symmetric);
		const l2rAnchoring       = anchoringRelationships.filter((relA) => !relA.symmetric && relA.keyInRelationship === 1);
		const r2lAnchoring       = anchoringRelationships.filter((relA) => !relA.symmetric && relA.keyInRelationship === 2);
		return await this.query(`
			WITH [${ids.join(',')}] AS ids
			${ symmetricAnchoring.length ? `
				OPTIONAL MATCH (x) -[:${symmetricAnchoring.map(({relationship:{name}})=>name).join('|')}]- (a)
				WHERE (NOT x.id in ids) AND (a.id in ids)
				WITH ids, collect({ anchoring: x.id, anchored: a.id }) AS anchors1
			` : 'WITH ids, [] AS anchors1' }
			${ l2rAnchoring.length ? `
				OPTIONAL MATCH (y) -[:${l2rAnchoring.map(({relationship:{name}})=>name).join('|')}]-> (b)
				WHERE (NOT y.id in ids) AND (b.id in ids)
				WITH ids, anchors1 + collect({ anchoring: y.id, anchored: b.id }) AS anchors2
			` : 'WITH ids, anchors1 AS anchors2' }
			${ r2lAnchoring.length ? `
				OPTIONAL MATCH (z) <-[:${r2lAnchoring.map(({relationship:{name}})=>name).join('|')}]- (c)
				WHERE (NOT z.id in ids) AND (c.id in ids)
				WITH ids, anchors2 + collect({ anchoring: z.id, anchored: c.id }) AS anchors3
			` : 'WITH ids, anchors2 AS anchors3' }
			UNWIND anchors3 AS n
			WITH DISTINCT n
			WHERE n.anchoring IS NOT NULL
			RETURN DISTINCT n
		`).then(pluckData('n'));
	}

    //////////////////////////////////////////////////////
    // Operations on relationships                      //
    //////////////////////////////////////////////////////


    async [createRelationshipSet](fieldName, relSet) {
        for (let rel of [...relSet]){

            //Skip more general collections, only create top most relationships
            //Relationships to create have to correspond to the relationship field, e.g., -->HasLayer vs HasLayer
            if (fieldName.substring(3) !== rel.class){ continue; }

            const resA = rel[1], resB = rel[2];
            if (resA.id::isUndefined() || resB.id::isUndefined()) { continue }

            let cls = relationships[rel.class];

            let dbProperties = dataToNeo4j(cls, _(rel.fields).mapValues((x) => (x.value)).value());
            await this.query(
                {statement: `
                    MATCH (A:${resA.class} { id: ${resA.id} }), (B:${resB.class} { id: ${resB.id} })
                    CREATE UNIQUE (A) -[rel:${rel.class}]-> (B)
                    SET rel += {dbProperties}
                `,
                    parameters: {  dbProperties: dbProperties } }
            );
        }
    }


    async [removeRelationshipSet](relSet) {
        for (let rel of [...relSet]){
            let resA = rel[1], resB = rel[2];
            if (resA.id::isUndefined() || resB.id::isUndefined()) { continue }

            //TODO: collect relationship ids and write 1 query?
            await this.query(`
                MATCH (A:${resA.class} { id: ${resA.id} }), 
                       -[rel:${rel.class}]-> 
                      (B:${resB.class} { id: ${resB.id} })
                DELETE rel`
            );
        }
    }


	//////////////////////////////////////////////////////
	// Main methods used directly for lyph-server calls //
	//////////////////////////////////////////////////////

	async assertResourcesExist(cls, ids) {

		/* is there a hook to completely replace entity retrieval? */
		let result = await this[runClassSpecificHook](cls, 'assertResourcesExist', { ids });
		if (result) { return result::isArray() ? result : [result] }

		/* eliminate duplication */
		ids = [...new Set(ids)];

		/* a query for checking existence of these resources */

		let [{count}] = await this.query(`
			MATCH (n:${cls.name})
			WHERE n.id IN [${ids.join(',')}]
			RETURN count(n) AS count
		`);

		/* throw the 404 error if 'exists' is false */
		if (count < ids.length) {
			throw customError({
				status:  NOT_FOUND,
				class:   cls.name,
				ids:     ids,
				message: humanMsg`Not all specified ${cls.plural} with IDs '${ids.join(',')}' exist.`
			});
		}
	}

	
	async getSpecificResources(cls, ids) {

		/* is there a hook to completely replace entity retrieval? */
		let result = await this[runClassSpecificHook](cls, 'getSpecific', { ids });
		if (result) { return result::isArray() ? result : [result]}

		/* throw a 404 if any of the resources don't exist */
		await this.assertResourcesExist(cls, ids);

		/* preparing the part of the query that adds relationship info */
		let {optionalMatches, objectMembers} = relationshipQueryFragments(cls, 'n');

		/* formulating and sending the query */
		let results = await this.query(`
			UNWIND [${ids.join(',')}] AS id WITH id
			MATCH (n:${cls.name} { id: id })
			${optionalMatches.join(' ')}
			RETURN n, { ${objectMembers.join(', ')} } AS rels
		`);

		/* integrate relationship data into the resource object */
		results = results.map(({n, rels}) => Object.assign(n, rels)).map((res) => neo4jToData(cls, res));

		/* return results in proper order */
		return ids.map((id1) => results.find(({id}) => id1 === id));
	}

	
	async getAllResources(cls) {

		/* is there a hook to completely replace entity retrieval? */
		let result = await this[runClassSpecificHook](cls, 'getAll', {});
		if (result) { return result }

		/* preparing the part of the query that adds relationship info */
		let {optionalMatches, objectMembers} = relationshipQueryFragments(cls, 'n');

		/* formulating and sending the query */
		let results = await this.query(`
			MATCH (n:${cls.name})
			${optionalMatches.join(' ')}
			RETURN n, { ${objectMembers.join(', ')} } AS rels
		`);

		/* integrate relationship data into the resource object */
		let fields = results.map(({n, rels}) => Object.assign(n, rels)).map((res) => neo4jToData(cls, res));
        return fields;

        //Restore model library objects ?
        //return fields.map(fields => resources[n.class].new(fields));

	}


	/////////////////////////////////////////////////////////////////////////

	async createResource(cls, fields) {

		/* is there a hook to completely replace entity creation? */
		let id = await this[runClassSpecificHook](cls, 'create', { fields });
		if (id) { return id }

		/* if given, run a class-specific hook */
		await this[runClassSpecificHook](cls, 'beforeCreate', { fields });

		/* assert that all required fields are given */
		await this[assertRequiredFieldsAreGiven](cls, fields);

		/* if relationship cardinality is confused in the request, error out */
		await this[assertProperCardinalityInFields](cls, fields);

		/* for all relationships specified in the request, assert that those resources exist */
		await this[assertReferencedResourcesExist](cls, fields);


        //Create resources with given ids
		[{id}] = await this.creationQuery(() => ({
			statement: `
				CREATE (n:${cls.name})
				SET n += {dbProperties}
				RETURN n.id as id
			`,
			parameters: {  dbProperties: dataToNeo4j(cls, fields) } // TODO: serialize nested objects/arrays
		}));

		/* create the required relationships */
		await this[createAllResourceRelationships](cls, id, fields);

		/* if given, run a class-specific hook */
		await this[runClassSpecificHook](cls, 'afterCreate', { id, fields });

		return id;
	}


	async updateResource(cls, id, fields) {

		/* is there a hook to completely replace entity updates? */
		let hooked = await this[runClassSpecificHook](cls, 'update', { id, fields });
		if (hooked) { return }

		/* get the current fields of the resource */
		let [oldResource] = await this.getSpecificResources(cls, [id]);

		/* if given, run a class-specific hook */
		await this[runClassSpecificHook](cls, 'beforeUpdate', { id, oldResource, fields });

		/* if relationship cardinality is confused in the request, error out */
		await this[assertProperCardinalityInFields](cls, fields);

		/* for all relationships specified in the request, assert that those resources exist */
		await this[assertReferencedResourcesExist](cls, fields);

		/* the main query for creating the resource */
		await this.query({
			statement: `
				MATCH (n:${cls.name} { id: ${id} })
				SET n      += {dbProperties}
				SET n.id    =  ${id}
				SET n.class = "${cls.name}"
			`,
			parameters: {  dbProperties: dataToNeo4j(cls, fields) } // TODO: serialize nested objects/arrays
		});

		/* remove the relationships explicitly left out */
		await this[removeUnspecifiedRelationships](cls, id, fields);

		/* create the required relationships */
		await this[createAllResourceRelationships](cls, id, fields);

		/* if given, run a class-specific hook */
		await this[runClassSpecificHook](cls, 'afterUpdate', { id, oldResource, fields });
	}


	async replaceResource(cls, id, fields) {

		/* is there a hook to completely replace entity replacement? */
		let hooked = await this[runClassSpecificHook](cls, 'replace', { id, fields });
		if (hooked) { return }

		/* get the current fields of the resource */
		let [oldResource] = await this.getSpecificResources(cls, [id]);

		/* if given, run a class-specific hook */
		await this[runClassSpecificHook](cls, 'beforeReplace', { id, oldResource, fields });

		/* assert that all required fields are given */
		await this[assertRequiredFieldsAreGiven](cls, fields);

		/* if relationship cardinality is confused in the request, error out */
		await this[assertProperCardinalityInFields](cls, fields);

		/* for all relationships specified in the request, assert that those resources exist */
		await this[assertReferencedResourcesExist](cls, fields);

		/* the main query for creating the resource */
		await this.query({
			statement: `
				MATCH (n:${cls.name} { id: ${id} })
				SET n      = {dbProperties}
				SET n.id   =  ${id}
				SET n.class = "${cls.name}"
			`,
			parameters: {  dbProperties: dataToNeo4j(cls, fields) } // TODO: serialize nested objects/arrays
		});

		/* remove the relationships explicitly left out */
		await this[removeUnspecifiedRelationships](cls, id, fields, { includeUngivenFields: true });

		/* create the required relationships */
		await this[createAllResourceRelationships](cls, id, fields);

		/* if given, run a class-specific hook */
		await this[runClassSpecificHook](cls, 'afterReplace', { id, oldResource, fields });
	}


	async deleteResource(cls, id) {

		/* is there a hook to completely replace entity deletion? */
		let hooked = await this[runClassSpecificHook](cls, 'delete', { id });
		if (hooked) { return }

		/* get all ids+classes that would be auto-deleted by deleting this particular node */
		let dResources = await this[getResourcesToDelete](cls, id);

		/* then test whether of those are still anchored, and we have to abort the delete operation */
		let anchors = await this[anythingAnchoredFromOutside](dResources.map(property('id')));
		if (anchors.length > 0) {
			throw customError({
				status: CONFLICT,
				anchors,
				message: humanMsg`
					Certain resources would need to be deleted in response to this request,
					but they are being kept alive by other resources.
				`
			});
		}

		// TODO: delete one at a time so that hooks are called properly
		// TODO: also query the connected relationships first, and delete those with the individual function too
		// TODO: provide 'oldResource' in hooks

		/* if given, run a class-specific hook */
		await Promise.all(dResources.reverse().map(({id: dId, cls: dClass}) =>
				this[runClassSpecificHook](dClass, 'beforeDelete', { id: dId })));

		/* the main query for deleting the node */
		await this.query(`
			MATCH (n)
			WHERE n.id IN [${dResources.map(property('id')).join(',')}]
			OPTIONAL MATCH (n)-[r]-()
			DELETE n, r
		`);

		/* if given, run a class-specific hook */
		await Promise.all(dResources.reverse().map(({id: dId, cls: dClass}) =>
				this[runClassSpecificHook](dClass, 'afterDelete', { id: dId })));

	}


	async getRelatedResources(relA, idA) {
		let cls = relA.relationshipClass;
		let relB = relA.codomain;

		/* formulating and sending the query */
		let {optionalMatches, objectMembers} = relationshipQueryFragments(relB, 'B');
		let [l, r] = arrowEnds(relA);

		let results = await this.query(`
			MATCH (A:${relA.resourceClass.name} { id: ${idA} })
			      ${l}[:${cls.name}]${r}
			      (B:${relB.resourceClass.name})
			${optionalMatches.join(' ')}
			RETURN B, { ${objectMembers.join(', ')} } AS rels
		`);

		/* integrate relationship data into the resource object */
		return results.map(({B, rels}) => Object.assign(B, rels)).map((res) => neo4jToData(relB, res));

	}

	
	async addNewRelatedResource(relA, idA, idB /*, fields */) {
	    console.log("Adding new relationship!!!");

		let cls = relA.relationshipClass;
		let relB = relA.codomain;

		/* throw a 404 if either of the resources doesn't exist */
		await Promise.all([
			this.assertResourcesExist(relA.resourceClass, [idA]),
			this.assertResourcesExist(relB.resourceClass, [idB])
		]);

		// TODO: check whether adding or deleting any relationships below violates any constraints
		// TODO: maybe an existing relationship with idB needs to be deleted because this one is added

		/* the main query for adding the new relationship */
		let [l, r] = arrowEnds(relA);
		await this.query(`
			MATCH (A:${relA.resourceClass.name} { id: ${idA} }),
			      (B:${relB.resourceClass.name} { id: ${idB} })
			CREATE UNIQUE (A) ${l}[:${cls.name}]${r} (B)
		`);

        //TODO add relationship properties
        // let dbProperties = dataToNeo4j(cls, fields || {});
        //
        // await this.query(
        //     {statement: `
        //             MATCH (A:${relA.resourceClass.name} { id: ${idA} }),
        //                   (B:${relB.resourceClass.name} { id: ${idB} })
        //             CREATE UNIQUE (A) ${l}[rel:${cls.name}]${r} (B)
        //             SET rel += {dbProperties}
        //         `,
        //         parameters: {  dbProperties: dbProperties } }
        // );
	}

	
	async deleteRelatedResource(relA, idA, idB) {

		let cls = relA.relationshipClass;
		let relB = relA.codomain;

		/* throw a 404 if either of the resources doesn't exist */
		await Promise.all([
			this.assertResourcesExist(relA.resourceClass, [idA]),
			this.assertResourcesExist(relB.resourceClass, [idB])
		]);

		// TODO: check whether deleting this relationship violates any constraints

		/* the main query for removing the relationship */
		let [l, r] = arrowEnds(relA);

		await this.query(`
			MATCH (A:${relA.resourceClass.name} { id: ${idA} })
			      ${l}[rel:${cls.name}]${r}
			      (B:${relB.resourceClass.name} { id: ${idB} })
			DELETE rel
		`);
	}


	///////////////////////////////////////////////////////////////
    //Operations with relationships                              //
    ///////////////////////////////////////////////////////////////

    //TODO test
    async getAllRelationships(cls) {

        /* is there a hook to completely replace entity retrieval? */
        let result = await this[runClassSpecificHook](cls, 'getAll', {});
        if (result) { return result }

        /* formulating and sending the query */
        let data = await this.query(`
			MATCH (A) -[rel:${cls.name}]-> (B) RETURN resA, rel, resB
		`);

        let results = data;
        for (let {resA, rel, resB} of data){
            let resAClass = resources[resA.class];
            let relClass  = relationships[rel.class];
            let resBClass = resources[resB.class];

            if (resAClass::isUndefined() || resBClass::isUndefined() || relClass::isUndefined()) { continue }

            let restoredRel = relClass.new({1: resA, 2: resB, ...rel});

        }
        console.log(results);

        return results;
    }


    //TODO implement
    async getSpecificRelationships(cls, ids){

    }

    //TODO test
    async assertRelationshipsExist(cls, ids){
        /* is there a hook to completely replace entity retrieval? */
        let result = await this[runClassSpecificHook](cls, 'assertrelationshipsExist', { ids });
        if (result) { return result::isArray() ? result : [result] }

        /* eliminate duplication */
        ids = [...new Set(ids)];

        /* a query for checking existence of these relationships */

        let [{count}] = await this.query(`
			MATCH (A) -[rel:${cls.name}]-> (B) 
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


    async addRelationship(cls, idA, fields){}


    async updateRelationship(cls, id, fields){}


    async replaceRelationship(cls, id, fields){

    }

    async deleteRelationship(cls, id){

    }

    async getRelatedRelationships(cls, id){

    }

}
