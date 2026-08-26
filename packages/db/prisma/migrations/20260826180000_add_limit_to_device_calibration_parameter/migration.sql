-- CreateEnum
CREATE TYPE "CalibrationLimitKind" AS ENUM ('PLUS_MINUS', 'MAX', 'MIN');

-- AlterTable
ALTER TABLE "DeviceCalibrationParameter" ADD COLUMN     "limitKind" "CalibrationLimitKind",
ADD COLUMN     "limitUomId" TEXT,
ADD COLUMN     "limitValue" DECIMAL(18,4);

-- CreateIndex
CREATE INDEX "DeviceCalibrationParameter_limitUomId_idx" ON "DeviceCalibrationParameter"("limitUomId");

-- AddForeignKey
ALTER TABLE "DeviceCalibrationParameter" ADD CONSTRAINT "DeviceCalibrationParameter_limitUomId_fkey" FOREIGN KEY ("limitUomId") REFERENCES "Uom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
