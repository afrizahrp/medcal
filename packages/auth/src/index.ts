/**
 * Better Auth wiring lives here (server + client).
 * Stub for Fase 0 — implement against ngebengkel patterns in Fase 2+.
 */
export const AUTH_ROLES = [
  "SUPERADMIN",
  "ADMIN",
  "SUPERVISOR",
  "TECHNICIAN",
  "FINANCE",
  "CUSTOMER",
] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];

export function assertRole(role: string): role is AuthRole {
  return (AUTH_ROLES as readonly string[]).includes(role);
}
