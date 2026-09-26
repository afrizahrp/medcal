# CalibrationJob.deviceId Propagation Audit

Read-only audit. No code, schema, migrations, tests, or seeds were modified while
producing this report.

## 1. Executive Summary

**No propagation bug was found.** There is no path in the current codebase where a
Device is unambiguously known upstream (at Quotation/PO level) for a specific physical
unit and `CalibrationJob.deviceId` ends up NULL despite that.

The only mechanism that creates `CalibrationJob` rows —
`WorkOrdersService.fanOutCalibrationJobs()` in
`apps/api/src/modules/work-orders/work-orders.service.ts` (lines 599–648) — already
propagates `PurchaseOrderItem.deviceId` into `CalibrationJob.deviceId` for qty=1 lines
(the only case where the propagation is unambiguous). This propagation logic is
**already committed** (commit `bcab526 "Fix deviceId mismatch ux and data model"`), not
part of the current uncommitted working-tree diff, and the file has zero uncommitted
changes (`git status --short` on it is empty).

For qty>1 lines, `PurchaseOrderItem.deviceId` names exactly one Device, but the line
fans out into N `CalibrationJob` rows (one per physical unit) — propagating that single
FK to all N jobs would misassign one device identity to multiple units and would trip
`@@unique([workOrderId, deviceId])`. The code deliberately leaves `deviceId = null` for
every job in that case, with device identity resolved per-unit later via Tech-PWA
Device Lookup (`selectDevice`) or Identity Correction. This is a documented, deliberate
design decision, not a bug.

Separately, a Quotation/PO/WorkOrder can legitimately exist with **no Device
determined at all** (customer requests by DeviceType only; `QuotationItem.deviceId` is
nullable and defaults to `null` on server-generated rows). That is also a legitimate
source of `CalibrationJob.deviceId = NULL`, not a propagation bug.

## 2. Propagation Chain Schema

All field references are from `packages/db/prisma/schema.prisma` (working tree).

- **QuotationItem** (line 1767 area):
  ```
  model QuotationItem {
    ...
    deviceId       String?
    ...
    device             Device?                 @relation(fields: [deviceId], references: [id])
  }
  ```
  `deviceId` is nullable. Server-generated rows (from a CalibrationRequest) always start
  with `deviceId: null` (see §3, Path 1). It can be set later via manual PATCH/revise
  input (`item.deviceId`), validated against the customer via
  `assertDevicesBelongToCustomer` (quotations.service.ts lines 922–927).

- **PurchaseOrderItem** (line 1839 area):
  ```
  model PurchaseOrderItem {
    ...
    deviceId        String?
    ...
    device          Device?          @relation(fields: [deviceId], references: [id], onDelete: SetNull)
  }
  ```
  Nullable, copied verbatim from the source `QuotationItem.deviceId` at both PO-create
  and PO-revise time (see §3, Path 2/3).

- **WorkOrder / WorkOrderItem** (lines 1868, 1933): neither model carries a `deviceId`
  field. `WorkOrderItem` only links back to `PurchaseOrderItem` via
  `purchaseOrderItemId`; device identity is not duplicated onto the WorkOrder level at
  all — it is read through the PO chain at fan-out time.

- **CalibrationJob** (line 2306 area):
  ```
  model CalibrationJob {
    ...
    workOrderId              String
    purchaseOrderItemId      String?
    deviceId                 String?
    ...
  }
  ```
  The schema's own doc-comment on `deviceId` (lines 2311–2316) states: *"NULLABLE:
  identity is normally unknown until on-site verification, and the WorkOrder proceeds
  to IN_PROGRESS regardless. A NULL deviceId is a normal pending state, not an error."*
  `@@unique([workOrderId, deviceId])` binds only once `deviceId` is actually set
  (Postgres treats NULLs as distinct), which is exactly why qty>1 fan-out cannot safely
  set the same deviceId on multiple sibling jobs.

## 3. CalibrationJob Creation Paths

A repo-wide search (`grep -rln "calibrationJob.create(\|calibrationJob.createMany("`
across all of `apps/**` and `packages/**`) found **exactly one** file that ever creates
a `CalibrationJob` row: `apps/api/src/modules/work-orders/work-orders.service.ts`. There
is no separate admin/manual/import/legacy creation endpoint, and no seed file inserts
`CalibrationJob` rows directly — the test factory used by
`certificate.service.test.ts` (`makeJob`, lines 133–197) drives the real service chain
(CalibrationRequest → Quotation → PurchaseOrder → WorkOrder → `start()` →
`fanOutCalibrationJobs()`) rather than inserting rows directly, and only manually sets
`deviceId` afterward via `prisma.calibrationJob.update(...)` when the test explicitly
wants a "device already known" fixture (lines 183–194) — this is a `withDevice: true`
test convenience, not evidence of a second production creation path.

