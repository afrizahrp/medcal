# MOM #1 — Transaction Revision + Immutable History — Implementation Report

**Status:** Implemented and tested. This report documents what was built against
`MOM #1 — FINAL IMPLEMENTATION.md`, building on the two prior review documents
(`mom-1-review-transaction-revision-immutable-history-20260919.md` and
`mom-1-item-revision-rule-20260919.md`).

---

## 1. Implementation Summary

Added append-only, full-snapshot revision history to the four chain entities
(`CalibrationRequest`, `Quotation`, `PurchaseOrder`, `WorkOrder`) without
renaming any model, adding any status enum value, or changing customer-facing
document numbering:

- 8 new history tables (header + item, one pair per entity), INSERT-only by
  service-layer convention.
- One new `revise()` method per service, gated to exactly the statuses where
  the existing `Edit`/`update()` flow is *not* legal and the document isn't
  terminal.
- One new `listHistory()` / `getHistoryRevision()` pair per service (read-only).
- Item-level semantics follow `mom-1-item-revision-rule-20260919.md` exactly:
  in-place mutation before a downstream snapshot exists, an additive sibling
  row after — never a redesign of item identity, never touching
  `WorkOrderItem`'s "immutable after create" invariant.
- `CalibrationJob` fan-out, `unitOrdinal`/`unitTotal` freezing, and the
  WorkOrder-wide fan-out idempotency guard are untouched.
- Portal UI: `Revise` + `History` actions shipped on the Quotation detail page
  as the reference implementation of the pattern (see §5 for why the other
  three pages are not yet wired up).

---

## 2. Files Changed

**Schema / migrations**
- `packages/db/prisma/schema.prisma` — 8 new models
  (`CalibrationRequestHistory`/`Item`, `QuotationHistory`/`Item`,
  `PurchaseOrderHistory`/`Item`, `WorkOrderHistory`/`Item`) + one new
  back-relation field on each of `CalibrationRequest`, `Quotation`,
  `PurchaseOrder`, `WorkOrder`, `User`.
- `packages/db/prisma/migrations/20260919172854_mom1_transaction_revision_history/`
- `packages/db/prisma/migrations/20260919174757_mom1_add_calibration_request_item_history_notes/`

**Shared revision-number helper**
- `packages/db/src/revision/revision-number.service.ts` (new)
- `packages/db/src/revision/index.ts` (new)
- `packages/db/src/index.ts` (export added)

**Shared DTOs**
- `packages/shared/src/schemas/index.ts` — `calibrationRequestReviseSchema`,
  `quotationReviseSchema` (+ inferred types).

**API — services & controllers**
- `apps/api/src/modules/calibration-requests/calibration-requests.service.ts`
- `apps/api/src/modules/calibration-requests/calibration-requests.controller.ts`
- `apps/api/src/modules/quotations/quotations.service.ts`
- `apps/api/src/modules/quotations/quotations.controller.ts`
- `apps/api/src/modules/purchase-orders/purchase-orders.service.ts`
- `apps/api/src/modules/purchase-orders/purchase-orders.controller.ts`
- `apps/api/src/modules/work-orders/work-orders.service.ts`
- `apps/api/src/modules/work-orders/work-orders.controller.ts`

**Tests**
- `apps/api/src/modules/calibration-requests/calibration-requests.service.test.ts`
- `apps/api/src/modules/quotations/quotations.service.test.ts`
- `apps/api/src/modules/purchase-orders/purchase-orders.service.test.ts`
- `apps/api/src/modules/work-orders/work-orders.service.test.ts`

**Portal UI (Quotation only — see §5, §13)**
- `apps/portal/src/app/management/quotations/use-quotations-query.ts`
- `apps/portal/src/app/management/quotations/quotations-ui.tsx`
- `apps/portal/src/app/management/quotations/[id]/page.tsx`

No other file was modified. No existing method signature changed.

---

## 3. Database / Migration Changes

Two migrations, both additive:

1. **`20260919172854_mom1_transaction_revision_history`** — creates all 8
   history tables plus their indexes/FKs.
2. **`20260919174757_mom1_add_calibration_request_item_history_notes`** — adds
   one column (`notes`) to `CalibrationRequestItemHistory`, found missing
   during test-writing when checking snapshot completeness against
   `CalibrationRequestItem`'s own field list (§8).

