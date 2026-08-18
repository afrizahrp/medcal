# Implementation Plan — Production Containerization (web, api, web-api, portal)

## Context

Three forensic audits (already completed in this session, not repeated here) established the approved topology:

```
kalibrasimedika.co.id            → apps/web            (port 3000)
kalibrasimedika.co.id/public/*   → apps/web-api         (port 3002)
api.kalibrasimedika.co.id        → apps/api             (port 3001)
apps.kalibrasimedika.co.id       → apps/portal           (port 3003)
```

`apps/api` already has a working, verified Dockerfile and a `docker-compose.prod.yml` entry. `apps/web-api`, `apps/web`, and `apps/portal` have none. PostgreSQL stays native/external — never containerized. This plan implements the three missing Dockerfiles, extends compose/env/Nginx, fixes the previously-identified web-api `trust proxy` gap, then validates everything **locally** (Docker Desktop needs to be running — its engine is currently not started; will start it before the build step) before handing off a separate, not-executed VPS deployment procedure.

Key facts already verified in the prior audits (not re-derived):
- `apps/web-api`'s own `tsc`-compiled `dist/index.js` would likely fail at runtime (`ERR_MODULE_NOT_FOUND`) because its workspace deps (`@medcal/config`, `@medcal/notifications`, `@medcal/shared`) are raw TypeScript with no build step — same root cause `apps/api/Dockerfile` already works around by running via `tsx` instead of compiled JS. Web-api's Dockerfile must follow the same `tsx`-runtime pattern, not `node dist/index.js`.
- `apps/web-api` has zero database/Prisma access — no `prisma generate` stage needed in its image.
- `apps/web` has no `output: "standalone"` in `next.config.js` — ships a normal `.next` + `node_modules` image, run via `next start`.
- `apps/portal` is host-header-routed (`apps/portal/src/proxy.ts`) — `apps.` prefix → management, `portal.` prefix → client. We are only wiring up `apps.kalibrasimedika.co.id` per the approved topology; `portal.*` is not being deployed in this pass (not in scope, no DNS for it).
- `apps/web-api/src/index.ts`'s `app.listen(port)` has no `trust proxy` configured — behind Nginx, `express-rate-limit`'s IP-keying would misattribute all traffic to Nginx's loopback IP.
- `.env.production.example` today only documents `apps/api`'s contract — needs extending for web-api/web/portal's variables (all already known from source, none invented).
- `INTERNAL_API_SECRET` and `CHAT_SESSION_TOKEN_SECRET` must be byte-identical between apps/api and apps/web-api — enforced by using the same `.env.production` file for both services (single env file, like `apps/api` already does).

## Files to create

1. **`apps/web-api/Dockerfile`** — multi-stage, modeled on `apps/api/Dockerfile`'s `turbo prune`/`pnpm install --frozen-lockfile` pattern, **no Prisma-generate stage** (web-api has zero DB access), non-root user, `EXPOSE 3002`, `CMD ["node_modules/.bin/tsx", "src/index.ts"]` (tsx runtime, not compiled JS — see rationale above).
2. **`apps/web/Dockerfile`** — same prune/install pattern for `@medcal/web`, build stage runs `pnpm --filter=@medcal/web build` with `ARG`/`ENV` for `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WEB_API_URL`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` (declared before the build so Next.js's build-time inlining picks them up), runtime `CMD` = `next start -p 3000` (via the package's own `start` script), `EXPOSE 3000`.
3. **`apps/portal/Dockerfile`** — same pattern for `@medcal/portal`, one build arg (`NEXT_PUBLIC_API_URL` only — portal has no web-api/reCAPTCHA dependency, confirmed in the delta audit), runtime `next start -p 3003`, `EXPOSE 3003`.
4. **`infra/nginx/kalibrasimedika.co.id.conf.example`** — new file, same documented-but-unapplied pattern as the existing `api.*` example: HTTP→HTTPS redirect + ACME challenge + HTTPS block with two `location` blocks (`/` → `127.0.0.1:3000`, `/public/` → `127.0.0.1:3002`, trailing slash stripped correctly so `/public/whatsapp-lead` etc. reach web-api's own `/public/whatsapp-lead` route unchanged).
5. **`infra/nginx/apps.kalibrasimedika.co.id.conf.example`** — new file, same pattern, single `location /` → `127.0.0.1:3003`, with `proxy_set_header Host $host;` called out in a comment as load-bearing (portal's own routing logic reads it).
6. **A local-only compose override** (e.g. `docker-compose.local-prod-test.yml` or reusing `docker-compose.prod.yml` directly with a local `.env.production`-shaped file) for local validation — will decide exact mechanism during implementation depending on what's cleanest; will NOT touch real `.env.production` (doesn't exist) or commit secrets.

## Files to modify

1. **`docker-compose.prod.yml`** — add `web-api`, `web`, `portal` service blocks (loopback-only ports per §6 of the request, `medcal_net`, `restart: unless-stopped`, `env_file: .env.production`, healthchecks). Add `depends_on: api: condition: service_healthy` only to `web-api` (the one real container-level dependency) — not to `web` or `portal`, per the request's explicit instruction.
2. **`apps/web-api/src/index.ts`** — add `app.set("trust proxy", ...)`. Precise setting to be determined from the actual Nginx topology: since Nginx and the app container communicate over the loopback interface (`127.0.0.1`) on the same host, the safe, precise configuration is `app.set("trust proxy", "loopback")` (Express's built-in preset trusting only `127.0.0.1`/`::1`/link-local — not `true`, which would trust any `X-Forwarded-For` from anywhere, including a spoofed one from the public internet if the container were ever reachable directly). This will be explained in the final report.
3. **`.env.production.example`** — extend with the currently-missing variables identified in the forensic audit: `WEB_API_PORT`, web-api's own `API_URL` (pointing at `https://api.kalibrasimedika.co.id`), `CHAT_SESSION_TOKEN_SECRET`, `CHAT_SESSION_TOKEN_TTL_MS`, `CHAT_WIDGET_ORIGINS`, `RECAPTCHA_SECRET_KEY`, `RECAPTCHA_MIN_SCORE`, all rate-limit vars (contact form, web-chat legacy, chat session, whatsapp lead), and a new `NEXT_PUBLIC_*` section for `apps/web`/`apps/portal` build args (`NEXT_PUBLIC_API_URL=https://api.kalibrasimedika.co.id`, `NEXT_PUBLIC_WEB_API_URL=https://kalibrasimedika.co.id/public`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY=<production value>`). `TRUSTED_ORIGINS` already includes `apps.kalibrasimedika.co.id` — verified already correct, no change needed there. No real secrets — placeholders only, consistent with the file's existing style.

