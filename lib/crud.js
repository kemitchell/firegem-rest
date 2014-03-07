var fs = require('fs');
var util = require('util');
var mongoose = require('mongoose');
var _ = require("underscore");
var winston = require('winston');

exports.bindCrud = function(app, name, model, options) {
	var crud = new exports.Crud(model, options);
	var urlBase = '/api/' + name;

	app.get(urlBase + '/:id', function(req, res, next) { crud.get(req, res, next); });
	app.get(urlBase, function(req, res, next) { crud.list(req, res, next); });
	app.post(urlBase + '/create', function(req, res, next) { crud.create(req, res, next); });
	app.put(urlBase + '/update', function(req, res, next) { crud.update(req, res, next); });
	app.delete(urlBase + '/destroy', function(req, res, next) { crud.destroy(req, res, next); });

	return crud;
}

exports.bindRead = function(app, name, model, options) {
	var crud = new exports.Crud(model, options);
	var urlBase = '/api/' + name;

	app.get(urlBase + '/:id', function(req, res, next) { crud.get(req, res, next); });
	app.get(urlBase, function(req, res, next) { crud.list(req, res, next); });

	return crud;
}

exports.Crud = function(model, options) {

	var defaultOptions = {
		// List of editable fields
		fields: {},
		foreignKeys: {},
		populate: null // if a function, the return value is passed to the populate method.
	}

	this.options = _.extend(defaultOptions, options);

	this.model = model;
	this.modelName = model.modelName;

	this.pageSizes = [1,5,10,15,20,30,50];
	this.defaultPageSize = 15;

	this.list = function(req, res, next) {

 		/* Example: 
 		req.query =
 		{
 			"sort": [{"field":"resourceType","dir":"desc","compare":""}],
 			"filter":{"logic":"and","filters":[{"field":"resourceType","operator":"eq","value":"Trainee"}]}
 			"take": 1,
 			"skip": 0,
 			"page": 1,
 			"pageSize":1
 		}
 		*/

 		var mongoFilter = [];
 		var mongoFilterLogic = null;
 		if (req.query['filter']) {

 			var filter = req.query['filter'];
 			if (!_.isArray(filter.filters))
 				filter.filters = [filter.filters];


 			if (filter.filters.length) {

 				for (var idx = 0; idx < filter.filters.length; idx++) {
	 				var condition = filter.filters[idx];

	 				condition.operator = (condition.operator || 'eq').toLowerCase();
	 				if (condition.field && condition.value) {
	 					
		 				var mongoCondition = {};
	 					if (condition.operator != 'eq') {
		 					var operator = "$" + condition.operator; // $ne, $gt, $gte, $lt, $lte
		 					var functor = {};
		 					functor[operator] = condition.value;
		 					mongoCondition[condition.field] = functor;
		 				} else {
		 					mongoCondition[condition.field] = condition.value;
		 				}

						mongoFilter.push(mongoCondition);
					} else {
						// TODO: invalid input, error?
					}

 				}

 				mongoFilterLogic = (filter.logic || 'and').toUpperCase();
 			}
 		}

 		var mongoLimit = this.defaultPageSize;
 		var mongoSkip = 0;
 		if (req.query['take']) {
 			var take = parseInt(req.query['take']);
 			if (!isNaN(take)) {
 				// Valid page size?
 				if (this.pageSizes.indexOf(take) != -1) {
 					mongoLimit = take;
 				}
 			} else {
 				// TODO: Error invalid input!
 			}
 		}
 		if (req.query['skip']) {
 			var skip = parseInt(req.query['skip']);
 			if (!isNaN(skip)) {
 				// Make sure that we always start at the beginning of the given page size
 				mongoSkip = skip - (skip % mongoLimit);
 			} else {
 				// TODO: Error invalid input!
 			}
 		}

 		var mongoSort = null;
 		if (req.query['sort']) {
 			var sorts = req.query['sort'];
 			if (_.isArray(sorts)) {
 				sorts = [sorts];
 			}

 			if (sorts.length > 0) {
	 			mongoSort = {};
	 			for (var idx = 0; idx < sorts.length; idx++) {
	 				var sort = sorts[idx];
		 			if (sort.field && sort.dir) {
		 				mongoSort[sort.field] = (sort.dir || 'asc').toUpperCase() == 'ASC' ? 1 : -1; 
		 			} else {
		 				// TODO: Error/Warning! Invalid arguments.
		 			}
	 			}
	 		}
 		}

 		var data = {};
 		
 		var baseWhere = this.createBaseWhere(req);

 		var qry = this.model.find(baseWhere);
 		if (mongoFilter.length > 0) {
			if (mongoFilterLogic == 'AND')
				qry = qry.and(mongoFilter);
			else
				qry = qry.or(mongoFilter);
 		}

 		var self = this;

 		// Error callback for the promises defined below.
 		var onReject = function(reason) {
 				// One of the promises failed, probably due to invalid input or an exception.
 				// Let the error handler know.
	 			next(reason);
	 		};
 		
 		// First run the query without sorting or pagination, to get the total count.
 		// We are using promises, which are returned by the count / find functions, since
 		// we require two queries to be run.
 		var pms = qry.count(function(err, cnt) {
 			// This gets called before pms is defined , if there are errors in the qry itself.
 			if (err) {
 				onReject(err);
 			} else {
 				pms.fulfill(cnt);
 			}
 		}).exec();
 		pms.onReject(onReject);

 		var pms2 = pms.then(function(count) {
				data.total = count;

				// Re-execute the query, adding sort and pagination.
				qry = self.model.find(baseWhere);
		 		if (mongoFilter.length > 0) {
					if (mongoFilterLogic == 'AND')
						qry = qry.and(mongoFilter);
					else
						qry = qry.or(mongoFilter);
		 		}

		 		qry = qry.skip(mongoSkip);
		 		qry = qry.limit(mongoLimit);

		 		qry = self._populateQry(qry, req);

		 		if (mongoSort)
		 			qry = qry.sort(mongoSort);


				return qry.find(function(err, data) {
					if (err) {
						next(err);
					} else {
						pms2.fulfill(data);
					}
				}).exec();
	 		});
 		pms2.onReject(onReject);

	 	var pms3 = pms2.then(function(rows) {

	 			data.data = rows;
	 			pms3.fulfill(data);

	 		});
	 	pms3.onReject(onReject);
	 	pms3.onFulfill(function(data) {
	 			// Mission complete! Send the data back to the requester
	 			res.send(data);
	 		});
	};

	this.get = function(req, res, next) {
		var id = req.params.id;
		try {
			(new mongoose.Schema.Types.ObjectId()).castForQuery(id);
		} catch (err) {
			id = null;
		}

		var qry = this.model.find({_id: id});
		qry = this._populateQry(qry);
		
		return qry.exec(function(err, data) {
			if (err) {
				if (_.isFunction(next))
					return next(err);
				else 
					return;
			}

			res.send({
				data: data,
				total: data.length,
				id: id
			});
		});
	};

	this.create = function(req, res, next) {
		var self = this;
		var returnVal = {
			errors: [],
			models: []
		};
		var failed = false;
		var models = null;
		if (req.body.models) {

			models = JSON.parse(req.body.models);
			if (_.isArray(models)) {

				for (var idx = 0; idx < models.length; idx++) {
					var inst = models[idx];

					var obj = new this.model({});
					var pms = this._writeEditableFields(obj, inst);
					
					pms.then(onFieldsWritten, onFailed)
					   .then(onSaved, onFailed)
					   .then(onRefreshed, onFailed)
					   .then(null, onFailed);
				}
			} else {
				onFailed(new Error("Cannot create, 'models' parameter does not represent a JSON array."));
			}
		} else {
			onFailed(new Error("Cannot create, 'models' parameter does not exist."));
		}

		function onSaved(data) {

			if (_.isArray(data.errors) && data.errors.length > 0) {
    			winston.info(data.errors.length + " validation errors exist on " + self.modelName);
    			return data.errors;
			} else {
				if (data.numSaved == 0)
	    			winston.info("No fields updated on " + self.modelName);
	    		else
	    			winston.info("Created new " + self.modelName);

	    		return data.model;
	    	}
		}

		function onRefreshed(data) {

			if (_.isArray(data)) {
				returnVal.errors = returnVal.errors.concat(data);
    			returnVal.models.push(null);
			} else {
    			returnVal.models.push(data);
    		}

    		if (returnVal.models.length === models.length && !failed) {
			    return res.json(returnVal);
    		}

		};

		function onFailed(ex) {
			if (!failed) {
				failed = true;
				next(ex);
			}
		}
	};

	this.update = function(req, res, next) {
		var self = this;
		var returnVal = {
			errors: [],
			models: []
		};
		var updatePending = {};
		var failed = false;
		var popArgs = this._populateCreateArgs(req);

		if (req.body.models) {

			var models = JSON.parse(req.body.models);
			if (_.isArray(models)) {

				for (var idx = 0; idx < models.length; idx++) {
					var inst = models[idx];

					updatePending[inst._id] = inst;
					var qry = this.model.findOne({_id: inst._id});

					if (popArgs !== null)
						qry = qry.populate(popArgs);

					qry.exec()
						.then(onFound, onFailed)
						.then(onFieldsWritten, onFailed)
						.then(onUpdated, onFailed)
						.then(onRefreshed, onFailed)
						.then(null, onFailed);

				}
			} else {
				throw new Error("Cannot update, 'models' parameter does not represent a JSON array.");
			}
		} else {
			throw new Error("Cannot update, 'models' parameter does not exist.");
		}

		return;

		function onFailed(ex) {
			if (!failed) {
				failed = true;
				next(ex);
			}
		}

		function onFound(model) {

			var inst = updatePending[model._id];

			return self._writeEditableFields(model, inst);
		}

		function onUpdated(data) {
			
			var model = data.model;
			
			if (_.isArray(data.errors) && data.errors.length > 0) {
    			winston.info(data.errors.length + " validation errors exist on " + self.modelName + " with ID: " + data.model._id);
    			return data.errors;
			} else {
				if (data.numSaved == 0)
	    			winston.info("No fields updated on " + self.modelName + " with ID: " + data.model._id);
	    		else
	    			winston.info("Updated Existing " + self.modelName + " with ID: " + data.model._id);

				if (popArgs !== null) {
					// Re-fetch and populate the model, in case some of the FK's changed.
					// Need to fetch, since there isn't a way to un-populate a model.
					return self.model.findOne({_id: model._id}).populate(popArgs).exec();
				} else {
					return model;
				}
			}
		};

		function onRefreshed(data) {

			if (_.isArray(data)) {
				returnVal.errors = returnVal.errors.concat(data);
    			returnVal.models.push(null);
			} else {
    			returnVal.models.push(data);
    		}

    		if (returnVal.models.length === models.length && !failed) {
			    return res.json(returnVal);
    		}

		};
	};

	this.destroy = function(req, res) {
		var _this = this;
		var destroyed = [];
		if (req.body.models) {

			var models = JSON.parse(req.body.models);
			if (_.isArray(models)) {

				for (var idx = 0; idx < models.length; idx++) {
					var inst = models[idx];

					this.model.findById(inst._id, function(error, obj) {
						// TODO: If error?
						return obj.remove(function(error) {
							if (error) // TODO: return std error struct?
								winston.error(error);
							else {
								winston.info("Destroyed " + _this.modelName + " with ID: " + inst._id);
							}

				    		// TODO: Do we need to return anything useful?
				    		destroyed.push({});
				    		if (destroyed.length == models.length) {
							    res.json(destroyed);
				    		}
						})
					});
				}
			} else {
				throw new Error("Cannot destroy, 'models' parameter does not represent a JSON array.");
			}
		} else {
			throw new Error("Cannot destroy, 'models' parameter does not exist.");
		}
	};

	function onFieldsWritten(data) {

		var savePromise = new mongoose.Promise;
		var fulfullData = {
			errors: [],
			model: data.model,
			numSaved: 0
		};
		var numCheckedDocuments = 0;

		if (data.dirtyDocuments.length == 0)
			savePromise.fulfill(fulfullData);
		else {
			var pendingSave = data.dirtyDocuments.length;
			
			// Validate first, so we save either all or nothing if validation
			// errors exist.
			_.each(data.dirtyDocuments, function(doc) {
				doc.validate(onFieldsValidated);
			});
		}

		return savePromise;
	
		function onFieldsValidated(err) {
			
			if (err) {
				fulfullData.errors.push(err);
			}

			numCheckedDocuments++;
			
			if (numCheckedDocuments === data.dirtyDocuments.length) {
				if (fulfullData.errors.length == 0)
					return saveDirtyDocuments();
				else
				    return savePromise.fulfill(fulfullData);
			}
		}
		
		function saveDirtyDocuments() {
			
			_.each(data.dirtyDocuments, function(doc) {
				doc.save(function(err, object) {
					fulfullData.numSaved++;
					if (savePromise != null) {
						pendingSave--;
						if (err)
							return savePromise.reject(err);
						
						if (pendingSave == 0)
							return savePromise.fulfill(fulfullData);
					}
				});
			});
			
		}
	}

	/* If callback is null, returns a promise. */
	this._writeEditableFields = function(body, inst, callback) {
		if (this.options.fields.length == 0) {
			throw new Error('No editable fields defined in options.');
		}

		var promise = new mongoose.Promise();
		if (callback) promise.addBack(callback);

		writeFields(this.options.fields, body, inst, resolveFn.bind(promise));

		return promise;

		function resolveFn(err, arg1, arg2) {
			if (err) return this.error(err);
			return this.fulfill({ model: arg1, dirtyDocuments: arg2 });
		}

		function writeFields(fields, body, inst, cb) {

			var dirtyDocuments = [];
			if (!(body instanceof mongoose.Model)) {
				return cb(null, body, dirtyDocuments);
			}

			var refFields = {};
			var isModified = false;
			for (var idx = 0; idx < fields.length; idx++) {
				var fieldName = fields[idx];
				var fieldSchema = body.schema.paths[fieldName];

				if (!fieldSchema) {
					// If no exact path match, see if we are looking for a field on a referenced object?
					var periodIdx = fieldName.indexOf('.');
					if (periodIdx != -1) {
						var refFieldName = fieldName.substring(0, periodIdx);
						var refFieldSchema = body.schema.paths[refFieldName];
					
						if (refFieldSchema && refFieldSchema['options'] && refFieldSchema.options['ref']) {
							// Yes, a ref field exists with the first segment of this path.
							var refField = refFields[refFieldName];
							if (!refField) {
								refField = {
									name: refFieldName,
									fields: []
								};
								refFields[refFieldName] = refField;
							}
							refField.fields.push(fieldName.substring(periodIdx + 1));
							continue;
						}
					}
					
					winston.warn('Field \'%s\' does not exist on model.', fieldName);
					continue;
				}

				// If we are here, then fieldName references either this, or a child document.
				// We support 'inst' being a non flat object, however our fieldName references a 
				// flat name. We need to go looking for the value.
				var value = inst[fieldName];
				if (fieldSchema && 
					(typeof(value) === 'undefined' || _.isObject(value)))
				{
					var paths = fieldName.split('.');
					value = inst;
					for (var pathIdx = 0; pathIdx < paths.length; pathIdx++) {
						var thisPath = paths[pathIdx];
						if (value === undefined || value === null)
							break;
						if (thisPath == '')
							throw new Error('Invalid path provided: ' + fieldName);
						value = value[thisPath];
					}
				}

				if (value === inst)
					throw new Error('Invalid path provided: ' + fieldName);

				if (typeof(value) !== 'undefined') {

					var populated = body.populated(fieldName);
					if (!body.schema.paths[fieldName])
						debugger;
					var ref = body.schema.paths[fieldName].options['ref'];
					
					if (ref) {

						var refSchema = mongoose.modelSchemas[ref];
						if (!refSchema.options.id)
							throw new Error('Schema "' + ref + '" must have an _id field.');

						if (populated) {
							if (body[fieldName]._id != value._id) {
								body.set(fieldName, value._id);
								isModified = true;
								var tmp = body.populated(fieldName);
							} else {
								// We can try to update the fields on the FK instance later if the ID was unchanged.
								continue;
							}

						} else {
							// New instance
							if (_.isObject(value))
								value = value['_id'];
							
							body.set(fieldName, value);
							isModified = true;
						}
					} else {
						body.set(fieldName, value);
						isModified = true;
					}
				}
			}
			
			if (isModified || body.isModified())
				dirtyDocuments.push(body);

			_.each(refFields, function(value) {
				var fieldName = value.name;
				var ref = body.schema.paths[fieldName].options['ref'];
				if (!ref)
					throw new Error('Attempting to set sub document when "ref" option not configured on schema');

				if (body[fieldName] !== undefined && inst[fieldName] != undefined)
					return writeFields(value.fields, body[fieldName], inst[fieldName], childWriteFieldsCb);
			});

			function childWriteFieldsCb(err, body, docs) {
				if (!err)
					dirtyDocuments = _.union(dirtyDocuments, docs);
				else
					throw err;
			};

			return cb(null, body, dirtyDocuments);
		}
	}

	/* Creates a where clause to handle foreign keys */
	this._fks = function(req) {
		var fks = this.options.foreignKeys;
		if ('[object Function]' == Object.prototype.toString.call(fks)) {
			fks = fks(req);
		}

		return fks;
	}

	/* Creates a where clause to handle data permissions */
	this._perms = function(req) {
		return {};
	}

	this._populateQry = function(qry, req) {
		var args = this._populateCreateArgs(req);
		if (args === null)
			return qry;
		return qry.populate(args);
	}

	this._populateCreateArgs = function(req) {
		if (this.options.populate == null) return null;
		if (typeof (this.options.populate) == 'function') {
			return this.options.populate(req);
		}
		return this.options.populate;
	}

	this.createBaseWhere = function(req) {
		var fks = this._fks(req);
		var perms = this._perms(req);

		return _.extend({}, fks, perms);
	}
}
