export function promisify(obj, method, ...args) {
	return new Promise((resolve, reject) => obj[method](...args, (err, doc) => {
		if (err) { reject(err) }
		else { resolve(doc) }
	}));
}

export function toCamelCase(str) {
	return str
			.replace(/\s(.)/g, (l) => l.toUpperCase())
			.replace(/\s/g, '')
			.replace(/^(.)/,   (l) => l.toLowerCase());
}

export function def(object, field, defaultValue) {
	if (typeof object[field] === 'undefined') {
		object[field] = defaultValue;
	}
	return object[field];
}

export const a = (object, field) => def(object, field, []);
export const o = (object, field) => def(object, field, {});
