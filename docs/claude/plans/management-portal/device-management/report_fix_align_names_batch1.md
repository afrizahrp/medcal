# Report: Align Item & Parameter Names with LK Source — Batch 1 of 4

**Date:** 2026-08-27
**Scope:** `name` field only, on `DeviceCapabilityItem` and `DeviceCalibrationParameter`,
restricted to device types in **3 categories: Patient Monitoring, Respiratory & Oxygen,
Resuscitation**. No `code` / tolerance / `uomId` / `valueType` / `deviceTypeId` /
`capabilityItemId` / schema changes. `DeviceCategory` & `DeviceCapability` untouched (done in
Phase 1). Batches 2–4 (other categories) not touched.

---

## Step 0 — Target DB & scope

**Connection:** `postgresql://postgres:***@localhost:5432/pkmdb?schema=public`
(`d:/medcal/.env` line 2 — local native `pkmdb`). Not Docker/staging/prod.

**Batch-1 device types (20, resolved via `DeviceType.category` relation):**

| category | device types |
|---|---|
| Patient Monitoring | AMBULATORY_ECG, BED_SIDE_MONITOR, BLOOD_PRESSURE_MONITOR, CARDIAC_OUTPUT_UNITS, ELECTROCARDIOGRAPHS, OXYMETER_MONITOR, PATIENT_MONITOR, PULSE_OXIMETERS, SPHYGMOMANOMETERS |
| Respiratory & Oxygen | CPAP, FLOW_METER, HUMIDIFIER, NEBULIZER_COMPRESSOR, OXYGEN_AIR_PROPORTIONERS, OXYGEN_CONCENTRATORS, REGULATORS_AIR_O2_SUCTION, ULTRASONIC_NEBULIZERS, VENTILATOR |
| Resuscitation | RESUSCITATORS_CARDIAC, RESUSCITATORS_PULMONARY |

Of these, **16** actually have `DeviceCalibrationParameter` rows (146 rows total in scope).
The 4 with no parameter rows (AMBULATORY_ECG, CARDIAC_OUTPUT_UNITS, OXYGEN_AIR_PROPORTIONERS,
REGULATORS_AIR_O2_SUCTION) needed no work.

**Baseline (unchanged before → after):** `DeviceCapabilityItem` 98, `DeviceCalibrationParameter` 489.

**LK sources used** (`docs/technician-docs/`, re-extracted to text):
LK Kelistrikan (shared electrical-safety + environmental block, embedded in every LK),
LK Bed Side Monitor, LK Blood Pressure Monitor, LK Sphygmomanometer, LK Electrocardiograph,
LK Pulse Oxymeter, LK CPAP, LK Humidifier, LK Nebulizer Compressor, LK Nebulizer Ultrasonic,
LK Oksigen Concentrator, LK Flow Meter, LK Resusitator Paru dan Neopuff.

---

## Step 1 — Changes applied

### DeviceCapabilityItem — 26 rows changed (global rows; each fixed once)

