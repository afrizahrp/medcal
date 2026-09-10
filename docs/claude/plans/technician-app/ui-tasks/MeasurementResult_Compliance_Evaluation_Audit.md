# MeasurementResult Compliance Evaluation Audit

**Date:** 2026-09-10  
**Mode:** ANALYSIS ONLY — no code, schema, enum, or UI changes  
**Workspace:** `D:\medcal`  
**Scope:** meaning and implementation of **"Sesuai" / "Tidak sesuai"** on MeasurementResult  
**Out of scope:** redesign of PASS/FAIL, completeness, REWORK, QualityReview, or tolerance logic

---

## 1. EXECUTIVE SUMMARY

When the Tech-PWA UI displays **"Tidak sesuai"** on a MeasurementResult, the current system means **exactly one thing**:

> This **individual stored reading** was evaluated at write time against the **effective numeric (or boolean) tolerance snapshot**, and `MeasurementResult.isWithinTolerance === false`.

It does **not** mean the equipment failed calibration.  
It does **not** mean the CalibrationJob failed.  
It does **not** trigger REWORK, block submit, block MT Setujui/Tolak, block complete, generate a certificate, or change WorkOrder status.

**How it works today:**

1. Evaluation is computed **on the backend at create/update**, then **persisted** on the row as `isWithinTolerance` (`true` / `false` / `null`).
2. Tech-PWA does **not** recompute the verdict. It maps the stored boolean to a chip label.
3. The engine is the same for environmental parameters (suhu, RH, tegangan) and performance parameters (HR, SpO2, NIBP, electrical safety). Capability is used only for UI grouping.
4. CalibrationJob has **no PASS/FAIL field**. Job status is a lifecycle enum (`PENDING` → `IN_PROGRESS` → `SUBMITTED` → `REWORK` or `ACCEPTED_BY_QA`). Completeness of measurements is a **frontend display helper only**. Submit-for-review and MT decide do **not** read `isWithinTolerance`.

**Third UI state (not asked, but present):** `isWithinTolerance === null` renders **"Perlu telaah"** (not Sesuai, not Tidak sesuai). That is the "cannot evaluate automatically" case.

---

## 2. CURRENT IMPLEMENTATION

### 2.1 Verdict labels (frontend mapping only)

| Stored field | Chip label | Chip tone |
|---|---|---|
| `isWithinTolerance === true` | **Sesuai** | pass (emerald) |
| `isWithinTolerance === false` | **Tidak sesuai** | fail (red) |
| `isWithinTolerance === null` | **Perlu telaah** | unknown (slate) |

Source: `passFailChip()` in `apps/tech-pwa/src/lib/calibration/measurement.ts`.

Parameter-list / job-detail summaries (not per-row chips):

| Condition | Label shown |
|---|---|
| Not complete (filled < total) | `n/total` or `n/total diisi` — **even if some rows are out of tolerance** |
| Complete and any row `isWithinTolerance === false` | **"Ada tidak sesuai"** (job-detail) / **"Ada yang tidak sesuai"** (measurement list) |
| Complete and no `false` | **"Selesai"** |

`null` (Perlu telaah) does **not** count as fail in `anyFail`. Only explicit `false` does.

### 2.2 Evaluation engine (backend, write-time)

Two pure functions in `apps/api/src/modules/calibration-jobs/measurement-tolerance.ts`:

1. `resolveEffectiveTolerance` — chooses bounds (priority chain).
2. `computeIsWithinTolerance` — compares the **raw** measured value to those bounds.

`MeasurementResultsService.create` / `createMany` / `update` call both, then persist:

- `isWithinTolerance`
- `effectiveToleranceMin`
- `effectiveToleranceMax`
- `appliedNominalValue`

The snapshot is **never recomputed on read**. Catalog edits after the write do not silently rewrite a submitted reading's verdict (by design). Update of a still-editable draft **does** re-resolve against the current catalog + the **already snapshotted** `appliedNominalValue`.

### 2.3 What is evaluated

**Per MeasurementResult row. Independently.** There is no stored parameter-level result, no job-level result, no average, no min/max aggregation, no "all replicates must pass" rule in the engine.

---

## 3. SOURCE FILES / FUNCTIONS