## What is explicitly NOT changed

- `apps/portal/src/proxy.ts` — not touched, per the request's explicit instruction to preserve existing `apps.*` routing as-is.
- `packages/auth/src/index.ts`, `packages/config/src/index.ts` — cookie domain / trusted-origins logic already correctly supports this topology (verified in the delta audit); no code change needed, only the env value itself (already correct in the template).
- `apps/api/Dockerfile` — reused as-is; verified already production-ready (proven build, non-root, tsx runtime, correct port/health).
- No PostgreSQL containerization, no Kubernetes/Swarm, no new hostname, no DNS change, no UI/Hero/Web-Chat/Portal redesign.

## Local validation plan

1. Start Docker Desktop's engine (currently not running — `docker version` succeeded for the client but the daemon pipe isn't up).
2. `docker compose -f docker-compose.prod.yml build` (or targeted per-service builds) against a throwaway local `.env.production`-shaped file with dev-safe placeholder secrets (never the real committed dev `.env` values, to keep the test honest about "production-shaped" env wiring) — confirm all four images build.
3. Bring the stack up locally (`docker compose ... up -d`), pointed at the local native/dev Postgres via `host.docker.internal` (same mechanism `apps/api`'s F5.6 verification already used), confirm all four containers report healthy.
4. Curl-based checks: `api`'s `/health`, `web-api`'s `/health`, `web`'s `/`, `portal`'s `/`.
5. Inspect each container's logs for startup errors, missing env vars, Prisma errors, module-resolution errors, port conflicts.
6. Integration smoke tests **without real DNS/TLS** — using `curl -H "Host: ..."` against the loopback ports (or a local hosts-file entry / `Host` header override) to simulate each hostname's routing, since production certs won't be issued locally per the request's explicit instruction:
   - `kalibrasimedika.co.id` (web) loads.
   - A safe `/public/*` web-api route responds (e.g. `GET /public/contact-topics`, read-only, no side effects).
   - Web Chat: open a chat session against `api`'s Socket.IO gateway directly (port 3001), confirm connect → session start → message round-trip.
   - Contact Form path: `web-api` → `api` `/internal/contact-messages` forwarding works (using a test payload, not a real lead).
   - Portal: sign-in, `/me`, a protected management route, sign-out, sign-in again — against the real dev database's test/whitelisted account (same style of throwaway verification the F5/F6 docs already used, cleaned up after).
7. Tear down local containers/images used purely for this validation once confirmed (or leave running if the user wants to keep testing — will confirm rather than assume).

## Production deployment plan (write-up only, not executed)

Will be delivered as a separate documented procedure at the end (backup → git pull → prepare `.env.production` → build → compose up → Nginx conf install/`nginx -t`/reload → Certbot → health checks → smoke tests → rollback procedure), matching the same manual-install discipline already established by the existing `api.kalibrasimedika.co.id.conf.example` file (never auto-reloads live Nginx, never overwrites the 5 unrelated existing sites).

## Verification

- All four `docker build`s succeed.
- All four containers reach a healthy/responsive state locally.
- Logs show no errors.
- Web Chat, Contact Form, and Portal login/session flows work end-to-end against the local stack.
- Final report explicitly separates what was validated locally from what remains for the real VPS (nothing is deployed there in this task).
