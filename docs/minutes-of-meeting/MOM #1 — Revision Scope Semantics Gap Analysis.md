# MOM #1 — Revision Scope Semantics Gap Analysis

## NO CODE CHANGES

The MOM #1 revision/history implementation has already been implemented.

However, a manual UI review exposed an important semantic gap:

The current Revision UI appears to support **quantity changes only**, while the actual business requirement is broader.

This task is ONLY to investigate and document that gap.

# NON-NEGOTIABLE

**DO NOT IMPLEMENT ANYTHING.**

**NO CODE CHANGES.**
**NO SCHEMA CHANGES.**
**NO MIGRATIONS.**
**NO API CHANGES.**
**NO UI CHANGES.**
**NO REFACTORING.**
**NO REDESIGN.**

Follow all applicable `.claude/rules`.

Inspect the existing implementation thoroughly before producing the report.

Do not assume that the previous implementation is correct merely because its tests pass.

Do not assume that the current UI defines the business requirement.

The business requirement below is authoritative for this analysis.

---

# 1. ACTUAL BUSINESS REQUIREMENT

A document Revision means:

> **Change the complete scope/content of the current document while preserving the previous state as an immutable historical snapshot.**

Revision is NOT merely:

> change quantity.

A revision must conceptually support all three types of item changes.

## A. DEVICE REPLACEMENT

Example:

Current:

```text
Bedsidemonitor × 1
```

Customer requests:

```text
Ventilator × 1
```

This is a device/item replacement.

The revision must be able to express the desired resulting scope.

---

# 2. ADD / REMOVE ITEM

Revision must support adding a new item.

Example:

Current:

```text
Bedsidemonitor × 1
```

Desired:

```text
Bedsidemonitor × 1
Audiometer × 1
```

Revision must also support removing an existing item.

Example:

Current:

```text
Bedsidemonitor × 1
Ventilator × 1
Audiometer × 1
```

Desired:

```text
Bedsidemonitor × 1
Ventilator × 1
```

Therefore, Revision must not be limited to existing item rows.

---

# 3. QUANTITY CHANGE

Revision must support increasing or decreasing quantity.

Example:

```text
Bedsidemonitor × 1
```

→

```text
Bedsidemonitor × 3
```

and:

```text
Bedsidemonitor × 3
```

→

```text
Bedsidemonitor × 1
```

The existing implementation already appears to support this. Verify exactly how.

---

# 4. COMBINED REVISION

The most important case:

A single Revision operation must be able to combine multiple changes.

Example current state:

```text
Bedsidemonitor × 1
Ventilator × 1
Audiometer × 1
```

Desired state:

```text
Patient Monitor × 1
Ventilator × 3
```

Changes:

```text
Bedsidemonitor
    → replaced/removed

Audiometer
    → removed

Ventilator
    → qty 1 → 3

Patient Monitor
    → added
```

This must be considered ONE document revision.

Do not treat these as separate revisions.

---

# 5. HISTORY REQUIREMENT

The History architecture is already decided and MUST NOT be redesigned.

History is:

**append-only complete snapshots.**

Example:

```text
Revision #1
  Bedsidemonitor × 1
  Ventilator × 1
  Audiometer × 1

Revision #2
  Patient Monitor × 1
  Ventilator × 3
```

History #1 must remain unchanged.

History #2 represents the complete resulting document state.

Do NOT propose delta history.

Do NOT propose negative quantity history.

Do NOT propose event sourcing.

Do NOT propose a new generic revision framework.

---

# 6. WHAT YOU MUST INSPECT

Inspect the actual implementation currently in the repository.

At minimum inspect:

## CalibrationRequest

* Prisma model
* CalibrationRequestItem
* `revise()`
* existing update/create logic
* controller route
* portal revision hook
* portal revision dialog/form
* device/item selection logic

Determine whether Revision can:

```text
✓ change qty
✓ add item
✓ remove item
✓ replace device
✓ combine all of the above
```

---

## Quotation

Inspect:

* Prisma model
* QuotationItem
* `revise()`
* existing update/create logic
* controller route
* portal revision hook
* portal revision dialog/form
* relationship to CalibrationRequestItem

