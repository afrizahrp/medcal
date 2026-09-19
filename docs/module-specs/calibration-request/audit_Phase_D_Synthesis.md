# Audit Report: Technician App & Portal Management App — E2E Lifecycle

## Verdict: RED

**Justification:** Terdapat **4 Foundation Issue Blockers** (B1-B4) yang memenuhi kriteria RED verdict per audit rules — RED = 1+ findings dengan Classification "Foundation Issue" AND MVP Relevance "Blocker-for-MVP".

**Blockers yang ada:**
1. **[B1] DOCUMENT_TYPE_NUMBER_TABLE incomplete** — missing PURCHASE_ORDER, WORK_ORDER mappings akan menyebabkan numbering sequence dimulai dari 1, potentially causing duplicate numbers (Evidence: `packages/db/src/document-number/document-type-table.ts:4-8`)
2. **[B2] DocumentType enum incomplete** — INVOICE, CERTIFICATE, CREDIT_NOTE tidak ada di enum, memblokir document numbering untuk module-module tersebut (Evidence: `packages/db/prisma/schema.prisma:212-218`)
3. **[B3] Permission catalog incomplete** — tidak ada resource untuk calibration lifecycle, memblokir RBAC enforcement (Evidence: `packages/auth/src/access-control.ts:40-62`)
4. **[B4] WorkOrder schema dependency** — WorkOrder.purchaseOrderId harus ditambahkan sebelum building WorkOrder module (Evidence: `Audit and design Purchase Order.md:546`)

**Practical severity note:** Meskipun verdict RED, perlu dicatat bahwa practical severity dari blockers ini tempered by: (a) fixes straightforward dan well-defined, (b) beberapa stage dapat proceed setelah fix minimal, (c) tidak ada architectural rework required. Blockers ini bukan architectural flaws, melainkan incomplete extensions dari foundation yang sudah sound.

---

## Not Yet Built (Expected — Informational Only)

*Items di bawah ini adalah modul yang memang diketahui belum diimplementasi. Ini BUKAN defects dan TIDAK mempengaruhi verdict.*

| Stage | Not Built Components |
|-------|---------------------|
| CalibrationRequest | API module, service, controller, portal UI, validation |
| Quotation | API module, pricing logic, approval workflow, portal UI |
| PurchaseOrder | API module, PO confirmation, item allocation, portal UI |
| WorkOrder | API module, technician assignment, scheduling, portal UI |
| CalibrationJob | Tech-PWA routes: job list, execution, measurement recording, evidence upload, signature capture, submission |
| Invoice | API module, creation logic, status tracking, payment allocation, portal UI |
| Payment | API module, recording, reconciliation, portal UI |
| Certificate | API module, QA review, PDF generation, portal UI |
| CreditNote | API module, creation logic, portal UI |
| Service Tariffs | API module, tariff management, portal UI |

---

## 1. Numbering Architecture (documentNumberingSequence)

### Current State

- **Schema:** `DocumentNumberSequence` model ada di `packages/db/prisma/schema.prisma:312-326` dengan fields: id, companyId, documentType, prefix, year, lastSequence
- **Service:** `DocumentNumberService` di `packages/db/src/document-number/document-number.service.ts:43` menggunakan atomic SQL INSERT...ON CONFLICT DO UPDATE (line 55-81) untuk concurrency safety
- **Format:** `PREFIX/YYYY/MM/NNNNN` (documented in `centralized-document-numbering-phase1-2.md`)
- **Working Implementation:** Customer creation di `apps/api/src/modules/customers/customers.service.ts:52` successfully uses `DocumentNumberService.allocate()`

### DocumentType Enum Coverage

| Document Type | Enum Present | Prefix Mapped | Table Mapped | Status |
|---------------|--------------|---------------|--------------|--------|
| CUSTOMER | ✅ Yes | ✅ Yes | ✅ Yes | **Working** |
| CALIBRATION_REQUEST | ✅ Yes | ✅ Yes | ✅ Yes | Ready |
| QUOTATION | ✅ Yes | ✅ Yes | ✅ Yes | Ready |
| PURCHASE_ORDER | ✅ Yes | ✅ Yes | ❌ **Missing** | **Blocker** |
| WORK_ORDER | ✅ Yes | ✅ Yes | ❌ **Missing** | **Blocker** |
| INVOICE | ❌ **Missing** | ❌ Missing | ❌ Missing | **Blocker** |
| CERTIFICATE | ❌ **Missing** | ❌ Missing | ❌ Missing | **Blocker** |
| CREDIT_NOTE | ❌ **Missing** | ❌ Missing | ❌ Missing | **Blocker** |

