# PLAN — High-Volume Calibration Trial: Minto Hardjo
## MT Operations + Technician Tech-PWA End-to-End UX Validation

You are working on the Medcal project.

We want to prepare a controlled trial using a real-world-like high-volume hospital scenario based on the uploaded Excel file:

`/mnt/data/po-mintohardjo.xlsx`

The scenario is Minto Hardjo Hospital.

The purpose of this task is NOT to implement the trial yet.

Your task is to:
1. inspect the existing architecture and data model,
2. understand the complete requisition → PO → calibration job → MT workflow → Tech-PWA workflow,
3. determine the safest and most realistic way to create a reusable trial fixture,
4. produce a detailed implementation plan,
5. identify risks, assumptions, inconsistencies, and anything that must be clarified before implementation.

---

# 1. BUSINESS OBJECTIVE

We want to experience what Medcal feels like when handling a high-volume hospital order.

The target scenario is approximately:

- 56 requisition items
- approximately 406 units from the supplied Excel data
- approximately 409 calibration jobs downstream

IMPORTANT:

Do NOT blindly assume that 56 items / 406 units must mathematically produce exactly 409 calibration jobs.

Inspect the actual Medcal business logic that determines calibration-job generation.

Explain:

- how requisition quantity becomes calibration jobs,
- whether one unit can generate multiple jobs,
- whether capabilities/parameters affect job count,
- whether 409 is actually achievable from this dataset under the current business rules,
- and if the target needs a controlled trial-specific fixture adjustment.

The Excel file is the source dataset for this trial.

Do not modify the original Excel.

---

# 2. CORE PRINCIPLE

This is an OPERATIONAL UX TRIAL, not a data-entry exercise.

We do NOT want to manually execute 409 calibration jobs through Tech-PWA.

That would waste time and would not help us evaluate the high-volume MT experience.

Instead:

## MT side

We want approximately 409 REAL calibration-job records in the real application/database/business workflow.

Those jobs should be distributed across realistic operational states so that MT can experience:

- high-volume job management,
- queues,
- approvals,
- filtering,
- searching,
- workload visibility,
- progress monitoring,
- exception/rework situations,
- BAI approval workload,
- "Setujui Identitas Alat yang digunakan untuk kalibrasi" workload,
- and navigation across the related transaction entities.

The MT experience must use the REAL existing UI and APIs.

Do not create a fake/mock dashboard.

---

## Technician side

We only need a REPRESENTATIVE SUBSET of jobs to be manually executed through Tech-PWA.

Approximately 10–15 jobs should be sufficient initially, but determine the appropriate number based on the actual workflow after auditing it.

These jobs must deliberately cover different workflow characteristics, for example:

- simple calibration workflow,
- multiple parameters,
- multiple capabilities,
- different device categories,
- identity-related scenario,
- BAI-related scenario where applicable,
- edge/rework scenario,
- potentially a job with more complex parameter input.

The exact scenarios must be based on the actual Medcal implementation.

The goal is to personally experience the technician workflow with three evaluation criteria:

### EASY
Can the technician understand what needs to be done without unnecessary cognitive load?

### FAST
Can the technician complete a job with minimal navigation and interaction overhead?

### ACCURATE
Does the UI help the technician avoid selecting the wrong device, capability, parameter, standard, result, or conclusion?

The Tech-PWA jobs must be REAL jobs from the same trial dataset used by MT.

For example:

MT sees:

    Calibration Job #XYZ
    Status: In Progress

Then we can log in as the technician and actually complete:

    Calibration Job #XYZ

After completion, MT should see the resulting state transition through the normal application workflow.

---

# 3. MASTER DATA STRATEGY

DO NOT spend time manually creating a perfect production master for all 56 device types.

That is not the purpose of this trial.

First audit existing master data.

For each Excel item, determine whether it can be mapped to:

1. EXISTING MASTER
2. REPRESENTATIVE EXISTING MASTER
3. SYNTHETIC TRIAL MASTER

The mapping must NOT be arbitrary.

It must be semantically plausible enough for the downstream workflow to behave realistically.

For example:

    Ventilator
        ↓
    Ventilator-like trial device
        ↓
    Relevant capability
        ↓
    Relevant calibration parameters

Do NOT create nonsensical mappings merely to generate records.

If synthetic masters are necessary, create the MINIMUM data structure required for the real downstream workflow to function.

Do not overbuild production master data.

---

# 4. SYNTHETIC DATA MUST BE CLEARLY ISOLATED

Any synthetic/trial data must be clearly identifiable as trial data.

Prefer a trial identifier such as:

    MINTOSHARDJO-TRIAL-2026

or whatever convention is consistent with the existing Medcal architecture.

The trial must be:

- reproducible,
- resettable,
- isolated from production master data,
- safe to delete/reset,
- and safe to reseed after UI changes.

Ideally the final implementation should provide an explicit fixture/seed/reset mechanism.

