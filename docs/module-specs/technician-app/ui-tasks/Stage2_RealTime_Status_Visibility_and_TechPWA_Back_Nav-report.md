# STAGE 2 — Real-Time Status Visibility (Portal) + Fix tech-pwa Back Navigation — Implementation Report

Date: 2026-09-06
Status: **Implemented. HARD STOP — not deployed.**

Real-time approach used: React Query `refetchInterval` (6s) + `refetchOnWindowFocus: true` on the
specific queries. Polling only — no WebSocket/SSE.

---

## Task 1 — Portal Calibration Jobs list: pending Identity Correction status

### API
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts`
  - `calibrationJobInclude` extended with the most-recent `identityCorrections` row
    (`select: { id, number, status, createdAt }`, `orderBy: createdAt desc`, `take: 1`).
  - Flows into both `findAll` (list) and `findOne` (detail) responses. At most one
    `PENDING_REVIEW` can exist per job (already enforced on submit).

### Portal
- `apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx`
  - `CalibrationJobRow` gains `identityCorrections[]`.
  - New **"Identity Correction"** column in `CalibrationJobTable`: renders
    `IdentityCorrectionStatusBadge` with **"Menunggu Review"** only when the latest
    correction is `PENDING_REVIEW`; otherwise `—`.
- `apps/portal/src/app/management/calibration-jobs/use-calibration-jobs-query.ts`
  - `useCalibrationJobs`: `refetchInterval: 6000`, `refetchOnWindowFocus: true`.
- `apps/portal/src/app/management/calibration-jobs/calibration-jobs-page-client.tsx`
  - Dim-on-fetch overlay now keys off `isPlaceholderData` (filter/page transition only),
    so the table no longer pulses on every 6s background poll.

---

## Task 2 — Work Order detail "Work Order Items": approved/reject status per line

### API
- `apps/api/src/modules/work-orders/work-orders.service.ts`
  - `workOrderInclude` extended with `jobs` (per-unit calibration jobs):
    `select: { id, purchaseOrderItemId, unitOrdinal, unitTotal, identityCorrections(take:1) }`.

### Portal
- `apps/portal/src/app/management/work-orders/work-orders-ui.tsx`
  - New types `WorkOrderCalibrationJob`, `WorkOrderIdentityCorrectionRef`; `WorkOrderRow.jobs` added.
  - New helper `latestIdentityCorrectionForItem(jobs, purchaseOrderItemId)` — matches a WO item
    to its calibration jobs by `purchaseOrderItemId`, returns the single most-recent correction
    plus the count of units that currently carry one.
  - `WorkOrderItemsTable` gains an **"Identity Correction"** column: status badge
    (menunggu review / disetujui / ditolak) + "N unit" hint when more than one unit is affected.
    BA number shown as the badge's `title` tooltip.
- `apps/portal/src/app/management/work-orders/[id]/page.tsx` and `[id]/edit/page.tsx`
  - Pass `jobs={workOrder.jobs}` to `WorkOrderItemsTable`.
- `apps/portal/src/app/management/work-orders/use-work-orders-query.ts`
  - `useWorkOrder`: `refetchInterval: 6000`, `refetchOnWindowFocus: true`.
- `apps/portal/src/app/management/calibration-jobs/use-identity-corrections-query.ts`
  - `useIdentityCorrections` (reviewer's list on the CJ detail page): same polling, so an
    approve/reject in one tab is reflected in another.

---

## Task 3 — tech-pwa: fix multi-press back-button navigation

### Root cause (confirmed)
Every wizard step navigated with `router.push`, so after submitting, the browser back stack was:

```
Job Saya → job detail → step1 → signature-technician → signature-customer → photo → correction-detail
```

Pressing back walked backward through the now-dead wizard steps (each guard-redirecting), taking
5+ presses to reach "Job Saya" home.

### Fix — the 5-step wizard is now a replace-based flow
- Entry (`apps/tech-pwa/src/app/jobs/[id]/page.tsx`): "Ajukan Koreksi Identitas" uses
  `router.replace` instead of a `<Link>` push.
- Every "Lanjut" button and every guard-redirect uses `router.replace`:
  - `identity-correction/page.tsx` (step 1)
  - `identity-correction/signature-step.tsx` (steps 2 & 3, shared)
  - `identity-correction/photo/page.tsx` (step 4)
  - `identity-correction/review/page.tsx` (step 5)
- **In-wizard back is preserved.** New optional `onBack` prop on `Screen` + `AppHeader`
  (`apps/tech-pwa/src/components/layout/screen.tsx`, `app-header.tsx`). Each wizard step's
  header back arrow explicitly `router.replace`s to the previous step; step 1's back arrow
  goes to the job detail. Wizard form state is untouched because it lives in the shared
  `identity-correction/layout.tsx`, which stays mounted across replace navigations.
- Submit still lands on the correction-detail confirmation screen. Back stack afterwards is
  just `Job Saya → correction-detail`, so **one back press returns to "Job Saya" home**.
- `identity-correction/layout.tsx`: "Aksi tidak tersedia" fallback button now `router.replace`s
  to the job detail rather than `router.back()`.

### Known tradeoff
The device/browser hardware-back **gesture** used mid-wizard now exits to "Job Saya" instead of
stepping back one wizard step. The in-app header back arrow steps back correctly. This matches the
plan's explicitly-sanctioned "router.replace per step" option and is standard mobile task-flow
behavior.

---

## Verification

### Typecheck

| Package | Result |
|---|---|
| apps/portal | **PASS** (`tsc --noEmit`) |
| apps/api | **PASS** (`tsc --noEmit`) |
| apps/tech-pwa | **PASS** (`tsc --noEmit`) |

### Automated tests

| Suite | Result |
|---|---|
| apps/portal (`vitest run`) | **PASS** — 15 files, 139 tests |
| apps/tech-pwa (`vitest run`) | **PASS** — 1 file, 3 tests |
| apps/api — `calibration-jobs.service.test.ts` + `work-orders.service.test.ts` | **PASS** — 139 tests (incl. new test: list surfaces the most-recent Identity Correction per row) |
| apps/api — full suite | Pre-existing **unrelated failures** only: IMAP sync, emails, push/notification-dispatch, chat markRead, whitelist registration-origin. None touch calibration-jobs or work-orders code. |

### Manual verification — STILL TO DO (browser, not runnable in this environment)

1. **Portal, two browser tabs.** Open Calibration Jobs list (and/or a Work Order detail) in tab A;
   approve/reject an Identity Correction in tab B. Confirm tab A's badge/column changes within
   ~6 s, with no manual refresh.
2. **tech-pwa.** Complete the 5-step Identity Correction wizard and submit → lands on correction
   detail → **one** back press reaches "Job Saya" home. Before submitting, confirm the header back
   arrow still walks step 5 → 4 → 3 → 2 → 1 with form data intact.

### Explicitly out of scope (untouched)
FCM/push notification, notification bell badge.

---

## Files changed

```
apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts
apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts
apps/api/src/modules/work-orders/work-orders.service.ts
apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx
apps/portal/src/app/management/calibration-jobs/calibration-jobs-page-client.tsx
apps/portal/src/app/management/calibration-jobs/use-calibration-jobs-query.ts
apps/portal/src/app/management/calibration-jobs/use-identity-corrections-query.ts
apps/portal/src/app/management/work-orders/work-orders-ui.tsx
apps/portal/src/app/management/work-orders/[id]/page.tsx
apps/portal/src/app/management/work-orders/[id]/edit/page.tsx
apps/portal/src/app/management/work-orders/use-work-orders-query.ts
apps/tech-pwa/src/components/layout/screen.tsx
apps/tech-pwa/src/components/layout/app-header.tsx
apps/tech-pwa/src/app/jobs/[id]/page.tsx
apps/tech-pwa/src/app/jobs/[id]/identity-correction/layout.tsx
apps/tech-pwa/src/app/jobs/[id]/identity-correction/page.tsx
apps/tech-pwa/src/app/jobs/[id]/identity-correction/signature-step.tsx
apps/tech-pwa/src/app/jobs/[id]/identity-correction/signature-technician/page.tsx
apps/tech-pwa/src/app/jobs/[id]/identity-correction/signature-customer/page.tsx
apps/tech-pwa/src/app/jobs/[id]/identity-correction/photo/page.tsx
apps/tech-pwa/src/app/jobs/[id]/identity-correction/review/page.tsx
```
