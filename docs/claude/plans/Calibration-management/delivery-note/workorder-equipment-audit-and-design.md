# WORK ORDER EQUIPMENT — AUDIT + DESIGN (pre-implementation)

**Status:** AUDIT + DESIGN + IMPLEMENTED (2026-09-01). Decisions D1–D8 resolved by the user; see "RESOLVED DECISIONS" and "IMPLEMENTATION SUMMARY" at the end of this document.
**Date:** 2026-09-01
**Task spec:** `pre-implementation-delivery-note-2-audit.md` (same folder)
**Supersedes:** the assumption in `surat-jalan-alat-implementation-readiness-audit.md` that `EquipmentDeliveryNoteItem` is the first `WorkOrder`↔`Equipment` link. It is not — `WorkOrderEquipment` is.

Sections 1–14 below are the pre-implementation audit + design (§17 items 1–11). Delivery Note is **not** implemented — only the `WorkOrder ↔ actual Equipment` layer.

---

## 1. CURRENT DOMAIN AUDIT

### A. WorkOrder schema & relations (`packages/db/prisma/schema.prisma:1530`)

```
WorkOrder
  id, companyId, quotationId, purchaseOrderId, customerId, number
  serviceMode  ServiceMode (ON_SITE | SEND_TO_LAB)   -- immutable after create
  addressText, geoLat, geoLng, locationNotes, scheduledStart, scheduledEnd
  status  WorkOrderStatus @default(PLANNED)
  relations: company, quotation, purchaseOrder, customer,
             items WorkOrderItem[], assignments WorkOrderAssignment[], jobs CalibrationJob[]
  @@unique([companyId, number])
  partial unique (SQL): one active (status <> CANCELLED) WorkOrder per purchaseOrderId
```

`WorkOrderStatus` enum (`schema.prisma:147`) contains more values than the MVP uses. Service restricts to `MVP_STATUSES = PLANNED | ASSIGNED | IN_PROGRESS | DONE | CANCELLED` (`work-orders.service.ts:20`).

### B. WorkOrder creation flow (`work-orders.service.ts:135-248`)

Single `prisma.$transaction`:

1. Load `PurchaseOrder` (by id + companyId) with `items` and `quotation.request { id, serviceMode }`.
2. Guard: PO exists, PO `status === "APPROVED"`, PO has items, `quotation.request` present.
3. Guard: no existing active (`status <> CANCELLED`) WorkOrder for this PO → `DUPLICATE_ACTIVE_WORK_ORDER`.
4. `documentType = request.serviceMode === "ON_SITE" ? "WORK_ORDER" : "WORK_ORDER_SEND_TO_LAB"`; `DocumentNumberService.allocate({ companyId, documentType, issuedAt, tx })`.
5. `tx.workOrder.create(...)` with `status: "PLANNED"`.
6. `tx.workOrderItem.createMany(...)` — 1:1 snapshot of every PO item (`description`, `qty`).
7. Re-fetch with `workOrderInclude` and return.

`workOrderCreateSchema` (`packages/shared/src/schemas/index.ts:508`) accepts only: `purchaseOrderId`, `addressText`, `geoLat`, `geoLng`, `locationNotes`, `scheduledStart`, `scheduledEnd`. **Everything commercial is derived from the PO. No equipment input today.**

### C. WorkOrder items / devices being calibrated

`WorkOrderItem` (`schema.prisma:1568`) snapshots `PurchaseOrderItem`. The DeviceType chain, already loaded in `workOrderInclude` (`work-orders.service.ts:40-55`):

```
WorkOrderItem
  -> purchaseOrderItem
       -> quotationItem
            -> requestItem (CalibrationRequestItem)
                 -> deviceType { id, code, name }       <-- ALWAYS present (deviceTypeId is NOT NULL, schema.prisma:1317)
       -> device { id, brand, model, serialNumber }     <-- nullable (physical Device may be unassigned)
```

`CalibrationJob` (`schema.prisma:1604`) also carries `deviceId` (NOT NULL) → `device.deviceTypeId`, but jobs are created later (on site), so **at WorkOrder-create time the reliable DeviceType source is `item → purchaseOrderItem → quotationItem → requestItem → deviceType`**.

**Q1 answer — which DeviceTypes are available from the WorkOrder's calibration items?**
The distinct set of `requestItem.deviceTypeId` across `workOrder.items[]`. Always resolvable; never null.

### D. DeviceTypeEquipmentRequirement (`schema.prisma:1094`, service `device-type-equipment-requirements.service.ts`)

```
DeviceTypeEquipmentRequirement
  id, deviceTypeId, equipmentTypeId, notes, sortOrder Int @default(0)
  @@unique([deviceTypeId, equipmentTypeId])
```

- Master/template only. "NOT an assignment, NOT a per-job snapshot, no quantity / mandatory-flag / priority / lifecycle."
- `sortOrder` written as contiguous multiples of 10 per DeviceType (`ORDER_STEP = 10`), seeded from creation order; `reorder(deviceTypeId, requirementIds[])` rewrites them (full-set match enforced).
- Canonical read order (`requirementOrderBy`): `deviceType.name asc`, then `sortOrder asc`, then `equipmentType.name asc` (deterministic tie-break).
- RBAC resource: `equipmentRequirement` (`packages/auth/src/access-control.ts:72`).

