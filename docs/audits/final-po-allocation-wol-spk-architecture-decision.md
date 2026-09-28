# Final Architecture Decision: PO → Allocation → WOL/SPK → WorkOrderItem → CalibrationJob

**Status: FINAL.** This report is the architecture decision pass for high-volume PO operational execution. It reconciles three prior audits into one target architecture and a finite set of explicit decisions. It is audit-only — **no schema, migration, service, UI, or seed changes were made.**

**Reconciled inputs:**
1. `docs/audits/high-volume-po-wol-split-architecture-audit.md` — current architecture, invariants, scalability.
2. `docs/audits/target-operational-execution-architecture-audit.md` — real Minto Hardjo data, execution-gate mechanics, numbering mechanics, master-data gap, AKD/AKL status.
3. `docs/audits/allocation-and-hierarchical-numbering-re-audit.md` — general-case scenarios, five allocation models, numbering models, DB-relationship-vs-human-identity distinction.

This report does not treat any prior audit as automatically correct. Contradictions are resolved using confirmed code evidence first, then existing domain invariants, then operational workflow, architectural consistency, extensibility, migration safety, and implementation complexity, in that order.

**This document is self-contained.** A reader who has not seen the prior three audits can understand the current architecture, why earlier reasoning was insufficient, the general-case problem, and the final decision from this document alone.

---

## 1. Executive Summary

Medcal's calibration workflow currently allows exactly one active `WorkOrder` (WOL/SPK) per `PurchaseOrder`, with every `WorkOrderItem` copying its source `PurchaseOrderItem` at full quantity, immutably. This was sufficient for the one real high-volume PO on record (RS Minto Hardjo: 56 items, 406 units, mostly small quantities per item) but cannot represent a PO shaped the opposite way — few line items, very large per-item quantities — where dividing work by whole item provides no meaningful parallelism at all.

**The final decision made in this report:**

- **A new, item-scoped `PurchaseOrderItemAllocation` entity is introduced.** It is not a PO-wide ledger and not a third "planning/WorkLot" tier. It represents a committed quantity of exactly one `PurchaseOrderItem`, created atomically together with the `WorkOrder`/`WorkOrderItem` it backs.
- **Whole-item allocation and quantity-level allocation are the same mechanism, not two mechanisms.** A whole-item allocation is simply one where the allocated quantity equals the full remaining quantity of the item — the degenerate case, not a separate code path.
- **`WorkOrderItem.qty` now means "the quantity allocated to this WorkOrder," not "the PO item's full quantity."** This is implemented additively (a new nullable `allocationId` FK) and requires no reinterpretation of any historical row, because every existing `WorkOrderItem` was already a whole-item allocation — the two meanings coincide for 100% of data that exists today.
- **The 1-active-WorkOrder-per-PO constraint is replaced** with an item-level exclusivity/sum invariant enforced inside the new Allocation entity, not at the PO level. A PO may have any number of simultaneously active WorkOrders.
- **CalibrationJob fan-out, technician assignment, measurement gates, BAI/Identity Correction, QA, and Certificate issuance are all unchanged.** They were already correct and already per-job/parallel-safe (confirmed in Audit 2); nothing about this decision touches them.
- **WOL/SPK numbering stays exactly as it is today** (`SPK/YYYY/MM/NNNNN`, `WOL/YYYY/MM/NNNNN`, flat, unmodified, immutable for existing documents). Human traceability of "which WOL, of how many, for which PO" is solved by a **computed, non-persisted display label** (e.g. "PO PKM-PO-2026-00125 · WOL 2 of 4"), rendered wherever a WorkOrder appears and added to raw exports as separate columns — not by encoding hierarchy into the document number itself.
- **PO progress and completion are explicitly defined**, including a new "unallocated" bucket that didn't exist in any prior audit's model, with two clearly labeled business-policy defaults (not architecture gaps).

**Implementation readiness: READY FOR IMPLEMENTATION.** No genuinely blocking business fact remains; every point that couldn't be settled from code alone was resolved with an explicit, safe, reversible default and labeled as such (Section 13).

---

## 2. Current Architecture — Confirmed Facts (recap, not re-derived)

These facts are established across all three prior audits and are treated as ground truth here:

- `PurchaseOrder` 1→N `PurchaseOrderItem`, each with an immutable `qty`.
- Today, exactly one non-cancelled `WorkOrder` may exist per `PurchaseOrder` — enforced by a Postgres partial unique index (`WorkOrder_purchaseOrderId_active_key`, `WHERE status <> 'CANCELLED'`), an explicit transactional check in `WorkOrdersService.create()`, and a Portal UI that hides "Create Work Order" once one exists.
- `WorkOrder.create()` copies **every** non-cancelled `PurchaseOrderItem` into a `WorkOrderItem` at its **full quantity**, immutably (`schema.prisma` doc comment: *"MVP copies every PO item 1:1 ... Quantity and source identity are immutable after create"*).
- `CalibrationJob` rows are fanned out exactly once, at `WorkOrder.start()`, from whatever `WorkOrderItem` rows exist at that moment — `qty` jobs per item, permanently owned by that WorkOrder.
- Technician assignment (`WorkOrderAssignment`) is WorkOrder-level; a technician's job list is everything under WorkOrders they're assigned to.
- Measurement completion, reference-equipment resolution, and pending-Identity-Correction gates on `submitForReview()` are all evaluated **per `CalibrationJob`**, independent of sibling jobs. QA (`decideQualityReview`) is likewise per-job. **These mechanics are already correct for parallel execution and require no change under this decision.**
- The AKD/AKL regulatory-identity gate has complete schema/API but **zero UI** in Portal or tech-pwa — a pre-existing, orthogonal gap. **Parked, unchanged by this decision.**
- `EquipmentDeliveryNote` ("DLN") is 1:1 per WorkOrder, ON_SITE-only, an outbound-equipment document — unrelated to certificates or completed work. **Unaffected by this decision**; it continues to scope 1:1 to whichever WorkOrder it belongs to, however many WorkOrders a PO ends up with.
- Document numbering (`DocumentNumberService`) is scoped by `(companyId, documentType, year)`, format `PREFIX/YYYY/MM/NNNNN` (5-digit sequence, cap 99999). Confirmed real formats: `SPK/YYYY/MM/NNNNN` (ON_SITE) and `WOL/YYYY/MM/NNNNN` (SEND_TO_LAB) — two separate, mutually exclusive formats, never combined. No document type in Medcal today encodes a parent's number as a suffix. The number is explicitly never re-parsed by the system (`work-order-pdf.ts:16`) — a human-facing convenience label, not a machine key.
- `PurchaseOrderItemStatus.ALLOCATED`/`FULFILLED` are declared but never written by any service — dormant, not partial groundwork for anything.
- MOM #1's append-only revision/history pattern (`WorkOrderHistory`, `WorkOrderItemHistory`, pull-based reconciliation in `WorkOrder.revise()`) is a proven, reusable precedent for "snapshot before mutating, reconcile against current active scope."
- Two pre-existing, orthogonal scalability defects: `workOrderInclude`'s unbounded `jobs` array (used even by the paginated WorkOrder list), and unbatched per-job `KontrolAlat` creation inside `start()`'s transaction. **Unchanged by this decision** — carried forward as an implementation constraint (Section 12), not solved here.
- Real Minto Hardjo data: 56 items, 406 units; only 201 units (9 items) resolve to usable device master data today; 139 units have no matching `DeviceType` at all. **This is a data-quality gap, entirely orthogonal to the architecture decided here** — not addressed by this report.

