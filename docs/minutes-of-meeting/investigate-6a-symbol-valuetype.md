# INVESTIGATE — MoM #6a: Support "Symbol" Readings in MeasurementResult

## Mode

READ-ONLY ANALYSIS + PROPOSE ONLY. Do NOT edit, create, delete, or modify any file
(schema, code, migration) — with ONE exception: you may write a single new report file at
the path specified in "Output" below. Do NOT implement any schema or UI change. This is
deliberately being resolved BEFORE Stage B (the measurement-entry UI build) starts,
because the outcome directly shapes how that UI needs to be structured.

This file supersedes any earlier draft/addendum on this same topic — treat this as the
complete, single source of truth for the task; there is no other version to reconcile it
with.

## Background — what "symbol" actually means (confirmed, do not re-derive)

MoM (demo 2026-09-14), item #6a raised: some parameters need a value entered as a
"symbol," not a number. This was initially ambiguous and has now been clarified directly
by the product owner:

**"Symbol" refers to what the device UNDER CALIBRATION shows on its own display at the
moment the technician takes a reading** — e.g. an error indicator, overflow marker, or
other non-numeric symbol the device itself outputs, instead of a normal numeric reading.
The technician needs to record that reading exactly as shown, not force it into a number.

This is explicitly about **`MeasurementResult` (the technician's recorded reading)**, NOT
about `DeviceCalibrationParameter` (the master catalog's tolerance/spec definition) —
`DeviceCalibrationParameter`'s own tolerance/unit fields stay fully numeric; nothing about
how a master parameter is *defined* changes. What's in question is how a technician's
*actual reading* gets recorded when the instrument shows a symbol instead of a number.

There is also an existing, already-built **symbol picker UI component** somewhere in the
codebase (a "Search symbol..." input with QUICK/COMMON/MATHEMATICAL/UNITS-MEASUREMENT
categories — ±, °, μ, Ω, ×, ÷, ≤, ≥, ≠, ≈, √, ∞, Δ, Σ, σ, °C, °F — triggered by
`Ctrl+Shift+M` or a floating button). Find it and determine whether it's reusable for
this purpose, or was built for an unrelated context — do not assume either way.

## Step 0 — Establish current state

1. **`MeasurementResult` raw value storage**: read the live `schema.prisma` definition.
   What is the actual column type for the recorded/raw measurement value today (e.g.
   `Decimal`, `Float`, `String`)? This is the central constraint — cite it exactly.
2. **`DeviceCalibrationParameter.calibrationValueType`**: read its live definition too
   (enum/type, current allowed values) and find the actual distribution of values used
   across the 242-row catalog. This is relevant context (it's what the MoM discussion
   referenced) but is NOT the field being changed — confirm this by checking whether
   anything about a parameter's *master definition* would need to differ for
   symbol-capable readings, or whether this is purely a `MeasurementResult`-level concern
   regardless of the parameter's catalog classification.
3. Find every place in the codebase that currently branches on `calibrationValueType` or
   on the `MeasurementResult` raw-value column (entry UI, Zod/validation, the tolerance
   engine, PDF/certificate rendering) — cite exact files/functions. For each entry-UI
   location found, state explicitly which app it's in (`tech-pwa` vs `portal` vs
   elsewhere) — the real-world use case is a technician recording a reading in tech-pwa
   in the field, so it matters directly whether any of this logic already lives there or
   only in Portal (e.g. admin-side catalog management).
4. Find the symbol-picker UI component referenced above: exact file/component name, and
   every current call site (what field/form already uses it today). State explicitly
   whether any call site is in `tech-pwa`, or whether it currently only exists in
   `portal`/elsewhere — if it's Portal-only today, note that as a gap: the component
   existing somewhere in the codebase is not the same as it being available to a
   technician recording a measurement in the field.

## Step 1 — Determine scope: per-parameter classification, or per-reading exception?

This is the key open question and must be answered with evidence, not assumed:

- **Option A — per-parameter**: some `DeviceCalibrationParameter` rows are inherently
  "symbol-capable" (known in advance, e.g. a parameter where the device's display
  commonly shows a non-numeric state), so `calibrationValueType` (or a similar
  classification) drives which entry mode the UI shows for that parameter.
- **Option B — per-reading**: ANY parameter's individual reading could occasionally come
  back as a symbol regardless of its normal numeric nature (e.g. the instrument
  malfunctions, shows overflow, or is in an unusual state for that one attempt), so this
  needs to be handled as a per-`MeasurementResult`-row exception, independent of the
  parameter's own classification.

Investigate real evidence for which of these (or both) actually reflects field reality:
check the real filled Excel job files corpus already used as ground truth in prior
MeasurementResult work (referenced in project notes as the 66-file corpus used for the
2026-09-08 ground-truth cross-check, superseding the earlier blank-template corpus) for
any recorded value that is a symbol/non-numeric marker rather than a number. Cite
concrete examples (device type, parameter, what was actually recorded) if found. If no
such evidence exists in that corpus, say so explicitly — this may mean the case is real
but simply wasn't captured in the sampled ground-truth files, not that it doesn't happen.

## Step 2 — Propose options (do not implement)

Based on Step 0 and Step 1, propose 1-3 concrete options for how `MeasurementResult`
could support a symbol reading, e.g.:
- A nullable "symbol/exception value" column alongside the existing numeric raw-value
  column (numeric column stays NULL when a symbol was recorded instead).
- Widening the raw-value storage itself to accommodate both, with a discriminator.
- Reusing Option A/B's answer from Step 1 to decide whether this needs a
  `DeviceCalibrationParameter`-level flag at all, or is purely row-level on
  `MeasurementResult`.

For each option, address explicitly (do not skip):
- How it interacts with the two locked project rules: pass/fail is computed from raw
  numeric values only (never rounded/display values), and `isWithinTolerance` is NULL
  when tolerance can't be computed from the raw value — a symbol reading is very likely
  exactly this "NULL, not auto-fail" case; confirm or refute that explicitly.
- Whether the existing symbol-picker UI component (Step 0.4) is directly reusable for
  entering this in `tech-pwa` specifically, or needs adaptation (or a tech-pwa-specific
  build, if it currently only exists in Portal) — this must be answered in terms of the
  technician's actual field-entry flow, not just "the component exists in the codebase."
- Size, risk, and whether it's blocking for Stage B or can be deferred (can Stage B's UI
  be built in a way that's easy to extend later without rework, or must this be decided
  first).

