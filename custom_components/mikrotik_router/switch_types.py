"""Definitions for Mikrotik Router switch entities."""

from __future__ import annotations

from dataclasses import dataclass, field

from homeassistant.helpers.device_registry import CONNECTION_NETWORK_MAC
from homeassistant.components.switch import (
    SwitchDeviceClass,
    SwitchEntityDescription,
)

from .const import DOMAIN
from .iface_attributes import DEVICE_ATTRIBUTES_IFACE

DEVICE_ATTRIBUTES_NAT = [
    "protocol",
    "dst-port",
    "in-interface",
    "to-addresses",
    "to-ports",
    "comment",
]

DEVICE_ATTRIBUTES_MANGLE = [
    "chain",
    "action",
    "passthrough",
    "protocol",
    "src-address",
    "src-port",
    "dst-address",
    "dst-port",
    "in-interface",
    "out-interface",
    "comment",
]

DEVICE_ATTRIBUTES_FILTER = [
    "chain",
    "action",
    "address-list",
    "protocol",
    "layer7-protocol",
    "tcp-flags",
    "connection-state",
    "in-interface",
    "src-address",
    "src-port",
    "out-interface",
    "dst-address",
    "dst-port",
    "comment",
]

DEVICE_ATTRIBUTES_PPP_SECRET = [
    "connected",
    "service",
    "profile",
    "comment",
    "caller-id",
    "encoding",
]

DEVICE_ATTRIBUTES_CONTAINER = [
    "tag",
    "os",
    "arch",
    "interface",
    "root-dir",
    "status",
    "comment",
]

DEVICE_ATTRIBUTES_RAW = [
    "chain",
    "action",
    "protocol",
    "in-interface",
    "src-address",
    "src-port",
    "out-interface",
    "dst-address",
    "dst-port",
    "comment",
]

DEVICE_ATTRIBUTES_KIDCONTROL = [
    "blocked",
    "rate-limit",
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
    "sat",
    "sun",
]

DEVICE_ATTRIBUTES_QUEUE = [
    "target",
    "download-rate",
    "upload-rate",
    "download-max-limit",
    "upload-max-limit",
    "upload-limit-at",
    "download-limit-at",
    "upload-burst-limit",
    "download-burst-limit",
    "upload-burst-threshold",
    "download-burst-threshold",
    "upload-burst-time",
    "download-burst-time",
    "packet-marks",
    "parent",
    "comment",
]


@dataclass
class MikrotikSwitchEntityDescription(SwitchEntityDescription):
    """Class describing mikrotik entities."""

    device_class: str = SwitchDeviceClass.SWITCH

    icon_enabled: str | None = None
    icon_disabled: str | None = None
    ha_group: str | None = None
    ha_connection: str | None = None
    ha_connection_value: str | None = None
    data_path: str | None = None
    data_attribute: str = "enabled"
    data_switch_path: str | None = None
    data_switch_parameter: str = "disabled"
    data_name: str | None = None
    data_name_comment: bool = False
    data_uid: str | None = None
    data_reference: str | None = None
    data_attributes_list: list = field(default_factory=lambda: [])
    func: str = "MikrotikSwitch"


