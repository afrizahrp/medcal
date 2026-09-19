-- Phase 4B (Gap B) — derived / aggregate measurements, B1 minimum architecture.
--
-- A derived value (Autoclave ΔT, a magnification ratio) is still typed in by
-- the technician and stored as an ordinary MeasurementResult — this migration
-- adds nothing to that table. It only lets a DeviceCalibrationParameter be
-- catalogued as DERIVED and carry a DESCRIPTIVE (non-executable) note about
-- what the value is derived from.
--
-- No formula engine, no evaluator, no automatic calculation, no new
-- MeasurementResult column, no CalibrationTestPoint / JobCalibrationTestPoint
-- change. Both changes are purely additive and backward compatible: every
-- existing row keeps its current entryStyle and derivation = NULL.

-- Add DERIVED to CalibrationParameterEntryStyle.
-- Idempotent: safe if the value was already added manually on a target DB.
DO $$
BEGIN
  ALTER TYPE "CalibrationParameterEntryStyle" ADD VALUE 'DERIVED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: descriptive-only derivation note. Nullable, no default beyond
-- NULL, no backfill — every existing row is unaffected.
ALTER TABLE "DeviceCalibrationParameter" ADD COLUMN "derivation" JSONB;
