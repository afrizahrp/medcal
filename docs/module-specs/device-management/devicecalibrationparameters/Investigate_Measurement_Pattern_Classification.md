# INVESTIGATE — Classify Performance-Measurement Patterns Across All LK Documents

## Mode
READ-ONLY ANALYSIS ONLY. Do NOT edit, create, delete, or modify any schema, seed script,
migration, or data — with ONE exception: you may write a single new report file at the path
specified in "Output" below. This task extends the still-open "G2" question from
`investigation-lk-vs-measurement-schema.md` (structured `MeasurementEntry` model design) — do
NOT design or implement `MeasurementEntry`, `CalibrationTestPoint`, or any new model in this
task. This task only classifies and reports evidence to inform that future design.

## Background — why this task exists

Two example documents were manually reviewed and revealed that the "performance measurement"
data in LK worksheets does NOT follow one single structural pattern:

- **Bed Side Monitor — Heart Rate**: tested at 4 numeric setting points (30/60/120/180 BPM),
  each with 5 replicate readings (I-V), and ONE tolerance ("± 5 bpm") that applies equally to
  ALL 4 setting points. Call this **Pattern B**.
- **Dental Unit — Kecepatan Putar Handpiece**: has two named variants, "Low Speed" (tolerance
  5,000-11,000 rpm) and "High Speed" (tolerance >250,000 rpm) — each variant has ITS OWN
  distinct, unrelated tolerance range, not a shared delta. Call this **Pattern C**.
- Also observed in the same Dental Unit document: several parameters (Tekanan Handpiece,
  Illuminance, Tekanan Semprot Udara, Daya Hisap) have NO setting-point sweep at all — just one
  fixed target/range, tested with 5 replicates (I-V) and nothing else. Call this **Pattern A**.

These three patterns need fundamentally different data modeling (Pattern B: child test-points
that inherit the parent parameter's tolerance; Pattern C: each variant likely needs to be its
own separate `DeviceCalibrationParameter` row with its own tolerance, NOT a shared-tolerance
child; Pattern A: no setting-point concept needed at all, just repeated trials against one
target). Before any structural model is designed, we need to know how common each pattern
actually is, and — critically — whether the already-seeded 481-row `DeviceCalibrationParameter`
catalog currently represents Pattern C cases correctly (as separate rows) or incorrectly
(collapsed into one row that can't actually hold two different tolerances).

## Step 0 — Locate source documents and current data

1. Confirm `docs/technician-docs/` is accessible (50 `.docx` LK worksheets).
2. Confirm current `DeviceCalibrationParameter` row count (expect 481) and pull a full list of
   all rows with their `deviceTypeId`, `capabilityItemId`, `code`, `name`,
   `toleranceMin`/`toleranceMax`/`toleranceNote` — you'll cross-reference against this.

## Step 1 — Classify every performance-measurement item across all 50 documents

For EVERY device type's "Hasil Pengukuran Kinerja Alat" (or equivalently-named) section in
`docs/technician-docs/`, go through each measured parameter/row and classify it into one of:

- **Pattern A — Single target, replicates only**: one fixed tolerance/range, tested with
  multiple trials (I-V or similar), no setting-point column at all.
- **Pattern B — Multiple setting points, ONE shared tolerance**: a "Setting Simulator" (or
  similar) column with multiple numeric values, and a single tolerance value/expression that
  applies to all of them (e.g. one "±X" cell spanning multiple setting rows).
- **Pattern C — Multiple named/qualitative variants, EACH with its own distinct tolerance**:
  multiple rows under one conceptual parameter, where each row's tolerance is a genuinely
  different range/value, not a shared delta from different setting points.
- **Pattern D (or higher) — anything that doesn't fit A/B/C**: describe the actual structure
  you find (e.g. paired reference-vs-UUT columns, derived/calculated values, free-form
  parameter lists, non-numeric qualitative pass/fail, external data-logger readings not
  entered in the LK — these were already flagged as existing in the original 50-document
  investigation; classify them here too rather than forcing them into A/B/C).

For each item, record: device type, parameter name (as written in the LK), which pattern,
and a short evidence snippet (quote the relevant table cells).

Do NOT limit yourself to just the currently-seeded 27+24=59 (approx) device types — go through
ALL device types that have a document in `docs/technician-docs/`, including ones not yet in
the `DeviceType` catalog (e.g. the 3 free-form lab analyzers, Thermohygrometer), so the
classification is complete regardless of what's been implemented so far.

## Step 2 — Cross-check Pattern C cases against currently-seeded data

This is the most important check. For every item you classified as **Pattern C**, look up
whether it's currently represented in `DeviceCalibrationParameter` (from your Step 0 pull) as:
- **Correctly split**: separate rows already exist for each variant, each with its own
  distinct `toleranceMin`/`toleranceMax`/`toleranceNote` matching the source document, OR
- **Incorrectly collapsed**: only ONE row exists covering what should be multiple variants,
  meaning its `toleranceMin`/`toleranceMax`/`toleranceNote` can only reflect ONE of the
  variants (or none correctly) — this is a real data-correctness bug if found, not just a
  future-design question.

Specifically verify the Dental Unit Handpiece Low/High Speed case (seeded recently as part of
the device-taxonomy-extension work) as your first check, then continue through any other
Pattern C cases you find among the other newly-seeded 24 device types and among the original
27, in case any of those also have unrecognized Pattern C structure.

## Step 3 — Summarize pattern prevalence

Produce counts: how many total performance-measurement items were classified, and how many
fall into each pattern (A/B/C/D+). This gives a sense of how much of the eventual
`MeasurementEntry`/test-point design needs to handle each shape.

## Output

Write a single report to:
`D:\medcal\docs\claude\plans\Calibration-management\investigation-measurement-pattern-classification.md`

Structure:

```markdown
# Investigation: Performance-Measurement Pattern Classification (Pattern A/B/C/D+)

## Summary
[Total items classified, counts per pattern, headline finding on Pattern C data-correctness
check]

## Pattern A — Single Target, Replicates Only
[List of items, device type, evidence]

## Pattern B — Multiple Setting Points, Shared Tolerance
[List of items, device type, evidence]

## Pattern C — Multiple Variants, Distinct Tolerances Per Variant
[List of items, device type, evidence, AND for each: is it correctly split in current seed
data, or incorrectly collapsed? Cite the actual current DeviceCalibrationParameter row(s)
found]

## Pattern D+ — Other Structures
[List of items, device type, evidence, brief description of the structure]

## Data-Correctness Issues Found (Pattern C mismatches)
[Explicit list of any DeviceCalibrationParameter rows that need to be split into multiple
rows to correctly represent their real tolerance structure — this is actionable, not just
informational, but DO NOT FIX IT in this task, just report it precisely enough that a future
task can]

## Implications for Future MeasurementEntry / Test-Point Design
[Brief synthesis: given the real prevalence of each pattern, what does the eventual model
need to support]
```

Do not modify any other file. Confirm in your final chat message that no schema/code/data
changes were made — this was analysis only.
