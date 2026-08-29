-- CreateTable
CREATE TABLE "DeviceTypeAlias" (
    "id" TEXT NOT NULL,
    "deviceTypeId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceTypeAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceTypeAlias_deviceTypeId_idx" ON "DeviceTypeAlias"("deviceTypeId");

-- CreateIndex
CREATE INDEX "DeviceTypeAlias_isActive_idx" ON "DeviceTypeAlias"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceTypeAlias_normalizedAlias_key" ON "DeviceTypeAlias"("normalizedAlias");

-- AddForeignKey
ALTER TABLE "DeviceTypeAlias" ADD CONSTRAINT "DeviceTypeAlias_deviceTypeId_fkey" FOREIGN KEY ("deviceTypeId") REFERENCES "DeviceType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
