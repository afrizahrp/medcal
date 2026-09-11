-- AlterEnum
-- Isolated from usage of the new value: PostgreSQL cannot use a newly added
-- enum value until the transaction that added it has committed.
ALTER TYPE "DocumentType" ADD VALUE 'KONTROL_ALAT';
