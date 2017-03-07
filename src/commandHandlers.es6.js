////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
'use strict';

import isNull from 'lodash-bound/isNull';
import isUndefined from 'lodash-bound/isUndefined';
import cloneDeep from 'lodash-bound/cloneDeep';

import modelFactory from "../node_modules/open-physiology-model/src/index.js";
import { customError, humanMsg } from './utility.es6.js';
import { NOT_FOUND } from './http-status-codes.es6.js';

const printCommands = false;
const printReturns = false;

const href2Id = (href) => Number.parseInt(href.substring(href.lastIndexOf("/") + 1));

export const createModelWithFrontend = (db) => {
    let frontend = {
        /* Commit a newly created entity to DB */
        async commit_new({commandType, values}) {
            if (printCommands) { console.log("commit_new", values); }
            values = values::cloneDeep();
            let cls = model[values.class];
            let res;
            if (cls.isResource){
                let id = await db.createResource(cls, values);
                res = await db.getSpecificResources(cls, [id], {withoutShortcuts: true});
            } else {
                if (cls.isRelationship){
                    let id = await db.createRelationship(cls,
                        model[values[1].class], model[values[2].class],
                        href2Id(values[1].href), href2Id(values[2].href),
                        values);
                    res = await db.getSpecificRelationships(cls, [id]);
                }
            }
            if (printReturns) {console.log("commit_new returns", res[0]); }
            return res[0];
        },

        /* Commit an edited entity to DB */
        async commit_edit({entity, newValues}) {
            if (printCommands) { console.log("commit_edit", entity, newValues); }
            newValues = newValues::cloneDeep();
            let cls = model[entity.class];
            let id = href2Id(entity.href);
            let res;
            if (cls.isResource){
                await db.updateResource(cls, id, newValues);
                res = await db.getSpecificResources(cls, [id], {withoutShortcuts: true});
            } else {
                if (cls.isRelationship){
                    await db.updateRelationshipByID(cls, id, newValues);
                    res = await db.getSpecificRelationships(cls, [id]);
                }
            }
            if (printReturns) { console.log("commit_edit returns", res[0]); }
            return res[0];
        },

        /* Commit changes after deleting entity to DB */
        async commit_delete({entity}) {
            if (printCommands) { console.log("commit_delete", entity); }
            let cls = model[entity.class];
            let id = href2Id(entity.href);
            if (cls.isResource){
                await db.deleteResource(cls, id);
            } else {
                if (cls.isRelationship){
                    await db.deleteRelationshipByID(cls, id);
                }
            }
        },

        /* Load from DB all entities with given IDs */
        async load(addresses, options = {}) {
            if (printCommands) { console.log("load", addresses, options); }
            let clsMaps = {};
            for (let address of Object.values(addresses)){
                let cls = model[address.class];
                let id = href2Id(address.href);
                if (clsMaps[cls.name]::isUndefined()){
                    clsMaps[cls.name] = {cls: cls, ids: [id]}
                } else {
                    clsMaps[cls.name].ids.push(id);
                }
            }
            let results = [];
            for (let {cls, ids} of Object.values(clsMaps)){
                let clsResults = (cls.isResource)?
                    await db.getSpecificResources(cls, ids, {withoutShortcuts: true}):
                await db.getSpecificRelationships(cls, ids);
                clsResults = clsResults.filter(x => !x::isNull() && !x::isUndefined());
                if (clsResults.length < ids.length){
                    throw customError({
                        status:  NOT_FOUND,
                        class:   cls.name,
                        ids:     ids,
                        message: humanMsg`Not all specified ${cls.name} entities with IDs '${ids.join(',')}' exist.`
                    });
                }
                if (clsResults.length > 0){
                    results.push(...clsResults);
                }
            }
            if (printReturns) { console.log("load returns", results); }
            return results;
        },

        /* Load from DB all entities of a given class */
        async loadAll(cls, options = {}) {
            if (printCommands) { console.log("loadAll", cls.name, options); }
            let results = [];
            if (cls.isResource){
                results = await db.getAllResources(cls, {withoutShortcuts: true});
            } else {
                if (cls.isRelationship){
                    results = await db.getAllRelationships(cls);
                }
            }
            if (printReturns) { console.log("loadAll returns", results); }
            //console.log("loadAll returns", results);
            return results;
        }
    };

    let model = modelFactory(frontend).classes;
    return model;
};

