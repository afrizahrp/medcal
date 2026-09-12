# IMPLEMENT (STAGED) — CalibrationJob Device Assignment: Match Existing or Register New

## Mode
This task has TWO stages with a HARD STOP between them. Do NOT proceed past Stage 1 without
explicit user confirmation in this conversation.

**Scope lock:** this task wires up how `CalibrationJob.deviceId` (currently always `null` at
creation, per the fan-out task) gets populated once a technician has physically identified the
device on-site. Do NOT touch AKD/AKL escalation/approval logic (already implemented, separate
concern — a device can be assigned regardless of `akdAklApprovalStatus`, don't couple them
unless you find a real reason to and flag it explicitly). Do NOT build Portal or tech-pwa UI.
Do NOT modify `CalibrationJobStatus` or the fan-out logic. Do NOT modify the schema unless
Stage 1 investigation finds a genuine gap — if so, propose it explicitly and treat it as its
own mini-checkpoint within Stage 1, don't just add it silently.

## Background — confirmed decisions (do not re-litigate)

1. Regulatory licensing (Kemenkes/KAN) applies at the `DeviceType` level only, resolved long
   before requisition — completely out of scope here.
2. A new physical `Device` row (new serial number, under an already-licensed `DeviceType`) is
   a normal, frequent, unregulated occurrence — "plain data entry," per user confirmation. No
   special approval workflow is needed for creating one.
3. Generic `Device` CRUD already exists (`devices.service.ts`, Portal management/devices) —
   confirmed by the original full audit. This task wires that capability into the
   `CalibrationJob` lifecycle; it does not rebuild Device CRUD from scratch.
4. The original full audit found `@@index([companyId, serialNumber])` on `Device` — described
   as "a lookup aid only... No matching service, no fuzzy/serial match, no UI." Verify this is
   still accurate before designing on top of it.

## Stage 1 — Investigate current state, then propose the design (no code yet)

### Part A — Verify current state (don't assume prior audit is 100% current)

1. Re-read `devices.service.ts` live: what create/search/find methods exist today? Confirm
   whether any serial-number lookup/search method already exists beyond the bare index, and
   whether device creation requires anything beyond `deviceTypeId` + basic fields (does it
   require `companyId`, ownership/customer linkage, etc. — a device in this system is
   "customer-scoped master data" per the original audit; confirm what "scoped to which
   customer" means concretely — is there a customer/owner field on `Device`? Cite it.).
2. Confirm what identifies "which DeviceType this CalibrationJob's device should be." A job
   does not have a direct `deviceTypeId` column — trace the path (likely via
   `calibrationRequestItem.deviceTypeId`, or via `purchaseOrderItem.quotationItem.requestItem
   .deviceTypeId` when `calibrationRequestItemId` is null, matching the walk used in the
   fan-out task). State clearly what happens when NEITHER path resolves (a job with no
   `calibrationRequestItemId` and no walkable chain) — is device assignment still possible,
   just unvalidated against DeviceType? Propose an answer.
3. Confirm whether `Device` has a customer/owner association that should be checked at
   assignment time (i.e., should a technician only be able to match a job to a `Device` owned
   by the same customer as the WorkOrder's customer)? Trace `WorkOrder → customer` and
   `Device → customer/owner` if such a field exists, and state whether this validation is
   feasible and should be included.

### Part B — Propose the design

1. **Match-existing-device endpoint:** propose `POST /calibration-jobs/:id/assign-device` (or
   better name if you find one more consistent with existing conventions) accepting an
   existing `deviceId`. Guards to propose: job + device both in caller's company; device's
   `deviceTypeId` matches the job's resolved DeviceType (if resolvable, per Part A.2) —
   decide whether a mismatch is a hard error or a warning-but-allow, and justify; job's
   `deviceId` is currently null (don't allow silently overwriting an already-assigned device
   without an explicit re-assign reason — propose whether re-assignment needs a separate,
   more guarded path, or is simply disallowed once set).
2. **Register-new-device-and-assign endpoint:** propose `POST
   /calibration-jobs/:id/register-and-assign-device` accepting the same fields the existing
   Device create flow requires (reuse `devices.service.ts`'s create logic internally — do not
   duplicate device-creation logic), then atomically assigns the newly created device's id to
   the job. Propose whether this should default `customerDeclaredDeviceName` /
   `technicianObservedSerial` (already on the job) into the new Device's fields as sensible
   defaults, to save the technician re-typing data already captured — flag as a nice-to-have,
   not required.
3. **Search-existing-device endpoint (if missing):** if Part A.1 confirms there's no usable
   serial-number search today, propose a minimal `GET /devices?search=...` or reuse whatever
   the Portal's existing device list/search already does (check `apps/portal` device
   management UI's existing API calls first — don't invent a new search mechanism if the
   Portal already has one the mobile/technician flow could reuse).
4. **RBAC:** propose the action name(s) (e.g. `calibrationJob:assignDevice`) and which roles
   get them — TECHNICIAN and TECHNICIAN_MANAGER are the obvious candidates (they're the ones
   on-site), mirroring the AKD/AKL escalation task's grant pattern. State your reasoning.
5. **Zod/DTO schemas** for both endpoint bodies, following existing project convention.
6. Present the full Part A findings + Part B proposal and STOP. Do not write any code. Ask for
   explicit approval before Stage 2.

## Stage 2 — Implement (ONLY after explicit user approval)

1. Implement exactly what was approved in Stage 1.
2. Write tests covering: successful match-existing (deviceId set, DeviceType validated);
   DeviceType mismatch handling (per whatever Stage 1 decided — hard error or warn-allow);
   attempting to assign to a job that already has a device (per whatever Stage 1 decided);
   successful register-and-assign (new Device row created + job updated, atomically — if the
   job update fails, the Device should not be silently orphaned; propose and implement
   accordingly, e.g. wrap in `$transaction`); RBAC guard rejects unauthorized roles;
   cross-company rejection for both the job and any referenced device id.
3. Run `apps/api` typecheck and the relevant test suites; report results, and explicitly check
   (as in the prior tasks) whether any pre-existing unrelated test failures exist so they're
   not mistaken for regressions.
4. Do NOT touch AKD/AKL escalation files, WorkOrder fan-out files, or UI files.
5. Confirm final `git status` — list exactly which files changed.

## Output / final message format

**After Stage 1:** present Part A findings (with citations) and the full Part B proposal. End
with an explicit request for approval to proceed to Stage 2.

**After Stage 2 (only if reached):** confirm exactly which files changed, typecheck result,
test results, and endpoint reference summary (request/response shapes) for future Portal/
tech-pwa UI work.
