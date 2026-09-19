# Implementation Report — Rollout usePaginationSync to Remaining List Pages

**Date:** 2026-09-05
**Type:** Mechanical rollout of an already-validated fix (no new design)
**Branch:** `main`
**Status:** Complete — 19 of 20 candidate pages wired and verified; 1 skipped with reason (documented, not forced in)

---

## 1. Background

`usePaginationSync` (`apps/portal/src/hooks/use-pagination-sync.ts`) and `ViewAdjustedBanner`
(`apps/portal/src/components/ui/view-adjusted-banner.tsx`) were designed and piloted on two
reported bugs — see `investigation-portal-list-data-disappearing.md` for root cause and
`Rollout_PaginationSync_20Pages.md` for this task's scope. The pilot (Equipment Requirements,
Price List Items) clamps a URL-persisted `page` value to the response's own `totalPages` when a
stale page (replayed via browser Back/Forward against data that has since changed) would
otherwise render an out-of-range, misleadingly empty result — and surfaces a banner explaining
the correction. This task wires that same mechanism into the remaining 20 candidate pages, one
at a time, verifying typecheck after each.

## 2. Per-page fit check and outcome

18 of 20 pages matched the standard or grouped shape already proven by the pilot and were wired
without any deviation from the pilot's pattern. 2 pages (`leads`, `email`) matched on
pagination/`totalPages` but diverge structurally from the pilot in ways that changed how the fix
was applied. 1 page (`users`) does not use the query-hook layer this pattern depends on at all.

| Page | Outcome | Notes |
|---|---|---|
| calibration-jobs | Wired | Standard shape |
| calibration-requests | Wired | Standard shape |
| customers | Wired | Hook placed before first of two early returns (`AccessDenied` on `!capabilities`, then `forbidden`) |
| device-calibration-parameters | Wired | Grouped/aggregated `totalPages` (device-type groups), same shape as the Equipment Requirements pilot; empty check is `groups.length === 0` |
| device-capabilities | Wired | Standard shape |
| device-categories | Wired | Standard shape |
| device-models | Wired | Standard shape, plus an unrelated `useDeviceTypes` lookup query (unaffected) |
| device-type-aliases | Wired | Grouped/aggregated `totalPages`, same shape as device-calibration-parameters |
| device-types | Wired | Standard shape |
| devices | Wired | Standard shape |
| email | Wired, reduced guard | See §3 |
| equipment-types | Wired | Standard shape |
| equipment-units | Wired | Standard shape |
| leads | Wired, reduced guard | See §3 |
| purchase-orders | Wired | Standard shape (combined early return `if (!capabilities?.x || forbidden)`) |
| quotations | Wired | Standard shape (combined early return) |
| tax | Wired | Standard shape |
| uoms | Wired | Standard shape |
| **users** | **Skipped** | No TanStack Query hook backs this list — it hand-rolls `fetch` + `useState` (`load()`/`useEffect`/`useCallback`) with no `useQuery`, so there is no `query.data?.totalPages` for `usePaginationSync` to read and no shared cache/`placeholderData` behavior either. `totalPages` genuinely exists in the API response and pagination is genuinely server-side, but adopting the hook here first requires extracting a `useUsers`-style query hook — a small migration, not a mechanical wire-in — so it was left out rather than forced. Recommended as a short follow-up before folding `users` into this pattern. |
| work-orders | Wired | Standard shape (combined early return) |

**19 of 20 pages wired; `users` skipped with reason, not silently.**

## 3. Non-standard pages: `leads` and `email`

Both fit the pagination/`totalPages` precondition but differ from the pilot in three ways that
changed how the fix was applied:

1. **No page-1 URL collapse.** Every standard page's `onPageChange` strips page 1 back to
   `undefined` (`setParams({ page: next <= 1 ? undefined : String(next) })`) to keep the bare-list
   URL clean. `leads` and `email` don't do this (`setParams({ page: String(value) })` unconditionally).
   `onClamp` was written to match each page's own existing dialect rather than silently changing
   pagination-click behavior that was out of this task's scope: `onClamp: (lastPage) => setParams({ page: String(lastPage) })`.
2. **Empty-state rendering is delegated to a child list component**, not an inline ternary in the
   page-client. `leads`' `MessageInboxTable`/`MessageInboxList` and `email`'s `EmailInboxTable`
   each decide their own empty state internally from a `messages`/`rows` prop
   (`leads-ui.tsx:797`/`901`, driven by `messages.length`). The pilot's flash-prevention guard
   (swapping the empty-state branch for a "Menyesuaikan halaman…" message while `didClamp &&
   rows.length === 0`) is a page-client-local ternary and has no equivalent insertion point without
   threading a new prop through those shared components — out of scope for a mechanical rollout.
   **Both pages got the core clamp + banner only, without the anti-flash guard.** The user-visible
   difference: on the pilot pages, a stale page self-corrects with no empty-state flash at all; on
   `leads`/`email`, the child list's normal empty-state can flash for one refetch cycle before the
   corrected page's data arrives, then the banner explains what happened. This is a strictly
   smaller residual than the original bug (permanent empty view) and self-heals automatically.
3. **`email` is a single component mounted from four separate routes** (`inbox/page.tsx`,
   `sent/page.tsx`, `drafts/page.tsx`, `trash/page.tsx`, each just `<EmailFolderPageClient
   folder="..." />`), so this one wiring covers all four folder views at once. It also has an
   extra early return (`sessionStatus === "loading"`) before the capability check; the hook was
   placed before both.
