-- Add CUSTOMER_SERVICE to MembershipRole.
-- Idempotent: safe if the value was already added manually on a target DB.
DO $$
BEGIN
  ALTER TYPE "MembershipRole" ADD VALUE 'CUSTOMER_SERVICE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
