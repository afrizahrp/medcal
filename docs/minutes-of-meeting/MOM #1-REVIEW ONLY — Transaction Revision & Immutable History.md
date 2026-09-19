# REVIEW ONLY — Transaction Revision & Immutable History

We have one final business requirement before manual E2E verification.

DO NOT IMPLEMENT YET.

Your task is to **inspect the existing Medcal codebase and review the proposed solution below**, then report whether there is a simpler, safer, or more actionable implementation that preserves the existing transaction flow, state machine, and auditability.

## Existing transaction flow

```text
Requisition
    ↓
Quotation
    ↓
Purchase Order
    ↓
Work Order / SPK
    ↓
Kontrol Alat
    ↓
Calibration Job
```

### Requisition sources

1. Customer sends an Excel containing mandatory:

   * equipment name
   * quantity
   * optional serial number

   Admin imports the Excel and a draft requisition is generated.

2. Admin can manually enter the requisition.

## Business requirement

A customer may still request corrections or additional equipment after a transaction has been submitted/approved, provided the operational work has not started.

Example:

```text
Customer initially requests:
1 equipment

REQ
  ↓
QUO-01
  1 equipment
  ↓
PO-001
  1 equipment
  ↓
WOL-01 / SPK-01
  1 equipment
```

Customer later requests 2 additional equipment.

The resulting commercial/operational documents must reflect 3 equipment.

However, previously issued documents must NOT be overwritten.

The customer-facing document number must remain:

```text
QUO-01
PO-001
WOL-01 / SPK-01
```

Do NOT create customer-facing numbers such as:

```text
QUO-01-R1
PO-001-R1
WOL-01-R1
```

Instead, revisions/history are internal.

## Proposed data model

Current operational tables remain the source of current state:

```text
quotation
quotation_item

purchase_order
purchase_order_item

work_order
work_order_item
```

Add append-only history tables:

```text
quotation_history
quotation_item_history

purchase_order_history
purchase_order_item_history

work_order_history
work_order_item_history
```

History is an immutable snapshot.

### History rules

History tables are:

* INSERT only
* never UPDATE
* never DELETE

Every history record represents the complete document state at that point in time.

Do NOT store only deltas.

Example:

```text
QUO-01 History #1
  1 item

QUO-01 History #2
  3 items

QUO-01 History #3
  4 items
```

Each history revision contains the complete item snapshot.

The item-history table is therefore required.

Do NOT add a generic `revision` column to the current operational header merely to represent history unless your review finds a concrete existing-code reason that requires it.

If needed, explain why before proposing it.

## Existing status enums

Do NOT introduce new status enums unless the existing model genuinely cannot represent the required behavior.

Existing requisition status:

```prisma
enum CalibrationRequestStatus {
  DRAFT
  SUBMITTED
  IN_QUOTATION
  CANCELLED
  FULFILLED
}
```

Existing PO status:

```prisma
enum PurchaseOrderStatus {
  DRAFT
  APPROVED
  RECEIVED
  CONFIRMED
  FULFILLED
  CANCELLED
}
```

Existing Work Order status:

```prisma
enum WorkOrderStatus {
  PLANNED
  ASSIGNED
  IN_PROGRESS
  TECHNICALLY_DONE // legacy, API must not use
  CLOSED           // legacy, API must not use
  CANCELLED
  DONE
}
```

`TECHNICALLY_DONE` and `CLOSED` are legacy values retained for migration safety only. The Work Order API must continue to use `DONE`.

## Document revision behavior

The intended behavior is:

### Before a document is committed/sent

Normal editing is allowed using the existing workflow.

UI action:

```text
Edit
```

### After a document has been sent/committed

Do not overwrite the historical document state.

UI action:

```text
Revise
```

A revision creates a new current state while appending an immutable history snapshot of the previous state.

The customer-facing document number remains unchanged.

Example:

```text
QUO-01
  History #1 → 1 item

Customer requests +2 items

QUO-01
  History #2 → 3 items
```

The previous snapshot remains permanently available.

### Cancelled documents

If an existing document/revision is superseded and the existing state machine uses `CANCELLED`, the old document state becomes:

```text
CANCELLED
LOCKED / NON-EDITABLE
```

Do not invent `INACTIVE`, `SUPERSEDED`, `REVISED`, or `LOCKED` enum values merely for this purpose.

