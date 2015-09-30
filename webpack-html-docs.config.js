module.exports = {
	devtool: 'source-map',
	entry: {
		'html-docs/index': ['babel/polyfill', './src/html-docs/index.es6.js']
	},
	output: {
		path: './dist',
		filename: '[name].js',
		sourceMapFilename: '[file].map'
	},
	module: {
		loaders: [
			{ test: /\.es6\.js$/, loader: 'babel' },
			{ test: /\.json$/,    loader: 'json'  }
		]
	}
};
