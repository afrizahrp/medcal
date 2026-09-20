# MOM #1 — Final Revision Scope Design

**Status:** Design only. No code, schema, migration, API, or UI was changed.
This design synthesizes the two preceding forensic reports
(`mom-1-revision-scope-semantics-gap-analysis-20260920.md` and
`mom-1-consumed-item-removal-semantics-20260920.md`) against the business
decisions this MOM locks. It does not reopen the History architecture, does
not invent event sourcing/CQRS/a generic framework, and does not propose a
`CalibrationJob` cancellation/void mechanism.

> **Note on source completeness:** `MOM #1 — FINAL REVISION SCOPE DESIGN.md`
> is cut off mid-sentence at the heading `## 14. Transaction /`. Sections 1–13
> and the locked decisions (§20 of the source) are complete and unambiguous;
> this report follows them exactly. Section 14 below is completed as
> **"Transaction / Atomicity"**, inferred from (a) the word already present
> before the cutoff, and (b) that every prior report in this MOM sequence has
> included exactly this section next to History/AuditLog/UI. This inference
> is stated here rather than silently assumed.

---

## 1. Executive Summary

Revision becomes **desired-scope reconciliation**: the caller (for
`CalibrationRequest`/`Quotation`) or the system (for `PurchaseOrder`/
`WorkOrder`, which remain pull-based) determines, per item line, one of five
outcomes — `UNCHANGED`, `QTY_CHANGED`, `ADDED`, `REMOVED`, `REPLACED` — by
matching on the line's own row `id`, never on `deviceTypeId` alone. What
happens next for `REMOVED`/`QTY_CHANGED`(decrease) forks on exactly one
question already answered by the forensic work: **does a live downstream row
still reference this item?** If no → snapshot history, then hard-delete
(Decision A). If yes → snapshot history, then retire in place, never delete
(Decision B), using `PurchaseOrderItemStatus.CANCELLED` where that field
already exists (Decision C) — and, for the two levels that have no
equivalent field today (`CalibrationRequestItem`, `QuotationItem`), this
design identifies exactly what minimal schema shape would be needed,
without creating it. **Only active (non-retired, non-deleted) scope
propagates downstream** — which means `PurchaseOrder.revise()` and
`WorkOrder.revise()` keep their existing trigger-only, pull-based contract,
but that pull now reconciles in *both* directions (adds what's newly active
upstream, retires/deletes what became inactive upstream), not just adds. A
new cross-chain safety rule falls directly out of this: **retiring a
consumed item must be rejected if doing so would require touching a
`WorkOrderItem` whose `WorkOrder` is no longer `PLANNED`/`ASSIGNED`** — this
is what keeps the existing `CalibrationJob` boundary intact without any new
job-level cancellation concept.

---

## 2. Locked Business Rules

Restated verbatim from the source MOM (§20), not reopened:

