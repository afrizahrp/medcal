# SURAT JALAN ALAT — IMPLEMENTATION READINESS AUDIT

**Status:** AUDIT ONLY — no code, schema, migration, numbering, PDF, or UI changes were made.
**Date:** 2026-09-01
**Scope input:** `pre-implementation-delivery-note-audit.md` (same folder)
**Method:** static read of `packages/db/prisma/schema.prisma`, `packages/db/src/document-number/*`, `apps/api/src/modules/work-orders/*`, `apps/api/src/modules/equipment/*`, related migrations.

---

## 1. Executive Summary

**Is the system ready to implement Surat Jalan Alat? — Partially. One real schema gap blocks it; everything else can be reused.**

| Area | Verdict |
| --- | --- |
| Document-numbering architecture | ✅ Ready — `EQUIPMENT_DELIVERY_NOTE` / `DLN` fits the existing `DocumentType` + `DocumentNumberService` pattern with no structural change (add enum value + prefix map entry, optional number-table entry). |
| Anchor document (SPK / `WorkOrder` where `serviceMode = ON_SITE`) | ✅ Exists, immutable number, PDF already generated. |
| PKM reference-equipment master (`Equipment` + `EquipmentType` + `EquipmentCalibrationRecord`) | ✅ Exists (Phase 2A/2B). Holds Nama Alat / Merk / Model / Serial Number. |
| Requirement template (`DeviceTypeEquipmentRequirement`) | ✅ Exists — but it is `EquipmentType`-level, not unit-level. |
| **Link: which actual `Equipment` units travel on a given Work Order / SPK** | ❌ **MISSING — no entity connects `Equipment` to `WorkOrder`/SPK.** This is the blocker. |
| `JobReferenceEquipmentUsed` | ⚠️ Exists in schema only (no API, no UI). It is a *post-calibration* free-text record on `CalibrationJob`, not a *pre-departure* selection. Not a substitute. |
| PDF infrastructure | ✅ Reusable — `pdfkit`, shared letterhead/footer/logo helpers in `work-order-pdf-shared.ts`. |
| Authorised signatory data | ⚠️ No signatory name/title field on `Company` or `User` (SPK already prints title-only). |

**Bottom line:** the Surat Jalan cannot be populated with *actual* equipment identity until there is a persistent selection of `Equipment` units per `WorkOrder`. That single gap plus a small set of open business decisions (Section 12) must close before implementation.

---

## 2. Current Architecture (relevant entities only)

### 2.1 Document numbering

```
DocumentType (enum, schema.prisma:218)
  CUSTOMER | CALIBRATION_REQUEST | QUOTATION | PURCHASE_ORDER
  WORK_ORDER | WORK_ORDER_SEND_TO_LAB | INVOICE | CERTIFICATE | CREDIT_NOTE

DocumentNumberSequence (schema.prisma:349)
  id, companyId (Char(3)), documentType, prefix (Char(3)), year, lastSequence
  @@unique([companyId, documentType, year])          <-- one counter per (company, type, YEAR)
  @@index([companyId, documentType])

DocumentNumberService.allocate()  (packages/db/src/document-number/document-number.service.ts)
  - resolveDocumentPrefix(documentType)   -> DOCUMENT_TYPE_PREFIX map (document-type-prefix.ts)
  - resolveDocumentNumberTable(documentType) -> DOCUMENT_TYPE_NUMBER_TABLE map (document-type-table.ts)
      (used only to seed the sequence from MAX(existing number) for back-compat; optional)
  - INSERT ... ON CONFLICT (companyId, documentType, year) DO UPDATE lastSequence + 1
  - formatDocumentNumber(prefix, issuedAt, seq) -> "PRE/YYYY/MM/00001"  (format-document-number.ts)
```

Prefix map today (`document-type-prefix.ts`):
`CUSTOMER=CUS, CALIBRATION_REQUEST=CRQ, QUOTATION=QUO, PURCHASE_ORDER=PUR, WORK_ORDER=SPK, WORK_ORDER_SEND_TO_LAB=WOL, INVOICE=INV, CERTIFICATE=CER, CREDIT_NOTE=CRN`

Number-table map today (`document-type-table.ts`):
`WORK_ORDER -> "WorkOrder"`, `WORK_ORDER_SEND_TO_LAB -> "WorkOrder"` (both series live in the same table, distinguished by prefix in the `number` string), etc.

### 2.2 Work Order

