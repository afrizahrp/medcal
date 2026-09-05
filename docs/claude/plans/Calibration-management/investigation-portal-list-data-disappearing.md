# Investigation: Portal List Data Disappearing After Navigation

## Summary

Both symptoms trace back to **one shared, systemic defect** in the "Management List canonical
pattern" used across `apps/portal`: every URL-paginated list page keeps `page`, `pageSize`, and
its filters *only* in the URL query string (`useUrlQueryState`), writes them with
`router.replace(...)` (never `router.push`), and never reconciles the `page` value against the
live size/order of the underlying dataset. The browser's native Back/Forward is the only
mechanism that restores a stale URL (no in-app code calls `router.back()`), so "navigate away and
come back" very often means "re-request the exact same `page=N` you left on, against data that
may have changed in the meantime." Neither the Equipment Requirements grouped-list endpoint nor
the Price List Items endpoint clamps `page` to `totalPages`, and neither React Query hook
overrides the global 15s `staleTime` / default 5‑minute `gcTime`, so a stale page number is
requested exactly as-is. Two variants of the same defect explain both reports: (a) the requested
page number now exceeds the shrunken `totalPages`, so the API returns `data: []` and the page
renders its normal empty state (**Price List Item** — "appeared empty"); (b) the requested page is
still in range, but the underlying, alphabetically/positionally ordered dataset gained or lost
entries elsewhere, silently displacing one specific row to a different page (**Equipment
Requirements** — "Bed Side Monitor" missing). This is not two bugs; it is one defect class in a
pattern reused, unmodified, by **22 list pages** in the Portal — all of them are equally exposed,
whether or not anyone has reported it yet.

## Step 1 — Symptom Characterization

