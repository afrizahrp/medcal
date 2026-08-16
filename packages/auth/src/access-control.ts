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
 */
const ac = createAccessControl({
  contactMessage: ["read"],
  whitelist: ["manage"],
  lead: ["read", "update"],
  chat: ["read", "reply", "close"],
} as const);

const roleStatements: Record<MembershipRole, ReturnType<typeof ac.newRole>> = {
  SUPERADMIN: ac.newRole({
    contactMessage: ["read"],
    whitelist: ["manage"],
    lead: ["read", "update"],
    chat: ["read", "reply", "close"],
  }),
  ADMIN: ac.newRole({
    contactMessage: ["read"],
    lead: ["read", "update"],
    chat: ["read", "reply", "close"],
  }),
  SUPERVISOR: ac.newRole({}),
  TECHNICIAN: ac.newRole({}),
  FINANCE: ac.newRole({}),
  CUSTOMER: ac.newRole({}),
};

export function hasPermission(
  role: MembershipRole,
  resource: keyof typeof ac.statements,
  action: string,
): boolean {
  return roleStatements[role].authorize({ [resource]: [action] } as never).success;
}
