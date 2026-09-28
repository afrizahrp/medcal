# Allocation & Hierarchical Numbering Re-Audit

**Status:** Audit only. No schema, migration, service, UI, or seed changes were made.
**Purpose:** stress-test two conclusions from `docs/audits/target-operational-execution-architecture-audit.md` — that a general-purpose `Allocation` ledger is "not yet justified," and that WOL/SPK document numbering needs no redesign — against **general-case scenarios**, not the one real PO (RS Minto Hardjo, 56 items/406 units) those conclusions were drawn from.
**Explicit non-goal:** this report does not conclude "Allocation is/isn't needed" or "hierarchical numbering is/isn't better." It separates confirmed facts from inference, builds scenario evidence the prior audit didn't have, and marks what remains an open, product-level decision.

**Evidence discipline:**
- **CONFIRMED FROM CODE** — verified this session or a prior session by reading actual source.
- **CONFIRMED FROM PRIOR AUDIT** — established in one of the two earlier reports; cited, not re-derived.
- **HYPOTHETICAL** — an explicitly constructed general-case scenario, never to be confused with real data.
- **INFERRED** — a reasonable conclusion from confirmed facts.
- **OPEN QUESTION** — evidence is insufficient; a product/architecture decision is required.

---

## 1. Executive Summary

The prior audit's reasoning had a specific shape: it observed a statistic about the *one real PO* Medcal has on record (56 items, 406 units, with 47 items at quantity ≤20), and used that statistic to support an architectural claim ("whole-item splitting is sufficient," "a ledger-style Allocation entity is over-engineering"). **That inferential step — sample statistic to architectural sufficiency claim — is the specific thing being challenged here, and it does not hold up.**

Constructing general-case scenarios the real dataset doesn't cover shows:

1. **Whole-item splitting's usefulness is conditional on a PO having "many, individually modest" line items — a shape Minto Hardjo happens to have, not a shape the architecture can assume.** A PO with few items and very large quantities per item (Scenario B, C — hypothetical) makes whole-item splitting nearly useless: it caps achievable parallelism at the PO's *item count*, not at however many technicians/crews are actually available. With 5 items, whole-item splitting cannot produce more than 5 concurrent WorkOrders no matter how badly 10 are needed.
2. **Quantity-level allocation is not "maybe needed later if an outlier shows up" — for a PO shaped like Scenario B/C/D, it is the *only* thing that makes concurrent execution possible at all.** The prior audit's framing ("only 2 outlier items in this PO") treated this as a tail risk; general-case reasoning shows it's a **precondition** for an entire class of PO shapes, not a tail case within one PO.
3. **Numbering's DB-uniqueness question and its human-traceability question are genuinely separate, and the prior audit only fully answered the first.** `WorkOrder.purchaseOrderId` (a foreign key) has always fully solved "does the system know the parent." It has never solved, and does not by itself solve, "can a human look at a printed WOL number, or a raw list of WOL numbers, and tell which PO it belongs to or how many siblings it has" — a genuinely different question this report evaluates on its own terms.
4. **Medcal's existing numbering convention already treats the document number as more than an opaque key** (the `SPK`/`WOL` prefix already communicates service mode, a real operational fact, even though the system's own code explicitly never re-parses it — `work-order-pdf.ts:16`). This is direct evidence against treating "should the number carry meaning" as a closed question — Medcal already answered "yes" for one dimension (service mode) and left the parent/ordinal dimension unaddressed only because multi-WorkOrder-per-PO doesn't exist yet, not because a decision was made against it.
5. **Neither prior audit had evidence for or against Scenario B/C/D actually occurring in Medcal's real (or realistically future) customer base.** With exactly one real high-volume PO on record, N=1, no statistical claim about "what future POs typically look like" is supportable in either direction. This is the report's central, load-bearing finding: **the right next step is gathering more evidence, not picking a model.**

This report does not rank the five allocation models or the two numbering models. It documents what each can and cannot represent, what each costs, and what remains genuinely unknown.

---

## 2. Previous Audit Claims Being Challenged

Quoted directly from `docs/audits/target-operational-execution-architecture-audit.md`:

> **Claim 1 (Section A, Executive Summary):** *"A full ledger-style `Allocation` entity (quantity-splitting) looks like over-engineering relative to the real data: 51 of the 56 real line items are small enough (qty 1–20ish) that whole-item splitting ... would already let 4 technicians work concurrently."*

> **Claim 2 (Section E, Operational Workload / Allocation):** *"Whole-item assignment to a WorkOrder is sufficiently represented by extending the existing `WorkOrder`/`WorkOrderItem` model ... because that is already what `WorkOrderItem` means today — no new entity, just a relaxed cardinality."*

> **Claim 3 (Section J, Numbering):** *"There is no PO or WorkOrder dimension in the numbering scope at all ... Splitting a PO into WOL-01..04 requires no numbering redesign — each new WorkOrder just draws the next number in the existing yearly sequence, same as today."*

**What is being challenged is not whether these claims are internally accurate** — Claim 3's DB-level fact is correct and reconfirmed in Section 3 below. **What is challenged is the scope each claim was allowed to imply**: Claims 1–2 generalize from one PO's item-size distribution to a statement about architectural sufficiency; Claim 3 generalizes from "the database doesn't need to change" to "no redesign is needed," without separately evaluating the human-traceability dimension this report treats in Sections 10–13.

---

## 3. Evidence from Current Architecture

Consolidated from this session's research and the two prior audits; not re-derived here.

