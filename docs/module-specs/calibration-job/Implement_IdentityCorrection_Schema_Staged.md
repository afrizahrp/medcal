# IMPLEMENT (STAGED, SCHEMA-ONLY) — Identity Correction: Model, Signatures, BA Numbering

## Mode
This task has TWO stages with a HARD STOP between them. Do NOT proceed past Stage 1 without
explicit user confirmation in this conversation.

**Scope lock:** this task touches `schema.prisma` (and a resulting migration) ONLY. Do NOT
touch service/controller/RBAC/UI/file-owner-policy code in this task — those are separate
follow-up tasks. Do NOT modify `CalibrationJob`'s existing fields beyond what's strictly
required for the new relation. Do NOT implement the `AKD_AKL_TRANSITIONS` `APPROVED →
PENDING_REVIEW` edge in code — that's a service-layer change for the implementation task; this
task only needs the schema to support it (the enum/status values already allow it).

## Background — confirmed decisions (locked, do not re-litigate)

From `investigation-identity-correction-design.md` and subsequent user confirmation:

1. **Scope:** covers BOTH first-time identity resolution AND correction of an
   already-approved identity. This workflow becomes the sole path for setting/changing
   `CalibrationJob.deviceId` going forward (superseding the plain `assignDevice`
   match-only flow built earlier — that service logic changes in the implementation task,
   not here).
2. A BA is only created when technician-observed values differ from what's currently on
   the job (declared or previously corrected).
3. One BA (`IdentityCorrection` row) may correct multiple attributes together.
4. **Correctable attributes, locked for v1:** `deviceId` (device_id), `serial`, `AKD/AKL`
   (NIE) only. NOT device name (handled separately by the existing Device Name Alias
   system — out of scope). NOT model/brand yet (deferred, pending future confirmation) — do
   not add columns for these now.
5. **AKD/AKL gate coupling:** an APPROVED correction that changes the AKD/AKL value must be
   able to move `CalibrationJob.akdAklApprovalStatus` from `APPROVED` back to
   `PENDING_REVIEW`. The schema must not prevent this transition (it's an enum + service
   logic; no schema blocker expected, but confirm).
6. Approver: TECHNICIAN_MANAGER (same role as the AKD/AKL gate — reuse the existing
   relation-naming convention, e.g. a new named relation on `User` mirroring
   `CalibrationJobAkdAklApprover`).
7. **Customer signature:** must support a "customer unavailable/refused" state, not just
   signed/unsigned.
8. Device name is NOT a correctable attribute and gets no new column anywhere in this task.
9. New `DocumentType` enum value: `IDENTITY_CORRECTION_BA`, prefix `"BA"`.
10. New `FileOwnerType` enum value: `IDENTITY_CORRECTION` (do not reuse/overload the
    existing `SIGNATURE` value).
11. A correction cannot be submitted/approved while the job's identity gate is locked
    (`SUBMITTED`/`ACCEPTED_BY_QA`) — hard reject, no auto-REWORK. (Service-layer guard,
    schema just needs the job reference to check status against — no new schema construct
    needed for this specific rule.)
12. Certificate citing the BA number is explicitly future work, not in scope here.

## Stage 1 — Propose the schema diff (DO NOT APPLY)

Design per **Option A** from the investigation (flat header with `prev*`/`new*` column pairs
for the 3 locked attributes, not the generic line-item Option B — the attribute set is small
and fixed, per decision 4).

1. Read the current `CalibrationJob`, `CustomerSignature`, `DocumentType` enum,
   `FileOwnerType` enum, and `AkdAklApprovalStatus` enum live from `schema.prisma`. Also read
   `DOCUMENT_TYPE_PREFIX` and `DOCUMENT_TYPE_NUMBER_TABLE` static maps
   (`packages/db/src/document-number/`) to confirm exactly what a new `IDENTITY_CORRECTION_BA`
   entry requires in each.
2. Propose the new `IdentityCorrectionStatus` enum — mirror `AkdAklApprovalStatus`'s shape
   exactly (`PENDING_REVIEW`, `APPROVED`, `REJECTED` — confirm whether a `DRAFT` pre-submission
   state is needed given signatures must be captured before submission, or whether "submitted"
   IS "PENDING_REVIEW" with signatures required as a precondition checked in service logic, not
   a status value; propose one, don't add states beyond what's needed).
