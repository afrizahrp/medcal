-- DeviceModel / DeviceManufacturer independent-masters refactor (locked
-- business rules, 2026-09-21):
--   1. DeviceManufacturer becomes a new independent master.
--   2. DeviceModel drops its deviceTypeId FK to DeviceType entirely (no
--      indirect DeviceType dependency is reintroduced) and instead belongs
--      only to DeviceManufacturer.
--   3. Uniqueness moves from (deviceTypeId, manufacturer, model) to
--      (manufacturerId, model) — the same model name may repeat across
--      different manufacturers, never twice under the same manufacturer.
--   4. Both masters gain a system-issued, immutable `code` column
--      (MFR-000001 / MOD-000001), allocated by MasterCodeService. `id`
--      (CUID) remains the only foreign-key target — `code` is never a FK.
--
-- Expand -> backfill -> contract, so existing rows never lose data:
--   a) Create DeviceManufacturer; add nullable manufacturerId/code to
--      DeviceModel so existing rows are not touched yet.
--   b) Deduplicate existing DeviceModel.manufacturer strings
--      case/whitespace-insensitively into DeviceManufacturer rows,
--      generating MFR-000001.. codes ordered by first appearance.
--   c) Point every DeviceModel row at its DeviceManufacturer and generate
--      its MOD-000001.. code, ordered by (createdAt, id) — mirrors the
--      Device.code backfill in 20260831120000_add_master_code_sequence_and_device_code.
--   d) Enforce NOT NULL now that every row has a value, then drop the
--      obsolete deviceTypeId/manufacturer columns, their FK/indexes, and the
--      old composite unique constraint, and add the new ones.
--
-- MasterCodeService's sequence counter self-bootstraps from the highest
-- existing `PREFIX-NNNNNN` code on first allocate (see readMaxExistingSequence),
-- so no MasterCodeSequence row needs to be seeded here — future
-- DeviceManufacturer/DeviceModel creates continue numbering above whatever
-- this backfill produced.

-- CreateTable
CREATE TABLE "DeviceManufacturer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceManufacturer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceManufacturer_code_key" ON "DeviceManufacturer"("code");

-- CreateIndex
CREATE INDEX "DeviceManufacturer_isActive_idx" ON "DeviceManufacturer"("isActive");

-- AlterTable: add new columns nullable first so existing DeviceModel rows can be backfilled
ALTER TABLE "DeviceModel" ADD COLUMN "manufacturerId" TEXT;
ALTER TABLE "DeviceModel" ADD COLUMN "code" TEXT;

-- Backfill DeviceManufacturer from distinct existing DeviceModel.manufacturer
-- values, deduplicated case/whitespace-insensitively (matches the service-layer
-- case-insensitive uniqueness DeviceModel enforced before this refactor).
-- Keeps the first-seen casing as the display name, ordered by createdAt so
-- codes are assigned in a stable, deterministic order.
INSERT INTO "DeviceManufacturer" ("id", "code", "name", "isActive", "createdAt", "updatedAt")
SELECT
    'dmf_' || replace(gen_random_uuid()::text, '-', ''),
    'MFR-' || lpad(row_number() OVER (ORDER BY first_seen_at, normalized_name)::text, 6, '0'),
    display_name,
    true,
    now(),
    now()
FROM (
    SELECT DISTINCT ON (lower(trim("manufacturer")))
        lower(trim("manufacturer")) AS normalized_name,
        trim("manufacturer") AS display_name,
        "createdAt" AS first_seen_at
    FROM "DeviceModel"
    ORDER BY lower(trim("manufacturer")), "createdAt", "id"
) AS distinct_manufacturers;

-- Point every existing DeviceModel row at its backfilled DeviceManufacturer
UPDATE "DeviceModel" dm
SET "manufacturerId" = manufacturer."id"
FROM "DeviceManufacturer" manufacturer
WHERE lower(trim(dm."manufacturer")) = lower(trim(manufacturer."name"));

-- Generate stable MOD-000001.. codes for existing DeviceModel rows, ordered by
-- (createdAt, id) — same deterministic ordering used for the Device.code backfill.
WITH ordered AS (
    SELECT
        "id",
        'MOD-' || lpad(row_number() OVER (ORDER BY "createdAt", "id")::text, 6, '0') AS "newCode"
    FROM "DeviceModel"
)
UPDATE "DeviceModel" dm
SET "code" = ordered."newCode"
FROM ordered
WHERE ordered."id" = dm."id";

-- Enforce NOT NULL now that every existing row has a value
ALTER TABLE "DeviceModel" ALTER COLUMN "manufacturerId" SET NOT NULL;
ALTER TABLE "DeviceModel" ALTER COLUMN "code" SET NOT NULL;

-- DropForeignKey: remove the DeviceType dependency entirely (locked rule —
-- do not reintroduce it, directly or indirectly)
ALTER TABLE "DeviceModel" DROP CONSTRAINT "DeviceModel_deviceTypeId_fkey";

-- DropIndex: obsolete deviceTypeId-scoped index and composite unique constraint
DROP INDEX "DeviceModel_deviceTypeId_idx";
DROP INDEX "DeviceModel_deviceTypeId_manufacturer_model_key";

-- AlterTable: drop the obsolete columns
ALTER TABLE "DeviceModel" DROP COLUMN "deviceTypeId";
ALTER TABLE "DeviceModel" DROP COLUMN "manufacturer";

-- AddForeignKey
ALTER TABLE "DeviceModel" ADD CONSTRAINT "DeviceModel_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "DeviceManufacturer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "DeviceModel_code_key" ON "DeviceModel"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceModel_manufacturerId_model_key" ON "DeviceModel"("manufacturerId", "model");

-- CreateIndex
CREATE INDEX "DeviceModel_manufacturerId_idx" ON "DeviceModel"("manufacturerId");
