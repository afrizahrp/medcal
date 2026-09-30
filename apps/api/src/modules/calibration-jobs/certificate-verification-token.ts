import { randomBytes } from "node:crypto";

/**
 * Opaque public locator for a Certificate. 32 random bytes from the OS CSPRNG
 * (256 bits), base64url-encoded — not derived from Certificate.id, number,
 * customer/device data or any counter, and not sequential. Generated exactly
 * once, when the certificate is issued; never regenerated.
 */
export function generateVerificationToken(): string {
  return randomBytes(32).toString("base64url");
}

/** 32 bytes -> 43 base64url chars. Anything else can never be a real token. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedVerificationToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_SHAPE.test(value);
}

export const VERIFICATION_PATH_PREFIX = "/verify/certificate/";

/**
 * Public URL a QR code points at: the customer portal origin already
 * configured for the deployment (NEXT_PUBLIC_CUSTOMER_PORTAL_URL) + the
 * verification route + the opaque token. Returns null when the origin is not
 * configured — a development URL is never invented.
 */
export function buildVerificationUrl(token: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const origin = env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL?.trim().replace(/\/+$/, "");
  if (!origin) return null;
  return `${origin}${VERIFICATION_PATH_PREFIX}${token}`;
}