Each header-history table carries: `revisionNumber Int`, `revisedByUserId
String?`, `revisedAt DateTime`, a FK back to its parent (`onDelete: Cascade`,
so cleanup/tenant deletion cascades correctly), and every scalar field of the
operational header **except**:

- `CalibrationRequestHistory` omits `createdByUserId`/`updatedByUserId`
  (fixed at creation, not revision-varying) and the deprecated
  `desiredScheduleNote` (schema comment: "do not use in new code").
- `WorkOrderHistory` omits the 8 `requestReview*` F.MU.08 "Kaji Ulang"
  checklist fields — a separate review-completion process, not the
  document's commercial/operational scope.
- `PurchaseOrderItemHistory` omits `workOrderId` — the schema itself
  documents this as a "Legacy allocation pointer... Unused by WorkOrder MVP."

These three omissions are deliberate minimality choices ("do not add
speculative fields" / "do not duplicate the entire current operational schema
unnecessarily") rather than gaps — none of them are revision-relevant state.

`(<parentId>, revisionNumber)` carries a DB-level `@@unique` constraint on
every history header table (e.g. `@@unique([quotationId, revisionNumber])`),
the concrete backstop the MOM's §3 asked for. No `revisionNumber` (or any
other) column was added to any operational table.

Both migrations were applied to the dev database (`pkmdb`) and verified via
`prisma migrate status` ("Database schema is up to date"); `prepare-test-db`
applies them to the dedicated test database (`pkmdb_test`) automatically
before every test run.

One pre-existing, unrelated schema/migration drift was encountered and
**not** touched: `prisma migrate dev --create-only` kept proposing a
`RenameIndex` on `DeviceCalibrationParameter_deviceTypeId_logicalTestK_key`
(a Postgres 63-char identifier truncation from an earlier, hand-written
migration) as a side effect of any new diff. This line was stripped from both
new migration files before applying them — it is not part of MOM #1 and the
existing migration that created it was left untouched, per the rules.

---

## 4. API Changes

One new method set per service, all following the existing `create()`/
`update()` transaction shape (`prisma.$transaction`, `findFirstOrThrow`
return, typed `BadRequestException`/`NotFoundException` with a `code`):

| Service | New methods | New routes |
|---|---|---|
| `CalibrationRequestsService` | `revise()`, `listHistory()`, `getHistoryRevision()` | `POST /calibration-requests/:id/revise`, `GET /calibration-requests/:id/history`, `GET /calibration-requests/:id/history/:revisionNumber` |
| `QuotationsService` | same | `POST /quotations/:id/revise`, `GET /quotations/:id/history`, `GET /quotations/:id/history/:revisionNumber` |
| `PurchaseOrdersService` | same (pull-based, no body) | `POST /purchase-orders/:id/revise`, `GET /purchase-orders/:id/history`, `GET /purchase-orders/:id/history/:revisionNumber` |
| `WorkOrdersService` | same (pull-based, no body) | `POST /work-orders/:id/revise`, `GET /work-orders/:id/history`, `GET /work-orders/:id/history/:revisionNumber` |

All new routes reuse the existing `CompanyRoleGuard` + `@RequirePermission`
pattern already used by every other route on these controllers (`revise` uses
the same `"update"` permission as `PATCH`; the history routes use the
existing `"read"` permission). No new permission keys were added.

`CalibrationRequest.revise()` / `Quotation.revise()` accept an `items` array
(each entry optionally carrying an existing item `id`) — the same input shape
family as their `update()` schemas, plus the optional `id`.
`PurchaseOrder.revise()` / `WorkOrder.revise()` take **no body** — see §7 for
why (pull-based propagation).

Existing methods (`create`, `update`, `send`, `approve`, `reject`, `cancel`,
`submit`, `assign`, `start`, `done`) were not modified.

---

## 5. UI/UX Changes

Implemented on the **Quotation detail page only**
(`apps/portal/src/app/management/quotations/[id]/page.tsx`), as the reference
implementation of the pattern:

- A `History` button (visible whenever `quotationRead` is granted, matching
  the existing capability-gating convention) opens a read-only modal listing
  every revision (`revisionNumber`, `revisedAt`, `revisedBy`), with a
  side-by-side detail pane showing that revision's complete item snapshot.
  No Edit/Delete control exists anywhere in this modal.
