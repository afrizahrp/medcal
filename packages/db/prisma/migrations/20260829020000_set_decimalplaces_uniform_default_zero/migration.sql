-- Revise the uniform decimalPlaces backfill from 2 to 0 for all NUMBER-type
-- calibration parameters. The prior migration
-- (20260829010628_add_decimalplaces_to_device_calibration_parameter) seeded 2 as
-- the placeholder; 0 is now the agreed safe uniform default. RATIO/TEXT/BOOLEAN
-- rows keep decimalPlaces = NULL (not applicable). Accurate per-parameter values
-- (Bed Side Monitor = 5, Tensimeter = 1, ...) remain a separate follow-up task.
UPDATE "DeviceCalibrationParameter"
  SET "decimalPlaces" = 0
  WHERE "valueType" = 'NUMBER' AND "decimalPlaces" = 2;
