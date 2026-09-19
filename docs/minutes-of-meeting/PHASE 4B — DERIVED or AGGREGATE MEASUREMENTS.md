PHASE 4B — DERIVED / AGGREGATE MEASUREMENTS
IMPLEMENTATION TASK

SOURCE OF TRUTH:
- Report 08 — Phase 4 Measurement Domain Architecture
- Phase 4A implementation already completed and accepted.
- Implement ONLY the minimum B1 architecture defined in Report 08 §3.
- Do not redesign Phase 4A.
- Do not audit/reopen Phase 4A decisions unless an actual code blocker makes implementation impossible.

==================================================
1. SCOPE
==================================================

Implement Gap B: Derived / Aggregate Measurements.

Use the minimum B1 architecture from Report 08:

- Add `DERIVED` to `CalibrationParameterEntryStyle`.
- Add descriptive derivation metadata to `DeviceCalibrationParameter`.
- Derived values are still stored as ordinary `MeasurementResult`.
- NO formula engine.
- NO automatic calculation.
- NO formula parser/evaluator.
- NO closed operation set.
- NO automatic recalculation.
- NO attempt to infer formulas from LK documents.
- Technician/manual entry remains responsible for entering the derived value.

The purpose of this phase is ONLY to represent and distinguish a derived/aggregate measurement in the domain model and UI/document flow.

==================================================
2. EXPLICIT NON-GOALS
==================================================

DO NOT implement:

- formula engine
- expression parser
- formula execution
- automatic derived-value calculation
- dependency graph
- automatic propagation/recalculation
- validation of mathematical formulas
- formula result verification
- automatic source-measurement linking
- new MeasurementQuantity entity
- JobApplicableParameter
- parameter snapshot
- technician-created/open-ended parameters
- new tolerance architecture
- changes to MeasurementResult natural key
- changes to CalibrationTestPoint
- changes to JobCalibrationTestPoint
- changes to replicateIndex
- changes to direction
- changes to referenceValue
- changes to attachment handling
- changes to submitForReview/completeness architecture except where required to preserve existing behavior.

DO NOT guess or encode any specific formula from the LK corpus.

In particular:

DO NOT implement or assume a formula for:
- Autoclave ΔT2
- Autoclave ΔT3
- any other derived/aggregate parameter.

The previously observed Autoclave ΔT3 inconsistency must remain a business/document-owner question, not an engineering assumption.

==================================================
3. DATA MODEL
==================================================

Inspect the existing Prisma schema before editing.

Existing model:
`DeviceCalibrationParameter`

Add only the minimum metadata required by B1.

Expected direction from Report 08:

- `derivation Json?`

Use the exact existing project conventions for nullable JSON fields and Prisma version.

Also extend:

`CalibrationParameterEntryStyle`

with:

`DERIVED`

Do NOT add additional derivation fields unless the existing code makes them strictly necessary.

The metadata is DESCRIPTIVE ONLY.

It must NOT be executable.

Example conceptual metadata:

{
  "description": "Difference between S1 and S3"
}

or equivalent project-compatible representation.

Do not hardcode this example into seed/catalog data.

Do not create a formula language.

==================================================
4. MEASUREMENT RESULT
==================================================

Keep `MeasurementResult` as the storage model for the derived value.

DO NOT modify its natural key.

DO NOT add a separate DerivedMeasurement table.

DO NOT add source-result foreign keys.

A derived measurement remains a normal measurement result, distinguished by its parameter's entry style.

Existing fields such as:

- measuredValue
- measuredText
- measuredBool
- uomId
- entryKind
- appliedNominalValue
- effectiveToleranceMin
- effectiveToleranceMax
- attachmentFileObjectId

must retain their current semantics.

Do not duplicate any of these fields.

==================================================
5. BACKEND
==================================================

Inspect existing:

- DeviceCalibrationParametersService
- calibration-jobs.service
- measurement APIs
- DTO/shared schemas
- tolerance resolution
- measurement completeness

before editing.

Implement only what is required to:

1. expose `DERIVED` as a valid entry style;
2. persist `derivation` metadata;
3. return both fields through relevant parameter APIs;
4. preserve existing behavior for all existing entry styles;
5. allow a DERIVED parameter to be represented in measurement flows.

Do not change the completeness rules unless technically required.

If `DERIVED` can already participate in the existing measurement/result flow without special completeness logic, leave completeness unchanged.

Do not introduce special business logic for particular device types.

==================================================
6. SHARED DTO / VALIDATION
==================================================

Update shared create/update schemas only as required.

Requirements:

- `entryStyle` accepts `DERIVED`.
- `derivation` is optional/null.
- Do not validate formula syntax.
- Do not evaluate or interpret the JSON.
- Preserve existing validation behavior for all other entry styles.

