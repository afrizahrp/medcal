import { createAccessControl } from "better-auth/plugins/access";
import type { MembershipRole } from "@medcal/db";

/**
 * Minimal, mechanism-only permission catalog. Not a full resource/action
 * taxonomy (none is locked in the docs) — just enough to prove the RBAC guard
 * chain per module. Extend per-module as needed.
 * - contactMessage:read (F3): proves the guard chain on ContactMessagesModule.
 * - whitelist:manage (F4, locked): EmailWhitelist CRUD, superadmin-only by default.
 */
const ac = createAccessControl({
  contactMessage: ["read"],
  whitelist: ["manage"],
} as const);

const roleStatements: Record<MembershipRole, ReturnType<typeof ac.newRole>> = {
  SUPERADMIN: ac.newRole({ contactMessage: ["read"], whitelist: ["manage"] }),
  ADMIN: ac.newRole({ contactMessage: ["read"] }),
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
