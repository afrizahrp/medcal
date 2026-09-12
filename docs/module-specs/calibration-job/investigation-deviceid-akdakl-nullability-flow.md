# Investigation: DeviceId/AKD-AKL Nullability — Excel Import to WorkOrder IN_PROGRESS

Read-only analysis. Branch `main` @ `7847e74`. Date 2026-09-02. No schema/code/migration
changes were made; a live read-only Prisma `count`/`groupBy` was run against `pkmdb` (Step 5).

---

## Summary Verdict

**This is a latent/architectural gap, not an active bug today.** The `deviceId` and `akdAkl`
values captured on `CalibrationRequestItem` at requisition intake are **never propagated
downstream** — not to `QuotationItem`, not to `PurchaseOrderItem`, not to `WorkOrderItem`,
and there is no code anywhere that creates a `CalibrationJob` (the `WorkOrder → IN_PROGRESS`
transition in `work-orders.service.ts::start()` does not read, validate, or copy either
field, and does not create jobs). So a NULL `deviceId`/`akdAkl` cannot currently break any
running code path. The customer-declared `deviceId` string *is* surfaced read-through (via
relation joins) on the Quotation / PO / WorkOrder portal screens, always rendered as `"—"`
when null, with **no warning and no blocking validation** anywhere. `akdAkl` is not displayed
on any screen downstream of the calibration-request module at all.

The gap becomes an **active** problem the moment `CalibrationJob` creation is built, because
`CalibrationJob.deviceId` is `String` (NOT NULL) and there is currently no upstream source
that is guaranteed to be populated — and the live data (Step 5: 9/10 request items have NULL
`deviceId`, 10/10 have NULL `akdAkl`) shows the "missing identity" state is the **common
path**, not an edge case. Prior-audit Decision #1 (deviceId nullability + pending-identity
model) and Decision #2 (job derivation source + link back to `CalibrationRequestItem`) are
therefore both still unresolved and both are genuinely blocking.

---

## Step 1 — Excel Import Handling

**Import code:** `apps/api/src/modules/calibration-requests/calibration-request-import.service.ts`
(NestJS service `CalibrationRequestImportService`, `preview()` + `confirm()`), driven by
`calibration-requests.controller.ts`. Template generator:
`apps/api/src/generate-requisition-template.ts`.

### `deviceId`

- Header aliases: `"device id"`, `"deviceid"`, `"id device"`
  (`calibration-request-import.service.ts:40`).
- Parsing: `parseDeviceId()` (`:116-126`):
  - Empty cell → `{ deviceId: null }` — **silently accepted, no error, no warning.**
  - Only rejection: a value containing `,` `;` newline/CR →
    `"Satu baris hanya boleh memiliki satu Device ID"` (`:123`). This is a
    "one device id per row" guard, **not** a presence check.
- Preview row emits `deviceId: parsed.deviceId` (may be `null`) with `warnings: []`
  (`:502`, `:512`). NULL `deviceId` produces **no** entry in `warnings` or `errors`.
- `confirm()` (`:544-554`): `...(row.deviceId ? { deviceId: row.deviceId } : {})` — a
  null/empty value is simply omitted from the create payload.
- The `confirm` Zod row schema `calibrationRequestImportConfirmRowSchema`
  (`packages/shared/src/schemas/index.ts:1474-1491`): `deviceId: z.string().trim().max(120).optional()`
  — **optional, no `.min(1)`, no refinement.**

### `akdAkl`

- Header aliases: `"akd/akl/nie"` and ~10 spelling variants incl. `"nie"`,
  `"nomor izin edar"` (`:41-52`).
- Parsing: `parseAkdAkl()` (`:130-140`):
  - Empty cell → `{ akdAkl: null }` — **silently accepted.**
  - Only rejection: length > 120 chars → `"AKD/AKL/NIE maksimal 120 karakter"`.
- Explicit design comment at `:26-33`: empty → `akdAkl NULL / akdAklDeclaration NOT_PROVIDED`;
  non-empty → `CUSTOMER_PROVIDED`. "This is NOT the final per-physical-device verified value;
  the Technician resolves that later at CalibrationJob."
- `confirm()` (`:553`): `...(row.akdAkl ? { akdAkl: row.akdAkl } : {})` — omitted when empty.
- The import path **never sets `akdAklDeclaration`** explicitly; it relies on the create
  service default (see Step 2).

