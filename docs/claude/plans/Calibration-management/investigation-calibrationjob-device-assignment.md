# Investigation + Design — CalibrationJob Device Assignment (Stage 1)

**Mode:** Read-only. No schema/code/migration changed. This report is the only file written.
**Date:** 2026-09-02
**Scope lock honoured:** no AKD/AKL logic touched, no `CalibrationJobStatus` / fan-out changes,
no Portal / tech-pwa UI. Schema-gap assessment in Part A.4 — conclusion: **no schema change needed**.

---

## PART A — Verified current state

### A.1 `devices.service.ts` live (`apps/api/src/modules/devices/devices.service.ts`)

| Method | Signature | Notes |
|---|---|---|
| `create` | `(companyId, DeviceCreateInput) => DeviceWithRelations` | `$transaction`: allocates immutable `code` via `MasterCodeService.allocate({ entity: "DEVICE", companyId, tx })`, then `tx.device.create`. Asserts `deviceTypeId` exists (`assertDeviceTypeExists`) and `customerId` belongs to company (`assertCustomerInCompany`). |
| `findAll` | `(companyId, DeviceListQuery)` | Paginated list. **`query.search` already does a case-insensitive `contains` OR across `code`, `brand`, `model`, `serialNumber`, `deviceType.name`, `customer.name`** (`devices.service.ts:102-113`). Also filters by `deviceTypeId`, `customerId`, `status`. |
| `findOne` | `(companyId, id)` | `findFirst({ where: { id, companyId } })`, 404 `DEVICE_NOT_FOUND` otherwise. |
| `update` / `remove` | — | `remove` refuses if referenced by request/quotation/PO items, **calibration jobs**, or certificates (`DEVICE_IN_USE`). |

**Serial-number search:** there is **no dedicated serial lookup** and **no unique constraint** on
serial — only `@@index([companyId, serialNumber])` (`schema.prisma:1312`). The prior audit's
description ("a lookup aid only… no matching service, no fuzzy/serial match, no UI") is **still
accurate for the API service**. However `findAll`'s generic `search` param *does* substring-match
`serialNumber` today, and the Portal already uses it (see A-note below). So a usable serial search
mechanism **does exist** at `GET /devices?search=` — it is just not job-scoped.

**What device creation requires** (`deviceCreateSchema`, `schemas/index.ts:1358` +
`DevicesService.create`):
- **Required:** `customerId` (min 1), `deviceTypeId` (min 1).
- **Optional:** `brand`, `model`, `serialNumber`, `category`, `locationText`, `status` (`ACTIVE` default).
- `code` is **system-issued**, never accepted from the client.

**"Customer-scoped master data" — concretely:** `Device.customerId String` is a **required**
column (`schema.prisma:1290`) with a hard FK to `Customer` (`onDelete: Cascade`) and
`@@index([companyId, customerId])`. Every device belongs to exactly one customer. `create`
enforces that customer is in the caller's company. So "scoped to which customer" = the
`Device.customerId` FK, non-null, always set at creation.

**A-note (Portal reuse):** `apps/portal/src/app/management/devices/use-devices-query.ts` calls
`apiFetch('/devices?...&search=<term>')` — the existing Portal device list/search. The mobile
flow can reuse the same `GET /devices` endpoint; nothing new is needed for "search by serial"
except a decision on scoping (A.3 / B.3).

### A.2 How a CalibrationJob resolves "which DeviceType"

A job has **no `deviceTypeId` column**. Two resolution paths:

1. **Direct:** `CalibrationJob.calibrationRequestItemId → CalibrationRequestItem.deviceTypeId`
   (`schema.prisma:1769`, `1354` — `deviceTypeId` is **required** on `CalibrationRequestItem`).
   **This is populated at fan-out** for every job the app creates:
   `work-orders.service.ts:575` sets `calibrationRequestItemId: requestItem?.id ?? null` from the
   walk `WorkOrderItem → purchaseOrderItem → quotationItem → requestItem`.
2. **Fallback walk (when `calibrationRequestItemId` is null):**
   `CalibrationJob.purchaseOrderItemId → PurchaseOrderItem.quotationItem → QuotationItem.requestItem → deviceTypeId`.
   This is the **same** chain that produced path 1, so in practice it resolves to the identical
   DeviceType — it is only a fallback for jobs whose `calibrationRequestItemId` came out null at
   fan-out (legacy/manual quotation rows with `QuotationItem.requestItemId = NULL`, the one weak
   link flagged in the fan-out investigation, `investigation-calibrationjob-fanout-design.md` §4).

