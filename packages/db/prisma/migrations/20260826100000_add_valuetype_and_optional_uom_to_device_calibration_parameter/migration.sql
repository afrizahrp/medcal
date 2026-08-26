-- CreateEnum
CREATE TYPE "CalibrationValueType" AS ENUM ('NUMBER', 'RATIO', 'TEXT', 'BOOLEAN');

-- DropForeignKey
ALTER TABLE "DeviceCalibrationParameter" DROP CONSTRAINT "DeviceCalibrationParameter_uomId_fkey";

-- AlterTable
ALTER TABLE "DeviceCalibrationParameter" ADD COLUMN     "valueType" "CalibrationValueType" NOT NULL DEFAULT 'NUMBER',
ALTER COLUMN "uomId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "DeviceCalibrationParameter" ADD CONSTRAINT "DeviceCalibrationParameter_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "Uom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "DeviceCalibrationParameter_deviceTypeId_capabilityItemId_code_k" RENAME TO "DeviceCalibrationParameter_deviceTypeId_capabilityItemId_co_key";
