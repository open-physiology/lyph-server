import {MongoClient} from 'mongodb';

MongoClient.connect("mongodb://localhost:27017/lyphs", (err, db) => {
	if(err) { console.error("Error!", err) }

	///// Unique ID counter /////

	let idCounterCollection = db.collection('idCounter');

	/* initialize collection */
	idCounterCollection.count().then((count) => {
		if (count === 0) {
			coll.insertOne({ maxId: 0 });
		}
	});

	/* function for getting new ids */
	function newID() {
		return idCounterCollection.findOneAndUpdate({}, { $inc: { maxId: 1 } })
				.then(doc => doc.value.maxId);
	}




	///// Lyphs /////

	let lyphsCollection = db.collection('lyphs');


	function createNewLyph() {

	}


	// TODO: remove/use test code
	//lyphsCollection.insertOne({
	//	name: "Cool Lyph!!!!!!",
	//	species: "Monkey"
	//}, (err, result) => {
	//	if(err) { console.error("Error inserting lyph") }
	//
	//	console.log(result);
	//
	//});


	// TODO: remove/use test code
	//lyphsCollection.findOne({ _id: mongo.ObjectID('55cdd44c35a626d877c03c27') }).then((doc) => {
	//	console.log(doc);
	//});


	// TODO: remove/use test code
	//cursor.forEach((doc) => {
	//	console.log(doc);
	//}, () => {
	//	console.log('(END)');
	//});

});