### Path 1 — `WorkOrdersService.start()` → `fanOutCalibrationJobs()` (the only path)

File: `apps/api/src/modules/work-orders/work-orders.service.ts`, lines 516–573
(`start()`) and 599–648 (`fanOutCalibrationJobs()`).

- Device known upstream? **Sometimes** — only if a `QuotationItem`/`PurchaseOrderItem`
  for that line had `deviceId` set (either the customer named a specific Device, or it
  was set via manual PATCH).
- deviceId actually propagated? **Yes, for qty=1 lines.** See §4 for the exact code.
  For qty>1 lines, deliberately left `null` (ambiguous — one FK, N units).
- Verdict: **OK.** No bug — propagation is implemented for the only case where it is
  well-defined; the qty>1 case is a legitimate, documented "N/A — cannot be
  unambiguously known per-unit" state, not a bug.

### Path 2 — PurchaseOrder creation copies Quotation's device

File: `apps/api/src/modules/purchase-orders/purchase-orders.service.ts`, lines 236–250:
```ts
await tx.purchaseOrderItem.createMany({
  data: quotation.items.map((item) => ({
    companyId,
    purchaseOrderId: purchaseOrder.id,
    quotationItemId: item.id,
    deviceId: item.deviceId,
    ...
  })),
});
```
- Device known upstream (at Quotation)? Possibly.
- Propagated to PurchaseOrderItem? **Yes**, verbatim copy.
- Verdict: **OK** (feeds Path 1 correctly).

### Path 3 — PurchaseOrder revise() copies device for both retained and new items

File: `apps/api/src/modules/purchase-orders/purchase-orders.service.ts`, lines 540–559
(history snapshot copies `item.deviceId`) and lines 578–595 (new
`PurchaseOrderItem.createMany` for newly-active Quotation scope also copies
`item.deviceId`).
- Verdict: **OK** — same propagation as Path 2, applied consistently across revisions.

### Path 4 — Quotation generation from CalibrationRequest (device intentionally unknown)

File: `apps/api/src/modules/quotations/quotations.service.ts`,
`buildGeneratedRows()`, line 416:
```ts
rows.push({
  ...
  deviceId: null,
  ...
});
```
- Device known upstream? **No — by design.** A CalibrationRequest is taken by
  DeviceType, not by a specific Device instance; `deviceId: null` is hard-coded for
  every server-generated line.
- Verdict: **N/A — legitimately unknown.** Not a bug; this is the normal starting
  state. A user may later set `QuotationItem.deviceId` via PATCH (see §2), at which
  point Paths 2/3 pick it up.

### Path 5 — Tech-PWA Device Lookup (`selectDevice`)

File: `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts`, lines
1357–1402. Does not *create* a CalibrationJob but is the other writer of
`CalibrationJob.deviceId` post-creation. See §5 for full detail — it only fires when
`deviceId` is still `null`, so it cannot itself cause a "known upstream but null" bug;
if anything it is a bugfix mechanism for the null state.

### Path 6 — Identity Correction (BAI)

Per the task's background (confirmed correct and out of scope to re-audit): BAI writes
only `technicianObserved*` fields on `CalibrationJob`, never `deviceId`. No creation
path here either.

## 4. fanOutCalibrationJobs() Deep Dive

File: `apps/api/src/modules/work-orders/work-orders.service.ts`, lines 599–648.

