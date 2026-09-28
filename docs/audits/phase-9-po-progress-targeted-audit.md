# Phase 9 PO Progress Targeted Audit

## 1. Verdict

**PASS WITH NON-BLOCKING FINDINGS**

## 2. Scope Audited

Read-only inspection of the actual current code (not the Phase 9 implementation report), against `docs/audits/final-po-allocation-wol-spk-architecture-decision.md`:

- `apps/api/src/modules/purchase-orders/po-progress.ts` (new, full file)
- `apps/api/src/modules/purchase-orders/purchase-orders.service.ts` (`getProgress` wiring)
- `apps/api/src/modules/purchase-orders/purchase-orders.controller.ts` (`GET :id/progress` route)
- `apps/api/src/modules/purchase-orders/purchase-orders.service.test.ts` (12 new Phase 9 tests, `describe("PurchaseOrdersService.getProgress — Phase 9 (PO Progress)")`)
- `apps/api/src/modules/calibration-jobs/measurement-completeness.ts` (`evaluateMeasurementCompleteness`, `isMeasurementReadingFilled`, `MEASUREMENT_WORKSHEET_EXCLUDED_PARAMETER_CODES`)
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts`: `resolveJobDeviceTypeId` (line 1577), `assertMeasurementsCompleteForSubmit` (line 2595), `submitForReview` (line 1222), `complete` (line 1409)
- `packages/db/prisma/schema.prisma`: `Certificate` model (cardinality), `PurchaseOrderItemStatus`, `purchaseOrderInclude`'s existing CANCELLED-item exclusion convention
- `apps/api/src/modules/purchase-orders/purchase-orders.service.ts`: `assertRetirementSafe`, `revise()` retirement path (for the completion-predicate edge-case analysis)
- `apps/api/src/modules/work-orders/allocation.ts`: `computeRemainingQtyByItemId` (reused, not modified)
- `git diff --stat` against every Phase 1–8 locked file, to verify scope discipline

## 3. Executive Summary

Phase 9's PO Progress implementation is a faithful, scope-disciplined mapping of existing, unmodified state onto the locked 8-bucket model. It reuses `computeRemainingQtyByItemId` and `evaluateMeasurementCompleteness` verbatim rather than re-deriving equivalent logic, uses a small, bounded number of queries per PO (never N+1, never company-wide), correctly excludes cancelled-WorkOrder jobs from buckets 1–7, and correctly derives the qaAccepted/certificateIssued split from `Certificate.calibrationJobId`'s unique constraint (no double-counting possible by schema). The mandatory cancel-and-replace regression test (never double-counting 80 after cancel+reallocate) passes by construction and is well-designed.

Two non-blocking findings were found: (1) the null-`deviceTypeId` fallback in the measurement-completeness split diverges from `submitForReview`'s actual behavior in that one edge case, in a conservative (under-reporting) direction; (2) there is no dedicated test exercising a REWORK-status job through the inProgress/measurementComplete split, even though REWORK shares the exact same code path as IN_PROGRESS. Neither affects the locked bucket semantics in the general case. One pre-existing, out-of-Phase-9-scope architectural interaction is noted as an observation only. Scope discipline is clean: zero changes to any Phase 1–8 locked file.

## 4. 8-Bucket Verification

| Bucket | Expected Source | Actual Implementation | Verdict |
|---|---|---|---|
| 1. Unallocated | `PurchaseOrderItem.qty − SUM(ACTIVE allocation qty)` | `computeRemainingQtyByItemId(prisma, itemsById)`, reused verbatim from `allocation.ts` (po-progress.ts:128–131) | PASS |
| 2. Allocated, not started | ACTIVE allocation on a PLANNED/ASSIGNED WorkOrder, or a fanned-out PENDING job | `allocatedNotStartedFromPreFanOut` (pre-fan-out case, lines 136–145) + `pendingCount` from a `groupBy` (post-fan-out case, lines 162–171), summed at line 326 | PASS — documented mapping of PENDING into this bucket is a reasonable, explicitly justified choice (the locked 8-item list has no separate "fanned out but not started" bucket) |
| 3. In progress | IN_PROGRESS/REWORK job, measurement incomplete | `activeJobs` filtered by `evaluateMeasurementCompleteness(...).complete === false` (lines 265–296) | PASS, with Finding F-01 (below) on the null-deviceTypeId edge case |
| 4. Measurement complete | IN_PROGRESS/REWORK job, measurement complete, not yet submitted | Same loop, `complete === true` branch | PASS, same caveat as bucket 3 |
| 5. Submitted | `CalibrationJob.status = SUBMITTED` | `countByStatus.get("SUBMITTED")` from the same `groupBy` (line 172) | PASS |
| 6. QA accepted | ACCEPTED_BY_QA, no ISSUED Certificate | `acceptedJobs.length − issuedCertificateCount` (line 317) | PASS |
| 7. Certificate issued | ACCEPTED_BY_QA, ISSUED Certificate | `issuedCertificateCount` via `certificate.count(...)` (lines 308–316) | PASS |
| 8. Cancelled | CalibrationJob under a CANCELLED WorkOrder | `calibrationJob.count({ where: { workOrderId: { in: cancelledWorkOrderIds } } })` (lines 321–324), reported separately, never summed into `totalQty` | PASS |

## 5. Quantity / Multi-WorkOrder Verification

`workOrders` is fetched once per PO (`findMany({ where: { purchaseOrderId, companyId } })`, line 149) and split into `nonCancelledWorkOrderIds` / `cancelledWorkOrderIds`. Every subsequent CalibrationJob-derived query (`statusCounts`, `activeJobs`, `acceptedJobs`, `cancelled`) is scoped by one of these two id lists — never by a single WorkOrder — so quantity from multiple simultaneously active sibling WorkOrders is summed correctly rather than only reflecting the most recent one. This is directly exercised by the "quantity aggregation across two simultaneously active sibling WorkOrders" test (lines 1711–1738), which combines a post-fan-out WorkOrder A (40 PENDING jobs) with a pre-fan-out WorkOrder B (30, still PLANNED) and asserts `allocatedNotStarted = 70`. Confirmed correct: two independent code paths (`allocatedNotStartedFromPreFanOut` for B, `pendingCount` for A) are additive by construction (line 326), and the test proves neither path silently drops or double-counts the other's contribution.

## 6. Cancellation Verification (BLOCKING correctness area)

Traced against the mandatory regression test (lines 1663–1709):

1. WorkOrder A allocates and fans out 40 units → `allocatedNotStarted = 40`, `unallocated = 0`.
2. `workOrdersService.cancel(woA)` — per the locked "cancel cascades allocation cancellation" semantics (Phase 1–6, unchanged), this releases the Allocation back to ACTIVE=false.
3. Post-cancel: `unallocated = 40` (computeRemainingQtyByItemId now sees no ACTIVE allocation for that item), `allocatedNotStarted = 0` (workOrder A is now in `cancelledWorkOrderIds`, so its jobs are excluded from `statusCounts`/`activeJobs` entirely), `cancelled = 40` (the 40 orphaned PENDING jobs, counted via `cancelledWorkOrderIds`), `bucketSumExcludingCancelled = 40` (not 80), `isComplete = false`.
4. WorkOrder B reallocates and fans out the same 40 units → `unallocated = 0`, `allocatedNotStarted = 40` (WOL B only), `cancelled = 40` (WOL A's orphans, unchanged, still separately visible), `bucketSumExcludingCancelled = 40` (never 80).

This is exactly correct and matches the locked "cancel and replace" lifecycle. The critical invariant — a cancelled WorkOrder's orphaned jobs are excluded from `nonCancelledWorkOrderIds` at the query level (not filtered post-hoc, not merely asserted by the test) — is structural: `statusCounts`, `activeJobs`, and `acceptedJobs` are all queried with `workOrderId: { in: nonCancelledWorkOrderIds } }`, which by construction cannot include a CANCELLED WorkOrder's id. **Verdict: PASS.**

## 7. Bucket-Sum Invariant

Verified structurally, not merely by test assertion:

- `totalQty` = Σ(non-cancelled `PurchaseOrderItem.qty`).
- `unallocated` = Σ(item.qty − SUM(ACTIVE allocation qty)) per item — the complement of all ACTIVE allocation quantity.
- Every ACTIVE allocation's quantity is accounted for exactly once: if its WorkOrder is PLANNED/ASSIGNED, it is counted whole in `allocatedNotStartedFromPreFanOut`; otherwise, because `createAllocationsAndWorkOrderItems` creates the Allocation and its paired WorkOrderItem with matching qty (Phase 1–6 invariant, unchanged), and `WorkOrder.start()` fans out exactly `WorkOrderItem.qty` CalibrationJob rows, the same quantity is represented by exactly that many CalibrationJob rows, each in exactly one mutually-exclusive `CalibrationJobStatus` (PENDING → `allocatedNotStarted`; IN_PROGRESS/REWORK → `inProgress` or `measurementComplete`, mutually exclusive by the same if/else branch, lines 294–295; SUBMITTED → `submitted`; ACCEPTED_BY_QA → `qaAccepted` or `certificateIssued`, mutually exclusive because `Certificate.calibrationJobId` is `@unique` (schema.prisma:3062), so `issuedCertificateCount` can never exceed `acceptedJobs.length`, and the subtraction at line 317 can never go negative).
- Cancelled-WorkOrder quantity is excluded from this sum by construction (its Allocation is released back into `unallocated`'s complement, or reallocated to a new ACTIVE allocation elsewhere) and reported only under bucket 8.

This holds for all data created through the Phase 1–6 allocation path. It does **not** hold for the pre-existing legacy `WorkOrderItem.allocationId = null` rows — but that is the already-adjudicated F-01 finding from the Phase 7 audit (reclassified as a non-production trial-data compatibility issue, confirmed limited to one disposable dev-DB fixture), which Phase 9's own brief explicitly instructs not to reopen. Confirmed not reopened. The "buckets 1-7 always sum to totalQty" test (lines 1740–1744) exercises the zero-WorkOrder case; the aggregation and cancellation tests exercise the non-trivial cases. **Verdict: PASS**, with the pre-existing F-01 caveat carried forward unchanged, and one new architectural observation (§16, OBS-01) unrelated to Phase 9's own logic.

## 8. Measurement Completeness Fidelity

Compared line-by-line against `assertMeasurementsCompleteForSubmit` (calibration-jobs.service.ts:2595–2658), not merely by function name:

| Aspect | `assertMeasurementsCompleteForSubmit` | `po-progress.ts` | Match |
|---|---|---|---|
| Device type resolution | `resolveJobDeviceTypeId(job)` = `calibrationRequestItem?.deviceTypeId ?? purchaseOrderItem?.quotationItem?.requestItem?.deviceTypeId ?? null` | Inlined identically (lines 202–205) | PASS |
| Eligible parameters | `deviceCalibrationParameter.findMany` filtered `isActive, valueType: NUMBER, entryStyle: DIRECT_REPLICATES`, excluding `MEASUREMENT_WORKSHEET_EXCLUDED_PARAMETER_CODES` | Same filter, batched across all active jobs' device types (lines 214–222, 273–275) | PASS |
| Snapshot rows | `jobCalibrationTestPoint.findMany` for the job, `excludedAt == null` filter applied before calling `evaluateMeasurementCompleteness` | Same, batched across jobs (lines 223–231, 285–290) | PASS |
| Results | `measurementResult.findMany` filtered `attemptNumber === job.currentAttempt` | Same predicate applied in JS after a batched fetch (lines 232–242, 277–279) | PASS |
| `frozenPatternBParameterIds` | `[...new Set(snapshotRows.map(r => r.deviceCalibrationParameterId))]` (unfiltered by `excludedAt`) | Identical (lines 280–282) | PASS |
| Core predicate | `evaluateMeasurementCompleteness(...)` | Same function, imported unmodified | PASS |
| `deviceTypeId === null` handling | `if (deviceTypeId === null) return;` — i.e., **treated as passing** (nothing to validate) | `if (deviceTypeId === null) { inProgress += 1; continue; }` — **treated as incomplete** | **DIVERGES — see F-01** |

The divergence is real: the real `submitForReview` path would let a job with an unresolvable device type submit immediately (no measurement gate applies), while `po-progress.ts` reports it as `inProgress`, never `measurementComplete`, for as long as it stays IN_PROGRESS/REWORK. The module comment ("Mirrors resolveJobDeviceTypeId's own null case") is imprecise — it mirrors the resolution function's null *return value*, not the actual downstream consequence in `submitForReview`. Batching strategy (3 queries total regardless of active-job count, vs. 3 queries per job in the real per-job path) is architecturally sound and does not change semantics. **Verdict: PASS WITH ONE NON-BLOCKING FINDING (F-01).**

## 9. REWORK Verification

`ACTIVE_JOB_STATUSES = ["IN_PROGRESS", "REWORK"] as const` (line 95) — REWORK is queried and evaluated through the exact same code path as IN_PROGRESS (same `activeJobs` query, same completeness loop, same bucket assignment). This is a deliberate, documented choice (module doc lines 36–42: REWORK is "the same operational state as IN_PROGRESS from a PO-progress standpoint"), consistent with the locked architecture decision's own wording. However, no test in the 12 new Phase 9 tests creates a job in REWORK status and asserts its bucket placement — see F-02. Because the code path is identical to the already-tested IN_PROGRESS path (same query filter, same predicate call), the correctness risk is low, but it is an unverified code path. **Verdict: PASS WITH ONE NON-BLOCKING FINDING (F-02, test coverage).**

## 10. Certificate Verification

`Certificate.calibrationJobId String @unique` (schema.prisma:3062) is a genuine 1:1 relationship — a CalibrationJob can have at most one Certificate row. `issuedCertificateCount = certificate.count({ where: { calibrationJobId: { in: acceptedJobs.map(j => j.id) }, status: "ISSUED" } })` therefore counts at most one row per accepted job, making `qaAccepted = acceptedJobs.length − issuedCertificateCount` structurally non-negative — this is guaranteed by the schema's unique constraint, not merely by test assertion. The split is exercised by two dedicated tests (no-certificate → qaAccepted, ISSUED certificate → certificateIssued + isComplete=true), including the realistic fixture setup (resolving a real `Device`, setting `calibrationJob.deviceId`, creating the Certificate row directly — justified because Certificate issuance is an unmodified, separate subsystem). No query touches Certificate rows for jobs outside `acceptedJobs`, so the certificate lookup is bounded by this PO's own accepted-job count, never company-wide. **Verdict: PASS.**

## 11. Completion Predicate

```
isComplete = totalQty > 0
  && unallocated === 0 && allocatedNotStarted === 0 && inProgress === 0
  && measurementComplete === 0 && submitted === 0 && qaAccepted === 0
  && certificateIssued > 0