**Allocation-relevant mechanics (CONFIRMED FROM PRIOR AUDIT):**
- `WorkOrderItem` is an immutable, full-quantity, 1:1 snapshot of a `PurchaseOrderItem` (`schema.prisma:1945-1963`, doc comment: *"MVP copies every PO item 1:1 ... Quantity and source identity are immutable after create"*).
- `CalibrationJob` fan-out happens exactly once, at `WorkOrder.start()`, from whatever `WorkOrderItem` rows that WorkOrder holds at that moment (`work-orders.service.ts:599-648`).
- One active `WorkOrder` per PO is enforced by a partial unique index (`WorkOrder_purchaseOrderId_active_key`, migration `20260827210000`) plus an explicit transactional check in `create()`.
- `PurchaseOrderItemStatus.ALLOCATED`/`FULFILLED` are declared enum values, never written by any service — dormant, not partial groundwork.
- MOM #1's revision/history pattern (`WorkOrderHistory`, `WorkOrderItemHistory`, pull-based reconciliation in `WorkOrder.revise()`) is a real, working precedent for "snapshot before mutating, reconcile against current active scope" — reusable by any future allocation design, not something to invent from scratch.

**Numbering mechanics (CONFIRMED FROM CODE, this session):**
- `DocumentNumberSequence` (`schema.prisma:508-522`): columns `(id, companyId, documentType, prefix, year, lastSequence)`, `@@unique([companyId, documentType, year])`. No month, PO, or WorkOrder column of any kind.
- Allocation is a single atomic `INSERT ... ON CONFLICT (companyId, documentType, year) DO UPDATE lastSequence + 1 RETURNING` (`document-number.service.ts:55-81`) — race-safe under concurrency once a scope's row exists; the bootstrap read-max step for a brand-new scope is also race-safe (the upsert reconciles concurrent bootstraps).
- Real, confirmed format: `PREFIX/YYYY/MM/NNNNN` (e.g. `SPK/2026/08/00001`, `WOL/2026/09/00042`) — 5-digit sequence (cap 99999), counter scoped by **year only** (month is cosmetic, not a sub-scope). **The hyphenated `PKM-WO-2026-00125-01` style used illustratively in this audit's brief does not exist anywhere in the codebase** — it is a hypothetical format for discussion, not a real one.
- All 12 `DocumentType`s (CUSTOMER→CUS, CALIBRATION_REQUEST→CRQ, QUOTATION→QUO, PURCHASE_ORDER→PUR, WORK_ORDER→SPK, WORK_ORDER_SEND_TO_LAB→WOL, EQUIPMENT_DELIVERY_NOTE→DLN, INVOICE→INV, CERTIFICATE→CER, CREDIT_NOTE→CRN, IDENTITY_CORRECTION_BA→BAI, KONTROL_ALAT→KAL) use the same flat scheme. **None encode a parent document's number/ordinal as a suffix** — including `Certificate.supersedesCertificateId`, which allocates a fresh independent `CERTIFICATE` number on reissue rather than deriving one from the superseded certificate.
- **One genuine parent-scoped sequencing precedent exists, but produces a bare integer, not a formatted document number:** `revision-number.service.ts`'s `allocateRevisionNumber` computes `MAX(revisionNumber)+1` scoped by the parent record's own id (e.g. `WHERE workOrderId = parentId`), for internal `*History` rows. Its own doc comment notes race-safety there depends on the caller already holding a row lock on the parent.
- `work-order-pdf.ts:16` (comment): the WOL/SPK number "is never re-parsed to infer the document type" — the prefix is a human-facing convenience label today, not a machine-parsed key.

