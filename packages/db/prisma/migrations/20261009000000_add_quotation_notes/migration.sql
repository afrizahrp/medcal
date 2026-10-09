-- Free-text remarks on a quotation (and its history snapshot). Nullable: existing rows have none.
ALTER TABLE "Quotation" ADD COLUMN "notes" TEXT;
ALTER TABLE "QuotationHistory" ADD COLUMN "notes" TEXT;
