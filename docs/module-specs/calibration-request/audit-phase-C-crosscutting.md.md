# Phase C — Cross-Cutting Findings

## 0. Exhaustiveness-Risk Sweep (Partial<Record> and similar patterns)

### [Exhaustiveness-Risk] — DOCUMENT_TYPE_NUMBER_TABLE uses unsafe Partial<Record> type
- Classification: Foundation Issue
- Evidence: `packages/db/src/document-number/document-type-table.ts:4`
- What it means: The constant `DOCUMENT_TYPE_NUMBER_TABLE` is typed as `Partial<Record<DocumentType, string>>`, allowing any DocumentType enum member to be silently omitted without compiler error. Currently PURCHASE_ORDER and WORK_ORDER are missing from the map. When these document types attempt allocation via `DocumentNumberService.allocate()`, `resolveDocumentNumberTable()` returns `undefined`, causing `readMaxExistingSequence()` to be skipped and sequence to start from 1 regardless of existing documents — potential duplicate number collision if documents were created through other means.
- MVP Relevance: Blocker-for-MVP — PURCHASE_ORDER and WORK_ORDER are part of the core calibration lifecycle and need document numbering. Missing table mapping will cause incorrect sequence initialization.

### [Exhaustiveness-Risk] — DOCUMENT_TYPE_PREFIX uses safe Record type (positive finding)
- Classification: Not a finding — positive pattern
- Evidence: `packages/db/src/document-number/document-type-prefix.ts:4`
- What it means: The `DOCUMENT_TYPE_PREFIX` constant correctly uses `Record<DocumentType, string>` (non-Partial), meaning any new DocumentType added to the enum will cause a compile error if not mapped. This is the correct exhaustive pattern. The DOCUMENT_TYPE_NUMBER_TABLE should follow this same pattern.

### [Exhaustiveness-Risk] — No other unsafe Partial<Record> patterns found for status enums
- Classification: Not Yet Built (expected)
- Evidence: Grep for `Partial<Record<` in packages/ and apps/ — only hits are DOCUMENT_TYPE_NUMBER_TABLE and a generic URL query state hook (not enum-related)
- What it means: Status enums (CalibrationRequestStatus, QuotationStatus, PurchaseOrderStatus, WorkOrderStatus, InvoiceStatus, CalibrationJobStatus, etc.) do not currently have any lookup tables or mapping objects in the codebase. This is expected because the modules using these statuses are not yet built. When implementing status-based UI labels, allowed transitions, or permission mappings, developers must use exhaustive `Record<EnumName, ...>` types (not Partial) to ensure compile-time completeness checking.
- MVP Relevance: N/A

---

## 1. State Machine Consistency

### [State Machine] — No transition validation logic exists for any lifecycle status
- Classification: Not Yet Built (expected)
- Evidence: Grep for `transition|status.*=` in `apps/api/src/modules/` shows only User/Lead/Email/Chat status updates with direct assignment (e.g., `data: { status }`) — no state machine guard logic
- What it means: All calibration lifecycle modules (CalibrationRequest, Quotation, PurchaseOrder, WorkOrder, CalibrationJob, Invoice, Payment) have status enums defined in Prisma schema but zero backend enforcement of valid transitions. Status can be set to any value via direct update when modules are implemented.

### [State Machine] — Planning doc vs schema divergence on PurchaseOrderStatus
- Classification: Foundation Issue
- Evidence: Planning doc (`Audit and design Purchase Order.md:181`) lists `DRAFT | RECEIVED | CONFIRMED | IN_FULFILLMENT | PARTIALLY_FULFILLED | FULFILLED | CANCELLED`. Actual schema (`packages/db/prisma/schema.prisma:130-136`) has `DRAFT | RECEIVED | CONFIRMED | FULFILLED | CANCELLED`.
- What it means: IN_FULFILLMENT and PARTIALLY_FULFILLED states are missing from the actual enum. Phase B noted that planning doc line 462 indicates partial tracking happens at CalibrationJob/Certificate level, not PO level. This is an acceptable simplification but represents an internal documentation contradiction that should be reconciled.
- MVP Relevance: Post-MVP-hardening — current simplified enum is functionally sufficient for MVP; IN_FULFILLMENT/PARTIALLY_FULFILLED would be nice-to-have visibility improvements.

