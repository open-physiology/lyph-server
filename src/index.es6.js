// imports
var express = require('express');
var bodyParser = require('body-parser');

// the express application
var app = express();

// middleware
app.use(bodyParser.json());

// to implement an API for a specific type of entity (e.g., lyphs)
function implementEntity(name) {
	app.get('/' + name, (req, res) => {
		res.send("You requested the " + name + " collection.");
	});
	app.get('/' + name + '/:id', (req, res) => {
		res.send("You requested " + name + " '" + req.params.id + "'");
	});
	app.post('/' + name, (req, res) => {
		res.send("You created a new " + name + " with fields \n" + JSON.stringify(req.body, null, '    '));
	});
	app.post('/' + name + '/:id', (req, res) => {
		res.send("You modified " + name + " '" + req.params.id + "' with fields \n" + JSON.stringify(req.body, null, '    '));
	});
	app.put('/' + name, (req, res) => {
		res.send("You created a new " + name + " with full body \n" + JSON.stringify(req.body, null, '    '));
	});
	app.put('/' + name + '/:id', (req, res) => {
		res.send("You replaced " + name + " '" + req.params.id + "' with full body \n" + JSON.stringify(req.body, null, '    '));
	});
	app.delete('/' + name + '/:id', (req, res) => {
		res.send("You deleted " + name + " '" + req.params.id + "'");
	});
}



// Test stuff
[
	'lyphs',
	'layers',
	'materials',
	'lyphTemplates',
	'layerTemplates',
	'materialTemplates',
	'nodes',
	'processes',
	'correlations',
	'publications',
	'variables',
	'clinicalIndices',
	'locatedMeasures',
	'bagsOfPathology'
].forEach(implementEntity);


// start listening on port 3000 (temporary)
var server = app.listen(3000);
