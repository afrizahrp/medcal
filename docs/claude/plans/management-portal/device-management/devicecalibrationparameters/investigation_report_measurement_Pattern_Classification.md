# Investigation: Performance-Measurement Pattern Classification (Pattern A/B/C/D+)

**Date:** 2026-08-27
**Mode:** Read-only analysis. No schema, seed, migration, or data changes were made.
**Scope:** All 50 `.docx` LK worksheets in `docs/technician-docs/` (the two `.pdf` duplicates —
Bed Side Monitor, Cold Chain — were ignored as redundant).
**Source of current data:** `packages/db/prisma/seed-device-calibration-parameters.ts` (242 original
rows) + `packages/db/prisma/backfill-device-calibration-parameter-tolerances.ts` (tolerance values
for those 242) + `packages/db/prisma/seed-device-taxonomy-extension-parameters.ts` (239 extension
rows). Total catalog = **481 rows** (matches the expected count). The live DB was not queried; the
seed/backfill scripts are the deterministic source of what the 481 rows contain.

This task extends the still-open "G2" question from `investigation-lk-vs-measurement-schema.md`
(structured measurement model design). It does **not** design `MeasurementEntry` /
`CalibrationTestPoint` — it only classifies evidence.

---

## Summary

**~119 conceptual performance-measurement items** were classified across the 50 documents
(counting one multi-setting-point sweep as a single item, and one analyzer analyte-list as a single
item). If the two analyzer analyte lists are expanded to one item per analyte, the total is ~153.

| Pattern | Conceptual items | Share | One-line shape |
|---|---:|---:|---|
| **A** – single target, replicates only | ~60 | ~50% | one fixed tolerance/range, trials I–V, no setting-point column |
| **B** – multiple setting points, ONE shared tolerance | ~33 | ~28% | a setting sweep, one `±X` cell spanning all rows |
| **C** – multiple named variants, EACH its own distinct tolerance | ~11 | ~9% | Low/High, ON/OFF, kV70/kV80, per-analyte — unrelated tolerance ranges |
| **D+** – other structures | ~15 | ~13% | multi-point spatial/temporal uniformity, derived ΔT, paired ref-vs-UUT, paired up/down ramp, qualitative pass/fail |

**Headline finding (Pattern C data-correctness check):**

- The **Dental Unit Handpiece Low/High Speed** case — the specific thing this task was asked to
  verify first — **is correctly split** in the current seed: `DUNIT_HP_SPEED_LOW`
  (`range(5000, 11000)`) and `DUNIT_HP_SPEED_HIGH` (`minOnly(250000)`) are two separate rows with
  their own bounds. No bug there.
- **Dental X-Ray Collimation Length/Diameter** is also correctly split
  (`DXRAY_COLLIMATION_LENGTH` / `DXRAY_COLLIMATION_DIAMETER`).
- **7 other Pattern C items are incorrectly collapsed** into a single `DeviceCalibrationParameter`
  row whose `toleranceMin`/`toleranceMax` are both `null` and whose `toleranceNote` is a
  free-text string carrying two-or-three different tolerance ranges that the schema cannot
  represent structurally. These are listed in **Data-Correctness Issues Found** below. None of them
  are in the original 27 device types — all are in the recently-seeded 24-type extension
  (Autoclave, Bio Safety Cabinet, Laminar Air Flow, Dental X-Ray).
- Two more Pattern C cases (**Auto Chemistry Analyzer**, **Hematologi Analyzer** analyte lists) are
  not seeded at all (those device types are explicitly excluded from the extension seed), so they
  are a design input only, not a current bug.

---

## Pattern A – Single Target, Replicates Only

One fixed limit/range, tested with repeated trials (I–V, or spatial points 1–4 / A–C that share
one limit). No setting-point sweep.

