# Implementation Plan — Calibration Management Portal Fixes for High-Volume PO Workflow

**Source of truth for this plan:** [calibration-management-portal-audit.md](calibration-management-portal-audit.md) (existing audit — not re-run here).

**Status:** Planning only. No code has been changed as part of producing this document.

---

## 0. Guardrails (carried over from the audit, binding for every task below)

Do NOT touch, in any task in this plan:

- Prisma schema — no new models, no new columns, no migration.
- `CalibrationJob` natural key / `@@unique` constraints.
- Fan-out architecture (`fanOutCalibrationJobs`).
- `unitOrdinal` / `unitTotal` semantics.
- Deferred device identity (`deviceId` stays `NULL` until an approved Identity Correction).
- `deviceId` semantics anywhere.
- `MeasurementResult`, `CalibrationTestPoint`, `JobCalibrationTestPoint` architecture, `replicateIndex`, `direction`, `referenceValue`.
- Tolerance architecture.
- LK/PDF generation (`lk-*.ts`, `kontrol-alat-pdf.ts`, etc.).
- Tech-PWA (any file under `apps/tech-pwa`).
- Business rules (approval gates, AKD/AKL gate, reference-equipment validity rules).
- The per-job Measurement/BA/Certificate accordion UI on the job detail page — its content and behavior stay exactly as-is; only page-level navigation chrome is added around it.

Every task below is additive (new field, new endpoint, new query shape with the same public contract) or an internal query-strategy change with no external contract break, unless explicitly called out.

---

## 1. Task Map & Dependencies

```
 T1 Work-Order calibration summary (backend)
   └─▶ T2 Work Order detail page consumes T1 (frontend)

 T3 Grouped-list two-phase query + statusCounts (backend)
   └─▶ T7 Aggregate progress display in list + WO header (frontend, also needs T1 for WO header)

 T4 purchaseOrderItemId filter (backend, small/independent)
   └─▶ T5 Drill-down link from Work Order Items table (frontend)
   └─▶ T6 Flat/paginated mode for Calibration Jobs list when scoped (frontend)

 T8 Sibling (prev/next) lookup endpoint (backend, independent)
   └─▶ T9 Prev/Next controls on job detail page (frontend)

 T10 Full-suite regression pass (after all of the above)
```

Independent backend tasks (**T1, T3, T4, T8**) have no dependency on each other and may be implemented/tested in any order or in parallel. Every frontend task depends only on its own backend task(s), not on unrelated ones (e.g. T9 does not need T1/T3 done first).

Recommended sequencing (safest, smallest-blast-radius first): **T4 → T1 → T3 → T8**, then **T2 → T5 → T6 → T7 → T9**, then **T10**. Rationale below in §3.

---

## 2. Tasks

### T1 — Fix the silent 100-job truncation on the Work Order Items rollup

**Problem solved:** `useWorkOrderCalibrationJobs` (portal) calls `GET /calibration-jobs?workOrderId=...&pageSize=100`, capped by `calibrationJobListQuerySchema`'s `pageSize.max(100)`. For a Work Order with >100 fanned-out jobs, the "Identity Correction" / "Alat Referensi" indicators on `WorkOrderItemsTable` silently go blank for any PO line item whose units fall past job #100 in fan-out order. This is the audit's top finding (audit §3.3, §5.1, §12).

