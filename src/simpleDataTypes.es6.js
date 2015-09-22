export const simpleDataTypes = {

	key: {
		type: 'object',
		properties: {
			href: { type: 'string' }
		},
		required: ['href'],
		'x-skip-db': true
	},

	uri: {
		type: 'string',
		format: 'uri'
	},

	side: {
		type: 'string',
		enum: ['plus', 'minus', 'inner', 'outer']
	},

	polarity: {
		type: 'string',
		enum: ['plus', 'minus']
	}

};
