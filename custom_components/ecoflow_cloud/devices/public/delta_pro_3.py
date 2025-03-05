from ...api import EcoflowApiClient
from ...entities import (
    BaseNumberEntity,
    BaseSelectEntity,
    BaseSensorEntity,
    BaseSwitchEntity,
)
from ...number import ChargingPowerEntity
from ...sensor import (
    CapacitySensorEntity,
    InWattsSensorEntity,
    LevelSensorEntity,
    OutWattsSensorEntity,
)
from .. import BaseDevice, const


class DeltaPro3(BaseDevice):
    def sensors(self, client: EcoflowApiClient) -> list[BaseSensorEntity]:
        return [
            LevelSensorEntity(
                client, self, "bmsBattSoc", const.MAIN_BATTERY_LEVEL
            ).attr("bmsDesignCap", const.ATTR_DESIGN_CAPACITY, 0),
            CapacitySensorEntity(
                client, self, "bmsDesignCap", const.MAIN_DESIGN_CAPACITY, False
            ),
            LevelSensorEntity(client, self, "cmsBattSoc", const.COMBINED_BATTERY_LEVEL),
            InWattsSensorEntity(client, self, "powInSumW", const.TOTAL_IN_POWER),
            OutWattsSensorEntity(client, self, "powOutSumW", const.TOTAL_OUT_POWER),
            InWattsSensorEntity(client, self, "powGetAcIn", const.AC_IN_POWER),
        ]

    def numbers(self, client: EcoflowApiClient) -> list[BaseNumberEntity]:
        return [
            ChargingPowerEntity(
                client,
                self,
                "cfgPlugInInfoAcInChgPowMax",
                const.AC_CHARGING_POWER,
                400,
                2900,
                lambda value: {
                    "sn": self.device_info.sn,
                    "cmdId": 17,
                    "dirDest": 1,
                    "dirSrc": 1,
                    "cmdFunc": 254,
                    "dest": 2,
                    "params": {"cfgPlugInInfoAcInChgPowMax": value},
                },
            ),
        ]

    def switches(self, client: EcoflowApiClient) -> list[BaseSwitchEntity]:
        return []

    def selects(self, client: EcoflowApiClient) -> list[BaseSelectEntity]:
        return []
