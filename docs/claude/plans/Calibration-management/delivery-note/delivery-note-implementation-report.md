# SURAT JALAN ALAT / DELIVERY NOTE (DLN) — IMPLEMENTATION REPORT

**Date:** 2026-09-01
**Spec:** `Delivery-Note-implementation.md` (same folder)
**Pre-work consumed:** `WorkOrderEquipment` (selection + confirmation + DnD ordering) — already implemented; see `workorder-equipment-audit-and-design.md`.

---

## Audit

### Existing document architecture

- `DocumentType` enum + `DocumentNumberService.allocate({ companyId, documentType, issuedAt, tx })` → `formatDocumentNumber(prefix, issuedAt, seq)` = `PRE/YYYY/MM/NNNNN`.
- `DocumentNumberSequence` keyed `@@unique([companyId, documentType, year])` → **one counter per company per type per year**; `MM` is display-only, **no monthly reset**. A new `documentType` gets an independent sequence for free.
- `DOCUMENT_TYPE_PREFIX` map (`packages/db/src/document-number/document-type-prefix.ts`), `DOCUMENT_TYPE_NUMBER_TABLE` map (backfill seed of `lastSequence` from `MAX(number)` for tables that store the string).
- Documents (`Quotation`, `PurchaseOrder`, `WorkOrder`, `Invoice`, `Certificate`, `CreditNote`) are header models with a `number String` + `@@unique([companyId, number])`; `WorkOrder` also snapshots child rows (`WorkOrderItem`).

### Existing PDF architecture

- `pdfkit`, one renderer per document. `work-order-pdf-shared.ts` exports `PKM_LETTERHEAD_ADDRESS_LINES`, `KAN_ACCREDITATION_CODE`, `resolvePkmLogoPath` / `resolveKanLogoPath` (resolve `logo.png` / `KAN-logo.png` from `apps/api/assets` or `../portal/public`), `formatDate`, `text`, `workOrderPdfFilename`.
- `renderSpkPdf` (`work-order-pdf-spk.ts`) is the layout authority for the PKM/KAN letterhead + all-pages footer + "Label : value" rows + title-only signature block. Route pattern: `GET /work-orders/:id/pdf` → `StreamableFile` `attachment`.

### Hard-copy field mapping (Surat Jalan Alat)

| Hard-copy field                                          | Source                                                                                                                                                                                   | Status                 |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| PKM identity / logo, KAN logo + `LK-521-IDN`             | `Company` + shared logo resolvers + `KAN_ACCREDITATION_CODE`                                                                                                                             | EXISTS                 |
| Document title "SURAT JALAN ALAT"                        | literal                                                                                                                                                                                  | EXISTS                 |
| DLN number                                               | new `EQUIPMENT_DELIVERY_NOTE` series via `DocumentNumberService`                                                                                                                         | DERIVABLE              |
| Date                                                     | `WorkOrder.scheduledStart` (scheduled on-site date = when equipment leaves PKM); falls back to issuance timestamp when null — snapshotted onto `EquipmentDeliveryNote.issuedAt`          | DERIVABLE              |
| Customer name / address                                  | `WorkOrder.customer.name` / `.address` — snapshotted                                                                                                                                     | EXISTS                 |
| Lokasi                                                   | `WorkOrder.addressText ?? customer.name` — snapshotted                                                                                                                                   | DERIVABLE              |
| Ref. SPK                                                 | `WorkOrder.number` — snapshotted as `workOrderNumber`                                                                                                                                    | EXISTS                 |
| Body: No / Nama Alat / Merk / Type-Model / Serial Number | `EquipmentDeliveryNoteItem` snapshot of `WorkOrderEquipment` → `equipment.equipmentType.name` / `equipment.brand` / `equipment.model` / `equipment.serialNumber`, ordered by `sortOrder` | EXISTS (snapshot)      |
| Footer statement                                         | fixed text drawn from the operational document                                                                                                                                           | EXISTS                 |
| Signature                                                | title-only ("Manager Teknis") + wet-signature space — same convention as SPK                                                                                                             | EXISTS (SPK precedent) |

### Open business decisions

- **DLN date:** implemented as `scheduledStart ?? issuanceTimestamp`. If the business wants a distinct "keluar gudang" date field on the WorkOrder, that is a follow-up — **OPEN**, non-blocking (the fallback is safe and derivable).
- **Reissue after a material equipment change post-issuance:** not supported. `workOrderId @unique` → exactly one DLN; issuance is idempotent; the snapshot is frozen. If a re-issued document is ever required after equipment changes, that is a deliberate future **OPEN BUSINESS DECISION** (needs a void/supersede model) — not invented here.
- **Signatory name:** none stored on `Company`/`User`; the PDF prints the title only, exactly as the SPK already does.

---

## Schema

Additive only. Migration `packages/db/prisma/migrations/20260901114658_add_equipment_delivery_note/`.