**Human traceability today (CONFIRMED FROM CODE, this session):**
- WorkOrder **detail** page shows the parent PO's number as a clickable link (`work-orders/[id]/page.tsx:294-306`); the PO detail page links back to its (currently singular) WorkOrder the same way.
- WorkOrder **list** shows the PO number as plain text only, no link (`work-orders-ui.tsx:374-376`).
- Both SPK and WOL PDFs already print the parent PO's number as a subtitle/table row (`work-order-pdf-spk.ts:74-88`, `work-order-pdf-wol.ts:98-99`); Kontrol Alat PDF prints both the WO number and the customer's PO number; LK Result PDF and Identity Correction PDF print **only** the WO number, no PO reference at all; Certificate has no generated template at all (it's an uploaded scan).
- WorkOrder list free-text search already matches substrings of `purchaseOrder.number` alongside the WO's own number, customer name, and quotation number (`work-orders.service.ts:376-385`).
- tech-pwa's job header shows **only** the WO number — no PO number anywhere on the technician-facing screen.
- **Nothing anywhere shows "this is WOL 2 of 4 for this PO"** — this specific ordinal/sibling-count context doesn't exist today, under any representation, because multi-WorkOrder-per-PO doesn't exist yet to display it for.

---

## 4. Why Minto Hardjo Cannot Be Treated as General Distribution

This is a statistical point, not a code one, but it is the crux of the challenge.

**The 47/56-items-at-qty≤20 statistic is a fact about one hospital's one procurement spreadsheet.** It reflects *that hospital's* mix of departments and device inventory — a general hospital ordering calibration across many different device categories (syringe pumps, monitors, scales, X-ray, physiotherapy equipment, etc.), each department contributing a handful of units. This is a plausible, but not inevitable, shape for "a hospital's PO."

**A different, equally plausible real-world PO shape was never tested:** a distributor or manufacturer commissioning calibration for a single device model across a large fleet (e.g., a nationwide rollout of one infusion-pump model, or a government program standardizing on one ventilator brand) would produce a PO with **few line items and very large per-item quantities** — the opposite shape. Nothing in Medcal's domain (medical-device calibration services) rules this out; if anything, bulk single-model procurement is a common real-world pattern in institutional medical equipment purchasing.

**With N=1 real high-volume PO on record, no distributional claim is statistically supportable in either direction.** The prior audit's own words — "47 of the 56 real line items are small enough" — are true and correctly evidenced *as a fact about Minto Hardjo*. The overreach is treating that fact as informative about the *general case* the target architecture must serve, when the sample size for that inference is exactly one.

**This is the previous audit's precise point of over-generalization, named explicitly:** Section E of `target-operational-execution-architecture-audit.md` moved from *"real quantity distribution of the 56 items"* directly to a recommendation ("whole-item splitting... would already let 4 technicians work concurrently... 33% of the entire PO's volume [is only 2 outlier lines]") without pausing to ask whether *this PO's* item-size distribution should be expected to hold for *other* POs. Sections 5–9 below construct the general-case scenarios that test that assumption directly.

---

## 5. General-Case Scenario Matrix

All scenarios are **HYPOTHETICAL** — constructed to stress the architecture, not observed data. Each is evaluated against: (a) today's exact current architecture, and (b) the "whole-item split" relaxation the prior audit leaned toward (1 PO → N WorkOrders, each claiming a disjoint subset of *whole* PO items, no quantity splitting).

### Scenario A — Many items, small volume
*50–100 PO items, quantity 1–10 each.*
**Whole-item splitting: fully adequate.** Each WorkOrder can claim a disjoint, individually-modest subset of items; balance across crews is achievable simply by counting items, since no single item dominates. This is structurally the same shape family as Minto Hardjo — confirms whole-item splitting genuinely fits *this* shape well, but proves nothing about shapes it doesn't resemble.

### Scenario B — Few items, very large volume
*5 PO items, quantity 100–500 each (e.g. total ~1,500 units).*
**Whole-item splitting: severely limited.** With only 5 items, whole-item splitting (even generalized to N-active-WorkOrders-per-PO) can produce **at most 5 concurrent WorkOrders**, because each item can belong to exactly one active WorkOrder under this model. A team wanting 10 parallel workloads to divide 1,500 units cannot get there — the achievable concurrency ceiling is `min(item count, desired crews)`, and here that ceiling is 5, regardless of how many technicians are available. **This is the sharpest concrete counter-example to the prior audit's lean.**

### Scenario C — One extreme item
*Syringe Pump ×500, needing e.g. 10 WOLs of 50 units each.*
**Whole-item splitting cannot represent this at all, in any generalized form.** A single `PurchaseOrderItem` can only be captured by one `WorkOrderItem` under the current model — `WorkOrderItem` is defined as a full-quantity, immutable, 1:1 snapshot regardless of whether the *PO-level* cardinality constraint is relaxed. The granularity mismatch here is at the *single-item* level, which relaxing the PO-level constraint does nothing to address. **Quantity-level allocation is not optional for this scenario — it is the only mechanism that could produce more than one WorkOrder from this one item.**

### Scenario D — One item spread unevenly across lots
*Infusion Pump ×120 → WOL-01=30, WOL-02=40, WOL-03=20, WOL-04=30.*
Same conclusion as Scenario C: requires quantity-level allocation. Additionally introduces a **remaining-quantity bookkeeping need** (running allocated sum must never exceed 120) that has no representation anywhere in the current schema — `PurchaseOrderItemStatus.ALLOCATED` is dormant, and no allocation ledger of any kind exists (Section 3).

### Scenario E — One WOL contains several items
*WOL-01 = Item A×10 + Item B×20 + Item C×5.*
**Already fully representable, unmodified, by today's exact model** at single-WorkOrder-per-PO granularity, and remains representable with no new concept under a relaxed multi-WorkOrder-per-PO model — this is simply "a WorkOrder claims three whole items instead of one." Confirms heterogeneous (multi-item) WorkOrders were never architecturally in question, independent of the allocation debate.

### Scenario F — Mixed allocation
*Item A×100 split 3 ways (40/35/25); Item B×10 whole to WOL-01; Item C×200 split 2 ways (100/100).*
This is arguably the most realistic **general** case: some items need splitting, most don't. It demonstrates that whole-item assignment and quantity-level allocation are **not mutually exclusive alternatives to choose between** — a real target architecture may need both simultaneously, applied per item based on that item's own size relative to operational capacity, not as a single global policy switch. Put differently: **whole-item assignment is the degenerate case of quantity-level allocation where the split factor happens to be 1** — which reframes "do we need Allocation" as "do we need the *general* form, even if most items in most POs only ever exercise its degenerate case."

### Scenario G — Replanning
*PO Item A×100; allocated WOL-01=40, WOL-02=30; 30 remains; operational plan then changes.*
**Nothing today tracks "remaining."** MOM #1's `revise()` pattern reconciles *which whole items* a WorkOrder holds, pre-fan-out, via snapshot-to-history-then-reconcile — but only at whole-item granularity (add/remove entire `WorkOrderItem` rows), never partial-quantity rebalancing. A genuine tension surfaces here: `WorkOrderItem`'s explicit "immutable after create" design was chosen specifically to keep `revise()`'s reconciliation logic simple. **Any quantity-mutable allocation concept would need to live in a layer separate from `WorkOrderItem`, or else it reopens exactly the invariant that made the existing revision design tractable.** Over-allocation prevention and audit-trail needs are both open — MOM #1's append-only `*History` pattern is a strong, reusable precedent for the audit-trail half, but not for the mutable-remaining-quantity half.

### Scenario H — Concurrent operational execution
*PO → WOL-01/02/03/04 → four technician teams, all running in parallel.*
**Feasibility is entirely conditional on the PO's own item-count/quantity shape, not a fixed property of the architecture.** Representable under whole-item splitting *only if* the PO has at least 4 items to distribute one-or-more per team (true for Minto Hardjo's 56 items; false for Scenario B/C's 5-item PO). There is no single yes/no answer to "can the architecture represent N concurrent WOLs" — it depends on data the architecture cannot control for by design choice alone.

---

## 6. Allocation Architecture Options

Five models, evaluated against the twelve requested dimensions. No ranking is given, per the audit's constraint.

### Model 1 — PO → WOL directly (today's shape, generalized to N-per-PO, whole-item only)
- **Cardinality:** 1 PO → N WorkOrders; 1 `WorkOrderItem` ↔ exactly 1 `PurchaseOrderItem`, always at full quantity.
- **Ownership:** a WorkOrder exclusively owns whichever whole PO items it claims; the existing PO-level exclusivity check is re-scoped to item level.
- **Quantity representation:** none needed — always 100% of the item.
- **Remaining quantity:** not a meaningful concept — an item is either claimed or not.
- **Concurrency:** today's pattern (explicit transactional check + partial unique index) generalizes directly, just re-scoped from "PO has an active WorkOrder" to "this PO item is claimed by an active WorkOrder."
- **Revision:** `WorkOrder.revise()`'s existing pull-based reconciliation extends with no new concept.
- **Cancellation:** `WorkOrder.cancel()` already frees its claimed scope for a replacement, exactly as it frees the whole PO today.
- **Auditability:** `WorkOrderHistory`/`WorkOrderItemHistory` already cover this.
- **Idempotency:** fan-out's existing per-WorkOrder guard (`count > 0` check) is unaffected.
- **Over-allocation protection:** structurally impossible to over-allocate, since quantity is never split.
- **Relationship to CalibrationJob:** unchanged — jobs still fan out 1:1 from `WorkOrderItem.qty`, permanently owned by their WorkOrder.
- **Impact to existing architecture:** smallest of all five models — one relaxed constraint, `create()`/`revise()` extended to accept an item subset, no new entity.
- **Structural limitation:** cannot represent Scenarios B, C, D, or the split-needing half of F, under any generalization.

### Model 2 — PO → Allocation → WOL (PO-wide planning/ledger entity)
- **Cardinality:** 1 PO → N Allocation records (each spanning one or more item-quantity lines) → each Allocation realized into (typically) 1 WorkOrder.
- **Ownership:** an Allocation record claims a specific quantity of specific items; the WorkOrder is created *from* an Allocation once it becomes an operational commitment.
- **Quantity representation:** a genuine ledger — explicit qty per (Allocation, PurchaseOrderItem) pairing.
- **Remaining quantity:** computed as PO item qty minus the sum of active Allocation quantities for that item — a first-class, queryable fact.
- **Concurrency:** requires a new invariant enforced at allocation-creation time — a running-sum check, not an existence check, so the existing partial-unique-index pattern does not directly transfer; would need either a serializable transaction, an advisory lock, or a check-constraint-plus-retry pattern.
- **Revision:** new logic needed — is an Allocation mutable before it becomes a WorkOrder? Realistically only pre-realization (mirroring `WorkOrder`'s own PLANNED/ASSIGNED-vs-IN_PROGRESS split), frozen after.
- **Cancellation:** cancelling an Allocation must release its claimed quantity back to "remaining" — new logic, no existing precedent for a *release* operation (today's `WorkOrder.cancel()` only ever frees a whole-item claim, never a partial one).
- **Auditability:** would need its own history table, following the MOM #1 pattern — straightforward to add, but a genuinely new table and new write paths.
- **Idempotency:** needs a new "already realized into a WorkOrder, don't double-create" guard, analogous to but distinct from today's fan-out guard.
- **Over-allocation protection:** this is the model's central value proposition — a running-balance check exists explicitly as first-class logic, rather than being structurally impossible (Model 1) or absent (today).
- **Relationship to CalibrationJob:** unchanged at the bottom — jobs still only originate from a `WorkOrderItem` inside a `WorkOrder`; Allocation sits above WorkOrder. **OPEN QUESTION:** should a `CalibrationJob` carry a back-reference to the Allocation it originated from, for traceability, or is the WorkOrder link sufficient?
- **Impact:** significant — new entity, new service layer, new "Plan WOL/SPK" UI (already flagged as a gap in the second audit), touches `revise()`/`cancel()` semantics, and PO-level progress must now also represent an "allocated-but-not-yet-a-WorkOrder" bucket that doesn't exist today.

### Model 3 — PO Item → Allocation → WOL (item-scoped allocation, narrower than Model 2)
- Same mechanics as Model 2, but the Allocation entity is scoped to exactly one `PurchaseOrderItem`, not a PO-wide plan spanning many items.
- **Cardinality:** 1 `PurchaseOrderItem` → N item-scoped allocation lines → each realized into a `WorkOrderItem` inside some WorkOrder.
- **Ownership/quantity/remaining/over-allocation:** identical formulas to Model 2, but computed and enforced **per item**, not aggregated across a PO-wide plan document — narrower blast radius per operation, simpler per-item queries.
- **Concurrency:** same running-sum-check shape as Model 2, scoped to one item's rows instead of a PO-wide table.
- **Revision/cancellation/auditability/idempotency:** same shape as Model 2, just without a PO-wide "planning session" concept to manage — one fewer state machine.
- **Relationship to CalibrationJob:** same as Model 2.
- **Impact:** smaller than Model 2 — one new, narrower table, no new PO-wide entity. **Trade-off:** loses the "see and plan the whole PO's split in one screen" UX Model 2's broader entity naturally supports, unless a UI layer aggregates many item-scoped allocation lines visually while the data model stays item-scoped (a legitimate way to get Model 2's UX on top of Model 3's data shape).

### Model 4 — PO → Planning/Work Lot → WOL (intermediate batching layer)
- Introduces a third tier: PO → WorkLot (a batch of claimed items/quantities, not yet operational) → WorkOrder (the operational execution unit) — a WorkLot need not be 1:1 with a WorkOrder; it could later be split into several, or several could merge.
- **Cardinality:** PO → N WorkLots → each WorkLot → 1+ WorkOrders.
- **Ownership/quantity/remaining:** same ledger mechanics as Model 2/3, with an added layer of indirection.
- **Concurrency/revision/cancellation:** more distinct lifecycle states to define — a WorkLot has its own lifecycle independent of any WorkOrder realized from it, meaning more service-layer complexity than Models 2/3.
- **Auditability:** needs its own history layer, separate from `WorkOrderHistory`.
- **Idempotency:** a second fan-out-like step (WorkLot → WorkOrder) needs its own idempotency guard, analogous to but distinct from today's CalibrationJob fan-out guard.
- **Relationship to CalibrationJob:** unchanged at the bottom (WorkOrder → CalibrationJob fan-out is untouched).
- **Impact:** the **largest** of the five models — two new concepts (the WorkLot lifecycle, plus whatever ledger sits inside it) layered on top of the existing WorkOrder machinery. Highest implementation and operational complexity, but the most flexible if operational planning genuinely needs to be decoupled from execution boundaries (e.g., re-grouping a WorkLot's remaining, unexecuted quantity into a *different* WorkOrder without re-touching the original commercial-to-operational decision).

### Model 5 — WorkOrderItem itself becomes the allocation record (no new entity)
- Relax `WorkOrderItem`'s own "always full-quantity, immutable" invariant so it can represent a **partial** quantity of a `PurchaseOrderItem`, and permit multiple `WorkOrderItem` rows (across different WorkOrders) to reference the same `PurchaseOrderItem`.
- **Cardinality:** 1 `PurchaseOrderItem` → N `WorkOrderItem`s — already technically permitted by today's `@@unique([workOrderId, purchaseOrderItemId])` composite key (CONFIRMED FROM PRIOR AUDIT: this specific constraint was flagged as *not* needing to change for multi-WorkOrder splitting) → each `WorkOrderItem` still belongs to exactly one WorkOrder, as today.
- **Ownership:** identical FK structure to today — no new table.
- **Quantity representation:** `WorkOrderItem.qty` is reinterpreted from "the item's full quantity" to "this WorkOrder's claimed portion" — a semantic change to an existing field, not a new one.
- **Remaining:** computed as `PurchaseOrderItem.qty − SUM(WorkOrderItem.qty)` across active sibling `WorkOrderItem`s for that item — no new table, just a query.
- **Concurrency/over-allocation:** needs a genuinely new, and genuinely harder, transactional check than any other model here — a partial unique index can express "at most one non-cancelled row" (today's pattern) but **cannot** express "sum of sibling rows ≤ N." This would require a serializable transaction, an application-level advisory lock, or a check-constraint-plus-retry pattern — a real, concrete new risk this model introduces that the centralized-ledger models (2–4) don't share in the same form, because they centralize the sum in one place rather than requiring it be recomputed correctly on every concurrent insert.
- **Revision:** directly conflicts with the *reason* `WorkOrderItem` was designed as immutable — that invariant is what keeps `revise()`'s reconciliation logic simple (delete/recreate whole rows, never mutate quantity). Reintroducing partial, mutable quantity here risks re-complicating exactly the mechanism MOM #1 was designed to keep simple.
- **Cancellation:** must correctly return the cancelled WorkOrder's specific partial quantity to "remaining" — same logic Models 2/3 need for their dedicated cancellation path, but now living inside `WorkOrder.cancel()` itself.
- **Auditability:** `WorkOrderItemHistory` already exists and could capture qty-at-snapshot-time with no new table.
- **Idempotency:** fan-out's existing per-WorkOrder guard is unaffected — jobs still derive from whatever `WorkOrderItem.qty` now means.
- **Relationship to CalibrationJob:** mechanically unchanged — `unitTotal`/`unitOrdinal` still derive from `WorkOrderItem.qty`, now correctly meaning "this WorkOrder's share."
- **Impact:** the smallest *schema* footprint of any model that actually handles quantity-splitting (no new table) — but it changes the meaning of an existing field and contradicts existing invariant language in the schema's own doc comments ("immutable after create," "MVP copies every PO item 1:1"). **This carries a distinct kind of risk from the "new table" models: silent assumption violations wherever other code implicitly trusts `WorkOrderItem.qty === PurchaseOrderItem.qty` today** — a repo-wide audit of that assumption would be required before this model could be safely adopted (see Section 18).

---

## 7. Quantity-Level Allocation Analysis

Section 5's scenarios show the need for quantity-level allocation is **conditional on PO shape, not universal, and not optional once that shape occurs**:

- Minto-Hardjo-like shapes (Scenario A/E: many items, modest quantities) — quantity-level allocation adds no value; whole-item splitting (Model 1) already suffices.
- Few-items/huge-quantity shapes (Scenario B/C/D) — quantity-level allocation is the *only* mechanism that enables meaningful parallel execution; whole-item splitting provides zero benefit.
- Mixed shapes (Scenario F) — both are needed simultaneously, per-item.

**The open question this report cannot resolve from code:** which shape family is representative of Medcal's real or realistically future customer base. With N=1 real high-volume PO on record, there is no evidentiary basis for assuming Minto Hardjo's shape is typical, atypical, or anything in between. This is explicitly **OPEN QUESTION** — it requires either (a) more real sales/PO data as it accumulates, or (b) a deliberate product decision to design for the harder case pre-emptively rather than wait for evidence that may take real customer losses to arrive (i.e., discovering the gap only when a real Scenario-B/C-shaped PO shows up and can't be executed in parallel).

---

## 8. Replanning / Remaining Quantity / Concurrency

Restating Scenario G's findings as a dedicated analysis:

- **No representation of "remaining quantity" exists in the schema today**, under any model — `PurchaseOrderItemStatus.ALLOCATED` is dormant (Section 3).
- **The over-allocation invariant** ("sum of active allocations for an item ≤ that item's PO quantity") does not exist anywhere and would need to be designed fresh for any model that supports quantity splitting (Models 2–5). Models 2–4 can centralize this check in one ledger table; Model 5 must recompute it correctly on every concurrent write against `WorkOrderItem` itself, which is structurally harder (Section 6).
- **A genuine architectural tension exists between "mutable, pre-commitment planning" and `WorkOrderItem`'s explicit immutability invariant.** Any model that wants a plan to be revisable *before* it becomes operational (Scenario G's "replan after 40+30 allocated, 30 remaining") either needs that mutable state to live in a layer *separate* from `WorkOrderItem` (Models 2–4), or needs to accept reopening `WorkOrderItem`'s immutability (Model 5), with the consequences described in Section 6.
- **Audit trail:** MOM #1's append-only `*History` pattern (snapshot-before-mutate) is a strong, directly reusable precedent for whichever model is chosen — this part of the problem is *not* open; the pattern to reuse already exists and works.
- **Concurrency:** every quantity-aware model (2–5) needs a real, tested-under-load answer to "what happens when two operators try to allocate against the same PO item's remaining balance at the same time" — today's codebase has exactly one working precedent for this class of problem (the atomic upsert in `DocumentNumberService`, and the transactional existence-check in `WorkOrder.create()`), neither of which is a sum-based check, so this specific concurrency shape has no direct precedent in the current codebase to copy from.

---

## 9. WOL/SPK Cardinality

Today: 1 active WorkOrder per PO (DB partial unique index + application check + UI, CONFIRMED FROM PRIOR AUDIT).

Under **Model 1** (relaxed, whole-item only): cardinality becomes **N-per-PO, bounded above by the PO's own item count** — Scenario B/H show this ceiling can be far below operational need.

Under **Models 2–5** (any quantity-aware allocation): cardinality becomes **N-per-PO, bounded only by business/operational choice** — Scenario C's "one item split into 10 WOLs" is representable precisely because the WorkOrder boundary is no longer tied 1:1 to whole PO items.

**This is a decision-relevant fact, not a settled architectural conclusion:** *which* allocation model is chosen directly determines the system's maximum achievable operational concurrency for a given PO shape. Choosing Model 1 is implicitly choosing to accept "concurrency capped at item count" as a permanent architectural ceiling, not just an interim one — a consequence that should be made explicit to whoever approves the decision, not left implicit.

---

## 10. Numbering Architecture Options

**Model A — Flat, current, generalized.** Each new WorkOrder draws the next number in the existing yearly `SPK`/`WOL` sequence, unchanged mechanism, zero schema change, regardless of how many WorkOrders a PO ends up with.

**Model B — Parent-child encoded in the number itself.** The document number grows a segment that encodes its relationship to the parent PO — either a literal suffix (the illustrative `-01`/`-02` ordinal), or a genuinely separate sub-sequence scoped by `(companyId, documentType, year, purchaseOrderId)`, analogous to how `revision-number.service.ts` already scopes a sequence by a parent id — just applied to a formatted, human-facing document code instead of an internal bare integer. **The exact format is explicitly open** — the brief's illustrative hyphenated format is one option among several, not a foregone conclusion.

**Model C — A third option not explicitly named in the brief: solve traceability in the presentation layer, not the numbering layer.** Keep Model A's flat number as the canonical, immutable document identity (nothing about `DocumentNumberService` changes), and add a **purely cosmetic, computed display string** wherever a WorkOrder is rendered — e.g. "PO PKM-PO-2026-00125 · WOL 2 of 4" — derived at read time from the existing FK relationship and a live count of sibling WorkOrders. This achieves the "which WOL, of how many, for this PO" value Model B targets, without touching numbering uniqueness mechanics, without any legacy-number immutability question (Section 14), and without needing the number to be reconstructed anywhere the number itself is used as a key.

---

## 11. Flat vs Parent-Child Numbering

Evaluated dimension by dimension, per the brief's explicit list:

| Dimension | Flat (Model A) | Parent-child in the number (Model B) | Evidence |
|---|---|---|---|
| Identifying parent PO | Already solved via FK + UI link + PDF subtitle, independent of number format | No additional capability beyond what's already solved | Section 3 |
| Human traceability (parent) | Solved (indirectly, via UI/PDF) | Solved directly, in the identity itself | — |
| Human traceability (ordinal/sibling count) | **Not solved by anything today** | Solved directly | Section 3 — confirmed gap under any current representation |
| Customer communication | A customer told "WOL/2026/09/00042" cannot tell it's "3 of 4" for their PO from the number alone | Conveys this in the number itself — useful for printed/emailed documents with no system access | — |
| Technician communication | A technician handed a printed SPK knows only its own number, not its siblings | Same benefit as above | — |
| QA communication | Same as technician | Same benefit | — |
| Document search | Already works today (free-text search matches `purchaseOrder.number` substrings, confirmed) | Adds "search by parent-number prefix" as a minor convenience, but enables nothing not already possible via the existing join-based search | `work-orders.service.ts:376-385` |
| Print/PDF reference | Both PDFs already print the PO number as a **separate field**, regardless of the WO's own number format | No structural benefit over what's already printed — this materially weakens the case that print/PDF specifically *needs* hierarchy embedded in the number, since the parent context is already on the page | `work-order-pdf-spk.ts`, `-wol.ts` |
| Audit trail | `WorkOrderHistory` is complete regardless of numbering scheme | No change | — |
| Support/debugging | Engineers key off the WorkOrder's internal `cuid`, not the human number, for anything programmatic | No change — the human number's role stays presentational in this dimension | — |
| Reconciliation | **OPEN QUESTION** — no evidence found on whether any downstream (billing, certificate-delivery) process keys off the number string itself | Same open question applies | Flagged for Section 18 follow-up |
| Cross-document navigation | Already solved via FK/UI | No structural benefit | — |
| High-volume PO (many WOLs) | **A real gap**: a raw list of flat WOL numbers for a 20-WOL PO cannot be visually grouped without the UI or a joined report | Directly solves this | This is the strongest evidenced case *for* Model B |
| Cancellation/replacement | A cancelled-and-replaced WorkOrder gets a brand-new flat number, per today's partial-index-excludes-CANCELLED pattern | Needs a new rule: does a cancelled WOL's ordinal slot get reused or retired? **OPEN QUESTION**, no precedent | — |
| Revision | `WorkOrderHistory.revisionNumber` is already parent(WorkOrder)-scoped internally (a bare integer, not customer-facing) — unaffected either way | Same | — |
| Year boundary | Flat numbering already resets its *label* yearly while the underlying scope is confirmed as year-based | A PO spanning a year boundary (WOL-01 in December, WOL-02 in January) raises a real legibility question: does the child ordinal or the parent PO's own identity govern what's shown, since a PO's own number is presumably also year-scoped and never changes after issuance? **OPEN QUESTION**, no code answers this since multi-year-spanning multi-WorkOrder POs don't exist yet | — |
| Multiple companies | Already company-scoped at every numbering level | Unaffected | — |
| Document type separation | SPK and WOL are already separate `documentType` values/prefixes | Unaffected, orthogonal | — |

---

## 12. Sequence Consumption Analysis

- **Capacity:** the 5-digit sequence (cap 99999) is scoped per `(company, documentType, year)`. Even an extreme scenario — 4,000 CalibrationJobs across, say, 200 WorkOrders in one company-year — is nowhere near this ceiling. **CONFIRMED: not a capacity risk under any scenario considered in this report.**
- **Readability:** this *is* a real, evidenced concern (Section 11's "high-volume PO" row) — a flat sequence provides no way to visually group siblings outside the UI.
- **Annual reset desirability:** no evidence found either way; this is a property of the existing `(company, documentType, year)` scope and is orthogonal to the allocation/hierarchy question — not re-litigated here.
- **Does child-scoped-per-parent numbering reduce the need for a global WOL sequence?** Structurally, yes — if WOL numbers were scoped per-PO the way `revision-number.service.ts` scopes revision numbers per-parent, a global yearly WOL counter could in principle be supplemented or replaced by a per-PO counter. **Medcal already has two different sequencing mechanisms** (the centralized-counter-table approach in `DocumentNumberService`, and the per-parent `MAX(...)+1`-from-the-child-table approach in `revision-number.service.ts`), each with different trade-offs: the centralized approach has a proven, atomic race-safety story already exercised at scale; the per-parent approach is conceptually simpler but — per its own doc comment — relies on the caller already holding a row lock on the parent, meaning WorkOrder-creation code would need to adopt that same locking discipline if this precedent were reused for document numbers.
- **Uniqueness:** both existing mechanisms already guarantee uniqueness within their own scope. A hierarchical scheme built by combining a unique parent segment with a unique per-parent ordinal is unique by construction — this likely needs no new DB constraint beyond whatever locking/retry discipline the per-parent ordinal allocation itself requires.

---

## 13. Human Traceability vs Database Relationship

This is the crux the brief specifically asked not to collapse prematurely.

- **The machine relationship** (`WorkOrder.purchaseOrderId`) has always fully answered "does the system know the parent." This has never been in question and is unaffected by any numbering decision.
- **The human-readable identity already carries some operational meaning today** — the `SPK`/`WOL` prefix communicates service mode (a real fact a human cares about), even though the system itself explicitly never re-parses it (`work-order-pdf.ts:16`). **This is direct, existing precedent that Medcal has already chosen "the number may carry human-meaningful operational information while remaining a system-cosmetic label" for one dimension.** Extending that same philosophy to a second dimension (parent/ordinal) would be *consistent* with existing convention, not a departure from it.
- **However, this is not "just formatting."** Once a number is printed, emailed, or spoken over the phone, humans and processes outside the system start to rely on it as a stable reference. Adding structure to it is a real commitment with real downstream consequences (Section 14), distinct in kind from the FK, which lives invisibly in the database and carries no such external-communication weight.
- **The brief's Part 9 question — "should the document number be opaque or an operational reference" — is evidenced to be narrower than it's posed.** Medcal has already answered "operational reference, not opaque" for the service-mode dimension. **The open question is not whether the number should carry meaning at all, but whether it should *additionally* carry parent/ordinal meaning — given that parent-lookup is already solved (imperfectly: no ordinal or sibling-count) via UI links and PDF cross-references today.**

---

## 14. Legacy Compatibility

- Existing SPK/WOL numbers are real, already issued, and in at least one case already delivered to a real customer (the live Minto Hardjo trial). Per this repo's own architecture rule (`.claude/rules/architecture.md`): *"Do not modify, reinterpret, or backfill historical production data"* and *"Never modify an already-applied migration."* **Any hierarchical scheme must be strictly additive** — existing flat numbers remain permanently as issued; only newly created WorkOrders (after any adoption cutover) would receive a different shape, if one is adopted at all.
- This means the system would need to tolerate **two number shapes coexisting indefinitely**. **A genuine point in favor of low migration risk here**, found directly in the code: `work-order-pdf.ts`'s own comment states the number is "never re-parsed" — since nothing today programmatically depends on a fixed format, introducing a differently-shaped number for new records breaks no known code path. The only residual risk is visual/layout — **OPEN QUESTION** whether any PDF/label template assumes a fixed number length or character count that a longer hierarchical number would overflow.
- **A real, unresolved design question:** if a new WorkOrder is linked to an *old-style-numbered* PO, does its (hypothetical) hierarchical number embed the PO's literal printed number, or a separate short code derived from the PO's database id/sequence? This is a genuine decision, not resolvable from the code as it stands — **OPEN QUESTION**.
- Previously printed documents remain valid regardless of any future scheme (an additive change invalidates nothing already issued).
- External references (a customer's own filing of a WOL number) are unaffected for existing documents; only the *look* of future documents would change, which is a change-management/communication concern, not a technical compatibility one.

---

## 15. Allocation ↔ Numbering Relationship

Directly addressing the brief's Part 11 question — does an Allocation/Planning layer between PO and WOL naturally require hierarchical identity?

**Evidence-based answer: no, the two questions are structurally independent, though not unrelated in practice.** The FK chain fully supports traceability regardless of whether the human-facing number embeds it — and this is proven by the current system itself: **today, with zero allocation layer, the WorkOrder number is already flat, and PO traceability is already solved solely via a DB relation plus a UI link.** The current single-WorkOrder-per-PO case already demonstrates that "flat number + traceability solved elsewhere" is a workable combination. Whether it continues to work well as the PO's WorkOrder count grows is a function of **volume and how often a human needs to reason about siblings outside the UI** (raw number lists, printed batches, cross-document paperwork) — an operational-workflow question, not an architectural-necessity one.

**One genuine interaction point, however:** if an Allocation entity (Model 2/3/4) is built, it likely needs its *own* human-readable identity ("Allocation #3 of PO PKM-PO-2026-00125"), which is a **new instance of the exact same opaque-vs-hierarchical question**, not yet considered by anyone, applied to a different entity. Choosing an allocation model and a numbering model in complete isolation from each other risks an awkward mismatch — e.g., building Model 4's WorkLot layer while separately deciding to encode PO-hierarchy directly into `WorkOrder`'s own number, when the more natural point to carry hierarchy might actually be the WorkLot's identity, not the WorkOrder's.

---

## 16. Architectural Risks

- **Model 5 risk:** silently violates the schema's own "immutable after create" invariant language; real risk of latent bugs wherever code implicitly assumes `WorkOrderItem.qty === PurchaseOrderItem.qty`. Not safe to adopt without the repo-wide audit named in Section 18.
- **Models 2–4 risk (building speculatively):** matches the prior audits' original "over-engineering" concern — a real risk if Medcal's real PO distribution turns out to resemble Minto Hardjo (many-small-items) more often than not, in which case this investment returns little value relative to its cost (new entity/entities, new UI, new invariants).
- **Model 1-only risk (not building any quantity-level allocation):** if even one real future PO has a Scenario B/C/D shape, the team is **structurally blocked** from parallelizing it at all, with no incremental path forward, because Model 1's concurrency ceiling is a hard function of item count. This is the symmetric risk on the other side of the ledger from the point above, and — given N=1 sample size — there is currently no more evidence for this risk than against it.
- **Hierarchical numbering risk:** permanent legacy coexistence complexity (Section 14); the open question of whether any downstream/print system silently assumes a fixed number format.
- **Flat-numbering-forever risk:** high-volume POs with many WOLs become genuinely harder for humans to reason about outside the UI (raw exports, paper trails) — a real, if lower-severity, risk than the allocation-side risks above.
- **Cross-cutting risk:** deciding the allocation model and the numbering model in isolation from each other (Section 15) could produce a design where hierarchy is encoded in the wrong layer relative to where the actual operational-planning boundary ends up living.

---

## 17. Decisions Required

Explicit product/architecture decisions this audit deliberately does not make:

1. **Does Medcal's real or realistically anticipated PO distribution actually contain Scenario B/C/D-shaped POs** (few items, very large quantities)? This is a sales/operations data question this architecture audit cannot answer from a single real data point.
2. **If yes, or if the business wants to design pre-emptively for it:** which allocation model (2/3/4/5) is preferred, accepting the trade-offs in Section 6 — no ranking is offered here by design.
3. **If no, or "wait and see" is acceptable:** is Model 1 (whole-item split only) an acceptable *interim* architecture, explicitly understood as incomplete for Scenario B/C/D, with a defined trigger for revisiting it (e.g., "the first real PO with fewer than 10 items and more than 100 units on a single line")?
4. **Should WOL/SPK numbering gain any parent/ordinal signal at all** — and if so, embedded in the number itself (Model B) or only as a presentational/display-level addition (Model C, Section 10)?
5. **If numbering hierarchy is adopted:** what exact format, and does it apply only to new WorkOrders, or is there appetite for a *display-only*, non-migrating enhancement (a computed "PO · WOL 2 of 4" label rendered for existing WorkOrders from already-available data, touching no stored `number` field and requiring no migration at all)?
6. **Does any downstream/reconciliation process (billing, certificate delivery, external audits) key off the WorkOrder/PO number string itself** in a way this audit could not verify (Sections 11, 17)?

---

## 18. Recommended Audit Questions for Next Phase

- Pull real sales-pipeline/quotation-stage data across Medcal's actual customer base (even pre-PO) to estimate whether Scenario A (Minto-Hardjo-like) or Scenario B/C-like shapes are more representative going forward, before committing to any allocation model.
- Confirm with whoever owns billing, invoicing, and certificate-delivery workflows whether any of them parse or key off the document number *string* today (resolves the open reconciliation question in Sections 11 and 17).
- **Before Model 5 could safely be considered:** audit every place in the codebase that reads `WorkOrderItem.qty` to confirm none silently assumes it equals the parent `PurchaseOrderItem.qty`. This audit did not perform that check — it is explicitly out of scope here and required as its own follow-up.
- As a UX question independent of the data model: has Management, a technician, or a customer actually asked for or struggled without "which WOL of how many for this PO" visibility? This audit found no user complaint or support-ticket evidence either way — only the structural *possibility* of the gap once multi-WorkOrder-per-PO exists.

---

## 19. Proposed Target Architecture Candidates

Presented without ranking, as the brief requires.

**Allocation:**
- *Model 1 alone* — smallest change, ships fastest, explicitly bounded (Section 9's concurrency-ceiling caveat must be documented as a known, accepted limitation, not a silent one).
- *Model 1 + Model 3, layered* — since Scenario F showed the two are not mutually exclusive: whole-item assignment for the majority of line items, a narrow item-scoped allocation record only for the specific lines that need splitting. Smaller than a full PO-wide ledger, addresses the sharpest counter-examples (Scenario C/D) without committing to Model 2/4's larger scope.
- *Model 4* — if operational planning genuinely needs to be decoupled from execution boundaries (re-grouping work after the fact without re-touching the original commitment) — the most flexible, and the most expensive to build and operate.
- *Model 5* — only after the repo-wide `WorkOrderItem.qty` assumption audit (Section 18) clears it as safe.

**Numbering:**
- *Model A, unchanged* — no risk, no new capability.
- *Model A + Model C's presentational-only ordinal/sibling display* — no number-format change, no legacy-coexistence question at all, directly closes the "high-volume PO" gap identified in Section 11 as the strongest evidenced case for *some* kind of hierarchy signal.
- *Model B, true embedded hierarchy for new documents only* — coexists permanently with legacy flat numbers (Section 14), delivers the strongest external-communication value (a printed/emailed document that's self-descriptive with no system access) at the cost of the open format/legacy questions in Sections 14 and 17.

**The most conservative combination available (Model 1 + Model A/C, no schema change to numbering) is already a strict improvement over today's "1 PO = 1 WorkOrder, forever" state for Scenario A/E-shaped POs, ships with the least risk, and explicitly defers the harder Model 2–5 / Model B questions until Section 18's evidence-gathering narrows them** — this is offered as an observation about sequencing options, not as this audit's final recommendation, per the constraint against a premature verdict.

---

*No schema, migration, service, UI, or seed changes were made in the course of this audit. AKD/AKL remains parked and was not reopened as an implementation topic. No RBAC analysis was performed beyond what the second audit already covered.*
