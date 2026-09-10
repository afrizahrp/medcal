import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import type { MembershipRole } from "@medcal/db";
import { hasPermission, loadRolePermissionCache } from "./access-control";

// hasPermission is now backed by the real RolePermission table (DB-driven
// grants) via an in-memory cache — no mocking, consistent with this
// project's existing no-mocking testing convention (see
// registration-gate.integration.test.ts). To keep this suite deterministic
// and independent of whatever seed-role-permissions.ts has produced in the
// shared dev DB, the non-SUPERADMIN roles under test are reset to a known
// fixture in beforeAll and the DB's original rows are restored in afterAll.

const TEST_ROLES: MembershipRole[] = [
  "ADMIN",
  "SUPERVISOR",
  "TECHNICIAN",
  "FINANCE",
  "CUSTOMER",
  "CUSTOMER_SERVICE",
];

interface GrantRow {
  role: MembershipRole;
  resource: string;
  action: string;
}

// Mirrors packages/db/prisma/seed-role-permissions.ts exactly — the
// preserved-behavior baseline (former roleStatements, verbatim) plus the
// SUPERVISOR additions business decision.
const FIXTURE: GrantRow[] = [
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
  { role: "ADMIN", resource: "uom", action: "read" },
  { role: "ADMIN", resource: "uom", action: "create" },
  { role: "ADMIN", resource: "uom", action: "update" },
  { role: "ADMIN", resource: "deviceCategory", action: "read" },
  { role: "ADMIN", resource: "deviceCategory", action: "create" },
  { role: "ADMIN", resource: "deviceCategory", action: "update" },
  { role: "ADMIN", resource: "deviceCategory", action: "delete" },
  { role: "ADMIN", resource: "deviceType", action: "read" },
  { role: "ADMIN", resource: "deviceType", action: "create" },
  { role: "ADMIN", resource: "deviceType", action: "update" },
  { role: "ADMIN", resource: "deviceType", action: "delete" },
  { role: "ADMIN", resource: "deviceModel", action: "read" },
  { role: "ADMIN", resource: "deviceModel", action: "create" },
  { role: "ADMIN", resource: "deviceModel", action: "update" },
  { role: "ADMIN", resource: "deviceModel", action: "delete" },
  { role: "ADMIN", resource: "deviceCapability", action: "read" },
  { role: "ADMIN", resource: "deviceCapability", action: "create" },
  { role: "ADMIN", resource: "deviceCapability", action: "update" },
  { role: "ADMIN", resource: "deviceCapability", action: "delete" },
  { role: "ADMIN", resource: "deviceCapabilityItem", action: "read" },
  { role: "ADMIN", resource: "deviceCapabilityItem", action: "create" },
  { role: "ADMIN", resource: "deviceCapabilityItem", action: "update" },
  { role: "ADMIN", resource: "deviceCapabilityItem", action: "delete" },
  { role: "ADMIN", resource: "deviceCalibrationParameter", action: "read" },
  { role: "ADMIN", resource: "deviceCalibrationParameter", action: "create" },
  { role: "ADMIN", resource: "deviceCalibrationParameter", action: "update" },
  { role: "ADMIN", resource: "deviceCalibrationParameter", action: "delete" },
  { role: "ADMIN", resource: "devicePhysicalCheckItem", action: "read" },
  { role: "ADMIN", resource: "devicePhysicalCheckItem", action: "create" },
  { role: "ADMIN", resource: "devicePhysicalCheckItem", action: "update" },
  { role: "ADMIN", resource: "devicePhysicalCheckItem", action: "delete" },
  { role: "ADMIN", resource: "device", action: "read" },
  { role: "ADMIN", resource: "device", action: "create" },
  { role: "ADMIN", resource: "device", action: "update" },
  { role: "ADMIN", resource: "device", action: "delete" },
  { role: "ADMIN", resource: "purchaseOrder", action: "read" },
  { role: "ADMIN", resource: "purchaseOrder", action: "create" },
  { role: "ADMIN", resource: "purchaseOrder", action: "update" },
  { role: "ADMIN", resource: "purchaseOrder", action: "cancel" },
  { role: "ADMIN", resource: "purchaseOrder", action: "approve" },
  { role: "ADMIN", resource: "workOrder", action: "read" },
  { role: "ADMIN", resource: "workOrder", action: "create" },
  { role: "ADMIN", resource: "workOrder", action: "update" },
  { role: "ADMIN", resource: "workOrder", action: "cancel" },
  { role: "ADMIN", resource: "workOrder", action: "assign" },
  { role: "SUPERVISOR", resource: "managementDashboard", action: "read" },
  { role: "SUPERVISOR", resource: "users", action: "read" },
  { role: "SUPERVISOR", resource: "membership", action: "manage" },
  { role: "SUPERVISOR", resource: "whitelist", action: "manage" },
  { role: "TECHNICIAN", resource: "managementDashboard", action: "read" },
  { role: "FINANCE", resource: "managementDashboard", action: "read" },
  { role: "CUSTOMER", resource: "customerDashboard", action: "read" },
  { role: "CUSTOMER_SERVICE", resource: "managementDashboard", action: "read" },
  { role: "CUSTOMER_SERVICE", resource: "customer", action: "read" },
  { role: "CUSTOMER_SERVICE", resource: "customer", action: "create" },
  { role: "CUSTOMER_SERVICE", resource: "customer", action: "update" },
  { role: "CUSTOMER_SERVICE", resource: "calibrationRequest", action: "read" },
  { role: "CUSTOMER_SERVICE", resource: "calibrationRequest", action: "create" },
  { role: "CUSTOMER_SERVICE", resource: "calibrationRequest", action: "update" },
  { role: "CUSTOMER_SERVICE", resource: "calibrationRequest", action: "cancel" },
  { role: "CUSTOMER_SERVICE", resource: "quotation", action: "read" },
  { role: "CUSTOMER_SERVICE", resource: "quotation", action: "create" },
  { role: "CUSTOMER_SERVICE", resource: "quotation", action: "update" },
  { role: "CUSTOMER_SERVICE", resource: "quotation", action: "cancel" },
  { role: "CUSTOMER_SERVICE", resource: "deviceType", action: "read" },
  { role: "ADMIN", resource: "priceListItem", action: "read" },
  { role: "ADMIN", resource: "priceListItem", action: "create" },
  { role: "ADMIN", resource: "priceListItem", action: "update" },
  { role: "ADMIN", resource: "priceListItem", action: "delete" },
];