| Role | File | Function / symbol |
|---|---|---|
| Tolerance resolution | `apps/api/src/modules/calibration-jobs/measurement-tolerance.ts` | `parseToleranceNote`, `resolveEffectiveTolerance` |
| Verdict computation | same | `computeIsWithinTolerance` |
| Persist on write | `apps/api/src/modules/calibration-jobs/measurement-results.service.ts` | `create`, `createMany`, `update` |
| HTTP | `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts` | `POST/PATCH .../measurement-results` |
| Request validation (values only; not verdict) | `packages/shared/src/schemas/index.ts` | `measurementResultCreateSchema`, `measurementResultUpdateSchema` |
| Persistence schema | `packages/db/prisma/schema.prisma` | `MeasurementResult.isWithinTolerance` (+ snapshot columns) |
| Chip labels | `apps/tech-pwa/src/lib/calibration/measurement.ts` | `passFailChip` |
| Per-row chip UI | `apps/tech-pwa/src/app/jobs/[id]/measurements/measurements-ui.tsx` | `PassFailChip` |
| DIRECT entry | `apps/tech-pwa/src/app/jobs/[id]/measurements/[parameterId]/page.tsx` | renders `PassFailChip` after save |
| GRID entry | `apps/tech-pwa/src/app/jobs/[id]/measurements/measurement-grid.tsx` | same, per cell |
| Parameter summary | `apps/tech-pwa/src/lib/calibration/measurement.ts` | `parameterEntryStatus`, `gridEntryStatus` |
| Job-detail summary | `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx` | `MeasurementStatusRow` |
| Engine unit tests | `apps/api/src/modules/calibration-jobs/measurement-tolerance.test.ts` | parse / resolve / compute |
| Service tests | `apps/api/src/modules/calibration-jobs/measurement-results.service.test.ts` | snapshot + verdict on CRUD |
| Frontend tests | `apps/tech-pwa/src/lib/calibration/measurement.test.ts` | chip + completeness helpers |
| Catalog bounds | `packages/db/prisma/backfill-device-calibration-parameter-tolerances.ts` | `toleranceMin/Max/Note` |
| Test-point catalog | `packages/db/prisma/seed-calibration-test-points.ts` | `settingValue` + optional per-point override |
| Parameter master | `packages/db/prisma/seed-device-calibration-parameters.ts` | names, codes, capability grouping |
| Eligible UI catalog | `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` | `listMeasurementParameters` |
| Submit / MT / complete | same | `submitForReview`, `decideQualityReview`, `complete` — **do not read measurements** |

**Where evaluation happens:** backend on write. Frontend only displays the stored field. Not recalculated on GET.

---

## 4. DATA FLOW

```
DeviceCalibrationParameter
  valueType, toleranceMin, toleranceMax, toleranceNote
        │
        │  (optional children)
        ▼
CalibrationTestPoint
  settingValue, toleranceMin, toleranceMax, toleranceNote
        │
        │  technician POST/PATCH measuredValue (raw string/number)
        ▼
MeasurementResultsService.create / createMany / update
        │
        ├─ resolveEffectiveTolerance(...)
        │     priority:
        │       1. test-point toleranceMin/Max if either is set  → TEST_POINT_OVERRIDE
        │       2. else parameter toleranceMin/Max if either is set → PARAMETER_BOUNDS
        │       3. else parse toleranceNote (test-point note first, then parameter note)
        │          + appliedNominalValue (test-point settingValue, else suppliedNominalValue)
        │          → NOTE  (or NONE if ± note has no nominal)
        │       4. else NONE (both bounds null)
        │
        ├─ computeIsWithinTolerance(valueType, measuredValue/measuredBool, effective min/max)
        │
        ▼
MeasurementResult row (persisted)
  measuredValue              raw Decimal(18,6), never rounded
  referenceValue             stored; NOT used in evaluation
  measuredBool / measuredText
  isWithinTolerance          true | false | null
  effectiveToleranceMin/Max  snapshot
  appliedNominalValue        snapshot of nominal used (or setting)
        │
        │  GET returns the row as stored
        ▼
Tech-PWA passFailChip(isWithinTolerance)
  true  → "Sesuai"
  false → "Tidak sesuai"
  null  → "Perlu telaah"
```

### 4.1 Fields the evaluation code actually uses

| Field | Used in evaluation? | How |
|---|---|---|
| `measuredValue` | **YES** (NUMBER / RATIO) | raw Prisma.Decimal comparison |
| `measuredBool` | **YES** (BOOLEAN only) | `true` → within; `false` → not; `null` → null |
| `measuredText` | NO | TEXT always yields `isWithinTolerance = null` |
| `referenceValue` | **NO** | stored only; never passed into compute |
| `parameter.toleranceMin` | YES | priority 2 |
| `parameter.toleranceMax` | YES | priority 2 |
| `parameter.toleranceNote` | YES | priority 3, if no structured bounds |
| `testPoint.toleranceMin/Max` | YES | priority 1 (either bound present = override) |
| `testPoint.toleranceNote` | YES | priority 3, before parameter note |
| `testPoint.settingValue` | YES | becomes `appliedNominalValue` for ± / % notes |
| `suppliedNominalValue` | YES | fallback nominal (Pattern D generic slot) |
| `valueType` | YES | BOOLEAN / TEXT / NUMBER / RATIO branch in **compute** only; **not** used by `resolveEffectiveTolerance` |
| `decimalPlaces` | **NO** | display / input `step` only |
| `uom` / `uomId` | **NO** | display of tolerance text only |
| capability / capability item | **NO** | UI grouping only |
| `entryStyle` | **NO** | UI eligibility (`LOGGER_SUMMARY` excluded from list), not evaluation |
| `replicateIndex` | **NO** | identity of the row; each row evaluated alone |
| `direction` | **NO** | identity of the row |
| `attemptNumber` | **NO** | which attempt the row belongs to |
| completeness | **NO** | frontend status helper only |

Do not infer unused fields into the formula. The code does not use them.

---

## 5. EVALUATION FORMULA

### 5.1 Effective bounds