### Type Safety Issue

`DOCUMENT_TYPE_NUMBER_TABLE` uses `Partial<Record<DocumentType, string>>` (unsafe) while `DOCUMENT_TYPE_PREFIX` uses `Record<DocumentType, string>` (safe). The Partial type allows enum members to be silently omitted without compiler error.

Evidence: `packages/db/src/document-number/document-type-table.ts:4` vs `packages/db/src/document-number/document-type-prefix.ts:4`

---

## 2. Document Lifecycle & Relationships

### Lifecycle Flow (from Planning Docs)

```
Lead → Customer → CalibrationRequest → Quotation → PurchaseOrder → WorkOrder → CalibrationJob → Certificate → Invoice → Payment
```

### Relationship Mapping (from Prisma Schema)

| Parent Entity | Child Entity | FK Field | Cardinality |
|---------------|--------------|----------|-------------|
| Customer | CalibrationRequest | customerId | 1:N |
| CalibrationRequest | CalibrationRequestItem | calibrationRequestId | 1:N |
| CalibrationRequest | Quotation | calibrationRequestId | 1:N |
| Quotation | QuotationItem | quotationId | 1:N |
| Quotation | PurchaseOrder | quotationId | 1:N |
| PurchaseOrder | PurchaseOrderItem | purchaseOrderId | 1:N |
| PurchaseOrder | WorkOrder | purchaseOrderId | 1:N (optional today) |
| Quotation | WorkOrder | quotationId | 1:N (required today) |
| WorkOrder | WorkOrderAssignment | workOrderId | 1:N |
| WorkOrder | CalibrationJob | workOrderId | 1:N |
| CalibrationJob | MeasurementResult | calibrationJobId | 1:N |
| CalibrationJob | JobEvidence | calibrationJobId | 1:N |
| CalibrationJob | CustomerSignature | calibrationJobId | 1:1 |
| CalibrationJob | QualityReview | calibrationJobId | 1:N |
| CalibrationJob | Certificate | calibrationJobId | 1:1 |
| Invoice | InvoiceItem | invoiceId | 1:N |
| Invoice | Payment | invoiceId | 1:N |
| Invoice | CreditNote | invoiceId | 1:N |
| Certificate | InvoiceItem | certificateId | N:1 (optional) |

### Key Design Decisions

- **Device-centric job tracking:** CalibrationJob unique per `[workOrderId, deviceId]` — enables partial completion tracking per device
- **Certificate-centric billing:** `Certificate.billingStatus` (UNBILLED/BILLABLE/INVOICED) enables partial invoicing
- **Snapshot approach for PO:** `taxRateSnapshot` preserves historical tax rate at PO creation time

---

## 3. State Machine Audit

### Status Enums Defined in Schema

| Entity | Status Enum | Values |
|--------|-------------|--------|
| CalibrationRequest | CalibrationRequestStatus | DRAFT → IN_QUOTATION → QUOTED → ACCEPTED → IN_PROGRESS → FULFILLED → CANCELLED |
| Quotation | QuotationStatus | DRAFT → SUBMITTED → APPROVED → REJECTED → ACCEPTED → EXPIRED → CANCELLED |
| PurchaseOrder | PurchaseOrderStatus | DRAFT → RECEIVED → CONFIRMED → FULFILLED → CANCELLED |
| WorkOrder | WorkOrderStatus | PLANNED → SCHEDULED → DISPATCHED → IN_PROGRESS → TECHNICALLY_DONE → CLOSED → CANCELLED |
| CalibrationJob | CalibrationJobStatus | PENDING → IN_PROGRESS → SUBMITTED → REWORK → ACCEPTED_BY_QA |
| Invoice | InvoiceStatus | DRAFT → ISSUED → PARTIALLY_PAID → PAID → VOID |
| QualityReview | QualityReviewStatus | PENDING → APPROVED → REJECTED |
| Certificate | CertificateStatus | PENDING_QA → APPROVED → REJECTED |
| CreditNote | CreditNoteStatus | DRAFT → ISSUED → VOID |

