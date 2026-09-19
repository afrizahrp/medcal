# Production Containerization — Implementation Summary

**Status as of this writing: implemented and validated locally. NOT yet deployed to the production VPS.**

This is the current, authoritative record of the production containerization work for `apps/web`, `apps/api`, `apps/web-api`, and `apps/portal`. The design reasoning and evidence trail live in `docs/Deployment/audits/` (read those for *why*; this file is *what was built and what's left*).

## Approved production topology (implemented)

```
https://kalibrasimedika.co.id            → apps/web            (container port 3000)
https://kalibrasimedika.co.id/public/*   → apps/web-api         (container port 3002)
https://api.kalibrasimedika.co.id        → apps/api             (container port 3001)
https://apps.kalibrasimedika.co.id       → apps/portal          (container port 3003)
```

PostgreSQL remains external/native on the VPS — never containerized. All four app containers publish to `127.0.0.1` only, never `0.0.0.0` — reachable from Nginx on the same host, never directly from the Internet.

## IMPLEMENTED

**Files created:**
- `apps/web-api/Dockerfile` — multi-stage, modeled on `apps/api/Dockerfile`'s `turbo prune`/`pnpm install --frozen-lockfile` pattern, no Prisma stage (web-api has zero DB access), runs via `tsx` (not compiled `dist/index.js`) for the same `ERR_MODULE_NOT_FOUND` reason `apps/api` already had to work around.
- `apps/web/Dockerfile` — prune/install/build pattern for `@medcal/web`, `NEXT_PUBLIC_*` declared as `ARG`/`ENV` before `next build`, runtime via `next start -p 3000`.
- `apps/portal/Dockerfile` — same pattern for `@medcal/portal`, single `NEXT_PUBLIC_API_URL` build arg (no web-api/reCAPTCHA/Prisma — confirmed unnecessary by source inspection).
- `infra/nginx/kalibrasimedika.co.id.conf.example` — `/` → web, `/public/` → web-api.
- `infra/nginx/apps.kalibrasimedika.co.id.conf.example` — `/` → portal, with `proxy_set_header Host $host;` called out as load-bearing (portal's own `proxy.ts` reads it).

**Files modified:**
- `docker-compose.prod.yml` — added `web-api`, `web`, `portal` services (loopback-only ports, `medcal_net`, `restart: unless-stopped`, healthchecks). `depends_on: api (service_healthy)` added only to `web-api` — the one real container-level dependency.
- `apps/web-api/src/index.ts` — added `app.set("trust proxy", "loopback")`. Chose `"loopback"` over `true`: Nginx and the container talk over `127.0.0.1` only, so trusting `X-Forwarded-For` from `127.0.0.1`/`::1` is precise; `true` would trust a forwarded-for header from *any* source.
- `.env.production.example` — extended with every previously-missing variable (`WEB_API_PORT`, `CHAT_SESSION_TOKEN_SECRET`/`_TTL_MS`, `CHAT_WIDGET_ORIGINS`, `RECAPTCHA_SECRET_KEY`/`_MIN_SCORE`, all rate-limit vars, and the `NEXT_PUBLIC_*` build-time section). `TRUSTED_ORIGINS` already correctly included `apps.kalibrasimedika.co.id` — untouched.
- `.dockerignore` — **fixed a real bug found during implementation**: a bare `public` entry excluded *every* `public/` directory repo-wide, including `apps/web/public/` and `apps/portal/public/` (favicons, logo, marketing video). Would have silently shipped images with missing static assets. Anchored to `/public` (repo-root only).
- `.gitignore` — **fixed another real gap**: `.env.production` (the exact filename `docker-compose.prod.yml`'s `env_file:` expects, containing all the real secrets) was never gitignored. Added it.
- `infra/nginx/api.kalibrasimedika.co.id.conf.example` — updated its stale comment to point at the now-created sibling conf files.

**One deviation from the original literal spec, with reasoning:** an early instruction specified `NEXT_PUBLIC_WEB_API_URL=https://kalibrasimedika.co.id/public`. Source inspection showed every call site in `apps/web/src` already appends `/public/...` itself (e.g. `` `${WEB_API_URL}/public/chat-sessions` ``, matching the dev default `http://localhost:3002` with no `/public` suffix). Using the literal value would have produced `.../public/public/chat-sessions` — a real double-path bug breaking Contact Form, Web Chat session creation, and WhatsApp lead submission. Set to the bare origin `https://kalibrasimedika.co.id` instead; documented extensively in both `.env.production.example` and `apps/web/Dockerfile` so it isn't "corrected" back by mistake later.

## VALIDATED LOCALLY

- All four `docker build`s succeeded (`api`, `web-api`, `web`, `portal`), built via `docker compose --env-file .env.production.local -f docker-compose.prod.yml build`.
- All four containers started and reached `healthy` status; `web-api`'s `tsx` runtime correctly resolved its raw-TypeScript workspace imports (the one real open risk from the design phase — did not materialize).
- No errors, missing-env warnings, Prisma errors, module-resolution errors, or port conflicts in any container log (explicitly grepped).
- **Website**: `GET /` on web returns 200 with real page content; `/robots.txt`, `/sitemap.xml` both 200.
- **API health**: `GET /health` → `{"ok":true,"service":"api"}`.
- **web-api health**: `GET /health` → `{"ok":true,"service":"web-api"}`.
- **Public web-api routes**: `GET /public/contact-topics` returned real data forwarded live from `apps/api`/Postgres; `GET /public/whatsapp-link` returned a correct `wa.me` deep link.
- **Web Chat**: an unauthenticated Socket.IO connection to `apps/api` correctly gets rejected (`UNAUTHENTICATED`, disconnected) — matches the visitor-chat hook's documented fallback. `POST /public/chat-sessions` and `POST /public/contact-messages` both correctly fail-closed with `400 CAPTCHA verification failed` on a fake token — proves the full routing/schema/captcha-gate chain is wired correctly. A full "message sent → response received" round trip requires a real browser-generated reCAPTCHA token — **REQUIRES BROWSER/PRODUCTION TEST**, not achievable via curl/script.
- **Contact Form path**: same captcha-gate result as above — request correctly reaches web-api → schema validation → captcha verification. Fail-closed behavior confirmed intact.
- **Portal login/session**: full cycle validated end-to-end against the containerized `apps/api`, using a throwaway whitelisted test account (created, tested, then fully deleted — zero rows left behind, verified): sign-up → sign-in → `GET /me` (200, correct role/company) → unauthenticated `/me` (401) → sign-out (200, with the Origin header a real browser sends) → `/me` after sign-out (401) → sign-in again → `/me` (200). Host-header routing verified directly: `Host: apps.kalibrasimedika.co.id` and `Host: portal.kalibrasimedika.co.id` both route correctly through the unmodified `proxy.ts`.
- Local stack torn down after validation (`docker compose down`); the throwaway `.env.production` copy removed; `.env.production.local` (gitignored) kept in the repo root for future local re-runs.

## NOT YET DEPLOYED

**Production VPS deployment has NOT been performed.** Nothing in this work touched the real VPS, DNS, live Nginx, or Certbot. Everything above was validated against local Docker Desktop only, using dev-safe placeholder secrets and the local native Postgres.

## PRODUCTION NEXT STEPS

1. **Backup/checkpoint**: on the VPS, snapshot/backup the native PostgreSQL database before any deploy touches it.
2. **Pull source**: `git pull` the approved branch onto the VPS.
3. **Prepare production env**: `cp .env.production.example .env.production`, fill in every placeholder with real generated secrets (`openssl rand -base64 32` for each of `BETTER_AUTH_SECRET`, `INTERNAL_API_SECRET`, `CHAT_SESSION_TOKEN_SECRET`) and the real production `DATABASE_URL`/reCAPTCHA keys. Confirm `INTERNAL_API_SECRET` and `CHAT_SESSION_TOKEN_SECRET` are byte-identical (automatic, since both `api` and `web-api` read from this one shared file).
4. **Build images**: `docker compose --env-file .env.production -f docker-compose.prod.yml build` (never a bare `docker compose build` — see the compose file's own top comment on why).
5. **Compose deployment**: `docker compose --env-file .env.production -f docker-compose.prod.yml up -d`; confirm all four containers report `healthy`.
6. **Nginx configuration**: install `infra/nginx/kalibrasimedika.co.id.conf.example`, `infra/nginx/api.kalibrasimedika.co.id.conf.example`, and `infra/nginx/apps.kalibrasimedika.co.id.conf.example` per each file's own documented manual steps.
7. **`nginx -t`** before touching anything live.
8. **TLS/Certbot**: `certbot --nginx -d kalibrasimedika.co.id -d api.kalibrasimedika.co.id -d apps.kalibrasimedika.co.id`, then `systemctl reload nginx` (reload, never restart — protects the 5 existing unrelated sites).
9. **Container health verification**: `docker compose -f docker-compose.prod.yml ps` — confirm all four `healthy`.
10. **Website smoke test**: load `https://kalibrasimedika.co.id` in a real browser.
11. **API smoke test**: `curl https://api.kalibrasimedika.co.id/health`.
12. **Web Chat smoke test**: open the chat bubble on the live site, send a message, confirm a response — the one flow this work could not fully validate locally (real reCAPTCHA requires a real browser).
13. **Contact Form smoke test**: submit a real test inquiry, confirm it lands in the lead pipeline (visible in Portal).
14. **Portal login/session smoke test**: sign in at `https://apps.kalibrasimedika.co.id`, confirm `/me`, a protected management route, sign-out, and sign-in-again all work.
15. **Rollback procedure**: `docker compose -f docker-compose.prod.yml down`, restore the previous image tags (or `git checkout` the prior commit and rebuild), `docker compose ... up -d` again; Nginx confs can be reverted by re-symlinking the previous `sites-enabled` entries and `nginx -t && systemctl reload nginx`. Database is untouched by any of this (no automatic migrations run anywhere in this pipeline), so rollback carries no data-loss risk from this deploy step itself.

## REMAINING RISKS

- **Web Chat / Contact Form / WhatsApp lead's full success path (past the captcha gate) was not validated end-to-end** — only the fail-closed rejection path was provable without a real browser. Requires browser/production test with real production reCAPTCHA keys before considering these flows fully proven.
- **Hostname precision matters**: `apps/portal`'s code only recognizes `apps.`/`portal.` prefixes. This was deployed against `apps.kalibrasimedika.co.id` as approved; if DNS is ever pointed at a different hostname, authentication would break via CORS rejection in a real browser (not observable via curl testing) — confirm the real DNS record matches `apps.kalibrasimedika.co.id` exactly before going live.
- **Native PostgreSQL's `pg_hba.conf`/`listen_addresses` readiness for the Docker bridge network on the real VPS** — documented as a manual prerequisite in `.env.production.example`, not yet confirmed on the actual VPS (only proven locally via Docker Desktop's automatic `host.docker.internal`, which behaves differently from Linux Docker's `extra_hosts: host-gateway` mechanism already configured in the compose file for `api`).
- **Certbot/TLS issuance for three new hostnames** on the live shared Nginx instance is unexercised — first real-world confirmation happens during actual VPS deployment.
- **UFW's pre-existing 5432/8000-open-to-Anywhere exposure**, flagged in the forensic audit, remains unresolved — outside this work's scope but still a live condition on the same VPS this topology will run on.
