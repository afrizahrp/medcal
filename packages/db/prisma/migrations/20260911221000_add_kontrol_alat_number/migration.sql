-- Persist the centralized KAL document number on KontrolAlat (same column
-- name "number" that DocumentNumberService.readMaxExistingSequence queries).

ALTER TABLE "KontrolAlat" ADD COLUMN "number" TEXT;

-- Backfill existing WOL rows. Sequence is per (companyId, UTC year) — month
-- is display-only, matching DocumentNumberService.allocate.
WITH numbered AS (
  SELECT
    id,
    "companyId",
    EXTRACT(YEAR FROM ("createdAt" AT TIME ZONE 'UTC'))::int AS year,
    LPAD(EXTRACT(MONTH FROM ("createdAt" AT TIME ZONE 'UTC'))::int::text, 2, '0') AS month,
    ROW_NUMBER() OVER (
      PARTITION BY "companyId", EXTRACT(YEAR FROM ("createdAt" AT TIME ZONE 'UTC'))
      ORDER BY "createdAt" ASC, id ASC
    ) AS seq
  FROM "KontrolAlat"
)
UPDATE "KontrolAlat" AS k
SET "number" = 'KAL/' || n.year::text || '/' || n.month || '/' || LPAD(n.seq::text, 5, '0')
FROM numbered n
WHERE k.id = n.id;

ALTER TABLE "KontrolAlat" ALTER COLUMN "number" SET NOT NULL;

CREATE UNIQUE INDEX "KontrolAlat_companyId_number_key" ON "KontrolAlat"("companyId", "number");

-- Keep DocumentNumberSequence in sync so the next allocate() continues after
-- the backfilled max. Harmless if a company has no KontrolAlat rows yet.
INSERT INTO "DocumentNumberSequence" (
  "id",
  "companyId",
  "documentType",
  "prefix",
  "year",
  "lastSequence",
  "createdAt",
  "updatedAt"
)
SELECT
  'dns_kal_' || k."companyId" || '_' || EXTRACT(YEAR FROM (k."createdAt" AT TIME ZONE 'UTC'))::int::text,
  k."companyId",
  'KONTROL_ALAT'::"DocumentType",
  'KAL',
  EXTRACT(YEAR FROM (k."createdAt" AT TIME ZONE 'UTC'))::int,
  COUNT(*)::int,
  NOW(),
  NOW()
FROM "KontrolAlat" k
GROUP BY
  k."companyId",
  EXTRACT(YEAR FROM (k."createdAt" AT TIME ZONE 'UTC'))
ON CONFLICT ("companyId", "documentType", "year")
DO UPDATE SET
  "lastSequence" = GREATEST("DocumentNumberSequence"."lastSequence", EXCLUDED."lastSequence"),
  "updatedAt" = NOW();
