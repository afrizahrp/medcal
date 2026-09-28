# Management Dashboard V1 — Implementation Report

**Status:** Implemented. Locked business rules in the request and in `MANAGEMENT-DASHBOARD-V1-IMPLEMENTATION-PLAN.md` §2 were not reopened.
**Date:** 2026-09-27

Repository checks before coding matched the locked rules:

- `PurchaseOrdersService.approve()` writes `status: "APPROVED"` and `confirmedAt: new Date()` in the same update. `revise()` updates commercial totals only and does not rewrite `confirmedAt`.
- `CalibrationJobsService.decideQualityReview()` refuses a second `QualityReview` with `status: "APPROVED"` for the same job. An approve row stores `decision: "APPROVE"` and `reviewedAt`.
- `CalibrationJob` is created only by `WorkOrdersService.fanOutCalibrationJobs()`.
- `managementDashboard:read` already exists. `SUPERADMIN` bypasses `hasPermission`. No `DIRECTOR` role exists. No `RolePermission` seed row was added or removed.

---

## 1. Files changed/created

**Created**

- `packages/db/prisma/migrations/20260927150000_management_dashboard_v1_indexes/migration.sql`
- `apps/api/src/modules/dashboard/dashboard.module.ts`
- `apps/api/src/modules/dashboard/dashboard.controller.ts`
- `apps/api/src/modules/dashboard/dashboard.service.ts`
- `apps/api/src/modules/dashboard/dashboard-period.ts`
- `apps/api/src/modules/dashboard/dashboard.service.test.ts`
- `apps/api/src/modules/dashboard/dashboard-period.test.ts`
- `apps/portal/src/app/management/use-management-dashboard-query.ts`
- `docs/claude/plans/Calibration-management/MANAGEMENT-DASHBOARD-V1-IMPLEMENTATION-REPORT.md` (this file)

**Modified**

- `packages/db/prisma/schema.prisma` — four indexes from plan §12
- `packages/shared/src/schemas/index.ts` — `dashboardQuerySchema` and `dashboardSummaryResponseSchema`
- `apps/api/src/app.module.ts` — registers `DashboardModule`
- `apps/api/src/modules/me/me.controller.ts` — exposes existing `managementDashboard:read` as `capabilities.managementDashboardRead`
- `packages/auth/src/me-types.ts` — `MeCapabilities.managementDashboardRead`
- `apps/portal/src/app/management/page.tsx` — replaces the welcome screen with the dashboard

---

## 2. Database/schema/index changes

No new tables, columns, enums, or roles.

Indexes added on the Prisma models and in migration `20260927150000_management_dashboard_v1_indexes`:

| Model | Index | Purpose |
|---|---|---|
| `WorkOrder` | `[customerId]` | Volume scoped by customer |
| `PurchaseOrder` | `[customerId]` | Customer PO scoped by customer |
| `PurchaseOrder` | `[companyId, status, confirmedAt]` | Approved-PO filter and period bucket |
| `CalibrationJob` | `[companyId, createdAt]` | Volume period bucket |

`prisma validate` succeeded. `prisma migrate deploy` applied this migration to the test database `pkmdb_test` as part of the API pretest. The application database pointed at by `DATABASE_URL` was not migrated in this session. Deploy the migration there before using the dashboard against that database. The queries are correct without the indexes; the indexes are the required lookup support.

---

## 3. Backend/API implementation

New module `apps/api/src/modules/dashboard`.

`GET /dashboard/management-summary`

Query: `period` (`today` | `week` | `month` | `quarter` | `year` | `custom`, default `month`), optional `from`, `to` (`YYYY-MM-DD`), optional `customerId`.

Invalid period, impossible calendar date, custom range without both dates, or `from` after `to` returns `400` with `code: "INVALID_DASHBOARD_QUERY"`.

`customerId` that is not a customer in the caller’s company returns `404` with `code: "CUSTOMER_NOT_FOUND"`.

Response:

- `currentState.activeWorkOrders` — `WorkOrder.status IN (PLANNED, ASSIGNED, IN_PROGRESS)`
- `currentState.jobsAwaitingAction` — `CalibrationJob.status IN (PENDING, IN_PROGRESS, SUBMITTED, REWORK)`
- `currentState.quotationsPendingApproval` — `Quotation.status IN (DRAFT, SENT)`
- `period.customerPO` — `COUNT(PurchaseOrder WHERE status = APPROVED)` whose `confirmedAt` falls in the period
- `period.volume` — `COUNT(CalibrationJob)` whose `createdAt` falls in the period, no status filter
- `period.calibrated` — jobs with `CalibrationJob.status = ACCEPTED_BY_QA` and a `QualityReview.status = APPROVED` whose `reviewedAt` falls in the period
- `financial.revenue` and `financial.outstandingInvoiceValue` — constant `0`

Each period metric also returns `trend[]` of `{ bucketStart, label, count }`, including zero buckets.

