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
