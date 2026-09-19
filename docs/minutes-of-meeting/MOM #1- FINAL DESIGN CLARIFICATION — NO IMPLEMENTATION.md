# FINAL DESIGN CLARIFICATION — NO IMPLEMENTATION

Do NOT implement anything.

Do NOT modify code, schema, migration, API, or UI.

This is a **targeted clarification only** for one unresolved point from the previous review.

The overall architecture is already decided:

* Existing operational tables remain current state.
* Append-only full-snapshot history tables are added.
* History includes both header and item snapshots.
* `CalibrationRequest` is the existing backend model for the Requisition domain object.
* Therefore `CalibrationRequestHistory` and `CalibrationRequestItemHistory` are included.
* Customer-facing document numbers remain unchanged.
* Existing status enums remain unchanged.
* Existing AuditLog remains separate from document history.
* No workflow redesign.

## ONLY QUESTION TO RESOLVE

The previous review recommended:

> "Every item-level quantity increase should be represented by a new item row."

We are NOT accepting that rule yet.

Inspect the existing Prisma schema and service logic for:

* CalibrationRequestItem
* QuotationItem
* PurchaseOrderItem
* WorkOrderItem
* CalibrationJob fan-out

Determine the existing domain semantics of:

```text
item identity
quantity
serial number
line item
source item relationship
```

Specifically answer this concrete business case:

```text
Initial:
Equipment A
qty = 1

Customer requests:
+2 units

Expected business result:
Equipment A
qty = 3
```

Determine whether the existing model supports changing the current `qty` from 1 → 3 for each entity before its relevant lock boundary.

If a specific entity (especially WorkOrderItem) intentionally forbids quantity mutation after creation, explain the smallest way to produce the correct resulting current scope while preserving that existing invariant.

## IMPORTANT

Do NOT propose:

* a new item model
* a new workflow
* event sourcing
* CQRS
* new status enums
* generic revision architecture
* unrelated refactoring

Do NOT make assumptions.

Base the answer on the existing code.

## OUTPUT

Write a concise Markdown report containing only:

1. Existing Item Semantics
2. `1 → 3` Case Analysis
3. Entity-by-Entity Recommendation
4. Final Recommended Rule
5. Implementation Constraints

End with one explicit statement:

> **ITEM REVISION RULE: ...**

No code changes.
No implementation.
No migration.
No UI changes.
