# MOM #1 Review — Transaction Revision & Immutable History

**Status:** Review only. No code changed. This report validates the proposal in
`MOM #1-REVIEW ONLY — Transaction Revision & Immutable History.md` against the
Medcal codebase as it exists today (main, commit `4841f4d`).

**Scope of inspection:** `packages/db/prisma/schema.prisma`; the four chain
services (`calibration-requests.service.ts`, `quotations.service.ts`,
`purchase-orders.service.ts`, `work-orders.service.ts`) and their controllers;
`packages/db/src/document-number/document-number.service.ts`;
`apps/api/src/modules/calibration-jobs/audit-log.ts`; the portal Quotation
detail page (`apps/portal/src/app/management/quotations/[id]/page.tsx`) as a
representative UI pattern.

---

## 1. Existing Architecture Findings

**Every header in the REQ → QUOTATION → PO → WOL/SPK chain is already
DRAFT-only editable, and this is a known, unresolved gap in the code:**

| Entity | Update method | Gate | Evidence |
|---|---|---|---|
| `CalibrationRequest` | `.update()` | `status !== "DRAFT"` → 400 | `calibration-requests.service.ts:207`, with an explicit `// TODO: Full edit-permission business rules need confirmation. Currently only allowing edits while status is DRAFT` |
| `Quotation` | `.update()` | `status !== "DRAFT"` → 400 | `quotations.service.ts:607`, comment: *"Commercial freeze: only DRAFT may be edited. SENT and later statuses keep historical commercial meaning (locked planning contract)."* |
| `PurchaseOrder` | `.update()` | `status !== "DRAFT"` → 400, and never touches `items` at all, even in DRAFT | `purchase-orders.service.ts:274-303` |
| `WorkOrder` | `.update()` | allowed while `PLANNED`/`ASSIGNED`/`IN_PROGRESS` (`assertNonTerminal`), but only mutates logistics fields (`addressText`, `geoLat/Lng`, `locationNotes`, `scheduledStart/End`) — never `items` | `work-orders.service.ts:413-439` |

I checked all four controllers (`@Post`/`@Patch` routes) — there is **no
existing endpoint, on any of the four entities, that can add or change items
once the header has left DRAFT.** The MOM's "Revise" action is closing a real,
already-acknowledged gap (the `CalibrationRequest` TODO says so directly), not
introducing a new business capability from nothing.

**Item lineage is a strict 1:1 chain, enforced by unique constraints:**

- `Quotation.requestId` is `@unique` (`schema.prisma:1684`) — at most one
  Quotation can ever exist per `CalibrationRequest`. `QuotationsService.create()`
  additionally defends this with a `ConflictException` (`DUPLICATE_QUOTATION_FOR_REQUEST`).
- `PurchaseOrderItem` → `@@unique([purchaseOrderId, quotationItemId])`.
- `WorkOrderItem` → `@@unique([workOrderId, purchaseOrderItemId])`.
- `PurchaseOrder.create()` and `WorkOrder.create()` both defend "one active
  child per parent" in the service layer (`existingActive` lookups,
  `status: { not: "CANCELLED" }`) — for `WorkOrder` this is additionally backed
  by a **partial unique DB index** (`WorkOrder_purchaseOrderId_active_key`,
  documented at `schema.prisma:1859-1860`); for `PurchaseOrder` the equivalent
  check exists only in code (`purchase-orders.service.ts:121-135`), with no DB
  backstop.

**`WorkOrderItem` carries an explicit immutability invariant:**

> *"Operational snapshot of a PurchaseOrderItem. MVP copies every PO item 1:1.
> Quantity and source identity are immutable after create."*
> — `schema.prisma:1869-1870`

No service method updates a `WorkOrderItem` row after creation. `CalibrationJob`
fan-out (`unitOrdinal`/`unitTotal`, `schema.prisma:2037-2052`) reads
`WorkOrderItem.qty` once, at `WorkOrder.start()`
(`work-orders.service.ts:577-610`), and freezes it per job — the schema comment
on `unitTotal` says explicitly *"Frozen deliberately… does not change"* even
when sibling jobs are later cancelled.

