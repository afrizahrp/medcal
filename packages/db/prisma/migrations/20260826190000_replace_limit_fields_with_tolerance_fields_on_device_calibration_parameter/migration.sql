-- DropForeignKey
ALTER TABLE "DeviceCalibrationParameter" DROP CONSTRAINT "DeviceCalibrationParameter_limitUomId_fkey";

-- DropIndex
DROP INDEX "DeviceCalibrationParameter_limitUomId_idx";

-- AlterTable
ALTER TABLE "DeviceCalibrationParameter" DROP COLUMN "limitKind",
DROP COLUMN "limitUomId",
DROP COLUMN "limitValue",
ADD COLUMN     "toleranceMax" DECIMAL(18,4),
ADD COLUMN     "toleranceMin" DECIMAL(18,4),
ADD COLUMN     "toleranceNote" TEXT;

-- DropEnum
DROP TYPE "CalibrationLimitKind";
