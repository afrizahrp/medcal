# Phase A — Discovery Notes

## 1. Planning Docs Inventory

| File | Description |
|------|-------------|
| `Comprehensive Audit Technician App & Portal Management App.md` | Prompt audit utama untuk Tech App & Portal Management, mencakup full lifecycle audit dari CalibrationRequest sampai Payment |
| `audit_before_customer_implementation.md` | Audit arsitektur Lead + Customer implementation, termasuk matching logic dan domain relationships |
| `Audit and design Purchase Order.md` | Desain dan audit PurchaseOrder/PurchaseOrderItem, termasuk posisi PO dalam lifecycle dan relasi ke Quotation/WorkOrder |
| `centralized-document-numbering-phase1-2.md` | Status implementasi DocumentNumberSequence — schema + service + tests sudah ada, format `PREFIX/YYYY/MM/NNNNN` |
| `Cursor_Phase_A_Discovery.md` | Prompt untuk Phase A Discovery (file ini adalah outputnya) |
| `Cursor_Phase_B_Domain_DeepDive.md` | Prompt untuk Phase B Domain Deep-Dive — audit per-stage lifecycle |
| `Cursor_Phase_C_CrossCutting.md` | Prompt untuk Phase C Cross-Cutting Audits — authorization, concurrency, financial consistency |
| `Cursor_Phase_D_Synthesis.md` | Prompt untuk Phase D Synthesis — merge semua phase ke final report |

## 2. apps/api Structure

```
apps/api/
├── src/
│   ├── app.module.ts
│   ├── bootstrap-superadmin.ts
│   ├── health.controller.ts
│   ├── main.ts
│   ├── common/
│   │   ├── sort-query.ts (2 files)
│   │   ├── decorators/ (4 files)
│   │   └── guards/ (2 files)
│   └── modules/
│       ├── chat/ (11 files)
│       ├── contact-messages/ (10 files)
│       ├── customers/ (5 files)
│       ├── emails/ (12 files)
│       ├── leads/ (6 files)
│       ├── me/ (3 files)
│       ├── menu/ (4 files)
│       ├── permissions/ (4 files)
│       ├── push-tokens/ (10 files)
│       ├── users/ (4 files)
│       └── whitelist/ (9 files)
├── Dockerfile
├── package.json
├── tsconfig.json
├── vitest.config.mts
└── vitest.setup.ts
```

**Notes:**
- NestJS backend dengan modular structure
- Modules yang ada: chat, contact-messages, customers, emails, leads, me, menu, permissions, push-tokens, users, whitelist
- **TIDAK ADA module untuk**: calibration-request, quotation, purchase-order, work-order, invoice, payment, certificate, calibration-job

## 3. apps/portal Structure

```
apps/portal/
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── providers.tsx
│   │   ├── client/ (2 files)
│   │   ├── firebase-messaging-sw.js/ (1 file)
│   │   ├── sign-in/ (2 files)
│   │   │   └── register/ (1 file)
│   │   └── management/ (3 files)
│   │       ├── chat/ (2 files)
│   │       │   └── [sessionId]/ (0 files)
│   │       ├── customers/ (7 files)
│   │       │   ├── new/ (1 file)
│   │       │   └── [id]/ (0 files)
│   │       ├── email/ (4 files)
│   │       │   ├── compose/ (2 files)
│   │       │   ├── drafts/ (1 file)
│   │       │   ├── inbox/ (1 file)
│   │       │   ├── sent/ (1 file)
│   │       │   ├── trash/ (1 file)
│   │       │   └── [id]/ (0 files)
│   │       ├── leads/ (4 files)
│   │       │   └── [id]/ (0 files)
│   │       ├── menu-management/ (2 files)
│   │       │   ├── new/ (1 file)
│   │       │   └── [id]/ (0 files)
│   │       ├── permission-management/ (1 file)
│   │       ├── users/ (1 file)
│   │       │   ├── assign/ (1 file)
│   │       │   └── [id]/ (0 files)
│   │       └── whitelist/ (1 file)
│   ├── components/
│   ├── hooks/
│   └── lib/
├── public/
├── next.config.js
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

**Notes:**
- Next.js app dengan App Router
- Management routes yang ada: chat, customers, email, leads, menu-management, permission-management, users, whitelist
- **TIDAK ADA route untuk**: calibration-request, quotation, purchase-order, work-order, invoice, payment, certificate

## 4. apps/tech-pwa Structure

```
apps/tech-pwa/
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── providers.tsx
│   │   ├── firebase-messaging-sw.js/ (1 file)
│   │   └── sign-in/ (1 file)
│   ├── components/
│   │   └── sign-out-button.tsx
│   └── lib/
│       └── fcm/
├── public/
│   ├── manifest.webmanifest
│   └── short-logo.png
├── next.config.js
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

**Notes:**
- Next.js PWA, sangat minimal
- Hanya ada: landing page, sign-in, sign-out button, FCM integration
- **TIDAK ADA route untuk**: work-order list, work-order detail, calibration-job execution, measurement recording, evidence upload, signature capture, job submission

