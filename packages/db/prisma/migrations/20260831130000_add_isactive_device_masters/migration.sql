-- AlterTable
ALTER TABLE "DeviceCalibrationParameter" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "DeviceCapability" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "DeviceCapabilityItem" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "DeviceModel" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "DeviceCalibrationParameter_isActive_idx" ON "DeviceCalibrationParameter"("isActive");

-- CreateIndex
CREATE INDEX "DeviceCapability_isActive_idx" ON "DeviceCapability"("isActive");

-- CreateIndex
CREATE INDEX "DeviceCapabilityItem_isActive_idx" ON "DeviceCapabilityItem"("isActive");

-- CreateIndex
CREATE INDEX "DeviceModel_isActive_idx" ON "DeviceModel"("isActive");