### Transition Validation: NOT BUILT

No backend enforcement exists for valid status transitions. All calibration lifecycle modules have status enums in schema but zero guard logic. Status can be set to any value via direct update.

Evidence: Grep for `transition|status.*=` in `apps/api/src/modules/` shows only direct assignment patterns.

---

## 4. Technician App (apps/tech-pwa) Audit

### Current State: Minimal Shell

```
apps/tech-pwa/src/app/
├── layout.tsx
├── page.tsx (landing page only)
├── providers.tsx
├── globals.css
├── firebase-messaging-sw.js/
└── sign-in/
```

### Implemented

- ✅ PWA manifest (`public/manifest.webmanifest`)
- ✅ Firebase Cloud Messaging integration (`src/lib/fcm/`)
- ✅ Sign-in page with authentication
- ✅ Sign-out button component

### Not Implemented (Expected)

| Feature | Status | Required For |
|---------|--------|--------------|
| Assigned WorkOrder list | Not built | Technician sees their scheduled jobs |
| WorkOrder detail view | Not built | View customer, location, devices |
| CalibrationJob execution | Not built | Start/complete individual device calibrations |
| Measurement recording form | Not built | Capture calibration data points |
| Evidence upload (photos) | Not built | Document calibration process |
| Customer signature capture | Not built | On-site completion acknowledgment |
| Job submission | Not built | Submit completed work for QA |
| Offline capability | Not built | Work in areas without connectivity |

---

## 5. Portal Management App (apps/portal) Audit

### Current State: Customer/Lead Management Live

```
apps/portal/src/app/management/
├── customers/ (7 files) ✅ Live
├── leads/ (4 files) ✅ Live
├── chat/ (2 files) ✅ Live
├── email/ (4 files) ✅ Live
├── users/ ✅ Live
├── whitelist/ ✅ Live
├── menu-management/ ✅ Live
├── permission-management/ ✅ Live
└── [calibration lifecycle routes] ❌ Not Built
```

### Not Implemented (Expected)

| Route | Status | Purpose |
|-------|--------|---------|
| calibration-requests/ | Not built | Create, list, manage calibration requests |
| quotations/ | Not built | Create quotes, pricing, approval workflow |
| purchase-orders/ | Not built | PO confirmation, item tracking |
| work-orders/ | Not built | Scheduling, technician assignment |
| certificates/ | Not built | QA review, approval, PDF generation |
| invoices/ | Not built | Invoice creation, status tracking |
| payments/ | Not built | Payment recording, reconciliation |
| service-tariffs/ | Not built | Tariff/pricing management |

---

## 6. API & Backend Boundary Audit (apps/api)

### Current Modules

```
apps/api/src/modules/
├── customers/ ✅ Full CRUD + numbering
├── leads/ ✅ Full CRUD + conversion
├── chat/ ✅ Messaging
├── contact-messages/ ✅ Public form handling
├── emails/ ✅ Email integration
├── me/ ✅ Current user profile
├── menu/ ✅ Dynamic menu
├── permissions/ ✅ RBAC management
├── push-tokens/ ✅ FCM tokens
├── users/ ✅ User management
└── whitelist/ ✅ Registration gate
```

### Positive Patterns Found

1. **Transaction usage:** Customer creation wraps duplicate checking, number allocation, and entity creation in single transaction (`customers.service.ts:96`)
2. **Atomic numbering:** DocumentNumberService uses INSERT...ON CONFLICT DO UPDATE for race-condition safety (`document-number.service.ts:55-81`)
3. **Lead conversion atomicity:** Lead-to-Customer conversion uses transaction (`leads.service.ts:229`)
4. **Shared validation:** @medcal/shared exports Zod schemas used by both frontend and backend

### Not Implemented Modules (Expected)

| Module | Purpose | Depends On |
|--------|---------|------------|
| calibration-requests | Request CRUD, status transitions | customers, devices |
| quotations | Quote creation, pricing, approval | calibration-requests |
| purchase-orders | PO confirmation, item allocation | quotations |
| work-orders | Scheduling, assignment | purchase-orders |
| calibration-jobs | Execution, measurement, submission | work-orders |
| certificates | QA review, generation | calibration-jobs |
| invoices | Billing, status tracking | certificates |
| payments | Recording, allocation | invoices |