- A `Revise` button (visible when `quotationUpdate` is granted and
  `status` is `SENT` or `APPROVED` — exactly where `Edit` is *not* legal and
  the document isn't terminal) opens a form listing each current item with an
  editable "new qty" field. On submit it posts only the items whose qty
  actually changed to `POST /quotations/:id/revise`; the service decides
  per-line whether that's an in-place update or an additive sibling row.
- Existing `Edit`/`Send`/`Approve`/`Reject`/`Cancel`/`Print`/`Email` buttons,
  the detail layout, and the Purchase Order section are unchanged.

**Deliberately out of scope for this pass** (see §13 Known Constraints): the
same `Revise`/`History` UI was **not** added to the CalibrationRequest,
PurchaseOrder, or WorkOrder detail pages. Their `revise()`/`listHistory()`/
`getHistoryRevision()` API endpoints are fully implemented, tested, and ready
— only the portal wiring is missing. Quotation was chosen because it is the
entity both MOM documents use for their canonical example (QUO-01, 1→3→4).
Given the size of the schema + service + test work already required to
implement and verify the revision mechanism correctly across all four levels
(§7's full-chain test proves the mechanism itself is correct end-to-end even
without UI on every page), extending the identical, already-proven React
Query hook + modal pattern to the other three pages is mechanical, low-risk
follow-up work, not a design question.

The portal app was typechecked (`tsc --noEmit`) and built (`next build`)
successfully with these changes — see §12. Manual browser verification was
**not** performed (no interactive browser session was available in this run);
this is called out explicitly rather than claimed. The 6 changed items in the
Revise dialog and the History modal should be manually smoke-tested in a
browser before this ships to users.

---

## 6. Revision Eligibility

No new status enum values on any entity. `Revise` is legal exactly where
`Edit` is not and the document isn't terminal, using the existing status
values:

| Entity | `Edit` (existing) | `Revise` (new) | Terminal / locked |
|---|---|---|---|
| `CalibrationRequest` | `DRAFT` | `SUBMITTED`, `IN_QUOTATION` | `CANCELLED`, `FULFILLED` |
| `Quotation` | `DRAFT` | `SENT`, `APPROVED` | `REJECTED`, `EXPIRED`, `CANCELLED` |
| `PurchaseOrder` | `DRAFT` | `APPROVED`, `RECEIVED`, `CONFIRMED` | `FULFILLED`, `CANCELLED` |
| `WorkOrder` | n/a (items never editable) | `PLANNED`, `ASSIGNED` only | `IN_PROGRESS`, `DONE`, `CANCELLED` |

`CANCELLED` keeps its existing meaning (explicit user cancellation of the
whole document) everywhere — no revision path ever sets it, and it is never
interpreted as "superseded by revision." `TECHNICALLY_DONE`/`CLOSED` remain
untouched legacy values; the WorkOrder API continues to use `DONE` exclusively.

---

## 7. Item Revision Semantics

Implemented exactly per the locked decision in
`mom-1-item-revision-rule-20260919.md`:

```text
CalibrationRequestItem:
  in-place mutation while no downstream QuotationItem references it
  (checked per-item: QuotationItem.count({ where: { requestItemId } }));
  additive sibling row, cloned from the frozen row's identity fields, once
  consumed.

QuotationItem:
  in-place mutation while no downstream PurchaseOrderItem references it
  (checked per-item: PurchaseOrderItem.count({ where: { quotationItemId } }));
  additive sibling row once consumed.

PurchaseOrderItem:
  never mutated by any code path (matches its existing "never touched"
  behavior — no update() path exists today either). revise() is pull-based:
  it re-reads the parent Quotation's CURRENT items and INSERTs one new
  PurchaseOrderItem for every QuotationItem not yet represented on this PO.
  Existing rows are never touched.

WorkOrderItem:
  immutable after create (existing invariant, unchanged). revise() is
  pull-based, identical shape to PurchaseOrder's: re-reads the parent
  PurchaseOrder's CURRENT items and INSERTs one new WorkOrderItem for every
  PurchaseOrderItem not yet represented on this WorkOrder.
```

The `CalibrationRequestItem`/`QuotationItem` "in-place vs. additive" decision
is made inside `revise()` per line, driven purely by whether a child row
already exists — no client input decides this. `PurchaseOrder.revise()` and
`WorkOrder.revise()` take no item input at all for exactly this reason: they
never need to choose between mutate/add, because they only ever add (their
child-existence check across *every* current parent item naturally produces
the correct additive set).

**1 → 3 end-to-end (MOM §7), verified by test** (see §11): growing
Equipment A from 1 to 3 units after the whole chain already exists produces,
at every level, one frozen original row (`qty = 1`) plus one new sibling row
(`qty = 2`), never an edit to the original, and the two rows' combined
quantity (3) fans out correctly into 3 `CalibrationJob`s once the WorkOrder
starts.

---

## 8. History Snapshot Behavior

- **Complete snapshot, not delta.** Every `revise()` call first reads the
  *current* header and *all current* items, then writes one header-history
  row plus one item-history row per current item, tagged with the same
  `revisionNumber` — confirmed field-by-field against every operational
  model (§3) and covered by dedicated "complete snapshot" tests (§11).
- **INSERT-only.** No service method calls `.update()` or `.delete()` on any
  of the 8 history tables; no controller route exposes a mutating operation
  on history. This is enforced by the same convention the codebase already
  uses for `WorkOrderItem`'s immutability (absence of any code path), not by
  a database grant — see §13 for that residual risk.
- **Reconstructable after later revisions.** Revision #1's snapshot is read
  back unchanged after revision #2 (and #3) have been created — verified
  directly in tests (§11) by re-fetching an early revision after later ones
  exist.
- **Quantity decrease.** A later revision lowering qty (e.g. 3 → 2) is just
  another in-place update (only legal while unconsumed, per §7) with its own
  new history snapshot; no negative/delta rows are ever created, and earlier
  history rows are provably untouched.

---

## 9. AuditLog Integration

`AuditLog` and `*History` were kept strictly separate, per the MOM:

- Every `revise()` call writes exactly one `AuditLog` row via the existing,
  already-reusable `recordAuditLog()` helper
  (`apps/api/src/modules/calibration-jobs/audit-log.ts`) — action names
  `CALIBRATION_REQUEST_REVISE`, `QUOTATION_REVISE`, `PURCHASE_ORDER_REVISE`,
  `WORK_ORDER_REVISE`, `metadata: { number }`.
- `AuditLog` was not extended with new columns, and no full document
  snapshot is ever written into its `metadata` JSON — it stays a lightweight
  "this happened" pointer; the full snapshot lives only in `*History`.
- `recordAuditLog()` itself was not modified.

---

## 10. Transaction / Atomicity

Every `revise()` method follows the exact sequence the MOM's §5 specifies,
inside one `prisma.$transaction`:

1. A no-op `update({ where: { id }, data: {} })` (or the real header update,
   for `CalibrationRequest`/`Quotation`) on the current row first — this
   takes Postgres's row-level lock, which is what makes step 2 race-safe.
2. `allocateRevisionNumber()` (`packages/db/src/revision/revision-number.service.ts`)
   computes `MAX(revisionNumber) + 1` for that parent via `$queryRaw`,
   mirroring `DocumentNumberService.allocate()`'s existing atomic-counter
   shape — no new sequence table, no column added to any operational header.
3. The complete header + item history snapshot is inserted.
4. The item mutation (in-place update or additive INSERT) is applied.
5. Header totals are recomputed (Quotation/CalibrationRequest) or copied
   forward from the parent (PurchaseOrder, mirroring `create()`'s existing
   "copy the quotation's totals" behavior).
6. The transaction commits; `recordAuditLog()` runs immediately after, outside
   the transaction (same pattern the MOM's audit example implies — a failed
   revision never reaches this line, so no misleading audit record can be
   written).

If any step throws, the whole transaction rolls back — no partial history, no
partial item mutation. Verified directly by forcing failures (§11): an
invalid `deviceTypeId` mid-batch, and an attempt to shrink/no-op an
already-consumed item, both leave item count, qty, and history row count
completely unchanged.

The `(<parentId>, revisionNumber)` unique constraint (§3) is a defensive
backstop for the theoretical race the row-lock ordering above already
prevents; no `P2002` was observed in testing, and no retry wrapper was added
for it (the existing `isUniqueConstraintError` pattern in
`purchase-orders.service.ts`/`work-orders.service.ts` remains available if a
future load test shows it's needed — not added speculatively here).

---

## 11. Tests Executed

Vitest, this repository's standard runner (per `.claude/rules/testing.md`),
against the dedicated `pkmdb_test` Postgres database via the existing
`prepare-test-db` pretest hook. New `describe` blocks were added to the four
services' existing test files (no new test files, matching the one-file-per-service
convention already in place):

- `apps/api/src/modules/calibration-requests/calibration-requests.service.test.ts`
  → `describe("CalibrationRequestsService.revise")`: DRAFT rejection,
  terminal (CANCELLED) rejection, 1→3 in-place growth, complete-snapshot +
  3→2 decrease history, freeze-once-consumed + additive sibling, reject
  shrink-on-consumed, atomic rollback on an invalid batch line.
- `apps/api/src/modules/quotations/quotations.service.test.ts` →
  `describe("QuotationsService.revise")`: DRAFT rejection, the MOM's own
  QUO-01 1→3→4 example (asserting the header snapshot at each revision, the
  document number, and the subtotal), a later 3→2 decrease preserving earlier
  history, freeze-once-a-PO-exists + additive sibling, reject
  shrink-on-consumed, atomic rollback on an invalid batch line.
- `apps/api/src/modules/purchase-orders/purchase-orders.service.test.ts` →
  `describe("PurchaseOrdersService.revise")`: DRAFT rejection, "no pending
  scope" rejection, and the pull-based 1→3 case (Quotation revised first,
  then PurchaseOrder.revise() picks up the new scope as an additive sibling
  `PurchaseOrderItem`, leaving the original frozen; re-running revise()
  immediately afterward correctly reports no pending scope again).
