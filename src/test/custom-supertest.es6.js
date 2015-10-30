import _ from 'lodash';

import SuperTest from 'supertest';

Object.assign(SuperTest.Test.prototype, {
	expectArrayWith(fields, cb) {
		return this.expect((res) => {
			if (!Object.keys(fields).every((key) => res.body[0][key] === fields[key])) {
				let error = new Error("Expected response body to have different field values.");
				error.actual   = _.pick(res.body[0], Object.keys(fields));
				error.expected = fields;
				throw error;
			}
		}, cb);
	}
});

export default require('supertest-as-promised');
