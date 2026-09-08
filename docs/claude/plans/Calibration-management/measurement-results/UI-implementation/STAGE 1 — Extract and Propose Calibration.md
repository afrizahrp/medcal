STAGE 1 — Extract and Propose CalibrationTestPoint Seed Data from Real LK Worksheets or docx files

READ-ONLY analysis + a written proposal file (seed script draft). Do NOT run the seed against any database — this stage produces a reviewable proposal only.

Context

CalibrationTestPoint (schema live since Stage 2a) is currently empty — 0 rows. It's required for any Pattern B parameter (fixed setpoint sweep, shared tolerance) and the fixed-slot flavor of Pattern D (per MeasurementResult_Stage1_Design_Finalization.md §4.2/§4.4). Without this seeded, the tech-pwa entry UI for those parameters has nothing to render. This task extracts the real setting points from the same LK worksheet corpus already used for the original 08-27 Pattern A/B/C/D classification and the 489-row DeviceCalibrationParameter catalog.

Task
Locate the LK worksheet corpus — same source as the original classification work (search for technician-docs.zip / any folder with "LK " or "Lembar Kerja" filenges, per the original investigation task's Step 0 method — do not assume a path, verify).
Enumerate every DeviceCalibrationParameter row that needs CalibrationTestPoint children. Query the live catalog and classify each of the 489 rows:
Pattern B (shared tolerance, multiple setpoints) → needs test points, tolerance override left NULL (inherits parent).
Pattern D fixed-slot (e.g., a fixed set of named positions/cycles) → needs test points.
Pattern D generic-slot (technician-chosen setpoint per unit, e.g. SUCT_VACUUM_GAUGE) → needs test points too, but with settingValue = NULL and a generic ordinal label ("Titik ukur N") — confirm count of slots from the worksheet (how many rows does the LK table actually have for this parameter).
Pattern A / Pattern C (already split) / note-only-no-sweep → confirm NO test points needed; exclude explicitly, don't silently skip without listing them as "checked, excluded."
The two already-identified override cases (SUCT_MAX_VACUUM, INCU_AIR_TEMP) → needs test points WITH per-point toleranceMin/Max override set (not inherited).
For every parameter requiring test points, extract from the actual LK document(s):
Exact settingLabel (the human label as it appears on the worksheet — e.g. "60 mmHg", "121°C siklus", "Low Speed")
settingValue where the worksheet specifies a concrete numeric target (NULL for generic-slot cases)
sequence (worksheet order, 1-based)
Per-point tolerance override values for the two flagged multi-class cases
Cross-check consistency across documents: if the same parameter/device type appears in multiple LK samples (e.g. multiple Bed Side Monitor worksheets from different jobs), confirm the setpoints are consistent. Flag and report explicitly any inconsistency found (e.g. one worksheet sweeps 4 HR setpoints, another sweeps 5) rather than silently picking one.
Produce a draft seed script (e.g. packages/db/prisma/seed-calibration-test-points.ts, following the existing seed script conventions in that directory) as a file to review, not executed. Structure it so each parameter's test points are clearly grouped and traceable to the source LK document/page referenced in a comment.
Report summary statistics: total parameters needing test points, total CalibrationTestPoint rows to be created, breakdown by pattern (B / D-fixed / D-generic), any parameters where the LK worksheet didn't provide clear enough setpoint data to seed confidently (flag these explicitly — do not guess).
Output

Write a report to docs/claude/plans/Calibration-management/measurement-results/CalibrationTestPoint_Seed_Extraction.md with the full findings, plus the draft seed script file (not run). Structure the report similarly to prior investigation reports in this project: summary table, per-parameter extraction detail with LK source citation, flagged ambiguities/gaps, and the seed script as an appendix or separate file reference.

J:\medcal\docs\claude\plans\Calibration-management\ui\measurement-results

Do not run the seed script. HARD STOP for review before Stage 2 (apply the seed).
