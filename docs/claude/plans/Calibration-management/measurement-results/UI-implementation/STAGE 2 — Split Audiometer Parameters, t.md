STAGE 2 — Split Audiometer Parameters, then Apply CalibrationTestPoint Seed
Mode

Two sub-steps, both applied to local pkmdb. Confirm each sub-step's result before proceeding to the next within this same task.

Context

Three ambiguities from CalibrationTestPoint_Seed_Extraction.md §3 are now resolved:

Audiometer Kanan/Kiri → split into separate DeviceCalibrationParameter rows (confirmed). The worksheet prints two distinct tables ("Earphone Kanan" / "Earphone Kiri"), same tolerance, but structurally two separate measurement series — consistent with the existing Pattern C split precedent (fix-collapsed-pattern-c-parameters.ts).
INCU_AIR_TEMP → keep 10 points as drafted (5 sensors × 2 settings). Confirmed — folding the setting into attemptNumber/replicateIndex would overload their already-locked meanings.
PULSEOX_SPO2 duplicate 90 → keep as drafted (two distinct points, disambiguated labels, faithful to the worksheet as written).
Task A — Split Audiometer parameters
Following the exact pattern of fix-collapsed-pattern-c-parameters.ts:
Create AUD_PURE_TONE_LINEARITY_KANAN and AUD_PURE_TONE_LINEARITY_KIRI (each inheriting the original AUD_PURE_TONE_LINEARITY's toleranceNote/valueType/uom/decimalPlaces/etc. — same bounds, different code/name).
Create AUD_FREQUENCY_RESPONSE_KANAN and AUD_FREQUENCY_RESPONSE_KIRI likewise.
Deactivate (do not hard-delete — follow the project's no-delete convention, same as the original Pattern C fix) the two original collapsed rows (AUD_PURE_TONE_LINEARITY, AUD_FREQUENCY_RESPONSE).
Write this as its own small idempotent script (e.g. packages/db/prisma/fix-collapsed-audiometer-parameters.ts), mirroring the existing precedent file's structure.
Run it against local pkmdb. Report before/after row counts (should go from 2 collapsed rows to 4 split + 2 deactivated, net catalog count +2 active-relevant rows, matching the "489 total, X now active" pattern already used in prior reports).
Task B — Update and apply the CalibrationTestPoint seed script
Update seed-calibration-test-points.ts:
Replace the two AUD_* entries with four entries targeting the new split codes (_KANAN/_KIRI), each with its own 7 or 4 points (undoubled — no more ear-folding in the label, since the split now carries that distinction at the parameter level).
INCU_AIR_TEMP and PULSEOX_SPO2 entries stay exactly as drafted (already confirmed).
Run the updated seed script against local pkmdb. Confirm idempotency still holds (re-running produces 0 new inserts).
Report final counts: total parameters seeded, total CalibrationTestPoint rows created, confirm the 39→41 parameter count shift (2 Audiometer entries became 4) and the corresponding point-count change.
Explicitly deferred (already decided, do not act on these now)
PATIENT_MONITOR, OXYMETER_MONITOR, BREAST_PUMPS, RESUSCITATORS_CARDIAC — left unseeded, not prioritized (user confirmed these are speculative/inactive catalog entries).
VENTILATOR (worksheet exists as a PDF elsewhere) — left unseeded, flagged as a small separate follow-up, not done now.
Testing
Confirm no regression: apps/api typecheck + full test suite, same no-regression comparison rigor as prior stages (a schema-adjacent data change like this shouldn't break anything, but verify).
Spot-check via query: CalibrationTestPoint count per the new Audiometer codes matches 7 and 4 respectively (not 14/8).
Report

Script(s) created/modified, before/after row counts for both catalog split and test-point seed, confirmation of idempotency, test results.

HARD STOP after this — await review before resuming UI planning.
