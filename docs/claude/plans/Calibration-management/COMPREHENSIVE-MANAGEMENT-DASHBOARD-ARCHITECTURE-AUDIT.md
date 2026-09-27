# MedCal — Comprehensive Management Dashboard Architecture Audit

**Date:** 2026-09-27
**Type:** Pre-implementation architecture gate. No code, schema, or test changes were made during this audit.
**Method:** Full read of `packages/db/prisma/schema.prisma` (3,286 lines) plus targeted, evidence-based deep dives into `apps/api/src/modules/{calibration-requests,quotations,purchase-orders,work-orders,calibration-jobs,taxes,price-list-items}`, `packages/auth/src/access-control.ts`, `apps/portal`/`apps/tech-pwa`/`apps/customer-portal` shells, and the relevant `*.test.ts` suites. Every finding is tagged **FACT** (proven from code/schema/test), **INFERENCE** (strong reasoning, not explicit in code), or **UNKNOWN** (not determinable from the repository), with file:line evidence wherever a FACT or INFERENCE is asserted.

This document supersedes no prior report and does not reopen Phase 4 invariants (natural key, `CalibrationTestPoint`/`JobCalibrationTestPoint`, `replicateIndex`/`direction`/`referenceValue`, tolerance architecture, `logicalTestKey`/`logicalTestSequence`) or the already-implemented high-volume fixes from `calibration-management-portal-audit.md` / `calibration-management-portal-implementation-report.md`. Those are treated as accepted, completed phases per `.claude/rules/architecture.md`.

---

## 1. Executive Summary

MedCal's domain model is a deep, deliberately-designed operational chain — `Customer → CalibrationRequest → Quotation → PurchaseOrder → WorkOrder → CalibrationJob → MeasurementResult/QualityReview → Certificate` — with a genuinely sophisticated append-only revision/history mechanism (MOM #1) layered on top of the commercial documents. The calibration-execution core (fan-out, tolerance evaluation, AKD/AKL identity gate, Kontrol Alat, Identity Correction) is well-built and, on the evidence gathered, well-tested.

However, a Management Dashboard sitting on top of this chain today would face three categories of problems, in descending order of severity:

1. **The financial layer does not exist as executable code.** `Invoice`, `Payment`, `CreditNote`, and `Certificate.billingStatus` are schema-only — confirmed by independent repo-wide greps from two separate research passes returning zero application-code hits. Every certificate in the live database is permanently `billingStatus = UNBILLED` and `status = DRAFT` because nothing ever transitions either field. **No revenue, billing, or payment metric can be built from real data today.** The only usable proxies are `PurchaseOrder.totalAmount`/`Quotation.totalAmount`, and both must be labeled as pipeline/bookings figures, never "revenue."
2. **Several cardinality and lifecycle edges have no reconciliation, no DB-level guard, and no test coverage protecting them** — most importantly, cancelling a `WorkOrder` never touches its already-fanned-out `CalibrationJob` rows (there is no `CANCELLED` value in `CalibrationJobStatus` at all), so a naive "jobs in flight" or "devices calibrated" count will include orphaned jobs whose parent work order is dead, with no existing filter anywhere in the codebase to exclude them.
3. **Historical/point-in-time reporting is unsafe against the live tables for commercial amounts.** `Quotation.revise()`/`PurchaseOrder.revise()` snapshot the pre-revision state into History tables correctly, but then **overwrite the live row's `totalAmount`/`taxAmount`/`subtotal`** while leaving `status`/`approvedAt` untouched. A dashboard querying "quotations approved as of 2026-08-15, summed by value" against the live table will silently attribute a later revision's amount to the earlier approval date. No "as-of-date" reconstruction helper exists anywhere in the codebase.

On the positive side: the `managementDashboard`/`customerDashboard` permission resources are **already defined and seeded** to a sensible role set (§11), the two previously-identified high-volume performance hotspots are already fixed, a `groupBy`/`_count` aggregation idiom already exists elsewhere in the codebase (`contact-messages`, `chat-sessions`) for a dashboard to copy, and the MOM #1 revision mechanism is the most heavily-tested subsystem in the codebase. This is a **PASS WITH CONDITIONS** gate: the dashboard can be built, but its scope must explicitly exclude financial metrics, must add the missing `workOrder.status <> CANCELLED` join wherever it counts jobs/units, and must use the History tables (not the live tables) for any query that spans a past date boundary.

---

## 2. Repository / Architecture Map

MedCal is a pnpm/turborepo monorepo (`D:\medcal`).

| Area | Path | Notes |
|---|---|---|
| API (NestJS + Prisma) | `apps/api/src/modules/*` | 30 modules; no `invoices`/`payments`/`credit-notes` module exists (FACT — confirmed absent by directory listing and repo-wide grep, §6/§13) |
| Management Portal (Next.js) | `apps/portal/src/app/management/*` | Staff-facing; ~28 entity pages; no dashboard/statistics page exists today beyond a welcome screen (§11) |
| Technician PWA | `apps/tech-pwa/src/app/*` | Field execution UI, one-job-at-a-time |
| Customer Portal | `apps/customer-portal/src/app/*` | Customer-facing, certificate download etc. |
| Shared web app | `apps/web` | Marketing/website, not part of this audit's domain |
| DB / Prisma | `packages/db/prisma/schema.prisma` (3,286 lines, 89 models), `packages/db/prisma/migrations/` (89 migrations) | Single Postgres schema, no separate read-replica/warehouse |
| Auth/RBAC | `packages/auth/src/access-control.ts` | Code-defined resource/action catalog; `RolePermission` table is the DB-driven grant store |
| Shared types/schemas | `packages/shared/src/schemas/index.ts` | Zod schemas shared between API and portal |

No materialized views, no `CREATE VIEW`, no dedicated reporting/read-model layer, no data-warehouse/ETL process exists anywhere in the repository (FACT — confirmed by grep for `CREATE VIEW`/`MATERIALIZED VIEW` across `packages/db`, and by inspection of `packages/db/scripts`, which contains only a test-DB bootstrap script).

---

## 3. Domain Model & Relationship Map

Core chain (cardinalities as enforced in `schema.prisma`, cross-checked against service code):

```
Company (1) ── (N) Customer
Customer (1) ── (N) CalibrationRequest ── (0..1) Quotation [requestId @unique — 1:1]
Quotation (1) ── (N) PurchaseOrder [schema allows N, service enforces "≤1 ACTIVE" — see §6.1, unguarded at DB level]
PurchaseOrder (1) ── (N) WorkOrder [service enforces "≤1 ACTIVE" via a partial UNIQUE index — DB-guarded, unlike the PO↔Quotation edge]
WorkOrder (1) ── (N) WorkOrderItem [1:1 snapshot of one PurchaseOrderItem]
WorkOrderItem (1) ── (N) CalibrationJob [fan-out: N = coerced integer of WorkOrderItem.qty, one job per physical unit]
CalibrationJob (1) ── (N) MeasurementResult, (0..N) PhysicalCheckResult, (0..1) KontrolAlat (SEND_TO_LAB only),
                      (0..N) IdentityCorrection, (0..N) QualityReview, (0..1) Certificate
Certificate (0..N) ── InvoiceCertificate/InvoiceItem/CreditNote  [schema-only relations — no producing code, §13]
```

Key entities and their real identity:

