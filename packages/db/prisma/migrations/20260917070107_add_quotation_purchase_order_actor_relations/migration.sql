-- Adds the missing actor relations for the two `*ByUserId` columns that never had
-- one (every other actor column in the schema already does). The columns already
-- exist and are populated; this only introduces the FK constraint, so no data is
-- written, moved, or deleted. Verified beforehand: zero rows on either column hold
-- an id without a matching User row.

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
