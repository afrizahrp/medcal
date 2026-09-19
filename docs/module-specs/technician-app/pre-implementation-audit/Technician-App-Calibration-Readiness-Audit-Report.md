# Audit — Technician App Calibration Readiness (MedCal backend/domain)

**Type:** AUDIT ONLY. No source, Prisma schema, migration, database, endpoint, or config
changes were made or are proposed. This document is a readiness report.

---

## Context

The Technician App has **not** been built. `apps/tech-pwa` is a login/FCM skeleton only
(`apps/tech-pwa/src/app/page.tsx:86` — "Skeleton — F6 foundation only"). Before that app
can be implemented, we need to know exactly what the existing MedCal codebase already
provides along the chain **Work Order → assignment → Calibration Job → execution →
parameter/result entry → submit/complete → handoff to Portal Review/Approval**, and what
is missing.

Finding, in one line: the commercial pipeline
(CalibrationRequest → Quotation → PurchaseOrder → **WorkOrder**) is fully implemented and
consumable; **everything from `CalibrationJob` onward exists as Prisma models + migrated
tables only, with zero runtime code** (no NestJS module, service, controller, zod
contract, seed, or UI).

---

## Executive summary

| Stage | Verdict |
|---|---|
| WorkOrder model + lifecycle (`PLANNED→ASSIGNED→IN_PROGRESS→DONE/CANCELLED`) | **READY** (WorkOrder-level only) |
| Technician assignment (`WorkOrderAssignment` + `POST /work-orders/:id/assign`) | **PARTIAL** |
| ON_SITE reference-equipment selection / confirmation / delivery note | **READY** |
| DeviceType calibration-parameter master (242 seeded params, tolerance, uom, decimalPlaces, ordering) | **READY** |
| `CalibrationJob` creation from a WorkOrder | **MISSING** |
| `CalibrationJob` service / controller / status transitions | **MISSING** |
| Typed measurement / result entry (per-parameter, pass/fail, reference standard) | **MISSING** (only `MeasurementResult.payloadJson Json`) |
| Job evidence upload endpoint | **PARTIAL** (`JobEvidence` model + `FilesModule` exist; no job route) |
| Customer signature capture | **MISSING** (model only) |
| Reference-equipment-used capture | **MISSING** (`JobReferenceEquipmentUsed` model only, free text) |
| Execution submit/complete | **MISSING** |
| Technician → Portal handoff status/entity | **MISSING** |
| QualityReview workflow (approve / reject / rework) | **MISSING** (model only) |
| Certificate generation | **MISSING** (model only) |
| TECHNICIAN menu entries + RolePermission seeds for `calibrationJob` / `certificate` | **MISSING** |
| `WorkOrder.done()` gating on job completion | **MISSING** (manual flip, no checks) |
| tech-pwa business screens + API client | **MISSING** (skeleton only) |

---

## Current domain architecture relevant to the Technician App

Monorepo (pnpm + turbo). Prisma schema is a **single file**:
`packages/db/prisma/schema.prisma` (~2034 lines).

- `apps/api` — NestJS. Module registry: `apps/api/src/app.module.ts`. Relevant existing
  modules: `work-orders`, `calibration-requests`, `quotations`, `purchase-orders`,
  `device-calibration-parameters`, `device-capabilities`, `equipment-requirements`,
  `equipment-calibration-records`, `files`.
- `apps/portal` — Next.js management UI. Work-order screens under
  `apps/portal/src/app/management/work-orders/`.
- `apps/tech-pwa` — Next.js PWA, **skeleton only** (`layout`, `page`, `providers`,
  `sign-in`, FCM plumbing). No work-order / job / calibration routes, no API client.
- `packages/shared/src/schemas/index.ts` — zod contracts. WO schemas ~L540–607. **No
  job / measurement schemas.**
- `packages/auth/src/access-control.ts:102` — verbs
  `calibrationJob: ["read","create","update","complete"]` and `certificate: ["issue"]`
  are **defined but unseeded** (`packages/db/prisma/seed-role-permissions.ts:136` grants
  `TECHNICIAN` only `managementDashboard:read`).
- Enums present but unused for routing: `MembershipRole.TECHNICIAN`,
  `MenuApplication.TECHNICIAN`, `PushApp.TECH_PWA`. `seed-menu.ts` has **zero** TECHNICIAN
  rows.

### Models along the chain (all in `packages/db/prisma/schema.prisma`)

- **WorkOrder** (L1534) — `serviceMode` (immutable after create), `status`
  `WorkOrderStatus @default(PLANNED)`, `equipmentConfirmedAt?`, `scheduledStart/End?`,
  geo fields. Relations: `assignments`, `jobs CalibrationJob[]` (L1563, never
  read/written), `equipment WorkOrderEquipment[]`, `deliveryNote`.