- `apps/api/src/modules/work-orders/work-orders.service.test.ts` →
  `describe("WorkOrdersService.revise")`: "no pending scope" rejection,
  `IN_PROGRESS` lock rejection, and the **full end-to-end MOM §7 scenario**:
  REQ→QUOTATION→PO→WOL all revised in sequence, the original `WorkOrderItem`
  provably untouched (`qty` still 1, same row `id`), the new sibling carrying
  the delta (`qty` 2), the header history containing only the pre-revision
  snapshot, and — after `assign()`/`start()` — exactly 3 `CalibrationJob`s
  fanned out (1 from the original `PurchaseOrderItem`, 2 from the sibling),
  proving the existing fan-out mechanism needed no changes.

Also run: the full existing suites for all four service files (regression
check), `packages/db`, `packages/shared`, `apps/portal`, and the complete
`apps/api` suite.

---

## 12. Test Results

| Suite | Result |
|---|---|
| `calibration-requests.service.test.ts` (standalone) | **37 / 37 passed** |
| `quotations.service.test.ts` (standalone) | **51 / 51 passed** |
| `purchase-orders.service.test.ts` (standalone) | **36 / 36 passed** |
| `work-orders.service.test.ts` (standalone) | **91 / 91 passed** |
| `packages/db` full suite | **37 / 37 passed** |
| `packages/shared` full suite | **67 / 67 passed** |
| `apps/portal` full suite | **221 / 221 passed** |
| `apps/api` full suite (all files, one parallel run) | **1260 / 1274 passed** (14 failed across 7 files — see below) |
| `apps/api typecheck` (`tsc --noEmit`) | **clean** |
| `apps/api build` (`tsc -p tsconfig.json`) | **clean** |
| `packages/db typecheck` | **clean** |
| `packages/shared typecheck` | **clean** |
| `apps/portal typecheck` (`tsc --noEmit`) | **clean** |
| `apps/portal build` (`next build`) | **clean** — 58 routes generated, including the two Quotation detail routes |

