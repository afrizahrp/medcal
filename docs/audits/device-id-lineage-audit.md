# deviceId Lineage Audit & Fix

Date: 2026-10-03
Scope: `Requisition item → QuotationItem → PurchaseOrderItem → WorkOrderItem → CalibrationJob`

## 1. Root cause

`WorkOrderItem` had **no `deviceId` column**. The lineage was therefore broken
structurally at the WorkOrder stage: `CalibrationJob.deviceId` was populated at
fan-out by *reaching back* to `item.purchaseOrderItem.deviceId` — an indirect
read from an upstream entity, not an explicit part of the WorkOrderItem data
contract. The WorkOrderItem (and its `WorkOrderItemHistory` snapshot) could not
carry, preserve or revise-snapshot the device identity.

A second, independent loss point existed at the Quotation stage: the manual
`PATCH` and `revise` paths wrote `deviceId: item.deviceId ?? null`. The input
`deviceId` is optional, so a client that omitted it **silently nulled** the
`deviceId` that the Requisition item (and the auto-generated quotation) had
carried, which then propagated `null` to the PurchaseOrderItem, WorkOrderItem
and CalibrationJob.

## 2. Exact locations where deviceId was lost

| # | Location | Defect |
|---|----------|--------|
| 1 | `packages/db/prisma/schema.prisma` `model WorkOrderItem` | No `deviceId` field/relation |
| 2 | `schema.prisma` `model WorkOrderItemHistory` | No `deviceId` in snapshot |
| 3 | `apps/api/src/modules/work-orders/allocation.ts` `createAllocationsAndWorkOrderItems` (`tx.workOrderItem.create`) | Did not write `deviceId`; `itemsById` source carried only `description`/`qty` |
| 4 | `work-orders.service.ts` `fanOutCalibrationJobs` | Read `purchaseOrderItem.deviceId` (indirect) instead of the WorkOrderItem's own value |
| 5 | `work-order-history.ts` | History snapshot omitted `deviceId` |
| 6 | `quotations.service.ts` `buildItemRows` (PATCH) | `item.deviceId ?? null` nulled the Requisition-derived deviceId |
| 7 | `quotations.service.ts` `revise()` (ADDED and in-place-update branches) | Same `?? null` defect |

Stages that were already correct (verified, unchanged):
- Requisition: `CalibrationRequestItem.deviceId` resolved from Serial No at create/revise (`calibration-requests.service.ts`).
- Quotation generation: `buildGeneratedRows` copies `requestItem.deviceId` verbatim.
- PurchaseOrderItem: `purchase-orders.service.ts` create (`createMany`) and revise (`createMany` for added scope) copy `QuotationItem.deviceId`; `PurchaseOrderItemHistory` snapshots it.

## 3. Creation paths covered

WorkOrderItem has exactly one write site (`allocation.ts`), which every WorkOrder
creation path funnels through. All four callers now supply `deviceId`:

- `WorkOrdersService.create` (single WO / WOL / SPK)
- `WorkOrdersService.revise` — ADDED PO items
- `SharedSpkService` create (Parent + Children)
- `SharedSpkService` revise (new Children)

CalibrationJob has exactly one creation site (`fanOutCalibrationJobs`,
`createMany`), used by `start()`.

## 4. Schema / model changes

Migration `20261005000000_add_work_order_item_device_id` (additive, nullable, no backfill):

- `WorkOrderItem.deviceId TEXT NULL` + FK → `Device(id)` (`ON DELETE RESTRICT`, matching `CalibrationJob.deviceId`) + index.
- `WorkOrderItemHistory.deviceId TEXT NULL` (snapshot column, no FK — same as other `*History` tables).
- `Device.workOrderItems` back-relation (Prisma-only).

No existing migration modified. Measurement / tolerance / test-point models untouched.

## 5. Implementation changes

