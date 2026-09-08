STAGE 2b — Service Layer: Guard, Tolerance Resolution, CRUD (no API/controller yet)
Mode

Service-layer TypeScript + unit tests only. Do NOT add any controller route or wire this to any HTTP endpoint — that's Stage 2c. Do NOT touch tech-pwa/Portal.

Context

Schema is live locally (Stage 2a, applied). This stage implements the actual logic against it: the "locked after submit" guard, the tolerance-resolution engine, and CRUD service methods — all informed by MeasurementResult_Stage1_Design_Finalization.md §7 and §8, which already contain draft logic to implement faithfully (not reinvent).

Task
Guard function (calibration-jobs.service.ts or a new measurement-results.service.ts — decide file placement, follow existing module conventions): implement assertMeasurementRowEditable exactly per design §7.1 (superseded-attempt check + locked-status check, MEASUREMENT_LOCKED_JOB_STATUSES = {"SUBMITTED", "ACCEPTED_BY_QA"}). Creation additionally requires job.startedAt !== null — reuse the existing CALIBRATION_JOB_NOT_STARTED guard/error code rather than duplicating it.
Tolerance-resolution engine: implement the priority chain from §8.1 and the worked example in §4.2:
If calibrationTestPoint.toleranceMin/Max is set (override) → use it.
Else if parameter.toleranceMin/Max is set → use it.
Else parse parameter.toleranceNote for a ± delta pattern (and any other patterns the 79 note-only rows actually use — check a representative sample from the live catalog, don't assume only one text format) combined with appliedNominalValue (the test point's settingValue, or the technician-supplied value for generic-slot points) to compute effectiveToleranceMin/Max.
Else → effectiveToleranceMin/Max stay NULL, isWithinTolerance stays NULL.
Snapshot the resolved effectiveToleranceMin/Max + appliedNominalValue onto the row at write time (never recompute from a possibly-since-edited master catalog).
isWithinTolerance computation: from raw measuredValue only (locked rule). For BOOLEAN valueType parameters, isWithinTolerance mirrors measuredBool directly (never NULL for a recorded boolean reading, per §4.4c). For RATIO, evaluate using measuredValue (the numeric form), not measuredText.
CRUD service methods:
createMeasurementResult (single row) — runs the guard, resolves tolerance, computes isWithinTolerance, sets recordedByUserId/recordedAt, sets attemptNumber = job.currentAttempt.
updateMeasurementResult — runs the guard (including the superseded-attempt check), allows updating measuredValue/measuredText/measuredBool/referenceValue/note, re-resolves and re-snapshots tolerance if the underlying value changed.
deleteMeasurementResult — runs the guard; confirm whether hard delete is acceptable here (rows are pre-submission drafts by definition, given the guard blocks post-submit deletes) or whether a soft-delete is preferred for consistency with the project's no-delete conventions elsewhere — flag this explicitly with a recommendation rather than assuming.
Consider whether a bulk-write method (create/update many rows in one transaction) is needed at the service layer now, anticipating Stage 2c's API needs (tech-pwa will likely submit a batch of replicates/points at once) — implement if straightforward, but don't over-build; flag if deferring bulk to Stage 2c is cleaner.
Handle the natural-key unique-constraint violation gracefully — translate the raw Postgres unique-violation into a clear application-level error (e.g. MEASUREMENT_DUPLICATE_ENTRY) rather than letting a raw DB error leak.
RBAC placement: identify what permission should gate these actions (likely a new calibrationJob:recordMeasurement or similar, following the existing capability-flag pattern already used for recordReferenceEquipmentUsed/escalateIdentity) — define it, but actual @RequirePermission wiring happens in Stage 2c with the controller.
Testing

Comprehensive unit tests, at minimum:

Guard: rejects write on superseded attempt; rejects write when job status is locked; rejects create when job not started; allows write when IN_PROGRESS and current attempt.
Tolerance resolution: explicit parameter bounds (Pattern A/C case), test-point override, test-point inherit-from-parent, note-only ± delta resolution (use the real BSM_SYSTOLIC "± 5 mmHg" example from §4.2 as a literal test case), fully unresolvable → NULL (use INCU_RECOVERY_TIME or another blank-tolerance row as the literal case).
isWithinTolerance: NUMBER in/out of bounds, BOOLEAN mirrors measuredBool, RATIO uses measuredValue.
Duplicate natural-key write → clean MEASUREMENT_DUPLICATE_ENTRY error, not a raw DB exception.
Full apps/api typecheck + test suite, confirm no regression (same subset-comparison rigor as Stage 2a's report).
Report

Files changed, the tolerance-parsing regex/logic used (and which real note formats it was tested against), delete-strategy recommendation (hard vs soft), bulk-write decision, RBAC capability name proposed, test results.

Write implementation report in the same format as MeasurementResult-stage2b-service-layer-implementation-report.md, at J:\medcal\docs\claude\plans\Calibration-management\measurement-results

HARD STOP after this — await review before Stage 2c (API endpoints).