```ts
private async fanOutCalibrationJobs(
  tx: Prisma.TransactionClient,
  workOrder: WorkOrderWithItems,
): Promise<void> {
  const alreadyFannedOut = await tx.calibrationJob.count({
    where: { workOrderId: workOrder.id },
  });
  if (alreadyFannedOut > 0) {
    await this.ensureKontrolAlatRows(tx, workOrder);
    return;
  }

  const rows: Prisma.CalibrationJobCreateManyInput[] = [];
  for (const item of workOrder.items) {
    const unitTotal = this.coerceFanOutQty(item.qty, item.id);
    const requestItem = item.purchaseOrderItem.quotationItem.requestItem ?? null;
    // PurchaseOrderItem.deviceId is a real FK to the Master Device already
    // identified upstream (Quotation/PO stage), not the technician's later
    // on-site verification. Only propagate it for a qty-1 line: the FK names
    // exactly one physical device, so fanning it out to every unit of a
    // qty>1 line would misassign the same device to multiple jobs and trip
    // @@unique([workOrderId, deviceId]). Ambiguous multi-unit lines stay
    // null, same as before — identity is still resolved per unit via the
    // (separate, out-of-scope-here) technician Device lookup task.
    const knownDeviceId =
      unitTotal === 1 ? (item.purchaseOrderItem.deviceId ?? null) : null;
    for (let unitOrdinal = 1; unitOrdinal <= unitTotal; unitOrdinal++) {
      rows.push({
        companyId: workOrder.companyId,
        workOrderId: workOrder.id,
        purchaseOrderItemId: item.purchaseOrderItemId,
        deviceId: knownDeviceId,
        calibrationRequestItemId: requestItem?.id ?? null,
        customerDeclaredDeviceName: requestItem?.customerDeviceName ?? null,
        customerDeclaredAkdAkl: requestItem?.akdAkl ?? null,
        unitOrdinal,
        unitTotal,
      });
    }
  }
  if (rows.length > 0) {
    await tx.calibrationJob.createMany({ data: rows });
  }
  await this.ensureKontrolAlatRows(tx, workOrder);
}
```

- **qty=1 case**: `knownDeviceId = item.purchaseOrderItem.deviceId ?? null` — the single
  `CalibrationJob` row created for this `WorkOrderItem` inherits
  `PurchaseOrderItem.deviceId` directly. If a Device was set at Quotation/PO level, it
  flows straight through to the job.
- **qty>1 case**: `knownDeviceId` is forced to `null` regardless of whether
  `PurchaseOrderItem.deviceId` is set, because one FK cannot be validly split across N
  physical units. Each of the N jobs is created with `deviceId: null`,
  `unitOrdinal` 1..N, `unitTotal` = N — device identity for each physical unit is then
  resolved individually later (Device Lookup or Identity Correction).
- **Idempotency guard** (lines 603–609): if any job already exists for the WorkOrder,
  fan-out is skipped entirely (only `ensureKontrolAlatRows` still runs) — this protects
  against double-fan-out on a concurrent `start()` race (see the `P2002` catch in
  `start()`, lines 558–572), not related to deviceId propagation.
- This logic is **already committed** in `bcab526 "Fix deviceId mismatch ux and data
  model"` — `git status --short` on this file is empty; it is not part of the current
  uncommitted working-tree diff.

## 5. Tech-PWA Device Lookup / selectDevice() Flow

**Backend**: `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts`, lines
1349–1402 (`selectDevice`). Key guards:
```ts
if (job.deviceId !== null) {
  throw new ConflictException({
    message: "This job's device has already been selected. Submit an Identity Correction BA to change it.",
    code: "CALIBRATION_JOB_DEVICE_ALREADY_SET",
    deviceId: job.deviceId,
  });
}
```
and it also validates the candidate device belongs to the job's customer
(`CALIBRATION_JOB_DEVICE_CUSTOMER_MISMATCH`) and catches a `P2002` on the
`@@unique([workOrderId, deviceId])` constraint
(`CALIBRATION_JOB_DEVICE_ALREADY_BOUND_TO_WORK_ORDER`).

Exposed at `POST /calibration-jobs/:id/select-device` via
`apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts` line 284
(`@RequirePermission("calibrationJob", "selectDevice")`), granted to `TECHNICIAN` and
`TECHNICIAN_MANAGER` in `packages/db/prisma/seed-role-permissions.ts` (lines 177, 184).

**Frontend**: `apps/tech-pwa/src/app/jobs/[id]/page.tsx`, lines 94–102:
```ts
const showDeviceLookup =
  (jobQuery.data?.deviceId ?? null) === null &&
  Boolean(capabilities?.calibrationJobSelectDevice) &&
  (jobQuery.data ? canSelectDevice(jobQuery.data) : false);
```
`canSelectDevice` (`apps/tech-pwa/src/lib/calibration/identity-gate.ts`, lines 37–39)
returns `true` whenever the job's identity gate is not locked (status not in
`SUBMITTED`/`ACCEPTED_BY_QA`).

Answers to Part B's three questions:

1. **Current usage**: Reachable and live. It renders in the job detail screen exactly
   when `deviceId` is null, the technician has the capability, and the identity gate is
   open. Not dead code.
2. **Fallback vs redundant**: It is a **fallback**, not redundant with propagation. It
   only ever becomes visible in the states fan-out leaves genuinely null — qty>1
   ambiguous lines, or lines with no Device determined anywhere upstream (walk-in/ad-hoc
   or DeviceType-only requests). Because fan-out already fills in the qty=1
   known-upstream case at creation time, `showDeviceLookup` for that case is false from
   the start (deviceId already non-null) — no overlap/redundancy between the two
   mechanisms.
