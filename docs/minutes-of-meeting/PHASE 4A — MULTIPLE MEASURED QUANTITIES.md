PHASE 4A — MULTIPLE MEASURED QUANTITIES
IMPLEMENTATION

Use Report 08 as the architecture baseline.

Implement ONLY Gap A using the A3 architecture described in Report 08.

OBJECTIVE

Support a logical calibration test where several independently measured
quantities belong to the same logical test and must be presented together.

Example:
Dental X-Ray:
- kV
- exposure time (s)
- mGy

Architecture:

Each quantity remains a separate DeviceCalibrationParameter.

Add only the minimum catalog metadata required to:
1. identify parameters belonging to the same logical test
2. define their deterministic presentation/order within that logical test

Do NOT introduce a MeasurementQuantity entity.

DO NOT modify the MeasurementResult natural key.

DO NOT add a new measurement dimension to MeasurementResult.

DO NOT change:
- CalibrationTestPoint
- JobCalibrationTestPoint
- replicateIndex semantics
- direction semantics
- referenceValue semantics
- existing tolerance architecture

Preserve backward compatibility:
- existing parameters with no logical-test metadata continue to behave exactly as today
- existing MeasurementResult records remain valid
- no historical MeasurementResult backfill

IMPLEMENTATION SCOPE

1. Prisma/schema
2. Migration
3. Backend/domain services
4. DTO/API response where metadata must be exposed
5. Query hooks if required
6. Portal configuration UI for the new metadata
7. Tech-PWA only if required by the resulting measurement representation
8. LK/PDF mapping so grouped quantities can be rendered deterministically

IMPORTANT:

The grouping metadata is a catalog/presentation concept.
It must NOT become part of MeasurementResult identity.

Do not infer grouping from parameter names or codes.

Do not create hardcoded Dental X-Ray-specific logic.

The mechanism must be generic enough for future cases such as:
- kV + s + mGy
- Stage micrometer + Eyepiece micrometer
- other LK cases where several parameters belong to one logical test

Do NOT implement:
- derived/aggregate calculation
- formula engine
- technician-created/open-ended parameters
- JobApplicableParameter
- parameter snapshot
- changes to completeness architecture beyond what is strictly necessary for this feature

COMPLETENESS

Existing measurement completeness behavior must remain intact.

Do not introduce a new parameter snapshot mechanism.

Do not change the assumption that DeviceCalibrationParameter is stable master configuration.

HISTORICAL DATA

Existing jobs and results must remain readable.

Existing Pattern A and Pattern B behavior must not regress.

Existing jobs with calibrationTestPointId = NULL must remain valid.

TESTING

Add focused tests for:
- grouped parameters
- deterministic sequence/order
- ungrouped legacy parameters
- multiple quantities within the same logical test
- historical MeasurementResult compatibility
- LK/PDF grouping
- existing measurement behavior regression

Run:
- relevant unit tests
- API tests
- typecheck
- build where applicable

FINAL OUTPUT

Report:
1. files changed
2. schema changes
3. migration
4. API changes
5. Portal changes
6. Tech-PWA changes
7. LK/PDF changes
8. tests executed/results
9. any remaining limitations

If implementation reveals that A3 cannot satisfy the actual code/LK requirements
without changing the MeasurementResult identity model, STOP and report the
blocker instead of redesigning A3 yourself.

Do not invent additional architecture.

Implement only Gap A.