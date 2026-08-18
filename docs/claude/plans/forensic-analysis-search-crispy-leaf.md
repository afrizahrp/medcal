# Search & Filter Behavior Forensic Report

Status: COMPLETE (research only — no code changed, per instructions)

Repos:
- Backend reference: `D:\bi-erp\server-bi-erp` (`sales_invoiceHd` / `sls_InvoiceHd` module)
- Frontend reference: `D:\bi-erp\easy-app` (Sales Invoice list page)
- Target: `d:\medcal` (`apps/api` NestJS + `apps/portal` Next.js, leads/contact-messages feature)

---

## 1. Executive Summary

MedCal's leads/contact-messages list is a minimal, hand-rolled implementation: search fires a full network round-trip **on every keystroke** (no debounce), there is **no request cancellation** (stale responses can overwrite fresh state), filter/page state lives in plain `useState` (lost on refresh, not shareable via URL), and there is **no sorting control** end-to-end (backend hardcodes `orderBy: createdAt desc`). The one thing MedCal already gets right — inherited independently, not copied — is that every filter/search setter correctly calls `setPage(1)` before updating state, so pagination resets are already correct.

`server-bi-erp`'s `sales_invoiceHd` service is the proven backend pattern: single-field `contains`-per-word AND search (not multi-field OR), filters as `AND`-combined equality/IN conditions on joined relations, a whitelisted `orderBy`, and count/data queries built from the literal same `where` object so totals are always consistent with results.

`easy-app`'s Sales Invoice page is the proven frontend pattern: 500ms debounce on free-text search (via `use-debounce`), immediate (non-debounced) filter application, React Query with `placeholderData` (keep-previous-data) so the table never flashes empty during refetch, a query key that encodes every param so cache/refetch stays correct, and a page-reset-on-search rule enforced in exactly one place (the debounce effect) rather than scattered per-filter. Notably, **filter changes and sort changes do NOT reset page** in easy-app — only search does — with a separate out-of-range clamp effect as the safety net. Race-condition protection is implicit (React Query key isolation), not explicit (no AbortController anywhere in either easy-app or MedCal).

The golden behavior for MedCal (Section 7) adopts: debounced search + immediate filters, `placeholderData`-style previous-row retention via React Query, a single-field indexed search or explicit multi-field OR (MedCal's current OR-across-name/email/phone/org is actually **better** than sales_invoiceHd's single-field search and should be kept), a whitelisted sortable column set, and URL-synced filter/page/search state.

---

## 2. server-bi-erp Analysis — `sales_invoiceHd` Service

**Files:**
- Controller: `src/sales/salesInvoice/salesInvoiceHd/salesInvoiceHd.controller.ts`
- DTO: `src/sales/salesInvoice/salesInvoiceHd/dto/paginationSalesInvoiceHd.dto.ts`
- Service: `src/sales/salesInvoice/salesInvoiceHd/salesInvoiceHd.service.ts`
- Where-builder: `src/sales/helper/salesInvoiceWhereCondition.ts`
- Shared search util: `src/utils/query-operator/buildSearchConditon.ts`
- Shared sort util: `src/utils/query-operator/sortFieldBy.ts`

### Search
Finding: search is single-field, word-split, AND-combined `contains`.
Evidence: `buildSearchConditon.ts:2-15`
```js
export function buildSearchCondition(searchBy?, searchTerm?) {
  if (!searchBy || !searchTerm?.trim()) return;
  const words = searchTerm.trim().split(/\s+/);
  return words.map((word) => ({ [searchBy]: { contains: word, mode: 'insensitive' } }));
}
```
Actual behavior: caller supplies `searchBy` (a single field name, **not validated/whitelisted** — unlike `orderBy`) and `searchTerm`. The term is split on whitespace; each word becomes its own `{ [searchBy]: { contains: word, insensitive } }` condition, and these are spread into `whereCondition.AND` in the service (`salesInvoiceHd.service.ts:79-86`) — so a multi-word search term requires **all** words to independently match the **same single field** (AND, not OR-across-fields). There is no multi-column "search box hits name OR email OR phone" pattern here.
Implication for MedCal: MedCal's current `OR` across `name`/`email`/`phone`/`organizationName` (leads.service.ts:50-56) is a different, arguably better UX pattern (typical multi-field search box) and should NOT be replaced with sales_invoiceHd's single-field model — that model exists because the UI lets the user pick which field to search (a `searchBy` dropdown), which MedCal's UI does not offer and doesn't need to.

