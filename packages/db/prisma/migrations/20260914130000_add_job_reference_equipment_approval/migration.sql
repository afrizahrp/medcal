-- CreateEnum
CREATE TYPE "JobReferenceEquipmentApprovalStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "JobReferenceEquipmentValiditySnapshot" AS ENUM ('VALID', 'EXPIRED', 'NOT_YET_VALID', 'NO_RECORD', 'NOT_ACCEPTED_FOR_USE');

-- CreateTable
CREATE TABLE "JobReferenceEquipmentApproval" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "calibrationJobId" TEXT NOT NULL,
    "status" "JobReferenceEquipmentApprovalStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "submittedByUserId" TEXT NOT NULL,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decision" "ReviewDecision",
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobReferenceEquipmentApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobReferenceEquipmentApprovalItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "equipmentCalibrationRecordId" TEXT,
    "validityStatus" "JobReferenceEquipmentValiditySnapshot" NOT NULL,
    "requiresOverride" BOOLEAN NOT NULL,
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobReferenceEquipmentApprovalItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobReferenceEquipmentApproval_companyId_status_idx" ON "JobReferenceEquipmentApproval"("companyId", "status");

-- CreateIndex
CREATE INDEX "JobReferenceEquipmentApproval_calibrationJobId_idx" ON "JobReferenceEquipmentApproval"("calibrationJobId");

-- CreateIndex
CREATE INDEX "JobReferenceEquipmentApproval_submittedByUserId_idx" ON "JobReferenceEquipmentApproval"("submittedByUserId");

-- CreateIndex
CREATE INDEX "JobReferenceEquipmentApproval_decidedByUserId_idx" ON "JobReferenceEquipmentApproval"("decidedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "JobReferenceEquipmentApprovalItem_approvalId_equipmentId_key" ON "JobReferenceEquipmentApprovalItem"("approvalId", "equipmentId");

-- CreateIndex
CREATE INDEX "JobReferenceEquipmentApprovalItem_companyId_idx" ON "JobReferenceEquipmentApprovalItem"("companyId");

-- CreateIndex
CREATE INDEX "JobReferenceEquipmentApprovalItem_equipmentId_idx" ON "JobReferenceEquipmentApprovalItem"("equipmentId");

-- CreateIndex
CREATE INDEX "JobReferenceEquipmentApprovalItem_equipmentCalibrationRecordId_idx" ON "JobReferenceEquipmentApprovalItem"("equipmentCalibrationRecordId");

-- AddForeignKey
ALTER TABLE "JobReferenceEquipmentApproval" ADD CONSTRAINT "JobReferenceEquipmentApproval_calibrationJobId_fkey" FOREIGN KEY ("calibrationJobId") REFERENCES "CalibrationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobReferenceEquipmentApproval" ADD CONSTRAINT "JobReferenceEquipmentApproval_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobReferenceEquipmentApproval" ADD CONSTRAINT "JobReferenceEquipmentApproval_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobReferenceEquipmentApprovalItem" ADD CONSTRAINT "JobReferenceEquipmentApprovalItem_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "JobReferenceEquipmentApproval"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobReferenceEquipmentApprovalItem" ADD CONSTRAINT "JobReferenceEquipmentApprovalItem_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobReferenceEquipmentApprovalItem" ADD CONSTRAINT "JobReferenceEquipmentApprovalItem_equipmentCalibrationRecordId_fkey" FOREIGN KEY ("equipmentCalibrationRecordId") REFERENCES "EquipmentCalibrationRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