For example conceptually:

    seed Minto Hardjo trial
    reset Minto Hardjo trial

Do NOT implement these commands yet.

First determine the correct architecture and mechanism.

---

# 5. IMPORTANT: AUDIT THE EXISTING ARCHITECTURE FIRST

Before proposing implementation, inspect the actual codebase.

At minimum inspect:

## Requisition

- requisition data model
- requisition item model
- import Excel flow
- Excel validation
- mapping UI
- device matching
- quantity handling
- QA workflow

## PO

- PO creation flow
- PO item generation
- relationship to requisition
- high-volume rendering
- existing pagination/search/filter patterns
- status handling

## Calibration Job

Inspect:

- data model
- creation/generation logic
- job lifecycle
- relationship to PO/requisition/device
- capability relationship
- parameter relationship
- BAI relationship
- identity approval relationship
- technician assignment
- status transitions
- completion flow
- rework/error flow

## MT UI

Identify all screens involved in:

- viewing workload,
- BAI approval,
- identity approval,
- calibration-job monitoring,
- searching,
- filtering,
- sorting,
- bulk actions if any,
- job detail,
- progress monitoring.

We need to know whether the current UI already supports high volume or whether the trial will expose bottlenecks.

## Tech-PWA

Inspect the COMPLETE actual workflow for a technician:

    job list
      ↓
    job detail
      ↓
    device/context
      ↓
    capability
      ↓
    calibration parameters
      ↓
    input result
      ↓
    validation
      ↓
    conclusion
      ↓
    submission
      ↓
    completion/status transition

Do not infer this workflow from assumptions.

Inspect the actual implementation.

---

# 6. HIGH-VOLUME MT STATE DISTRIBUTION

The trial should NOT contain 409 jobs all in the same state.

We need a realistic mixture of operational states.

Do not invent state names.

First inspect the actual state machine in the codebase.

Then propose a distribution such as:

    New
    Assigned
    BAI Pending
    Identity Approval Pending
    Ready
    In Progress
    Completed
    Rework / Exception

The exact states and quantities must be based on the actual implementation.

The purpose is to make MT experience:

> "I genuinely have hundreds of jobs moving through the system."

rather than:

> "I have a table containing 409 identical records."

---

# 7. BAI + IDENTITY APPROVAL ARE CRITICAL

Pay special attention to:

## BAI approval

We want enough trial jobs in a state where MT actually has to deal with BAI approval.

We need to determine:

- how BAI is represented,
- what triggers approval,
- what MT sees,
- whether approval is per job/item/group,
- whether bulk approval exists,
- how many interactions are required,
- what happens after approval.

## "Setujui Identitas Alat yang digunakan untuk kalibrasi"

This is also a key part of the UX trial.

Inspect:

- when identity approval is required,
- what data MT must review,
- whether it is per calibration job,
- whether it can be performed in bulk,
- whether there is a queue/list,
- how the user discovers pending approvals,
- and what state transition occurs after approval.

DO NOT simplify or bypass these workflows in the trial if doing so would prevent us from evaluating the actual MT UX.

However, do not manually approve hundreds of records just to populate the trial.

Seed realistic states where appropriate.

---

# 8. TECH-PWA REPRESENTATIVE SCENARIOS

Identify the minimum number of jobs needed to exercise the meaningful branches of the actual Tech-PWA workflow.

The final plan should define a matrix similar to:

| Scenario | Why it exists | Manual execution? |
|---|---|---|
| Simple job | Baseline technician flow | Yes |
| Multiple parameters | Input complexity | Yes |
| Multiple capabilities | Navigation/context | Yes |
| Different device category | Device variation | Yes |
| Identity-related | Correctness | Yes |
| BAI-related | Workflow dependency | Yes if applicable |
| Rework/exception | Error handling | Yes |
| Representative high-volume transition | MT ↔ Tech interaction | Yes |

Do not blindly use this exact matrix.

Adapt it to the actual implementation after audit.

---

# 9. WHAT WE WANT TO MEASURE

The trial is intended to reveal UX friction, not merely prove that the system technically works.

For MT, investigate:

- Can MT understand overall workload?
- Can MT quickly find what needs attention?
- Can MT distinguish BAI pending from identity approval pending?
- Can MT process approvals efficiently?
- Does 409 jobs create excessive cognitive load?
- Are filters/search sufficient?
- Does pagination/grouping work well?
- Is status information understandable?
- Is the navigation hierarchy still clear at high volume?
- Are there unnecessary clicks?
- Are bulk actions available where they should be?
- Are there places where MT has to open jobs one by one unnecessarily?
- Are there performance/rendering problems?

For technician, investigate:

### EASY

- Is the next action obvious?
- Is the device/context clear?
- Are parameters understandable?
- Does the technician have to remember information from another screen?

### FAST

- How many interactions are required?
- Is navigation linear?
- Are there unnecessary page transitions/modals?
- Does the technician have to repeatedly re-enter or reconfirm information?

### ACCURATE

