
## Installation

* Install Docker using your package manager
* Run: `docker run --publish=7474:7474 neo4j`
* Point your browser to:  http://localhost:7474.  Log in using username `neo4j` and password `neo4j`
* Optionally:  Change your neo4j username and password.
* Clone this repository into a local directory. Go into that directory.
* Run: `npm install`. You only need to do this once.
* Copy the file `sample-config.json` and name the copy `config.json`; edit it to your needs.

Then every time you want to run the server:

* Run: `npm start` (also available: `npm stop` and `npm restart`)
* If nothing goes wrong, the server should now be listening to the port specified in `config.json` (default: `8888`).
