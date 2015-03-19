// Copyright 2014 CloudFounders NV
// All rights reserved
/*global define */
define([
    'jquery', 'durandal/app', 'knockout',
    'ovs/shared', 'ovs/generic', 'ovs/refresher', 'ovs/api',
    '../containers/backend', '../containers/backendtype', '../containers/albabackend',
    '../containers/albanode', '../containers/albaosd', '../containers/storagerouter'
], function($, app, ko, shared, generic, Refresher, api, Backend, BackendType, AlbaBackend, Node, OSD, StorageRouter) {
    "use strict";
    return function() {
        var self = this;

        // Variables
        self.shared             = shared;
        self.guard              = { authenticated: true };
        self.refresher          = new Refresher();
        self.widgets            = [];
        self.initializing       = false;
        self.nodesHandle        = {};
        self.storageRouterCache = {};

        // Observables
        self.backend                = ko.observable();
        self.albaBackend            = ko.observable();
        self.rNodesLoading          = ko.observable(true);
        self.dNodesLoading          = ko.observable(false);
        self.registeredNodes        = ko.observableArray([]);
        self.discoveredNodes        = ko.observableArray([]);
        self.disks                  = ko.observableArray([]);
        self.otherAlbaBackendsCache = ko.observable({});

        // Computed
        self.otherAlbaBackends = ko.computed(function() {
            var albaBackends = [], cache = self.otherAlbaBackendsCache(), counter = 0;
            $.each(cache, function(index, albaBackend) {
                if (albaBackend.guid() !== self.albaBackend().guid()) {
                    albaBackend.color(generic.getColor(counter));
                    albaBackends.push(albaBackend);
                    counter += 1;
                }
            });
            return albaBackends;
        });
        self.ASDStates = ko.computed(function() {
            var states = {
                claimed: 0,
                warning: 0,
                failure: 0
            };
            if (self.albaBackend() !== undefined) {
                $.each(self.registeredNodes(), function (index, node) {
                    $.each(node.disks(), function (jndex, disk) {
                        if (disk.albaBackendGuid() === self.albaBackend().guid()) {
                            if (disk.status() === 'claimed') {
                                states.claimed += 1;
                            }
                            if (disk.status() === 'error') {
                                states.failure += 1;
                            }
                            if (disk.status() === 'warning') {
                                states.warning += 1;
                            }
                        }
                    });
                });
            }
            return states;
        });

        // Functions
        self.discover = function() {
            self.dNodesLoading(true);
            self.fetchNodes(true);
        };
        self.load = function() {
            return $.Deferred(function (deferred) {
                var backend = self.backend(), backendType;
                backend.load()
                    .then(function(backendData) {
                        return $.Deferred(function(subDeferred) {
                            if (backend.backendType() === undefined) {
                                backendType = new BackendType(backend.backendTypeGuid());
                                backendType.load();
                                backend.backendType(backendType);
                            }
                            if (backendData.hasOwnProperty('alba_backend_guid') && backendData.alba_backend_guid !== null) {
                                if (self.albaBackend() === undefined) {
                                    self.albaBackend(new AlbaBackend(backendData.alba_backend_guid));
                                }
                                subDeferred.resolve(self.albaBackend());
                            } else {
                                if (!self.initializing) {
                                    self.initializing = true;
                                    api.post('alba/backends', {
                                        data: {
                                            backend_guid: self.backend().guid()
                                        }
                                    })
                                        .fail(function() {
                                            self.initializing = false;
                                        });
                                }
                                subDeferred.reject();
                            }
                        }).promise();
                    })
                    .then(function(albaBackend) {
                        return albaBackend.load();
                    })
                    .always(deferred.resolve);
            }).promise();
        };
        self.formatBytes = function(value) {
            return generic.formatBytes(value);
        };
        self.formatPercentage = function(value) {
            return generic.formatPercentage(value);
        };
        self.fetchNodes = function(discover) {
            if (discover === undefined) {
                discover = false;
            }
            discover = !!discover;
            if (self.albaBackend() === undefined) {
                return;
            }
            return $.Deferred(function(deferred) {
                if (generic.xhrCompleted(self.nodesHandle[discover])) {
                    var options = {
                        sort: 'box_id',
                        contents: 'box_id,_relations' + (discover ? ',_dynamics' : ''),
                        discover: discover,
                        alba_backend_guid: self.albaBackend().guid()
                    };
                    if (self.albaBackend() !== undefined) {
                        self.nodesHandle[discover] = api.get('alba/nodes', {queryparams: options})
                            .done(function (data) {
                                var nodeIDs = [], nodes = {}, oArray = discover ? self.discoveredNodes : self.registeredNodes;
                                $.each(data.data, function (index, item) {
                                    nodeIDs.push(item.box_id);
                                    nodes[item.box_id] = item;
                                });
                                generic.crossFiller(
                                    nodeIDs, oArray,
                                    function(boxID) {
                                        return new Node(boxID, self);
                                    }, 'boxID'
                                );
                                $.each(oArray(), function (index, node) {
                                    if ($.inArray(node.boxID(), nodeIDs) !== -1) {
                                        node.fillData(nodes[node.boxID()]);
                                        var sr, storageRouterGuid = node.storageRouterGuid();
                                        if (storageRouterGuid && (node.storageRouter() === undefined || node.storageRouter().guid() !== storageRouterGuid)) {
                                            if (!self.storageRouterCache.hasOwnProperty(storageRouterGuid)) {
                                                sr = new StorageRouter(storageRouterGuid);
                                                sr.load();
                                                self.storageRouterCache[storageRouterGuid] = sr;
                                            }
                                            node.storageRouter(self.storageRouterCache[storageRouterGuid]);
                                        }
                                    }
                                });
                                if (discover) {
                                    self.dNodesLoading(false);
                                } else {
                                    self.rNodesLoading(false);
                                }
                                deferred.resolve();
                            })
                            .fail(function () {
                                deferred.reject();
                            });
                    }
                } else {
                    deferred.resolve();
                }
            }).promise();
        };
        self.loadOSDs = function(data) {
            var diskNames = [], disks = {}, changes = data.all_disks.length !== self.disks().length;
            $.each(data.all_disks, function (index, disk) {
                diskNames.push(disk.name);
                disks[disk.name] = disk;
            });
            generic.crossFiller(
                diskNames, self.disks,
                function (name) {
                    return new OSD(name, self.albaBackend().guid());
                }, 'name'
            );
            $.each(self.disks(), function (index, disk) {
                if ($.inArray(disk.name(), diskNames) !== -1) {
                    disk.fillData(disks[disk.name()]);
                }
            });
            if (changes) {
                self.disks.sort(function (a, b) {
                    return a.name() < b.name() ? -1 : 1;
                });
            }
        };
        self.link = function() {
            var diskNames = [];
            $.each(self.disks(), function (index, disk) {
                diskNames.push(disk.name());
                if (disk.node === undefined) {
                    $.each(self.registeredNodes(), function(jndex, node) {
                        if (disk.boxID() === node.boxID()) {
                            disk.node = node;
                            node.disks.push(disk);
                            node.disks.sort(function (a, b) {
                                return a.name() < b.name() ? -1 : 1;
                            });
                        }
                    });
                }
            });
            $.each(self.registeredNodes(), function(jndex, node) {
                $.each(node.disks(), function(index, disk) {
                    if ($.inArray(disk.name(), diskNames) === -1) {
                        node.disks.remove(disk);
                        node.disks.sort(function (a, b) {
                            return a.name() < b.name() ? -1 : 1;
                        });
                    }
                });
            });
        };
        self.claimOSD = function(osds, disk) {
            return $.Deferred(function(deferred) {
                app.showMessage(
                    $.t('alba:disks.claim.warning', { what: disk }),
                    $.t('ovs:generic.areyousure'),
                    [$.t('ovs:generic.yes'), $.t('ovs:generic.no')]
                )
                    .done(function(answer) {
                        if (answer === $.t('ovs:generic.yes')) {
                            generic.alertSuccess(
                                $.t('alba:disks.claim.started'),
                                $.t('alba:disks.claim.msgstarted')
                            );
                            api.post('alba/backends/' + self.albaBackend().guid() + '/add_units', {
                                data: { asds: osds }
                            })
                                .then(self.shared.tasks.wait)
                                .done(function() {
                                    generic.alertSuccess(
                                        $.t('alba:disks.claim.complete'),
                                        $.t('alba:disks.claim.success')
                                    );
                                    deferred.resolve();
                                })
                                .fail(function(error) {
                                    generic.alertError(
                                        $.t('ovs:generic.error'),
                                        $.t('alba:disks.claim.failed', { why: error })
                                    );
                                    deferred.reject();
                                });
                        } else {
                            deferred.reject();
                        }
                    });
            }).promise();
        };
        self.claimAll = function(osds, disks) {
            return $.Deferred(function(deferred) {
                app.showMessage(
                    $.t('alba:disks.claimall.warning', { which: '<ul><li>' + disks.join('</li><li>') + '</li></ul>' }),
                    $.t('ovs:generic.areyousure'),
                    [$.t('ovs:generic.yes'), $.t('ovs:generic.no')]
                )
                    .done(function(answer) {
                        if (answer === $.t('ovs:generic.yes')) {
                            generic.alertSuccess(
                                $.t('alba:disks.claimall.started'),
                                $.t('alba:disks.claimall.msgstarted')
                            );
                            api.post('alba/backends/' + self.albaBackend().guid() + '/add_units', {
                                data: { asds: osds }
                            })
                                .then(self.shared.tasks.wait)
                                .done(function() {
                                    generic.alertSuccess(
                                        $.t('alba:disks.claimall.complete'),
                                        $.t('alba:disks.claimall.success')
                                    );
                                    deferred.resolve();
                                })
                                .fail(function(error) {
                                    generic.alertError(
                                        $.t('ovs:generic.error'),
                                        $.t('alba:disks.claimall.failed', { why: error })
                                    );
                                    deferred.reject();
                                });
                        } else {
                            deferred.reject();
                        }
                    });
            }).promise();
        };

        // Durandal
        self.activate = function(mode, guid) {
            self.backend(new Backend(guid));
            self.refresher.init(function() {
                self.load()
                    .then(self.loadOSDs)
                    .then(self.fetchNodes)
                    .then(self.link);
            }, 5000);
            self.refresher.run();
            self.refresher.start();
        };
        self.deactivate = function() {
            $.each(self.widgets, function(index, item) {
                item.deactivate();
            });
            self.refresher.stop();
        };
    };
});