1. History is append-only complete snapshots (unchanged from the original
   MOM #1 design).
2. Unconsumed item removal: history snapshot first, then **hard delete**.
3. Consumed item removal: history snapshot first, then **retire/inactivate**
   — never delete.
4. `PurchaseOrderItemStatus.CANCELLED` is the chosen PO-item retirement
   state.
5. Only active scope propagates downstream.
6. `WorkOrder` revision stops at `IN_PROGRESS` (unchanged from the existing
   `REVISABLE_WORK_ORDER_STATUSES = ["PLANNED", "ASSIGNED"]`,
   `work-orders.service.ts:146`).
7. No new `CalibrationJob` cancellation/void architecture for this MOM.
8. Customer-facing document numbers do not change (unchanged; already
   enforced today — no revision path touches `number`).

---

## 3. Revision as Desired-Scope Reconciliation

**Input:** the current, live item set for the document (`CalibrationRequestItem[]`
/`QuotationItem[]`, read fresh inside the transaction) and the desired item
set (for `CalibrationRequest`/`Quotation`: submitted by the caller; for
`PurchaseOrder`/`WorkOrder`: derived from the parent's current *active*
items — see §7).

**Reconciliation, conceptually, per current-vs-desired line:**

```
for each line in CURRENT (by id):
  if id appears in DESIRED with the same qty and same identity fields → UNCHANGED
  if id appears in DESIRED with a different qty                      → QTY_CHANGED
  if id does NOT appear in DESIRED at all                             → REMOVED
for each line in DESIRED with no id (or an id not present in CURRENT):
                                                                        → ADDED
```

`REPLACED` is not a sixth, independent outcome the reconciliation needs to
detect specially — see §5.3. It is what a `REMOVED` + `ADDED` pair *means*
to the business, not a distinct mechanism the persistence layer needs.

**Output:** one atomic transaction that, in order: (1) snapshots the
complete current header + all current items into `*History`/`*ItemHistory`
(unchanged from the existing implementation); (2) applies every
`REMOVED`/`QTY_CHANGED`/`ADDED` outcome; (3) recomputes header totals from
whatever remains **active**; (4) records one `AuditLog` entry (§12).

This is a direct extension of the mechanism that already exists today
(`calibration-requests.service.ts:485-558`,
`quotations.service.ts:927-1040` already accept an `items` array where each
entry optionally carries an `id`) — the only conceptual additions are: (a)
an `id` present in the *current* set but absent from the *submitted* set now
means `REMOVED` instead of "untouched," and (b) `REMOVED` forks on
consumption state exactly like `QTY_CHANGED` already does today.

---

## 4. Item Identity / Matching Rules

Per the forensic analysis (`mom-1-revision-scope-semantics-gap-analysis-20260920.md`
§9), reaffirmed here as the matching basis:

- **The only true identity of a line, at every level, is that row's own
  primary key `id`.** `deviceTypeId` (CalibrationRequestItem),
  `requestItemId`/`deviceId`(→`Device`)/`tariffId` (QuotationItem),
  `quotationItemId`/`deviceId`(→`Device`) (PurchaseOrderItem), and
  `purchaseOrderItemId` (WorkOrderItem) are **lineage pointers**, describing
  what a line *is* or *came from* — never a matching key for "is this the
  same line across a revision."
- Reconciliation therefore matches purely on `id` presence/absence between
  the current and desired sets, exactly as §3 states. A desired-scope entry
  that happens to name the same `deviceTypeId` as a different current row,
  but carries no `id` (or a different `id`), is unambiguously `ADDED` — never
  auto-matched to an existing row by device-type similarity. This is a
  deliberate, minimal rule: it requires no fuzzy matching, no heuristics, and
  no new identity concept, and it is exactly consistent with how the
  existing `id?`-optional convention already behaves.
- `WorkOrderItem`'s identity (`purchaseOrderItemId`, unique per WorkOrder)
  and `CalibrationJob`'s identity (`purchaseOrderItemId` + `unitOrdinal`,
  unique per WorkOrder) are unaffected — reconciliation at the WorkOrder
  level matches on `WorkOrderItem.id` exactly the same way, and never reaches
  into `CalibrationJob` at all (§10 of the prior removal-semantics report;
  reaffirmed unchanged in §10 below).

---

## 5. Add / Remove / Replace / Qty-Change Semantics

### 5.1 Add

A desired-scope entry with no matching current `id` → **`ADDED`**. Persisted
exactly as today's "no `id` → `create()`" branch already does
(`calibration-requests.service.ts:487-501`, `quotations.service.ts:928-957`).
No change to this mechanism.

### 5.2 Remove

A current `id` absent from the desired scope → **`REMOVED`**. Forks on
consumption, per Decision A/B — see §6 for the full per-entity mechanism.

### 5.3 Replace

**Design decision: Replace is represented as `REMOVED` + `ADDED`, not as a
first-class third operation.** Rationale, directly from the existing schema:

- No table in the chain has any "this row supersedes/replaces that row"
  pointer today (verified: `CalibrationRequestItem`, `QuotationItem`,
  `PurchaseOrderItem`, `WorkOrderItem` all lack such a field).
- `REMOVED` (§6) and `ADDED` (§5.1) already have complete, well-defined
  behavior on their own.
- Composing them requires zero new schema and zero new service mechanism —
  the smallest compatible representation, per the task's own instruction.

**Concretely:** `Bedsidemonitor × 1` → `Ventilator × 1` on the same
conceptual line is submitted as: the `Bedsidemonitor` row's `id` absent from
the desired set (→ `REMOVED`, forking on consumption per §6), plus a new
entry with no `id` for `Ventilator` (→ `ADDED`, a genuinely new row with its
own new `id` and its own fresh downstream lineage — it does **not** inherit
the removed row's `quotationItems`/`purchaseOrderItems`/etc.; it starts a
clean lineage exactly like any other newly-added line).

**History:** the old row's last state is captured by whichever revision's
snapshot precedes its removal (already-existing mechanism, unchanged); the
new row appears for the first time in the snapshot of the revision that adds
it. No special "replace" annotation exists in `*ItemHistory` — reading
consecutive snapshots and noticing one `sourceItemId` disappeared while
another appeared achieves the same narrative without inventing a new column.

**UI-only labeling (optional, not required for correctness):** the Portal
*may* choose to let a user pick "Change Device" on an existing row, and
internally translate that single UI gesture into the `REMOVED`+`ADDED` pair
before submitting — this is a presentation convenience, not a persistence
requirement, and is explicitly out of scope to design further here (§13
covers the UI design at the level the source MOM asked for).

### 5.4 Quantity Change — reconsidered, not reused blindly

Per the source MOM's explicit instruction not to reflexively reapply "always
add a sibling row," this is re-derived from the locked decisions:

- **Unconsumed row, any qty change (increase or decrease):** plain in-place
  `UPDATE` of the existing row. Unchanged from today's behavior
  (`calibration-requests.service.ts:513-527`,
  `quotations.service.ts:975-989`) — nothing here needed revisiting; this
  case was never the problem.
- **Consumed row, qty increase:** the frozen row cannot be edited
  (immutability invariant). Represented as an **additive sibling row**
  carrying only the delta — this part of the existing mechanism
  (`calibration-requests.service.ts:544-557`, `quotations.service.ts:1006-1024`)
  is retained unchanged, because it is already correct: the original frozen
  row stays exactly as history recorded it, and the sum of the frozen row +
  the new sibling equals the desired qty.
- **Consumed row, qty decrease — the case the old rule rejected outright,
  now resolved:** this design treats a decrease on a consumed row as a
  **`REMOVED` + `ADDED` pair** (§5.3), not a partial decrement: the original
  frozen row is retired in place (§6, Decision B — its history was already
  captured on the revision that produced or last touched it), and a **new**
  row is added carrying the **full new desired qty** (not a delta). This
  is the only representation consistent with every locked constraint at
  once: the frozen row is never mutated (immutability preserved), the
  retired row stops counting toward active scope (§7), and the new row's qty
  is exactly what the customer now wants — with no negative delta anywhere.
  This directly closes the gap both prior forensic reports flagged as
  unsupported.
- **Consumed row, qty unchanged:** `UNCHANGED`, no action.

---

## 6. Unconsumed vs Consumed Removal

| Situation | Mechanism | Precondition |
|---|---|---|
| Unconsumed item removed | History snapshot → **hard `DELETE`** (Decision A) | No live row one level downstream references this item's `id`. Confirmed per-entity via the same live `COUNT` check the existing "frozen once consumed" logic already performs (`QuotationItem.count({where:{requestItemId}})`, `PurchaseOrderItem.count({where:{quotationItemId}})`, and the equivalent check this design adds one level further, `WorkOrderItem.count({where:{purchaseOrderItemId}})`, for `PurchaseOrderItem`). |
| Consumed item removed, entity has a retirement field | History snapshot → **retire in place** (Decision B), using that field (Decision C: `PurchaseOrderItemStatus.CANCELLED` for `PurchaseOrderItem`) | A live downstream row exists, so deletion is unsafe (RESTRICT-blocked, or traceability-breaking per the `SET NULL` case documented in the prior report §3.1). |
| Consumed item removed, entity has **no** retirement field today | **Gap — see below** | `CalibrationRequestItem` and `QuotationItem` have no status/active column. |

### 6.1 The retirement-field gap for `CalibrationRequestItem` and `QuotationItem`

Decision C explicitly names `PurchaseOrderItemStatus.CANCELLED` for
`PurchaseOrderItem` only. Neither `CalibrationRequestItem` nor
`QuotationItem` has any equivalent field in the schema today — this is a
confirmed, not assumed, gap (both forensic reports checked this directly).
Decision B's own instruction is to retire "according to the appropriate
**existing** domain representation" — for these two entities, no such
representation currently exists to point to.

