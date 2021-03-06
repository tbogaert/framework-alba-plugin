# Copyright 2016 iNuron NV
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
Contains the AlbaBackendViewSet
"""

from backend.decorators import load
from backend.decorators import log
from backend.decorators import required_roles
from backend.decorators import return_list
from backend.decorators import return_object
from backend.decorators import return_task
from backend.serializers.serializers import FullSerializer
from ovs.dal.hybrids.albabackend import AlbaBackend
from ovs.dal.lists.albabackendlist import AlbaBackendList
from ovs.lib.albacontroller import AlbaController
from rest_framework import status
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.decorators import link
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


class AlbaBackendViewSet(viewsets.ViewSet):
    """
    Information about ALBA Backends
    """
    permission_classes = (IsAuthenticated,)
    prefix = r'alba/backends'
    base_name = 'albabackends'

    @log()
    @required_roles(['read'])
    @return_list(AlbaBackend)
    @load()
    def list(self):
        """
        Lists all available ALBA Backends
        """
        return AlbaBackendList.get_albabackends()

    @log()
    @required_roles(['read'])
    @return_object(AlbaBackend)
    @load(AlbaBackend)
    def retrieve(self, albabackend):
        """
        Load information about a given AlbaBackend
        :param albabackend: ALBA backend to retrieve
        """
        return albabackend

    @log()
    @required_roles(['read', 'write', 'manage'])
    @load()
    def create(self, request):
        """
        Creates an AlbaBackend
        :param request: Data regarding ALBA backend to create
        """
        serializer = FullSerializer(AlbaBackend, instance=AlbaBackend(), data=request.DATA, allow_passwords=True)
        if serializer.is_valid():
            alba_backend = serializer.object
            alba_backend.save()
            alba_backend.backend.status = 'INSTALLING'
            alba_backend.backend.save()
            AlbaController.add_cluster.delay(alba_backend.guid)
            serializer = FullSerializer(AlbaBackend, contents='', instance=alba_backend)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @log()
    @required_roles(['read', 'write', 'manage'])
    @return_task()
    @load(AlbaBackend)
    def destroy(self, albabackend):
        """
        Deletes an AlbaBackend
        :param albabackend: ALBA backend to destroy
        """
        return AlbaController.remove_cluster.delay(albabackend.guid)

    @action()
    @log()
    @required_roles(['read', 'write', 'manage'])
    @return_task()
    @load(AlbaBackend)
    def add_units(self, albabackend, asds):
        """
        Add storage units to the backend and register with alba nsm
        :param albabackend:     albabackend to add unit to
        :param asds:         list of ASD ids
        """
        return AlbaController.add_units.s(albabackend.guid, asds).apply_async(queue='ovs_masters')

    @link()
    @log()
    @required_roles(['read', 'manage'])
    @return_task()
    @load(AlbaBackend)
    def get_config_metadata(self, albabackend):
        """
        Gets the configuration metadata for an Alba backend
        :param albabackend: ALBA backend to retrieve metadata for
        """
        return AlbaController.get_config_metadata.delay(albabackend.guid)

    @link()
    @log()
    @required_roles(['read'])
    @load(AlbaBackend)
    def get_available_actions(self, albabackend):
        """
        Gets a list of all available actions
        :param albabackend: ALBA backend to retrieve available actions for
        """
        actions = []
        if len(albabackend.asds) == 0:
            actions.append('REMOVE')
        return Response(actions, status=status.HTTP_200_OK)

    @action()
    @log()
    @required_roles(['read', 'write', 'manage'])
    @return_task()
    @load(AlbaBackend)
    def add_preset(self, albabackend, name, compression, policies, encryption):
        """
        Adds a preset to a backend
        :param albabackend: ALBA backend to add preset for
        :param name: Name of preset
        :param compression: Compression type
        :param policies: Policies linked to the preset
        :param encryption: Encryption type
        """
        return AlbaController.add_preset.delay(albabackend.guid, name, compression, policies, encryption)

    @action()
    @log()
    @required_roles(['read', 'write', 'manage'])
    @return_task()
    @load(AlbaBackend)
    def delete_preset(self, albabackend, name):
        """
        Deletes a preset
        :param albabackend: ALBA backend to delete present from
        :param name: Name of preset to delete
        """
        return AlbaController.delete_preset.delay(albabackend.guid, name)

    @action()
    @log()
    @required_roles(['read', 'write', 'manage'])
    @return_task()
    @load(AlbaBackend)
    def update_preset(self, albabackend, name, policies):
        """
        Updates a preset's policies to a backend
        :param albabackend: ALBA backend to update preset for
        :param name: Name of preset
        :param policies: Policies to set
        """
        return AlbaController.update_preset.delay(albabackend.guid, name, policies)

    @link()
    @log()
    @required_roles(['read'])
    @return_task()
    @load(AlbaBackend)
    def calculate_safety(self, albabackend, asd_id):
        """
        Returns the safety resulting the removal of a given disk
        :param albabackend: ALBA backend to calculate safety for
        :param asd_id: ID of the ASD to calculate safety off
        """
        return AlbaController.calculate_safety.delay(albabackend.guid, [asd_id])
