AUDIT / INVESTIGATE ONLY — DO NOT IMPLEMENT ANY CODE

Context:
We have completed and verified the Calibration Result Review Happy Path:

TECHNICIAN
IN_PROGRESS
→ submitForReview
SUBMITTED (measurement locked)
→ MT reviews in Portal
→ APPROVE
SUBMITTED + QualityReview APPROVED
→ technician complete
ACCEPTED_BY_QA

This happy path is already aligned and working. DO NOT modify it.

We are now preparing the next lifecycle branch: REWORK.

IMPORTANT:
REWORK has been explicitly locked as a PRE-APPROVAL correction cycle.

Locked business meaning:

SUBMITTED
→ MT REJECT + mandatory feedback
→ REWORK
→ Technician RESUME
→ IN_PROGRESS
→ new measurement attempt
→ technician corrects measurement results
→ SUBMIT
→ SUBMITTED
→ MT reviews again
→ APPROVE OR REJECT AGAIN

The same REWORK cycle may happen multiple times before approval.

Example:

Attempt 1
→ SUBMITTED
→ MT REJECT
→ REWORK

Attempt 2
→ technician resumes
→ corrects measurement
→ SUBMITTED
→ MT REJECT again

Attempt 3
→ technician resumes
→ corrects measurement
→ SUBMITTED
→ MT APPROVE

IMPORTANT BUSINESS RULES:

1. REWORK is only for MT rejection BEFORE approval.
2. MT is a reviewer, NOT a MeasurementResult editor.
3. MT feedback must remain in QualityReview.notes.
4. MT must never modify measuredValue / MeasurementResult.
5. When MT rejects:
   - CalibrationJob status becomes REWORK
   - submittedAt becomes null
   - currentAttempt increments exactly once
   - QualityReview is created as REJECTED
   - rejection notes are mandatory
6. The previous measurement attempt must remain immutable.
7. Technician resumes the REWORK job:
   - REWORK → IN_PROGRESS
   - currentAttempt is already the new attempt
   - technician can create/update MeasurementResult for the new attempt
8. Technician submits again using the existing submitForReview flow.
9. MT can reject again or eventually approve.
10. QualityReview history is append-only. Do not overwrite previous reviews.
11. Do NOT introduce a new generic correction framework.
12. Do NOT modify Identity Correction.
13. Do NOT use JobHandOff for this flow.
    JobHandOff is a separate future scope and must remain untouched.
14. Post-approval correction is ALSO a separate future scope.
    Do not design or implement it as part of REWORK.
15. Do not add new enum values unless the existing model genuinely cannot support the locked lifecycle.
16. Do not add a new MeasurementCorrection table or generic AuditLog.

EXISTING DESIGN THAT MUST BE VALIDATED:

Existing CalibrationJobStatus:

- PENDING
- IN_PROGRESS
- SUBMITTED
- REWORK
- ACCEPTED_BY_QA

Existing lifecycle assumptions:

- IN_PROGRESS = technician can work on current attempt
- SUBMITTED = measurement locked
- REWORK = returned for technician correction
- ACCEPTED_BY_QA = terminal close

Existing QualityReview:

- ReviewDecision = APPROVE | REJECT
- QualityReviewStatus = PENDING | APPROVED | REJECTED
- reviewerUserId is required
- notes exists
- one CalibrationJob can have multiple QualityReview rows

Existing attempt model:

- CalibrationJob.currentAttempt
- MeasurementResult.attemptNumber
- older attempts are expected to become immutable/superseded

YOUR TASK:

Perform a thorough AUDIT of the current codebase and report whether the locked REWORK lifecycle can be implemented cleanly using the existing architecture.

DO NOT WRITE OR MODIFY CODE.

Investigate at minimum:

A. CURRENT DATABASE / PRISMA MODEL

- CalibrationJob fields related to status, submittedAt, currentAttempt
- MeasurementResult fields related to attemptNumber, recordedByUserId, recordedAt
- QualityReview model and relations
- existing constraints/indexes relevant to multiple attempts/reviews
- whether any schema limitation blocks the locked lifecycle

B. EXISTING BACKEND SERVICE LOGIC
Inspect CalibrationJobsService and related services.

Determine:

- how start() currently works
- how MeasurementResult create/update currently determines the attempt
- how measurement locking is enforced
- whether REWORK is currently recognized anywhere
- whether an attempt can safely be created after currentAttempt increments
- whether old attempts are actually immutable/superseded
- whether there are hidden assumptions that status can only move:
  PENDING → IN_PROGRESS → SUBMITTED
- identify exact methods/files that would need changes later

C. QUALITY REVIEW
Audit:

- existing QualityReview creation
- existing approve/reject decision patterns
- Identity Correction decision flow only as a BEHAVIOR/PATTERN reference
- whether QualityReview can support multiple decisions over multiple submit/rework cycles
- whether duplicate decisions can accidentally occur
- whether the current implementation correctly distinguishes the current submission from previous reviews

Pay particular attention to this question:

How does the system know that the latest QualityReview belongs to the CURRENT submission/attempt?

If it currently relies only on createdAt/order, explain the implications and whether that is sufficient for our locked v1 design.

D. ATTEMPT / IMMUTABILITY
Trace the actual MeasurementResult write path.

Answer precisely:

- When currentAttempt = N, what happens when technician resumes after REWORK?
- How does the system ensure a new attempt N+1 is written?
- Can an old attempt accidentally be edited?
- Does the existing lock check use:
  attemptNumber < currentAttempt
  and/or job status/submittedAt?
