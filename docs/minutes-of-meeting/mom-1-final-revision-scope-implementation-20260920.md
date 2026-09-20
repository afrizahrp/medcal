# MOM #1 — Final Revision Scope Implementation Report

**Status:** Implemented per the approved design
(`mom-1-final-revision-scope-design-20260920.md`). No redesign, no scope
expansion, no new architecture — every mechanism below was already specified
in that design document; this report records what was actually built and
tested.

---

## 1. Files Changed

**Schema / migration**
- `packages/db/prisma/schema.prisma` — added `isActive Boolean @default(true)`
  to `CalibrationRequestItem` and `QuotationItem` (the minimum schema
  extension the approved design called for; `PurchaseOrderItem` already had
  the equivalent via `PurchaseOrderItemStatus.CANCELLED`, `WorkOrderItem`
  needs none — see §2).
- `packages/db/prisma/migrations/20260920100000_mom1_revision_scope_isactive/migration.sql`
  (new).

**Backend**
- `apps/api/src/modules/calibration-requests/calibration-requests.service.ts`
  — `revise()` rewritten as desired-scope reconciliation; new
  `assertRetirementSafe()` cross-chain guard; `calibrationRequestInclude`
  now filters `items` to `isActive: true`.
- `apps/api/src/modules/quotations/quotations.service.ts` — `revise()`
  rewritten the same way; new `assertRetirementSafe()`; `quotationInclude`,
  `assertFullScopeItems()`, `buildGeneratedRows()`'s request-item source
  query, and `preview()`'s request-item source query all filter to
  `isActive: true`.
- `apps/api/src/modules/purchase-orders/purchase-orders.service.ts` —
  `revise()` rewritten as active-scope pull reconciliation (add + retire,
  still no body); new `assertRetirementSafe()`; `purchaseOrderInclude` and
  `create()`'s quotation-item source query filter to active scope.
- `apps/api/src/modules/work-orders/work-orders.service.ts` — `revise()`
  rewritten as active-scope pull reconciliation (add + hard-delete, still no
  body); `create()`'s and `getEquipmentProposalForPurchaseOrder()`'s PO-item
  source queries filter to active (non-`CANCELLED`) scope.

**Tests** (updated/added only — see §5 for the full list)
- `apps/api/src/modules/calibration-requests/calibration-requests.service.test.ts`
- `apps/api/src/modules/quotations/quotations.service.test.ts`
- `apps/api/src/modules/purchase-orders/purchase-orders.service.test.ts`
- `apps/api/src/modules/work-orders/work-orders.service.test.ts`

**UI**
- `apps/portal/src/app/management/calibration-requests/[id]/page.tsx` —
  `ReviseRequestDialog` fully rewritten: desired-scope editor with Add
  Device, Change Device, Remove Device, Change Quantity, all accumulated
  into one submission.
- `apps/portal/src/app/management/quotations/[id]/page.tsx` —
  `ReviseQuotationDialog` fully rewritten the same way (Add Device here
  means picking an active Requisition line not yet on the Quotation — see
  §4).
- `apps/portal/src/app/management/purchase-orders/[id]/page.tsx` — added a
  minimal, client-side-only preview line to the existing trigger-style
  Revise confirm dialog.
- `apps/portal/src/app/management/work-orders/[id]/page.tsx` — same minimal
  preview addition to its Revise confirm dialog.

No other file was modified. No new API route, no new DTO/schema beyond the
two `isActive` columns, no new shared component library.

---

## 2. Schema / Migration Changes

Exactly the minimum extension the approved design specified (§6.1 of that
document):

```prisma
model CalibrationRequestItem {
  ...
  isActive Boolean @default(true)
  ...
}

model QuotationItem {
  ...
  isActive Boolean @default(true)
  ...
}
```

`PurchaseOrderItem` needed no schema change — it reuses the existing,
previously-dormant `PurchaseOrderItemStatus.CANCELLED` value (Decision C),
which is now a live, written-to state for the first time.
`WorkOrderItem` needed no schema change and gained no new field — removal at
that level is always a hard delete (§8 of this report), never retirement, so
no "inactive" concept was needed there.

Applied via a hand-authored migration
(`20260920100000_mom1_revision_scope_isactive`) rather than
`prisma migrate dev`, because the dev database had an unrelated,
pre-existing migration-checksum drift (`20260920014002_add_general_manager_role`,
not created by this task) that made `migrate dev`'s shadow-database replay
fail. `prisma migrate diff --from-url ... --to-schema-datamodel ...` was used
instead to compute the exact SQL against the live database, which was then
placed in a normal migration folder and applied with `prisma migrate deploy`
— a read-only diff and a normal, additive `ALTER TABLE ... ADD COLUMN`, no
destructive operation, no changes to any other migration.

