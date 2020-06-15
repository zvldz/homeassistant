"""Support for the 01rus.ru."""
from datetime import timedelta, date
from bs4 import BeautifulSoup
import logging

import requests
import voluptuous as vol

from homeassistant.components.sensor import PLATFORM_SCHEMA
from homeassistant.const import (
    ATTR_ATTRIBUTION,
    CONF_NAME,
    CONF_USERNAME,
    CONF_PASSWORD,
    HTTP_OK,
)
import homeassistant.helpers.config_validation as cv
from homeassistant.helpers.entity import Entity

_LOGGER = logging.getLogger(__name__)

ATTRIBUTION = "Data provided by 01rus.ru"
DEFAULT_NAME = "01rus.ru sensor"
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

    result = site01rusSensor(name, username, password)
    result.update()

    add_entities([result])


class site01rusSensor(Entity):

    def __init__(self, name, username, password):
        """Initialize the sensor."""
        self._name = name
        self._username = username
        self._password = password
        self._state = None
        self.data = None

    @property
    def name(self):
        """Return the name of the sensor."""
        return self._name

    @property
    def device_state_attributes(self):
        """Return the state attributes of this device."""
        if self.data is None:
            _LOGGER.error("Unable to retrieve data")
            return

        attr = {ATTR_ATTRIBUTION: ATTRIBUTION}
        raw_data = BeautifulSoup(self.data.text, "html.parser")
        _LOGGER.debug(raw_data)

        traff_in = raw_data.find('td', text='Входящий').findNextSibling('td')
        traff_out = raw_data.find('td', text='Исходящий').findNextSibling('td')

        if traff_in != None and traff_out != None:
            attr['down'] = round(float(traff_out.get_text()), 2)
            attr['up'] = round(float(traff_in.get_text()), 2)
        else:
            _LOGGER.warning("Result could not be parsed")

        return attr

    @property
    def state(self):
        """Return the state of the device."""
        return self._state

    def update(self):
        """Get the latest data from 01rus.ru."""
        self.data = None
        self._state = None

        url = 'http://abonent.01rus.ru/'
        request_data = {
            'username': self._username,
            'password': self._password,
        }

        try:
            session = requests.Session()
            response = session.post(url, data=request_data, headers=dict(Referer=url))

            if response.status_code != HTTP_OK:
                _LOGGER.error("Error %d on load URL %s", request.status, request.url)
                return None

            if response.url.find('user') == -1:
                _LOGGER.error("Failed to login to %s", url)
                return None

            raw_data = BeautifulSoup(response.text, "html.parser")
            balance = raw_data.find(class_='label label-warning')

            if balance is None:
                balance = raw_data.find(class_='label label-success')

            if balance is None:
                _LOGGER.warning("Can't get a balance")
            else:
                self._state = balance.contents[0].split()[0]

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
            _LOGGER.error("Error retrieving data from %s: %s", url, err.args)
