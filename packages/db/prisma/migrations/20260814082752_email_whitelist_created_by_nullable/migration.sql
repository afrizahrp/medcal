-- DropForeignKey
ALTER TABLE "EmailWhitelist" DROP CONSTRAINT "EmailWhitelist_createdBy_fkey";

-- AlterTable
ALTER TABLE "EmailWhitelist" ALTER COLUMN "createdBy" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "EmailWhitelist" ADD CONSTRAINT "EmailWhitelist_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
