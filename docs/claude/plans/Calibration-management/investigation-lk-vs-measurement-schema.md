# Investigation: Can Current Schema Support Real LK Worksheets?

## Documents Found and Processed

Source: `d:\technician-docs.zip`, already extracted to `docs/technician-docs/` at the start of
this task. 50 `.docx` LK worksheets were found, one per device type, converted to plain text
(via unzip + XML-tag stripping, preserving table cell/row boundaries) and read in full —
header, all tables, footnotes. Two of them (`LK Bed Side Monitor`, `LK Cold Chain, Vaccine
Refrigerator`) also had a companion `.pdf`, already reviewed in the prior 2-document sample;
the `.docx` content matches the PDF exactly (same tables, same tolerances), so no reconciliation
issue.

All 50 were parsed successfully — **none were garbled or unreadable**.

Full list processed: Audiometer, Auto Chemistry Analyzer, Autoclave, Baby Incubator, Bed Side
Monitor, Bio Safety Cabinet, Blanket Warmer, Blood Bank Refrigerator, Blood Pressure Monitor,
Centrifuge, Centrifuge Refrigerator, Cold Chain/Vaccine Refrigerator, CPAP, Dental Unit, Dental
X-Ray, Electro Accupunture (EST), Electrocardiograph, Examination Lamp, Fetal Doppler, Flow
Meter, Head Lamp Medik, Hematologi Analyzer, Humidifier, Infant Warmer, Infusion Pump,
Kelistrikan, Laminar Air Flow, Lampu Operasi, Laryngoskop, Medical Freezer, Medical
Refrigerator, Mikroskop Laboratorium, Nebulizer Compressor, Nebulizer Ultrasonic, Oksigen
Concentrator, Otoscope, Oven, pH Meter, Phaco Emulsifikasi, Phototherapy, Platelet Agitator
Incubator, Pulse Oxymeter, Resusitator Paru dan Neopuff, Rotator, Sphygmomanometer, Spirometer,
Sterilisator, Suction Pump, Syringe Pump, Thermohygrometer.

**Two likely mislabeled source files, flagged for the master-catalog owners (not fixed here):**
- `LK Otoscope.docx` — content is a light-source test (Intensitas Cahaya, Color Temperature,
  Color Rendering Index), matching the Examination Lamp/Head Lamp/Lampu Operasi/Laryngoskop
  family, not an otoscope-specific test.
- `LK Phaco Emulsifikasi.docx` — content is a suction/vacuum pressure test (Naik/Turun hysteresis
  readings) structurally identical to `LK Suction Pump.docx`, not a phaco-emulsification
  ultrasound-power/flow/vacuum test.

## Verdict

**No — the current schema (`CalibrationJob` / `MeasurementResult` / `JobEvidence` as defined
today) cannot faithfully or queryably represent a real LK worksheet.** `MeasurementResult` is a
single `payloadJson`/`summaryJson` blob with no relation to `DeviceCalibrationParameter`, no
per-setting-point or per-replicate structure, and — just as importantly — the master catalog
(`DeviceCalibrationParameter`) itself has **no tolerance/threshold field at all** (confirmed by
reading both the Prisma model and `seed-device-calibration-parameters.ts`: rows only carry
`code`, `name`, `description`, `valueType`, `uomId` — never a pass/fail limit). So even a
perfectly-linked `MeasurementResult` would have nowhere in the schema to compare a measured
value against its tolerance. On top of that, the worksheets contain at least two entire
categories of data (reference/standard equipment used per job, and the weighted Telaah Teknis
score) that have no schema home whatsoever today. Additionally, the master catalog covers only
27 of the ~49 distinct device types actually present in the real worksheet set — roughly half
of what technicians calibrate in practice has no seeded parameters to link to even if the
linkage problem were solved.

## Structural Element Analysis

