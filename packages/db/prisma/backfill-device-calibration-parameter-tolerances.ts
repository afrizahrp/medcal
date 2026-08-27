/**
 * Backfills DeviceCalibrationParameter.toleranceMin/Max/Note from real LK worksheets.
 * UPDATE only (unique [deviceTypeId, capabilityItemId, code]); no insert/delete.
 * Ventilator rows use the older secondary source
 * docs/legal_n_competency/Penilaian Kemampuan.zip → LK Ventilator Transport.pdf.
 * Run: pnpm --filter @medcal/db generate
 *      pnpm --filter @medcal/db run backfill:device-calibration-parameter-tolerances
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface ToleranceRow {
  deviceTypeCode: string;
  capabilityItemCode: string;
  code: string;
  toleranceMin: number | null;
  toleranceMax: number | null;
  toleranceNote: string | null;
}

const EXPECTED_COUNT = 242;

type Bounds = {
  min: number | null;
  max: number | null;
  note: string | null;
};

function t(
  deviceTypeCode: string,
  capabilityItemCode: string,
  code: string,
  bounds: Bounds,
): ToleranceRow {
  return {
    deviceTypeCode,
    capabilityItemCode,
    code,
    toleranceMin: bounds.min,
    toleranceMax: bounds.max,
    toleranceNote: bounds.note,
  };
}

function pm(nominal: number, delta: number, note: string): Bounds {
  return { min: nominal - delta, max: nominal + delta, note };
}

function pmPct(nominal: number, percent: number, note: string): Bounds {
  const delta = nominal * (percent / 100);
  return { min: nominal - delta, max: nominal + delta, note };
}

function maxOnly(max: number, note: string): Bounds {
  return { min: null, max, note };
}

function minOnly(min: number, note: string): Bounds {
  return { min, max: null, note };
}

function range(min: number, max: number, note: string): Bounds {
  return { min, max, note };
}

function noteOnly(note: string): Bounds {
  return { min: null, max: null, note };
}

const unresolved: Bounds = { min: null, max: null, note: null };

const HUMIDITY_55_20 = pm(55, 20, "55 % ± 20 % RH");
const VOLTAGE_220_10 = pmPct(220, 10, "220 ± 10% Volt");
const EARTH_03 = maxOnly(0.3, "≤ 0,3 Ω");
const ISO_GT2_NOSPACE = minOnly(2, ">2 MΩ");
const ISO_GT2_SPACE = minOnly(2, "> 2 MΩ");
const LEAK_500 = maxOnly(500, "≤ 500 µA");
const LEAK_100 = maxOnly(100, "≤ 100 µA");
const LEAK_CLASS = maxOnly(
  500,
  "Kelas I ≤ 500 µA\nKelas II ≤ 100 µA",
);
const APPLIED_500 = maxOnly(500, "≤ 500 µA");
const APPLIED_50 = maxOnly(50, "≤ 50 µA");
const NIBP_PM5 = noteOnly("± 5 mmHg");
const HR_PM5 = noteOnly("± 5 bpm");
const PCT_10 = noteOnly("± 10 %");
const PCT_10_TIGHT = noteOnly("± 10%");
const PCT_5 = noteOnly("± 5 %");

function envElec(
  deviceTypeCode: string,
  prefix: string,
  env: {
    temp: Bounds;
    humidity: Bounds;
    voltage?: Bounds;
    earth?: Bounds;
    iso?: Bounds;
    leak?: Bounds;
    applied?: Bounds;
  },
): ToleranceRow[] {
  const rows: ToleranceRow[] = [
    t(deviceTypeCode, "ROOM_TEMPERATURE", `${prefix}_ROOM_TEMP`, env.temp),
    t(deviceTypeCode, "ROOM_HUMIDITY", `${prefix}_ROOM_HUMIDITY`, env.humidity),
  ];
  if (env.voltage) {
    rows.push(t(deviceTypeCode, "INPUT_VOLTAGE", `${prefix}_INPUT_VOLTAGE`, env.voltage));
  }
  if (env.earth) {
    rows.push(
      t(deviceTypeCode, "PROTECTIVE_EARTH_RESISTANCE", `${prefix}_EARTH_RESISTANCE`, env.earth),
    );
  }
  if (env.iso) {
    rows.push(
      t(deviceTypeCode, "INSULATION_RESISTANCE", `${prefix}_INSULATION_RESISTANCE`, env.iso),
    );
  }
  if (env.leak) {
    rows.push(t(deviceTypeCode, "EQUIPMENT_LEAKAGE_CURRENT", `${prefix}_EQUIP_LEAKAGE`, env.leak));
  }
  if (env.applied) {
    rows.push(
      t(deviceTypeCode, "APPLIED_PART_LEAKAGE_CURRENT", `${prefix}_APPLIED_LEAKAGE`, env.applied),
    );
  }
  return rows;
}

const ROWS: ToleranceRow[] = [
  // LK Blood Pressure Monitor.docx
  ...envElec("BLOOD_PRESSURE_MONITOR", "BPM", {
    temp: pm(25, 6, "25 ± 6 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_NOSPACE,
    leak: LEAK_100,
    applied: APPLIED_50,
  }),
  t("BLOOD_PRESSURE_MONITOR", "SYSTOLIC_PRESSURE", "BPM_SYSTOLIC", NIBP_PM5),
  t("BLOOD_PRESSURE_MONITOR", "DIASTOLIC_PRESSURE", "BPM_DIASTOLIC", NIBP_PM5),
  t("BLOOD_PRESSURE_MONITOR", "MEAN_ARTERIAL_PRESSURE", "BPM_MAP", NIBP_PM5),

  // LK Humidifier.docx
  ...envElec("HUMIDIFIER", "HUM", {
    temp: pm(21, 5, "21 ± 5 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_NOSPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t("HUMIDIFIER", "TEMPERATURE_ACCURACY", "HUM_TEMP_ACCURACY", noteOnly("± 1°c")),
  t("HUMIDIFIER", "MAXIMUM_TEMPERATURE", "HUM_MAX_TEMP", maxOnly(40, "≤ 40°c")),

  // LK Baby Incubator.docx
  ...envElec("BABY_INCUBATOR", "INCU", {
    temp: pm(25, 5, "25 ± 5 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t(
    "BABY_INCUBATOR",
    "AIR_TEMPERATURE_CALIBRATION",
    "INCU_AIR_TEMP",
    noteOnly(
      "± 1.5 oC (TM/T5); ± 0.8 oC terhadap rata-rata TM (T5). Catatan : Kalibrasi pengontrol suhu inkubator : suhu pengaturan dengan suhu rata-rata terbaca standar T5 ± 1.5 oC. Perbedaan antara suhu rata-rata inkubator ( T5 ) dengan suhu rata-rata T1, T2, T3, dan T4 ± 0.8 oC",
    ),
  ),
  t("BABY_INCUBATOR", "OVERSHOOT_TEMPERATURE", "INCU_OVERSHOOT_TEMP", maxOnly(2, "≤ 2ºC")),
  t("BABY_INCUBATOR", "TEMPERATURE_RECOVERY_TIME", "INCU_RECOVERY_TIME", unresolved),
  t("BABY_INCUBATOR", "MATTRESS_TEMPERATURE", "INCU_MATTRESS_TEMP", maxOnly(40, "≤ 40 oC")),
  t("BABY_INCUBATOR", "AIR_VELOCITY", "INCU_AIR_VELOCITY", maxOnly(0.35, "≤ 0.35 m/s")),
  t("BABY_INCUBATOR", "NOISE_LEVEL", "INCU_NOISE_LEVEL", maxOnly(60, "≤ 60 dBA")),
  t("BABY_INCUBATOR", "SKIN_TEMPERATURE_SENSOR", "INCU_SKIN_TEMP_SENSOR", maxOnly(0.3, "≤ 0,3 ºC")),

  // LK Infant Warmer.docx (shared with RADIANT_WARMER)
  ...envElec("INFANT_WARMER", "IW", {
    temp: pm(25, 5, "25℃ ± 5℃"),
    humidity: pm(50, 20, "50 %RH ± 20 %RH"),
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t("INFANT_WARMER", "MAX_MATTRESS_SURFACE_TEMPERATURE", "IW_MAX_MATTRESS_TEMP", maxOnly(40, "≤ 40 °C")),
  t(
    "INFANT_WARMER",
    "WARMER_TEMPERATURE_CALIBRATION",
    "IW_TEMP_CALIBRATION",
    pm(36, 2, "± 2 (setting 36 ℃)"),
  ),
  ...envElec("RADIANT_WARMER", "RW", {
    temp: pm(25, 5, "25℃ ± 5℃"),
    humidity: pm(50, 20, "50 %RH ± 20 %RH"),
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t("RADIANT_WARMER", "MAX_MATTRESS_SURFACE_TEMPERATURE", "RW_MAX_MATTRESS_TEMP", maxOnly(40, "≤ 40 °C")),
  t(
    "RADIANT_WARMER",
    "WARMER_TEMPERATURE_CALIBRATION",
    "RW_TEMP_CALIBRATION",
    pm(36, 2, "± 2 (setting 36 ℃)"),
  ),

  // LK Pulse Oxymeter.docx (shared with OXYMETER_MONITOR)
  ...envElec("PULSE_OXIMETERS", "PULSEOX", {
    temp: pm(25, 6, "25 ± 6 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_100,
    applied: APPLIED_50,
  }),
  t("PULSE_OXIMETERS", "HEART_RATE", "PULSEOX_HEART_RATE", HR_PM5),
  t("PULSE_OXIMETERS", "SPO2_ACCURACY", "PULSEOX_SPO2", noteOnly("± 4 % SPO2")),
  ...envElec("OXYMETER_MONITOR", "OXYM", {
    temp: pm(25, 6, "25 ± 6 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_100,
    applied: APPLIED_50,
  }),
  t("OXYMETER_MONITOR", "HEART_RATE", "OXYM_HEART_RATE", HR_PM5),
  t("OXYMETER_MONITOR", "SPO2_ACCURACY", "OXYM_SPO2", noteOnly("± 4 % SPO2")),

  // LK Resusitator Paru dan Neopuff.docx
  ...envElec("RESUSCITATORS_CARDIAC", "RESUS_C", {
    temp: pm(25, 6, "25 ± 6 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_100,
    applied: APPLIED_50,
  }),
  t(
    "RESUSCITATORS_CARDIAC",
    "MAX_PRESSURE",
    "RESUS_C_MAX_PRESSURE",
    range(40, 65, "40 cmH2O-65 cmH2O"),
  ),
  t("RESUSCITATORS_CARDIAC", "PRESSURE_ACCURACY", "RESUS_C_PRESSURE_ACC", noteOnly("±20%")),
  ...envElec("RESUSCITATORS_PULMONARY", "RESUS_P", {
    temp: pm(25, 6, "25 ± 6 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_100,
    applied: APPLIED_50,
  }),
  t(
    "RESUSCITATORS_PULMONARY",
    "MAX_PRESSURE",
    "RESUS_P_MAX_PRESSURE",
    range(40, 65, "40 cmH2O-65 cmH2O"),
  ),
  t("RESUSCITATORS_PULMONARY", "PRESSURE_ACCURACY", "RESUS_P_PRESSURE_ACC", noteOnly("±20%")),

  // LK Sterilisator.docx
  ...envElec("STERILLIZER", "STER", {
    temp: pm(25, 6, "25 ± 6 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t(
    "STERILLIZER",
    "STERILIZATION_TEMPERATURE",
    "STER_TEMP",
    noteOnly(
      "Setting suhu 150 ˚C - 200 ˚C, atau sesuai dengan settingan yang diminta customer.; suhu : ± 3 °C",
    ),
  ),

  // Fallback: Penilaian Kemampuan.zip / Ventilator / LK Ventilator Transport.pdf
  ...envElec("VENTILATOR", "VENT", {
    temp: pm(25, 6, "25 ± 6 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: maxOnly(0.3, "≤ 0,3 Ω"),
    iso: minOnly(2, "> 2 MΩ"),
    leak: maxOnly(500, "≤ 500 μA"),
    applied: maxOnly(500, "≤ 500 μA"),
  }),
  t("VENTILATOR", "TIDAL_VOLUME", "VENT_TIDAL_VOLUME", PCT_10),
  t("VENTILATOR", "MINUTE_VOLUME", "VENT_MINUTE_VOLUME", PCT_10),
  t("VENTILATOR", "VENT_RESPIRATION_RATE", "VENT_RESP_RATE", noteOnly("± 2 bpm")),
  t("VENTILATOR", "IE_RATIO", "VENT_IE_RATIO", noteOnly("± 10 %")),
  t("VENTILATOR", "INSPIRATORY_TIME", "VENT_INSP_TIME", PCT_10),
  t("VENTILATOR", "EXPIRATORY_TIME", "VENT_EXP_TIME", PCT_10),
  t("VENTILATOR", "PEEP", "VENT_PEEP", PCT_10),
  t("VENTILATOR", "PEAK_INSPIRATORY_PRESSURE", "VENT_PPEAK", PCT_10),
  t("VENTILATOR", "FIO2_ACCURACY", "VENT_FIO2", PCT_10),

  // LK Blood Bank Refrigerator.docx
  ...envElec("BLOOD_BANK_REFRIGERATORS", "BBR", {
    temp: pm(25, 5, "25 ± 5 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t(
    "BLOOD_BANK_REFRIGERATORS",
    "STORAGE_TEMPERATURE_UNIFORMITY",
    "BBR_STORAGE_TEMP",
    range(2, 8, "Setting suhu 2 ˚C - 8 ˚C; Variasi suhu = 1°C ~ 9°C"),
  ),

  // LK Electrocardiograph.docx
  ...envElec("ELECTROCARDIOGRAPHS", "ECG", {
    temp: pm(21, 5, "21 ± 5 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_CLASS,
    applied: APPLIED_50,
  }),
  t("ELECTROCARDIOGRAPHS", "AMPLITUDE_ACCURACY", "ECG_AMPLITUDE", PCT_5),
  t("ELECTROCARDIOGRAPHS", "RECORDING_SPEED", "ECG_REC_SPEED", PCT_5),
  t("ELECTROCARDIOGRAPHS", "ECG_HEART_RATE_CALIBRATION", "ECG_HR_CAL", HR_PM5),
  t("ELECTROCARDIOGRAPHS", "SINUSOIDAL_SIGNAL_TEST", "ECG_SINUSOID_TEST", PCT_10),
  t("ELECTROCARDIOGRAPHS", "NORMAL_ECG_SIGNAL_TEST", "ECG_NORMAL_TEST", PCT_5),

  // LK Suction Pump.docx (BREAST_PUMPS)
  ...envElec("BREAST_PUMPS", "BREASTP", {
    temp: range(19, 31, "19 – 31 oC"),
    humidity: range(35, 75, "35 – 75 % RH"),
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_CLASS,
    applied: APPLIED_50,
  }),
  t("BREAST_PUMPS", "VACUUM_GAUGE_ACCURACY", "BREASTP_VACUUM_GAUGE", PCT_10_TIGHT),
  t(
    "BREAST_PUMPS",
    "MAXIMUM_VACUUM",
    "BREASTP_MAX_VACUUM",
    noteOnly(
      "Low Vacuum < 150 mmHg; Medium Vacuum 150 mmHg – 450 mmHg; High Vacuum ˃ 450 mmHg. *isi salah satu sesuai dengan UUT",
    ),
  ),
  t("BREAST_PUMPS", "TIME_TO_MAX_VACUUM", "BREASTP_TIME_MAX_VACUUM", maxOnly(15, "≤ 15 detik")),

  // LK Kelistrikan.docx
  ...envElec("ELECTRIC_BEDS", "EBED", {
    temp: range(10, 40, "10 - 40 °C"),
    humidity: range(15, 85, "15 % - 85 % RH"),
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),

  // LK Oksigen Concentrator.docx — no voltage/electrical-safety section
  ...envElec("OXYGEN_CONCENTRATORS", "O2CON", {
    temp: pm(25, 5, "25 ± 5 °C"),
    humidity: HUMIDITY_55_20,
  }),
  t("OXYGEN_CONCENTRATORS", "FLOW_RATE_ACCURACY", "O2CON_FLOW_RATE", noteOnly("± 20%")),
  t(
    "OXYGEN_CONCENTRATORS",
    "OXYGEN_CONCENTRATION_ACCURACY",
    "O2CON_CONCENTRATION",
    minOnly(90, "≥ 90%"),
  ),

  // LK Sphygmomanometer.docx — no voltage/electrical-safety section
  ...envElec("SPHYGMOMANOMETERS", "SPHYG", {
    temp: range(19, 31, "19-31 °C"),
    humidity: range(35, 75, "35-75 % RH"),
  }),
  t("SPHYGMOMANOMETERS", "CUFF_LEAK_TEST", "SPHYG_LEAK_TEST", maxOnly(15, "≤ 15 mmHg / 1 menit")),
  t("SPHYGMOMANOMETERS", "RAPID_DEFLATION_RATE", "SPHYG_DEFLATION", maxOnly(10, "≤ 10 detik")),
  t(
    "SPHYGMOMANOMETERS",
    "PRESSURE_READING_ACCURACY",
    "SPHYG_PRESSURE_ACC",
    noteOnly("Akurasi tekanan ± 4 mmHg, dengan U95 maksimum 1,5 mmhg ≤ MPE"),
  ),

  // LK Nebulizer Ultrasonic.docx
  ...envElec("ULTRASONIC_NEBULIZERS", "UNEB", {
    temp: pm(21, 5, "21 ± 5 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t(
    "ULTRASONIC_NEBULIZERS",
    "FLOW_RATE_ACCURACY",
    "UNEB_FLOW_RATE",
    range(0.5, 2, "0,5 lpm – 2 lpm"),
  ),

  // LK Nebulizer Compressor.docx
  ...envElec("NEBULIZER_COMPRESSOR", "NCOMP", {
    temp: pm(21, 5, "21 ± 5 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_NOSPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t("NEBULIZER_COMPRESSOR", "FLOW_RATE_ACCURACY", "NCOMP_FLOW_RATE", minOnly(4, "≥ 4 lpm")),

  // LK Oven.docx
  ...envElec("OVEN", "OVEN", {
    temp: pm(25, 6, "25 ± 6 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t(
    "OVEN",
    "STERILIZATION_TEMPERATURE",
    "OVEN_TEMP",
    noteOnly(
      "Setting suhu 30 ˚C – 250 ˚C, atau sesuai dengan settingan yang diminta coustomer.; suhu : ± 3 °C",
    ),
  ),

  // LK Cold Chain, Vaccine Refrigerator.docx (shared with COLD_CHAIN)
  ...envElec("KULKAS_VAKSIN", "KVAK", {
    temp: pm(25, 6, "25 ± 6 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t(
    "KULKAS_VAKSIN",
    "STORAGE_TEMPERATURE_UNIFORMITY",
    "KVAK_STORAGE_TEMP",
    range(2, 10, "Setting suhu 2 ˚C - 10 ˚C; Variasi suhu = 2°C ~ 10°C"),
  ),
  ...envElec("COLD_CHAIN", "CCHAIN", {
    temp: pm(25, 6, "25 ± 6 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t(
    "COLD_CHAIN",
    "STORAGE_TEMPERATURE_UNIFORMITY",
    "CCHAIN_STORAGE_TEMP",
    range(2, 10, "Setting suhu 2 ˚C - 10 ˚C; Variasi suhu = 2°C ~ 10°C"),
  ),

  // LK Bed Side Monitor.docx (shared with PATIENT_MONITOR)
  ...envElec("BED_SIDE_MONITOR", "BSM", {
    temp: pm(25, 5, "25 ± 5 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_CLASS,
    applied: APPLIED_50,
  }),
  t("BED_SIDE_MONITOR", "HEART_RATE", "BSM_HEART_RATE", HR_PM5),
  t("BED_SIDE_MONITOR", "RESPIRATION_RATE", "BSM_RESP_RATE", noteOnly("± 3 BrPM")),
  t("BED_SIDE_MONITOR", "SPO2_ACCURACY", "BSM_SPO2", noteOnly("± 3 % SPO2")),
  t("BED_SIDE_MONITOR", "SYSTOLIC_PRESSURE", "BSM_SYSTOLIC", NIBP_PM5),
  t("BED_SIDE_MONITOR", "DIASTOLIC_PRESSURE", "BSM_DIASTOLIC", NIBP_PM5),
  t("BED_SIDE_MONITOR", "MEAN_ARTERIAL_PRESSURE", "BSM_MAP", NIBP_PM5),
  ...envElec("PATIENT_MONITOR", "PM", {
    temp: pm(25, 5, "25 ± 5 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_CLASS,
    applied: APPLIED_50,
  }),
  t("PATIENT_MONITOR", "HEART_RATE", "PM_HEART_RATE", HR_PM5),
  t("PATIENT_MONITOR", "RESPIRATION_RATE", "PM_RESP_RATE", noteOnly("± 3 BrPM")),
  t("PATIENT_MONITOR", "SPO2_ACCURACY", "PM_SPO2", noteOnly("± 3 % SPO2")),
  t("PATIENT_MONITOR", "SYSTOLIC_PRESSURE", "PM_SYSTOLIC", NIBP_PM5),
  t("PATIENT_MONITOR", "DIASTOLIC_PRESSURE", "PM_DIASTOLIC", NIBP_PM5),
  t("PATIENT_MONITOR", "MEAN_ARTERIAL_PRESSURE", "PM_MAP", NIBP_PM5),

  // LK Flow Meter.docx — no voltage/electrical-safety section
  ...envElec("FLOW_METER", "FM", {
    temp: pm(25, 5, "25 ± 5 °C"),
    humidity: HUMIDITY_55_20,
  }),
  t("FLOW_METER", "FLOW_RATE_ACCURACY", "FM_FLOW_RATE", noteOnly("± 20 %")),

  // LK Medical Refrigerator.docx
  ...envElec("MEDICAL_REFRIGERATOR", "MREF", {
    temp: pm(25, 6, "25 ± 6 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t(
    "MEDICAL_REFRIGERATOR",
    "STORAGE_TEMPERATURE_UNIFORMITY",
    "MREF_STORAGE_TEMP",
    range(2, 8, "Setting suhu 2 ˚C - 8 ˚C; suhu : ± 1 °C"),
  ),

  // LK Medical Freezer.docx
  ...envElec("MEDICAL_FREEZER", "MFRZ", {
    temp: pm(25, 6, "25 ± 6 °C, (ΔT) 3°C"),
    humidity: pm(55, 20, "55 % ± 20 % RH, Δ%RH 10%RH"),
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t(
    "MEDICAL_FREEZER",
    "STORAGE_TEMPERATURE_UNIFORMITY",
    "MFRZ_STORAGE_TEMP",
    range(-150, -5, "Setting suhu -5˚C sampai -150˚C; Pembacaan suhu ± 1,5°C dari pengaturan"),
  ),
];

async function backfillTolerances() {
  if (ROWS.length !== EXPECTED_COUNT) {
    throw new Error(
      `[backfill] Expected ${EXPECTED_COUNT} tolerance rows, got ${ROWS.length}`,
    );
  }
  const codes = ROWS.map((row) => row.code);
  if (new Set(codes).size !== codes.length) {
    throw new Error("[backfill] Duplicate parameter codes in backfill data");
  }

  if (typeof prisma.deviceCalibrationParameter?.count !== "function") {
    throw new Error(
      "[backfill] Prisma Client is missing DeviceCalibrationParameter. On the VPS host run: pnpm --filter @medcal/db generate",
    );
  }

  const countBefore = await prisma.deviceCalibrationParameter.count();
  console.log(`[backfill] DeviceCalibrationParameter count before: ${countBefore}`);
  if (countBefore < EXPECTED_COUNT) {
    throw new Error(
      `[backfill] Refusing to run: table has ${countBefore} rows, expected at least ${EXPECTED_COUNT}`,
    );
  }

  const existing = await prisma.deviceCalibrationParameter.findMany({
    select: {
      id: true,
      code: true,
      deviceType: { select: { code: true } },
      capabilityItem: { select: { code: true } },
    },
  });
  const existingByCode = new Map(existing.map((row) => [row.code, row]));
  const missingInDb = ROWS.filter((row) => !existingByCode.has(row.code)).map((row) => row.code);
  if (missingInDb.length > 0) {
    throw new Error(
      `[backfill] Code mismatch. missingInDb=${missingInDb.join(",") || "-"}`,
    );
  }

  let updated = 0;
  const identityWarnings: string[] = [];
  for (const row of ROWS) {
    const existingRow = existingByCode.get(row.code);
    if (!existingRow) {
      throw new Error(`[backfill] Missing existing row for ${row.code}`);
    }
    if (
      existingRow.deviceType.code !== row.deviceTypeCode ||
      existingRow.capabilityItem.code !== row.capabilityItemCode
    ) {
      identityWarnings.push(
        `${row.code}: expected ${row.deviceTypeCode}/${row.capabilityItemCode}, db=${existingRow.deviceType.code}/${existingRow.capabilityItem.code}`,
      );
    }

    await prisma.deviceCalibrationParameter.update({
      where: { id: existingRow.id },
      data: {
        toleranceMin: row.toleranceMin,
        toleranceMax: row.toleranceMax,
        toleranceNote: row.toleranceNote,
      },
    });
    updated += 1;
  }
  if (identityWarnings.length > 0) {
    console.log(
      `[backfill] identity warnings (${identityWarnings.length}):\n${identityWarnings.map((line) => `  - ${line}`).join("\n")}`,
    );
  }

  const countAfter = await prisma.deviceCalibrationParameter.count();
  const all = await prisma.deviceCalibrationParameter.findMany({
    select: {
      code: true,
      toleranceMin: true,
      toleranceMax: true,
      toleranceNote: true,
      valueType: true,
    },
    orderBy: { code: "asc" },
  });

  const both = all.filter((r) => r.toleranceMin != null && r.toleranceMax != null).length;
  const onlyMin = all.filter((r) => r.toleranceMin != null && r.toleranceMax == null).length;
  const onlyMax = all.filter((r) => r.toleranceMin == null && r.toleranceMax != null).length;
  const neither = all.filter((r) => r.toleranceMin == null && r.toleranceMax == null);
  const notes = all.filter((r) => r.toleranceNote != null && r.toleranceNote.trim() !== "").length;
  const ieRatio = all.find((r) => r.code === "VENT_IE_RATIO");

  console.log(`[backfill] updated=${updated} countAfter=${countAfter}`);
  console.log(
    `[backfill] coverage bothMinMax=${both} onlyMin=${onlyMin} onlyMax=${onlyMax} neither=${neither.length} notes=${notes}`,
  );
  console.log(
    `[backfill] neither codes: ${neither.map((r) => r.code).join(", ") || "(none)"}`,
  );
  if (ieRatio) {
    console.log(
      `[backfill] VENT_IE_RATIO valueType=${ieRatio.valueType} min=${ieRatio.toleranceMin} max=${ieRatio.toleranceMax} note=${JSON.stringify(ieRatio.toleranceNote)}`,
    );
  }

  const spotCodes = [
    "BPM_ROOM_TEMP",
    "BPM_SYSTOLIC",
    "BPM_EQUIP_LEAKAGE",
    "VENT_TIDAL_VOLUME",
    "VENT_IE_RATIO",
    "INCU_RECOVERY_TIME",
    "BSM_EQUIP_LEAKAGE",
  ];
  const spots = all.filter((r) => spotCodes.includes(r.code));
  for (const spot of spots) {
    console.log(
      `[backfill] spot ${spot.code}: min=${spot.toleranceMin} max=${spot.toleranceMax} note=${JSON.stringify(spot.toleranceNote)}`,
    );
  }

  if (countAfter < EXPECTED_COUNT) {
    throw new Error(`[backfill] Row count dropped below original ${EXPECTED_COUNT}: ${countBefore} → ${countAfter}`);
  }
  if (countAfter !== countBefore) {
    throw new Error(`[backfill] Row count changed: ${countBefore} → ${countAfter}`);
  }

  await prisma.$disconnect();
}

backfillTolerances().catch((error) => {
  console.error(error);
  process.exit(1);
});
