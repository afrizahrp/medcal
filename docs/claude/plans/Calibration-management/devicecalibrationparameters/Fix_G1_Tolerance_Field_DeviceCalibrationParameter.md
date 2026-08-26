# FIX GAP G1 — Add Tolerance Fields to DeviceCalibrationParameter, Backfill from Source

## Mode
IMPLEMENTATION task: schema migration + data backfill. Scoped strictly to
`DeviceCalibrationParameter`. Do NOT touch `Device`, `CalibrationJob`, `MeasurementResult`,
`JobEvidence`, `QualityReview`, or any other model. Do NOT implement `MeasurementEntry`,
`JobReferenceEquipmentUsed`, or any of the other design directions from the investigation
report mentioned below — those are separate, later tasks.

## Why this task exists

An investigation (`investigation-lk-vs-measurement-schema.md`, already in the docs folder —
read it first for full context) found that `DeviceCalibrationParameter` has NO tolerance/
threshold field at all, despite every real LK worksheet pairing each measured parameter with a
fixed pass/fail limit. This was originally excluded deliberately (avoiding speculative fields
without evidence) — that evidence now exists. This task adds the field(s) and backfills all
242 existing rows from the real source documents.

## Step 0 — Inspect before changing anything

1. Confirm current row count in `DeviceCalibrationParameter` (expected: 242 — 241 `NUMBER`-type
   + 1 `RATIO`-type `VENT_IE_RATIO`). Report the actual count found.
2. Re-verify the current exact schema for `DeviceCalibrationParameter` directly from
   `schema.prisma`.
3. Confirm `technician-docs.zip` is extracted and accessible (per the investigation report,
   should be at `docs/technician-docs/`, 50 `.docx` LK worksheets). If not found there, search
   for it. If genuinely not accessible, STOP and report — this task cannot proceed without the
   real source documents (do not guess tolerance values).

## Step 1 — Schema change

Add to `DeviceCalibrationParameter` in `packages/db/prisma/schema.prisma`:

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
  toleranceMin     Decimal?              @db.Decimal(18, 4)
  toleranceMax     Decimal?              @db.Decimal(18, 4)
  toleranceNote    String?
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

**Design rationale (so you don't need to re-derive it, but verify it makes sense against what
you actually read in the source documents in Step 2)**: real tolerances appear in at least 5
different shapes in the LK worksheets — upper-bound-only ("≤500µA"), nominal±absolute
("25±6°C"), nominal±percent ("220±10%"), explicit range ("2-8°C"), and class-dependent
(different limits for Class I vs Class II devices on the same parameter). `toleranceMin`/
`toleranceMax` normalize the first four shapes into two comparable numbers (computed from
whichever original format applies — e.g. "25±6°C" becomes min=19, max=25; "≤500µA" becomes
min=NULL, max=500). `toleranceNote` keeps the original human-readable text for every row (for
audit/traceability and as the only place the class-dependent case can be captured for now,
since a clean structural fix for that would need a device-class dimension that doesn't exist
in the schema yet). **This is a known, acknowledged limitation, not something to solve in this
task** — if you hit a class-dependent parameter, put the general/most-common-case numeric
values in `toleranceMin`/`toleranceMax` and put the full class-dependent detail in
`toleranceNote`, and flag it explicitly in your final report so it's not silently lossy.

All three new fields are nullable — this is a safe additive migration, no backfill-via-default
needed at the schema level (the actual backfill happens in Step 3, separately, as real data).

## Step 2 — Migration

1. Generate the migration (verify actual project command). Suggested name:
   `add_tolerance_fields_to_device_calibration_parameter`.
2. Review the generated SQL. Expect three `ALTER TABLE ADD COLUMN` statements, all nullable,
   no data loss. If it does anything beyond this, STOP and report instead of applying.
3. Confirm target is the local native Postgres dev database (same convention as every prior
   migration in this project).
4. Run `prisma generate`.

## Step 3 — Backfill tolerance data for all 242 existing rows from source LK documents

For each of the 242 existing `DeviceCalibrationParameter` rows:

1. Identify which LK document in `docs/technician-docs/` corresponds to that row's
   `deviceType` (match by device type name — the same mapping used when these rows were
   originally seeded; if you need the device-type-to-LK-filename mapping, derive it the same
   way the original seeding work did, by matching device type names to LK document titles).
2. Open that document, find the specific parameter (matching by `code`/`name`), and locate its
   tolerance value in the relevant table (environmental conditions table, electrical safety
   table, or the device-specific performance table, depending on which capability the
   parameter belongs to).
3. Compute `toleranceMin`/`toleranceMax` from whatever format is found, and store the original
   text verbatim in `toleranceNote` regardless of format (even for the simple cases — this
   preserves an audit trail back to the source wording for every row, not just the ambiguous
   ones).
4. For the one `RATIO`-type row (`VENT_IE_RATIO`), do NOT compute numeric min/max (a ratio
   isn't a min/max-bounded quantity in the same sense) — leave `toleranceMin`/`toleranceMax`
   NULL, but still populate `toleranceNote` if the source document expresses any acceptance
   criteria for it (check the Ventilator LK — if none is stated, leave `toleranceNote` NULL
   too and say so in your report).
5. If you cannot confidently resolve a tolerance for a given row (source unclear, ambiguous
   match, or genuinely not stated in that LK), do NOT guess a value. Leave that row's
   tolerance fields NULL and add it to a "could not resolve" list for your final report —
   this must be reported explicitly, not silently skipped.
6. Update rows via their unique `[deviceTypeId, capabilityItemId, code]` key — this is an
   UPDATE to existing rows, NOT an insert/reseed. Row count must remain 242 throughout.

Use whatever script/migration mechanism fits the project's existing conventions for this kind
of one-off data backfill (check how prior backfills/seeds in this project were structured and
executed) — it does not need to be idempotent in the same way the original seed was (this is a
one-time backfill against known-existing rows, not a repeatable seed), but it should be safe
to re-run without corrupting data if it needs to be re-run (e.g. re-running should just
re-resolve and re-write the same values, not duplicate rows or error).

## Step 4 — Verification

1. Confirm row count is still exactly 242 after backfill (no rows added or removed).
2. Report how many of the 242 rows got both `toleranceMin` and `toleranceMax` populated, how
   many got only one (e.g. upper-bound-only cases), how many got neither (should be rare —
   list them), and confirm `toleranceNote` population count.
3. Spot-check 3-5 rows end-to-end against the actual source document text (e.g. confirm
   `BPM_SYSTOLIC`'s tolerance matches what's literally written in the Blood Pressure Monitor
   LK) and show your work (quote the source text next to the computed min/max).
4. Confirm the `VENT_IE_RATIO` row was handled per Step 3.4 (no numeric min/max forced onto
   it).
5. Run typecheck/lint/build per the project's actual scripts.
6. Run any existing `DeviceCalibrationParameter` tests; update them if they assert on the
   exact field set (they'll need to account for the 3 new nullable fields) but do not change
   their assertions about the 242 rows' identity/count/other existing fields.

## Output

Report:
- Row count before and after (should be 242 both times).
- Migration name and SQL summary.
- Backfill coverage stats (see Step 4.2).
- The "could not resolve" list (Step 3.5), if any — with the specific row and why it couldn't
  be resolved.
- The class-dependent-tolerance cases encountered (Step 1's acknowledged limitation) — which
  rows, and what you put in `toleranceNote` for them.
- Spot-check results (Step 4.3), showing source text next to computed values.
- Typecheck/lint/build/test results.
- Confirmation no other model was touched.
