# MedCal — Final AKD/AKL & Device Identity Control Audit and Business Verdict Confirmation

> **Status: AUDIT / DESIGN VALIDATION ONLY.** No source, schema, migration, seed, API,
> query-hook, helper, UI, or config changes are made or proposed for execution here.
> This document independently challenges the latest business verdict.
>
> Companion documents:
> - `3 medcal-akd-akl-traceability-curious-journal.md` (first field-matrix assessment)
> - `2 medcal-akd-akl-traceability-followup-null-not-dead-end.md` (NULL-state refinement)
> - `technician-app/pre-implementation-audit/Technician-App-Calibration-Readiness-Audit-Report.md`

---

## 0. What the codebase actually contains (ground truth for this audit)

Every verdict below is scored against these verified facts, not against the prior
assessments:

| Area | Reality in the repo today |
|---|---|
| Commercial pipeline `CalibrationRequest → Quotation → PurchaseOrder → WorkOrder` | **Fully built and consumable** — modules, services, controllers, contracts, portal UI, Excel import. |
| `CalibrationJob`, `MeasurementResult`, `QualityReview`, `CustomerSignature`, `Certificate`, `CreditNote` | **Schema + migrated tables only. Zero runtime code.** No module, service, controller, route, hook, or UI. They appear only in `.count()` delete-guards and tests. |
| On-site Device identification / serial confirmation / match-or-create | **Not built.** `DevicesService.create()` is plain master CRUD. `CalibrationRequestItem.deviceId` is deliberately free-text (FK dropped in migration `20260826120000`). The "free-text deviceId → real `Device` rows → N `CalibrationJob` rows" seam is explicitly undesigned. |
| Any AKD / AKL / NIE / regulatory-identity field | **Does not exist anywhere** — zero schema or code hits. |
| Generic audit log / change history / Prisma middleware | **Does not exist.** Only ad-hoc `createdByUserId` / `approvedByUserId` / `confirmedAt` / `revokeReason` columns added per-model, per-need. |
| File upload / storage / polymorphic attachment | **Exists and is generic** — `FileObject` model + `FilesModule` + `FileOwnerPolicyRegistry` + swappable `StorageDriver`. **Local disk only** today (S3/MinIO is a documented future swap). One consumer (`EquipmentCalibrationRecord`). |
| RBAC | **Mature and DB-driven** — `MembershipRole` enum (`SUPERADMIN, ADMIN, SUPERVISOR, TECHNICIAN, FINANCE, CUSTOMER, CUSTOMER_SERVICE`), `access-control.ts` catalog, `RolePermission` grant rows, `CompanyRoleGuard` + `@RequirePermission`. **No "Management" or "Technical Manager" role.** |
| "Berita acara" / on-site customer sign-off | **Does not exist.** `CustomerSignature` is a schema stub (job-level, `@unique`), no service, `SIGNATURE` file policy unregistered. PDF templates have printed wet-signature lines only. |
| Correction / amendment / supersession | **No generic mechanism.** `Certificate.supersedesCertificateId`, `revokeReason`, `CreditNote` all schema-only. The **working** pattern is *"once `CONFIRMED`, immutable — a correction is a brand-new row"* (`EquipmentCalibrationRecord`, `PriceListItem`). `Device.update()` is plain in-place mutation with no history. |
| Established precondition-gate pattern | `assertX()` helper throwing `BadRequestException({ message, code })` at the top of a mutation. `WorkOrder.start()` already blocks `ASSIGNED → IN_PROGRESS` on `equipmentConfirmedAt` — **direct precedent for a start-time regulatory gate.** |

**The single most important consequence:** *you are designing controls for a subsystem that
does not exist yet.* CalibrationJob, its status machine, its QA review, and its certificate
are all vapor. This is not a reason to stop — but it dictates sequencing (see §10) and it
means **the AKD/AKL execution gate must be co-designed with the CalibrationJob module, never
shipped ahead of it.**

---

## 1. Executive verdict

**The core principle is sound. The identity model is sound. The placement matrix is ~70%
sound. The propagation idea should be dropped. The Device Identity Correction workflow is
the right concept but is being sequenced too early and scoped too large.**

- **AGREE:** three distinct identities; NULL-allowed-but-not-a-dead-end; customer-claim vs
  technician-confirmed kept separate; CalibrationJob as the authoritative evidence record;
  Device master write-back only "populate-if-empty, never silent overwrite"; the
  risk-appetite principle.
- **AGREE WITH MODIFICATION:** the execution gate belongs at **job start**, matching the
  existing `WorkOrder.start()` precedent, plus a cheap re-check before certificate issuance —
  not at creation, not only at submit. Device Identity Correction is a legitimate workflow
  but should be **designed now, built with the Technician App**, starting minimal
  (discrepancy-as-data + report + manual resolution) and formalised only after real cases.
- **DISAGREE:** carrying customer-provided AKD/AKL onto **Quotation / PO / Work Order** "as a
  reference snapshot if useful." A value the verdict itself says must *never* be
  authoritative is a liability, not an asset — it triples the change-surface, invites
  mis-trust, and creates divergent copies with no defined authority. The early-warning need
  is a **read/report concern** served by the document-chain join that already exists, not a
  storage concern.

