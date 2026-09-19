# MOM #1 — FINAL IMPLEMENTATION

## Transaction Revision + Immutable History

You are now authorized to IMPLEMENT the already-defined MOM #1 revision design.

This is an implementation task, NOT another audit/design exercise.

## NON-NEGOTIABLE RULES

**DO NOT AUDIT AGAIN.**
**DO NOT REDESIGN.**
**DO NOT ADD FEATURES.**
**DO NOT INVENT BUSINESS RULES.**
**DO NOT CHANGE EXISTING DOMAIN SEMANTICS.**
**DO NOT ADD NEW STATUS ENUMS.**
**DO NOT RENAME EXISTING MODELS/TABLES.**
**DO NOT CHANGE CUSTOMER-FACING DOCUMENT NUMBERS ON REVISION.**

First inspect the existing repository and `.claude/rules` and follow those rules exactly.

Use the existing architecture, Prisma patterns, transaction patterns, service patterns, API conventions, UI patterns, validation, authorization, and audit-log helpers wherever applicable.

The clarification report has already resolved the item-revision semantics. Do not reopen that decision.

---

# 1. AUTHORITATIVE BUSINESS CONTEXT

Existing business chain:

```text
Requisition
    ↓
Quotation
    ↓
Purchase Order
    ↓
Work Order / SPK
    ↓
Calibration Job
```

Backend currently uses:

```text
CalibrationRequest
CalibrationRequestItem
```

for the Requisition domain.

**Do NOT rename `CalibrationRequest` or its tables/models.**

Customer-facing documents retain their existing document number throughout revisions.

Example:

```text
QUO-01
PO-001
WOL-01 / SPK-01
```

A revision does NOT generate:

```text
QUO-01-R1
PO-001-R1
WOL-01-R1
```

Revision identity belongs to the history records, not the customer-facing document number.

---

# 2. CORE REVISION MODEL

Keep the existing operational/current tables as the source of the current state:

```text
CalibrationRequest
CalibrationRequestItem

Quotation
QuotationItem

PurchaseOrder
PurchaseOrderItem

WorkOrder
WorkOrderItem
```

Add append-only history tables:

```text
CalibrationRequestHistory
CalibrationRequestItemHistory

QuotationHistory
QuotationItemHistory

PurchaseOrderHistory
PurchaseOrderItemHistory

WorkOrderHistory
WorkOrderItemHistory
```

History represents the document's historical snapshots.

## History is NOT an event/delta log.

Each revision history record must represent a **COMPLETE SNAPSHOT** of the document header and ALL of its items at that point in time.

Example:

```text
QUO-01

History #1
  Equipment A × 1

History #2
  Equipment A × 3

History #3
  Equipment A × 4
```

If quantity decreases:

```text
History #1
  Equipment A × 1

History #2
  Equipment A × 3

History #3
  Equipment A × 2
```

Do NOT store history as:

```text
+2
-1
+3
```

The history must contain the resulting complete document snapshot.

---

# 3. HISTORY IMMUTABILITY

History tables are **append-only**.

Allowed:

```text
INSERT
```

Not allowed:

```text
UPDATE
DELETE
```

Do not create APIs/services/UI that edit or delete historical snapshots.

History must remain readable and reconstructable after subsequent revisions.

`revisionNumber` belongs to the history header record.

Use an appropriate uniqueness constraint such as:

```text
(parentId, revisionNumber)
```

to prevent duplicate revision numbers.

Use the existing transaction/locking patterns required to make revision creation race-safe.

Do not add a `revisionNumber` field to the current operational header merely for convenience unless an existing concrete architectural requirement proves it necessary.

---

# 4. HISTORY VS AUDIT LOG

Do NOT replace `AuditLog`.

The two have different purposes:

### AuditLog

Answers:

> What action happened?

Example:

```text
User revised QUO-01
Revision: 2
```

### History

Answers:

> What exactly did QUO-01 contain at revision 2?

Example:

```text
QUO-01
Revision 2

Equipment A × 3
Equipment B × 1
...
```

Use the existing audit helper/pattern such as `recordAuditLog()`.

Do not duplicate the entire document snapshot into AuditLog.

---

# 5. ATOMIC REVISION TRANSACTION

A revision must be atomic.

Within the appropriate existing transaction pattern:

```text
1. Load/lock the current document as required.
2. Validate revision eligibility.
3. Read current header + all current items.
4. Create the complete history snapshot.
5. Apply the requested revision to current operational data.
6. Record the audit event.
7. Commit.
```

If any step fails:

```text
ROLLBACK EVERYTHING
```

Do not leave:

```text
history created but current state unchanged
```

or:

```text
current state changed but history missing
```

or:

```text
audit recorded for a failed revision
```

---

# 6. ITEM REVISION SEMANTICS — LOCKED DECISION

The rule is NOT:

> "Every quantity increase creates a new row."

The correct rule is based on whether a downstream operational row has already been snapshotted from the current item.