| capability | code | before | after | LK source term |
|---|---|---|---|---|
| ENVIRONMENTAL_CONDITIONS | ROOM_TEMPERATURE | Room Temperature | Suhu Ruangan | LK Kelistrikan §"Pengukuran Kondisi Lingkungan" → "Kondisi Ruangan / Suhu" |
| ENVIRONMENTAL_CONDITIONS | ROOM_HUMIDITY | Room Relative Humidity | Kelembaban / RH | same §, row "Kelembaban / RH (%)" |
| ENVIRONMENTAL_CONDITIONS | INPUT_VOLTAGE | Input Voltage (L-N/L-G/N-G) | Tegangan Input (L-N/L-G/N-G) | same §, row "Tegangan Input" (L-N/L-G/N-G) |
| ELECTRICAL_SAFETY | PROTECTIVE_EARTH_RESISTANCE | Protective Earth Resistance | Resistansi Pembumian Protektif | LK Kelistrikan §"Pengujian Kinerja" row 1 |
| ELECTRICAL_SAFETY | INSULATION_RESISTANCE | Insulation Resistance | Resistansi Isolasi | same §, row 2 |
| ELECTRICAL_SAFETY | EQUIPMENT_LEAKAGE_CURRENT | Equipment Leakage Current | Arus Bocor Peralatan | same §, row 3 "Arus Bocor Peralatan" |
| ELECTRICAL_SAFETY | APPLIED_PART_LEAKAGE_CURRENT | Applied Part Leakage Current | Arus Bocor Bagian yang Diaplikasikan | same §, row 4 "Arus bocor bagian yang diaplikasikan" |
| NIBP | SYSTOLIC_PRESSURE | Systolic Pressure | Systole | LK Blood Pressure Monitor §"Kalibrasi NIBP" row "Systole" |
| NIBP | DIASTOLIC_PRESSURE | Diastolic Pressure | Diastole | same §, row "Diastole" |
| NIBP | MEAN_ARTERIAL_PRESSURE | Mean Arterial Pressure | Mean | same §, row "Mean" *(see review list)* |
| NIBP_LEAK_TEST | CUFF_LEAK_TEST | Cuff/Manometer Leak Test | Uji Kebocoran | LK Sphygmomanometer §"Uji kebocoran" |
| NIBP_LEAK_TEST | RAPID_DEFLATION_RATE | Rapid Deflation Rate | Laju Buang Cepat | same doc §"Laju buang cepat" |
| NIBP_LEAK_TEST | PRESSURE_READING_ACCURACY | Pressure Reading Accuracy | Pengukuran Akurasi Tekanan | same doc §"Pengukuran akurasi tekanan" |
| ECG_PERFORMANCE | AMPLITUDE_ACCURACY | Amplitude Accuracy | Pengukuran Amplitudo | LK Electrocardiograph §"Pengukuran Amplitudo" |
| ECG_PERFORMANCE | RECORDING_SPEED | Recording/Paper Speed | Laju Rekaman | same doc §"Laju Rekaman" |
| ECG_PERFORMANCE | ECG_HEART_RATE_CALIBRATION | Heart Rate Calibration | Kalibrasi Detak Jantung | same doc §"Kalibrasi Detak Jantung" (this LK uses Indonesian, unlike Bed Side Monitor) |
| ECG_PERFORMANCE | SINUSOIDAL_SIGNAL_TEST | Sinusoidal Signal Test | Uji Sinyal Sinusoida | same doc §"Uji Sinyal Sinusoida" |
| ECG_PERFORMANCE | NORMAL_ECG_SIGNAL_TEST | Normal ECG Signal Test | Uji Sinyal EKG Normal | same doc §"Uji Sinyal EKG Normal" |
| VITAL_SIGNS_MONITORING | RESPIRATION_RATE | Respiration Rate | Respirasi | LK Bed Side Monitor §"Kalibrasi Respirasi" |
| VITAL_SIGNS_MONITORING | SPO2_ACCURACY | SpO2 Accuracy | Saturasi Oxygen (SPO2) | LK Bed Side Monitor / Pulse Oxymeter §"Kalibrasi Saturasi Oxygen (SPO2)" |
| GAS_FLOW_RATE | FLOW_RATE_ACCURACY | Flow Rate Accuracy | Laju Aliran Gas | LK CPAP "Laju Aliran" / Flow Meter "Flow / Laju aliran" / Nebulizer "Laju aliran gas" / O2 Concentrator "Laju aliran gas flowmeter" |
| HUMIDIFIER_TEMPERATURE | TEMPERATURE_ACCURACY | Temperature Accuracy | Akurasi Suhu | LK Humidifier §"Akurasi Suhu" |
| HUMIDIFIER_TEMPERATURE | MAXIMUM_TEMPERATURE | Maximum Temperature | Suhu Maksimum | LK Humidifier §"Suhu Maksimum" |
| OXYGEN_CONCENTRATION | OXYGEN_CONCENTRATION_ACCURACY | Oxygen Concentration Accuracy | Konsentrasi Oksigen | LK CPAP §"Pengukuran Konsentrasi Oksigen" / LK O2 Concentrator §"Konsentrasi Oksigen" |
| RESUSCITATOR_PRESSURE | MAX_PRESSURE | Maximum Pressure | Nilai Tekanan Maksimum | LK Resusitator Paru dan Neopuff §"nilai tekanan maksimum" |
| RESUSCITATOR_PRESSURE | PRESSURE_ACCURACY | Pressure Accuracy | Kalibrasi Akurasi Tekanan Resuscitator | same doc §"Kalibrasi akurasi tekanan resuscitator" |