### Filters
| Filter | Parameter | Type | DB Field | Operator | Default | Nullable | Combinable |
|---|---|---|---|---|---|---|---|
| Company | `company_id` | string[] | `company_id` | `in` + insensitive, **required** (throws if empty) | — | no | AND |
| Paid status | `paidStatus` | string[] | `sys_PaidStatus.name` (relation) | `in`/`equals` insensitive | — | yes | AND |
| PO type | `poType` | string[] | `sls_InvoicePoType.name` (relation) | `in`/`equals` insensitive | — | yes | AND |
| Sales person | `salesPersonName` | string[] | `salesPerson.name` (relation) | `in`/`equals` insensitive | — | yes | AND |
| Period | `startPeriod`/`endPeriod` (`Jan2025` format) | string | `invoiceDate` | `gte`/`lte` | — | yes | AND |

Evidence: `salesInvoiceWhereCondition.ts:34-87`. Dead/unused params confirmed by absence in service destructuring: `customerName`, `po_id`, `ecatalog_id`, `invoiceType(_id)`, `poType_id`, `startDate`/`endDate` are DTO-validated but **never read** by the service (`salesInvoiceHd.service.ts:28-39`).
Implication for MedCal: keep DTOs lean — server-bi-erp's dead-param drift (validated-but-unused fields) is an anti-pattern to avoid, not emulate.

### Search + Filter
Finding: filters and search combine with AND; search itself is internally AND-of-words.
Evidence: `salesInvoiceHd.service.ts:79-86` — `whereCondition.AND` is either created from or appended with `searchConditions`, where `whereCondition` already holds the filter conditions built by `salesInvoiceWhereCondition`.
Actual behavior: conceptually `FILTER_A AND FILTER_B AND (search_word1 AND search_word2 ...)` — no OR at any level in this service.
Implication for MedCal: MedCal's structure (`filters AND (fieldA OR fieldB OR fieldC)` for search) is the more standard/expected UX and should be the template, not sales_invoiceHd's AND-only model.

### Pagination
Evidence: `salesInvoiceHd.service.ts:58-59`
```js
const safeLimit = Math.min(Number(limit) || 10, 100);
const offset = (Number(page) - 1) * safeLimit;
```
Page is 1-indexed. Note a real bug: destructuring default is `limit=20` but the `safeLimit` fallback is `10` — `Number(undefined)||10` always wins when limit is omitted, making the stated "20" default unreachable. Hard cap 100.
Implication for MedCal: use one single source of truth for the default page size (avoid the two-different-defaults bug found here).

### Sorting
Evidence: `sortFieldBy.ts:1-20`, whitelist `allowedSortFields = ['invoice_id','invoiceDate','customerName','po_id','poType_id','salesPersonName','total_amount','paidStatus_id']` (`salesInvoiceHd.service.ts:41-50`). Falls back to `allowedFields[0]` if `orderBy` invalid. Bug found: default `orderDir` param is `'asc'` in the function signature but the body coerces anything not exactly `'asc'` to `'desc'`, meaning if the caller passes `orderDir=undefined` explicitly, output is `'desc'`, contradicting the documented "asc" default.
Implication for MedCal: whitelist sortable fields server-side (never trust client `sortBy`), and keep the default-direction logic simple/unambiguous.

### Count Query
Finding: count, data, and aggregate queries use the **literal same `whereCondition` object reference**.
Evidence: `salesInvoiceHd.service.ts:91-111` — `Promise.all([prisma.count({where: whereCondition}), prisma.findMany({where: whereCondition, ...}), prisma.aggregate({where: whereCondition, ...})])`.
Implication for MedCal: this is already how MedCal's `leads.service.ts:70-85` and `contact-messages.service.ts:260-269` work (confirmed by the MedCal trace) — no gap here, already correct.

