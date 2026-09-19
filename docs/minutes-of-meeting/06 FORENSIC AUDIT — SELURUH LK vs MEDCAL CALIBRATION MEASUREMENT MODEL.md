# FORENSIC AUDIT — SELURUH LK vs MEDCAL CALIBRATION MEASUREMENT MODEL

## OBJECTIVE

Before implementing Portal CRUD for CalibrationTestPoint, perform a READ-ONLY forensic audit of ALL Lembar Kerja (LK) documents in:

    D:\medcal\docs\technician-docs\Lembar-Kerja

The objective is to discover whether there are measurement structures/patterns already present in the official LK documents that are NOT currently accommodated by the Medcal system.

We already know these named measurement point patterns exist:

1. Awal / Akhir
2. L-N / L-G / N-G

Do NOT assume these are the only ones.

We need to determine whether there are other measurement-point structures, directions, conditions, setpoints, stages, channels, positions, or repeated-value layouts that the current system does not yet model.

THIS IS AN AUDIT ONLY.

DO NOT MODIFY:
- source code
- Prisma schema
- migrations
- seed files
- API
- Portal
- Tech-PWA
- PDF generators
- tests
- database

Do not create any files.

==================================================
PART 1 — INVENTORY ALL LK FILES
==================================================

Recursively inspect:

    D:\medcal\docs\technician-docs\Lembar-Kerja

Identify every relevant LK/document/template file.

Include:
- filename
- file type
- device/instrument type if identifiable
- model/type if identifiable
- whether it is an official/current template or an older/reference document if determinable

Do not assume filename alone determines the device type.

Create an inventory.


==================================================
PART 1A — PROGRAMMATIC EXTRACTION WITH PYTHON
==================================================

You MAY and SHOULD use Python as an analysis aid to systematically extract
content from the LK files.

This is an AUDIT ONLY task.

Python may be used to:
- enumerate all files recursively
- extract text from supported document formats
- extract table contents
- extract headings/paragraphs
- identify repeated measurement labels/column headers
- normalize whitespace for analysis
- produce temporary analysis output if useful

Prioritize preserving TABLE STRUCTURE.

For documents such as:
- .docx → inspect paragraphs AND tables
- .xlsx → inspect worksheets, cells, merged cells, and table-like structures
- .pdf → extract text and, where necessary, inspect/render pages to understand
  table structure
- other formats → use an appropriate read-only extraction method

IMPORTANT:

Do not rely solely on plain-text extraction.

For each LK, inspect:
1. headings
2. measurement parameter names
3. table headers
4. row labels
5. column labels
6. cells where technicians are expected to enter measurements
7. nominal/setpoint/reference columns
8. tolerance columns
9. units
10. repeated measurement columns/rows

If PDF text extraction loses table structure, use page rendering / visual
inspection as necessary.

Python is an ANALYSIS TOOL ONLY.

Do NOT use Python to:
- modify the original LK files
- overwrite documents
- alter repository files
- modify application source code
- modify database data
- generate production artifacts

Temporary extraction files may be created outside the source LK directory
if needed, but they are analysis artifacts only and should not be committed.

==================================================
EXTRACTION QUALITY CHECK
==================================================

After programmatic extraction, manually/visually inspect representative
documents where table structure is ambiguous.

Do not conclude that a measurement pattern does not exist merely because
plain-text extraction failed to expose it.

For every suspected multi-point structure, record the original LK filename
and the relevant page/table/section so the finding can be traced back to the
source document.

==================================================
EVIDENCE REQUIREMENT
==================================================

Every identified measurement structure must be traceable to an actual LK.

For each finding, provide:

    LK filename
    section/page/table if available
    parameter
    observed labels/columns
    classification
    interpretation

Do not infer a requirement solely from a filename or from the current
Medcal implementation.

If extraction is ambiguous, mark it:

    AMBIGUOUS

and explain what could not be determined.




==================================================
PART 2 — EXTRACT MEASUREMENT STRUCTURES
==================================================

For EVERY LK, inspect the actual measurement sections/tables.

We are NOT merely looking for parameter names.

For every measurement parameter, identify its measurement structure.

Examples:

PATTERN A:

    Suhu
    Terukur: ______

PATTERN B:

    Suhu
    Terukur:
      Awal: ______
      Akhir: ______

MULTI-POINT:

    Tegangan Input
      L-N: ______
      L-G: ______
      N-G: ______

But also actively look for other structures such as:

