# MoM #6 — Implementation Report

> Device Identity, BAI Lifecycle, Observed Identity & LK.
> Date: 2026-09-18. Scope implemented exactly as locked in
> `docs/minutes-of-meeting/MoM #6 — FINAL IMPLEMENTATION.md`.

---

## Implementation Summary

### Changed

**Schema / migration**

- `packages/db/prisma/schema.prisma`
  - `CalibrationJob`: added `technicianObservedBrand String?`, `technicianObservedModel String?`
    beside the existing `technicianObservedSerial` (not recreated).
  - `IdentityCorrection`: added `prevBrand` / `newBrand` / `prevModel` / `newModel` (all `String?`,
    mirroring the Serial pair).
  - `IdentityCorrection.prevDeviceId` / `newDeviceId`: **kept**, re-documented as HISTORICAL ONLY.
    `CalibrationJob.deviceId` and `Device.serialNumber` untouched.

**API — `apps/api/src/modules/calibration-jobs/`**

- `calibration-jobs.service.ts`
  - `submitIdentityCorrection`: now records Brand / Model / Serial (+ the pre-existing AKD/AKL).
    The no-op check compares against observed-value-first, Device-master-fallback baselines via new
    module helpers `currentObservedBrand/Model/Serial`.
  - `decideIdentityCorrection` (APPROVE): writes `technicianObservedBrand/Model/Serial`.
    **Never touches `deviceId`.** No Device master write at approval time.
  - `submitForReview`: new guard `assertNoPendingIdentityCorrectionForSubmit`, plus the CAS
    transition moved inside a `$transaction` with a pending re-check under the row lock.
  - `complete`: the `SUBMITTED → ACCEPTED_BY_QA` CAS and the Device master commit now run in one
    `$transaction`.
  - New exported error code `IDENTITY_CORRECTION_UNRESOLVED`.
  - New module helper `assertJobStillPreSubmit(tx, jobId, companyId)` — the shared race guard.
  - Job detail `device` select extended with `brand` / `model`.
  - **Removed (dead after the Device lock):** `validateDeviceForJob`, `bindDevice`,
    `findDeviceCandidates`, the `DevicesService` dependency, and the
    `IdentityCorrectionSubmitResult.deviceTypeValidated` field.
- `calibration-jobs.controller.ts`: removed `GET /:id/device-candidates`. The `POST /:id/assign-device`
  410 stub is kept (its doc comment corrected).
- `lk-download.service.ts`: loads the two new observed columns; new exported pure function
  `resolveLkDeviceIdentity()` applies the per-field precedence once in the data-preparation layer;
  both LK paths consume its result.
- `identity-correction-pdf.ts`: BA change table now renders Merk / Model / Tipe / Serial No rows,
  and still renders a historical Device row.

**Shared**

- `packages/shared/src/schemas/index.ts`: `identityCorrectionSubmitSchema` drops `newDeviceId` and
  adds `newBrand` / `newModel`; `superRefine` updated accordingly.

**Tech-PWA**

- `identity-correction/page.tsx`: Device selection (search + candidate radio list) **removed**,
  replaced by a read-only "Alat (ditetapkan oleh WO/SPK)" panel. Correction fields are now
  Merk / Model / Tipe / Serial No, each showing the current value.
- `identity-correction/wizard-state.ts`: `attrs` is `{ brand, model, serial }`; new
  `currentBrand/Model/Serial` prefill helpers; `deviceCorrectionValid` replaced by
  `brandCorrectionValid` / `modelCorrectionValid`.
- `identity-correction/review/page.tsx`: submits `newBrand` / `newModel` / `newSerial`; change
  summary rewritten.
- `jobs/[id]/page.tsx`: Submit is disabled while a BA is pending, with a dedicated
  `disabledReason` (reference-equipment reason preserved and now sequenced behind it).
- `lib/api-errors.ts`: message for `IDENTITY_CORRECTION_UNRESOLVED`.
- `lib/calibration/types.ts`, `lib/calibration/job-display.ts`, `use-job-query.ts`: types extended,
  `useDeviceCandidates` and `CalibrationJobDeviceCandidate` removed.

**Portal**

- `calibration-jobs/[id]/page.tsx`: BA dialog Device picker replaced by the same read-only panel;
  Merk / Model / Tipe inputs added; Serial relabelled "Serial No (observed)"; dead imports removed.
- `calibration-jobs-ui.tsx`, `use-identity-corrections-query.ts`, `use-calibration-jobs-query.ts`,
  `calibration-job-utils.ts`: types extended, `useDeviceCandidates` removed, change summary extended.

### Migration

- **Name:** `20260918160000_add_observed_brand_model`
- **Contents:** six `ADD COLUMN ... TEXT` statements (2 on `CalibrationJob`, 4 on `IdentityCorrection`).
  No index, constraint, enum, table or drop.
