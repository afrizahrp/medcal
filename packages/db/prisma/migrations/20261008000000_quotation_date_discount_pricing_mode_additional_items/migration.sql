-- Quotation date + bidirectional header discount + Customer.pricingMode +
-- commercial additional items (catalog -> quotation snapshot -> PO snapshot).
-- Decisions: docs/audits/quotation-requirements-audit-report.md (Revision 2).
--
-- Structure (each step deterministic; rollback = drop the new tables, columns
-- and enums, no applied migration is modified):
--   1. enums
--   2. Customer.pricingMode (default STANDARD -> no data change)
--   3. Quotation/QuotationHistory.quotationDate: add NULLABLE -> backfill from
--      createdAt as the Asia/Jakarta calendar day -> SET NOT NULL (no fallback)
--   4. headerDiscountPercent / headerDiscountInputMode on the four header tables
--      (percent backfilled from the existing amount; mode stays AMOUNT)
--   5. new tables + indexes + foreign keys + CHECK constraints

-- CreateEnum
CREATE TYPE "CustomerPricingMode" AS ENUM ('STANDARD', 'MANUAL');

-- CreateEnum
CREATE TYPE "DiscountInputMode" AS ENUM ('AMOUNT', 'PERCENT');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "pricingMode" "CustomerPricingMode" NOT NULL DEFAULT 'STANDARD';

-- AlterTable: quotationDate (nullable first, so existing rows can be backfilled)
ALTER TABLE "Quotation" ADD COLUMN "quotationDate" DATE;
ALTER TABLE "QuotationHistory" ADD COLUMN "quotationDate" DATE;