let backup: GrantRow[] = [];

beforeAll(async () => {
  backup = (await prisma.rolePermission.findMany({ where: { role: { in: TEST_ROLES } } })).map((row) => ({
    role: row.role,
    resource: row.resource,
    action: row.action,
  }));

  await prisma.rolePermission.deleteMany({ where: { role: { in: TEST_ROLES } } });
  await prisma.rolePermission.createMany({ data: FIXTURE });
  await loadRolePermissionCache();
});

afterAll(async () => {
  await prisma.rolePermission.deleteMany({ where: { role: { in: TEST_ROLES } } });
  if (backup.length > 0) {
    await prisma.rolePermission.createMany({ data: backup });
  }
  await loadRolePermissionCache();
  await prisma.$disconnect();
});

describe("hasPermission — SUPERADMIN bypass (locked 2026-08-20)", () => {
  it("grants SUPERADMIN everything unconditionally, without consulting the DB", () => {
    expect(hasPermission("SUPERADMIN", "lead", "read")).toBe(true);
    expect(hasPermission("SUPERADMIN", "whitelist", "manage")).toBe(true);
    expect(hasPermission("SUPERADMIN", "users", "manage")).toBe(true);
    expect(hasPermission("SUPERADMIN", "menu", "manage")).toBe(true);
    expect(hasPermission("SUPERADMIN", "permission", "manage")).toBe(true);
  });
});