- **Status:** applied cleanly to the test database via
  `pnpm --filter @medcal/db run prepare-test-db` — *"All migrations have been successfully applied."*
- **Prisma schema in sync:** yes. `prisma generate` succeeded (Prisma Client v6.19.3).
  Not yet applied to any non-test database.

### BAI Lifecycle

Final implemented flow:

```
Job IN_PROGRESS (Device fixed by WO/SPK — CalibrationJob.deviceId, never rewritten)
   │
   ├─ Technician files BA: Merk / Model / Tipe / Serial No
   │     → IdentityCorrection PENDING_REVIEW
   │     → CalibrationJob untouched
   │
   ├─ Measurement recording: ALLOWED while pending
   ├─ submitForReview:       BLOCKED while pending → IDENTITY_CORRECTION_UNRESOLVED
   │
   ├─ MT decides while IN_PROGRESS:
   │     APPROVE → writes technicianObservedBrand / Model / Serial on the job
   │               (deviceId unchanged; Device master NOT written yet)
   │     REJECT  → BA closed; job, observed identity and master all untouched
   │
   ├─ Gate cleared (APPROVED or REJECTED) → submitForReview succeeds → SUBMITTED
   │     └─ identity gate closes: no BA may be filed or decided from here
   │
   ├─ MT quality review APPROVE
   │
   └─ complete() → ONE transaction:
         CalibrationJob SUBMITTED → ACCEPTED_BY_QA
         + Device master commit (non-null observed fields only)
         Either both succeed or neither does.
```

There is no post-submit BA workflow. `assertIdentityGateOpen()` and
`IDENTITY_LOCKED_JOB_STATUSES` are retained and still enforce that.

**Race protection.** The invariant *"never SUBMITTED while a PENDING_REVIEW BA exists"* is held by
row-level serialisation on the `CalibrationJob` row rather than by a read check:

- `submitForReview` runs the CAS `updateMany` **first, inside a transaction** (taking the job row
  lock), then re-queries for a pending BA while holding it, and throws — rolling the transition
  back — if one is found.
- `submitIdentityCorrection` and `decideIdentityCorrection` each call `assertJobStillPreSubmit(tx, …)`
  inside their own transaction, which conditionally updates that same job row and fails if the job
  has left the pre-submit phase.

Because all three writers update the same row, PostgreSQL serialises them; whichever commits second
observes the first and is refused. No denormalised flag was introduced.

### Device Master Commit

- **When:** at the `SUBMITTED → ACCEPTED_BY_QA` transition in `complete()`, in the same
  `prisma.$transaction` as the status CAS.
- **What:** `Device.brand`, `Device.model`, `Device.serialNumber` only.
- **Source:** `CalibrationJob.technicianObservedBrand / Model / Serial`.
- **Per-field:** a `NULL` observed value is omitted from the update, so the master field is left
  unchanged. If no observed field is set at all, no master write is issued.
- **Scoping:** `updateMany({ where: { id: job.deviceId, companyId } })` — `Device.id` alone can never
  write across a company boundary. A zero-row match throws `DEVICE_MASTER_COMMIT_FAILED`, which
  rolls the whole transaction back and leaves the job at `SUBMITTED`.
- **Never changed:** `Device.id`, `Device.code`, and `CalibrationJob.deviceId`.
- Synchronous and transactional — no background job, no queue, no notification.

### LK Identity

Implemented precedence, applied **independently per field** in
`resolveLkDeviceIdentity()` (`lk-download.service.ts`):

```
brand  = technicianObservedBrand  ?? Device.brand        ?? null
model  = technicianObservedModel  ?? Device.model        ?? null
serial = technicianObservedSerial ?? Device.serialNumber ?? null
```

Resolved once in the data-preparation layer and passed to both existing renderers:

| Path | Before | After |
|---|---|---|
| Generic (`lk-result-pdf.ts` → Merk / Model / Tipe / No. Seri) | all three read live from Device master | all three observed-first |
| Bed Side Monitor (`lk-templates/bed-side-monitor.ts`) | Brand/Model from master, Serial already observed-first | all three observed-first |

Reference-equipment identity (`Equipment.brand` / `model` / `serialNumber`) in both renderers was
deliberately left untouched. LK availability still gates on
`CalibrationJob.status === "ACCEPTED_BY_QA"` plus the existing password step-up and single-use token;
no new issuance path was added.

### Device Correction

**`newDeviceId` is preserved for backward compatibility only, and is fully removed from the active
BAI workflow.**

Exact reason: dropping the columns would destroy historical evidence. `IdentityCorrection.prevDeviceId`
/ `newDeviceId` carry FKs to `Device` and record which device earlier corrections actually resolved;
§16 of the spec forbids removing historical data where a safe migration does not require it. The
columns therefore remain, and the migration does not drop them.

