import fs   from 'fs';
import path from 'path';

import {swagger} from '../setup.es6.js';

fs.writeFile(path.resolve(__dirname, `../../dist/swagger.json`), JSON.stringify(swagger, null, 4), (err) => {
	if (err) { return console.error(err) }
	console.log('Generated swagger.json');
	process.exit();
});