### Response Contract
Evidence: `salesInvoiceHd.service.ts:23-27, 117-123` → `{ data: T[]; grandTotal_amount: number; totalRecords: number }`. No `meta.page`/`totalPages` — caller must compute pages from `totalRecords`/`limit` itself.
Implication for MedCal: MedCal should return `totalPages` explicitly rather than making the frontend recompute it (a small ergonomic improvement over the reference).

---

## 3. easy-app Analysis — Sales Invoice List Page

**Files:**
- Page: `app/(dashboard)/(apps)/sales/salesInvoiceHd/list/page.tsx`
- Table: `.../list/list-table/index.tsx`
- Data hook: `queryHooks/sales/useSalesInvoiceHd.ts`
- Search input: `components/ui/search-Input.tsx`
- Search field selector: `components/ui/search-Option.tsx`
- Filter sidebar: `components/FilterSidebarButton/sales/saleslnvoiceFilterSidebar.tsx`
- Generic table shell: `components/ui/data-table.tsx`, `data-table-toolbar.tsx`, `data-table-pagination.tsx`
- Stores: `store/index.ts` (`usePageStore`, `useSearchParamsStore`, `useSalesInvoiceHdFilterStore`, `useMonthYearPeriodStore`)

### Search
Free-text input + a field-selector dropdown (`searchBy`), matching the backend's single-field `contains` model. Evidence: `search-Option.tsx:23-50`, `data-table-toolbar.tsx:80-96`.

### Debounce
Finding: 500ms debounce via `use-debounce`, applied only to the free-text value, not the field selector.
Evidence: `search-Input.tsx:27` — `const [debouncedSearchTerm] = useDebounce(searchTerm, 500);`. Local keystroke state (`searchTerm`) is decoupled from the global store until the debounce settles (effect at lines 29-45), which then also resets page: `setCurrentPage(1)` (line 38).
Implication for MedCal: adopt an identical pattern — local input state for immediate typing feedback, debounced (300-500ms) push to the actual query state, with page reset tied to *that* debounced-value-change effect (a single choke point), not to the raw onChange handler.

### Filters
Finding: filter selection applies immediately (no Apply button), stored in a persisted Zustand store, and does **not** reset page.
Evidence: `saleslnvoiceFilterSidebar.tsx:190-231` (`setSalesInvoiceFilters` called directly on selection); absence of any `setCurrentPage` call in that file or in the filter/period stores.
Implication for MedCal: MedCal's current behavior (every filter setter calls `setPage(1)`) is stricter than easy-app's pattern. Both are defensible; easy-app's approach relies on a separate out-of-range clamp (see Pagination below) as a safety net instead of resetting proactively. Recommendation in Section 7 explains which to keep for MedCal.

### Search + Filter UX
Search and filters are independent state slices (search debounced-only affects itself + page; filters independent, don't touch page). Query key includes both, so any change of either correctly triggers a refetch (`useSalesInvoiceHd.ts:157-185`). No "Apply" button; both act as live filters. Loading is signaled by `isFetching` combined with `placeholderData` retention (no full-page loader after first paint — see Table Behavior).

### Table Behavior
Finding: previous rows are retained during refetch (no flicker), full loader only on true first load, plain-text error, dedicated empty state.
Evidence:
- `useSalesInvoiceHd.ts:259` — `placeholderData: (previousData) => previousData` (React Query v5 keepPreviousData equivalent).
- `page.tsx:95-101` — `if (isFetching && !data) return <LayoutLoader />` (first load only).
- `page.tsx:103-105` — `if (error) return <div>Error fetching invoiceHd: {error.message}</div>` (no retry button, no skeleton).
- `data-table.tsx:184-193` — `"No data filtered"` empty state.
Implication for MedCal: this is the single highest-value UX fix — MedCal currently has no keepPreviousData equivalent (plain useEffect/useState), so every search keystroke or filter change likely flashes the table empty/loading.

### Pagination
Finding: page resets on search only; page-size change also resets page; filter/sort changes do not reset page but are caught by an out-of-range clamp.
Evidence:
- Search reset: `search-Input.tsx:38`.
- Page-size reset: `store/index.ts:105-113` — `setLimit` sets `{ limit, currentPage: 1 }` atomically.
- Clamp safety net: `data-table-pagination.tsx:62-80` — `if (currentPage > calculatedPages) setCurrentPage(calculatedPages > 0 ? calculatedPages : 1)`.
- Page mirrored to URL via manual `window.history.pushState` (`data-table-pagination.tsx:56-58`), read back on mount (`:39-50`), using `next/navigation`'s `useSearchParams`/`useRouter`/`usePathname` for `router.replace`.
Caveat found: `usePageStore`'s page/limit/sorting are **global across all list pages**, not namespaced per feature — a design smell noted for MedCal to avoid (MedCal's per-page `useState` is actually safer here, just missing debounce/cancellation).

