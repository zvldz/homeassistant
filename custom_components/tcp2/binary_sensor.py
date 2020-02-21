"""Provides a binary sensor which gets its values from a TCP2 socket."""
import logging

from homeassistant.components.binary_sensor import BinarySensorDevice

from .sensor import CONF_VALUE_ON, PLATFORM_SCHEMA, Tcp2Sensor

_LOGGER = logging.getLogger(__name__)

PLATFORM_SCHEMA = PLATFORM_SCHEMA.extend({})


def setup_platform(hass, config, add_entities, discovery_info=None):
    """Set up the TCP2 binary sensor."""
    add_entities([Tcp2BinarySensor(hass, config)])


class Tcp2BinarySensor(BinarySensorDevice, Tcp2Sensor):
    """A binary sensor which is on when its state == CONF_VALUE_ON."""

    required = (CONF_VALUE_ON,)

    @property
    def is_on(self):
        """Return true if the binary sensor is on."""
        return self._state == self._config[CONF_VALUE_ON]
