-- CreateEnum
CREATE TYPE "AkdAklGateOrigin" AS ENUM ('AUTO_MISMATCH', 'MANUAL_ESCALATION');

-- AlterTable
ALTER TABLE "CalibrationJob" ADD COLUMN     "akdAklGateOpenedBy" "AkdAklGateOrigin";