```
if testPoint.toleranceMin != null OR testPoint.toleranceMax != null:
    effectiveMin, effectiveMax = testPoint.toleranceMin, testPoint.toleranceMax
    source = TEST_POINT_OVERRIDE

else if parameter.toleranceMin != null OR parameter.toleranceMax != null:
    effectiveMin, effectiveMax = parameter.toleranceMin, parameter.toleranceMax
    source = PARAMETER_BOUNDS

else:
    parsed = parseToleranceNote(testPoint.toleranceNote)
           ?? parseToleranceNote(parameter.toleranceNote)
    if parsed.EXPLICIT_BOUNDS:
        effectiveMin, effectiveMax = parsed.min, parsed.max
        source = NOTE
    else if parsed is ABSOLUTE_DELTA or PERCENT_DELTA AND nominal exists:
        delta = percent ? |nominal| * percent / 100 : parsed.delta
        effectiveMin = nominal - delta
        effectiveMax = nominal + delta
        source = NOTE
    else:
        effectiveMin = effectiveMax = null
        source = NONE

nominal = testPoint.settingValue ?? suppliedNominalValue ?? null
```

`parseToleranceNote` recognizes:

- `± N` → `ABSOLUTE_DELTA`
- `± N%` / `± N %` → `PERCENT_DELTA`
- `Min : x` / `Max : y` → `EXPLICIT_BOUNDS`
- leading `≥` / `>` / `≤` / `<` → `EXPLICIT_BOUNDS` (one-sided)
- Indonesian decimal comma (`0,025`)
- **null** if blank, if `"Pass / Fail"`, if `"isi salah satu sesuai dengan uut"`, or if **two distinct ± deltas** appear in the same note (e.g. INCU_AIR_TEMP parent note)

### 5.2 `isWithinTolerance`

```
BOOLEAN:
    return measuredBool          # true/false/null; ignores bounds

TEXT:
    return null                  # never auto-evaluated

NUMBER and RATIO:
    if measuredValue is null: return null
    if both effectiveMin and effectiveMax are null: return null
    if effectiveMin != null AND value < min: return false
    if effectiveMax != null AND value > max: return false
    return true                  # inclusive at both boundaries
```

Prisma.Decimal `lessThan` / `greaterThan` — **strict**. Equality is **in-tolerance**.

One-sided bounds are supported: min-only (`≥`), max-only (`≤`), or both.

### 5.3 Worked numeric example (from tests)

BSM_SYSTOLIC, note `± 5 mmHg`, test point `settingValue = 60`, measured `107`:

- bounds snapshot = `[55, 65]`
- `107 > 65` → `isWithinTolerance = false` → UI **"Tidak sesuai"**

DUNIT_ILLUMINANCE pattern (min-only `15000`): measured `16200` → true; `14920` → false.

---

## 6. PARAMETER TYPE MATRIX

| Parameter scenario | Evaluation exists? | Formula / rule | Result |
|---|---|---|---|
| DIRECT, NUMBER, structured min+max (e.g. suhu ruangan) | Yes | `PARAMETER_BOUNDS`; raw value vs min/max inclusive | true / false |
| DIRECT, NUMBER, min only (isolasi `>2 MΩ` stored as min=2) | Yes | fail if `value < min` | true / false |
| DIRECT, NUMBER, max only (earth `≤ 0,3 Ω`) | Yes | fail if `value > max` | true / false |
| DIRECT, NUMBER, no bounds, no parseable note | Yes, but unresolvable | source `NONE` | **null** → UI "Perlu telaah" |
| DIRECT, NUMBER, note-only `± N` **without** test-point nominal | Unresolvable | no nominal → NONE | **null** |
| GRID, NUMBER, parent note `± N` + test-point `settingValue` | Yes | NOTE: `[setting − N, setting + N]` | true / false per cell |
| GRID, NUMBER, parent note `± N%` + `settingValue` | Yes | NOTE: `setting ± (setting × N/100)` | true / false per cell |
| GRID, NUMBER, per-point `toleranceMin/Max` override | Yes | TEST_POINT_OVERRIDE as **absolute** bounds (not re-applied as ± around setting) | true / false per cell |
| GRID, NUMBER, parent structured bounds, test-point bounds null | Yes | inherit `PARAMETER_BOUNDS` (same for every point) | true / false per cell |
| Parameters **without** test points (Pattern A) | Yes if bounds/note resolve | `calibrationTestPointId = null` | per replicate |
| Parameters **with** test points (Pattern B) | Yes | each (point × replicate × direction) independently | per cell |
| `toleranceNote` only, parseable, with nominal | Yes | NOTE | true / false |
| `toleranceNote` only, unparseable (`Pass / Fail`, dual-class prose) | No auto eval unless structured bounds also exist | NONE or PARAMETER_BOUNDS if min/max set | null, or bounds if present |
| BOOLEAN (`BSC_HEPA_LEAK`, note "Pass / Fail") | Yes (different rule) | `isWithinTolerance = measuredBool` | true / false / null |
| TEXT | Engine returns null | no comparison | null |
| RATIO (`VENT_IE_RATIO`, note `± 10 %`) | Engine: same as NUMBER | needs nominal to resolve ±% | true / false / null |
| LOGGER_SUMMARY (`entryStyle`) | Engine would run if written | **not listed** in Tech-PWA `listMeasurementParameters` | UI not implemented (Stage C) |
| `SUCT_VACUUM_GAUGE` | Engine supports suppliedNominal | **excluded from grid catalog** by code allowlist | UI not implemented |
| Environmental vs performance | **Same engine** | no capability branch | see §8 |