**Files to change:**
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` — add a new method, e.g. `getWorkOrderItemSummaries(companyId, workOrderId)`.
- `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts` — add `GET /calibration-jobs/work-order-summary?workOrderId=...` (declared before `:id`, same pattern as the existing `grouped` route).
- `packages/shared/src/schemas/index.ts` — add a small query schema (`workOrderId` required) and a response-shape type export for the summary rows, next to the existing `calibrationJobListQuerySchema`.
- `apps/portal/src/app/management/calibration-jobs/use-calibration-jobs-query.ts` — replace `useWorkOrderCalibrationJobs` with `useWorkOrderCalibrationSummary(workOrderId)` hitting the new endpoint.
- `apps/portal/src/app/management/work-orders/work-orders-ui.tsx` — `WorkOrderItemsTable` and `latestIdentityCorrectionForItem` change from consuming a raw, capped `jobs` array to consuming per-item summary rows directly (no more client-side `.filter()` over a possibly-incomplete job list).
- `apps/portal/src/app/management/work-orders/[id]/page.tsx` — swap the hook call.

**Implementation approach:**
- New service method fetches **all** `CalibrationJob` rows for exactly one `workOrderId` (bounded by that single WO's job count — 7, 94, or 409 — never company-wide, so this is safe even at the audited PO's scale), using a **lean, purpose-built select** (id, purchaseOrderItemId, status, identityCorrections take 1, the fields `referenceEquipmentReviewFlags`/`jobNeedsReferenceEquipmentReview` need) rather than the full `calibrationJobInclude` used by the list endpoints.
- Reuse the existing `referenceEquipmentReviewFlags(jobIds)` private method unchanged (it already scopes cleanly to an arbitrary job-id list) to get the review-needed flag per job.
- Reduce in memory, grouped by `purchaseOrderItemId`, into one summary row per PO line item:
  ```
  {
    purchaseOrderItemId: string;
    unitCount: number;
    statusCounts: Record<CalibrationJobStatus, number>;
    latestIdentityCorrection: { id, number, status, createdAt } | null;
    unitsWithIdentityCorrection: number;
    needsReferenceEquipmentReview: boolean; // true if ANY unit in this item needs it
  }
  ```
  plus a WO-level total (`totalUnits`, `statusCounts`, `actionNeededCount`) for T7's aggregate-progress header.
- This in-memory reduce operates over at most one Work Order's units (hundreds, not the company's entire history) — an intentionally different, safe cost profile from the company-wide fetch fixed in T3.
- Old `GET /calibration-jobs?workOrderId=...&pageSize=100` call path stays exactly as-is for any other current caller (there is none outside the WO detail page today, but the flat endpoint itself is untouched — it still correctly paginates for other uses, e.g. T6).

**API/query impact:** New endpoint, additive. No change to `GET /calibration-jobs` or `GET /calibration-jobs/grouped` contracts.

**Portal UI impact:** `WorkOrderItemsTable` renders from accurate, complete per-item data regardless of how many units the item fans out to. No visual redesign — same columns, same badges — just correct data at any scale.

**Behavior to preserve:** Exact same badge semantics (`IdentityCorrectionStatusBadge`, `ReferenceEquipmentReviewBadge`) and exact same "which item shows what" logic — only the data source becomes complete instead of first-100-only.

**Acceptance criteria:**
- For a Work Order with >100 fanned-out jobs, every PO line item's Identity Correction / Alat Referensi indicators reflect the true state of **all** its units, not just the first ones created.
- For Work Orders with ≤100 jobs, output is identical to today's (no regression).
- New endpoint is company-scoped (`companyId` guard) and 404s / empty-summarizes correctly for a `workOrderId` that doesn't belong to the caller's company.

**Testing:**
- New Vitest cases in `apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts` (or a new colocated `*.test.ts` if the file is already large) covering: a WO with >100 jobs across multiple line items, verifying every item's summary is present and correct (this is the regression test that directly encodes the audited bug).
- `pnpm --filter @medcal/api exec vitest run apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts`
- Full API suite before marking T1 done: `pnpm --filter @medcal/api exec vitest run`
- Typecheck: `pnpm --filter @medcal/api exec tsc --noEmit`, `pnpm --filter @medcal/shared exec tsc --noEmit`

---

### T2 — Work Order detail page consumes the new summary (frontend half of T1)

**Files:** `apps/portal/src/app/management/work-orders/[id]/page.tsx`, `apps/portal/src/app/management/work-orders/work-orders-ui.tsx`.

**Problem solved:** Removes the last caller of the capped `useWorkOrderCalibrationJobs`/`pageSize=100` pattern.

**Approach:** Swap `useWorkOrderCalibrationJobs(params.id)` for `useWorkOrderCalibrationSummary(params.id)` (T1); update `WorkOrderItemsTable` props from `jobs: WorkOrderCalibrationJob[]` to `summaries: WorkOrderItemSummary[]`, keyed by `purchaseOrderItemId`; delete `latestIdentityCorrectionForItem` (logic now lives server-side in T1) or reduce it to a pure lookup (`summaries.find/Map.get`) instead of a filter+sort over raw jobs.

**API/query impact:** None beyond T1.

**Portal UI impact:** Same table, same columns; badge computation now correct at any scale (see T1 acceptance criteria).

**Preserve:** Table layout, column order, badge components, qty column formatting (`formatQty`).

**Acceptance criteria:** Work Order detail page renders identically to today for small WOs; renders correctly (no missing badges) for the 409-unit case.

**Testing:** No new pure-logic unit to test beyond T1's service test; manual/dev-server verification per the UI testing note in §4. If `latestIdentityCorrectionForItem` is kept as a thin lookup, keep it covered if it already has coverage — check first (none currently exists per repo scan; add one only if the function retains nontrivial logic, otherwise skip to avoid testing a one-line accessor).

---

### T3 — Fix `findAllGroupedByWorkOrder`'s company-wide unbounded fetch

**Problem solved:** `findAllGroupedByWorkOrder` (`apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts:794-850`) runs `prisma.calibrationJob.findMany({ where, include: calibrationJobInclude })` with **no `skip`/`take`**, fetching every matching job (in the common no-filter case: the company's entire calibration-job history) before grouping/paginating in memory. This endpoint is polled every 6 seconds by every open Portal "Calibration Jobs" tab. Audit §3.1, §5.2–3, §12.

**Files to change:**
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` — rewrite `findAllGroupedByWorkOrder` as a two-phase query.
- No controller change needed (same route, same request/response shape, plus the additive `statusCounts` field below).
- `apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx` — extend `CalibrationJobWorkOrderGroup` type to include the new optional `statusCounts` field (consumed by T7).

