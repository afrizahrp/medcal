# STAGE 2c — API Endpoints for MeasurementResult — Implementation Report

**Date:** 2026-09-08
**Mode:** Controller + Zod request schemas + RBAC wiring only. **No tech-pwa / Portal UI.**
**Service layer (Stage 2b):** unchanged except two genuinely-new needs, flagged in §2.
**Depends on:** Stage 2b (`MeasurementResultsService`), Stage 2a schema.

**HARD STOP after this report — await review before any tech-pwa / Portal UI work.**

---

## 0. TL;DR

| # | Item | Outcome |
|---|---|---|
| 1 | Routes | 5, added to the existing `CalibrationJobsController` (not a new controller — reference-equipment-used etc. live there too). Nested under the job. |
| 2 | Job param name | `:id` (this controller's convention), **not** `:jobId` as the task text wrote — followed the file. Row param is `:measurementId`. Flagged. |
| 3 | Request schemas | `measurementResultCreateSchema`, `measurementResultBatchCreateSchema`, `measurementResultUpdateSchema` in `packages/shared/src/schemas/index.ts`, same `safeParse` + `BadRequestException({code, issues})` pattern as the identity-correction / reference-equipment schemas. |
| 4 | RBAC | `@RequirePermission("calibrationJob", "recordMeasurement")` on all four mutating routes; `("calibrationJob", "read")` on the GET — the existing view-level grant, no new read permission (matches every other GET in this controller). |
| 5 | Service changes (new need) | `list(companyId, jobId)` added (no Stage 2b read method existed); `update` / `remove` gained an optional `calibrationJobId` scoping arg so a `/jobA/…/:idFromJobB` request 404s instead of editing across jobs. Both flagged. |
| 6 | Response shape | The full `MeasurementResult` row (incl. `effectiveToleranceMin/Max`, `isWithinTolerance`, `appliedNominalValue`, `attemptNumber`, `recordedBy*`) on every create / update / list — tech-pwa shows pass/fail with no second round-trip. |
| 7 | Decimal serialization | Prisma `Decimal` → JSON **string** (decimal.js `toJSON`), e.g. `"effectiveToleranceMax": "100"`. Same behaviour as `DeviceCalibrationParameter.toleranceMin` responses today. No interceptor, no `.toNumber()` — consistent with the rest of the API. §5. |
| 8 | Error mapping | Service throws `BadRequestException` (guard, validation, unknown parameter/test-point) → HTTP 400; `ConflictException` (`MEASUREMENT_DUPLICATE_ENTRY`) → 409; `NotFoundException` → 404. No global exception filter exists; NestJS defaults format `{ statusCode, message, code, … }` exactly as IdentityCorrection errors do. §6. |
| 9 | Tests | 10 new (7 controller route + 3 guard-chain) in `measurement-results.service.test.ts`. `calibration-jobs` module suite: **136 passed** (was 126). |
| 10 | Full suite | No regression — identical to the Stage 2a/2b baseline (6 failed files, all pre-existing infra suites). §7. |

---

## 1. Files changed

**Modified:**

| File | Change |
|---|---|
| `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts` | Inject `MeasurementResultsService`; add 5 routes + `Delete`/`Patch`/`HttpCode` imports. |
| `apps/api/src/modules/calibration-jobs/measurement-results.service.ts` | `list()` added; `update()` / `remove()` take an optional `calibrationJobId` scope; explicit `Promise<MeasurementResultRow>` return types (TS `isolatedDeclarations`-style portability — the inferred Prisma payload type is not nameable across the package boundary). |
| `packages/shared/src/schemas/index.ts` | 3 new schemas + `MEASUREMENT_DIRECTION_VALUES` / `MEASUREMENT_ENTRY_KIND_VALUES` + `measurementDecimalInput` helper. |
| `apps/api/src/modules/calibration-jobs/measurement-results.service.test.ts` | +10 tests (controller routes + guard chain); auth-session mock added. |

**No new files.** `calibration-jobs.module.ts` already registered `MeasurementResultsService` (Stage 2b), so the controller wiring needed no module change.

---

## 2. Deviations / new needs (flagged, not silently absorbed)

1. **`:id` vs `:jobId`.** The task text specced `POST /calibration-jobs/:jobId/measurement-results`.
   The existing controller uniformly uses `:id` for the job (`:id/reference-equipment-used`,
   `:id/identity-corrections/:correctionId`). Kept `:id` for consistency; the row segment is
   `:measurementId`. Full paths in §3.

2. **`list()` is new.** Stage 2b shipped no read method (it was CRUD-write only). The task anticipated
   this ("confirm if a Stage 2b read method exists or needs adding — flag if so, small addition").
   Added `MeasurementResultsService.list(companyId, jobId)` — company-scoped, asserts the job exists,
   returns rows in worksheet order: `parameter.sortOrder → deviceCalibrationParameterId →
   testPoint.sequence → replicateIndex → direction → attemptNumber` (the §8.2 export/display order).

3. **`update` / `remove` job-scoping.** Stage 2b's `update(companyId, id, …)` / `remove(companyId, id)`
   looked a row up by `{id, companyId}` only. Under a nested route, a request to
   `PATCH /calibration-jobs/<jobB>/measurement-results/<rowOnJobA>` would have succeeded. Added an
   **optional** trailing `calibrationJobId` arg — when the controller passes it, a cross-job id pair
   returns `MEASUREMENT_RESULT_NOT_FOUND` (404). The arg is optional so Stage 2b's direct-call tests
   and any future non-nested caller are unaffected. Covered by a test.

No other service behaviour changed. `create` / `createMany` already took `calibrationJobId` in their
input and were scoped correctly.

---

## 3. Route list

| Method | Path | Permission | Service call | Returns |
|---|---|---|---|---|
| `GET` | `/calibration-jobs/:id/measurement-results` | `calibrationJob:read` | `list(companyId, id)` | `MeasurementResult[]` (worksheet order) |
| `POST` | `/calibration-jobs/:id/measurement-results` | `calibrationJob:recordMeasurement` | `create(companyId, {…body, calibrationJobId:id}, userId)` | `MeasurementResult` (201) |
| `POST` | `/calibration-jobs/:id/measurement-results/batch` | `calibrationJob:recordMeasurement` | `createMany(companyId, items.map(+calibrationJobId), userId)` | `MeasurementResult[]` (201) |
| `PATCH` | `/calibration-jobs/:id/measurement-results/:measurementId` | `calibrationJob:recordMeasurement` | `update(companyId, measurementId, body, userId, id)` | `MeasurementResult` (200) |
| `DELETE` | `/calibration-jobs/:id/measurement-results/:measurementId` | `calibrationJob:recordMeasurement` | `remove(companyId, measurementId, id)` | — (204) |

`calibrationJob:recordMeasurement` was defined and granted (TECHNICIAN + TECHNICIAN_MANAGER) in
Stage 2b; this stage only wires `@RequirePermission`. The GET reuses `calibrationJob:read` — every
other GET in this controller does the same (`identity-corrections`, `reference-equipment-used`,
candidates), so no measurement-specific read grant was invented.

---

## 4. Request schemas

`packages/shared/src/schemas/index.ts`, section "Calibration Job — MeasurementResult (Stage 2c)".

```ts
measurementResultCreateSchema = z.object({
  deviceCalibrationParameterId: z.string().min(1),
  calibrationTestPointId:       z.string().min(1).nullable().optional(),
  replicateIndex:               z.coerce.number().int().min(1),
  direction:                    z.enum(["NONE","UP","DOWN"]).optional(),
  entryKind:                    z.enum(["DIRECT_READING","LOGGER_SUMMARY"]).optional(),
  measuredValue:                measurementDecimalInput,   // number | numeric-string | "" | null
  referenceValue:               measurementDecimalInput,
  measuredBool:                 z.boolean().nullable().optional(),
  measuredText:                 z.string().trim().max(500).nullable().optional(),
  uomId:                        z.string().min(1).nullable().optional(),
  suppliedNominalValue:         measurementDecimalInput,   // Pattern D generic-slot setpoint
  attachmentFileObjectId:       z.string().min(1).nullable().optional(),
  note:                         z.string().trim().max(2000).nullable().optional(),
});

measurementResultBatchCreateSchema = z.object({ items: z.array(measurementResultCreateSchema).min(1).max(200) });

measurementResultUpdateSchema = z.object({
  measuredValue, referenceValue, measuredBool, measuredText, note   // editable subset ONLY
}).refine(atLeastOneFieldPresent);
```

- **`calibrationJobId` is never in the body** — it comes from the path and the controller injects it.
- **Update excludes `direction` / `replicateIndex` / `calibrationTestPointId` / `entryKind`** — they
  are natural-key components; changing one is a delete + create, per Stage 2b. `.refine` rejects an
  empty body.
- **`measurementDecimalInput`** accepts a JS `number` *or* a numeric string (`/^-?\d+(\.\d+)?$/`) and
  maps `""` / `null` → `null`. The string form lets a client preserve precision past float before the
  value lands in `Decimal(18,6)` — the service already accepts `number | string | null`. Batch cap
  200 covers the largest real worksheet (`SUCT_VACUUM_GAUGE` = 36 rows/attempt) with headroom.

Validation failure → `BadRequestException({ message, code: "INVALID_MEASUREMENT_RESULT" |
"…_BATCH" | "…_UPDATE", issues: error.flatten() })` — identical shape to
`INVALID_IDENTITY_CORRECTION_SUBMIT` etc.

---

## 5. Response shape + Decimal serialization

**Shape.** Every create / update / batch / list returns the raw `MeasurementResult` row(s) — no
projection. tech-pwa needs `isWithinTolerance` + `effectiveToleranceMin/Max` + `appliedNominalValue`
in the write response to render the pass/fail chip immediately; returning the whole row is also what
`replaceReferenceEquipmentUsed` and `submitIdentityCorrection` do.

**Decimal.** There is **no global serialization interceptor** in this API (`main.ts` only wires
CORS). `JSON.stringify` on a Prisma `Decimal` calls decimal.js `toJSON()` → a **string**:

```json
{
  "measuredValue": "42",
  "effectiveToleranceMin": "0",
  "effectiveToleranceMax": "100",
  "appliedNominalValue": null,
  "isWithinTolerance": true
}
```

This is **the same wire representation** the Portal already receives for
`DeviceCalibrationParameter.toleranceMin/Max` and `PriceListItem.unitPrice` — verified: those
endpoints also return the Prisma object directly with no `.toNumber()`. The known
"Decimal doesn't JSON-serialize" bug class is about `Decimal` becoming `{}` — that only happens for
plain `JSON.stringify` of a **non-Prisma** decimal without `toJSON`; Prisma's `Decimal` has `toJSON`,
so it renders as a string, and the controller tests assert on `.toString()` accordingly. No change
needed; flagged as confirmed.

---

## 6. Error mapping

No global exception filter — NestJS's built-in `BaseExceptionFilter` handles everything, exactly as
for the rest of the API.

| Service throw | HTTP | Body `code` | Trigger |
|---|---|---|---|
| `BadRequestException` | 400 | `MEASUREMENT_JOB_SUBMITTED` | write after submit / on a locked status |
| `BadRequestException` | 400 | `MEASUREMENT_ATTEMPT_SUPERSEDED` | write on `attemptNumber < job.currentAttempt` |
| `BadRequestException` | 400 | `CALIBRATION_JOB_NOT_STARTED` | create before `startedAt` is set |
| `BadRequestException` | 400 | `DEVICE_CALIBRATION_PARAMETER_NOT_FOUND` / `CALIBRATION_TEST_POINT_NOT_FOUND` / `CALIBRATION_TEST_POINT_PARAMETER_MISMATCH` | bad catalog reference in the body |
| `BadRequestException` | 400 | `INVALID_MEASUREMENT_RESULT` / `…_BATCH` / `…_UPDATE` | Zod validation failure (`issues` attached) |
| `ConflictException` | 409 | `MEASUREMENT_DUPLICATE_ENTRY` | natural-key `P2002` (translated, never a raw DB error) |
| `NotFoundException` | 404 | `CALIBRATION_JOB_NOT_FOUND` | job missing / other company |
| `NotFoundException` | 404 | `MEASUREMENT_RESULT_NOT_FOUND` | row missing, or `:measurementId` belongs to a different job |
| `ForbiddenException` | 403 | `Forbidden` | `CompanyRoleGuard` — no `recordMeasurement` grant / wrong company / inactive |

Spot-checked against IdentityCorrection: `assertIdentityGateOpen` also throws
`BadRequestException` → 400 with a `code`, and `IDENTITY_CORRECTION_ALREADY_PENDING` is a
`ConflictException` → 409. Same conventions.

---

## 7. Test results

### 7.1 New tests (10) — all green

```
measurement-results.service.test.ts
  CalibrationJobsController — measurement-results routes            (7)
    POST create → returns row with resolved verdict (no 2nd round-trip)
    POST /batch → creates many, GET lists in worksheet order
    PATCH → updates value, re-stamps editor, recomputes verdict
    DELETE → removes the row
    body missing deviceCalibrationParameterId → INVALID_MEASUREMENT_RESULT
    post-submit guard → MEASUREMENT_JOB_SUBMITTED surfaces as HTTP 400
    PATCH for a measurement on a different job → 404 MEASUREMENT_RESULT_NOT_FOUND
  CalibrationJobsController — measurement RBAC (guard chain)        (3)
    TECHNICIAN may create; FINANCE blocked (403); TECHNICIAN may list
```

Plus the 24 Stage 2b tests in the same file and 20 in `measurement-tolerance.test.ts`, unchanged.

`calibration-jobs` module suite (4 files): **136 passed** (was 126 after Stage 2b).
`apps/api` typecheck (`tsc --noEmit`), `@medcal/shared` typecheck: clean.

### 7.2 Full `apps/api` suite

```
$ pnpm --filter @medcal/api test        (fresh pkmdb_test, re-migrated + re-seeded)
Test Files   5 failed | 51 passed (56)
     Tests   9 failed | 892 passed | 13 skipped (914)
```

**No regression.** The failing files are the environment-sensitive infra suites from the Stage 2a/2b
baseline — `contact-messages.push`, `emails.service`, `emails/imap-sync.service`,
`push-tokens/notification-dispatch.service`, `whitelist/registration-origin-callers` — none of which
touch the calibration schema. (`chat.gateway.security`, flaky in the baseline, happened to pass this
run, hence 5 files not 6.) Passing count rose from Stage 2b's 880 to 892 — the 10 new tests plus the
2 chat-gateway cases that flaked green.

---

## 8. HARD STOP

Controller + schemas + RBAC wiring only. No tech-pwa / Portal UI. Await review before UI work.
