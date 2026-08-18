# Delta Forensic Audit — apps/portal (`apps.kalibrasimedika.co.id`)

**Type:** Read-only delta audit, conducted after the main containerization forensic audit (`04-production-containerization-forensic-audit.md`) to determine how `apps/portal` fits into the already-approved topology. No files were modified during this audit. **Status: implemented** — see `apps/portal/Dockerfile`, `docker-compose.prod.yml`'s `portal` service, and `infra/nginx/apps.kalibrasimedika.co.id.conf.example`.

## Critical finding — hostname naming

Inspection surfaced a naming detail worth recording clearly: `apps/portal/src/proxy.ts` does not recognize a hostname called `app.kalibrasimedika.co.id` (singular). VERIFIED:
```ts
const MANAGEMENT_PREFIX = "apps.";   // apps.kalibrasimedika.co.id
const CLIENT_PREFIX = "portal.";     // portal.kalibrasimedika.co.id
```
This is one Next.js app serving **two** hostnames by design (the "Adoption Matrix, Option A" pattern): `apps.kalibrasimedika.co.id` for the management/staff UI, `portal.kalibrasimedika.co.id` for a separate customer-facing UI. Both are already anticipated in `.env.production.example`'s `TRUSTED_ORIGINS`. **The approved and implemented production hostname is `apps.kalibrasimedika.co.id`** — matching the code and the already-prepared `TRUSTED_ORIGINS` template exactly, zero code change needed. `portal.kalibrasimedika.co.id` (the customer surface) is not deployed in this pass — no DNS exists for it, and it was out of scope.

## 1. apps/portal inspection

| | |
|---|---|
| **Framework** | Next.js 16.2.12, App Router, React 19.2.8 — same stack as apps/web |
| **Build command** | `next build` |
| **Start command** | `next start -p 3003` |
| **Expected port** | 3003 |
| **Node version** | Inherits root `>=20`, no per-app override |
| **Workspace deps** | `@medcal/auth` (client subpath only, deliberately Prisma-free), `@medcal/shared`, `@medcal/ui` |
| **Static assets** | `apps/portal/public/` exists and is not empty — favicon set, logo files, and the same two marketing `.mp4` files as `apps/web/public/` |
| **Env vars** | `NEXT_PUBLIC_API_URL` (build-time) and `DEV_DEFAULT_HOST_GROUP` (dev-only fallback) — the entire surface |
| **Auth/session** | Better Auth React client (`@medcal/auth/client`) + a client-side `useRequireSession()` hook calling `apiFetch("/me")` |
| **API dependency** | Only `apps/api`, directly. No `apps/web-api` reference anywhere in `apps/portal` |
| **Direct Postgres/Prisma access** | None — confirmed by exhaustive grep |
| **Generated artifacts required** | None |
| **WebSocket** | Yes — `management-chat-socket.tsx` opens a direct `socket.io-client` connection to `NEXT_PUBLIC_API_URL`, identical pattern to apps/web's visitor chat |
| **Special reverse-proxy headers** | `proxy.ts` is Next.js middleware reading the `Host` header to decide management-vs-client routing — Nginx must forward the original `Host` header unmodified, and this is load-bearing, not just best practice |
| **Health/readiness endpoint** | None — same gap as apps/web |

## 2. Domain / routing

