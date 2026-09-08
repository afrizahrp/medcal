STAGE 2c — API Endpoints for MeasurementResult
Mode

Controller + DTO/request-schema + RBAC wiring only. Do NOT touch tech-pwa/Portal UI — that's a later stage. Service layer (Stage 2b) is complete and untouched here except where a genuinely new need surfaces (flag, don't silently expand scope).

Context

MeasurementResultsService (create/createMany/update/remove) is built and tested. This stage exposes it over HTTP: controller routes, Zod/DTO request validation, and @RequirePermission wiring using the calibrationJob:recordMeasurement capability already defined.

Task
Routes (follow existing calibration-jobs.controller.ts conventions — nested under the job, consistent with reference-equipment-used etc.):
POST /calibration-jobs/:jobId/measurement-results — single create
POST /calibration-jobs/:jobId/measurement-results/batch — createMany (the tech-pwa grid-submit case)
PATCH /calibration-jobs/:jobId/measurement-results/:id — update
DELETE /calibration-jobs/:jobId/measurement-results/:id — remove
GET /calibration-jobs/:jobId/measurement-results — list (needed for tech-pwa to load existing entries when reopening a job mid-entry; confirm if a Stage 2b read method exists or needs adding here — flag if so, small addition)
Request schemas (Zod, in packages/shared following the project's existing pattern — e.g. how equipmentCalibrationRecordCreateSchema or identityCorrection schemas are structured): fields matching MeasurementResultsService.create's input shape (deviceCalibrationParameterId, calibrationTestPointId?, replicateIndex, direction?, measuredValue?/measuredText?/measuredBool?, referenceValue?, note?). Batch schema wraps an array of these. Update schema is a partial subset of editable fields only (per Stage 2b: measuredValue/measuredText/measuredBool/referenceValue/note — never direction/replicateIndex/calibrationTestPointId, which are natural-key components).
@RequirePermission("calibrationJob", "recordMeasurement") on all mutating routes. Confirm GET (list) should use a read-level permission instead — check what pattern other list endpoints in this controller use (likely just requires being able to view the job at all, not a separate read-specific grant) and follow that, don't invent a new permission if an existing view-level check already covers it.
Error mapping: confirm the service's thrown exceptions (BadRequestException/ConflictException with the code values from Stage 2b) surface with correct HTTP status codes and that the existing global exception filter (if any) formats them consistently with other endpoints — spot-check against how IdentityCorrection errors currently surface to the client.
Response shape: decide what the create/update/list responses return — the full MeasurementResult row including resolved effectiveToleranceMin/Max/isWithinTolerance (needed by tech-pwa immediately after a write to show pass/fail feedback without a second round-trip). Confirm serialization handles Decimal fields correctly (check how other Decimal fields are serialized elsewhere in the API, e.g. DeviceCalibrationParameter.toleranceMin responses) to avoid a known class of bug (Decimal objects not JSON-serializing as plain numbers/strings).
Controller-level tests (integration, hitting the actual routes): at minimum, one happy-path per route, one permission-denial case, one validation-failure case (e.g. missing required field), one guard-rejection case (e.g. attempt to update after submit → expect the MEASUREMENT_JOB_SUBMITTED error surfaces as the correct HTTP status).
Testing
New controller integration tests (per task 6).
Full apps/api typecheck + test suite, same no-regression comparison rigor as prior stages.
Report

Files changed, exact route list with methods, response-shape decision + Decimal-serialization confirmation, test results.

Write implementation report in the same format as MeasurementResult-stage2c-api-endpoints-for-measurement-implementation-report.md, at J:\medcal\docs\claude\plans\Calibration-management\measurement-results

HARD STOP after this — await review before any tech-pwa/Portal UI work begins.
