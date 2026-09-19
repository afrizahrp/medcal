-- Phase 4A (Gap A) — multiple measured quantities in one logical test.
--
-- Several LK worksheets record more than one independently measured quantity for
-- a single logical test (Dental X-Ray reproducibility: kV + s + mGy; Microscope:
-- stage + eyepiece). Each quantity keeps its own unit, tolerance and verdict, so
-- each remains its own DeviceCalibrationParameter. These two CATALOG columns are
-- the only thing that records "these parameters are one logical test, printed in
-- this order".
--
-- Presentation metadata only. MeasurementResult (natural key included),
-- CalibrationTestPoint, JobCalibrationTestPoint and replicateIndex are NOT
-- touched, and no measurement row is read or written by this migration.
--
-- Backward compatible by construction: both columns are nullable and every
-- existing row keeps (NULL, NULL), which means "standalone parameter, behaves
-- exactly as before". There is no backfill.

-- AlterTable
ALTER TABLE "DeviceCalibrationParameter" ADD COLUMN     "logicalTestKey" TEXT;
ALTER TABLE "DeviceCalibrationParameter" ADD COLUMN     "logicalTestSequence" INTEGER;

-- A parameter is either fully grouped or fully standalone — never half-declared,
-- which would make the presentation order undefined.
ALTER TABLE "DeviceCalibrationParameter"
  ADD CONSTRAINT "DeviceCalibrationParameter_logicalTest_paired"
  CHECK (
    ("logicalTestKey" IS NULL AND "logicalTestSequence" IS NULL)
    OR ("logicalTestKey" IS NOT NULL AND "logicalTestSequence" IS NOT NULL)
  );

-- 1-based, matching CalibrationTestPoint.sequence.
ALTER TABLE "DeviceCalibrationParameter"
  ADD CONSTRAINT "DeviceCalibrationParameter_logicalTestSequence_positive"
  CHECK ("logicalTestSequence" IS NULL OR "logicalTestSequence" >= 1);

-- CreateIndex
CREATE INDEX "DeviceCalibrationParameter_deviceTypeId_logicalTestKey_idx"
  ON "DeviceCalibrationParameter"("deviceTypeId", "logicalTestKey");

-- One column position per logical test, per device type. Postgres treats NULLs as
-- DISTINCT here (no NULLS NOT DISTINCT), so ungrouped rows never collide with one
-- another — only genuinely declared duplicates are rejected.
CREATE UNIQUE INDEX "DeviceCalibrationParameter_deviceTypeId_logicalTestK_key"
  ON "DeviceCalibrationParameter"("deviceTypeId", "logicalTestKey", "logicalTestSequence");
