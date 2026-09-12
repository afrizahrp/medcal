# STAGE 2b — MeasurementResult Service Layer (Guard, Tolerance Resolution, CRUD) — Implementation Report

**Date:** 2026-09-08
**Mode:** Service-layer TypeScript + unit tests only. **No controller route, no HTTP endpoint, no
DTO/zod request schema, no tech-pwa/Portal change.** Those are Stage 2c.
**Design applied:** `MeasurementResult_Stage1_Design_Finalization.md` §7 (guard), §8
(`isWithinTolerance`), §4 (worked examples), §5 (Pattern C / override columns).
**Schema:** unchanged — built against Stage 2a (`20260908025400_restructure_measurement_result_and_add_test_point`).

**HARD STOP after this report — await review before Stage 2c (API endpoints).**

---

## 0. TL;DR

| # | Item | Outcome |
|---|---|---|
| 1 | Guard | `assertMeasurementRowEditable(job, row)` — superseded-attempt check + locked-status check (`{SUBMITTED, ACCEPTED_BY_QA}` **or** `submittedAt !== null`). Verbatim from design §7.1. In the new `measurement-results.service.ts`, not `calibration-jobs.service.ts` (see §2). |
| 2 | Creation gate | `job.startedAt !== null` reuses the existing `CALIBRATION_JOB_NOT_STARTED` code — no new error. |
| 3 | Tolerance engine | `measurement-tolerance.ts` (pure, no DB/Nest). Priority chain: test-point override → parameter bounds → parsed note + nominal → NULL. Bounds + `appliedNominalValue` snapshotted onto the row at write time. |
| 4 | Note parser | Handles `± N unit`, `±N%` / `± N %`, a `± N` embedded mid-sentence, Indonesian decimal comma, and `Min : x; Max : y` / leading `≥`/`≤`. Returns `null` for multi-class notes (`INCU_AIR_TEMP`, `SUCT_MAX_VACUUM`). Tested against **every** distinct note-only format in the live catalog (33 distinct, 78 rows). |
| 5 | `isWithinTolerance` | From raw `measuredValue` only. BOOLEAN mirrors `measuredBool` (never NULL for a recorded reading). RATIO uses the numeric `measuredValue`. TEXT and unresolved → NULL. |
| 6 | CRUD | `create`, `createMany` (bulk, one tx), `update`, `remove` on `MeasurementResultsService`. |
| 7 | Delete strategy | **Hard delete — recommended and implemented.** Rationale in §5. |
| 8 | Bulk write | **Implemented now** (`createMany`) — straightforward and Stage 2c's tech-pwa batch submit needs it. §6. |
| 9 | Duplicate key | `P2002` on the natural key → `ConflictException` `MEASUREMENT_DUPLICATE_ENTRY`. Never leaks a raw DB error. |
| 10 | RBAC | New capability `calibrationJob:recordMeasurement`, granted TECHNICIAN + TECHNICIAN_MANAGER. Defined in `access-control.ts` + `seed-role-permissions.ts` + a backfill script. **No `@RequirePermission` wiring** (Stage 2c). |
| 11 | Typecheck | `apps/api` `tsc --noEmit` clean; `packages/auth` clean. |
| 12 | Tests | 20 pure tolerance tests + 12 service/guard tests, all green. Full `apps/api` suite: see §8. |

---

## 1. Files changed

**New:**

| File | Purpose |
|---|---|
| `apps/api/src/modules/calibration-jobs/measurement-tolerance.ts` | Pure tolerance-resolution engine: `parseToleranceNote`, `resolveEffectiveTolerance`, `computeIsWithinTolerance`. No DB, no NestJS. |
| `apps/api/src/modules/calibration-jobs/measurement-tolerance.test.ts` | 20 unit tests for the above. |
| `apps/api/src/modules/calibration-jobs/measurement-results.service.ts` | `MEASUREMENT_LOCKED_JOB_STATUSES`, `assertMeasurementRowEditable`, `RECORD_MEASUREMENT_PERMISSION`, `MeasurementResultsService` (CRUD). |
| `apps/api/src/modules/calibration-jobs/measurement-results.service.test.ts` | 12 guard + CRUD integration tests. |
| `packages/db/prisma/backfill-measurement-result-permissions.ts` | One-time idempotent RolePermission grant for already-seeded DBs (mirrors the identity-correction / reference-equipment precedent). |

**Modified:**

