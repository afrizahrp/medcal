# Report: Align Item & Parameter Names with LK Source — Batch 3 of 4

**Date:** 2026-08-27
**Scope:** `name` only, on `DeviceCapabilityItem` + `DeviceCalibrationParameter`, restricted to
device types in **2 categories: Suction & Fluid Management, Cold Chain & Storage**. No `code` /
tolerance / `uomId` / `valueType` / FK / schema changes. `DeviceCategory` / `DeviceCapability`
untouched (Phase 1). Batches 1/2/4 untouched.

---

## Step 0 — Target DB & scope

**Connection:** `postgresql://postgres:***@localhost:5432/pkmdb?schema=public`
(`d:/medcal/.env` line 2 — local native `pkmdb`). Not Docker/staging/prod.

**Device types in scope (11), by category:**

| category | device type | param rows |
|---|---|---|
| Suction & Fluid Management | **ASPIRATORS_SUCTION** | **0** |
| | BREAST_PUMPS | 10 |
| | INFUSION_PUMP | 9 |
| | **REGULATORS_LOW_VOLUME_SUCTION** | **0** |
| | SUCTION_PUMP | 10 |
| | SYRINGE_PUMP | 9 |
| Cold Chain & Storage | BLOOD_BANK_REFRIGERATORS | 8 |
| | COALD_CHAIN | 8 |
| | KULKAS_VAKSIN | 8 |
| | MEDICAL_FREEZER | 8 |
| | MEDICAL_REFRIGERATOR | 8 |

**Empty-as-expected confirmation:** `ASPIRATORS_SUCTION` and `REGULATORS_LOW_VOLUME_SUCTION`
have **0** `DeviceCalibrationParameter` rows and no LK document — matches the known gap A2
(`Rangkuman_Gap_Konfirmasi_User.md`), same situation as Paraffin Baths / Radiant Warmers Adult
in Batch 2. Not a failure; nothing to do.

**Shared-source confirmation:** `BREAST_PUMPS` and `SUCTION_PUMP` both derive from
`LK Suction Pump.docx` — their parameter names are deliberately near-identical, not an error.
Same for `INFUSION_PUMP` / `SYRINGE_PUMP` (LK Infusion Pump / LK Syringe Pump, identical
performance sections).

**`SUCT_MAX_VACUUM` — structure NOT changed.** Verified byte-for-byte identical before/after:
`name = "Maximum Vacuum"` (LK writes it in English — no rename needed either),
`toleranceMin = null`, `toleranceMax = null`,
`toleranceNote = "Low Vacuum < 150 mmHg; Medium Vacuum 150 mmHg – 450 mmHg; High Vacuum ˃ 450 mmHg. *isi salah satu sesuai dengan UUT"`.
Still one row. `BREASTP_MAX_VACUUM` likewise left as "Maximum Vacuum".

**Baseline (unchanged before → after):** `DeviceCapabilityItem` 98, `DeviceCalibrationParameter` 489.

**LK sources:** LK Kelistrikan (shared env/electrical), LK Suction Pump, LK Infusion Pump,
LK Syringe Pump, LK Blood Bank Refrigerator, LK Medical Refrigerator, LK Medical Freezer,
LK Cold Chain / Vaccine Refrigerator.

---

## Step 1 — Changes

### DeviceCapabilityItem — 5 rows (global)

| capability | code | before | after | LK source term |
|---|---|---|---|---|
| VACUUM_SUCTION | VACUUM_GAUGE_ACCURACY | Vacuum Gauge Accuracy | Akurasi Vacuum Gauge | LK Suction Pump §"Akurasi Vacuum Gauge" |
| VACUUM_SUCTION | TIME_TO_MAX_VACUUM | Time to Maximum Vacuum | Waktu Yang Dibutuhkan Saat Daya Hisap Maksimum | LK Suction Pump §"Waktu Yang Dibutuhkan Saat Daya Hisap Maksimum" |
| INFUSION_FLOW | FLOW_RATE_CALIBRATION | Flow Rate Calibration | Kalibrasi Laju Aliran | LK Infusion/Syringe Pump §"Kalibrasi Laju aliran" |
| INFUSION_FLOW | OCCLUSION_TEST | Occlusion Test | Pengujian Occlusion/Pemampatan | LK Infusion/Syringe Pump §"Pengujian Occlusion/Pemampatan" |
| TEMPERATURE_COLD_STORAGE | STORAGE_TEMPERATURE_UNIFORMITY | Storage Temperature Uniformity (Multi-Point) | Keseragaman Suhu Penyimpanan (multi-titik T1–T9) | see review list — LK cold-chain docs have no titled parameter |

