"""Support for RESTful switches."""
import asyncio
import logging

import aiohttp
import async_timeout
import voluptuous as vol

from homeassistant.components.switch import PLATFORM_SCHEMA, SwitchDevice
from homeassistant.const import (
    CONF_HEADERS,
    CONF_METHOD,
    CONF_NAME,
    CONF_PASSWORD,
    CONF_RESOURCE,
    CONF_RESOURCE_TEMPLATE,
    CONF_TIMEOUT,
    CONF_USERNAME,
    CONF_VERIFY_SSL,
)
from homeassistant.helpers.aiohttp_client import async_get_clientsession
import homeassistant.helpers.config_validation as cv

_LOGGER = logging.getLogger(__name__)

CONF_BODY_OFF = "body_off"
CONF_BODY_ON = "body_on"
CONF_IS_ON_TEMPLATE = "is_on_template"
CONF_RESOURCE_STATE="resource_state"
CONF_RESOURCE_STATE_TEMPLATE="resource_state_template"

DEFAULT_METHOD = "post"
DEFAULT_BODY_OFF = "OFF"
DEFAULT_BODY_ON = "ON"
DEFAULT_NAME = "REST Switch"
DEFAULT_TIMEOUT = 10
DEFAULT_VERIFY_SSL = True

SUPPORT_REST_METHODS = ["post", "put"]

PLATFORM_SCHEMA = PLATFORM_SCHEMA.extend(
    {
        vol.Exclusive(CONF_RESOURCE, CONF_RESOURCE): cv.url,
        vol.Exclusive(CONF_RESOURCE_TEMPLATE, CONF_RESOURCE): cv.template,
        vol.Exclusive(CONF_RESOURCE_STATE, CONF_RESOURCE_STATE): cv.string,
        vol.Exclusive(CONF_RESOURCE_STATE_TEMPLATE, CONF_RESOURCE_STATE): cv.template,
        vol.Optional(CONF_HEADERS): vol.Schema({cv.string: cv.template}),
        vol.Optional(CONF_BODY_OFF, default=DEFAULT_BODY_OFF): cv.template,
        vol.Optional(CONF_BODY_ON, default=DEFAULT_BODY_ON): cv.template,
        vol.Optional(CONF_IS_ON_TEMPLATE): cv.template,
        vol.Optional(CONF_METHOD, default=DEFAULT_METHOD): vol.All(
            vol.Lower, vol.In(SUPPORT_REST_METHODS)
        ),
        vol.Optional(CONF_NAME, default=DEFAULT_NAME): cv.string,
        vol.Optional(CONF_TIMEOUT, default=DEFAULT_TIMEOUT): cv.positive_int,
        vol.Inclusive(CONF_USERNAME, "authentication"): cv.string,
        vol.Inclusive(CONF_PASSWORD, "authentication"): cv.string,
        vol.Optional(CONF_VERIFY_SSL, default=DEFAULT_VERIFY_SSL): cv.boolean,
    }
)

PLATFORM_SCHEMA = vol.All(
    cv.has_at_least_one_key(CONF_RESOURCE, CONF_RESOURCE_TEMPLATE), PLATFORM_SCHEMA
)


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    """Set up the RESTful switch."""
    body_off = config.get(CONF_BODY_OFF)
    body_on = config.get(CONF_BODY_ON)
    is_on_template = config.get(CONF_IS_ON_TEMPLATE)
    method = config.get(CONF_METHOD)
    headers = config.get(CONF_HEADERS)
    name = config.get(CONF_NAME)
    username = config.get(CONF_USERNAME)
    password = config.get(CONF_PASSWORD)
    resource = config.get(CONF_RESOURCE)
    resource_template = config.get(CONF_RESOURCE_TEMPLATE)
    resource_state = config.get(CONF_RESOURCE_STATE)
    resource_state_template = config.get(CONF_RESOURCE_STATE_TEMPLATE)
    verify_ssl = config.get(CONF_VERIFY_SSL)

    if resource_template is not None:
        resource_template.hass = hass
        resource = resource_template.async_render()

    if resource_state_template is not None:
        resource_state_template.hass = hass
        resource_state = resource_state_template.async_render()

    if headers is not None:
        for header_template in headers.values():
            header_template.hass = hass

    auth = None
    if username:
        auth = aiohttp.BasicAuth(username, password=password)

    if is_on_template is not None:
        is_on_template.hass = hass
    if body_on is not None:
        body_on.hass = hass
    if body_off is not None:
        body_off.hass = hass
    timeout = config.get(CONF_TIMEOUT)

    try:
        switch = RestSwitch(
            name,
            resource,
            resource_template,
            resource_state,
            resource_state_template,
            method,
            headers,
            auth,
            body_on,
            body_off,
            is_on_template,
            timeout,
            verify_ssl,
        )

        req = await switch.get_device_state(hass)
        if req.status >= 400:
            _LOGGER.warning("Got non-ok response from resource: %s", req.status)
    except (TypeError, ValueError):
        _LOGGER.error(
            "Missing resource or schema in configuration. "
            "Add http:// or https:// to your URL"
        )
    except (asyncio.TimeoutError, aiohttp.ClientError):
        _LOGGER.warning("No route to resource/endpoint: %s", resource)

    async_add_entities([switch])


