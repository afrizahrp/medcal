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
    name: "Kondisi Lingkungan",
    description:
      "Room temperature, humidity, and input voltage readings recorded before/after calibration. Present in nearly all LK worksheets (Section B).",
  },
  // LK Blood Pressure Monitor.pdf p2; LK Ventilator Transport.pdf p2; LK Sterilisator.pdf p2
  {
    code: "ELECTRICAL_SAFETY",
    name: "Keselamatan Listrik",
    description:
      "Standard electrical safety test block (earth resistance, insulation resistance, leakage currents) per IEC 62353-style testing. Present in nearly all LK worksheets (Section D).",
  },
  // LK Blood Pressure Monitor.pdf p2; LK Bed Side Monitor.pdf (Kalibrasi NIBP)
  {
    code: "NIBP",
    name: "Tekanan Darah Non-Invasif (NIBP)",
    description: "Blood pressure measurement accuracy (systolic/diastolic/mean).",
  },
  // LK Bed Side Monitor.pdf; LK Pulse Oxymeter.pdf
  {
    code: "VITAL_SIGNS_MONITORING",
    name: "Pemantauan Tanda Vital",
    description: "Heart rate, respiration rate, and SpO2 accuracy as measured on patient monitors.",
  },
  // LK Electrocardiograph.pdf (Pengukuran Amplitudo; Laju Rekaman; Kalibrasi Detak Jantung; Uji Sinyal Sinusoida; Uji Sinyal EKG Normal)
  {
    code: "ECG_PERFORMANCE",
    name: "Kinerja Elektrokardiografi (EKG)",
    description:
      "Electrocardiograph signal accuracy: amplitude, recording speed, heart rate, waveform tests.",
  },
  // LK Sphygmomanometer.pdf (Uji kebocoran; Laju buang cepat; Pengukuran akurasi tekanan)
  {
    code: "NIBP_LEAK_TEST",
    name: "Uji Kebocoran Manset NIBP",
    description:
      "Sphygmomanometer-specific pneumatic tests: leak test, rapid deflation rate, pressure accuracy.",
  },
  // LK Ventilator Transport.pdf p2-4 (9 numbered sub-tests)
  {
    code: "VENTILATION_PERFORMANCE",
    name: "Kinerja Ventilasi",
    description:
      "Ventilator-specific respiratory mechanics: tidal/minute volume, respiration rate, I:E ratio, inspiratory/expiratory time, PEEP, peak inspiratory pressure, FiO2.",
  },
  // LK Resusitator Paru dan Neopuff.pdf (nilai tekanan maksimum; Kalibrasi akurasi tekanan resuscitator)
  {
    code: "RESUSCITATOR_PRESSURE",
    name: "Tekanan Resusitator",
    description:
      "Maximum pressure and pressure accuracy for manual/mechanical resuscitators (Cardiac/Pulmonary/Neopuff).",
  },
  // LK Autoclave.pdf; LK Sterilisator.pdf p2; LK Oven.pdf
  {
    code: "TEMPERATURE_CHAMBER_STERILIZATION",
    name: "Suhu Ruang Sterilisasi",
    description:
      "Chamber temperature, sterilization temperature, and sterilization time for autoclaves/dry sterilizers/ovens.",
  },
  // LK Blood Bank Refrigerator.pdf p2; LK Medical Refrigerator.pdf p2; LK Medical Freezer.pdf p2; LK Cold Chain, Vaccine Refrigerator.pdf p2
  {
    code: "TEMPERATURE_COLD_STORAGE",
    name: "Suhu Penyimpanan Dingin",
    description:
      "Multi-point temperature uniformity inside refrigerators/freezers/cold-chain storage.",
  },
  // LK Baby Incubator.pdf
  {
    code: "INCUBATOR_ENVIRONMENT",
    name: "Lingkungan Inkubator",
    description:
      "Baby incubator air temperature calibration, overshoot temperature, temperature recovery time, mattress temperature, air velocity, noise level, and skin temperature sensor calibration.",
  },
  // LK Infant Warmer.pdf (Kalibrasi suhu maksimum pada permukaan matras; Kalibrasi suhu)
  {
    code: "WARMER_SURFACE_TEMPERATURE",
    name: "Suhu Permukaan Alat Penghangat",
    description:
      "Infant/radiant warmer mattress surface maximum temperature and general temperature calibration.",
  },
  // LK Humidifier.pdf (Akurasi Suhu; Suhu Maksimum)
  {
    code: "HUMIDIFIER_TEMPERATURE",
    name: "Suhu Humidifier",
    description: "Humidifier temperature accuracy and maximum temperature.",
  },
  // LK Suction Pump.pdf (Akurasi Vacuum Gauge; Maximum Vacuum; Waktu Yang Dibutuhkan Saat Daya Hisap Maksimum)
  {
    code: "VACUUM_SUCTION",
    name: "Kinerja Vakum/Suction",
    description:
      "Vacuum gauge accuracy, maximum vacuum level, and time-to-maximum-vacuum for suction/breast pump devices.",
  },
  // LK Centrifuge.pdf (Kalibrasi Kecepatan Putar; Kalibrasi Waktu Putar)
  {
    code: "ROTATIONAL_SPEED",
    name: "Kecepatan Putar",
    description: "Centrifuge rotation speed and rotation time accuracy.",
  },
  // LK Infusion Pump.pdf; LK Syringe Pump.pdf
  {
    code: "INFUSION_FLOW",
    name: "Laju Aliran Infus",
    description: "Infusion/syringe pump occlusion test and flow rate calibration.",
  },
  // LK Mikroskop Laboratorium.pdf (Pembesaran Objektif 4x; Pembesaran Objektif 10x; Nilai Ratio Pembesaran)
  {
    code: "OPTICAL_MAGNIFICATION",
    name: "Pembesaran Optik",
    description:
      "Microscope objective magnification accuracy at multiple magnification levels and magnification ratio.",
  },
  // LK Flow Meter.pdf; LK Nebulizer Compressor.pdf; LK Nebulizer Ultrasonic.pdf; LK Oksigen Concentrator.pdf
  {
    code: "GAS_FLOW_RATE",
    name: "Laju Aliran Gas",
    description:
      "Gas flow rate accuracy for flow meters, nebulizer compressors, and oxygen concentrators.",
  },
  // LK Oksigen Concentrator.pdf (Konsentrasi Oksigen)
  {
    code: "OXYGEN_CONCENTRATION",
    name: "Konsentrasi Oksigen",
    description: "Output oxygen concentration accuracy for oxygen concentrators.",
  },
  // LK Ultrasonograph (USG).pdf
  {
    code: "ULTRASOUND_IMAGING",
    name: "Pencitraan Ultrasonografi (USG)",
    description:
      "Ultrasonograph (USG) image quality tests: dead zone, axial/lateral resolution, penetration depth, vertical/horizontal distance calibration.",
  },
  // LK Timbangan Bayi.pdf; LK Timbangan Dewasa.pdf
  {
    code: "MASS_WEIGHING",
    name: "Penimbangan Massa",
    description:
      "Scale repeatability and deviation-from-nominal testing for infant/adult weighing scales.",
  },
  // LK Audiometer.docx
  {
    code: "AUDIOMETRIC_PERFORMANCE",
    name: "Kinerja Audiometri",
    description:
      "Pure-tone linearity (dB) and frequency response accuracy for audiometers.",
  },
  // LK Bio Safety Cabinet.docx; LK Laminar Air Flow.docx
  {
    code: "CLEAN_AIR_CONTAINMENT",
    name: "Kebersihan & Kontainmen Udara",
    description:
      "Particle count, airflow velocity, lighting, sound, UV radiation, and HEPA integrity for biosafety cabinets and laminar air flow.",
  },
  // LK Dental Unit.docx
  {
    code: "DENTAL_UNIT_PERFORMANCE",
    name: "Kinerja Unit Gigi",
    description:
      "Handpiece speed/pressure, operatory illuminance, spray-air pressure, and suction for dental units.",
  },
  // LK Dental X-Ray.docx
  {
    code: "XRAY_PERFORMANCE",
    name: "Kinerja Sinar-X",
    description:
      "Collimation, kV accuracy, exposure time, dose linearity, output reproducibility, and HVL for dental X-ray.",
  },
  // LK Electro Accupunture (EST).docx
  {
    code: "ELECTROTHERAPY_STIMULATION",
    name: "Stimulasi Elektroterapi",
    description:
      "Stimulation frequency, intensity, pulse duration, and treatment timer for electro-acupuncture (EST).",
  },
  // LK Examination Lamp.docx; LK Head Lamp Medik.docx; LK Lampu Operasi.docx; LK Laryngoskop.docx
  {
    code: "LIGHT_SOURCE_PERFORMANCE",
    name: "Kinerja Sumber Cahaya",
    description:
      "Illuminance, color temperature, and color rendering index for medical light sources.",
  },
  // LK Fetal Doppler.docx — dedicated capability (not VITAL_SIGNS_MONITORING.HEART_RATE)
  {
    code: "FETAL_HEART_RATE",
    name: "Detak Jantung Janin",
    description:
      "Fetal heart-rate accuracy using a fetal heart rate simulator (multi-point sweep).",
  },
  // LK Phototherapy.docx
  {
    code: "SPECTRAL_IRRADIANCE",
    name: "Iradiansi Spektral (Fototerapi)",
    description:
      "Phototherapy lamp spectral irradiance output at multiple positions.",
  },
  // LK Spirometer.docx
  {
    code: "SPIROMETRY_VOLUME_ACCURACY",
    name: "Akurasi Volume Spirometri",
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
    name: "Suhu Ruangan",
  },
  {
    capabilityCode: "ENVIRONMENTAL_CONDITIONS",
    code: "ROOM_HUMIDITY",
    name: "Kelembaban / RH",
  },
  {
    capabilityCode: "ENVIRONMENTAL_CONDITIONS",
    code: "INPUT_VOLTAGE",
    name: "Tegangan Input (L-N/L-G/N-G)",
  },

  // ELECTRICAL_SAFETY — Section D, all LK docs
  {
    capabilityCode: "ELECTRICAL_SAFETY",
    code: "PROTECTIVE_EARTH_RESISTANCE",
    name: "Resistansi Pembumian Protektif",
  },
  {
    capabilityCode: "ELECTRICAL_SAFETY",
    code: "INSULATION_RESISTANCE",
    name: "Resistansi Isolasi",
  },
  {
    capabilityCode: "ELECTRICAL_SAFETY",
    code: "EQUIPMENT_LEAKAGE_CURRENT",
    name: "Arus Bocor Peralatan",
  },
  {
    capabilityCode: "ELECTRICAL_SAFETY",
    code: "APPLIED_PART_LEAKAGE_CURRENT",
    name: "Arus Bocor Bagian yang Diaplikasikan",
  },

  // NIBP — LK Blood Pressure Monitor.pdf
  { capabilityCode: "NIBP", code: "SYSTOLIC_PRESSURE", name: "Systole" },
  { capabilityCode: "NIBP", code: "DIASTOLIC_PRESSURE", name: "Diastole" },
  { capabilityCode: "NIBP", code: "MEAN_ARTERIAL_PRESSURE", name: "Mean" },

  // VITAL_SIGNS_MONITORING — LK Bed Side Monitor.pdf; LK Pulse Oxymeter.pdf
  { capabilityCode: "VITAL_SIGNS_MONITORING", code: "HEART_RATE", name: "Heart Rate" },
  { capabilityCode: "VITAL_SIGNS_MONITORING", code: "RESPIRATION_RATE", name: "Respirasi" },
  { capabilityCode: "VITAL_SIGNS_MONITORING", code: "SPO2_ACCURACY", name: "Saturasi Oxygen (SPO2)" },

  // ECG_PERFORMANCE — LK Electrocardiograph.pdf
  { capabilityCode: "ECG_PERFORMANCE", code: "AMPLITUDE_ACCURACY", name: "Pengukuran Amplitudo" },
  { capabilityCode: "ECG_PERFORMANCE", code: "RECORDING_SPEED", name: "Laju Rekaman" },
  {
    capabilityCode: "ECG_PERFORMANCE",
    code: "ECG_HEART_RATE_CALIBRATION",
    name: "Kalibrasi Detak Jantung",
  },
  {
    capabilityCode: "ECG_PERFORMANCE",
    code: "SINUSOIDAL_SIGNAL_TEST",
    name: "Uji Sinyal Sinusoida",
  },
  {
    capabilityCode: "ECG_PERFORMANCE",
    code: "NORMAL_ECG_SIGNAL_TEST",
    name: "Uji Sinyal EKG Normal",
  },

  // NIBP_LEAK_TEST — LK Sphygmomanometer.pdf
  { capabilityCode: "NIBP_LEAK_TEST", code: "CUFF_LEAK_TEST", name: "Uji Kebocoran" },
  { capabilityCode: "NIBP_LEAK_TEST", code: "RAPID_DEFLATION_RATE", name: "Laju Buang Cepat" },
  {
    capabilityCode: "NIBP_LEAK_TEST",
    code: "PRESSURE_READING_ACCURACY",
    name: "Pengukuran Akurasi Tekanan",
  },

  // VENTILATION_PERFORMANCE — LK Ventilator Transport.pdf
  { capabilityCode: "VENTILATION_PERFORMANCE", code: "TIDAL_VOLUME", name: "Pengukuran Tidal Volume" },
  { capabilityCode: "VENTILATION_PERFORMANCE", code: "MINUTE_VOLUME", name: "Pengukuran Minute Volume" },
  {
    capabilityCode: "VENTILATION_PERFORMANCE",
    code: "VENT_RESPIRATION_RATE",
    name: "Pengukuran Respiration Rate",
  },
  { capabilityCode: "VENTILATION_PERFORMANCE", code: "IE_RATIO", name: "Pengukuran I : E Ratio" },
  { capabilityCode: "VENTILATION_PERFORMANCE", code: "INSPIRATORY_TIME", name: "Inspiratory Time (Ti)" },
  { capabilityCode: "VENTILATION_PERFORMANCE", code: "EXPIRATORY_TIME", name: "Expiratory Time (Te)" },
  {
    capabilityCode: "VENTILATION_PERFORMANCE",
    code: "PEEP",
    name: "Pengukuran Positive End-Expiratory Pressure (PEEP)",
  },
  {
    capabilityCode: "VENTILATION_PERFORMANCE",
    code: "PEAK_INSPIRATORY_PRESSURE",
    name: "Peak Inspiratory Pressure (Ppeak)",
  },
  { capabilityCode: "VENTILATION_PERFORMANCE", code: "FIO2_ACCURACY", name: "Pengukuran FIO2" },

  // RESUSCITATOR_PRESSURE — LK Resusitator Paru dan Neopuff.pdf
  { capabilityCode: "RESUSCITATOR_PRESSURE", code: "MAX_PRESSURE", name: "Nilai Tekanan Maksimum" },
  { capabilityCode: "RESUSCITATOR_PRESSURE", code: "PRESSURE_ACCURACY", name: "Kalibrasi Akurasi Tekanan Resuscitator" },

  // TEMPERATURE_CHAMBER_STERILIZATION — LK Autoclave.pdf; LK Sterilisator.pdf; LK Oven.pdf
  {
    capabilityCode: "TEMPERATURE_CHAMBER_STERILIZATION",
    code: "CHAMBER_TEMPERATURE",
    name: "Suhu Chamber",
  },
  {
    capabilityCode: "TEMPERATURE_CHAMBER_STERILIZATION",
    code: "STERILIZATION_TEMPERATURE",
    name: "Suhu Sterilisasi",
  },
  {
    capabilityCode: "TEMPERATURE_CHAMBER_STERILIZATION",
    code: "STERILIZATION_TIME",
    name: "Waktu Sterilisasi",
  },

  // TEMPERATURE_COLD_STORAGE — LK Blood Bank Refrigerator.pdf; LK Medical Refrigerator.pdf; LK Medical Freezer.pdf; LK Cold Chain, Vaccine Refrigerator.pdf
  {
    capabilityCode: "TEMPERATURE_COLD_STORAGE",
    code: "STORAGE_TEMPERATURE_UNIFORMITY",
    name: "Keseragaman Suhu Penyimpanan (multi-titik T1–T9)",
  },

  // INCUBATOR_ENVIRONMENT — LK Baby Incubator.pdf
  {
    capabilityCode: "INCUBATOR_ENVIRONMENT",
    code: "AIR_TEMPERATURE_CALIBRATION",
    name: "Kalibrasi Pengontrol Suhu dan Keseragaman Suhu Inkubator",
  },
  {
    capabilityCode: "INCUBATOR_ENVIRONMENT",
    code: "OVERSHOOT_TEMPERATURE",
    name: "Overshoot Temperature",
  },
  {
    capabilityCode: "INCUBATOR_ENVIRONMENT",
    code: "TEMPERATURE_RECOVERY_TIME",
    name: "Waktu Pemulihan Lonjakan Suhu",
  },
  {
    capabilityCode: "INCUBATOR_ENVIRONMENT",
    code: "MATTRESS_TEMPERATURE",
    name: "Suhu Matras",
  },
  { capabilityCode: "INCUBATOR_ENVIRONMENT", code: "AIR_VELOCITY", name: "Kecepatan Udara Dalam Kompartemen" },
  { capabilityCode: "INCUBATOR_ENVIRONMENT", code: "NOISE_LEVEL", name: "Kebisingan Kompartemen" },
  {
    capabilityCode: "INCUBATOR_ENVIRONMENT",
    code: "SKIN_TEMPERATURE_SENSOR",
    name: "Kalibrasi Sensor Suhu Kulit",
  },

  // WARMER_SURFACE_TEMPERATURE — LK Infant Warmer.pdf
  {
    capabilityCode: "WARMER_SURFACE_TEMPERATURE",
    code: "MAX_MATTRESS_SURFACE_TEMPERATURE",
    name: "Kalibrasi Suhu Maksimum pada Permukaan Matras",
  },
  {
    capabilityCode: "WARMER_SURFACE_TEMPERATURE",
    code: "WARMER_TEMPERATURE_CALIBRATION",
    name: "Kalibrasi Suhu",
  },

  // HUMIDIFIER_TEMPERATURE — LK Humidifier.pdf
  {
    capabilityCode: "HUMIDIFIER_TEMPERATURE",
    code: "TEMPERATURE_ACCURACY",
    name: "Akurasi Suhu",
  },
  {
    capabilityCode: "HUMIDIFIER_TEMPERATURE",
    code: "MAXIMUM_TEMPERATURE",
    name: "Suhu Maksimum",
  },

  // VACUUM_SUCTION — LK Suction Pump.pdf
  {
    capabilityCode: "VACUUM_SUCTION",
    code: "VACUUM_GAUGE_ACCURACY",
    name: "Akurasi Vacuum Gauge",
  },
  { capabilityCode: "VACUUM_SUCTION", code: "MAXIMUM_VACUUM", name: "Maximum Vacuum" },
  { capabilityCode: "VACUUM_SUCTION", code: "TIME_TO_MAX_VACUUM", name: "Waktu Yang Dibutuhkan Saat Daya Hisap Maksimum" },

  // ROTATIONAL_SPEED — LK Centrifuge.pdf
  {
    capabilityCode: "ROTATIONAL_SPEED",
    code: "ROTATION_SPEED_ACCURACY",
    name: "Kalibrasi Kecepatan Putar",
  },
  {
    capabilityCode: "ROTATIONAL_SPEED",
    code: "ROTATION_TIME_ACCURACY",
    name: "Kalibrasi Waktu Putar",
  },

  // INFUSION_FLOW — LK Infusion Pump.pdf; LK Syringe Pump.pdf
  { capabilityCode: "INFUSION_FLOW", code: "OCCLUSION_TEST", name: "Pengujian Occlusion/Pemampatan" },
  { capabilityCode: "INFUSION_FLOW", code: "FLOW_RATE_CALIBRATION", name: "Kalibrasi Laju Aliran" },

  // OPTICAL_MAGNIFICATION — LK Mikroskop Laboratorium.pdf
  {
    capabilityCode: "OPTICAL_MAGNIFICATION",
    code: "MAGNIFICATION_4X",
    name: "Pembesaran Objektif 4x",
  },
  {
    capabilityCode: "OPTICAL_MAGNIFICATION",
    code: "MAGNIFICATION_10X",
    name: "Pembesaran Objektif 10x",
  },
  {
    capabilityCode: "OPTICAL_MAGNIFICATION",
    code: "MAGNIFICATION_RATIO",
    name: "Nilai Ratio Pembesaran",
  },

  // GAS_FLOW_RATE — LK Flow Meter.pdf; LK Nebulizer Compressor.pdf; LK Nebulizer Ultrasonic.pdf; LK Oksigen Concentrator.pdf
  { capabilityCode: "GAS_FLOW_RATE", code: "FLOW_RATE_ACCURACY", name: "Laju Aliran Gas" },

  // OXYGEN_CONCENTRATION — LK Oksigen Concentrator.pdf
  {
    capabilityCode: "OXYGEN_CONCENTRATION",
    code: "OXYGEN_CONCENTRATION_ACCURACY",
    name: "Konsentrasi Oksigen",
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
    name: "Linieritas dB Pure Tone",
  },
  {
    capabilityCode: "AUDIOMETRIC_PERFORMANCE",
    code: "FREQUENCY_RESPONSE",
    name: "Frekuensi Respon / Tanggap",
  },

  // CLEAN_AIR_CONTAINMENT — LK Bio Safety Cabinet.docx; LK Laminar Air Flow.docx
  {
    capabilityCode: "CLEAN_AIR_CONTAINMENT",
    code: "PARTICLE_COUNT",
    name: "Pengujian Particle Counter",
  },
  {
    capabilityCode: "CLEAN_AIR_CONTAINMENT",
    code: "DOWNFLOW_VELOCITY",
    name: "Pengujian Downflow",
  },
  {
    capabilityCode: "CLEAN_AIR_CONTAINMENT",
    code: "INFLOW_VELOCITY",
    name: "Pengujian Inflow Velocity",
  },
  {
    capabilityCode: "CLEAN_AIR_CONTAINMENT",
    code: "LIGHT_INTENSITY",
    name: "Pengukuran Nilai Intensitas Cahaya (Lighting)",
  },
  {
    capabilityCode: "CLEAN_AIR_CONTAINMENT",
    code: "SOUND_LEVEL",
    name: "Pengukuran Sound Level",
  },
  {
    capabilityCode: "CLEAN_AIR_CONTAINMENT",
    code: "UV_RADIATION",
    name: "Pengukuran Radiasi UV",
  },
  {
    capabilityCode: "CLEAN_AIR_CONTAINMENT",
    code: "HEPA_LEAK_TEST",
    name: "Pengukuran Kebocoran Hepa / Ulpa Filter",
  },

  // DENTAL_UNIT_PERFORMANCE — LK Dental Unit.docx
  {
    capabilityCode: "DENTAL_UNIT_PERFORMANCE",
    code: "HANDPIECE_SPEED_LOW",
    name: "Kecepatan Putar Handpiece (Low Speed)",
  },
  {
    capabilityCode: "DENTAL_UNIT_PERFORMANCE",
    code: "HANDPIECE_SPEED_HIGH",
    name: "Kecepatan Putar Handpiece (High Speed)",
  },
  {
    capabilityCode: "DENTAL_UNIT_PERFORMANCE",
    code: "HANDPIECE_PRESSURE",
    name: "Tekanan Handpiece",
  },
  {
    capabilityCode: "DENTAL_UNIT_PERFORMANCE",
    code: "LIGHT_ILLUMINANCE",
    name: "Illuminance",
  },
  {
    capabilityCode: "DENTAL_UNIT_PERFORMANCE",
    code: "AIR_SPRAY_PRESSURE",
    name: "Tekanan Semprot Udara",
  },
  {
    capabilityCode: "DENTAL_UNIT_PERFORMANCE",
    code: "SUCTION_PRESSURE",
    name: "Daya Hisap",
  },

  // XRAY_PERFORMANCE — LK Dental X-Ray.docx
  {
    capabilityCode: "XRAY_PERFORMANCE",
    code: "COLLIMATION_ACCURACY",
    name: "Uji Kolimasi",
  },
  { capabilityCode: "XRAY_PERFORMANCE", code: "KV_ACCURACY", name: "Akurasi Tegangan Tinggi (kV)" },
  {
    capabilityCode: "XRAY_PERFORMANCE",
    code: "EXPOSURE_TIME_ACCURACY",
    name: "Akurasi Waktu Penyinaran",
  },
  { capabilityCode: "XRAY_PERFORMANCE", code: "DOSE_LINEARITY", name: "Linearitas Pengukuran" },
  {
    capabilityCode: "XRAY_PERFORMANCE",
    code: "OUTPUT_REPRODUCIBILITY",
    name: "Reproduksibilitas Keluaran Sinar-X",
  },
  {
    capabilityCode: "XRAY_PERFORMANCE",
    code: "HALF_VALUE_LAYER",
    name: "Pengujian Half Value Layer (HVL)",
  },

  // ELECTROTHERAPY_STIMULATION — LK Electro Accupunture (EST).docx
  {
    capabilityCode: "ELECTROTHERAPY_STIMULATION",
    code: "STIMULATION_FREQUENCY",
    name: "Frekuensi",
  },
  {
    capabilityCode: "ELECTROTHERAPY_STIMULATION",
    code: "STIMULATION_INTENSITY",
    name: "Intensitas Terapi",
  },
  {
    capabilityCode: "ELECTROTHERAPY_STIMULATION",
    code: "PULSE_DURATION",
    name: "Pulse Duration",
  },
  {
    capabilityCode: "ELECTROTHERAPY_STIMULATION",
    code: "TREATMENT_TIMER",
    name: "Waktu",
  },

  // LIGHT_SOURCE_PERFORMANCE — light-source family
  {
    capabilityCode: "LIGHT_SOURCE_PERFORMANCE",
    code: "LIGHT_INTENSITY",
    name: "Intensitas Cahaya",
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
    name: "Kalibrasi Detak Jantung Bayi",
  },

  // SPECTRAL_IRRADIANCE — LK Phototherapy.docx
  {
    capabilityCode: "SPECTRAL_IRRADIANCE",
    code: "SPECTRAL_IRRADIANCE_ACCURACY",
    name: "Pengujian Keluaran Spectral Irradiance",
  },

  // SPIROMETRY_VOLUME_ACCURACY — LK Spirometer.docx
  {
    capabilityCode: "SPIROMETRY_VOLUME_ACCURACY",
    code: "FVC_VOLUME_ACCURACY",
    name: "Pengukuran Akurasi Total Volume Forced Vital Capacity (FVC)",
  },

  // WARMER_SURFACE_TEMPERATURE — extra item for Blanket Warmer (LK Blanket Warmer.docx)
  {
    capabilityCode: "WARMER_SURFACE_TEMPERATURE",
    code: "HIGH_TEMP_PROTECTION",
    name: "Pengujian Proteksi Suhu Tinggi",
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