**UI eligibility vs engine:** `listMeasurementParameters` only returns `valueType = NUMBER`, `entryStyle = DIRECT_REPLICATES`, active. BOOLEAN / RATIO / TEXT / LOGGER_SUMMARY are **not shown** in Tech-PWA entry, but the **service will still evaluate them** if a row is written via API.

---

## 7. REPRESENTATIVE PARAMETER EXAMPLES

Catalog values below come from `backfill-device-calibration-parameter-tolerances.ts` and `seed-calibration-test-points.ts`. Evaluation is always the same engine as §5.

### 7.1 Suhu Ruangan

| Device example | Code | Catalog |
|---|---|---|
| Blood Pressure Monitor | `BPM_ROOM_TEMP` | min **19**, max **31**, note `25 ± 6 °C` |
| Bed Side Monitor | `BSM_ROOM_TEMP` | min **20**, max **30**, note `25 ± 5 °C` |

- Measured: room temperature (°C), DIRECT, no test points.
- Evaluation: `PARAMETER_BOUNDS` (structured min/max; note is display-only because bounds exist).
- **Sesuai:** `19 ≤ value ≤ 31` (BPM) or `20 ≤ value ≤ 30` (BSM), inclusive.
- **Tidak sesuai:** outside that interval.
- Capability `ENVIRONMENTAL_CONDITIONS` is grouping only.

### 7.2 Kelembaban / RH

- Codes: `BPM_ROOM_HUMIDITY`, `BSM_ROOM_HUMIDITY`, …
- Catalog: min **35**, max **75**, note `55 % ± 20 % RH` (`pm(55, 20)` = absolute ±20, not 20% of 55).
- DIRECT. **Sesuai** if `35 ≤ value ≤ 75`.

### 7.3 Tegangan Input

- Codes: `BPM_INPUT_VOLTAGE`, `BSM_INPUT_VOLTAGE`, …
- Catalog: min **198**, max **242**, note `220 ± 10% Volt` (`pmPct(220, 10)`).
- DIRECT. **Sesuai** if `198 ≤ value ≤ 242`.

### 7.4 Resistansi Pembumian Protektif

- Codes: `BPM_EARTH_RESISTANCE`, `BSM_EARTH_RESISTANCE`, …
- Catalog: min null, max **0.3**, note `≤ 0,3 Ω`.
- DIRECT. **Sesuai** if `value ≤ 0.3`. Zero is in-tolerance. Negative is also `≤ 0.3` (no sign check).

### 7.5 Resistansi Isolasi

- Codes: `BPM_INSULATION_RESISTANCE` (note `>2 MΩ`), `BSM_INSULATION_RESISTANCE` (note `> 2 MΩ`).
- Catalog: min **2**, max null. Comparison is **`value < 2` → false**, so **2 is Sesuai** (inclusive), despite the note saying `>`.
- DIRECT.

### 7.6 Arus Bocor Peralatan

| Device | Code | Catalog max | Note |
|---|---|---|---|
| BPM | `BPM_EQUIP_LEAKAGE` | **100** | `≤ 100 µA` |
| BSM | `BSM_EQUIP_LEAKAGE` | **500** | `Kelas I ≤ 500 µA` / `Kelas II ≤ 100 µA` |

- DIRECT. Evaluation uses structured **max only**.
- BSM: a reading of 200 µA is **Sesuai** under current code (max=500). The Kelas II line in the note is **not parsed** (priority 2 wins; note is unused for math).

### 7.7 Arus Bocor Bagian yang Diaplikasikan

- BPM / BSM: max **50**, note `≤ 50 µA`.
- **Sesuai** if `value ≤ 50`.

### 7.8 Heart Rate

- `BSM_HEART_RATE`: GRID. Parent note `± 5 bpm` (no structured min/max). Test points `30, 60, 120, 180` BPM (`settingValue` set).
- Each cell: bounds = `[setting−5, setting+5]`. Example setting 60: **Sesuai** if `55 ≤ measured ≤ 65`.
- Each replicate at each point is independent. No average.

### 7.9 Respirasi

- `BSM_RESP_RATE`: GRID. Note `± 3 BrPM`. Points `15, 30, 60, 120`.
- Setting 30 → **Sesuai** if `27 ≤ measured ≤ 33`.

### 7.10 Saturasi Oxygen (SpO2)

- `BSM_SPO2`: GRID. Note `± 3 % SPO2`. Points include 98, 93, 92, 85, 90, 70, 88, 90 (duplicate 90 disambiguated by label).
- Parser treats `%` as **PERCENT_DELTA**, not ±3 percentage points.
- Setting 98 → delta = `98 × 3 / 100 = 2.94` → bounds **[95.06, 100.94]**.
- Setting 70 → bounds **[67.9, 72.1]** (not 67–73).
- Whether that matches LK intent is **Not defined by current implementation as a business rule**; it is what the parser currently does.

### 7.11 NIBP Systole / Diastole / Mean