---

## 3. Backend Changes

### 3.1 Desired-scope reconciliation (`CalibrationRequest`, `Quotation`)

Both `revise()` methods now treat `input.items` as the **complete** desired
active scope, not a set of edits — matching the approved design exactly:

- A current active item's `id` **present** in `input.items` → `UNCHANGED`/
  `QTY_CHANGED`, applied in place if unconsumed.
- A current active item's `id` **absent** from `input.items` → `REMOVED`:
  hard-deleted if unconsumed, retired (`isActive: false`) if consumed —
  after the `assertRetirementSafe()` cross-chain guard passes.
- An `input.items` entry with **no `id`** → `ADDED`: a genuinely new row,
  fresh lineage, never inheriting an old row's `id`.
- A consumed row's qty **increase** → unchanged mechanism from the prior
  MOM #1 pass: an additive sibling row carrying only the delta, frozen row
  untouched.
- A consumed row's qty **decrease** (previously rejected outright) →
  **now supported**: the frozen row is retired (`isActive: false`, after the
  guard) and a new active row is created carrying the **full** new desired
  qty — never a negative delta, never a mutation of the frozen row. This is
  the one behavior this task changed relative to the immediately-prior
  implementation, and it was explicitly called for by the approved design
  (§5.4).

Matching is by row `id` only, exactly as mandated — `deviceTypeId`,
`requestItemId`, `quotationItemId`, `purchaseOrderItemId`, `deviceId`,
`tariffId` are never used to match a revision line to an existing row.
"Replace" is not a persisted concept: it is exactly `REMOVED` + `ADDED`, with
no `replacedById`/`supersedesId` field anywhere.

### 3.2 Active-scope pull reconciliation (`PurchaseOrder`, `WorkOrder`)

Both `revise()` methods keep their **no-body, pull-based** contract exactly
as instructed — neither gained an input parameter:

- `PurchaseOrder.revise()`: reconciles against the parent Quotation's
  current active (`isActive: true`) items. An active Quotation item not yet
  represented by any `PurchaseOrderItem` (of any status) is added. An active
  `PurchaseOrderItem` whose source Quotation item is no longer active is
  retired — hard-deleted if no `WorkOrderItem` exists for it yet, otherwise
  `status: "CANCELLED"` (after the guard). Never mutates an existing
  `PurchaseOrderItem`'s qty.
- `WorkOrder.revise()`: reconciles against the parent PurchaseOrder's
  current active (non-`CANCELLED`) items. An active PO item not yet
  represented by a `WorkOrderItem` is added. A `WorkOrderItem` whose source
  PO item is no longer active is **always hard-deleted** — never retired,
  because revision only runs while `PLANNED`/`ASSIGNED`, before any
  `CalibrationJob` can exist for it (§8). Never mutates an existing
  `WorkOrderItem`'s qty or identity — the existing immutability invariant is
  fully preserved.

### 3.3 Cross-chain safety guard (`assertRetirementSafe`)

Implemented once per service (`calibration-requests.service.ts`,
`quotations.service.ts`, `purchase-orders.service.ts`), each adapted to that
level's relation path to `WorkOrderItem`/`WorkOrder`, exactly per the
approved design (§7.1/§10):

```
Before flipping isActive:false / status:"CANCELLED" on a consumed item,
look for any WorkOrderItem derived from it whose WorkOrder.status is
NOT IN (PLANNED, ASSIGNED). If one exists, reject with
RETIREMENT_BLOCKED_BY_WORK_ORDER_PROGRESS instead of proceeding.
```

Each check runs as a single Prisma query using nested relation filters
(e.g. `workOrderItem.findFirst({ where: { purchaseOrderItem: { quotationItem: { requestItemId: { in } } }, workOrder: { status: { notIn: [...] } } } })`),
evaluated **inside** the same transaction as the retirement write, against
live transactional data — never pre-checked outside the transaction, so a
concurrent `WorkOrder.start()` cannot race past it. On rejection, the entire
transaction rolls back (verified by test — see §5).

No `CalibrationJob` cancellation, void, or rollback mechanism was
introduced — the guard's only action is to refuse the revision outright, per
the approved design's explicit instruction.

### 3.4 "Active scope" everywhere else

Per the approved design's requirement that "only active scope propagates
downstream," every read path that feeds a downstream operation (or the
document's own current-state display) was updated to filter accordingly:

| Query | File | Filter added |
|---|---|---|
| `calibrationRequestInclude.items` | calibration-requests.service.ts | `isActive: true` |
| `quotationInclude.items` | quotations.service.ts | `isActive: true` |
| `assertFullScopeItems()`'s request-item read | quotations.service.ts | `isActive: true` |
| `buildGeneratedRows()`'s request-item source (in `create()`) | quotations.service.ts | `isActive: true` |
| `preview()`'s request-item source | quotations.service.ts | `isActive: true` |
| `purchaseOrderInclude.items` | purchase-orders.service.ts | `status: { not: "CANCELLED" }` |
| `create()`'s quotation-item source | purchase-orders.service.ts | `isActive: true` |
| `create()`'s PO-item source | work-orders.service.ts | `status: { not: "CANCELLED" }` |
| `getEquipmentProposalForPurchaseOrder()`'s PO-item source | work-orders.service.ts | `status: { not: "CANCELLED" }` |

`WorkOrderItem`'s own list is never filtered — a retired/removed
`WorkOrderItem` is always hard-deleted, so it is simply absent; there is no
status value to filter on.

---

## 4. UI Changes

### 4.1 `CalibrationRequest` and `Quotation` Revise dialogs

Both now present the complete desired scope as a list of rows, each with a
status badge (**Added** / **Changed** / **Removed**, unmarked = unchanged),
and:

- **`+ Add Device`** — appends a new row. On `CalibrationRequest`, this
  reuses the existing `DeviceTypeItemSelect` component (the same
  device-type picker the Create/Edit forms already use) — no new selector
  was built. On `Quotation`, "Add Device" means picking one of the
  underlying Requisition's active lines not yet represented on this
  Quotation (a Quotation line is always derived from a Requisition line —
  there is no free-standing device-type concept at this level; that already
  exists one level up). This uses a plain `<select>` styled with the
  existing `selectClassName` token, not a new component.
- **Change Device** (`CalibrationRequest` only, where a row has an
  identity to swap) — one button that, client-side, marks the existing row
  "Removed" (kept visible, struck through) and inserts a fresh row with no
  `id` right after it, defaulting its qty to the old row's qty. The new row
  never carries the old row's `id`. There is no equivalent action on
  `Quotation` — a device swap there is just Remove one line + Add a
  different Requisition line, both of which already exist as separate
  actions, so a dedicated "Change Device" button would only duplicate them.
- **Remove** — on an existing row, marks it "Removed" and keeps it visible
  (struck through, with an "Undo" button) rather than deleting it from the
  view; on a newly-added row (no `id`), removes it outright since it was
  never real. Removed rows are excluded from the submitted payload.
- **Change Quantity** — a numeric input on each non-removed row, unchanged
  in spirit from the prior implementation.

All changes accumulate in local component state; `Save Revision` submits the
complete desired scope exactly once, matching the required "one atomic
Revision" behavior.

### 4.2 `PurchaseOrder` and `WorkOrder` Revise dialogs

Kept exactly as trigger-style `ConfirmDialog`s (no body, no new workflow),
per the explicit instruction not to turn these into desired-scope input
APIs. The only change: the confirmation description now includes a minimal
preview — e.g. *"2 item akan ditambahkan, 1 item akan di-retire
(CANCELLED)."* — computed **entirely client-side** from data the page
already fetches (`usePurchaseOrder`/`useQuotation` on the PO page;
`useWorkOrder`/`usePurchaseOrder` on the WO page), mirroring the backend's
own reconciliation logic read-only. No new preview API endpoint was added.

---

## 5. Tests Executed and Results

Per the testing rules, the dedicated Postgres test database
(`pkmdb_test`) was migrated via the existing `prepare-test-db` pretest hook
before every run; full, unfiltered Vitest output was inspected for each run
below (none piped through `grep`/`head`/etc.).

### 5.1 Updated tests (behavior intentionally changed)

- `calibration-requests.service.test.ts` / `quotations.service.test.ts`:
  the previous test *"rejects shrinking or no-op qty on an already-consumed
  item"* was replaced with two tests reflecting the new, approved behavior:
  - *"no-op: resubmitting the same qty on an already-consumed item changes
    nothing"*
  - *"MOM #1 Final Revision Scope Design: shrinking an already-consumed
    item retires the frozen row and adds a new active row with the full
    desired qty"*

### 5.2 New tests added (minimum coverage per the task)

**CalibrationRequest** (`calibration-requests.service.test.ts`):
unchanged/qty-change (pre-existing), add, remove (unconsumed → hard
delete), remove (consumed → retired), replace (remove + add), consumed qty
increase (pre-existing) and decrease (new), combined revision
(add + remove + qty-change in one call).

**Quotation** (`quotations.service.test.ts`): the same categories —
add (via a Requisition line grown first), remove (unconsumed → hard
delete), remove (consumed → retired), replace (remove + add).

