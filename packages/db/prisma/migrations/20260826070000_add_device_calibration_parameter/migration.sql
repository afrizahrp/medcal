-- CreateTable
CREATE TABLE "DeviceCalibrationParameter" (
    "id" TEXT NOT NULL,
    "capabilityItemId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "uomId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceCalibrationParameter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceCalibrationParameter_capabilityItemId_idx" ON "DeviceCalibrationParameter"("capabilityItemId");

-- CreateIndex
CREATE INDEX "DeviceCalibrationParameter_uomId_idx" ON "DeviceCalibrationParameter"("uomId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCalibrationParameter_capabilityItemId_code_key" ON "DeviceCalibrationParameter"("capabilityItemId", "code");

-- AddForeignKey
ALTER TABLE "DeviceCalibrationParameter" ADD CONSTRAINT "DeviceCalibrationParameter_capabilityItemId_fkey" FOREIGN KEY ("capabilityItemId") REFERENCES "DeviceCapabilityItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCalibrationParameter" ADD CONSTRAINT "DeviceCalibrationParameter_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
