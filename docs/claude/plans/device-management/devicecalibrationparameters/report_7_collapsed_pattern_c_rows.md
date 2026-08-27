# Report: Split 7 Incorrectly-Collapsed DeviceCalibrationParameter Rows (Pattern C)

**Date:** 2026-08-27
**Type:** Data correction — scoped strictly to `DeviceCalibrationParameter` (rows + its seed script).
**Result:** 7 collapsed rows removed, 15 correctly-split rows inserted. Live DB
`DeviceCalibrationParameter` count **481 → 489** (net +8). No other model/table touched.
`SUCT_MAX_VACUUM` reviewed and deliberately left unchanged.

Files changed:
- `packages/db/prisma/seed-device-taxonomy-extension-parameters.ts` — 7 row defs → 15; `EXPECTED_COUNT` 239 → 247; header note added. (Prettier also rewrapped one pre-existing over-long `if (...)` line in the validation block — cosmetic, matches project style.)
- `packages/db/prisma/fix-collapsed-pattern-c-parameters.ts` — **new** one-time correction script (idempotent), modelled on `backfill-device-calibration-parameter-tolerances.ts`.

---

## Step 0 — Live-DB verification (did the DB match the investigation report?)

Queried the live `DeviceCalibrationParameter` table directly (via `../../.env` → `postgresql://…/pkmdb`).
**All 7 rows matched the investigation report exactly** — every one had `toleranceMin = NULL`,
`toleranceMax = NULL`, and a `toleranceNote` containing two-or-more concatenated tolerance
expressions:

| code | deviceType | capabilityItem | uom | live `toleranceNote` (before) |
|---|---|---|---|---|
| `ACLV_STER_TEMP` | AUTOCLAVE | STERILIZATION_TEMPERATURE | DEG_C | `121 °C ~ 124 °C; 134 °C ~137 °C` |
| `ACLV_STER_TIME` | AUTOCLAVE | STERILIZATION_TIME | MIN | `121 °C ≥ 15 menit; 134 °C ≥ 3 menit` |
| `ACLV_CHAMBER_TEMP` | AUTOCLAVE | CHAMBER_TEMPERATURE | DEG_C | `ΔT1 = S1 – S2 ± 2 °C; ΔT2 = S1 – S3 ± 5 °C; ΔT3 = S1 – S3 ± 2 °C` |
| `BSC_LIGHT_INTENSITY` | BIO_SAFETY_CABINET | LIGHT_INTENSITY | LUX | `Lampu ON ≥ 450 lux; Lampu OFF ≤ 160 lux` |
| `BSC_SOUND_LEVEL` | BIO_SAFETY_CABINET | SOUND_LEVEL | DBA | `Noise ON ≤ 70 dBA; Noise OFF ≤ 60 dBA` |
| `LAF_SOUND_LEVEL` | LAMINAR_AIR_FLOW | SOUND_LEVEL | DBA | `Background ≤ 55 dBA; Didalam kompartemen ≤ 65 dBA` |
| `DXRAY_HVL` | DENTAL_XRAY | HALF_VALUE_LAYER | MMAL | `70 ≥ 1,5 mmAI; 80 ≥ 2,3 mmAI` |

Reference "correct" example also confirmed present as **two separate rows**:
`DUNIT_HP_SPEED_LOW` (`min=5000 max=11000`) and `DUNIT_HP_SPEED_HIGH` (`min=250000 max=null`).

Live total before any change: **481 rows**. No discrepancy — proceeded.

---

## Step 1 — `SUCT_MAX_VACUUM` decision: **LEFT UNCHANGED**

Source: `docs/technician-docs/LK Suction Pump.docx`, Table 8:

```
| Setting UUT (Max Vacuum) | Hasil Pengukuran Standar (mmHg/…) | Ambang Batas * |
| Low Vacuum    |  | < 150 mmHg          |
| Medium Vacuum |  | 150 mmHg – 450 mmHg |
| High Vacuum   |  | ˃ 450 mmHg          |
```
Footnote: **"*isi salah satu sesuai dengan UUT"** ("fill in only one, according to the UUT").

**Reasoning:** unlike the other 7 (and unlike Dental Unit Handpiece Low/High, where every unit
has *both* a low- and a high-speed mode that are *both* tested), a suction pump belongs to exactly
**one** vacuum class. The three bands are not three measurements performed on every device — they
are a per-physical-unit classification: the technician records the single band that matches the
specific pump being calibrated. Splitting into three rows would wrongly imply three tests.
Leaving it as one row, with the three reference bands documented in `toleranceNote` and the
actual pass/fail threshold selected per-UUT at calibration time, is the faithful representation.
Confirmed still untouched after the fix:
`min=null max=null note="Low Vacuum < 150 mmHg; Medium Vacuum 150 mmHg – 450 mmHg; High Vacuum ˃ 450 mmHg. *isi salah satu sesuai dengan UUT"`.

---

## Step 2/3 — The splits (before → after, with source quotes)