- **WorkOrderAssignment** (L1596) — `workOrderId × technicianUserId`,
  `roleOnJob AssignmentRole {LEAD, ASSIST}`. `@@unique([workOrderId, technicianUserId])`,
  `@@index([technicianUserId])`. **No accept/confirm/decline field.**
- **WorkOrderEquipment** (L1618) / **EquipmentDeliveryNote** (L1662) — ON_SITE reference
  equipment "yang akan dibawa" + Surat Jalan Alat. Fully implemented.
- **CalibrationJob** (L1710) ⚠ schema-only — `workOrderId`, `purchaseOrderItemId?`,
  `deviceId` (required FK), `status CalibrationJobStatus @default(PENDING)`, `startedAt?`,
  `submittedAt?`. `@@unique([workOrderId, deviceId])`, `@@index([companyId, status])`.
- **MeasurementResult** (L1737) ⚠ schema-only, **schemaless** — `payloadJson Json`
  (required), `summaryJson Json?`. **No typed columns, no FK to
  `DeviceCalibrationParameter`, no defined payload shape.**
- **JobEvidence** (L1751) — `calibrationJobId`, `fileObjectId`
  (`FileOwnerType.JOB_EVIDENCE`).
- **JobReferenceEquipmentUsed** (L1765) ⚠ schema-only — free-text
  `equipmentName/brand/model/serialNumber`, no FK to `Equipment`.
- **CustomerSignature** (L1780) ⚠ schema-only — `calibrationJobId @unique`,
  `fileObjectId?`, `signerName?`, `signedAt`.
- **QualityReview** (L1793) ⚠ schema-only — the intended Portal review entity.
  `calibrationJobId`, `reviewerUserId`, `decision ReviewDecision? {APPROVE,REJECT}`,
  `status QualityReviewStatus @default(PENDING) {PENDING,APPROVED,REJECTED}`, `notes?`,
  `reviewedAt?`.
- **Certificate** (L1817) ⚠ schema-only — `calibrationJobId @unique`, `qualityReviewId?`,
  `status {DRAFT,ISSUED,REVOKED,SUPERSEDED}`, `billingStatus`, verification token, PDF
  ref.
- **Device** (L1251) — `code` auto `DVC-000001`, `deviceTypeId` FK, `brand/model/
  serialNumber?`. `CalibrationRequestItem.deviceId` is free-text customer value and is
  explicitly **not** `CalibrationJob.deviceId` (schema L1330).
- **Calibration parameter master (READY):**
  `DeviceCapability` (L1150) → `DeviceCapabilityItem` (L1168) → `DeviceCalibrationParameter`
  (L1192: `valueType {NUMBER,RATIO,TEXT,BOOLEAN}`, `uomId?`, `toleranceMin/Max`,
  `toleranceNote`, `decimalPlaces? 0..10`, `sortOrder`). Per-DeviceType capability order
  in `DeviceTypeCapabilityOrder` (L1236). Full CRUD +
  `findAllGroupedByDeviceType` in `apps/api/src/modules/device-calibration-parameters/`.
  242 CONFIRMED params seeded (`packages/db/prisma/seed-device-calibration-parameters.ts`).
  ⚠ **No relation between `DeviceCalibrationParameter` and `MeasurementResult`.**

---

## Work Order → Calibration Job flow

**`WorkOrderStatus`** (schema L147): `PLANNED, ASSIGNED, IN_PROGRESS, DONE, CANCELLED`
(MVP). `TECHNICALLY_DONE` and `CLOSED` are legacy — "WorkOrder API must not use it".

**Transitions — `apps/api/src/modules/work-orders/work-orders.service.ts`:**
- `ALLOWED_TRANSITIONS` (L36): `PLANNED→{ASSIGNED,CANCELLED}`,
  `ASSIGNED→{IN_PROGRESS,CANCELLED}`, `IN_PROGRESS→{DONE,CANCELLED}`, `DONE→[]`,
  `CANCELLED→[]`.
- `create()` (L180) — requires `purchaseOrder.status === "APPROVED"`, PO has items, PO has
  a source calibration request, only one non-CANCELLED WO per PO. Snapshots every PO item
  1:1 into `WorkOrderItem`. **No `CalibrationJob` fan-out** — confirmed by
  `work-orders.service.test.ts:552` `it("does not create CalibrationJob rows")`.
- `assign()` (L420) — `PLANNED→ASSIGNED`; rejects duplicates; each assignee must be
  `status:"ACTIVE"` and a company member. **Does not check `MembershipRole.TECHNICIAN`** —
  any active member is assignable.
