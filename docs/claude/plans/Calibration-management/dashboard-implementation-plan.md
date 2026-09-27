You are working on the MedCal project.

TASK:
Create a precise, implementation-ready plan for Management Dashboard V1.

IMPORTANT:
DO NOT implement anything.
DO NOT modify source code.
DO NOT modify Prisma schema.
DO NOT create migrations.
DO NOT create tests yet.
DO NOT refactor unrelated modules.

Your deliverable is ONLY an implementation plan in Markdown.

==================================================
1. REQUIRED SOURCE OF TRUTH
==================================================

First, read and understand:

docs/claude/plans/Calibration-management/COMPREHENSIVE-MANAGEMENT-DASHBOARD-ARCHITECTURE-AUDIT.md

Also inspect the actual repository and relevant existing MedCal architecture/documentation.

The implementation plan MUST be based on:
1. the actual current repository
2. the comprehensive architecture audit
3. the confirmed product decisions in this prompt

Do not silently override, reinterpret, reconcile, or "improve" business decisions.

If something is unclear or unsupported by repository evidence, explicitly identify it as an open decision/gap.

DO NOT invent assumptions.

==================================================
2. CRITICAL BUSINESS SEMANTICS RULE
==================================================

DO NOT ASSUME THE MEANING OF "VOLUME".

This is intentionally NOT a pre-decided definition.

Before defining any dashboard metric involving:
- Volume
- quantity
- physical units
- devices
- calibration jobs

you MUST verify how MedCal actually defines and uses these concepts.

Specifically inspect:

- CalibrationRequestItem.qty
- QuotationItem.qty
- PurchaseOrderItem.qty
- WorkOrderItem.qty
- CalibrationJob
- unitOrdinal
- unitTotal
- deviceId
- serial number fields
- any existing "volume" terminology in code/UI/documentation
- existing reports or dashboards that use "volume"

Determine whether "Volume" in MedCal officially means:
- commercial quantity
- requested quantity
- physical units
- CalibrationJob count
- another business aggregation
- or is currently undefined/inconsistent

Do NOT resolve this by intuition.

One fact currently known from the architecture context is:

1 CalibrationJob represents 1 physical unit.

That fact MUST NOT automatically be transformed into:

1 Volume = 1 physical unit.

Those are separate questions.

Also verify whether:

PO qty = 3

actually means three physical units in the business domain, or merely a commercial quantity that later becomes physical units downstream.

For example, do NOT assume this is already a system fact:

BSM qty 3
→ BSM #1 / SN 123
→ BSM #2 / SN ABC
→ BSM #3 / SN 5602

Instead, verify exactly where and when the system establishes the individual physical-unit identity.

The implementation plan MUST contain a dedicated section:

"Volume Semantics Verification"

with:
- evidence found
- actual domain grain at each lifecycle stage
- relationship between qty and physical units
- relationship between qty and CalibrationJob
- whether "Volume" is formally defined
- final conclusion
- unresolved ambiguity, if any

If the evidence does not support a definitive definition of "Volume", DO NOT invent one.

In that case:
- mark the dashboard metric as OPEN DECISION / BLOCKER
- do not instruct Cursor to choose an interpretation

==================================================
3. CONFIRMED PRODUCT DECISIONS
==================================================

These decisions ARE FINAL.

A. FINANCIAL / BILLING CARDS
--------------------------------

Financial/billing backend is not implemented yet.

Nevertheless, Management Dashboard V1 MUST display financial/statistic cards.

For V1:
- cards are visible
- values are 0
- DO NOT fabricate values
- DO NOT derive "revenue" from PO totals
- DO NOT derive "revenue" from Quotation totals
- DO NOT label pipeline/bookings as revenue
- architecture should leave a clean extension point for future billing implementation

The plan must specify:
- exact financial cards
- current V1 value
- source of the 0
- future source
- future replacement path

B. CALIBRATED
--------------------------------

For Management Dashboard purposes:

"Calibrated" = QA Accepted.

Use the actual domain status representing QA acceptance.

The plan must identify:
- exact enum/status
- exact model
- exact query condition
- exact business event timestamp

IMPORTANT:

Do NOT assume:
- createdAt
- submittedAt
- updatedAt

is the QA acceptance timestamp.

Inspect the repository.

If an explicit QA acceptance timestamp does not exist:
- inspect QualityReview/history/event records
- determine whether acceptance time is represented elsewhere
- if no valid acceptance timestamp exists, clearly identify the gap
- do not silently substitute another timestamp

C. CANCELLED WORK ORDERS
--------------------------------

Cancelled WorkOrders MUST be visible in the Management Dashboard.

Management must be able to see:
- cancellation count
- cancellation period
- cancellation reason, if supported by the current domain

The architecture audit identified that CalibrationJob does not have a CANCELLED status and that cancelling a WorkOrder can leave already-created CalibrationJob rows.

Therefore:

DO NOT count CalibrationJobs as cancelled simply because their parent WorkOrder is cancelled.

Determine the correct WorkOrder-level cancellation semantics.

Verify:
- exact WorkOrder cancellation status
- cancellation timestamp
- cancellation reason
- where reason is stored
- whether reason is mandatory or optional
- how existing cancelled records behave

If cancellation reason does not exist:
- do not invent a field
- identify the gap
- specify the minimum required decision/scope
- clearly separate current capability from future enhancement

D. PERIOD / TREND
--------------------------------

Management Dashboard V1 MUST support period/trend reporting.

This is NOT a snapshot-only dashboard.

Define:
- period selector
- current-period semantics
- previous-period semantics, if applicable
- trend bucket
- timestamp for each metric
- timezone
- date boundary semantics
- empty period behavior

Every metric must use the correct business event timestamp.

Do not use createdAt universally as a shortcut.

E. ROLE VISIBILITY
--------------------------------

Management Dashboard is role-based.

Target audience:
- SUPERVISOR
- GENERAL_MANAGER / GM
- DIRECTOR
- SUPERADMIN

Verify the actual repository role names and permission assignments.

The architecture audit previously identified:
- permission: managementDashboard:read
- existing seeded roles included SUPERADMIN, ADMIN, GENERAL_MANAGER, SUPERVISOR, FINANCE, TECHNICIAN_MANAGER, TECHNICIAN, CUSTOMER_SERVICE
- CUSTOMER does not have access
- DIRECTOR was not confirmed

Therefore:
- verify whether DIRECTOR exists
- verify whether DIRECTOR has managementDashboard:read
- do NOT silently modify RBAC
- do NOT redesign RBAC

RBAC scope is ONLY:
who can view the dashboard.

==================================================
4. BUSINESS / DOMAIN CONTEXT
==================================================

The current architecture includes:

CalibrationRequest
→ Quotation
→ PurchaseOrder
→ WorkOrder
→ CalibrationJob

The audit also identified:
- multiple Requests/Quotations/POs may belong to the same Customer
- one Customer must NOT be assumed to have one quotation or one PO
- commercial quantities and physical-unit grain may differ
- CalibrationJob represents one physical unit
- device identity may be established downstream

Verify all of this against the actual repository before using it in metric definitions.

Stress scenario:

A large hospital may have:
- 56 device/line items
- 409 physical calibration jobs
- 10+ POs
- multiple Request → Quotation → PO chains

The dashboard must aggregate across the customer's complete operational/commercial lifecycle correctly.

Do not assume one PO represents the customer's total business volume.

==================================================
5. WHAT THE PLAN MUST DEFINE
==================================================

5.1 Dashboard Information Architecture
--------------------------------

Define:
- page structure
- sections
- KPI cards
- operational metrics
- trend charts
- cancellation section
- financial cards
- drill-down/navigation if justified

Keep V1 focused.

Do not add unnecessary features.

5.2 Exact Metric Catalog
--------------------------------

For EVERY proposed metric define:

- Metric name
- Business meaning
- Source model/table
- Source field(s)
- Domain grain
- Filter conditions
- Status conditions
- Timestamp/event used
- Period semantics
- Aggregation formula
- Current-state vs period/event metric
- Reliability for V1
- Caveats

DO NOT use vague definitions.

Examples such as:
"Total Devices"
"Calibration Volume"
"Revenue"
"Cancelled Jobs"