- **CalibrationRequestItem** — one *requisition line*. `qty` is an aggregate integer ("how many physical units"), not a row-per-unit. `deviceId` is nullable (identity often unknown at intake).
- **QuotationItem / PurchaseOrderItem / WorkOrderItem** — each is a 1:1 *commercial/operational snapshot* of the item above it in the chain, copied once at creation time, not a live join.
- **CalibrationJob** — the true physical-unit grain. Fanned out from `WorkOrderItem.qty` via `unitOrdinal`/`unitTotal` at `WorkOrder.start()`. `deviceId` stays `NULL` for every unit of any line with qty > 1 until an Identity Correction resolves it (FACT — `work-orders.service.ts:623-624`).
- **"Volume" (MedCal terminology, per `docs/claude/plans/Calibration-management/TASK CREATE IMPLEMENTATION PLAN — HIGH-VOLUME CALIBRATION MANAGEMENT PORTAL.md`)** = one `CalibrationJob` row = one physical calibration unit. The audit's reference stress case ("56 devices / 409 volumes / 10+ POs") means ~56 PO line items fanning out to 409 `CalibrationJob` rows, across 10+ *separate* PurchaseOrder chains for the same customer (see §6.2 — not 10+ POs against one Quotation, which the architecture does not produce in practice).
- **Certificate** — 1:1 with `CalibrationJob`. Has a `status` (DRAFT/ISSUED/REVOKED/SUPERSEDED) and `billingStatus` (UNBILLED/BILLABLE/INVOICED) enum, both of which are schema-only today (§13).
- **Invoice/Payment/CreditNote/InvoiceItem/InvoiceCertificate** — fully modeled, zero backend (§13).

---

## 4. Transaction Lifecycle

The **actual** (code-verified, not assumed) lifecycle:

```
CalibrationRequest [DRAFT → SUBMITTED → (IN_QUOTATION, set by QuotationsService.create, not by the Requests module itself) → CANCELLED terminal]
        │  (FULFILLED is declared in the enum but UNREACHABLE — no code ever writes it, FACT)
        ▼
Quotation [DRAFT → SENT → APPROVED (also reachable directly from DRAFT, skipping SENT — FACT) / REJECTED / CANCELLED]
        │  (EXPIRED is declared but UNREACHABLE — no cron/job sets it; only a test fabricates it, FACT)
        ▼
PurchaseOrder [DRAFT → APPROVED → CANCELLED (DRAFT-only cancel)]
        │  (RECEIVED, CONFIRMED, FULFILLED are declared but UNREACHABLE — zero write sites anywhere, FACT.
        │   REVISABLE_PURCHASE_ORDER_STATUSES still lists RECEIVED/CONFIRMED as revision-eligible — dead code branch.)
        ▼
WorkOrder [PLANNED → ASSIGNED → IN_PROGRESS → DONE / CANCELLED (reachable from PLANNED, ASSIGNED, or IN_PROGRESS)]
        │  (TECHNICALLY_DONE, CLOSED are declared "legacy, API must not use" per schema comment — confirmed unreachable, intentional)
        │  fan-out happens exactly once, at ASSIGNED → IN_PROGRESS (WorkOrdersService.start(), work-orders.service.ts:516-573)
        ▼
CalibrationJob [PENDING → IN_PROGRESS → SUBMITTED → (REWORK → IN_PROGRESS, repeatable) → ACCEPTED_BY_QA (terminal)]
        │  (No CANCELLED value exists in this enum — CRITICAL, see §6.3/§9)
        ▼
Certificate [created via upload; status/billingStatus never transitioned by any code — schema-only workflow, §13]
```

Cross-reference tables — enum vs. reachable-in-code:

| Enum | Declared values | Reachable in code | Dead values |
|---|---|---|---|
| `CalibrationRequestStatus` | DRAFT, SUBMITTED, IN_QUOTATION, CANCELLED, FULFILLED | DRAFT, SUBMITTED, IN_QUOTATION, CANCELLED | **FULFILLED** |
| `QuotationStatus` | DRAFT, SENT, APPROVED, REJECTED, EXPIRED, CANCELLED | DRAFT, SENT, APPROVED, REJECTED, CANCELLED | **EXPIRED** |
| `PurchaseOrderStatus` | DRAFT, APPROVED, RECEIVED, CONFIRMED, FULFILLED, CANCELLED | DRAFT, APPROVED, CANCELLED | **RECEIVED, CONFIRMED, FULFILLED** |
| `WorkOrderStatus` | PLANNED, ASSIGNED, IN_PROGRESS, TECHNICALLY_DONE, CLOSED, CANCELLED, DONE | PLANNED, ASSIGNED, IN_PROGRESS, CANCELLED, DONE | TECHNICALLY_DONE, CLOSED (intentional legacy) |
| `CalibrationJobStatus` | PENDING, IN_PROGRESS, SUBMITTED, REWORK, ACCEPTED_BY_QA | all 5 | none — but **no CANCELLED value exists at all** |
| `CertificateStatus` | DRAFT, ISSUED, REVOKED, SUPERSEDED | DRAFT only (default, never changed) | **ISSUED, REVOKED, SUPERSEDED** |
| `CertificateBillingStatus` | UNBILLED, BILLABLE, INVOICED | UNBILLED only (default, never changed) | **BILLABLE, INVOICED** |

**Implication for any funnel/pipeline dashboard widget:** a chart built against the full `PurchaseOrderStatus` enum (DRAFT→APPROVED→RECEIVED→CONFIRMED→FULFILLED) will show three permanently-empty stages. Same for `QuotationStatus.EXPIRED` and `CalibrationRequestStatus.FULFILLED`. These are not bugs to fix as part of this audit — they are facts the dashboard's metric definitions must account for.

---

## 5. Source-of-Truth Matrix