### 1. Header/context block
**Requirement:** cert number, device name/brand/model/serial/capacity/resolution, owner, room,
received date, calibration date, device ID; some device types add extra fields (e.g. "Channel"
for multi-channel Syringe/Infusion pumps).
**Schema today:** `Device` (`brand`, `model`, `serialNumber`, `locationText`) and `Certificate`
(`number`, `issuedAt`, `validUntil`) cover most of this. `WorkOrder`/`CalibrationJob` don't carry
a received-date or "channel" field.
**Verdict: mostly YES**, with minor gaps (per-channel identity, capacity/resolution as
structured fields rather than free text on `Device`).

### 2. Reference/standard equipment used per job
**Requirement:** every worksheet has a "Daftar Alat yang Digunakan" table listing 1–7 specific
reference instruments (brand/model/serial) used for that job — e.g. Vital Signs Simulator,
Electrical Safety Analyzer, Thermohygrometer, and for more specialized devices: Particle Counter,
Anemometer, UV Light Meter, ECG Simulator, Digital Tachometer, Climatic Chamber, etc. This
recurs in **every single one of the 50 documents** with zero exceptions.
**Schema today:** nothing. `JobEvidence` is a photo/file attachment with a caption — it cannot
represent "which specific reference standard, with which serial number, was used for this job."
**Verdict: NO — confirmed gap**, exactly as flagged in the 2-document sample. This is not an
edge case; it is a fixed, universal section of the worksheet.

### 3. Environmental conditions (before/after)
**Requirement:** temperature and humidity, each Awal/Akhir (before/after) + a device-type-
specific tolerance (25±5°C is common but 25±6°C, 21±5°C, 19-31°C, 15-30°C, and tolerance-free
wide ranges like 10-40°C all appear); input voltage L-N/L-G/N-G is present for mains-powered
devices and **absent entirely** for non-mains devices (Flow Meter, Oksigen Concentrator, pH
Meter, Sphygmomanometer, Thermohygrometer).
**Schema today:** `MeasurementResult.payloadJson` could hold two timestamped readings as
arbitrary JSON, but there's no schema-level guarantee of the Awal/Akhir shape, no tolerance
storage, and no way to query "show me all jobs where room temperature was out of tolerance"
without ad-hoc JSON parsing across every row.
**Verdict: NO as a queryable structure** — it would be an unvalidated blob.

### 4. Physical condition checklist
**Requirement:** a fixed list of binary Baik/Tidak Baik inspection items, device-type-specific
in count (3–9 items) and content (e.g. "Battery box" for Head Lamp, "System interlock gas" for
Resusitator, "Alarm dan system interlock" for pump devices, "Sekering Pengaman" for Laminar Air
Flow / Bio Safety Cabinet).
**Schema today:** no dedicated model. Would land in `MeasurementResult.payloadJson` as an
unvalidated array of `{item, result}` pairs at best.
**Verdict: NO** — qualitative, per-device-type checklist items have no home, and there's no
`DeviceCalibrationParameter`-style catalog for them (the catalog is numeric/electrical/
performance-oriented, per the seed file's `valueType` enum `NUMBER | RATIO | TEXT | BOOLEAN` —
`BOOLEAN` exists but no catalog rows use it for checklist items).

### 5. Electrical safety readings
**Requirement:** Protective Earth Resistance, Insulation Resistance, Equipment Leakage Current,
Applied Part Leakage Current — present in the large majority of worksheets, but **entirely
absent** in 4 of the 50 (Flow Meter, Oksigen Concentrator, pH Meter, Sphygmomanometer,
Thermohygrometer — 5 actually, all non-mains/mechanical/battery devices), and thresholds are
**not universal constants**: Equipment Leakage Current ranges from ≤100µA to ≤500µA (sometimes
split by protection Class I/≤500µA vs Class II/≤100µA), Applied Part Leakage from ≤50µA to
≤500µA, depending on whether the device has patient-contact applied parts.
**Schema today:** `DeviceCalibrationParameter` rows exist under the `ELECTRICAL_SAFETY`
capability (`PROTECTIVE_EARTH_RESISTANCE`, `INSULATION_RESISTANCE`,
`EQUIPMENT_LEAKAGE_CURRENT`, `APPLIED_PART_LEAKAGE_CURRENT`) — the parameter *names* correctly
match the worksheets — but **the rows carry no threshold value**, so the schema cannot express
"≤500µA vs ≤100µA depending on class." See the dedicated alignment section below.
**Verdict: partially YES for naming, NO for thresholds and for the "some devices have none"
conditionality** — nothing marks a `DeviceCalibrationParameter` set as optional per device type
in a structured way; it's simply present or absent in the seed data per `deviceTypeCode`, which
happens to match, but there's no explicit "no electrical safety applicable" flag — it's implicit
from row absence, which is fragile (a missing seed row is indistinguishable from an oversight).

