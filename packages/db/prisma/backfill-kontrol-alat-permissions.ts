/**
 * One-time RolePermission migration for Kontrol Alat (F.MU.08) Phase 2.
 * Purely additive — adds:
 *   - calibrationJob:recordKontrolAlat  (TECHNICIAN, TECHNICIAN_MANAGER, ADMIN)
 *
 * seed-role-permissions.ts upserts the same rows on a full seed. An already-seeded
 * database (e.g. pkmdb) needs this script to add them without a full re-seed.
 * Idempotent: safe to re-run.
 *
 * Run:  pnpm --filter @medcal/db run backfill:kontrol-alat-permissions
 */
import { PrismaClient, type MembershipRole } from "@prisma/client";

const prisma = new PrismaClient();

const NEW_GRANTS: Array<{ role: MembershipRole; resource: string; action: string }> = [
  { role: "TECHNICIAN", resource: "calibrationJob", action: "recordKontrolAlat" },
  { role: "TECHNICIAN_MANAGER", resource: "calibrationJob", action: "recordKontrolAlat" },
  { role: "ADMIN", resource: "calibrationJob", action: "recordKontrolAlat" },
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

  console.log(`[backfill] upserted ${added} Kontrol Alat grant(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
