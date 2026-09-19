STAGE 1 — Extract & Propose decimalPlaces per DeviceCalibrationParameter
Mode

READ-ONLY analysis + a written proposal file. Do NOT apply any backfill in this stage.

Context

All 486 NUMBER-type DeviceCalibrationParameter rows currently carry the placeholder decimalPlaces = 0 (confirmed in MeasurementResult_Stage1_Design_Finalization.md §2). This blocks accurate measurement entry — the tech-pwa input field needs to know the real precision per parameter (e.g., a temperature reading to 1 decimal vs a speed reading as a whole number) to format/validate input correctly, and it affects how values render on the Excel export and eventual certificate.

Task
For every NUMBER-type parameter, determine the correct decimalPlaces from real evidence — in priority order:
The actual example/sample values written in the LK worksheet's measurement columns (if a worksheet shows a technician's real recorded reading like "78.5" or "121.34", that's direct evidence of the precision actually used in practice).
The resolution of the reference/standard instrument listed for that measurement (per the "Daftar Alat yang Digunakan" table already extracted in earlier investigations) — e.g., a thermometer with 0.01°C resolution implies 2 decimal places is achievable/expected; a simple RPM counter implies 0.
The unit's natural precision convention (e.g., bpm/rpm counts are conventionally whole numbers; mmHg typically whole numbers; °C typically 1 decimal; % typically whole or 1 decimal) — use this only as a fallback when the worksheet itself doesn't show a clear example, and flag every case where this fallback was used (don't silently guess without flagging).
Cross-reference the CalibrationTestPoint and Pattern classification work already done — parameters already processed have known example values in the seed script (sweep([...], unit) calls) which may already hint at expected precision (e.g., are the worksheet's setpoint values themselves whole numbers or decimals?).
Produce a per-parameter table: code, current decimalPlaces (0), proposed decimalPlaces, evidence source (worksheet example value / instrument resolution / unit convention fallback), confidence (high/medium/low).
Flag explicitly, don't guess silently: any parameter where no worksheet evidence exists and only the unit-convention fallback applies — list these separately as "low confidence, convention-based" so they can be spot-checked by a human later if needed, same treatment as the LK-gap parameters flagged in the test-point extraction.
Produce a draft backfill script (e.g. packages/db/prisma/backfill-decimal-places.ts, idempotent — safe to re-run, only updates rows still at the 0 placeholder or explicitly listed) as a file to review, not executed.
Output

Write a report to docs/claude/plans/Calibration-management/measurement-results/DecimalPlaces_Backfill_Proposal.md with the full per-parameter table, evidence citations, and the flagged low-confidence list, plus the draft script.

Do not run the backfill. HARD STOP for review before Stage 2 (apply it).