### 6. Performance measurements — the core stress test
**Requirement:** this is where the real diversity lives, far beyond what the 2-sample review
suggested. Across the 50 documents, the following genuinely distinct shapes were observed:
- **Setting-point × replicate grid** (the "expected" shape): N setting points × M trials
  (M is *not* fixed — 3, 5, 6, and 9 all appear), one tolerance per parameter. E.g. Bed Side
  Monitor's Heart Rate (4 points × 5 trials, ±5 bpm).
- **Multiple independent performance sub-tables per device type**: Humidifier (2), Infant
  Warmer (3), Infusion Pump (2), Laminar Air Flow (5: particle count, airflow velocity by
  position, lux, sound, UV), Autoclave (3), Dental X-Ray (6), Electrocardiograph (5), Suction
  Pump (3), Sphygmomanometer (3).
- **Time-series × sensor-channel grid, externally attached**: cold-storage/chamber devices
  (Blood Bank Refrigerator, Cold Chain/Vaccine Refrigerator, Medical Freezer, Medical
  Refrigerator, Oven, Sterilisator, Platelet Agitator Incubator, Centrifuge Refrigerator's temp
  section) all share one template: 30 numbered "Data ke" rows × 9 sensor-channel columns (T1–T9),
  where the standard reading is explicitly **not entered in the LK at all** — it's captured on a
  separate 12-channel data-logger printout and physically attached behind the worksheet.
- **Position/repetition grids**: Infant Warmer's temperature-uniformity table is 5 named sensor
  positions (T1–T5) × 5 repeated measurements at one setting — a 2D grid, not a simple trial list.
- **Free-form, dynamically-named parameter lists with per-row custom tolerance**: Hematology
  Analyzer (9 parameters, tolerances like ±3SD, ±25%) and Auto Chemistry Analyzer (~26 clinical
  chemistry analytes, tolerances mixing %, absolute units, and ±SD) both explicitly instruct the
  technician to substitute parameter names/tolerances from the reference control's certificate
  if the standard list doesn't match — i.e., the parameter set is not fixed at all for these
  device types.
