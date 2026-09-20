# MOM #1 — Revision Scope Semantics Gap Analysis

**Status:** Analysis only. No code, schema, migration, API, or UI was changed
to produce this report. Every claim below was verified by reading the actual
files in the repository as they exist right now (not inferred from the
earlier design/implementation reports) — file paths and line numbers are
cited throughout.

---

## 1. Executive Finding

**The current implementation does NOT fully satisfy the actual Revision
requirement.** It correctly implements one specific case — *quantity growth
on an existing line* — end-to-end, with two different mechanisms depending on
whether the line has already been snapshotted downstream. It does **not**
implement item **removal** at any level (a hard gap, not just a UI omission —
for already-consumed lines it is blocked at the database FK level), and
**device replacement** works only for `CalibrationRequestItem`/`QuotationItem`
lines that have *not yet* been snapshotted downstream, is entirely
inaccessible to a user today because the Portal UI never sends a changed
`deviceTypeId`, and is impossible at the `PurchaseOrder`/`WorkOrder` level
regardless of UI because those two `revise()` methods take **no body at
all** — they are pull-only propagation, not general-purpose revision
endpoints. **Combined revision (replace + remove + qty-change + add in one
call) is not supported by any entity's current `revise()`.**

---

## 2. Current Revision Contract

The actual, currently-implemented contract per entity — not an idealized one:

| Entity | Route | Body | What the body can express |
|---|---|---|---|
| `CalibrationRequest` | `POST /calibration-requests/:id/revise` | **Yes** — `{ serviceMode?, expectedDate?, notes?, items: [...] }` (`calibrationRequestReviseSchema`, `packages/shared/src/schemas/index.ts:436-441`) | Per item: `{ id?, deviceTypeId, customerDeviceName?, model?, deviceId?, qty?, akdAkl?, akdAklDeclaration?, notes? }`. `id` present → target that existing row; `id` absent → new line. |
| `Quotation` | `POST /quotations/:id/revise` | **Yes** — `{ taxCode?, headerDiscountAmount?, items: [...] }` (`quotationReviseSchema`) | Per item: `{ id?, requestItemId, deviceId?, tariffId?, description, qty?, unitPrice, discountAmount? }`. Same `id`-present/absent convention. |
| `PurchaseOrder` | `POST /purchase-orders/:id/revise` | **None** — controller method takes only `companyId`/`userId`/`id`, no `@Body()` (`apps/api/src/modules/purchase-orders/purchase-orders.controller.ts`) | Nothing. The caller cannot express *any* desired scope — the server unilaterally re-pulls whatever is new on the parent Quotation. |
| `WorkOrder` | `POST /work-orders/:id/revise` | **None** — same shape, no `@Body()` (`apps/api/src/modules/work-orders/work-orders.controller.ts`) | Nothing. Purely pulls new scope from the parent PurchaseOrder. |

**This is the single most important structural fact in this report:**
`CalibrationRequest`/`Quotation` have a *user-driven, item-array* revision
contract, while `PurchaseOrder`/`WorkOrder` have a *trigger-only,
pull-propagation* contract with zero input. These are two fundamentally
different mechanisms, not one consistent "revise" operation across the chain.

All four share the same header-level shape: snapshot current header + all
current items into `*History`/`*ItemHistory` (INSERT-only), then mutate
current state, inside one `prisma.$transaction`.

---

## 3. Entity-by-Entity Analysis

### 3.1 CalibrationRequest

**Files inspected:** `packages/db/prisma/schema.prisma:1587-1630`
(`CalibrationRequestItem`), `apps/api/src/modules/calibration-requests/calibration-requests.service.ts:389-577`
(`revise()`), `apps/api/src/modules/calibration-requests/calibration-requests.controller.ts`,
`packages/shared/src/schemas/index.ts:405-444`,
`apps/portal/src/app/management/calibration-requests/use-calibration-requests-query.ts`,
`apps/portal/src/app/management/calibration-requests/[id]/page.tsx:424-540`
(`ReviseRequestDialog`).

