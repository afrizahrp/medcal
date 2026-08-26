# REVISE — Replace limitKind/limitValue/limitUomId with the G1-specified design, then backfill

## Mode
IMPLEMENTATION task: schema correction + migration + data backfill. Same scope restriction as
before — only `DeviceCalibrationParameter`. Do NOT touch `Device`, `CalibrationJob`,
`MeasurementResult`, `JobEvidence`, `QualityReview`, or start any other design direction from
the investigation report.

## Why this revision is needed

Your own comparison against `Fix_G1_Tolerance_Field_DeviceCalibrationParameter.md` was
correct: the previously-implemented `limitKind` (`PLUS_MINUS`/`MAX`/`MIN`) + single
`limitValue` + `limitUomId` design does not match what was specified, and — more importantly —
has a real structural gap, not just a naming difference: for the common "nominal ± delta"
tolerance shape found throughout the LK worksheets (e.g. "Suhu 25 ± 6°C" in the environmental
conditions table, present in nearly every document), `limitKind=PLUS_MINUS` with only ONE
`limitValue` field has nowhere to store the nominal (25) alongside the delta (6) — so a
measured value could never actually be checked against this limit. It also has no way to
represent an explicit range shape ("2-8°C" appears as-is in several worksheets, not as a
±-from-nominal). This isn't a stylistic preference — the enum+single-value shape is
insufficient for data we've already confirmed exists in the source documents.

## Step 1 — Remove the incorrect fields, add the correct ones

Since no backfill was ever completed against `limitKind`/`limitValue`/`limitUomId` (confirmed:
all still null across the catalog), there is no real data to preserve — this can be a clean
replacement, not a data migration.

In `packages/db/prisma/schema.prisma`, on `DeviceCalibrationParameter`:
- REMOVE: `limitKind` (and its enum, if it's not used anywhere else), `limitValue`,
  `limitUomId` (and its relation, if any).
- ADD:
```prisma
toleranceMin  Decimal? @db.Decimal(18, 4)
toleranceMax  Decimal? @db.Decimal(18, 4)
toleranceNote String?
```

Check whether any backend (DTO/validation schema, service, controller) or frontend (form,
list column, query hook) code was already built against `limitKind`/`limitValue`/`limitUomId`
(per your own report, it sounds like some CRUD/UI scaffolding exists for it) — if so, update
that code to use `toleranceMin`/`toleranceMax`/`toleranceNote` instead, following the same
pattern used elsewhere in this model's CRUD (e.g. how `uomId` is optional and handled in the
form). Don't leave orphaned code referencing removed fields.

## Step 2 — Migration

1. Generate the migration. Suggested name:
   `replace_limit_fields_with_tolerance_fields_on_device_calibration_parameter`.
2. Review the generated SQL — expect column drops for the old fields and additions for the
   new ones, all safe since no real data exists in the old columns. If it implies anything
   else, STOP and report.
3. Confirm target is the local native Postgres dev database.
4. Run `prisma generate`.

## Step 3 — Resolve the Ventilator source-document discrepancy BEFORE backfilling

You noted `docs/technician-docs/` does not contain an "LK Ventilator Transport" document,
which would make `VENTILATOR`'s rows (including `VENT_IE_RATIO` and all other Ventilator
parameters) unresolvable from that source. Before treating this as a plain "could not
resolve" case, do this check first:

1. Confirm definitively: search `docs/technician-docs/` (and subfolders, in case of nested
   structure) for any file with "ventilator" in the name (case-insensitive), not just the
   exact string "LK Ventilator Transport". Report exactly what you find or don't find.
2. Search the rest of the repo (e.g. `docs/claude/plans/Calibration-management/` and any other
   docs folder) for a `Penilaian_Kemampuan.zip` or an already-extracted equivalent — an older,
   smaller (30-document) source set that DID include a Ventilator LK document
   (`LK Ventilator Transport.pdf`) when it was reviewed earlier in this project. If you find
   it, you may use it as a fallback source specifically for `VENTILATOR` rows, since it's a
   genuine (if older) real source document, not a fabrication — but clearly note in your
   report that Ventilator's tolerance data came from this older/secondary source, not the
   primary `technician-docs.zip` set, so this is traceable later.
3. If neither source has a Ventilator document, treat all `VENTILATOR` rows as "could not
   resolve" per the original Step 3.5 policy — do not guess.

## Step 4 — Backfill all 242 rows (same requirements as before, repeated for clarity)

For each of the 242 existing rows:
1. Match to its source LK document (primary: `docs/technician-docs/`; fallback for Ventilator
   only, per Step 3).
2. Locate the specific parameter's tolerance in the relevant table.
3. Compute `toleranceMin`/`toleranceMax` from whatever format is found (upper-bound-only →
   min=NULL; nominal±delta → min=nominal-delta, max=nominal+delta; explicit range → min/max
   directly; nominal±percent → compute the absolute min/max from the percentage). Store the
   verbatim original text in `toleranceNote` for every row, regardless of format simplicity.
4. Class-dependent cases (e.g. Equipment Leakage Current varying by device Class I/II): put
   the most common/general-case numeric values in `toleranceMin`/`toleranceMax`, put the full
   class-dependent detail in `toleranceNote`, and list these explicitly in your report (this
   is an acknowledged limitation, not something to solve here).
5. `VENT_IE_RATIO`: no numeric min/max (ratio, not a bounded quantity) — `toleranceNote` only
   if the source states acceptance criteria for it, otherwise leave both null.
6. Anything unresolvable: leave null, list in a "could not resolve" report section — never
   guess.
7. This is an UPDATE against existing rows via `[deviceTypeId, capabilityItemId, code]` — row
   count must remain exactly 242 throughout, no inserts/deletes.

## Step 5 — Verification

1. Row count before and after: must both be 242.
2. Coverage stats: how many rows got both min+max, only one, neither (list the "neither"
   rows), and `toleranceNote` population count.
3. Spot-check 3-5 rows against literal source text (show the quote next to the computed
   values), including at least one row that came from the Ventilator fallback source if that
   path was used.
4. Confirm `VENT_IE_RATIO` handled correctly (no forced numeric bounds).
5. Confirm the class-dependent cases are listed with their `toleranceNote` content.
6. Run typecheck/lint/build. Update any existing tests that reference the old
   `limitKind`/`limitValue`/`limitUomId` fields to use the new fields instead; don't change
   their assertions about row identity/count.

## Output

Report:
- Confirmation old fields removed, new fields added, and any dependent CRUD/UI code updated
  (list files touched).
- Migration name and SQL summary.
- Ventilator source resolution (Step 3): what was found, which source was used (if any).
- Row counts before/after (242/242).
- Coverage stats and "could not resolve" list.
- Class-dependent cases list.
- Spot-check results with source quotes.
- Typecheck/lint/build/test results.
- Confirmation no other model was touched.
