# Report: Align Item & Parameter Names with LK Source — Batch 4 of 4 (FINAL)

**Date:** 2026-08-27
**Scope:** `name` only, on `DeviceCapabilityItem` + `DeviceCalibrationParameter`, restricted to
device types in **4 categories: Laboratory & Diagnostic Equipment, Dental Equipment, Medical
Lighting, Audiology & Physiological Testing**. No `code` / tolerance / `uomId` / `valueType` /
FK / schema changes. `DeviceCategory` / `DeviceCapability` untouched (Phase 1).

---

## Step 0 — Target DB & scope

**Connection:** `postgresql://postgres:***@localhost:5432/pkmdb?schema=public`
(`d:/medcal/.env` line 2 — local native `pkmdb`). Not Docker/staging/prod.

**Device types in scope (16), by category:**

| category | device types (param rows) |
|---|---|
| Laboratory & Diagnostic | BIO_SAFETY_CABINET (16), CENTRIFUGE (9), CENTRIFUGE_REFRIGERATOR (10), LAMINAR_AIR_FLOW (13), MIKROSKOP_LABORATORIUM (10), PLATELET_AGITATOR_INCUBATOR (8), ROTATOR (9) |
| Dental Equipment | DENTAL_UNIT (13), DENTAL_XRAY (15) |
| Medical Lighting | EXAMINATION_LAMP (10), HEAD_LAMP_MEDIK (10), LAMPU_OPERASI (10), LARYNGOSKOP (10) |
| Audiology & Physiological | AUDIOMETER (9), FETAL_DOPPLER (8), SPIROMETER (8) |

**Exclusion check:** none of the 16 overlap the "deliberately not in the system" list
(Auto Chemistry Analyzer, Hematologi Analyzer, pH Meter, Thermohygrometer, Otoscope, Phaco
Emulsifikasi) — none of those appeared in the `DeviceType` query. No anomaly.

**Pattern-C split rows verified against current DB structure:**
`DUNIT_HP_SPEED_LOW`/`_HIGH`, `DXRAY_HVL_70KV`/`_80KV`, plus `BSC_LIGHT_INTENSITY_ON`/`_OFF`,
`BSC_SOUND_LEVEL_ON`/`_OFF`, `LAF_SOUND_LEVEL_BACKGROUND`/`_COMPARTMENT` — all present as the
split rows; only their `name` was touched, structure unchanged.

**Baseline (unchanged before → after):** items 98, params 489.

**LK sources:** LK Kelistrikan, LK Bio Safety Cabinet, LK Laminar Air Flow, LK Centrifuge,
LK Rotator, LK Mikroskop Laboratorium, LK Dental Unit, LK Dental X-Ray, LK Examination Lamp,
LK Head Lamp Medik, LK Lampu Operasi, LK Laryngoskop, LK Audiometer, LK Fetal Doppler,
LK Spirometer, LK Platelet Agitator Incubator.

---

## Step 1 — Changes: 29 `DeviceCapabilityItem` + 160 `DeviceCalibrationParameter`

### Item highlights (with LK source term)

