# MOM #1 — FINAL REVISION SCOPE DESIGN

## DESIGN ONLY — NO CODE CHANGES

The forensic investigation and business clarification for MOM #1 are complete.

This task is now to produce the **FINAL DESIGN** for the Revision Scope behavior.

This is a design task only.

# NON-NEGOTIABLE

**DO NOT IMPLEMENT ANYTHING.**

**NO CODE CHANGES.**
**NO SCHEMA CHANGES.**
**NO MIGRATIONS.**
**NO API CHANGES.**
**NO UI CHANGES.**
**NO REFACTORING.**

Follow all applicable `.claude/rules`.

Inspect the existing implementation and repository as needed to ensure the design is compatible with the actual architecture.

Do not reopen already-decided History architecture.

Do not invent unrelated features.

Do not propose event sourcing, CQRS, or a generic revision framework.

The output of this task must be a **design document only**.

---

# 1. AUTHORITATIVE BUSINESS DEFINITION

A Revision means:

> **The user submits the desired complete resulting document scope.**

Revision is NOT:

> quantity adjustment only.

The desired resulting scope may contain:

1. Existing item with unchanged device and quantity.
2. Existing item with changed quantity.
3. Existing item replaced by another device.
4. Newly added item.
5. Existing item removed.
6. Any combination of the above in a single revision.

Example:

### Current

```text
Bedsidemonitor × 1
Ventilator × 1
Audiometer × 1
```

### Desired

```text
Patient Monitor × 1
Ventilator × 3
```

This is ONE revision containing:

```text
Bedsidemonitor
  → removed/replaced

Audiometer
  → removed

Ventilator
  → qty 1 → 3

Patient Monitor
  → added
```

The system must conceptually reconcile:

```text
CURRENT SCOPE
      ↓
DESIRED SCOPE
      ↓
added / removed / changed / unchanged
```

---

# 2. LOCKED HISTORY DESIGN

History architecture is already final.

Maintain:

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

History is:

* append-only
* complete snapshot
* immutable
* never updated
* never deleted

Before applying a revision:

```text
CURRENT COMPLETE STATE
        ↓
CREATE HISTORY SNAPSHOT
        ↓
RECONCILE CURRENT STATE
```

Example:

```text
History #1
  Bedsidemonitor × 1
  Ventilator × 1
  Audiometer × 1

History #2
  Patient Monitor × 1
  Ventilator × 3
```

Do NOT represent removal using negative quantities.

Do NOT add a `DELETED` history record.

A removed item is simply absent from the subsequent complete snapshot.

---

# 3. LOCKED BUSINESS DECISION A — UNCONSUMED ITEM REMOVAL

The business decision is:

> **If an item has not yet been consumed/snapshotted by a downstream document, revision must first create the complete history snapshot and then the current item may be hard-deleted.**

Therefore:

```text
History snapshot
      ↓
Hard DELETE current item
```

This applies only when the item is genuinely unconsumed and deletion is safe according to the existing relationship chain.

Do NOT retain an unnecessary inactive/retired row merely for audit purposes when the history snapshot already preserves the prior state.

The historical record is the audit trail.

---

# 4. LOCKED BUSINESS DECISION B — CONSUMED ITEM REMOVAL

Once an item has been consumed by a downstream document and hard deletion would violate referential integrity or break traceability:

> **Do NOT hard-delete the consumed item.**

Instead, the item must be retired/inactive according to the appropriate existing domain representation.

The previous state must first be captured in the history snapshot.

Conceptually:

```text
Current consumed item
        ↓
History snapshot
        ↓
Retire/inactivate current item
```

Do not physically delete the row.

Do not create a new document-level `CANCELLED` status to represent item removal.

`CANCELLED` at document level continues to mean whole-document cancellation.

---

# 5. LOCKED BUSINESS DECISION C — PURCHASE ORDER ITEM

The existing schema already contains:

```text
PurchaseOrderItemStatus
  OPEN
  ALLOCATED
  FULFILLED
  CANCELLED
```

The existing `CANCELLED` value is currently dormant.

For the final design:

> **Use `PurchaseOrderItemStatus.CANCELLED` to represent a Purchase Order item that has been removed from the active desired scope after it has been consumed / must remain for referential integrity.**

The exact service behavior must be designed, but the business decision is fixed.

Before changing the current PO scope:

```text
History snapshot
      ↓
PurchaseOrderItem → CANCELLED
```

Do not hard-delete that consumed PurchaseOrderItem.

---

# 6. ACTIVE SCOPE

A critical design rule:

