/**
 * One-time RolePermission migration for the Identity Correction BA workflow
 * (2026-09-04). The match-only `calibrationJob:assignDevice` action is removed
 * and replaced by:
 *   - calibrationJob:submitIdentityCorrection  (TECHNICIAN, TECHNICIAN_MANAGER)
 *   - calibrationJob:decideIdentityCorrection  (TECHNICIAN_MANAGER)
 *
 * seed-role-permissions.ts only upserts — it never deletes stale rows — so an
 * already-seeded database (e.g. pkmdb) needs this script to drop the old grant
 * and add the new ones. Idempotent: safe to re-run.
 *
 * Run:  pnpm --filter @medcal/db run backfill:identity-correction-permissions
 */
import { PrismaClient, type MembershipRole } from "@prisma/client";

const prisma = new PrismaClient();

const NEW_GRANTS: Array<{ role: MembershipRole; resource: string; action: string }> = [
  { role: "TECHNICIAN", resource: "calibrationJob", action: "submitIdentityCorrection" },
  { role: "TECHNICIAN_MANAGER", resource: "calibrationJob", action: "submitIdentityCorrection" },
  { role: "TECHNICIAN_MANAGER", resource: "calibrationJob", action: "decideIdentityCorrection" },
];

async function main(): Promise<void> {
  const removed = await prisma.rolePermission.deleteMany({
    where: { resource: "calibrationJob", action: "assignDevice" },
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
    `[backfill] removed ${removed.count} calibrationJob:assignDevice row(s); ` +
      `upserted ${added} Identity Correction grant(s).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
