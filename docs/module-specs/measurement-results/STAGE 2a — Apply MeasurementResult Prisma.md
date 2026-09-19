STAGE 2a — Apply MeasurementResult Prisma Migration (schema only, no service/API code)
Mode

Schema + migration only. Do NOT write any service, controller, or UI code in this task — that's Stage 2b onward. This stage's only output is the applied migration and a clean prisma generate.

Context

This applies the design locked in MeasurementResult_Stage1_Design_Finalization.md (read it in full first — §3 has the exact Prisma blocks). Two decisions were confirmed by the user after that report:

direction (MeasurementDirection) is confirmed as the 6th component of the natural-key unique constraint.
PostgreSQL is confirmed 16.15 on both local and VPS — use UNIQUE NULLS NOT DISTINCT directly (§3.4 option 1), no fallback needed.
Task
Apply exactly the schema from §3 of the design report:
New enums MeasurementDirection (NONE/UP/DOWN) and MeasurementEntryKind (DIRECT_READING/LOGGER_SUMMARY).
New model CalibrationTestPoint (§3.2) — full field set, relations, the two @@unique constraints, index.
Restructured MeasurementResult (§3.3) — drop payloadJson/summaryJson, add every typed column listed, all relations, all indexes.
The natural-key constraint from §3.3/§3.4: @@unique([calibrationJobId, deviceCalibrationParameterId, calibrationTestPointId, replicateIndex, attemptNumber, direction]), hand-edited in the generated migration SQL to add NULLS NOT DISTINCT (Prisma's schema syntax doesn't support this directly — confirm exactly how the codebase's migration files are hand-edited elsewhere for similar cases, if any precedent exists, and follow that convention).
Back-reference edits (§3.5): DeviceCalibrationParameter.testPoints/.measurementResults, CalibrationJob.currentAttempt Int @default(1), User.measurementResultsRecorded, FileObject.measurementAttachments, Uom.measurementResults.
New FileOwnerType enum value MEASUREMENT_RESULT — per §3.6, this must be its own separate migration (outside a transaction), confirm the existing repo pattern for prior enum-value additions (e.g. how IDENTITY_CORRECTION was added) and follow it exactly.
The CHECK constraints noted in §3.6: replicateIndex >= 1, attemptNumber >= 1, CalibrationTestPoint.sequence >= 1.
Run the migration against the local dev database (pkmdb) — this is safe: MeasurementResult has 0 rows, no backfill needed, confirmed in the report.
Run prisma generate and confirm apps/api typecheck passes cleanly against the new generated client types (no application code should reference the new models yet, so this just confirms the schema itself is valid and the client compiles).
Do NOT apply this migration to the VPS/production database — local only for this stage.
Double check nothing else broke: run the full existing apps/api test suite — expect it to pass unchanged, since no application code was touched (a regression here would mean the migration broke something unrelated, e.g. a naming collision).
Testing
Migration applies cleanly to local pkmdb.
npx prisma generate succeeds.
apps/api typecheck: PASS.
apps/api full test suite: same pre-existing pass/fail counts as the last known baseline (report if anything changed).
Report
Exact migration file(s) generated, confirm the hand-edited NULLS NOT DISTINCT clause and the separate enum-value migration.
Typecheck + test results.
Confirm explicitly: local only, VPS untouched, no .ts service/controller/UI file modified.

Write implementation report in the same format as MeasurementResult-stage2a-schema-only-implementation-report.md, at J:\medcal\docs\claude\plans\Calibration-management\measurement-results

HARD STOP after this — await review before Stage 2b (service layer).
