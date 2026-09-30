# Tech-PWA UX-16 — High-Volume Device List Scalability Audit

Audit date: 2026-09-29
Scope: `apps/tech-pwa/src/app/jobs` (job queue → job detail navigation only), relevant API in `apps/api/src/modules/calibration-jobs`, relevant Prisma models in `packages/db/prisma/schema.prisma`.
Type: Read-only audit. **No source file, test, schema, or UI was modified.** This document is the only file written.

This is a new, separate finding (UX-16), not part of `tech-pwa-comprehensive-ui-ux-audit.md` (UX-01–UX-15). It does not revisit Phase 1/Phase 2 findings except where noted as informational interaction risk (§15).

---

## 1. Executive Summary

The screenshot text "1 SPK · 102 perangkat · 0 selesai · 102 belum selesai" comes from `DeviceList` in `apps/tech-pwa/src/app/jobs/jobs-ui.tsx` (lines 185–205), the third level of a Customer → SPK → Unit drill-down on the `/jobs` route. What is rendered as "102 perangkat" is not a `Device` entity list — it is `CalibrationJob[]` (one job = one calibration "unit" fanned out from a `WorkOrderItem.qty`), each rendered as an unfiltered `UnitRow` card in a single `.map()` with no pagination, no virtualization, no search, and no filter control anywhere in this screen.

**A genuine scalability problem is confirmed, and it is primarily a findability / information-architecture problem, not (yet) a rendering-performance problem.** At 100+ units the only thing that visually distinguishes two cards is `unitOrdinal` ("Unit 7 dari 102") plus a `customerDeclaredDeviceName` string that is frequently identical across many units of the same line item (e.g. "Bed Patient" × 102) — brand/model/serial, which do exist on the underlying `Device`, are never shown at this list level. A technician resuming unfinished work, or trying to locate one specific unit among 100+ visually-similar cards, has no tool but scrolling and re-reading `customerDeclaredDeviceName` + ordinal. This is a findability/IA gap that exists starting around the "high" (51–100) stress range and worsens linearly past that.

Separately, there is a real but smaller technical-scalability concern: `apps/tech-pwa/src/app/jobs/use-jobs-query.ts` fetches **every page of the technician's entire assigned-job list** (not just the active SPK) up front via `Promise.all`, capped at `pageSize=100` per request, purely to compute customer/SPK/device counts client-side. This is a data-fetching-architecture choice, independent of the rendering findability problem, and would degrade (more parallel requests, larger client-held array) as a technician's total assigned-job count grows — not specifically tied to one SPK's 102 units.

The backend (`apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts` + `calibration-jobs.service.ts`) already supports `search`, `status`, `akdAklApprovalStatus`, `workOrderId`, pagination, and sorting on `GET /calibration-jobs`, and already has a server-side grouped-by-WorkOrder endpoint (`GET /calibration-jobs/grouped`) built for Portal. None of this is currently used by the tech-pwa job-queue screen, which instead fetches flat, unfiltered data and groups it entirely client-side.

---

## 2. Exact Current Implementation

1. **Page**: `apps/tech-pwa/src/app/jobs/page.tsx` — route `/jobs`, drives Customer → SPK → Unit drill-down purely via `?customerId` / `?workOrderId` query params (no dedicated route per level).
2. **List/row components**: `apps/tech-pwa/src/app/jobs/jobs-ui.tsx`:
   - `CustomerList` (lines 150–164): one card per customer, `customer.deviceCount` shown as "N perangkat".
   - `SpkList` (166–183): one card per SPK (`WorkOrder`), `spk.jobs.length` shown as "N perangkat".
   - `DeviceList` (185–205): **the screen matching the screenshot** — `spk.jobs.map((job) => <UnitRow key={job.id} job={job} />)`, no slicing, no windowing.
   - `UnitRow` (103–148): the individual "device" card — ordinal badge, `declaredDeviceName(job)`, status badge, optional identity-correction badge, "Belum diidentifikasi" if `job.deviceId == null`.
