# PO Allocation / Multi-WOL Architecture — Phase 7 Implementation Report

**Phase:** 7 of the implementation plan (Plan WOL/SPK UI), per `docs/audits/final-po-allocation-wol-spk-architecture-decision.md` (locked architecture) and the architecture clarification on Allocation cancellation / `revise()` (normative baseline).
**Status: COMPLETE.** Stopped after Phase 7 as instructed — Phase 8 (PO detail multi-WorkOrder view) was explicitly not started.

**Scope discipline confirmed:** `git diff --stat` throughout this phase shows zero changes to `apps/api/src/modules/work-orders/allocation.ts`, `apps/api/src/modules/work-orders/work-orders.service.ts`, `packages/db/prisma/schema.prisma`, or the Phase 1–6 migration (`20260928000000_add_purchase_order_item_allocation`). No new cancellation/reallocation invariant was introduced — the architecture clarification's normative baseline (Allocation cancellation cascades unconditionally via `WorkOrder.cancel()`; `revise()` only auto-pulls zero-allocation items) was used exactly as locked, unmodified.

---

## 1. Implementation summary

Built the "Plan WOL/SPK" experience per Section 16 of the original implementation task: a Portal screen where an operator sees a PO's items with total/allocated/remaining quantity, stages one or more WorkOrder groups (each with its own item+qty rows) entirely client-side, and submits them sequentially against the existing, unmodified `WorkOrder.create()` endpoint. No persisted draft state exists anywhere — everything before "Submit Plan" is React component state only.

## 2. Files changed

**Backend (new, additive only):**
- `apps/api/src/modules/purchase-orders/purchase-orders.service.ts` — added `getAllocationSummary()` + response types (`PurchaseOrderAllocationSummary` / `PurchaseOrderAllocationSummaryItem` / `PurchaseOrderAllocationSummaryAllocation`). Reuses the existing, unmodified `computeRemainingQtyByItemId` export from Phase 1–6's `allocation.ts` — imported, never touched.
- `apps/api/src/modules/purchase-orders/purchase-orders.controller.ts` — added `GET /purchase-orders/:id/allocation-summary`.
- `apps/api/src/modules/purchase-orders/purchase-orders.service.test.ts` — 4 new tests.

**Frontend (new/additive):**
- `apps/portal/src/app/management/purchase-orders/[id]/plan-wol/page.tsx` — new page (the Plan screen).
- `apps/portal/src/app/management/purchase-orders/use-purchase-orders-query.ts` — added `usePurchaseOrderAllocationSummary` hook + types.
- `apps/portal/src/app/management/purchase-orders/[id]/page.tsx` — one additive "Plan WOL/SPK" button next to the existing Work Order section header, shown whenever the PO is eligible, regardless of whether it already has an active WorkOrder. The existing single-WorkOrder display logic (`findActiveWorkOrder`, the "Work Order sudah ada" gate on `/work-orders/new`) was deliberately **left untouched** — that's Phase 8's redesign, not reopened here.

## 3. Database/migration changes

None. This phase is read-only against the schema; it only exposes existing Phase 1–6 data.

## 4. API/service changes

One new read-only endpoint. No existing endpoint's behavior changed.

## 5. UI changes

New "Plan WOL/SPK" page: an item table (Total/Allocated/Remaining, live-recalculated as the operator stages quantities), a dynamic list of WorkOrder groups (each an item-picker + qty row, add/remove rows and groups), and submission that reports partial success honestly — successful groups become linked, created WorkOrders; failed groups stay staged with their server-returned error message inline for correction and retry, rather than claiming a false all-or-nothing result.

## 6/7. Tests added and results

```
purchase-orders.service.test.ts:         42 passed (38 existing + 4 new)
Portal suite:                            240 passed (22 files), no regressions
Full API suite (clean, single process):  1423 passed, 9 failed
```

The 9 failures are the identical pre-existing set from the Phase 1–6 baseline (`chat`, `contact-messages`, `emails`×5, `push-tokens`×2, `whitelist`) — confirmed by exact count match (4 failed files, 9 failed tests, same as before Phase 7) and by `git status` showing none of those files were touched in this or any prior phase.

**Note on process hygiene:** an earlier run showed 23 failures because a second full-suite run was accidentally started concurrently against the shared, non-isolated test database (`fileParallelism: false` in `apps/api/vitest.config.mts` — a second run's global setup truncates tables mid-run of the first). That result was discarded as self-inflicted noise, not a real signal; the clean, single-process re-run above is the one reported here.

## 8. Invariant verification

Nothing here touches an invariant — Phase 7 is read/plan/submit UI over Phase 1–6's already-verified mechanics. The one thing worth confirming: the new `getAllocationSummary` read exactly mirrors the write-path's own remaining-quantity source of truth (same `computeRemainingQtyByItemId` function), so the UI can never show a number the server's own enforcement would disagree with — verified by the 4 new backend tests (whole-item, partial-across-siblings, and cancelled-allocation-releases-quantity cases all match what the summary reports).

## 9. Deviations / judgment calls made without stopping to ask

- **Per-group atomicity, not whole-plan atomicity.** Per the architecture decision's own §7 ("the batch can be sequential or a single larger transaction, an implementation detail, not an architectural one"), and to honor "don't modify Phase 1–6," no new cross-WorkOrder transaction wrapper was built. Each group's creation is atomic (guaranteed by the existing, untouched `create()`); the batch itself is sequential, with honest partial-failure reporting rather than a false atomicity claim.
- **No address/schedule fields per group.** The original task's Section 16 example only shows item+qty per WOL group; the Plan screen was kept scoped to that, omitting per-WorkOrder address/schedule entry (those remain editable on the WorkOrder detail page after creation, via the existing, unmodified PATCH endpoint). Scope stayed tight rather than rebuilding the full WorkOrder creation form N times over.
- **Did not touch `/work-orders/new`'s existing single-WorkOrder gate**, even though it's now stale relative to the new capability (flagged in the Phase 1–6 report). Fixing it would mean redesigning the PO detail page's WorkOrder section — explicitly Phase 8, which was out of scope for this pass.

## 10. Blockers

None.

## Phase 7 status: COMPLETE

Stopped here per instruction — not proceeding to Phase 8.