- What happens if an old attempt is explicitly targeted by ID?
- Are there race conditions around incrementing currentAttempt and creating results?

E. RBAC
Audit current permissions.

Validate the intended REWORK permissions:

TECHNICIAN:

- recordMeasurement
- submitForReview
- resumeAfterRework
- complete

TECHNICIAN_MANAGER / MT:

- decideQualityReview
- NOT recordMeasurement
- NOT submit
- NOT resume
- NOT complete

Report any existing permission/role mismatch.

F. API / ROUTES
Identify current routes related to:

- submit
- quality decision
- resume
- complete
- measurement results
- quality reviews

For the future REWORK implementation, determine whether the previously designed contract is compatible with the existing API structure:

POST /calibration-jobs/:id/submit
POST /calibration-jobs/:id/quality-decision
POST /calibration-jobs/:id/resume
POST /calibration-jobs/:id/complete

Do NOT implement these. Just audit compatibility.

G. TECH-PWA UX / STATE
Audit the current Tech-PWA UI after the already-completed Happy Path.

Determine what currently happens when a job has:

- IN_PROGRESS
- SUBMITTED without approval
- SUBMITTED with approval
- REWORK

For REWORK specifically, identify:

- what UI already exists
- what components can be reused
- what action/button pattern should be reused
- how the latest MT feedback can be displayed
- how measurement editing can be reopened
- whether the current UI already supports attempt-aware editing

Do not redesign the UI yet. Just report gaps.

H. PORTAL / MT UX
Audit current Portal behavior.

Determine:

- where MT sees submitted measurements
- how the existing APPROVE action is implemented
- what is needed to expose REJECT
- whether existing CorrectionCard / Identity Correction UI patterns can be reused
- how mandatory rejection notes should fit the existing UI pattern

Do not implement UI.

I. TRANSACTION / CONCURRENCY
Investigate carefully:

MT REJECT must logically perform:

1. validate job is SUBMITTED
2. validate this submission has not already been decided
3. create QualityReview(REJECTED)
4. set job status = REWORK
5. submittedAt = null
6. increment currentAttempt exactly once

Determine whether these operations can and should be atomic in one transaction.

Also investigate:

- duplicate reject requests
- double resume
- double submit
- concurrent MT decisions
- concurrent technician actions

J. DATA / MIGRATION RISK
Determine whether implementing REWORK requires:

- Prisma migration
- data migration
- backfill
- cleanup of existing records

Assume production already contains Happy Path data.

Do not modify data.

K. TEST GAP
Audit existing tests and identify exactly what tests should be added for REWORK later.

At minimum consider:

Happy path:

1. IN_PROGRESS → SUBMITTED
2. SUBMITTED → APPROVE
3. APPROVED → complete

REWORK: 4. SUBMITTED → REJECT → REWORK 5. REJECT requires notes 6. REWORK → RESUME → IN_PROGRESS 7. currentAttempt increments exactly once 8. old attempt becomes immutable 9. new MeasurementResult uses new attempt 10. technician can submit again 11. MT can reject again 12. multiple REWORK cycles 13. eventual APPROVE after REWORK 14. complete only after latest submission is approved 15. MT cannot modify MeasurementResult 16. old QualityReview records remain unchanged 17. duplicate/concurrent reject is rejected safely

OUTPUT FORMAT:

Produce an AUDIT REPORT only.

Structure:

# REWORK Lifecycle Audit

## 1. Executive Verdict

Choose one:

- READY — architecture already supports it cleanly
- READY WITH GAPS — architecture supports it but specific gaps must be addressed
- BLOCKED — a fundamental model/design issue must be resolved first

Explain why.

## 2. Current Lifecycle Found

Show the ACTUAL lifecycle currently implemented.

## 3. Target REWORK Lifecycle

Show the LOCKED lifecycle we are proposing.

## 4. Gap Analysis

Table:

| Area | Current State | Target | Gap | Severity |
| ---- | ------------- | ------ | --- | -------- |

Severity:

- BLOCKER
- HIGH
- MEDIUM
- LOW
- NONE

## 5. Attempt / Immutability Analysis

Explain exactly how currentAttempt and attemptNumber behave today and whether they safely support REWORK.

## 6. QualityReview Analysis

Explain how multiple review cycles currently work and how the system identifies the current review cycle.

## 7. RBAC Analysis

## 8. API / Service Impact

## 9. Tech-PWA Impact

## 10. Portal Impact

## 11. Transaction / Concurrency Risks

## 12. Migration / Data Risks

## 13. Required Changes for REWORK

List only the changes genuinely required.

Separate:

- Backend
- Shared types/schemas
- Tech-PWA
- Portal
- Tests

## 14. Explicitly NOT Required

Confirm whether each of these remains out of scope:

- JobHandOff
- Post-approval correction
- PASS/FAIL
- tolerance/completeness
- signature
- PDF/certificate
- notification
- WorkOrder DONE gating
- Identity Correction changes
- generic correction framework

## 15. Recommended Implementation Order

Give the smallest safe implementation sequence.

## 16. Open Questions / Decisions

Only list questions that genuinely cannot be answered from the existing codebase.

IMPORTANT:

- Do not invent missing architecture.
- Do not redesign the lifecycle.
- Do not propose generic frameworks.
- Do not silently change the locked business rules.
- Distinguish clearly between:
  1. existing behavior,
  2. required implementation changes,
  3. optional future improvements.
- Cite exact file paths, classes, methods, and relevant code locations for every important finding.
- DO NOT MODIFY ANY FILE.
