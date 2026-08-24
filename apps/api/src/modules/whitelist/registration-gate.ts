import { prisma } from "@medcal/db";
import { isAllowedRegistrationDomain, normalizeEmail, type RegistrationContext } from "@medcal/shared";

/**
 * Why a registration was rejected — for the externally-returned error only.
 * Deliberately coarse: NOT_WHITELISTED covers both "no entry" and "revoked
 * entry" so the response never confirms/denies whether a specific email was
 * ever whitelisted (no enumeration, no DB/model details).
 */
export type DomainRejectionReason = "INVALID_DOMAIN" | "NOT_WHITELISTED";
export type RegistrationRejectionReason = DomainRejectionReason | "ORIGIN_NOT_ALLOWED";

/**
 * G4: company-domain staff still require ACTIVE EmailWhitelist. External
 * domains may self-register without whitelist (no role/membership). Internal
 * helper shared by both registration hooks (registration-origin.hook.ts's
 * @BeforeHook and registration-gate.hook.ts's @BeforeCreate) via
 * getRegistrationRejectionReasonForContext below — both are context-aware
 * (2A fix) so they can never contradict each other on the same request; this
 * function only ever runs for the INTERNAL_STAFF branch, where the company
 * domain's whitelist requirement still applies.
 */
async function evaluateDomainWhitelist(rawEmail: string): Promise<DomainRejectionReason | null> {
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
 * Origin-aware registration gate — used by BOTH registration hooks
 * (registration-origin.hook.ts's @BeforeHook("/sign-up/email") and
 * registration-gate.hook.ts's @BeforeCreate("user")), each deriving the same
 * `context` from the request's Origin header via resolveRegistrationContext,
 * from two different but equivalent sources Better Auth exposes it through
 * (see registration-gate.hook.ts's comment for why both must agree):
 *  - INTERNAL_STAFF: non-company domain rejects immediately; company domain
 *    still requires ACTIVE EmailWhitelist (same rule as evaluateDomainWhitelist).
 *  - CUSTOMER_PORTAL: any domain allowed, including the company domain —
 *    whitelist is never consulted.
 *  - unrecognized/missing Origin: fail closed.
 */
export async function getRegistrationRejectionReasonForContext(
  rawEmail: string,
  context: RegistrationContext | null,
): Promise<RegistrationRejectionReason | null> {
  if (context === null) {
    return "ORIGIN_NOT_ALLOWED";
  }
  if (context === "CUSTOMER_PORTAL") {
    return null;
  }
  // INTERNAL_STAFF
  if (!isAllowedRegistrationDomain(rawEmail)) {
    return "INVALID_DOMAIN";
  }
  return evaluateDomainWhitelist(rawEmail);
}
