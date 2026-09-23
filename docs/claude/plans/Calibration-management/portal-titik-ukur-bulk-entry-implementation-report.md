# Portal Bulk Titik Ukur Grid Entry — Implementation Report

Implements the approved Stage 2 plan (Option A: transient sibling multi-select, no schema
change, per-cell tolerance override with a shared row-level default). Adds a second,
additional "Entri Grup" entry mode to the Portal's Titik Ukur section, letting MT fill one
setpoint row once across N sibling `DeviceCalibrationParameter`s (e.g. NIBP's
Systole/MAP/Diastole) instead of repeating "+ Tambah Titik Ukur" per parameter.

> Note: the Stage 1 audit report this work is based on
> (`portal-titik-ukur-bulk-entry-plan.md`) was reviewed with the user in chat but was never
> actually written to disk in this workspace — Stage 1's plan-mode session ended without
> that file being persisted. This implementation report stands on its own; if a durable
> Stage 1 record is wanted, it should be written as a separate follow-up.

## Files touched

### Layer 1 — Shared Zod schema
- `packages/shared/src/schemas/index.ts` — added `calibrationTestPointBulkCreateSchema`
  (+ private `calibrationTestPointBulkCellSchema` / `calibrationTestPointBulkRowSchema`) and
  the `CalibrationTestPointBulkCreateInput` type, directly after
  `calibrationTestPointReorderSchema`. Reuses `optionalFiniteNumber` and
  `refineToleranceBounds` verbatim — no duplicated validation logic.

### Layer 2 — Service layer
- `apps/api/src/modules/device-calibration-parameters/device-calibration-parameters.service.ts`
  - `assertUniqueTestPointLabel` and `assertSequenceAvailable` now take an optional Prisma
    client parameter (`client: Prisma.TransactionClient | typeof prisma = prisma`), mirroring
    the existing `resolveCapabilityId(tx, ...)` pattern already used elsewhere in this file.
    Existing call sites are unaffected (the new parameter defaults to the singleton).
  - New `createTestPointsBulk(input)`: verifies every `parameterId` exists via `findOne`,
    then runs one `prisma.$transaction`, iterating `rows × parameterIds` and reusing the two
    assert helpers (against the transaction client) plus a `tx.calibrationTestPoint.create`
    per non-null cell. Any `ConflictException` thrown inside the transaction aborts and rolls
    back the whole batch.
- `apps/api/src/modules/device-calibration-parameters/device-calibration-parameters.service.test.ts`
  — new `describe("DeviceCalibrationParametersService - createTestPointsBulk")` block, 5 tests
  (see Test Results below).

### Layer 3 — Controller endpoint
- `apps/api/src/modules/device-calibration-parameters/device-calibration-parameters.controller.ts`
  — added `POST /device-calibration-parameters/bulk-test-points`
  (`createTestPointsBulk`), same permission as the single-row create
  (`deviceCalibrationParameter`, `create`), validated with
  `calibrationTestPointBulkCreateSchema`.

