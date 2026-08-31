# Work Order — Business Model Audit (Work Order Phase)

> **READ-ONLY AUDIT.** No code, migration, seed, or UI changes were made to
> produce this document. Its purpose is to establish the correct Work Order
> business model before implementation begins.
>
> Date: 2026-08-31
>
> **REVISED 2026-08-31** — see **§0 Refined Decision**. The earlier draft proposed
> a new `WOS` prefix / `WORK_ORDER_ON_SITE` document type for On Site. That is
> **withdrawn**: On Site keeps the existing `WORK_ORDER` / `SPK` identity; only
> **one** new document type is added, for `SEND_TO_LAB` → `WOL`. Some later
> sections below still contain the superseded `WOS` wording and are annotated
> `(SUPERSEDED — see §0)`; §0 is authoritative.

Legend: **[FACT]** = verified in current code/schema · **[REC]** = recommendation
based on evidence · **[OPEN]** = repository does not answer; the business must
decide.

---

## Context

The business is entering the **Work Order phase** of the calibration lifecycle:

```
Requisition → Quotation → Purchase Order → Work Order → Calibration Job
```

A Work Order MVP already exists in code (NestJS backend module, Next.js portal
UI, pdfkit PDF). This audit reports what the code actually does, establishes the
Work Order business rules — especially the two operational modes **ON_SITE** and
**SEND_TO_LAB** ("In Lab") and their independent document numbering (`SPK/…`,
`WOL/…`) — names every controlled document the technician carries, and proposes a
numbering architecture that reuses the existing `DocumentNumberService`.

---

## 0. Refined Decision — SPK / WOL (FINAL, LOCKED, supersedes WOS)

> Business-rule refinement, 2026-08-31. Context: **the database contains no
> historical Work Order / SPK records.** There is therefore no migration-
> compatibility reason to move On Site onto a new `WOS` prefix. This section
> supersedes every `WOS` / `WORK_ORDER_ON_SITE` statement elsewhere in this
> document.

### A. Final locked decisions

1. There are exactly **two** Work Order service modes — no third type:
   - `ON_SITE`
   - `SEND_TO_LAB` (internal Prisma enum value; business/UI term = **"In Lab"**)
2. Work Order document identities:

   | Mode | ServiceMode value | Doc code | Number format |
   |---|---|---|---|
   | On Site | `ON_SITE` | **SPK** | `SPK/YYYY/MM/NNNNN` |
   | In Lab | `SEND_TO_LAB` | **WOL** | `WOL/YYYY/MM/NNNNN` |

3. `ON_SITE` **keeps the existing `WORK_ORDER` document type and `SPK` prefix**
   that are already in the schema, prefix map, and PDF. It is **not** renamed and
   **not** moved to `WOS`.
4. `SEND_TO_LAB` gets **one** new document type with prefix **`WOL`**.
5. **`SPK` and `WOL` use independent sequences**, partitioned exactly like every
   other series: `(companyId, documentType, year)`. The month is rendered in the
   number but does **not** reset the counter — `SPK/2026/08/00001` →
   `SPK/2026/09/00002` is correct.
6. Example:

   ```
   First  On Site WO → SPK/2026/08/00001
   First  In Lab  WO → WOL/2026/08/00001
   Second On Site WO → SPK/2026/08/00002
   Second In Lab  WO → WOL/2026/08/00002
   ```

7. **Do NOT introduce `WOS` or `WORK_ORDER_ON_SITE`** as an active document type
   or numbering series.
8. **Do NOT rename** the Prisma enum `ServiceMode.SEND_TO_LAB` in this phase.
   Internal code = `SEND_TO_LAB`; user-facing label = "In Lab"; document prefix =
   `WOL`.
9. The **second technician document** for each mode remains an **OPEN BUSINESS
   DECISION** (§0.F, §6 Document B, §7 Document B). Its name, numbering, schema,
   and lifecycle are not invented here.

### B. Changes from the previous (WOS) draft

| Previous draft | Refined decision |
|---|---|
| On Site → new `WORK_ORDER_ON_SITE` / prefix `WOS` | On Site → existing `WORK_ORDER` / prefix `SPK` (unchanged) |
| Add **two** `DocumentType` enum values | Add **one** `DocumentType` enum value (for In Lab) |
| Add `WOS` and `WOL` to the prefix map | Add **only `WOL`** to the prefix map |
| Rationale included "legacy `SPK` rows coexist" | No legacy rows exist; nothing to coexist with |
| `SPK` treated as a retired/legacy series | `SPK` is the **live** On Site series |

### C. Impact on schema

- `DocumentType` enum: **+1 value** for In Lab. Recommended name
  `WORK_ORDER_SEND_TO_LAB` (mirrors the `ServiceMode` value it is derived from;
  `WORK_ORDER_IN_LAB` is an acceptable alternative if the team prefers the UI
  term). Additive Postgres enum migration only.
- `WORK_ORDER` enum value: **unchanged**, now explicitly meaning "On Site work
  order".
- **No new columns** on `WorkOrder`, `WorkOrderItem`, or `DocumentNumberSequence`.
- **No change** to `DocumentNumberSequence` structure or its
  `(companyId, documentType, year)` unique key.
- No data migration (no rows to migrate).

### D. Impact on DocumentNumberService

- `document-type-prefix.ts`: add **one** entry —
  `WORK_ORDER_SEND_TO_LAB: "WOL"`. `WORK_ORDER: "SPK"` stays.
- `document-type-table.ts`: add `WORK_ORDER_SEND_TO_LAB: "WorkOrder"`
  (`WORK_ORDER` already maps to `"WorkOrder"`). Both types share the
  `WorkOrder.number` column; the backfill query filters by prefix
  (`LIKE 'WOL/<year>/%'` vs `LIKE 'SPK/<year>/%'`) so the two counters stay
  independent.
- `work-orders.service.ts create()`: replace the hard-coded `"WORK_ORDER"` with
  ```
  const documentType =
    serviceMode === "ON_SITE" ? "WORK_ORDER" : "WORK_ORDER_SEND_TO_LAB";
  ```
- **No other change.** `allocate()`, the format function, and the sequence
  increment logic are untouched. Yearly reset, month-in-format behaviour is
  already what the business wants.

### E. Impact on UI terminology

- Prisma / API / internal code: keep `SEND_TO_LAB`.
- User-facing label: **"In Lab"** (today `SERVICE_MODE_LABELS` says "Send to
  Lab" in `work-order-pdf.ts:15`; the portal `ServiceModeBadge` label should also
  read "In Lab"). This is a **label-only** change, not an enum change.