---

## 3. Why the Prior Reasoning Was Insufficient

Audits 1–2 established the facts in Section 2 correctly. Audit 2's error — corrected by Audit 3 and finalized here — was inferring from Minto Hardjo's *specific* item-size distribution ("47 of 56 items have qty ≤20") that whole-item splitting is *architecturally* sufficient. That inference doesn't generalize: a PO with few items and very large per-item quantities (a bulk single-device-model procurement, entirely plausible in medical-device calibration) makes whole-item splitting nearly worthless — it caps achievable concurrency at the PO's item count, independent of how many crews are actually available. With 5 line items, whole-item splitting can never produce more than 5 concurrent WorkOrders, regardless of operational need.

Audit 3 correctly identified this and constructed the general-case scenarios below, but stopped short of choosing a target architecture, deliberately presenting five allocation models and three numbering models without ranking. **This report makes that choice.**

---

## 4. General-Case Scenarios — How the Final Architecture Represents Each

All scenarios are explicitly hypothetical (not real data), used to validate the chosen architecture, not to justify it after the fact.

| Scenario | Shape | Representable under this decision? | How |
|---|---|---|---|
| A — Many items, small qty | 50–100 items × qty 1–10 | Yes | Each item gets one whole-quantity `PurchaseOrderItemAllocation` (the degenerate case), one per target WorkOrder. |
| B — Few items, huge qty | 5 items × qty 100–500 | Yes | Each item's quantity is split across as many `PurchaseOrderItemAllocation` rows (and therefore WorkOrders) as operationally desired — concurrency is no longer capped at item count. |
| C — One extreme item | Item ×500 → 10 WOLs of 50 | Yes | 10 `PurchaseOrderItemAllocation` rows against the same `PurchaseOrderItem`, each qty=50, each realized into its own `WorkOrderItem`/`WorkOrder`; the sum invariant (Section 6) guarantees they total exactly 500. |
| D — One item, uneven lots | Item ×120 → 30/40/20/30 | Yes | Same mechanism as C with unequal quantities; the sum invariant enforces the total never exceeds 120 regardless of order of creation. |
| E — One WOL, multiple items | WOL-01 = A×10 + B×20 + C×5 | Yes | One `WorkOrder` simply holds three `WorkOrderItem`s, each backed by its own (whole-item) `PurchaseOrderItemAllocation` against a different `PurchaseOrderItem`. No change from today's mechanics. |
| F — Mixed | A×100 split 3 ways; B×10 whole; C×200 split 2 ways | Yes | Each item is allocated independently and simultaneously; some items happen to have one allocation at full quantity (degenerate case), others have several partial ones. No special-casing needed — this is the normal operating mode of the chosen model, not an edge case. |
| G — Replanning pre-execution | 100 allocated 40+30, 30 remaining, then replan | Yes, pre-fan-out only | Cancel the under-committed `PurchaseOrderItemAllocation`(s) (returns quantity to "remaining"), create new ones. Mirrors `WorkOrder.revise()`'s existing snapshot-then-reconcile pattern. Not possible once `CalibrationJob`s have fanned out (Section 7) — by design, not oversight. |
| H — Concurrent execution | 4 WOLs, 4 teams, in parallel | Yes | Each WorkOrder is independently created, assigned, started, and executed; nothing in the chosen model requires WorkOrders under the same PO to coordinate with each other at runtime. |

---

## 5. The Allocation Boundary — Precise Definition

> **A `PurchaseOrderItemAllocation` is an immutable commitment of a specific quantity of exactly one `PurchaseOrderItem` to exactly one `WorkOrder`, created atomically together with that WorkOrder's corresponding `WorkOrderItem`. It remains counted against that `PurchaseOrderItem`'s consumed quantity permanently, unless explicitly cancelled before any `CalibrationJob` has been fanned out from its `WorkOrderItem`.**

