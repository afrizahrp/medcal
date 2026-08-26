-- DropForeignKey
ALTER TABLE "Quotation" DROP CONSTRAINT "Quotation_requestId_fkey";

-- AlterTable
ALTER TABLE "Quotation" ALTER COLUMN "requestId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_requestId_key" ON "Quotation"("requestId");

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CalibrationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