- **Qualitative/observational pass-fail tests with no numeric value**: Bio Safety Cabinet's smoke
  pattern and HEPA/ULPA filter leak tests ("turbulence detected or not," "enters compartment or
  not") — procedure text plus a binary outcome, not a measured number.
- **Derived/calculated values referencing other cells**: Mikroskop Laboratorium's magnification
  ratio (Objektif 4x reading ÷ Objektif 10x reading).
- **Paired reference-vs-UUT tables**: Thermohygrometer measures the reference instrument's
  reading and the UUT's reading in two parallel tables at the same nominal setting, rather than
  putting both in one row.
- **Hysteresis / directional sub-readings**: Sphygmomanometer, Suction Pump, and (mislabeled)
  Phaco Emulsifikasi all split each trial into Naik (rising) / Turun (falling) sub-values;
  Thermohygrometer's humidity test sweeps a full Naik/Turun direction across settings, not just
  per-trial.
- **Non-monotonic / qualitative setting points**: SpO2 setting lists appear out of numeric order
  (98, 93, 92, 85, 90, 70, 88); Rotator/Centrifuge use qualitative labels (Min/Med/Max) instead
  of numeric settings.
- **Single-value range/classification checks with no replicate**: Suction Pump's "Maximum
  Vacuum" classifies a single reading into Low/Medium/High bands; Resusitator's max-pressure
  check is a single reading against a range.
- **Fixed covariates held constant while one parameter varies**: EST (Electro Accupunture) holds
  two of {frequency, intensity, pulse duration} fixed while sweeping the third, across 3
  sub-tables.
- **Static reference/help content embedded in a table**: Suction Pump's pressure-unit conversion
  table (17 units) is documentation, not data, and should not be treated as measurement schema
  at all.

**Schema today:** `MeasurementResult.payloadJson`/`summaryJson` is untyped `Json`. It could
technically hold any of the above as an ad-hoc structure, but:
- There is no FK from a measurement to the `DeviceCalibrationParameter` it fulfills.
- There is no schema-level distinction between the ~10 structurally different shapes above —
  every consumer (UI, report generator, QA reviewer, analytics) would need bespoke, undocumented
  parsing logic per device type, with no compile-time or DB-level guarantee the JSON matches
  what that device type expects.
- Queries like "show every NIBP Systole reading across all jobs that fell outside tolerance" are
  impossible without deserializing and inspecting every row's blob — no index, no query
  optimizer support.
- The tolerance itself is never stored anywhere in the schema (see Verdict), so even a
  structured `payloadJson` couldn't self-validate a pass/fail without external knowledge.

**Verdict: NO.** This is the confirmed core gap, and the full 50-document sweep shows it is
*more* severe than the 2-sample review suggested — not one flexible shape needs support, but at
least ten materially different ones, several of which don't even fit a "parameter × setting ×
replicate" mental model (derived values, paired reference/UUT tables, free-form parameter lists,
externally-attached data-logger readings).