| Business Fact | Source of Truth | Derived From | Historical? | Risk |
|---|---|---|---|---|
| Requested unit count (per line) | `CalibrationRequestItem.qty` | Customer intake / Excel import | NO — live value only, can diverge from downstream qty (§13.2) | HIGH |
| Actual physical unit count (per line, post fan-out) | `COUNT(CalibrationJob) WHERE workOrderId=... AND purchaseOrderItemId=...` | Fan-out at `WorkOrder.start()` | Partially — `unitTotal` is frozen but no job is ever deleted, so it stays consistent in practice (INFERENCE) | MEDIUM |
| Quotation/PO commercial amount **right now** | Live `Quotation.totalAmount` / `PurchaseOrder.totalAmount` | Snapshotted at create, overwritten on every `revise()` | NO — see §8 | HIGH |
| Quotation/PO commercial amount **as of a past date** | `QuotationHistory`/`PurchaseOrderHistory` row whose window covers that date | MOM #1 revision snapshots | YES, but requires a join no code currently implements | HIGH |
| Quotation/PO `status`/`approvedAt`/`confirmedAt` | Live row | Never overwritten by `revise()` (FACT — confirmed by reading `revise()`'s final `update()` payload in both services) | YES — safe to query live for the *event*, just not the *amount* | LOW |
| Tax rate applied to a specific Quotation/PO | `Quotation.taxCode`/`taxRate` or `PurchaseOrder.taxCode`/`taxRate` (frozen strings/decimals) | Snapshotted from `Tax` master at generation/revision time | YES — frozen, correctly point-in-time | LOW (if read correctly) — HIGH if a dashboard mistakenly live-joins to `Tax` |
| "Current" tax rate for a `taxCode` | `Tax.taxRate` (live FK, managed by `taxes` module) | `TaxesService` CRUD | N/A — current only | LOW |
| Device brand/model actually calibrated | `CalibrationJob.technicianObservedBrand/Model/Serial`, falling back to `Device.brand/model` | Identity Correction (BAI) approval | Frozen once written | MEDIUM (four look-alike fields exist, §13.3) |
| Customer's declared device name | `CalibrationRequestItem.customerDeviceName` / `CalibrationJob.customerDeclaredDeviceName` (frozen snapshot) | Customer intake | Frozen, may not equal reality by design | LOW if labeled correctly |
| Measurement pass/fail | `MeasurementResult.isWithinTolerance` | Computed once at write time from measured value vs. effective tolerance | Frozen; NULL is a valid, common outcome | HIGH if conflated with QA decision (§9.2) |
| QA approval outcome | `QualityReview.decision`/`status` (latest row per job) | Human MT reviewer | Append-only across REWORK cycles | MEDIUM — must filter to latest/`attemptNumber` |
| Certificate issuance | **Does not exist as a tracked fact** — `Certificate.status` never leaves `DRAFT` | N/A | N/A | **CRITICAL** |
| Billing status of a certificate | **Does not exist as a tracked fact** — `Certificate.billingStatus` never leaves `UNBILLED` | N/A | N/A | **CRITICAL** |
| Revenue / amount invoiced / amount paid | **No source of truth exists anywhere in the system** | N/A | N/A | **CRITICAL** |
| Who may view a Management Dashboard | `RolePermission` rows for resource `managementDashboard`, action `read` | Seeded in `packages/db/prisma/seed-role-permissions.ts` | N/A | LOW — already usable as-is |

---

## 6. Cardinality & Aggregation Audit

### 6.1 PurchaseOrder ↔ Quotation — the crux relationship

**FACT.** `PurchaseOrder.quotationId` is a plain, non-unique FK in the schema — nothing at the database level prevents multiple POs per Quotation. The **service layer** enforces "at most one *active* (non-CANCELLED) PO per Quotation" via a `findFirst` check inside `PurchaseOrdersService.create()`'s transaction (`purchase-orders.service.ts:192-206`), throwing `DUPLICATE_ACTIVE_PO_FOR_QUOTATION` on violation.

**HIGH severity gap:** this guard has **no backing partial-unique index** (unlike `WorkOrder.purchaseOrderId`, which *is* protected by `CREATE UNIQUE INDEX "WorkOrder_purchaseOrderId_active_key" ON "WorkOrder"("purchaseOrderId") WHERE "status" <> 'CANCELLED'`, migration `20260827210000_work_order_mvp`). Under Postgres READ COMMITTED, two concurrent `create()` calls for the same `quotationId` can both pass the check before either commits, producing two simultaneously-active POs for one Quotation. Test coverage for this guard is sequential only (`purchase-orders.service.test.ts:602-625`) — the race path is untested.

**Resolving the reference stress scenario (INFERENCE, high confidence):** because at most one active PO can exist per Quotation, and `CalibrationRequest.quotation` is 1:1, **"10+ POs for one hospital" necessarily means 10+ separate `CalibrationRequest → Quotation → PurchaseOrder` chains for that customer** (e.g. different intake batches/departments/dates), not 10+ POs fanning out of one Quotation. The Excel bulk-import path (`calibration-request-import.service.ts`) confirms one spreadsheet always becomes one `CalibrationRequest` with N line items (qty aggregated per row, never split into N rows) — so the "56 devices" (56 line items summing to 409 units) most plausibly sit on **one** `CalibrationRequest`/Quotation/PO/WorkOrder, and the "10+ POs" are a **separate concern**: a dashboard aggregating "for Customer X" must group **across** `CalibrationRequest`/Quotation boundaries — it cannot assume one Quotation captures all of a customer's volume.

A secondary orphan risk: `PurchaseOrder.cancel()` is DRAFT-only (`purchase-orders.service.ts:405-434`); cancelling a DRAFT PO never cascades to its `PurchaseOrderItem` rows, which remain `status: OPEN` under a `CANCELLED` header forever. A hand-rolled `SUM(PurchaseOrderItem.qty)` that doesn't also filter on the *parent* PO's status will silently include these.

### 6.2 WorkOrder → CalibrationJob fan-out and cancellation

**FACT.** Fan-out (`WorkOrdersService.fanOutCalibrationJobs`, `work-orders.service.ts:599-648`) is idempotent (guarded by a `count()` check), runs exactly once per WorkOrder at `ASSIGNED → IN_PROGRESS`, coerces `WorkOrderItem.qty` to a strict positive integer (throwing rather than rounding a fractional qty), and creates exactly `unitTotal` `CalibrationJob` rows via `createMany`. Device identity (`deviceId`) is only pre-populated for qty=1 lines; every unit of a qty>1 line starts with `deviceId = NULL`. A genuine concurrent double-`start()` is correctly guarded by the `@@unique([workOrderId, purchaseOrderItemId, unitOrdinal])` constraint plus a tested rollback/retry path — this edge **is** race-safe, unlike §6.1.

**CRITICAL finding, corroborated independently by three of the five research passes:** `WorkOrdersService.cancel()` (`work-orders.service.ts:1128-1148`) updates only the `WorkOrder.status` column and **never touches any `CalibrationJob` row**. `CalibrationJobStatus` has **no CANCELLED-equivalent value** (`PENDING`/`IN_PROGRESS`/`SUBMITTED`/`REWORK`/`ACCEPTED_BY_QA` only). Cancellation is reachable from `IN_PROGRESS` — i.e., *after* fan-out has already created real job rows. The existing test (`work-orders.service.test.ts:792-802`, `"allows IN_PROGRESS → CANCELLED"`) asserts only `WorkOrder.status === "CANCELLED"`; it never re-checks the fanned-out job's state, so this gap is real production behavior with a test that stops one assertion short of exposing it.

**Consequence:** any dashboard metric of the shape `COUNT(CalibrationJob) WHERE status IN (PENDING, IN_PROGRESS, REWORK)` ("jobs in flight") or `COUNT(CalibrationJob)` ("devices calibrated") will silently include jobs belonging to a cancelled WorkOrder, because **no existing query anywhere in the codebase joins to `WorkOrder.status` when counting jobs.** This must be added by hand for every dashboard aggregate that touches `CalibrationJob`.

### 6.3 The 56-device / 409-volume / 10+-PO stress scenario, concretely

| Layer | Row count for the reference scenario | Correct dashboard grain? |
|---|---|---|
| `CalibrationRequestItem` | 56 rows (one Quotation's worth) | NO — this is "lines," not "units" |
| `QuotationItem` / `PurchaseOrderItem` / `WorkOrderItem` | 56 rows each (1:1 snapshots down the chain) | NO — still "lines" |
| `CalibrationJob` | 409 rows (fanned out from the 56 lines' summed qty) | **YES — this is the "volume" grain**, provided the `workOrder.status <> CANCELLED` filter is added |
| Customer's total volume across "10+ POs" | Requires UNION across 10+ separate `CalibrationRequest`/Quotation/PO/WorkOrder chains for that `customerId` | Dashboard must group by `Customer.id`, never assume one Quotation = one customer's full volume |

### 6.4 Double-counting / undercounting audit for "total devices calibrated for Customer X this month"

| Candidate query | Verdict | Why |
|---|---|---|
| `COUNT(CalibrationJob)` joined through to Customer, filtered by month | **OVER-counts** | No filter excludes jobs whose parent `WorkOrder.status = CANCELLED` (§6.2); includes `PENDING` jobs that never proceed |
| `COUNT(DISTINCT deviceId)` on CalibrationJob | **SEVERELY UNDER-counts** | `deviceId` stays NULL for every unit of any qty>1 line until on-site identification; `COUNT(DISTINCT)` silently drops NULLs |
| `SUM(PurchaseOrderItem.qty)` | **OVER-counts** | Decimal rounding is a minor risk; the real risk is including `OPEN` items under a `CANCELLED` PO header (§6.1) unless the parent PO's status is also filtered |
| `COUNT(QuotationItem)` | **Wrong dimension** | Counts lines, not physical units — undercounts by the average qty-per-line, and MOM#1 revisions can create multiple rows for what a human calls "one line" |
| `unitTotal` (frozen on CalibrationJob) as "expected N" | **Currently safe in practice** | No code path deletes/cancels an individual job today, so `unitTotal == live sibling COUNT` holds — except the set survives (with its original `unitTotal` intact) even after the parent WorkOrder is cancelled, which is consistent but semantically meaningless |
| `COUNT(CalibrationJob) WHERE workOrder.status <> 'CANCELLED'` | **The one safe query** | But this exact filter appears in **zero** existing service code — a dashboard is the first consumer of this invariant, with no regression test protecting it |

---

## 7. Dashboard Metric Feasibility Matrix

| Metric | Can Derive? | Source | Calculation | Historical Reliable? | Risk |
|---|---|---|---|---|---|
| Requisitions received (count, by period) | RELIABLE | `CalibrationRequest.createdAt` | `COUNT(*) GROUP BY date_trunc` | Yes (createdAt is immutable) | LOW |
| Requisitions "fulfilled" | NOT CURRENTLY DERIVABLE | `CalibrationRequestStatus.FULFILLED` | N/A | N/A | Enum value unreachable in code (§4) — must derive "fulfilled" via downstream `WorkOrder.status = DONE` instead |
| Quotations sent/approved/rejected (count) | RELIABLE | `Quotation.status` | `COUNT(*) GROUP BY status` | Yes for the status/event itself | LOW |
| Quotations "expired" | NOT CURRENTLY DERIVABLE | `QuotationStatus.EXPIRED` | N/A | N/A | Unreachable in code — no expiry job exists (§4) |
| Total quotation/PO value **right now** (current pipeline) | RELIABLE WITH CONDITIONS | Live `totalAmount` | `SUM(totalAmount) WHERE status=...` | Current-state only | Must be labeled "current," not usable for trend-over-time |
| Total quotation/PO value **as of a past date** | NOT CURRENTLY DERIVABLE (data exists, no query exists) | `QuotationHistory`/`PurchaseOrderHistory` | Requires a new "pick the revision whose window covers date X, else live" helper — none exists | Data is present but no code reconstructs it | HIGH — must be built new, not queried naively against live tables (§8) |
| Physical units ("volumes") calibrated, by period, by customer | RELIABLE WITH CONDITIONS | `CalibrationJob` | `COUNT(*) WHERE createdAt BETWEEN ... AND workOrder.status <> 'CANCELLED'` | Yes, once the cancellation join is added | Must add the join manually — no existing code does this (§6.2) |
| Pass/fail rate of measurements | RELIABLE WITH CONDITIONS | `MeasurementResult.isWithinTolerance` | `COUNT(false)/COUNT(*)`, excluding NULL, filtered to `attemptNumber = job.currentAttempt` | Frozen per row, safe | Must not conflate with QA decision (§9.2); must report the NULL rate as a separate data-quality indicator |
| QA approval rate | RELIABLE | `QualityReview.decision`/`status`, latest per job | `COUNT(APPROVE)/COUNT(*)` on latest review per job | Append-only across REWORK, safe if filtered to latest | LOW |
| Certificates issued | NOT CURRENTLY DERIVABLE | `Certificate.status = ISSUED` | N/A — will always return 0 rows | N/A | `status` never transitions away from `DRAFT` anywhere in code (§13) |
| Certificates billed/unbilled | NOT CURRENTLY DERIVABLE | `Certificate.billingStatus` | N/A — will always be 100% UNBILLED | N/A | Dead field (§13) |
| Revenue | NOT CURRENTLY DERIVABLE | N/A | N/A | N/A | No Invoice/Payment backend exists at all (§13) |
| Outstanding invoices / payments collected | NOT CURRENTLY DERIVABLE | N/A | N/A | N/A | Same — schema-only |
| Committed order value / sales pipeline (relabeled, not "revenue") | RELIABLE WITH CONDITIONS | `PurchaseOrder.totalAmount WHERE status = APPROVED` | `SUM(totalAmount)` | Current-state only | Must be explicitly labeled "Approved PO Value" or "Pipeline," never "Revenue" — has no relationship to whether work was performed or billed |
| Who can view the dashboard | RELIABLE | `RolePermission` seeded grants | `hasPermission(role, "managementDashboard", "read")` | N/A | Already implemented, reusable as-is (§11) |

---

## 8. Time & Historical Semantics

**FACT, from direct reading of `QuotationsService.revise()` (`quotations.service.ts:872-1160`) and `PurchaseOrdersService.revise()` (`purchase-orders.service.ts:455-620`):**

- Both `revise()` methods snapshot the **entire current row** (including `status`, `approvedAt`/`confirmedAt`) into `QuotationHistory`/`PurchaseOrderHistory` *before* mutating.
- The **final update** at the end of each transaction touches **only commercial totals** (`taxCode`, `taxRate`, `subtotal`, `headerDiscountAmount`, `taxAmount`, `totalAmount`) — it never touches `status`, `approvedAt`, `approvedByUserId`, `confirmedAt`.

**Two-part implication:**
1. `status`/`approvedAt` on the live row **are** historically safe to query directly — `revise()` never resets them, and an APPROVED quotation cannot be un-approved by a later revision.
2. `totalAmount`/`subtotal`/`taxAmount` on the live row are **silently overwritten** by every `revise()` call, with **no corresponding change to `approvedAt`**. A query like "total value of quotations approved as of 2026-08-15" that sums live `totalAmount` filtered by `approvedAt <= '2026-08-15'` will include a later revision's (potentially much larger) amount, misattributing it to the original approval date. **The only correct approach is to join `QuotationHistory`/`PurchaseOrderHistory` and select the revision whose window covers the query date — and no such helper exists anywhere in the codebase today (UNKNOWN whether one is planned).**

Certificate/CalibrationJob historical semantics: `ACCEPTED_BY_QA` is a confirmed terminal state (no code path returns a job to `REWORK` afterward), so "jobs accepted as of date X" is safe against the live table by `createdAt`/an acceptance timestamp. Certificate has no status-history table at all — moot today only because `status` never actually changes (§13), but the underlying gap (no effective-dated snapshot for Certificate) will resurface the moment issuance/revocation is implemented.

Migration hygiene (informational, per `.claude/rules/implementation-scope.md`): one legitimate one-time backfill was found (`20260827033000_quotation_po_taxcode_taxrate`, which copied then-current `Tax` master values into existing `Quotation` rows before dropping a live FK in favor of the frozen-snapshot design — an unavoidable one-time approximation inherent to that specific schema migration, not a repeated data-integrity risk). One other migration (`20260905104207_fix_job_reference_equipment_used_fk`) is schema-only DDL, no data rewrite. No other migration names suggest historical-data rewrites.

---

## 9. Status / State Machine

### 9.1 CalibrationJobStatus (the execution core)

| Transition | Method | Precondition |
|---|---|---|
| PENDING → IN_PROGRESS | `start()` | KontrolAlat completeness gate for SEND_TO_LAB; snapshots `JobCalibrationTestPoint` |
| IN_PROGRESS → SUBMITTED | `submitForReview()` | Measurement completeness; reference-equipment resolved; no PENDING_REVIEW Identity Correction (row-locked re-check) |
| SUBMITTED → REWORK | `decideQualityReview()` (REJECT) | No already-APPROVED review; increments `currentAttempt`, clears `submittedAt` |
| REWORK → IN_PROGRESS | `resumeAfterRework()` | Does not re-increment `currentAttempt` |
| SUBMITTED → ACCEPTED_BY_QA | `complete()` | Latest QualityReview is APPROVED; commits observed identity to `Device` master in the **same transaction** as the status flip — rolls back (no ghost partial-accepted state) if that commit matches zero rows |

`ACCEPTED_BY_QA` is confirmed terminal (43 write-site grep hits, all one-directional). **No CANCELLED value exists** — see §6.2/§6.4 for the dashboard consequence.

### 9.2 Tolerance evaluation reliability

`MeasurementResult.isWithinTolerance` is computed once, deterministically, from a 4-step bound-resolution chain, and frozen (never recomputed if the master catalog later changes). NULL is a first-class, intentional outcome (TEXT readings, ambiguous tolerance notes, unresolvable bounds) — not an error, and **by explicit locked project decision, never manually overridden**. Critically, `QualityReview` **never writes back** to `isWithinTolerance` — a job can be QA-APPROVED with `isWithinTolerance = false` rows, or vice versa; these are two uncorrelated-by-code signals. A dashboard must report them separately and must filter to `attemptNumber = CalibrationJob.currentAttempt` to avoid blending old REWORK-cycle readings into a "current" pass rate.

### 9.3 AKD/AKL and Identity Correction gates

Both are per-job, orthogonal gates (not part of `CalibrationJobStatus`) — `AkdAklApprovalStatus` and `IdentityCorrectionStatus`. Not directly dashboard-relevant beyond being additional "needs action" signals, which already have a reusable aggregate (`getWorkOrderItemSummaries`, §10).

---

## 10. Existing Reporting & Aggregation Logic

**FACT.** No dashboard/statistics/report feature exists anywhere in the repository today. Every "dashboard"-adjacent hit is either a nav breadcrumb, an icon-picker enum value, or the permission-catalog resource names (§11) — all non-functional for actual metrics. The one functioning "Dashboard" route (`apps/portal/src/app/management/page.tsx`, mapped from the seeded Menu leaf `code: "dashboard", href: "/"`) is a welcome screen with capability-gated shortcut icons — zero KPIs.

**Narrow, real aggregation that already exists and is reusable:**
- `ContactMessagesService.getStatistics` and `EmailsService.statistics` — single-entity tenant-wide counts, using **`groupBy`/`_count`** (the idiomatic pattern for this codebase — confirmed at `contact-messages.service.ts:419-427`, `chat-sessions.service.ts:213-218`).
- `CalibrationJobsService.getWorkOrderItemSummaries()` — a per-`purchaseOrderItemId` rollup (unit count, status counts, action-needed count), but explicitly scoped to **one WorkOrder's own jobs** via an in-memory JS reduce over a bounded `findMany` — not a `groupBy`, and architecturally the *opposite* of what a company-wide dashboard needs (bounded-by-parent vs. unbounded-by-time).
- `devices.service.ts:200-207` — five parallelized `Promise.all([...count()])` calls for a device's cross-entity usage summary — a good, directly reusable "parallel independent counts" idiom for a dashboard's multi-tile row.

**No `groupBy`/`aggregate`/statistical rollup exists anywhere in `quotations`, `purchase-orders`, `work-orders`, `calibration-requests`, or `calibration-jobs`** — confirmed by grep across all five modules. Every `.count()` call in these modules is a single-dimension pagination-total, not a grouped statistic. **A dashboard's aggregation queries for the commercial/calibration chain are 100% new code, though the `groupBy`/`_count` idiom to copy already exists elsewhere in the codebase** (`contact-messages`, `chat-sessions`).

---

## 11. API / Data Access Architecture (incl. RBAC — who may view the Dashboard)

**RBAC (per audit scope: only "who can view," not a permission redesign).** `packages/auth/src/access-control.ts` already declares two dedicated resources, explicitly documented as intentionally separate because the two apps have non-overlapping role sets:

```
managementDashboard: ["read"]
customerDashboard: ["read"]
```

Seeded grants (`packages/db/prisma/seed-role-permissions.ts`, cross-checked against `access-control.test.ts`):

| Role | `managementDashboard:read` | `customerDashboard:read` |
|---|---|---|
| SUPERADMIN | ✅ (hardcoded bypass) | ✅ |
| ADMIN | ✅ | ✅ |
| GENERAL_MANAGER | ✅ | ✅ |
| SUPERVISOR | ✅ | ❌ |
| FINANCE | ✅ | ❌ |
| TECHNICIAN_MANAGER | ✅ | ❌ |
| TECHNICIAN | ✅ | ❌ |
| CUSTOMER_SERVICE | ✅ | ❌ |
| CUSTOMER | ❌ | ✅ |

Of the roles holding `managementDashboard:read`, ADMIN, SUPERVISOR, FINANCE and GENERAL_MANAGER also hold the broadest cross-domain read grants — the roles for which a cross-entity dashboard is actually meaningful. TECHNICIAN/TECHNICIAN_MANAGER hold the permission but only calibration-job-scoped data grants, so a generic commercial dashboard would show them little unless the dashboard is role-scoped.

**Shell-level gating (FACT):** all three portal apps (`apps/portal`, `apps/tech-pwa`, `apps/customer-portal`) gate their layout only on "does an ACTIVE `UserMembership` exist" (`useRequireSession()`/`AuthGate`), never on role. Real separation is achieved per-page/per-route via `hasPermission(role, resource, action)` checks and `MenuService.getNavTree()` filtering — **a new Dashboard route must self-check `managementDashboard:read`; it cannot rely on "user is inside apps/portal" as a signal.**

**API/data access patterns (good, reusable):** consistent `Promise.all([findMany({skip,take}), count({where})])` pagination across all list endpoints; parallelized independent `count()` calls (`devices.service.ts`). **Anti-patterns found are minor and write-path only** (a couple of sequential per-item `await` loops inside already-atomic transactions in `quotations.service.ts` and `work-orders.service.ts`) — not a read-path/dashboard concern.

---

## 12. Performance & Scale Risks

- **Already fixed (do not re-flag):** the two previously-identified high-volume hotspots — the frontend's hardcoded `pageSize=100` job cap and `findAllGroupedByWorkOrder`'s unpaginated company-wide fetch — were confirmed fixed in the current tree (two-phase workOrderId-first pagination, plus a dedicated `getWorkOrderItemSummaries`/siblings-navigation endpoint set), per `calibration-management-portal-implementation-report.md` and direct code inspection.
- **No unindexed `findMany` or unbounded scan was found** in `quotations`, `purchase-orders`, `work-orders`, `customers`, `devices`, `device-calibration-parameters`, `equipment`, `equipment-calibration-records` — every list-style query carries pagination or a scoped `where`.
- **HIGH — every dashboard-relevant timestamp column is currently unindexed.** Checked directly against `schema.prisma` `@@index` declarations:

| Model | Dashboard-relevant timestamp(s) | Indexed? |
|---|---|---|
| `CalibrationJob` | `createdAt`, `submittedAt`, `startedAt` | **NO** |
| `Certificate` | `issuedAt`, `createdAt` | **NO** (`validUntil` is indexed, `issuedAt` is not) |
| `PurchaseOrder` | `createdAt`, `confirmedAt` | **NO** |
| `Quotation` | `createdAt`, `approvedAt` | **NO** |
| `WorkOrder` | `createdAt`, `scheduledStart`/`scheduledEnd` | **NO** |
| `Customer` | `createdAt` | **NO** (lower priority) |

  Every existing index on these models is on `(companyId, status)`, a FK column, or a business-unique field — none on a time-range column. This will not produce wrong results, only degraded query plans at scale for any "this month" / trend widget. **Recommendation: scope a minimal, dashboard-specific migration** (e.g. `@@index([companyId, createdAt])` on the 1-2 models the first dashboard iteration actually needs) rather than indexing every table speculatively, per the project's minimal-migration rule.
- **HIGH — `calibrationJobInclude` (the detail-view include used by every `CalibrationJob` list/find call) is 9 relations deep, one branch 4 levels deep, with 3 correlated `take:1` sub-selects, and does not include `Certificate` at all.** It is unsuitable for bulk dashboard use as-is. A dashboard needing per-job pass/fail + certificate + billing status must use narrow `select`s (`id, status, currentAttempt, workOrderId`) plus separate batched `groupBy`/`count` queries against `MeasurementResult`/`Certificate`, following the already-existing `referenceEquipmentReviewFlags(jobIds: string[])` batching idiom — not the wide detail include.
- **No read-model/materialized-view/repository layer exists anywhere** — confirmed via grep for `CREATE VIEW`/`MATERIALIZED VIEW` (zero hits) and `$queryRaw`/`$executeRaw` usage (limited to atomic-counter/sequence allocation in `packages/db/src/{revision,document-number,master-code}`, never aggregation). A dashboard's cross-entity queries have nothing to build on beyond plain Prisma Client calls.

---

## 13. Data Consistency Findings

### 13.1 Billing layer — confirmed dead, from three independent angles

Three separate research passes (billing-focused, calibration-execution-focused, and test-coverage-focused) each independently grepped the repository and arrived at the same result: **zero application code anywhere touches `prisma.invoice`, `prisma.payment`, `prisma.creditNote`, `prisma.invoiceItem`, `prisma.invoiceCertificate`, or the `billingStatus` field.** The only hits are the Prisma schema itself, migration DDL, a `RolePermission` seed entry for resources `invoice`/`payment` (RBAC scaffolding that guards a controller which doesn't exist), a `DocumentType`/prefix table entry for `INVOICE`/`CREDIT_NOTE` numbering (never called, because nothing invokes `DocumentNumberService.allocate()` for those types), and a permission-management UI label. `Certificate` creation (`certificate.service.ts:176-177`) sets neither `status` nor `billingStatus`, relying entirely on Prisma defaults (`DRAFT`/`UNBILLED`) — and no method anywhere ever changes either field afterward. This is also independently corroborated by an existing repo audit doc, `docs/claude/plans/cursor-gap-register-2026-09.md`, item P1-06.

Documentation search (`docs/cursor/entity-catalog.md`, `docs/cursor/business-domain.md`, `docs/ERD/README.md`, `docs/claude/plans/management-portal/Calibration-management/HANDOFF_Context_For_ChatGPT.md`) confirms this is **documented, intentional MVP scoping** ("MVP billing = Invoice + Payment + CreditNote" is a scope *commitment*, not a claim the layer already exists) — not a regression. An explicit implementation-status table in the HANDOFF doc lists Invoice/Payment/CreditNote as "❌ Not built," gated behind Certificate (now built) with no numbered phase/ETA found anywhere for the billing build-out.

### 13.2 Requested qty vs. actual fanned-out job count can diverge with zero reconciliation

Each stage of `CalibrationRequestItem.qty → QuotationItem.qty → PurchaseOrderItem.qty → WorkOrderItem.qty → N CalibrationJob rows` is a **frozen copy taken once at document-creation time**. Growing/shrinking the count after that requires an explicit, separate `revise()` call at **every** level — and `WorkOrder.revise()` is only reachable while `PLANNED`/`ASSIGNED` (an explicit, tested, documented boundary — `work-orders.service.ts` comment: *"once IN_PROGRESS, CalibrationJob fan-out has already run... this MOM does not change that mechanism"*). **If a requisition line's qty grows after its WorkOrder reaches `IN_PROGRESS`, no code path can ever create the additional CalibrationJob(s)** — the growth is stuck at the Quotation/PO level with no alert, and nothing in the codebase cross-checks `qty` against the live `CalibrationJob` count for the same chain. A dashboard must always count actual `CalibrationJob` rows for "true unit count" downstream of WorkOrder start — never the upstream `qty` fields.

### 13.3 Four independent, genuinely-separate device-identity representations

Confirmed as four separately-writable fields, not duplicates of one truth: (1) `CalibrationRequestItem.customerDeviceName`/`.model` — customer's free-text at intake; (2) `CalibrationJob.customerDeclaredDeviceName` — a frozen snapshot of (1), never re-synced; (3) `CalibrationJob.technicianObservedBrand/Model/Serial` — on-site truth, written only via an approved Identity Correction (BAI), test-verified to be independent of and never written to the `Device` master; (4) `Device.brand/model/serialNumber` — the master record, updated through an entirely separate device-management path. **For "what device was actually calibrated" reporting, (3) falling back to (4) is ground truth; (1)/(2) are "what the customer said" only and can legitimately diverge from reality by design** (that divergence is the entire purpose of the Identity Correction workflow).

### 13.4 Tax snapshot vs. live Tax master

`Quotation.taxCode`/`taxRate` and `PurchaseOrder.taxCode`/`taxRate` are plain, non-FK snapshot fields, resolved live against the `Tax` master **only at the moment of generation/revision** (`quotations.service.ts` `resolveDocumentTax()`), then frozen. A later change to `Tax.taxRate` never propagates to historical Quotations/POs — correct, intended behavior. `Invoice.taxId` *is* a live FK, but is moot since no Invoice backend exists (§13.1). **A dashboard must read `Quotation.taxRate`/`PurchaseOrder.taxRate` directly, never join live to `Tax`, for "the rate that was actually applied."**

---

## 14. Edge Cases

| Edge case | Status |
|---|---|
| Multiple PO against one Quotation | Guarded at service layer only, race-prone, untested concurrently (§6.1) |
| Multiple WorkOrder against one PO | DB-guarded via partial unique index — safe |
| Same device across multiple POs | Not specifically guarded; `@@unique([workOrderId, deviceId])` only scopes within one WorkOrder |
| Repeated calibration (REWORK) | Safe — same `CalibrationJob` row, `currentAttempt` increments, old `MeasurementResult` rows retained, never mutated |
| Cancelled PO (DRAFT-only) | Leaves `OPEN` `PurchaseOrderItem` rows behind, no cascade (§6.1) |
| Cancelled WorkOrder (from IN_PROGRESS) | **Orphans already-fanned-out CalibrationJob rows — no status change, no CalibrationJobStatus.CANCELLED exists** (§6.2) — CRITICAL |
| Partial completion | `WorkOrder.done()` requires ALL fanned-out jobs `ACCEPTED_BY_QA` (tested, enforced) — no "partial done" state exists |
| Revision / reapproval | MOM #1 mechanism — heavily tested, append-only, correct for status but not for live-row amounts (§8) |
| Identity correction | Well-modeled, tested, job-scoped, does not touch Device master except at final QA `complete()` |
| Certificate regeneration/supersession | `supersedesCertificateId` chain exists in schema but is **never invoked by any code** — moot today, will need re-auditing once issuance is implemented |
| Inactive/duplicate records | `isActive` soft-retire pattern (MOM #1 items) is consistent and tested |
| Historical records | Safe for status/event fields, unsafe for live commercial amounts (§8) |
| Tax-inclusive/exclusive | `Tax.isExclude` flag drives the calculation branch; both paths tested in `quotations.service.test.ts` |

---

## 15. Test Coverage

Overall, the commercial/operational chain (`calibration-requests`, `quotations`, `purchase-orders`, `work-orders`, `calibration-jobs`) is **the most thoroughly tested part of the codebase for this audit's purposes** — status transitions (including negative/invalid-transition cases), the MOM #1 revision/history mechanism (explicitly tested for "history is a complete snapshot, not a delta, and the live row/frozen row are never corrupted"), and the pure tolerance-evaluation function all have deep, edge-case-aware coverage with exact-value assertions.

**Specific, actionable gaps found:**

1. **No test exercises "WorkOrder cancelled while a child CalibrationJob is IN_PROGRESS, then a list/count query is run."** The existing cancel test walks up to this exact scenario and stops one assertion short (§6.2/§14) — this is the single most actionable test gap for the dashboard's correctness story, because it means a future refactor could silently break the invariant a dashboard depends on, with no CI signal.
2. **The PO-per-Quotation active guard (§6.1) is tested only sequentially, never concurrently** — the TOCTOU race is real but unexercised by any test.
3. **Certificate issuance has no test for a QA-outcome precondition, because none exists by design** (`certificate.service.test.ts` explicitly tests uploading a certificate for a `PENDING` job with zero QA reviews, and this succeeds) — documented, intentional, but a dashboard must not assume "certificate exists" implies "QA passed."
4. Zero `groupBy`/aggregate-style tests exist anywhere in the five core modules, simply because no such queries exist yet to test (§10).

---

## 16. Architectural Findings

Ordered by severity.

### F1 — CRITICAL — Financial/billing layer is 100% schema-only
**Evidence:** Zero hits for `prisma.invoice`/`prisma.payment`/`prisma.creditNote`/`billingStatus` in application code, confirmed by three independent research passes (§13.1). `certificate.service.ts:176-177` never sets `status`/`billingStatus` beyond Prisma defaults.
**Affected area:** Any financial dashboard widget.
**Why it matters:** No revenue, billing, or payment metric can reflect reality — the underlying tables are permanently empty/default.
**Dashboard impact:** A financial section built today would show fabricated or permanently-zero numbers.
**Recommended action:** Explicitly scope the Dashboard's financial section out of v1, or limit it to clearly-labeled pipeline/bookings metrics (`PurchaseOrder.totalAmount`, `Quotation.totalAmount`) with an explicit "not revenue" disclaimer.
**Must Fix Before Dashboard? YES** (scope decision, not a code fix) for any metric claiming to be financial.

### F2 — CRITICAL — WorkOrder cancellation orphans CalibrationJob rows; no CANCELLED job state exists
**Evidence:** `work-orders.service.ts:1128-1148` (§6.2); test gap at `work-orders.service.test.ts:792-802`.
**Affected area:** Any "jobs in flight" / "devices calibrated" / "in-progress backlog" metric.
**Why it matters:** Silently inflates active-work counts with dead work.
**Dashboard impact:** Every `CalibrationJob` aggregate must add a `workOrder.status <> CANCELLED` join that no existing code performs.
**Recommended action:** The Dashboard implementation must add this join in its own queries. Whether the underlying gap (no cascade, no CANCELLED status) should be fixed at the source is a decision outside this audit's scope — flagged as a candidate for a future, explicitly-scoped task.
**Must Fix Before Dashboard? YES** (the dashboard's own queries must compensate; the source-level fix is a separate decision).

### F3 — CRITICAL — Live commercial-amount fields are overwritten by `revise()`; no as-of-date reconstruction exists
**Evidence:** `quotations.service.ts:1115-1136`, `purchase-orders.service.ts:940-950` (§8).
**Affected area:** Any historical/trend financial-pipeline widget.
**Why it matters:** A naive query against live tables silently misattributes a later revision's amount to an earlier date.
**Dashboard impact:** Any "as of date X" or period-over-period trend widget touching `totalAmount`/`subtotal`/`taxAmount` will be wrong unless it joins History tables.
**Recommended action:** Build (or explicitly scope out) an "as-of-date" reconstruction helper before shipping any trend widget; current-state-only widgets are safe as-is.
**Must Fix Before Dashboard? YES for trend widgets; NO for current-state widgets.**

### F4 — HIGH — PO-per-Quotation "at most one active" guard is unindexed and race-prone
**Evidence:** `purchase-orders.service.ts:192-206`; no partial unique index exists (§6.1); untested concurrently.
**Affected area:** Any customer-value aggregation summing across POs.
**Dashboard impact:** Low-probability but nonzero double-counting risk under concurrent PO creation.
**Recommended action:** Flag for a future, separately-scoped fix (e.g. a partial unique index mirroring `WorkOrder`'s). Not a dashboard blocker per se, but worth the product owner's awareness.
**Must Fix Before Dashboard? NO.**

### F5 — HIGH — Every dashboard-relevant timestamp column is unindexed
**Evidence:** §12 table, cross-checked against `schema.prisma` `@@index` lines.
**Dashboard impact:** Degraded query plans at scale for any time-range widget, not incorrect results.
**Recommended action:** Scope a minimal, dashboard-specific index migration alongside the dashboard implementation task.
**Must Fix Before Dashboard? NO, but should be bundled with the implementation.**

### F6 — HIGH — Zero `groupBy`/aggregate precedent in the commercial/calibration modules
**Evidence:** §10.
**Dashboard impact:** All cross-entity aggregation queries are new code; the idiom exists elsewhere (`contact-messages`, `chat-sessions`) to copy but nothing to directly reuse.
**Recommended action:** Follow the existing `groupBy`/`_count` idiom; do not reuse `calibrationJobInclude` for bulk aggregation (§12).
**Must Fix Before Dashboard? NO — informs implementation approach.**

### F7 — MEDIUM — `isWithinTolerance` and QA decision are uncorrelated-by-code signals
**Evidence:** §9.2.
**Dashboard impact:** A naive "pass rate" metric could conflate two different things.
**Recommended action:** Report both signals separately, with the NULL-rate as an explicit data-quality indicator.
**Must Fix Before Dashboard? NO — metric-definition discipline only.**

### F8 — MEDIUM — Requested qty vs. actual fanned-out job count can diverge with zero reconciliation
**Evidence:** §13.2.
**Dashboard impact:** "Planned vs. delivered units" metrics must use `CalibrationJob` counts, never upstream `qty` fields, downstream of WorkOrder start.
**Must Fix Before Dashboard? NO — metric-definition discipline only.**

### F9 — LOW/INFORMATIONAL — Several enum values are declared but permanently unreachable
**Evidence:** §4 table (`FULFILLED`, `EXPIRED`, `RECEIVED`/`CONFIRMED`/`FULFILLED`, `TECHNICALLY_DONE`/`CLOSED`).
**Dashboard impact:** Any status-breakdown chart built against the full enum will show permanently-empty categories.
**Must Fix Before Dashboard? NO.**

---

## 17. Management Dashboard Readiness

### READY
- Permission plumbing (`managementDashboard`/`customerDashboard` resources, seeded to a sensible role set) — reuse as-is.
- Operational-status current-state metrics (Quotation/PO/WorkOrder counts by status, current pipeline value) — safe against live tables.
- Physical-unit ("volume") counting, provided the `workOrder.status <> CANCELLED` join is added.
- Pass/fail and QA-approval rates, reported as two distinct metrics with NULL-rate disclosed.
- Existing pagination/parallel-count idioms across the API for building dashboard tiles.

### BLOCKED
- Any revenue, billing, invoice, or payment metric — the backing tables are permanently empty/default (F1).
- Any "certificates issued/revoked/superseded" metric — the enum values are never written (F1/§13.1).

### NEEDS CLARIFICATION
- Whether "units calibrated" should include or exclude jobs whose parent WorkOrder was later cancelled (a product decision, not just a technical one — the current architecture makes the technical answer "exclude via a join you must add yourself," but the *business* definition of the metric should be confirmed with the product owner).
- Whether "quotations expired"/"requisitions fulfilled" should be reported as always-zero (accurately reflecting current code) or whether the dashboard should trigger a separate, explicitly-scoped fix to make these enum values reachable — out of scope for this audit to decide.
- The intended audience/role-scoping of the dashboard's content — the permission exists, but whether TECHNICIAN/TECHNICIAN_MANAGER should see a generic commercial dashboard or a role-scoped subset is a product decision.

### NEEDS ARCHITECTURAL CHANGE
- None required to *build* a first dashboard iteration — every blocking issue found is either a missing backend feature (billing, out of scope) or something the dashboard's own queries can compensate for (cancellation join, as-of-date reconstruction). No Phase 4 invariant, natural key, or core domain model needs to change.

---

## 18. Pre-Implementation Gate

| Item | Status | Evidence | Action |
|---|---|---|---|
| Domain model understood, relationships mapped | PASS | §3 | None |
| Cardinality/double-counting risks identified | PASS WITH CONDITIONS | §6 | Dashboard queries must add the cancellation join and count `CalibrationJob`, never upstream `qty` |
| Financial metrics feasible | **BLOCKED** | §13.1 | Exclude from v1 scope, or clearly label pipeline-only proxies |
| Historical/point-in-time reporting feasible | PASS WITH CONDITIONS | §8 | Current-state widgets safe now; trend widgets need a new as-of-date helper |
| Existing reporting/aggregation reusable | PASS WITH CONDITIONS | §10 | Idiom exists to copy (`groupBy`/`_count`); no direct reuse for this chain |
| Performance/scale for dashboard queries | PASS WITH CONDITIONS | §12 | Add scoped timestamp indexes; avoid `calibrationJobInclude` for bulk reads |
| RBAC — who can view | PASS | §11 | Reuse `managementDashboard:read` as-is |
| Test coverage protecting dashboard-relevant invariants | PASS WITH CONDITIONS | §15 | Two specific gaps noted (cancellation orphaning, PO-race concurrency) — not blockers, but risks to flag to the team |

**Overall gate status: PASS WITH CONDITIONS.**

---

## 19. Top 10 Most Important Findings

1. The entire Invoice/Payment/CreditNote layer, plus `Certificate.status`/`billingStatus`, is schema-only — no financial metric can be built from real data (F1).
2. `WorkOrder` cancellation orphans already-fanned-out `CalibrationJob` rows; no `CANCELLED` job status exists (F2).
3. Live `Quotation`/`PurchaseOrder` amount fields are overwritten by `revise()` while `status`/`approvedAt` are not — historical amount queries against live tables are wrong (F3).
4. "10+ POs for one hospital" means 10+ separate CalibrationRequest/Quotation chains, not fan-out from one Quotation — a dashboard must aggregate across that boundary (§6.1).
5. `CalibrationJob` (not `CalibrationRequestItem.qty`, not `PurchaseOrderItem.qty`) is the only correct grain for "physical units/volumes calibrated," and even it needs the cancellation join (§6.4).
6. `MeasurementResult.isWithinTolerance` and `QualityReview.decision` are uncorrelated-by-code — don't build one "pass rate" from a mix of both without disclosure (F7).
7. Four independent device-identity fields exist; only `technicianObserved*`/`Device` master reflect ground truth for reporting (§13.3).
8. The PO-per-Quotation "at most one active" business rule is enforced only at the service layer with no DB guard and a real (if low-probability) concurrency race (F4).
9. No `groupBy`/aggregate precedent exists in the commercial/calibration modules, and every dashboard-relevant timestamp column is unindexed — both are buildable, neither is a blocker, but both should be budgeted into the implementation estimate (F5/F6).
10. RBAC plumbing for the dashboard (`managementDashboard`/`customerDashboard`) already exists, is already seeded to a sensible role set, and needs no redesign — the single most "ready" piece of this audit (§11).

---

## 20. Critical Blockers

Only genuine, real blockers (not "needs care" items):

- **None block building a Management Dashboard outright.** The one true blocker is scope-shaped, not technical: **no financial/billing metric can be implemented against real data** (F1) because the backend does not exist. This blocks a specific *category* of widget, not the dashboard project as a whole.

---

## 21. Existing Architecture That Should Be Reused

- `hasPermission(role, "managementDashboard", "read")` and the existing `RolePermission` seed data (§11) — no new permission work needed.
- The `groupBy`/`_count` aggregation idiom from `contact-messages.service.ts`/`chat-sessions.service.ts` (§10).
- The parallelized independent-`count()` idiom from `devices.service.ts:200-207` (§10/§12).
- The `Promise.all([findMany({skip,take}), count({where})])` pagination pattern used consistently across every list endpoint (§11).
- The batched-lookup idiom (`referenceEquipmentReviewFlags(jobIds: string[])`) for per-job derived flags, as a model for avoiding N+1 when a dashboard needs a per-row status across many jobs (§12).
- The MOM #1 History tables themselves, once an as-of-date reconstruction helper is built (§8) — the data is already there and correctly append-only.

---

## 22. Dashboard-Specific Risks

- **Metric mislabeling risk** is the dominant risk category in this audit: `PurchaseOrder.totalAmount` looking like "revenue," `isWithinTolerance` looking like "QA pass rate," `CalibrationRequestItem.qty` looking like "units delivered," and `Certificate.billingStatus` looking like a real billing signal are all traps a dashboard implementer could fall into without reading this audit. Recommend each dashboard metric definition be reviewed against §7 (the Feasibility Matrix) before implementation.
- **Query correctness risk without regression protection:** the cancellation-join requirement (F2) and the PO-per-Quotation race (F4) are both real gaps with zero existing test coverage — a dashboard built on top of them today has no CI signal if a future refactor changes this behavior.
- **Performance risk is manageable but real at scale** — missing timestamp indexes (F5) and the wide `calibrationJobInclude` (§12) will degrade gracefully (correct but slow), not silently wrong, provided the dashboard's own queries are purpose-built (narrow selects, not the detail-view include).

---

## 23. Required Decisions Before Implementation

1. **Scope decision:** should the Dashboard's v1 omit financial metrics entirely, or include clearly-labeled pipeline/bookings proxies (`PurchaseOrder.totalAmount`, `Quotation.totalAmount`)? (Product owner decision — this audit recommends the latter, clearly labeled, given F1.)
2. **Metric definition decision:** should "units calibrated"/"jobs in flight" retroactively exclude jobs whose parent WorkOrder was cancelled (recommended), and should this exclusion also prompt a separately-scoped fix to the source-level gap (F2), or should the dashboard compensate unilaterally in its own queries? (Product + engineering decision.)
3. **Historical reporting decision:** is a trend/period-over-period widget (requiring the as-of-date History reconstruction, F3) in scope for v1, or should v1 ship current-state-only widgets and defer trend widgets to a follow-up phase?
4. **Audience decision:** should the dashboard be one generic view for every role holding `managementDashboard:read`, or role-scoped content (e.g. TECHNICIAN_MANAGER sees calibration-throughput tiles, FINANCE sees pipeline-value tiles)?
5. **Index migration decision:** which 1-2 timestamp indexes (of the six unindexed candidates in §12) does the v1 dashboard actually need — scope the migration minimally, per project rules, rather than indexing every table speculatively.

---

## 24. Recommended Next Step

Produce a scoped implementation plan for a Management Dashboard **v1** whose metric set is drawn only from the "RELIABLE" and "RELIABLE WITH CONDITIONS" rows of §7's Feasibility Matrix, explicitly excludes every "NOT CURRENTLY DERIVABLE" row (all financial/billing metrics), and whose backend queries are specified up front to include the `workOrder.status <> CANCELLED` join for any `CalibrationJob`-based count. That plan should also specify the minimal timestamp-index migration it actually needs and should explicitly state, for any widget touching a past date range, whether it is current-state-only (safe today) or requires the not-yet-built as-of-date History reconstruction helper (F3) — deferring the latter to a follow-up phase if it is not justified for v1.

This audit does not implement anything. UNDERSTAND FIRST, IMPLEMENT SECOND — the next step is planning, not code.
