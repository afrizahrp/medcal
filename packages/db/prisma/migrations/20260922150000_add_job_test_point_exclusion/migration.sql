-- Explicit per-job worksheet revision (soft-exclude). Master isActive must not
-- mutate started-job snapshots. Completeness/Tech-PWA use excludedAt IS NULL.

-- AlterTable
ALTER TABLE "JobCalibrationTestPoint" ADD COLUMN "excludedAt" TIMESTAMP(3);
ALTER TABLE "JobCalibrationTestPoint" ADD COLUMN "excludedByUserId" TEXT;
ALTER TABLE "JobCalibrationTestPoint" ADD COLUMN "exclusionReason" TEXT;

-- AddForeignKey
ALTER TABLE "JobCalibrationTestPoint" ADD CONSTRAINT "JobCalibrationTestPoint_excludedByUserId_fkey" FOREIGN KEY ("excludedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