3. Propose the `IdentityCorrection` model:
   - `id`, `companyId`, `calibrationJobId` (required FK, NOT unique — a job can have multiple
     corrections over its life, per decision 1/audit requirement), `baNumber` (from
     `DocumentNumberService`, unique per company), `status IdentityCorrectionStatus`.
   - `prevDeviceId String?` / `newDeviceId String?` (both nullable — a given BA might correct
     only some of the 3 attributes, not all). Consider: should `newDeviceId` be a real FK to
     `Device` (so DeviceType-match validation and referential integrity hold), while
     `prevDeviceId` is a plain string snapshot (since the "previous" device may later be
     deleted... though recall `Device` is never deleted per project policy — confirm whether
     `prevDeviceId` should ALSO be a proper FK given that policy, for stronger integrity)?
     Propose and justify.
   - `prevSerial String?` / `newSerial String?`, `prevAkdAkl String?` / `newAkdAkl String?` —
     plain snapshot strings (mirroring how `technicianObservedSerial`/`technicianObservedAkdAkl`
     are already plain strings on `CalibrationJob`).
   - `reason String` (required — why the correction is needed; distinct from the
     already-known limitation that AKD/AKL escalation's reason gets overwritten — this model
     should NOT repeat that mistake; reason is a durable column here, never overwritten).
   - `submittedByUserId String?` (technician who initiated — nullable only if genuinely
     unrecoverable in some path, otherwise required; propose).
   - `decidedByUserId String?`, `decidedAt DateTime?`, `decisionNote String?` — mirrors the
     `akdAklApprovedBy/At/note` pattern exactly, named relation on `User` per decision 6.
   - `akdAklGateReopened Boolean` or similar — consider whether to record explicitly that this
     correction caused the AKD/AKL gate to reopen (decision 5), for audit clarity, vs. letting
     that be inferable only from timestamps/history. Propose.
   - Timestamps: `createdAt`, `updatedAt`.
   - Indexes: `@@index([companyId, status])`, `@@index([calibrationJobId])`, appropriate unique
     on `(companyId, baNumber)`.
4. Propose the `IdentityCorrectionSignature` model (shared model, `signerRole` discriminator,
   per the investigation's recommendation):
   - `id`, `companyId`, `identityCorrectionId` (FK, NOT unique — allows both a TECHNICIAN and a
     CUSTOMER row per correction), `signerRole` enum (`TECHNICIAN`, `CUSTOMER`).
   - `signerName String?`, `fileObjectId String?` (signature image, via the new
     `IDENTITY_CORRECTION` `FileOwnerType` — file-owner-policy wiring itself is a follow-up
     task, not this one), `signedAt DateTime?`.
   - `status` — propose a small enum or boolean-plus-reason capturing decision 7 (customer
     unavailable/refused as a real state, not just a null signature). Propose the exact shape
     (e.g. `SignatureStatus { SIGNED, UNAVAILABLE, REFUSED }` + `unavailableReason String?`).
   - `@@unique([identityCorrectionId, signerRole])` (one signature row per role per
     correction).
5. Propose the required relation additions:
   - `CalibrationJob.identityCorrections IdentityCorrection[]` back-relation.
   - `User` back-relations for the new `submittedBy`/`decidedBy` named relations (mirroring
     `calibrationJobsAkdAklApproved`).
   - `DocumentType` enum: add `IDENTITY_CORRECTION_BA`. Update the two static maps
     (`DOCUMENT_TYPE_PREFIX`, `DOCUMENT_TYPE_NUMBER_TABLE`) — confirm exactly what the
     `DOCUMENT_TYPE_NUMBER_TABLE` entry needs to point at (likely the new
     `IdentityCorrection` table) by reading how existing entries are structured.
   - `FileOwnerType` enum: add `IDENTITY_CORRECTION`.
6. For each field/model, state explicitly what it's for and which locked decision (1-12) it
   implements. Flag anything you think is a genuine open sub-question not already covered by
   the 12 decisions (there may be small ones — e.g. exact enum member names) — propose your
   best answer for each rather than leaving it undecided, but flag clearly so it can be
   corrected if wrong.
7. Do NOT edit `schema.prisma` yet. Present the full proposed diff and STOP. Explicitly ask for
   confirmation before proceeding to Stage 2.

## Stage 2 — Apply and migrate (ONLY after explicit user approval received)

1. Apply the approved diff to `schema.prisma`, `document-type-prefix.ts`,
   `document-type-table.ts`.
2. Run the project's migration command against local `pkmdb`, regenerate the Prisma client.
3. Do NOT touch service/controller/UI files. Run `tsc --noEmit` in `apps/api` and
   `apps/portal`; report results (expect clean, per the pattern in every prior schema task —
   verify, don't assume).
4. Confirm final `git status` — list exactly which files changed.

## Output / final message format

**After Stage 1:** present the proposed diff (schema.prisma + the two static map files),
your reasoning per field/model tied to the 12 locked decisions, and any flagged
open-sub-questions with your proposed answers. End with an explicit request for approval to
proceed to Stage 2.

**After Stage 2 (only if reached):** confirm exactly which files changed, typecheck results,
and migration confirmation.
