////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* libraries */
import _, {isUndefined, difference, find, property} from 'lodash';
import isSet from 'lodash-bound/isSet';
import isArray from 'lodash-bound/isArray';

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
	arrowMatch
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
const runTypeSpecificHook                 = Symbol('runTypeSpecificHook');
const assertRelatedResourcesExists        = Symbol('assertRelatedResourcesExists');
const assertRequiredFieldsAreGiven        = Symbol('assertRequiredFieldsAreGiven');
const assertProperCardinalityInFields     = Symbol('assertProperCardinalityInFields');
const assertReferencedResourcesExist      = Symbol('assertReferencedResourcesExist');
const createSpecifiedRelationships        = Symbol('createSpecifiedRelationships');
const removeUnspecifiedRelationships      = Symbol('removeUnspecifiedRelationships');
const getResourcesToDelete                = Symbol('getResourcesToDelete');
const anythingAnchoredFromOutside         = Symbol('anythingAnchoredFromOutside');

/* The LyphNeo4j class */
export default class LyphNeo4j extends Neo4j {

	////////////////////////////////////////////
	// Common functionality for other methods //
	////////////////////////////////////////////

	async [runTypeSpecificHook](type, hook, info) {
		if (!isUndefined(type[hook])) {
			return or(await type[hook]({...info, resources, relationships, db: this}), {});
		}
	}

	//NK modified
	async [assertRelatedResourcesExists](ids, fieldSpec) {
		let type = fieldSpec.codomain.resourceClass;
		let q = `
			MATCH (n:${type.name})
			WHERE n.id IN [${ids.join(',')}]
			RETURN collect(n.id) as existing
		`;
		console.log("NK TEST (assertRelatedResourcesExists.query)", q);

		let [{existing}] = await this.query(q);
		let nonexisting = difference(ids, existing);
		if (nonexisting.length > 0) {
			let c = (fieldSpec.cardinality.max === 1) ? 'singular' : 'plural';
			throw customError({
				status:  NOT_FOUND,
				type:    type.name,
				ids:     nonexisting,
				...((c === 'singular') ? { id: nonexisting[0] } : {}),
				message: humanMsg`
					The specified ${type[c]}
					${nonexisting.join(',')}
					${(c === 'singular') ? 'does' : 'do'} not exist.
				`
			});
		}
	}

	//NK modified
	async [assertRequiredFieldsAreGiven](type, fields) {
		let allFields = Object.entries(Object.assign({}, type.properties, type.relationshipShortcuts));
		for (let [fieldName, fieldSpec] of allFields) {
			if (fieldSpec.required && isUndefined(fields[fieldName])) {
				throw customError({
					status: BAD_REQUEST,
					type:   type.name,
					field:  fieldName,
					message: humanMsg`
						You tried to create a new ${type.singular},
						but the required field '${fieldName}' was not given.
					`
				});
			}
		}
	}

	//NK modified
	async [assertProperCardinalityInFields](type, fields) {
		let allRelationFields = Object.entries(type.relationshipShortcuts);
		for (let [fieldName, fieldSpec] of allRelationFields) {
			let value = fields[fieldName];
			let cardinality =
				isUndefined(value)? 0:
				(value::isArray())? value.length:
				(value::isSet())? value.size: 1;
			if ((cardinality < fieldSpec.cardinality.min) || (cardinality > (fieldSpec.cardinality.max || Infinity))){
				throw customError({
					status:  BAD_REQUEST,
					type:    type.name,
					field:   fieldName,
					message: humanMsg`
						The '${fieldName}' expects cardinality 
						${fieldSpec.cardinality.min}..${fieldSpec.cardinality.max || '*'}.
					`
				});
			}
		}
	}

