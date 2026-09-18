# MoM #6 — FINAL IMPLEMENTATION
## Device Identity, BAI Lifecycle, Observed Identity & LK

============================================================
NON-NEGOTIABLE EXECUTION RULE
============================================================

DO NOT AUDIT AGAIN.
DO NOT REDESIGN.
DO NOT ADD FEATURES.
DO NOT EXPAND SCOPE.
IMPLEMENT ONLY THE DEFINED SCOPE BELOW.

Business decisions in this prompt are FINAL.

You MUST inspect the existing code relevant to each change BEFORE editing,
but this is NOT an invitation to perform another architecture audit.

Do not reopen, reinterpret, or replace the business decisions below.

If you encounter an implementation detail that conflicts with the defined
business rules, preserve the business rules and make the smallest code
change necessary.

If something is genuinely impossible without changing a business rule,
STOP that specific part and report the exact blocker instead of inventing
an alternative design.

============================================================
1. FINAL BUSINESS RULES
============================================================

### 1.1 Device assigned by WO/SPK is LOCKED

The Device assigned to the calibration job comes from the WO/SPK.

Once assigned:
- `CalibrationJob.deviceId` MUST remain the reference to that Device.
- BAI MUST NOT replace the Device.
- BAI MUST NOT change `CalibrationJob.deviceId`.
- Technician MUST NOT select another Device through BAI.
- Do NOT redesign or migrate `deviceId`.

IMPORTANT:

The existing BAI/device-correction mechanism using `newDeviceId` /
`bindDevice()` must NOT remain part of the BAI correction workflow.

However:

Before removing `newDeviceId`, inspect the existing schema, DTO,
API/controller, frontend, and existing data dependencies.

If removal is safe within the current codebase:
- remove it from the BAI correction workflow
- remove its UI
- remove its validation/schema usage
- remove its service mutation path

Do NOT remove unrelated Device functionality.

Do NOT migrate or rename `CalibrationJob.deviceId`.

============================================================
2. BAI PURPOSE
============================================================

BAI (IdentityCorrection) is ONLY for correcting the observed identity
of the Device assigned to the job.

BAI correction fields:

- Brand
- Model
- Serial No

BAI does NOT correct:
- Device assignment
- `CalibrationJob.deviceId`

User-facing terminology:
- "Serial No"
- Do not expose internal `deviceId` terminology to Technician users.

============================================================
3. OBSERVED IDENTITY ON CALIBRATION JOB
============================================================

Add these nullable fields to `CalibrationJob`:

- `technicianObservedBrand`
- `technicianObservedModel`
- `technicianObservedSerial`

`technicianObservedSerial` already exists.
Do NOT create a duplicate field.

Add only the missing fields required for Brand and Model.

These fields represent the identity actually observed on this
specific calibration job.

They are job-level snapshot data.

The Device master remains a separate master-data entity.

============================================================
4. BAI APPROVAL BEHAVIOR
============================================================

When MT APPROVES a BAI:

- DO NOT change `CalibrationJob.deviceId`.
- Store the approved observed identity on `CalibrationJob`.
- Brand correction → `technicianObservedBrand`
- Model correction → `technicianObservedModel`
- Serial correction → `technicianObservedSerial`

If a field was not corrected, preserve existing behavior and leave its
observed value NULL unless the existing workflow already provides a value.

When MT REJECTS a BAI:

- BAI becomes `REJECTED`.
- Do NOT change Device master.
- Do NOT change `CalibrationJob.deviceId`.
- Do NOT create observed identity from the rejected correction.

============================================================
5. BAI LIFECYCLE / SUBMIT GATE
============================================================

FINAL RULE:

A `PENDING_REVIEW` BAI MUST NOT prevent the Technician from continuing
the calibration work.

Technician MAY:
- start the job
- record measurement results
- continue normal job work

Technician MAY NOT submit the job while there is a
`PENDING_REVIEW` IdentityCorrection.

Therefore:

CalibrationJob cannot transition:

`IN_PROGRESS → SUBMITTED`

if any IdentityCorrection exists with:

`status = PENDING_REVIEW`

