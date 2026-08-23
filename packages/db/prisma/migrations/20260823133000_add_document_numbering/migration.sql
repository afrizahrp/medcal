-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CUSTOMER', 'CALIBRATION_REQUEST', 'QUOTATION', 'PURCHASE_ORDER', 'WORK_ORDER');

-- CreateTable
CREATE TABLE "DocumentNumberSequence" (
    "id" TEXT NOT NULL,
    "companyId" CHAR(3) NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "prefix" CHAR(3) NOT NULL,
    "year" INTEGER NOT NULL,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentNumberSequence_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add business number columns (nullable first for safe rollout)
ALTER TABLE "Customer" ADD COLUMN "number" TEXT;
ALTER TABLE "CalibrationRequest" ADD COLUMN "number" TEXT;
ALTER TABLE "Quotation" ADD COLUMN "number" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DocumentNumberSequence_companyId_documentType_year_key" ON "DocumentNumberSequence"("companyId", "documentType", "year");
CREATE INDEX "DocumentNumberSequence_companyId_documentType_idx" ON "DocumentNumberSequence"("companyId", "documentType");

CREATE UNIQUE INDEX "Customer_companyId_number_key" ON "Customer"("companyId", "number");
CREATE UNIQUE INDEX "CalibrationRequest_companyId_number_key" ON "CalibrationRequest"("companyId", "number");
CREATE UNIQUE INDEX "Quotation_companyId_number_key" ON "Quotation"("companyId", "number");

-- AddForeignKey
ALTER TABLE "DocumentNumberSequence" ADD CONSTRAINT "DocumentNumberSequence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce NOT NULL only when tables have no existing rows (preserves legacy rows untouched)
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "Customer") = 0 THEN
    ALTER TABLE "Customer" ALTER COLUMN "number" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "CalibrationRequest") = 0 THEN
    ALTER TABLE "CalibrationRequest" ALTER COLUMN "number" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "Quotation") = 0 THEN
    ALTER TABLE "Quotation" ALTER COLUMN "number" SET NOT NULL;
  END IF;
END $$;
