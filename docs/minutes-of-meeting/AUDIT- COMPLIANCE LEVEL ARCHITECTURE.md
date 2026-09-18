# MEDCAL — COMPLIANCE LEVEL ARCHITECTURE AUDIT

## READ-ONLY FORENSIC AUDIT — DO NOT IMPLEMENT

We are preparing implementation for MoM #6 — Device Identity Fields.

A new business clarification has emerged from operational discussion:

Technicians and Technician Managers (MT) both perform calibration jobs in the field.

Therefore, making Identity Correction / BAI approval a mandatory blocking step can create an operational deadlock:

Technician
  ↓
finds identity discrepancy
  ↓
submits correction
  ↓
must wait for MT approval
  ↓
MT is currently performing another calibration job
  ↓
Technician's job is unnecessarily blocked

The proposed solution is NOT to remove auditability or remove Identity Correction.

Instead, the system should eventually support a configurable SYSTEM COMPLIANCE LEVEL that controls how strictly workflow constraints are enforced.

Example conceptual levels:

STRICT
- approval/enforcement is mandatory
- blocking rules remain active

MODERATE
- approval remains recorded
- workflow may continue asynchronously where appropriate
- blocking is reduced

FLEXIBLE
- evidence/audit trail remains mandatory
- approval may become non-blocking or optional where explicitly allowed
- workflow should not be unnecessarily blocked

IMPORTANT PRINCIPLE:

Compliance Level may change ENFORCEMENT / BLOCKING behavior.

It must NOT remove TRACEABILITY / EVIDENCE.

Do not implement this yet.

==================================================
AUDIT OBJECTIVE
==================================================

Determine the CURRENT architecture and identify the correct implementation boundary for a reusable System Compliance Level.

We need facts from the existing codebase only.

Do NOT assume a System Settings architecture exists.

Do NOT create a new settings model.

Do NOT modify Prisma schema.

Do NOT modify code.

Do NOT create migration.

Do NOT modify UI.

Do NOT modify tests.

==================================================
1. SYSTEM SETTINGS AUDIT
==================================================

Inspect the repository for all existing system/company/application settings.

Find:

- SystemSettings
- CompanySettings
- configuration tables
- feature flags
- environment-based configuration
- admin settings pages
- settings services
- settings DTOs
- settings APIs
- settings persistence
- settings caching

Determine:

1. Does a persisted settings mechanism already exist?
2. Is it global/system-level or company-level?
3. Who can modify it?
4. How is it exposed to frontend?
5. How is it consumed by backend services?
6. Is there an existing enum/configuration pattern we should reuse?
7. Is there already anything conceptually similar to a compliance level?

Report actual files and code locations.

==================================================
2. APPROVAL / WORKFLOW AUDIT
==================================================

Inspect existing approval mechanisms.

Especially:

- IdentityCorrection
- BAI
- Technician Manager approval
- submit / approve / reject flows
- workflow blocking
- job status transitions
- finalization gates
- notification requirements
- pending approval handling

Determine for each:

| Workflow | Submitter | Approver | Current Blocking Point | Can Work Continue? | Can Finalization Continue? | Evidence/Audit |
|----------|-----------|----------|------------------------|--------------------|----------------------------|----------------|

Do not change anything.

==================================================
3. IDENTITY CORRECTION AUDIT
==================================================

Re-inspect the existing IdentityCorrection architecture specifically from the perspective of configurable enforcement.

Determine:

- when correction is created
- when correction becomes pending
- when job fields are changed
- what requires approval
- what blocks job progress
- what blocks finalization
- what blocks PDF generation
- what blocks LK issuance
- what happens if approval remains pending
- whether there is already asynchronous/pending behavior

Trace the exact code path.

Do not infer.

==================================================
4. BAI AUDIT
==================================================

Find all BAI-related implementation.

Determine:

- database model
- status
- submitter
- approver
- signatures
- numbering
- timestamps
- relation to CalibrationJob
- relation to IdentityCorrection
- notification
- blocking behavior
- whether BAI is mandatory today
- whether BAI can remain pending while the job continues

If BAI and IdentityCorrection are actually the same mechanism, explain that.

If they are different mechanisms, explain the difference.

==================================================
5. NOTIFICATION AUDIT
==================================================

Inspect notification architecture relevant to approval workflows.

Determine:

- how approval requests notify users
- who receives them
- whether notification is mandatory
- whether notification failure blocks workflow
- FCM / web push relationship
- whether pending approval can exist without immediate notification

Do not modify notification behavior.

==================================================
6. RBAC AUDIT
==================================================

Inspect current permissions for:

- Identity Correction
- approval
- BAI
- job completion
- finalization
- settings management

Determine:

- which concrete roles can submit
- which can approve
- which can configure settings
- whether ADMIN can approve
- whether TECHNICIAN_MANAGER is distinct from TECHNICIAN
- whether permissions are database-driven
- whether permission changes require deployment

Do not change permissions.

==================================================
7. COMPLIANCE LEVEL DESIGN BOUNDARY

Based strictly on the existing architecture, determine where a reusable Compliance Level should live.

Evaluate:

A. Global application setting

B. Company-level setting

C. Per-workflow setting

D. Combination:

System/Company Compliance Level
        ↓
Workflow-specific enforcement policy

Do NOT choose based on personal preference.

Base the recommendation on the existing Medcal architecture.

IMPORTANT:

Do NOT implement.

==================================================
8. ENFORCEMENT VS TRACEABILITY

Identify which current mechanisms are:

A. Evidence / traceability
- correction record
- actor
- timestamp
- reason
- before/after value
- signatures
- approval status
- audit log

B. Enforcement / blocking
- cannot continue
- cannot finalize
- cannot issue document
- must wait for approval
- must notify approver

We need to understand which mechanisms can safely become configurable.

==================================================
9. MO M #6 IMPACT

Using the existing MoM #6 audit:

Device Master:
- Admin manages master Device

CalibrationJob:
- Technician records observed identity

Identity Correction:
- existing correction mechanism

Evaluate how Compliance Level would affect:

Model
Brand
Serial No
Device ID / Device FK

Do NOT change the existing deviceId architecture.

Do NOT convert deviceId into serialNumber.

Do NOT change CalibrationRequestItem.deviceId.

The existing terminology decision remains:

USER-FACING:
Serial No

INTERNAL:
deviceId remains the existing backend field / FK where applicable.

==================================================
10. HISTORICAL TRACEABILITY

Determine whether changing Brand / Model / Serial at job level will affect:

- LK PDF
- Kontrol Alat PDF
- WO PDF
- historical jobs
- Device master
- future jobs

Identify where snapshot behavior is currently missing.

Do not implement the snapshot yet.

==================================================
11. OPERATIONAL SCENARIOS

Trace these scenarios against the CURRENT architecture:

### Scenario A
Technician finds Model mismatch while performing a job.

### Scenario B
Technician finds Brand mismatch.

### Scenario C
Technician finds Serial mismatch.

### Scenario D
Technician identifies the wrong Device master.

### Scenario E
Technician submits correction but MT is unavailable because MT is performing another job.

### Scenario F
Correction remains pending until after the calibration job is completed.

For each scenario state:

- what happens today
- where it blocks
- what data is stored
- who must act
- what document behavior results

Do not invent future behavior.

==================================================
12. RECOMMENDATION

Provide a factual architectural recommendation for how Compliance Level SHOULD eventually be introduced.

The recommendation must answer:

1. Where should the setting live?
2. What should its scope be?
3. What should remain mandatory at every level?
4. What should be allowed to become non-blocking?
5. Which workflows should explicitly consume the setting?
6. Should Compliance Level affect permissions?
7. Should Compliance Level affect audit/evidence?
8. Should Compliance Level affect notifications?
9. Should Compliance Level affect job completion?
10. Should Compliance Level affect document issuance?

IMPORTANT:

Do NOT implement.

Do NOT write code.

Do NOT create schema.

Do NOT create migration.

==================================================
13. REQUIRED OUTPUT

Return ONLY:

# Compliance Level — Architecture Audit

## 1. Executive Summary

## 2. Existing Settings Architecture

## 3. Existing Approval Architecture

## 4. Identity Correction / BAI

## 5. Notification Architecture

## 6. RBAC

## 7. Enforcement vs Traceability

## 8. Recommended Compliance Level Boundary

## 9. MoM #6 Impact

## 10. Operational Scenarios

## 11. Risks / Constraints

## 12. Recommended Implementation Sequence

## 13. Files Inspected

## 14. Explicit Non-Changes

==================================================
STRICT RULES

DO NOT:

- modify code
- modify schema
- create migration
- modify API
- modify UI
- modify tests
- run formatter that changes files
- create settings
- create ComplianceLevel enum
- implement Strict/Moderate/Flexible
- change IdentityCorrection behavior
- change BAI behavior
- change notification behavior
- change RBAC
- modify JobCalibrationTestPoint
- modify PDF behavior
- refactor unrelated code

This is an ARCHITECTURE AUDIT ONLY.

The output will be used to create a separate implementation plan.

If multiple architectures already exist in the repository, report them all and identify which one is actually used by current production routes.