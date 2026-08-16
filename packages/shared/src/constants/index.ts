/**
 * Fixed greeting used both as the WhatsApp identity flow's ContactMessage.
 * message (server-authoritative, apps/web-api) and as the pre-filled wa.me
 * deep-link text (apps/web) — one source so the two never drift apart.
 */
export const WHATSAPP_DEFAULT_MESSAGE =
  "Halo, saya ingin konsultasi kebutuhan kalibrasi alat kesehatan.";

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
