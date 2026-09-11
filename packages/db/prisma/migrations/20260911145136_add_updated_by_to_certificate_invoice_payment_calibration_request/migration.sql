/*
  Warnings:

  - Added the required column `updatedAt` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CalibrationRequest" ADD COLUMN     "updatedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "updatedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "updatedByUserId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updatedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "CalibrationRequest_updatedByUserId_idx" ON "CalibrationRequest"("updatedByUserId");

-- CreateIndex
CREATE INDEX "Certificate_updatedByUserId_idx" ON "Certificate"("updatedByUserId");

-- CreateIndex
CREATE INDEX "Invoice_updatedByUserId_idx" ON "Invoice"("updatedByUserId");

-- CreateIndex
CREATE INDEX "Payment_updatedByUserId_idx" ON "Payment"("updatedByUserId");

-- AddForeignKey
ALTER TABLE "CalibrationRequest" ADD CONSTRAINT "CalibrationRequest_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
