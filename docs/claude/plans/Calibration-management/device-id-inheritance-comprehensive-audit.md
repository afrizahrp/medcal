# COMPREHENSIVE AUDIT — Device ID Inheritance & Calibration Job Identity

**Status: READ-ONLY AUDIT.** No source code, Prisma schema, migration, database, seed, test, UI,
API, or other documentation was modified to produce this report. No SQL was written or executed.
No bug found below was fixed. `deviceId` was not made required or optional anywhere. Device Lookup
was not removed or altered. BAI / Identity Correction was not altered.

This report independently re-verifies, and in several places corrects or supersedes, two
pre-existing audits found already sitting in this same folder
(`calibrationjob-deviceid-propagation-audit.md`,
`certificate-device-identity-comprehensive-audit.md`,
`certificate-device-identity-precondition-audit.md`). Those covered the Quotation→PO→WorkOrder→
CalibrationJob→Certificate segment of the chain in detail; this report re-verifies their claims
against the *current* committed code (some of what they described as "in-progress working tree"
has since been abandoned, not committed — see §12), and extends the audit backward to the part of
the chain those documents did not cover: Requisition/CalibrationRequest → CalibrationRequestItem →
QuotationItem.

---

## 1. Executive Summary

**Verdict: B — DEVICE ID INHERITANCE HAS IMPLEMENTATION GAPS, but not in the sense the task's
background hypothesis assumes.**

There is no case found where a *real Device.id* known at Quotation/PO is silently dropped on the
way to `CalibrationJob.deviceId` for a qty=1 line — that propagation is implemented and tested. The
actual gap is upstream of that, and is a **naming/identity collision built into the schema itself**:

- `CalibrationRequestItem.deviceId` (the field the Requisition/CalibrationRequest stage carries) is
  **not a FK to `Device.id` at all**. It is a nullable free-text string — literally the customer's
  self-reported Serial Number (the Excel importer maps the column header "Serial No" directly onto
  it: `calibration-request-import.service.ts:53-55`). It has no `device` relation field in the
  schema, only `deviceType` (a category FK). The schema's own doc-comment says so explicitly:
  *"Customer-provided physical device identifier (free-text). Not a FK to Device... This is NOT the
  future CalibrationJob Device.id"* (`schema.prisma:1634-1638`).
- `QuotationItem.deviceId`, `PurchaseOrderItem.deviceId`, and `CalibrationJob.deviceId`, by
  contrast, **are** real FKs to `Device.id` (the master record: brand/model/serial/customer/
  deviceType, company-scoped, `cuid()` PK).
- Consequently, the quotation-generation code that turns a `CalibrationRequest` into a `Quotation`
  (`buildGeneratedRows`, `quotations.service.ts:416`) **hard-codes `deviceId: null`** for every
  line, unconditionally — it cannot do otherwise, because there is nothing at that point to
  automatically resolve a free-text Serial Number string into a `Device.id`. Whether
  `CalibrationRequestItem.deviceId` was filled in or not has **zero effect** on the generated
  `QuotationItem.deviceId`.
- The real Device.id, when it exists at all on a Quotation/PO line, is **only ever entered manually
  by staff** via the Quotation PATCH/revise endpoint (`buildItemRows`, validated by
  `assertDevicesBelongToCustomer`), never derived from the Requisition automatically.

From that point downward (QuotationItem → PurchaseOrderItem → WorkOrder/WorkOrderItem →
CalibrationJob), the two pre-existing audits' findings hold and were re-verified against current
code: PurchaseOrderItem.deviceId is copied verbatim from QuotationItem.deviceId at PO create/
revise time; WorkOrder/WorkOrderItem carry no deviceId field at all; and
`fanOutCalibrationJobs()` propagates `PurchaseOrderItem.deviceId` to `CalibrationJob.deviceId`
**only for qty=1 lines** (unambiguous — one FK, one unit), leaving it `null` for every unit of a
qty>1 line (one FK cannot be split across N physical units without misassignment). This qty=1
propagation is implemented, committed, and covered by a passing test
(`work-orders.service.test.ts:1120-1145`).

Separately, this audit found that the **Certificate.deviceId nullability change** described at
length by the two prior audits as an "already substantially implemented working-tree change" was
**never committed** and no longer exists in the working tree at all — it was superseded by a
different, actually-shipped implementation task (`certificate-management-implementation-report.md`,
commit `b0cb2b0`) that explicitly states **"SCHEMA CHANGES: NONE"**. The current, real, committed
state is: `Certificate.deviceId String` (required), `ensureCertificate()` still throws
`CERTIFICATE_DEVICE_NOT_RESOLVED` when `job.deviceId` is null, and this is actively exercised by a
passing test today. Anyone relying on the two prior audit documents' conclusion that Certificate
upload is device-identity-independent would be acting on a stale, unshipped, abandoned state — see
§12 and §13 for the full correction.

---

## 2. Current End-to-End Data Flow

