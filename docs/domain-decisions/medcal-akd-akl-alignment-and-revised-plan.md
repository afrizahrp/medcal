# MedCal — AKD/AKL & Device Identity Control: Alignment Confirmation and Revised Implementation Plan

> **Status: ALIGNMENT REVIEW ONLY.** No source, schema, migration, seed, API, hook, helper,
> UI, or config changes. Implementation begins only after this response is approved.
>
> Responds to the 12 locked key decisions. Companion to docs `1`–`4` in this folder,
> especially `4 medcal-akd-akl-final-identity-control-audit.md`.

---

## 1. What I agree with (locked decisions confirmed)

| # | Locked decision | Alignment | Note |
|---|---|---|---|
| 1 | **CalibrationJob is the authoritative calibration-event evidence** | **Full agreement** | Matches the repo's snapshot convention (`EquipmentDeliveryNoteItem`, `JobReferenceEquipmentUsed`). The job's identity snapshot is frozen at gate-pass and never mutated by later corrections. |
| 2 | **AKD/AKL may be NULL at Requisition, but NULL must be resolved or explicitly exception-approved** | **Full agreement** | "Mandatory to *resolve*, not mandatory to *have a value*." NULL stays distinguishable from `NOT_APPLICABLE` via the `akdAklDeclaration` state. |
| 3 | **Technician must verify physical identity (Serial + AKD/AKL) before calibration starts** | **Full agreement, with a schema gap to close** | The gate must check **both** serial and AKD/AKL are resolved. Neither `CalibrationRequestItem` nor the proposed `CalibrationJob` currently has a serial field — this must be added (job-level snapshot of the observed serial). |
| 4 | **CalibrationJob START is the mandatory identity gate** | **Full agreement** | Direct codebase precedent: `WorkOrder.start()` already refuses `ASSIGNED → IN_PROGRESS` unless `equipmentConfirmedAt` is set. Same shape, same lifecycle position. Before any `MeasurementResult` exists, so a blocked job rolls back cleanly. |
| 5 | **Customer-provided and technician-confirmed AKD/AKL stay separate; never silently overwrite** | **Full agreement** | Two values on two rows, related by the requisition→job link. A mismatch is first-class data, matching *"a price change is a NEW row, never an in-place edit"* (`PriceListItem`). |
| 6 | **Device Identity Correction is an in-system, auditable workflow — never out-of-band** | **Agreement — this overrides my earlier "start with manual resolution" suggestion** | Accepted. The correction workflow becomes a real in-system entity from its first release. What I still recommend deferring is only the *elaborate multi-party signature ceremony*, not the in-system/auditable nature (see §2.3). |
| 7 | **NOT_APPLICABLE must not be an uncontrolled technician bypass** | **Full agreement** | Concrete mechanism proposed in §3 (mandatory reason + `TECHNICIAN_MANAGER` async confirmation before certificate + rate metric). |
| 8 | **Preserve historical values and correction history** | **Full agreement** | Requires the audit-trail mechanism to exist first (locked decision #12). Originals are preserved additively; the job snapshot is immutable. |
| 9 | **Quote/PO/WO must not become independent authoritative AKD/AKL sources; downstream visibility uses the Requisition source** | **Full agreement** | Exactly the position in doc 4 §7. No AKD/AKL columns on Quotation/PurchaseOrder/WorkOrder. Downstream visibility = a read-only view/report that reads `CalibrationRequestItem` through the existing `WorkOrder → WorkOrderItem → PurchaseOrderItem → QuotationItem → CalibrationRequestItem` join. |
| 10 | **Portal Calibration Job List separates Identity / Execution / QA status** | **Full agreement** | Three distinct lifecycle concepts, three columns, never one "Approval" field. |
| 11 | **Audit trail and evidence durability addressed before the regulatory correction workflow** | **Full agreement** | Promoted to Phase 0 prerequisites (§4). Neither exists today. |
| 12 | **TECHNICIAN_MANAGER is the authorized business approval role** | **Agreement, with an implementation caveat** | Accepted as a decision. My audit recommended a permission on `SUPERVISOR`; a dedicated role is defensible (clearer audit readability, cleaner separation of "shift supervisor" from "regulatory approver"). The caveat is migration cost — see §2.1. |

---

## 2. Conflicts and risks still open

### 2.1 `TECHNICIAN_MANAGER` role — enum migration ripple

`MembershipRole` (`schema.prisma:34-42`) is a Prisma enum: `SUPERADMIN, ADMIN, SUPERVISOR,
TECHNICIAN, FINANCE, CUSTOMER, CUSTOMER_SERVICE`. Adding `TECHNICIAN_MANAGER` touches:

- the enum + a migration (Postgres `ALTER TYPE ... ADD VALUE` — **cannot run inside a
  transaction block**, and cannot be removed later; get the name right the first time);
- `packages/auth/src/access-control.ts` — no role list to edit there, but new
  `RolePermission` seed rows for every resource/action this role may perform;
- the permission seed script / migration data;
- every place that **exhaustively enumerates** `MembershipRole` — role-picker UI, any
  `switch (role)` without a `default`, menu-visibility maps, `UserMembership` admin screens,
  invite/assignment flows. A grep audit of `MembershipRole` usages is the first task.
- **Risk:** a missed exhaustive switch silently drops `TECHNICIAN_MANAGER` into a fallback
  branch (e.g. treated as lowest privilege, or invisible in the role picker).
- **Mitigation:** grep audit before the migration; add the role with zero grants first, then
  grant explicitly; add a test asserting every `MembershipRole` value is handled in the
  role-label/menu maps.

### 2.2 The on-site Device match-or-create seam is still undesigned — and it is the real critical path

The identity gate is only as good as the step that produces a `CalibrationJob.deviceId`.
Today: `CalibrationRequestItem.deviceId` is free text (FK dropped in migration
`20260826120000`), `DevicesService.create()` is plain master CRUD, and there is **no**
match-or-create / serial-lookup / fan-out logic anywhere. The chain
"free-text `deviceId` + `DeviceType` → real `Device` rows → N `CalibrationJob` rows" is
explicitly flagged as undesigned in the requisition audit report.

- **Risk:** building the AKD/AKL gate before this seam is designed means the gate has no
  well-defined input. Duplicate `Device` rows, mis-linked jobs, and ambiguous
  "which device did the technician mean" all land on the gate.
- **Mitigation:** the seam gets its own design pass **inside Phase 2**, before the gate
  logic is written. `CalibrationJob.@@unique([workOrderId, deviceId])` gives the 1:1 rule;
  the open questions are serial-based matching, duplicate prevention, and how a technician
  confirms "this is the existing DVC-000123, not a new device."

### 2.3 "Never out-of-band" + workflow depends on an unbuilt module = a hard sequencing constraint

Locked decision #6 says corrections are never out-of-band. The correction workflow depends
on `CalibrationJob` (unbuilt) and the match-or-create seam (undesigned). Therefore:

- **The Device Identity Correction workflow must ship no later than the Technician App's
  calibration-execution capability.** If technicians can run jobs, they can observe
  mismatches, and there must already be an in-system place to put them. It cannot be a
  "later phase."
- **What can still be lean in the first release:** a single approver step
  (`TECHNICIAN_MANAGER`), evidence-file attachment, preserved originals, and a
  customer-acknowledgement field with `signed / declined / unavailable`. **What is deferred:**
  a formal dual-signature berita-acara ceremony with structured signer roles and a generated
  PDF. The concept (`CustomerSignature` stub) exists; the ceremony can be added once real
  cases show what it needs.

### 2.4 Audit-trail mechanism is net-new infrastructure

There is no `AuditLog`, no Prisma middleware, no change-history table — only ad-hoc
`createdByUserId` / `approvedAt` columns per model. Locked decision #12 requires this before
the correction workflow.

- **Risk:** scope creep — an audit log can become an "everything" project.
- **Mitigation:** bounded scope. One append-only `AuditLog` model
  (`companyId, actorUserId, action, entityType, entityId, beforeJson?, afterJson?, reason?,
  createdAt`), one service, written **only** from the mutation sites that carry regulatory
  weight: AKD/AKL confirmation, `NOT_APPLICABLE` set, exception raise/approve/reject, Device
  master write-back, and every Device Identity Correction transition. Not a global interceptor.

### 2.5 Evidence durability — object storage is real infra work

`FilesModule` storage is `LocalDiskDriver` only; the `StorageDriver` interface is built for
an S3/MinIO swap but that implementation does not exist, and F5 (containerisation / infra)
is incomplete.

- **Risk:** regulatory evidence (berita acara, photos) on a single VPS's local disk — a
  multi-year KAN retrospective could hit missing files after a disk failure or migration.
- **Mitigation:** implement the S3/MinIO `StorageDriver` in Phase 0, **or** formally accept
  the gap with a documented, tested backup/restore procedure for `FILES_ROOT`. This is a
  DevOps dependency, not just app code — flag early.

### 2.6 Residual risks carried from doc 4 (unchanged)

- **Multi-device WO with a terminally `BLOCKED` job** — WO completion semantics undefined
  (the readiness audit already flags WO→DONE auto-advance as unlocked). Needs a rule:
  a WO may reach `DONE` with `BLOCKED` jobs; those devices are reported "not calibrated —
  regulatory identity unresolved."
- **Job / WO supersession** — "what happened to the original PO/WO/Job?" needs
  `CalibrationJob.supersedesJobId` / `supersededByJobId` (mirroring
  `Certificate.supersedesCertificateId`). Schema now, even if the corrective re-run lands
  later.
- **Certificate must snapshot identity at issuance**, not read live `Device` FKs — otherwise
  a later correction silently rewrites an issued certificate's displayed identity.
- **Excel import** stays AKD/AKL-free in v1 — aggregate `qty > 1` lines have no single
  correct AKD/AKL value.
- **Backfill** — existing `Device` rows have no AKD/AKL; the gate applies only to jobs
  created after go-live. Master back-fill is manual/ongoing, driven by the "devices with
  missing regulatory identity" report.

---

## 3. NOT_APPLICABLE — the control mechanism (locked decision #7)

`NOT_APPLICABLE` at the START gate is allowed but **controlled**, not a free technician
checkbox:

1. **Mandatory structured reason** — the technician picks from a short list
   (e.g. "non-regulated accessory", "device predates registration requirement",
   "customer-owned reference standard") plus a free-text note. No reason → gate stays closed.
2. **Does not block START** (the technician can proceed with the calibration) **but blocks
   Certificate issuance** until a `TECHNICIAN_MANAGER` asynchronously confirms the
   `NOT_APPLICABLE` classification. This keeps the technician moving on site while ensuring
   no certificate leaves the building on an unreviewed exemption claim.
3. **Rate metric** — "`NOT_APPLICABLE` rate by technician / by device type" surfaced in the
   Portal, with periodic spot-audit. Cheaper and more honest than a per-`DeviceType`
   `akdAklRequired` flag (which remains rejected for v1).
4. **Audit-logged** — every `NOT_APPLICABLE` set and every manager confirmation writes an
   `AuditLog` row.

`EXCEPTION_APPROVED` is the stricter path: it **does** block START until the
`TECHNICIAN_MANAGER` decides, because it means "regulatory identity could not be resolved at
all," not "it genuinely doesn't apply."

---

## 4. Revised implementation plan

### Phase 0 — Prerequisites for regulatory correction (locked decisions #11, #12)

Nothing regulatory-corrective ships before these.

- **P0.1 `TECHNICIAN_MANAGER` role** — grep audit of `MembershipRole` usages → enum value +
  migration (standalone, non-transactional `ADD VALUE`) → seed `RolePermission` grants →
  role-label/menu-map tests.
- **P0.2 `AuditLog` mechanism** — one append-only model + service, written from
  regulatory-weight mutation sites only (§2.4). Bounded scope, explicitly not a global
  interceptor.
- **P0.3 Evidence durability** — implement the S3/MinIO `StorageDriver`, **or** document +
  test a `FILES_ROOT` backup/restore procedure and get sign-off on the residual gap. DevOps
  dependency.

### Phase 1 — Requisition regulatory capture (no execution-domain dependency; ship independently)

Additive and low-risk — the commercial pipeline is fully built.

- **Schema:** `Device.akdAklNumber` (+ `akdAklSourceJobId`, `akdAklUpdatedByUserId`,
  `akdAklUpdatedAt`); `CalibrationRequestItem.akdAkl String?`,
  `CalibrationRequestItem.akdAklDeclaration` enum
  (`NOT_PROVIDED | CUSTOMER_DECLARED_NONE | CUSTOMER_PROVIDED`),
  `CalibrationRequestItem.customerClaimedSerial String?` (optional hint). All nullable,
  additive migration, no backfill.
- **Contracts** (`packages/shared/src/schemas/index.ts`): `calibrationRequestItemInputSchema`,
  update schema, device master schemas.
- **API:** `CalibrationRequestsService.create` + update path; `DevicesService` update path.
- **Portal:** manual item entry (`new/`, `[id]/edit/`), detail view, device master form.
  **No Excel-import change.**
- **Report:** "upcoming Work Orders with unresolved regulatory identity" — query over the
  existing document-chain join; a Portal page following the `use-*-query.ts` pattern.

### Phase 2 — CalibrationJob module + identity gate (co-designed)

The real dependency for everything downstream. Covers the readiness audit's MISSING list.

- **P2.1 On-site Device match-or-create seam design** (§2.2) — serial-based matching,
  duplicate prevention, technician confirmation of an existing `Device` vs. new. Design pass
  before gate code.
- **P2.2 `CalibrationJob` creation / fan-out from `WorkOrder`** — 1 job = 1 device,
  `@@unique([workOrderId, deviceId])` enforced.
- **P2.3 Job schema:** `serialNumber` (observed snapshot), `akdAklNumber` (snapshot),
  `akdAklStatus` (`PENDING | CONFIRMED | NOT_APPLICABLE | EXCEPTION_PENDING |
  EXCEPTION_APPROVED | BLOCKED`), `akdAklConfirmedByUserId` / `akdAklConfirmedAt`,
  `akdAklNotApplicableReason`, `requestItemId` (link to the customer claim),
  `identityMismatch` (bool + note), `supersedesJobId` / `supersededByJobId`.
- **P2.4 START gate** (`PENDING → IN_PROGRESS`) — an `assertIdentityResolved(job)` guard
  (pattern: `work-orders.service.ts` `start()` / `quotations.service.ts`
  `assertNoPendingPrices`): both serial and AKD/AKL must be resolved to
  `CONFIRMED` / `NOT_APPLICABLE` / `EXCEPTION_APPROVED`; else "raise exception" →
  `EXCEPTION_PENDING` → notify `TECHNICIAN_MANAGER`.
- **P2.5 Exception + NOT_APPLICABLE control** (§3) — approve/reject by `TECHNICIAN_MANAGER`;
  `NOT_APPLICABLE` blocks certificate not start; all transitions → `AuditLog`.
- **P2.6 Snapshot freeze** — job identity fields immutable once `SUBMITTED`.

### Phase 3 — Device Identity Correction workflow (in-system, auditable; ships with Phase 2 / the Technician App)

Not deferrable past the Technician App's execution capability (§2.3).

- **`DeviceIdentityCorrection` entity:** `deviceId` (target), `calibrationJobId?` (origin),
  `fields` payload `{ serialNumber?, akdAklNumber?, deviceTypeMismatch? }`, `originalValues`
  (preserved verbatim), `proposedValues`, evidence via `FileObject` + a new
  `IDENTITY_CORRECTION` `FileOwnerPolicy`, `status`
  (`DRAFT → SUBMITTED → APPROVED / REJECTED`), `requestedByUserId`,
  `approvedByUserId` / `approvedAt` (`TECHNICIAN_MANAGER`), `reason`,
  `customerAcknowledgement` (`SIGNED | DECLINED | UNAVAILABLE`),
  `resolution` (`CORRECT_IN_PLACE | NEW_DEVICE_SUPERSEDE_JOB`).
- **Resolution semantics:** `CORRECT_IN_PLACE` = new correction row, Device attributes
  updated, originals kept. `NEW_DEVICE_SUPERSEDE_JOB` = create/relink the correct `Device`,
  original job → `SUPERSEDED` (`supersededByJobId`), new job against the correct device.
- **Technician proposes; `TECHNICIAN_MANAGER` decides** whether to reverse/recreate the
  PO/WO/Job — the technician never makes that call.
- Every transition → `AuditLog`. Reuses `FilesModule` — no rebuild of upload/storage.
- **Lean first cut:** single approver, evidence attach, ack field. **Deferred:** formal
  dual-signature berita-acara PDF ceremony.

### Phase 4 — Portal Calibration Job List (locked decision #10)

- WO detail child section (precedent: `WorkOrderItemsTable`,
  `WorkOrderEquipmentSection`), fed by a nested `jobs` array on the WO read model or a
  `useCalibrationJobs(workOrderId)` hook.
- **Three separate status columns:** Identity (`akdAklStatus` + serial state) · Execution
  (`CalibrationJobStatus`) · QA (`QualityReviewStatus`). Plus columns for customer-claimed
  vs confirmed AKD/AKL with a mismatch badge.

### Phase 5 — QA Review + Certificate

- `QualityReview` service (schema stub exists).
- **Certificate snapshots** device identity + `akdAklNumber` + `serialNumber` from the job
  **at issuance** — never a live `Device` FK.
- **Re-check gate at issuance:** job `akdAklStatus ∈ {CONFIRMED, NOT_APPLICABLE (manager-
  confirmed), EXCEPTION_APPROVED}` and snapshot frozen.

### Sequencing constraints (hard)

```
P0 (role, audit log, storage)  ─┐
                                ├─►  P2 (CalibrationJob + gate)  ──►  P3 (Correction)  ──►  P5 (QA + Cert)
P1 (Requisition capture)  ──────┘                              └──►  P4 (Job List)
```

- P1 may ship any time after P0.1 (needs `TECHNICIAN_MANAGER`? no — P1 needs no approver;
  P1 can even precede P0). **P1 is genuinely independent and can start now.**
- P3 must not lag the Technician App's execution release (locked #6).
- P0.2 + P0.3 must complete before P3 (locked #11).
- Nothing in P2–P5 starts before the P2.1 match-or-create design pass.

---

## 5. Decisions still needed before Phase 2 code

| # | Decision | Recommendation |
|---|---|---|
| A | `TECHNICIAN_MANAGER` — does it inherit all `SUPERVISOR` grants plus regulatory-approval, or a narrower distinct set? | Distinct explicit grant set; do not auto-inherit `SUPERVISOR`. |
| B | `AuditLog` scope — the exact list of mutation sites that write to it | The 6 in §2.4; expand only on evidence. |
| C | Evidence storage — S3/MinIO now, or documented local-disk gap? | Object storage now (regulatory evidence). |
| D | `NOT_APPLICABLE` — block certificate until manager-confirmed (my proposal), or a lighter touch? | Block certificate, not start (§3). |
| E | `EXCEPTION_PENDING` on site — technician fully blocked until the manager responds, or may run other jobs on the same WO? | May run other jobs; only the affected job is blocked. |
| F | Multi-device WO — may it reach `DONE` with `BLOCKED` jobs? | Yes; blocked devices reported as "not calibrated — identity unresolved". |
| G | Job supersession — new job on correction, or edit in place? | New job + `SUPERSEDED` original for `NEW_DEVICE_*`; in-place correction row for `CORRECT_IN_PLACE`. |
| H | Customer acknowledgement — mandatory to submit a correction, or `DECLINED`/`UNAVAILABLE` allowed? | Allowed; those are valid recorded evidence. |
| I | `akdAklDeclaration` — separate field now, or derive from `akdAkl` null-ness + a boolean? | Separate enum — you cannot derive "customer declared none" from NULL. |

---

## 6. Files / models that WOULD be affected (scoping only — no changes here)

**Phase 0**
- `packages/db/prisma/schema.prisma` — `MembershipRole` enum; new `AuditLog` model.
- `packages/auth/src/access-control.ts` + permission seed — grants for `TECHNICIAN_MANAGER`
  and new resources (`calibrationJob:*`, `deviceIdentityCorrection:*`).
- `apps/api/src/modules/files/storage/` — new S3/MinIO `StorageDriver` implementation
  (interface already exists).
- new `apps/api/src/modules/audit-log/*`.

**Phase 1**
- `schema.prisma` — `Device` (~L1251-1281), `CalibrationRequestItem` (~L1317-1350); new enum
  `AkdAklDeclaration`.
- `packages/shared/src/schemas/index.ts` — `calibrationRequestItemInputSchema` (~L297),
  `calibrationRequestUpdateSchema` (~L348), device master schemas.
- `apps/api/src/modules/calibration-requests/calibration-requests.service.ts` (`create` L54,
  update ~L248); `apps/api/src/modules/devices/devices.service.ts` (~L151).
- `apps/portal/src/app/management/calibration-requests/{new,[id],[id]/edit}/…`,
  `use-calibration-requests-query.ts`, `calibration-requests-ui.tsx`;
  `apps/portal/src/app/management/device-types/` **not** touched (no `akdAklRequired`).
- new report query module + Portal page.
- **Not touched:** `quotations`, `purchase-orders`, `work-orders` schema/modules; the Excel
  importer.

**Phase 2–5**
- `schema.prisma` — `CalibrationJob` (~L1710-1735) new fields + `AkdAklStatus` enum;
  `Certificate` (~L1817-1854) new identity-snapshot fields; `QualityReview` (service only).
- new `apps/api/src/modules/calibration-jobs/*` with `assertIdentityResolved()` guard.
- new on-site Device match-or-create service.
- new `DeviceIdentityCorrection` model + module; new `FileOwnerPolicy` registration
  (reuse `FilesModule`).
- new `apps/api/src/modules/quality-reviews/*`, `certificates/*` (later).
- `apps/portal` — WO detail Calibration Job List section + `useCalibrationJobs` hook;
  Device Identity Correction screens; exception-approval screen.

---

## 7. One-paragraph bottom line

The 12 locked decisions are internally consistent and match the codebase's grain. The three
things that make this bigger than "add a field" are all now explicit prerequisites:
a `TECHNICIAN_MANAGER` role migration, a bounded `AuditLog` mechanism, and durable evidence
storage. The true critical path is the **CalibrationJob module and its on-site
device-identification seam** — neither exists, and the identity gate and correction workflow
are meaningless without them, so Phase 2's design pass is the pacing item. Phase 1
(Requisition capture + Device master field + early-warning report) is genuinely independent
and can begin immediately once approved.
