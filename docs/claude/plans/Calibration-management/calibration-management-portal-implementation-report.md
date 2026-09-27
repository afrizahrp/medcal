# Implementation Report — Calibration Management Portal Fixes for High-Volume PO Workflow

**Plan followed:** [calibration-management-portal-implementation-plan.md](calibration-management-portal-implementation-plan.md)
**Audit that motivated the plan:** [calibration-management-portal-audit.md](calibration-management-portal-audit.md)

**Status:** All 10 tasks (T1–T10) implemented exactly as planned. No scope expansion. No Prisma schema/migration changes. Tech-PWA untouched.

---

## 1. Summary

Implemented, in the plan's specified order (T4 → T1 → T3 → T8 → T2 → T5 → T6 → T7 → T9 → T10):

1. Fixed the silent >100-job truncation on the Work Order Items rollup (T1/T2).
2. Fixed `findAllGroupedByWorkOrder`'s company-wide unbounded fetch with a two-phase query (T3).
3. Added a `purchaseOrderItemId` filter (T4), a Work Order Items drill-down link (T5), a flat/paginated scoped unit view (T6), an aggregate status-count display (T7), and Previous/Next unit navigation (T9).
4. Verified everything against the full Vitest suites and typecheck (T10), including one self-caught flaky test fixed along the way.

No changes were made to `CalibrationJob`'s natural key, fan-out architecture, `unitOrdinal`/`unitTotal`, deferred device identity, `deviceId` semantics, `MeasurementResult`/`CalibrationTestPoint` architecture, tolerance architecture, LK/PDF generation, or Tech-PWA.

---

## 2. Tasks Completed

### T4 — `purchaseOrderItemId` filter on `GET /calibration-jobs` / `GET /calibration-jobs/grouped`

**Files changed:**
- `packages/shared/src/schemas/index.ts` — added `purchaseOrderItemId: z.string().optional()` to `calibrationJobListQuerySchema`.
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` — added the filter to `buildListWhere`.
- `apps/portal/src/app/management/calibration-jobs/use-calibration-jobs-query.ts` — threaded `purchaseOrderItemId` through `CalibrationJobsQueryParams`, `buildSearchParams`, and both hooks' query keys.

**As planned, no deviations.**

**Tests added:** `calibration-jobs.service.test.ts` — `"filters by purchaseOrderItemId, combinable with workOrderId"` (verifies filter alone, combined with `workOrderId`, and a non-matching id returns zero results).

---

### T1 — Work-Order calibration summary endpoint (fixes the 100-job truncation)

**Files changed:**
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` — added `getWorkOrderItemSummaries(companyId, workOrderId)`, `CalibrationJobWorkOrderItemSummary`, `CalibrationJobWorkOrderSummaryResult`, and a private `emptyStatusCounts()` helper reused by T3.
- `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts` — added `GET /calibration-jobs/work-order-summary?workOrderId=...` (declared before `:id`).
- `packages/shared/src/schemas/index.ts` — added `calibrationJobWorkOrderSummaryQuerySchema`.

**Implementation notes (one refinement found during implementation, not a deviation from the plan's intent):**
Before touching the frontend, I re-inspected `WorkOrderItemsTable`'s actual data flow and found the 100-job cap affected **only** the "Alat Referensi" (reference-equipment) badge — the "Identity Correction" badge was already sourced from `WorkOrder.jobs` (a separate, unbounded relation include on `GET /work-orders/:id`, `apps/api/src/modules/work-orders/work-orders.service.ts:70-79`), not from the capped `useWorkOrderCalibrationJobs`. The plan's T2 assumed both badges shared the capped source. I implemented the summary endpoint to cover both (per the plan, since it's also needed for T7's aggregate progress), but wired T2's frontend fix narrowly to replace only the affected `referenceEquipmentReviewPoiIds` computation — leaving the already-correct identity-correction path untouched, per the "preserve existing behavior outside scope" rule.

**Tests added:** new `describe("CalibrationJobsService — getWorkOrderItemSummaries")` block:
- 404 for a `workOrderId` outside the caller's company.
- Per-item aggregation of `statusCounts` and identity-correction state (qty 3, one correction submitted).
- The exact regression case: qty 101, correction on the **last** unit (past the old `pageSize=100` cutoff) — confirmed it still surfaces in the rollup.

---

### T3 — Two-phase query for `findAllGroupedByWorkOrder`

**Files changed:**
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` — rewrote `findAllGroupedByWorkOrder` as:
  1. Phase 1a: `prisma.calibrationJob.findMany({ where, select: { workOrderId: true }, distinct: ["workOrderId"] })` — lightweight, no include.
  2. Phase 1b: `prisma.workOrder.findMany({ where: { id: { in: matchingWorkOrderIds } }, orderBy: [{ number: "desc" }, { id: "desc" }], skip, take })` — sorts/paginates on WorkOrder's own `number` column directly, avoiding a Prisma `distinct` + relation-`orderBy` combination that risks an invalid `DISTINCT ON` / `ORDER BY` mismatch in Postgres.
  3. Phase 2: the original full `calibrationJobInclude` fetch, now scoped to `workOrderId: { in: pagedWorkOrderIds } }`.
  4. `totalJobs` is now `prisma.calibrationJob.count({ where })` (run in parallel with phase 2) instead of `rows.length` over the full unbounded fetch.
- Added `statusCounts: Record<CalibrationJobStatus, number>` to `CalibrationJobWorkOrderGroup` (additive field), computed from the phase-2 rows already in hand — no extra query.
- `apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx` — mirrored `statusCounts` on the portal-side `CalibrationJobWorkOrderGroup` type.

**As planned.** Ordering, filter semantics, `actionNeededCount`, and pagination behavior are unchanged — verified by the pre-existing tests passing unmodified plus new tests below.

**Tests added:**
- `"computes statusCounts per group, summing to jobCount"`.
- `"only fetches the current page's WorkOrders in full when other WorkOrders exist"` — confirms the `workOrderId` filter still scopes phase 1 and phase 2 identically after the split.
- Extended the existing pagination test to also assert `totalJobs`.

---

### T8 — Sibling (previous/next) lookup endpoint

**Files changed:**
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` — added `getSiblings(companyId, id)` and `CalibrationJobSiblings`.
- `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts` — added `GET /calibration-jobs/:id/siblings`.

