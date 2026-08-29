# Equipment / Calibration Tools — Architecture Audit

**Date:** 2026-08-29
**Author:** afriza.hrp@gmail.com (via Claude Code)
**Source brief:** `docs/claude/plans/device-management/equipment/audit-Architecture for-calibration-equipments-job.md`
**Mode:** AUDIT / ARCHITECTURE DISCOVERY ONLY — no schema, migration, API, UI, or data changes were made.

---

## Status update — 2026-08-29

**Recommendation APPROVED. Option B, Phase 1 only** is proceeding to implementation.

- Implementation brief: `docs/claude/plans/device-management/equipment/prompt1-Equipment Type & Device Type Eq.md`
- Implementation report (to be produced by that task): `docs/claude/plans/device-management/equipment/implementation_report_equipment.md`
- Phase 1 scope confirmed: `EquipmentType` (global master) + `DeviceTypeEquipmentRequirement` join only. No `Equipment` instance, no assignment, no `equipmentId` on `JobReferenceEquipmentUsed`, no inventory, no scheduling.

Open questions resolved by the approved brief (see §13 for the annotated list):

| # | Question | Resolution in prompt1 |
|---|---|---|
| 2 | `EquipmentType` categorisation | **Simple nullable string** `category?` — no enum/taxonomy in Phase 1. |
| 3 | Requirement granularity | **Per `DeviceType`** — confirmed. |
| 4 | Mandatory vs optional | **Not added** — plain requirement relationship only. Stop-and-report if implementation needs it. |
| 5 | Quantity on the join | **Not added.** |
| 7 | Conflict handling | Warning-only, future phase — not in scope now. |
| 8 | Multi-company | `EquipmentType` is **global** (no `companyId`), like `Uom`. |

Still open after Phase 1: #1 (ownership of physical equipment) and #6 (who assigns instances / when) — both belong to Phase 2.

---

## 0. Executive summary

The goal is to let an administrator declare *"which calibration equipment/tools are normally
required to calibrate a given Device Type"*, and later to know *"which physical equipment
instance was brought/used for a job"* for LK traceability.

Findings:

1. **The "equipment used" sink already exists** — `JobReferenceEquipmentUsed` (schema-only,
   no API/UI yet). It is a per-`CalibrationJob` free-text table with exactly the LK columns
   (`equipmentName`, `brand`, `model`, `serialNumber`). Nothing needs to be invented for
   traceability; it only needs to be optionally *linked* to a master later.
2. **No "required equipment" concept exists.** `DeviceType` has no relation to any
   equipment/tool entity. This is the only genuinely missing piece for the immediate
   business requirement.
3. **No Equipment master, no Asset, no Inventory, no Stock, no Item/Product, no
   StandardInstrument model exists.** The business-domain doc *names* a future
   `StandardInstrument` under "D16 — Mini ERP Support", but it was never built.
4. **No Surat Jalan / delivery-note model exists** anywhere in the schema.
5. There is a strong **existing pattern to copy**: `DeviceCalibrationParameter` already
   models `DeviceType → (many) X, where X references a global master` with a unique triplet.
   `DeviceType → RequiredEquipment` fits the same mold.
6. **Ownership of calibration equipment is not represented anywhere** — open business
   question.

**Recommendation (detail in §10):** Option B, phased. **Phase 1 now:** one global
`EquipmentType` master (same convention as `Uom` / `DeviceCapability`) + one join
`DeviceTypeEquipmentRequirement (deviceTypeId, equipmentTypeId, notes?)`. That fully
satisfies the immediate requirement. **Phase 2 later** (only when the Technician App / Surat
Jalan / conflict-coordination work actually starts): add an `Equipment` *instance* model +
a WorkOrder/Job↔Equipment assignment join, and add a nullable `equipmentId` /
`equipmentTypeId` FK onto the already-existing `JobReferenceEquipmentUsed`. Do **not** build
the instance layer, assignment, scheduling, or any inventory concept now.

---

## 1. Existing relevant models

