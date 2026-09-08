-- Catalog-level entry-UI discriminator on DeviceCalibrationParameter.
-- Distinct from MeasurementEntryKind (stored MeasurementResult rows).
-- Default DIRECT_REPLICATES; the 9 Pattern D logger-summary codes from
-- CalibrationTestPoint_Seed_Extraction.md §6.4 are backfilled to LOGGER_SUMMARY.

-- CreateEnum
CREATE TYPE "CalibrationParameterEntryStyle" AS ENUM ('DIRECT_REPLICATES', 'LOGGER_SUMMARY');

-- AlterTable
ALTER TABLE "DeviceCalibrationParameter" ADD COLUMN "entryStyle" "CalibrationParameterEntryStyle" NOT NULL DEFAULT 'DIRECT_REPLICATES';

-- Backfill Pattern D logger-summary catalog rows (NUMBER, active, zero test
-- points — they leaked into the Stage A measurement-parameters query).
UPDATE "DeviceCalibrationParameter"
SET "entryStyle" = 'LOGGER_SUMMARY'
WHERE "code" IN (
  'BBR_STORAGE_TEMP',
  'KVAK_STORAGE_TEMP',
  'CCHAIN_STORAGE_TEMP',
  'MREF_STORAGE_TEMP',
  'MFRZ_STORAGE_TEMP',
  'OVEN_TEMP',
  'STER_TEMP',
  'CRFR_STORAGE_TEMP',
  'PLT_STORAGE_TEMP'
);