**Reusable infrastructure already exists for every mechanical piece the MOM
asks about:**

- **Atomic, race-safe counters:** `DocumentNumberService.allocate()`
  (`packages/db/src/document-number/document-number.service.ts:43-89`) uses
  `INSERT … ON CONFLICT (companyId, documentType, year) DO UPDATE SET
  lastSequence = lastSequence + 1 … RETURNING`.
- **Transactional multi-step writes:** every existing `create()`/`update()`
  that touches more than one table already wraps in
  `prisma.$transaction(async (tx) => …)` (all four services).
- **Full item replace inside a transaction:** `Quotation.update()`
  (`quotations.service.ts:617-635`) already does `quotationItem.deleteMany` +
  `createMany` for a DRAFT edit — the exact shape a revision's item rebuild
  needs.
- **Retry-on-unique-conflict:** `purchase-orders.service.ts` and
  `work-orders.service.ts` both catch Prisma `P2002` via `isUniqueConstraintError`
  and rethrow as a typed `ConflictException`.
- **Generic audit trail:** `recordAuditLog()`
  (`apps/api/src/modules/calibration-jobs/audit-log.ts`) is explicitly
  documented as reusable for *"any future sensitive action"* — it writes
  `AuditLog` rows (`action`, `outcome`, `targetType/targetId`, free-form
  `metadata` JSON). It is **not** a snapshot store.
- **Status-gated UI actions:** the Quotation detail page already computes
  `isDraft`/`isSent`/`canCancel` booleans and conditionally renders an `Edit`
  link to a separate `/quotations/[id]/edit` route
  (`apps/portal/src/app/management/quotations/[id]/page.tsx:116-118, 347-353`).

---

## 2. Compatibility Assessment

The proposed shape — **current operational tables stay the source of current
state; add append-only header + item history tables** — is compatible with the
existing architecture, with two adjustments (detailed in §3 and §9):

1. **Revision must mutate the existing row, not create a new one with the same
   number.** The MOM leaves this ambiguous ("a revision creates a new current
   state" vs. "the old document state becomes CANCELLED"). Given the `@unique`
   constraints in Finding 1, creating a second live row sharing the same
   `number` (or, for Quotation, the same `requestId`) is not possible without a
   schema change, which is out of scope. This is not a new constraint being
   imposed by this review — it already exists. See §3 for the resolved design.

2. **Item-level revisions cannot be in-place qty edits on `WorkOrderItem`**
   without violating its documented immutability invariant (Finding 1). The
   minimal-diff way to satisfy the MOM's "3 equipment" example without
   touching that invariant is to always add a **new item row** for added
   scope, at every level, rather than bumping an existing row's `qty`. See §3.

Everything else in the proposal — INSERT-only history, full-snapshot (not
delta) rows, reusing existing status enums, no customer-facing renumbering —
is already consistent with how the codebase works today.

---

## 3. Recommended Minimal Design

**Header revision = in-place mutation, snapshotted first.**

`revise()` (new method per service, parallel to the existing `update()`):

1. Load the current header + items inside a `prisma.$transaction`.
2. Compute `nextRevisionNumber = (MAX(history.revisionNumber) WHERE
   <parent>Id = id) + 1` (starts at 1 if no history rows exist yet).
3. Insert one history header row (full snapshot of the header as it stood
   *before* this call) and one history item row per *current* item, all
   tagged with `nextRevisionNumber`.
4. Apply the change to the current row:
   - Header commercial fields (totals, tax) recomputed the same way
     `update()`/`create()` already do (`computeHeaderTotals`, `computeItemLine`
     in `quotations.service.ts`).
   - **New/changed items are inserted as new rows, never as an in-place edit
     of an existing item row's `qty`.** This keeps `WorkOrderItem`'s
     "immutable after create" invariant intact by construction and is
     consistent with `CalibrationRequestItem.qty` already meaning "aggregate
     qty for this line" — a top-up of the same device type is just another
     line, exactly like adding a different device type.
5. Write one `AuditLog` row via the existing `recordAuditLog()` (§8).
6. Return the updated header, same as `findOne()`.

**Propagation** (§4/§9) is pull, not push: each downstream entity's `revise()`
reads its *parent's current* items when it runs (the same way `PurchaseOrder.create()`
already snapshots `quotation.items` and `WorkOrder.create()` already snapshots
`purchaseOrder.items`) — no cascading write is needed from REQ all the way down
in one call; each level is revised independently, in the same order documents
are already created in.

