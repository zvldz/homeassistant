from custom_components.xiaomi_gateway3.core.devices import *

DEVICES = [{
    "lumi.motion.agl04": ["Aqara", "Precision Motion Sensor EU", "RTCGQ13LM"],
    "ttl": "3d",
    "spec": [
        ConstConv("motion", "binary_sensor", mi="4.e.1", value=True),
        BatVoltConv("battery", "sensor", mi="3.p.1"),  # voltage, mV
        MapConv("sensitivity", "select", mi="8.p.1", map={1: "low", 2: "medium", 3: "high"}),  # config
        MathConv("blind_time", "number", mi="10.p.1", min=2, max=180),  # config
        MapConv("battery_low", "binary_sensor", mi="5.p.1", map={1: False, 2: True}),  # diagnostic
        BaseConv("idle_time", "sensor", mi="6.p.1"),  # diagnostic
    ],
}, {
    "lumi.airrtc.agl001": ["Aqara", "Thermostat E1", "SRTS-A01"],
    "ttl": "1d",
    "spec": [
        # The following code is very different to the spec defined in home.miot-spec.com thus leave unmodified
        BoolConv("climate", "climate", mi="4.21.85"),
        # 0: Manual module 1: Smart schedule mode # 2: Antifreeze mode 3: Installation mode
        MapConv("mode", mi="14.51.85", map={0: "heat", 2: "auto"}),
        MathConv("current_temp", mi="0.1.85", multiply=0.01),
        MathConv("target_temp", mi="1.8.85", multiply=0.01),
        MathConv("antifreeze_temp", "number", mi="1.10.85", multiply=0.01, min=5, max=15, entity={"category": "config", "enabled": False, "units": UNIT_CELSIUS}),
        BoolConv("window_detection", "switch", mi="4.24.85", entity=ENTITY_CONFIG),
        BoolConv("valve_calibration", "switch", mi="4.22.85", entity=ENTITY_CONFIG),
        BoolConv("valve_notification", "switch", mi="4.25.85", entity=ENTITY_CONFIG),
        BoolConv("child_lock", "switch", mi="4.26.85"),
        MapConv("find_device", "switch", mi="8.0.2096", map={2: True, 1: False}, entity=ENTITY_CONFIG),
        BaseConv("battery", "sensor", mi="8.0.2001"),
        BaseConv("chip_temperature", "sensor", mi="8.0.2006"),
    ]
}] + DEVICES