| Device type | Parameter (as written in LK) | Evidence | Seeded as |
|---|---|---|---|
| Baby Incubator | Overshot Temperature | `32 ke 36oC → ≤ 2ºC` | `INCU_OVERSHOOT_TEMP` maxOnly(2) |
| Baby Incubator | Suhu Matras | `36 oC → ≤ 40 oC` | `INCU_MATTRESS_TEMP` maxOnly(40) |
| Baby Incubator | Kecepatan Udara Dalam Kompartemen | `≤ 0.35 m/s` | `INCU_AIR_VELOCITY` maxOnly(0.35) |
| Baby Incubator | Kebisingan Kompartemen | `≤ 60 dBA` | `INCU_NOISE_LEVEL` maxOnly(60) |
| Baby Incubator | Kelembaban | `suhu 36 oC, kelembaban : … 10%*` | (not individually seeded) |
| Baby Incubator | Akurasi Temp Kulit Bayi Terhadap Temp Kontrol | `36 oC → ≤ 0.7 ºC` | **not seeded** (only the `≤ 0,3 ºC` sensor-accuracy row exists — coverage gap, not a pattern issue) |
| Baby Incubator | Akurasi sensor temperature kulit | `36 oC → ≤ 0,3 ºC` | `INCU_SKIN_TEMP_SENSOR` maxOnly(0.3) |
| Bio Safety Cabinet | Particle Count (0,5 micron), posisi 1–4 | `0,5 ≤ 100 particle` | `BSC_PARTICLE_COUNT` maxOnly(100) |
| Bio Safety Cabinet | Down Flow Velocity, posisi A/B/C, trials I–IX | `0,25 - 0,5 m/s … Min : 0,25 Max : 0,5` | `BSC_DOWNFLOW` range(0.25, 0.5) |
| Bio Safety Cabinet | Inflow Velocity, posisi A/B | `≥ 0,40 m/s … Min : 0,4 Max : 1` | `BSC_INFLOW` noteOnly |
| Bio Safety Cabinet | UV Radiation | `≥ 40 µw/cm²` | `BSC_UV_RADIATION` minOnly(40) |
| Blanket Warmer | Setting suhu tertinggi UUT, trials I–III | `< 53°C ± 3℃` | `BLNW_HIGH_TEMP` noteOnly |
| Dental Unit | Tekanan Handpiece, trials I–V | `3,0 bar – 4,0 bar` | `DUNIT_HP_PRESSURE` range(3, 4) |
| Dental Unit | Illuminance (Jarak 70 cm), trials I–V | `>15.000 lux` | `DUNIT_ILLUMINANCE` minOnly(15000) |
| Dental Unit | Tekanan Semprot Udara, trials I–V | `250 mmHg ~ 500 mmHg` | `DUNIT_AIR_SPRAY` range(250, 500) |
| Dental Unit | Daya Hisap, trials I–V | `-150 mmHg ~ -450 mmHg` | `DUNIT_SUCTION` range(-450, -150) |
| Dental X-Ray | kV Accuracy | `Setting 70 → ± 6 %` (single point; trial table I–III has no setting sweep) | `DXRAY_KV_ACCURACY` noteOnly(± 6 %) |
| Dental X-Ray | Dose (Setting kV 70, mA 10) | `± 10 %` | `DXRAY_DOSE_LINEARITY` noteOnly |
| Dental X-Ray | Output Reproducibility (kV 70) | `± 10 % CV ≤ 0.05` (secondary CV criterion → mild D flavor) | `DXRAY_REPRODUCIBILITY` noteOnly |
| Examination Lamp | Intensitas Cahaya, trials I–V | `> 1000 lux` | `EXLMP_INTENSITY` minOnly(1000) |
| Examination Lamp | Color Temperature | `3000°K ≤ 6700°K` | `EXLMP_CCT` range(3000, 6700) |
| Examination Lamp | Color Rendering Index | `85 ≤ Ra ≤ 100` | `EXLMP_CRI` range(85, 100) |
| Head Lamp Medik | Intensitas Cahaya / CCT / CRI | identical table to Examination Lamp | `HLAMP_INTENSITY` / `HLAMP_CCT` / `HLAMP_CRI` |
| Lampu Operasi | Intensitas Cahaya / CCT / CRI | `40.000 – 160.000 lux` / `3000 - 6700°K` / `85 – 100 Ra` | `LOP_INTENSITY` range(40000,160000) / `LOP_CCT` / `LOP_CRI` |
| Laryngoskop | Intensitas Cahaya / CCT / CRI | `40.000 – 160.000 lux` (⚠ FLAGGED in seed as possible copy-paste from Lampu Operasi) / `3000 - 6700°K` / `85 – 100 Ra` | `LARYN_INTENSITY` / `LARYN_CCT` / `LARYN_CRI` |
| Otoscope | Intensitas Cahaya / CCT / CRI | `-` (no value) / `3000 - 6700°K` / `85 – 100 Ra` | **not seeded** (OTOSCOPE excluded from extension) |
| Centrifuge | Rotation Time Accuracy (Setting 300 detik) | `± 10 %` | `CENT_TIME` noteOnly |
| Centrifuge Refrigerator | Rotation Time Accuracy (300 detik) | `± 10 %` | `CRFR_TIME` noteOnly |
| Rotator | Rotation Time Accuracy (300 detik) | `± 10 %` | `ROT_TIME` noteOnly |
| Electro Accupunture (EST) | Treatment Timer (Setting 300 detik) | `±10%` | `EST_TIMER` noteOnly |
| Electrocardiograph | Sinusoidal Signal Test (10 Hz 1,0 mV) | `± 10 %` | `ECG_SINUSOID_TEST` noteOnly |
| Electrocardiograph | Normal ECG Signal Test (60 BPM 2 mV) | `± 5 %` | `ECG_NORMAL_TEST` noteOnly |
| Humidifier | Maximum Temperature (Setting 40) | `≤ 40°c` | `HUM_MAX_TEMP` maxOnly(40) |
| Infant Warmer | Suhu matras (36 ℃) | `≤ 40 °C` | `IW_MAX_MATTRESS_TEMP` maxOnly(40) |
| Infant Warmer | Pengukuran suhu 1–5 (Setting 36 ℃) | `± 2` | `IW_TEMP_CALIBRATION` pm(36, 2) |
| Infant Warmer | Setting Standar 36 ℃ vs Display UUT | `± 0.3℃` | **not seeded** (coverage gap) |
| Infusion Pump | Occlusion (Setting 100 ml/jam), trials I–V | `< 20 psi` | `INFUS_OCCLUSION` maxOnly(20) |
| Syringe Pump | Occlusion (Setting 100 ml/jam), trials I–V | `< 20 psi` | `SYR_OCCLUSION` maxOnly(20) |
| Laminar Air Flow | Particle Count (0,5 micron), posisi 1–4 | `0,5 ≤ 100 Particle` | `LAF_PARTICLE_COUNT` maxOnly(100) |
| Laminar Air Flow | Down Flow Velocity, posisi A/B | `0,25 - 0,50 m/s ; ± 0,025` | `LAF_DOWNFLOW` noteOnly |
| Laminar Air Flow | Light Intensity, trials I–III | `≥ 750 lux` | `LAF_LIGHT_INTENSITY` minOnly(750) |
| Laminar Air Flow | UV Radiation, trials I–III | `≥ 40 µW/` | `LAF_UV_RADIATION` minOnly(40) |
| Mikroskop Laboratorium | Objektif 4x (stage/okuler mikrometer) | `± 5%` | `MICRO_MAG_4X` noteOnly |
| Mikroskop Laboratorium | Objektif 10x | `± 5%` | `MICRO_MAG_10X` noteOnly |
| Mikroskop Laboratorium | Objektif 4x / Objektif 10x (ratio) | `± 5%` (derived ratio → mild D flavor) | `MICRO_MAG_RATIO` noteOnly |
| Nebulizer Compressor | Flow (Compressor Max), trials I–V | `≥ 4 lpm` | `NCOMP_FLOW_RATE` minOnly(4) |
| Nebulizer Ultrasonic | Flow (Ultrasonic Max), trials I–V | `0,5 lpm – 2 lpm` | `UNEB_FLOW_RATE` range(0.5, 2) |
| Oksigen Concentrator | Purity (Setting 4 lpm) | `≥ 90%` | `O2CON_CONCENTRATION` minOnly(90) |
| Phototherapy | Spectral Irradiance (Setting Default, titik ukur 1–4/M), trials I–III | `≥ 8 µW/cm2/nm` | `PHOTO_IRRADIANCE` minOnly(8) |
| Resusitator Paru dan Neopuff | Max Pressure | `40 cmH2O-65 cmH2O` | `RESUS_*_MAX_PRESSURE` range(40, 65) |
| Sphygmomanometer | Cuff/Manometer Leak Test (Setting 250 mmHg) | `≤ 15 mmHg / 1 menit` | `SPHYG_LEAK_TEST` maxOnly(15) |
| Sphygmomanometer | Rapid Deflation (260 → 15 mmHg) | `≤ 10 detik` | `SPHYG_DEFLATION` maxOnly(10) |
| Suction Pump | Time to Maximum Vacuum | `≤ 15 detik` | `SUCT_TIME_MAX_VACUUM` maxOnly(15) |
| Autoclave | (see Pattern C/D — Autoclave has no plain-A performance item) | — | — |

