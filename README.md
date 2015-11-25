
## Installation

* Install Neo4J using your package manager
* Configure your machine so that Neo4j starts up on system boot (this might already be done for you by your package manager)
* If needed, manually start Neo4j
* Point your browser to:  http://localhost:7474.  Log in using username neo4j and password neo4j
* Optionally:  Change your neo4j username and password.  If you change it, edit this repository's file `config.json` accordingly.
* Clone this repository into a local directory. Go into that directory.
* Run: `npm install`. You only need to do this once.
* Run: `npm start`.
* If nothing goes wrong, the server should now be listening to the port specified in `config.json` (default: `8888`).
