# MedCal — AKD/AKL (NIE / Nomor Izin Edar) Traceability Field Assessment

> **Status: ANALYSIS / DESIGN ASSESSMENT ONLY.** No schema, migration, seed, API, UI, or
> config changes are proposed for execution. This document is the deliverable.

---

## Context

For regulated medical devices, the **AKD** (Alat Kesehatan Dalam negeri) / **AKL** (Alat
Kesehatan Luar negeri) number — the Kemenkes **Nomor Izin Edar (NIE)** — is a regulatory
product-identity that PKM may have to demonstrate to customers, auditors, and KAN. The
audit failure mode to prevent is: *"the data does not exist because the system never
provided a field to record it."* MedCal should act as a **preventive system control** —
force the applicable AKD/AKL to be captured/confirmed at the point of calibration, and turn
a missing regulatory identity into a managed exception rather than a silent pass.

Key identity distinctions that must **not** collapse into each other:

| Identity | MedCal representation today | Meaning |
|---|---|---|
| Device system identity | `Device.id` (cuid) + `Device.code` (`DVC-000001`, immutable, `MasterCodeService`) | MedCal's record of a device |
| Physical individual identity | `Device.serialNumber` (nullable, non-unique, indexed) | The one physical unit |
| Regulatory / product identity | **does not exist anywhere** | Nomor Izin Edar (AKD/AKL) — identifies the *registered product/variant*, shared across many physical units |

A repo-wide search (`AKD|AKL|NIE|Izin Edar|izinEdar|regulator|permitNumber|registrationNumber|nomorIzin`)
returns **zero** hits in schema or code — only docs/seed/marketing prose. There is no
existing field to reuse and nothing to rename; this is genuinely new data.

---

## Findings from the codebase

### Data model (`packages/db/prisma/schema.prisma`)

- **`Device`** (L1251-1281): `id`, `code`, `customerId`, `deviceTypeId`, `brand?`, `model?`,
  `serialNumber?`, `category?` (free-text snapshot), `locationText?`, `status`. **No
  regulatory field.** `DeviceModel` (L1127-1142) is a loose taxonomy row (`deviceTypeId` +
  `manufacturer` + `model`), **not** FK'd from `Device` — so there is no "product/variant"
  record where an NIE could naturally hang either.
- **`CalibrationRequestItem`** (L1317-1350): `deviceTypeId` (only required identity),
  `customerDeviceName?`, `model?`, `deviceId?` — the last is **free text**, explicitly *not*
  a `Device` FK, explicitly nullable ("a missing customer Device ID is a valid business
  state"). The FK was dropped in migration `20260826120000`.
- **`QuotationItem`** (L1442-1467) / **`PurchaseOrderItem`** (L1505-1532): each has a real
  nullable `deviceId` FK to `Device`, plus a `description` snapshot string. In the common
  path `deviceId` is `null` and copied through untouched; price is snapshotted from
  `PriceListItem` into `unitPrice`.
- **`WorkOrder`** (L1534-1575) / **`WorkOrderItem`** (L1577-1594): **no** `Device` relation
  and **no** serial capture. `WorkOrderItem` is a pure snapshot of the PO line
  (`description`, `qty`, immutable after create). Device identity only reaches the field via
  `CalibrationJob`.
- **`EquipmentDeliveryNote` / `EquipmentDeliveryNoteItem`** (L1645-1704): "Surat Jalan Alat
  (DLN)". Carries **PKM's own reference equipment** taken to site (`equipmentId` as a plain
  reference — *no FK* — plus `equipmentName/brand/model/serialNumber` snapshots). ON_SITE
  only. Header + item snapshots are immutable after issuance. **It has nothing to do with
  the customer's device being calibrated.**