**Q2 answer — how to resolve requirements for those DeviceTypes:**
`prisma.deviceTypeEquipmentRequirement.findMany({ where: { deviceTypeId: { in: [...] } }, include: { equipmentType }, orderBy: [{ sortOrder: "asc" }, { equipmentType: { name: "asc" } }] })`.

**Q3 answer — same EquipmentType from multiple DeviceTypes?**
Yes. `@@unique([deviceTypeId, equipmentTypeId])` only prevents dupes _within one DeviceType_. Two DeviceTypes on the same WorkOrder can both require `Electrical Safety Analyzer`. Must be deduplicated for the proposal.

### E. Equipment master (`schema.prisma:1015`, service `equipment.service.ts`)

```
Equipment  -- INDIVIDUAL PKM-owned unit
  id, companyId, equipmentTypeId, code (EQU-000001, system-issued, immutable, @@unique([companyId, code]))
  brand?, model?, serialNumber? (nullable, NOT unique), isActive Boolean @default(true), notes?
  relations: company, equipmentType, calibrationRecords EquipmentCalibrationRecord[]
```

- **Company-scoped** (`companyId` required) — same tenancy convention as `Device`. There is **no customer ownership on `Equipment`** — it is always PKM's. (Spec §5 "Equipment belonging to another domain/customer" → only cross-_company_ isolation applies; no per-customer dimension exists.)
- `isActive` is the active/inactive state (**Q5 answer: yes**).
- Queried via `findAll` with `equipmentTypeId` + `isActive` + `search` filters, `equipmentInclude = { equipmentType }`.
- `remove()` comment already anticipates this feature: _"Equipment has no downstream references yet (JobReferenceEquipmentUsed link, **WorkOrderEquipment**, EquipmentCalibrationRecord are all future)"_.
- RBAC resource: `equipment`.

**Q4 answer — how actual Equipment is selected today:** only via the Equipment master list UI (`apps/portal/src/app/management/equipment-units/`). Nothing links it to a WorkOrder.
**Q6 answer — EquipmentType↔Equipment:** `Equipment.equipmentTypeId` FK → `EquipmentType` (1:N). `EquipmentType.equipment Equipment[]` back-relation.
**Q7 answer — can one Equipment serve multiple WorkOrders:** nothing prevents it today (no link exists). Physically one unit can only be in one place at a time, but modelling a hard exclusivity lock is an OPEN DECISION (§11-D3).
**Q8 answer — existing constraints preventing duplicate equipment:** none (no link table).

### F. EquipmentType (`schema.prisma:990`)

```
EquipmentType
  id, code @unique, name, description?, category?, isActive Boolean @default(true)
  relations: deviceRequirements DeviceTypeEquipmentRequirement[], equipment Equipment[]
```

### G. EquipmentCalibrationRecord / calibration validity (`schema.prisma:1058`)

Phase 2B. Append-only history; current validity is **derived** for a reference date (there is deliberately no `Equipment.calibrationDueDate` field). Fields: `calibrationDate`, `validFrom?`, `validUntil`, `status DRAFT|CONFIRMED`, `acceptedForUse`. A validity-derivation service is referenced but **not yet confirmed to exist as a reusable export** — see §11-D5.

### H. Existing reference-equipment logic

`JobReferenceEquipmentUsed` (`schema.prisma:1659`): free-text (`equipmentName`, `brand`, `model`, `serialNumber`), FK only to `CalibrationJob`, **no API module, no UI, no FK to `Equipment`**. It is a post-calibration traceability record for the certificate, not a pre-departure selection. **Not reusable as the WorkOrder↔Equipment link.**

### I. Existing API endpoints / services

- `WorkOrdersController` (`work-orders.controller.ts`): `POST /` , `GET /`, `GET /:id`, `GET /:id/pdf`, `PATCH /:id`, `POST /:id/assign`, `POST /:id/start`, `POST /:id/done`, `POST /:id/cancel`. Guard `CompanyRoleGuard` + `@RequirePermission("workOrder", <action>)`. Zod `safeParse` at controller boundary; service takes typed input.
- `EquipmentService`, `DeviceTypeEquipmentRequirementsService` as above. The requirements service exposes `reorder()` with a full-set-match validation helper (`assertSameSet`) — a good pattern to mirror.

### J. Existing WorkOrder UI

`apps/portal/src/app/management/work-orders/` — `work-orders-ui.tsx`, `use-work-orders-query.ts`, `[id]/page.tsx` (detail, hosts the SPK PDF download). Equipment-units UI at `apps/portal/src/app/management/equipment-units/`; equipment-requirements UI (with dnd-kit reorder) at `apps/portal/src/app/management/equipment-requirements/`.

### K. Permissions / RBAC (`packages/auth/src/access-control.ts`)

`workOrder: ["read", "create", "update", "cancel", "assign"]`. `equipment: [...]`, `equipmentRequirement: [...]`, `equipmentType: [...]`. Seeded in `packages/db/prisma/seed-role-permissions.ts`.

### L. Ordering / sortOrder conventions

Established pattern (`DeviceTypeEquipmentRequirement`, `DeviceCalibrationParameter`, `DeviceTypeCapabilityOrder`): `Int sortOrder`, contiguous multiples of 10, written in one transaction, deterministic name tie-break on read. dnd-kit UI for reorder where the module has a management screen.

### M. Transaction patterns

`prisma.$transaction(async (tx) => { ... })` for multi-write flows (WorkOrder create, assign). `DocumentNumberService.allocate` requires the `tx`. `createMany` for bulk child inserts. Unique-violation (`P2002`) caught and remapped to a domain `ConflictException`.