**Design decision applied (as the plan specified it should be, with rationale restated in code comments):** scoped to the same `purchaseOrderItemId` when the job has one; falls back to whole-`workOrderId` ordering when it's `NULL`, because NULL values are never equal to each other for the `@@unique([workOrderId, purchaseOrderItemId, unitOrdinal])` constraint's purposes — filtering on `purchaseOrderItemId: null` would incorrectly mix unrelated `unitOrdinal` sequences.

**Tests added:** `describe("CalibrationJobsService — getSiblings")` — middle unit (both resolve), first/last unit (one side null), single-unit item (both null), 404 for a foreign-company job.

---

### T2 — Work Order detail page consumes the new summary

**Files changed:**
- `apps/portal/src/app/management/calibration-jobs/use-calibration-jobs-query.ts` — replaced `useWorkOrderCalibrationJobs` (capped, `pageSize=100`) with `useWorkOrderCalibrationSummary(workOrderId)` hitting the new endpoint.
- `apps/portal/src/app/management/work-orders/[id]/page.tsx` — swapped the hook; `referenceEquipmentReviewPoiIds` now derived from `calibrationSummary.data.items` instead of the capped job list.
- `apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx` — added portal-side `CalibrationJobWorkOrderItemSummary` / `CalibrationJobWorkOrderSummaryResponse` types mirroring the API shapes.

Confirmed via `grep` that `useWorkOrderCalibrationJobs` had exactly one call site in the whole Portal app (this one) — fully removed, no dangling references.

---

### T5 — Drill-down link from Work Order Items to a scoped unit list