Company scope comes from `CompanyRoleGuard` (`COMPANY_ID` membership), never from the client.

---

## 4. Aggregation/query strategy

Current-state counts and the three period reads run together in `Promise.all`. Every dashboard read uses a narrow `select` or `count`. `calibrationJobInclude` is not used.

Customer PO reads `PurchaseOrder.confirmedAt` for `status = APPROVED` only. `DRAFT` and `CANCELLED` are excluded. `createdAt` and `customerPoDate` are not used.

Volume reads `CalibrationJob.createdAt` only. Quantity on request, quotation, purchase-order, or work-order lines is never summed. A work order that has not been fanned out contributes `0`.

Customer scope is one hop: `PurchaseOrder.customerId`, or `CalibrationJob.workOrder.customerId`.

Calibrated reads `QualityReview` where `status = APPROVED`, `reviewedAt` is inside the period, and the parent job is `ACCEPTED_BY_QA`. Rows are ordered by `reviewedAt` and counted once per `calibrationJobId`. Bucketing uses that approved `reviewedAt`, not a rejected review and not `CalibrationJob.updatedAt`.

Bucketing is done in application code after the narrow read (`dashboard-period.ts`).

Timezone is `Asia/Jakarta`, implemented as a fixed UTC+7 offset (no DST). Preset periods are `[start of the Jakarta bucket, now)`. Custom `from`/`to` are inclusive Jakarta calendar dates: `[start of from, start of the day after to)`.

Bucket grain: hour for today and a custom range of one day or less; day for week, month, and custom ranges up to 31 days; week for quarter and custom ranges up to 120 days; month for year and longer custom ranges.

`Jobs Awaiting Action` does not exclude jobs whose work order is `CANCELLED`. That exclusion belongs to the deferred cancellation phase. The UI does not mention cancellation.

Financial values come from `FINANCIAL_CARDS_V1` in `dashboard.service.ts`. There is no query against `Invoice`, `Payment`, `CreditNote`, or certificate billing fields, and no sum of purchase-order or quotation totals.

---

## 5. Frontend implementation

`apps/portal/src/app/management/page.tsx` replaces the previous welcome screen. The route stays `/management`, which is the existing dashboard menu leaf.

Layout:

1. Title and period selector: Hari ini, Minggu ini, Bulan ini, Kuartal ini, Tahun ini, Rentang khusus.
2. Current-state cards: Work Order aktif, Job menunggu tindakan, Quotation menunggu persetujuan. A caption states that these ignore the period.
3. Customer PO and Volume side by side, with the caption that Customer PO is the count of approved purchase-order documents and Volume is the count of physical units. Volume includes the fan-out note from plan §5.10.
4. Terkalibrasi, with its period trend.
5. Pendapatan and Nilai invoice belum tertagih, each showing `0`, the label “Tidak tersedia”, and the backend `unavailableReason`.

A zero period total shows “Tidak ada data pada periode ini.” Loading uses skeletons. A failed request can be retried. A `403` shows the existing access-denied state.

The optional customer drill-down table was not built. The API still accepts `customerId`.

The previous Messages / Web Chat / Email shortcuts on this page were removed because the plan replaces that welcome content. Those shortcuts remain in the management header.

---

## 6. Authorization

`DashboardController.managementSummary` uses the existing `@RequirePermission("managementDashboard", "read")` and `CompanyRoleGuard`.

No permission catalog entry, role, or `RolePermission` seed was added, removed, or narrowed. `GENERAL_MANAGER` already receives the grant through the existing seed mirror. `SUPERADMIN` still passes by the hardcoded bypass. `CUSTOMER` remains denied.

The portal page checks `capabilities.managementDashboardRead`, computed in `GET /me` with the same `hasPermission(role, "managementDashboard", "read")` call. That flag is a client signal for this page, not a new permission.

---

## 7. Tests added/changed and results

Added:

- `apps/api/src/modules/dashboard/dashboard-period.test.ts`
- `apps/api/src/modules/dashboard/dashboard.service.test.ts`

Covered:

- Jakarta midnight equals `2026-09-26T17:00:00.000Z`, and `2026-09-26T23:30:00.000Z` is `06:30` the next Jakarta day.
- Month and week bucket bounds.
- A timestamp inside the Jakarta day is counted; the previous Jakarta evening and the next Jakarta midnight are not.
- Active work orders, jobs awaiting action (including a job on a cancelled work order), and quotations pending approval use the specified status sets.
- Customer PO counts one in-range `APPROVED` row and ignores `DRAFT`, `CANCELLED`, out-of-range `confirmedAt`, and another customer.
- A job with a rejected review and a later approved review is counted on the approved `reviewedAt` hour. The rejection day is `0`. A `SUBMITTED` job with an approved review is not counted.
- A work-order line with `qty = 3` and no jobs contributes volume `0`. Three `CalibrationJob` rows contribute volume `3`.
- One customer with 17 `APPROVED` purchase orders, plus one `DRAFT` and one `CANCELLED`, 56 lines whose quantities sum to 409, and 409 jobs reports Customer PO `17` and Volume `409` together. An issued invoice of `999999` leaves both financial fields at `0`.
- Unknown period and incomplete custom range return `400`. Unknown `customerId` returns `404`.
- Guard allows `SUPERVISOR`, `GENERAL_MANAGER`, `ADMIN`, and `SUPERADMIN`. Guard rejects `CUSTOMER`.

