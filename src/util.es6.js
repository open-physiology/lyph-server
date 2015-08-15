export function promisify(obj, method, ...args) {
	return new Promise((resolve, reject) => obj[method](...args, (err, doc) => {
		if (err) { reject(err) }
		else { resolve(doc) }
	}));
}
