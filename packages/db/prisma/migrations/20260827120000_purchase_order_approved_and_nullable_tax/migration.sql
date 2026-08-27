-- PurchaseOrder MVP: add APPROVED workflow status and allow null tax
-- snapshots so PO can copy Quotation.taxCode/taxRate/taxAmount as-is.

-- AlterEnum
DO $$
BEGIN
  ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'APPROVED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "PurchaseOrder" ALTER COLUMN "taxCode" DROP NOT NULL;
ALTER TABLE "PurchaseOrder" ALTER COLUMN "taxRate" DROP NOT NULL;
ALTER TABLE "PurchaseOrder" ALTER COLUMN "taxAmount" DROP NOT NULL;
