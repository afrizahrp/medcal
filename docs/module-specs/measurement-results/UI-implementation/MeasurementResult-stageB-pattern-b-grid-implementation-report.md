# STAGE B — Pattern B Measurement Entry UI — Implementation Report

**Date:** 2026-09-09
**Scope:** tech-pwa measurement entry for **Pattern B** test-point grids
(`valueType = NUMBER`, `entryStyle = DIRECT_REPLICATES`, active
`CalibrationTestPoint` children), additive on the Stage A Pattern A skeleton.
**Predecessor:** [STAGE B — Pattern B Measurement Entry UI Design.md](./STAGE%20B%20—%20Pattern%20B%20Measurement%20Entry%20UI%20Design.md).

**HARD STOP — REWORK / increment `currentAttempt` remains a future plan.** See
[attempt-increment-diagnosis.md](../attempt-increment-diagnosis.md). This PR does
not add `submitForReview`, `returnForRework`, `resumeAfterRework`, QualityReview,
or a "Mulai attempt baru" button. Filter `attemptNumber === currentAttempt` is
unchanged (normal cycle today is always 1).

---

## 0. TL;DR

| # | Item | Outcome |
|---|---|---|
| 1 | Picker additive | `GET /calibration-jobs/:id/measurement-parameters` still returns Pattern A in `parameters`. New `gridParameters` (empty array if none) with nested active test points. Predicate A **unchanged**. |
| 2 | LOGGER_SUMMARY | Stays out of **both** arrays via `entryStyle`. Regression test run (not just planned): zero-children logger row excluded from A and B; logger row **with** a test point still excluded from B. |
| 3 | `SUCT_VACUUM_GAUGE` | Excluded from `gridParameters` by code allowlist. Covered by test. |
| 4 | Grid UI | Same routes. List splits **Pembacaan langsung** / **Grid titik uji**. Entry branches to `measurement-grid.tsx` when the param is in `gridParameters`. Sticky setpoint column, I–N replicates, chip after save from `isWithinTolerance`. |
| 5 | Replicate / direction | Soft allowlist: `VENT_*` / `AUD_*` → 3 columns, else 5. `SPHYG_PRESSURE_ACC` → Naik/Turun sub-rows. `+ Tambah ulangan` kept. No schema field. |
| 6 | Batch | New cells `POST .../batch` with `calibrationTestPointId` + `direction`; edits `PATCH`. Chunked at 200. |
| 7 | Polling / lock | Unchanged from Stage A. REWORK UI copy left as-is (still locked until a future resume API exists). |
| 8 | Tests | api `calibration-jobs.service.test.ts`: **90 passed** (includes Pattern A regression, LOGGER_SUMMARY, Pattern B grid, SUCT exclude). tech-pwa: **27 passed** / 2 files (`measurement.test.ts` now 24). |
| 9 | Typecheck | `@medcal/api` `tsc --noEmit` exit 0. `@medcal/tech-pwa` `tsc --noEmit` exit 0. |
| 10 | Manual | Click-through BSM / Ventilator **not run** here (no authenticated technician session + live stack in this pass). Logic covered by unit tests. |

---

## 1. API — picker additive

`listMeasurementParameters` in
[`calibration-jobs.service.ts`](../../../../../apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts):

- Pattern A query **identical**: `NUMBER` + `DIRECT_REPLICATES` + `isActive` + `testPoints: { none: {} }`.
- Parallel Pattern B query: same plus `testPoints: { some: { isActive: true } }`, `code: { notIn: ["SUCT_VACUUM_GAUGE"] }`.
- Nested points: `isActive: true`, `orderBy: sequence asc`. Inactive points (e.g. a deactivated 60 BPM) are omitted.
- Unresolved device type: `{ deviceType: null, parameters: [], gridParameters: [] }`.

No new HTTP path or permission. Batch create already accepted `calibrationTestPointId` / `direction`.

### 1.1 Tests actually run

```
pnpm --filter @medcal/api test -- src/modules/calibration-jobs/calibration-jobs.service.test.ts
→ Test Files 1 passed, Tests 90 passed
```

`prepare-test-db` applied the three MeasurementResult migrations on `pkmdb_test` first.

Assertions that matter for Stage B:

- Pattern A still only `MP_A` in `parameters`; `MP_B` (has a test point) lands in `gridParameters` with `settingLabel` / `settingValue`.
- `BBR_STORAGE_TEMP_STYLE` (`LOGGER_SUMMARY`, zero children) is in **neither** array.
- `MP_GRID` with two points (one inactive) → `gridParameters` contains only the active point; `LOGGER_WITH_POINT` and `SUCT_VACUUM_GAUGE` are absent from `gridParameters`.

