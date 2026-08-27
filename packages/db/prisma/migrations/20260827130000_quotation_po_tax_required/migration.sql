-- Tax is required on finalized commercial documents.
-- T0 (Non PPN, 0%) is the official representation of a non-taxable document.
-- NULL means "tax has not been selected" and is no longer a valid stored state.

-- Ensure T0 exists for companies that still have null tax on Quotation or PurchaseOrder.
INSERT INTO "Tax" (
  "id",
  "companyId",
  "taxCode",
  "description",
  "taxRate",
  "isExclude",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  't0seed_' || missing."companyId",
  missing."companyId",
  'T0',
  'Non PPN',
  0,
  false,
  true,
  NOW(),
  NOW()
FROM (
  SELECT DISTINCT "companyId" FROM "Quotation"
  WHERE "taxCode" IS NULL OR "taxRate" IS NULL OR "taxAmount" IS NULL
  UNION
  SELECT DISTINCT "companyId" FROM "PurchaseOrder"
  WHERE "taxCode" IS NULL OR "taxRate" IS NULL OR "taxAmount" IS NULL
) AS missing
WHERE NOT EXISTS (
  SELECT 1
  FROM "Tax" AS t
  WHERE t."companyId" = missing."companyId"
    AND t."taxCode" = 'T0'
);

-- Backfill Quotation rows that never selected a tax to T0.
UPDATE "Quotation" AS q
SET
  "taxCode" = t."taxCode",
  "taxRate" = t."taxRate",
  "taxAmount" = COALESCE(q."taxAmount", 0)
FROM "Tax" AS t
WHERE q."companyId" = t."companyId"
  AND t."taxCode" = 'T0'
  AND q."taxCode" IS NULL;

-- Fill remaining Quotation taxRate/taxAmount from the selected Tax master.
UPDATE "Quotation" AS q
SET
  "taxRate" = COALESCE(q."taxRate", t."taxRate"),
  "taxAmount" = COALESCE(q."taxAmount", 0)
FROM "Tax" AS t
WHERE q."companyId" = t."companyId"
  AND q."taxCode" = t."taxCode"
  AND (q."taxRate" IS NULL OR q."taxAmount" IS NULL);

-- Snapshot PurchaseOrder tax from its Quotation.
UPDATE "PurchaseOrder" AS po
SET
  "taxCode" = q."taxCode",
  "taxRate" = q."taxRate",
  "taxAmount" = q."taxAmount"
FROM "Quotation" AS q
WHERE po."quotationId" = q."id"
  AND (po."taxCode" IS NULL OR po."taxRate" IS NULL OR po."taxAmount" IS NULL);

-- Fallback remaining PurchaseOrder null tax to T0.
UPDATE "PurchaseOrder" AS po
SET
  "taxCode" = t."taxCode",
  "taxRate" = t."taxRate",
  "taxAmount" = COALESCE(po."taxAmount", 0)
FROM "Tax" AS t
WHERE po."companyId" = t."companyId"
  AND t."taxCode" = 'T0'
  AND (po."taxCode" IS NULL OR po."taxRate" IS NULL OR po."taxAmount" IS NULL);

-- AlterTable
ALTER TABLE "Quotation" ALTER COLUMN "taxCode" SET NOT NULL;
ALTER TABLE "Quotation" ALTER COLUMN "taxRate" SET NOT NULL;
ALTER TABLE "Quotation" ALTER COLUMN "taxAmount" SET NOT NULL;

ALTER TABLE "PurchaseOrder" ALTER COLUMN "taxCode" SET NOT NULL;
ALTER TABLE "PurchaseOrder" ALTER COLUMN "taxRate" SET NOT NULL;
ALTER TABLE "PurchaseOrder" ALTER COLUMN "taxAmount" SET NOT NULL;
