# REFINE DeviceCalibrationParameter — Add valueType, make uomId optional, seed IE_RATIO

## Mode
This is a REVISION to the already-implemented `DeviceCalibrationParameter` model/seed. This
task allows schema changes (migration) and data seeding, strictly scoped to what's described
below. Do NOT touch `Device`, `CalibrationRequestItem`, `MeasurementResult`, `CalibrationJob`,
or any calibration-execution/result model — this remains a MASTER DEFINITION table, not a
place to store actual measured values. That boundary from the original implementation task
still applies and is NOT being changed here.

## Why this change

`DeviceCalibrationParameter` currently requires `uomId` (non-nullable), which works for
parameters expressed as a single number with a physical unit (e.g. Systolic Pressure in mmHg).
But one confirmed real parameter — Ventilator's **I:E Ratio** (e.g. "1:2", "1:3") — is not a
single physical quantity with a unit; it's a ratio. Forcing it into a numeric+Uom shape would
lose its actual meaning. The fix is to let `DeviceCalibrationParameter` declare WHAT KIND of
value a parameter expects (a `valueType`), and only require `uomId` when that type is `NUMBER`.

This is still purely a MASTER DEFINITION concept — we are describing "this parameter is a
ratio" here, not storing an actual measured ratio value anywhere. Storing actual measured
values (numeric readings, ratio readings, text notes, pass/fail booleans) from a real
calibration job is future work, tracked separately (see the project's open architecture
question about `MeasurementResult` linkage) — do not build that here.

## Step 0 — Inspect before changing anything

1. Confirm current row count in `DeviceCalibrationParameter`. Based on prior work, it should
   be either 0 (if the seeding task hasn't run yet) or 241 (if it has). Report which state
   you find — this changes what Step 2 needs to do.
2. Re-verify the current exact schema for `DeviceCalibrationParameter` (field names, types,
   constraints) directly from `schema.prisma` — do not assume it still matches what's
   described below without checking, since time has passed.

## Step 1 — Schema change

In `packages/db/prisma/schema.prisma`:

1. Add a new enum:
```prisma
enum CalibrationValueType {
  NUMBER
  RATIO
  TEXT
  BOOLEAN
}
```

2. Modify `DeviceCalibrationParameter`:
```prisma
model DeviceCalibrationParameter {
  id               String                @id @default(cuid())
  deviceTypeId     String
  capabilityItemId String
  code             String
  name             String
  description      String?
  valueType        CalibrationValueType  @default(NUMBER)
  uomId            String?
  createdAt        DateTime              @default(now())
  updatedAt        DateTime              @updatedAt

  deviceType     DeviceType           @relation(fields: [deviceTypeId], references: [id])
  capabilityItem DeviceCapabilityItem @relation(fields: [capabilityItemId], references: [id])
  uom            Uom?                 @relation(fields: [uomId], references: [id])

  @@unique([deviceTypeId, capabilityItemId, code])
  @@index([deviceTypeId])
  @@index([capabilityItemId])
  @@index([uomId])
}
```

Key changes from current schema: `uomId` changes from required `String` to optional
`String?`, the `uom` relation becomes optional (`Uom?`), and `valueType` is added with a
default of `NUMBER` (this default means every existing row, when the migration runs, is
automatically backfilled to `NUMBER` — no manual data backfill script is needed for that part;
Prisma/Postgres handles it via the column default during the `ALTER TABLE ADD COLUMN`).

## Step 2 — Migration

1. Generate the migration (verify the actual project command, don't guess). Suggested name:
   `add_valuetype_and_optional_uom_to_device_calibration_parameter`.
2. Review the generated SQL before/after applying. Expect: one `CREATE TYPE` (or equivalent)
   for the new enum, one `ALTER TABLE ... ADD COLUMN valueType ... DEFAULT 'NUMBER'`, and one
   `ALTER TABLE ... ALTER COLUMN "uomId" DROP NOT NULL` (making it nullable). This should NOT
   drop or lose any existing data. If the generated migration does anything beyond this
   (e.g. touches unrelated tables/columns), STOP and report instead of applying it.
3. Confirm this targets the local native Postgres dev database (same convention as all prior
   migrations in this project — not Docker, not shared/production).
4. Run `prisma generate` after applying.

## Step 3 — Seed the previously-skipped IE_RATIO row

Insert exactly one new row (do not touch/re-seed any of the other existing rows — they are
already correct with `valueType` defaulting to `NUMBER`):

| Field | Value |
|---|---|
| `deviceTypeId` | resolve from `DeviceType.code = 'VENTILATOR'` |
| `capabilityItemId` | resolve via `DeviceCapabilityItem.code = 'IE_RATIO'` under `DeviceCapability.code = 'VENTILATION_PERFORMANCE'` (same two-step resolution as the original seeding task: look up the capability first, then the item scoped to it) |
| `code` | `VENT_IE_RATIO` |
| `name` | `I:E Ratio` |
| `description` | `null` |
| `valueType` | `RATIO` |
| `uomId` | `null` |

Use the same idempotent/upsert pattern (keyed on `[deviceTypeId, capabilityItemId, code]`) as
the rest of the seed data, so this is safe to run more than once.

## Step 4 — Verification

1. Confirm total row count is now 242 (241 pre-existing + this 1 new row) — or, if Step 0
   found the table was still empty (0 rows), confirm this single row seeds correctly on its
   own for now (the other 241 will be seeded separately per the original seeding task).
2. Confirm all 241 pre-existing rows (if present) now show `valueType = NUMBER` and their
   `uomId` values are unchanged (not nulled out).
3. Confirm the new `VENT_IE_RATIO` row has `valueType = RATIO` and `uomId = NULL`.
4. Run the seed step a SECOND time. Confirm row count is unchanged and no duplicates/errors.
5. Run typecheck/lint/build per the project's actual scripts.

## Output

Report:
- State found in Step 0 (0 or 241 rows) and how that affected your approach.
- Migration name and SQL summary.
- Confirmation existing rows (if present) retained their `uomId` values and got
  `valueType = NUMBER`.
- Confirmation the new `VENT_IE_RATIO` row was inserted correctly with `valueType = RATIO`,
  `uomId = NULL`.
- Row counts after run 1 and run 2 (idempotency proof).
- Typecheck/lint/build results.
- Confirmation no other model/table was touched (especially: no changes to `Device`,
  `CalibrationJob`, `MeasurementResult`, or any execution/result-related model).