If the project has existing conventions for JSON DTO validation, follow them.

Keep the contract minimal.

==================================================
7. PORTAL
==================================================

Update Device Calibration Parameter CRUD only as required to configure:

- Entry Style = DERIVED
- Derivation metadata

Use clear generic labels.

The Portal must NOT present a formula builder.

The Portal must NOT imply that Medcal automatically calculates the result.

The derivation field should be treated as descriptive metadata/documentation.

Do not add device-specific UI.

Do not add new features outside this scope.

Existing Phase 4A fields:
- logicalTestKey
- logicalTestSequence

must remain intact and must continue to work.

==================================================
8. TECH-PWA
==================================================

Inspect the existing measurement renderer and parameter entry-style handling.

Implement the minimum required so `DERIVED` parameters can be rendered and manually entered without breaking existing styles.

Preferred behavior:

- render as a normal manual measurement value when applicable;
- no automatic calculation;
- no formula execution;
- no source-result selection UI;
- no special dependency UI.

If the current generic renderer already handles DERIVED once the enum/type contract is extended, do not unnecessarily modify the renderer.

Do not redesign the measurement grid.

==================================================
9. LK / PDF
==================================================

Inspect the existing generic LK mapping and PDF pipeline.

Derived parameters must continue to appear as ordinary measurement rows.

Expose descriptive derivation metadata only where the existing generic document model has a natural place to show it.

Do NOT redesign LK templates.

Do NOT create a new derived-measurement layout.

Do NOT add formula rendering.

Do NOT modify the BSM-specific template unless an actual compile/runtime requirement makes it necessary.

==================================================
10. DATABASE MIGRATION
==================================================

Create a NEW Prisma migration.

Migration must be additive and limited to the B1 changes.

Do not modify or rewrite previous migrations.

Do not backfill existing parameters.

Do not create derived metadata for historical records.

Existing parameters must retain their current entryStyle and behavior.

==================================================
11. SEED / CATALOG DATA
==================================================

DO NOT invent or populate derived formulas/metadata into existing device catalogs.

Do not modify Autoclave or other device seeds merely to demonstrate the feature.

This phase implements the mechanism only.

Actual catalog configuration can be done later after business/document-owner confirmation.

==================================================
12. TESTING
==================================================

Follow the project's Vitest testing rule.

DO NOT use grep/sort/awk/head/tail to filter test output.

During implementation:

1. Run focused tests for changed modules.
2. Run relevant full package suite.
3. Run typecheck.
4. Run build where relevant.

At minimum verify:

- DERIVED enum accepted.
- derivation metadata create/update/read works.
- existing entry styles remain unchanged.
- Phase 4A logicalTestKey/logicalTestSequence behavior remains intact.
- measurement parameter API exposes DERIVED correctly.
- Tech-PWA does not regress.
- LK mapping does not regress.
- existing MeasurementResult identity remains unchanged.

If a test fails:
- investigate the actual cause;
- fix the implementation if caused by this phase;
- do not delete, weaken, skip, or bypass tests.

==================================================
13. ARCHITECTURAL INVARIANTS
==================================================

The following are NON-NEGOTIABLE:

MeasurementResult natural key:
UNCHANGED.

CalibrationTestPoint:
UNCHANGED.

JobCalibrationTestPoint:
UNCHANGED.

replicateIndex:
UNCHANGED.

direction:
UNCHANGED.

referenceValue:
UNCHANGED.

Tolerance architecture:
UNCHANGED.

Phase 4A:
UNCHANGED.

No JobApplicableParameter.

No parameter snapshot.

No formula engine.

No automatic calculation.

No guessed formulas.

==================================================
14. IMPLEMENTATION DISCIPLINE
==================================================

Inspect existing code BEFORE editing.

Do not redesign.

Do not refactor unrelated code.

Do not add speculative abstractions.

Do not add compatibility layers unless required by the existing code.

Do not modify unrelated modules.

Keep the implementation minimal and consistent with existing Medcal patterns.

If a requirement above cannot be implemented without violating an architectural invariant, STOP and report the exact blocker instead of inventing an alternative architecture.

==================================================
15. COMPLETION REPORT
==================================================

At completion, report:

1. Files changed.
2. Schema changes.
3. Migration name.
4. API/DTO changes.
5. Portal changes.
6. Tech-PWA changes.
7. LK/PDF changes.
8. Tests executed and exact results.
9. Typecheck/build results.
10. Any remaining limitations.

Explicitly confirm:

- No formula engine.
- No automatic calculation.
- No guessed formulas.
- No MeasurementResult identity change.
- No CalibrationTestPoint change.
- No JobCalibrationTestPoint change.
- No parameter snapshot.
- No JobApplicableParameter.
- No Phase 4A redesign.