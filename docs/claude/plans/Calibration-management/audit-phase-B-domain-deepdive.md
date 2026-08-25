Phase B Domain Deep-Dive Audit Report

Ringkasan Eksekutif

Audit ini menganalisis 6 stage lifecycle kalibrasi dengan fokus pada Foundation Issues - masalah pada komponen yang sudah ada (Prisma schema, enums, DocumentNumberService) yang dapat menyebabkan masalah ketika modul yang belum dibangun diimplementasikan.

Status Implementasi Umum: Hanya Customer stage yang sudah fully implemented. Semua stage lainnya (Calibration Request sampai Payment) adalah Not Yet Built (expected) di level API/service/frontend.

Key Foundation Issues Ditemukan

1. DocumentType Enum Incomplete

File: [packages/db/prisma/schema.prisma](packages/db/prisma/schema.prisma) line 212-218

enum DocumentType {
CUSTOMER
CALIBRATION_REQUEST
QUOTATION
PURCHASE_ORDER
WORK_ORDER
}

Missing: INVOICE, CERTIFICATE, CREDIT_NOTE - padahal Invoice dan CreditNote memiliki field number yang unique per company dan membutuhkan centralized numbering.

2. DOCUMENT_TYPE_NUMBER_TABLE Incomplete

File: [packages/db/src/document-number/document-type-table.ts](packages/db/src/document-number/document-type-table.ts)

export const DOCUMENT_TYPE_NUMBER_TABLE: Partial<Record<DocumentType, string>> =
{
CUSTOMER: "Customer",
CALIBRATION_REQUEST: "CalibrationRequest",
QUOTATION: "Quotation",
// Missing: PURCHASE_ORDER, WORK_ORDER
};

3. PurchaseOrder Schema vs Planning Doc Divergence

Planning doc: taxId String? dengan FK ke Tax master (line 195: "taxId?, taxAmount?, totalAmount, currency — reuse pola Quotation/Invoice")
Actual schema: taxCode String (plain string) + taxRateSnapshot Decimal (required)

Ini adalah design decision yang valid (snapshot approach untuk preservasi historis), tetapi tidak konsisten dengan pola Quotation/Invoice yang menggunakan FK taxId.

MVP Relevance: Post-MVP-hardening — pendekatan snapshot berfungsi dengan benar untuk PO sebagai dokumen komitmen, tetapi inkonsistensi pattern dengan entitas lain dapat menyulitkan maintenance dan onboarding developer baru.

4. PurchaseOrderStatus Enum Reduced

Planning doc states: DRAFT | RECEIVED | CONFIRMED | IN_FULFILLMENT | PARTIALLY_FULFILLED | FULFILLED | CANCELLED (line 181)
Actual enum: DRAFT | RECEIVED | CONFIRMED | FULFILLED | CANCELLED

IN_FULFILLMENT dan PARTIALLY_FULFILLED tidak ada di schema aktual.

MVP Relevance: Post-MVP-hardening — Planning doc line 462 menyatakan "Job partial completion & partial invoice — tidak butuh perubahan PO; tetap via job/certificate status (rules 9–10)". Ini menunjukkan bahwa tracking partial fulfillment dilakukan di level CalibrationJob.status dan Certificate.billingStatus, BUKAN di PurchaseOrder.status. Enum PO yang lebih sederhana cukup untuk MVP karena granular tracking ada di downstream entities. Status IN_FULFILLMENT/PARTIALLY_FULFILLED adalah nice-to-have untuk visibility di PO level, bukan requirement untuk business logic.

Note: This also reflects an internal contradiction within the planning doc itself (line 181 vs line 462 appear to disagree on whether PO status needs IN_FULFILLMENT/PARTIALLY_FULFILLED), independent of which side the current code implementation matches. Flag for Phase D Section 13 (Documentation Gaps/Contradictions).

Stages Analysis

Stage 1: Calibration Request

Prisma model: Ada (line 867-890)

API/Service: NOT BUILT

Frontend: NOT BUILT

DocumentType enum: Ada (CALIBRATION_REQUEST)

DocumentNumberService table mapping: Ada

Stage 2: Quotation

Prisma model: Ada (line 929-960)

API/Service: NOT BUILT

Frontend: NOT BUILT

DocumentType enum: Ada (QUOTATION)

DocumentNumberService table mapping: Ada

Stage 3: Purchase Order

Prisma model: Ada (line 985-1047)

API/Service: NOT BUILT

Frontend: NOT BUILT

DocumentType enum: Ada (PURCHASE_ORDER)

Foundation Issue: Table mapping missing di DOCUMENT_TYPE_NUMBER_TABLE

Stage 4: Work Order

Prisma model: Ada (line 1049-1094)

API/Service: NOT BUILT

Frontend: NOT BUILT

DocumentType enum: Ada (WORK_ORDER)

Foundation Issue: Table mapping missing di DOCUMENT_TYPE_NUMBER_TABLE

Stage 5: Invoice

Prisma model: Ada (line 1252-1281)

API/Service: NOT BUILT

Frontend: NOT BUILT

Foundation Issue: DocumentType enum MISSING (INVOICE tidak ada)

Stage 6: Payment

Prisma model: Ada (line 1314-1329)

API/Service: NOT BUILT

Frontend: NOT BUILT

Payment tidak membutuhkan document numbering (no number field)

Output File

Akan dibuat file: D:\medcal\docs\claude\plans\Calibration-management\audit-phase-B-deepdive.md

Struktur mengikuti format yang ditentukan di prompt Phase B dengan:

Finding blocks per stage

Classification: Not Yet Built (expected) / Foundation Issue

Evidence dengan file:line

MVP Relevance untuk Foundation Issues

---

## Flag for Phase C (cross-cutting concerns noticed but not analyzed here)

- Authorization gap: Tidak ada permission resource untuk calibration lifecycle (calibrationRequest, quotation, purchaseOrder, workOrder, invoice, payment) di `packages/auth/src/access-control.ts`
- State machine coordination: Sinkronisasi status antar entitas (CalibrationRequest.IN_QUOTATION ↔ Quotation creation, WorkOrder ↔ CalibrationJob, Invoice ↔ Payment) belum didefinisikan di kode
- Race conditions: Concurrent allocation PurchaseOrderItem ke multiple WorkOrder — tidak ada locking mechanism
- Financial consistency: Rounding rules untuk Decimal calculations (18,2 / 18,4 / 5,4) belum eksplisit di service layer
- Tenant isolation: Beberapa `companyId` fields tanpa FK ke Company (QuotationItem, InvoiceItem, Payment, WorkOrderAssignment, CalibrationRequestItem)
- Audit trail weakness: Beberapa `*ByUserId` fields (approvedByUserId, confirmedByUserId) tanpa FK ke User — tidak bisa enforce referential integrity

---

## Commands I Could NOT Run (and why)

| Command | Reason Skipped |
|---------|----------------|
| `prisma migrate` | Writes to database — violates read-only audit mode |
| `prisma generate` | Generates client code — violates read-only audit mode |
| `npm test` / `pnpm test` | Could modify snapshots or coverage files — uncertain if purely read-only |
| `git add` / `git commit` | Modifies git state — violates read-only audit mode |
| `npx ts-node` untuk trace imports | Could execute arbitrary code — uncertain if read-only |

---

*Generated by Phase B Domain Deep-Dive audit — findings per stage, classification, evidence, and MVP relevance.*
