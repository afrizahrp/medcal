import { createAccessControl } from "better-auth/plugins/access";
import { prisma } from "@medcal/db";
import type { MembershipRole } from "@medcal/db";

/**
 * Minimal, mechanism-only permission catalog. Not a full resource/action
 * taxonomy (none is locked in the docs) — just enough to prove the RBAC guard
 * chain per module. Extend per-module as needed.
 * - contactMessage:read (F3): proves the guard chain on ContactMessagesModule.
 * - whitelist:manage (F4, locked): EmailWhitelist CRUD, superadmin-only by default.
 * - lead:read/lead:update/lead:assign (Lead Inbox): per-verb grants; assign
 *   writes Lead.assignedToUserId and triggers push to the assigned user.
 * - chat:read/chat:reply/chat:close (Web Chat Phase 2): per-verb, matching the
 *   lead:* precedent — chat:read gates reading/subscribing to sessions,
 *   chat:reply gates sending ADMIN messages, chat:close gates closing a
 *   session. No chat:assign (assignment is explicitly out of Phase 2 scope).
 * - users:read/users:manage (User Management, locked 2026-08-19 G1-G4):
 *   users:read for listing/viewing users, users:manage for status changes
 *   (activate/disable). SUPERADMIN-only for manage; ADMIN can read.
 * - membership:manage (User Management, locked 2026-08-19 G1-G4):
 *   assign/change/remove membership+role. G2 lock: SUPERADMIN role cannot be
 *   assigned via API — bootstrap CLI only.
 * - menu:manage (Menu Registry, locked 2026-08-19): create/update/delete Menu
 *   rows and view the admin (unfiltered) listing. SUPERADMIN-only — ADMIN is
 *   not currently authorized to manage menus (product decision, revisit
 *   later; do not hardcode a role check anywhere else, this catalog entry is
 *   the single place that decision lives).
 * - managementDashboard:read / customerDashboard:read (Menu Registry, locked
 *   2026-08-19): Dashboard is a normal permission-gated leaf menu, not a
 *   special-cased always-visible item. Two distinct resources exist (rather
 *   than one "dashboard" resource) because the Management-app Dashboard and
 *   Customer-app Dashboard have different, non-overlapping role sets today —
 *   this preserves that exactly instead of collapsing them into one grant.
 * - permission:manage (Permission Management, locked 2026-08-20): gates the
 *   Permission Management API/UI that edits RolePermission rows below.
 *   SUPERADMIN-only by default (see hasPermission's hardcoded bypass) —
 *   granting it to another role is a deliberate, explicit admin action, not
 *   something this catalog entry does on its own.
 * - deviceCategory/deviceType/deviceModel:read/create/update/delete
 *   (Device taxonomy): Kemenkes-confirmed DeviceType list grouped by
 *   internal DeviceCategory; DeviceModel is manufacturer+model under a type.
 * - deviceCapability/deviceCapabilityItem:read/create/update/delete
 *   (Device function master): DeviceCapability is a device function
 *   (e.g. NIBP); DeviceCapabilityItem is a child aspect of that function.
 * - deviceCalibrationParameter:read/create/update/delete (Calibration
 *   parameter master): what is measured/assessed during calibration,
 *   linked to a DeviceCapabilityItem and a centralized Uom.
 */
const ac = createAccessControl({
  contactMessage: ["read"],
  whitelist: ["manage"],
  lead: ["read", "update", "assign"],
  customer: ["read", "create", "update"],
  uom: ["read", "create", "update"],
  deviceCategory: ["read", "create", "update", "delete"],
  deviceType: ["read", "create", "update", "delete"],
  deviceModel: ["read", "create", "update", "delete"],
  deviceCapability: ["read", "create", "update", "delete"],
  deviceCapabilityItem: ["read", "create", "update", "delete"],
  deviceCalibrationParameter: ["read", "create", "update", "delete"],
  chat: ["read", "reply", "close"],
  users: ["read", "manage"],
  membership: ["manage"],
  menu: ["manage"],
  managementDashboard: ["read"],
  customerDashboard: ["read"],
  // Email → Lead Management (locked plan): exactly four permissions.
  // email:read = view, sync, read/unread, star, dismiss suggestion
  // email:send = compose, send, reply, draft
  // email:delete = trash, restore, permanent delete
  // email:manage = confirm/change/remove Lead association
  email: ["read", "send", "delete", "manage"],
  permission: ["manage"],
  // FCM Push notifications (Phase 3): test endpoint for verifying backend->FCM
  // sending. notification:test is SUPERADMIN-only by default (no RolePermission
  // rows seeded) — send to production tokens requires explicit admin action.
  notification: ["test"],
  // Calibration Lifecycle Management: resources for the calibration workflow
  calibrationRequest: ["read", "create", "update", "cancel"],
  quotation: ["read", "create", "update", "cancel", "approve"],
  purchaseOrder: ["read", "create", "update", "cancel", "approve"],
  workOrder: ["read", "create", "update", "cancel", "assign"],
  calibrationJob: ["read", "create", "update", "complete"],
  certificate: ["read", "create", "update", "issue"],
  invoice: ["read", "create", "update", "void"],
  payment: ["read", "create", "update", "reconcile"],
  // System Settings
  tax: ["manage"],
} as const);

/**
 * DB-driven role -> permission grants (locked 2026-08-20). Role/permission
 * assignment is now data in the RolePermission table, not a hardcoded map —
 * an authorized administrator changes it through the Permission Management
 * UI, with no code change or deploy required. This module keeps a
 * synchronous, in-memory read model (`cache`) so hasPermission's signature
 * and every one of its call sites (CompanyRoleGuard, MenuService.getNavTree,
 * MeController, chat-socket-auth, EmailsService) stay completely unchanged —
 * converting hasPermission to async would ripple into a recursive tree walk
 * and a Socket.IO auth helper, where a missed `await` silently becomes an
 * always-true security check. The cache is primed once at API boot
 * (apps/api/src/main.ts, before the server accepts traffic) and explicitly
 * refreshed by the Permission Management API after every write, so an
 * admin's own save is immediately reflected (read-your-writes), with a
 * defensive periodic refresh as self-healing insurance.
 */
let cache: Map<MembershipRole, Set<string>> | null = null;

function grantKey(resource: string, action: string): string {
  return `${resource}:${action}`;
}

export async function loadRolePermissionCache(): Promise<void> {
  const rows = await prisma.rolePermission.findMany();
  const next = new Map<MembershipRole, Set<string>>();
  for (const row of rows) {
    const set = next.get(row.role) ?? new Set<string>();
    set.add(grantKey(row.resource, row.action));
    next.set(row.role, set);
  }
  cache = next;
}

export async function refreshRolePermissionCache(): Promise<void> {
  await loadRolePermissionCache();
}

export function hasPermission(
  role: MembershipRole,
  resource: keyof typeof ac.statements,
  action: string,
): boolean {
  // SUPERADMIN bypass is unconditional and never consults the DB: it must
  // never be lockable out of its own Permission Management UI, including by
  // mistake. SUPERADMIN intentionally has no RolePermission rows.
  if (role === "SUPERADMIN") return true;
  // Cache must be primed at boot; a null cache here indicates a startup
  // ordering bug. Fail closed, never open.
  if (!cache) return false;
  return cache.get(role)?.has(grantKey(resource, action)) ?? false;
}

// Read-only catalog metadata (resource -> its valid actions), for the Menu
// Management and Permission Management UIs' resource/action pickers. Never
// expose ac itself, and roleStatements no longer exists — RolePermission is
// the only role-grant source now.
export const permissionCatalog: Record<string, readonly string[]> = ac.statements;