describe("hasPermission — lead resource (Lead Inbox, locked 2026-08-16 Decision 5: per-verb)", () => {
  it("grants ADMIN lead:read, lead:update, and lead:assign", () => {
    expect(hasPermission("ADMIN", "lead", "read")).toBe(true);
    expect(hasPermission("ADMIN", "lead", "update")).toBe(true);
    expect(hasPermission("ADMIN", "lead", "assign")).toBe(true);
  });

  it("denies roles with no lead grant", () => {
    expect(hasPermission("SUPERVISOR", "lead", "read")).toBe(false);
    expect(hasPermission("SUPERVISOR", "lead", "assign")).toBe(false);
    expect(hasPermission("TECHNICIAN", "lead", "read")).toBe(false);
    expect(hasPermission("FINANCE", "lead", "read")).toBe(false);
    expect(hasPermission("CUSTOMER", "lead", "read")).toBe(false);
  });
});

describe("hasPermission — customer resource (Customer CRM)", () => {
  it("grants ADMIN customer:read, customer:create, and customer:update", () => {
    expect(hasPermission("ADMIN", "customer", "read")).toBe(true);
    expect(hasPermission("ADMIN", "customer", "create")).toBe(true);
    expect(hasPermission("ADMIN", "customer", "update")).toBe(true);
  });

  it("denies roles with no customer grant", () => {
    expect(hasPermission("SUPERVISOR", "customer", "read")).toBe(false);
    expect(hasPermission("TECHNICIAN", "customer", "create")).toBe(false);
    expect(hasPermission("FINANCE", "customer", "read")).toBe(false);
    expect(hasPermission("CUSTOMER", "customer", "read")).toBe(false);
  });
});

describe("hasPermission — uom resource (UOM master data)", () => {
  it("grants ADMIN uom:read, uom:create, and uom:update", () => {
    expect(hasPermission("ADMIN", "uom", "read")).toBe(true);
    expect(hasPermission("ADMIN", "uom", "create")).toBe(true);
    expect(hasPermission("ADMIN", "uom", "update")).toBe(true);
  });

  it("denies roles with no uom grant", () => {
    expect(hasPermission("SUPERVISOR", "uom", "read")).toBe(false);
    expect(hasPermission("TECHNICIAN", "uom", "create")).toBe(false);
    expect(hasPermission("FINANCE", "uom", "read")).toBe(false);
    expect(hasPermission("CUSTOMER", "uom", "read")).toBe(false);
  });
});

describe("hasPermission — deviceCategory / deviceType / deviceModel master data", () => {
  it("grants ADMIN read/create/update/delete on all three resources", () => {
    expect(hasPermission("ADMIN", "deviceCategory", "read")).toBe(true);
    expect(hasPermission("ADMIN", "deviceCategory", "create")).toBe(true);
    expect(hasPermission("ADMIN", "deviceCategory", "update")).toBe(true);
    expect(hasPermission("ADMIN", "deviceCategory", "delete")).toBe(true);
    expect(hasPermission("ADMIN", "deviceType", "read")).toBe(true);
    expect(hasPermission("ADMIN", "deviceType", "create")).toBe(true);
    expect(hasPermission("ADMIN", "deviceType", "update")).toBe(true);
    expect(hasPermission("ADMIN", "deviceType", "delete")).toBe(true);
    expect(hasPermission("ADMIN", "deviceModel", "read")).toBe(true);
    expect(hasPermission("ADMIN", "deviceModel", "create")).toBe(true);
    expect(hasPermission("ADMIN", "deviceModel", "update")).toBe(true);
    expect(hasPermission("ADMIN", "deviceModel", "delete")).toBe(true);
  });

  it("denies roles with no deviceCategory / deviceType / deviceModel grant", () => {
    expect(hasPermission("SUPERVISOR", "deviceCategory", "read")).toBe(false);
    expect(hasPermission("TECHNICIAN", "deviceType", "create")).toBe(false);
    expect(hasPermission("FINANCE", "deviceCategory", "delete")).toBe(false);
    expect(hasPermission("CUSTOMER", "deviceType", "read")).toBe(false);
    expect(hasPermission("CUSTOMER", "deviceModel", "read")).toBe(false);
  });
});

