# INVESTIGATE — Extend Device Taxonomy to Full technician-docs.zip Coverage

## Mode
READ-ONLY ANALYSIS ONLY. Do NOT edit, create, delete, or modify any schema, seed script,
migration, or code file — with ONE exception: you may write a single new report file at the
path specified in "Output" below. Do NOT run migrations. Do NOT seed any data. This task is
diagnostic/advisory only — a separate task will implement whatever this investigation
recommends, informed by your findings here.

## Background — what already exists

The following are already seeded and confirmed working (do not re-derive from scratch, read
the live data to confirm current state, then use it as your baseline):
- `DeviceCategory`: 9 rows (Patient Monitoring, Respiratory & Oxygen, Neonatal & Infant Care,
  Resuscitation, Suction & Fluid Management, Sterilization, Temperature Therapy, Cold Chain &
  Storage, Patient Care).
- `DeviceType`: 35 rows (the official Kemenkes-recognized device types), each FK'd to a
  `DeviceCategory`.
- `DeviceCapability` / `DeviceCapabilityItem`: 21 capabilities / 66 items — a global, reusable
  catalog of measurement categories (e.g. `NIBP` → `Systolic Pressure`/`Diastolic Pressure`/
  `Mean Arterial Pressure`; `ELECTRICAL_SAFETY` → 4 standard items), NOT tied to any specific
  DeviceType.
- `DeviceCalibrationParameter`: 242 rows, covering 27 of the 35 official DeviceTypes, each
  with `toleranceMin`/`toleranceMax`/`toleranceNote` fully backfilled from real source
  documents as of the most recent work.

Source documents: `docs/technician-docs/` (50 `.docx` LK worksheets — the primary,
authoritative source going forward) and, as a secondary/fallback source only,
`docs/legal_n_competency/Penilaian Kemampuan.zip` (an older 30-document set). **Known
discrepancy already found**: `docs/technician-docs/` has NO Ventilator LK document, even
though the older `Penilaian Kemampuan.zip` does — Ventilator's `DeviceCalibrationParameter`
rows were backfilled from the older source as a documented exception. This means the two
sources are NOT a clean superset/subset of each other — do not assume `technician-docs.zip`
fully contains everything the older set has, or vice versa; verify directly.

The 50 documents in `technician-docs/` cover 27 already-modeled device types PLUS ~22 device
types with no `DeviceType`/`DeviceCategory`/`DeviceCalibrationParameter` representation yet:
Audiometer, Auto Chemistry Analyzer, Autoclave, Bio Safety Cabinet, Centrifuge, Centrifuge
Refrigerator, CPAP, Dental Unit, Dental X-Ray, Electro Accupunture (EST), Examination Lamp,
Fetal Doppler, Head Lamp Medik, Hematologi Analyzer, Infusion Pump, Laminar Air Flow, Lampu
Operasi, Laryngoskop, Mikroskop Laboratorium, pH Meter, Phototherapy, Platelet Agitator
Incubator, Rotator, Spirometer, Suction Pump, Syringe Pump. (Verify this list against what you
actually find in `docs/technician-docs/` — it may be slightly off, correct it if so.)

Two files were previously flagged as possibly mislabeled and NOT yet confirmed: `LK
Otoscope.docx` (content appears to be a light-source test, matching the Examination Lamp/Head
Lamp/Lampu Operasi/Laryngoskop family, not otoscope-specific) and `LK Phaco Emulsifikasi.docx`
(content appears to be a suction/vacuum test identical to `LK Suction Pump.docx`, not
phaco-emulsification-specific). Keep this in mind during your analysis below — don't treat
these two device names at face value without re-checking their actual document content.

## Task A — For each of the ~22 new device types, determine capability reuse vs. new capability needed

