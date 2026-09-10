-- Physical Inspection domain: DevicePhysicalCheckItem (per-DeviceType catalog)
-- + PhysicalCheckResult (job child, attempt-scoped) + PhysicalCheckVerdict enum.
-- Additive only — no MeasurementResult / CalibrationJob column changes.
-- Design: Physical Inspection locked backend (2026-09-10).

-- CreateEnum
CREATE TYPE "PhysicalCheckVerdict" AS ENUM ('BAIK', 'TIDAK_BAIK');

-- CreateTable
CREATE TABLE "DevicePhysicalCheckItem" (
    "id" TEXT NOT NULL,
    "deviceTypeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inspectionLimit" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevicePhysicalCheckItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicalCheckResult" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "calibrationJobId" TEXT NOT NULL,
    "devicePhysicalCheckItemId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "verdict" "PhysicalCheckVerdict" NOT NULL,
    "note" TEXT,
    "inspectionLimitSnapshot" TEXT NOT NULL,
    "recordedByUserId" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhysicalCheckResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DevicePhysicalCheckItem_deviceTypeId_idx" ON "DevicePhysicalCheckItem"("deviceTypeId");

-- CreateIndex
CREATE INDEX "DevicePhysicalCheckItem_isActive_idx" ON "DevicePhysicalCheckItem"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DevicePhysicalCheckItem_deviceTypeId_code_key" ON "DevicePhysicalCheckItem"("deviceTypeId", "code");

-- CreateIndex
CREATE INDEX "PhysicalCheckResult_calibrationJobId_idx" ON "PhysicalCheckResult"("calibrationJobId");

-- CreateIndex
CREATE INDEX "PhysicalCheckResult_calibrationJobId_attemptNumber_idx" ON "PhysicalCheckResult"("calibrationJobId", "attemptNumber");

-- CreateIndex
CREATE INDEX "PhysicalCheckResult_devicePhysicalCheckItemId_idx" ON "PhysicalCheckResult"("devicePhysicalCheckItemId");

-- CreateIndex
CREATE INDEX "PhysicalCheckResult_companyId_idx" ON "PhysicalCheckResult"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "physical_check_natural_key" ON "PhysicalCheckResult"("calibrationJobId", "devicePhysicalCheckItemId", "attemptNumber");

-- AddForeignKey
ALTER TABLE "DevicePhysicalCheckItem" ADD CONSTRAINT "DevicePhysicalCheckItem_deviceTypeId_fkey" FOREIGN KEY ("deviceTypeId") REFERENCES "DeviceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalCheckResult" ADD CONSTRAINT "PhysicalCheckResult_calibrationJobId_fkey" FOREIGN KEY ("calibrationJobId") REFERENCES "CalibrationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalCheckResult" ADD CONSTRAINT "PhysicalCheckResult_devicePhysicalCheckItemId_fkey" FOREIGN KEY ("devicePhysicalCheckItemId") REFERENCES "DevicePhysicalCheckItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalCheckResult" ADD CONSTRAINT "PhysicalCheckResult_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