Container port 3003. Plain `location / { proxy_pass http://127.0.0.1:3003; }` — no path-based routing needed (unlike web-api's `/public/*` split). No WebSocket handling needed on this Nginx block — portal's Socket.IO traffic goes straight to `api.kalibrasimedika.co.id`, never through its own origin/container.

## 3. Authentication / session

Better Auth client: `createAuthClient({ baseURL: process.env.NEXT_PUBLIC_API_URL })` — auth flows go directly to `apps/api`. Cookie domain: unchanged from the already-approved baseline — `.kalibrasimedika.co.id` in production, `crossSubDomainCookies` enabled — is what makes the session cookie set by `apps/api` readable by the browser when it's on `apps.kalibrasimedika.co.id`. No cookie-path restriction, no host-only cookie logic. No OAuth providers found anywhere in the repo. Whatever hostname portal actually serves from must be a literal entry in `TRUSTED_ORIGINS`, or every credentialed browser call to `apps/api` fails outright — `apps.kalibrasimedika.co.id` already was.

## 4. API dependency trace

```
Browser
  ↓
apps.kalibrasimedika.co.id
  ↓
apps/portal (Next.js, port 3003) — serves the page shell only
  ↓ (browser makes its OWN separate calls, not proxied through portal's server)
api.kalibrasimedika.co.id
  ↓
apps/api  ← the only backend. No web-api involvement anywhere in this flow.
```

No server-side (Next.js server component / route handler) calls to any internal-only hostname were found — every API dependency is a browser-side call to the public `api.kalibrasimedika.co.id`, not a new internal Docker-network edge.

## 5. Topology delta

```
BEFORE:
kalibrasimedika.co.id            → apps/web, /public/* → apps/web-api
api.kalibrasimedika.co.id        → apps/api

AFTER:
kalibrasimedika.co.id            → apps/web, /public/* → apps/web-api
api.kalibrasimedika.co.id        → apps/api
apps.kalibrasimedika.co.id       → apps/portal
```

Additional internal (server-to-server) connections introduced: **none.** Portal only adds a new *browser*-to-`apps/api` edge, architecturally identical in shape to apps/web's visitor-chat edge. `apps/api`'s `TRUSTED_ORIGINS`/CORS/cookie-domain config already anticipated this exact addition.

## 6. Docker impact

Both apps/web and apps/portal need their own Dockerfile (cannot literally share one — each Next.js app needs its own `turbo prune <app> --docker` target) but can share the same *pattern*. Portal's env surface is smaller (one build-time var instead of three — no web-api dependency, no reCAPTCHA usage anywhere in its source).

## 7. Docker Compose impact (implemented)

New `portal` service: loopback-published `127.0.0.1:3003:3003`, `medcal_net`, `build.args: { NEXT_PUBLIC_API_URL }`, no `depends_on` (portal never calls web-api or web server-to-server; its only dependency, apps/api, is reached from the browser).

## 8. Nginx impact (implemented)

`infra/nginx/apps.kalibrasimedika.co.id.conf.example` — single `location /` → `127.0.0.1:3003`, `proxy_set_header Host $host;` called out as load-bearing. No WebSocket handling needed.

## 9. Security review

No new CORS/cookie/auth surface needed beyond what's already provisioned — VERIFIED by direct trace of `proxy.ts`, `client.ts`, `api-fetch.ts`, `use-require-session.ts`, cross-referenced against `.env.production.example`'s existing `TRUSTED_ORIGINS`. The one real risk was the hostname-naming question above, resolved by deploying at `apps.kalibrasimedika.co.id` exactly.

## 10. Environment variable delta

No new variable names introduced — portal reuses the exact same `NEXT_PUBLIC_API_URL` variable apps/web already needs, just as a second build-time consumer.

## Final recommendation (as delivered)

### DELTA VERDICT: YELLOW → resolved to GREEN once deployed under `apps.kalibrasimedika.co.id` exactly (implemented)

1. Confirmed hostname: `apps.kalibrasimedika.co.id`.
2. Target service: `apps/portal` (single container serving this one hostname in this pass).
3. Expected port: 3003.
4. API dependency: `apps/api` only, directly from the browser.
5. Authentication model: Better Auth session cookie, scoped `.kalibrasimedika.co.id`, already provisioned.
6. Docker impact: new `apps/portal/Dockerfile`, same pattern as apps/web, port 3003 — implemented.
7. docker-compose impact: one new `portal` service block — implemented.
8. Nginx impact: one new server block — implemented as an `.conf.example` file, not yet applied to the live VPS.
9. Environment-variable delta: no new variable names.
10. Security considerations: none new beyond confirming the deployed hostname matches `apps.` exactly — confirmed.
11. Conflict with previously approved topology: none, once deployed at `apps.kalibrasimedika.co.id` (not a hypothetical singular `app.`).
12. Implementation steps: all completed — see `docs/Deployment/production-containerization-implementation-summary.md`.