- **`CalibrationJob`** (L1710-1735): `workOrderId`, `purchaseOrderItemId?`, `deviceId`
  (**required** FK), `status`, `startedAt`, `submittedAt`. `@@unique([workOrderId, deviceId])`
  — one job = one physical device. **No device snapshot fields.** Child models
  (`MeasurementResult`, `JobEvidence`, `JobReferenceEquipmentUsed`, `CustomerSignature`,
  `QualityReview`, `Certificate`) exist in schema.
- **`Certificate`** (L1817-1854): `deviceId` (required FK), `calibrationJobId` (`@unique`),
  `number`, `verificationToken?`, `status`, PDF pointer. **No denormalized device snapshot
  at all** — relies entirely on live `Device` + `CalibrationJob` FKs at render time.
- **No `Portal` / `PortalReview` model.** Portal review of quotations = `Quotation.source =
  PORTAL` + `Quotation.customerApprovedAt`. QA review = `QualityReview` off the job.

### Established snapshot pattern

The codebase has a clear, repeated **"copy identity onto the document so it is
self-contained and immutable"** convention: `EquipmentDeliveryNoteItem`,
`EquipmentDeliveryNote` header, `JobReferenceEquipmentUsed`, `WorkOrderItem`,
`QuotationItem`/`PurchaseOrderItem` (`description`, `unitPrice`), `Lead` contact snapshot,
`Device.category`. Precedent for adding snapshot columns is strong. The notable models that
**don't** yet snapshot device identity and instead trust the live `Device` FK are
`CalibrationJob` and `Certificate` — exactly the two audit-critical ones.

### Service layer

- Lifecycle is a chain of atomic `create()` transactions, each reading the prior document
  and snapshotting fields forward: `CalibrationRequestsService.create` →
  `QuotationsService.create` (`buildGeneratedRows`, 1:1 with requisition items) →
  `PurchaseOrdersService.create` → `WorkOrdersService.create` (serviceMode drives
  SPK/WOL numbering) → `DeliveryNotesService.issue`.
- **`WorkOrder → CalibrationJob` is NOT implemented.** No `calibration-jobs` module, no
  `calibrationJob.create` anywhere (only a `.count` delete-guard in `devices.service.ts:192`).
  Tests explicitly assert jobs are *not* created on WO completion
  (`work-orders.service.test.ts:424, 552-555`).
- **ON_SITE customer-device identification is NOT built.** No serial confirmation, no
  find-or-create/match logic. `DevicesService.create` is plain master CRUD. The
  "free-text `deviceId` string + `DeviceType` → real `Device` rows + N `CalibrationJob`
  rows" seam is called out as undesigned/high-risk in
  `docs/claude/plans/management-portal/.../implementation_report_requisition_device_alias_audit.md`
  (R2, D8).
- **Guard pattern** to reuse: a small `assertX()` helper throwing
  `BadRequestException({ message, code })` with a stable SCREAMING_SNAKE code, called at the
  top of the mutation inside the `$transaction`. Examples: `assertNoPendingPrices`
  (`quotations.service.ts:289`), quotation-tax check (`purchase-orders.service.ts:103`),
  `start()` equipment gate (`work-orders.service.ts:490`), `issue()` DN preconditions
  (`delivery-notes.service.ts:74`).

---

## 1. Recommended field matrix

