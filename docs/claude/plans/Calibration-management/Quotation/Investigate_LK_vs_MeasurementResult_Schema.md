# INVESTIGATE — Can CalibrationJob/MeasurementResult/JobEvidence Support Real LK Worksheets?

## Mode
READ-ONLY ANALYSIS ONLY. Do NOT edit, create, delete, or modify any file (schema, code,
migration, documentation) — with ONE exception: you may write a single new report file at the
path specified in "Output" below. Do NOT run migrations. Do NOT implement any fix or schema
change, even if the gap seems obvious or small — this task is diagnostic/advisory only. A
separate task will handle implementation later, informed by your findings here.

## Background — why this task exists

The Prisma schema already has `CalibrationJob`, `MeasurementResult` (currently using
unstructured `payloadJson`/`summaryJson` fields), `JobEvidence`, and `Certificate` models,
related to `WorkOrder`. Separately, a structured master catalog `DeviceCalibrationParameter`
(242 rows, covering 27 device types) was built from the company's own real calibration
worksheets ("LK" — Lembar Kerja). There is a known, previously-flagged open question: **no
link currently exists between `MeasurementResult` and `DeviceCalibrationParameter`** — nothing
ties a technician's actual field measurement back to which specific master parameter it
fulfills.

This task's job is to determine, with evidence, whether `MeasurementResult` (and
`CalibrationJob`/`JobEvidence` alongside it) as currently defined can ACTUALLY capture what a
real LK worksheet requires — or whether it's structurally insufficient, and if so, exactly
where and why. The expectation, based on prior analysis of two sample LK documents, is that
the current schema is **likely NOT sufficient as-is** — but you must verify this yourself
against the real documents, not just accept that expectation.

## What real LK worksheets actually contain (context from 2 sample documents already reviewed)

Two sample documents (`LK_Cold_Chain__Vaccine_Refrigerator.docx` and
`LK_Bed_Side_Monitor.docx`) were already examined and reveal a consistent structure. Use this
as a guide for what to look for across ALL the LK documents you find — but verify against the
actual documents you extract, don't assume every LK matches this exactly:

1. **Header/context block**: certificate number, device name/brand/model/serial/capacity/
   resolution, owner, room/location, received date, calibration date, device ID number. Much
   of this likely already maps to existing `Device`/`Certificate`/`WorkOrder` fields — verify
   which parts do and don't.