---

## 2. EXACT GAP

There is **no persistent entity linking a `WorkOrder` to the actual `Equipment` units** the technician will bring.

- `DeviceTypeEquipmentRequirement` answers _"what type of tool"_ at the DeviceType level — no unit identity, no per-WorkOrder scope.
- `JobReferenceEquipmentUsed` is free-text, per-`CalibrationJob`, post-hoc, no `Equipment` FK, no API.
- `WorkOrderItem` / `WorkOrderAssignment` model devices-to-calibrate and technicians — not tools-to-bring.

Consequence: an ON_SITE WorkOrder cannot record, validate, or later print (on the Surat Jalan) which specific instruments (`ESA-001`, SN `6579027`) travel with it.

---

## 3. PROPOSED DATA MODEL

One additive model. No changes to existing models' semantics.

```prisma
/// Actual PKM reference-equipment units selected to be brought for a specific
/// ON_SITE WorkOrder ("Equipment yang akan dibawa"). The DEFAULT proposal is
/// derived from DeviceTypeEquipmentRequirement of the WorkOrder's calibration
/// items, but once selected the list belongs to the WorkOrder and is independent
/// of both DeviceTypeEquipmentRequirement and any future EquipmentDeliveryNote.
/// SEND_TO_LAB WorkOrders never have rows here.
model WorkOrderEquipment {
  id              String   @id @default(cuid())
  companyId       String
  workOrderId     String
  equipmentId     String
  /// Snapshot of the EquipmentType this row was selected to satisfy. Kept so the
  /// "which requirement does this cover" grouping survives even if the Equipment
  /// unit is later re-typed. Not a hard constraint target.
  equipmentTypeId String
  /// Operational order within THIS WorkOrder's list (multiples of 10). Seeded
  /// from the deduplicated DeviceTypeEquipmentRequirement order at proposal time;
  /// user reorder persists here only. NEVER on Equipment.
  sortOrder       Int      @default(0)
  notes           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  company   Company   @relation(fields: [companyId], references: [id], onDelete: Cascade)
  workOrder WorkOrder @relation(fields: [workOrderId], references: [id], onDelete: Cascade)
  equipment Equipment @relation(fields: [equipmentId], references: [id], onDelete: Restrict)

  @@unique([workOrderId, equipmentId])   // no duplicate unit within one WorkOrder
  @@index([workOrderId])
  @@index([equipmentId])
  @@index([companyId])
}
```

Back-relations (additive, no semantic change):

- `WorkOrder`: `equipment WorkOrderEquipment[]`
- `Equipment`: `workOrderSelections WorkOrderEquipment[]`
- `Company`: `workOrderEquipment WorkOrderEquipment[]`

`onDelete: Restrict` on `equipment` → an `Equipment` unit that has ever been selected for a WorkOrder cannot be hard-deleted (must be soft-retired via `isActive=false`). This updates the now-stale `equipment.service.ts:167` comment and `remove()` behaviour — see §7 API impact.

**Why a snapshot `equipmentTypeId` and not more snapshot fields?** Name/brand/model/serial snapshotting is the future `EquipmentDeliveryNoteItem`'s job (§13 of the spec). `WorkOrderEquipment` holds live identity (`equipmentId`) so the picker and validation always reflect the master; the Delivery Note will snapshot at issue time.

**No `confirmedAt` / status column yet** — see §11-D1: whether "confirmed equipment list" is a boolean on `WorkOrder`, a derived check, or a state here is an OPEN DECISION. The model above supports all three without change.

---

## 4. WORKORDER CREATION FLOW (proposed)

`serviceMode` is known inside the create transaction (`request.serviceMode`). Two options, decision in §11-D2:

### Option A (recommended) — propose at create, persist immediately

Extend `workOrderCreateSchema` with an **optional** `equipment?: { equipmentId, equipmentTypeId }[]`.

```
prisma.$transaction:
  ... existing steps 1-6 unchanged ...
  7. if serviceMode === ON_SITE:
       if input.equipment provided:
         validate each row (see §6) against master, within tx
         tx.workOrderEquipment.createMany(rows with sortOrder = (i+1)*10)
       else:
         // no auto-pick of Equipment units (§4.6 of spec) — leave empty,
         // the UI fetches the proposal separately and the planner fills it in
  8. re-fetch with workOrderInclude (+ equipment) and return
```

WOL path: `input.equipment` ignored (or rejected with `EQUIPMENT_NOT_APPLICABLE_FOR_SEND_TO_LAB` if non-empty — decision D2).

### Default-proposal endpoint (read-only, no persistence)

