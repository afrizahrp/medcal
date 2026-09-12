# Implementation Report — Remove Register-New-Device from CalibrationJob Flow

**Date:** 2026-09-04
**Type:** Policy correction (business rule), not a bug fix
**Branch:** `main`
**Status:** Complete — Stage 1 (proposal) approved, Stage 2 (implementation) done and verified

---

## 1. Background

A prior task (`Implement_CalibrationJob_DeviceAssignment_Staged.md`) built a
`POST /calibration-jobs/:id/register-device` endpoint plus a Portal UI flow that let a
technician (or anyone holding `calibrationJob:assignDevice`) register a brand-new `Device`
row inline while assigning it to a calibration job.

The user subsequently clarified the actual business rule, which supersedes that design:

- Every device to be calibrated **must already be registered in the system before the
  WorkOrder is created.** Device registration is an office/admin-side action earlier in the
  pipeline (requisition → WorkOrder), never during on-site job execution.
- At the CalibrationJob stage the only allowed action is **matching** the job to an
  already-existing `Device` row (via `assign-device` + `device-candidates` search). There is
  no "register new" fallback at this stage for any role, including `TECHNICIAN_MANAGER` and
  `ADMIN`.
- If a technician arrives on-site and the device genuinely is not in the system, that is an
  operational exception resolved by going back through the office-side requisition/WorkOrder
  process — not something solved by a button on the job screen. No in-flow accommodation was
  built; it is explicitly out of scope.

## 2. Scope

**Removed:** the "register new device" capability from the `CalibrationJob` device-assignment
flow — backend endpoint + service method + shared schema, and the Portal dialog's register
toggle/form.

**Untouched (still fully functional):**

- `POST /calibration-jobs/:id/assign-device` (match to existing device)
- `GET /calibration-jobs/:id/device-candidates` (candidate search)
- The `calibrationJob:assignDevice` RBAC action
- AKD/AKL identity escalation, the identity-decision workflow, and fan-out logic
- The standalone Device master CRUD in `apps/portal/src/app/management/devices/` — device
  creation still exists there for office/admin use; it is just no longer reachable from any
  CalibrationJob screen.

## 3. Decisions

### 3.1 RBAC action name — kept as `calibrationJob:assignDevice`

"assign" still accurately describes the remaining capability (binding an existing Device
master row to a job). Renaming would churn `access-control.ts`, `seed-role-permissions.ts`, a
DB permission-row migration/reseed, `me.controller.ts`, `me-types.ts`, and the Portal
capability flag — for zero behavioral gain. Only the explanatory comments next to the action
were updated to drop the "or registering a new one" wording.

### 3.2 `devices.service.ts` `create(..., tx?)` parameter — kept

The optional `tx?: Prisma.TransactionClient` parameter was added for the now-removed atomic
register-and-assign. It is harmless, already covered by the local-vs-passed-transaction
branching, and generically reusable by any future caller that needs device creation to commit
atomically with other writes. Reverting it would mean re-touching the `run`/`$transaction`
logic for no benefit. Only the doc comment that cited "CalibrationJob register-and-assign" as
the motivating example was made generic.

## 4. Files changed

| File | Nature of change |
|---|---|
| `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts` | Deleted `@Post(":id/register-device")` route + `registerDevice` handler; removed `calibrationJobRegisterDeviceSchema` import |
| `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` | Deleted `registerDevice()` method (~60 lines); removed `CalibrationJobRegisterDeviceInput` type import |
| `apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts` | Removed 3 tests: two `register-and-assign` service tests, one `allows a TECHNICIAN through the register-device endpoint` RBAC test |
| `apps/api/src/modules/devices/devices.service.ts` | Comment-only — `tx?` parameter retained, doc comment de-references the register flow |
| `packages/shared/src/schemas/index.ts` | Deleted `calibrationJobRegisterDeviceSchema` and `CalibrationJobRegisterDeviceInput` |
| `packages/auth/src/access-control.ts` | Comment-only — `assignDevice` comment now describes match-to-existing only |
| `packages/db/prisma/seed-role-permissions.ts` | Comment-only — same wording adjustment |
| `apps/portal/src/app/management/calibration-jobs/[id]/page.tsx` | `AssignDeviceDialog` trimmed to assign-only: removed the `match`/`register` mode toggle, the entire register branch, `form` state, `RegisterInput` interface, `REGISTER_FIELD_LABELS`, `deviceType`/`registerPending`/`onRegister` props, `useRegisterDevice` usage. Dialog title → "Assign Device"; page button label → "Assign Device". New empty-state message (see §5). |
| `apps/portal/src/app/management/calibration-jobs/use-calibration-jobs-query.ts` | Deleted `useRegisterDevice()` mutation hook and its `CalibrationJobRegisterDeviceInput` import |

Not modified: `me.controller.ts`, `me-types.ts`, `calibration-job-utils.ts`
(`canAssignDevice` already had match-only semantics), and everything under
`apps/portal/src/app/management/devices/`.

Historical planning docs under this folder still reference the old endpoint by design and
were left as-is.

## 5. Portal empty-state wording

When a candidate search returns no devices, the dialog shows a plain message with **no action
button**:

> Tidak ada device yang cocok. Device harus didaftarkan lebih dulu oleh admin/kantor melalui
> proses requisition/work order sebelum bisa di-assign ke job ini.

## 6. Verification

| Check | Result |
|---|---|
| `pnpm --filter @medcal/api typecheck` | ✅ pass |
| `pnpm --filter portal typecheck` | ✅ pass |
| `pnpm --filter @medcal/shared typecheck` | ✅ pass |
| API `calibration-jobs` suite (`TEST_DATABASE_URL` set, after `prepare-test-db`) | ✅ **25 / 25 passed** |
| Portal `calibration-jobs` suite | ✅ **6 / 6 passed** |

The retained coverage — assign-existing-device, `device-candidates` customer/device-type
scoping, cross-company rejection, and RBAC (TECHNICIAN allowed, FINANCE 403) — remains green.

## 7. Outcome

"Register new device" is no longer reachable from any CalibrationJob surface. The endpoint,
service method, shared Zod schema, Portal mutation hook, and dialog UI are all removed. The
only device action at the CalibrationJob stage is matching to an already-registered device;
the standalone Device master CRUD is untouched.
