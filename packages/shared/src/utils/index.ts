export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailDomain(email: string): string {
  const parts = email.trim().toLowerCase().split("@");
  return parts.length === 2 ? parts[1]! : "";
}

// Locked business rule: only this domain may register (backend-enforced, not UI-only).
export const COMPANY_EMAIL_DOMAIN = "kalibrasimedika.co.id";

// Structural check (exact match on the parsed domain, not substring/endsWith) so
// "user@kalibrasimedika.co.id.evil.com" or "user@evilkalibrasimedika.co.id" cannot pass.
export function isAllowedRegistrationDomain(email: string): boolean {
  return emailDomain(email) === COMPANY_EMAIL_DOMAIN;
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
