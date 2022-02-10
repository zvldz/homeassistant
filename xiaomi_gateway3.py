from custom_components.xiaomi_gateway3.core.converters.devices import *

DEVICES = [{
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
