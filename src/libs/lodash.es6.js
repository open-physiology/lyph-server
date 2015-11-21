/* import lodash (and our Object shims) */
import _ from '../../node_modules/lodash';
import '../shims.es6.js';
import util from 'util';


/* remove _ from global context */
_.noConflict();


/* extract LodashWrapper */
const LodashWrapper = _([]).constructor;


/* make it @@iterator compatible */
Object.assign(LodashWrapper.prototype, {

	[Symbol.iterator]() {
		let value = this.value();
		if (_.isPlainObject(value)) {
			return Object.entries(value)[Symbol.iterator]();
		} else {
			return value[Symbol.iterator]();
		}
	},

	entries() { return this.pairs() }

});


/* re-export */
export default _;