Note: this task (Step 2) proposes options only — it does NOT design or implement the
actual tech-pwa entry interaction. If a chosen option requires a tech-pwa-specific build
(e.g. the symbol picker isn't there yet), that becomes part of the Stage B build itself
(or its own Stage 2 task) once the option is approved — not something to build here.

## Output

Write a single report to:
`D:\medcal\docs\claude\plans\Calibration-management\investigation-6a-symbol-valuetype.md`

Structure:

```markdown
# Investigation: MoM #6a — Symbol Readings in MeasurementResult

## Summary
[One paragraph: current storage constraint, and per-parameter vs per-reading finding]

## Current State (Step 0)
[MeasurementResult raw-value column type, calibrationValueType definition/distribution,
current branch points, symbol-picker component location and existing usage]

## Per-Parameter vs Per-Reading (Step 1)
[Evidence from the real filled-Excel corpus, or explicit statement that none was found]

## Proposed Options (Step 2)
[1-3 options, not implemented, each addressing pass/fail + isWithinTolerance interaction,
symbol-picker reuse, size/risk]

## Recommendation: Blocking for Stage B or Not
[Whether this must be resolved before Stage B starts, with reasoning]
```

Do not modify any other file. Confirm in your final chat message that no schema/code
changes were made — this was analysis only.
