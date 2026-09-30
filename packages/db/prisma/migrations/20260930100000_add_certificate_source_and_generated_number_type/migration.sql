-- CreateEnum
CREATE TYPE "CertificateSource" AS ENUM ('UPLOADED', 'GENERATED');

-- AlterEnum
-- Dedicated counter namespace for Medcal-generated certificates (prefix CRT),
-- independent of the legacy CERTIFICATE type (prefix CER).
ALTER TYPE "DocumentType" ADD VALUE 'CERTIFICATE_GENERATED';

-- AlterTable
-- Existing rows take the default (UPLOADED). No historical data is rewritten:
-- number, status and every other column of existing certificates are untouched.
ALTER TABLE "Certificate" ADD COLUMN "source" "CertificateSource" NOT NULL DEFAULT 'UPLOADED';