Source: `packages/db/prisma/schema.prisma` (read in full, 2026-08-29).

### 1.1 Device domain (master / taxonomy)

| Model | Represents | Scope | Serial? | Type or Instance | Operationally used? | Overlap with Equipment concept |
|---|---|---|---|---|---|---|
| `DeviceCategory` | Internal grouping of device types | Global (no companyId) | no | type | yes (taxonomy) | none directly; precedent for an `EquipmentCategory` if ever needed |
| `DeviceType` | Kemenkes capability list (~35–59 rows); the calibratable *kind* | Global | no | type | yes — FK target of `Device`, `CalibrationRequestItem`, `DeviceCalibrationParameter` | **This is the anchor** the requirement hangs off (`DeviceType → Required Equipment`) |
| `DeviceModel` | Manufacturer + model under a `DeviceType` | Global | no | type/model | master only; **not** FK'd from `Device` yet | Analogous to a future `EquipmentModel`; shows the project is comfortable leaving a model tier as un-wired master data |
| `DeviceCapability` / `DeviceCapabilityItem` | Device function taxonomy (NIBP → Systolic/Diastolic/MAP) | Global | no | type | yes — FK target of `DeviceCalibrationParameter` | none; but the 2-tier master pattern is a precedent |
| `DeviceCalibrationParameter` | Master definition of *what is measured* during calibration, per `DeviceType` under a `DeviceCapabilityItem` | Global | no | type | master only (no measurement consumer built yet) | **Structural precedent**: `DeviceType → many rows, each pointing at a global master, unique per (deviceTypeId, …, code)`. `DeviceType → RequiredEquipment` is the same shape. |
| `Device` | A **customer-owned** physical unit to be calibrated | `companyId` + `customerId` | `serialNumber String?` | **instance** | yes — `CalibrationJob.deviceId`, `Certificate.deviceId`, quotation/PO items | Conceptual mirror of an equipment *instance*, but opposite ownership (customer's unit-under-test vs PKM's reference tool). Do **not** reuse `Device` for equipment — ownership + role in the workflow are inverted. |

### 1.2 Field / QA domain