`GET /work-orders/:id/equipment-proposal` → runs the §5 algorithm and returns the deduplicated required `EquipmentType[]` **each with its candidate `Equipment[]`** (active units of that type in the company), so the UI can render selectors. Does **not** write anything. Also usable pre-create by passing `?purchaseOrderId=` (returns proposal from the PO's items) — decision D2 covers whether the pre-create variant is needed for v1.

### Editing after create

New sub-routes on the WorkOrder (mirrors `assign`):

- `PUT /work-orders/:id/equipment` — replace the full set (validated), rewrite `sortOrder` contiguously. ON_SITE + non-terminal only.
- Optional granular `POST /:id/equipment` (add one), `DELETE /:id/equipment/:rowId` (remove one) — decision D6 (keep API minimal: `PUT` full-set may be enough).

---

## 5. DEFAULT EQUIPMENT RESOLUTION ALGORITHM

Input: a WorkOrder (or a PO) whose items resolve to DeviceTypes `D = [d1..dn]` (with duplicates possible).

```
1. deviceTypeIds = distinct( item.purchaseOrderItem.quotationItem.requestItem.deviceTypeId
                             for item in workOrder.items )
2. reqs = deviceTypeEquipmentRequirement.findMany(
             where deviceTypeId in deviceTypeIds,
             include equipmentType,
             orderBy [ sortOrder asc, equipmentType.name asc ] )       // per-DeviceType order preserved
3. // deterministic overall ordering across DeviceTypes:
   order deviceTypeIds by deviceType.name asc      // matches requirementOrderBy's primary key
   walk deviceTypeIds in that order; within each, walk its reqs in (sortOrder, name) order
4. dedupe by equipmentTypeId, keeping FIRST occurrence (earliest DeviceType, then its order)
   -> proposedTypes = [ {equipmentType, coveredFromDeviceType, originalSortOrder} ]
5. assign proposal sortOrder = 10, 20, 30, ... in that final walk order
6. for each proposedType: candidates = equipment.findMany(
             where companyId, equipmentTypeId = type.id, isActive = true,
             orderBy [ code asc ] )                // deterministic, NOT auto-selected
7. return proposedTypes each with candidates[]; selectedEquipmentId = null
```

- **No auto-select** of a specific unit (spec §4.6 / §4 example "Do NOT silently choose ESA-001"). The domain has no deterministic safe rule (e.g. "the only active unit") mandated — if exactly one active candidate exists the UI may pre-fill it, but the server never persists a selection the user didn't make.
- **`sortOrder` from `DeviceTypeEquipmentRequirement` is respected** (step 2/3), never modified (spec §8).
- Deterministic dedupe: first occurrence in a stable `(deviceType.name, sortOrder, equipmentType.name)` walk.

---

## 6. VALIDATION RULES (server-side, never trust client)

On any write to `WorkOrderEquipment` (create-with-WO or `PUT /:id/equipment`):

| #   | Rule                                                                          | Error code                                 | Status                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | WorkOrder exists, belongs to `companyId`                                      | `WORK_ORDER_NOT_FOUND`                     | enforced                                                                                                                                                                                |
| V2  | `workOrder.serviceMode === "ON_SITE"`                                         | `EQUIPMENT_NOT_APPLICABLE_FOR_SEND_TO_LAB` | enforced                                                                                                                                                                                |
| V3  | WorkOrder is non-terminal (`PLANNED`/`ASSIGNED`/`IN_PROGRESS`)                | `INVALID_STATUS_FOR_EQUIPMENT_UPDATE`      | enforced (mirrors `assertNonTerminal`)                                                                                                                                                  |
| V4  | Each `equipmentId` exists and `companyId` matches                             | `EQUIPMENT_NOT_FOUND`                      | enforced                                                                                                                                                                                |
| V5  | Each Equipment `isActive === true`                                            | `EQUIPMENT_INACTIVE`                       | enforced (spec §5 "active/usable")                                                                                                                                                      |
| V6  | No duplicate `equipmentId` in the payload                                     | `DUPLICATE_WORK_ORDER_EQUIPMENT`           | enforced (+ DB `@@unique`)                                                                                                                                                              |
| V7  | `equipmentTypeId` on each row equals `equipment.equipmentTypeId`              | `EQUIPMENT_TYPE_MISMATCH`                  | enforced (spec §5 "EquipmentType matches")                                                                                                                                              |
| V8  | Cross-company isolation — Equipment from another company not selectable       | (covered by V4 `companyId` filter)         | enforced                                                                                                                                                                                |
| V9  | Selected `equipmentTypeId` is among the WorkOrder's _proposed_ required types | —                                          | **OPEN — D4**: allow off-template additions freely (spec §0 "add another required equipment when necessary") vs warn vs block. Recommend **allow** (spec explicitly permits additions). |
| V10 | Selected Equipment has valid calibration at `scheduledStart`                  | `EQUIPMENT_CALIBRATION_EXPIRED`            | **OPEN — D5**: block / warn / ignore. Recommend **warn** (non-blocking) pending a confirmed validity service.                                                                           |
| V11 | Equipment not already locked to another overlapping WorkOrder                 | —                                          | **OPEN — D3**: recommend **no lock** for v1 (physical conflict is an ops concern, not a data invariant).                                                                                |

Uncertain rules (V9–V11) are documented as OPEN, not silently implemented (spec §5 final paragraph).

---

## 7. API IMPACT

**New (smallest set):**

- `GET /work-orders/:id/equipment-proposal` — `@RequirePermission("workOrder", "read")`. Returns `{ proposedTypes: [{ equipmentType, sortOrder, coveredFromDeviceType, candidates: Equipment[], selectedEquipmentId: string | null }] }` merging the §5 algorithm with any already-persisted `WorkOrderEquipment`.
- `PUT /work-orders/:id/equipment` — `@RequirePermission("workOrder", "update")`. Body `{ equipment: { equipmentId: string, equipmentTypeId: string, notes?: string }[] }`. Full-set replace in a transaction; `sortOrder` rewritten `10,20,30...` in submitted order; validations V1–V8.

**Changed:**

- `workOrderCreateSchema` — add optional `equipment?: {...}[]` (D2). `WorkOrdersService.create` persists it in the existing transaction when `serviceMode === ON_SITE`.
- `workOrderInclude` — add `equipment: { include: { equipment: { include: { equipmentType } } }, orderBy: { sortOrder: "asc" } }`.
- `EquipmentService.remove` — now that `WorkOrderEquipment` FKs `Equipment` with `onDelete: Restrict`, a hard delete of a referenced unit throws `P2003`; catch and remap to `EQUIPMENT_IN_USE` (or pre-check). Update the stale comment.
- §7 lifecycle gate (spec §7 MANDATORY): enforce "ON_SITE WorkOrder must have a confirmed equipment list before operational" at an **existing** transition. Candidates: `POST /:id/start` (`ASSIGNED → IN_PROGRESS`) — recommended, "operational" = work begins. **OPEN — D1** (confirm the transition + what "confirmed" means).

**RBAC:** reuse `workOrder` resource actions (`read` for proposal, `update` for mutation). No new resource, no RBAC-semantics change (spec §11).

**Shared package:** add `workOrderEquipmentSchema` (+ `WorkOrderEquipmentInput` type) and extend `workOrderCreateSchema` in `packages/shared/src/schemas/index.ts`.

---

## 8. UI IMPACT

`apps/portal/src/app/management/work-orders/[id]/page.tsx` — new section **"Equipment yang akan dibawa"**, rendered only when `workOrder.serviceMode === "ON_SITE"`:

- Table of proposed required `EquipmentType`s (from `GET /:id/equipment-proposal`), in proposal `sortOrder`.
- Per row: an `Equipment` unit `<select>` (candidates = active units of that type), showing `code · brand · model · SN`.
- Actions: replace selection, remove a row, "add equipment" (pick any active `EquipmentType` + unit), reorder (buttons/drag — dnd-kit already used in `equipment-requirements`; keep to simple up/down for v1 unless D7 says otherwise).
- Validation state surfaced inline (inactive unit, type mismatch, calibration warning).
- "Save equipment list" → `PUT /:id/equipment`. A "confirmed" affordance tied to the D1 gate.
- WOL WorkOrders: section **not rendered**, no proposal fetched (spec §6, §10).
- Follow existing portal patterns (query hook `use-work-orders-query.ts` + a new `use-work-order-equipment-query.ts`). No new visual language, no unrelated WO UI changes.

Create flow (`work-orders-ui.tsx`): v1 can create the WO first (PLANNED) then fill equipment on the detail page — simplest, matches how `assign` works. Inline-at-create is D2.

---

## 9. MIGRATION IMPACT

One additive migration: `CREATE TABLE "WorkOrderEquipment"` + 3 indexes + `@@unique([workOrderId, equipmentId])` + 3 FKs (`Company` cascade, `WorkOrder` cascade, `Equipment` restrict). Follows the convention of `20260826200000_add_job_reference_equipment_used`. **No enum change, no data backfill, no change to any existing table.** Safe on a populated DB (new empty table).

Generate with the repo's Prisma workflow (`pnpm --filter @medcal/db prisma migrate dev --name add_work_order_equipment`). Do not hand-write drift.

---

## 10. TEST PLAN

`apps/api/src/modules/work-orders/work-orders.service.test.ts` (extend) + a focused `work-order-equipment.service.test.ts`. Repo convention: services tested against a real Postgres; existing setup's local-dev mechanism is honoured (do not demand `TEST_DATABASE_URL` if the repo already resolves a safe local DB — spec §15).

| #   | Case                                                                     | Asserts                                                   |
| --- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| 1   | ON_SITE WO can persist `WorkOrderEquipment`                              | rows created, returned in include                         |
| 2   | SEND_TO_LAB WO rejects equipment payload / proposal empty                | `EQUIPMENT_NOT_APPLICABLE_FOR_SEND_TO_LAB`; no rows       |
| 3   | Proposal derives from `DeviceTypeEquipmentRequirement` of the WO's items | proposed types == union of requirements                   |
| 4   | Requirement `sortOrder` preserved in proposal                            | order matches `(deviceType.name, sortOrder, name)` walk   |
| 5   | Unknown `equipmentId` rejected                                           | `EQUIPMENT_NOT_FOUND`                                     |
| 6   | `equipmentTypeId` ≠ `equipment.equipmentTypeId` rejected                 | `EQUIPMENT_TYPE_MISMATCH`                                 |
| 7   | Duplicate `equipmentId` in one WO rejected                               | `DUPLICATE_WORK_ORDER_EQUIPMENT` (payload + DB unique)    |
| 8   | Selection persists across re-fetch                                       | `findOne` returns rows with `sortOrder` 10,20,30          |
| 9   | `WorkOrderEquipment` exists with no Delivery Note                        | rows present; no DLN entity touched                       |
| 10  | Existing WO create/assign/start/done/cancel unchanged                    | existing tests still green; numbering unchanged           |
| 11  | Multiple DeviceTypes → deterministic deduped proposal                    | shared EquipmentType appears once, first-occurrence order |
| 12  | WO numbering unchanged                                                   | SPK/WOL sequence assertions untouched                     |
| 13  | Inactive Equipment rejected                                              | `EQUIPMENT_INACTIVE`                                      |
| 14  | Cross-company Equipment not selectable                                   | `EQUIPMENT_NOT_FOUND`                                     |
| 15  | `Equipment.remove` blocked when referenced                               | `EQUIPMENT_IN_USE` / `P2003` remap                        |

Plus: `pnpm typecheck`, `pnpm build`.

---

## 11. OPEN BUSINESS DECISIONS

**These block implementation start. §7 explicitly says: do not invent a lifecycle — confirm it.**

- **D1 — [BLOCKER, spec §7] The "confirmed equipment list" gate.**
  Where must "an ON_SITE WorkOrder must have a confirmed equipment list before it becomes operational/final" be enforced?
  - (a) at `POST /:id/start` (`ASSIGNED → IN_PROGRESS`) — recommended; "operational" = work begins.
  - (b) at `POST /:id/assign` (`PLANNED → ASSIGNED`).
  - (c) at a new explicit "confirm equipment" action that does not change WO status.
    And what counts as "confirmed": at least one `WorkOrderEquipment` row? every proposed required type has a selected unit? an explicit `confirmedAt` timestamp set by the planner?

- **D2 — Create-time vs detail-page equipment entry.**
  Does `workOrderCreateSchema` accept `equipment[]` at creation (Option A), or is equipment always added on the detail page after the WO exists (like `assign`)? Affects whether a pre-create proposal endpoint (`?purchaseOrderId=`) is needed.

- **D3 — Equipment exclusivity across WorkOrders.**
  May the same `Equipment` unit be selected on two active ON_SITE WorkOrders whose schedules overlap? Recommend **no lock** for v1 (ops concern). Confirm.

- **D4 — Off-template equipment additions (V9).**
  Spec §0 permits "add another required equipment when necessary". Confirm additions of `EquipmentType`s **not** in the DeviceType requirements are allowed freely (recommended), vs warned, vs blocked.

- **D5 — Calibration-validity enforcement (V10).**
  Block / warn / ignore selecting an `Equipment` whose derived calibration validity is expired at `scheduledStart`? Recommend **warn**. Also: does a reusable validity-derivation service export exist from Phase 2B, or must this feature compute `validUntil >= scheduledStart` inline? (Needs a code check before building V10.)

- **D6 — API granularity.**
  Is a single `PUT /:id/equipment` full-set replace sufficient, or are `POST` (add one) / `DELETE` (remove one) sub-routes required for the UX?

- **D7 — Reorder UX.**
  `WorkOrderEquipment.sortOrder` is proposed (needed for the future Surat Jalan print order). Is drag-and-drop reordering required now, or are up/down buttons enough for v1? (Spec §9: "do not implement drag-and-drop unless required".)

- **D8 — Removing a _required_ row.**
  Spec §0 allows "remove an equipment requirement from the WO when operationally unnecessary". If D1's "confirmed" definition is "every proposed type has a unit", removing a required row must still let the WO proceed. Confirm the interaction: a removed required type is simply absent (allowed), vs must be explicitly marked "not needed" with a reason.

---

## Scope confirmations (to be restated after implementation)

Not touched by this design: Delivery Note / DLN numbering / Surat Jalan PDF / new DocumentType / Delivery Note tables; `DeviceTypeEquipmentRequirement` semantics & ordering; `Equipment` master semantics (only `remove()` behaviour tightens via FK); WorkOrder / SPK / WOL numbering; `DeviceCalibrationParameter`; quotation / requisition logic; `ServiceMode` semantics; WOL behaviour & UI.

---

## Recommendation

The data-model (§3), algorithm (§5), and validations V1–V8 are internally consistent and ready to build. **Hold implementation until D1 (and ideally D2) are answered** — D1 is a spec-mandated STOP. D3–D8 have safe recommended defaults and can proceed on those if the user confirms "use recommended defaults".

---

## RESOLVED DECISIONS (2026-09-01)

- **D1 — Explicit confirm action.** New nullable `WorkOrder.equipmentConfirmedAt`; `POST /work-orders/:id/equipment/confirm` sets it (requires ≥1 selected unit). `POST /:id/start` blocks ON_SITE work orders when `equipmentConfirmedAt` is null **and** there is something to confirm (device types carry `DeviceTypeEquipmentRequirement` rows, or units are already selected). Editing the list (`PUT /:id/equipment`) always clears the confirmation.
- **D2 — Optional at create + detail page.** `workOrderCreateSchema.equipment?` accepts the initial selection (persisted in the existing create transaction, ON_SITE only); `GET /work-orders/equipment-proposal?purchaseOrderId=` serves the pre-create proposal; the detail page uses `GET /work-orders/:id/equipment-proposal` + `PUT /:id/equipment`.
- **D3–D8 — recommended defaults.** No cross-work-order exclusivity lock; off-template additions allowed; calibration-expiry is a **non-blocking warning** (via `resolveCalibrationValidity` at `scheduledStart`); a single `PUT /:id/equipment` full-set replace (no granular add/remove routes); reorder persists through `WorkOrderEquipment.sortOrder` but the v1 UI has no drag-and-drop.

---

## IMPLEMENTATION SUMMARY (2026-09-01)

### Files changed

| File                                                                                  | Change                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/prisma/schema.prisma`                                                    | New `WorkOrderEquipment` model; `WorkOrder.equipmentConfirmedAt DateTime?`; back-relations on `WorkOrder`, `Equipment`, `Company`.                                                                                                                 |
| `packages/db/prisma/migrations/20260901103230_add_work_order_equipment/migration.sql` | Additive: `ALTER TABLE "WorkOrder" ADD COLUMN "equipmentConfirmedAt"`, `CREATE TABLE "WorkOrderEquipment"` (+3 indexes, `@@unique([workOrderId, equipmentId])`, FKs — Company/WorkOrder cascade, Equipment restrict). No enum change, no backfill. |
| `packages/shared/src/schemas/index.ts`                                                | `workOrderEquipmentItemSchema`, `workOrderEquipmentReplaceSchema`, `workOrderEquipmentProposalQuerySchema`; `workOrderCreateSchema.equipment?`.                                                                                                    |
| `apps/api/src/modules/work-orders/work-order-equipment.ts` (new)                      | Pure helpers: `deviceTypeIdsFromItems`, `resolveRequiredEquipmentTypes` (dedup + deterministic order), `loadEquipmentCandidates` (active units + derived calibration status), `validateEquipmentSelection` (V1–V8 blocking, calibration warning).  |
| `apps/api/src/modules/work-orders/work-orders.service.ts`                             | `workOrderInclude` + `equipment`; `create` persists optional `equipment[]` (ON_SITE only, SEND_TO_LAB rejected); `start` gate; new `getEquipmentProposal`, `getEquipmentProposalForPurchaseOrder`, `replaceEquipment`, `confirmEquipment`.         |
| `apps/api/src/modules/work-orders/work-orders.controller.ts`                          | `GET /work-orders/equipment-proposal`, `GET /:id/equipment-proposal`, `PUT /:id/equipment`, `POST /:id/equipment/confirm`. RBAC: `workOrder:read` / `workOrder:update`.                                                                            |
| `apps/api/src/modules/equipment/equipment.service.ts`                                 | `remove()` now blocks (`EQUIPMENT_IN_USE`) when a `WorkOrderEquipment` row references the unit; comment updated.                                                                                                                                   |
| `apps/api/src/modules/work-orders/work-orders.service.test.ts`                        | New `describe("WorkOrdersService reference equipment")` — 13 focused cases + scoped cleanup.                                                                                                                                                       |
| `apps/portal/src/app/management/work-orders/work-orders-ui.tsx`                       | `WorkOrderRow.equipment` + `equipmentConfirmedAt`; proposal/candidate/row types.                                                                                                                                                                   |
| `apps/portal/src/app/management/work-orders/use-work-orders-query.ts`                 | `useWorkOrderEquipmentProposal`, `useReplaceWorkOrderEquipment`, `useConfirmWorkOrderEquipment`.                                                                                                                                                   |
| `apps/portal/src/app/management/work-orders/work-order-equipment-section.tsx` (new)   | "Equipment yang akan dibawa" — ON_SITE-only section: per-requirement unit selector, calibration warnings, save + confirm, confirmed/not-confirmed badge.                                                                                           |
| `apps/portal/src/app/management/work-orders/[id]/page.tsx`                            | Renders `<WorkOrderEquipmentSection>` below the items table.                                                                                                                                                                                       |

### Verification

- `pnpm --filter @medcal/api test -- work-orders.service` → **47 passed** (13 new + 34 existing; existing `start()` tests green — the gate is inert when there are no requirements).
- `pnpm --filter @medcal/api test -- equipment` → **41 passed** (5 files).
- `pnpm typecheck` → `@medcal/api`, `@medcal/portal`, `@medcal/auth`, `@medcal/shared`, `@medcal/db` **pass**. `@medcal/web` fails on 4 pre-existing `@base-ui/react` module-resolution errors — **unrelated** (verified identical with these changes stashed; marketing site, no files touched here).
- `pnpm --filter @medcal/api build` and `pnpm --filter @medcal/portal build` → **pass**.

### Scope confirmations

- **Delivery Note NOT implemented** — no DLN numbering, no `DocumentType` value, no Surat Jalan PDF, no Delivery Note tables, no Surat Jalan UI/lifecycle.
- **WOL behaviour unchanged** — `renderWolPdf` untouched; SEND_TO_LAB work orders get no proposal, reject equipment payloads, and are exempt from the `start()` gate.
- **SPK/WOL numbering unchanged** — `DocumentNumberService`, `DOCUMENT_TYPE_PREFIX`, `DOCUMENT_TYPE_NUMBER_TABLE`, `format-document-number` untouched; a new-numbering test asserts `SPK/` prefix + valid format still hold.
- **DeviceTypeEquipmentRequirement ordering unchanged** — `sortOrder` is only read (via `orderBy`), never written; `reorder()` and the requirements service/UI are untouched.
- Not touched: `DeviceCalibrationParameter`, quotation, requisition, `ServiceMode` semantics, RBAC semantics (reused `workOrder` resource actions).

---

## FOLLOW-UP: Drag-and-Drop Ordering for WorkOrder Equipment (2026-09-01)

### Audit result

- **Current ordering mechanism:** `WorkOrderEquipment.sortOrder` (Int, multiples of 10), written by `replaceEquipment` as `(index+1)*10` in submitted order; `workOrderInclude.equipment` already reads `orderBy: { sortOrder: "asc" }`. The portal section previously rendered _proposal_ rows (requirement order), so the persisted custom order was not visible to the user.
- **Existing persistence endpoint:** `PUT /work-orders/:id/equipment` (`replaceEquipment`) — full-set replace, atomic, re-validates every unit (exists/active/type-match) and **clears `equipmentConfirmedAt`**.
- **New endpoint required: YES.** `PUT /:id/equipment` cannot express "reorder only" — a payload missing an id is interpreted as a _removal_, so it cannot _reject_ a partial/foreign reorder (acceptance criteria + tests E/F/H require rejection). It also re-validates (a unit that went inactive would block a pure reorder) and clears confirmation. The repo's established pattern for this exact problem is a dedicated reorder route with full-set-match validation (`DeviceTypeEquipmentRequirementsService.reorder`, `DeviceCalibrationParametersService`). New route: `PATCH /work-orders/:id/equipment/order`, body `{ equipmentIds: string[] }`.
- **Confirmation interaction:** the only existing `WorkOrderEquipment` mutation (`replaceEquipment`) clears confirmation because the _set_ can change. A reorder provably cannot change the set (`assertSameSet`), so confirmation is **preserved** through a reorder — confirmation attests to _which_ units are carried, not their sequence. Documented + covered by a test. (Not an invented rule: reorder is a distinct operation with no set change; `start()`'s gate is unaffected.)
- **Files changed:**
  - `packages/shared/src/schemas/index.ts` — `workOrderEquipmentOrderSchema`.
  - `apps/api/src/modules/work-orders/work-orders.service.ts` — `reorderEquipment(companyId, id, equipmentIds)`; export `WORK_ORDER_EQUIPMENT_ORDER_STEP` from the helper.
  - `apps/api/src/modules/work-orders/work-orders.controller.ts` — `PATCH :id/equipment/order` (`@RequirePermission("workOrder", "update")`).
  - `apps/api/src/modules/work-orders/work-orders.service.test.ts` — 8 reorder cases.
  - `apps/portal/src/app/management/work-orders/work-order-equipment-ordering.ts` (new) + `.test.ts` (new, 8 cases) — pure `reorderEquipmentIds` / `sameEquipmentOrder`, mirroring `equipment-requirement-ordering.ts`.
  - `apps/portal/src/app/management/work-orders/use-work-orders-query.ts` — `useReorderWorkOrderEquipment` (optimistic cache reorder + rollback + settle-invalidate).
  - `apps/portal/src/app/management/work-orders/work-order-equipment-section.tsx` — " Urutan equipment yang akan dibawa teknisi (Delivery Note)
    " sortable list (`@dnd-kit`, grip-handle activator only, ≥2 rows + `canEdit`), renders `workOrder.equipment` in `sortOrder` order.

### Implementation

- **Schema:** none — `WorkOrderEquipment.sortOrder` already exists. No migration.
- **API:** one additive route `PATCH /work-orders/:id/equipment/order`. Validates WO exists + company scope (`findOne`), `serviceMode === ON_SITE`, non-terminal status, and `assertSameSet(equipmentIds, attached equipmentIds)` (rejects duplicate / missing / foreign / cross-WO → `WORK_ORDER_EQUIPMENT_ORDER_MISMATCH`). Persists `sortOrder = (i+1)*10` for the matched rows in **one `prisma.$transaction`**. Never touches the equipment set, equipment/requirement masters, status, serviceMode, or confirmation.
- **UI:** `@dnd-kit/core` + `/sortable` + `/utilities` (already portal deps, same versions as the equipment-requirements DnD). Dedicated `<GripVertical>` handle is the only drag activator — selects/buttons/links elsewhere are unaffected. Drag scoped to one `SortableContext` per work order. Optimistic reorder of the `[work-orders, id]` cache; on failure the snapshot is restored and an error shown; `onSettled` refetches so the server stays authoritative. Read-only users (no `workOrderUpdate`) see the list without handles.
- **Tests:** API 8 (initial order + `10/20/30`; `[A,B,C]→[C,A,B]` persists exactly; refetch preserves; duplicate rejected; missing rejected; foreign-WO id rejected; cross-company rejected; SEND_TO_LAB rejected; reorder doesn't add/remove and leaves `DeviceTypeEquipmentRequirement` + `Equipment` rows byte-identical; status/serviceMode/`equipmentConfirmedAt` preserved). Portal 8 (pure helper).

### Verification

- API tests: `pnpm --filter @medcal/api test -- work-order equipment` → **102 passed** (7 files; incl. 8 new reorder cases in `work-orders.service.test.ts` at 55 total).
- Portal tests: `pnpm --filter @medcal/portal test -- work-orders` → **25 passed**; `-- work-order-equipment-ordering` → **8 passed**.
- Typecheck: `@medcal/api`, `@medcal/shared`, `@medcal/portal`, `@medcal/db` **pass**. `@medcal/web` unchanged pre-existing `@base-ui/react` failure (unrelated).
- Build: `pnpm --filter @medcal/api build` and `pnpm --filter @medcal/portal build` **pass**.

### Scope protection

Nothing outside WorkOrder-Equipment was changed. No `DocumentNumberService` / `DocumentType` / SPK-WOL numbering / `ServiceMode` / WorkOrder creation rules / status lifecycle / `Equipment` master / `EquipmentType` / `DeviceType` / `DeviceTypeEquipmentRequirement` / Equipment-Requirements ordering / `DeviceCalibrationParameter` / `DeviceTypeCapabilityOrder` / `CalibrationJob` / Calibration Request / Quotation / Purchase Order / RBAC semantics / Delivery Note / PDF changes. No new permission (reused `workOrder:update`). No schema/migration. No refactor of the existing WorkOrder-Equipment code — `replaceEquipment` / `confirmEquipment` / `getEquipmentProposal` are untouched.
