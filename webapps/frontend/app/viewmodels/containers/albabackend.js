// Copyright 2014 CloudFounders NV
// All rights reserved
/*global define */
define([
    'jquery', 'knockout',
    'ovs/generic', 'ovs/api',
    '../containers/backend'
], function($, ko, generic, api, Backend) {
    "use strict";
    return function(guid) {
        var self = this;

        // Handles
        self.loadHandle = undefined;

        // Observables
        self.loading     = ko.observable(false);
        self.loaded      = ko.observable(false);
        self.guid        = ko.observable(guid);
        self.name        = ko.observable();
        self.accesskey   = ko.observable();
        self.backend     = ko.observable();
        self.backendGuid = ko.observable();
        self.color       = ko.observable();

        // Functions
        self.fillData = function(data) {
            self.name(data.name);
            self.accesskey(data.accesskey);
            if (self.backendGuid() !== data.backend_guid) {
                self.backendGuid(data.backend_guid);
                self.backend(new Backend(data.backend_guid));
            }

            self.loaded(true);
            self.loading(false);
        };
        self.load = function() {
            return $.Deferred(function(deferred) {
                self.loading(true);
                if (generic.xhrCompleted(self.loadHandle)) {
                    self.loadHandle = api.get('alba/backends/' + self.guid(), { queryparams: { contents: '_relations' } })
                        .done(function(data) {
                            self.fillData(data);
                            deferred.resolve(data);
                        })
                        .fail(deferred.reject)
                        .always(function() {
                            self.loading(false);
                        });
                } else {
                    deferred.reject();
                }
            }).promise();
        };
    };
});