3. **Overwrite behavior**: Never overwrites. `selectDevice()` throws
   `CALIBRATION_JOB_DEVICE_ALREADY_SET` if `job.deviceId !== null`; the UI additionally
   only offers the control when `deviceId` is already null. Changing an already-bound
   device requires the separate Identity Correction BA workflow (unchanged, out of
   scope here).

## 6. Certificate Schema & Migration Current State

**Working-tree schema** (`packages/db/prisma/schema.prisma`, `Certificate` model,
~line 2970):
```prisma
model Certificate {
  id                      String                   @id @default(cuid())
  companyId               String
  customerId              String
  deviceId                String?
  calibrationJobId        String                   @unique
  ...
  device         Device?              @relation(fields: [deviceId], references: [id])
  ...
}
```
This currently reads `deviceId String?` / `device Device?` — the nullable state the
prior (now-rejected) audit recommended.

**Untracked migration**
`packages/db/prisma/migrations/20260926081808_make_certificate_device_id_nullable/migration.sql`
(full contents):
```sql
-- DropForeignKey
ALTER TABLE "Certificate" DROP CONSTRAINT "Certificate_deviceId_fkey";

-- AlterTable
ALTER TABLE "Certificate" ALTER COLUMN "deviceId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "DeviceCalibrationParameter_deviceTypeId_logicalTestK_key" RENAME TO "DeviceCalibrationParameter_deviceTypeId_logicalTestKey_logi_key";
```
Note it also carries an unrelated index rename (`DeviceCalibrationParameter_...`) —
apparently swept in from a `prisma migrate dev` diff against a schema that had drifted
for another reason; this is not part of the certificate-device-identity change but is
physically inside the same migration file.

**`git status` (relevant subset)**:
```
Changes not staged for commit:
  modified:   apps/api/src/modules/calibration-jobs/certificate.service.test.ts
  modified:   apps/api/src/modules/calibration-jobs/certificate.service.ts
  modified:   apps/portal/src/app/management/calibration-jobs/[id]/page.tsx
  modified:   apps/portal/src/app/management/calibration-jobs/certificate-panel.tsx
  modified:   packages/db/prisma/schema.prisma

Untracked files:
  docs/claude/plans/Calibration-management/certificate-device-identity-comprehensive-audit.md
  docs/claude/plans/Calibration-management/certificate-device-identity-precondition-audit.md
  docs/technician-docs/measurement-results/S.638.pdf
  packages/db/prisma/migrations/20260926081808_make_certificate_device_id_nullable/
```

**`git diff HEAD` on the five named files** — full diff already captured verbatim
during this audit; summarized by file:

- `packages/db/prisma/schema.prisma`: `Certificate.deviceId String` → `String?`,
  `device Device` → `Device?` (2-line diff, shown above).
- `apps/api/src/modules/calibration-jobs/certificate.service.ts`:
  - Adds `deviceId: string | null` to the `CertificateDetail` interface and to the
    internal certificate-row type, and threads it through in `toDetail`-style mapping.
  - Removes the precondition guard in `ensureCertificate()`:
    ```ts
    if (!job.deviceId) {
      throw new ConflictException({
        code: "CERTIFICATE_DEVICE_NOT_RESOLVED",
        message: "Cannot attach a certificate before this job's device identity is resolved (deviceId is not set)",
      });
    }
    ```
    (fully deleted) and rewrites the doc-comment above `ensureCertificate` to justify
    deviceId being nullable.
- `apps/api/src/modules/calibration-jobs/certificate.service.test.ts`: replaces the test
  `"refuses to create a certificate before the job's device identity is resolved"`
  (expecting `CERTIFICATE_DEVICE_NOT_RESOLVED`) with a new test asserting the opposite —
  that upload **succeeds** with `deviceId: null` end-to-end (job, detail response, and
  persisted row).
- `apps/portal/src/app/management/calibration-jobs/certificate-panel.tsx`: removes the
  portal-side error-message mapping for `CERTIFICATE_DEVICE_NOT_RESOLVED`
  (2-line removal).
- `apps/portal/src/app/management/calibration-jobs/[id]/page.tsx`: **unrelated** —
  this is a measurement-results grid-layout/CSS change (collapsing extra replicate
  columns for single-repetition sections). It has nothing to do with
  Certificate.deviceId and is not part of the nullable-deviceId change; it should be
  evaluated/reverted independently of the certificate decision.

Nothing was changed by this audit; the above is the exact state as of `git status`/
`git diff` at investigation time.