---

## Pattern B – Multiple Setting Points, Shared Tolerance

A "Setting Simulator" / "Setting UUT" / "Setting Standar" column with multiple numeric values, and
a **single** tolerance cell that applies to all of them. Replicate columns (I–V) may also be
present. A second categorical dimension (Earphone Kanan/Kiri; Systole/Mean/Diastole) that still
shares the one tolerance is treated as still-B.

| Device type | Parameter | Setting points | Shared tolerance | Seeded as |
|---|---|---|---|---|
| Audiometer | Pure Tone Linearity (Earphone Kanan/Kiri, 1000 Hz) | 80/70/60/50/40/30/20 dB | `± 1 dB` | `AUD_PURE_TONE_LINEARITY` noteOnly |
| Audiometer | Frequency Response (Earphone Kanan/Kiri) | 250/500/6000/8000 Hz | `± 2%` | `AUD_FREQUENCY_RESPONSE` noteOnly |
| Bed Side Monitor | Heart Rate | 30/60/120/180 BPM | `± 5 bpm` | `BSM_HEART_RATE` noteOnly |
| Bed Side Monitor | Respiration Rate | 15/30/60/120 BrPM | `± 3 BrPM` | `BSM_RESP_RATE` noteOnly |
| Bed Side Monitor | SpO2 | 98/93/92/85/90/70/88 | `± 3 % SPO2` | `BSM_SPO2` noteOnly |
| Bed Side Monitor | NIBP (Systole/Mean/Diastole) | 120/93/80 … 250/215/195 … 100/76/65 (7 triples) | `± 5 mmHg` | `BSM_SYSTOLIC` / `BSM_DIASTOLIC` / `BSM_MAP` (3 rows, all `± 5 mmHg`) |
| Blood Pressure Monitor | NIBP (Systole/Mean/Diastole) | 60/40/30 … 200/166/150 (6 triples), setting standar 60–80 bpm | `± 5 mmHg` | `BPM_SYSTOLIC` / `BPM_DIASTOLIC` / `BPM_MAP` |
| Pulse Oxymeter | Heart Rate | 30/60/120/180 BPM (trials I–VI) | `± 5 bpm` | `PULSEOX_HEART_RATE` noteOnly |
| Pulse Oxymeter | SpO2 | 98/93/92/85/90/70/88/90 | `± 4 % SPO2` | `PULSEOX_SPO2` noteOnly |
| Blanket Warmer | Temperature Calibration | 33/35/40 °C | `± 3°C` | `BLNW_TEMP_CALIBRATION` noteOnly |
| CPAP | Oxygen Concentration | 21/60 % | `± 3%` | `CPAP_CONCENTRATION` noteOnly |
| CPAP | Gas Flow Rate | 3/5/10/13/15 L/min | `± 20%` | `CPAP_FLOW_RATE` noteOnly |
| Centrifuge | Rotation Speed | Min/Med/Max | `± 10%` | `CENT_SPEED` noteOnly |
| Centrifuge Refrigerator | Rotation Speed | Min/Med/Max | `± 10%` | `CRFR_SPEED` noteOnly |
| Rotator | Rotation Speed | Min/Med/Max | `± 10%` | `ROT_SPEED` noteOnly |
| Dental X-Ray | Exposure Time | Rendah/Sedang/Tinggi (kV 70, mA 10) | `± 10 %` | `DXRAY_EXPOSURE_TIME` noteOnly |
| Electro Accupunture (EST) | Stimulation Frequency | 80/120/200 Hz | `±10%` | `EST_FREQUENCY` noteOnly |
| Electro Accupunture (EST) | Stimulation Intensity | 10/20/30/40 mA | `±20%` | `EST_INTENSITY` noteOnly |
| Electro Accupunture (EST) | Pulse Duration | 0,1/0,2/0,3 ms | `±10%` | `EST_PULSE_DURATION` noteOnly |
| Electrocardiograph | Amplitude/Sensitivity | gain 5/10/20 mm/mV | `± 5 %` | `ECG_AMPLITUDE` noteOnly |
| Electrocardiograph | Recording Speed | 25/50 mm/s | `± 5 %` | `ECG_REC_SPEED` noteOnly |
| Electrocardiograph | Heart Rate Calibration | 60/90/120 bpm | `± 5 bpm` | `ECG_HR_CAL` noteOnly |
| Fetal Doppler | Fetal Heart Rate | 30/60/90/120/150/180/210 | `± 5 bpm` | `FDOP_HR_ACCURACY` noteOnly |
| Flow Meter | Flow Rate | 3/5/7/9/11/13/15 L/min | `± 20 %` | `FM_FLOW_RATE` noteOnly |
| Humidifier | Temperature Accuracy | 35/37 °C | `± 1°c` | `HUM_TEMP_ACCURACY` noteOnly |
| Infusion Pump | Flow Rate Calibration | 10/50/100/150/300 ml/jam | `±10%` | `INFUS_FLOW_RATE` noteOnly |
| Syringe Pump | Flow Rate Calibration | 10/25/50/75/100 ml/jam | `±10%` | `SYR_FLOW_RATE` noteOnly |
| Oksigen Concentrator | Flow Rate | 2/3/5/7/9 lpm | `± 20%` | `O2CON_FLOW_RATE` noteOnly |
| Resusitator Paru dan Neopuff | Pressure Accuracy | 10/20/30/40/65 cmH2O | `±20%` | `RESUS_*_PRESSURE_ACC` noteOnly |
| Sphygmomanometer | Pressure Reading Accuracy | 0/50/100/150/200/250 mmHg, naik & turun | `± 4 mmHg, U95 maks 1,5 mmHg ≤ MPE` (metrology criterion → mild D flavor) | `SPHYG_PRESSURE_ACC` noteOnly |
| Spirometer | FVC Volume Accuracy | 0,5 / 3 liter | `±3%` | `SPIRO_FVC` noteOnly |
| pH Meter | Assay pH (buffer solutions) | 2 buffer points | `±0,05` | **not seeded** (PH_METER excluded) |

