# MOM #1 — FINAL REVISION SCOPE IMPLEMENTATION

Implement the approved design in:

docs/minutes-of-meeting/mom-1-final-revision-scope-design-20260920.md

This is now an IMPLEMENTATION TASK.

IMPORTANT:
- DO NOT AUDIT AGAIN.
- DO NOT REDESIGN.
- DO NOT RE-INVESTIGATE THE BUSINESS RULES.
- DO NOT EXPAND THE SCOPE.
- DO NOT ADD FEATURES.
- DO NOT INVENT ALTERNATIVE ARCHITECTURE.
- DO NOT reopen previously settled decisions.
- Implement ONLY the approved design from the report above.
- Inspect the existing code before editing so the implementation follows the current architecture.
- Follow all existing `.claude/rules`.
- Preserve existing behavior outside this defined revision scope.

The design report is the source of truth for this implementation.

==================================================
1. CORE REVISION MODEL
==================================================

Revision is DESIRED-SCOPE RECONCILIATION.

It is NOT quantity-only revision.

The desired result may contain any combination of:

- unchanged items
- quantity changes
- added items
- removed items
- device replacement

Replacement is represented internally as:

REMOVED + ADDED

Do not introduce a new persistence concept such as:
- replacedById
- supersedesId
- replacement entity
- generic revision framework

Item identity is ALWAYS the row primary key `id`.

NEVER match revision items by:
- deviceTypeId
- requestItemId
- quotationItemId
- purchaseOrderItemId
- deviceId
- tariffId
- any other business attribute

Those are lineage/reference fields, not revision identity.

==================================================
2. RECONCILIATION
==================================================

For current vs desired scope:

CURRENT id exists in DESIRED:
- same relevant values → UNCHANGED
- different qty → QTY_CHANGED

CURRENT id absent from DESIRED:
- REMOVED

DESIRED entry without an existing CURRENT id:
- ADDED

Replacement:
- old row REMOVED
- new row ADDED

The entire desired scope must be processed in ONE atomic revision transaction.

==================================================
3. HISTORY
==================================================

Keep the existing History architecture exactly as designed.

Before applying the revision:

1. Snapshot the complete current header.
2. Snapshot ALL current items.
3. Allocate the revision number using the existing locking/race-safety mechanism.
4. Apply the complete desired-scope reconciliation.
5. Recompute header totals from the resulting ACTIVE scope.
6. Record the existing AuditLog revision event.
7. Commit.

History remains:
- append-only
- complete snapshot
- immutable
- no UPDATE
- no DELETE

Do not redesign the existing History tables.

Do not add delta-style history.

Do not add DELETED history rows.

==================================================
4. REMOVE SEMANTICS
==================================================

UNCONSUMED item:

History snapshot first → hard DELETE.

CONSUMED item:

History snapshot first → RETIRE/INACTIVATE.

Never hard-delete a consumed item.

For PurchaseOrderItem specifically:

PurchaseOrderItemStatus.CANCELLED
= the retirement state.

Do not introduce another PO-item retirement mechanism.

==================================================
5. CALIBRATION REQUEST ITEM / QUOTATION ITEM
==================================================

The approved design identified a real schema gap:

CalibrationRequestItem and QuotationItem currently have no retirement/inactive field.

For implementation, use the minimum schema extension required by the approved design.

Use the same simple retirement concept for both:

- `isActive Boolean @default(true)`

Do NOT introduce a richer status enum.

Semantics:

isActive = true
→ active scope

isActive = false
→ retired/inactive

For consumed removal:

History snapshot → isActive = false.

For unconsumed removal:

History snapshot → hard DELETE.

Active propagation must ignore inactive rows.

Do not create any additional lifecycle status.

==================================================
6. QUANTITY SEMANTICS
==================================================

UNCONSUMED row:

Quantity may be updated in place.

CONSUMED row, quantity INCREASE:

Do not mutate the frozen row.

Create a sibling row containing ONLY the delta.

Example:

1 → 3

existing row:
qty = 1

new sibling:
qty = 2

Active total = 3.

CONSUMED row, quantity DECREASE:

Do not mutate the frozen row.

Treat it as:

REMOVE old row
+
ADD new row

The old row becomes retired/inactive.

The new row contains the FULL desired quantity.

Example:

3 → 1

old row:
qty = 3
retired

new row:
qty = 1
active

Do NOT use negative deltas.

Do NOT mutate consumed/frozen rows.

==================================================
7. PURCHASE ORDER
==================================================

Keep PurchaseOrder.revise() as a NO-BODY, PULL-BASED operation.

Do not change it into a desired-scope input API.

It reconciles against the active Quotation scope.

Behavior:

- active QuotationItem without PO representation → create PurchaseOrderItem
- PO item whose source QuotationItem is inactive → retire it
- PurchaseOrderItem with no downstream WorkOrderItem may be hard-deleted where the approved design permits the unconsumed path
- PurchaseOrderItem with downstream WorkOrderItem → use:
  status = CANCELLED

Never mutate an existing PurchaseOrderItem quantity to represent upstream revision.

Recompute PO totals from ACTIVE PurchaseOrderItems only.

==================================================
8. WORK ORDER
==================================================

Keep WorkOrder.revise() as a NO-BODY, PULL-BASED operation.

Do not turn it into a desired-scope input API.

It reconciles against ACTIVE PurchaseOrderItems only.

Behavior:

- active PO item without WorkOrderItem → create WorkOrderItem
- WorkOrderItem whose source PO item is inactive → hard DELETE

Do not add a WorkOrderItem retirement status.