Command:

`pnpm --filter @medcal/api test -- src/modules/dashboard`

Result: **2 files, 17 tests, all passed** (Vitest 4.1.10, about 37s after the test database was migrated and seeded).

The full API suite was not run.

---

## 8. Typecheck/build/lint validation

| Command | Result |
|---|---|
| `pnpm --filter @medcal/shared typecheck` | exit 0 |
| `pnpm --filter @medcal/auth typecheck` | exit 0 |
| `pnpm --filter @medcal/api typecheck` | exit 0 |
| `pnpm --filter @medcal/portal typecheck` | exit 0 |
| `pnpm --filter @medcal/db exec prisma validate` | schema valid, exit 0 |
| `pnpm --filter @medcal/api build` (`tsc -p tsconfig.json`) | exit 0 |
| `pnpm --filter @medcal/portal build` (`next build`) | compiled, TypeScript finished, 60 static pages generated, exit 0. Route `/management` is present. |
| `pnpm --filter @medcal/api lint` | prints `lint api skipped`, exit 0 |
| `pnpm --filter @medcal/portal lint` | prints `lint portal skipped`, exit 0 |
| `pnpm --filter @medcal/shared lint` | prints `lint shared skipped`, exit 0 |
| `pnpm --filter @medcal/auth lint` | prints `lint auth skipped`, exit 0 |

The browser flow was not exercised while signed in. No portal/API dev server was already running, and the page requires a session. Production build of `/management` is the UI check that was completed.

---

## 9. Any pre-existing failures

None appeared in the commands above. Lint scripts already exit 0 by printing that lint is skipped; that behavior was not introduced here. The rest of the API/portal test suites were not executed, so this report does not claim they are green.

---

## 10. Any deviation from the finalized plan, with reason and impact

1. **Customer PO timestamp.** Plan §6.3, §12, and the locked request use `PurchaseOrder.confirmedAt`. Plan §8’s metric table still says `PurchaseOrder.createdAt` and gives the old reason (“the only field non-null for every counted row”). That §8 cell was left over after the revision that selected `confirmedAt`. Implementation uses `confirmedAt`. Impact: period placement follows approval time, which is the locked rule. `createdAt` is not used.

2. **Financial payload.** Plan §10 shows `{ revenue: 0, outstandingInvoiceValue: 0 }`. The response also includes `unavailableReason`, filled from `FINANCIAL_CARDS_V1`, so the UI can show the “not available” hint from the backend constant. Both numbers are still the constant `0`. The shared schema types them as `number`, so a later billing implementation can fill the same fields. Impact: no live billing query; the extra string is display metadata.

3. **Customer drill-down table.** Plan §14 marks it optional and allows deferral. The API filter `customerId` is implemented. The page has no customer picker or per-customer table. Impact: company-wide numbers are shown; a caller can still pass `customerId`.

4. **Previous comparable period.** Plan §8 calls the comparison an inference and §10 does not put it in the response. It was not implemented. Impact: cards show the selected period only.

5. **Requisitions Received and Quotations Approved.** §8 mentions them only “if retained”. They are not in the §4 catalog or the §10 response, so they were not built. Impact: none on the locked metric set.

6. **`GET /me` capability flag.** The portal cannot call `hasPermission` itself. `managementDashboardRead` mirrors the existing grant. No seed or catalog change. Impact: roles that already have `managementDashboard:read` see the page; `CUSTOMER` does not.

7. **Unknown `customerId` is 404.** The plan does not specify this case. A missing customer in the caller’s company is not reported as a zero dashboard. Impact: typos are visible; another company’s id does not return that company’s data.

8. **Welcome shortcuts removed from the home page.** Required by §14’s replacement of the welcome screen. Header shortcuts are unchanged.

9. **Bucket grain for today, week, and custom ranges** is the §8 inference (hour / day / week / month by span). Month, quarter, and year follow the plan: day, week, and month.

## Follow-up (same day): welcome page restored

The first implementation replaced `apps/portal/src/app/management/page.tsx`. That welcome screen was restored. The calibration dashboard now lives at `apps/portal/src/app/management/calibration-dashboard/page.tsx` (URL `/calibration-dashboard`).

Menu seed adds `calibration-management.dashboard` (“Management Dashboard”) under Calibration Management, still gated by the existing `managementDashboard:read`. The home menu item `dashboard` (`href: "/"`) is unchanged. Reseed the menu (`pnpm --filter @medcal/db run seed:menu`) on the application database so the new leaf appears.