---

## Pattern C – Multiple Variants, Distinct Tolerances Per Variant

Multiple rows under one conceptual parameter, where **each row's tolerance is a genuinely
different range/value** — not a shared delta from different setting points. For each: is it
correctly split in current data, or incorrectly collapsed?

| # | Device type | Parameter (LK) | Variants & distinct tolerances (evidence) | Current seed representation | Verdict |
|---|---|---|---|---|---|
| C1 | **Dental Unit** | Kecepatan Putar Handpiece | `Low Speed → 5000 rpm-11.000 rpm`; `High Speed → >250.000 rpm` | **Two rows:** `DUNIT_HP_SPEED_LOW` `range(5000,11000)` + `DUNIT_HP_SPEED_HIGH` `minOnly(250000)`, both under capabilityItem `HANDPIECE_SPEED_LOW`/`HANDPIECE_SPEED_HIGH` | ✅ **Correctly split** |
| C2 | **Dental X-Ray** | Collimation (Panjang / Diameter) | `Panjang → ≥ 200 mm`; `Diameter → ≤ 60 mm` | **Two rows:** `DXRAY_COLLIMATION_LENGTH` `minOnly(200)` + `DXRAY_COLLIMATION_DIAMETER` `maxOnly(60)` (both under `COLLIMATION_ACCURACY`) | ✅ **Correctly split** |
| C3 | **Autoclave** | Sterilization Temperature | `Setting 121 → 121 °C ~ 124 °C`; `Setting 134 → 134 °C ~137 °C` | **One row** `ACLV_STER_TEMP`, `toleranceMin=null toleranceMax=null`, `toleranceNote="121 °C ~ 124 °C; 134 °C ~137 °C"` | ❌ **Incorrectly collapsed** |
| C4 | **Autoclave** | Sterilization Time | `121 °C → ≥ 15 menit`; `134 °C → ≥ 3 menit` | **One row** `ACLV_STER_TIME`, min/max `null`, `toleranceNote="121 °C ≥ 15 menit; 134 °C ≥ 3 menit"` | ❌ **Incorrectly collapsed** |
| C5 | **Bio Safety Cabinet** | Light Intensity | `Lampu ON → ≥ 450 lux`; `Lampu OFF → ≤ 160 lux` | **One row** `BSC_LIGHT_INTENSITY`, min/max `null`, `toleranceNote="Lampu ON ≥ 450 lux; Lampu OFF ≤ 160 lux"` | ❌ **Incorrectly collapsed** |
| C6 | **Bio Safety Cabinet** | Sound Level | `Noise ON → ≤ 70 dBA`; `Noise OFF → ≤ 60 dBA` | **One row** `BSC_SOUND_LEVEL`, min/max `null`, `toleranceNote="Noise ON ≤ 70 dBA; Noise OFF ≤ 60 dBA"` | ❌ **Incorrectly collapsed** |
| C7 | **Laminar Air Flow** | Sound Level | `Background → ≤ 55 dBA`; `Didalam kompartemen → ≤ 65 dBA` | **One row** `LAF_SOUND_LEVEL`, min/max `null`, `toleranceNote="Background ≤ 55 dBA; Didalam kompartemen ≤ 65 dBA"` | ❌ **Incorrectly collapsed** |
| C8 | **Dental X-Ray** | Half Value Layer | `70 kV → ≥ 1,5 mmAI`; `80 kV → ≥ 2,3 mmAI` | **One row** `DXRAY_HVL`, min/max `null`, `toleranceNote="70 ≥ 1,5 mmAI; 80 ≥ 2,3 mmAI"` | ❌ **Incorrectly collapsed** |
| C9 | **Suction Pump** | Maximum Vacuum | `Low Vacuum → < 150 mmHg`; `Medium → 150 mmHg – 450 mmHg`; `High → ˃ 450 mmHg` | **One row** `SUCT_MAX_VACUUM`, min/max `null`, note carries all three **+ "*isi salah satu sesuai dengan UUT"** | ⚠️ **Borderline** — source explicitly says only one classification applies per unit, so a single row is defensible; still cannot hold a structured bound |
| C10 | **Auto Chemistry Analyzer** | Test/analyte list (~27 analytes) | Each analyte its own tolerance: `Albumin ± 10%`, `Alkaline fosfatase ± 30%`, `Bilirubin total ± 0.4 mg/dL or 20%`, `Blood gas pH ± 0.04`, `Calcium ± 1.0 mg/dL`, `Potassium ± 0,5 mmol/L`, `Sodium ± 4 mmol/L`, `Glucose ± 6 mg/dL or ± 10%`, … | **Not seeded** — `AUTO_CHEMISTRY_ANALYZER` is in `EXCLUDED_TYPE_CODES` | ➖ Not a current bug; design input only |
| C11 | **Hematologi Analyzer** | Analyte list (~9 analytes) | `WBC differentiation ± 3 SD`, `Erythrocyte count ± 6%`, `Hemoglobin ± 7%`, `Leukocyte count ± 15%`, `Platelet ± 25%`, `Fibrinogen ± 20%`, `PTT ± 15%`, `Prothrombin ± 15%` | **Not seeded** — `HEMATOLOGI_ANALYZER` excluded | ➖ Design input only |

