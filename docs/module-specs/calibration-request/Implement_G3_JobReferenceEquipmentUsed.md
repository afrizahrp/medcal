# IMPLEMENT G3 — Add JobReferenceEquipmentUsed Model (schema only)

## Mode
IMPLEMENTATION task, but SCOPED TO SCHEMA ONLY. Do NOT build any CRUD, controller, service,
query hooks, or UI in this task — `CalibrationJob` itself has no application-layer module
built yet (no controller/service/UI exists for it), so building a reference-equipment UI on
top of a job module that doesn't exist yet would be premature. This task only adds the Prisma
model, migration, and confirms it's structurally sound — the CRUD/UI work happens later, as
part of (or after) the `CalibrationJob` module itself is built.

Do NOT touch `Device`, `MeasurementResult`, `JobEvidence`, `QualityReview`,
`DeviceCalibrationParameter`, or any lifecycle module. Do NOT seed any data — this is a
transactional table (populated per real calibration job, same "no fabricated data" policy as
`Device` and `MeasurementResult`).

## Why this task exists

Per `investigation-lk-vs-measurement-schema.md` (already in the docs folder), every one of 50
real LK worksheets has a "Daftar Alat yang Digunakan" (reference/standard equipment used)
table — which specific reference instrument (e.g. Vital Signs Simulator, Electrical Safety
Analyzer, Thermohygrometer), with its own brand/model/serial number, was used for that
specific calibration job. This is universal across every worksheet with zero exceptions, and
currently has no schema representation at all — `JobEvidence` (photo/file attachment with a
caption) cannot represent it.

## Step 0 — Inspect before implementing

1. Confirm the exact current definition of `CalibrationJob` in `schema.prisma` (its `id` field
   type, and how other models FK to it, e.g. `MeasurementResult`, `JobEvidence` — mirror the
   same relation pattern).
2. Confirm no `JobReferenceEquipmentUsed` (or similarly-named) model already exists.

## Step 1 — Add the model

```prisma
model JobReferenceEquipmentUsed {
  id              String   @id @default(cuid())
  calibrationJobId String
  equipmentName   String
  brand           String?
  model           String?
  serialNumber    String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  calibrationJob CalibrationJob @relation(fields: [calibrationJobId], references: [id], onDelete: Cascade)

  @@index([calibrationJobId])
}
```

Design notes (verify these make sense against what you find in Step 0, adjust if the existing
`CalibrationJob` relation conventions differ):
- `equipmentName` is required (every LK worksheet always names the reference equipment type,
  e.g. "Vital Signs Simulator") — `brand`/`model`/`serialNumber` are optional free-text,
  mirroring the same pattern as `Device.brand`/`Device.model`/`Device.serialNumber` (also
  free-text, since there's no reference-equipment master catalog — that's out of scope here,
  same as `DeviceModel` backfill being deferred for `Device` itself).
- `onDelete: Cascade` from `CalibrationJob` — if a job record is ever deleted, its reference-
  equipment-used records should go with it (they have no meaning independent of the job).
  Verify this matches the cascade convention used elsewhere for job-scoped child records (e.g.
  check how `MeasurementResult`/`JobEvidence` handle their `CalibrationJob` relation's
  `onDelete` behavior and match it if different from what's shown above).
- One job can have multiple reference equipment entries (the "Daftar Alat" table has 1-7 rows
  per document) — this model supports that naturally via the FK, no array/JSON needed.

Also add the inverse relation on `CalibrationJob` (e.g.
`referenceEquipmentUsed JobReferenceEquipmentUsed[]`) if the project's convention includes
back-relations on parent models (check how other `CalibrationJob`-child models like
`MeasurementResult` do their back-relation and mirror that pattern).

## Step 2 — Migration

1. Generate the migration. Suggested name: `add_job_reference_equipment_used`.
2. Review the generated SQL — expect a `CREATE TABLE` with a foreign key to `CalibrationJob`
   and an index, nothing else. If it implies anything beyond this, STOP and report.
3. Confirm target is the local native Postgres dev database.
4. Run `prisma generate`.

## Step 3 — Verification

1. Confirm the migration applied cleanly.
2. Confirm no other table/model was touched or had data modified.
3. Run typecheck/lint/build per the project's actual scripts.
4. Confirm `CalibrationJob` itself (and any table with existing data, if any) is unaffected —
   this should be a pure additive change.

## Output

Report:
- Migration name and SQL summary.
- Confirmation of the `onDelete` behavior used and whether it matched or needed adjusting
  from what's shown above, based on the actual `CalibrationJob`-child-model convention found
  in Step 0.
- Typecheck/lint/build results.
- Explicit confirmation: no CRUD/API/UI was built in this task (intentionally deferred), and
  no other model was touched.
