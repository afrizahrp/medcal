# MOM #1 — Complete Revision UI Coverage — Follow-Up Report

**Status:** Code complete for all four detail pages. Automated verification
(typecheck, build, unit tests) passing. Manual authenticated browser
click-through is **not fully verified** — see §8. This report is a factual
follow-up to `mom-1-transaction-revision-implementation-20260920.md`, which
covered the backend only and left three of the four UI pages unimplemented.

---

## 1. Scope of This Task

Close the UI coverage gap identified at the end of the previous report: the
backend `revise()`/`listHistory()`/`getHistoryRevision()` capability existed
and was fully tested for all four entities, but only the Quotation detail page
exposed it. This task adds the same `Revise` + `History` UI to the
`CalibrationRequest` (Requisition), `PurchaseOrder`, and `WorkOrder` detail
pages, reusing the Quotation implementation as the reference pattern. No
backend contract, schema, or status enum was touched.

---

## 2. UI Pages Completed

| Page | Revise UI | History UI | Status gating |
|---|---|---|---|
| **Quotation** (`quotations/[id]/page.tsx`) | Already existed (previous task) | Already existed | Unchanged |
| **Purchase Order** (`purchase-orders/[id]/page.tsx`) | ✅ Added — trigger-only `ConfirmDialog` (matches the backend's pull-based, no-body `revise()`) | ✅ Added — `PurchaseOrderHistoryDialog`, read-only | ✅ `purchaseOrderActions()` gained `canRevise` (true for every non-DRAFT, non-CANCELLED, non-FULFILLED status) |
| **Work Order** (`work-orders/[id]/page.tsx`) | ✅ Added — trigger-only `ConfirmDialog` (pull-based) | ✅ Added — `WorkOrderHistoryDialog`, read-only | ✅ `workOrderActions()` gained `canRevise` (`true` only for `PLANNED`/`ASSIGNED`, `false` for `IN_PROGRESS`/`DONE`/`CANCELLED`) |
| **Requisition / `CalibrationRequest`** (`calibration-requests/[id]/page.tsx`) | ✅ Added — `ReviseRequestDialog`, a per-item qty-edit form (mirrors Quotation's, since this entity's `revise()` takes item input, unlike PO/WO) | ✅ Added — `RequestHistoryDialog`, read-only | ✅ New `canRevise` local to the page: `true` for `SUBMITTED`/`IN_QUOTATION`, matching `REVISABLE_CALIBRATION_REQUEST_STATUSES` in the backend |

`CalibrationRequest` is confirmed as the correct backend model name for the
Requisition domain object — not renamed, per the task's explicit instruction.

---

## 3. Revise UI Behavior

Two shapes, matching what each backend `revise()` method actually accepts
(§7 of the earlier implementation report — not re-derived here, just wired up):

- **Quotation / Requisition** — a form dialog listing every current item with
  an editable "new qty" field. Only items whose qty actually changed are sent
  in the request body; the backend decides per line whether that's an
  in-place update or an additive sibling row. No "add a brand-new line" UI —
  same deliberate scope limit as the original Quotation implementation.
- **Purchase Order / Work Order** — a plain `ConfirmDialog` (same component
  already used for Approve/Cancel/Start/Done everywhere else in the app).
  These two `revise()` endpoints take no body — they re-pull scope from their
  parent document — so there is nothing for a form to collect.

In every case, the button is labeled `Revise`, uses the existing
`RefreshCw` icon, sits next to `History` in the action row, and only appears
when both the status gate (`canRevise`) and the existing `*Update` capability
are true — the same two-condition pattern (`status gate && capability`)
already used for every other conditional action button in this codebase.

---

## 4. History UI Behavior

Identical component shape on all four pages (`*HistoryDialog`, one per
entity, each a plain function component local to its page file — no new
shared component was extracted, matching the instruction not to introduce a
new visual system):

1. `History` button (visible whenever the corresponding `*Read` capability is
   granted, regardless of status — history is always viewable).
2. Opens a modal listing every revision (`revisionNumber`, `revisedAt`,
   `revisedBy`), auto-selecting the most recent one.
3. Selecting a revision shows its complete header + item snapshot in a
   read-only table.
4. No Edit/Delete/Revise control exists anywhere inside any history dialog —
   confirmed by inspection: none of the four `*HistoryDialog` components
   render a mutating `Button` or call a mutation hook.

---

## 5. Status Gating — Source of Truth

Each page's `canRevise` boolean was written to match its backend
`REVISABLE_*_STATUSES` constant exactly, not re-derived independently:

- `calibration-requests.service.ts`: `["SUBMITTED", "IN_QUOTATION"]`
- `quotations.service.ts`: `["SENT", "APPROVED"]` (pre-existing, unchanged)
- `purchase-orders.service.ts`: `["APPROVED", "RECEIVED", "CONFIRMED"]`
- `work-orders.service.ts`: `["PLANNED", "ASSIGNED"]`

The WorkOrder case was cross-checked against the MOM's explicit boundary
table (PLANNED/ASSIGNED → eligible; IN_PROGRESS → locked; DONE/CANCELLED →
terminal) and against real dev data: all 4 WorkOrders in the shared dev
database are currently `IN_PROGRESS`, so `canRevise` evaluates to `false` for
every one of them today — the Revise button is not shown, and no code path
weakens `WorkOrderItem` immutability or touches `CalibrationJob` fan-out
(neither file was modified in this task).

---

## 6. Files Changed (this task only)

- `apps/portal/src/app/management/purchase-orders/purchase-order-form-utils.ts` — `canRevise` added to `purchaseOrderActions()`; two new error-code messages.
- `apps/portal/src/app/management/purchase-orders/use-purchase-orders-query.ts` — `useRevisePurchaseOrder`, `usePurchaseOrderHistory`, `usePurchaseOrderHistoryRevision`.
- `apps/portal/src/app/management/purchase-orders/[id]/page.tsx` — Revise/History buttons, `PurchaseOrderHistoryDialog`.
- `apps/portal/src/app/management/purchase-orders/purchase-order-form-utils.test.ts` — updated 3 existing assertions to include the new `canRevise` field; added 1 new case (`FULFILLED`).
- `apps/portal/src/app/management/work-orders/work-order-form-utils.ts` — `canRevise` added to `workOrderActions()`; two new error-code messages.
- `apps/portal/src/app/management/work-orders/use-work-orders-query.ts` — `useReviseWorkOrder`, `useWorkOrderHistory`, `useWorkOrderHistoryRevision`.
- `apps/portal/src/app/management/work-orders/[id]/page.tsx` — Revise/History buttons, `WorkOrderHistoryDialog`.
- `apps/portal/src/app/management/work-orders/work-order-form-utils.test.ts` — updated 5 existing assertions to include the new `canRevise` field.
- `apps/portal/src/app/management/calibration-requests/use-calibration-requests-query.ts` — `useReviseCalibrationRequest`, `useCalibrationRequestHistory`, `useCalibrationRequestHistoryRevision`.
- `apps/portal/src/app/management/calibration-requests/[id]/page.tsx` — `canRevise`, Revise/History buttons, `ReviseRequestDialog`, `RequestHistoryDialog`.

No backend file (service, controller, schema, migration) was touched in this
task. No new shared component library file was added — every dialog is a
local function component in its own page file, following the pattern already
established by the Quotation page.

---

## 7. Regression Verification

- **Portal typecheck** (`tsc --noEmit`): clean, run after every page's edits
  and again at the end.
- **Portal full test suite** (`vitest run`): initially **8 failures**
  surfaced — both `purchase-order-form-utils.test.ts` and
  `work-order-form-utils.test.ts` asserted the exact shape of
  `purchaseOrderActions()`/`workOrderActions()` return values via
  `toEqual()`, and adding the new `canRevise` field broke those exact-shape
  assertions. **This was a real regression caused by this change**, fixed by
  updating the 8 assertions to include `canRevise` (plus one new test case
  for `FULFILLED`), per the instruction to fix failures caused by this work
  rather than leave them. Final result: **222 / 222 passed** (was 221 before
  this task; +1 net from the new `FULFILLED` test case).
- **Portal production build** (`next build`): clean — all 58 routes generated
  successfully, including the four modified `[id]` detail routes.
- API tests were not re-run for this task — no API/backend file was touched,
  consistent with the instruction to only run API tests "if UI/API
  integration requires it." The API contract (request/response shapes,
  routes) was not changed; the portal hooks were written directly against the
  already-tested, already-shipped endpoints from the previous task.