`LOCKED` is a behavioral permission rule, not necessarily a persisted status.

### Work Order

Once the Work Order reaches:

```text
IN_PROGRESS
```

the operational scope is locked.

No further scope modification/revision should be allowed through the normal revision action.

Completion continues using:

```text
DONE
```

Do not revive or use the legacy `TECHNICALLY_DONE` / `CLOSED` API states.

# UI intent

The intended UI semantics are deliberately simple:

```text
Draft/editable
    → Edit

Sent/committed but still eligible for change
    → Revise

Historical snapshot
    → View only

Cancelled
    → View + History

IN_PROGRESS / DONE
    → View + History
    → no Revise
```

History should be accessible through a lightweight:

```text
History
```

action and should be read-only.

The user should not need to understand database revision mechanics.

# YOUR REVIEW TASK

Inspect the existing code BEFORE making any changes.

Specifically inspect:

1. Prisma/schema models and relations for:

   * CalibrationRequest / requisition
   * Quotation
   * QuotationItem
   * PurchaseOrder
   * PurchaseOrderItem
   * WorkOrder
   * WorkOrderItem

2. Existing status transitions/state machines.

3. Existing document-number generation.

4. Existing approval/submission/sending flows.

5. Existing audit-log implementation.

6. Existing UI detail/edit/action patterns.

7. Existing API/service transaction boundaries.

8. Existing database transaction handling.

9. Whether there are already existing version/history/snapshot mechanisms that can be reused.

## IMPORTANT REVIEW CONSTRAINTS

DO NOT:

* implement anything yet
* redesign the existing workflow
* introduce new business processes
* introduce a generic event-sourcing architecture
* introduce CQRS
* introduce new status enums without strong evidence
* create duplicate live operational tables
* create customer-facing revision document numbers
* change existing document numbering
* change existing approval semantics
* invent business rules not stated above
* modify unrelated modules
* "improve" unrelated code

The purpose of this review is to determine whether the proposed solution is compatible with the existing Medcal architecture and whether there is a simpler implementation.

## Review the following questions explicitly

### A. Data model

Is:

```text
current operational tables
+
append-only history header
+
append-only history item
```

the most appropriate fit for the existing schema?

If not, explain the concrete reason and propose the smallest alternative.

### B. History snapshot

Confirm whether each history revision should contain a complete snapshot of:

* document header
* all document items
* relevant commercial values
* relevant status
* actor
* timestamp

Identify any fields that should NOT be snapshotted because they are volatile/runtime-only.

### C. Revision lifecycle

Determine exactly where the existing state machine allows:

```text
Edit
```

versus:

```text
Revise
```

Do not invent new states.

### D. Propagation

Verify how a change should propagate through:

```text
REQ
→ QUOTATION
→ PO
→ WOL/SPK
```

Especially verify the existing implementation so that a revision does not leave downstream data inconsistent.

### E. Auditability

Verify that the proposed history mechanism does not conflict with the existing audit-log mechanism.

Clarify the responsibility of:

```text
document_history
```

versus:

```text
existing audit log
```

Do not duplicate audit infrastructure unnecessarily.

### F. UI

Determine the smallest UI change needed to expose:

* Edit
* Revise
* History
* View historical snapshot

without redesigning existing screens.

### G. Concurrency / transaction safety

Identify whether creating a revision requires a single database transaction covering:

```text
current state update
+
history header insert
+
history item inserts
```

and whether existing transaction helpers can be reused.

### H. Revision numbering

Determine where the revision number should live and how to guarantee:

```text
QUO-01 History #1
QUO-01 History #2
QUO-01 History #3
```

without race conditions.

Do not add unnecessary columns to current operational tables.

## OUTPUT

Return a concise technical review with exactly these sections:

1. **Existing Architecture Findings**
2. **Compatibility Assessment**
3. **Recommended Minimal Design**
4. **State / Transition Rules**
5. **Data Model Changes**
6. **API / Service Changes**
7. **UI Changes**
8. **Audit & Immutability**
9. **Risks / Edge Cases**
10. **Implementation Scope**
11. **Explicitly NOT Changing**

At the end provide:

### Recommendation

One clear recommendation:

* ACCEPT proposed design as-is
* ACCEPT with minor adjustments
* or REJECT and explain the smallest viable alternative

Again:

**DO NOT IMPLEMENT ANY CODE.**

This is a review and architecture validation only.
