// imports
var express = require('express');
var bodyParser = require('body-parser');

// the express application
var app = express();

// middleware
app.use(bodyParser.json());

// to implement an API for a specific type of entity (e.g., lyphs)
function implementAPI(entity) {
	app.get('/' + entity, (req, res) => {
		res.send("You requested the " + entity + " collection.");
	});
	app.get('/' + entity + '/:id', (req, res) => {
		res.send("You requested " + entity + " '" + req.params.id + "'");
	});
	app.post('/' + entity, (req, res) => {
		res.send("You created a new " + entity + " with fields \n" + JSON.stringify(req.body, null, '    '));
	});
	app.post('/' + entity + '/:id', (req, res) => {
		res.send("You modified " + entity + " '" + req.params.id + "' with fields \n" + JSON.stringify(req.body, null, '    '));
	});
	app.put('/' + entity, (req, res) => {
		res.send("You created a new " + entity + " with full body \n" + JSON.stringify(req.body, null, '    '));
	});
	app.put('/' + entity + '/:id', (req, res) => {
		res.send("You replaced " + entity + " '" + req.params.id + "' with full body \n" + JSON.stringify(req.body, null, '    '));
	});
	app.delete('/' + entity + '/:id', (req, res) => {
		res.send("You deleted " + entity + " '" + req.params.id + "'");
	});
}

// Test stuff
implementAPI('lyphs');
implementAPI('connections');
implementAPI('templates');
implementAPI('nodes');

// start listening on port 3000 (temporary)
var server = app.listen(3000);
