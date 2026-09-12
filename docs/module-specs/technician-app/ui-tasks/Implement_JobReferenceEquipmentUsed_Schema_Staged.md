# IMPLEMENT (STAGED, SCHEMA-ONLY) — Fix JobReferenceEquipmentUsed: Real FK + Validity Snapshot

## Mode
This task has TWO stages with a HARD STOP between them. Do NOT proceed past Stage 1 without
explicit user confirmation in this conversation.

**Scope lock:** this task touches `schema.prisma` (and a resulting migration) ONLY —
specifically `JobReferenceEquipmentUsed`. Do NOT touch service/controller/RBAC/UI code in this
task. Do NOT modify `Equipment`, `EquipmentCalibrationRecord`, `WorkOrderEquipment`, or
`CalibrationJob` beyond the minimal back-relation Prisma requires.

## Background — confirmed decisions (do not re-litigate)

From `investigation-job-reference-equipment-linking.md` + user confirmation:

1. `JobReferenceEquipmentUsed` currently has NO FK to `Equipment` — only free-text
   `equipmentName`/`brand`/`model`/`serialNumber`. This must become a real FK
   (`equipmentId`), dropping the free-text fields in favor of it.
2. Add `equipmentCalibrationRecordId` as a snapshot FK — records WHICH calibration record was
   checked/relied upon at the moment of use, frozen (consistent with this project's established
   pattern of freezing point-in-time facts rather than only relying on a live join that could
   later disagree — same reasoning already applied to `CalibrationJob`'s identity-snapshot
   fields and `IdentityCorrection`'s prev/new device FKs).
3. Validity check semantics (to be enforced in the service layer, NOT this task, but the schema
   must support recording the outcome): `asOf` = `CalibrationJob.startedAt` (job must have
   started before equipment-used can be recorded — recording before `startedAt` is set should
   be disallowed at the service layer, not something this schema task needs to prevent
   structurally, but don't design the schema in a way that makes it impossible to enforce
   later).
4. Validity requires BOTH: `EquipmentCalibrationRecord.status === "CONFIRMED"` AND
   `acceptedForUse === true` AND `asOf` within `[validFrom, validUntil]` — this closes a gap the
   investigation found (today's `resolveCalibrationValidity` ignores `acceptedForUse` entirely).
   This task does not change `resolveCalibrationValidity` itself (that's a service-layer
   task) — just confirm the schema has everything needed to check all three conditions
   (it already does per the investigation; no new columns needed for this specific point).
5. An expired/not-accepted-for-use certificate is a hard block at recording time, with a
   TECHNICIAN_MANAGER override path (force-accept with a mandatory reason) — the schema needs a
   place to record an override decision if one occurred. Propose the field(s) for this
   (e.g. `validityOverridden Boolean @default(false)`, `overrideReason String?`,
   `overriddenByUserId String?`, `overriddenAt DateTime?`) mirroring the
   `akdAklDecisionNote`/approval-actor pattern already used elsewhere.
6. Many-to-many: a `CalibrationJob` may use several `Equipment` units (e.g. 3 units for one Bed
   Side Monitor job) — `@@unique([calibrationJobId, equipmentId])`, not a 1:1 constraint.

## Stage 1 — Propose the schema diff (DO NOT APPLY)

1. Read the current `JobReferenceEquipmentUsed` model live from `schema.prisma` (already
   quoted in the investigation report, but re-read to confirm nothing has changed since).
2. Propose the full corrected model:
   - `equipmentId String` (required FK to `Equipment`, `onDelete: Restrict` — mirroring the
     project's established "master data is never deleted, but be defensive anyway" policy
     already applied to `CalibrationJob.device`/`IdentityCorrection.prevDevice`/`newDevice`).
   - `equipmentCalibrationRecordId String?` (nullable FK to `EquipmentCalibrationRecord` —
     nullable because a unit might theoretically be recorded before any calibration record
     exists for it, though the service layer will likely block that case; propose whether this
     should actually be required instead, and justify).
   - Drop `equipmentName`, `brand`, `model`, `serialNumber` (free-text fields — no longer
     needed once `equipmentId` resolves to the real `Equipment` row, which already has all of
     these fields as the source of truth).
   - Add the override fields per decision 5 — propose exact names/types.
   - Keep/add `notes String?` if not already present (mirrors `WorkOrderEquipment.notes`).
   - `@@unique([calibrationJobId, equipmentId])`.
   - Appropriate indexes: `@@index([companyId, equipmentId])`,
     `@@index([equipmentCalibrationRecordId])`, `@@index([overriddenByUserId])` if that field
     is added.
3. Propose the required back-relation additions:
   - `Equipment.jobReferenceUsages JobReferenceEquipmentUsed[]` (or a name consistent with
     existing relation-naming conventions on that model — check what pattern
     `Equipment.calibrationRecords`/`workOrderSelections` uses and mirror it).
   - `EquipmentCalibrationRecord` back-relation for the snapshot FK.
   - `User` back-relation for `overriddenByUserId` if that field is added (named relation,
     mirroring `CalibrationJobAkdAklApprover`/`IdentityCorrectionDecider`).
4. Confirm whether `companyId` should have an explicit `company` relation or stay a bare scalar
   — check what the sibling models in this cluster (`CalibrationJob`, `IdentityCorrection`) do
   and stay consistent.
5. Check the live row count of `JobReferenceEquipmentUsed` in `pkmdb` before proposing whether
   this migration is safe as a straightforward column add/drop, or whether existing rows (if
   any) need a data-migration strategy (the model has existed in schema for a while — confirm
   whether it's genuinely empty, matching its "never wired up" status, or whether test/seed
   data populated it at some point).
6. Present the full proposed diff and STOP. Ask for explicit approval before Stage 2.

## Stage 2 — Apply and migrate (ONLY after explicit user approval received)

1. Apply the approved diff to `schema.prisma`.
2. Run the project's migration command against local `pkmdb`, regenerate the Prisma client.
3. Run `tsc --noEmit` in `apps/api` and `apps/portal`; report results. Given the investigation
   confirmed ZERO existing code reads/writes `JobReferenceEquipmentUsed` anywhere in `apps/`,
   expect zero downstream breakage — verify this expectation rather than assuming it.
4. Confirm final `git status` — list exactly which files changed.

## Output / final message format

**After Stage 1:** present the proposed diff, your reasoning per field tied to the 6 locked
decisions, and the live row-count check result. End with an explicit request for approval to
proceed to Stage 2.

**After Stage 2 (only if reached):** confirm exactly which files changed, typecheck results,
and migration confirmation.
