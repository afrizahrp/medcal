-- AlterTable
ALTER TABLE "DeviceCalibrationParameter" ADD COLUMN "deviceTypeId" TEXT NOT NULL;

-- DropIndex
DROP INDEX "DeviceCalibrationParameter_capabilityItemId_code_key";

-- CreateIndex
CREATE INDEX "DeviceCalibrationParameter_deviceTypeId_idx" ON "DeviceCalibrationParameter"("deviceTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCalibrationParameter_deviceTypeId_capabilityItemId_code_key" ON "DeviceCalibrationParameter"("deviceTypeId", "capabilityItemId", "code");

-- AddForeignKey
ALTER TABLE "DeviceCalibrationParameter" ADD CONSTRAINT "DeviceCalibrationParameter_deviceTypeId_fkey" FOREIGN KEY ("deviceTypeId") REFERENCES "DeviceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