| Entity | AKD/AKL field | Mandatory? | Reason |
|---|---|---|---|
| **Device** | Yes — `akdAklNumber` (+ optional `akdAklType` AKD/AKL enum, `akdAklValidUntil`, `akdAklVerifiedAt`) | **O** (nullable master data) | Natural home for the *current best-known* regulatory identity of the device. Cannot be mandatory: devices are created on-site from partial info, and many legacy/1-off customer devices will never have it. Master value, not evidence. |
| **Requisition** (`CalibrationRequestItem`) | Reuse existing free-text capture — at most an optional `akdAkl?` string alongside `customerDeviceName?` / `model?` | **O** (nullable) | Customer usually does not know the NIE at request time. Whatever they volunteer is captured verbatim as a hint, never trusted, never blocking. `deviceId` is already free text here — same philosophy. |
| **Quotation** (`QuotationItem`) | **No** | **N/A** | Quotation lines are priced per `DeviceType`, often with `deviceId = null`. AKD/AKL has zero bearing on price or scope. Adding it here creates a snapshot with nothing meaningful to snapshot. |
| **Purchase Order** (`PurchaseOrderItem`) | **No** | **N/A** | Pure commercial mirror of the quotation line. Same reasoning. |
| **Work Order** / `WorkOrderItem` | **No** (see note) | **N/A** | `WorkOrderItem` is a snapshot of the PO line, still `DeviceType`-level, pre–physical-identification. The physical device (and thus its NIE) is only known once the technician is on site — which is `CalibrationJob` territory, not `WorkOrderItem`. |
| **DLN** (`EquipmentDeliveryNote*`) | **No** | **N/A** | DLN carries **PKM reference equipment**, not the customer device. PKM's own instruments have their own calibration certificates, not an NIE for the customer's product. Putting AKD/AKL on the DLN would misrepresent what the document is. |
| **CalibrationJob** | **Yes** — `akdAklNumber` + `akdAklType?` + `akdAklStatus` (`CONFIRMED` / `NOT_APPLICABLE` / `EXCEPTION_APPROVED`) + `akdAklConfirmedByUserId` + `akdAklConfirmedAt` | **M** (conditionally — see below) | This is the audit control point. Before calibration execution the technician must capture/confirm the applicable AKD/AKL for the physical device **or** record an explicit, management-approved exception. The value is **evidence frozen at calibration time** and must survive later edits to the `Device` master. |

**"Mandatory" for CalibrationJob means:** the job cannot move past a defined gate (e.g.
`PENDING → IN_PROGRESS`, or job submission) unless `akdAklStatus` is set to one of:
`CONFIRMED` (with a non-empty `akdAklNumber`), `NOT_APPLICABLE` (device/product class
genuinely has no NIE requirement — a deliberate, attributable choice), or
`EXCEPTION_APPROVED` (management sign-off recorded). A blank/unset status blocks execution.
It is *not* "a non-null string column at the DB level" — it is a workflow precondition.

---

## 2. Recommended lifecycle flow

```
Customer request (Requisition)
  • CalibrationRequestItem: deviceTypeId (required) + customerDeviceName? + model? + akdAkl? (all free text, nullable)
  • AKD/AKL = unverified customer hint, may be null. Never blocks submission.
        │  (no propagation — see below)
        ▼
Quotation  → Purchase Order
  • No AKD/AKL field. Priced/ordered at DeviceType level.
        │
        ▼
Work Order (SPK, ON_SITE)
  • No AKD/AKL field. Still DeviceType-level.
        │
        ▼
Technician ON_SITE (Technician App — not yet built)
  • Physically identifies unit → confirms Serial Number
  • Reads/looks up applicable AKD/AKL (label, customer docs, Kemenkes lookup)
  • Device is matched or created:
       - if matched & Device.akdAklNumber empty  → offer to populate master from confirmed value
       - if matched & Device.akdAklNumber differs → flag discrepancy, technician resolves, job records the value actually observed
       - if created                              → set Device.akdAklNumber from confirmed value (still optional at master level)
        │
        ▼
CalibrationJob (1 job = 1 physical Device)  ── CONTROL GATE ──
  • akdAklNumber / akdAklType : SNAPSHOT of what was confirmed at this calibration
  • akdAklStatus : CONFIRMED | NOT_APPLICABLE | EXCEPTION_APPROVED   (blank ⇒ cannot start/submit)
  • akdAklConfirmedByUserId / akdAklConfirmedAt : who & when
  • Missing / unconfirmable ⇒ exception requiring Management decision (workflow NOT designed here)
        │
        ▼
Measurement → QA / Quality Review → Certificate
  • Certificate reads AKD/AKL from the CalibrationJob snapshot (not live Device)
```

