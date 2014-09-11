# Copyright 2014 CloudFounders NV
# All rights reserved

"""
AlbaController module
"""

from ovs.celery import celery
from ovs.log.logHandler import LogHandler

logger = LogHandler('alba.lib', name='alba')


class AlbaController(object):
    """
    Contains all BLL related to ALBA
    """

    @staticmethod
    @celery.task(name='alba.alba.dummy')
    def dummy(identifier):
        """
        Dummy does whatever dummies do.
        """
        _ = identifier
        return True
