if (typeof Error.prototype.toJSON !== 'function') {
	Object.defineProperty(Error.prototype, 'toJSON', {
		value: function () {
			var alt = {};
			Object.getOwnPropertyNames(this).forEach(function (key) {
				alt[key] = this[key];
			}, this);
			return alt;
		},
		configurable: true
	});
}

if (typeof Object.entries !== 'function') {
	Object.defineProperty(Object, 'entries', {
		*value(obj) {
			for (let key of Object.keys(obj)) {
				yield [key, obj[key]];
			}
		}
	});
}

if (typeof Object.values !== 'function') {
	Object.defineProperty(Object, 'values', {
		*value(obj) {
			for (let key of Object.keys(obj)) {
				yield obj[key];
			}
		}
	});
}
