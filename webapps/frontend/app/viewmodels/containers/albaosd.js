// Copyright 2014 CloudFounders NV
// All rights reserved
/*global define */
define([
    'knockout',
    'ovs/generic'
], function(ko, generic) {
    "use strict";
    return function(name, node) {
        var self = this;

        // Variables
        self.node = node;

        // Observables
        self.loaded     = ko.observable(false);
        self.name       = ko.observable(name);
        self.asdID      = ko.observable();
        self.statistics = ko.observable();
        self.status     = ko.observable();
        self.device     = ko.observable();
        self.mountpoint = ko.observable();
        self.port       = ko.observable();
        self.processing = ko.observable(false);

        // Functions
        self.fillData = function(data) {
            self.status(data.status);
            generic.trySet(self.asdID, data, 'asd_id');
            generic.trySet(self.statistics, data, 'statistics');
            generic.trySet(self.device, data, 'device');
            generic.trySet(self.mountpoint, data, 'mountpoint');
            generic.trySet(self.port, data, 'port');

            self.loaded(true);
        };
        self.initialize = function() {
            self.processing(true);
            self.node.initializeNode(self.name())
                .always(function() {
                    self.processing(false);
                });
        };
        self.remove = function() {
            self.processing(true);
            self.node.removeNode(self.name())
                .always(function() {
                    self.processing(false);
                });
        };
        self.claim = function() {
            self.processing(true);
            self.node.claimOSD(self.asdID(), self.name())
                .always(function() {
                    self.processing(false);
                });
        };
    };
});