**Additional Pattern-C-flavored case inside a Pattern D item (flag, not counted in C total):**

| Device type | Parameter | Evidence | Current seed |
|---|---|---|---|
| Baby Incubator | Air Temperature Calibration (Tc/T1–T5) | Two distinct tolerance classes in one item: `TM/T5 → ± 1.5 oC` (setting vs mean-of-standard) **and** `T1–T4 → ± 0.8 oC relative to the mean of TM` | **One row** `INCU_AIR_TEMP` (`AIR_TEMPERATURE_CALIBRATION`), min/max `null`, long `toleranceNote` carrying both classes. Also a spatial-uniformity/derived structure (see Pattern D). |

---

## Pattern D+ – Other Structures

| Device type(s) | Parameter | Structure | Evidence | Current seed |
|---|---|---|---|---|
| Autoclave | Chamber Temperature | **Derived differences**, each its own tolerance | `ΔT1 = S1 – S2 ± 2 °C`; `ΔT2 = S1 – S3 ± 5 °C`; `ΔT3 = S1 – S3 ± 2 °C` (Setting UUT 121/134) | `ACLV_CHAMBER_TEMP` one row, note carries all three ΔT expressions |
| Baby Incubator | Air Temperature Calibration | **Spatial uniformity + relative-to-mean derived**; 5 sensors (TM,T1–T4) × 2 settings (32/36) × trials I–V; tolerance defined relative to the running mean of TM | Table 7 | `INCU_AIR_TEMP` one row (see also C-flavor above) |
| Blood Bank Refrigerator | Storage Temperature Uniformity | **Spatio-temporal mapping via external logger**; T1–T9 × 30 timepoints; `Note : pembacaan standar sudah terekam pada thermometer 12 channel, hasilnya dilampirkan di belakang LK` | `Variasi suhu = 1°C ~ 9°C` | `BBR_STORAGE_TEMP` one row `range(2,8)` + note, named "(multi-point T1-T9, 2-8C)" |
| Cold Chain / Vaccine Refrigerator (KULKAS_VAKSIN, COALD_CHAIN) | Storage Temperature Uniformity | same external-logger T1–T9 × 30 structure | `Variasi suhu = 2°C ~ 10°C` | `KVAK_STORAGE_TEMP` / `CCHAIN_STORAGE_TEMP` `range(2,10)` |
| Medical Refrigerator | Storage Temperature Uniformity | same | `suhu : ± 1 °C` | `MREF_STORAGE_TEMP` `range(2,8)` |
| Medical Freezer | Storage Temperature Uniformity | same | `Pembacaan suhu ± 1,5°C dari pengaturan` | `MFRZ_STORAGE_TEMP` `range(-150,-5)` |
| Oven | Sterilization/Drying Temperature | same T1–T9 × 30 external-logger structure | `suhu : ± 3 °C` | `OVEN_TEMP` one row, note, "(multi-point)" |
| Sterilisator | Sterilization Temperature | same | `suhu : ± 3 °C` | `STER_TEMP` one row, "(multi-point T1-T9)" |
| Centrifuge Refrigerator | Compartment Temperature Uniformity | same T1–T9 × 30 structure | `suhu = ± 3°C` | `CRFR_STORAGE_TEMP` one row noteOnly |
| Platelet Agitator Incubator | Storage Temperature Uniformity | same T1–T9 × 30 structure | `Setting suhu 20 ˚C - 24 ˚C; suhu : ± 1,5 °C` | `PLT_STORAGE_TEMP` one row noteOnly |
| Bio Safety Cabinet | HEPA / ULPA Leak Test | **Qualitative pass/fail** | `Seluruh hepa → Pass / Fail` | `BSC_HEPA_LEAK` `valueType=BOOLEAN`, noteOnly("Pass / Fail") |
| Suction Pump | Vacuum Gauge Accuracy | **Paired up/down ramp + free-form setting list**; rows 1–6 (setting chosen by technician), `Pengukuran 1/2/3` each split into `Naik | Turun` columns; unit chosen per UUT (`mmHg/…`) | Table 7 | `SUCT_VACUUM_GAUGE` one row noteOnly(`± 10%`) |
| Phaco Emulsifikasi | (unnamed pressure test) | same paired up/down ramp + free-form setting list structure as Suction Pump | Table 7, `± 10%` | **not seeded** (PHACO_EMULSIFIKASI excluded) |
| Thermohygrometer | Temperature (reference vs UUT) | **Paired reference-vs-UUT columns**, climatic-chamber driven; 50% RH × {20/25/30/35 °C} × trials I–VI; separate tables for reference reading and UUT reading, **no explicit tolerance printed** | Tables 5 & 6 | **not seeded** (THERMOHYGROMETER excluded) |
| Thermohygrometer | Humidity (reference vs UUT) | paired ref/UUT + up/down sweep; 25 °C × {40/50/60/70 %RH} naik & turun × I–VI | Tables 7 & 8 | **not seeded** |
| Otoscope | Intensitas Cahaya | tolerance cell literally `-` (undefined in the LK) | Table 7 | **not seeded** |
| Sphygmomanometer | Pressure Reading Accuracy | Pattern B **plus** metrological `U95 ≤ MPE` acceptance rule (see B table) | Table 7 | `SPHYG_PRESSURE_ACC` noteOnly |
| Kelistrikan (ELECTRIC_BEDS) | — | **No performance section at all** — worksheet is environment + physical + electrical-safety only | whole doc | only env/electrical-safety rows seeded |

