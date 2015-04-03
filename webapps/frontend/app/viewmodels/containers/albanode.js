// Copyright 2014 CloudFounders NV
// All rights reserved
/*global define */
define([
    'jquery', 'knockout', 'durandal/app', 'plugins/dialog',
    'ovs/generic', 'ovs/api', 'ovs/shared',
    '../containers/albaosd', '../wizards/addalbanode/index'
], function($, ko, app, dialog, generic, api, shared, OSD, AddAlbaNodeWizard) {
    "use strict";
    return function(boxID, parent) {
        var self = this;

        // Variables
        self.shared  = shared;
        self.parent = parent;

        // External dependencies
        self.storageRouter = ko.observable();

        // Observables
        self.loaded            = ko.observable(false);
        self.guid              = ko.observable();
        self.ip                = ko.observable();
        self.port              = ko.observable();
        self.username          = ko.observable();
        self.boxID             = ko.observable(boxID);
        self.storageRouterGuid = ko.observable();
        self.disks             = ko.observableArray([]);
        self.ips               = ko.observableArray([]);

        // Computed
        self.diskRows         = ko.splitRows(3, self.disks);
        self.canInitializeAll = ko.computed(function() {
            var hasUninitialized = false;
            $.each(self.disks(), function(index, disk) {
                if (disk.status() === 'uninitialized' && disk.processing() === false) {
                    hasUninitialized = true;
                    return false;
                }
            });
            return hasUninitialized;
        });
        self.canClaimAll      = ko.computed(function() {
            var hasUnclaimed = false;
            $.each(self.disks(), function(index, disk) {
                if (disk.status() === 'available' && disk.processing() === false) {
                    hasUnclaimed = true;
                    return false;
                }
            });
            return hasUnclaimed;
        });

        // Functions
        self.fillData = function(data) {
            self.guid(data.guid);
            self.ip(data.ip);
            self.port(data.port);
            self.username(data.username);
            self.ips(data.ips);
            generic.trySet(self.storageRouterGuid, data, 'storagerouter_guid');

            self.loaded(true);
        };
        self.register = function() {
            dialog.show(new AddAlbaNodeWizard({
                modal: true,
                node: self
            }));
        };
        self.initializeNode = function(disk) {
            return $.Deferred(function(deferred) {
                generic.alertSuccess(
                    $.t('alba:disks.initialize.started'),
                    $.t('alba:disks.initialize.msgstarted')
                );
                api.post('alba/nodes/' + self.guid() + '/initialize_disks', {
                    data: { disks: [disk] }
                })
                    .then(self.shared.tasks.wait)
                    .done(function(failures) {
                        if (failures.length > 0) {
                            var error = 'Could not initialize disk';
                            generic.alertError(
                                $.t('ovs:generic.error'),
                                $.t('alba:disks.initialize.failed', { why: error })
                            );
                            deferred.reject();
                        } else {
                            generic.alertSuccess(
                                $.t('alba:disks.initialize.complete'),
                                $.t('alba:disks.initialize.success')
                            );
                            deferred.resolve();
                        }
                    })
                    .fail(function(error) {
                        generic.alertError(
                            $.t('ovs:generic.error'),
                            $.t('alba:disks.initialize.failed', { why: error })
                        );
                        deferred.reject();
                    });
            }).promise();
        };
        self.restartOSD = function(disk) {
            return $.Deferred(function(deferred) {
                generic.alertSuccess(
                    $.t('alba:disks.restart.started'),
                    $.t('alba:disks.restart.msgstarted')
                );
                api.post('alba/nodes/' + self.guid() + '/restart_disk', {
                    data: { disk: disk }
                })
                    .then(self.shared.tasks.wait)
                    .done(function() {
                        generic.alertSuccess(
                            $.t('alba:disks.restart.complete'),
                            $.t('alba:disks.restart.success')
                        );
                        deferred.resolve();
                    })
                    .fail(function(error) {
                        generic.alertError(
                            $.t('ovs:generic.error'),
                            $.t('alba:disks.restart.failed', { why: error })
                        );
                        deferred.reject();
                    });
            }).promise();
        };
        self.removeOSD = function(disk) {
            return $.Deferred(function(deferred) {
                var policies = [], info = '', entries = [], impact = self.parent.albaBackend().safety().removal_impact,
                    active_policy = self.parent.albaBackend().safety().active_policy;
                if (impact.hasOwnProperty(self.boxID())) {
                    if (impact[self.boxID()].new_policy !== null && !impact[self.boxID()].new_policy.equals(active_policy)) {
                        entries.push('<li>' + $.t('alba:disks.remove.impact.newpolicy', {what: JSON.stringify(impact[self.boxID()].new_policy)}) + '</li>');
                    } else if (impact[self.boxID()].new_policy === null) {
                        entries.push('<li>' + $.t('alba:disks.remove.impact.nopolicy') + '</li>');
                    }
                    if (impact[self.boxID()].lost_policies.length > 0) {
                        $.each(impact[self.boxID()].lost_policies, function (index, policy) {
                            policies.push(JSON.stringify(policy));
                        });
                        entries.push('<li>' + $.t('alba:disks.remove.impact.lostpolicies', {what: policies.join(', ')}) + '</li>');
                    }
                    if (entries.length > 0) {
                        info  = '<br /><div class="alert alert-danger">' + $.t('alba:disks.remove.impact.warning') + '<ul>';
                        info += entries.join('');
                        info += '</ul></div>';
                    }
                }
                app.showMessage(
                    $.t('alba:disks.remove.warning', { what: '<ul><li>' + disk + '</li></ul>', info: info }).trim(),
                    $.t('ovs:generic.areyousure'),
                    [$.t('ovs:generic.no'), $.t('ovs:generic.yes')]
                )
                    .done(function(answer) {
                        if (answer === $.t('ovs:generic.yes')) {
                            generic.alertSuccess(
                                $.t('alba:disks.remove.started'),
                                $.t('alba:disks.remove.msgstarted')
                            );
                            api.post('alba/nodes/' + self.guid() + '/remove_disk', {
                                data: {
                                    disk: disk,
                                    alba_backend_guid: self.parent.albaBackend().guid()
                                }
                            })
                                .then(self.shared.tasks.wait)
                                .done(function() {
                                    generic.alertSuccess(
                                        $.t('alba:disks.remove.complete'),
                                        $.t('alba:disks.remove.success')
                                    );
                                    deferred.resolve();
                                })
                                .fail(function(error) {
                                    generic.alertError(
                                        $.t('ovs:generic.error'),
                                        $.t('alba:disks.remove.failed', { why: error })
                                    );
                                    deferred.reject();
                                });
                        } else {
                            deferred.reject();
                        }
                    });
            }).promise();
        };
        self.claimOSD = self.parent.claimOSD;
        self.initializeAll = function() {
            return $.Deferred(function(deferred) {
                app.showMessage(
                    $.t('alba:disks.initializeall.warning'),
                    $.t('ovs:generic.areyousure'),
                    [$.t('ovs:generic.no'), $.t('ovs:generic.yes')]
                )
                    .done(function(answer) {
                        if (answer === $.t('ovs:generic.yes')) {
                            generic.alertSuccess(
                                $.t('alba:disks.initializeall.started'),
                                $.t('alba:disks.initializeall.msgstarted')
                            );
                            var diskNames = [];
                            $.each(self.disks(), function(index, disk) {
                                if (disk.status() === 'uninitialized' && disk.processing() === false) {
                                    disk.processing(true);
                                    diskNames.push(disk.name());
                                }
                            });
                            api.post('alba/nodes/' + self.guid() + '/initialize_disks', {
                                data: { disks: diskNames }
                            })
                                .then(self.shared.tasks.wait)
                                .done(function(failures) {
                                    if (failures.length > 0) {
                                        generic.alertInfo(
                                            $.t('alba:disks.initializeall.complete'),
                                            $.t('alba:disks.initializeall.somefailed', { which: '<ul><li>' + failures.join('</li><li>') + '</li></ul>' })
                                        );
                                        deferred.resolve();
                                    } else {
                                        $.each(self.disks(), function(index, disk) {
                                            if ($.inArray(disk.name(), diskNames) !== -1) {
                                                disk.ignoreNext(true);
                                                if (disk.status() === 'uninitialized') {
                                                    disk.status('initialized');
                                                }
                                            }
                                        });
                                        generic.alertSuccess(
                                            $.t('alba:disks.initializeall.complete'),
                                            $.t('alba:disks.initializeall.success')
                                        );
                                        deferred.resolve();
                                    }
                                })
                                .fail(function(error) {
                                    generic.alertError(
                                        $.t('ovs:generic.error'),
                                        $.t('alba:disks.initializeall.failed', { why: error })
                                    );
                                    deferred.reject();
                                })
                                .always(function() {
                                    $.each(self.disks(), function(index, disk) {
                                        if ($.inArray(disk.name(), diskNames) !== -1) {
                                            disk.processing(false);
                                        }
                                    });
                                });
                        } else {
                            deferred.reject();
                        }
                    });
            }).promise();
        };
        self.claimAll = function() {
            return $.Deferred(function(deferred) {
                var osds = {}, disks = [];
                $.each(self.disks(), function(index, disk) {
                    if (disk.status() === 'available' && disk.processing() === false) {
                        disk.processing(true);
                        disks.push(disk.name());
                        osds[disk.asdID()] = disk.node.guid();
                    }
                });
                self.parent.claimAll(osds, disks)
                    .done(function() {
                        $.each(self.disks(), function(index, disk) {
                            if ($.inArray(disk.name(), disks) !== -1) {
                                disk.ignoreNext(true);
                                if (disk.status() === 'available') {
                                    disk.status('claimed');
                                }
                            }
                        });
                    })
                    .always(function() {
                        $.each(self.disks(), function(index, disk) {
                            if ($.inArray(disk.name(), disks) !== -1) {
                                disk.processing(false);
                            }
                        });
                        deferred.resolve();
                    });
            }).promise();
        };
    };
});
