////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
'use strict';

import isNull      from 'lodash-bound/isNull';
import isUndefined from 'lodash-bound/isUndefined';
import cloneDeep   from 'lodash-bound/cloneDeep';

import './utils/loadRxjs.es6.js';
import manifestFactory from 'open-physiology-manifest';
import {Module} from 'open-physiology-model';

import {NOT_FOUND}   from './http-status-codes.es6.js';
import {humanMsg}    from 'utilities';

const printCommands = false;
const printCommits  = false;
const printReturns  = false;

export const createModelWithBackend = (db) => {
    let manifest = manifestFactory();

    let model;

    let backend = {

        async commit_new(values) {
            if (printCommands) { console.log("commit_new", values); }
            values = values::cloneDeep();
            let cls = model.entityClasses[values.class];
            let id = await db.createResource(cls, values);
            let res = await db.getSpecificResources(cls, [id]);
            if (printCommits) {console.log("commit_new returns", res[0]); }
            return res[0];
        },
        async commit_edit(address, newValues) {
            if (printCommands) { console.log("commit_edit", address, newValues); }
            newValues = newValues::cloneDeep();
            let cls = model.entityClasses[address.class];
            await db.updateResource(cls, address.id, newValues);
            let res = await db.getSpecificResources(cls, [address.id]);
            if (printCommits) { console.log("commit_edit returns", res[0]); }
            return res[0];
        },
        async commit_delete(address) {
            if (printCommands) { console.log("commit_delete", address); }
            let cls = model.entityClasses[address.class];
            await db.deleteResource(cls, address.id);
            if (printCommits) { console.log("commit_delete returns"); }
        },
        async commit_link(address1, key, address2) {
            if (printCommands) { console.log("commit_link", address1, key, address2); }
            const [,arrow,relClassName] = key.match(/^(<--|-->)(\w+)$/);
            if (arrow === '<--') { [address1, address2] = [address2, address1] }
            let cls = model.entityClasses[relClassName];
            await db.createRelationship(cls,
                {clsA: model.entityClasses[address1.class], idA: address1.id},
                {clsB: model.entityClasses[address2.class], idB: address2.id});
            if (printCommits) { console.log("commit_link completed"); }
        },
        async commit_unlink(address1, key, address2) {
            if (printCommands) { console.log("commit_unlink", address1, key, address2); }
            const [,arrow,relClassName] = key.match(/^(<--|-->)(\w+)$/);
            if (arrow === '<--') { [address1, address2] = [address2, address1] }
            let cls = model.entityClasses[relClassName];
            await db.deleteRelationship(cls,
                {clsA: model.entityClasses[address1.class], idA: address1.id},
                {clsB: model.entityClasses[address2.class], idB: address2.id});
            if (printCommits) { console.log("commit_unlink completed"); }
        },
        async load(addresses) {
            if (printCommands) { console.log("load", addresses); }
            let clsMaps = {};
            for (let address of addresses){
                let cls = model.entityClasses[address.class];
                if (!clsMaps[cls.name]) {
                    clsMaps[cls.name] = {cls: cls, ids: []};
                }
                clsMaps[cls.name].ids.push(address.id);
            }
            let results = [];
            for (let {cls, ids} of Object.values(clsMaps)){
                let clsResults = await db.getSpecificResources(cls, ids);
                clsResults = clsResults.map(x => x::isUndefined() ? null : x);
                if (clsResults.length > 0) {
                    results.push(...clsResults);
                }
            }
            if (printReturns) { console.log("load returns", results.map(r => !r ? null : JSON.stringify(r))); }
            return results;
        },
        async loadAll({class: clsName}) {
            if (printCommands) { console.log("loadAll", clsName); }
            let cls = model.entityClasses[clsName];
            let results = await db.getAllResources(cls);
            if (printReturns) { console.log("loadAll returns", results.map(r => JSON.stringify(r))); }
            return results;
        }
    };

    model = new Module({ manifest, backend });

    return model;
};