---

## 7. Database/Domain Model Audit (Prisma)

### Schema Completeness

All lifecycle entities are defined in `packages/db/prisma/schema.prisma`:

| Model | Lines | Key Fields | Status |
|-------|-------|------------|--------|
| CalibrationRequest | 867-890 | number, customerId, status, serviceMode | Schema ready |
| CalibrationRequestItem | 892-904 | requestId, deviceId | Schema ready |
| Quotation | 929-960 | number, subtotal, tax, total, status | Schema ready |
| QuotationItem | 963-982 | quotationId, deviceId, tariffId, qty, price | Schema ready |
| PurchaseOrder | 985-1019 | number, customerPoNumber, taxRateSnapshot | Schema ready |
| PurchaseOrderItem | 1021-1047 | status per item, discounts | Schema ready |
| WorkOrder | 1049-1079 | number, schedule, geo coordinates | Schema ready |
| WorkOrderAssignment | 1081-1094 | userId, roleOnJob (LEAD/ASSIST) | Schema ready |
| CalibrationJob | 1100-1124 | status, unique [workOrderId, deviceId] | Schema ready |
| MeasurementResult | 1126-1138 | payloadJson, summaryJson | Schema ready |
| JobEvidence | 1140-1152 | fileUrl, type | Schema ready |
| CustomerSignature | 1154-1165 | signatureImageUrl, signedAt | Schema ready |
| QualityReview | 1167-1185 | decision, notes, status | Schema ready |
| Certificate | 1191-1228 | number, billingStatus, validUntil, pdfFileUrl | Schema ready |
| Invoice | 1252-1281 | number, subtotal, tax, total, status | Schema ready |
| InvoiceItem | 1297-1312 | certificateId (optional) | Schema ready |
| Payment | 1314-1329 | method, amount, reference | Schema ready |
| CreditNote | 1331-1354 | number, status | Schema ready |

### Decimal Precision

| Field Type | Precision | Usage |
|------------|-----------|-------|
| Amounts (subtotal, total, etc.) | Decimal(18, 2) | 2 decimal places |
| Quantities | Decimal(18, 4) | 4 decimal places |
| Tax rates | Decimal(5, 4) | Percentage with 4 decimals |

---

## 8. Authorization & Company-Scoping Consistency

### Positive: companyId Source

`CompanyRoleGuard` correctly sources companyId from `process.env.COMPANY_ID`, never trusting client input.

Evidence: `apps/api/src/common/guards/company-role.guard.ts:34`

### Permission Catalog Gap

Current catalog (`packages/auth/src/access-control.ts:40-62`) covers:
- ✅ contactMessage, whitelist, lead, customer, chat, users, membership, menu, managementDashboard, customerDashboard, email, permission, notification

Missing:
- ❌ calibrationRequest, quotation, purchaseOrder, workOrder, calibrationJob, certificate, invoice, payment

### companyId Fields Without FK

Some child entities have denormalized `companyId String` without FK to Company:
- QuotationItem
- InvoiceItem
- Payment
- WorkOrderAssignment
- CalibrationRequestItem

Evidence: Phase B notes, confirmed via schema inspection.

---

## 9. Financial Consistency

### Calculation Formulas (from Planning Docs)

Per `Audit and design Purchase Order.md:376-399`:

```
grossLine = qty × unitPrice
lineTotal = grossLine - discountAmount
subtotal = SUM(lineTotal)
taxableAmount = subtotal - headerDiscountAmount
taxAmount = taxableAmount × taxRateSnapshot
totalAmount = taxableAmount + taxAmount
```

### Partial Invoicing Support

Schema supports partial invoicing via `Certificate.billingStatus`:
- UNBILLED → BILLABLE → INVOICED

A WorkOrder with 5 CalibrationJobs can have certificates billed across multiple invoices.

Evidence: `packages/db/prisma/schema.prisma:185-189`

### Rounding Rules Gap

No explicit rounding rule documentation found. Decimal(18,2) implies 2 decimal places for amounts, but HALF_UP vs other rounding modes not specified.

---