For each new device type, read its actual LK document in `docs/technician-docs/` in full
(tables and text, same discipline as prior investigations — don't skim) and determine:

1. Which of the existing 21 `DeviceCapability` entries (and their `DeviceCapabilityItem`
   children) genuinely apply, based on what the document actually measures — not by guessing
   from the device name. For example, don't assume "Infusion Pump" needs a new capability
   without checking whether `INFUSION_FLOW` (which already exists, seeded from Infusion/
   Syringe Pump LK content in the original 30-document work) already covers it.
2. Which measurements in the document have NO existing capability/item that fits, and
   therefore need a NEW `DeviceCapability` (and its items) — propose a name/code and item list
   for each, grounded in the actual document content (parameter names, not invented ones).
3. Note any device type whose measurements are so unstructured/free-form that they may not
   fit the existing capability-catalog model well at all (the earlier investigation already
   flagged this risk for Hematology/Auto Chemistry Analyzer — free-form, dynamically-named
   parameter lists where the technician substitutes from a reference certificate; check
   whether the same applies to any other new device type, e.g. Audiometer, Spirometer).

## Task B — Propose new DeviceCategory entries if needed

Check whether the 9 existing `DeviceCategory` values can reasonably home all ~22 new device
types, or whether new categories are needed (e.g. laboratory/diagnostic equipment, dental
equipment, medical lighting, audiology — but don't assume these are correct, derive the actual
grouping from what you read). For each new device type, state which existing category it fits,
or propose a new category name or grouping — grounded in the device's actual function per its
LK document, following the same reasoning style used for the original 9 categories (function-
based grouping, occasionally calibration-method-based where that was the established pattern).

## Task C — Cross-check the 27 already-covered device types between the two sources

For every one of the 27 device types that already has `DeviceCalibrationParameter` rows,
check whether `docs/technician-docs/` has a corresponding LK document, and if so, whether its
content (tolerances, parameter list, structure) MATCHES what's already seeded (which was
originally sourced from the older 30-document set) or differs in any way. Specifically:

1. Confirm which of the 27 have a document in `technician-docs/` at all (the Ventilator gap is
   already known — check if there are any OTHER device types similarly missing).
2. For device types that DO have a document in both sources, spot-check at least 5-8 of them
   (prioritize ones not already deeply verified in prior work) for discrepancies in tolerance
   values, parameter names, or structure between the two sources. Report any found — even
   small wording differences are worth noting, since they could indicate the LK was revised
   between when the two zips were created.
3. If you find discrepancies, do NOT decide which source is "correct" — just report them
   factually with evidence (quote both versions) for a human to reconcile later.

## Task D — Resolve the two flagged mislabeled files

Re-open `LK Otoscope.docx` and `LK Phaco Emulsifikasi.docx` in full and confirm or refute the
earlier flag. State clearly: does the content match the filename's device type, or does it
appear to belong to a different device type's test? If it's mismatched, note which device
type(s) the content actually appears to belong to, and whether that device type already has
proper LK coverage elsewhere (e.g. if Otoscope's content really belongs to Examination Lamp,
does Examination Lamp already have a separate, correctly-labeled LK document too, making this
file redundant/erroneous, or is this the ONLY document for that content?).

## Output

Write a single report to:
`D:\medcal\docs\claude\plans\Calibration-management\investigation-device-taxonomy-extension.md`

Structure:

```markdown
# Investigation: Extending Device Taxonomy to Full technician-docs.zip Coverage

## Summary
[Short paragraph: how many of the ~22 new device types can reuse existing capabilities
entirely, how many need new capabilities, how many new categories are proposed, and headline
findings from the cross-check and mislabeled-file tasks]

## Task A — Capability Reuse vs. New Capability Needed (per new device type)
[One subsection per device type: what it measures per the LK, which existing
capability/items apply (if any), what new capability/items are proposed (if any), with
evidence]

## Task B — Proposed DeviceCategory Changes
[List of new categories proposed (if any), with device types assigned to each, and reasoning]

## Task C — Cross-Check Findings (27 already-covered device types)
[Which have technician-docs coverage, which don't (beyond the known Ventilator gap), and any
discrepancies found in the spot-check, with evidence quotes]

## Task D — Mislabeled File Resolution
[Otoscope and Phaco Emulsifikasi: confirmed or refuted, with reasoning and implications]

## Recommended Next Steps (not implemented — for a future task)
[Concrete, evidence-grounded proposals: e.g. "add DeviceCategory X", "add DeviceCapability Y
with items Z1/Z2", "seed DeviceType for the ~22 new devices under these categories", etc. —
as options/proposals, not a schema to implement now]
```

Do not modify any other file. Confirm in your final chat message that no schema/code/data
changes were made — this was analysis only.