```
pnpm --filter @medcal/api exec tsc --noEmit  → exit 0
```

---

## 2. tech-pwa helpers

[`measurement.ts`](../../../../../apps/tech-pwa/src/lib/calibration/measurement.ts):

- `TechMeasurementTestPoint`, `gridParameters` on the GET mirror, optional `testPoints` on a parameter.
- `MeasurementBatchItem` now may send `calibrationTestPointId` and `direction`.
- `expectedReplicateCount(code)` / `usesDirection(code)` / `gridEntryStatus(...)`.

Lock helpers were **not** rewritten.

```
pnpm --filter @medcal/tech-pwa test -- src/lib/calibration/measurement.test.ts
→ Test Files 1 passed, Tests 24 passed
```

(Stage A file was 16 cases + new allowlist / grid-status cases. Full package later: 27.)

---

## 3. List + job detail

- List: two sections; A filter `calibrationTestPointId === null`; B `!== null`; both `attemptNumber === currentAttempt`. Empty state only when A and B are both empty.
- Job detail `MeasurementsSection` takes `gridParameters` + `gridRowsByParameter`. Link shows if A>0 or B>0.
- Row chip for B uses `gridEntryStatus` (cells, not 1D replicates). `pointCount` shown on list rows.

---

## 4. Entry grid

[`measurement-grid.tsx`](../../../../../apps/tech-pwa/src/app/jobs/[id]/measurements/measurement-grid.tsx)
on the same route `/jobs/:id/measurements/:parameterId`.

- Data key = `testPoint.id` (not `settingLabel`) so duplicated `90 %SpO2` points do not collide.
- Sticky first column + horizontal scroll.
- One-point params (VENT_PEEP) are a 1-row table, not a special component.
- Sphyg: two sub-rows (`UP` / `DOWN`) per setpoint.
- Chip only on saved cells, from write/list `isWithinTolerance`.
- Partial save; batch chunk 200; `decimalPlaces` read from the field.

Pattern A vertical screen is unchanged (still filters `calibrationTestPointId === null`).

---

## 5. Soft-spot adjustments vs design

None that change the locked design. Implementation details:

- Inactive `CalibrationTestPoint` rows are filtered in the nested select, not only via parent `some`.
- Client uses `gridParameters?.find` so a missing field does not throw.
- Roman headers I–XII then fall back to the number.

---

## 6. Files

**New**

| File | Purpose |
|---|---|
| `apps/tech-pwa/src/app/jobs/[id]/measurements/measurement-grid.tsx` | Pattern B grid entry |
| `docs/.../UI-implementation/MeasurementResult-stageB-pattern-b-grid-implementation-report.md` | this report |

**Modified**

| File | Change |
|---|---|
| `apps/api/.../calibration-jobs.service.ts` | `gridParameters` query + types |
| `apps/api/.../calibration-jobs.service.test.ts` | regression A/LOGGER + B/SUCT cases |
| `apps/tech-pwa/src/lib/calibration/measurement.ts` | types + helpers |
| `apps/tech-pwa/src/lib/calibration/measurement.test.ts` | allowlist + `gridEntryStatus` |
| `apps/tech-pwa/.../measurements/page.tsx` | two groups |
| `apps/tech-pwa/.../measurements/measurements-ui.tsx` | `pointCount` / grid status |
| `apps/tech-pwa/.../measurements/[parameterId]/page.tsx` | branch to grid |
| `apps/tech-pwa/.../job-detail-ui.tsx` | `MeasurementsSection` A+B |
| `apps/tech-pwa/.../jobs/[id]/page.tsx` | separate result maps |

---

## 7. Verifikasi

| Check | Result |
|---|---|
| api measurement-parameters suite (in 90-test file) | 90 passed |
| api `tsc --noEmit` | exit 0 |
| tech-pwa `measurement.test.ts` | 24 passed |
| tech-pwa full vitest | 27 passed / 2 files |
| tech-pwa `tsc --noEmit` | exit 0 |
| Manual BSM IN_PROGRESS (7 A + HR/RESP/SpO2/NIBP B, chips, re-save) | **not run** — needs api + tech-pwa + technician session |
| Manual Ventilator I–III / VENT_PEEP 1 row | **not run** (same) |
| Manual Sphyg Naik/Turun | skipped (not a merge blocker; allowlist is in code + unit tests) |
| REWORK / attempt 2 | **out of scope** — not verified, not implemented |

---

## 8. HARD STOP

REWORK remains a future plan. Do not treat this PR as having closed
`attempt-increment-diagnosis.md`. LOGGER_SUMMARY UI is Stage C.
`SUCT_VACUUM_GAUGE` stays Pattern D.
