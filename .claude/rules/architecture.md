# Medcal Architecture Rules

## Source of Truth

For architecture and implementation decisions, use the latest explicitly designated
source-of-truth document for the current phase.

Do not assume that a later-numbered report automatically supersedes an earlier report.

A report number alone does NOT determine architectural authority.

The task prompt may explicitly define which report/section is the source of truth.
When it does, follow that designation.

## Phase Continuity

Previously completed phases are considered implemented and accepted unless the current
task explicitly requires a change.

Do not reopen, redesign, or re-audit completed phases merely because the current phase
touches related code.

Preserve existing architectural invariants from completed phases.

## Implementation Discipline

Before editing:

1. Inspect the existing implementation.
2. Identify the relevant existing architecture.
3. Implement only the explicitly defined scope.
4. Preserve existing behavior outside that scope.

Do NOT:

- redesign architecture without an explicit requirement
- introduce speculative abstractions
- add future-phase features
- "improve" unrelated code
- add features because they appear useful
- replace an existing architecture with a preferred alternative
- reinterpret business requirements

If the defined architecture cannot satisfy the implementation requirement,
STOP and report the concrete blocker.

Do not invent an alternative architecture.

## Historical Data

Do not modify, reinterpret, or backfill historical production data unless explicitly
required by the task.

Schema migrations must be minimal and limited to the defined scope.

Do not alter previous migrations.

## Phase 4 Invariants

The following are established Medcal architecture invariants unless a future task
explicitly supersedes them:

- MeasurementResult natural key remains unchanged.
- CalibrationTestPoint remains unchanged.
- JobCalibrationTestPoint remains the job-level test-point snapshot.
- replicateIndex remains the dynamic repetition mechanism.
- direction remains a measurement facet.
- referenceValue remains a measurement field.
- Existing tolerance architecture remains unchanged.
- No JobApplicableParameter unless explicitly approved.
- No parameter snapshot unless explicitly approved.
- CalibrationTestPoint is used for named measurement points.
- Phase 4A logical grouping uses:
  - logicalTestKey
  - logicalTestSequence

Do not redesign these mechanisms in later phases.

## No Audit Loop

When a task explicitly defines the architecture and scope:

DO NOT AUDIT AGAIN.
DO NOT REDESIGN.
DO NOT ADD FEATURES.
IMPLEMENT ONLY THE DEFINED SCOPE.

An implementation audit may only be performed when explicitly requested,
or when an actual blocker/inconsistency prevents implementation.