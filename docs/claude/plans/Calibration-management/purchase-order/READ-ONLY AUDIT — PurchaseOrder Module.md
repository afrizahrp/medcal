# READ-ONLY AUDIT — PurchaseOrder Module

## MODE

**STRICT READ-ONLY AUDIT MODE**

You are auditing the current PurchaseOrder domain and implementation readiness for the Medcal/Kalibrasi Medika monorepo.

### ABSOLUTE RULE

DO NOT modify existing source files.

DO NOT modify:

- Prisma schema
- migrations
- services
- controllers
- modules
- DTOs
- Zod schemas
- permissions
- seed files
- Portal UI
- planning documents

Do not implement anything.

The ONLY file you may create or modify is the designated audit report:

```text
D:\medcal\docs\claude\plans\Calibration-management\audit-purchase-order-readiness.md
```

If that file already exists, update that same file rather than creating a parallel report.

Do not create any other files.

---

# 1. PURPOSE

We are about to implement the **PurchaseOrder backend module**.

Current lifecycle:

```text
CalibrationRequest
       ↓ 1:1
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

The Quotation backend is already implemented.

For MVP, the current project decision is:

```text
CalibrationRequest 1 ─── 1 Quotation
```

This is an intentional MVP simplification.

Do NOT reopen the Quotation cardinality decision during this audit.

Do NOT propose quotation revisions or `CalibrationRequest 1:N Quotation` as an alternative unless the actual codebase contains a concrete contradiction that makes the current implementation impossible.

The purpose of this audit is to determine:

> **Is PurchaseOrder ready to be implemented safely, and what exact decisions/fixes must happen before implementation?**

---

# 2. SOURCE OF TRUTH

Before drawing conclusions, inspect the ACTUAL current codebase.

Do not rely blindly on previous handoff documents or earlier audit summaries.

Use the current repository as the primary source of truth.

Inspect at minimum:

### Database / domain

```text
packages/db/prisma/schema.prisma
```

Inspect:

- `PurchaseOrder`
- `PurchaseOrderItem`
- `Quotation`
- `QuotationItem`
- `CalibrationRequest`
- `CalibrationRequestItem`
- related Customer/Device models
- relevant enums
- relations
- indexes
- unique constraints
- nullable/required fields
- delete behavior

### Existing backend implementation

Inspect:

```text
apps/api
```

especially:

- CalibrationRequest module
- Quotation module
- analogous transactional modules
- authorization guards
- error handling
- transaction patterns
- document-number usage

### Shared validation

Inspect:

```text
packages/shared/src/schemas/
```

### Authorization

Inspect:

```text
packages/auth/src/access-control.ts
```

### Numbering

Inspect:

```text
packages/db/src/document-number/
```

and all current PurchaseOrder-related DocumentType configuration.

### Seed / permissions

Inspect:

```text
packages/db/prisma/seed-role-permissions.ts
```

### Planning / domain documentation

Read the relevant PurchaseOrder planning documents, especially:

```text
D:\medcal\docs\claude\plans\Calibration-management\
```

Search for documents/sections concerning:

- Purchase Order
- PurchaseOrder
- PO
- quotation → PO
- partial fulfillment
- WorkOrder
- calibration job
- certificate
- invoice

Also inspect the previously referenced:

```text
Audit and design Purchase Order.md
```

and any other current planning documents that materially define PurchaseOrder behavior.

---

# 3. IMPORTANT: VERIFY THE ACTUAL SCHEMA

The previous project audit reported:

- PurchaseOrder exists in schema.
- PurchaseOrder has `taxCode` + `taxRateSnapshot`.
- PurchaseOrder does not use a `taxId` FK like Quotation/Invoice.
- Partial fulfillment is intended to be tracked downstream at CalibrationJob/Certificate level rather than through PurchaseOrder status.
- WorkOrder was previously identified as blocked by B4 because its schema needs `purchaseOrderId`.

These are historical findings.

**Re-verify each one directly from the current schema and planning documents.**

Do not assume they are still true.

---

# 4. PURCHASEORDER ↔ QUOTATION CONTRACT

This is one of the most important parts of the audit.

Determine the actual intended relationship:

```text
Quotation
    ↓
