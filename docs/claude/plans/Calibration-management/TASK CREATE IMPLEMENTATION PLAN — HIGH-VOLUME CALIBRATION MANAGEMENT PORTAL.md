TASK: CREATE IMPLEMENTATION PLAN — HIGH-VOLUME CALIBRATION MANAGEMENT PORTAL

The Portal audit has already been completed.

DO NOT perform another audit.
DO NOT reopen the architecture/domain-model discussion unless the existing implementation plan reveals a concrete blocker.

Use this audit as the baseline:
D:\medcal\docs\claude\plans\Calibration-management\calibration-management-portal-audit.md

OBJECTIVE

Prepare a concrete implementation plan to make the MedCal Portal reliable and usable for a Work Order containing hundreds of individual physical calibration units.

Reference stress case:
- 56 PO line items
- 409 total physical units
- One Work Order / SPK
- One CalibrationJob per physical unit

The existing architecture has been confirmed capable.

DO NOT change:
- Prisma schema
- CalibrationJob natural key
- fan-out architecture
- unitOrdinal / unitTotal concept
- deferred device identity design
- deviceId semantics
- MeasurementResult architecture
- CalibrationTestPoint / JobCalibrationTestPoint
- replicateIndex / direction / referenceValue / tolerance architecture
- existing business rules
- Tech-PWA
- LK/PDF implementation
- per-job measurement/QA/BA/certificate detail structure

The goal is to fix the identified scale/correctness issues and improve Portal navigation/monitoring.

==================================================
PHASE 1 — BACKEND / DATA CORRECTNESS
==================================================

1. Fix the hardcoded 100-job limitation in:

apps/portal/src/app/management/calibration-jobs/use-calibration-jobs-query.ts

Current problem:
useWorkOrderCalibrationJobs fetches only pageSize=100.

This causes incomplete aggregate indicators for Work Orders containing >100 CalibrationJobs.

The solution must guarantee that Work Order Item-level indicators remain correct for 409 jobs.

Determine the most appropriate implementation:
- remove/raise the cap,
- use a dedicated aggregate query,
- or another efficient approach.

Do NOT blindly fetch hundreds/thousands of full CalibrationJob records if a lightweight aggregate query is more appropriate.

2. Fix:

apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts

findAllGroupedByWorkOrder

Current problem:
It fetches every matching CalibrationJob company-wide, unpaginated, then groups/paginates in memory.

It is polled every 6 seconds.

Design an efficient query strategy so that:
- Work Order pagination remains correct
- only required Work Orders/jobs are retrieved
- large historical job volume does not cause full-company scans into application memory
- existing grouping behavior remains correct
- actionNeededCount remains correct

Do not change the domain model.

3. Verify that these backend fixes preserve existing:
- actionNeededCount
- Identity Correction indicators
- Reference Equipment approval indicators
- Work Order grouping
- existing filters
- existing status behavior

==================================================
PHASE 2 — PORTAL UX
==================================================

The Portal must support this hierarchy:

Customer
  → Work Order / SPK
      → PO Line Item
          → Physical Units / CalibrationJobs

For the 409-unit case:

1 SPK
→ 56 PO Items
→ 409 individual CalibrationJobs

The UI must allow users to monitor the aggregate while still reaching the individual physical unit efficiently.

------------------------------------------
A. WORK ORDER / PO ITEM LEVEL
------------------------------------------

Keep the existing WorkOrderItemsTable concept.

Improve it so each PO item can provide a clear drill-down into its individual units.

Example:

Syringe Pump — Qty 94
[status/progress]
[needs action]
[View Units]

The drill-down must scope the user to the units belonging to that PO item.

Use existing filtering infrastructure where appropriate.

If purchaseOrderItemId filtering is required, implement it in the smallest clean way consistent with the existing API architecture.

Do NOT create unnecessary generic API complexity.

------------------------------------------
B. UNIT LIST / HIGH-VOLUME HANDLING
------------------------------------------

For large quantities such as 94 or 409:

Do NOT render hundreds of full detail records unnecessarily.

Provide an efficient unit list with appropriate:
- pagination and/or virtualization
- search
- status filtering
- "needs action" filtering where useful
- identity-related filtering where useful
- clear unit ordinal
- device identity when already known
- CalibrationJob status
- relevant action indicators

The implementation should make it easy to answer:

"Which unit needs attention?"

without requiring the user to manually scan hundreds of rows.

Do not introduce bulk approval.

Filtering/navigation is NOT the same as bulk approval.

------------------------------------------
C. AGGREGATE PROGRESS
------------------------------------------

Add useful aggregate progress/status information at Work Order level.

At minimum investigate/support:

- total units
- status breakdown
- units needing action
- identity correction pending where applicable
- reference equipment approval pending where applicable

Example concept:

409 Total
312 Completed
57 In Progress
40 Need Action

Do not assume these exact labels/count categories if they conflict with the existing CalibrationJobStatus model.

Use the existing statuses and business rules.

------------------------------------------
D. CALIBRATION JOB DETAIL NAVIGATION
------------------------------------------

Improve:

apps/portal/src/app/management/calibration-jobs/[id]/page.tsx

Add Previous / Next navigation for sibling CalibrationJobs.

The current page already displays:

Unit {ordinal}/{total}

Use that existing concept.

Preferred workflow:

Syringe Pump
Unit 37 / 94

[Previous]                    [Next]

The navigation should avoid forcing the reviewer to:
Back to List
→ find the SPK
→ find the unit
→ open the next job

again and again.

Determine whether navigation should be scoped to:
- the current PO line item, or
- the current Work Order

Use the workflow and existing data model to choose the least surprising implementation.

Do not redesign the job detail page itself.

Keep:
- Identity
- Alat Referensi
- Kontrol Alat
- Hasil Pengukuran
- Quality Review
- Identity Correction
- Certificate

as existing per-job sections.

==================================================
PHASE 3 — PRESERVE EXISTING GOOD UX
==================================================

Explicitly preserve:

- Customer → SPK grouping
- collapsed SPK groups
- server-computed actionNeededCount
- direct action links to the relevant job/section
- WorkOrderItemsTable aggregation
- one-job-at-a-time Quality Review
- one-job-at-a-time Identity Correction
- current expanded URL state behavior
- current device identity semantics

Do not redesign these unless technically required by the implementation.

==================================================
PHASE 4 — IMPLEMENTATION PLAN
==================================================

Create a detailed implementation plan ONLY.

Do not modify code.

The plan must include:

1. Implementation Summary
2. Backend Changes
   - exact files
   - current behavior
   - proposed behavior
   - query/API strategy
3. Shared Schema / DTO Changes, if any
4. Portal Changes
   - exact files/components
   - UI behavior
   - state/query changes
5. Navigation Design
6. Aggregate Progress Design
7. Unit List Design
8. API Contract Changes
9. Performance Considerations
10. Backward Compatibility
11. Business Rules Preserved
12. Files Expected to Change
13. Files Explicitly NOT to Change
14. Implementation Order
15. Testing Strategy
16. Acceptance Criteria
17. Risks / Edge Cases

For every proposed change, explain:
- WHY it is needed
- WHAT existing behavior it changes
- WHAT existing behavior it preserves

==================================================
IMPORTANT CONSTRAINTS
==================================================

- This is NOT an architecture redesign.
- This is NOT a database redesign.
- This is NOT a Tech-PWA task.
- This is NOT an LK/PDF task.
- Do NOT introduce speculative abstractions.
- Prefer the smallest clean change that solves the actual 409-unit problem.
- Do not solve a UI problem by unnecessarily changing the domain model.
- Do not solve a performance problem by simply increasing pageSize to an arbitrarily large number.
- Do not introduce bulk approval.
- Do not implement anything yet.

FINAL OUTPUT

Write the implementation plan as Markdown to:

D:\medcal\docs\claude\plans\Calibration-management\calibration-management-portal-implementation-plan.md

STOP after the plan is written.