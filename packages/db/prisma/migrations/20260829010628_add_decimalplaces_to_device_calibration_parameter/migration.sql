-- AlterTable
ALTER TABLE "DeviceCalibrationParameter" ADD COLUMN     "decimalPlaces" INTEGER;

-- Bound decimalPlaces to 0..10 without forcing a default (NULL stays valid).
ALTER TABLE "DeviceCalibrationParameter"
  ADD CONSTRAINT "DeviceCalibrationParameter_decimalPlaces_range"
  CHECK ("decimalPlaces" IS NULL OR ("decimalPlaces" >= 0 AND "decimalPlaces" <= 10));

-- Backfill ONE SAFE UNIFORM DEFAULT for existing NUMBER rows only.
-- Accurate per-parameter values (Bed Side Monitor = 5, Tensimeter = 1, ...) are a
-- SEPARATE deferred task and are intentionally NOT populated here. RATIO/TEXT/BOOLEAN
-- rows keep decimalPlaces = NULL (not applicable).
UPDATE "DeviceCalibrationParameter"
  SET "decimalPlaces" = 2
  WHERE "valueType" = 'NUMBER' AND "decimalPlaces" IS NULL;
