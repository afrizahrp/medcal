export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailDomain(email: string): string {
  const parts = email.trim().toLowerCase().split("@");
  return parts.length === 2 ? parts[1]! : "";
}

// Internal company domain. Staff registration still requires this domain plus
// an ACTIVE EmailWhitelist row (G4). External domains may self-register.
export const COMPANY_EMAIL_DOMAIN = "kalibrasimedika.co.id";

// Structural check (exact match on the parsed domain, not substring/endsWith) so
// "user@kalibrasimedika.co.id.evil.com" or "user@evilkalibrasimedika.co.id" cannot pass.
export function isAllowedRegistrationDomain(email: string): boolean {
  return emailDomain(email) === COMPANY_EMAIL_DOMAIN;
}

export type RegistrationContext = "INTERNAL_STAFF" | "CUSTOMER_PORTAL";

const MANAGEMENT_HOST_PREFIX = "apps.";
const CLIENT_HOST_PREFIX = "portal.";

/**
 * Server-trusted registration context, derived only from the request's Origin
 * header (never a client-supplied body field — see F4 registration gate).
 * Mirrors apps/portal/src/proxy.ts's apps./portal. host-prefix matching so
 * the two hostname discriminators can never drift apart.
 *
 * WARNING for anyone calling Better Auth's signUpEmail/authClient.signUp.email
 * directly (scripts, tests, fixtures — not the real browser register page,
 * which gets Origin from the browser automatically): if the request carries
 * no Origin this function recognizes, apps/api/src/modules/whitelist's
 * registration-origin.hook.ts and registration-gate.hook.ts both fail closed
 * with REGISTRATION_ORIGIN_NOT_ALLOWED. Pass an explicit `headers: new
 * Headers({ origin: "http://apps.localhost:3003" })` (or the portal.*
 * equivalent) on every such call — see bootstrap-superadmin.ts or
 * registration-gate.integration.test.ts for the pattern. This is enforced
 * structurally by registration-origin-callers.test.ts, which scans the repo
 * for new signUpEmail call sites missing this.
 */
export function resolveRegistrationContext(
  origin: string | null | undefined,
  devDefaultHostGroup?: string,
): RegistrationContext | null {
  let host: string;
  try {
    host = new URL(origin ?? "").hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host.startsWith(MANAGEMENT_HOST_PREFIX)) return "INTERNAL_STAFF";
  if (host.startsWith(CLIENT_HOST_PREFIX)) return "CUSTOMER_PORTAL";
  if (host === "localhost" || host === "127.0.0.1") {
    return devDefaultHostGroup === "client" ? "CUSTOMER_PORTAL" : "INTERNAL_STAFF";
  }
  return null;
}

export function isPublicEmailDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  return (
    d === "gmail.com" ||
    d === "yahoo.com" ||
    d === "yahoo.co.id" ||
    d === "outlook.com" ||
    d === "hotmail.com" ||
    d === "live.com" ||
    d === "icloud.com" ||
    d === "aol.com" ||
    d === "proton.me" ||
    d === "protonmail.com"
  );
}

/**
 * Canonical digit-only Indonesian phone form for Lead identity matching
 * (Lead Inbox design review, 2026-08-16, §4): strips all formatting, then
 * normalizes a leading "0" trunk prefix to the "62" country code so
 * "08xx-xxxx-xxxx" and "+62 8xx xxxx xxxx" compare equal. Exact-match only —
 * no fuzzy matching per the locked design.
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) {
    return `62${digits.slice(1)}`;
  }
  return digits;
}

/**
 * Deterministic organization-name comparison value for Lead identity matching
 * (§4): lowercase, trim, collapse internal whitespace. No stemming/fuzzy
 * matching — computed inline at comparison time, not stored, since it's a
 * simple transform of `organizationName`.
 */
export function normalizeOrganizationName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
