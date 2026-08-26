/**
 * Seeds DeviceCapability + DeviceCapabilityItem from real LK worksheets.
 * Original catalog: 21 capabilities / 66 items from Penilaian_Kemampuan.zip.
 * Extension: 9 capabilities + 32 items from technician-docs (new device types).
 * evidence_source is kept as comments only (not a DB column).
 * Run manually: pnpm --filter @medcal/db run seed:device-capabilities
 */
import { prisma } from "../src/index";

interface CapabilitySeedRow {
  code: string;
  name: string;
  description: string;
}

interface ItemSeedRow {
  capabilityCode: string;
  code: string;
  name: string;
}

/**
 * Original 21 DeviceCapability rows from seed_device_capability.csv,
 * plus 9 extension capabilities from technician-docs.
 * evidence_source (CSV, not persisted) is noted in the comment above each row.
 */
const CAPABILITIES: CapabilitySeedRow[] = [
  // LK Blood Pressure Monitor.pdf p1; LK Ventilator Transport.pdf p1; LK Sterilisator.pdf p1
  {
    code: "ENVIRONMENTAL_CONDITIONS",
    name: "Environmental Conditions",
    description:
      "Room temperature, humidity, and input voltage readings recorded before/after calibration. Present in nearly all LK worksheets (Section B).",
  },
  // LK Blood Pressure Monitor.pdf p2; LK Ventilator Transport.pdf p2; LK Sterilisator.pdf p2
  {
    code: "ELECTRICAL_SAFETY",
    name: "Electrical Safety",
    description:
      "Standard electrical safety test block (earth resistance, insulation resistance, leakage currents) per IEC 62353-style testing. Present in nearly all LK worksheets (Section D).",
  },
  // LK Blood Pressure Monitor.pdf p2; LK Bed Side Monitor.pdf (Kalibrasi NIBP)
  {
    code: "NIBP",
    name: "Non-Invasive Blood Pressure",
    description: "Blood pressure measurement accuracy (systolic/diastolic/mean).",
  },
  // LK Bed Side Monitor.pdf; LK Pulse Oxymeter.pdf
  {
    code: "VITAL_SIGNS_MONITORING",
    name: "Vital Signs Monitoring",
    description: "Heart rate, respiration rate, and SpO2 accuracy as measured on patient monitors.",
  },
  // LK Electrocardiograph.pdf (Pengukuran Amplitudo; Laju Rekaman; Kalibrasi Detak Jantung; Uji Sinyal Sinusoida; Uji Sinyal EKG Normal)
  {
    code: "ECG_PERFORMANCE",
    name: "ECG Performance",
    description:
      "Electrocardiograph signal accuracy: amplitude, recording speed, heart rate, waveform tests.",
  },
  // LK Sphygmomanometer.pdf (Uji kebocoran; Laju buang cepat; Pengukuran akurasi tekanan)
  {
    code: "NIBP_LEAK_TEST",
    name: "NIBP Cuff/Manometer Leak & Deflation",
    description:
      "Sphygmomanometer-specific pneumatic tests: leak test, rapid deflation rate, pressure accuracy.",
  },
  // LK Ventilator Transport.pdf p2-4 (9 numbered sub-tests)
  {
    code: "VENTILATION_PERFORMANCE",
    name: "Ventilation Performance",
    description:
      "Ventilator-specific respiratory mechanics: tidal/minute volume, respiration rate, I:E ratio, inspiratory/expiratory time, PEEP, peak inspiratory pressure, FiO2.",
  },
  // LK Resusitator Paru dan Neopuff.pdf (nilai tekanan maksimum; Kalibrasi akurasi tekanan resuscitator)
  {
    code: "RESUSCITATOR_PRESSURE",
    name: "Resuscitator Pressure",
    description:
      "Maximum pressure and pressure accuracy for manual/mechanical resuscitators (Cardiac/Pulmonary/Neopuff).",
  },
  // LK Autoclave.pdf; LK Sterilisator.pdf p2; LK Oven.pdf
  {
    code: "TEMPERATURE_CHAMBER_STERILIZATION",
    name: "Sterilization Chamber Temperature",
    description:
      "Chamber temperature, sterilization temperature, and sterilization time for autoclaves/dry sterilizers/ovens.",
  },
  // LK Blood Bank Refrigerator.pdf p2; LK Medical Refrigerator.pdf p2; LK Medical Freezer.pdf p2; LK Cold Chain, Vaccine Refrigerator.pdf p2
  {
    code: "TEMPERATURE_COLD_STORAGE",
    name: "Cold Storage Temperature Uniformity",
    description:
      "Multi-point temperature uniformity inside refrigerators/freezers/cold-chain storage.",
  },
  // LK Baby Incubator.pdf
  {
    code: "INCUBATOR_ENVIRONMENT",
    name: "Incubator Environment",
    description:
      "Baby incubator air temperature calibration, overshoot temperature, temperature recovery time, mattress temperature, air velocity, noise level, and skin temperature sensor calibration.",
  },
  // LK Infant Warmer.pdf (Kalibrasi suhu maksimum pada permukaan matras; Kalibrasi suhu)
  {
    code: "WARMER_SURFACE_TEMPERATURE",
    name: "Warmer Surface Temperature",
    description:
      "Infant/radiant warmer mattress surface maximum temperature and general temperature calibration.",
  },
  // LK Humidifier.pdf (Akurasi Suhu; Suhu Maksimum)
  {
    code: "HUMIDIFIER_TEMPERATURE",
    name: "Humidifier Temperature",
    description: "Humidifier temperature accuracy and maximum temperature.",
  },
  // LK Suction Pump.pdf (Akurasi Vacuum Gauge; Maximum Vacuum; Waktu Yang Dibutuhkan Saat Daya Hisap Maksimum)
  {
    code: "VACUUM_SUCTION",
    name: "Vacuum / Suction Performance",
    description:
      "Vacuum gauge accuracy, maximum vacuum level, and time-to-maximum-vacuum for suction/breast pump devices.",
  },
  // LK Centrifuge.pdf (Kalibrasi Kecepatan Putar; Kalibrasi Waktu Putar)
  {
    code: "ROTATIONAL_SPEED",
    name: "Rotational Speed & Timing",
    description: "Centrifuge rotation speed and rotation time accuracy.",
  },
  // LK Infusion Pump.pdf; LK Syringe Pump.pdf
  {
    code: "INFUSION_FLOW",
    name: "Infusion Flow Performance",
    description: "Infusion/syringe pump occlusion test and flow rate calibration.",
  },
  // LK Mikroskop Laboratorium.pdf (Pembesaran Objektif 4x; Pembesaran Objektif 10x; Nilai Ratio Pembesaran)
  {
    code: "OPTICAL_MAGNIFICATION",
    name: "Optical Magnification",
    description:
      "Microscope objective magnification accuracy at multiple magnification levels and magnification ratio.",
  },
  // LK Flow Meter.pdf; LK Nebulizer Compressor.pdf; LK Nebulizer Ultrasonic.pdf; LK Oksigen Concentrator.pdf
  {
    code: "GAS_FLOW_RATE",
    name: "Gas Flow Rate",
    description:
      "Gas flow rate accuracy for flow meters, nebulizer compressors, and oxygen concentrators.",
  },
  // LK Oksigen Concentrator.pdf (Konsentrasi Oksigen)
  {
    code: "OXYGEN_CONCENTRATION",
    name: "Oxygen Concentration",
    description: "Output oxygen concentration accuracy for oxygen concentrators.",
  },
  // LK Ultrasonograph (USG).pdf
  {
    code: "ULTRASOUND_IMAGING",
    name: "Ultrasound Imaging Performance",
    description:
      "Ultrasonograph (USG) image quality tests: dead zone, axial/lateral resolution, penetration depth, vertical/horizontal distance calibration.",
  },
  // LK Timbangan Bayi.pdf; LK Timbangan Dewasa.pdf
  {
    code: "MASS_WEIGHING",
    name: "Mass Weighing Performance",
    description:
      "Scale repeatability and deviation-from-nominal testing for infant/adult weighing scales.",
  },
  // LK Audiometer.docx
  {
    code: "AUDIOMETRIC_PERFORMANCE",
    name: "Audiometric Performance",
    description:
      "Pure-tone linearity (dB) and frequency response accuracy for audiometers.",
  },
  // LK Bio Safety Cabinet.docx; LK Laminar Air Flow.docx
  {
    code: "CLEAN_AIR_CONTAINMENT",
    name: "Clean Air Containment",
    description:
      "Particle count, airflow velocity, lighting, sound, UV radiation, and HEPA integrity for biosafety cabinets and laminar air flow.",
  },
  // LK Dental Unit.docx
  {
    code: "DENTAL_UNIT_PERFORMANCE",
    name: "Dental Unit Performance",
    description:
      "Handpiece speed/pressure, operatory illuminance, spray-air pressure, and suction for dental units.",
  },
  // LK Dental X-Ray.docx
  {
    code: "XRAY_PERFORMANCE",
    name: "X-Ray Performance",
    description:
      "Collimation, kV accuracy, exposure time, dose linearity, output reproducibility, and HVL for dental X-ray.",
  },
  // LK Electro Accupunture (EST).docx
  {
    code: "ELECTROTHERAPY_STIMULATION",
    name: "Electrotherapy Stimulation",
    description:
      "Stimulation frequency, intensity, pulse duration, and treatment timer for electro-acupuncture (EST).",
  },
  // LK Examination Lamp.docx; LK Head Lamp Medik.docx; LK Lampu Operasi.docx; LK Laryngoskop.docx
  {
    code: "LIGHT_SOURCE_PERFORMANCE",
    name: "Light Source Performance",
    description:
      "Illuminance, color temperature, and color rendering index for medical light sources.",
  },
  // LK Fetal Doppler.docx — dedicated capability (not VITAL_SIGNS_MONITORING.HEART_RATE)
  {
    code: "FETAL_HEART_RATE",
    name: "Fetal Heart Rate",
    description:
      "Fetal heart-rate accuracy using a fetal heart rate simulator (multi-point sweep).",
  },
  // LK Phototherapy.docx
  {
    code: "SPECTRAL_IRRADIANCE",
    name: "Spectral Irradiance",
    description:
      "Phototherapy lamp spectral irradiance output at multiple positions.",
  },
  // LK Spirometer.docx
  {
    code: "SPIROMETRY_VOLUME_ACCURACY",
    name: "Spirometry Volume Accuracy",
    description: "Forced vital capacity (FVC) volume accuracy against a 3 L syringe calibrator.",
  },
];

