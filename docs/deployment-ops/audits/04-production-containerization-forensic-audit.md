# Forensic Production Containerization Audit — MedCal Monorepo

**Type:** Read-only forensic audit conducted before containerization implementation began. No files were modified during this audit. **Status: implemented.** See `docs/Deployment/production-containerization-implementation-summary.md` for what was actually built, and `apps/web-api/Dockerfile`, `apps/web/Dockerfile`, `apps/portal/Dockerfile`, `docker-compose.prod.yml`, `.env.production.example`, and `infra/nginx/*.conf.example` for the current, real production topology. This file is kept as the original diagnostic/design record.

Every claim below is evidence-tagged: **VERIFIED** (read directly from repo/live build), **INFERRED** (deduced from verified facts, not independently reproduced), **RECOMMENDED** (this audit's own design proposal), or **REQUIRES MANUAL PRODUCTION VERIFICATION**.

---

## 1. Executive verdict (at time of audit)

## YELLOW

Nothing here was a dead end — the architecture was coherent and every piece needed already existed in the codebase in working form (env schema, cookie-domain logic, CORS, rate limiting, a proven Dockerfile pattern). Three real gaps needed closing before a first production deploy: **(a)** `apps/web-api` and `apps/web` had zero Docker artifacts, **(b)** a straight port of `apps/web-api`'s own `"start": "node dist/index.js"` script would likely have reproduced the exact `ERR_MODULE_NOT_FOUND` failure `apps/api`'s Dockerfile already had to work around, and **(c)** the routing question ("what does `api.kalibrasimedika.co.id` actually serve, and where does web-api live?") had a clear best answer but no artifact yet implementing it.

---

## 2. Current production topology (at time of audit)

```
Internet
   │
   ├── kalibrasimedika.co.id  ──────► DNS registered, nothing behind it yet
   │
   └── api.kalibrasimedika.co.id ───► DNS registered. Nginx conf EXISTS but "NOT YET APPLIED".
                                       Would proxy → 127.0.0.1:3001 → apps/api container (built, verified,
                                       not yet running in production).

Real VPS at time of audit (from docs/Architecture/02-foundation-implementation-plan.md §F5, dated 2026-08-14):
   - Ubuntu 24.04.4, Nginx already live on :80/:443 with Certbot, serving 5 unrelated existing sites
     (bipmed.co.id, bumiindah.co.id + 3 subdomains) via PM2 (7 apps).
   - Docker already installed, currently running exactly one unrelated container (mssql2019).
   - Native PostgreSQL already running as existing VPS infrastructure (not containerized).
   - UFW active; 80/443 allowed externally. Flagged, not fixed: 5432/tcp and 8000/tcp are also
     open from Anywhere — pre-existing exposure, unrelated to this containerization work.
   - docker-compose.prod.yml had never actually been brought up on the real VPS.

apps/web-api: no hostname decided, no Docker artifact, not in any compose file.
apps/portal, apps/tech-pwa: not containerized, out of current scope.
```

## 3. Recommended production topology (implemented)

```
Internet
   │
   ├── kalibrasimedika.co.id  (existing Nginx, new server block, TLS via Certbot)
   │      │
   │      ├── location /              → 127.0.0.1:3000  (apps/web container, Next.js)
   │      └── location /public/       → 127.0.0.1:3002  (apps/web-api container)
   │
   ├── api.kalibrasimedika.co.id  (Nginx conf drafted, unapplied)
   │      │
   │      └── location /              → 127.0.0.1:3001  (apps/api container — REST + Socket.IO)
   │
   └── apps.kalibrasimedika.co.id (added via a follow-up delta audit — see §Delta below)
          │
          └── location /              → 127.0.0.1:3003  (apps/portal container)

Docker (single docker-compose.prod.yml, one bridge network "medcal_net"):
   api      → 127.0.0.1:3001:3001
   web-api  → 127.0.0.1:3002:3002
   web      → 127.0.0.1:3000:3000
   portal   → 127.0.0.1:3003:3003
   (no Postgres container — native VPS Postgres, reached via host.docker.internal)
```

---

## 4. Domain / DNS / routing — explicit mapping and reasoning

**1. What should `https://kalibrasimedika.co.id` serve?** `apps/web`. VERIFIED — only app whose SEO code assumes this exact bare domain.

**2. What should `https://api.kalibrasimedika.co.id` serve?** `apps/api` only. VERIFIED — existing (unapplied) Nginx conf example already targets `127.0.0.1:3001` explicitly, with WS-upgrade headers.

**3. Does `apps/web` communicate directly with `apps/api`?** Yes — VERIFIED. `apps/web/src/lib/use-visitor-chat.ts:40,75` opens a Socket.IO connection straight to `NEXT_PUBLIC_API_URL` for the real-time chat transport, bypassing web-api entirely for that one purpose.

**4. Does `apps/web` communicate directly with `apps/web-api`?** Yes — VERIFIED. Contact Form, WhatsApp identity dialog, and chat-session creation all POST/GET directly to `NEXT_PUBLIC_WEB_API_URL`.

**5. Does `apps/web-api` communicate with `apps/api` internally?** Yes — VERIFIED. Every web-api route forwards via server-side `fetch(`${apiUrl}/internal/...`)` using `INTERNAL_API_SECRET` as a shared-secret header. Web-api never touches the database (VERIFIED — no `@medcal/db`/Prisma import anywhere in web-api or its three workspace dependencies).

**6. Which services need public HTTP exposure?** All three (now four with portal): `apps/web`, `apps/api` (its Socket.IO gateway is called directly by browsers from both `apps/web` and `apps/portal`), and `apps/web-api`. The `main.ts` comment claiming apps/api "stays internal-only behind Nginx" means *not directly bound to the public network interface* (loopback-bound), not unreachable from the internet — it's reached through Nginx's public reverse proxy.

**7. Can apps/api remain private behind Nginx/internal Docker networking?** Private-from-the-host-network, yes (loopback-only port publish) — but not private-from-the-internet, because it must remain reachable at `api.kalibrasimedika.co.id` for both apps/web's visitor chat and apps/portal's management chat.

**8. Does the existing auth/session architecture impose a hostname requirement?** Yes — VERIFIED, and the hardest constraint in the whole topology. `packages/auth/src/index.ts`'s `crossSubDomainCookies` is only enabled when `COOKIE_DOMAIN` is set, and production sets it to `.kalibrasimedika.co.id` specifically so the session cookie is shared across subdomains. Every app that needs to share a session or the ChatSessionToken cookie must live under a `*.kalibrasimedika.co.id` subdomain.

**9. Does `CHAT_SESSION_TOKEN_SECRET`/`COOKIE_DOMAIN`/cross-origin cookie config impose hostname requirements?** Yes — VERIFIED. `apps/web-api/src/index.ts` sets the `ChatSessionToken` cookie with `domain: cookieDomain` (`.kalibrasimedika.co.id` in prod), and `apps/api/src/modules/chat/chat.gateway.ts` reads that same cookie during the Socket.IO handshake. Web-api's eventual hostname/path must itself be under `kalibrasimedika.co.id`'s domain umbrella.

**10. Is `api.kalibrasimedika.co.id` sufficient, or is another subdomain technically required?**

**Recommended and implemented: `api.kalibrasimedika.co.id` is sufficient for `apps/api`, and no new subdomain was required for `apps/web-api` either — path-based routing under the existing `kalibrasimedika.co.id`.** Web-api's routes are all prefixed `/public/*`, and apps/web's own route tree has zero collision with that prefix. Routing `kalibrasimedika.co.id/public/*` → web-api makes those calls same-origin — no cross-origin CORS even needed. This is what was actually implemented.

---

## 5. Service matrix (at time of audit, before apps/portal was added to scope)

| Service | Container? | Public? | Port | Depends on | Healthcheck | Network |
|---|---|---|---|---|---|---|
| `apps/web` | Yes (planned) | Yes, via Nginx `kalibrasimedika.co.id` `location /` | 3000 | web-api, apps/api (browser-side) | No dedicated route — RECOMMENDED: `GET /` 200 | `medcal_net` |
| `apps/api` | Yes (existing, built, verified) | Yes, via Nginx `api.kalibrasimedika.co.id` | 3001 | native PostgreSQL | `GET /health` — shallow liveness only, no DB check | `medcal_net` |
| `apps/web-api` | Yes (planned) | Yes, via Nginx `kalibrasimedika.co.id/public/*` | 3002 | apps/api (server-to-server) | `GET /health` — shallow liveness only | `medcal_net` |
| PostgreSQL | No — native, deliberately not containerized | No — should stay non-public despite UFW gap | 5432 (host) | — | N/A | Docker bridge gateway |
| Nginx | No — existing shared VPS instance | Yes | 80/443 | all app containers | Existing VPS-level monitoring | Host network |

## 6. apps/web-api Docker design (implemented as designed)

| | |
|---|---|
| **BUILD METHOD** | Reuse `apps/api/Dockerfile`'s `turbo prune @medcal/web-api --docker` → `pnpm install --frozen-lockfile` → non-root runtime stage. No Prisma stage. |
| **RUNTIME ENTRYPOINT** | `CMD ["node_modules/.bin/tsx", "src/index.ts"]` — **not** `node dist/index.js`, for the same reason `apps/api` runs via `tsx`. |
| **PORT** | 3002 |
| **PUBLIC/PRIVATE** | Loopback-published, reached publicly only via Nginx path-routing under `kalibrasimedika.co.id/public/*`. |

---

## 7. Docker Compose changes required (at time of audit; implemented)

New `web-api` service: `build.dockerfile: apps/web-api/Dockerfile`, `env_file: .env.production`, `ports: 127.0.0.1:3002:3002`, `depends_on: api (service_healthy)`, healthcheck against `/health`. New `web` service: analogous, plus `build.args` for the three `NEXT_PUBLIC_*` values. **No existing service configuration needed modification.**

---

## 8. Production environment matrix (authoritative at time of audit)

| Variable | Service | Status at time of audit |
|---|---|---|
| `DATABASE_URL` | apps/api | Template present |
| `COMPANY_ID` | apps/api, web-api | Present |
| `API_URL` (web-api's forwarding target) | web-api | **Gap at time of audit** — no template entry for web-api's own copy |
| `WEB_API_PORT` | web-api | **Missing from prod template** at time of audit |
| `INTERNAL_API_SECRET` | apps/api, web-api | Present (placeholder) |
| `CHAT_SESSION_TOKEN_SECRET`/`_TTL_MS` | apps/api, web-api | **Missing from prod template** at time of audit |
| `CHAT_WIDGET_ORIGINS` | web-api | **Missing from prod template** at time of audit |
| `CONTACT_FORM_RATE_LIMIT_*`, `WEB_CHAT_RATE_LIMIT_*`, `CHAT_SESSION_RATE_LIMIT_*`, `WHATSAPP_LEAD_RATE_LIMIT_*` | web-api | **Missing from prod template** at time of audit |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WEB_API_URL`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | apps/web (build-time) | **Missing entirely** at time of audit |
| `RECAPTCHA_SECRET_KEY`/`_MIN_SCORE` | web-api | **Missing from prod template** at time of audit |
| `BETTER_AUTH_SECRET`/`_URL` | apps/api | Present |
| `TRUSTED_ORIGINS` | apps/api, web-api | Present, already correct |
| `COOKIE_DOMAIN` | apps/api, web-api | Present |

**All "missing" rows above were subsequently added to `.env.production.example` during implementation.** See that file for the current, complete contract.

---

## 9. Reverse proxy / WebSocket requirements

Socket.IO shares the same HTTP server/port as REST in `apps/api` — no separate WS port. Client side forces `transports: ["websocket"]` (both apps/web and apps/portal) — no HTTP long-polling fallback, so the Nginx proxy's WS-upgrade headers are load-bearing, not optional. The existing (unapplied) `infra/nginx/api.kalibrasimedika.co.id.conf.example` already had the correct WS-upgrade headers — VERIFIED as already correctly designed. The `kalibrasimedika.co.id` Nginx block needs no WS handling — Socket.IO traffic only ever goes to `api.kalibrasimedika.co.id` directly from the browser.

---

## 10. Security review (findings acted on during implementation, unless noted)

- No unnecessary exposed ports in the proposed design — all app containers loopback-only.
- **Public database exposure**: UFW's pre-existing 5432/8000-open-to-Anywhere exposure predates and is unrelated to this containerization work — **still unresolved, requires VPS operator action, out of this work's scope.**
- Secret leakage into images: none — no `NEXT_PUBLIC_*` var is a secret.
- Build-time vs runtime secret injection: secrets stay `env_file`-injected at runtime, never build `ARG`s — **implemented this way.**
- CORS: correctly scoped everywhere audited, though `parseTrustedOrigins` is duplicated identically in 4 separate files — a maintainability smell, not fixed as part of this containerization work (out of scope — application code change, not infra).
- **`trust proxy` gap in web-api**: real gap found — **fixed during implementation** (`app.set("trust proxy", "loopback")`).
- Helmet: applied in web-api, absent in apps/api (the service actually holding auth/DB) — **not fixed, flagged as a remaining risk, out of scope for infra-only work.**

---

## Delta: apps/portal added to scope

A follow-up delta audit — full text in `docs/Deployment/audits/05-apps-portal-delta-audit.md` — extended this same topology to include `apps/portal` at `apps.kalibrasimedika.co.id`, using the exact same path/pattern established above. Key findings from that delta, now implemented:

- `apps/portal`'s own routing (`src/proxy.ts`) recognizes `apps.` (management) and `portal.` (client) hostname prefixes — **not** a hypothetical singular `app.` hostname. The approved/implemented hostname is `apps.kalibrasimedika.co.id`, matching the code exactly with zero code changes needed.
- Portal has zero database/Prisma access and zero dependency on apps/web-api — confirmed by source inspection, and its Dockerfile was built with only one build-time variable (`NEXT_PUBLIC_API_URL`) accordingly.
- Portal's Socket.IO (management chat) and all its API/session calls go directly from the browser to `apps/api` — no new container-to-container edge introduced.
- `proxy_set_header Host $host;` in portal's Nginx block is load-bearing, not just best practice, since portal's own middleware reads the incoming `Host` header to decide routing.

---

## Exact files reviewed (across the full forensic audit + delta)

`pnpm-workspace.yaml`, `turbo.json`, root `package.json`, `apps/api/Dockerfile`, `docker-compose.prod.yml`, `docker-compose.yml`, `.dockerignore`, `infra/nginx/api.kalibrasimedika.co.id.conf.example`, `docs/Architecture/02-foundation-implementation-plan.md` (§F5), `docs/Deployment/README.md`, `apps/api/src/health.controller.ts`, `apps/api/src/app.module.ts`, `apps/web-api/src/index.ts`, `apps/web-api/package.json`, `apps/web-api/tsconfig.json`, `apps/api/package.json`, `packages/db/package.json`, `packages/db/prisma/schema.prisma`, `packages/config/package.json`, `packages/config/src/index.ts`, `packages/notifications/package.json`, `packages/shared/package.json`, `.env`, `.env.example`, `.env.production.example`, `apps/web/next.config.js`, `apps/web/package.json`, `apps/api/src/main.ts`, `apps/api/src/modules/chat/chat.gateway.ts`, `packages/auth/src/index.ts`, `packages/auth/src/client.ts`, `packages/shared/src/http/api-fetch.ts`, `apps/portal/src/proxy.ts`, `apps/portal/src/lib/management-chat-socket.tsx`, `apps/portal/src/lib/use-require-session.ts`, `apps/portal/package.json`.
