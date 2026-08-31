-- Device Management Master Identity & Coding Standard (Phase 1).
--
-- 1. MasterCodeSequence — monotonic counters for auto-generated master codes,
--    allocated atomically by MasterCodeService (mirrors DocumentNumberSequence).
-- 2. Device.code — new auto-generated business identifier (DVC-000001), unique
--    per company. Existing devices are backfilled deterministically by
--    (companyId, createdAt, id); no CUID or relationship is touched. The
--    sequence counter self-bootstraps above these values on first allocate.

-- CreateTable
CREATE TABLE "MasterCodeSequence" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterCodeSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MasterCodeSequence_scope_key" ON "MasterCodeSequence"("scope");

-- AlterTable: add Device.code (nullable first so existing rows can be backfilled)
ALTER TABLE "Device" ADD COLUMN "code" TEXT;

-- Backfill existing devices: DVC-000001.. per company, ordered by createdAt then id
WITH ordered AS (
  SELECT
    "id",
    'DVC-' || lpad(
      row_number() OVER (PARTITION BY "companyId" ORDER BY "createdAt", "id")::text,
      6, '0'
    ) AS "newCode"
  FROM "Device"
)
UPDATE "Device" d
  SET "code" = ordered."newCode"
  FROM ordered
  WHERE ordered."id" = d."id";

-- Enforce NOT NULL now that every row has a value
ALTER TABLE "Device" ALTER COLUMN "code" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Device_companyId_code_key" ON "Device"("companyId", "code");
