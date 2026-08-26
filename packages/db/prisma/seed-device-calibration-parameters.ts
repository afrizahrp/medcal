/**
 * Seeds DeviceCalibrationParameter (241 CONFIRMED rows) from real LK worksheets.
 * Data extracted from seed_device_calibration_parameter.csv — evidence_source and
 * status are traceability metadata only (not DB columns). The BLOCKED row
 * VENT_IE_RATIO (I:E Ratio) is intentionally omitted: uomId is required and
 * the value is a ratio (e.g. "1:2"), not a standard physical unit.
 * Run manually: pnpm --filter @medcal/db run seed:device-calibration-parameters
 */
import { prisma } from "../src/index";

interface ParameterSeedRow {
  deviceTypeCode: string;
  capabilityItemCode: string;
  code: string;
  name: string;
  uomCode: string;
}

/**
 * DeviceCapabilityItem.code → parent DeviceCapability.code.
 * Item codes are only unique within a capability (@@unique([capabilityId, code])),
 * so lookups must go through this map rather than querying items by code alone.
 * Source: seed_device_capability_item.csv (66 rows).
 */
const ITEM_CAPABILITY_BY_CODE: Record<string, string> = {
  ROOM_TEMPERATURE: "ENVIRONMENTAL_CONDITIONS",
  ROOM_HUMIDITY: "ENVIRONMENTAL_CONDITIONS",
  INPUT_VOLTAGE: "ENVIRONMENTAL_CONDITIONS",
  PROTECTIVE_EARTH_RESISTANCE: "ELECTRICAL_SAFETY",
  INSULATION_RESISTANCE: "ELECTRICAL_SAFETY",
  EQUIPMENT_LEAKAGE_CURRENT: "ELECTRICAL_SAFETY",
  APPLIED_PART_LEAKAGE_CURRENT: "ELECTRICAL_SAFETY",
  SYSTOLIC_PRESSURE: "NIBP",
  DIASTOLIC_PRESSURE: "NIBP",
  MEAN_ARTERIAL_PRESSURE: "NIBP",
  HEART_RATE: "VITAL_SIGNS_MONITORING",
  RESPIRATION_RATE: "VITAL_SIGNS_MONITORING",
  SPO2_ACCURACY: "VITAL_SIGNS_MONITORING",
  AMPLITUDE_ACCURACY: "ECG_PERFORMANCE",
  RECORDING_SPEED: "ECG_PERFORMANCE",
  ECG_HEART_RATE_CALIBRATION: "ECG_PERFORMANCE",
  SINUSOIDAL_SIGNAL_TEST: "ECG_PERFORMANCE",
  NORMAL_ECG_SIGNAL_TEST: "ECG_PERFORMANCE",
  CUFF_LEAK_TEST: "NIBP_LEAK_TEST",
  RAPID_DEFLATION_RATE: "NIBP_LEAK_TEST",
  PRESSURE_READING_ACCURACY: "NIBP_LEAK_TEST",
  TIDAL_VOLUME: "VENTILATION_PERFORMANCE",
  MINUTE_VOLUME: "VENTILATION_PERFORMANCE",
  VENT_RESPIRATION_RATE: "VENTILATION_PERFORMANCE",
  IE_RATIO: "VENTILATION_PERFORMANCE",
  INSPIRATORY_TIME: "VENTILATION_PERFORMANCE",
  EXPIRATORY_TIME: "VENTILATION_PERFORMANCE",
  PEEP: "VENTILATION_PERFORMANCE",
  PEAK_INSPIRATORY_PRESSURE: "VENTILATION_PERFORMANCE",
  FIO2_ACCURACY: "VENTILATION_PERFORMANCE",
  MAX_PRESSURE: "RESUSCITATOR_PRESSURE",
  PRESSURE_ACCURACY: "RESUSCITATOR_PRESSURE",
  CHAMBER_TEMPERATURE: "TEMPERATURE_CHAMBER_STERILIZATION",
  STERILIZATION_TEMPERATURE: "TEMPERATURE_CHAMBER_STERILIZATION",
  STERILIZATION_TIME: "TEMPERATURE_CHAMBER_STERILIZATION",
  STORAGE_TEMPERATURE_UNIFORMITY: "TEMPERATURE_COLD_STORAGE",
  AIR_TEMPERATURE_CALIBRATION: "INCUBATOR_ENVIRONMENT",
  OVERSHOOT_TEMPERATURE: "INCUBATOR_ENVIRONMENT",
  TEMPERATURE_RECOVERY_TIME: "INCUBATOR_ENVIRONMENT",
  MATTRESS_TEMPERATURE: "INCUBATOR_ENVIRONMENT",
  AIR_VELOCITY: "INCUBATOR_ENVIRONMENT",
  NOISE_LEVEL: "INCUBATOR_ENVIRONMENT",
  SKIN_TEMPERATURE_SENSOR: "INCUBATOR_ENVIRONMENT",
  MAX_MATTRESS_SURFACE_TEMPERATURE: "WARMER_SURFACE_TEMPERATURE",
  WARMER_TEMPERATURE_CALIBRATION: "WARMER_SURFACE_TEMPERATURE",
  TEMPERATURE_ACCURACY: "HUMIDIFIER_TEMPERATURE",
  MAXIMUM_TEMPERATURE: "HUMIDIFIER_TEMPERATURE",
  VACUUM_GAUGE_ACCURACY: "VACUUM_SUCTION",
  MAXIMUM_VACUUM: "VACUUM_SUCTION",
  TIME_TO_MAX_VACUUM: "VACUUM_SUCTION",
  ROTATION_SPEED_ACCURACY: "ROTATIONAL_SPEED",
  ROTATION_TIME_ACCURACY: "ROTATIONAL_SPEED",
  OCCLUSION_TEST: "INFUSION_FLOW",
  FLOW_RATE_CALIBRATION: "INFUSION_FLOW",
  MAGNIFICATION_4X: "OPTICAL_MAGNIFICATION",
  MAGNIFICATION_10X: "OPTICAL_MAGNIFICATION",
  MAGNIFICATION_RATIO: "OPTICAL_MAGNIFICATION",
  FLOW_RATE_ACCURACY: "GAS_FLOW_RATE",
  OXYGEN_CONCENTRATION_ACCURACY: "OXYGEN_CONCENTRATION",
  DEAD_ZONE_TEST: "ULTRASOUND_IMAGING",
  AXIAL_LATERAL_RESOLUTION: "ULTRASOUND_IMAGING",
  PENETRATION_DEPTH: "ULTRASOUND_IMAGING",
  VERTICAL_DISTANCE_CALIBRATION: "ULTRASOUND_IMAGING",
  HORIZONTAL_DISTANCE_CALIBRATION: "ULTRASOUND_IMAGING",
  REPEATABILITY: "MASS_WEIGHING",
  DEVIATION_FROM_NOMINAL: "MASS_WEIGHING",
};

