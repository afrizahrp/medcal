/**
 * One-time RolePermission migration for the pre-approval REWORK lifecycle
 * (2026-09-10):
 *   - calibrationJob:resumeAfterRework (TECHNICIAN)
 *
 * seed-role-permissions.ts upserts this grant on a full seed. An already-seeded
 * database (e.g. pkmdb) needs this script to add it without a full re-seed.
 * Idempotent: safe to re-run.
 *
 * Run:  pnpm --filter @medcal/db run backfill:rework-resume-permissions
 */
import { PrismaClient, type MembershipRole } from "@prisma/client";

const prisma = new PrismaClient();

const NEW_GRANTS: Array<{ role: MembershipRole; resource: string; action: string }> = [
  { role: "TECHNICIAN", resource: "calibrationJob", action: "resumeAfterRework" },
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

  console.log(`[backfill] upserted ${added} resumeAfterRework grant(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