### 7. Technical review / scoring ("Telaah Teknis")
**Requirement:** a weighted point breakdown feeding a pass/fail conclusion. The dominant pattern
is Kondisi Alat=10 / Keselamatan Listrik=40 / Kinerja Peralatan=50 (100 total), but this is not
universal: Blanket Warmer and Blood Pressure Monitor use 10/40/60; devices with no electrical
safety section drop that line entirely (Flow Meter 20/80; Oksigen Concentrator 20/80;
Sphygmomanometer 10/90; Thermohygrometer 10/90); and `LK Kelistrikan` (a generic
electrical-installation-only worksheet, not a specific device) replaces the entire numeric
scoring mechanism with a 5-tier categorical risk classification ("Aman tidak terjadi
penyimpangan" / … / "Peralatan tidak memenuhi — disarankan modifikasi") instead of a
Baik/Tidak Baik + point total.
**Schema today:** `QualityReview` has `decision` (`APPROVE`/`REJECT`), `status`, and free-text
`notes` — no structured score-category breakdown, no variable weighting, and no support for an
alternate categorical conclusion type.
**Verdict: NO** — `QualityReview` can record the final decision but cannot represent *how* that
decision was reached (the category scores), and cannot represent the one worksheet variant that
uses an entirely different (categorical, not point-weighted) conclusion model.

### 8. Sign-off
**Requirement:** "Petugas Kalibrasi" (calibrating technician) and "Entri data oleh" (data entry
person) — present identically in all 50 documents.
**Schema today:** `WorkOrderAssignment` (with `AssignmentRole` LEAD/ASSIST) could map to
"Petugas Kalibrasi" if the LEAD assignee is treated as the signing technician, and
`CalibrationJob`/`MeasurementResult` timestamps (`createdAt`) give an implicit actor via
whichever `*ByUserId` pattern exists elsewhere in the schema — but neither `CalibrationJob` nor
`MeasurementResult` has an explicit `technicianUserId` or `dataEntryUserId` field observed in the
model definitions read for this investigation.
**Verdict: PARTIALLY** — role assignment exists at the `WorkOrder` level, but there's no direct
field capturing "who signed as data entry" independent of "who was assigned to the job," which
the worksheet treats as two potentially-different people.

## Electrical Safety Parameter Alignment Check

Read directly from `packages/db/prisma/seed-device-calibration-parameters.ts`:

- The four electrical-safety parameter **names** (`PROTECTIVE_EARTH_RESISTANCE`,
  `INSULATION_RESISTANCE`, `EQUIPMENT_LEAKAGE_CURRENT`, `APPLIED_PART_LEAKAGE_CURRENT`, grouped
  under capability `ELECTRICAL_SAFETY`) match the real worksheets' four-row electrical safety
  table exactly, everywhere it appears.
- Confirmed absence is consistent: `OXYGEN_CONCENTRATORS` and `SPHYGMOMANOMETERS` seed rows
  contain **no** `ELECTRICAL_SAFETY` or `INPUT_VOLTAGE` entries at all — matching the real LK
  worksheets for Oksigen Concentrator and Sphygmomanometer, which genuinely omit that whole
  section. Good alignment on presence/absence for the two device types checked.
- **Mismatch: no threshold field exists anywhere.** `ParameterSeedRow` (and the
  `DeviceCalibrationParameter` model it populates) carries only `deviceTypeCode`,
  `capabilityItemCode`, `code`, `name`, `uomCode`/`uomId`, `valueType` — never a numeric limit.
  The real worksheets show these thresholds are not fixed constants (Equipment Leakage Current
  alone varies ≤100µA / ≤500µA / class-split ≤500µA(I)/≤100µA(II) depending on device type), so
  this isn't a case of "the value happens to be the same everywhere and got hardcoded
  elsewhere" — the catalog has nowhere to put a device-type-specific threshold even in
  principle.
- **Coverage gap:** the seed file only defines parameters for 27 `deviceTypeCode`s
  (`BABY_INCUBATOR`, `BED_SIDE_MONITOR`, `BLOOD_BANK_REFRIGERATORS`, `BLOOD_PRESSURE_MONITOR`,
  `BREAST_PUMPS`, `COALD_CHAIN`, `ELECTRIC_BEDS`, `ELECTROCARDIOGRAPHS`, `FLOW_METER`,
  `HUMIDIFIER`, `INFANT_WARMER`, `KULKAS_VAKSIN`, `MEDICAL_FREEZER`, `MEDICAL_REFRIGERATOR`,
  `NEBULIZER_COMPRESSOR`, `OVEN`, `OXYGEN_CONCENTRATORS`, `OXYMETER_MONITOR`, `PATIENT_MONITOR`,
  `PULSE_OXIMETERS`, `RADIANT_WARMER`, `RESUSCITATORS_CARDIAC`, `RESUSCITATORS_PULMONARY`,
  `SPHYGMOMANOMETERS`, `STERILLIZER`, `ULTRASONIC_NEBULIZERS`, `VENTILATOR`). Roughly half of
  the ~49 distinct device types actually present in the real worksheet set — Audiometer, Auto
  Chemistry Analyzer, Autoclave, Bio Safety Cabinet, Centrifuge/Centrifuge Refrigerator, CPAP,
  Dental Unit, Dental X-Ray, Electro Accupunture, Examination Lamp, Fetal Doppler, Head Lamp
  Medik, Hematologi Analyzer, Infusion Pump, Laminar Air Flow, Lampu Operasi, Laryngoskop,
  Mikroskop Laboratorium, pH Meter, Phototherapy, Platelet Agitator Incubator, Rotator,
  Spirometer, Suction Pump, Syringe Pump — have **no seeded catalog rows at all** yet. This is
  expected for a 242-row "confirmed so far" catalog rather than a completeness bug, but it means
  any linkage design must anticipate the catalog growing to roughly double its current size
  before it covers everything technicians actually calibrate today.

## Suggested Directions (not implemented, for future design discussion)

These are grounded in the shapes actually observed above, offered as options with trade-offs —
not a schema to implement now.

**A. Add a structured `MeasurementEntry` (or similarly-named) model between `CalibrationJob`
and `DeviceCalibrationParameter`,** replacing/supplementing today's blob:
`calibrationJobId`, `deviceCalibrationParameterId` (FK — closes the long-flagged linkage gap),
`settingLabel` (string, to hold "36°C" or "Max" or "T3" or "Naik" alike — deliberately loose
rather than forcing numeric-only, since Min/Med/Max and channel labels both appear),
`replicateIndex` (int, nullable), `measuredValue` (float or Json for RATIO/derived cases),
`isWithinTolerance` (bool, computed at write time). Trade-off: this cleanly supports the
"setting × replicate" majority case and makes cross-job queries possible, but the free-form
analyte lists (Hematology/Chemistry) and derived/ratio values (Mikroskop) would still need a
looser `measuredValue: Json` escape hatch, partially undermining the queryability win for those
specific device types.

**B. Add a `tolerance`/`limitJson` field directly on `DeviceCalibrationParameter`** (or a
sibling `DeviceCalibrationParameterLimit` model if a parameter can have more than one limit
shape, e.g. class-dependent leakage current). This is the smallest change that closes the
"schema can't even record the pass/fail threshold" gap identified in the Electrical Safety
Alignment check, independent of the larger `MeasurementEntry` question. Trade-off: a single
scalar tolerance field can't express "≤500µA for Class I, ≤100µA for Class II" cleanly — that
needs either a `Json` field or a second FK dimension (protection class), adding complexity for a
relatively small number of parameters.

**C. Add a `JobReferenceEquipmentUsed` model** keyed to `CalibrationJob` with a free-text or
FK'd equipment name, brand, model, and serial — closing the confirmed universal gap (every one
of 50 worksheets has this section). Low ambiguity, low risk; this is the most straightforward of
the three directions since the requirement (name/brand/model/serial per job) doesn't vary in
shape across device types the way performance measurements do.

