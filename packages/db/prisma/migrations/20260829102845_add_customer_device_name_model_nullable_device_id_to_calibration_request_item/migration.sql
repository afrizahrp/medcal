-- AlterTable
ALTER TABLE "CalibrationRequestItem" ADD COLUMN     "customerDeviceName" TEXT,
ADD COLUMN     "model" TEXT,
ALTER COLUMN "deviceId" DROP NOT NULL;