**Item identity:** one `CalibrationRequestItem` row = one requisition line.
`id` (cuid) is the row's own identity. `deviceTypeId` is the device-type
classification (a real FK to `DeviceType`) — **not unique** per request; the
schema has only `@@index([requestId])` / `@@index([deviceTypeId])`, no
composite unique constraint, so nothing in the schema stops two rows for the
same device type existing side by side. `deviceId` here is a **free-text,
nullable, customer-declared serial/inventory string** — explicitly documented
as "NOT a FK to Device" and "NOT the future CalibrationJob Device.id"
(schema.prisma:1599-1603). `qty` is documented as "Aggregate quantity for
this line" (schema.prisma:1605-1609) — i.e. this model already treats
multiple physical units of the *same* declared device as one row with a qty,
not as N rows.

**`revise()` actual behavior** (`calibration-requests.service.ts:485-558`):
for each entry in `input.items`:
- **No `id`** → `tx.calibrationRequestItem.create(...)` — a genuinely new
  line is created (line 487-501). **This is real "add item" support**,
  reachable via the API today.
- **`id` present, not yet consumed** (`QuotationItem.count({where:{requestItemId}}) === 0`,
  line 508-511) → `tx.calibrationRequestItem.update(...)` **applying every
  field from the input, including `deviceTypeId`, `model`, `deviceId`**
  (line 513-527). **This means device replacement, serial-number change, and
  qty change on an unconsumed line are all already supported by the service
  and the API contract** — the input schema places no restriction on
  `deviceTypeId` differing from the row's current value.
- **`id` present, already consumed** (a `Quotation` already exists —
  `Quotation.requestId` is `@unique`, so this happens the first time a quote
  is generated) → the code **only** accepts a *larger* `qty` and creates a
  new sibling row that clones the frozen row's own `deviceTypeId`/`model`/
  `deviceId` verbatim (line 544-557). **Device replacement and qty decrease
  are explicitly rejected** with `CALIBRATION_REQUEST_ITEM_ALREADY_CONSUMED`
  (line 534-542) once consumed.
- **Any item present in the *current* row set but absent from `input.items`
  is never touched.** There is no code path anywhere in `revise()` that
  calls `.delete()` on a `CalibrationRequestItem`. **Removal is not
  implemented, for either consumed or unconsumed lines.**