### Downstream flag / marker on a NULL row

**None.** A row with NULL `deviceId` and/or NULL `akdAkl` proceeds through `preview` →
`confirm` → `CalibrationRequestItem` **identically** to a fully-populated row. There is no
`incomplete` / `needsReview` / `identityPending` field on `CalibrationRequestItem`
(schema.prisma:1333-1375 — no such column exists), and none is synthesised. The only
per-row gating in `preview` is: `customerDeviceName` empty → error `"Nama Alat kosong"`;
`qty` missing/invalid → error `"Qty wajib diisi"` / `"Qty harus bilangan bulat positif"`;
DeviceType match failure → `unmatched` (still importable). `deviceId`/`akdAkl` never
contribute to `rowsWithWarnings` or `rowsWithErrors` in the summary
(`:517-531`).

### Server-side create validation (shared by import + manual entry)

`calibrationRequestItemInputSchema` (`packages/shared/src/schemas/index.ts:291-343`):

- `deviceId: z.string().trim().max(120).optional()` (`:303`) — optional, doc comment:
  *"a missing customer Device ID is a valid business state and must be stored as NULL,
  never a placeholder."*
- `akdAkl: z.string().trim().max(120).optional().transform(v => v ? v : undefined)` (`:317-322`).
- `akdAklDeclaration: z.enum(...).optional()` (`:324`).
- `superRefine` (`:327-342`) only enforces **consistency** between `akdAkl` and
  `akdAklDeclaration` (can't declare `CUSTOMER_PROVIDED` with no value; can't supply a value
  with a non-`CUSTOMER_PROVIDED` status). It never requires either field to be present.

`CalibrationRequestsService.create()` (`apps/api/src/modules/calibration-requests/calibration-requests.service.ts:107-121`
and the update path `:253-257`):
```
deviceId: item.deviceId || null,
akdAkl: item.akdAkl || null,
akdAklDeclaration: item.akdAklDeclaration ?? (item.akdAkl ? "CUSTOMER_PROVIDED" : "NOT_PROVIDED"),
```
NULL is the accepted, first-class stored state. `akdAklDeclaration` defaults to
`NOT_PROVIDED` for every import row (import never passes it).

---

## Step 2 — Field Propagation Through the Commercial Chain

Live schema re-read (`packages/db/prisma/schema.prisma`):

| Model | `deviceId` | `akdAkl` / declaration | Link back to `CalibrationRequestItem` |
|---|---|---|---|
| `CalibrationRequestItem` (`:1333`) | `String?` — customer-declared free text (`:1345-1350`) | `akdAkl String?` (`:1363`), `akdAklDeclaration AkdAklDeclaration @default(NOT_PROVIDED)` (`:1365`) | — (origin) |
| `QuotationItem` (`:1467`) | `deviceId String?` (`:1471`) — **FK to `Device` master** (`device Device? @relation`, `:1486`), *not* the customer string | **absent** | `requestItemId String?` (`:1472`) → `requestItem CalibrationRequestItem? @relation` (`:1487`) ✅ |
| `PurchaseOrderItem` (`:1530`) | `deviceId String?` (`:1535`) — **FK to `Device` master** (`onDelete: SetNull`, `:1548`) | **absent** | only indirectly, via `quotationItemId` → `QuotationItem.requestItemId` |
| `WorkOrderItem` (`:1604`) | **absent** — fields are `description String`, `qty Decimal`, `purchaseOrderItemId String` only (`:1605-1611`) | **absent** | only via `purchaseOrderItemId` → `PurchaseOrderItem` → `QuotationItem.requestItemId` |
| `CalibrationJob` (`:1735`) | `deviceId String` **NOT NULL** (`:1740`) — FK to `Device` master (`:1749`), `@@unique([workOrderId, deviceId])` (`:1757`) | **absent** — no `akdAkl`, no identity snapshot | `purchaseOrderItemId String?` (`:1739`, `onDelete: SetNull`); **no** `requestItemId`, **no** `workOrderItemId`, **no** `workOrderEquipmentId` |

### Findings (stated as fact, not assumption)

