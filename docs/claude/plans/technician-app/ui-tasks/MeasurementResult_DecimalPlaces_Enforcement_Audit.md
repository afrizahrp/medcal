# MeasurementResult DecimalPlaces Enforcement Audit

**Mode:** READ-ONLY / AUDIT ONLY — no code, migration, or DB changes were made during this investigation.  
**Date:** 2026-09-11  
**Observed bug (Tech-PWA):** `DeviceCalibrationParameter.decimalPlaces = 1`, UI accepts `23.23` and shows green **Sesuai** (tolerance verdict, not decimal validation).

**Intended rule for this audit** (`decimalPlaces` = **maximum** digits after the decimal separator; **no auto-round**):

| decimalPlaces | Valid | Invalid |
|---------------|-------|---------|
| 1 | `23`, `23.0`, `23.2` | `23.23` |
| 2 | `23.2`, `23.23` | `23.234` |
| 0 | `23` | `23.0`, `23.2` |

---

## 1. Executive Summary

`DeviceCalibrationParameter.decimalPlaces` **is already present** on the Tech-PWA measurement-parameters payload and is shown in the entry UI (“Desimal: N”). It is used for HTML `step` hints and **display** formatting (`toFixed`). It is **not** enforced as an input-precision invariant on write.

There is **no** check that “fractional digit count ≤ `decimalPlaces`” in:

- Tech-PWA client validation (`isValidMeasuredValue`)
- shared Zod schemas for MeasurementResult (`measurementDecimalInput`)
- `MeasurementResultsService` create / createMany / update

Therefore `23.23` can be typed, saved, and still receive **Sesuai** when the value is within tolerance (e.g. 25 ± 5 °C).

### Final verdict

**`FRONTEND + BACKEND GAP`**

---

## 2. Current measurement input flow

```
Tech-PWA measurement input
      ↓
input component (DIRECT page / GRID grid)
      ↓
client-side validation (isValidMeasuredValue — shape only)
      ↓
API request (batch POST / single PATCH)
      ↓
shared schema / DTO (measurementDecimalInput)
      ↓
MeasurementResultsService (create / createMany / update)
      ↓
MeasurementResult database write (Prisma Decimal(18,6))
```

| Step | Exact file / function |
|------|------------------------|
| Catalog for entry | `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` — `listMeasurementParameters`, `toParameterSummary` |
| HTTP catalog | `GET /calibration-jobs/:id/measurement-parameters` — `CalibrationJobsController.listMeasurementParameters` |
| DIRECT entry UI | `apps/tech-pwa/src/app/jobs/[id]/measurements/[parameterId]/page.tsx` — drafts, `handleSave`, `isValidMeasuredValue` |
| GRID entry UI | `apps/tech-pwa/src/app/jobs/[id]/measurements/measurement-grid.tsx` — same pattern |
| Pure helpers | `apps/tech-pwa/src/lib/calibration/measurement.ts` — `isValidMeasuredValue`, `measuredValueInputStep`, `formatMeasuredValue` |
| API hooks | `apps/tech-pwa/src/app/jobs/[id]/measurements/use-measurements-query.ts` — `useCreateMeasurementBatch`, `useUpdateMeasurement` |
| HTTP write | `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts` — `createMeasurementResult`, `createMeasurementResultsBatch`, `updateMeasurementResult` |
| Shared Zod | `packages/shared/src/schemas/index.ts` — `measurementDecimalInput`, `measurementResultCreateSchema`, `measurementResultBatchCreateSchema`, `measurementResultUpdateSchema` |
| Service write | `apps/api/src/modules/calibration-jobs/measurement-results.service.ts` — `create`, `createMany`, `update`, `toDecimalOrNull` |
| DB column | `packages/db/prisma/schema.prisma` — `MeasurementResult.measuredValue` `@db.Decimal(18, 6)` |

---

## 3. Source of decimalPlaces

**Source of truth:** `DeviceCalibrationParameter.decimalPlaces` (`Int?`, catalog CHECK 0..10).

**Confirmed present** in Tech-PWA data path (not missing):

