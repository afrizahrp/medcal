# F5 Audit — Infrastructure / Environment / Deployment / Production Topology

**This is an audit report, not an implementation plan. No code, config, or infrastructure was changed while producing it.**

---

## 1. F5 current-state matrix

| Area | Locked requirement (Adoption Matrix / F-plan) | Actual repo/infra state | Status |
|---|---|---|---|
| Postgres source of truth | Docker Compose `postgres` service is the documented model | Native Windows service `postgresql-x64-18` (`Running`) is what `.env`'s `DATABASE_URL` actually targets (`postgres`/`pkmdb`, port 5432). `docker-compose.yml`'s `postgres` service (`afriza`/`pkmdb`, also port 5432) is a **second, unused** Postgres definition — different credentials, same port, so it can't even run concurrently with the native service without a port clash. Docker Desktop isn't currently running at all. | **B/C** — drift; not implemented as locked |
| `.env` vs `.env.example` | Should be consistent, dev-safe | `.env` matches `.env.example`'s shape but diverges in values: `DATABASE_URL` user is `postgres` (native) not `medcal` (example's placeholder); `COMPANY_ID="PKM"` (real, matches `Company.id @db.Char(3)`) vs example's misleading `"change-me-company-cuid"` comment (Company id is a 3-char code, not a cuid — doc bug, not a schema bug); `BETTER_AUTH_SECRET` is a real generated dev value in `.env`, placeholder in example (correct pattern). No other drift. | **B** (doc wording) + **A** (secret separation done correctly) |
| Env contract (all 13 vars asked about) | See §2 below | Present in both files; `COOKIE_DOMAIN`/`TRUSTED_ORIGINS` wired into code (`main.ts`, `packages/auth`); `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WEB_API_URL` present in env but **not yet read by any app code** (`apps/web`, `apps/portal`, `apps/tech-pwa` have no source beyond Next.js scaffold `layout.tsx`/`page.tsx`); `__NEXT_PRIVATE_ORIGIN` present, unused (no app code reads it yet — Next.js reads it as a framework-level env var directly, not app code, so absence of a grep hit is expected) | **A** partial / **B** partial |
| Production domain topology | 5 subdomains, host-routed `apps/portal` for `apps.*`+`portal.*`, `technician.*`→`apps/tech-pwa`, `api.*`→`apps/api`, web-api never public | No host-based routing/middleware exists in `apps/portal` (no `middleware.ts` anywhere in the repo). No subdomain config anywhere (expected — this is infra, not app code, until deploy time). | **B** — not implemented; correctly deferred, not contradicted |
| PWA scope implications | `apps/tech-pwa` origin-bound manifest/SW | `apps/tech-pwa` is a bare Next.js scaffold — no `manifest.json`, no service worker, no PWA config of any kind yet | **B** — not started |
| Reverse proxy / ingress | "MedCal may or may not own it"; something must terminate 5 hostnames and route to the right service/port | **Nothing in the repo** — no nginx/caddy/traefik config, no `Dockerfile`, confirmed via repo-wide search. Only doc *mentions* of "reverse proxy" as a concept in the Adoption Matrix and Foundation plan (already read) and two other docs (`docs/claude/lead-management/final-before-locked.md`, `docs/cursor/medcal-app_Action Plan.md`) — worth reading if you want the Action Plan's original intent, but they don't add infra config, just prose | **C** — genuinely outside repo scope; **cannot be determined** whether the target VPS already has one |
| Containerization | Docker Compose services = `web/web-api/portal/tech-pwa/api/postgres` | Only `postgres` is containerized. **Zero Dockerfiles exist anywhere in the repo** for any app. `apps/api` runs directly on host via `tsx` (dev) / `node dist/main.js` (would-be prod, no container). Same for `web-api`/`web`/`portal`/`tech-pwa` — all have `dev`/`build`/`start` scripts but no container wrapping any of them. | **B** — the single biggest gap between locked target and actual state |
| Network/security boundaries | Express zero-DB, `web-api`→`api` via `INTERNAL_API_SECRET`, authenticated clients hit `apps/api` directly | Verified by reading `apps/web-api/src/index.ts` in full: no Prisma/DB import anywhere in `apps/web-api`, only `fetch()` to `apps/api` with `x-internal-secret`+`x-company-id` headers. Boundary is correctly implemented in code today. | **A** — done, matches lock |
| Secrets | No committed secrets, safe dev defaults | `.env` is gitignored (`.gitignore` line `.env`) and **not tracked** (`git ls-files` shows only `.env.example` tracked). `.env.example` placeholders are clearly fake (`change-me-*`). `.env`'s real dev secrets (`BETTER_AUTH_SECRET`, DB password) are dev-only values, consistent with the F2/F4 reports' own claim that nothing is hardcoded in source. One risk: `INTERNAL_API_SECRET` in the **live `.env`** is still literally `"change-me-internal-secret"` — i.e., the placeholder was never rotated to a real dev value, unlike `BETTER_AUTH_SECRET` which was. Not committed, so not a repo-level leak, but worth flagging as a live-environment gap before any shared/staging use. | **A** (no leak) + **D** (rotate before shared use) |
| Deployment/runtime | Node/pnpm, build/start scripts, PM2/systemd/Docker | `package.json` pins `"packageManager": "pnpm@9.15.9"`, `"engines": { "node": ">=20" }`. Every app has `build`+`start` scripts wired through Turborepo (`turbo.json`: `build`, `dev`, `lint`, `typecheck`, `test`, `generate` tasks defined; no `start`/`deploy` task defined at the turbo level — each app's `start` would need to be invoked per-app or added as a turbo task). No PM2 config (`ecosystem.config.js` absent), no systemd unit files, no Dockerfiles — confirmed via repo-wide search. | **A** (scripts exist) + **B** (no process manager / no orchestration layer wired) |

---

## 2. Environment contract — variable-by-variable

| Var | In `.env`/`.example` | Read by code | Notes |
|---|---|---|---|
| `DATABASE_URL` | Yes/Yes | `packages/db` (Prisma) | Points at native Postgres in dev |
| `COMPANY_ID` | Yes/Yes | `apps/api` guards, `bootstrap-superadmin.ts`, `packages/config` schema (optional there) | Real value `"PKM"`, 3 chars — matches `Company.id @db.Char(3)` |
| `API_PORT`/`API_URL` | Yes/Yes | `main.ts` reads `API_PORT`; `API_URL` not read by `apps/api` itself (only by `web-api` to know where to forward) | Consistent |
| `WEB_API_PORT`/`WEB_API_URL` | Yes/Yes | `apps/web-api/src/index.ts` reads `WEB_API_PORT`; `WEB_API_URL` not read anywhere yet (reserved for `apps/web` once it calls web-api) | `apps/web` has no source yet to consume it |
| `INTERNAL_API_SECRET` | Yes/Yes | `apps/web-api` (sends header), `apps/api`'s `InternalServiceGuard` (validates it) | Live `.env` value still the placeholder string — see §1 |
| `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WEB_API_URL` | Yes/Yes | Not read anywhere yet | Reserved for future Next.js app code |
| `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` | Yes/Yes | `packages/auth/src/index.ts` | Real dev value present, correctly not committed |
| `TRUSTED_ORIGINS` | Yes/Yes | `main.ts` CORS, `packages/config` | Wired and verified in F2 |
| `COOKIE_DOMAIN` | Yes/Yes | `packages/auth/src/index.ts` (`crossSubDomainCookies`) | Verified disabled correctly for local dev |
| `__NEXT_PRIVATE_ORIGIN` | Yes/Yes | Not read by app code (Next.js internal CVE mitigation flag, framework-level) | Present, empty in dev — correct per its own comment |

No var exists in one file but not the other. No contract drift beyond the `COMPANY_ID` comment wording noted above.

---

## 3. Contradictions / drift found

1. **`docker-compose.yml`'s Postgres service is not what dev actually uses.** Different DB user (`afriza` vs `.env`'s `postgres`), same port as the native service it would collide with. As it stands today it's dead config — starting it would either conflict with the running native service on port 5432 or (if native is stopped) silently swap which database "pkmdb" means, since they're different physical databases with the same name. This isn't a locked-architecture violation (Compose-as-deployment-model is still the target for *production*), but it is present, misleading local-dev config that doesn't match the documented Foundation-plan claim ("Docker Compose (local) — Done").
2. **`.env.example`'s `COMPANY_ID` comment says "cuid"** but the actual `Company.id` column is `@db.Char(3)` and the real value in use is `"PKM"`. Cosmetic doc bug, zero functional impact (the code never validates the format).
3. **`INTERNAL_API_SECRET` in the live dev `.env` was never rotated off the placeholder value.** Functionally harmless in a solo local-dev context (nothing external can reach it), but flagged since F3's `InternalServiceGuard` treats it as a real trust boundary — the value should stop being a copy-pasted placeholder before this env is ever shared or exposed to anything beyond localhost.
4. **`apps/web-api/src/index.ts` line 34 references `buildWhatsAppDeepLink`, but its import is commented out (line 6).** That specific route (`GET /public/whatsapp-link`) would throw a `ReferenceError` at runtime if hit. Outside F5's infra scope (it's an application bug in MVP-phase WhatsApp code, not infrastructure), flagging only because it was seen while auditing this file for the DB-access boundary check — not something to act on now.

