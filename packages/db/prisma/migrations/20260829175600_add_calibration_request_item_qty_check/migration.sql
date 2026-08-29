-- Enforce the "positive integer" business rule for the aggregate line quantity
-- at the database level. Prisma cannot model CHECK constraints, so it is added
-- in raw SQL (same pattern as DeviceCalibrationParameter_decimalPlaces_range).
ALTER TABLE "CalibrationRequestItem"
  ADD CONSTRAINT "CalibrationRequestItem_qty_positive"
  CHECK ("qty" >= 1);
