# Phase 2B Architecture Audit — Equipment Calibration Record & Evidence

**Date:** 2026-08-29
**Author:** afriza.hrp@gmail.com (via Claude Code)
**Source brief:** "MEDCAL — Focused Phase 2B Architecture Audit" (pasted task)
**Prior work:** `implementation_report_equipment_audit.md` (Phase 1 audit),
`implementation_report_equipment.md` (Phase 1), `implementation_report_equipment_phase2a_audit.md`
(Phase 2A audit), `implementation_report_equipment_phase2a.md` (Phase 2A — `Equipment` master, delivered 2026-08-29).
**Mode:** AUDIT / ARCHITECTURE DISCOVERY ONLY.

> ### 23. Explicit confirmation — nothing was modified
> No Prisma schema, migration, database row, API, service, controller, DTO/Zod schema, RBAC
> catalog, seed script, or UI file was changed. No `EquipmentCalibrationRecord`,
> `EquipmentCalibrationStatus`, `EquipmentVerificationRecord`, `calibrationDueDate`,
> `JobReferenceEquipmentUsed.equipmentId`, certificate-upload, or validity/warning/block logic
> was created. `Equipment`, `EquipmentType`, `DeviceTypeEquipmentRequirement`,
> `JobReferenceEquipmentUsed`, `CalibrationJob`, `WorkOrder`, `WorkOrderAssignment` are
> untouched. This report is the only artifact produced.

---

## 1. Executive summary

The desired outcome is **not** a boolean `Equipment.status = VALID`. It is:
*an auditor can ask "why was this reference equipment considered fit for use?" and MEDCAL
shows the underlying evidence* — a calibration event, its certificate, its validity period,
and MEDCAL's own acceptance decision, all traceable to the exact physical unit and (later)
to the calibration job that used it.

**What exists today (verified against the code, not the prior audit):**
- `EquipmentType` (Phase 1) + `Equipment` (Phase 2A) — physical-unit master with identity
  (`code` unique per company, `brand`/`model`/`serialNumber`) and a binary `isActive`.
  **Full API + UI.** No calibration/validity fields — by design.
- `DeviceTypeEquipmentRequirement` (Phase 1) — "DeviceType normally requires EquipmentType".
- `CalibrationJob`, `JobReferenceEquipmentUsed`, `MeasurementResult`, `JobEvidence`,
  `QualityReview`, `Certificate`, `FileObject` — **all schema-only, zero application code**,
  no LK/certificate generation anywhere.
- **No** calibration-record model, **no** validity concept, **no** equipment file owner
  type, **no** `FileObject` upload/serve code, **no** generic audit/history model.

**The gap:** every calibration-evidence question (Q3–Q8 in §15) is currently
*Not Answerable*. Identity questions (Q2) are answerable at the master level only.

**Recommended (Option A):**
```
Equipment
  └─ EquipmentCalibrationRecord[]        (append-only calibration events)
       ├─ structured metadata            (certificateNumber, calibrationDate, validFrom?,
       │                                   validUntil, provider, result, remarks)
       ├─ acceptance decision            (acceptedForUse, acceptedByUserId?, acceptedAt?,
       │                                   acceptanceNotes)  ← MEDCAL's "fit for use" evidence
       └─ FileObject[]                    (certificate PDF + annexes, via a new
                                           FileOwnerType.EQUIPMENT_CALIBRATION)
```
Current calibration validity is **derived** from the records for a reference date, never
stored as a hand-maintained field (an optional recomputed cache column on `Equipment` is
acceptable for list/pick-list performance, but it is a cache, not the source of truth).
"Fit for use" and "suitable for a specific parameter" are **distinct derived concepts** —
Phase 2B models calibration validity + acceptance; the point-of-use fitness gate and
parameter-level suitability are deferred.

**Missing links the audit identifies** (none blocks Phase 2B itself):
1. The **authoritative "use date"** for `useDate ≤ validUntil` — still an open business
   question (carried from the 2A audit).
2. The **job-completion flow** that writes `JobReferenceEquipmentUsed` — a separate track;
   `CalibrationJob` has no application layer at all.
3. Generic **`FileObject` upload/serve infrastructure** — a shared prerequisite (JobEvidence,
   Signature, Certificate all need it too; none exists). Phase 2B can ship metadata-first
   and attach files once the infra lands.