| Location | Status |
|----------|--------|
| Prisma catalog field | Present |
| `measurementParameterSelect` (`decimalPlaces: true`) | Present |
| `toParameterSummary` → `decimalPlaces: row.decimalPlaces` | Pass-through, not defaulted in API |
| `MeasurementParameterSummary` / `TechMeasurementParameter` | Typed as `number \| null` |
| `parameters[]` (DIRECT) | Present |
| `gridParameters[]` (GRID) | Present |
| `capabilityGroups[].parameters[]` | Present (same summary shape) |
| Measurement entry local state | `const dp = param.decimalPlaces ?? 0` (null coerced to 0 **only in UI**) |

Catalog CRUD schemas (`optionalDecimalPlaces` in shared) validate the **parameter definition**, not MeasurementResult writes.

---

## 4. Frontend validation status

### What exists today

| Mechanism | Uses `decimalPlaces`? | Enforces max fractional digits? |
|-----------|----------------------|---------------------------------|
| `isValidMeasuredValue(raw)` | No | **No** — only `/^-?\d+(\.\d+)?$/` |
| `<input type="number" step={measuredValueInputStep(dp)}>` | Yes (`step`) | **No** — browsers allow typing past `step`; React does not run native step constraint before save |
| Zod on client | N/A | No |
| Parsing / normalization before submit | N/A | Raw trimmed string is sent |
| `formatMeasuredValue` | Yes | **Display only** — uses `Number` + `toFixed(dp)` (rounds for display); comments explicitly say it must not transform API values |

### Conceptual matrix (current behavior)

All of the following **pass** `isValidMeasuredValue` today:

| decimalPlaces | `23` | `23.2` | `23.23` | `23.234` |
|---------------|-----|--------|---------|----------|
| 0 | accepted | accepted (bug vs intended) | accepted | accepted |
| 1 | accepted | accepted | **accepted (bug)** | accepted |
| 2 | accepted | accepted | accepted | **accepted (bug)** |
| `null` (UI → 0) | same as 0 | | | |

`hasInvalid` only blocks non-numeric shapes; save is not blocked for excess decimals.

### Screenshot clarification

Green **Sesuai** comes from `passFailChip(isWithinTolerance)` after a successful write — tolerance engine verdict — **not** from decimalPlaces validation.

---

## 5. Backend validation status

**Report:** Frontend-only enforcement currently exists for *hints/display*; **no backend enforcement** of fractional digit count exists. (Frontend digit-count enforcement is also missing — see §4.)

`MeasurementResultsService`:

- `parameterSelect` loads `id`, `valueType`, tolerance fields — **does not** select `decimalPlaces`
- `create` / `createMany` / `update` resolve effective tolerance, compute `isWithinTolerance`, then `toDecimalOrNull(measuredValue)`
- No assert comparing digit scale to catalog `decimalPlaces`
- No error code for precision violations

Tolerance math (`measurement-tolerance.ts`) is unrelated to decimalPlaces.

---

## 6. Shared schema status

`measurementDecimalInput` (`packages/shared/src/schemas/index.ts`):

- Accepts finite `number` or string matching `/^-?\d+(\.\d+)?$/`
- `""` / `null` → `null`
- Preserves string form for precision beyond float (by design)
- **Does not** (and cannot alone) enforce catalog `decimalPlaces` — request body has no parameter precision field

`optionalDecimalPlaces` applies only to DeviceCalibrationParameter create/update schemas.

---

## 7. DIRECT behavior

Pattern A (`[parameterId]/page.tsx`):

- Reads `param.decimalPlaces ?? 0`
- Shows “Desimal: {dp}”
- Validates dirty values with `isValidMeasuredValue` only
- Submits string `measuredValue` via batch create / PATCH update

**Gap applies uniformly** to all replicates. No separate DIRECT business rule needed.

---

## 8. GRID behavior

Pattern B (`measurement-grid.tsx`):

- Same `dp`, `step`, `isValidMeasuredValue`, submit path
- Cells keyed by test point × direction × replicate

**Same gap** as DIRECT. Do not invent separate DIRECT vs GRID precision rules unless domain later requires it (current code does not).

---