	//NK modified
	async [assertReferencedResourcesExist](type, fields) {
		let allRelationFields = Object.entries(type.relationshipShortcuts);
		for (let [fieldName, fieldSpec] of allRelationFields) {
			let val = fields[fieldName];
			if (isUndefined(val)) continue;
			if (val::isSet()) val = Object.entries(val);
			try { this[assertRelatedResourcesExists](fields[fieldName].filter(x => x.id).map(x => x.id), fieldSpec) }
			catch (err) {
				Object.assign(err, {
					type: type,
					field: fieldName
				});
				throw err;
			}
		}
	}

	//NK modified
	async [createSpecifiedRelationships](type, id, fields) {
		let allRelationFields = Object.entries(type.relationshipShortcuts);
		let relCreationStatements = [];
		for (let [fieldName, fieldSpec] of allRelationFields){
			let val = fields[fieldName];
			if (isUndefined(val)) continue;
			if (val::isSet()) val = Object.entries(val);
			let ids = val.filter(x => x.id).map(x => x.id);
			let [l, r] = arrowEnds(fieldSpec); //TODO check that the right variable is called
			for (let idB of ids){
				let q = `MATCH (A:${type.name} { id: ${id} }), (B:${fieldSpec.resourceClass.name} { id: ${idB} })
			 		CREATE (A) ${l}[:${rel.relationship.name}]${r} (B)`;
				relCreationStatements.push(q);
			}
		}
		if (relCreationStatements.length > 0) {
			console.log("NK TEST relCreationStatements:", relCreationStatements);
			await this.query(relCreationStatements);
		}
	}

	//NK modified
	async [removeUnspecifiedRelationships](type, id, fields, {includeUngivenFields = false} = {}) {
		let allRelationFields = Object.entries(type.relationshipShortcuts);
		let relDeletionStatements = [];
		for (let [fieldName, fieldSpec] of allRelationFields) {
			let val = fields[fieldName];
			if (isUndefined(val)) continue;
			let [l, r] = arrowEnds(fieldSpec);
			var q = `MATCH (A:${type.name} { id: ${id} }) ${l}[rel:${fieldSpec.relationshipClass.name}]${r} 
			 	(B:${fieldSpec.codomain.resourceClass.name})
			 	WHERE NOT B.id IN [${ids.join(', ')}]
			 	DELETE rel`;
			console.log("NK TEST removeUnspecifiedRelationships.query", q);
			relDeletionStatements.push(q);
		}
		if (relDeletionStatements.length > 0) {
			await this.query(relDeletionStatements);
		}
	}

	async [getResourcesToDelete](type, id) {
		/* collect nodes to delete */
		let markedNodes = new Map();

		/* traverse graph to find nodes to delete, based on 'sustaining' relationships */
		/*const symmetricSustaining = sustainingRelationships.filter((relA) =>  relA.symmetric);
		const l2rSustaining       = sustainingRelationships.filter((relA) => !relA.symmetric && relA.side === 1);
		const r2lSustaining       = sustainingRelationships.filter((relA) => !relA.symmetric && relA.side === 2);
		const recurse = async ({type, id}) => {
			if (markedNodes.has(id)) { return }
			markedNodes.set(id, { type, id });
			let nResources = await this.query(`
				MATCH (a:${type.name} { id: ${id} })
				${arrowMatch(symmetricSustaining, 'a', ' -','- ', 'x')}
				${arrowMatch(l2rSustaining,       'a', ' -','->', 'y')}
				${arrowMatch(r2lSustaining,       'a', '<-','- ', 'z')}
				WITH ${symmetricSustaining.length ? 'collect(x)' : '[]'} +
				     ${l2rSustaining      .length ? 'collect(y)' : '[]'} +
				     ${r2lSustaining      .length ? 'collect(z)' : '[]'} AS coll UNWIND coll AS n
				WITH DISTINCT n
				RETURN { id: n.id, type: n.type } AS n
			`).then(pluckData('n'));
			await Promise.all(nResources.map(({id, type}) => ({id, type: resources[type]})).map(recurse));
		};
		await recurse({ type, id });*/

		/* return the nodes that would be deleted */
		return [...markedNodes.values()];

	}