```
CalibrationRequest (1 per Requisition)
  └─ CalibrationRequestItem
       .deviceId        String?  — FREE TEXT (customer Serial No / self-declared), NOT an FK
       .customerDeviceName String? — free text ("Tensimeter Digital")
       .deviceTypeId     String   — REQUIRED FK to DeviceType (category master, not a unit)
       .akdAkl           String?  — free text customer declaration
            │
            │  buildGeneratedRows() — quotations.service.ts:386-427
            │  deviceId ALWAYS hard-coded null (line 416), regardless of
            │  CalibrationRequestItem.deviceId's value
            ▼
QuotationItem
  .deviceId        String?  — REAL FK to Device.id
  .requestItemId   String?  — FK back to CalibrationRequestItem (traceability only)
       │  Manual only: PATCH/revise (buildItemRows, quotations.service.ts:331-354),
       │  validated via assertDevicesBelongToCustomer (:234-250)
       │
       │  purchase-orders.service.ts:236-250 (create) / :540-595 (revise)
       │  deviceId: item.deviceId  — verbatim copy, no re-validation
       ▼
PurchaseOrderItem
  .deviceId   String?  — REAL FK to Device.id (onDelete: SetNull)
       │
       │  No deviceId field exists on WorkOrder or WorkOrderItem at all.
       │  WorkOrderItem only stores purchaseOrderItemId; the PO chain is
       │  read back through at fan-out time.
       ▼
WorkOrder → WorkOrderItem (1:1 copy of PurchaseOrderItem, MVP)
       │
       │  fanOutCalibrationJobs() — work-orders.service.ts:599-648, called once
       │  from start() (:552), idempotency-guarded
       │
       │  unitTotal = WorkOrderItem.qty (coerced to Int)
       │  knownDeviceId = unitTotal === 1
       │                    ? (PurchaseOrderItem.deviceId ?? null)
       │                    : null                         ← qty>1 always null
       ▼
CalibrationJob × unitTotal  (unitOrdinal 1..N)
  .deviceId                  String?  — REAL FK to Device.id
  .calibrationRequestItemId  String?  — FK back to CalibrationRequestItem (traceability)
  .customerDeclaredDeviceName String? — snapshot of CalibrationRequestItem.customerDeviceName
  .customerDeclaredAkdAkl     String? — snapshot of CalibrationRequestItem.akdAkl
  .technicianObserved{Brand,Model,Serial,AkdAkl} String? — written ONLY by approved
       BAI/Identity Correction; NEVER deviceId (calibration-jobs.service.ts:1716-1721,
       comment: "CalibrationJob.deviceId is NEVER touched here")
       │
       │  Post-creation, deviceId can ALSO be set exactly once, first-time-only, by:
       │  selectDevice() — calibration-jobs.service.ts:1357-1402 (Tech-PWA Device Lookup)
       │  refuses if already non-null; customer-scoped; never overwrites
       ▼
Certificate
  .deviceId   String  — REQUIRED FK to Device.id (NOT nullable, current committed state)
       │  ensureCertificate() (certificate.service.ts:153-179) throws
       │  CERTIFICATE_DEVICE_NOT_RESOLVED if job.deviceId is null — Certificate
       │  creation is BLOCKED until CalibrationJob.deviceId resolves.
```

### 2.1 Requisition → CalibrationRequestItem (task §2)

Files: `apps/api/src/modules/calibration-requests/calibration-requests.service.ts` (manual create,
lines ~150-180; revise, lines 300-320, 510-590), `calibration-request-import.service.ts` (Excel
import, lines 51-153, 276-320, 576-626).

- `CalibrationRequestItem.deviceId` (`schema.prisma:1622-1672`) is `String?`, **not a relation
  field** — there is no `device Device? @relation(...)` on this model, only
  `deviceType DeviceType @relation(...)`. The doc-comment (lines 1634-1638) is explicit that this
  is a free-text physical identifier, "intentionally NULLABLE — a missing customer Device ID is a
  valid business state," and explicitly **not** the same thing as the eventual
  `CalibrationJob.deviceId`.
- Manual creation (`calibration-requests.service.ts:172`): `deviceId: item.deviceId || null` —
  passthrough of whatever string the caller (Portal form) supplied. No lookup against the `Device`
  table occurs.
- Excel import (`calibration-request-import.service.ts`): the column-header aliases for this field
  are **`"serial no"`, `"serial no."`**, etc. (lines 53-58) — the importer explicitly treats this
  column as a Serial Number, and `parseDeviceId()` (lines 143-153) does nothing but reject
  multi-value cells; it performs no Device-table lookup either.
- **Answer to task's Case A/B/C**: Case A ("`CalibrationRequestItem.deviceId != NULL` → always
  carried to `QuotationItem.deviceId`") is **not applicable as posed** — the two fields are
  different kinds of identity (free text vs. real FK) and the codebase never attempts to resolve
  one into the other automatically anywhere. Case B (customer gives `customerDeviceName` only,
  `deviceId` null) is exactly as common and exactly as legitimate as the case where a Serial Number
  string is given but no Device master record is looked up. Case C (Requisition "has" a Device
  master reference but Quotation loses it) **cannot occur, because the Requisition never has a
  Device master reference to begin with** — only a free-text string.

### 2.2 CalibrationRequestItem → QuotationItem (task §3)

File: `apps/api/src/modules/quotations/quotations.service.ts`.

- **Generated path** (`buildGeneratedRows`, lines 386-427, invoked from the POST-generate endpoint):
  `deviceId: null` is hard-coded on line 416 for every row, unconditionally. `qty` and
  `description` are copied/derived from the `CalibrationRequestItem`/price list; `deviceId` is not
  even read from `requestItem` in this function. This is not a bug — there is no automatic way to
  turn a free-text Serial Number into a validated `Device.id` FK without an explicit
  lookup/selection step, and no such step exists at Quotation-generation time.
- **Manual path** (`buildItemRows`, lines 331-354, used by revise/PATCH): `deviceId: item.deviceId
  ?? null` — here `item` is the caller-supplied `ItemInput` from the PATCH request body, i.e. a
  staff member can explicitly attach a real `Device.id`. This is validated by
  `assertDevicesBelongToCustomer()` (lines 234-250, called at lines 682-687 and 922-927), which
  checks the device exists, belongs to the company, and belongs to the quotation's customer —
  throwing `DEVICE_NOT_FOUND` otherwise. This is the **only** place in the entire traced chain where
  a human explicitly binds a real Device master record before Work Order stage.
- Once a Quotation is revised, both the history snapshot and any newly-created `QuotationItem` rows
  preserve `deviceId` unchanged (same file, additional call sites at lines 926, 961, 1010, 1043 —
  all copy `item.deviceId`/`deviceId ?? null` consistently, no code path was found that clears or
  re-derives it independently).