## 9. Replicate behavior

No per-replicate precision override. Soft default replicate counts (`DEFAULT_REPLICATE_COUNT` / `expectedReplicateCount`) are unrelated. All replicates inherit the parameter’s `decimalPlaces`. **Gap is identical** across replicates.

---

## 10. REWORK behavior

No REWORK-specific decimalPlaces logic.

- Writes allowed only while job is `IN_PROGRESS` (`assertMeasurementRowEditable`)
- `REWORK` locks measurement entry until attempt is resumed
- Superseded `attemptNumber` rows are immutable
- After resume, new attempt uses the same entry UIs → **same gap**

---

## 11. API bypass possibility

**Yes — backend enforcement gap.**

A client can `POST /calibration-jobs/:id/measurement-results` (or `/batch`, or `PATCH`) with:

```json
{ "measuredValue": "23.23", "deviceCalibrationParameterId": "...", "replicateIndex": 1 }
```

while the parameter has `decimalPlaces = 1`:

1. Zod accepts the string (numeric shape OK)
2. Service does not check digit count
3. Value persists in `Decimal(18, 6)`
4. `isWithinTolerance` may still be `true` → UI chip **Sesuai**

The final fix should enforce the invariant at the **backend write boundary** and give immediate **frontend** feedback. Do not rely on UI alone.

---

## 12. Decimal-safe validation recommendation

### Representation today

| Layer | Representation |
|-------|----------------|
| Input draft | string |
| Wire `measuredValue` | string preferred (or number); Zod keeps string as string |
| Service | `number \| string \| null` → `Prisma.Decimal` |
| DB | `Decimal(18, 6)` — schema comment: raw as entered, **never rounded** for storage / tolerance |

### Prefer text-based digit count

Do **not** use `Number(value).toString()` as the sole validator (float / trailing-zero / scientific-notation hazards).

Prefer validating the **textual** numeric form (aligned with existing wire design), e.g.:

```ts
function fractionalDigitCount(raw: string): number {
  const t = raw.trim();
  const m = /^-?\d+(?:\.(\d+))?$/.exec(t);
  if (!m) return -1; // invalid shape
  return m[1]?.length ?? 0;
}

function respectsDecimalPlaces(raw: string, decimalPlaces: number | null): boolean {
  // Decide explicitly: null → skip vs treat as 0 (UI today uses ?? 0)
  if (decimalPlaces == null) return true; // or treat as 0 — product choice
  const n = fractionalDigitCount(raw);
  return n >= 0 && n <= decimalPlaces;
}
```

If the payload is already a JS `number`, convert via Decimal.js / Prisma Decimal to a plain decimal string (no scientific notation), then count — or require string on the tech write path.

### Hard rule

User enters `23.23` with `decimalPlaces = 1` → **reject / flag invalid**.  
**MUST NOT** silently become `23.2`.

### Display vs input (do not conflate)

| Concern | Current behavior |
|---------|------------------|
| Input precision rule | **Missing** |
| Display formatting | `formatMeasuredValue` rounds with `toFixed(dp)` in Tech-PWA read-only |
| Portal MT review | Shows `row.measuredValue` raw string (no `decimalPlaces` formatting in the review table inspected) |

A value must not be silently rounded on write because display uses one decimal place.

---

## 13. Exact files/functions that would need changes

Smallest correct fix surface (implementation not in scope of this audit):

| Area | Path | Change |
|------|------|--------|
| Shared helper (recommended) | `packages/shared` (new util + tests) | Text-safe `fractionalDigitCount` / `respectsDecimalPlaces` |
| Frontend validator | `apps/tech-pwa/src/lib/calibration/measurement.ts` — `isValidMeasuredValue` | Accept `decimalPlaces`; reject excess digits |
| Unit tests | `apps/tech-pwa/src/lib/calibration/measurement.test.ts` | Cases for dp 0/1/2/null |
| DIRECT UI | `.../measurements/[parameterId]/page.tsx` | Pass `dp` into validator; clearer error copy |
| GRID UI | `.../measurements/measurement-grid.tsx` | Same |
| Optional UX | same inputs | Prefer `type="text"` + `inputMode="decimal"` if `type="number"` keeps fighting precision control |
| Backend service | `measurement-results.service.ts` — `parameterSelect`, `create`, `createMany`, `update` | Load `decimalPlaces`; reject with a dedicated code (e.g. `MEASUREMENT_DECIMAL_PLACES_EXCEEDED`) |
| Backend tests | `measurement-results.service.test.ts` (+ controller tests if needed) | Bypass / happy-path cases |
| Shared Zod alone | `measurementDecimalInput` | **Insufficient by itself** — enforce after catalog load in service |