## 10. Frontend/Backend Contract Consistency

### Shared Schema Pattern

@medcal/shared exports Zod validation schemas used by both frontend and backend:
- `customerCreateSchema`
- `customerListQuerySchema`
- etc.

Evidence: `packages/shared/src/`

When building new lifecycle modules, continue this pattern — define schemas in @medcal/shared and import in both API controllers and frontend forms.

### No Calibration Lifecycle DTOs Yet

No frontend/backend contract defined for calibration lifecycle entities because modules not built.

---

## 11. Deployment/Routing Boundary Notes

### Current Architecture

| App | Technology | Deployment | URL/Status |
|-----|------------|------------|------------|
| apps/api | NestJS | Docker (`apps/api/Dockerfile`) | Shared backend for all frontends |
| apps/portal | Next.js App Router | Standard Next.js deployment | **Live:** apps.kalibrasimedika.co.id |
| apps/tech-pwa | Next.js PWA | PWA with manifest | Subdomain registered, nginx/TLS deferred to production |
| apps/web | Next.js (public site) | Standard Next.js | Public marketing site |
| apps/web-api | Hono (public API) | Edge/serverless compatible | Public contact form API |

### Shared Backend Architecture

- `apps/api` serves as the single backend for both Portal and Tech-PWA
- All calibration lifecycle API endpoints will be in `apps/api`
- Authentication via shared Firebase Auth across all apps

### Single-Tenant Context

- `companyId` from `.env.COMPANY_ID`
- Single currency (IDR)
- Customer-facing portal out of scope for this audit

### Business-Logic Duplication Risk

**None observed** — Calibration lifecycle UI does not exist in either Portal or Tech-PWA currently. When built:
- Portal will handle management workflows (create requests, quotes, POs, invoices)
- Tech-PWA will handle technician workflows (view assigned work orders, execute jobs, capture signatures)
- These are complementary, non-overlapping responsibilities with no duplication risk

---

## 12. Implementation Sequence Risk

### Recommended Build Order

```
1. [Foundation Fix] Add PURCHASE_ORDER, WORK_ORDER to DOCUMENT_TYPE_NUMBER_TABLE
2. [Foundation Fix] Add INVOICE, CERTIFICATE, CREDIT_NOTE to DocumentType enum + mappings
3. [Foundation Fix] Add permission resources to catalog per module

Then modules:
4. CalibrationRequest → 5. Quotation → 6. PurchaseOrder → 7. WorkOrder
8. CalibrationJob (Tech-PWA) → 9. Certificate → 10. Invoice → 11. Payment
```

### Dependency Graph

```
CalibrationRequest ──────────────────────────────┐
                                                 ↓
                                            Quotation
                                                 ↓
                                          PurchaseOrder
                                                 ↓
                                            WorkOrder
                                                 ↓
                                          CalibrationJob
                                                 ↓
                                           Certificate
                                                 ↓
                                             Invoice
                                                 ↓
                                             Payment
```

---

## 13. Documentation Gaps / Contradictions

### [Doc Gap 1] PurchaseOrderStatus Enum — Planning vs Schema

- **Planning doc** (`Audit and design Purchase Order.md:181`): `DRAFT | RECEIVED | CONFIRMED | IN_FULFILLMENT | PARTIALLY_FULFILLED | FULFILLED | CANCELLED`
- **Actual schema** (`packages/db/prisma/schema.prisma:130-136`): `DRAFT | RECEIVED | CONFIRMED | FULFILLED | CANCELLED`

IN_FULFILLMENT and PARTIALLY_FULFILLED missing from schema.

**Resolution Note:** Planning doc line 462 states partial tracking happens at CalibrationJob/Certificate level, not PO level. Current simplified enum is acceptable, but planning doc line 181 should be updated to match implementation decision.

### [Doc Gap 2] PurchaseOrder Tax Handling — Planning vs Schema

- **Planning doc** implies: `taxId String?` with FK to Tax master
- **Actual schema**: `taxCode String` (plain string) + `taxRateSnapshot Decimal` (required)

Snapshot approach is valid design decision for preserving historical rates, but differs from implied pattern.

### [Doc Gap 3] TECHNICALLY_DONE Semantics Undocumented