describe("hasPermission — deviceCapability / deviceCapabilityItem master data", () => {
  it("grants ADMIN read/create/update/delete on capability and capability item", () => {
    expect(hasPermission("ADMIN", "deviceCapability", "read")).toBe(true);
    expect(hasPermission("ADMIN", "deviceCapability", "create")).toBe(true);
    expect(hasPermission("ADMIN", "deviceCapability", "update")).toBe(true);
    expect(hasPermission("ADMIN", "deviceCapability", "delete")).toBe(true);
    expect(hasPermission("ADMIN", "deviceCapabilityItem", "read")).toBe(true);
    expect(hasPermission("ADMIN", "deviceCapabilityItem", "create")).toBe(true);
    expect(hasPermission("ADMIN", "deviceCapabilityItem", "update")).toBe(true);
    expect(hasPermission("ADMIN", "deviceCapabilityItem", "delete")).toBe(true);
  });

  it("denies roles with no deviceCapability / deviceCapabilityItem grant", () => {
    expect(hasPermission("SUPERVISOR", "deviceCapability", "read")).toBe(false);
    expect(hasPermission("TECHNICIAN", "deviceCapabilityItem", "create")).toBe(false);
    expect(hasPermission("FINANCE", "deviceCapability", "delete")).toBe(false);
    expect(hasPermission("CUSTOMER", "deviceCapability", "read")).toBe(false);
    expect(hasPermission("CUSTOMER", "deviceCapabilityItem", "read")).toBe(false);
  });
});

describe("hasPermission — deviceCalibrationParameter master data", () => {
  it("grants ADMIN read/create/update/delete", () => {
    expect(hasPermission("ADMIN", "deviceCalibrationParameter", "read")).toBe(true);
    expect(hasPermission("ADMIN", "deviceCalibrationParameter", "create")).toBe(true);
    expect(hasPermission("ADMIN", "deviceCalibrationParameter", "update")).toBe(true);
    expect(hasPermission("ADMIN", "deviceCalibrationParameter", "delete")).toBe(true);
  });

  it("denies roles with no deviceCalibrationParameter grant", () => {
    expect(hasPermission("SUPERVISOR", "deviceCalibrationParameter", "read")).toBe(false);
    expect(hasPermission("TECHNICIAN", "deviceCalibrationParameter", "create")).toBe(false);
    expect(hasPermission("FINANCE", "deviceCalibrationParameter", "update")).toBe(false);
    expect(hasPermission("CUSTOMER", "deviceCalibrationParameter", "delete")).toBe(false);
  });
});

describe("hasPermission — devicePhysicalCheckItem master data", () => {
  it("grants ADMIN read/create/update/delete", () => {
    expect(hasPermission("ADMIN", "devicePhysicalCheckItem", "read")).toBe(true);
    expect(hasPermission("ADMIN", "devicePhysicalCheckItem", "create")).toBe(true);
    expect(hasPermission("ADMIN", "devicePhysicalCheckItem", "update")).toBe(true);
    expect(hasPermission("ADMIN", "devicePhysicalCheckItem", "delete")).toBe(true);
  });

  it("denies roles with no devicePhysicalCheckItem grant", () => {
    expect(hasPermission("SUPERVISOR", "devicePhysicalCheckItem", "read")).toBe(false);
    expect(hasPermission("TECHNICIAN", "devicePhysicalCheckItem", "create")).toBe(false);
    expect(hasPermission("FINANCE", "devicePhysicalCheckItem", "update")).toBe(false);
    expect(hasPermission("CUSTOMER", "devicePhysicalCheckItem", "delete")).toBe(false);
  });

  it("keeps master management separate from technician execution grants", () => {
    expect(hasPermission("ADMIN", "devicePhysicalCheckItem", "update")).toBe(true);
    expect(hasPermission("TECHNICIAN", "devicePhysicalCheckItem", "update")).toBe(false);
  });
});