The BAI must first be:
- APPROVED, OR
- REJECTED

After APPROVE or REJECT:
- the submit gate is cleared
- Technician may submit the job

There is NO post-submit BAI approval/rejection workflow.

Once the job reaches `SUBMITTED`:
- BAI decision is locked
- existing identity lock behavior remains
- do not create a new post-submit correction mechanism

============================================================
6. BAI SUBMIT GATE IMPLEMENTATION
============================================================

Implement the pending-BAI check at the existing
`submitForReview()` path.

Use the same architectural pattern as the existing
Reference Equipment unresolved approval gate.

Create a dedicated helper for the BAI pending condition rather than
misusing:

`assertIdentityGateOpen()`

Do NOT reuse:
- `IDENTITY_CORRECTION_ALREADY_PENDING`
for the submit gate, because that error currently means a different thing.

Use a semantically correct error code/message for:

"Calibration job has a pending Identity Correction that must be
approved or rejected before submission."

Follow existing project naming conventions.

Do not invent a new UI architecture.

Use the existing Tech-PWA:
- `disabled`
- `disabledReason`
- existing API error mapping

to communicate the reason to Technician.

============================================================
7. RACE CONDITION / DATA INTEGRITY
============================================================

This requirement is NON-NEGOTIABLE:

The implementation MUST preserve this invariant:

> A CalibrationJob MUST NOT become SUBMITTED while it has a
> PENDING_REVIEW IdentityCorrection.

The existing application-level pending check alone is insufficient
because Technician SUBMIT and MT BAI decision/submission can occur
concurrently.

Therefore inspect the existing Prisma/PostgreSQL transaction pattern
and implement the smallest safe atomic mechanism consistent with the
current project architecture.

Do NOT simply add a read check and claim the race condition is solved.

The final implementation must ensure that the submit transition and
the pending-BAI condition cannot produce:

`CalibrationJob = SUBMITTED`
AND
`IdentityCorrection = PENDING_REVIEW`

Do not introduce a new denormalized flag unless it is strictly
necessary.

Prefer the existing relational data model and existing transaction
mechanisms.

============================================================
8. ACCEPTED_BY_QA = MASTER COMMIT POINT
============================================================

FINAL BUSINESS RULE:

BAI APPROVED does NOT immediately update Device master.

BAI APPROVED only updates:

`CalibrationJob.technicianObservedBrand`
`CalibrationJob.technicianObservedModel`
`CalibrationJob.technicianObservedSerial`

The approved observed identity becomes eligible for Master Device
update when the CalibrationJob reaches:

`ACCEPTED_BY_QA`

`ACCEPTED_BY_QA` is the MASTER COMMIT POINT.

At the same successful transition to `ACCEPTED_BY_QA`:

- commit approved observed identity to the Device master
- keep `CalibrationJob.deviceId` unchanged
- only update Device master fields for observed values that are
  actually present/non-null
- do not overwrite a Device master field with NULL

Target mapping:

CalibrationJob.technicianObservedBrand
    → Device.brand

CalibrationJob.technicianObservedModel
    → Device.model

CalibrationJob.technicianObservedSerial
    → Device.serialNumber

The master update and the job transition to `ACCEPTED_BY_QA` MUST be
atomic.

If Device master update fails:
- the transaction MUST fail/rollback
- CalibrationJob MUST NOT become `ACCEPTED_BY_QA`

Do not allow:

`ACCEPTED_BY_QA`
while the corresponding approved identity has not been committed
to Device master.

Do not create an asynchronous background job for this.
Do not create a notification.
Do not introduce a new queue/event architecture.

============================================================
9. IMPORTANT: DEVICE MASTER UPDATE SEMANTICS
============================================================

The Device itself is NOT replaced.

Only these scalar master fields may be updated:

- `Device.brand`
- `Device.model`
- `Device.serialNumber`

`Device.id`
`Device.code`
and the Device relationship referenced by `CalibrationJob.deviceId`
MUST NOT change.

If an observed field is NULL:
- leave the corresponding Device master field unchanged.

Example:

Observed:
Brand = "ABC"
Model = NULL
Serial = "SN-001"

