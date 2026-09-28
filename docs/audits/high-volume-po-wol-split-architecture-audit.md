# High-Volume PO → WOL/SPK Split — Current-Architecture Audit

**Status:** Audit only. No schema, service, UI, or seed changes were made.
**Trigger:** Minto Hardjo 406-device UX trial; question is whether the architecture can scale to multi-hospital workloads (~1,000–4,500+ devices) operated by ~4 people, without splitting the commercial PO.
**Scope of this document:** Sections A–R as requested. Every load-bearing claim is tagged:

- **CONFIRMED FROM CODE** — verified by reading the actual schema/service/migration/UI source.
- **INFERRED FROM CURRENT ARCHITECTURE** — a reasonable conclusion from the confirmed facts, not itself directly stated in code.
- **REQUIRES DOMAIN DECISION** — the code is silent/ambiguous and a business call is needed.

---

## A. Executive Summary

**CONFIRMED FROM CODE:** The current architecture enforces, at three independent layers (Postgres partial unique index, service-layer transaction guard, and Portal UI), that **one PurchaseOrder can have at most one non-cancelled WorkOrder ("active WorkOrder") at a time.** This is not a leftover assumption — it is a deliberately engineered MVP invariant, documented in the migration and in `schema.prisma` comments as "Cardinality: 1 PurchaseOrder → 1 active WorkOrder."

**CONFIRMED FROM CODE:** WorkOrder creation copies **every** non-cancelled `PurchaseOrderItem` into a `WorkOrderItem` **at its full PO quantity**, in one call (`work-orders.service.ts:312-320`). There is no partial-quantity allocation path anywhere in the codebase. `CalibrationJob` fan-out (`fanOutCalibrationJobs`) then expands each `WorkOrderItem.qty` into that many jobs, **all under the one WorkOrder**. There is no layer between "PO item" and "100% of its quantity, in this one WorkOrder" today.

**CONFIRMED FROM CODE:** Technician assignment is WorkOrder-scoped only (`WorkOrderAssignment`), and a technician's job list is filtered by `workOrder.assignments.some({technicianUserId})` (`calibration-jobs.service.ts:751`) — i.e. **assigning a technician to a WorkOrder gives them all of that WorkOrder's jobs**, whether that's 6 or 4,000. There is no per-`CalibrationJob` assignment, no workload/capacity model, and no technician-qualification model anywhere in the schema.

**CONFIRMED FROM CODE:** "DLN" in this codebase (`EquipmentDeliveryNote`, aka "Surat Jalan Alat") is **not** a document that follows completed calibration jobs back to the customer. It is a **1:1-per-WorkOrder, ON_SITE-only** document for outbound *reference/PKM equipment* the technician carries to the customer site. The artifact that actually represents "calibration is done, return it to the customer" is `Certificate`, which is 1:1 per `CalibrationJob` with no grouping/batching concept at all. **The desired "PO → WOL split → DLN follows the split" model described in the prompt does not correspond to any existing entity.**

**CONFIRMED FROM CODE:** `WorkOrder.done()` requires **every** CalibrationJob on the WorkOrder to be `ACCEPTED_BY_QA` before the WorkOrder can close (`work-orders.service.ts:1103-1126`). There is no partial/percentage completion status. A 406-job WorkOrder is "IN_PROGRESS" until job #406 is accepted, identically to a 4-job WorkOrder.

**CONFIRMED FROM CODE — genuine scalability defect, independent of the splitting question:** `workOrderInclude` (the include object used by nearly every WorkOrder read, **including the paginated `GET /work-orders` list**) eagerly loads the *entire, unbounded* `jobs` array for every WorkOrder row (`work-orders.service.ts:73-86`, used at line 402 for `findAll`). At 406 jobs this is tolerable; at 1,000–4,000 jobs in a single WorkOrder (which "1 PO = 1 WO" forces), the WorkOrder list page alone would pull tens of thousands of job+identity-correction rows into memory. Separately, `ensureKontrolAlatRows` allocates a document number and creates a `KontrolAlat` row **one job at a time, in a loop, inside the `start()` transaction** (`work-orders.service.ts:681-708`) — for a 4,000-unit SEND_TO_LAB WorkOrder, `start()` would issue ~8,000+ sequential DB round-trips inside one Postgres transaction.

**Net answer to the primary audit question:** No. The current architecture cannot represent "1 PO → multiple WOL/SPKs → different technician allocations → DLN follows" today. The blocking points are concrete, identified, and are a mix of DB constraint + service invariant + UI + missing domain concepts (allocation layer, per-job assignment, capacity model, completion-document-that-follows-a-split). None of it is accidental — it reads as a deliberately scoped MVP that intentionally deferred exactly this multi-WorkOrder capability. See Section K/N for the gap analysis and target-architecture comparison.

---

## B. Current Domain Model