### Sorting
Server-side (`manualSorting: true`, `data-table.tsx:124`), TanStack Table `SortingState` shape, mirrored to a `<Select>` on mobile (`page.tsx:181-200`). `orderBy`/`orderDir` derived from `sorting[0]` and included in the React Query key. Sorting change does not reset page (no `setCurrentPage` call in `setSorting`, `store/index.ts:96-104`).

### Loading / Empty State
Covered above under Table Behavior — no skeleton components used anywhere in this flow, only a generic `LayoutLoader` spinner.

### Request Lifecycle
React Query `useQuery` with `staleTime: 60_000`, `retry: 3`, `enabled: isValidRequest && page>=1 && limit>0` (`useSalesInvoiceHd.ts:256-259`). Query key encodes companyIds, module_id, page, limit, searchBy, searchTerm, orderBy, orderDir, filters, and period (`:157-185`) — every input that should trigger a refetch does.

### Race Conditions
**No explicit race-condition protection found.** Grep for `AbortController|cancelToken|signal:` across `app/`, `components/`, `queryHooks/`, `store/` returned zero matches (only `node_modules` type-def noise). Protection is entirely implicit via React Query's query-key isolation: an old in-flight request for an old key resolving late does not visually clobber the UI because the UI reads from the *current* key's cache entry, not from whichever promise resolves last. Duplicate requests for the identical key are deduped by React Query's default behavior, not by any app-level guard.

---

## 4. MedCal Current Behavior

**Files:**
- Backend: `apps/api/src/modules/leads/leads.controller.ts`, `leads.service.ts`; `apps/api/src/modules/contact-messages/contact-messages-query.controller.ts`, `contact-messages.service.ts`
- Shared schema: `packages/shared/src/schemas/index.ts:37-73`
- Frontend: `apps/portal/src/app/management/leads/page.tsx`, `leads-ui.tsx`

### Backend
- DTOs `leadListQuerySchema`/`contactMessageListQuerySchema` (schemas/index.ts:37-46, 62-71) are hand-duplicated (comment at `:59` admits this — "Mirrors leadListQuerySchema's shape").
- Search: OR across `name`/`email`/`phone`/`organizationName`, each `{contains, mode:"insensitive"}` (leads.service.ts:50-56; contact-messages.service.ts:249-256) — genuinely better UX pattern than sales_invoiceHd's single-field model.
- Filters: `status`, `getFrom`, `topicId`; leads filters `getFrom`/`topicId` via nested `contactMessages: { some: {...} } }` relation (leads.service.ts:58-67).
- Count/data queries share the same `where` object (leads.service.ts:70-85) — already correct, no gap.
- Pagination: `DEFAULT_PAGE_SIZE=20` server-side (leads.service.ts:7) is dead code — frontend always sends `pageSize`, initialized to 10 (`page.tsx:40`), so the two defaults silently disagree.
- Sorting: **hardcoded** `orderBy: { createdAt: "desc" }` in both services — no `sortBy`/`sortDir` param exists in either schema at all.
- No shared query-builder utility exists in `apps/api/src/common/` — each service hand-rolls its own where/count/skip/take.

