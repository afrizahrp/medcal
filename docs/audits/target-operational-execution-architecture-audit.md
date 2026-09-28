# Target Operational Execution Architecture — High-Volume PO (Real-Case Audit)

**Status:** Audit only. No schema, migration, service, UI, or seed changes were made. No mock workflows, fake data, or bypassed approvals were created.
**Supersedes/completes:** `docs/claude/plans/Calibration-management/COMPREHENSIVE-ALLOCATION-FOR-HIGH-VOLUME-DEVICES-AUDIT.md` (an incomplete audit brief).
**Builds on:** `docs/audits/high-volume-po-wol-split-architecture-audit.md` (the first, more abstract pass — its confirmed facts are cited, not re-derived, unless this audit found a reason to revise them).
**Real test case:** the actual RS Minto Hardjo trial PO — **56 line items, 406 units** — already seeded end-to-end through the real chain (CalibrationRequest → Quotation → PO → WorkOrder → 406 CalibrationJob rows).

**Evidence discipline, as required by the brief:**
- **CONFIRMED FROM CODE** — verified this session by reading actual schema/service/UI source.
- **CONFIRMED FROM PRIOR AUDIT** — established in the first audit; cited, not re-verified line-by-line here.
- **CONFIRMED FROM TRIAL DATA** — from the actual seeded Minto Hardjo run and its own audit report.
- **INFERRED** — a reasonable conclusion from confirmed facts.
- **OPEN QUESTION** — evidence is insufficient; flagged rather than assumed.

---

## A. Executive Summary

**The real Minto Hardjo case changes the verdict, not by reversing it, but by re-ranking the priorities.** The first audit was right that the architecture cannot represent "1 PO → N WorkOrders → per-technician allocation" today, and that this is a real, three-layer, intentional constraint. Grounding this in the *actual* 56-item/406-unit PO adds three findings the abstract audit couldn't see, and they matter more than the allocation question in the short term:

1. **The execution-gate mechanics the brief worries about (measurement completion, QA independence, BAI non-blocking) already work correctly, per-job, today.** `submitForReview()` gates on measurement completeness, reference-equipment resolution, and pending Identity Correction — all evaluated per `CalibrationJob`, with zero coupling to sibling jobs (`calibration-jobs.service.ts:1222-1285, 2595-2719`). `decideQualityReview()` operates on one job at a time (`:1293+`). **Splitting a PO into multiple WorkOrders would not need to touch any of this** — it's already parallel-safe.
2. **A second, real gap exists that has nothing to do with allocation and is more urgent for this actual customer:** of the 406 real units, only 201 (9 of 56 items — the EXACT and ALIAS matches) resolve to usable master data today. **139 units (36 items) have no matching `DeviceType`/`DeviceCalibrationParameter` at all**, and a further 66 units (11 items) need a human disambiguation click before they're usable. A device with no calibration parameters cannot be measured by any technician, on any WorkOrder, split or not. This blocks roughly half the real PO's volume *before* allocation is even relevant.
3. **The AKD/AKL regulatory-identity gate — a *mandatory* control per the brief's own §15 invariants — has zero UI anywhere in Portal or tech-pwa.** It is schema/API-complete but literally unreachable except by direct API call (`docs/claude/plans/Calibration-management/MINTO-HARDJO-HIGH-VOLUME-TRIAL-AUDIT-REPORT.md §5.2`, confirmed independently this session by grep). Building a multi-WorkOrder allocation layer while a mandatory approval gate has no way for a human to act on it through the product would be solving the wrong problem first.
4. **The recent "high-volume UX" work (`0778c6d`) is real and helps, but only partially closes the scalability gap the first audit flagged.** It added WorkOrder-level pagination and a job-level-paginated "scoped" view — but its own code comment states plainly: *"The grouped view paginates Work Orders, not the child job rows an expanded Work Order can still render (up to hundreds)"* (`calibration-jobs-page-client.tsx:280-282`). Expanding the one WorkOrder holding all 406 Minto Hardjo jobs in the default browsing view still renders all 406 rows unpaginated. This is a live, current defect, not a stale one from the earlier trial report.
5. **`poProgress` and `Allocation` are pure vocabulary today** — zero code, schema, or test references exist (confirmed by repo-wide grep). The dormant `PurchaseOrderItemStatus.ALLOCATED/FULFILLED` values and `PurchaseOrderItem.workOrderId` are unrelated leftovers, not partial groundwork.