For every split, the new rows keep the **same** `deviceTypeId`, `capabilityItemId`, `uomId`, and
`valueType` as the old row. **No `DeviceCapabilityItem` was created** — each variant is the same
conceptual measurement at a different cycle/state/setting, so the existing capability item still
applies (verified: `DeviceCapabilityItem` count unchanged at 98, `DeviceType` unchanged at 59).

`± X` on a difference quantity was normalised to `toleranceMin = −X, toleranceMax = +X` (target 0);
`≥ X` → `minOnly(X)`; `≤ X` → `maxOnly(X)`; `A ~ B` → `range(A, B)` — same rules as the G1 backfill.

### 1. `ACLV_CHAMBER_TEMP` → 3 rows

Source `LK Autoclave.docx` Table 7 (Setting UUT 121 / 134):
```
| S1 = | ΔT1 = S1 – S2 |  | ± 2 °C |
| S2 = | ΔT2 = S1 – S3 |  | ± 5 °C |
| S3 = | ΔT3 = S1 – S3 |  | ± 2 °C |
```
> Note: the source prints ΔT2 and ΔT3 both as "S1 – S3" with different tolerances (±5 vs ±2) —
> almost certainly a source typo (ΔT3 likely "S2 – S3"). Seeded **verbatim to the source** and
> flagged here for human review rather than silently corrected.

| after: code | name | min | max | toleranceNote |
|---|---|---|---|---|
| `ACLV_CHAMBER_TEMP_DT1` | Chamber Temperature Difference ΔT1 (S1 – S2) | −2 | 2 | `ΔT1 = S1 – S2 ± 2 °C` |
| `ACLV_CHAMBER_TEMP_DT2` | Chamber Temperature Difference ΔT2 (S1 – S3) | −5 | 5 | `ΔT2 = S1 – S3 ± 5 °C` |
| `ACLV_CHAMBER_TEMP_DT3` | Chamber Temperature Difference ΔT3 (S1 – S3) | −2 | 2 | `ΔT3 = S1 – S3 ± 2 °C` |

### 2. `ACLV_STER_TEMP` → 2 rows

Source `LK Autoclave.docx` Table 8:
```
| 121 |  |  |  | 121 °C ~ 124 °C |
| 134 |  |  |  | 134 °C ~137 °C |
```
| after: code | name | min | max | toleranceNote |
|---|---|---|---|---|
| `ACLV_STER_TEMP_121` | Sterilization Temperature (121 °C cycle) | 121 | 124 | `121 °C ~ 124 °C` |
| `ACLV_STER_TEMP_134` | Sterilization Temperature (134 °C cycle) | 134 | 137 | `134 °C ~137 °C` |

### 3. `ACLV_STER_TIME` → 2 rows

Source `LK Autoclave.docx` Table 9:
```
| 121 °C |  | ≥ 15 menit |
| 134 °C |  | ≥ 3 menit  |
```
| after: code | name | min | max | toleranceNote |
|---|---|---|---|---|
| `ACLV_STER_TIME_121` | Sterilization Time (121 °C cycle) | 15 | null | `≥ 15 menit` |
| `ACLV_STER_TIME_134` | Sterilization Time (134 °C cycle) | 3 | null | `≥ 3 menit` |

### 4. `BSC_LIGHT_INTENSITY` → 2 rows

Source `LK Bio Safety Cabinet.docx` Table 12:
```
| Lampu ON  |  |  |  |  |  |  | ≥ 450 lux |
| Lampu OFF |  |  |  |  |  |  | ≤ 160 lux |
```
| after: code | name | min | max | toleranceNote |
|---|---|---|---|---|
| `BSC_LIGHT_INTENSITY_ON` | Light Intensity (Lamp ON) | 450 | null | `≥ 450 lux` |
| `BSC_LIGHT_INTENSITY_OFF` | Light Intensity (Lamp OFF) | null | 160 | `≤ 160 lux` |

### 5. `BSC_SOUND_LEVEL` → 2 rows

Source `LK Bio Safety Cabinet.docx` Table 13:
```
| Noise ON  |  | ≤ 70 dBA |
| Noise OFF |  | ≤ 60 dBA |
```
| after: code | name | min | max | toleranceNote |
|---|---|---|---|---|
| `BSC_SOUND_LEVEL_ON` | Sound Level (Blower ON) | null | 70 | `≤ 70 dBA` |
| `BSC_SOUND_LEVEL_OFF` | Sound Level (Blower OFF) | null | 60 | `≤ 60 dBA` |

### 6. `LAF_SOUND_LEVEL` → 2 rows

Source `LK Laminar Air Flow.docx` Table 10:
```
| Background          |  |  |  |  | ≤ 55 dBA |
| Didalam kompartemen |  |  |  |  | ≤ 65 dBA |
```
| after: code | name | min | max | toleranceNote |
|---|---|---|---|---|
| `LAF_SOUND_LEVEL_BACKGROUND` | Sound Level (Background) | null | 55 | `Background ≤ 55 dBA` |
| `LAF_SOUND_LEVEL_COMPARTMENT` | Sound Level (Inside Compartment) | null | 65 | `Didalam kompartemen ≤ 65 dBA` |

