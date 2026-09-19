STAGE A — tech-pwa Measurement Entry: Skeleton + Pattern A Only Mode

Full-stack UI task (tech-pwa) using the already-built API (Stage 2c). No API/schema changes expected — flag if a genuine gap surfaces (e.g., missing endpoint), don't silently add scope.

Scope boundary

Only Pattern A parameters: valueType = NUMBER, zero CalibrationTestPoint children, entryKind = DIRECT_READING (no logger-summary/attachment case). This is roughly half the catalog. Pattern B (test-point grids), Pattern D (logger-summary, generic-slot, boolean, ratio) are explicitly NOT in this stage — even if a parameter looks simple, if it has test points or isn't NUMBER, skip it for now.

Context

Backend (MeasurementResult schema, service, API) is fully built and tested (Stage 2a/b/c). CalibrationTestPoint is seeded for 40 parameters. decimalPlaces is still placeholder 0 for all parameters (accepted interim — round to whole numbers, precision will improve later once real calibration data backfills it; do not block on this).

Task
Identify Pattern A parameters for a job's resolved device type: query DeviceCalibrationParameter filtered by the job's resolved deviceTypeId, isActive = true, valueType = "NUMBER", and no CalibrationTestPoint children. Confirm this query approach against the live catalog (spot-check a known Pattern A parameter like DUNIT_ILLUMINANCE to make sure it's correctly identified).
Investigate: is there a concept of "expected number of replicates" anywhere (e.g. on DeviceCalibrationParameter, or only implied by worksheet convention like "trials I–V")? If nothing structural exists, don't invent a new schema field for this stage — instead default the entry UI to a sensible starting count (e.g. 5 rows, matching the common "I–V" convention seen throughout the LK corpus) with an "add replicate" affordance so the technician isn't blocked if a parameter genuinely needs more or fewer. Flag this as a known soft spot, not a hard gate.
Entry point in tech-pwa job flow: add a section/button on the job detail screen (mirroring "Ajukan Koreksi Identitas" / "Catat Alat Referensi" placement) — e.g. "Catat Hasil Pengukuran" — visible when job.status = IN_PROGRESS. List the applicable Pattern A parameters for this job, each showing: parameter name, unit, tolerance (human-readable from toleranceNote/bounds), and entry status (e.g. "0/5 diisi", or a checkmark once all rows for that parameter are saved).
Per-parameter entry screen: tapping a parameter opens a screen with N replicate input rows (numeric keyboard, decimalPlaces-aware formatting — currently 0, so whole-number input for now, but read the field so it's automatically correct once backfilled later, don't hardcode 0). Each row shows immediate pass/fail feedback (green/red chip) once saved, using the isWithinTolerance returned directly in the write response — no second round-trip.
Submit mechanics: use the batch-create endpoint (POST /calibration-jobs/:id/measurement-results/batch) when saving multiple new replicate rows at once; use the single update endpoint (PATCH .../measurement-results/:measurementId) for editing an already-saved row. Load existing rows via the list endpoint (GET .../measurement-results) when reopening a job/parameter mid-entry, so previously entered values repopulate correctly.
Respect the lock: if job.status is no longer IN_PROGRESS (submitted, or a superseded attempt), render the entry rows read-only, matching the guard's error codes (MEASUREMENT_JOB_SUBMITTED, MEASUREMENT_ATTEMPT_SUPERSEDED) with a clear inline message rather than a raw error toast.
Real-time consistency: apply the same polling pattern already used elsewhere in tech-pwa/Portal (6s refetchInterval + refetchOnWindowFocus) if this screen could plausibly be viewed by two people at once (unlikely for measurement entry specifically, since it's single-technician data entry — confirm this assumption is reasonable and skip polling if not needed, don't add it reflexively).
Explicitly out of scope

Pattern B/D UI, Portal UI, Excel export, decimalPlaces precision beyond the current placeholder, offline/local-storage behavior.

Testing
Manual: open a job with known Pattern A parameters (e.g. one with DUNIT_ILLUMINANCE-equivalent structure if the catalog has an in-progress job of that device type; otherwise confirm against whichever real pilot job/device type is available), enter replicate values, confirm pass/fail chips render correctly, confirm lock behavior after submit.
Confirm existing tech-pwa test suite unaffected; add tests for any new pure logic (e.g. the pass/fail chip rendering, decimalPlaces-aware formatting helper).
Typecheck for apps/tech-pwa.
Report

Files changed, screenshots/description of the UI, the "expected replicate count" decision made, test results.

HARD STOP after this — await review before Stage B (Pattern B grid UI).