1. **The customer-declared `CalibrationRequestItem.deviceId` string is never copied onto any
   downstream row.** `QuotationItem.deviceId` and `PurchaseOrderItem.deviceId` are
   *different columns with different semantics* — nullable **foreign keys to the `Device`
   master table**, not the free-text customer identifier. Quotation generation explicitly
   sets `deviceId: null` for every generated line
   (`apps/api/src/modules/quotations/quotations.service.ts:342`); a `Device` FK can only be
   attached later via an explicit override input
   (`quotations.service.ts:196-214`, `:271-272`, validated by `assertDevicesBelongToCustomer`).
2. **`CalibrationRequestItem.akdAkl` / `akdAklDeclaration` are never carried forward
   anywhere.** A repo-wide search for `akdAkl` outside the `calibration-requests` module
   returns only `apps/api/src/generate-requisition-template.ts` (the blank Excel template).
   No quotation, PO, work-order, or job code — service, schema, or Zod — references it.
3. **`WorkOrderItem` carries no device identity of any kind** (prior audit's
   "description + qty only" is **confirmed correct** against the live schema — it also has
   `companyId`, `purchaseOrderItemId`, `createdAt`, but no identity fields).
4. **The only durable link from a `WorkOrder`-side row back to the original customer
   declaration is the chain**
   `WorkOrderItem.purchaseOrderItemId → PurchaseOrderItem.quotationItemId →
   QuotationItem.requestItemId → CalibrationRequestItem`. `QuotationItem.requestItemId` is
   **nullable**, so even this chain is not guaranteed. `CalibrationJob` has **no** direct or
   indirect FK to `CalibrationRequestItem` (only the optional `purchaseOrderItemId`).

**Consequence:** the null-handling problem is, today, "solved" only in the trivial sense that
**the data does not flow downstream at all.** Nothing consumes it, so nothing can choke on a
null. There is no snapshot, no propagation, and no reconstruction path that is guaranteed
non-null.

---

## Step 3 — WorkOrder IN_PROGRESS Transition

`apps/api/src/modules/work-orders/work-orders.service.ts`.

- Transition map (`:37-40`): `ASSIGNED → [IN_PROGRESS, CANCELLED]`,
  `IN_PROGRESS → [DONE, CANCELLED]`. Enforced by `assertTransition()` (`:140-150`).
- `start()` (`:473-508`) is the **only** code that moves a WorkOrder to `IN_PROGRESS`.
  Full behaviour:
  1. `assertTransition(existing.status, "IN_PROGRESS")` (`:475`).
  2. Reject if `existing.assignments.length === 0` — "Work order has no assigned technician"
     (`:477-484`).
  3. For `ON_SITE` with `equipmentConfirmedAt === null`: resolve required equipment types
     from the work order's device types; if any equipment is selected or required, reject
     with `WORK_ORDER_EQUIPMENT_NOT_CONFIRMED` (`:490-501`).
  4. `prisma.workOrder.update({ where: { id }, data: { status: "IN_PROGRESS" }, ... })`
     (`:503-507`).
- **No reference to `deviceId`, `akdAkl`, `Device`, or `CalibrationRequestItem` anywhere in
  `start()`.** Confirmed by direct read. (The only `requestItem` usage in the file is at
  `:57` / `:589` / `:609` — building the *equipment-type* proposal from
  `quotationItem.requestItem.deviceTypeId`, unrelated to device identity.)
- **No `CalibrationJob` creation** — not in `start()`, not anywhere in the file. `grep -n
  "calibrationJob\|CalibrationJob"` over `work-orders.service.ts` → **zero matches**. The
  prior audit's finding is **confirmed still true**; the negative tests remain at
  `work-orders.service.test.ts:552` (`"does not create CalibrationJob rows"`) and `:726`
  (`"allows IN_PROGRESS → DONE without creating CalibrationJob"`).
- Repo-wide, the only non-test `prisma.calibrationJob.*` call is a delete-guard `count` in
  `apps/api/src/modules/devices/devices.service.ts:192`. Nothing creates jobs.

**Distinction for the verdict:** "what happens to a null `deviceId`/`akdAkl` at WorkOrder
IN_PROGRESS" is currently **hypothetical / architectural**. There is no job-creation code to
fail. This is *"will be a problem when job creation is built"*, **not** *"is failing today."*