**When NEITHER path resolves** (no `calibrationRequestItemId`, and `quotationItem.requestItem` is
null): DeviceType is **unknown** for that job. Proposed answer: **device assignment is still
allowed, but the DeviceType cross-check is skipped** (recorded as "not validated"), never blocked.
Rationale: a job that exists is a job a technician must be able to close out; an unresolvable
commercial chain is a back-office data gap, not a reason to strand a physical calibration. This
mirrors how fan-out itself degrades gracefully to null rather than failing.

### A.3 Customer/owner association to check at assignment time

- `WorkOrder.customerId String` — **required** (`schema.prisma:1582`), FK to `Customer`.
- `CalibrationJob.workOrderId → WorkOrder.customerId` gives the job's customer.
- `Device.customerId String` — **required** (`schema.prisma:1290`).

So `job.workOrder.customerId` vs `device.customerId` is a **direct, cheap, always-available
scalar comparison**. This validation is **feasible and should be included as a hard guard**: a
technician must only be able to match a job to a `Device` owned by the same customer as the
WorkOrder. For **register-and-assign**, the new device's `customerId` must be **forced** to
`job.workOrder.customerId` (not accepted from the client at all) — a technician on-site is
registering *this customer's* newly-seen unit by definition.

### A.4 Schema-gap assessment — **conclusion: no schema change required**

- `CalibrationJob.deviceId String?` already exists, nullable, `onDelete: Restrict`, with
  `@@unique([workOrderId, deviceId])` that only binds once set (`schema.prisma:1764`, `1835`).
- Everything the two endpoints need (`workOrder.customerId`, `calibrationRequestItem.deviceTypeId`,
  the PO-item fallback walk, `Device.customerId`/`deviceTypeId`) is already modelled.
- Identity snapshot fields (`technicianObservedSerial`, `customerDeclaredDeviceName`) already on
  the job for the "prefill the new Device" nice-to-have.
- **No new column, index, or enum is needed.** (If re-assignment history were required we'd want
  an audit row — but the proposal below disallows silent re-assignment, so that is deferred with
  AKD/AKL correction workflow to the Technician App, consistent with
  `[[akd-akl-identity-control-design]]`.)

---

## PART B — Proposed design

### B.1 Match-existing-device endpoint

```
POST /calibration-jobs/:id/assign-device
body: { deviceId: string }
RequirePermission("calibrationJob", "assignDevice")
```

Name chosen to match the existing `escalate-identity` / `identity-decision` verb-noun style on
this controller.

**Guards (in order):**
1. Job exists in caller's company (`findFirst({ where: { id, companyId } })` → 404
   `CALIBRATION_JOB_NOT_FOUND`) — same pattern as `CalibrationJobsService.findOne`.
2. Device exists in caller's company (`prisma.device.findFirst({ where: { id: deviceId, companyId } })`
   → 400 `DEVICE_NOT_FOUND`). Cross-company device id is rejected here.
3. **Customer match:** `device.customerId === job.workOrder.customerId` → else 400
   `DEVICE_CUSTOMER_MISMATCH`. **Hard error** (per A.3).
4. **DeviceType match:** resolve job DeviceType per A.2. If resolvable and
   `device.deviceTypeId !== resolvedDeviceTypeId` → **hard error** 400 `DEVICE_TYPE_MISMATCH`.
   If **not resolvable** → skip the check, proceed (response flags `deviceTypeValidated: false`).
   *Justification for hard error over warn-allow:* a mismatched DeviceType means the calibration
   procedure, parameters, tolerances and certificate template would all be wrong — there is no
   safe "proceed anyway". The escape hatch for a genuine mis-mapped requisition is to fix the
   `CalibrationRequestItem`, not to override here. (Contrast AKD/AKL, which is a regulatory
   *declaration* gate with a legitimate manager-approved override path — deliberately not coupled.)
5. **Already assigned:** if `job.deviceId !== null` → 409 `CALIBRATION_JOB_DEVICE_ALREADY_ASSIGNED`.
   Re-assignment is **disallowed on this path**. (See B.7.)
6. **Identity gate status:** reuse the existing `IDENTITY_LOCKED_JOB_STATUSES`
   (`SUBMITTED`, `ACCEPTED_BY_QA`) → 400 `CALIBRATION_JOB_IDENTITY_GATE_LOCKED` if past the bench.
   A device cannot be first assigned after the job is already submitted.

**Effect:** `prisma.calibrationJob.update({ where: { id }, data: { deviceId } })`. The
`@@unique([workOrderId, deviceId])` constraint gives a DB backstop against the same physical
device being matched to two jobs on one WorkOrder — catch `P2002` → 409
`DEVICE_ALREADY_ASSIGNED_ON_WORK_ORDER`.