| capability / code | before → after | LK source |
|---|---|---|
| CLEAN_AIR_CONTAINMENT / PARTICLE_COUNT | Particle Count → **Pengujian Particle Counter** | LK BSC/LAF §"Pengujian Particle Counter" |
| CLEAN_AIR_CONTAINMENT / DOWNFLOW_VELOCITY | Downflow Velocity → **Pengujian Downflow** | LK BSC §"Pengujian Downflow" |
| CLEAN_AIR_CONTAINMENT / INFLOW_VELOCITY | Inflow Velocity → **Pengujian Inflow Velocity** | LK BSC §"Pengujian Inflow Velocity" |
| CLEAN_AIR_CONTAINMENT / LIGHT_INTENSITY | Light Intensity → **Pengukuran Nilai Intensitas Cahaya (Lighting)** | LK BSC/LAF §"Pengukuran Nilai Intesitas Cahaya (Lighting)" (LK typo "Intesitas" → corrected) |
| CLEAN_AIR_CONTAINMENT / SOUND_LEVEL | Sound Level → **Pengukuran Sound Level** | LK BSC/LAF §"Pengukuran Sound Level" |
| CLEAN_AIR_CONTAINMENT / UV_RADIATION | UV Radiation → **Pengukuran Radiasi UV** | LK BSC/LAF §"Pengukuran Radiasi UV" |
| CLEAN_AIR_CONTAINMENT / HEPA_LEAK_TEST | HEPA / ULPA Leak Test → **Pengukuran Kebocoran Hepa / Ulpa Filter** | LK BSC §"Pengukuran Kebocoran Hepa / Ulpa Filter" |
| DENTAL_UNIT_PERFORMANCE / HANDPIECE_SPEED_LOW / _HIGH | Handpiece Speed (Low/High) → **Kecepatan Putar Handpiece (Low/High Speed)** | LK Dental Unit row "Kecepatan Putar Handpiece" / "Low Speed" / "High Speed" |
| DENTAL_UNIT_PERFORMANCE / HANDPIECE_PRESSURE | Handpiece Pressure → **Tekanan Handpiece** | LK Dental Unit row "Tekanan Handpiece" |
| DENTAL_UNIT_PERFORMANCE / LIGHT_ILLUMINANCE | Light Illuminance → **Illuminance** | LK Dental Unit row "Illuminance" (kept English, as LK writes it) |
| DENTAL_UNIT_PERFORMANCE / AIR_SPRAY_PRESSURE | Air Spray Pressure → **Tekanan Semprot Udara** | LK Dental Unit row "Tekanan Semprot Udara" |
| DENTAL_UNIT_PERFORMANCE / SUCTION_PRESSURE | Suction Pressure → **Daya Hisap** | LK Dental Unit row "Daya Hisap" |
| XRAY_PERFORMANCE / COLLIMATION_ACCURACY | Collimation Accuracy → **Uji Kolimasi** | LK Dental X-Ray §"Uji Kolimasi" |
| XRAY_PERFORMANCE / KV_ACCURACY | kV Accuracy → **Akurasi Tegangan Tinggi (kV)** | LK Dental X-Ray §"Akurasi Tegangan Tinggi (kV)" |
| XRAY_PERFORMANCE / EXPOSURE_TIME_ACCURACY | Exposure Time Accuracy → **Akurasi Waktu Penyinaran** | LK Dental X-Ray §"Akurasi Waktu Penyinaran" |
| XRAY_PERFORMANCE / DOSE_LINEARITY | Dose Linearity → **Linearitas Pengukuran** | LK Dental X-Ray §"Linearitas Pengukuran" |
| XRAY_PERFORMANCE / OUTPUT_REPRODUCIBILITY | Output Reproducibility → **Reproduksibilitas Keluaran Sinar-X** | LK Dental X-Ray §"Reproduksibilitas Keluaran Sinar-X" |
| XRAY_PERFORMANCE / HALF_VALUE_LAYER | Half Value Layer → **Pengujian Half Value Layer (HVL)** | LK Dental X-Ray §"Pengujian Half Value Layer (HVL)" |
| LIGHT_SOURCE_PERFORMANCE / LIGHT_INTENSITY | Light Intensity → **Intensitas Cahaya** | LK Examination Lamp / Lampu Operasi / Head Lamp / Laryngoskop row "Intensitas Cahaya" |
| OPTICAL_MAGNIFICATION / MAGNIFICATION_4X / _10X | Objective Magnification 4x/10x → **Pembesaran Objektif 4x/10x** | LK Mikroskop Laboratorium §"Pembesaran Objektif 4x" / "10x" |
| OPTICAL_MAGNIFICATION / MAGNIFICATION_RATIO | Magnification Ratio → **Nilai Ratio Pembesaran** | LK Mikroskop Laboratorium §"Nilai Ratio Pembesaran" |
| ROTATIONAL_SPEED / ROTATION_SPEED_ACCURACY | Rotation Speed Accuracy → **Kalibrasi Kecepatan Putar** | LK Centrifuge / Rotator §"Kalibrasi Kecepatan Putar" |
| ROTATIONAL_SPEED / ROTATION_TIME_ACCURACY | Rotation Time Accuracy → **Kalibrasi Waktu Putar** | LK Centrifuge / Rotator §"Kalibrasi Waktu Putar" |
| AUDIOMETRIC_PERFORMANCE / PURE_TONE_LINEARITY | Pure Tone Linearity → **Linieritas dB Pure Tone** | LK Audiometer §"Linieritas dB Pure Tone" |
| AUDIOMETRIC_PERFORMANCE / FREQUENCY_RESPONSE | Frequency Response → **Frekuensi Respon / Tanggap** | LK Audiometer §"Frekuensi Respon / Tanggap" |
| SPIROMETRY_VOLUME_ACCURACY / FVC_VOLUME_ACCURACY | FVC Volume Accuracy → **Pengukuran Akurasi Total Volume Forced Vital Capacity (FVC)** | LK Spirometer §title verbatim |
| FETAL_HEART_RATE / FETAL_HR_ACCURACY | Fetal Heart Rate Accuracy → **Kalibrasi Detak Jantung Bayi** | LK Fetal Doppler §"Kalibrasi Detak Jantung Bayi" |

