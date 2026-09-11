-- AlterTable
ALTER TABLE "CalibrationRequest" ADD COLUMN     "createdByUserId" TEXT;

-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "createdByUserId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "createdByUserId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "createdByUserId" TEXT;

-- CreateIndex
CREATE INDEX "CalibrationRequest_createdByUserId_idx" ON "CalibrationRequest"("createdByUserId");

-- CreateIndex
CREATE INDEX "Certificate_createdByUserId_idx" ON "Certificate"("createdByUserId");

-- CreateIndex
CREATE INDEX "Invoice_createdByUserId_idx" ON "Invoice"("createdByUserId");

-- CreateIndex
CREATE INDEX "Payment_createdByUserId_idx" ON "Payment"("createdByUserId");

-- AddForeignKey
ALTER TABLE "CalibrationRequest" ADD CONSTRAINT "CalibrationRequest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