---

## 8. Manual Browser Verification

**Partially performed. Full authenticated click-through was attempted but did
not complete — documented factually below, not claimed as done.**

### What was verified

1. **Unauthenticated smoke test**, on a dev server I started myself (API +
   Portal, both `pnpm ... dev`): the sign-in page rendered correctly
   (screenshot captured, real PKM branding, functioning form — not a blank
   frame), with zero console errors. Navigating to a protected Quotation
   detail URL while logged out correctly redirected to `/sign-in` with no
   crash. The live API server's boot log confirmed all 12 new routes
   (`revise`, `history`, `history/:revisionNumber` × 4 entities) registered
   correctly on the running NestJS instance.
2. **Real dev-database read (read-only, no mutation)** confirmed genuinely
   revision-eligible fixture data already exists without needing to create
   any: all 4 `CalibrationRequest`s are `IN_QUOTATION`, all 4 `Quotation`s
   are `APPROVED`, all 4 `PurchaseOrder`s are `APPROVED` — all revision-
   eligible — and all 4 `WorkOrder`s are `IN_PROGRESS` — correctly *not*
   revision-eligible, a ready-made case for confirming the locked state hides
   `Revise`.

### What was not completed, and why

- I do not have, and did not request or attempt to bypass, the credentials
  for the real `SUPERADMIN` account already present in the dev database
  (`afriza@kalibrasimedika.co.id`).