> **Only active scope may propagate to downstream documents.**

Example:

```text
Purchase Order

Bedsidemonitor × 1    CANCELLED
Ventilator × 1        OPEN
Audiometer × 1        OPEN
```

When creating or revising a Work Order:

```text
WOL scope:

Ventilator × 1
Audiometer × 1
```

The cancelled PurchaseOrderItem must NOT be copied into the WorkOrder.

Do not allow inactive/retired PO items to become active WorkOrder scope.

Define explicitly what qualifies as "active" at each entity level.

---

# 7. WORK ORDER REVISION BOUNDARY

Preserve the existing WorkOrder revision boundary:

```text
PLANNED / ASSIGNED
    → revision eligible

IN_PROGRESS
    → locked

DONE
    → terminal/read-only

CANCELLED
    → terminal/read-only
```

Do NOT extend Revision into `IN_PROGRESS`.

This is important because `WorkOrder.start()` creates CalibrationJobs.

The design must NOT require a new CalibrationJob cancellation/void architecture for MOM #1.

If an item is removed from the desired scope, that removal must occur before the WorkOrder becomes `IN_PROGRESS`.

---

# 8. CALIBRATION JOB BOUNDARY

Preserve existing CalibrationJob behavior.

Do not design:

```text
CalibrationJob.CANCELLED
CalibrationJob.VOIDED
```

unless there is an unavoidable existing requirement that proves MOM #1 cannot be implemented without it.

The current business boundary is:

```text
WorkOrder PLANNED/ASSIGNED
    → scope can be revised

WorkOrder IN_PROGRESS
    → scope is locked
    → CalibrationJobs are already operational
```

Therefore:

> A normal Revision must never need to remove or cancel an already-fanned-out CalibrationJob.

---

# 9. REQUIRED DESIRED-SCOPE RECONCILIATION DESIGN

Design the reconciliation algorithm conceptually.

Input:

```text
Current Scope
Desired Scope
```

Output categories:

```text
UNCHANGED
QTY_CHANGED
ADDED
REMOVED
REPLACED
```

The design must explain how the system determines these categories using the existing item identity/domain semantics.

Do NOT assume that `deviceTypeId` alone is the identity of a business line.

Use the actual existing model semantics discovered during the forensic analysis.

---

# 10. DEVICE REPLACEMENT

Explicitly design this case:

```text
CURRENT
Bedsidemonitor × 1

DESIRED
Ventilator × 1
```

Explain:

* whether this is represented as REMOVE + ADD,
* whether it can be represented as an explicit REPLACE operation,
* how the current row is treated,
* how the new row is created,
* how downstream source relationships are handled,
* how history records the result.

Do not invent a new item identity model unless absolutely required.

Prefer the smallest compatible representation.

---

# 11. ADD ITEM

Explicitly design:

```text
CURRENT
Bedsidemonitor × 1

DESIRED
Bedsidemonitor × 1
Audiometer × 1
```

Explain:

* how the new desired item enters the current document,
* how its downstream relationships are created,
* how it propagates to the next document,
* how it participates in future revisions.

---

# 12. REMOVE ITEM

Explicitly design:

```text
CURRENT
Bedsidemonitor × 1
Ventilator × 1
Audiometer × 1

DESIRED
Bedsidemonitor × 1
Ventilator × 1
```

Separate:

### Unconsumed

```text
history snapshot
→ hard delete
```

### Consumed

```text
history snapshot
→ retire/inactivate
```

Explain how each entity behaves.

---

# 13. QUANTITY CHANGE

Explicitly design:

```text
CURRENT
Bedsidemonitor × 1

DESIRED
Bedsidemonitor × 3
```

and:

```text
CURRENT
Bedsidemonitor × 3

DESIRED
Bedsidemonitor × 1
```

Do not automatically reuse the previous "always add sibling row" rule.

Instead, define how desired-scope reconciliation interacts with:

* current item identity,
* downstream snapshots,
* immutable WorkOrderItem,
* active/inactive scope.

---

# 14. COMBINED REVISION

Explicitly design this complete scenario:

```text
CURRENT

Bedsidemonitor × 1
Ventilator × 1
Audiometer × 1
```

Desired:

```text
Patient Monitor × 1
Ventilator × 3
```

The design must show:

```text
Removed
Added
Qty changed
Replaced
Unchanged
```

and explain how the entire operation remains ONE atomic Revision.

---

# 15. ENTITY-BY-ENTITY DESIGN

Produce a clear design for:

## CalibrationRequest

Explain:

* active scope
* unconsumed deletion
* consumed retirement
* add
* remove
* replace
* qty change
* history snapshot
* propagation to Quotation

## Quotation

Explain:

* active scope
* unconsumed deletion
* consumed retirement
* add
* remove
* replace
* qty change
* history snapshot
* propagation to Purchase Order

## PurchaseOrder

Explain:

* `PurchaseOrderItemStatus.CANCELLED`
* active scope
* hard delete conditions
* retirement conditions
* add/remove/replace/qty change
* history snapshot
* propagation to Work Order

## WorkOrder

Explain:

* PLANNED/ASSIGNED revision boundary
* active scope
* WorkOrderItem immutability
* add/remove/replace/qty change
* history snapshot
* CalibrationJob boundary
* what happens before `start()`
* why no revision is allowed after `start()`

---

# 16. DATA INTEGRITY

The design must explicitly preserve:

```text
CalibrationRequestItem
        ↓
QuotationItem
        ↓
PurchaseOrderItem
        ↓
WorkOrderItem
        ↓
CalibrationJob
```

and the verified FK constraints:

```text
QuotationItem → PurchaseOrderItem
    ON DELETE RESTRICT

PurchaseOrderItem → WorkOrderItem
    ON DELETE RESTRICT
```

Also account for:

```text
CalibrationRequestItem → QuotationItem
    ON DELETE SET NULL
```

Do not rely on database constraints alone where the database allows a technically legal but business-unsafe operation.

---

# 17. DOCUMENT NUMBER

Revision MUST NOT change customer-facing document numbers.

Example:

```text
QUO-01
PO-001
WOL-01
```

remain the same across revisions.

Revision number belongs to History.

Do not introduce:

```text
QUO-01-R1
PO-001-R1
WOL-01-R1
```

---

# 18. AUDIT LOG

Preserve the existing distinction:

### AuditLog

Records:

> Revision action occurred.

### History

Records:

> Complete document state at that revision.

The design must specify what audit metadata should point to the created revision.

Do not duplicate the complete snapshot into AuditLog.

---

# 19. UI DESIGN REQUIREMENT

Design the Revision UI around:

> **Edit desired complete scope**

NOT:

> Edit quantity only.

The UI must conceptually allow the user to:

```text
+ Add Device

Change Device

Remove Device

Change Qty
```

and combine those changes before pressing:

```text
Save Revision
```

Example conceptual UI:

```text
CURRENT SCOPE

Device                 Qty
--------------------------------
Bedsidemonitor           1
Ventilator               1
Audiometer               1


DESIRED REVISION

Device                 Qty       Action
-------------------------------------------
Patient Monitor          1       Added
Ventilator               3       Changed
Audiometer               -       Removed

[ + Add Device ]

              [Cancel] [Save Revision]
```

This is a design requirement only.

Do NOT implement the UI in this task.

Determine whether device replacement should be explicit or naturally represented as remove + add based on existing domain semantics.

---

# 20. OPEN QUESTIONS

Do NOT invent answers to questions that remain genuinely business-specific.

If the existing evidence does not resolve something, explicitly mark it:

```text
BUSINESS DECISION REQUIRED
```

Do not silently choose a behavior.

However, the following decisions are ALREADY LOCKED and must NOT be reopened:

1. History is append-only complete snapshots.
2. Unconsumed item removal:
   history first → hard delete.
3. Consumed item removal:
   history first → retire/inactivate.
4. `PurchaseOrderItemStatus.CANCELLED` is the chosen PO-item retirement state.
5. Only active scope propagates downstream.
6. WorkOrder revision stops at `IN_PROGRESS`.
7. No new CalibrationJob cancellation/void architecture for this MOM.
8. Customer-facing document numbers do not change.

---

# 21. REQUIRED DESIGN OUTPUT

Write the design report to:

```text
D:\medcal\docs\minutes-of-meeting
```

Suggested filename:

```text
mom-1-final-revision-scope-design-20260920.md
```

The report MUST contain:

## 1. Executive Summary

## 2. Locked Business Rules

## 3. Revision as Desired-Scope Reconciliation

## 4. Item Identity / Matching Rules

## 5. Add / Remove / Replace / Qty Change Semantics

## 6. Unconsumed vs Consumed Removal

## 7. Active Scope Rules

## 8. Entity-by-Entity Design

## 9. End-to-End Requisition → Quotation → PO → WOL Design

## 10. WorkOrder / CalibrationJob Boundary

## 11. History Snapshot Design

## 12. AuditLog Design

## 13. UI/UX Design

## 14. Transaction /