| File | Change |
|---|---|
| `apps/api/src/modules/calibration-jobs/calibration-jobs.module.ts` | Register `MeasurementResultsService` as a provider + export. |
| `packages/auth/src/access-control.ts` | Add `"recordMeasurement"` to the `calibrationJob` action list. |
| `packages/db/prisma/seed-role-permissions.ts` | Grant `calibrationJob:recordMeasurement` to TECHNICIAN + TECHNICIAN_MANAGER. |
| `packages/db/package.json` | `backfill:measurement-result-permissions` script. |

`calibration-jobs.service.ts` is **untouched**.

---

## 2. Guard — placement and behaviour

Design §7.1 suggested `calibration-jobs.service.ts`. It is instead a module-level export of the new
`measurement-results.service.ts`:

- It is measurement-specific — nothing else calls it — and `calibration-jobs.service.ts` is already
  1,100 lines.
- Keeping the guard, the locked-status set, and the CRUD that calls it in one file makes the unit
  they form obvious and keeps the diff self-contained.
- The pattern (`MEASUREMENT_LOCKED_JOB_STATUSES = new Set([...])` + a free `assert…()` function that
  throws a `BadRequestException` with a `code`) is copied exactly from
  `IDENTITY_LOCKED_JOB_STATUSES` / `assertIdentityGateOpen`, so it reads as the same idiom regardless
  of which file it sits in.

```ts
export function assertMeasurementRowEditable(job, row): void {
  if (row.attemptNumber < job.currentAttempt)  throw … code "MEASUREMENT_ATTEMPT_SUPERSEDED";
  if (MEASUREMENT_LOCKED_JOB_STATUSES.has(job.status) || job.submittedAt !== null)
                                               throw … code "MEASUREMENT_JOB_SUBMITTED";
}
```

