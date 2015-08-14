var webpack = require('webpack');
var path = require('path');
var fs = require('fs');

var nodeModules = {};
fs.readdirSync('node_modules')
		.filter(function(x) {
			return ['.bin'].indexOf(x) === -1;
		})
		.forEach(function(mod) {
			nodeModules[mod] = 'commonjs ' + mod;
		});

module.exports = {
	devtool: 'source-map',
	entry: {
		'index': ['babel/polyfill', './src/index.es6.js']
	},
	output: {
		path: './dist',
		filename: '[name].js',
		sourceMapFilename: '[file].map'
	},
	target: 'node',
	externals: nodeModules,
	module: {
		loaders: [
			{ test: /\.es6\.js$/, loader: 'babel' },
			{ test: /\.json$/, loader: 'json' }
		]
	}
};