- `start()` (L473) — `ASSIGNED→IN_PROGRESS`; requires ≥1 assignment; ON_SITE requires
  `equipmentConfirmedAt` when the device types carry equipment requirements or units are
  already selected (`WORK_ORDER_EQUIPMENT_NOT_CONFIRMED`).
- `done()` (L789) — `IN_PROGRESS→DONE`, a bare `prisma.workOrder.update`. **No check for
  calibration jobs, measurements, evidence, signature, or QA.** WorkOrder-level, not
  per-device. After DONE the WO is fully locked.

**Endpoints — `work-orders.controller.ts`:** `POST /`, `GET /`, `GET /:id`, `PATCH /:id`,
`POST /:id/assign` (`workOrder:assign`), `POST /:id/start`, `POST /:id/done`,
`POST /:id/cancel`, equipment-proposal / equipment / equipment/confirm / equipment/order,
`GET /:id/pdf`; plus `delivery-notes.controller.ts`.

**`CalibrationJob` in non-generated code:** only
`apps/api/src/modules/devices/devices.service.ts:192` (`calibrationJob.count` delete
guard) and `work-orders.service.test.ts` fixtures. No `apps/api/src/modules/calibration-jobs/`.

---

## Technician assignment readiness — PARTIAL

Consumable now: `WorkOrderAssignment` (technician ↔ WO, LEAD/ASSIST),
`POST /work-orders/:id/assign` with `workOrderAssignSchema`
(`packages/shared/src/schemas/index.ts:596`), `User.workOrderAssignments` back-relation,
`@@index([technicianUserId])`.

Missing for a Technician App:
- No **"my work orders"** query — `workOrderListQuerySchema` filters only by
  `status/customerId/purchaseOrderId/quotationId`; no `technicianUserId` / `assignedToMe`.
- No **TECHNICIAN-role enforcement** on the assignee.
- No **unassign / reassign** endpoint.
- No **technician-side accept / acknowledge** of an assignment.

---

## Calibration result-entry readiness — MISSING

- Master data is READY (see architecture section): parameters per DeviceType with
  valueType, uom, tolerance bounds + verbatim note, decimalPlaces, and deterministic
  capability/parameter ordering, exposed via `findAllGroupedByDeviceType`.
- Capture side is **absent**: `MeasurementResult.payloadJson Json` + `summaryJson Json?`
  only — no zod schema, no per-parameter rows, no measured-value / pass-fail / uncertainty
  / reference-standard modeling, no service, no endpoint, no `DeviceCalibrationParameter`
  linkage.
- No worksheet / LK generator. LK specs exist only as Word docs in `docs/technician-docs/`
  (~50 device types).
- `JobEvidence` model + `FilesModule` (polymorphic `FileObject`,
  `FileOwnerType.JOB_EVIDENCE`) exist, but no job-evidence upload route.

---

## Execution completion readiness — MISSING

- `CalibrationJobStatus` (schema L165): `PENDING, IN_PROGRESS, SUBMITTED, REWORK,
  ACCEPTED_BY_QA` — defined, entirely unused.
- `CalibrationJob.startedAt` / `submittedAt` fields exist; nothing sets them.
- No "submit results" / "complete execution" action anywhere.
- The only completion concept in code is `WorkOrder.done()` — manual, WorkOrder-level,
  ungated.

---

## Technician → Portal handoff readiness — MISSING

**There is no implemented entity or status representing "technician execution complete,
ready for Portal Review/Approval."**

Schema-only intended design (not wired):
- `CalibrationJobStatus.SUBMITTED` + `CalibrationJob.submittedAt` = technician done,
  awaiting QA; `REWORK` = QA bounce-back; `ACCEPTED_BY_QA` = QA pass.
- `QualityReview` model = the Portal review record (`status`, `decision`, `reviewerUserId`,
  `reviewedAt`, `notes`).
- `Certificate.qualityReviewId?` links an issued certificate to the passing review.
- Verbs `calibrationJob:complete`, `certificate:issue` in `access-control.ts` (unseeded).

What exists today: `WorkOrder.status = DONE` via `POST /work-orders/:id/done`, callable by
any holder of `workOrder:update`, with no downstream trigger. `CalibrationRequestStatus`
`SUBMITTED` / `FULFILLED` are unrelated customer-intake states.

The closest usable handoff primitive is the pair
**`CalibrationJob.status = SUBMITTED` + `submittedAt`** feeding a Portal `QualityReview`
queue — but both sides must be built.

---

## Gaps (consolidated, nothing to implement here — reference list)

1. `CalibrationJob` module: creation/fan-out from a WorkOrder, `findMine`, status
   transitions, per-job read.
