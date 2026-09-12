# Production Env + Docker Wiring Audit — apps/web

**Type:** Read-only architecture/deployment audit conducted before containerization work began. No files were modified during this audit. **Status: the blocker identified here has since been resolved** — see `docs/Deployment/audits/04-production-containerization-forensic-audit.md` and the actual `apps/web/Dockerfile`/`docker-compose.prod.yml`/`.env.production.example` for the implemented solution. This file is kept as the original diagnostic record.

## 1. Trace of NEXT_PUBLIC env usage in apps/web (at time of audit)

| Variable | Used by | Build-time? | Default/fallback | Production value source (at time of audit) |
|---|---|---|---|---|
| `NEXT_PUBLIC_WEB_API_URL` | `use-visitor-chat.ts`, `whatsapp-identity-dialog.tsx`, `kontak-form.tsx` | Yes — inlined into client bundle by `next build` | `"http://localhost:3002"` | **None existed.** Not in `.env.production.example`, not in `docker-compose.prod.yml`. |
| `NEXT_PUBLIC_API_URL` | `use-visitor-chat.ts` (Socket.IO connection) | Yes | `"http://localhost:3001"` | `apps/api` had a production value (`https://api.kalibrasimedika.co.id`), but it was never itself exposed as `NEXT_PUBLIC_API_URL` for apps/web's own build. |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | `whatsapp-identity-dialog.tsx`, `web-chat-bubble.tsx`, `kontak-form.tsx` | Yes | `""` | Present in dev `.env`, not in `.env.production.example`. |

## 2. API URL architecture — two variables, two distinct destinations

```
Browser (apps/web)
   ├─ NEXT_PUBLIC_WEB_API_URL ─────► apps/web-api (Express edge, port 3002)
   │     POST /public/chat-sessions
   │     POST /public/whatsapp-lead
   │     POST /public/contact-messages
   │     GET  /public/contact-topics
   │
   └─ NEXT_PUBLIC_API_URL ─────────────────► apps/api directly
         Socket.IO handshake (chat transport)
```

Neither variable is redundant. `NEXT_PUBLIC_WEB_API_URL` is the only path for actions needing captcha verification, rate limiting, and internal-secret forwarding. `NEXT_PUBLIC_API_URL` is the only path the browser uses to reach `apps/api`'s Socket.IO gateway directly, bypassing web-api by design.

## 3. Actual production hostnames (at time of audit) — one decided, one not

| Component | Production hostname | Status at time of audit |
|---|---|---|
| `apps/api` | `api.kalibrasimedika.co.id` | Decided and partially built — Dockerfile, compose service, Nginx conf example, full env contract. |
| `apps/web` | `kalibrasimedika.co.id` (inferred from `siteUrl`) | Domain implied by SEO code, but no Dockerfile/compose/Nginx conf existed. |
| `apps/web-api` | Undefined | No hostname named anywhere in the repo. |

`docker-compose.prod.yml`'s header comment stated directly: *"apps/web-api, apps/web, apps/portal, apps/tech-pwa are intentionally not included yet — containerize each when its own implementation reaches the appropriate stage."*

## 4. Next.js public-env semantics — confirmed BUILD-TIME requirement

`apps/web` is a standard (non-static-export) Next.js 16.2.12 app — no `output: "export"`/`"standalone"` at the time. Any `process.env.NEXT_PUBLIC_*` reference in client-bundled code is statically substituted **during `next build`**, not read from the environment at container start. Setting these values only at `docker run`/container-start time would have been too late.

## 5. Docker build wiring — apps/web had none to inspect

`apps/web/Dockerfile` did not exist. `apps/web` was not built in `docker-compose.prod.yml`. No monorepo root Dockerfile existed. The only existing container-build pattern was `apps/api/Dockerfile`'s multi-stage `turbo prune → pnpm install → pnpm generate → runtime` flow, useful as a template for the *pruning/pnpm-workspace* mechanics but not for the NEXT_PUBLIC_*-at-build-time problem specifically.

## 6. Secrets vs public config

Confirmed PUBLIC / safe to bundle: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WEB_API_URL` (plain hostnames), `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` (reCAPTCHA site keys are meant to be client-visible by design). Confirmed SERVER-ONLY / secret (never referenced in apps/web): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `INTERNAL_API_SECRET`, `CHAT_SESSION_TOKEN_SECRET`, `RECAPTCHA_SECRET_KEY`. No secret leakage risk identified.

## 7. Production build failure mode (explains the BLOCKER classification)

| Condition | What happens |
|---|---|
| Var absent at build time | Builds and renders fine — `?? "http://localhost:..."` fallback means `next build` never errors. |
| Present but empty string | Falls through to a *relative* URL on the page's own origin — 404s, looking like a routing bug rather than a wrong-host bug. |
| Points to localhost (the actual default at time of audit) | Build succeeds, page renders normally, **every lead-gen interaction fails at the network layer only when a real visitor tries to convert** — invisible until then. |

This is why the SEO audit correctly called this a Lead Generation BLOCKER, not an SEO blocker: nothing about it affected crawlability or metadata.

## 8. Recommended mechanism (implemented)

Docker Compose `build.args:`, sourced from the same `.env.production` file `apps/api` already used via `env_file:` — keeping one production config file per app group rather than a second parallel file just for apps/web. **This is exactly what was implemented** — see `docker-compose.prod.yml`'s `web`/`portal` service `build.args` blocks and its top comment on the `--env-file` requirement.

## 9. apps/web-api deployment gap — BLOCKING (at time of audit)

Confirmed from `docs/Architecture/02-foundation-implementation-plan.md` §F5: *"Containerization sequencing — apps/api only, for now. web/web-api/portal/tech-pwa are containerized later."* Additionally, the same document's F6 verification log recorded that `apps/web-api`'s own `pnpm build` was failing at that time for an unrelated pre-existing reason (`@medcal/notifications` missing an exported member) — **investigated and resolved to be stale/already-fixed**, see `03-web-api-build-readiness-audit.md` in this folder.

**This audit's verdict at the time: RED.** Not because of a simple missing env var — the underlying blocker was architectural: no Dockerfile existed for apps/web, and its required backend (apps/web-api) had no production deployment target at all. **All of this has since been implemented** — see the forensic containerization audit and the actual repo state (`apps/web-api/Dockerfile`, `apps/web/Dockerfile`, `apps/portal/Dockerfile`, extended `docker-compose.prod.yml`, extended `.env.production.example`).

## Exact files reviewed

`apps/web/src/lib/use-visitor-chat.ts`, `apps/web/src/components/whatsapp-identity-dialog.tsx`, `apps/web/src/components/web-chat-bubble.tsx`, `apps/web/src/app/kontak/kontak-form.tsx`, `apps/web/package.json`, `apps/web/next.config.js`, `apps/web-api/src/index.ts`, `apps/web-api/package.json`, `apps/api/src/main.ts`, `apps/api/src/modules/chat/chat.gateway.ts`, `apps/api/Dockerfile`, `docker-compose.prod.yml`, `docker-compose.yml`, `.env`, `.env.example`, `.env.production.example`, `infra/nginx/api.kalibrasimedika.co.id.conf.example`, `docs/Deployment/README.md`, `docs/Architecture/02-foundation-implementation-plan.md` (§F5, §F6).
