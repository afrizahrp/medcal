/** Public email domains — never use as CRM domain-match signals (ADR-000) */
export const PUBLIC_EMAIL_DOMAIN_BLOCKLIST = [
  "gmail.com",
  "yahoo.com",
  "yahoo.co.id",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
] as const;