**Verdict, stated plainly per the user's instruction not to force the existing architecture where it doesn't fit:**
- **PO Progress (§8): worth building, and it's cheap.** It's a `groupBy`-style count aggregation, does not require an `Allocation` entity to exist first, and can be built against the current single-WorkOrder-per-PO shape today (it would simply always show one WorkOrder's numbers — still useful, and it upgrades automatically once/if multi-WorkOrder is added).
- **Allocation, as a new ledger/entity: not yet justified by the real data, and would be over-engineering right now.** 47 of the 56 real line items have quantity ≤ 20; whole-item splitting (no quantity math) would already let 4 people divide the PO's *item* variety. The real problem this data exposes is not "we lack a way to slice quantities" — it's "over a third of the units can't be worked at all yet" and "a mandatory approval gate has no UI." Building `Allocation` now would not fix either.
- **Recommendation: do not lock onto `Allocation` as the next investment.** Fix the master-data-coverage gap and the AKD/AKL UI gap first (neither requires any of today's structural constraints to change); ship a PO-progress rollup (cheap, additive, no dependency); revisit multi-WorkOrder splitting only once real technician throughput data shows that WorkOrder-level (not item-level) parallelism is actually the bottleneck — which the current single-WorkOrder trial hasn't yet demonstrated, because the trial's real bottlenecks so far are data coverage and UI reachability, not "the four technicians have nothing to divide."

---

## B. Current Architecture (recap — see prior audit for full detail)

**CONFIRMED FROM PRIOR AUDIT**, restated briefly because everything below depends on it:
- `PurchaseOrder` → `PurchaseOrderItem` → `WorkOrder` (1 active per PO, DB partial unique index `WorkOrder_purchaseOrderId_active_key`, `schema.prisma:1932-1933`) → `WorkOrderItem` (full-qty 1:1 copy, immutable) → `CalibrationJob` (fanned out 1:N from `WorkOrderItem.qty` at `start()`, permanently owned by that WorkOrder).
- Technician assignment (`WorkOrderAssignment`) is WorkOrder-level only; a technician's job list is `workOrder.assignments.some({technicianUserId})` (`calibration-jobs.service.ts:751`) — no per-job ownership.
- `EquipmentDeliveryNote` ("DLN") is 1:1 per WorkOrder, ON_SITE-only, and is an *outbound equipment* document — not a completed-work/certificate document.
- `PurchaseOrderItemStatus.ALLOCATED/FULFILLED` and `PurchaseOrderItem.workOrderId` are dormant/unused (confirmed again this session by grep — zero hits beyond the enum/field declarations and one test asserting the pointer field stays at 0).
- Two real, code-confirmed scalability defects: `workOrderInclude`'s unbounded `jobs` array used even by the paginated WorkOrder list (`work-orders.service.ts:53-134,402`), and `ensureKontrolAlatRows`'s unbatched per-job document-number allocation inside `start()`'s transaction (`work-orders.service.ts:655-709`).

This audit does not re-derive these; see the first report for full citations.

---

## C. Existing Constraints (what's new vs. the first audit)

Everything in the first audit's constraint table (§H there) still holds. This audit adds:

| # | Constraint | Evidence | Impact on the real case |
|---|---|---|---|
| 11 | Measurement-completion gate is per-job, blocks only that job's submission | `assertMeasurementsCompleteForSubmit` (`calibration-jobs.service.ts:2595-2668`), called from `submitForReview` (`:1239`) | **CONFIRMED FROM CODE:** already correctly implements the brief's §3 requirement — no change needed for multi-WorkOrder splitting. |
| 12 | Reference-equipment resolution gate is per-job | `assertReferenceEquipmentResolvedForSubmit` (`:2693-2719`) | Same — already parallel-safe. |
| 13 | Pending Identity Correction ("BAI") blocks *submission*, not *start* | `assertNoPendingIdentityCorrectionForSubmit` (`:2669-2686`); `start()` (`:1177-1215`) has no identity-correction check at all | **CONFIRMED FROM CODE:** matches the brief's §3 instruction exactly — BAI is mandatory but never blocks a technician from beginning work. |
| 14 | The AKD/AKL regulatory-identity gate has schema + API but **zero UI** in Portal or tech-pwa | `docs/claude/plans/Calibration-management/MINTO-HARDJO-HIGH-VOLUME-TRIAL-AUDIT-REPORT.md §5.2`; confirmed this session — `useEscalateIdentity`/`useDecideIdentity` hooks exist (`use-calibration-jobs-query.ts:164-186`) but no rendered component calls them | A *mandatory* invariant (brief §15: "Mandatory BAI/Identity/equipment workflow tidak boleh dibypass") that today can only be exercised by a direct API call, not through the product. This is a functioning-workflow gap independent of allocation. |
| 15 | Certificate issuance is a manual, per-job PDF upload — not an automatic consequence of `ACCEPTED_BY_QA` | `certificate.service.ts:144-186` (`ensureCertificate` — create-if-absent, gated only on `deviceId` being resolved, invoked from `uploadVersion`) | "QA accepted" and "certificate available" (two distinct states the brief's §8 progress model explicitly wants to distinguish) really are decoupled in the data today — this is a real state, not a simplification the report is inventing. |
| 16 | Grouped Portal job list paginates WorkOrders, but an expanded WorkOrder still renders all of its jobs (up to hundreds) unpaginated | `calibration-jobs-page-client.tsx:118-122, 280-282` (own code comment) | **CONFIRMED FROM CODE, current, not stale:** the 406-Minto-Hardjo-jobs-in-one-table problem the earlier trial report found is *improved* (WorkOrder list is paginated, and a `?workOrderId=` deep link gets real job-level pagination) but **not fully fixed** for the default browsing path. |
| 17 | Customer-portal has no progress or certificate view at all yet — explicitly deferred | `apps/customer-portal/src/app/(app)/page.tsx:6-9,24-26` — code comment: *"business features (certificate list, history, etc.) belong to a later phase"*; on-page copy: *"Fitur sertifikat kalibrasi akan tersedia di sini pada tahap berikutnya"* | §9 (customer-facing progress) starts from **nothing**, not from a partial implementation to extend. |
| 18 | Document numbering is scoped by `(companyId, documentType, year)`, never by PO or WorkOrder | `document-number.service.ts:44-70` (raw `INSERT ... ON CONFLICT` against `DocumentNumberSequence`, keyed by those three columns) | **CONFIRMED FROM CODE:** numbering has no dependency on "1 PO = 1 WorkOrder." N WorkOrders per PO would each simply draw the next number in the same yearly WOL/SPK sequence — no numbering redesign is implied by allocation. See §J. |

---

## D. Requirements & Invariants (§15 of the brief, evaluated against real code)

| Invariant (from the brief) | Current status | Evidence |
|---|---|---|
| PO quantity must not be over-allocated beyond ordered quantity | **N/A today** — no allocation exists to over-allocate. If built, this becomes a real invariant to enforce (Section K). | — |
| One CalibrationJob must not have multiple operational owners | **Holds today by construction** — `workOrderId` is a required, singular FK; no job can belong to two WorkOrders. | `schema.prisma:2323` |
| Measurement point must be complete before a job can submit for review | **Holds — CONFIRMED FROM CODE.** | `calibration-jobs.service.ts:1239, 2595-2668` |
| Mandatory BAI/Identity/equipment workflow must not be bypassable | **Partially at risk — not because it can be bypassed, but because half of it (AKD/AKL) cannot currently be *exercised* through the product at all.** A workflow with no UI is not "bypassed" in the sense of a shortcut, but it is not a functioning control either. | §C row 14 |
| QA remains mandatory | **Holds.** No path exists from `SUBMITTED` to `ACCEPTED_BY_QA` other than `decideQualityReview` APPROVE (`:1293+`). | `calibration-jobs.service.ts:1293+` |
| PO must not be complete before all required downstream processes finish | **N/A today** — PO status never reaches a "complete" concept driven by job/certificate state (`PurchaseOrderStatus.FULFILLED` is dormant, confirmed in the first audit and re-confirmed here). This invariant doesn't yet have anything to hold or violate. | `purchase-orders.service.ts` (no `FULFILLED` write found) |
| Customer progress must be consistent with internal source of truth | **N/A today** — there is no customer-facing progress to be inconsistent (§C row 17). | `customer-portal` |

**Additional invariant found in code, not listed in the brief:**
- **`WorkOrder.done()` requires 100% of its jobs `ACCEPTED_BY_QA`** (`work-orders.service.ts:1103-1126`, CONFIRMED FROM PRIOR AUDIT) — this is itself an existing "PO/WorkOrder must not complete before downstream finishes" invariant, just scoped to WorkOrder rather than PO. Any target architecture should preserve or deliberately supersede this, not silently drop it.

---

## E. Operational Workload / Allocation (§5 of the brief) — answered neutrally, against real quantities

The brief explicitly forbids assuming an `Allocation` entity and asks: *what actually gets divided?*

**Real quantity distribution of the 56 items (CONFIRMED FROM TRIAL DATA, `MINTO-HARDJO-HIGH-VOLUME-TRIAL-AUDIT-REPORT.md §3`):**

| Line-item quantity band | # items | # units | % of 406 |
|---|---|---|---|
| qty 1–5 | 38 | ~85 | ~21% |
| qty 6–14 | 9 | ~90 | ~22% |
| qty 15–28 | 7 | ~121 | ~30% |
| qty 42, 94 (the two outliers) | 2 | 136 | ~33% |

Two line items alone — Syringe Pump (94) and Infusion Pump (42) — are **33% of the entire PO's volume**. Five more items (Nebulizer 22, Tensimeter Analog 28, Timbangan badan+tinggi 19, EKG 20, ESU 17, Ventilator 17) push the top-7-of-56 items to roughly half the PO's total units.

**What this means for "what gets divided," evaluated neutrally per the brief's three options:**

1. **Existing WorkOrder, used as-is (no allocation layer at all), just with the 1-active-per-PO constraint lifted:** would let the 4-person team divide the **49 small-to-medium items** (qty ≤ 28, ~270 units, two-thirds of the PO) cleanly across separate WorkOrders — each WorkOrder claims a disjoint subset of whole PO items. This alone materially improves the "4 people, one giant unbroken table" problem for most of the PO's item variety.
2. **But whole-item splitting cannot balance workload evenly**, because of the two outliers: whoever's WorkOrder claims "Syringe Pump ×94" carries 23% of the entire PO's job count in one line, no matter how the other 55 items are distributed. A quantity-splitting `Allocation` layer would be needed specifically to break up those 1–2 outlier lines — not the other 54.
3. **A new allocation/planning entity (full ledger, quantity-level, draft-before-commit)** — matches the brief's more ambitious framing, but the real data shows its value is concentrated in **2–7 line items out of 56**, not the dataset as a whole.

**Domain-boundary answer (evidence-based, not presumed):** the real data argues for a **hybrid, not a single new entity**:
- *Whole-item* assignment to a WorkOrder is sufficiently represented by extending the existing `WorkOrder`/`WorkOrderItem` model (lift the 1-active-per-PO constraint; let `WorkOrderItem` continue to mean "this WorkOrder gets 100% of this PO item"), because that is *already* what `WorkOrderItem` means today — no new entity, just a relaxed cardinality.
- *Quantity-level* splitting is only needed for the handful of large lines, and is a genuinely different concept from "which items does this WorkOrder cover" — it answers "how much of *this one item*." This is the part that would need new modeling (a small allocation record scoped to *one PurchaseOrderItem*, not a PO-wide ledger), and only if/when the business decides an outlier line must be split rather than assigned whole to one crew.

**Answering the brief's specific sub-questions:**
- *What is divided?* Evidence says: mostly **whole PO items**; **quantity-within-an-item** only matters for ~2–7 outlier lines.
- *When does division happen?* **OPEN QUESTION** — no code today models a "pre-commitment" planning stage; `WorkOrder.create()` is the first and only moment a PO item becomes operational today (immediately live, not draft).
- *Can it be a draft before becoming a commitment?* **Not today** — `WorkOrder.create()` has no draft/PLANNED-before-committed distinction beyond `WorkOrderStatus.PLANNED` itself, which already fans out real WorkOrderItems (just not CalibrationJobs yet). A true "draft plan, not yet a WorkOrder" concept does not exist.
- *How is remaining/unallocated work represented?* **Not represented today** — `PurchaseOrderItemStatus.ALLOCATED`/`OPEN` exist but are dormant (§B).
- *How is over-allocation prevented?* **N/A — nothing allocates yet**, so nothing prevents over-allocation. This would be a required invariant for whichever option is built (Section D).
- *How is duplicate ownership prevented?* **Already solved for whole-item assignment** by reusing `WorkOrderItem`'s existing `@@unique([workOrderId, purchaseOrderItemId])` plus a new "this PO item is claimed by exactly one *active* WorkOrder" check (the natural generalization of today's PO-level check, moved to the item level).
- *How are changes to the split handled?* `WorkOrder.revise()`'s existing pull-based reconciliation pattern (CONFIRMED FROM PRIOR AUDIT) is a directly reusable precedent for "re-sync this WorkOrder's items against its currently-claimed subset," before `start()` fans out jobs.

---

## F. WOL/SPK Architecture (§6) — what changes for 1 PO → N WorkOrders

**CONFIRMED FROM PRIOR AUDIT, reconfirmed:** relaxing "1 active WorkOrder per PO" to "N active WorkOrders per PO, each claiming a disjoint subset of whole PO items" requires:
- Replacing the partial unique index `WorkOrder_purchaseOrderId_active_key` (`schema.prisma:1932-1933`) with an item-level exclusivity check (e.g., a partial unique index on an item-claim join, or an application-level check mirroring today's pattern but scoped per PO item instead of per PO).
- `WorkOrder.create()` accepting a **subset** of PO item IDs instead of always all of them (`work-orders.service.ts:224-234` currently loads *every* non-cancelled item unconditionally).
- `WorkOrder.revise()`'s reconciliation extended to be aware of sibling WorkOrders' claims on the same PO, so a PO-item revision doesn't silently double-claim an item another WorkOrder already holds.

**Can workload be formed *before* CalibrationJob creation, so jobs never need to move after fan-out?** **Yes, and this already matches the current design.** Fan-out only happens once, at `start()` (`work-orders.service.ts:599-648`, CONFIRMED FROM PRIOR AUDIT), from whatever `WorkOrderItem` rows that specific WorkOrder already has. If item-to-WorkOrder assignment happens *before* any WorkOrder reaches `start()` (which is already true today — items are fixed at `create()`/`revise()`, both pre-`IN_PROGRESS`), then jobs are born already correctly owned and never need to move. **This is a real point in favor of the whole-item-splitting approach: it requires no "move a job between WorkOrders" capability to be invented**, because the existing "assign items, then fan out" order of operations already prevents that need.

---

## G. Technician Execution (§7)

- **Is WorkOrder a sufficient operational execution boundary?** For whole-item splitting: **yes** — `WorkOrderAssignment` already supports one or more technicians per WorkOrder (CONFIRMED FROM PRIOR AUDIT), and a technician already can hold assignments on multiple different WorkOrders with no schema change. Once "1 PO → N WorkOrders" is possible, "WOL-01 → Technician A, WOL-02 → Technician B" (the brief's own illustrative diagram) falls out for free.
- **Can one workload have several technicians?** Yes today, via `roleOnJob: LEAD | ASSIST` (unchanged by this audit's findings).
- **How does a technician see "their" workload?** Via `workOrder.assignments.some({technicianUserId})` (`calibration-jobs.service.ts:751`) — this already becomes a real per-crew view once WorkOrders are actually split; today it's moot because there's only ever one WorkOrder per PO to see.
- **How does Management monitor workload?** Today, only via the flat/grouped Calibration Jobs list and the WorkOrder list — both already exist and already work per-WorkOrder (§C row 16 caveat aside). No PO-spanning view exists (see §I).
- **Does the assignment model need to change?** **No structural change needed for whole-item splitting.** A change would only be needed if the business also wants *sub-WorkOrder* (per-job) assignment within one workload — which the real data (§E) doesn't clearly require, since the outlier-line problem is better solved by giving the outlier its own WorkOrder than by sub-dividing jobs within one WorkOrder.
- **RBAC scope, per the brief's narrow framing:** access is already scoped correctly for "can this technician see/act on the workload they're assigned to" — no broader RBAC audit is in scope or needed here.

---

## H. Measurement Completion Gate (§ — brief's §3 constraint)

**CONFIRMED FROM CODE**, already stated in §C rows 11–13: `assertMeasurementsCompleteForSubmit` walks the job's active, direct-replicate `DeviceCalibrationParameter` rows for its device type, joined against `JobCalibrationTestPoint` (the frozen per-job snapshot taken at `start()`) and `MeasurementResult` rows for the job's `currentAttempt`, to determine completeness (`calibration-jobs.service.ts:2595-2668`). This is fully per-job. **No change is implied by multi-WorkOrder splitting** — this gate doesn't know or care what WorkOrder a job belongs to.

---

## I. QA/Review Flow

**CONFIRMED FROM CODE:** `decideQualityReview` operates on a single `CalibrationJob` id, requires `status === "SUBMITTED"`, and either creates an `APPROVED` `QualityReview` (job stays `SUBMITTED` until a separate "technician complete" action, per the code comment at `:1288-1291`) or flips `SUBMITTED → REWORK` with `currentAttempt + 1` on `REJECT`. **There is no WorkOrder-level or PO-level gate on QA** — a QA backlog on one job never blocks another job's technician from continuing, exactly matching the brief's §3 requirement. This already holds without any allocation feature; it's a property of `CalibrationJob` being the review unit, not `WorkOrder`.

**Real-case queue-depth check (CONFIRMED FROM TRIAL DATA):** the seeded distribution has 40 jobs `SUBMITTED` awaiting a QA decision out of 406 — a real, present-day "review queue" of that shape already exists in the trial data. Nothing in the current UI presents this as a queue with capacity/throughput framing (it's just jobs with `status = SUBMITTED` in the flat/grouped list) — a dedicated "QA queue" view is a UI gap, not a data-model gap.

---

## J. Numbering (§10)

**CONFIRMED FROM CODE**, restated from §C row 18: `DocumentNumberService.allocate` keys strictly on `(companyId, documentType, year)` (`document-number.service.ts:44-70`), reading the max existing sequence and inserting/upserting a per-scope counter row. **There is no PO or WorkOrder dimension in the numbering scope at all.**

- *Is a 3-digit-style sequence a problem?* **No evidence found that it is** — the scope is per company/type/year, so volume within one PO doesn't compress the available number space any differently than volume anywhere else in the company.
- *Should hierarchy be a DB relationship instead of an encoded number?* **Already is.** The WOL/SPK number (`SPK/YYYY/MM/NNNNN` or `WOL/YYYY/MM/NNNNN`) is a human-readable label; the actual PO↔WorkOrder relationship is the `WorkOrder.purchaseOrderId` foreign key, not anything parsed out of the number string. Splitting a PO into WOL-01..04 requires **no numbering redesign** — each new WorkOrder just draws the next number in the existing yearly sequence, same as today.

---

## K. DLN (§11)

**CONFIRMED FROM PRIOR AUDIT, reconfirmed:** `EquipmentDeliveryNote` is unambiguously an **outbound reference/equipment document** (1:1 per WorkOrder, ON_SITE only, snapshots `WorkOrderEquipment`) — it is *not* a customer result/return document. **No hypothetical "customer result document" exists in the schema at all** (`Certificate` is the closest thing, and it's 1:1 per job with no batching/grouping concept — §C row 15).

**Impact if one PO has several WorkOrders:** trivial and mechanical — each WorkOrder would still get at most its own DLN (the `workOrderId @unique` constraint already supports this with zero change), because DLN is scoped to *equipment a technician carries to one on-site visit*, and a split-out WorkOrder is exactly one such visit. **This section is not where the real design risk is** — the risk is entirely in §E/F (allocation) and in the fact that no "certificate/result delivered to customer" document exists yet, which is a separate, unaddressed need regardless of splitting.

---

## L. Revision / Cancellation / Reallocation (§12)

| Stage | Current capability | Evidence |
|---|---|---|
| **Before execution** — allocation/planning revision, quantity change, technician reassignment | `WorkOrder.revise()` already reconciles items against the PO's active scope while `PLANNED`/`ASSIGNED` (CONFIRMED FROM PRIOR AUDIT); `assign()` can be called again to add technicians. No quantity-change concept exists because no quantity-allocation concept exists yet (§E). | `work-orders.service.ts:1175+` |
| **After WOL creation, before start** — cancellation, replacement | `cancel()` exists and frees the PO (partial index excludes `CANCELLED`) for a replacement WorkOrder — CONFIRMED FROM PRIOR AUDIT, this is the *only* multi-WorkOrder-per-PO path that already works today (sequential, not concurrent). | `work-orders.service.ts:1128-1148` |
| **After start, partial completion** | `done()` is all-or-nothing (100% `ACCEPTED_BY_QA`) — no partial-completion state exists at the WorkOrder level (CONFIRMED FROM PRIOR AUDIT). | `work-orders.service.ts:1103-1126` |
| **After execution — rework, QA rejection, reapproval** | Fully implemented, per-job (`decideQualityReview` REJECT → `REWORK`, `resumeFromRework` presumably resets to `IN_PROGRESS`) — already independent of WorkOrder structure. | `calibration-jobs.service.ts:1293+` |

**Does CalibrationJob ever need to move between workloads?** Per §F: **no, not if item-to-WorkOrder assignment happens before `start()`**, which is already the natural order of operations in the existing code. The architecture already avoids this need by construction — this is a genuine point in favor of the whole-item-splitting approach over any design that would allow jobs to be created first and sorted into workloads afterward.

---

## M. Scalability (§13) — re-validated against the current (not stale) codebase

The first audit's two scalability findings (`workOrderInclude`'s unbounded `jobs` array; unbatched per-job `KontrolAlat` creation in `start()`) were re-checked this session and **still hold** — nothing in the recent commits touched `work-orders.service.ts`'s include shape or the `ensureKontrolAlatRows` loop.

**New, current-state finding (§C row 16):** the recent high-volume UX pass (`0778c6d`) added:
- WorkOrder-level pagination for the default Calibration Jobs browsing view (`findAllGroupedByWorkOrder`, paginates WorkOrders not jobs).
- A "scoped" flat, job-level-paginated view, but **only reachable once a specific `workOrderId` or `purchaseOrderItemId` is already selected** (`calibration-jobs-page-client.tsx:118-138`).
- Its own code comment states the remaining gap plainly: an expanded WorkOrder in the *default* grouped view still renders all of its jobs, "up to hundreds," unpaginated (`:280-282`).

**At 406 (today):** tolerable but already the exact scenario the code comment flags. **At 1,000+:** expanding that one WorkOrder becomes a materially heavier page load. **At 4,000+:** this is compounded by the fact that a single PO forces a single WorkOrder to hold all 4,000 jobs (current constraint) — meaning *this specific* over-fetch risk gets worse precisely because splitting isn't possible, reinforcing the first audit's point that WorkOrder-splitting is also a performance mitigation, not just an org-chart one.

**PO-level progress aggregation performance (new, for §N below):** a `calibrationJob.groupBy({ by: ['status'], where: { workOrder: { purchaseOrderId } } })`-shaped query would **not** require loading every job — CONFIRMED FROM CODE: `CalibrationJob.workOrderId` is the leading column of two existing unique indexes (`@@unique([workOrderId, deviceId])`, `@@unique([workOrderId, purchaseOrderItemId, unitOrdinal])`, `schema.prisma:2429-2430`), so Postgres can already use one of those for a `workOrderId`-scoped grouped count without a new index. A PO-level version (joining through `WorkOrder.purchaseOrderId`) would need `WorkOrder`'s own `@@index([purchaseOrderId])` (already present, `schema.prisma:1941`) plus the same job-side index — **both already exist**. **PO progress is computable today without loading all CalibrationJobs, and without any schema change.**

---

## N. PO Progress (§8) — answered against the real numbers, not the brief's illustrative split

The brief's own illustrative example (406 = 110+100+96+100) is explicitly not to be treated as a target. Using the **real** 56-item shape instead:

- **Source of truth:** `CalibrationJob.status` (already a well-defined enum, already indexed), joined to `WorkOrder.purchaseOrderId` for PO scoping, plus a join to `Certificate` (existence + `status`) for the "certificate available" state the brief wants distinguished from "QA accepted" — these are genuinely different states today (§C row 15), so a real progress model needs both, not just job status.
- **Aggregation mechanism:** a single `groupBy` count query (or the existing `findAllGroupedByWorkOrder`'s `statusCounts` pattern, generalized from "per WorkOrder" to "per PO" by dropping the WorkOrder-id filter down to a PO-id filter) — CONFIRMED FROM PRIOR ART: this exact pattern already exists and works at WorkOrder scope (`calibration-jobs.service.ts:837-907`), so extending it to PO scope is a small, well-precedented change, not new engineering.
- **Query/performance implications:** none of concern — see §M; both required indexes already exist.
- **Can it be computed without loading all CalibrationJobs?** **Yes**, confirmed above — this directly contradicts a naive assumption that progress requires an expensive fetch; it doesn't, with the schema as it stands.
- **States to distinguish**, mapped to what's actually queryable today:

| Brief's requested state | Backed by | Available today? |
|---|---|---|
| Not started | `CalibrationJob.status = PENDING` | Yes |
| In progress | `status = IN_PROGRESS` | Yes |
| Measurement complete | Not a stored status — would need to re-run `evaluateMeasurementCompleteness` per job, or add a derived flag | **Partially** — computable on demand (already done for the "needs action" filter, `:933-971`), but not a stored/aggregatable column today without extra queries per job |
| Submitted for review | `status = SUBMITTED` | Yes |
| QA accepted | `status = ACCEPTED_BY_QA` | Yes |
| Certificate available | `Certificate.status` (join, since Certificate is a separate 1:1 entity) | Yes, via join — not via `CalibrationJob` alone |
| Final completed | **OPEN QUESTION** — no field defines "final completed" for a job or a PO today; closest existing analogue is `WorkOrder.done()`'s all-or-nothing gate, which is WorkOrder-scoped, not job- or PO-scoped, and doesn't check Certificate at all |

**This table itself is the honest finding for §8:** most of the requested progress buckets are already free (plain status counts); one ("measurement complete" as a *stored, aggregatable* fact) needs either a cheap per-request computation over a bounded set or a small denormalized flag; and "final completed" genuinely doesn't exist as a concept yet and needs a domain decision, not an assumption.

**On allocation-dependency:** none of the above requires an `Allocation` entity. It works identically whether a PO has one WorkOrder (today) or several (future) — a PO-scoped `groupBy` doesn't care how many WorkOrders sit underneath it.

---

## O. Customer-facing Progress (§9)

**CONFIRMED FROM CODE:** this is **not a partial feature to extend — it is nothing.** `apps/customer-portal` has a sign-in flow and one authenticated landing page that explicitly defers even certificate viewing to "a later phase" (§C row 17). There is no `PO`, `progress`, or `Certificate` concept rendered anywhere in that app today.

Per the brief's own framing (`Customer → PO → Overall Progress → Device/Job Detail → Certificate/Result`), **every layer of this pipeline is greenfield** except the underlying data it would read (PO, CalibrationJob, Certificate all already exist and are queryable, per §N). This is good news in one sense — there's no legacy customer-facing assumption to unwind — but it means "hide internal WOL structure from the customer" (the brief's stated goal) is not a redesign of an existing customer view; it's simply *not yet building* WOL-awareness into a page that doesn't exist yet. **This significantly lowers the risk of the allocation question "leaking" to customers**, precisely because there's no customer surface for it to leak into today.

---

## P. Target Architecture (§14) — evidence-based, not schema-first

Following the brief's required pipeline shape, annotated with what already satisfies each stage vs. what's a real gap:

```
Commercial PO                — exists, unchanged
      ↓
Operational Planning         — OPEN: no draft/pre-commitment stage exists (§E);
                                the smallest viable version is "WorkOrder.create()
                                accepts a subset of PO items," which needs no new
                                entity, just a relaxed cardinality (§F)
      ↓
Operational Workload         — WorkOrder, extended to N-per-PO for whole-item
                                splitting; a small item-scoped quantity-allocation
                                record ONLY for the 2-7 real outlier lines (§E)
      ↓
Technician Execution         — WorkOrderAssignment, unchanged (§G)
      ↓
Measurement Completion       — unchanged, already correct and already per-job (§H)
      ↓
QA                           — unchanged, already correct and already per-job (§I)
      ↓
Certificate                  — unchanged, but its decoupling from QA status must be
                                reflected explicitly in progress modeling (§N)
      ↓
PO Completion                — OPEN: no PO-level "complete" concept exists; needs a
                                new, explicit definition (likely: all constituent
                                WorkOrders DONE + all jobs have a Certificate) — a
                                domain decision, not inferable from code (§D, §N)
      ↓
Customer Progress            — entirely new build, no legacy surface to migrate (§O)
```

**Two real, independent prerequisite gaps sit outside this pipeline entirely and block real throughput regardless of how the pipeline evolves:**
- Master-data coverage (139/406 units have no `DeviceType` at all; §A finding 2).
- AKD/AKL gate UI (mandatory control, zero product surface; §A finding 3).

---

## Q. Data Model Impact

- **Relax, don't replace**, the PO↔WorkOrder cardinality: move the exclusivity check from PO-level to PO-item-level (Section F).
- **No change needed** to `WorkOrderItem`'s unique constraint shape for whole-item splitting (CONFIRMED FROM PRIOR AUDIT: `(workOrderId, purchaseOrderItemId)` already permits one PO item across many WorkOrders in principle — only the WorkOrder-level index currently prevents exercising it).
- **A new, narrowly-scoped allocation record** only if/when quantity-splitting for outlier lines is approved — scoped to one `PurchaseOrderItem`, not a PO-wide ledger (Section E).
- **No numbering schema change** (Section J).
- **No DLN schema change** (Section K).
- **Possibly one new field/state** for "final completed" at the PO or WorkOrder level, once that's domain-defined (Section N, P) — genuinely open, not decided here.

## R. Service/API Impact

- `WorkOrdersService.create()` — accept an explicit PO-item-subset parameter; replace the PO-level `existingActive` check with a per-item exclusivity check.
- `WorkOrdersService.revise()` — extend reconciliation to be aware of sibling WorkOrders' item claims.
- New: a PO-progress endpoint, generalizing `findAllGroupedByWorkOrder`'s `statusCounts` pattern from WorkOrder-scope to PO-scope (Section N) — additive, no change to existing endpoints required.
- New (separate initiative, not this one): customer-facing progress endpoint(s) for `apps/customer-portal` (Section O).
- **Not required by allocation itself:** any change to `submitForReview`, `decideQualityReview`, `assertMeasurementsCompleteForSafeSubmit`, or QA flow — all already correct (Sections H, I).

## S. UI/UX Impact

- Portal PO-detail page: from "one WorkOrder slot" to "list of WorkOrders for this PO" (mirrors the first audit's recommendation).
- Portal Calibration Jobs page: close the remaining in-group pagination gap (Section M) — arguably worth doing independently of allocation, since it's a live defect today.
- **New, higher-urgency UI work outside the allocation scope:** an AKD/AKL approval surface in Portal (Section C row 14) — currently a mandatory control with no way for MT to act on it.
- **New, separate initiative:** the customer-portal progress/certificate views (Section O).

## T. Migration/Compatibility Considerations

**CONFIRMED FROM PRIOR AUDIT, still true:** the partial unique index was added when the WorkOrder table was empty; the live Minto Hardjo trial data (and any other seeded/real WorkOrders since) must not be broken by relaxing it — any migration must be additive (a PO *can* have more than one active WorkOrder; it doesn't have to), never destructive to existing single-WorkOrder POs.

---

## U. Open Questions (consolidated)

1. **Should quantity-level allocation be built at all**, given it only matters for 2–7 real outlier line items? Or should the business simply accept "the outlier line gets its own dedicated WorkOrder, whole, to one crew" as good enough?
2. **What defines "PO final completed"?** All WorkOrders `DONE` + all jobs have an issued `Certificate`? Something else? No code today implies an answer (Section N, P).
3. **Should "measurement complete" become a stored, aggregatable fact** (a denormalized flag maintained alongside `MeasurementResult` writes) rather than computed on demand per job, once PO-progress dashboards make it a frequently-queried state?
4. **Is fixing the AKD/AKL UI gap and the master-data coverage gap a prerequisite to allocation work, a parallel workstream, or out of scope for this initiative entirely?** This audit's recommendation (Section A) is prerequisite-or-parallel, not blocking, but that's a product-priority call, not a code fact.
5. **Should the remaining in-group job-pagination gap (Section M) be fixed as part of this initiative** given it directly affects the same 406-job WorkOrder this whole audit is about, or is it tracked separately?

---

## V. Implementation Phases (high-level only — do not implement)

1. **Decision phase:** resolve U1–U2 with the domain owner.
2. **Phase A (independent, arguably higher priority than allocation):** close the master-data coverage gap for the real device types this trial actually needs, and build an AKD/AKL approval surface in Portal.
3. **Phase B (low-risk, no dependency on allocation):** build the PO-progress rollup (Section N) — it works today even with the single-WorkOrder constraint unchanged, and upgrades automatically if/when Phase D ships.
4. **Phase C (independent):** close the remaining in-group job-pagination gap (Section M).
5. **Phase D (only if U1 resolves toward "yes, build it"):** relax PO↔WorkOrder cardinality to whole-item splitting (Sections E, F, P) — smaller and better-precedented than a full ledger.
6. **Phase E (only if the real outlier-line problem proves to matter in practice):** narrow, item-scoped quantity allocation for large lines only — not a PO-wide ledger.
7. **Phase F (separate initiative):** customer-facing progress in `apps/customer-portal` (Section O), once Phase B's underlying aggregation exists to read from.

---

## W. Minto Hardjo 406-unit Walkthrough (real numbers, not the brief's illustrative split)

1. **PO approved:** 1 PO, 56 items, 406 units (real, seeded).
2. **Operational planning (target state, not built today):** MT reviews the 56 items; assigns ~49 small/medium items across, say, 3 WorkOrders by whichever grouping is operationally convenient (device family, location), and gives the 2 outlier lines (Syringe Pump ×94, Infusion Pump ×42) their own WorkOrders — 5 WorkOrders total, none requiring quantity splitting.
3. **Workload distribution (illustrative, not prescriptive — the brief explicitly says not to force a specific split):** e.g. WOL-A (Syringe Pump, 94), WOL-B (Infusion Pump, 42), WOL-C/D/E (the remaining 54 items' ~270 units, split by device family across 3 crews) — real totals, not a manufactured round number.
4. **Technician assignment:** one or more of the 4-person team per WorkOrder, via unchanged `WorkOrderAssignment`.
5. **Job creation/fan-out:** unchanged — each WorkOrder's `start()` fans out only its own items' jobs, exactly as today, just repeated per WorkOrder instead of once for all 406.
6. **Technician execution:** unchanged, already parallel-safe per job (Section H).
7. **Measurement completion:** unchanged per-job gate — but **only ~201 of 406 units can reach this step without master-data work first** (Section A finding 2) — this is the walkthrough's real bottleneck, not the WorkOrder split.
8. **Submit for review / QA:** unchanged, already parallel and independent per job (Section I).
9. **Certificate:** manual per-job upload once `deviceId` is resolved — decoupled from QA timing (Section C row 15).
10. **PO progress:** computed by the Section N aggregation across all 5 WorkOrders' jobs — e.g. "406 total: 120 not started, 90 in progress, 70 measurement-complete-awaiting-submit, 40 submitted, 44 QA-accepted, 30 certificated" (illustrative shape, not the real current distribution, which today is single-WorkOrder: PENDING 247 / IN_PROGRESS 59 / SUBMITTED 40 / REWORK 16 / ACCEPTED_BY_QA 44).
11. **Customer-facing progress:** would show one PO, one overall progress bar, with device/job-level drill-down — entirely new build (Section O).
12. **Final PO completion:** **OPEN QUESTION** — no definition exists yet (Section N/U2).

---

## X. Final Architecture Diagram

```
                         PurchaseOrder (commercial aggregate, unchanged)
                                    │
                    ┌───────────────┴────────────────┐
                    │   (relaxed: N active allowed)   │
                    ▼                                 ▼
              WorkOrder A                       WorkOrder B  ... N
           (whole PO items,                  (whole PO items,
            no qty split)                     no qty split)
                    │                                 │
           WorkOrderItem[]                    WorkOrderItem[]
           (full-qty, as today)               (full-qty, as today)
                    │                                 │
            start() fan-out                   start() fan-out
                    │                                 │
           CalibrationJob[]                   CalibrationJob[]
           (per-job gates:                    (per-job gates:
            measurement, BAI,                  measurement, BAI,
            reference-equip,                   reference-equip,
            QA — ALL UNCHANGED,                QA — ALL UNCHANGED,
            already parallel-safe)             already parallel-safe)
                    │                                 │
              Certificate                       Certificate
           (manual, per-job,                 (manual, per-job,
            decoupled from QA)                 decoupled from QA)
                    │                                 │
                    └───────────────┬─────────────────┘
                                     ▼
                    PO-Progress aggregation (NEW, cheap,
                    groupBy over CalibrationJob.status via
                    WorkOrder.purchaseOrderId — no allocation
                    entity required, works today with N=1)
                                     │
                                     ▼
                  Customer-facing progress (NEW, greenfield,
                  apps/customer-portal has nothing to migrate)

   Outlier lines only (Syringe Pump ×94, Infusion Pump ×42, etc.):
   a SMALL, item-scoped quantity-allocation record — NOT a PO-wide
   ledger — needed only if the business decides whole-item-per-crew
   isn't fine-grained enough for these specific lines.

   Orthogonal, higher-urgency, pre-existing gaps (fix regardless
   of the above):
     • 139/406 real units have no DeviceType/DeviceCalibrationParameter
     • AKD/AKL mandatory gate has zero UI in Portal or tech-pwa
     • Expanded WorkOrder job list still unpaginated in the default view
```

---

*No schema, migration, service, UI, or seed changes were made in the course of this audit. No mock workflows, fake data, bulk approvals, or bypassed gates were created.*
