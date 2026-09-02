-- CreateEnum
CREATE TYPE "AkdAklApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "CalibrationJob" ADD COLUMN     "akdAklApprovalStatus" "AkdAklApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "akdAklApprovedAt" TIMESTAMP(3),
ADD COLUMN     "akdAklApprovedByUserId" TEXT,
ADD COLUMN     "akdAklDecisionNote" TEXT,
ADD COLUMN     "calibrationRequestItemId" TEXT,
ADD COLUMN     "customerDeclaredDeviceName" TEXT,
ADD COLUMN     "technicianObservedAkdAkl" TEXT,
ADD COLUMN     "technicianObservedSerial" TEXT,
ALTER COLUMN "deviceId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "CalibrationJob_calibrationRequestItemId_idx" ON "CalibrationJob"("calibrationRequestItemId");

-- CreateIndex
CREATE INDEX "CalibrationJob_companyId_akdAklApprovalStatus_idx" ON "CalibrationJob"("companyId", "akdAklApprovalStatus");

-- CreateIndex
CREATE INDEX "CalibrationJob_akdAklApprovedByUserId_idx" ON "CalibrationJob"("akdAklApprovedByUserId");

-- AddForeignKey
ALTER TABLE "CalibrationJob" ADD CONSTRAINT "CalibrationJob_calibrationRequestItemId_fkey" FOREIGN KEY ("calibrationRequestItemId") REFERENCES "CalibrationRequestItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationJob" ADD CONSTRAINT "CalibrationJob_akdAklApprovedByUserId_fkey" FOREIGN KEY ("akdAklApprovedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