### [State Machine] — CalibrationJobStatus missing CANCELLED state
- Classification: Foundation Issue
- Evidence: `packages/db/prisma/schema.prisma:159-165` shows CalibrationJobStatus as `PENDING | IN_PROGRESS | SUBMITTED | REWORK | ACCEPTED_BY_QA`
- What it means: There is no CANCELLED state for CalibrationJob. If a WorkOrder is cancelled after jobs are created, or if a specific device needs to be removed from a work order, there is no explicit status to mark the job as cancelled. Developers would need to delete the job row or repurpose another status.
- MVP Relevance: Post-MVP-hardening — workaround exists (delete job row), but explicit CANCELLED improves auditability.

### [State Machine] — WorkOrderStatus TECHNICALLY_DONE semantics unclear
- Classification: Foundation Issue
- Evidence: `packages/db/prisma/schema.prisma:145-152` — WorkOrderStatus includes TECHNICALLY_DONE between IN_PROGRESS and CLOSED
- What it means: The distinction between TECHNICALLY_DONE and CLOSED is not documented. Presumably TECHNICALLY_DONE means all calibration jobs are complete but QA/invoicing not finished, while CLOSED means fully done. Without explicit documentation, implementers may use these inconsistently.
- MVP Relevance: Post-MVP-hardening — document the semantic difference before building WorkOrder module.

---

## 2. Authorization & Company-Scoping

### [Authorization] — companyId correctly sourced from env, never client input
- Classification: Not a finding — positive pattern
- Evidence: `apps/api/src/common/guards/company-role.guard.ts:34` — `const companyId = process.env.COMPANY_ID`
- What it means: The CompanyRoleGuard correctly sources companyId from the server's environment variable and looks up the user's membership for that specific company. Client-supplied companyId is explicitly not trusted (comment on line 11-14 references this as an anti-pattern from adoption docs).

### [Authorization] — Permission catalog missing calibration lifecycle resources
- Classification: Foundation Issue
- Evidence: `packages/auth/src/access-control.ts:40-62` — permissionCatalog lists: contactMessage, whitelist, lead, customer, chat, users, membership, menu, managementDashboard, customerDashboard, email, permission, notification
- What it means: No permission resources exist for: calibrationRequest, quotation, purchaseOrder, workOrder, calibrationJob, certificate, invoice, payment. Before implementing these modules, the permission catalog must be extended with appropriate resources and actions (e.g., `calibrationRequest: ["read", "create", "update", "cancel"]`).
- MVP Relevance: Blocker-for-MVP — cannot implement RBAC for lifecycle modules without catalog entries.

### [Authorization] — No object-level access control for technician-specific work orders
- Classification: Not Yet Built (expected)
- Evidence: WorkOrder module does not exist; no `WorkOrderAssignment` query logic implemented
- What it means: When WorkOrder module is built, technicians should only see WorkOrders they are assigned to (via WorkOrderAssignment). This object-level filtering must be enforced server-side, not just in UI. Currently no code exists to evaluate.

### [Authorization] — Some companyId fields lack FK to Company
- Classification: Foundation Issue (flagged by Phase B)
- Evidence: Phase B flagged: QuotationItem, InvoiceItem, Payment, WorkOrderAssignment, CalibrationRequestItem have `companyId String` without FK to Company
- What it means: These denormalized companyId fields cannot have referential integrity enforced at the database level. Data integrity relies purely on application logic setting the correct companyId. If application bugs or direct DB modifications set wrong companyId, orphaned or cross-tenant data could result.
- MVP Relevance: Post-MVP-hardening — application-level consistency is sufficient for MVP; adding FK would require schema migration and cascade decisions.

---

## 3. API Boundary & Backend Responsibility

