# Investigation: Identity Correction Workflow — Schema & Design Options

> READ-ONLY analysis. No schema/code/migration changes were made. This file is the only
> artifact produced. **Path note:** the task specified `D:\medcal\docs\claude\plans\...`, but
> this repo is checked out at `j:\medcal` and `D:\medcal` does not exist. Report written to the
> `j:\medcal` equivalent path.

## Summary

Identity Correction is still **not modelled**. What the runtime *does* now have is an explicit
placeholder for it: `assignDevice` refuses to re-bind a job that already has a `deviceId` with
the message *"Re-assignment is handled by the identity correction workflow"*
([calibration-jobs.service.ts:250](../../../apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts#L250)) — so
scenario (b) (correcting an already-accepted device identity) is a known, deliberately-deferred
gap. Reusable assets exist but none fit as-is: `CustomerSignature` is a single job-completion
signature with no runtime and no room for a technician signer; `FileOwnerType.SIGNATURE` is on
the enum but **no policy is registered** (the registry ships empty); `DocumentNumberService` is
cleanly reusable for a BA number series but requires touching the `DocumentType` enum + two
static maps; `EquipmentDeliveryNote`/`...Item` is a good *structural* template (header +
immutable snapshot items, `@@unique([companyId, number])`, CANCELLED preserved) but semantically
it is a manifest, not a two-signer decision record. The already-proven `AkdAklApprovalStatus`
pattern on `CalibrationJob` (`PENDING_REVIEW`/`APPROVED`/`REJECTED` + `approvedByUserId`/`At`/
`note` + a transition table) is the right shape to copy for `IdentityCorrectionStatus`.

**The single most important open question:** does this workflow need to cover only first-time
identity resolution (scenario a — the user's literal example, where `deviceId` was never
assigned), only genuine override of an already-approved identity (scenario b), or both? The
user's concrete example is technically scenario (a), but the phrase "before calibration
proceeds" plus the existing `assignDevice` guard strongly imply (b) is also in scope. Schema
shape (especially whether the correction record must snapshot a *prior resolved Device*) depends
on this answer.

---

## Step 1 — Existing Reusable Assets (verified live)

### 1.1 `CustomerSignature` — [schema.prisma:1887](../../../packages/db/prisma/schema.prisma#L1887)

```prisma
model CustomerSignature {
  id               String   @id @default(cuid())
  companyId        String
  calibrationJobId String   @unique
  fileObjectId     String?
  signerName       String?
  signedAt         DateTime @default(now())
  createdAt        DateTime @default(now())

  calibrationJob CalibrationJob @relation(fields: [calibrationJobId], references: [id], onDelete: Cascade)
  fileObject     FileObject?    @relation(fields: [fileObjectId], references: [id])
}
```

Prior audit still accurate: **one optional row per job** (`calibrationJobId @unique`), a single
job-completion acknowledgement, no `signerRole`, no link to any correction/BA, no service
methods write it (grep of `calibration-jobs.service.ts` shows `signature` only in the read
`select`, never a `create`). It has **no runtime**.

**Verdict: do not repurpose.** Two reasons: (1) the `@unique` on `calibrationJobId` caps it at
one row per job, but a correction needs *two* signers (technician + customer) and potentially
multiple corrections over a job's life; (2) the model is named and shaped for the *customer*
alone — a `signerName`-only row with no role discriminator. Correction sign-off needs its own
model(s). `CustomerSignature` can stay exactly as-is for its current purpose.

### 1.2 `FileOwnerType` enum + `owner-policy.ts` registry

Enum ([schema.prisma:293](../../../packages/db/prisma/schema.prisma#L293)) contains
`CERTIFICATE, JOB_EVIDENCE, SIGNATURE, REQUEST_ATTACHMENT, INVOICE, CREDIT_NOTE,
EQUIPMENT_CALIBRATION, OTHER`. So `SIGNATURE` already exists; there is **no BA-specific value**
(`OTHER` is the only fallback).

The registry ([owner-policy.ts](../../../apps/api/src/modules/files/owner-policy.ts)) ships
**empty** — `FileOwnerPolicyRegistry.get()` throws `FILE_OWNER_TYPE_UNSUPPORTED` for anything
not `register()`-ed, and the only caller that registers is Phase 2B's
`equipmentCalibrationFileOwnerPolicy`. `SIGNATURE` is unregistered → uploading a signature
image through `FilesModule` currently fails.

A new policy must implement the `FileOwnerPolicy` interface:

```ts
interface FileOwnerPolicy {
  ownerType: string;                 // e.g. "IDENTITY_CORRECTION" or reuse "SIGNATURE"
  permissionResource: string;        // RBAC resource of the owning record — file access reuses it
  readAction?: string;               // default "read"
  writeAction?: string;              // default "update"
  fileTypePolicy: FileTypePolicy;    // { mimeTypes, extensions, maxBytes }
  resolveOwner(companyId, ownerId): Promise<{ exists: boolean; locked: boolean }>;
}
```

Proven example ([equipment-calibration-file-owner-policy.ts](../../../apps/api/src/modules/equipment-calibration-records/equipment-calibration-file-owner-policy.ts)):
resolves the owner row scoped by `companyId`, sets `locked` from the owner's status
(`status === "CONFIRMED"`). For correction evidence the analogue is `locked: correction.status
=== "APPROVED" || correction.status === "REJECTED"` (a decided correction's BA + signatures are
frozen). It must be `register()`-ed in a module `onModuleInit` / constructor the same way
Phase 2B does.

**Shape needed for correction:** one policy, `ownerType` most naturally a new
`IDENTITY_CORRECTION` enum value (cleaner authorization story than overloading `SIGNATURE`,
which would collide the day job-completion signatures get a policy), `permissionResource:
"calibrationJob"` (corrections are a sub-resource of the job — no new RBAC resource needed),
`fileTypePolicy` allowing PNG/JPEG/PDF (signature images + optional scanned BA), `resolveOwner`
loads the `IdentityCorrection` row and locks on terminal status.

### 1.3 `DocumentNumberService` — [document-number.service.ts](../../../packages/db/src/document-number/document-number.service.ts)

Interface:

```ts
DocumentNumberService.allocate({
  companyId: string,
  documentType: DocumentType,   // Prisma enum
  issuedAt: Date,
  tx: DocumentNumberTransactionClient,   // must run inside a transaction
}): Promise<string>              // e.g. "BA/2026/09/00001"
```

Mechanics: resolves a fixed 3-letter `prefix` from `DOCUMENT_TYPE_PREFIX`
([document-type-prefix.ts](../../../packages/db/src/document-number/document-type-prefix.ts)),
computes `year` from `issuedAt` (UTC), optionally reads the max existing sequence from a table
named in `DOCUMENT_TYPE_NUMBER_TABLE`
([document-type-table.ts](../../../packages/db/src/document-number/document-type-table.ts)),
then does an atomic `INSERT ... ON CONFLICT (companyId, documentType, year) DO UPDATE SET
lastSequence = lastSequence + 1` on `DocumentNumberSequence`, and formats as
`PREFIX/YYYY/MM/NNNNN` (5-digit, `formatDocumentNumber`).

**It is NOT coupled to WorkOrder.** WO is just one of ten entries in the two static maps. It
already serves `WORK_ORDER` (SPK), `WORK_ORDER_SEND_TO_LAB` (WOL — two document types sharing
the `WorkOrder` table), `EQUIPMENT_DELIVERY_NOTE` (DLN), `CERTIFICATE`, etc.

**Reuse cost for a BA series:** add `BERITA_ACARA` (or `IDENTITY_CORRECTION_BA`) to the
`DocumentType` enum (Prisma migration — the enum is also referenced by nothing that would
break), add `"BA"` to `DOCUMENT_TYPE_PREFIX`, add the new table name (e.g.
`"IdentityCorrection"`) to `DOCUMENT_TYPE_NUMBER_TABLE`. `resolveDocumentNumberTable` may also
return `undefined` (then `maxExisting = 0` and it relies purely on the sequence row) — so a
brand-new table with no legacy rows can even skip the table map entry. Yearly reset, per-company
independent sequence, gap-free, transaction-safe — all for free.

**Recommendation:** reuse it. The only friction is the `DocumentType` enum edit; there is no
architectural reason to invent a second numbering scheme, and doing so would lose the
concurrency guarantees.

### 1.4 `EquipmentDeliveryNote` + `EquipmentDeliveryNoteItem` — [schema.prisma:1705](../../../packages/db/prisma/schema.prisma#L1705)

Header (`EquipmentDeliveryNote`): `id, companyId, workOrderId @unique, number, status
(ISSUED|CANCELLED), issuedAt, workOrderNumber, customerName, customerAddress?, locationText?,
createdAt, updatedAt`; `@@unique([companyId, number])`. Items (`EquipmentDeliveryNoteItem`):
`id, deliveryNoteId, equipmentId (plain ref, no FK), equipmentName, brand?, model?,
serialNumber?, sortOrder, createdAt`.

Documented pattern (comments): *"Immutable snapshot ... every field the PDF needs is copied
here so the document never depends on mutable master data"*; number never reused; CANCELLED rows
preserved rather than deleted.

**What maps cleanly:** header + frozen child snapshots; a `number` with
`@@unique([companyId, number])`; a status enum where the "voided" state (`CANCELLED` /
`REJECTED`) is retained, not deleted; snapshot columns instead of trusting FKs to mutable
masters (directly consistent with the `customerDeclaredDeviceName` snapshot decision already
made on `CalibrationJob`).

**Where it diverges (do not force-fit):**
- A delivery note is a *manifest* (list of things moved) with **no signer and no decision
  outcome**. A correction BA is a *decision record*: it has two distinct human signers
  (technician, customer) and a third-party approval verdict (TECHNICIAN_MANAGER approve/reject).
- Delivery note is 1:1 with WorkOrder (`workOrderId @unique`). A correction is per
  **CalibrationJob** (per physical device), and potentially >1 over a job's life (first
  resolution, later override) — so no `@unique` on the job FK; instead
  `@@unique([companyId, number])` for the BA number and an ordinary index on `calibrationJobId`.
- Delivery-note items are truly a list (N equipment). A correction's "lines" are a *fixed small
  set of identity attributes* (device name, deviceId, serial, AKD/AKL/NIE) each with an
  old→new pair — closer to a diff than a manifest. This can be flat columns on the header
  rather than a child table (see Option A vs B below).
- Delivery note has one lifecycle timestamp (`issuedAt`). A correction has several: submitted,
  technician-signed, customer-signed, decided.

**Verdict:** borrow the *structural conventions* (snapshot columns, unique number, preserve
rejected rows, header+optional-detail) but not the model itself.

### 1.5 `CalibrationJob` identity fields — [schema.prisma:1753](../../../packages/db/prisma/schema.prisma#L1753)

Present today:
- `deviceId String?` — FK to `Device`, `onDelete: Restrict`. Set by `assignDevice` /
  `bindDevice` after on-site verification. `@@unique([workOrderId, deviceId])` (binds only once
  non-null).
- `calibrationRequestItemId String?` — trace back to the customer's originating requisition
  line (where `customerDeviceName`, requisition-level `deviceId` free-text, `akdAkl` live).
- `customerDeclaredDeviceName String?` — snapshot of `CalibrationRequestItem.customerDeviceName`
  at job creation.
- `customerDeclaredAkdAkl String?` — snapshot of `CalibrationRequestItem.akdAkl` at job
  creation.
- `technicianObservedSerial String?` — serial the technician physically read on-site.
- `technicianObservedAkdAkl String?` — AKD/AKL/NIE the technician physically observed. Written
  by `escalateIdentity`.
- `akdAklApprovalStatus AkdAklApprovalStatus @default(NOT_REQUIRED)` + `akdAklApprovedByUserId`,
  `akdAklApprovedAt`, `akdAklDecisionNote`. Transition table in the service:
  `NOT_REQUIRED→PENDING_REVIEW→{APPROVED,REJECTED}`, `REJECTED→PENDING_REVIEW`.

**Is there anywhere to record a `deviceId` correction (a *different* resolved `Device`)?**
**No.** `deviceId` is a single scalar FK. There is no "previous deviceId", no history, no
correction record. Once `bindDevice` overwrites it, the prior value is gone.

**Is the existing `deviceId` field itself the "corrected" value?** Partly — and this is the
crux:
- On **first assignment** (`deviceId` was null): `assignDevice` sets `deviceId` directly after
  on-site verification. There is *no BA, no signatures, no manager approval* in that path today
  — it validates customer match + DeviceType match and binds. The AKD/AKL gate
  (`escalateIdentity`/`decideIdentity`) is a **separate** concern that runs on the
  AKD/AKL/NIE *value*, not on the device identity.
- On **re-assignment** (`deviceId` already set): explicitly **blocked** —
  `assertDeviceAssignable` throws `CALIBRATION_JOB_DEVICE_ALREADY_ASSIGNED` and the message
  names "the identity correction workflow" as the intended path
  ([calibration-jobs.service.ts:245-255](../../../apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts#L245-L255)).

So: **correction is a distinct concept layered on top of `deviceId`** for the re-assignment
case, and *may* also need to wrap the first-assignment case if the business wants a signed BA
even on first identity resolution.

---

## Step 1.5 — Scenario Clarification Needed

**The user's concrete example:**
- Requisition: `Bed Side Monitor`, `device_id = ''` (empty), `NIE = '123'`
- On-site: `device_id = '7891'`, `NIE = 'ABC'`
- Technician → TECHNICIAN_MANAGER approve/reject before calibration proceeds

At requisition `device_id` was empty, so the `CalibrationJob.deviceId` for this unit is
**null** — the job has never had a device assigned. Literally, this is **scenario (a)**: a
first-time identity resolution where what the customer declared (name + NIE) turns out wrong.

But two signals say **(b) is also in scope**:
1. The existing `assignDevice` guard already delegates re-assignment to "the identity
   correction workflow" — that path has no other home.
2. "before calibration proceeds" + the requirement for a *fully reconstructable KAN audit trail*
   (declared vs observed, both signatures, approver, timestamp, outcome) is a heavier process
   than today's silent `assignDevice`. If first assignment now needs that trail, then the plain
   `assignDevice` path is being *replaced* by the correction workflow whenever declared identity
   ≠ observed identity.

**Questions the user must answer before schema can be locked:**

- **Q1.** Must a signed BA + technician signature + customer signature + TECHNICIAN_MANAGER
  approval happen on **first** device identification when the observed identity differs from
  the customer's declaration (scenario a)? Or does scenario (a) stay as today's lightweight
  `assignDevice`, with the BA workflow reserved for changing an **already-approved** identity
  (scenario b)?
- **Q2.** If (a) is in scope: when declared and observed identity *match* (customer got it
  right), is any BA still required, or only when there's a discrepancy? (i.e. is the BA a
  "correction" artifact or a "confirmation-or-correction" artifact?)
- **Q3.** Can one BA correct **multiple attributes at once** (the example changes deviceId AND
  NIE together)? Assumed **yes** — confirm.
- **Q4.** Which attributes are correctable? Confirmed: physical `deviceId` (resolved `Device`),
  AKD/AKL/NIE. Also in scope: device name, serial number, brand/model, DeviceType? (DeviceType
  change would ripple into DeviceType-match validation and possibly the commercial chain.)
- **Q5.** Does an **APPROVED** identity correction that changes the AKD/AKL/NIE value
  automatically drive `CalibrationJob.akdAklApprovalStatus` (e.g. force it to `APPROVED`,
  since the manager just approved the corrected value in the same act), or are the two
  approvals kept independent (correction approves the *identity*, the AKD/AKL gate separately
  approves the *regulatory declaration*)? See Step 2 interaction section.
- **Q6.** Same TECHNICIAN_MANAGER role for correction approval as for the AKD/AKL gate?
  (Assumed yes.)
- **Q7.** Is customer signature always mandatory, or can a correction proceed with
  "customer unavailable / refused to sign" recorded as a reason (like `AkdAklDeclaration`
  handles "customer says there is none")?

---

## Step 2 — Design Options

All three options share:

- **New enum** `IdentityCorrectionStatus` — directly analogous to `AkdAklApprovalStatus`:
  ```prisma
  enum IdentityCorrectionStatus {
    DRAFT             // technician is filling it in; not yet submitted
    PENDING_SIGNATURES // submitted; awaiting technician and/or customer signature
    PENDING_REVIEW    // both signatures captured; awaiting TECHNICIAN_MANAGER
    APPROVED
    REJECTED
    CANCELLED         // withdrawn before decision; row preserved (EDN CANCELLED precedent)
  }
  ```
  (If the user wants the leanest possible mirror of `AkdAklApprovalStatus`, collapse to
  `PENDING_REVIEW / APPROVED / REJECTED / CANCELLED` and track signature presence via the
  signature rows' existence + a `submittedAt` timestamp.)
- **BA numbering** via `DocumentNumberService` with a new `DocumentType` value + `"BA"` prefix
  (Step 1.3). Allocated at submit time (not draft creation) inside the submit transaction, so
  DRAFT/abandoned corrections never burn a number — matches how EDN allocates at issuance.
- **Approval fields** mirror the proven pattern: `decidedByUserId String?`, `decidedAt
  DateTime?`, `decisionNote String?`. Role enforced in the service layer (schema comment on
  `akdAklApprovedByUserId` explicitly notes this is the codebase convention).
- **Snapshot, don't reference, the "declared / current" side.** Consistent with the
  `customerDeclaredDeviceName` decision: copy the pre-correction values onto the correction row
  so a later edit to `CalibrationJob` (or an APPROVED sibling correction) never rewrites what
  this BA recorded. The "new / observed" values are also stored on the row (they're the
  proposal). On APPROVE the service writes the new values back to `CalibrationJob`.
- **FileOwnerPolicy** for `IDENTITY_CORRECTION` (new `FileOwnerType` value), registered like
  Phase 2B; `permissionResource: "calibrationJob"`; locks on terminal status.

### Option A — Single flat `IdentityCorrection` header, attributes as column pairs *(recommended)*

```prisma
model IdentityCorrection {
  id                 String   @id @default(cuid())
  companyId          String
  calibrationJobId   String
  number             String   // BA/2026/09/00001 — allocated at submit
  status             IdentityCorrectionStatus @default(DRAFT)

  // ── who/when ──
  requestedByUserId  String   // technician
  submittedAt        DateTime?
  decidedByUserId    String?
  decidedAt          DateTime?
  decisionNote       String?

  // ── frozen "before" snapshot (from CalibrationJob at submit) ──
  prevDeviceId              String?   // resolved Device.id before, or null if none
  prevDeviceName            String?
  prevSerial               String?
  prevAkdAkl               String?

  // ── proposed "after" values (null = "not being corrected") ──
  newDeviceId              String?
  newDeviceName            String?
  newSerial                String?
  newAkdAkl                String?

  reason             String?   // technician's justification

  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  calibrationJob CalibrationJob @relation(fields: [calibrationJobId], references: [id], onDelete: Cascade)
  requestedBy    User           @relation("IdentityCorrectionRequester", fields: [requestedByUserId], references: [id])
  decidedBy      User?          @relation("IdentityCorrectionDecider", fields: [decidedByUserId], references: [id])
  newDevice      Device?        @relation("IdentityCorrectionNewDevice", fields: [newDeviceId], references: [id])
  signatures     IdentityCorrectionSignature[]

  @@unique([companyId, number])
  @@index([calibrationJobId])
  @@index([companyId, status])
}

model IdentityCorrectionSignature {
  id                   String   @id @default(cuid())
  companyId            String
  identityCorrectionId String
  signerRole           IdentityCorrectionSignerRole  // TECHNICIAN | CUSTOMER
  signerName           String?
  fileObjectId         String?
  signedAt             DateTime @default(now())
  createdAt            DateTime @default(now())

  identityCorrection IdentityCorrection @relation(fields: [identityCorrectionId], references: [id], onDelete: Cascade)
  fileObject         FileObject?        @relation(fields: [fileObjectId], references: [id])

  @@unique([identityCorrectionId, signerRole])   // one signature per role per BA
}

enum IdentityCorrectionSignerRole { TECHNICIAN CUSTOMER }
```

- **Lines:** none — the correctable attribute set is small and fixed, so `prev*/new*` column
  pairs are simplest, queryable, and make "was deviceId corrected?" a plain `newDeviceId IS NOT
  NULL` check. The example (deviceId + NIE together) is one row.
- **Signatures:** one shared model with a `signerRole` discriminator +
  `@@unique([identityCorrectionId, signerRole])`. Trade-off: a discriminator is slightly less
  self-documenting than two relations, but it's exactly how the codebase already discriminates
  (`ChatSenderType`, `AkdAklDeclaration`) and it keeps signature-capture logic (file upload,
  policy, lock) uniform for both signers. Two distinct relations would duplicate every
  signature concern.
- **Numbering:** `DocumentNumberService` + new `DocumentType`.
- **Approval:** `IdentityCorrectionStatus` mirror of `AkdAklApprovalStatus` with a
  service-layer transition table.
- **Interaction with `CalibrationJob`:** on APPROVE, in one transaction the service writes
  `newDeviceId → job.deviceId` (via the existing `bindDevice`, reusing its P2002 handling),
  `newAkdAkl → job.technicianObservedAkdAkl`, `newSerial → job.technicianObservedSerial`,
  `newDeviceName → job.customerDeclaredDeviceName`? (careful — that column is the *customer's*
  declaration; a corrected observed name may want its own column — see Open Questions).
- **Pros:** minimal new surface, easy to query/report, one row per audit event, no join to
  reconstruct a BA. **Cons:** adding a new correctable attribute later = a migration (two
  columns); can't correct the *same* attribute type twice in one BA (never needed).

### Option B — `IdentityCorrection` header + `IdentityCorrectionLine` detail

Header as in A minus the `prev*/new*` columns; instead:

```prisma
model IdentityCorrectionLine {
  id                   String @id @default(cuid())
  identityCorrectionId String
  attribute            IdentityAttribute   // DEVICE_ID | DEVICE_NAME | SERIAL | AKD_AKL | DEVICE_TYPE
  oldValue             String?
  newValue             String?
  sortOrder            Int
  identityCorrection   IdentityCorrection @relation(fields: [identityCorrectionId], references: [id], onDelete: Cascade)
  @@unique([identityCorrectionId, attribute])
}
enum IdentityAttribute { DEVICE_ID DEVICE_NAME SERIAL AKD_AKL DEVICE_TYPE }
```

- **Lines:** yes — a generic old/new/attribute triple, EDN-item-style. New correctable
  attributes are enum additions, no column churn.
- **Cons:** `oldValue`/`newValue` are stringly-typed — `DEVICE_ID` holds a `Device.id` with no
  FK, losing referential integrity and the `Device` relation for the new device (matters for
  the DeviceType-match re-validation on approve). Every consumer must know how to interpret each
  attribute. Reporting needs a join + pivot. This is over-engineering for ~4 fixed attributes.
- **When B wins:** only if the correctable attribute set is expected to grow substantially and
  unpredictably. Not the case here.

### Option C — No new header model; extend `CalibrationJob` + reuse a generic signature model

Add to `CalibrationJob`: `identityCorrectionStatus`, `identityCorrectionNumber`,
`identityCorrectionDecidedBy/At/Note`, `identityCorrectionReason`, plus `pendingDeviceId`,
`pendingAkdAkl`, `pendingSerial` (the proposed values). Add `signerRole` to `CustomerSignature`
and relax its `@unique`.

- **Pros:** no new top-level model; closely mirrors how `akdAklApprovalStatus` already lives
  directly on the job.
- **Cons:** **one correction per job, ever** (no history) — fails the KAN requirement to
  reconstruct *every* correction if a job is corrected more than once; pollutes the already-wide
  `CalibrationJob` with ~10 columns that are null for the overwhelming majority of jobs;
  mutating `CustomerSignature`'s shape risks its current single-signature semantics. **Not
  recommended** — the audit-trail requirement alone rules it out.

### Recommendation

**Option A.** It copies the proven `AkdAklApprovalStatus` approval shape, reuses
`DocumentNumberService` and the `FileOwnerPolicy` mechanism, adopts EDN's snapshot + unique-
number + preserve-rejected conventions, supports multiple corrections over a job's life (audit
requirement), and keeps the correctable-attribute model as simple flat columns because the set
is small and fixed. Add `IdentityCorrectionLine` (Option B) later only if Q4 reveals an
open-ended attribute set.

### Interaction of an APPROVED correction with `deviceId` / `akdAklApprovalStatus`

Proposed explicit rules (need user sign-off, esp. Q5):

1. **`deviceId`:** APPROVE writes `newDeviceId` to `CalibrationJob.deviceId` via the existing
   `bindDevice` helper (inherits its `@@unique([workOrderId, deviceId])` P2002 → 409 handling).
   The same customer-match and DeviceType-match validation that `assignDevice` runs must run at
   correction *submit* time (fail fast) and be re-checked at approve time.
2. **AKD/AKL/NIE:** if `newAkdAkl` is set, APPROVE writes it to
   `CalibrationJob.technicianObservedAkdAkl`. **Then the AKD/AKL gate must be re-evaluated:**
   - If `job.akdAklApprovalStatus` was already `APPROVED` against the *old* value, changing the
     value must **re-open** it — transition to `PENDING_REVIEW` (the manager approved a
     different declaration than what now stands). *Unless* Q5 says the correction approval by
     the same TECHNICIAN_MANAGER *is* the AKD/AKL approval, in which case set it straight to
     `APPROVED` with `akdAklApprovedBy/At` copied from the correction decision.
   - The `AKD_AKL_TRANSITIONS` table currently has no `APPROVED → PENDING_REVIEW` edge — this
     would need adding (a real, deliberate change, flagged here, not made).
   - If the AKD/AKL gate was `NOT_REQUIRED`, an identity correction that introduces a
     *questionable* NIE should move it to `PENDING_REVIEW`; a clean corrected NIE can stay
     `NOT_REQUIRED`. This is a judgement the technician makes at submit (a checkbox
     "this corrected NIE needs manager AKD/AKL review").
3. **Job status gate:** a correction can only be submitted/approved while the identity gate is
   open — reuse `assertIdentityGateOpen` (`IDENTITY_LOCKED_JOB_STATUSES = {SUBMITTED,
   ACCEPTED_BY_QA}`). A correction request on a `SUBMITTED` job must be rejected with the
   existing `CALIBRATION_JOB_IDENTITY_GATE_LOCKED` code (or trigger a REWORK — a business call).
4. **REJECTED correction:** no writes to `CalibrationJob`; row + BA number preserved; job keeps
   its prior identity. Technician may submit a new correction (new row, new BA number).
5. **Atomicity:** all approve-time writes (correction row, `job.deviceId`,
   `job.technicianObserved*`, `job.akdAklApprovalStatus`) happen in **one** `prisma.$transaction`
   so the job is never half-corrected.

---

## Open Questions for User Confirmation

1. **Scenario scope (Q1):** BA workflow for first-time identity resolution (a), already-approved
   identity override (b), or both? — *blocks final schema; determines whether `prevDeviceId` is
   ever non-null and whether `assignDevice`'s happy path is being replaced.*
2. **Discrepancy trigger (Q2):** is a BA required only when observed ≠ declared, or always?
3. **Multi-attribute per BA (Q3):** confirm one BA corrects deviceId + NIE + name + serial
   together (Option A assumes yes).
4. **Correctable attribute set (Q4):** deviceId + AKD/AKL/NIE confirmed. Also device name?
   serial? brand/model? DeviceType? (DeviceType has downstream validation impact.)
5. **AKD/AKL gate coupling (Q5):** does an APPROVED correction that changes the NIE
   auto-drive `akdAklApprovalStatus` (and do we add the `APPROVED → PENDING_REVIEW` transition),
   or stay independent?
6. **Approver role (Q6):** TECHNICIAN_MANAGER for correction approval, same as the AKD/AKL gate?
7. **Customer signature mandatory (Q7):** always required, or is "customer unavailable/refused"
   a recordable state?
8. **Observed device name column:** `CalibrationJob` has `customerDeclaredDeviceName` but no
   `technicianObservedDeviceName`. If device name is correctable, does the corrected name
   overwrite the customer-declared snapshot (loses provenance) or need a new column?
9. **New `DocumentType` enum value name:** `BERITA_ACARA`, `IDENTITY_CORRECTION`, or
   `IDENTITY_CORRECTION_BA`? Prefix `"BA"` assumed.
10. **`FileOwnerType` value:** new `IDENTITY_CORRECTION` value (recommended) vs. finally
    registering the existing `SIGNATURE` value and sharing it.
11. **BA on a `SUBMITTED` job:** hard-reject, or force the job back to `REWORK`?
12. **Does the certificate / report need to cite the BA number** when a job was corrected
    (likely yes for KAN traceability — affects `Certificate` snapshot fields, out of scope here
    but worth noting for the implementation task).

---

*No schema, code, migration, or other documentation files were modified. This investigation was
read-only analysis; the only file written is this report.*