### Equipment Requirements
- Page: [equipment-requirements-page-client.tsx](apps/portal/src/app/management/equipment-requirements/equipment-requirements-page-client.tsx), route wrapper [page.tsx](apps/portal/src/app/management/equipment-requirements/page.tsx) (wraps the client component in `<Suspense>` — full unmount/remount on route change, no keep-alive).
- Data hook: [use-equipment-requirements-query.ts:20-33](apps/portal/src/app/management/equipment-requirements/use-equipment-requirements-query.ts#L20-L33):
  ```ts
  queryKey: [EQUIPMENT_REQUIREMENTS_QUERY_KEY, "grouped", trimmed, params.page, params.pageSize]
  ```
  `search`, `page`, and `pageSize` are all in the key — no key-collision, no missing variable.
- `page`/`pageSize`/`search`/`expanded` are read straight from the URL every render
  ([equipment-requirements-page-client.tsx:39-41](apps/portal/src/app/management/equipment-requirements/equipment-requirements-page-client.tsx#L39-L41)):
  ```ts
  const committedSearch = params.search ?? "";
  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 10;
  ```
  There is **no code anywhere that clamps `page` to the response's `totalPages`** — confirmed by
  reading the full component and the stateless `PaginationBar` in
  [leads-ui.tsx:976-1041](apps/portal/src/app/management/leads/leads-ui.tsx#L976-L1041) (pure
  props-in, callbacks-out; no internal state, no bounds checking).
- Backend: [device-type-equipment-requirements.service.ts:197-252](apps/api/src/modules/equipment/device-type-equipment-requirements.service.ts#L197-L252)
  (`findAllGroupedByDeviceType`) re-fetches **every** matching requirement row on each call,
  groups them client-side into a `Map` keyed by `deviceType.id` in the order rows come back
  (`orderBy: [{deviceType:{name:"asc"}}, {sortOrder:"asc"}, {equipmentType:{name:"asc"}}]`), then
  paginates the **groups** (not the rows) by simple array `slice((page-1)*pageSize, ...)`. Group
  order is deterministic for a fixed dataset, but is **not stable across dataset changes**: adding
  a new device-type/requirement whose device-type name sorts before an existing one shifts every
  later group's position by one. A device type sitting at the last slot of page 1 can silently
  fall onto page 2 with no signal to the client other than the total count text.

### Price List Item
- Page: [price-list-items-page-client.tsx](apps/portal/src/app/management/price-list-items/price-list-items-page-client.tsx) (rendered title "Price List", route `/management/price-list-items`), wrapped the same way in `<Suspense>`.
- Data hook: [use-price-list-items-query.ts:57-75](apps/portal/src/app/management/price-list-items/use-price-list-items-query.ts#L57-L75):
  ```ts
  queryKey: [PRICE_LIST_ITEMS_QUERY_KEY, params.search, params.deviceTypeId, params.isActive,
             params.sortBy, params.sortDir, params.page, params.pageSize]
  ```
  Again, every filter/sort/pagination variable is present — no key collision.
- `page`/filters read straight from the URL
  ([price-list-items-page-client.tsx:164-168](apps/portal/src/app/management/price-list-items/price-list-items-page-client.tsx#L164-L168)),
  with the same absence of any `page`-vs-`totalPages` clamp.
- Backend: [price-list-items.service.ts:180-230](apps/api/src/modules/price-list-items/price-list-items.service.ts#L180-L230)
  (`findAll`) does a standard `count` + `skip`/`take` query. If `page` exceeds the now-current
  `totalPages` (e.g. an item was deactivated/deleted, or a filter that used to match more rows now
  matches fewer), `findMany` legitimately returns `data: []` while `total`/`totalPages` still
  reflect the smaller, correct numbers — the client just renders `rows.length === 0 →
  "Belum ada tarif."` ([price-list-items-page-client.tsx:453-454](apps/portal/src/app/management/price-list-items/price-list-items-page-client.tsx#L453-L454)), i.e. a fully populated resource rendering as a completely empty table. This is an exact mechanical match for the reported symptom ("showed all data initially, then appeared empty after navigating to another page and back").

### Navigation/lifecycle facts common to both
- `useUrlQueryState` ([use-url-query-state.ts](apps/portal/src/hooks/use-url-query-state.ts)) always calls **`router.replace`**, never `router.push` — every filter/page/sort change overwrites the *current* history entry rather than adding a new one. That means the browser history entry for `/equipment-requirements` (or `/price-list-items`) always holds the *last* params the user had, not page 1 / no-filter defaults.
- No file in `apps/portal/src` calls `router.back()` — confirmed via repo-wide search. So the only way a user lands back on a stale, non-default URL for these pages is the **browser's native Back/Forward** (or a bookmarked/shared link) — both of which replay that last-held query string verbatim, including an out-of-range or since-displaced `page`.
- Both page-client components fully unmount on navigation away (they're plain routed `<Suspense>` children, not kept alive), so all local `useState` (search input text, add-panel state, edit state) resets — this is expected/by-design per the pattern's own doc comment ("the URL is the single source of truth… callers should not also hold them in useState"). The bug is not about component state loss; it's about the URL-sourced `page` being replayed against data that has since moved.
- Global `QueryClient` defaults ([providers.tsx:40-61](apps/portal/src/app/providers.tsx#L40-L61)): `staleTime: 15_000`, `refetchOnWindowFocus: false`, `gcTime` left at the TanStack v5 default (5 minutes). Neither hook overrides this. This is a secondary factor (see Step 3) — it governs whether a return visit shows a loading flash before refetching, not whether the refetched data is wrong.

## Step 2 — Shared Mechanism & Blast Radius

**Confirmed shared, not coincidental.** Both pages are built from the same "Management List
canonical pattern" (explicitly named/dated 2026-08-18 in a comment in `use-url-query-state.ts`):

- [`useUrlQueryState`](apps/portal/src/hooks/use-url-query-state.ts) — URL-as-source-of-truth for filter/sort/page keys, `router.replace`-only.
- [`useDebouncedValue`](apps/portal/src/hooks/use-debounced-value.ts) — debounces the search box before committing it to the URL.
- [`useTableSort`](apps/portal/src/hooks/use-table-sort.ts) — URL-derived sort state (used by Price List Items, not by Equipment Requirements, which has no sort UI).
- A per-resource `use-<resource>-query.ts` file, each hand-written but structurally identical: one `useQuery` whose `queryKey` embeds every filter/sort/page/pageSize value, `placeholderData: (previous) => previous` for smooth in-page transitions, and mutations that `invalidateQueries` on a shared key prefix.
- [`PaginationBar`](apps/portal/src/app/management/leads/leads-ui.tsx#L976-L1041) — one stateless, props-driven pagination control, re-exported/imported by every list page. It never clamps `page`; it is pure UI.

There is **no single generic `useListQuery`/`useResourceList` hook** — each resource re-implements
the same shape by hand — but the *shape itself* is uniform, and the missing piece (page/data
reconciliation) is missing identically everywhere because it was never part of the pattern to
begin with.

**Blast radius** — every page using `useUrlQueryState` with a `page`/`pageSize` key is exposed to
the same class of bug (confirmed via direct import search across `apps/portal/src`):

```
calibration-jobs, calibration-requests, customers, device-calibration-parameters,
device-capabilities, device-categories, device-models, device-type-aliases, device-types,
devices, email, equipment-requirements, equipment-types, equipment-units, leads,
price-list-items, purchase-orders, quotations, tax, uoms, users, work-orders
```

All 22 are equally capable of showing a stale `page=N` (or a filter combination) against a
dataset whose composition changed since the URL was last written — most will show it as
"the list looks empty" (Price List Item's variant); pages whose rows are grouped/ordered by a
value other people can insert ahead of (name, date, sort order) can additionally show it as
"one specific row went missing" (Equipment Requirements' variant) without the whole page going
blank.

Only `leads` (`use-contact-messages-query.ts`) deviates from the shared default cache behavior —
it explicitly sets `refetchOnMount: "always"` and a longer 5‑minute `staleTime` for some queries.
Neither target page has any such override; both rely purely on the global `Providers` defaults.

## Step 3 — Root Cause

Ranked by evidence strength:

1. **(Highest confidence, mechanically demonstrated for both pages) Unclamped, URL-persisted
   `page` replayed against a live-recomputed dataset.** `page`/`pageSize`/filters live only in the
   URL, written via `router.replace` (so the browser history entry for this route always holds
   the *last* state, not a default), and are read back verbatim on every mount with no check
   against the response's own `totalPages`. Browser Back/Forward (the only way stale query
   strings resurface, since no code calls `router.back()`) can therefore reissue a query for a
   page number that:
   - **no longer exists** → API returns `data: []`, UI shows its normal empty-state text → reads
     as "the whole list disappeared" (matches the Price List Item report exactly: `skip`/`take`
     over a shrunk `total` yields zero rows while `totalPages` correctly reports fewer pages).
   - **still exists, but now holds different rows** because the grouped/ordered dataset gained or
     lost entries ahead of a given row's position (Equipment Requirements groups by device-type
     name; Price List Items defaults to sorting by `effectiveFrom desc`) → that one row is now on
     a different page and simply isn't in the slice being displayed → reads as "this one device
     disappeared" (matches the Equipment Requirements report).

   This single mechanism, present identically in both hooks/components, explains both reports
   without needing two separate causes.

2. **(Secondary, compounding factor — not sufcient alone) Default cache lifetime.** `gcTime` is
   left at the TanStack default (5 minutes) and is never overridden for either hook
   ([providers.tsx:40-61](apps/portal/src/app/providers.tsx#L40-L61)). If the user is away for
   more than 5 minutes, the previous page's cache entry for that exact `queryKey` is evicted, so
   the return visit always triggers a real refetch (rather than serving instantly-stale-but-cached
   data) before anything renders. On its own this only produces an extra loading flash — it does
   not make data vanish — but it does mean *every* return visit past 5 minutes is a full,
   unmediated re-request straight against current server state, which is exactly the condition
   under which cause (1) bites.

3. **(Lowest confidence — plausible but unverified without a live repro) Optimistic
   reorder cache writes possibly touching unrelated cache entries.**
   `useReorderEquipmentRequirements`'s `onMutate` ([use-equipment-requirements-query.ts:93-116](apps/portal/src/app/management/equipment-requirements/use-equipment-requirements-query.ts#L93-L116))
   calls `queryClient.setQueriesData({ queryKey: GROUPED_KEY }, ...)`, which matches **every**
   cached `["equipment-requirements", "grouped", ...]` entry regardless of its `search`/`page`
   value, and rewrites the `deviceType.id`-matching group in each. This is intentional (it's meant
   to keep every open view in sync) and looks internally consistent for the common case, but it
   was not exercised against a concrete failing repro in this investigation — flagged here as a
   secondary hypothesis worth a closer look if cause (1) turns out not to fully explain a specific
   report.

## Step 4 — Suggested Fix Directions (not implemented)

Because the root cause lives in the shared pattern, not in either page individually, **a single
fix applied once has leverage over all 22 pages in the blast-radius list** — this is the
highest-leverage option and should be prioritized over a page-local patch.

1. **Clamp `page` to the response's `totalPages` (highest leverage, recommended first).** In the
   shared pieces of the pattern — either inside `useUrlQueryState`/a small wrapper, or inside each
   `use-<resource>-query.ts`'s consuming component right after `query.data` resolves — detect
   `page > result.totalPages` and correct the URL (`setParams({ page: undefined })` or the last
   valid page) instead of rendering the empty/displaced result as-is. Trade-off: needs to run once
   per resource's page-client (or be lifted into a small shared hook, e.g. `usePaginationSync`),
   but the fix is mechanical and low-risk, and immediately protects all 22 pages once adopted.

2. **Make `PaginationBar`/the pattern surface "your view has changed" instead of silently
   clamping.** Rather than (or in addition to) auto-correcting, show a lightweight banner ("Data
   telah berubah — halaman disesuaikan ke halaman terakhir yang tersedia") when a clamp occurs, so
   users don't wonder whether a record was actually deleted. Slightly more UI work than option 1
   but resolves the *trust* problem, not just the mechanics.

3. **Revisit `router.replace`-only history writes.** Switching the *first* filter/page change per
   visit to `router.push` (keeping subsequent same-visit changes as `replace`) would mean Back
   returns to the page's clean/default state rather than replaying the exact last-held params,
   reducing how often a stale `page` is replayed at all. This addresses the *trigger* rather than
   the underlying missing reconciliation, so it should be paired with (1), not used as a
   substitute for it — a fresh page load (not via Back) can still race against a dataset change
   from another user/tab.

If only one thing is fixed, it should be **(1)**, ideally hoisted into a small shared helper
(`useUrlQueryState` callers, or a thin `usePaginatedQuery` wrapper around the existing
per-resource hooks) rather than copy-pasted into all 22 page-clients — that keeps the "single fix,
all pages benefit" property that makes this defect worth fixing at the pattern level instead of
per-symptom.
