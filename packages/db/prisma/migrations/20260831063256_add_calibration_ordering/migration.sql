-- AlterTable
ALTER TABLE "DeviceCalibrationParameter" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DeviceTypeCapabilityOrder" (
    "id" TEXT NOT NULL,
    "deviceTypeId" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceTypeCapabilityOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceTypeCapabilityOrder_deviceTypeId_idx" ON "DeviceTypeCapabilityOrder"("deviceTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceTypeCapabilityOrder_deviceTypeId_capabilityId_key" ON "DeviceTypeCapabilityOrder"("deviceTypeId", "capabilityId");

-- AddForeignKey
ALTER TABLE "DeviceTypeCapabilityOrder" ADD CONSTRAINT "DeviceTypeCapabilityOrder_deviceTypeId_fkey" FOREIGN KEY ("deviceTypeId") REFERENCES "DeviceType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceTypeCapabilityOrder" ADD CONSTRAINT "DeviceTypeCapabilityOrder_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "DeviceCapability"("id") ON DELETE CASCADE ON UPDATE CASCADE;