## 7. Findings Summary Table

| Path | Device known upstream? | deviceId propagated? | Verdict |
|---|---|---|---|
| `fanOutCalibrationJobs()` qty=1 (work-orders.service.ts:623-624) | Yes, if set on PurchaseOrderItem | Yes — copied directly | OK |
| `fanOutCalibrationJobs()` qty>1 (work-orders.service.ts:623-624) | Only ambiguously (one FK, N units) | No — deliberately null | OK (N/A, documented) |
| PurchaseOrder create copies Quotation device (purchase-orders.service.ts:236-250) | Possibly | Yes — verbatim copy | OK |
| PurchaseOrder revise copies device (purchase-orders.service.ts:540-595) | Possibly | Yes — verbatim copy (retained + new items) | OK |
| Quotation generation from CalibrationRequest (quotations.service.ts:416) | No — DeviceType-only request | N/A, deviceId hard-coded null | N/A — legitimately unknown |
| Tech-PWA `selectDevice()` (calibration-jobs.service.ts:1357-1402) | N/A (post-creation fallback, not a creation path) | Sets only when currently null; never overwrites | OK — fallback, not a bug |
| Identity Correction (BAI) | N/A | Never touches deviceId (by design, confirmed correct) | OK — out of scope, unchanged |
| Seed/test factories (certificate.service.test.ts `makeJob`) | Drives real service chain; sets deviceId manually only for `withDevice: true` fixture | N/A (test convenience) | OK — not a separate production path |

No row in this table represents "Device known upstream, unambiguously, for a specific
unit, yet CalibrationJob.deviceId ends up null." No propagation bug found.

## 8. Recommended Next Steps (description only — not implemented)

1. **CalibrationJob.deviceId propagation**: No fix needed. The qty=1 propagation is
   already implemented and committed (`bcab526`). No further schema, migration, or
   service change is required for Part A.
2. **Certificate.deviceId reversion**: To restore the locked architecture (Certificate.
   deviceId required/NOT NULL FK to Device.id), the following would need to be reverted
   in a future implementation step:
   - `packages/db/prisma/schema.prisma`: revert `Certificate.deviceId` back to
     `String` (required) and `device Device` (required relation).
   - Delete the untracked migration folder
     `packages/db/prisma/migrations/20260926081808_make_certificate_device_id_nullable/`
     entirely (it was never applied via a tracked migration history entry as far as this
     read-only audit can tell from the working tree; confirm against the deployed
     database's `_prisma_migrations` table before deleting if it may already be
     applied there).
   - `apps/api/src/modules/calibration-jobs/certificate.service.ts`: restore the
     `CERTIFICATE_DEVICE_NOT_RESOLVED` guard in `ensureCertificate()` and remove the
     `deviceId` field threaded into `CertificateDetail`/mapping (or keep it as
     non-nullable `string`, matching the reverted schema).
   - `apps/api/src/modules/calibration-jobs/certificate.service.test.ts`: restore (or
     re-derive) the original test asserting `CERTIFICATE_DEVICE_NOT_RESOLVED` is thrown
     when `job.deviceId` is null.
   - `apps/portal/src/app/management/calibration-jobs/certificate-panel.tsx`: restore
     the `CERTIFICATE_DEVICE_NOT_RESOLVED` → Indonesian error-message mapping.
   - Given the qty=1 propagation fix is already in place and qty>1/no-device-upstream
     cases are legitimate `null` states resolved via Tech-PWA Device Lookup before a
     job reaches certificate-eligible status, the real precondition to re-verify (not
     implement here) is: does the certificate-issuance workflow's existing gating
     (QA/status checks) already ensure `CalibrationJob.deviceId` is non-null by the time
     a certificate can be created? That question determines whether reverting
     Certificate.deviceId to NOT NULL will re-trip `CERTIFICATE_DEVICE_NOT_RESOLVED` in
     practice, and is a decision for whoever performs the revert, not something this
     read-only audit should resolve by inspecting/changing code.
3. **Unrelated portal page.tsx diff**: The measurement-results grid CSS change in
   `apps/portal/src/app/management/calibration-jobs/[id]/page.tsx` is unrelated to the
   Certificate.deviceId question. It should be triaged separately (keep, commit, or
   revert) rather than swept up in the certificate revert.
4. **Untracked audit docs and test PDF**: `certificate-device-identity-comprehensive-
   audit.md`, `certificate-device-identity-precondition-audit.md`, and
   `docs/technician-docs/measurement-results/S.638.pdf` are untracked artifacts from
   prior work sessions; no action recommended here beyond noting their presence.