What was removed:

| Layer | Removed |
|---|---|
| Zod / DTO | `newDeviceId` from `identityCorrectionSubmitSchema` |
| Service write path | `bindDevice()`, `validateDeviceForJob()` — both deleted; nothing writes `prevDeviceId`/`newDeviceId` any more |
| Service read path | `findDeviceCandidates()` deleted |
| API | `GET /:id/device-candidates` deleted |
| Tech-PWA | device search + candidate list UI, `useDeviceCandidates`, `CalibrationJobDeviceCandidate` |
| Portal | device search + candidate list UI, `useDeviceCandidates`, `CalibrationJobDeviceCandidate` |
| Result shape | `IdentityCorrectionSubmitResult.deviceTypeValidated` |

What still reads them — display of historical BAs only, never a write:
`identity-correction-pdf.ts`, `job-display.ts` (Tech-PWA), `calibration-job-utils.ts` (Portal).

A verification grep confirms no remaining `newDeviceId` write path anywhere in `apps/` or `packages/`.

### Validation

| Command | Result |
|---|---|
| `pnpm --filter @medcal/db generate` | ✅ Prisma Client generated (v6.19.3); schema valid |
| `pnpm --filter @medcal/db run prepare-test-db` | ✅ new migration applied, seeds + backfills ran |
| `pnpm --filter @medcal/api typecheck` | ✅ pass |
| `pnpm --filter portal typecheck` | ✅ pass |
| `pnpm --filter tech-pwa typecheck` | ✅ pass |
| `pnpm --filter tech-pwa test` | ✅ 102 passed / 6 files |
| `pnpm --filter portal test` | ✅ 194 passed / 19 files |
| `vitest run src/modules/calibration-jobs/lk-download.service.test.ts` | ✅ 23 passed |
| `vitest run src/modules/calibration-jobs/calibration-jobs.service.test.ts -t "MoM #6"` | ✅ 11 passed, 154 skipped |
| `vitest run src/modules/calibration-jobs/` (whole module, final) | ✅ **351 passed / 13 files** |
| `pnpm --filter @medcal/api lint`, `pnpm --filter portal lint` | ⚠️ both are `echo "… skipped"` stubs in this repo — no real linter configured |

Remaining failures: none.

One intermediate failure was found and fixed during the run: the master-commit rollback test
initially moved the Device to a literal company id `'ZZZ'`, which violated
`Device_companyId_fkey`. It now creates a real throwaway company for that scope and restores the
Device afterwards.

Not run / not applicable:

- **Prettier was deliberately not applied.** `npx prettier --check` reports style issues in 42 files,
  including files this change never touched (e.g. `measurement-tolerance.ts`,
  `identity-correction/layout.tsx`). That is pre-existing repo state; running `--write` would have
  rewritten unrelated files, which §23 forbids.
- The migration has **not** been applied to any development or production database — only to
  `pkmdb_test`.
- Nothing was committed. All changes are in the working tree on `main`.

**Tests added/updated**

- `calibration-jobs.service.test.ts` — new `MoM #6` describe block (11 tests): pending BA does not
  block measurement recording; pending BA blocks submit; APPROVED clears the gate; REJECTED clears
  the gate; BA undecidable after SUBMITTED; BA never changes `deviceId`; the concurrency invariant;
  master commit at `ACCEPTED_BY_QA`; no NULL overwrite; untouched master when nothing was observed;
  transaction rollback on a failed master commit. Existing BA tests migrated from Device correction
  to Brand/Model/Serial; the two device-validation tests and the device-candidates test removed
  along with the code they covered.
- `lk-download.service.test.ts` — 7 tests for `resolveLkDeviceIdentity`, including the spec's exact
  per-field fallback example.
- `identity-correction-pdf.test.ts` — renders a Brand/Model/Serial BA.
- `wizard-state.test.ts` (Tech-PWA) — rewritten for the Brand/Model/Serial attributes plus prefill
  precedence.
- `calibration-job-utils.test.ts` (Portal) — Brand/Model/Serial change rows, plus a regression test
  that a pre-MoM#6 Device correction still renders.

### Scope Check

- **Compliance Level: NOT IMPLEMENTED**
- **Notifications/FCM: NOT IMPLEMENTED**
- **Unrelated features: NOT IMPLEMENTED**

---

## Note on unrelated working-tree changes

Three files were already modified in the working tree by other work running against this shared
checkout, and were **not** touched by this implementation:

- `apps/tech-pwa/src/app/jobs/[id]/measurements/measurement-grid.tsx`
- `apps/tech-pwa/src/lib/calibration/measurement.ts`
- `apps/tech-pwa/src/lib/calibration/measurement.test.ts`

They concern named test points / measurement grid rendering, are unrelated to MoM #6, and were left
exactly as found. They are included in the passing Tech-PWA test run above.
