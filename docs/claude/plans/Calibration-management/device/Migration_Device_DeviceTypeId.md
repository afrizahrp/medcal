# MIGRATION ONLY — Add Device.deviceTypeId (required FK to DeviceType)

## Mode
IMPLEMENTATION task, but SCOPED STRICTLY to one schema migration. Do NOT build any CRUD,
controller, service, UI, or anything else in this task — that comes in a SEPARATE follow-up
task (a Device CRUD & UI prompt already exists and is ready to run, but only AFTER this
migration is confirmed done and verified). Do NOT touch `DeviceCapability`,
`DeviceCapabilityItem`, `DeviceCalibrationParameter`, `DeviceModel`, or any lifecycle module.

## Why this task exists

A previous prompt (for Device CRUD implementation) incorrectly assumed this migration was
"already done and applied." It was NOT. This task does the actual migration first, with the
same safety verification discipline used for every other migration in this project, before
any CRUD work proceeds on top of it.

## Step 0 — Verify current state (do not assume anything)

1. Query the current `Device` table row count directly. Report the exact number. Per the
   project's stated intent ("Device sengaja kosong, jangan seed Device"), it is expected to be
   0 — but CONFIRM this with an actual query, do not assume.
2. If the table is NOT empty (contains real rows), STOP and report what exists — do not
   proceed with adding a required NOT NULL column without a human decision on how to handle
   existing rows (e.g. would need a default/backfill value, which nobody has approved).
3. Re-verify the current exact `Device` model definition directly from
   `packages/db/prisma/schema.prisma` (confirm it does NOT yet have `deviceTypeId` — if it
   already does, STOP and report, since that would mean this task is redundant or the
   situation has changed since this prompt was written).

## Step 1 — Schema change (only if Step 0 confirms table is empty and field doesn't exist yet)

Add to the `Device` model in `packages/db/prisma/schema.prisma`:

```prisma
model Device {
  id           String       @id @default(cuid())
  companyId    String
  customerId   String
  deviceTypeId String
  brand        String?
  model        String?
  serialNumber String?
  category     String?
  locationText String?
  status       DeviceStatus @default(ACTIVE)
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  company    Company    @relation(fields: [companyId], references: [id], onDelete: Cascade)
  customer   Customer   @relation(fields: [customerId], references: [id], onDelete: Cascade)
  deviceType DeviceType @relation(fields: [deviceTypeId], references: [id])

  requestItems       CalibrationRequestItem[]
  quotationItems     QuotationItem[]
  purchaseOrderItems PurchaseOrderItem[]
  calibrationJobs    CalibrationJob[]
  certificates       Certificate[]

  @@index([companyId, customerId])
  @@index([companyId, serialNumber])
  @@index([deviceTypeId])
}
```

This adds `deviceTypeId` (required, `String`, no `?`) plus its relation and index. It does
NOT add `deviceModelId` — that stays out of scope per the earlier locked decision (DeviceModel
backfill is deferred). `brand`/`model`/`category` remain plain `String?` — not touched.

Also add the inverse relation on `DeviceType` if the project convention includes back-relations
on parent models (check how `DeviceModel` does its back-relation on `DeviceType` and mirror
that pattern exactly).

## Step 2 — Migration

1. Since the table is confirmed empty (Step 0), adding a required column needs no default
   value and no data backfill — this should be a clean, simple migration.
2. Generate the migration (verify actual project command). Suggested name:
   `add_required_devicetypeid_to_device`.
3. Review the generated SQL before/after applying. Expect: an `ALTER TABLE "Device" ADD COLUMN
   "deviceTypeId" ...` (NOT NULL, no default needed since table is empty), an FK constraint,
   and an index. If the generated migration does anything beyond this (e.g. touches unrelated
   tables, or somehow implies data movement), STOP and report instead of applying it.
4. Confirm this targets the local native Postgres dev database (same convention as every prior
   migration in this project — not Docker, not shared/production).
5. Run `prisma generate` after applying.

## Step 3 — Verification

1. Confirm the migration applied cleanly and the `Device` table still has 0 rows (nothing was
   inserted, nothing broke).
2. Confirm `deviceTypeId` is NOT NULL and has a working FK constraint to `DeviceType` (e.g. by
   attempting — and expecting to fail — a raw insert with an invalid `deviceTypeId`, if that's
   a safe read-only-equivalent check you can perform without leaving bad data behind; or simply
   confirm via schema introspection that the constraint exists, whichever is safer).
3. Run typecheck/lint/build per the project's actual scripts.
4. Confirm no other model/table was touched.

## Output

Report:
- Row count found in Step 0 (expected 0) and confirmation `deviceTypeId` did not already
  exist before this task.
- Exact migration name and SQL summary.
- Confirmation the `Device` table still has 0 rows after migration.
- Confirmation `deviceTypeId` is NOT NULL with a valid FK constraint to `DeviceType`.
- Typecheck/lint/build results.
- Explicit confirmation NO CRUD/controller/service/UI work was done in this task — that is
  intentionally deferred to the separate Device CRUD & UI task.
