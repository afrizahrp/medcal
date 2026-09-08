/**
 * DRAFT SEED — CalibrationTestPoint rows extracted from the real LK worksheets.
 * (Stage 1 proposal — 2026-09-08. NOT YET RUN. HARD STOP for review before Stage 2.)
 *
 * Source corpus: docs/technician-docs/Lembar-Kerja/*.docx (50 worksheets, one per
 * device type). Each block below cites the worksheet + section it was read from.
 * Live catalog dumped 2026-09-08 (489 DeviceCalibrationParameter rows).
 *
 * Scope — only parameters that carry a fixed on-worksheet setpoint sweep or a fixed
 * set of named / ordinal measurement slots:
 *   - Pattern B  : numeric setpoint sweep, ONE shared tolerance -> test points carry
 *                  settingValue, tolerance override left NULL (inherits parent).
 *   - Pattern D  (fixed-slot)   : named non-numeric slots ("Min"/"Med"/"Max",
 *                  "Rendah"/"Sedang"/"Tinggi") -> settingValue NULL, inherit tolerance.
 *   - Pattern D  (generic-slot) : ordinal slots whose mmHg the technician picks
 *                  on-site (SUCT_VACUUM_GAUGE) -> settingValue NULL, label "Titik ukur N".
 *   - Override cases (SUCT_MAX_VACUUM, INCU_AIR_TEMP) -> per-point toleranceMin/Max SET.
 *   - Ventilator (2026-09-08): filled Excel, I–III; VENT_* catalog rows already existed.
 *
 * Pattern A, the 8 already-split Pattern C rows, the Pattern D logger-summary
 * storage-temperature rows (now `DeviceCalibrationParameter.entryStyle =
 * LOGGER_SUMMARY`), BOOLEAN / RATIO rows, and every environment /
 * electrical-safety row get NO test points — see the extraction report for the
 * explicit "checked, excluded" list.
 *
 * Idempotent: for each parameter, existing test points (matched on
 * (deviceCalibrationParameterId, sequence)) are left untouched; only missing
 * sequences are inserted. Re-running after a successful run is a no-op.
 *
 * Run (Stage 2, AFTER review):
 *   pnpm --filter @medcal/db generate
 *   pnpm --filter @medcal/db exec tsx --env-file ../../.env prisma/seed-calibration-test-points.ts
 */
import { prisma } from "../src/index";

type Num = number | null;

interface TP {
  /** worksheet order, 1-based */
  sequence: number;
  settingLabel: string;
  settingValue: Num;
  /** per-point override; null => inherit parent parameter bounds */
  toleranceMin?: Num;
  toleranceMax?: Num;
  toleranceNote?: string | null;
}

interface ParamSeed {
  /** DeviceCalibrationParameter.code (unique in practice within this catalog) */
  code: string;
  /** for the human reading the seed / report */
  device: string;
  pattern: "B" | "D-fixed" | "D-generic" | "override";
  /** worksheet file + section the setpoints were read from */
  source: string;
  notes?: string;
  testPoints: TP[];
}

/** Build N numeric Pattern-B points from a list of setpoints + a unit label. */
function sweep(values: number[], unit: string): TP[] {
  return values.map((v, i) => ({
    sequence: i + 1,
    settingLabel: `${String(v).replace(".", ",")} ${unit}`.trim(),
    settingValue: v,
  }));
}

/** Named non-numeric slots (settingValue NULL, inherit tolerance). */
function namedSlots(labels: string[]): TP[] {
  return labels.map((l, i) => ({ sequence: i + 1, settingLabel: l, settingValue: null }));
}