-- Backfill. "createdAt" is a UTC `timestamp(3)` (Prisma); interpret it as UTC,
-- convert to Asia/Jakarta wall-clock, then take the calendar day.
UPDATE "Quotation"
SET "quotationDate" = (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date;

-- A revision never changes the quotation date, so every history row carries its
-- parent quotation's date.
UPDATE "QuotationHistory" h
SET "quotationDate" = q."quotationDate"
FROM "Quotation" q
WHERE q."id" = h."quotationId";

ALTER TABLE "Quotation" ALTER COLUMN "quotationDate" SET NOT NULL;
ALTER TABLE "QuotationHistory" ALTER COLUMN "quotationDate" SET NOT NULL;

-- AlterTable: bidirectional header discount
ALTER TABLE "Quotation" ADD COLUMN     "headerDiscountInputMode" "DiscountInputMode" NOT NULL DEFAULT 'AMOUNT',
ADD COLUMN     "headerDiscountPercent" DECIMAL(7,4) NOT NULL DEFAULT 0;

ALTER TABLE "QuotationHistory" ADD COLUMN     "headerDiscountInputMode" "DiscountInputMode" NOT NULL DEFAULT 'AMOUNT',
ADD COLUMN     "headerDiscountPercent" DECIMAL(7,4) NOT NULL DEFAULT 0;

ALTER TABLE "PurchaseOrder" ADD COLUMN     "headerDiscountInputMode" "DiscountInputMode" NOT NULL DEFAULT 'AMOUNT',
ADD COLUMN     "headerDiscountPercent" DECIMAL(7,4) NOT NULL DEFAULT 0;

ALTER TABLE "PurchaseOrderHistory" ADD COLUMN     "headerDiscountInputMode" "DiscountInputMode" NOT NULL DEFAULT 'AMOUNT',
ADD COLUMN     "headerDiscountPercent" DECIMAL(7,4) NOT NULL DEFAULT 0;

-- Backfill percent = amount / subtotal * 100 (4 dp, half-up). Existing rows are
-- amount-entered, so their input mode stays AMOUNT.
UPDATE "Quotation" SET "headerDiscountPercent" = ROUND("headerDiscountAmount" / "subtotal" * 100, 4)
WHERE "subtotal" > 0 AND "headerDiscountAmount" > 0;
UPDATE "QuotationHistory" SET "headerDiscountPercent" = ROUND("headerDiscountAmount" / "subtotal" * 100, 4)
WHERE "subtotal" > 0 AND "headerDiscountAmount" > 0;
UPDATE "PurchaseOrder" SET "headerDiscountPercent" = ROUND("headerDiscountAmount" / "subtotal" * 100, 4)
WHERE "subtotal" > 0 AND "headerDiscountAmount" > 0;
UPDATE "PurchaseOrderHistory" SET "headerDiscountPercent" = ROUND("headerDiscountAmount" / "subtotal" * 100, 4)
WHERE "subtotal" > 0 AND "headerDiscountAmount" > 0;

-- CreateTable
CREATE TABLE "AdditionalItemType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitLabel" TEXT NOT NULL,
    "defaultUnitPrice" DECIMAL(18,2),
    "serviceMode" "ServiceMode",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdditionalItemType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationAdditionalItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "additionalItemTypeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unitLabel" TEXT NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotationAdditionalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderAdditionalItem" (
    "id" TEXT NOT NULL,
    "companyId" CHAR(3) NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "quotationAdditionalItemId" TEXT NOT NULL,
    "additionalItemTypeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unitLabel" TEXT NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrderAdditionalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationAdditionalItemHistory" (
    "id" TEXT NOT NULL,
    "historyId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "additionalItemTypeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unitLabel" TEXT NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "discountAmount" DECIMAL(18,2) NOT NULL,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "QuotationAdditionalItemHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderAdditionalItemHistory" (
    "id" TEXT NOT NULL,
    "historyId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "quotationAdditionalItemId" TEXT NOT NULL,
    "additionalItemTypeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unitLabel" TEXT NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "discountAmount" DECIMAL(18,2) NOT NULL,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "PurchaseOrderAdditionalItemHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdditionalItemType_companyId_isActive_idx" ON "AdditionalItemType"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AdditionalItemType_companyId_code_key" ON "AdditionalItemType"("companyId", "code");

-- CreateIndex
CREATE INDEX "QuotationAdditionalItem_quotationId_idx" ON "QuotationAdditionalItem"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationAdditionalItem_additionalItemTypeId_idx" ON "QuotationAdditionalItem"("additionalItemTypeId");

-- CreateIndex
CREATE INDEX "PurchaseOrderAdditionalItem_purchaseOrderId_idx" ON "PurchaseOrderAdditionalItem"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderAdditionalItem_quotationAdditionalItemId_idx" ON "PurchaseOrderAdditionalItem"("quotationAdditionalItemId");

-- CreateIndex
CREATE INDEX "PurchaseOrderAdditionalItem_additionalItemTypeId_idx" ON "PurchaseOrderAdditionalItem"("additionalItemTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderAdditionalItem_purchaseOrderId_quotationAdditi_key" ON "PurchaseOrderAdditionalItem"("purchaseOrderId", "quotationAdditionalItemId");

-- CreateIndex
CREATE INDEX "QuotationAdditionalItemHistory_historyId_idx" ON "QuotationAdditionalItemHistory"("historyId");

-- CreateIndex
CREATE INDEX "PurchaseOrderAdditionalItemHistory_historyId_idx" ON "PurchaseOrderAdditionalItemHistory"("historyId");

-- AddForeignKey
ALTER TABLE "AdditionalItemType" ADD CONSTRAINT "AdditionalItemType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdditionalItemType" ADD CONSTRAINT "AdditionalItemType_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationAdditionalItem" ADD CONSTRAINT "QuotationAdditionalItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationAdditionalItem" ADD CONSTRAINT "QuotationAdditionalItem_additionalItemTypeId_fkey" FOREIGN KEY ("additionalItemTypeId") REFERENCES "AdditionalItemType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationAdditionalItem" ADD CONSTRAINT "QuotationAdditionalItem_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderAdditionalItem" ADD CONSTRAINT "PurchaseOrderAdditionalItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderAdditionalItem" ADD CONSTRAINT "PurchaseOrderAdditionalItem_quotationAdditionalItemId_fkey" FOREIGN KEY ("quotationAdditionalItemId") REFERENCES "QuotationAdditionalItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderAdditionalItem" ADD CONSTRAINT "PurchaseOrderAdditionalItem_additionalItemTypeId_fkey" FOREIGN KEY ("additionalItemTypeId") REFERENCES "AdditionalItemType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderAdditionalItem" ADD CONSTRAINT "PurchaseOrderAdditionalItem_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationAdditionalItemHistory" ADD CONSTRAINT "QuotationAdditionalItemHistory_historyId_fkey" FOREIGN KEY ("historyId") REFERENCES "QuotationHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderAdditionalItemHistory" ADD CONSTRAINT "PurchaseOrderAdditionalItemHistory_historyId_fkey" FOREIGN KEY ("historyId") REFERENCES "PurchaseOrderHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CHECK constraints (defence in depth; the service validates first). Precedent:
-- CalibrationRequestItem.qty >= 1.
ALTER TABLE "QuotationAdditionalItem"
  ADD CONSTRAINT "QuotationAdditionalItem_qty_positive" CHECK ("qty" > 0),
  ADD CONSTRAINT "QuotationAdditionalItem_unitPrice_positive" CHECK ("unitPrice" > 0),
  ADD CONSTRAINT "QuotationAdditionalItem_discountAmount_nonnegative" CHECK ("discountAmount" >= 0);

ALTER TABLE "PurchaseOrderAdditionalItem"
  ADD CONSTRAINT "PurchaseOrderAdditionalItem_qty_positive" CHECK ("qty" > 0),
  ADD CONSTRAINT "PurchaseOrderAdditionalItem_unitPrice_positive" CHECK ("unitPrice" > 0),
  ADD CONSTRAINT "PurchaseOrderAdditionalItem_discountAmount_nonnegative" CHECK ("discountAmount" >= 0);

ALTER TABLE "Quotation"
  ADD CONSTRAINT "Quotation_headerDiscountPercent_range" CHECK ("headerDiscountPercent" >= 0 AND "headerDiscountPercent" <= 100);
ALTER TABLE "PurchaseOrder"
  ADD CONSTRAINT "PurchaseOrder_headerDiscountPercent_range" CHECK ("headerDiscountPercent" >= 0 AND "headerDiscountPercent" <= 100);
