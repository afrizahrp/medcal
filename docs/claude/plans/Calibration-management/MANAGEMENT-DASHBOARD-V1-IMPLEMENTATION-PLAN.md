# Management Dashboard V1 — Implementation Plan (Final Revision)

**Status:** Planning only. No code, schema, migration, or test was created or modified while producing this document.
**Revision note:** This document replaces the prior draft of the same name in full. The prior draft's `[OPEN DECISION]` items have been closed by explicit business decisions (§2) plus additional repository verification performed for this revision (cited inline). Where a prior open item is now resolved, this document states the resolution directly — it does not re-litigate it.
**Tagging convention (unchanged):** `[FACT]` verified from repository/domain implementation · `[CONFIRMED DECISION]` given verbatim by the product owner · `[INFERENCE]` reasonable interpretation, not itself a business decision · `[OPEN DECISION]` still requires a decision. `[INFERENCE]` is never upgraded to `[FACT]`; `[OPEN DECISION]` is never upgraded to `[CONFIRMED DECISION]`.

---

## 1. Executive Summary

Management Dashboard V1 is now fully specifiable without asking an implementer to make a business-semantics call. The five categories of ambiguity identified in the prior draft — Volume's meaning, the "Calibrated" timestamp, the cancellation-reporting scope, the dashboard's role audience, and the financial-card implementation style — are each closed by an explicit product decision (§2), and this revision additionally resolves the "Customer PO" metric's exact timestamp and the precise, double-counting-safe query strategy for Volume through direct repository verification (§5, §6, §7), rather than leaving them for Cursor to infer.

The dashboard's V1 metric set is: three current-state operational counts, two commercial/physical-unit counts (**Customer PO** and **Volume** — deliberately kept distinct, §5/§6/§9), one execution-quality count (**Calibrated**), and a row of financial cards that are honestly `0`/unavailable rather than fabricated. Cancellation reporting is explicitly deferred to a future phase (§17) and is not part of V1.

**Gate: READY.** See §18 for the full reasoning; no genuinely blocking unresolved decision remains.

---

## 2. Confirmed Business Decisions

Restated for a single point of reference; each is `[CONFIRMED DECISION]` and is not reopened anywhere below.