---

## Data-Correctness Issues Found (Pattern C mismatches)

Actionable, but **NOT fixed in this task**. Each row below currently exists as a single
`DeviceCalibrationParameter` with `toleranceMin = NULL` and `toleranceMax = NULL`, its real
tolerance structure surviving only as prose in `toleranceNote`. To represent the source document
faithfully each needs to become **multiple rows** (or, once the future test-point model exists,
one parent + N child test-points, each child carrying its own bounds).

All rows are defined in `packages/db/prisma/seed-device-taxonomy-extension-parameters.ts` (the
24-type extension). None are in the original 242. The original 242 have **no** collapsed Pattern C
row — the only original-set concern is the D-flavored `INCU_AIR_TEMP` dual-tolerance note.

| Seed code | Device type / capabilityItem | Should become | Source (LK) |
|---|---|---|---|
| `ACLV_STER_TEMP` | AUTOCLAVE / `STERILIZATION_TEMPERATURE` | 2 rows: setting 121 → `range(121, 124)`; setting 134 → `range(134, 137)` | `LK Autoclave.docx` Table 8 |
| `ACLV_STER_TIME` | AUTOCLAVE / `STERILIZATION_TIME` | 2 rows: 121 °C → `minOnly(15)` min; 134 °C → `minOnly(3)` min | `LK Autoclave.docx` Table 9 |
| `ACLV_CHAMBER_TEMP` | AUTOCLAVE / `CHAMBER_TEMPERATURE` | 3 derived rows: ΔT1 `± 2 °C`, ΔT2 `± 5 °C`, ΔT3 `± 2 °C` (also Pattern D — derived difference) | `LK Autoclave.docx` Table 7 |
| `BSC_LIGHT_INTENSITY` | BIO_SAFETY_CABINET / `LIGHT_INTENSITY` | 2 rows: Lampu ON → `minOnly(450)`; Lampu OFF → `maxOnly(160)` | `LK Bio Safety Cabinet.docx` Table 12 |
| `BSC_SOUND_LEVEL` | BIO_SAFETY_CABINET / `SOUND_LEVEL` | 2 rows: Noise ON → `maxOnly(70)`; Noise OFF → `maxOnly(60)` | `LK Bio Safety Cabinet.docx` Table 13 |
| `LAF_SOUND_LEVEL` | LAMINAR_AIR_FLOW / `SOUND_LEVEL` | 2 rows: Background → `maxOnly(55)`; Didalam kompartemen → `maxOnly(65)` | `LK Laminar Air Flow.docx` Table 10 |
| `DXRAY_HVL` | DENTAL_XRAY / `HALF_VALUE_LAYER` | 2 rows: 70 kV → `minOnly(1.5)` mmAl; 80 kV → `minOnly(2.3)` mmAl | `LK Dental X-Ray.docx` Table 13 |
| `SUCT_MAX_VACUUM` (borderline) | SUCTION_PUMP / `MAXIMUM_VACUUM` | Optionally 3 rows Low `< 150` / Medium `150–450` / High `> 450` mmHg — but LK says "isi salah satu sesuai dengan UUT", so a single classification row per unit is arguably correct as-is | `LK Suction Pump.docx` Table 8 |

