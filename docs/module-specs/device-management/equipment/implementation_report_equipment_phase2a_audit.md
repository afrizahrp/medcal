# Phase 2A Architecture Audit — Physical Reference Equipment & Calibration Validity

**Date:** 2026-08-29
**Author:** afriza.hrp@gmail.com (via Claude Code)
**Source brief:** `docs/claude/plans/device-management/equipment/prompt2a-...` (pasted task)
**Prior work:** `implementation_report_equipment_audit.md` (Phase 1 audit),
`implementation_report_equipment.md` (Phase 1 implementation — EquipmentType +
DeviceTypeEquipmentRequirement, delivered 2026-08-29).
**Mode:** AUDIT / ARCHITECTURE DISCOVERY ONLY.

> ### 24. Explicit confirmation — nothing was modified
> No Prisma schema, migration, database row, API, service, controller, DTO/Zod schema,
> RBAC catalog, seed script, or UI file was changed by this task. `JobReferenceEquipmentUsed`,
> `CalibrationJob`, `WorkOrder`, `WorkOrderAssignment` are untouched. No `Equipment` model,
> no `EquipmentCalibrationRecord`, no `WorkOrderEquipment`, no Surat Jalan, no migration was
> created. This document is the only artifact produced.
>
> (One unrelated pre-existing local edit exists in `packages/db/prisma/seed-menu.ts` — the
> Phase 1 Equipment menu leaves were reorganised under an "Equipment" sub-group by the user.
> Not part of this audit; left as-is.)

---

## 1. Executive summary

**The physical-equipment layer does not exist.** Phase 1 stopped at `EquipmentType`
(the catalog/type) and `DeviceTypeEquipmentRequirement` (DeviceType → required EquipmentType).
There is no model representing an individual physical unit (a specific Fluke ESA620, serial
ESA-001).

**Everything downstream of the physical layer is schema-only.** `CalibrationJob`,
`JobReferenceEquipmentUsed`, `MeasurementResult`, `JobEvidence`, `QualityReview`,
`CustomerSignature`, `Certificate`, `FileObject` were all created in the initial MVP
migration (`20260813063336`) and the G3 migration (`20260826200000`), but **none of them
has any API, service, controller, or UI**. There is no LK / certificate generation anywhere
in the codebase. This means Phase 2A has a completely clean field downstream — and also that
it cannot lean on any existing job/certificate behaviour, because there is none.

**`JobReferenceEquipmentUsed` is already the right shape for "Actually Used Equipment"** —
free-text `equipmentName` / `brand` / `model` / `serialNumber` per `CalibrationJob`, matching
the LK "Daftar Alat yang Digunakan" columns exactly. It should gain a **nullable** FK to a
future `Equipment` record (not in 2A), and its free-text columns should be kept **permanently**
as an immutable historical snapshot.

**Calibration validity should not be a single date on `Equipment`.** A one-field
`calibrationDueDate` cannot answer "was it valid *on the job date*" after the certificate is
renewed, cannot point to the certificate document, and cannot represent the calibration
history KAN-style traceability needs. The right shape is `Equipment → EquipmentCalibrationRecord[]`,
with *current* validity **derived** from the records, never stored redundantly.

**Recommended: Option B, split across 2A and 2B.**
- **Phase 2A** — `Equipment` physical master only: `EquipmentType → Equipment`, internal
  `code` (unique), optional `serialNumber`, `isActive`. **No validity field of any kind**
  (deliberately — so no one is tempted to add `calibrationDueDate` as a stopgap).
- **Phase 2B** — `EquipmentCalibrationRecord` (calibration date, valid-until, cert number,
  provider, result, document via the existing `FileObject` polymorphic pattern), the
  validity rule, and the nullable `JobReferenceEquipmentUsed.equipmentId` link.
- **Later** — `WorkOrderEquipment` (assignment / "to bring"), conflict detection, Technician
  App, Surat Jalan, parameter-level suitability.

**Open business questions that must not be silently resolved:** equipment identity
(serial uniqueness / do all units have serials), ownership (PKM vs customer vs loaned),
which date is the authoritative "calibration job date" for the validity rule, whether the
validity rule is a warning or a block, and whether parameter-level equipment suitability is
ever required.

---

## 2. Existing relevant schema / models

Source: `packages/db/prisma/schema.prisma` (read in full), plus
`packages/db/prisma/migrations/*`.

### 2.1 Equipment layer (Phase 1 — exists, has API + UI)

| Model | Fields | Grain | Notes |
|---|---|---|---|
| `EquipmentType` | `id`, `code @unique`, `name`, `description?`, `category?` (nullable free-text), `isActive`, timestamps | **type** | Global master (no `companyId`), same convention as `Uom` / `DeviceCapability`. Back-relation `deviceRequirements`. **No instance fields** — deliberately (Phase 1 audit §11). |
| `DeviceTypeEquipmentRequirement` | `id`, `deviceTypeId`, `equipmentTypeId`, `notes?`, timestamps; `@@unique([deviceTypeId, equipmentTypeId])`; `@@index` on both FKs | **DeviceType × EquipmentType** | "Required Equipment". FKs `ON DELETE RESTRICT`. No quantity / mandatory flag / priority / lifecycle. |

### 2.2 Field & QA layer (schema-only — NO application code anywhere)

