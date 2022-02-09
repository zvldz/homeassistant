from custom_components.xiaomi_gateway3.core.converters.devices import *

DEVICES = [{
    # Neo Power Plug NAS-WR01B
    "TS011F": ["Neo", "Power Plug", "NAS-WR01B"],
    "support": 4,
    "spec": [
        ZOnOffConv("plug", "switch"),
        ZCurrent, ZPower, ZVoltagePoll,
        ZEnergyConv("energy", "sensor", multiply=0.01, enabled=None),  # not working now
        ZTuyaPowerOn,
    ],
}, {
    # tuya relay with neutral, 1 gang
    "TS0001": ["Tuya", "Relay", "TS0001"],
    "support": 4,
    "spec": [
        ZOnOffConv("switch", "switch", bind=True),
        ZTuyaPowerOn,
    ],
}, {
    # tuya relay with neutral, 2 gang
    "TS0002": ["Tuya", "Relay", "TS0002"],
    "support": 4,
    "spec": [
        ZOnOffConv("channel_1", "switch", ep=1, bind=True),
        ZOnOffConv("channel_2", "switch", ep=2, bind=True),
    ],
}, {
    # https://home.miot-spec.com/spec?type=urn:miot-spec-v2:device:motion-sensor:0000A014:lumi-agl04:1:0000C813
    # for spec names Fibaro has good example: https://manuals.fibaro.com/motion-sensor/
    "lumi.motion.agl04": ["Aqara", "Precision Motion Sensor EU", "RTCGQ13LM"],
    # "support": 5,  # @zvldz
    "spec": [
        ConstConv("motion", "binary_sensor", mi="4.e.1", value=True),
        BatteryConv("battery", "sensor", mi="3.p.1"),  # voltage, mV
        MapConv("sensitivity", "select", mi="8.p.1", map={
            1: "low", 2: "medium", 3: "high"
        }, enabled=False),
        MathConv("blind_time", "number", mi="10.p.1", min=2, max=180,
                 enabled=False),
        MapConv("battery_low", "binary_sensor", mi="5.p.1", map=BATTERY_LOW,
                enabled=False),
        Converter("idle_time", "sensor", mi="6.p.1", enabled=False),
    ],
    "ttl": "15h",  # every 5 hour
}] + DEVICES
