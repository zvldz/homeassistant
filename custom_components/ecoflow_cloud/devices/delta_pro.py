from homeassistant.const import Platform

from . import const, BaseDevice, EntityMigration, MigrationAction
from ..entities import BaseSensorEntity, BaseNumberEntity, BaseSwitchEntity, BaseSelectEntity
from ..mqtt.ecoflow_mqtt import EcoflowMQTTClient
from ..number import ChargingPowerEntity, MaxBatteryLevelEntity, MinBatteryLevelEntity, MinGenStartLevelEntity, \
    MaxGenStopLevelEntity
from ..select import DictSelectEntity, TimeoutDictSelectEntity
from ..sensor import LevelSensorEntity, WattsSensorEntity, RemainSensorEntity, TempSensorEntity, \
    CyclesSensorEntity, InWattsSensorEntity, OutWattsSensorEntity, OutWattsDcSensorEntity, VoltSensorEntity, \
    InWattsSolarSensorEntity, InVoltSolarSensorEntity, InAmpSolarSensorEntity, OutVoltDcSensorEntity, \
    StatusSensorEntity, InEnergySensorEntity, OutEnergySensorEntity, MilliVoltSensorEntity, InMilliVoltSensorEntity, \
    OutMilliVoltSensorEntity, AmpSensorEntity, CapacitySensorEntity
from ..switch import BeeperEntity, EnabledEntity


