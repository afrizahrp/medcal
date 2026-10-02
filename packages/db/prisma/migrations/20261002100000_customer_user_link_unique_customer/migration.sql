-- One Customer has at most one approved Customer Portal user.
--
-- Fails (and changes nothing) if any Customer already has more than one
-- CustomerUserLink. Resolve those rows by hand first; this migration does not
-- delete or merge existing links.

-- DropIndex
DROP INDEX "CustomerUserLink_customerId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "CustomerUserLink_customerId_key" ON "CustomerUserLink"("customerId");