| # | Decision | Summary |
|---|---|---|
| A | **Volume** | `1 Volume = 1 unique physical device / 1 physical calibration unit`. A count, never currency, never a PO count, never a quotation-line count. No double-counting the same physical unit across Request→Quotation→PO→WorkOrder→CalibrationJob. |
| B | **Physical unit / CalibrationJob semantics** | `1 CalibrationJob = 1 physical calibration unit` remains the verified system fact; fan-out creates N `CalibrationJob` rows from `qty = N`; device identity may be `NULL` initially and resolves later via Identity Correction. This does not change Volume's definition. |
| C | **Calibrated** | `CalibrationJob.status = "ACCEPTED_BY_QA"`. Period timestamp = `QualityReview.reviewedAt` (the exact selection rule is resolved in §7, not reopened as "acceptedAt vs. updatedAt"). |
| D | **Timezone** | `Asia/Jakarta`, locked, for all period/trend bucketing. |
| E | **Cancellation** | Out of V1 entirely — no cancelled-WorkOrder card, trend, reason breakdown, or timestamp work. Deferred to a future phase (§17). |
| F | **Role / audience** | Business term "GM" = the existing `SUPERVISOR` role. No new `DIRECTOR` role is created. The dashboard audience is served through the existing, unmodified permission model (§13). |
| G | **Financial cards** | Visible in V1, value `0`. Must not fabricate revenue, must not derive "Revenue" from PO/Quotation totals, and must **not** build aggregation logic against the currently-unused billing tables merely to manufacture a zero (§9 — this reverses the prior draft's "query the real empty tables" recommendation). |
| H | **Customer PO** | `Customer PO = COUNT(PurchaseOrder)` **restricted to valid/approved POs** (`status = "APPROVED"` — excludes `DRAFT` and `CANCELLED`), per the explicit follow-up clarification "17 valid/approved PO → Customer PO = 17." Not a count of customers-with-a-PO, not PO items, not summed quantities, not quotation lines, and not every PO row regardless of status. |
| I | **Volume vs. PO — explicit distinction** | `Customer PO` (commercial document count) and `Volume` (physical unit count) are two separate metrics, reported side by side, never merged. A customer may have 17 POs and 409 Volume simultaneously; the dashboard must not assume one PO per customer. |
| J | **Reference stress case** | Large Hospital: 56 device line items, 409 total physical devices (Volume), 17 **valid/approved** Purchase Orders (Customer PO). Illustrative distribution across POs is not load-bearing; the semantics `Customer PO = 17`, `Volume = 409` are what must hold. |

---

## 3. Current Architecture Baseline

Carried forward and re-confirmed from the prior audit/plan; not re-derived here.

- Chain: `Customer → CalibrationRequest → Quotation (1:1) → PurchaseOrder (service-enforced ≤1 active per Quotation) → WorkOrder (DB-enforced ≤1 active per PO) → WorkOrderItem (1:1 PO-item snapshot) → CalibrationJob (fan-out, 1 row = 1 physical unit)`.
- `[FACT]` A `Customer` may have many independent Request/Quotation/PO chains; the dashboard must aggregate across all of them, never assume one chain = one customer's total business.
- `[FACT]` `WorkOrder.customerId` and `PurchaseOrder.customerId` are direct FKs to `Customer` — a `CalibrationJob`'s customer is reachable in one hop via `WorkOrder.customerId`, not a four-level join.
- `[FACT]` Neither `WorkOrder.customerId` nor `PurchaseOrder.customerId` is indexed today (checked against every `@@index` line on both models) — addressed in §12.
- `[FACT]` `CalibrationJobStatus` has no `CANCELLED` value; cancelling a `WorkOrder` never touches its child `CalibrationJob` rows. Not relevant to any V1 metric per Decision E, but retained here as baseline context in case a future phase revisits it.
- `[FACT]` The financial layer (`Invoice`, `Payment`, `CreditNote`, `Certificate.billingStatus`/`status`) has zero application code writing to it anywhere in the repository — re-confirmed this session by grep across `apps/` and `packages/*/src`.
- `[FACT]` `CalibrationJob` has no revision/history mechanism (unlike the four commercial documents) — its status and timestamp fields are never overwritten by a `revise()`-style method, because none exists for it. Live-table queries against `CalibrationJob` are safe from the "amount silently overwritten by revision" risk that applies specifically to `Quotation`/`PurchaseOrder` commercial totals (not relevant to any locked V1 metric, since no V1 metric sums a revisable amount field, but noted for completeness).

---

## 4. Final Metric Catalog

Every required metric from the locked decisions, fully specified. No metric is named "Volume" loosely — it is precisely defined in §5. No metric conflates Customer PO and Volume.

| Metric | Business definition | Source model | Source field(s) | Status filter | Timestamp (period) | Grain | Aggregation | Anti-double-count rule | Reliability | Known limitation |
|---|---|---|---|---|---|---|---|---|---|---|
| Active Work Orders | Work orders not yet finished or cancelled, right now | `WorkOrder` | `status` | `IN (PLANNED, ASSIGNED, IN_PROGRESS)` | n/a — current-state | 1 row = 1 WO | `COUNT(*)` | n/a, WO is already the correct grain | RELIABLE `[FACT]` | none |
| Jobs Awaiting Action | Unfinished physical units, right now | `CalibrationJob` | `status` | `IN (PENDING, IN_PROGRESS, SUBMITTED, REWORK)` | n/a — current-state | 1 row = 1 job | `COUNT(*)` | n/a, job is already the correct grain | RELIABLE `[FACT]` | Per Decision E, no cancellation-based exclusion is applied in V1 (that join is deferred with cancellation reporting, §17) — this count may include jobs under a since-cancelled WorkOrder; documented, not silently hidden |
| Quotations Pending Approval | Sales quotations not yet approved/rejected/cancelled | `Quotation` | `status` | `IN (DRAFT, SENT)` | n/a — current-state | 1 row = 1 quotation | `COUNT(*)` | n/a | RELIABLE `[FACT]` | none |
| **Customer PO** | Number of valid/approved Purchase Order documents | `PurchaseOrder` | `id`, `status`, `confirmedAt`, `customerId` | `status = "APPROVED"` (excludes `DRAFT`, `CANCELLED`) — per confirmed clarification | `confirmedAt` — see §6 | 1 row = 1 PO | `COUNT(*)`, optionally `GROUP BY customerId` | Each `PurchaseOrder` row is already a single, non-repeating document — no fan-out risk at this grain | RELIABLE `[FACT + CONFIRMED DECISION]` — see §6 | A PO still `DRAFT` or `CANCELLED` is not counted; if `RECEIVED`/`CONFIRMED`/`FULFILLED` ever become reachable statuses in a future phase, revisit this filter (§6.5) |
| **Volume (current-state)** | Physical calibration units currently represented in the system | `CalibrationJob` | `id`, `workOrderId` | none (any status) | n/a — current-state | 1 row = 1 physical unit | `COUNT(*)` | Each `CalibrationJob` row is the unique, non-repeating physical-unit record — never sum `qty` from `CalibrationRequestItem`/`QuotationItem`/`PurchaseOrderItem`/`WorkOrderItem`, which are repeated snapshots of the same units | RELIABLE `[FACT]` | Units still upstream of `WorkOrder.start()` (ordered but not yet fanned out) are not counted — see §5.6 |
| **Volume (period)** | Physical calibration units newly represented (fanned out) in the selected period | `CalibrationJob` | `createdAt` | none | `createdAt` — see §5.5 | 1 row = 1 physical unit | `COUNT(*) GROUP BY bucket` | Same as above | RELIABLE `[FACT]` | Same limitation as above, scoped to the period |
| **Calibrated** | Physical units that reached QA acceptance in the selected period | `CalibrationJob` joined to `QualityReview` | `CalibrationJob.status`; `QualityReview.status`, `.decision`, `.reviewedAt` | `CalibrationJob.status = "ACCEPTED_BY_QA"` | `QualityReview.reviewedAt` of the row with `status="APPROVED"` for that job — see §7 | 1 row = 1 physical unit | `COUNT(*) GROUP BY bucket` | At most one `QualityReview.status="APPROVED"` row can ever exist per job (DB-enforced by application logic, §7) — no fan-out/duplication risk | RELIABLE `[FACT]` | none identified |
| Revenue (financial) | Recognized/collected revenue | n/a — not implemented | n/a | n/a | n/a | n/a | Static `0` / "Not Available" | n/a | NOT CURRENTLY DERIVABLE `[FACT]` | Billing backend does not exist (§3, §9) |
| Outstanding / Other financial cards | Billing-derived figures | n/a — not implemented | n/a | n/a | n/a | n/a | Static `0` / "Not Available" | n/a | NOT CURRENTLY DERIVABLE `[FACT]` | Same |

---

## 5. Volume Semantics & Calculation Strategy

Direct, explicit answers to every question the locked decision (§2.A, §2.B) and the calculation-strategy requirement raise.

### 5.1 What record represents one physical unit?

`[FACT]` `CalibrationJob`. Confirmed unique per `[workOrderId, purchaseOrderItemId, unitOrdinal]` and per `[workOrderId, deviceId]` once identity resolves. No other model in the schema has this property — every model upstream of it (`CalibrationRequestItem`, `QuotationItem`, `PurchaseOrderItem`, `WorkOrderItem`) stores an aggregate `qty`, not one row per unit.

### 5.2 At what lifecycle stage does it exist?

`[FACT]` Only from `WorkOrder.start()` (`ASSIGNED → IN_PROGRESS`) onward. `WorkOrdersService.fanOutCalibrationJobs()` (`work-orders.service.ts:599-648`) is the sole creator, runs exactly once per WorkOrder (idempotency-guarded), and is the only place in the entire codebase where a `CalibrationJob` row is created.

### 5.3 How does qty fan out?

`[FACT]` `WorkOrderItem.qty` (a `Decimal`) is coerced to a strict positive integer `N` (throwing, not rounding, on a fractional value) and exactly `N` `CalibrationJob` rows are bulk-created (`unitOrdinal` 1..N, frozen `unitTotal = N`).

### 5.4 What happens before `WorkOrder.start()`?

`[FACT]` No `CalibrationJob` rows exist yet. The only representation of "how many units were ordered" is the aggregate `qty` field, repeated (as a 1:1 snapshot) across `CalibrationRequestItem → QuotationItem → PurchaseOrderItem → WorkOrderItem` — the **same** underlying commercial quantity, copied forward at each stage, not four independent quantities. Summing `qty` across these four tables would multiply the same ordered units by up to 4×; the locked Volume definition (§2.A) explicitly forbids this.

### 5.5 What happens after `WorkOrder.start()`?

`[FACT]` Exactly `N` `CalibrationJob` rows exist, one per physical unit, each independently trackable by `status`, and each carrying its own `createdAt` (set at fan-out — all siblings from one fan-out batch share the same `createMany` transaction, so their `createdAt` values are effectively identical to the fan-out moment). This `createdAt` is the correct, and only necessary, timestamp for period-bucketing Volume (§4) — no revision mechanism ever touches it (§3), so it is stable for trend reporting without further verification needed.

### 5.6 How do we calculate Volume for the current-state dashboard?

`[CONFIRMED, per Decision A + repository verification]`
```
Volume (current) = COUNT(CalibrationJob)   -- no status filter, no date filter
```
This counts every physical unit that has ever been fanned out, regardless of where it currently sits in its own execution lifecycle (`PENDING` through `ACCEPTED_BY_QA`). A unit that is merely "ordered" (qty on an upstream document, WorkOrder not yet started) is **not** counted — see §5.9 for why this is the correct, documented behavior, not a bug.

### 5.7 How do we calculate Volume for a selected period?

```
Volume (period) = COUNT(CalibrationJob) WHERE createdAt IN [period start, period end)  -- Asia/Jakarta boundaries, §8
```
This answers "how many new physical units entered the system (were fanned out) in this period" — a period-based *intake* metric, analogous to "Requisitions Received" but at the physical-unit grain instead of the commercial-line grain.

### 5.8 How do we avoid counting the same unit multiple times across lifecycle documents?

`[FACT, restated for clarity]` By **never** summing `qty` from any of `CalibrationRequestItem`, `QuotationItem`, `PurchaseOrderItem`, or `WorkOrderItem` for the Volume metric. Those four fields are the same underlying commercial quantity, snapshotted forward at each document stage — summing across them is the exact double-counting failure mode the locked decision (§2.A) forbids. Volume is computed **exclusively** from `CalibrationJob` row counts, which is the one point in the lifecycle where "1 row = 1 physical unit" is actually true and never repeated elsewhere.

### 5.9 How does Volume behave for a customer with 10+ PO?

`[FACT]` `CalibrationJob` has no direct `customerId` column, but `WorkOrder.customerId` does, and every `CalibrationJob.workOrderId` resolves to exactly one `WorkOrder`. Therefore:
```
Volume (customer-scoped) = COUNT(CalibrationJob) WHERE workOrder.customerId = X
```
This is a single join, correctly sums across **every** WorkOrder the customer has, regardless of how many separate PurchaseOrder/Quotation/Request chains produced them — directly satisfying the stress case (§2.J): a customer with 17 POs feeding into (potentially) 17 different WorkOrders still reports `Volume = 409` correctly, because each of the 409 `CalibrationJob` rows is counted exactly once, independent of which PO/WorkOrder chain it came from.

### 5.10 What happens to units that have not yet reached CalibrationJob creation? (the semantic gap)

`[FACT, explicitly identified per the task's instruction not to silently invent data]` There **is** a real semantic gap between "ordered volume" (the qty a customer's PO/Quotation commits to, before any WorkOrder has started) and "Volume" as locked in §2.A (which is `CalibrationJob`-grain only). Concretely: a customer with an `APPROVED` PurchaseOrder for 50 units, whose WorkOrder is still `PLANNED` (not yet started), contributes **`0`** to that customer's current Volume today — even though the business has legitimately committed to calibrating 50 units for them.

**Proposed smallest correct V1 rule (`[INFERENCE]`, not a business decision this plan makes on its own):** V1 reports Volume exactly as `COUNT(CalibrationJob)`, full stop, and this gap is **documented in the UI** as a small explanatory note on the Volume card (e.g., "Reflects physical units created after Work Order start; does not include units on Work Orders not yet started") rather than silently absorbed or hidden. This keeps Volume's definition unambiguous and matches the locked business example exactly (`BSM #1/#2/#3` only exist as countable units once fan-out has happened — the locked example itself is phrased in terms of fanned-out units, not ordered qty). If the business later wants a separate "Ordered, Not Yet Fanned Out" metric to close this gap, that is a new, additional metric for a future phase, not a redefinition of Volume — explicitly out of this plan's scope unless requested.

---

## 6. Customer PO Semantics & Timestamp

### 6.1 The metric, restated precisely (revised per confirmed clarification "17 valid/approved PO → Customer PO = 17")

`[CONFIRMED DECISION, Decision H as clarified]`
```
Customer PO = COUNT(PurchaseOrder WHERE status = "APPROVED")
```
This supersedes this plan's earlier reading of Decision H as an unconditional count. The clarification is explicit that the reference stress case's "17 POs" means 17 **valid/approved** POs, not 17 rows regardless of status — so `DRAFT` (not yet approved) and `CANCELLED` (voided) rows are excluded. No PO-item counting, no qty summation, no join through `WorkOrder` (`PurchaseOrder` carries `customerId` directly).

`[FACT]` `PurchaseOrderStatus` has six declared enum values (`DRAFT, APPROVED, RECEIVED, CONFIRMED, FULFILLED, CANCELLED`), but only `DRAFT`, `APPROVED`, and `CANCELLED` are reachable in the current codebase — `RECEIVED`/`CONFIRMED`/`FULFILLED` have zero write sites anywhere in `apps/api/src` (confirmed in the prior architecture audit and not contradicted by anything found for this plan). **Today**, `status = "APPROVED"` and `status NOT IN ("DRAFT", "CANCELLED")` are exactly equivalent filters, since no third possibility currently occurs. This plan uses the literal `status = "APPROVED"` filter (simpler, and exactly matching "approved" in the clarification's own wording) — see §6.5 for what happens if that changes.

### 6.2 Repository verification of candidate timestamps

`[FACT]` Three timestamp-shaped fields exist on `PurchaseOrder`:

| Field | What it represents | Set by | Always present for an APPROVED row? |
|---|---|---|---|
| `createdAt` | When the PO record was created in MedCal (typically as `DRAFT`) | Prisma default, on every `create()` | Yes, but represents the *draft-creation* moment, not the approval event |
| `confirmedAt` | When staff transitioned the PO `DRAFT → APPROVED` (`PurchaseOrdersService.approve()`, `purchase-orders.service.ts:377-401`, which sets `confirmedAt: new Date()` and `status: "APPROVED"` in the same write) | `approve()` only | **Yes — by construction, every row with `status = "APPROVED"` has a non-null `confirmedAt`, since both fields are written together in one operation** |
| `customerPoDate` | The date written on the customer's own external PO document (a required input field, editable via `update()`/`revise()`) | Staff data entry, not a system event | Yes, but externally-supplied and editable after the fact |

### 6.3 Selected timestamp and reasoning (revised)

`[FACT]` Now that Customer PO is filtered to `status = "APPROVED"` (§6.1), the objection that previously ruled out `confirmedAt` — "it's `NULL` for DRAFT rows" — no longer applies, because DRAFT rows are excluded from the count entirely. Within the counted set, `confirmedAt` is **always present** (set atomically with `status = "APPROVED"` by `approve()`) and represents the exact, correct business event for this metric: **the moment the PO became valid/approved**, not merely the moment its draft record was first typed into the system.

**Revised selection: `confirmedAt` is the correct timestamp**, superseding the prior draft's choice of `createdAt`. `[FACT]` `confirmedAt` is never rewritten by `revise()` (confirmed in the prior audit: `revise()`'s final update touches only commercial totals — `subtotal`/`headerDiscountAmount`/`taxCode`/`taxRate`/`taxAmount`/`totalAmount` — never `confirmedAt`/`status`), so it is stable for trend reporting exactly like `approvedAt` on `Quotation`.

`customerPoDate` remains rejected as the primary timestamp, for the same reason as before: it is an editable, externally-sourced field (mutable via `update()`/`revise()` input, `purchase-orders.service.ts:360`), so bucketing by it would let a later correction silently move a PO into a different historical period after the fact — a weaker trend-stability guarantee than `confirmedAt`.

**Not left as an `[OPEN DECISION]`** — directly resolved by the confirmed status filter plus the `approve()` code's own atomic write of `status`+`confirmedAt` together.

### 6.4 Customer-scoped Customer PO

`[FACT]` `PurchaseOrder.customerId` is a direct FK — no join needed:
```
Customer PO (customer-scoped) = COUNT(PurchaseOrder) WHERE customerId = X AND status = "APPROVED"
```

### 6.5 Forward-compatibility note

`[INFERENCE]` If a future phase ever makes `RECEIVED`, `CONFIRMED`, or `FULFILLED` reachable (all three are currently dead states, §6.1), this metric's filter should be revisited — a PO that has progressed to `RECEIVED`/`CONFIRMED`/`FULFILLED` is presumably still "valid/approved" in the business sense and arguably should still count, which `status = "APPROVED"` alone would then miss. This is flagged here so the filter isn't silently stale later; it is **not** a reason to broaden the filter today, since those states cannot currently occur.

---

## 7. Calibrated Semantics & Timestamp

### 7.1 The status condition

`[CONFIRMED DECISION, Decision C]` `CalibrationJob.status = "ACCEPTED_BY_QA"`. `[FACT]` This is a confirmed terminal state (`complete()` is the only writer, and no code path reverses it).

### 7.2 The exact, unambiguous `QualityReview.reviewedAt` selection rule

`[FACT — verified directly this session, resolving the prior draft's ambiguity]` `CalibrationJobsService.decideQualityReview()` (`calibration-jobs.service.ts:1222-1303`) begins with:
```ts
const alreadyApproved = await prisma.qualityReview.findFirst({
  where: { companyId, calibrationJobId: id, status: "APPROVED" },
});
if (alreadyApproved) throw new ConflictException({ code: "QUALITY_REVIEW_ALREADY_APPROVED", ... });
```
This guard means **at most one `QualityReview` row with `status = "APPROVED"` can ever exist for a given `CalibrationJob`, for the lifetime of that job.** Every `REJECT` decision creates its own new row with `status: "REJECTED"` (line 1273-1283); every `APPROVE` decision creates its own new row with `status: "APPROVED"`, `decision: "APPROVE"`, `reviewedAt: new Date()` (line 1290-1300) — and the guard above prevents a second `APPROVE` from ever being recorded. `CalibrationJobsService.complete()` (the method that actually flips the job to `ACCEPTED_BY_QA`) independently re-derives and requires this same row to exist and be approved (`calibration-jobs.service.ts:1355-1365`).

**Therefore the query rule is exact and requires no "latest by createdAt" heuristic:**
```
Calibrated timestamp for job J = QualityReview.findFirst({
  where: { calibrationJobId: J.id, status: "APPROVED" }
}).reviewedAt
```
For any job with `status = "ACCEPTED_BY_QA"`, exactly one row matches this query, by construction of the application code itself — not by a query-side assumption. This closes the prior draft's open item definitively; no new timestamp column is needed (per the instruction not to invent one unless proven necessary — it is proven unnecessary here).

### 7.3 Batched query shape for the dashboard

For a set of `ACCEPTED_BY_QA` job IDs in a period:
```
QualityReview.findMany({ where: { calibrationJobId: { in: jobIds }, status: "APPROVED" } })
```
— one batched query, not N+1, matching the existing `referenceEquipmentReviewFlags`-style batching idiom already used elsewhere in this module.

---

## 8. Period & Trend Semantics

- **Timezone:** `[CONFIRMED DECISION]` `Asia/Jakarta` (UTC+7, no DST). All period boundaries below are computed in this timezone before being translated to the UTC range Postgres/Prisma needs for the `WHERE` clause.
- **Period selector:** Today / This Week / This Month / This Quarter / This Year, plus a custom range — unchanged from the prior draft, no decision required this to change.
- **Current period:** `[start of bucket in Asia/Jakarta, now)`.
- **Previous comparable period:** the immediately preceding calendar-aligned bucket of the same length (e.g., "This Month" vs. the prior calendar month) — `[INFERENCE]`, a presentation choice with no correctness impact; not escalated as a blocker.
- **Bucket strategy:** daily buckets for Month view, weekly for Quarter, monthly for Year — `[INFERENCE]`, adjustable without backend redesign since bucketing is computed from a single narrow-selected timestamp column per metric.
- **Empty period behavior:** render `0`/empty chart with an explicit "No data in this period" state, never a blank or error-looking gap.
- **Per-metric timestamp summary (no universal `createdAt` shortcut, per Decision D's spirit and the explicit instruction):**

| Metric | Timestamp used | Why |
|---|---|---|
| Customer PO | `PurchaseOrder.createdAt` | §6.3 — the only field non-null for every counted row |
| Volume | `CalibrationJob.createdAt` | §5.5/5.7 — set once at fan-out, never revised |
| Calibrated | `QualityReview.reviewedAt` (of the one `APPROVED` row) | §7.2 — the exact, code-enforced QA-approval event |
| Requisitions Received (if retained from the prior catalog) | `CalibrationRequest.createdAt` | Immutable, never touched by `revise()` |
| Quotations Approved (if retained) | `Quotation.approvedAt` | Confirmed never overwritten by `revise()` (prior audit) |

The three current-state metrics (Active WO, Jobs Awaiting Action, Quotations Pending Approval) are not period-bucketed at all — they are always "right now," independent of the period selector, per §5 of the prior draft's information architecture (unchanged).

---

## 9. Financial Cards

`[CONFIRMED DECISION, Decision G — reverses the prior draft's recommendation]` Cards are visible, value `0`, and the implementation must **not** build aggregation logic (real `SUM`/`COUNT` queries) against `Invoice`/`Payment`/`CreditNote`/`Certificate.billingStatus` merely to produce a zero that a literal constant would produce identically today.

**Revised design:**
- Each financial card renders a static, explicitly-labeled value: `0` (or "Not Available," per card), sourced from a small, named constant/config on the backend (e.g., a `FINANCIAL_CARDS_V1` list of `{ label, value: 0, unavailableReason }`), not a live database query.
- **Documented extension point:** the dashboard response schema (`packages/shared/src/schemas/index.ts`) still declares a `financial: { revenue: number, outstandingInvoiceValue: number, ... }` shape now, so the frontend contract does not change when billing ships — only the backend swaps the static `0` for a real `SUM`/`COUNT` query against the (by-then-populated) billing tables. This satisfies "leave a clean extension point" without querying tables that have no writers today.
- Cards in scope for V1 (`[INFERENCE]`, minimal set matching the prior draft's proposal, kept unless the product owner wants fewer): Revenue, Outstanding Invoice Value. (Certificates Billed/Credit Notes Issued from the prior draft are optional extras — not required by Decision G's "at least Revenue / relevant financial card(s)" wording, and may be trimmed to just one card if the team prefers an even smaller V1 surface; not a blocking choice either way.)
- **Hard rule, unchanged:** no financial card is ever populated from `PurchaseOrder.totalAmount` or `Quotation.totalAmount`, under any label.

---

## 10. API & Service Design

Unchanged in shape from the prior draft, updated for the final metric set.

- **New module:** `apps/api/src/modules/dashboard/` — `dashboard.service.ts`, `dashboard.controller.ts`, `dashboard.module.ts`, `dashboard.service.test.ts`. `[FACT]` No such module exists today; no `/dashboard`/`/stats`/`/summary` route exists anywhere in `apps/api/src/modules`.
- **Endpoint:** `GET /dashboard/management-summary?period=<preset>&from=&to=&customerId=` — one summary response containing:
  - `currentState: { activeWorkOrders, jobsAwaitingAction, quotationsPendingApproval }`
  - `period: { range, customerPO: { total, trend[] }, volume: { total, trend[] }, calibrated: { total, trend[] } }`
  - `financial: { revenue: 0, outstandingInvoiceValue: 0 }` (static, per §9)
- **DTO/schemas:** `dashboardQuerySchema`, `dashboardSummaryResponseSchema` in `packages/shared/src/schemas/index.ts`, matching the existing shared-schema convention.
- **Service responsibilities:** all aggregation logic lives in `dashboard.service.ts`; the controller only validates the query and enforces authorization.
- **Authorization:** guard the controller action with the existing, unmodified `hasPermission(role, "managementDashboard", "read")` check (§13). No new permission, no new role.
- **Validation/errors:** invalid `period`/date range → `400` via the existing `BadRequestException({code, message})` convention.

---

## 11. Query/Aggregation Strategy

- **Current-state metrics:** independent parallel `count()` calls via `Promise.all` (existing idiom, `devices.service.ts:200-207`).
- **Customer PO / Volume / Calibrated (period):** narrow `findMany({ select: { <timestamp> } })` over the period range, bucketed in application code — trivial at the data volumes in play (hundreds to low thousands of rows even at the 409-unit stress scale), or a `groupBy`/raw `date_trunc` query if the team prefers DB-side bucketing; either is acceptable, not mandated.
- **Calibrated specifically:** two-step — (1) `CalibrationJob.findMany({ where: { status: "ACCEPTED_BY_QA", ...companyId/customer filter }, select: { id: true } })`, (2) batched `QualityReview.findMany({ where: { calibrationJobId: { in: jobIds }, status: "APPROVED" }, select: { calibrationJobId: true, reviewedAt: true } })`, then bucket by `reviewedAt` in application code, filtering to the requested period after the join (since the period filter conceptually applies to `reviewedAt`, not to `CalibrationJob.status`, the two-step shape above may need adjusting to filter `QualityReview.reviewedAt` directly in step 2's `where` and derive the job-id set from that, rather than pre-filtering step 1 by an unrelated timestamp — left as an implementation detail, not a business-semantics decision, since the two are logically equivalent once composed correctly).
- **Volume/Customer PO by customer:** the single-hop joins from §5.9/§6.4 — no N+1, no 4-level join.
- **Do not reuse `calibrationJobInclude`** (9-relation, 4-level-deep include) for any dashboard query — every dashboard read uses a narrow `select`.
- **`groupBy`/`_count` idiom** already exists elsewhere in the codebase (`contact-messages.service.ts`, `chat-sessions.service.ts`) and should be copied for any DB-side bucketing chosen over in-application bucketing.

---

## 12. Index Requirements

Minimal, justified, no speculative indexing.

| # | Model | Fields | Serves | Mandatory? |
|---|---|---|---|---|
| 1 | `WorkOrder` | `[customerId]` | Volume-by-customer (`CalibrationJob → WorkOrder.customerId`), §5.9 | **Mandatory** — `[FACT]` does not exist today |
| 2 | `PurchaseOrder` | `[customerId]` | Customer-PO-by-customer, §6.4 | **Mandatory** — `[FACT]` does not exist today |
| 3 | `PurchaseOrder` | `[companyId, status, confirmedAt]` | Customer PO status filter + period bucketing, §6 | **Mandatory** — `[FACT]` no such composite index exists on `PurchaseOrder` today (existing indexes are `[companyId,status]` alone, `[companyId,taxCode]`, `[quotationId]`); this supersedes the earlier `[companyId, createdAt]` proposal now that the metric's confirmed timestamp is `confirmedAt`, not `createdAt` (§6.3) |
| 4 | `CalibrationJob` | `[companyId, createdAt]` | Volume period bucketing, §5.7 | **Mandatory** — `[FACT]` no timestamp index exists on `CalibrationJob` today (only `[companyId,status]` and a few FK indexes) |

No index is proposed for `QualityReview.reviewedAt` — the existing `[calibrationJobId]` and `[companyId, status]` indexes already cover the batched lookup pattern in §11 (a bounded `IN (...)` list of job IDs plus a `status="APPROVED"` filter), and the row volume per job is tiny (at most a handful of review attempts), so an additional index is not justified for V1.

---

## 13. RBAC Access Scope

`[CONFIRMED DECISION, Decision F]` "GM" = the existing `SUPERVISOR` role; no `DIRECTOR` role is created; use the existing permission model as-is.

`[FACT, re-confirmed]` `managementDashboard:read` is already seeded to `SUPERVISOR`, `GENERAL_MANAGER`, `ADMIN`, `SUPERADMIN` (hardcoded bypass), plus `TECHNICIAN`, `TECHNICIAN_MANAGER`, `FINANCE`, `CUSTOMER_SERVICE` (broader than the dashboard's originally-stated audience, but per Decision F and the explicit "do not redesign RBAC" instruction — repeated again in Decision 17 of the source brief — **this plan makes no RBAC change of any kind.** The existing grant set, exactly as it stands today, already covers every role that should see the dashboard (`SUPERVISOR`/`GENERAL_MANAGER`/`ADMIN`/`SUPERADMIN`), and the additionally-broader grants are left untouched, per instruction, rather than narrowed.

**Implementation instruction:** gate `GET /dashboard/management-summary` and its portal page with the unmodified `hasPermission(role, "managementDashboard", "read")` check. No `RolePermission` seed row is added, removed, or changed by this plan.

---

## 14. Frontend Requirements

- **Location:** `apps/portal/src/app/management/page.tsx` — replaces the current welcome-screen content, since it already occupies the seeded Menu leaf `code: "dashboard", href: "/"` (avoids a Menu-registry change). `[INFERENCE]`, unchanged from the prior draft; not reopened as a decision.
- **Layout (revised for the final metric set):**
  1. Header + global Period Selector (drives every period metric; ignored by current-state cards).
  2. Row 1 — Current-state: Active Work Orders, Jobs Awaiting Action, Quotations Pending Approval.
  3. Row 2 — Commercial/Physical: **Customer PO** and **Volume**, shown side by side with a one-line caption making the distinction explicit (per Decision I) — e.g., "Customer PO: number of purchase order documents. Volume: number of physical units." — so the two numbers are never visually conflated.
  4. Row 3 — Execution quality: **Calibrated**, with its period trend chart.
  5. Row 4 — Financial cards: `0`/"Not Available," each with a small explanatory hint (§9).
  6. Optional customer drill-down table (`[INFERENCE]`, may defer to a later iteration without affecting V1's core delivery) — same query shapes as §5.9/§6.4, filterable by `customerId`.
- **No cancellation UI of any kind** — Decision E.
- Loading/empty/error states unchanged in spirit from the prior draft: per-section skeletons, explicit "no data" messaging, no fabricated placeholder numbers.

---

## 15. Test Strategy

Per the locked requirement list (source brief §16), mapped to this plan's concrete metrics:

- Metric correctness: each of Active WO / Jobs Awaiting Action / Quotations Pending Approval / Customer PO / Volume / Calibrated against its exact filter+timestamp as specified in §4-§7.
- Boundary dates: period start/end at `Asia/Jakarta` midnight, including a case that straddles a UTC-day boundary (e.g., 23:30 UTC / 06:30 Jakarta next day) to prove the timezone conversion is applied, not assumed.
- QA Accepted: a job with multiple `QualityReview` rows (one or more `REJECTED`, exactly one final `APPROVED`) is bucketed by the `APPROVED` row's `reviewedAt`, never by an earlier `REJECTED` row's timestamp or by `CalibrationJob.updatedAt`.
- Volume: a `WorkOrderItem` with `qty=3` produces `Volume += 3` only after `WorkOrder.start()`, and `Volume += 0` while still `PLANNED`/`ASSIGNED` (proving §5.10's documented gap is real and intentional, not accidentally "fixed" by a future refactor without updating this plan).
- Customer PO: a customer with 17 **`APPROVED`** `PurchaseOrder` rows across multiple `Quotation`/`CalibrationRequest` chains reports exactly `17`; additional `DRAFT` or `CANCELLED` rows for that same customer must NOT be counted — a regression guard proving the `status = "APPROVED"` filter is applied.
- Multi-PO customer aggregation / 409-device stress case: seeded fixture matching §2.J (56 line items, 17 POs, 409 fanned-out `CalibrationJob` rows for one customer) asserts `Customer PO = 17` and `Volume = 409` simultaneously, from the same customer-scoped query call.
- Financial cards: always exactly `0`/"Not Available" regardless of fixture data (proving no accidental live query was wired in against §9's decision).
- Role/permission: `SUPERVISOR`, `GENERAL_MANAGER`, `ADMIN`, `SUPERADMIN` can reach the endpoint; a role without `managementDashboard:read` (e.g., `CUSTOMER`) is rejected — using the existing, unmodified permission catalog.

Not written as part of this plan (planning only).

---

## 16. Implementation Sequence

1. **Index migration** (`packages/db/prisma`) — the four indexes in §12, unconditionally (none are gated behind a further open decision this time). Small, isolated, reviewable in one migration.
2. **Backend aggregation service** (`apps/api/src/modules/dashboard`) — implement exactly the metric set in §4, using the exact query rules from §5-§7, §11.
3. **API contract** (`packages/shared` schemas + controller wiring), including the static-financial-card shape from §9.
4. **Frontend dashboard UI** (`apps/portal/src/app/management/page.tsx` + components), per §14.
5. **Authorization integration** — wire the existing, unmodified `managementDashboard:read` check (§13); no seed changes.
6. **Tests** (§15), written against the now-fully-confirmed metric definitions.
7. **Validation** — manual QA against the 17-PO/409-unit stress fixture, confirming §2.J's numbers render correctly and Customer PO/Volume are visually distinct on screen (§14).

No step is blocked on a further product decision — every input each step needs is already resolved in §2-§13.

---

## 17. Future Plan / Deferred Items

Explicitly out of V1, not to be implemented now, listed so they are not lost:

- **Cancellation reporting** (Decision E) — cancelled-WorkOrder count/trend, reason capture (no `WorkOrder.cancelReason` field exists today — a future task would need to add one, a schema change requiring its own separate approval), and the interaction rule for child `CalibrationJob` rows under a cancelled WorkOrder.
- **Real billing aggregation** — once an `Invoice`/`Payment`/`CreditNote` backend exists, swap the static `0` financial cards (§9) for live queries against the same response shape already declared today.
- **"Ordered, Not Yet Fanned Out" metric** — to close the §5.10 semantic gap between commercial `qty` and physical-unit Volume, if the business decides it wants visibility into pre-fan-out committed volume as a separate, explicitly-named metric (not a redefinition of Volume itself).
- **Customer drill-down UI** (§14) — may ship in V1 or slip to a fast-follow, at the team's discretion; not a blocker either way since the underlying queries are already fully specified.
- **Broadening "Customer PO" beyond `status = "APPROVED"`** — only relevant if `RECEIVED`/`CONFIRMED`/`FULFILLED` ever become reachable statuses in a future phase (§6.5); not applicable today since those states cannot currently occur.

---

## 18. Final Implementation Gate

**IMPLEMENTATION GATE: READY.**

Every item that was `[OPEN DECISION]` in the prior draft is now either:
- Directly closed by an explicit product decision (§2: Volume, Calibrated status+timestamp, timezone, cancellation scope, role/audience, financial-card style), or
- Resolved through direct repository verification performed for this revision, with the reasoning shown rather than asserted (§6.3's Customer PO timestamp choice; §7.2's exact `QualityReview.reviewedAt` selection rule, which turned out to have zero ambiguity once the `alreadyApproved` guard was read).

No genuinely blocking unresolved decision remains. The two items noted as `[INFERENCE]` in this document (previous-period comparison alignment, §8; whether to ship 1 or 2 financial cards, §9) are presentation/scope conveniences with no correctness impact and do not block starting implementation — they can be decided by the implementer within the bounds this plan already sets, or confirmed in passing during review, without stopping work.

An implementer following §4 (Metric Catalog), §5-§7 (Volume/Customer-PO/Calibrated exact query rules), §8 (period semantics), §9 (financial-card design), §12 (indexes), and §13 (RBAC — no change) has everything needed to build Management Dashboard V1 without making an independent business-semantic decision.
