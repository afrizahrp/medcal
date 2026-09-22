-- Structured tolerance operators.
--
-- toleranceMin/Max were always compared inclusively (≥ / ≤). The LK wording
-- in toleranceNote (for example "> 2 MΩ") was display-only, so a reading of
-- exactly 2 passed a limit that the worksheet states as strict.
--
-- These flags are the machine-readable bound. Default TRUE is the previous
-- comparison, so every existing parameter and test point keeps its verdict.
-- FALSE means the bound is strict (> or <) and is ignored when that side's
-- numeric bound is NULL.
--
-- BSM_INSULATION_RESISTANCE is the catalog row whose note is already "> 2 MΩ"
-- and whose structured min is 2. Only that row is switched to a strict lower
-- bound. Other parameters, including ones whose note also starts with ">",
-- stay inclusive until an admin sets the operator.

-- AlterTable
ALTER TABLE "DeviceCalibrationParameter" ADD COLUMN "toleranceMinInclusive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "DeviceCalibrationParameter" ADD COLUMN "toleranceMaxInclusive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "CalibrationTestPoint" ADD COLUMN "toleranceMinInclusive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CalibrationTestPoint" ADD COLUMN "toleranceMaxInclusive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "JobCalibrationTestPoint" ADD COLUMN "toleranceMinInclusive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "JobCalibrationTestPoint" ADD COLUMN "toleranceMaxInclusive" BOOLEAN NOT NULL DEFAULT true;

-- Catalog configuration for Bed Side Monitor insulation resistance (> 2 MΩ).
UPDATE "DeviceCalibrationParameter"
SET "toleranceMinInclusive" = false
WHERE "code" = 'BSM_INSULATION_RESISTANCE';