### [API Boundary] — Customer creation uses proper transaction for document numbering
- Classification: Not a finding — positive pattern
- Evidence: `apps/api/src/modules/customers/customers.service.ts:96` — `return prisma.$transaction(run);`
- What it means: Customer creation wraps duplicate checking, document number allocation, and entity creation in a single transaction. This ensures atomicity and prevents duplicate numbers on concurrent requests.

### [API Boundary] — DocumentNumberService uses atomic SQL for concurrency safety
- Classification: Not a finding — positive pattern
- Evidence: `packages/db/src/document-number/document-number.service.ts:55-81` — INSERT...ON CONFLICT DO UPDATE pattern
- What it means: Document number allocation uses an atomic upsert that either inserts a new sequence row or increments the existing one in a single statement. This prevents race conditions where two concurrent requests could get the same sequence number.

### [API Boundary] — No idempotency mechanism for document creation endpoints
- Classification: Not Yet Built (expected)
- Evidence: CustomerController POST endpoint has no idempotency key handling; no `X-Idempotency-Key` header processing
- What it means: Double-submits (browser retry, mobile reconnect, double-click) could create duplicate documents. For Customer this is mitigated by duplicate email/taxId checks. For Quotation, PurchaseOrder, Invoice creation (not yet built), idempotency keys should be considered.
- MVP Relevance: Post-MVP-hardening — mitigation exists via unique constraints; explicit idempotency improves UX.

### [API Boundary] — Lead conversion uses transaction for atomicity
- Classification: Not a finding — positive pattern
- Evidence: `apps/api/src/modules/leads/leads.service.ts:229` — `return prisma.$transaction(async (tx) => {...})`
- What it means: Lead-to-Customer conversion atomically creates Customer, CustomerContact, allocates document number, and updates Lead status. If any step fails, all changes roll back.

---

## 4. Partial Processing Correctness

### [Partial Processing] — Schema supports partial invoicing via Certificate.billingStatus
- Classification: Not Yet Built (expected)
- Evidence: `packages/db/prisma/schema.prisma:185-189` — CertificateBillingStatus enum: `UNBILLED | BILLABLE | INVOICED`
- What it means: The schema design supports partial invoicing by tracking billing status per Certificate. A WorkOrder with 5 CalibrationJobs can have 3 certificates billed on one Invoice and 2 on another. This is the correct approach documented in planning docs.

### [Partial Processing] — CalibrationJob progress independent per device
- Classification: Not Yet Built (expected)
- Evidence: `packages/db/prisma/schema.prisma:1100-1124` — CalibrationJob has individual status field; `@@unique([workOrderId, deviceId])`
- What it means: Each device within a WorkOrder has its own CalibrationJob with independent status progression. One job can be ACCEPTED_BY_QA while another is still IN_PROGRESS. This supports partial completion semantics.

### [Partial Processing] — No implementation to verify mathematical consistency
- Classification: Not Yet Built (expected)
- Evidence: No Invoice, Payment, or financial aggregation service code exists
- What it means: Cannot verify that partial invoicing totals, outstanding amounts, or payment allocations remain consistent. This must be validated when implementing Invoice/Payment modules.

---

## 5. Financial Consistency

### [Financial] — Decimal precision defined in schema, no service layer calculations exist
- Classification: Not Yet Built (expected)
- Evidence: Schema uses `@db.Decimal(18, 2)` for amounts, `@db.Decimal(18, 4)` for quantities, `@db.Decimal(5, 4)` for tax rates
- What it means: The data model has appropriate precision for financial calculations. However, no service layer code performs calculations (subtotal, tax, total, etc.) because Quotation/PO/Invoice modules are not built. When implemented, calculations must use Decimal/BigNumber libraries (not JavaScript native numbers) to avoid floating-point errors.

