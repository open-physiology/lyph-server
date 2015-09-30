module.exports = {
	devtool: 'source-map',
	entry: {
		'client/index': ['babel/polyfill', './src/client/index.es6.js']
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