### Frontend
- Search input fires `onSearchChange` synchronously on every keystroke (`leads-ui.tsx:414-423, 478-487`; `page.tsx:113-116`) — **no debounce anywhere** in the flow (grep confirmed no `setTimeout`/`useDebounce`/debounce library).
- Filter/page/search state is plain per-component `useState` (`page.tsx:35-40`), not URL-driven — lost on refresh/back-navigation, not shareable via link.
- All filter and search setters correctly call `setPage(1)` before updating (`page.tsx:113-128`) — pagination reset is already correct and stricter than easy-app's model.
- Data fetching is a plain `useEffect` + `apiFetch` (no React Query/SWR); `apiFetch` (`packages/shared/src/http/api-fetch.ts:18-31`) takes no `AbortSignal` and none is passed at any call site — **no request cancellation, no keepPreviousData equivalent**.
- Table (`MessageInboxTable`, `leads-ui.tsx:558-661`) has explicit loading/empty rows but **no dedicated error row** — a fetch error and a genuinely empty result render identically inside the table; the error message shows only as a separate paragraph above it (`page.tsx:177`).
- Pagination controls (`PaginationBar`, `leads-ui.tsx:797-859`) are backend-authoritative (page/totalPages/total from server, not derived from `data.length`) — a comment notes this was fixed 2026-08-18. Prev/Next only, no page-number jump.
- Sorting UI is a **non-interactive decorative stub** ("Urutkan: Tanggal (Terbaru)", `leads-ui.tsx:465-471`, `aria-hidden`, wired to nothing) — matches the backend's hardcoded sort.
- Frontend does not import the shared `LeadListQuery`/`ContactMessageListQuery` Zod-inferred types from `@medcal/shared` — `leads-ui.tsx:38-40` re-declares its own local string-literal unions.
- No other list/search/pagination feature exists anywhere else in the repo — leads/contact-messages is the sole, first-of-its-kind implementation. There is no established internal "shared pattern" yet to protect; this is a greenfield opportunity to set the pattern correctly once.

---

## 5. Comparison Matrix

| Area | server-bi-erp / sales_invoiceHd | easy-app | medcal | Gap |
|---|---|---|---|---|
| Search parameters | `searchBy` (unvalidated field name) + `searchTerm` | mirrors backend: field selector + text | single `search` string only | MedCal simpler & safer (no field-injection risk); keep as-is |
| Search fields | single field, chosen by user | same | fixed OR across name/email/phone/organizationName | MedCal's fixed-OR is the better pattern; no change needed |
| Search semantics | per-word AND, `contains`, insensitive | n/a (backend-driven) | OR across fields, `contains`, insensitive | Keep MedCal's OR model |
| Filters | company/paidStatus/poType/salesPerson/period, AND-combined | live-apply, persisted Zustand | status/getFrom/topicId, AND-combined | Structurally equivalent; fine |
| Filter semantics | equality/IN on relation fields | n/a | equality/relation `some` | Equivalent pattern |
| Search + filter logic | `filters AND (word1 AND word2...)` | n/a | `filters AND (fieldA OR fieldB OR ...)` | MedCal's model is correct; do not copy sales_invoiceHd's AND-only search |
| Debounce | n/a (backend) | 500ms via `use-debounce`, decoupled local/global state | **none — every keystroke fires a request** | **Critical gap** |
| Filter request behavior | n/a | immediate, no debounce, no reset-page | immediate, resets page | Acceptable difference; MedCal's proactive reset is fine to keep |
| Loading | n/a | full loader only on first load; `isFetching` otherwise | loading row shown but full refetch likely re-triggers loading state each keystroke | Gap caused by missing debounce/keepPreviousData |
| Previous rows during loading | n/a | retained via `placeholderData` | not retained (plain useState/useEffect) | **Gap** |
| Pagination reset | n/a | search+page-size reset page; filter/sort don't (clamp is safety net) | search+filter all reset page | MedCal already stricter/correct |
| Sorting | whitelisted `orderBy`/`orderDir`, service-level | server-side, TanStack SortingState, in query key | **none — hardcoded `createdAt desc`, no param, dead UI stub** | **Critical gap** |
| Search + sorting | combined via shared where+orderBy | combined via query key | n/a (no sorting) | Blocked by sorting gap |
| Filter + sorting | combined | combined | n/a | Blocked by sorting gap |
| Search + filter + sorting | combined, AND | combined via query key | n/a | Blocked by sorting gap |
| Total count | same `where` object for count+data | React Query total from response | same `where` object for count+data | No gap — already correct |
| Empty state | n/a | dedicated "No data filtered" | dedicated "Tidak ada pesan." row | Equivalent |
| Clear search | n/a | clearing empty debounced value removes search param | clearing input works, resets page | Equivalent |
| Clear filters | n/a | dedicated "Reset Filter" button | not explicitly traced but state-managed | Likely fine, unconfirmed |
| Request cancellation | n/a | none found (React Query key isolation only) | **none — `apiFetch` has no AbortSignal param** | Gap, but matches easy-app's actual (non-)practice |
| Race-condition protection | n/a | implicit via React Query query-key cache isolation | **none — plain useState, last-resolved-wins** | **Gap relative to easy-app's implicit protection** |

