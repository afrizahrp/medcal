-- DropForeignKey
ALTER TABLE "CalibrationRequestItem" DROP CONSTRAINT "CalibrationRequestItem_deviceId_fkey";

-- AlterTable
ALTER TABLE "CalibrationRequestItem" ADD COLUMN "deviceTypeId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "CalibrationRequestItem_deviceTypeId_idx" ON "CalibrationRequestItem"("deviceTypeId");

-- AddForeignKey
ALTER TABLE "CalibrationRequestItem" ADD CONSTRAINT "CalibrationRequestItem_deviceTypeId_fkey" FOREIGN KEY ("deviceTypeId") REFERENCES "DeviceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