/**
 * 241 CONFIRMED rows from seed_device_calibration_parameter.csv.
 * VENT_IE_RATIO skipped (BLOCKED, empty uom_code).
 */
const PARAMETERS: ParameterSeedRow[] = [
  {
    deviceTypeCode: "BLOOD_PRESSURE_MONITOR",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "BPM_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "BLOOD_PRESSURE_MONITOR",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "BPM_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "BLOOD_PRESSURE_MONITOR",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "BPM_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "BLOOD_PRESSURE_MONITOR",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "BPM_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "BLOOD_PRESSURE_MONITOR",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "BPM_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "BLOOD_PRESSURE_MONITOR",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "BPM_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "BLOOD_PRESSURE_MONITOR",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "BPM_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "BLOOD_PRESSURE_MONITOR",
    capabilityItemCode: "SYSTOLIC_PRESSURE",
    code: "BPM_SYSTOLIC",
    name: "Systolic Pressure",
    uomCode: "MMHG",
  },
  {
    deviceTypeCode: "BLOOD_PRESSURE_MONITOR",
    capabilityItemCode: "DIASTOLIC_PRESSURE",
    code: "BPM_DIASTOLIC",
    name: "Diastolic Pressure",
    uomCode: "MMHG",
  },
  {
    deviceTypeCode: "BLOOD_PRESSURE_MONITOR",
    capabilityItemCode: "MEAN_ARTERIAL_PRESSURE",
    code: "BPM_MAP",
    name: "Mean Arterial Pressure",
    uomCode: "MMHG",
  },
  {
    deviceTypeCode: "HUMIDIFIER",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "HUM_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "HUMIDIFIER",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "HUM_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "HUMIDIFIER",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "HUM_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "HUMIDIFIER",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "HUM_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "HUMIDIFIER",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "HUM_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "HUMIDIFIER",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "HUM_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "HUMIDIFIER",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "HUM_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "HUMIDIFIER",
    capabilityItemCode: "TEMPERATURE_ACCURACY",
    code: "HUM_TEMP_ACCURACY",
    name: "Temperature Accuracy",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "HUMIDIFIER",
    capabilityItemCode: "MAXIMUM_TEMPERATURE",
    code: "HUM_MAX_TEMP",
    name: "Maximum Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "BABY_INCUBATOR",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "INCU_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "BABY_INCUBATOR",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "INCU_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "BABY_INCUBATOR",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "INCU_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "BABY_INCUBATOR",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "INCU_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "BABY_INCUBATOR",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "INCU_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "BABY_INCUBATOR",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "INCU_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "BABY_INCUBATOR",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "INCU_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "BABY_INCUBATOR",
    capabilityItemCode: "AIR_TEMPERATURE_CALIBRATION",
    code: "INCU_AIR_TEMP",
    name: "Air Temperature Calibration (multi-point Tc/T1-T5)",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "BABY_INCUBATOR",
    capabilityItemCode: "OVERSHOOT_TEMPERATURE",
    code: "INCU_OVERSHOOT_TEMP",
    name: "Overshoot Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "BABY_INCUBATOR",
    capabilityItemCode: "TEMPERATURE_RECOVERY_TIME",
    code: "INCU_RECOVERY_TIME",
    name: "Temperature Recovery Time",
    uomCode: "MIN",
  },
  {
    deviceTypeCode: "BABY_INCUBATOR",
    capabilityItemCode: "MATTRESS_TEMPERATURE",
    code: "INCU_MATTRESS_TEMP",
    name: "Mattress Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "BABY_INCUBATOR",
    capabilityItemCode: "AIR_VELOCITY",
    code: "INCU_AIR_VELOCITY",
    name: "Air Velocity",
    uomCode: "M_S",
  },
  {
    deviceTypeCode: "BABY_INCUBATOR",
    capabilityItemCode: "NOISE_LEVEL",
    code: "INCU_NOISE_LEVEL",
    name: "Noise Level",
    uomCode: "DB",
  },
  {
    deviceTypeCode: "BABY_INCUBATOR",
    capabilityItemCode: "SKIN_TEMPERATURE_SENSOR",
    code: "INCU_SKIN_TEMP_SENSOR",
    name: "Skin Temperature Sensor Accuracy",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "INFANT_WARMER",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "IW_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "INFANT_WARMER",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "IW_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "INFANT_WARMER",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "IW_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "INFANT_WARMER",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "IW_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "INFANT_WARMER",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "IW_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "INFANT_WARMER",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "IW_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "INFANT_WARMER",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "IW_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "INFANT_WARMER",
    capabilityItemCode: "MAX_MATTRESS_SURFACE_TEMPERATURE",
    code: "IW_MAX_MATTRESS_TEMP",
    name: "Maximum Mattress Surface Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "INFANT_WARMER",
    capabilityItemCode: "WARMER_TEMPERATURE_CALIBRATION",
    code: "IW_TEMP_CALIBRATION",
    name: "Temperature Calibration",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "RADIANT_WARMER",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "RW_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "RADIANT_WARMER",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "RW_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "RADIANT_WARMER",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "RW_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "RADIANT_WARMER",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "RW_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "RADIANT_WARMER",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "RW_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "RADIANT_WARMER",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "RW_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "RADIANT_WARMER",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "RW_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "RADIANT_WARMER",
    capabilityItemCode: "MAX_MATTRESS_SURFACE_TEMPERATURE",
    code: "RW_MAX_MATTRESS_TEMP",
    name: "Maximum Mattress Surface Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "RADIANT_WARMER",
    capabilityItemCode: "WARMER_TEMPERATURE_CALIBRATION",
    code: "RW_TEMP_CALIBRATION",
    name: "Temperature Calibration",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "PULSE_OXIMETERS",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "PULSEOX_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "PULSE_OXIMETERS",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "PULSEOX_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "PULSE_OXIMETERS",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "PULSEOX_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "PULSE_OXIMETERS",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "PULSEOX_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "PULSE_OXIMETERS",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "PULSEOX_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "PULSE_OXIMETERS",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "PULSEOX_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "PULSE_OXIMETERS",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "PULSEOX_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "PULSE_OXIMETERS",
    capabilityItemCode: "HEART_RATE",
    code: "PULSEOX_HEART_RATE",
    name: "Heart Rate",
    uomCode: "BPM",
  },
  {
    deviceTypeCode: "PULSE_OXIMETERS",
    capabilityItemCode: "SPO2_ACCURACY",
    code: "PULSEOX_SPO2",
    name: "SpO2 Accuracy",
    uomCode: "SPO2",
  },
  {
    deviceTypeCode: "OXYMETER_MONITOR",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "OXYM_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "OXYMETER_MONITOR",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "OXYM_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "OXYMETER_MONITOR",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "OXYM_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "OXYMETER_MONITOR",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "OXYM_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "OXYMETER_MONITOR",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "OXYM_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "OXYMETER_MONITOR",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "OXYM_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "OXYMETER_MONITOR",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "OXYM_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "OXYMETER_MONITOR",
    capabilityItemCode: "HEART_RATE",
    code: "OXYM_HEART_RATE",
    name: "Heart Rate",
    uomCode: "BPM",
  },
  {
    deviceTypeCode: "OXYMETER_MONITOR",
    capabilityItemCode: "SPO2_ACCURACY",
    code: "OXYM_SPO2",
    name: "SpO2 Accuracy",
    uomCode: "SPO2",
  },
  {
    deviceTypeCode: "RESUSCITATORS_CARDIAC",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "RESUS_C_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "RESUSCITATORS_CARDIAC",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "RESUS_C_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "RESUSCITATORS_CARDIAC",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "RESUS_C_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "RESUSCITATORS_CARDIAC",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "RESUS_C_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "RESUSCITATORS_CARDIAC",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "RESUS_C_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "RESUSCITATORS_CARDIAC",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "RESUS_C_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "RESUSCITATORS_CARDIAC",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "RESUS_C_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "RESUSCITATORS_CARDIAC",
    capabilityItemCode: "MAX_PRESSURE",
    code: "RESUS_C_MAX_PRESSURE",
    name: "Maximum Pressure",
    uomCode: "CMH2O",
  },
  {
    deviceTypeCode: "RESUSCITATORS_CARDIAC",
    capabilityItemCode: "PRESSURE_ACCURACY",
    code: "RESUS_C_PRESSURE_ACC",
    name: "Pressure Accuracy",
    uomCode: "CMH2O",
  },
  {
    deviceTypeCode: "RESUSCITATORS_PULMONARY",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "RESUS_P_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "RESUSCITATORS_PULMONARY",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "RESUS_P_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "RESUSCITATORS_PULMONARY",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "RESUS_P_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "RESUSCITATORS_PULMONARY",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "RESUS_P_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "RESUSCITATORS_PULMONARY",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "RESUS_P_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "RESUSCITATORS_PULMONARY",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "RESUS_P_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "RESUSCITATORS_PULMONARY",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "RESUS_P_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "RESUSCITATORS_PULMONARY",
    capabilityItemCode: "MAX_PRESSURE",
    code: "RESUS_P_MAX_PRESSURE",
    name: "Maximum Pressure",
    uomCode: "CMH2O",
  },
  {
    deviceTypeCode: "RESUSCITATORS_PULMONARY",
    capabilityItemCode: "PRESSURE_ACCURACY",
    code: "RESUS_P_PRESSURE_ACC",
    name: "Pressure Accuracy",
    uomCode: "CMH2O",
  },
  {
    deviceTypeCode: "STERILLIZER",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "STER_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "STERILLIZER",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "STER_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "STERILLIZER",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "STER_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "STERILLIZER",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "STER_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "STERILLIZER",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "STER_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "STERILLIZER",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "STER_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "STERILLIZER",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "STER_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "STERILLIZER",
    capabilityItemCode: "STERILIZATION_TEMPERATURE",
    code: "STER_TEMP",
    name: "Sterilization Temperature (multi-point T1-T9)",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "VENTILATOR",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "VENT_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "VENTILATOR",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "VENT_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "VENTILATOR",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "VENT_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "VENTILATOR",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "VENT_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "VENTILATOR",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "VENT_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "VENTILATOR",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "VENT_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "VENTILATOR",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "VENT_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "VENTILATOR",
    capabilityItemCode: "TIDAL_VOLUME",
    code: "VENT_TIDAL_VOLUME",
    name: "Tidal Volume",
    uomCode: "ML",
  },
  {
    deviceTypeCode: "VENTILATOR",
    capabilityItemCode: "MINUTE_VOLUME",
    code: "VENT_MINUTE_VOLUME",
    name: "Minute Volume",
    uomCode: "L",
  },
  {
    deviceTypeCode: "VENTILATOR",
    capabilityItemCode: "VENT_RESPIRATION_RATE",
    code: "VENT_RESP_RATE",
    name: "Respiration Rate",
    uomCode: "RPM",
  },
  {
    deviceTypeCode: "VENTILATOR",
    capabilityItemCode: "INSPIRATORY_TIME",
    code: "VENT_INSP_TIME",
    name: "Inspiratory Time",
    uomCode: "SEC",
  },
  {
    deviceTypeCode: "VENTILATOR",
    capabilityItemCode: "EXPIRATORY_TIME",
    code: "VENT_EXP_TIME",
    name: "Expiratory Time",
    uomCode: "SEC",
  },
  {
    deviceTypeCode: "VENTILATOR",
    capabilityItemCode: "PEEP",
    code: "VENT_PEEP",
    name: "Positive End-Expiratory Pressure",
    uomCode: "CMH2O",
  },
  {
    deviceTypeCode: "VENTILATOR",
    capabilityItemCode: "PEAK_INSPIRATORY_PRESSURE",
    code: "VENT_PPEAK",
    name: "Peak Inspiratory Pressure",
    uomCode: "CMH2O",
  },
  {
    deviceTypeCode: "VENTILATOR",
    capabilityItemCode: "FIO2_ACCURACY",
    code: "VENT_FIO2",
    name: "FiO2 Accuracy",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "BLOOD_BANK_REFRIGERATORS",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "BBR_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "BLOOD_BANK_REFRIGERATORS",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "BBR_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "BLOOD_BANK_REFRIGERATORS",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "BBR_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "BLOOD_BANK_REFRIGERATORS",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "BBR_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "BLOOD_BANK_REFRIGERATORS",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "BBR_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "BLOOD_BANK_REFRIGERATORS",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "BBR_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "BLOOD_BANK_REFRIGERATORS",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "BBR_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "BLOOD_BANK_REFRIGERATORS",
    capabilityItemCode: "STORAGE_TEMPERATURE_UNIFORMITY",
    code: "BBR_STORAGE_TEMP",
    name: "Storage Temperature Uniformity (multi-point T1-T9, 2-8C)",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "ELECTROCARDIOGRAPHS",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "ECG_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "ELECTROCARDIOGRAPHS",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "ECG_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "ELECTROCARDIOGRAPHS",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "ECG_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "ELECTROCARDIOGRAPHS",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "ECG_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "ELECTROCARDIOGRAPHS",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "ECG_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "ELECTROCARDIOGRAPHS",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "ECG_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "ELECTROCARDIOGRAPHS",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "ECG_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "ELECTROCARDIOGRAPHS",
    capabilityItemCode: "AMPLITUDE_ACCURACY",
    code: "ECG_AMPLITUDE",
    name: "Amplitude Accuracy",
    uomCode: "MM",
  },
  {
    deviceTypeCode: "ELECTROCARDIOGRAPHS",
    capabilityItemCode: "RECORDING_SPEED",
    code: "ECG_REC_SPEED",
    name: "Recording Speed",
    uomCode: "MM",
  },
  {
    deviceTypeCode: "ELECTROCARDIOGRAPHS",
    capabilityItemCode: "ECG_HEART_RATE_CALIBRATION",
    code: "ECG_HR_CAL",
    name: "Heart Rate Calibration",
    uomCode: "BPM",
  },
  {
    deviceTypeCode: "ELECTROCARDIOGRAPHS",
    capabilityItemCode: "SINUSOIDAL_SIGNAL_TEST",
    code: "ECG_SINUSOID_TEST",
    name: "Sinusoidal Signal Test",
    uomCode: "MM",
  },
  {
    deviceTypeCode: "ELECTROCARDIOGRAPHS",
    capabilityItemCode: "NORMAL_ECG_SIGNAL_TEST",
    code: "ECG_NORMAL_TEST",
    name: "Normal ECG Signal Test",
    uomCode: "MM",
  },
  {
    deviceTypeCode: "BREAST_PUMPS",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "BREASTP_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "BREAST_PUMPS",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "BREASTP_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "BREAST_PUMPS",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "BREASTP_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "BREAST_PUMPS",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "BREASTP_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "BREAST_PUMPS",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "BREASTP_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "BREAST_PUMPS",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "BREASTP_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "BREAST_PUMPS",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "BREASTP_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "BREAST_PUMPS",
    capabilityItemCode: "VACUUM_GAUGE_ACCURACY",
    code: "BREASTP_VACUUM_GAUGE",
    name: "Vacuum Gauge Accuracy",
    uomCode: "MMHG",
  },
  {
    deviceTypeCode: "BREAST_PUMPS",
    capabilityItemCode: "MAXIMUM_VACUUM",
    code: "BREASTP_MAX_VACUUM",
    name: "Maximum Vacuum",
    uomCode: "MMHG",
  },
  {
    deviceTypeCode: "BREAST_PUMPS",
    capabilityItemCode: "TIME_TO_MAX_VACUUM",
    code: "BREASTP_TIME_MAX_VACUUM",
    name: "Time to Maximum Vacuum",
    uomCode: "SEC",
  },
  {
    deviceTypeCode: "ELECTRIC_BEDS",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "EBED_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "ELECTRIC_BEDS",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "EBED_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "ELECTRIC_BEDS",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "EBED_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "ELECTRIC_BEDS",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "EBED_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "ELECTRIC_BEDS",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "EBED_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "ELECTRIC_BEDS",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "EBED_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "ELECTRIC_BEDS",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "EBED_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "OXYGEN_CONCENTRATORS",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "O2CON_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "OXYGEN_CONCENTRATORS",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "O2CON_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "OXYGEN_CONCENTRATORS",
    capabilityItemCode: "FLOW_RATE_ACCURACY",
    code: "O2CON_FLOW_RATE",
    name: "Gas Flow Rate Accuracy",
    uomCode: "L_MIN",
  },
  {
    deviceTypeCode: "OXYGEN_CONCENTRATORS",
    capabilityItemCode: "OXYGEN_CONCENTRATION_ACCURACY",
    code: "O2CON_CONCENTRATION",
    name: "Oxygen Concentration Accuracy",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "SPHYGMOMANOMETERS",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "SPHYG_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "SPHYGMOMANOMETERS",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "SPHYG_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "SPHYGMOMANOMETERS",
    capabilityItemCode: "CUFF_LEAK_TEST",
    code: "SPHYG_LEAK_TEST",
    name: "Cuff/Manometer Leak Test",
    uomCode: "MMHG",
  },
  {
    deviceTypeCode: "SPHYGMOMANOMETERS",
    capabilityItemCode: "RAPID_DEFLATION_RATE",
    code: "SPHYG_DEFLATION",
    name: "Rapid Deflation Rate",
    uomCode: "SEC",
  },
  {
    deviceTypeCode: "SPHYGMOMANOMETERS",
    capabilityItemCode: "PRESSURE_READING_ACCURACY",
    code: "SPHYG_PRESSURE_ACC",
    name: "Pressure Reading Accuracy",
    uomCode: "MMHG",
  },
  {
    deviceTypeCode: "ULTRASONIC_NEBULIZERS",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "UNEB_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "ULTRASONIC_NEBULIZERS",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "UNEB_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "ULTRASONIC_NEBULIZERS",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "UNEB_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "ULTRASONIC_NEBULIZERS",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "UNEB_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "ULTRASONIC_NEBULIZERS",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "UNEB_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "ULTRASONIC_NEBULIZERS",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "UNEB_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "ULTRASONIC_NEBULIZERS",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "UNEB_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "ULTRASONIC_NEBULIZERS",
    capabilityItemCode: "FLOW_RATE_ACCURACY",
    code: "UNEB_FLOW_RATE",
    name: "Gas Flow Rate Accuracy",
    uomCode: "L_MIN",
  },
  {
    deviceTypeCode: "NEBULIZER_COMPRESSOR",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "NCOMP_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "NEBULIZER_COMPRESSOR",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "NCOMP_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "NEBULIZER_COMPRESSOR",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "NCOMP_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "NEBULIZER_COMPRESSOR",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "NCOMP_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "NEBULIZER_COMPRESSOR",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "NCOMP_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "NEBULIZER_COMPRESSOR",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "NCOMP_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "NEBULIZER_COMPRESSOR",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "NCOMP_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "NEBULIZER_COMPRESSOR",
    capabilityItemCode: "FLOW_RATE_ACCURACY",
    code: "NCOMP_FLOW_RATE",
    name: "Gas Flow Rate Accuracy",
    uomCode: "L_MIN",
  },
  {
    deviceTypeCode: "OVEN",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "OVEN_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "OVEN",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "OVEN_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "OVEN",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "OVEN_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "OVEN",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "OVEN_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "OVEN",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "OVEN_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "OVEN",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "OVEN_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "OVEN",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "OVEN_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "OVEN",
    capabilityItemCode: "STERILIZATION_TEMPERATURE",
    code: "OVEN_TEMP",
    name: "Sterilization/Drying Temperature (multi-point)",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "KULKAS_VAKSIN",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "KVAK_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "KULKAS_VAKSIN",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "KVAK_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "KULKAS_VAKSIN",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "KVAK_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "KULKAS_VAKSIN",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "KVAK_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "KULKAS_VAKSIN",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "KVAK_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "KULKAS_VAKSIN",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "KVAK_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "KULKAS_VAKSIN",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "KVAK_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "KULKAS_VAKSIN",
    capabilityItemCode: "STORAGE_TEMPERATURE_UNIFORMITY",
    code: "KVAK_STORAGE_TEMP",
    name: "Storage Temperature Uniformity (multi-point, 2-10C)",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "COALD_CHAIN",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "CCHAIN_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "COALD_CHAIN",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "CCHAIN_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "COALD_CHAIN",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "CCHAIN_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "COALD_CHAIN",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "CCHAIN_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "COALD_CHAIN",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "CCHAIN_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "COALD_CHAIN",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "CCHAIN_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "COALD_CHAIN",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "CCHAIN_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "COALD_CHAIN",
    capabilityItemCode: "STORAGE_TEMPERATURE_UNIFORMITY",
    code: "CCHAIN_STORAGE_TEMP",
    name: "Storage Temperature Uniformity (multi-point, 2-10C)",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "BED_SIDE_MONITOR",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "BSM_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "BED_SIDE_MONITOR",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "BSM_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "BED_SIDE_MONITOR",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "BSM_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "BED_SIDE_MONITOR",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "BSM_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "BED_SIDE_MONITOR",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "BSM_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "BED_SIDE_MONITOR",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "BSM_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "BED_SIDE_MONITOR",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "BSM_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "BED_SIDE_MONITOR",
    capabilityItemCode: "HEART_RATE",
    code: "BSM_HEART_RATE",
    name: "Heart Rate",
    uomCode: "BPM",
  },
  {
    deviceTypeCode: "BED_SIDE_MONITOR",
    capabilityItemCode: "RESPIRATION_RATE",
    code: "BSM_RESP_RATE",
    name: "Respiration Rate",
    uomCode: "RPM",
  },
  {
    deviceTypeCode: "BED_SIDE_MONITOR",
    capabilityItemCode: "SPO2_ACCURACY",
    code: "BSM_SPO2",
    name: "SpO2 Accuracy",
    uomCode: "SPO2",
  },
  {
    deviceTypeCode: "BED_SIDE_MONITOR",
    capabilityItemCode: "SYSTOLIC_PRESSURE",
    code: "BSM_SYSTOLIC",
    name: "Systolic Pressure",
    uomCode: "MMHG",
  },
  {
    deviceTypeCode: "BED_SIDE_MONITOR",
    capabilityItemCode: "DIASTOLIC_PRESSURE",
    code: "BSM_DIASTOLIC",
    name: "Diastolic Pressure",
    uomCode: "MMHG",
  },
  {
    deviceTypeCode: "BED_SIDE_MONITOR",
    capabilityItemCode: "MEAN_ARTERIAL_PRESSURE",
    code: "BSM_MAP",
    name: "Mean Arterial Pressure",
    uomCode: "MMHG",
  },
  {
    deviceTypeCode: "PATIENT_MONITOR",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "PM_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "PATIENT_MONITOR",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "PM_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "PATIENT_MONITOR",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "PM_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "PATIENT_MONITOR",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "PM_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "PATIENT_MONITOR",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "PM_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "PATIENT_MONITOR",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "PM_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "PATIENT_MONITOR",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "PM_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "PATIENT_MONITOR",
    capabilityItemCode: "HEART_RATE",
    code: "PM_HEART_RATE",
    name: "Heart Rate",
    uomCode: "BPM",
  },
  {
    deviceTypeCode: "PATIENT_MONITOR",
    capabilityItemCode: "RESPIRATION_RATE",
    code: "PM_RESP_RATE",
    name: "Respiration Rate",
    uomCode: "RPM",
  },
  {
    deviceTypeCode: "PATIENT_MONITOR",
    capabilityItemCode: "SPO2_ACCURACY",
    code: "PM_SPO2",
    name: "SpO2 Accuracy",
    uomCode: "SPO2",
  },
  {
    deviceTypeCode: "PATIENT_MONITOR",
    capabilityItemCode: "SYSTOLIC_PRESSURE",
    code: "PM_SYSTOLIC",
    name: "Systolic Pressure",
    uomCode: "MMHG",
  },
  {
    deviceTypeCode: "PATIENT_MONITOR",
    capabilityItemCode: "DIASTOLIC_PRESSURE",
    code: "PM_DIASTOLIC",
    name: "Diastolic Pressure",
    uomCode: "MMHG",
  },
  {
    deviceTypeCode: "PATIENT_MONITOR",
    capabilityItemCode: "MEAN_ARTERIAL_PRESSURE",
    code: "PM_MAP",
    name: "Mean Arterial Pressure",
    uomCode: "MMHG",
  },
  {
    deviceTypeCode: "FLOW_METER",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "FM_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "FLOW_METER",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "FM_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "FLOW_METER",
    capabilityItemCode: "FLOW_RATE_ACCURACY",
    code: "FM_FLOW_RATE",
    name: "Gas Flow Rate Accuracy",
    uomCode: "L_MIN",
  },
  {
    deviceTypeCode: "MEDICAL_REFRIGERATOR",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "MREF_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "MEDICAL_REFRIGERATOR",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "MREF_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "MEDICAL_REFRIGERATOR",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "MREF_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "MEDICAL_REFRIGERATOR",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "MREF_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "MEDICAL_REFRIGERATOR",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "MREF_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "MEDICAL_REFRIGERATOR",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "MREF_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "MEDICAL_REFRIGERATOR",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "MREF_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "MEDICAL_REFRIGERATOR",
    capabilityItemCode: "STORAGE_TEMPERATURE_UNIFORMITY",
    code: "MREF_STORAGE_TEMP",
    name: "Storage Temperature Uniformity (multi-point, 2-8C)",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "MEDICAL_FREEZER",
    capabilityItemCode: "ROOM_TEMPERATURE",
    code: "MFRZ_ROOM_TEMP",
    name: "Room Temperature",
    uomCode: "DEG_C",
  },
  {
    deviceTypeCode: "MEDICAL_FREEZER",
    capabilityItemCode: "ROOM_HUMIDITY",
    code: "MFRZ_ROOM_HUMIDITY",
    name: "Room Humidity",
    uomCode: "PERCENT",
  },
  {
    deviceTypeCode: "MEDICAL_FREEZER",
    capabilityItemCode: "INPUT_VOLTAGE",
    code: "MFRZ_INPUT_VOLTAGE",
    name: "Input Voltage",
    uomCode: "V",
  },
  {
    deviceTypeCode: "MEDICAL_FREEZER",
    capabilityItemCode: "PROTECTIVE_EARTH_RESISTANCE",
    code: "MFRZ_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
    uomCode: "OHM",
  },
  {
    deviceTypeCode: "MEDICAL_FREEZER",
    capabilityItemCode: "INSULATION_RESISTANCE",
    code: "MFRZ_INSULATION_RESISTANCE",
    name: "Insulation Resistance",
    uomCode: "MOHM",
  },
  {
    deviceTypeCode: "MEDICAL_FREEZER",
    capabilityItemCode: "EQUIPMENT_LEAKAGE_CURRENT",
    code: "MFRZ_EQUIP_LEAKAGE",
    name: "Equipment Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "MEDICAL_FREEZER",
    capabilityItemCode: "APPLIED_PART_LEAKAGE_CURRENT",
    code: "MFRZ_APPLIED_LEAKAGE",
    name: "Applied Part Leakage Current",
    uomCode: "UA",
  },
  {
    deviceTypeCode: "MEDICAL_FREEZER",
    capabilityItemCode: "STORAGE_TEMPERATURE_UNIFORMITY",
    code: "MFRZ_STORAGE_TEMP",
    name: "Storage Temperature Uniformity (multi-point, -5 to -150C)",
    uomCode: "DEG_C",
  },
];

