# Investigation: CalibrationJob Fan-Out — Source Entity, Cardinality, Trigger Point

**Mode:** Read-only analysis. No schema, code, migration, or documentation file was modified. This
report is the only file written. No migrations were run. No fan-out logic was implemented.

**Date:** 2026-09-02
**Schema read:** `packages/db/prisma/schema.prisma` (working tree, includes the applied
`20260902050955_add_calibrationjob_identity_fields` migration)
**Code read:** `apps/api/src/modules/work-orders/work-orders.service.ts`,
`purchase-orders/purchase-orders.service.ts`, `quotations/quotations.service.ts`,
`calibration-requests/calibration-requests.service.ts`,
`calibration-requests/calibration-request-import.service.ts`,
`work-orders/delivery-notes.service.ts`

---

## Summary Recommendation

**Cardinality source ("N"):** `WorkOrderItem.qty`. It is the correct source of truth because the
commercial chain copies quantity verbatim at every hop and `WorkOrderItem` is a strict 1:1
snapshot of `PurchaseOrderItem` (schema line 1620 comment "MVP copies every PO item 1:1", enforced
by `@@unique([workOrderId, purchaseOrderItemId])` at line 1634 and the unconditional
`createMany` at `work-orders.service.ts:269`). Each `WorkOrderItem` resolves to exactly one
`DeviceType` (via `purchaseOrderItem → quotationItem → requestItem → deviceTypeId`), so
`qty: 3` unambiguously means "3 physical units of the same DeviceType" and fan-out is a flat
`for each WorkOrderItem: create qty jobs` loop with **no** per-DeviceType sub-branching.

**Trigger point:** The working assumption (create jobs when `WorkOrder` → `IN_PROGRESS`, i.e. the
`start()` method at `work-orders.service.ts:473`) is workable and safe, but it is **not the only
natural point** — every input needed for fan-out (qty, DeviceType, originating
`CalibrationRequestItem`, `customerDeviceName`) is already frozen at WorkOrder **creation**
(`PLANNED`). Recommendation (flagged as recommendation, not decision): create at `start()` for
MVP because it keeps zero-value job rows out of WorkOrders that are cancelled before work
begins, and because `start()` already runs a `$transaction`-free guarded transition that is a
clean seam. If the team prefers jobs to exist as soon as the WO is planned (e.g. for
scheduling/AKD-AKL pre-review), creating them in the WO-creation transaction is equally correct
and arguably cleaner.

**Idempotency:** There is **no natural unique key** that prevents double fan-out
(`@@unique([workOrderId, deviceId])` at schema line 1811 does not bind while `deviceId` is
NULL — Postgres treats NULLs as distinct, which is called out in the schema comment itself). An
**explicit guard is required**. The codebase has a well-established pattern to copy:
`delivery-notes.service.ts:63` ("if it already exists, return it unchanged") and the
`existingActive` pre-check + `P2002` catch in both `work-orders.service.ts:221` and
`purchase-orders.service.ts:115`.

**`calibrationRequestItemId` population:** **Feasible today, with one caveat.** The walk
`WorkOrderItem → purchaseOrderItem → quotationItem → requestItem` exists and is already used in
production code (`workOrderInclude` at `work-orders.service.ts:50-65`; the WO PDF builder walks
the identical path). The caveat: `QuotationItem.requestItemId` is a **nullable** column
(`schema.prisma:1490`, relation optional at line 1505). In practice it is always set — server
generation always writes `requestItem.id` (`quotations.service.ts:341`) and the manual PATCH
path types it as a required `string` (`quotations.service.ts:243`, `271`) — but fan-out code
must treat a NULL as "link unavailable, store NULL" rather than assume it is present.

---

## Step 1 — Quantity-Bearing Chain (live schema)

### `CalibrationRequestItem` (schema.prisma:1350–1393)

