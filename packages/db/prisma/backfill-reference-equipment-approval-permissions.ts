/**
 * One-time RolePermission migration for Reference Equipment Approval
 * (separate from CalibrationJob.submitForReview). Additive:
 *   - calibrationJob:submitReferenceEquipmentApproval  (TECHNICIAN, TECHNICIAN_MANAGER)
 *   - calibrationJob:decideReferenceEquipmentApproval  (TECHNICIAN_MANAGER)
 *
 * seed-role-permissions.ts only upserts — it never runs again against an
 * already-seeded database — so this script grants the new rows there directly.
 * Idempotent.
 *
 * Run:  pnpm --filter @medcal/db run backfill:reference-equipment-approval-permissions
 */
import { PrismaClient, type MembershipRole } from "@prisma/client";

const prisma = new PrismaClient();

const NEW_GRANTS: Array<{ role: MembershipRole; resource: string; action: string }> = [
  { role: "TECHNICIAN", resource: "calibrationJob", action: "submitReferenceEquipmentApproval" },
  {
    role: "TECHNICIAN_MANAGER",
    resource: "calibrationJob",
    action: "submitReferenceEquipmentApproval",
  },
  {
    role: "TECHNICIAN_MANAGER",
    resource: "calibrationJob",
    action: "decideReferenceEquipmentApproval",
  },
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

  console.log(`[backfill] upserted ${added} JobReferenceEquipmentApproval grant(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