**Not a Pattern C bug but flagged for the same future model:**

- `INCU_AIR_TEMP` (BABY_INCUBATOR / `AIR_TEMPERATURE_CALIBRATION`) carries two tolerance classes
  (`± 1.5 oC` for TM/T5, `± 0.8 oC` for T1–T4 relative to mean) in one free-text note. Needs child
  test-points with per-sensor tolerance once the model exists.
- All the "(multi-point T1-T9)" storage-uniformity rows (`BBR_STORAGE_TEMP`, `KVAK_STORAGE_TEMP`,
  `CCHAIN_STORAGE_TEMP`, `MREF_STORAGE_TEMP`, `MFRZ_STORAGE_TEMP`, `OVEN_TEMP`, `STER_TEMP`,
  `CRFR_STORAGE_TEMP`, `PLT_STORAGE_TEMP`) intentionally flatten a 9-sensor × 30-timepoint grid
  into one row; that is Pattern D and a deliberate simplification, not an error.

---

## Implications for Future MeasurementEntry / Test-Point Design

Given the real prevalence:

1. **Pattern A (~50%) is the common case** and is the cheapest: a parameter with one
   tolerance and a small set of repeated trials. The model must make this the zero-ceremony
   default — one `DeviceCalibrationParameter`, N trial readings, tolerance on the parameter.

