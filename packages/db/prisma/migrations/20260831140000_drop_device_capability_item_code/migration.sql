-- DeviceCapabilityItem is an internal taxonomy leaf with no business identity:
-- nothing references its `code` by foreign key, no export/import/API contract
-- exposes it, and every runtime use (search, ordering, display, dedup) is a
-- redundant echo of `name`. Drop `code` entirely; key per-capability uniqueness
-- on `name` instead. Verified beforehand: all existing (capabilityId, name)
-- pairs are already distinct (case-insensitive included).

-- DropIndex
DROP INDEX "DeviceCapabilityItem_capabilityId_code_key";

-- AlterTable
ALTER TABLE "DeviceCapabilityItem" DROP COLUMN "code";

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCapabilityItem_capabilityId_name_key" ON "DeviceCapabilityItem"("capabilityId", "name");
