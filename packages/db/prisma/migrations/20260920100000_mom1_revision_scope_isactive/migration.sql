-- AlterTable
ALTER TABLE "CalibrationRequestItem" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;