### Layer 4 — Portal UI
- `apps/portal/src/app/management/device-calibration-parameters/use-calibration-test-points-query.ts`
  — added `useCalibrationTestPointsForMany(parameterIds)` (parallel fetch via `useQueries`,
  same query key as `useCalibrationTestPoints` so caches stay in sync) and
  `useCreateCalibrationTestPointsBulk()` (mutation hook posting to the new bulk endpoint,
  invalidating every affected parameter's test-point list on success).
- `apps/portal/src/app/management/device-calibration-parameters/calibration-test-point-form-utils.ts`
  — added `INVALID_CALIBRATION_TEST_POINT_BULK` to the existing generic-validation-error
  branch of `formatCalibrationTestPointApiError` (no new branch shape, just one more code).
- New: `apps/portal/src/app/management/device-calibration-parameters/calibration-test-point-bulk-picker.tsx`
  — sibling multi-select step, backed by the existing `useDeviceCalibrationParameters`
  (filtered by the current parameter's `deviceTypeId` + `capabilityItem.capabilityId`) and
  the new `useCalibrationTestPointsForMany`. Shows each candidate's current point
  count/max sequence and a non-blocking out-of-sync warning; requires ≥2 selected before
  continuing (matches the schema's `parameterIds.min(2)`).
- New: `apps/portal/src/app/management/device-calibration-parameters/calibration-test-point-bulk-grid.tsx`
  — the row × sibling-column grid. Computes `baseline = MAX(existing max sequence across all
  selected siblings)` client-side and assigns `sequence = baseline + rowIndex` identically
  across every column in a row (no per-parameter auto-append). Row-level default tolerance
  strip prefills all cells; a per-cell "Toleransi khusus…" toggle overrides just that cell.
  Submits one batch via `useCreateCalibrationTestPointsBulk`; a rejected mutation surfaces
  `formatCalibrationTestPointApiError`'s message (whole batch fails together — no partial
  commit UI path was built, matching the all-or-nothing transaction).
- `apps/portal/src/app/management/device-calibration-parameters/[id]/page.tsx` — added an
  "Entri Grup" button next to the existing "+ Tambah Titik Ukur" button, and two conditional
  render blocks (`bulkEntryStep === "picking" | "grid"`) wiring the picker → grid flow. The
  existing `addingTestPoint` state, `submitTestPoint` handler, and single-row form are
  completely untouched.

## Test Results (per `.claude/rules/testing.md`)

**Focused suite** — `pnpm --filter @medcal/api exec vitest run device-calibration-parameters.service.test.ts`
```
Test Files  1 passed (1)
     Tests  105 passed (105)
```
Includes the 5 new `createTestPointsBulk` tests:
- creates one row per selected sibling parameter for every row in the batch (happy path, 3×2)
- skips a parameter for a row whose cell is `null`
- rolls back the whole batch when one cell has a duplicate label, persisting nothing
- rolls back the whole batch when one cell's sequence is already occupied (out-of-sync sibling)
- rejects the batch when a parameterId does not exist

**Full API suite** — `pnpm --filter @medcal/api exec vitest run`
```
Test Files  8 failed | 60 passed (68)
     Tests  9 failed | 1271 passed (1280)
```
All 9 failures are **pre-existing and unrelated** to this change — none touch
`device-calibration-parameters`, `CalibrationTestPoint`, or any file this task modified:
- `calibration-request-import.service.test.ts` (+ 2 suites that import it transitively) —
  `Cannot find package 'unzipper'` (missing dependency, unrelated module).
- `imap-sync.service.test.ts` (5 tests) — `IMAP is not configured` (missing env/config in
  this environment).
- `notification-dispatch.service.test.ts` (2 tests) — `push.resolvePushIconUrl is not a
  function` (pre-existing gap in the push-tokens module).
- `contact-messages.push.test.ts` (1 test) — mock-call-count assertion mismatch, unrelated
  module.
- `registration-origin-callers.test.ts` (1 test) — an unrelated tech-pwa sign-up file flagged
  by an origin-header lint test.

**Typecheck**
```
pnpm --filter @medcal/shared exec tsc --noEmit   → clean
pnpm --filter @medcal/api exec tsc --noEmit      → clean
pnpm --filter @medcal/portal exec tsc --noEmit   → clean
```

**Manual UI verification — NOT performed.** No browser-automation tool was available in this
session to actually load the Portal dev server and click through the "Entri Grup" flow. The
UI was verified only via code review and a clean portal-package typecheck (which catches
prop/hook/type errors in the new components and their wiring), not via live rendering. This
should be manually smoke-tested before considering the feature done end-to-end.

## Confirmations

- **No schema/migration change occurred.** `packages/db/prisma/schema.prisma` was not
  touched; no new Prisma migration was generated.
- **The existing single-row "+ Tambah Titik Ukur" flow is unchanged** — its state, handlers,
  and form component were not modified; the new flow is purely additive (a new button, two
  new components, one new endpoint/service method).

## Out of Scope / Not Done

- Live browser verification of the grid UI (see above).
- The Stage 1 audit report file was not persisted to disk (see note at top).
