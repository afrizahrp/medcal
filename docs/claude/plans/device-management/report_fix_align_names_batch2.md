# Report: Align Item & Parameter Names with LK Source — Batch 2 of 4

**Date:** 2026-08-27
**Scope:** `name` only, on `DeviceCapabilityItem` + `DeviceCalibrationParameter`, restricted to
device types in **4 categories: Neonatal & Infant Care, Temperature Therapy, Sterilization,
Patient Care**. No `code` / tolerance / `uomId` / `valueType` / FK / schema changes.
`DeviceCategory` / `DeviceCapability` untouched (Phase 1). Batches 1/3/4 untouched.

---

## Step 0 — Target DB & scope

**Connection:** `postgresql://postgres:***@localhost:5432/pkmdb?schema=public`
(`d:/medcal/.env` line 2 — local native `pkmdb`). Not Docker/staging/prod.

**Device types in scope (12), by category:**

| category | device type | param rows |
|---|---|---|
| Neonatal & Infant Care | BABY_INCUBATOR | 14 |
| | INFANT_WARMER | 9 |
| | PHOTOTHERAPY | 8 |
| | RADIANT_WARMER | 9 |
| Temperature Therapy | BLANKET_WARMER | 9 |
| | **PARAFFIN_BATHS** | **0** |
| | **RADIANT_WARMERS_ADULT** | **0** |
| Sterilization | AUTOCLAVE | 14 (post Pattern-C split) |
| | OVEN | 8 |
| | STERILLIZER | 8 |
| Patient Care | ELECTRIC_BEDS | 7 (env + electrical only) |
| | ELECTRO_ACCUPUNTURE | 11 |

**Temperature Therapy confirmation:** `PARAFFIN_BATHS` and `RADIANT_WARMERS_ADULT` have **0**
`DeviceCalibrationParameter` rows and no LK document — matches the known gap
(`Rangkuman_Gap_Konfirmasi_User.md` item A2). Not a failure; nothing to do for those two.
`BLANKET_WARMER` (the third TT type) does have an LK and was processed.

**Electric Beds confirmation:** only the 7 universal env + electrical-safety rows, no
device-specific performance item — as expected. Those 7 params were aligned here (Batch 1
only touched Batch-1 device types).

**Baseline (unchanged before → after):** `DeviceCapabilityItem` 98, `DeviceCalibrationParameter` 489.

**LK sources** (`docs/technician-docs/`, text extracts): LK Kelistrikan (shared env/electrical
block), LK Baby Incubator, LK Infant Warmer, LK Blanket Warmer, LK Autoclave, LK Sterilisator,
LK Oven, LK Phototherapy, LK Electro Accupunture (EST).

---

## Step 1 — Changes

### DeviceCapabilityItem — 16 rows (global, each fixed once)

