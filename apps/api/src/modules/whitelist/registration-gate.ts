import { prisma } from "@medcal/db";
import { isAllowedRegistrationDomain, normalizeEmail } from "@medcal/shared";

/**
 * Registration gate (F4, locked): both must hold —
 *  - normalized email domain === kalibrasimedika.co.id (structural check, see
 *    isAllowedRegistrationDomain — not a substring/endsWith check)
 *  - normalized email has a matching ACTIVE EmailWhitelist entry
 * Extracted as a plain function so it's testable without a NestJS/Better Auth
 * harness; apps/api/src/modules/whitelist/registration-gate.hook.ts wires it
 * into Better Auth's databaseHooks.user.create.before.
 */
export async function isRegistrationAllowed(rawEmail: string): Promise<boolean> {
  if (!isAllowedRegistrationDomain(rawEmail)) {
    return false;
  }
  const email = normalizeEmail(rawEmail);
  const entry = await prisma.emailWhitelist.findUnique({ where: { email } });
  return !!entry && entry.status === "ACTIVE";
}
