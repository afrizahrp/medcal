# Tech-PWA Phase 3 — UX-16 Implementation (Search + Status Filter, Unit/Device List)

Implementation date: 2026-09-29
Source of truth: `docs/audits/tech-pwa-ux-16-high-volume-device-list-audit.md` (recommended direction H — status filter combined with name search).
Scope: `DeviceList` in `apps/tech-pwa/src/app/jobs/jobs-ui.tsx` and its pure filter logic in `apps/tech-pwa/src/lib/calibration/job-display.ts` only.

---

## 1. Executive Summary

Implemented exactly the two items the UX-16 audit recommended (§12, direction H) and nothing else: a debounced name search and a three-way status filter (Semua / Belum selesai / Selesai) at the `DeviceList` (Unit/Device list) level of the Customer → SPK → Unit drill-down. Both are pure, view-level, client-side filters over the already-fetched unit array for the active SPK; the Customer/SPK aggregate counts, `isJobDone`, `unitOrdinal` ordering, `UnitRow` content/navigation, and the entire data-fetching architecture (`useJobsQuery`/`fetchAllAssignedJobs`) are untouched. No server-side search/status params were wired in, per the constraint to prefer the client-side approach since the full dataset is already fetched client-side for aggregation. No blocker was hit.

---

## 2. UX-16 Problem

Per the audit: `DeviceList` renders every unit for the active SPK in one unfiltered `.map()`, with no way to narrow by name or jump to unfinished work. At 100+ units, `customerDeclaredDeviceName` frequently collides across sibling units (e.g. qty-based fan-out), and there was no tool to find "the unfinished ones" other than scrolling and re-reading every card.

---

## 3. Implementation Approach