class RestSwitch(SwitchDevice):
    """Representation of a switch that can be toggled using REST."""

    def __init__(
        self,
        name,
        resource,
        resource_template,
        resource_state,
        resource_state_template,
        method,
        headers,
        auth,
        body_on,
        body_off,
        is_on_template,
        timeout,
        verify_ssl,
    ):
        """Initialize the REST switch."""
        self._state = None
        self._name = name
        self._resource = resource
        self._resource_template = resource_template
        self._resource_state = resource_state
        self._resource_state_template = resource_state_template
        self._method = method
        self._headers = headers
        self._auth = auth
        self._body_on = body_on
        self._body_off = body_off
        self._is_on_template = is_on_template
        self._timeout = timeout
        self._verify_ssl = verify_ssl

    def set_url(self, url):
        """Set url."""
        self._resource = url

    @property
    def available(self):
        """Return the availability of this sensor."""
        _LOGGER.debug("State: %s", self._state)
        return self._state is not None

    @property
    def name(self):
        """Return the name of the switch."""
        return self._name

    @property
    def is_on(self):
        """Return true if device is on."""
        return self._state

    async def async_turn_on(self, **kwargs):
        """Turn the device on."""
        body_on_t = self._body_on.async_render()

        try:
            req = await self.set_device_state(body_on_t)

            if req.status == 200:
                self._state = True
            else:
                _LOGGER.warning(
                    "Can't turn on %s. Is resource/endpoint offline?", self._resource
                )
        except (asyncio.TimeoutError, aiohttp.ClientError):
            _LOGGER.warning("Error while switching on %s", self._resource)

    async def async_turn_off(self, **kwargs):
        """Turn the device off."""
        body_off_t = self._body_off.async_render()

        try:
            req = await self.set_device_state(body_off_t)
            if req.status == 200:
                self._state = False
            else:
                _LOGGER.warning(
                    "Can't turn off %s. Is resource/endpoint offline?", self._resource
                )
        except (asyncio.TimeoutError, aiohttp.ClientError):
            _LOGGER.warning("Error while switching off %s", self._resource)

    async def set_device_state(self, body):
        """Send a state update to the device."""
        websession = async_get_clientsession(self.hass, self._verify_ssl)

        if self._resource_template is not None:
            self.set_url(self._resource_template.async_render())

        headers = {}
        if self._headers:
            for header_name, header_template in self._headers.items():
                headers[header_name] = header_template.async_render()

        with async_timeout.timeout(self._timeout):
            req = await getattr(websession, self._method)(
                self._resource,
                auth=self._auth,
                data=bytes(body, "utf-8"),
                headers=headers,
            )
            return req

    async def async_update(self):
        """Get the current state, catching errors."""
        try:
            await self.get_device_state(self.hass)
        except asyncio.TimeoutError:
            _LOGGER.warning("Timed out while fetching data")
        except aiohttp.ClientError as err:
            _LOGGER.warning("Error while fetching data: %s", err)

    async def get_device_state(self, hass):
        """Get the latest data from REST API and update the state."""
        websession = async_get_clientsession(hass, self._verify_ssl)

        resource_state = self._resource

        if self._resource_template is not None:
            resource_state = self._resource_template.async_render()

        if self._resource_state is not None:
            resource_state = self._resource_state

        if self._resource_state_template is not None:
            resource_state = self._resource_state_template.async_render()

        headers = {}
        if self._headers:
            for header_name, header_template in self._headers.items():
                headers[header_name] = header_template.async_render()

        with async_timeout.timeout(self._timeout):
            req = await websession.get(
                resource_state, auth=self._auth, headers=headers
            )
            text = await req.text()

        _LOGGER.debug("Raw response is (%s): %s", req.status, text)

        if self._is_on_template is not None:
            text = self._is_on_template.async_render_with_possible_json_value(
                text, "False"
            )

            _LOGGER.debug("Value after template rendering: %s", text)
            text = text.lower()

            if text == "true":
                self._state = True
            elif text == "false":
                self._state = False
            else:
                self._state = None
        else:
            if text == self._body_on.template:
                self._state = True
            elif text == self._body_off.template:
                self._state = False
            else:
                self._state = None

        return req
