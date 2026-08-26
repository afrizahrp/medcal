-- CreateTable
CREATE TABLE "JobReferenceEquipmentUsed" (
    "id" TEXT NOT NULL,
    "calibrationJobId" TEXT NOT NULL,
    "equipmentName" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobReferenceEquipmentUsed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobReferenceEquipmentUsed_calibrationJobId_idx" ON "JobReferenceEquipmentUsed"("calibrationJobId");

-- AddForeignKey
ALTER TABLE "JobReferenceEquipmentUsed" ADD CONSTRAINT "JobReferenceEquipmentUsed_calibrationJobId_fkey" FOREIGN KEY ("calibrationJobId") REFERENCES "CalibrationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
