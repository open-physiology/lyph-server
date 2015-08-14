import {GraphDatabase} from 'neo4j';


//let {username, password, server, port} = require('../neo4j-credentials.json');
//
//var db = new GraphDatabase(`http://${username}:${password}@${server}:${port}`);
//
////let testNode = db.createNode({
////	name:    "My Lyph",
////	species: "Human"
////});
////
////testNode.save((err, result) => {
////	console.log(result._data.data);
////
////	console.log(testNode.toString());
////});
//
//function createLyph(data) {
//	let node = db.createNode(data);
//
//	let result = node.save();
//
//	console.log(result);
//}
//
//createLyph({
//	name: "Heart",
//	species: "Human"
//});