```
WorkOrder (schema.prisma:1530)
  id, companyId, quotationId, purchaseOrderId, customerId, number
  serviceMode (ServiceMode: ON_SITE | SEND_TO_LAB)   -- immutable after create
  addressText, geoLat, geoLng, locationNotes
  scheduledStart, scheduledEnd
  status (WorkOrderStatus: PLANNED|ASSIGNED|IN_PROGRESS|DONE|CANCELLED)
  relations: quotation, purchaseOrder, customer, items[], assignments[], jobs[]
  @@unique([companyId, number])

WorkOrderItem (1568)          -- 1:1 snapshot of each PurchaseOrderItem (customer devices)
WorkOrderAssignment (1585)    -- technicianUserId + roleOnJob (LEAD|ASSIST); @@unique([workOrderId, technicianUserId])
CalibrationJob (1604)         -- one per (workOrderId, deviceId); has referenceEquipmentUsed[]
```

Number is allocated in `work-orders.service.ts:197` at create:
`serviceMode === "ON_SITE" ? "WORK_ORDER" (SPK) : "WORK_ORDER_SEND_TO_LAB" (WOL)`.

### 2.3 Equipment (PKM reference / standard instruments)

```
EquipmentType (schema.prisma:990)
  id, code (unique), name, description, category, isActive
  relations: deviceRequirements[] (DeviceTypeEquipmentRequirement), equipment[]

Equipment (schema.prisma:1015)   -- an INDIVIDUAL PKM-owned unit
  id, companyId, equipmentTypeId, code (asset id, @@unique([companyId, code]))
  brand, model, serialNumber (nullable, NOT unique), isActive, notes
  relations: company, equipmentType, calibrationRecords[]

EquipmentCalibrationRecord (schema.prisma:1058)   -- Phase 2B; derives current validity
  calibrationDate, validFrom, validUntil, certificateNumber, provider,
  result, acceptedForUse, status (DRAFT|CONFIRMED)
```

`Equipment` has an API module (`apps/api/src/modules/equipment/equipment.service.ts`) and portal UI (`apps/portal/src/app/management/equipment-units/`). Phase-2A comment explicitly notes "Equipment has no downstream references yet (JobReferenceEquipmentUsed link, WorkOrderEquipment, EquipmentCalibrationRecord are all future)".

### 2.4 Equipment Requirement (template)

```
DeviceTypeEquipmentRequirement (schema.prisma:1094)
  id, deviceTypeId, equipmentTypeId, notes, sortOrder
  @@unique([deviceTypeId, equipmentTypeId])
  -- "Master configuration only ... NOT an assignment, NOT a per-job snapshot,
  --  no quantity / mandatory-flag / priority / lifecycle"
  -- required set for a CalibrationJob is DERIVED at read time from job.device.deviceTypeId
```

### 2.5 `JobReferenceEquipmentUsed`

```
JobReferenceEquipmentUsed (schema.prisma:1659, migration 20260826200000)
  id, calibrationJobId, equipmentName, brand, model, serialNumber, timestamps
  relation: calibrationJob (onDelete Cascade)
```

- **Free text**, no FK to `Equipment`.
- Attached to `CalibrationJob`, which is created per device.
- **No API module, no UI** — grep finds it only in schema + `equipment.service.ts` comment.
- Semantically a *record of what was used during/after calibration* (for the certificate traceability block), **not** a *pre-departure packing list*.

---

## 3. Current Work Order Flow

```
CalibrationRequest (serviceMode: ON_SITE | SEND_TO_LAB)
   -> CalibrationRequestItem (deviceType, future deviceId)
        |
        v
Quotation (QUO/...)  -- 1:1 with request
   -> QuotationItem (deviceId?, deviceType)
        |
        v
PurchaseOrder (PUR/...)  -- customer PO captured (customerPoNumber, customerPoDate)
   -> PurchaseOrderItem (device?)
        |
        v
WorkOrder (number allocated by serviceMode):
     ON_SITE     -> WORK_ORDER             -> SPK/YYYY/MM/NNNNN
     SEND_TO_LAB -> WORK_ORDER_SEND_TO_LAB -> WOL/YYYY/MM/NNNNN
   -> WorkOrderItem[]        (1:1 snapshot of PurchaseOrderItem)
   -> WorkOrderAssignment[]  (technicians; LEAD/ASSIST)
   -> CalibrationJob[]       (one per device: workOrderId + deviceId)
        -> MeasurementResult[], JobEvidence[], JobReferenceEquipmentUsed[],
           CustomerSignature?, QualityReview[], Certificate?
```

PDF: `GET /work-orders/:id/pdf` -> `service.buildPdf` -> `renderWorkOrderPdf` -> branch on `serviceMode`:
`ON_SITE -> renderSpkPdf` (`work-order-pdf-spk.ts`), `SEND_TO_LAB -> renderWolPdf` (`work-order-pdf-wol.ts`).

**There is currently no document, entity, or endpoint for Surat Jalan Alat.** The only reference to it in the codebase is the doc comment in `work-order-pdf-shared.ts:12` ("ON_SITE additionally gets a 'Surat Jalan Alat' later ... That document is NOT implemented here").

