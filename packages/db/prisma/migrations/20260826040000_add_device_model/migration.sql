-- CreateTable
CREATE TABLE "DeviceModel" (
    "id" TEXT NOT NULL,
    "deviceTypeId" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceModel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceModel_deviceTypeId_idx" ON "DeviceModel"("deviceTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceModel_deviceTypeId_manufacturer_model_key" ON "DeviceModel"("deviceTypeId", "manufacturer", "model");

-- AddForeignKey
ALTER TABLE "DeviceModel" ADD CONSTRAINT "DeviceModel_deviceTypeId_fkey" FOREIGN KEY ("deviceTypeId") REFERENCES "DeviceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
