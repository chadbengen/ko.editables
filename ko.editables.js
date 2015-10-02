// ko.editables v0.10 for KnockoutJS
// https://github.com/romanych/ko.editables/
// http://romanych.github.com/ko.editables/
// editable extender and ko.editable plugin for viewModels
// (c) Roman Gomolko - rgomolko@gmail.com
// License: MIT (http://www.opensource.org/licenses/mit-license.php)

/*
Exports: 
ko.extenders.editable: ko.observable().extend({editable: true|false});
ko.editable: ko.editable(objectWithObservables, boolean autoInit);

Editable adds following methods into observables and objects:
- beginEdit()
- commit()
- rollback()
- hasChanges() - observable
- isEditing()
*/

(function (factory) {
    // Module systems magic dance.

    if (typeof require === "function" && typeof exports === "object" && typeof module === "object") {
        // CommonJS or Node: hard-coded dependency on "knockout"
        factory(require("knockout"), exports);
    } else if (typeof define === "function" && define["amd"]) {
        // AMD anonymous module with hard-coded dependency on "knockout"
        define(["knockout", "exports"], factory);
    } else {
        // <script> tag: use the global `ko` object, attaching a `mapping` property
        factory(ko)
    }

}(function (ko, undefined) {
    var deferredDependentObservable = function (readFunction) {
        return ko.dependentObservable({ read: readFunction, deferEvaluation: true });
    };

    var defaultScope = '';
    var editableObservables = {
        _observables: {},
        add: function (scope, observable) {
            if (!this._observables.hasOwnProperty(scope)) {
                this._observables[scope] = ko.observableArray();
            }
            this._observables[scope].push(observable);
        },
        get: function (scope) {
            scope = scope === undefined ? defaultScope : scope;
            if (!this._observables.hasOwnProperty(scope)) {
                throw new Error('Unknown scope ' + scope);
            }
            return ko.utils.unwrapObservable(this._observables[scope]);
        }
    };

    editableObservables._observables[defaultScope] = ko.observableArray();

    function newScope() {
        return '_scope' + (++newScope.counter);
    }

    newScope.counter = 0;

    var comparers = {
        'scalar': function (actualValue, originalValue) {
            return actualValue == originalValue;
        },
        'array': function (actualValue, originalValue) {
            actualValue = actualValue || [];
            originalValue = originalValue || [];
            if (actualValue.length != originalValue.length) {
                return false;
            }
            for (var i = 0; i < actualValue.length; i++) {
                if (actualValue[i] !== originalValue[i]) {
                    return false;
                }
            }
            return true;
        }
    };

    var defaultParams = {
        enable: true
        , scope: defaultScope
    };

    ko.extenders['editable'] = function (target, params) {

        // Protect from double initialization
        if (target.hasOwnProperty('editable')) {
            return target;
        }
        if (typeof params != 'object') {
            params = {
                enable: params === undefined ? true : params,
                scope: defaultScope
            };
        } else {
            params = ko.utils.extend(ko.utils.extend({}, defaultParams), params);
        }
        target.editable = params.enable;

        if (!target.editable) {
            return target;
        }

        var oldValue;
        var equalityComparer = comparers['scalar'];
        var isEditing = target.isEditing = ko.observable(false);

        target.beginEdit = function () {
            if (isEditing()) {
                return;
            }
            var currentValue = target();
            if (currentValue instanceof Array) {
                currentValue = currentValue.slice(); // make copy
                equalityComparer = comparers['array'];
            }
            oldValue = currentValue;
            isEditing(true);
        };

        target.commit = function () {
            isEditing(false);
        };

        target.rollback = function () {
            if (isEditing() && target.hasChanges()) {
                if (target() instanceof Array) {
                    target(oldValue.slice());
                } else {
                    target(oldValue);
                }
            }
            isEditing(false);
        };

        target.oldValue = function () {
            return oldValue;
        };

        //target.hasChanges = deferredDependentObservable(function () {
        //    var hasChanges = isEditing() && !equalityComparer(target(), oldValue);
        //    return hasChanges;
        //});
        target.hasChanges = ko.pureComputed({
            read: () => {
                var hasChanges = isEditing() && !equalityComparer(target(), oldValue);
                return hasChanges;
            }
            , deferEvaluation: true
        });

        if (params.scope !== false) {
            editableObservables.add(params.scope, target);
        };

        return target;
    };

    function makeEditable(rootObject, scope, editables, processedObjects) {
        processedObjects = processedObjects || [];
        for (var propertyName in rootObject) {
            var propertyValue = rootObject[propertyName];
            if (ko.isWriteableObservable(propertyValue)) {
                if (propertyValue.editable !== false) {
                    propertyValue.extend({ editable: { enable: true, scope: scope } });

                    // Allow to skip observables extended with { editable: false } arguments
                    editables.push(propertyValue);
                }
            }

            if (ko.utils.arrayIndexOf(processedObjects, propertyValue) > -1) {
                continue;
            }

            processedObjects.push(propertyValue);

            var underlyingPropertyValue = ko.utils.unwrapObservable(propertyValue);

            if (typeof (underlyingPropertyValue) == 'object') {
                var isObservable = ko.isObservable(propertyValue);
                if (isObservable) {
                    if (ko.utils.arrayIndexOf(processedObjects, underlyingPropertyValue) > -1) {
                        continue;
                    }
                    processedObjects.push(underlyingPropertyValue);
                }

                makeEditable(underlyingPropertyValue, scope, editables, processedObjects);
            }
        }
    };

    ko.editable = function (viewModel, autoInit) {
        if (typeof (viewModel.beginEdit) == 'function') {
            return;
        }

        autoInit = autoInit === undefined ? true : autoInit;

        var allEditables = ko.observableArray();

        viewModel.isEditing = ko.pureComputed({
            read: () => {
                var editablesInEditMode = ko.utils.arrayFirst(allEditables(), function (editable) {
                    return editable.isEditing();
                });
                return editablesInEditMode != null;
            }
            , deferEvaluation: true
        });

        viewModel.beginEdit = function () {
            ko.utils.arrayForEach(allEditables(), function (obj) {
                obj.beginEdit();
            });
        };

        viewModel.commit = function () {
            debugger;
            ko.utils.arrayForEach(allEditables(), function (obj) {
                obj.commit();
            });
        };

        viewModel.rollback = function () {
            ko.utils.arrayForEach(allEditables(), function (obj) {
                obj.rollback();
            });
        };

        viewModel.hasChanges = ko.pureComputed({
            read: () => {
                var editableWithChanges = ko.utils.arrayFirst(allEditables(), function (editable) {
                    return editable.hasChanges();
                });
                return editableWithChanges != null;

            }
            , deferEvaluation: true
        });

        var scope = newScope();

        viewModel.addEditable = function (obj) {
            makeEditable(obj, scope, allEditables, []);
        };

        if (autoInit) {
            makeEditable(viewModel, scope, allEditables, []);
        }
    };

    ko.editable.enable = function (object, scope) {
        if (scope === undefined) {
            scope = defaultScope;
        }

        makeEditable(object, scope, []);
    };

    ko.editable.beginEdit = function (scope) {
        ko.utils.arrayForEach(editableObservables.get(scope), function (observable) {
            observable.beginEdit();
        });
    };

    ko.editable.commit = function (scope) {
        ko.utils.arrayForEach(editableObservables.get(scope), function (observable) {
            observable.commit();
        });
    };

    ko.editable.rollback = function (scope) {
        ko.utils.arrayForEach(editableObservables.get(scope), function (observable) {
            observable.rollback();
        });
    };

    ko.editable.hasChanges = function (scope) {
        var observables = editableObservables.get(scope);

        for (var i = 0, l = observables.length; i < l; i++) {
            if (observables[i].hasChanges()) {
                return true;
            }
        }
        return false;
    };

    ko.editable.isEditing = function (scope) {
        var observables = editableObservables.get(scope);

        if (observables) {
            return observables[0].isEditing();
        }
    }

    ko.editable._editables = editableObservables;

    ko.editable.getHasChangesFlag = function (scope) {
        return deferredDependentObservable(function () {
            return ko.editable.hasChanges(scope);
        }).extend({ throttle: 100 });
    };
}));

