/**
 * Better Auth wiring lives here (server + client).
 */
import { APIError, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@medcal/db";

export {
  hasPermission,
  permissionCatalog,
  loadRolePermissionCache,
  refreshRolePermissionCache,
} from "./access-control";
// Re-exported so callers throw the exact APIError class this betterAuth()
// instance's internals check `instanceof` against — apps/api also declares
// its own direct "better-auth" dependency, which pnpm can resolve to a
// different peer-dependency-hashed module instance; importing APIError
// straight from "better-auth" there would silently fail Better Auth's
// isAPIError() identity check and collapse into a generic error.
export { APIError };

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

function parseTrustedOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Better Auth server, hosted in-process inside apps/api (locked: no separate auth service).
 * RBAC role authority is UserMembership.role (see F3: apps/api/src/common/guards/company-role.guard.ts
 * and ./access-control.ts) — the Better Auth admin plugin's own User.role/ban endpoints are
 * intentionally not registered here.
 *
 * databaseHooks must be present (even empty) for @thallesp/nestjs-better-auth's
 * @DatabaseHook()/@BeforeCreate() providers to be wired at all — see F4's
 * apps/api/src/modules/whitelist/registration-gate.hook.ts.
 */
const cookieDomain = process.env.COOKIE_DOMAIN || undefined;

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: parseTrustedOrigins(process.env.TRUSTED_ORIGINS),
  emailAndPassword: {
    enabled: true,
    // G4: company-domain registration is still EmailWhitelist-gated; external
    // emails may self-register. No email verification step.
    requireEmailVerification: false,
  },
  advanced: {
    // Unset in local dev (plain host-scoped cookie); production sets COOKIE_DOMAIN=
    // ".kalibrasimedika.co.id" so the session cookie is shared across
    // apps.*/portal.*/technician.* subdomains, per the locked domain topology.
    crossSubDomainCookies: cookieDomain
      ? { enabled: true, domain: cookieDomain }
      : { enabled: false },
  },
  // Required (even empty) for @DatabaseHook()/@BeforeCreate() providers to wire up.
  databaseHooks: {},
});
