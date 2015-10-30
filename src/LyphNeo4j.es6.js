////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* libraries */
import _    from 'lodash';
import co   from 'co';

/* local stuff */
import Neo4j from './neo4j.es6.js';
import {
	customError,
	pluckData,
	dbOnly,
	arrowEnds,
	relationshipQueryFragments,
	humanMsg,
	inspect,
	arrowMatch,
	relationshipTypeSummaries
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

export default class LyphNeo4j extends Neo4j {

	////////////////////////////////////////////
	// Common functionality for other methods //
	////////////////////////////////////////////

	*runTypeSpecificHook(type, hook, info) {
		if (!_.isUndefined(type[hook])) {
			yield type[hook]({...info, resources, relationships, db: this});
		}
	}

	*assertResourceExists(type, id) {
		/* a query for checking existence of this resource */
		let [{exists}] = yield this.query(`
			MATCH (n:${type.name} { id: ${id} })
			RETURN count(n) > 0 AS exists
		`);
		/* throw the 404 error if 'exists' is false */
		if (!exists) {
			throw customError({
				status: NOT_FOUND,
				type:   type.name,
				id:     id,
				message: humanMsg`The specified ${type.singular} does not exist.`
			});
		}
	}

	*assertRelatedResourcesExists(ids, rel) {
		let type = rel.otherSide.type;
		let [{existing}] = yield this.query(`
			MATCH (n:${type.name})
			WHERE n.id IN [${ids.join(',')}]
			RETURN collect(n.id) as existing
		`);
		let nonexisting = _.difference(ids, existing);
		if (nonexisting.length > 0) {
			let c = (rel.fieldCardinality === 'one') ? 'singular' : 'plural';
			throw customError({
				status:   NOT_FOUND,
				type:     type.name,
				ids:      nonexisting,
				...(c === 'singular' ? { id: nonexisting[0] } : {}),
				message: humanMsg`
					The specified ${type[c]}
					${nonexisting.join(',')}
					${c === 'singular' ? 'does' : 'do'} not exist.
				`
			});
		}
	}

	*assertRequiredFieldsAreGiven(type, fields, relSummaries) {
		for (let [fieldName, fieldSchema] of Object.entries(type.schema.properties)) {
			let rel = _.find(relSummaries, { fieldName });
			if (fieldSchema['x-required'] && !(rel && rel.implicit) && _.isUndefined(fields[fieldName])) {
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

	*assertProperCardinalityInFields(type, fields, relSummaries) {
		for (let {fieldName, rel, given} of _.filter(relSummaries, 'given')) {
			let tooMany = ( Array.isArray(given) && rel.fieldCardinality === 'one' );
			let tooFew  = (!Array.isArray(given) && rel.fieldCardinality === 'many');
			if (tooMany || tooFew) {
				throw customError({
					status:  BAD_REQUEST,
					type:    type.name,
					field:   fieldName,
					message: tooMany
						? humanMsg`The '${fieldName}' field expects a single  ${rel.otherSide.singular}, but an array was provided.`
						: humanMsg`The '${fieldName}' field expects an array of ${rel.otherSide.plural}, but a single value was provided.`
				});
			}
		}
	}

	*assertReferencedResourcesExist(type, fields, relSummaries) {
		for (let {fieldName, rel, ids} of _.filter(relSummaries, 'given')) {
			try { this.assertRelatedResourcesExists(ids, rel) }
			catch (err) {
				Object.assign(err, {
					type: type,
					field: fieldName
				});
				throw err;
			}
		}
	}

	*createImplicitRelationshipResources(type, id, fields, relSummaries) {
		for (let relSummary of _(relSummaries).filter('implicit').reject('given').value()) {
			let rel = relSummary.rel.otherSide;
			let implicitId = yield this.createResource(rel.type, Object.assign({
				[rel.fieldName]: id
			}, rel.disambiguation || {}));
			relSummary.given = [implicitId];
		}
	}

	*createSpecifiedRelationships(type, id, fields, relSummaries) {
		let relCreationStatements = _(relSummaries).filter('given').map(({rel, ids}) => {
			let [l, r] = arrowEnds(rel);
			return ids.map(id => `
			WITH A
			MATCH (B:${rel.otherSide.type.name} { id: ${id} })
			CREATE UNIQUE (A) ${l}[:${rel.relationship.name}]${r} (B)
		`);
		}).flatten().value();
		if (relCreationStatements.length > 0) {
			try {
				yield this.query(`
				MATCH (A:${type.name} { id: ${id} })
				${relCreationStatements.join(' ')}
			`);
			} catch (err) {
				inspect(err);
			}
		}
		// TODO: run relationship-type-specific hooks, probably by creating each relationship individually
	}

	*removeUnspecifiedRelationships(type, id, fields, relSummaries, {includeUngivenFields = false} = {}) {
		let relDeletionStatements = _(relSummaries).filter(includeUngivenFields ? ()=>true : 'given').map(({rel, ids}) => {
			let [l, r] = arrowEnds(rel);
			return `
			WITH A
			MATCH (A) ${l}[rel:${rel.relationship.name}]${r} (B:${rel.otherSide.type.name})
			WHERE NOT B.id IN [${ids.join(', ')}]
			DELETE rel
		`;
		}).value();
		if (relDeletionStatements.length > 0) {
			yield this.query(`
			MATCH (A:${type.name} { id: ${id} })
			${relDeletionStatements.join(' ')}
		`);
		}
		// TODO: run relationship-type-specific hooks, probably by deleting each relationship individually
	}

	*getResourcesToDelete(type, id) {

		/* collect nodes to delete */
		let markedNodes = new Map();

		/* traverse graph to find nodes to delete, based on 'sustaining' relationships */
		const symmetricSustaining = sustainingRelationships.filter((relA) =>  relA.symmetric);
		const l2rSustaining       = sustainingRelationships.filter((relA) => !relA.symmetric && relA.side === 1);
		const r2lSustaining       = sustainingRelationships.filter((relA) => !relA.symmetric && relA.side === 2);
		const recurse = co.wrap(function* ({type, id}) {
			if (markedNodes.has(id)) { return }
			markedNodes.set(id, { type, id });
			let nResources = yield this.query(`
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
			yield nResources.map(({id, type}) => ({id, type: resources[type]})).map(recurse);
		});
		yield recurse({ type, id });

		/* return the nodes that would be deleted */
		return [...markedNodes.values()];

	}

	*anythingAnchoredFromOutside(ids) {
		const symmetricAnchoring = anchoringRelationships .filter((relA) =>  relA.symmetric);
		const l2rAnchoring       = anchoringRelationships .filter((relA) => !relA.symmetric && relA.side === 1);
		const r2lAnchoring       = anchoringRelationships .filter((relA) => !relA.symmetric && relA.side === 2);
		return yield this.query(`
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
	// Main methods used directly for lyph-server calls //
	//////////////////////////////////////////////////////

	*getSingleResource(type, id) {

		/* throw a 404 if the resource doesn't exist */
		yield this.assertResourceExists(type, id);

		/* preparing the part of the query that adds relationship info */
		let {optionalMatches, objectMembers} = relationshipQueryFragments(type, 'n');

		/* formulating and sending the query */
		let results = yield this.query(`
			MATCH (n:${type.name} { id: ${id} })
			${optionalMatches.join(' ')}
			RETURN n, { ${objectMembers.join(', ')} } AS rels
		`);

		/* integrate relationship data into the resource object */
		return results.map(({n, rels}) => Object.assign(n, rels));

	}

	*getAllResources(type) {

		/* preparing the part of the query that adds relationship info */
		let {optionalMatches, objectMembers} = relationshipQueryFragments(type, 'n');

		/* formulating and sending the query */
		let results = yield this.query(`
			MATCH (n:${type.name})
			${optionalMatches.join(' ')}
			RETURN n, { ${objectMembers.join(', ')} } AS rels
		`);

		/* integrate relationship data into the resource object */
		return results.map(({n, rels}) => Object.assign(n, rels));

	}

	*createResource(type, fields) {

		/* if given, run a type-specific hook */
		yield this.runTypeSpecificHook(type, 'beforeCreate', { fields });

		/* process relevant relationships */
		let relSummaries = relationshipTypeSummaries(type, fields);

		/* assert that all required fields are given */
		yield this.assertRequiredFieldsAreGiven(type, fields, relSummaries);

		/* if relationship cardinality is confused in the request, error out */
		yield this.assertProperCardinalityInFields(type, fields, relSummaries);

		/* for all relationships specified in the request, assert that those resources exist */
		yield this.assertReferencedResourcesExist(type, fields, relSummaries);

		/* the main query for creating the resource */
		let [{id}] = yield this.creationQuery(({withNewId}) => ({
			statement: `
				${withNewId('newID')}
				CREATE (n:${type.name} { id: newID, type: "${type.name}" })
				SET n += {dbProperties}
				RETURN newID as id
			`,
			parameters: {  dbProperties: dbOnly(type, fields)  }
		}));

		/* for all un-given relationships that should be 'implicit':     */
		/* create the other resource and adjust the 'relSummaries' array */
		yield this.createImplicitRelationshipResources(type, id, fields, relSummaries);

		/* create the required relationships */
		yield this.createSpecifiedRelationships(type, id, fields, relSummaries);

		/* if given, run a type-specific hook */
		yield this.runTypeSpecificHook(type, 'afterCreate', { id, fields });

		return id;

	}

	*updateResource(type, id, fields) {

		/* make sure the resource exist */
		yield this.assertResourceExists(type, id);

		/* if given, run a type-specific hook */
		yield this.runTypeSpecificHook(type, 'beforeUpdate', { id, fields });

		/* process relevant relationships */
		let relSummaries = relationshipTypeSummaries(type, fields);

		/* if relationship cardinality is confused in the request, error out */
		yield this.assertProperCardinalityInFields(type, fields, relSummaries);

		/* for all relationships specified in the request, assert that those resources exist */
		yield this.assertReferencedResourcesExist(type, fields, relSummaries);

		/* the main query for creating the resource */
		yield this.query({
			statement: `
				MATCH (n:${type.name} { id: ${id} })
				SET n     += {dbProperties}
				SET n.id   =  ${id}
				SET n.type = "${type.name}"
			`,
			parameters: {  dbProperties: dbOnly(type, fields)  }
		});

		/* for all un-given relationships that should be 'implicit':     */
		/* create the other resource and adjust the 'relSummaries' array */
		yield this.createImplicitRelationshipResources(type, id, fields, relSummaries);

		/* remove the relationships explicitly left out */
		yield this.removeUnspecifiedRelationships(type, id, fields, relSummaries);

		/* create the required relationships */
		yield this.createSpecifiedRelationships(type, id, fields, relSummaries);

		/* if given, run a type-specific hook */
		yield this.runTypeSpecificHook(type, 'afterUpdate', { id, fields });

	}

	*replaceResource(type, id, fields) {

		/* make sure the resource exist */
		yield this.assertResourceExists(type, id);

		/* if given, run a type-specific hook */
		yield this.runTypeSpecificHook(type, 'beforeReplace', { id, fields });

		/* process relevant relationships */
		let relSummaries = relationshipTypeSummaries(type, fields);

		/* assert that all required fields are given */
		yield this.assertRequiredFieldsAreGiven(type, fields, relSummaries);

		/* if relationship cardinality is confused in the request, error out */
		yield this.assertProperCardinalityInFields(type, fields, relSummaries);

		/* for all relationships specified in the request, assert that those resources exist */
		yield this.assertReferencedResourcesExist(type, fields, relSummaries);

		/* the main query for creating the resource */
		yield this.query({
			statement: `
				MATCH (n:${type.name} { id: ${id} })
				SET n      = {dbProperties}
				SET n.id   =  ${id}
				SET n.type = "${type.name}"
			`,
			parameters: {  dbProperties: dbOnly(type, fields)  }
		});

		/* for all un-given relationships that should be 'implicit':     */
		/* create the other resource and adjust the 'relSummaries' array */
		yield this.createImplicitRelationshipResources(type, id, fields, relSummaries);

		/* remove the relationships explicitly left out */
		yield this.removeUnspecifiedRelationships(type, id, fields, relSummaries, { includeUngivenFields: true });

		/* create the required relationships */
		yield this.createSpecifiedRelationships(type, id, fields, relSummaries);

		/* if given, run a type-specific hook */
		yield this.runTypeSpecificHook(type, 'afterReplace', { id, fields });

	}

	*deleteResource(type, id) {

		/* throw a 404 if the resource doesn't exist */
		yield this.assertResourceExists(type, id);

		/* get all ids+types that would be auto-deleted by deleting this particular node */
		let dResources = yield this.getResourcesToDelete(type, id);

		/* then test whether of those are still anchored, and we have to abort the delete operation */
		let anchors = yield this.anythingAnchoredFromOutside(dResources.map(_.property('id')));
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

		/* if given, run a type-specific hook */
		yield dResources.reverse().map(({id: dId, type: dType}) =>
				this.runTypeSpecificHook(dType, 'beforeDelete', { id: dId }));

		/* the main query for deleting the node */
		yield this.query(`
			MATCH (n)
			WHERE n.id IN [${dResources.map(_.property('id')).join(',')}]
			OPTIONAL MATCH (n)-[r]-()
			DELETE n, r
		`);

		/* if given, run a type-specific hook */
		yield dResources.reverse().map(({id: dId, type: dType}) =>
				this.runTypeSpecificHook(dType, 'afterDelete', { id: dId }));

	}

	*getRelatedResources(relA, idA) {
		let type = relA.relationship;
		let relB = relA.otherSide;

		/* throw a 404 if the resource doesn't exist */
		yield this.assertResourceExists(relA.type, idA);

		/* formulating and sending the query */
		let {optionalMatches, objectMembers} = relationshipQueryFragments(relB.type, 'B');
		let [l, r] = arrowEnds(relA);
		let results = yield this.query(`
			MATCH (A:${relA.type.name} { id: ${idA} })
			      ${l}[:${type.name}]${r}
			      (B:${relB.type.name})
			${optionalMatches.join(' ')}
			RETURN B, { ${objectMembers.join(', ')} } AS rels
		`);

		/* integrate relationship data into the resource object */
		return results.map(({B, rels}) => Object.assign(B, rels));

	}

	*addNewRelationship(relA, idA, idB) {

		let type = relA.relationship;
		let relB = relA.otherSide;

		/* throw a 404 if either of the resources doesn't exist */
		yield [
			this.assertResourceExists(relA.type, idA),
			this.assertResourceExists(relB.type, idB)
		];

		// TODO: check whether adding or deleting any relationships below violates any constraints
		// TODO: maybe an existing relationship with idB needs to be deleted because this one is added

		/* the main query for adding the new relationship */
		let [l, r] = arrowEnds(relA);
		yield this.query(`
			MATCH (A:${relA.type.name} { id: ${idA} }),
			      (B:${relB.type.name} { id: ${idB} })
			CREATE UNIQUE (A) ${l}[:${type.name}]${r} (B)
		`);

	}

	*deleteRelationship(relA, idA, idB) {

		let type = relA.relationship;
		let relB = relA.otherSide;

		/* throw a 404 if either of the resources doesn't exist */
		yield [
			this.assertResourceExists(relA.type, idA),
			this.assertResourceExists(relB.type, idB)
		];

		// TODO: check whether deleting this relationship violates any constraints

		/* the main query for removing the relationship */
		let [l, r] = arrowEnds(relA);
		yield this.query(`
			MATCH (A:${relA.type.name} { id: ${idA} })
			      ${l}[rel:${type.name}]${r}
			      (B:${relB.type.name} { id: ${idB} })
			DELETE rel
		`);

	}

}

/* wrapping the methods above with co.wrap */
for (let key of Object.keys(LyphNeo4j.prototype)) {
	if (typeof LyphNeo4j.prototype[key] === 'function') {
		LyphNeo4j.prototype[key] = co.wrap(LyphNeo4j.prototype[key]);
	}
}
