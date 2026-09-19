PHASE 4 — MEASUREMENT DOMAIN ARCHITECTURE DESIGN

READ-ONLY — NO IMPLEMENTATION

Use ONLY Report 07 as the domain/audit baseline for this task.

Do NOT repeat the forensic LK audit.
Do NOT reread/re-audit Reports 01–06 unless a specific historical decision must be verified.

Report 07 has already identified the remaining domain gaps:
1. Multiple measured quantities in one logical test
2. Derived / aggregate measurements
3. Technician-defined / open-ended parameters

Your task now is to convert those findings into a concrete TARGET DOMAIN ARCHITECTURE.

==================================================
1. VALIDATE AGAINST ACTUAL CODE
==================================================

Inspect the actual Medcal codebase, especially:

- Prisma schema
- CalibrationParameter
- CalibrationTestPoint
- JobCalibrationTestPoint
- MeasurementResult
- calibration job services
- measurement endpoints / DTOs
- measurement completeness
- Tech-PWA measurement logic
- Portal calibration parameter logic
- LK/PDF mapping
- existing tests and migrations

Use Report 07 as the evidence for the LK/domain requirements.

Do not redesign existing architecture unless the actual code demonstrates that it cannot satisfy the requirements.

==================================================
2. GAP A — MULTIPLE MEASURED QUANTITIES
==================================================

Design how to represent a logical test containing multiple independent measurements.

Known example from Report 07:
Dental X-Ray:
- kV
- exposure time
- mGy

Determine:

- whether MeasurementResult can be minimally extended
- whether a child measurement/component/quantity entity is required
- ownership and relationships
- value + unit
- tolerance
- nominal/setpoint
- pass/fail
- replication
- named test points
- historical snapshot requirements

Compare viable architecture options and explain trade-offs.

Prefer minimal domain expansion while preserving existing data.

==================================================
3. GAP B — DERIVED / AGGREGATE MEASUREMENTS
==================================================

Design how values such as:

- ΔT
- ratio
- difference
- average/min/max
- K-factor
- other derived values

should be represented.

Determine:

- raw vs derived measurement
- automatic calculation vs manual entry
- whether both are required
- dependency/provenance
- formula representation
- formula version/snapshot requirements
- tolerance
- pass/fail
- manual override, if justified
- interaction with test points and replicateIndex
- storage model

IMPORTANT:

Do not infer or correct questionable LK formulas.
If Report 07 identifies an ambiguous or potentially defective formula, preserve that as a business/domain confirmation item.

==================================================
4. GAP C — TECHNICIAN-DEFINED PARAMETERS
==================================================

Design the domain model for open-ended parameters such as analytes in:

- Auto Chemistry Analyzer
- Hematology Analyzer

Determine the correct scope:

- global catalog
- device type
- device model
- calibration job
- UUT
- another scope

Determine:

- relationship to deviceCalibrationParameterId
- unit
- tolerance
- permissions
- approval
- snapshot behavior
- historical immutability
- Portal configuration
- Tech-PWA entry
- LK/PDF rendering

Avoid creating an uncontrolled arbitrary-parameter mechanism.

==================================================
5. CROSS-DOMAIN ARCHITECTURE
==================================================

Evaluate the three designs together.

Specifically determine:

- Can CalibrationTestPoint remain unchanged?
- Can JobCalibrationTestPoint remain the job snapshot mechanism?
- Can dynamic replicateIndex remain unchanged?
- How should direction interact?
- How should referenceValue interact?
- How should entryStyle interact?
- How should valueType interact?
- How should tolerance overrides work?
- How should measurement completeness work?
- How should Submit for Review work?
- What must be snapshotted?
- What happens to historical jobs?
- What happens to existing MeasurementResult?
- What happens to IN_PROGRESS jobs?
- What happens to REWORK jobs?

==================================================
6. MINIMUM MODEL CHANGE
==================================================

Produce the smallest coherent target domain model.

Explicitly show:

CURRENT MODEL
      ↓
TARGET MODEL

Describe new entities/fields/relationships only where necessary.

For every proposed schema change explain:

- why it is required
- what problem it solves
- historical-data impact
- migration implications
- whether existing records remain valid

Do not write migration code.

==================================================
7. DOWNSTREAM IMPACT
==================================================

Describe what will eventually need to change in:

- Prisma/schema
- services
- controllers/endpoints
- DTOs
- query hooks
- Portal
- Tech-PWA
- measurement completeness
- LK/PDF
- tests

Also explicitly state what should remain unchanged.

==================================================
8. DECISION MATRIX
==================================================

For each of the three gaps provide:

- Current capability
- Actual limitation
- Option A
- Option B
- Option C if justified
- Trade-offs
- Historical-data impact
- Implementation implications
- Recommended architecture

Do NOT use numerical scores, rankings, or winner/loser language.

==================================================
9. BUSINESS CONFIRMATION
==================================================

Clearly separate:

A. DECISIONS SUPPORTED BY REPORT 07 + CURRENT CODE

B. DECISIONS REQUIRING BUSINESS / DOMAIN OWNER CONFIRMATION

C. ASSUMPTIONS THAT MUST NOT BE IMPLEMENTED WITHOUT CONFIRMATION

==================================================
10. IMPLEMENTATION SEQUENCE
==================================================

Provide the proposed sequence after architecture approval.

For example:

1. Schema/domain model
2. Migration
3. Backend/domain services
4. API/DTO
5. Query hooks
6. Portal
7. Tech-PWA
8. Measurement completeness
9. LK/PDF
10. E2E/regression

Adjust this sequence if the architecture requires otherwise.

==================================================
STRICT BOUNDARY
==================================================

READ-ONLY ONLY.

DO NOT:

- modify Prisma schema
- create migrations
- modify API
- modify services
- modify hooks
- modify Portal
- modify Tech-PWA
- modify PDF
- modify seed
- alter existing data
- commit changes

The only deliverable is the architecture/design report.

STOP after the report and wait for approval.