| capability | code | before | after | LK source term |
|---|---|---|---|---|
| TEMPERATURE_CHAMBER_STERILIZATION | CHAMBER_TEMPERATURE | Chamber Temperature | Suhu Chamber | LK Autoclave §"Suhu Chamber" |
| TEMPERATURE_CHAMBER_STERILIZATION | STERILIZATION_TEMPERATURE | Sterilization Temperature | Suhu Sterilisasi | LK Autoclave §"Suhu Sterilisasi" |
| TEMPERATURE_CHAMBER_STERILIZATION | STERILIZATION_TIME | Sterilization Time | Waktu Sterilisasi | LK Autoclave §"Waktu Sterilisasi" |
| INCUBATOR_ENVIRONMENT | AIR_TEMPERATURE_CALIBRATION | Air Temperature Calibration | Kalibrasi Pengontrol Suhu dan Keseragaman Suhu Inkubator | LK Baby Incubator §"Kalibrasi Pengontrol Suhu dan Keseragaman Suhu Inkubator" |
| INCUBATOR_ENVIRONMENT | AIR_VELOCITY | Air Velocity | Kecepatan Udara Dalam Kompartemen | LK Baby Incubator row "Kecepatan Udara Dalam Kompartemen" |
| INCUBATOR_ENVIRONMENT | MATTRESS_TEMPERATURE | Mattress Temperature | Suhu Matras | LK Baby Incubator row "Suhu Matras" |
| INCUBATOR_ENVIRONMENT | NOISE_LEVEL | Noise Level | Kebisingan Kompartemen | LK Baby Incubator row "Kebisingan Kompartemen" |
| INCUBATOR_ENVIRONMENT | SKIN_TEMPERATURE_SENSOR | Skin Temperature Sensor Calibration | Kalibrasi Sensor Suhu Kulit | LK Baby Incubator §"Kalibrasi Sensor Suhu Kulit" |
| INCUBATOR_ENVIRONMENT | TEMPERATURE_RECOVERY_TIME | Temperature Recovery Time | Waktu Pemulihan Lonjakan Suhu | LK Baby Incubator §title "…Waktu Pemulihan Lonjakan Suhu…" |
| WARMER_SURFACE_TEMPERATURE | HIGH_TEMP_PROTECTION | High Temperature Protection | Pengujian Proteksi Suhu Tinggi | LK Blanket Warmer §"Pengujian proteksi suhu tinggi" |
| WARMER_SURFACE_TEMPERATURE | MAX_MATTRESS_SURFACE_TEMPERATURE | Maximum Mattress Surface Temperature | Kalibrasi Suhu Maksimum pada Permukaan Matras | LK Infant Warmer §"Kalibrasi suhu maksimum pada permukaan matras" |
| WARMER_SURFACE_TEMPERATURE | WARMER_TEMPERATURE_CALIBRATION | Temperature Calibration | Kalibrasi Suhu | LK Infant Warmer / Blanket Warmer §"Kalibrasi suhu" |
| ELECTROTHERAPY_STIMULATION | STIMULATION_FREQUENCY | Stimulation Frequency | Frekuensi | LK EST §"Frekuensi" |
| ELECTROTHERAPY_STIMULATION | STIMULATION_INTENSITY | Stimulation Intensity | Intensitas Terapi | LK EST §"Intensitas Terapi" |
| ELECTROTHERAPY_STIMULATION | TREATMENT_TIMER | Treatment Timer | Waktu | LK EST §"Waktu" *(terse — see review list)* |
| SPECTRAL_IRRADIANCE | SPECTRAL_IRRADIANCE_ACCURACY | Spectral Irradiance Accuracy | Pengujian Keluaran Spectral Irradiance | LK Phototherapy §"Pengujian Keluaran Spectral Irradiance" (LK keeps "Spectral Irradiance" in English) |

