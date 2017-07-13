var webpack           = require('webpack');
var CopyWebpackPlugin = require('copy-webpack-plugin');

var fs                = require('fs');
var path              = require('path');
var loaders           = require('./webpack.loaders.js');

module.exports = {
	devtool: 'source-map',
	context: __dirname + '/src',
	entry: {
        'server/server':             ['babel-polyfill', './server/server.es6.js'            ],
        'tools/buildSwaggerJSON':    ['babel-polyfill', './tools/buildSwaggerJSON.es6.js'   ]
	},
    externals: [require('webpack-node-externals')({
        whitelist: ['utilities', 'open-physiology-model', 'open-physiology-manifest']
    })],
	output: {
		path: __dirname + '/dist',
		filename: '[name].js',
		library: 'lyph-server',
		libraryTarget: 'umd',
		sourceMapFilename: '[file].map',
		devtoolModuleFilenameTemplate:         '[absolute-resource-path]',
		devtoolFallbackModuleFilenameTemplate: '[absolute-resource-path]?[hash]'
	},
	module: {
		loaders: loaders
	},
	plugins: [
		new webpack.optimize.OccurrenceOrderPlugin()
	],
    node: {
        __filename: true,
        __dirname:  false
    },
    target: 'node'
};
