var path = require('path');
var fs   = require('fs');

var nodeModules = {};
fs.readdirSync('node_modules')
		.filter(function(x) { return ['.bin'].indexOf(x) === -1 })
	    .filter(function(x) { return ['open-physiology-model'].indexOf(x) === -1 })
		.forEach(function(mod) { nodeModules[mod] = 'commonjs ' + mod });

module.exports = {
	devtool: 'source-map',
	entry: {
		'server/server':             ['babel-polyfill', './src/server/server.es6.js'            ],
		'tools/buildSwaggerJSON':    ['babel-polyfill', './src/tools/buildSwaggerJSON.es6.js'   ]
	},
	output: {
		path:              './dist',
		filename:          '[name].js',
		sourceMapFilename: '[file].map'
	},
	target: 'node',
	node: {
		__filename: true,
		__dirname:  false
	},
	externals: nodeModules,
	module: {
		loaders: [
			{
				test: /\.js$/,
				exclude: /node\_modules/,
				loader: 'babel'
			},
			{
				test: /\.json$/,
				loader: 'json'
			},
			{
				test: /open-physiology-model/,
				loader: 'babel'
			},
			{
				test: /node_modules[\/\\]utilities[\/\\]src[\/\\].*\.js$/,
				loader: 'babel-loader'
			}
		]
	}
};
