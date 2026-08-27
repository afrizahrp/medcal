# FIX — Split 7 Incorrectly-Collapsed DeviceCalibrationParameter Rows (Pattern C)

## Mode
IMPLEMENTATION task: data correction (delete + re-insert rows), scoped strictly to
`DeviceCalibrationParameter`. Do NOT touch `DeviceType`, `DeviceCategory`, `DeviceCapability`,
`DeviceCapabilityItem` (unless Step 2 genuinely requires a new capability item — see below,
verify before creating), `Uom`, `Device`, or any lifecycle module.

## Why this task exists

`investigation-measurement-pattern-classification.md` (already in the docs folder) found that
7 `DeviceCalibrationParameter` rows (all from the recent 24-device-type taxonomy extension)
each actually represent TWO OR MORE distinct named variants with DIFFERENT tolerance ranges
(e.g. Dental Unit's "Handpiece Speed" has a "Low Speed" variant tolerance of 5,000-11,000 rpm
and a "High Speed" variant tolerance of >250,000 rpm — those are already correctly split into
2 rows, that's the reference example of what "correct" looks like). The 7 rows below were
instead collapsed into ONE row each, with `toleranceMin`/`toleranceMax` left NULL and both
variants' tolerance text crammed together into `toleranceNote` — meaning the system cannot
actually distinguish or validate against either variant's real limit.

## Step 0 — Verify against the LIVE database first (not just the seed script)

The investigation report's analysis was done by reading the seed/backfill SCRIPTS, not by
querying the live database directly. Before doing anything else, query the actual current
`DeviceCalibrationParameter` table for these 7 rows and confirm the report's finding is
accurate against what's really in the database right now:
- `ACLV_STER_TEMP`, `ACLV_STER_TIME`, `ACLV_CHAMBER_TEMP` (Autoclave)
- `BSC_LIGHT_INTENSITY`, `BSC_SOUND_LEVEL` (Bio Safety Cabinet)
- `LAF_SOUND_LEVEL` (Laminar Air Flow)
- `DXRAY_HVL` (Dental X-Ray)

For each, confirm: current `toleranceMin`/`toleranceMax` (expect NULL) and current
`toleranceNote` content (expect it to contain what looks like two combined tolerance
expressions). Report any discrepancy from what the investigation report described before
proceeding — if the live data doesn't match the report's description for a given row, stop and
handle that one separately rather than assuming the report is correct.

## Step 1 — Also investigate the borderline case

`SUCT_MAX_VACUUM` (Suction Pump) was flagged as borderline — the investigation report noted
the source LK document says something like "fill one per unit" rather than clearly presenting
two distinct named variants. Re-read the actual source in `docs/technician-docs/` for this
specific parameter and determine: does this genuinely need a split (two distinct variants with
different tolerances, like the other 7), or is "fill one per unit" describing something else
entirely (e.g. a per-physical-unit calibration value that varies by which specific device is
being tested, not a fixed master-level variant at all — in which case it should NOT be split,
and should be left as-is). Do not guess — if after reading the source it's still genuinely
ambiguous, leave it unchanged and report your reasoning rather than forcing a split.

## Step 2 — For each of the 7 confirmed rows, determine the correct split

For each row, open its source LK document in `docs/technician-docs/`, find the actual table,
and identify the distinct variants and their individual tolerances. Some hints from prior
work (verify independently, don't just trust these): Autoclave's sterilization
temperature/time parameters were previously spot-checked as having a dual-mode structure
("121°C ≥ 15 menit" vs "134°C ≥ 3 menit") — this may be the basis for how `ACLV_STER_TEMP`,
`ACLV_STER_TIME`, and possibly `ACLV_CHAMBER_TEMP` need to split. For the others
(`BSC_LIGHT_INTENSITY`, `BSC_SOUND_LEVEL`, `LAF_SOUND_LEVEL`, `DXRAY_HVL`), read the source
directly — do not assume a similar dual-mode structure without verifying.

For each row that needs splitting into N variants:
1. Determine N new `code` values (append a clear differentiator to the base code reflecting
   the actual variant, e.g. a temperature mode, a measurement zone, a kVp setting — whatever
   the source document actually distinguishes by) and N new `name` values (human-readable,
   reflecting the variant).
2. Determine whether the existing `capabilityItemId` still applies to all variants (likely
   yes, since they're still the same conceptual measurement — e.g. "Sterilization
   Temperature" — just at different modes) or whether a genuinely different
   `DeviceCapabilityItem` is needed. Only create a new `DeviceCapabilityItem` if the variants
   are conceptually different measurements, not just different target values of the same
   measurement — verify this distinction carefully rather than defaulting to either choice.
3. Set each new row's `toleranceMin`/`toleranceMax` (or leave both null with only
   `toleranceNote` if the variant's own tolerance is itself not a clean min/max shape — same
   normalization rules as the original G1 backfill task) and `toleranceNote` (the variant's
   own verbatim source text, not the combined text from the old collapsed row).
4. Keep `valueType`, `uomId`, and `deviceTypeId` consistent with the original row unless the
   source document indicates otherwise for a specific variant.

## Step 3 — Apply the fix

1. Verify no other table currently has a foreign key referencing any of these 7 rows' `id`
   values (expected: none, since `MeasurementResult`/`CalibrationJob` application-layer
   modules don't exist yet and no transactional data references parameter definitions yet) —
   confirm this before deleting, don't assume.
2. Delete the 7 old collapsed rows and insert the new correctly-split rows in their place
   (respecting the `[deviceTypeId, capabilityItemId, code]` unique constraint).
3. Do this as a single script/migration-adjacent operation, not manual one-off SQL — follow
   whatever mechanism this project uses for one-off data corrections (check if a precedent
   exists from prior similar fixes in this project's history, otherwise use a plain one-time
   script consistent with how the seed scripts are structured).

## Step 4 — Verification

1. Confirm the 7 old rows no longer exist and are replaced by the correct number of new rows
   (report exact count, e.g. "7 rows removed, 15 rows added" or whatever the real split count
   turns out to be).
2. Confirm total `DeviceCalibrationParameter` row count changed by exactly (new rows − 7).
3. Spot-check each new row against its source document text (quote the source next to what
   was seeded), same discipline as the original G1 backfill.
4. Confirm the `SUCT_MAX_VACUUM` decision (Step 1) and reasoning.
5. Run typecheck/lint/build per the project's actual scripts.
6. Confirm no other model/table was touched, and no rows outside these 7 (plus the
   `SUCT_MAX_VACUUM` investigation) were modified.

## Output

Report:
- Step 0 verification results (did live DB match the investigation report for all 7 rows?).
- Step 1 decision and reasoning for `SUCT_MAX_VACUUM`.
- For each of the 7 rows: old row content (before), new row(s) content (after), with source
  document quotes justifying the split.
- Whether any new `DeviceCapabilityItem` was created (should be rare/none — explain if so).
- Final row count change.
- Typecheck/lint/build results.
- Confirmation no other model/table was touched.
