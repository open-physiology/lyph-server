// imports
import util              from 'util';
import express           from 'express';
import swaggerMiddleware from 'swagger-express-middleware';

// local stuff
import swagger from '../swagger.es6';




function circularJSON(obj) {
	let cache = [];
	return JSON.stringify(obj, function(key, value) {
		if (typeof value === 'object' && value !== null) {
			if (cache.indexOf(value) !== -1) {
				// Circular reference found, discard key
				return;
			}
			// Store value in our collection
			cache.push(value);
		}
		return value;
	});
}





// Set the DEBUG environment variable to enable debug output
process.env.DEBUG = 'swagger:middleware';

// the express application
let app = express();

swaggerMiddleware(swagger, app, (err, middleware) => {
	if (err) { console.error(err) }

	app.use(
		middleware.metadata(),
		middleware.parseRequest(),
		middleware.validateRequest()
	);

	for (let path of Object.keys(swagger.paths)) {
		let pathObj = swagger.paths[path];
		for (let method of Object.keys(pathObj).filter(p => !/x-/.test(p))) {
			let methodObj = pathObj[method];
			let expressStylePath = path.replace(/{(\w+)}/g, ':$1');
			app[method](expressStylePath, (req, res, next) => {

				res.send(`
					<hr> <h1>Params:</h1>
					<hr> <pre>${JSON.stringify(req.params, null, 4)}</pre>
					<hr>
				`);

			});
		}
	}

	///* error handling */
	//app.use((err, req, res, next) => {
	//
	//	debugger;
	//
	//	res.json(err);
	//
	//});

	// Error handler to display the validation error as HTML
	app.use(function(err, req, res, next) {
		if (err.message && err.status && /\d\d\d\sError: /.test(err.message)) {
			res.status(err.status);
			res.send({
				message: err.message // TODO: filter out the '404 Error' bit at the beginning
			}); // TODO: create fully fledged error object
		} else {
			next(err);
		}
	});

	app.listen(3000, () => {
		console.log('POST some data to http://localhost:3000');
	});
});
