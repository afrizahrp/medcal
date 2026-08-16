/*
  Warnings:

  - You are about to drop the column `contactMessageId` on the `Lead` table. All the data in the column will be lost.
  - Added the required column `email` to the `Lead` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `Lead` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Lead" DROP CONSTRAINT "Lead_contactMessageId_fkey";

-- DropIndex
DROP INDEX "Lead_contactMessageId_key";

-- AlterTable
ALTER TABLE "ContactMessage" ADD COLUMN     "leadId" TEXT,
ADD COLUMN     "phoneNormalized" TEXT;

-- AlterTable
ALTER TABLE "Lead" DROP COLUMN "contactMessageId",
ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "organizationName" TEXT,
ADD COLUMN     "phone" TEXT;

-- CreateIndex
CREATE INDEX "ContactMessage_leadId_idx" ON "ContactMessage"("leadId");

-- CreateIndex
CREATE INDEX "Lead_companyId_createdAt_idx" ON "Lead"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
