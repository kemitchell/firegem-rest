firegem-rest
============

A REST API for node.js sitting on top of mongoose. Ideal for use with KendoUI.

Unit Tests
==========

In order to run the unit tests, firstly make sure you have a mongoDB instance running on port 5858.

Then, from the examples folder, run ./nodeunit

The tests will connect to the following mongoDB uri, and create test data:

mongodb://localhost/firegem-rest-test