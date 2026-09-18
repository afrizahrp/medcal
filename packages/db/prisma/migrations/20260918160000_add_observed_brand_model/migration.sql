-- MoM #6 — Device Identity.
-- Job-level observed identity gains Brand and Model alongside the existing
-- technicianObservedSerial. Written only by an APPROVED IdentityCorrection.
ALTER TABLE "CalibrationJob" ADD COLUMN "technicianObservedBrand" TEXT;
ALTER TABLE "CalibrationJob" ADD COLUMN "technicianObservedModel" TEXT;

-- The BA (IdentityCorrection) gains matching prev/new pairs for Brand and
-- Model, mirroring prevSerial/newSerial. Nullable: one BA may touch only some
-- attributes.
ALTER TABLE "IdentityCorrection" ADD COLUMN "prevBrand" TEXT;
ALTER TABLE "IdentityCorrection" ADD COLUMN "newBrand" TEXT;
ALTER TABLE "IdentityCorrection" ADD COLUMN "prevModel" TEXT;
ALTER TABLE "IdentityCorrection" ADD COLUMN "newModel" TEXT;

-- prevDeviceId / newDeviceId are deliberately NOT dropped: the Device assigned
-- by the WO/SPK is now locked and the active BA workflow never writes them,
-- but corrections recorded before this migration keep their historical
-- evidence and stay renderable on the BA PDF.
