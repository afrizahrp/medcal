# IMPLEMENT (STAGED) — CalibrationJob Fan-Out on WorkOrder.start()

## Mode
This task has TWO stages with a HARD STOP between them. Do NOT proceed past Stage 1 without
explicit user confirmation in this conversation.

**Scope lock:** this task implements fan-out creation of `CalibrationJob` rows triggered from
`WorkOrdersService.start()` ONLY. Do NOT build any CalibrationJob CRUD endpoints, RBAC grants,
approval workflow, or UI in this task — those are separate follow-up tasks. Do NOT modify the
schema — it is already complete for this task (`deviceId` nullable, identity snapshot fields,
`unitOrdinal`/`unitTotal`, `customerDeclaredAkdAkl` all exist from prior migrations).

## Background — decisions already made, do not re-litigate

From `investigation-calibrationjob-fanout-design.md` and subsequent user confirmation, all of
the following are LOCKED. Implement them as given:

1. **Cardinality source:** `WorkOrderItem.qty`, evaluated per `WorkOrderItem`. One
   `WorkOrderItem` always resolves to exactly one `DeviceType` — no per-type branching needed.
2. **Trigger point:** `WorkOrdersService.start()` (the `PLANNED/ASSIGNED → IN_PROGRESS`
   transition). Wrap `start()`'s mutation in a `$transaction` (it is currently a bare
   `update` — confirm this is still true by re-reading the live method before changing it) and
   create the fanned-out `CalibrationJob` rows in that same transaction, immediately after the
   status update.
3. **Idempotency:** inside the transaction, before creating anything, check whether
   `CalibrationJob` rows already exist for this `WorkOrder` (e.g.
   `count({ where: { workOrderId } })`); if `> 0`, skip creation entirely and proceed with just
   the status update. This is the primary guard. The new
   `@@unique([workOrderId, purchaseOrderItemId, unitOrdinal])` constraint (already migrated) is
   the secondary/backstop guard — a genuine double-fan-out attempt should hit a `P2002` there;
   handle that error explicitly (catch and treat as "already fanned out, no-op" rather than
   letting it bubble as an unhandled 500), mirroring the pattern already used elsewhere in this
   codebase (`work-orders.service.ts:221-235`, `purchase-orders.service.ts:115-129`).
4. **Per-WorkOrderItem loop:** for each `WorkOrderItem` on the WorkOrder (all of them — there is
   no per-item opt-out), create `qty` `CalibrationJob` rows (coerce `Decimal(18,4)` to Int;
   assert it is a positive integer and throw a clear error if it is not — do NOT silently floor
   or round).
5. **Field population per created job**, walking `WorkOrderItem → purchaseOrderItem →
   quotationItem → requestItem` (this path is already loaded by `workOrderInclude` per the
   investigation — confirm and reuse rather than re-deriving the include):
   - `companyId`, `workOrderId`, `purchaseOrderItemId` — direct.
   - `deviceId` — `null` (always, at creation; populated later by a separate
     device-matching flow, out of scope here).
   - `calibrationRequestItemId` — `requestItem.id` if the walk resolves, else `null`. Treat a
     NULL `requestItem` as a normal degraded case, not an error (per investigation Step 4).
   - `customerDeclaredDeviceName` — `requestItem.customerDeviceName` if resolved, else `null`.
   - `customerDeclaredAkdAkl` — `requestItem.akdAkl` if resolved, else `null`.
   - `unitOrdinal` — 1-based position within this `WorkOrderItem`'s fan-out (1..qty).
   - `unitTotal` — `qty` (the coerced integer from point 4).
   - `status` — leave at schema default (`PENDING`).
   - `akdAklApprovalStatus` — leave at schema default (`NOT_REQUIRED`) for this task. (Whether
     fan-out should set this to `PENDING_REVIEW` when `customerDeclaredAkdAkl` is null is a
     business-logic question for the AKD/AKL escalation task, not this one — do not decide it
     here; leave the default and note this explicitly in your Stage 1 write-up as an open item
     for that future task.)

## Stage 1 — Propose the implementation (code, not yet applied)

1. Re-read `WorkOrdersService.start()` and `workOrderInclude` live from
   `work-orders.service.ts` — confirm line numbers and exact current shape (the investigation's
   citations may have shifted slightly since other tasks touched this file's surrounding
   area — verify, don't assume prior line numbers are still exact).
2. Write the proposed code change (the `start()` method with the `$transaction` wrapper, the
   idempotency check, the fan-out loop, and error handling for the `P2002` race) as a diff or
   clearly-marked before/after. Include any new small private helper methods if that keeps
   `start()` readable, but keep everything in `work-orders.service.ts` — do not create a new
   module/service for this task.
3. State explicitly how you're coercing `WorkOrderItem.qty` (`Decimal`) to a positive integer,
   and what error is thrown (and its shape/message) if it is not integral or not positive.
4. Present this proposal and STOP. Do not edit any file yet. Ask for explicit approval before
   Stage 2.

## Stage 2 — Apply and verify (ONLY after explicit user approval)

1. Apply the approved code change to `work-orders.service.ts`.
2. Run `apps/api`'s typecheck (`tsc --noEmit`) and report the result.
3. Run the existing WorkOrder test suite (`work-orders.service.test.ts`) and report pass/fail.
   Note: the negative assertions at lines ~552 and ~726 ("does not create CalibrationJob rows")
   will now be FALSE — this is expected and correct (fan-out is the point of this task). Update
   ONLY those specific two test assertions to reflect the new correct behavior (a WorkOrder
   reaching IN_PROGRESS now DOES create `qty`-many CalibrationJob rows per WorkOrderItem); do
   not rewrite the rest of the test file, and do not delete tests — flag if any other existing
   test's behavior assumption is affected and ask before changing it if you're not certain the
   change is correct.
4. Add at least one new test covering the core fan-out path (a WorkOrder with a
   multi-quantity `WorkOrderItem` reaching IN_PROGRESS produces the right count of jobs with
   correct `unitOrdinal`/`unitTotal` and correct `calibrationRequestItemId` linkage) and one
   covering the idempotency guard (calling the transition logic's job-creation path twice does
   not double-create). If a true "call start() twice" test isn't feasible given the transition
   table already blocking a second call, test the idempotency guard function/logic directly
   instead, and say so explicitly.
5. Do NOT touch RBAC, controllers, UI, or seed files.
6. Confirm final `git status` — only `work-orders.service.ts` and
   `work-orders.service.test.ts` should show as modified.

## Output / final message format

**After Stage 1:** present the proposed code diff, your qty-coercion approach + error shape,
and the explicit note about deferring the `akdAklApprovalStatus` decision to a future task. End
with an explicit request for approval to proceed to Stage 2.

**After Stage 2 (only if reached):** confirm exactly which files changed, typecheck result, full
test suite result (pass/fail counts), which specific existing test assertions were updated and
why, and summarize the new tests added.
