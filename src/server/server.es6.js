////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// imports                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/* external libraries */
import promisify from 'es6-promisify';

/* argument parsing (could auto-exit the process when --help is asked) */
import config from '../config.es6.js';

/* the server implementation */
import getServer from '../server.es6';


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// starting the server                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

(async ()=>{
	try {

		let server = await getServer(`${__dirname}/../`, config);

		await promisify(server.listen.bind(server))(config.port);

		console.log(`listening on port ${config.port}`);

	} catch (err) {

		console.error(err);

	}
})();