No contradiction was found in the RBAC/auth/whitelist layers (F1–F4 untouched, none of this audit touched or re-opened those).

---

## 4. Security / deployment risks

- **No process supervision for `apps/api`/`web-api` in prod.** `node dist/main.js`/`node dist/index.js` with no PM2/systemd/Docker restart policy means a crash has no automatic recovery today. This is expected at this phase (nothing is deployed yet) but is a real gap once F5 moves toward an actual deployment target.
- **No containers to isolate blast radius.** All four Next.js apps plus both backend services would currently share the host process/network namespace directly if run as-is in production — there's no Dockerfile-level isolation yet, contradicting the locked "Docker Compose for all MedCal services" target.
- **Reverse proxy is entirely unverified/unowned from the repo's perspective.** Nothing here confirms TLS termination, host-based routing to 5 different services on different ports, or that `web-api` is actually kept off the public routing table in whatever proxy config eventually exists outside this repo. This is a **C-type fact** (cannot be determined from the repo) — it depends on the actual VPS, which this audit correctly does not assume ownership of.
- **`INTERNAL_API_SECRET` placeholder-in-`.env`** (see drift #3) — low risk today, but is the kind of thing that quietly survives into a shared/staging env if not deliberately rotated as part of an F5 checklist.

---

## 5. Exact F5 implementation work items (once approved)

Ordered by dependency, not by priority:

1. **Decide and resolve the Postgres duplication** (native vs Compose) for local dev — likely remove or clearly deprecate the Compose `postgres` service if native stays the dev standard, or reverse that; either way stop carrying two live definitions with colliding ports. *(Decision needed — see §6.)*
2. **Write Dockerfiles** for `apps/api`, `apps/web-api`, `apps/web`, `apps/portal`, `apps/tech-pwa` (5 total; `packages/*` are libraries consumed at build time, not separately containerized).
3. **Extend `docker-compose.yml`** to add these 5 services alongside the existing `postgres` service, matching the locked service list (`web/web-api/portal/tech-pwa/api/postgres`).
4. **Add host-based routing** in `apps/portal` (Next.js `middleware.ts` selecting a route group by `Host` header) for `apps.*` vs `portal.*` — this is genuinely blocked on UI work existing to route *to*, so it's reasonable to sequence this alongside/after F6 starts, not strictly before.
5. **Add PWA manifest/service-worker** to `apps/tech-pwa` (and eventually `apps/portal` for its two hostnames) — also UI-adjacent, same sequencing note as #4.
6. **Document (not necessarily implement in-repo) the reverse-proxy expectation**: 5 hostnames → 5 backend ports, TLS termination, `web-api` excluded from any public route. This is a spec the ops side needs, whether or not MedCal's repo ever contains the actual proxy config.
7. **Rotate `INTERNAL_API_SECRET`** in any shared/staging `.env` away from the placeholder before first shared use (not a code change, an ops step).
8. **Wire `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WEB_API_URL`/`WEB_API_URL` into actual app code** once `apps/web`/`apps/portal`/`apps/tech-pwa` have API-calling code to configure — currently premature since none of those apps call anything yet.

---

## 6. Decisions requiring your confirmation

- **Docker Compose Postgres service**: keep it (and fix its credentials/port to not collide with native, e.g. remap to a different host port) as a documented alternative for onboarding new machines, or remove it entirely now that native is the established dev standard? Both are reasonable; this audit doesn't have enough signal to pick for you.
- **Containerization sequencing**: build all 5 Dockerfiles now as infrastructure scaffolding (ahead of UI work), or defer each app's Dockerfile until that app has real functionality worth containerizing (matching the Foundation plan's own F5 note: "extend `docker-compose.yml` only when the corresponding apps have enough Foundation work... to be worth containerizing together")? The existing doc already leans toward "defer," but you may want to revisit given F1–F4 (api-side Foundation) is now fully done — `apps/api` specifically may already be worth containerizing even if the Next.js apps aren't.
- **Reverse proxy ownership**: is there already a VPS-level proxy (existing nginx/Caddy managing other sites on the same box) that MedCal must integrate with, or is this a green-field server where MedCal's own Compose stack should include the proxy? This determines whether work item #6 above stays documentation-only or becomes an actual `docker-compose.yml` service.

---

## 7. What can be implemented immediately without further architectural decisions

- **Fixing the `COMPANY_ID` comment in `.env.example`** (cosmetic doc correction, zero risk, no decision required).
- **Rotating the placeholder `INTERNAL_API_SECRET`** value in the local `.env` to a real generated dev secret (same pattern already used for `BETTER_AUTH_SECRET`) — purely operational, no architecture involved.
- **Writing the `apps/api` Dockerfile** specifically — it's the one service whose Foundation work (F1–F4) is actually complete, so containerizing it doesn't get ahead of anything, and it doesn't require the Postgres-duplication decision to be resolved first (it would just consume `DATABASE_URL` from its own env at runtime like it does today).

Everything else in §5 is gated on at least one of the three decisions in §6.

---

**Audit complete. No code, `.env`, Compose, Dockerfiles, or proxy config were modified. F1–F4 were not reopened. F6/UI work was not started. Waiting for review before any implementation.**
