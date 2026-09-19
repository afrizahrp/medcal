# MEDCAL — FINAL VERDICT ON TECHNICIAN APP / AKD-AKL AUDIT

## Mandatory Alignment Before Any Implementation

We have reviewed your final audit objectively against the current MedCal codebase and the locked business intent.

Your audit is valuable and most of its core findings are accepted.

However, this is NOT a blanket approval of the audit verdict.

The following is now the FINAL business/architecture verdict.

You must acknowledge and align with this verdict before making any implementation changes.

Do NOT modify source code, schema, migration, seed, API, UI, or configuration yet.

First, explicitly confirm that you understand and agree with the corrected verdict below.

---

# 1. OVERALL VERDICT

Status of your audit:

**APPROVE WITH MATERIAL CHANGES**

We accept the verified codebase findings and the majority of the proposed architecture.

We do NOT approve the audit's recommendations unchanged.

The material corrections below are authoritative for the next implementation phase.

---

# 2. LOCKED CORE PRINCIPLE

The MedCal system must not silently rely on:

- technician memory,
- verbal instructions,
- WhatsApp,
- email,
- informal management decisions,
- or undocumented operational practice

when the information may later be required as calibration, regulatory, customer, or audit evidence.

Therefore:

**If a decision materially changes regulatory/device identity or calibration evidence, the system must preserve the decision, actor, time, reason, and relevant evidence in-system.**

This principle applies throughout the Technician App and Portal Management workflow.

---

# 3. THREE IDENTITIES REMAIN DISTINCT

LOCKED:

1. MedCal system identity
   - Device.code

2. Physical identity
   - Device.serialNumber

3. Regulatory identity
   - AKD / AKL / NIE

These must never be merged or treated as interchangeable.

---

# 4. REQUISITION AKD/AKL

ACCEPT.

CalibrationRequestItem may contain:

- akdAkl: String?
- akdAklDeclaration:
  - NOT_PROVIDED
  - CUSTOMER_DECLARED_NONE
  - CUSTOMER_PROVIDED

This information is:

- customer-provided
- non-authoritative
- nullable
- non-blocking at requisition stage

NULL must remain semantically meaningful.

Do NOT invent placeholder values such as:

- "-"
- "N/A"
- "000"

when the information is genuinely unknown.

---

# 5. DOWNSTREAM COMMERCIAL DOCUMENTS — IMPORTANT CORRECTION

Your recommendation was:

> DO NOT ADD AKD/AKL to Quotation / PO / WO.

We agree with the underlying concern:

**Do NOT create independent authoritative AKD/AKL copies on Quotation, PO, or WO.**

However, we are NOT locking the stronger statement that downstream screens/documents may never expose customer-provided AKD/AKL.

Business requirement:

> Customer-provided AKD/AKL must remain traceable and operationally visible throughout the commercial workflow when useful.

Therefore:

- Requisition remains the origin/source of the customer claim.
- CalibrationJob becomes the authoritative calibration-event evidence.
- Quote/PO/WO must NOT become independent regulatory sources of truth.
- Downstream visibility may be provided through read-through/computed data or another non-authoritative mechanism if needed.

Do NOT introduce duplicated AKD/AKL fields merely for convenience.

The implementation mechanism must be chosen based on the actual document semantics and existing data relationships.

LOCKED PRINCIPLE:

**One customer claim source; one authoritative calibration-event source; no ambiguous duplicate authority.**

---

# 6. CALIBRATIONJOB IS THE AUTHORITATIVE CALIBRATION EVIDENCE

ACCEPT and LOCK.

CalibrationJob is the authoritative record for what actually happened during a calibration event.

It must preserve the identity observed/confirmed for that specific calibration.

At minimum the design requires:

- akdAklNumber
- serialNumber
- akdAklStatus
- confirmation actor
- confirmation timestamp
- requestItem linkage
- identity mismatch information where applicable

The CalibrationJob identity snapshot must not depend on the current mutable Device master when historical evidence is later displayed or used for certificate generation.

---

# 7. CALIBRATIONJOB IDENTITY STATUS

The following status model is accepted as the working baseline:

- PENDING
- CONFIRMED
- NOT_APPLICABLE
- EXCEPTION_PENDING
- EXCEPTION_APPROVED
- BLOCKED

However, important clarification:

`NOT_APPLICABLE` is NOT a free-form technician bypass.

The system must have an explicit business-authority mechanism for declaring that a device does not require AKD/AKL/NIE.

Do NOT implement a design where:

Technician → selects NOT_APPLICABLE → enters arbitrary reason → continues

with no authoritative control.

The exact policy mechanism still needs to be finalized, but the business rule is:

**Technician judgement alone must not silently turn a regulatory requirement into NOT_APPLICABLE.**

---

# 8. TECHNICIAN_MANAGER ROLE — LOCKED

This is now a business decision.

The MedCal RBAC model must include:

**TECHNICIAN_MANAGER**

This role represents the authorized management authority for technician/calibration-related exception decisions and related approval workflows.

Do NOT substitute SUPERVISOR merely because SUPERVISOR already exists in the current codebase.

The architecture should use permissions rather than hard-coding business logic directly against role names where appropriate.

For example:

- calibrationJob:confirmIdentity
- calibrationJob:approveException
- deviceIdentityCorrection:approve
- deviceIdentityCorrection:reject

But the business role that is authorized for the relevant management approval is:

**TECHNICIAN_MANAGER**

Any existing role/permission seed changes must be designed consistently with the current DB-driven RBAC architecture.

---

# 9. CALIBRATIONJOB EXECUTION GATE

ACCEPT and LOCK.

The regulatory identity gate belongs at:

**CalibrationJob START**

NOT:

- Job creation
- after measurements
- only at submit

Expected conceptual flow:

PENDING
→ identity resolution
→ identity gate
→ IN_PROGRESS
→ measurement entry
→ SUBMITTED
→ QA
→ Certificate

START is allowed only when identity is resolved through one of the valid states:

- CONFIRMED
- NOT_APPLICABLE
- EXCEPTION_APPROVED

Otherwise the job remains blocked/pending.

Also perform a defensive re-check before Certificate issuance.

This is consistent with the existing WorkOrder.start() precondition pattern.

---

# 10. IDENTITY MISMATCH / DEVICE IDENTITY CORRECTION — MAJOR CORRECTION

We REJECT the recommendation:

> v1 = identityMismatch flag + note → report → Management resolves out-of-band.

Do NOT implement an out-of-band resolution workflow.

This conflicts with the locked audit/risk principle.

If a technician observes:

- serial mismatch,
- AKD/AKL mismatch,
- wrong Device match,
- or other material device-identity discrepancy,

the system must preserve the discrepancy and the management decision in-system.

The correction workflow does NOT need to be unnecessarily huge in v1.

But the fundamental workflow must exist in-system from the beginning.

Minimum acceptable conceptual workflow:

Technician observes discrepancy
→ records observed identity
→ records mismatch
→ creates/submits correction/exception request
→ authorized TECHNICIAN_MANAGER reviews
→ APPROVE / REJECT
→ reason recorded
→ relevant evidence retained
→ resolution recorded

No critical correction decision may be:

"resolved manually outside the system."

---

# 11. CORRECTION WORKFLOW — KEEP V1 LEAN, BUT AUDITABLE

We do NOT require the entire future correction engine to be implemented immediately.

The v1 workflow may be intentionally small.

But it must preserve the fundamental audit chain:

- original identity/value
- observed/proposed value
- affected Device / CalibrationJob
- who raised it
- when
- reason
- decision
- who approved/rejected
- when
- evidence where applicable
- final resolution

The richer future model can evolve later.

But do NOT deliberately create an "out-of-band" gap as the initial architecture.

---

# 12. CORRECTION MUST PRESERVE HISTORY

ACCEPT.

Never silently mutate historical calibration evidence.

Conceptually:

Original evidence
→ correction decision
→ resulting state

not:

Original evidence
→ UPDATE
→ original disappears

For wrong-device situations, the architecture should support:

- original job remains historically intact
- original job may become SUPERSEDED
- correct Device is linked/created
- a new calibration job may be created

The exact resolution mechanics can be finalized during CalibrationJob design.

---

# 13. DEVICE MASTER WRITE-BACK

ACCEPT with strict rules.

Device.akdAklNumber is:

- nullable
- mutable master data
- current best-known value
- NOT the authoritative historical calibration evidence

Recommended behavior:

If Device.akdAklNumber is empty:

→ allow controlled population from a confirmed CalibrationJob

If Device.akdAklNumber is already populated:

→ NEVER silently overwrite it.

Any material correction to an existing master value must go through the appropriate controlled workflow.

Attribution must be preserved.

---

# 14. CERTIFICATE

ACCEPT.

Future Certificate generation must use the CalibrationJob snapshot.

It must NOT depend on live Device master values.

Certificate must preserve the historical identity applicable at issuance:

- Device identity
- serial
- AKD/AKL
- relevant calibration evidence

The principle is:

**Certificate = historical document, not live master-data rendering.**

---

# 15. PORTAL CALIBRATION JOB LIST

ACCEPT.

Calibration Job List is a Work Order child view.

Do NOT use one ambiguous "Approval" column.

Separate:

1. Identity Readiness
2. Execution State
3. QA Result

This distinction is mandatory because these represent different lifecycle questions and different actors.

---

# 16. AUDIT TRAIL

Your audit correctly identified that there is currently no generic audit-log mechanism.

This must NOT be ignored.

Before implementing a serious Device Identity Correction workflow, we must explicitly decide the audit strategy.

At minimum, every regulatory identity correction/exception decision must be historically attributable.