Then:

Device.brand       → "ABC"
Device.model       → unchanged
Device.serialNumber → "SN-001"

============================================================
10. LK IDENTITY SOURCE
============================================================

FINAL RULE:

LK MUST use CalibrationJob observed identity first.

Fallback to Device master independently PER FIELD.

Exact precedence:

Brand:
`technicianObservedBrand ?? Device.brand`

Model:
`technicianObservedModel ?? Device.model`

Serial:
`technicianObservedSerial ?? Device.serialNumber`

Do NOT treat the three fields as one identity package.

Example:

Observed Brand  = "ABC"
Observed Model  = NULL
Observed Serial = "SN-001"

LK must show:

Brand  = "ABC"
Model  = Device.model
Serial = "SN-001"

============================================================
11. LK RENDERERS
============================================================

Apply the identity precedence consistently to ALL existing LK paths.

Known existing paths include:
- Generic LK renderer
- Bed Side Monitor LK renderer

Do not redesign the renderers.

Prefer resolving the final identity values in the existing
`lk-download.service.ts` data preparation layer where the current
architecture already prepares:

- deviceBrand
- deviceModel
- deviceSerial

Then pass resolved values to existing renderers.

Do NOT change unrelated renderer behavior.

IMPORTANT:

Do NOT modify identity fields belonging to calibration reference
equipment (`Equipment`).

`Equipment.brand`
`Equipment.model`
`Equipment.serialNumber`

are NOT the Device identity for this requirement.

============================================================
12. LK AVAILABILITY
============================================================

LK remains available only when:

`CalibrationJob.status === ACCEPTED_BY_QA`

The existing LK finalization gate remains.

Because Device master update now occurs atomically with the
`ACCEPTED_BY_QA` transition:

once LK is available, the master identity commit has already
succeeded.

Do NOT add another independent LK issuance workflow.

Do NOT introduce certificate issuance functionality.

============================================================
13. TECH-PWA UX
============================================================

Update Tech-PWA Identity Correction UI.

REMOVE Device selection/correction from the BAI form.

Technician must NOT see a UI suggesting that the assigned Device
can be replaced.

If Device information is displayed for context, it MUST be:

- read-only
- clearly identified as the Device assigned by WO/SPK
- not an editable correction field
- not a selectable Device list

BAI correction UI should focus on:

- Brand
- Model / Tipe
- Serial No

Do not expose:
- `deviceId`
- `newDeviceId`
as user-facing correction controls.

When BAI is PENDING_REVIEW:
- measurement entry remains available
- Submit Job is disabled
- display a clear explanation that MT must approve/reject the
  Identity Correction before the job can be submitted

Use the existing UI patterns/components.
Do not redesign the Tech-PWA page.

============================================================
14. PORTAL / MT UX
============================================================

MT must be able to review and decide BAI while the job is
`IN_PROGRESS`.

BAI decision:

APPROVE:
- updates CalibrationJob observed identity
- does NOT change deviceId
- does NOT change Device master

REJECT:
- closes the BAI
- does NOT change observed identity
- does NOT change Device master
- does NOT change deviceId

Do not create a post-submit decision UI.

If the existing portal currently displays Device selection as part
of BAI decision, remove that correction capability while preserving
read-only context where appropriate.

Do not redesign unrelated portal UI.

============================================================
15. SCHEMA / MIGRATION
============================================================

Before editing schema, inspect current Prisma schema and migration
state.

Required schema change:

Add only:

`CalibrationJob.technicianObservedBrand String?`
`CalibrationJob.technicianObservedModel String?`

Do NOT recreate `technicianObservedSerial`.

Do NOT migrate or rename:
- `CalibrationJob.deviceId`
- `Device.serialNumber`

Create the minimum Prisma migration required for the two new fields.

Do not add unnecessary indexes, constraints, tables, enums, or
settings.

Do not implement Compliance Level.

============================================================
16. IDENTITYCORRECTION DATA MODEL
============================================================

BAI must support correction evidence for:

- Brand
- Model
- Serial No

Inspect the existing IdentityCorrection schema/API before editing.

