module.exports = [
	{
		test: /\.js$/,
		exclude: /node_modules/,
		loader: 'babel-loader'
	},
	{
		test: /icons[\/\\]\w+\.png$/,
		loader: 'url-loader?limit=20000'
	},
    {
        test: /\.json$/,
        loader: 'json-loader'
    },
    {
		test: /node_modules[\/\\](utilities|open-physiology-model|open-physiology-manifest)[\/\\]src[\/\\].*\.js$/,
		loader: 'babel-loader'
	}
];