**Kept as-is (LK writes them in English):**
`LIGHT_SOURCE_PERFORMANCE / COLOR_TEMPERATURE` = "Color Temperature",
`LIGHT_SOURCE_PERFORMANCE / COLOR_RENDERING_INDEX` = "Color Rendering Index"
(LK Examination Lamp / Lampu Operasi / Head Lamp / Laryngoskop print these rows in English).

### Parameter changes (160)

env/electrical rows for all 16 device types → the 7 finalised Batch-1 terms; device-specific
rows mirror their item names; the 6 split rows get the item name + their ON/OFF/kV/Speed
qualifier. Full 160-row before→after table: `scratchpad/batch4_tables.md`. Notable:
- `LAF_DOWNFLOW` → **"Airflow Velocity"** (LK LAF calls it that, not "Downflow" — BSC does).
- `BSC_SOUND_LEVEL_ON/OFF` → "Pengukuran Sound Level (Noise ON/OFF)" (LK BSC rows "Noise ON/OFF").
- `LAF_SOUND_LEVEL_*` → "Pengukuran Sound Level (Background)" / "(Didalam Kompartemen)".
- `DXRAY_HVL_70KV/80KV` → "Pengujian Half Value Layer (HVL) (70/80 kV)".
- `DUNIT_ILLUMINANCE` → "Illuminance (Jarak 70 cm)".

---

## Ambiguous / left for human decision — NOT guessed

| rows | note |
|---|---|
| `CENTRIFUGE_REFRIGERATOR` `CRFR_SPEED`, `CRFR_TIME`, `CRFR_STORAGE_TEMP` | No `LK Centrifuge Refrigerator` document. Rotation names applied by analogy to LK Centrifuge; storage-temp name by analogy to the Batch-3 cold-storage treatment. Flag for confirmation. |
| `PLT_STORAGE_TEMP`, `CRFR_STORAGE_TEMP` (+ the Batch-3 `*_STORAGE_TEMP` and Batch-2 `OVEN_TEMP`/`STER_TEMP`) | LK Platelet Agitator / cold-chain / oven docs have **no titled parameter** — bare T1–T9 uniformity table. Named in consistent LK-style Indonesian ("Keseragaman Suhu Penyimpanan (multi-titik T1–T9…)"). Flag. |
| `LARYN_INTENSITY` tolerance `40.000 – 160.000 lux` | Pre-existing FLAG in the seed header (possible copy-paste from Lampu Operasi) — **out of this task's scope** (`name` only), noted for continuity. |

---

## Step 3.5 — Final sweep (whole catalogue)

Swept all 4 tables for names still in plain English without an LK justification.