describe("hasPermission — device resource (physical asset)", () => {
  it("grants ADMIN device:read, device:create, device:update, and device:delete", () => {
    expect(hasPermission("ADMIN", "device", "read")).toBe(true);
    expect(hasPermission("ADMIN", "device", "create")).toBe(true);
    expect(hasPermission("ADMIN", "device", "update")).toBe(true);
    expect(hasPermission("ADMIN", "device", "delete")).toBe(true);
  });

  it("denies roles with no device grant", () => {
    expect(hasPermission("SUPERVISOR", "device", "read")).toBe(false);
    expect(hasPermission("TECHNICIAN", "device", "create")).toBe(false);
    expect(hasPermission("FINANCE", "device", "update")).toBe(false);
    expect(hasPermission("CUSTOMER", "device", "delete")).toBe(false);
  });
});

describe("hasPermission — existing contactMessage/whitelist grants unchanged", () => {
  it("still grants contactMessage:read to ADMIN only among non-SUPERADMIN roles", () => {
    expect(hasPermission("ADMIN", "contactMessage", "read")).toBe(true);
    expect(hasPermission("SUPERVISOR", "contactMessage", "read")).toBe(false);
  });

  it("whitelist:manage: ADMIN still denied", () => {
    expect(hasPermission("ADMIN", "whitelist", "manage")).toBe(false);
  });
});

describe("hasPermission — users resource (User Management, locked 2026-08-19 G1-G4)", () => {
  it("grants ADMIN users:read but NOT users:manage", () => {
    expect(hasPermission("ADMIN", "users", "read")).toBe(true);
    expect(hasPermission("ADMIN", "users", "manage")).toBe(false);
  });

  it("denies TECHNICIAN/FINANCE/CUSTOMER any users grant", () => {
    expect(hasPermission("TECHNICIAN", "users", "read")).toBe(false);
    expect(hasPermission("FINANCE", "users", "read")).toBe(false);
    expect(hasPermission("CUSTOMER", "users", "read")).toBe(false);
  });
});

describe("hasPermission — membership resource (User Management, locked 2026-08-19 G1-G4)", () => {
  it("grants ADMIN membership:manage", () => {
    expect(hasPermission("ADMIN", "membership", "manage")).toBe(true);
  });

  it("denies TECHNICIAN/FINANCE/CUSTOMER membership:manage", () => {
    expect(hasPermission("TECHNICIAN", "membership", "manage")).toBe(false);
    expect(hasPermission("FINANCE", "membership", "manage")).toBe(false);
    expect(hasPermission("CUSTOMER", "membership", "manage")).toBe(false);
  });
});

describe("hasPermission — menu resource (Menu Registry, locked 2026-08-19)", () => {
  it("denies ADMIN and every other non-SUPERADMIN role menu:manage", () => {
    expect(hasPermission("ADMIN", "menu", "manage")).toBe(false);
    expect(hasPermission("SUPERVISOR", "menu", "manage")).toBe(false);
    expect(hasPermission("TECHNICIAN", "menu", "manage")).toBe(false);
    expect(hasPermission("FINANCE", "menu", "manage")).toBe(false);
    expect(hasPermission("CUSTOMER", "menu", "manage")).toBe(false);
  });
});

describe("hasPermission — managementDashboard/customerDashboard (Menu Registry, locked 2026-08-19)", () => {
  it("grants managementDashboard:read to ADMIN, SUPERVISOR, TECHNICIAN, FINANCE, CUSTOMER_SERVICE", () => {
    expect(hasPermission("ADMIN", "managementDashboard", "read")).toBe(true);
    expect(hasPermission("SUPERVISOR", "managementDashboard", "read")).toBe(true);
    expect(hasPermission("TECHNICIAN", "managementDashboard", "read")).toBe(true);
    expect(hasPermission("FINANCE", "managementDashboard", "read")).toBe(true);
    expect(hasPermission("CUSTOMER_SERVICE", "managementDashboard", "read")).toBe(true);
  });

  it("denies managementDashboard:read to CUSTOMER", () => {
    expect(hasPermission("CUSTOMER", "managementDashboard", "read")).toBe(false);
  });

  it("grants customerDashboard:read to CUSTOMER and ADMIN", () => {
    expect(hasPermission("CUSTOMER", "customerDashboard", "read")).toBe(true);
    expect(hasPermission("ADMIN", "customerDashboard", "read")).toBe(true);
  });

  it("denies customerDashboard:read to SUPERVISOR, TECHNICIAN, FINANCE, CUSTOMER_SERVICE", () => {
    expect(hasPermission("SUPERVISOR", "customerDashboard", "read")).toBe(false);
    expect(hasPermission("TECHNICIAN", "customerDashboard", "read")).toBe(false);
    expect(hasPermission("FINANCE", "customerDashboard", "read")).toBe(false);
    expect(hasPermission("CUSTOMER_SERVICE", "customerDashboard", "read")).toBe(false);
  });
});

