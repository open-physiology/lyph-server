import getServer from '../server.es6.js';
import config    from '../config.es6.js';
import {inspect} from '../utility.es6.js';
import {stringify} from 'csv';

(async ()=>{
	try {

		let {database} = await getServer(`${__dirname}/../`, Object.assign(config, {exposeDB: true}));

		let result = await database.query(`
			MATCH
				(publication:Publication)
				-[:CorrelationPublication]-
				(correlation:Correlation)
				-[:CorrelationLocatedMeasure]-
				(:LocatedMeasure)
				-[:LyphTemplateLocatedMeasure]-
				(lyphTemplate:LyphTemplate)
			RETURN
				publication.title AS pubTitle,
			    publication.uri   AS pubURI,
			    lyphTemplate.name AS ltName
		`);

		stringify(result, {
			columns: ['ltName', 'pubTitle', 'pubURI'],
			delimiter: '\t'
		}, (err, tsv) => {
			console.log(tsv);
		});

		//inspect(JSON.stringify(result, null, 4));

	} catch (err) { console.error(err) }
})();