---

## 6. Gaps (Prioritized)

1. **No search debounce** — every keystroke triggers 3 parallel network requests (`page.tsx:63-67`). Highest-impact, easiest fix.
2. **No race-condition protection** — plain `useState`/`useEffect` means a slow earlier response can overwrite a newer one (last-resolved-wins, not last-requested-wins). Confirmed by absence of AbortController and absence of React Query.
3. **No sorting end-to-end** — backend hardcodes `createdAt desc`; schemas have no sort fields; frontend has a dead decorative sort control.
4. **No keepPreviousData equivalent** — table likely flashes to loading/empty on every search/filter change instead of retaining previous rows.
5. **No URL-synced state** — search/filter/page state lost on refresh or back-navigation, not shareable via link.
6. **Duplicated DTO schemas** — `leadListQuerySchema`/`contactMessageListQuerySchema` hand-copied instead of composed from one base.
7. **No shared backend query-builder** — `LeadsService.findAll`/`ContactMessagesService.findAll` duplicate the same where/count/skip/take scaffolding.
8. **Dead/inconsistent page-size default** — server `DEFAULT_PAGE_SIZE=20` never actually used since frontend always sends 10.
9. **No dedicated table error row** — fetch errors and empty results render identically inside the table.

---

## 7. Golden Behavior for MedCal