2. **Reference/standard equipment used** (table: "Daftar Alat yang Digunakan"): a list of the
   calibration reference instruments used for that specific job (e.g. "Thermometer 12
   channel", "Electrical Safety Analyzer", "Vital Signs Simulator", "Thermohygrometer"), each
   with brand/model/serial number. **This does not appear to have any home in the current
   schema at all** — check whether `JobEvidence` or any other model could represent "which
   reference standard(s) were used for this specific job," and if not, note this as a gap.

3. **Environmental conditions, before/after** (table): Temperature, Humidity, Input Voltage
   (L-N/L-G/N-G), each with an "Awal" (before) and "Akhir" (after) reading plus a tolerance
   range. This is STRUCTURED numeric data with two timepoints per parameter — check whether
   `MeasurementResult`'s current `payloadJson`/`summaryJson` shape could represent this
   cleanly, or whether it would just become an unvalidated blob.

4. **Physical condition checklist** (table): a fixed list of inspection items (body/surface,
   power plug, power cord, buttons/switches, display/indicators), each scored Baik/Tidak Baik
   (Good/Not Good) — qualitative pass/fail, not numeric.

5. **Electrical safety readings** (table): Protective Earth Resistance, Insulation Resistance,
   Equipment Leakage Current, Applied Part Leakage Current — each with an actual measured
   value against a threshold. **These directly correspond to `DeviceCalibrationParameter` rows
   already seeded** under the `ELECTRICAL_SAFETY` capability (check this alignment explicitly
   — do the LK's electrical safety rows match the parameter codes already in
   `DeviceCalibrationParameter` for the relevant `DeviceType`s?).

6. **Performance measurements** (one or more tables, device-type-specific): e.g. for Bed Side
   Monitor — Heart Rate tested at 4 setting points × 5 repeated trials each; Respiration Rate
   at 4 points × 5 trials; SpO2 at 7 points × 5 trials; NIBP (Systole/Mean/Diastole) at 7
   points × 5 trials each. This is HIGHLY structured multi-point, multi-replicate numeric data
   tied to specific parameters. **This is the core of what `MeasurementResult` needs to
   support** — check carefully whether the current JSON-blob approach can represent
   "parameter X, setting point Y, replicate N, measured value Z" in a way that's queryable/
   validated, or whether it would just be an opaque blob with no structure enforced.

7. **Technical review / scoring** (table "Telaah Teknis"): a weighted scoring breakdown
   (e.g. Kondisi Alat out of 10, Keselamatan Listrik out of 40, Kinerja Peralatan out of 50)
   with Baik/Tidak Baik per line, feeding into an overall pass/fail conclusion ("Baik dan laik
   untuk digunakan" / "Tidak baik dan tidak laik untuk digunakan"). Check whether this maps to
   `QualityReview` (found in earlier audit work) or anything else in the schema.

8. **Sign-off**: "Petugas Kalibrasi" (technician) and "Entri data oleh" (data entry) — check
   whether this maps to existing audit-trail fields (`*ByUserId` patterns noted in earlier
   audit work) or is unaccounted for.

## Step 0 — Locate and extract the source documents

1. Search the repository for `technician-docs.zip` (location may vary — check
   `D:\medcal\docs\technician-docs`, `D:\medcal\docs\claude\plans\Calibration-management`, and
   any other plausible location; do not assume, actually search). If you cannot find it,
   search for any folder/zip containing LK documents (look for filenames starting with "LK "
   or containing "Lembar Kerja") and report what you find instead.
2. Extract it (or note if it's already extracted) and list every LK document found (.docx,
   .pdf, or any other format).
3. Read the full content of EVERY LK document found — tables and text — not just a sample.
   For `.docx` files, read paragraph text AND table contents (tables often carry the actual
   structured data — don't skip them). For any LK document you cannot fully parse (e.g.
   scanned image PDF with no extractable text), note it explicitly rather than skipping
   silently.

## Step 1 — Cross-reference against current schema

For each of the 8 structural elements described above (adjust/add categories if real
documents reveal a different or more nuanced structure than the 2 samples suggested — don't
force everything into exactly these 8 buckets if the evidence says otherwise):

1. Quote/cite the actual current Prisma model definitions for `CalibrationJob`,
   `MeasurementResult`, `JobEvidence`, `Certificate`, `QualityReview`, and
   `DeviceCalibrationParameter` directly from `schema.prisma` (don't rely on memory of prior
   descriptions — read the live file).
2. For each structural element, state clearly: CAN the current schema represent it faithfully
   and queryably today, or NOT? Give your reasoning with specific field-level detail (e.g.
   "MeasurementResult.payloadJson could technically hold this as a JSON blob, but there is no
   schema-level guarantee it references a valid DeviceCalibrationParameter, no per-replicate
   structure, and no way to query 'show me all NIBP Systole readings out of tolerance across
   jobs' without ad-hoc JSON parsing").
3. Explicitly check the electrical-safety alignment (element 6 above): do the
   `DeviceCalibrationParameter` rows already seeded for the relevant DeviceTypes match what
   the real LK documents show? Report any mismatches found (e.g. different tolerance framing,
   different parameter groupings) — these would be useful signal even though fixing them is
   out of scope for this task.

## Step 2 — If gaps are found (expected), provide grounded suggestions — do not implement

For each real gap identified, propose 1-3 concrete options for how the schema COULD evolve to
close it, each grounded in what you actually observed in the LK documents (not generic
best-practice speculation). For example, if multi-point/multi-replicate structured
measurements can't be represented, describe what a structured measurement-entry model might
need to look like (e.g. relating to `DeviceCalibrationParameter`, a setting-point value, a
replicate/trial number, a measured value, pass/fail) — as a PROPOSAL with trade-offs, not a
schema you implement. Reference the existing open architecture question already on file
(if you have access to it: "MeasurementResult ↔ DeviceCalibrationParameter linkage," logged in
this project's handoff documentation) and state whether your findings confirm, refine, or
change that framing.

Do NOT propose collapsing `DeviceCalibrationParameter` itself into a value-holding table (a
previous proposal that did this was correctly rejected earlier in this project — master
definitions and actual measured results are meant to stay as separate concerns). Keep your
suggestions on the "how do we record actual results" side, not the "let's change what the
master catalog means" side.

## Output

Write a single report to:
`D:\medcal\docs\claude\plans\Calibration-management\investigation-lk-vs-measurement-schema.md`

Structure:

```markdown
# Investigation: Can Current Schema Support Real LK Worksheets?

## Documents Found and Processed
[list every LK document found, noting any that couldn't be fully parsed]

## Verdict
[One clear paragraph: can CalibrationJob/MeasurementResult/JobEvidence support real LK
worksheets today? Yes / Partially / No — with the core reason.]

## Structural Element Analysis
[One subsection per structural element found (element 1-8 above, or your revised list),
each with: what the LK requires, current schema capability (cite exact fields), can-it or
can't-it, and why]

## Electrical Safety Parameter Alignment Check
[Findings from Step 1.3]

## Suggested Directions (not implemented, for future design discussion)
[Grounded proposals per Step 2, each with trade-offs]

## Relation to Existing Open Architecture Question
[How this confirms/refines the previously-logged MeasurementResult <-> 
DeviceCalibrationParameter gap]
```

Do not modify any other file. Confirm in your final chat message that no schema/code changes
were made — this was analysis only.
