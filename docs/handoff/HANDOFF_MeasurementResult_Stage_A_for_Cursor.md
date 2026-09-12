# MEDCAL — HANDOFF TO CURSOR: MeasurementResult, Stage A (tech-pwa UI)

Date: 2026-09-08
Purpose: Resume MeasurementResult development (tech-pwa UI, Pattern A entry) without
repeating the design/backend work already completed.

---

# 1. PROJECT CONTEXT (brief)

MedCal is a calibration management system for medical-device calibration.

- Portal: management/admin UI (Next.js)
- Tech PWA: technician-facing application (Next.js)
- API: NestJS backend
- DB: PostgreSQL 16.15 + Prisma
- Monorepo: `apps/portal`, `apps/tech-pwa`, `apps/api`, `packages/db`, `packages/shared`, `packages/auth`

Working convention on this project: **staged tasks with explicit HARD STOP between stages**,
each stage produces a written report, reviewed before the next stage starts. Follow this
convention — do not silently expand scope; flag deviations/new needs explicitly in the report
rather than absorbing them quietly.

Testing convention: every stage's report must show **no-regression evidence** — run the full
`apps/api` (and relevant app) test suite, compare failing-file set against the last known
baseline (currently: 5–6 pre-existing environment-sensitive infra suites — IMAP/email sync,
push-notification dispatch, chat-gateway websocket timing, a cross-app source scan — none
touch the calibration/measurement domain). A new failure outside that set is a real regression;
report it, don't paper over it.

---

# 2. WHAT `MeasurementResult` IS

A calibration job (`CalibrationJob`) captures structured measurement readings against a master
catalog of parameters (`DeviceCalibrationParameter`, 493 rows / 51 device types after today's
Audiometer split). Real LK (Lembar Kerja / calibration worksheet) analysis classified
measurements into 4 patterns:

