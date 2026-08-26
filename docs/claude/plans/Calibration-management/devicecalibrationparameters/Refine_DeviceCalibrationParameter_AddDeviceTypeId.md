# REFINE DeviceCalibrationParameter — Add deviceTypeId (schema decision confirmed)

## Mode
This is a REVISION to the `DeviceCalibrationParameter` feature you already implemented in the
previous task. This is an IMPLEMENTATION task (schema change + code change allowed), but
strictly scoped to what's described below. Do not touch `Device`, `CalibrationRequestItem`,
or any calibration-execution/result models — that restriction from the original task still
applies.

## Why this change

The original task instructed a minimal model (`capabilityItemId`, `code`, `name`,
`description`, `uomId`) because `DeviceCapability`/`DeviceCapabilityItem` are a **global,
reusable catalog** — not tied to any specific device type. That was correct as far as it went.

However, a business decision has now been confirmed: **calibration parameters are defined
per DeviceType** (not per DeviceModel — e.g. all Blood Pressure Monitors share the same
calibration parameters regardless of brand, but a Blood Pressure Monitor and a Ventilator do
NOT share the same parameter set even if they happen to use the same generic capability item
like "Electrical Safety"). The current schema has no way to express "this parameter applies to
DeviceType X" — `capabilityItemId` alone cannot carry that meaning, because a single
`DeviceCapabilityItem` (e.g. "Systolic Accuracy") may legitimately be reused across multiple
device types with different parameter definitions per type.

## Step 0 — Verify the table is empty before proceeding

Per the original task's "No fabricated seed" policy, `DeviceCalibrationParameter` should have
no real rows yet. Confirm this by querying the table (read-only check). If it is genuinely
empty, proceed with Steps 1+ below (adding a required field is safe). If it is NOT empty
(contains real data), STOP and report back what exists — do not silently make `deviceTypeId`
nullable or backfill a guessed value to work around existing rows; that decision needs a human
call.

## Step 1 — Prisma schema change

In `packages/db/prisma/schema.prisma`, modify `DeviceCalibrationParameter`:

```prisma
model DeviceCalibrationParameter {
  id               String   @id @default(cuid())
  deviceTypeId     String
  capabilityItemId String
  code             String
  name             String
  description      String?
  uomId            String
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  deviceType     DeviceType           @relation(fields: [deviceTypeId], references: [id])
  capabilityItem DeviceCapabilityItem @relation(fields: [capabilityItemId], references: [id])
  uom            Uom                  @relation(fields: [uomId], references: [id])

  @@unique([deviceTypeId, capabilityItemId, code])
  @@index([deviceTypeId])
  @@index([capabilityItemId])
  @@index([uomId])
}
```

Key changes from the current schema: added `deviceTypeId` (required) + its relation, changed
the unique constraint from `[capabilityItemId, code]` to
`[deviceTypeId, capabilityItemId, code]` (this is what allows the same capability item + code
combination to exist independently for different device types), added an index on
`deviceTypeId`.

Also add the inverse relation on `DeviceType` if the project's convention includes back-relations
on the parent model (check how `DeviceModel` does its back-relation on `DeviceType` and mirror
that pattern exactly).

## Step 2 — Migration

1. Generate the migration (check the project's actual Prisma migration command, don't guess).
   Use a clear name, e.g. `add_devicetype_to_device_calibration_parameter`.
2. Review the generated SQL before/after applying: expect an `ALTER TABLE ADD COLUMN`, an FK
   constraint addition, an index addition, and the unique constraint change (drop old, add
   new). Since the table is confirmed empty (Step 0), this should not require any data
   migration/backfill logic. If the generated migration does anything beyond this, STOP and
   report instead of applying it.
3. Confirm this targets the local native Postgres dev database (not Docker, not shared/
   production) — same convention as prior migrations in this project.
4. Run `prisma generate` after applying.

## Step 3 — Backend updates

1. Update the create/update Zod schemas (wherever they live per this project's convention —
   check where the original `DeviceCalibrationParameter` schemas were added) to include
   `deviceTypeId` as a required field on create, and handle it appropriately on update
   (mirror whatever pattern is used for `capabilityItemId`/`uomId` — likely also required and
   immutable-or-editable per the existing pattern, don't invent new update semantics).
2. Update the service layer to accept, validate, and persist `deviceTypeId`.
3. Update any list/query endpoint to support filtering by `deviceTypeId` if the existing list
   endpoint already supports filtering by `capabilityItemId`/`uomId` (mirror that pattern).
4. No AuthZ/permission changes needed — the resource-level permission stays the same, this is
   just an additional field.

## Step 4 — Frontend updates

1. Add a DeviceType selector to the Calibration Parameters create/edit form, positioned
   before or alongside the Capability Item selector. Reuse the existing DeviceType
   query hook (the same one used in the `DeviceModel` form for its DeviceType selector) —
   do not create a duplicate data-fetching hook.
2. Add a "Device Type" column to the Calibration Parameters list table.
3. If the list page has filters (per Step 3.3), add a DeviceType filter control, mirroring
   the UI pattern of any existing filter on that page.
4. Update query hooks/query keys if they need to include `deviceTypeId` for cache
   correctness (e.g. if list results are cached per filter combination).

## Step 5 — Verification

1. Run typecheck, lint, backend build, frontend build (check actual project scripts).
2. Update/extend existing tests for `DeviceCalibrationParameter` CRUD to cover the new
   required field (creation without `deviceTypeId` should fail validation; the new composite
   unique constraint should be enforced — e.g. same `capabilityItemId`+`code` should now be
   allowed across two different `deviceTypeId`s, but not within the same one).
3. Confirm migration applied cleanly.

## Output

Report:
- Confirmation the table was empty before the change (Step 0 result).
- Exact migration name and SQL summary.
- Files changed, grouped by Step 1-4.
- Test results (typecheck/lint/build/tests) — real results, not "structurally complete."
- Confirm no changes were made to `Device`, `CalibrationRequestItem`, `Uom`, `DeviceCategory`,
  `DeviceType` (schema itself, aside from the new inverse relation if applicable), or
  `DeviceModel`.
