/**
 * One-time RolePermission migration for the calibration-result happy-path
 * review lifecycle (2026-09-09):
 *   - calibrationJob:submitForReview     (TECHNICIAN)
 *   - calibrationJob:complete            (TECHNICIAN)
 *   - calibrationJob:decideQualityReview (TECHNICIAN_MANAGER)
 *   - REMOVE calibrationJob:recordMeasurement from TECHNICIAN_MANAGER
 *
 * seed-role-permissions.ts only upserts — it never deletes stale rows — so an
 * already-seeded database (e.g. pkmdb) needs this script to drop the MT
 * measurement-write grant and add the new ones. Idempotent: safe to re-run.
 *
 * Run:  pnpm --filter @medcal/db run backfill:quality-review-happy-path-permissions
 */
import { PrismaClient, type MembershipRole } from "@prisma/client";

const prisma = new PrismaClient();

const NEW_GRANTS: Array<{ role: MembershipRole; resource: string; action: string }> = [
  { role: "TECHNICIAN", resource: "calibrationJob", action: "submitForReview" },
  { role: "TECHNICIAN", resource: "calibrationJob", action: "complete" },
  { role: "TECHNICIAN_MANAGER", resource: "calibrationJob", action: "decideQualityReview" },
];

async function main(): Promise<void> {
  const removed = await prisma.rolePermission.deleteMany({
    where: {
      role: "TECHNICIAN_MANAGER",
      resource: "calibrationJob",
      action: "recordMeasurement",
    },
  });

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

  console.log(
    `[backfill] removed ${removed.count} TECHNICIAN_MANAGER recordMeasurement row(s); ` +
      `upserted ${added} quality-review happy-path grant(s).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
