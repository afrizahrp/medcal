# MOM #1 Final Clarification — Item Revision Rule for the 1 → 3 Qty Case

**Status:** Clarification only. No code, schema, migration, or UI changed.
Answers the single open question left by the prior review
(`mom-1-review-transaction-revision-immutable-history-20260919.md`): whether
"every quantity increase is a new item row" should apply uniformly, or whether
the existing model already supports in-place `qty` mutation for some entities.

---

## 1. Existing Item Semantics

| Entity | Quantity field | FK to parent item | Uniqueness on that FK | Doc comment | Service method that touches items today |
|---|---|---|---|---|---|
| `CalibrationRequestItem` | `qty Int @default(1)` — *"Aggregate quantity for this line… how many physical units of this device the customer is requesting."* (`schema.prisma:1597-1601`) | — (top of chain) | `requestId`+`deviceTypeId` are separately indexed, **not** a composite unique (`schema.prisma:1620-1621`) — more than one line per device type is already legal | none | `CalibrationRequestsService.update()` — delete+recreate all items, **only while `status === "DRAFT"`** (`calibration-requests.service.ts:207, 245-263`) |
| `QuotationItem` | `qty Decimal @default(1)` | `requestItemId String?` — plain nullable FK (`schema.prisma:1720`) | **not unique** — nothing stops a second `QuotationItem` row pointing at the same `requestItemId` | none | `QuotationsService.update()` — delete+recreate all items, **only while `status === "DRAFT"`** (`quotations.service.ts:607, 631-634`) |
| `PurchaseOrderItem` | `qty Decimal @default(1)` | `quotationItemId String` (`schema.prisma:1783`) | `@@unique([purchaseOrderId, quotationItemId])` (`schema.prisma:1803`) — one row per `quotationItemId` **within a PO** | none | **no service method ever writes to `items`** — `PurchaseOrdersService.update()` only touches `customerPoNumber`/`customerPoDate`/`notes`, in any status (`purchase-orders.service.ts:267-303`) |
| `WorkOrderItem` | `qty Decimal @default(1)` | `purchaseOrderItemId String` (`schema.prisma:1875`) | `@@unique([workOrderId, purchaseOrderItemId])` (`schema.prisma:1884`) — one row per `purchaseOrderItemId` **within a WO** | *"Operational snapshot of a PurchaseOrderItem… **Quantity and source identity are immutable after create.**"* (`schema.prisma:1869-1870`) | **no service method ever writes to `items`** — `WorkOrdersService.update()` only touches logistics fields (`work-orders.service.ts:413-439`) |

Each level is populated by **copying its parent's current items once, at
creation time**, and never re-syncing afterward:
- `QuotationsService.create()` → `buildGeneratedRows()` copies `qty` from each
  `CalibrationRequestItem` (`quotations.service.ts:350`).
- `PurchaseOrdersService.create()` → copies `quotation.items` 1:1
  (`purchase-orders.service.ts:165-179`).
- `WorkOrdersService.create()` → copies `purchaseOrder.items` 1:1
  (`work-orders.service.ts:290-298`).

So `PurchaseOrderItem` behaves exactly like `WorkOrderItem` in practice today
(no code path ever mutates it after creation) — it simply lacks
`WorkOrderItem`'s explicit doc comment saying so.

**`CalibrationJob` fan-out** (`work-orders.service.ts:577-614`,
`fanOutCalibrationJobs`) reads `WorkOrderItem.qty` and creates `unitOrdinal
1..qty` jobs — but its idempotency guard is **WorkOrder-wide**, not per-item:
```
const alreadyFannedOut = await tx.calibrationJob.count({ where: { workOrderId } });
if (alreadyFannedOut > 0) { … return; }   // skips ALL items, not just already-fanned ones
```
Once a WorkOrder has fanned out once (at its first `start()`), a new
`WorkOrderItem` row added afterward gets **no jobs at all** through any
existing mechanism.

---

## 2. 1 → 3 Case Analysis

Walking "Equipment A, qty 1 → +2 → qty 3" down the chain:

- **`CalibrationRequestItem`.** Nothing in the schema blocks setting
  `qty: 1 → 3` on the same row. The only thing blocking it *today* is the
  header gate (`status !== "DRAFT"` → 400). If the request is still DRAFT (no
  `Quotation` generated from it yet — recall `Quotation.requestId` is
  `@unique`, so at most one `Quotation` can ever exist per request, and it's
  usually created early), the existing `update()` path already does this
  correctly, in place, today. No gap.
- **`QuotationItem`.** Same story: `qty: 1 → 3` in place is schema-legal, and
  `QuotationsService.update()` already does exactly this (delete+recreate)
  while `status === "DRAFT"`. The risk appears only once a `PurchaseOrder` has
  been created from this quotation (`PurchaseOrder.create()` requires
  `quotation.status === "APPROVED"`, so this can only happen after DRAFT
  anyway) — at that point the `PurchaseOrderItem` row already copied `qty: 1`
  and will never see the update.
