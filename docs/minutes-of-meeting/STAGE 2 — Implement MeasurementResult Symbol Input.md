# STAGE 2 — Implement MeasurementResult Symbol Support

# MedCal / MoM 14-09-2026 — Item #5

#

# APPROVED SCOPE:

# Minimal frontend Tech-PWA implementation.

#

# This task has been independently reviewed against the repository.

# The independent review found that changing input type alone is NOT enough.

# The implementation must support symbol input end-to-end while preserving

# all existing numeric behavior.

==================================================
IMPORTANT — IMPLEMENTATION AUTHORIZATION
==================================================

You are authorized to implement this Stage 2 task.

Keep the implementation MINIMAL and LOCALIZED.

Do not expand the scope.

If you discover an architectural blocker or believe a schema/API redesign is
required, STOP and report the blocker instead of implementing the larger change.

==================================================
TECHNICAL DECISION
==================================================

MeasurementResult already supports:

- measuredValue Decimal?
- measuredText String?

Backend validation and persistence already support measuredText.

Therefore:

DO NOT modify Prisma schema.
DO NOT create a migration.
DO NOT add calibrationValueType.
DO NOT add SYMBOL to CalibrationValueType.
DO NOT redesign MeasurementResult.

Symbol support is PER READING.

For a numeric reading:

    measuredValue = numeric value
    measuredText = null

For a symbol/non-numeric reading:

    measuredValue = null
    measuredText = symbol/text

The two fields must not retain stale values simultaneously.

==================================================
CURRENT PROBLEM
==================================================

Tech-PWA measurement entry currently assumes every reading is numeric.

The current measurement inputs use:

    type="number"

and the current frontend validation only accepts numeric values.

The existing global Symbol Picker is already mounted in tech-pwa, but it
cannot normally insert into `type="number"` inputs.

Changing only the input type is NOT sufficient.

The implementation must also fix the frontend routing, validation,
hydrate/edit behavior, and entry-status behavior necessary for symbol
support.

==================================================
FILES / AREAS TO INSPECT
==================================================

Primary Pattern A:

    apps/tech-pwa/src/app/jobs/[id]/measurements/[parameterId]/page.tsx

Primary Pattern B:

    apps/tech-pwa/src/app/jobs/[id]/measurements/measurement-grid.tsx

Shared measurement helpers/types:

    apps/tech-pwa/src/lib/calibration/measurement.ts

Relevant tests:

    apps/tech-pwa/src/lib/calibration/measurement.test.ts

Inspect other directly-related tests if they already exist.

Do not modify unrelated files.

==================================================
REQUIRED IMPLEMENTATION
==================================================

## 1. Measurement input

For BOTH Pattern A and Pattern B:

Change the measurement input from:

    type="number"

to:

    type="text"

while retaining:

    inputMode="decimal"

Preserve existing styling and UX as much as possible.

The existing symbol picker should become compatible automatically.

DO NOT modify the symbol picker itself.

---

## 2. Preserve numeric validation

Do NOT remove numeric validation.

Numeric readings must continue to obey the existing rules, including:

- numeric shape
- decimal precision
- existing validation errors
- existing behavior for invalid numeric input

But non-numeric symbol input must also be allowed.

The intended rule is:

    valid numeric input
        OR
    non-empty symbol/text input

Do not weaken validation for numeric values merely to permit symbols.

Use the existing validation helpers where possible.

---

## 3. Route numeric vs symbol reading

When constructing create/update payloads:

Numeric input:

    {
      measuredValue: <numeric value>,
      measuredText: null
    }

Non-numeric input:

    {
      measuredValue: null,
      measuredText: <trimmed text>
    }

Do not send a symbol through `measuredValue`.

Do not create a new API endpoint.

Do not create a new persistence mechanism.

Reuse the existing backend API and measuredText support.

---

## 4. Shared wire types

Update the existing Tech-PWA measurement wire types if necessary:

    MeasurementBatchItem
    MeasurementUpdateInput

They must be able to carry the existing `measuredText` field.

Keep the change minimal.

Do not redesign the API contract.

---

## 5. Draft hydrate / edit mode

Existing numeric readings must continue to hydrate exactly as before.

For a symbol reading, hydrate from:

    measuredValue ?? measuredText ?? ""

This means:

- numeric saved reading → numeric value displayed
- symbol saved reading → symbol displayed
- no reading → empty field

Ensure switching between numeric and symbol does not leave stale sibling
values.

---

## 6. Entry status / completion state

Update the existing entry-status logic so that a reading is considered
filled when either:

    measuredValue != null

OR:

    measuredText is non-empty

Do not change unrelated status rules.

This applies to both Pattern A and Pattern B.

---

## 7. Dirty comparison / draft behavior

Inspect the existing dirty-state / draft comparison logic.

