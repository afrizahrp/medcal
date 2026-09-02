# IMPLEMENT (STAGED, SCHEMA-ONLY) — CalibrationJob Identity Fields: Nullable deviceId + Identity Snapshot + AKL/AKD Approval State

## Mode
This task has TWO stages with a HARD STOP between them. Do NOT proceed past Stage 1 without
explicit user confirmation in this conversation. Do not skip the stop, do not assume approval,
do not "proceed since it seems obviously correct."

**Scope lock:** this task touches `schema.prisma` (and a resulting migration) ONLY —
specifically the `CalibrationJob` model and `CalibrationJobStatus` enum. Do NOT touch
service/controller/RBAC/UI code in this task, even if the gap is obvious. Those are separate
follow-up tasks. Do NOT modify any other model beyond what's listed below.

## Background — confirmed decisions this task implements

These business decisions were confirmed directly by the user (not inferred) and are the basis
for every field below. Do not re-derive or second-guess them:

1. `CalibrationJob.deviceId` must become **nullable**. Identity is normal to be unknown until
   a technician physically verifies the device on-site; WorkOrder proceeds to IN_PROGRESS
   regardless of identity verification status (this is normal, not an error state).
2. When AKD/AKL/NIE is not declared, a technician escalates to TECHNICIAN_MANAGER, who
   decides whether that specific device may proceed with calibration. This decision happens
   **per CalibrationJob (per physical device/item)**, not per WorkOrder — one blocked item
   must not block sibling jobs in the same WorkOrder.
3. TECHNICIAN_MANAGER is the sole approver for this AKL/AKD decision (confirmed role).
4. `CalibrationJob` currently has no link back to `CalibrationRequestItem` (confirmed gap,
   prior audit + `investigation-deviceid-akdakl-nullability-flow.md`). A job should be able
   to trace back to the original customer declaration.
5. New physical `Device` rows (new serial number under an already-licensed DeviceType) are a
   normal, frequent occurrence with no regulatory process attached — this does NOT need a
   special "register-on-site" workflow; existing generic Device CRUD is sufficient once wired
   (wiring is a later task, not this one).

## Stage 1 — Propose the schema diff (DO NOT APPLY)

1. Read the current `CalibrationJob` model and `CalibrationJobStatus` enum directly from
   `schema.prisma` (live read, not from memory of prior audits).
2. Propose an exact `schema.prisma` diff implementing:
   - `deviceId` changed from required `String` to optional `String?` (and the relation
     changed accordingly — confirm what Prisma requires for the relation field itself when
     the FK becomes optional).
   - A nullable FK `calibrationRequestItemId String?` → relation to `CalibrationRequestItem`
     with `onDelete: SetNull` (mirroring the existing `purchaseOrderItemId` optional-FK
     pattern already on this model — reuse that exact pattern for consistency).
   - Identity snapshot fields, all nullable, living directly on `CalibrationJob` (not on
     `Device`, to avoid the "job points at mutable master row" problem already flagged in the
     prior audit):
     - `customerDeclaredDeviceName String?`
     - `technicianObservedSerial String?`
     - `technicianObservedAkdAkl String?`
   - AKL/AKD approval fields, all nullable:
     - An enum or set of fields representing approval state (propose the simplest shape that
       fits: e.g. a small enum `AkdAklApprovalStatus { NOT_REQUIRED, PENDING_REVIEW, APPROVED,
       REJECTED }` plus `akdAklApprovalStatus`, `akdAklApprovedByUserId String?`,
       `akdAklApprovedAt DateTime?`). Propose this, don't assume it's final — flag any
       alternative shape you think is meaningfully better and why, but pick one as your
       primary proposal.
   - A new value on `CalibrationJobStatus` (or confirm the approval fields above make a new
     enum value unnecessary — argue this explicitly either way) representing "blocked
     specifically pending AKL/AKD decision," distinct from any other blocking reason. State
     your reasoning for whether this belongs as a `CalibrationJobStatus` value or is fully
     captured by the `akdAklApprovalStatus` field alone without touching the job's overall
     status enum.
3. For each field/change proposed, state explicitly: what it's for, which confirmed decision
   (1-5 above) it implements, and what breaks or needs re-checking elsewhere in the schema if
   this change is made (e.g. does anything currently assume `deviceId` is non-null? Search for
   `.device.` or `deviceId` usage patterns that could NPE or behave unexpectedly if this
   becomes optional — report what you find, even though fixing those call sites is out of
   scope for this task).
4. Do NOT edit `schema.prisma` yet. Present the full proposed diff (as a diff or a clearly
   marked before/after of the relevant model block) in your response and STOP. Explicitly ask
   for confirmation before proceeding to Stage 2.

## Stage 2 — Apply and migrate (ONLY after explicit user approval received)

Do not begin this stage until the user has explicitly approved the Stage 1 proposal in this
conversation (a message like "yes" or "go ahead" in response to your Stage 1 output counts;
silence or an unrelated message does not).

1. Apply the approved diff to `schema.prisma`.
2. Run `prisma migrate dev` (or the project's equivalent migration command — check
   `package.json` scripts first rather than assuming) against the local `pkmdb` database to
   generate and apply the migration.
3. Run `prisma generate` (or equivalent) to regenerate the Prisma client if this is a separate
   step in this project's workflow.
4. Do NOT touch any service, controller, seed, or UI file — even if the generated Prisma
   client now shows type errors elsewhere. Report those type errors/breakages as a list (file
   + line) in your final summary; do not fix them in this task.
5. Confirm the migration applied cleanly (show the migration name/output) and that
   `git status` reflects only `schema.prisma` + the new migration folder as changes.

## Output / final message format

**After Stage 1:** present the proposed diff, your reasoning per field, any call-sites found
that assume non-null `deviceId`, and your recommendation on the status-enum question. End with
an explicit request for approval to proceed to Stage 2. Do not write any files at this point
beyond nothing (Stage 1 is analysis + proposal only, matching the read-only tasks already done
in this project).

**After Stage 2 (only if reached):** confirm exactly which files changed (schema.prisma +
migration folder path), confirm no other files were touched, and list any downstream
type-errors/breakages discovered but deliberately left unfixed for a follow-up task.
