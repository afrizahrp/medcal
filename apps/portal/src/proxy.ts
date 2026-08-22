import { NextRequest, NextResponse } from "next/server";

const MANAGEMENT_PREFIX = "apps.";
const CLIENT_PREFIX = "portal.";

/**
 * apps/portal is ONE Next.js app serving two hostnames (locked, Adoption
 * Matrix "Option A"): apps.kalibrasimedika.co.id (management) and
 * portal.kalibrasimedika.co.id (customer). This is a UX/routing split only —
 * RBAC enforcement stays server-side in apps/api's CompanyRoleGuard.
 *
 * Dev has no real subdomains by default; use apps.localhost:3003 /
 * portal.localhost:3003 (browsers resolve *.localhost to 127.0.0.1
 * automatically, RFC 6761) to exercise the same host-matching code path as
 * production. DEV_DEFAULT_HOST_GROUP is a fallback only for plain
 * localhost:3003 with no subdomain typed.
 */
export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const group = host.startsWith(MANAGEMENT_PREFIX)
    ? "management"
    : host.startsWith(CLIENT_PREFIX)
      ? "client"
      : process.env.DEV_DEFAULT_HOST_GROUP === "client"
        ? "client"
        : "management";

  const url = request.nextUrl.clone();
  url.pathname = `/${group}${request.nextUrl.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // firebase-messaging-sw.js is a root App Router route handler — must not be
  // rewritten to /management/... or /client/... (host-group prefix).
  // Public assets (icons, manifest, media) must also bypass rewrite so
  // /short-logo.png and PWA install icons resolve from /public at root.
  matcher: [
    "/((?!_next|favicon.ico|manifest.webmanifest|site.webmanifest|firebase-messaging-sw.js|sign-in|[^/]+\\.(?:png|ico|webmanifest|jpg|jpeg|svg|webp|mp4)).*)",
  ],
};