3. **Data source**: `apps/tech-pwa/src/app/jobs/use-jobs-query.ts` — `useJobsQuery()` calls `fetchAllAssignedJobs()`, which does `GET /calibration-jobs?assignedToMe=true&page=1&pageSize=100&sortBy=createdAt&sortDir=desc`, then (if `totalPages > 1`) fetches **all remaining pages in parallel** via `Promise.all`, and concatenates everything into one in-memory array. Polls every 6s (`refetchInterval: 6000, refetchOnWindowFocus: true`).
4. **Grouping**: `apps/tech-pwa/src/lib/calibration/job-display.ts` — `groupJobsByCustomer()` (105–166) and `groupJobsByWorkOrder()` (70–99) are pure client-side transforms over the full flat array, run on every render of `page.tsx` (line 62: `const customers = data ? groupJobsByCustomer(data.data) : []`).
5. **API endpoint**: `GET /calibration-jobs` (`apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts` lines 109–124) → `CalibrationJobsService.findAll` (`calibration-jobs.service.ts` ~787–820), `take: pageSize`, `pageSize` capped at 100 (`baseListQuerySchema`, `packages/shared/src/schemas/index.ts` line 52: `pageSize: z.coerce.number().int().min(1).max(100).optional()`).
6. **Domain entity**: confirmed against `packages/db/prisma/schema.prisma` — the list is `CalibrationJob` rows (model at line 2393), one per fan-out unit (`unitOrdinal`/`unitTotal`, comment at 2411–2421: "Lets the technician UI label 'unit 2 of 3' ... when sibling jobs are otherwise identical"), not `Device` rows directly. `deviceId` is nullable on `CalibrationJob` until the technician resolves identity on-site (schema comment, 2398–2404). So "102 perangkat" in the UI literally means 102 `CalibrationJob` units, most of which may share one declared device name and not yet have a resolved `Device`.

---

## 3. Current User Flow

