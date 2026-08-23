/*
  Warnings:

  - You are about to alter the column `seq` on the `ChatMessage` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.

*/
-- AlterTable



ALTER TABLE "ChatMessage"
ALTER COLUMN "seq" SET DATA TYPE INTEGER
USING "seq"::INTEGER;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "taxId" TEXT;

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "taxId" TEXT;

-- CreateTable
CREATE TABLE "Tax" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "taxCode" TEXT NOT NULL,
    "taxRate" DECIMAL(5,4) NOT NULL,
    "description" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tax_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tax_companyId_taxCode_key" ON "Tax"("companyId", "taxCode");

-- CreateIndex
CREATE INDEX "Invoice_taxId_idx" ON "Invoice"("taxId");

-- CreateIndex
CREATE INDEX "Quotation_taxId_idx" ON "Quotation"("taxId");

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tax" ADD CONSTRAINT "Tax_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE;