/**
 * Original 66 DeviceCapabilityItem rows from seed_device_capability_item.csv,
 * plus 32 extension items from technician-docs.
 * evidence_source (CSV, not persisted) is noted in the comment above each group.
 */
const ITEMS: ItemSeedRow[] = [
  // ENVIRONMENTAL_CONDITIONS — Section B, all LK docs
  {
    capabilityCode: "ENVIRONMENTAL_CONDITIONS",
    code: "ROOM_TEMPERATURE",
    name: "Room Temperature",
  },
  {
    capabilityCode: "ENVIRONMENTAL_CONDITIONS",
    code: "ROOM_HUMIDITY",
    name: "Room Relative Humidity",
  },
  {
    capabilityCode: "ENVIRONMENTAL_CONDITIONS",
    code: "INPUT_VOLTAGE",
    name: "Input Voltage (L-N/L-G/N-G)",
  },

  // ELECTRICAL_SAFETY — Section D, all LK docs
  {
    capabilityCode: "ELECTRICAL_SAFETY",
    code: "PROTECTIVE_EARTH_RESISTANCE",
    name: "Protective Earth Resistance",
  },
  {
    capabilityCode: "ELECTRICAL_SAFETY",
    code: "INSULATION_RESISTANCE",
    name: "Insulation Resistance",
  },
  {
    capabilityCode: "ELECTRICAL_SAFETY",
    code: "EQUIPMENT_LEAKAGE_CURRENT",
    name: "Equipment Leakage Current",
  },
  {
    capabilityCode: "ELECTRICAL_SAFETY",
    code: "APPLIED_PART_LEAKAGE_CURRENT",
    name: "Applied Part Leakage Current",
  },

  // NIBP — LK Blood Pressure Monitor.pdf
  { capabilityCode: "NIBP", code: "SYSTOLIC_PRESSURE", name: "Systolic Pressure" },
  { capabilityCode: "NIBP", code: "DIASTOLIC_PRESSURE", name: "Diastolic Pressure" },
  { capabilityCode: "NIBP", code: "MEAN_ARTERIAL_PRESSURE", name: "Mean Arterial Pressure" },

  // VITAL_SIGNS_MONITORING — LK Bed Side Monitor.pdf; LK Pulse Oxymeter.pdf
  { capabilityCode: "VITAL_SIGNS_MONITORING", code: "HEART_RATE", name: "Heart Rate" },
  { capabilityCode: "VITAL_SIGNS_MONITORING", code: "RESPIRATION_RATE", name: "Respiration Rate" },
  { capabilityCode: "VITAL_SIGNS_MONITORING", code: "SPO2_ACCURACY", name: "SpO2 Accuracy" },

  // ECG_PERFORMANCE — LK Electrocardiograph.pdf
  { capabilityCode: "ECG_PERFORMANCE", code: "AMPLITUDE_ACCURACY", name: "Amplitude Accuracy" },
  { capabilityCode: "ECG_PERFORMANCE", code: "RECORDING_SPEED", name: "Recording/Paper Speed" },
  {
    capabilityCode: "ECG_PERFORMANCE",
    code: "ECG_HEART_RATE_CALIBRATION",
    name: "Heart Rate Calibration",
  },
  {
    capabilityCode: "ECG_PERFORMANCE",
    code: "SINUSOIDAL_SIGNAL_TEST",
    name: "Sinusoidal Signal Test",
  },
  {
    capabilityCode: "ECG_PERFORMANCE",
    code: "NORMAL_ECG_SIGNAL_TEST",
    name: "Normal ECG Signal Test",
  },

  // NIBP_LEAK_TEST — LK Sphygmomanometer.pdf
  { capabilityCode: "NIBP_LEAK_TEST", code: "CUFF_LEAK_TEST", name: "Cuff/Manometer Leak Test" },
  { capabilityCode: "NIBP_LEAK_TEST", code: "RAPID_DEFLATION_RATE", name: "Rapid Deflation Rate" },
  {
    capabilityCode: "NIBP_LEAK_TEST",
    code: "PRESSURE_READING_ACCURACY",
    name: "Pressure Reading Accuracy",
  },

  // VENTILATION_PERFORMANCE — LK Ventilator Transport.pdf
  { capabilityCode: "VENTILATION_PERFORMANCE", code: "TIDAL_VOLUME", name: "Tidal Volume" },
  { capabilityCode: "VENTILATION_PERFORMANCE", code: "MINUTE_VOLUME", name: "Minute Volume" },
  {
    capabilityCode: "VENTILATION_PERFORMANCE",
    code: "VENT_RESPIRATION_RATE",
    name: "Respiration Rate",
  },
  { capabilityCode: "VENTILATION_PERFORMANCE", code: "IE_RATIO", name: "I:E Ratio" },
  { capabilityCode: "VENTILATION_PERFORMANCE", code: "INSPIRATORY_TIME", name: "Inspiratory Time" },
  { capabilityCode: "VENTILATION_PERFORMANCE", code: "EXPIRATORY_TIME", name: "Expiratory Time" },
  {
    capabilityCode: "VENTILATION_PERFORMANCE",
    code: "PEEP",
    name: "Positive End-Expiratory Pressure",
  },
  {
    capabilityCode: "VENTILATION_PERFORMANCE",
    code: "PEAK_INSPIRATORY_PRESSURE",
    name: "Peak Inspiratory Pressure",
  },
  { capabilityCode: "VENTILATION_PERFORMANCE", code: "FIO2_ACCURACY", name: "FiO2 Accuracy" },

  // RESUSCITATOR_PRESSURE — LK Resusitator Paru dan Neopuff.pdf
  { capabilityCode: "RESUSCITATOR_PRESSURE", code: "MAX_PRESSURE", name: "Maximum Pressure" },
  { capabilityCode: "RESUSCITATOR_PRESSURE", code: "PRESSURE_ACCURACY", name: "Pressure Accuracy" },

  // TEMPERATURE_CHAMBER_STERILIZATION — LK Autoclave.pdf; LK Sterilisator.pdf; LK Oven.pdf
  {
    capabilityCode: "TEMPERATURE_CHAMBER_STERILIZATION",
    code: "CHAMBER_TEMPERATURE",
    name: "Chamber Temperature",
  },
  {
    capabilityCode: "TEMPERATURE_CHAMBER_STERILIZATION",
    code: "STERILIZATION_TEMPERATURE",
    name: "Sterilization Temperature",
  },
  {
    capabilityCode: "TEMPERATURE_CHAMBER_STERILIZATION",
    code: "STERILIZATION_TIME",
    name: "Sterilization Time",
  },

  // TEMPERATURE_COLD_STORAGE — LK Blood Bank Refrigerator.pdf; LK Medical Refrigerator.pdf; LK Medical Freezer.pdf; LK Cold Chain, Vaccine Refrigerator.pdf
  {
    capabilityCode: "TEMPERATURE_COLD_STORAGE",
    code: "STORAGE_TEMPERATURE_UNIFORMITY",
    name: "Storage Temperature Uniformity (Multi-Point)",
  },

  // INCUBATOR_ENVIRONMENT — LK Baby Incubator.pdf
  {
    capabilityCode: "INCUBATOR_ENVIRONMENT",
    code: "AIR_TEMPERATURE_CALIBRATION",
    name: "Air Temperature Calibration",
  },
  {
    capabilityCode: "INCUBATOR_ENVIRONMENT",
    code: "OVERSHOOT_TEMPERATURE",
    name: "Overshoot Temperature",
  },
  {
    capabilityCode: "INCUBATOR_ENVIRONMENT",
    code: "TEMPERATURE_RECOVERY_TIME",
    name: "Temperature Recovery Time",
  },
  {
    capabilityCode: "INCUBATOR_ENVIRONMENT",
    code: "MATTRESS_TEMPERATURE",
    name: "Mattress Temperature",
  },
  { capabilityCode: "INCUBATOR_ENVIRONMENT", code: "AIR_VELOCITY", name: "Air Velocity" },
  { capabilityCode: "INCUBATOR_ENVIRONMENT", code: "NOISE_LEVEL", name: "Noise Level" },
  {
    capabilityCode: "INCUBATOR_ENVIRONMENT",
    code: "SKIN_TEMPERATURE_SENSOR",
    name: "Skin Temperature Sensor Calibration",
  },

  // WARMER_SURFACE_TEMPERATURE — LK Infant Warmer.pdf
  {
    capabilityCode: "WARMER_SURFACE_TEMPERATURE",
    code: "MAX_MATTRESS_SURFACE_TEMPERATURE",
    name: "Maximum Mattress Surface Temperature",
  },
  {
    capabilityCode: "WARMER_SURFACE_TEMPERATURE",
    code: "WARMER_TEMPERATURE_CALIBRATION",
    name: "Temperature Calibration",
  },

  // HUMIDIFIER_TEMPERATURE — LK Humidifier.pdf
  {
    capabilityCode: "HUMIDIFIER_TEMPERATURE",
    code: "TEMPERATURE_ACCURACY",
    name: "Temperature Accuracy",
  },
  {
    capabilityCode: "HUMIDIFIER_TEMPERATURE",
    code: "MAXIMUM_TEMPERATURE",
    name: "Maximum Temperature",
  },

  // VACUUM_SUCTION — LK Suction Pump.pdf
  {
    capabilityCode: "VACUUM_SUCTION",
    code: "VACUUM_GAUGE_ACCURACY",
    name: "Vacuum Gauge Accuracy",
  },
  { capabilityCode: "VACUUM_SUCTION", code: "MAXIMUM_VACUUM", name: "Maximum Vacuum" },
  { capabilityCode: "VACUUM_SUCTION", code: "TIME_TO_MAX_VACUUM", name: "Time to Maximum Vacuum" },

  // ROTATIONAL_SPEED — LK Centrifuge.pdf
  {
    capabilityCode: "ROTATIONAL_SPEED",
    code: "ROTATION_SPEED_ACCURACY",
    name: "Rotation Speed Accuracy",
  },
  {
    capabilityCode: "ROTATIONAL_SPEED",
    code: "ROTATION_TIME_ACCURACY",
    name: "Rotation Time Accuracy",
  },

  // INFUSION_FLOW — LK Infusion Pump.pdf; LK Syringe Pump.pdf
  { capabilityCode: "INFUSION_FLOW", code: "OCCLUSION_TEST", name: "Occlusion Test" },
  { capabilityCode: "INFUSION_FLOW", code: "FLOW_RATE_CALIBRATION", name: "Flow Rate Calibration" },

  // OPTICAL_MAGNIFICATION — LK Mikroskop Laboratorium.pdf
  {
    capabilityCode: "OPTICAL_MAGNIFICATION",
    code: "MAGNIFICATION_4X",
    name: "Objective Magnification 4x",
  },
  {
    capabilityCode: "OPTICAL_MAGNIFICATION",
    code: "MAGNIFICATION_10X",
    name: "Objective Magnification 10x",
  },
  {
    capabilityCode: "OPTICAL_MAGNIFICATION",
    code: "MAGNIFICATION_RATIO",
    name: "Magnification Ratio",
  },

  // GAS_FLOW_RATE — LK Flow Meter.pdf; LK Nebulizer Compressor.pdf; LK Nebulizer Ultrasonic.pdf; LK Oksigen Concentrator.pdf
  { capabilityCode: "GAS_FLOW_RATE", code: "FLOW_RATE_ACCURACY", name: "Flow Rate Accuracy" },

  // OXYGEN_CONCENTRATION — LK Oksigen Concentrator.pdf
  {
    capabilityCode: "OXYGEN_CONCENTRATION",
    code: "OXYGEN_CONCENTRATION_ACCURACY",
    name: "Oxygen Concentration Accuracy",
  },

  // ULTRASOUND_IMAGING — LK Ultrasonograph (USG).pdf
  { capabilityCode: "ULTRASOUND_IMAGING", code: "DEAD_ZONE_TEST", name: "Dead Zone Test" },
  {
    capabilityCode: "ULTRASOUND_IMAGING",
    code: "AXIAL_LATERAL_RESOLUTION",
    name: "Axial and Lateral Resolution",
  },
  { capabilityCode: "ULTRASOUND_IMAGING", code: "PENETRATION_DEPTH", name: "Penetration Depth" },
  {
    capabilityCode: "ULTRASOUND_IMAGING",
    code: "VERTICAL_DISTANCE_CALIBRATION",
    name: "Vertical Distance Calibration",
  },
  {
    capabilityCode: "ULTRASOUND_IMAGING",
    code: "HORIZONTAL_DISTANCE_CALIBRATION",
    name: "Horizontal Distance Calibration",
  },

  // MASS_WEIGHING — LK Timbangan Bayi.pdf; LK Timbangan Dewasa.pdf
  { capabilityCode: "MASS_WEIGHING", code: "REPEATABILITY", name: "Repeatability (Daya Ulang)" },
  {
    capabilityCode: "MASS_WEIGHING",
    code: "DEVIATION_FROM_NOMINAL",
    name: "Deviation from Nominal Value",
  },

  // AUDIOMETRIC_PERFORMANCE — LK Audiometer.docx
  {
    capabilityCode: "AUDIOMETRIC_PERFORMANCE",
    code: "PURE_TONE_LINEARITY",
    name: "Pure Tone Linearity",
  },
  {
    capabilityCode: "AUDIOMETRIC_PERFORMANCE",
    code: "FREQUENCY_RESPONSE",
    name: "Frequency Response",
  },

  // CLEAN_AIR_CONTAINMENT — LK Bio Safety Cabinet.docx; LK Laminar Air Flow.docx
  {
    capabilityCode: "CLEAN_AIR_CONTAINMENT",
    code: "PARTICLE_COUNT",
    name: "Particle Count",
  },
  {
    capabilityCode: "CLEAN_AIR_CONTAINMENT",
    code: "DOWNFLOW_VELOCITY",
    name: "Downflow Velocity",
  },
  {
    capabilityCode: "CLEAN_AIR_CONTAINMENT",
    code: "INFLOW_VELOCITY",
    name: "Inflow Velocity",
  },
  {
    capabilityCode: "CLEAN_AIR_CONTAINMENT",
    code: "LIGHT_INTENSITY",
    name: "Light Intensity",
  },
  {
    capabilityCode: "CLEAN_AIR_CONTAINMENT",
    code: "SOUND_LEVEL",
    name: "Sound Level",
  },
  {
    capabilityCode: "CLEAN_AIR_CONTAINMENT",
    code: "UV_RADIATION",
    name: "UV Radiation",
  },
  {
    capabilityCode: "CLEAN_AIR_CONTAINMENT",
    code: "HEPA_LEAK_TEST",
    name: "HEPA / ULPA Leak Test",
  },

  // DENTAL_UNIT_PERFORMANCE — LK Dental Unit.docx
  {
    capabilityCode: "DENTAL_UNIT_PERFORMANCE",
    code: "HANDPIECE_SPEED_LOW",
    name: "Handpiece Speed (Low)",
  },
  {
    capabilityCode: "DENTAL_UNIT_PERFORMANCE",
    code: "HANDPIECE_SPEED_HIGH",
    name: "Handpiece Speed (High)",
  },
  {
    capabilityCode: "DENTAL_UNIT_PERFORMANCE",
    code: "HANDPIECE_PRESSURE",
    name: "Handpiece Pressure",
  },
  {
    capabilityCode: "DENTAL_UNIT_PERFORMANCE",
    code: "LIGHT_ILLUMINANCE",
    name: "Light Illuminance",
  },
  {
    capabilityCode: "DENTAL_UNIT_PERFORMANCE",
    code: "AIR_SPRAY_PRESSURE",
    name: "Air Spray Pressure",
  },
  {
    capabilityCode: "DENTAL_UNIT_PERFORMANCE",
    code: "SUCTION_PRESSURE",
    name: "Suction Pressure",
  },

  // XRAY_PERFORMANCE — LK Dental X-Ray.docx
  {
    capabilityCode: "XRAY_PERFORMANCE",
    code: "COLLIMATION_ACCURACY",
    name: "Collimation Accuracy",
  },
  { capabilityCode: "XRAY_PERFORMANCE", code: "KV_ACCURACY", name: "kV Accuracy" },
  {
    capabilityCode: "XRAY_PERFORMANCE",
    code: "EXPOSURE_TIME_ACCURACY",
    name: "Exposure Time Accuracy",
  },
  { capabilityCode: "XRAY_PERFORMANCE", code: "DOSE_LINEARITY", name: "Dose Linearity" },
  {
    capabilityCode: "XRAY_PERFORMANCE",
    code: "OUTPUT_REPRODUCIBILITY",
    name: "Output Reproducibility",
  },
  {
    capabilityCode: "XRAY_PERFORMANCE",
    code: "HALF_VALUE_LAYER",
    name: "Half Value Layer",
  },

  // ELECTROTHERAPY_STIMULATION — LK Electro Accupunture (EST).docx
  {
    capabilityCode: "ELECTROTHERAPY_STIMULATION",
    code: "STIMULATION_FREQUENCY",
    name: "Stimulation Frequency",
  },
  {
    capabilityCode: "ELECTROTHERAPY_STIMULATION",
    code: "STIMULATION_INTENSITY",
    name: "Stimulation Intensity",
  },
  {
    capabilityCode: "ELECTROTHERAPY_STIMULATION",
    code: "PULSE_DURATION",
    name: "Pulse Duration",
  },
  {
    capabilityCode: "ELECTROTHERAPY_STIMULATION",
    code: "TREATMENT_TIMER",
    name: "Treatment Timer",
  },

  // LIGHT_SOURCE_PERFORMANCE — light-source family
  {
    capabilityCode: "LIGHT_SOURCE_PERFORMANCE",
    code: "LIGHT_INTENSITY",
    name: "Light Intensity",
  },
  {
    capabilityCode: "LIGHT_SOURCE_PERFORMANCE",
    code: "COLOR_TEMPERATURE",
    name: "Color Temperature",
  },
  {
    capabilityCode: "LIGHT_SOURCE_PERFORMANCE",
    code: "COLOR_RENDERING_INDEX",
    name: "Color Rendering Index",
  },

  // FETAL_HEART_RATE — LK Fetal Doppler.docx
  {
    capabilityCode: "FETAL_HEART_RATE",
    code: "FETAL_HR_ACCURACY",
    name: "Fetal Heart Rate Accuracy",
  },

  // SPECTRAL_IRRADIANCE — LK Phototherapy.docx
  {
    capabilityCode: "SPECTRAL_IRRADIANCE",
    code: "SPECTRAL_IRRADIANCE_ACCURACY",
    name: "Spectral Irradiance Accuracy",
  },

  // SPIROMETRY_VOLUME_ACCURACY — LK Spirometer.docx
  {
    capabilityCode: "SPIROMETRY_VOLUME_ACCURACY",
    code: "FVC_VOLUME_ACCURACY",
    name: "FVC Volume Accuracy",
  },

  // WARMER_SURFACE_TEMPERATURE — extra item for Blanket Warmer (LK Blanket Warmer.docx)
  {
    capabilityCode: "WARMER_SURFACE_TEMPERATURE",
    code: "HIGH_TEMP_PROTECTION",
    name: "High Temperature Protection",
  },
];