**Kept as-is (matches LK's own English term):**
`ELECTROTHERAPY_STIMULATION / PULSE_DURATION` = "Pulse Duration" (LK EST writes "Pulse Duration").

### DeviceCalibrationParameter — 95 rows

Device types touched: AUTOCLAVE, BABY_INCUBATOR, BLANKET_WARMER, ELECTRIC_BEDS,
ELECTRO_ACCUPUNTURE, INFANT_WARMER, OVEN, PHOTOTHERAPY, RADIANT_WARMER, STERILLIZER.

- **env/electrical rows** (all 10 device types) → the 7 finalised Batch-1 terms
  (Suhu Ruangan / Kelembaban / RH / Tegangan Input / Resistansi Pembumian Protektif /
  Resistansi Isolasi / Arus Bocor Peralatan / Arus Bocor Bagian yang Diaplikasikan).
- **Autoclave split rows** (from the Pattern-C fix — verified against current DB, not the old
  structure):
  | code | before | after |
  |---|---|---|
  | ACLV_CHAMBER_TEMP_DT1 | Chamber Temperature Difference ΔT1 (S1 – S2) | Suhu Chamber ΔT1 (S1 – S2) |
  | ACLV_CHAMBER_TEMP_DT2 | Chamber Temperature Difference ΔT2 (S1 – S3) | Suhu Chamber ΔT2 (S1 – S3) |
  | ACLV_CHAMBER_TEMP_DT3 | Chamber Temperature Difference ΔT3 (S1 – S3) | Suhu Chamber ΔT3 (S1 – S3) |
  | ACLV_STER_TEMP_121 | Sterilization Temperature (121 °C cycle) | Suhu Sterilisasi (siklus 121 °C) |
  | ACLV_STER_TEMP_134 | Sterilization Temperature (134 °C cycle) | Suhu Sterilisasi (siklus 134 °C) |
  | ACLV_STER_TIME_121 | Sterilization Time (121 °C cycle) | Waktu Sterilisasi (siklus 121 °C) |
  | ACLV_STER_TIME_134 | Sterilization Time (134 °C cycle) | Waktu Sterilisasi (siklus 134 °C) |
  (source: LK Autoclave — "Suhu Chamber" table with ΔT1 = S1–S2, ΔT2/ΔT3 = S1–S3;
  "Suhu Sterilisasi" 121/134 rows; "Waktu Sterilisasi" 121 °C/134 °C rows.)
- **device-specific perf rows** → mirror their item name above (INCU_AIR_TEMP,
  INCU_AIR_VELOCITY, INCU_MATTRESS_TEMP, INCU_NOISE_LEVEL, INCU_RECOVERY_TIME,
  INCU_SKIN_TEMP_SENSOR, IW/RW_MAX_MATTRESS_TEMP, IW/RW/BLNW_TEMP_CALIBRATION, BLNW_HIGH_TEMP,
  PHOTO_IRRADIANCE, EST_FREQUENCY, EST_INTENSITY, EST_TIMER).

Full 95-row before→after table: `scratchpad/batch2_tables.md`.

**RADIANT_WARMER:** no dedicated LK doc — names applied by analogy to LK Infant Warmer (same
capability items, identical tolerances).

---

## Ambiguous / left for human decision — NOT guessed

| rows | note |
|---|---|
| `INCUBATOR_ENVIRONMENT / OVERSHOOT_TEMPERATURE` + `INCU_OVERSHOOT_TEMP` | **Left unchanged** ("Overshoot Temperature"). LK Baby Incubator writes it "Overshot Temperature" (misspelling) — kept the correct English spelling rather than propagate the typo. |
| `ELECTROTHERAPY_STIMULATION / TREATMENT_TIMER` + `EST_TIMER` → "Waktu" | LK EST section header is literally just "Waktu". Applied verbatim, but very terse for a timer test — confirm vs. e.g. "Waktu Terapi". |
| `OVEN_TEMP` → "Suhu Pengeringan/Sterilisasi (multi-titik T1–T9)"; `STER_TEMP` → "Suhu Sterilisasi (multi-titik T1–T9)" | LK Oven / LK Sterilisator have **no titled parameter** — just an unlabelled T1–T9 temperature-uniformity table. Named in consistent LK-style Indonesian (not a free guess), flagged for confirmation. |
| `EXPIRATORY_TIME` "Expiratori" / `PEEP` "exipiratory" (Batch 1 Ventilator) | already noted in the Ventilator follow-up report — unrelated to this batch, listed here only for continuity. |

---

## Step 2 — Seed sync

| file | change |
|---|---|
| `seed-device-capabilities.ts` | 16 `ITEMS[].name` |
| `seed-device-calibration-parameters.ts` | 54 `PARAMETERS[].name` (BABY_INCUBATOR, INFANT_WARMER, RADIANT_WARMER, ELECTRIC_BEDS, OVEN, STERILLIZER) |
| `seed-device-taxonomy-extension-parameters.ts` | 13 explicit `t(...)` names (ACLV split rows, BLNW_HIGH_TEMP, BLNW_TEMP_CALIBRATION, EST_FREQUENCY/INTENSITY/TIMER, PHOTO_IRRADIANCE) + **new `envElecID()` helper** (LK-Indonesian twin of `envElec()`); the `AUTOCLAVE`, `ELECTRO_ACCUPUNTURE`, `PHOTOTHERAPY`, `BLANKET_WARMER` `envElec(...)` spreads switched to `envElecID(...)`. `envElec()` (English) still used by not-yet-processed device types. Extension row count unchanged (247). |

Re-ran all three seeds → post-seed DB dump vs. pre-seed: **0 drift** (exactly the 16 + 95
changes reproduced, nothing else). Counts after reseed: items 98, params 489 (242 + 247).

---

## Step 3 — Verification

| check | result |
|---|---|
| `DeviceCapabilityItem` count | 98 → 98 |
| `DeviceCalibrationParameter` count | 489 → 489 (already includes the +8 Pattern-C split) |
| non-`name` fields on touched rows | **0 changes** (full dump diff) |
| rows outside Batch-2 categories | **0 touched** — all 10 changed device types verified in Neonatal & Infant Care / Temperature Therapy / Sterilization / Patient Care |
| seed re-run drift vs DB | 0 |
| `pnpm turbo run typecheck` | ✅ 10/10 |
| `pnpm turbo run build` | ✅ 5/5 |
| `prettier --check` | 2 param seed files clean; `seed-device-capabilities.ts` keeps the same pre-existing CRLF warning noted in Phase 1 |

## Files changed

- `packages/db/prisma/seed-device-capabilities.ts`
- `packages/db/prisma/seed-device-calibration-parameters.ts`
- `packages/db/prisma/seed-device-taxonomy-extension-parameters.ts`

## Remaining

Batch 3 & 4: Cold Chain & Storage, Suction & Fluid Management, Laboratory & Diagnostic,
Dental Equipment, Medical Lighting, Audiology & Physiological Testing.