### [Financial] — Planning doc defines calculation formulas
- Classification: Not a finding — documentation exists
- Evidence: `Audit and design Purchase Order.md:376-399` defines: `grossLine = qty * unitPrice`, `lineTotal = grossLine - discountAmount`, `subtotal = SUM(lineTotal)`, `taxableAmount = subtotal - headerDiscountAmount`, `taxAmount = taxableAmount * taxRateSnapshot`, `totalAmount = taxableAmount + taxAmount`
- What it means: Clear formulas exist for PO calculations. Same patterns should be applied to Quotation and Invoice. Implementers must follow these formulas exactly to maintain consistency.

### [Financial] — Rounding rules not explicitly documented
- Classification: Foundation Issue
- Evidence: No rounding rule documentation found; Decimal precision (18,2) implies 2 decimal places
- What it means: When calculations produce results with more than 2 decimal places (e.g., qty 1.3333 * unitPrice 100.00 = 133.33), rounding must be applied. Standard practice is HALF_UP rounding, but this is not documented. Inconsistent rounding between frontend preview and backend persistence could cause mismatch.
- MVP Relevance: Post-MVP-hardening — define explicit rounding rules before implementing financial calculations.

---

## 6. Frontend/Backend Contract Consistency

### [Contract] — No calibration lifecycle UI exists in Portal
- Classification: Not Yet Built (expected)
- Evidence: `apps/portal/src/app/management/` contains: chat, customers, email, leads, menu-management, permission-management, users, whitelist — no calibration-request, quotation, purchase-order, work-order, invoice, payment routes
- What it means: Portal frontend has no UI for the calibration lifecycle. When built, developers must ensure DTOs, API response shapes, status labels, and enum values match the backend exactly.

### [Contract] — No calibration lifecycle UI exists in Tech-PWA
- Classification: Not Yet Built (expected)
- Evidence: `apps/tech-pwa/src/app/` contains only: root page, sign-in, providers, layout — no work-order, calibration-job, measurement, signature routes
- What it means: Tech-PWA is a minimal shell with authentication only. Full technician workflow UI (assigned work orders, job execution, measurement recording, evidence upload, signature capture) must be built.

### [Contract] — Shared package @medcal/shared exists for schema synchronization
- Classification: Not a finding — positive pattern
- Evidence: `packages/shared/src/` exports validation schemas (customerCreateSchema, customerListQuerySchema, etc.)
- What it means: Zod schemas are shared between frontend and backend, reducing risk of DTO shape mismatch. When building new lifecycle modules, continue this pattern — define schemas in @medcal/shared and import in both apps/api controllers and frontend forms.

---

## 7. Implementation Sequence Risk

### [Sequence Risk] — DocumentType enum must add INVOICE, CERTIFICATE, CREDIT_NOTE before those modules
- Classification: Foundation Issue
- Evidence: `packages/db/prisma/schema.prisma:212-218` — DocumentType enum: `CUSTOMER | CALIBRATION_REQUEST | QUOTATION | PURCHASE_ORDER | WORK_ORDER`
- What it means: Invoice, Certificate, and CreditNote all have `number` fields with unique constraints that require centralized document numbering. INVOICE, CERTIFICATE, and CREDIT_NOTE must be added to DocumentType enum, and DOCUMENT_TYPE_NUMBER_TABLE must have their mappings, before implementing these modules. Otherwise, document numbers cannot be allocated.
- MVP Relevance: Blocker-for-MVP (for Invoice/Certificate/CreditNote modules)

### [Sequence Risk] — CREDIT_NOTE requires centralized document numbering (confirmed)
- Classification: Foundation Issue
- Evidence: `packages/db/prisma/schema.prisma:1337` — CreditNote model has `number String` field; line 1351 has `@@unique([companyId, number])` constraint
- What it means: CreditNote definitively requires centralized document numbering. The schema has a unique `number` field per company, following the same pattern as Customer, Invoice, and Certificate. CREDIT_NOTE must be added to the DocumentType enum and DOCUMENT_TYPE_NUMBER_TABLE before implementing CreditNote module.
- MVP Relevance: Blocker-for-MVP (for CreditNote module)