| Aspect | Finding |
|---|---|
| Quantity field | **`qty Int @default(1)`** (line 1373). Comment: "Aggregate quantity for this line — how many physical units… Excel import keeps one row per spreadsheet line and stores its Qty here (it is NOT split into N rows). Manual '+ Requisition' entry creates one row per device, so qty stays 1." CHECK constraint `qty >= 1` in migration. |
| Device-identity fields | `deviceTypeId String` (**required**, line 1354, FK to `DeviceType`). Plus free-text `customerDeviceName String?` (1358), `model String?` (1361), `deviceId String?` (1367, free-text, NOT a Device FK), `akdAkl String?` (1380). |
| Relationship upward | Root of the chain. `request CalibrationRequest` (many items per request). Downward: `quotationItems QuotationItem[]` (1:N — one requisition line can appear in multiple quotation versions/lines), `calibrationJobs CalibrationJob[]` (1:N — the new back-link). |

### `QuotationItem` (schema.prisma:1485–1510)

| Aspect | Finding |
|---|---|
| Quantity field | **`qty Decimal @default(1) @db.Decimal(18,4)`** (line 1493). Note: type **widens from `Int` to `Decimal`** here. |
| Device-identity fields | `deviceId String?` (1489, optional Device FK), `requestItemId String?` (1490, **optional** FK to `CalibrationRequestItem`). No `deviceTypeId` column — DeviceType is only reachable transitively via `requestItem.deviceTypeId`. |
| Relationship upward | `requestItem CalibrationRequestItem?` — **optional**. Generation sets it 1:1 per requisition line (`quotations.service.ts:323` loops `request.items`, one row each, `requestItemId: requestItem.id` at line 341). `assertFullScopeItems` (`quotations.service.ts:212`) enforces that a full-scope PATCH covers **every** requisition line exactly once (rejects duplicates and partial sets), so the 1:1 correspondence is preserved across edits. |
| Quantity provenance | POST/generate: `qty` copied verbatim from `requestItem.qty` (`quotations.service.ts:332`, comment "qty is copied verbatim from the requisition (BR-03)"). DRAFT PATCH: `buildItemRows` (`quotations.service.ts:259`) takes caller-supplied `item.qty ?? DEFAULT_QTY` — **a manual edit of a DRAFT quotation CAN change qty** and CAN in principle set a non-integer (the column is `Decimal(18,4)`; whether the DTO validator forbids fractions was not confirmed in this pass). Once the quotation is SENT/APPROVED it is locked (`assertNoPendingPrices` gate + status checks). |

### `PurchaseOrderItem` (schema.prisma:1548–1575)

| Aspect | Finding |
|---|---|
| Quantity field | **`qty Decimal @default(1) @db.Decimal(18,4)`** (line 1556). |
| Device-identity fields | `deviceId String?` (1553, optional Device FK), `quotationItemId String` (**required**, line 1552, FK `onDelete: Restrict`). No `deviceTypeId`. Also `workOrderId String?` (1560, legacy allocation pointer — schema comment at WorkOrder line 1609 "Legacy… Unused by WorkOrder MVP"). |
| Relationship upward | `quotationItem QuotationItem` — **required, 1:1**. `@@unique([purchaseOrderId, quotationItemId])` (line 1572). |
| Quantity provenance | PO generation copies `qty` verbatim from each quotation item (`purchase-orders.service.ts:159-173`, `qty: item.qty`). **`PurchaseOrdersService.update` (line 258) does NOT touch items at all** — it only edits `customerPoNumber` / `customerPoDate` / `notes`, and only while `status === "DRAFT"`. There is **no PO-item edit endpoint** in the service. So contrary to the concern in the task brief, **manual PO edits cannot currently diverge the quantity** from the quotation. |

### `WorkOrderItem` (schema.prisma:1620–1637)

| Aspect | Finding |
|---|---|
| Quantity field | **`qty Decimal @default(1) @db.Decimal(18,4)`** (line 1628). Schema doc comment (1620–1621): *"Operational snapshot of a PurchaseOrderItem. MVP copies every PO item 1:1. Quantity and source identity are immutable after create."* |
| Device-identity fields | **None directly.** Only `purchaseOrderItemId String` (required, line 1626, FK `onDelete: Restrict`) and free-text `description`. DeviceType is reachable only via `purchaseOrderItem → quotationItem → requestItem → deviceTypeId`. |
| Relationship upward | `purchaseOrderItem PurchaseOrderItem` — **required, 1:1**. `@@unique([workOrderId, purchaseOrderItemId])` (line 1634). Created by an unconditional `createMany` over **every** `purchaseOrder.items` at `work-orders.service.ts:269-277` with `qty: item.qty`. The "1:1 snapshot of PurchaseOrderItem" claim from the prior audit is **verified accurate against the live schema and live code.** |
| Mutability | No update path. `WorkOrdersService` has no WorkOrderItem edit method; items are written once in the creation transaction. |