**Unsupported-by-codebase flags:** "Technical Manager" role (doesn't exist), generic audit
trail (doesn't exist — every "auditable/additive history" requirement currently rides on
hand-rolled columns), durable evidence storage (local disk only, F5 incomplete), and the
entire CalibrationJob execution domain.

---

## 2. What we got right

1. **Three identities must stay distinct** (Verdict #1). The codebase already separates
   `Device.code` (system) from `Device.serialNumber` (physical); AKD/AKL is a genuine third
   axis that is entirely absent. No merging, no substitution. **CONFIRMED by existing code.**
2. **NULL at intake is legitimate and must not be forced non-null.** Forcing it produces
   placeholder junk (`"-"`, `"N/A"`, `"000"`) — the codebase already warns against exactly
   this on `CalibrationRequestItem.deviceId`. **CONFIRMED by existing domain comments.**
3. **CalibrationJob is the authoritative evidence record**, snapshot not live reference.
   This matches the repo's own convention (`EquipmentDeliveryNoteItem`,
   `JobReferenceEquipmentUsed`, `WorkOrderItem` all snapshot identity so the document is
   self-contained). **CONFIRMED by existing pattern.**
4. **Customer claim vs technician observation are different facts; a mismatch is data, not
   an error to correct away.** This is the same philosophy as *"a price change is a NEW row,
   never an in-place edit"* (`PriceListItem`) and *"corrections after CONFIRMED = a new
   record"* (`EquipmentCalibrationRecord`). **CONFIRMED by existing pattern.**
5. **Device master write-back = populate-if-empty with explicit confirmation, never
   overwrite.** Mirrors `EquipmentCalibrationRecord`'s separate `acceptedForUse` /
   `acceptedByUserId` / `acceptedAt` decision. **CONFIRMED by existing pattern.**
6. **Not making Requisition AKD/AKL universally blocking** just because CalibrationJob is
   gated (Verdict #6). Correct — the gate belongs at execution, not intake. **REASONABLE
   DESIGN INFERENCE.**
7. **DLN carries no AKD/AKL** (Verdict #2). Correct — the DLN is PKM's own reference-equipment
   transport document. **CONFIRMED by existing model semantics.**
8. **Certificate should consume the CalibrationJob snapshot** (Verdict #10). Correct, and it
   also fixes a latent bug: `Certificate` today has *no* device snapshot fields and would
   render live-FK values — wrong for a historical certificate if the Device is later
   corrected. **REASONABLE DESIGN INFERENCE (with a required addition, see §5).**

---

## 3. What should be changed

### 3.1 Drop AKD/AKL from Quotation, Purchase Order, and Work Order entirely

The verdict hedges: "may be carried … if useful … but must never be authoritative." That
hedge is the problem.

- **These documents are DeviceType-level, not physical-device-level.** A quotation line is
  "Sphygmomanometer × 3", frequently with `deviceId = NULL`. AKD/AKL identifies a *registered
  product for a physical unit*. On a qty-3 aggregate line the question "whose AKD/AKL?" has
  no answer. Storing one value there is a category error.
- **A field that must never be trusted will eventually be trusted.** Someone builds a report,
  a PDF, or a portal view off `QuotationItem.akdAkl` because it's there. Now you have an
  authoritative-looking value that the design says is meaningless.
- **Divergent copies, no authority rule.** Customer clarifies the AKD/AKL after the quotation
  but before the PO. Which copy wins? The verdict provides no answer because there isn't a
  good one.
- **Change-surface cost.** The verified ripple for adding *one* optional field to the
  requisition alone touches ~8 layers (schema, migration, shared zod contract, import
  service + its `HEADER_ALIASES`, import test, backend create + update, manual-entry UI,
  import UI, instruction copy). Propagating through three more documents multiplies that for
  **zero decision value** — none of Quotation/PO/WO makes any decision based on AKD/AKL.

**Instead:** keep the value in exactly two places — `CalibrationRequestItem` (customer
claim) and `CalibrationJob` (confirmed evidence) — and build the **cross-document
early-warning report** as a query that reads the requisition value through the join that
*already exists* (`WorkOrderItem → PurchaseOrderItem → QuotationItem → CalibrationRequestItem`).
If a value is learned during the commercial phase, update `CalibrationRequestItem.akdAkl` in
place (it is non-authoritative hint data — low-risk to edit; just make sure the item stays
editable for this field through `IN_QUOTATION`). The Work Order detail page may *display* a
computed AKD/AKL-readiness rollup over its (future) jobs — a read-only view, not a stored
column.

### 3.2 Execution gate: at START, not creation, not only submit (Verdict #8)

Genuinely re-evaluated, not inherited:

| Gate point | Verdict |
|---|---|
| **At creation** | **Reject.** For ON_SITE the job is created *by the technician as part of identifying the device on site* — the same step where AKD/AKL gets confirmed or found missing. If creation itself requires a resolved value, the job cannot exist as the container for the exception workflow, and the exception has to live on some pre-job entity that doesn't exist. Too early. |
| **At start (`PENDING → IN_PROGRESS`)** | **Adopt.** The job exists (exception container ✓). No measurement data has been recorded yet, so a blocked job rolls back cleanly. The technician learns immediately, before wasting a site visit. **And there is a direct codebase precedent:** `WorkOrder.start()` already refuses `ASSIGNED → IN_PROGRESS` unless `equipmentConfirmedAt` is set. Same shape, same lifecycle position. |
| **At submit only (`IN_PROGRESS → SUBMITTED`)** | **Reject as the sole gate.** The technician has already done 30 minutes of measurement; if management then declines the exception, the work is wasted and you hold orphan `MeasurementResult` rows for a calibration that "never officially happened." |
| **Second, lightweight re-check before Certificate issuance** | **Adopt as belt-and-braces.** When the (future) QA-review / certificate module issues, assert the job's `akdAklStatus ∈ {CONFIRMED, NOT_APPLICABLE, EXCEPTION_APPROVED}` and the snapshot is frozen. Cheap; catches any path that bypassed the start gate. |

Gate logic at start: the technician's action resolves to `CONFIRMED` (value present),
`NOT_APPLICABLE` (technician judgement that the device class carries no NIE), or **"raise
exception"** — which does *not* start the job but moves it to a distinct
`EXCEPTION_PENDING`/blocked state and notifies the approver. Approver approves →
`EXCEPTION_APPROVED` → job may start. Approver rejects → job terminal-blocked (this is the
"1 rejected / cannot proceed" outcome from the multi-job scenario — it needs its own status
value, it is neither `NOT_APPLICABLE` nor `EXCEPTION_APPROVED`).

### 3.3 Add a Serial Number snapshot to CalibrationJob (currently missing from every proposal)

Every flow diagram in every document says "Serial confirmed → AKD/AKL confirmed →
CalibrationJob snapshot." **But no serial field is proposed on the job, and
`CalibrationRequestItem` has no serial field at all** (only the free-text asset-tag
`deviceId`). The auditor question *"what serial number did PKM observe?"* is currently
unanswerable. `CalibrationJob` must snapshot `serialNumber` (observed on site) alongside
`akdAklNumber`, both frozen at gate-pass.

### 3.4 Device Identity Correction: design now, build with the Technician App, start minimal

The workflow (correction request → berita acara → technician + customer signature →
Management/Technical-Manager review → approve/reject → decision on PO/WO/Job) is the right
*shape*, but:

- **Every substrate it needs is net-new:** no `CustomerSignature` service, no berita-acara
  concept, no `QualityReview` service, no `CalibrationJob`, no audit log, no
  amend/supersede mechanism for WO or Job. That is 4–5 subsystems bundled as "one workflow."
- **It cannot be built or tested before the Technician App exists** — the trigger is a
  technician physically observing a mismatch during a calibration job.
- **Start with the minimum that captures the fact:** on the job, store
  `customerClaimedAkdAkl` (via the requisition link) vs `observedAkdAkl`, `observedSerial`,
  and a `identityMismatch` boolean + free-text note. Surface mismatches in a report. Let
  Management resolve out-of-band initially. **Formalise the signed berita-acara + multi-step
  approval only after ~10 real cases** show what the resolution actually needs.

### 3.5 Certificate must snapshot device + regulatory identity at issuance (not live FK)

See §5. This is a hard requirement for the future Certificate module, consistent with the
`EquipmentDeliveryNoteItem` snapshot pattern.

---

## 4. What is over-engineered

| # | Proposed | Why it's too much for v1 | Leaner alternative |
|---|---|---|---|
| O1 | AKD/AKL fields on Quotation + PO + WO | 3× the change-surface, no decisions depend on it, "never authoritative" = pure liability | Value at Requisition + Job only; cross-doc **report** over the existing join |
| O2 | Full signed berita-acara + dual-signature + multi-step approval for Device Identity Correction, **before** the Technician App | Large workflow engine for a scenario that cannot occur yet and whose real requirements are unknown | Discrepancy-as-data on the job + mismatch report + manual Management resolution; formalise later |
| O3 | `DeviceType.akdAklRequired` per-type policy flag | New config surface, migration, seed decision for ~200 device types ("which are regulated?"), new form toggle + payload builders + hooks | Don't gate on device type. The gate is "technician sets `CONFIRMED` / `NOT_APPLICABLE` / exception." `NOT_APPLICABLE` + technician judgement covers non-regulated devices. Add the flag only if `NOT_APPLICABLE` abuse becomes measurable. |
| O4 | Three new enums: `AkdAklType {AKD,AKL}`, `AkdAklDeclaration`, `AkdAklStatus` | `AkdAklType` is derivable from the number prefix (`AKD …` / `AKL …`) | Keep `AkdAklDeclaration` (requisition) and `AkdAklStatus` (job) — both encode facts you cannot derive. Derive the AKD-vs-AKL type; don't store it as an enum. |
| O5 | AKD/AKL in the Excel importer for v1 | The importer produces aggregate `qty > 1` lines; a single AKD/AKL value on a qty-10 line is meaningless. Plus `HEADER_ALIASES`, preview, confirm, and every customer's spreadsheet template change. | Manual entry only in v1 (always qty 1). Add to import later if customers actually supply it in bulk. |
| O6 | A second signature concept for corrections, separate from `CustomerSignature` | Two parallel sign-off mechanisms to maintain | Pick one signature/acknowledgement concept and a single `SIGNATURE` `FileOwnerPolicy`; reuse it for both calibration sign-off and correction acknowledgement. |

---

## 5. Hidden risks (not previously discussed)

| # | Risk | Impact | Mitigation direction |
|---|---|---|---|
| H1 | **You are designing controls for a subsystem with zero runtime code.** CalibrationJob / QualityReview / Certificate assumptions may shift when actually built. | AKD/AKL gate design could be incompatible with the eventual job lifecycle. | Co-design the gate *inside* the CalibrationJob module work. Do not ship it ahead. Treat §3.2 as a requirement on that module, not a standalone deliverable. |
| H2 | **No generic audit log.** Every "auditable / immutable / additive history" requirement currently rides on hand-added columns. Device Identity Correction + write-back attribution + exception approvals push this past the breaking point. | Column sprawl (`*ByUserId`, `*At`, `*Reason`, `*SourceJobId`) across many models, or an inconsistent partial history. | **Decision needed now:** accept scoped per-model columns, or invest in a generic `AuditLog` / append-only history table before the correction workflow. The docs keep writing "if MedCal has an audit log" — it does not. |
| H3 | **Regulatory evidence would live on unreplicated local disk.** `FilesModule` storage driver is `LocalDiskDriver` only; F5 (containerisation / infra) is incomplete; no S3/MinIO. | A 2026 berita-acara demanded by KAN in 2029 may not survive a disk failure or VPS migration. | Stand up durable object storage (the `StorageDriver` swap is already designed for it) *before* storing regulatory evidence, or accept and document the DR gap. |
| H4 | **"Technical Manager" approver role does not exist.** | Overloading `SUPERVISOR` means you cannot distinguish a shift supervisor from the person authorised to approve regulatory exceptions. A new enum value is a migration + seed + every role-enumerating guard/menu. | Decide: reuse `SUPERVISOR`, or add `TECHNICAL_MANAGER` (or model "regulatory approver" as an RBAC *permission* granted to a role, not a new role). The permission approach fits the existing DB-driven RBAC best. |
| H5 | **`CalibrationRequestItem` has no serial-number field.** Every diagram assumes serial is captured somewhere before the job; nobody has specced where. | The auditor question "what serial did PKM observe?" is unanswerable. | Serial is captured **at the job** (on-site observation), snapshotted there. Requisition may optionally gain a customer-claimed serial hint, same status as `akdAkl`. |
| H6 | **Multi-device Work Order with a permanently-blocked job.** 10 jobs, 1 rejected on regulatory grounds. WO completion semantics with a terminally-stuck job are undefined (the readiness audit already flags WO→DONE auto-advance as unlocked). | Work Order can never close, or closes while hiding a non-calibrated device. | Lock the rule: a WO may reach `DONE` with jobs in a terminal `BLOCKED` state, and those devices are reported as "not calibrated — regulatory identity unresolved." |
| H7 | **Customer contact on site may lack authority (or willingness) to acknowledge a regulatory-identity correction.** | Berita-acara flow stalls; or technician proceeds without acknowledgement and the evidence is weak. | The acknowledgement flow needs an explicit "customer declined / not available" branch, which is itself recorded evidence. Do not model signature as mandatory-to-proceed. |
| H8 | **No amend/supersede mechanism for Work Order or CalibrationJob.** Verdict #4 says Management decides "whether the PO/WO/Job should be reversed or recreated" — but there is nothing to reverse *with*. `Quotation`/`PO` `cancel()` refuse after `APPROVED`. | The auditor question "what happened to the original PO/WO/CalibrationJob?" is unanswerable. | Design job supersession explicitly (`CalibrationJob.supersedesJobId` / `supersededByJobId`, mirroring `Certificate.supersedesCertificateId`). Decide whether a corrected identity spawns a *new* job against the correct Device, leaving the original in a terminal `SUPERSEDED` state. |
| H9 | **Import fuzzy DeviceType matching + a new AKD/AKL column interact.** Adding columns to customer spreadsheets increases import-rejection rate and support load. | Slower customer onboarding. | Keep AKD/AKL out of import v1 (also O5). |
| H10 | **`NOT_APPLICABLE` is a technician self-service bypass.** Without the (rejected) per-type flag, a technician under time pressure can mark everything `NOT_APPLICABLE`. | Silent erosion of the control. | Make `NOT_APPLICABLE` require a short reason, surface a "NOT_APPLICABLE rate by technician" metric, and spot-audit. Cheaper and more honest than the per-type flag. |

---

## 6. Verdict-by-verdict challenge

| Verdict | Ruling | Reasoning |
|---|---|---|
| **#1 — Three distinct identities** | **AGREE** | Codebase already separates system code from serial; AKD/AKL is a real absent third axis. Note serial currently exists only on `Device` (nullable, non-unique) — not on the requisition, and not yet on the job (see H5, §3.3). |
| **#2 — Field placement** | **AGREE WITH MODIFICATION** | Device (optional master), Requisition (nullable non-authoritative claim), CalibrationJob (mandatory-to-resolve snapshot), DLN (none) — all correct. **The Quotation/PO/WO "carry as snapshot if useful" sub-point is a DISAGREE** — drop those fields; use a report over the existing join (§3.1, §4-O1). |
| **#3 — Customer-provided vs technician-confirmed separate** | **AGREE** | First-class mismatch data; matches "corrections = new record" philosophy. Never overwrite one with the other. |
| **#4 — Device Identity Correction as a dedicated workflow** | **AGREE WITH MODIFICATION** | Right that it must not be a silent `Device.update()`. But: (a) sequence it **with/after the Technician App**, not before — its trigger and substrate don't exist yet; (b) start minimal (discrepancy-as-data + report + manual resolution), formalise the signed berita-acara + approval chain after real cases; (c) it needs a job-supersession mechanism that isn't designed (H8). |
| **#5 — Requisition: NULL ≠ NOT_APPLICABLE, 3 states** | **AGREE** | `NOT_PROVIDED` / `CUSTOMER_DECLARED_NONE` / `CUSTOMER_PROVIDED`. The declaration enum is genuinely necessary — you cannot derive "customer said there is none" from a NULL string. States D (verified) and E (discrepancy) correctly belong to the job, not the requisition. |
| **#6 — Early warning** | **AGREE WITH MODIFICATION** | Yes to proactive identification before the site visit. **But it is a query/report capability over the document-chain join, not a reason to propagate the field** (ties to #2). "Awaiting clarification" and "discrepancy discovered later" are not requisition states — the first is a follow-up-task status (or derived), the second is a job-stage fact. |
| **#7 — CalibrationJob 1:1 Device; snapshot confirmed value; no silent bypass** | **AGREE** | `@@unique([workOrderId, deviceId])` already encodes the 1:1 rule (not yet code-enforced — no module). Snapshot matches the repo pattern. Add serial to the snapshot (§3.3). |
| **#8 — Control gate PENDING → START → check → IN_PROGRESS** | **AGREE WITH MODIFICATION** | Gate **at start** is right and has a direct precedent (`WorkOrder.start()` / `equipmentConfirmedAt`). Add: (a) NOT at creation — job must exist as the exception container; (b) a fourth terminal `BLOCKED` status for "exception rejected"; (c) a cheap re-check before certificate issuance. |
| **#9 — Device master write-back** | **AGREE** | Populate-if-empty with explicit confirmation + attribution; never touch a non-empty master; audit the write. Matches `EquipmentCalibrationRecord` acceptance. Caveat: "audit the write" currently means new columns (`akdAklSourceJobId`, `akdAklUpdatedByUserId`, `akdAklUpdatedAt`) because there is no audit log (H2). |
| **#10 — CalibrationJob as source for future Certificate/Portal Review** | **AGREE WITH MODIFICATION** | The job snapshot (value + type + status + confirmedBy/At + serial + link to the customer claim) preserves enough. **Required addition:** the future `Certificate` must *snapshot* device + regulatory identity at issuance, not read live FKs — otherwise a later Device correction silently rewrites an issued certificate's displayed identity. |

---

## 7. The propagation question, answered directly

**Question:** should customer-provided AKD/AKL propagate Requisition → Quotation → PO → WO?

**Answer: NO. It should live only at Requisition (customer claim) and CalibrationJob
(confirmed evidence).** Not "propagate as non-authoritative snapshot" — *not stored on those
documents at all.*

Reasoning (independent of the prior assessment):

1. **Nothing in Quotation/PO/WO consumes it.** Pricing, tax, PO confirmation, WO scheduling,
   equipment selection — none reference regulatory identity. A stored value with no consumer
   is dead weight.
2. **Granularity mismatch.** Those documents operate at DeviceType/aggregate-line level
   (`qty > 1`, `deviceId` usually NULL). AKD/AKL is a per-physical-unit identity. There is no
   correct place to attach one value on a qty-3 line.
3. **The verdict's own guardrail proves the point.** "Must NEVER become authoritative" — a
   field defined as never-trustworthy will still be read and trusted by some future
   report/PDF/portal. Not storing it removes that failure mode entirely.
4. **Authority ambiguity on change.** Customer corrects the number between quotation and PO →
   which of the (now divergent) copies is right? No good answer; don't create the problem.
5. **Change-surface economics.** One field on the requisition ≈ 8 layers of change. Three
   more documents ≈ 3–4× that, for zero decision value.

**What serves the early-warning need instead:** a report/query that joins
`WorkOrder → WorkOrderItem → PurchaseOrderItem → QuotationItem → CalibrationRequestItem` (a
path that already exists in the schema and is already traversed by
`deviceIdentifierFromItem()` in the portal WO detail view) and surfaces, per upcoming Work
Order: which lines have `akdAklDeclaration = NOT_PROVIDED`, which have a customer value
awaiting confirmation, and how close the scheduled date is. Read-side only. If a value is
learned during the commercial phase, it updates `CalibrationRequestItem.akdAkl` in place
(keep that one field editable through `IN_QUOTATION`).

---

## 8. Device Identity Correction — the three sub-questions

### Q5 — Should it be a separate domain workflow?

**Yes.** A discrepancy in a *regulated medical device's* identity is not an ordinary edit —
it needs evidence, acknowledgement, an authorised decision, and preserved history. A plain
`Device.update()` (which is what exists today, with no history) is the exact dead-end the
core principle forbids. **But** it is downstream of the CalibrationJob module and the on-site
identification seam, both unbuilt — so: design now, build with the Technician App, ship
minimal first.

### Q6 — One unified workflow or separate workflows for Device ID / Serial / AKD/AKL?

**One unified correction envelope, subset payload.** The technician observes the physical
device once, the customer acknowledges once, Management decides once. Three parallel
workflows would triple the paperwork for one site visit. The *fields* corrected are
independent (`{serialNumber?, akdAklNumber?, deviceTypeMismatch?}` — any subset), but the
**event** is one.

One important internal split: distinguish **"wrong Device record linked"** (the job is
pointed at the wrong `Device` / a new `Device` must be created and the job re-linked) from
**"right Device, wrong attributes"** (correct the serial / AKD/AKL on the linked Device).
The first is a re-matching operation with job-supersession implications (H8); the second is a
new-record correction in the `EquipmentCalibrationRecord` style. "Device ID" itself (the
MedCal cuid / `DVC-` code) is a system identity a technician never edits.

### Q7 — At what level does it operate: Device / CalibrationJob / RequestItem / other?

**The correction record targets the `Device`** (the durable identity being corrected), is
**raised from a `CalibrationJob` context** (where the discrepancy is physically observed —
nullable FK, since office-initiated corrections are possible), and **references the
originating `CalibrationRequestItem`** (the customer's original claim) transitively through
the job. Resolution outcomes (approve/reject, supersede job, correct in place) are recorded
on the correction record; the job keeps its own immutable snapshot of *what it observed*
regardless of the correction outcome.

---

## 9. Historical traceability — can the design answer a future KAN/auditor review?

| Auditor question | Answerable? | With what |
|---|---|---|
| Which physical device was calibrated? | **Yes** | `CalibrationJob.deviceId` (required FK) + job serial snapshot |
| What serial number did PKM observe? | **Only after §3.3** | `CalibrationJob.serialNumber` snapshot — **not currently proposed; must be added** |
| What AKD/AKL did the customer originally provide? | **Yes** | `CalibrationRequestItem.akdAkl` + `akdAklDeclaration`, never overwritten, reached via the job→requestItem link |
| What AKD/AKL did the technician confirm? | **Yes** | `CalibrationJob.akdAklNumber` (frozen snapshot) |
| Why did the value change? | **Only if the correction workflow is built** | `DeviceIdentityCorrection.reason` + attached berita-acara evidence |
| Who approved the correction? | **Only if the correction workflow is built** | `DeviceIdentityCorrection.approvedByUserId` / `approvedAt` |
| What happened to the original PO / WO / CalibrationJob? | **Not with the current design (H8)** | Requires job-supersession (`supersedesJobId` / `supersededByJobId`) — **not designed** |
| Was the calibration performed under an exception? | **Yes** | `CalibrationJob.akdAklStatus = EXCEPTION_APPROVED` + exception/approval record |
| Which certificate resulted? | **Yes (structurally)** | `Certificate.calibrationJobId` (`@unique`, in schema) — pending the Certificate module |

**6 of 9 answerable with the proposed model. Three gaps:** serial snapshot on the job
(easy), job/WO supersession mechanism (undesigned — H8), and the correction workflow itself
(defer, but design the data now). Close the first two before calling the audit trail
complete.

---

## 10. Risk-appetite principle

> *"The system should not silently rely on user memory or informal operational practice when
> the information may later be required as regulatory/audit evidence."*

**Sound. Adopt it.** It is essentially the definition of a system of record for a regulated
domain, and it is consistent with the NULL-not-a-dead-end principle: *mandatory to resolve
(where "not applicable" and "approved exception" are valid resolutions), not mandatory to
have a value.*

**Apply it to** — facts a regulator or customer could later demand proof of:
device identity, serial observed on site, regulatory identity (customer-claimed and
PKM-confirmed), calibration results and the reference equipment used, who performed the
calibration, who approved any exception or correction and why, and evidence files attached
in-system rather than "in an email somewhere."

**Do not over-apply it to** — internal operational micro-decisions with no external
evidentiary value: scheduling choices, equipment-selection rationale, internal notes, draft
states. Formalising those adds friction with no audit payoff, and every extra mandatory
field pushes users toward fake data when the honest answer is "not yet known" — which is why
the "not known" path must always be first-class.

---

## 11. Final recommended architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ MASTER DATA                                                                  │
│   Device.akdAklNumber            optional, mutable, "current best belief"     │
│   Device.akdAklSourceJobId       which job last populated it (attribution)   │
│   Device.serialNumber            existing; nullable                          │
│   (NO DeviceType.akdAklRequired in v1 — technician judgement + NOT_APPLICABLE)│
└─────────────────────────────────────────────────────────────────────────────┘
        ▲ populate-if-empty, explicit confirm, never overwrite non-empty
        │
┌───────────────┐   customer claim, non-authoritative, non-blocking
│ REQUISITION   │   CalibrationRequestItem.akdAkl            String?           │
│ (built)       │   CalibrationRequestItem.akdAklDeclaration  NOT_PROVIDED |   │
│               │                       CUSTOMER_DECLARED_NONE | CUSTOMER_PROVIDED
│               │   (optional) customerClaimedSerial          String?          │
└───────┬───────┘
        │   NO akdAkl field on Quotation / PurchaseOrder / WorkOrder
        │   ── early-warning REPORT joins WO→POItem→QuoItem→RequestItem (read only)
        ▼
┌───────────────┐   Quotation → PurchaseOrder → WorkOrder   (unchanged, no new fields)
│ COMMERCIAL    │
└───────┬───────┘
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ ON-SITE (Technician App — NOT BUILT)                                         │
│   technician identifies unit → confirms serial → reads/looks up AKD/AKL      │
│   → Device matched or created → CalibrationJob created (1 job = 1 Device)     │
└───────┬─────────────────────────────────────────────────────────────────────┘
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ CALIBRATIONJOB (module NOT BUILT — co-design the gate here)                   │
│   akdAklNumber        String?   snapshot, frozen at gate-pass                 │
│   serialNumber        String?   snapshot of what was observed on site        │
│   akdAklStatus        PENDING | CONFIRMED | NOT_APPLICABLE |                  │
│                       EXCEPTION_PENDING | EXCEPTION_APPROVED | BLOCKED        │
│   akdAklConfirmedByUserId / akdAklConfirmedAt                                 │
│   requestItemId       link back to the customer's original claim             │
│   identityMismatch    Boolean + note   (minimal Device-Identity-Correction v1)│
│   supersedesJobId / supersededByJobId   (H8 — design now)                     │
│                                                                             │
│   ── GATE at start (PENDING → IN_PROGRESS): status must be CONFIRMED /        │
│      NOT_APPLICABLE / EXCEPTION_APPROVED, else "raise exception" → notify     │
│      approver.  Precedent: WorkOrder.start() / equipmentConfirmedAt.         │
│   ── RE-CHECK before Certificate issuance.                                    │
└───────┬─────────────────────────────────────────────────────────────────────┘
        ▼
┌───────────────┐  QualityReview (NOT BUILT)  →  Certificate (NOT BUILT)       │
│ PORTAL MGMT   │  Certificate SNAPSHOTS device + AKD/AKL + serial at issuance  │
│               │  (not live FK) — consistent with EquipmentDeliveryNoteItem   │
└───────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ DEVICE IDENTITY CORRECTION  (design now · build with Technician App)         │
│   v1 (minimal): identityMismatch flag + note on the job → mismatch REPORT →  │
│                 Management resolves out-of-band                              │
│   v2 (after real cases): DeviceIdentityCorrection entity —                    │
│     deviceId (target) · calibrationJobId? (origin) · fields {serial?, akdAkl?,│
│     deviceTypeMismatch?} · originalValues (preserved) · proposedValues ·      │
│     evidence files (reuse FileObject + a SIGNATURE FileOwnerPolicy) ·         │
│     customerAcknowledgement { signed | declined | unavailable } ·            │
│     status DRAFT→SUBMITTED→APPROVED/REJECTED · approvedByUserId/At · reason · │
│     resolution { correct-in-place | new-device + supersede-job }             │
│   Approver = RBAC permission (e.g. deviceIdentityCorrection:approve) granted  │
│              to SUPERVISOR — NOT a new "Technical Manager" role in v1         │
└─────────────────────────────────────────────────────────────────────────────┘

CROSS-CUTTING (decide before the CalibrationJob module):
  • Audit strategy: scoped per-model columns vs a generic append-only AuditLog (H2)
  • Durable evidence storage: S3/MinIO StorageDriver swap before storing berita acara (H3)
```

---

## 12. Final field matrix

| Entity | AKD/AKL field | Mandatory? | Meaning | Authoritative? | Snapshot? |
|---|---|---|---|---|---|
| **Device** | `akdAklNumber` (+ `akdAklSourceJobId`, `akdAklUpdatedByUserId`, `akdAklUpdatedAt`) | **No** — nullable master | Current best-known regulatory identity for the device | **No** — a working belief, superseded by job evidence on conflict | No — mutable master |
| **Requisition** (`CalibrationRequestItem`) | `akdAkl` **+** `akdAklDeclaration` (`NOT_PROVIDED` / `CUSTOMER_DECLARED_NONE` / `CUSTOMER_PROVIDED`) | **No** — nullable, non-blocking | A customer **claim**, pre-verification; early-screening hint | **No** — never | No — origin, not a copy |
| **Quotation** | — none — | N/A | — | — | — |
| **Purchase Order** | — none — | N/A | — | — | — |
| **Work Order** | — none — (read-only computed AKD/AKL-readiness rollup on the detail page only) | N/A | — | — | — |
| **DLN** | — none — | N/A | DLN documents PKM's own reference equipment, not the customer device | — | — |
| **CalibrationJob** | `akdAklNumber` + `serialNumber` + `akdAklStatus` + `akdAklConfirmedByUserId` + `akdAklConfirmedAt` + `requestItemId` + `identityMismatch` | **Mandatory to RESOLVE** via the start gate (value, `NOT_APPLICABLE`, or `EXCEPTION_APPROVED`) — not a DB `NOT NULL` | What was physically observed / confirmed / formally excepted for **this** device at **this** calibration | **Yes** — the authoritative record for the calibration event | **Yes** — frozen at gate-pass |
| **Certificate** (future) | snapshot of device identity + `akdAklNumber` + `serialNumber` copied from the job at issuance | inherits from job | Historical statement, fixed at issue date | Yes, for that certificate | **Yes** — must not read live Device FK |
| **DeviceIdentityCorrection** (future) | `originalValues` / `proposedValues` for `{serialNumber, akdAklNumber, deviceType}` | workflow-gated | Evidence + authorised decision that an identity was wrong and how it was resolved | Yes, for the correction event | preserves originals additively |

---

## 13. Final workflow diagrams

### 13.1 Requisition-stage AKD/AKL capture

```
CSR / customer submits requisition line
        │
        ├─ customer gives a number ─────────────► akdAkl = "<value>",  declaration = CUSTOMER_PROVIDED
        ├─ customer says "no izin edar" ────────► akdAkl = NULL,        declaration = CUSTOMER_DECLARED_NONE
        └─ nothing said / unknown ──────────────► akdAkl = NULL,        declaration = NOT_PROVIDED  (default)
        │
        ▼
Requisition SUBMITTED  (never blocked on AKD/AKL)
        │
        ▼
Early-warning report (read-side join, refreshed as WOs are scheduled):
   "Upcoming Work Orders with NOT_PROVIDED lines"  →  Ops chases the customer
   "Customer-provided values awaiting on-site confirmation"
```

### 13.2 CalibrationJob execution gate (co-designed with the CalibrationJob module)

```
CalibrationJob CREATED (PENDING)          ← technician, on site, after identifying the device
        │
        ▼
Technician resolves regulatory identity:
        │
        ├─ reads/looks up a number ─────────────► akdAklStatus = CONFIRMED,  akdAklNumber set, serialNumber set
        ├─ device class carries no NIE ─────────► akdAklStatus = NOT_APPLICABLE (+ short reason)
        └─ cannot determine / conflict ─────────► akdAklStatus = EXCEPTION_PENDING  → notify approver
        │                                              │
        │                                    approver APPROVES ─► EXCEPTION_APPROVED
        │                                    approver REJECTS ──► BLOCKED (terminal)
        ▼
START GATE  (PENDING → IN_PROGRESS)
   allow  ⇔  akdAklStatus ∈ { CONFIRMED, NOT_APPLICABLE, EXCEPTION_APPROVED }
   else   ⇒  blocked; job stays PENDING/EXCEPTION_PENDING
        │              (precedent: WorkOrder.start() requires equipmentConfirmedAt)
        ▼
IN_PROGRESS → measurements → SUBMITTED
        │
        ▼
snapshot FROZEN (akdAklNumber, serialNumber, status, confirmedBy/At — immutable)
        │
        ▼
QA review → Certificate issuance
        └─ RE-CHECK: job status ∈ {CONFIRMED, NOT_APPLICABLE, EXCEPTION_APPROVED} and snapshot frozen
```

### 13.3 Device Identity Correction — v1 (minimal) then v2 (formal)

```
v1  (ship with the Technician App)
   technician observes mismatch (label ≠ MedCal record)
        │
        ▼
   job.identityMismatch = true  + note (customer-claimed vs observed serial / AKD-AKL)
   job proceeds under the normal gate (EXCEPTION path if identity is unresolvable)
        │
        ▼
   "Identity mismatch" report  →  Management resolves manually, out of band

v2  (after ~10 real cases show what resolution needs)
   technician raises DeviceIdentityCorrection (from job context)
        │  attaches evidence (photos) via FileObject
        ▼
   customer acknowledgement:  signed  |  declined  |  unavailable      (recorded either way)
        │
        ▼
   approver review  (RBAC deviceIdentityCorrection:approve → SUPERVISOR)
        ├─ REJECT ─────────────────────────► original identity stands; recorded
        └─ APPROVE ─► resolution:
              ├─ correct-in-place: new EquipmentCalibrationRecord-style correction row;
              │                    Device attributes updated; originals preserved
              └─ wrong-device: create/relink correct Device;
                               original job → SUPERSEDED (supersededByJobId);
                               new job created against the correct Device
        │
        ▼
   full chain queryable: original values · proposed values · evidence · who · when · why · job outcome
```

---

## 14. Remaining business decisions (must be locked before the CalibrationJob module is built)

| # | Decision | Recommended default |
|---|---|---|
| D1 | Requisition `akdAklDeclaration` enum — adopt now, or accept the reporting gap? | **Adopt now** (it is the cheapest thing here and it is what makes NULL non-fatal) |
| D2 | `akdAklStatus` value set on the job — confirm the six: `PENDING / CONFIRMED / NOT_APPLICABLE / EXCEPTION_PENDING / EXCEPTION_APPROVED / BLOCKED` | Adopt the six; `BLOCKED` is the "1 rejected" outcome |
| D3 | Execution gate position | **Job start**, + re-check at certificate issuance (§3.2) |
| D4 | Exception approver identity | An RBAC **permission** granted to `SUPERVISOR` — not a new `TECHNICAL_MANAGER` role in v1 (H4) |
| D5 | Exception approval timing — technician blocked on site until approved, or job proceeds in `EXCEPTION_PENDING` and resolves before certificate? | Decide per operational reality; recommend **blocked at start** for regulated device classes, deferred-resolve otherwise — but only if D-per-type is ever introduced |
| D6 | `DeviceType.akdAklRequired` per-type flag | **Do not build in v1** (O3). Revisit if `NOT_APPLICABLE` abuse is measured (H10) |
| D7 | Device master write-back — auto-populate-if-empty, or always prompt? | **Auto-populate only when empty, always attributed (`akdAklSourceJobId`); never overwrite non-empty; any change to a non-empty master goes through the correction workflow** |
| D8 | Audit strategy — scoped per-model columns vs a generic `AuditLog` table | Decide before the correction workflow; scoped columns are acceptable for the job/Device fields, a generic table is worth it once corrections + approvals exist (H2) |
| D9 | Evidence storage durability — local disk vs object storage | Stand up the S3/MinIO `StorageDriver` before storing berita-acara evidence, or document the DR gap (H3) |
| D10 | Job supersession on identity correction — corrected identity spawns a new job (original → `SUPERSEDED`), or edits the existing job? | **New job + supersede** (mirrors `Certificate.supersedesCertificateId`), so the original evidence is never mutated (H8) |
| D11 | WO completion with a terminally `BLOCKED` job | A WO may reach `DONE`; blocked devices are reported as "not calibrated — regulatory identity unresolved" (H6) |
| D12 | Serial number — customer-claimed hint on the requisition? | Optional; same non-authoritative status as `akdAkl`. Authoritative serial is the job snapshot (H5) |
| D13 | "Approval" column in the Portal Calibration Job List — what does it mean? | **It is three separate things** (see §15) — render as separate columns/badges, never one |
| D14 | Customer-provided AKD/AKL learned during the commercial phase — where does it go? | Update `CalibrationRequestItem.akdAkl` in place (keep it editable through `IN_QUOTATION`); do **not** add a Quotation field (§7) |

---

## 15. Portal "Calibration Job List" — the "Approval" column challenge

The proposed column header "Approval" collapses **three distinct lifecycle approvals**. Do
not merge them:

| Concept | Question it answers | States | Owner |
|---|---|---|---|
| **Identity readiness** | Is the device/serial/AKD-AKL resolved enough to start? | `PENDING` / `CONFIRMED` / `NOT_APPLICABLE` / `EXCEPTION_PENDING` / `EXCEPTION_APPROVED` / `BLOCKED` | Technician + exception approver |
| **Execution state** | Where is the calibration itself? | `PENDING` / `IN_PROGRESS` / `SUBMITTED` (`CalibrationJobStatus`) | Technician |
| **Result approval** | Did QA accept the measurements? | `PENDING` / `ACCEPTED_BY_QA` / `REWORK` / `REJECTED` (`QualityReviewStatus` / `ReviewDecision`) | QA reviewer |

A row in the list:

```
| Device (DVC-…) | Serial (obs.) | Customer AKD/AKL | Confirmed AKD/AKL | Identity | Execution | QA |
|----------------|---------------|------------------|-------------------|----------|-----------|-----|
| DVC-000123     | SN-001        | AKL-12345 (claim)| AKL-67890 ⚠mismatch| EXC-APPR | SUBMITTED | PENDING |
```

Structural precedent exists (`WorkOrderItemsTable`, `WorkOrderEquipmentSection` on the
existing WO detail page). It needs the CalibrationJob module first, plus a nested `jobs`
array on the WO read model (or a dedicated `useCalibrationJobs(workOrderId)` hook following
the `use-work-orders-query.ts` pattern).

---

## 16. Final decision matrix

| Decision | Verdict | Confidence | Reason |
|---|---|---|---|
| `Device.akdAklNumber` | **ADOPT** — optional, nullable, + attribution columns | High | Natural master home; no regulatory field exists; must not be mandatory (devices born on-site from partial data) |
| Requisition AKD/AKL (value) | **ADOPT** — nullable, non-authoritative, non-blocking | High | Customer hint for early screening; same philosophy as existing free-text `deviceId` |
| Quotation AKD/AKL | **DO NOT ADD** | Medium-High | DeviceType-level aggregate line; "never authoritative" = pure liability; early warning is a report over the existing join |
| PO AKD/AKL | **DO NOT ADD** | Medium-High | Same as Quotation |
| WO AKD/AKL | **DO NOT ADD** a stored field; a read-only computed rollup on the detail page is fine | Medium-High | Per-device identity only exists at the job; WO is DeviceType-level |
| DLN AKD/AKL | **DO NOT ADD** | High | DLN = PKM's own reference equipment, not the customer device |
| CalibrationJob AKD/AKL (+ serial) | **ADOPT** — mandatory-to-resolve via start gate, immutable snapshot, **add serial** | High (concept) / Medium (timing — module unbuilt) | The authoritative evidence record; matches the snapshot pattern; co-design with the CalibrationJob module |
| Customer declaration tracking (`akdAklDeclaration`) | **ADOPT** — requisition-level enum | High | Only way to distinguish "not asked" from "customer declared none" |
| Technician confirmation as separate value | **ADOPT** — never overwrites the customer claim | High | Mismatch is first-class data; matches "corrections = new record" |
| Device Identity Correction | **ADOPT the concept; DEFER the full workflow** — design now, build with the Technician App, start minimal | Medium | Sound need; downstream of unbuilt CalibrationJob + on-site identification; signed berita-acara + approval chain is premature before real cases |
| Management approval mechanism | **ADOPT** — RBAC permission on `SUPERVISOR` + per-transition service method (copy `Quotation.approve()` shape) | Medium-High | No generic approval engine; "Technical Manager" role does not exist |
| CalibrationJob execution gate | **ADOPT at START** (`PENDING → IN_PROGRESS`) + re-check before certificate; **NOT at creation, NOT submit-only** | High | Matches `WorkOrder.start()` / `equipmentConfirmedAt` precedent; before measurement data; job exists as exception container |
| Device master write-back | **ADOPT** — populate-if-empty + explicit confirm + attribution; never overwrite non-empty | High | Matches `EquipmentCalibrationRecord` acceptance pattern |
| Portal Calibration Job List | **ADOPT** as a WO child section; **split "Approval" into Identity / Execution / QA** | Medium | Structural precedent exists; needs the CalibrationJob module first; do not collapse distinct approvals |
| Propagate customer AKD/AKL through Requisition→Quote→PO→WO | **REJECT** | Medium-High | No consumer, granularity mismatch, authority ambiguity, 3–4× change-surface for zero decision value |
| `DeviceType.akdAklRequired` flag | **REJECT for v1** | Medium | Config surface + seed decision for ~200 types; `NOT_APPLICABLE` + technician judgement + abuse-metric is leaner |
| Generic audit log | **DECIDE before the correction workflow** | — | Does not exist today; scoped columns OK for job/Device fields, generic table worth it once corrections + approvals land |
| Durable evidence storage (S3/MinIO) | **RESOLVE before storing regulatory evidence** | Medium-High | Local disk only; F5 incomplete; DR risk for multi-year audit evidence |

---

## 17. Recommended implementation sequence

**Phase 0 — cross-cutting decisions (no code).** Lock D1–D14 (§14). In particular D8
(audit strategy) and D9 (evidence storage) gate later phases.

**Phase 1 — Requisition regulatory capture (small, isolated, ship now).**
Additive and dependency-free — the commercial pipeline is fully built.
- Schema: `Device.akdAklNumber` (+ attribution columns); `CalibrationRequestItem.akdAkl` +
  `akdAklDeclaration` enum. All nullable, additive migration, no backfill.
- Shared contracts: `calibrationRequestItemInputSchema`, update schema, the device master
  schema.
- API: `CalibrationRequestsService.create` / update; `DevicesService` update path.
- Portal: manual item entry (`new/` + `[id]/edit/`), detail view, device master form.
- **Skip the Excel importer** (O5) — manual entry only in v1.
- Report: "upcoming Work Orders with unresolved regulatory identity" — a query over the
  existing `WorkOrder → … → CalibrationRequestItem` join.

**Phase 2 — CalibrationJob module (the real dependency; the readiness audit's whole MISSING
list).** Design the AKD/AKL gate *into* this, not before it.
- `CalibrationJob` creation / fan-out from the Work Order; on-site Device match-or-create.
- Status machine incl. the six `akdAklStatus` values; the **start gate** (§3.2); job
  snapshot fields incl. `serialNumber`; `requestItemId` link; `identityMismatch` flag.
- Exception raise → approve/reject (RBAC permission on `SUPERVISOR`).
- Job supersession fields (`supersedesJobId` / `supersededByJobId`) — schema now even if the
  correction workflow lands later.

**Phase 3 — Portal Calibration Job List (item C).** WO child section over the new `jobs`
read model; three separate status columns (§15).

**Phase 4 — Device Identity Correction v1 (minimal).** Ship with / just after the Technician
App: `identityMismatch` + note captured on the job; mismatch report; manual Management
resolution.

**Phase 5 — QA Review + Certificate.** Certificate **snapshots** device + AKD/AKL + serial
from the job at issuance (§5). Re-check gate at issuance.

**Phase 6 — Device Identity Correction v2 (formal).** Only after real v1 cases: the
`DeviceIdentityCorrection` entity, evidence attachment (reuse `FileObject` + a `SIGNATURE`
`FileOwnerPolicy`), customer acknowledgement branches, approval chain, supersede-vs-correct
resolution.

**Never:** ship the AKD/AKL execution gate, the Job List, or the correction workflow ahead
of the CalibrationJob module. They are all views on / rules about an entity that has no
runtime code today.

---

## 18. Exact code/schema areas that WOULD eventually be affected

> Scoping only — **nothing is changed by this audit.**

**Phase 1 (buildable now):**
- `packages/db/prisma/schema.prisma` — `Device` (~L1251-1281), `CalibrationRequestItem`
  (~L1317-1350); new enum `AkdAklDeclaration`; additive nullable migration.
- `packages/shared/src/schemas/index.ts` — `calibrationRequestItemInputSchema` (~L297),
  `calibrationRequestUpdateSchema` (~L348), device master schemas.
- `apps/api/src/modules/calibration-requests/calibration-requests.service.ts` (`create` L54,
  update path ~L248); `apps/api/src/modules/devices/devices.service.ts` (update ~L151).
- `apps/portal/src/app/management/calibration-requests/new/page.tsx`, `[id]/edit/page.tsx`,
  `[id]/page.tsx`, `calibration-requests-ui.tsx`, `use-calibration-requests-query.ts`.
- `apps/portal/src/app/management/device-types/…` is **not** touched (no `akdAklRequired`).
- New report: a query module + a portal page, reading the `WorkOrder → WorkOrderItem →
  PurchaseOrderItem → QuotationItem → CalibrationRequestItem` chain.
- **Not touched:** `quotations`, `purchase-orders`, `work-orders` modules/schema; the Excel
  importer.

**Phase 2+ (require the unbuilt CalibrationJob module — new code, not edits):**
- `packages/db/prisma/schema.prisma` — `CalibrationJob` (~L1710-1735) gains `akdAklNumber`,
  `serialNumber`, `akdAklStatus` enum, `akdAklConfirmedByUserId/At`, `requestItemId`,
  `identityMismatch`, `supersedesJobId`/`supersededByJobId`.
- new `apps/api/src/modules/calibration-jobs/*` — service with `assertAkdAklResolved()` guard
  (pattern: `quotations.service.ts` `assertNoPendingPrices`, `work-orders.service.ts`
  `start()` gate).
- `packages/auth/src/access-control.ts` — new resource/actions
  (`calibrationJob:confirmIdentity`, `calibrationJob:approveException`,
  `deviceIdentityCorrection:*`); `RolePermission` seed rows.
- new on-site Device match-or-create service (the "unbuilt seam").
- future `certificate` module — device/AKD/serial snapshot at issuance; **not** live FK.
- future `DeviceIdentityCorrection` model + module; reuse `FilesModule` +
  `FileOwnerPolicyRegistry` (register a `SIGNATURE` / `IDENTITY_CORRECTION` policy) — do not
  rebuild upload/storage.
- Cross-cutting: an `AuditLog` mechanism (D8) if adopted; `StorageDriver` S3/MinIO
  implementation (D9).
