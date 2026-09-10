/**
 * One-time RolePermission migration for Physical Inspection (2026-09-10).
 * Purely additive — adds:
 *   - calibrationJob:recordPhysicalCheck  (TECHNICIAN)
 *
 * TECHNICIAN_MANAGER must NOT receive this grant (MT is reviewer via
 * calibrationJob:read + decideQualityReview). Re-running this script must not
 * grant MT write access.
 *
 * seed-role-permissions.ts upserts the same row on a full seed. An already-seeded
 * database (e.g. pkmdb) needs this script to add it without a full re-seed.
 * Idempotent: safe to re-run.
 *
 * Run:  pnpm --filter @medcal/db run backfill:physical-check-permissions
 */
import { PrismaClient, type MembershipRole } from "@prisma/client";

const prisma = new PrismaClient();

const NEW_GRANTS: Array<{ role: MembershipRole; resource: string; action: string }> = [
  { role: "TECHNICIAN", resource: "calibrationJob", action: "recordPhysicalCheck" },
];

async function main(): Promise<void> {
  let added = 0;
  for (const grant of NEW_GRANTS) {
    await prisma.rolePermission.upsert({
      where: {
        role_resource_action: {
          role: grant.role,
          resource: grant.resource,
          action: grant.action,
        },
      },
      create: grant,
      update: {},
    });
    added += 1;
  }

  console.log(`[backfill] upserted ${added} Physical Inspection grant(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
