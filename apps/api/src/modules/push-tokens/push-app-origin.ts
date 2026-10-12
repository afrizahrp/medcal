import type { PushApp } from "@medcal/db";

/**
 * Server-side application identity for FCM token registration.
 *
 * A browser sets the `Origin` header on every cross-origin request and page
 * script cannot override it, so it is the one signal the server can trust about
 * WHICH web app is registering a token (the request body's `app` is only a
 * client claim and is merely cross-checked against this).
 *
 * Explicit allowlists, no fallback (see .env.example):
 * - origin in PORTAL_ORIGINS   (and in TRUSTED_ORIGINS) -> PORTAL
 * - origin in TECH_PWA_ORIGINS (and in TRUSTED_ORIGINS) -> TECH_PWA
 * - anything else -> null (rejected): missing/malformed origin, a trusted
 *   origin that belongs to neither app (marketing site, customer portal), an
 *   origin listed under both apps (ambiguous), or an unconfigured list.
 *
 * TRUSTED_ORIGINS keeps its existing CORS/auth role and is still required, so
 * the two lists can narrow but never widen what is trusted.
 *
 * Limit: a non-browser client holding a valid session cookie can forge the
 * header, but it can then only mislabel its own caller's token; it cannot
 * reach another user's tokens, and the token owner is still session-derived.
 */
export function normalizeOrigin(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

function parseOriginList(raw: string | undefined): Set<string> {
  const origins = new Set<string>();
  for (const entry of (raw ?? "").split(",")) {
    const origin = normalizeOrigin(entry);
    if (origin) origins.add(origin);
  }
  return origins;
}

export function resolvePushAppFromOrigin(
  originHeader: string | undefined,
  env: { TRUSTED_ORIGINS?: string; PORTAL_ORIGINS?: string; TECH_PWA_ORIGINS?: string } = process.env,
): Extract<PushApp, "PORTAL" | "TECH_PWA"> | null {
  const origin = normalizeOrigin(originHeader);
  if (!origin) return null;

  if (!parseOriginList(env.TRUSTED_ORIGINS).has(origin)) return null;

  const isPortal = parseOriginList(env.PORTAL_ORIGINS).has(origin);
  const isTechPwa = parseOriginList(env.TECH_PWA_ORIGINS).has(origin);
  if (isPortal === isTechPwa) return null; // neither, or ambiguous
  return isPortal ? "PORTAL" : "TECH_PWA";
}