---

## 4. State / Transition Rules

No new enum values, on any of the four entities. `Revise` becomes legal
exactly where `Edit` (`update()`) currently is *not*, minus the terminal/locked
states each entity already defines:

| Entity | `Edit` (existing) | `Revise` (new) | `View only` / locked |
|---|---|---|---|
| `CalibrationRequest` | `DRAFT` | `SUBMITTED`, `IN_QUOTATION` (not `CANCELLED`/`FULFILLED`) — **open question, see §9** | `CANCELLED`, `FULFILLED` |
| `Quotation` | `DRAFT` | `SENT`, `APPROVED` (not `REJECTED`/`EXPIRED`/`CANCELLED`) | `REJECTED`, `EXPIRED`, `CANCELLED` |
| `PurchaseOrder` | `DRAFT` | `APPROVED`, `RECEIVED`, `CONFIRMED` (not `FULFILLED`/`CANCELLED`) | `FULFILLED`, `CANCELLED` |
| `WorkOrder` | n/a (items never editable) | `PLANNED`, `ASSIGNED` only — **not** `IN_PROGRESS`, per the MOM's own lock rule and matching the existing `assertTransition`/fan-out boundary at `start()` | `IN_PROGRESS`, `DONE`, `CANCELLED` |

`CANCELLED` keeps its exact current meaning (explicit user cancellation of the
whole document) and is not touched by `Revise` — see §9 for why the MOM's
"old document becomes CANCELLED" clause does not apply once revision is
in-place.

---

## 5. Data Model Changes

Six new tables, exactly as proposed, INSERT-only at the service-layer
convention level (Prisma has no native append-only grant short of a DB-level
`REVOKE UPDATE, DELETE`, which is a real option but a new operational control,
not a schema change — flagged as a risk in §9, not adopted here):

```
quotation_history            quotation_item_history
purchase_order_history       purchase_order_item_history
work_order_history           work_order_item_history
```

Each header-history row: full commercial snapshot (subtotal/discount/tax/total,
currency, status, key dates) + `revisionNumber` + `revisedByUserId` +
`revisedAt`. Each item-history row: full item snapshot (description, qty,
unitPrice, discountAmount, lineTotal, source FKs) + the same `revisionNumber`,
scoped to its parent header history row (or directly to the header id +
`revisionNumber`, whichever is simpler given each ORM's relation modelling —
implementation detail, not an architecture decision).

**`revisionNumber` lives only on the history tables.** No `revision` column is
added to any operational header — the MOM's own instruction not to add one
"unless the review finds a concrete existing-code reason" is followed: no such
reason was found (see §3, computed via `MAX(history.revisionNumber)+1`).

**Open item — not decided by this review:** the proposed table list has no
`calibration_request_history` / `calibration_request_item_history`. Given
Finding 1 (CalibrationRequest has the identical "frozen after DRAFT" problem,
and it is the origin of the chain the MOM's own §D propagation question asks
about), this is a real gap, not a simplification. Two ways to close it, both
consistent with "no new business rules invented":

- (a) extend the identical pattern to `CalibrationRequest`/`CalibrationRequestItem`, or
- (b) explicitly decide that revisions always enter at the Quotation level and
  the originating Requisition is deliberately left stale (in which case the
  requisition no longer accurately represents "what the customer asked for,"
  which may or may not matter for this business — that's a business call, not
  an architecture one).

This review does not pick between (a) and (b); it flags that the MOM's table
list is currently silent on it while its own propagation question assumes REQ
is in scope.

---