- Is the correct device obvious?
- Is the correct capability obvious?
- Are calibration parameters unambiguous?
- Does the UI reduce human error?
- Are validation errors understandable?
- Does the workflow protect against submitting incorrect calibration data?

---

# 10. PERFORMANCE / VOLUME

The plan must explicitly consider technical implications of approximately:

    56 requisition items
    ~406 units
    ~409 calibration jobs

Inspect whether the current implementation has:

- pagination,
- server-side filtering,
- server-side sorting,
- eager loading risks,
- N+1 queries,
- expensive joins,
- large API payloads,
- frontend rendering problems,
- unnecessary refetching,
- expensive dashboard aggregation.

Do NOT optimize prematurely.

The purpose of this audit is to identify whether the trial itself may expose performance problems and how we should measure them.

---

# 11. REPRODUCIBILITY

The final trial fixture should ideally support:

    seed
       ↓
    run MT UX trial
       ↓
    run Tech-PWA representative trial
       ↓
    modify UI
       ↓
    reset
       ↓
    reseed
       ↓
    repeat

The plan must explain how this can be achieved safely in the current architecture.

---

# 12. DATA INTEGRITY

Do not weaken production business rules merely to make the trial easier.

If a fixture requires bypassing a normal workflow, explicitly identify:

- what is being bypassed,
- why,
- whether it affects the validity of the UX trial,
- and whether a better fixture approach exists.

The preferred approach is:

> Seed the database into realistic states while preserving the application's normal read/update behavior.

Do not modify production business logic solely for the trial unless absolutely necessary.

---

# 13. DO NOT IMPLEMENT YET

This task is PLANNING ONLY.

Do NOT:

- create migration files,
- modify production schema,
- create synthetic master data,
- seed the database,
- change UI,
- change Tech-PWA,
- change business logic,
- change RBAC,
- change production workflow.

First produce the plan.

---

# 14. REQUIRED DELIVERABLE

Create a detailed implementation plan/report containing:

## A. Current Architecture

Explain the relevant existing flow:

    Excel
      ↓
    Requisition
      ↓
    QA
      ↓
    PO
      ↓
    Calibration Jobs
      ↓
    MT workflow
      ↓
    Tech-PWA
      ↓
    Completion

Use actual code references.

---

## B. Existing Master Coverage

For all 56 Excel items, determine:

- exact/possible existing master mapping,
- representative mapping possibility,
- synthetic master requirement.

Provide a mapping matrix.

Do not invent mappings without evidence.

---

## C. Job Generation Analysis

Explain exactly how the application currently generates calibration jobs.

Determine whether:

    56 items
    ~406 units

can produce:

    ~409 calibration jobs

under the current rules.

If not, explain why and propose the least-invasive trial fixture strategy.

---

## D. Trial Fixture Architecture

Describe:

- trial identifier,
- data isolation,
- seed strategy,
- reset strategy,
- relationships,
- synthetic data boundaries,
- how to avoid polluting production master data.

---

## E. MT Trial Design

Define:

- target job volume,
- state distribution,
- BAI distribution,
- identity approval distribution,
- assignment distribution,
- completion/rework distribution,
- representative edge cases.

Explain what MT will actually be able to experience.

---

## F. Tech-PWA Trial Design

Define:

- number of manually executed jobs,
- scenario matrix,
- which existing jobs will be used,
- expected state transitions,
- how the same jobs can be observed from MT afterward.

---

## G. Performance Considerations

Identify likely bottlenecks and what should be observed during the trial.

Do not perform optimization yet.

---

## H. Risks

Include:

- master-data dependency,
- job-generation dependency,
- approval workflow dependency,
- state-machine constraints,
- data integrity,
- performance,
- trial reset,
- accidental production contamination.

---

## I. Implementation Phases

Propose a safe sequence such as:

    Phase 1 — Architecture audit
    Phase 2 — Mapping design
    Phase 3 — Fixture design
    Phase 4 — Seed implementation
    Phase 5 — Validation
    Phase 6 — MT UX trial
    Phase 7 — Tech-PWA UX trial
    Phase 8 — Findings / remediation

Adjust the phases based on the actual codebase.

---

# 15. IMPORTANT OUTPUT QUALITY REQUIREMENT

Do not give a generic plan.

The plan must be grounded in the actual Medcal implementation.

For every important conclusion, reference:

- actual files,
- models,
- services,
- APIs,
- pages,
- components,
- state machines,
- or existing seed/test infrastructure.

Explicitly distinguish:

    CONFIRMED FROM CODE
    INFERENCE
    REQUIRES VERIFICATION

If something cannot be determined from the codebase, say so.

Do not silently assume.

The most important question is:

> "What is the safest and fastest way to create a realistic Minto Hardjo high-volume trial that lets us personally experience both the MT workload of ~409 calibration jobs and the technician workflow in Tech-PWA, without manually executing hundreds of jobs and without corrupting production data?"

Answer that question through the architecture audit and implementation plan.