const ORIGINAL_CAPABILITY_COUNT = 21;
const EXTENSION_CAPABILITY_COUNT = 9;
const ORIGINAL_ITEM_COUNT = 66;
const EXTENSION_ITEM_COUNT = 32;

async function seedDeviceCapabilities() {
  if (CAPABILITIES.length !== ORIGINAL_CAPABILITY_COUNT + EXTENSION_CAPABILITY_COUNT) {
    throw new Error(
      `[seed] Expected ${ORIGINAL_CAPABILITY_COUNT + EXTENSION_CAPABILITY_COUNT} DeviceCapability rows, got ${CAPABILITIES.length}`,
    );
  }
  if (ITEMS.length !== ORIGINAL_ITEM_COUNT + EXTENSION_ITEM_COUNT) {
    throw new Error(
      `[seed] Expected ${ORIGINAL_ITEM_COUNT + EXTENSION_ITEM_COUNT} DeviceCapabilityItem rows, got ${ITEMS.length}`,
    );
  }

  const capabilityIdByCode = new Map<string, string>();

  for (const row of CAPABILITIES) {
    const capability = await prisma.deviceCapability.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        name: row.name,
        description: row.description,
      },
      update: {
        name: row.name,
        description: row.description,
      },
    });
    capabilityIdByCode.set(row.code, capability.id);
  }

  const unresolved: string[] = [];

  for (const row of ITEMS) {
    const capabilityId = capabilityIdByCode.get(row.capabilityCode);
    if (!capabilityId) {
      unresolved.push(`${row.capabilityCode}/${row.code}`);
      continue;
    }
    await prisma.deviceCapabilityItem.upsert({
      where: {
        capabilityId_code: {
          capabilityId,
          code: row.code,
        },
      },
      create: {
        capabilityId,
        code: row.code,
        name: row.name,
      },
      update: {
        name: row.name,
      },
    });
  }

  if (unresolved.length > 0) {
    throw new Error(
      `[seed] Could not resolve capability_code for ${unresolved.length} item(s): ${unresolved.join(", ")}`,
    );
  }

  const [capabilityCount, itemCount] = await Promise.all([
    prisma.deviceCapability.count(),
    prisma.deviceCapabilityItem.count(),
  ]);

  console.log(
    `[seed] ${CAPABILITIES.length} DeviceCapability rows upserted (table count: ${capabilityCount}).`,
  );
  console.log(
    `[seed] ${ITEMS.length} DeviceCapabilityItem rows upserted (table count: ${itemCount}).`,
  );
  await prisma.$disconnect();
}

seedDeviceCapabilities().catch((error) => {
  console.error("[seed] Failed:", error);
  process.exit(1);
});