- `allocation.ts`: `itemsById` entries now `{ description, qty, deviceId }`; `workOrderItem.create` writes `deviceId: source.deviceId`.
- `work-orders.service.ts` and `shared-spk.service.ts`: pass `deviceId: item.deviceId` (from `PurchaseOrderItem`) into `itemsById` (4 call sites).
- `work-orders.service.ts` fan-out: `CalibrationJob.deviceId` now sourced from `WorkOrderItem.deviceId`.
- `work-order-history.ts`: snapshots `deviceId`.
- `quotations.service.ts`: new `loadRequestItemDeviceIds`; PATCH and revise fall back to `CalibrationRequestItem.deviceId` when the caller omits `deviceId`. An explicitly supplied `deviceId` is still honoured (pre-existing behaviour, still validated by `assertDevicesBelongToCustomer`).

## 6. Resulting lineage

```
CalibrationRequestItem.deviceId      (resolved from Serial No, nullable)
  → QuotationItem.deviceId           (generate: verbatim; PATCH/revise: inherits when omitted)
  → PurchaseOrderItem.deviceId       (create/revise: verbatim from QuotationItem)
  → WorkOrderItem.deviceId           (NEW: verbatim from PurchaseOrderItem at allocation time)
  → CalibrationJob.deviceId          (fan-out: verbatim from WorkOrderItem, qty-1 lines)
```

Each hop is an explicit column write; nothing is derived from `productId`,
description, sequence or other attributes.

## 7. Tests / verification

Added/updated (Vitest):
- `work-orders.service.test.ts`: WorkOrder create asserts `WorkOrderItem.deviceId === PurchaseOrderItem.deviceId === Requisition deviceId`; new end-to-end lineage test Requisition → Quotation → PO → WorkOrderItem → CalibrationJob (same `Device.id`); the two existing fan-out tests now set the device on `WorkOrderItem` (the new source) and still assert qty-1 propagates / qty>1 stays null.
- `quotations.service.test.ts`: omitting `deviceId` on PATCH and on revise preserves the Requisition item's `deviceId`.

See section 9 for the executed results.

## 8. Remaining risks / edge cases

