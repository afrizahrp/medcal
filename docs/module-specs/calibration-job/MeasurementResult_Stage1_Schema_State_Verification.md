# STAGE 1 — Live Schema State Verification (foundation for MeasurementResult design)

**Date:** 2026-09-07
**Mode:** READ-ONLY. No schema, migration, seed, or code changes were made. The only file
written is this report.
**Sources:**
- `packages/db/prisma/schema.prisma` (read in full, 2305 lines)
- `packages/db/prisma/migrations/**` (67 migration folders, newest `20260906145344`)
- `packages/db/prisma/seed-device-calibration-parameters.ts`,
  `seed-device-taxonomy-extension-parameters.ts`, `fix-collapsed-pattern-c-parameters.ts`,
  `backfill-device-calibration-parameter-tolerances.ts`
- Live dev DB `postgresql://…@localhost:5432/pkmdb` — read-only `count` / `groupBy` queries
  only (via a throwaway script in the session scratchpad, not added to the repo)
- Prior docs: `investigation-lk-vs-measurement-schema.md`,
  `investigation_report_measurement_Pattern_Classification.md`,
  `Rangkuman_Gap_Konfirmasi_User.md`, `after-meeting-20260828/implementation_report_redesign.md`,
  `Implement_G3_JobReferenceEquipmentUsed.md`, `Revise_G1_Correct_Tolerance_Design.md`,
  `technician-app/HANDOFF_2026-09-05_Session_Summary.md`,
  `technician-app/pre-implementation-audit/Technician-App-Calibration-Readiness-Audit-Report.md`

> **Note on location:** the task asked for the report in
> `docs/claude/plans/Calibration-management/`. That directory (which holds the live
> `Implement_CalibrationJob_*` runtime work) is **different** from
> `docs/claude/plans/management-portal/Calibration-management/` (which holds the older
> investigation set — `Rangkuman_Gap_Konfirmasi_User.md`, `investigation-lk-vs-measurement-schema.md`).
> This report is written to the former, as instructed. The G1–G4 gap document being reconciled
> against lives in the latter.

---

## 0. Headline answers (TL;DR)

| Question | Answer |
|---|---|
| Has `MeasurementResult` changed since the 08-29 investigation? | **No.** Byte-identical to the 2026-08-13 init migration. Still `payloadJson Json` + `summaryJson Json?` + `recordedAt`. No FK to `DeviceCalibrationParameter`. No `companyId` FK. No runtime (no service/controller/UI). **0 rows** in the DB. |
| Does `CalibrationTestPoint` / `MeasurementEntry` / any equivalent exist? | **No.** Not in the schema, not in any migration, not anywhere in non-doc code. It exists only as a *proposal* in two investigation docs. |
| G1 (structured tolerance on `DeviceCalibrationParameter`)? | **DONE.** `toleranceMin Decimal(18,4)?` + `toleranceMax Decimal(18,4)?` + `toleranceNote String?` exist and are backfilled. Also `decimalPlaces Int?` was added later. It is **not** a free-text-only `toleranceNote` anymore. |
| G3 (reference-equipment model)? | **DONE and then substantially redesigned.** Model name is still **`JobReferenceEquipmentUsed`**, but on 2026-09-05 it was changed from free-text (`equipmentName/brand/model/serialNumber`) to a hard FK to `Equipment` + optional FK to `EquipmentCalibrationRecord` + a TECHNICIAN_MANAGER validity-override block. It now has runtime + Portal + tech-pwa UI. **3 rows** in the DB. |
| `CalibrationJobStatus` values? | `PENDING`, `IN_PROGRESS`, `SUBMITTED`, `REWORK`, `ACCEPTED_BY_QA` — unchanged since init. No `CANCELLED` (open item D1). |
| `DeviceCalibrationParameter` row/type counts now? | **489 rows / 51 distinct DeviceTypes covered** (of 59 DeviceTypes total). Baseline was "242 rows / 27 types". |

---

## 1. Full current field definitions (quoted verbatim from `schema.prisma`)

### 1.1 `DeviceCalibrationParameter` (schema.prisma lines 1276–1312)

```prisma
// Master definition of a calibration measurement parameter for a DeviceType,
// under a DeviceCapabilityItem. valueType declares the kind of value the
// parameter expects; uom is required in meaning for NUMBER, optional for
// RATIO/TEXT/BOOLEAN. toleranceMin/toleranceMax store the comparable
// acceptance bounds (nullable for upper-bound-only or unresolved cases);
// toleranceNote keeps the verbatim LK wording. Unique per
// (deviceTypeId, capabilityItemId, code).
model DeviceCalibrationParameter {
  id               String               @id @default(cuid())
  deviceTypeId     String
  capabilityItemId String
  code             String
  name             String
  description      String?
  valueType        CalibrationValueType @default(NUMBER)
  uomId            String?
  toleranceMin     Decimal?             @db.Decimal(18, 4)
  toleranceMax     Decimal?             @db.Decimal(18, 4)
  toleranceNote    String?
  // Digits after the decimal point required for this parameter's measured
  // calibration result. Only meaningful for valueType = NUMBER; NULL for
  // RATIO/TEXT/BOOLEAN. Existing NUMBER rows were backfilled with a uniform
  // safe default of 0 (accurate per-parameter values are a separate follow-up).
  // A CHECK constraint bounds it to 0..10 (see migrations).
  decimalPlaces    Int?
  // Display order of this parameter within its (deviceTypeId, capability) scope
  // on the calibration-parameter screen and the future generated worksheet.
  // Written in a single transactional pass (multiples of 10); reads tie-break
  // on `name`. Existing rows are seeded by backfill-calibration-ordering.ts.
  sortOrder        Int                  @default(0)
  isActive         Boolean              @default(true)
  createdAt        DateTime             @default(now())
  updatedAt        DateTime             @updatedAt

  deviceType     DeviceType           @relation(fields: [deviceTypeId], references: [id])
  capabilityItem DeviceCapabilityItem @relation(fields: [capabilityItemId], references: [id])
  uom            Uom?                 @relation(fields: [uomId], references: [id])

  @@unique([deviceTypeId, capabilityItemId, code])
  @@index([deviceTypeId])
  @@index([capabilityItemId])
  @@index([uomId])
  @@index([isActive])
}
```

Related enum (`CalibrationValueType`, lines 365–370):

```prisma
enum CalibrationValueType {
  NUMBER
  RATIO
  TEXT
  BOOLEAN
}
```