### 7. `DXRAY_HVL` → 2 rows

Source `LK Dental X-Ray.docx` Table 13:
```
| Setting UUT | Pembacaan Standar (mmAI) | Toleransi |
| kV | mA | s |  |  |
| 70 |  |  |  | 70 ≥ 1,5 mmAI   80 ≥ 2,3 mmAI |
```
(Source prints "mmAI"; the real unit is mm aluminium — kept `MMAL` uom, wrote "mmAl" in the note.)

| after: code | name | min | max | toleranceNote |
|---|---|---|---|---|
| `DXRAY_HVL_70KV` | Half Value Layer (70 kV) | 1.5 | null | `70 kV ≥ 1,5 mmAl` |
| `DXRAY_HVL_80KV` | Half Value Layer (80 kV) | 2.3 | null | `80 kV ≥ 2,3 mmAl` |

---

## Step 3 — How it was applied

- **FK safety check:** `schema.prisma` shows `DeviceCalibrationParameter` has only *outgoing*
  relations (`deviceType`, `capabilityItem`, `uom`) and no model declares a back-relation or FK to
  it. No `MeasurementResult` / `CalibrationJob` table exists. Nothing references these rows' ids —
  deletion is safe. (The fix script also re-checks each old row's shape before deleting.)
- **Mechanism:** one-time script `packages/db/prisma/fix-collapsed-pattern-c-parameters.ts`,
  consistent with the existing `backfill-device-calibration-parameter-tolerances.ts` precedent.
  Each split runs in a `prisma.$transaction` (delete old + create N new). Idempotent: re-running
  after success detects all old codes absent + all new codes present and no-ops.
- **Seed kept in sync:** `seed-device-taxonomy-extension-parameters.ts` was updated to define the
  15 rows instead of the 7, so a full reseed reproduces the same result (re-ran the seed as a
  check — reported `247 extension rows upserted, total 489`, originals `242 → 242`).

Run:
```
npx tsx --env-file ../../.env prisma/fix-collapsed-pattern-c-parameters.ts
```
Output (abridged):
```
[fix] count before: 481
[fix] ACLV_CHAMBER_TEMP: BEFORE min=null max=null note="ΔT1 … ± 2 °C; ΔT2 … ± 5 °C; ΔT3 … ± 2 °C"
[fix]   AFTER ACLV_CHAMBER_TEMP_DT1: min=-2 max=2 ; _DT2: min=-5 max=5 ; _DT3: min=-2 max=2
… (all 7)
[fix] rows removed=7 added=15
[fix] count 481 → 489 (delta 8)
[fix] SUCT_MAX_VACUUM unchanged: {…"toleranceMin":null,"toleranceMax":null…}
[fix] OK
```

---

## Step 4 — Verification

| Check | Result |
|---|---|
| 7 old rows removed | ✅ `code IN (…7…)` → 0 rows |
| 15 new rows present | ✅ all 15, with expected `min`/`max`/`note`/`uom`/`valueType` |
| Row-count delta | ✅ `481 → 489` = exactly `15 − 7` |
| `AUTOCLAVE` rows now | 3 chamber + 2 ster-temp + 2 ster-time + env/electrical (was 1+1+1) |
| New `DeviceCapabilityItem` created | ❌ none — count unchanged at **98** |
| `DeviceType` count | unchanged at **59** |
| Original 242 (non-extension) rows | unchanged (`242 → 242`) |
| `SUCT_MAX_VACUUM` | unchanged (verified verbatim) |
| `DUNIT_HP_SPEED_LOW/HIGH` reference example | unchanged |
| `pnpm turbo run typecheck` | ✅ **10 successful / 10 total** |
| `pnpm turbo run lint` | ✅ 10/10 (all packages' lint scripts are `echo … skipped` stubs — project has no real linter wired) |
| `prettier --check` on both changed files | ✅ "All matched files use Prettier code style" |
| `pnpm turbo run build` | in progress at time of writing — see note below |
| `tsc --noEmit` on both prisma scripts (not in turbo pipeline; `packages/db/tsconfig.json` only includes `src`) | ✅ no errors |

> Build note: the working tree contains a large amount of **pre-existing, unrelated uncommitted
> work** (a `CommandPopover` refactor across ~9 `apps/portal` files, deletion of ~15 `docs/claude`
> planning files, `.tsbuildinfo` churn) that was already present before this task and is outside
> its scope. `typecheck` (which compiles every buildable package) passed cleanly, so this change
> does not introduce type errors. If `turbo run build` fails it will be on that unrelated portal
> code, not on `packages/db`.

### Confirmation: scope

Only `DeviceCalibrationParameter` rows (delete 7 / insert 15) and its seed script were changed.
`DeviceType`, `DeviceCategory`, `DeviceCapability`, `DeviceCapabilityItem`, `Uom`, `Device`, and
every lifecycle/application module were **not** touched. No Prisma migration was generated (the
schema itself is unchanged — this is data only). No rows outside the 7 targeted (plus the
read-only `SUCT_MAX_VACUUM` review) were modified.