1. **qty > 1 lines.** A Requisition/PO/WO line with qty > 1 carries one `deviceId` but fans out to N jobs; `@@unique([workOrderId, deviceId])` on CalibrationJob forbids assigning one device to several jobs, so jobs stay `deviceId = NULL` (pre-existing rule, unchanged). `WorkOrderItem.deviceId` still carries the identity. Resolving this needs a business decision (per-unit devices), not a lineage fix; the unique constraint is not changed here.
2. **Legacy rows are not backfilled** (project rule). Existing WorkOrderItems have `deviceId = NULL`; a PLANNED/ASSIGNED WorkOrder created before this deploy and started afterwards will produce jobs with `deviceId = NULL` (previously they'd have read the PO item). If that matters operationally, a one-off, explicitly-approved `UPDATE "WorkOrderItem" SET "deviceId" = poi."deviceId" FROM "PurchaseOrderItem" poi WHERE ...` for non-started WorkOrders would close it. Not run.
3. **Upstream deviceId changes after downstream creation.** Requisition revision changing a line's device does not rewrite already-created Quotation/PO/WO rows (consumed rows are frozen by the existing revision-scope design). Unchanged.
4. **Nullable by design.** `deviceId` may be NULL at Requisition (identity not yet known); that is a valid business state, so no NOT NULL constraint was added.
5. Technician Device Lookup (`calibration-jobs.service.ts`) can still set `CalibrationJob.deviceId` when it is null; unchanged and out of scope.

## 9. Test results

Run via `pnpm --filter @medcal/api test` (its `pretest` migrates `pkmdb_test`, applying the new migration):

- Vitest test files: 73 passed / 4 failed (77)
- Vitest tests: 1619 passed / 9 failed / 0 skipped (1628)
- Typecheck (`pnpm --filter @medcal/api exec tsc --noEmit`): clean
- `prisma validate` / `prisma generate`: clean; build not run (additive schema + service change)

All work-order, shared-SPK, quotation, purchase-order and calibration-job tests pass, including the new lineage tests.

The 9 failures are in modules this change does not touch and none involve `deviceId`:
- `chat.gateway.security.test.ts` (1): socket test timed out at 5000 ms.
- `imap-sync.service.test.ts` (5): "IMAP is not configured" in this environment.
- `notification-dispatch.service.test.ts` (2): `push.resolvePushIconUrl is not a function`.
- `registration-origin-callers.test.ts` (1): `apps/tech-pwa/.../register/page.tsx:31` lacks an Origin header.

They were not re-run on a clean checkout to confirm they pre-date this change.

## 10. Final decision: `@@unique([workOrderId, deviceId])` removed (2026-10-04)

**Origin.** The composite unique dates from the initial schema (commit `9207a06`, 2026-08-08; index `CalibrationJob_workOrderId_deviceId_key`), when `CalibrationJob.deviceId` was required and a job was keyed by "this device in this WorkOrder". It predates unit fan-out (`5b8ebc9`, 2026-09-02). It was never the fan-out idempotency guard: fan-out jobs started with `deviceId = NULL` and Postgres treats NULLs as distinct. That guard is `@@unique([workOrderId, purchaseOrderItemId, unitOrdinal])` plus the `alreadyFannedOut` check, both retained.

**Decision (supersedes the earlier audit-only conclusion and the qty>1 rule in section 8.1).** Under the agreed architecture, `CalibrationJob.id` identifies the job and `deviceId` identifies the device (inherited Device Master → Requisition → QuotationItem → PurchaseOrderItem → WorkOrderItem → CalibrationJob). `deviceId` must not be unique per WorkOrder, and no replacement constraint (sequenceNo / lineNo / unitOrdinal-based or otherwise) was added for this purpose.

**Implementation.**
- Migration `20261006000000_drop_calibration_job_work_order_device_unique`: `DROP INDEX "CalibrationJob_workOrderId_deviceId_key"`. Earlier migrations untouched.
- `schema.prisma`: removed `@@unique([workOrderId, deviceId])`; updated the `deviceId` comment.
- `fanOutCalibrationJobs`: every job inherits `WorkOrderItem.deviceId` regardless of qty (the `unitTotal === 1` restriction was removed). WorkOrderItem `qty=3, deviceId=DEV-001` → three jobs, each `deviceId = DEV-001`.
- `CalibrationJobsService.selectDevice`: removed the P2002 → 409 `CALIBRATION_JOB_DEVICE_ALREADY_BOUND_TO_WORK_ORDER` mapping, which can no longer occur. The `CALIBRATION_JOB_DEVICE_ALREADY_SET` guard (first-time-only binding) is unchanged.
- Tests: the qty>1 fan-out test now asserts inherited `deviceId` on all jobs; the former "does not propagate on qty>1" test now asserts propagation to all 3 jobs with distinct job ids; the `selectDevice` 409 test for the removed constraint was deleted. Trial script comment updated.

**Section 8 item 1 is superseded:** qty>1 lines no longer leave jobs null. Items 2–5 stand.

## 11. Test results (after constraint removal)

Fixtures: tests that used `qty: 2` as a trick to obtain an unresolved-device job (`calibration-jobs.service.test.ts` `startedWorkOrderJobs`, `certificate.service.test.ts`) now unbind `deviceId` explicitly after fan-out, since every job inherits it.

Executed via `pnpm --filter @medcal/api test` (`pretest` applies the new migration to `pkmdb_test`):

- Focused (calibration-jobs, work-orders, quotations, purchase-orders): 23 files passed, 760 tests passed, 0 failed.
- Full suite: Vitest test files 72 passed / 5 failed (77); tests 1617 passed / 10 failed / 0 skipped (1627).
- Typecheck (`tsc --noEmit`): clean. `prisma validate`: clean. Build not run. `prisma generate` hit an EPERM file lock on the query-engine DLL (another process holds it); the schema change only drops a compound-unique type that no code uses, so typecheck is unaffected, but regenerate the client once the lock is released.

The 10 failures:
- 9 are the same unrelated failures as before the change (chat socket timeout 1, IMAP not configured 5, push `resolvePushIconUrl` mock 2, tech-pwa register-page Origin lint 1).
- 1 is a flake in `calibration-jobs.service.test.ts` "still company-scopes when assignedToMe is set": the test creates a company with a random 2-character id (`S` + 2 hex chars) and hit a unique-id collision. It passed in the focused run.

An intermediate full run (before the fixture fix above) also showed 50 failures in files, me, push-tokens and contact-messages ("Expected at least one active ContactTopic to be seeded"); those did not recur in the final run and look like a transient test-DB state issue. The calibration-jobs/certificate failures in that run were real and are what the fixture change fixed.