## CalibrationRequestItem

Existing semantics:

```text
qty = aggregate quantity for the line
```

If no downstream Quotation has been created from it, quantity may be changed in place.

Example:

```text
Equipment A × 1
        ↓
Equipment A × 3
```

Do not unnecessarily create duplicate sibling lines.

Preserve the existing DRAFT behavior and existing item semantics.

---

## QuotationItem

Before a PurchaseOrder has been created from the quotation, quantity may be changed according to the existing quotation/item semantics.

Example:

```text
Equipment A × 1
        ↓
Equipment A × 3
```

Do not automatically create:

```text
Equipment A × 1
Equipment A × 2
```

when the existing domain treats this as one aggregate commercial line.

---

## PurchaseOrderItem

Once a WorkOrder exists for the PO, do NOT mutate the existing `PurchaseOrderItem.qty`.

The existing WorkOrderItem relationship and uniqueness constraint make such mutation unsafe because the existing WorkOrderItem would remain desynchronized.

For a committed scope addition after the downstream WorkOrder snapshot exists, use an additive sibling item according to the existing relational chain.

Do not modify the existing frozen row.

Before a WorkOrder exists, do not introduce a new arbitrary item-mutation workflow merely because the schema technically permits it. Preserve the existing behavior unless required by the defined revision flow.

---

## WorkOrderItem

Preserve the existing invariant:

> Operational snapshot of PurchaseOrderItem. Quantity and source identity are immutable after create.

Do NOT mutate an existing WorkOrderItem quantity.

If additional scope must be represented after the relevant snapshot exists, create the required additive sibling scope through the existing relational chain.

Do not weaken the immutability invariant.

---

# 7. 1 → 3 BUSINESS CASE

The implementation MUST correctly support the defined business scenario.

Initial:

```text
Requisition
Equipment A × 1

Quotation
Equipment A × 1

PO
Equipment A × 1

WOL/SPK
Equipment A × 1
```

Customer adds two more units.

The commercial/operational scope must ultimately represent:

```text
Equipment A × 3
```

without incorrectly duplicating aggregate lines where the existing model treats `qty` as aggregate quantity.

Where an existing downstream snapshot is immutable, preserve the old row and represent the additional scope using the required additive sibling row(s), respecting the existing FK and uniqueness constraints.

Do not invent a generic event-sourcing model.

Do not introduce a new item identity architecture.

---

# 8. CALIBRATION JOB INVARIANT

Inspect and preserve the existing `CalibrationJob` fan-out behavior.

Existing behavior uses `WorkOrderItem.qty` when the WorkOrder is started.

The current fan-out is WorkOrder-wide and has an existing idempotency guard.

**Do not redesign or refactor this mechanism as part of MOM #1.**

In particular, do not silently change:

* fan-out semantics,
* idempotency semantics,
* CalibrationJob identity,
* unitOrdinal behavior,
* WorkOrder start behavior,

unless an explicitly required implementation path for this MOM cannot function without it.

If the existing lock boundary means that a scope revision is not valid after the WorkOrder has started, enforce the defined revision boundary rather than inventing a second fan-out mechanism.

---

# 9. HEADER REVISION ELIGIBILITY

Use the revision eligibility already established in the approved MOM #1 design/review.

Do NOT invent new statuses.

Do NOT add:

```text
REVISED
SUPERSEDED
LOCKED
INACTIVE
```

or any equivalent enum/status.

`CANCELLED` keeps its existing meaning:

> explicit cancellation of the document.

It must NOT be repurposed to mean:

> superseded by revision.

Use behavioral permission/eligibility rules rather than new persisted statuses.

Preserve existing terminal semantics.

For WorkOrder specifically:

```text
PLANNED / ASSIGNED
    → revision-eligible

IN_PROGRESS
    → locked

DONE
    → terminal/read-only

CANCELLED
    → terminal/read-only
```

Do not make `TECHNICALLY_DONE` or `CLOSED` the API completion status; existing API semantics must continue using `DONE`.

For other entities, follow the already-established revision eligibility from the existing implementation/review. Do not invent a new state model.

---

# 10. API

Implement the minimum API required for:

### Revision

A dedicated revision operation is preferred for non-DRAFT/committed documents rather than weakening the existing normal update semantics.

Follow the existing API routing/style conventions.

Do not break existing DRAFT edit/update behavior.

### History

Provide read-only history retrieval sufficient for the portal to:

* list revisions,
* identify revision number,
* inspect the historical snapshot,
* inspect its items.

History endpoints must not expose mutation operations.

Do not add unnecessary generic history infrastructure.

---

# 11. UI / UX

Follow the existing Portal UI patterns.

Do not redesign unrelated screens.

Do not introduce a new visual language.

Use the existing forms/components wherever practical.

Expected behavior:

### Editable current document

Use the existing normal `Edit` flow where that is already the established behavior.

### Committed revision-eligible document

Expose a clear:

```text
Revise
```