**PurchaseOrder** (`purchase-orders.service.test.ts`): pull new active
scope (pre-existing "1 → 3" test), retire to `CANCELLED` (new — includes
verifying the *other* active item is preserved untouched), cross-chain
safety guard (new — retiring a consumed item is correctly rejected once its
`WorkOrder` has left `PLANNED`/`ASSIGNED`, with the row proven unchanged
afterward, i.e. the transaction rolled back completely).

**WorkOrder** (`work-orders.service.test.ts`): pull new active PO scope,
`PLANNED`/`ASSIGNED` boundary, reject-after-`IN_PROGRESS` (all pre-existing
and still passing unchanged), remove an inactive PO-derived item (new — hard
delete, other item preserved).

### 5.3 Results

| Suite | Result |
|---|---|
| `calibration-requests.service.test.ts` | **43 / 43 passed** |
| `quotations.service.test.ts` | **56 / 56 passed** |
| `purchase-orders.service.test.ts` | **38 / 38 passed** |
| `work-orders.service.test.ts` | **92 / 92 passed** |
| `apps/api` full suite | **1278 / 1288 passed** (10 failed, all pre-existing/unrelated — see §5.4) |
| `apps/api` typecheck (`tsc --noEmit`) | **clean** |
| `apps/api` build (`tsc -p tsconfig.json`) | **clean** |
| `apps/portal` full suite | **222 / 222 passed** |
| `apps/portal` typecheck | **clean** |
| `apps/portal` build (`next build`) | **clean** — 58 routes generated |

Every one of the 213 pre-existing tests across the four touched service
files that were **not** about the shrink-on-consumed behavior passed
unchanged on the first run after the backend rewrite — a strong signal the
reconciliation rewrite is additive/correct rather than a behavioral
regression relative to everything already covered.

### 5.4 Full `apps/api` suite

**1278 / 1288 passed.** The 10 failures are confirmed pre-existing and
unrelated to this task — none touch `CalibrationRequest`, `Quotation`,
`PurchaseOrder`, `WorkOrder`, or any file changed in this implementation.
Every distinct failure visible in the run's output was already identified
as pre-existing in an earlier report this session
(`mom-1-ui-coverage-completion-20260920.md`, §8):

- `emails/imap-sync.service.test.ts` — fails because no IMAP server is
  configured in this environment (an environment/config dependency, not
  code).
- `push-tokens/notification-dispatch.service.test.ts` — fails on a
  pre-existing bug (`push.resolvePushIconUrl is not a function`) in
  `notification-dispatch.service.ts`, unrelated to this MOM.
- `whitelist/registration-origin-callers.test.ts` — a static-analysis-style
  test asserting every `signUpEmail` call site in the whole monorepo carries
  an Origin header; it fails on a pre-existing gap in
  `apps/tech-pwa/src/app/sign-in/register/page.tsx`, wholly unrelated to the
  calibration transaction chain.

No `calibration-jobs`, `chat`, `contact-messages`, or `work-orders`
"reference equipment" timeouts occurred in this run (all previously
identified as full-suite-parallel-load flakes, not real failures — see the
same earlier report for the standalone re-runs that confirmed this). Every
test file this implementation actually touches
(`calibration-requests.service.test.ts`, `quotations.service.test.ts`,
`purchase-orders.service.test.ts`, `work-orders.service.test.ts`) passed
100% both standalone (§5.3) and inside this full run.

---

## 6. Known Constraints / Pre-existing Behavior (Not Introduced by This Task)

- The `.min(1)` constraint on `calibrationRequestReviseSchema.items` /
  `quotationReviseSchema.items` means a client cannot submit an empty
  desired scope through the real HTTP API — removing every item down to
  zero is only exercisable by calling the service directly (as the new
  "remove (consumed)" tests do). This mirrors `create()`'s existing
  `items.min(1)` constraint and was left unchanged, consistent with not
  expanding scope beyond the approved design.
- The two open items the approved design explicitly flagged as
  `BUSINESS DECISION REQUIRED` (§16 of that document) remain open: what a
  rejected cross-chain guard's recovery path should be, and whether the new
  `isActive` field should ever grow beyond a boolean. Neither was answered
  or silently resolved by this implementation.
- Manual browser click-through of the new Revise dialogs was not performed
  in this pass (typecheck, unit/integration tests, and production builds
  were used as the verification instruments instead, consistent with the
  task's "stop and report a genuine blocker" instruction rather than
  attempting an environment-dependent manual pass mid-implementation).

## 7. Genuinely Blocking Issues Encountered

One transient environment blocker, resolved during the session, not a
defect in the approved design: `prisma generate` failed with `EPERM` because
the user's own running `api`/`web-api` dev servers held the Windows query
engine binary locked. Resolved by asking the user to stop those two
processes; no code change was needed. No other blocker was encountered —
the approved design was implementable as specified, with no gap requiring a
deviation from it.
