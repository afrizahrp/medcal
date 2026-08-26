-- AlterTable
ALTER TABLE "Device" ADD COLUMN "deviceTypeId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Device_deviceTypeId_idx" ON "Device"("deviceTypeId");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_deviceTypeId_fkey" FOREIGN KEY ("deviceTypeId") REFERENCES "DeviceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