---

## 4. Equipment Data Flow — three distinct concepts

| # | Concept | Entity | Granularity | Owner | Role in Surat Jalan |
| --- | --- | --- | --- | --- | --- |
| A | **Customer equipment** (the thing being calibrated) | `Device` (schema.prisma:1247) — `code` DVC-*, `customerId`, `deviceTypeId`, brand/model/serialNumber | Physical unit | Customer | **NOT on the Surat Jalan.** Appears on SPK/WOL body and Work Order form. |
| B | **Equipment requirement / template** | `DeviceTypeEquipmentRequirement` (1094) | `EquipmentType` per `DeviceType` | PKM config | Source of *which kinds* of instruments are needed. Cannot supply serial numbers. |
| C | **PKM reference / standard equipment** (carried by technician) | `Equipment` (1015) + `EquipmentType` (990) + `EquipmentCalibrationRecord` (1058) | Individual PKM-owned unit | PKM (`companyId`) | **This is the Surat Jalan payload** — Nama Alat (`equipmentType.name`), Merk (`brand`), Type/Model (`model`), S/N (`serialNumber`). |

**Flow that SHOULD exist for Surat Jalan (does NOT today):**

```
WorkOrder (ON_SITE) --has--> CalibrationJob[] --device.deviceTypeId-->
   DeviceTypeEquipmentRequirement[]  (derive REQUIRED EquipmentTypes)
        |
        v
   [ technician / planner selects specific Equipment units of those types ]
        |
        v
   <<<  MISSING PERSISTENT LINK: WorkOrder x Equipment  >>>
        |
        v
   Surat Jalan Alat body rows
```

Today the chain stops at `DeviceTypeEquipmentRequirement` (EquipmentType level). Nothing records "unit ESA-001 (SN 6579027) goes with SPK 34/2026".

---

## 5. Hard-Copy Field Mapping

Hard-copy reference: `SURAT JALAN ALAT` sample (equipment table: No / Nama Alat / Merk / S/N), plus `SURAT PERINTAH KERJA` (e.g. `34-SPK-PKM-2026`) and the separate `WORK ORDER FORM`.

Status legend: **EXISTS** = a current source can provide it · **DERIVABLE** = safely computed from existing data · **MISSING** = no source · **AMBIGUOUS** = multiple sources / unclear business meaning.

### 5.1 Header

| Hard-copy field | Existing source | Status | Notes |
| --- | --- | --- | --- |
| Company identity ("LABORATORIUM KALIBRASI" + legal name) | `Company.name` / `Company.legalName` | EXISTS | Same as SPK letterhead (`drawLetterhead`, `work-order-pdf-spk.ts:218`). |
| PKM logo | `resolvePkmLogoPath()` -> `logo.png` | EXISTS | Asset resolution helper already in `work-order-pdf-shared.ts:48`. Portal copy at `apps/portal/public/logo.png`; API copy expected at `apps/api/assets/logo.png`. |
| KAN logo + accreditation code | `resolveKanLogoPath()` -> `KAN-logo.png`; `KAN_ACCREDITATION_CODE = "LK-521-IDN"` | EXISTS | Constant in shared file. |
| Document title ("SURAT JALAN ALAT") | static string | EXISTS | Literal. |
| Document number | `DocumentNumberService` (new `EQUIPMENT_DELIVERY_NOTE` series) | DERIVABLE | Needs the enum value + prefix (Section 6). Not stored anywhere yet. |
| Date | issue date of the Surat Jalan (new field) OR `WorkOrder.scheduledStart` | AMBIGUOUS | OPEN BUSINESS DECISION — is the Surat Jalan dated at generation, or at planned departure? |
| Customer name | `WorkOrder.customer.name` | EXISTS | |
| Location / "digunakan di" | `WorkOrder.addressText` (fallback `customer.name`; SPK uses this exact fallback) | EXISTS/DERIVABLE | Same pattern as SPK "Tempat" (`work-order-pdf-spk.ts:140`). |
| Reference to calibration activity / SPK | `WorkOrder.number` (SPK/…) | EXISTS | The Surat Jalan must cite the SPK number; requires the WO↔SuratJalan link (Section 7). |
| Reference to customer PO | `WorkOrder.purchaseOrder.customerPoNumber` | EXISTS | Optional, mirrors SPK opening line. |

### 5.2 Body (equipment table rows)