are insufficient unless their exact semantics are documented.

IMPORTANT:

If a metric depends on "Volume", its definition MUST be based on the verified Volume Semantics Verification.

Do not invent the definition.

5.3 Current-State vs Period Metrics
--------------------------------

Clearly separate:

CURRENT STATE:
Examples:
- active WorkOrders
- pending QA
- operational backlog

PERIOD/EVENT:
Examples:
- QA Accepted during selected period
- WorkOrders cancelled during selected period
- completed work during selected period

Do not mix the two.

5.4 Trend Architecture
--------------------------------

Define:
- aggregation interval
- timestamp source
- SQL/Prisma aggregation strategy
- timezone
- period boundaries
- previous-period calculation
- missing/empty buckets

5.5 Customer Aggregation
--------------------------------

Define how metrics aggregate across:
- Requests
- Quotations
- POs
- WorkOrders
- CalibrationJobs

for the same Customer.

The implementation MUST correctly support multiple commercial chains for one Customer.

Use the 10+ PO stress scenario as an acceptance test.

5.6 Cancellation Reporting
--------------------------------

Define:
- cancelled WorkOrder count
- period semantics
- cancellation reason breakdown
- unknown/no-reason handling
- interaction with child CalibrationJobs

Do not count child jobs as cancelled unless the domain explicitly defines this.

5.7 Financial Cards
--------------------------------

Define each financial card:
- label
- value type
- V1 value = 0
- current source
- future source
- explicit non-revenue semantics where applicable

PO/Quotation totals MUST NOT be called revenue.

5.8 API / Service Design
--------------------------------

Define:
- endpoint(s)
- request parameters
- response contract
- DTO shape
- service responsibilities
- authorization boundary
- validation
- error behavior

Prefer a dashboard-specific read service/API rather than exposing raw Prisma structures.

5.9 Prisma / Database Strategy
--------------------------------

The architecture audit found:
- limited aggregate/groupBy precedent in commercial/calibration modules
- groupBy/_count patterns elsewhere
- parallel independent counts elsewhere
- calibrationJobInclude is too wide/deep for dashboard bulk reads

Define:
- aggregate/count/groupBy usage
- query batching
- narrow selects
- joins
- parallel queries where appropriate
- N+1 avoidance
- avoiding oversized calibrationJobInclude

Do not optimize prematurely.

5.10 Indexes
--------------------------------

Define only MINIMUM required V1 indexes.

For each:
- model
- fields
- query pattern
- reason
- whether mandatory or optional

Do not produce an "index everything" proposal.

5.11 Historical / Mutable Amount Semantics
--------------------------------

The audit identified that live Quotation/PO commercial amounts may be mutable/revised.

Therefore:
- do not build historical financial trends from mutable current amount fields
- do not call PO/Quotation amount revenue
- document unavailable historical financial metrics
- keep future extension possible

5.12 Performance
--------------------------------

Evaluate realistic production load:
- 56 line items
- 409 CalibrationJobs
- 10+ POs
- many WorkOrders
- multiple Requests/Quotations

Specify:
- query count/shape
- batching
- parallelization
- pagination if required
- caching only if justified

5.13 Loading / Empty / Error States
--------------------------------

Define behavior for:
- loading
- empty period
- no cancellations
- financial cards = 0
- API failure
- partial failure if applicable

5.14 Tests
--------------------------------

Define test coverage for:
- metric correctness
- period boundaries
- timezone
- QA Accepted
- acceptance timestamp semantics
- cancelled WorkOrders
- cancellation reason
- financial cards remain 0
- multiple PO/request chains for one customer
- high-volume scenario
- Volume semantics, if a Volume metric is approved
- role authorization
- unauthorized access
- regression

Do not write tests yet.

5.15 Acceptance Criteria
--------------------------------

Create explicit, testable acceptance criteria.

They must be detailed enough that Cursor can implement without making business decisions.

==================================================
6. IMPLEMENTATION SEQUENCE
==================================================

Provide recommended implementation sequence.

For every step identify:
- files/modules likely to change
- dependency
- expected result

Suggested structure:

1. domain/semantic verification
2. prerequisite schema/index changes, if required
3. backend aggregation/service
4. API contract
5. frontend dashboard
6. authorization integration
7. tests
8. validation/audit

Adjust based on repository reality.

==================================================
7. FILE-LEVEL SCOPE
==================================================

Inspect the repository.

Identify actual paths.

Separate:

MUST CHANGE
MAY CHANGE
DO NOT TOUCH

Do not invent paths.

==================================================
8. CURSOR HANDOFF BOUNDARY
==================================================

This plan will be handed to Cursor for implementation.

Explicitly state what Cursor MUST NOT decide independently.

At minimum:

- meaning of Volume
- metric definitions
- physical-unit vs commercial quantity semantics
- period semantics
- QA Accepted definition
- acceptance timestamp
- cancellation semantics
- cancellation reason semantics
- financial/revenue semantics
- RBAC redesign
- schema additions without explicit approval
- using distinct serial numbers as a substitute for a domain quantity
- treating PO/Quotation totals as revenue

If unresolved, list it under:

OPEN DECISIONS / BLOCKERS

Do not hide unresolved business decisions inside implementation details.

==================================================
9. CRITICAL REPOSITORY VERIFICATION
==================================================

Before writing the implementation plan, inspect the actual repository and verify:

1. exact QA Accepted status
2. exact QA acceptance timestamp/event
3. WorkOrder cancellation representation
4. cancellation reason storage
5. CalibrationJob cancellation behavior
6. actual role names
7. managementDashboard:read assignments
8. whether DIRECTOR exists
9. actual meaning/use of "Volume"
10. all qty fields and their semantics
11. relationship between qty and CalibrationJob fan-out
12. unitOrdinal/unitTotal semantics
13. deviceId semantics
14. serial number fields and identity timing
15. existing dashboard/API patterns
16. existing aggregate/groupBy patterns
17. relevant indexes
18. date/timezone conventions
19. frontend route/module
20. backend service/controller/API
21. test locations/patterns

Do not rely solely on the previous audit where repository inspection can answer the question.

==================================================
10. OUTPUT
==================================================

Write the final implementation plan to:

docs/claude/plans/Calibration-management/MANAGEMENT-DASHBOARD-V1-IMPLEMENTATION-PLAN.md

Use this structure:

# Management Dashboard V1 — Implementation Plan

## 1. Purpose

## 2. Confirmed Product Decisions

## 3. Architecture Baseline

## 4. Volume Semantics Verification

## 5. Dashboard Information Architecture

## 6. Metric Catalog

## 7. Period & Trend Semantics

## 8. Customer / Quantity / Physical-Unit Aggregation

## 9. Cancellation Reporting

## 10. Financial Cards

## 11. API & Service Design

## 12. Prisma / Query Strategy

## 13. Required Indexes

## 14. Performance Considerations

## 15. Loading / Empty / Error States

## 16. Authorization Boundary

## 17. Test Strategy

## 18. Acceptance Criteria

## 19. File-Level Scope

## 20. Implementation Sequence

## 21. Cursor Handoff Rules

## 22. Open Decisions / Blockers

## 23. Implementation Readiness Assessment

At the end state:

IMPLEMENTATION GATE:
- READY
or
- READY WITH CONDITIONS
or
- BLOCKED

If not READY, list the exact conditions.

==================================================
11. ABSOLUTE RULE
==================================================

DO NOT IMPLEMENT ANYTHING.

DO NOT MODIFY CODE.

DO NOT MODIFY DATABASE SCHEMA.

DO NOT CREATE MIGRATIONS.

DO NOT CREATE TESTS.

DO NOT MAKE BUSINESS DECISIONS THAT HAVE NOT BEEN VALIDATED.

ONLY PRODUCE THE IMPLEMENTATION PLAN.

The plan must distinguish clearly between:

[FACT]
Verified from repository/domain implementation.

[CONFIRMED DECISION]
Explicitly provided in this prompt.

[INFERENCE]
Reasonable interpretation, but not yet formally confirmed.

[OPEN DECISION]
Requires product/business decision.

Do not turn [INFERENCE] into [FACT].
Do not turn [OPEN DECISION] into [CONFIRMED DECISION].