**Propagation rule:** AKD/AKL is **not** copied Requisition → Quotation → PO → WO. It is
*re-established from the physical device* at the CalibrationJob stage. The only optional
propagation is a **display-only hint**: the Technician App may show the customer-supplied
`CalibrationRequestItem.akdAkl` next to the confirmation field to speed the technician up —
it is never auto-accepted.

---

## 3. Device vs CalibrationJob — recommendation

**Both should exist, and they mean different things:**

- **`Device.akdAklNumber`** — *master data.* "The AKD/AKL we currently believe applies to
  this device." Mutable; corrected as PKM learns more; can be back-filled. Optional.
  Answers *"what is this device's NIE?"* for operational/UI purposes.
- **`CalibrationJob.akdAklNumber` (+ type/status/confirmedBy/confirmedAt)** — *document
  snapshot / evidence.* "The AKD/AKL that was observed and confirmed by <technician> at
  <time> for the physical device calibrated under this job." Immutable once the job is
  submitted/accepted. Answers the KAN question *"mana AKD/AKL dari tensimeter yang
  dikalibrasi ini?"* with a value that is provably contemporaneous with the calibration.

**Why the Device value alone is insufficient for audit history:**

1. `Device.akdAklNumber` can be edited after the calibration — an auditor months later sees
   the *current* value, not what was true on the calibration date. NIEs are re-issued,
   corrected, and expire; the product registration can change.
2. On-site, the technician may calibrate a device whose master record is wrong, stale, or
   freshly created with a typo. The job must record what was *actually confirmed*, even if
   the master is later fixed differently.
3. `@@unique([workOrderId, deviceId])` means the job is the finest-grained per-calibration
   record that exists — it is the correct carrier for per-event evidence, mirroring how
   `JobReferenceEquipmentUsed` already snapshots the reference instruments used.
4. This matches the codebase's own pattern: `Certificate` and `CalibrationJob` are the two
   models that *fail* to snapshot device identity today; the audit-critical fix is to make
   the job self-contained.

---

## 4. Audit / traceability rationale

- **Preventive control:** the CalibrationJob gate makes "no AKD/AKL recorded" an active
  decision (NOT_APPLICABLE or EXCEPTION_APPROVED with a name attached), never an accident.
  PKM can always answer the auditor — either with the number, or with a documented,
  approved reason.
- **Contemporaneous evidence:** `akdAklConfirmedByUserId` + `akdAklConfirmedAt` +
  immutable-after-submit give a defensible chain: *this person confirmed this regulatory
  identity at this time, before this calibration.*
- **Separation of concerns preserved:** Device system id (`code`), physical id
  (`serialNumber`), and regulatory id (`akdAklNumber`) are three distinct columns; none is
  overloaded to stand in for another.
- **Certificate integrity:** the certificate cites the job snapshot, so a reprint years
  later shows the AKD/AKL as it was at calibration, consistent with the measurement data on
  the same certificate.
- **Exception visibility:** `akdAklStatus = EXCEPTION_APPROVED` is a queryable state —
  management/QA can report on every calibration that proceeded without a confirmed NIE.

---

## 5. Risks and edge cases