**Portal UI** (`ReviseRequestDialog`, `[id]/page.tsx:424-540`): builds its
form purely from `request.items` (the *current* set) — one row per existing
item, each with a numeric qty input pre-filled with the current qty
(line 434-436). On submit it sends exactly `{ id, deviceTypeId: item.deviceTypeId /* unchanged */, ...unchanged fields..., qty: newQty }`
for items whose qty actually changed (line 439-465). **There is no add-item
control, no remove/delete control, and no device-type picker anywhere in this
dialog** — `deviceTypeId` is always echoed back unchanged. So even though the
service/API can do more (add a line; replace an unconsumed line's device),
**a user operating only through the Portal cannot do either.**

**Matrix verdict:** Qty change = **YES** (both mechanisms). Add item =
**YES** (API+service), but UI cannot trigger it → **effectively NO for a
user**. Remove item = **NO** anywhere. Replace device = **PARTIAL** — works
via direct API call for an unconsumed line only; impossible once consumed;
inaccessible from the UI regardless. Combined = **NO** — the UI cannot
combine anything beyond simultaneous qty edits on multiple existing lines in
one call (which itself does work, since `items` is an array).

---

### 3.2 Quotation

**Files inspected:** `schema.prisma:1725-1750` (`QuotationItem`),
`quotations.service.ts:809-1040` (`revise()`),
`quotations.controller.ts`, `use-quotations-query.ts`,
`quotations/[id]/page.tsx` (`ReviseQuotationDialog`).

**Item identity:** one `QuotationItem` row = one commercial line.
`requestItemId` is a **nullable, non-unique** FK back to
`CalibrationRequestItem` (schema.prisma:1730, only `@@index([quotationId])`)
— schema-legally, more than one `QuotationItem` can reference the same
`requestItemId`. Note a naming collision worth flagging explicitly:
**`QuotationItem.deviceId` is a real FK to the `Device` master table**
(schema.prisma:1744, `device Device? @relation(...)`) — a completely
different thing from `CalibrationRequestItem.deviceId`, which is a free-text
string. Anyone reading "deviceId" across levels must not assume it means the
same kind of value.

**`revise()` actual behavior** (`quotations.service.ts:927-1040`) is
structurally identical to `CalibrationRequest.revise()`:
- No `id` → new `QuotationItem` created, validated against a real
  `CalibrationRequestItem` under the same requisition (line 928-957).
  **Add works.**
- `id` present, unconsumed (`PurchaseOrderItem.count({where:{quotationItemId}}) === 0`)
  → full in-place update, **including `requestItemId`, `deviceId`, `tariffId`,
  `description`** (line 967-989). **Device/tariff replacement on an
  unconsumed line is supported by the service.**
- `id` present, consumed → qty-growth-only via a cloned additive sibling row;
  shrink/replace rejected with `QUOTATION_ITEM_ALREADY_CONSUMED`
  (line 992-1004).
- Items not mentioned in `input.items` are left untouched — **no removal
  path**, same as `CalibrationRequest`.

**Portal UI** (`ReviseQuotationDialog`): same shape as the Requisition
dialog — one row per current item, qty-only editable input, every other
field echoed back unchanged. **No add/remove/replace controls.**

**Matrix verdict:** identical pattern and identical verdicts to
`CalibrationRequest`: Qty = **YES**, Add = **YES (API) / NO (UI)**, Remove =
**NO**, Replace = **PARTIAL (API, pre-consumption only) / NO (UI)**,
Combined = **NO**.

---

### 3.3 PurchaseOrder

**Files inspected:** `schema.prisma:1752-1818` (`PurchaseOrder`,
`PurchaseOrderItem`), `purchase-orders.service.ts:395-520` (`revise()`),
`purchase-orders.controller.ts`, `use-purchase-orders-query.ts`,
`purchase-orders/[id]/page.tsx` (plain `ConfirmDialog`, no form).

**Item identity:** one `PurchaseOrderItem` row = one snapshot of a specific
`QuotationItem`, enforced by `@@unique([purchaseOrderId, quotationItemId])`
(schema.prisma:1815) — **one PO can never have two rows for the same source
`QuotationItem`.** `PurchaseOrderItem.quotationItem` uses
`onDelete: Restrict` (schema.prisma:1808) — **the database itself forbids
deleting a `QuotationItem` while a `PurchaseOrderItem` still references it.**
This is a hard, pre-existing schema constraint, not something introduced by
MOM #1 — it independently confirms that "remove an item that's already
flowed downstream" cannot be a simple delete anywhere in this chain.

**`revise()` actual behavior** (`purchase-orders.service.ts:395-520`) takes
**no body whatsoever**. It:
1. Reads the current PO's items and the parent Quotation's *current* items.
2. Computes `pendingQuotationItems` = Quotation items whose `id` is not yet
   the `quotationItemId` of any existing `PurchaseOrderItem`
   (line 430-433).
3. If that set is empty → `400 NO_PENDING_SCOPE_CHANGE` (line 434-439).
4. Otherwise, snapshots history, then `createMany`s one new
   `PurchaseOrderItem` per pending Quotation item (line 493-500) — **always
   copying that Quotation item's current `deviceId`/`tariffId`/`description`/
   `qty` verbatim.**

There is **no code path that updates or deletes an existing
`PurchaseOrderItem`** anywhere in this method. Consequently:
- "Qty change" on the PO is not a real operation here — it only *appears* to
  work because a Quotation-level qty-growth (§3.2) produces a *new*
  `QuotationItem` row, which this method then picks up as a *new*
  `PurchaseOrderItem` (an add, not an update).
- "Add item" **does** work, but only by inheritance: it can only ever surface
  scope that the Quotation has *already* grown into. The PO itself cannot
  originate a new item.
- "Remove" and "Replace device" are **not possible under any circumstances**
  — there is no removal code, and even if there were, the FK `Restrict`
  above would block it for anything already flowed further to a WorkOrder.

**Portal UI** (`purchase-orders/[id]/page.tsx:360-367`): a plain
`ConfirmDialog` — "Revise this Purchase Order?" / confirm / cancel. No item
list, no inputs of any kind. This is a faithful UI for what the backend
actually is (a trigger), not a limited UI for something richer.

**Matrix verdict:** Qty change = **NO** (never an update; only ever a new
row, and only when the Quotation already produced one). Add item =
**PARTIAL** (mechanically works, but only pass-through of what Quotation
already added — the PO cannot decide to add anything on its own, and there is
no UI need to distinguish that since there's no input anyway). Remove = **NO**.
Replace device = **NO**. Combined = **NO** — there is nothing to combine; a
single call does exactly one thing (pull whatever is pending).

---

### 3.4 WorkOrder

**Files inspected:** `schema.prisma:1820-1901` (`WorkOrder`,
`WorkOrderItem`), `work-orders.service.ts:1154-1260` (`revise()`),
`work-orders.service.ts:591-620` (`fanOutCalibrationJobs`),
`work-orders.controller.ts`, `use-work-orders-query.ts`,
`work-orders/[id]/page.tsx` (plain `ConfirmDialog`, no form).

**Item identity:** one `WorkOrderItem` row = one snapshot of a specific
`PurchaseOrderItem`, enforced by `@@unique([workOrderId, purchaseOrderItemId])`
(schema.prisma:1898). The model's own doc comment is unambiguous:
*"Operational snapshot of a PurchaseOrderItem. MVP copies every PO item 1:1.
Quantity and source identity are immutable after create."*
(schema.prisma:1883-1884). `purchaseOrderItem` uses `onDelete: Restrict`
(schema.prisma:1895) — the same hard block as above, one level further down.

**`revise()` actual behavior** (`work-orders.service.ts:1154-1260`) is
**structurally identical to `PurchaseOrder.revise()`**, one level down the
chain: no body; computes `pendingPurchaseOrderItems` (PO items not yet
represented by a `WorkOrderItem`, line 1182-1187); `400
NO_PENDING_SCOPE_CHANGE` if none (line 1188-1193); otherwise snapshots
history and `createMany`s one new `WorkOrderItem` per pending PO item
(line 1237-1244+), copying `description`/`qty` verbatim. **No update, no
delete, anywhere.**

**Status boundary — verified precisely:**
`REVISABLE_WORK_ORDER_STATUSES = ["PLANNED", "ASSIGNED"]`
(work-orders.service.ts:146). `IN_PROGRESS`/`DONE`/`CANCELLED` all fail the
gate with `INVALID_STATUS_FOR_REVISE` before the transaction ever opens
(line 1166-1175) — confirmed by direct inspection, not inferred.

**CalibrationJob fan-out interaction** (`fanOutCalibrationJobs`,
work-orders.service.ts:591-620): the idempotency guard is
**WorkOrder-wide**, not per-item — `alreadyFannedOut = count(where:{workOrderId})`;
if that count is `> 0` the method returns immediately for the *entire*
WorkOrder (line 601-607), it does not fan out only the new items. Because
`revise()` is only reachable while `PLANNED`/`ASSIGNED` (i.e. strictly
*before* `start()` can have run even once — `start()` is the only caller of
`fanOutCalibrationJobs`, and it requires `ASSIGNED → IN_PROGRESS`), **every
`WorkOrder` this method can ever act on has, by construction, never been
fanned out yet.** So a newly-added `WorkOrderItem` correctly gets its jobs
the first time `start()` eventually runs. This is a correct interaction *for
the one operation that exists* (add-via-pull) — but it also means: **if a
revision were ever allowed after `start()`, the existing fan-out mechanism
would silently produce zero jobs for anything added afterward**, since the
guard would already see `alreadyFannedOut > 0`. This is the concrete reason
`IN_PROGRESS` must stay outside the revision boundary under the current
fan-out design — confirmed mechanically, not assumed.

**Portal UI**: plain `ConfirmDialog`, same shape as PurchaseOrder's. Correct
for what the backend is.

**Matrix verdict:** identical to PurchaseOrder: Qty = **NO**, Add =
**PARTIAL** (pass-through only), Remove = **NO**, Replace = **NO**, Combined
= **NO**.

---

## 4. Change Capability Matrix

| Entity | Change Qty | Add Item | Remove Item | Replace Device | Combined Revision | UI Supports All |
|---|---|---|---|---|---|---|
| CalibrationRequest | YES | PARTIAL (API yes, UI no) | NO | PARTIAL (API yes pre-consumption only, UI no) | NO | NO |
| Quotation | YES | PARTIAL (API yes, UI no) | NO | PARTIAL (API yes pre-consumption only, UI no) | NO | NO |
| PurchaseOrder | NO (only via new row, not update) | PARTIAL (pull-through only, not user-directed) | NO | NO | NO | NO |
| WorkOrder | NO (only via new row, not update) | PARTIAL (pull-through only, not user-directed) | NO | NO | NO | NO |

**Why each `PARTIAL`/`NO`, restated concisely:**
- **CalibrationRequest/Quotation Add — PARTIAL:** the service and API accept
  a body item without `id` and will create it; the Portal dialog never
  constructs such a payload (it only ever maps over `request.items`
  /`quotation.items`, the *current* set), so no real user can reach this path
  today.
- **CalibrationRequest/Quotation Remove — NO:** no `.delete()` call exists in
  either `revise()` method, for any consumption state. Not a UI gap; a
  service-layer gap.
- **CalibrationRequest/Quotation Replace — PARTIAL:** the service applies
  every input field (including the identity field) when the target row is
  *not yet consumed*; once a downstream row exists, the additive-sibling path
  always clones the frozen identity fields and only accepts a larger `qty`,
  so replacement is architecturally blocked post-consumption. Independently,
  the UI never offers a device picker, so this is doubly unreachable for a
  user regardless of consumption state.
- **PurchaseOrder/WorkOrder Qty — NO:** these methods never call `.update()`
  on an item row. What looks like "quantity increased" downstream is always
  a *new* row surfacing a *new* upstream row — there is no mechanism to
  directly change an existing `PurchaseOrderItem`/`WorkOrderItem`'s `qty`.
- **PurchaseOrder/WorkOrder Add — PARTIAL:** mechanically an add happens, but
  it is not something the PO/WO "decides" — it has no body and no agency; it
  purely mirrors whatever the parent already added. Calling it a first-class
  "add" capability of PurchaseOrder/WorkOrder would overstate what the code
  does.
- **PurchaseOrder/WorkOrder Remove/Replace — NO:** no code path attempts
  either, and the `onDelete: Restrict` FKs make removal structurally
  impossible for any row a child level has already consumed.
- **Combined — NO, all four entities:** none of the four `revise()` methods
  can, in one call, apply more than one *kind* of change beyond "grow the qty
  of one or more currently-unconsumed lines simultaneously" (which is the one
  case that already works as an array). No method can add-and-remove, or
  replace-and-add, in the same transaction.

---

## 5. Concrete Scenario Analysis

**1. Device replacement** (`Bedsidemonitor × 1` → `Ventilator × 1`)
- `CalibrationRequestItem`/`QuotationItem`: possible via direct API call
  **only if the line has not yet been consumed downstream** (send the same
  `id` with a different `deviceTypeId`/`requestItemId`). Impossible via the
  Portal (no field for it). Impossible once a `Quotation`/`PurchaseOrder`
  already exists from that line.
- `PurchaseOrder`/`WorkOrder`: impossible under any condition — no input
  surface, no update code path.

**2. Add item** (`Bedsidemonitor × 1` → `Bedsidemonitor × 1, Audiometer × 1`)
- `CalibrationRequestItem`/`QuotationItem`: possible via direct API call
  (omit `id` on the new line). Impossible via the Portal today.
- `PurchaseOrder`/`WorkOrder`: happens automatically and *only* as a
  consequence of the parent having already grown — cannot be triggered
  independently, and there is no way to add a line at the PO/WO level that
  doesn't already exist one level up.

**3. Remove item** (`Bedsidemonitor, Ventilator, Audiometer` →
`Bedsidemonitor, Ventilator`)
- All four entities: **impossible**, via API or UI, in any consumption
  state. For unconsumed lines this is a pure service-code omission (no
  `.delete()` call exists). For already-consumed lines it is additionally a
  hard database constraint (`onDelete: Restrict` on
  `PurchaseOrderItem.quotationItem` and `WorkOrderItem.purchaseOrderItem`).

**4. Qty increase** (`× 1` → `× 3`)
- `CalibrationRequestItem`/`QuotationItem`: works via both API and Portal
  UI. Mechanism differs by consumption state: **in-place `UPDATE`** if
  unconsumed; **new additive sibling row carrying the delta** if already
  consumed (per `mom-1-item-revision-rule-20260919.md`, correctly
  implemented as designed).
- `PurchaseOrder`/`WorkOrder`: the *effect* (more total qty reflected
  downstream) is achievable only indirectly — revise the Quotation/PO first
  (creating a new sibling row there), then call the PO's/WO's own `revise()`
  to pull that new row in as a *new item*, never as a qty change on an
  existing one.

**5. Qty decrease** (`× 3` → `× 1`)
- `CalibrationRequestItem`/`QuotationItem`: works via both API and Portal UI,
  but **only while the line is unconsumed** — the moment a downstream row
  exists, any `qty` at or below the current value is rejected with
  `*_ITEM_ALREADY_CONSUMED` (`calibration-requests.service.ts:534-542`,
  `quotations.service.ts:996-1004`). There is no mechanism to represent "the
  customer wants less of what's already been quoted/ordered" once
  downstream consumption has happened — the additive-only design has no
  negative-delta concept (correctly, per the MOM's explicit "no delta
  history" instruction — but this also means there is currently no way to
  *reduce* already-consumed scope at all, only to prevent shrinking it).
- `PurchaseOrder`/`WorkOrder`: **not representable at all** — these methods
  cannot decrease anything; they can only add.

**6. Combined revision** (`A×1, B×1, C×1` → `D×1, B×3`, i.e. replace A→D
[or remove A + add D], remove C, grow B to 3, all in one operation)
- **Not achievable by any single `revise()` call on any entity today.**
  Decomposing what *is* achievable: on `CalibrationRequest`/`Quotation`, in
  one call you could (a) grow B's qty (if B is unconsumed) and (b) add D as a
  new line — but you could not also remove C or replace/remove A in that same
  call, because no removal path exists. The MOM's explicit requirement that
  this "must be considered ONE document revision, not separate revisions" is
  not met — some of the required sub-operations cannot be expressed *at all*,
  in one call or many.

---

## 6. Data Chain / Downstream Impact

```
CalibrationRequestItem → QuotationItem → PurchaseOrderItem → WorkOrderItem → CalibrationJob
```

- **Replace:** only possible at the topmost unconsumed point in the chain
  for a given line. The instant a line is copied downstream (Quotation
  created → PurchaseOrder created → WorkOrder created), replacement at that
  origin level is permanently blocked for that specific row (the
  `*_ITEM_ALREADY_CONSUMED` guard), and there is no mechanism anywhere to
  propagate a replacement *forward* through the chain even if one were made
  upstream before consumption — because by definition, if it's still
  unconsumed, there's nothing downstream to propagate to yet.
- **Add:** propagates forward correctly, one level at a time, but only
  *pulled*, never *pushed*. Adding a `CalibrationRequestItem` does nothing to
  an already-existing `Quotation` until `Quotation.revise()` is separately
  called; likewise `Quotation.revise()` does not touch an existing
  `PurchaseOrder` until `PurchaseOrder.revise()` is separately called; same
  for `WorkOrder`. A fully-propagated "add" today requires calling `revise()`
  up to four times in sequence, once per level — the MOM's report from the
  original implementation already documented this as "pull, not push" by
  design, and it's confirmed still true here.
- **Remove:** cannot originate anywhere, so there is nothing to trace
  downstream. If it *could* originate at `CalibrationRequestItem`, the
  `onDelete: Restrict` FKs mean it would need to also explicitly retire the
  consumed `QuotationItem`/`PurchaseOrderItem`/`WorkOrderItem` rows (or some
  new "voided/cancelled line" concept) — no such concept exists in the
  current schema for an individual item row (only whole-document `CANCELLED`
  exists at the header level).
- **Quantity increase:** propagates correctly as described in §5.4 — additive
  sibling rows at each level, each carrying just the delta, matching the
  already-verified end-to-end test coverage from the original implementation
  (`work-orders.service.test.ts`, `describe("WorkOrdersService.revise")`).
- **Quantity decrease:** does not propagate past the first unconsumed level —
  it is rejected outright the moment a line is consumed, at every level.
- **Combined:** since replace and remove don't work at all, and add/qty-grow
  require separate sequential calls per level, there is no scenario in which
  a single combined change reaches `CalibrationJob` fan-out as one atomic
  operation. `CalibrationJob` itself is only ever affected by `WorkOrderItem`
  additions surfacing at the next `start()` (§3.4) — it has no exposure to
  replace/remove/decrease scenarios because those never reach it.

---

## 7. Exact Gaps

**Backend/service gaps:**
- No entity's `revise()` implements item removal (`.delete()` is never
  called). This is the single largest gap relative to §2 of the business
  requirement.