### Search
- Keep the current OR-across-fields `contains`/insensitive semantics (better than sales_invoiceHd's single-field model) — no backend change needed here.
- Frontend: add debounce (300-500ms, matching easy-app's proven 500ms) between raw keystroke state and the value that feeds the fetch/query-key. Reset page to 1 at the single point where the debounced value changes (mirrors `search-Input.tsx:29-45`), not inside the raw `onChange`.

### Filters
- Keep MedCal's existing pattern: immediate (non-debounced) apply, `setPage(1)` on change. This is already correct and stricter/safer than easy-app's clamp-based approach — no change needed, just preserve it when refactoring the fetch mechanism.
- Preserve search state when filters change and vice versa (already true — independent `useState` slices).

### Pagination
- Keep reset-on-search and reset-on-filter (current behavior). Add reset-on-page-size-change if not already present (verify at implementation time).
- Backend: fix the `DEFAULT_PAGE_SIZE` mismatch — either change server default to 10 to match the frontend's actual initial value, or make the frontend rely on the server default instead of hardcoding 10. Pick one source of truth.
- Add `totalPages` to the response contract explicitly (improvement over sales_invoiceHd, which omits it).

### Sorting
- Add `sortBy`/`sortDir` to both Zod query schemas, backend-whitelisted against a small allowed-column list per module (mirror `sortFieldBy.ts`'s whitelist pattern, but fix its ambiguous-default bug — make the fallback direction unambiguous, e.g. always default to `'desc'` explicitly rather than relying on signature-vs-body mismatch).
- Wire the existing decorative "Urutkan" control to actually dispatch `sortBy`/`sortDir`.
- Sorting changes should NOT reset page (matches easy-app's behavior — sorting the same result set doesn't invalidate the user's position as meaningfully as a filter/search change does); rely on the same out-of-range clamp MedCal would need anyway once keepPreviousData is added.

### Table UX
- Adopt a keepPreviousData-equivalent so the table never flashes empty during a refetch. Whether this comes via adopting TanStack/React Query (recommended — MedCal has no data-fetching library yet and this is a natural point to introduce one) or a manual "keep last successful result while `isFetching`" flag is an open implementation choice (see Section 11).
- Add a distinct error row in `MessageInboxTable`/`MessageInboxList`, separate from the empty-result row.
- Full-page/loading indicator only on true first load (no `data` yet); subsequent refetches show a lighter in-place indicator (e.g. a subtle opacity/spinner on the existing table), matching `page.tsx:95-101`'s pattern in easy-app.

### Request Safety
- Add cancellation: either adopt React Query (which gives this via query-key isolation + automatic cancellation of superseded queries, matching easy-app's actual protection level) or, if staying framework-free, thread an `AbortController` through `apiFetch` and cancel the previous in-flight request whenever a new one starts.
- Given MedCal has zero existing data-fetching library and easy-app's own protection is *also* just React Query's implicit key isolation (not custom cancellation logic), the pragmatic recommendation is to introduce React Query for this feature rather than hand-roll cancellation — it's the same level of protection the proven reference actually relies on, with less custom code to maintain.

---

## 8. MedCal Implementation Specification

### Frontend
- Introduce `@tanstack/react-query` (not yet a dependency — verify) scoped initially to the leads/contact-messages feature.
- New hook `useLeadsQuery` (or extend existing fetch logic) in `apps/portal/src/app/management/leads/` wrapping `apiFetch` in a `useQuery`, with:
  - Query key: `['leads', companyId, search, status, source, topicId, sortBy, sortDir, page, pageSize]`.
  - `placeholderData: (prev) => prev`.
  - `staleTime`: short (e.g. 10-30s; leads data changes more often than sales invoices, so shorter than easy-app's 60s).
- Debounce: local `searchInput` state (raw keystrokes) → `useDebounce`-style hook (300-500ms) → committed `search` state that feeds the query key and resets page.
- Sorting: wire `leads-ui.tsx:465-471`'s existing decorative control to real state (`sortBy`/`sortDir`), pass through to the query.
- Table components (`MessageInboxTable`, `MessageInboxList`): add an explicit error branch distinct from the empty-result branch.

### Backend
- `packages/shared/src/schemas/index.ts`: factor a shared base (e.g. `baseListQuerySchema` with `search`/`page`/`pageSize`/`sortBy`/`sortDir`) that `leadListQuerySchema`/`contactMessageListQuerySchema` extend, instead of hand-duplicating.
- Add `sortBy` (enum whitelist per module, e.g. `createdAt`, `name`, `status`) and `sortDir` (`asc`/`desc`) to both schemas.
- `leads.service.ts`/`contact-messages.service.ts`: replace hardcoded `orderBy: { createdAt: "desc" }` with a small whitelist-validated `orderBy` builder (mirror `sortFieldBy.ts`'s intent, fix its default-direction ambiguity).
- Resolve `DEFAULT_PAGE_SIZE` mismatch (20 server vs 10 frontend) — pick one.
- Optional (not blocking): extract a shared `buildListWhereAndCount` helper if a third list module appears; with only two nearly-identical services today, this is a "wait for a third instance" call, not urgent.

### Query Model
```text
WHERE
    status = :status            (if provided)
    AND getFrom/topicId relation filter   (if provided, leads only)
    AND (
        name contains :search
        OR email contains :search
        OR phone contains :search
        OR organizationName contains :search
    )                            (if search provided)
ORDER BY :sortBy :sortDir        (whitelisted, default createdAt desc)
LIMIT :pageSize
OFFSET (:page - 1) * :pageSize
```
This matches MedCal's current structure — the only additions are the `ORDER BY` becoming parameterized/whitelisted instead of hardcoded, and formalizing the base schema.

---

## 9. Acceptance Criteria

**Search**
- [ ] Debounce (300-500ms) confirmed via network trace — rapid typing produces one request, not one per keystroke.
- [ ] Clearing search removes the filter and refetches unfiltered results.

**Filters**
- [ ] Filters combine with AND and with the search OR-group.
- [ ] Filters correctly affect `totalRecords`/`totalPages`.
- [ ] Clearing a filter works and search remains intact.

**Search + Filter**
- [ ] Changing search preserves active filters (and vice versa) — already true, verify no regression.
- [ ] Page resets to 1 on search or filter change (current behavior preserved).

**Pagination**
- [ ] Page-size change resets page to 1.
- [ ] `totalPages` in response matches `Math.ceil(totalRecords/pageSize)`.

**Sorting**
- [ ] Sorting works combined with active search and/or filters.
- [ ] Invalid/unwhitelisted `sortBy` falls back to default rather than erroring or being ignored silently without fallback.
- [ ] Sorting change does not reset page.

**Table UX**
- [ ] Previous rows remain visible (no flash-to-empty) during a refetch triggered by debounced search, filter change, sort change, or pagination.
- [ ] Distinct error state renders inside the table, not just as an external paragraph.
- [ ] Empty-result state and error state are visually distinguishable.

**Request Safety**
- [ ] Rapidly changing search/filter/sort does not let a stale response overwrite the latest state (verify via throttled network + rapid interaction in devtools).

---

## 10. Files Expected To Change

**Do not modify yet — for the next (implementation) task:**

- `packages/shared/src/schemas/index.ts` — add shared base list-query schema; add `sortBy`/`sortDir` to lead/contact-message schemas.
- `apps/api/src/modules/leads/leads.service.ts` — parameterize `orderBy`, fix page-size default.
- `apps/api/src/modules/contact-messages/contact-messages.service.ts` — same.
- `apps/api/src/modules/leads/leads.controller.ts`, `contact-messages-query.controller.ts` — no logic change expected, just confirm DTO parsing still covers new fields.
- `apps/portal/src/app/management/leads/page.tsx` — introduce debounce, React Query, sort state wiring, remove/replace plain useEffect fetch.
- `apps/portal/src/app/management/leads/leads-ui.tsx` — wire the existing decorative sort control to real state; add table error row.
- `packages/shared/src/http/api-fetch.ts` — potentially add `AbortSignal` passthrough if React Query is not adopted (fallback path only).
- New dependency: `@tanstack/react-query` (and possibly `use-debounce`, matching easy-app's proven choice) added to `apps/portal/package.json`.

---

## 11. Risks / Open Questions

1. **React Query adoption scope** — should it be introduced repo-wide or scoped to leads/contact-messages only for now? Recommend scoping narrowly first since this is the only list feature in the app today; broader adoption can follow once a second list feature exists.
2. **Debounce library choice** — easy-app uses `use-debounce`; MedCal could use that same library or a small inline `useDebouncedValue` hook to avoid a new dependency. No strong evidence either way is required by proven behavior; either satisfies the golden behavior.
3. **Sort whitelist per module** — exact allowed sort columns for leads vs contact-messages need product input (e.g. is sorting by `status` desired, or only by date/name?). Not determinable from existing code since sorting doesn't exist yet.
4. **DEFAULT_PAGE_SIZE resolution direction** — change server default from 20→10, or change frontend initial `pageSize` from 10→20 (and update `PAGE_SIZE_OPTIONS` accordingly)? Cosmetic but needs a decision.
5. **Backend shared where-builder** — with only two near-identical services, is it worth extracting a shared helper now, or waiting for a third consumer (per the repo's own YAGNI-friendly precedent, since server-bi-erp itself never built one generic helper despite having 6+ modules use the same search/sort utils but hand-rolled where-builders)? Recommend waiting.
