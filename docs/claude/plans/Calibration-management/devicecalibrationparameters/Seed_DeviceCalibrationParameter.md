# SEED DeviceCalibrationParameter (evidence-based, verified against 30 real LK worksheets)

## Mode
IMPLEMENTATION task, scoped strictly to seeding ONE table: `DeviceCalibrationParameter`.
Do NOT touch `DeviceType`, `DeviceCapability`, `DeviceCapabilityItem`, `Uom`, `DeviceModel`,
`Device`, or any lifecycle module. This task assumes `DeviceType` (35 rows),
`DeviceCapability` (21 rows), `DeviceCapabilityItem` (66 rows), and `Uom` (including the
`UA`, `M_S`, `DB` rows added in earlier follow-ups) are already seeded. If any of those are
NOT yet populated, STOP and report — do not proceed with partial lookups that would silently
create broken/null foreign keys.

## Source of this data

Attached: `seed_device_calibration_parameter.csv` — columns:
`device_type_code, capability_item_code, param_code, param_name, uom_code, status, evidence_source`

Every row was extracted directly from the company's real LK (Lembar Kerja) calibration
worksheets and cross-verified twice (once from initial reading, once from a dedicated
follow-up verification pass that re-opened all source documents to confirm section-by-section
presence of environmental/electrical-safety measurements per device type — this caught and
corrected 3 devices — Sphygmomanometer, Flow Meter, Oxygen Concentrator — that do NOT have
electrical-safety sections, unlike the rest). `evidence_source` and `status` are traceability
metadata only, NOT database columns — the actual `DeviceCalibrationParameter` model only has
`id, deviceTypeId, capabilityItemId, code, name, description, uomId, createdAt, updatedAt`.

**One row must be SKIPPED, not seeded**: the row with `param_code = VENT_IE_RATIO` has
`status = BLOCKED` and an empty `uom_code`. I:E Ratio (Ventilator) is expressed as a ratio
(e.g. "1:2") rather than a standard physical quantity, and since `uomId` is a required
(non-nullable) field on this model, this parameter cannot be seeded yet without a separate
design decision (e.g. a dimensionless Uom entry, or modeling this differently). Skip this one
row entirely — do not invent a Uom for it, do not guess. All other rows in the CSV have
`status = CONFIRMED` and should be seeded.

## Step 0 — Inspect before seeding

1. Confirm `DeviceCalibrationParameter` table is currently empty (per the "no fabricated
   seed" policy from its original implementation task). If not empty, STOP and report what
   exists before proceeding.
2. Re-verify current schema fields match what's expected (was last confirmed with
   `deviceTypeId`, `capabilityItemId`, `code`, `name`, `description`, `uomId`, and unique
   constraint `[deviceTypeId, capabilityItemId, code]` — re-check `schema.prisma` since time
   has passed since that was set).
3. Confirm the seeding mechanism/pattern used for `DeviceCapability`/`DeviceCapabilityItem`
   (from the earlier seeding task) and follow the exact same idempotent approach.

## Step 1 — Resolve foreign keys and seed

For each CONFIRMED row in the CSV (241 rows; skip the 1 BLOCKED row as described above):

1. Resolve `deviceTypeId` by looking up `DeviceType` where `code = device_type_code`.
2. Resolve `capabilityItemId` in TWO steps (capability item codes are only unique within
   their parent capability, per `@@unique([capabilityId, code])` — do NOT look up
   `DeviceCapabilityItem` by code alone):
   a. The CSV's `capability_item_code` column value corresponds to the `code` field on
      `DeviceCapabilityItem` — but you also need its parent `DeviceCapability`. Cross-reference
      against the earlier `seed_device_capability_item.csv` (columns:
      `capability_code, item_code, item_name`) to find which `capability_code` each
      `item_code` belongs to, THEN look up `DeviceCapability` by that `code` to get its `id`,
      THEN look up `DeviceCapabilityItem` by `(capabilityId, code=item_code)`.
   b. If a `capability_item_code` cannot be resolved this way, STOP and report it — do not
      skip silently or guess a substitute item.
3. Resolve `uomId` by looking up `Uom` where `code = uom_code`.
4. If ANY of the three lookups (deviceType, capabilityItem, uom) fails to resolve for a given
   row, do NOT seed that row — collect it in a "failed to resolve" list for the final report,
   and continue with the remaining rows (don't abort the whole batch over one bad row).
5. Insert using `code = param_code`, `name = param_name`, `description = null` (none of the
   source rows have a distinct description beyond the name — don't invent one), and the three
   resolved foreign keys.

## Step 2 — Idempotency

Same requirement as the `DeviceCapability`/`DeviceCapabilityItem` seed: use an upsert pattern
keyed on the unique `[deviceTypeId, capabilityItemId, code]` combination, not plain `create`.
The seed script must be safe to run more than once without duplicating rows.

## Step 3 — Verification

1. Confirm total inserted row count: should be 241 (242 CSV rows minus the 1 skipped
   `VENT_IE_RATIO`).
2. Report the list of any rows that failed FK resolution (Step 1.4), if any (expected: none,
   since this data was pre-verified — but confirm rather than assume).
3. Run the seed script a SECOND time. Confirm the row count is unchanged (still 241) and no
   duplicates or constraint errors occurred.
4. Spot-check a few resolved relationships end-to-end, e.g.: `BPM_SYSTOLIC` should resolve to
   `DeviceType.code = BLOOD_PRESSURE_MONITOR`, `DeviceCapabilityItem.code = SYSTOLIC_PRESSURE`
   (under capability `NIBP`), `Uom.code = MMHG`.
5. Run typecheck/lint/build per the project's actual scripts.

## Output

Report:
- Confirmed table was empty before seeding (Step 0).
- Total rows seeded (expect 241) after run 1, and after run 2 (should match — idempotency
  proof).
- Any rows that failed FK resolution, with the specific missing lookup (device type,
  capability item, or uom) — expected: none.
- Confirmation the `VENT_IE_RATIO` row was correctly skipped and not seeded.
- Confirmation no other table/model was touched.