## 6. API / Service Changes

One new method per service (`CalibrationRequestsService`/`QuotationsService`/
`PurchaseOrdersService`/`WorkOrdersService`), e.g. `revise(companyId, id, userId, input)`,
shaped exactly like the existing `create()`/`update()` transactions (same
`prisma.$transaction`, same tax/total recompute helpers, same
`findFirstOrThrow` return pattern). One new controller route per entity
(`POST :id/revise`), following the existing `POST :id/cancel` /
`POST :id/submit` pattern already used on all four controllers.

One new read-only method per service, e.g. `listHistory(companyId, id)` /
`getHistoryRevision(companyId, id, revisionNumber)`, and a matching `GET
:id/history` / `GET :id/history/:revisionNumber` route — no different in shape
from the existing `findAll`/`findOne` read paths.

No changes to `create()`, `update()`, `send()`, `approve()`, `reject()`,
`cancel()`, `submit()`, `assign()`, `start()`, or any other existing method
signature or behavior.

---

## 7. UI Changes

Smallest change per detail page, using the Quotation detail page's existing
pattern as the template:

- One additional boolean (`canRevise`, alongside the existing `isDraft`/
  `isSent`/`canCancel`) gating a new `Revise` button in the same action-button
  row `Edit` already lives in. `Revise` opens the *same* item-editing UI
  `Edit` uses (reuse the existing `/[id]/edit` route/component) but posts to
  `:id/revise` instead of `PATCH :id` when the header is no longer DRAFT.
- One always-visible `History` action (icon/button, matching the existing
  `Printer`/`Mail`/`FileText` icon-button row) that opens a read-only list of
  past revisions; selecting one renders the same detail layout already used
  for the current document, fed from `getHistoryRevision()` instead of
  `findOne()`, with all mutating actions hidden.
- No redesign of the existing detail/edit screens, no new screen type beyond
  the read-only history view.

---

## 8. Audit & Immutability

`AuditLog` and `*_history` have different, non-overlapping jobs and this
review found nothing in the existing `AuditLog` model or `recordAuditLog()`
that conflicts with adding `*_history` tables:

| | `AuditLog` (existing) | `*_history` (proposed) |
|---|---|---|
| Purpose | "this action happened" event trail | "the document looked like this" state snapshot |
| Shape | one row per action: `action`, `outcome`, `targetType/Id`, free-form `metadata` JSON | one row per revision per header/item: full typed commercial/business snapshot |
| Consumer | security/compliance review, generic | the document's own `History` UI, business users |
| Written by | `recordAuditLog()`, already generic/reusable | new, entity-specific insert logic inside each `revise()` |

`revise()` should write both, in the same transaction, with no duplication:
`AuditLog.metadata` can carry just `{ revisionNumber }` as a pointer back to
the full snapshot, rather than repeating the snapshot itself.

Immutability of `*_history` rows (INSERT-only) is enforced at the convention/
service-layer level, the same way `WorkOrderItem`'s "immutable after create"
invariant is enforced today (i.e., by never calling `.update()`/`.delete()` on
it from any service method) — not by a database-level constraint. This mirrors
existing practice in this codebase and is called out explicitly in §9 as a
residual risk rather than something this review is recommending be fixed now.

---

## 9. Risks / Edge Cases

- **`WorkOrderItem` immutability vs. the MOM's own "3 equipment" example.**
  Resolved in this review by treating all item-level growth as additive new
  rows (§3), never an in-place `qty` edit. If a future implementer instead
  bumps `qty` on an existing `WorkOrderItem` row to satisfy the MOM's literal
  wording, that silently breaks a documented invariant and the frozen
  `CalibrationJob.unitTotal` fan-out semantics. This is the single biggest
  risk if the report's design isn't followed as stated.
- **`CalibrationRequest` history gap** (§5) — the propagation chain's origin
  currently has no revision mechanism proposed for it, despite having the
  identical DRAFT-only-edit limitation as its downstream documents.