	async [anythingAnchoredFromOutside](ids) {
		/*const symmetricAnchoring = anchoringRelationships.filter((relA) =>  relA.symmetric);
		const l2rAnchoring       = anchoringRelationships.filter((relA) => !relA.symmetric && relA.side === 1);
		const r2lAnchoring       = anchoringRelationships.filter((relA) => !relA.symmetric && relA.side === 2);
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
		`).then(pluckData('n'));*/
	}


	//////////////////////////////////////////////////////
	// Main methods used directly for lyph-server calls //
	//////////////////////////////////////////////////////

	async assertResourcesExist(type, ids) {

		/* is there a hook to completely replace entity retrieval? */
		let result = await this[runTypeSpecificHook](type, 'assertResourcesExist', { ids });
		if (result) { return result::isArray() ? result : [result] }

		/* eliminate duplication */
		ids = [...new Set(ids)];

		/* a query for checking existence of these resources */
		let [{count}] = await this.query(`
			MATCH (n:${type.name})
			WHERE n.id IN [${ids.join(',')}]
			RETURN count(n) AS count
		`);
		/* throw the 404 error if 'exists' is false */
		if (count < ids.length) {
			throw customError({
				status:  NOT_FOUND,
				type:    type.name,
				ids:     ids,
				message: humanMsg`Not all specified ${type.plural} exist.` // TODO: make more specific
			});
		}
	}

	//NK modified
	async getSpecificResources(type, ids) {

		/* is there a hook to completely replace entity retrieval? */
		let result = await this[runTypeSpecificHook](type, 'getSpecific', { ids });
		if (result) { return result::isArray() ? result : [result]}

		/* throw a 404 if any of the resources don't exist */
		await this.assertResourcesExist(type, ids);

		/* preparing the part of the query that adds relationship info */
		let {optionalMatches, objectMembers} = relationshipQueryFragments(type, 'n');

		/* formulating and sending the query */
		let results = await this.query(`
			UNWIND [${ids.join(',')}] AS id WITH id
			MATCH (n:${type.name} { id: id })
			${optionalMatches.join(' ')}
			RETURN n, { ${objectMembers.join(', ')} } AS rels
		`);

		/* integrate relationship data into the resource object */
		results = results.map(({n, rels}) => Object.assign(n, rels)).map((res) => neo4jToData(type, res));

		console.log("NK OK3: specific resources extracted");

		/* return results in proper order */
		return ids.map((id1) => results.find(({id}) => id1 === id));

	}

	//NK modified
	async getAllResources(type) {

		/* is there a hook to completely replace entity retrieval? */
		let result = await this[runTypeSpecificHook](type, 'getAll', {});
		if (result) { return result }

		/* preparing the part of the query that adds relationship info */
		let {optionalMatches, objectMembers} = relationshipQueryFragments(type, 'n');

		/* formulating and sending the query */
		let results = await this.query(`
			MATCH (n:${type.name})
			${optionalMatches.join(' ')}
			RETURN n, { ${objectMembers.join(', ')} } AS rels
		`);

		console.log("NK OK4: all resources extracted");

		/* integrate relationship data into the resource object */
		return results.map(({n, rels}) => Object.assign(n, rels)).map((res) => neo4jToData(type, res));

	}