- `CalibrationRequest`/`Quotation` `revise()` cannot replace or shrink a line
  once it has been consumed downstream — by design (frozen-row invariant),
  but this means the business requirement's "device replacement" and "qty
  decrease" scenarios are unsupported for a large share of real documents
  (anything past DRAFT-equivalent for its immediate child).
- `PurchaseOrder`/`WorkOrder` `revise()` have no input surface at all — they
  cannot represent replace, remove, or a direct qty change under any
  circumstance; they can only mechanically mirror new items already present
  on their parent.
- No entity's `revise()` accepts "the complete desired item scope" as a
  single payload the server reconciles (add what's missing, update what
  changed, retire what's gone) — the actual contract is closer to "here are
  the specific line edits/additions you're allowed to make," which is
  narrower than the business requirement's stated model in §15 of the task
  prompt ("the user submits the desired resulting item scope").

**API gaps:**
- `PurchaseOrder`/`WorkOrder` `revise()` routes accept no body — even if a
  client wanted to express a richer change, the endpoint has nothing to
  receive it with.
- `CalibrationRequest`/`Quotation` revise schemas (`calibrationRequestReviseSchema`,
  `quotationReviseSchema`) have no "remove" concept (e.g. no `deleted: true`
  flag, no way to omit-and-mean-delete — omission today means "leave
  untouched," not "remove").

**UI gaps:**
- None of the four Revise dialogs offer add/remove/replace controls.
- `ReviseRequestDialog`/`ReviseQuotationDialog` only ever render the
  *current* item set with an editable qty field — structurally incapable of
  emitting a payload with a new line or a changed `deviceTypeId`, even though
  the backend (for unconsumed lines) would accept the latter.
- `PurchaseOrder`/`WorkOrder` Revise UI is a bare confirmation with no item
  visibility at all — a user cannot see *what* will be pulled in before
  confirming.

**Data-model gaps:**
- None found that block the missing capabilities outright for *unconsumed*
  lines — the schema already permits new rows, differing `deviceTypeId`
  values, and non-unique `requestItemId`/parent references (verified in §3).
  The only genuine data-model-level constraint is the `onDelete: Restrict`
  on `PurchaseOrderItem.quotationItem` and `WorkOrderItem.purchaseOrderItem`,
  which is a **correctness feature, not a defect** — it is exactly what
  prevents silently orphaning a downstream snapshot, and any future removal
  design must work with it (e.g. via a per-line "retired" marker) rather than
  attempt an actual `DELETE`.

---

## 8. Minimum Correction Scope

*(Described only — nothing here is implemented, migrated, or coded.)*

**Backend gap to close:**
- `CalibrationRequest`/`Quotation` `revise()` need a reconciliation step
  against the *complete* submitted item list, not just the entries present in
  the payload: any *current, unconsumed* row absent from the submitted list
  represents "remove," and would need an explicit, well-defined disposition
  (a real `DELETE`, since it's unconsumed and no FK blocks it). A currently
  *consumed* row absent from the submitted list has no existing mechanism to
  represent "the customer no longer wants this" — this needs a business
  decision before any implementation, not just a code change (e.g.: is a
  consumed line ever actually removable, or does "removal" of consumed scope
  become a qty-decrease-to-zero-equivalent that stays visible but inert?).
- `PurchaseOrder`/`WorkOrder` `revise()` would need to gain an actual input
  surface if replace/remove/direct-qty-change are ever required at those
  levels — today they are intentionally trigger-only, so this is a contract
  change, not a bug fix.

**UI gap to close:**
- `ReviseRequestDialog`/`ReviseQuotationDialog` would need: a way to add a
  new line (device/type picker + qty), a way to mark an existing unconsumed
  line for removal, and — only for unconsumed lines — a way to change the
  device/type of an existing line, surfacing the `*_ITEM_ALREADY_CONSUMED`
  rejection clearly when the user attempts to edit a frozen line.
- `PurchaseOrder`/`WorkOrder` Revise UI would need to show what will actually
  change *before* confirming, at minimum — a bare confirm button with no
  preview is a poor fit even for the current pull-only contract.

**Data-model gap:**
- Only if item removal of already-consumed scope becomes a real requirement:
  some representation of "this line is no longer part of the active scope"
  is needed that doesn't violate `onDelete: Restrict` — e.g. a per-item
  status/flag rather than a `DELETE`. **This report does not recommend a
  specific mechanism** — per the task's explicit instruction not to jump to
  "create a new row for every change," and because this genuinely is a
  business-rules question (can a customer un-order something already
  purchase-ordered?) that needs to be answered before a data-model shape is
  chosen.

---

## 9. Risks / Constraints

Concrete constraints found in the existing code, not hypothetical ones:

- `onDelete: Restrict` on `PurchaseOrderItem.quotationItem` and
  `WorkOrderItem.purchaseOrderItem` (schema.prisma:1808, 1895) — any future
  "remove" design for consumed lines cannot use an actual row `DELETE`
  without first handling or removing this constraint's dependents.
- `fanOutCalibrationJobs`'s idempotency guard is WorkOrder-wide, not
  per-item (work-orders.service.ts:601-607) — if `WorkOrder.revise()` were
  ever allowed after `start()`, newly added `WorkOrderItem`s would never
  receive jobs through the existing mechanism. The current status gate
  (`PLANNED`/`ASSIGNED` only) is exactly what prevents this from ever
  happening today; loosening that gate without also changing fan-out would
  silently break job creation.
- `CalibrationRequestItem`/`QuotationItem`'s consumed-vs-unconsumed branch is
  determined by a live `COUNT` query against the child table at the moment
  `revise()` runs (`calibration-requests.service.ts:508-511`,
  `quotations.service.ts:963-965`) — any redesign must preserve this
  as the authoritative check; it is not a cached or denormalized flag.
- `Quotation.requestId` is `@unique` — at most one `Quotation` can ever exist
  per `CalibrationRequest`, so "consumed" for a `CalibrationRequestItem` is
  effectively a one-time, irreversible transition per request.
- The four `revise()` methods are independently gated by status
  (`REVISABLE_CALIBRATION_REQUEST_STATUSES`, `REVISABLE_QUOTATION_STATUSES`,
  `REVISABLE_PURCHASE_ORDER_STATUSES`, `REVISABLE_WORK_ORDER_STATUSES`) —
  any correction must continue to respect these; none of them were found to
  be wrong for the cases they already handle.

---

## 10. Final Recommendation

The current implementation is **correct but narrow**: it fully and correctly
solves "increase the quantity of an existing line, correctly snapshotted,
correctly gated by status, correctly interacting with downstream
consumption and fan-out" — and stops there. It does not yet implement the
add/remove/replace/combined capabilities the actual business requirement
describes. The exact implementation direction required, to be scoped in a
follow-up implementation prompt (not this one):

1. Redefine `CalibrationRequest.revise()`/`Quotation.revise()`'s contract
   around **the complete desired item list** (per §15 of the task prompt),
   with the service performing the reconciliation (add what's new, update
   what changed on unconsumed rows, and explicitly decide — as a business
   rule, before any code is written — what happens to a currently-listed row
   that's absent from the new desired list, split by consumed/unconsumed).
2. Decide, as a business question, whether `PurchaseOrder`/`WorkOrder`
   revision should remain pure pull-propagation (in which case
   replace/remove/direct-qty-change simply never apply at those levels, by
   design — a legitimate answer) or whether they need their own
   independent input surface — this is a scope decision, not an engineering
   one, and this report deliberately does not pick a side.
3. Whatever is decided for (2), preserve every constraint in §9 unchanged:
   the `onDelete: Restrict` FKs, the WorkOrder-wide fan-out idempotency
   guard, the live-`COUNT` consumed check, and the existing status gates.

---

```text
REVISION SCOPE RULE:

A Revision represents the user's desired resulting document scope,
not merely a quantity adjustment. It must support device replacement,
item addition, item removal, quantity increase/decrease, and combinations
of these changes, while preserving the previous complete document state
as an immutable append-only history snapshot and respecting all existing
downstream snapshot/immutability boundaries.
```
