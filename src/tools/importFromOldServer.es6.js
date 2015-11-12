////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* external libs */
import thenifyAll  from 'thenify-all';
import thenify     from 'thenify';
import ProgressBar from 'progress';
import _           from 'lodash';
import __          from 'highland';
const  request     =     require('superagent-promise')(require('superagent'), Promise);
const  fs          =     thenifyAll(require('fs'));

/* local stuff */
import {humanMsg} from '../utility.es6.js';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// constants                                                                                                          //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const HOST = 'localhost';
const PORT = 8888;
const COLLECTIONS = [
	'lyphs',
	'pubmeds',
	'located measures'
];


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// utility stuff                                                                                                      //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* keep track of id-mapping */
let idMap = {};
function mapID(type, from, to) {
	if (!idMap[type]) { idMap[type] = {} }
	idMap[type][from] = to;
}
const locatedMeasureID = (x => `${x.location} - ${x.quality}`);

/* progress bars */
let progress;
function newProgress(name, length) {
	progress = new ProgressBar(`${_(name+':').padRight(_(COLLECTIONS).map('length').max()+1)} [:bar] (:current / :total) :etas`, {
		total: length,
		width: 80
	});
}

/* collection accumulation management */
async function collection(name, array, fID, fObj) {
	array = _.uniq(array, fID);
	newProgress(name, array.length);
	for (let x of array) {
		let {body:[{id}]} = await request.post(`${HOST}:${PORT}/${name}`).send(fObj(x));
		mapID(name, fID(x), id);
		progress.tick();
	}
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// import the old lyph server data                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

(async () => {

	try {

		/* get the raw server dump */
		let oldServerDump = JSON.parse(await fs.readFile(`${__dirname}/old-server-dump.json`));

		/* send the resources to the server through our own REST API */
		await collection('lyphTemplates',
			oldServerDump.lyphs,
			x => x.id,
			x => ({
				name: x.name || ""
			})
		);
		await collection('publications',
			oldServerDump.pubmeds.concat(oldServerDump.correlations.map(x=>x.pubmed)),
			x => x.id,
			x => ({
				uri: `http://www.ncbi.nlm.nih.gov/pubmed/?term=${x.id}`,
				...(x.id !== x.title ? { title: x.title } : {})
			})
		);
		await collection('clinicalIndices',
			_(oldServerDump.correlations)
				.map('variables')
				.flatten()
				.filter({ type: 'clinical index' })
				.concat(oldServerDump['clinical indices']
					.map(x => ({ ...x, 'clindex': x.index, 'clindex label': x.label })))
				.value(),
			x => x.clindex,
			x => ({
				uri: x.clindex,
				...(x.clindex !== x['clindex label'] ? { title: x['clindex label'] } : {})
			})
		);
		await collection('locatedMeasures',
			_(oldServerDump.correlations)
				.map('variables')
				.flatten()
				.filter({ type: 'located measure' })
				.value(),
			locatedMeasureID,
			x => ({
				lyph:    parseInt(idMap.lyphTemplates[x.location], 10),
				quality: x.quality
			})
		);
		await collection('correlations',
			oldServerDump.correlations,
			x => x.id,
			x => ({
				publication:     parseInt(idMap.publications[x.pubmed.id]),
				locatedMeasures: x.variables.filter(v=>v.type==='located measure').map(v=>idMap.locatedMeasures[locatedMeasureID(v)]),
				clinicalIndices: x.variables.filter(v=>v.type==='clinical index' ).map(v=>idMap.clinicalIndices[v.clindex]),
				...(x.comment ? { comment: x.comment } : {})
			})
		);

		/* write the id mapping to a file */
		await fs.writeFile('./old-new-server-id-mapping.json', JSON.stringify(idMap, null, '\t'));

	} catch (err) {

		console.error(err);

	}

	process.exit();

})();