## 5. documentNumberingSequence Occurrences

### Prisma Schema Model

| File | Line | Content |
|------|------|---------|
| `packages/db/prisma/schema.prisma` | 212-218 | `enum DocumentType { CUSTOMER, CALIBRATION_REQUEST, QUOTATION, PURCHASE_ORDER, WORK_ORDER }` |
| `packages/db/prisma/schema.prisma` | 309 | `documentNumberSequences DocumentNumberSequence[]` (relation di Company) |
| `packages/db/prisma/schema.prisma` | 312-326 | Model `DocumentNumberSequence` dengan fields: id, companyId, documentType, prefix, year, lastSequence |

### Service Implementation

| File | Line | Content |
|------|------|---------|
| `packages/db/src/document-number/document-number.service.ts` | 43 | `export class DocumentNumberService` |
| `packages/db/src/document-number/document-number.service.ts` | 56-78 | SQL INSERT ... ON CONFLICT DO UPDATE untuk atomic allocation |
| `packages/db/src/document-number/index.ts` | 1 | Export `DocumentNumberService` |

### Consumers (Callers)

| File | Line | Content |
|------|------|---------|
| `apps/api/src/modules/customers/customers.service.ts` | 2 | `import { DocumentNumberService, prisma } from "@medcal/db"` |
| `apps/api/src/modules/customers/customers.service.ts` | 52 | `const number = await DocumentNumberService.allocate({...})` |

### Tests

| File | Line | Content |
|------|------|---------|
| `packages/db/src/document-number/document-number.service.test.ts` | 4-201 | Full test suite: year reset, month transition, tenant isolation, concurrency |
| `apps/api/src/modules/customers/customers.service.test.ts` | 231 | Test: "uses DocumentNumberService with company-scoped sequence" |

**Notes:**
- DocumentNumberService hanya di-wire ke Customer creation saat ini
- Enum DocumentType sudah include CALIBRATION_REQUEST, QUOTATION, PURCHASE_ORDER, WORK_ORDER
- Invoice dan Payment TIDAK ada di enum DocumentType

## 6. Relevant Prisma Models Found

| Model | File | Line | Description |
|-------|------|------|-------------|
| `Customer` | `packages/db/prisma/schema.prisma` | 783-817 | Customer master data dengan companyId, number, name, legalName, taxId, address, contacts. Relasi ke devices, calibrationRequests, quotations, purchaseOrders, workOrders, certificates, invoices |
| `CalibrationRequest` | `packages/db/prisma/schema.prisma` | 867-890 | Request kalibrasi dengan customerId, leadId, serviceMode, status enum (DRAFT→FULFILLED). Relasi ke items dan quotations |
| `CalibrationRequestItem` | `packages/db/prisma/schema.prisma` | 892-904 | Line items dari CalibrationRequest, relasi ke Device dan QuotationItem |
| `Quotation` | `packages/db/prisma/schema.prisma` | 929-960 | Penawaran harga dengan status enum (DRAFT→CANCELLED), subtotal/tax/total, relasi ke request, items, purchaseOrders, workOrders |
| `QuotationItem` | `packages/db/prisma/schema.prisma` | 963-982 | Line items Quotation dengan device, tariff, qty, unitPrice, lineTotal |
| `PurchaseOrder` | `packages/db/prisma/schema.prisma` | 985-1019 | PO customer dengan customerPoNumber, status enum (DRAFT→CANCELLED), tax snapshot, discount. Relasi ke quotation, items, workOrders |
| `PurchaseOrderItem` | `packages/db/prisma/schema.prisma` | 1021-1047 | Line items PO dengan status enum per-item (OPEN→CANCELLED), discount, relasi ke workOrder |
| `WorkOrder` | `packages/db/prisma/schema.prisma` | 1049-1079 | SPK dengan status enum (PLANNED→CANCELLED), serviceMode, schedule, geo coordinates. Relasi ke quotation, purchaseOrder, assignments, jobs |
| `WorkOrderAssignment` | `packages/db/prisma/schema.prisma` | 1081-1094 | Assignment technician ke WorkOrder dengan roleOnJob (LEAD/ASSIST) |
| `CalibrationJob` | `packages/db/prisma/schema.prisma` | 1100-1124 | Job per device dalam WorkOrder, status enum (PENDING→ACCEPTED_BY_QA). Relasi ke results, evidences, signature, reviews, certificate |
| `MeasurementResult` | `packages/db/prisma/schema.prisma` | 1126-1138 | Hasil pengukuran kalibrasi dengan payloadJson dan summaryJson |
| `JobEvidence` | `packages/db/prisma/schema.prisma` | 1140-1152 | Foto/dokumen evidence dari CalibrationJob |
| `CustomerSignature` | `packages/db/prisma/schema.prisma` | 1154-1165 | Tanda tangan customer setelah kalibrasi selesai |
| `QualityReview` | `packages/db/prisma/schema.prisma` | 1167-1185 | QA review dengan decision (APPROVE/REJECT), status enum |
| `Certificate` | `packages/db/prisma/schema.prisma` | 1191-1228 | Sertifikat kalibrasi dengan status, billingStatus, validUntil, PDF file |
| `Invoice` | `packages/db/prisma/schema.prisma` | 1252-1281 | Faktur dengan status enum (DRAFT→VOID), subtotal/tax/total, relasi ke certificates, items, payments |
| `InvoiceItem` | `packages/db/prisma/schema.prisma` | 1297-1312 | Line items Invoice dengan optional certificate link |
| `Payment` | `packages/db/prisma/schema.prisma` | 1314-1329 | Pembayaran dengan method enum (TRANSFER/CASH/OTHER), amount, reference |
| `CreditNote` | `packages/db/prisma/schema.prisma` | 1331-1354 | Credit note dengan status enum, relasi ke invoice dan certificate |
| `DocumentNumberSequence` | `packages/db/prisma/schema.prisma` | 312-326 | Sequence numbering per company/documentType/year |