const EXPECTED_COUNT = 241;
const SKIPPED_PARAM_CODE = "VENT_IE_RATIO";

interface FailedRow {
  code: string;
  reason: string;
}

async function assertPrerequisites(): Promise<void> {
  const [deviceTypeCount, capabilityCount, itemCount, uomCount, extraUoms] = await Promise.all([
    prisma.deviceType.count(),
    prisma.deviceCapability.count(),
    prisma.deviceCapabilityItem.count(),
    prisma.uom.count(),
    prisma.uom.findMany({
      where: { code: { in: ["UA", "M_S", "DB"] } },
      select: { code: true },
    }),
  ]);

  const missing: string[] = [];
  if (deviceTypeCount < 35) missing.push(`DeviceType (got ${deviceTypeCount}, expected 35)`);
  if (capabilityCount < 21) missing.push(`DeviceCapability (got ${capabilityCount}, expected 21)`);
  if (itemCount < 66) missing.push(`DeviceCapabilityItem (got ${itemCount}, expected 66)`);
  if (uomCount < 1) missing.push("Uom (table empty)");
  const extraCodes = extraUoms.map((row) => row.code);
  for (const code of ["UA", "M_S", "DB"]) {
    if (!extraCodes.includes(code)) missing.push(`Uom.${code}`);
  }

  if (missing.length > 0) {
    throw new Error(
      `[seed] Prerequisites not populated — refusing to seed DeviceCalibrationParameter. Missing: ${missing.join("; ")}`,
    );
  }

  console.log(
    `[seed] Prerequisites OK: DeviceType=${deviceTypeCount}, DeviceCapability=${capabilityCount}, DeviceCapabilityItem=${itemCount}, Uom=${uomCount}.`,
  );
}