If current fields are:

- `prevSerial`
- `newSerial`

preserve their semantics.

Add the minimum fields necessary for Brand and Model correction,
following the existing naming convention:

- previous Brand
- new Brand
- previous Model
- new Model

Use nullable fields consistent with Serial.

Do not add Device correction fields.

`newDeviceId` must not remain part of the active BAI correction
workflow if it can safely be removed based on existing schema/API
dependencies.

Do not remove historical database data unless explicitly required
for a safe migration.

If an existing migration/data compatibility concern prevents removal,
preserve the database column if necessary but make it UNUSED by the
active BAI workflow and report that fact.

============================================================
17. BAI PDF / AUDIT EVIDENCE
============================================================

Preserve BAI evidence and auditability.

If BAI PDF currently displays:
- previous identity
- new identity

extend it only as necessary so approved/rejected Brand/Model/Serial
corrections are represented correctly.

Do not redesign the BAI PDF.

Preserve:
- document number
- signatures
- reason
- decision
- actor
- timestamps
- existing audit logging

============================================================
18. MASTER UPDATE + HISTORY
============================================================

Do NOT rewrite historical CalibrationJobs.

Observed identity remains stored on the job.

Device master update affects future Device master state.

LK for the current job MUST use the job observed identity first.

Do not introduce retroactive rewriting of old PDFs or historical
jobs.

Do not create a PDF storage system.

============================================================
19. TESTS
============================================================

Update/add tests only for behavior introduced by this implementation.

Minimum required coverage:

### BAI lifecycle
1. Pending BAI does not block measurement recording.
2. Pending BAI blocks submit.
3. Approved BAI allows submit.
4. Rejected BAI allows submit.
5. BAI cannot be decided after job is SUBMITTED.
6. BAI cannot change `CalibrationJob.deviceId`.

### Observed identity
7. Approved Brand writes `technicianObservedBrand`.
8. Approved Model writes `technicianObservedModel`.
9. Approved Serial writes `technicianObservedSerial`.
10. Rejected correction does not write observed identity.
11. BAI approval does not update Device master immediately.

### ACCEPTED_BY_QA
12. Approved observed identity is committed to Device master when
    job becomes `ACCEPTED_BY_QA`.
13. Device master update and job status transition are atomic.
14. Device master is not overwritten by NULL observed values.
15. `CalibrationJob.deviceId` remains unchanged.

### LK
16. Generic LK uses observed Brand first.
17. Generic LK uses observed Model first.
18. Generic LK uses observed Serial first.
19. Generic LK falls back to Device master per field.
20. Bed Side Monitor follows the same precedence.
21. Equipment/reference-device identity remains unchanged.

### Regression
22. Existing normal calibration workflow remains functional.
23. Existing Reference Equipment approval gate remains functional.
24. Existing Quality Review workflow remains functional.
25. Existing LK finalization/password/token controls remain functional.

============================================================
20. RACE CONDITION TEST
============================================================

Add a focused test for the critical invariant if the existing test
architecture supports it.

Invariant:

`SUBMITTED` AND `PENDING_REVIEW BAI`
must never be a valid committed state.

Do not create a large concurrency test framework.

Use the smallest reliable test that proves the chosen transaction/
atomic mechanism preserves the invariant.

============================================================
21. ERROR HANDLING
============================================================

Use existing project error-handling conventions.

Add a new error code only if required for the new pending-BAI submit
gate.

Do not overload existing error codes with different meanings.

Tech-PWA must map the new error to a human-readable message.

Do not change unrelated API error behavior.

============================================================
22. IMPLEMENTATION PROCESS
============================================================

Follow this exact process:

STEP 1
Inspect the relevant existing code BEFORE editing:
- Prisma schema
- IdentityCorrection schema
- calibration-jobs.service
- submitForReview
- decideIdentityCorrection
- complete
- LK download service
- LK renderers
- Tech-PWA identity correction UI
- Tech-PWA submit UI
- Portal BAI decision UI
- relevant tests

This inspection is ONLY to understand exact implementation points.

DO NOT produce another architecture audit.
DO NOT reopen the business decisions.
DO NOT redesign.