	//NK: modified
	async createResource(type, fields) {
		console.log("Creating resource for given fields ", fields);

		/* is there a hook to completely replace entity creation? */
		let id = await this[runTypeSpecificHook](type, 'create', { fields });
		if (id) { return id }

		/* if given, run a type-specific hook */
		await this[runTypeSpecificHook](type, 'beforeCreate', { fields });

		/* assert that all required fields are given */
		await this[assertRequiredFieldsAreGiven](type, fields);

		/* if relationship cardinality is confused in the request, error out */
		await this[assertProperCardinalityInFields](type, fields);

		/* for all relationships specified in the request, assert that those resources exist */
		await this[assertReferencedResourcesExist](type, fields);

		let dbProperties = dataToNeo4j(type, fields);
		console.log("NK TEST createResource: dbProperties", dbProperties);

		/* the main query for creating the resource */
		[{id}] = await this.creationQuery(({withNewId}) => ({
			statement: `
				${withNewId('newID')}
				CREATE (n:${type.name} { id: newID, type: "${type.name}" })
				SET n += {dbProperties}
				RETURN newID as id
			`,
			parameters: {  dbProperties: dbProperties } // TODO: serialize nested objects/arrays
		}));

		/* create the required relationships */
		await this[createSpecifiedRelationships](type, id, fields);

		/* if given, run a type-specific hook */
		await this[runTypeSpecificHook](type, 'afterCreate', { id, fields });

		console.log("NK OK1: resource created!", id);
		return id;
	}

	//NK modified
	async updateResource(type, id, fields) {

		/* is there a hook to completely replace entity updates? */
		let hooked = await this[runTypeSpecificHook](type, 'update', { id, fields });
		if (hooked) { return }

		/* get the current fields of the resource */
		let [oldResource] = await this.getSpecificResources(type, [id]);

		/* if given, run a type-specific hook */
		await this[runTypeSpecificHook](type, 'beforeUpdate', { id, oldResource, fields });

		/* if relationship cardinality is confused in the request, error out */
		await this[assertProperCardinalityInFields](type, fields);

		/* for all relationships specified in the request, assert that those resources exist */
		await this[assertReferencedResourcesExist](type, fields);

		//NK TODO: handle relationship shortcust
		let dbProperties = dataToNeo4j(type, fields);
		console.log("NK TEST updateResource: dbProperties", dbProperties);

		/* the main query for creating the resource */
		await this.query({
			statement: `
				MATCH (n:${type.name} { id: ${id} })
				SET n     += {dbProperties}
				SET n.id   =  ${id}
				SET n.type = "${type.name}"
			`,
			parameters: {  dbProperties: dbProperties } // TODO: serialize nested objects/arrays
		});

		/* remove the relationships explicitly left out */
		await this[removeUnspecifiedRelationships](type, id, fields);

		/* create the required relationships */
		await this[createSpecifiedRelationships](type, id, fields);

		/* if given, run a type-specific hook */
		await this[runTypeSpecificHook](type, 'afterUpdate', { id, oldResource, fields });

	}

	//NK modified
	async replaceResource(type, id, fields) {

		/* is there a hook to completely replace entity replacement? */
		let hooked = await this[runTypeSpecificHook](type, 'replace', { id, fields });
		if (hooked) { return }

		/* get the current fields of the resource */
		let [oldResource] = await this.getSpecificResources(type, [id]);

		/* if given, run a type-specific hook */
		await this[runTypeSpecificHook](type, 'beforeReplace', { id, oldResource, fields });

		/* assert that all required fields are given */
		await this[assertRequiredFieldsAreGiven](type, fields);

		/* if relationship cardinality is confused in the request, error out */
		await this[assertProperCardinalityInFields](type, fields);

		/* for all relationships specified in the request, assert that those resources exist */
		await this[assertReferencedResourcesExist](type, fields);

		//NK TODO: handle relationship shortcuts

		let dbProperties = dataToNeo4j(type, fields);
		console.log("NK TEST replaceResource: dbProperties", dbProperties);

		/* the main query for creating the resource */
		await this.query({
			statement: `
				MATCH (n:${type.name} { id: ${id} })
				SET n      = {dbProperties}
				SET n.id   =  ${id}
				SET n.type = "${type.name}"
			`,
			parameters: {  dbProperties: dbProperties } // TODO: serialize nested objects/arrays
		});

		/* remove the relationships explicitly left out */
		await this[removeUnspecifiedRelationships](type, id, fields, { includeUngivenFields: true });

		/* create the required relationships */
		await this[createSpecifiedRelationships](type, id, fields);

		/* if given, run a type-specific hook */
		await this[runTypeSpecificHook](type, 'afterReplace', { id, oldResource, fields });

	}

