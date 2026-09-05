-- DropIndex
DROP INDEX "JobReferenceEquipmentUsed_calibrationJobId_idx";

-- AlterTable
ALTER TABLE "JobReferenceEquipmentUsed" DROP COLUMN "brand",
DROP COLUMN "equipmentName",
DROP COLUMN "model",
DROP COLUMN "serialNumber",
ADD COLUMN     "companyId" TEXT NOT NULL,
ADD COLUMN     "equipmentCalibrationRecordId" TEXT,
ADD COLUMN     "equipmentId" TEXT NOT NULL,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "overriddenAt" TIMESTAMP(3),
ADD COLUMN     "overriddenByUserId" TEXT,
ADD COLUMN     "overrideReason" TEXT,
ADD COLUMN     "validityOverridden" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "JobReferenceEquipmentUsed_companyId_equipmentId_idx" ON "JobReferenceEquipmentUsed"("companyId", "equipmentId");

-- CreateIndex
CREATE INDEX "JobReferenceEquipmentUsed_equipmentCalibrationRecordId_idx" ON "JobReferenceEquipmentUsed"("equipmentCalibrationRecordId");

-- CreateIndex
CREATE INDEX "JobReferenceEquipmentUsed_overriddenByUserId_idx" ON "JobReferenceEquipmentUsed"("overriddenByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "JobReferenceEquipmentUsed_calibrationJobId_equipmentId_key" ON "JobReferenceEquipmentUsed"("calibrationJobId", "equipmentId");

-- AddForeignKey
ALTER TABLE "JobReferenceEquipmentUsed" ADD CONSTRAINT "JobReferenceEquipmentUsed_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobReferenceEquipmentUsed" ADD CONSTRAINT "JobReferenceEquipmentUsed_equipmentCalibrationRecordId_fkey" FOREIGN KEY ("equipmentCalibrationRecordId") REFERENCES "EquipmentCalibrationRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobReferenceEquipmentUsed" ADD CONSTRAINT "JobReferenceEquipmentUsed_overriddenByUserId_fkey" FOREIGN KEY ("overriddenByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