async function seedDeviceCalibrationParameters() {
  if (PARAMETERS.length !== EXPECTED_COUNT) {
    throw new Error(
      `[seed] Expected ${EXPECTED_COUNT} DeviceCalibrationParameter rows, got ${PARAMETERS.length}`,
    );
  }
  if (PARAMETERS.some((row) => row.code === SKIPPED_PARAM_CODE)) {
    throw new Error(`[seed] ${SKIPPED_PARAM_CODE} must not be included in the seed data`);
  }

  await assertPrerequisites();

  const existingCount = await prisma.deviceCalibrationParameter.count();
  console.log(`[seed] DeviceCalibrationParameter count before upsert: ${existingCount}.`);

  const deviceTypes = await prisma.deviceType.findMany({ select: { id: true, code: true } });
  const deviceTypeIdByCode = new Map(deviceTypes.map((row) => [row.code, row.id]));

  const capabilities = await prisma.deviceCapability.findMany({ select: { id: true, code: true } });
  const capabilityIdByCode = new Map(capabilities.map((row) => [row.code, row.id]));

  const items = await prisma.deviceCapabilityItem.findMany({
    select: { id: true, code: true, capabilityId: true },
  });
  const itemIdByCapabilityAndCode = new Map(
    items.map((row) => [`${row.capabilityId}::${row.code}`, row.id]),
  );

  const uoms = await prisma.uom.findMany({ select: { id: true, code: true } });
  const uomIdByCode = new Map(uoms.map((row) => [row.code, row.id]));

  const failed: FailedRow[] = [];
  let upserted = 0;

  for (const row of PARAMETERS) {
    const deviceTypeId = deviceTypeIdByCode.get(row.deviceTypeCode);
    if (!deviceTypeId) {
      failed.push({ code: row.code, reason: `missing DeviceType.code=${row.deviceTypeCode}` });
      continue;
    }

    const capabilityCode = ITEM_CAPABILITY_BY_CODE[row.capabilityItemCode];
    if (!capabilityCode) {
      failed.push({
        code: row.code,
        reason: `capability_item_code ${row.capabilityItemCode} not in ITEM_CAPABILITY_BY_CODE`,
      });
      continue;
    }

    const capabilityId = capabilityIdByCode.get(capabilityCode);
    if (!capabilityId) {
      failed.push({
        code: row.code,
        reason: `missing DeviceCapability.code=${capabilityCode} (parent of ${row.capabilityItemCode})`,
      });
      continue;
    }

    const capabilityItemId = itemIdByCapabilityAndCode.get(
      `${capabilityId}::${row.capabilityItemCode}`,
    );
    if (!capabilityItemId) {
      failed.push({
        code: row.code,
        reason: `missing DeviceCapabilityItem (${capabilityCode}, ${row.capabilityItemCode})`,
      });
      continue;
    }

    const uomId = uomIdByCode.get(row.uomCode);
    if (!uomId) {
      failed.push({ code: row.code, reason: `missing Uom.code=${row.uomCode}` });
      continue;
    }

    await prisma.deviceCalibrationParameter.upsert({
      where: {
        deviceTypeId_capabilityItemId_code: {
          deviceTypeId,
          capabilityItemId,
          code: row.code,
        },
      },
      create: {
        deviceTypeId,
        capabilityItemId,
        code: row.code,
        name: row.name,
        description: null,
        uomId,
      },
      update: {
        name: row.name,
        uomId,
      },
    });
    upserted += 1;
  }

  const tableCount = await prisma.deviceCalibrationParameter.count();
  const skippedPresent = await prisma.deviceCalibrationParameter.findFirst({
    where: { code: SKIPPED_PARAM_CODE },
    select: { id: true, code: true },
  });

  const spot = await prisma.deviceCalibrationParameter.findFirst({
    where: { code: "BPM_SYSTOLIC" },
    select: {
      code: true,
      name: true,
      deviceType: { select: { code: true } },
      capabilityItem: {
        select: {
          code: true,
          capability: { select: { code: true } },
        },
      },
      uom: { select: { code: true } },
    },
  });

  console.log(
    `[seed] ${upserted} DeviceCalibrationParameter rows upserted (table count: ${tableCount}).`,
  );
  console.log(
    `[seed] Skipped ${SKIPPED_PARAM_CODE}: ${skippedPresent ? "FOUND in table (unexpected)" : "not seeded"}.`,
  );
  if (spot) {
    console.log(
      `[seed] Spot-check BPM_SYSTOLIC: DeviceType=${spot.deviceType.code}, DeviceCapabilityItem=${spot.capabilityItem.code} (capability=${spot.capabilityItem.capability.code}), Uom=${spot.uom.code}.`,
    );
  } else {
    console.log("[seed] Spot-check BPM_SYSTOLIC: not found.");
  }

  if (failed.length > 0) {
    console.error(
      `[seed] ${failed.length} row(s) failed FK resolution:\n${failed.map((row) => `  - ${row.code}: ${row.reason}`).join("\n")}`,
    );
    throw new Error(`[seed] ${failed.length} row(s) failed FK resolution`);
  }

  await prisma.$disconnect();
}

seedDeviceCalibrationParameters().catch((error) => {
  console.error("[seed] Failed:", error);
  process.exit(1);
});