2. **Pattern B (~28%) needs child "setting points"** that **inherit the parent parameter's
   tolerance**. A `CalibrationTestPoint` (or similar) with a `settingValue` / `settingLabel`, N
   trial readings per point, and **no own tolerance** (falls back to parent). The categorical
   second dimension (Earphone Kanan/Kiri, Systole/Mean/Diastole) suggests the test-point key may
   need to be a small tuple, not a single scalar — or those stay as separate parameters
   (NIBP is already modeled as 3 parameters today, which works).

3. **Pattern C (~9%) must NOT be a shared-tolerance child.** Each variant needs its own bounds.
   Two viable shapes:
   - keep splitting into separate `DeviceCalibrationParameter` rows (what Dental Unit and
     Dental X-Ray collimation already do — clean, works today), or
   - allow a `CalibrationTestPoint` to **optionally override** the parent tolerance
     (`toleranceMin/Max/Note` nullable on the test-point, null = inherit).
   The second is more flexible and would also absorb the Baby-Incubator dual-tolerance case and
   the "each analyte its own tolerance" analyzer case (C10/C11) without exploding the parameter
   count. **Recommendation: test-point with optional tolerance override.**

4. **Pattern D (~13%) is heterogeneous and will not fully fit A/B/C.** Sub-shapes and what each
   needs:
   - *Spatial/temporal uniformity via external data logger* (all the fridge/freezer/oven/
     sterilizer rows): the actual per-sensor/per-timepoint data lives in an attached logger
     export, never typed into the LK. The model realistically stores a **summary result**
     (max spread / worst deviation) against one tolerance + a reference to the attachment.
     Do not try to model 270 cells.
   - *Derived quantities* (Autoclave ΔT1/ΔT2/ΔT3, Mikroskop 4x/10x ratio, incubator
     relative-to-mean): need either a computed field or just separate parameters each with its
     own tolerance (Pattern C mechanics).
   - *Paired up/down ramp* (Suction Pump, Phaco): test-point needs a `direction` (naik/turun)
     facet in addition to setting value.
   - *Paired reference-vs-UUT* (Thermohygrometer): two reading columns per trial (standard
     reading + UUT reading); the "result" is their difference. Test-point/reading model needs
     room for a reference reading alongside the UUT reading.
   - *Qualitative pass/fail* (BSC HEPA leak): already handled by `valueType = BOOLEAN`.
   - *Undefined tolerance in source* (Otoscope intensity `-`, Thermohygrometer tables): the
     model must allow a parameter/test-point with **no tolerance** and still be valid.

5. **`toleranceNote` is currently doing structural work it shouldn't.** At least 8 rows encode
   multi-valued tolerance logic as prose. Whatever model is chosen, the migration should parse
   these notes into real bounds (the "Data-Correctness Issues Found" table gives the target
   values) rather than carrying them forward as strings.

6. **Unit-per-UUT** appears in a few places (`mmHg/…` in Suction Pump / Phaco, "isi salah satu"
   in Suction Pump max-vacuum). The reading model may need a per-entry unit rather than assuming
   the parameter's `uom` is fixed.

---

## Confirmation

No schema, seed script, migration, Prisma model, or database data was modified during this
investigation. The only file written is this report. All classification is derived from the 50
`.docx` worksheets in `docs/technician-docs/` and the three existing seed/backfill scripts under
`packages/db/prisma/`.