### PO (`PurchaseOrder`, `schema.prisma:1811-1850`)
- Belongs to one `Quotation` (`quotationId`, required) and one `Customer`.
- `status: PurchaseOrderStatus` = `DRAFT | APPROVED | RECEIVED | CONFIRMED | FULFILLED | CANCELLED`.
- **CONFIRMED FROM CODE:** the service layer (`purchase-orders.service.ts`) only ever writes `DRAFT`, `APPROVED`, and `CANCELLED` (grep of all `status:` assignments, lines 224/397/431). `RECEIVED`, `CONFIRMED`, `FULFILLED` are declared enum values that are **never assigned** by any service method today — they are reserved/future values, not a working sub-lifecycle. `confirmedAt` is set at `approve()` time (line 398), which is a naming quirk worth flagging but out of scope here.
- Has many `PurchaseOrderItem` and many `WorkOrder` (schema allows the 1:N relation; it's the *service/DB* layer that restricts it to 1 active).

### PurchaseOrderItem (`schema.prisma:1852-1879`)
- `qty: Decimal(18,4)`, immutable/unmodified after creation from the Quotation line.
- `status: PurchaseOrderItemStatus` = `OPEN | ALLOCATED | FULFILLED | CANCELLED`.
- **CONFIRMED FROM CODE:** only `OPEN` (creation, `purchase-orders.service.ts:248/592`) and `CANCELLED` (revision retirement, `:573`) are ever written. **`ALLOCATED` and `FULFILLED` are dormant enum values — the schema already anticipated a concept of "this line item's allocation status" but nothing in the codebase ever transitions into it.** This is a strong signal that a per-item allocation concept was *designed for* but never *implemented*.
- `workOrderId: String?` — **CONFIRMED FROM CODE / vestigial:** the schema comment on `WorkOrder.purchaseOrderItems` explicitly calls this "Legacy allocation pointer on PurchaseOrderItem. Unused by WorkOrder MVP." A repo-wide grep confirms no service ever reads or writes `PurchaseOrderItem.workOrderId`. The *real* link from PO item to WorkOrder is the `WorkOrderItem` join row, not this field.

### WorkOrder / WOL / SPK (`schema.prisma:1881-1943`)
- `purchaseOrderId: String` (required, `onDelete: Restrict`) — every WorkOrder belongs to exactly one PO.
- `serviceMode` (`ON_SITE` → SPK document series, `SEND_TO_LAB` → WOL series) is copied from the originating `CalibrationRequest`, not chosen independently per WorkOrder.
- `status: WorkOrderStatus` = `PLANNED | ASSIGNED | IN_PROGRESS | TECHNICALLY_DONE(legacy) | CLOSED(legacy) | CANCELLED | DONE`.
- Holds `WorkOrderItem[]`, `WorkOrderAssignment[]` (technicians), `CalibrationJob[]`, `WorkOrderEquipment[]` (ON_SITE reference gear), and **exactly one** `EquipmentDeliveryNote?` (`deliveryNote`, unique FK).
- **CONFIRMED FROM CODE, decisive:** `schema.prisma:1932-1933` — *"Partial unique index `WorkOrder_purchaseOrderId_active_key` (status <> CANCELLED) is created in SQL. Prisma cannot model it; do not add `@@unique([purchaseOrderId])`."* This is the schema author explicitly documenting the 1-active-WorkOrder-per-PO rule as an intentional DB constraint that Prisma's DSL can't express directly.

### WorkOrderItem (`schema.prisma:1945-1963`)
- "Operational snapshot of a PurchaseOrderItem. MVP copies every PO item 1:1." Comment states explicitly: *"Quantity and source identity are immutable after create."*
- `@@unique([workOrderId, purchaseOrderItemId])` — a PO item can appear at most once **within a given WorkOrder**. Combined with the 1-active-WorkOrder-per-PO constraint, this means, transitively, **a PurchaseOrderItem can be represented in at most one active WorkOrderItem, at its full quantity, at any time.**

### CalibrationJob (`schema.prisma:2320-2437`)
- `workOrderId: String` (required, `onDelete: Cascade`) — every job belongs to exactly one WorkOrder, permanently. No "move job to another WorkOrder" API exists.
- `unitOrdinal` / `unitTotal` — 1-based position within the N jobs fanned out from one `WorkOrderItem.qty`. Assigned once at fan-out, "never edited afterwards" (comment, line 2344-2348).
- `@@unique([workOrderId, purchaseOrderItemId, unitOrdinal])` — the fan-out identity key is scoped to a single WorkOrder.
- Jobs are created **only** by `fanOutCalibrationJobs`, triggered by `WorkOrder.start()` (`PLANNED/ASSIGNED → IN_PROGRESS`). No lazy/incremental fan-out; it is all-N-jobs-at-once.

### Technician assignment (`WorkOrderAssignment`, `schema.prisma:2206-2219`)
- `(workOrderId, technicianUserId)` unique pair, `roleOnJob: LEAD | ASSIST`.
- Many-to-many at the **WorkOrder** level (multiple technicians can be assigned to one WorkOrder; one technician can be assigned to many different WorkOrders — but only by virtue of those being *different* WorkOrders, which today means different POs, since 1 PO ⇒ 1 active WorkOrder).
- No `CalibrationJob.technicianUserId` or equivalent. No skill/capability/qualification join between `User` and `DeviceType`/`DeviceCapability`.

### DLN (`EquipmentDeliveryNote`, `schema.prisma:2255-2314`)
- `workOrderId: String @unique` — **exactly one per WorkOrder**, enforced at the DB level.
- Represents "Surat Jalan Alat": the PKM reference/calibration equipment being carried to an ON_SITE job. It is not related to CalibrationJob completion, certificates, or returning calibrated devices to the customer.
- `Certificate` (`schema.prisma:2984-3018`) is 1:1 per `CalibrationJob`, with a `supersedesCertificateId` self-relation for reissue — but **no batching/delivery-note concept exists for grouping certificates by WorkOrder, PO, or shipment.**

---

## C. Current PO → WOL/SPK Architecture

**CONFIRMED FROM CODE** (`work-orders.service.ts:221-364`, `WorkOrdersService.create`):

1. Loads the PO with its **non-cancelled** items (`items: { where: { status: { not: "CANCELLED" } } }`, line 229) — "MOM #1 — Revision Scope Design: only active PO scope may ever propagate downstream."
2. Requires `purchaseOrder.status === "APPROVED"` (line 242) — WorkOrder creation is an **explicit, user-triggered action**, not automatic on PO approval.
3. **Explicitly queries for an existing active WorkOrder and throws `ConflictException("DUPLICATE_ACTIVE_WORK_ORDER")` if found** (lines 264-278) — this is the primary, intentional application-level guard.
4. Creates the WorkOrder, then `workOrderItem.createMany` copying **every** PO item at its **full `qty`** (lines 312-320) — no partial/quantity-split parameter exists in `WorkOrderCreateInput`.
5. Wraps the whole thing in a DB transaction and additionally catches `P2002` (the partial-unique-index violation) as a race-condition backstop (lines 355-362) — i.e. the DB constraint is a *safety net* behind the primary application check, not a decorative artifact.

**Answering the prompt's specific sub-questions, all CONFIRMED FROM CODE:**

| Question | Answer |
|---|---|
| Can one PO currently have multiple WorkOrders? | Only if all prior WorkOrders for that PO are `CANCELLED`. At most one **non-cancelled** WorkOrder exists at a time. |
| Is the restriction "one active" or "one ever"? | "One active" — `status <> 'CANCELLED'`. A cancelled WorkOrder frees the PO for a replacement. |
| Schema-level or app-level? | **Both.** Partial unique index (DB) + explicit transactional check (service) + UI hiding the create button once one exists (`purchase-orders/[id]/page.tsx:544-548`). |
| Does PO approval create/imply a WorkOrder? | No. `PurchaseOrder.approve()` never creates a WorkOrder. Creation is a distinct, manual `POST /work-orders` action from the Portal. |
| What is copied from PO into WorkOrder? | `customerId`, `quotationId`, `purchaseOrderId`, `serviceMode` (from the request), plus per-item `description`/`qty` snapshots into `WorkOrderItem`. |
| Are WorkOrderItems copies, references, or independent allocations? | **Copies** ("operational snapshot"), 1:1, at full PO-item quantity. Not independent allocations — there is no notion of a *partial* WorkOrderItem. |
| Can quantities be split across multiple WorkOrders? | **No.** The unique constraints (`WorkOrderItem_workOrderId_purchaseOrderItemId_key` + the active-WorkOrder-per-PO index) together prevent it. There is no service method that creates a WorkOrderItem with `qty < purchaseOrderItem.qty`. |
| Can individual units be allocated to different WorkOrders? | **No.** `CalibrationJob` rows (the true "unit" granularity) don't exist until `start()` fans them out from the single WorkOrderItem — by which point they're already all under one WorkOrder. |
| What happens to remaining/unallocated quantity? | N/A — there is no partial allocation, so there is no "remaining" concept. The PO item is either OPEN (not yet in a WorkOrder) or fully represented (100%) in the one active WorkOrder. |

**Worked example from the prompt (Syringe Pump, qty = 94):** Today the *only* representable state is: PurchaseOrderItem qty=94 → one WorkOrderItem qty=94 → 94 CalibrationJob rows under one WorkOrder. The architecture **cannot** currently represent 30/25/39 split across three WorkOrders — there is no schema field, service method, or migration path that partitions a PurchaseOrderItem's quantity.

---

## D. Current Technician Allocation Architecture

**CONFIRMED FROM CODE:**

- Assignment happens via `WorkOrdersService.assign()` (`work-orders.service.ts:463-514`): validates active company members, then `workOrderAssignment.createMany` and transitions the WorkOrder `PLANNED → ASSIGNED`. Multiple technicians *can* be assigned to one WorkOrder (array input, `roleOnJob: LEAD | ASSIST`), but assignment is **all-or-nothing at the WorkOrder level** — there's no way to say "Technician A gets units 1–120, Technician B gets 121–210" within one WorkOrder.
- A technician's own job queue is derived purely from WorkOrder membership: `calibration-jobs.service.ts:751` — `workOrder: { assignments: { some: { technicianUserId: userId } } }`. **Assign someone to a WorkOrder and they see 100% of its fanned-out jobs**, with no per-job ownership filter.
- **No workload/capacity data exists anywhere:** repo-wide search for capacity/workload/availability/estimatedDuration/priority/dueDate/SLA/complexity across `schema.prisma` returns nothing relevant to technicians or jobs (the one `capacity` field found, `KontrolAlat.capacity`, is a *device* spec field — "Kapasitas" — unrelated to technician workload).
- **No technician qualification/capability matching exists:** `User` has no relation to `DeviceType`/`DeviceCapability`. `DeviceTypeEquipmentRequirement` (`schema.prisma:1289-1312`) models which *reference equipment* a device type needs — it has nothing to do with which technician is qualified to perform the calibration.
- **Can the system represent "Technician A → 120 jobs, B → 90, C → 140, D → 56" from one 406-job PO?** **No**, not as separate, independently-progressing allocations. The only way to get multiple technicians touching disjoint job subsets today is either (a) assign multiple technicians to the single WorkOrder as LEAD/ASSIST with no job-level partition (everyone sees everything, no enforced split), or (b) have 406 separate single-device POs (absurd), or (c) manually agree out-of-band who does which unit while the system itself does not track or gate the split.

---

## E. Current DLN Architecture

**CONFIRMED FROM CODE (`delivery-notes.service.ts`, `schema.prisma:2255-2314`):**

- Entity: `EquipmentDeliveryNote`. Belongs to `WorkOrder` via a **unique** `workOrderId` FK — literally cannot have more than one per WorkOrder at the DB level.
- Content: a snapshot of `WorkOrderEquipment` (the *reference/PKM equipment being brought to site*), customer name/address, and the WorkOrder's own number. It has **no relation to `CalibrationJob`, `PurchaseOrderItem`, or `Certificate`.**
- Applicability gate: `serviceMode === "ON_SITE"` only, and only after `equipmentConfirmedAt` is set and `equipment.length > 0` (lines 74-91). **SEND_TO_LAB WorkOrders can never have a DLN** — confirmed both by the service guard and by the WorkOrderEquipment/DLN doc comments ("SEND_TO_LAB WorkOrders never have rows here").
- Issuance is idempotent (reuses the existing note on retry) and immutable once created ("later edits to WorkOrderEquipment ... never change an issued delivery note").

**Directly answering the prompt's DLN questions:**

| Question | Answer (CONFIRMED FROM CODE) |
|---|---|
| What entity does DLN belong to? | `WorkOrder` (1:1, unique FK). |
| Is DLN tied to PO / WorkOrderItem / CalibrationJob / Customer / shipment grouping? | Only to `WorkOrder`; transitively to `Customer` (snapshotted fields), never to `PurchaseOrder`, `WorkOrderItem`, or `CalibrationJob` directly. |
| Can one PO produce multiple DLNs? | Only indirectly, and only if the PO somehow had multiple WorkOrders over time (sequential, via cancel+recreate) — never concurrently, and never today in the "split workload" sense. |
| Can one WOL produce one DLN? | Yes — this is the only supported cardinality, and only for ON_SITE. |
| Can multiple WOLs feed one DLN? | No — the unique `workOrderId` makes this structurally impossible. |
| Can one WOL produce multiple DLNs? | No — same reason. |
| Does DLN inherit technician/workload info? | No. It carries no technician reference at all. |
| What happens to DLN if WOLs are split? | N/A today — WOLs cannot be split, so this has never been exercised. |
| Are there current assumptions of 1 PO = 1 WOL = 1 DLN? | **Yes, and it is stronger than an assumption — it's an enforced invariant for PO↔WorkOrder, and a hard unique constraint for WorkOrder↔DLN.** But note this DLN is the *equipment-going-out* document, not a *calibration-results-coming-back* document. |

**Critical finding, REQUIRES DOMAIN DECISION:** The prompt's desired conceptual model — "DLN is a downstream artifact that should follow the appropriate execution allocation" of *completed calibration work* — does not map onto `EquipmentDeliveryNote` at all. That entity is about equipment leaving the lab, issued once per WorkOrder *before or during* work, not a document tied to job completion. If the business intends a delivery/handover document for *finished, calibrated units and their certificates* going back to the customer, **that entity does not exist yet** — it would be new domain modeling, not a generalization of `EquipmentDeliveryNote`. This distinction should be surfaced to the business before any WOL-split design proceeds, since "DLN follows the split" may currently be conflating two different real-world documents (equipment-out vs. results-back).

---

## F. Current Status / Aggregation Architecture

**CONFIRMED FROM CODE:**

- **Management dashboard** (`dashboard.service.ts`): company-wide (optionally customer-filtered) **counts only** — `activeWorkOrders` (status in PLANNED/ASSIGNED/IN_PROGRESS), `jobsAwaitingAction` (status in PENDING/IN_PROGRESS/SUBMITTED/REWORK), `quotationsPendingApproval`, plus time-bucketed series for confirmed POs / job volume / QA-approved certificates. **There is no per-PO or per-WorkOrder progress rollup, no "% complete," and no distinction between "unallocated / allocated / in-progress / completed / blocked / cancelled" quantities anywhere in this service.**
- **WorkOrder status** is a flat, all-or-nothing state machine (`PLANNED → ASSIGNED → IN_PROGRESS → DONE`, or `CANCELLED`). `done()` (`work-orders.service.ts:1103-1126`) hard-requires **every** job on the WorkOrder to be `ACCEPTED_BY_QA`; there is no partial-completion percentage stored or exposed.
- **PO status** never reaches `FULFILLED` from code today (Section B) — so there is currently no automatic "PO progress" derived from its WorkOrder(s)' completion at all; `PurchaseOrderStatus` effectively terminates at `APPROVED`/`CANCELLED` in the implemented lifecycle.
- **Calibration Jobs Portal page** (recently built, per `use-calibration-jobs-query.ts` / `calibration-jobs.service.ts:837-907`) *does* have real per-WorkOrder aggregation: `findAllGroupedByWorkOrder` groups jobs by WorkOrder and computes `statusCounts`/`actionNeededCount` **per WorkOrder**, and a separate `getWorkOrderItemSummaries` endpoint computes a per-PO-line-item rollup **scoped to one WorkOrder's own job count** ("never capped ... bounded by one Work Order's own job count, never company-wide" — doc comment, line 1076-1081). This is good, WorkOrder-scoped engineering, but it stops at the WorkOrder boundary — **there is no equivalent PO-level rollup across multiple WorkOrders**, because multiple WorkOrders per PO don't exist to roll up in the first place.

**Answering directly:** if one PO had 4 WOL/SPKs in different states today (hypothetically), **the current aggregation code has no mechanism to combine them** — `activeWorkOrders` would just count 4 separate rows, `jobsAwaitingAction` would sum naturally (it's already company-wide), but nothing computes "this PO is 62% done" or exposes unallocated-vs-allocated-vs-completed quantities at the PO level. This would need to be built new, not adapted from an existing rollup.

---

## G. Current High-Volume Behavior — 406 / 1,000 / 2,000 / 4,000+

This section evaluates the *query and transaction architecture*, independent of the splitting question — these are real, code-verified risks that a WOL-split design should account for (and which a split would, as a side effect, mitigate).

1. **CONFIRMED FROM CODE — WorkOrder list/detail over-fetch.** `workOrderInclude` (`work-orders.service.ts:53-134`) is used for `findAll` (the **paginated WorkOrder list**, line 402), `findOne`, `start`, `assign`, `done`, `cancel`, `revise`, equipment endpoints — essentially every WorkOrder read. It includes `jobs: { select: {...with identityCorrections...}, orderBy }` **with no `take`/limit**. At 406 jobs this is a few hundred extra rows per WorkOrder fetched; at 1,000–4,000 jobs **in a single WorkOrder** (which is exactly what "1 PO = 1 WO" forces at hospital scale), a WorkOrder **list page** (e.g. 20 WorkOrders/page) could pull tens of thousands of job rows just to render summary cards. This is a genuine, pre-existing scalability defect that gets *worse*, not better, the larger a single WorkOrder is allowed to grow — which is the direct consequence of not being able to split.
2. **CONFIRMED FROM CODE — unbatched per-job writes inside one transaction.** `ensureKontrolAlatRows` (`work-orders.service.ts:655-709`), called from `start()` inside its DB transaction, loops over every SEND_TO_LAB job **one at a time**, calling `DocumentNumberService.allocate` (a raw `INSERT ... RETURNING` against a single shared sequence row per company/type/year, `document-number.service.ts:44-70`) and `kontrolAlat.create` **sequentially, per job**. For a 4,000-unit WorkOrder this is ~8,000+ sequential awaited round-trips inside **one Postgres transaction**, holding whatever locks that implies for the duration. `fanOutCalibrationJobs` itself is properly batched (`createMany`, line 644) — it's specifically the KontrolAlat step that isn't.
3. **CONFIRMED FROM CODE — job listing/grouping is already scale-aware, but WorkOrder-bounded.** `findAllGroupedByWorkOrder` and `getWorkOrderItemSummaries` (Section F) were explicitly built to avoid the old capped/flat approach and are described as safe "even at hundreds of units" because they're **bounded by one WorkOrder's own job count, never company-wide.** This is good practice already present in the codebase — but it is an argument *for* keeping individual WorkOrders small (i.e., for splitting), not evidence that a single 4,000-job WorkOrder would perform well.
4. **INFERRED:** Because `CalibrationJob`, `MeasurementResult`, `PhysicalCheckResult`, `KontrolAlat`, etc. are all keyed off `workOrderId`/`calibrationJobId` with proper indexes (`@@index([companyId, status])`, `@@index([workOrderId])` etc. throughout), the underlying data model itself scales fine to thousands of rows *per company* — the risk is specifically in code paths that fetch "all jobs of this WorkOrder" without a limit, not in the schema's indexing.
5. **CONFIRMED FROM CODE:** pagination exists and is used correctly for the **flat** calibration-jobs list (`findAll`, page/pageSize) and for the WorkOrder-grouped list (paginates WorkOrders, not jobs) — the gaps are specifically the two items above (#1 and #2).

**Bottom line for G:** 406 jobs in one WorkOrder is already close to where these unbounded includes start to matter cosmetically; 1,000+ would be noticeably slower; 4,000+ in one WorkOrder is likely to produce slow WorkOrder-list responses and a `start()` call that takes a long time / risks transaction timeout. Splitting into multiple smaller WorkOrders is not just an operational nicety here — it is also the natural mitigation for a pre-existing technical scaling limit, because it bounds `jobs.length` per WorkOrder back down to a manageable size.

---

## H. Exact Architectural Constraints

| # | Constraint | Code location | DB constraint | Service/API invariant | UI limitation | Impact |
|---|---|---|---|---|---|---|
| 1 | One active WorkOrder per PO | `schema.prisma:1932-1933`; migration `20260827210000_work_order_mvp/migration.sql:40-43`; `work-orders.service.ts:264-278,355-362` | `CREATE UNIQUE INDEX "WorkOrder_purchaseOrderId_active_key" ON "WorkOrder"("purchaseOrderId") WHERE status <> 'CANCELLED'` | `create()` explicitly checks and throws `ConflictException("DUPLICATE_ACTIVE_WORK_ORDER")`; P2002 caught as race backstop | PO detail page shows a single "Create Work Order" button that disappears once `activeWorkOrder` exists (`purchase-orders/[id]/page.tsx:544-590`) | **This is the primary blocker for the entire requested feature.** |
| 2 | WorkOrderItem = full PO-item quantity, immutable | `schema.prisma:1945-1963` (doc comment); `work-orders.service.ts:312-320` | `@@unique([workOrderId, purchaseOrderItemId])` | `create()` has no partial-qty parameter; no service method mutates `WorkOrderItem.qty` | No UI for choosing a sub-quantity when creating a WorkOrder | Quantity cannot be split across WorkOrders even if #1 were lifted, without new allocation modeling. |
| 3 | CalibrationJob permanently owned by one WorkOrder | `schema.prisma:2323,2407,2429-2430` | `workOrderId` required FK, `onDelete: Cascade`; `@@unique([workOrderId, purchaseOrderItemId, unitOrdinal])` | No `moveToWorkOrder`/reassign-job API exists anywhere in `calibration-jobs.service.ts` | — | Jobs can't be rebalanced across WorkOrders after fan-out, even manually. |
| 4 | Fan-out is all-N-at-once, only at `start()` | `work-orders.service.ts:599-648` | — | `fanOutCalibrationJobs` is idempotent per-WorkOrder (checks `count > 0` and returns) — it's designed to run exactly once | — | No incremental/staged fan-out; can't "activate" a subset of units first. |
| 5 | Technician assignment is WorkOrder-level, not job-level | `schema.prisma:2206-2219`; `work-orders.service.ts:463-514`; `calibration-jobs.service.ts:751` | `@@unique([workOrderId, technicianUserId])` | `assign()` takes an array but no per-job mapping; job visibility query is WorkOrder-membership only | Portal/tech-pwa job lists are scoped by WorkOrder assignment, not by job | Can't split one WorkOrder's jobs across technicians in a tracked way. |
| 6 | DLN is 1:1 per WorkOrder, ON_SITE-only, equipment-out only | `schema.prisma:2272-2295`; `delivery-notes.service.ts:60-91` | `workOrderId String @unique` | `issue()` requires `serviceMode === ON_SITE`, `equipmentConfirmedAt` set, `equipment.length > 0` | — | DLN cannot "follow" a WOL split today, and conceptually isn't the completed-goods document anyway (Section E). |
| 7 | WorkOrder completion is all-or-nothing | `work-orders.service.ts:1103-1126` | — | `done()` throws unless **every** job is `ACCEPTED_BY_QA` | — | No partial completion signal; a huge WorkOrder stays "IN_PROGRESS" until its last unit is QA-accepted. |
| 8 | `PurchaseOrderItem.workOrderId` and `ALLOCATED`/`FULFILLED` item statuses are dormant | `schema.prisma:1864,1930-1931,1857-1866` | Column/enum values exist | No service ever reads/writes them | — | The schema already anticipated an allocation concept that was never wired up — a real head start for Section N, not a blocker. |
| 9 | WorkOrder read/list over-fetches unbounded job arrays | `work-orders.service.ts:53-134,402` | — | `workOrderInclude.jobs` has no `take` | — | Scalability risk independent of splitting (Section G #1). |
| 10 | KontrolAlat creation is unbatched per job inside `start()`'s transaction | `work-orders.service.ts:655-709`; `document-number.service.ts:44-70` | Single-row sequence table per (companyId, documentType, year) | Sequential `await` per job, no `createMany`/batching | — | Large SEND_TO_LAB WorkOrders risk slow/locked `start()` transactions (Section G #2). |

---

## I. What Already Works

- The **PO → PurchaseOrderItem → WorkOrderItem → CalibrationJob** chain is clean, well-indexed, and idempotent at every step (fan-out guards against double-run, DLN issuance is idempotent, assignment validates active membership).
- **MOM #1's revision/history architecture** (append-only `*History` tables) already gives a solid, generalizable pattern for "snapshot before mutating" that any future allocation/split feature should reuse rather than reinvent.
- **Multiple technicians per WorkOrder** already works (`WorkOrderAssignment` is many-to-many with `LEAD`/`ASSIST` roles) — the primitive for "more than one person touches this workload" exists, just not partitioned.
- **A technician can already work multiple WorkOrders** simultaneously (no constraint prevents a `technicianUserId` from having assignments on many different WorkOrders) — so once WorkOrders can be split, technician-A-on-WOL-1 + technician-B-on-WOL-2 falls out naturally from existing code with no schema change.
- **Per-WorkOrder job aggregation is already scale-conscious** (`findAllGroupedByWorkOrder`, `getWorkOrderItemSummaries`) — this is a directly reusable pattern for a future "per-allocation" rollup, and it already proves the team knows how to avoid the unbounded-fetch trap when it matters.
- **Device-type-level equipment requirements** (`DeviceTypeEquipmentRequirement`) are already modeled and already drive a real recommendation flow (the ON_SITE equipment-to-bring proposal) — this is a working example of "system-derived default, human-confirmed" that an automatic-split recommendation could pattern-match.
- **Cancellation is a safety valve**: a WorkOrder can be cancelled and a replacement created for the same PO (the partial unique index explicitly excludes `CANCELLED`), so the *sequential* multi-WorkOrder case (redo, not parallel-split) already has a path today, just not the *concurrent* multi-WorkOrder case the prompt is asking about.

---

## J. What Cannot Work Today

- Splitting one PO's 406 devices across concurrent WOL/SPK #1–#4 for four different technicians — **blocked at the DB layer**, not just the app layer.
- Splitting a single `PurchaseOrderItem`'s quantity (e.g. 94 syringe pumps) across multiple WorkOrders — **no allocation entity exists**; `WorkOrderItem` is a 1:1, full-quantity snapshot.
- Moving a `CalibrationJob` from one WorkOrder to another after fan-out — **no API, and the unique-key/cascade design assumes permanence.**
- Assigning different technicians to different subsets of one WorkOrder's jobs, with the system enforcing/tracking who owns what — **no per-job assignment field exists.**
- Any automatic recommendation for how to split — **no algorithmic inputs exist beyond what's listed in Section L**; there's no workload, capacity, or technician-qualification data to compute against.
- A DLN (or equivalent) that "follows" a WOL split for completed goods — **the DLN entity that exists is structurally 1:1 with WorkOrder and semantically about a different real-world document (outbound equipment, not returned/certified devices).**
- A PO-level progress view ("62% of this PO is done, allocated across 3 crews") — **no aggregation query or status model computes this**; the closest thing (dashboard, WorkOrder-grouped jobs) both stop at counting, not cross-WorkOrder rollup, because cross-WorkOrder-per-PO doesn't exist yet.

---

## K. Gap Analysis for "1 PO → multiple WOL/SPKs → technician allocation → DLN follows"

| Capability needed | Current state | Gap |
|---|---|---|
| Multiple concurrent WorkOrders per PO | Blocked by partial unique index + app check | **Schema migration required** (drop/replace the partial unique index) + remove/relax the `create()` guard + rework the "Create Work Order" UI to a list/plan view instead of a single slot |
| Partial-quantity allocation of a PO item across WorkOrders | Not modeled (`WorkOrderItem` = full qty, 1:1) | **New allocation concept required** — either let `WorkOrderItem.qty` be a genuine sub-quantity (needs a "remaining balance" invariant + validation that allocations across all WorkOrders for that PO item never exceed its PO quantity) or introduce an explicit allocation/plan entity above WorkOrderItem |
| Per-job / per-technician workload partition within an allocation | Not modeled (WorkOrder-level assignment only) | Depends on the above — if allocation happens at WorkOrderItem-creation time (i.e., you already decide "WOL #2 gets 25 pumps" before fan-out), then existing WorkOrder-level assignment is *sufficient*, since each WOL is its own small WorkOrder. If finer-grained (job-level) splitting within one WOL is also wanted, that needs new modeling. **This is exactly the domain decision Section N compares.** |
| DLN/documents following the split | DLN = equipment-out, 1:1 WorkOrder | If DLN naturally splits with WorkOrder (which it structurally would, since it's already WorkOrder-scoped), **this "just works" once #1/#2 are solved** — *for the equipment-out document*. The *results-back* document the prompt seems to actually want does not exist and needs new domain modeling regardless of the split question. |
| PO-level status/progress rollup across its WorkOrders | Not modeled | **New aggregation logic required** — sum/derive PO progress from its (now multiple) WorkOrders' job status counts. |
| Automatic split recommendation | No workload/capacity/qualification data exists | Needs new data model *and* new algorithm — see Section L; explicitly out of scope for this audit to design. |

---

## L. Automatic Allocation Readiness

Classification per the prompt's checklist:

| Input | Classification | Evidence |
|---|---|---|
| Technician capability / qualification per device type | **C. Not represented** | No join between `User` and `DeviceType`/`DeviceCapability` anywhere in schema. |
| Device capability requirements | **A. Already available** | `DeviceCapability`/`DeviceCapabilityItem`/`DeviceCalibrationParameter` fully model per-device-type calibration parameters. |
| Calibration parameters | **A. Already available** | Same as above — `DeviceCalibrationParameter`, `CalibrationTestPoint`, `JobCalibrationTestPoint`. |
| Estimated calibration complexity/effort/duration | **C. Not represented** | No duration/effort/complexity field anywhere on `DeviceType`, `CalibrationJob`, or related models. |
| Service mode (ON_SITE / SEND_TO_LAB) | **A. Already available** | `WorkOrder.serviceMode`, sourced from `CalibrationRequest.serviceMode`. |
| Location | **A. Already available (ON_SITE only)** | `WorkOrder.addressText/geoLat/geoLng/locationNotes`. Not modeled at the per-device/job level, only per-WorkOrder. |
| Customer | **A. Already available** | `WorkOrder.customerId`, `PurchaseOrder.customerId`. |
| Priority | **C. Not represented** | No priority field anywhere in the commercial/operational chain. |
| Technician workload (current) | **C. Not represented** | No aggregate/derivable "how many open jobs does technician X have" query or field exists today (could be computed ad hoc from `WorkOrderAssignment` + job status, but nothing does so). |
| Technician availability (calendar/capacity) | **C. Not represented** | No availability/calendar model for `User`. |
| Job status | **A. Already available** | `CalibrationJobStatus`, well-indexed (`@@index([companyId, status])`). |
| Equipment/reference requirements | **A. Already available** | `DeviceTypeEquipmentRequirement`, plus the working `WorkOrderEquipment` proposal-and-confirm flow — this is the single best existing pattern to imitate for an automatic recommendation (derive a default, let a human confirm/adjust). |
| Historical workload | **C. Not represented** | No historical-assignment-volume query or table; could theoretically be derived from `WorkOrderAssignment` + timestamps, but nothing aggregates it today. |
| Due dates / SLA | **B. Available but insufficient** | `CalibrationRequestItem`/`Quotation`/`PurchaseOrder` carry various dates (`customerPoDate`, `validUntil`, etc.) but nothing that functions as a calibration due-date/SLA target. |
| Grouping constraints (e.g., keep a device family together) | **B. Available but insufficient** | `deviceTypeId`/`DeviceCategory` exist and could be used as a grouping key, but no constraint/preference field says "these should stay together." |

**Conclusion for L:** enough exists to group/recommend by *device type, service mode, location, and customer* (all "A"). Nothing exists yet for the *capacity-balancing* half of the problem (workload, availability, effort estimate, priority) — an automatic split algorithm today could only do "group by device type/location," not "balance ~100 jobs per technician."

---

## M. Manual Allocation Readiness

The smallest viable manual model the prompt describes — "Plan WOL/SPK → select subset of PO items/units → assign technician → create WOL/SPK" — maps onto the current architecture as follows:

- **Splitting by whole PO item** (e.g., "all 40 ECG monitors go to WOL #1, all 94 syringe pumps to WOL #2"): **Would work today with a modest change** — if the 1-active-WorkOrder-per-PO constraint were lifted and `create()` accepted a subset of PO item IDs instead of always taking all of them, whole-item-level splitting requires no new allocation-quantity concept, since each item still goes into exactly one WorkOrderItem at its full quantity.
- **Splitting quantity within an item** (30/25/39 of the same 94 pumps): **Requires new modeling** — `WorkOrderItem.qty` is not currently a partial-allocation field; validating "sum of allocations for this PO item across all its WorkOrders ≤ PO item qty" doesn't exist and would need new schema (either a running-balance check or an explicit allocation ledger).
- **Splitting individual units**: only meaningful *after* fan-out (units only exist as `CalibrationJob` rows once a WorkOrder starts) — today fan-out only happens inside one WorkOrder, so unit-level splitting is a strict superset of the quantity-splitting gap above; would need either allocation-before-fan-out (assign qty ranges, then fan out per-WorkOrder as today) or a job-move API (assign after fan-out, which conflicts with "jobs are permanent to their WorkOrder").
- **Assigning different technicians per split**: **Already works, for free**, once each split is its own WorkOrder — `WorkOrderAssignment` needs no changes.
- **Rebalancing before execution**: today `WorkOrder.revise()` already supports reconciling a WorkOrder's items against the PO's *current* active scope while `PLANNED/ASSIGNED` (before fan-out) — this is a directly relevant existing pattern (pull-based reconciliation, snapshot-to-history-first) that a "rebalance items across sibling WorkOrders before any of them starts" feature could extend, rather than invent from scratch.
- **Adding/removing jobs from a WOL**: not supported after `start()` (fan-out is final); before `start()`, `revise()` already adds/removes whole `WorkOrderItem`s as the PO's active scope changes — again, whole-item granularity only.
- **Preserving the original PO quantity**: trivial for whole-item splitting (no quantity math involved); requires new invariant/validation for within-item quantity splitting.

**Conclusion for M:** a manual, **whole-PO-item-per-WOL** allocation model is a comparatively small, well-precedented change (lift the 1-active-WorkOrder constraint, let `create()` take a PO-item subset, reuse `revise()`'s reconciliation pattern for edits before start). A manual **quantity-split-within-an-item** model is a materially larger change requiring a new allocation/balance concept. This distinction is the central design fork for Section N.

---

## N. Recommended Target Architecture (comparison of options, not a decision)

This is a recommendation for **comparison**, not an instruction to implement.

### Option 1 — Whole-PO-item allocation (lift the WorkOrder cardinality constraint only)
Replace "1 active WorkOrder per PO" with "N active WorkOrders per PO, each drawing a disjoint subset of *whole* PO items." No quantity-splitting within an item.
- *Pros:* Smallest change. Reuses `WorkOrderItem`'s existing "full-item snapshot, immutable" semantics unchanged — just relax the PO-level constraint and let `create()` accept a subset of item IDs (with a new "this item is already claimed by another active WorkOrder" check replacing today's PO-level check). `revise()`'s reconciliation pattern extends naturally. DLN, technician assignment, dashboards, and the WorkOrder-grouped job list all keep working per-WorkOrder unchanged.
- *Cons:* Doesn't solve the "94 syringe pumps across 3 crews" scenario — only solves "different device lines/departments to different crews." For a hospital with a few very-high-quantity line items, this alone may not achieve the ~100-jobs-per-technician balance the prompt wants.

### Option 2 — Quantity-level allocation (new allocation entity above WorkOrderItem)
Introduce an explicit allocation step ("Plan") that assigns a *quantity* of a PO item to a target WorkOrder, with a running-balance invariant (`sum(allocated) ≤ PurchaseOrderItem.qty`), before any WorkOrderItem/CalibrationJob exists. `WorkOrderItem.qty` becomes "the allocated amount," not "the PO item's full amount."
- *Pros:* Fully solves the stated scenario, including within-item splits. Gives a natural home for "unallocated remaining quantity" reporting (Section F gap) and a natural per-PO progress rollup (sum allocations' WorkOrder statuses).
- *Cons:* Bigger change — touches the immutability assumptions baked into `WorkOrderItem`'s doc comments, requires new validation at allocation time and probably at PO-item-cancellation/revision time (MOM #1's revision reconciliation would need to account for partially-allocated items), and requires new UI (a "Plan WOL/SPK" allocation screen) rather than reusing the existing "Create Work Order" flow.

### Option 3 — Hybrid (Option 1 now, Option 2 later if whole-item splitting proves insufficient)
Ship Option 1 first (smaller, immediately unblocks the "multiple crews / different device families" case and the WorkOrder-list scalability concern from Section G by capping per-WorkOrder job counts), observe whether real hospital data actually has single line items large enough (dozens+ of one device type) to need quantity-splitting, and only build Option 2 if so.
- *This audit's inclination, stated as a recommendation, not a decision:* Option 3 is the lower-risk path — Option 1 alone already meaningfully improves the operational-capacity story (Section G's per-WorkOrder scaling risk shrinks automatically once WorkOrders are naturally smaller) and de-risks the bigger Option 2 investment until real data confirms it's needed. **This is explicitly a recommendation for the next design conversation, not a scoped implementation.**

All three options leave the **DLN gap (Section E/J)** unresolved — a decision on whether "results-back" documentation is in scope, and if so what entity represents it, is needed regardless of which allocation option is chosen.

---

## O. Migration / Backward Compatibility Risks

- **CONFIRMED FROM CODE:** the partial unique index (`WorkOrder_purchaseOrderId_active_key`) was added in a migration whose own comment states *"Safe: no WorkOrder rows exist in current environments (new domain, no API yet)"* — i.e. it was added when the table was empty. **Removing/relaxing it now must account for the Minto Hardjo trial's live data** (406 real WorkOrder/job rows plus whatever else has since been created) — any migration needs to be additive/backward-compatible with existing single-WorkOrder POs, not a destructive replace.
- `WorkOrderItem_workOrderId_purchaseOrderItemId_key` would need to be reconsidered under Option 2 (quantity allocation) — a PO item could then legitimately appear in *multiple* WorkOrderItems (one per allocation), which the current unique pair doesn't anticipate as "multiple rows, same PO item, same WorkOrder" but *does* already anticipate as "multiple rows, same PO item, different WorkOrders" (the pair is `(workOrderId, purchaseOrderItemId)`, so this already permits one PO item across many WorkOrders — it's only the WorkOrder-per-PO index that currently prevents exercising it). This is a useful existing detail: **the `WorkOrderItem` unique constraint itself does not need to change for Option 1 or Option 2** — only the `WorkOrder.purchaseOrderId` partial index does.
- `MOM #1` history tables (`WorkOrderHistory`, `WorkOrderItemHistory`) snapshot by `(workOrderId, revisionNumber)` — unaffected by multi-WorkOrder-per-PO, since history is already per-WorkOrder.
- The dormant `PurchaseOrderItemStatus.ALLOCATED`/`FULFILLED` values are a **backward-compatible head start**, not a risk — wiring them up under Option 2 doesn't require an enum migration, just new service logic.
- Existing single-WorkOrder POs (including the live Minto Hardjo data) must continue to behave identically under either option — Option 1/2 should be purely additive (a PO *can* have more than one active WorkOrder; it doesn't have to).

---

## P. High-Volume Risks

Restating and consolidating Section G in risk-register form:

| Risk | Trigger | Current mitigation | Residual risk |
|---|---|---|---|
| WorkOrder list/detail over-fetches unbounded `jobs` | Any WorkOrder with hundreds–thousands of fanned-out jobs | None — `workOrderInclude` has no `take` | High at 1,000+ jobs in one WorkOrder; **naturally reduced by splitting into smaller WorkOrders** |
| `start()` transaction does unbatched per-job KontrolAlat creation | SEND_TO_LAB WorkOrder with hundreds–thousands of units | None — sequential loop | High at 1,000+ units; independent of the splitting question but also mitigated by smaller WorkOrders |
| No PO-level progress aggregation | Any multi-WorkOrder-per-PO future state | N/A today (doesn't exist) | Must be designed fresh under Option 1/2 |
| Technician sees entire WorkOrder's jobs regardless of size | Large WorkOrder, few technicians | None | Operationally this **is** the core problem statement — a technician assigned to a 400-job WorkOrder has no system-level narrowing of "their" subset |

---

## Q. Open Questions / Decisions Required

1. **Allocation granularity:** whole-PO-item split (Option 1) vs. quantity-level split (Option 2) vs. hybrid (Option 3)? This is the single biggest fork and should be decided before any schema work.
2. **DLN/"results-back" document:** is a customer-facing document that follows completed, certified units back to the customer actually in scope for this initiative, or is the existing per-`CalibrationJob` `Certificate` sufficient? If a grouped/batched document is wanted, it needs new domain modeling entirely separate from `EquipmentDeliveryNote`.
3. **Is manual allocation sufficient for the near term**, with automatic recommendation deferred until workload/capacity/qualification data (Section L's "C" items) is deliberately modeled? Building an automatic algorithm on top of today's missing inputs would mean inventing those inputs first, which is a separate, non-trivial initiative.
4. **What happens to a PO's remaining/unallocated quantity in the UI/reporting** once multi-WorkOrder allocation exists — is "PO progress %" a hard requirement for the next phase, or can it wait?
5. **Should `WorkOrder.revise()`'s existing pull-based reconciliation pattern be extended to multi-WorkOrder-per-PO** (e.g., re-running reconciliation across all active sibling WorkOrders when the PO's active scope changes), or should a PO revision under Option 1/2 simply block if any of its items are already allocated to an active WorkOrder?
6. **Is the WorkOrder-list over-fetch (Section G/H #9) and the KontrolAlat batching gap (#10) worth fixing independently of the split feature**, given they're real defects today at 406 jobs and will only get more painful as trial hospitals grow, split or not?

---

## R. Recommended Implementation Phases (high-level only — do not implement)

1. **Decision phase:** resolve Q1–Q3 above with the business/domain owner before writing any code.
2. **Phase A (if Option 1/3 chosen):** relax the PO↔WorkOrder cardinality constraint to "N active WorkOrders per PO, disjoint whole PO items," extend `create()`/`revise()` accordingly, update the Portal PO-detail page from "single Work Order slot" to "list of Work Orders for this PO" with a "Create Work Order" action that accepts an item subset.
3. **Phase B:** build PO-level status/progress aggregation across a PO's (now potentially multiple) WorkOrders, extending the existing dashboard/rollup patterns rather than the WorkOrder-grouped-jobs pattern directly.
4. **Phase C (independent, can run in parallel with A/B):** fix the two concrete scalability defects found in Sections G/H (#9 unbounded `workOrderInclude.jobs`, #10 unbatched KontrolAlat creation) — these are real today and become more urgent as trial hospitals grow, regardless of the split feature's timeline.
5. **Phase D (only if Option 2 is later confirmed necessary by real data):** design and build the quantity-level allocation entity, its balance invariants, and its interaction with `PurchaseOrdersService.revise()`'s item-retirement rules.
6. **Phase E (separately decided):** resolve the DLN/results-back-document question (Q2) and, if in scope, design that entity from scratch — it is not a generalization of `EquipmentDeliveryNote`.
7. **Phase F (only after A–C are stable and real multi-crew usage exists):** revisit automatic-split recommendation once workload/capacity/qualification inputs (Section L "C" items) have been deliberately modeled — do not attempt to build this on top of today's missing inputs.

---

*No schema, migration, service, UI, or seed changes were made in the course of this audit.*