| Hard-copy field | Existing source | Status | Notes |
| --- | --- | --- | --- |
| Sequence number (No) | row index | DERIVABLE | Presentation; order should follow a deliberate sort (see below). |
| Nama Alat (e.g. "ESA") | `Equipment.equipmentType.name` (or a display name) | EXISTS* | *Only once specific `Equipment` units are linked to the Work Order. **Blocked by the missing link.** |
| Merk (e.g. "Fluke Biomedical") | `Equipment.brand` | EXISTS* | Nullable in schema. |
| Type / model (e.g. "TH-03") | `Equipment.model` | EXISTS* | Nullable. Hard copy shows it inconsistently. |
| Serial Number (e.g. "6579027") | `Equipment.serialNumber` | EXISTS* | Nullable, not unique. Hard copy always shows it. |
| Row ordering | `DeviceTypeEquipmentRequirement.sortOrder` (per DeviceType) | AMBIGUOUS | A Surat Jalan can span multiple DeviceTypes/jobs; `sortOrder` is per-DeviceType only. OPEN: global ordering rule for the combined list. |

### 5.3 Footer

| Hard-copy field | Existing source | Status | Notes |
| --- | --- | --- | --- |
| Usage date / period ("digunakan pada tanggal …") | `WorkOrder.scheduledStart` / `scheduledEnd` | DERIVABLE | Nullable; if unset the field is blank. |
| Standard statement ("alat standar di atas digunakan untuk kegiatan kalibrasi di lokasi pelanggan") | static string | EXISTS | Literal, from hard copy. |
| Authorised person — name | none | MISSING | No signatory name on `Company` or `User`. SPK already handles this by printing title only. |
| Authorised person — title ("Manager Teknis" / equivalent) | static string (as SPK does) | DERIVABLE | SPK prints "Manager Teknis" literally (`work-order-pdf-spk.ts:183`). OPEN: is the Surat Jalan signatory the same role? |
| Signature | none (wet signature space) | MISSING | Same as SPK — blank signature box. No e-signature for internal PKM docs. |
| Company identity (footer block) | `Company.legalName` + `PKM_LETTERHEAD_ADDRESS_LINES` | EXISTS | `drawFooterAllPages` helper reusable verbatim. |
| Technician name(s) carrying the equipment | `WorkOrder.assignments[].technician.name` | EXISTS | Hard copy may name the technician; assignment data is present. |

**No field requires inventing a value.** Every MISSING item is either (a) intentionally blank on the physical form too (signature, signatory name) or (b) an OPEN BUSINESS DECISION listed in Section 12.

---

## 6. Document Numbering — does `EQUIPMENT_DELIVERY_NOTE` / `DLN` / `DLN/YYYY/MM/NNNNN` fit?

**Yes, cleanly. No structural change to the numbering system.**

Findings:

1. **Prefix definition** — fixed map `DOCUMENT_TYPE_PREFIX` (`document-type-prefix.ts`), not per-company. Adding `EQUIPMENT_DELIVERY_NOTE: "DLN"` is a one-line addition. Prefix must be exactly 3 uppercase letters (`formatDocumentNumber` enforces `/^[A-Z]{3}$/`) — `DLN` is valid.
2. **Sequence partitioning** — `DocumentNumberSequence` is keyed `@@unique([companyId, documentType, year])`. A new `documentType` automatically gets its **own independent counter** per company per year. `DLN` will not collide with `SPK` / `WOL`.
3. **Year vs month** — the sequence resets **per YEAR only**. Month (`MM`) in the formatted string is **display-only**, taken from `issuedAt.getUTCMonth()` in `formatDocumentNumber`. **Monthly reset is NOT supported** and would require schema/service change. The candidate `DLN/2026/09/00001` is consistent with this: `00001` is the first DLN of *2026*, not of *September 2026*.
4. **Format string** — `formatDocumentNumber` produces `PRE/YYYY/MM/NNNNN` with 5-digit zero-pad, regex-validated `^[A-Z]{3}\/\d{4}\/\d{2}\/\d{5}$`. `DLN/2026/09/00001` matches exactly.
5. **Number table** — `DOCUMENT_TYPE_NUMBER_TABLE` maps a type to the table holding its `number` string, used only to seed `lastSequence` from `MAX(existing)` for backfill safety. For a brand-new series with no legacy rows this entry is **optional**; `resolveDocumentNumberTable` returning `undefined` is handled (`maxExisting = 0`). If the Surat Jalan is stored in its own table (recommended, Section 7) add `EQUIPMENT_DELIVERY_NOTE: "EquipmentDeliveryNote"` for consistency.
6. **Company / documentType / year tie** — allocation already requires `companyId` + `documentType` + `issuedAt`. Nothing new needed.
7. **Allocation must run inside a transaction** (`tx` param). The Surat Jalan create flow must call `DocumentNumberService.allocate` within `prisma.$transaction`, exactly as `work-orders.service.ts:199` does.

**Naming consistency note (OPEN, minor):** existing enum values for work-order docs are `WORK_ORDER` / `WORK_ORDER_SEND_TO_LAB` (behaviour-named), while the proposal `EQUIPMENT_DELIVERY_NOTE` is artefact-named. Both styles already coexist (`INVOICE`, `CERTIFICATE`). Recommend `EQUIPMENT_DELIVERY_NOTE` — no functional impact.