## 7. Not Found / Possibly Missing

### API Modules (apps/api/src/modules/)

| Expected Module | Status | Notes |
|-----------------|--------|-------|
| `calibration-requests/` | NOT FOUND | Tidak ada CRUD, status transitions, atau numbering wiring |
| `quotations/` | NOT FOUND | Tidak ada CRUD, pricing calculations, atau approval flow |
| `purchase-orders/` | NOT FOUND | Tidak ada CRUD, PO confirmation, atau item allocation |
| `work-orders/` | NOT FOUND | Tidak ada CRUD, technician assignment, atau scheduling |
| `calibration-jobs/` | NOT FOUND | Tidak ada job execution, measurement recording, atau submission |
| `certificates/` | NOT FOUND | Tidak ada certificate generation, QA review, atau PDF generation |
| `invoices/` | NOT FOUND | Tidak ada invoice creation, status tracking, atau payment allocation |
| `payments/` | NOT FOUND | Tidak ada payment recording atau reconciliation |
| `service-tariffs/` | NOT FOUND | Tidak ada tariff management |
| `taxes/` | NOT FOUND | Tidak ada tax rate management |

### Portal Routes (apps/portal/src/app/management/)

| Expected Route | Status | Notes |
|----------------|--------|-------|
| `calibration-requests/` | NOT FOUND | Tidak ada list, create, atau detail view |
| `quotations/` | NOT FOUND | Tidak ada quotation management UI |
| `purchase-orders/` | NOT FOUND | Tidak ada PO management UI |
| `work-orders/` | NOT FOUND | Tidak ada SPK management UI |
| `certificates/` | NOT FOUND | Tidak ada certificate management UI |
| `invoices/` | NOT FOUND | Tidak ada invoice management UI |
| `payments/` | NOT FOUND | Tidak ada payment recording UI |
| `service-tariffs/` | NOT FOUND | Tidak ada tariff management UI |

### Tech-PWA Routes (apps/tech-pwa/src/app/)

| Expected Route | Status | Notes |
|----------------|--------|-------|
| `work-orders/` | NOT FOUND | Tidak ada assigned work order list untuk technician |
| `jobs/` atau `calibration/` | NOT FOUND | Tidak ada job execution interface |
| `measurements/` | NOT FOUND | Tidak ada measurement recording form |
| `evidence/` | NOT FOUND | Tidak ada photo/document upload |
| `signature/` | NOT FOUND | Tidak ada customer signature capture |

### DocumentNumberService Wiring

| Document Type | Enum Present | Service Wired | Notes |
|---------------|--------------|---------------|-------|
| CUSTOMER | Yes | Yes | Fully implemented di customers.service.ts |
| CALIBRATION_REQUEST | Yes | NO | Enum ada, tapi tidak ada caller |
| QUOTATION | Yes | NO | Enum ada, tapi tidak ada caller |
| PURCHASE_ORDER | Yes | NO | Enum ada, tapi tidak ada caller |
| WORK_ORDER | Yes | NO | Enum ada, tapi tidak ada caller |
| INVOICE | NO | NO | Tidak ada di enum DocumentType |
| PAYMENT | NO | NO | Tidak ada di enum DocumentType |
| CERTIFICATE | NO | NO | Tidak ada di enum DocumentType |
| CREDIT_NOTE | NO | NO | Tidak ada di enum DocumentType |

## Commands I Could NOT Run (and why)

| Command | Reason Skipped |
|---------|----------------|
| `prisma migrate` | Writes to database — violates read-only mode |
| `prisma generate` | Generates client code — violates read-only mode |
| `npm install` / `pnpm install` | Modifies node_modules — violates read-only mode |
| `git add` / `git commit` | Modifies git state — violates read-only mode |
| `npx ts-node` untuk trace imports | Could execute arbitrary code — uncertain if read-only |

---

*Generated by Phase A Discovery audit — mapping only, no analysis or recommendations.*