| Parameter | BSM code | BPM code | Note | Pattern |
|---|---|---|---|---|
| Systole | `BSM_SYSTOLIC` | `BPM_SYSTOLIC` | `± 5 mmHg` | GRID |
| Diastole | `BSM_DIASTOLIC` | `BPM_DIASTOLIC` | `± 5 mmHg` | GRID |
| Mean | `BSM_MAP` | `BPM_MAP` | `± 5 mmHg` | GRID |

- Parent has **no** structured min/max. Each test point has `settingValue` (e.g. BSM systole 120, 150, 200, 250, 60, 80, 100).
- Setting 120 → **Sesuai** if `115 ≤ measured ≤ 125`.
- Test (`measurement-results.service.test.ts`): setting 60, measured 107 → false.

### 7.12 Other catalog shapes that affect evaluation (not in the user example list)

| Parameter | What the code does |
|---|---|
| `INCU_RECOVERY_TIME` | unresolved (no min/max/note) → **null** / "Perlu telaah" |
| `INCU_AIR_TEMP` | parent note is dual-class → `parseToleranceNote` returns null; **per-point override** stores `toleranceMin/Max` as **−1.5…1.5** or **−0.8…0.8**, used as **absolute** bounds (priority 1). A measured air temperature of 32 against `[-1.5, 1.5]` is **Tidak sesuai**. Whether the technician is expected to enter temperature vs deviation is **Not determinable from current configuration/code**. |
| `SUCT_MAX_VACUUM` | per-point absolute bands (Low max 150, Medium 150–450, High min 450) |
| `VENT_IE_RATIO` | RATIO + note `± 10 %`; **not in Tech-PWA list** (`valueType` filter) |
| `BSC_HEPA_LEAK` | BOOLEAN + note `Pass / Fail`; engine mirrors `measuredBool`; **not in Tech-PWA list** |

---

## 8. ENVIRONMENTAL VS PERFORMANCE ANALYSIS

**The current system uses the SAME evaluation mechanism for all of them.**

There is **no** code branch on:

- capability code `ENVIRONMENTAL_CONDITIONS` vs `VITAL_SIGNS_MONITORING` vs `ELECTRICAL_SAFETY` vs `NIBP`
- parameter name
- "condition of the room" vs "performance of the UUT"

Capability is attached to the catalog for **display grouping** (`capabilityGroups` / "Kondisi Lingkungan" vs kinerja). `resolveEffectiveTolerance` and `computeIsWithinTolerance` never receive capability.

A room-temperature reading of 18 °C on BPM (`19–31`) is **"Tidak sesuai"** in exactly the same sense as a heart-rate reading of 70 at setting 60 (`55–65`): the **row's raw number is outside the resolved bounds**.

Semantic distinction (may environmental OOT be ignored for equipment PASS/FAIL?) is **Not defined by current implementation.**

---

## 9. MEANING OF "SESUAI / TIDAK SESUAI"

### What "Tidak sesuai" **means** in the current system

**Option A from the brief, narrowed to the stored row:**

The individual MeasurementResult's raw `measuredValue` (or `measuredBool` for BOOLEAN) is outside the **effective tolerance snapshot stored on that same row**.

For NUMBER/RATIO: `value < effectiveMin` or `value > effectiveMax` (whichever bounds exist).

### What it **does not** mean

| Claim | Current system |
|---|---|
| B. The equipment fails calibration | **No.** No equipment-level result exists. |
| C. The CalibrationJob fails | **No.** Job has no PASS/FAIL. Status is unchanged. |
| D. Something else (REWORK, rejection, incomplete job, certificate withheld) | **No automatic effect.** See §10–§11. |
| All replicates of the parameter failed | **No.** One cell is enough for the list badge "Ada yang tidak sesuai", but the chip is still per row. |
| MT has rejected the job | **No.** MT reject is a separate human action. |
| Completeness failed | **No.** Incomplete rows can still be Sesuai/Tidak sesuai. |

### Third state

`isWithinTolerance === null` is **not** "Tidak sesuai". Schema comment: *"cannot be evaluated automatically — judged holistically by a human at QualityReview (G4)"*. The UI shows **"Perlu telaah"**. Whether MT actually uses that as a review rule is **Not defined by current implementation** (MT UI does not even show the chip).

---

## 10. CALIBRATIONJOB IMPACT

**No current connection found** between an individual "Tidak sesuai" and:

| Effect | Evidence |
|---|---|
| CalibrationJob status change | `submitForReview` / `decideQualityReview` / `complete` / `resumeAfterRework` do not query `MeasurementResult` |
| CalibrationJob PASS/FAIL | **No such field** on `CalibrationJob` |
| REWORK | REWORK is created only by MT `decision: "REJECT"` in `decideQualityReview`. Not by tolerance. |
| Rejection | Same — human MT action + mandatory notes |
| Approval blocking | APPROVE creates `QualityReview` without reading measurements |
| Complete blocking | `complete` requires latest QualityReview APPROVED only |
| Certificate generation | `Certificate` model exists; **no** `prisma.certificate.create` in calibration-jobs (or elsewhere in `apps/api` for job results). Complete does not issue a certificate. |
| WorkOrder status change | WorkOrder `DONE` is a separate work-orders service path; not driven by `isWithinTolerance` |

