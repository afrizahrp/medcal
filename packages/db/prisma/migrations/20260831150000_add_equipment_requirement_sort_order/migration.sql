-- AlterTable: persistent per-DeviceType operational order for equipment requirements.
ALTER TABLE "DeviceTypeEquipmentRequirement" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Data migration: seed the initial order for every existing row from its
-- row-creation order within its parent DeviceType (createdAt, then id as a
-- deterministic tie-break). This preserves the current API/database ordering as
-- the starting point; users subsequently arrange it to match the manual
-- worksheet. Multiples of 10, matching DeviceCalibrationParameter.sortOrder.
-- Deterministic and therefore idempotent — re-running produces the same result.
WITH "ordered" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "deviceTypeId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) * 10 AS "rn"
  FROM "DeviceTypeEquipmentRequirement"
)
UPDATE "DeviceTypeEquipmentRequirement" AS "r"
SET "sortOrder" = "ordered"."rn"
FROM "ordered"
WHERE "r"."id" = "ordered"."id";