WorkOrderStatus includes TECHNICALLY_DONE between IN_PROGRESS and CLOSED. The semantic distinction is not documented. Presumably:
- TECHNICALLY_DONE = all calibration jobs complete, pending QA/invoicing
- CLOSED = fully complete including billing

Document this before building WorkOrder module.

---

## 14. Blockers (must resolve before implementation proceeds)

### [B1] DOCUMENT_TYPE_NUMBER_TABLE Incomplete — Unsafe Partial<Record> Type
- **Classification:** Foundation Issue
- **MVP Relevance:** Blocker-for-MVP
- **Evidence:** `packages/db/src/document-number/document-type-table.ts:4-8`
- **Impact:** PURCHASE_ORDER and WORK_ORDER missing from table mapping. When allocation is attempted, `resolveDocumentNumberTable()` returns undefined, causing sequence to start from 1 regardless of existing documents — potential duplicate number collision.
- **Fix:** Add PURCHASE_ORDER and WORK_ORDER to table. Change type from `Partial<Record<DocumentType, string>>` to `Record<DocumentType, string>` for compile-time exhaustiveness.

### [B2] DocumentType Enum Missing INVOICE, CERTIFICATE, CREDIT_NOTE
- **Classification:** Foundation Issue
- **MVP Relevance:** Blocker-for-MVP (for Invoice/Certificate/CreditNote modules)
- **Evidence:** `packages/db/prisma/schema.prisma:212-218`
- **Impact:** Invoice, Certificate, and CreditNote all have `number` fields with `@@unique([companyId, number])` constraints requiring centralized numbering. Cannot allocate document numbers without enum entries.
- **Fix:** Add INVOICE, CERTIFICATE, CREDIT_NOTE to DocumentType enum. Add corresponding entries to DOCUMENT_TYPE_PREFIX and DOCUMENT_TYPE_NUMBER_TABLE. Run schema migration.

### [B3] Permission Catalog Missing Calibration Lifecycle Resources
- **Classification:** Foundation Issue
- **MVP Relevance:** Blocker-for-MVP
- **Evidence:** `packages/auth/src/access-control.ts:40-62`
- **Impact:** CompanyRoleGuard's @RequirePermission decorator requires resources to exist in catalog. Cannot implement RBAC for lifecycle endpoints without catalog entries.
- **Fix:** Add to permissionCatalog: calibrationRequest, quotation, purchaseOrder, workOrder, calibrationJob, certificate, invoice, payment — each with appropriate actions (read, create, update, delete/cancel).

### [B4] WorkOrder Schema Dependency on PurchaseOrder
- **Classification:** Foundation Issue
- **MVP Relevance:** Blocker-for-MVP (for WorkOrder module)
- **Evidence:** `Audit and design Purchase Order.md:546`
- **Impact:** Current schema has WorkOrder.quotationId required. Planning doc recommends WorkOrder.purchaseOrderId required with quotationId derived from PO. Schema change needed before building WorkOrder to avoid second migration.
- **Fix:** Implement PurchaseOrder module first. Update WorkOrder schema to add purchaseOrderId and adjust quotationId handling.

---

## 15. High-Risk Issues

### [H1] CalibrationJobStatus Missing CANCELLED State
- **Classification:** Foundation Issue
- **MVP Relevance:** Post-MVP-hardening
- **Evidence:** `packages/db/prisma/schema.prisma:159-165`
- **Impact:** If WorkOrder cancelled after jobs created, or device removed from work order, no explicit status to mark job as cancelled. Workaround: delete job row, but loses audit trail.
- **Recommendation:** Add CANCELLED to CalibrationJobStatus enum before building CalibrationJob module.

### [H2] companyId Fields Without FK to Company
- **Classification:** Foundation Issue
- **MVP Relevance:** Post-MVP-hardening
- **Evidence:** Phase B/C notes — QuotationItem, InvoiceItem, Payment, WorkOrderAssignment, CalibrationRequestItem
- **Impact:** Denormalized companyId without FK cannot enforce referential integrity at database level. Cross-tenant data possible via application bugs or direct DB modifications.
- **Recommendation:** Application-level consistency checks in service layer. Consider adding FKs in future migration.

