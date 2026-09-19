STAGE 1 — Cross-Check MeasurementResult Design Against Real calibration-results Data
Mode

READ-ONLY. No schema/code/data changes. Output is a single comprehensive report.

Context

All MeasurementResult design work so far (Pattern A/B/C/D classification, CalibrationTestPoint seed of 191 rows/40 parameters, the entryStyle field/9 logger-summary codes, decimalPlaces deferred at placeholder 0) was built from the 50 blank LK .docx templates — structural evidence only, no real recorded values. docs/technician-docs/measurement-results/*.xlsx contains real completed calibration data — actual field results, confirmed by the user. This is the first chance to validate everything built so far against ground truth.

Task
Enumerate every file in measurement-results/ and map each to a device type / DeviceCalibrationParameter set already in the catalog. Note any device type present in measurement-results/ that has no corresponding blank .docx template (or vice versa) — flag coverage gaps explicitly, don't assume 1:1 overlap with the original 50.
For every NUMBER-type parameter with real recorded values in measurement-results/, extract the actual decimal precision used (e.g., a column showing 98.7, 98.75, or 99 tells you directly). Build the same per-parameter table as DecimalPlaces_Backfill_Proposal.md (code, proposed decimalPlaces, evidence, confidence) but this time sourced from real recorded values, not convention fallback. This should upgrade most "low confidence" rows to "high confidence, real-evidence-based."
Validate CalibrationTestPoint seed data against real recorded setpoints, for every Pattern B/D-fixed parameter that has real data available:
Do the actual setpoints tested match what's seeded (sweep([...]) values)?
Is the count of points consistent (e.g., seeded 4 Heart Rate points — does the real data show exactly 4, or did the technician actually test a different number)?
Flag any discrepancy explicitly — do not silently "correct" the seed, just report what's found vs what's seeded.
Validate Pattern classification and entryStyle against real data:
For each of the 9 LOGGER_SUMMARY parameters (BBR_STORAGE_TEMP etc.), confirm the real recorded data actually looks like a summary + attachment reference (not individual per-point readings) — does real practice match the classification?
Spot-check a sample of Pattern A parameters — does real data confirm single-parameter + replicate-trial structure, or does anything look like it actually needs setpoints (misclassified as A when it should be B)?
Investigate the "expected replicate count" soft spot (flagged in Stage A's report — nothing structural exists, UI defaults to 5 "I–V"). Does the real calibration-results data confirm 5 is the consistent convention across parameters, or does it vary meaningfully by parameter/device type? This could resolve a real open design gap.
Check for anything structurally new that the blank templates didn't reveal — e.g., a column, notation, or pattern in the filled data that suggests a measurement shape not yet accounted for in the current 4-pattern model.
Produce a clear findings summary, categorized:
Confirms: design matches real data, no change needed (list count/examples)
Corrects: design needs adjustment (test point values, pattern classification, entryStyle) — list each with old vs new, and what code/data would need to change
New evidence: decimalPlaces values now groundable with high confidence (the main prize)
New gaps: anything the filled data reveals that wasn't previously known
Output

Write a report to docs/claude/plans/Calibration-management/measurement-results/calibration-results-cross-check.md. Do not propose or apply any fix scripts yet — that's a follow-up stage once findings are reviewed.

HARD STOP after this report — await review before deciding what (if anything) needs correcting.