-- Tech-PWA repetition UX fix (2026-09-20).
--
-- "+ Tambah ulangan" was unconditionally offered for every measurement point,
-- including single-reading named points (e.g. Suhu Ruangan -> Awal / Akhir).
-- No existing catalog field distinguished single vs repeatable measurement
-- protocols, so this adds the minimum one.
--
-- Presentation only: does not touch MeasurementResult, CalibrationTestPoint,
-- JobCalibrationTestPoint, or replicateIndex. Default TRUE preserves today's
-- rendered behavior for every existing DeviceCalibrationParameter row exactly
-- as-is — no backfill needed, no row's visible behavior changes.

-- AlterTable
ALTER TABLE "DeviceCalibrationParameter" ADD COLUMN "allowsRepeatedReadings" BOOLEAN NOT NULL DEFAULT true;
