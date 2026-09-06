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
  // Calibration Management (2026-08-25)
  { role: "ADMIN", resource: "calibrationRequest", action: "read" },
  { role: "ADMIN", resource: "calibrationRequest", action: "create" },
  { role: "ADMIN", resource: "calibrationRequest", action: "update" },
  { role: "ADMIN", resource: "calibrationRequest", action: "cancel" },
  { role: "ADMIN", resource: "quotation", action: "read" },
  { role: "ADMIN", resource: "quotation", action: "create" },
  { role: "ADMIN", resource: "quotation", action: "update" },
  { role: "ADMIN", resource: "quotation", action: "cancel" },
  { role: "ADMIN", resource: "quotation", action: "approve" },
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
  // CalibrationJob: operational read visibility only. The AKD/AKL identity
  // approval verb (approveIdentity) is TECHNICIAN_MANAGER-only by decision.
  { role: "ADMIN", resource: "calibrationJob", action: "read" },
  // System Settings (2026-08-26)
  { role: "ADMIN", resource: "tax", action: "manage" },
  // Price List / Tariff Master Data (2026-08-30 — Price List Phase 1)
  { role: "ADMIN", resource: "priceListItem", action: "read" },
  { role: "ADMIN", resource: "priceListItem", action: "create" },
  { role: "ADMIN", resource: "priceListItem", action: "update" },
  { role: "ADMIN", resource: "priceListItem", action: "delete" },
  // UOM Master Data (2026-08-26)
  { role: "ADMIN", resource: "uom", action: "read" },
  { role: "ADMIN", resource: "uom", action: "create" },
  { role: "ADMIN", resource: "uom", action: "update" },
  // DeviceCategory / DeviceType / DeviceModel Master Data (2026-08-26)
  { role: "ADMIN", resource: "deviceCategory", action: "read" },
  { role: "ADMIN", resource: "deviceCategory", action: "create" },
  { role: "ADMIN", resource: "deviceCategory", action: "update" },
  { role: "ADMIN", resource: "deviceCategory", action: "delete" },
  { role: "ADMIN", resource: "deviceType", action: "read" },
  { role: "ADMIN", resource: "deviceType", action: "create" },
  { role: "ADMIN", resource: "deviceType", action: "update" },
  { role: "ADMIN", resource: "deviceType", action: "delete" },
  // DeviceTypeAlias Master Data (2026-08-29, Phase 2 — Excel Import + Alias)
  { role: "ADMIN", resource: "deviceTypeAlias", action: "read" },
  { role: "ADMIN", resource: "deviceTypeAlias", action: "create" },
  { role: "ADMIN", resource: "deviceTypeAlias", action: "update" },
  { role: "ADMIN", resource: "deviceTypeAlias", action: "delete" },
  { role: "ADMIN", resource: "deviceModel", action: "read" },
  { role: "ADMIN", resource: "deviceModel", action: "create" },
  { role: "ADMIN", resource: "deviceModel", action: "update" },
  { role: "ADMIN", resource: "deviceModel", action: "delete" },
  // DeviceCapability / DeviceCapabilityItem Master Data (2026-08-26)
  { role: "ADMIN", resource: "deviceCapability", action: "read" },
  { role: "ADMIN", resource: "deviceCapability", action: "create" },
  { role: "ADMIN", resource: "deviceCapability", action: "update" },
  { role: "ADMIN", resource: "deviceCapability", action: "delete" },
  { role: "ADMIN", resource: "deviceCapabilityItem", action: "read" },
  { role: "ADMIN", resource: "deviceCapabilityItem", action: "create" },
  { role: "ADMIN", resource: "deviceCapabilityItem", action: "update" },
  { role: "ADMIN", resource: "deviceCapabilityItem", action: "delete" },
  // DeviceCalibrationParameter Master Data (2026-08-26)
  { role: "ADMIN", resource: "deviceCalibrationParameter", action: "read" },
  { role: "ADMIN", resource: "deviceCalibrationParameter", action: "create" },
  { role: "ADMIN", resource: "deviceCalibrationParameter", action: "update" },
  { role: "ADMIN", resource: "deviceCalibrationParameter", action: "delete" },
  // Equipment Type master + Required Equipment (2026-08-29, Phase 1)
  { role: "ADMIN", resource: "equipmentType", action: "read" },
  { role: "ADMIN", resource: "equipmentType", action: "create" },
  { role: "ADMIN", resource: "equipmentType", action: "update" },
  { role: "ADMIN", resource: "equipmentType", action: "delete" },
  { role: "ADMIN", resource: "equipmentRequirement", action: "read" },
  { role: "ADMIN", resource: "equipmentRequirement", action: "create" },
  { role: "ADMIN", resource: "equipmentRequirement", action: "update" },
  { role: "ADMIN", resource: "equipmentRequirement", action: "delete" },
  // Physical reference equipment units (2026-08-29, Phase 2A)
  { role: "ADMIN", resource: "equipment", action: "read" },
  { role: "ADMIN", resource: "equipment", action: "create" },
  { role: "ADMIN", resource: "equipment", action: "update" },
  { role: "ADMIN", resource: "equipment", action: "delete" },
  // Equipment calibration evidence records (2026-08-29, Phase 2B)
  { role: "ADMIN", resource: "equipmentCalibrationRecord", action: "read" },
  { role: "ADMIN", resource: "equipmentCalibrationRecord", action: "create" },
  { role: "ADMIN", resource: "equipmentCalibrationRecord", action: "update" },
  { role: "ADMIN", resource: "equipmentCalibrationRecord", action: "delete" },
  // Device physical asset (2026-08-26)
  { role: "ADMIN", resource: "device", action: "read" },
  { role: "ADMIN", resource: "device", action: "create" },
  { role: "ADMIN", resource: "device", action: "update" },
  { role: "ADMIN", resource: "device", action: "delete" },
  // SUPERVISOR
  { role: "SUPERVISOR", resource: "managementDashboard", action: "read" },
  // TECHNICIAN
  { role: "TECHNICIAN", resource: "managementDashboard", action: "read" },
  // TECHNICIAN_MANAGER (2026-09-02): management dashboard + the AKD/AKL/NIE
  // identity gate (see calibrationJob grants below).
  { role: "TECHNICIAN_MANAGER", resource: "managementDashboard", action: "read" },
  // CalibrationJob AKD/AKL/NIE identity escalation & approval (2026-09-02).
  // escalateIdentity: field actor raises a missing/unacceptable declaration.
  // approveIdentity: TECHNICIAN_MANAGER is the sole approver — deliberately
  // NOT granted to ADMIN/SUPERVISOR (SUPERADMIN keeps its hasPermission bypass).
  // Identity Correction BA (2026-09-04): replaces the removed match-only
  // assignDevice action. submitIdentityCorrection is the sole path for
  // setting/changing a job's Device identity (first-time + correction) plus the
  // observed serial / AKD-AKL — TECHNICIAN + TECHNICIAN_MANAGER, mirroring
  // escalateIdentity. decideIdentityCorrection (APPROVE/REJECT) is
  // TECHNICIAN_MANAGER-only, mirroring approveIdentity.
  { role: "TECHNICIAN", resource: "calibrationJob", action: "read" },
  // Minimal "Mulai Kalibrasi" start action (2026-09-06): PENDING → IN_PROGRESS +
  // startedAt, the single gate unblocking reference-equipment recording. Granted
  // TECHNICIAN + TECHNICIAN_MANAGER, mirroring recordReferenceEquipmentUsed.
  { role: "TECHNICIAN", resource: "calibrationJob", action: "start" },
  { role: "TECHNICIAN", resource: "calibrationJob", action: "escalateIdentity" },
  { role: "TECHNICIAN", resource: "calibrationJob", action: "submitIdentityCorrection" },
  { role: "TECHNICIAN_MANAGER", resource: "calibrationJob", action: "read" },
  { role: "TECHNICIAN_MANAGER", resource: "calibrationJob", action: "start" },
  { role: "TECHNICIAN_MANAGER", resource: "calibrationJob", action: "escalateIdentity" },
  { role: "TECHNICIAN_MANAGER", resource: "calibrationJob", action: "approveIdentity" },
  { role: "TECHNICIAN_MANAGER", resource: "calibrationJob", action: "submitIdentityCorrection" },
  { role: "TECHNICIAN_MANAGER", resource: "calibrationJob", action: "decideIdentityCorrection" },
  // JobReferenceEquipmentUsed (2026-09-05): recordReferenceEquipmentUsed is the
  // on-site actor recording which confirmed WorkOrderEquipment unit(s) were used
  // — TECHNICIAN + TECHNICIAN_MANAGER, mirroring submitIdentityCorrection.
  // overrideReferenceEquipmentValidity (force-accept an expired/unaccepted
  // certificate) is TECHNICIAN_MANAGER-only, checked inline in the service.
  { role: "TECHNICIAN", resource: "calibrationJob", action: "recordReferenceEquipmentUsed" },
  { role: "TECHNICIAN_MANAGER", resource: "calibrationJob", action: "recordReferenceEquipmentUsed" },
  {
    role: "TECHNICIAN_MANAGER",
    resource: "calibrationJob",
    action: "overrideReferenceEquipmentValidity",
  },
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

// Customer Service (2026-08-27): staff role for customer-facing pre-sales
// (Customer → Calibration Request → Quotation). Does not grant quotation
// approval, email inbox, user/role admin, calibration execution, or accounting.
const CUSTOMER_SERVICE_GRANTS: GrantRow[] = [
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
];

const ROWS: GrantRow[] = [...PRESERVED_BASELINE, ...SUPERVISOR_ADDITIONS, ...CUSTOMER_SERVICE_GRANTS];

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
