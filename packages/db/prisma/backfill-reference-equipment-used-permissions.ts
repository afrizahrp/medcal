/**
 * One-time RolePermission migration for the JobReferenceEquipmentUsed
 * service/API layer (2026-09-05). Purely additive — adds:
 *   - calibrationJob:recordReferenceEquipmentUsed        (TECHNICIAN, TECHNICIAN_MANAGER)
 *   - calibrationJob:overrideReferenceEquipmentValidity  (TECHNICIAN_MANAGER)
 *
 * seed-role-permissions.ts only upserts — it never runs again against an
 * already-seeded database (e.g. pkmdb) — so this script grants the new rows
 * there directly. Idempotent: safe to re-run.
 *
 * Run:  pnpm --filter @medcal/db run backfill:reference-equipment-used-permissions
 */
import { PrismaClient, type MembershipRole } from "@prisma/client";

const prisma = new PrismaClient();

const NEW_GRANTS: Array<{ role: MembershipRole; resource: string; action: string }> = [
  { role: "TECHNICIAN", resource: "calibrationJob", action: "recordReferenceEquipmentUsed" },
  { role: "TECHNICIAN_MANAGER", resource: "calibrationJob", action: "recordReferenceEquipmentUsed" },
  { role: "TECHNICIAN_MANAGER", resource: "calibrationJob", action: "overrideReferenceEquipmentValidity" },
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

  console.log(`[backfill] upserted ${added} JobReferenceEquipmentUsed grant(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