4. A **defect / withdrawal event** to fully answer Q9 ("what happened if the equipment was
   defective") — deferred.

---

## 2. Current architecture (verified 2026-08-29)

Source: `packages/db/prisma/schema.prisma` + code search across `apps/`.

### 2.1 Equipment layer — has API + UI

| Model | Fields (actual) | App code |
|---|---|---|
| `EquipmentType` | `id`, `code @unique`, `name`, `description?`, `category?`, `isActive`, timestamps; back-rels `deviceRequirements`, `equipment` | ✅ Phase 1 (`/equipment-types`) |
| `Equipment` | `id`, `companyId`, `equipmentTypeId` (FK → `EquipmentType`, `ON DELETE RESTRICT`), `code`, `brand?`, `model?`, `serialNumber?`, `isActive` (default true), `notes?`, timestamps; `@@unique([companyId, code])`; `@@index([companyId, isActive])`, `@@index([companyId, serialNumber])`, `@@index([equipmentTypeId])`; FK `company` `ON DELETE Cascade` | ✅ Phase 2A (`/equipment`, company-scoped CRUD) |
| `DeviceTypeEquipmentRequirement` | `id`, `deviceTypeId`, `equipmentTypeId`, `notes?`; `@@unique([deviceTypeId, equipmentTypeId])` | ✅ Phase 1 |

`Equipment` has **no** calibration, validity, status-enum, ownership, or location field —
exactly as Phase 2A specified.

### 2.2 Field / QA / Certificate layer — schema-only, NO application code

| Model | Relevant fields | Notes for Phase 2B |
|---|---|---|
| `CalibrationJob` | `companyId`, `workOrderId` (FK cascade), `deviceId`, `status` (`PENDING\|IN_PROGRESS\|SUBMITTED\|REWORK\|ACCEPTED_BY_QA`), `startedAt?`, `submittedAt?`; rels `results`, `evidences`, `referenceEquipmentUsed`, `signature`, `reviews`, `certificate`; `@@unique([workOrderId, deviceId])` | **No `jobDate` / `measurementDate` / `calibrationDate` field.** `startedAt`/`submittedAt` are the only job-level timestamps. No writer, no UI. |
| `JobReferenceEquipmentUsed` | `id`, `calibrationJobId` (FK cascade), `equipmentName` (**required**), `brand?`, `model?`, `serialNumber?`, timestamps; `@@index([calibrationJobId])` | No FK to `Equipment`. No unique. The "actually used equipment" LK snapshot — see §14. |
| `MeasurementResult` | `payloadJson`, `summaryJson?`, `recordedAt` | Not equipment-related. |
| `JobEvidence` | `calibrationJobId`, `fileObjectId` (**required** FK), `caption?` | **Pattern precedent:** a thin join between a parent record and a `FileObject`, with a caption. |
| `QualityReview` | `calibrationJobId`, `reviewerUserId`, `decision` (`ReviewDecision?` = `APPROVE\|REJECT`), `status` (`QualityReviewStatus` = `PENDING\|APPROVED\|REJECTED`), `notes?`, `reviewedAt?`; rel `certificates Certificate[]` | **Pattern precedent:** a per-parent *evaluation record* with a reviewer, a decision, a status, notes, and a timestamp — exactly the shape of an equipment "acceptance / verification" concept. |
| `Certificate` | `calibrationJobId @unique`, `number`, `verificationToken? @unique`, `status` (`CertificateStatus` = `DRAFT\|ISSUED\|REVOKED\|SUPERSEDED`), `issuedAt?`, **`validUntil?`**, `supersedesCertificateId?` (self-rel `supersedes`/`supersededBy`), `revokeReason?`, `pdfFileObjectId?` → `FileObject` (`"CertificatePdf"` relation); `@@unique([companyId, number])`, `@@index([validUntil])` | **Pattern precedent:** a document-backed record with a validity date, a lifecycle status, an explicit **supersession chain** (not in-place edits), a **revoke reason**, and a typed PDF relation. Directly transferable to `EquipmentCalibrationRecord`. |

### 2.3 Document / attachment layer — schema-only

`FileObject`: `id`, `companyId`, `customerId?`, `ownerType` (`FileOwnerType`), `ownerId`
(String — **polymorphic by convention, not a real FK**), `storageKey`, `mimeType?`,
`sizeBytes?`, `originalName?`, `createdAt`. Typed back-relations only for `jobEvidences`,
`signatures`, `certificatePdfs`. `@@index([companyId, ownerType, ownerId])`,
`@@index([storageKey])`.

`FileOwnerType` (actual): `CERTIFICATE | JOB_EVIDENCE | SIGNATURE | REQUEST_ATTACHMENT |
INVOICE | CREDIT_NOTE | OTHER`. **No equipment value.**

**No code uploads, reads, or serves a `FileObject`** (`grep` across `apps/` = nothing). The
storage adapter / upload endpoint is unbuilt — a shared prerequisite for every evidence
feature, not equipment-specific.

### 2.4 Status / evaluation / history patterns available to reuse

| Pattern | Where | Reuse for 2B |
|---|---|---|
| Document-backed record: `validUntil` + lifecycle `status` + supersession chain + `revokeReason` + typed PDF relation | `Certificate` | `EquipmentCalibrationRecord` shape almost 1:1 |
| Per-parent evaluation record: reviewer + `decision` + `status` + `notes` + `reviewedAt` | `QualityReview` | equipment "acceptance / verification" fields (or a future dedicated model) |
| Thin parent↔`FileObject` join with a caption | `JobEvidence` | `EquipmentCalibrationRecord` ↔ certificate file(s) |
| Company-scoped master CRUD module (service takes `companyId`, `@CompanyId()` controller, `@RequirePermission`, `CompanyRoleGuard`) | `Equipment`, `Device` | `EquipmentCalibrationRecord` CRUD, scoped **through its `Equipment`** |
| Binary lifecycle flag | `Equipment.isActive`, `Device.status` | keep for 2B; richer lifecycle deferred |
| Nullable free-text snapshot **alongside** an optional master FK | `Device.brand/model` ↔ `DeviceModel`; `CalibrationRequestItem.deviceId` ("not a FK to Device") | `JobReferenceEquipmentUsed` free-text ↔ future `equipmentId` |

### 2.5 Not present (confirmed)

`EquipmentCalibrationRecord`, `EquipmentCalibrationStatus`, `EquipmentVerificationRecord`,
`EquipmentServiceEvent`, `CalibrationCertificate` (for reference equipment), generic
`AuditLog` / `ChangeLog` / `History`, `WorkOrderEquipment`, `SuratJalan`, any Inventory /
Asset / Maintenance model. (The `Verification` model in the schema is Better Auth's
email/token table — unrelated.)

---

## 3. Definition of Fit / Valid / Suitable (precise terminology)

These are **not** interchangeable. The final recommendation uses them precisely.

| Term | Meaning | Nature | Represented today? |
|---|---|---|---|
| **Active** | The unit is in MEDCAL's roster and has not been administratively withdrawn. | Stored boolean (`Equipment.isActive`). Says nothing about calibration. | ✅ Phase 2A |
| **Calibrated** | A calibration was performed on a specific date, producing a certificate. | Historical fact — one per calibration event. | ❌ → `EquipmentCalibrationRecord` |
| **Calibration-valid (in-calibration) as of date D** | ∃ a calibration record whose validity interval covers D. | **Derived**, time-relative. Not a stored flag. | ❌ |
| **Accepted / verified for use** | MEDCAL (QA/technician) reviewed the calibration evidence and recorded a decision that the unit is accepted back into service. | Recorded human decision (like `QualityReview` for jobs). | ❌ → acceptance fields on the record |
| **Fit for use** (for a job/activity) | Composite gate at point-of-use: Active **and** calibration-valid on the use date **and** accepted **and** no open defect. | **Derived at evaluation time.** Never a stored flag. | ❌ (belongs to the point-of-use flow — later) |
| **Suitable for a specific measurement / parameter** | Metrological adequacy (range, resolution, uncertainty / CMC) of this equipment for a given `DeviceCalibrationParameter`. | Technical judgement / capability data. | ❌ — coarse proxy only via `DeviceTypeEquipmentRequirement`. **Defer.** |

**What MEDCAL actually needs to represent in Phase 2B:** *Calibrated* + *Calibration-valid*
(via records) and *Accepted for use* (via a decision on the record). *Active* already
exists. *Fit for use* is the derived composite — model the inputs now, compute it at
point-of-use later. *Suitable-by-parameter* is documented as a future extension, not built.

An equipment can be **Active but not Fit for use** (calibration expired). It can be
**Calibrated but not Accepted** (certificate received, QA has not signed off). It can be
**Calibrated and Accepted but not Suitable** for a particular high-precision parameter.
Phase 2B must not collapse these.

---

## 4. Evidence requirements

Minimum evidence for MEDCAL to justify *"this equipment is fit/valid for use"*, and where
each piece belongs:

| # | Evidence | Belongs on | Phase 2B? |
|---|---|---|---|
| **A** Equipment identity — code, brand, model, serial | `Equipment` (already there) | already done |
| **B** Calibration evidence — calibration date, certificate number, provider, valid-from?, valid-until, result | **`EquipmentCalibrationRecord`** (structured columns) | ✅ |
| **C** Verification / acceptance — was it accepted against requirements, by whom, when, on what basis | **acceptance fields on `EquipmentCalibrationRecord`** (`acceptedForUse`, `acceptedByUserId?`, `acceptedAt?`, `acceptanceNotes?`) — not a separate model for 2B (§12) | ✅ |
| **D** Supporting document — the calibration certificate PDF (+ annexes) | **`FileObject`** with `ownerType = EQUIPMENT_CALIBRATION`, `ownerId = record.id` (0..n) | ✅ metadata + link; actual **upload** gated on shared infra (§9) |
| **E** Equipment condition / status — active, known defect, out of service, repair | `Equipment.isActive` for withdrawn; a structured **defect / out-of-service event** for "what happened when it failed" | `isActive` only in 2B; defect/withdrawal event **deferred** (§13) |

The **structured metadata (B + C) is what the system evaluates**; the PDF (D) is the
human-auditable backing. The system must be able to compute validity **without parsing a
PDF** (§10).

---

## 5. `EquipmentCalibrationRecord` analysis

`Equipment → EquipmentCalibrationRecord[]` is the correct relationship. Explicit answers:

| Question | Answer |
|---|---|
| One `Equipment` → many records? | **Yes.** One row per calibration event; a unit is recalibrated on a cycle. |
| Historical records immutable? | **Effectively yes.** Editable only while `status = DRAFT` (metadata being entered / certificate not yet attached); **locked after `CONFIRMED`**. Corrections after confirmation = a new record (or an explicit `SUPERSEDED` marker + successor), mirroring how `Certificate` never edits in place. |
| Which record is the *current* calibration evidence? | The record applicable to *today*: the one with the **latest `calibrationDate ≤ today`** whose `validUntil ≥ today`. If the latest such record's `validUntil < today` → the unit is **out of calibration** (no current evidence). |
| How is the latest applicable record for a date D determined? | Order by **`calibrationDate`** (the event date), **not `createdAt`** — a certificate can be entered weeks late. Applicable record = latest `calibrationDate ≤ D`. For a validity check also require `validUntil ≥ D`. |
| Can an old record be edited? | No, once `CONFIRMED`. Typo fixes before confirmation only. |
| Can a record be deleted? | Only a mistaken `DRAFT`. A `CONFIRMED` record must not be deleted — it may be the evidence a past job depends on. |
| What happens when a newer record is added? | History is not rewritten. The new record becomes the applicable record for dates ≥ its `calibrationDate`. Past jobs still resolve to *their* period's record. |
| Overlapping validity periods? | **Possible** (early recalibration before expiry). Rule: for a *validity* check, **any** covering record satisfies it; for "*the* applicable record", pick latest `calibrationDate ≤ D`. |

Recommended conceptual shape (**DO NOT IMPLEMENT**):

```
EquipmentCalibrationRecord {
  id
  equipmentId          FK -> Equipment (ON DELETE CASCADE)
  calibrationDate      Date            // the event date — authoritative for ordering
  validFrom            Date?           // usually = calibrationDate; nullable, see §20 Q2
  validUntil           Date            // the calibration's expiry
  certificateNumber    String?
  provider             String?         // free-text lab name (not an entity yet)
  result               String? | enum? // see §11 — business must confirm vocabulary
  remarks              String?
  acceptedForUse       Boolean @default(false)   // MEDCAL's decision — see §12
  acceptedByUserId     String?  (FK -> User)
  acceptedAt           DateTime?
  acceptanceNotes      String?
  status               enum { DRAFT, CONFIRMED }  // + SUPERSEDED if corrections needed
  createdAt, updatedAt
  @@index([equipmentId, calibrationDate])
  @@index([equipmentId, validUntil])
}
// Documents: FileObject where ownerType = EQUIPMENT_CALIBRATION, ownerId = record.id
```

---

## 6. Calibration validity analysis

Validity is an **interval** attached to each record: `[validFrom ?? calibrationDate, validUntil]`.

"Is the unit calibration-valid as of date D?" = `∃ record: (validFrom ?? calibrationDate) ≤ D ≤ validUntil`.

**Authoritative date — OPEN BUSINESS QUESTION (unchanged from the 2A audit).**
Candidates and where they live:

| Date | Source | Role |
|---|---|---|
| `calibrationDate` | record | the floor of the interval / ordering key |
| `validFrom` | record (nullable) | explicit interval start if the lab states one ≠ calibrationDate |
| `validUntil` | record | the gate — the primary thing checked |
| certificate issue date | (would be a record field) | administrative, not the validity floor |
| `CalibrationJob.startedAt` / `submittedAt` | job | candidate "use date" |
| a not-yet-existing `CalibrationJob.measurementDate` | — | the date the LK actually shows |
| `WorkOrder.scheduledStart` | work order | planning date, weaker |
| exact date/time of actual equipment use | not captured anywhere | the ideal, needs the job flow |

The equipment side of the interval is well-defined (`[validFrom ?? calibrationDate, validUntil]`).
**The "use date" it is compared against is not resolvable from the current architecture** and
must be decided by the business. This audit does **not** choose one.

---

## 6b. Current-vs-derived status analysis (brief §6)

| Approach | Verdict |
|---|---|
| `Equipment.calibrationDueDate` + `Equipment.calibrationStatus` as the **source of truth** | ❌ Rejected. Overwritten on every recalibration (loses "valid on a past job date" — the core outcome), has no certificate pointer, drifts if not hand-maintained, and can't represent overlapping periods or "out of calibration". This is the anti-pattern the brief names. |
| `EquipmentCalibrationRecord[]` as source of truth, **status derived** | ✅ Recommended. `isCalibrationValid(asOf)`, `currentCalibrationValidUntil`, `latestCalibrationRecord` are pure functions of the records. History is intact; a new record never destroys an old answer. |
| **+ a recomputed cache** on `Equipment` (`currentCalibrationValidUntil Date?`, `currentCalibrationRecordId String?`) | ✅ Acceptable *as a cache only* — recomputed on every record write, **never hand-edited**, and never the thing an audit answer is read from. Justified because the Equipment Units list / a future pick-list will want to show and filter by validity without an N+1 over records. |

**SOURCE OF TRUTH = calibration evidence/history. STATUS = derived result** (optionally
cached for read performance). Store the records; derive the status; cache only for the list
view.

---

## 7. "Valid" vs "Fit for use"

Model them as **distinct derived concepts**, not two stored booleans:

- **Calibration validity** = pure function of `EquipmentCalibrationRecord[]` + a reference
  date. Objective.
- **Fitness for use** = `isActive` **AND** calibration-valid on the use date **AND**
  `acceptedForUse` on the applicable record **AND** no open defect. A *composite judgement*
  evaluated at the point of use.

**Phase 2B models the inputs:** the records (validity) + the `acceptedForUse` decision.
**Phase 2B does not build the fitness gate itself** — that check belongs to the
point-of-use flow (equipment assignment / job start / LK issuance), which does not exist
yet. Document the composite rule; implement it with `WorkOrderEquipment` / the job flow
later.

**Suitability for a specific calibration parameter** (range / resolution / uncertainty for
`DeviceCalibrationParameter` X) is a **future extension, not Phase 2B** — no current
business artifact requires parameter-level equipment capability data, and it is a large
concept (CMC tables). Documented in §9.

---

## 8. Equipment Type → Required Equipment (what it proves)

`DeviceType → DeviceTypeEquipmentRequirement → EquipmentType` proves:

> "For this Device Type, this *type* of reference equipment is normally required."

It does **not** prove:
- that a *particular physical unit* is calibration-valid (that's the records),
- that a unit is *technically suitable* for every calibration parameter of that device type
  (that's parameter-level capability data — not modelled).

**Sufficient for current business requirements?** Yes. The LK "Daftar Alat yang Digunakan"
is a per-job list of equipment used, not a per-parameter capability matrix. Combined with
Phase 2B's calibration records, MEDCAL can show: *the required type → a physical unit of
that type → its calibration evidence → its acceptance*. Parameter-level suitability is
**explicitly deferred** (see §20 Q7).

---

## 9. Evidence document architecture

**`FileObject` is sufficient. No new document subsystem.**

| Question | Finding / recommendation |
|---|---|
| Is `FileObject` sufficient? | Yes — polymorphic `ownerType` + `ownerId`, `storageKey`, `mimeType`, `sizeBytes`, `originalName`, `companyId`. Same model already earmarked for `JobEvidence`, `Signature`, `Certificate`. |
| New owner type needed? | **Yes** — add `FileOwnerType.EQUIPMENT_CALIBRATION` (record-level: `ownerId = EquipmentCalibrationRecord.id`). This is the only schema change `FileObject` needs. |
| Extra metadata on `FileObject`? | **No.** `originalName` + `mimeType` + `sizeBytes` cover it. Nothing equipment-specific. |
| Where does the certificate number live? | **On the record** (`certificateNumber`), as structured data — not only in the file. The system must evaluate validity without opening the PDF (§10). |
| Is the file the evidence, or supporting evidence? | The **structured record is the evidence the system evaluates**; the **PDF is the human-auditable supporting document**. An auditor wants both: the extracted facts *and* the source certificate. |
| How many files per record? | **0..n** — main certificate + optional annexes / adjustment sheets. A `DRAFT` record may exist with 0 files ("document pending"). |
| Typed back-relation? | Optional. Could add `EquipmentCalibrationRecord.documents FileObject[]` via an explicit relation (like `Certificate.pdfFile`), or keep it purely polymorphic (query by `ownerType`+`ownerId`) like most `FileObject` usage. A single typed relation for "the primary certificate" + polymorphic for annexes matches `Certificate`'s own precedent. |

**Hard dependency:** `FileObject` has **no upload/serve code**. Phase 2B can ship the
record + metadata + the enum value and link files *once the generic upload infrastructure
exists* — it is a shared prerequisite (JobEvidence, Signature, Certificate all need it),
not an equipment task. A "document pending" state on the record covers the interim.

---

## 10. Certificate metadata analysis

Minimum **structured** metadata to store independently of the PDF (so validity is
machine-evaluable):

| Field | Rationale |
|---|---|
| `certificateNumber` | audit Q6, cross-reference |
| `calibrationDate` | audit Q4; interval floor; ordering key |
| `validFrom` (nullable) | audit Q5; = `calibrationDate` unless the lab states otherwise (§20 Q2) |
| `validUntil` | audit Q5; **the** gate for validity checks |
| `provider` (free-text string) | audit ("calibration provider"); a `CalibrationProvider` entity is a *possible later*, not now (§20) |
| `result` | audit Q3 / §11 — vocabulary is an open question |
| `remarks` | free-text notes, out-of-tolerance mentions, adjustments |
| document reference(s) | `FileObject` link(s) — §9 |

A PDF alone is **not** sufficient: MEDCAL must filter the Equipment list by "expiring
soon", answer Q8 programmatically, and drive future warnings — all without OCR.

---

## 11. Calibration result

**"Result" has two distinct meanings** that must not be merged:

1. **The lab's outcome** — did the calibration pass? Plausible values: `PASSED`,
   `PASSED_WITH_ADJUSTMENT` / `CONDITIONAL`, `FAILED` / `NOT_PASSED`. **Do not lock these
   without business input** (§20 Q13).
2. **MEDCAL's acceptance decision** — separate from the lab's result. A unit can pass
   calibration and still be held out of service pending review; a "conditional" result
   might still be accepted for limited use. This is `acceptedForUse` + `acceptanceNotes`
   (§12), and it is the direct evidence for audit Q7.

**Recommendation for Phase 2B:**
- `result`: a **nullable field** — either free-text or a **minimal enum** (`{ PASSED,
  NOT_PASSED }`) — final choice deferred to the business (§20 Q13). Plus `remarks`.
- `acceptedForUse` (Boolean) + `acceptedByUserId?` + `acceptedAt?` + `acceptanceNotes?` —
  **include in Phase 2B**. This is the "how did you determine it was acceptable for use"
  evidence and is cheap to add as fields.
- No `NOT ACCEPTED` enum needed separately — `acceptedForUse = false` + `acceptanceNotes`
  covers it.

---

## 12. Verification before return to service

**Recommendation: fields on `EquipmentCalibrationRecord`, not a separate model, for Phase 2B.**

- The common case is: calibration done → certificate received → QA reviews → accepted. That
  is one acceptance decision per calibration event → `acceptedForUse` / `acceptedByUserId`
  / `acceptedAt` / `acceptanceNotes` on the record. Mirrors `QualityReview`'s
  reviewer+decision+notes+timestamp shape without a new table.
- A **separate `EquipmentVerificationRecord`** only pays off when verification happens
  **repeatedly and independently** of calibration — interim/interim-period checks, or
  post-repair verification without recalibration. Those are **"possibly later"** (§19), and
  whether PKM actually does them is an open question (§20 Q8, Q9).
- Post-repair-without-recalibration, if it turns out to be real, can be represented later
  as a calibration record with a `type` discriminator (`CALIBRATION` / `VERIFICATION`) —
  additive, non-breaking.

Simplest architecture that still supports the audit evidence: **acceptance fields on the
record now; dedicated verification model deferred.**

---

## 13. Out-of-service scenario

`Equipment.isActive` (boolean) is the current mechanism. Is it sufficient?

- For **"do not offer this unit for selection"** — yes, `isActive = false` + `notes`.
- For audit **Q9 ("what happened if the equipment was found defective / out of calibration
  / produced questionable results")** — **no**. A boolean has no reason, no date, no actor,
  no history, and cannot express "temporarily out for repair" vs "permanently retired".

**Recommendation:**
- **Phase 2B: change nothing on `Equipment` status.** Keep `isActive`. A calibration record
  with `acceptedForUse = false` + `acceptanceNotes` already documents "calibration failed /
  not accepted".
- **Deferred:** a lightweight **`EquipmentServiceEvent`** (or minimally `Equipment.withdrawnReason`
  + `withdrawnAt`) to record defect / out-of-service / repair events with a reason, date,
  and actor — the minimum needed to fully answer Q9. A rich lifecycle enum
  (`OUT_FOR_CALIBRATION` / `UNDER_REPAIR` / `RETIRED`) is **not** recommended until there is
  a workflow to drive the transitions.

---

## 14. Historical traceability

Chain: `CalibrationJob → JobReferenceEquipmentUsed → (future, nullable) equipmentId →
Equipment → applicable EquipmentCalibrationRecord (by use date) → FileObject`.

| Question | Answer |
|---|---|
| Is the nullable `JobReferenceEquipmentUsed.equipmentId` FK appropriate? | **Yes** — it is the only way to answer Q10 ("trace to the exact physical unit") and to auto-resolve the applicable calibration record for the job's date. **Must be nullable**: borrowed / third-party units have no `Equipment` row; jobs recorded before the link existed have none; an `Equipment` row may later be deleted. **Not implemented now.** |
| Why must the snapshot fields (`equipmentName`, `brand`, `model`, `serialNumber`) remain? | The LK is a printed/legal record — it must reproduce exactly what it showed at issue. `Equipment` can be edited (serial correction, model reclassification) or retired. A borrowed unit has no `Equipment` row at all. Same principle already applied to `Device.brand/model` vs `DeviceModel`, and to `CalibrationRequestItem.deviceId` being deliberately "not a FK". |
| Should the snapshot be immutable? | **Yes** — frozen at job-completion time. Populate it from the `Equipment` row when `equipmentId` is set; allow manual entry when it is not. Never rewrite it when the master changes. |
| Can historical job evidence be reconstructed after `Equipment` changes / recalibration / retirement? | **Yes**, because (a) the snapshot is frozen, (b) `EquipmentCalibrationRecord`s are append-only and each carries its own `calibrationDate` / `validUntil`, so "the record applicable on the job's use date" is deterministic and stable regardless of later recalibrations or retirement. |

**Not to be implemented now** — this section documents *why* the future design works.

---

## 15. KAN / audit question matrix

Classification: **CURRENTLY ANSWERABLE** / **PARTIALLY ANSWERABLE** / **NOT ANSWERABLE**,
with the minimum future data/model each needs. These are the brief's example questions
treated as **general traceability good practice** — this audit does **not** assert that any
specific KAN clause mandates them.

| # | Question | Status | Minimum future requirement |
|---|---|---|---|
| Q1 | What equipment was used for this calibration? | **PARTIALLY** — `JobReferenceEquipmentUsed` schema exists but has no writer and there is no `CalibrationJob` application layer | job-completion flow (separate track) writes `JobReferenceEquipmentUsed` |
| Q2 | What is the equipment's unique identity? | **PARTIALLY** — answerable at the master level (`Equipment.code` + serial/brand/model); not per-job until Q1 + `equipmentId` link | Phase 2B: none extra; per-job needs `JobReferenceEquipmentUsed.equipmentId` (later) + the immutable snapshot |
| Q3 | Was the equipment calibrated? | **NOT ANSWERABLE** | **Phase 2B `EquipmentCalibrationRecord`** |
| Q4 | When was it calibrated? | **NOT ANSWERABLE** | `EquipmentCalibrationRecord.calibrationDate` |
| Q5 | Until when was that calibration valid? | **NOT ANSWERABLE** | `EquipmentCalibrationRecord.validUntil` (+ `validFrom?`) |
| Q6 | Where is the calibration certificate? | **NOT ANSWERABLE** — no equipment file owner type, no `FileObject` upload code | `FileOwnerType.EQUIPMENT_CALIBRATION` + `certificateNumber` on the record + generic upload infra |
| Q7 | How did you determine the equipment was acceptable for use? | **NOT ANSWERABLE** | `acceptedForUse` + `acceptedByUserId` + `acceptedAt` + `acceptanceNotes` on the record (**Phase 2B**) |
| Q8 | Was the equipment valid on the date it was actually used? | **NOT ANSWERABLE** | Phase 2B records + **resolved authoritative use-date** (open question) + (later) `equipmentId` link + a validity check |
| Q9 | What happened if the equipment was found defective / out of calibration? | **PARTIALLY** — `isActive = false` + `notes`, and a future record's `acceptedForUse = false`; no structured reason/date/actor/event | deferred **`EquipmentServiceEvent`** (or `withdrawnReason`/`withdrawnAt`) |
| Q10 | Can you trace this evidence back to the exact physical equipment unit? | **PARTIALLY** — master identity yes; per-certificate/per-job no | `JobReferenceEquipmentUsed.equipmentId` (later) + immutable snapshot + Phase 2B records |

**Phase 2B alone moves Q3, Q4, Q5, Q7 to ANSWERABLE**, and Q6/Q8/Q9/Q10 from *Not* to
*Partially* (pending upload infra, the use-date decision, the job flow, and the defect event).

---

## 16. Evidence chain

Cleanest future chain (Phase 2B builds the **bold** links):

```
                        ┌───────────────────────────────┐
                        │  EQUIPMENT FIT FOR USE          │  ← derived at point of use (later)
                        │  = Active ∧ calibration-valid   │
                        │    on use-date ∧ accepted ∧     │
                        │    no open defect               │
                        └───────────────┬────────────────┘
                                        │
                   ┌────────────────────┼────────────────────┐
                   ▼                    ▼                     ▼
          calibration validity   acceptance decision    condition / defect
          (derived from records) **acceptedForUse**     (Equipment.isActive;
                   │              **acceptedBy/At**       defect event = later)
                   ▼
        **EquipmentCalibrationRecord[]**  (append-only)
          ├─ **calibrationDate / validFrom? / validUntil**
          ├─ **certificateNumber / provider / result / remarks**
          └─ **FileObject[]**  (ownerType = **EQUIPMENT_CALIBRATION**)   ← upload infra = prereq
                   ▲
                   │  applicable record for a given date
                   │
        Equipment  (code / brand / model / serial — Phase 2A)
                   ▲
                   │  (later) nullable equipmentId
        JobReferenceEquipmentUsed  (immutable snapshot: equipmentName/brand/model/serialNumber)
                   ▲
                   │
        CalibrationJob  (needs a job-completion flow — separate track)
```

**Is this chain sufficient?** For Q1–Q8 and Q10 — **yes**, once the four missing links are
in place (§1). It is **not** sufficient for Q9 without a defect/withdrawal event, and it
cannot be *exercised end-to-end* until the `CalibrationJob` application layer and `FileObject`
upload infra exist — but those are outside the equipment track.

---

## 17. Architecture options

### Option A — `Equipment → EquipmentCalibrationRecord → FileObject` (RECOMMENDED)

Record holds **all** structured metadata (cert number, dates, provider, result, remarks)
**and** the acceptance decision (`acceptedForUse`, `acceptedBy/At/Notes`). Certificate
file(s) attached polymorphically via `FileObject` + new owner type.

| Dimension | Assessment |
|---|---|
| Simplicity | Highest that meets the outcome — **one** new model + one enum value |
| Traceability | Full calibration history per unit; applicable record per date |
| Auditability | Q3–Q8 answerable; structured, machine-evaluable |
| Historical accuracy | Append-only records; frozen once `CONFIRMED` |
| Document evidence | `FileObject` (0..n per record) — reuses the established pattern |
| Validity calculation | Pure function of records; no PDF parsing |
| Future WorkOrder integration | `WorkOrderEquipment` attaches to `Equipment`; validity check reads records — clean |
| Future Technician App | App shows a unit's calibration status from the derived value |
| Future LK / certificate integration | LK cites `JobReferenceEquipmentUsed`; auditor drills snapshot → `equipmentId` → applicable record |
| Migration complexity | 1 additive table + 1 enum value (+ optional cache columns on `Equipment`) |
| Over-engineering risk | **Low** — mirrors `Certificate` (validUntil + status + supersession) and `QualityReview` (decision + notes + actor) almost exactly |

### Option B — `Equipment → EquipmentCalibrationRecord → CalibrationCertificate/Evidence` (separate document-metadata entity)

The calibration *event* and the *certificate* (its number, dates, file) are separate rows.

| Dimension | Assessment |
|---|---|
| Simplicity | Lower — an extra entity + join for every read |
| Normalisation | Cleaner *if* one calibration ever has multiple certificates with independent numbers/validities — **PKM: one calibration = one certificate** |
| Traceability / auditability | Same as A |
| Migration complexity | 2 tables + enum |
| Over-engineering risk | **Moderate** — solves a multiplicity PKM doesn't have; annexes are handled by `FileObject[]` in Option A anyway |

### Option C — `Equipment → EquipmentCalibrationRecord → EquipmentVerificationRecord → FileObject`

MEDCAL's acceptance/verification is its own record, distinct from the lab calibration.

| Dimension | Assessment |
|---|---|
| Simplicity | Lowest — 2 new models + files |
| Traceability | Marginally richer: multiple verifications per calibration, interim checks |
| Justified when | PKM performs **repeated independent verifications** (interim checks, post-repair-without-recalibration) — **open question, not current practice** |
| Migration complexity | 2 tables + enum |
| Over-engineering risk | **High for Phase 2B** — builds for a workflow PKM has not confirmed. Fold acceptance into the record (Option A); keep this as a documented future extension |

---

## 18. Recommended architecture

**Option A.**

```
Equipment (Phase 2A — unchanged)
  └─ EquipmentCalibrationRecord[]                         ← NEW (Phase 2B)
       calibrationDate, validFrom?, validUntil
       certificateNumber?, provider?, result?, remarks?
       acceptedForUse, acceptedByUserId?, acceptedAt?, acceptanceNotes?
       status: DRAFT | CONFIRMED   (editable while DRAFT; locked after; correction = new record)
       └─ FileObject[]  (ownerType = EQUIPMENT_CALIBRATION, ownerId = record.id)   ← NEW enum value

Derived (computed; optional recomputed cache on Equipment, never hand-edited):
   Equipment.currentCalibrationValidUntil : Date?
   Equipment.isCalibrationValid(asOf)     : Boolean
   Equipment.latestCalibrationRecord      : record
```

**Checked against the 8 mandatory recommendation criteria (brief §18):**

| # | Criterion | How Option A satisfies it |
|---|---|---|
| 1 | Physical equipment identity unambiguous | `Equipment.code` (`@@unique([companyId, code])`) + brand/model/serial — Phase 2A |
| 2 | Calibration history preserved | append-only `EquipmentCalibrationRecord[]`, `CONFIRMED` records immutable |
| 3 | Current validity derivable from evidence | pure function over records + reference date; no stored source-of-truth flag |
| 4 | Supporting evidence attachable | `FileObject` + `FileOwnerType.EQUIPMENT_CALIBRATION`, 0..n per record |
| 5 | Historical jobs traceable to the physical unit | (later) `JobReferenceEquipmentUsed.equipmentId` + immutable snapshot → `Equipment` → applicable record |
| 6 | Can determine validity on the date of use | applicable record by `calibrationDate ≤ useDate ≤ validUntil` — *once the use-date question is resolved* |
| 7 | No hand-maintained `calibrationDueDate` as source of truth | records are the source; any `Equipment.currentCalibrationValidUntil` is a recomputed cache only |
| 8 | Small enough for MEDCAL | one model, one enum value, optional 2 cache columns; mirrors existing `Certificate`/`QualityReview` patterns |

---

## 19. Phase 2B scope

**IMPLEMENT IN PHASE 2B:**
1. `EquipmentCalibrationRecord` model (§18 shape) + additive migration.
2. `FileOwnerType.EQUIPMENT_CALIBRATION` enum value (schema + migration).
3. Company-scoped CRUD API for records, scoped **through their `Equipment`**
   (`/equipment/:equipmentId/calibration-records` or `/equipment-calibration-records?equipmentId=`);
   new RBAC resource `equipmentCalibrationRecord: [read, create, update, delete]`,
   ADMIN-granted, following the Phase 1/2A convention exactly.
4. Structured metadata: `calibrationDate`, `validFrom?`, `validUntil`, `certificateNumber?`,
   `provider?`, `result?` (vocabulary TBD — ship nullable/minimal), `remarks?`.
5. Acceptance evidence: `acceptedForUse`, `acceptedByUserId?`, `acceptedAt?`, `acceptanceNotes?`.
6. Record lifecycle: `status DRAFT → CONFIRMED`; editable only while `DRAFT`; `CONFIRMED`
   records locked (corrections = new record). Append-only history.
7. Derived validity on the `Equipment` read model (`currentCalibrationValidUntil`,
   `isCalibrationValid`); optional recomputed cache columns on `Equipment` for the list view.
8. UI: a **Calibration Records** panel on the existing Equipment Unit detail page — list
   (date, valid-until, cert number, result, accepted, status) + add/edit-draft + confirm +
   view. Equipment Units list may show a "calibration valid until / expired" indicator.
9. `FileObject` **link** on the record + a "document pending" state.

**DEFER (within 2B's neighbourhood but explicitly out):**
- Actual `FileObject` **upload/serve** — gated on the generic upload infrastructure (shared
  prerequisite; if it lands first, include the upload UI in 2B, else ship metadata-first).
- Separate `EquipmentVerificationRecord`; interim / interim-period checks.
- `EquipmentServiceEvent` / defect / out-of-service / repair history; rich `Equipment`
  status enum (fully answering Q9).
- Parameter-level suitability (`DeviceCalibrationParameter → EquipmentType/Equipment`).
- `WorkOrderEquipment` (assignment / "to bring") + equipment conflict detection.
- `JobReferenceEquipmentUsed.equipmentId` + the immutable snapshot population logic.
- The **fit-for-use gate** and the **validity warning/block** at assignment / job-start /
  LK-issue — needs the job flow and the use-date decision.
- The `CalibrationJob` application layer / job-completion flow (separate track entirely).
- Technician App; Surat Jalan.
- `CalibrationProvider` as an entity (free-text string in 2B).
- Calibration recall reminders (would reuse `ReminderEvent`).

---

## 20. Open business questions (NOT resolved here)

1. **Authoritative calibration / job / use date** for `useDate ≤ validUntil` — which field,
   and does `CalibrationJob` need a new explicit measurement-date column? (carried from 2A)
2. **`validFrom` semantics** — always `= calibrationDate`, or can the lab state a different
   "valid from"? Is the interval inclusive of both endpoints? Is there a grace period?
3. **Certificate validity rules** — fixed recalibration interval per equipment type, or set
   per certificate by the lab? Can MEDCAL ever override the lab's `validUntil`?
4. **Warning vs hard block** when an out-of-calibration unit is selected — and at which
   stage (assignment / job start / LK issuance), and dependent on user role?
5. **Ownership** — PKM-owned only, or ever customer-owned / loaned / third-party? (carried from 2A)
6. **Serial-number uniqueness** — global / per equipment type / none? (carried from 2A)
7. **Suitability by calibration parameter** — has any assessor actually required
   parameter-level equipment capability evidence, or is device-type-level accepted?
8. **Verification before return to service** — is post-repair verification *without*
   recalibration a real PKM process that must be recorded separately?
9. **Intermediate / interim checks** between calibrations — does PKM perform and need to
   record them?
10. **Failed / out-of-tolerance calibration** — must MEDCAL record *as-found* condition,
    adjustments made, and an out-of-tolerance **impact assessment** (reverse traceability to
    certificates issued using that equipment while it was out of tolerance)?
11. **Document retention & immutability** — retention period; who (if anyone) may delete
    evidence; how strictly is `CONFIRMED`-record immutability enforced (DB trigger vs
    service-layer)?
12. **Calibration recall reminders** — does PKM want proactive due-date notifications?
13. **`result` vocabulary** — exact allowed values (`PASSED` / `CONDITIONAL` / `FAILED` …)
    or free-text?
14. **Metadata-first workflow** — can a calibration record be entered (and the unit treated
    as calibrated) before the certificate PDF is available for upload?

---

## 21. Files inspected

- `packages/db/prisma/schema.prisma` (full re-read of: `FileOwnerType`, `CalibrationJobStatus`,
  `ReviewDecision`, `QualityReviewStatus`, `CertificateStatus`, `DeviceStatus`;
  `CalibrationJob`, `MeasurementResult`, `JobEvidence`, `JobReferenceEquipmentUsed`,
  `CustomerSignature`, `QualityReview`, `Certificate`, `FileObject`; `EquipmentType`,
  `Equipment`, `DeviceTypeEquipmentRequirement`)
- `packages/db/prisma/migrations/` — confirmed `Equipment` (`20260829040000_add_equipment`),
  `EquipmentType` + requirement (`20260829030000`), `JobReferenceEquipmentUsed`
  (`20260826200000`); `CalibrationJob` / `Certificate` / `FileObject` originate in the
  initial `20260813063336` bundle, no dedicated migration since
- `apps/api/src/modules/equipment/` (Phase 1 + 2A modules — `equipment.service.ts`,
  `equipment.controller.ts`, `equipment.module.ts`, tests)
- `apps/api/src/modules/me/me.controller.ts`, `packages/auth/src/me-types.ts`,
  `packages/auth/src/access-control.ts` (capability / RBAC conventions)
- `apps/api/src/modules/devices/devices.service.ts` + `.controller.ts` (company-scoped CRUD
  precedent)
- `packages/db/prisma/seed-menu.ts`, `seed-role-permissions.ts`
- Code searches across the repo for: `CalibrationRecord`, `calibrationValid`,
  `calibrationDueDate`, `EquipmentCalibration`, `EquipmentVerification`,
  `JobReferenceEquipmentUsed`, `FileObject` / `FileOwnerType`, `AuditLog` / `ChangeLog` /
  `History` — confirming none of these have application code and no generic audit/history
  model exists
- Prior reports: `implementation_report_equipment_audit.md`,
  `implementation_report_equipment.md`, `implementation_report_equipment_phase2a_audit.md`,
  `implementation_report_equipment_phase2a.md`

---

## 22 / 23. Confirmation

See the boxed statement at the top. **No code, schema, migration, database row, API, RBAC,
seed, or UI was created or modified.** This audit report is the only output. Stopping here
for architecture review before any Phase 2B implementation.
