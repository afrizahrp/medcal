/**
 * Same-origin API proxy for local customer-portal development.
 * Browser requests stay on the portal host (customer.localhost:3005); Next
 * rewrites them to apps/api. Production does not use these rewrites — the
 * browser keeps calling NEXT_PUBLIC_API_URL on the API origin, with
 * COOKIE_DOMAIN sharing the session cookie across subdomains.
 *
 * Nest mounts Better Auth at /api/auth/* and the rest of the customer
 * surface at /me, /customer/* and /certificate-verification/* (no /api
 * prefix). Every path the browser calls through apiFetch must be listed here,
 * or the dev server answers it with its own 404 (the QR verification page
 * breaks that way).
 */
function customerPortalApiRewrites(apiOrigin) {
  if (typeof apiOrigin !== "string" || apiOrigin.length === 0) return [];
  const origin = apiOrigin.replace(/\/$/, "");
  if (!/^https?:\/\//.test(origin)) return [];
  return [
    { source: "/api/:path*", destination: `${origin}/api/:path*` },
    { source: "/me", destination: `${origin}/me` },
    { source: "/me/:path*", destination: `${origin}/me/:path*` },
    { source: "/customer/:path*", destination: `${origin}/customer/:path*` },
    {
      source: "/certificate-verification/:path*",
      destination: `${origin}/certificate-verification/:path*`,
    },
  ];
}

module.exports = { customerPortalApiRewrites };