- Low / Nominal / High
- Min / Max
- Before / After
- Inlet / Outlet
- Input / Output
- Up / Down
- Open / Close
- Forward / Reverse
- Channel 1 / Channel 2 / Channel 3
- Left / Right
- Front / Rear
- Primary / Secondary
- Load / No Load
- Standby / Operating
- Setpoint-based measurements
- multiple pressure points
- multiple voltage points
- multiple temperature points
- multiple speed points
- multiple flow points
- multiple electrical combinations
- different measurement conditions
- multiple columns representing different test points
- measurement values tied to a setting/nominal value
- measurement values tied to direction
- measurement values tied to a physical position
- measurement values tied to a test condition
- any other structure where one calibration parameter has multiple distinct measurement identities

Do NOT assume the above examples actually exist.
They are search categories only.

==================================================
PART 3 — DISTINGUISH PARAMETER VS MEASUREMENT POINT
==================================================

For each discovered structure determine whether it is:

A. A normal independent calibration parameter

or

B. One calibration parameter with multiple named measurement points

or

C. A repetition of the same measurement

or

D. A derived/calculated value

or

E. A reference/setpoint/nominal value rather than a measured result

This distinction is critical.

Example:

    Temperature
      Awal
      Akhir

= one parameter + two named measurement points.

But:

    Temperature
      Ulangan 1
      Ulangan 2

= one parameter + repetitions, NOT named points.

Similarly:

    Voltage
      220 V nominal
      measured 221 V

may represent a nominal/setpoint plus one measurement, NOT necessarily two measurement points.

Do not classify based on visual layout alone.

==================================================
PART 4 — COMPARE AGAINST CURRENT MEDCAL MODEL
==================================================

Inspect the current Medcal implementation:

- CalibrationParameter
- CalibrationTestPoint
- JobCalibrationTestPoint
- MeasurementResult
- measurement parameter API
- Tech-PWA measurement renderer
- LK mapping
- relevant PDF templates

Determine what measurement structures are currently supported.

Current conceptual model:

PATTERN A:

    CalibrationParameter
        ↓
    MeasurementResult
        ↓
    replicateIndex

PATTERN B:

    CalibrationParameter
        ↓
    CalibrationTestPoint[]
        ↓
    JobCalibrationTestPoint[]
        ↓
    MeasurementResult.calibrationTestPointId
        +
    replicateIndex

Determine whether this model can represent every structure found in the LK documents.

==================================================
PART 5 — GAP MATRIX
==================================================

Create a matrix:

| LK / Device | Parameter | LK Measurement Structure | Classification | Current Medcal Support | Gap | Notes |
|---|---|---|---|---|---|---|

Examples:

| BSM | Suhu | Awal / Akhir | Named TP | YES | None | |
| BSM | Tegangan Input | L-N / L-G / N-G | Named TP | YES | None | |

But include EVERY discovered case.

Do not omit unusual or ambiguous cases.

==================================================
PART 6 — SEARCH CURRENT CODE FOR EXISTING SPECIAL CASES
==================================================

Inspect the codebase for signs that certain LK measurement patterns are already handled through special logic rather than generic CalibrationTestPoint.

Search for:

- hardcoded parameter IDs
- hardcoded test point labels
- device-specific measurement branching
- direction-specific fields
- columns such as:
    up
    down
    input
    output
    before
    after
    min
    max
    low
    high
- special PDF mappings
- special Tech-PWA measurement forms
- parameter-specific result selection
- result aggregation
- result ordering assumptions

Look especially at:

    apps/api/src/modules/calibration-jobs/

    apps/tech-pwa/src/

and any relevant Portal calibration-parameter code.

For every special case found, determine:

1. Why it exists.
2. Whether it corresponds to an LK requirement.
3. Whether CalibrationTestPoint could represent it generically.
4. Whether it is currently unsupported in Technician measurement entry.

DO NOT refactor anything.

==================================================
PART 7 — MULTI-DIRECTION / MULTI-CONDITION ANALYSIS
==================================================

Pay special attention to measurement tables that contain multiple values under headings such as:

    UP / DOWN
    RISING / FALLING
    IN / OUT
    INPUT / OUTPUT
    BEFORE / AFTER
    OPEN / CLOSE
    LOW / HIGH

Determine whether each is:

1. A named measurement point,
2. A measurement direction associated with the same point,
3. A separate parameter,
4. A repetition,
5. Or a document-only representation.

This is especially important for existing cases such as:

    SPHYG_PRESSURE_ACC

where UP/DOWN may exist.

Do not automatically convert every column into CalibrationTestPoint.

==================================================
PART 8 — SETPOINT / NOMINAL VALUE ANALYSIS
==================================================

Inspect LK tables containing:

    setting
    nominal
    target
    standard
    reference
    set point
    range