| Model | Key fields | Relations | Application code? |
|---|---|---|---|
| `CalibrationJob` | `id`, `companyId`, `workOrderId` (FK, cascade), `purchaseOrderItemId?`, `deviceId` (FK), `status` (`CalibrationJobStatus`), `startedAt?`, `submittedAt?`, timestamps; `@@unique([workOrderId, deviceId])` | `results MeasurementResult[]`, `evidences JobEvidence[]`, `referenceEquipmentUsed JobReferenceEquipmentUsed[]`, `signature CustomerSignature?`, `reviews QualityReview[]`, `certificate Certificate?` | **None.** Only referenced by `work-orders.service.test.ts` (asserting the WO flow does *not* create jobs yet). |
| `JobReferenceEquipmentUsed` | `id`, `calibrationJobId` (FK, cascade), `equipmentName` (**required**), `brand?`, `model?`, `serialNumber?`, timestamps; `@@index([calibrationJobId])` | `calibrationJob CalibrationJob` | **None.** See §3. |
| `MeasurementResult` | `id`, `companyId`, `calibrationJobId`, `payloadJson Json`, `summaryJson Json?`, `recordedAt` | `calibrationJob` | None. |
| `JobEvidence` | `id`, `companyId`, `calibrationJobId`, `fileObjectId`, `caption?` | `calibrationJob`, `fileObject FileObject` | None. Photo/file attachment — cannot represent equipment-used (that's why G3 added `JobReferenceEquipmentUsed`). |
| `QualityReview` | `id`, `companyId`, `calibrationJobId`, `reviewerUserId`, `decision?`, `status`, `notes?`, `reviewedAt?` | `calibrationJob`, `reviewer User`, `certificates Certificate[]` | None. A per-job review-history child — pattern precedent for "records under a parent". |
| `CustomerSignature` | `id`, `calibrationJobId @unique`, `fileObjectId?`, `signerName?`, `signedAt` | `calibrationJob`, `fileObject?` | None. |

`CalibrationJobStatus` enum: `PENDING | IN_PROGRESS | SUBMITTED | REWORK | ACCEPTED_BY_QA`.

### 2.3 Certificate layer (schema-only — NO application code)

`Certificate`: `id`, `companyId`, `customerId`, `deviceId`, `calibrationJobId @unique`,
`qualityReviewId?`, `number`, `verificationToken? @unique`, `status` (`CertificateStatus`:
`DRAFT|ISSUED|REVOKED|SUPERSEDED`), `billingStatus`, `issuedAt?`, **`validUntil?`**,
`supersedesCertificateId?` (self-relation `supersedes` / `supersededBy`),
`pdfFileObjectId?` → `FileObject`. `@@unique([companyId, number])`.

**This is a strong pattern precedent** for the equipment-calibration-record design: a
document-backed record with a validity date, an issued/revoked/superseded status, and a
supersession chain. No certificate/LK generation code exists — it is purely a data shape.

### 2.4 WorkOrder layer (HAS application code — service, controller, tests, PDF)

| Model | Key fields | Notes |
|---|---|---|
| `WorkOrder` | `id`, `companyId`, `quotationId`, `purchaseOrderId`, `customerId`, `number`, `serviceMode` (`ON_SITE\|SEND_TO_LAB`), `addressText?`, `geoLat?/geoLng?`, `locationNotes?`, **`scheduledStart DateTime?`**, **`scheduledEnd DateTime?`**, `status` (`WorkOrderStatus`) | `scheduledStart/End` are wired through the API (`work-orders.service.ts:211-212, 332-333`). Partial unique index (one active WO per PO) enforced in raw SQL. |
| `WorkOrderItem` | `workOrderId`, `purchaseOrderItemId`, `description`, `qty`; `@@unique([workOrderId, purchaseOrderItemId])` | 1:1 immutable **snapshot** of a `PurchaseOrderItem`. Pattern precedent for snapshotting. |
| `WorkOrderAssignment` | `id`, `companyId`, `workOrderId`, `technicianUserId`, `roleOnJob` (`AssignmentRole`: `LEAD\|ASSIST`), `createdAt`; `@@unique([workOrderId, technicianUserId])`; `@@index([technicianUserId])` | **The reusable join-table precedent** for a future `WorkOrderEquipment`. |

One `WorkOrder` → many `CalibrationJob` (one per `deviceId`, `@@unique([workOrderId, deviceId])`).

### 2.5 Device layer — the closest existing "instance with a serial" precedent

`Device`: `id`, `companyId`, `customerId`, `deviceTypeId` (FK), `brand?`, `model?`,
`serialNumber?`, `category?` (free-text snapshot), `locationText?` (free-text),
`status` (`DeviceStatus`: `ACTIVE|INACTIVE`), timestamps. `@@index([companyId, serialNumber])`
— **indexed but NOT unique**; `serialNumber` is **nullable**.

`DeviceModel`: `id`, `deviceTypeId`, `manufacturer`, `model`, `description?`;
`@@unique([deviceTypeId, manufacturer, model])`. A brand+model master **not FK'd** from
`Device` (`Device.brand`/`model` stay free-text). Precedent for a future `EquipmentModel`
tier being optional / un-wired.

### 2.6 Document / attachment layer

`FileObject`: `id`, `companyId`, `customerId?`, `ownerType` (`FileOwnerType` enum),
`ownerId` (String — **polymorphic by convention, not a real FK**), `storageKey`,
`mimeType?`, `sizeBytes?`, `originalName?`, `createdAt`. `@@index([companyId, ownerType, ownerId])`.
Typed back-relations: `jobEvidences`, `signatures`, `certificatePdfs`.

`FileOwnerType` enum: `CERTIFICATE | JOB_EVIDENCE | SIGNATURE | REQUEST_ATTACHMENT |
INVOICE | CREDIT_NOTE | OTHER`. **No equipment-related value.**

**No application code touches `FileObject`** (grep across `apps/` returns nothing) — upload
infrastructure itself is unbuilt.

### 2.7 Models that DO NOT exist (confirmed by schema + migration + code search)

`Equipment`, `EquipmentInstance`, `EquipmentUnit`, `EquipmentModel`,
`EquipmentCalibrationRecord`, `CalibrationCertificate` (for reference equipment),
`WorkOrderEquipment`, `EquipmentAssignment`, `SuratJalan` / `DeliveryNote` / `Shipment`,
`Asset`, `Inventory`, `Stock`, `StockMovement`, `Warehouse`, `StandardInstrument`,
`Location`, `Laboratory`, generic `AuditLog` / `ChangeHistory`, `Employee`.

### 2.8 Reusable patterns

| Pattern | Where | Reuse for Phase 2A/2B |
|---|---|---|
| Global master (`code @unique`, `isActive`, admin CRUD) | `Uom`, `DeviceCapability`, `DeviceCategory`, `EquipmentType` | `Equipment` is company-scoped, but the CRUD module shape (service/controller/Zod/`@RequirePermission`/`CompanyRoleGuard`) is identical |
| Company-scoped instance with nullable serial | `Device` | `Equipment` identity + status |
| Join table `@@unique([parent, child])` + role/notes | `WorkOrderAssignment`, `DeviceTypeEquipmentRequirement` | future `WorkOrderEquipment` |
| 1:1 immutable snapshot of a source row | `WorkOrderItem` | not needed — required list stays derived |
| Free-text snapshot **alongside** an optional master FK | `Device.brand/model` ↔ `DeviceModel`; `CalibrationRequestItem.deviceId` (free-text, "not a FK to Device") | `JobReferenceEquipmentUsed` free-text ↔ future `Equipment` FK |
| Document-backed record with validity + status + supersession | `Certificate` (`validUntil`, `status`, `supersedes`) | `EquipmentCalibrationRecord` (Phase 2B) |
| Polymorphic attachment (`ownerType` + `ownerId`) | `FileObject` / `FileOwnerType` | equipment calibration certificate docs (Phase 2B) — add an enum value |
| Per-parent history/review children | `QualityReview`, `MeasurementResult` under `CalibrationJob` | `EquipmentCalibrationRecord` under `Equipment` |

### 2.9 Naming-conflict / duplication check

- **`Equipment`** — no model, enum, or Prisma type currently uses this name. Safe.
- **`EquipmentCalibrationRecord`** — free.
- **`Certificate`** already exists (customer device certificate). A reference-equipment
  calibration certificate is a **different concept** — do **not** reuse `Certificate`;
  name the new one `EquipmentCalibrationRecord` (or `EquipmentCalibration`) to avoid
  semantic collision.
- **`serialNumber`** appears on `Device`, `JobReferenceEquipmentUsed`. Adding it to
  `Equipment` is consistent, not a conflict.
- **`code`** — `EquipmentType.code` is global-unique; an `Equipment.code` would be a
  *separate* column with its own (company-scoped) uniqueness. Distinct, but document the
  distinction in the schema comment to avoid confusion.
- The Phase 1 UI route group is `Equipment ▸ Types / Requirements`. Adding a physical
  `Equipment ▸ Units` (or `Equipment ▸ Inventory`) leaf fits the existing nav sub-group
  the user just created in `seed-menu.ts`.

---

## 3. Existing `JobReferenceEquipmentUsed` analysis

### 3.1 Current fact

| Aspect | Finding |
|---|---|
| Exact schema | `id` (cuid), `calibrationJobId` (String, FK), `equipmentName` (String, **NOT NULL**), `brand` (String?), `model` (String?), `serialNumber` (String?), `createdAt`, `updatedAt` |
| Migration | `20260826200000_add_job_reference_equipment_used` — pure `CREATE TABLE` + one index + one FK |
| Relations | `calibrationJob CalibrationJob @relation(..., onDelete: Cascade)` — deleting a job deletes its equipment-used rows |
| Constraints | PK on `id`; `@@index([calibrationJobId])`. **No unique constraint**, **no FK to any equipment master** (none existed when G3 was written) |
| Used by API? | **No** — no service, controller, or DTO references it |
| Used by UI? | **No** |
| In certificate / LK generation? | **No** — no certificate/LK generation exists in the codebase at all |
| Intended as? | Historical / snapshot data, populated per real calibration job (G3 brief: "transactional table … same 'no fabricated data' policy as `Device` and `MeasurementResult`") — 1–7 rows per LK document |

### 3.2 Should `JobReferenceEquipmentUsed → Equipment` be a foreign key? — **RECOMMENDATION: YES, nullable, in Phase 2B (not 2A)**

**Why yes:**
1. **KAN traceability Q5** ("trace the equipment used in this certificate back to its
   calibration evidence") is *only* answerable if the LK row points at the physical unit,
   which in turn points at its `EquipmentCalibrationRecord`s. Free-text `serialNumber`
   cannot be reliably joined (typos, formatting, re-used serials).
2. It lets the Technician App / job-completion UI offer a **pick-list** of PKM's actual
   equipment instead of re-typing brand/model/serial every job (fewer errors, and the
   validity check in §8 becomes possible).
3. It is the join point for "was this unit valid on the job date" (§8).

**Why nullable:**
- Borrowed / one-off / third-party equipment may have no `Equipment` row.
- Historical jobs recorded before Phase 2B will have no link.
- An `Equipment` row could be deleted/retired later; the FK must tolerate `SET NULL` or
  simply not be required.

### 3.3 Should the free-text `equipmentName` / `brand` / `model` / `serialNumber` be kept after linking? — **RECOMMENDATION: YES, permanently, as an immutable snapshot**

Same principle the schema already applies to `Device.brand`/`model` (kept free-text
alongside `DeviceModel`) and `CalibrationRequestItem.deviceId` (deliberately "not a FK").
Reasons:
- The **LK is a legal/printed record** — it must reproduce exactly the values shown at
  issue time, even if the `Equipment` record is later edited (serial correction, model
  re-classification) or deleted (retired unit).
- Auditors compare the printed LK against the system; the snapshot is the source of truth
  for "what the document said", the FK is the pointer to "which unit that was".
- Populate the snapshot from the `Equipment` record at job-completion time when the FK is
  set; allow manual entry when it is not.

**Do not implement any of this now.** `JobReferenceEquipmentUsed` stays byte-for-byte as-is
through Phase 2A.

---

## 4. Existing WorkOrder / CalibrationJob architecture (for the future equipment grain)

- **`WorkOrder`** has the application layer (service/controller/tests/PDF) and carries the
  **schedule** (`scheduledStart` / `scheduledEnd`, nullable, API-wired) and the
  **service mode** (`ON_SITE` / `SEND_TO_LAB`). It is the logistics unit — "who goes where,
  when, with what".
- **`CalibrationJob`** is schema-only, one row per `(workOrder, device)`. It is the
  measurement unit — "this device, these readings, this LK". `startedAt` / `submittedAt`
  are the only job-level timestamps; there is **no explicit `jobDate` / `calibrationDate`
  field**.
- One `WorkOrder` → many `CalibrationJob` is already enforced. Different jobs in one WO
  legitimately need different equipment (the brief's WO-001 example).
- **`WorkOrderAssignment`** is the precedent join for attaching *resources* (currently
  people) to a WorkOrder.

**Implication for §13 / §16:** the natural home for "assigned / to bring" equipment is a
`WorkOrderEquipment` join at the **WorkOrder** level (mirroring `WorkOrderAssignment`),
optionally with a nullable `calibrationJobId` for job-specific precision. The schedule
fields needed for conflict detection already live on `WorkOrder`. "Actually used" stays at
`CalibrationJob` via `JobReferenceEquipmentUsed`. Details in §14, §16.

---

## 5. Existing document / certificate architecture

- **`FileObject`** is the only attachment model: polymorphic `ownerType` + `ownerId`
  (string, not a real FK), `storageKey` (object-store key), `mimeType`, `sizeBytes`,
  `originalName`, `companyId`, optional `customerId`. Indexed `[companyId, ownerType, ownerId]`.
- `FileOwnerType` currently: `CERTIFICATE, JOB_EVIDENCE, SIGNATURE, REQUEST_ATTACHMENT,
  INVOICE, CREDIT_NOTE, OTHER`.
- Typed back-relations exist for `JobEvidence`, `CustomerSignature`, `Certificate.pdfFile`.
- **No code uploads, reads, or serves `FileObject`s** — the storage adapter / upload
  endpoint is unbuilt.

**Can it support equipment calibration certificates?** — **Yes, with no new model.** Phase
2B would:
1. add `EQUIPMENT_CALIBRATION_CERTIFICATE` (or `EQUIPMENT_CALIBRATION`) to `FileOwnerType`,
2. set `FileObject.ownerType = EQUIPMENT_CALIBRATION_CERTIFICATE`, `ownerId =
   EquipmentCalibrationRecord.id`,
3. optionally add a typed back-relation on the record.

**A new document model is NOT required.** The one real dependency is that the generic
FileObject upload/serve infrastructure must be built first (it is a shared prerequisite for
JobEvidence, Signatures, Certificates *and* equipment certs — not an equipment-specific
task).

---

## 6. Physical `Equipment` — field requirements

Classification is **REQUIRED NOW (Phase 2A)** / **REQUIRED LATER (2B+)** / **NOT NEEDED**,
based on the MVP scope and existing conventions.

| Field | Classification | Rationale |
|---|---|---|
| `id` | NOW | cuid, project convention |
| `equipmentTypeId` (FK → `EquipmentType`) | NOW | the entire point of the layer; `ON DELETE RESTRICT` (matches `DeviceTypeEquipmentRequirement`) |
| `companyId` | NOW | PKM's own assets; every operational model is company-scoped (no branch — schema header) |
| `code` (internal asset code) | NOW | reliable stable identifier independent of serial; `Equipment ▸ Units` list needs a human key; unique per company. See §4 identity discussion — **recommended as the primary identity** |
| `name` / label | LATER (nullable NOW is fine) | often just "`<EquipmentType.name> <code>`"; a free-text override is cheap but low value at 2A |
| `brand` | NOW (nullable) | printed on the LK; matches `Device.brand` |
| `model` | NOW (nullable) | printed on the LK; matches `Device.model` |
| `serialNumber` | NOW (nullable) | printed on the LK; matches `Device.serialNumber`. **Nullable** — see §4 |
| `isActive` (boolean) | NOW | matches `EquipmentType`, `Device`; enough lifecycle for 2A (§12) |
| `notes` | NOW (nullable) | free-text, universal on masters |
| `status` (rich enum: `OUT_FOR_CALIBRATION`, `UNDER_REPAIR`, `RETIRED`…) | LATER | needs a maintenance/calibration workflow to drive transitions — none exists (§12) |
| `ownership` | LATER / OPEN | not represented anywhere today (§10) — do not invent |
| `location` / `custodyUserId` | LATER | `Device.locationText` free-text is the precedent; not needed to answer the 2A question (§11) |
| acquisition info (purchase date, price, supplier, warranty) | NOT NEEDED | procurement/asset-accounting scope — explicitly out (§17) |
| `calibrationDueDate` / `calibrationValidUntil` / `lastCalibratedAt` | **NOT NEEDED — actively discouraged** | a single denormalised date cannot answer "valid on the job date" post-renewal, has no cert pointer, and drifts. Validity must be **derived** from `EquipmentCalibrationRecord` (§5/§6 of the brief, §8 below). Adding it in 2A would be the exact trap the brief warns about |
| `equipmentModelId` (FK → a future `EquipmentModel`) | NOT NEEDED (future extension) | mirrors `Device` not being FK'd to `DeviceModel`; keep brand/model free-text |
| `parentEquipmentId` (kits / accessories) | NOT NEEDED (future extension) | some analyzers ship with probe sets; only if PKM actually tracks sub-components |

**Minimum Phase 2A `Equipment` (conceptual — do not implement):**
`id`, `companyId`, `equipmentTypeId`, `code`, `brand?`, `model?`, `serialNumber?`,
`isActive`, `notes?`, `createdAt`, `updatedAt`.

---

## 7. Equipment identity recommendation

### Current fact
`Device.serialNumber` is `String?` and **non-unique** (`@@index([companyId, serialNumber])`).
The one existing precedent for a serial-bearing instance treats serial as optional and
non-unique. `DeviceModel` uses a composite business key `@@unique([deviceTypeId, manufacturer, model])`.

### Recommendation
- **Primary identity = an internal `code` (asset tag), `@@unique([companyId, code])`.**
  PKM controls it, it never changes, it works for units with no manufacturer serial, and it
  matches how every other MEDCAL master is keyed. The `Equipment ▸ Units` UI and any
  pick-list should display `code`.
- **`serialNumber` nullable, and unique *within EquipmentType* if present** — i.e. a
  partial unique index `@@unique([equipmentTypeId, serialNumber]) WHERE serialNumber IS NOT NULL`
  (Postgres partial unique; Prisma can't model it — raw SQL in the migration, same technique
  already used for `WorkOrder`'s partial unique index). This catches the common data-entry
  mistake (same analyzer entered twice) without forcing a serial on units that lack one, and
  without asserting global cross-type serial uniqueness (which real-world serials do not
  guarantee).
- **Do not** make `serialNumber` globally unique or `NOT NULL`.

### OPEN BUSINESS QUESTIONS (do not resolve here)
1. Does every PKM reference equipment unit have a manufacturer serial number? (If a
   meaningful fraction don't, the internal `code` recommendation is essential.)
2. Does PKM already use an asset-tag / inventory-code scheme we should mirror (format,
   prefix)? 
3. Can two PKM units of the *same* `EquipmentType` ever share a serial (e.g. same model
   re-serialised, or vendor serial re-use)? If confirmed possible, drop the
   `(equipmentTypeId, serialNumber)` partial unique and rely on `code` alone.

---

## 8. Calibration validity analysis

### 8.1 Why a single date field is insufficient (current fact + reasoning)

`Certificate.validUntil` shows the schema author already models validity as a **point-in-time
attribute of a document**, not a mutable flag. For reference equipment the need is stronger:

| Requirement | Single `calibrationDueDate` on `Equipment` | `Equipment → EquipmentCalibrationRecord[]` |
|---|---|---|
| "Is it valid *today*?" | ✅ (compare to now) | ✅ (latest record's `validUntil` ≥ now) |
| "Was it valid *on 2027-02-15* (a past job), given it was re-calibrated 2027-03-20?" | ❌ the field now holds the *new* due date; the old one is lost | ✅ pick the record whose `[calibrationDate, validUntil]` covers the job date |
| "Where is the certificate for the calibration that covered that job?" | ❌ no pointer | ✅ record → `FileObject` |
| "Show the calibration history / interval trend" | ❌ | ✅ |
| "Certificate number / issuing lab for that calibration" | ❌ | ✅ record fields |

### 8.2 Recommended shape (Phase 2B — do NOT implement now)

`EquipmentCalibrationRecord` (one row per calibration event of a physical unit):

| Field | Purpose |
|---|---|
| `id`, `equipmentId` (FK, cascade) | the unit this calibration belongs to |
| `calibrationDate` (Date) | when the reference equipment was calibrated |
| `validUntil` (Date) | due date / expiry of *this* calibration |
| `certificateNumber` (String?) | the external cert number |
| `provider` / `laboratory` (String? — **not** an entity yet) | who performed it (KAN Q4) |
| `result` / `status` (enum? — OPEN, see below) | PASS / CONDITIONAL / FAIL, or just a note |
| `fileObjectId?` (or via `FileObject.ownerType`) | the scanned certificate PDF |
| `notes?` | free-text |
| `createdAt`, `updatedAt` | audit |

Interval-of-validity model: `[calibrationDate, validUntil]`. "Valid on date D" = ∃ record
with `calibrationDate ≤ D ≤ validUntil`. Overlapping records (early re-calibration) are fine
— any covering record satisfies the check.

### 8.3 OPEN BUSINESS QUESTIONS
- Does a calibration record ever have a **result** other than "passed" that MEDCAL must
  represent (conditional pass, adjustment applied, out-of-tolerance-on-receipt)? If not,
  `result` can be a free-text note, not an enum.
- Is the calibration **provider** a small fixed list (worth an entity later) or free-text?
- Does PKM need to track the **calibration interval / recall schedule** proactively
  (reminders), or only prove validity retrospectively? (Reminders would reuse the
  `ReminderEvent` pattern — future.)

---

## 9. Audit / KAN traceability analysis

Separating **CURRENT FACT** / **RECOMMENDATION** / **OPEN BUSINESS QUESTION**. No
accreditation requirement is invented — these are the brief's own example questions mapped
to the architecture.

| KAN-style question | CURRENT FACT (can the system prove it?) | RECOMMENDATION (minimum future data) |
|---|---|---|
| 1. "What reference equipment was used for this calibration?" | **Partially** — `JobReferenceEquipmentUsed.equipmentName` exists as a schema column, but nothing writes it and there's no job UI | Build the `CalibrationJob` completion flow (separate track) that writes `JobReferenceEquipmentUsed`; Phase 2B adds the nullable `equipmentId` FK for a pick-list |
| 2. "What was its serial number?" | **No** — column exists (`JobReferenceEquipmentUsed.serialNumber`), unused | Same as #1; snapshot kept permanently (§3.3) |
| 3. "Was its calibration still valid on the calibration date?" | **No** — no `Equipment`, no calibration records, no validity concept, and no authoritative "calibration date" field on `CalibrationJob` | Phase 2A `Equipment` + Phase 2B `EquipmentCalibrationRecord` + a defined job date (§8, §10 open question) + the validity rule (§10 of brief) |
| 4. "Where is the calibration certificate for that reference equipment?" | **No** — `FileObject` pattern exists but has no equipment owner type and no upload code | Phase 2B: `EquipmentCalibrationRecord` + `FileObject` with a new `FileOwnerType` value; depends on generic upload infra being built |
| 5. "Trace equipment in this certificate → its calibration evidence" | **No** — no `Certificate` generation, no `Equipment`, no links | Full chain: `Certificate → CalibrationJob → JobReferenceEquipmentUsed.equipmentId → Equipment → EquipmentCalibrationRecord → FileObject` (assembled across 2A, 2B, and the certificate/LK track) |
| 6. "Was the equipment appropriate for the measurement performed?" | **Partially** — `DeviceType → DeviceTypeEquipmentRequirement → EquipmentType` proves "this *type* of equipment is the one normally required for this device type" | For 2A that relationship is **sufficient** (see §11). Parameter-level suitability is a possible future extension, not a current requirement |

**What the architecture can already prove today:** essentially nothing operational — the
entire field/QA/certificate layer is schema-only. **What it cannot prove:** all six
questions, until the physical layer + a job-completion flow + certificate generation exist.

**Minimum future data for traceability (the critical path):**
`Equipment` (2A) → `EquipmentCalibrationRecord` + `JobReferenceEquipmentUsed.equipmentId`
(2B) → a `CalibrationJob` completion flow that records equipment-used → certificate/LK
generation that reads the chain.

---

## 10. Future validity rule

**Rule:** `CalibrationJob calibration date ≤ Reference Equipment calibration valid-until date`
(for every reference equipment used on that job).

### Where it logically belongs — **RECOMMENDATION: computed in the service layer, surfaced at two points**

1. **At equipment selection / job completion** (when `JobReferenceEquipmentUsed.equipmentId`
   is set) — the primary check. This is where the technician/QA picks the unit and the
   system knows both the job date and the unit's calibration records.
2. **At certificate / LK generation** — a final gate before an LK is issued citing that
   equipment (defence in depth; the job might have been completed before a record lapsed,
   or data corrected later).

Not at `WorkOrderEquipment` assignment time as the *authoritative* check — assignment is
planning ("we intend to bring ESA-001"); the schedule may shift and the unit may be
re-calibrated in between. A **soft warning** at assignment time is reasonable (e.g. "ESA-001
calibration expires before the scheduled end date").

### Warning vs hard block — **RECOMMENDATION: warning + explicit override, not a hard block (pending business confirmation)**

Reasoning from what the codebase shows: the system has no enforcement of this kind anywhere
today, PKM is a ~3-technician operation where operational reality (a slipped external
calibration, an urgent customer job) will occur, and blocking LK issuance outright could
strand real work. A recorded **override with reason + user** preserves the audit trail
better than a block that gets worked around outside the system.

### OPEN BUSINESS QUESTIONS
1. **Which date is the authoritative "calibration job date"?** `CalibrationJob` has
   `startedAt` / `submittedAt`; `WorkOrder` has `scheduledStart`. The LK typically shows the
   date the measurement was physically performed. This must be defined before the rule can
   be implemented.
2. Warning or hard block? Configurable per company? Different by role (technician sees
   warning, QA can override, admin can force)?
3. Does the rule also apply to `SEND_TO_LAB` jobs, or only `ON_SITE`? (Probably both, but confirm.)
4. Grace period — is equipment "valid" up to and including `validUntil`, or must there be a
   margin?

---

## 11. Equipment suitability analysis

**Question:** does PKM need to prove a reference equipment is suitable for a specific
**calibration parameter** (e.g. "this Electrical Safety Analyzer can measure leakage current
to the required range/uncertainty"), beyond "its calibration is valid"?

**CURRENT FACT:** the chain `DeviceType → DeviceTypeEquipmentRequirement → EquipmentType`
answers "what *type* of equipment is normally required to calibrate this device type". The
LK "Daftar Alat yang Digunakan" is a **per-job list**, not a per-parameter mapping. No
parameter-level equipment data exists.

**RECOMMENDATION:** for Phase 2A/2B the existing DeviceType-level requirement is
**sufficient**. Do **not** introduce `DeviceCalibrationParameter → EquipmentType`. Reasons:
- No current business artifact (LK, meeting notes) asks for parameter-level equipment.
- It multiplies the requirement data by ~10× (parameters per device type) for a mapping
  PKM would have to maintain by hand.
- "Suitable" in the metrological sense (range, uncertainty, CMC) is a much deeper concept
  (calibration-and-measurement-capability tables) that belongs to a full accreditation
  module, not Phase 2.

**FUTURE EXTENSION (documented, not planned):** if KAN assessment later requires it, a
`DeviceCalibrationParameterEquipmentRequirement` join (or a `capabilityItemId?` column on
`DeviceTypeEquipmentRequirement`) could add parameter-level granularity. The Phase 1
structure does not block this.

**OPEN BUSINESS QUESTION:** has any KAN assessor / PKM QA actually asked for parameter-level
equipment traceability, or is device-type-level accepted?

---

## 12. Ownership analysis

**CURRENT FACT:** ownership of reference equipment is **not represented anywhere**. `Device`
has `customerId` (customer-owned units under test). `EquipmentType` / `DeviceTypeEquipmentRequirement`
have no ownership concept. The Phase 1 audit already flagged this as open. Business-domain
docs imply "PKM-owned reference equipment" vs "customer devices" but state no rule.

**RECOMMENDATION:** Phase 2A assumes **all `Equipment` rows are PKM-owned** (company-scoped
via `companyId`, no ownership column). Do **not** invent an ownership enum.

**OPEN BUSINESS QUESTION:** can reference equipment ever be customer-owned, loaned from a
third party, or rented for a job? If yes, Phase 2B needs an ownership discriminator (and
customer-owned equipment would need a `customerId?`); if no, `companyId` alone is correct
permanently.

---

## 13. Status analysis

**CURRENT FACT:** `EquipmentType.isActive` and `Device.status` (`ACTIVE|INACTIVE`) are the
existing lifecycle precedents — both binary. There is no maintenance, repair, or
out-for-calibration workflow anywhere.

**RECOMMENDATION:** Phase 2A uses a single **`isActive` boolean** (matches `EquipmentType`
and `Device`). Sufficient to hide retired/withdrawn units from pick-lists.

**FUTURE EXTENSION (documented, not planned):** a richer `EquipmentStatus` enum
(`ACTIVE | OUT_FOR_CALIBRATION | UNDER_REPAIR | RETIRED`) becomes worthwhile only once
there is a workflow to drive the transitions (a maintenance log, or the calibration-record
flow setting `OUT_FOR_CALIBRATION` between send-out and cert-return). Some of these are
**derivable** rather than stored: "expired" = latest `EquipmentCalibrationRecord.validUntil < now`;
"never calibrated" = no records. Prefer deriving over a redundant status column (see §6 of
the brief — answer **A**, computed from records; **not B**, redundant on `Equipment`).

---

## 14. Work Order relationship analysis (DO NOT IMPLEMENT)

### How `WorkOrder → WorkOrderEquipment → Equipment` would fit

- **Grain — RECOMMENDATION: `WorkOrder` level**, mirroring `WorkOrderAssignment`
  (`@@unique([workOrderId, equipmentId])`, optional `notes`). Reasons:
  - The WorkOrder is the logistics unit and holds the schedule fields the conflict check
    needs (§16).
  - "Equipment to bring" is a packing-list concern for the whole trip, not per-device.
  - `WorkOrderAssignment` is the established pattern — reuse its shape exactly.
- **Job-specific precision:** add an **optional `calibrationJobId?`** on `WorkOrderEquipment`.
  `NULL` = "brought for the whole WorkOrder"; set = "specifically for this job". This
  supports the brief's WO-001 example (Job 1 needs simulator + analyzer, Job 2 needs
  pressure calibrator) without forcing every row to be job-scoped.
- **One WorkOrder carrying equipment for multiple jobs:** naturally supported — multiple
  `WorkOrderEquipment` rows, some `NULL` job, some job-scoped.
- **Reuse `WorkOrderAssignment` pattern?** Yes — same join-table structure, same
  `companyId` + `workOrderId` + FK + `@@unique` + `@@index` on the resource FK.

### "Actually used" stays separate
`WorkOrderEquipment` = *assigned / planned / to bring*. `JobReferenceEquipmentUsed` (+ its
future `equipmentId`) = *actually used*. A technician may bring ESA-001 but use ESA-002 —
the LK must reflect ESA-002. Do not merge.

**None of this is Phase 2A.** Phase 2A only needs `Equipment` to *exist* so these can be
built on top later.

---

## 15. Technician App implications

**CURRENT FACT:** a technician is a `User` with `UserMembership.role = TECHNICIAN`
(no `Employee` model). `MenuApplication.TECHNICIAN` and `PushApp.TECH_PWA` exist;
`FCMToken.app = TECH_PWA` is defined. `WorkOrderAssignment` links technicians to WorkOrders
(`LEAD` / `ASSIST`). There is **no Technician App code** — no tech-pwa routes, no job
execution UI. `seed-menu.ts` comment: "no Technician rows; tech-pwa has no real navigable
pages yet".

**Implications for `Equipment` modeling:**
1. The future tech workflow (`WorkOrder ON_SITE → equipment to bring → technician → actual
   equipment used → CalibrationJob → LK`) needs `Equipment` to be **selectable by a
   technician offline-friendly**: stable `code`, `EquipmentType` grouping, `isActive`
   filter. The Phase 2A field set (§6) covers this.
2. "Actual equipment used" capture is a `JobReferenceEquipmentUsed` write from the tech app
   — needs the nullable `equipmentId` FK (Phase 2B) so the tech picks from a list rather
   than typing.
3. **Custody** ("which technician currently holds ESA-001") is a plausible future need for
   the tech app (find equipment before a trip) — this is the `location` / `custodyUserId`
   field deferred in §6/§11. Not Phase 2A.
4. No new technician/employee modeling is needed for Equipment — `User` + `WorkOrderAssignment`
   are enough.

**Do not implement any Technician App functionality.**

---

## 16. Conflict / availability implications

**CURRENT FACT:** `WorkOrder.scheduledStart` and `WorkOrder.scheduledEnd` exist
(`DateTime?`, API-wired). No `Equipment`, no assignment, no conflict logic.

### Minimum data required for future conflict detection
1. `Equipment` rows (so "one physical ESA-001" is a distinct entity) — **Phase 2A**.
2. A `WorkOrderEquipment` assignment join (`workOrderId` ↔ `equipmentId`) — **later**.
3. `WorkOrder.scheduledStart` / `scheduledEnd` — **already exist**; no new schedule fields
   needed.

### Grain — RECOMMENDATION: `WorkOrder` level
Conflict = two `WorkOrderEquipment` rows referencing the same `equipmentId` whose parent
WorkOrders have overlapping `[scheduledStart, scheduledEnd]`. The schedule lives on
`WorkOrder`, so that is the only grain where the check is well-defined.
- Not `CalibrationJob` — jobs have no schedule fields.
- Not `WorkOrderEquipment` alone — it has no dates of its own; it inherits the WorkOrder's.

### Behaviour — RECOMMENDATION: warning only
Surface "ESA-001 is also assigned to WO-002 (overlapping schedule) — coordinate" at
assignment time and on a dashboard. **Do not block.** The Phase 1 audit and the business
context both say the human resolves scheduling; the system flags, it does not allocate.

**Do not build a scheduling engine, availability calendar, or conflict detection now.**

---

## 17. Inventory boundary

**RECOMMENDATION: `Equipment` is an ASSET / reference-instrument master — permanently
separate from any Inventory concept.**

**CURRENT FACT:** no inventory model exists. `PurchaseOrder` / `PurchaseOrderItem` are
*customer* purchase orders for calibration services, not procurement of PKM equipment.
Business-domain docs explicitly warn "do not grow into SAP".

**Keeping the boundary clean:**
- `Equipment` has **no** `quantity` — a physical unit is quantity 1 by definition; multiple
  units = multiple `Equipment` rows (the brief's ESA-001/002/003).
- No `warehouse`, `stockMovement`, `valuation`, `depreciation`, `reorderLevel`,
  `purchaseOrderId`, `unitCost`.
- If PKM ever adds consumables inventory (probes, adapters, batteries) or asset accounting,
  that is a **new module that references `equipmentId`**, never one that absorbs or
  reshapes `Equipment`. `Equipment` stays the identity+calibration record; inventory/finance
  modules attach to it.
- `EquipmentCalibrationRecord` is calibration *evidence*, not a stock transaction — it is
  the one child model `Equipment` needs.

---

## 18. Architecture options

### Option A — `EquipmentType → Equipment` only, validity as a field on `Equipment`

`Equipment { ..., calibrationValidUntil Date?, lastCalibratedAt Date? }`

| Dimension | Assessment |
|---|---|
| Complexity | Lowest — one model, one migration |
| Traceability | **Poor** — cannot reconstruct validity as-of a past job after renewal; no cert number, no provider, no document pointer |
| Audit / KAN readiness | **Fails** brief questions 3, 4, 5 |
| Technician App | OK for pick-list; validity check is lossy |
| WorkOrderEquipment support | Fine (independent) |
| Conflict detection | Fine (independent) |
| Historical accuracy | **Poor** — renewal overwrites the previous due date |
| Document traceability | **None** |
| Migration impact | Minimal |
| Over-engineering risk | None — but under-engineered; this is the trap the brief explicitly warns against |

### Option B — `EquipmentType → Equipment → EquipmentCalibrationRecord[]`, validity derived (RECOMMENDED)

`Equipment` (identity + `isActive`, **no validity field**) + `EquipmentCalibrationRecord`
(calibrationDate, validUntil, certificateNumber, provider, result/note, `FileObject` doc,
notes). Current validity = computed from the latest / covering record.

| Dimension | Assessment |
|---|---|
| Complexity | Moderate — two models, paid across 2A (Equipment) + 2B (records). 2A alone ≈ Option A's effort |
| Traceability | **Strong** — full calibration history, validity as-of any date, cert number + provider + document |
| Audit / KAN readiness | Answers brief questions 1–5 once the job-completion + LK track also exists; #6 covered at device-type level |
| Technician App | Pick-list + a real "valid on job date?" check |
| WorkOrderEquipment support | Clean — join attaches to `Equipment` |
| Conflict detection | Clean — `Equipment` + `WorkOrder` schedule |
| Historical accuracy | **Strong** — records are append-only history |
| Document traceability | Reuses `FileObject` polymorphic pattern — no new document model |
| Migration impact | 2A: 1 additive table. 2B: 1 additive table + 1 `FileOwnerType` enum value + 1 nullable FK on `JobReferenceEquipmentUsed` |
| Over-engineering risk | **Low** — mirrors the existing `Certificate` (validUntil + status + supersession) and `QualityReview`-under-`CalibrationJob` patterns; nothing speculative |

### Option C — Option B + a full `EquipmentCalibrationCertificate` entity with status lifecycle, supersession chain, provider entity, revoke reason

Essentially cloning the `Certificate` model for reference equipment.

| Dimension | Assessment |
|---|---|
| Complexity | High — status enum, supersession self-relation, `CalibrationProvider` entity, revoke workflow |
| Traceability | Marginally better than B (explicit supersession, revoke) |
| Audit / KAN readiness | Same as B for the current questions |
| Everything else | Same as B |
| Migration impact | Larger — 3–4 models |
| Over-engineering risk | **High** — builds a reference-equipment *calibration management subsystem*, which the brief explicitly says not to do. Supersession/revoke of an equipment calibration cert is not a workflow PKM has asked for; a corrected record can just be edited or a new record added |

---

## 19. Recommended architecture

**Option B, phased: `EquipmentType → Equipment → EquipmentCalibrationRecord[]`, current
validity always derived, never stored on `Equipment`.**

It satisfies the mandated question — *"Which physical reference equipment was used for this
CalibrationJob, and was it valid at the time?"* — via the chain:

```
Certificate / LK
   └─ CalibrationJob
        └─ JobReferenceEquipmentUsed   (free-text snapshot, kept permanently)
             └─ equipmentId (nullable FK, Phase 2B)
                  └─ Equipment                      ← Phase 2A
                       └─ EquipmentCalibrationRecord[]   ← Phase 2B
                            └─ FileObject (certificate PDF)   ← Phase 2B + upload infra
```

It reuses existing MEDCAL patterns (global-master CRUD module shape, `Device`-style instance
with nullable serial, `WorkOrderAssignment`-style joins for the future, `Certificate`-style
validity, `FileObject` polymorphic documents, `QualityReview`-style per-parent history) and
introduces **no** inventory, scheduling, maintenance, procurement, or accreditation
machinery.

---

## 20. Phase 2A scope (proposed — for review, not implementation)

1. **`Equipment` model** (conceptual): `id`, `companyId`, `equipmentTypeId` (FK → `EquipmentType`,
   `ON DELETE RESTRICT`), `code` (`@@unique([companyId, code])`), `brand?`, `model?`,
   `serialNumber?` (partial-unique within `equipmentTypeId`, raw SQL), `isActive`, `notes?`,
   timestamps. Back-relation `equipmentType.equipment Equipment[]`.
2. **One additive migration** — `CREATE TABLE "Equipment"` + indexes + FK + partial unique index.
3. **API**: `EquipmentModule` — `/equipment` CRUD (list/search/get/create/update/delete),
   mirroring the Phase 1 `equipment-types` module. `equipment:read/create/update/delete`
   RBAC resource, ADMIN grants seeded. `GET /me` capability flags. `delete` blocked if the
   unit is referenced (once §2B FKs exist — for 2A there are no references, so a plain
   delete or an `isActive=false` soft-retire).
4. **UI**: `Equipment ▸ Units` list (grouped by `EquipmentType`, expandable — reuse the
   Requirements screen pattern) + create/edit/detail, under the existing `Equipment` menu
   sub-group. One menu leaf.
5. **Architecture readiness for validity**: `Equipment` deliberately carries **no** validity
   field; the `EquipmentCalibrationRecord` design is documented (this report) and left for
   2B.

**Phase 2A explicitly does NOT include:** any validity/calibration-date field on `Equipment`,
`EquipmentCalibrationRecord`, document upload, `JobReferenceEquipmentUsed` changes,
`WorkOrderEquipment`, conflict detection, ownership, location/custody, rich status enum,
`EquipmentModel` tier.

---

## 21. Deferred scope

| Item | Phase |
|---|---|
| `EquipmentCalibrationRecord` (calibration date, valid-until, cert number, provider, result, notes) | **2B** |
| `FileOwnerType.EQUIPMENT_CALIBRATION_CERTIFICATE` + certificate document upload | **2B** (depends on generic `FileObject` upload infra — a separate shared prerequisite) |
| `JobReferenceEquipmentUsed.equipmentId` nullable FK + keep free-text snapshot | **2B** |
| The validity rule (`job date ≤ validUntil`), as a service-layer warning | **2B / certificate-track** |
| Authoritative "calibration job date" definition on `CalibrationJob` | **2B** (blocked on business answer) |
| `WorkOrderEquipment` join (`WorkOrder` grain, optional `calibrationJobId?`) | **later** |
| Equipment conflict / availability warning (`WorkOrder` schedule overlap) | **later** |
| Technician App equipment pick / "actual used" capture | **later (Technician App track)** |
| Surat Jalan + equipment-to-Surat-Jalan link | **later (does not exist — §22)** |
| Ownership discriminator | **later / open** |
| Location / custody (`custodyUserId`, `laboratory`) | **later** |
| Rich `EquipmentStatus` enum (`OUT_FOR_CALIBRATION`, `UNDER_REPAIR`, `RETIRED`) | **later** |
| `EquipmentModel` master tier | **later / maybe never** (mirror `DeviceModel` un-wired) |
| Parameter-level equipment suitability (`DeviceCalibrationParameter → EquipmentType`) | **future extension / open** |
| Calibration recall reminders (reuse `ReminderEvent` pattern) | **later** |
| Any inventory / procurement / valuation / depreciation | **out of scope entirely** |
| Reference-equipment calibration *management* subsystem (Option C) | **out of scope** |

---

## 22. Open business questions (NOT resolved by this audit)

1. **Equipment identity** — does every PKM reference unit have a manufacturer serial
   number? Does PKM already run an asset-tag scheme (format/prefix)? Can two units of the
   same `EquipmentType` share a serial? (§7)
2. **Ownership** — is reference equipment ever customer-owned, loaned, or third-party, or
   always PKM-owned? (§12)
3. **Authoritative calibration job date** — for the validity rule, is it
   `CalibrationJob.startedAt`, `submittedAt`, `WorkOrder.scheduledStart`, or a new explicit
   "measurement date" field? (§8, §10)
4. **Validity rule behaviour** — warning, hard block, or configurable? Role-dependent?
   Applies to `SEND_TO_LAB` too? Grace period? (§10)
5. **Calibration record result** — is there any result other than "passed" MEDCAL must
   represent (conditional, adjusted, out-of-tolerance-on-receipt)? Enum or free-text? (§8)
6. **Calibration provider** — fixed shortlist (entity later) or free-text? (§8)
7. **Proactive recall** — does PKM need calibration-due reminders, or only retrospective
   proof of validity? (§8, §13)
8. **Parameter-level suitability** — has any KAN assessor / PKM QA actually required
   equipment traceability *per calibration parameter*, or is device-type-level accepted? (§11)
9. **Custody tracking** — does the Technician App need "which technician holds this unit
   now"? (§11, §15)
10. **Kits / sub-components** — does PKM track probe sets / accessories as separate units or
    as one? (§6)

---

## 23. Files inspected

- `packages/db/prisma/schema.prisma` (full)
- `packages/db/prisma/migrations/` — full listing; read
  `20260826200000_add_job_reference_equipment_used/migration.sql`,
  `20260829030000_add_equipment_type_and_device_type_equipment_requirement/migration.sql`
- Confirmed `CalibrationJob` / `Certificate` / `FileObject` originate in
  `20260813063336_init_better_auth_fcmtoken` (no dedicated migration since)
- `packages/auth/src/access-control.ts` (permission catalog)
- `packages/db/prisma/seed-menu.ts`, `seed-role-permissions.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/modules/work-orders/work-orders.service.ts` (`scheduledStart/End` handling),
  `work-orders.service.test.ts` (CalibrationJob references), presence of `work-order-pdf.ts`
- `apps/api/src/modules/equipment/` (Phase 1 module — service/controller/module/tests)
- Code searches across `apps/` for: `JobReferenceEquipmentUsed`, `referenceEquipmentUsed`,
  `CalibrationJob`, `FileObject` / `FileOwnerType`, `Certificate`, `scheduledStart`,
  `Surat Jalan` / `deliveryNote` — establishing that CalibrationJob / JobReferenceEquipmentUsed /
  Certificate / FileObject have **no** application layer
- `implementation_report_equipment_audit.md`, `implementation_report_equipment.md` (prior phases)

---

## 24. Explicit confirmation

See the boxed statement at the top of this document. **No code, schema, migration, database
row, API, RBAC, seed, or UI was created or modified.** This audit report is the only output.
Stopping here for architecture review before any Phase 2A implementation.