2. Job granularity is undefined in code: `@@unique([workOrderId, deviceId])` implies
   per-Device, yet `purchaseOrderItemId?` is also present.
3. Physical `Device` creation for on-site jobs — `CalibrationRequestItem.deviceId` is
   free-text and explicitly not the job device.
4. Typed measurement model / contract referencing `DeviceCalibrationParameter.id`
   (replacing or constraining `payloadJson`).
5. Job evidence upload route; `CustomerSignature` capture route;
   `JobReferenceEquipmentUsed` capture (auto-copy from `WorkOrderEquipment` vs manual).
6. Job submit → `SUBMITTED`; `QualityReview` module (approve / reject / rework) as the
   handoff; optional gate on `WorkOrder.done()`.
7. `WorkOrderAssignment`: "my work orders" filter, TECHNICIAN-role check, unassign,
   technician accept.
8. TECHNICIAN menu rows (`seed-menu.ts`) + RolePermission seeds for `calibrationJob` /
   `certificate`.
9. `Certificate` module (generation, issue, verification, PDF).
10. tech-pwa business screens + API client.
11. Shared zod contracts for job / measurement / review.

---

## Risks

- **Schemaless `MeasurementResult.payloadJson`** — if the Technician App writes an ad-hoc
  shape now, the Portal review UI, tolerance evaluation, and certificate generation
  inherit an unversioned contract that is expensive to migrate. Define the payload
  contract (and its link to `DeviceCalibrationParameter`) before the first write path
  ships.
- **`WorkOrder.done()` is ungated and irreversible** — once the Technician App exists, a
  WO can still be closed with zero calibration data, orphaning `CalibrationJob` rows.
- **No TECHNICIAN-role enforcement on assignment** — any active company member (including
  non-field staff) can be assigned; the Technician App would surface WOs to them.
- **Unseeded permissions** — `calibrationJob:*` / `certificate:issue` verbs exist but no
  role holds them; every new endpoint needs a matching `seed-role-permissions.ts` entry
  or it is unreachable.
- **Job-granularity ambiguity** (`deviceId` vs `purchaseOrderItemId`) — picking wrong
  forces a schema migration after data exists.
- Legacy `WorkOrderStatus` values (`TECHNICALLY_DONE`, `CLOSED`) still in the enum — must
  stay forbidden in any new code.

---

## Recommended implementation sequence (for a later, separate plan — not executed here)

1. Lock the **business decisions** below.
2. `CalibrationJob` module + fan-out on WorkOrder `start` (or `create`).
3. Typed measurement/result model + shared contract referencing
   `DeviceCalibrationParameter`; tolerance/pass-fail evaluation reusing
   `assertToleranceBounds` logic.
4. Job evidence + customer signature + reference-equipment-used endpoints.
5. Job submit → `CalibrationJob.SUBMITTED` + `submittedAt` (the handoff event).
6. `QualityReview` module (approve / reject / rework) — the Portal side of the handoff.
7. Gate `WorkOrder.done()` on all jobs `ACCEPTED_BY_QA` (or make auto-advance explicit).
8. TECHNICIAN menu rows + RolePermission seeds.
9. tech-pwa screens + API client (`assignedToMe` list → job → parameter entry → submit).
10. `Certificate` module.

### Business decisions required before step 2

- CalibrationJob granularity: per `Device`, per `WorkOrderItem`, or per
  `PurchaseOrderItem`?
- When/how physical `Device` rows are created for on-site jobs (technician-entered on
  site?).
- `MeasurementResult.payloadJson` structure; must values reference
  `DeviceCalibrationParameter.id`?
- Does `WorkOrder` auto-advance to `DONE` when all jobs reach `ACCEPTED_BY_QA`, or stay
  manual?
- QA review per-`CalibrationJob` or per-`WorkOrder`?
- Multi-device WO: partial submission / mixed job-state handling.
- Reference-equipment-used: auto-copied from `WorkOrderEquipment` or technician-entered?

---

## Verification performed for this audit (read-only)

- `packages/db/prisma/schema.prisma` — read models L100–310 (enums), L921–1350, L1534–1860.
- `apps/api/src/modules/work-orders/work-orders.service.ts` — `assign()` L420, `start()`
  L473, `done()` L789 read directly and confirmed.
- Glob for `calibration-job*` / `jobs` modules under `apps/api/src/modules/` — none exist.
- Two parallel Explore sweeps over `apps/api`, `apps/portal`, `apps/tech-pwa`,
  `packages/*`, seeds, and migrations — findings consistent.

## Explicit confirmation

**NO code, Prisma schema, migration, database, data, endpoint, seed, Portal, Work Order /
Calibration Job behaviour, or configuration changes were made.** This task produced only
this audit report (written to the plan file, the sole writable path in this session).