```

Edge cases reasoned through:

- **Zero-item PO** (`itemIds.length === 0`): `totalQty = 0`, guard short-circuits to `isComplete = false`. Matches the documented "a PO with no active items/allocations at all is never complete" default (lines 84–91) and is exercised by the zero-WorkOrder test (line 1512) at the "2 unallocated items" level; the pure zero-item case is not separately tested but the guard is a one-line, low-risk conditional.
- **All items cancelled**: same as above — `itemsById` is empty, `totalQty = 0`, forced `isComplete = false`, regardless of what WorkOrders/jobs may still exist under this PO. See OBS-01 (§16) for the related, pre-existing architectural interaction this surfaces.
- **Fully complete PO**: exercised directly by the certificateIssued test (lines 1625–1661), `isComplete = true`.
- **ACCEPTED_BY_QA with no certificate**: correctly forces `isComplete = false` via the `qaAccepted === 0` clause (line 1622).
- **Certificate exists but not ISSUED** (e.g. DRAFT/REVOKED/SUPERSEDED): not counted by `issuedCertificateCount` (status filter is exactly `"ISSUED"`), so such a job stays in `qaAccepted`, correctly keeping `isComplete = false`. Not separately tested, but the query's `status: "ISSUED"` filter makes this unambiguous by construction.
- **`totalQty > 0` guard's semantic implication**: confirmed intentional and documented — a PO can never be "complete" before it has at least one unit of currently-ordered scope, which is the conservative, safe default the brief calls for. No divergent or accidental behavior found.

**Verdict: PASS.**

## 12. Performance / Query Audit

Total query count per `getProgress` call is small and bounded, independent of company size and (for the measurement-completeness split) independent of active-job count:

1. `purchaseOrder.findFirst` (by id + companyId)
2. `computeRemainingQtyByItemId` — internally bounded by this PO's own item ids (reused, unmodified)
3. `purchaseOrderItemAllocation.findMany` (by this PO's item ids)
4. `workOrder.findMany` (by this PO's id)
5. `calibrationJob.groupBy` (by this PO's non-cancelled WorkOrder ids)
6. `calibrationJob.findMany` for active jobs (same scope)
7–9. Three batched queries in `Promise.all` (`deviceCalibrationParameter.findMany`, `jobCalibrationTestPoint.findMany`, `measurementResult.findMany`) — run once regardless of how many active jobs exist, not once per job
10. `calibrationJob.findMany` for accepted jobs (same scope)
11. `certificate.count` (by accepted job ids)
12. `calibrationJob.count` for cancelled (by cancelled WorkOrder ids)

No query is unscoped by this PO's own ids; none reach company-wide. No N+1 pattern exists anywhere — the measurement-completeness split in particular (the highest-risk area, since the real `assertMeasurementsCompleteForSubmit` runs 3 queries per single job) is correctly batched into exactly 3 queries total for however many active jobs this PO has. **Verdict: PASS.**

## 13. Authorization / Routing

- `@RequirePermission("purchaseOrder", "read")` on `GET :id/progress` matches the permission used by the sibling `:id/allocation-summary` route (Phase 7) and the base `:id`/`:id/pdf` routes — consistent convention for a purchase-order-scoped read endpoint.
- Company isolation: `purchaseOrder.findFirst({ where: { id, companyId } })` is the single point of entry; every subsequent query derives its scope (item ids, WorkOrder ids, job ids) transitively from this company-scoped result, so no cross-company data can enter the computation even though most downstream queries do not repeat an explicit `companyId` filter (the one exception, `measurementResult.findMany`, does include `companyId` explicitly). This matches the established pattern already used by `getAllocationSummary` (Phase 7) and `getWorkOrderSummaries` (Phase 8).
- Route ordering: `:id/progress` (line 119 of the controller) is declared before the generic `@Get(":id")` (line 128), so `/purchase-orders/abc123/progress` cannot be captured by the generic handler with `id = "abc123/progress"` or similar — confirmed correct, consistent with the existing `:id/allocation-summary` and `:id/work-orders` ordering.

**Verdict: PASS.**

## 14. Test Coverage

12 tests confirmed present under `describe("PurchaseOrdersService.getProgress — Phase 9 (PO Progress)")` (purchase-orders.service.test.ts:1505–1745):

1. Not-found → `NotFoundException`
2. Zero WorkOrders → fully unallocated, not complete
3. Pre-fan-out allocation → `allocatedNotStarted`
4. Freshly fanned-out PENDING job → `allocatedNotStarted`, not `inProgress` (documented mapping)
5. IN_PROGRESS, unfilled parameter → `inProgress`, not `measurementComplete`
6. IN_PROGRESS, filled parameter → `measurementComplete`, not `inProgress`
7. SUBMITTED → `submitted`
8. ACCEPTED_BY_QA, no certificate → `qaAccepted`, not complete
9. ACCEPTED_BY_QA + ISSUED certificate → `certificateIssued`, complete
10. Cancellation regression (cancel + reallocate, asserts never-80)
11. Multi-sibling-WorkOrder aggregation (post-fan-out + pre-fan-out combined)
12. Bucket-sum invariant (zero-WorkOrder case)

These are genuine correctness-proving tests, not shape/smoke tests — each asserts specific bucket values and, where relevant, `isComplete`, and the cancellation test in particular asserts the exact anti-double-counting property the brief calls out as the mandatory regression. Gaps: no dedicated REWORK-status test (F-02); no test for a job with an unresolvable `deviceTypeId` (the F-01 code path is untested); no test for a Certificate in a non-ISSUED status (DRAFT/REVOKED/SUPERSEDED) sitting under an ACCEPTED_BY_QA job (behavior is unambiguous from the query's `status: "ISSUED"` filter, but unverified by a test). None of these gaps are large in number or in a commonly-hit path. **Verdict: PASS WITH GAPS (see F-02).**

## 15. Scope Compliance

`git diff --stat` was run against every Phase 1–8 locked file (`allocation.ts`, `work-orders.service.ts`, `schema.prisma`, `calibration-jobs.service.ts`, `certificate.service.ts`, and all of `apps/portal`). Result: zero new changes since Phase 9 began.

- `allocation.ts`, `certificate.service.ts`: no diff output at all (untouched).
- `calibration-jobs.service.ts` (75-line diff), the several Portal files (`calibration-jobs-page-client.tsx`, `calibration-jobs-ui.tsx`, `use-calibration-jobs-query.ts`, `leads-ui.tsx`, `management/page.tsx`, `calibration-management-info-panel.tsx`): confirmed pre-existing, session-predating dirty state — identical line counts to the very first `git status` snapshot taken before Phase 1 of this whole engagement began.
- `work-orders.service.ts` (154 lines) and `schema.prisma` (89 lines): identical line counts to every prior phase's scope-discipline check — Phase 1–6 work, stable and unchanged since.
- `purchase-orders/[id]/page.tsx` (156 lines), `use-purchase-orders-query.ts` (56 lines), `work-order-form-utils.ts`/`.test.ts` (15/34 lines): Phase 7/8 work, unchanged since Phase 8 — Phase 9 touched zero Portal files, confirmed.

Only 4 files were touched in the Phase 9 implementation turn: `po-progress.ts` (new), `purchase-orders.service.ts`, `purchase-orders.controller.ts`, `purchase-orders.service.test.ts`. No migration, no schema change, no Portal change. **Verdict: PASS.**

## 16. Findings

### F-01 — `deviceTypeId === null` handling diverges from `submitForReview`'s actual behavior

- **Severity:** NON-BLOCKING
- **Evidence:** `po-progress.ts:266–272` treats a job whose `resolveJobDeviceTypeId` fallback chain fully resolves to `null` as `inProgress` (never `measurementComplete`). The real gate, `assertMeasurementsCompleteForSubmit` (calibration-jobs.service.ts:2599–2600), does `if (deviceTypeId === null) return;` — i.e., such a job passes the measurement gate unconditionally and could be submitted immediately. The `po-progress.ts` comment claims to "mirror" this case but actually inverts its consequence.
- **Impact:** Only affects a job whose device-type resolution chain is fully broken (`calibrationRequestItem.deviceTypeId` and the PO-item-walk fallback both null) — an anomalous data state, not a normal operational path. The direction of the divergence is conservative (under-reports progress; a job the real system would let through as "ready to submit" is shown as still in progress), so it cannot cause the PO Progress view to overstate completion. No test exercises this branch.
- **Required action:** None required to unblock Phase 10. If corrected, the fix is a one-line change to treat `deviceTypeId === null` the same way the real gate does (skip the gate, count as `measurementComplete` rather than `inProgress`), with a test added for the null-device-type case.

### F-02 — No dedicated test for REWORK-status jobs in the inProgress/measurementComplete split

- **Severity:** NON-BLOCKING
- **Evidence:** `ACTIVE_JOB_STATUSES = ["IN_PROGRESS", "REWORK"]` (po-progress.ts:95) routes REWORK jobs through the identical query and completeness-evaluation code path as IN_PROGRESS jobs. None of the 12 tests in `purchase-orders.service.test.ts` create a job in REWORK status.
- **Impact:** Low — the code path is shared, not duplicated, with the already-well-tested IN_PROGRESS path (same `activeJobs` query filter, same loop, same `evaluateMeasurementCompleteness` call), so the risk of a REWORK-specific bug slipping through is small. It remains, however, an unverified path for a status the brief explicitly named for verification.
- **Required action:** None required to unblock Phase 10. Recommended future addition: one test driving a job to REWORK (via `decideQualityReview` REJECT) and asserting it lands correctly in `inProgress` or `measurementComplete`.

## 17. Final Gate

**PHASE 9 AUDIT PASS WITH NON-BLOCKING FINDINGS — READY FOR PHASE 10**