**Kept as-is (already matches LK's own English term):**
`VITAL_SIGNS_MONITORING / HEART_RATE` = "Heart Rate" (LK Bed Side Monitor & Pulse Oxymeter
both write "Kalibrasi Heart Rate").

### DeviceCalibrationParameter — 133 rows changed

All are batch-1 device-type rows whose `name` mirrored an item name above; each was set to the
same LK-aligned value. Device types touched: BED_SIDE_MONITOR, BLOOD_PRESSURE_MONITOR, CPAP,
ELECTROCARDIOGRAPHS, FLOW_METER, HUMIDIFIER, NEBULIZER_COMPRESSOR, OXYGEN_CONCENTRATORS,
OXYMETER_MONITOR, PATIENT_MONITOR, PULSE_OXIMETERS, RESUSCITATORS_CARDIAC,
RESUSCITATORS_PULMONARY, SPHYGMOMANOMETERS, ULTRASONIC_NEBULIZERS, VENTILATOR (env/elec only).

Full 133-row before→after table: see `scratchpad/batch1_tables.md` (attached below in summary
form). Pattern:
- env/electrical rows → the 7 LK Kelistrikan terms above (param name uses "Tegangan Input"
  without the L-N/L-G/N-G suffix, matching the LK row label and the existing param style).
- NIBP rows → Systole / Diastole / Mean.
- ECG performance rows → Pengukuran Amplitudo / Laju Rekaman / Kalibrasi Detak Jantung /
  Uji Sinyal Sinusoida / Uji Sinyal EKG Normal.
- Vital-signs rows → Respirasi / Saturasi Oxygen (SPO2); Heart Rate kept.
- Gas-flow rows ("Gas Flow Rate Accuracy") → Laju Aliran Gas.
- Humidifier → Akurasi Suhu / Suhu Maksimum. O2 concentration → Konsentrasi Oksigen.
- Resuscitator → Nilai Tekanan Maksimum / Kalibrasi Akurasi Tekanan Resuscitator.

**OXYMETER_MONITOR / PATIENT_MONITOR** have no dedicated LK doc; their rows are the same
measurements as Bed Side Monitor / Pulse Oxymeter and were aligned to those LK terms by direct
analogy (same capability items, same tolerances).

---

## Ambiguous / left for human decision — NOT guessed

| rows | reason |
|---|---|
| `VENTILATOR` performance params `VENT_TIDAL_VOLUME`, `VENT_MINUTE_VOLUME`, `VENT_RESP_RATE`, `VENT_INSP_TIME`, `VENT_EXP_TIME`, `VENT_PPEAK`, `VENT_PEEP`, `VENT_FIO2`, `VENT_IE_RATIO` and the 9 `VENTILATION_PERFORMANCE` capability items | **No `LK Ventilator` document exists in `docs/technician-docs/`.** The original seed cited "LK Ventilator Transport.pdf" which is not present. Names left in English pending the source doc. (VENTILATOR env/electrical rows *were* aligned — those come from the universal LK Kelistrikan block.) |
| `NIBP / MEAN_ARTERIAL_PRESSURE` → "Mean" | LK Blood Pressure Monitor literally labels the row "Mean". Applied verbatim per the "match the source, don't translate" rule, but "Mean" as a standalone display name is thin — flag for a human to confirm vs. e.g. "Mean (MAP)" / "Tekanan Arteri Rata-rata". |

---

## Step 2 — Seed script sync

| file | change |
|---|---|
| `seed-device-capabilities.ts` | 26 `ITEMS[].name` values |
| `seed-device-calibration-parameters.ts` | 124 `PARAMETERS[].name` values (original-catalog rows) |
| `seed-device-taxonomy-extension-parameters.ts` | CPAP's `...envElec("CPAP", …)` spread replaced with 7 explicit `t(...)` rows carrying the LK-Indonesian names + `CPAP_CONCENTRATION` / `CPAP_FLOW_RATE` names. `envElec` helper itself left unchanged so other device types keep English until their batch. Row count unchanged (7→7). |

Re-ran all three seeds as verification → post-seed DB dump vs. pre-seed DB dump: **0 drift**
(seed output exactly reproduces the current DB). Counts after reseed: items 98,
params 489 (242 original + 247 extension).

---

## Step 3 — Verification

| check | result |
|---|---|
| `DeviceCapabilityItem` count | 98 → 98 |
| `DeviceCalibrationParameter` count | 489 → 489 |
| non-`name` fields on touched rows (code, tolerance, uom, valueType, FKs) | **0 changes** (full dump diff) |
| rows outside batch-1 categories | **0 touched** — all 16 changed device types verified within Patient Monitoring / Respiratory & Oxygen / Resuscitation |
| seed re-run drift vs DB | 0 |
| `pnpm turbo run typecheck` | ✅ 10/10 |
| `pnpm turbo run build` | ✅ 5/5 |
| `prettier --check` | 2 param files clean; `seed-device-capabilities.ts` has the same pre-existing CRLF style warning as Phase 1 (not introduced here) |
| lint | project lint scripts are stubs (no linter wired) |

---

## Files changed (Batch 1)

- `packages/db/prisma/seed-device-capabilities.ts`
- `packages/db/prisma/seed-device-calibration-parameters.ts`
- `packages/db/prisma/seed-device-taxonomy-extension-parameters.ts`

No new one-time script (all changes are `name`-only and carried by the existing idempotent
seeds' `upsert.update`).

## Remaining

Batches 2–4: `Neonatal & Infant Care` + `Temperature Therapy`; `Sterilization` + `Suction &
Fluid Management` + `Cold Chain & Storage`; `Laboratory & Diagnostic` + `Dental` + `Medical
Lighting` + `Audiology & Physiological`. Plus: obtain/confirm an LK Ventilator source to
resolve the VENTILATOR performance-parameter names.