| # | Risk / edge case | Implication |
|---|---|---|
| R1 | **CalibrationJob creation does not exist yet.** The mandatory gate has no code to live in. | AKD/AKL enforcement must be designed *as part of* the (currently unbuilt) CalibrationJob + ON_SITE device-identification flow, not bolted on. This assessment's "M" is a requirement on that future module. |
| R2 | **NOT_APPLICABLE is a judgement call.** Which device/product classes legitimately have no NIE? | Needs a business rule — ideally a per-`DeviceType` flag (`akdAklRequired: boolean`) so the app knows when to hard-require vs allow NOT_APPLICABLE. Otherwise technicians will over-use NOT_APPLICABLE to bypass the gate. |
| R3 | **One NIE ↔ many physical units.** NIE identifies a registered product, not a serial. | Do not make `akdAklNumber` unique on `Device` or `CalibrationJob`. Multiple devices legitimately share an NIE. |
| R4 | **Master vs snapshot drift.** Device master says X, job confirmed Y. | Expected and acceptable — that's the point of two fields. UI should surface the diff at confirmation time; do not auto-sync silently. |
| R5 | **Retroactive calibrations / legacy jobs** (if historical data is ever imported). | Backfill would set `akdAklStatus = EXCEPTION_APPROVED` or a dedicated `LEGACY_UNRECORDED` value; the gate only applies to jobs created after go-live. |
| R6 | **Format validation.** AKD/AKL numbers have a Kemenkes format (e.g. `AKD 20xxxxxxxx` / `AKL xxxxxxxxxx`). | Soft-validate (warn) rather than hard-reject — formats have historically changed and OCR/manual entry on-site is error-prone. |
| R7 | **Wrong NIE confirmed.** Technician enters a plausible but incorrect number. | Field control cannot fully prevent this; mitigations are the confirmedBy attribution + QA review step + optional Kemenkes lookup integration (out of scope). |
| R8 | **SEND_TO_LAB path.** Device identification happens at intake, not on-site. | Same CalibrationJob gate applies; only the *capture UI* differs (lab receiving vs Technician App). The field design is transport-agnostic. |
| R9 | **Customer refuses / cannot provide, device has no visible label.** | This is precisely the exception path → Management decision. Do not let the technician silently proceed. Workflow not designed here. |
| R10 | **`DeviceModel` has no FK from `Device`.** | There is no clean "product/variant" entity to attach the NIE to instead of `Device`. Device-level is the pragmatic choice; revisit only if a real product-registration master is later introduced. |

---

## 6. Business decisions that still need to be locked

1. **Gate position** — does the AKD/AKL requirement block `CalibrationJob PENDING →
   IN_PROGRESS` (before any measurement), or block **job submission** (`IN_PROGRESS →
   SUBMITTED`)? Recommendation: **block start** — the technician confirms identity before
   touching the instrument, and can't waste a site visit measuring and then failing to
   submit.
2. **`akdAklStatus` value set** — confirm exactly: `CONFIRMED`, `NOT_APPLICABLE`,
   `EXCEPTION_APPROVED` (and possibly `PENDING` as the blank default, `LEGACY_UNRECORDED`
   for backfill).
3. **Who approves the exception** — Management? QA lead? Is it synchronous (technician
   blocked on site until approval) or deferred (job proceeds in an `EXCEPTION_PENDING`
   state, resolved before certificate issue)? *(Workflow design deferred, but the
   approver role must be decided to size the field set.)*
4. **Per-DeviceType `akdAklRequired` flag** — yes/no? Without it, NOT_APPLICABLE is
   unpoliceable (see R2).
5. **Does a confirmed job value write back to `Device.akdAklNumber`** automatically, on
   technician confirmation, or never? Recommendation: **prompt, don't auto-write** when the
   master is empty; **never silently overwrite** a non-empty master.
6. **AKD/AKL on the Certificate PDF** — is it a required printed element on every
   calibration certificate, or only when present? (Regulatory/customer expectation call.)
7. **Requisition hint field** — is capturing the customer-supplied AKD/AKL at request time
   worth a dedicated column, or is free-text `notes` enough for now?
8. **Kemenkes lookup / validation** — in scope ever? Affects whether we store just a string
   or a small validated sub-record (`type`, `number`, `validUntil`, `productName`).
9. **`akdAklType` (AKD vs AKL)** — store explicitly, or derive from the number prefix?

---

## 7. Exact files / models / services affected IF implementation were approved

> Listed for scoping only — **not to be changed under this task.**

### Schema (`packages/db/prisma/schema.prisma`)