`submitForReview` only checks: status `IN_PROGRESS` and `startedAt != null`. Comment in `quality-review.ts`: *"Completeness / PASS-FAIL are not gated here (backend does not require them on the happy path)."*

Tech-PWA **"Kirim"** on the measurements list uses the same `canSubmitForReview(job)` — job status only, **not** `anyFail`.

---

## 11. MT REVIEW IMPACT

Portal MT review (`apps/portal/src/app/management/calibration-jobs/[id]/page.tsx` + `use-measurement-results-query.ts`):

| What MT sees | Current code |
|---|---|
| Individual Sesuai / Tidak sesuai | **No.** `PortalMeasurementResult` type has `measuredValue` / bool / text / note / replicate — **omits `isWithinTolerance`**. Table columns: Parameter, Replicate, Nilai. |
| Tolerance violation highlight | **No.** |
| Overall measurement result / PASS/FAIL | **No.** Status strip chip "Hasil Pengukuran" is **neutral** (navigation only). Comment: no "measurement complete" signal. |
| Raw values | **Yes.** Grouped by capability. Current attempt only. |

Setujui / Tolak:

- Enabled when job is `SUBMITTED` and the actor has `decideQualityReview`.
- APPROVE: notes optional. No measurement check.
- REJECT: notes required. Moves job to REWORK, increments `currentAttempt`. No measurement check.

**No current connection found** between "Tidak sesuai" and Setujui / Tolak / REWORK.

---

## 12. COMPLETENESS BEHAVIOR

### Backend

**Completeness logic does not exist** as a write or submit guard. Any number of rows (including zero) may be submitted.

### Frontend (display only)

There is **no catalog field** for expected replicate count. Soft defaults:

- `DEFAULT_REPLICATE_COUNT = 5` (I–V convention)
- `3` if parameter `code` starts with `VENT_` or `AUD_`
- GRID total = `testPointCount × max(expected, max replicateIndex) × directionCount` (`directionCount = 2` only for `SPHYG_PRESSURE_ACC`)

A parameter is `complete` when `filled >= total` and `filled > 0` (DIRECT also requires `withValue.length > 0`).

`filled` = rows with `measuredValue !== null && !== ""`. BOOLEAN/TEXT completeness is **not implemented** in these helpers (they only count `measuredValue`).

### Can an incomplete parameter still display Sesuai / Tidak sesuai?

**Yes, on the saved row.** The entry screen shows `PassFailChip` as soon as a row exists.

**No, on the parameter-list badge.** If incomplete, the list shows `n/total diisi`, **not** "Ada yang tidak sesuai", even if `anyFail` is true internally.

---

## 13. DIRECT / GRID / REPEAT BEHAVIOR

### Repeats (Ulangan 1, 2, 3, …)

- Each replicate is a **separate MeasurementResult** (`replicateIndex` 1-based).
- Each is evaluated **independently** at write.
- **No aggregate** stored on the parameter.
- **Average / min / max of repeats: not used.**
- Any single replicate with `isWithinTolerance === false` sets frontend `anyFail = true`.
- There is **no overall parameter result** in the database.

### GRID

- Natural key includes `calibrationTestPointId` + `replicateIndex` + `direction`.
- Evaluation is **per cell** (test point × replicate × direction).
- Not per-test-point aggregate, not per-parameter aggregate.
- `anyFail` is OR across all filled cells of that parameter (current attempt), frontend only.

### DIRECT vs GRID

Same `computeIsWithinTolerance`. Difference is only how bounds are resolved (no test point vs test point / note + nominal).

---

## 14. PERSISTENCE

| Question | Answer |
|---|---|
| Stored in MeasurementResult? | **Yes:** `isWithinTolerance Boolean?` plus `effectiveToleranceMin/Max`, `appliedNominalValue` |
| Stored elsewhere? | **No** job-level or parameter-level copy |
| Calculated on read? | **No** |
| Calculated only in frontend? | **No** |
| Calculated both? | Backend write; frontend **maps** the stored boolean to labels and `anyFail` |

Frontend `anyFail` / `complete` are **derived on read in the client** from already-persisted rows. They are not persisted.

Update path: if `measuredValue` / `measuredBool` / `measuredText` change, service re-resolves bounds (using snapshotted `appliedNominalValue`) and recomputes `isWithinTolerance`. Note-only edits do not recompute the verdict.

---

## 15. ROUNDING / DECIMAL BEHAVIOR

**Comparison uses the raw numeric value as stored (`Decimal(18, 6)`).**

Locked comment on schema and `computeIsWithinTolerance`: *"from the RAW measured value (locked project rule)"*.

`decimalPlaces` is **not** loaded in `loadCatalog` and **not** passed into the engine.

`formatMeasuredValue` is **display-only**. Comment: *"Never used to transform the value sent to the API — the raw string is submitted and stored at full precision."*

Tech-PWA save sends `measuredValue: value` (trimmed draft string) after `isValidMeasuredValue` (`/^-?\d+(\.\d+)?$/`). No `toFixed`.

### The 25 ± 5 / 19.999 example

If effective bounds are `[20, 30]` (25 ± 5) and the technician enters **19.999**:

- Stored: `19.999`
- `19.999 < 20` → `isWithinTolerance = false` → **"Tidak sesuai"**
- Display with `decimalPlaces = 1` would show **`20.0`**, but that formatted string is **not** what is compared.

