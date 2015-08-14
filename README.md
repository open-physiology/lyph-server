
## Installation

* Install MongoDB. If you are unfamiliar with MongoDB, [this tutorial](http://www.mkyong.com/mongodb/mongodb-hello-world-example/) will be very instructive.
    - The package manager for most distributions will have it available.
    - E.g., in Ubuntu, just run: `apt-get install mongodb`
* Make sure `mongod` is run at machine startup. Also, run it now.
    - Many Linux package managers will auto-start the daemon at bootup.
    - E.g., with Ubuntu's apt-get, this is the case.
    - If not, a '@reboot' [cron-job](https://en.wikipedia.org/wiki/Cron) may be used to auto-start it.
