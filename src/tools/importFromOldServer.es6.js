////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* external libs */
import thenifyAll  from 'thenify-all';
import thenify     from 'thenify';
import ProgressBar from 'progress';
import _, {uniq}   from '../libs/lodash.es6.js';
const  request     =     require('superagent-promise')(require('superagent'), Promise);
const  fs          =     thenifyAll(require('fs'));
const  csvParse    =     thenify(require('csv-parse'));
//const csvParse = (data, options) => new Promise((res, rej) => { require('csv-parse')(data, options,
//		(err, val) => { if (err) { rej(err) } else { res(val) }  }) });

/* local stuff */
import {humanMsg} from '../utility.es6.js';

/* argument parsing (could auto-exit the process when --help is asked) */
import config from '../config.es6.js';



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// constants                                                                                                          //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const HOST = config.host;
const PORT = config.port;
const COLLECTIONS = [
	'lyphTemplates',
	'publications',
	'clinicalIndices',
	'locatedMeasures',
	'correlations',
	'lyphTmpl Hierarchy'
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
	progress = new ProgressBar(`${_(name+':').padRight(_(COLLECTIONS).map('length').max()+1)} :bar (:current / :total) :etas`, {
		total: length,
		width: 80,
		complete:   '█',
		incomplete: '░'
	});
}

/* collection accumulation management */
async function collection(name, array, filter, fID, fObj) {
	array = _(array).uniq(fID);
	newProgress(name, array.size());
	for (let x of array) {
		if (!filter(x)) { continue }
		let {body:[{id}]} = await request.post(`${HOST}:${PORT}/${name}`).send(fObj(x));
		mapID(name, fID(x), id);
		progress.tick();
	}
}

/* clean up the different types of FMA strings in the old db */
const FMA_REGEX = /^(?:FMA_)(\d+)$/;
function cleanFMA(val) {
	if (!val)       { return }
	if (val === '') { return }
	if (typeof val === 'number') { return val }
	if (typeof val !== 'string') { return }
	let [,result] = val.match(FMA_REGEX) || [];
	return result && parseInt(result, 10);
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// import the old lyph server data                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

(async () => {

	try {

		/* get the raw server dump */
		let oldServerDump = JSON.parse(await fs.readFile(`${__dirname}/old-server-dump.json`));


		/* import pubmed data from csv file */
		// originally extracted using http://www.ncbi.nlm.nih.gov/sites/batchentrez
		let csvPubmed = await csvParse(require('raw!./pubmed-records.csv'), { columns: true });
		let pubmedMap = {};
		for (let record of csvPubmed) {
			let [,id] = record.URL.match(/^\/pubmed\/(\d+)$/);
			pubmedMap[id] = record;
		}


		/* send the resources to the server through our own REST API */
		await collection('lyphTemplates',
			oldServerDump.lyphs,
			()=>true,
			x => x.id,
			x => ({
				name:  x.name || "",
				fmaID: cleanFMA(x.fma),
				oldID: parseInt(x.id, 10)
			})
		);
		await collection('publications',
			oldServerDump.pubmeds.concat(oldServerDump.correlations.map(x=>x.pubmed)),
			x => (x.id && x.id !== ''),
			x => x.id,
			x => ({
				uri: `http://www.ncbi.nlm.nih.gov/pubmed/?term=${x.id}`,
				...(pubmedMap[x.id] ? { title: pubmedMap[x.id].Title } : x.id !== x.title
				                    ? { title: x.title               }
				                    : {                              })
			})
		);
		await collection('clinicalIndices',
			_(oldServerDump.correlations)
				.map('variables')
				.flatten()
				.filter({ type: 'clinical index' })
				.concat(oldServerDump['clinical indices']
					.map(x => ({ ...x, 'clindex': x.index, 'clindex label': x.label }))),
			()=>true,
			x => x.clindex,
			x => ({
				uri: x.clindex,
				...(x.clindex !== x['clindex label'] ? { title: x['clindex label'] } : {})
			})
		); // TODO: set parents / children of clinical indices
		await collection('locatedMeasures',
			_(oldServerDump.correlations)
				.map('variables')
				.flatten()
				.filter({ type: 'located measure' }),
			()=>true,
			locatedMeasureID,
			x => ({
				lyphTemplate: parseInt(idMap.lyphTemplates[x.location], 10),
				quality:      x.quality
			})
		);
		await collection('correlations',
			oldServerDump.correlations,
			()=>true,
			x => x.id,
			x => ({
				publication:     parseInt(idMap.publications[x.pubmed.id], 10),
				locatedMeasures: x.variables.filter(v=>v.type==='located measure').map(v=>idMap.locatedMeasures[locatedMeasureID(v)]),
				clinicalIndices: x.variables.filter(v=>v.type==='clinical index' ).map(v=>idMap.clinicalIndices[v.clindex]),
				...(x.comment ? { comment: x.comment } : {})
			})
		);

		/* register the lyph template hierarchy */
		await (async () => {
			let array = uniq(oldServerDump.lyphs, x => x.id);
			newProgress('LyphTmpl Hierarchy', array.length);
			for (let parent of array) {
				for (let {child} of parent.children) {
					await request.put(`${HOST}:${PORT}/lyphTemplates/${idMap.lyphTemplates[parent.id]}/children/${idMap.lyphTemplates[child.id]}`);
				}
				progress.tick();
			}
		})();

		/* write the id mapping to a file */
		await fs.writeFile('./old-new-server-id-mapping.json', JSON.stringify(idMap, null, '\t'));

	} catch (err) {

		console.error(err);

	}

	process.exit();

})();