If they enter `20`, result is **Sesuai** (inclusive).

Frontend `input type="number"` may still send extra precision depending on the browser; whatever string is posted is what is compared.

---

## 16. EDGE CASES

| Case | Actual behavior |
|---|---|
| No tolerance (min, max, and unparseable/empty note) | `isWithinTolerance = null` → "Perlu telaah" |
| toleranceMin only | fail iff `value < min`; else true |
| toleranceMax only | fail iff `value > max`; else true |
| toleranceNote only, parseable ±, **with** nominal | bounds from note; then numeric compare |
| toleranceNote only, parseable ±, **without** nominal | null |
| toleranceNote only, unparseable | null (unless structured min/max exist — those win) |
| Dual-class note (INCU_AIR_TEMP parent, SUCT_MAX_VACUUM parent) | `parseToleranceNote` → null; rely on per-point override if present |
| null `measuredValue` (NUMBER) | null |
| empty string on write | Zod preprocess `""` → `null` → null verdict for NUMBER |
| zero | compared as 0; valid (e.g. earth 0 ≤ 0.3 → Sesuai) |
| negative | allowed by schema; compared as-is; no absolute-value step |
| value **equal** to minimum | **Sesuai** (`lessThan` is strict) |
| value **equal** to maximum | **Sesuai** (`greaterThan` is strict) |
| value just outside (`min − ε`) | **Tidak sesuai** |
| BOOLEAN `measuredBool = true/false` | true → Sesuai, false → Tidak sesuai, **ignores bounds** |
| BOOLEAN `measuredBool = null` | null |
| TEXT | always null |
| Note says `>` but stored as min bound | **inclusive ≥** in math (e.g. isolasi `>2` → 2 is Sesuai) |
| Note says `<` parsed as max | **inclusive ≤** in math |
| `referenceValue` present | ignored by evaluation |
| Incomplete set of repeats | each saved row still gets a chip |
| `isWithinTolerance === null` in `anyFail` | **not** treated as fail |

---

## 17. CURRENT IMPLEMENTATION VS UNDEFINED BUSINESS RULES

### A. CURRENT IMPLEMENTATION (facts)

- Verdict is per MeasurementResult row, computed at write, persisted.
- UI "Sesuai / Tidak sesuai" is a label for `isWithinTolerance` true/false.
- Same numeric engine for environment, electrical safety, and performance.
- Job lifecycle (submit / MT decide / REWORK / complete) ignores the verdict.
- Completeness is a Tech-PWA counter, not a business gate.
- No job-level or equipment-level PASS/FAIL field.

### B. BUSINESS SEMANTICS NOT YET DEFINED

Mark: **Not defined by current implementation.**

- Does one failed measurement mean equipment FAIL?
- Does one failed **parameter** (any replicate OOT) mean CalibrationJob FAIL?
- Does one failed **environmental** reading mean FAIL, or is it only a recording condition?
- May MT approve a job that has "Tidak sesuai" rows?
- May the technician submit with "Tidak sesuai" or "Perlu telaah" rows? (Code **allows** it; rule not stated as policy.)
- What is the final PASS/FAIL rule?
- What is the completeness requirement for a valid calibration?
- Must all test points and all I–V (or I–III) replicates exist?
- For SpO2, is `± 3 % SPO2` percent-of-reading or ±3 %SpO2 points?
- For INCU_AIR_TEMP, does the technician enter temperature or deviation from setting/mean?
- For isolasi `>2 MΩ`, is the bound exclusive or inclusive?
- For dual-class leakage notes, which class applies to this UUT?
- Does QualityReview "holistic judgment" of `null` verdicts actually happen in the MT UI? (UI does not show the verdict.)
- Does certificate issuance depend on all-Sesuai?

Do **not** fill these with calibration-industry assumptions. The Medcal code does not establish them.

---

## 18. POTENTIAL BUSINESS RULES TO LOCK

Reported as findings only. **Not fixed.**

1. **POTENTIAL BUSINESS RULE TO LOCK — Job PASS/FAIL vs row OOT.** Today they are disconnected. Product must say whether any "Tidak sesuai" (or any parameter-level `anyFail`) should affect submit, MT decide, REWORK, or complete.

2. **POTENTIAL BUSINESS RULE TO LOCK — Environmental vs performance.** Same engine. If room/RH/voltage OOT must not fail the device, that is a new rule, not current behavior.

3. **POTENTIAL BUSINESS RULE TO LOCK — Completeness gate.** Submit is allowed with zero measurements. If I–V (or all grid cells) are mandatory, that is not implemented.

4. **POTENTIAL BUSINESS RULE TO LOCK — Inclusive vs exclusive inequalities.** Notes `>2 MΩ`, `>15.000 lux` are stored/compared as `≥`. `<` notes compare as `≤`.

5. **POTENTIAL BUSINESS RULE TO LOCK — SpO2 `%` parser.** `± 3 % SPO2` is `PERCENT_DELTA` of the setpoint, not ±3 percentage points.

6. **POTENTIAL BUSINESS RULE TO LOCK — INCU_AIR_TEMP override shape.** Per-point min/max are signed deltas (`-1.5`…`1.5`) used as absolute bounds because TEST_POINT_OVERRIDE skips ±-around-`settingValue`.