Whether that is implemented through:

- scoped domain audit columns,
- an append-only AuditLog,
- or a hybrid

must be decided before the correction workflow is finalized.

Do NOT build a workflow that claims to be auditable while silently losing historical state.

---

# 17. EVIDENCE STORAGE

Your finding is accepted.

Current local-disk storage is not automatically sufficient for long-term regulatory evidence.

Before storing important permanent evidence such as:

- Berita Acara
- identity correction evidence
- customer acknowledgement
- regulatory supporting documents

the durability/backup/DR strategy must be explicitly resolved.

Reuse the existing FileObject / FilesModule architecture rather than creating a second upload system.

---

# 18. REVISED IMPLEMENTATION SEQUENCE

Do NOT follow the original sequence literally.

Use this conceptual sequence:

PHASE 0
Business + architecture decisions
→ lock identity, exception, approval, audit, evidence principles

PHASE 1
Requisition regulatory capture
→ customer claim + declaration

PHASE 2
CalibrationJob runtime domain
→ Job creation/fan-out
→ on-site Device identification
→ serial confirmation
→ AKD/AKL resolution
→ identity snapshot
→ exception handling
→ START gate
→ TECHNICIAN_MANAGER approval where required

PHASE 3
Device Identity Correction
→ lean but fully in-system/auditable
→ no out-of-band management resolution

PHASE 4
Portal Calibration Job List
→ Identity / Execution / QA separation

PHASE 5
Technician App execution UI
→ identity resolution
→ calibration execution
→ measurement/result entry
→ submit/complete

PHASE 6
QA Review + Certificate
→ certificate snapshot from CalibrationJob

The exact implementation order between Phase 3/4/5 may be adjusted after reviewing the actual CalibrationJob UX dependencies, but the domain dependency must remain:

**CalibrationJob is the foundation.**

Do NOT build views/rules that assume CalibrationJob runtime exists when it does not.

---

# 19. WHAT WE ARE EXPLICITLY REJECTING

The following recommendations from the previous audit are NOT approved:

### REJECT 1

Propagating customer AKD/AKL as independent authoritative fields through:

Requisition → Quote → PO → WO

There must be no ambiguous duplicate authority.

### REJECT 2

Identity mismatch resolved out-of-band.

No WhatsApp/email/manual-only resolution for material regulatory/device identity decisions.

### REJECT 3

Technician-only `NOT_APPLICABLE` judgement with no authoritative business control.

### REJECT 4

Using SUPERVISOR as the assumed business authority simply because the role already exists.

Business role is now:

**TECHNICIAN_MANAGER**

---

# 20. WHAT IS APPROVED

The following are explicitly approved:

- Three separate identity axes
- Nullable customer AKD/AKL at requisition
- Customer declaration tracking
- CalibrationJob as authoritative calibration evidence
- Serial snapshot on CalibrationJob
- AKD/AKL snapshot on CalibrationJob
- Identity readiness gate at Job START
- Certificate re-check
- Certificate snapshot from Job
- No silent Device master overwrite
- Populate-if-empty strategy with attribution
- Identity mismatch as first-class information
- Device Identity Correction as a dedicated in-system workflow
- Historical preservation
- TECHNICIAN_MANAGER as business approval role
- RBAC permission-based authorization
- Separate Identity / Execution / QA states
- No AKD/AKL on DLN
- No independent authoritative AKD/AKL copies in Quote/PO/WO
- Explicit audit strategy decision
- Explicit durable evidence-storage decision

---

# 21. YOUR REQUIRED RESPONSE BEFORE IMPLEMENTATION

Before making ANY code or schema change, respond with:

### A. CONFIRMATION

Confirm that you understand the revised final verdict.

### B. AGREEMENT

Explicitly state that you agree to:

1. TECHNICIAN_MANAGER as the business approval role.
2. No out-of-band Device Identity Correction resolution.
3. NOT_APPLICABLE cannot be an uncontrolled technician bypass.
4. CalibrationJob is the authoritative calibration-event evidence.
5. Job START is the regulatory execution gate.
6. Historical identity must be preserved.
7. No independent authoritative AKD/AKL duplication across Quote/PO/WO.
8. Audit strategy and evidence durability must be resolved before the corresponding workflow is finalized.

### C. CONFLICTS

If you believe any item above is technically or architecturally unsafe, identify the exact item and explain why.

Do NOT silently reinterpret the verdict.

### D. IMPLEMENTATION READINESS

Only after confirming alignment, provide a concise revised implementation plan.

Do NOT implement anything yet.

The next step after this confirmation will be a separate implementation prompt.

---

# FINAL INSTRUCTION

Treat this message as the authoritative correction of the previous audit verdict.

Do not argue for the old recommendation merely because it was in the previous report.

Do not make code changes.

First acknowledge, reconcile, and confirm alignment with this final verdict.