| Model | Change | Nullability |
|---|---|---|
| `Device` (L1251-1281) | add `akdAklNumber String?`, optional `akdAklType` enum, `akdAklValidUntil DateTime?`, `akdAklVerifiedAt DateTime?` | all **nullable** — master data |
| `CalibrationJob` (L1710-1735) | add `akdAklNumber String?`, `akdAklType? `, `akdAklStatus` enum (default `PENDING`), `akdAklConfirmedByUserId String?`, `akdAklConfirmedAt DateTime?` | columns nullable; **enforcement is in the service gate**, not a DB `NOT NULL` |
| `DeviceType` (L935-957) | *(decision 4)* optional `akdAklRequired Boolean @default(false)` | — |
| new enums | `AkdAklType { AKD, AKL }`, `AkdAklStatus { PENDING, CONFIRMED, NOT_APPLICABLE, EXCEPTION_APPROVED }` (near L97-195 enum block) | — |
| `CalibrationRequestItem` (L1317-1350) | *(decision 7)* optional `akdAkl String?` | nullable |
| **No change**: `QuotationItem`, `PurchaseOrderItem`, `WorkOrder`, `WorkOrderItem`, `EquipmentDeliveryNote`, `EquipmentDeliveryNoteItem` | | |
| `Certificate` (L1817-1854) | no column needed if PDF reads job snapshot; *(decision 6)* optionally add `akdAklNumber String?` snapshot for full document self-containment (consistent with fixing the existing Certificate-has-no-snapshot gap) | nullable |

### Migration implications

- Additive, all-nullable columns → **no backfill required** for existing rows; safe single
  migration. New enums are new types.
- No new unique constraints (R3). Optional non-unique index
  `@@index([companyId, akdAklNumber])` on `Device` only if lookup-by-NIE becomes a feature.
- `akdAklRequired` default `false` → existing `DeviceType` rows unaffected; seed update
  (`packages/db/prisma/seed*`) to mark known regulated types.
- Existing `CalibrationJob` rows: none exist in any environment yet (module unbuilt), so no
  data migration concern today.

### Services / API

| File | Change |
|---|---|
| **(new) `apps/api/src/modules/calibration-jobs/*`** | The unbuilt CalibrationJob module — must include the AKD/AKL capture fields, an `assertAkdAklResolved(job)` guard (pattern: `quotations.service.ts:289`, `work-orders.service.ts:490`) called before `start()`/`submit()`, throwing `BadRequestException({ code: "CALIBRATION_JOB_AKD_AKL_REQUIRED" })`. |
| **(new) ON_SITE device-identification service** (the "unbuilt seam" from the requisition audit report) | Where serial + AKD/AKL are confirmed and `Device` is matched/created; decision 5 write-back logic lives here. |
| `apps/api/src/modules/devices/devices.service.ts` | `create()` (L67) + a new `update`/`confirmRegulatoryIdentity` path to accept `akdAklNumber`. |
| `apps/api/src/modules/calibration-requests/calibration-requests.service.ts` | `create()` (L54-125) + DTO — only if decision 7 adds the hint field. |
| `apps/api/src/modules/quotations/quotations.service.ts` | **no change** (confirms AKD/AKL does not propagate). |
| Certificate module (when built) | PDF template + data loader reads `CalibrationJob.akdAkl*` snapshot, not live `Device`. |
| QA / `QualityReview` handling | reviewer sees `akdAklStatus`; `EXCEPTION_APPROVED` jobs surface in a review/exception report. |

### UI

- **Technician App (not yet built)** — the primary capture surface: serial confirm → AKD/AKL
  confirm/lookup → exception request. This assessment is effectively a requirement input to
  that app's design.
- Management Portal: `Device` master form (optional AKD/AKL fields), CalibrationJob / job
  detail view (read-only snapshot + confirmedBy/at), exception approval screen (decision 3),
  `DeviceType` config (`akdAklRequired` toggle).