Do not mutate existing WorkOrderItem quantity or identity.

Preserve the existing WorkOrderItem immutability rule.

==================================================
9. WORK ORDER REVISION BOUNDARY
==================================================

Preserve the existing revision gate:

ONLY:

- PLANNED
- ASSIGNED

are revision-eligible.

IN_PROGRESS and later are NOT revision-eligible.

Do not change this rule.

Do not introduce:
- CalibrationJob.CANCELLED
- CalibrationJob.VOIDED
- job cancellation
- job rollback
- job re-fanout
- any new CalibrationJob lifecycle architecture

Do not modify the existing CalibrationJob fan-out mechanism.

==================================================
10. CROSS-CHAIN SAFETY GUARD
==================================================

Before retiring an upstream consumed item, evaluate the downstream chain INSIDE
the same transaction using current transactional data.

If retirement would affect a WorkOrderItem belonging to a WorkOrder that is:

- PLANNED
- ASSIGNED

then the retirement may proceed.

If it would affect a WorkOrderItem belonging to:

- IN_PROGRESS
- DONE
- CANCELLED

then REJECT the revision.

Do not attempt to:
- cancel jobs
- delete jobs
- alter jobs
- alter an IN_PROGRESS WorkOrder
- bypass the WorkOrder revision boundary

The transaction must rollback completely when this guard rejects the operation.

Use a clear actionable backend error.

Do not invent a new override workflow.

==================================================
11. PROPAGATION
==================================================

Preserve the existing PULL, NOT PUSH architecture.

Do NOT automatically cascade revision from:

Quotation → PO → WO

or:

Request → Quotation

Instead:

CalibrationRequest.revise()
Quotation.revise()
PurchaseOrder.revise()
WorkOrder.revise()

remain separate revision operations.

PO pulls active scope from Quotation.

WO pulls active scope from PO.

Only ACTIVE scope propagates.

Inactive/retired scope must never be propagated downstream.

==================================================
12. UI / UX
==================================================

For CalibrationRequest and Quotation revision UI:

The revision editor must represent the COMPLETE DESIRED SCOPE.

It must support, in one revision:

- Add Device
- Change Device
- Remove Device
- Change Quantity

All changes are accumulated into one desired-scope submission.

Change Device is presented as one user action but is persisted as:

REMOVE old row + ADD new row.

Do not create a special replacement persistence mechanism.

Do not retain the old row's id for the new device.

The UI should clearly distinguish:
- unchanged
- changed
- added
- removed

Do not redesign the application's existing visual language.

Reuse existing device/type selectors and existing form components where available.

For PO and WO:

Keep the existing trigger-style revise flow.

Add only the minimum preview/confirmation information necessary to show what
the pull revision will change.

Do not create a new workflow.

==================================================
13. DOCUMENT NUMBERS
==================================================

Customer-facing document numbers MUST NOT change.

Preserve existing numbers for:

- Requisition
- Quotation
- PO
- WOL/SPK

Revision must never allocate a new customer-facing document number.

==================================================
14. TRANSACTION / CONCURRENCY
==================================================

Every single revise() operation must remain ONE atomic Prisma transaction.

The transaction must include:

- current-state read
- locking/race-safety
- revision number allocation
- history snapshot
- reconciliation
- add/remove/update/retirement
- total recalculation
- audit log

Cross-chain safety checks MUST happen inside the transaction.

Preserve the existing locking strategy and `allocateRevisionNumber()` contract.

Do not introduce new transaction infrastructure.

==================================================
15. AUDIT LOG
==================================================

Keep the existing AuditLog mechanism.

One revision action → one revision AuditLog entry.

Do not redesign AuditLog.

Do not add item-level change payloads to AuditLog.

History remains the detailed document snapshot.

==================================================
16. TESTING
==================================================

Add/update tests only for this implementation scope.

Minimum coverage must include:

CalibrationRequest:
- unchanged
- qty change
- add
- remove unconsumed
- remove consumed → inactive
- replace
- consumed qty increase
- consumed qty decrease

Quotation:
- same categories

PurchaseOrder:
- pull new active scope
- retire CANCELLED PO item
- preserve active scope
- cross-chain safety guard

WorkOrder:
- pull new active PO scope
- remove inactive PO-derived item
- PLANNED/ASSIGNED revision boundary
- reject revision after IN_PROGRESS

Combined revision scenarios must verify that one revision can contain:
- add + remove
- replace + qty change
- add + remove + qty change

Verify transaction rollback on failure.

Do not chase unrelated existing test failures.

==================================================
17. REPORTING
==================================================

After implementation, create a concise implementation report:

docs/minutes-of-meeting/mom-1-final-revision-scope-implementation-20260920.md

Report:

1. Files changed
2. Schema/migration changes
3. Backend changes
4. UI changes
5. Tests executed and results
6. Any genuinely blocking issue

Do not perform another audit report.

Do not create a redesign report.

Do not reopen business decisions.

==================================================
18. HARD STOP / SCOPE CONTROL
==================================================

If you encounter something outside this design:

DO NOT redesign it.

DO NOT expand the scope.

DO NOT "improve" adjacent functionality.

DO NOT introduce a new architecture.

Implement the approved design only.

If something is genuinely required for this exact implementation but is not
covered by the design, stop and report that specific blocker rather than
inventing a solution.

Otherwise proceed directly with implementation.

FINAL RULE:

IMPLEMENT THE APPROVED DESIGN.
NO NEW AUDIT.
NO REDESIGN.
NO FEATURE EXPANSION.
NO ARCHITECTURAL IMPROVEMENT.