PurchaseOrder
```

Specifically verify:

1. Can a PurchaseOrder be created without a Quotation?
2. Is `quotationId` required or nullable?
3. Is the relation one-to-one or one-to-many?
4. Can one approved Quotation generate multiple PurchaseOrders?
5. Is there a unique constraint on `quotationId`?
6. Does planning explicitly define the cardinality?
7. Does the current Quotation 1:1 CalibrationRequest decision affect this relationship?

Do NOT invent the answer.

Report:

```text
Current schema:
Planning contract:
MVP interpretation:
Conflict?:
```

If schema and planning disagree, classify it as an explicit finding.

---

# 5. WHAT QUOTATION STATUS IS REQUIRED?

Determine the exact prerequisite for creating a PurchaseOrder.

Specifically investigate:

- Can PO be created from DRAFT quotation?
- SENT?
- APPROVED?
- REJECTED?
- CANCELLED?

Do not assume "only APPROVED" merely because it sounds logical.

Find evidence in:

- schema
- planning documents
- existing implementation
- business rules already established

If the intended rule is not explicit, flag it as an **open business decision** rather than inventing one.

---

# 6. PURCHASEORDER ITEM CONTRACT

Audit:

```text
QuotationItem
        ↓
PurchaseOrderItem
```

Determine exactly which fields should be copied/snapshotted from Quotation.

Inspect whether PO items contain:

- quotationItemId
- requestItemId
- deviceId
- description
- quantity
- unitPrice
- lineTotal
- tax
- other snapshots

Determine:

1. Which values are references?
2. Which values are historical snapshots?
3. Which values may be edited on PO?
4. Whether PO quantity may differ from Quotation quantity.
5. Whether partial fulfillment is supported.
6. Whether PO item quantity can exceed quotation quantity.
7. Whether PO can contain only quotation items.
8. Whether items can be omitted from the quotation.

Do NOT invent business rules.

If planning is ambiguous, explicitly flag it.

---

# 7. PARTIAL FULFILLMENT

This is a critical area.

The historical planning reportedly indicates that:

> partial completion is tracked at CalibrationJob/Certificate level rather than through PurchaseOrder status.

Verify this against current documentation/schema.

Determine:

- whether PO status needs partial fulfillment states
- whether PO quantity itself tracks fulfillment
- whether WorkOrder/CalibrationJob tracks the operational fulfillment
- whether one PO can result in multiple WorkOrders
- whether one PO item can result in multiple CalibrationJobs
- whether certificates can be issued partially against a PO

Do not redesign this.

The audit should identify the actual contract and any contradiction.

---

# 8. PURCHASEORDER STATUS

Inspect the actual `PurchaseOrderStatus` enum.

List every current value exactly as defined in the schema.

Then compare it against the planning documents.

For each status, determine:

- meaning
- who/what causes the transition
- allowed transitions
- whether transition is manual or automatic
- downstream effect

Pay special attention to the previously reported discrepancy:

> planning documents contain conflicting information about `IN_FULFILLMENT` / `PARTIALLY_FULFILLED`.

Verify whether that discrepancy still exists.

Do not modify the enum.

---

# 9. PURCHASEORDER NUMBERING

Verify the complete numbering configuration.

Determine:

- whether `DocumentType.PURCHASE_ORDER` exists
- prefix
- number field
- uniqueness constraint
- company scope
- `DOCUMENT_TYPE_NUMBER_TABLE` entry
- whether `DocumentNumberService` is already wired conceptually for PO

The expected architecture is the existing:

```text
DocumentNumberService
```

Do not propose a new numbering mechanism.

If configuration is already correct, report it as ready.

---

# 10. TAX / FINANCIAL MODEL

Inspect actual PurchaseOrder financial fields.

Historical audit noted:

```text
taxCode
taxRateSnapshot
```

rather than a `taxId` FK.

Verify this.

Determine:

- subtotal calculation
- tax calculation
- total calculation
- Decimal precision
- whether discount exists
- whether tax is optional
- whether tax is snapshot-based
- whether tax rate can be changed after creation
- whether PO financial values are copied from Quotation or independently editable

Do NOT redesign the financial model.

Do NOT introduce multi-currency.

The system is single-currency IDR.

If rounding behavior is not documented, report it as an existing documentation gap rather than inventing a rule.

---

# 11. CUSTOMER / DELIVERY INFORMATION

Inspect PurchaseOrder fields related to:

- customer
- billing address
- delivery/location
- contact
- quotation/customer snapshot
- calibration location

Determine what is inherited from:

```text
CalibrationRequest
Quotation
Customer
```

and what is stored as a PO snapshot.

Pay particular attention to historical project rule:

```text
1 SPK = 1 customer + 1 location
```

Verify whether the current PO domain has an equivalent location concept.

Do not import assumptions from another module if the actual PO planning does not support them.

---

# 12. COMPANY SCOPING

Verify:

- `companyId`
- FK constraints
- CompanyRoleGuard
- server-side company sourcing
- whether client can supply companyId

Follow the established single-tenant architecture.

Report any inconsistency.

Do not fix it in audit mode.

---

# 13. AUTHORIZATION

Verify PurchaseOrder resources/actions in:

```text
packages/auth/src/access-control.ts
```

Determine whether the catalog already contains appropriate actions such as:

- read
- create
- update
- cancel
- approve
- other workflow-specific actions

Compare with the actual PurchaseOrder workflow.

Do not modify permissions during this audit.

If permissions are missing, report exactly what is missing.

---

# 14. DOCUMENT LIFECYCLE

Map the intended PO lifecycle.

Produce a table:

| Current State | Allowed Action | Next State | Actor | Evidence |
|---|---|---|---|---|

Do not invent transitions.

If documentation does not define a transition, mark it:

```text
UNDEFINED — business decision required
```

---

# 15. DOWNSTREAM CONTRACT: WORKORDER

Do NOT implement WorkOrder.

But PurchaseOrder readiness requires understanding what WorkOrder will need.

Inspect the current WorkOrder schema and planning documents only.

Specifically verify the historical B4 finding:

> WorkOrder currently has a required `quotationId` but planning recommends deriving quotationId from PurchaseOrder, with `purchaseOrderId` added to WorkOrder.

Determine the actual current schema.

Report:

- current WorkOrder → Quotation relation
- current WorkOrder → PurchaseOrder relation
- whether `purchaseOrderId` exists
- whether B4 is still unresolved
- whether PO implementation itself is blocked by B4

IMPORTANT:

Do not conclude that PO is blocked merely because WorkOrder is blocked.

The audit should distinguish:

```text
PO readiness
```

from:

```text
WorkOrder readiness
```

---

# 16. DOCUMENT NUMBERING / ENUM SAFETY

Apply the established project lesson:

Any enum-keyed mapping must use:

```text
Record<EnumName, ValueType>
```

or equivalent full typing.

Never accept:

```text
Partial<Record<...>>
```

If PurchaseOrder configuration contains a mapping, verify it is exhaustive.

Do not modify it in audit mode.

---

# 17. IDEMPOTENCY / DUPLICATE CREATION

Determine whether PurchaseOrder creation has existing protection against accidental duplicate creation.

Inspect:

- unique constraints
- quotation relationship
- document numbering
- existing service patterns

Do not invent an idempotency system for MVP.

Simply report the current protection and whether duplicate PO creation remains possible.

---

# 18. MIGRATION RISK

Determine whether implementing PurchaseOrder would require:

- no migration
- additive migration
- constraint change
- enum change
- relation change
- other schema modification

Do not create or apply a migration.

If migration is needed, describe exactly why.

---

# 19. AUDIT CLASSIFICATION

Classify findings using these categories:

### BLOCKER FOR PO MVP

A foundation issue that must be fixed before safely implementing PurchaseOrder.

### REQUIRED BEFORE IMPLEMENTATION

Not necessarily an architectural blocker, but a domain/schema decision that must be settled first.

### SAFE TO IMPLEMENT

Already sufficiently defined and supported.

### NON-BLOCKING / LATER

Useful improvement but should not delay MVP.

Do not inflate severity.

Do not call a feature gap a foundation issue simply because it is not implemented yet.

---

# 20. FINAL VERDICT

End the report with exactly one of:

```text
GREEN — PurchaseOrder is safe to implement.
```

or

```text
YELLOW — PurchaseOrder can proceed after specific decisions/fixes listed above.
```

or

```text
RED — PurchaseOrder implementation must not start until the listed blocker(s) are resolved.
```

Use this rule:

> RED only if there is a genuine blocker-for-MVP foundation issue.

Do not soften or inflate the verdict.

---

# 21. REQUIRED REPORT STRUCTURE

Write the report to:

```text
D:\medcal\docs\claude\plans\Calibration-management\audit-purchase-order-readiness.md
```

Use this exact high-level structure:

```text
# PurchaseOrder Readiness Audit

## 1. Executive Summary

## 2. Current Schema

## 3. PurchaseOrder ↔ Quotation Contract

## 4. PurchaseOrder Item Contract

## 5. PurchaseOrder Status / Workflow

## 6. Financial / Tax Model

## 7. Numbering

## 8. Authorization / Company Scoping

## 9. Partial Fulfillment

## 10. Downstream WorkOrder Contract

## 11. Migration Requirements

## 12. Findings

### Blocker for PO MVP
### Required Before Implementation
### Safe to Implement
### Non-Blocking / Later

## 13. Open Business Decisions

## 14. Recommended Implementation Scope

## 15. Final Verdict

## 16. Evidence Index
```

For every important conclusion, cite the actual file/path and relevant schema/code/document section.

---

# 22. FINAL RESPONSE TO ME

After writing the report, do NOT implement anything.

In your final response, give only:

1. Audit report path
2. Final verdict
3. Blockers, if any
4. Required business decisions, if any
5. Short summary of what is already safe for implementation
6. Confirmation:

```text
READ-ONLY AUDIT ONLY — no source code or schema was modified.
```

Do not start PurchaseOrder implementation automatically.