### [H3] Rounding Rules Not Documented
- **Classification:** Foundation Issue
- **MVP Relevance:** Post-MVP-hardening
- **Evidence:** No rounding documentation found; Decimal(18,2) implies 2 decimal places
- **Impact:** Inconsistent rounding between frontend preview and backend persistence could cause amount mismatches.
- **Recommendation:** Document explicit rounding rules (HALF_UP recommended) before implementing financial calculations. Use Decimal/BigNumber libraries, not JavaScript native numbers.

---

## 16. Medium-Risk Issues

### [M1] WorkOrderStatus TECHNICALLY_DONE Semantics Unclear
- **Classification:** Foundation Issue
- **MVP Relevance:** Post-MVP-hardening
- **Evidence:** `packages/db/prisma/schema.prisma:145-152`
- **Impact:** Without documented semantics, implementers may use TECHNICALLY_DONE vs CLOSED inconsistently.
- **Recommendation:** Add documentation clarifying when each status applies before building WorkOrder module.

### [M2] PurchaseOrder Tax Pattern Differs from Quotation/Invoice
- **Classification:** Foundation Issue
- **MVP Relevance:** Post-MVP-hardening
- **Evidence:** Phase B notes — PO uses taxCode/taxRateSnapshot, planning doc implied taxId FK
- **Impact:** Snapshot approach is valid for PO as commitment document, but pattern inconsistency may confuse developers.
- **Recommendation:** Document the intentional difference. Consider if Quotation/Invoice should also use snapshot approach for consistency.

### [M3] PurchaseOrderStatus Enum Simplified vs Planning Doc
- **Classification:** Foundation Issue
- **MVP Relevance:** Post-MVP-hardening
- **Evidence:** Schema (`packages/db/prisma/schema.prisma:130-136`) missing IN_FULFILLMENT, PARTIALLY_FULFILLED from planning doc (`Audit and design Purchase Order.md:181`)
- **Impact:** Reduced visibility at PO level, but partial tracking handled at CalibrationJob/Certificate level per planning doc line 462. This is a visibility gap only, not a business-logic blocker.
- **Recommendation:** Current enum sufficient for MVP. Add states later if business requires PO-level partial tracking visibility.

---

## 17. Low-Risk Issues

*No Foundation Issue findings with Nice-to-have MVP Relevance identified.*

**Removed items (for transparency):**
- "No Idempotency Mechanism" — removed because Classification is "Not Yet Built (expected)", not "Foundation Issue". Per audit rules, only Foundation Issues belong in Sections 14-17.
- "State Machine Transition Validation Not Built" — removed because Classification is "Not Yet Built (expected)", not "Foundation Issue". This will need to be built alongside each module (already noted in "Not Yet Built" summary near Section 2).

---

## 18. Safe to Proceed Now vs. Not Yet Safe (per lifecycle stage)

| Stage | Safe to Proceed? | Waiting On | Notes |
|-------|------------------|------------|-------|
| **CalibrationRequest** | ✅ **YES** (after [B3]) | Permission catalog entry | DocumentType enum/mapping already present |
| **Quotation** | ✅ **YES** (after [B3]) | Permission catalog entry | DocumentType enum/mapping already present |
| **PurchaseOrder** | ⚠️ **AFTER FIX** | [B1] table mapping, [B3] permission | Must add to DOCUMENT_TYPE_NUMBER_TABLE first |
| **WorkOrder** | ⚠️ **AFTER FIX** | [B1] table mapping, [B3] permission, [B4] PO first | Must implement PurchaseOrder module first, add table mapping |
| **CalibrationJob** | ⚠️ **AFTER FIX** | [B3] permission, [H1] CANCELLED state | Consider adding CANCELLED to status enum |
| **Certificate** | ⚠️ **AFTER FIX** | [B2] enum addition, [B3] permission | Must add CERTIFICATE to DocumentType enum |
| **Invoice** | ⚠️ **AFTER FIX** | [B2] enum addition, [B3] permission | Must add INVOICE to DocumentType enum |
| **Payment** | ✅ **YES** (after [B3]) | Permission catalog entry | No document numbering needed |
| **CreditNote** | ⚠️ **AFTER FIX** | [B2] enum addition, [B3] permission | Must add CREDIT_NOTE to DocumentType enum |

### Recommended First Steps

