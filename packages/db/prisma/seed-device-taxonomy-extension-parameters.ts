/**
 * Seeds DeviceCalibrationParameter rows for the 24 in-scope new DeviceTypes.
 * INSERT/upsert only for these types — does not touch the original 242 rows.
 * Tolerances are taken from docs/technician-docs/ LK worksheets (verbatim notes).
 *
 * Out of scope: Auto Chemistry Analyzer, Hematologi Analyzer, pH Meter,
 * Thermohygrometer, Otoscope, Phaco Emulsifikasi.
 *
 * FETAL_HEART_RATE is a dedicated capability (not VITAL_SIGNS_MONITORING.HEART_RATE).
 * Laryngoskop illuminance 40,000–160,000 lux is seeded as-is from LK Laryngoskop.docx
 * and needs human review (possible copy-paste from Lampu Operasi).
 *
 * 2026-08-27: 7 Pattern-C rows that had crammed two-or-more distinct variant tolerances
 * into a single toleranceNote were split into their real per-variant rows (net +8):
 * ACLV_CHAMBER_TEMP → _DT1/_DT2/_DT3; ACLV_STER_TEMP → _121/_134;
 * ACLV_STER_TIME → _121/_134; BSC_LIGHT_INTENSITY → _ON/_OFF;
 * BSC_SOUND_LEVEL → _ON/_OFF; LAF_SOUND_LEVEL → _BACKGROUND/_COMPARTMENT;
 * DXRAY_HVL → _70KV/_80KV. See fix-collapsed-pattern-c-parameters.ts.
 *
 * Run after seed:uoms, seed:device-types, seed:device-capabilities:
 *   pnpm --filter @medcal/db run seed:device-taxonomy-extension-parameters
 */
import { prisma, type CalibrationValueType } from "../src/index";

interface ParameterSeedRow {
  deviceTypeCode: string;
  capabilityCode: string;
  capabilityItemCode: string;
  code: string;
  name: string;
  uomCode: string | null;
  valueType?: CalibrationValueType;
  toleranceMin: number | null;
  toleranceMax: number | null;
  toleranceNote: string | null;
}

type Bounds = {
  min: number | null;
  max: number | null;
  note: string | null;
};