- Work Order PDF: On Site prints title/number as today ("WORK ORDER" / "SPK
  Number"); In Lab prints "WORK ORDER — IN LAB" / "WOL Number".
- `serviceMode` becomes **immutable after the Work Order is created** (it now
  determines the document number). `PATCH /:id` / `workOrderUpdateSchema` must
  drop `serviceMode` from the editable set.

### F. Remaining open business decisions

Unchanged from the main audit — see **§14**. In summary:

- **O-1 / O-2** — the second technician document for On Site and for In Lab
  (name, purpose, numbering, signature, copies, lifecycle). No evidence in code.
- **O-3** — whether that second document needs its own number series / a child
  suffix of `SPK` / `WOL` / no number.
- **O-4** — whether the printed `SPK` / `WOL` need a signature block.
- **O-5** — physical `Device` identity materialization (On Site capture vs In Lab
  receiving); the `CalibrationJob.deviceId` hard-FK blocker.
- **O-6..O-10** — WO milestones for In Lab, cancellation audit fields, whole-unit
  vs decimal qty, RBAC grants.

### G. Exact implementation scope for the next phase (Phase WO-1)

In scope:

1. `DocumentType` enum: add `WORK_ORDER_SEND_TO_LAB` (additive migration).
2. `document-type-prefix.ts`: add `WORK_ORDER_SEND_TO_LAB → "WOL"`.
3. `document-type-table.ts`: add `WORK_ORDER_SEND_TO_LAB → "WorkOrder"`.
4. `work-orders.service.ts create()`: pick documentType by `serviceMode`.
5. `work-orders.service.ts` + `workOrderUpdateSchema`: make `serviceMode`
   immutable after create.
6. `work-order-pdf.ts`: branch title / number label on `serviceMode`.
7. Portal: `ServiceModeBadge` / labels show **"On Site"** and **"In Lab"**;
   Work Order list/detail show the correct `SPK` / `WOL` number as-is.
8. Tests: `SPK` and `WOL` increment independently for the same company/year;
   tenant isolation; `serviceMode` rejected by `PATCH /:id`; In Lab PDF header.

Explicitly **out of scope** for Phase WO-1: any second technician document,
any `Device`/`CalibrationJob` work, any new `WorkOrder` columns, any enum rename,
any `WOS` prefix.

### Decisions taken by the user during this audit (2026-08-31)

- **On Site identity:** existing `WORK_ORDER` / `SPK` — no `WOS`, no new type
  for On Site (no historical WO records exist).
- **In Lab identity:** one new document type, prefix `WOL`, independent sequence.
- **Sequence reset:** yearly, matching the existing convention; partition key
  `(companyId, documentType, year)`; month shown in format, not in the key.
- **Mode naming:** keep `ServiceMode { ON_SITE, SEND_TO_LAB }`. No rename to
  `IN_LAB`. UI label for `SEND_TO_LAB` = "In Lab".
- **Second technician document:** no evidence in code. All attributes are OPEN
  BUSINESS DECISIONS; this audit does not invent names.

---

## 1. Current schema reality

Single schema file: `packages/db/prisma/schema.prisma` (no split). Migrations in
`packages/db/prisma/migrations/`.

### 1.1 Flow entities that exist [FACT]

| Entity | Model | Numbered? | documentType | Prefix |
|---|---|---|---|---|
| Requisition | `CalibrationRequest` / `CalibrationRequestItem` | yes `@@unique([companyId, number])` | `CALIBRATION_REQUEST` | `CRQ` |
| Quotation | `Quotation` / `QuotationItem` | yes | `QUOTATION` | `QUO` |
| Purchase Order | `PurchaseOrder` / `PurchaseOrderItem` | yes | `PURCHASE_ORDER` | `PUR` |
| Work Order | `WorkOrder` / `WorkOrderItem` (+ `WorkOrderAssignment`) | yes | `WORK_ORDER` | `SPK` |
| Calibration Job | `CalibrationJob` | no number | — | — |

There is **no** `Requisition` model — the request entity is `CalibrationRequest`
(UI / PDF label "Calibration Requisition").

### 1.2 Item chain — foreign keys that actually exist [FACT]

| Link | FK column | On model | Nullable | onDelete |
|---|---|---|---|---|
| CalibrationRequestItem → CalibrationRequest | `requestId` | child | no | Cascade |
| QuotationItem → CalibrationRequestItem | `requestItemId` | QuotationItem | **yes** | SetNull |
| PurchaseOrderItem → QuotationItem | `quotationItemId` | PurchaseOrderItem | **no** | Restrict; `@@unique([purchaseOrderId, quotationItemId])` |
| WorkOrderItem → PurchaseOrderItem | `purchaseOrderItemId` | WorkOrderItem | **no** | Restrict; `@@unique([workOrderId, purchaseOrderItemId])` |
| CalibrationJob → WorkOrder | `workOrderId` | CalibrationJob | no | Cascade |
| CalibrationJob → PurchaseOrderItem | `purchaseOrderItemId` | CalibrationJob | **yes** | SetNull |
| CalibrationJob → Device | `deviceId` | CalibrationJob | **no (required)** | (default) |

**There is no direct FK `CalibrationJob → WorkOrderItem`.** A job joins back to a
line only indirectly:
`WorkOrderItem.purchaseOrderItemId == CalibrationJob.purchaseOrderItemId` within
the same `workOrderId`. `CalibrationJob` is uniquely keyed
`@@unique([workOrderId, deviceId])`.

### 1.3 WorkOrder / WorkOrderItem fields [FACT]

`WorkOrder`: `id, companyId, quotationId, purchaseOrderId, customerId, number,
serviceMode (ServiceMode, required), addressText?, geoLat?, geoLng?,
locationNotes?, scheduledStart?, scheduledEnd?, status (WorkOrderStatus
@default(PLANNED)), createdAt, updatedAt`. Relations: `quotation`,
`purchaseOrder` (Restrict), `customer`, `items`, `assignments`, `jobs`, plus a
legacy `purchaseOrderItems` back-relation ("Unused by WorkOrder MVP").
`@@unique([companyId, number])`. A **partial unique index**
`WorkOrder_purchaseOrderId_active_key` (where `status <> CANCELLED`) is created in
raw SQL — enforces one active WO per PO.

`WorkOrderItem`: `id, companyId, workOrderId, purchaseOrderItemId, description,
qty (Decimal(18,4) @default(1)), createdAt`. Schema comment: *"Operational
snapshot of a PurchaseOrderItem. MVP copies every PO item 1:1. Quantity and
source identity are immutable after create."* **No `deviceId`, no status, no
completion field.**

`WorkOrderAssignment`: `workOrderId, technicianUserId → User, roleOnJob
(AssignmentRole { LEAD, ASSIST } @default(LEAD))`.

### 1.4 Enums [FACT]

```
ServiceMode              { ON_SITE, SEND_TO_LAB }
WorkOrderStatus          { PLANNED, ASSIGNED, IN_PROGRESS,
                           TECHNICALLY_DONE (legacy), CLOSED (legacy),
                           CANCELLED, DONE }
CalibrationJobStatus     { PENDING, IN_PROGRESS, SUBMITTED, REWORK, ACCEPTED_BY_QA }
PurchaseOrderStatus      { DRAFT, APPROVED, RECEIVED, CONFIRMED, FULFILLED, CANCELLED }
PurchaseOrderItemStatus  { OPEN, ALLOCATED, FULFILLED, CANCELLED }
QuotationStatus          { DRAFT, SENT, APPROVED, REJECTED, EXPIRED, CANCELLED }
CalibrationRequestStatus { DRAFT, SUBMITTED, IN_QUOTATION, CANCELLED, FULFILLED }
DocumentType             { CUSTOMER, CALIBRATION_REQUEST, QUOTATION, PURCHASE_ORDER,
                           WORK_ORDER, INVOICE, CERTIFICATE, CREDIT_NOTE }
```

`PurchaseOrderStatus.{RECEIVED, CONFIRMED, FULFILLED}`,
`PurchaseOrderItemStatus.{ALLOCATED, FULFILLED, CANCELLED}`,
`WorkOrderStatus.{TECHNICALLY_DONE, CLOSED}` are **dead values** — no service
ever sets them.

---

## 2. Current Requisition → Quotation → PO → WO flow

### 2.1 What the code does today [FACT]

- **CalibrationRequest** carries `serviceMode` (required). Set on manual create
  (`calibration-requests.service.ts:100`) and on Excel import
  (`calibration-request-import.service.ts:488`). `qty` is an `Int >= 1` aggregate
  per line.
- **Quotation** (`quotations.service.ts`): 1:1 with a request
  (`requestId @unique`). `create()` allocates a `QUOTATION` number, copies each
  `CalibrationRequestItem` into a `QuotationItem` with `qty` verbatim, prices
  from `PriceListItem`, flips the request to `IN_QUOTATION`. **Does not carry
  `serviceMode`.** Generator hard-codes `QuotationItem.deviceId = null`.
- **PurchaseOrder** (`purchase-orders.service.ts`): `create()` requires
  `Quotation.status = APPROVED` + `customerApprovedAt` + tax present; one active
  PO per quotation; copies every `QuotationItem` → `PurchaseOrderItem` (`qty`
  verbatim, `status: OPEN`, `deviceId` inherited = null); allocates a
  `PURCHASE_ORDER` number; PO starts `DRAFT`. `approve()` → `APPROVED`, stamps
  `confirmedAt` / `confirmedByUserId`. **PO approval does nothing downstream** —
  no events, no auto-creation.
- **WorkOrder** (`work-orders.service.ts`): fully built MVP. `create(companyId,
  input)` where `input.purchaseOrderId` points at an **APPROVED** PO:
  - Validates PO exists, `status === "APPROVED"`, has ≥ 1 item.
  - Rejects if an active (non-CANCELLED) WO already exists for the PO
    (`DUPLICATE_ACTIVE_WORK_ORDER`).
  - Allocates a `WORK_ORDER` number (`SPK/YYYY/MM/NNNNN`).
  - Creates `WorkOrder` with `serviceMode: request.serviceMode` (**copied from
    the CalibrationRequest** via `quotation.request`), `status: PLANNED`, plus
    optional location / schedule fields from `input`.
  - `createMany` copies **every** `PurchaseOrderItem` → `WorkOrderItem` 1:1
    (`description`, `qty`). No item selection, no split.
  - Endpoints: `POST /work-orders`, `GET`, `GET /:id`, `GET /:id/pdf`,
    `PATCH /:id`, `POST /:id/assign`, `POST /:id/start`, `POST /:id/done`,
    `POST /:id/cancel`.

### 2.2 Answers to the critical business-rule questions

| # | Question | Answer |
|---|---|---|
| 1 | What creates a Work Order? | **[FACT]** An explicit portal / API call `POST /work-orders` with a `purchaseOrderId`. Never automatic. |
| 2 | Generated from Quotation / PO / manual? | **[FACT]** From an **APPROVED PurchaseOrder**, triggered manually. WO also stores `quotationId` (copied from the PO) but the PO is the source. |
| 3 | Source of truth for WO items? | **[FACT]** `PurchaseOrderItem`. `WorkOrderItem` is an immutable snapshot of it. |
| 4 | `WorkOrderItem = PO item` or `= Quotation item`? | **[FACT]** `WorkOrderItem.purchaseOrderItemId` (required FK). One `WorkOrderItem` per `PurchaseOrderItem`. |
| 5 | Can a WO contain a subset of PO items? | **[FACT] No.** All PO items are copied. LOCKED domain decision (`REFINED-READ-ONLY AUDIT — FINAL WORKORDER DOMAIN.md` §3): no subset, no split, no allocation engine. |
| 6 | How does qty flow into `WorkOrderItem`? | **[FACT]** Copied verbatim `PurchaseOrderItem.qty → WorkOrderItem.qty` (`Decimal(18,4)`). Immutable after create. No decrement anywhere in the chain. |
| 7 | Can WO items be partially completed? | **[FACT] No mechanism exists.** `WorkOrderItem` has no status, no completed / remaining qty. |
| 8 | How does partial completion create `CalibrationJob`? | **[FACT] It does not.** There is **no `CalibrationJob` creation path in the codebase at all** (see §3). `work-orders.service.ts done()` explicitly does **not** create jobs (asserted by tests). |
| 9 | Physical grain `CalibrationJob = one Device`? | **[FACT]** Schema enforces it: `CalibrationJob.deviceId` required FK + `@@unique([workOrderId, deviceId])`. Real `Device.id` is **never assigned by any current code path**. |
| 10 | ON_SITE: when does the technician record `Device.id`? | **[OPEN]** No technician capture flow exists. Schema comment (`schema.prisma:1287`) states the intent: *"physical identity is assigned later, on site, by the technician."* No screen, endpoint, or model field implements it. |
| 11 | IN_LAB: is `Device.id` known before WO / on receiving / later? | **[OPEN]** No goods-in / equipment-receiving step exists. Not answered by the repository. |

---

## 3. Current CalibrationJob relationship

**[FACT]**

- `CalibrationJob` exists **as a schema model only**. No API module
  (`apps/api/src/modules/calibration-jobs` does not exist), no service, no
  controller, no tRPC router, no server action, no portal UI, no tech-pwa code.
- The only references in code are **negative assertions** in
  `work-orders.service.test.ts` ("does not create CalibrationJob rows") and a
  comment in `equipment-calibration-records/calibration-validity.ts:8`.
- Related models that hang off `CalibrationJob` also exist unused:
  `MeasurementResult`, `JobEvidence`, `JobReferenceEquipmentUsed`,
  `CustomerSignature`, `QualityReview`, `Certificate`.
- RBAC constants `calibrationJob: ["read","create","update","complete"]` exist
  but **no role is granted any of them**.

**Intended boundary** (from `REFINED-READ-ONLY AUDIT — FINAL WORKORDER DOMAIN.md`
§8, itself marked UNRESOLVED): `1 WorkOrder → N CalibrationJob`,
`1 CalibrationJob → 1 WorkOrder`. **When** a job is created (on WO create /
ASSIGNED / IN_PROGRESS / manual) is **[OPEN]** — the repository gives no evidence.

**[FACT — BLOCKER for the CalibrationJob phase, not for Work Order]**
`CalibrationJob.deviceId` is a **required** FK to `Device`, but:
- LOCKED decision: PKM does **not** use `Device` master as the business source of
  truth; device info is meant to come from `PurchaseOrderItem.deviceId`.
- `PurchaseOrderItem.deviceId` is optional and currently always `null`.
- `WorkOrderItem` has no `deviceId` at all.

So there is **no way to create a `CalibrationJob` today** without first
materialising a real `Device` row. This is the central unresolved architectural
question for the phase *after* Work Order. It does **not** block Work Order
issuance or numbering.

---

## 4. Service mode reality

**[FACT]**

- Enum `ServiceMode { ON_SITE, SEND_TO_LAB }` — `schema.prisma:102`.
- Fields of type `ServiceMode`: `CalibrationRequest.serviceMode` (required),
  `WorkOrder.serviceMode` (required). **Not** on Quotation, QuotationItem,
  PurchaseOrder, PurchaseOrderItem, WorkOrderItem, CalibrationJob, Device.
- Zod: `serviceModeValues = ["ON_SITE","SEND_TO_LAB"]`
  (`packages/shared/src/schemas/index.ts:287`), used in the calibration-request
  and work-order schemas.
- Data flow: **captured on `CalibrationRequest` → copied onto `WorkOrder`** at WO
  creation (`work-orders.service.ts:206`). Quotation and PO drop it entirely,
  then WO re-reads it from `quotation.request.serviceMode`.
- PDF labels: `SERVICE_MODE_LABELS = { ON_SITE: "On Site", SEND_TO_LAB: "Send to Lab" }`
  (`work-order-pdf.ts:15`). Portal renders
  `<ServiceModeBadge mode={workOrder.serviceMode} />`.
- The spec's **"IN_LAB" ≡ existing `SEND_TO_LAB`.** Per the user decision, no
  rename; `SEND_TO_LAB` stays the internal value.

**[FACT]** `serviceMode` today is **only a data attribute**. It does **not**:
- drive a separate document identity or number (a single `SPK` series serves both
  modes),
- change the WO state machine,
- change which / how items are copied,
- gate any behaviour beyond a PDF label and a badge.

This is exactly the gap the Work Order phase must close: promote `serviceMode`
from "display attribute" to "document-identity discriminator".

---

## 5. Work Order business rules

### 5.1 LOCKED (already decided, present in code + `REFINED-READ-ONLY AUDIT` doc) [FACT]

1. **Source:** a WO is created only from `PurchaseOrder.status = APPROVED`. No
   standalone WO.
2. **Cardinality:** 1 PO → 1 active WO. Enforced by the partial unique index
   `WorkOrder_purchaseOrderId_active_key` + the `DUPLICATE_ACTIVE_WORK_ORDER`
   guard. A CANCELLED WO is historical and does not block re-creation.
3. **Item scope:** one WO = the entire PO. All `PurchaseOrderItem`s copied 1:1.
   No subset, no split, no partial allocation, no allocation engine.
4. **Creation trigger:** manual ("Create Work Order" action on an APPROVED PO).
   PO approval never auto-creates a WO.
5. **Not a commercial document:** the WO holds no price / discount / tax / total
   fields. Commercial source of truth stays Quotation → PO snapshot.
6. **Status vocabulary:** `PLANNED, ASSIGNED, IN_PROGRESS, DONE, CANCELLED`
   (legacy `TECHNICALLY_DONE`, `CLOSED` retained in the enum for migration
   safety, never used by the API).
7. **Company scoping:** `CompanyRoleGuard`, `companyId` from authenticated
   context, never from the client. All WO queries company-scoped.
8. **Document number:** `WORK_ORDER` / prefix `SPK` / format `SPK/YYYY/MM/NNNNN`,
   allocated at create time inside the transaction.
9. `qty` and source identity on `WorkOrderItem` are immutable after create.

### 5.2 What the Work Order phase changes / adds [REC] — per §0

1. **Two document identities, not one.** The single current series becomes two
   independent series keyed by `serviceMode`:
   - `ON_SITE` → existing document type `WORK_ORDER`, prefix `SPK` (unchanged)
   - `SEND_TO_LAB` ("In Lab") → new document type, prefix `WOL`
   (Numbering architecture in §0.D and §12.)
2. **`serviceMode` becomes immutable on `WorkOrder` after issue** — because it
   now determines the document number, it cannot change once a number is
   allocated. (Today `PATCH /:id` conditionally accepts `serviceMode` —
   `work-orders.service.ts:327` — this should be locked.)
3. Everything else in §5.1 stays as-is for the Work Order MVP.

### 5.3 [OPEN] business decisions on Work Order rules

- Does `ON_SITE` work need a **per-item or per-visit partial-completion** concept
  before `CalibrationJob` exists? (Today: no.) Recommendation: keep out of the
  Work Order MVP; handle at the CalibrationJob phase.
- For `IN_LAB`, is there a distinct **"equipment received at lab"** milestone
  that should be a WO status or a separate receiving record? (Today: none.)

---

## 6. ON_SITE document requirements

### Document A — the Work Order document (ON_SITE)

> Per §0: On Site keeps the **existing** `WORK_ORDER` / `SPK` identity. The `WOS`
> wording in the earlier draft of this table is **superseded** — read `SPK`
> wherever `WOS` appears below.

| Attribute | Finding |
|---|---|
| Document name | **[REC]** "Work Order — On Site" / `SPK`. (`work-order-pdf.ts` already titles it "WORK ORDER", labels the number "SPK Number".) |
| Purpose | **[FACT]** Operational instruction sheet: customer, location, schedule, assigned technicians (LEAD / ASSIST), line items + qty, service mode. |
| Number format | **[FACT]** `SPK/YYYY/MM/NNNNN` (already implemented) |
| Numbering sequence | **[FACT]** `documentType = WORK_ORDER`, partition `(companyId, WORK_ORDER, year)` — independent of the In Lab (`WOL`) series. |
| When number is allocated | **[REC]** At `WorkOrder.create()`, inside the transaction (same as every other document today). |
| Generated from which entity | **[FACT/REC]** The `WorkOrder` row (its `number` column). |
| Generated together with the Work Order? | **[FACT]** Yes — the number *is* the WO's `number`; the PDF is rendered on demand from the WO. |
| Immutable after issue? | **[REC]** The **number** is immutable (no `update` schema accepts it; `@@unique([companyId, number])`). The PDF is regenerated on each request from live WO data — see §8. |
| Can be regenerated? | **[FACT]** Yes — the PDF is built on every `GET /:id/pdf` call; nothing is persisted. |
| Requires signature? | **[FACT]** No signature field or block exists anywhere in the system. **[OPEN]** whether the printed `SPK` needs a sign-off area. |
| Who carries / uses it | **[REC]** The assigned technician (LEAD). |
| Copy type | **[REC]** Internal + technician copy. A customer-facing acknowledgement would be Document B (OPEN). |

### Document B — second ON_SITE technician document

**[OPEN BUSINESS DECISION — no evidence in code.]**

- No template, model, number, or endpoint exists.
- Planning docs mention "Surat Jalan" and "Surat Tugas" only as future Phase-2
  items (`calibrationrequest/MEDCAL — PHASE 2 IMPLEMENTATION.md:865`;
  `calibrationrequest/implementation_report_requisition_phase1.md:365` lists
  "Surat Jalan" as explicitly out of scope). `apps/tech-pwa` is an empty shell.

The business must decide, for the ON_SITE Document B:
- document name and purpose (field service report? customer acknowledgement of
  work done? handover of reference standards brought to site?),
- whether it needs **its own number** (and if so: its own series, or a child
  suffix of the `SPK` number such as `SPK/…/00001-A`),
- whether it is generated together with the `SPK` or at a later lifecycle stage,
- immutable after issue / regeneratable,
- requires signature (likely yes if it is a customer acknowledgement),
- technician copy / customer copy / internal copy,
- whether it needs a status.

---

## 7. IN_LAB document requirements

### Document A — the Work Order document (IN_LAB)

Identical structure to §6 Document A, with:

| Attribute | Finding |
|---|---|
| Document name | **[REC]** "Work Order — In Lab" / `WOL` |
| Number format | **[REC]** `WOL/YYYY/MM/NNNNN` |
| Numbering sequence | **[REC]** new `documentType` (recommended `WORK_ORDER_SEND_TO_LAB`), partition `(companyId, <that type>, year)` — independent of the On Site (`SPK`) series. |
| Location fields | **[FACT]** `addressText / geoLat / geoLng / locationNotes` still exist on the model; for IN_LAB they are typically empty (equipment comes to the lab). No code enforces this either way. |
| Everything else | Same as §6 Document A. |

### Document B — second IN_LAB technician document

**[OPEN BUSINESS DECISION — no evidence in code.]** Same gap as §6 Document B.

For IN_LAB the second document is most plausibly an **equipment receiving /
delivery note** ("Surat Jalan" / "penerimaan alat") that:
- records which physical units actually arrived at the lab (the natural point
  where real `Device` identity is captured — see §11),
- is signed by the customer's courier / the receiving technician,
- may need its own number.

None of this is established by the repository. The business must decide the same
attribute list as in §6 Document B.

---

## 8. Document lifecycle

### 8.1 How documents behave today [FACT]

- **Engine:** `pdfkit`, server-side in `apps/api`, streamed as `StreamableFile`
  (`application/pdf`, `disposition: attachment`). Templates:
  `quotations/quotation-pdf.ts` (base — shared letterhead / addressee / filename
  helpers), `purchase-orders/purchase-order-pdf.ts`,
  `work-orders/work-order-pdf.ts`.
- **Numbers** are allocated **at row-creation time** for every document
  (Customer, CalibrationRequest, Quotation, PurchaseOrder, WorkOrder) — never on
  a later "issue" / "send" transition. Even an un-progressed draft consumes a
  sequence number; cancelling leaves a gap (gaps are acceptable by design).
- **Number immutability** is implicit: no `update` schema accepts `number`;
  `@@unique([companyId, number])` on every business table.
- **PDF regeneration:** every `GET /:id/pdf` re-renders from live row data.
  Nothing is stored, versioned, hashed, or sealed.
- **Signatures:** none. No `signedBy`, `signedAt`, e-sign, or signature block
  anywhere.
- **Immutability pattern that exists elsewhere** (a model for future signed
  technician documents): `EquipmentCalibrationRecord` — once "confirmed", the
  record and its file evidence become immutable
  (`equipment-calibration-records.service.ts:61`, `files.service.ts:71`).
- **Filename convention** (reused by all three PDFs):
  `<COMPANYID>-<PREFIX>-<YYYYMMDD>-<SEQUENCE>.pdf`, derived by regex-parsing the
  document number.

### 8.2 Recommendation for the four Work Order documents [REC]

| Question | Document A (SPK / WOL) | Document B (both modes) |
|---|---|---|
| Generated when? | Number at `WorkOrder.create()`; PDF on demand. | **[OPEN]** — recommend at a later stage (WO `IN_PROGRESS` for the ON_SITE report; on receiving for IN_LAB). |
| Generated from which entity? | `WorkOrder` | **[OPEN]** — likely a new child entity (field report / receiving record). |
| Immutable after issue? | Number: yes. PDF: regenerated from live data. | **[OPEN]** — if it captures signatures / results it should follow the "confirm → freeze" pattern. |
| Regeneratable? | Yes (stateless render). | **[OPEN]** |
| Requires numbering? | Yes — `SPK` / `WOL` series. | **[OPEN BUSINESS DECISION]** |
| Requires signature? | **[OPEN]** (none today). | **[OPEN]** — probably yes. |
| Technician / customer / internal copy | Technician + internal. | **[OPEN]** — probably customer + technician. |
| Needs a status? | No (follows WO status). | **[OPEN]** |

**Generated together, or at different stages?** [REC] Document A is inseparable
from the Work Order (it *is* the WO). Document B should be generated at a
**different lifecycle stage** — it depends on facts that do not exist at WO
creation (who went, what arrived, what was done). Do **not** force both to be
generated at WO issue.

---

## 9. Work Order state machine

### 9.1 Current WO state machine [FACT] (`work-orders.service.ts:26`)

```
PLANNED     → ASSIGNED | CANCELLED
ASSIGNED    → IN_PROGRESS | CANCELLED     (requires ≥ 1 assignment)
IN_PROGRESS → DONE | CANCELLED
DONE        → (terminal)
CANCELLED   → (terminal)
```

- `assign()` : PLANNED → ASSIGNED, creates `WorkOrderAssignment` rows (technician
  must be an ACTIVE company member).
- `start()` : ASSIGNED → IN_PROGRESS, requires ≥ 1 assignment.
- `done()` : IN_PROGRESS → DONE. **Does not create `CalibrationJob`.**
- `update()` blocked on terminal status. `cancel()` from any non-terminal state.
- No `cancelledAt` / `cancelledBy` / `reason` fields — **[OPEN]** whether
  cancellation needs an audit trail.

### 9.2 Recommendation [REC]

**Keep the current five-state machine unchanged for the Work Order MVP.** It is
already LOCKED and matches the domain. Specifically:

- Do **not** add per-item statuses to `WorkOrderItem` in this phase.
- Do **not** add `IN_LAB`-specific statuses (e.g. `EQUIPMENT_RECEIVED`) yet —
  first decide whether receiving is a WO status or a separate record (§7
  Document B).
- The `serviceMode` split does **not** require different state machines per mode;
  both `SPK` and `WOL` use `PLANNED → ASSIGNED → IN_PROGRESS → DONE (+ CANCELLED)`.
- Lock `serviceMode` as non-editable once the WO exists (it now drives the
  number).

**[OPEN]** If the business needs partial ON_SITE completion or staged IN_LAB
equipment arrival to be *tracked on the Work Order itself* (rather than on
`CalibrationJob`), that is a real state-machine change and must be decided
explicitly — the repository shows no such requirement today.

---

## 10. Quantity and partial-completion rules

**[FACT]**

- `qty` is copied verbatim at every hop:
  `CalibrationRequestItem.qty (Int ≥ 1)` → `QuotationItem.qty (Decimal 18,4)` →
  `PurchaseOrderItem.qty` → `WorkOrderItem.qty`. Immutable on `WorkOrderItem`.
- **No `fulfilledQty` / `remainingQty` / `deliveredQty` / `completedQty` field
  exists anywhere.**
- `PurchaseOrderItem.status` is always `OPEN` (other values never set).
  `PurchaseOrderItem.workOrderId` is a legacy pointer, "Unused by WorkOrder MVP".
- No partial-delivery, partial-fulfilment, or allocation logic exists in the
  quotation → PO → WO chain. All LOCKED WO design docs explicitly forbid
  split / partial / allocation for the MVP.

**[REC]**

- Work Order MVP: `WorkOrderItem.qty` stays an immutable snapshot. No partial
  completion at the `WorkOrderItem` level.
- Partial completion is inherently a **CalibrationJob-phase** concern: with
  `CalibrationJob = 1 physical device`, "3 of 5 units done" is naturally
  represented as 3 of 5 `CalibrationJob` rows in a terminal state — **no qty
  arithmetic on `WorkOrderItem` is needed**.
- WO "DONE" should eventually mean "all expected CalibrationJobs are in a
  terminal state" — but since `CalibrationJob` does not exist yet, `done()` stays
  a manual transition for now (as it is today).

**[OPEN]**

- Does a `WorkOrderItem` need an explicit `expectedJobCount` (usually `= qty`) so
  the system knows when a line is fully covered? Recommendation: derive from
  `qty` at the CalibrationJob phase; do not add a field now.
- How are `Decimal` qty values (e.g. `2.5`) reconciled with an integer device
  count? Today qty is `Decimal(18,4)` everywhere below the requisition. **[OPEN]**
  whether WO / Job devices must be whole units.

---

## 11. Device ID / physical-device materialization point

**[FACT]**

| Field | Type | Reality |
|---|---|---|
| `CalibrationRequestItem.deviceId` | `String?` (free text) | The customer's own equipment label. Explicitly **not** a `Device` FK. Nullable is a valid state. Schema comment: *"NOT the future CalibrationJob Device.id."* |
| `QuotationItem.deviceId` | `String?` FK → `Device` | Exists but the generator hard-codes `null`. |
| `PurchaseOrderItem.deviceId` | `String?` FK → `Device` | Inherited from `QuotationItem` = always `null` today. |
| `WorkOrderItem` | — | **No `deviceId` at all.** |
| `CalibrationJob.deviceId` | `String` FK → `Device` (**required**) | No code path ever sets it. |

**The real `Device.id` is never materialised anywhere in the current system.**
The chain the LOCKED doc expects
(`CalibrationRequestItem.deviceId → QuotationItem.deviceId →
PurchaseOrderItem.deviceId → CalibrationJob`) **cannot run** because
(a) the intermediate `deviceId`s are free-text / optional and always null, and
(b) `CalibrationJob.deviceId` is a hard FK to the `Device` master, which the
business has decided **not** to use as the source of truth.

This is a **BLOCKER for the CalibrationJob phase** (documented in
`REFINED-READ-ONLY AUDIT — FINAL WORKORDER DOMAIN.md` §4). It is **not** a blocker
for Work Order issuance or numbering.

**Materialization point — [OPEN BUSINESS DECISION]:**

- **ON_SITE:** the technician identifies each physical unit **on site**. There is
  no capture screen, endpoint, or model. Needs: a technician flow that, per
  `WorkOrderItem`, records N physical devices (serial number, tag, photo) and
  produces N `CalibrationJob` rows.
- **IN_LAB:** the natural capture point is **equipment receiving at the lab**
  (goods-in / "penerimaan alat"). No such step exists. Needs: a receiving record
  tied to the WO that lists arrived units and their identities.
- In both cases the business must decide whether "device identity" is:
  1. a lightweight per-job snapshot (serial + type text, no `Device` row), or
  2. a real `Device` master row created on first calibration, or
  3. `Device` rows pre-created from the requisition.
  Option 1 requires relaxing `CalibrationJob.deviceId` from a hard FK; options 2
  and 3 contradict "don't use `Device` master as the business source".

---

## 12. Work Order Types & Numbering

> Authoritative table — reflects §0 (SPK / WOL).

| Mode | ServiceMode value | WO Code | Example Number | Sequence |
|------|---|---------|----------------|----------|
| ON_SITE | `ON_SITE` | `SPK` | `SPK/2026/08/00001` | independent — `(companyId, WORK_ORDER, year)` (existing) |
| IN_LAB ("In Lab") | `SEND_TO_LAB` | `WOL` | `WOL/2026/08/00001` | independent — `(companyId, WORK_ORDER_SEND_TO_LAB, year)` (new) |

Worked example:

```
First  On Site WO → SPK/2026/08/00001
First  In Lab  WO → WOL/2026/08/00001
Second On Site WO → SPK/2026/08/00002
Second In Lab  WO → WOL/2026/08/00002
```

Month transition (yearly reset, month in format only):

```
SPK/2026/08/00001
SPK/2026/09/00002    ← correct; NOT SPK/2026/09/00001
```

The two counters never interact. There is **no** shared `WO/2026/08/00001`
series with `serviceMode` merely deciding display.

### Proposed numbering architecture (reuses the existing `DocumentNumberService`)

**[FACT — how numbering works today]**
`DocumentNumberService.allocate({ companyId, documentType, issuedAt, tx })`
(`packages/db/src/document-number/document-number.service.ts`) resolves everything
from the `documentType` enum value:

- prefix via `DOCUMENT_TYPE_PREFIX` (`document-type-prefix.ts`) — a fixed map,
  not per-company configurable;
- backing table via `DOCUMENT_TYPE_NUMBER_TABLE` (`document-type-table.ts`) —
  used only to seed the first sequence of a new year from legacy rows, with
  `WHERE "number" LIKE '<prefix>/<year>/%'`;
- the sequence row is keyed `(companyId, documentType, year)` in
  `DocumentNumberSequence`, incremented atomically via
  `INSERT … ON CONFLICT (companyId, documentType, year) DO UPDATE SET lastSequence = lastSequence + 1 RETURNING`;
- format `PREFIX/YYYY/MM/NNNNN` (`format-document-number.ts`) — the month is
  printed from `issuedAt` but is **not** part of the sequence key, so counters
  reset **yearly**, not monthly. This matches `QUO` / `PUR` / `CRQ` and is the
  behaviour the user chose for `SPK` / `WOL`.

**[REC] To get two independent WO series with zero new numbering logic (per §0):**

1. **`DocumentType` enum** — add **one** value (additive migration, safe):
   `WORK_ORDER_SEND_TO_LAB` (or `WORK_ORDER_IN_LAB`). Keep `WORK_ORDER` as the
   On Site type.
2. **`DOCUMENT_TYPE_PREFIX`** — add `WORK_ORDER_SEND_TO_LAB: "WOL"`.
   `WORK_ORDER: "SPK"` is unchanged.
3. **`DOCUMENT_TYPE_NUMBER_TABLE`** — add
   `WORK_ORDER_SEND_TO_LAB: "WorkOrder"` (`WORK_ORDER` already maps to
   `"WorkOrder"`; both share the column, the prefix-filtered backfill keeps the
   two counters independent).
4. **`work-orders.service.ts create()`** — choose the documentType from the
   already-known `serviceMode`:

   ```ts
   const documentType =
     serviceMode === "ON_SITE" ? "WORK_ORDER" : "WORK_ORDER_SEND_TO_LAB";
   ```

   instead of the hard-coded `"WORK_ORDER"`.
5. `DocumentNumberSequence` then automatically maintains
   `(company, WORK_ORDER, 2026)` and `(company, WORK_ORDER_SEND_TO_LAB, 2026)` as
   separate rows / counters. **No change to the sequence table, no month key, no
   custom numbering code.**

This is the existing company-scoped `DocumentNumberService` pattern, unchanged.

**Naming rationale.** `WORK_ORDER_SEND_TO_LAB` mirrors the `ServiceMode` value it
is derived from; `WORK_ORDER` stays as the On Site type with its existing `SPK`
prefix. The **document type** (the controlled document being issued) is kept
deliberately separate from **`serviceMode`** (the operational mode of the Work
Order), the **document number** (`SPK/2026/08/00001`, `WOL/2026/08/00001`), and
**`CalibrationJob`** (the physical-device execution record).

---

## 13. Recommended minimal schema changes (for the NEXT phase — not now)

> Nothing in this section is executed in the audit phase. Listed so the business
> can size the work.

### 13.1 For the SPK / WOL document split (Phase WO-1) — per §0

- `DocumentType` enum: **`+ WORK_ORDER_SEND_TO_LAB`** only (additive Postgres enum
  migration). `WORK_ORDER` stays as the On Site type.
- `document-type-prefix.ts`: **`+ WORK_ORDER_SEND_TO_LAB → "WOL"`** only.
  `WORK_ORDER → "SPK"` unchanged.
- `document-type-table.ts`: `+ WORK_ORDER_SEND_TO_LAB → "WorkOrder"`.
- `work-orders.service.ts create()`: pick documentType by `serviceMode`
  (`ON_SITE → WORK_ORDER`, else `WORK_ORDER_SEND_TO_LAB`).
- `work-orders.service.ts update()` / `workOrderUpdateSchema`
  (`packages/shared/src/schemas/index.ts`): **remove `serviceMode`** from the
  editable set (it is now number-determining).
- `work-order-pdf.ts`: title / number label switches on `serviceMode`
  (On Site: "WORK ORDER" / "SPK Number" as today; In Lab: "WORK ORDER — IN LAB" /
  "WOL Number").
- Portal: `ServiceModeBadge` / labels read **"On Site"** / **"In Lab"**.
- **No new columns on `WorkOrder`.** No data migration (no existing WO rows).

### 13.2 Deferred (blocked on the open decisions in §14)

- Any model / table for Document B (field report, receiving record) and its
  numbering.
- Any `Device` identity capture model or `CalibrationJob` creation path,
  including resolving the `CalibrationJob.deviceId` hard-FK blocker.
- Any signature model.

---

## 14. Open business decisions

| # | Decision | Notes |
|---|---|---|
| O-1 | **ON_SITE Document B** — name, purpose, numbering, lifecycle, signature, copies, status. | §6. No evidence in code. Must not be invented. |
| O-2 | **IN_LAB Document B** — same attribute list. | §7. Likely an equipment-receiving / delivery note. |
| O-3 | Does Document B need **its own number series**, a **child suffix** of the `SPK` / `WOL` number, or **no number**? | If its own series: one or two more `DocumentType` values + prefixes. |
| O-4 | Do the `SPK` / `WOL` printed documents need a **signature block**? | No signature infrastructure exists anywhere today. |
| O-5 | **Device identity materialization** — snapshot vs `Device` master; ON_SITE capture flow; IN_LAB receiving step. | §11. The key architectural question for the phase after Work Order. |
| O-6 | Does the WO state machine need **IN_LAB-specific milestones** (equipment received) or **partial ON_SITE completion** tracked on the WO itself? | §9. Recommendation: defer to the CalibrationJob phase. |
| O-7 | Does **cancellation** need `cancelledAt` / `cancelledBy` / `reason`? | §9.1. None today. |
| O-8 | Whole-unit vs `Decimal` quantity for WO / Job devices. | §10. |
| O-9 | ~~Legacy `SPK` Work Orders~~ | **RESOLVED / N/A.** No historical WO records exist. On Site stays `WORK_ORDER` / `SPK`; only In Lab (`WOL`) is added. See §0. |
| O-10 | Which **roles** may create / assign / cancel Work Orders? Currently only ADMIN has `workOrder:*`; TECHNICIAN / SUPERVISOR have nothing. | §15. |

---

## 15. RBAC snapshot (for O-10)

**[FACT]** (`packages/auth/src/access-control.ts`, `seed-role-permissions.ts`)

- Resource `workOrder` actions: `read, create, update, cancel, assign`.
- Roles (`MembershipRole`): `SUPERADMIN, ADMIN, SUPERVISOR, TECHNICIAN, FINANCE,
  CUSTOMER, CUSTOMER_SERVICE`.
- Seeded `workOrder` grants: **ADMIN only** (read / create / update / cancel /
  assign). SUPERVISOR, TECHNICIAN, FINANCE, CUSTOMER_SERVICE have **no**
  `workOrder` permission. SUPERADMIN bypasses all checks.
- `calibrationJob` permissions exist but are granted to **no role**.
- API guard: `CompanyRoleGuard` + `@RequirePermission("workOrder","<action>")` on
  every endpoint; `companyId` from the auth context.

**[OPEN]** The Work Order phase should decide whether TECHNICIAN needs
`workOrder:read` (to see assigned WOs / print `SPK` / `WOL`), whether SUPERVISOR needs
`workOrder:create` / `assign`, and whether there is any mode-specific
authorization (unlikely — recommend not).

---

## 16. Recommended implementation phases

> Sequencing only. No work starts until the business answers O-1..O-5.

- **Phase WO-1 — Document identity split (small, self-contained).** Per §0.G:
  add **one** `DocumentType` value `WORK_ORDER_SEND_TO_LAB` + `WOL` prefix;
  On Site keeps `WORK_ORDER` / `SPK`; switch `work-orders.service.ts` to pick by
  `serviceMode`; lock `serviceMode` after create; branch the PDF title / label;
  "In Lab" UI label. Tests: `SPK` and `WOL` sequences increment independently,
  tenant isolation, `serviceMode` immutable.
- **Phase WO-2 — RBAC + portal polish.** Decide and grant TECHNICIAN
  `workOrder:read` and any SUPERVISOR grants; portal shows On Site / In Lab
  badges and the correct `SPK` / `WOL` number labels.
- **Phase WO-3 — Decide & build Document B (blocked on O-1..O-4).** Business
  workshop to name the second document per mode, its numbering, signature,
  copies. Then model it (likely a child entity of `WorkOrder`) and its PDF.
- **Phase WO-4 — Device identity + receiving (blocked on O-5).**
  IN_LAB equipment-receiving record; ON_SITE per-unit capture. This is the bridge
  to `CalibrationJob`.
- **Phase CJ-1 — CalibrationJob creation** (separate audit): resolve the
  `CalibrationJob.deviceId` hard-FK blocker, then build job creation from
  `WorkOrderItem` × captured device identities.

---

## 17. Final verdict

- **Work Order numbering split (SPK / WOL): READY.** Per §0 the existing
  `DocumentNumberService` supports it with **one** additive enum value and one
  prefix-map entry (`WOL`); On Site stays on `WORK_ORDER` / `SPK` — no new
  numbering logic, no sequence-table change, no data migration.
- **Work Order document set (all four documents): NOT READY.** Document B for
  both modes is entirely undefined in the repository (O-1..O-4).
- **CalibrationJob / device materialization: NOT READY.** The hard FK to the
  `Device` master conflicts with the "no Device master as business source"
  decision (O-5); no creation path exists.

Proceed with **Phase WO-1** independently; hold Phases WO-3 / WO-4 / CJ-1 for the
open business decisions.

---

## Appendix — key source references

| Concern | File |
|---|---|
| Prisma schema | `packages/db/prisma/schema.prisma` |
| Document numbering service | `packages/db/src/document-number/document-number.service.ts` |
| Prefix map | `packages/db/src/document-number/document-type-prefix.ts` |
| Table map | `packages/db/src/document-number/document-type-table.ts` |
| Number format | `packages/db/src/document-number/format-document-number.ts` |
| Sequence model | `DocumentNumberSequence` in `schema.prisma` |
| Work Order backend | `apps/api/src/modules/work-orders/work-orders.service.ts`, `work-orders.controller.ts` |
| Work Order PDF | `apps/api/src/modules/work-orders/work-order-pdf.ts` |
| Work Order portal UI | `apps/portal/src/app/management/work-orders/` |
| Shared Zod schemas | `packages/shared/src/schemas/index.ts` |
| RBAC | `packages/auth/src/access-control.ts`, `packages/db/prisma/seed-role-permissions.ts` |
| Prior locked-domain audit | `docs/claude/plans/Calibration-management/work-order/REFINED-READ-ONLY AUDIT — FINAL WORKORDER DOMAIN.md` |