### [Sequence Risk] — CALIBRATION_JOB does NOT need its own DocumentType entry
- Classification: Not a finding — clarification
- Evidence: `packages/db/prisma/schema.prisma:1100-1124` — CalibrationJob model has NO `number`, `code`, or similar human-readable identifier field. Only internal `id String @id @default(cuid())`. Unique constraint is `@@unique([workOrderId, deviceId])` — identifying job by which WorkOrder and which device, not by document number.
- What it means: CalibrationJob is an internal execution record, not a customer-facing numbered document. Customer traceability is already fully covered by the combination of: (1) WorkOrder.number — identifies the SPK/work order, (2) Certificate.number — identifies the issued calibration certificate for each completed job. A customer tracking "where is my calibration?" uses WorkOrder number during execution and Certificate number after completion. CalibrationJob does NOT need its own DocumentType enum entry or centralized numbering. No action required.
- MVP Relevance: N/A — no change needed

### [Sequence Risk] — DOCUMENT_TYPE_NUMBER_TABLE must add PURCHASE_ORDER, WORK_ORDER before those modules
- Classification: Foundation Issue
- Evidence: `packages/db/src/document-number/document-type-table.ts:4-8` — missing PURCHASE_ORDER, WORK_ORDER
- What it means: PurchaseOrder and WorkOrder enum values exist in DocumentType, and prefix mappings exist in DOCUMENT_TYPE_PREFIX, but table mappings are missing. This will cause sequence initialization to skip the max-sequence check, potentially creating duplicate numbers if any PO/WO documents were created through other means.
- MVP Relevance: Blocker-for-MVP — fix before implementing PurchaseOrder or WorkOrder modules.

### [Sequence Risk] — Permission catalog must be extended before lifecycle module APIs
- Classification: Foundation Issue
- Evidence: `packages/auth/src/access-control.ts:40-62` — missing calibration lifecycle permissions
- What it means: CompanyRoleGuard's @RequirePermission decorator will fail or be bypassed if permission resources don't exist in the catalog. Before implementing any lifecycle API endpoint with RBAC, add the corresponding permission resource.
- MVP Relevance: Blocker-for-MVP — add permissions before each module.

### [Sequence Risk] — WorkOrder depends on PurchaseOrder being stable
- Classification: Foundation Issue
- Evidence: Planning doc (`Audit and design Purchase Order.md:546`) — WorkOrder will have `purchaseOrderId String` required for new data
- What it means: WorkOrder schema has `quotationId` required today. Planning doc recommends adding `purchaseOrderId` required and deriving quotationId from PO. This schema change must happen before building WorkOrder module to avoid a second migration later. Building WorkOrder UI before PurchaseOrder module exists would create a dependency gap.
- MVP Relevance: Blocker-for-MVP — implement PurchaseOrder schema/module before WorkOrder.

### [Sequence Risk] — Quotation must be built before PurchaseOrder
- Classification: Not a finding — correct sequence
- Evidence: Planning doc flow: CalibrationRequest → Quotation → PurchaseOrder → WorkOrder
- What it means: PO requires an approved Quotation as prerequisite. Quotation module must be implemented first. This is already the planned sequence.

### [Sequence Risk] — CalibrationRequest can be built independently
- Classification: Not a finding — safe to proceed
- Evidence: CalibrationRequest only depends on Customer and Device, both of which have schemas and Customer has a working module
- What it means: CalibrationRequest module can be implemented after fixing DocumentType mappings, without waiting for downstream modules.

---

## Commands I Could NOT Run (and why)

| Command | Reason Skipped |
|---------|----------------|
| `prisma migrate` | Writes to database — violates read-only audit mode |
| `prisma generate` | Generates client code — violates read-only audit mode |
| `npm test` / `pnpm test` | Could modify snapshots or coverage files — uncertain if purely read-only |
| `tsc --noEmit` | Should be read-only but generates temp files in some configs — skipped to be safe |
| `git add` / `git commit` | Modifies git state — violates read-only audit mode |

---

*Generated by Phase C Cross-Cutting audit — authorization, state machine, financial, contract consistency, and implementation sequence analysis.*