**Kept as-is (LK's own English term):** `VACUUM_SUCTION / MAXIMUM_VACUUM` = "Maximum Vacuum"
(LK Suction Pump §"Maximum Vacuum").

### DeviceCalibrationParameter — 76 rows

Device types touched: BLOOD_BANK_REFRIGERATORS, BREAST_PUMPS, COALD_CHAIN, INFUSION_PUMP,
KULKAS_VAKSIN, MEDICAL_FREEZER, MEDICAL_REFRIGERATOR, SUCTION_PUMP, SYRINGE_PUMP.

- **env/electrical rows** (all 9) → the 7 finalised Batch-1 terms.
- **VACUUM_SUCTION perf rows** (BREASTP/SUCT `_VACUUM_GAUGE`, `_TIME_MAX_VACUUM`) → "Akurasi
  Vacuum Gauge" / "Waktu Yang Dibutuhkan Saat Daya Hisap Maksimum".
- **INFUSION_FLOW perf rows** (INFUS/SYR `_FLOW_RATE`, `_OCCLUSION`) → "Kalibrasi Laju Aliran" /
  "Pengujian Occlusion/Pemampatan".
- **`*_STORAGE_TEMP`** (5 rows) → "Keseragaman Suhu Penyimpanan (multi-titik T1–T9, …)" with
  the per-device range preserved (2–8 °C for BBR/MREF, 2–10 °C for CCHAIN/KVAK,
  −5 s/d −150 °C for MFRZ).

Full 76-row before→after table: `scratchpad/batch3_tables.md`.

---

## Ambiguous / left for human decision — NOT guessed

| rows | note |
|---|---|
| `TEMPERATURE_COLD_STORAGE / STORAGE_TEMPERATURE_UNIFORMITY` + all 5 `*_STORAGE_TEMP` params | LK Blood Bank / Medical Refrigerator / Medical Freezer / Cold Chain docs have **no titled parameter** — just "Setting suhu X–Y ˚C" + a bare T1–T9 uniformity table + "Variasi suhu". Named in consistent LK-style Indonesian ("Keseragaman Suhu Penyimpanan (multi-titik T1–T9)"), **not a free guess** — same treatment as OVEN_TEMP / STER_TEMP in Batch 2. Flag for confirmation. |

Nothing else ambiguous — all other rows have a direct LK section/row title.

---

## Step 2 — Seed sync

| file | change |
|---|---|
| `seed-device-capabilities.ts` | 5 `ITEMS[].name` |
| `seed-device-calibration-parameters.ts` | 49 `PARAMETERS[].name` (BREAST_PUMPS + all 5 cold-chain device types) |
| `seed-device-taxonomy-extension-parameters.ts` | 6 explicit `t(...)` names (INFUS/SYR `_FLOW_RATE` + `_OCCLUSION`, SUCT `_VACUUM_GAUGE` + `_TIME_MAX_VACUUM`); `INFUSION_PUMP`, `SYRINGE_PUMP`, `SUCTION_PUMP` `envElec(...)` → `envElecID(...)` (the Batch-2 helper, reused — no new helper). Extension row count unchanged (247). |

Re-ran all three seeds → post-seed DB dump vs. pre-seed: **0 drift** (exactly the 5 + 76
changes reproduced, nothing else). Counts: items 98, params 489 (242 + 247).

---

## Step 3 — Verification

| check | result |
|---|---|
| `DeviceCapabilityItem` count | 98 → 98 |
| `DeviceCalibrationParameter` count | 489 → 489 |
| non-`name` fields on touched rows | **0 changes** (full dump diff) |
| **`SUCT_MAX_VACUUM`** | ✅ unchanged — 1 row, name/min/max/note byte-identical (see Step 0) |
| rows outside Batch-3 categories | **0 touched** — all 9 changed device types verified in Suction & Fluid Management / Cold Chain & Storage |
| seed re-run drift vs DB | 0 |
| `pnpm turbo run typecheck` | ✅ 10/10 |
| `pnpm turbo run build` | ✅ 5/5 |
| `prettier --check` | 2 param seed files clean; `seed-device-capabilities.ts` keeps the pre-existing CRLF warning |

## Files changed

- `packages/db/prisma/seed-device-capabilities.ts`
- `packages/db/prisma/seed-device-calibration-parameters.ts`
- `packages/db/prisma/seed-device-taxonomy-extension-parameters.ts`

## Remaining

Batch 4: Laboratory & Diagnostic Equipment, Dental Equipment, Medical Lighting,
Audiology & Physiological Testing.