### `WorkOrderEquipment` (schema.prisma:1654–1686)

| Aspect | Finding |
|---|---|
| Quantity field | **None.** One row = one specific PKM reference-equipment unit. |
| Device-identity fields | `equipmentId String` (FK to `Equipment` — PKM's own calibrated reference gear), `equipmentTypeId String` (snapshot of `EquipmentType`), `sortOrder Int`. **Nothing customer-device-related.** |
| Relationship | Belongs to `WorkOrder` (N per WO for ON_SITE; zero for SEND_TO_LAB — schema comment line 1660). Schema comment 1654–1660: *"Actual PKM reference-equipment units selected to be brought for a specific ON_SITE WorkOrder… the DEFAULT proposal is DERIVED at read time from DeviceTypeEquipmentRequirement… but once selected the list belongs to the WorkOrder."* |
| Relation to `CalibrationJob` | **None.** No FK in either direction. (The job-side counterpart for "which reference gear was actually used" is the separate `JobReferenceEquipmentUsed` model, populated later by the technician, schema line ~1847.) |

### Chain summary

```
CalibrationRequestItem.qty (Int, >=1)          ── verbatim (BR-03) ──►
QuotationItem.qty          (Decimal 18,4)       ── verbatim, editable while DRAFT ──►
PurchaseOrderItem.qty      (Decimal 18,4)       ── verbatim, NO edit path ──►
WorkOrderItem.qty          (Decimal 18,4)       ── verbatim, immutable, 1:1 ──►
CalibrationJob rows        (N = qty)            ◄── this task designs this hop
```

Every hop is 1:1 and copies `qty` unchanged. The **only** point where the number can diverge
from the customer's original requisition is a **manual edit of a DRAFT quotation**
(`quotations.service.ts:259` `buildItemRows`). After the quotation leaves DRAFT the number is
frozen through to `WorkOrderItem`.

---

## Step 2 — Cardinality Source

### 2.1 Which entity's quantity is "N"

**`WorkOrderItem.qty`**, evaluated at fan-out time.

Reasoning:

- Fan-out runs in the WorkOrder context, and `WorkOrderItem` is the WorkOrder's own immutable
  snapshot of quantity (schema comment: *"Quantity… immutable after create"*). Reading it
  needs no cross-aggregate join and cannot be affected by later edits elsewhere.
- It is provably consistent with the rest of the chain: `WorkOrderItem` ← (1:1, verbatim)
  `PurchaseOrderItem` ← (1:1, verbatim, no edit path) `QuotationItem` ← (1:1 via
  `assertFullScopeItems`, verbatim at generation) `CalibrationRequestItem`.
- The one divergence risk (DRAFT-quotation manual qty edit) is **intended business behaviour** —
  if a salesperson corrects the quantity while negotiating, the corrected number is what the
  customer signed a PO against, so the quotation's number (which flows into `WorkOrderItem`)
  **should win** over the raw requisition number. `CalibrationRequestItem.qty` is the customer's
  initial ask, not the contracted amount.

**Do not** use `CalibrationRequestItem.qty` directly — it can be stale relative to the contract,
and one requisition line can spawn multiple quotation lines across quotation versions
(`quotationItems QuotationItem[]` is 1:N), making "which requisition qty" ambiguous from the WO
side.

**Caveat to resolve before implementation:** `WorkOrderItem.qty` is `Decimal(18,4)`. Fan-out
creates an integer number of rows. Implementation must decide how to coerce (expect it is always
integral in practice; recommend asserting `qty` is a positive integer at fan-out and failing
loudly otherwise, rather than silently `Math.floor`-ing). See Open Questions.

### 2.2 Does `WorkOrderEquipment` bear on the count?

**No. Confirmed.** `WorkOrderEquipment` is PKM's own reference gear carried to site, has no
quantity semantics for customer devices, has no relation (FK or derived) to `CalibrationJob`,
and does not exist at all for SEND_TO_LAB work orders. The prior audit's description
("reference equipment carried to site… not the customer device… no relation to CalibrationJob")
is **still accurate**. `WorkOrderEquipment` must **not** be the fan-out source and must not
influence the count in any way.

### 2.3 Can one `WorkOrderItem` represent multiple DeviceTypes?

**No — exactly one DeviceType per `WorkOrderItem`.**

Trace: `WorkOrderItem` → `purchaseOrderItem` (1:1) → `quotationItem` (1:1) → `requestItem` (1:1
when present) → `deviceTypeId` (single, required scalar FK on `CalibrationRequestItem`, line
1354). There is no collection anywhere on that path. `CalibrationRequestItem` itself is
one-row-per-DeviceType (the Excel importer explicitly keeps "one row per spreadsheet line" and
does not merge types; manual entry is one row per device).

Therefore `qty: 3` on a `WorkOrderItem` means **"3 physical units of the one DeviceType this line
resolves to"** — never a mix. Fan-out is a simple `create N jobs per WorkOrderItem` loop. It
does **not** need to branch per DeviceType.

Edge case worth noting: if `quotationItem.requestItem` is NULL (data gap), the DeviceType is
unknown for that line. That does not change the count (still `qty` jobs) but it means
`customerDeclaredDeviceName` and the DeviceType association for those jobs cannot be populated —
see Step 4.

---

## Step 3 — Trigger Point

### 3.1 Findings on `start()` and the transition machine

`WorkOrdersService.start()` (`work-orders.service.ts:473-508`):

1. Loads the WO, calls `assertTransition(existing.status, "IN_PROGRESS")` — the transition table
   (`ALLOWED_TRANSITIONS`, line 36) permits `IN_PROGRESS` **only from `ASSIGNED`**.
2. Guard: WO must have ≥1 assignment (`assignments.length === 0` → throw).
3. Guard (ON_SITE only): `equipmentConfirmedAt` must be set when there is equipment to confirm.
4. `prisma.workOrder.update({ data: { status: "IN_PROGRESS" } })` — **note this is a bare
   `update`, NOT wrapped in `$transaction`.** (Other mutations in this file — `create`,
   `assign`, equipment ops — do use `$transaction`.)

Lifecycle: `PLANNED → ASSIGNED → IN_PROGRESS → DONE` (plus `→ CANCELLED` from any non-terminal).

**Is `IN_PROGRESS` the right / only trigger?**

- It is a **valid** trigger. All fan-out inputs are available and frozen by then.
- It is **not the only** natural one. Everything fan-out needs (`WorkOrderItem.qty`, the walk to
  `DeviceType` and `CalibrationRequestItem`, `customerDeviceName`) is fixed at **WorkOrder
  creation** (`work-orders.service.ts:251-277`), which already runs inside a `$transaction`.
  Creating jobs there would be transactionally clean and would mean "a WorkOrder always has its
  job skeleton."
- A middle option — WO **assignment** (`assign()`, which sets `ASSIGNED` and already uses a
  `$transaction`, line ~452) — has no particular advantage over the other two.

**Recommendation (recommendation, not decision):** For MVP, fan out in **`start()`**, but first
**wrap `start()`'s mutation in a `$transaction`** (it currently is not) and create the jobs in
that same transaction, immediately after the `status` update, guarded per §3.2. Rationale:
avoids creating job rows for WorkOrders that are cancelled while still `PLANNED`/`ASSIGNED`; keeps
`PENDING` `CalibrationJob` rows meaningful ("work has actually started"); single obvious seam.
If the product wants jobs visible for pre-visit AKD/AKL manager review (the new
`akdAklApprovalStatus` gate on `CalibrationJob`), move fan-out into the **WO-creation**
transaction instead — that is also fully correct and needs no new transaction wrapper.

Either way: **do not** rely on the transition table alone as the idempotency mechanism (see §3.2).

### 3.2 Idempotency risk & the guard pattern to reuse

**Risk:** `@@unique([workOrderId, deviceId])` on `CalibrationJob` (schema line 1811) does **not**
protect against double fan-out, because every freshly-created job has `deviceId = NULL` and
Postgres treats NULLs as distinct (the schema comment at lines 1760-1763 says this explicitly).
So if `start()` (or the creation handler) ever runs twice for the same WO, you get `2 × N`
duplicate jobs with no constraint violation.

The `PLANNED→ASSIGNED→IN_PROGRESS` table makes a *second* `start()` call throw
(`assertTransition(IN_PROGRESS, IN_PROGRESS)` is not allowed), which is *partial* protection — but
it is fragile: it breaks if fan-out is ever moved to WO-creation, if a retry/re-entrancy path is
added, or if a future status like `ON_HOLD → IN_PROGRESS` is introduced.

**Existing guard patterns in this codebase to reuse (in order of preference):**

1. **"Already done → return existing, no-op"** — `delivery-notes.service.ts:60-73`
   (`if (workOrder.deliveryNote) { … return workOrder.deliveryNote; }`) and its `P2002`
   race-catch at lines 128-142. This is the cleanest model: at fan-out, check
   `SELECT count(*) FROM CalibrationJob WHERE workOrderId = ?` (or
   `workOrder.jobs.length`); if `> 0`, skip creation entirely.
2. **"Pre-check for an active sibling, plus catch `P2002` on the race"** —
   `work-orders.service.ts:221-235` + `312-318` (`existingActive` check for duplicate active WO)
   and `purchase-orders.service.ts:115-129`.
3. **Document-number allocation** (`DocumentNumberService.allocate`, used at
   `work-orders.service.ts:244`) is sequence-based and always inside the caller's `tx` — not a
   fan-out guard itself, but the same "do it once inside the transaction" discipline applies.

**Recommended concrete guard:** perform fan-out inside a `$transaction`; as the first step read
the existing job count for the WorkOrder; if non-zero, return without creating. Optionally also
add a partial unique index (SQL, since Prisma can't model it) on `CalibrationJob(workOrderId,
purchaseOrderItemId)` **only where `deviceId IS NULL`** to make double-fan-out fail hard at the
DB — but confirm first whether multiple NULL-device jobs per `(workOrder, poItem)` are legitimate
before the technician matches devices (they are: `qty` > 1 produces exactly that). So a partial
index would need to include a per-unit ordinal column that does not exist yet — **flag as a
schema question**, don't assume.

---

## Step 4 — CalibrationRequestItem Linkage Feasibility

**Question:** at the moment fan-out runs, can `CalibrationJob.calibrationRequestItemId` and
`CalibrationJob.customerDeclaredDeviceName` be reliably populated from a `WorkOrderItem`?

**Answer: Yes, via the existing walk, with one nullable link to handle defensively.**

Path (all already loaded by `workOrderInclude`, `work-orders.service.ts:50-65`):

```
WorkOrderItem
  .purchaseOrderItem            (required, 1:1)   schema:1626, 1632
  .quotationItem                (required, 1:1)   schema:1552, 1565
  .requestItem                  (OPTIONAL, 1:1)   schema:1490, 1505   ◄── the only weak link
  → .id                     → CalibrationJob.calibrationRequestItemId
  → .customerDeviceName     → CalibrationJob.customerDeclaredDeviceName   schema:1358 (also nullable)
  → .deviceTypeId           → (DeviceType association for the job, if the design adds one)
  → .akdAkl / .akdAklDeclaration → available for the new AKD/AKL gate if wanted at creation
```

Evidence the walk is real and used:

- `workOrderInclude` eager-loads `items.purchaseOrderItem.quotationItem.requestItem.deviceType`
  today (`work-orders.service.ts:57`).
- The WorkOrder PDF builder walks the identical chain in production
  (`work-order-pdf.test.ts:79`, `work-order-pdf-shared.ts:112-113`:
  `purchaseOrderItem.quotationItem.requestItem.deviceType`).
- The equipment-proposal derivation (`WorkOrderEquipment` schema comment lines 1656-1658) states
  the same path: *"item -> purchaseOrderItem -> quotationItem -> requestItem -> deviceType"*.

**The one gap:** `QuotationItem.requestItemId` is a nullable column with an optional relation.
Server-generated quotations always populate it (`quotations.service.ts:341`); the manual full-
scope PATCH path types each item's `requestItemId` as a required `string`
(`quotations.service.ts:243`) and `assertFullScopeItems` rejects any item whose `requestItemId`
is not a known requisition line. So **for any quotation produced by the current codebase the link
is present**. But:

- Legacy / imported / manually-SQL'd quotation rows *could* have `requestItemId = NULL`.
- Nothing at the DB level guarantees it.

**Implication for fan-out:** treat the walk as "best effort":
- If `requestItem` resolves → set `calibrationRequestItemId` and snapshot `customerDeviceName`
  into `customerDeclaredDeviceName` (may itself be NULL — that is a valid state per schema
  comment 1357).
- If `requestItem` is NULL → create the job anyway with `calibrationRequestItemId = NULL` and
  `customerDeclaredDeviceName = NULL`. This is exactly the "normal pending / not-always-captured"
  state the nullable fields were designed for — **not** a fan-out failure.

**This is not a blocking gap.** The fields the migration added *do* close the traceability gap
for all data the application itself creates. The residual risk is purely historical/manual data,
and it degrades gracefully to NULL rather than breaking fan-out.

---

## Open Questions for User Confirmation Before Implementation

1. **Trigger point (business call):** Fan out at `WorkOrder → IN_PROGRESS` (`start()`), or at
   **WorkOrder creation**? Both are technically correct. Choose IN_PROGRESS to avoid job rows on
   WOs cancelled before work starts; choose creation if the AKD/AKL manager-approval gate on
   `CalibrationJob` needs to happen *before* the technician visit.

2. **DRAFT-quotation qty edits win over requisition qty — confirm.** The design assumes the
   contracted quantity (quotation → PO → WorkOrderItem) is authoritative and
   `CalibrationRequestItem.qty` is just the customer's initial ask. Confirm this is the intended
   business rule (it matches BR-03 "copy verbatim" + the DRAFT-edit affordance).

3. **Non-integer `WorkOrderItem.qty`:** the column is `Decimal(18,4)`. Should fan-out (a)
   assert `qty` is a positive integer and hard-fail otherwise, or (b) silently floor/round?
   Recommend (a). Also confirm whether the quotation DRAFT-edit DTO validator already forbids
   fractional `qty` (not verified in this pass).

4. **Per-unit identity for the N jobs:** when `qty = 3`, the 3 jobs are initially identical
   (`deviceId = NULL`, same `purchaseOrderItemId`, same declared name). Is that acceptable, or
   should each carry a 1-of-3 ordinal / label so the technician UI can distinguish them before
   device matching? This also determines whether a DB-level partial unique index can be added to
   harden idempotency (see §3.2) — without an ordinal column, `(workOrderId, purchaseOrderItemId,
   deviceId IS NULL)` is intentionally non-unique.

5. **Idempotency mechanism:** confirm the approach — `$transaction` + "existing job count > 0 ⇒
   skip" (mirroring `delivery-notes.service.ts`). And confirm that `start()` may be refactored to
   wrap its status mutation in a `$transaction` (it currently is a bare `update` at
   `work-orders.service.ts:503`).

6. **SEND_TO_LAB vs ON_SITE:** fan-out logic appears identical for both service modes (quantity
   chain is mode-independent; only `WorkOrderEquipment`/delivery-note differ). Confirm there is no
   mode-specific job difference expected at creation time.

7. **`CalibrationRequestItem.akdAkl` snapshot at creation:** the new job fields
   `technicianObservedAkdAkl` / `akdAklApprovalStatus` are for on-site capture, but should
   fan-out also snapshot the *customer-declared* `requestItem.akdAkl` onto the job (there is no
   field for it today — `customerDeclaredDeviceName` exists but no `customerDeclaredAkdAkl`)? If
   yes, that is an additional schema field, out of scope here but worth flagging now.

---

## Confirmation

No schema, code, migration, or documentation files were modified during this investigation. No
migrations were run. No fan-out logic was implemented. The only file written is this report at
`docs/claude/plans/Calibration-management/investigation-calibrationjob-fanout-design.md`. This
was analysis only.
