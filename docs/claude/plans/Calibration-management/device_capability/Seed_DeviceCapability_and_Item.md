# SEED DeviceCapability + DeviceCapabilityItem (evidence-based, from real LK worksheets)

## Mode
IMPLEMENTATION task, scoped strictly to seeding two tables:
`DeviceCapability` and `DeviceCapabilityItem`. Do NOT touch `DeviceCalibrationParameter`,
`DeviceModel`, `Device`, `DeviceType`, `DeviceCategory`, `Uom`, or any lifecycle module — this
task is data-seeding only, no schema changes needed (both tables already exist per the current
Prisma schema).

## Source of this data — read before seeding

This data was NOT invented. It was extracted directly from the company's own real calibration
worksheets (LK — Lembar Kerja) held in `Penilaian_Kemampuan.zip`, provided by the project
owner. Each capability and item below cites the specific LK document (and section/field name
within it) it was derived from. Two attached CSVs contain the full seed data:

- `seed_device_capability.csv` — columns: `code, name, description, evidence_source`
- `seed_device_capability_item.csv` — columns: `capability_code, item_code, item_name, evidence_source`

`evidence_source` is metadata for traceability/audit purposes only — do not add it as a column
to either Prisma model, both models already have their final field set
(`id, code, name, description, createdAt, updatedAt` for `DeviceCapability`;
`id, capabilityId, code, name, description, createdAt, updatedAt` for `DeviceCapabilityItem`).

## Two important framing notes

1. **These are global, reusable, generic capability definitions — not tied to any DeviceType.**
   E.g. `ELECTRICAL_SAFETY` and its items apply conceptually to dozens of device types; do not
   try to scope this data to specific device types in this task. That scoping happens later,
   per DeviceType, in `DeviceCalibrationParameter` (already implemented in a separate task with
   its own `deviceTypeId` field) — this task only populates the generic catalog.
2. **This CSV data is not exhaustive of every possible parameter** — it reflects what's
   explicitly documented in the LK worksheets available today (30 unique documents covering
   roughly 40 of the ~47 known device-type folders; a handful of device types like
   Whirlpool Baths, Paraffin Baths, HypoHypertermia, BloodSolution Warmers currently have no
   LK worksheet and are simply not represented in this seed — that's expected, not a bug).

## Seeding must be idempotent

The seed script MUST be safe to run more than once without creating duplicates or erroring.
Use an upsert pattern (e.g. Prisma `upsert` keyed on the unique `code` field for
`DeviceCapability`, and keyed on the unique `[capabilityId, code]` combination for
`DeviceCapabilityItem`) — not a plain `create`. Check how existing master-data seeding in this
project handles this (e.g. how `Uom` or `DeviceCategory`/`DeviceType` seeds were written) and
follow the same idempotent pattern rather than inventing a new one. As part of Step 3
verification, run the seed script TWICE in a row and confirm row counts are identical after
both runs (no duplicates created on the second run).

## Step 0 — Inspect before seeding

1. Confirm current state of `DeviceCapability` and `DeviceCapabilityItem` tables (should be
   empty per the earlier "no fabricated seed" policy — if either has existing rows, STOP and
   report what's there before proceeding, don't silently overwrite or duplicate).
2. Confirm the exact current schema fields for both models (they were shown to you in an
   earlier conversation — re-verify against the actual current `schema.prisma` since it may
   have had other unrelated changes since).
3. Check how existing master-data seeding is done in this project (e.g. how `Uom` or
   `DeviceCategory`/`DeviceType` were seeded — a seed script, a migration seed step, or a
   one-off script). Follow the SAME mechanism — don't invent a new seeding approach.

## Step 1 — Seed DeviceCapability

Insert all 21 rows from `seed_device_capability.csv` (`code`, `name`, `description` columns
only — `evidence_source` is not a DB column, keep it only as a comment/reference in your seed
script source code for traceability, e.g. as a code comment above each insert).

## Step 2 — Seed DeviceCapabilityItem

Insert all 66 rows from `seed_device_capability_item.csv`, resolving `capability_code` to the
actual `DeviceCapability.id` created in Step 1 (via the unique `code` field) to populate
`capabilityId`. Again, keep `evidence_source` as a code comment only, not a DB column.

## Step 3 — Verification

1. Confirm row counts: 21 `DeviceCapability` rows, 66 `DeviceCapabilityItem` rows.
2. Confirm every `DeviceCapabilityItem.capabilityId` correctly resolves to its parent
   `DeviceCapability` per the CSV mapping (spot-check a few, e.g. `SYSTOLIC_PRESSURE` should
   resolve to the `NIBP` capability).
3. Run the seed script a SECOND time. Confirm row counts are unchanged (21 / 66) and no
   duplicate rows or constraint errors occurred — this proves the upsert/idempotent pattern
   actually works, not just that it was written.
4. Run typecheck/lint/build per the project's actual scripts.
5. If the seeding mechanism has tests, run them.

## Output

Report:
- Which seeding mechanism you used (script path, command) and confirm it uses an
  upsert/idempotent pattern (not plain `create`).
- Confirmed row counts for both tables after the FIRST run.
- Confirmed row counts after the SECOND run (should be identical — this is the idempotency
  proof, not optional).
- Confirmation Step 0's "empty table" check passed (or what you found if not).
- Confirmation no other model/table was touched.
- List any of the 66 items where you couldn't cleanly resolve `capability_code` to a created
  `DeviceCapability` (should be none, but report if so rather than silently skipping).
