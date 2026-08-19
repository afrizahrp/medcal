import { prisma } from "@medcal/db";
import { isAllowedRegistrationDomain, normalizeEmail } from "@medcal/shared";

/**
 * Why a registration was rejected — for the externally-returned error only.
 * Deliberately coarse: NOT_WHITELISTED covers both "no entry" and "revoked
 * entry" so the response never confirms/denies whether a specific email was
 * ever whitelisted (no enumeration, no DB/model details).
 */
export type RegistrationRejectionReason = "INVALID_DOMAIN" | "NOT_WHITELISTED";

async function evaluateRegistration(rawEmail: string): Promise<RegistrationRejectionReason | null> {
  // G4: company-domain staff still require ACTIVE EmailWhitelist.
  // External domains may self-register without whitelist (no role/membership).
  if (!isAllowedRegistrationDomain(rawEmail)) {
    return null;
  }
  const email = normalizeEmail(rawEmail);
  const entry = await prisma.emailWhitelist.findUnique({ where: { email } });
  if (!entry || entry.status !== "ACTIVE") {
    return "NOT_WHITELISTED";
  }
  return null;
}

/**
 * Registration gate (G4):
 *  - company domain (kalibrasimedika.co.id, exact match via
 *    isAllowedRegistrationDomain) → require a matching ACTIVE EmailWhitelist
 *  - any other domain → allow (no whitelist)
 * Does not create UserMembership or assign a role.
 * Extracted as a plain function so it's testable without a NestJS/Better Auth
 * harness; apps/api/src/modules/whitelist/registration-gate.hook.ts wires it
 * into Better Auth's databaseHooks.user.create.before.
 */
export async function isRegistrationAllowed(rawEmail: string): Promise<boolean> {
  return (await evaluateRegistration(rawEmail)) === null;
}

/** Same checks as isRegistrationAllowed, but reports which one failed. */
export async function getRegistrationRejectionReason(
  rawEmail: string,
): Promise<RegistrationRejectionReason | null> {
  return evaluateRegistration(rawEmail);
}