	async deleteResource(type, id) {

		/* is there a hook to completely replace entity deletion? */
		let hooked = await this[runTypeSpecificHook](type, 'delete', { id });
		if (hooked) { return }

		/* get all ids+types that would be auto-deleted by deleting this particular node */
		let dResources = await this[getResourcesToDelete](type, id);

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

		/* if given, run a type-specific hook */
		await Promise.all(dResources.reverse().map(({id: dId, type: dType}) =>
				this[runTypeSpecificHook](dType, 'beforeDelete', { id: dId })));

		/* the main query for deleting the node */
		await this.query(`
			MATCH (n)
			WHERE n.id IN [${dResources.map(property('id')).join(',')}]
			OPTIONAL MATCH (n)-[r]-()
			DELETE n, r
		`);

		/* if given, run a type-specific hook */
		await Promise.all(dResources.reverse().map(({id: dId, type: dType}) =>
				this[runTypeSpecificHook](dType, 'afterDelete', { id: dId })));

	}

	//NK modified
	async getRelatedResources(relA, idA) {
		let type = relA.relationshipClass;
		let relB = relA.codomain;

		console.log("NK deleteRelationship.relA", relA);
		console.log("NK deleteRelationship.type", type);
		console.log("NK deleteRelationship.relB", relB);


		/* formulating and sending the query */
		let {optionalMatches, objectMembers} = relationshipQueryFragments(relB, 'B');
		let [l, r] = arrowEnds(relA);
		let q  = `
			MATCH (A:${relA.name} { id: ${idA} })
			      ${l}[:${type.name}]${r}
			      (B:${relB.name})
			${optionalMatches.join(' ')}
			RETURN B, { ${objectMembers.join(', ')} } AS rels
		`;

		console.log("NK TEST getRelatedResources.query", q);
		let results = await this.query(q);

		console.log("NK OK2: related resources extracted");

		/* integrate relationship data into the resource object */
		return results.map(({B, rels}) => Object.assign(B, rels)).map((res) => neo4jToData(relB, res));

	}

	//NK modified
	async addNewRelationship(relA, idA, idB) {

		let type = relA.relationshipClass;
		let relB = relA.codomain;

		console.log("NK deleteRelationship.relA", relA);
		console.log("NK deleteRelationship.type", type);
		console.log("NK deleteRelationship.relB", relB);

		/* throw a 404 if either of the resources doesn't exist */
		await Promise.all([
			this.assertResourcesExist(relA, [idA]),
			this.assertResourcesExist(relB, [idB])
		]);

		// TODO: check whether adding or deleting any relationships below violates any constraints
		// TODO: maybe an existing relationship with idB needs to be deleted because this one is added

		/* the main query for adding the new relationship */
		let [l, r] = arrowEnds(relA);
		await this.query(`
			MATCH (A:${relA.name} { id: ${idA} }),
			      (B:${relB.name} { id: ${idB} })
			CREATE UNIQUE (A) ${l}[:${type.name}]${r} (B)
		`);

	}

	//NK modified
	async deleteRelationship(relA, idA, idB) {

		let type = relA.relationshipClass;
		let relB = relA.codomain.resourceClass;

		console.log("NK deleteRelationship.relA", relA);
		console.log("NK deleteRelationship.type", type);
		console.log("NK deleteRelationship.relB", relB);

		/* throw a 404 if either of the resources doesn't exist */
		await Promise.all([
			this.assertResourcesExist(relA.type, [idA]),
			this.assertResourcesExist(relB.type, [idB])
		]);

		// TODO: check whether deleting this relationship violates any constraints

		/* the main query for removing the relationship */
		let [l, r] = arrowEnds(relA);

		await this.query(`
			MATCH (A:${relA.name} { id: ${idA} })
			      ${l}[rel:${type.name}]${r}
			      (B:${relB.name} { id: ${idB} })
			DELETE rel
		`);
	}
}