---

## Step 4 — Existing Touchpoints Where NULL Could Surface Today

### 4.1 Portal UI display / warn / block

| Screen | `deviceId` (customer string) | `akdAkl` | Warn / block on NULL? |
|---|---|---|---|
| Calibration Requests (`apps/portal/src/app/management/calibration-requests/`) | Shown; editable; `calibration-requests-page-client.tsx:98` literally labels it **"Device ID: opsional"** | Shown with declaration dropdown; `calibration-requests-ui.tsx:61-68`, label `NOT_PROVIDED: "Belum diberikan customer"` | **No.** Both explicitly optional. |
| Quotations (`quotations-ui.tsx`, `quotation-form-fields.tsx`) | Read-through from `requestItem.deviceId`; `quotations-ui.tsx:438` `deviceIdLabel: item.deviceId ?? "—"`, `:450` `item.requestItem?.deviceId ?? "—"`; rendered `:191` | Not displayed | **No.** Renders `"—"`. |
| Purchase Orders (`purchase-orders-ui.tsx`) | Read-through `:148` `item.quotationItem?.requestItem?.deviceId ?? item.deviceId`, `:161`; rendered `:384-385` only `{item.deviceId ? (...) : null}` | Not displayed | **No.** Absent block when null. |
| Work Orders (`work-orders-ui.tsx`, `work-order-form-utils.ts`) | `deviceIdentifierFromItem()` (`work-order-form-utils.ts:180-195`): `requestItem?.deviceId ?? device?.serialNumber ?? purchaseOrderItem?.deviceId ?? …`; rendered `work-orders-ui.tsx:394` as `{device.identifier ?? "—"}` | Not displayed | **No.** Renders `"—"`. `start()`/assign UI never checks identity. |

`akdAkl` has **zero** presence in any portal screen outside the calibration-request module
(confirmed by grep). The customer portal / `apps/web-api` has no `akdAkl` or device-identity
gating either.

### 4.2 Validation rejecting NULL at an existing transition

**None.** Checked:

- CalibrationRequest create/submit — item schema `deviceId`/`akdAkl` optional
  (`schemas/index.ts:303`, `:317`); `superRefine` only checks akdAkl↔declaration consistency.
- Quotation generation/send — `quotations.service.ts` sets `deviceId: null` by default
  (`:342`); `send()` blocks only on `pricePending` (no applicable price), never on identity.
- PurchaseOrder create/confirm — `deviceId` is an optional `Device` FK; no presence check.
- WorkOrder create — derived 1:1 from PO items (`WorkOrderItem` has no identity field to
  validate).
- WorkOrder start (→ IN_PROGRESS) — Step 3: technician + equipment checks only.

No Zod schema in `packages/shared/src/schemas/index.ts` applies `.min(1)` or a required
refinement to any customer device-identity or AKD/AKL field at any lifecycle stage.

### 4.3 Reporting / filtering for "which items have missing device identity"

**Does not exist — explicit gap.** There is:

- No list view, filter, column, or dashboard tile for "missing device identity" /
  "missing AKD/AKL" on `CalibrationRequestItem` or any downstream entity.
- No `where: { deviceId: null }` / `akdAkl: null` query anywhere in the API
  (grep: the only such filter in the codebase is the one this investigation ran ad hoc).
- No status/badge on the CalibrationRequest list distinguishing "fully identified" from
  "identity pending".
- The import `preview` summary reports `rowsWithWarnings` / `rowsWithErrors` but, per Step 1,
  a null `deviceId`/`akdAkl` contributes to **neither**.

This is distinct from the CalibrationJob-specific gaps in the prior audit: even *before* any
job runtime exists, an ADMIN/SUPERVISOR **cannot currently answer "which requisitions are
missing device identity"** from any screen or report.

---

## Step 5 — Relevance to Prior Audit's P0 Decisions #1 and #2

**A live read-only query WAS run** (Prisma `count` / `groupBy`, no writes) against the local
`pkmdb` database (`postgresql://…@localhost:5432/pkmdb`), via a temporary throwaway script
that was deleted immediately after. Results:

| Metric | Value |
|---|---|
| `CalibrationRequest` rows | 5 |
| `CalibrationRequestItem` rows | 10 |
| Items with `deviceId IS NULL` | **9 / 10 (90%)** |
| Items with `akdAkl IS NULL` | **10 / 10 (100%)** |
| `akdAklDeclaration` breakdown | `NOT_PROVIDED`: 10 (100%) |

**Caveat:** this is a small dev/seed dataset (10 items), not a production sample — treat the
percentages as directional, not statistically firm. But the direction is unambiguous and
consistent with the design intent stated in code comments
(`calibration-request-import.service.ts:26-33`, `schemas/index.ts:299-315`,
`schema.prisma:1357-1362`): the customer usually does **not** know `deviceId` and almost
never knows `akdAkl` at requisition time.

### Decision #1 — `CalibrationJob.deviceId` nullability + pending-identity model

New information: **strongly reinforces that a "pending identity" state is the primary path,
not an edge case.** With ~90–100% of intake rows lacking identity, a design that requires
`CalibrationJob.deviceId` to be non-null at creation would force one of:
(a) job creation blocked for almost every work order until a technician/planner manually
resolves identity, or (b) creation of placeholder `Device` rows (which
`schemas/index.ts:301` and `schema.prisma:1347` explicitly prohibit for the *declared*
value, and which would pollute the `Device` master). The nullable-`deviceId` +
explicit-pending-state option is effectively mandatory given the data shape.

### Decision #2 — which upstream entity CalibrationJobs derive from + link back to `CalibrationRequestItem`

New information: **the only surviving link to the customer declaration is a fragile
4-hop nullable chain** (`WorkOrderItem → PurchaseOrderItem → QuotationItem.requestItemId?
→ CalibrationRequestItem`). `QuotationItem.requestItemId` is nullable and
`CalibrationJob` has no FK into this chain except optional `purchaseOrderItemId`. If jobs
are to show "what the customer declared" (serial, AKD/AKL/NIE) next to "what the technician
observed" — a prior-audit requirement — the derivation design must **either** add an explicit
`calibrationRequestItemId` (or a snapshot of the declared fields) onto `CalibrationJob` (or
its identity record), **or** formally accept that the declared value is only reachable
through the nullable chain and handle its absence. `WorkOrderEquipment` (the reference
equipment carried to site) is **not** a candidate source — it has no relation to the
customer's device and no `CalibrationJob` FK.

---

## Open Questions for Design Discussion (not implemented)

1. **Where does the customer-declared identity get snapshotted for the job?** On
   `CalibrationJob` directly, on a new identity/readiness sub-record, or reconstructed at
   read time through the nullable `requestItemId` chain? (Reconstruction is unsafe:
   `QuotationItem.requestItemId` is nullable and quote lines can be merged/split.)
2. **Should `CalibrationJob.deviceId` become nullable, or should a `Device` master row be
   required before a job exists** (with an explicit "unidentified device" placeholder policy
   that does not violate the no-placeholder rule on `CalibrationRequestItem`)?
3. **Fan-out cardinality vs. `qty`.** `CalibrationRequestItem.qty` is an aggregate
   (`schema.prisma:1351-1356`); one row can represent N physical units with **one** declared
   `deviceId` string (or none). How does N-unit fan-out into N jobs reconcile with a single
   or absent declared identifier? Where is per-unit identity first captured?
4. **Does `akdAkl` need a propagation path at all before the Technician App,** or is it
   acceptable that it stays solely on `CalibrationRequestItem` until a job-side verified
   field is designed? (Currently it is completely stranded at intake.)
5. **Should intake / import mark rows as "identity incomplete"** (new field or derived
   status) so ADMIN/SUPERVISOR can triage before work-order planning — independent of the
   CalibrationJob work? This is a standalone gap (Step 4.3) that could be closed earlier.
6. **Is a "missing device identity" report/filter wanted on the CalibrationRequest list**
   now, given 90%+ NULL rates make the requisition→WO flow effectively blind to identity
   readiness today?

---

## Confirmation

No schema, code, migration, or documentation files were modified. The only file created is
this report (a new directory `docs/claude/plans/Calibration-management/` was created to hold
it, as the specified output path required). A temporary query script
(`packages/db/_qtmp.cjs`) was created and deleted within the same session; `git status`
shows no residual changes from it. This task was diagnostic/advisory only — no fix or schema
change was implemented.