This design proposes, without creating it, the smallest compatible
extension consistent with the pattern the business already chose for
`PurchaseOrderItem`: a status/active field of the same shape (e.g. an
`isActive`-style boolean, or a small status enum mirroring
`PurchaseOrderItemStatus`'s shape) added to `CalibrationRequestItem` and
`QuotationItem` in a future implementation task. This is **not a business
decision** (the business already decided "retire, don't delete," per
Decision B) — it is a small, mechanical, follow-on schema question about
*which column carries that state*, and is flagged here as an implementation
prerequisite rather than invented or silently deferred.

> **Until that field exists, consumed-item removal at the
> `CalibrationRequest` and `Quotation` levels cannot be implemented as
> "retire in place" — only as the unconsumed hard-delete path (§6, row 1),
> which by definition does not apply once consumed.** A future
> implementation task must either add the field or explicitly scope
> consumed-item removal out of its first increment for these two entities.

### 6.2 `PurchaseOrderItem`

Retirement mechanism is fully specified by Decision C: set
`status = "CANCELLED"`. This choice has a specific, important technical
property worth stating precisely: **a status-column `UPDATE` does not
interact with the `ON DELETE RESTRICT` FK from `WorkOrderItem` at all** —
that constraint only fires on an actual row `DELETE`. This is exactly why
Decision C's mechanism is safe even when a `WorkOrderItem` already
references the `PurchaseOrderItem` being cancelled — **but safety at the
database level is not the same as business safety**, which is why §7
introduces an additional, explicit guard the database cannot provide on its
own (per §16 of the source MOM: "do not rely on database constraints alone
where the database allows a technically legal but business-unsafe
operation").

### 6.3 `WorkOrderItem`

No retirement field exists, and **none is needed**: because `WorkOrder`
revision is only ever reachable while `PLANNED`/`ASSIGNED` (Decision 6/
§8), and `CalibrationJob` fan-out only ever happens at `start()`
(`PLANNED`/`ASSIGNED → IN_PROGRESS`), **every `WorkOrderItem` that a
revision could ever touch is, by construction, always unconsumed** (no
`CalibrationJob` can exist yet for it). Removal at this level is therefore
**always** the unconsumed hard-delete path (§6, row 1) — never retirement.
This does not conflict with `WorkOrderItem`'s "immutable after create"
invariant: that invariant protects a row from in-place *mutation* once a
downstream snapshot exists; deleting a row that has no downstream snapshot
at all is a different, already-permitted operation under Decision A.

---

## 7. Active Scope Rules

**Definition, per entity — "active" means:**

- `CalibrationRequestItem` — the row exists (hard-deleted rows are simply
  absent; there is no separate active/inactive state once retirement is
  possible in a future increment per §6.1, that field's non-cancelled value
  would define active).
- `QuotationItem` — same as above (pending §6.1's future field).
- `PurchaseOrderItem` — `status != "CANCELLED"`. `OPEN`/`ALLOCATED`/
  `FULFILLED` all count as active for propagation purposes; only
  `CANCELLED` is excluded.
- `WorkOrderItem` — the row exists (no status concept needed, per §6.3).

**Propagation rule, restated as an algorithm change to the existing
pull-based `revise()` methods** (this is the mechanism that makes "only
active scope propagates downstream" concrete, without giving
`PurchaseOrder.revise()`/`WorkOrder.revise()` a new input contract):

- **`PurchaseOrder.revise()` (still no body — pull/reconcile only):**
  1. For every current, active `PurchaseOrderItem` whose source
     `QuotationItem` is no longer active (removed from the Quotation's
     current scope) → apply Decision B/C: history snapshot, then
     `status = "CANCELLED"` — **subject to the guard in §7.1**.
  2. For every active `QuotationItem` not yet represented by an active
     `PurchaseOrderItem` → create one (existing behavior, unchanged).
  3. Recompute header totals from active items only.
- **`WorkOrder.revise()` (still no body — pull/reconcile only):**
  1. For every current `WorkOrderItem` whose source `PurchaseOrderItem` is
     no longer active → hard-delete it (§6.3 — always safe at this level).
  2. For every active `PurchaseOrderItem` not yet represented by a
     `WorkOrderItem` → create one (existing behavior, unchanged).

This is the same "pull, not push" propagation philosophy the original MOM #1
design already established for these two entities — it is now bidirectional
(adds *and* retires) instead of add-only, but it is still triggered
exclusively by the entity's own `revise()` call, never by an upstream write
cascading downstream automatically.

### 7.1 The cross-chain safety guard this design adds

**Retiring a consumed item at any level must be rejected outright if doing
so would require retiring or deleting a `WorkOrderItem` belonging to a
`WorkOrder` that is no longer `PLANNED`/`ASSIGNED`.**

This did not exist as an explicit rule anywhere before this design, and it
is necessary: `PurchaseOrder.revise()`'s own status gate
(`REVISABLE_PURCHASE_ORDER_STATUSES = ["APPROVED","RECEIVED","CONFIRMED"]`)
is entirely independent of what status any of its child `WorkOrder`s are in.
Without this guard, a user could cancel a `PurchaseOrderItem` that already
has a live `WorkOrderItem` under an `IN_PROGRESS` `WorkOrder` with real
`CalibrationJob`s already executing — exactly the scenario §8 of the source
MOM says a normal revision must never produce. The guard walks forward
through the chain before committing any retirement:

```
Attempt to retire PurchaseOrderItem P
  → does an active WorkOrderItem reference P?
      → no: safe, proceed (Decision C)
      → yes: is that WorkOrderItem's WorkOrder still PLANNED/ASSIGNED?
          → yes: safe, proceed (Decision C). The now-inactive P will be
                  reconciled out of that WorkOrder the next time
                  WorkOrder.revise() runs (§7, WorkOrder step 1).
          → no (IN_PROGRESS/DONE/CANCELLED):
                  REJECT the retirement with a clear, actionable error.
                  This scope is operationally committed and cannot be
                  removed by a normal revision, per the locked
                  CalibrationJob boundary (§10).
```

The equivalent guard applies one level up: `Quotation.revise()` retiring a
consumed `QuotationItem` must check not only whether a `PurchaseOrderItem`
exists for it, but transitively whether *that* `PurchaseOrderItem` has
already reached an `IN_PROGRESS`-or-later `WorkOrder`, and reject on the
same condition.

---

## 8. Entity-by-Entity Design

### 8.1 CalibrationRequest

- **Active scope:** every current `CalibrationRequestItem` row (see §6.1 —
  no retirement field exists yet, so "active" and "exists" are synonymous
  until that gap is closed).
- **Unconsumed deletion:** an item with no `QuotationItem` referencing it
  (`QuotationItem.count({where:{requestItemId}}) === 0`) that is absent from
  the desired scope → history snapshot, then hard `DELETE`. Already the
  correct FK shape for this (`SET NULL`, not `RESTRICT` — deletion is
  physically possible; the business rule, not the database, is what
  currently prevents it once consumed).
- **Consumed retirement:** **blocked by the §6.1 gap** — cannot be
  implemented until a retirement field exists on this model.
- **Add:** new row, no `id`, as today.
- **Remove:** per above.
- **Replace:** `REMOVED` (per consumption state) + `ADDED` (§5.3).
- **Qty change:** per §5.4 — in-place if unconsumed; additive sibling for
  growth if consumed; retire-old + add-new(full qty) for decrease if
  consumed (blocked by §6.1 until the retirement field exists, same as
  consumed removal).
- **History snapshot:** unchanged — complete header + all current items,
  before any mutation, exactly as already implemented.
- **Propagation to Quotation:** none automatic. A `Quotation`, once it
  exists, has its own separate `revise()` and its own separate desired
  scope; a `CalibrationRequest` revision does not push anything into an
  already-existing `Quotation` (consistent with "pull, not push," and with
  `Quotation.requestId` being `@unique` — at most one `Quotation` ever
  exists per request, generated once, not continuously re-synced).

### 8.2 Quotation

- **Active scope:** every current `QuotationItem` row (same §6.1 caveat as
  `CalibrationRequestItem` — no retirement field exists yet).
- **Unconsumed deletion:** no `PurchaseOrderItem` references it
  (`count({where:{quotationItemId}}) === 0`) and absent from desired scope
  → history snapshot, then hard `DELETE`. FK is `RESTRICT` once consumed, so
  this path is only reachable pre-consumption, matching the business rule
  exactly (no gap between what the DB allows and what the rule requires,
  unlike `CalibrationRequestItem`).
- **Consumed retirement:** **blocked by the §6.1 gap**, same as
  `CalibrationRequestItem`.
- **Add / Remove / Replace / Qty change:** identical pattern to §8.1, one
  level down.
- **History snapshot:** unchanged.
- **Propagation to PurchaseOrder:** pull-based, per §7 — `PurchaseOrder.revise()`
  reconciles against this entity's *current active* items only.

### 8.3 PurchaseOrder

- **`PurchaseOrderItemStatus.CANCELLED`:** the retirement state for this
  entity, per Decision C — the only entity in the chain where this design
  requires no new field.
- **Active scope:** `status != "CANCELLED"`.
- **Hard-delete conditions:** only for a `PurchaseOrderItem` with **no**
  `WorkOrderItem` referencing it yet — i.e., added via `PurchaseOrder.revise()`
  after a `WorkOrder` already exists, but not yet pulled into that
  `WorkOrder`. This is the one case where `PurchaseOrderItem` behaves like an
  "unconsumed" row under Decision A, since nothing downstream references it.
- **Retirement conditions:** a `WorkOrderItem` already exists for it — apply
  Decision C, subject to the §7.1 cross-chain guard.
- **Add:** existing pull-from-Quotation mechanism, unchanged.
- **Remove:** per active-scope reconciliation (§7) — the PO itself never
  originates a removal; it reflects removals that happened at the Quotation
  level.
- **Replace:** not directly meaningful at this level (a PO never chooses to
  replace a device on its own initiative — it only ever mirrors what the
  Quotation's active scope currently is). A replace at the Quotation level
  propagates here as: the old `PurchaseOrderItem` retires (per its own
  consumption state) and a new one is added for the new active
  `QuotationItem` — mechanically identical to Remove+Add, nothing new to
  design.
- **Qty change:** not directly settable here either — growth/shrink at the
  Quotation level propagates as new/retired `PurchaseOrderItem` rows exactly
  as Add/Remove already describe. `PurchaseOrder.revise()` never edits an
  existing `PurchaseOrderItem`'s `qty` (unchanged from today).
- **History snapshot:** unchanged — complete header + all current items
  (including their `status`) before any mutation.
- **Propagation to WorkOrder:** pull-based, per §7 — `WorkOrder.revise()`
  reconciles against this entity's current *active* items only.

### 8.4 WorkOrder

- **PLANNED/ASSIGNED revision boundary:** unchanged
  (`REVISABLE_WORK_ORDER_STATUSES`, `work-orders.service.ts:146`).
- **Active scope:** every current `WorkOrderItem` row (no status field
  needed — see §6.3).
- **WorkOrderItem immutability:** fully preserved. No design here ever
  updates an existing `WorkOrderItem`'s `qty` or identity fields — the only
  two operations possible are create (pull-in) and hard-delete (pull-out),
  matching the existing doc comment exactly.
- **Add:** existing pull-from-PurchaseOrder mechanism, unchanged.
- **Remove:** hard-delete of the `WorkOrderItem` whose source
  `PurchaseOrderItem` became inactive — always safe pre-`start()` (§6.3).
- **Replace/Qty change:** not directly meaningful at this level, for the
  same reason as §8.3 — this entity only ever mirrors its parent's active
  scope; whatever replace/qty-change happened upstream surfaces here purely
  as adds and removes.
- **History snapshot:** unchanged.
- **CalibrationJob boundary:** unchanged and untouched — no new status, no
  cancellation, no void concept (Decision 7).
- **Before `start()`:** the `WorkOrder`'s `WorkOrderItem` set can be freely
  reconciled (added to and removed from) via `revise()`, because no
  `CalibrationJob` exists yet for any of it.
- **Why no revision after `start()`:** `fanOutCalibrationJobs()`'s
  idempotency guard is WorkOrder-wide, not per-item
  (`work-orders.service.ts:601-604`) — a `WorkOrderItem` added after the
  first `start()` would never receive jobs through the existing mechanism,
  and a `WorkOrderItem` removed after `start()` would orphan or invalidate
  already-fanned-out, possibly already-in-progress `CalibrationJob`s with no
  existing mechanism to reconcile that (Decision 7 forbids inventing one).
  The existing `PLANNED`/`ASSIGNED`-only gate is therefore not just
  preserved but confirmed as the correct and sufficient boundary — no
  change to it is needed or proposed.

---

## 9. End-to-End Requisition → Quotation → PO → WOL Design

Worked combined example, using the source MOM's own scenario:

```
CURRENT:  Bedsidemonitor × 1, Ventilator × 1, Audiometer × 1
DESIRED:  Patient Monitor × 1, Ventilator × 3
```

Assume all three original lines are already consumed at every level down to
an `IN_PROGRESS`... no — per §8.4, revision cannot run on an `IN_PROGRESS`
`WorkOrder` at all, so this worked example assumes the chain has progressed
as far as an **`ASSIGNED`** `WorkOrder` (still revision-eligible), with a
`WorkOrderItem` existing for each of the three lines but **no**
`CalibrationJob`s yet (none fanned out before `start()`).

**At the `Quotation` level** (assume this is where the revision is invoked;
propagation downstream happens on subsequent, separate `revise()` calls per
entity, per §7):

| Line | Outcome | Mechanism |
|---|---|---|
| Bedsidemonitor | `REMOVED` | Consumed (has a `PurchaseOrderItem`) → **blocked by §6.1** until `QuotationItem` gains a retirement field. *(For this worked example only, assume the field exists, per §6.1's proposed shape, to show the intended end-state.)* History snapshot → retire in place. |
| Audiometer | `REMOVED` | Same as above. |
| Ventilator | `QTY_CHANGED` (1→3) | Consumed, growth → additive sibling row, qty = 2, per §5.4. Original frozen row (qty 1) stays active and untouched. |
| Patient Monitor | `ADDED` | New `QuotationItem`, no `id`, fresh lineage. |

**At the `PurchaseOrder` level**, on its own subsequent `revise()` call
(§7):
- Bedsidemonitor's and Audiometer's `PurchaseOrderItem`s: their source
  `QuotationItem`s are no longer active → §7.1 guard check → each has a
  `WorkOrderItem`, whose `WorkOrder` is `ASSIGNED` (still revision-eligible)
  → **safe** → history snapshot → `status = "CANCELLED"`.
- Ventilator's original `PurchaseOrderItem` (qty 1): source still active,
  untouched.
- Ventilator's new active `QuotationItem` (qty 2, from the sibling row):
  not yet represented → new `PurchaseOrderItem` created, qty 2.
- Patient Monitor: not yet represented → new `PurchaseOrderItem` created.

**At the `WorkOrder` level**, on its own subsequent `revise()` call (§7):
- Bedsidemonitor's and Audiometer's `WorkOrderItem`s: source
  `PurchaseOrderItem`s now `CANCELLED` (inactive) → hard `DELETE` (§6.3 —
  always safe pre-`start()`).
- Ventilator's original `WorkOrderItem` (qty 1): untouched.
- Ventilator's new `PurchaseOrderItem` (qty 2): not yet represented → new
  `WorkOrderItem` created, qty 2.
- Patient Monitor: not yet represented → new `WorkOrderItem` created.

**Resulting active `WorkOrder` scope:** Ventilator (qty 1, original) +
Ventilator (qty 2, sibling) = 3 total, + Patient Monitor (qty 1). Matches
the desired scope exactly. When `start()` eventually runs, fan-out produces
3 jobs for the two Ventilator rows combined (1 + 2) and 1 job for Patient
Monitor — using the existing, unmodified fan-out mechanism, which simply
iterates whatever `WorkOrderItem` rows exist at that moment.

Each of the three `revise()` calls above (Quotation, then PurchaseOrder,
then WorkOrder) is its own separate atomic transaction with its own history
snapshot and its own revision number — **this remains "pull, not push"
propagation, three separate operations, not one cross-entity transaction** —
exactly as the original MOM #1 design established and as this design
explicitly does not change.

---

## 10. WorkOrder / CalibrationJob Boundary

Unchanged from §8.4 and the prior forensic report — restated for
completeness per the source MOM's explicit requirement:

- No `CalibrationJob.CANCELLED`/`VOIDED` status is introduced.
- `fanOutCalibrationJobs()` is not modified.
- The `PLANNED`/`ASSIGNED`-only revision gate is confirmed sufficient: it
  already guarantees no `WorkOrderItem` a revision could ever touch has a
  `CalibrationJob`, which is exactly why §6.3's "always hard-delete, never
  retire" rule for `WorkOrderItem` is safe without any job-level mechanism.
- The §7.1 cross-chain guard is what prevents an *upstream* revision
  (`Quotation`/`PurchaseOrder`) from indirectly forcing a `CalibrationJob`
  to become orphaned or invalid once its `WorkOrder` has moved past
  `PLANNED`/`ASSIGNED` — it rejects the attempt outright rather than
  inventing a way to reconcile it.

---

## 11. History Snapshot Design

No change to the locked architecture. Reaffirmed:

- Every `revise()` call snapshots the **complete current header + all
  current items** before applying any reconciliation outcome — including
  items about to be retired or deleted. A retired/deleted item's last-known
  state is therefore always captured by the snapshot immediately preceding
  its removal.
- A removed item is simply **absent** from the *next* snapshot — no
  negative quantity, no `DELETED` marker row, no delta representation.
  `PurchaseOrderItemHistory` rows for a since-cancelled `PurchaseOrderItem`
  continue to reflect whatever `status` that item had *at the moment of that
  particular revision* (i.e., a later history revision correctly shows
  `status: CANCELLED` once that's been applied and a further revision
  occurs) — this requires no change to the existing `*ItemHistory` schema,
  since `PurchaseOrderItemHistory` already carries a `status` column
  (`schema.prisma`, copied verbatim from the live row at snapshot time).
- `sourceItemId` (already present on every `*ItemHistory` row) remains the
  only cross-revision traceability pointer — reading consecutive snapshots
  and diffing `sourceItemId` sets is how a "what changed between revision N
  and N+1" view would be built, entirely from already-existing data, with no
  new column needed anywhere in the history tables.

---

## 12. AuditLog Design

Unchanged distinction, reaffirmed: `AuditLog` continues to record only that
a revision action occurred (`recordAuditLog()`, existing action names
`*_REVISE`, `metadata: { number }`) — it does not gain new fields to
describe *what* changed. The `metadata.revisionNumber` — already the
established pointer pattern from the original MOM #1 implementation — is
what any consumer of `AuditLog` uses to look up the corresponding `*History`
row for the full detail. No change to `recordAuditLog()` or its call sites'
shape is required by this design; the same one-line-per-revision call
already made today (`calibration-requests.service.ts:566-574`,
mirrored in the other three services) remains correct, since it was never
scoped to describing item-level detail in the first place.

---

## 13. UI/UX Design

Conceptual design only, per the source MOM's explicit example — not an
implementation:

- The Revise dialog's frame changes from "current items, qty editable" to
  **"current scope vs. desired scope, with a status per line"** — mirroring
  the source MOM's own example table (`Added`/`Changed`/`Removed`/
  unlabeled-for-unchanged).
- **`+ Add Device`** — opens whatever device/type picker the existing
  create/edit forms already use (no new picker component to design; reuse
  the existing one), appending a new row with no `id`.
- **Change Device** — per §5.3, this is presented to the user as a single
  action on an existing row, but is translated by the client into a
  `REMOVED` (that row's `id` dropped from the submission) + `ADDED` (a fresh
  row with the newly chosen device, no `id`) pair before the payload is
  built. The user never needs to know this; the dialog can still visually
  show it as one row with an "Changed → new device" label.
- **Remove Device** — marks an existing row for exclusion from the
  submitted desired scope (i.e., the client simply omits that row's `id`
  from the payload it sends).
- **Change Qty** — existing behavior, unchanged; edits the numeric field on
  an existing row.
- All of the above accumulate client-side into one **desired scope table**
  before `Save Revision` submits exactly once, as one atomic call — matching
  §14's atomicity requirement and the source MOM's explicit "must remain ONE
  atomic Revision" instruction.
- For entities without a body (`PurchaseOrder`, `WorkOrder`), the Revise UI
  necessarily stays a trigger (§8.3/§8.4 — these entities don't accept a
  desired-scope payload at all, by design) but should be enhanced to show a
  **preview of what will change** (which lines will be added/retired) before
  the user confirms, since a bare confirm button with no visibility is a
  poor fit even for a pull-only operation — this was already flagged as a
  known limitation in the prior implementation-completion report and remains
  true here.
- Rows already consumed and blocked by the §6.1 gap (`CalibrationRequestItem`/
  `QuotationItem` consumed removal) cannot be offered as removable in the UI
  until that field exists — the dialog should disable/hide the remove
  affordance for such rows rather than let the user attempt an operation the
  backend cannot yet perform.

---

## 14. Transaction / Atomicity

*(Completed per the note at the top of this report — see there for why.)*

The entire reconciliation for a single `revise()` call — history snapshot,
every `ADDED`/`REMOVED`/`QTY_CHANGED` outcome, and the header total
recompute — happens inside **one `prisma.$transaction`**, exactly as the
existing implementation already does
(`prisma.$transaction(async (tx) => {...})`, present in all four services'
current `revise()` methods). This design changes *what* happens inside that
transaction (more outcome types to apply) but not the transactional
boundary itself:

- If any step fails — a §7.1 guard rejection, an unexpected FK violation, an
  `assertDeviceTypesExist`/`assertTariffsExist` failure on a new `ADDED`
  line — the **entire transaction rolls back**: no partial history, no
  partially-applied add/remove/qty-change set, no orphaned retirement.
  "Combined revision remains ONE atomic Revision" (source MOM §14/§9) is
  satisfied by this existing transactional mechanism with no new
  infrastructure required.
- The existing row-lock-then-allocate-revision-number ordering
  (`allocateRevisionNumber`'s documented precondition — the caller must take
  the row lock via an `UPDATE` before calling it) is unchanged and still
  required, since the transaction now does strictly more work per call, not
  less, and still needs the same race-safety guarantee for concurrent
  `revise()` calls on the same document.
- The §7.1 cross-chain guard must be evaluated **inside** the transaction,
  against live data read within that same transaction (not pre-checked
  outside it) — otherwise a concurrent `WorkOrder.start()` racing a
  `PurchaseOrder.revise()` could slip through between the check and the
  write. This mirrors the existing "consumed" `COUNT` checks, which are
  already performed inside the transaction for exactly this reason.

---

## 15. Non-Goals — Explicit Confirmation

Per the source MOM's non-negotiable list, confirmed as respected throughout
this design:

- History architecture: **not reopened** — still append-only, complete
  snapshot, immutable (§2, §11).
- No negative-quantity or `DELETED` history rows anywhere (§5.4, §11).
- No new document-level status (e.g. no `SUPERSEDED`) — `CANCELLED` at every
  header level keeps its existing, sole meaning of whole-document
  cancellation (unchanged; not touched by any part of this design).
- No `CalibrationJob.CANCELLED`/`VOIDED` — not proposed (§10).
- No event sourcing, CQRS, or generic revision framework — every mechanism
  described here is a direct, minimal extension of the four existing
  `revise()` methods' existing shape.
- No customer-facing document number change — untouched; no part of this
  design writes to any `number` field.
- No new item-identity model — `id` remains the sole matching key (§4);
  `deviceTypeId`/lineage FKs remain pointers, not identity.

---

## 16. Open Items Requiring Follow-Up (Explicitly Marked, Not Silently Resolved)

Per the source MOM's §20 instruction to mark genuinely unresolved points
rather than invent answers:

1. **`BUSINESS DECISION REQUIRED`** — should the eventual
   `CalibrationRequestItem`/`QuotationItem` retirement field (§6.1) be a
   boolean (`isActive`) or a richer status enum mirroring
   `PurchaseOrderItemStatus`'s shape (`OPEN`/`CANCELLED`, or similar)? Both
   are schema-compatible with everything in this design; the choice affects
   only whether these two entities might later want intermediate states
   (e.g. `ALLOCATED`-equivalent) the way `PurchaseOrderItem` already does.
   This design does not need the answer to proceed conceptually, but an
   implementation task will.
2. **`BUSINESS DECISION REQUIRED`** — when the §7.1 guard rejects a
   retirement because it would touch an `IN_PROGRESS`-or-later `WorkOrder`,
   what should the user-facing recovery path be? (E.g.: "contact the
   technician team," a manual out-of-band process, or a genuinely separate,
   explicitly-authorized override flow.) This design only specifies that the
   attempt must be **rejected**, not what the business wants to happen next.
3. **Not a business decision, but worth flagging for the implementation
   task:** §5.4's "consumed qty decrease → retire-old + add-new(full qty)"
   changes the *shape* of what a decrease produces (a brand-new row with a
   brand-new `id`, rather than any mutation of the existing row) — any UI or
   downstream reporting that currently assumes a line's `id` is stable
   across a qty decrease will need to account for this, exactly as it
   already must for the existing qty-increase sibling-row mechanism.