Determine whether the value is:

- a named measurement point,
- a setting value belonging to a named point,
- a nominal/reference value,
- a tolerance,
- or something else.

Compare this against current fields:

    CalibrationTestPoint.settingLabel
    CalibrationTestPoint.settingValue
    tolerance
    MeasurementResult.measuredValue

Determine whether the existing model is sufficient.

==================================================
PART 9 — REPETITION ANALYSIS
==================================================

Determine which LK documents require multiple readings of the same point.

Examples:

    Awal
      reading 1
      reading 2
      reading 3

or:

    Setpoint 100
      reading 1
      reading 2

Determine whether the current dynamic:

    replicateIndex

is sufficient.

Do not introduce or recommend:

    expectedReplicateCount

unless the LK documents explicitly require a fixed number of readings AND the current architecture demonstrably cannot represent it.

If a fixed number is only a template convention rather than a system requirement, clearly distinguish that.

==================================================
PART 10 — DOCUMENT STRUCTURE VS DATA MODEL
==================================================

Some LK may have visual sections that look like multiple measurement points but are actually:

- calculated values
- acceptance criteria
- reference values
- metadata
- environmental conditions
- equipment information
- test method information

Do not classify these as measurement points unless the evidence supports it.

We are specifically looking for values that technicians are expected to ENTER as calibration measurement results.

==================================================
PART 11 — FUTURE-PROOF MODEL CHECK
==================================================

Evaluate whether the current generic model:

    CalibrationParameter
        +
    CalibrationTestPoint[]
        +
    MeasurementResult.calibrationTestPointId
        +
    replicateIndex

is sufficient to represent ALL actual measurement-point patterns found in the LK corpus.

Possible result:

A. Current model is sufficient.

or:

B. Current model is sufficient for named points but one or more LK structures require another concept.

If B, identify the exact structure and explain why CalibrationTestPoint alone is insufficient.

Do NOT design the solution yet.

==================================================
PART 12 — IMPORTANT EXISTING ARCHITECTURE
==================================================

Remember the current locked architecture:

For started jobs:

    CalibrationTestPoint
        ↓ snapshot at Job.start()
    JobCalibrationTestPoint
        ↓
    MeasurementResult.calibrationTestPointId

Pattern A:

    zero snapshot test points

Pattern B:

    one or more snapshot test points

Identity of named point:

    calibrationTestPointId

NOT:

    replicateIndex

Historical NULL:

    calibrationTestPointId = NULL

must remain valid Pattern A.

Do not propose changing this architecture during the audit.

==================================================
PART 13 — OUTPUT

Return exactly:

# LK Measurement Structure Audit

## 1. Executive Summary

Answer:

- How many LK files were inspected?
- How many distinct measurement structures were found?
- Besides known:
    Awal/Akhir
    L-N/L-G/N-G
  were any additional multi-point structures found?
- Are there any structures currently unsupported by Medcal?
- Is CalibrationTestPoint sufficient as the generic model?

## 2. LK Inventory

Table:

| File | Device/Instrument | Measurement Sections | Notes |
|---|---|---|---|

## 3. Measurement Structure Catalog

Group discovered structures:

### A. Pattern A — Single Measurement + Repetition

### B. Named Measurement Points

### C. Direction-Based Measurements

### D. Condition-Based Measurements

### E. Setpoint-Based Measurements

### F. Other / Ambiguous

For each include actual LK examples.

## 4. Complete Gap Matrix

Use:

| Device | Parameter | LK Structure | Classification | Current System | Gap |
|---|---|---|---|---|---|

## 5. Existing Code Special Cases

List all relevant hardcoded/special handling found.

## 6. Unsupported Structures

For every unsupported structure:

- LK
- parameter
- exact structure
- why current model cannot represent it
- whether it is a real measurement input or merely document formatting

## 7. CalibrationTestPoint Sufficiency

State whether:

    CalibrationParameter
    +
    CalibrationTestPoint
    +
    JobCalibrationTestPoint
    +
    MeasurementResult
    +
    replicateIndex

can represent the complete LK measurement corpus.

## 8. Recommendations Before Portal CRUD

This section must NOT implement anything.

State whether Portal CRUD should support only:

    settingLabel
    settingValue
    sequence
    tolerance override
    active/inactive

or whether additional concepts are objectively required based on LK evidence.

Do not invent requirements.

## 9. Files Inspected

List:
- all LK files inspected
- relevant Medcal source files inspected

## 10. Explicit Non-Changes

Confirm:

- no source files modified
- no schema modified
- no migration
- no seed modified
- no API modified
- no UI modified
- no database modified