**Files changed:**
- `apps/portal/src/app/management/work-orders/work-orders-ui.tsx` — `WorkOrderItemsTable` gained a required `workOrderId` prop and a "Lihat unit" action column linking to `/calibration-jobs?workOrderId=<id>&purchaseOrderItemId=<item.purchaseOrderItemId>`.
- `apps/portal/src/app/management/work-orders/[id]/page.tsx` and `apps/portal/src/app/management/work-orders/[id]/edit/page.tsx` — both call sites updated to pass `workOrderId={workOrder.id}` (the edit page was not mentioned explicitly in the plan's file list but is a second call site of the same component discovered via `grep`; updating it was necessary to keep the app compiling, not a scope expansion).
- `apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx` — `CalibrationJobFilters` gained a second, independently-clearable "Difilter untuk Item" chip mirroring the existing Work Order chip.

---

### T6 — Flat, paginated view for a scoped unit list

**Files changed:**
- `apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx` — added `CalibrationJobFlatTable`, reusing the existing (unexported) `JobChildRow` and `JOB_CHILD_HEADER` unchanged.
- `apps/portal/src/app/management/calibration-jobs/calibration-jobs-page-client.tsx` — added a `scoped` flag (`workOrderId || purchaseOrderItemId` present); when scoped, calls the already-paginated flat `useCalibrationJobs` hook and renders `CalibrationJobFlatTable` + the existing `PaginationBar` (job-level pagination); when not scoped, behavior is unchanged (grouped/accordion view). Both hooks are always called (rules-of-hooks) with `enabled` toggled oppositely.

No new pagination/virtualization mechanism was introduced — this reuses the flat endpoint's existing `skip`/`take`, exactly as the plan specified.

---

### T7 — Aggregate progress / status-breakdown display

**Files changed:**
- `apps/portal/src/app/management/calibration-jobs/calibration-job-utils.ts` — added `formatStatusCounts(counts)`, a pure formatter (`"7 Pending · 20 Rework · 382 Accepted by QA"`, omitting zero-count statuses, canonical status order).
- `apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx` — `SpkGroupBody`'s header row now shows the status breakdown next to `jobCount`/`ActionNeededBadge`.
- `apps/portal/src/app/management/work-orders/[id]/page.tsx` — page header now shows `{totalUnits} unit · {status breakdown}` from the T1 summary endpoint.

**Tests added:** `calibration-job-utils.test.ts` — `formatStatusCounts` omits zero-count statuses / keeps canonical order; returns `""` when everything is zero.

---

### T9 — Previous/Next controls on the job detail page

**Files changed:**
- `apps/portal/src/app/management/calibration-jobs/use-calibration-jobs-query.ts` — added `useCalibrationJobSiblings(id)`.
- `apps/portal/src/app/management/calibration-jobs/[id]/page.tsx` — added "Unit Sebelumnya" / "Unit Berikutnya" buttons next to "Back to List", disabled (plain `<button>`, no `Link`) when the corresponding sibling id is `null`, navigating via `Link` to `/calibration-jobs/<siblingId>` otherwise.

No change to any accordion section (Kontrol Alat, Identitas, Alat Referensi, Hasil Pengukuran, Identity Corrections, Sertifikat) or to `useCalibrationJob`'s own data fetching.

---

## 3. T10 — Final Verification

### Per-task / targeted runs (during implementation)
- `calibration-jobs.service.test.ts` run after each backend task (T4, T1, T3, T8 individually) — all passed before proceeding to the next task.
- `calibration-job-utils.test.ts` run after T7 — passed.

### Full-suite results (final)

| Package | Result |
|---|---|
| `@medcal/api` | **1380/1389 passed**, 9 failed (65/69 files) — see below |
| `@medcal/portal` | **240/240 passed** (22/22 files) |
| `@medcal/shared` | **68/68 passed** (9/9 files) |

### Typecheck
`@medcal/api`, `@medcal/portal`, `@medcal/shared` — all clean (`tsc --noEmit`, zero errors).

### The 9 remaining API failures — confirmed pre-existing, unrelated

All 9 are in modules this implementation never touched: `emails/imap-sync.service.test.ts` (5), `push-tokens/notification-dispatch.service.test.ts` (2), `whitelist/registration-origin-callers.test.ts` (1), `contact-messages/contact-messages.push.test.ts` (1).

Verified by stashing all 13 changed files, running these exact test files against the unmodified base commit (`bd47fec`), and reproducing the identical failures (IMAP-not-configured in the test environment, a missing `push.resolvePushIconUrl` function, a Tech-PWA registration call missing an Origin header, and a mock-assertion mismatch). None of these files import anything from `calibration-jobs`, `work-orders-ui`, `use-calibration-jobs-query`, or the shared-schema additions (confirmed by `grep`).

### Self-caught issue and fix

The first full-suite run also showed my own new `getSiblings` "404 for a foreign company" test failing intermittently with `Unique constraint failed on the fields: (id)`. Root cause: this test file's "foreign company" fixtures use a 3-character id (`S` + 2 random hex chars — matching `Company.id`'s `@db.Char(3)` constraint elsewhere in the schema), giving only 256 possible ids shared across ~11 such fixtures in this one file — a pre-existing collision risk that my two new tests (for T1 and T8's 404 cases) made slightly more likely to trigger.

**Fix (scoped only to the two tests I added):** changed `prisma.company.create(...)` to `prisma.company.upsert({ where: { id }, create: {...}, update: {} })` in those two tests only — idempotent, so a collision with an existing "foreign" company row from another test is harmless. Re-ran the full suite twice afterward with zero further flakes. The other 9 pre-existing occurrences of the same collision-prone pattern elsewhere in the file were **not** touched (out of scope — not something this task was asked to fix).

---

## 4. Guardrails Confirmed

- `git status` on `packages/db/prisma/schema.prisma` and `packages/db/prisma/migrations/` — no changes.
- `CalibrationJob` natural key, fan-out mechanism, `unitOrdinal`/`unitTotal`, deferred device identity, `deviceId` semantics — untouched.
- `MeasurementResult`, `CalibrationTestPoint`, `JobCalibrationTestPoint`, tolerance architecture, LK/PDF generation — untouched.
- No file under `apps/tech-pwa` was modified.
- No bulk-approval mechanism was introduced for Identity Corrections or Quality Reviews.
- Final `git status --porcelain` shows exactly the files the plan named for T1–T9, plus the two additional same-component call sites (`work-orders/[id]/edit/page.tsx`) needed to keep the app compiling after `WorkOrderItemsTable` gained a required prop — no unrelated files touched.

---

## 5. Files Changed (complete list)

- `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts`
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts`
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts`
- `apps/portal/src/app/management/calibration-jobs/[id]/page.tsx`
- `apps/portal/src/app/management/calibration-jobs/calibration-job-utils.ts`
- `apps/portal/src/app/management/calibration-jobs/calibration-job-utils.test.ts`
- `apps/portal/src/app/management/calibration-jobs/calibration-jobs-page-client.tsx`
- `apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx`
- `apps/portal/src/app/management/calibration-jobs/use-calibration-jobs-query.ts`
- `apps/portal/src/app/management/work-orders/[id]/page.tsx`
- `apps/portal/src/app/management/work-orders/[id]/edit/page.tsx`
- `apps/portal/src/app/management/work-orders/work-orders-ui.tsx`
- `packages/shared/src/schemas/index.ts`

---

*End of implementation report.*
