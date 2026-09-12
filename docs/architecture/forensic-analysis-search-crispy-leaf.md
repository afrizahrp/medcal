# Canonical MedCal Management List Pattern — Implementation Plan

## Context

The forensic report (previously produced in this same file, now superseded) audited `server-bi-erp`'s `sales_invoiceHd` service, `easy-app`'s Sales Invoice list, and MedCal's current Leads page. It found MedCal's search/filter/pagination logic is mostly sound (AND/OR semantics correct, count/data queries already consistent) but has no debounce, no request cancellation, no keepPreviousData equivalent, no real sorting, and no URL-synced state. The task now is to fix these gaps **while establishing a reusable architecture** other management pages (starting with calibration management) can adopt without inventing a second data-fetching paradigm.

Key fact confirmed by fresh exploration: the Leads page's main table does **not** call `GET /leads` — it calls `GET /contact-messages` (contact-messages is the actual searchable/paginated resource; `/leads/needs-review` and `/contact-messages/statistics` are separate, unfiltered, unpaginated fetches). Per user decision, the new base-schema + sortBy/sortDir pattern will be applied to **both** `leadListQuerySchema` and `contactMessageListQuerySchema` for consistency, even though only the contact-messages side is exercised by today's UI.

Canonical default page size: **10** (frontend's current value becomes the single source of truth; backend's dead `DEFAULT_PAGE_SIZE=20` is corrected to 10).

No TanStack Query, SWR, or debounce utility exists anywhere in the repo today (confirmed via grep). `apps/portal/src/app/layout.tsx` has zero providers — a client `providers.tsx` wrapper must be created from scratch. There is no existing URL-state-for-filters pattern in the app; this will be the first.

## Architecture

```
Search Input (raw keystrokes, local state)
     │
     ├─ debounced 500ms ──► committed `search` (resets page)
     │
Filters (status/getFrom/topicId) ──► immediate (resets page)
Sorting (sortBy/sortDir) ──────────► immediate (does NOT reset page)
Pagination (page/pageSize) ────────► pageSize change resets page
                       │
                       ▼
              URL query params (useSearchParams + router.replace, shallow)
                       │
                       ▼
              useContactMessagesQuery({ search, status, getFrom, topicId,
                                         sortBy, sortDir, page, pageSize })
                       │
                       ▼
              TanStack Query (queryKey = every param above + companyId scope
                               implicit via session; placeholderData keeps
                               previous page/result visible during refetch)
                       │
                       ▼
                 apiFetch → GET /contact-messages?...
                       │
                       ▼
              where(filters) AND (search OR-across-fields)
              ORDER BY whitelisted sortBy sortDir
              same where used for count() and findMany()
                       │
                       ▼
              { data, page, pageSize, total, totalPages }
                       │
                       ▼
                 MessageInboxTable / MessageInboxList
                 (loading | fetching | empty | error — 4 distinct states)
```

This becomes the template: **URL state → debounced/immediate local UI state → typed query hook → TanStack Query → API → table with 4 explicit states.** A future `useCalibrationRequestsQuery` follows the identical shape.

## Backend changes

### `packages/shared/src/schemas/index.ts`
- Add `baseListQuerySchema = z.object({ search, page, pageSize, sortBy, sortDir })` factored out of the two existing schemas' common fields (`search`/`page`/`pageSize` already identical; add `sortBy: z.string().optional()`, `sortDir: z.enum(["asc","desc"]).optional()`).
- `leadListQuerySchema` = `baseListQuerySchema.extend({ status, getFrom, topicId })`.
- `contactMessageListQuerySchema` = `baseListQuerySchema.extend({ status: contactStatus, getFrom, topicId })`.
- Export `LEAD_SORTABLE_FIELDS = ["createdAt","name","status"] as const` and `CONTACT_MESSAGE_SORTABLE_FIELDS = ["createdAt","name","status"] as const` (confirmed against `packages/db/prisma/schema.prisma:415-439,478-499` — both `ContactMessage` and `Lead` models have `createdAt`, `name`, `status`). Don't validate `sortBy` against these in Zod (keep it a plain optional string there); whitelist enforcement belongs in the service layer per the forensic report's explicit warning about `sales_invoiceHd`'s ambiguous-default bug — Zod just shapes the wire format, the service is the trust boundary.

### New shared sort helper
- `apps/api/src/common/sort-query.ts` (new, small, not over-generalized): `resolveSortOrder<T extends string>(allowed: readonly T[], sortBy?: string, sortDir?: string, fallback: T): { field: T; dir: "asc"|"desc" }`. Explicit unambiguous default: if `sortBy` not in `allowed`, use `fallback`; `dir` defaults to `"desc"` only when `sortDir` is exactly `undefined`, otherwise coerced strictly to `"asc"`/`"desc"` (fixes the `sortFieldBy.ts` ambiguity called out in the forensic report). This is deliberately NOT a generic where-builder — just the sort-whitelist piece, per instruction #16 to avoid premature abstraction.

