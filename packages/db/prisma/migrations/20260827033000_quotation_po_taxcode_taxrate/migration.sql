-- Quotation: replace taxId FK (Tax.id cuid) with document-level taxCode + taxRate snapshots.
-- Cannot rename taxId → taxCode: the existing column stores Tax.id, not Tax.taxCode.

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN "taxCode" TEXT;
ALTER TABLE "Quotation" ADD COLUMN "taxRate" DECIMAL(5,4);

-- Backfill from Tax master when a quotation still points at Tax.id
UPDATE "Quotation" AS q
SET
  "taxCode" = t."taxCode",
  "taxRate" = t."taxRate"
FROM "Tax" AS t
WHERE q."taxId" = t."id";

-- DropForeignKey
ALTER TABLE "Quotation" DROP CONSTRAINT "Quotation_taxId_fkey";

-- DropIndex
DROP INDEX "Quotation_taxId_idx";

-- AlterTable
ALTER TABLE "Quotation" DROP COLUMN "taxId";

-- CreateIndex
CREATE INDEX "Quotation_companyId_taxCode_idx" ON "Quotation"("companyId", "taxCode");

-- PurchaseOrder: rename snapshot column in place; do not drop/re-add (would lose values).
ALTER TABLE "PurchaseOrder" RENAME COLUMN "taxRateSnapshot" TO "taxRate";