SENSOR_TYPES: tuple[MikrotikSwitchEntityDescription, ...] = (
    MikrotikSwitchEntityDescription(
        key="interface",
        name="Port",
        icon_enabled="mdi:lan-connect",
        icon_disabled="mdi:lan-pending",
        entity_category=None,
        ha_group="data__default-name",
        ha_connection=CONNECTION_NETWORK_MAC,
        ha_connection_value="data__port-mac-address",
        data_path="interface",
        data_switch_path="/interface",
        data_name="default-name",
        data_uid="name",
        data_reference="default-name",
        data_attributes_list=DEVICE_ATTRIBUTES_IFACE,
        func="MikrotikPortSwitch",
    ),
    MikrotikSwitchEntityDescription(
        key="nat",
        name="",
        icon_enabled="mdi:network-outline",
        icon_disabled="mdi:network-off-outline",
        entity_category=None,
        ha_group="NAT",
        ha_connection=DOMAIN,
        ha_connection_value="NAT",
        data_path="nat",
        data_switch_path="/ip/firewall/nat",
        data_name="name",
        data_name_comment=True,
        data_uid="uniq-id",
        data_reference="uniq-id",
        data_attributes_list=DEVICE_ATTRIBUTES_NAT,
        func="MikrotikNATSwitch",
    ),
    MikrotikSwitchEntityDescription(
        key="mangle",
        name="",
        icon_enabled="mdi:bookmark-outline",
        icon_disabled="mdi:bookmark-off-outline",
        entity_category=None,
        ha_group="Mangle",
        ha_connection=DOMAIN,
        ha_connection_value="Mangle",
        data_path="mangle",
        data_switch_path="/ip/firewall/mangle",
        data_name="name",
        data_name_comment=True,
        data_uid="uniq-id",
        data_reference="uniq-id",
        data_attributes_list=DEVICE_ATTRIBUTES_MANGLE,
        func="MikrotikMangleSwitch",
    ),
    MikrotikSwitchEntityDescription(
        key="filter",
        name="",
        icon_enabled="mdi:filter-variant",
        icon_disabled="mdi:filter-variant-remove",
        entity_category=None,
        ha_group="Filter",
        ha_connection=DOMAIN,
        ha_connection_value="Filter",
        data_path="filter",
        data_switch_path="/ip/firewall/filter",
        data_name="name",
        data_name_comment=True,
        data_uid="uniq-id",
        data_reference="uniq-id",
        data_attributes_list=DEVICE_ATTRIBUTES_FILTER,
        func="MikrotikFilterSwitch",
    ),
    MikrotikSwitchEntityDescription(
        key="raw",
        name="",
        icon_enabled="mdi:fire",
        icon_disabled="mdi:fire-off",
        entity_category=None,
        ha_group="RAW",
        ha_connection=DOMAIN,
        ha_connection_value="RAW",
        data_path="raw",
        data_switch_path="/ip/firewall/raw",
        data_name="name",
        data_name_comment=True,
        data_uid="uniq-id",
        data_reference="uniq-id",
        data_attributes_list=DEVICE_ATTRIBUTES_RAW,
        func="MikrotikRawSwitch",
    ),
    MikrotikSwitchEntityDescription(
        key="ppp_secret",
        name="PPP Secret",
        icon_enabled="mdi:account-outline",
        icon_disabled="mdi:account-off-outline",
        entity_category=None,
        ha_group="PPP",
        ha_connection=DOMAIN,
        ha_connection_value="PPP",
        data_path="ppp_secret",
        data_switch_path="/ppp/secret",
        data_name="name",
        data_uid="name",
        data_reference="name",
        data_attributes_list=DEVICE_ATTRIBUTES_PPP_SECRET,
    ),
    MikrotikSwitchEntityDescription(
        key="queue",
        name="",
        icon_enabled="mdi:leaf",
        icon_disabled="mdi:leaf-off",
        entity_category=None,
        ha_group="Queue",
        ha_connection=DOMAIN,
        ha_connection_value="Queue",
        data_path="queue",
        data_switch_path="/queue/simple",
        data_name="name",
        data_uid="name",
        data_reference="name",
        data_attributes_list=DEVICE_ATTRIBUTES_QUEUE,
        func="MikrotikQueueSwitch",
    ),
    MikrotikSwitchEntityDescription(
        key="kidcontrol_enable",
        name="",
        icon_enabled="mdi:account",
        icon_disabled="mdi:account-off",
        entity_category=None,
        ha_group="Kidcontrol",
        ha_connection=DOMAIN,
        ha_connection_value="Kidcontrol",
        data_path="kid-control",
        data_switch_path="/ip/kid-control",
        data_name="name",
        data_uid="name",
        data_reference="name",
        data_attributes_list=DEVICE_ATTRIBUTES_KIDCONTROL,
    ),
    MikrotikSwitchEntityDescription(
        key="kidcontrol_paused",
        name="paused",
        icon_enabled="mdi:account-outline",
        icon_disabled="mdi:account-off-outline",
        entity_category=None,
        ha_group="Kidcontrol",
        ha_connection=DOMAIN,
        ha_connection_value="Kidcontrol",
        data_path="kid-control",
        data_attribute="paused",
        data_switch_path="/ip/kid-control",
        data_name="name",
        data_uid="name",
        data_reference="name",
        data_attributes_list=DEVICE_ATTRIBUTES_KIDCONTROL,
        func="MikrotikKidcontrolPauseSwitch",
    ),
    MikrotikSwitchEntityDescription(
        key="container",
        name="",
        icon_enabled="mdi:docker",
        icon_disabled="mdi:checkbox-blank-circle-outline",
        entity_category=None,
        ha_group="Container",
        ha_connection=DOMAIN,
        ha_connection_value="Container",
        data_path="container",
        data_attribute="running",
        data_switch_path="/container",
        data_switch_parameter=".id",
        data_name="name",
        data_name_comment=True,
        data_uid=".id",
        data_reference=".id",
        data_attributes_list=DEVICE_ATTRIBUTES_CONTAINER,
        func="MikrotikContainerSwitch",
    ),
)

SENSOR_SERVICES = {}