class DeltaPro(BaseDevice):
    def sensors(self, client: EcoflowMQTTClient) -> list[BaseSensorEntity]:
        return [
            LevelSensorEntity(client, "bmsMaster.soc", const.MAIN_BATTERY_LEVEL)
                .attr("bmsMaster.designCap", const.ATTR_DESIGN_CAPACITY, 0)
                .attr("bmsMaster.fullCap", const.ATTR_FULL_CAPACITY, 0)
                .attr("bmsMaster.remainCap", const.ATTR_REMAIN_CAPACITY, 0),
            LevelSensorEntity(client, "bmsMaster.f32ShowSoc", const.MAIN_BATTERY_LEVEL_F32, False)
                .attr("bmsMaster.designCap", const.ATTR_DESIGN_CAPACITY, 0)
                .attr("bmsMaster.fullCap", const.ATTR_FULL_CAPACITY, 0)
                .attr("bmsMaster.remainCap", const.ATTR_REMAIN_CAPACITY, 0),
            CapacitySensorEntity(client, "bmsMaster.designCap", const.MAIN_DESIGN_CAPACITY, False),
            CapacitySensorEntity(client, "bmsMaster.fullCap", const.MAIN_FULL_CAPACITY, False),
            CapacitySensorEntity(client, "bmsMaster.remainCap", const.MAIN_REMAIN_CAPACITY, False),
            LevelSensorEntity(client, "bmsMaster.soh", const.SOH),

            LevelSensorEntity(client, "ems.lcdShowSoc", const.COMBINED_BATTERY_LEVEL),
            LevelSensorEntity(client, "ems.f32LcdShowSoc", const.COMBINED_BATTERY_LEVEL_F32, False),
            WattsSensorEntity(client, "pd.wattsInSum", const.TOTAL_IN_POWER),
            WattsSensorEntity(client, "pd.wattsOutSum", const.TOTAL_OUT_POWER),
            AmpSensorEntity(client, "bmsMaster.amp", const.MAIN_BATTERY_CURRENT),

            InWattsSensorEntity(client, "inv.inputWatts", const.AC_IN_POWER),
            OutWattsSensorEntity(client, "inv.outputWatts", const.AC_OUT_POWER),

            InMilliVoltSensorEntity(client, "inv.acInVol", const.AC_IN_VOLT),
            OutMilliVoltSensorEntity(client, "inv.invOutVol", const.AC_OUT_VOLT),

            InWattsSolarSensorEntity(client, "mppt.inWatts", const.SOLAR_IN_POWER),
            InVoltSolarSensorEntity(client, "mppt.inVol", const.SOLAR_IN_VOLTAGE),
            InAmpSolarSensorEntity(client, "mppt.inAmp", const.SOLAR_IN_CURRENT),

            OutWattsDcSensorEntity(client, "mppt.outWatts", const.DC_OUT_POWER),
            OutVoltDcSensorEntity(client, "mppt.outVol", const.DC_OUT_VOLTAGE),

            OutWattsSensorEntity(client, "mppt.carOutWatts", const.DC_CAR_OUT_POWER),
            OutWattsSensorEntity(client, "mppt.dcdc12vWatts", const.DC_ANDERSON_OUT_POWER),

            OutWattsSensorEntity(client, "pd.typec1Watts", const.TYPEC_1_OUT_POWER),
            OutWattsSensorEntity(client, "pd.typec2Watts", const.TYPEC_2_OUT_POWER),

            OutWattsSensorEntity(client, "pd.usb1Watts", const.USB_1_OUT_POWER),
            OutWattsSensorEntity(client, "pd.usb2Watts", const.USB_2_OUT_POWER),

            OutWattsSensorEntity(client, "pd.qcUsb1Watts", const.USB_QC_1_OUT_POWER),
            OutWattsSensorEntity(client, "pd.qcUsb2Watts", const.USB_QC_2_OUT_POWER),

            RemainSensorEntity(client, "ems.chgRemainTime", const.CHARGE_REMAINING_TIME),
            RemainSensorEntity(client, "ems.dsgRemainTime", const.DISCHARGE_REMAINING_TIME),
            CyclesSensorEntity(client, "bmsMaster.cycles", const.CYCLES),

            TempSensorEntity(client, "bmsMaster.temp", const.BATTERY_TEMP)
                .attr("bmsMaster.minCellTemp", const.ATTR_MIN_CELL_TEMP, 0)
                .attr("bmsMaster.maxCellTemp", const.ATTR_MAX_CELL_TEMP, 0),
            TempSensorEntity(client, "bmsMaster.minCellTemp", const.MIN_CELL_TEMP, False),
            TempSensorEntity(client, "bmsMaster.maxCellTemp", const.MAX_CELL_TEMP, False),

            MilliVoltSensorEntity(client, "bmsMaster.vol", const.BATTERY_VOLT, False)
                .attr("bmsMaster.minCellVol", const.ATTR_MIN_CELL_VOLT, 0)
                .attr("bmsMaster.maxCellVol", const.ATTR_MAX_CELL_VOLT, 0),
            MilliVoltSensorEntity(client, "bmsMaster.minCellVol", const.MIN_CELL_VOLT, False),
            MilliVoltSensorEntity(client, "bmsMaster.maxCellVol", const.MAX_CELL_VOLT, False),

            # https://github.com/tolwi/hassio-ecoflow-cloud/discussions/87
            InEnergySensorEntity(client, "pd.chgSunPower", const.SOLAR_IN_ENERGY),
            InEnergySensorEntity(client, "pd.chgPowerAc", const.CHARGE_AC_ENERGY),
            InEnergySensorEntity(client, "pd.chgPowerDc", const.CHARGE_DC_ENERGY),
            OutEnergySensorEntity(client, "pd.dsgPowerAc", const.DISCHARGE_AC_ENERGY),
            OutEnergySensorEntity(client, "pd.dsgPowerDc", const.DISCHARGE_DC_ENERGY),

            # Optional Slave Batteries
            LevelSensorEntity(client, "bmsSlave1.soc", const.SLAVE_N_BATTERY_LEVEL % 1, False, True)
                .attr("bmsSlave1.designCap", const.ATTR_DESIGN_CAPACITY, 0)
                .attr("bmsSlave1.fullCap", const.ATTR_FULL_CAPACITY, 0)
                .attr("bmsSlave1.remainCap", const.ATTR_REMAIN_CAPACITY, 0),
            LevelSensorEntity(client, "bmsSlave1.f32ShowSoc", const.SLAVE_N_BATTERY_LEVEL_F32 % 1, False, False)
                .attr("bmsSlave1.designCap", const.ATTR_DESIGN_CAPACITY, 0)
                .attr("bmsSlave1.fullCap", const.ATTR_FULL_CAPACITY, 0)
                .attr("bmsSlave1.remainCap", const.ATTR_REMAIN_CAPACITY, 0),
            CapacitySensorEntity(client, "bmsSlave1.designCap", const.SLAVE_N_DESIGN_CAPACITY % 1, False),
            CapacitySensorEntity(client, "bmsSlave1.fullCap", const.SLAVE_N_FULL_CAPACITY % 1, False),
            CapacitySensorEntity(client, "bmsSlave1.remainCap", const.SLAVE_N_REMAIN_CAPACITY % 1, False),
            LevelSensorEntity(client, "bmsSlave1.soh", const.SLAVE_N_SOH % 1),

            TempSensorEntity(client, "bmsSlave1.temp", const.SLAVE_N_BATTERY_TEMP % 1, False, True)
                .attr("bmsSlave1.minCellTemp", const.ATTR_MIN_CELL_TEMP, 0)
                .attr("bmsSlave1.maxCellTemp", const.ATTR_MAX_CELL_TEMP, 0),
            WattsSensorEntity(client, "bmsSlave1.inputWatts", const.SLAVE_N_IN_POWER % 1, False, True),
            WattsSensorEntity(client, "bmsSlave1.outputWatts", const.SLAVE_N_OUT_POWER % 1, False, True),

            LevelSensorEntity(client, "bmsSlave2.soc", const.SLAVE_N_BATTERY_LEVEL % 2, False, True)
                .attr("bmsSlave2.designCap", const.ATTR_DESIGN_CAPACITY, 0)
                .attr("bmsSlave2.fullCap", const.ATTR_FULL_CAPACITY, 0)
                .attr("bmsSlave2.remainCap", const.ATTR_REMAIN_CAPACITY, 0),
            LevelSensorEntity(client, "bmsSlave2.f32ShowSoc", const.SLAVE_N_BATTERY_LEVEL_F32 % 2, False, False)
                .attr("bmsSlave2.designCap", const.ATTR_DESIGN_CAPACITY, 0)
                .attr("bmsSlave2.fullCap", const.ATTR_FULL_CAPACITY, 0)
                .attr("bmsSlave2.remainCap", const.ATTR_REMAIN_CAPACITY, 0),
            CapacitySensorEntity(client, "bmsSlave2.designCap", const.SLAVE_N_DESIGN_CAPACITY % 2, False),
            CapacitySensorEntity(client, "bmsSlave2.fullCap", const.SLAVE_N_FULL_CAPACITY % 2, False),
            CapacitySensorEntity(client, "bmsSlave2.remainCap", const.SLAVE_N_REMAIN_CAPACITY % 2, False),
            LevelSensorEntity(client, "bmsSlave2.soh", const.SLAVE_N_SOH % 2),
            MilliVoltSensorEntity(client, "bmsSlave1.vol", const.SLAVE_N_BATTERY_VOLT % 1, False),
            MilliVoltSensorEntity(client, "bmsSlave1.minCellVol", const.SLAVE_N_MIN_CELL_VOLT % 1, False),
            MilliVoltSensorEntity(client, "bmsSlave1.maxCellVol", const.SLAVE_N_MAX_CELL_VOLT % 1, False),
            AmpSensorEntity(client, "bmsSlave1.amp", const.SLAVE_N_BATTERY_CURRENT % 1, False),
            MilliVoltSensorEntity(client, "bmsSlave2.vol", const.SLAVE_N_BATTERY_VOLT % 2, False),
            MilliVoltSensorEntity(client, "bmsSlave2.minCellVol", const.SLAVE_N_MIN_CELL_VOLT % 2, False),
            MilliVoltSensorEntity(client, "bmsSlave2.maxCellVol", const.SLAVE_N_MAX_CELL_VOLT % 2, False),
            AmpSensorEntity(client, "bmsSlave2.amp", const.SLAVE_N_BATTERY_CURRENT % 2, False),
            TempSensorEntity(client, "bmsSlave2.temp", const.SLAVE_N_BATTERY_TEMP % 2, False, True)
                .attr("bmsSlave2.minCellTemp", const.ATTR_MIN_CELL_TEMP, 0)
                .attr("bmsSlave2.maxCellTemp", const.ATTR_MAX_CELL_TEMP, 0),
            WattsSensorEntity(client, "bmsSlave2.inputWatts", const.SLAVE_N_IN_POWER % 2, False, True),
            WattsSensorEntity(client, "bmsSlave2.outputWatts", const.SLAVE_N_OUT_POWER % 2, False, True),
            CyclesSensorEntity(client, "bmsSlave1.cycles", const.SLAVE_N_CYCLES % 1, False),
            CyclesSensorEntity(client, "bmsSlave2.cycles", const.SLAVE_N_CYCLES % 2, False),
            StatusSensorEntity(client),
        ]

    def numbers(self, client: EcoflowMQTTClient) -> list[BaseNumberEntity]:
        return [
            MaxBatteryLevelEntity(client, "ems.maxChargeSoc", const.MAX_CHARGE_LEVEL, 50, 100,
                                  lambda value: {"moduleType": 0, "operateType": "TCP",
                                                 "params": {"id": 49, "maxChgSoc": value}}),
            MinBatteryLevelEntity(client, "ems.minDsgSoc", const.MIN_DISCHARGE_LEVEL, 0, 30,
                                  lambda value: {"moduleType": 0, "operateType": "TCP",
                                                 "params": {"id": 51, "minDsgSoc": value}}),
            MaxBatteryLevelEntity(client, "pd.bpPowerSoc", const.BACKUP_RESERVE_LEVEL, 5, 100,
                                  lambda value: {"moduleType": 0, "operateType": "TCP",
                                                 "params": {"isConfig": 1, "bpPowerSoc": int(value), "minDsgSoc": 0,
                                                            "maxChgSoc": 0, "id": 94}}),
            MinGenStartLevelEntity(client, "ems.minOpenOilEbSoc", const.GEN_AUTO_START_LEVEL, 0, 30,
                                   lambda value: {"moduleType": 0, "operateType": "TCP",
                                                  "params": {"openOilSoc": value, "id": 52}}),

            MaxGenStopLevelEntity(client, "ems.maxCloseOilEbSoc", const.GEN_AUTO_STOP_LEVEL, 50, 100,
                                  lambda value: {"moduleType": 0, "operateType": "TCP",
                                                 "params": {"closeOilSoc": value, "id": 53}}),

            ChargingPowerEntity(client, "inv.cfgSlowChgWatts", const.AC_CHARGING_POWER, 200, 2900,
                                lambda value: {"moduleType": 0, "operateType": "TCP",
                                               "params": {"slowChgPower": value, "id": 69}}),

        ]

    def switches(self, client: EcoflowMQTTClient) -> list[BaseSwitchEntity]:
        return [
            BeeperEntity(client, "pd.beepState", const.BEEPER,
                         lambda value: {"moduleType": 0, "operateType": "TCP", "params": {"id": 38, "enabled": value}}),
            EnabledEntity(client, "mppt.carState", const.DC_ENABLED,
                          lambda value: {"moduleType": 0, "operateType": "TCP",
                                         "params": {"id": 81, "enabled": value}}),
            EnabledEntity(client, "inv.cfgAcEnabled", const.AC_ENABLED,
                          lambda value: {"moduleType": 0, "operateType": "TCP",
                                         "params": {"id": 66, "enabled": value}}),

            EnabledEntity(client, "inv.cfgAcXboost", const.XBOOST_ENABLED,
                          lambda value: {"moduleType": 0, "operateType": "TCP", "params": {"id": 66, "xboost": value}}),
            EnabledEntity(client, "pd.acautooutConfig", const.AC_ALWAYS_ENABLED,
                          lambda value: {"moduleType": 0, "operateType": "TCP",
                                         "params": {"id": 95, "acautooutConfig": value}}),
            EnabledEntity(client, "pd.bppowerSoc", const.BP_ENABLED,
                          lambda value, params: {"moduleType": 0, "operateType": "TCP",
                                                 "params": {"id": 94, "isConfig": value,
                                                            "bpPowerSoc": int(params.get("pd.bppowerSoc", 0)),
                                                            "minDsgSoc": 0,
                                                            "maxChgSoc": 0}}),
        ]

    def selects(self, client: EcoflowMQTTClient) -> list[BaseSelectEntity]:
        return [
            DictSelectEntity(client, "mppt.cfgDcChgCurrent", const.DC_CHARGE_CURRENT, const.DC_CHARGE_CURRENT_OPTIONS,
                             lambda value: {"moduleType": 0, "operateType": "TCP",
                                            "params": {"currMa": value, "id": 71}}),

            TimeoutDictSelectEntity(client, "pd.lcdOffSec", const.SCREEN_TIMEOUT, const.SCREEN_TIMEOUT_OPTIONS,
                                    lambda value: {"moduleType": 0, "operateType": "TCP",
                                                   "params": {"lcdTime": value, "id": 39}}),

            TimeoutDictSelectEntity(client, "pd.standByMode", const.UNIT_TIMEOUT, const.UNIT_TIMEOUT_OPTIONS_LIMITED,
                                    lambda value: {"moduleType": 0, "operateType": "TCP",
                                                   "params": {"standByMode": value, "id": 33}}),

            TimeoutDictSelectEntity(client, "inv.cfgStandbyMin", const.AC_TIMEOUT, const.AC_TIMEOUT_OPTIONS,
                                    lambda value: {"moduleType": 0, "operateType": "TCP",
                                                   "params": {"standByMins": value, "id": 153}}),

        ]

    def migrate(self, version) -> list[EntityMigration]:
        if version == 2:
            return [
                EntityMigration("pd.soc", Platform.SENSOR, MigrationAction.REMOVE),
            ]
        return []