STEP 2
Implement the minimum schema/migration changes.

STEP 3
Implement BAI Brand/Model/Serial correction.

STEP 4
Remove Device correction from active BAI workflow while preserving
`CalibrationJob.deviceId`.

STEP 5
Implement pending-BAI submit gate.

STEP 6
Implement atomic observed-identity → Device master commit at
`ACCEPTED_BY_QA`.

STEP 7
Implement LK observed-first / Device fallback precedence.

STEP 8
Update Tech-PWA and Portal only where required by the defined
workflow.

STEP 9
Update/add focused tests.

STEP 10
Run relevant:
- Prisma validation / generate if applicable
- typecheck
- lint if configured and relevant
- API tests
- affected Tech-PWA tests
- LK tests

Do not run destructive production commands.

============================================================
23. NO SCOPE EXPANSION
============================================================

Absolutely DO NOT implement:

- Compliance Level
- FCM
- notification
- email notification
- new notification architecture
- new RBAC
- permission redesign
- Device master redesign
- Device catalog
- Brand catalog
- Model catalog
- deviceId migration
- new certificate issuance workflow
- PDF storage
- historical PDF rewriting
- AKD/AKL redesign
- Quality Review redesign
- Reference Equipment redesign
- WO/SPK redesign
- unrelated UI polish
- unrelated refactoring
- unrelated performance optimization
- new abstractions unless required by this implementation
- "while we're here" improvements

============================================================
24. FINAL ACCEPTANCE CRITERIA
============================================================

Implementation is complete ONLY if all of these are true:

[ ] Device assigned by WO/SPK remains unchanged.
[ ] BAI cannot replace Device.
[ ] Tech-PWA does not offer Device selection in BAI.
[ ] BAI supports Brand correction.
[ ] BAI supports Model correction.
[ ] BAI supports Serial No correction.
[ ] Approved BAI stores observed identity on CalibrationJob.
[ ] Rejected BAI does not modify observed identity.
[ ] Pending BAI does not block measurement work.
[ ] Pending BAI blocks `IN_PROGRESS → SUBMITTED`.
[ ] MT can approve/reject while job is IN_PROGRESS.
[ ] BAI cannot be decided after SUBMITTED.
[ ] No post-submit BAI workflow exists.
[ ] Submit invariant is protected against the identified race.
[ ] `ACCEPTED_BY_QA` is the master commit point.
[ ] Master update and ACCEPTED_BY_QA transition are atomic.
[ ] Device master is updated only for non-null observed values.
[ ] `CalibrationJob.deviceId` never changes as a result of BAI.
[ ] LK uses observed identity first.
[ ] LK falls back to Device master per field.
[ ] Generic LK follows the precedence.
[ ] Bed Side Monitor LK follows the same precedence.
[ ] Equipment/reference identity is untouched.
[ ] Existing LK auth/finalization remains intact.
[ ] Tests cover the new lifecycle.
[ ] Tests cover identity precedence.
[ ] Tests cover atomic master update.
[ ] Relevant typecheck/tests pass.

============================================================
25. FINAL RESPONSE FORMAT
============================================================

After implementation, report ONLY:

## Implementation Summary

### Changed
- concise list of actual changes

### Migration
- migration name/status
- whether Prisma schema is in sync

### BAI Lifecycle
- final implemented flow

### Device Master Commit
- when/how it is updated

### LK Identity
- actual precedence implemented

### Device Correction
- confirm whether `newDeviceId` remains active, removed, or
  preserved only for backward compatibility, with exact reason

### Validation
- commands run
- results
- any remaining failures

### Scope Check
Explicitly confirm:

"Compliance Level: NOT IMPLEMENTED"
"Notifications/FCM: NOT IMPLEMENTED"
"Unrelated features: NOT IMPLEMENTED"

Do not include speculative future improvements.

============================================================
START IMPLEMENTATION NOW
============================================================

Remember:

DO NOT AUDIT AGAIN.
DO NOT REDESIGN.
DO NOT ADD FEATURES.
IMPLEMENT ONLY THE DEFINED SCOPE.