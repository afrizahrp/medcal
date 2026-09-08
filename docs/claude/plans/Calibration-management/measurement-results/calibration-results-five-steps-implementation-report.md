# Five-step follow-up — calibration-results evidence applied

**Date:** 2026-09-08
**Database:** local `pkmdb` (localhost). **Not deployed to VPS.**
**Predecessor:** `calibration-results-cross-check.md`

Sequence executed:

1. Cross-check report
2. `decimalPlaces` backfill from real readings (42 types)
3. Small seed patch (`BSM_SPO2` + Audiometer notes)
4. Ventilator `CalibrationTestPoint` seed
5. Catalog extraction for ~20 unscoped Excel types (inventory only)

---

## Step 1 — Cross-check report

Written: `docs/claude/plans/Calibration-management/measurement-results/calibration-results-cross-check.md`

Key facts carried forward: use **Input Data** not Sheet1; 42/51 catalog types have usable Excel; 23/66 files are outside the catalog or identity-corrupt.

---

## Step 2 — `decimalPlaces` backfill

**Script:** `packages/db/prisma/backfill-decimal-places-from-results.ts`  
**Prerequisite this session:** three pending migrations were not yet on `pkmdb` and were applied first (`20260908025128`, `20260908025400`, `20260908072100`) so `CalibrationTestPoint` / `entryStyle` exist.

| Pass | scanned | updated | no evidence (left 0) | already target | reviewed (non-zero) |
|---|---:|---:|---:|---:|---:|
| 1 (before Audiometer split) | 396 | **234** | 81 | 81 | 0 |
| 2 (after split, AUD_KANAN/KIRI) | 398 | **2** | 81 | 81 | 234 |

**Applied family rules (42 DeviceTypes only):**

- `*_EARTH_RESISTANCE` → 3 (`FDOP_EARTH_RESISTANCE` → 4)
- `*_ROOM_TEMP` → 1 · `*_ROOM_HUMIDITY` → 0 · `*_INPUT_VOLTAGE` → 1
- `*_INSULATION_RESISTANCE` → 0 · `*_EQUIP_LEAKAGE` → 1 · `*_APPLIED_LEAKAGE` → 1

**Kinerja overrides (examples):** `INFUS_FLOW_RATE`/`SYR_FLOW_RATE` 3 · `CPAP_*` 2 · `INCU_AIR_TEMP` 2 · `AUD_PURE_TONE_LINEARITY_*` 1 · logger `*_STORAGE_TEMP` / `OVEN_TEMP` / `STER_TEMP` 1.

The old convention script `backfill-decimal-places.ts` was **not** run.

**Gap:** 81 NUMBER rows in those 42 types still have no cell-level evidence (Pattern A kinerja we did not map, plus `AUD_FREQUENCY_RESPONSE_*`). They stay at placeholder 0.

---

## Step 3 — Small seed patch

`packages/db/prisma/seed-calibration-test-points.ts`:

- `BSM_SPO2`: 7 → **8** points, duplicated 90, labels `90 %SpO2 (titik N)` (matches Pulse Ox + filled BSM Excel).
- `AUD_FREQUENCY_RESPONSE_KANAN/KIRI`: **notes only** — filled Audiometer.xlsx has linearity I–III, not the Hz table. Sweep 250/500/6000/8000 **kept**, marked unverified.

Also ran `fix-collapsed-audiometer-parameters.ts` on this `pkmdb` (it had not been applied here): 489→493 rows, 489→491 active.

---

## Step 4 — Ventilator test points

New Pattern B seeds from `ventilator infant.xlsx` (transport file same shape), replicates **I–III**:

| Code | Setpoints | n |
|---|---|---:|
| `VENT_TIDAL_VOLUME` | 500 / 800 / 300 ml | 3 |
| `VENT_MINUTE_VOLUME` | 6 / 7 / 7.8 L | 3 |
| `VENT_RESP_RATE` | 10 / 15 / 20 bpm | 3 |
| `VENT_INSP_TIME` | 1 / 2 / 3 s | 3 |
| `VENT_EXP_TIME` | 1 / 2 / 3 s | 3 |
| `VENT_PEEP` | 20 cmH2O *(this file only)* | 1 |
| `VENT_PPEAK` | 40 cmH2O *(this file only)* | 1 |
| `VENT_FIO2` | 21 / 50 / 75 / 99 % | 4 |

**Seed run:** `48` parameters touched, **213** `CalibrationTestPoint` rows inserted (was 0 on this DB before migrate+seed).

**Not seeded:** `VENT_IE_RATIO` (RATIO; Excel I:E cells were time-serials). Peak inspiratory/expiratory **flow** tables in Excel have **no catalog parameter**.

---

## Step 5 — ~20 unscoped Excel types

Inventory only: `docs/claude/plans/Calibration-management/measurement-results/unscoped-calibration-results-catalog-extraction.md`

**No `DeviceType` / `DeviceCalibrationParameter` inserted.** Matches the existing lock in `seed-device-taxonomy-extension-parameters.ts` (Auto Chemistry, Hematologi, Thermohygrometer, Otoscope, Phaco out of scope). Four defibrillator workbooks are variants of one family — taxonomy first.

---

## Remaining gaps

| Gap | Why it still exists |
|---|---|
| 9 catalog types without filled Excel | Breast Pumps, Cold Chain (as distinct from vaccine fridge), Dental X-Ray, Electric Beds, Lampu Operasi, Oxymeter Monitor, Patient Monitor, Radiant Warmer, Resuscitator Cardiac |
| ~20 product families in Excel, zero catalog | Step 5 inventory; needs DeviceType design then env/elec + kinerja |
| 81 NUMBER params still `decimalPlaces = 0` | No mapped recorded cell |
| `AUD_FREQUENCY_RESPONSE_*` unverified | Missing table in filled Audiometer.xlsx |
| Ventilator peak flow (PIF/PEF) | Excel has tables; no capability/parameter codes |
| `VENT_PEEP` / `VENT_PPEAK` single-point | This corpus only recorded 20 / 40 cmH2O |
| `VENT_IE_RATIO` test points | RATIO + broken Excel serials |
| Logger 30×9 vs `LOGGER_SUMMARY` min/max | Stage C UI decision |
| Replicate count 3 vs 5 vs 30 | No schema field; Stage A default 5 unchanged |
| Identity-corrupt files | Mikropipet, Kelistrikan, Uji Fungsi Fisik (Laser Ndyag) |
| `DXRAY_EXPOSURE_TIME` still template-only | Seeded from blank LK; no filled Excel |
| Production / VPS | All of the above is `pkmdb` only |

---

## Files touched

| File | Role |
|---|---|
| `docs/claude/plans/.../calibration-results-cross-check.md` | Step 1 |
| `docs/claude/plans/.../unscoped-calibration-results-catalog-extraction.md` | Step 5 |
| `packages/db/prisma/backfill-decimal-places-from-results.ts` | Step 2 |
| `packages/db/prisma/seed-calibration-test-points.ts` | Steps 3–4 |
| `packages/db/package.json` | `backfill:decimal-places-from-results` script |

---

## HARD STOP

Await review before: cataloguing the 20 unscoped types, adding Ventilator flow parameters, backfilling the remaining 81 zeros, or deploying.
