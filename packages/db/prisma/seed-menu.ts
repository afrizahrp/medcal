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
  // ══════════════════════════════════════════════════════════════════════════
  // MANAGEMENT — apps/portal/src/app/management/
  // ══════════════════════════════════════════════════════════════════════════

  // Dashboard (root leaf)
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

  // ─────────────────────────────────────────────────────────────────────────
  // Leads (group) → order: 1
  // ─────────────────────────────────────────────────────────────────────────
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
    viewResource: "email",
    viewAction: "read",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Device Management (group) → order: 2
  // ─────────────────────────────────────────────────────────────────────────
  {
    application: "MANAGEMENT",
    code: "device-management",
    label: "Device Management",
    icon: "device",
    order: 2,
    isGroup: true,
  },
  {
    application: "MANAGEMENT",
    code: "device-management.categories",
    parentCode: "device-management",
    label: "Categories",
    href: "/device-categories",
    icon: "folderTree",
    order: 0,
    viewResource: "deviceCategory",
    viewAction: "read",
  },
  {
    application: "MANAGEMENT",
    code: "device-management.types",
    parentCode: "device-management",
    label: "Types",
    href: "/device-types",
    icon: "tags",
    order: 1,
    viewResource: "deviceType",
    viewAction: "read",
  },
  {
    application: "MANAGEMENT",
    code: "device-management.models",
    parentCode: "device-management",
    label: "Models",
    href: "/device-models",
    icon: "boxes",
    order: 2,
    viewResource: "deviceModel",
    viewAction: "read",
  },
  {
    application: "MANAGEMENT",
    code: "device-management.capabilities",
    parentCode: "device-management",
    label: "Capabilities",
    href: "/device-capabilities",
    icon: "activity",
    order: 3,
    viewResource: "deviceCapability",
    viewAction: "read",
  },
  {
    application: "MANAGEMENT",
    code: "device-management.calibration-parameters",
    parentCode: "device-management",
    label: "Calibration Parameters",
    href: "/device-calibration-parameters",
    icon: "slidersHorizontal",
    order: 4,
    viewResource: "deviceCalibrationParameter",
    viewAction: "read",
  },
  {
    application: "MANAGEMENT",
    code: "device-management.devices",
    parentCode: "device-management",
    label: "Devices",
    href: "/devices",
    icon: "cpu",
    order: 5,
    viewResource: "device",
    viewAction: "read",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Calibration Management (group) → order: 3
  // ─────────────────────────────────────────────────────────────────────────
  {
    application: "MANAGEMENT",
    code: "calibration-management",
    label: "Calibration Management",
    icon: "gauge",
    order: 3,
    isGroup: true,
  },
  {
    application: "MANAGEMENT",
    code: "calibration-management.customers",
    parentCode: "calibration-management",
    label: "Customer",
    href: "/customers",
    icon: "customer",
    order: 0,
    viewResource: "customer",
    viewAction: "read",
  },
  {
    application: "MANAGEMENT",
    code: "calibration-management.calibration-requests",
    parentCode: "calibration-management",
    label: "Requisition",
    href: "/calibration-requests",
    icon: "clipboardList",
    order: 1,
    viewResource: "calibrationRequest",
    viewAction: "read",
  },
  {
    application: "MANAGEMENT",
    code: "calibration-management.quotations",
    parentCode: "calibration-management",
    label: "Quotation",
    href: "/quotations",
    icon: "messageSquareQuote",
    order: 2,
    viewResource: "quotation",
    viewAction: "read",
  },
  {
    application: "MANAGEMENT",
    code: "calibration-management.purchase-orders",
    parentCode: "calibration-management",
    label: "Purchase Order",
    href: "/purchase-orders",
    icon: "fileText",
    order: 3,
    viewResource: "purchaseOrder",
    viewAction: "read",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // User Management (group) → order: 4
  // ─────────────────────────────────────────────────────────────────────────
  {
    application: "MANAGEMENT",
    code: "user-management",
    label: "User Management",
    icon: "users",
    order: 4,
    isGroup: true,
  },
  {
    application: "MANAGEMENT",
    code: "user-management.users",
    parentCode: "user-management",
    label: "User",
    href: "/users",
    icon: "users",
    order: 0,
    viewResource: "users",
    viewAction: "read",
  },
  {
    application: "MANAGEMENT",
    code: "user-management.whitelist",
    parentCode: "user-management",
    label: "Whitelist",
    href: "/whitelist",
    icon: "whitelist",
    order: 1,
    viewResource: "whitelist",
    viewAction: "manage",
  },
  {
    application: "MANAGEMENT",
    code: "user-management.permission-management",
    parentCode: "user-management",
    label: "Permission",
    href: "/permission-management",
    icon: "permission",
    order: 2,
    viewResource: "permission",
    viewAction: "manage",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // System Setting (group) → order: 5
  // ─────────────────────────────────────────────────────────────────────────
  {
    application: "MANAGEMENT",
    code: "system-setting",
    label: "System Setting",
    icon: "settings",
    order: 5,
    isGroup: true,
  },
  {
    application: "MANAGEMENT",
    code: "system-setting.menu-management",
    parentCode: "system-setting",
    label: "Menu",
    href: "/menu-management",
    icon: "menu",
    order: 0,
    viewResource: "menu",
    viewAction: "manage",
  },
  {
    application: "MANAGEMENT",
    code: "system-setting.tax",
    parentCode: "system-setting",
    label: "Tax",
    href: "/tax",
    icon: "settings",
    order: 1,
    viewResource: "tax",
    viewAction: "manage",
  },
  {
    application: "MANAGEMENT",
    code: "system-setting.uom",
    parentCode: "system-setting",
    label: "UOM",
    href: "/uoms",
    icon: "settings",
    order: 2,
    viewResource: "uom",
    viewAction: "read",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CUSTOMER — apps/portal/src/app/client/
  // ══════════════════════════════════════════════════════════════════════════
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

// Legacy menu codes that have been reorganized into parent groups.
// These will be deleted during seed to avoid duplicate entries in sidebar.
const DEPRECATED_CODES: Array<{ application: MenuApplication; code: string }> = [
  { application: "MANAGEMENT", code: "customers" },
  { application: "MANAGEMENT", code: "users" },
  { application: "MANAGEMENT", code: "whitelist" },
  { application: "MANAGEMENT", code: "menu-management" },
  { application: "MANAGEMENT", code: "permission-management" },
  { application: "MANAGEMENT", code: "master-data.uom" },
  { application: "MANAGEMENT", code: "master-data" },
  { application: "MANAGEMENT", code: "system-setting.device-categories" },
  { application: "MANAGEMENT", code: "system-setting.device-types" },
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

  // Delete deprecated/legacy menu entries that have been reorganized
  let deletedCount = 0;
  for (const deprecated of DEPRECATED_CODES) {
    const result = await prisma.menu.deleteMany({
      where: { application: deprecated.application, code: deprecated.code },
    });
    deletedCount += result.count;
  }

  console.log(`[seed] ${ROWS.length} Menu rows upserted.`);
  if (deletedCount > 0) {
    console.log(`[seed] ${deletedCount} deprecated menu rows deleted.`);
  }
  await prisma.$disconnect();
}

seedMenu().catch((error) => {
  console.error("[seed] Failed:", error);
  process.exit(1);
});
