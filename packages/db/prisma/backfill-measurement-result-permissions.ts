/**
 * One-time RolePermission migration for the MeasurementResult service/API layer
 * (Stage 2b, 2026-09-08). Purely additive — adds:
 *   - calibrationJob:recordMeasurement  (TECHNICIAN, TECHNICIAN_MANAGER)
 *
 * seed-role-permissions.ts only upserts — it never runs again against an
 * already-seeded database (e.g. pkmdb) — so this script grants the new rows
 * there directly. Idempotent: safe to re-run.
 *
 * Run:  pnpm --filter @medcal/db run backfill:measurement-result-permissions
 */
import { PrismaClient, type MembershipRole } from "@prisma/client";

const prisma = new PrismaClient();

const NEW_GRANTS: Array<{ role: MembershipRole; resource: string; action: string }> = [
  { role: "TECHNICIAN", resource: "calibrationJob", action: "recordMeasurement" },
  { role: "TECHNICIAN_MANAGER", resource: "calibrationJob", action: "recordMeasurement" },
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

  console.log(`[backfill] upserted ${added} MeasurementResult grant(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