**Changes since the 08-29 investigation baseline** (which reported "rows only carry `code`,
`name`, `description`, `valueType`, `uomId`"):
- `toleranceMin` / `toleranceMax` (`Decimal(18,4)?`) + `toleranceNote (String?)` — added
  `20260826180000` (as `limitKind`/`limitValue`/`limitUomId`), replaced `20260826190000` with the
  current three fields.
- `decimalPlaces Int?` + `CHECK (decimalPlaces IS NULL OR 0..10)` — added `20260829010628`,
  backfilled to a uniform `0` for NUMBER rows by `20260829020000`.
- `sortOrder Int @default(0)` — added `20260831063256` (calibration ordering).
- `isActive Boolean @default(true)` — added `20260831130000`.
- The parent taxonomy leaf `DeviceCapabilityItem` lost its `code` field (`20260831140000`); it is
  now identified by `id` + `@@unique([capabilityId, name])`.

### 1.2 `MeasurementResult` (schema.prisma lines 1902–1914)

```prisma
model MeasurementResult {
  id               String   @id @default(cuid())
  companyId        String
  calibrationJobId String
  payloadJson      Json
  summaryJson      Json?
  recordedAt       DateTime @default(now())
  createdAt        DateTime @default(now())

  calibrationJob CalibrationJob @relation(fields: [calibrationJobId], references: [id], onDelete: Cascade)

  @@index([calibrationJobId])
}
```

**Status: completely unchanged since the `20260813063336_init_better_auth_fcmtoken` migration.**
No migration anywhere in the tree touches `MeasurementResult` after init. Confirmed characteristics:
- `payloadJson` is **required, untyped `Json`** (`JSONB` in Postgres). `summaryJson` is optional
  untyped `Json`.
- **No FK to `DeviceCalibrationParameter`.** No FK to `DeviceCapabilityItem`, `Uom`, or anything
  in the parameter master. The only relation is `calibrationJobId → CalibrationJob` (Cascade).
- `companyId` is a bare `String` — **no `@relation` to `Company`** (matches the "companyId without
  FK on child tables" pattern flagged in gap E3).
- No `*ByUserId` field (no "recorded by" / "data entry by" actor — see the 08-29 §8 "Sign-off" gap,
  still open).
- No `status`, no `pass/fail`, no per-parameter / per-setting-point / per-replicate structure.
- **No application-layer module.** `grep` for a Measurement/Result/Reading service or controller
  in `apps/api/src` finds nothing. The Technician-App readiness audit (≈2026-09-01) and the
  2026-09-05 handoff both independently confirm: *"MeasurementResult … is completely unbuilt —
  still an untyped JSON blob with no runtime."*
- **0 rows** in the live dev DB.

### 1.3 `CalibrationJob` (schema.prisma lines 1806–1900) — full model

```prisma
model CalibrationJob {
  id                       String  @id @default(cuid())
  companyId                String
  workOrderId              String
  purchaseOrderItemId      String?
  /// Physical Device master row, once a technician has verified identity on-site.
  /// NULLABLE: identity is normally unknown until on-site verification, and the
  /// WorkOrder proceeds to IN_PROGRESS regardless. A NULL deviceId is a normal
  /// pending state, not an error. Postgres treats NULLs as distinct, so many
  /// jobs with deviceId = NULL may coexist under one WorkOrder; the
  /// @@unique([workOrderId, deviceId]) constraint only binds once deviceId is set.
  deviceId                 String?
  /// Trace back to the original customer requisition line this job fulfils, so
  /// the customer's declaration (name / deviceId / akdAkl) stays reachable even
  /// though it is not copied forward through the commercial chain. Optional-FK
  /// pattern mirrors purchaseOrderItemId.
  calibrationRequestItemId String?

  // ── Unit fan-out ordinal ───────────────────────────────────────────────────
  /// Position of this job within the set of N jobs fanned out from a single
  /// WorkOrderItem (WorkOrderItem.qty = N). 1-based: the sole job of a qty-1
  /// line carries unitOrdinal = 1. Lets the technician UI label "unit 2 of 3"
  /// before any deviceId is matched, when sibling jobs are otherwise identical
  /// (same purchaseOrderItemId, deviceId = NULL, same declared name). Assigned
  /// by fan-out; never edited afterwards. No @default — fan-out must set it
  /// explicitly so a missing assignment fails loudly (and trips
  /// @@unique([workOrderId, purchaseOrderItemId, unitOrdinal])) rather than
  /// silently collapsing every unit to 1.
  unitOrdinal Int
  /// Snapshot of N (WorkOrderItem.qty, coerced to Int) at fan-out time — the
  /// denominator for "unit X of N". Frozen deliberately: if a sibling job is
  /// later cancelled/deleted, the declared unit count this calibration belongs
  /// to does not change.
  unitTotal   Int

  // ── Identity snapshot ──────────────────────────────────────────────────────
  // Frozen ON the job, not read through Device, so later edits to the mutable
  // Device master never rewrite what this calibration actually saw.
  /// Device name as the customer originally described it (snapshot of
  /// CalibrationRequestItem.customerDeviceName at job creation).
  customerDeclaredDeviceName String?
  /// AKD/AKL/NIE exactly as the customer declared it on the originating
  /// CalibrationRequestItem, snapshot at job creation (mirrors
  /// customerDeclaredDeviceName). NULLABLE: "customer did not declare one" is a
  /// valid state, not missing data. Frozen here so later edits to the mutable
  /// CalibrationRequestItem.akdAkl never rewrite what was on record when this
  /// job's akdAklApprovalStatus (TECHNICIAN_MANAGER) gate was decided.
  customerDeclaredAkdAkl     String?
  /// Serial number the technician physically read off the device on-site.
  technicianObservedSerial   String?
  /// AKD/AKL/NIE the technician physically observed / confirmed on-site.
  technicianObservedAkdAkl   String?

  // ── AKD/AKL/NIE approval gate ──────────────────────────────────────────────
  /// Manager decision state for this device's regulatory declaration.
  akdAklApprovalStatus   AkdAklApprovalStatus @default(NOT_REQUIRED)
  /// The TECHNICIAN_MANAGER who APPROVED/REJECTED. Set together with
  /// akdAklApprovalStatus + akdAklApprovedAt. (Role is enforced in the service
  /// layer, not by the schema.)
  akdAklApprovedByUserId String?
  akdAklApprovedAt       DateTime?
  /// Manager's rationale, especially for REJECTED / conditional APPROVED.
  akdAklDecisionNote     String?
  /// Provenance of the currently-open gate — see AkdAklGateOrigin. Set only
  /// while akdAklApprovalStatus = PENDING_REVIEW, NULL otherwise. Existing rows
  /// default to NULL (no backfill: a stale NOT_REQUIRED job has no open gate).
  akdAklGateOpenedBy     AkdAklGateOrigin?

  status      CalibrationJobStatus @default(PENDING)
  startedAt   DateTime?
  submittedAt DateTime?
  createdAt   DateTime             @default(now())
  updatedAt   DateTime             @updatedAt

  workOrder              WorkOrder                   @relation(fields: [workOrderId], references: [id], onDelete: Cascade)
  purchaseOrderItem      PurchaseOrderItem?          @relation(fields: [purchaseOrderItemId], references: [id], onDelete: SetNull)
  device                 Device?                     @relation(fields: [deviceId], references: [id], onDelete: Restrict)
  calibrationRequestItem CalibrationRequestItem?     @relation(fields: [calibrationRequestItemId], references: [id], onDelete: SetNull)
  akdAklApprovedBy       User?                       @relation("CalibrationJobAkdAklApprover", fields: [akdAklApprovedByUserId], references: [id])
  results                MeasurementResult[]
  evidences              JobEvidence[]
  referenceEquipmentUsed JobReferenceEquipmentUsed[]
  signature              CustomerSignature?
  reviews                QualityReview[]
  certificate            Certificate?
  identityCorrections    IdentityCorrection[]

  @@unique([workOrderId, deviceId])
  @@unique([workOrderId, purchaseOrderItemId, unitOrdinal])
  @@index([companyId, status])
  @@index([purchaseOrderItemId])
  @@index([calibrationRequestItemId])
  @@index([companyId, akdAklApprovalStatus])
  @@index([akdAklApprovedByUserId])
}
```

**Every field added since the init model** (`init` had only: `id, companyId, workOrderId,
deviceId (NOT NULL), status, startedAt, submittedAt, createdAt, updatedAt`):

| Field | Added by migration | Notes |
|---|---|---|
| `deviceId` made **nullable** | `20260902050955_add_calibrationjob_identity_fields` | `ALTER COLUMN "deviceId" DROP NOT NULL` |
| `purchaseOrderItemId String?` | `20260827210000_work_order_mvp` (job created there) — present since the WorkOrder MVP | FK `→ PurchaseOrderItem`, `onDelete: SetNull` |
| `calibrationRequestItemId String?` | `20260902050955` | FK `→ CalibrationRequestItem`, `onDelete: SetNull` |
| `customerDeclaredDeviceName String?` | `20260902050955` | identity snapshot |
| `technicianObservedSerial String?` | `20260902050955` | identity snapshot |
| `technicianObservedAkdAkl String?` | `20260902050955` | identity snapshot |
| `unitOrdinal Int` (no default) | `20260902060000_add_calibrationjob_unit_ordinal_and_akdakl_snapshot` | fan-out position |
| `unitTotal Int` | `20260902060000` | fan-out denominator |
| `customerDeclaredAkdAkl String?` | `20260902060000` | identity snapshot (added with the ordinal batch) |
| `akdAklApprovalStatus AkdAklApprovalStatus @default(NOT_REQUIRED)` | `20260902060000` (enum) / escalation work | manager gate |
| `akdAklApprovedByUserId String?` | escalation migrations | FK `→ User` (`"CalibrationJobAkdAklApprover"`) |
| `akdAklApprovedAt DateTime?` | escalation | |
| `akdAklDecisionNote String?` | escalation | |
| `akdAklGateOpenedBy AkdAklGateOrigin?` | `20260906145344_add_calibrationjob_akdakl_gate_origin` | AUTO_MISMATCH vs MANUAL_ESCALATION provenance |
| `@@unique([workOrderId, purchaseOrderItemId, unitOrdinal])` | `20260902060000` | |
| `@@index([companyId, akdAklApprovalStatus])`, `@@index([akdAklApprovedByUserId])` | escalation | |

`startedAt` was **already in the init model** — it is not new. What is new (2026-09-06, commit
`a42e05d`/`ff731d5`) is the *runtime gate* enforcing it (a job cannot record work before
`startedAt` is set); the column itself predates that.

Related enums:

```prisma
enum AkdAklApprovalStatus {        // lines 194–203
  NOT_REQUIRED
  PENDING_REVIEW
  APPROVED
  REJECTED
}

enum AkdAklGateOrigin {            // lines 212–217
  AUTO_MISMATCH
  MANUAL_ESCALATION
}
```

### 1.4 `CalibrationJobStatus` enum (schema.prisma lines 181–187)

```prisma
enum CalibrationJobStatus {
  PENDING
  IN_PROGRESS
  SUBMITTED
  REWORK
  ACCEPTED_BY_QA
}
```

**Unchanged since the init migration (2026-08-13).** Confirmed by reading the init SQL:
`CREATE TYPE "CalibrationJobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'REWORK',
'ACCEPTED_BY_QA');` — no `ALTER TYPE … ADD VALUE` anywhere afterward.

**Where MeasurementResult picks up:** the runtime flow built in the 2026-09-05 session is
`WorkOrder → IN_PROGRESS` fans out `CalibrationJob` rows at `PENDING`; a technician "starts" a job
(`startedAt` set, `status` → `IN_PROGRESS`); job "submit" sets `submittedAt` and `status` →
`SUBMITTED`. Measurement entry therefore lives in the **`IN_PROGRESS`** window, gated by
`startedAt != null` and (where required) `akdAklApprovalStatus != PENDING_REVIEW/REJECTED`.
`REWORK` is the QA-bounce state; `ACCEPTED_BY_QA` is the QA-pass terminal (QA/QualityReview runtime
itself is still unbuilt). There is **no `CANCELLED`** (documented open item D1 — cancellation is
currently "delete the row").

### 1.5 Reference-equipment model — actual current name and shape

**Confirmed current name: `JobReferenceEquipmentUsed`** (the 08-29 investigation's name is still
accurate). schema.prisma lines 1930–1956:

```prisma
model JobReferenceEquipmentUsed {
  id                           String  @id @default(cuid())
  companyId                    String
  calibrationJobId             String
  equipmentId                  String
  equipmentCalibrationRecordId String?
  notes                        String?

  // ── Validity override (TECHNICIAN_MANAGER force-accept path) ───────────────
  validityOverridden Boolean   @default(false)
  overrideReason     String?
  overriddenByUserId String?
  overriddenAt       DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  calibrationJob             CalibrationJob              @relation(fields: [calibrationJobId], references: [id], onDelete: Cascade)
  equipment                  Equipment                   @relation(fields: [equipmentId], references: [id], onDelete: Restrict)
  equipmentCalibrationRecord EquipmentCalibrationRecord? @relation(fields: [equipmentCalibrationRecordId], references: [id], onDelete: Restrict)
  overriddenBy               User?                       @relation("JobReferenceEquipmentOverrider", fields: [overriddenByUserId], references: [id])

  @@unique([calibrationJobId, equipmentId])
  @@index([companyId, equipmentId])
  @@index([equipmentCalibrationRecordId])
  @@index([overriddenByUserId])
}
```

**This differs sharply from both the 08-29 investigation proposal and the shipped-first version.**
See §4 (G3) for the before/after.

### 1.6 `Certificate` (schema.prisma lines 2087–2124)

```prisma
model Certificate {
  id                      String                   @id @default(cuid())
  companyId               String
  customerId              String
  deviceId                String
  calibrationJobId        String                   @unique
  qualityReviewId         String?
  number                  String
  verificationToken       String?                  @unique
  status                  CertificateStatus        @default(DRAFT)
  billingStatus           CertificateBillingStatus @default(UNBILLED)
  issuedAt                DateTime?
  validUntil              DateTime?
  supersedesCertificateId String?
  revokeReason            String?
  pdfFileObjectId         String?
  createdAt               DateTime                 @default(now())
  updatedAt               DateTime                 @updatedAt

  company        Company              @relation(fields: [companyId], references: [id], onDelete: Cascade)
  customer       Customer             @relation(fields: [customerId], references: [id], onDelete: Cascade)
  device         Device               @relation(fields: [deviceId], references: [id])
  calibrationJob CalibrationJob       @relation(fields: [calibrationJobId], references: [id])
  qualityReview  QualityReview?       @relation(fields: [qualityReviewId], references: [id])
  supersedes     Certificate?         @relation("CertificateSupersede", fields: [supersedesCertificateId], references: [id])
  supersededBy   Certificate[]        @relation("CertificateSupersede")
  pdfFile        FileObject?          @relation("CertificatePdf", fields: [pdfFileObjectId], references: [id])
  invoiceLinks   InvoiceCertificate[]
  invoiceItems   InvoiceItem[]
  creditNotes    CreditNote[]
  reminderEvents ReminderEvent[]

  @@unique([companyId, number])
  @@index([companyId, billingStatus])
  @@index([companyId, status])
  @@index([customerId])
  @@index([validUntil])
}
```

Enums (lines 254–265):

```prisma
enum CertificateStatus        { DRAFT  ISSUED  REVOKED  SUPERSEDED }
enum CertificateBillingStatus { UNBILLED  BILLABLE  INVOICED }
```

**Unchanged since init except:** `DocumentType.CERTIFICATE` prefix work and the
`InvoiceCertificate`/`InvoiceItem` link tables. The `Certificate` model itself carries **no
reference to measurement data** — it links `calibrationJobId` (1:1) and `qualityReviewId`
(optional). Any measurement values a certificate PDF needs will have to be read through
`calibrationJob.results` (or a future typed model). Certificate has **no runtime** (schema-only,
0 rows).

### 1.7 `QualityReview` (schema.prisma lines 2063–2081)

```prisma
model QualityReview {
  id               String              @id @default(cuid())
  companyId        String
  calibrationJobId String
  reviewerUserId   String
  decision         ReviewDecision?
  status           QualityReviewStatus @default(PENDING)
  notes            String?
  reviewedAt       DateTime?
  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt

  calibrationJob CalibrationJob @relation(fields: [calibrationJobId], references: [id], onDelete: Cascade)
  reviewer       User           @relation("Reviewer", fields: [reviewerUserId], references: [id])
  certificates   Certificate[]

  @@index([calibrationJobId])
  @@index([companyId, status])
}
```

Enums (lines 243–252):

```prisma
enum ReviewDecision      { APPROVE  REJECT }
enum QualityReviewStatus { PENDING  APPROVED  REJECTED }
```

**Unchanged since init.** Still just `decision` + `status` + free-text `notes` — no structured
score-category breakdown (gap G4 — the "Telaah Teknis" weighted-scoring model is still not
represented). `calibrationJobId` is **not unique** — the schema permits multiple reviews per job
(rework loop). No runtime (schema-only, 0 rows).

### 1.8 `IdentityCorrection` + `IdentityCorrectionSignature` (schema.prisma lines 1978–2061)

Quoted in full because it is the closest fully-built analog to what MeasurementResult's workflow
will need (submission → signatures → manager approval → photo evidence).

```prisma
model IdentityCorrection {
  id               String                   @id @default(cuid())
  companyId        String
  /// Job being corrected. Required FK, NOT unique — a job may accumulate many
  /// corrections over its life (audit). (Decision 1)
  calibrationJobId String
  /// BA number from DocumentNumberService (prefix "BAI"), unique per company.
  /// Named `number` (not `baNumber`) so readMaxExistingSequence's hardcoded
  /// "number" column applies. (Decision 9)
  number           String
  status           IdentityCorrectionStatus @default(PENDING_REVIEW)

  // ── Corrected attributes (all nullable — one BA may touch only some) ────────
  /// Device on the job before this correction. FK: Device is never deleted
  /// (project policy) so referential integrity holds. (Decision 4)
  prevDeviceId String?
  /// Device the correction resolves the job to. FK enables DeviceType-match
  /// validation + RI in the service layer. (Decision 4)
  newDeviceId  String?
  /// Plain snapshot strings, mirroring CalibrationJob.technicianObservedSerial
  /// / technicianObservedAkdAkl. (Decision 4)
  prevSerial   String?
  newSerial    String?
  prevAkdAkl   String?
  newAkdAkl    String?

  /// Why the correction is needed. Durable column — NEVER overwritten. (Decision 3)
  reason String

  /// Technician who initiated. Always known.
  submittedByUserId String

  // ── Manager decision (mirrors akdAklApprovedBy/At/note) ────────────────────
  decidedByUserId String?
  decidedAt       DateTime?
  decisionNote    String?

  /// True once an APPROVED correction that changed newAkdAkl has moved the
  /// job's akdAklApprovalStatus APPROVED -> PENDING_REVIEW. Audit clarity.
  /// (Decision 5)
  akdAklGateReopened Boolean @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  calibrationJob CalibrationJob                @relation(fields: [calibrationJobId], references: [id], onDelete: Cascade)
  prevDevice     Device?                       @relation("IdentityCorrectionPrevDevice", fields: [prevDeviceId], references: [id], onDelete: Restrict)
  newDevice      Device?                       @relation("IdentityCorrectionNewDevice", fields: [newDeviceId], references: [id], onDelete: Restrict)
  submittedBy    User                          @relation("IdentityCorrectionSubmitter", fields: [submittedByUserId], references: [id])
  decidedBy      User?                         @relation("IdentityCorrectionDecider", fields: [decidedByUserId], references: [id])
  signatures     IdentityCorrectionSignature[]

  @@unique([companyId, number])
  @@index([companyId, status])
  @@index([calibrationJobId])
  @@index([submittedByUserId])
  @@index([decidedByUserId])
  @@index([prevDeviceId])
  @@index([newDeviceId])
}

model IdentityCorrectionSignature {
  id                   String                       @id @default(cuid())
  companyId            String
  /// FK, NOT unique — one TECHNICIAN row + one CUSTOMER row per correction.
  identityCorrectionId String
  signerRole           IdentityCorrectionSignerRole
  signerName           String?
  /// Signature image via FileOwnerType.IDENTITY_CORRECTION. Plain string, no
  /// FK relation — polymorphic like FileObject.ownerId; file-owner-policy
  /// wiring is a follow-up task. (Decision 10)
  fileObjectId         String?
  status               SignatureStatus              @default(SIGNED)
  /// Set when status = UNAVAILABLE/REFUSED. (Decision 7)
  unavailableReason    String?
  signedAt             DateTime?
  createdAt            DateTime                     @default(now())
  updatedAt            DateTime                     @updatedAt

  identityCorrection IdentityCorrection @relation(fields: [identityCorrectionId], references: [id], onDelete: Cascade)

  @@unique([identityCorrectionId, signerRole])
  @@index([companyId])
}
```

Enums (lines 219–241):

```prisma
enum IdentityCorrectionStatus     { PENDING_REVIEW  APPROVED  REJECTED }
enum IdentityCorrectionSignerRole { TECHNICIAN  CUSTOMER }
enum SignatureStatus              { SIGNED  UNAVAILABLE  REFUSED }
```

**Workflow patterns worth carrying into MeasurementResult design:**
- A `number` allocated from `DocumentNumberService` (BAI prefix) → `@@unique([companyId, number])`.
- `status` enters at `PENDING_REVIEW`; a TECHNICIAN_MANAGER moves it to `APPROVED`/`REJECTED`
  (decision happens in **Portal only**, never tech-pwa — locked decision).
- `decidedByUserId` / `decidedAt` / `decisionNote` triple (mirrors the AKD/AKL gate's
  `akdAklApprovedBy*` triple).
- Durable `reason` column that is **never overwritten** by the decision note (explicitly designed
  to avoid the known bug in the plain AKD/AKL escalation flow where the escalation note *does* get
  overwritten).
- Evidence photo: `ownerType: "IDENTITY_CORRECTION", ownerId: correction.id` on `FileObject`
  (polymorphic, no typed relation). Photo belongs to the **correction as a whole**, not to
  individual signature rows (a mid-session model correction — both signatures are on one physical
  sheet, photographed once).
- `SignatureStatus` captures "customer unavailable / refused" as first-class states, not null.
- 4 rows in the live DB (runtime + Portal + tech-pwa submit wizard all shipped 2026-09-05).

### 1.9 `JobEvidence` (schema.prisma lines 1916–1928) — for completeness

```prisma
model JobEvidence {
  id               String   @id @default(cuid())
  companyId        String
  calibrationJobId String
  fileObjectId     String
  caption          String?
  createdAt        DateTime @default(now())

  calibrationJob CalibrationJob @relation(fields: [calibrationJobId], references: [id], onDelete: Cascade)
  fileObject     FileObject     @relation(fields: [fileObjectId], references: [id])

  @@index([calibrationJobId])
}
```

Unchanged since init. `FileOwnerType.JOB_EVIDENCE` exists. Generic photo/file + caption attached
to a job — cannot represent structured measurement or reference-standard data (the 08-29 finding
still holds).

---

## 2. G1 status in full — structured tolerance fields

**Status: DONE (with a documented, deliberate partial-coverage tail).**

### 2.1 What is there now

`DeviceCalibrationParameter` currently has **three tolerance-related fields plus a precision
field** (all quoted verbatim in §1.1):

| Field | Type | Meaning |
|---|---|---|
| `toleranceMin` | `Decimal? @db.Decimal(18, 4)` | lower acceptance bound, nullable |
| `toleranceMax` | `Decimal? @db.Decimal(18, 4)` | upper acceptance bound, nullable |
| `toleranceNote` | `String?` | verbatim LK wording (e.g. `"± 5 mmHg"`, `"2-8°C"`, class-split text) |
| `decimalPlaces` | `Int?` | digits after the decimal for the measured *result*; `CHECK (NULL OR 0..10)`; NULL for non-NUMBER; uniformly backfilled to `0` for NUMBER rows |

So it is **not** a free-text-only `toleranceNote`. It is structured `min`/`max` **plus** a
verbatim note kept alongside.

### 2.2 History (why there are so many migrations)

| Migration | What happened |
|---|---|
| `20260826180000_add_limit_to_device_calibration_parameter` | First attempt: `limitKind` enum (`PLUS_MINUS`/`MAX`/`MIN`) + single `limitValue` + `limitUomId`. **Never backfilled.** |
| `20260826190000_replace_limit_fields_with_tolerance_fields_...` | Rejected the enum+single-value design (couldn't store "nominal 25 ± 6" — no home for the nominal; couldn't store an explicit `2–8` range). Replaced with the current `toleranceMin` / `toleranceMax` / `toleranceNote`. (`Revise_G1_Correct_Tolerance_Design.md`) |
| `backfill-device-calibration-parameter-tolerances.ts` | Backfilled all 242 original rows from the LK worksheets. Ventilator rows sourced from the secondary `docs/legal_n_competency/Penilaian Kemampuan.zip` (the primary `technician-docs.zip` has no LK Ventilator). |
| `20260829010628` + `20260829020000` | Added `decimalPlaces Int?` + CHECK; backfilled NUMBER rows to `2`, then revised to `0` per product owner. |
| `fix-collapsed-pattern-c-parameters.ts` (2026-08-27) | Split 7 Pattern-C rows that had crammed 2–3 distinct variant tolerances into one `toleranceNote` — net **+8 rows**. (`ACLV_CHAMBER_TEMP→_DT1/_DT2/_DT3`, `ACLV_STER_TEMP→_121/_134`, `ACLV_STER_TIME→_121/_134`, `BSC_LIGHT_INTENSITY→_ON/_OFF`, `BSC_SOUND_LEVEL→_ON/_OFF`, `LAF_SOUND_LEVEL→_BACKGROUND/_COMPARTMENT`, `DXRAY_HVL→_70KV/_80KV`.) |

### 2.3 Live coverage stats (queried against `pkmdb`, 2026-09-07)

| Metric | Count |
|---|---:|
| Total `DeviceCalibrationParameter` rows | **489** |
| `valueType = NUMBER` | 486 |
| `valueType = RATIO` | 2 |
| `valueType = BOOLEAN` | 1 |
| `valueType = TEXT` | 0 |
| Rows with `toleranceMin` non-null | 244 |
| Rows with `toleranceMax` non-null | 346 |
| Rows with **both** bounds non-null | 180 |
| Rows with **neither** bound (min = max = null) | **79** |
| Rows with `toleranceNote` non-null | 488 (1 row has none) |
| Rows with `decimalPlaces` null | 3 (the 2 RATIO + 1 BOOLEAN) |

### 2.4 What is *missing* / partial (deliberate, documented)

- **79 rows have neither structured bound** — this is **not** a data gap. Per `G1` in
  `Rangkuman_Gap_Konfirmasi_User.md`: these are parameters whose tolerance is *"±delta from a
  setting point that varies"* (e.g. Systolic tested at 7 different pressures 60–250 mmHg, each
  `± 5 mmHg`). There is no single absolute window at the master level — the nominal is only known
  at measurement time. `toleranceNote` (e.g. `"± 5 mmHg"`) is the raw material the future
  measurement layer must parse. (The 08-29 doc counted 45 such rows on the original 242; the live
  count is 79 across all 489.)
- **1 row has no `toleranceNote` at all**: `INCU_RECOVERY_TIME` (Baby Incubator "Waktu Pemulihan
  Suhu") — the LK section header exists but the tolerance row was blank in the source document.
  This is the same thing as open item **H2** (the "15 minutes" limit that vanished between LK
  document revisions — awaiting user confirmation).
- **Class-dependent tolerances are flattened**: e.g. Equipment Leakage Current `≤500µA (Class I)`
  vs `≤100µA (Class II)` — the general case is stored numerically and the full detail lives in
  `toleranceNote`. Affected rows named in the G1 note: `BSM_EQUIP_LEAKAGE`, `PM_EQUIP_LEAKAGE`,
  `ECG_EQUIP_LEAKAGE`, `BREASTP_EQUIP_LEAKAGE`, plus multi-band `INCU_AIR_TEMP`,
  `BREASTP_MAX_VACUUM`. Acknowledged simplification, not a structural solution.
- **`decimalPlaces` is uniformly `0`** on every NUMBER row — a structural placeholder, *not*
  verified per-parameter data. Accurate per-parameter values (Bed Side Monitor = 5, Tensimeter =
  1, …) are an explicitly deferred follow-up.
- **`toleranceMin/Max` are `Decimal(18,4)`** — flagged: if the accurate-values pass ever surfaces
  a tolerance *bound* needing 5+ decimal places, a widening migration is required.

---

## 3. G3 status — reference-equipment model, live schema vs 08-29 proposal

**Status: DONE, then substantially redesigned (2026-09-05). Name unchanged; shape very different.**

### 3.1 The 08-29 investigation proposed (`Implement_G3_JobReferenceEquipmentUsed.md`)

```prisma
model JobReferenceEquipmentUsed {
  id               String   @id @default(cuid())
  calibrationJobId String
  equipmentName    String          // REQUIRED free-text
  brand            String?         // free-text
  model            String?         // free-text
  serialNumber     String?         // free-text
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  calibrationJob   CalibrationJob @relation(..., onDelete: Cascade)
  @@index([calibrationJobId])
}
```
Rationale at the time: "no reference-equipment master catalog exists" → free text, mirroring
`Device.brand/model/serialNumber`.

### 3.2 What actually shipped first (migration `20260826200000_add_job_reference_equipment_used`)

Exactly the proposal above — free-text `equipmentName` + `brand`/`model`/`serialNumber`, single
`@@index([calibrationJobId])`, Cascade from job. No `companyId`.

### 3.3 What it is now (migration `20260905104207_fix_job_reference_equipment_used_fk`)

The free-text columns were **dropped** and replaced (full model in §1.5):

| Removed | Added |
|---|---|
| `equipmentName` (String, required) | `equipmentId` (String, required) → **FK `Equipment` `onDelete: Restrict`** |
| `brand`, `model`, `serialNumber` (free-text) | `equipmentCalibrationRecordId` (String?) → FK `EquipmentCalibrationRecord` `onDelete: Restrict` |
| | `companyId` (String, required) |
| | `notes` (String?) |
| | `validityOverridden Boolean @default(false)` |
| | `overrideReason String?`, `overriddenByUserId String?` (→ FK User), `overriddenAt DateTime?` |
| `@@index([calibrationJobId])` (dropped) | `@@unique([calibrationJobId, equipmentId])`, `@@index([companyId, equipmentId])`, `@@index([equipmentCalibrationRecordId])`, `@@index([overriddenByUserId])` |

### 3.4 Differences from the 08-29 proposal — explicit

1. **Free-text → hard FK.** Between 08-29 and 09-05 a real reference-equipment master layer was
   built: `EquipmentType` (category/type master, `20260829030000`), `Equipment` (physical
   company-owned units, `20260829040000`), `EquipmentCalibrationRecord` (append-only calibration
   history, `20260829060000`), `DeviceTypeEquipmentRequirement` (which EquipmentType a DeviceType
   needs), and `WorkOrderEquipment` (units confirmed onto a WorkOrder, `20260901103230`). So the
   "no master catalog" premise that justified free text no longer holds.
2. **`equipmentCalibrationRecordId`** links the *specific* calibration certificate of the
   reference instrument that was in force when it was used — traceability the free-text version
   couldn't express.
3. **Validity-override block** (`validityOverridden` + reason + `overriddenByUserId` +
   `overriddenAt`): a TECHNICIAN_MANAGER can force-accept a reference instrument whose calibration
   is expired/missing, with an audit trail. (TECHNICIAN_MANAGER *may* do this from tech-pwa — the
   one documented exception to "manager decisions are Portal-only".)
4. **`companyId`** now present (still no FK to Company — matches project convention).
5. **`@@unique([calibrationJobId, equipmentId])`** — a given reference unit can be recorded on a
   job at most once.
6. **Candidate set is constrained**: locked decision — reference equipment for a job comes
   *solely* from that job's WorkOrder's confirmed `WorkOrderEquipment` list, never a fresh
   company-wide search.
7. Runtime shipped: `feat(api): record reference equipment used on a CalibrationJob` (2026-09-05),
   Portal read-only view on the job detail page (2026-09-06), tech-pwa record + view.

### 3.5 Live data

3 `JobReferenceEquipmentUsed` rows in `pkmdb`.

---

## 4. Does `CalibrationTestPoint` (or any equivalent) exist anywhere?

**No. Confirmed by:**
- `grep -rE 'CalibrationTestPoint|TestPoint|MeasurementEntry|CalibrationSettingPoint|settingPoint'`
  across the whole repo → **only doc files** match (the two investigation reports). Zero hits in
  `packages/db`, `apps/`, `packages/shared`, or anywhere in code.
- `grep -rE 'CalibrationTestPoint|TestPoint'` excluding `docs/**` → **no files found**.
- No migration folder mentions any such table. The newest 67 migrations were scanned; the last
  measurement-adjacent one is the 2026-08-13 init (which created `MeasurementResult` in its
  current form) — nothing since.
- No Prisma model, no enum, no `@@` index, no partial/renamed variant.

`CalibrationTestPoint` exists **only as a design proposal** in:
- `investigation_report_measurement_Pattern_Classification.md` §"Implications for Future
  MeasurementEntry / Test-Point Design" — recommends "test-point with optional tolerance
  override" (a parent `DeviceCalibrationParameter` + N child test-points, each optionally
  overriding `toleranceMin/Max/Note`, plus facets like `direction` naik/turun and a reference
  reading alongside the UUT reading).
- `investigation-lk-vs-measurement-schema.md` §"Suggested Directions" A — proposes a
  `MeasurementEntry` model between `CalibrationJob` and `DeviceCalibrationParameter`
  (`calibrationJobId`, `deviceCalibrationParameterId` FK, `settingLabel`, `replicateIndex`,
  `measuredValue`, `isWithinTolerance`).

Neither has been implemented, scaffolded, or migrated in any form.

---

## 5. Reconciliation against `Rangkuman_Gap_Konfirmasi_User.md` (G1–G4)

The gap document lives at
`docs/claude/plans/management-portal/Calibration-management/Rangkuman_Gap_Konfirmasi_User.md`
(last git-touched 2026-09-01 in a bulk docs commit; content reflects the 08-29→09-01 state).
Section **G** ("Desain Penyimpanan Hasil Pengukuran Teknisi").

| Gap | Status **as documented in the file** | Status **from live schema (this report)** | Agree? |
|---|---|---|---|
| **G1** — tolerance field missing on `DeviceCalibrationParameter` | ✅ **SELESAI.** "`toleranceMin`/`toleranceMax` (Decimal) + `toleranceNote` … 242/242 rows backfilled. 88 min+max, 26 min-only, 83 max-only, 45 neither, 241/242 with note. 1 row failed: `INCU_RECOVERY_TIME`." Priority list item 4 repeats: "✅ sudah selesai, 242/242 baris ter-backfill, 1 baris tidak bisa di-resolve." | Fields exist exactly as described **plus** `decimalPlaces Int?` added afterward. Catalog has since **grown to 489 rows / 51 DeviceTypes** (was 242/27) via the 24-type extension seed + the +8 Pattern-C split. Live coverage across all 489: min 244, max 346, both 180, **neither 79**, note 488 (**1 row — `INCU_RECOVERY_TIME` — still has no note and no bounds**). | **Agree**, with the caveat that the doc's numbers describe only the original 242. The document does not mention `decimalPlaces` or the catalog growth (those post-date it). The single unresolved row (`INCU_RECOVERY_TIME`) is confirmed still unresolved and is the same thing as open item **H2**. |
| **G2** — how to model ~10 distinct measurement-structure shapes | ❓ **OPEN — needs design discussion.** "Laporan investigasi mengusulkan model `MeasurementEntry` dengan sedikit field fleksibel + celah `Json`. Pertanyaan: apakah pendekatan ini … sesuai …?" Priority list item 15: "G2, G4 … perlu diskusi desain lebih dulu … tetap memblokir modul CalibrationJob/Tech-PWA." | **Confirmed still fully open.** `MeasurementResult` is untouched since init — untyped `payloadJson`, no FK to the parameter master, no runtime, 0 rows. No `MeasurementEntry` / `CalibrationTestPoint`. The `Pattern_Classification` follow-up (2026-08-27) sharpened the recommendation to "test-point with optional tolerance override" but nothing was built. **This is exactly what STAGE 2 must design.** | **Agree.** |
| **G3** — "Daftar Alat yang Digunakan" has no schema home | ✅ **SELESAI** *(schema only)*. Priority list item 6: "✅ selesai (schema saja, CRUD/UI menyusul saat modul CalibrationJob dibangun)." | **Exceeded.** `JobReferenceEquipmentUsed` not only exists but was **redesigned from free-text to a hard `Equipment` FK** (2026-09-05) and now has full runtime + Portal + tech-pwa UI + a manager validity-override path. 3 rows live. | **Partial disagreement — the doc understates it.** The doc says "schema only, CRUD/UI later"; reality is CRUD/UI shipped *and* the schema was materially redesigned (free-text → FK). Anyone reading only the gap doc would have a stale mental model of this table. |
| **G4** — "Telaah Teknis" scoring structure varies (incl. 1 categorical outlier `LK Kelistrikan`) | ❓ **OPEN.** "Pertanyaan: apakah `LK Kelistrikan` … alur kerja terpisah … atau tetap harus diakomodasi …?" Priority list item 15 groups it with G2 as "perlu diskusi desain." | **Confirmed still fully open.** `QualityReview` is unchanged since init — `decision` (APPROVE/REJECT) + `status` + free-text `notes` only. No `QualityReviewScoreLine`, no weighted-category columns, no `conclusionType` discriminator. No runtime. | **Agree.** |

**Other gap-doc items that bear on MeasurementResult design (not G-series but relevant):**
- **F2** ("Linkage `MeasurementResult` ↔ `DeviceCalibrationParameter`") — doc says *"Belum ada
  rancangan sama sekali — baru sebatas 'disadari sebagai gap'."* Live: **still true.** No FK, no
  design.
- **D1** (`CalibrationJobStatus` has no `CANCELLED`) — doc says open, workaround = delete row.
  Live: **still true**, enum unchanged.
- **H1** (NIBP tolerance ±5 vs ±8 mmHg) — **open, flagged as most urgent.** `±5 mmHg` is live in
  `BSM_SYSTOLIC/DIASTOLIC/MAP`, `BPM_*`, `PM_*` (via `toleranceNote`). Affects pass/fail once the
  measurement layer computes it.
- **H2** (Baby Incubator recovery-time limit vanished) — **open.** = the `INCU_RECOVERY_TIME` row
  with no bounds and no note.
- **A1** (I:E Ratio) — resolved: `valueType` enum gained `RATIO`; `VENT_IE_RATIO` seeded as
  `RATIO` with `uomId = null`. Live DB has 2 RATIO rows (the second is a microscope
  magnification-ratio parameter).

**No live-schema contradiction of the gap document's G-series claims was found.** The only
mismatch is one of *staleness / understatement*: G3 is described as "schema only" when it is
actually built and redesigned, and the G1 entry's counts predate a near-doubling of the catalog.

---

## 6. Additional design notes / decisions about MeasurementResult since 08-29

Searched `docs/claude/plans/**` (and `docs/cursor/**`, `docs/ERD/**`) for anything touching
measurement entry / `MeasurementResult` / `MeasurementEntry` / test-points that postdates the
08-29 investigation. Findings:

| Doc | Date | What it says about measurement entry |
|---|---|---|
| `device-management/devicecalibrationparameters/investigation_report_measurement_Pattern_Classification.md` | 2026-08-27 (just before the 08-29 doc; both are pre-CalibrationJob-build) | The Pattern A/B/C/D classification the STAGE-1 brief refers to. Recommends: Pattern A (~50%) = zero-ceremony default (one parameter, N trials, tolerance on the parameter); Pattern B (~28%) = child "setting points" that **inherit** the parent tolerance; Pattern C (~9%) = test-point with **optional tolerance override** (preferred over splitting into separate parameters); Pattern D (~13%) = heterogeneous, store a **summary result** + attachment reference for logger-based uniformity, `direction` facet for up/down ramps, a reference-reading column for paired ref-vs-UUT, `BOOLEAN` for qualitative. Also: `toleranceNote` is "doing structural work it shouldn't" — parse into real bounds. **Not implemented.** |
| `device-management/devicecalibrationparameters/report_7_collapsed_pattern_c_rows.md` + `Fix_7_Collapsed_Pattern_C_Rows.md` | ~2026-08-27 | Led to `fix-collapsed-pattern-c-parameters.ts` (+8 rows). Only touches the *master catalog*, not measurement entry. |
| `device-management/devicecalibrationparameters/after-meeting-20260828/implementation_report_redesign.md` | 2026-08-29 | The `decimalPlaces` + list-UI redesign. §1.6 explicitly: *"There is no Measurement, Result, Reading, or Technician-App entity referencing `DeviceCalibrationParameter` yet … a future measurement-entry feature can read `parameter.decimalPlaces` directly."* §11.5: *"Measurement / Technician App — deliberately untouched. The design leaves `parameter.decimalPlaces` trivially consumable by a future measurement-entry feature (no consumers exist today)."* Confirms measurement entry was **explicitly out of scope** and left "architecturally ready". |
| `technician-app/pre-implementation-audit/Technician-App-Calibration-Readiness-Audit-Report.md` | ~2026-09-01 | Lists "Typed measurement / result entry (per-parameter, pass/fail, reference standard)" as **MISSING** ("only `MeasurementResult.payloadJson Json`"). "Risks: Schemaless `MeasurementResult.payloadJson` — if the Technician App writes an ad-hoc shape now, the Portal review UI, tolerance evaluation, and certificate generation inherit an unversioned contract that is expensive to migrate. Define the payload contract (and its link to `DeviceCalibrationParameter`) before the first write path ships." Open questions it raises: *"`MeasurementResult.payloadJson` structure; must values reference `DeviceCalibrationParameter.id`? … QA review per-`CalibrationJob` or per-`WorkOrder`?"* **Its schema line-number quotes are now stale** (predates the identity-fields / unit-ordinal migrations). |
| `technician-app/ui-tasks/investigation-job-reference-equipment-linking.md` + `Investigate_JobReferenceEquipment_Linking.md` | ~2026-09-05 | The G3 free-text→FK redesign investigation. Not about MeasurementResult proper. |
| `technician-app/HANDOFF_2026-09-05_Session_Summary.md` | 2026-09-05→06 | §4 "Plans on file (not yet started)": *"**MeasurementResult** — the actual calibration measurement data (multi-point, multi-replicate readings tied to `DeviceCalibrationParameter`) is **completely unbuilt** — still an untyped JSON blob with no runtime. This is the single largest remaining gap before the system can complete one full calibration cycle end-to-end. An investigation task for this was planned but not yet run this session (superseded by the deployment work)."* Also: Certificate and QualityReview are schema-only, no runtime. |

**Conclusion:** there is **no design document for MeasurementResult / measurement entry that
postdates the 08-29 investigation.** Everything since then has either (a) hardened the *master
catalog* (`DeviceCalibrationParameter` — tolerance, decimalPlaces, ordering, Pattern-C splits,
24-type extension) or (b) built the *surrounding* runtime (CalibrationJob fan-out, AKD/AKL gate,
Identity Correction, JobReferenceEquipmentUsed). The measurement-capture model itself has been
deliberately left untouched and "architecturally ready" for exactly the STAGE 2 design task.

---

## 7. Current row / data state

Queried against `pkmdb` (local native dev DB) on 2026-09-07.

### 7.1 Master catalog

| Metric | 08-29 baseline | **Now** |
|---|---:|---:|
| `DeviceCalibrationParameter` rows | 242 | **489** |
| Distinct `DeviceType`s with ≥1 parameter | 27 | **51** |
| Total `DeviceType` rows | (~35 official + extras) | **59** |
| `valueType` split | (implied ~239 NUMBER) | 486 NUMBER / 2 RATIO / 1 BOOLEAN / 0 TEXT |

**What changed since "242 rows / 27 device types":**
- **+239 rows** from `seed-device-taxonomy-extension-parameters.ts` — the "24 new DeviceTypes"
  extension (Autoclave, Bio Safety Cabinet, Laminar Air Flow, Dental Unit, Dental X-Ray,
  Audiometer, CPAP, Fetal Doppler, Examination/Head/Operating-lamp family, Laryngoskop,
  Centrifuge/Rotator, EST, Mikroskop, Infusion/Syringe Pump, Nebulizers, Phototherapy,
  Spirometer, Suction Pump, etc.). Explicitly **excluded**: Auto Chemistry Analyzer, Hematologi
  Analyzer, pH Meter, Thermohygrometer (pending H4/H5), Otoscope, Phaco Emulsifikasi (mislabeled
  files, not real device types).
- **+8 rows** from `fix-collapsed-pattern-c-parameters.ts` (2026-08-27) — 7 collapsed Pattern-C
  rows split into their real per-variant rows.
- 242 → 481 → **489**. (The `Pattern_Classification` doc's "481" predates the +8 fix landing in
  the seed; the live DB is 489.)
- The original **242 rows were not otherwise altered** — the redesign report and the extension
  seed both state the original set is untouched aside from the tolerance/decimalPlaces backfills
  (which are UPDATEs, not row changes) and were verified row-count-stable.
- Seed corrections since 08-29: the tolerance backfill (242/242), `decimalPlaces` backfill
  (`2`→`0`), the Pattern-C split (+8), and the Bahasa-Indonesia name alignment (Phase 1 + Batches
  1–4: 13/13 categories, 30/30 capabilities, 85/98 items, 473/489 parameters renamed to LK
  terminology; remainder deliberately kept English).
- **8 DeviceTypes still have no parameters** (59 total − 51 covered): the excluded analyzers/pH
  Meter/Thermohygrometer, plus the Kemenkes types with no LK document at all (gap A2: Ambulatory
  ECG, Cardiac Output Units, Oxygen-Air Proportioners, Regulators, Paraffin Baths, etc.).

### 7.2 Runtime / transactional tables

| Table | Live rows | Notes |
|---|---:|---|
| `MeasurementResult` | **0** | no runtime, never written |
| `CalibrationJob` | 6 | trial data — see below |
| `WorkOrder` | 2 | trial data |
| `JobReferenceEquipmentUsed` | 3 | trial data |
| `IdentityCorrection` | 4 | trial data (runtime exercised) |
| `Certificate` | 0 | schema-only, no runtime |
| `QualityReview` | 0 | schema-only, no runtime |

**Caveat on the runtime rows:** the 2026-09-05 handoff describes a planned **full wipe of the
commercial-chain trial data** (`CalibrationRequest → … → CalibrationJob → downstream`) targeting
the **VPS production `pkmdb`**, because a trial Excel import with `Qty=3` on 3 distinct-unit rows
fanned out into too many jobs. That wipe was *not yet committed/run* when the handoff was written,
and it targets production — **the local dev `pkmdb` queried here still has its trial rows** (6
jobs, 2 WOs, 4 corrections, 3 reference-equipment). These are trial/QA artifacts, not real
customer data; treat all runtime counts above as "trial data present, not production-meaningful".

---

## 8. Uncertain / not statically confirmable

- **Exact per-migration attribution** of a few `CalibrationJob` AKD/AKL fields
  (`akdAklApprovedByUserId`/`At`/`DecisionNote`) — they appear across the escalation migration set
  (`Implement_CalibrationJob_AkdAkl_Escalation_Staged.md` work, early September); I did not read
  every escalation migration line-by-line. The **current** schema state (§1.3) is quoted verbatim
  and is authoritative regardless of which migration added which column.
- **Whether the VPS production DB trial-data wipe has since been executed** — cannot tell from
  local static files; the handoff left it "in progress". Local dev DB is unaffected either way.
- **`decimalPlaces` accuracy** — every NUMBER row reads `0`; this is a known placeholder, not
  verified data. Do not build pass/fail rounding logic assuming these values are real.
- **The precise count of extension-seed rows by static grep** (the `t(...)` helper and multi-line
  definitions make a line count unreliable — got 93 `t(` lines but the row total is clearly
  higher). The **live DB count of 489** is the authoritative figure and is what §7 uses.
- **`toleranceNote` parse-ability** — 79 rows carry only a note (no bounds). Whether each note is
  machine-parseable into a "nominal ± delta" rule for the measurement layer was not audited row
  by row here; the `Pattern_Classification` doc is the closest thing to that analysis.

---

## 9. Inputs this hands to STAGE 2 (design), stated as facts only

1. `MeasurementResult` is a clean slate: untyped `payloadJson Json` + `summaryJson Json?` +
   `recordedAt`, Cascade FK to `CalibrationJob`, `companyId` (no FK), **0 rows, no runtime**.
   Nothing to migrate away from; nothing depends on its current shape.
2. The master catalog it must link to is `DeviceCalibrationParameter` (489 rows, 51 DeviceTypes),
   which now carries `toleranceMin/Max (Decimal(18,4))`, `toleranceNote`, `decimalPlaces`,
   `valueType {NUMBER,RATIO,TEXT,BOOLEAN}`, `sortOrder`, `isActive`, and a
   `DeviceCapabilityItem → DeviceCapability` taxonomy above it. It has full CRUD +
   `findAllGroupedByDeviceType`.
3. `CalibrationJob` provides the entry point: fan-out at `PENDING`, work window at `IN_PROGRESS`
   (gated by `startedAt` + AKD/AKL gate), handoff at `SUBMITTED`. No `CANCELLED`. `deviceId` may
   be null when measurement starts. `unitOrdinal`/`unitTotal` identify the physical unit.
4. `JobReferenceEquipmentUsed` already captures the "Daftar Alat yang Digunakan" section as
   `Equipment` FKs — the measurement model does **not** need to re-model reference equipment.
5. `IdentityCorrection` is the built template for a submit→sign→manager-approve→photo workflow
   (numbering, `PENDING_REVIEW→APPROVED/REJECTED`, `decidedBy/At/Note`, durable `reason`,
   polymorphic `FileObject` evidence, `SignatureStatus` for unavailable/refused, Portal-only
   manager decision).
6. Still open and feeding into (or scoped around) this design: **G2** (structure shapes), **G4**
   (Telaah Teknis scoring — `QualityReview` unchanged), **F2** (the FK itself), **D1** (no
   CANCELLED), **H1** (NIBP ±5 vs ±8), **H2** (`INCU_RECOVERY_TIME` blank), plus the 79
   note-only / setting-point-relative tolerance rows and the uniform-`0` `decimalPlaces`.
7. Both prior proposals on file — `MeasurementEntry` (loose row between job and parameter) and
   `CalibrationTestPoint` (parent parameter + N children with optional tolerance override) — are
   **unbuilt**; STAGE 2 is free to adopt, merge, or replace them.

---

*End of STAGE 1 report. No fixes or design proposals made — that is STAGE 2.*
