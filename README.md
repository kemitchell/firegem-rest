firegem-rest
============

A REST API for node.js sitting on top of mongoose. Ideal for use with KendoUI.

This is a work in progress, not production ready.

This is one part of a collection of modules, under the firegem prefix.

Features
========

List 
	(filter, sort)

Get 
	(by ID)

Update/Insert/Delete 
	(multiple documents at once, by ID)
	(Update sub-documents and populated documents at the same time)

Foreign key constraints 
	(appends all mongo 'find' calls with an FK constraint)

Unit tests
	(Currently only List and Get)

Coming
======

List 
	(grouping)

Permissions model 
	(read/write)

Views
	(similar to a DB view)

More Unit Tests

Unit Tests
==========

In order to run the unit tests, firstly make sure you have a mongoDB instance running on port 5858.

Then, from the module base directory, run 

npm test

The tests will connect to the following mongoDB uri, and create test data:

mongodb://localhost/firegem-rest-test