| table | result |
|---|---|
| `DeviceCategory` (13) | 100% aligned (Phase 1) |
| `DeviceCapability` (30) | 100% aligned (Phase 1) |
| `DeviceCapabilityItem` (98) | **85 aligned. 13 not changed:** 6 intentional (LK's own English: `HEART_RATE`, `MAXIMUM_VACUUM`, `PULSE_DURATION`, `COLOR_TEMPERATURE`, `COLOR_RENDERING_INDEX`, `OVERSHOOT_TEMPERATURE` [LK typo, kept correct English]) + **7 orphan items — see below**. |
| `DeviceCalibrationParameter` (489) | **473 aligned. 16 not changed:** all intentional (4× `_HEART_RATE`, 4× `_CCT`, 4× `_CRI`, 2× `_MAX_VACUUM`, `INCU_OVERSHOOT_TEMP`, `EST_PULSE_DURATION`). |

### Leftover — needs a follow-up (NOT part of any batch's scope)

**7 orphan `DeviceCapabilityItem` rows** in capabilities `ULTRASOUND_IMAGING` (AXIAL_LATERAL_RESOLUTION,
DEAD_ZONE_TEST, HORIZONTAL_DISTANCE_CALIBRATION, PENETRATION_DEPTH, VERTICAL_DISTANCE_CALIBRATION)
and `MASS_WEIGHING` (DEVIATION_FROM_NOMINAL, REPEATABILITY) still have English names. These
capabilities have **0 `DeviceCalibrationParameter` rows and no `DeviceType`** using them — their
would-be device types (Ultrasonograph/USG, Timbangan Bayi/Dewasa) were never seeded, so they
fell outside every batch's category scope. Decision needed: align their names from
`LK Ultrasonograph (USG).pdf` / `LK Timbangan *.pdf`, or delete the orphan items. Not touched here.

**Aside from those 7 orphans, the catalogue is 100% aligned.**

---

## Step 2 — Seed sync

| file | change |
|---|---|
| `seed-device-capabilities.ts` | 29 `ITEMS[].name` (two `LIGHT_INTENSITY` rows disambiguated by hand — different capabilities) |
| `seed-device-calibration-parameters.ts` | 0 (all 16 batch-4 device types are extension) |
| `seed-device-taxonomy-extension-parameters.ts` | 48 explicit `t(...)` names; all 16 remaining `envElec(...)` calls → `envElecID(...)`; **dead `envElec()` helper removed** (no callers left — every extension device type now uses `envElecID`). |

Re-ran all three seeds → **0 drift** vs. the applied DB state (exact 29 + 160 changes, nothing
else). Full reseed from scratch also produced 0 drift.

---

## Step 3 — Verification

| check | result |
|---|---|
| `DeviceCapabilityItem` count | 98 → 98 |
| `DeviceCalibrationParameter` count | 489 → 489 |
| non-`name` fields on touched rows | **0 changes** (full dump diff) |
| Pattern-C split rows (Dental Unit / Dental X-Ray / BSC / LAF) | structure unchanged — only `name` |
| rows outside Batch-4 categories | **0 touched** |
| seed re-run drift vs DB | 0 |
| `pnpm turbo run build` | ✅ 5/5 |
| `pnpm turbo run typecheck` | ✅ 10/10 (run after `build`; a bare `typecheck` first shows stale `apps/tech-pwa/.next/types` TS6053 errors that clear once `build` regenerates them — pre-existing, unrelated) |
| `prettier --check` | 2 param seed files clean; `seed-device-capabilities.ts` keeps the pre-existing CRLF style warning |

## Files changed

- `packages/db/prisma/seed-device-capabilities.ts`
- `packages/db/prisma/seed-device-taxonomy-extension-parameters.ts`

---

## Grand total — Phase 1 → Batch 4 (vs. original baseline)

| table | rows changed | rows unchanged | reason unchanged |
|---|---|---|---|
| `DeviceCategory` | **13 / 13** | 0 | — |
| `DeviceCapability` | **30 / 30** | 0 | — |
| `DeviceCapabilityItem` | **85 / 98** | 13 | 6 intentional (LK English) + 7 orphan items (no device type / params — follow-up) |
| `DeviceCalibrationParameter` | **473 / 489** | 16 | all intentional (LK writes them in English) |

Row counts never changed at any step (13 / 30 / 98 / 489). No `code`, tolerance, `uomId`,
`valueType`, FK, schema, or migration was touched in any batch. `SUCT_MAX_VACUUM` structure
confirmed untouched (Batch 3). No application code branches on any of these `name` values
(Ventilator follow-up, retroactive check — CLEAN).