### Explicitly out of scope for the fix

- `MeasurementResult` model shape
- `DeviceCalibrationParameter` model (field already exists)
- Tolerance engine / PASS-FAIL semantics
- `capabilityGroups` structure
- Physical Inspection
- QualityReview / REWORK lifecycle / submit-approve-complete

---

## 14. Tests that should be added

### Shared / Tech-PWA unit

- `decimalPlaces = 1`: `23`, `23.0`, `23.2` valid; `23.23` invalid
- `decimalPlaces = 2`: `23.23` valid; `23.234` invalid
- `decimalPlaces = 0`: `23` valid; `23.0`, `23.2` invalid
- trim / leading `-`
- assert **no** silent rounding in validator or service

### API / service

- create with `23.23` when parameter `decimalPlaces = 1` → `400` + clear code
- create with `23.2` when `decimalPlaces = 1` → success
- createMany (batch) same rejection
- update (PATCH) same rejection
- GRID row (`calibrationTestPointId` set) same rule from parameter
- superseded attempt / locked job regressions unchanged

### UI regression (manual or component)

- excess decimals → `hasInvalid`, Simpan disabled, red border
- **Sesuai** chip remains tolerance-only (must not be mistaken for precision OK)

---

## 15. Final verdict

**`FRONTEND + BACKEND GAP`**

| Layer | Enforces digit count ≤ `decimalPlaces`? |
|-------|------------------------------------------|
| Catalog field + measurement-parameters API | Data available |
| Tech-PWA label / `step` / display `toFixed` | Hint / format only |
| Tech-PWA input validation | **Missing** |
| Shared MeasurementResult Zod | **Missing** |
| `MeasurementResultsService` write boundary | **Missing** |
| Direct API bypass | **Possible** |

### Verdict options considered

| Option | Why not / why yes |
|--------|-------------------|
| `ALREADY ENFORCED` | No — digit rule nowhere on write |
| `FRONTEND GAP ONLY` | Incomplete — API bypass remains |
| `BACKEND GAP ONLY` | Incomplete — UX currently accepts excess digits |
| **`FRONTEND + BACKEND GAP`** | **Correct** |
| `REQUIRES DOMAIN CLARIFICATION` | Not required for this audit: brief defines **maximum** digits, no auto-round. Note: Prisma catalog comment says digits are “required”; if product later wants **exact** length instead of maximum, that would be a separate clarification. |

### Smallest correct fix (for a later implementation task)

1. Text-based max-fractional-digit helper  
2. Wire into Tech-PWA `isValidMeasuredValue` (+ DIRECT/GRID call sites)  
3. Assert the same rule in `MeasurementResultsService` create / createMany / update after loading `decimalPlaces`  
4. Reject — never auto-round  

---

## Appendix — Key code anchors (read-only citations)

### Frontend shape-only validator

`apps/tech-pwa/src/lib/calibration/measurement.ts` — `isValidMeasuredValue` matches plain decimals with unlimited fractional length; `formatMeasuredValue` documents display-only use of `decimalPlaces`.

### Service catalog select (no decimalPlaces)

`apps/api/src/modules/calibration-jobs/measurement-results.service.ts` — `parameterSelect` omits `decimalPlaces`; writes call `toDecimalOrNull` without precision assert.

### Shared wire schema

`packages/shared/src/schemas/index.ts` — `measurementDecimalInput` validates numeric shape only.

### Storage invariant comment

`packages/db/prisma/schema.prisma` — `MeasurementResult.measuredValue`: raw as entered, full precision, never rounded for tolerance computation.
