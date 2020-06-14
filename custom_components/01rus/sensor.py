"""Support for the 01rus."""
from datetime import timedelta, date
from bs4 import BeautifulSoup
import logging
#import time

import requests
import voluptuous as vol

from homeassistant.components.sensor import PLATFORM_SCHEMA
from homeassistant.const import (
    ATTR_ATTRIBUTION,
    CONF_NAME,
    CONF_USERNAME,
    CONF_PASSWORD,
)
import homeassistant.helpers.config_validation as cv
from homeassistant.helpers.entity import Entity

_LOGGER = logging.getLogger(__name__)

ATTRIBUTION = "Data provided by 01rus.ru"
DEFAULT_NAME = " 01rus sensor"
SCAN_INTERVAL = timedelta(seconds=3600)

PLATFORM_SCHEMA = PLATFORM_SCHEMA.extend(
    {
        vol.Required(CONF_USERNAME): cv.string,
        vol.Required(CONF_PASSWORD): cv.string,
        vol.Optional(CONF_NAME, default=DEFAULT_NAME): cv.string,
    }
)


def setup_platform(hass, config, add_entities, discovery_info=None):
    name = config.get(CONF_NAME)
    username = config.get(CONF_USERNAME)
    password = config.get(CONF_PASSWORD)

    result = prov01rusSensor(name, username, password)
    result.update()

#   if result.data.get("error") == "111":
#       _LOGGER.error("data not available")
#       return

    add_entities([result])


class prov01rusSensor(Entity):

    def __init__(self, name, username, password):
        """Initialize the sensor."""
        self._name = name
        self._username = username
        self._password = password
        self.data = None

    @property
    def name(self):
        """Return the name of the sensor."""
        return self._name

    @property
    def device_state_attributes(self):
        """Return the state attributes of this device."""
        attr = {ATTR_ATTRIBUTION: ATTRIBUTION}
        raw_data = BeautifulSoup(self.data.text, "html.parser")
        _LOGGER.debug(raw_data)

        attr['up'] = round(float(raw_data.find_all('td')[9].get_text()), 2)
        attr['down'] = round(float(raw_data.find_all('td')[5].get_text()), 2)

        return attr

    @property
    def state(self):
        """Return the state of the device."""
        if self.data:
            return "OK"
        return None

    def update(self):
        """Get the latest data from 01rus."""
        url = 'http://abonent.01rus.ru/'

        try:
            session = requests.Session()

            request_data = {
                'username': self._username,
                'password': self._password,
            }

            response = session.post(url, data=request_data, headers=dict(Referer=url))

            start_date = date.today().strftime("01.%m.%Y")
            end_date = date.today() + timedelta(days=1)

            request_data = {
                'startDate':    start_date,
                'endDate':      end_date.strftime("%d.%m.%Y"),
                'serviceType':  '1',
            }

            self.data = session.post(url + 'user/traffic', data=request_data)
            _LOGGER.debug("Data fetched from resource: \n%s", self.data.text)
        except ValueError as err:
            _LOGGER.error("Error retrieving data from 01rus.ru: %s", err.args)
            self.data = None