**D. Extend `QualityReview` with a structured score-category breakdown** (either a fixed set of
nullable point columns if the three categories stay stable, or a small child model
`QualityReviewScoreLine` if the category set/count needs to vary — needed regardless, since
Blanket Warmer/Blood Pressure Monitor use 10/40/60 and several device types drop the electrical-
safety line to 20/80 or 10/90). The `LK Kelistrikan` categorical-conclusion outlier would need
either a separate `conclusionType` discriminator on `QualityReview` or to be modeled as its own
non-device job type outside `CalibrationJob` entirely — worth a follow-up conversation, since it
may not belong in this schema's device-calibration flow at all.

None of these proposals touch `DeviceCalibrationParameter`'s role as the master "what to
measure" catalog — direction A explicitly keeps it as a lookup FK target rather than folding
measured values into it, consistent with the earlier rejection of collapsing master definitions
and instance values together.

## Relation to Existing Open Architecture Question

This sweep **confirms and substantially sharpens** the gap already logged in
`HANDOFF_Context_For_ChatGPT.md` Section 9 ("`MeasurementResult` ↔ `DeviceCalibrationParameter`
linkage is undefined"). The prior note framed this as primarily a missing-foreign-key problem.
The full 50-document review shows it's broader than a single FK: even with the FK added, (1)
there is nowhere in the schema to store the tolerance the measurement is checked against, (2)
the "shape" of a performance measurement is not one thing but at least ten distinct patterns
(setting×replicate, time-series×channel, position×repetition, free-form parameter lists,
derived/ratio values, paired reference/UUT, hysteresis direction, qualitative labels,
single-value range checks, held-constant covariates), and (3) two entirely separate structural
elements — per-job reference equipment, and the Telaah Teknis score breakdown — have no schema
representation at all, independent of the linkage question. The `MeasurementResult` ↔
`DeviceCalibrationParameter` FK is still the right first fix and remains necessary, but it is
not sufficient on its own to make the schema capable of representing what technicians actually
record in the field.