This is Model 3 from Audit 3 (item-scoped allocation), deliberately **not** Model 2 (a PO-wide planning ledger) or Model 4 (a separate WorkLot tier):
- **Not Model 2:** there is no PO-wide "plan" object spanning multiple items — each `PurchaseOrderItemAllocation` concerns exactly one `PurchaseOrderItem`. This keeps the over-allocation invariant (Section 6) a simple per-item sum, not a cross-item ledger reconciliation, and avoids inventing a PO-wide planning state machine nothing in the current product needs.
- **Not Model 4:** there is no independent "WorkLot" lifecycle that can exist before, or outlive, its WorkOrder. An Allocation and its WorkOrder/WorkOrderItem are created in the same transaction and share the same fate.
- **Not Model 5:** `WorkOrderItem` itself is **not** repurposed as the allocation record. Its existing immutability invariant is fully preserved; the sum-invariant / concurrency check lives entirely in the new `PurchaseOrderItemAllocation` table, which is a far simpler correctness problem than making `WorkOrderItem` itself safely support concurrent partial writes (Audit 3, Section 6, identified this as Model 5's specific weakness).

**Why this boundary, over the alternatives:** it is the smallest addition that fully satisfies the general-case requirement (Section 4), it reuses the existing MOM #1 revision/history pattern without modification, it requires zero change to `WorkOrderItem`'s documented invariants beyond one additive nullable column, and it makes "allocation succeeds but WorkOrder creation fails" structurally impossible (they are the same transaction) — a failure mode Models 2 and 4 would both need to handle explicitly and this model does not.

---

## 6. Cardinality

```
PurchaseOrder
    1 ──── N ──→ PurchaseOrderItem

PurchaseOrderItem
    1 ──── N ──→ PurchaseOrderItemAllocation   (N ≥ 0; N = 1 in the whole-item/degenerate case)

PurchaseOrderItemAllocation
    1 ──── 1 ──→ WorkOrderItem                  (created together, same transaction)

WorkOrderItem
    N ──── 1 ──→ WorkOrder                       (unchanged — a WorkOrder can hold many WorkOrderItems)

WorkOrder
    N ──── 1 ──→ PurchaseOrder                   (unchanged FK; cardinality on this side now N, not ≤1)

WorkOrderItem
    1 ──── N ──→ CalibrationJob                  (unchanged — fan-out at start())
```

Explicit answers:
- **Can one Allocation contain multiple PO items?** No — one `PurchaseOrderItemAllocation` always concerns exactly one `PurchaseOrderItem`. Multi-item WorkOrders (Scenario E) are achieved by a WorkOrder holding several `WorkOrderItem`s, each backed by its own Allocation against a different item — never by one Allocation spanning items.
- **Can one PO item have multiple Allocations?** Yes — this is exactly how quantity splitting (Scenarios B–D, F) works.
- **Can one Allocation create multiple WorkOrders?** No — 1:1 with its `WorkOrderItem`, which belongs to exactly 1 WorkOrder. Spreading one item across several WorkOrders means creating several Allocations, one per target WorkOrder.
- **Can multiple Allocations belong to one WorkOrder?** Yes — a WorkOrder's `WorkOrderItem`s can be backed by Allocations against several different `PurchaseOrderItem`s.
- **Can one WorkOrder contain allocations from multiple PO items?** Yes (same as above).
- **Can an Allocation be split?** Not in place. Splitting means: cancel the existing Allocation (pre-fan-out only), create two or more new ones summing to no more than the original quantity. This mirrors `WorkOrderItem`'s existing "never mutate, delete/recreate" philosophy.
- **Can Allocations be merged?** Not in place, for the same reason — cancel the originals, create one combined Allocation.
- **When does an Allocation become immutable?** Its `qty` and its `purchaseOrderItemId`/`workOrderItemId` pairing are immutable from the moment of creation (same moment as its `WorkOrderItem`). Only its `status` field can change, and only once, `ACTIVE → CANCELLED`, and only pre-fan-out (Section 7).

---

## 7. Pre-Execution vs. Execution — Resolved

**Decision: Allocation and WorkOrder/WorkOrderItem creation are the same atomic operation. There is no independent, persisted "draft allocation with no WorkOrder yet" state.**

This directly answers Section 11's concern about Allocation becoming "a second WorkOrder with unclear responsibility": it cannot, because a `PurchaseOrderItemAllocation` never exists without its `WorkOrderItem` existing in the same instant, in the same transaction. If both must succeed or neither does, there is no state where "allocation succeeded but WorkOrder creation failed" needs to be reasoned about, unlike Models 2 or 4, which would need to define and handle exactly that failure mode.

**This does not sacrifice a "plan the whole split before committing" user experience.** A "Plan WOL/SPK" screen can let an operator stage several proposed WorkOrder/item/quantity groupings entirely client-side (unpersisted), reviewing the whole PO's intended split at once, and submit the entire batch in one API call that atomically creates N `PurchaseOrderItemAllocation` + `WorkOrder` + `WorkOrderItem` sets (each internally atomic; the batch can be sequential or a single larger transaction, an implementation detail, not an architectural one). The UX audits 2–3 wanted is fully achievable without a persisted pre-commitment database state.

**`WorkOrderItem`'s existing invariant is preserved, not reopened:** the doc comment "immutable after create" remains true. What changes is only what its `qty` *represents* (Section 8) and the addition of one new FK.

---

## 8. WorkOrderItem — Final Semantics

**Decision: Option B. `WorkOrderItem.qty` means "the quantity allocated to this WorkOrder for this PurchaseOrderItem," not "the PurchaseOrderItem's full quantity."**

- `WorkOrderItem` gains one new column: `allocationId` (FK to `PurchaseOrderItemAllocation`, **nullable**).
- For every `WorkOrderItem` created going forward, `allocationId` is required and `qty` is copied from (and must equal) `PurchaseOrderItemAllocation.qty` at creation.
- **Every existing `WorkOrderItem` row keeps `allocationId = NULL` forever — no backfill.** This is not a gap: every historical row was, by construction, a whole-item allocation (100% of the PO item's quantity), so its existing `qty` value is simultaneously correct under both the old meaning (full PO item quantity) and the new meaning (allocated quantity) — they were never different. Per this repository's own historical-data rule (do not backfill unless explicitly required), no backfill is warranted or performed.
- **`WorkOrderItem` remains immutable after creation.** This decision does not reopen that invariant — it only changes where the snapshotted `qty` value is sourced from (a validated Allocation instead of directly from the PurchaseOrderItem).
- **Every currently-known invariant that depended on Option A was checked and found unaffected:** `CalibrationJob` fan-out (`coerceFanOutQty`, `fanOutCalibrationJobs`) only ever reads `WorkOrderItem.qty` as "how many units to fan out" — it never compares it against `PurchaseOrderItem.qty`, so no fan-out logic changes. `@@unique([workOrderId, purchaseOrderItemId])` continues to hold (one `PurchaseOrderItemAllocation`/`WorkOrderItem` pair per WorkOrder, per item — unaffected by whether other WorkOrders also hold allocations against the same item). **Required future work, explicitly flagged (Section 14):** a repo-wide grep for any other place `WorkOrderItem.qty` is read and implicitly compared against `PurchaseOrderItem.qty` should be run before this ships, as a standard implementation-time verification step, not as a reason to delay this decision.

---

## 9. Over-Allocation and Concurrency — The Required Mechanism

**Hard requirement:** `SUM(qty of ACTIVE PurchaseOrderItemAllocation rows for a given PurchaseOrderItem) ≤ PurchaseOrderItem.qty`, safe under concurrent creation.

**Mechanism (not "validate in application code"):** at `PurchaseOrderItemAllocation` creation time, inside the same database transaction that will insert the new Allocation and its `WorkOrderItem`:

1. `SELECT ... FROM "PurchaseOrderItem" WHERE id = :itemId FOR UPDATE` — take a row-level lock on the specific `PurchaseOrderItem` being allocated against. This is a standard, well-understood Postgres pattern (the same class of mechanism used for inventory/ledger balance checks generally) and only serializes concurrent allocation attempts against **the same item** — allocations against different items proceed fully in parallel, so this introduces no PO-wide or system-wide bottleneck.
2. While holding that lock, `SELECT COALESCE(SUM(qty), 0) FROM "PurchaseOrderItemAllocation" WHERE purchaseOrderItemId = :itemId AND status = 'ACTIVE'`.
3. If `existingSum + requestedQty > PurchaseOrderItem.qty`, roll back and reject with a clear `OVER_ALLOCATION` error, reporting the actual remaining quantity.
4. Otherwise, insert the new `PurchaseOrderItemAllocation` (status `ACTIVE`) and its paired `WorkOrderItem` within the same transaction, then release the lock on commit.

This exactly mirrors the *shape* of today's proven pattern for the PO-level exclusivity check (an explicit transactional check as the primary guard) — the only difference is that today's check is an existence check (`findFirst` for an active WorkOrder) and this one is a sum check, which is why it needs the row lock (`FOR UPDATE`) rather than relying solely on a partial unique index, since Postgres unique indexes cannot express "sum of sibling rows ≤ N" directly. A `CHECK (qty > 0)` constraint on the Allocation table is added as a basic sanity backstop, but the authoritative correctness guarantee is the row-locked transaction, not a DB constraint — this is stated explicitly because the brief requires more than "the database can handle it."

---

## 10. Allocation Lifecycle

**Decision: the minimum state machine required is two states — `ACTIVE → CANCELLED` (terminal). No `DRAFT` or `REALIZED` state is introduced.**

There is no `DRAFT` state because Section 7 already established that an Allocation never exists without its `WorkOrderItem` — it is "realized" at the instant of creation, by construction. Adding a `DRAFT` state would only be meaningful if a persisted pre-commitment state were needed, which Section 7 explains is not required for the desired planning UX.

| State | Meaning | Quantity mutable? | WOL/SPK exists? | CalibrationJobs exist? | Consumes PO quantity? | Can be cancelled? | Counts in PO progress? |
|---|---|---|---|---|---|---|---|
| `ACTIVE` | A committed, live claim on part of a PO item's quantity | No (immutable from creation) | Yes, always (created together) | Only once the WorkOrder reaches `IN_PROGRESS` | Yes, always | Only while its `WorkOrderItem`'s WorkOrder is pre-fan-out (`PLANNED`/`ASSIGNED`) | Yes — as "allocated" (Section 11) |
| `CANCELLED` | The commitment was withdrawn before any execution began | N/A (terminal) | The WorkOrder/WorkOrderItem it backed no longer counts it | No (cancellation is only possible before jobs exist) | No — quantity returns to "remaining" | N/A (terminal) | No — excluded from active totals, visible only for audit history |

**What happens if cancellation is attempted after `CalibrationJob`s already exist?** It is rejected at the Allocation level. Once fan-out has occurred, withdrawing that commitment is a **WorkOrder-level** decision (`WorkOrder.cancel()`, with its existing consequences for in-flight jobs — unchanged by this report), not an Allocation-level one. This is a deliberate design choice, not an oversight: it keeps "can this specific commitment still be undone" a simple, correct question (yes, iff pre-fan-out) rather than requiring Allocation-cancellation logic to reason about arbitrary in-flight job states, which is already WorkOrder.cancel()'s job.

---

## 11. WorkOrder Creation / Realization

- **When does an Allocation become a WOL/SPK?** Simultaneously — never delayed, never a separate step.
- **Can an allocation exist without a WOL/SPK?** No.
- **Can an allocation be revised before WOL/SPK creation?** Not applicable in the sense asked — since they're created together, "revising a plan" is cancel-and-recreate (Section 6), the same pattern `WorkOrder.revise()` already uses for whole `WorkOrderItem`s, pre-fan-out.
- **Can WOL/SPK creation fail after allocation succeeds?** No — they are one transaction; both succeed or both roll back. This is a structural advantage of this model over Models 2/4, which would need to define and handle a genuine "allocated but not yet realized, and realization failed" state.
- **Retry/idempotency:** identical shape to today's pattern — a unique constraint (`PurchaseOrderItemAllocation` × `WorkOrderItem` pairing) plus an application-level check, exactly mirroring how `WorkOrder.create()` already handles the `P2002`-race-as-backstop pattern.
- **Does WOL/SPK inherit the allocated quantity directly?** Yes — `WorkOrderItem.qty` is copied from `PurchaseOrderItemAllocation.qty` in the same transaction, by construction (Section 8).

---

## 12. CalibrationJob Fan-Out and Ownership

**Unchanged, by design, per the "prefer correct ownership at creation over job-moving" principle:**

- Fan-out still happens exactly once, at `WorkOrder.start()`, from whatever `WorkOrderItem`s the WorkOrder holds — now correctly representing allocated (possibly partial) quantities rather than always-full quantities. No change to the fan-out algorithm itself (`coerceFanOutQty`, the `unitOrdinal`/`unitTotal` loop) — it already only cares about `WorkOrderItem.qty` as a plain integer, not about what that integer represents.
- **Jobs never move between WorkOrders, before or after this decision.** Because Allocation is fixed pre-fan-out (Section 7/10), correct ownership is guaranteed at the moment a job is born — there is never a scenario where a job needs to be reassigned to a different WorkOrder because the operational plan changed after execution began. If the plan must change after fan-out, that is a WorkOrder-level cancellation (Section 10), which already has defined, unchanged behavior.
- **Reallocation after fan-out is not supported, by explicit decision**, not by omission: it is unnecessary given the pre-fan-out lock-in of Allocations, and supporting it would reopen exactly the "immutable after create" simplicity `WorkOrderItem` and MOM #1's revision design were built around.

---

## 13. WOL/SPK Cardinality and Service Mode

- **The `WorkOrder_purchaseOrderId_active_key` partial unique index is replaced.** Exclusivity is no longer enforced at the PO level at all — it is enforced entirely inside `PurchaseOrderItemAllocation`'s sum invariant (Section 9), which is a strictly more precise mechanism (it prevents over-committing *quantity*, which is the thing that actually matters, rather than merely preventing a second WorkOrder from existing).
- **N (WorkOrders per PO) is not artificially bounded.** It is naturally limited only by how finely the business chooses to split quantities across items — there is no reason to impose an arbitrary ceiling, and no evidence supports one.
- **Sibling WorkOrders relate to each other only through their shared `purchaseOrderId`** — no new sibling-to-sibling relationship is introduced; none is needed.
- **Cancelled WorkOrders release their Allocations' quantity back to "remaining"** (Section 10), available for a new Allocation/WorkOrder to claim.
- **A PO can have any number of simultaneously active WorkOrders** — this is the entire point of the decision.
- **Service mode is unchanged and preserved exactly as today.** `ServiceMode` (`ON_SITE` / `SEND_TO_LAB`) continues to determine document series: `ON_SITE → SPK/YYYY/MM/NNNNN`, `SEND_TO_LAB → WOL/YYYY/MM/NNNNN`. These remain two separate, mutually exclusive formats — never combined into one, never renamed. A PO with multiple WorkOrders may freely mix ON_SITE and SEND_TO_LAB WorkOrders if its underlying `CalibrationRequest`s support that (unaffected by this decision either way, since `serviceMode` is inherited per-WorkOrder from its request exactly as today).

---

## 14. Numbering — Final Decision

**Decision: Model C.** The canonical WOL/SPK document number stays exactly as it is today — flat, unmodified, immutable for every existing and future document. Human traceability of "which PO, and which WOL of how many siblings" is solved entirely by a **computed, non-persisted display label**, never by changing the number itself.

**Concretely:**
- No change to `DocumentNumberService`, `DocumentNumberSequence`, or the number format, for any document type.
- A derived label — **"PO {purchaseOrder.number} · WOL {ordinal} of {count}"** — is computed at read time: `count` = the number of non-cancelled WorkOrders currently under the same PO; `ordinal` = this WorkOrder's rank among them (by creation order). This label is **not stored** — it is intentionally "live" and can shift if a sibling is later cancelled (e.g., "2 of 4" becoming "2 of 3"). This is treated as correct, expected behavior: the label describes a current operational fact, not a permanent identity; the WorkOrder's actual number never changes.
- This label is added to: the WorkOrder list and detail pages in Portal (currently shows the PO number as plain text or a link, with no ordinal/count context), the SPK/WOL PDFs (which already print the PO number as a subtitle — the label simply extends that existing line), and the two PDFs confirmed to currently omit any PO reference at all (LK Result PDF, Identity Correction PDF) — for consistency with the other generated documents.
- **Raw exports** (spreadsheets, reports) generated by the system can include the PO number and the ordinal/count as **separate columns**, computed the same way — this directly closes the "a raw list of flat numbers can't be visually grouped" gap that was the strongest evidenced case for embedding hierarchy in the number itself (Audit 3, Section 11).

**Why Model C over Model B (embedded parent-child numbering), explicitly justified:**
- Model B's unique remaining value over Model C is a printed/emailed document that is self-descriptive with zero system access. **This case is already substantially handled today**: both SPK and WOL PDFs already print the parent PO's number as a separate field on the page (confirmed in Audit 3, Section 3) — a printed WOL document is never "just a bare number," it already carries PO context as text. Model B would only additionally convey the *ordinal/sibling-count* in that offline scenario, which Model C's PDF-label addition also achieves, without changing the number.
- Model B carries permanent legacy-coexistence cost (Section 15) and open format questions (exact suffix scheme, year-boundary behavior for a PO/WOL pair spanning two years, whether a cancelled WOL's ordinal slot is reused) that Model C does not incur at all, because Model C never touches the numbering mechanism.
- **Sequence capacity is explicitly not the reason for this decision** — the 5-digit yearly sequence has no capacity problem at any scale considered (Audit 3, Section 12) and plays no role in choosing between B and C here.
- This is an operational-value judgment, not an aesthetic one: given that Model C closes the *same* evidenced gaps (Audit 3's "high-volume PO, many WOLs, can't tell siblings apart outside the UI") at materially lower cost and zero legacy risk, it is the better choice under this decision's stated priority order (migration safety, implementation complexity) once the value comparison is otherwise close.

---

## 15. Legacy Numbering Compatibility

Since Model C makes no change to the numbering mechanism, legacy compatibility is trivial: **every existing SPK/WOL number remains exactly as issued, forever, unmodified.** The computed display label is purely additive rendering logic — it requires no migration, no coexistence of "old format" and "new format" documents (there is only ever one format), and no parser anywhere is affected, since nothing about the label touches the stored `number` field. This is the direct, evidenced consequence of choosing Model C in Section 14 over Model B, and is itself part of why Model C was chosen.

---

## 16. PO Progress and Completion

**Source of truth:** `CalibrationJob.status` (existing enum, existing indexes) joined through `WorkOrder.purchaseOrderId`, plus `Certificate.status` (join, since Certificate is a separate 1:1 entity per job), **plus, newly, the `PurchaseOrderItemAllocation` sum per item** for the "unallocated" bucket that did not exist in any prior audit's model.

**Final bucket definition (eight buckets, all computable without loading every `CalibrationJob` — confirmed in Audit 2 that the required indexes already exist for the job-status buckets; the new unallocated bucket is a sum over `PurchaseOrderItemAllocation` rows, bounded by item count, not job count, so it stays cheap even at 4,000+ jobs):**

1. **Unallocated** — `PurchaseOrderItem.qty − SUM(ACTIVE Allocation.qty)`, aggregated across all of a PO's items. Genuinely new; didn't exist as a concept before this decision.
2. **Allocated, not started** — an `ACTIVE` Allocation exists, its WorkOrder hasn't reached `IN_PROGRESS`, so no `CalibrationJob`s exist for it yet.
3. **In progress** — `CalibrationJob.status = IN_PROGRESS`.
4. **Measurement complete, awaiting submission** — computed on demand (not a stored status, per Audit 2's finding), by re-running the existing completeness check over a bounded set.
5. **Submitted for review** — `status = SUBMITTED`.
6. **QA accepted** — `status = ACCEPTED_BY_QA`.
7. **Certificate issued** — `Certificate.status = ISSUED` (join).
8. **Cancelled** — jobs/allocations withdrawn before execution; excluded from active totals, retained for audit visibility only.

**BUSINESS-POLICY DEFAULT (explicitly labeled, not an architecture gap):** whether "allocated, not started" (bucket 2) should count as "progress" in customer-facing or management reporting is a display-policy choice, not an architectural one — this report's default is that it **does** count, as evidence of operational commitment distinct from "unallocated." This can be changed by adjusting which buckets a given view chooses to surface, with zero change to the underlying source of truth.

**PO Completion — final definition (not left open):**

> **A PurchaseOrder is "Completed" when: (a) its unallocated quantity is zero across every `PurchaseOrderItem`, AND (b) every `CalibrationJob` fanned out under it has reached `ACCEPTED_BY_QA`, AND (c) every one of those jobs has an `ISSUED` Certificate.**

**BUSINESS-POLICY DEFAULT (explicitly labeled):** condition (c) — requiring Certificate issuance specifically, not merely QA acceptance — is a deliberate, conservative default ("done" means the customer-facing deliverable exists, not just that internal QA approved it). If Medcal's business policy prefers a looser definition (e.g., PO completes on QA acceptance alone, certificates trailing), that is a one-line change to which conditions the completion predicate checks, not a change to any underlying data model or invariant.

**Cancelled allocations and completion:** a cancelled Allocation's quantity reverts to "unallocated" (Section 10) — it does not vanish from the PO's total commercial quantity, which per existing invariants never changes. A PO cannot reach "Completed" while any of its item quantity remains permanently unallocated; a cancelled allocation must eventually be re-allocated (to a new WorkOrder) for the PO to complete.

---

## 17. Customer Portal

**Target shape (confirmed as entirely greenfield in Audit 2 — `apps/customer-portal` currently has no PO, progress, or certificate view of any kind):**

```
Customer → PO Progress (the same 8-bucket source of truth, Section 16, collapsed into
                          a small customer-facing vocabulary) → Device/Job Detail
                          (per-device status) → Certificate download (once ISSUED)
```

- Internal `PurchaseOrderItemAllocation`, WOL/SPK structure, and technician assignment are **never exposed** to the customer — only the aggregate PO progress and per-device status, mapped to a simplified vocabulary (e.g., "Terjadwal / Belum Dialokasikan," "Sedang Dikerjakan," "Menunggu QA," "Selesai") derived from the same internal states, never a parallel/duplicate model.
- **Minimal access-scope note (not a general RBAC audit, per this decision's constraint):** visibility is gated by the existing `CustomerUserLink` relation (`schema.prisma:759`, already present) — a customer-portal user may only see PO progress for POs belonging to a `Customer` they are linked to. No new authorization mechanism is required; this reuses what already exists.

---

## 18. AKD/AKL — Parked

AKD/AKL (the regulatory-identity gate, Audit 2 Section C) is **out of scope for this architecture decision** and remains parked exactly as found: schema/API-complete, no UI, mandatory-but-currently-unreachable-through-the-product. It is mentioned here only because architectural completeness requires acknowledging it exists as a pre-existing, unrelated backend constraint. This decision does not expose it in any UI, does not make it a prerequisite of the Allocation/numbering work, and does not redesign its workflow.

---

## 19. Scalability

This decision preserves every scalability property already confirmed correct, and does not introduce a new one that scales worse:

- Fan-out remains a single batched `createMany` per WorkOrder — unaffected by Allocation existing above it.
- The over-allocation check (Section 9) is bounded by the number of `PurchaseOrderItemAllocation` rows for one item, never by job count — cheap at 400, 1,000, or 4,000+ jobs.
- PO progress aggregation (Section 16) is bounded by job-status `groupBy` counts (already indexed, per Audit 2) plus an Allocation-sum query (bounded by item count) — never an all-jobs fetch, at any scale.
- **The two pre-existing scalability defects identified in Audit 1 are unaffected by this decision and are restated here as implementation constraints, not solved by this report:** `workOrderInclude`'s unbounded `jobs` array must not be allowed to grow proportionally with total PO job count as multi-WorkOrder-per-PO makes individual WorkOrders' job counts more variable; and `KontrolAlat` creation inside `start()` must eventually be batched rather than looped per-job. Neither is implemented here — they are named so they are not silently reintroduced as "new" problems during implementation of this decision.
- More WorkOrders per PO (this decision's central capability) directly **reduces** the severity of the unbounded-`jobs`-array risk in practice, since each individual WorkOrder now holds a smaller job count than one PO-spanning WorkOrder would.

---

## 20. Final Architecture Diagram

```
                              PurchaseOrder
                          (commercial aggregate,
                           quantity per item fixed,
                            unaffected by this decision)
                                     │
                                     ▼
                            PurchaseOrderItem
                          (immutable qty, as today)
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
       PurchaseOrderItemAllocation (×N, sum ≤ item.qty,
        item-scoped, created atomically with its WorkOrderItem,
              ACTIVE → CANCELLED only, pre-fan-out)
                    │                │                │
                    ▼                ▼                ▼
              WorkOrderItem    WorkOrderItem    WorkOrderItem
             (immutable, qty = its Allocation's qty,
              carries allocationId FK; NULL on legacy rows)
                    │                │                │
                    └──────┬─────────┴────────┬───────┘
                           ▼                   ▼
                      WorkOrder A          WorkOrder B  ... N
                (N-per-PO now allowed; each independently
                 assigned, started, executed, cancelled)
                           │                   │
                           ▼                   ▼
                  CalibrationJob[]      CalibrationJob[]
              (fan-out at start(), unchanged; per-job gates —
               measurement completeness, BAI/Identity Correction,
               reference-equipment, QA — ALL UNCHANGED, already
               parallel-safe, confirmed in Audit 2)
                           │                   │
                           ▼                   ▼
                     Certificate          Certificate
                (unchanged: manual, per-job, decoupled from QA timing)
                           │                   │
                           └─────────┬─────────┘
                                     ▼
                   PO Progress (8 buckets incl. "unallocated",
                   Section 16 — cheap aggregation, no allocation
                   entity dependency for the job-status buckets,
                   Allocation-sum for the new unallocated bucket)
                                     │
                                     ▼
                     Customer Portal (greenfield; simplified
                     vocabulary; gated by existing CustomerUserLink)

  Numbering (orthogonal to all of the above): WOL/SPK document
  number stays flat, unmodified, immutable — SPK/YYYY/MM/NNNNN or
  WOL/YYYY/MM/NNNNN, never combined. Human traceability solved by
  a computed, non-persisted "PO {number} · WOL X of Y" display
  label, rendered in UI/PDF/exports — never encoded into the
  number itself (Model C, Section 14).

  Parked, unaffected by this diagram: AKD/AKL gate (Section 18),
  EquipmentDeliveryNote/DLN (still 1:1 per WorkOrder, equipment-out
  only), master-data coverage gap (data-quality, not architecture).
```

---

## 21. Final Decision Table

| Decision | Final Decision | Rationale | Evidence | Implementation Impact |
|---|---|---|---|---|
| PO → WOL cardinality | N active WorkOrders per PO, unbounded | Whole-item splitting alone caps concurrency at item count (Scenario B/C); quantity-level allocation removes that ceiling | §3, §4, §13; Audit 3 Scenario B/C | Drop `WorkOrder_purchaseOrderId_active_key`; exclusivity moves into Allocation's sum invariant |
| Allocation concept | Yes — a new, item-scoped `PurchaseOrderItemAllocation` entity | Smallest addition that fully satisfies the general-case requirement without a PO-wide ledger or a new WorkLot tier | §5, §6 | New table, new service methods, new minimal "Plan WOL/SPK" UI |
| Allocation granularity | Item-scoped (Model 3), not PO-wide (Model 2), not a third tier (Model 4) | Keeps the over-allocation check a simple per-item sum; avoids inventing a PO-wide planning state machine with no current evidence of need | §5 | One new table scoped by `purchaseOrderItemId` |
| Quantity splitting | Fully supported; whole-item is the degenerate case (split factor = 1) | Required by Scenarios B, C, D, F; explicitly not treated as mutually exclusive with whole-item assignment | §4, §5 | Allocation `qty` can be less than the item's remaining quantity |
| Remaining quantity | `PurchaseOrderItem.qty − SUM(ACTIVE Allocation.qty)` for that item; derived, not stored | Simplest correct source of truth; avoids a second denormalized field to keep in sync | §9, §16 | Computed on demand at PO-progress and allocation-creation time |
| Over-allocation protection | Row-locked (`SELECT ... FOR UPDATE`) transactional sum check at Allocation-creation time, plus a basic `CHECK (qty > 0)` backstop | A partial unique index cannot express a sum constraint; row-locking the specific item scopes contention to that item only | §9 | New transactional pattern in the Allocation-creation service method |
| WorkOrderItem.qty semantics | Option B — "quantity allocated to this WorkOrder" | Requires zero reinterpretation of historical data, since every existing row was already a whole-item (100%) allocation | §8 | New nullable `allocationId` FK; `qty`'s source changes, its meaning for existing rows does not |
| Allocation → WOL realization | Simultaneous — same transaction, no independent draft-persisted state | Eliminates the "allocated but WorkOrder creation failed" failure mode Models 2/4 would need to handle | §7, §11 | `WorkOrder.create()`/`revise()` extended to accept item+qty pairs and create Allocations alongside |
| CalibrationJob ownership | Unchanged — fixed at fan-out, never moved between WorkOrders | Correct ownership is guaranteed at creation because Allocation is locked in pre-fan-out; no reallocation-after-fan-out use case exists | §12 | No change to fan-out algorithm itself |
| WOL/SPK numbering | Model C — flat number unchanged; computed "PO · WOL X of Y" display label added in UI/PDF/exports | Closes the same evidenced traceability gap as embedding hierarchy in the number, at materially lower cost and zero legacy risk | §14 | New read-time computed label; no `DocumentNumberService` change |
| Legacy numbering | Fully immutable, untouched, no coexistence complexity | Direct consequence of choosing Model C | §15 | No migration needed for numbering itself |
| PO progress | 8 buckets incl. new "unallocated"; derived from job-status counts + Certificate join + Allocation sum | Extends Audit 2's already-working per-WorkOrder rollup pattern to PO scope, adding the one bucket that pattern was missing | §16 | New PO-scoped aggregation endpoint |
| PO completion | Zero unallocated AND all jobs ACCEPTED_BY_QA AND all jobs have ISSUED Certificate | A conservative, explicit default — "done" means the customer deliverable exists | §16 (labeled BUSINESS-POLICY DEFAULT) | New completion predicate, easily adjusted if policy differs |
| Customer progress | PO progress + per-device detail, internal structure hidden, gated by existing `CustomerUserLink` | Matches the brief's explicit non-goal of exposing internal planning complexity; reuses existing access mechanism | §17 | New, greenfield customer-portal views |
| AKD/AKL | Parked | Explicitly out of scope for this decision | §18 | None |

---

## 22. Business Decisions vs. Architectural Decisions

**Architectural decisions (made in this report, not requiring further business input to be implementable):**
- The architecture supports both whole-item and partial-quantity allocation as the same mechanism.
- Allocation is item-scoped and created atomically with its WorkOrder.
- WorkOrderItem's immutability is preserved; its `qty`'s meaning is Option B.
- Numbering stays flat; traceability is solved presentationally (Model C).
- CalibrationJobs never move between WorkOrders.

**Business-policy decisions (explicitly labeled defaults chosen so implementation is not blocked, reversible without an architecture change):**
- Whether "allocated, not started" counts toward displayed PO progress (default: yes) — Section 16.
- Whether PO completion requires Certificate issuance specifically, versus QA acceptance alone (default: requires Certificate) — Section 16.

No other point in this decision required a business-policy default to remain unresolved — every other question raised across the three prior audits was answered architecturally in Sections 5–19.

---

## 23. Implementation Boundary

**Must change:**
- New `PurchaseOrderItemAllocation` table: `(id, companyId, purchaseOrderItemId, qty, status[ACTIVE|CANCELLED], workOrderItemId, createdAt, ...)`.
- New nullable `allocationId` column on `WorkOrderItem`.
- Replace `WorkOrder_purchaseOrderId_active_key` with the Allocation-layer sum invariant (Section 9); no equivalent PO-level index is needed going forward.
- `WorkOrdersService.create()`/`revise()` extended to accept one or more `(purchaseOrderItemId, qty)` pairs instead of always consuming every active item at full quantity, performing the row-locked sum check (Section 9) per item.
- New "Plan WOL/SPK" Portal screen: shows a PO's items and remaining quantity per item, lets an operator stage one or more WorkOrder/item/qty groupings, submits atomically.
- PO detail page: from "single WorkOrder slot" to "list of WorkOrders for this PO."
- Computed "PO {number} · WOL {ordinal} of {count}" label added to WorkOrder list/detail UI, SPK/WOL PDFs (extending the existing PO-number line), and added fresh to LK Result and Identity Correction PDFs (currently show no PO reference at all).
- New PO-progress aggregation endpoint (8 buckets, Section 16), extending the existing per-WorkOrder `statusCounts` pattern to PO scope.
- New, greenfield customer-portal PO-progress and device-detail views (Section 17).

**Must NOT change:**
- `WorkOrderItem`'s immutability after creation.
- `CalibrationJob` fan-out timing, mechanism, and batching (`createMany`).
- Technician assignment model (`WorkOrderAssignment`, WorkOrder-level).
- Measurement-completion gate, reference-equipment gate, BAI/Identity Correction gate, QA/`QualityReview` flow — all already correct, all per-job.
- `EquipmentDeliveryNote`/DLN — remains 1:1 per WorkOrder, equipment-out only.
- `DocumentNumberService`, `DocumentNumberSequence`, and every existing document number format.
- AKD/AKL workflow and its (non-)UI.
- Certificate issuance mechanism (manual, per-job upload).
- Any historical `WorkOrderItem`, `PurchaseOrderItem`, or `CalibrationJob` row — no backfill, no reinterpretation.

**New invariants:**
1. `SUM(qty of ACTIVE PurchaseOrderItemAllocation for a PurchaseOrderItem) ≤ PurchaseOrderItem.qty`, enforced by a row-locked transaction at Allocation-creation time.
2. Each `PurchaseOrderItemAllocation` maps to exactly one `WorkOrderItem` (1:1), created atomically.
3. An Allocation may only be cancelled while its `WorkOrderItem`'s WorkOrder is pre-fan-out (`PLANNED`/`ASSIGNED`); after fan-out, withdrawal is a WorkOrder-level operation only.
4. Where `WorkOrderItem.allocationId` is set, `WorkOrderItem.qty` must equal that Allocation's `qty` at creation, and neither may change afterward.
5. A `PurchaseOrder` is "Completed" only when zero unallocated quantity remains AND all its jobs are `ACCEPTED_BY_QA` AND all have an `ISSUED` Certificate (business-policy default, Section 16/22).

**Migration requirements:**
- New `PurchaseOrderItemAllocation` table — purely additive.
- New nullable `WorkOrderItem.allocationId` column — additive, `NULL` on every existing row, never backfilled.
- Drop the `WorkOrder_purchaseOrderId_active_key` partial unique index — a constraint change only; no existing row's data is modified.
- No other schema changes; no data migration of any kind.

**UI requirements:** (see "Must change" above — Plan WOL/SPK screen, PO detail page's WorkOrder list, the computed ordinal/sibling label across WorkOrder UI/PDFs, PO-progress views, customer-portal views.)

**Explicitly deferred (genuinely outside this decision, not a disguised future-audit backlog):**
- Automatic/algorithmic allocation recommendation — requires technician workload/capacity/qualification data that does not exist anywhere in the schema (Audit 1); a separate, later initiative with its own prerequisites, not reopened here.
- Fixing the master-data coverage gap (139/406 real Minto Hardjo units with no matching `DeviceType`) — a data-quality initiative, unrelated to this architecture.
- Building the AKD/AKL UI — explicitly parked (Section 18).
- The two pre-existing scalability defects named in Section 19 (`workOrderInclude`'s unbounded jobs array; unbatched `KontrolAlat` creation) — real, but independent of this decision; carried forward as implementation constraints to respect, not solved by this report.

---

## FINAL ARCHITECTURE DECISION

- **Allocation model:** a new, item-scoped `PurchaseOrderItemAllocation` entity (Model 3), created atomically with its `WorkOrder`/`WorkOrderItem`, never existing independently of one.
- **Quantity-level allocation:** fully supported as the general mechanism; whole-item allocation is its degenerate case (split factor = 1), not a separate code path.
- **WOL/SPK cardinality:** N active WorkOrders per PO, unbounded, exclusivity enforced by the Allocation sum invariant rather than a PO-level constraint.
- **WorkOrderItem semantics:** Option B — `qty` means the quantity allocated to this WorkOrder; immutability preserved; implemented additively via a nullable `allocationId` FK; zero reinterpretation of historical data.
- **CalibrationJob ownership:** unchanged — fixed permanently at fan-out time, never moved, because Allocation is locked in before fan-out ever runs.
- **Numbering model:** Model C — the flat `SPK/YYYY/MM/NNNNN` / `WOL/YYYY/MM/NNNNN` format is unchanged and permanently immutable for every document; human traceability is solved by a computed, non-persisted "PO · WOL X of Y" display label in UI, PDFs, and exports.
- **PO progress/completion:** eight explicit buckets including a new "unallocated" bucket; PO completion requires zero unallocated quantity, full QA acceptance, and full certificate issuance (the certificate requirement is a labeled business-policy default, safely adjustable later).
- **Customer progress:** PO-level progress plus per-device detail only; no internal Allocation/WOL/technician structure exposed; gated by the existing `CustomerUserLink` mechanism.
- **AKD/AKL:** parked, untouched, unaffected.
- **Main invariants:** the five listed in Section 23.

## IMPLEMENTATION READINESS

**READY FOR IMPLEMENTATION.**

Every question raised across all three prior audits has been resolved either architecturally (Sections 5–19) or via an explicit, labeled, reversible business-policy default (Section 22) — none required a genuinely blocking business fact this report could not supply a safe default for. No further "challenge," "re-audit," or open-ended exploration is required for this topic to proceed to implementation planning.

---

*No schema, migration, service, UI, or seed changes were made in the course of this audit.*