- `DocumentType` enum: **+`EQUIPMENT_DELIVERY_NOTE`** (`ALTER TYPE ... ADD VALUE`, same shape as the prior `WORK_ORDER_SEND_TO_LAB` migration).
- **`EquipmentDeliveryNote`** (header): `id, companyId, workOrderId @unique, number, issuedAt, workOrderNumber, customerName, customerAddress?, locationText?, createdAt, updatedAt`. `@@unique([companyId, number])`, `@@index([companyId])`. FKs: `company` cascade, `workOrder` cascade.
- **`EquipmentDeliveryNoteItem`** (immutable snapshot): `id, deliveryNoteId, equipmentId (plain reference, no FK), equipmentName, brand?, model?, serialNumber?, sortOrder, createdAt`. `@@index([deliveryNoteId])`, FK `deliveryNote` cascade.
- Back-relations: `WorkOrder.deliveryNote EquipmentDeliveryNote?`, `Company.equipmentDeliveryNotes[]`.
- **Unchanged:** `WorkOrder`, `WorkOrderEquipment`, `Equipment`, `EquipmentType`, `DeviceType`, `DeviceTypeEquipmentRequirement`, all other models/semantics.

## Numbering

- `DOCUMENT_TYPE_PREFIX`: `EQUIPMENT_DELIVERY_NOTE → "DLN"`.
- `DOCUMENT_TYPE_NUMBER_TABLE`: `EQUIPMENT_DELIVERY_NOTE → "EquipmentDeliveryNote"`.
- Allocation reuses `DocumentNumberService.allocate` verbatim inside the issuance transaction.
- **Sequence behaviour:** independent per `(companyId, EQUIPMENT_DELIVERY_NOTE, year)`; yearly, no monthly reset; `MM` display-only.
- **Examples (verified by test):** `DLN/2026/09/00001`, then `DLN/2026/09/00002`; SPK/WOL sequences unaffected.
- **Not modified:** `DocumentNumberService`, `formatDocumentNumber`, `DocumentNumberSequence`, SPK (`WORK_ORDER`) / WOL (`WORK_ORDER_SEND_TO_LAB`) prefixes or allocation.

## API

New controller `DeliveryNotesController` at `work-orders/:workOrderId/delivery-note`, service `DeliveryNotesService` — both registered in the existing `WorkOrdersModule`. No equipment-selection endpoint exists.

