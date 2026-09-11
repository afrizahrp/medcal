# MeasurementResult DecimalPlaces Implementation Report

**Date:** 2026-09-11  
**Source of truth:** `MeasurementResult_DecimalPlaces_Enforcement_Audit.md`  
**Audit verdict addressed:** `FRONTEND + BACKEND GAP`

---

## 1. Files changed

| File | Change |
|------|--------|
| `packages/shared/src/utils/measured-value-decimal-places.ts` | **New** — text-based precision helpers |
| `packages/shared/src/utils/measured-value-decimal-places.test.ts` | **New** — shared unit tests |
| `packages/shared/src/utils/index.ts` | Re-export helpers |
| `apps/tech-pwa/src/lib/calibration/measurement.ts` | Wire shared validator; `null` → no `step` restriction |
| `apps/tech-pwa/src/lib/calibration/measurement.test.ts` | Precision cases for dp 0/1/2/null |
| `apps/tech-pwa/src/app/jobs/[id]/measurements/[parameterId]/page.tsx` | DIRECT validation + error copy |
| `apps/tech-pwa/src/app/jobs/[id]/measurements/measurement-grid.tsx` | GRID same rule |
| `apps/api/src/modules/calibration-jobs/measurement-results.service.ts` | Load `decimalPlaces`; enforce on create/createMany/update |

**Not changed:** Prisma schema, migrations, tolerance engine, REWORK lifecycle, Physical Inspection, QualityReview, models.

---

## 2. Shared helper / validation implementation

Package: `@medcal/shared`

| Function | Role |
|----------|------|
| `fractionalDigitCount(raw)` | Digits after `.` from **text** (`"23.0"` → 1) |
| `respectsDecimalPlaces(raw, decimalPlaces)` | `count <= decimalPlaces`; **`null`/`undefined` = no restriction** |
| `validateMeasuredValuePrecision(raw, decimalPlaces)` | Shape first, then precision; distinguishes `invalid_format` vs `decimal_places_exceeded` |
| `measuredValueDecimalPlacesExceededMessage(n)` | ID copy (`Maksimal N angka di belakang koma.` / bilangan bulat for 0) |
| `isMeasuredValueNumericShape(raw)` | Existing `/^-?\d+(\.\d+)?$/` shape |

**No** `Number(value).toString()` as sole precision check. **No** auto-rounding.

---

## 3. Frontend validation

- `validateMeasuredValue` / `isValidMeasuredValue(raw, decimalPlaces?)` delegate to shared helper
- `decimalPlaces === null` → no fractional-digit cap (shape still required)
- `measuredValueInputStep(null)` → `"any"` (hint only; **not** enforcement)
- `formatMeasuredValue` **unchanged** (display-only; still may `toFixed` for read-only views)

---

## 4. DIRECT behavior

`[parameterId]/page.tsx`:

- Validates dirty drafts with `validateMeasuredValue(value, param.decimalPlaces)`
- Excess decimals → red border, footer `Maksimal N angka di belakang koma.`, **Simpan disabled**
- Invalid shape → existing “gunakan angka” copy
- Display `Desimal: —` when `decimalPlaces` is null (no longer coerce UI label to `0` for validation)

---

## 5. GRID behavior

`measurement-grid.tsx` — **same** parameter `decimalPlaces` rule (no test-point precision override).

---

## 6. Backend validation

`MeasurementResultsService`:

- `parameterSelect` includes `decimalPlaces`
- `assertMeasuredValueDecimalPlaces` before persist on **create**, **createMany**, **update**
- Update validates whenever `measuredValue` is present (including trailing-zero text that Decimal-equals the stored value)
- Tolerance resolution / `isWithinTolerance` **unchanged** and only runs after precision passes
- Strings keep trailing zeros for the check; numbers use `String(n)` (Tech-PWA submits strings)

---

## 7. Error code / message

| Field | Value |
|-------|--------|
| Code | `MEASUREMENT_DECIMAL_PLACES_EXCEEDED` |
| HTTP | `400 BadRequestException` |
| Message | From `measuredValueDecimalPlacesExceededMessage(decimalPlaces)` |
| Payload | `{ code, message, decimalPlaces, measuredValue }` |

Frontend local validation shows the same message before any API call. API `message` surfaces via `formatApiError` when the code is not overridden by a static map entry.

---

## 8. Null `decimalPlaces` behavior

| Layer | Behavior |
|-------|----------|
| Shared / FE / BE | **No** fractional-digit restriction |
| UI label | `Desimal: —` |
| HTML `step` | `any` |
| **Not** treated as `0` for validation (locked rule) |

---

## 9. Existing data handling

- No migration, no rewrite, no delete of historical `MeasurementResult` rows
- Reads/review unchanged for already-stored excess-precision values
- Rule is **prospective** on create / batch create / update only

---

## 10. Tests and results

| Suite | Result |
|-------|--------|
| `pnpm --filter @medcal/shared test` | **PASS** (46 tests) |
| `pnpm --filter @medcal/tech-pwa test` | **PASS** |
| `pnpm --filter @medcal/api exec vitest run …/measurement-results.service.test.ts` | **PASS** (37 tests, including new decimalPlaces block) |

Coverage added:

- Shared: dp 0/1/2/null, format vs excess reason
- Tech-PWA: same matrix + `step` null → `any`
- API: create reject/accept, createMany reject/accept, update reject/accept, GRID parameter rule, no silent round, null unrestricted

---

## 11. Typechecks

| Package | Result |
|---------|--------|
| `@medcal/shared` | **PASS** |
| `@medcal/tech-pwa` | **PASS** |
| `@medcal/api` | **FAIL (pre-existing)** — `PhysicalCheckVerdict` / `devicePhysicalCheckItem` / `physicalCheckResult` Prisma client drift in unrelated Physical Inspection modules. **No** errors reported in `measurement-results.service.ts` or the shared decimal helper. |

---

## 12. Build

Not run for full monorepo (API typecheck already blocked by unrelated Prisma client gaps). Tech-PWA typecheck passed; measurement-results tests passed against live DB seed.

---

## 13. Browser verification

**Not completed in this session** (auth-gated Tech-PWA; no automated login in scope).

**Manual checklist for the operator:**

1. Open a job parameter with `decimalPlaces = 1` (e.g. room temperature).
2. Enter `23.23` → field invalid, Simpan disabled, message *Maksimal 1 angka di belakang koma.*, no write.
3. Enter `23.2` / `23` / `23.0` → can save.
4. Confirm value is **not** silently rounded.
5. Repeat on a GRID parameter with `decimalPlaces = 1`.

---

## 14. Deviations

1. **API package `tsc`** fails due to **pre-existing** Physical Inspection Prisma typing issues — out of scope; not introduced by this change.
2. HTML `type="number"` left as-is; `step` remains a hint only (per audit — mandatory app-level validation added).
3. Browser verification deferred to manual checklist above.
4. Static `MESSAGES` map entry for the new code was **not** added so the API’s dynamic “Maksimal N…” message is preferred when the write is rejected server-side.

---

## Final verdict

### **PASS WITH NOTES**

Precision enforcement is implemented on Tech-PWA (DIRECT + GRID) and authoritatively on the MeasurementResultsService write boundary, with shared text-based helpers and tests green. Notes: API workspace typecheck still red for unrelated Physical Inspection Prisma drift; browser smoke left as a manual checklist.