- **Pattern A** (~50% of catalog): single parameter, N replicate trials, one shared tolerance.
  No fixed "setting points". *(This is Stage A's entire scope.)*
- **Pattern B** (~28%): multiple fixed numeric setpoints (e.g. Heart Rate tested at
  30/60/120/180 bpm), all sharing the parent parameter's tolerance. Needs `CalibrationTestPoint`
  children.
- **Pattern C** (~9%): already resolved at the catalog level — split into separate
  `DeviceCalibrationParameter` rows with their own tolerances (e.g. Dental Handpiece Low/High
  Speed). At the entry-model level, each behaves exactly like Pattern A.
- **Pattern D** (~13%): heterogeneous — data-logger summary + attachment (fridge/freezer
  temperature uniformity), paired up/down ramp with technician-chosen setpoints (Suction Pump
  vacuum gauge), qualitative pass/fail (BOOLEAN), ratio values (I:E ratio).

---

# 3. BACKEND STATUS — COMPLETE, TESTED, NOT DEPLOYED

All of the following are applied to **local `pkmdb` only** — nothing has been deployed to the
VPS/production, and nothing has been committed to git yet (confirm current git status before
assuming a clean baseline).

## 3.1 Schema (Stage 2a — done)

- New model `CalibrationTestPoint` (optional master-level child of `DeviceCalibrationParameter`
  — only exists for Pattern B / fixed-slot-D parameters).
- `MeasurementResult` fully restructured (was an empty `payloadJson`/`summaryJson` blob table,
  0 rows, so this was a safe drop+add with no backfill). Key fields:
  - Required FK `deviceCalibrationParameterId`
  - Optional FK `calibrationTestPointId`
  - `replicateIndex`, `attemptNumber`, `direction` (`NONE`/`UP`/`DOWN`)
  - `measuredValue` / `measuredText` / `measuredBool` / `referenceValue` (typed by
    `parameter.valueType`)
  - `isWithinTolerance` (computed, nullable), `effectiveToleranceMin/Max`,
    `appliedNominalValue` (all snapshotted at write time, never recomputed from a
    since-edited master catalog)
  - `entryKind` (`DIRECT_READING` / `LOGGER_SUMMARY`), `attachmentFileObjectId`
  - `recordedByUserId` + `recordedAt` — **re-stamp to the last editor on every update**,
    including note-only edits (locked decision, not "who created it first")
  - Natural-key unique constraint (offline-sync readiness, not yet built):
    `(calibrationJobId, deviceCalibrationParameterId, calibrationTestPointId, replicateIndex,
    attemptNumber, direction)` with **`NULLS NOT DISTINCT`** (Postgres 16.15 confirmed, hand-
    edited into the migration SQL — Prisma can't express this natively)
- `CalibrationJob.currentAttempt Int @default(1)` — incremented on the (not-yet-built)
  `SUBMITTED → REWORK` transition. New attempts get fresh rows; old attempt rows are **never**
  edited or deleted.
- `FileOwnerType.MEASUREMENT_RESULT` enum value added (own migration, Postgres enum-add rule).
- 3 CHECK constraints (`replicateIndex >= 1`, `attemptNumber >= 1`,
  `CalibrationTestPoint.sequence >= 1`).

Full design rationale, all 4 pattern walkthroughs with real catalog codes, and every locked
decision: `docs/claude/plans/Calibration-management/measurement-results/
MeasurementResult_Stage1_Design_Finalization.md`. **Read this before touching the domain** — it
has the authoritative field-by-field reasoning.

## 3.2 Service layer (Stage 2b — done)

`apps/api/src/modules/calibration-jobs/measurement-results.service.ts` +
`measurement-tolerance.ts` (pure tolerance-resolution engine, no DB/Nest).

- **Locked-after-submit guard** (`assertMeasurementRowEditable`): rejects any write once
  `job.submittedAt !== null` or `job.status ∈ {SUBMITTED, ACCEPTED_BY_QA}`, or once
  `row.attemptNumber < job.currentAttempt` (superseded attempt). **Role-blind — no bypass,
  not even TECHNICIAN_MANAGER.**
- **Tolerance resolution priority**: test-point override → parameter bounds → parsed
  `toleranceNote` (± delta / ± % / explicit min-max, handles Indonesian decimal commas) combined
  with the applied nominal value → `NULL` if nothing resolves (deliberate — judged manually at
  QualityReview later, never a forced guess).
- CRUD: `create`, `createMany` (one transaction — used for batch grid submission),
  `update` (re-resolves tolerance if the value changed, always re-stamps
  `recordedByUserId`/`recordedAt` to the editor), `remove` (hard delete — every deletable row is
  a pre-submission draft by construction, and a soft-delete flag would fight the
  `NULLS NOT DISTINCT` natural key).
- Duplicate natural-key write → clean `MEASUREMENT_DUPLICATE_ENTRY` (409), never a raw Postgres
  error.
- RBAC capability: `calibrationJob:recordMeasurement`, granted to TECHNICIAN +
  TECHNICIAN_MANAGER.

## 3.3 API (Stage 2c — done)

All nested under the job, using this controller's existing `:id` param convention (not
`:jobId`):

| Method | Path | Permission |
|---|---|---|
| `GET` | `/calibration-jobs/:id/measurement-results` | `calibrationJob:read` |
| `POST` | `/calibration-jobs/:id/measurement-results` | `calibrationJob:recordMeasurement` |
| `POST` | `/calibration-jobs/:id/measurement-results/batch` | `calibrationJob:recordMeasurement` |
| `PATCH` | `/calibration-jobs/:id/measurement-results/:measurementId` | `calibrationJob:recordMeasurement` |
| `DELETE` | `/calibration-jobs/:id/measurement-results/:measurementId` | `calibrationJob:recordMeasurement` |

- `GET` (list) returns rows in **worksheet order**:
  `parameter.sortOrder → deviceCalibrationParameterId → testPoint.sequence → replicateIndex →
  direction → attemptNumber`.
- Every write response returns the **full row**, including `isWithinTolerance` +
  `effectiveToleranceMin/Max` — the client gets pass/fail feedback with no second round-trip.
- Prisma `Decimal` fields serialize to **JSON strings** (`"effectiveToleranceMax": "100"`) via
  decimal.js `toJSON()` — same behavior as every other Decimal field in this API
  (e.g. `DeviceCalibrationParameter.toleranceMin`). No `.toNumber()`, no interceptor needed.
- Request schemas live in `packages/shared/src/schemas/index.ts`
  (`measurementResultCreateSchema` / `…BatchCreateSchema` / `…UpdateSchema`) — the update schema
  only allows the editable subset (`measuredValue`/`measuredText`/`measuredBool`/
  `referenceValue`/`note`) — `direction`/`replicateIndex`/`calibrationTestPointId` are natural-
  key components; changing one means delete + create, not update.

## 3.4 `CalibrationTestPoint` seed — done (191 rows, 40 parameters)

Extracted from the real 50 LK `.docx` worksheets (`docs/technician-docs/Lembar-Kerja/`), not
invented. Full extraction detail + per-parameter LK citations:
`docs/claude/plans/Calibration-management/measurement-results/
CalibrationTestPoint_Seed_Extraction.md`. Seed script:
`packages/db/prisma/seed-calibration-test-points.ts` (idempotent — safe to re-run).

**Explicitly deferred / not seeded** (deliberate, not an oversight):
- `PATIENT_MONITOR`, `OXYMETER_MONITOR`, `BREAST_PUMPS`, `RESUSCITATORS_CARDIAC` — user
  confirmed these catalog entries are likely speculative/inactive, not a priority.
- `VENTILATOR` — real worksheet exists but as a PDF in a different location
  (`Penilaian Kemampuan.zip`), not yet retrieved/parsed.

**Catalog change made along the way**: `AUD_PURE_TONE_LINEARITY` and `AUD_FREQUENCY_RESPONSE`
were split into `_KANAN`/`_KIRI` pairs (the LK worksheet prints Left/Right ear as two separate
tables, not one continuous sweep) — see `packages/db/prisma/
fix-collapsed-audiometer-parameters.ts`. Originals deactivated (`isActive=false`), not deleted.

## 3.5 `decimalPlaces` — NOT backfilled, deliberately deferred

All 486 NUMBER-type parameters still carry the placeholder `decimalPlaces = 0` (whole numbers).
Investigation (`docs/claude/plans/Calibration-management/measurement-results/
DecimalPlaces_Backfill_Proposal.md`) found the LK worksheet corpus is entirely **blank
templates** — no recorded example values, no reference-instrument resolution data — so real
evidence for correct per-parameter precision mostly doesn't exist there. **User decision**: wait
for real calibration data (recorded manually on paper in the field, then transcribed into Excel
by the office) as the future ground-truth source, rather than deploy convention-based guesses
now (170 of 488 rows would have been "low confidence").

**For Stage A: accept `decimalPlaces = 0` as an interim value.** Read the field from
`parameter.decimalPlaces` in the UI (don't hardcode `0`) so formatting is automatically correct
the moment a future backfill lands — just don't block Stage A on getting the real values now.

Also flagged for later: the Aug-28 stakeholder meeting's note "Bedside Monitor → 5 decimal
places" isn't supported by anything in the LK corpus (NIBP sweeps are all whole-number mmHg,
±5 mmHg tolerance) — needs clarification once real data arrives, or may refer to a different
BSM parameter than NIBP.

---

# 4. IMMEDIATE TASK — STAGE A: tech-pwa Measurement Entry, Pattern A Only

Full task spec below. This is the **first** UI stage; Pattern B (setpoint grids) and Pattern D
(logger-summary, generic-slot, boolean, ratio) are explicitly out of scope for this stage —
even if a parameter looks simple, if it's not `valueType = NUMBER` with zero
`CalibrationTestPoint` children, skip it here.

## STAGE A — tech-pwa Measurement Entry: Skeleton + Pattern A Only

### Mode
Full-stack UI task (tech-pwa) using the already-built API (Stage 2c). No API/schema changes
expected — flag if a genuine gap surfaces (e.g. a missing endpoint), don't silently add scope.

### Scope boundary
**Only Pattern A parameters**: `valueType = NUMBER`, zero `CalibrationTestPoint` children,
`entryKind = DIRECT_READING` (no logger-summary/attachment case). Roughly half the catalog.

### Task

1. **Identify Pattern A parameters** for a job's resolved device type: query
   `DeviceCalibrationParameter` filtered by the job's resolved `deviceTypeId`,
   `isActive = true`, `valueType = "NUMBER"`, and no `CalibrationTestPoint` children.
   Spot-check against a known Pattern A parameter (e.g. `DUNIT_ILLUMINANCE`) to confirm the
   query is correct.

2. **Investigate "expected replicate count"**: check whether anything structural exists on
   `DeviceCalibrationParameter` for this. If nothing does, don't invent a new schema field —
   default the entry UI to a sensible starting count (5 rows, matching the "trials I–V"
   convention seen throughout the LK corpus) with an "add replicate" affordance so a technician
   isn't blocked if a parameter genuinely needs more/fewer. Flag as a known soft spot.

3. **Entry point in the job flow**: add a section/button on the tech-pwa job detail screen
   (same placement pattern as "Ajukan Koreksi Identitas" / "Catat Alat Referensi") — e.g.
   "Catat Hasil Pengukuran" — visible when `job.status = IN_PROGRESS`. List applicable Pattern A
   parameters: name, unit, human-readable tolerance, entry status (e.g. "0/5 diisi").

4. **Per-parameter entry screen**: N replicate input rows, numeric keyboard,
   `decimalPlaces`-aware formatting (read `parameter.decimalPlaces`, currently `0` — don't
   hardcode). Immediate pass/fail chip per row from the write response's `isWithinTolerance` —
   no second round-trip.

5. **Submit mechanics**: `POST .../measurement-results/batch` for new replicate rows;
   `PATCH .../measurement-results/:measurementId` for editing an already-saved row; `GET
   .../measurement-results` to repopulate on reopen.

6. **Respect the lock**: once `job.status` is no longer `IN_PROGRESS`, render rows read-only,
   with a clear inline message keyed off `MEASUREMENT_JOB_SUBMITTED` /
   `MEASUREMENT_ATTEMPT_SUPERSEDED` — not a raw error toast.

7. **Polling**: only add the existing 6s `refetchInterval` + `refetchOnWindowFocus` pattern if
   this screen could plausibly be viewed by two people simultaneously. For single-technician
   data entry that's unlikely — confirm this assumption before adding polling reflexively.

### Explicitly out of scope
Pattern B/D UI, Portal UI, Excel export, real `decimalPlaces` precision, offline/local-storage
behavior.

### Testing
- Manual: open a job with known Pattern A parameters, enter replicate values, confirm pass/fail
  chips render correctly, confirm read-only lock after submit.
- Add tests for any new pure logic (pass/fail chip rendering, decimalPlaces-aware formatting
  helper).
- Typecheck for `apps/tech-pwa`. Confirm existing tech-pwa suite unaffected.

### Report
Files changed, screenshots/description of the UI, the "expected replicate count" decision made,
test results.

**HARD STOP after this — await review before Stage B (Pattern B grid UI).**

---

# 5. AFTER STAGE A (already agreed sequencing — don't jump ahead without review)

- **Stage B**: Pattern B UI (setpoint grid — titik × replikasi)
- **Stage C**: Pattern D UI (logger-summary + attachment, generic-slot, boolean, ratio — most
  heterogeneous, expect several sub-variants)
- **Stage D**: Portal — read-only measurement results view per job (for TECHNICIAN_MANAGER
  visibility, groundwork for the future `QualityReview` redesign)

Each stage gets its own HARD STOP + review before the next starts, same as the backend stages.

---

# 6. OTHER OPEN THREADS (lower priority, not blocking Stage A)

- FCM push notifications + notification badge for identity-correction/reference-equipment
  approvals — explicitly deferred earlier, not started.
- `QualityReview` (G4) restructure (weighted scoring categories matching the LK "Telaah Teknis"
  table) — separate future design discussion, `MeasurementResult` deliberately doesn't shape it.
- A possible AI-assisted `QualityReview` — noted as a future idea only, not scoped.
- `VENTILATOR` LK worksheet retrieval (PDF in `Penilaian Kemampuan.zip`) — small follow-up,
  not done.

---

# 7. WORKING PRINCIPLES (carried over from the broader project handoff)

- Always distinguish FACT from HYPOTHESIS from RECOMMENDATION.
- When diagnosing: inspect actual code, identify exact root cause, don't guess.
- When implementing: keep scope narrow, reuse existing project patterns, avoid unnecessary
  abstractions, don't modify unrelated domains.
- When touching production: verify first, never destructive without explicit confirmation.
- When reporting: state exact files changed, exact tests run, distinguish PASS / NOT RUN /
  FAILED honestly — do not claim a test passed if it was skipped.
- HARD STOP means stop. Do not proceed to the next stage without explicit review/approval.

END OF HANDOFF