| Model | Represents | Notes |
|---|---|---|
| `CalibrationJob` | One calibration of one `Device` within one `WorkOrder` (`@@unique([workOrderId, deviceId])`) | The unit that produces an LK/certificate. Has `results`, `evidences`, `referenceEquipmentUsed`, `signature`, `reviews`, `certificate`. **No application module built yet** (no controller/service/UI). |
| `JobReferenceEquipmentUsed` | **"Daftar Alat yang Digunakan"** — reference/standard equipment actually used for a job | Fields: `calibrationJobId`, `equipmentName` (required), `brand?`, `model?`, `serialNumber?`, timestamps. `onDelete: Cascade`. **Schema-only — no CRUD/API/UI.** Added deliberately ahead of the `CalibrationJob` module (see `docs/claude/plans/Calibration-management/Implement_G3_JobReferenceEquipmentUsed.md`). Free-text; **no FK to any equipment master** (by design, none existed). |
| `MeasurementResult` | JSON payload of readings per job | Not equipment-related. |
| `JobEvidence` | Photo/file attachment + caption | Explicitly *cannot* represent equipment-used (that's why G3 was added). |

### 1.3 Master-data convention (precedent for a new master)

- `Uom` — global (no `companyId`), `code @unique`, `isActive`, admin CRUD. Explicit rationale in schema comment: universal standards don't vary by company.
- `DeviceCategory`, `DeviceCapability`, `DeviceType` — same shape.
- A new `EquipmentType` master should follow this exact convention.

### 1.4 Models that DO NOT exist (searched schema + docs)

`Asset`, `Inventory`, `Stock`, `StockMovement`, `Item`, `Product`, `Warehouse`,
`StandardInstrument`, `MetrologyAsset`, `Equipment`, `EquipmentType`, `Tool`,
`SuratJalan`, `DeliveryNote`, `Shipment`, `ResourceAllocation`, `Reservation`.

- `docs/cursor/business-domain.md` **D16 — Mini ERP Support** lists *planned* objects
  `StandardInstrument`, `StandardInstrumentCalibrationStatus`, `OperationalMaster` and a
  "Metrology standard instruments inventory" sub-domain — **none implemented**. It also
  states the KISS boundary explicitly: *"do not grow into SAP; only support CBMS."*
- `docs/cursor/business-domain.md` line 1036: *"Device Registry ≠ StandardInstrument
  (customer asset vs lab asset)"* — the domain model already anticipates equipment as a
  **separate** concept from `Device`.

---

## 2. Existing relevant relationships

```
DeviceCategory ──< DeviceType ──< DeviceModel
                        │
                        ├──< DeviceCalibrationParameter >── DeviceCapabilityItem >── DeviceCapability
                        │           └── uomId? ─> Uom
                        │
                        ├──< Device (companyId, customerId, serialNumber?)
                        │        └──< CalibrationJob ──< JobReferenceEquipmentUsed   ← "equipment used" (free-text)
                        │                   ├──< MeasurementResult
                        │                   ├──< JobEvidence
                        │                   ├──  CustomerSignature
                        │                   ├──< QualityReview
                        │                   └──  Certificate
                        │
                        └──< CalibrationRequestItem
```

Key existing constraint pattern:
`DeviceCalibrationParameter @@unique([deviceTypeId, capabilityItemId, code])` — a
`DeviceType` fans out to many rows, each anchored to a global master, deduped by a triplet.
The Required-Equipment relation should reuse this exact idea:
`@@unique([deviceTypeId, equipmentTypeId])`.

---

## 3. Existing Work Order architecture

| Model | Fields of interest | Notes |
|---|---|---|
| `WorkOrder` | `companyId`, `quotationId`, `purchaseOrderId`, `customerId`, `number`, **`serviceMode: ServiceMode`**, `addressText`, `geoLat/geoLng`, `locationNotes`, **`scheduledStart DateTime?`**, **`scheduledEnd DateTime?`**, `status: WorkOrderStatus` | Created from a Quotation + PurchaseOrder. Partial unique index (one active WO per PO) is enforced in raw SQL. |
| `ServiceMode` enum | `ON_SITE` \| `SEND_TO_LAB` | This is the **"On Site vs In Lab"** representation. Present on both `CalibrationRequest` and `WorkOrder`. |
| `WorkOrderItem` | `workOrderId`, `purchaseOrderItemId`, `description`, `qty` | 1:1 immutable operational snapshot of each `PurchaseOrderItem`. |
| `WorkOrderAssignment` | `workOrderId`, `technicianUserId`, `roleOnJob: AssignmentRole` (`LEAD` \| `ASSIST`), `@@unique([workOrderId, technicianUserId])` | **The technician-assignment join.** This is the structural template for a future Equipment-assignment join. |
| `CalibrationJob` | `workOrderId`, `deviceId`, `@@unique([workOrderId, deviceId])` | **One WorkOrder → many CalibrationJobs → many devices.** Multiple devices and multiple calibration jobs per WO is already supported. |

Answers to the brief's WO questions:

- **On Site vs In Lab:** `WorkOrder.serviceMode` (`ON_SITE` / `SEND_TO_LAB`).
- **Where technicians are assigned:** `WorkOrderAssignment` (at the WorkOrder level, not
  per job/device).
- **Where WO calibration devices live:** `CalibrationJob` (one per device). `WorkOrderItem`
  is the commercial-line snapshot; `CalibrationJob` is the field-work unit.
- **Multiple devices per WO:** yes. **Multiple calibration jobs per WO:** yes.
- **Surat Jalan:** **not represented at all.** No model, no enum, no field.
- **Surat Jalan line/detail models:** none.
- **Where equipment could attach:** naturally at `WorkOrder` level (mirroring
  `WorkOrderAssignment`) for "assigned/bring", and at `CalibrationJob` level (via the
  existing `JobReferenceEquipmentUsed`) for "actually used".
- **Where the requirement enters the workflow:** the *required* set is derivable the moment
  a `CalibrationJob`'s `Device.deviceTypeId` is known (i.e. at WO planning). For On Site the
  business wants the concrete instances known *before the technician leaves* — that is a
  Phase-2 assignment step at the `WorkOrder`, gated by `scheduledStart`.

`scheduledStart` / `scheduledEnd` **already exist** — they are the only time fields a future
overlap/conflict check would need.

---

## 4. Existing Technician architecture

- **No `Employee` model.** A technician is a `User` (`packages/db` `User`) whose
  `UserMembership.role = TECHNICIAN` (enum `MembershipRole`). `MenuApplication.TECHNICIAN`
  and `PushApp.TECH_PWA` confirm a technician-facing app is planned/partly present.
- **Assignment to work:** `WorkOrderAssignment (workOrderId, technicianUserId, roleOnJob)`.
  `roleOnJob ∈ {LEAD, ASSIST}`. Unique per `(workOrderId, technicianUserId)`.
- **Resource-allocation concept:** none beyond `WorkOrderAssignment`. No calendar, no
  availability model, no capacity/skills model.
- **Push targeting:** `FCMToken (userId, companyId, app)` + `UserMembership.receiveNotifications`.

Conclusion: a future `Equipment ↔ WorkOrder` assignment join would sit *beside*
`WorkOrderAssignment` with an identical shape and coexist cleanly. No conflict.

---

## 5. Existing Surat Jalan architecture

**None.** There is no `SuratJalan`, `DeliveryNote`, `Shipment`, or equivalent model, enum,
or field anywhere in the schema. The `ServiceMode.SEND_TO_LAB` path implies goods movement
but nothing records it today.

Implication: "Surat Jalan lists the equipment the technician brings" is a **separate future
track**. The Equipment audit should not attempt to design Surat Jalan. The only forward
-compatibility requirement is: whatever "assigned equipment for this WorkOrder" model is
eventually built must be queryable by `workOrderId` so a future Surat Jalan can read it.

---

## 6. Existing Inventory / Asset-related architecture

**None implemented.**

- No `Asset`, `Inventory`, `Stock`, `StockMovement`, `Warehouse`, `Item`, `Product`,
  `PurchaseRequisition`, `GoodsReceipt`, valuation, or ledger models.
- `PurchaseOrder` / `PurchaseOrderItem` exist but are **customer purchase orders for
  calibration services** (they reference `ServiceTariff` and customer `Device`s), not
  procurement of lab equipment.
- `ServiceTariff` is the only "Mini ERP" object built — pricing master, not assets.
- The business-domain doc's "D16 — Mini ERP Support / Metrology standard instruments
  inventory" is a **concept only**, with an explicit KISS warning against ERP scope creep.

Implication: the Equipment concept currently has **a clean field** — it can be designed
without touching or anticipating any inventory machinery.

---

## 7. Equipment-related concepts already present

| Concept | Present? | Where | Form |
|---|---|---|---|
| Equipment **required** by a DeviceType | ❌ | — | missing |
| Equipment **type/catalog** master | ❌ | — | missing (only *named* as future `StandardInstrument`) |
| Equipment **instance** (brand/model/serial) | ⚠️ partial | `JobReferenceEquipmentUsed` | free-text only, per-job, no identity, no master |
| Equipment **assigned** to a WorkOrder/technician | ❌ | — | missing (`WorkOrderAssignment` assigns *people* only) |
| Equipment **actually used** on a job | ✅ | `JobReferenceEquipmentUsed` | schema-only, free-text, LK-shaped |
| Calibration status **of the reference equipment itself** | ❌ | — | missing (future `StandardInstrumentCalibrationStatus` concept) |
| Ownership of equipment | ❌ | — | not represented → open question (§13) |

So exactly **one** of the three traceability concepts (§8) has any representation, and it is
the *last* one in the chain.

---

## 8. Required vs Assigned vs Actually-Used — analysis

These are three distinct concepts. Mapping to the current schema:

| Concept | Meaning | Grain | Exists today? | Natural home |
|---|---|---|---|---|
| **Required** | "A Bed Side Monitor calibration normally needs a Vital Signs Simulator, an Electrical Safety Analyzer, a Thermohygrometer." | `DeviceType` × `EquipmentType` | ❌ | `DeviceType ──< DeviceTypeEquipmentRequirement >── EquipmentType` |
| **Assigned** | "For WO-001, we will bring Electrical Safety Analyzer #01." | `WorkOrder` (or `CalibrationJob`) × `Equipment` instance | ❌ | `WorkOrder ──< WorkOrderEquipment >── Equipment` (mirrors `WorkOrderAssignment`) |
| **Actually used** | LK: "Nama Alat / Merk / Type-Model / No. Seri" | `CalibrationJob` × equipment (instance or free-text) | ✅ `JobReferenceEquipmentUsed` (free-text, schema-only) | keep it; add nullable `equipmentId` FK in Phase 2 |

Notes:

- **Required is derived, not stored per job.** Given a `CalibrationJob`, its required set =
  `requirements WHERE deviceTypeId = job.device.deviceTypeId`. No per-job copy needed for
  MVP (unlike `WorkOrderItem`, which snapshots because price is involved; equipment
  requirements carry no commercial state).
- **Assigned and Used can differ** (planned Thermohygrometer #01, but #02 was actually
  taken). The LK must reflect *used*, so `JobReferenceEquipmentUsed` stays the source of
  truth for the certificate regardless of what "assigned" says.
- **Used may legitimately have no master row** (borrowed/one-off instrument). Hence the FK
  added in Phase 2 must be **nullable**, with the free-text fields retained as fallback —
  same principle as `Device.brand/model/serialNumber` being free-text with `DeviceModel`
  un-wired.

---

## 9. Architecture options

Only options that fit the existing MEDCAL conventions are listed.

### Option A — `EquipmentType` master + `DeviceType` requirement join (types only)

```
EquipmentType            (global master, like Uom: id, code @unique, name, category?, isActive)
DeviceTypeEquipmentRequirement (deviceTypeId → DeviceType, equipmentTypeId → EquipmentType,
                                notes?, @@unique([deviceTypeId, equipmentTypeId]))
JobReferenceEquipmentUsed      unchanged (free-text)
```

| Dimension | Assessment |
|---|---|
| Model complexity | Lowest — 1 master + 1 join |
| Relationship complexity | 1 many-to-many, identical to `DeviceCalibrationParameter`'s pattern |
| Advantages | Delivers the *exact* stated requirement ("define required equipment per DeviceType", "derive it for a job"). Zero inventory surface. Trivial admin UI (reuse the DeviceCalibrationParameter grouped-table pattern). |
| Disadvantages | No instance identity → cannot answer "which physical unit" or detect "#01 needed by WO-001 and WO-002". LK linkage stays free-text forever unless extended. |
| Impact on current architecture | Purely additive. No change to WO/Job/Device. |
| Technician App | Supports "show the tool list for this job" — enough for a checklist. |
| LK traceability | Indirect only (technician still hand-types serials into `JobReferenceEquipmentUsed`). |
| Equipment conflicts | **Not supported.** |
| Accidentally an inventory system? | No. |

### Option B — `EquipmentType` + `Equipment` instance + requirement join, instance layer deferred (RECOMMENDED)

```
Phase 1 (now):
  EquipmentType                       (global master)
  DeviceTypeEquipmentRequirement      (deviceTypeId, equipmentTypeId, notes?)

Phase 2 (only when Technician App / Surat Jalan / coordination work starts):
  Equipment                           (instance: id, companyId, equipmentTypeId,
                                       brand?, model?, serialNumber?, assetTag?, status)
  WorkOrderEquipment                  (workOrderId, equipmentId, note?,
                                       @@unique([workOrderId, equipmentId]))  ← "assigned / to bring"
  JobReferenceEquipmentUsed.equipmentId String?   ← nullable link; free-text fields kept
```

| Dimension | Assessment |
|---|---|
| Model complexity | Moderate, and **paid for incrementally** — Phase 1 is identical to Option A. |
| Relationship complexity | Phase 2 adds two joins, each mirroring an existing pattern (`WorkOrderAssignment`, `DeviceCalibrationParameter`). |
| Advantages | Phase 1 ships the requirement immediately. Phase 2 unlocks instance identity, "bring list" per WO, and conflict *visibility* — without ever committing to scheduling. `JobReferenceEquipmentUsed` gets structured when there's a catalog to point at. |
| Disadvantages | Two-phase discipline required (don't let Phase 2 pull in stock/quantity). `Equipment.status` must stay a simple enum, not a state machine. |
| Impact on current architecture | Phase 1 additive-only. Phase 2 adds one nullable column to an existing schema-only table + 2 new join tables; no behavioural change to existing modules. |
| Technician App | Full support: required list (derived), assigned instances (per WO), used instances (per job) — the exact 3-layer model the app needs. |
| LK traceability | Strong: `JobReferenceEquipmentUsed.equipmentId` → `Equipment` → serial/brand/model auto-filled; free-text remains for exceptions. |
| Equipment conflicts | **Detectable** (not auto-resolved): `Equipment #01` + `WorkOrderEquipment` rows + `WorkOrder.scheduledStart/End` overlap = flag. No new time fields needed. |
| Accidentally an inventory system? | **No**, as long as Phase 2 adds *no* quantity/location/movement/valuation fields. `Equipment` is an asset register row, not a stock item. |

### Option C — Full `EquipmentRequirement` + `EquipmentType` + `Equipment` + `EquipmentAssignment` with lifecycle, all now

| Dimension | Assessment |
|---|---|
| Model complexity | High — 4+ models up front, assignment lifecycle (reserved/issued/returned) enums. |
| Advantages | Everything available immediately. |
| Disadvantages | Builds the instance + assignment layer before any consumer exists (`CalibrationJob` has no module; Technician App equipment screen isn't scoped; Surat Jalan doesn't exist). Issue/return lifecycle **is** the start of an inventory system — violates brief §11. High risk of rework once the Technician App defines real needs. |
| Impact | Large additive surface; assignment lifecycle touches WO status thinking. |
| Verdict | Over-engineered for "≈3 technicians, define a tool list per device type". |

---

## 10. Recommendation

**Adopt Option B, and implement Phase 1 only at this stage.**

### Phase 1 (satisfies the current business ask in full)

1. **`EquipmentType`** — global master, exact `Uom` convention:
   `id`, `code @unique`, `name`, `description?`, `category?` (plain string or a small enum
   later), `isActive`, `createdAt`, `updatedAt`. Admin CRUD.
2. **`DeviceTypeEquipmentRequirement`** — join:
   `id`, `deviceTypeId → DeviceType`, `equipmentTypeId → EquipmentType`, `notes?`,
   `createdAt`, `updatedAt`, `@@unique([deviceTypeId, equipmentTypeId])`,
   `@@index([deviceTypeId])`, `@@index([equipmentTypeId])`.
3. Admin UI: reuse the **expandable-table-grouped-by-DeviceType** pattern just built for
   `DeviceCalibrationParameter` (`device-calibration-parameters-page-client.tsx`).
4. `JobReferenceEquipmentUsed` — **left exactly as-is** (still free-text, still schema-only).

This delivers: *define required equipment per DeviceType* ✅ and *derive the required list
for a calibration job* ✅ (`requirements WHERE deviceTypeId = job.device.deviceTypeId`).

### Phase 2 (defer until a real consumer exists — Technician App equipment screen, or Surat Jalan, or conflict-coordination request)

5. `Equipment` instance model (`companyId`, `equipmentTypeId`, `brand?`, `model?`,
   `serialNumber?`, `assetTag?`, `status` enum `ACTIVE|INACTIVE|OUT_OF_SERVICE`).
6. `WorkOrderEquipment` join (mirrors `WorkOrderAssignment`) — the "bring list".
7. Add nullable `equipmentId String?` to `JobReferenceEquipmentUsed` (keep free-text
   fallback).
8. Conflict *visibility* query only: same `equipmentId` across `WorkOrderEquipment` where
   the parent `WorkOrder.scheduledStart/scheduledEnd` overlap → surface a warning. No
   blocking, no auto-allocation.

### Why this respects "keep it simple now, don't paint into a corner"

- Phase 1 is 2 tables and reuses an existing UI pattern.
- Nothing in Phase 1 forecloses Phase 2: adding an instance model later doesn't change the
  requirement join; adding `equipmentId` to `JobReferenceEquipmentUsed` is a nullable
  column on a table that has **no data and no consumers** today.
- The chain the business wants —
  `DeviceType → Required Equipment → Work Order → Actual Equipment Used → LK` — is fully
  expressible once Phase 2 lands, and half-expressible (everything except instance identity)
  after Phase 1.
- No inventory primitive (quantity, location, movement, valuation) appears in either phase.

---

## 11. Proposed minimal model(s) — conceptual only (NOT implemented)

```
// ---- Phase 1 ----
model EquipmentType {
  id          String  @id @default(cuid())
  code        String  @unique
  name        String
  description String?
  category    String?          // free-text for now; enum later if it stabilises
  isActive    Boolean @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  requirements DeviceTypeEquipmentRequirement[]
}

model DeviceTypeEquipmentRequirement {
  id             String @id @default(cuid())
  deviceTypeId   String
  equipmentTypeId String
  notes          String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  deviceType     DeviceType    @relation(fields: [deviceTypeId], references: [id])
  equipmentType  EquipmentType @relation(fields: [equipmentTypeId], references: [id])
  @@unique([deviceTypeId, equipmentTypeId])
  @@index([deviceTypeId])
  @@index([equipmentTypeId])
}

// ---- Phase 2 (later) ----
model Equipment {
  id             String @id @default(cuid())
  companyId      String
  equipmentTypeId String
  brand          String?
  model          String?
  serialNumber   String?
  assetTag       String?
  status         EquipmentStatus @default(ACTIVE)   // ACTIVE | INACTIVE | OUT_OF_SERVICE
  // ... relations
}

model WorkOrderEquipment {          // "assigned / to bring" — mirrors WorkOrderAssignment
  id          String @id @default(cuid())
  workOrderId String
  equipmentId String
  note        String?
  @@unique([workOrderId, equipmentId])
}

// JobReferenceEquipmentUsed gains:  equipmentId String?   (nullable; free-text fields kept)
```

---

## 12. Future extension points (mention only — do NOT build)

- `EquipmentModel` master tier (brand+model catalog), same as `DeviceModel` today.
- `StandardInstrumentCalibrationStatus` — tracking calibration/traceability *of the
  reference equipment itself* (due dates, cert numbers). Named in business-domain D16.
- `EquipmentAssignment` lifecycle (reserved → issued → returned) — only if a real
  issue/return process emerges.
- Surat Jalan module reading `WorkOrderEquipment` for the packing list.
- Availability/conflict *resolution* engine (calendar, auto-allocation) — explicitly future.
- Light procurement / stock of consumables — business-domain calls this "optional later".
- Equipment ↔ `EquipmentType.category` ↔ `DeviceCategory` cross-referencing for smart
  suggestions.

---

## 13. Open business questions

> **Status (2026-08-29):** the approved Phase 1 brief (`prompt1-Equipment Type & Device Type Eq.md`)
> resolves #2, #3, #4, #5, #7, #8 (see "Status update" near the top). #1 and #6 remain open and
> are deferred to Phase 2.

1. **Ownership.** *(OPEN — Phase 2)* Is calibration/reference equipment always PKM-owned? Can it ever be
   customer-owned, rented, or borrowed? Nothing in the schema or data represents this. If
   customer-owned equipment is possible, `Equipment` (Phase 2) needs an ownership
   discriminator; if not, `companyId` alone suffices.
2. **`EquipmentType` categorisation.** *(RESOLVED — nullable string `category?`, no enum in Phase 1)* Is there a controlled vocabulary for equipment kinds
   (Electrical Safety Analyzer, Simulator, Thermohygrometer, …), or is it open-ended? Drives
   whether `category` is a string or an enum.
3. **Requirement granularity.** *(RESOLVED — per `DeviceType`)* Is "required equipment" truly per `DeviceType`, or could it
   vary by `DeviceModel` / capability / service mode (On Site vs In Lab)? The brief says
   DeviceType; confirm before Phase 1.
4. **Mandatory vs optional requirements.** *(RESOLVED — not added in Phase 1)* Should a requirement row carry
   `isMandatory` / `isOptional`, or is the whole list "normally needed"? (Cheap to add to
   the join later; flag now.)
5. **Quantity.** *(RESOLVED — no `qty` in Phase 1)* Can one job need 2× of the same `EquipmentType`? If yes and it matters,
   the join needs a `qty` — but that edges toward inventory; confirm it's a real need.
6. **Who assigns instances, and when.** *(OPEN — Phase 2)* For On Site, the brief says equipment must be known
   before the technician leaves. Is that a dispatcher action at WO scheduling? Defines the
   Phase-2 `WorkOrderEquipment` workflow trigger.
7. **Conflict handling threshold.** *(RESOLVED — warning-only, Phase 2, not in scope now)* The brief says "indicate coordination is required, don't
   hard-block". Confirm: warning only, on overlapping `scheduledStart/End`, no enforcement.
8. **Multi-company.** *(RESOLVED — `EquipmentType` is global, no `companyId`)* `EquipmentType` proposed as global (no `companyId`) like `Uom`.
   Confirm equipment kinds don't vary by company. (`Equipment` instances *are* company
   -scoped.)

---

## 14. Explicitly NOT to be implemented yet

- Any Prisma model, migration, API, or UI (this task is audit-only).
- `Equipment` **instance** model, `WorkOrderEquipment`, or any assignment join (Phase 2 —
  wait for a real consumer).
- Adding `equipmentId` / `equipmentTypeId` to `JobReferenceEquipmentUsed` (Phase 2).
- Equipment **scheduling / resource-planning / availability engine**.
- Conflict **detection or resolution** logic (only the data shape that *would* allow it).
- Any **inventory** primitive: stock quantity, warehouse, stock movement/ledger,
  issue/return workflow, purchasing/procurement, valuation, depreciation.
- **Maintenance management** or **calibration tracking of the reference equipment itself**.
- **Surat Jalan** model or line/detail models.
- Changes to `WorkOrder`, `WorkOrderAssignment`, `CalibrationJob`, `Device`, `DeviceType`,
  or `DeviceCalibrationParameter`.
- Seeding equipment data (transactional / master data to be entered by admin, per the
  project's "no fabricated data" policy for operational tables).

---

## 15. One-paragraph recommendation

MEDCAL already has the "equipment actually used" table (`JobReferenceEquipmentUsed`,
schema-only, LK-shaped) and a proven `DeviceType → global-master` relationship pattern
(`DeviceCalibrationParameter`). It has **no** required-equipment concept and **no**
inventory/asset machinery, and the domain docs already treat lab equipment as separate from
customer `Device`s. Adopt **Option B phased**: build only **Phase 1 now** — a global
`EquipmentType` master plus a `DeviceTypeEquipmentRequirement` join (unique per
`deviceTypeId + equipmentTypeId`), with an admin screen reusing the new
DeviceCalibrationParameter grouped-table UI. That fully delivers "define the tool list per
device type" and "derive it for a job", adds two additive tables, touches nothing else, and
leaves a clean path to **Phase 2** (an `Equipment` instance model, a `WorkOrderEquipment`
"bring list" mirroring `WorkOrderAssignment`, a nullable `equipmentId` on
`JobReferenceEquipmentUsed`, and conflict *visibility* via the already-existing
`WorkOrder.scheduledStart/scheduledEnd`) whenever the Technician App or Surat Jalan work
actually creates a consumer for it.