- Added a pure function `filterUnits(jobs, { search, status })` in `apps/tech-pwa/src/lib/calibration/job-display.ts`, mirroring the existing pure-logic extraction pattern used by `finalizeWorkOrderGroup`/`groupJobsByCustomer` in the same file (and `unsaved-changes-guard-logic.ts`/`query-group-state.ts` from Phase 1/2).
- Added local component state (`useState` for raw search + status, `useDebouncedValue` for the committed search term — the same hook and 500ms delay already used by Job Detail's device-lookup search) inside `DeviceList` in `apps/tech-pwa/src/app/jobs/jobs-ui.tsx`.
- Added `"use client"` to `jobs-ui.tsx` (it now uses `useState`/hooks directly; it was previously a pure presentational file rendered only inside the already-`"use client"` `page.tsx`).
- No changes to `use-jobs-query.ts`, `page.tsx`'s query wiring, or any API call — `spk.jobs` (already fully fetched and grouped client-side) is filtered in-memory for display only.

---

## 4. Search Implementation

- Input: `<input type="search" inputMode="search" className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm" placeholder="Cari nama alat…" />` — reuses the exact input pattern/classes from `AssignedDeviceSection`'s device-lookup search in `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx` (lines ~169–176).
- Debounced via `useDebouncedValue(search, 500)` (`apps/tech-pwa/src/hooks/use-debounced-value.ts`), the same hook/delay Job Detail already uses for `debouncedDeviceSearch`.
- Matches only `customerDeclaredDeviceName` (via the existing `declaredDeviceName()` helper) — no serial/brand/model/device-code search, no DTO expansion, per scope.
- Case-insensitive: both the search term and the candidate name are lower-cased before `.includes()`.
- Empty/whitespace-only search performs no name filtering (`term === "" ? true : ...`).

---

## 5. Status Filter Implementation

- Three buttons (Semua / Belum selesai / Selesai), default `"ALL"`, rendered as a `min-h-11` row of toggle buttons (`aria-pressed`) directly reusing `isJobDone` semantics via `filterUnits`'s `status` branch — no new status enum, no reinterpretation of `ACCEPTED_BY_QA`.
- `UnitStatusFilter` type (`"ALL" | "OPEN" | "DONE"`) added to `job-display.ts` alongside `filterUnits`.

---

## 6. Filter/Search Interaction

`visibleUnits = filterUnits(spk.jobs, { search: debouncedSearch, status: statusFilter })` — `filterUnits` applies `.filter(matchesSearch).filter(matchesStatus)` in sequence (AND semantics), returns a new array, never mutates `spk.jobs` or any job object, and preserves the input array's order (the audit-noted `unitOrdinal` ascending order, established upstream by `finalizeWorkOrderGroup`).

---

## 7. Empty State

When `visibleUnits.length === 0` and a filter is active (non-empty debounced search or `statusFilter !== "ALL"`), `DeviceList` renders the existing `EmptyState` primitive (`components/ui/state-views.tsx`) with Indonesian copy: "Tidak ada unit yang cocok dengan pencarian/filter." / "Ubah kata kunci pencarian atau pilih Semua untuk melihat semua unit." Recovery is the same visible search box (clear it) and status buttons (tap Semua) — no separate reset control was needed since both inputs stay on-screen. The pre-existing "no units at all" empty behavior (handled entirely upstream in `page.tsx` via `data.data.length === 0`) is untouched — that check runs before `DeviceList` is ever reached.

---

## 8. Files Changed

- `D:\medcal\apps\tech-pwa\src\lib\calibration\job-display.ts` — added `UnitStatusFilter` type + `filterUnits()` pure function (+27 lines).
- `D:\medcal\apps\tech-pwa\src\app\jobs\jobs-ui.tsx` — added `"use client"`, search input + status filter buttons + empty state inside `DeviceList`, `key={spk.workOrderId}` on the `DeviceList` call site (+63/-3 lines).
- `D:\medcal\apps\tech-pwa\src\lib\calibration\job-display.test.ts` — added `describe("filterUnits", …)` block, 11 new tests (+91 lines).

No other files were created or modified.

---

## 9. Tests Added/Updated

Added to `job-display.test.ts` (existing `isJobDone`/`groupJobsByCustomer` tests untouched, not weakened):

1. Default/ALL returns every unit.
2. DONE returns only `isJobDone === true` units.
3. OPEN returns only `isJobDone === false` units.
4. Empty/whitespace search does not filter by name.
5. Search matches `customerDeclaredDeviceName`.
6. Search is case-insensitive.
7. Search + status combine with AND semantics.
8. `unitOrdinal` order (of the input array) is preserved in filtered output, even when the input isn't itself ordinal-sorted.
9. Filtering does not mutate the source array or job objects (deep-equality snapshot comparison).
10. No-match case returns `[]`.
11. Explicit "empty search + ALL status = no filtering" combined-default check.

`UnitRow` navigation (`href={`/jobs/${job.id}`}`) was verified unchanged by diff review — no lines inside `UnitRow` were touched.

---

## 10. Full Test Results

```
pnpm --filter @medcal/tech-pwa exec vitest run
 Test Files  11 passed (11)
      Tests  168 passed (168)
   Duration  6.64s
```

Focused run of the changed file:
```
pnpm --filter @medcal/tech-pwa exec vitest run src/lib/calibration/job-display.test.ts
 Test Files  1 passed (1)
      Tests  14 passed (14)
```
(14 = 3 pre-existing `isJobDone`/`groupJobsByCustomer` tests + 11 new `filterUnits` tests.)

No test was deleted, skipped, or weakened. No output was piped through grep/sort/awk/head/tail.

---

## 11. Typecheck/Build Results

- `pnpm --filter @medcal/tech-pwa exec tsc --noEmit` — exit 0, no output (clean).
- `pnpm --filter @medcal/tech-pwa run build` — exit 0. Next.js 16.2.12 (Turbopack): "Compiled successfully", TypeScript pass finished, all 6 static/dynamic routes generated including `/jobs` and `/jobs/[id]` and its subroutes, no errors or warnings.

---

## 12. Regression Verification

- **Customer/SPK aggregate counts**: still computed from the full dataset. `page.tsx` line 62: `const customers = data ? groupJobsByCustomer(data.data) : []` — `data.data` is the full `fetchAllAssignedJobs()` result, untouched by this change. `CustomerList`/`SpkList` read `customer.deviceCount`/`spk.jobs.length`/`doneCount`/`openCount` from these groups, computed by `finalizeWorkOrderGroup`/`groupJobsByCustomer` over the full `spk.jobs` array — `filterUnits` is called only inside `DeviceList`, downstream of and separate from this aggregation, and only affects which `UnitRow`s render, never `spk.doneCount`/`spk.openCount`/`customer.deviceCount` (those are read directly from `spk`/`customer`, not from `visibleUnits`).
- **`unitOrdinal` order preserved**: `filterUnits` never sorts; it filters over `spk.jobs`, which is already unitOrdinal-sorted by `finalizeWorkOrderGroup` (line 61 in `job-display.ts`, unchanged).
- **`UnitRow` content/navigation unchanged**: no lines inside the `UnitRow` function were touched (diff review confirms only `DeviceList` and the module-level imports/directive changed).
- **Back/home behavior unchanged**: `BackLink`/`Screen`/`AccountMenu` wiring in `page.tsx` untouched.
- **Phase 1 guard untouched**: no Phase 1 file (`use-unsaved-changes-guard.ts`, `confirm-dialog.tsx`, etc.) touched; `/jobs` list has no unsaved-changes surface.
- **Phase 2 untouched**: no Phase 2 file (`measurement-grid.tsx`, `kontrol-alat/page.tsx`, `job-detail-ui.tsx`, etc.) touched.

---

## 13. Business Logic Verification

`isJobDone(job)` in `job-display.ts` (line 11–13) is byte-for-byte unchanged: still `job.status === "ACCEPTED_BY_QA"`. `filterUnits`'s `DONE`/`OPEN` branches call this existing function directly rather than reimplementing the check. No job-state machine, RBAC/capability, API contract, or Prisma schema file was read for editing or modified (nothing under `apps/api` or `packages/db` was touched — confirmed by `git status`).

---

## 14. Phase 1/Phase 2 Verification

`git status --porcelain` after implementation shows only 3 files changed, all in the UX-16 scope: `apps/tech-pwa/src/app/jobs/jobs-ui.tsx`, `apps/tech-pwa/src/lib/calibration/job-display.ts`, `apps/tech-pwa/src/lib/calibration/job-display.test.ts`. None of the Phase 1 files (`hooks/use-unsaved-changes-guard.ts`, `hooks/unsaved-changes-guard-logic.ts`, `components/ui/confirm-dialog.tsx`, `lib/calibration/job-action-confirmations.ts`, `components/global-symbol-picker-host.tsx`, `lib/symbol-picker-placement.ts`, `identity-correction/layout.tsx`) or Phase 2 files (`kontrol-alat/page.tsx`, `physical-check/page.tsx`, `measurements/[parameterId]/page.tsx`, `measurement-grid.tsx`, `nibp-grouped-grid.tsx`, `jobs/[id]/page.tsx`, `lib/calibration/save-status.ts`, `components/ui/save-status-indicator.tsx`, `lib/query-group-state.ts`) appear in the diff.

---

## 15. NIBP/Measurement Verification

No NIBP grid, measurement grid, direct measurement, measurement validation, or measurement save/diff file was read or modified. `UnitRow`'s link target (`/jobs/${job.id}`) — the only connection this screen has to those downstream routes — is unchanged.

---

## 16. Known Limitations

- Search matches only `customerDeclaredDeviceName`; it cannot distinguish same-named sibling units (this is the same inherent pre-identification limitation the audit documented in §7 — not something this phase was scoped to fix).
- The status filter is client-view-only; it does not change what is fetched, polled, or cached.
- Filter state resets whenever the `DeviceList` for a given `workOrderId` unmounts (e.g. navigating back to the SPK list or to a different SPK) — by design, to prevent state leaking across SPKs, but it also means returning to the *same* SPK after visiting a different one does not preserve the previous search/filter (not required by scope; local-state-only was mandated, no persistence requested).

---

## 17. Explicitly Deferred Items (not implemented, per scope)

- Serial/brand/model/device-code search (only `customerDeclaredDeviceName` search implemented).
- Any DTO/API/backend change (no `search`/`status` query params wired into `useJobsQuery`/`fetchAllAssignedJobs`).
- URL query params for search/status filter state.
- Global store (Zustand/Redux) for filter state.
- Pagination, infinite scroll, or virtualization.
- Grouping by device type/category/location.
- Sequential Prev/Next navigation or `/calibration-jobs/:id/siblings` integration.
- Any change to `isJobDone`, the job-state machine, RBAC/capabilities, polling/refetch interval, or API contracts.
- Any change to `UnitRow`'s existing content (ordinal, declared name, status badge, identity-correction badge, "Belum diidentifikasi", chevron/nav) beyond rendering a filtered subset of the same rows.

---

## 18. Final Scope Verification

- Files touched: exactly 3, all inside `apps/tech-pwa/src/app/jobs/` and `apps/tech-pwa/src/lib/calibration/` (list + display-logic + its test file).
- `git status` confirms zero changes under `apps/api`, `packages/db`, or any Phase 1/Phase 2/NIBP/measurement file (the other modified/untracked paths shown by `git status` at session start — `apps/api/scripts/trial-minto-hardjo/*`, `apps/api/src/modules/work-orders/*`, `apps/portal/*`, `packages/db/fixtures/trial-minto-hardjo/*` — predate this task and were not touched by this implementation).
- Vitest: 11 files / 168 tests passed, 0 failed, 0 skipped, full suite.
- Typecheck: clean (`tsc --noEmit`, exit 0, no output).
- Build: clean (`next build`, exit 0, all routes generated).
- Customer/SPK aggregate counts: verified computed from the full `data.data` array via `groupJobsByCustomer`, independent of the new `filterUnits` view-level narrowing (§12).
