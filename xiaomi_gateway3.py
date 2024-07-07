from custom_components.xiaomi_gateway3.core.devices import *

DEVICES = [{
    # https://miot-spec.org/miot-spec-v2/instance?type=urn:miot-spec-v2:device:air-monitor:0000A008:lumi-acn01:1
    "lumi.airmonitor.acn01": ["Aqara", "Air Quality Monitor CN", "VOCKQJK11LM"],
    "spec": [
        BaseConv("temperature", "sensor", mi="3.p.1"),  # celsius
        BaseConv("humidity", "sensor", mi="3.p.2"),  # percentage
        BaseConv("tvoc", "sensor", mi="3.p.3"),  # ppb
        BatVoltConv("battery", "sensor", mi="4.p.2"),  # voltage, mV
        MapConv("battery_low", "binary_sensor", mi="4.p.1", map={1: False, 2: True}),  # diagnostic
        MapConv("display_unit", "select", mi="6.p.1", map={0: "℃, mg/m³", 1: "℃, ppb", 16: "℉, mg/m³", 17: "℉, ppb"}),  # config
    ],
    "ttl": "3d",
}] + DEVICES