**Verdict:** add 1 enum value, 1 prefix-map entry, optionally 1 number-table entry. Zero migrations to the numbering tables themselves (the `DocumentType` enum extension is the only DB change, identical in shape to migration `20260901120000_add_work_order_send_to_lab_to_document_type`).

---

## 7. Document Relationship & Cardinality

### 7.1 Recommended anchor

```
WorkOrder (serviceMode = ON_SITE, i.e. the SPK)
   └── EquipmentDeliveryNote (Surat Jalan Alat)
```

Anchor on `WorkOrder`, **not** on `CalibrationJob` — the equipment travels once for the whole site visit, covering every device/job on that Work Order. `SEND_TO_LAB` Work Orders get **no** Surat Jalan (locked decision).

### 7.2 Cardinality — what the code allows vs what is undecided

| Question | Code today | Recommendation | Decision status |
| --- | --- | --- | --- |
| Can one SPK have multiple Surat Jalan? | N/A (entity doesn't exist) | Allow **1 active** per Work Order; support **reissue** creating a new numbered document that supersedes the prior (mirrors how `WorkOrder` uses a partial unique index `status <> CANCELLED`, schema.prisma:1562). | OPEN — confirm reissue policy |
| Regenerate (same number, re-render PDF)? | SPK/WOL PDF is regenerated on every `GET /:id/pdf` — nothing is persisted | Same model: PDF is always rendered on demand from live data; "regenerate" = just re-download. | Derivable from existing pattern |
| Reissue (new number)? | — | Yes, when equipment list changes after first issue. New `EquipmentDeliveryNote` row, new `DLN`, old one marked `SUPERSEDED`/`CANCELLED`. | OPEN |
| Cancel? | `WorkOrder` has `CANCELLED`; SPK number is retained | Yes — soft status, number retained (never reused; gaps acceptable per `MasterCodeSequence` convention comment). | OPEN (confirm) |
| Immutable after issuance? | SPK/WOL: `number` + `serviceMode` immutable; other fields editable while non-terminal | Recommend: once `ISSUED`, the equipment line-items are frozen; changes require reissue. | OPEN |
| Generated before technician departure? | — | Yes — that is the operational point of the document. | Business-obvious (Section 12 flow step 6) |
| Before or after technician assignment? | `WorkOrderAssignment` exists independently; SPK PDF renders "Teknisi belum di-assign" if none | Recommend **after** assignment (so the carrying technician is named) but do not hard-block. | OPEN |

### 7.3 Storage recommendation

New table `EquipmentDeliveryNote` (+ child `EquipmentDeliveryNoteItem` snapshotting `Equipment` identity at issue time, so later edits/deactivation of `Equipment` don't rewrite history — same "operational snapshot" principle as `WorkOrderItem` schema.prisma:1566). This also gives the missing WO↔Equipment link a home.

---

## 8. Lifecycle

**Existing behaviour (unchanged):**
- `WorkOrder` created with `serviceMode` + number (SPK for ON_SITE).
- `WorkOrderAssignment` rows added/removed while non-terminal.
- SPK PDF downloadable any time from live data.

**Proposed minimum Surat Jalan lifecycle (all NEW):**

```
DRAFT      -- planner building the equipment list; freely editable; no number yet
  |  (allocate DLN, freeze items)
  v
ISSUED     -- DLN assigned, PDF printable, items frozen; technician departs
  |
  +--> SUPERSEDED  (a reissue ISSUED; this one is historical)
  +--> CANCELLED   (trip cancelled / created in error; number retained)
```

Optional later: `RETURNED` (equipment back at PKM) — but Section 12 warns against adding return/inventory tracking now. Recommend **not** modelling return in phase 1; the physical form has no return-acknowledgement section.

Keep it to `DRAFT / ISSUED / SUPERSEDED / CANCELLED`. Number allocated on the `DRAFT -> ISSUED` transition, in a transaction.

---

## 9. PDF Architecture

**Reusable as-is — no new document-generation architecture needed.**

| Asset | Location | Reuse |
| --- | --- | --- |
| Engine | `pdfkit` (`import PDFDocument from "pdfkit"`) | Same engine for all docs (SPK, WOL, quotation, PO). |
| Shared helpers | `apps/api/src/modules/work-orders/work-order-pdf-shared.ts` | `resolvePkmLogoPath`, `resolveKanLogoPath`, `KAN_ACCREDITATION_CODE`, `PKM_LETTERHEAD_ADDRESS_LINES`, `formatDate`, `text`, `workOrderPdfFilename`. |
| Letterhead | `drawLetterhead()` in `work-order-pdf-spk.ts:218` | Copy/lift into a shared helper; identical PKM + KAN header. |
| Footer (all pages) | `drawFooterAllPages()` in `work-order-pdf-spk.ts:270` | Identical company/address footer. |
| Label rows | `labelRow()` in `work-order-pdf-spk.ts:199` | "Label : value" layout for header block. |
| Dispatch | `renderWorkOrderPdf()` branches on `serviceMode` | New Surat Jalan renderer would be its **own** function/endpoint, not a branch here. |
| Logo files | `logo.png`, `KAN-logo.png` — resolved from `apps/api/assets/` or `../portal/public/` | Portal originals: `apps/portal/public/logo.png`, `apps/portal/public/KAN-logo.png`. Ensure API `assets/` copies exist (SPK already depends on this). |
| Fonts | Helvetica / Helvetica-Bold / Helvetica-Oblique (pdfkit built-ins) | No custom font. |
| Signature | Blank wet-signature box (title only) | Same convention as SPK. |
| Delivery | `GET /work-orders/:id/pdf` -> `StreamableFile`, `Content-Disposition: attachment` (`work-orders.controller.ts:71`) | Same pattern for a new Surat Jalan endpoint. |

**Recommendation:** create `apps/api/src/modules/work-orders/equipment-delivery-note-pdf.ts` (or a dedicated module) reusing the shared helpers; extract `drawLetterhead` / `drawFooterAllPages` / `labelRow` from `work-order-pdf-spk.ts` into `work-order-pdf-shared.ts` first (pure refactor, but out of audit scope).

Layout authority: the physical **SURAT JALAN ALAT** hard copy (no file committed yet — the SPK sample is `apps/portal/public/SPK.jpeg`, WOL is `apps/portal/public/work-order.jpeg`). **OPEN:** the Surat Jalan hard-copy scan should be committed as the layout authority, matching the existing convention.

---

## 10. UI Placement

**Recommended:** an action + panel **inside the Work Order detail page**, visible only when `serviceMode === "ON_SITE"`.

`apps/portal/src/app/management/work-orders/[id]/page.tsx` already hosts the SPK PDF download. Add:

- **"Surat Jalan Alat" section** on that page:
  - Equipment picker: list `EquipmentType`s required (derived from the Work Order's jobs' `device.deviceTypeId` via `DeviceTypeEquipmentRequirement`), let the planner pick specific active `Equipment` units of each type (reuse `apps/portal/src/app/management/equipment-units/` query hooks).
  - "Issue Surat Jalan" button -> allocates `DLN`, freezes items.
  - Shows the `DLN` number and its link to the SPK number.
  - "Download PDF" / "Reissue" / "Cancel" actions.

**Not** a standalone top-level nav item (it has no meaning without its parent SPK). **Not** on `CalibrationJob` (equipment is per-visit, not per-device).

Consistency: mirrors how PO / quotation PDFs and the SPK live on their parent detail pages.

---

## 11. Missing Data / Blockers

### Hard blockers (must be resolved before implementation can proceed)

| # | Blocker | Detail | Fix shape |
| --- | --- | --- | --- |
| B1 | **No persistent link between `Equipment` units and a `WorkOrder`/SPK** | `DeviceTypeEquipmentRequirement` is `EquipmentType`-level; `JobReferenceEquipmentUsed` is free-text, per-`CalibrationJob`, post-hoc, no API. Nothing records "these specific PKM units travel with this SPK". | New `EquipmentDeliveryNote` + `EquipmentDeliveryNoteItem` (snapshot of `Equipment.equipmentType.name` / `brand` / `model` / `serialNumber` + FK to `Equipment`). |
| B2 | **`DocumentType` enum has no `EQUIPMENT_DELIVERY_NOTE`** | Numbering can't allocate a `DLN` series. | Enum + prefix-map (+ optional number-table) entry. Migration shape identical to `20260901120000`. |
| B3 | **No layout-authority artefact for the Surat Jalan** | SPK/WOL each have a committed hard-copy image; Surat Jalan does not. Field-level layout can't be finalised. | Commit the hard-copy scan to `apps/portal/public/`. |

### Soft gaps (workable, but decisions needed — see Section 12)

- No signatory **name** field (SPK prints title only — acceptable precedent).
- No global ordering rule for a multi-DeviceType equipment list (`sortOrder` is per-DeviceType).
- No "date of Surat Jalan" semantics (generation date vs departure date).
- `Equipment.brand` / `model` / `serialNumber` are all nullable — the PDF must tolerate blanks (SPK already does via `text()` helper).
- No validation that a selected `Equipment` unit is calibration-valid (`EquipmentCalibrationRecord`-derived) at the trip date — could be a warning, not a block.

---

## 12. Open Business Decisions

Items below genuinely cannot be derived from code or the hard copy.

1. **OPEN BUSINESS DECISION — Equipment selection source.**
   Should the Surat Jalan equipment list be (a) manually picked by a planner from `Equipment` units, (b) auto-proposed from `DeviceTypeEquipmentRequirement` of the Work Order's devices and then confirmed, or (c) fixed "standard kit" per technician/company? The requirements module gives *types*, not *units* — a human must choose units. Decision drives the picker UX and whether a "standard kit" entity is needed.

2. **OPEN BUSINESS DECISION — Surat Jalan date meaning.**
   Is the printed "Tanggal" the issue/generation date, or the planned departure/usage date (`WorkOrder.scheduledStart`)? The hard copy shows a single date without a label clarifying which.

3. **OPEN BUSINESS DECISION — Reissue vs edit after issuance.**
   If the equipment list changes after the Surat Jalan is issued (unit swapped, added), does PKM (a) reissue a new `DLN` and supersede, or (b) edit in place and reprint the same number? Affects immutability model and `EquipmentDeliveryNoteItem` history.

4. **OPEN BUSINESS DECISION — Cardinality per SPK.**
   Confirm exactly one active Surat Jalan per ON_SITE Work Order (recommended), vs allowing several (e.g. equipment delivered in multiple trips for a long engagement).

5. **OPEN BUSINESS DECISION — Signatory.**
   Who signs the Surat Jalan (role/title), and is a stored signatory **name** required, or is the SPK precedent (print title, wet-sign) acceptable? If a name is required, `Company` needs a signatory field (out of current scope).

6. **OPEN BUSINESS DECISION — Assignment ordering.**
   Must the carrying technician be assigned before the Surat Jalan can be issued? Recommended yes (so the PDF names them) but not code-enforced anywhere today.

7. **OPEN BUSINESS DECISION — Global row ordering.**
   When a Work Order covers multiple DeviceTypes, how is the single combined equipment table ordered (by `EquipmentType.name`? by first-referencing DeviceType's `sortOrder`? de-duplicated across types)?

8. **OPEN BUSINESS DECISION — Calibration-validity enforcement.**
   Should selecting an `Equipment` unit whose `EquipmentCalibrationRecord`-derived validity is expired at the trip date be blocked, warned, or ignored?

9. **OPEN BUSINESS DECISION — De-duplication.**
   If two devices on the same Work Order both require an "Electrical Safety Analyzer", does the Surat Jalan list the ESA once or once per device? (Physically the technician carries one.)

10. **OPEN BUSINESS DECISION — Relationship to `JobReferenceEquipmentUsed`.**
    Should issuing the Surat Jalan pre-populate each `CalibrationJob.referenceEquipmentUsed[]` with the carried units (as a default the technician later confirms/edits), or are the two lists kept fully independent? They describe the same physical instruments at different lifecycle points.

---

## 13. Minimal Implementation Plan (for a LATER change — not now)

### Phase D-0 — Confirm business decisions
Close Section 12 items 1–5 at minimum; commit the hard-copy scan (B3).

### Phase D-1 — Data / schema
- Add `DocumentType.EQUIPMENT_DELIVERY_NOTE` (enum migration, shape = `20260901120000`).
- New models:
  - `EquipmentDeliveryNote` — `id, companyId, workOrderId, number (nullable until issued), status (DRAFT|ISSUED|SUPERSEDED|CANCELLED), issuedAt, issuedByUserId?, supersedesId?/supersededById?, notes, timestamps`. Partial unique index: one non-`CANCELLED`/`SUPERSEDED` per `workOrderId` (SQL, like `WorkOrder_purchaseOrderId_active_key`).
  - `EquipmentDeliveryNoteItem` — `id, deliveryNoteId, equipmentId (FK, onDelete Restrict), equipmentName, brand, model, serialNumber (snapshot), sortOrder, createdAt`.
- Add `WorkOrder.equipmentDeliveryNotes[]` back-relation.
- Guard: only `serviceMode = ON_SITE`.

### Phase D-2 — Numbering
- `document-type-prefix.ts`: `EQUIPMENT_DELIVERY_NOTE: "DLN"`.
- `document-type-table.ts`: `EQUIPMENT_DELIVERY_NOTE: "EquipmentDeliveryNote"`.
- `document-number.service.test.ts`: add DLN allocation + yearly-reset + no-collision-with-SPK cases.

### Phase D-3 — API
- New module `equipment-delivery-notes` (or sub-routes under `work-orders`):
  - `GET /work-orders/:id/equipment-delivery-note` (current active + history)
  - `POST` create DRAFT / `PATCH` items while DRAFT
  - `POST :id/issue` — allocate `DLN` in a `prisma.$transaction`, freeze items
  - `POST :id/reissue`, `POST :id/cancel`
  - `GET :id/pdf` -> `StreamableFile` (attachment)
- Derivation helper: required `EquipmentType`s for a Work Order = distinct `deviceType.equipmentRequirements` across `workOrder.jobs[].device`.

### Phase D-4 — UI
- Section in `apps/portal/src/app/management/work-orders/[id]/page.tsx` (ON_SITE only): equipment picker, issue/reissue/cancel, DLN display, PDF download. Reuse `equipment-units` query hooks.

### Phase D-5 — PDF
- Refactor `drawLetterhead` / `drawFooterAllPages` / `labelRow` out of `work-order-pdf-spk.ts` into `work-order-pdf-shared.ts` (pure move).
- New `equipment-delivery-note-pdf.ts` using `pdfkit` + shared helpers; layout per committed hard-copy scan; header (company/logos/DLN/SPK ref/customer/location), body table (No/Nama Alat/Merk/Type/S-N), footer (usage period, statement, signatory title, blank signature, company block).

### Phase D-6 — Tests
- Service: create/issue/reissue/cancel, ON_SITE-only guard, transactional number allocation, item snapshot immutability after issue.
- PDF: snapshot/structure test alongside `work-order-pdf.test.ts` and `purchase-order-pdf.test.ts` patterns.
- Numbering: covered in D-2.

---

## 14. Scope Protection — what must NOT be changed

Per the audit brief, and confirmed by this analysis, the following are **out of scope for the audit** and must not be touched until the plan above is approved:

- ❌ Prisma schema (`WorkOrder`, `CalibrationJob`, `Equipment`, `EquipmentType`, `DeviceTypeEquipmentRequirement`, `JobReferenceEquipmentUsed`, `DeviceCalibrationParameter`, `Quotation`, `PurchaseOrder`, `CalibrationRequest`).
- ❌ `DocumentType` enum / any numbering migration.
- ❌ `DOCUMENT_TYPE_PREFIX`, `DOCUMENT_TYPE_NUMBER_TABLE`, `DocumentNumberService`, `formatDocumentNumber`.
- ❌ SPK / WOL renderers (`work-order-pdf*.ts`) and `renderWorkOrderPdf` dispatch.
- ❌ Work Order service/controller, assignment logic, `serviceMode` handling.
- ❌ Equipment Requirements module, Equipment module, Equipment Calibration Records module.
- ❌ Quotation / requisition / PO modules.
- ❌ Any portal UI.
- ❌ Any new API route.
- ❌ Any database record.
- ❌ PDF generation for Surat Jalan.

**No implementation changes have been made. This document is analysis only.**

---

## Appendix A — Key file references

| Concern | File |
| --- | --- |
| DocumentType enum | `packages/db/prisma/schema.prisma:218` |
| DocumentNumberSequence | `packages/db/prisma/schema.prisma:349` |
| Numbering service | `packages/db/src/document-number/document-number.service.ts` |
| Prefix map | `packages/db/src/document-number/document-type-prefix.ts` |
| Number-table map | `packages/db/src/document-number/document-type-table.ts` |
| Number format/validation | `packages/db/src/document-number/format-document-number.ts` |
| WorkOrder model | `packages/db/prisma/schema.prisma:1530` |
| WorkOrder number allocation | `apps/api/src/modules/work-orders/work-orders.service.ts:193` |
| WorkOrder PDF endpoint | `apps/api/src/modules/work-orders/work-orders.controller.ts:71` |
| PDF dispatch by serviceMode | `apps/api/src/modules/work-orders/work-order-pdf.ts` |
| SPK renderer (letterhead/footer/labelRow) | `apps/api/src/modules/work-orders/work-order-pdf-spk.ts` |
| Shared PDF helpers / logo resolution | `apps/api/src/modules/work-orders/work-order-pdf-shared.ts` |
| Equipment (PKM units) | `packages/db/prisma/schema.prisma:1015` |
| EquipmentType | `packages/db/prisma/schema.prisma:990` |
| EquipmentCalibrationRecord | `packages/db/prisma/schema.prisma:1058` |
| DeviceTypeEquipmentRequirement | `packages/db/prisma/schema.prisma:1094` |
| JobReferenceEquipmentUsed | `packages/db/prisma/schema.prisma:1659` |
| Device (customer equipment) | `packages/db/prisma/schema.prisma:1247` |
| Company (no signatory field) | `packages/db/prisma/schema.prisma:311` |
| Precedent enum migration | `packages/db/prisma/migrations/20260901120000_add_work_order_send_to_lab_to_document_type/migration.sql` |
| Portal WorkOrder detail page | `apps/portal/src/app/management/work-orders/[id]/page.tsx` |
| Portal Equipment units UI | `apps/portal/src/app/management/equipment-units/` |
