# Calibration Management Portal Audit — High-Volume PO → Physical Device → Calibration Job Workflow

**Scope:** Portal only. No code changes made. No Prisma schema changes proposed. No business-rule or `deviceId` semantics changes proposed.

**Trigger case:** One real Purchase Order with 56 line items, 409 total physical units (e.g. Anasthesi With Ventilator qty 7, Syringe Pump qty 94).

**Primary file audited:** [apps/portal/src/app/management/calibration-jobs/[id]/page.tsx](apps/portal/src/app/management/calibration-jobs/[id]/page.tsx)

---

## 1. Executive Summary

The **domain model already supports** 409 individually-traceable physical units per Purchase Order without any schema change: `CalibrationJob` is fanned out one row per unit at Work Order start, keyed by `(workOrderId, purchaseOrderItemId, unitOrdinal)`, and device identity is deliberately left unresolved for multi-unit lines until a technician files an Identity Correction BA. This matches the stated business requirement ("identity confirmed later") exactly — it is not a gap.

The problem is **not primarily architecture**. It is a **combination of one concrete API/data-retrieval defect that silently breaks at >100 units per Work Order, plus a Portal UI/UX that was built and validated for small unit counts (the accordion/table patterns work fine at 7, are workable at 94, and become operationally unmanageable at 409)**.

Two findings are severity-critical because they are not merely "clunky UX" — they are **silent correctness gaps** that will misinform a Technical Manager at exactly the 409-unit scale this audit was commissioned to check:

1. **[apps/portal/src/app/management/calibration-jobs/use-calibration-jobs-query.ts:129-140](apps/portal/src/app/management/calibration-jobs/use-calibration-jobs-query.ts#L129-L140)** — the Work Order detail page fetches at most 100 of a Work Order's Calibration Jobs (hardcoded `pageSize=100`, justified in a comment by the assumption ">100 fanned-out units is not a real case"). That assumption is now false. Any PO line item whose units are created after the 100th job in fan-out order will show **no** "Identity Correction" / "Alat Referensi" indicator on the Work Order Items table, even when one exists.
2. **[apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts:794-850](apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts#L794-L850)** — the grouped Calibration Jobs list (`GET /calibration-jobs/grouped`, the Portal list page's data source) fetches **every matching CalibrationJob row for the whole company, unpaginated**, before grouping and slicing by WorkOrder. This runs on a 6-second poll for every open Portal tab.

Everything else — the accordion-per-job detail page, the SPK-grouped list, the per-job BA/QA review flow — is a reasonable architecture for this domain and does not need a redesign. It needs: a fix to the two items above, a small set of navigation/monitoring affordances for the 409-unit case, and no changes to `MeasurementResult`, `CalibrationTestPoint`, `JobCalibrationTestPoint`, `replicateIndex`, `direction`, `referenceValue`, tolerance architecture, or `deviceId` semantics.

---

## 2. Architecture Capability

**Confirmed capable — no schema change needed.**

- `CalibrationJob` ([packages/db/prisma/schema.prisma:2314](packages/db/prisma/schema.prisma#L2314)) carries `unitOrdinal` / `unitTotal`, frozen at fan-out, with `@@unique([workOrderId, purchaseOrderItemId, unitOrdinal])`. This is exactly a per-physical-unit row; there is no cardinality ceiling in the model.
- Fan-out ([apps/api/src/modules/work-orders/work-orders.service.ts:599-645](apps/api/src/modules/work-orders/work-orders.service.ts#L599-L645), `fanOutCalibrationJobs`) creates one `CalibrationJob` per unit per `WorkOrderItem.qty`, coerced to an integer, via a single `createMany`. For the audited PO this produces exactly 409 rows in one transaction. No practical row-count limit here.
- **Device identity is deliberately deferred**, exactly as this audit's context states it must be: `knownDeviceId = unitTotal === 1 ? item.purchaseOrderItem.deviceId ?? null : null` ([work-orders.service.ts:623-624](apps/api/src/modules/work-orders/work-orders.service.ts#L623-L624)). For any line with qty > 1 (Syringe Pump ×94), **no** device is pre-assigned to any of the 94 jobs — identity is established later per job via the Identity Correction BA flow. This is intentional, matches the business rule, and should not change.
- **One Work Order per Purchase Order is enforced**: `WorkOrdersService.create` throws `DUPLICATE_ACTIVE_WORK_ORDER` if an active WO already exists for the PO ([work-orders.service.ts:264-278](apps/api/src/modules/work-orders/work-orders.service.ts#L264-L278)). Consequence: **the entire 409-unit PO becomes exactly one SPK (Work Order) with 409 child Calibration Jobs.** This is the fact that concentrates all of this audit's stress-test concerns onto a single "expand one row" interaction in the Portal list.

**Conclusion:** the domain model correctly represents 409 individually-traceable units. The stress is entirely downstream, in how that one Work Order's 409 children are queried and rendered.

---

## 3. Current Portal UX Audit

### 3.1 List page — `/calibration-jobs`
File: [calibration-jobs-page-client.tsx](apps/portal/src/app/management/calibration-jobs/calibration-jobs-page-client.tsx), [calibration-jobs-ui.tsx](apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx)

- Two-level grouping: Customer (static header) → SPK/Work Order (collapsible, collapsed by default) → per-unit child rows (`CalibrationJobGroupTable` / `SpkGroupBody`, [calibration-jobs-ui.tsx:487-539](apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx#L487-L539)).
- Each collapsed SPK row already shows an aggregate **"N perlu tindakan"** badge (`ActionNeededBadge`, computed server-side as `actionNeededCount`) that links directly to the first actionable child job ([calibration-jobs-ui.tsx:355-374](apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx#L355-L374), [calibration-jobs.service.ts:844](apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts#L844)). This is a genuinely good affordance — a manager does **not** need to expand a 409-unit SPK to know whether anything in it needs attention.
- Filters available: free-text search, job status, Work Order id (via URL param only — see §3.3). **No filter exists for "needs action" / identity-incomplete / reference-equipment-pending across the whole list** — `calibrationJobListQuerySchema` supports `status`, `akdAklApprovalStatus`, `workOrderId`, `search`, `assignedToMe` but nothing keyed to `actionSignals` ([packages/shared/src/schemas/index.ts:~1299](packages/shared/src/schemas/index.ts)). The Portal filter UI (`CalibrationJobFilters`, [calibration-jobs-ui.tsx:288-343](apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx#L288-L343)) doesn't even expose the `akdAklApprovalStatus` filter that the schema already supports.
- Pagination is at the **Work Order** level (`page`/`pageSize`, capped at 100 via `calibrationJobListQuerySchema`, default 20). It does **not** paginate the children inside an expanded group.

### 3.2 Expanded SPK row — the 409-unit case
- `SpkGroupBody` renders `group.jobs.map(row => <JobChildRow .../>)` with **no pagination, no virtualization, and no in-group filter** ([calibration-jobs-ui.tsx:523-537](apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx#L523-L537)). Expanding the 409-unit SPK renders 409 `<tr>` rows into one native `<table>`.
- Each child row does carry inline, low-noise "needs attention" hints (`ChildActionHint`, an icon + short red text — [calibration-jobs-ui.tsx:393-400](apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx#L393-L400)), which helps visual scanning, but there is no way to filter the expanded list down to just the problem rows, or to jump to a specific unit ordinal.

### 3.3 Work Order detail page
File: [apps/portal/src/app/management/work-orders/[id]/page.tsx](apps/portal/src/app/management/work-orders/[id]/page.tsx), [work-orders-ui.tsx](apps/portal/src/app/management/work-orders/work-orders-ui.tsx)

- `WorkOrderItemsTable` ([work-orders-ui.tsx:440-524](apps/portal/src/app/management/work-orders/work-orders-ui.tsx#L440-L524)) is the **right aggregation level for monitoring**: it shows one row per PO line item (56 rows for this PO, not 409), with a rolled-up Identity Correction badge and a "Perlu Persetujuan Alat" badge per item.
- However, this rollup is computed from `useWorkOrderCalibrationJobs(workOrderId)`, which calls `GET /calibration-jobs?workOrderId=...&pageSize=100` ([use-calibration-jobs-query.ts:129-140](apps/portal/src/app/management/calibration-jobs/use-calibration-jobs-query.ts#L129-L140)). **This silently truncates at 100 jobs.** For a 409-job Work Order, roughly 3/4 of the jobs are invisible to this rollup, and any line item whose units fall past job #100 (in default `createdAt` order, i.e., fan-out/PO-item order) will show **no** badge even if a correction is pending or a reference-equipment approval is outstanding on one of its units. This is a correctness defect, not just a UX rough edge — it is documented in the source as a resolved design decision that the 409-unit PO now falsifies.
- There is **no direct link from a Work Order Item row to a job list filtered to that item's units** — see §3.4.
- There is **no aggregate completion metric** (e.g. "312/409 ACCEPTED_BY_QA") anywhere on this page or the Calibration Jobs list — only `jobCount` (total) and `actionNeededCount` (needs-attention count) are computed server-side. See §10.

### 3.4 Orphaned filter / missing drill-down
- The flat list route `/calibration-jobs?workOrderId=<id>` and its "Difilter untuk Work Order" banner + "Hapus filter WO" button are fully implemented client-side ([calibration-jobs-ui.tsx:330-340](apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx#L330-L340)) and server-side (`buildListWhere`, [calibration-jobs.service.ts:713](apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts#L713)), but **no page in the Portal links to that URL.** A repo-wide search found only the query-hook's own URL construction, not a single `<Link>` to it. This is a half-built drill-down: the pieces exist to let a manager click "view all 94 Syringe Pump jobs" from the Work Order Items table, but the entry point was never wired up.

### 3.5 Job detail page (`[id]/page.tsx`)
- Correctly scoped to **one physical unit**: accordion sections for Kontrol Alat (WOL only), Identitas, Alat Referensi, Hasil Pengukuran (full measurement grid + QA decision), Identity Corrections (BA list), Sertifikat. This is appropriately detailed for a single job and should **not** be compressed or duplicated across multiple units on one screen.
- **No sibling/unit navigation exists.** The only way to move from unit 37 of 94 to unit 38 of 94 is: click "Back to List" ([page.tsx:448-454](apps/portal/src/app/management/calibration-jobs/[id]/page.tsx#L448-L454)) → re-locate and re-expand the SPK (state is preserved via `expanded` URL param, so this is not a full reset) → scroll to find the next row → click "View" again. There is no "Next unit / Previous unit within this Work Order" control anywhere in the file.
- The page header does show `Unit {ordinal}/{total}` ([page.tsx:420](apps/portal/src/app/management/calibration-jobs/[id]/page.tsx#L420)), which correctly orients the viewer once they're on a job, but doesn't help them get to an adjacent one.

---

## 4. 409-Unit Stress Test

| Aspect | 7 units | 94 units | 409 units |
|---|---|---|---|
| Fan-out / creation | Fine | Fine | Fine — single transaction, no limit |
| Collapsed list, scanning for problems | Trivial | Trivial (badge + count) | **Trivial** — the parent-level `actionNeededCount` badge means a manager never has to look at 409 rows just to know "is anything wrong here" |
| Expanding the SPK to browse units | Fine, 7 rows | Long but scrollable, 94 rows | **Unmanageable as a browsing tool** — 409 unpaginated rows in one table body, no jump/filter/search-within-group |
| Finding one specific unit (e.g. "the Syringe Pump that's still PENDING") | Trivial | Manageable by eye | **Impractical** — must scroll ~400 rows relying on `ChildActionHint` icons alone |
| Work Order Items rollup (56 lines) | N/A (single item) | Correct — under the 100-job query cap | **Silently wrong** for items whose units fall past job #100 — badges disappear, not "loading" or "error", just absent |
| Moving between adjacent units | One click back+forward | One click, some scrolling | **Same manual round-trip repeated up to 409 times** — no adjacency navigation exists at any scale, but the cost is only noticeable at high volume |
| Reviewing/approving one unit's measurement + BA | Fine (per-job detail is well-built) | Fine | Fine — this part of the UX does not degrade with volume, because it is correctly one-job-at-a-time |
| Identical-device-type disambiguation before identity is known | Low risk (7 rows) | Moderate risk (94 identical rows differing only by ordinal) | **Real risk** — 94 or more sibling rows share identical declared name/AKD-AKL by design; ordinal number is the only distinguishing key, and skimming a long list for "unit 73, not 37" is error-prone |

**Bottom line:** nothing about 409 vs. 94 breaks the system technically (no crash, no query error) — the domain model and the per-job workflows hold up. What breaks is a human's ability to *navigate, monitor, and avoid mis-identifying* individual units at that volume, plus the one concrete data-truncation bug in §3.3.

---

## 5. Critical Problems / Risks

Ordered by severity.

1. **Silent data truncation on the Work Order Items rollup** (§3.3) — `useWorkOrderCalibrationJobs` caps at 100 jobs; a Work Order with >100 fanned-out units gets an incomplete/wrong "Alat Referensi" / "Identity Correction" indicator with no error, warning, or "showing 100 of 409" disclosure. **This directly affects the audited PO.**
2. **Unbounded full-table fetch on every poll of the grouped list** — `findAllGroupedByWorkOrder` ([calibration-jobs.service.ts:794-850](apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts#L794-L850)) has no `skip`/`take` on its `findMany`; it loads every `CalibrationJob` matching the current filters (which, with no filters, is every job the company has ever had) with a multi-relation `include`, then groups/paginates in memory. This runs every 6 seconds per open Portal tab (`refetchInterval: 6000`, [use-calibration-jobs-query.ts:104](apps/portal/src/app/management/calibration-jobs/use-calibration-jobs-query.ts#L104)). It will only get heavier as job history accumulates across POs over time — this is a scaling risk independent of any single PO's size.
3. **A returned "page" is not actually small** — because pagination happens after grouping, a page of (say) 20 Work Orders can still ship all of their children unpaginated. If a handful of those 20 Work Orders each have hundreds of units, one HTTP response carries thousands of full job objects.
4. **No practical way to browse or search within a large expanded group** — 409 rows, one native table, no virtualization/sub-pagination/in-group filter (§3.2).
5. **No sibling navigation on the job detail page** — repeated manual round-trips to review/approve a run of adjacent units (§3.5).
6. **Orphaned per-item drill-down** — the `workOrderId` filter and its UI exist but nothing links to it from the Work Order page (§3.4), so the one navigation model that would scope 409 jobs down to "this line item's N units" isn't reachable.
7. **No aggregate completion/status breakdown** — a manager cannot see "312/409 done, 40 in progress, 57 pending" for a large Work Order at a glance; only a binary "needs action" count exists (§10).
8. **Identical-sibling disambiguation relies solely on ordinal number** — acceptable given identity is genuinely unknown pre-BA, but nothing (list or detail) surfaces any other distinguishing cue (e.g., which units already have a device assigned vs. not) to reduce the chance of opening/acting on the wrong ordinal at 94–409 scale.

---

## 6. Recommended Portal UX / Information Architecture

These are recommendations only — not scoped for implementation here, and none of them require a domain-model change.

- Treat the **Work Order Items table (56 rows)** as the primary monitoring surface for a large PO, not the exploded 409-row child table. It is already the right shape; it just needs its data source fixed (§3.3) and a drill-down link added (§3.4/§6 below).
- Add the missing **drill-down link** from each Work Order Item row to `/calibration-jobs?workOrderId=<id>&purchaseOrderItemId=<id>` (or equivalent), scoping the flat list to just that line item's units (7, or 94, or whatever N is) — this reuses filtering machinery that already exists server-side, minus a `purchaseOrderItemId` query param that would need to be added to the existing `calibrationJobListQuerySchema`/`buildListWhere` (additive, not a redesign).
- Within a scoped/expanded list of many units, add a lightweight **client-side or server-side sub-filter** ("show only: needs action / pending / done") scoped to that one Work Order or line item — much cheaper than a company-wide action-signal filter and directly addresses "find the 6 problem units among 409".
- Consider **paginating or virtualizing child rows inside an expanded SPK** once `jobCount` exceeds some threshold (e.g., 50), while leaving small groups (7, 20) exactly as they render today.

---

## 7. Recommended List / Detail / Navigation Model

- **List → Group → Item-row → Scoped unit list → Unit detail**, i.e. insert one more level between "expand SPK" and "409 raw rows": the existing Work Order Items table already provides that level for the Work Order page; the Calibration Jobs list page currently jumps straight from SPK to all-units-flat and would benefit from the same line-item grouping (56 items instead of 409 units) with a secondary expand for a given item's units.
- Add **Next / Previous unit** controls on the job detail page, scoped to the current Work Order (and optionally the current line item), so a reviewer working through a run of Syringe Pumps doesn't return to the list between each one.
- Preserve the existing **"Back to List" + `expanded` URL state** mechanism — it already avoids a full reset when returning, which is good and should not be redesigned.

---

## 8. Identity Verification UX

- Confirmed facts only: for qty > 1 line items, no device is pre-assigned ([work-orders.service.ts:623-624](apps/api/src/modules/work-orders/work-orders.service.ts#L623-L624)); the job detail page's "Identitas" section shows `job.device` only if already assigned, otherwise states "Belum ada device yang di-assign. Identitas fisik dikonfirmasi lewat Berita Acara Koreksi Identitas" ([page.tsx:564-583](apps/portal/src/app/management/calibration-jobs/[id]/page.tsx#L564-L583)).
- The "Identity Correction" flow (BA submission/approval) operates strictly **one job at a time** — `useSubmitIdentityCorrection` / `useDecideIdentityCorrection` both take a single `jobId`/`correctionId` ([use-identity-corrections-query.ts](apps/portal/src/app/management/calibration-jobs/use-identity-corrections-query.ts)). No batch submission or batch decision endpoint exists anywhere in `calibration-jobs.controller.ts`.
- This is consistent with the business rule that each unit's identity must be individually confirmed, and the per-rules instruction not to assume bulk approval is appropriate is respected here: **there is currently no bulk mechanism to evaluate**, only the fact that none exists.
- Recommendation (not scoped for implementation): the list-level "needs action" affordances already correctly surface *which* jobs have a pending Identity Correction; the main improvement opportunity is navigational (§7), not workflow-level.

---

## 9. BAI Review / Approval UX

- Quality Review (`QualityReviewPanel`, [page.tsx:1782 onward](apps/portal/src/app/management/calibration-jobs/[id]/page.tsx#L1782)) renders the **full per-job measurement grid** (every parameter, test point, direction, replicate) for one job, with Approve/Reject actions. This is appropriately detailed and appropriately scoped to one job — per this audit's constraint, hundreds of these should never be shown simultaneously, and the current design does not attempt to.
- Identity Correction BAs (`CorrectionCard`, [page.tsx:2049 onward](apps/portal/src/app/management/calibration-jobs/[id]/page.tsx#L2049)) are likewise listed and decided per job.
- Both review types are reachable directly from the list's action badges (`calibrationJobActionFocusHref` scrolls/expands the right section on arrival), so a manager going one-by-one through flagged units does not need to manually find the right accordion section each time — this part of the flow already scales reasonably well *once you are on the right job*. The gap is entirely in getting to the *next* right job (§5, §7).

---

## 10. Aggregate Progress / Monitoring

- Confirmed: the only aggregate figures computed anywhere are `jobCount` (total units in a Work Order) and `actionNeededCount` (units with ≥1 active action signal) — both in `CalibrationJobWorkOrderGroup` ([calibration-jobs.service.ts:667-674](apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts#L667-L674)). No breakdown by `CalibrationJobStatus` (PENDING / IN_PROGRESS / SUBMITTED / REWORK / ACCEPTED_BY_QA) exists at the group level, in the API or the UI.
- For a 409-unit Work Order, a manager currently cannot answer "how far along are we" without opening the group and eyeballing (or, today, without the group even rendering practically — §3.2).
- Recommendation: extend the already-server-computed group aggregate with a status-count breakdown (cheap to add to `findAllGroupedByWorkOrder`'s existing per-group reduce) — additive to the existing shape, no schema change.

---

## 11. What Can Stay As-Is

- The `CalibrationJob` data model, fan-out mechanism, and unresolved-identity-until-BA design (Phase 4 invariants: natural key, `CalibrationTestPoint`, `JobCalibrationTestPoint`, `replicateIndex`, `direction`, `referenceValue`, tolerance architecture, `logicalTestKey`/`logicalTestSequence`) — all untouched by this audit's findings and not implicated by any of them.
- The Customer → SPK grouping and collapsed-by-default list pattern, and the server-computed `actionNeededCount` badge with direct-link-to-first-actionable-job — this already solves "don't make me open 409 rows just to know if something's wrong."
- The per-job detail page's accordion structure and its correct single-job scope for identity, reference equipment, measurement/QA review, corrections, and certificate — appropriately detailed, appropriately not compressed across units.
- The one-job-at-a-time Identity Correction and Quality Review decision flows.
- The `expanded`-in-URL state mechanism for the list page.
- `deviceId` semantics and all business rules around identity confirmation timing.

## 12. What Must Change

*(Findings the audit considers necessary to address for the Portal to be trustworthy at 409-unit scale — not implemented here.)*

- Fix the 100-job cap silently truncating the Work Order Items rollup (§3.3 / §5.1).
- Fix the unbounded full-table fetch in `findAllGroupedByWorkOrder` so a "page" of Work Orders doesn't require loading the company's entire job history plus every child of every returned group (§3.1 / §5.2–3).
- Wire up (or remove) the orphaned `workOrderId`-filtered list drill-down (§3.4).

## 13. What Should NOT Change

- Do not attempt to display many jobs' full detail (measurement grids, BA content) simultaneously — the per-rules constraint against this is correct; the existing one-job-at-a-time review UI should remain the pattern.
- Do not introduce bulk approval of Identity Corrections or Quality Reviews as a default assumption — no evidence in this codebase suggests it is safe or intended, and efficient navigation is a distinct problem from bulk approval.
- Do not change `CalibrationJob`'s natural key, fan-out mechanism, or the deferred-identity design — all are correctly serving the stated business requirement.
- Do not add a `JobApplicableParameter` or a parameter snapshot mechanism — out of scope and unrelated to the volume problem identified here.

---

## 14. Files/Components Affected

Portal:
- [apps/portal/src/app/management/calibration-jobs/[id]/page.tsx](apps/portal/src/app/management/calibration-jobs/[id]/page.tsx) — job detail; candidate for Next/Previous unit navigation.
- [apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx](apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx) — list/group table, filters, badges.
- [apps/portal/src/app/management/calibration-jobs/calibration-jobs-page-client.tsx](apps/portal/src/app/management/calibration-jobs/calibration-jobs-page-client.tsx) — list page state/query wiring.
- [apps/portal/src/app/management/calibration-jobs/use-calibration-jobs-query.ts](apps/portal/src/app/management/calibration-jobs/use-calibration-jobs-query.ts) — `useWorkOrderCalibrationJobs` 100-cap; grouped-list query.
- [apps/portal/src/app/management/work-orders/[id]/page.tsx](apps/portal/src/app/management/work-orders/[id]/page.tsx) — Work Order detail, consumes the capped query.
- [apps/portal/src/app/management/work-orders/work-orders-ui.tsx](apps/portal/src/app/management/work-orders/work-orders-ui.tsx) — `WorkOrderItemsTable`; candidate for the missing drill-down link.

Backend/API:
- [apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts](apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts) — `findAll`, `findAllGroupedByWorkOrder` (lines 752-850), `calibrationJobInclude` (lines 63-157).
- [apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts](apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts) — `GET /calibration-jobs`, `GET /calibration-jobs/grouped`.
- [apps/api/src/modules/work-orders/work-orders.service.ts](apps/api/src/modules/work-orders/work-orders.service.ts) — `fanOutCalibrationJobs` (lines 599-645), WO-per-PO uniqueness guard (lines 264-278).
- [packages/shared/src/schemas/index.ts](packages/shared/src/schemas/index.ts) — `calibrationJobListQuerySchema` (~line 1299), `pageSize` capped at 100.
- [packages/shared/src/utils/calibration-job-action-signals.ts](packages/shared/src/utils/calibration-job-action-signals.ts) — `jobNeedsAction`, `actionBadgeLabel`.

Not audited (out of scope per instructions): Tech-PWA, any file under `apps/tech-pwa`.

---

## 15. Backend/API Impact, if any

Confirmed impact areas (facts, not proposed diffs):
- `findAllGroupedByWorkOrder` needs a query strategy that doesn't require loading every matching job to paginate Work Orders — e.g. first resolving the page's `workOrderId`s, then fetching only their jobs. This is a query-implementation change, not a schema or domain change.
- `useWorkOrderCalibrationJobs`'s 100-item cap needs to either be raised, removed in favor of a purpose-built "rollup by item" endpoint, or replaced with a dedicated aggregate query — any of which is additive to the existing API surface.
- A `purchaseOrderItemId` filter on `GET /calibration-jobs` would enable the missing per-item drill-down (§3.4/§6) — additive to `calibrationJobListQuerySchema`/`buildListWhere`.
- A status-count breakdown per Work Order group (§10) is an additive field on the existing grouped-list response.

None of the above requires touching `CalibrationJob`'s schema, its natural key, or any Phase 4 invariant.

## 16. Frontend Impact

- List page: add per-Work-Order-item grouping (mirroring `WorkOrderItemsTable`'s 56-row shape) as an intermediate level before exploding to individual units, plus a sub-filter for large expanded groups.
- Work Order detail page: once the API rollup is fixed, add the drill-down link from each item row into a scoped unit list.
- Job detail page: add Next/Previous unit controls scoped to the current Work Order.
- None of this requires touching the measurement grid, BA, or certificate accordion sections — they are correctly single-job-scoped already.

## 17. Open Questions / Decisions Required

1. Should the Calibration Jobs list page group by **PO line item** (56 rows) as an intermediate level under each SPK, mirroring the Work Order Items table, or is a sub-filter inside the existing flat expansion sufficient? This is a product decision, not something this audit can settle unilaterally.
2. What is the right threshold for "large group" behavior (pagination/virtualization inside an expanded SPK) — 50 units? 100? Should it match the existing `pageSize` cap of 100 used elsewhere in the schema for consistency?
3. Is a company-wide "everything needing action across all SPKs" flat view wanted, or is the existing per-SPK `actionNeededCount` + drill-in pattern considered sufficient once navigation is improved? (No such flat filter exists today — see §3.1.)
4. Should the Next/Previous unit navigation on the job detail page be scoped to "this Work Order" only, or further scoped to "this PO line item" (e.g., only step through the 94 Syringe Pumps, not the other 55 line items in between)?
5. Priority/sequencing between the two backend defects (§12) and the UX additions (§6-§7, §10) — the backend defects are correctness bugs independent of any UX work and could be fixed first without waiting on a navigation-model decision.

---

*End of audit. No implementation performed.*
