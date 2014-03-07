var engineSvc = require('../../lib/crud.js');
var mongoose = require('mongoose');
var _ = require('underscore');

var schemaParent = mongoose.Schema({
	child: { type: mongoose.Schema.Types.ObjectId, ref: 'Child' },
	editable: { type: String },
	readonly: { type: String },
	complex: { 
		subdoc: { type: String } 
	}
});
var schemaChild = mongoose.Schema({
	subeditable: { type: String },
	subreadonly: { type: String }
});
var modelParent = mongoose.model('Parent', schemaParent);
var modelChild = mongoose.model('Child', schemaChild);

var db = null;

// Connect to database
exports.crud = {
	setUp: function(callback) {
		if (db !== null) 
			return callback();
		mongoose.connect('mongodb://localhost/firegem-rest-test');

		db = mongoose.connection;
		db.on('error', console.error.bind(console, 'connection error:'));
		db.once('open', callback);

		return ;
	},

	tearDown: function(callback) {
		return callback();
	},

	createTestData: function(test) {

		var pms = modelChild.remove({}).exec();
		var self = exports.crud;

		pms.then(function() 
			{
				return modelParent.remove({});

			}, onFailed)
			.then(function() 
			{
				return modelChild.create({ subeditable: 'sub-editable', subreadonly: 'sub-readonly' });

			}, onFailed)
			.then(function(child) 
			{
				return modelParent.create({ editable: 'editable', readonly: 'readonly', child: child._id });

			}, onFailed)
			.then(function(parent) 
			{	
				test.ok(parent._id);
				test.equal(parent.editable, 'editable');
				test.equal(parent.readonly, 'readonly');

				self.parentId = parent._id;
				test.done();
				return;

			}, onFailed)
			.then(null, onFailed)
			.end();

		return;

		function onFailed(err) {
			test.ifError(err);
			test.done();
		}
	},

	testGetExisting: function(test) {
		var self = exports.crud;
		
		var crud = new engineSvc.Crud(modelParent, { fields: ['editable'] });
		test.ok(crud);

		var req = {
			params: {
				id: self.parentId
			}
		};

		test.ok(self.parentId, 'ParentId not provided.');

		var res = {
			send: function(data) {
				test.doesNotThrow(function() {
					test.equal(_.isArray(data.data), true);
					test.equal(data.data.length, 1, 'Unexpected number of data rows received.');
					test.equal(data.data.length, data.total);
					test.equal(data.data[0].editable, 'editable');
					test.equal(data.data[0].readonly, 'readonly');
					test.equal(data.data[0]._id.toString(), self.parentId.toString());
				});
				test.done();
			}
		};

		return crud.get(req, res, next);

		function next(err) {
			console.log('in next');
			test.ifError(err);
			test.done();
		}
	},

	testGetPopulated: function(test) {
		var self = exports.crud;
		
		var crud = new engineSvc.Crud(modelParent, { fields: ['editable'],
				populate: function(req) {
					return 'child';
				} });
		test.ok(crud);

		var req = {
			params: {
				id: self.parentId
			}
		};

		test.ok(self.parentId, 'ParentId not provided.');

		var res = {
			send: function(data) {
				test.doesNotThrow(function() {
					test.equal(_.isArray(data.data), true);
					test.equal(data.data.length, 1, 'Unexpected number of data rows received.');
					test.equal(data.data.length, data.total);
					test.equal(data.data[0].editable, 'editable');
					test.equal(data.data[0].readonly, 'readonly');
					test.equal(data.data[0].child.subreadonly, 'sub-readonly');
					test.equal(data.data[0].child.subeditable, 'sub-editable');
					test.equal(data.data[0]._id.toString(), self.parentId.toString());
				});
				test.done();
			}
		};

		return crud.get(req, res, next);

		function next(err) {
			console.log('in next');
			test.ifError(err);
			test.done();
		}
	},

	testGetUnknown: function(test) {
		var self = exports.crud;
		
		var crud = new engineSvc.Crud(modelParent, { fields: ['editable'] });
		test.ok(crud);

		var req = {
			params: {
				id: null
			}
		};

		var res = {
			send: function(data) {
				test.doesNotThrow(function() {
					test.equal(_.isArray(data.data), true);
					test.equal(data.data.length, 0, 'Unexpected number of data rows received.');
					test.equal(data.data.length, data.total);
				});
				test.done();
			}
		};

		return crud.get(req, res, next);

		function next(err) {
			console.log('in next');
			test.ifError(err);
			test.done();
		}
	},

	testGetInvalid: function(test) {
		var self = exports.crud;
		
		var crud = new engineSvc.Crud(modelParent, { fields: ['editable'] });
		test.ok(crud);

		var req = {
			params: {
				id: 'ASDF-1234'
			}
		};

		var res = {
			send: function(data) {
				test.doesNotThrow(function() {
					test.equal(_.isArray(data.data), true);
					test.equal(data.data.length, 0, 'Unexpected number of data rows received.');
					test.equal(data.data.length, data.total);
				});
				test.done();
			}
		};

		return crud.get(req, res, next);

		function next(err) {
			test.ifError(err);
			test.done();
		}
	},

	testUpdateNoChange: function(test) {
		
		var self = exports.crud;

		var crud = new engineSvc.Crud(modelParent, { fields: ['editable'] });
		test.ok(crud);

		var req = {
			body: {
				models: JSON.stringify([{
					_id: self.parentId,
					editable: 'editable',
					readonly: 'readonly'
				}])
			}
		};

		var res = {
			json: function(data) {
				test.doesNotThrow(function() {
					test.equal(_.isArray(data.errors), true);
					test.equal(data.errors.length, 0, 'Unexpected number of errors.');
					test.equal(_.isArray(data.models), true);
					test.equal(data.models.length, 1, 'Unexpected number of data rows modified.');
					test.equal(data.models[0].editable, 'editable', 'Call to update modified value');
					test.equal(data.models[0].readonly, 'readonly', 'Call to update modified readonly value');
				});
				test.done();
			}
		};

		return crud.update(req, res, next);

		function next(err) {
			test.ifError(err);
			test.done();
		}
	},

	testUpdate: function(test) {
		
		var self = exports.crud;

		var crud = new engineSvc.Crud(modelParent, { fields: ['editable'] });
		test.ok(crud);

		var req = {
			body: {
				models: JSON.stringify([{
					_id: self.parentId,
					editable: 'new editable value',
					readonly: 'new readonly value'
				}])
			}
		};

		var res = {
			json: function(data) {
				test.doesNotThrow(function() {
					test.equal(_.isArray(data.errors), true);
					test.equal(data.errors.length, 0, 'Unexpected number of errors.');
					test.equal(_.isArray(data.models), true);
					test.equal(data.models.length, 1, 'Unexpected number of data rows modified.');
					test.equal(data.models[0].editable, 'new editable value', 'Call to update did not modify value');
					test.equal(data.models[0].readonly, 'readonly', 'Call to update modified readonly value');
				});
				test.done();
			}
		};

		return crud.update(req, res, next);

		function next(err) {
			test.ifError(err);
			test.done();
		}
	},

	testUpdateComplexPath: function(test) {
		
		var self = exports.crud;

		var crud = new engineSvc.Crud(modelParent, { fields: ['complex.subdoc'] });
		test.ok(crud);

		var req = {
			body: {
				models: JSON.stringify([{
					_id: self.parentId,
					complex: { subdoc: 'new subdoc value' }
				}])
			}
		};

		var res = {
			json: function(data) {
				test.doesNotThrow(function() {
					test.equal(_.isArray(data.errors), true);
					test.equal(data.errors.length, 0, 'Unexpected number of errors.');
					test.equal(_.isArray(data.models), true);
					test.equal(data.models.length, 1, 'Unexpected number of data rows modified.');
					test.equal(data.models[0].complex.subdoc, 'new subdoc value', 'Call to update did not modify value');
				});
				test.done();
			}
		};

		return crud.update(req, res, next);

		function next(err) {
			test.ifError(err);
			test.done();
		}
	},

	testUpdateWithChild: function(test) {
		var self = exports.crud;

		var crud = new engineSvc.Crud(modelParent, { fields: ['editable', 'child.subeditable'], populate: ['child'] });
		test.ok(crud);

		var req = {
			body: {
				models: JSON.stringify([{
					_id: self.parentId,
					editable: 'new editable value',
					readonly: 'new readonly value',
					child: {
						subeditable: 'new sub-editable value',
						subreadonly: 'new sub-readonly value'
					}
				}])
			}
		};

		var res = {
			json: function(data) {
				test.doesNotThrow(function() {
					test.equal(_.isArray(data.errors), true);
					test.equal(data.errors.length, 0, 'Unexpected number of errors.');
					test.equal(_.isArray(data.models), true);
					test.equal(data.models.length, 1, 'Unexpected number of data rows modified.');
					test.equal(data.models[0].editable, 'new editable value', 'Call to update did not modify value');
					test.equal(data.models[0].readonly, 'readonly', 'Call to update modified readonly value');
					test.equal(data.models[0].child.subeditable, 'new sub-editable value', 'Call to update did not modify value');
					test.equal(data.models[0].child.subreadonly, 'sub-readonly', 'Call to update modified readonly value');
				});
				test.done();
			}
		};

		return crud.update(req, res, next);

		function next(err) {
			test.ifError(err);
			test.done();
		}
	},

	testCreate: function(test) {
		
		var self = exports.crud;

		var crud = new engineSvc.Crud(modelChild, { fields: ['subeditable'] });
		test.ok(crud);

		var req = {
			body: {
				models: JSON.stringify([{
					subeditable: 'create editable value',
					subreadonly: 'create readonly value'
				}])
			}
		};

		var res = {
			json: function(data) {
				test.doesNotThrow(function() {
					test.equal(_.isArray(data.errors), true);
					test.equal(data.errors.length, 0, 'Unexpected number of errors.');
					test.equal(_.isArray(data.models), true);
					test.equal(data.models.length, 1, 'Unexpected number of data rows created.');
					test.equal(data.models[0].subeditable, 'create editable value', 'Call to create did not set value');
					test.equal(data.models[0].subreadonly, null, 'Call to create did not set value to null');
				});
				test.done();
			}
		};

		crud.create(req, res, next);

		function next(err) {
			test.ifError(err);
			test.done();
		}
	}
}