- **Invariant asked by the task** ("if `CalibrationRequestItem.deviceId` is set, is
  `QuotationItem.deviceId` always the same?"): **No — they are unrelated fields with unrelated
  values by design.** `CalibrationRequestItem.deviceId` is never read by any Quotation-item-building
  function in this codebase (confirmed by grep across `quotations.service.ts` — the only two
  functions that construct `QuotationItemRow.deviceId`, `buildGeneratedRows` and `buildItemRows`,
  never reference `requestItem.deviceId`).

### 2.3 QuotationItem → PurchaseOrderItem (task §4)

File: `apps/api/src/modules/purchase-orders/purchase-orders.service.ts`.

- **PO create** (lines 236-250): `PurchaseOrderItem.createMany` maps
  `deviceId: item.deviceId` straight from the source `QuotationItem`, one-for-one, no
  transformation, no re-validation (the Quotation was already validated at PATCH time).
- **PO revise** (lines 540-559 history snapshot copy; 578-595 new-row creation for changed scope):
  same verbatim-copy behavior, applied consistently to both retained and newly-added lines.
- **Can a PO be created without a Quotation?** No. `PurchaseOrder.quotationId` is a required
  `String` (`schema.prisma:1804`), with a mandatory `quotation Quotation @relation(...,
  onDelete: Restrict)` (line 1825). There is no independent PO-creation path in this codebase;
  every `PurchaseOrder` traces to exactly one `Quotation`.
- **Can `QuotationItem.deviceId != NULL` and `PurchaseOrderItem.deviceId` end up NULL anyway?**
  No code path was found that does this — both creation and revision are unconditional verbatim
  copies. `PurchaseOrderItem.deviceId` can independently become NULL later only via the FK's own
  `onDelete: SetNull` (line 1857) — i.e. if the underlying `Device` row is deleted — which is a
  data-lifecycle event, not a propagation bug.

### 2.4 PurchaseOrderItem → WorkOrder / WorkOrderItem (task §5)

- `WorkOrder` (`schema.prisma:1868-1929`) and `WorkOrderItem` (`schema.prisma:1933-1949`) carry
  **no `deviceId` field whatsoever**. `WorkOrderItem` is explicitly documented as an "operational
  snapshot of a PurchaseOrderItem... MVP copies every PO item 1:1" and links back only via
  `purchaseOrderItemId` (required, `onDelete: Restrict`).
  Device identity is therefore **not duplicated** onto the WorkOrder level at all; it is read back
  through the `purchaseOrderItem` relation at the one moment it matters — fan-out.
- WorkOrder creation, PO→WO conversion, and `WorkOrderItem` creation were traced
  (`work-orders.service.ts`, the `create`/`start` methods and related revision logic referenced at
  lines 1166-1170) — none of them write or need a deviceId column, since none exists on this model.
  No cloning/splitting of `WorkOrderItem` rows independent of the 1:1 PO-item copy was found.
- **Is `PurchaseOrderItem.deviceId` still available when `WorkOrderItem` is created?** Yes — it is
  never copied away or cleared; it is read live through the `purchaseOrderItem` relation, so
  whatever value exists on `PurchaseOrderItem.deviceId` at the moment `fanOutCalibrationJobs()`
  runs (which can be well after `WorkOrderItem` creation, since fan-out happens at `start()`, not
  at WO creation) is the value used.

### 2.5 WorkOrder → CalibrationJob (task §6) — CalibrationJob Creation Paths

A repo-wide search for `calibrationJob.create(`, `calibrationJob.createMany(`, and
`CalibrationJob(Unchecked)?CreateInput` was re-run for this audit and, consistent with the prior
audit, found **exactly one production creation path**:

| Path | Location | Source of `deviceId` | Result | Nullable? |
|---|---|---|---|---|
| A — `fanOutCalibrationJobs()` | `work-orders.service.ts:599-648`, called from `start()` (:552) | `PurchaseOrderItem.deviceId` via `item.purchaseOrderItem.deviceId`, gated by `unitTotal === 1` | qty=1: propagated; qty>1: `null` | Yes |

No admin/manual/import/legacy `CalibrationJob`-creation endpoint exists. Test factories
(`certificate.service.test.ts`'s `makeJob`, `work-orders.service.test.ts`'s fixtures) drive this
same real service chain rather than inserting rows directly; where a test wants a "device already
known" fixture it does so via an explicit `prisma.calibrationJob.update(...)` *after* the real
fan-out has run (a test convenience, not a second production path).

The exact, current (re-read, unchanged since the prior audit) fan-out logic:

```ts
// apps/api/src/modules/work-orders/work-orders.service.ts:599-648 (verified current)
const knownDeviceId =
  unitTotal === 1 ? (item.purchaseOrderItem.deviceId ?? null) : null;
for (let unitOrdinal = 1; unitOrdinal <= unitTotal; unitOrdinal++) {
  rows.push({
    ...
    deviceId: knownDeviceId,
    calibrationRequestItemId: requestItem?.id ?? null,
    customerDeclaredDeviceName: requestItem?.customerDeviceName ?? null,
    customerDeclaredAkdAkl: requestItem?.akdAkl ?? null,
    unitOrdinal,
    unitTotal,
  });
}
```

### 2.6 Quantity / Fan-out Behavior (task §7)

- **qty = 1**: if `PurchaseOrderItem.deviceId = dev_001`, then the single resulting
  `CalibrationJob.deviceId = dev_001` — deterministic, unambiguous (verified by test, see §7 below).
- **qty > 1** (e.g. `PurchaseOrderItem.deviceId = dev_001`, qty = 3): **all three** jobs are created
  with `deviceId = null` (not `dev_001` on any of them). Business rationale, confirmed by the
  code comment (lines 615-622 of `work-orders.service.ts`) and cross-checked against the schema's
  own comment on `@@unique([workOrderId, deviceId])`: one `PurchaseOrderItem` line names exactly one
  `Device.id`, but a qty>1 line represents N *distinct physical units* of that device type/model —
  propagating the single FK to all N would falsely claim all N units are the *same physical
  device*, and would immediately violate `@@unique([workOrderId, deviceId])` on the second
  `createMany` row (Postgres would reject the second non-null duplicate under the same
  `workOrderId`). Each physical unit's real identity is therefore deferred and resolved
  individually later, via Device Lookup (`selectDevice`) or left to physical-identity capture via
  BAI's `technicianObserved*` fields (which never touch `deviceId` at all).

---

## 3. Device Lookup Behavior (task §10)

File: `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx:135-209` (`AssignedDeviceSection`),
gated by `apps/tech-pwa/src/app/jobs/[id]/page.tsx:94-102`:

```ts
const showDeviceLookup =
  (jobQuery.data?.deviceId ?? null) === null &&
  Boolean(capabilities?.calibrationJobSelectDevice) &&
  (jobQuery.data ? canSelectDevice(jobQuery.data) : false);
```

- **When does it appear?** Only when `CalibrationJob.deviceId` is still `null` AND the identity
  gate is open (`canSelectDevice`, `apps/tech-pwa/src/lib/calibration/identity-gate.ts:37-39` —
  status not yet `SUBMITTED`/`ACCEPTED_BY_QA`). It is a live, reachable UI path, not dead code.
- **Is this normal flow or fallback?** It is the designed fallback/completion mechanism for exactly
  the states fan-out (§2.6) legitimately leaves null: qty>1 lines, and any line where no Device was
  ever bound upstream at all (Requisition device is free-text only, per §2.1-§2.2, so this is the
  *common* case, not an edge case).
- **Why can `deviceId` be null at this point?** Because of the free-text/FK identity gap
  documented in §2.1-§2.2 (no automatic resolution mechanism exists earlier in the chain) and the
  qty>1 ambiguity (§2.6) — not because of a defect in the propagation code that does exist.
- **Does it mask an upstream inheritance failure?** No evidence found of that. For the one case
  where upstream propagation is well-defined and unambiguous (qty=1, Device bound at PO), fan-out
  already sets `deviceId` before this UI is ever shown (`showDeviceLookup` is false from job
  creation in that case). The lookup only ever activates for genuinely-unresolved states.
- **Search implementation** (`calibration-jobs.service.ts:2027-2037` `getDeviceCandidates` →
  `devices.service.ts` `findAll`, lines ~111-120): searches `brand`, `model`, `serialNumber`,
  `deviceType.name`, `customer.name` via case-insensitive `contains`. `customerId` is forced
  server-side to `job.workOrder.customerId` (line 2035) and the client-facing query schema
  deliberately excludes `customerId` as an overridable parameter — confirmed no cross-customer leak
  path. Candidate rows display brand/model/deviceType/serial only, never `Device.id`/`code`
  (matches task's target UX exactly: technician never sees/enters a Device ID).
- **Binding** (`selectDevice`, `calibration-jobs.service.ts:1357-1402`): refuses
  (`CALIBRATION_JOB_DEVICE_ALREADY_SET`) if `deviceId` is already non-null (first-time-only), re-
  validates the candidate belongs to the job's customer, and catches the
  `@@unique([workOrderId, deviceId])` collision as `CALIBRATION_JOB_DEVICE_ALREADY_BOUND_TO_WORK_ORDER`.

---

## 4. BAI / Identity Correction Behavior (task §9)

Files: `calibration-jobs.service.ts` (`submitIdentityCorrection` ~1494-1608,
`decideIdentityCorrection` ~1611-1722+), `apps/tech-pwa/src/app/jobs/[id]/identity-correction/page.tsx`.

- The Tech-PWA BAI wizard is a **free-text "Serial No" input** (`page.tsx:119-141`), not a Device
  search. UI copy on the same screen states outright: *"Alat pada job ini tidak dapat diganti"*
  ("this job's device cannot be changed via this BA").
- `submitIdentityCorrection` creates an `IdentityCorrection` row (`prevSerial`/`newSerial` as plain
  strings) — no Device read or write occurs.
- `decideIdentityCorrection`'s APPROVE branch (verified current, lines 1716-1721):
  ```ts
  // CalibrationJob.deviceId is NEVER touched here: the Device assigned by
  // the WO/SPK is locked (MoM #6). A BA only corrects observed identity.
  if (correction.newBrand !== null) jobData.technicianObservedBrand = correction.newBrand;
  if (correction.newModel !== null) jobData.technicianObservedModel = correction.newModel;
  if (correction.newSerial !== null) jobData.technicianObservedSerial = correction.newSerial;
  ```
  `deviceId` does not appear anywhere in `jobData`.
- **No Device is ever created or resolved during BAI.** No `prisma.device.create`/lookup call
  exists in either method.
- `IdentityCorrection.prevDeviceId`/`newDeviceId` columns exist in the schema but are
  **HISTORICAL ONLY** — schema comment confirms they are retained solely so corrections recorded
  *before* MoM #6 keep their evidence, and are never written by current
  `submitIdentityCorrection`/`decideIdentityCorrection` code.
- **Is BAI the source of truth for `CalibrationJob.deviceId`?** No — by explicit, current,
  active design it is architecturally forbidden from touching that field at all. The source of
  truth for `deviceId` is exclusively Mechanism A: fan-out propagation (qty=1) or `selectDevice`
  (first-time-only, manual).
- **CURRENT vs HISTORICAL vs DEAD**: `assign-device` (`calibration-jobs.controller.ts:253-257`) is
  a **dead/retired** route — it now only returns a typed `410` via `assignDeviceRemoved()`, kept
  solely so an un-migrated Portal build gets a typed error instead of a 404.

---

## 5. Schema Analysis (task §11–§12)

| Field | Type | Nullable | FK / onDelete | Notes |
|---|---|---|---|---|
| `CalibrationRequestItem.deviceId` | `String?` | Yes | **None — not a relation** | Free-text customer Serial No; Excel-import-mapped |
| `QuotationItem.deviceId` | `String?` | Yes | `Device?`, default (Restrict-style, no explicit onDelete) | Real FK; manual-only write path |
| `PurchaseOrderItem.deviceId` | `String?` | Yes | `Device?`, `onDelete: SetNull` | Verbatim copy of QuotationItem.deviceId |
| `WorkOrder` / `WorkOrderItem` | — | N/A | No `deviceId` field exists | Device identity not modeled at this level |
| `CalibrationJob.deviceId` | `String?` | Yes | `Device?`, `onDelete: Restrict` | Set by fan-out (qty=1) or `selectDevice` only |
| `Certificate.deviceId` | `String` | **No** | `Device` (required relation) | Current committed state — see §12 |

**`@@unique([workOrderId, deviceId])` on CalibrationJob (task §12 questions):**
- **Purpose**: prevent the *same physical Device* from being bound to two different
  `CalibrationJob` rows under the same `WorkOrder` — i.e., one physical unit cannot accidentally be
  calibrated twice as if it were two different units within one WO/SPK.
- **Effect when `deviceId = NULL`**: Postgres treats each `NULL` as distinct for uniqueness
  purposes, so any number of jobs with `deviceId = NULL` can coexist under one `WorkOrder` without
  tripping the constraint — this is exactly what makes qty>1 fan-out with `deviceId: null` for every
  unit possible at all.
- **Still needed if `deviceId` became required?** The intent (no duplicate Device binding within
  one WO) would still be meaningful, but a required `deviceId` would force it to be resolved at
  *creation* time — which, per §2.6, is architecturally impossible for qty>1 lines with today's
  one-FK-per-line PurchaseOrderItem model without a deeper redesign (e.g. one PurchaseOrderItem row
  per physical unit instead of a qty column). That redesign is out of scope for this audit and not
  recommended without an explicit business decision (see §9).
- **Does it encode a business rule?** Yes — "no two CalibrationJobs under one WorkOrder may claim
  the same physical Device," which is the correct rule regardless of nullability.

---

## 6. NULL State Matrix (task §13)

| # | Upstream (Quotation/PO) Device | WorkOrderItem (via PO) | CalibrationJob.deviceId | Valid? | Exact code path |
|---|---|---|---|---|---|
| 1 | NULL | NULL | NULL | **Valid** | No Device ever bound (Requisition device is free-text only, never auto-resolved — §2.1-2.2); fan-out sets `null` (`knownDeviceId` evaluates PO's null) |
| 2 | NULL | NULL | resolved later (non-null) | **Valid** | `selectDevice()` sets it post-creation, first-time-only (`calibration-jobs.service.ts:1357-1402`) |
| 3 | known (qty=1) | known | NULL | **Invalid if it occurred — but does not occur.** No code path was found producing this for qty=1; `knownDeviceId = item.purchaseOrderItem.deviceId ?? null` reads it live, unconditionally, at fan-out. |
| 4 | known (qty=1) | known | known (same value) | **Valid — the normal, tested case** | `fanOutCalibrationJobs()`, verified by `work-orders.service.test.ts:1120-1145` |
| 5 | known (qty>1) | known | NULL (all N jobs) | **Valid, by design** | `unitTotal !== 1` branch forces `null` (§2.6) — ambiguity, not data loss |
| 6 | known, then Device row deleted | — | previously-bound jobs unaffected retroactively; new PO copies would see NULL | **Valid, data-lifecycle event** | `PurchaseOrderItem.device onDelete: SetNull` (schema.prisma:1857); `CalibrationJob.device onDelete: Restrict` (schema.prisma:2395) — a Device with an already-bound CalibrationJob **cannot** be deleted at all (Restrict), so case 6 for an already-created Job is actually impossible; only pre-fan-out PO/Quotation rows can be nulled out by a Device delete. |
| 7 | changed mid-flight (Quotation revised to a different Device after PO/WO already exist) | — | — | **Requires case-by-case trace, not fully exercised by tests** | PO revise (`purchase-orders.service.ts:540-595`) re-copies `item.deviceId` from the *current* QuotationItem scope at the time of revision; a WorkOrder/CalibrationJob that fanned out *before* the revision keeps its already-set `deviceId` (fan-out is idempotent and does not re-run — `alreadyFannedOut` guard, `work-orders.service.ts:603-609`). This is architecturally consistent (frozen-at-fan-out, matching the same "snapshot, don't re-read" philosophy used for `customerDeclaredDeviceName`/`customerDeclaredAkdAkl`) but **no test was found that exercises a Quotation device change after WorkOrder fan-out has already occurred** — flagged as an untested scenario, not a confirmed bug. |

No row in this matrix represents "Device unambiguously known upstream for a specific unit, yet
`CalibrationJob.deviceId` silently ends up null via a defect in the propagation code itself." Where
`deviceId` is null, it is either architecturally unavoidable (free-text Requisition stage, qty>1
ambiguity) or a normal pending state before `selectDevice()`/Device deletion.

---

## 7. Test / Fixture Evidence (task §15)

| Invariant | Test exists? | Location |
|---|---|---|
| `PurchaseOrderItem.deviceId` → `CalibrationJob.deviceId` (qty=1) | **Yes** | `work-orders.service.test.ts:1120-1145` — "propagates PurchaseOrderItem.deviceId ... to the qty-1 CalibrationJob.deviceId" |
| qty>1 lines do NOT propagate `deviceId` | **Yes** | `work-orders.service.test.ts:1147-1176` — "does not propagate PurchaseOrderItem.deviceId onto a qty>1 line" |
| qty-many fan-out produces correct `unitOrdinal`/`unitTotal`/null deviceId | **Yes** | `work-orders.service.test.ts:1084-1118` |
| `QuotationItem.deviceId` (real FK) → `PurchaseOrderItem.deviceId` at PO create/revise | **No automated test found.** `purchase-orders.service.test.ts` contains exactly one `deviceId` reference (line 175), which is a `CalibrationRequestItem`-fixture free-text value, not a manually-set real `QuotationItem.deviceId` FK being asserted through to `PurchaseOrderItem`. | — |
| `assertDevicesBelongToCustomer` (manual Quotation-item Device assignment validation) | **No automated test found** in `quotations.service.test.ts` — no `prisma.device.create` + manual `deviceId` assignment + assertion sequence exists in that file. | — |
| `CalibrationRequestItem.deviceId` free-text passthrough (Excel import "Serial No" mapping) | Indirectly covered by import-service tests (not deviceId-inheritance-specific; not itemized further here as it's a parsing test, not an inheritance test) | `calibration-request-import.service.ts` test suite (not exhaustively re-read for this audit) |
| BAI never sets `deviceId` | Indirectly covered by `calibration-jobs.service.test.ts` — e.g. "sets identityIncomplete after start when Serial is missing" asserts `deviceId` stays null while `technicianObservedSerial` is also null, consistent with (not a direct assertion of) BAI's non-interference | `calibration-jobs.service.test.ts:2372-2387` region (per prior precondition audit; not re-quoted verbatim here) |
| Certificate creation refuses when `job.deviceId` is null | **Yes, current and passing** | `certificate.service.test.ts:217-224` — `makeJob({ withDevice: false })` → expects `CERTIFICATE_DEVICE_NOT_RESOLVED` |

**Explicit statement per task's instruction**: *"No automated test currently proves the
`QuotationItem.deviceId → PurchaseOrderItem.deviceId` inheritance invariant, nor the manual
Quotation Device-assignment validation path."* The qty=1 `PurchaseOrderItem → CalibrationJob`
invariant, by contrast, **is** proven by an existing, passing test.

---

## 8. Historical vs Current Architecture — MoM Chain of Authority (task §14)

Relevant documents found under `docs/minutes-of-meeting/` and `docs/claude/plans/`:

1. `Audit_MoM_6 — Device Identity Fields.md`, `audit-mom-6-device-identity-fields-20260918.md` —
   original MoM #6 analysis: locks the WO/SPK-assigned Device; BAI corrects *observed* identity
   only. **Foundational / superseded-in-detail-only** — its core rule (BAI never touches `deviceId`)
   remains current and is enforced in code today (§4).
2. `mom-6-final-implementation-report-20260918.md` — implementation report for the above. **Current
   / implemented.**
3. `MOM 6 FINAL-TASK- UNDERSTAND and DOCUMENT UPDATED DEVICE IDENTIFICATION DECISION.md` (content
   dated 2026-09-21) — **the decision that reopened one narrow piece of MoM #6**: introduces the
   `selectDevice` search-and-select flow as a *first-time-only*, BAI-independent mechanism, while
   explicitly reaffirming BAI rules are otherwise unchanged. **Current, authoritative for the
   Device Lookup mechanism** (§3).
4. `calibration-job-deviceid-propagation-20260921.md` — the MoM that specifically fixed the qty=1
   fan-out gap (previously `fanOutCalibrationJobs()` hard-coded `deviceId: null` for every job
   unconditionally; now conditionally propagates for qty=1). **Current, implemented, verified live
   in code today** (§2.5).
5. `Implement_TechnicianDeviceLookup-report.md` (under `docs/claude/plans/technician-app/ui-tasks/`)
   — implementation report for document #3's decision. **Current, implemented.**
6. `Device-lookup-audit.md`, `audit-bai-lifecycle-lk-identity-impact-20260918.md` — supporting
   audits for the same chain of decisions; **current / consistent**, not superseded by anything
   later.
7. This folder's three pre-existing documents
   (`calibrationjob-deviceid-propagation-audit.md`,
   `certificate-device-identity-comprehensive-audit.md`,
   `certificate-device-identity-precondition-audit.md`) — **their analysis of the
   Requisition-independent Quotation→PO→WO→Job chain is CURRENT and was re-verified in this audit.
   Their analysis and recommendation regarding `Certificate.deviceId` nullability is HISTORICAL /
   ABANDONED — never committed, and superseded by a different, actually-shipped decision.** See
   §12.
8. `certificate-management-implementation-report.md` (commit `b0cb2b0`, dated 2026-09-26, same day
   as this audit) — **CURRENT, AUTHORITATIVE for Certificate.** States verbatim: *"SCHEMA CHANGES:
   NONE... MIGRATIONS: NONE."* This is the actual, shipped outcome; it supersedes the nullable-
   `Certificate.deviceId` recommendation without ever adopting it.

**No conflict was found among documents #1-#6** — they form one consistent, incrementally-refined
decision chain, each one narrowly reopening exactly the piece it names and reaffirming the rest.
**A real supersession was found between #7 and #8** (see §12) — not a document conflict in the
sense of contradictory *decisions on paper*, but a case where an audit's recommendation was
evaluated, an implementation was drafted (uncommitted), and then a *separate* implementation task
shipped instead, leaving no trace of the draft in the committed history. Report number/recency
alone was not used to resolve this — the resolution is based on what is actually present in
`git log`/`git show`/current `schema.prisma`, not on which document is dated later.

---

## 9. Business Invariant Analysis (task §16)

**Proposed invariant**: *"If a Device is explicitly identified at the originating
Requisition/CalibrationRequest and remains part of the commercial transaction, the same Device.id
must be preserved through Quotation → Purchase Order → Work Order → CalibrationJob."*

This invariant **cannot be evaluated as stated**, because its premise does not hold in the current
architecture: **a Device.id is never "explicitly identified" at the originating Requisition** —
only a free-text Serial Number/name may be. The invariant that *is* actually enforced, and
correctly, is narrower: *"If a Device.id is explicitly bound at Quotation (by staff, via manual
PATCH) or resolved later via Device Lookup, and the line represents exactly one physical unit
(qty=1) at fan-out time, that same Device.id is preserved through Purchase Order → Work Order →
CalibrationJob."* This narrower invariant holds today, verified by code and test.

**Second question**: *"If no Device master is known at the originating request, can the
transaction legitimately proceed without deviceId until a later stage?"* **Yes — this is not an
edge case being tolerated, it is the designed normal path.** Every current business-rule comment,
schema doc-comment, and MoM document reviewed agrees: Device master-record linkage
(`deviceId`) and physical-identity confirmation (`technicianObserved*`) are two deliberately
independent facts, and the business process (quoting, PO, dispatch, on-site calibration) is
explicitly designed to function correctly with `deviceId = null` throughout, resolving it only
opportunistically (manual Quotation entry, or Tech-PWA Device Lookup).

---

## 10. CalibrationJob.deviceId — Nullable vs Required (task §17)

**Recommendation: Option C — remains nullable at the schema level, with the following
application-level invariants, which the current code already enforces or comes close to enforcing:**

- NULL is a valid, common, and expected state at `CalibrationJob` creation and throughout most of
  the job lifecycle (`PENDING` → `IN_PROGRESS`), because the upstream chain has no automatic way to
  resolve a real `Device.id` before that point in the majority of real requests (free-text
  Requisition stage, qty>1 ambiguity).
- NULL becomes a candidate for a violation only in a narrower, hypothetical future state not
  currently enforced anywhere: *if* the business decided identity must be resolved before a job can
  reach a terminal/certifiable state, that would need to be a new, explicit application-level gate
  (comparable to `isIdentityIncomplete()`, which today deliberately checks
  `technicianObservedSerial`, not `deviceId` — see MoM #6). No such gate currently exists for
  `deviceId` itself, and this audit found no business document requiring one.
- Making it `String` (Option A) is not supported by the evidence: it would make every qty>1 fan-out
  and every free-text-only Requisition an immediate schema violation, which is the *documented
  normal case*, not an error state.

---

## 11. Certificate Impact (task §18) — Current, Corrected Finding

**This section corrects the conclusion of both pre-existing audit documents in this folder.**

Both `certificate-device-identity-comprehensive-audit.md` and
`certificate-device-identity-precondition-audit.md` describe, at length, an "already substantially
implemented working-tree change" making `Certificate.deviceId` nullable and removing the
`CERTIFICATE_DEVICE_NOT_RESOLVED` guard. **That change no longer exists anywhere in this
repository — not in the working tree, not in any commit.**

Verified directly, current state:

- `schema.prisma:2969-2993` — `Certificate.deviceId String` (required), `device Device
  @relation(fields: [deviceId], references: [id])` (required relation, no `onDelete` override —
  Prisma default `Restrict`-equivalent behavior for a non-optional relation).
- `certificate.service.ts:144-164` (`ensureCertificate`) — the guard is present and active:
  ```ts
  if (!job.deviceId) {
    throw new ConflictException({
      code: "CERTIFICATE_DEVICE_NOT_RESOLVED",
      message: "Cannot attach a certificate before this job's device identity is resolved (deviceId is not set)",
    });
  }
  ```
- `certificate.service.test.ts:217-224` — the test asserting this guard is present and (per the
  most recent implementation report) passing: *"refuses to create a certificate before the job's
  device identity is resolved."*
- The untracked migration folder the two prior audits cited
  (`20260926081808_make_certificate_device_id_nullable`) is **no longer present** in the working
  tree (`git status --short` at the time of this audit shows no such path).
- The actual, shipped implementation task for Certificate Management
  (`certificate-management-implementation-report.md`, commit `b0cb2b0`, same date) explicitly
  states under "Final status": **`SCHEMA CHANGES: NONE`, `MIGRATIONS: NONE`** — i.e., the team that
  did the real, committed Certificate Management work either was not shown, or did not act on, the
  nullable-`deviceId` recommendation; Certificate.deviceId-required behavior was preserved as-is.

**Consequence, evaluated per this audit's own findings (§9-§10):** given `CalibrationJob.deviceId`
is legitimately, commonly `null` for a large share of real jobs (free-text-only Requisitions,
qty>1 lines never manually resolved via Device Lookup), the current, active
`CERTIFICATE_DEVICE_NOT_RESOLVED` guard **does block Certificate upload for those legitimate
jobs today**, in the currently-committed code — exactly the real-world scenario
(`docs/technician-docs/measurement-results/S.638.pdf`, referenced as evidence in the precondition
audit) that originally prompted the now-abandoned nullable-column investigation. This audit does
not resolve which of the two positions (require deviceId-before-certificate vs. decouple them) is
correct — that is a business decision, not something this read-only audit should resolve by
recommending a schema change. It only establishes, as fact, which state is actually live in the
codebase right now, since the two folder-mates' framing ("already substantially implemented") would
mislead anyone reading them today into believing the guard no longer exists.

---

## 12. Identity Definitions — Explicit Disambiguation (task §19)

| Identity | What it is | Type | Never confuse with |
|---|---|---|---|
| `Device.id` | Internal system PK, `cuid()` | Real, immutable, system-generated | — |
| `Device.serialNumber` | Physical attribute of the master record | `String?`, **not unique** (only an index, `@@index([companyId, serialNumber])` — confirmed no `@@unique` anywhere on it) | Not the FK identity; multiple `Device` rows can share a serial |
| `Device.code` | Auto-generated business code (`DVC-000001`) | `String`, `@@unique([companyId, code])`, immutable | Not shown to technicians during lookup |
| `CalibrationRequestItem.deviceId` | Customer's free-text self-reported Serial Number/identifier at Requisition stage | `String?`, **no relation, not an FK** | **Must not be confused with any of the FK `deviceId` fields below** — this is this audit's central finding (§2.1) |
| `QuotationItem` / `PurchaseOrderItem` / `CalibrationJob` `.deviceId` | Real FK to `Device.id` | `String?` relation | Distinct identity space from `CalibrationRequestItem.deviceId` above, despite the identical field name |
| `technicianObservedSerial` (and Brand/Model/AkdAkl) | Technician's on-site physical observation snapshot, written only via approved BAI | `String?`, plain snapshot, no relation | **Not** `Device.id`; **not** a replacement FK; never resolved against the `Device` table anywhere in the codebase |

This audit found **no current business decision requiring `deviceId` to be replaced by
`serialNumber`** anywhere (no MoM, no schema comment, no code path attempts this). The existing
separation — master-record linkage (`deviceId`) vs. physical observation
(`technicianObservedSerial`) vs. customer self-report (`CalibrationRequestItem.deviceId`, which
this audit newly clarifies is actually a third, distinct thing, not a preliminary form of the
second FK-type field) — is architecturally deliberate and consistently implemented across the
codebase.

---

## 13. Identified Bugs / Gaps

1. **Naming collision, not a data-loss bug**: `CalibrationRequestItem.deviceId` and
   `QuotationItem`/`PurchaseOrderItem`/`CalibrationJob`.`deviceId` share a field name but are
   different kinds of identity (free text vs. real FK) with zero code connecting them. This is
   confusing to read/maintain (a future engineer could reasonably assume propagation should occur
   between them) even though current behavior is internally consistent. Recommend (documentation-
   only, not implemented here) considering a rename of the Requisition-stage field (e.g.
   `customerDeclaredSerialNumber`) in a future, explicitly-scoped task — not undertaken here per
   this audit's read-only mandate.
2. **Test coverage gap**: no automated test proves `QuotationItem.deviceId` (manually set, real FK)
   → `PurchaseOrderItem.deviceId` propagation, nor the `assertDevicesBelongToCustomer` validation
   path (§7). The qty=1 PO→Job propagation, by contrast, is tested.
3. **Untested scenario**: Quotation Device reassignment via revise *after* a WorkOrder has already
   fanned out (§6, row 7) — architecturally the already-created `CalibrationJob.deviceId` is frozen
   (fan-out does not re-run), which is consistent with the rest of the "freeze at fan-out"
   philosophy (`customerDeclaredDeviceName`, `unitTotal`), but this specific interaction has no
   direct test.
4. **Stale audit documents in this same folder**: `certificate-device-identity-comprehensive-
   audit.md` and `certificate-device-identity-precondition-audit.md` describe a nullable-
   `Certificate.deviceId` state as "already substantially implemented" — this is no longer true
   (§11-§12). Recommend these two documents be marked superseded/historical (not deleted — that is
   a documentation-housekeeping decision, not made here) to avoid misleading a future reader.
5. **No reconciliation logic** between a bound `Device.serialNumber` and a later, divergent
   `technicianObservedSerial` (flagged previously in `certificate-device-identity-comprehensive-
   audit.md` §10 State D; re-confirmed still true, still unresolved, still a business decision, not
   a bug in the current design).

No case was found of `deviceId` being silently lost, overwritten, or corrupted by the code itself
anywhere in the traced chain.

---

## 14. Recommended Next Implementation Steps (description only — not implemented)

1. **Business decision needed**: should Certificate upload remain gated on
   `CalibrationJob.deviceId` (current, live behavior), or should that gate be relaxed, given
   `deviceId` is legitimately null for a large share of real jobs? This is the single most
   consequential open decision surfaced by this audit and directly affects real users today (the
   `S.638.pdf` scenario). Not resolved here.
2. If the answer to #1 is "relax the gate," the smallest correct path was already fully designed
   (not re-designed here) by `certificate-device-identity-precondition-audit.md` §6 Option A —
   nullable `Certificate.deviceId` — but that specific draft's migration file no longer exists and
   would need to be regenerated fresh against the *current* schema, not reused verbatim.
3. Housekeeping: mark or relocate the two now-superseded Certificate-nullability audit documents so
   future readers do not act on stale conclusions (§13 point 4).
4. Optional, non-urgent: rename `CalibrationRequestItem.deviceId` to reduce the naming collision
   with the real FK fields, if/when that model is next touched for an unrelated reason — not
   urgent enough to justify a standalone migration on its own.
5. Optional: add the missing `QuotationItem.deviceId → PurchaseOrderItem.deviceId` propagation test
   (§7, §13 point 2) the next time either service module is touched.

None of the above was implemented as part of this audit.

---

## 15. Exact Files / Services / Methods Involved

- `packages/db/prisma/schema.prisma` — `Device` (1546), `CalibrationRequest` (1580),
  `CalibrationRequestItem` (1622), `Quotation` (1729), `QuotationItem` (1767), `PurchaseOrder`
  (1800), `PurchaseOrderItem` (1839), `WorkOrder` (1868), `WorkOrderItem` (1933), `CalibrationJob`
  (2306), `Certificate` (2969).
- `apps/api/src/modules/calibration-requests/calibration-requests.service.ts` (create/revise,
  ~150-590), `calibration-request-import.service.ts` (Excel import, 51-626).
- `apps/api/src/modules/quotations/quotations.service.ts` — `buildGeneratedRows` (386-427),
  `buildItemRows` (331-354), `assertDevicesBelongToCustomer` (234-250).
- `apps/api/src/modules/purchase-orders/purchase-orders.service.ts` — create (236-250), revise
  (540-595).
- `apps/api/src/modules/work-orders/work-orders.service.ts` — `start()` (516-573),
  `fanOutCalibrationJobs()` (599-648).
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` — `selectDevice`
  (1357-1402), `getDeviceCandidates` (2027-2037), `submitIdentityCorrection` (~1494-1608),
  `decideIdentityCorrection` (~1611-1722+).
- `apps/api/src/modules/calibration-jobs/certificate.service.ts` — `ensureCertificate` (144-179).
- `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx` (`AssignedDeviceSection`, 135-209),
  `page.tsx` (`showDeviceLookup`, 94-102), `identity-correction/page.tsx` (BAI wizard, 119-141).
- Tests: `work-orders.service.test.ts` (1084-1176), `certificate.service.test.ts` (133-224),
  `quotations.service.test.ts`, `purchase-orders.service.test.ts`.

---

## 16. Confidence Level and Unresolved Questions

**Confidence: High** for the Quotation→PO→WorkOrder→CalibrationJob segment (re-verified against
current code with exact line numbers, cross-checked against passing tests). **High** for the
Requisition→CalibrationRequestItem→QuotationItem segment (verified via schema doc-comments, the
Excel importer's literal column-header mapping, and direct reading of both quotation-item-building
functions). **High** for the Certificate.deviceId current-state correction (verified via `git log`,
`git show`, current `schema.prisma`, current `certificate.service.ts`, and the dated implementation
report that explicitly states no schema changes were made).

**Unresolved / genuinely requiring a business decision** (not resolved by this audit, per its
read-only, non-prescriptive mandate):

1. Should `Certificate.deviceId` remain a hard precondition for certificate upload, given how often
   `CalibrationJob.deviceId` is legitimately null? (§11, §14.1)
2. Should `CalibrationRequestItem.deviceId` be renamed to avoid the identity-naming collision with
   the real FK fields? (§13.1, §14.4)
3. Should a reconciliation check exist between a bound `Device.serialNumber` and a later-diverging
   `technicianObservedSerial`? (§13.5, carried forward from the prior audit, still open)
4. Should the `QuotationItem.deviceId → PurchaseOrderItem.deviceId` invariant get explicit test
   coverage? (§7, §13.2 — a process gap, not a design question, but flagged as unresolved since it
   was not closed here)

---

## 17. Final Verdict

**VERDICT B — DEVICE ID INHERITANCE HAS IMPLEMENTATION GAPS.**

Not in the form the task's background hypothesis anticipated (a real, known Device.id silently
dropped by buggy propagation code — that does not happen; the qty=1 PO→Job propagation is correct
and tested). The actual gap is structural and upstream: the Requisition/CalibrationRequest stage
never captures a real `Device.id` at all — only a free-text, unvalidated string that happens to
share the field name `deviceId` with three unrelated, real-FK fields further down the chain. The
business model's own documented decisions (MoM #6 and its 2026-09-21 revision) already accept and
design around this — a Device master-record link is expected to often stay unresolved until
Quotation revision (manual) or Tech-PWA Device Lookup (first-time-only) — so this is not, by
itself, a defect requiring a code fix. It becomes an active, user-facing problem specifically
where a *downstream* consumer (`Certificate.ensureCertificate()`) assumes `deviceId` is reliably
resolved by the time of use, when the rest of the domain's own architecture already documents
that it frequently is not (§11). That mismatch — not the inheritance chain itself — is where this
audit found genuine, currently-live friction and the one open business decision most worth
resolving next (§14.1).