const SEEDS: ParamSeed[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // AUDIOMETER — LK Audiometer.docx §"Hasil Pengukuran Kinerja Alat"
  // The worksheet prints each sweep twice: "Earphone Kanan" and "Earphone Kiri".
  // Resolved 2026-09-08: AUD_PURE_TONE_LINEARITY / AUD_FREQUENCY_RESPONSE were split
  // into _KANAN / _KIRI DeviceCalibrationParameter rows
  // (fix-collapsed-audiometer-parameters.ts), so the ear lives at the parameter
  // level and each series carries its own undoubled setpoint list.
  {
    code: "AUD_PURE_TONE_LINEARITY_KANAN",
    device: "Audiometer",
    pattern: "B",
    source: 'LK Audiometer.docx — "Linieritas dB Pure Tone" / Earphone Kanan (1000 Hz, ± 1 dB, I–III)',
    testPoints: sweep([80, 70, 60, 50, 40, 30, 20], "dB"),
  },
  {
    code: "AUD_PURE_TONE_LINEARITY_KIRI",
    device: "Audiometer",
    pattern: "B",
    source: 'LK Audiometer.docx — "Linieritas dB Pure Tone" / Earphone Kiri (1000 Hz, ± 1 dB, I–III)',
    testPoints: sweep([80, 70, 60, 50, 40, 30, 20], "dB"),
  },
  {
    code: "AUD_FREQUENCY_RESPONSE_KANAN",
    device: "Audiometer",
    pattern: "B",
    source: 'LK Audiometer.docx — "Frekuensi Respon / Tanggap" / Earphone Kanan (80/90 dB, ± 2%, I–III)',
    notes:
      "2026-09-08 measurement-results/Audiometer.xlsx contains Pure Tone Linearity (I–III) only — this frequency-response sweep was NOT present in the filled file. Values kept from the blank LK template; unverified against field data.",
    testPoints: sweep([250, 500, 6000, 8000], "Hz"),
  },
  {
    code: "AUD_FREQUENCY_RESPONSE_KIRI",
    device: "Audiometer",
    pattern: "B",
    source: 'LK Audiometer.docx — "Frekuensi Respon / Tanggap" / Earphone Kiri (80/90 dB, ± 2%, I–III)',
    notes:
      "2026-09-08 measurement-results/Audiometer.xlsx contains Pure Tone Linearity (I–III) only — this frequency-response sweep was NOT present in the filled file. Values kept from the blank LK template; unverified against field data.",
    testPoints: sweep([250, 500, 6000, 8000], "Hz"),
  },

  // ─────────────────────────────────────────────────────────────────────────
  // BED SIDE MONITOR — LK Bed Side Monitor.docx §"Hasil Pengukuran Kinerja Alat"
  {
    code: "BSM_HEART_RATE",
    device: "Bed Side Monitor",
    pattern: "B",
    source: 'LK Bed Side Monitor.docx — "Kalibrasi Heart Rate" (Setting Simulator BPM, ± 5 bpm, I–V)',
    testPoints: sweep([30, 60, 120, 180], "BPM"),
  },
  {
    code: "BSM_RESP_RATE",
    device: "Bed Side Monitor",
    pattern: "B",
    source: 'LK Bed Side Monitor.docx — "Kalibrasi Respirasi" (Setting Simulator BrPM, ± 3 BrPM, I–V)',
    testPoints: sweep([15, 30, 60, 120], "BrPM"),
  },
  {
    code: "BSM_SPO2",
    device: "Bed Side Monitor",
    pattern: "B",
    source: 'LK Bed Side Monitor.docx — "Kalibrasi Saturasi Oxygen (SPO2)" (± 3 % SPO2, I–V)',
    notes:
      "2026-09-08 measurement-results/Bed Side Monitor.xlsx records 8 rows and 90 appears TWICE (same shape as PULSEOX_SPO2). Trailing 90 added; labels disambiguated by titik number.",
    testPoints: [98, 93, 92, 85, 90, 70, 88, 90].map((v, i) => ({
      sequence: i + 1,
      settingLabel: v === 90 ? `90 %SpO2 (titik ${i + 1})` : `${v} %SpO2`,
      settingValue: v,
    })),
  },
  {
    code: "BSM_SYSTOLIC",
    device: "Bed Side Monitor",
    pattern: "B",
    source: 'LK Bed Side Monitor.docx — "Kalibrasi NIBP" Systole column (7 triples, ± 5 mmHg)',
    notes:
      "NIBP measured at HR 65 BPM, except the 250/195 triple at HR 90 BPM (worksheet note). Worksheet order kept.",
    testPoints: sweep([120, 150, 200, 250, 60, 80, 100], "mmHg"),
  },
  {
    code: "BSM_MAP",
    device: "Bed Side Monitor",
    pattern: "B",
    source: 'LK Bed Side Monitor.docx — "Kalibrasi NIBP" Mean column (7 triples, ± 5 mmHg)',
    testPoints: sweep([93, 116, 166, 215, 40, 60, 76], "mmHg"),
  },
  {
    code: "BSM_DIASTOLIC",
    device: "Bed Side Monitor",
    pattern: "B",
    source: 'LK Bed Side Monitor.docx — "Kalibrasi NIBP" Diastole column (7 triples, ± 5 mmHg)',
    testPoints: sweep([80, 100, 150, 195, 30, 50, 65], "mmHg"),
  },

  // ─────────────────────────────────────────────────────────────────────────
  // BLOOD PRESSURE MONITOR — LK Blood Pressure Monitor.docx §"Kalibrasi NIBP"
  // 6 triples; setting standar 60–80 bpm. Fewer + lower setpoints than BSM (no 250).
  {
    code: "BPM_SYSTOLIC",
    device: "Blood Pressure Monitor",
    pattern: "B",
    source: 'LK Blood Pressure Monitor.docx — "Kalibrasi NIBP" Systole column (6 triples, ± 5 mmHg)',
    testPoints: sweep([60, 80, 100, 120, 150, 200], "mmHg"),
  },
  {
    code: "BPM_MAP",
    device: "Blood Pressure Monitor",
    pattern: "B",
    source: 'LK Blood Pressure Monitor.docx — "Kalibrasi NIBP" Mean column (6 triples, ± 5 mmHg)',
    testPoints: sweep([40, 60, 76, 93, 116, 166], "mmHg"),
  },
  {
    code: "BPM_DIASTOLIC",
    device: "Blood Pressure Monitor",
    pattern: "B",
    source: 'LK Blood Pressure Monitor.docx — "Kalibrasi NIBP" Diastole column (6 triples, ± 5 mmHg)',
    testPoints: sweep([30, 50, 65, 80, 100, 150], "mmHg"),
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PULSE OXIMETER — LK Pulse Oxymeter.docx
  {
    code: "PULSEOX_HEART_RATE",
    device: "Pulse Oximeter",
    pattern: "B",
    source: 'LK Pulse Oxymeter.docx — "Kalibrasi Heart Rate" (Setting Simulator BPM, ± 5 bpm, I–VI)',
    testPoints: sweep([30, 60, 120, 180], "BPM"),
  },
  {
    code: "PULSEOX_SPO2",
    device: "Pulse Oximeter",
    pattern: "B",
    source: 'LK Pulse Oxymeter.docx — "Kalibrasi Saturasi Oxygen (SPO2)" (± 4 % SPO2, I–VI)',
    notes:
      "Worksheet lists 8 rows and the value 90 appears TWICE (rows 5 and 8). Labels disambiguated by titik number to satisfy the (parameter, settingLabel) unique constraint.",
    testPoints: [98, 93, 92, 85, 90, 70, 88, 90].map((v, i) => ({
      sequence: i + 1,
      settingLabel: v === 90 ? `90 %SpO2 (titik ${i + 1})` : `${v} %SpO2`,
      settingValue: v,
    })),
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    code: "FDOP_HR_ACCURACY",
    device: "Fetal Doppler",
    pattern: "B",
    source: 'LK Fetal Doppler.docx — "Kalibrasi Detak Jantung Bayi" (Setting standar, ± 5 bpm, I–V)',
    testPoints: sweep([30, 60, 90, 120, 150, 180, 210], "BPM"),
  },
  {
    code: "FM_FLOW_RATE",
    device: "Flow Meter",
    pattern: "B",
    source: 'LK Flow Meter.docx — "Flow / Laju aliran" (Setting UUT L/min, ± 20 %, I–V)',
    testPoints: sweep([3, 5, 7, 9, 11, 13, 15], "L/min"),
  },
  {
    code: "BLNW_TEMP_CALIBRATION",
    device: "Blanket Warmer",
    pattern: "B",
    source: 'LK Blanket Warmer.docx — "Kalibrasi suhu" (Setting UUT °C, ± 3 °C, I–V)',
    testPoints: sweep([33, 35, 40], "°C"),
  },
  {
    code: "HUM_TEMP_ACCURACY",
    device: "Humidifier",
    pattern: "B",
    source: 'LK Humidifier.docx — "Akurasi Suhu" (Setting °c, ± 1 °c, I–V)',
    notes: "Borderline 2-point sweep — kept for consistency with SPIRO_FVC / CPAP_CONCENTRATION.",
    testPoints: sweep([35, 37], "°C"),
  },
  {
    code: "CPAP_CONCENTRATION",
    device: "CPAP",
    pattern: "B",
    source:
      'LK CPAP.docx — "Pengukuran Konsentrasi Oksigen" (Setting UUT %, ± 3%, I–V; flowmeter 5 L/min)',
    testPoints: sweep([21, 60], "%"),
  },
  {
    code: "CPAP_FLOW_RATE",
    device: "CPAP",
    pattern: "B",
    source: 'LK CPAP.docx — "Pengukuran Laju Aliran" (Setting UUT L/min, ± 20%, I–V)',
    testPoints: sweep([3, 5, 10, 13, 15], "L/min"),
  },
  {
    code: "EST_FREQUENCY",
    device: "Electro Accupunture (EST)",
    pattern: "B",
    source: 'LK Electro Accupunture (EST).docx — "Frekuensi" (Setting Hz, ± 10%, I–V; I 20 mA, PD 0,2 ms)',
    testPoints: sweep([80, 120, 200], "Hz"),
  },
  {
    code: "EST_INTENSITY",
    device: "Electro Accupunture (EST)",
    pattern: "B",
    source: 'LK Electro Accupunture (EST).docx — "Intensitas Terapi" (Setting mA, ± 20%, I–V; 80 Hz, PD 0,2 ms)',
    testPoints: sweep([10, 20, 30, 40], "mA"),
  },
  {
    code: "EST_PULSE_DURATION",
    device: "Electro Accupunture (EST)",
    pattern: "B",
    source: 'LK Electro Accupunture (EST).docx — "Pulse Duration" (Setting ms, ± 10%, I–V; 80 Hz, 20 mA)',
    testPoints: sweep([0.1, 0.2, 0.3], "ms"),
  },
  {
    code: "ECG_AMPLITUDE",
    device: "Electrocardiograph",
    pattern: "B",
    source:
      'LK Electrocardiograph.docx — "Pengukuran Amplitudo" (Setting gain mm/mV, ± 5 %, I–V; 2 Hz 1,0 mV, 25 mm/s)',
    testPoints: sweep([5, 10, 20], "mm/mV"),
  },
  {
    code: "ECG_REC_SPEED",
    device: "Electrocardiograph",
    pattern: "B",
    source: 'LK Electrocardiograph.docx — "Laju Rekaman" (Setting UUT mm/s, ± 5 %, I–V; 2 mV 120 bpm)',
    testPoints: sweep([25, 50], "mm/s"),
  },
  {
    code: "ECG_HR_CAL",
    device: "Electrocardiograph",
    pattern: "B",
    source: 'LK Electrocardiograph.docx — "Kalibrasi Detak Jantung" (Simulator 2 mV, ± 5 bpm, I–V)',
    testPoints: sweep([60, 90, 120], "bpm"),
  },
  {
    code: "INFUS_FLOW_RATE",
    device: "Infusion Pump",
    pattern: "B",
    source: 'LK Infusion Pump.docx — "Kalibrasi Laju aliran" (Setting UUT ml/jam, ± 10%, I–V)',
    testPoints: sweep([10, 50, 100, 150, 300], "ml/jam"),
  },
  {
    code: "SYR_FLOW_RATE",
    device: "Syringe Pump",
    pattern: "B",
    source: 'LK Syringe Pump.docx — "Kalibrasi Laju aliran" (Setting UUT ml/jam, ± 10%, I–V)',
    testPoints: sweep([10, 25, 50, 75, 100], "ml/jam"),
  },
  {
    code: "O2CON_FLOW_RATE",
    device: "Oxygen Concentrator",
    pattern: "B",
    source: 'LK Oksigen Concentrator.docx — "Laju aliran gas flowmeter" (Setting UUT lpm, ± 20%, I–V)',
    testPoints: sweep([2, 3, 5, 7, 9], "lpm"),
  },
  {
    code: "RESUS_P_PRESSURE_ACC",
    device: "Resuscitator (Pulmonary)",
    pattern: "B",
    source:
      'LK Resusitator Paru dan Neopuff.docx — "Kalibrasi akurasi tekanan resuscitator" (Setting UUT cmH2O, ± 20%, I–V)',
    notes:
      "RESUS_C_PRESSURE_ACC (Resuscitator Cardiac) has the SAME catalog shape but NO dedicated worksheet in the corpus — left unseeded, flagged in the report.",
    testPoints: sweep([10, 20, 30, 40, 65], "cmH2O"),
  },
  {
    code: "SPIRO_FVC",
    device: "Spirometer",
    pattern: "B",
    source: 'LK Spirometer.docx — "Akurasi Total Volume FVC" (Setting Standar liter, ± 3%, I–V)',
    testPoints: sweep([0.5, 3], "liter"),
  },
  {
    code: "SPHYG_PRESSURE_ACC",
    device: "Sphygmomanometer",
    pattern: "B",
    source:
      'LK Sphygmomanometer.docx — "Pengukuran akurasi tekanan" (Setting pada UUT mmHg, ± 4 mmHg / U95 ≤ MPE)',
    notes:
      "Each setpoint is read naik & turun -> two MeasurementResult rows per point (direction UP/DOWN). Test points encode the setpoint only.",
    testPoints: sweep([0, 50, 100, 150, 200, 250], "mmHg"),
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Pattern D — fixed named slots (settingValue NULL, inherit tolerance)
  {
    code: "CENT_SPEED",
    device: "Centrifuge",
    pattern: "D-fixed",
    source: 'LK Centrifuge.docx — "Kalibrasi Kecepatan Putar" (Setting UUT rpm: Min/Med/Max, ± 10%, I–V)',
    testPoints: namedSlots(["Min", "Med", "Max"]),
  },
  {
    code: "CRFR_SPEED",
    device: "Centrifuge Refrigerator",
    pattern: "D-fixed",
    source:
      'LK Centrifuge Refrigerator.docx — "Kalibrasi Kecepatan Putar" (Setting UUT rpm: Min/Med/Max, ± 10%, I–V)',
    testPoints: namedSlots(["Min", "Med", "Max"]),
  },
  {
    code: "ROT_SPEED",
    device: "Rotator",
    pattern: "D-fixed",
    source: 'LK Rotator.docx — "Kalibrasi Kecepatan Putar" (Setting UUT rpm: Min/Med/Max, ± 10%, I–V)',
    testPoints: namedSlots(["Min", "Med", "Max"]),
  },
  {
    code: "DXRAY_EXPOSURE_TIME",
    device: "Dental X-Ray",
    pattern: "D-fixed",
    source:
      'LK Dental X-Ray.docx — "Akurasi Waktu Penyinaran" (Setting UUT: Rendah/Sedang/Tinggi, kV 70 mA 10, ± 10 %)',
    notes: "The actual seconds value per slot is picked from the UUT on-site (recorded on the reading).",
    testPoints: namedSlots(["Rendah", "Sedang", "Tinggi"]),
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Pattern D — generic ordinal slots (settingValue NULL, technician picks mmHg)
  {
    code: "SUCT_VACUUM_GAUGE",
    device: "Suction Pump",
    pattern: "D-generic",
    source:
      'LK Suction Pump.docx — "Akurasi Vacuum Gauge" (rows 1–6, "isi setting sesuai UUT"; Pengukuran 1/2/3 × Naik/Turun; ± 10%)',
    notes:
      "6 protocol slots. settingValue NULL — the mmHg is chosen per unit and stored on MeasurementResult.appliedNominalValue. 3 replicates × 2 directions per slot.",
    testPoints: Array.from({ length: 6 }, (_, i) => ({
      sequence: i + 1,
      settingLabel: `Titik ukur ${i + 1} (dipilih teknisi)`,
      settingValue: null,
    })),
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Override cases — per-point toleranceMin/Max SET (do NOT inherit parent)
  {
    code: "SUCT_MAX_VACUUM",
    device: "Suction Pump",
    pattern: "override",
    source: 'LK Suction Pump.docx — "Maximum Vacuum" (Low / Medium / High, "isi salah satu sesuai UUT")',
    notes:
      "Rated-class selection — exactly one class applies per unit. Bands encoded as per-point overrides. settingValue NULL (a class, not a setpoint).",
    testPoints: [
      { sequence: 1, settingLabel: "Low Vacuum", settingValue: null, toleranceMin: null, toleranceMax: 150, toleranceNote: "< 150 mmHg" },
      { sequence: 2, settingLabel: "Medium Vacuum", settingValue: null, toleranceMin: 150, toleranceMax: 450, toleranceNote: "150 mmHg – 450 mmHg" },
      { sequence: 3, settingLabel: "High Vacuum", settingValue: null, toleranceMin: 450, toleranceMax: null, toleranceNote: "> 450 mmHg" },
    ],
  },
  {
    code: "INCU_AIR_TEMP",
    device: "Baby Incubator",
    pattern: "override",
    source:
      'LK Baby Incubator.docx — "Kalibrasi Pengontrol Suhu dan Keseragaman Suhu Inkubator" (sensors TM/T5, T1–T4 × settings 32 & 36 °C, trials I–V)',
    notes:
      "Two tolerance classes: TM/T5 vs the setting = ± 1.5 °C; T1–T4 vs the running mean of TM = ± 0.8 °C. 5 sensors × 2 settings = 10 points. FLAGGED — a reviewer may prefer 5 points (sensor only) with the 32/36 setting handled as a separate entry-UI sweep.",
    testPoints: [
      ...(["TM/T5", "T1", "T2", "T3", "T4"] as const).flatMap((sensor, si) =>
        [32, 36].map((setpoint, pi) => {
          const isMean = sensor === "TM/T5";
          return {
            sequence: si * 2 + pi + 1,
            settingLabel: `${sensor} — Setting ${setpoint} °C`,
            settingValue: setpoint,
            toleranceMin: isMean ? -1.5 : -0.8,
            toleranceMax: isMean ? 1.5 : 0.8,
            toleranceNote: isMean
              ? "± 1.5 °C terhadap setting"
              : "± 0.8 °C terhadap rata-rata TM (T5)",
          };
        }),
      ),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // VENTILATOR — measurement-results/ventilator infant.xlsx + ventilator transport.xlsx
  // Blank LK was a PDF (deferred). Filled Excel uses I–III (not I–V). Peak
  // inspiratory/expiratory FLOW tables exist in Excel but have no catalog
  // parameter yet — not seeded here.
  {
    code: "VENT_TIDAL_VOLUME",
    device: "Ventilator",
    pattern: "B",
    source: 'measurement-results/ventilator infant.xlsx — "Pengukuran tidal volume" (I–III, ± 10%)',
    notes:
      "Worksheet rows mix VT with RR / I:E conditions (500 ml @ RR 10; 800 ml @ I:E 1:2; 300 ml @ RR 20). Seed stores the VT column only.",
    testPoints: sweep([500, 800, 300], "ml"),
  },
  {
    code: "VENT_MINUTE_VOLUME",
    device: "Ventilator",
    pattern: "B",
    source: 'measurement-results/ventilator infant.xlsx — "Pengukuran minute volume" (I–III, ± 10%)',
    testPoints: sweep([6, 7, 7.8], "liter"),
  },
  {
    code: "VENT_RESP_RATE",
    device: "Ventilator",
    pattern: "B",
    source: 'measurement-results/ventilator infant.xlsx — "Pengukuran respiration rate" (I–III, ± 2 bpm)',
    testPoints: sweep([10, 15, 20], "bpm"),
  },
  {
    code: "VENT_INSP_TIME",
    device: "Ventilator",
    pattern: "B",
    source: 'measurement-results/ventilator infant.xlsx — "Inspiratory time (Ti)" (I–III, ± 10%)',
    testPoints: sweep([1, 2, 3], "sec"),
  },
  {
    code: "VENT_EXP_TIME",
    device: "Ventilator",
    pattern: "B",
    source: 'measurement-results/ventilator infant.xlsx — "Expiratory time (Te)" (I–III, ± 10%)',
    testPoints: sweep([1, 2, 3], "sec"),
  },
  {
    code: "VENT_PEEP",
    device: "Ventilator",
    pattern: "B",
    source: 'measurement-results/ventilator infant.xlsx — "PEEP" (I–III, ± 10%)',
    notes: "This filled file only records one setpoint (20 cmH2O).",
    testPoints: sweep([20], "cmH2O"),
  },
  {
    code: "VENT_PPEAK",
    device: "Ventilator",
    pattern: "B",
    source: 'measurement-results/ventilator infant.xlsx — "Peak inspiratory pressure" (I–III, ± 10%)',
    notes: "This filled file only records one setpoint (40 cmH2O).",
    testPoints: sweep([40], "cmH2O"),
  },
  {
    code: "VENT_FIO2",
    device: "Ventilator",
    pattern: "B",
    source: 'measurement-results/ventilator infant.xlsx — "Pengukuran FIO2" (I–III, ± 10%)',
    testPoints: sweep([21, 50, 75, 99], "%"),
  },
];

async function main() {
  const expectedParams = SEEDS.length;
  const expectedPoints = SEEDS.reduce((n, s) => n + s.testPoints.length, 0);
  console.log(
    `[seed-test-points] plan: ${expectedParams} parameters, ${expectedPoints} CalibrationTestPoint rows`,
  );

  let paramsTouched = 0;
  let inserted = 0;
  const missing: string[] = [];

  for (const seed of SEEDS) {
    const param = await prisma.deviceCalibrationParameter.findFirst({
      where: { code: seed.code },
      select: { id: true, code: true, toleranceNote: true },
    });
    if (!param) {
      missing.push(seed.code);
      console.warn(`[seed-test-points] SKIP ${seed.code} — not found in catalog`);
      continue;
    }

    const existing = await prisma.calibrationTestPoint.findMany({
      where: { deviceCalibrationParameterId: param.id },
      select: { sequence: true },
    });
    const have = new Set(existing.map((e) => e.sequence));

    const toCreate = seed.testPoints.filter((tp) => !have.has(tp.sequence));
    if (toCreate.length === 0) {
      console.log(`[seed-test-points] ${seed.code}: all ${seed.testPoints.length} points already present`);
      continue;
    }

    await prisma.calibrationTestPoint.createMany({
      data: toCreate.map((tp) => ({
        deviceCalibrationParameterId: param.id,
        sequence: tp.sequence,
        settingLabel: tp.settingLabel,
        settingValue: tp.settingValue,
        toleranceMin: tp.toleranceMin ?? null,
        toleranceMax: tp.toleranceMax ?? null,
        toleranceNote: tp.toleranceNote ?? null,
      })),
    });
    inserted += toCreate.length;
    paramsTouched += 1;
    console.log(
      `[seed-test-points] ${seed.code} (${seed.pattern}): +${toCreate.length} points  [${seed.source}]`,
    );
  }

  console.log(
    `[seed-test-points] done: ${paramsTouched} parameters touched, ${inserted} rows inserted` +
      (missing.length ? `, ${missing.length} codes missing: ${missing.join(", ")}` : ""),
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
