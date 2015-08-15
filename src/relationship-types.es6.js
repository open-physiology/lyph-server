export default {
	processes:      {
		singular: "process",
		plural:   "processes",
		schema:   {
			properties: {
				type:    { type: 'string', required: true },
				subtype: { type: 'string' }
			}
		}
	},
	instantiates:   {
		schema: {
			properties: {}
		}
	},
	hasLayer:       {
		schema: {
			properties: {
				position: { type: 'number', required: true }
			}
		}
	},
	hasMaterial:    {
		schema: {
			properties: {}
		}
	},
	onBorderOf:     {
		schema: {
			properties: {
				border: { enum: ['plus', 'minus', 'inner', 'outer'], required: true }
			}
		}
	},
	publishedIn:    {
		schema: {
			properties: {}
		}
	},
	correlates:     {
		schema: {
			properties: {}
		}
	},
	sub:            {
		schema: {
			properties: {}
		}
	},
	locatedIn:      {
		schema: {
			properties: {}
		}
	},
	associatedWith: {
		schema: {
			properties: {}
		}
	}
};