**Response:** the job detail (extended `calibrationJobInclude` — add `device` + the resolved
DeviceType), plus `{ deviceTypeValidated: boolean }`.

### B.2 Register-new-device-and-assign endpoint

```
POST /calibration-jobs/:id/register-device
body: {
  brand?, model?, serialNumber?, category?, locationText?, status?   // same optional set as deviceCreateSchema
}                                                                    // NO customerId, NO deviceTypeId from client
RequirePermission("calibrationJob", "assignDevice")   // same action as B.1 — see B.4
```

- `customerId` is **derived** = `job.workOrder.customerId`.
- `deviceTypeId` is **derived** = the job's resolved DeviceType (A.2). **If the job's DeviceType
  is not resolvable, this endpoint returns 400 `CALIBRATION_JOB_DEVICE_TYPE_UNRESOLVED`** — we
  cannot invent a device with no type. (Match-existing in B.1 can still proceed unvalidated;
  register cannot, because `Device.deviceTypeId` is required.)
- **Reuse** `DevicesService.create(companyId, { customerId, deviceTypeId, ...body })` — do **not**
  duplicate code allocation / creation logic.
- **Atomicity:** wrap in `prisma.$transaction` — create the device *and* set `job.deviceId` in one
  transaction so a failed job update never orphans a `DVC-` code. `DevicesService.create` already
  takes its own `tx` internally for code allocation; Stage 2 will either (a) add an optional
  `tx` param to `DevicesService.create` and thread the outer transaction through, or (b) call it
  as-is and do the `job.update` immediately after inside a wrapping `$transaction` that also
  re-checks `job.deviceId` is still null (compensating delete of the new device on conflict).
  Preference: **(a)** — cleanest, mirrors how `MasterCodeService.allocate` already accepts `tx`.
- Same guards as B.1 items 1, 5, 6 (job in company; job.deviceId null; identity gate open).

**Prefill nice-to-have (flag, not required):** default the new Device's `serialNumber` from
`job.technicianObservedSerial` when the body omits it, and leave `brand`/`model` to the
technician. `customerDeclaredDeviceName` is the *customer's* term, not a manufacturer field, so
it is **not** a good default for any `Device` column — skip it. Recommend implementing the
`serialNumber` fallback only; it is low-risk and saves a re-type.

### B.3 Search-existing-device endpoint

`GET /devices?search=` **already exists and already substring-matches `serialNumber`**
(A.1) and the **Portal already consumes it**. But two problems for the technician flow:
1. `device:read` is granted to **ADMIN only** (`seed-role-permissions.ts:132`); TECHNICIAN /
   TECHNICIAN_MANAGER have **no `device` grant at all**.
2. `GET /devices` returns **every device for the company across all customers** — a technician
   picking a device for one job should only see that job's customer's devices of the right type.

**Proposal:** add a **job-scoped** candidate search on the calibration-jobs controller:

```
GET /calibration-jobs/:id/device-candidates?search=<term>
RequirePermission("calibrationJob", "assignDevice")
```

Internally delegates to `DevicesService.findAll(companyId, { search, customerId: job.workOrder.customerId,
deviceTypeId: <resolved or omitted>, status: "ACTIVE", pageSize: 20 })`. This reuses the existing
search mechanism (no new query logic), keeps the result set correctly scoped, and needs no new
`device:*` grant for technicians. Portal keeps using `GET /devices` unchanged.

### B.4 RBAC

Add **one** new action to the `calibrationJob` resource: **`assignDevice`**.

- Catalog: `packages/auth/src/access-control.ts` → `calibrationJob: [... , "assignDevice"]`.
- Seed: `packages/db/prisma/seed-role-permissions.ts` →
  - `{ role: "TECHNICIAN", resource: "calibrationJob", action: "assignDevice" }`
  - `{ role: "TECHNICIAN_MANAGER", resource: "calibrationJob", action: "assignDevice" }`
- `access-control.test.ts` expectation rows updated to match.

**Reasoning:**
- TECHNICIAN and TECHNICIAN_MANAGER are the on-site actors who physically identify the device —
  exactly the grant pattern used for `escalateIdentity` (`seed-role-permissions.ts:147-150`).
