-- Additional items: add an optional second multiplier (e.g. "3 orang x 2 hari") and remove the
-- per-additional-item line discount (the quotation-level header discount remains).
--
-- lineTotal = round(unitPrice x qty x (multiplier ?? 1)); the backend calculates it.
-- Existing rows keep qty and unitPrice, get multiplier NULL (a plain qty line), and
-- their stored lineTotal already equals qty x unitPrice because no line discount was set.

-- Safety guard: refuse to silently drop real discount data. (The feature is days old; if this
-- fires, remove/redo the affected additional-item lines first, then re-run.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "QuotationAdditionalItem" WHERE "discountAmount" <> 0)
     OR EXISTS (SELECT 1 FROM "PurchaseOrderAdditionalItem" WHERE "discountAmount" <> 0)
     OR EXISTS (SELECT 1 FROM "QuotationAdditionalItemHistory" WHERE "discountAmount" <> 0)
     OR EXISTS (SELECT 1 FROM "PurchaseOrderAdditionalItemHistory" WHERE "discountAmount" <> 0) THEN
    RAISE EXCEPTION 'Additional-item line discounts exist; they cannot be dropped silently. Clear them first.';
  END IF;
END $$;

-- Catalog: optional label of the second multiplier (NULL = simple qty).
ALTER TABLE "AdditionalItemType" ADD COLUMN "multiplierLabel" TEXT;

-- Quotation / PO snapshots (+ their history snapshots).
ALTER TABLE "QuotationAdditionalItem"
  ADD COLUMN "multiplier" DECIMAL(18,4),
  ADD COLUMN "multiplierLabel" TEXT,
  DROP COLUMN "discountAmount";
ALTER TABLE "PurchaseOrderAdditionalItem"
  ADD COLUMN "multiplier" DECIMAL(18,4),
  ADD COLUMN "multiplierLabel" TEXT,
  DROP COLUMN "discountAmount";
ALTER TABLE "QuotationAdditionalItemHistory"
  ADD COLUMN "multiplier" DECIMAL(18,4),
  ADD COLUMN "multiplierLabel" TEXT,
  DROP COLUMN "discountAmount";
ALTER TABLE "PurchaseOrderAdditionalItemHistory"
  ADD COLUMN "multiplier" DECIMAL(18,4),
  ADD COLUMN "multiplierLabel" TEXT,
  DROP COLUMN "discountAmount";

-- The multiplier and its label exist together or not at all; a multiplier is positive.
ALTER TABLE "QuotationAdditionalItem"
  ADD CONSTRAINT "QuotationAdditionalItem_multiplier_positive" CHECK ("multiplier" IS NULL OR "multiplier" > 0),
  ADD CONSTRAINT "QuotationAdditionalItem_multiplier_label_pair" CHECK (("multiplier" IS NULL) = ("multiplierLabel" IS NULL));
ALTER TABLE "PurchaseOrderAdditionalItem"
  ADD CONSTRAINT "PurchaseOrderAdditionalItem_multiplier_positive" CHECK ("multiplier" IS NULL OR "multiplier" > 0),
  ADD CONSTRAINT "PurchaseOrderAdditionalItem_multiplier_label_pair" CHECK (("multiplier" IS NULL) = ("multiplierLabel" IS NULL));
