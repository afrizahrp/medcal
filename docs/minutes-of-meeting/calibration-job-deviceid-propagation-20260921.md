# CalibrationJob.deviceId Propagation — Fix Report

## 1. Existing Source of Master Device Relationship

`CalibrationJob` is created by `fanOutCalibrationJobs()` in
[work-orders.service.ts](apps/api/src/modules/work-orders/work-orders.service.ts#L599-L638),
which iterates `WorkOrder.items` (`WorkOrderItem`). Each `WorkOrderItem` links to a
`PurchaseOrderItem`, and **`PurchaseOrderItem.deviceId` is already a real, DB-level foreign
key to `Device`** (`packages/db/prisma/schema.prisma` line 1818, `onDelete: SetNull`) — not
free text. It is populated by copying `QuotationItem.deviceId` (itself a genuine `Device` FK)
at PO creation time (`apps/api/src/modules/purchase-orders/purchase-orders.service.ts:241`).

Crucially, `workOrderInclude` — the include used everywhere `WorkOrder` is loaded, including
in fan-out — **already loads this relation**:

```ts
purchaseOrderItem: {
  include: {
    quotationItem: { include: { requestItem: { ... } } },
    device: { select: { id: true, brand: true, model: true, serialNumber: true } },
  },
},
```
(`work-orders.service.ts:56-64`)

So the Master Device, when already known upstream (Quotation/PO stage), was already sitting
on `item.purchaseOrderItem.deviceId` / `item.purchaseOrderItem.device` at the exact point
`CalibrationJob` rows are built — it just wasn't being read.

This is a distinct field from `CalibrationRequestItem.deviceId`, which the schema explicitly
documents as free-text customer input and **not** a `Device` FK — that field was never a
candidate for this propagation.

## 2. Root Cause of `deviceId` Being NULL

In `fanOutCalibrationJobs()`, every `CalibrationJob` row was built with a hardcoded literal:

```ts
rows.push({
  ...
  deviceId: null,
  ...
});
```

(`work-orders.service.ts:620`, pre-fix). The already-loaded `item.purchaseOrderItem.deviceId`
was simply never referenced — the FK value existed in memory but was discarded in favor of a
constant `null` for every job, regardless of whether the upstream Device was known.

## 3. Files Changed

- `apps/api/src/modules/work-orders/work-orders.service.ts` — fan-out now reads the known
  Device FK instead of hardcoding `null`.
- `apps/api/src/modules/work-orders/work-orders.service.test.ts` — two new tests validating
  persisted behavior, plus a `createdDeviceIds` cleanup array.

No schema, migration, seed, or UI changes were made.

## 4. Exact Propagation Path Implemented

```
Existing Master Device (Device.id)
        ↓ (copied at PO creation: purchase-orders.service.ts:241)
PurchaseOrderItem.deviceId
        ↓ (already loaded via workOrderInclude)
item.purchaseOrderItem.deviceId   [fanOutCalibrationJobs]
        ↓
CalibrationJob.deviceId
```

With one deliberate guard, added because a single `PurchaseOrderItem.deviceId` FK can only
ever name **one** physical device, while a `WorkOrderItem.qty > 1` line fans out into
multiple `CalibrationJob` rows (one per physical unit):

```ts
const knownDeviceId =
  unitTotal === 1 ? (item.purchaseOrderItem.deviceId ?? null) : null;
```

- **qty = 1** (unambiguous — the single job *is* that device): the FK is propagated.
- **qty > 1** (ambiguous — which of N units is that one known device?): stays `null`, exactly
  as before. Propagating it to every unit would (a) misassign one physical device to multiple
  jobs and (b) violate the existing `@@unique([workOrderId, deviceId])` constraint on the
  second insert. Per-unit resolution for qty > 1 lines is explicitly the separate,
  out-of-scope technician Device-lookup task.

`technicianObservedSerial`, `customerDeclaredDeviceName`, and `customerDeclaredAkdAkl` were
not touched — they remain independent snapshot fields, unrelated to this FK.

## 5. Validation Performed

Per project testing rules, verified via actual Vitest runs (not just typecheck/build), with
the real persisted `CalibrationJob.deviceId` asserted from the database — not just the return
value of a service call:

- **New tests** (`work-orders.service.test.ts`):
  - `"propagates PurchaseOrderItem.deviceId (Master Device already known upstream) to the
    qty-1 CalibrationJob.deviceId"` — creates a real `Device` row, sets it on
    `PurchaseOrderItem.deviceId`, runs `workOrdersService.start()` (which triggers fan-out),
    then re-queries `CalibrationJob` from the DB and asserts `deviceId === device.id` and
    `technicianObservedSerial === null`.
  - `"does not propagate PurchaseOrderItem.deviceId onto a qty>1 line (ambiguous — which unit
    is that device?)"` — same setup with `qty = 2`, asserts both resulting jobs persist
    `deviceId === null`.
- **Full relevant module suite**: `work-orders.service.test.ts` — 94/94 passed.
- **Related-module suite**: `calibration-jobs.service.test.ts`, `devices.service.test.ts`,
  `quotations.service.test.ts`, `purchase-orders.service.test.ts` — 279/279 passed (no
  regression in modules that read/write `CalibrationJob.deviceId` or the upstream FKs).
- **Typecheck**: `pnpm --filter @medcal/api exec tsc --noEmit` — clean, no errors.
- **Full `@medcal/api` Vitest suite**: 1293/1302 passed, 4 files / 9 tests failed —
  `contact-messages.push.test.ts`, `push-tokens/notification-dispatch.service.test.ts`
  (`push.resolvePushIconUrl is not a function`), `emails/imap-sync.service.test.ts`, and
  `whitelist/registration-origin-callers.test.ts` (Origin-header allowlist check on a
  tech-pwa page). All four are in modules unrelated to WorkOrder/CalibrationJob/Device/
  Quotation/PurchaseOrder, confirmed pre-existing (this change touched exactly the two files
  listed in §3 — `git diff --stat` confirms no other files were modified), and unaffected by
  this change's code paths.

## 6. Example — Master Device.id = CalibrationJob.deviceId

From the new test, concretely:

```
Device.create({ ..., serialNumber: "1234567", customerId: <customer> })
  → Device.id = "cly1a2b3c..."   (system-generated cuid)

PurchaseOrderItem.update({ deviceId: "cly1a2b3c..." })   // Master Device already known upstream

workOrdersService.start(...)   // triggers fanOutCalibrationJobs

CalibrationJob (qty = 1) persisted with:
  deviceId = "cly1a2b3c..."                // == Device.id ✓
  technicianObservedSerial = null          // untouched, independent ✓
```

## 7. Directly Relevant Concerns

- **No live UI currently sets this FK.** Across Portal and Tech-PWA, no picker/combobox
  today writes a real `Device.id` into `QuotationItem.deviceId` / `PurchaseOrderItem.deviceId`
  — those fields are only ever displayed read-only. So in today's actual product flow, this
  fix has no visible effect yet: it only activates once *something* upstream (a future
  admin/API path, or the separate technician Device-lookup task once it lands) sets
  `PurchaseOrderItem.deviceId`. This matches the task's own framing ("when the upstream flow
  already identifies a Master Device") and is not a defect of this fix — flagged as context,
  not implemented further, per scope.
- **qty > 1 remains unresolved by design**, per §4. This is the same limitation that existed
  before (jobs got `null`), just now scoped precisely to "still ambiguous" rather than "always
  null." Resolving it is explicitly the separate future technician Device-lookup task.
- BAI/IdentityCorrection behavior was not touched and was not re-tested beyond the existing
  suite already covering it (`calibration-jobs.service.test.ts`, unchanged, still passing).

**STATUS: IMPLEMENTED AND VERIFIED.**
