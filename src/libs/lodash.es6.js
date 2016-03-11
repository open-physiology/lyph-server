/* import lodash (and our Object shims) */
import _ from '../../node_modules/lodash';
import '../shims.es6.js';


/* remove _ from global context */
_.noConflict();


/* extract LodashWrapper */
const LodashWrapper = _([]).constructor;


/* make it @@iterator compatible */
if (!LodashWrapper.prototype[Symbol.iterator]) {
	Object.assign(LodashWrapper.prototype, {

		[Symbol.iterator]() {
			let value = this.value();
			if (_.isPlainObject(value)) {
				return Object.entries(value)[Symbol.iterator]();
			} else {
				return value[Symbol.iterator]();
			}
		}
		
	});
}
if (!LodashWrapper.prototype.entries) {
	Object.assign(LodashWrapper.prototype, {

		entries() { return this.pairs() }

	});
}


/* re-export */
export default _;