- **One** action covers match-existing (B.1), register (B.2), and candidate-search (B.3): they
  are the same operational capability ("bind this job to its physical device"), and splitting
  `registerDevice` out would gate a normal, unregulated data-entry step (per Background decision
  #2) behind a second grant for no benefit.
- **Not** granted to ADMIN/SUPERVISOR: consistent with the "operational read-only for
  back-office" stance on `calibrationJob` (`seed-role-permissions.ts:66-68`). SUPERADMIN keeps
  its `hasPermission` bypass.
- Device assignment is **decoupled from `akdAklApprovalStatus`** — a device can be assigned at
  any approval state (scope lock). No coupling found that justifies otherwise.

### B.5 Zod / DTO schemas (in `packages/shared/src/schemas/index.ts`, next to the identity-gate block)

```ts
/** POST /calibration-jobs/:id/assign-device body */
export const calibrationJobAssignDeviceSchema = z.object({
  deviceId: z.string().min(1),
});
export type CalibrationJobAssignDeviceInput = z.infer<typeof calibrationJobAssignDeviceSchema>;

/** POST /calibration-jobs/:id/register-device body.
 *  customerId + deviceTypeId are derived server-side from the job — never client input. */
export const calibrationJobRegisterDeviceSchema = z.object({
  brand:        z.string().trim().max(150).optional(),
  model:        z.string().trim().max(150).optional(),
  serialNumber: z.string().trim().max(100).optional(),
  category:     z.string().trim().max(150).optional(),
  locationText: z.string().trim().max(200).optional(),
  status:       z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
export type CalibrationJobRegisterDeviceInput = z.infer<typeof calibrationJobRegisterDeviceSchema>;
```

Field bounds copied verbatim from `deviceCreateSchema` so the two stay in lockstep. Controller
parses with `.safeParse` + `BadRequestException({ code: "INVALID_..." , issues })`, matching the
existing two POST handlers on this controller.

### B.6 Service include change (not a schema change)

Extend `calibrationJobInclude` in `calibration-jobs.service.ts`:
- add `device: { select: { id, code, serialNumber, deviceTypeId, customerId } }`
- add `deviceTypeId` + `deviceType { id, code, name }` to the `calibrationRequestItem` select
- add `workOrder.customerId` and `purchaseOrderItem { quotationItem { requestItem { deviceTypeId, deviceType }}}`
  for the fallback DeviceType walk.

### B.7 Re-assignment

**Disallowed once set** on the normal path (B.1 guard 5 → 409). A genuine correction (wrong
device matched) is deferred to the **Technician App correction workflow** alongside the AKD/AKL
correction path (`[[akd-akl-identity-control-design]]`) — it needs an audit trail, a reason, and
probably a manager gate, none of which belong in this MVP. Stage 2 will **not** build a
re-assign path; it will only make the "already assigned" rejection explicit and tested.

---

## Endpoint summary (for future Portal / tech-pwa work)

| Method | Path | Permission | Body | Success |
|---|---|---|---|---|
| `POST` | `/calibration-jobs/:id/assign-device` | `calibrationJob:assignDevice` | `{ deviceId }` | job detail + `{ deviceTypeValidated }` |
| `POST` | `/calibration-jobs/:id/register-device` | `calibrationJob:assignDevice` | `{ brand?, model?, serialNumber?, category?, locationText?, status? }` | job detail (new device created + assigned) |
| `GET` | `/calibration-jobs/:id/device-candidates?search=` | `calibrationJob:assignDevice` | — | `{ data: Device[], page, pageSize, total, totalPages }` scoped to job's customer + DeviceType |

Error codes: `CALIBRATION_JOB_NOT_FOUND` (404), `DEVICE_NOT_FOUND` (400),
`DEVICE_CUSTOMER_MISMATCH` (400), `DEVICE_TYPE_MISMATCH` (400),
`CALIBRATION_JOB_DEVICE_TYPE_UNRESOLVED` (400, register only),
`CALIBRATION_JOB_DEVICE_ALREADY_ASSIGNED` (409),
`DEVICE_ALREADY_ASSIGNED_ON_WORK_ORDER` (409, P2002 backstop),
`CALIBRATION_JOB_IDENTITY_GATE_LOCKED` (400).

---

## STOP — approval requested

No code written. Please confirm before Stage 2, in particular:

1. **DeviceType mismatch = hard error** (B.1 guard 4) — agree, or do you want warn-but-allow?
2. **Single `assignDevice` RBAC action** covering all three endpoints (B.4) — agree, or split
   `registerDevice` out?
3. **Re-assignment disallowed** (B.7), deferred to Technician App — agree?
4. **`device-candidates` job-scoped search** (B.3) rather than granting technicians `device:read`
   on the global `GET /devices` — agree?
5. **`serialNumber`-only prefill** for register-device (B.2) — include it, or skip prefill entirely?
6. Atomicity approach **(a)** — thread an optional `tx` into `DevicesService.create` — acceptable,
   or prefer the compensating-delete wrapper **(b)**?
