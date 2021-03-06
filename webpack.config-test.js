var webpack = require('webpack');
var fs      = require('fs');
var path    = require('path');
var loaders = require('./webpack.loaders.js');

module.exports = {
	devtool: 'source-map',
	module: {
		loaders: loaders
	},
    output: {
		// source-map support for IntelliJ/WebStorm
		devtoolModuleFilenameTemplate:         '[absolute-resource-path]',
		devtoolFallbackModuleFilenameTemplate: '[absolute-resource-path]?[hash]'
	},
	target: 'node',
	externals: [require('webpack-node-externals')({
		whitelist: ['utilities', 'open-physiology-model', 'open-physiology-manifest']
	})],
    node: {
        __filename: true,
        __dirname:  false
    }
};
