-- CreateEnum
CREATE TYPE "EmailWhitelistStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "EmailWhitelist" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "EmailWhitelistStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedBy" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "EmailWhitelist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailWhitelist_email_key" ON "EmailWhitelist"("email");

-- CreateIndex
CREATE INDEX "EmailWhitelist_status_idx" ON "EmailWhitelist"("status");

-- AddForeignKey
ALTER TABLE "EmailWhitelist" ADD CONSTRAINT "EmailWhitelist_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailWhitelist" ADD CONSTRAINT "EmailWhitelist_revokedBy_fkey" FOREIGN KEY ("revokedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
