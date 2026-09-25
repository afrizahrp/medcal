# apps/customer-portal — Production Infrastructure Audit

**Scope:** read-only audit of the repository and production infrastructure
configuration to determine what is required to bring `apps/customer-portal`
up as a new, isolated production service at `customer.kalibrasimedika.co.id`.
No source, config, Compose, Nginx, DNS, SSL, or database state was modified.
No implementation performed — audit/design only, per instruction.

**Confirmed current production topology (from live VPS state, not the local
repo's `docker-compose.prod.yml`, which is out of date — see §9 note):**

```
medcal-api       → 127.0.0.1:3001   (healthy)
medcal-web-api   → 127.0.0.1:3002   (healthy)
medcal-portal    → 127.0.0.1:3003   (healthy)
medcal-tech-pwa  → 127.0.0.1:3004   (healthy)  — DONE, out of scope, not touched
medcal-web       → 127.0.0.1:3010   (healthy)
```

`apps/tech-pwa` infrastructure is treated as complete and is not audited,
redesigned, or referenced further in this report except where its already-
established pattern is the direct template for `customer-portal`.

`customer.kalibrasimedika.co.id → apps/customer-portal` is confirmed correct
per this audit: `packages/shared/src/utils/index.ts`'s
`resolveRegistrationContext()` already hard-codes a `"customer."` host-prefix
→ `CUSTOMER_PORTAL` mapping, used by `apps/api`'s staff-vs-customer
registration gate — this is existing, already-wired application logic, not
something this audit is proposing.

---

## 1. Is `apps/customer-portal` ready to containerize?

**PARTIAL — architecturally ready, nothing built yet.**

- **Framework/runtime:** Next.js 16.2.12 App Router, React 19.2.8, run via
  `next start` (`"start": "next start -p 3005"`, already fixed in
  `package.json`) — no `output: "standalone"` in `next.config.js`, same
  full-`node_modules` runtime pattern as every other app in this repo.
- **Workspace dependencies:** `@medcal/auth`, `@medcal/shared`, `@medcal/ui`
  (all `workspace:*`) — identical set to `apps/tech-pwa` and `apps/portal`.
  `transpilePackages` in `next.config.js` matches exactly.
- **No app-specific `process.env` reads at all** — confirmed by grep of
  `apps/customer-portal/src`: zero matches. Every environment value it needs
  flows in indirectly through the shared packages it already depends on:
  - `packages/shared/src/http/api-fetch.ts` reads `NEXT_PUBLIC_API_URL`
    (used by `useCustomerLink()` via `apiFetch`).
  - `packages/auth/src/auth-client.ts` reads `NEXT_PUBLIC_API_URL` (Better
    Auth client `baseURL`).
  - So the single build-time variable this app needs is
    **`NEXT_PUBLIC_API_URL`** — nothing else. No Firebase/FCM (the
    `firebase` package is not a dependency here, unlike `apps/tech-pwa`), no
    reCAPTCHA, no `output: "standalone"` migration.
- **No PWA surface:** `apps/customer-portal/public/` contains only
  `logo.png` — no `manifest.webmanifest`, no service worker, no icon set.
  This is the simplest of the five apps to containerize.
- **No hardcoded domain/port, no WebSocket usage:** confirmed by grep — zero
  matches for `localhost|kalibrasimedika|3004|3005`, zero for
  `websocket|socket\.io|ws://`.
- **No middleware/host-based routing:** unlike `apps/portal`, there's no
  `Host`-header branching logic here to keep in sync with the deployed
  hostname.
- **No direct DB or internal-service access:** no `DATABASE_URL`, no
  server-only secret anywhere in its source.
- **Auth relationship:** same Better Auth client mechanism as
  `apps/portal`/`apps/tech-pwa` (`@medcal/auth/client`'s `authClient`,
  `useAuth`, `AuthGate`). Authorization for customer-specific data is a
  second layer on top of session auth: `GET /me/customer-link`
  (`use-customer-link.ts`) determines whether the signed-in user is linked
  to an actual `Customer` record — this is existing application logic, not
  an infra concern.
- **What's genuinely missing:** no `Dockerfile`, no Compose service block,
  no Nginx config, no DNS record, no cert. Unlike `apps/tech-pwa`, there is
  **no existing draft** of any of these in the repo (`infra/` has nothing
  customer-portal-related) — this is a from-scratch addition, though a
  mechanically simple one given four proven sibling examples already exist.
- **Current feature scope is intentionally minimal:** sign-in/register, an
  `AuthGate` + `/me/customer-link` authorization check, and a placeholder
  `/certificate/[token]` route that does not yet fetch or expose any
  certificate data (explicitly commented as future-phase work). No file
  upload/download path exists in this app yet, so no large-body Nginx
  consideration applies today.

## 2. Recommended port allocation

```
Container port: 3005   (already fixed in package.json's own start script —
                         no code change needed, matches its documented dev port)
Host binding:   127.0.0.1:3005:3005   (loopback-only, same convention as all
                                        five existing containers — never 0.0.0.0)
```

No collision: `3001`/`3002`/`3003`/`3004`/`3010` are already in use;
`3005` is confirmed free.

## 3. Dockerfile / Compose changes required

*Audit only — none of the following exist yet; nothing was created.*

- **Dockerfile:** `apps/customer-portal/Dockerfile` does not exist. The
  closest template is `apps/portal/Dockerfile`, simplified further:
  multi-stage `turbo prune @medcal/customer-portal --docker` → `pnpm install
  --frozen-lockfile` → `next build` with a single `NEXT_PUBLIC_API_URL`
  build arg → non-root user → `EXPOSE 3005` → `CMD ["node_modules/.bin/next",
  "start", "-p", "3005"]`. No Firebase build args needed (no `firebase`
  dependency), unlike `apps/tech-pwa`'s Dockerfile.
- **Compose:** `docker-compose.prod.yml` (local repo copy) has no
  `customer-portal` service block, and — per the confirmed live VPS
  topology — also predates the `tech-pwa` block that's actually running in
  production. See §9's note before editing this file for real.
  The needed block mirrors `web`'s/`portal`'s shape: `build.context: .`,
  `build.dockerfile: apps/customer-portal/Dockerfile`, `build.args:
  NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL}`, `image:
  medcal-customer-portal:latest`, `container_name: medcal-customer-portal`,
  `restart: unless-stopped`, `ports: ["127.0.0.1:3005:3005"]`, `networks:
  [medcal_net]`, no `env_file` (nothing runtime-only to inject), no
  `depends_on` (same reasoning as `web`/`portal`/`tech-pwa`: all calls to
  `apps/api` originate in the visitor's browser, not server-side), and a
  healthcheck against `/` (`wget -qO- http://127.0.0.1:3005/`) — note `/`
  here is the `(app)` route group's protected landing page behind
  `AuthGate`, which for an unauthenticated request still resolves through
  Better Auth's session bootstrap to a `200` render (loading/sign-in
  affordance), not a hard redirect loop — same healthcheck style already
  used for `portal`.

## 4. Environment variables / build args required

- **`NEXT_PUBLIC_API_URL`** — build arg only (inlined by `next build` into
  both `@medcal/shared`'s `apiFetch` and `@medcal/auth`'s Better Auth
  client, both transpiled into this app's bundle). Already defined with the
  correct production value (`https://api.kalibrasimedika.co.id`) in
  `.env.production.example` and shared by every other app — no new value,
  just add `customer-portal` to the Compose `build.args` for it.
- **No other variable is read anywhere in `apps/customer-portal/src`.**
- **`.env.production.example` documentation gap:** its "Next.js build-time
  variables" section header currently reads *"(apps/web, apps/portal)"* and
  doesn't mention `apps/tech-pwa` or `apps/customer-portal` — both now need
  `NEXT_PUBLIC_API_URL` at build time too. Worth updating for accuracy when
  the real Compose change is made.
- **Production `TRUSTED_ORIGINS` gap (see §7):** `https://customer.kalibrasimedika.co.id`
  is **not** currently present in `.env.production.example`'s
  `TRUSTED_ORIGINS` value (which lists `kalibrasimedika.co.id`, `apps.*`,
  `portal.*`, `technician.*` only). This is a required addition — see §7.

## 5. Nginx configuration required

No `infra/nginx/customer.kalibrasimedika.co.id.conf.example` exists yet —
this is a new file, not an edit to any existing one. Modeled directly on the
already-proven shape of `infra/nginx/apps.kalibrasimedika.co.id.conf.example`
/ `technician.kalibrasimedika.co.id.conf.example`:

```
server { listen 80; server_name customer.kalibrasimedika.co.id;
  location /.well-known/acme-challenge/ { root /var/www/certbot; }
  location / { return 301 https://$host$request_uri; }
}
server { listen 443 ssl http2; server_name customer.kalibrasimedika.co.id;
  ssl_certificate     /etc/letsencrypt/live/customer.kalibrasimedika.co.id/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/customer.kalibrasimedika.co.id/privkey.pem;
  location / {
    proxy_pass http://127.0.0.1:3005;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

- No WebSocket upgrade headers needed (confirmed no usage in source).
- No `client_max_body_size` override needed today — the app has no direct
  upload endpoint yet (`/certificate/[token]` is a placeholder that performs
  no fetch at all). Revisit this when the real certificate-document feature
  ships (tracked separately in `docs/claude/plans/customer-portal/
  Certificate_Document_Upload_Audit.md` / `Phase3A_Certificate_Issuance_Audit.md`
  — not this infra audit's scope).
- Adding this file does not modify any existing server block, same
  discipline every other `.conf.example` in this repo already documents.

## 6. DNS and SSL requirements

- **DNS:** an A record for `customer.kalibrasimedika.co.id` pointing at the
  same VPS IP the other MedCal subdomains resolve to. Nothing in this
  repository documents whether that record already exists — unlike
  `technician.*`, which a prior session's notes claimed was pre-created,
  `customer.*`'s DNS status is undocumented anywhere in-repo and must be
  confirmed directly (`dig`/`nslookup`) before proceeding.
- **SSL:** no existing certificate covers `customer.kalibrasimedika.co.id` —
  this VPS uses one dedicated Let's Encrypt cert per subdomain (confirmed
  from every existing `.conf.example`'s `ssl_certificate` path), no
  wildcard cert anywhere. A new `certbot --nginx -d customer.kalibrasimedika.co.id`
  run is required, same flow already used for every other MedCal subdomain
  — cert issuance must happen only after DNS resolves and the container is
  already up and healthy behind Nginx's HTTP (port 80) block.

## 7. Authentication / cookie / trusted-origin implications

- **`COOKIE_DOMAIN=".kalibrasimedika.co.id"`** (Better Auth
  `crossSubDomainCookies`) is a domain-suffix setting, not an explicit
  per-subdomain allowlist — it already covers `customer.kalibrasimedika.co.id`
  with **no change required**.
- **`TRUSTED_ORIGINS` — REQUIRED change.** This is read in three places, all
  of which must accept the new origin or the app will not function at all
  in production:
  - `packages/auth/src/index.ts` — Better Auth's own `trustedOrigins` (CSRF/
    origin-validation guard for every auth call).
  - `apps/api/src/main.ts` — NestJS's `app.enableCors({ origin:
    parseTrustedOrigins(...), credentials: true })`.
  - `apps/api/src/modules/chat/chat.gateway.ts` — Socket.IO CORS (not
    exercised by `customer-portal`, since it has no WebSocket usage, but
    reads the same variable).
  Current production value: `https://kalibrasimedika.co.id,https://apps.kalibrasimedika.co.id,
  https://portal.kalibrasimedika.co.id,https://technician.kalibrasimedika.co.id`
  — **`https://customer.kalibrasimedika.co.id` is absent** and must be
  added to the real `.env.production` on the VPS (and to the documented
  example value in `.env.production.example`) before sign-in/sign-up from
  the new hostname will be accepted.
- **Registration origin gating — no code change needed, already correct.**
  `apps/api/src/modules/whitelist/registration-origin.hook.ts` calls
  `resolveRegistrationContext(origin, ...)`
  (`packages/shared/src/utils/index.ts`), which already maps any hostname
  starting with `"customer."` to the `CUSTOMER_PORTAL` registration
  context — this is existing, committed logic. Once `TRUSTED_ORIGINS`
  includes the new origin (so the request isn't rejected by CORS before
  reaching this hook), staff-vs-customer self-registration will route
  correctly with zero application-code change.
- **No OAuth/redirect-URI config found** referencing `customer-portal`
  specifically — email/password only, same as every other app (`betterAuth()`
  config has no social providers configured).
- **`returnTo` deep-link handling:** `src/lib/return-to.ts`'s
  `sanitizeReturnTo()` already defends against open-redirect via absolute
  URLs / protocol-relative paths / embedded schemes — this is a same-origin,
  path-only mechanism and needs no change for a new hostname.

## 8. Security / isolation considerations

- **No database access:** zero `DATABASE_URL`/Prisma usage in this app's
  source — no `extra_hosts`/`host.docker.internal` needed.
- **No internal-service access:** the container makes no outbound calls of
  its own; every request to `apps/api` originates in the visitor's browser
  (same posture as `web`/`portal`/`tech-pwa`).
- **No file-storage/volume requirement:** no upload/download path exists in
  the app yet (see §5).
- **No Docker socket, no privileged capability, no `0.0.0.0` bind** — follow
  the same `127.0.0.1:<port>:<port>`-only convention every existing
  container already uses.
- **Smallest attack/dependency surface of any MedCal frontend today:** no
  Firebase/FCM, no PWA/service-worker, no host-based routing branch, no
  direct upload endpoint — strictly less than what `apps/tech-pwa` or
  `apps/portal` already run in production with no incident.
- **Authorization is two-layered by design, not by this infra:**
  session (Better Auth) proves *who*; `GET /me/customer-link` proves
  *which Customer, if any* — `AuthGate`'s own comment is explicit that
  actual certificate-data authorization is enforced server-side, never by
  the client-side gate alone. Nothing about the container/network topology
  needs to compensate for this; it's an application-layer concern already
  designed for.

## 9. Deployment sequence via SSH to the VPS

**Note before starting:** the local repository's `docker-compose.prod.yml`
does not yet contain the `tech-pwa` service block that is confirmed running
on the VPS — the local file and the live file have drifted. Before drafting
a `customer-portal` diff for real, first `cat` (or `docker compose config`)
the **actual file on the VPS** at `/medcal/docker-compose.prod.yml` and base
the new service block on that, not on the local repo's stale copy — this
prevents accidentally reverting the already-working `tech-pwa` block when
`customer-portal`'s block is committed. This applies only to *reading* the
current file accurately; it is not a change to `tech-pwa` itself.

```
Repository (commit locally first, then deploy)
  1. Reconcile local docker-compose.prod.yml with the VPS's real current
     content (see note above) before adding anything new.
  2. Create apps/customer-portal/Dockerfile.
  3. Add the customer-portal service block to docker-compose.prod.yml.
  4. Update .env.production.example: add customer-portal to the build-time-
     variables section header, add https://customer.kalibrasimedika.co.id
     to the documented TRUSTED_ORIGINS example value (template only).
  5. Create infra/nginx/customer.kalibrasimedika.co.id.conf.example.
  6. Commit and push.

VPS (via SSH, in /medcal)
  7. git pull.
  8. Add https://customer.kalibrasimedika.co.id to the real TRUSTED_ORIGINS
     value in the real (untracked) .env.production.
  9. docker compose --env-file .env.production -f docker-compose.prod.yml
     build customer-portal   (never a bare `docker compose build`).
 10. docker compose --env-file .env.production -f docker-compose.prod.yml
     up -d customer-portal   — start it alone first; confirm
     `docker compose ps` shows it healthy on 127.0.0.1:3005 before touching
     Nginx.

DNS
 11. Confirm/create the A record for customer.kalibrasimedika.co.id →
     the VPS IP; wait for propagation.

SSL
 12. Copy the new Nginx config to sites-available, symlink to
     sites-enabled, run `certbot --nginx -d customer.kalibrasimedika.co.id`,
     `nginx -t`, then `systemctl reload nginx` (reload, never restart —
     does not drop connections to any other existing site).

Deployment validation (see full checklist in §10)
 13. Confirm HTTPS access end-to-end on the new hostname.
```

## 10. Validation checklist after deployment

- `docker compose -f docker-compose.prod.yml ps` shows `customer-portal` as
  `Up (healthy)`.
- `curl -I https://customer.kalibrasimedika.co.id/` returns `200` (or a
  same-origin redirect chain ending in `200`), with a valid, non-expiring-soon
  TLS certificate for exactly that hostname.
- The four other existing production hostnames
  (`kalibrasimedika.co.id`, `api.*`, `apps.*`, `technician.*`) still resolve
  and respond exactly as before — `nginx -t` passed and the reload did not
  drop any other site.
- Sign-up from `https://customer.kalibrasimedika.co.id/sign-in/register`
  succeeds for an eligible email and is correctly classified as
  `CUSTOMER_PORTAL` registration context (not rejected with
  `ORIGIN_NOT_ALLOWED`, which would indicate `TRUSTED_ORIGINS` wasn't
  actually updated on the VPS).
- Sign-in sets a session cookie scoped to `.kalibrasimedika.co.id` (inspect
  `Set-Cookie`'s `Domain` attribute) and that session is recognized by
  `GET /me` against `api.kalibrasimedika.co.id` from the browser.
- A signed-in, `Customer`-linked account reaches the authenticated landing
  page (`(app)/page.tsx`); an account without a `CustomerUserLink` correctly
  sees the pending-approval state instead.
- `docker logs medcal-customer-portal` shows no repeated errors/crash-loop
  in the minutes after startup.

## 11. Rollback plan

- **Compose:** `docker compose -f docker-compose.prod.yml stop customer-portal`
  (or `rm`) — no other service is affected; `customer-portal` has no
  `depends_on` relationship in either direction, same isolation
  `tech-pwa`/`web`/`portal` already have.
- **Nginx:** remove/disable the `customer.kalibrasimedika.co.id` symlink
  from `sites-enabled` and `systemctl reload nginx` — every other site's own
  config file is untouched, so this is a clean, isolated revert with no
  effect on `kalibrasimedika.co.id`/`api.*`/`apps.*`/`technician.*`.
- **Env:** removing the added `TRUSTED_ORIGINS` entry is optional on
  rollback (a stale allowed-origin with nothing listening behind it is
  inert) but can be reverted for cleanliness.
- **DNS/SSL:** no rollback action needed unless the record/cert must be
  fully decommissioned; leaving them in place with the container stopped is
  safe — Nginx will simply `502` on that one hostname until it's
  re-enabled.

---

## Findings summary

```
BLOCKER
```
None. Unlike the `tech-pwa` audit, this domain/app pairing
(`customer.kalibrasimedika.co.id → apps/customer-portal`) is confirmed
correct by existing, already-committed application logic
(`resolveRegistrationContext`'s `"customer."` prefix mapping).

```
REQUIRED
```
1. Create `apps/customer-portal/Dockerfile` (no draft exists — net new).
2. Add the `customer-portal` service block to `docker-compose.prod.yml`,
   based on the VPS's actual current file (§9 note).
3. Add `https://customer.kalibrasimedika.co.id` to production
   `TRUSTED_ORIGINS` (currently absent).
4. Create `infra/nginx/customer.kalibrasimedika.co.id.conf.example`
   (net new — no draft exists, unlike `tech-pwa`'s `technician.*` file).
5. Issue a new Let's Encrypt certificate for `customer.kalibrasimedika.co.id`.
6. Confirm/create the DNS A record for `customer.kalibrasimedika.co.id`
   (undocumented anywhere in-repo, unverified by this audit).

```
RECOMMENDED
```
7. Reconcile the local `docker-compose.prod.yml` with the VPS's real
   current content before editing it for `customer-portal`, so the
   already-working `tech-pwa` block isn't accidentally reverted.
8. Update `.env.production.example`'s build-time-variables section header
   and `TRUSTED_ORIGINS` example value to include `customer-portal` /
   `customer.*` for documentation accuracy.

```
NO ACTION
```
9. Port allocation — `3005` is free, no collision.
10. Registration origin gating — `"customer."` prefix already wired;
    no application-code change needed.
11. `COOKIE_DOMAIN` — already correctly wildcard-scoped.
12. DB/internal-service access — none; confirmed zero in source.
13. WebSocket/FCM/PWA — none present; smallest containerization surface of
    any MedCal frontend so far.