- **`PurchaseOrderItem`.** No code mutates this today, in any status. If it
  *were* mutated in place to `qty: 3` after a `WorkOrder` already exists for
  this PO, the already-created `WorkOrderItem` row (unique per
  `purchaseOrderItemId`) would be left at `qty: 1` forever, permanently
  desynced, with **no way to add a compensating row** for the missing 2 units
  because a second `WorkOrderItem` for the same `purchaseOrderItemId` is
  blocked by `@@unique([workOrderId, purchaseOrderItemId])`. This is the
  concrete mechanism by which "PurchaseOrderItem has no doc comment forbidding
  mutation" turns out not to matter — its child's constraint makes in-place
  mutation unsafe anyway, once that child exists.
- **`WorkOrderItem`.** Forbidden outright by its own doc comment. The only
  schema-legal way to land at "3 total units of Equipment A" is a **second
  row**: `qty: 2`, pointing at a *different* `purchaseOrderItemId` (satisfying
  the unique constraint trivially), leaving the original `qty: 1` row
  untouched. That new row needs its own `PurchaseOrderItem` (new id) and, to
  keep the same rule consistent one level up, its own `QuotationItem` (new
  id) — both are schema-legal additions (neither `PurchaseOrderItem` nor
  `QuotationItem` has a uniqueness rule that blocks a second row for the same
  `requestItemId`/quotation). The new `WorkOrderItem` row then fans out its
  own 2 `CalibrationJob`s the next time `start()` runs — but only if this
  happens **before** the WorkOrder's first `start()` (see the fan-out guard in
  §1); after that, no existing mechanism creates jobs for a newly added item.

---

## 3. Entity-by-Entity Recommendation

- **`CalibrationRequestItem`** — in-place `qty` mutation is correct and
  already supported by the existing model, for as long as no `Quotation` has
  been generated from the request yet. This is the status quo; no gap here.
- **`QuotationItem`** — in-place `qty` mutation is correct and already
  supported by the existing model, for as long as no `PurchaseOrder` has been
  created from the quotation yet. Status quo; no gap here.
- **`PurchaseOrderItem`** — must **not** be mutated in place once a
  `WorkOrder` exists for the PO (even though nothing in its own schema forbids
  it — its child's constraint does). Before a WorkOrder exists, mutating it in
  place would be schema-safe, but no code does this today; not needed to
  resolve the 1→3 case since the risk only materializes post-WorkOrder-creation
  anyway. Once a WorkOrder exists: additive new row only.
- **`WorkOrderItem`** — in-place mutation is forbidden (existing doc comment +
  existing code behavior). Smallest compliant fix: **append one new
  `WorkOrderItem` row carrying the delta qty**, backed by one new
  `PurchaseOrderItem` row and one new `QuotationItem` row (both schema-legal,
  no constraint conflict), leaving every existing row byte-for-byte untouched.
  Must happen before the WorkOrder's first `start()` (fan-out is WorkOrder-wide
  idempotent, not per-item).

---

## 4. Final Recommended Rule

The dividing line is **not** "which entity type" and **not** simply "header
status" — it is: *has a downstream row already been snapshotted from this
one?* Before that snapshot exists, in-place `qty` mutation is safe and is
exactly what the existing DRAFT-gated `update()` methods already do. After
that snapshot exists, the parent row must stay frozen (mutating it would
silently desync the child, and the child's own uniqueness constraint blocks
adding a compensating row for the same parent id) — so the delta must be
carried by a **new sibling row**, at that level and every level below it.

This narrows, rather than contradicts, the prior review's blanket "always a
new row": for `CalibrationRequestItem` and `QuotationItem`, in-place mutation
is already how the existing code works and needs no change. For
`PurchaseOrderItem` (once a WorkOrder exists) and `WorkOrderItem` (always,
per its own invariant), the additive-row rule from the prior review stands.

---

## 5. Implementation Constraints

- No schema change is required to support the additive-row case at any level
  — `QuotationItem.requestItemId` (not unique) and `PurchaseOrderItem`'s /
  `WorkOrderItem`'s unique constraints (keyed by parent-item id, not by
  request/device identity) already permit a second row for the same logical
  device line.
- `fanOutCalibrationJobs()` is idempotent **per WorkOrder, not per item**
  (`work-orders.service.ts:581-587`) — any scope addition (a new
  `WorkOrderItem` row) must be created **before** that WorkOrder's first
  `start()` call, or it will never receive `CalibrationJob`s through the
  existing fan-out path. This is a pre-existing behavior, not something this
  clarification proposes changing.
- `PurchaseOrderItem` must switch from "never touched by any code" to
  "additive-only" — not "mutate in place" — the moment a `WorkOrder` exists
  for its parent PO. Before that point, no change to its current (untouched)
  behavior is needed for the 1→3 case.
- This clarification does not change when/how a `Quotation`/`PurchaseOrder`/
  `WorkOrder` header itself becomes revisable (that remains governed by the
  prior review's header-level `Revise` design) — it only settles how the
  *item rows* behave once a revision is triggered.

---

> **ITEM REVISION RULE: An item row's `qty` may be mutated in place only until a downstream row has been snapshotted from it (exactly what `CalibrationRequestItem`/`QuotationItem` already do today, gated to DRAFT); once such a snapshot exists — always the case for `WorkOrderItem`, and for `PurchaseOrderItem` once a WorkOrder has been created from it — the row stays frozen and any quantity increase is carried by a new sibling item row (new `PurchaseOrderItem`/`WorkOrderItem`, chained through new FKs) added before that level's own lock boundary (WorkOrder's first `start()`), never by editing the existing row's `qty`.**
