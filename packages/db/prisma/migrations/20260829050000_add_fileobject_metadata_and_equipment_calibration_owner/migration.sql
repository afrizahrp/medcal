-- Generic file infrastructure — Phase 1. Additive only: no field removed, no
-- type changed. FileObject was schema-only (no rows, no app code) before this.

-- AlterEnum: reference-equipment calibration evidence owner type.
ALTER TYPE "FileOwnerType" ADD VALUE 'EQUIPMENT_CALIBRATION' BEFORE 'OTHER';

-- AlterTable: metadata needed to locate, attribute and verify a stored file.
-- updatedAt is added with a transient default so pre-existing rows (none in
-- practice) stay valid, then the default is dropped to match Prisma's @updatedAt.
ALTER TABLE "FileObject" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "FileObject" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "FileObject" ADD COLUMN "checksum" TEXT;
ALTER TABLE "FileObject" ADD COLUMN "uploadedByUserId" TEXT;

-- A storage key must map to exactly one row.
DROP INDEX "FileObject_storageKey_idx";
CREATE UNIQUE INDEX "FileObject_storageKey_key" ON "FileObject"("storageKey");

-- CreateIndex
CREATE INDEX "FileObject_uploadedByUserId_idx" ON "FileObject"("uploadedByUserId");

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