Ensure symbol readings do not appear perpetually dirty simply because
measuredValue is null.

Use the smallest change necessary.

---

## 8. Tolerance / verdict

DO NOT modify tolerance calculation.

DO NOT modify verdict calculation.

The existing behavior must remain:

Numeric:

    measuredValue != null
        → existing tolerance calculation

Symbol:

    measuredValue = null
    measuredText != null
        → isWithinTolerance remains null
        → existing human-review / "Perlu telaah" behavior

Do not teach the tolerance engine to interpret symbols.

---

## 9. Symbol picker

DO NOT modify:

    packages/ui/src/symbol-picker/*

DO NOT modify its compatibility logic.

Only make the measurement inputs compatible with the existing picker.

==================================================
CRITICAL SCOPE BOUNDARY
==================================================

DO NOT touch:

- Prisma schema
- Prisma migrations
- CalibrationValueType enum
- DeviceCalibrationParameter.valueType
- MeasurementResult schema
- measurement tolerance engine
- verdict/pass-fail engine
- CalibrationJob lifecycle
- QA workflow
- Reference Equipment Approval
- F.MU.08 / KAL
- LK PDF generation
- lk-download.service.ts
- Certificate
- Billing
- Customer Portal
- unrelated MoM items

There is a known separate LK PDF issue where measuredText can be omitted
for NUMBER parameters.

DO NOT fix that issue in this task.

It will be handled as a separate task.

==================================================
CHECKPOINT 1 — BEFORE EDITING
==================================================

Before making any changes:

1. Inspect both Pattern A and Pattern B.
2. Inspect shared measurement types/helpers.
3. Confirm the exact current validation and payload flow.
4. Confirm the exact files you intend to modify.

Then STOP and report:

CHECKPOINT 1 — READY TO IMPLEMENT

Include:

- files to modify
- why each file needs modification
- exact behavior change
- confirmation that no schema/backend architecture change is required

WAIT for explicit human approval.

Do not edit before approval.

==================================================
CHECKPOINT 2 — AFTER IMPLEMENTATION
==================================================

After approval, implement ONLY the approved changes.

Then STOP before unrelated work.

Report:

CHECKPOINT 2 — IMPLEMENTATION COMPLETE

Include:

1. Changed files
2. Summary of each change
3. Numeric behavior preserved
4. Symbol behavior added
5. Persistence routing
6. Hydrate/edit behavior
7. Entry-status behavior
8. Confirmation that schema/migration were untouched
9. Confirmation that tolerance/verdict were untouched
10. Confirmation that LK PDF was untouched
11. Concise diff summary

WAIT for review before proceeding to broader testing if required.

==================================================
TESTING
==================================================

After approval to test, run the smallest relevant test set.

At minimum verify:

### Numeric

- integer
- decimal
- existing invalid numeric value
- decimal precision validation

### Symbol

- symbol entered through existing Symbol Picker
- symbol accepted by the input
- Save is enabled for a valid non-empty symbol
- payload uses measuredText
- measuredValue is null

### Numeric persistence

- payload uses measuredValue
- measuredText is null

### Edit/reload

- saved numeric value reappears correctly
- saved symbol reappears correctly

### Entry status

- numeric reading counts as filled
- symbol reading counts as filled
- empty input does not count as filled

### Tolerance/verdict regression

- numeric tolerance behavior unchanged
- symbol produces existing null/human-review path

### Both patterns

Test/verify both:

- Pattern A
- Pattern B

==================================================
TEST OUTPUT
==================================================

Return:

# Test Results

## Automated tests

- command
- result
- failures, if any

## Behavior verification

- Pattern A numeric
- Pattern A symbol
- Pattern B numeric
- Pattern B symbol
- persistence
- edit/reload
- entry status
- tolerance/verdict

## Changed files

List every changed file.

## Scope verification

Explicitly confirm:

- [ ] No Prisma schema change
- [ ] No migration
- [ ] No `SYMBOL` valueType
- [ ] No `calibrationValueType`
- [ ] No tolerance change
- [ ] No verdict change
- [ ] No Symbol Picker change
- [ ] No LK PDF change
- [ ] No unrelated workflow change

## Final assessment

State whether Stage B symbol input is complete.

If anything cannot be verified, clearly state it.

==================================================
STOP RULE
==================================================

If at any point you discover that the existing backend/API cannot support
the required behavior without a schema or architectural change:

STOP.

Do not invent a workaround.
Do not implement the larger change.

Return the blocker to the human for approval.

FINAL PRINCIPLE:

MINIMAL CHANGE.
PRESERVE EXISTING NUMERIC BEHAVIOR.
REUSE EXISTING measuredText SUPPORT.
NO ARCHITECTURAL REDESIGN.
NO SCOPE CREEP.
