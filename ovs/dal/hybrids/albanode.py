# Copyright 2014 Open vStorage NV
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""
AlbaNode module
"""
from ovs.dal.dataobject import DataObject
from ovs.dal.structures import Property, Relation, Dynamic
from ovs.dal.hybrids.storagerouter import StorageRouter
from ovs.extensions.plugins.asdmanager import ASDManagerClient
from ovs.extensions.plugins.albacli import AlbaCLI


class AlbaNode(DataObject):
    """
    The AlbaNode contains information about nodes (containing OSDs)
    """
    __properties = [Property('ip', str, doc='IP Address'),
                    Property('port', int, doc='Port'),
                    Property('node_id', str, doc='Alba node_id identifier'),
                    Property('username', str, doc='Username of the AlbaNode'),
                    Property('password', str, doc='Password of the AlbaNode'),
                    Property('type', ['ASD', 'SUPERMICRO'], default='ASD', doc='The type of the AlbaNode')]
    __relations = [Relation('storagerouter', StorageRouter, 'alba_nodes', mandatory=False, doc='StorageRouter hosting the AlbaNode')]
    __dynamics = [Dynamic('ips', list, 3600),
                  Dynamic('all_disks', list, 5)]

    def __init__(self, *args, **kwargs):
        """
        Initializes an AlbaNode, setting up its additional helpers
        """
        DataObject.__init__(self, *args, **kwargs)
        self._frozen = False
        self.client = ASDManagerClient(self)
        self._frozen = True

    def _ips(self):
        """
        Returns the IPs of the node
        """
        return self.client.get_ips()

    def _all_disks(self):
        """
        Returns a live list of all disks on this node
        """

        disks = self.client.get_disks()
        # TODO: report node down
        # if node down !!!
        if disks == []:
            from ovs.dal.lists.albabackendlist import AlbaBackendList
            for backend in AlbaBackendList.get_albabackends():
                # All backends of this node
                config_file = '/opt/OpenvStorage/config/arakoon/{0}-abm/{0}-abm.cfg'.format(backend.name)
                osds = AlbaCLI.run('list-osds', config=config_file, as_json=True)
                for osd in osds:
                    if osd.get('node_id') == self.node_id:
                        disks.append({'asd_id': osd.get('long_id'),
                                      'node_id': osd.get('node_id'),
                                      'port': osd.get('port'),
                                      'available': False,
                                      'state': {'state': 'error', 'detail': 'node down'},
                                      'log_level': 'info',
                                      'device': osd.get('long_id'),
                                      'home': osd.get('long_id'),
                                      'mountpoint': osd.get('long_id'),
                                      'name': osd.get('long_id'),
                                      'usage': {'available': 0, 'size': 0, 'used': 0},
                                      })
        return disks