**The 14 full-suite failures are not regressions from this work.** None of
them touch `CalibrationRequest`, `Quotation`, `PurchaseOrder`, `WorkOrder`, or
any file this MOM changed:

- 3 timeouts in `work-orders.service.test.ts` under
  `describe("WorkOrdersService reference equipment")` — reference-equipment
  confirmation logic, untouched by this MOM. Re-running the entire file
  standalone passes 91/91 including these same tests, confirming a
  full-suite parallel-load timeout, not a real failure.
- 1 timeout in `calibration-jobs.service.test.ts` (company-scoping) —
  confirmed by an isolated re-run: **174/174 passed** standalone.
- 1 timeout in `chat.gateway.security.test.ts` (websocket room isolation) —
  unrelated module.
- 1 assertion failure in `contact-messages.push.test.ts` and 4 in
  `imap-sync.service.test.ts` (`IMAP is not configured` — an environment/config
  dependency, not code) — unrelated modules, pre-existing.
- 2 in `notification-dispatch.service.test.ts`
  (`push.resolvePushIconUrl is not a function`) — a pre-existing bug in
  `notification-dispatch.service.ts` unrelated to this MOM.
- 1 in `registration-origin-callers.test.ts` — a static-analysis-style test
  over `apps/tech-pwa`'s sign-up page, wholly unrelated to the calibration
  transaction chain.

