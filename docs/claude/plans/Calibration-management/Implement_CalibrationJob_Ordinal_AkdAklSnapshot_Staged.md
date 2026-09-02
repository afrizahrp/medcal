# IMPLEMENT (STAGED, SCHEMA-ONLY) — CalibrationJob: Unit Ordinal + Customer-Declared AKD/AKL Snapshot

## Mode
This task has TWO stages with a HARD STOP between them. Do NOT proceed past Stage 1 without
explicit user confirmation in this conversation. Do not skip the stop, do not assume approval.

**Scope lock:** this task touches `schema.prisma` (and a resulting migration) ONLY —
specifically the `CalibrationJob` model. Do NOT touch service/controller/RBAC/UI code, and do
NOT implement fan-out logic in this task — that is a separate follow-up task. Do not modify any
other model beyond what's strictly required for Prisma relation validity.

## Background — confirmed decisions this task implements

From `investigation-calibrationjob-fanout-design.md` (prior read-only investigation) and
subsequent user confirmation:

1. **Per-unit ordinal.** When a `WorkOrderItem.qty` of N produces N `CalibrationJob` rows
   (all initially `deviceId = NULL`, same `purchaseOrderItemId`, same declared name), the
   technician-facing UI needs a way to distinguish "unit 1 of 3" from "unit 2 of 3" before
   device matching happens. Add an integer ordinal field to `CalibrationJob`.
2. **Customer-declared AKD/AKL snapshot.** `CalibrationJob` already has
   `customerDeclaredDeviceName String?` (frozen snapshot of
   `CalibrationRequestItem.customerDeviceName` at job creation, added in the prior migration
   `20260902050955_add_calibrationjob_identity_fields`). It does NOT yet snapshot the
   customer's originally-declared `CalibrationRequestItem.akdAkl` — only the
   technician-observed value (`technicianObservedAkdAkl`) exists today. Add the missing
   customer-declared counterpart, for the same reason the device-name snapshot exists: so
   later edits to the mutable `CalibrationRequestItem` row don't silently rewrite what was
   declared at the time this specific job was created (this matters most for AKD/AKL, which
   is the field the TECHNICIAN_MANAGER approval gate — `akdAklApprovalStatus` — is decided
   against).

## Stage 1 — Propose the schema diff (DO NOT APPLY)

1. Read the current `CalibrationJob` model directly from `schema.prisma` (live read — it now
   includes the identity fields from the prior migration; don't work from memory of the
   pre-migration shape).
2. Propose the exact diff adding:
   - An ordinal field, e.g. `unitOrdinal Int` — not nullable, since every job (even the first
     of a qty-1 line) should carry a value. Propose the default/semantics: does unit 1 of 1
     get `unitOrdinal = 1`, and is there a `unitTotal Int` companion field (so the UI can show
     "2 of 3" without a separate query), or is total count derivable elsewhere (e.g. via
     `WorkOrderItem.qty` through the existing relation) and therefore redundant to store?
     State your recommendation with reasoning — don't just pick one silently.
   - `customerDeclaredAkdAkl String?` — nullable, mirroring `customerDeclaredDeviceName`'s
     nullability (a valid "not declared" state, not missing data).
3. Consider whether `unitOrdinal` changes anything about the existing
   `@@unique([workOrderId, deviceId])` constraint or motivates a new one (the prior
   investigation flagged that a partial unique index on
   `(workOrderId, purchaseOrderItemId, unitOrdinal)` — or similar — could harden fan-out
   idempotency once an ordinal exists, since today `(workOrderId, purchaseOrderItemId,
   deviceId IS NULL)` is intentionally non-unique). Propose this as part of the diff if it's a
   clean, low-risk addition; otherwise flag it as a candidate for the fan-out implementation
   task instead and explain why you'd defer it.
4. For each field, state explicitly: what it's for, which confirmed decision (1-2 above) it
   implements, and whether it requires touching any other model. It should not — flag clearly
   if you find otherwise.
5. Do NOT edit `schema.prisma` yet. Present the full proposed diff and STOP. Explicitly ask for
   confirmation before proceeding to Stage 2.

## Stage 2 — Apply and migrate (ONLY after explicit user approval received)

Do not begin this stage until the user has explicitly approved the Stage 1 proposal in this
conversation.

1. Apply the approved diff to `schema.prisma`.
2. Run the project's migration command (check `package.json` scripts first) against local
   `pkmdb` to generate and apply the migration.
3. Regenerate the Prisma client.
4. Do NOT touch any service, controller, seed, or UI file. Report any downstream type errors
   found (there should be none — zero existing consumers of `CalibrationJob` fields per the
   prior audit — but verify with `tsc --noEmit` in `apps/api` and `apps/portal` as was done in
   the prior staged task, and report the result explicitly).
5. Confirm the migration applied cleanly and that `git status` reflects only `schema.prisma` +
   the new migration folder as changes.

## Output / final message format

**After Stage 1:** present the proposed diff, your reasoning per field, and your
recommendation on `unitTotal` and the partial-unique-index question. End with an explicit
request for approval to proceed to Stage 2. Do not write any files at this point.

**After Stage 2 (only if reached):** confirm exactly which files changed, confirm no other
files were touched, and report the `tsc --noEmit` results for `apps/api` and `apps/portal`.