Determine whether Revision can:

```text
✓ change qty
✓ add item
✓ remove item
✓ replace device
✓ combine all of the above
```

---

## PurchaseOrder

Inspect:

* Prisma model
* PurchaseOrderItem
* `revise()`
* controller route
* portal revision hook
* portal revision UI
* relationship to QuotationItem
* WorkOrder relationship
* existing uniqueness constraints

Determine whether Revision can:

```text
✓ change qty
✓ add item
✓ remove item
✓ replace device
✓ combine all of the above
```

Do not infer capability merely from schema legality.

Trace the actual service/API behavior.

---

## WorkOrder

Inspect:

* Prisma model
* WorkOrderItem
* `revise()`
* controller route
* portal revision hook
* portal revision UI
* relationship to PurchaseOrderItem
* CalibrationJob fan-out
* existing immutability invariant
* WorkOrder status boundary

Determine whether Revision can:

```text
✓ change qty
✓ add item
✓ remove item
✓ replace device
✓ combine all of the above
```

Pay particular attention to:

```text
PLANNED
ASSIGNED
IN_PROGRESS
DONE
CANCELLED
```

and the existing WorkOrderItem immutability rule.

---

# 7. DO NOT CONFUSE SCHEMA CAPABILITY WITH BUSINESS CAPABILITY

For every entity, distinguish:

### Schema allows it

versus:

### Service actually supports it

versus:

### API exposes it

versus:

### UI allows the user to perform it

Example:

A second `QuotationItem` may technically be schema-legal.

That does NOT automatically mean the Revision API correctly supports adding a new item.

Similarly, a UI may display a quantity input.

That does NOT mean the complete revision scope can be changed.

---

# 8. IMPORTANT: TRACE THE COMPLETE DATA CHAIN

Do not analyze each entity in isolation.

Trace:

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

Determine how each of these operations propagates:

### Replace

```text
Device A
→ Device B
```

### Add

```text
Device A
→ Device A + Device B
```

### Remove

```text
Device A + Device B
→ Device A
```

### Quantity increase

```text
Device A × 1
→ Device A × 3
```

### Quantity decrease

```text
Device A × 3
→ Device A × 1
```

### Combined

```text
A × 1
B × 1
C × 1

→

D × 1
B × 3
```

For each, identify what happens to downstream relationships.

---

# 9. PARTICULARLY IMPORTANT: ITEM IDENTITY

Determine exactly what the existing model treats as the identity of an item.

Do not assume that:

```text
deviceTypeId
```

alone identifies a business line.

Do not assume that:

```text
id
```

alone represents a physical device.

Inspect:

* `deviceTypeId`
* serial number
* item primary key
* parent foreign keys
* quotationItemId
* purchaseOrderItemId
* requestItemId
* WorkOrderItem relationships
* any existing uniqueness constraints
* existing comments/docstrings
* CalibrationJob source relationships

Explain what one item row means at each level.

---

# 10. SERIAL NUMBER

Explicitly investigate the impact of serial number on revision semantics.

Examples:

### Existing

```text
Bedsidemonitor
Serial: ABC-001
Qty: 1
```

### Possible revision

```text
Ventilator
Serial: XYZ-001
Qty: 1
```

Determine whether the current Revision implementation can correctly represent such a change.

Also determine what happens if:

```text
Serial = NULL
```

or if multiple units are represented through aggregate quantity.

Do NOT invent a new serial-number architecture.

Only report what the existing code supports.

---

# 11. CURRENT UI — IMPORTANT

Inspect the actual UI, especially the Requisition screenshot-equivalent implementation.

Determine why the current Revision dialog appears to provide only:

```text
Current Qty
[ quantity input ]
```

and does not provide:

```text
Add item
Remove item
Replace device
```

Do not fix it.

Only explain:

1. What the UI currently sends.
2. What the backend currently accepts.
3. What business operations are therefore impossible.
4. Whether the limitation is UI-only or also exists in backend/service logic.

---

# 12. BACKEND REVISION CONTRACT

For every entity, explicitly document the actual current `revise()` contract.

For example:

```text
revise(id, body)
```

or:

```text
revise(id)
```

and document what `body` can contain.

Do not propose the ideal contract yet.

Report the actual implemented contract.

---

# 13. REQUIRED MATRIX

Produce a matrix like this:

| Entity             | Change Qty | Add Item | Remove Item | Replace Device | Combined Revision | UI Supports All |
| ------------------ | ---------- | -------- | ----------- | -------------- | ----------------- | --------------- |
| CalibrationRequest | ?          | ?        | ?           | ?              | ?                 | ?               |
| Quotation          | ?          | ?        | ?           | ?              | ?                 | ?               |
| PurchaseOrder      | ?          | ?        | ?           | ?              | ?                 | ?               |
| WorkOrder          | ?          | ?        | ?           | ?              | ?                 | ?               |

Use:

```text
YES
NO
PARTIAL
```

Do not use vague wording.

For every `PARTIAL` or `NO`, explain exactly why.

---

# 14. MINIMUM CORRECTION SCOPE

After the factual analysis, determine the minimum implementation correction required to satisfy the actual business requirement.

Separate:

### Backend gap

What must change in service/API semantics?

### UI gap

What must change in the revision form/dialog?

### Data-model gap

Only if genuinely necessary.

Do NOT implement anything.

Do NOT create migrations.

Do NOT modify Prisma.

Do NOT change any file.

---

# 15. IMPORTANT CONSTRAINT

Do NOT automatically conclude:

> "Create a new item row for every changed item."

That was an earlier hypothesis and is NOT the business requirement.

Determine the correct representation from the existing domain model.

The desired revision should be understood as:

> **The user submits the desired resulting item scope.**

The implementation can then determine how to preserve existing immutable snapshots and downstream relationships.

---

# 16. WORKORDER / CALIBRATIONJOB

Explicitly analyze the effect of:

```text
add item
remove item
replace device
quantity increase
quantity decrease
combined revision
```

on:

```text
WorkOrderItem
CalibrationJob
```

Do not modify fan-out behavior.

Do not propose a new fan-out architecture.

If the current implementation makes some revision impossible after `start()`, document the exact boundary and why.

---

# 17. OUTPUT — MARKDOWN ONLY

Write a Markdown report to:

```text
D:\medcal\docs\minutes-of-meeting
```

Suggested filename:

```text
mom-1-revision-scope-semantics-gap-analysis-20260920.md
```

The report must contain ONLY these major sections:

## 1. Executive Finding

One concise statement of whether the current implementation fully satisfies the actual Revision requirement.

## 2. Current Revision Contract

Actual backend/API/UI behavior.

## 3. Entity-by-Entity Analysis

CalibrationRequest, Quotation, PurchaseOrder, WorkOrder.

## 4. Change Capability Matrix

The required table.

## 5. Concrete Scenario Analysis

Analyze all of:

```text
1. Device replacement
2. Add item
3. Remove item
4. Qty increase
5. Qty decrease
6. Combined revision
```

## 6. Data Chain / Downstream Impact

Explain:

```text
CalibrationRequest
→ Quotation
→ PurchaseOrder
→ WorkOrder
→ CalibrationJob
```

## 7. Exact Gaps

Separate backend/API/UI/data-model gaps.

## 8. Minimum Correction Scope

Describe what must be changed, but DO NOT implement it.

## 9. Risks / Constraints

Only concrete constraints found in the existing code.

## 10. Final Recommendation

State the exact implementation direction required.

End the report with:

```text
REVISION SCOPE RULE:

A Revision represents the user's desired resulting document scope,
not merely a quantity adjustment. It must support device replacement,
item addition, item removal, quantity increase/decrease, and combinations
of these changes, while preserving the previous complete document state
as an immutable append-only history snapshot and respecting all existing
downstream snapshot/immutability boundaries.
```

---

# 18. FINAL REMINDER

This task is analysis only.

**DO NOT CHANGE CODE.**

**DO NOT CHANGE SCHEMA.**

**DO NOT CHANGE UI.**

**DO NOT IMPLEMENT THE CORRECTION.**

The next implementation prompt will be created only after this report has been reviewed.
