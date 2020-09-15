"""Support for RESTful binary sensors."""
import logging

from requests.auth import HTTPBasicAuth, HTTPDigestAuth
import voluptuous as vol

from homeassistant.components.binary_sensor import (
    DEVICE_CLASSES_SCHEMA,
    PLATFORM_SCHEMA,
    BinarySensorEntity,
)
from homeassistant.const import (
    CONF_AUTHENTICATION,
    CONF_DEVICE_CLASS,
    CONF_FORCE_UPDATE,
    CONF_HEADERS,
    CONF_METHOD,
    CONF_NAME,
    CONF_PASSWORD,
    CONF_PAYLOAD,
    CONF_RESOURCE,
    CONF_RESOURCE_TEMPLATE,
    CONF_TIMEOUT,
    CONF_USERNAME,
    CONF_VALUE_TEMPLATE,
    CONF_VERIFY_SSL,
    HTTP_BASIC_AUTHENTICATION,
    HTTP_DIGEST_AUTHENTICATION,
)
import homeassistant.helpers.config_validation as cv
from homeassistant.helpers.reload import setup_reload_service

from . import DOMAIN, PLATFORMS
from .sensor import RestData

_LOGGER = logging.getLogger(__name__)

DEFAULT_METHOD = "GET"
DEFAULT_NAME = "REST Binary Sensor"
DEFAULT_VERIFY_SSL = True
DEFAULT_FORCE_UPDATE = False
DEFAULT_TIMEOUT = 10

CONF_PAYLOAD_TEMPLATE = "payload_template"
CONF_PROXY_URL = "proxy_url"

PLATFORM_SCHEMA = PLATFORM_SCHEMA.extend(
    {
        vol.Exclusive(CONF_RESOURCE, CONF_RESOURCE): cv.url,
        vol.Exclusive(CONF_RESOURCE_TEMPLATE, CONF_RESOURCE): cv.template,
        vol.Exclusive(CONF_PAYLOAD, CONF_PAYLOAD): cv.string,
        vol.Exclusive(CONF_PAYLOAD_TEMPLATE, CONF_PAYLOAD): cv.template,
        vol.Optional(CONF_AUTHENTICATION): vol.In(
            [HTTP_BASIC_AUTHENTICATION, HTTP_DIGEST_AUTHENTICATION]
        ),
        vol.Optional(CONF_HEADERS): {cv.string: cv.template},
        vol.Optional(CONF_METHOD, default=DEFAULT_METHOD): vol.In(["POST", "GET"]),
        vol.Optional(CONF_NAME, default=DEFAULT_NAME): cv.string,
        vol.Optional(CONF_PASSWORD): cv.string,
        vol.Optional(CONF_DEVICE_CLASS): DEVICE_CLASSES_SCHEMA,
        vol.Optional(CONF_USERNAME): cv.string,
        vol.Optional(CONF_VALUE_TEMPLATE): cv.template,
        vol.Optional(CONF_VERIFY_SSL, default=DEFAULT_VERIFY_SSL): cv.boolean,
        vol.Optional(CONF_FORCE_UPDATE, default=DEFAULT_FORCE_UPDATE): cv.boolean,
        vol.Optional(CONF_TIMEOUT, default=DEFAULT_TIMEOUT): cv.positive_int,
        vol.Optional(CONF_PROXY_URL): cv.string,
    }
)

PLATFORM_SCHEMA = vol.All(
    cv.has_at_least_one_key(CONF_RESOURCE, CONF_RESOURCE_TEMPLATE), PLATFORM_SCHEMA
)


def setup_platform(hass, config, add_entities, discovery_info=None):
    """Set up the REST binary sensor."""

    setup_reload_service(hass, DOMAIN, PLATFORMS)

    name = config.get(CONF_NAME)
    resource = config.get(CONF_RESOURCE)
    resource_template = config.get(CONF_RESOURCE_TEMPLATE)
    method = config.get(CONF_METHOD)
    payload = config.get(CONF_PAYLOAD)
    payload_template = config.get(CONF_PAYLOAD_TEMPLATE)
    verify_ssl = config.get(CONF_VERIFY_SSL)
    timeout = config.get(CONF_TIMEOUT)
    username = config.get(CONF_USERNAME)
    password = config.get(CONF_PASSWORD)
    headers = config.get(CONF_HEADERS)
    device_class = config.get(CONF_DEVICE_CLASS)
    value_template = config.get(CONF_VALUE_TEMPLATE)
    force_update = config.get(CONF_FORCE_UPDATE)
    proxy_url = config.get(CONF_PROXY_URL)

    if resource_template is not None:
        resource_template.hass = hass
        resource = resource_template.render()

    if value_template is not None:
        value_template.hass = hass

    if payload_template is not None:
        payload_template.hass = hass
        payload = payload_template.render()

    if headers is not None:
        for header_template in headers.values():
            header_template.hass = hass

    if username and password:
        if config.get(CONF_AUTHENTICATION) == HTTP_DIGEST_AUTHENTICATION:
            auth = HTTPDigestAuth(username, password)
        else:
            auth = HTTPBasicAuth(username, password)
    else:
        auth = None

    rest = RestData(
        method, resource, auth, headers, payload, verify_ssl, timeout, proxy_url
    )
    rest.update()

    add_entities(
        [
            RestBinarySensor(
                hass,
                rest,
                name,
                device_class,
                value_template,
                resource_template,
                payload_template,
            )
        ]
    )


class RestBinarySensor(BinarySensorEntity):
    """Representation of a REST binary sensor."""

    def __init__(
        self,
        hass,
        rest,
        name,
        device_class,
        value_template,
        force_update,
        resource_template,
        payload_template,
    ):
        """Initialize a REST binary sensor."""
        self._hass = hass
        self.rest = rest
        self._name = name
        self._device_class = device_class
        self._state = False
        self._previous_data = None
        self._value_template = value_template
        self._force_update = force_update
        self._resource_template = resource_template
        self._payload_template = payload_template

    @property
    def name(self):
        """Return the name of the binary sensor."""
        return self._name

    @property
    def device_class(self):
        """Return the class of this sensor."""
        return self._device_class

    @property
    def available(self):
        """Return the availability of this sensor."""
        return self.rest.data is not None

    @property
    def is_on(self):
        """Return true if the binary sensor is on."""
        if self.rest.data is None:
            return False

        response = self.rest.data

        if self._value_template is not None:
            response = self._value_template.async_render_with_possible_json_value(
                self.rest.data, False
            )

        try:
            return bool(int(response))
        except ValueError:
            return {"true": True, "on": True, "open": True, "yes": True}.get(
                response.lower(), False
            )

    @property
    def force_update(self):
        """Force update."""
        return self._force_update

    def update(self):
        """Get the latest data from REST API and updates the state."""
        if self._resource_template is not None:
            self.rest.set_url(self._resource_template.render())

        if self._payload_template is not None:
            self.rest.set_payload(self._payload_template.render())

        self.rest.update()