4. `leads` renders two `<PaginationBar>` instances (desktop + mobile) off the same state — the
   banner is rendered once, outside both breakpoint blocks, rather than duplicated per breakpoint.

## 4. Hook-placement gotcha (confirmed across all 19)

Per the pilot's own finding, `usePaginationSync` must be called before every early return in a
component to satisfy the Rules of Hooks. This was checked individually for each page:

- Pages with **query-then-immediate-return** (`customers`, `device-capabilities`,
  `device-categories`, `device-models`, `device-type-aliases`* , `device-types`, `devices`,
  `equipment-types`, `equipment-units`, `tax`, `uoms`): hook inserted between the query call and
  the first `if (!capabilities...) return`, reading `query.data?.totalPages` (or the named query
  variable) directly since the `result` variable isn't declared yet at that point.
- Pages with **combined or later early returns** (`calibration-jobs`, `calibration-requests`,
  `device-calibration-parameters`, `purchase-orders`, `quotations`, `work-orders`, `leads`,
  `email`): `result`/`groups` were already computed before the return, so the hook was inserted
  using `result?.totalPages` right after that point.

(*`device-type-aliases`' early return comes after `result`/`groups` are computed, grouped with the second category.)

No Rules-of-Hooks violations were introduced; each placement was verified by a full `tsc --noEmit` run before moving to the next page (batched in small groups of 1–2 structurally-identical pages per check once the pattern was well-established, per the pilot's confirmed shape).

## 5. Files changed

| File | Nature of change |
|---|---|
| `apps/portal/src/app/management/calibration-jobs/calibration-jobs-page-client.tsx` | Wired |
| `apps/portal/src/app/management/calibration-requests/calibration-requests-page-client.tsx` | Wired |
| `apps/portal/src/app/management/customers/customers-page-client.tsx` | Wired |
| `apps/portal/src/app/management/device-calibration-parameters/device-calibration-parameters-page-client.tsx` | Wired (grouped) |
| `apps/portal/src/app/management/device-capabilities/device-capabilities-page-client.tsx` | Wired |
| `apps/portal/src/app/management/device-categories/device-categories-page-client.tsx` | Wired |
| `apps/portal/src/app/management/device-models/device-models-page-client.tsx` | Wired |
| `apps/portal/src/app/management/device-type-aliases/device-type-aliases-page-client.tsx` | Wired (grouped) |
| `apps/portal/src/app/management/device-types/device-types-page-client.tsx` | Wired |
| `apps/portal/src/app/management/devices/devices-page-client.tsx` | Wired |
| `apps/portal/src/app/management/email/email-page-client.tsx` | Wired, reduced guard (§3) — covers 4 routes |
| `apps/portal/src/app/management/equipment-types/equipment-types-page-client.tsx` | Wired |
| `apps/portal/src/app/management/equipment-units/equipment-units-page-client.tsx` | Wired |
| `apps/portal/src/app/management/leads/leads-page-client.tsx` | Wired, reduced guard (§3) |
| `apps/portal/src/app/management/purchase-orders/purchase-orders-page-client.tsx` | Wired |
| `apps/portal/src/app/management/quotations/quotations-page-client.tsx` | Wired |
| `apps/portal/src/app/management/tax/tax-page-client.tsx` | Wired |
| `apps/portal/src/app/management/uoms/uoms-page-client.tsx` | Wired |
| `apps/portal/src/app/management/work-orders/work-orders-page-client.tsx` | Wired |

Not modified (per scope lock): `use-pagination-sync.ts`, `view-adjusted-banner.tsx`, the two
pilot page-clients (Equipment Requirements, Price List Items), any file under `apps/tech-pwa`,
and any API file. `apps/portal/src/app/management/users/` was left untouched — see §2.

`apps/portal/tsconfig.tsbuildinfo` was also touched, as an incidental side effect of running
`tsc`/`next build` repeatedly during this task — not a source change.

## 6. Verification

| Check | Result |
|---|---|
| `apps/portal` typecheck (`tsc --noEmit`) | ✅ pass — run after every page (or small batch of structurally-identical pages), zero errors at each step and at the end |
| `apps/portal` test suite (`vitest run`) | ✅ **14 test files / 112 tests passed** (unchanged from the pilot — this rollout added no new hook logic to unit-test, only wiring) |
| `apps/portal` production build (`next build`, Turbopack) | ✅ compiled successfully, all **55 routes** generated with no errors, including all four `email` folder routes and all 18 wired management list routes |

No visual/browser click-through was performed (no browser automation tool available in this
environment, consistent with the pilot's own verification limits) — verification is typecheck +
test suite + production build, plus manual code-level tracing of each wiring against its page's
actual early-return/hook-call order.

## 7. Outcome

`usePaginationSync` + `ViewAdjustedBanner` now cover 19 of the 20 Portal Management List pages in
the original blast-radius list (20 candidates minus `price-list-items`/`equipment-requirements`,
which were the pilot, already done in a prior task) — every one of them now clamps a stale
`page` to the real last valid page and tells the user when it did, instead of silently rendering
an empty or displaced list. Only `users` remains unfixed, blocked on a small prerequisite
migration (extracting a proper `useUsers` query hook) rather than a limitation of the pattern
itself.
