import { createAccessControl } from "better-auth/plugins/access";
import type { MembershipRole } from "@medcal/db";

/**
 * Minimal, mechanism-only permission catalog. Not a full resource/action
 * taxonomy (none is locked in the docs) — just enough to prove the RBAC guard
 * chain per module. Extend per-module as needed.
 * - contactMessage:read (F3): proves the guard chain on ContactMessagesModule.
 * - whitelist:manage (F4, locked): EmailWhitelist CRUD, superadmin-only by default.
 * - lead:read/lead:update (Lead Inbox, locked 2026-08-16 Decision 5 — per-verb,
 *   not a blanket manage): no lead:assign — assignment is out of scope for v1
 *   (Decision 3).
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
 */
const ac = createAccessControl({
  contactMessage: ["read"],
  whitelist: ["manage"],
  lead: ["read", "update"],
  chat: ["read", "reply", "close"],
  users: ["read", "manage"],
  membership: ["manage"],
  menu: ["manage"],
  managementDashboard: ["read"],
  customerDashboard: ["read"],
} as const);

const roleStatements: Record<MembershipRole, ReturnType<typeof ac.newRole>> = {
  SUPERADMIN: ac.newRole({
    contactMessage: ["read"],
    whitelist: ["manage"],
    lead: ["read", "update"],
    chat: ["read", "reply", "close"],
    users: ["read", "manage"],
    membership: ["manage"],
    menu: ["manage"],
    managementDashboard: ["read"],
    customerDashboard: ["read"],
  }),
  ADMIN: ac.newRole({
    contactMessage: ["read"],
    lead: ["read", "update"],
    chat: ["read", "reply", "close"],
    users: ["read"],
    membership: ["manage"],
    managementDashboard: ["read"],
    customerDashboard: ["read"],
  }),
  SUPERVISOR: ac.newRole({ managementDashboard: ["read"] }),
  TECHNICIAN: ac.newRole({ managementDashboard: ["read"] }),
  FINANCE: ac.newRole({ managementDashboard: ["read"] }),
  CUSTOMER: ac.newRole({ customerDashboard: ["read"] }),
};

export function hasPermission(
  role: MembershipRole,
  resource: keyof typeof ac.statements,
  action: string,
): boolean {
  return roleStatements[role].authorize({ [resource]: [action] } as never).success;
}

// Read-only catalog metadata (resource -> its valid actions), for the Menu
// Management UI's resource/action picker. Never expose roleStatements or ac
// itself — this is the only piece of access-control.ts's internals meant to
// leave the server boundary as data.
export const permissionCatalog: Record<string, readonly string[]> = ac.statements;