function t(
  deviceTypeCode: string,
  capabilityCode: string,
  capabilityItemCode: string,
  code: string,
  name: string,
  uomCode: string | null,
  bounds: Bounds,
  valueType?: CalibrationValueType,
): ParameterSeedRow {
  return {
    deviceTypeCode,
    capabilityCode,
    capabilityItemCode,
    code,
    name,
    uomCode,
    valueType,
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

const HUMIDITY_55_20 = pm(55, 20, "55 % ± 20 % RH");
const HUMIDITY_55_20_RH = pm(55, 20, "55 %RH ± 20 %RH");
const HUMIDITY_50_20 = pm(50, 20, "50 % ± 20 % RH");
const HUMIDITY_55_10 = pm(55, 10, "55 % ± 10 % RH");
const VOLTAGE_220_10 = pmPct(220, 10, "220 ± 10% Volt");
const EARTH_03 = maxOnly(0.3, "≤ 0,3 Ω");
const ISO_GT2_NOSPACE = minOnly(2, ">2 MΩ");
const ISO_GT2_SPACE = minOnly(2, "> 2 MΩ");
const LEAK_500 = maxOnly(500, "≤ 500 µA");
const LEAK_100 = maxOnly(100, "≤ 100 µA");
const LEAK_CLASS = maxOnly(500, "Kelas I ≤ 500 µA\nKelas II ≤ 100 µA");
const APPLIED_500 = maxOnly(500, "≤ 500 µA");
const APPLIED_50 = maxOnly(50, "≤ 50 µA");
const PCT_10 = noteOnly("± 10%");
const PCT_10_SPACE = noteOnly("± 10 %");

/**
 * Emits the shared environmental + electrical-safety parameter rows with the
 * LK-Indonesian names (LK Kelistrikan block): "Suhu Ruangan", "Kelembaban / RH",
 * "Tegangan Input", "Resistansi Pembumian Protektif", "Resistansi Isolasi",
 * "Arus Bocor Peralatan", "Arus Bocor Bagian yang Diaplikasikan". All extension
 * device types use this after the name-alignment batches (Phase 1 – Batch 4).
 */
function envElecID(
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
): ParameterSeedRow[] {
  const rows: ParameterSeedRow[] = [
    t(
      deviceTypeCode,
      "ENVIRONMENTAL_CONDITIONS",
      "ROOM_TEMPERATURE",
      `${prefix}_ROOM_TEMP`,
      "Suhu Ruangan",
      "DEG_C",
      env.temp,
    ),
    t(
      deviceTypeCode,
      "ENVIRONMENTAL_CONDITIONS",
      "ROOM_HUMIDITY",
      `${prefix}_ROOM_HUMIDITY`,
      "Kelembaban / RH",
      "PERCENT",
      env.humidity,
    ),
  ];
  if (env.voltage)
    rows.push(
      t(
        deviceTypeCode,
        "ENVIRONMENTAL_CONDITIONS",
        "INPUT_VOLTAGE",
        `${prefix}_INPUT_VOLTAGE`,
        "Tegangan Input",
        "V",
        env.voltage,
      ),
    );
  if (env.earth)
    rows.push(
      t(
        deviceTypeCode,
        "ELECTRICAL_SAFETY",
        "PROTECTIVE_EARTH_RESISTANCE",
        `${prefix}_EARTH_RESISTANCE`,
        "Resistansi Pembumian Protektif",
        "OHM",
        env.earth,
      ),
    );
  if (env.iso)
    rows.push(
      t(
        deviceTypeCode,
        "ELECTRICAL_SAFETY",
        "INSULATION_RESISTANCE",
        `${prefix}_INSULATION_RESISTANCE`,
        "Resistansi Isolasi",
        "MOHM",
        env.iso,
      ),
    );
  if (env.leak)
    rows.push(
      t(
        deviceTypeCode,
        "ELECTRICAL_SAFETY",
        "EQUIPMENT_LEAKAGE_CURRENT",
        `${prefix}_EQUIP_LEAKAGE`,
        "Arus Bocor Peralatan",
        "UA",
        env.leak,
      ),
    );
  if (env.applied)
    rows.push(
      t(
        deviceTypeCode,
        "ELECTRICAL_SAFETY",
        "APPLIED_PART_LEAKAGE_CURRENT",
        `${prefix}_APPLIED_LEAKAGE`,
        "Arus Bocor Bagian yang Diaplikasikan",
        "UA",
        env.applied,
      ),
    );
  return rows;
}

const LIGHT_CRI_85_100 = range(85, 100, "85 ≤ Ra ≤ 100");
const LIGHT_CRI_85_100_DASH = range(85, 100, "85 – 100 Ra");
const LIGHT_CCT_3000_6700_LE = range(3000, 6700, "3000°K ≤ 6700°K");
const LIGHT_CCT_3000_6700_DASH = range(3000, 6700, "3000 - 6700°K");
const LIGHT_LUX_GT_1000 = minOnly(1000, "> 1000 lux");
const LIGHT_LUX_SURGICAL = range(40000, 160000, "40.000 – 160.000 lux");

const PARAMETERS: ParameterSeedRow[] = [
  // LK Audiometer.docx
  ...envElecID("AUDIOMETER", "AUD", {
    temp: pm(25, 5, "25℃ ± 5℃"),
    humidity: HUMIDITY_55_20_RH,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t(
    "AUDIOMETER",
    "AUDIOMETRIC_PERFORMANCE",
    "PURE_TONE_LINEARITY",
    "AUD_PURE_TONE_LINEARITY",
    "Linieritas dB Pure Tone",
    "DB",
    noteOnly("± 1 dB"),
  ),
  t(
    "AUDIOMETER",
    "AUDIOMETRIC_PERFORMANCE",
    "FREQUENCY_RESPONSE",
    "AUD_FREQUENCY_RESPONSE",
    "Frekuensi Respon / Tanggap",
    "HZ",
    noteOnly("± 2%"),
  ),

  // LK Autoclave.docx
  ...envElecID("AUTOCLAVE", "ACLV", {
    temp: pm(25, 5, "25℃ ± 5℃"),
    humidity: HUMIDITY_55_20_RH,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  // Chamber temperature spread — three distinct derived differences, each its own
  // tolerance (LK Autoclave.docx Setting UUT 121/134 table). Split from the former
  // single ACLV_CHAMBER_TEMP row.
  t(
    "AUTOCLAVE",
    "TEMPERATURE_CHAMBER_STERILIZATION",
    "CHAMBER_TEMPERATURE",
    "ACLV_CHAMBER_TEMP_DT1",
    "Suhu Chamber ΔT1 (S1 – S2)",
    "DEG_C",
    pm(0, 2, "ΔT1 = S1 – S2 ± 2 °C"),
  ),
  t(
    "AUTOCLAVE",
    "TEMPERATURE_CHAMBER_STERILIZATION",
    "CHAMBER_TEMPERATURE",
    "ACLV_CHAMBER_TEMP_DT2",
    "Suhu Chamber ΔT2 (S1 – S3)",
    "DEG_C",
    pm(0, 5, "ΔT2 = S1 – S3 ± 5 °C"),
  ),
  t(
    "AUTOCLAVE",
    "TEMPERATURE_CHAMBER_STERILIZATION",
    "CHAMBER_TEMPERATURE",
    "ACLV_CHAMBER_TEMP_DT3",
    "Suhu Chamber ΔT3 (S1 – S3)",
    "DEG_C",
    pm(0, 2, "ΔT3 = S1 – S3 ± 2 °C"),
  ),
  // Sterilization temperature — two cycle modes, each its own absolute acceptance
  // range (LK Autoclave.docx: setting 121 → 121–124 °C, setting 134 → 134–137 °C).
  t(
    "AUTOCLAVE",
    "TEMPERATURE_CHAMBER_STERILIZATION",
    "STERILIZATION_TEMPERATURE",
    "ACLV_STER_TEMP_121",
    "Suhu Sterilisasi (siklus 121 °C)",
    "DEG_C",
    range(121, 124, "121 °C ~ 124 °C"),
  ),
  t(
    "AUTOCLAVE",
    "TEMPERATURE_CHAMBER_STERILIZATION",
    "STERILIZATION_TEMPERATURE",
    "ACLV_STER_TEMP_134",
    "Suhu Sterilisasi (siklus 134 °C)",
    "DEG_C",
    range(134, 137, "134 °C ~137 °C"),
  ),
  // Sterilization hold time — two cycle modes, each its own minimum
  // (LK Autoclave.docx: 121 °C ≥ 15 menit, 134 °C ≥ 3 menit).
  t(
    "AUTOCLAVE",
    "TEMPERATURE_CHAMBER_STERILIZATION",
    "STERILIZATION_TIME",
    "ACLV_STER_TIME_121",
    "Waktu Sterilisasi (siklus 121 °C)",
    "MIN",
    minOnly(15, "≥ 15 menit"),
  ),
  t(
    "AUTOCLAVE",
    "TEMPERATURE_CHAMBER_STERILIZATION",
    "STERILIZATION_TIME",
    "ACLV_STER_TIME_134",
    "Waktu Sterilisasi (siklus 134 °C)",
    "MIN",
    minOnly(3, "≥ 3 menit"),
  ),

  // LK Bio Safety Cabinet.docx
  ...envElecID("BIO_SAFETY_CABINET", "BSC", {
    temp: pm(25, 5, "25 ± 5 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t(
    "BIO_SAFETY_CABINET",
    "CLEAN_AIR_CONTAINMENT",
    "PARTICLE_COUNT",
    "BSC_PARTICLE_COUNT",
    "Pengujian Particle Counter",
    "PARTICLE",
    maxOnly(100, "0,5 ≤ 100 particle"),
  ),
  t(
    "BIO_SAFETY_CABINET",
    "CLEAN_AIR_CONTAINMENT",
    "DOWNFLOW_VELOCITY",
    "BSC_DOWNFLOW",
    "Pengujian Downflow",
    "M_S",
    range(0.25, 0.5, "Down Flow 0,25 - 0,5 m/s sesuaikan dengan spek BSC"),
  ),
  t(
    "BIO_SAFETY_CABINET",
    "CLEAN_AIR_CONTAINMENT",
    "INFLOW_VELOCITY",
    "BSC_INFLOW",
    "Pengujian Inflow Velocity",
    "M_S",
    noteOnly("≥ 0,40 m/s; Min : 0,4; Max : 1"),
  ),
  // Light intensity — two distinct lamp states, each its own limit
  // (LK Bio Safety Cabinet.docx: Lampu ON ≥ 450 lux, Lampu OFF ≤ 160 lux).
  t(
    "BIO_SAFETY_CABINET",
    "CLEAN_AIR_CONTAINMENT",
    "LIGHT_INTENSITY",
    "BSC_LIGHT_INTENSITY_ON",
    "Pengukuran Nilai Intensitas Cahaya (Lampu ON)",
    "LUX",
    minOnly(450, "≥ 450 lux"),
  ),
  t(
    "BIO_SAFETY_CABINET",
    "CLEAN_AIR_CONTAINMENT",
    "LIGHT_INTENSITY",
    "BSC_LIGHT_INTENSITY_OFF",
    "Pengukuran Nilai Intensitas Cahaya (Lampu OFF)",
    "LUX",
    maxOnly(160, "≤ 160 lux"),
  ),
  // Sound level — two distinct blower states, each its own limit
  // (LK Bio Safety Cabinet.docx: Noise ON ≤ 70 dBA, Noise OFF ≤ 60 dBA).
  t(
    "BIO_SAFETY_CABINET",
    "CLEAN_AIR_CONTAINMENT",
    "SOUND_LEVEL",
    "BSC_SOUND_LEVEL_ON",
    "Pengukuran Sound Level (Noise ON)",
    "DBA",
    maxOnly(70, "≤ 70 dBA"),
  ),
  t(
    "BIO_SAFETY_CABINET",
    "CLEAN_AIR_CONTAINMENT",
    "SOUND_LEVEL",
    "BSC_SOUND_LEVEL_OFF",
    "Pengukuran Sound Level (Noise OFF)",
    "DBA",
    maxOnly(60, "≤ 60 dBA"),
  ),
  t(
    "BIO_SAFETY_CABINET",
    "CLEAN_AIR_CONTAINMENT",
    "UV_RADIATION",
    "BSC_UV_RADIATION",
    "Pengukuran Radiasi UV",
    "UW_CM2",
    minOnly(40, "≥ 40 µW/cm²"),
  ),
  t(
    "BIO_SAFETY_CABINET",
    "CLEAN_AIR_CONTAINMENT",
    "HEPA_LEAK_TEST",
    "BSC_HEPA_LEAK",
    "Pengukuran Kebocoran Hepa / Ulpa Filter",
    null,
    noteOnly("Pass / Fail"),
    "BOOLEAN",
  ),

  // LK Centrifuge.docx
  ...envElecID("CENTRIFUGE", "CENT", {
    temp: pm(25, 5, "25 ± 5 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_100,
    applied: APPLIED_50,
  }),
  t(
    "CENTRIFUGE",
    "ROTATIONAL_SPEED",
    "ROTATION_SPEED_ACCURACY",
    "CENT_SPEED",
    "Kalibrasi Kecepatan Putar",
    "REV_MIN",
    PCT_10,
  ),
  t(
    "CENTRIFUGE",
    "ROTATIONAL_SPEED",
    "ROTATION_TIME_ACCURACY",
    "CENT_TIME",
    "Kalibrasi Waktu Putar",
    "SEC",
    PCT_10_SPACE,
  ),

  // LK Centrifuge Refrigerator.docx
  ...envElecID("CENTRIFUGE_REFRIGERATOR", "CRFR", {
    temp: pm(25, 5, "25 ± 5 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_100,
    applied: APPLIED_500,
  }),
  t(
    "CENTRIFUGE_REFRIGERATOR",
    "ROTATIONAL_SPEED",
    "ROTATION_SPEED_ACCURACY",
    "CRFR_SPEED",
    "Kalibrasi Kecepatan Putar",
    "REV_MIN",
    PCT_10,
  ),
  t(
    "CENTRIFUGE_REFRIGERATOR",
    "ROTATIONAL_SPEED",
    "ROTATION_TIME_ACCURACY",
    "CRFR_TIME",
    "Kalibrasi Waktu Putar",
    "SEC",
    PCT_10_SPACE,
  ),
  t(
    "CENTRIFUGE_REFRIGERATOR",
    "TEMPERATURE_COLD_STORAGE",
    "STORAGE_TEMPERATURE_UNIFORMITY",
    "CRFR_STORAGE_TEMP",
    "Keseragaman Suhu Penyimpanan (multi-titik T1–T9)",
    "DEG_C",
    noteOnly("Setting suhu sesuai dengan rentang pemakaian; ± 3°C"),
  ),

  // LK CPAP.docx
  // env/electrical rows spelled out (predates the envElecID() helper); equivalent to
  // ...envElecID("CPAP", "CPAP", { ... }).
  t(
    "CPAP",
    "ENVIRONMENTAL_CONDITIONS",
    "ROOM_TEMPERATURE",
    "CPAP_ROOM_TEMP",
    "Suhu Ruangan",
    "DEG_C",
    pm(21, 5, "21 ± 5 °C"),
  ),
  t(
    "CPAP",
    "ENVIRONMENTAL_CONDITIONS",
    "ROOM_HUMIDITY",
    "CPAP_ROOM_HUMIDITY",
    "Kelembaban / RH",
    "PERCENT",
    HUMIDITY_55_20,
  ),
  t(
    "CPAP",
    "ENVIRONMENTAL_CONDITIONS",
    "INPUT_VOLTAGE",
    "CPAP_INPUT_VOLTAGE",
    "Tegangan Input",
    "V",
    VOLTAGE_220_10,
  ),
  t(
    "CPAP",
    "ELECTRICAL_SAFETY",
    "PROTECTIVE_EARTH_RESISTANCE",
    "CPAP_EARTH_RESISTANCE",
    "Resistansi Pembumian Protektif",
    "OHM",
    EARTH_03,
  ),
  t(
    "CPAP",
    "ELECTRICAL_SAFETY",
    "INSULATION_RESISTANCE",
    "CPAP_INSULATION_RESISTANCE",
    "Resistansi Isolasi",
    "MOHM",
    ISO_GT2_SPACE,
  ),
  t(
    "CPAP",
    "ELECTRICAL_SAFETY",
    "EQUIPMENT_LEAKAGE_CURRENT",
    "CPAP_EQUIP_LEAKAGE",
    "Arus Bocor Peralatan",
    "UA",
    LEAK_100,
  ),
  t(
    "CPAP",
    "ELECTRICAL_SAFETY",
    "APPLIED_PART_LEAKAGE_CURRENT",
    "CPAP_APPLIED_LEAKAGE",
    "Arus Bocor Bagian yang Diaplikasikan",
    "UA",
    APPLIED_50,
  ),
  t(
    "CPAP",
    "OXYGEN_CONCENTRATION",
    "OXYGEN_CONCENTRATION_ACCURACY",
    "CPAP_CONCENTRATION",
    "Konsentrasi Oksigen",
    "PERCENT",
    noteOnly("± 3%"),
  ),
  t(
    "CPAP",
    "GAS_FLOW_RATE",
    "FLOW_RATE_ACCURACY",
    "CPAP_FLOW_RATE",
    "Laju Aliran Gas",
    "L_MIN",
    noteOnly("± 20%"),
  ),

  // LK Dental Unit.docx
  ...envElecID("DENTAL_UNIT", "DUNIT", {
    temp: pm(25, 5, "25 ± 5 °C"),
    humidity: HUMIDITY_50_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_100,
    applied: APPLIED_50,
  }),
  t(
    "DENTAL_UNIT",
    "DENTAL_UNIT_PERFORMANCE",
    "HANDPIECE_SPEED_LOW",
    "DUNIT_HP_SPEED_LOW",
    "Kecepatan Putar Handpiece (Low Speed)",
    "REV_MIN",
    range(5000, 11000, "5000 rpm-11.000 rpm"),
  ),
  t(
    "DENTAL_UNIT",
    "DENTAL_UNIT_PERFORMANCE",
    "HANDPIECE_SPEED_HIGH",
    "DUNIT_HP_SPEED_HIGH",
    "Kecepatan Putar Handpiece (High Speed)",
    "REV_MIN",
    minOnly(250000, ">250.000 rpm"),
  ),
  t(
    "DENTAL_UNIT",
    "DENTAL_UNIT_PERFORMANCE",
    "HANDPIECE_PRESSURE",
    "DUNIT_HP_PRESSURE",
    "Tekanan Handpiece",
    "BAR",
    range(3, 4, "3,0 bar – 4,0 bar"),
  ),
  t(
    "DENTAL_UNIT",
    "DENTAL_UNIT_PERFORMANCE",
    "LIGHT_ILLUMINANCE",
    "DUNIT_ILLUMINANCE",
    "Illuminance (Jarak 70 cm)",
    "LUX",
    minOnly(15000, ">15.000 lux"),
  ),
  t(
    "DENTAL_UNIT",
    "DENTAL_UNIT_PERFORMANCE",
    "AIR_SPRAY_PRESSURE",
    "DUNIT_AIR_SPRAY",
    "Tekanan Semprot Udara",
    "MMHG",
    range(250, 500, "250 mmHg ~ 500 mmHg"),
  ),
  t(
    "DENTAL_UNIT",
    "DENTAL_UNIT_PERFORMANCE",
    "SUCTION_PRESSURE",
    "DUNIT_SUCTION",
    "Daya Hisap",
    "MMHG",
    range(-450, -150, "-150 mmHg ~-450 mmHg"),
  ),

  // LK Dental X-Ray.docx
  ...envElecID("DENTAL_XRAY", "DXRAY", {
    temp: pm(25, 5, "25 ± 5 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t(
    "DENTAL_XRAY",
    "XRAY_PERFORMANCE",
    "COLLIMATION_ACCURACY",
    "DXRAY_COLLIMATION_LENGTH",
    "Uji Kolimasi (Panjang)",
    "MM",
    minOnly(200, "≥ 200 mm"),
  ),
  t(
    "DENTAL_XRAY",
    "XRAY_PERFORMANCE",
    "COLLIMATION_ACCURACY",
    "DXRAY_COLLIMATION_DIAMETER",
    "Uji Kolimasi (Diameter)",
    "MM",
    maxOnly(60, "≤ 60 mm"),
  ),
  t(
    "DENTAL_XRAY",
    "XRAY_PERFORMANCE",
    "KV_ACCURACY",
    "DXRAY_KV_ACCURACY",
    "Akurasi Tegangan Tinggi (kV)",
    "KV",
    noteOnly("± 6 %"),
  ),
  t(
    "DENTAL_XRAY",
    "XRAY_PERFORMANCE",
    "EXPOSURE_TIME_ACCURACY",
    "DXRAY_EXPOSURE_TIME",
    "Akurasi Waktu Penyinaran",
    "SEC",
    noteOnly("± 10 %"),
  ),
  t(
    "DENTAL_XRAY",
    "XRAY_PERFORMANCE",
    "DOSE_LINEARITY",
    "DXRAY_DOSE_LINEARITY",
    "Linearitas Pengukuran",
    "MGY",
    noteOnly("± 10 %"),
  ),
  t(
    "DENTAL_XRAY",
    "XRAY_PERFORMANCE",
    "OUTPUT_REPRODUCIBILITY",
    "DXRAY_REPRODUCIBILITY",
    "Reproduksibilitas Keluaran Sinar-X",
    "MGY",
    noteOnly("± 10 %; CV ≤ 0.05"),
  ),
  // Half Value Layer — two kVp settings, each its own minimum
  // (LK Dental X-Ray.docx: 70 kV ≥ 1,5 mmAl, 80 kV ≥ 2,3 mmAl; source prints "mmAI").
  t(
    "DENTAL_XRAY",
    "XRAY_PERFORMANCE",
    "HALF_VALUE_LAYER",
    "DXRAY_HVL_70KV",
    "Pengujian Half Value Layer (HVL) (70 kV)",
    "MMAL",
    minOnly(1.5, "70 kV ≥ 1,5 mmAl"),
  ),
  t(
    "DENTAL_XRAY",
    "XRAY_PERFORMANCE",
    "HALF_VALUE_LAYER",
    "DXRAY_HVL_80KV",
    "Pengujian Half Value Layer (HVL) (80 kV)",
    "MMAL",
    minOnly(2.3, "80 kV ≥ 2,3 mmAl"),
  ),

  // LK Electro Accupunture (EST).docx
  ...envElecID("ELECTRO_ACCUPUNTURE", "EST", {
    temp: pm(25, 5, "25 ± 5 °C"),
    humidity: HUMIDITY_50_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_100,
    applied: APPLIED_50,
  }),
  t(
    "ELECTRO_ACCUPUNTURE",
    "ELECTROTHERAPY_STIMULATION",
    "STIMULATION_FREQUENCY",
    "EST_FREQUENCY",
    "Frekuensi",
    "HZ",
    noteOnly("±10%"),
  ),
  t(
    "ELECTRO_ACCUPUNTURE",
    "ELECTROTHERAPY_STIMULATION",
    "STIMULATION_INTENSITY",
    "EST_INTENSITY",
    "Intensitas Terapi",
    "MA",
    noteOnly("±20%"),
  ),
  t(
    "ELECTRO_ACCUPUNTURE",
    "ELECTROTHERAPY_STIMULATION",
    "PULSE_DURATION",
    "EST_PULSE_DURATION",
    "Pulse Duration",
    "MS",
    noteOnly("±10%"),
  ),
  t(
    "ELECTRO_ACCUPUNTURE",
    "ELECTROTHERAPY_STIMULATION",
    "TREATMENT_TIMER",
    "EST_TIMER",
    "Waktu",
    "SEC",
    noteOnly("±10%"),
  ),

  // LK Examination Lamp.docx
  ...envElecID("EXAMINATION_LAMP", "EXLMP", {
    temp: pm(25, 5, "25 ± 5 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_NOSPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t(
    "EXAMINATION_LAMP",
    "LIGHT_SOURCE_PERFORMANCE",
    "LIGHT_INTENSITY",
    "EXLMP_INTENSITY",
    "Intensitas Cahaya",
    "LUX",
    LIGHT_LUX_GT_1000,
  ),
  t(
    "EXAMINATION_LAMP",
    "LIGHT_SOURCE_PERFORMANCE",
    "COLOR_TEMPERATURE",
    "EXLMP_CCT",
    "Color Temperature",
    "KELVIN",
    LIGHT_CCT_3000_6700_LE,
  ),
  t(
    "EXAMINATION_LAMP",
    "LIGHT_SOURCE_PERFORMANCE",
    "COLOR_RENDERING_INDEX",
    "EXLMP_CRI",
    "Color Rendering Index",
    "RA",
    LIGHT_CRI_85_100,
  ),

  // LK Head Lamp Medik.docx
  ...envElecID("HEAD_LAMP_MEDIK", "HLAMP", {
    temp: pm(25, 5, "25 ± 5 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_NOSPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t(
    "HEAD_LAMP_MEDIK",
    "LIGHT_SOURCE_PERFORMANCE",
    "LIGHT_INTENSITY",
    "HLAMP_INTENSITY",
    "Intensitas Cahaya",
    "LUX",
    LIGHT_LUX_GT_1000,
  ),
  t(
    "HEAD_LAMP_MEDIK",
    "LIGHT_SOURCE_PERFORMANCE",
    "COLOR_TEMPERATURE",
    "HLAMP_CCT",
    "Color Temperature",
    "KELVIN",
    LIGHT_CCT_3000_6700_LE,
  ),
  t(
    "HEAD_LAMP_MEDIK",
    "LIGHT_SOURCE_PERFORMANCE",
    "COLOR_RENDERING_INDEX",
    "HLAMP_CRI",
    "Color Rendering Index",
    "RA",
    LIGHT_CRI_85_100,
  ),

  // LK Lampu Operasi.docx
  ...envElecID("LAMPU_OPERASI", "LOP", {
    temp: pm(25, 6, "25 ± 6 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_NOSPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t(
    "LAMPU_OPERASI",
    "LIGHT_SOURCE_PERFORMANCE",
    "LIGHT_INTENSITY",
    "LOP_INTENSITY",
    "Intensitas Cahaya",
    "LUX",
    LIGHT_LUX_SURGICAL,
  ),
  t(
    "LAMPU_OPERASI",
    "LIGHT_SOURCE_PERFORMANCE",
    "COLOR_TEMPERATURE",
    "LOP_CCT",
    "Color Temperature",
    "KELVIN",
    LIGHT_CCT_3000_6700_DASH,
  ),
  t(
    "LAMPU_OPERASI",
    "LIGHT_SOURCE_PERFORMANCE",
    "COLOR_RENDERING_INDEX",
    "LOP_CRI",
    "Color Rendering Index",
    "RA",
    LIGHT_CRI_85_100_DASH,
  ),

  // LK Laryngoskop.docx
  // FLAG: illuminance 40,000–160,000 lux matches Lampu Operasi and may be a
  // copy-paste artifact — seeded as-is from the source document.
  ...envElecID("LARYNGOSKOP", "LARYN", {
    temp: pm(25, 6, "25 ± 6 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_NOSPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t(
    "LARYNGOSKOP",
    "LIGHT_SOURCE_PERFORMANCE",
    "LIGHT_INTENSITY",
    "LARYN_INTENSITY",
    "Intensitas Cahaya",
    "LUX",
    LIGHT_LUX_SURGICAL,
  ),
  t(
    "LARYNGOSKOP",
    "LIGHT_SOURCE_PERFORMANCE",
    "COLOR_TEMPERATURE",
    "LARYN_CCT",
    "Color Temperature",
    "KELVIN",
    LIGHT_CCT_3000_6700_DASH,
  ),
  t(
    "LARYNGOSKOP",
    "LIGHT_SOURCE_PERFORMANCE",
    "COLOR_RENDERING_INDEX",
    "LARYN_CRI",
    "Color Rendering Index",
    "RA",
    LIGHT_CRI_85_100_DASH,
  ),

  // LK Fetal Doppler.docx
  ...envElecID("FETAL_DOPPLER", "FDOP", {
    temp: pm(25, 5, "25 ± 5 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_NOSPACE,
    leak: LEAK_100,
    applied: APPLIED_50,
  }),
  t(
    "FETAL_DOPPLER",
    "FETAL_HEART_RATE",
    "FETAL_HR_ACCURACY",
    "FDOP_HR_ACCURACY",
    "Kalibrasi Detak Jantung Bayi",
    "BPM",
    noteOnly("± 5 bpm"),
  ),

  // LK Infusion Pump.docx
  ...envElecID("INFUSION_PUMP", "INFUS", {
    temp: pm(25, 5, "25 ± 5 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_100,
    applied: APPLIED_50,
  }),
  t(
    "INFUSION_PUMP",
    "INFUSION_FLOW",
    "OCCLUSION_TEST",
    "INFUS_OCCLUSION",
    "Pengujian Occlusion/Pemampatan",
    "PSI",
    maxOnly(20, "< 20 psi"),
  ),
  t(
    "INFUSION_PUMP",
    "INFUSION_FLOW",
    "FLOW_RATE_CALIBRATION",
    "INFUS_FLOW_RATE",
    "Kalibrasi Laju Aliran",
    "ML_H",
    noteOnly("±10%"),
  ),

  // LK Syringe Pump.docx
  ...envElecID("SYRINGE_PUMP", "SYR", {
    temp: pm(25, 5, "25 ± 5 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_100,
    applied: APPLIED_50,
  }),
  t(
    "SYRINGE_PUMP",
    "INFUSION_FLOW",
    "OCCLUSION_TEST",
    "SYR_OCCLUSION",
    "Pengujian Occlusion/Pemampatan",
    "PSI",
    maxOnly(20, "< 20 psi"),
  ),
  t(
    "SYRINGE_PUMP",
    "INFUSION_FLOW",
    "FLOW_RATE_CALIBRATION",
    "SYR_FLOW_RATE",
    "Kalibrasi Laju Aliran",
    "ML_H",
    noteOnly("±10%"),
  ),

  // LK Laminar Air Flow.docx
  ...envElecID("LAMINAR_AIR_FLOW", "LAF", {
    temp: pm(20, 5, "20 ± 5 °C"),
    humidity: HUMIDITY_55_10,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t(
    "LAMINAR_AIR_FLOW",
    "CLEAN_AIR_CONTAINMENT",
    "PARTICLE_COUNT",
    "LAF_PARTICLE_COUNT",
    "Pengujian Particle Counter",
    "PARTICLE",
    maxOnly(100, "0,5 ≤ 100 Particle"),
  ),
  t(
    "LAMINAR_AIR_FLOW",
    "CLEAN_AIR_CONTAINMENT",
    "DOWNFLOW_VELOCITY",
    "LAF_DOWNFLOW",
    "Airflow Velocity",
    "M_S",
    noteOnly("Down Flow Velocity : 0,25 - 0,50 m/s; ± 0,025"),
  ),
  t(
    "LAMINAR_AIR_FLOW",
    "CLEAN_AIR_CONTAINMENT",
    "LIGHT_INTENSITY",
    "LAF_LIGHT_INTENSITY",
    "Pengukuran Nilai Intensitas Cahaya (Lighting)",
    "LUX",
    minOnly(750, "≥ 750 lux"),
  ),
  // Sound level — two distinct measurement zones, each its own limit
  // (LK Laminar Air Flow.docx: Background ≤ 55 dBA, Didalam kompartemen ≤ 65 dBA).
  t(
    "LAMINAR_AIR_FLOW",
    "CLEAN_AIR_CONTAINMENT",
    "SOUND_LEVEL",
    "LAF_SOUND_LEVEL_BACKGROUND",
    "Pengukuran Sound Level (Background)",
    "DBA",
    maxOnly(55, "Background ≤ 55 dBA"),
  ),
  t(
    "LAMINAR_AIR_FLOW",
    "CLEAN_AIR_CONTAINMENT",
    "SOUND_LEVEL",
    "LAF_SOUND_LEVEL_COMPARTMENT",
    "Pengukuran Sound Level (Didalam Kompartemen)",
    "DBA",
    maxOnly(65, "Didalam kompartemen ≤ 65 dBA"),
  ),
  t(
    "LAMINAR_AIR_FLOW",
    "CLEAN_AIR_CONTAINMENT",
    "UV_RADIATION",
    "LAF_UV_RADIATION",
    "Pengukuran Radiasi UV",
    "UW_CM2",
    minOnly(40, "≥ 40 µW/cm²"),
  ),

  // LK Mikroskop Laboratorium.docx
  ...envElecID("MIKROSKOP_LABORATORIUM", "MICRO", {
    temp: pm(25, 5, "25 ± 5 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t(
    "MIKROSKOP_LABORATORIUM",
    "OPTICAL_MAGNIFICATION",
    "MAGNIFICATION_4X",
    "MICRO_MAG_4X",
    "Pembesaran Objektif 4x",
    "UM",
    noteOnly("± 5%"),
  ),
  t(
    "MIKROSKOP_LABORATORIUM",
    "OPTICAL_MAGNIFICATION",
    "MAGNIFICATION_10X",
    "MICRO_MAG_10X",
    "Pembesaran Objektif 10x",
    "UM",
    noteOnly("± 5%"),
  ),
  t(
    "MIKROSKOP_LABORATORIUM",
    "OPTICAL_MAGNIFICATION",
    "MAGNIFICATION_RATIO",
    "MICRO_MAG_RATIO",
    "Nilai Ratio Pembesaran",
    null,
    noteOnly("± 5%"),
    "RATIO",
  ),

  // LK Phototherapy.docx
  ...envElecID("PHOTOTHERAPY", "PHOTO", {
    temp: pm(25, 6, "25 ± 6 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_100,
    applied: APPLIED_50,
  }),
  t(
    "PHOTOTHERAPY",
    "SPECTRAL_IRRADIANCE",
    "SPECTRAL_IRRADIANCE_ACCURACY",
    "PHOTO_IRRADIANCE",
    "Pengujian Keluaran Spectral Irradiance",
    "UW_CM2_NM",
    minOnly(8, "≥ 8 µW/cm2/nm"),
  ),

  // LK Platelet Agitator Incubator.docx
  ...envElecID("PLATELET_AGITATOR_INCUBATOR", "PLT", {
    temp: pm(25, 6, "25 ± 6 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t(
    "PLATELET_AGITATOR_INCUBATOR",
    "TEMPERATURE_COLD_STORAGE",
    "STORAGE_TEMPERATURE_UNIFORMITY",
    "PLT_STORAGE_TEMP",
    "Keseragaman Suhu Penyimpanan (multi-titik T1–T9, 20–24 °C)",
    "DEG_C",
    noteOnly("Setting suhu 20 ˚C - 24 ˚C; suhu : ± 1,5 °C"),
  ),

  // LK Rotator.docx
  ...envElecID("ROTATOR", "ROT", {
    temp: pm(25, 5, "25 ± 5 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_100,
    applied: APPLIED_50,
  }),
  t(
    "ROTATOR",
    "ROTATIONAL_SPEED",
    "ROTATION_SPEED_ACCURACY",
    "ROT_SPEED",
    "Kalibrasi Kecepatan Putar",
    "REV_MIN",
    PCT_10,
  ),
  t(
    "ROTATOR",
    "ROTATIONAL_SPEED",
    "ROTATION_TIME_ACCURACY",
    "ROT_TIME",
    "Kalibrasi Waktu Putar",
    "SEC",
    noteOnly("± 10 %"),
  ),

  // LK Spirometer.docx
  ...envElecID("SPIROMETER", "SPIRO", {
    temp: pm(25, 5, "25 ± 5 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_100,
    applied: APPLIED_50,
  }),
  t(
    "SPIROMETER",
    "SPIROMETRY_VOLUME_ACCURACY",
    "FVC_VOLUME_ACCURACY",
    "SPIRO_FVC",
    "Pengukuran Akurasi Total Volume Forced Vital Capacity (FVC)",
    "L",
    noteOnly("±3%"),
  ),

  // LK Suction Pump.docx
  ...envElecID("SUCTION_PUMP", "SUCT", {
    temp: range(19, 31, "19 – 31 oC"),
    humidity: range(35, 75, "35 – 75 % RH"),
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_SPACE,
    leak: LEAK_CLASS,
    applied: APPLIED_50,
  }),
  t(
    "SUCTION_PUMP",
    "VACUUM_SUCTION",
    "VACUUM_GAUGE_ACCURACY",
    "SUCT_VACUUM_GAUGE",
    "Akurasi Vacuum Gauge",
    "MMHG",
    PCT_10,
  ),
  t(
    "SUCTION_PUMP",
    "VACUUM_SUCTION",
    "MAXIMUM_VACUUM",
    "SUCT_MAX_VACUUM",
    "Maximum Vacuum",
    "MMHG",
    noteOnly(
      "Low Vacuum < 150 mmHg; Medium Vacuum 150 mmHg – 450 mmHg; High Vacuum ˃ 450 mmHg. *isi salah satu sesuai dengan UUT",
    ),
  ),
  t(
    "SUCTION_PUMP",
    "VACUUM_SUCTION",
    "TIME_TO_MAX_VACUUM",
    "SUCT_TIME_MAX_VACUUM",
    "Waktu Yang Dibutuhkan Saat Daya Hisap Maksimum",
    "SEC",
    maxOnly(15, "≤ 15 detik"),
  ),

  // LK Blanket Warmer.docx
  ...envElecID("BLANKET_WARMER", "BLNW", {
    temp: pm(25, 5, "25 ± 5 °C"),
    humidity: HUMIDITY_55_20,
    voltage: VOLTAGE_220_10,
    earth: EARTH_03,
    iso: ISO_GT2_NOSPACE,
    leak: LEAK_500,
    applied: APPLIED_500,
  }),
  t(
    "BLANKET_WARMER",
    "WARMER_SURFACE_TEMPERATURE",
    "HIGH_TEMP_PROTECTION",
    "BLNW_HIGH_TEMP",
    "Pengujian Proteksi Suhu Tinggi",
    "DEG_C",
    noteOnly("< 53°C ± 3℃"),
  ),
  t(
    "BLANKET_WARMER",
    "WARMER_SURFACE_TEMPERATURE",
    "WARMER_TEMPERATURE_CALIBRATION",
    "BLNW_TEMP_CALIBRATION",
    "Kalibrasi Suhu",
    "DEG_C",
    noteOnly("± 3°C"),
  ),
];

const EXPECTED_COUNT = 247;
const EXTENSION_DEVICE_TYPE_CODES = [
  "AUDIOMETER",
  "AUTOCLAVE",
  "BIO_SAFETY_CABINET",
  "CENTRIFUGE",
  "CENTRIFUGE_REFRIGERATOR",
  "CPAP",
  "DENTAL_UNIT",
  "DENTAL_XRAY",
  "ELECTRO_ACCUPUNTURE",
  "EXAMINATION_LAMP",
  "HEAD_LAMP_MEDIK",
  "LAMPU_OPERASI",
  "LARYNGOSKOP",
  "FETAL_DOPPLER",
  "INFUSION_PUMP",
  "SYRINGE_PUMP",
  "LAMINAR_AIR_FLOW",
  "MIKROSKOP_LABORATORIUM",
  "PHOTOTHERAPY",
  "PLATELET_AGITATOR_INCUBATOR",
  "ROTATOR",
  "SPIROMETER",
  "SUCTION_PUMP",
  "BLANKET_WARMER",
] as const;

const EXCLUDED_TYPE_CODES = [
  "AUTO_CHEMISTRY_ANALYZER",
  "HEMATOLOGI_ANALYZER",
  "PH_METER",
  "THERMOHYGROMETER",
  "OTOSCOPE",
  "PHACO_EMULSIFIKASI",
];

interface FailedRow {
  code: string;
  reason: string;
}

async function seedExtensionParameters() {
  if (PARAMETERS.length !== EXPECTED_COUNT) {
    throw new Error(
      `[seed] Expected ${EXPECTED_COUNT} extension DeviceCalibrationParameter rows, got ${PARAMETERS.length}`,
    );
  }

  const codes = PARAMETERS.map((row) => row.code);
  if (new Set(codes).size !== codes.length) {
    const dupes = codes.filter((code, i) => codes.indexOf(code) !== i);
    throw new Error(`[seed] Duplicate parameter codes: ${[...new Set(dupes)].join(", ")}`);
  }

  for (const row of PARAMETERS) {
    if (
      !EXTENSION_DEVICE_TYPE_CODES.includes(
        row.deviceTypeCode as (typeof EXTENSION_DEVICE_TYPE_CODES)[number],
      )
    ) {
      throw new Error(`[seed] Unexpected deviceTypeCode ${row.deviceTypeCode} for ${row.code}`);
    }
  }

  const [deviceTypeCount, capabilityCount, itemCount, originalParamCount] = await Promise.all([
    prisma.deviceType.count(),
    prisma.deviceCapability.count(),
    prisma.deviceCapabilityItem.count(),
    prisma.deviceCalibrationParameter.count({
      where: { deviceType: { code: { notIn: [...EXTENSION_DEVICE_TYPE_CODES] } } },
    }),
  ]);

  if (deviceTypeCount < 59) {
    throw new Error(
      `[seed] DeviceType count ${deviceTypeCount} < 59 — run seed:device-types first`,
    );
  }
  if (capabilityCount < 30) {
    throw new Error(
      `[seed] DeviceCapability count ${capabilityCount} < 30 — run seed:device-capabilities first`,
    );
  }
  if (itemCount < 98) {
    throw new Error(
      `[seed] DeviceCapabilityItem count ${itemCount} < 98 — run seed:device-capabilities first`,
    );
  }

  const excludedPresent = await prisma.deviceType.findMany({
    where: { code: { in: EXCLUDED_TYPE_CODES } },
    select: { code: true },
  });
  if (excludedPresent.length > 0) {
    throw new Error(
      `[seed] Excluded DeviceType(s) unexpectedly present: ${excludedPresent.map((r) => r.code).join(", ")}`,
    );
  }

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
    const capabilityId = capabilityIdByCode.get(row.capabilityCode);
    if (!capabilityId) {
      failed.push({
        code: row.code,
        reason: `missing DeviceCapability.code=${row.capabilityCode}`,
      });
      continue;
    }
    const capabilityItemId = itemIdByCapabilityAndCode.get(
      `${capabilityId}::${row.capabilityItemCode}`,
    );
    if (!capabilityItemId) {
      failed.push({
        code: row.code,
        reason: `missing DeviceCapabilityItem (${row.capabilityCode}, ${row.capabilityItemCode})`,
      });
      continue;
    }

    let uomId: string | null = null;
    if (row.uomCode) {
      const resolved = uomIdByCode.get(row.uomCode);
      if (!resolved) {
        failed.push({ code: row.code, reason: `missing Uom.code=${row.uomCode}` });
        continue;
      }
      uomId = resolved;
    } else if ((row.valueType ?? "NUMBER") === "NUMBER") {
      failed.push({ code: row.code, reason: "NUMBER valueType requires uomCode" });
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
        toleranceMin: row.toleranceMin,
        toleranceMax: row.toleranceMax,
        toleranceNote: row.toleranceNote,
        ...(row.valueType ? { valueType: row.valueType } : {}),
      },
      update: {
        name: row.name,
        uomId,
        toleranceMin: row.toleranceMin,
        toleranceMax: row.toleranceMax,
        toleranceNote: row.toleranceNote,
        ...(row.valueType ? { valueType: row.valueType } : {}),
      },
    });
    upserted += 1;
  }

  const [tableCount, extensionCount, bpmSystolic] = await Promise.all([
    prisma.deviceCalibrationParameter.count(),
    prisma.deviceCalibrationParameter.count({
      where: { deviceType: { code: { in: [...EXTENSION_DEVICE_TYPE_CODES] } } },
    }),
    prisma.deviceCalibrationParameter.findFirst({
      where: { code: "BPM_SYSTOLIC" },
      select: {
        code: true,
        toleranceMin: true,
        toleranceMax: true,
        toleranceNote: true,
      },
    }),
  ]);

  const originalAfter = await prisma.deviceCalibrationParameter.count({
    where: { deviceType: { code: { notIn: [...EXTENSION_DEVICE_TYPE_CODES] } } },
  });

  console.log(
    `[seed] ${upserted} extension DeviceCalibrationParameter rows upserted (extension table count: ${extensionCount}, total: ${tableCount}).`,
  );
  console.log(
    `[seed] Original (non-extension) DeviceCalibrationParameter count: ${originalParamCount} → ${originalAfter}.`,
  );
  if (bpmSystolic) {
    console.log(
      `[seed] Spot-check BPM_SYSTOLIC unchanged: note=${JSON.stringify(bpmSystolic.toleranceNote)} min=${bpmSystolic.toleranceMin} max=${bpmSystolic.toleranceMax}.`,
    );
  } else {
    console.log("[seed] Spot-check BPM_SYSTOLIC: not found.");
  }
  console.log(
    "[seed] FLAG: LARYN_INTENSITY illuminance 40,000–160,000 lux seeded as-is from LK Laryngoskop.docx — needs human review.",
  );

  if (failed.length > 0) {
    console.error(
      `[seed] ${failed.length} row(s) failed FK resolution:\n${failed.map((row) => `  - ${row.code}: ${row.reason}`).join("\n")}`,
    );
    throw new Error(`[seed] ${failed.length} row(s) failed FK resolution`);
  }

  if (originalAfter !== originalParamCount) {
    throw new Error(
      `[seed] Original parameter row count changed: ${originalParamCount} → ${originalAfter}`,
    );
  }

  await prisma.$disconnect();
}

seedExtensionParameters().catch((error) => {
  console.error("[seed] Failed:", error);
  process.exit(1);
});