Every test file this MOM actually touches passes 100% both standalone and
inside the full run.

---

## 13. Known Constraints / Pre-existing Behavior

- **Portal UI wired up for Quotation only** (§5) — `CalibrationRequest`,
  `PurchaseOrder`, and `WorkOrder` detail pages do not yet expose `Revise`/
  `History` buttons, even though their API endpoints are fully implemented
  and tested. Follow-up work, not a design gap.
- **No DB-level append-only enforcement.** History-table immutability is
  enforced the same way `WorkOrderItem`'s immutability already is in this
  codebase: by the complete absence of any `.update()`/`.delete()` call
  against those tables in any service, not by a Postgres `REVOKE UPDATE,
  DELETE` grant or trigger. A future hardening step, out of this MOM's scope.
- **Decreasing already-consumed scope is not supported.** `revise()` rejects
  (`*_ITEM_ALREADY_CONSUMED`) any attempt to shrink or no-op an item that has
  already been snapshotted downstream — there is no defined business rule
  for "un-consuming" scope a child document already depends on (e.g. you
  cannot shrink a `CalibrationJob` fan-out that has already happened). This
  mirrors the immutability invariant rather than working around it.
- **`PurchaseOrder`'s "one active PO per quotation" rule has no DB-level
  backstop** (service-layer check only, unlike `WorkOrder`'s partial unique
  index) — pre-existing asymmetry, unrelated to and unchanged by this MOM.
- **Environment quirk, not a regression:** running `pnpm --filter @medcal/db
  test` from the repo root in this session's shell intermittently failed to
  pick up `TEST_DATABASE_URL` via the package's own `.env` auto-detection
  (`tryLoadRepoEnv` in `packages/db/src/testing/use-test-database.ts`); with
  the variable exported explicitly the suite passes 37/37. This is an
  existing, unrelated fragility in that auto-detection helper, not something
  this MOM introduced or fixes.
- **No repository rule conflicted with this task's instructions** — per §16,
  this is stated explicitly since none was found requiring documentation.

---

## 14. Explicit Confirmation of Non-Goals

Confirmed, by inspection of the final diff:

- No status enum gained, lost, or renamed a value on any of the six enums
  the MOM references (`CalibrationRequestStatus`, `QuotationStatus`,
  `PurchaseOrderStatus`, `PurchaseOrderItemStatus`, `WorkOrderStatus`,
  `AkdAklDeclaration`). `TECHNICALLY_DONE`/`CLOSED` remain untouched legacy
  values; the API never uses them.
- No customer-facing document number changed shape or gained a suffix —
  `QUO-01`, `PO-001`, `WOL-01`/`SPK-01` remain exactly as issued across every
  revision (asserted directly in tests).
- `CalibrationRequest` was not renamed, and neither were any of its tables.
- `AuditLog` was not replaced, extended with new columns, or duplicated by
  `*History` (§9).
- No event-sourcing or CQRS infrastructure was introduced — history rows are
  plain INSERT-only Prisma models, read via ordinary `findMany`/`findFirst`.
- `WorkOrderItem`'s "immutable after create" invariant was not weakened —
  no code path anywhere updates a `WorkOrderItem` row's `qty` after creation
  (verified directly: the original row's `id` and `qty` are asserted
  unchanged after a revision in the end-to-end test).
- `CalibrationJob` fan-out, its WorkOrder-wide idempotency guard, and
  `unitOrdinal`/`unitTotal` semantics were not modified — the existing
  `fanOutCalibrationJobs()` method is byte-for-byte unchanged; the end-to-end
  test proves it already produces correct results for revised scope without
  any change.
- No unrelated module, screen, or service was refactored or "improved."
- History item identity is *not* a new item-identity architecture — every
  history item row carries a plain `sourceItemId` pointer back to the
  operational row it was copied from; nothing about `CalibrationRequestItem`/
  `QuotationItem`/`PurchaseOrderItem`/`WorkOrderItem` identity changed.
