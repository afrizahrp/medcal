-- Quotation commercial model: align with PurchaseOrder snapshot fields.
-- Existing rows default to 0 so current quotations remain valid.

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN "headerDiscountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;