7. **POTENTIAL BUSINESS RULE TO LOCK — Dual-class leakage.** `BSM_EQUIP_LEAKAGE` evaluates against 500 µA only; Kelas II ≤100 µA in the note is unused.

8. **POTENTIAL BUSINESS RULE TO LOCK — MT visibility.** MT does not see Sesuai/Tidak sesuai, yet schema comments assign unevaluable rows to human QualityReview.

9. **POTENTIAL BUSINESS RULE TO LOCK — Parameter-level badge vs row chip.** Incomplete parameters hide `anyFail` on the list (`n/total`) while the entry screen already shows "Tidak sesuai".

10. **POTENTIAL BUSINESS RULE TO LOCK — BOOLEAN/RATIO/LOGGER_SUMMARY.** Engine exists; Tech-PWA catalog listing excludes them. Entry/evaluation in production UI is NUMBER DIRECT/GRID only.

11. **POTENTIAL BUSINESS RULE TO LOCK — Aggregate result.** One OOT replicate already sets `anyFail`. There is no "majority", "average within tolerance", or "worst-case" rule.

12. **POTENTIAL BUSINESS RULE TO LOCK — Rounding.** Display rounding can disagree with raw comparison (19.999 vs 20.0). If LK comparison is at displayed precision, that is not what the code does.

---

## 19. FILES THAT WERE INSPECTED

**Engine and persistence**

- `apps/api/src/modules/calibration-jobs/measurement-tolerance.ts`
- `apps/api/src/modules/calibration-jobs/measurement-tolerance.test.ts`
- `apps/api/src/modules/calibration-jobs/measurement-results.service.ts`
- `apps/api/src/modules/calibration-jobs/measurement-results.service.test.ts`
- `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts` (measurement + submit/decide/complete routes)
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` (`listMeasurementParameters`, `submitForReview`, `decideQualityReview`, `complete`, `resumeAfterRework`)
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts` (quality-review + measurement lock; `listMeasurementParameters` filters)
- `packages/db/prisma/schema.prisma` (`MeasurementResult`, `DeviceCalibrationParameter`, `CalibrationTestPoint`, `CalibrationJob`, `QualityReview`, `Certificate`, `CalibrationValueType`, `CalibrationJobStatus`)
- `packages/shared/src/schemas/index.ts` (measurement request schemas)

**Tech-PWA**

- `apps/tech-pwa/src/lib/calibration/measurement.ts`
- `apps/tech-pwa/src/lib/calibration/measurement.test.ts`
- `apps/tech-pwa/src/lib/calibration/quality-review.ts`
- `apps/tech-pwa/src/app/jobs/[id]/measurements/measurements-ui.tsx`
- `apps/tech-pwa/src/app/jobs/[id]/measurements/measurement-grid.tsx`
- `apps/tech-pwa/src/app/jobs/[id]/measurements/[parameterId]/page.tsx`
- `apps/tech-pwa/src/app/jobs/[id]/measurements/page.tsx`
- `apps/tech-pwa/src/app/jobs/[id]/measurements/use-measurements-query.ts`
- `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx`

**Portal MT**

- `apps/portal/src/app/management/calibration-jobs/use-measurement-results-query.ts`
- `apps/portal/src/app/management/calibration-jobs/[id]/page.tsx` (Hasil Pengukuran table + Setujui/Tolak)

**Catalog / seed**

- `packages/db/prisma/seed-device-calibration-parameters.ts`
- `packages/db/prisma/seed-calibration-test-points.ts`
- `packages/db/prisma/backfill-device-calibration-parameter-tolerances.ts`
- `packages/db/prisma/seed-device-taxonomy-extension-parameters.ts` (BOOLEAN HEPA)

**Repo-wide search**

- strings: `Sesuai`, `Tidak sesuai`, `isWithinTolerance`, `toleranceMin`, `computeIsWithinTolerance`, `passFailChip`, `anyFail`
- certificate create in `apps/api` (none for CalibrationJob results)
- WorkOrder status vs measurement (no link)

---

## 20. CONFIRMATION

**NO CODE WAS MODIFIED.**

This file is the only artifact of the analysis. No application source, schema, enum, seed, or UI was changed. REWORK lifecycle was not modified.

---

## DIRECT ANSWER TO THE REQUIRED QUESTION

**When the UI displays "Tidak sesuai" for a MeasurementResult, exactly what does that mean in the CURRENT SYSTEM, and what does it NOT mean?**

**It means:** at the moment this row was created or last had its reading updated, the backend compared that row's **raw** `measuredValue` (NUMBER/RATIO) to the **snapshotted** `effectiveToleranceMin` / `effectiveToleranceMax` (or mirrored `measuredBool` for BOOLEAN), and stored `isWithinTolerance = false`. Tech-PWA then printed the label "Tidak sesuai" for that boolean. Nothing else was computed.

**It does not mean:** the device failed calibration; the CalibrationJob is FAIL; the job cannot be submitted; MT must reject; REWORK must start; completeness failed; a certificate is blocked; or WorkOrder status must change.

Those outcomes are **Not defined by current implementation.**
