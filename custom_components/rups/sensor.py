"""Support for raspberry ups."""
from datetime import timedelta
import logging

import voluptuous as vol

from homeassistant.components.sensor import PLATFORM_SCHEMA
from homeassistant.const import (
    CONF_NAME,
    CONF_MONITORED_VARIABLES,
    VOLT,
    ELECTRICAL_CURRENT_AMPERE,
    POWER_WATT,
)
import homeassistant.helpers.config_validation as cv
from homeassistant.helpers.entity import Entity
from homeassistant.util import Throttle

from ina219 import INA219
from ina219 import DeviceRangeError

_LOGGER = logging.getLogger(__name__)

DEFAULT_NAME = "raspberry_ups"

SCAN_INTERVAL = timedelta(seconds=30)
MIN_TIME_BETWEEN_UPDATES = timedelta(seconds=1)

SHUNT_OHMS = 0.05

SENSOR_TYPES = {
    "bus_voltage": ["bus_voltage", VOLT, "mdi:flash-circle"],
    "bus_current": ["bus_current", ELECTRICAL_CURRENT_AMPERE, "mdi:current-ac"],
    "power": ["power", POWER_WATT, "mdi:flash-outline"],
    "shunt_voltage": ["shunt_voltage", VOLT, "mdi:flash-circle"],
}

PLATFORM_SCHEMA = PLATFORM_SCHEMA.extend({
    vol.Optional(CONF_NAME, default=DEFAULT_NAME): cv.string,
    vol.Optional(CONF_MONITORED_VARIABLES,
        default=['bus_voltage', 'bus_current', 'power', 'shunt_voltage']):
    vol.All(cv.ensure_list, [vol.In(SENSOR_TYPES)]),
})

async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    name = config.get(CONF_NAME)
    ru_data = raspberryUpsData(hass.loop)
    sensors = []

    for variable in config[CONF_MONITORED_VARIABLES]:
        sensors.append(raspberryUpsSensor(ru_data, variable, name))
    async_add_entities(sensors, True)


class raspberryUpsSensor(Entity):

    def __init__(self, raspberryUps_data, sensor_type, name):
        """Initialize the sensor."""
        self.cname = name
        self.type = sensor_type
        self._name = SENSOR_TYPES[sensor_type][0]
        self._unit_of_measurement = SENSOR_TYPES[sensor_type][1]
        self._icon = SENSOR_TYPES[sensor_type][2]
        self.raspberryUps_data = raspberryUps_data
        self._state = None

    @property
    def name(self):
        """Return the name of the sensor."""
        return f"{self.cname}_{self._name}"

    @property
    def state(self):
        """Return the state of the sensor."""
        return self._state

    @property
    def unit_of_measurement(self):
        """Return the unit of measurement of this entity, if any."""
        return self._unit_of_measurement

    @property
    def icon(self):
        """Icon to use in the frontend, if any."""
        return self._icon

    async def async_update(self):
        """Get data from INA219"""
        await self.raspberryUps_data.async_update()
        if self.type in self.raspberryUps_data.data:
            self._state = round(self.raspberryUps_data.data[self.type], 3)

class raspberryUpsData:
    """Get the latest data and update the state."""

    def __init__(self, loop):
        """Initialize the data object."""
        self.loop = loop
        self.data = {}

    @Throttle(MIN_TIME_BETWEEN_UPDATES)
    async def async_update(self):
        try:
            ina = INA219(SHUNT_OHMS)
            ina.configure()
            self.data["bus_voltage"] = float(ina.voltage())
            self.data["bus_current"] = float(ina.current() / 1000)
            self.data["power"] = float(ina.power() / 1000)
            self.data["shunt_voltage"] = float(ina.shunt_voltage() / 1000)
            return True
        except (DeviceRangeError, FileNotFoundError) as err:
            _LOGGER.error("Error retrieving data from raspberry UPS: %s", err)
            return False