describe("hasPermission — purchaseOrder resource", () => {
  it("grants ADMIN purchaseOrder read/create/update/cancel/approve", () => {
    expect(hasPermission("ADMIN", "purchaseOrder", "read")).toBe(true);
    expect(hasPermission("ADMIN", "purchaseOrder", "create")).toBe(true);
    expect(hasPermission("ADMIN", "purchaseOrder", "update")).toBe(true);
    expect(hasPermission("ADMIN", "purchaseOrder", "cancel")).toBe(true);
    expect(hasPermission("ADMIN", "purchaseOrder", "approve")).toBe(true);
  });
});

describe("hasPermission — workOrder resource", () => {
  it("grants ADMIN workOrder read/create/update/cancel/assign", () => {
    expect(hasPermission("ADMIN", "workOrder", "read")).toBe(true);
    expect(hasPermission("ADMIN", "workOrder", "create")).toBe(true);
    expect(hasPermission("ADMIN", "workOrder", "update")).toBe(true);
    expect(hasPermission("ADMIN", "workOrder", "cancel")).toBe(true);
    expect(hasPermission("ADMIN", "workOrder", "assign")).toBe(true);
  });

  it("denies roles with no workOrder grant", () => {
    expect(hasPermission("SUPERVISOR", "workOrder", "read")).toBe(false);
    expect(hasPermission("TECHNICIAN", "workOrder", "assign")).toBe(false);
    expect(hasPermission("FINANCE", "workOrder", "read")).toBe(false);
    expect(hasPermission("CUSTOMER", "workOrder", "read")).toBe(false);
  });
});

describe("hasPermission — SUPERVISOR grants (Permission Management, business decision 2026-08-20)", () => {
  it("grants SUPERVISOR users:read, membership:manage, whitelist:manage", () => {
    expect(hasPermission("SUPERVISOR", "users", "read")).toBe(true);
    expect(hasPermission("SUPERVISOR", "membership", "manage")).toBe(true);
    expect(hasPermission("SUPERVISOR", "whitelist", "manage")).toBe(true);
  });

  it("does NOT grant SUPERVISOR users:manage — matches ADMIN's shape exactly, not broader", () => {
    expect(hasPermission("SUPERVISOR", "users", "manage")).toBe(false);
  });
});

