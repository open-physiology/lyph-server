////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* local stuff */
import {OK}        from '../http-status-codes.es6.js';
import {pluckData} from '../utility.es6.js';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// the algorithms                                                                                                     //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const $ref = (type) => ({ $ref: `#/definitions/${type}` });

/* the algorithms object */
export const algorithms = {

	lyphTemplatesBetween: {
		summary: `retrieve all lyph templates between given hierarchy bounds`,
		parameters: [{
			name:        'ids',
			in:          'path',
			description: "IDs of the lyph template bounds",
			required:     true,
			type:        'array',
			items:       {type: 'number'}
		}],
		responses: {
			[OK]: {
				description: `an array containing requested lyph templates`,
				schema: { type: 'array', items: $ref('LyphTemplate') }
			}
		},
		async run({resources, db, pathParams}) {

			/* throw a 404 if any of the resources don't exist */
			await db.assertResourcesExist(resources.LyphTemplate, pathParams.ids);

			// TODO: query option for 'inclusive' or 'exclusive' and set sensible default

			/* fetch the results */
			return await db.query(`
				MATCH  p = (lt1:LyphTemplate)
				           -[:LyphTemplateChildLyphTemplate*0..]->
				           (lt2:LyphTemplate)
				WHERE  lt1.id IN [${pathParams.ids.join(',')}] AND
				       lt2.id IN [${pathParams.ids.join(',')}]
				UNWIND nodes(p) AS n WITH n
				RETURN DISTINCT n;
			`).then(pluckData('n'));
		}
	}

};
