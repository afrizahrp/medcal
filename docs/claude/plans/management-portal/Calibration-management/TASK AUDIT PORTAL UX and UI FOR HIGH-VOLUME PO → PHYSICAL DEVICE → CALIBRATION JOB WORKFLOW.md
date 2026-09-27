TASK: AUDIT PORTAL UX/UI FOR HIGH-VOLUME PO → PHYSICAL DEVICE → CALIBRATION JOB WORKFLOW

CONTEXT
We have identified a real-world PO containing:

- 56 PO line items
- Total quantity: 409 physical device units

Example:
- "Anasthesi With Ventilator" = 7 units
- "Syringe Pump" = 94 units
- "Infusion Pump" = 42 units

Important:
The 409 quantity represents physical device units, not merely aggregated quantities.

The system therefore needs to support individual traceability of each physical unit through the downstream workflow, including:
PO → individual physical device identity → Work Order / Calibration Job → inspection / measurement → Quality Review → BAI approval / review → Certificate.

The user may need to:
- identify which physical unit is being handled
- verify its identity
- monitor its processing status
- review BAI
- approve/review it
- distinguish one physical unit from another even when they have the same device type/model
- detect units that are incomplete, pending, rejected, etc.

IMPORTANT DOMAIN ASSUMPTION
Do NOT assume that device identity is always known at PO creation or WO creation.

A physical device's Device ID / Serial Number may only be confirmed when the technician physically receives/inspects the device.

Therefore the UI must not depend on human memory or assume that the PO quantity itself represents already-identified Device records.

CURRENT OBSERVATION
The backend/domain architecture appears likely capable of handling individual units, but this MUST be verified from the actual code.

The current Portal UI, especially:

apps/portal/src/app/management/calibration-jobs/[id]/page.tsx

may not be suitable for efficiently handling a large number of individual calibration jobs / physical units.

The concern is not merely visual aesthetics.

The concern is operational usability when one PO can result in hundreds of physical units.

SCOPE
PORTAL ONLY.

DO NOT:
- modify Tech-PWA
- modify technician UI
- implement code changes yet
- change database schema yet
- change domain rules
- change Device identity model
- change deviceId semantics
- change existing LK/PDF layout
- invent new business rules

PHASE 1 — ARCHITECTURE / DOMAIN AUDIT

Audit the existing implementation and determine whether the current architecture can correctly support:

1. One PO line with quantity > 1.
2. One PO containing many line items.
3. A PO with 409 physical units.
4. Individual traceability for each physical unit.
5. Multiple units having the same device type/model/name.
6. Physical identity being confirmed later by technician.
7. Individual CalibrationJob records/status per physical unit where applicable.
8. Individual Quality Review / BAI review per physical unit.
9. Individual certificate association per physical unit.
10. Correct navigation from aggregate PO quantity → individual operational unit → Calibration Job.
11. Preventing accidental mixing of two physically different devices of the same type.
12. Correct status aggregation from individual jobs back to PO / WO level.

Trace the actual relations in Prisma schema and backend services.

Do NOT merely inspect model names.
Trace the actual:
- Prisma relations
- service methods
- API endpoints
- DTOs
- query filters
- status transitions
- UI data fetching
- identifiers used by the Portal.

Report whether the architecture is:

A. Fully capable
B. Capable with specific gaps
C. Fundamentally unable to support the workflow

For every finding, cite the actual file/path and relevant code.

PHASE 2 — CURRENT PORTAL UX AUDIT

Focus specifically on:

apps/portal/src/app/management/calibration-jobs/[id]/page.tsx

and all directly related components used by that page.

Audit the current UX for handling:
- 1 calibration job
- 10 jobs
- 50 jobs
- 100+ jobs
- potentially hundreds of individual units

Evaluate whether a Management / MT / GM user can realistically:

1. Find a particular physical unit.
2. Know which device they are currently reviewing.
3. Verify identity:
   - device type/name
   - brand
   - model
   - serial number
   - Device ID where relevant
4. See whether identity has been confirmed.
5. See calibration job status.
6. See completeness status.
7. See BAI status.
8. Review BAI efficiently.
9. Approve/review the correct unit without accidentally acting on another unit.
10. Move between units efficiently.
11. Find incomplete/problematic units.
12. See which units remain pending.
13. Understand aggregate progress.

Pay particular attention to the current page's information density and whether the page assumes that one CalibrationJob = one small, isolated object.

PHASE 3 — SCALE ANALYSIS

Use the concrete 409-unit PO as a UX stress test.

Do NOT propose displaying 409 full records simultaneously.

Analyze what happens if:
- 409 CalibrationJobs exist
- many have the same device type
- serial numbers are different
- some are complete
- some incomplete
- some waiting for identity confirmation
- some waiting for BAI
- some approved
- some require attention

Determine what information must be visible at:
A. Aggregate level
B. List level
C. Individual CalibrationJob detail level

PHASE 4 — RECOMMEND UI/UX MODEL

Do NOT implement yet.

Recommend a Portal UX architecture that allows users to manage hundreds of physical units without losing individual traceability.

Consider patterns such as:

- PO/WO-level summary
- progress counters
- grouped-by-device-type views
- individual unit lists
- searchable/filterable tables
- status filters
- identity-confirmation filters
- BAI-pending filters
- incomplete/problem filters
- pagination
- row expansion
- drawer/modal for individual unit details
- master-detail layout
- previous/next navigation between units
- bulk navigation without bulk approval
- clear identity header on individual CalibrationJob pages

But do NOT blindly implement these patterns.
Determine what actually fits the existing domain model and current Portal architecture.

IMPORTANT:
"Bulk action" must be distinguished from "bulk approval".

We need efficient navigation and monitoring, but approval/review of an individual physical calibration result must not accidentally become an unsafe bulk operation.

PHASE 5 — USER WORKFLOW

Describe the recommended workflow for:

Example:
PO:
Anasthesi With Ventilator — Qty 7

The Portal should make it obvious that these are:
Unit 1
Unit 2
Unit 3
...
Unit 7

even if the actual serial numbers are only known later.

Then test the same UX concept against:

Syringe Pump — Qty 94

The UI should allow the user to:
- see 94 units
- know how many are completed
- know how many are waiting for identity
- know how many are waiting for BAI
- know how many are approved
- quickly locate a specific serial number
- open one unit
- verify identity
- review BAI
- return to the list without losing context

PHASE 6 — DO NOT DESIGN A NEW DOMAIN MODEL UNLESS NECESSARY

First determine whether the current domain model already has the necessary concepts.

If the current architecture can support the workflow, explicitly say so.

If the UI is the primary problem, say so.

If there is a genuine backend/domain gap, identify the smallest required change.

Do NOT redesign the system simply because the current UI is inconvenient.

PHASE 7 — OUTPUT

Produce an AUDIT REPORT ONLY.

Structure:

1. Executive Summary
2. Current Architecture Capability
3. Current Portal UX Problems
4. 409-Unit Stress Test
5. Critical Risks
6. Recommended Portal Information Architecture
7. Recommended List / Detail UX
8. Recommended Navigation Model
9. Recommended Status / Progress Model
10. Identity Verification UX
11. BAI Review / Approval UX
12. What Can Stay As-Is
13. What Must Change
14. What Should NOT Change
15. Implementation Phases
16. Files/components likely affected
17. Backend/API changes required, if any
18. Frontend-only changes possible
19. Open Questions / Decisions Required

For every technical finding:
- give exact file path
- explain current behavior
- explain why it works/doesn't work
- distinguish confirmed facts from recommendations.

IMPORTANT:
Do not implement anything in this task.

We will review the audit first and then create a separate implementation task.