describe("hasPermission — CUSTOMER_SERVICE (customer-facing pre-sales, 2026-08-27)", () => {
  it("grants customer CRM read/create/update", () => {
    expect(hasPermission("CUSTOMER_SERVICE", "customer", "read")).toBe(true);
    expect(hasPermission("CUSTOMER_SERVICE", "customer", "create")).toBe(true);
    expect(hasPermission("CUSTOMER_SERVICE", "customer", "update")).toBe(true);
  });

  it("grants calibrationRequest read/create/update/cancel", () => {
    expect(hasPermission("CUSTOMER_SERVICE", "calibrationRequest", "read")).toBe(true);
    expect(hasPermission("CUSTOMER_SERVICE", "calibrationRequest", "create")).toBe(true);
    expect(hasPermission("CUSTOMER_SERVICE", "calibrationRequest", "update")).toBe(true);
    expect(hasPermission("CUSTOMER_SERVICE", "calibrationRequest", "cancel")).toBe(true);
  });

  it("grants quotation read/create/update/cancel but NOT approve", () => {
    expect(hasPermission("CUSTOMER_SERVICE", "quotation", "read")).toBe(true);
    expect(hasPermission("CUSTOMER_SERVICE", "quotation", "create")).toBe(true);
    expect(hasPermission("CUSTOMER_SERVICE", "quotation", "update")).toBe(true);
    expect(hasPermission("CUSTOMER_SERVICE", "quotation", "cancel")).toBe(true);
    expect(hasPermission("CUSTOMER_SERVICE", "quotation", "approve")).toBe(false);
  });

  it("grants deviceType:read for requisition item lookup", () => {
    expect(hasPermission("CUSTOMER_SERVICE", "deviceType", "read")).toBe(true);
    expect(hasPermission("CUSTOMER_SERVICE", "deviceType", "create")).toBe(false);
    expect(hasPermission("CUSTOMER_SERVICE", "deviceType", "update")).toBe(false);
    expect(hasPermission("CUSTOMER_SERVICE", "deviceType", "delete")).toBe(false);
  });

  it("denies user, role, and permission administration", () => {
    expect(hasPermission("CUSTOMER_SERVICE", "users", "read")).toBe(false);
    expect(hasPermission("CUSTOMER_SERVICE", "users", "manage")).toBe(false);
    expect(hasPermission("CUSTOMER_SERVICE", "membership", "manage")).toBe(false);
    expect(hasPermission("CUSTOMER_SERVICE", "permission", "manage")).toBe(false);
    expect(hasPermission("CUSTOMER_SERVICE", "menu", "manage")).toBe(false);
    expect(hasPermission("CUSTOMER_SERVICE", "whitelist", "manage")).toBe(false);
  });

  it("denies calibration execution, certificate, accounting, and payment", () => {
    expect(hasPermission("CUSTOMER_SERVICE", "workOrder", "read")).toBe(false);
    expect(hasPermission("CUSTOMER_SERVICE", "calibrationJob", "read")).toBe(false);
    expect(hasPermission("CUSTOMER_SERVICE", "certificate", "read")).toBe(false);
    expect(hasPermission("CUSTOMER_SERVICE", "invoice", "read")).toBe(false);
    expect(hasPermission("CUSTOMER_SERVICE", "payment", "read")).toBe(false);
    expect(hasPermission("CUSTOMER_SERVICE", "purchaseOrder", "read")).toBe(false);
    expect(hasPermission("CUSTOMER_SERVICE", "tax", "manage")).toBe(false);
  });

  it("denies lead, chat, and email modules", () => {
    expect(hasPermission("CUSTOMER_SERVICE", "lead", "read")).toBe(false);
    expect(hasPermission("CUSTOMER_SERVICE", "chat", "read")).toBe(false);
    expect(hasPermission("CUSTOMER_SERVICE", "email", "read")).toBe(false);
    expect(hasPermission("CUSTOMER_SERVICE", "email", "send")).toBe(false);
    expect(hasPermission("CUSTOMER_SERVICE", "contactMessage", "read")).toBe(false);
  });
});

describe("hasPermission — priceListItem master data (Price List Phase 1, 2026-08-30)", () => {
  it("grants ADMIN read/create/update/delete", () => {
    expect(hasPermission("ADMIN", "priceListItem", "read")).toBe(true);
    expect(hasPermission("ADMIN", "priceListItem", "create")).toBe(true);
    expect(hasPermission("ADMIN", "priceListItem", "update")).toBe(true);
    expect(hasPermission("ADMIN", "priceListItem", "delete")).toBe(true);
  });

  it("denies roles without a priceListItem grant", () => {
    expect(hasPermission("SUPERVISOR", "priceListItem", "read")).toBe(false);
    expect(hasPermission("TECHNICIAN", "priceListItem", "read")).toBe(false);
    expect(hasPermission("CUSTOMER_SERVICE", "priceListItem", "create")).toBe(false);
    expect(hasPermission("CUSTOMER", "priceListItem", "read")).toBe(false);
  });

  it("grants SUPERADMIN everything via bypass", () => {
    expect(hasPermission("SUPERADMIN", "priceListItem", "delete")).toBe(true);
  });
});