action using the defined revision API.

### History

Expose:

```text
History
```

and allow the user to inspect historical revisions as read-only snapshots.

Historical snapshots must not expose Edit/Delete controls.

Do not change the customer-facing document number.

Do not add revision suffixes to displayed document numbers.

---

# 12. DATABASE / MIGRATION

Inspect the existing Prisma schema before modifying it.

Create only the migration(s) required by the defined history/revision design.

History schema should preserve:

* parent document relationship,
* revision number,
* snapshot metadata needed for auditability,
* complete header snapshot,
* complete item snapshot,
* appropriate timestamps,
* appropriate indexes/foreign keys.

Do not duplicate the entire current operational schema unnecessarily.

Do not add speculative fields.

Do not add database structures for features outside this MOM.

---

# 13. EXISTING ARCHITECTURE TO PRESERVE

Reuse existing implementations wherever applicable:

* Prisma transaction patterns
* existing service patterns
* existing validation
* existing authorization
* existing document-number allocation
* existing audit logging
* existing status handling
* existing quotation/PO/WO creation relationships
* existing WorkOrder → CalibrationJob fan-out
* existing Portal UI components and conventions

Do not rewrite working code merely for stylistic preference.

Do not perform unrelated refactors.

---

# 14. TESTING

Implement appropriate automated tests following the repository's existing testing conventions.

At minimum cover:

### History

```text
revision creates history #1
revision creates history #2
revision creates history #3
old history remains unchanged
old history cannot be updated/deleted through the API
```

### Snapshot completeness

Each history revision contains:

```text
complete header snapshot
complete item snapshot
```

not only changed items.

### Quantity increase

Test:

```text
1 → 3
```

according to the locked item semantics.

### Quantity decrease

Test that a later revision can result in:

```text
3 → 2
```

without modifying previous history snapshots.

Do NOT implement negative/delta history rows.

### Document number

Verify:

```text
QUO-01 → QUO-01
PO-001 → PO-001
WOL-01 → WOL-01
```

across revisions.

### Atomicity

Force an appropriate failure and verify:

```text
no partial history
no partial current-state mutation
no misleading audit record
```

### WorkOrder

Verify that the existing item immutability invariant is preserved.

### Existing behavior

Run the relevant existing test suite and ensure the revision implementation does not regress existing flows.

---

# 15. REPORT REQUIREMENT

After implementation, write a Markdown implementation report.

The report MUST be written under:

```text
D:\medcal\docs\minutes-of-meeting
```

Use a clear filename such as:

```text
mom-1-transaction-revision-implementation-YYYYMMDD.md
```

Do not merely print the report in the terminal.

The Markdown report must contain:

1. **Implementation Summary**
2. **Files Changed**
3. **Database / Migration Changes**
4. **API Changes**
5. **UI/UX Changes**
6. **Revision Eligibility**
7. **Item Revision Semantics**
8. **History Snapshot Behavior**
9. **AuditLog Integration**
10. **Transaction / Atomicity**
11. **Tests Executed**
12. **Test Results**
13. **Known Constraints / Pre-existing Behavior**
14. **Explicit Confirmation of Non-Goals**

For item semantics, explicitly document:

```text
CalibrationRequestItem:
  in-place mutation before downstream snapshot

QuotationItem:
  in-place mutation before downstream snapshot

PurchaseOrderItem:
  frozen once WorkOrder snapshot exists;
  additive sibling scope when required

WorkOrderItem:
  immutable after create;
  additive sibling scope when required
```

Also explicitly document that:

```text
History = complete snapshots
History = append-only
History is never updated
History is never deleted
```

---

# 16. CLAUDE RULES

Before doing any implementation work:

1. Read all applicable `.claude/rules`.
2. Follow those rules throughout the task.
3. If a repository rule conflicts with this prompt, follow the repository rule and document the conflict in the final Markdown report rather than silently ignoring it.
4. Do not create or modify `.claude/rules` unless explicitly required by an existing rule or separately requested.

---

# 17. FINAL NON-GOALS

Do NOT:

* redesign the transaction workflow,
* rename Requisition/CalibrationRequest,
* introduce new statuses,
* introduce revision suffixes into document numbers,
* replace AuditLog with History,
* introduce event sourcing,
* introduce CQRS,
* create a generic revision framework unrelated to the existing domain,
* redesign item identity,
* weaken WorkOrderItem immutability,
* redesign CalibrationJob fan-out,
* refactor unrelated modules,
* add unrelated UI features,
* change existing business behavior outside MOM #1.

---

# 18. IMPLEMENTATION PRINCIPLE

The implementation should be the **smallest change necessary** to add the defined revision + immutable-history capability while preserving the existing Medcal architecture and domain semantics.

Inspect first.

Implement second.

Test third.

Document last.

Do not reopen already-decided architecture.

At the end, provide the concise implementation result in the terminal and write the complete Markdown report to:

```text
D:\medcal\docs\minutes-of-meeting
```