`/jobs` (Customer list) → tap customer → `/jobs?customerId=X` (SPK list) → tap SPK → `/jobs?customerId=X&workOrderId=Y` (Unit/device list, the screenshot) → tap a unit row → `/jobs/[id]` (Job Detail mega-screen) → work the job → header back button (`BackLink` in `jobs/page.tsx` 33–51, or `job-detail-ui.tsx`'s `Screen showBack`) returns to the previous level via a plain `<Link href>` / `router.back()`, not a state-preserving in-place update.

There is no dedicated device/list route (`/jobs/[id]` is the *job* detail, not a device master page) — confirms the domain entity really is "job/unit", consistent with §2.6.

---

## 4. Device Data / Identity Model

Fields actually present on `TechCalibrationJob` (`apps/tech-pwa/src/lib/calibration/types.ts` lines 74–138) and on its nested `device`:

| Field | Shown in list row (`UnitRow`)? | Shown in Job Detail? |
|---|---|---|
| `unitOrdinal` / `unitTotal` | Yes ("Unit 7 dari 102") | Yes (`JobHeaderBlock`) |
| `customerDeclaredDeviceName` (via `declaredDeviceName()`) | Yes | Yes (`DeclaredIdentitySection`) |
| `status` | Yes (badge) | Yes |
| `identityCorrections[0].status` | Yes (badge, if any) | Yes (full list) |
| `deviceId == null` | Yes ("Belum diidentifikasi") | Yes (drives device-lookup UI) |
| `device.code` | **No** | Yes (`AssignedDeviceSection`, once resolved) |
| `device.brand` / `device.model` | **No** | Yes (once resolved) |
| `device.serialNumber` | **No** | Yes (once resolved) |
| `technicianObservedSerial` | **No** | Yes (`ObservedIdentitySection`) |

**Device model fields that exist in the DB but are not exposed on `TechCalibrationJob.device` at all** (`packages/db/prisma/schema.prisma` lines 1553–1586): `deviceTypeId`/`deviceType`, `category`, `locationText`. These would be the natural grouping/filtering dimensions (device type, department/location) if a future direction needed them, but the current tech-pwa DTO does not carry them — this is a real architecture gap for any type/location-based grouping strategy, not something to silently assume exists.

**Findability conclusion**: the only two fields shown in the high-volume list are `unitOrdinal` (unique, but purely positional — carries no recognition value) and `customerDeclaredDeviceName` (**not unique** — many units under one PO line item routinely share the same declared name, e.g. "Bed Patient", by the nature of `qty`-based fan-out described in the schema comment at line 2415: "sibling jobs are otherwise identical"). Two devices with the same declared name and unresolved `deviceId` are **visually indistinguishable** in this list except by ordinal number. Serial number — the one field that would let a technician recognize "this is the physical unit I'm holding" — is not shown until the technician opens the job.

---

## 5. Current Progress Model

- "`X selesai · Y belum selesai`" is computed by `finalizeWorkOrderGroup()` (`job-display.ts` 60–64): `doneCount = jobs.filter(isJobDone).length`, `openCount = jobs.length - doneCount`.
- `isJobDone(job)` (`job-display.ts` 11–13) is a **single boolean**: `job.status === "ACCEPTED_BY_QA"`. It does not distinguish `PENDING` / `IN_PROGRESS` / `SUBMITTED` (awaiting review) / `REWORK` — all of these count as "belum selesai" even though they represent very different technician-actionable states (not started vs. mid-work vs. waiting on someone else vs. needs rework).
- It is **live**: `useJobsQuery` polls every 6s + refetches on focus (`use-jobs-query.ts` 50–51), and the count recomputes on every render from the fresh array — this is per-render, not cached/stale.
- It is **per-CalibrationJob** (i.e. per unit), aggregated to SPK and Customer levels, not per-Device or per-some-other-entity.
- It is **not filterable or actionable** — there is no "show only belum selesai" control anywhere in `jobs-ui.tsx` or `page.tsx`. The count is purely informational text in the parent-level card headers; it does not drive sort order of the `UnitRow`s themselves within `DeviceList` (jobs are sorted only by `unitOrdinal`, `job-display.ts` line 61 `group.jobs.sort((a, b) => a.unitOrdinal - b.unitOrdinal)` — status is not a sort key at the leaf level, though it *is* a sort key one level up for which SPK/Customer group surfaces first, via `compareQueueGroups`, `job-display.ts` 41–58).

No business meaning is proposed to change here — this section is descriptive only, per the audit's constraint.

---

## 6. High-Volume Stress Analysis

| Range | Discoverability / scanning | Resuming unfinished work | Progress visibility | Navigation effort | Rendering/perf | State preservation |
|---|---|---|---|---|---|---|
| 1–10 | Trivial, one screen's worth | Trivial | Clear (small counts) | Minimal | Non-issue | Not evaluated (list this small is regenerated instantly anyway) |
| 11–50 | Still scannable by scroll; declared-name collisions start to matter if line item qty > 1 | Requires scroll + re-reading; no status filter to jump to open ones | Still clear as aggregate text | One or two screen-heights of scroll | Non-issue | Not verified — no explicit scroll-restoration code found (see below) |
| 51–100 | Scanning becomes effortful; repeated identical declared names (fan-out) make scanning error-prone | No shortcut to "next unfinished" — technician must scroll/read every card in status-agnostic ordinal order | Aggregate count still correct but says nothing about *which* units are open | Multiple screens of scroll each visit; repeated after every job round-trip | Still no rendering-cost evidence (≈100 simple DOM cards; see §8) | Same as above |
| 101–500 (observed case: 102) | Same problem, worse: pure ordinal+name scanning over 100+ cards is the exact scenario reported | Same — the technician has no tool other than memory of where they left off | Aggregate count only; cannot see, from the SPK card, *which* ordinals remain open without opening the device list and reading every row | Long, repeated scroll for every visit-and-return cycle | Still likely fine technically at ~100 simple rows (see §8), but is the range where a UX problem is unambiguous | Same as above |
| 500+ | Not observed in this codebase/dataset; architecture (`take: pageSize` capped at 100 server-side, but tech-pwa's client-side `fetchAllAssignedJobs` removes that cap by fetching all pages) means a single SPK with 500+ units would still be fetched and rendered in full client-side | Same problem compounds | Same | Same, worse | This is the point where DOM-node count and full-array `Promise.all` fetch cost become a *plausible* secondary concern (see §8) — not confirmed by profiling, since no such dataset exists in this repo to test against | Same |

Conclusion: the problem present at 51–100+ is **information architecture / findability** (no way to jump to a specific or unfinished unit; declared names collide) plus, independently, a **data-fetching-architecture** characteristic (`fetchAllAssignedJobs` unconditionally fetches every page of the technician's *entire* job backlog, not scoped to the SPK being viewed) that would matter more as a technician's *total* assigned-job count (across all SPKs) grows, separate from any single SPK's unit count.

---

## 7. Findability Analysis

Per field actually rendered on `UnitRow`:

| Field | Unique? | Aids recognition? | Searchable/filterable today? | Collision risk |
|---|---|---|---|---|
| `unitOrdinal` | Yes (within SPK) | No — purely positional, must be remembered/counted | No | None (unique by construction) |
| `customerDeclaredDeviceName` | **No** | Partially — helps distinguish device *types* within a mixed SPK, not individual units of the same type | No | **High** for any line item with `qty > 1` (the exact "102 perangkat" scenario) |
| `status` badge | N/A | Distinguishes state, not identity | No (not filterable) | N/A |
| identity-correction badge | N/A | Only present on units with an active BA | No | N/A |

**Minimum identity information required to reliably distinguish two units in a high-volume list, based on data that actually exists**: `device.serialNumber` (once resolved) is the only field in the current data model that is guaranteed distinct per physical unit — and it is present on `TechCalibrationJob.device` but simply not rendered at list-row granularity today (§4). Before `deviceId` resolves, no field in `TechCalibrationJob` distinguishes two same-name sibling units except `unitOrdinal` — this is an inherent domain characteristic (the schema comment at line 2415 states siblings are "otherwise identical" pre-resolution), not a UI bug, and any UX direction must treat pre-identification units as legitimately un-distinguishable beyond ordinal.

---

## 8. UX vs Technical Scalability

These are evaluated as separate problems, as instructed:

**UX/findability scalability (confirmed problem)**: no search, no status filter, no way to jump to "unfinished" units, low-information cards (name + ordinal only) causing scanning/re-reading effort that grows linearly with unit count. Root cause is in `jobs-ui.tsx`'s `UnitRow`/`DeviceList` (no controls) and `job-display.ts` (no exposed per-unit filter/sort beyond the fixed ordinal sort) — not a rendering-engine problem.

**Technical/rendering scalability (not confirmed as a current problem, but a real architectural characteristic worth naming)**:
- `DeviceList` renders one `UnitRow` per job via a plain `.map()` (`jobs-ui.tsx` 200–202) — no windowing library is present in `apps/tech-pwa/package.json` (checked; no `react-window`/`react-virtual`/similar dependency exists anywhere in `apps/tech-pwa`).
- Each `UnitRow` is a shallow, cheap component: one ordinal `<span>`, a few `<p>`s, two small pure-boolean helper calls (`isAwaitingQualityReview`, `isQualityReviewApproved` — both simple field checks, no loops), one conditional badge, one `<svg>` chevron. No images, no per-row network calls, no expensive computation. At 100 rows this is on the order of a few hundred DOM nodes — not, on its own, a demonstrated performance problem; this audit does not have a way to profile actual frame timings against a live 100+-unit dataset and does not claim one.
- The **data-fetching side** is the more concrete technical-architecture note: `fetchAllAssignedJobs()` (`use-jobs-query.ts` 10–39) always fetches the technician's *full* assigned-job list across *all* SPKs/customers (not scoped to the SPK currently being viewed), in parallel, every 6s. This is already a chosen trade-off to make the customer/SPK aggregate counts always accurate (`use-jobs-query.ts` line 7 comment: "fetch every page so customer/SPK counts are never undercounted") — a deliberate architecture decision, not an oversight, but one whose cost scales with a technician's *total* backlog, independent of any single SPK's unit count. `jobs/page.tsx` line 81 (`incompleteFetch`) shows the team is already aware pagination could leave data incomplete and surfaces a banner for that case.

**Explicit distinction**: virtualization would address the (currently undemonstrated) rendering-cost concern, not the (confirmed) findability concern. Recommending virtualization as the primary fix for "I can't find unit 47 among 102 identically-named cards" would not solve the actual reported problem — consistent with this audit's brief not to reach for virtualization as a findability fix.

---

## 9. Existing Backend/API Capabilities

Checked `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts` and `.service.ts`, and `calibrationJobListQuerySchema` (`packages/shared/src/schemas/index.ts` lines 1299–1327, extending `baseListQuerySchema` at 47–53):

Already supported server-side on `GET /calibration-jobs`:
- `search` (free-text, `min(1)` trimmed string)
- `status` (enum, includes all `CalibrationJobStatus` values)
- `akdAklApprovalStatus`
- `workOrderId`, `purchaseOrderItemId` (scoping)
- `assignedToMe` (technician-scoped filter, resolved server-side from session — already used by tech-pwa)
- `needsAction` ("Perlu Tindakan" — active `CalibrationJobActionSignals` filter)
- `page` / `pageSize` (capped at 100) / `sortBy` / `sortDir`
- A separate **`GET /calibration-jobs/grouped`** endpoint (`calibration-jobs.controller.ts` ~126–142) that already does **server-side WorkOrder-level grouping with pagination at the WorkOrder level** — built for the Portal Calibration Jobs page, same query params as the flat list.
- A **`GET /calibration-jobs/:id/siblings`** endpoint (`calibration-jobs.controller.ts` ~183–192, `CalibrationJobsService.getSiblings`) that returns adjacent-unit ids for Previous/Next navigation, scoped to the same PO line item or WorkOrder — explicitly built for sequential navigation between units. **Confirmed unused by tech-pwa** — no reference to `/siblings` anywhere under `apps/tech-pwa/src` (grep-verified; the only other hits for the string "sibling" in tech-pwa are unrelated NIBP/measurement-grid comments about grouped test-point rows, not this endpoint).

Not exposed on `TechCalibrationJob.device`: `deviceTypeId`/`deviceType`, `category`, `locationText`, even though they exist on the `Device` Prisma model (§4). Any candidate strategy needing device-type/category/location grouping in tech-pwa would need this DTO extended — a real, minimal, scoped backend change if that direction were ever chosen; not proposed here.

**Conclusion**: nearly every capability a search/filter/server-side-grouping strategy would need already exists in the API and is already used by Portal (`grouped` endpoint) and partially by tech-pwa itself (`assignedToMe`, pagination). The gap is entirely in the tech-pwa client, which does not call `search`, `status`, `needsAction`, `/grouped`, or `/siblings` for this screen.

---

## 10. Candidate UX Strategies — Evaluate Only

- **(A) Search** — `search` param already exists server-side; the identical mechanism already powers `AssignedDeviceSection`'s device-lookup search in Job Detail (`use-device-lookup-query.ts` + `useDebouncedValue`, `job-detail-ui.tsx` 135–209) via the same 500ms debounce pattern. Would search on `customerDeclaredDeviceName` primarily, since that's the only recognition-bearing field pre-identification; would not help distinguish same-named siblings (it would just return all of them). Mobile ergonomics: the existing debounced-search input pattern (`min-h-11`, `inputMode="search"`) is proven elsewhere in this exact app.
- **(B) Status filters (Semua/Belum selesai/Selesai)** — domain-meaningful today (`CalibrationJobStatus` enum + `isJobDone`), and the `needsAction` API param already exists for a "Perlu Tindakan" variant. Would let a technician jump straight to open units without scanning completed ones — directly addresses "resuming unfinished work," one of the confirmed gaps in §6/§7.
- **(C) Grouping by type/category/location** — **not currently viable without a DTO/backend change** (§9): `deviceType`/`category`/`locationText` are not exposed on `TechCalibrationJob.device`. Also would not help the core problem (same-named-sibling collision) since siblings of one PO line item share the same type/category by definition.
- **(D) Progressive disclosure/collapsible groups** — technically feasible over the existing Customer→SPK grouping (already collapsed by drill-down); an additional collapse layer *within* one SPK's 102 units would need some grouping key, which the data mostly lacks pre-identification (see C).
- **(E) Pagination** — page boundaries could hurt the "scan for a specific unit" workflow since the list is not stably sortable by anything the technician recognizes (name collisions); would need a strong sort/search complement to not simply relocate the problem.
- **(F) Virtualization** — evaluate only as a rendering concern (§8): not demonstrated to be necessary at the observed 102-unit scale; would not address findability at all.
- **(G) Sequential Previous/Next device pattern** — **the codebase already has a purpose-built server endpoint for exactly this** (`GET /:id/siblings`, §9), unused. Workflow evidence for whether technicians process units *mostly sequentially* is not established by this audit (no code found that orders work by anything other than `unitOrdinal`, and no telemetry/analytics exists in-repo to confirm actual technician behavior) — this remains an open question (§18), but the fact that a sibling-navigation endpoint already exists (built, unused) is a strong signal the original architecture anticipated linear unit-by-unit traversal as a real use case.
- **(H) Combined strategies** — a status filter (B) + search (A) combination directly targets both confirmed gaps ("find a specific declared-name group" and "jump to unfinished work") using capabilities the API already exposes, without requiring any schema/DTO change.

---

## 11. Strategy Trade-off Matrix

Qualitative only (low/moderate/high/requires validation), per the audit's instruction not to declare a numeric winner.

| Strategy | Findability | Progress visibility | Workflow continuity | Cognitive load | Mobile usability | Implementation complexity | Performance | Risk to existing workflow |
|---|---|---|---|---|---|---|---|---|
| (A) Search | Moderate (helps by name, not sibling collisions) | No change | No change | Low reduction | High (proven pattern reused) | Low (mirrors existing device-lookup search) | Low impact | Low |
| (B) Status filter | Moderate–High (directly targets "find unfinished") | High improvement (filter reflects the count already shown) | High improvement (fast return-to-open-work) | Moderate reduction | High (simple chip/tab UI, proven elsewhere in app) | Low (server param already exists) | Low impact | Low |
| (C) Grouping by type/category/location | Requires validation (not shown to solve sibling collision; needs DTO change first) | No direct change | Unclear | Could increase (added hierarchy) | Requires validation | Moderate–High (needs backend DTO extension) | Low impact | Low–Moderate (new grouping dimension to keep correct) |
| (D) Progressive disclosure/collapsible groups | Requires validation (depends on a grouping key that mostly doesn't exist pre-identification) | No direct change | Unclear | Could reduce initial scan, adds interaction cost to expand | Requires validation | Moderate | Low impact | Low–Moderate |
| (E) Pagination | Low–Moderate (could relocate scanning burden across pages) | No direct change | Risk of losing place across page loads | Neutral-to-negative (adds a boundary to remember) | Moderate | Low–Moderate | Low impact | Moderate (workflow continuity risk if not paired with search/filter) |
| (F) Virtualization | None (rendering-only) | None | None | None | Neutral | Moderate | High improvement only if a demonstrated rendering problem exists (not yet demonstrated at 102 units) | Low, but solves the wrong problem if used alone |
| (G) Sequential Prev/Next (`/siblings`) | High for strictly-linear work, none for out-of-order work | No direct change | High improvement *if* workflow is actually sequential (unconfirmed — see §18) | Low (removes need to return to the list at all) | High (single-purpose nav, no list scanning) | Low (endpoint already exists, unused) | Low impact | Low, but only appropriate if sequential-processing assumption holds |
| (H) Search + status filter combined | High (name-search narrows candidates, status filter narrows to actionable) | High | High | Low | High | Low–Moderate (two small, proven, server-backed controls) | Low impact | Low |

---

## 12. Recommended UX Direction

The workflow evidence found in this codebase (job-status enum, existing `needsAction`/`search`/`status` server params, existing debounced-search pattern already proven in the same app for device lookup, and the `doneCount`/`openCount` aggregate already computed and displayed) supports recommending **(H): a status filter (Semua / Belum selesai / Selesai, mirroring the existing `isJobDone` boolean and the counts already shown) combined with name search**, as the smallest safe direction, because:
- Both are already backed by existing, tested API query parameters (§9) — no new backend capability is required.
- Both reuse UI patterns already proven elsewhere in this exact app (debounced search input, status badges/chips) — no new interaction paradigm.
- Both directly address the two confirmed gaps from §6/§7 ("no way to jump to unfinished work," "no way to narrow by declared name") without touching card content, ordering by `unitOrdinal`, or any completion/business semantics.

This audit does **not** have sufficient workflow evidence (no telemetry, no explicit sequential-processing requirement found in code or docs) to recommend **(G)** Sequential Prev/Next as the primary direction over (H), despite the existing unused `/siblings` endpoint being a tempting signal — that is a real open question (§18), not a confirmed requirement. (G) is worth revisiting specifically once real technician workflow (sequential vs. jump-around) is confirmed.

Grouping/categorization (C) and pagination (E) are **not** recommended as primary directions: (C) requires a DTO change to even become viable and does not solve the core sibling-collision problem; (E) risks relocating rather than solving the scanning burden unless paired with (A)/(B) anyway, at which point (A)/(B) alone are the smaller, safer change.

Virtualization (F) is **not recommended at this time** — no rendering-performance problem has been demonstrated at the observed 102-unit scale, and it would not address the actual reported symptom.

---

## 13. Required Data/Architecture Changes, if Any

For the recommended direction (H): **none**. `search` and `status` are already accepted by `GET /calibration-jobs` and already validated by `calibrationJobListQuerySchema`. The only work would be client-side: wiring `useJobsQuery`/`fetchAllAssignedJobs` to accept and pass these params, and adding filter/search UI in `jobs-ui.tsx`/`page.tsx` at the `DeviceList` level — implementation, not audited here (out of scope for this report).

If a future direction pursued (C) grouping by device type/category/location, the minimum change would be extending `TechCalibrationJob.device` in `apps/tech-pwa/src/lib/calibration/types.ts` and the corresponding API response shape to include `deviceType`/`category`/`locationText` (already present on the `Device` Prisma model, §4/§9) — flagged here only because the evidence shows it's currently missing, not because this audit is recommending that direction.

---

## 14. Regression Risks

Any future implementation of a UX-16 direction must preserve, per the task's guardrails:
- `unitOrdinal`/`unitTotal` fan-out semantics and the existing ordinal sort within a group (`job-display.ts` line 61) — a filter/search UI should narrow the visible set, not change the underlying identity or ordering data.
- `isJobDone`/status-derived `doneCount`/`openCount` semantics (§5) — a status filter must reuse this existing boolean, not redefine "done."
- The Customer → SPK → Unit drill-down URL contract (`?customerId`/`?workOrderId` query params) that Job Detail's back navigation and deep links depend on.
- Phase 1 (UX-01/02/03) and Phase 2 (UX-04/06/07/11) invariants in Job Detail and downstream screens are untouched by anything in this list screen — no code in this audit's scope overlaps those files.
- RBAC/capability gating (`useAuthz().capabilities`) that already governs which actions render — a list-level search/filter is presentation-only and must not become a second enforcement point.

---

## 15. NIBP / Measurement Protection

No NIBP GRID, Measurement GRID, Direct Measurement, or measurement validation/save code was read, analyzed, or touched by this audit beyond the incidental grep noted in §9 (two unrelated "sibling" comments in `apps/tech-pwa/src/lib/calibration/measurement.ts`, about grouped test-point rows — not this feature, not modified, not further analyzed).

One interaction to flag for a future implementer (informational only, not analyzed further here): if a future UX-16 direction changes how a technician reaches `/jobs/[id]` (e.g. a filtered list, or a Prev/Next deep-link per (G)), the existing navigation *into* `/jobs/[id]/measurements/nibp` and other measurement entry routes from Job Detail is unaffected either way, since Job Detail itself is not part of this screen's scope and nothing in `DeviceList`/`UnitRow` links directly into measurement routes — the list only ever links to `/jobs/[id]` (job-detail-ui.tsx / jobs-ui.tsx `UnitRow`, `href={`/jobs/${job.id}`}`). Regression risk to NIBP/measurement navigation from any UX-16 change is assessed as **low**, but should be re-verified at implementation time, not assumed from this audit alone.

---

## 16. What Should NOT Be Changed

- `CalibrationJob` fan-out model, `unitOrdinal`/`unitTotal`, `deviceId` nullability semantics (Prisma schema, §2.6/§4).
- `isJobDone` / job-state machine semantics (§5).
- The Customer → SPK → Unit drill-down IA itself (not shown by evidence to be the problem — the problem is *within* the third level, not the three-level structure).
- Job Detail (`/jobs/[id]`) internals — out of scope; Phase 1/Phase 2 invariants apply there and were not touched.
- NIBP GRID / Measurement GRID / Direct Measurement / measurement validation and save/diff logic — untouched, per explicit instruction.
- Any RBAC/capability gating logic.
- Existing API contracts — the recommended direction (H) uses parameters that already exist; nothing needs to change server-side.

---

## 17. Implementation Phasing Recommendation

(Audit-level only — no implementation performed.) If pursued, the smallest safe increment would be: (1) wire `search`/`status` params into `useJobsQuery`/`fetchAllAssignedJobs` scoped to the active SPK view, reusing the existing debounced-search hook already used in Job Detail; (2) add a status filter chip row and search input at the `DeviceList` level in `jobs-ui.tsx`, defaulting to "Semua" (no behavior change until a technician opts in); (3) only after real usage/feedback at the 100+ range, revisit whether (G) sequential Prev/Next is independently justified by confirmed workflow evidence. This phasing is offered only as a direction; it is not part of this audit's deliverable and was not implemented.

---

## 18. Open Questions / Unknowns

- **Not verified from available source**: whether technicians process high-volume-job units mostly sequentially, mostly by searching for a specific declared name, or in some other real-world pattern. No telemetry, analytics, or explicit product-requirement document was found in this repo addressing this. This is the single biggest unknown blocking a confident choice between (H) and (G) as the primary direction.
- **Not verified from available source**: actual client-side rendering/frame-timing behavior at 100+ `UnitRow`s on real field devices — this audit reasoned from component structure (§8), not from a profiled runtime measurement, because no dataset of this scale exists to run against in this repo.
- **Not verified from available source**: whether Next.js App Router scroll position is preserved when a technician returns from `/jobs/[id]` back to a scrolled `DeviceList` — no explicit scroll-restoration code (e.g. `sessionStorage` scroll cache) was found in `jobs-ui.tsx`/`page.tsx`, and default browser/Next.js back-navigation scroll behavior was not tested at runtime as part of this audit.
- **Unknown**: whether `qty` (and therefore worst-case single-SPK unit count) has any observed or planned ceiling above the reported 102 — no such business constant was found in the reviewed schema/service code.

---

## 19. Final Audit Verdict

A genuine scalability problem is confirmed at the high (51–100) and very-high (101–500, per the observed 102-unit case) stress ranges. The root cause is **findability/information-architecture**, not rendering performance: `apps/tech-pwa/src/app/jobs/jobs-ui.tsx`'s `DeviceList`/`UnitRow` renders every unit in one unfiltered, unsearchable list, using only `unitOrdinal` and a frequently-non-unique `customerDeclaredDeviceName` for recognition, while the backend (`GET /calibration-jobs`) already exposes `search`, `status`, `needsAction`, and even a purpose-built sibling-navigation endpoint that tech-pwa simply does not call. A secondary, independent data-fetching-architecture characteristic exists (`fetchAllAssignedJobs` eagerly fetches a technician's entire backlog across all SPKs to keep aggregate counts accurate) but is not demonstrated to be a current performance problem at the observed scale. No evidence supports recommending virtualization, pagination, or device-type/category grouping as the primary fix; a status filter combined with name search — both already backed by existing, unused API parameters and an existing proven search-UI pattern in this same app — is the smallest safe direction supported by the evidence, pending confirmation of actual technician workflow (sequential vs. search-driven) to decide whether the also-already-built `/siblings` Prev/Next endpoint should be adopted alongside it.
