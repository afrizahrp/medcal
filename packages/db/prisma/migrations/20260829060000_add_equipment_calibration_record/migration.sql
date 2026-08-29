-- Phase 2B — Equipment Calibration Record + Evidence. Additive only.
-- No existing table/column touched, no data modified.

-- CreateEnum
CREATE TYPE "EquipmentCalibrationRecordStatus" AS ENUM ('DRAFT', 'CONFIRMED');

-- CreateTable
CREATE TABLE "EquipmentCalibrationRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "calibrationDate" DATE NOT NULL,
    "validFrom" DATE,
    "validUntil" DATE NOT NULL,
    "certificateNumber" TEXT,
    "provider" TEXT,
    "result" TEXT,
    "remarks" TEXT,
    "acceptedForUse" BOOLEAN NOT NULL DEFAULT false,
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "acceptanceNotes" TEXT,
    "status" "EquipmentCalibrationRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentCalibrationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquipmentCalibrationRecord_equipmentId_calibrationDate_idx" ON "EquipmentCalibrationRecord"("equipmentId", "calibrationDate");

-- CreateIndex
CREATE INDEX "EquipmentCalibrationRecord_equipmentId_validUntil_idx" ON "EquipmentCalibrationRecord"("equipmentId", "validUntil");

-- CreateIndex
CREATE INDEX "EquipmentCalibrationRecord_companyId_status_idx" ON "EquipmentCalibrationRecord"("companyId", "status");

-- AddForeignKey
ALTER TABLE "EquipmentCalibrationRecord" ADD CONSTRAINT "EquipmentCalibrationRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentCalibrationRecord" ADD CONSTRAINT "EquipmentCalibrationRecord_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentCalibrationRecord" ADD CONSTRAINT "EquipmentCalibrationRecord_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentCalibrationRecord" ADD CONSTRAINT "EquipmentCalibrationRecord_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