### `apps/api/src/modules/contact-messages/contact-messages.service.ts`
- `findAll`: replace hardcoded `orderBy: { createdAt: "desc" }` with `resolveSortOrder(CONTACT_MESSAGE_SORTABLE_FIELDS, query.sortBy, query.sortDir, "createdAt")`.
- Change `DEFAULT_PAGE_SIZE` from 20 → 10 (contact-messages.service.ts:14).
- Add `totalPages: Math.ceil(total / pageSize)` to `ContactMessageListResult` return (keep existing `data/page/pageSize/total` fields — additive, not a breaking rename per instruction #14).
- Where-clause construction unchanged (already correct per forensic report — same `where` object for count+data).

### `apps/api/src/modules/leads/leads.service.ts`
- Same treatment: `resolveSortOrder(LEAD_SORTABLE_FIELDS, ...)`, add `totalPages` to `LeadListResult`, align default page size to 10.

### Controllers (`leads.controller.ts`, `contact-messages-query.controller.ts`)
- No structural change — they already `safeParse` the Zod schema and pass through; the extended schema fields flow automatically. Just confirm after schema change that `parsed.data` typing still lines up (TypeScript will catch this at build).

## Frontend changes

### New dependency
- Add `@tanstack/react-query` to `apps/portal/package.json` `dependencies` (confirmed correct location — portal-only concern, matches how `next`/`react`/`socket.io-client` are declared directly there rather than hoisted).
- No debounce package added — implement a small local `useDebouncedValue<T>(value, delayMs)` hook instead (≈10 lines); adding a dependency for one hook isn't justified when nothing else in the repo needs it.

### `apps/portal/src/app/providers.tsx` (new)
- `"use client"` component creating a single `QueryClient` (via `useState(() => new QueryClient(...))` to avoid recreating on every render) with sane defaults (`staleTime` short, e.g. 15s, matching contact-messages' higher change-frequency vs. easy-app's 60s sales-invoice reference) wrapped in `QueryClientProvider`. Include React Query Devtools only when `process.env.NODE_ENV === "development"`.
- Import and wrap `{children}` with it in `apps/portal/src/app/layout.tsx` (currently has zero providers — this becomes the one and only provider tree root, ready for future providers like auth/theme if ever added).

### `apps/portal/src/hooks/use-debounced-value.ts` (new)
- Generic reusable debounce hook — lives outside the leads feature folder so calibration management can reuse it later.

### `apps/portal/src/hooks/use-url-query-state.ts` (new, small)
- Thin wrapper around `useSearchParams`/`useRouter`/`usePathname` (`next/navigation`) to read/write a typed subset of query params via `router.replace(..., { scroll: false })` (shallow, no history spam — verified Next 16 App Router supports this). Not a giant generic state-sync library; just enough to serialize/deserialize the 7 leads-list params (`search,status,getFrom,topicId,sortBy,sortDir,page,pageSize`) to/from the URL, matching instruction #21's "smallest coherent architectural change."

### `apps/portal/src/app/management/leads/use-contact-messages-query.ts` (new)
- The canonical query hook, named for what it actually fetches (`useContactMessagesQuery`, not `useLeadsQuery` — matches instruction #2's allowance to deviate from the illustrative name since it fetches `/contact-messages`).
- Signature: `useContactMessagesQuery({ search, status, getFrom, topicId, sortBy, sortDir, page, pageSize })`.
- `queryKey: ["contact-messages", search, status, getFrom, topicId, sortBy, sortDir, page, pageSize]` — every param normalized to a stable primitive (empty string vs undefined normalized consistently) before entering the key.
- `queryFn` builds the same `URLSearchParams` logic currently inline in `page.tsx:55-61`, calls `apiFetch`.
- `placeholderData: (prev) => prev` (TanStack Query v5 syntax — the direct `keepPreviousData` equivalent per instruction #7).
- Two sibling hooks in the same file or adjacent: `useNeedsReviewQuery()` and `useContactStatisticsQuery()` — simple parameterless `useQuery`s replacing the other two `apiFetch` calls currently inline in `load()`. This lets `resolve()` become a `useMutation` that calls `queryClient.invalidateQueries` on the three relevant keys instead of manually re-calling `load()` (`page.tsx:97` today) — a cleaner, more idiomatic TanStack pattern that naturally fits instruction #17's "future modules follow the same structure."

### `apps/portal/src/app/management/leads/page.tsx` (rewrite)
- Remove all `useState`/`useCallback`/`useEffect` data-fetching logic (lines 30-80 today).
- Local UI state: `searchInput` (raw) + `useDebouncedValue` → `search` (committed). `status`, `source`, `topicId`, `sortBy`, `sortDir`, `page`, `pageSize` all sourced from `useUrlQueryState` (so URL is the source of truth, not a duplicate `useState`, per instruction #11's "must not create duplicate sources of truth").
- Setter shape mirrors current correct behavior: filter/search setters call the URL-state setter with `page: 1` merged in; page-size setter also resets `page: 1`; sort setter does not touch `page`.
- `resolve()` becomes `useMutation` (see above).
- Render: pass `isFetching` (not just `isLoading`) to `MessageInboxTable`/`MessageInboxList` so a lightweight in-place indicator can show on refetch while `data` (via `placeholderData`) stays rendered — distinct from the true first-load state (`isLoading && !data`).
- Pass `error` (typed) separately from `data` so the table can render its own error row.

### `apps/portal/src/app/management/leads/leads-ui.tsx`
- `MessageInboxTable`/`MessageInboxList`: add a 4th branch — `error` (distinct row/card from `loading` and empty `"Tidak ada pesan."`) per instruction #13. Keep existing loading/empty rows as-is (already correct per forensic report).
- Wire the decorative "Urutkan" control (currently `aria-hidden`, non-interactive, `leads-ui.tsx:465-471`) to real `sortBy`/`sortDir` props + an `onSortChange` callback, matching the desktop table's column-header click-to-sort (need to check if `MessageInboxTable` has clickable headers today — if not, add minimal click handlers on the sortable columns: `createdAt`/`name`/`status`).
- `MessageFilters`: no structural change — already correctly calls `onSearchChange` synchronously; the debounce now lives in `page.tsx` between the raw input and the value handed to `MessageFilters`' `search` prop (i.e. `MessageFilters` continues to be a fully controlled/synchronous component; debouncing happens one level up, keeping this component simple and reusable).

### `apps/portal/next.config.js`
- No change expected — `@tanstack/react-query` is a normal npm dependency, not a workspace package, so it doesn't need adding to `transpilePackages`.

## Files expected to change

- `packages/shared/src/schemas/index.ts` — base schema, sortBy/sortDir, sortable-field const exports.
- `apps/api/src/common/sort-query.ts` — new, whitelist sort resolver.
- `apps/api/src/modules/contact-messages/contact-messages.service.ts` — sorting, page-size default, `totalPages`.
- `apps/api/src/modules/contact-messages/contact-messages.service.test.ts` — update/extend existing tests for sort + totalPages (already `M` in git status, so it's an active test file).
- `apps/api/src/modules/leads/leads.service.ts` — same treatment.
- `apps/portal/package.json` — add `@tanstack/react-query`.
- `apps/portal/src/app/providers.tsx` — new.
- `apps/portal/src/app/layout.tsx` — wrap children in providers.
- `apps/portal/src/hooks/use-debounced-value.ts` — new, reusable.
- `apps/portal/src/hooks/use-url-query-state.ts` — new, reusable.
- `apps/portal/src/app/management/leads/use-contact-messages-query.ts` — new, canonical query hook + siblings.
- `apps/portal/src/app/management/leads/page.tsx` — rewritten to consume the new hooks/URL state.
- `apps/portal/src/app/management/leads/leads-ui.tsx` — error state branch, functional sort control.

## Verification

1. **Backend**: `pnpm --filter @medcal/api typecheck` (or repo's actual typecheck script — confirm exact command from `apps/api/package.json`), run `contact-messages.service.test.ts` and any `leads.service` tests, confirm sort whitelist rejects unknown fields (unit test: `resolveSortOrder` with invalid input falls back to `createdAt desc`), confirm `totalPages` math.
2. **Frontend**: `pnpm --filter @medcal/portal typecheck`, `pnpm --filter @medcal/portal build` (production build catches provider/hook wiring issues Next's dev server might not).
3. **Manual/dev-server run** (use the `run` skill or `pnpm dev`): open `/management/leads`, verify —
   - Rapid typing in search produces exactly one network request ~500ms after the last keystroke (Network tab).
   - Search/filter changes reset to page 1; sort changes don't.
   - Switching filters rapidly doesn't let a stale response flash in (throttle network in devtools, change filter twice quickly, confirm final displayed rows match the *last* selected filter).
   - Table keeps showing previous rows (no flash-to-empty) while a refetch is in flight; only true first load shows the full loading state.
   - Refresh the page mid-filter — URL still reflects search/filter/sort/page, and the view is restored.
   - Browser back/forward moves between prior filter states.
   - Force a backend error (e.g. temporarily break the endpoint or throttle+offline) — table shows a distinct error state, not the empty-result message.
4. Report exact commands run and pass/fail in the final summary, per instruction #20 — do not stop at "looks correct."