1. **Immediate:** Fix [B1] — add PURCHASE_ORDER, WORK_ORDER to DOCUMENT_TYPE_NUMBER_TABLE, change to exhaustive Record type
2. **Immediate:** Fix [B2] — add INVOICE, CERTIFICATE, CREDIT_NOTE to DocumentType enum + mappings
3. **Per module:** Fix [B3] — add permission resource before implementing each module's API
4. **Then:** Start building CalibrationRequest and Quotation modules (foundation ready after fixes)

---

## Appendix: Evidence Index

### Prisma Schema (`packages/db/prisma/schema.prisma`)
- Line 130-136: PurchaseOrderStatus enum
- Line 145-152: WorkOrderStatus enum
- Line 159-165: CalibrationJobStatus enum
- Line 185-189: CertificateBillingStatus enum
- Line 212-218: DocumentType enum
- Line 312-326: DocumentNumberSequence model
- Line 783-817: Customer model
- Line 867-890: CalibrationRequest model
- Line 892-904: CalibrationRequestItem model
- Line 929-960: Quotation model
- Line 963-982: QuotationItem model
- Line 985-1019: PurchaseOrder model
- Line 1021-1047: PurchaseOrderItem model
- Line 1049-1079: WorkOrder model
- Line 1081-1094: WorkOrderAssignment model
- Line 1100-1124: CalibrationJob model
- Line 1126-1138: MeasurementResult model
- Line 1140-1152: JobEvidence model
- Line 1154-1165: CustomerSignature model
- Line 1167-1185: QualityReview model
- Line 1191-1228: Certificate model
- Line 1252-1281: Invoice model
- Line 1297-1312: InvoiceItem model
- Line 1314-1329: Payment model
- Line 1331-1354: CreditNote model
- Line 1337: CreditNote.number field
- Line 1351: CreditNote @@unique([companyId, number])

### Document Numbering Service (`packages/db/src/document-number/`)
- `document-number.service.ts:43`: DocumentNumberService class
- `document-number.service.ts:55-81`: Atomic SQL INSERT...ON CONFLICT DO UPDATE
- `document-type-table.ts:4-8`: DOCUMENT_TYPE_NUMBER_TABLE (Partial<Record> — unsafe)
- `document-type-prefix.ts:4`: DOCUMENT_TYPE_PREFIX (Record — safe)
- `document-number.service.test.ts:4-201`: Test suite

### Authorization (`packages/auth/src/`)
- `access-control.ts:40-62`: permissionCatalog

### API (`apps/api/src/`)
- `modules/customers/customers.service.ts:2`: Import DocumentNumberService
- `modules/customers/customers.service.ts:52`: DocumentNumberService.allocate() call
- `modules/customers/customers.service.ts:96`: Transaction wrapping
- `modules/leads/leads.service.ts:229`: Lead conversion transaction
- `common/guards/company-role.guard.ts:34`: companyId from process.env

### Planning Docs (`docs/claude/plans/Calibration-management/`)
- `Audit and design Purchase Order.md:181`: PurchaseOrderStatus enum (planning)
- `Audit and design Purchase Order.md:376-399`: Financial calculation formulas
- `Audit and design Purchase Order.md:462`: Partial tracking at job/certificate level
- `Audit and design Purchase Order.md:546`: WorkOrder.purchaseOrderId recommendation
- `centralized-document-numbering-phase1-2.md`: DocumentNumberSequence implementation status

---

## Executive Summary (optional)

Foundation architecture untuk calibration management system secara fundamental sound — pattern DocumentNumberService, transaction handling, dan RBAC guard sudah terbukti bekerja di Customer module. **Verdict RED** karena terdapat 4 Foundation Issue Blockers (B1-B4) per audit rules. Blockers tersebut: incomplete document type mappings, missing enum values untuk Invoice/Certificate/CreditNote, permission catalog gaps, dan WorkOrder schema dependency on PurchaseOrder. Meskipun RED, practical severity tempered karena fixes straightforward dan tidak require architectural rework. Setelah fixes, CalibrationRequest dan Quotation dapat langsung diimplementasi, dengan stage lainnya mengikuti dalam urutan dependency yang jelas.

---

*Generated by Phase D Synthesis audit — final report consolidating Phase A Discovery, Phase B Domain Deep-Dive, and Phase C Cross-Cutting findings.*