| Method | Route                                         | Permission         | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | --------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/work-orders/:workOrderId/delivery-note`     | `workOrder:update` | Issue. Transactional. Validations: WO exists + company scope (`WORK_ORDER_NOT_FOUND`), `serviceMode === ON_SITE` (`DELIVERY_NOTE_NOT_APPLICABLE_FOR_SEND_TO_LAB`), `equipmentConfirmedAt` set (`WORK_ORDER_EQUIPMENT_NOT_CONFIRMED`), ≥1 `WorkOrderEquipment` (`WORK_ORDER_EQUIPMENT_EMPTY`). Loads `WorkOrderEquipment` ordered by `sortOrder ASC`, allocates DLN, creates header + item snapshots atomically. **Idempotent** — if a DN exists it is returned unchanged (no new number); a `P2002` race also resolves to the existing winner. |
| `GET`  | `/work-orders/:workOrderId/delivery-note`     | `workOrder:read`   | The issued DN + ordered items, or 404 `DELIVERY_NOTE_NOT_FOUND`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GET`  | `/work-orders/:workOrderId/delivery-note/pdf` | `workOrder:read`   | `StreamableFile` (`application/pdf`, `attachment`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

- **Authorization:** `CompanyRoleGuard` + `@RequirePermission` on every route; company scope enforced in every query (`where: { …, companyId }`). No new RBAC resource or permission.
- `workOrderInclude` in `WorkOrdersService` now also includes `deliveryNote { items }`, so `GET /work-orders/:id` carries DN state for the UI (no extra fetch).

## UI

`apps/portal/src/app/management/work-orders/[id]/page.tsx` → new `<WorkOrderDeliveryNoteSection>` below the equipment section. **ON_SITE only** (returns `null` for SEND_TO_LAB).

- Not issued: status chip "Belum terbit"; a hint about confirming equipment first; **"Issue Delivery Note"** button (visible with `workOrderUpdate`), enabled only when `equipmentConfirmedAt` is set and equipment exists.
- Issued: status chip "Terbit"; shows DLN number, date, unit count; **"Cetak / Unduh PDF"** (opens the blob in a new tab, same pattern as `openWorkOrderPdf`). A reprint never allocates a new number.
- Reuses existing `Button`, chips, `formatDateTime`, `formatWorkOrderApiError`, loading/error patterns. New hooks: `useIssueDeliveryNote`, `openDeliveryNotePdf`.

## PDF

`apps/api/src/modules/work-orders/equipment-delivery-note-pdf.ts` — `renderEquipmentDeliveryNotePdf({ deliveryNote, company })`.

- **Engine/layout:** `pdfkit`, A4, Helvetica, same PKM/KAN letterhead + all-pages footer + title-only signature block as the SPK. Uses the shared constants/resolvers from `work-order-pdf-shared.ts`; the small `drawLetterhead` / `drawFooterAllPages` / `labelRow` helpers are self-contained in this file (the SPK file was not modified).
- **Data source:** exclusively the `EquipmentDeliveryNote` header + `EquipmentDeliveryNoteItem` snapshots passed in by the service — no live `WorkOrderEquipment` / `Equipment` read. Body table = `No / Nama Alat / Merk / Type-Model / Serial Number`, rows ordered by snapshot `sortOrder`.
- **Snapshot behaviour:** because every field is copied at issuance, editing the `Equipment` master afterwards cannot change the rendered document (test-verified).
- **Logos:** existing `apps/portal/public/logo.png` and `KAN-logo.png` via the shared resolvers — not replaced.

## Tests

Added to `apps/api/src/modules/work-orders/work-orders.service.test.ts` (`describe("WorkOrdersService reference equipment")`), reusing its fixtures. New: **11 Delivery Note cases** (+ 8 reorder + the earlier equipment cases in the same block):
issue for confirmed ON_SITE; SEND_TO_LAB blocked; unconfirmed blocked; empty-equipment blocked; equipment + order from `WorkOrderEquipment.sortOrder`; master fields snapshotted; idempotent reprint = same number & single row; two WOs get consecutive independent DLN numbers; SPK number untouched by issuance; cross-company rejected; master edit after issuance does not change the snapshot; `DeviceTypeEquipmentRequirement.findMany` **not** called during issuance (spy); PDF starts `%PDF-`, non-trivial size, `.pdf` filename, 3 ordered items.

**Results (local, `TEST_DATABASE_URL` set):**

- `pnpm --filter @medcal/api test -- work-orders.service` → **66 passed**.
- `pnpm --filter @medcal/api test -- work-order` → **72 passed** (2 files, incl. `work-order-pdf.test.ts`).
- `pnpm --filter @medcal/db test -- document-number` → **20 passed**.
- `pnpm --filter @medcal/portal test -- work-order` → **25 passed**.
- Full `pnpm --filter @medcal/api test` → 718 passed, **9 pre-existing failures** in `emails` / `chat` / `contact-messages` / `push-tokens` / `imap-sync` (timing / IMAP-mock / websocket / push-dispatch) — **verified failing on a clean `git stash` tree**, unrelated to this work.

## Verification

- **Typecheck:** `@medcal/api`, `@medcal/shared`, `@medcal/portal` **pass**. (`@medcal/web` has an unrelated pre-existing `@base-ui/react` resolution failure.)
- **Build:** `pnpm --filter @medcal/api build` **pass**; `pnpm --filter @medcal/portal build` **pass**.

## Scope Protection

Confirmed **unchanged**:

- SPK / WOL business rules, renderers (`work-order-pdf-spk.ts`, `work-order-pdf-wol.ts`, `renderWorkOrderPdf`), and numbering (`WORK_ORDER` / `WORK_ORDER_SEND_TO_LAB` prefixes, `DocumentNumberService`, `formatDocumentNumber`).
- `WorkOrderEquipment` selection logic (`replaceEquipment` / `confirmEquipment` / proposal) and the drag-and-drop reorder (`reorderEquipment`) — the DN only _reads_ the confirmed list.
- Equipment Requirements (`DeviceTypeEquipmentRequirement` + ordering), `Equipment` / `EquipmentType` master semantics, `DeviceType`, `DeviceCalibrationParameter`, `DeviceTypeCapabilityOrder`.
- Calibration Request, Requisition, Quotation, Price List, Purchase Order, `CalibrationJob`, technician-assignment semantics, `ServiceMode` semantics, the WorkOrder status model (no new status; issuance is gated on the existing `equipmentConfirmedAt`, not a status change).
- RBAC semantics — reused `workOrder:read` / `workOrder:update`, no new permission.

**Files changed by this task:** `packages/db/prisma/schema.prisma` (+2 models, +1 enum value, +2 back-relations), `packages/db/prisma/migrations/20260901114658_add_equipment_delivery_note/`, `packages/db/src/document-number/document-type-prefix.ts` (+1 line), `document-type-table.ts` (+1 line), `apps/api/src/modules/work-orders/{delivery-notes.service.ts, delivery-notes.controller.ts, equipment-delivery-note-pdf.ts}` (new), `work-orders.module.ts` (register), `work-orders.service.ts` (`workOrderInclude` +`deliveryNote`), `work-orders.service.test.ts`, `apps/portal/src/app/management/work-orders/{work-order-delivery-note-section.tsx (new), [id]/page.tsx, use-work-orders-query.ts, work-orders-ui.tsx}`.

**Not touched by this task (pre-existing uncommitted edits by another process, left as-is):** `apps/portal/src/app/management/{email/email-page-client.tsx, menu-management/page.tsx, users/[id]/page.tsx, whitelist/page.tsx}`.
