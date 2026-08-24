/**
 * Seeds the Menu Registry with exactly what exists today in the static
 * management/client nav configs — nothing hypothetical (no Technician rows;
 * tech-pwa has no real navigable pages yet).
 * Run manually: pnpm --filter @medcal/db run seed:menu
 */
import { prisma } from "../src/index";
import type { MenuApplication } from "../src/index";

interface MenuSeedRow {
  application: MenuApplication;
  code: string;
  parentCode?: string;
  label: string;
  href?: string | null;
  icon?: string | null;
  order: number;
  isGroup?: boolean;
  isActive?: boolean;
  viewResource?: string | null;
  viewAction?: string | null;
}

const ROWS: MenuSeedRow[] = [
  // MANAGEMENT — mirrors apps/portal/src/app/management/nav-config.ts
  {
    application: "MANAGEMENT",
    code: "dashboard",
    label: "Dashboard",
    href: "/",
    icon: "dashboard",
    order: 0,
    viewResource: "managementDashboard",
    viewAction: "read",
  },
  {
    application: "MANAGEMENT",
    code: "leads",
    label: "Leads",
    icon: "leads",
    order: 1,
    isGroup: true,
  },
  {
    application: "MANAGEMENT",
    code: "leads.messages",
    parentCode: "leads",
    label: "Messages",
    href: "/leads",
    icon: "messages",
    order: 0,
    viewResource: "lead",
    viewAction: "read",
  },
  {
    application: "MANAGEMENT",
    code: "leads.chat",
    parentCode: "leads",
    label: "Web Chat",
    href: "/chat",
    icon: "chat",
    order: 1,
    viewResource: "chat",
    viewAction: "read",
  },
  {
    application: "MANAGEMENT",
    code: "leads.email",
    parentCode: "leads",
    label: "Email",
    href: "/email",
    icon: "email",
    order: 2,
    isActive: true,
    viewResource: "email",
    viewAction: "read",
  },
  {
    application: "MANAGEMENT",
    code: "customers",
    label: "Customers",
    href: "/customers",
    icon: "users",
    order: 2,
    viewResource: "customer",
    viewAction: "read",
  },
  {
    application: "MANAGEMENT",
    code: "users",
    label: "Users",
    href: "/users",
    icon: "users",
    order: 3,
    viewResource: "users",
    viewAction: "read",
  },
  {
    application: "MANAGEMENT",
    code: "whitelist",
    label: "Whitelist",
    href: "/whitelist",
    icon: "whitelist",
    order: 4,
    viewResource: "whitelist",
    viewAction: "manage",
  },
  {
    application: "MANAGEMENT",
    code: "menu-management",
    label: "Menu Management",
    href: "/menu-management",
    icon: "menu",
    order: 5,
    viewResource: "menu",
    viewAction: "manage",
  },
  {
    application: "MANAGEMENT",
    code: "permission-management",
    label: "Permission Management",
    href: "/permission-management",
    icon: "permission",
    order: 6,
    viewResource: "permission",
    viewAction: "manage",
  },
  // CUSTOMER — mirrors apps/portal/src/app/client/nav-config.ts
  {
    application: "CUSTOMER",
    code: "dashboard",
    label: "Dashboard",
    href: "/",
    order: 0,
    viewResource: "customerDashboard",
    viewAction: "read",
  },
];

async function seedMenu() {
  const idByCode = new Map<string, string>();

  // Two passes: groups/parents first (topologically — parentCode-less rows,
  // then rows whose parent was already seeded), so parentId can always be
  // resolved before a child row is upserted.
  const remaining = [...ROWS];
  let progressed = true;
  while (remaining.length > 0 && progressed) {
    progressed = false;
    for (let i = remaining.length - 1; i >= 0; i -= 1) {
      const row = remaining[i];
      if (row.parentCode && !idByCode.has(`${row.application}:${row.parentCode}`)) {
        continue;
      }
      const parentId = row.parentCode ? idByCode.get(`${row.application}:${row.parentCode}`) ?? null : null;
      const menu = await prisma.menu.upsert({
        where: { application_code: { application: row.application, code: row.code } },
        create: {
          application: row.application,
          code: row.code,
          parentId,
          label: row.label,
          href: row.href ?? null,
          icon: row.icon ?? null,
          order: row.order,
          isGroup: row.isGroup ?? false,
          isActive: row.isActive ?? true,
          viewResource: row.viewResource ?? null,
          viewAction: row.viewAction ?? null,
        },
        update: {
          parentId,
          label: row.label,
          href: row.href ?? null,
          icon: row.icon ?? null,
          order: row.order,
          isGroup: row.isGroup ?? false,
          isActive: row.isActive ?? true,
          viewResource: row.viewResource ?? null,
          viewAction: row.viewAction ?? null,
        },
      });
      idByCode.set(`${row.application}:${row.code}`, menu.id);
      remaining.splice(i, 1);
      progressed = true;
    }
  }

  if (remaining.length > 0) {
    throw new Error(
      `[seed] Could not resolve parentCode for: ${remaining.map((r) => `${r.application}:${r.code}`).join(", ")}`,
    );
  }

  console.log(`[seed] ${ROWS.length} Menu rows upserted.`);
  await prisma.$disconnect();
}

seedMenu().catch((error) => {
  console.error("[seed] Failed:", error);
  process.exit(1);
});