- Certificate preview/PDF (when built): display AKD/AKL line.

### G. Certificate / Portal impact (assessed, not implemented)

- **Portal Review:** no `PortalReview` model exists; customer-facing review today is only
  `Quotation.customerApprovedAt`. Making CalibrationJob AKD/AKL mandatory has **no impact on
  the current portal** (portal operates at the quotation stage, upstream of the job). If a
  future results/certificate portal is built, it would *display* the job's AKD/AKL snapshot.
- **Certificate:** `Certificate` currently has **no device snapshot** and reads live FKs.
  Once the job carries an AKD/AKL snapshot, the certificate should cite the **job** value so
  reprints stay contemporaneous. This is also the moment to reconsider the broader
  "Certificate has no snapshot fields" gap (out of scope, but related).
- **Certificate PDF:** likely needs an AKD/AKL row (decision 6). If mandatory-on-PDF, every
  job feeding a certificate must have a non-empty `akdAklNumber` *or* a
  `NOT_APPLICABLE` status the template can render as "Tidak memerlukan izin edar".
- **Audit trail:** `akdAklConfirmedByUserId` / `akdAklConfirmedAt` + immutability-after-submit
  provide the trail. If MedCal has a generic audit-log mechanism, AKD/AKL confirmation and
  any exception approval should be logged events.

---

## Verification (for the assessment itself)

This task produces no code. "Verification" = confirming the findings above against source:

1. `packages/db/prisma/schema.prisma` — models at the cited line ranges; grep
   `AKD|AKL|NIE|izinEdar|regulator` returns no schema hits.
2. `apps/api/src/modules/**` — no `calibration-jobs` module; `grep -r "calibrationJob.create"`
   returns nothing; `work-orders.service.test.ts` asserts jobs are not created.
3. `docs/claude/plans/management-portal/Calibration-management/calibrationrequest/implementation_report_requisition_device_alias_audit.md`
   — corroborates the unbuilt CalibrationJob / device-matching seam (R2, D8).

---

## Summary answers to the brief

- **A. Where should AKD/AKL live?** On `Device` (optional master) **and** `CalibrationJob`
  (mandatory-via-gate snapshot). No existing field can be reused — none exists. The
  free-text `CalibrationRequestItem.deviceId` / `customerDeviceName` / `model` fields are
  the *pattern* to follow for an optional requisition hint, not fields to repurpose.
- **B. Propagation:** AKD/AKL does **not** flow Requisition→Quotation→PO→WO. It is
  re-established from the physical device at CalibrationJob. Requisition value (if captured)
  is a nullable, non-authoritative hint. Quotation/PO/WO: not stored (operational commercial
  docs, DeviceType-level). CalibrationJob: stored as an immutable snapshot (evidence).
- **C. Device vs CalibrationJob:** both — master vs contemporaneous evidence. Device value
  alone is insufficient because it is mutable and may post-date or contradict the
  calibration.
- **D. DLN:** **no** AKD/AKL. The DLN is PKM's reference-equipment transport document, not a
  customer-device document.
- **E. Snapshot:** CalibrationJob AKD/AKL must be a **snapshot**, not a live `Device`
  reference. Quotation/PO/WO/DLN: not applicable (no field). Certificate: cite the job
  snapshot.
- **F. Validation gate:** at the **CalibrationJob execution boundary** — recommended at
  `start()` (`PENDING → IN_PROGRESS`), implemented as an `assertX()` guard mirroring
  existing precondition guards. Not implemented here.
- **G. Certificate/Portal:** no impact on current portal (upstream); Certificate PDF should
  display the job snapshot; audit trail via confirmedBy/confirmedAt + immutability.
- **H. Migration:** additive nullable columns + 2 new enums, no backfill, no new unique
  constraints, one safe migration. Enforcement is service-layer, not DB `NOT NULL`.
