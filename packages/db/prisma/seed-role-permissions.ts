/**
 * Seeds the RolePermission table with exactly the grants that used to live
 * in packages/auth/src/access-control.ts's static roleStatements object —
 * extracted verbatim, so cutover to the DB-driven model preserves current
 * authorization behavior byte-for-byte. SUPERADMIN is intentionally NOT
 * seeded: hasPermission() hardcodes an unconditional bypass for SUPERADMIN,
 * so DB rows for it would never be consulted and would only risk drifting
 * out of sync as the permission catalog grows.
 *
 * The SUPERVISOR_ADDITIONS block below is a separate, explicit business
 * decision (2026-08-20, Permission Management project) layered on top of
 * the preserved baseline — not part of "current behavior preserved".
 *
 * Run manually: pnpm --filter @medcal/db run seed:role-permissions
 */
import { prisma } from "../src/index";
import type { MembershipRole } from "../src/index";

interface GrantRow {
  role: MembershipRole;
  resource: string;
  action: string;
}

// Verbatim extraction of the former roleStatements object (SUPERADMIN excluded — see above).
const PRESERVED_BASELINE: GrantRow[] = [
  // ADMIN
  { role: "ADMIN", resource: "contactMessage", action: "read" },
  { role: "ADMIN", resource: "lead", action: "read" },
  { role: "ADMIN", resource: "lead", action: "update" },
  { role: "ADMIN", resource: "lead", action: "assign" },
  { role: "ADMIN", resource: "customer", action: "read" },
  { role: "ADMIN", resource: "customer", action: "create" },
  { role: "ADMIN", resource: "customer", action: "update" },
  { role: "ADMIN", resource: "chat", action: "read" },
  { role: "ADMIN", resource: "chat", action: "reply" },
  { role: "ADMIN", resource: "chat", action: "close" },
  { role: "ADMIN", resource: "users", action: "read" },
  { role: "ADMIN", resource: "membership", action: "manage" },
  { role: "ADMIN", resource: "managementDashboard", action: "read" },
  { role: "ADMIN", resource: "customerDashboard", action: "read" },
  { role: "ADMIN", resource: "email", action: "read" },
  { role: "ADMIN", resource: "email", action: "send" },
  { role: "ADMIN", resource: "email", action: "delete" },
  { role: "ADMIN", resource: "email", action: "manage" },
  // SUPERVISOR
  { role: "SUPERVISOR", resource: "managementDashboard", action: "read" },
  // TECHNICIAN
  { role: "TECHNICIAN", resource: "managementDashboard", action: "read" },
  // FINANCE
  { role: "FINANCE", resource: "managementDashboard", action: "read" },
  // CUSTOMER
  { role: "CUSTOMER", resource: "customerDashboard", action: "read" },
];

// Business decision (2026-08-20): SUPERVISOR gains User Management (matching
// ADMIN's exact shape — read + membership manage, NOT users:manage, which
// only SUPERADMIN has today) and Email Whitelist management.
const SUPERVISOR_ADDITIONS: GrantRow[] = [
  { role: "SUPERVISOR", resource: "users", action: "read" },
  { role: "SUPERVISOR", resource: "membership", action: "manage" },
  { role: "SUPERVISOR", resource: "whitelist", action: "manage" },
];

const ROWS: GrantRow[] = [...PRESERVED_BASELINE, ...SUPERVISOR_ADDITIONS];

async function seedRolePermissions() {
  for (const row of ROWS) {
    await prisma.rolePermission.upsert({
      where: { role_resource_action: { role: row.role, resource: row.resource, action: row.action } },
      create: row,
      update: {},
    });
  }

  console.log(`[seed] ${ROWS.length} RolePermission rows upserted.`);
  await prisma.$disconnect();
}

seedRolePermissions().catch((error) => {
  console.error("[seed] Failed:", error);
  process.exit(1);
});