- The user supplied two different accounts over the course of this task
  (`admin@kalibrasimedika.co.id`, then `bayu@kalibrasimedika.co.id`, both
  role `SUPERVISOR`). The first lacked any `RolePermission` grants for the
  four MOM #1 resources (403s, empty menu). The user then granted `SUPERVISOR`
  full `read`/`update`/etc. `RolePermission` rows via the app's own
  Permission Management screen (confirmed present via a read-only DB check).
- I declined one specific action myself: directly `INSERT`-ing new
  `RolePermission` rows into the shared dev database via a raw script,
  bypassing the app's own permission-management flow. That action was also
  independently blocked by an environment-level safety classifier. The user
  then performed the equivalent grant themselves through the proper UI.
- With the permission grant in place, authenticated navigation to
  `/management/quotations/:id` (and, to isolate the cause, also
  `/management/leads` and `/management/customers` — routes untouched by this
  task) all returned a plain Next.js **404 "This page could not be found"**
  on the user's own separately-running dev server instance — confirmed
  systemic (not specific to any page this task touched) and confirmed not
  reproducible against the dev server I had started earlier in the session
  (same code, same database). This points to an environment/process state
  issue on that particular running instance (e.g. a stale Turbopack dev
  cache), not a defect introduced by this UI work — but it was not resolved
  before this report was written, and the conversation is currently waiting
  on the user to check their terminal output / restart that process.
- No screenshot of the real, populated Revise/History UI (with real data, as
  a real authenticated SUPERVISOR user) was obtained. The `*.png` screenshots
  saved during this session are: a correctly-rendered sign-in page, and
  several 404 pages — evidence of the environment issue, not of the feature
  working.

**Conclusion: manual browser verification of the actual Revise/History UI
rendering is outstanding.** It should be re-attempted once the 404 on the
user's dev server instance is resolved (a restart of the `@medcal/portal:dev`
process is the most likely fix, per the diagnosis already shared in
conversation).

---

## 9. Known Limitations

- Manual browser verification incomplete — see §8. This is the one
  Definition-of-Done item from the task prompt that is not satisfied yet.
- The Requisition, Purchase Order, and Work Order `History` dialogs have not
  been visually compared side-by-side with the Quotation one in a real
  browser — only source-level pattern-matching (identical component
  structure, identical Tailwind classes, identical modal chrome) confirms
  visual consistency; this has not been eyeballed.
- As before: adding a brand-new item line (not just changing an existing
  line's qty) has no UI on the Requisition/Quotation Revise dialogs — an
  intentional scope limit carried over from the original Quotation
  implementation, not something this task changed or was asked to change.

## 10. Explicit Confirmation of Non-Goals

- No backend revision contract, route, schema, or migration was changed.
- No new status enum value was introduced.
- No customer-facing document number behavior was touched.
- `WorkOrderItem` immutability and `CalibrationJob` fan-out code were not
  touched by this task (only `work-order-form-utils.ts`'s pure client-side
  status-gating function was edited).
- No new generic/shared dialog component library was introduced — every
  History/Revise dialog is a plain local component, following the existing
  Quotation page's own pattern.