- **Revision-number race.** Computing `MAX(history.revisionNumber)+1` inside
  the same transaction as the header `UPDATE` relies on the header row's
  Postgres row lock (taken by the `UPDATE`) to serialize concurrent
  `revise()` calls on the *same* document. A `@@unique([<parentId>,
  revisionNumber])` on each history table, combined with the existing
  `isUniqueConstraintError`/`ConflictException` retry pattern already used
  elsewhere, is a cheap backstop worth including from day one rather than
  treating this as purely theoretical.
- **PO's "one active PO per quotation" has no DB-level backstop** (only a
  service-layer check, unlike WorkOrder's partial unique index) — pre-existing
  asymmetry, unrelated to this proposal, noted for awareness only. Not
  something this review recommends changing.
- **No DB-level enforcement of "INSERT only"** on the new history tables
  (§8) — consistent with existing codebase conventions but worth the
  implementer's awareness; a future `REVOKE UPDATE, DELETE` grant is a valid
  hardening step but is a new operational control, out of this review's scope.
- **`WorkOrder.update()` currently allows editing logistics fields while
  `IN_PROGRESS`** (`assertNonTerminal` permits it) — the MOM's IN_PROGRESS
  lock is specifically about *scope* (items), not logistics, and this review's
  recommended design does not touch that existing behavior.

---

## 10. Implementation Scope

Explicitly **not** covered by this review, and not recommended to be added by
it:

- No code changes of any kind (schema, service, controller, or UI) — this
  document is the only artifact produced.
- No new status enum values on any of the six enums the MOM lists.
- No new customer-facing document number formats (`-R1` etc.) — none proposed
  and none should be.
- No event-sourcing / CQRS infrastructure.
- No decision on the `CalibrationRequest` history gap (§5, §9) — flagged, not
  resolved, per "do not invent business rules."
- No DB-level append-only enforcement (grants/triggers) — noted as a future
  hardening option only.

---

## 11. Explicitly NOT Changing

- `CalibrationRequestStatus`, `QuotationStatus`, `PurchaseOrderStatus`,
  `PurchaseOrderItemStatus`, `WorkOrderStatus` — no new values, no renamed
  values, no reinterpretation of existing ones (including the legacy
  `TECHNICALLY_DONE`/`CLOSED` WorkOrder values, which stay untouched and
  unused by the API exactly as they are today).
- `CANCELLED` semantics on every entity — still means "explicit user
  cancellation of the whole document," never "superseded by a revision."
- Document numbering (`DocumentNumberService`, prefixes, per-company/year
  sequences) — reused as-is, not modified.
- Approval/submission semantics — `send()`, `approve()`, `reject()`,
  `submit()`, `assign()`, `start()` — no signature or behavior change.
- `AuditLog` model and `recordAuditLog()` — reused as-is, not extended or
  duplicated.
- `WorkOrderItem`'s "quantity and source identity immutable after create"
  invariant — preserved by construction in the recommended design (§3), not
  relaxed.
- `CalibrationJob` fan-out / `unitOrdinal` / `unitTotal` freezing behavior —
  untouched; new units from a revision fan out through the existing
  `start()`-time mechanism when a not-yet-started `WorkOrder` eventually
  starts, exactly as new `WorkOrderItem` rows do today.

---

### Recommendation

**ACCEPT with minor adjustments.**

The core proposal (current tables as source of truth; append-only,
full-snapshot header + item history tables; in-place revision instead of
customer-facing renumbering) fits the existing architecture and is, in several
places, simply formalizing a gap the code already flags itself (the
`CalibrationRequest.update()` TODO). Two adjustments are needed before
implementation, both resolvable without redesigning anything:

1. Treat every item-level revision as an **additive new row**, never an
   in-place `qty`/identity edit on an existing item — required to keep
   `WorkOrderItem`'s documented immutability invariant intact (§3, §9).
2. Decide explicitly whether `CalibrationRequest`/`CalibrationRequestItem`
   get the same history treatment, since the proposed table list currently
   omits the chain's origin while the propagation question assumes it's in
   scope (§5, §9).

Everything else in the MOM's proposal can proceed as written.