Called at the top of `create`, `createMany`, `update`, `remove` after the job is loaded. Role-blind —
no bypass, including TECHNICIAN_MANAGER (decision #5). Creation additionally calls `assertJobStarted`
(`job.startedAt !== null`) which throws the **existing** `CALIBRATION_JOB_NOT_STARTED` code, not a new
one.

Error codes introduced: `MEASUREMENT_ATTEMPT_SUPERSEDED`, `MEASUREMENT_JOB_SUBMITTED`,
`MEASUREMENT_DUPLICATE_ENTRY`, `MEASUREMENT_RESULT_NOT_FOUND`, `MEASUREMENT_BATCH_MULTIPLE_JOBS`,
`DEVICE_CALIBRATION_PARAMETER_NOT_FOUND`, `CALIBRATION_TEST_POINT_NOT_FOUND`,
`CALIBRATION_TEST_POINT_PARAMETER_MISMATCH`.

---

## 3. Tolerance-resolution engine

`resolveEffectiveTolerance(input)` implements design §8.1 exactly:

1. **`testPoint.toleranceMin` OR `testPoint.toleranceMax` non-null** → use them (per-point override,
   §5 — `SUCT_MAX_VACUUM` / `INCU_AIR_TEMP` and future per-analyte lists). `source = TEST_POINT_OVERRIDE`.
2. **else `parameter.toleranceMin` OR `parameter.toleranceMax` non-null** → use them (Pattern A/C —
   `DUNIT_ILLUMINANCE`, `DUNIT_HP_SPEED_LOW`, `ACLV_STER_TEMP_121`). `source = PARAMETER_BOUNDS`.
3. **else parse a note** — `testPoint.toleranceNote` first (it is an override too), then
   `parameter.toleranceNote` — and combine with the applied nominal:
   - `ABSOLUTE_DELTA` → `[nominal − delta, nominal + delta]`
   - `PERCENT_DELTA` → `delta = |nominal| × pct / 100`, then as above
   - `EXPLICIT_BOUNDS` → the parsed `min` / `max` directly (no nominal needed)
   - a `± delta` / `± N%` note with **no** nominal available → unresolvable → NULL
   `source = NOTE`.
4. **else** → `effectiveToleranceMin/Max = NULL`. `source = NONE`.

**Applied nominal** = `testPoint.settingValue` ?? technician-supplied value (the Pattern D generic-slot
case, `SUCT_VACUUM_GAUGE` "Titik ukur N") ?? `null`. It is always snapshotted, even when no note ends
up needing it, so Pattern B / `LOGGER_SUMMARY` rows keep a faithful record of what was dialled in.

All arithmetic is `Prisma.Decimal`. The resolved `effectiveToleranceMin`, `effectiveToleranceMax`,
`appliedNominalValue` are written onto the row and **never recomputed** from the master catalog
afterwards — `update` re-resolves only bounds, and re-feeds the *already-snapshotted*
`appliedNominalValue`, never re-deriving the technician's on-site setpoint choice.

### 3.1 Note-parsing logic (`parseToleranceNote`)

| Rule | Regex (core) | Example live notes | Result |
|---|---|---|---|
| percent delta | `±\s*(NUM)\s*%` | `± 10 %`, `±10%`, `± 3 % SPO2`, `± 6 %` | `{PERCENT_DELTA, percent}` |
| absolute delta | `±\s*(NUM)` (first match, `%` not following) | `± 5 mmHg`, `± 3°C`, `± 2 bpm`, `Akurasi tekanan ± 4 mmHg …`, `… suhu : ± 3 °C`, `< 53°C ± 3℃` | `{ABSOLUTE_DELTA, delta}` |
| explicit bounds | `min\s*[:=]?\s*(NUM)` / `max\s*[:=]?\s*(NUM)` | `≥ 0,40 m/s; Min : 0,4; Max : 1` | `{EXPLICIT_BOUNDS, min, max}` |
| leading inequality | `^[≥>]=?\s*(NUM)` / `^[≤<]=?\s*(NUM)` | (none note-only today; covers `>250.000 rpm`-style if it ever loses its structured bound) | `{EXPLICIT_BOUNDS, min\|max}` |
| ambiguous / multi-class | 2+ **distinct** `± N` deltas, or `isi salah satu sesuai dengan UUT` | `INCU_AIR_TEMP` (`± 1.5 °C` and `± 0.8 °C`), `SUCT_MAX_VACUUM` / `BREASTP_MAX_VACUUM` | `null` (→ route through per-point overrides, §5) |
| no rule | — | `Pass / Fail`, blank, `INCU_RECOVERY_TIME` (null) | `null` |

`NUM` = `[-+]?\d+(?:[.,]\d+)?`, with `,` normalised to `.` (Indonesian decimal comma — `0,025`,
`0,40`).

**Tested against the live catalog.** Queried `pkmdb` for every note-only parameter
(`toleranceMin IS NULL AND toleranceMax IS NULL AND toleranceNote IS NOT NULL`) — **78 rows,
33 distinct notes**. Every distinct format falls into a row of the table above. The dominant clusters:
`± 5 mmHg` (×9 — the BP/NIBP family), `± 5 bpm` (×6), `± 10 %` (×12 across ventilator/x-ray/rotator),
`±10%` (×5), the temperature-storage `Setting suhu …; ± N °C` family (×5). The literal §4.2
`BSM_SYSTOLIC "± 5 mmHg"` case and the §8.1 `INCU_RECOVERY_TIME` blank case are both explicit test
cases.

### 3.2 `isWithinTolerance`

```ts
computeIsWithinTolerance({ valueType, measuredValue, measuredBool, effMin, effMax }): boolean | null
```

- `valueType === "BOOLEAN"` → `measuredBool ?? null` (mirrors the reading; only NULL when the boolean
  itself was not recorded — §4.4c).
- `valueType === "TEXT"` → always `null`.
- otherwise (NUMBER, RATIO) → coerce `measuredValue` to `Decimal`; `null` if absent or if **both**
  bounds are null; else `false` when `< min` (if set) or `> max` (if set), else `true`. Lower-bound-only
  (`DUNIT_ILLUMINANCE`) and upper-bound-only both work. RATIO evaluates the numeric `measuredValue`,
  never `measuredText`.

---

## 4. CRUD methods (`MeasurementResultsService`)

| Method | Behaviour |
|---|---|
| `create(companyId, input, userId)` | Load job (company-scoped) → `assertJobStarted` → `assertMeasurementRowEditable` → load parameter (+ test point, validated to belong to the parameter) → `resolveEffectiveTolerance` → `computeIsWithinTolerance` → insert with `attemptNumber = job.currentAttempt`, `recordedByUserId = userId`, `recordedAt = now`, snapshot columns. `P2002` → `MEASUREMENT_DUPLICATE_ENTRY`. |
| `createMany(companyId, inputs[], userId)` | All rows must target one job (`MEASUREMENT_BATCH_MULTIPLE_JOBS` otherwise). Guard once; resolve each row independently; `prisma.$transaction([...create])` — atomic, any duplicate rolls the whole batch back as `MEASUREMENT_DUPLICATE_ENTRY`. |
| `update(companyId, id, input)` | Load row + its job → `assertMeasurementRowEditable`. Editable fields: `measuredValue`, `measuredText`, `measuredBool`, `referenceValue`, `note`. If a value that feeds evaluation changed → re-resolve + re-snapshot bounds (re-using the frozen `appliedNominalValue`) and recompute `isWithinTolerance`. A pure `note` / `referenceValue` edit skips re-resolution. |
| `remove(companyId, id)` | Load row + job → `assertMeasurementRowEditable` → hard `delete`. |

`direction` / `replicateIndex` / `entryKind` / `calibrationTestPointId` are set on create and not
editable via `update` (they are natural-key components — a change is a different row, i.e. a
delete + create).

---

## 5. Delete strategy — recommendation

**Hard delete. Recommended and implemented.**

- The guard makes every row that can reach `remove` a **pre-submission draft of the current attempt**
  by construction — a submitted attempt (`MEASUREMENT_JOB_SUBMITTED`) and a superseded attempt
  (`MEASUREMENT_ATTEMPT_SUPERSEDED`) are both already blocked. There is no post-decision / audit state
  to preserve, unlike `IdentityCorrection` or `JobReferenceEquipmentUsed` where the project's
  no-delete convention protects a *decided* record.
- A soft-delete flag would have to be threaded through the `measurement_natural_key`
  `UNIQUE … NULLS NOT DISTINCT` constraint — a tombstoned row would keep blocking re-entry of the same
  `(job, param, testPoint, replicate, attempt, direction)` tuple, which is exactly the tuple a
  technician re-enters after deleting a mistyped reading. Net cost, no benefit.
- `MeasurementResult` has a single write path (this service). No second ingest route needs the history.

If a database-level audit of pre-submission edits is ever required, it belongs in an append-only
`MeasurementResultAudit` side table, not a flag on the hot row — flagged, not built.

---

## 6. Bulk-write decision

**Implemented now as `createMany`.** It is a thin wrapper (one job load + guard, per-row resolution
re-using the same pure functions, one `$transaction`), and Stage 2c's tech-pwa entry screen submits a
grid — replicates I–V for a Pattern A parameter, or 6 slots × 3 replicates × 2 directions for
`SUCT_VACUUM_GAUGE` (§4.4b) — in one action. Deferring it would just mean Stage 2c loops `create`
outside a transaction and loses atomicity on a partially-duplicate batch.

A bulk **update** is intentionally **not** built — the tech-pwa edit flow is one row at a time, and a
batched update would need per-row guard + re-resolution branching that is clearer written per call.
Revisit in Stage 2c only if the API shape actually needs it.

---

## 7. RBAC

New capability: **`calibrationJob:recordMeasurement`**.

- Added to the `calibrationJob` action list in `packages/auth/src/access-control.ts`.
- Granted to **TECHNICIAN** and **TECHNICIAN_MANAGER** in `seed-role-permissions.ts`, mirroring
  `recordReferenceEquipmentUsed` (the on-site actor + their manager).
- `packages/db/prisma/backfill-measurement-result-permissions.ts` grants it to an already-seeded DB
  (`pnpm --filter @medcal/db run backfill:measurement-result-permissions`) — idempotent, additive,
  same shape as the two prior backfill scripts. Verified: after `prepare-test-db`, `pkmdb_test` has
  both `recordMeasurement` rows.
- Exported from the service as `RECORD_MEASUREMENT_PERMISSION` for Stage 2c to reference.
- **No `@RequirePermission` decorator / controller wiring** — that is Stage 2c. The service methods do
  not check permission themselves (consistent with the other calibration-jobs service methods, where
  the guard is on the controller).

---

## 8. Test results

### 8.1 New tests — all green

```
measurement-tolerance.test.ts ............ 20 passed
  parseToleranceNote                        (7)  — ± mmHg, every % spelling, embedded ±, comma decimal,
                                                   Min/Max bounds, multi-class → null, blank → null
  resolveEffectiveTolerance                 (7)  — parameter bounds (Pattern A/C), lower-bound-only,
                                                   test-point override, note inherited from parent
                                                   (BSM_SYSTOLIC ± 5 mmHg @ 60 → 55/65),
                                                   percent + supplied nominal, INCU_RECOVERY_TIME → NULL,
                                                   ± note with no nominal → NULL
  computeIsWithinTolerance                  (6)  — NUMBER in/out, lower-bound-only, BOOLEAN mirrors
                                                   measuredBool (+ NULL), RATIO uses measuredValue,
                                                   NULL cases, TEXT → NULL

measurement-results.service.test.ts ...... 12 passed
  assertMeasurementRowEditable              (4)  — superseded attempt, locked status
                                                   ({SUBMITTED, ACCEPTED_BY_QA}), submittedAt-set,
                                                   allowed on current attempt of IN_PROGRESS
  MeasurementResultsService — CRUD          (8)  — create stamps attemptNumber/recordedBy + snapshots,
                                                   create blocked when not started
                                                   (CALIBRATION_JOB_NOT_STARTED), note-only ± via
                                                   test-point settingValue, duplicate →
                                                   MEASUREMENT_DUPLICATE_ENTRY (not raw P2002),
                                                   update re-resolves + recomputes verdict,
                                                   update blocked after submit, remove hard-deletes,
                                                   createMany batch in one tx
```

`calibration-jobs` module suite (4 files): **125 passed** — no regression.

### 8.2 Full `apps/api` suite

```
$ pnpm --filter @medcal/api test        (fresh pkmdb_test, 68 migrations, re-seeded)
Test Files   6 failed | 50 passed (56)
     Tests  10 failed | 880 passed | 13 skipped (903)
```

**No regression.** This is identical to the Stage 2a report's **stock-`main` baseline**
(`6 failed | 10 failed`). The six failing files are exactly the environment-sensitive infra suites
named there:

| File | Nature |
|---|---|
| `chat/chat.gateway.security.test.ts` | Socket.IO room-isolation timing |
| `contact-messages/contact-messages.push.test.ts` | push-dispatch DI/mocking |
| `emails/emails.service.test.ts` | IMAP/email infra |
| `emails/imap-sync.service.test.ts` | IMAP sync infra |
| `push-tokens/notification-dispatch.service.test.ts` | push-batch send/deactivate mocking |
| `whitelist/registration-origin-callers.test.ts` | cross-app source scan of `apps/tech-pwa` (no DB) |

None touch `MeasurementResult`, the calibration schema, or anything this stage changed. The
`calibration-jobs` module suite (4 files, 125 tests) passes fully, including the 32 new tests.

Typecheck: `pnpm --filter @medcal/api typecheck` → clean. `packages/auth` typecheck → clean.
`prisma migrate diff` → no drift (schema unchanged this stage).

---

## 9. Follow-up (2026-09-08) — `update()` re-stamps `recordedByUserId` / `recordedAt`

**Change.** `MeasurementResultsService.update()` now takes a `userId` parameter (mirroring
`create()`), and every successful update sets `recordedByUserId = userId` and `recordedAt = now()`
**unconditionally** — a note-only edit re-stamps too. `recordedByUserId` / `recordedAt` now mean
"who is responsible for / when was set the *current* value", not "who first created the row".

**Files:** `measurement-results.service.ts` (signature + unconditional stamp in the `data` object),
`measurement-results.service.test.ts` (updated the re-resolve test, added a create-as-A / update-as-B
test).

### 9.1 `recordedAt` vs `updatedAt` — recommendation: **keep both**

They are not redundant even though they now coincide right after an edit:

| Column | Meaning | Who writes it |
|---|---|---|
| `updatedAt` | "row last mutated" — an ORM/audit mechanic (`@updatedAt`). Bumped by **any** write, including ones with no domain meaning: a future bulk backfill, a data-fix script, a cascade, an attachment relink. | Prisma, automatically, always. |
| `recordedAt` | "when the value the row now asserts was recorded", paired with `recordedByUserId`. Only the measurement write path sets it. | This service, deliberately. |

Dropping `recordedAt` would force every reader that wants "the reading's timestamp" (Excel export
§8.2, the certificate, a QA view) to use `updatedAt` — which a non-measurement touch would silently
falsify. The pair `recordedByUserId` + `recordedAt` is a self-consistent domain fact; `updatedAt` is
infrastructure. They diverge the moment anything other than `create`/`update` touches the row, which
is exactly when the distinction matters. **No schema change** — `recordedAt` already exists and stays.

---

## 10. HARD STOP

Service layer + unit tests only. No controller, no HTTP route, no request schema, no tech-pwa/Portal
change. Await review before Stage 2c (API endpoints).
