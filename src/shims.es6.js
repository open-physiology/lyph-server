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