**Implementation approach (two-phase query, no schema change):**
1. **Phase 1 — resolve which WorkOrders match**, cheaply: `prisma.calibrationJob.findMany({ where, distinct: ["workOrderId"], select: { workOrderId: true }, orderBy: [{ workOrder: { number: "desc" } }, { workOrderId: "desc" }] })`. This still scans rows matching `where`, but with a minimal `select` (no relation includes, no `calibrationJobInclude` fan-out) — far cheaper per row than today's full include, and it's the same shape of query the flat `findAll` already relies on for correctness of filtering.
2. Compute `total` = number of distinct `workOrderId`s from phase 1; slice to the requested page → `pagedWorkOrderIds`.
3. **Phase 2 — fetch full data only for the paged Work Orders**: `prisma.calibrationJob.findMany({ where: { ...where, workOrderId: { in: pagedWorkOrderIds } }, include: calibrationJobInclude, orderBy: [...] })`. This is bounded to (page size × that page's WOs' job counts) instead of the entire company.
4. Group phase-2 rows by `workOrderId` exactly as today; compute `jobCount`, `actionNeededCount` exactly as today.
5. **Additive:** also compute `statusCounts: Record<CalibrationJobStatus, number>` per group in the same reduce (already have every job's `status` in hand — zero extra queries).
6. `reviewFlags` computation (`referenceEquipmentReviewFlags`) stays exactly as today, called only on the paged jobs — already correctly scoped, untouched.

**API/query impact:**
- Response shape: additive only — `CalibrationJobGroupedResult.data[].statusCounts` is new; every existing field (`workOrder`, `jobCount`, `actionNeededCount`, `jobs`) is unchanged.
- Query cost: phase 1 becomes the only "scan everything matching `where`" step, and it is now cheap (single-column, no joins) instead of the current full nested-include fetch. Phase 2 is bounded by page size.
- No change to request query params, pagination semantics (`page`, `pageSize` still page Work Orders, capped at 100 per `calibrationJobListQuerySchema`), or filter behavior.

**Portal UI impact:** None required to ship this task in isolation (existing consumers ignore the new field). T7 later renders `statusCounts`.

**Behavior to preserve:** Exact same ordering (`workOrder.number desc`, then `unitOrdinal asc` within group), exact same `actionNeededCount`/`jobCount` values, exact same filter semantics (`search`, `status`, `akdAklApprovalStatus`, `workOrderId`, `assignedToMe`) — this is a query-strategy change, not a behavior change.

**Acceptance criteria:**
- Existing `calibration-jobs.service.test.ts` grouped-list tests pass unmodified (same output for same input).
- New test: with company data containing calibration jobs across many Work Orders (simulating a large history), verify the query no longer requires fetching all jobs — assert on returned `total`/`totalPages`/group contents for a specific page, not on internal query call counts (avoid over-specifying implementation in the test).
- New test: `statusCounts` sums to `jobCount` for every group, for jobs spanning all five statuses.
- No change in behavior when `workOrderId` filter is already applied (single-WO case) — this is the case the audited PO's Work Order page already relies on indirectly.

**Testing:**
- `pnpm --filter @medcal/api exec vitest run apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts`
- Full API suite: `pnpm --filter @medcal/api exec vitest run`
- Typecheck: `pnpm --filter @medcal/api exec tsc --noEmit`

---

### T4 — Add `purchaseOrderItemId` filter to the Calibration Jobs list query

**Problem solved:** Prerequisite for the missing drill-down (audit §3.4, §6, §16 item "purchaseOrderItemId filter"). `purchaseOrderItemId` is already a column with an existing index (`@@index([purchaseOrderItemId])`) on `CalibrationJob`, and already a field on `CalibrationJobRow` — it is simply not filterable today.

**Files to change:**
- `packages/shared/src/schemas/index.ts` — add `purchaseOrderItemId: z.string().optional()` to `calibrationJobListQuerySchema`.
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` — add `...(query.purchaseOrderItemId ? { purchaseOrderItemId: query.purchaseOrderItemId } : {})` to `buildListWhere`.
- `apps/portal/src/app/management/calibration-jobs/use-calibration-jobs-query.ts` — thread the new optional param through `CalibrationJobsQueryParams` / `buildSearchParams` for both `useCalibrationJobs` and `useCalibrationJobGroups`.

**Implementation approach:** Mechanical — mirrors the existing `workOrderId` filter exactly (same optional-string pattern, same `buildListWhere` shape, same query-param plumbing). No new abstraction.

**API/query impact:** Additive query param on `GET /calibration-jobs` and `GET /calibration-jobs/grouped`. Omitting it preserves current behavior exactly.

**Portal UI impact:** None by itself — consumed by T5/T6.

**Behavior to preserve:** All other filters continue to combine with `AND` semantics exactly as today.

**Acceptance criteria:** `GET /calibration-jobs?purchaseOrderItemId=X` returns only jobs for that PO line item, correctly combinable with `workOrderId`, `status`, `search`.

**Testing:**
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts` — one new case for `buildListWhere`/`findAll` filtering by `purchaseOrderItemId`.
- `pnpm --filter @medcal/api exec vitest run apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts`
- `pnpm --filter @medcal/shared exec tsc --noEmit` (schema type change)

---

### T5 — Drill-down link from Work Order Items table to a scoped unit list

**Problem solved:** Audit §3.4 — the `workOrderId`-filtered list UI already exists but nothing links to it; there is no way to jump from "this PO line item" to "its N physical units."

**Files to change:**
- `apps/portal/src/app/management/work-orders/work-orders-ui.tsx` — `WorkOrderItemsTable`: wrap the item row (or add an explicit action cell) with a `Link` to `/calibration-jobs?workOrderId=<workOrder.id>&purchaseOrderItemId=<item.purchaseOrderItemId>`.
- `apps/portal/src/app/management/calibration-jobs/calibration-jobs-page-client.tsx` — accept and forward the new `purchaseOrderItemId` URL param (add to `URL_KEYS`, thread into the query call via T4's new param).
- `apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx` — `CalibrationJobFilters`: show a second "Difilter untuk Item" chip (mirroring the existing WO chip) with its own clear action when `purchaseOrderItemId` is set.

**Implementation approach:** Straight reuse of the existing `workOrderId`-filter UI pattern (`CalibrationJobFilters`'s existing chip/clear-button code), duplicated for the new param — no new component abstraction needed since the pattern is already a single, small block.

**API/query impact:** None beyond T4.

**Portal UI impact:** New, previously-unreachable navigation path becomes clickable. `WorkOrderItemsTable`'s qty column (already showing 94, 409, etc.) becomes an actionable entry point into that count.

**Preserve:** `WorkOrderItemsTable`'s existing columns/badges (T1/T2 already made these correct); this task only adds a link/action, not new data.

**Acceptance criteria:** Clicking a Work Order Item row (or its new "View units" action) navigates to the Calibration Jobs list pre-filtered to exactly that item's units, with both filter chips visible and independently clearable.

**Testing:** No new pure-logic function introduced (routing/link wiring). Verify manually via dev server (see §4) that the link navigates correctly and filters combine as expected with T6's flat view.

---

### T6 — Flat, properly-paginated view for a scoped unit list (many-units browsing)

**Problem solved:** Audit §3.2, §4, §6 — expanding a large SPK group renders all of its child jobs in one unpaginated table. The flat endpoint (`GET /calibration-jobs`, backing `findAll`) **already paginates correctly at the job level** (`skip`/`take`, capped `pageSize` ≤ 100) — it is simply not used by the Calibration Jobs page today, which always calls the grouped endpoint.

**Files to change:**
- `apps/portal/src/app/management/calibration-jobs/calibration-jobs-page-client.tsx` — when `workOrderId` and/or `purchaseOrderItemId` is present in the URL, switch from `useCalibrationJobGroups` to `useCalibrationJobs` (the existing flat, already-paginated hook) and render a flat table instead of the grouped/accordion table.
- `apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx` — add a flat table renderer that reuses the existing `JobChildRow` row markup (extract it to accept a flat `CalibrationJobRow[]` + the existing `PaginationBar`), instead of `CalibrationJobGroupTable`. No new visual design — same row content as today's expanded child rows, just paginated instead of all-at-once.

**Implementation approach:** This is a **mode switch**, not a new feature: unfiltered/broad browsing keeps today's SPK-grouped view (good for "is anything wrong across all my Work Orders" scanning — audit §3.1, kept as-is); once a manager has drilled into one Work Order or one PO line item (via T5, or by pasting/keeping a `workOrderId` URL param), the page switches to the flat, paginated table that already exists in the codebase's own list machinery (`findAll`/`useCalibrationJobs`/`PaginationBar`) — reusing existing patterns per project convention, not inventing virtualization or a new pagination widget.

**API/query impact:** None beyond T4 (the flat endpoint and its pagination already work correctly today — confirmed in the audit, this was never part of the bug).

**Portal UI impact:**
- Unfiltered list: unchanged (grouped/accordion view, T3's `statusCounts` addition surfaces via T7).
- Filtered-by-Work-Order or filtered-by-Item list: new flat, paginated table — this is the concrete answer to "pagination/filter/search for hundreds of units" from the task brief. Existing `search` and `status` filters keep working unchanged in this mode (they're already wired into `useCalibrationJobs`).

**Preserve:** `JobChildRow`'s exact rendering (unit ordinal, declared device, serial, AKD/AKL, action hints, status badge, View link) — reused, not redesigned.

**Acceptance criteria:**
- Navigating from T5's drill-down link shows a paginated table of exactly that item's units (7, 94, or 409, split across pages of ≤100).
- `search`/`status` filters still narrow results correctly within the scoped view.
- Removing the `workOrderId`/`purchaseOrderItemId` filter (via the chip's clear button) returns to the grouped view with no stale state.

**Testing:**
- No new service-layer logic (T4 already tested). If any new pure helper is extracted (e.g., a mode-selection predicate), add a small unit test colocated the way `calibration-job-utils.test.ts` already does for this module.
- `pnpm --filter @medcal/portal exec vitest run apps/portal/src/app/management/calibration-jobs/calibration-job-utils.test.ts` (regression check — this task must not touch shared utils, so this should be unaffected; run to confirm).
- Manual dev-server verification per §4 (this is a UI/navigation change; Vitest does not substitute for viewing it).

---

### T7 — Aggregate progress / status-breakdown display

**Problem solved:** Audit §10, §12 — no manager-facing "how far along is this Work Order" view exists (only a binary needs-action count).

**Files to change:**
- `apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx` — `SpkGroupBody`'s header row: render a compact status breakdown (e.g. "382 ACCEPTED_BY_QA · 20 IN_PROGRESS · 7 PENDING") next to the existing `jobCount`/`ActionNeededBadge`, sourced from T3's new `statusCounts`.
- `apps/portal/src/app/management/work-orders/[id]/page.tsx` — render the WO-level `statusCounts`/`totalUnits` from T1's summary endpoint near the page header.

**Implementation approach:** Pure presentational addition — a small formatting helper (e.g. `formatStatusCounts(counts: Record<CalibrationJobStatus, number>): string`, or a few inline badges reusing `JOB_STATUS_BADGE_CLASS`) consuming data both T1 and T3 already compute. No new query.

**API/query impact:** None (data already available from T1/T3).

**Portal UI impact:** Additive, read-only summary text/badges — no interaction change, no removal of existing elements.

**Preserve:** `ActionNeededBadge` and its href-to-first-actionable-job behavior stay exactly as-is; this is an addition alongside it, not a replacement.

**Acceptance criteria:** For the 409-unit Work Order, the list header and the WO detail header both show a truthful count-by-status breakdown that sums to the total unit count.

**Testing:**
- If a formatting helper is extracted into `calibration-job-utils.ts`, add a unit test in `calibration-job-utils.test.ts` following its existing style.
- `pnpm --filter @medcal/portal exec vitest run apps/portal/src/app/management/calibration-jobs/calibration-job-utils.test.ts`
- Manual dev-server verification for visual correctness.

---

### T8 — Sibling (previous/next) lookup endpoint

**Problem solved:** Audit §3.5, §5.5, §7 — no way to move between adjacent units without returning to the list.

**Files to change:**
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` — add `getSiblings(companyId, id): Promise<{ previousId: string | null; nextId: string | null }>`.
- `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts` — add `GET /calibration-jobs/:id/siblings`.
- `packages/shared/src/schemas/index.ts` — response type export only (no request body/query to validate beyond the existing `:id` param).

**Implementation approach:**
- Load the current job's `workOrderId`, `purchaseOrderItemId`, `unitOrdinal` (id + companyId guard, 404 if not found/foreign company — same pattern as `findOne`).
- **Design decision (stated explicitly, adjustable later without any schema impact):** scope sibling order to `workOrderId` **and** `purchaseOrderItemId` when the job has one (steps through "this line item's N units" — the natural case a manager is in after using T5's drill-down or T6's flat scoped view); fall back to `workOrderId`-only ordering when `purchaseOrderItemId` is `NULL`. This matches the audit's §17 open question 4 with the option that best matches the new T5/T6 navigation flow this plan introduces; if product feedback prefers whole-Work-Order stepping instead, this is a one-line `where` change, not a redesign.
- `previousId`: `prisma.calibrationJob.findFirst({ where: { companyId, workOrderId, purchaseOrderItemId, unitOrdinal: { lt: current.unitOrdinal } }, orderBy: { unitOrdinal: "desc" }, select: { id: true } })`.
- `nextId`: same with `{ gt: current.unitOrdinal }`, `orderBy: "asc"`.
- Both queries hit the existing `@@unique([workOrderId, purchaseOrderItemId, unitOrdinal])` index shape — cheap, indexed lookups, no new index needed.

**API/query impact:** New endpoint, additive, two cheap indexed point-lookups per call.

**Portal UI impact:** None by itself — consumed by T9.

**Behavior to preserve:** N/A (new capability).

**Acceptance criteria:** For a unit in the middle of a run, both `previousId`/`nextId` resolve correctly; for the first/last unit, the respective field is `null`; for a job with `purchaseOrderItemId = NULL` (should not occur for fanned-out units per current architecture, but the calibrationRequestItem-only path exists) falls back to `workOrderId`-only scoping without erroring.

**Testing:**
- New Vitest cases in `calibration-jobs.service.test.ts`: middle unit, first unit, last unit, single-unit item (both null).
- `pnpm --filter @medcal/api exec vitest run apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts`
- `pnpm --filter @medcal/api exec tsc --noEmit`

---

### T9 — Previous/Next controls on the Calibration Job detail page

**Files to change:**
- `apps/portal/src/app/management/calibration-jobs/use-calibration-jobs-query.ts` — add `useCalibrationJobSiblings(id)` query hook.
- `apps/portal/src/app/management/calibration-jobs/[id]/page.tsx` — render Previous/Next buttons near the existing header (`PageHeader`/`Unit {ordinal}/{total}` block, [page.tsx:417-456](calibration-management-portal-audit.md)), navigating via `Link`/`router.push` to `/calibration-jobs/<siblingId>`, disabled when the corresponding id is `null`.

**Implementation approach:** Small, self-contained addition to the existing header area. No change to any accordion section, no change to the page's data-fetching for the job itself (`useCalibrationJob` untouched) — the sibling query is independent and only feeds two buttons.

**API/query impact:** None beyond T8.

**Portal UI impact:** Two new buttons (Previous/Next) in the detail page header; everything below (Kontrol Alat, Identitas, Alat Referensi, Hasil Pengukuran, Identity Corrections, Sertifikat accordions) is untouched.

**Preserve:** All existing detail-page behavior (accordion auto-expand on load, `actionSignals`-driven focus, all mutations) — this task only adds navigation chrome.

**Acceptance criteria:** From any unit in a Work Order, Next/Previous moves to the adjacent unit (per T8's scoping decision) with correct disabled state at the ends of the run; page state (open accordion sections, unsaved dialogs) does not need to be preserved across navigation (this is a full page navigation to a new job id, matching how "View" from the list already behaves).

**Testing:**
- No new pure logic beyond the hook itself (thin `apiFetch` wrapper, consistent with every other hook in this file — no test precedent exists for these hooks individually, so none is required here either, consistent with existing conventions).
- Manual dev-server verification per §4: confirm Prev/Next works at the start, middle, and end of a multi-unit run, and is correctly disabled at both ends.

---

## 3. Safe Implementation Order

1. **T4** (purchaseOrderItemId filter) — smallest, purely additive, unblocks T5/T6. Do first because it's the lowest-risk change and several other tasks read more easily once it exists.
2. **T1** (Work-Order summary endpoint) — fixes the highest-severity correctness bug (audit §12 item 1). Independent of T3/T4/T8.
3. **T3** (two-phase grouped query) — fixes the highest-severity scale/performance bug (audit §12 item 2). Independent of T1/T4/T8; can be done in parallel with T1 by a different engineer if desired.
4. **T8** (sibling endpoint) — independent, small, backend-only.
5. **T2** (WO detail page cutover) — needs T1 merged first.
6. **T5** (drill-down link) — needs T4 merged first.
7. **T6** (flat paginated scoped view) — needs T4 merged first; benefits from T5 existing (so there's a real entry point) but could technically ship with only a manual URL for testing.
8. **T7** (aggregate progress display) — needs T1 and T3 merged first (it only renders data they produce).
9. **T9** (Prev/Next controls) — needs T8 merged first.
10. **T10** (final regression pass, below).

This order front-loads the two backend correctness/scale fixes the task brief calls out by number (T1, T3) before any UI work depends on them, keeps every step independently shippable/revertable, and never leaves the app in a state where a new UI element points at a non-existent endpoint.

---

## 4. Final Verification (T10)

Per `.claude/rules/testing.md` — do not declare this plan's implementation complete on typecheck/build alone.

1. Run every touched suite individually as each task lands (see each task's Testing section).
2. After all tasks (T1–T9) are implemented:
   - `pnpm --filter @medcal/api exec vitest run` (full API suite — confirms T1/T3/T4/T8 didn't regress any other calibration-jobs/work-orders behavior).
   - `pnpm --filter @medcal/portal exec vitest run` (full Portal suite).
   - `pnpm --filter @medcal/shared exec vitest run` (schema changes in T4/T8).
   - `pnpm --filter @medcal/api exec tsc --noEmit`, `pnpm --filter @medcal/portal exec tsc --noEmit`, `pnpm --filter @medcal/shared exec tsc --noEmit`.
3. Manual verification in a running Portal (per the repo's `run` skill / dev server) covering the golden path this plan exists for:
   - Open a Work Order with >100 fanned-out jobs (or a seeded equivalent) → confirm Work Order Items badges are complete (T1/T2).
   - Open the Calibration Jobs list with no filters → confirm the grouped view still works and now shows a status breakdown (T3/T7).
   - From a large-quantity item's row, drill down (T5) into a flat, paginated unit list (T6), and confirm search/status filters still work there.
   - Open a unit in the middle of a large run and use Next/Previous repeatedly to the ends of the run (T8/T9).
4. Report per-task Vitest file/test pass-fail counts and the full-suite result, per the mandatory Final Test Report format in `.claude/rules/testing.md` — do not report this plan's execution as "done" without that report once implementation begins.

---

*End of implementation plan. No code was changed in producing this document.*
