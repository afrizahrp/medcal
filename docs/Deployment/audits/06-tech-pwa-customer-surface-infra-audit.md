# apps/tech-pwa as a Production Customer Surface — Infrastructure Readiness Audit

**Scope:** forensic, read-only audit of the repository and production infrastructure
configuration to determine whether `apps/tech-pwa` can be brought up as a new,
isolated production service at `customer.kalibrasimedika.co.id`, without disturbing
the currently running MedCal production services. No source, config, Compose,
Nginx, DNS, SSL, or database state was modified as part of this audit.

**Existing production services (unaffected by this audit):**
`medcal-api`, `medcal-web-api`, `medcal-web`, `medcal-portal`.

---

## 0. Critical Finding — Read This First

The task that requested this audit frames the target topology as:

```
customer.kalibrasimedika.co.id → apps/tech-pwa
```

The repository's own current, committed state contradicts this framing. Multiple
independent, already-implemented sources agree that `customer.kalibrasimedika.co.id`
is the established production domain for a **different, already-existing app**:
`apps/customer-portal` (port 3005) — and that `apps/tech-pwa` (port 3004, the
technician field PWA) was independently planned for a **different hostname**,
`technician.kalibrasimedika.co.id`.

Evidence that `customer.kalibrasimedika.co.id` belongs to `apps/customer-portal`:

- `.env.example` (committed, current): `NEXT_PUBLIC_CUSTOMER_PORTAL_URL` — "Dev:
  `customer.localhost:3005`... Production: `https://customer.kalibrasimedika.co.id`".
- `apps/web/src/components/section-cta.tsx` (live code): the public site's own
  CTA already defaults `NEXT_PUBLIC_CUSTOMER_PORTAL_URL` to `customer.localhost:3005`.
- `apps/api/src/modules/whitelist/registration-gate.integration.test.ts`: a
  constant literally named `CUSTOMER_PORTAL_ORIGIN = "http://customer.localhost:3005"`.
- Eight planning/implementation documents under
  `docs/claude/plans/customer-portal/` (e.g. `Customer_Portal_MVP_Isolated_Implementation_Plan.md`,
  `Phase2_Customer_Portal_Foundation_Implementation_Report.md`) repeatedly and
  explicitly name `customer.kalibrasimedika.co.id` as `apps/customer-portal`'s
  production domain, including its certificate-verification URL pattern
  (`https://customer.kalibrasimedika.co.id/certificate/<token>`).
- `apps/customer-portal` already exists in the repo (created and committed via
  "audit and implementation customer portal", "implement certificate uploading"),
  with its own sign-in, registration, auth-gate, and certificate-by-token pages —
  i.e. this is not a proposal, it is implemented, committed application code.

Evidence that `apps/tech-pwa` was separately planned for `technician.kalibrasimedika.co.id`:

- `infra/nginx/technician.kalibrasimedika.co.id.conf.example` (committed) — a
  complete proposed Nginx block proxying to `127.0.0.1:3004`, tech-pwa's own port.
- `.env.production.example`'s `TRUSTED_ORIGINS` already lists
  `https://technician.kalibrasimedika.co.id` — **not** `https://customer.kalibrasimedika.co.id`.
- `infra/add-ssh/F5_7_Containerize_TechPWA_Staged.md` — a staged two-stage task
  ("F5.7: Containerize apps/tech-pwa") whose entire premise is
  `technician.kalibrasimedika.co.id`, including a claim that "DNS record for
  `technician.kalibrasimedika.co.id` already exists (A record → VPS IP)".
- `infra/technician-pwa-certs/` — a complete draft Dockerfile, Compose service
  block, and `.env.production.example` diff for `tech-pwa`, all targeting
  `technician.*`. These are draft/proposal documents (Stage 1 output); **none of
  the three were actually applied** to the real `apps/tech-pwa/` directory,
  `docker-compose.prod.yml`, or `.env.production.example` — see §3.
- `docs/Deployment/README.md` (committed, current): "`apps/tech-pwa` is not yet
  containerized — out of scope until its own implementation reaches that stage,"
  and its production topology table lists only `web` / `web-api` / `api` / `portal`
  — no `customer.*` entry at all.

**Conclusion of this section:** proceeding to deploy `apps/tech-pwa` at
`customer.kalibrasimedika.co.id` would contradict the repository's own,
already-accepted architecture (`apps/customer-portal` already owns that hostname
in code, tests, and docs), and would collide with the domain `apps/tech-pwa` was
itself already earmarked for (`technician.kalibrasimedika.co.id`). This is the
single largest risk this audit found — larger than any Docker/Compose/Nginx gap
below. **The minimum decision required before any implementation:** confirm which
application is actually intended to go live at `customer.kalibrasimedika.co.id` —
`apps/customer-portal` (already coded and documented for it) or `apps/tech-pwa`
(already coded and documented for `technician.kalibrasimedika.co.id` instead).

The remainder of this report audits `apps/tech-pwa`'s production/container
readiness exactly as the task requested, on its technical merits, independent of
which hostname it ultimately ends up on — everything below applies unchanged
whichever hostname is decided (the required Nginx/SSL/DNS/env work is mechanically
identical either way; only the `server_name` and cert differ).

---

## 1. Executive Summary

`apps/tech-pwa` (the technician field PWA — job list/detail, calibration
measurement entry, Identity Correction wizard, FCM push notifications) is **not
currently containerized**, but its build/runtime shape is a close, already-proven
match for `apps/portal`, which *is* containerized and production-validated. No
architectural obstacle exists. The gap is almost entirely mechanical: a
`Dockerfile`, a Compose service block, an Nginx server block, an env addition,
and a cert — none of which exist yet for real, though a full draft of all four
already exists in the repo from a prior staged task that was never carried past
its proposal stage. Combined with the domain conflict in §0, the honest verdict
is **PARTIAL** readiness with one non-technical blocker (§0) that must be
resolved first.

## 2. Current Tech PWA Architecture

- **Framework/runtime:** Next.js 16.2.12 (App Router), React 19.2.8, run via
  `next start` — not Next's `output: "standalone"` mode (no such setting in
  `apps/tech-pwa/next.config.js`). Requires the full `node_modules` tree +
  `.next` build output at runtime, same as `apps/web` and `apps/portal`.
- **Build:** `next build` (script: `"build": "next build"`). No custom
  webpack/build config beyond `transpilePackages: ["@medcal/ui", "@medcal/shared",
  "@medcal/auth"]` — identical set to `apps/portal`.
- **Start script:** `"start": "next start -p 3004"` — already has its own fixed
  port baked in, dev and (implicitly) production alike.
- **Workspace dependencies:** `@medcal/auth`, `@medcal/shared`, `@medcal/ui`
  (all `workspace:*`) — same monorepo package set `apps/portal` depends on, no
  new/unproven workspace package involved.
- **Runtime-relevant dependencies:** `firebase` (client SDK, for FCM push),
  `@tanstack/react-query`. `sharp` is a **devDependency** used only by a
  one-off local script (`scripts/generate-icons.mjs`) that pre-generates PWA
  icons; the generated PNGs are committed under `public/icons/`, so nothing at
  build or runtime depends on `sharp` actually running inside the image.
- **Environment variables read (verified by grep of `apps/tech-pwa/src` and
  `next.config.js` — nothing else):**
  - `NEXT_PUBLIC_API_URL` — used in `src/lib/fcm/register.ts` (FCM token
    register/revoke) and `src/app/jobs/[id]/use-job-query.ts` (fetching a
    file). Same variable, same value, already used by `apps/portal`.
  - `NEXT_PUBLIC_FIREBASE_API_KEY` / `_AUTH_DOMAIN` / `_PROJECT_ID` /
    `_STORAGE_BUCKET` / `_MESSAGING_SENDER_ID` / `_APP_ID` — read in
    `src/lib/fcm/config.ts` **and** in the dynamic
    `src/app/firebase-messaging-sw.js/route.ts` Route Handler. That route's own
    source comment claims these are "injected at runtime" via
    `dynamic = "force-dynamic"` — this is misleading: `NEXT_PUBLIC_*` literals
    are textually replaced by Next.js's build-time `DefinePlugin` substitution
    in every compiled output, server route handlers included, not only client
    bundles. There is no actual runtime-injection path for this route; the
    values must be supplied as Docker **build args**, exactly like the client
    bundle.
  - `NEXT_PUBLIC_FIREBASE_VAPID_KEY` — read in `src/lib/fcm/config.ts`.
  - No other `process.env.*` reads exist anywhere in `apps/tech-pwa/src`. In
    particular: **no `DATABASE_URL`, no server-only secret, no internal
    service URL other than `NEXT_PUBLIC_API_URL`.**
- **API/auth relationship:** `apps/tech-pwa` talks to exactly one backend,
  `apps/api`, and only from the browser (never from the Next.js server side) —
  every `fetch`/auth call originates client-side, same pattern documented for
  `apps/web` and `apps/portal`. Auth is Better Auth via `@medcal/auth/client`'s
  `authClient` (`createAuthClient({ baseURL: process.env.NEXT_PUBLIC_API_URL })`),
  the identical mechanism `apps/portal` uses — no tech-pwa-specific auth code.
- **No host-based routing:** unlike `apps/portal` (which branches on the `Host`
  header via `src/proxy.ts` for `apps.*` vs `portal.*`), `apps/tech-pwa` has no
  middleware or proxy file — it is a single-hostname app with no origin-
  dependent application logic to keep in sync with whichever hostname it is
  deployed under.
- **No WebSocket usage:** confirmed by grep (`websocket|socket\.io|ws://`) —
  zero matches anywhere in `apps/tech-pwa/src`.
- **No hardcoded domain/port:** grep for `localhost|kalibrasimedika|3004|3005`
  across `apps/tech-pwa/src` and `apps/tech-pwa/public` returns nothing — all
  origin values are environment-driven.
- **Root route behavior:** `src/app/page.tsx` does `redirect("/jobs")`
  (unauthenticated users are further redirected to `/sign-in` by that route's
  own auth gate). A plain `GET /` still resolves to a `200` after following
  redirects — compatible with the same `wget -qO- http://127.0.0.1:<port>/`
  healthcheck style already used by `web`/`portal`/`api`/`web-api`.

## 3. Docker Readiness

```
READY / PARTIAL / NOT READY
→ PARTIAL
```

**Evidence:**

- `apps/tech-pwa/Dockerfile` **does not exist** in the repository today (only
  `apps/api`, `apps/portal`, `apps/web`, and `apps/web-api` have one).
- However, a complete, already-written draft exists at
  `infra/technician-pwa-certs/dockerfile.md` — a direct adaptation of
  `apps/portal/Dockerfile`'s proven multi-stage pattern (`turbo prune
  @medcal/tech-pwa --docker` → `pnpm install --frozen-lockfile` → `next build`
  with `NEXT_PUBLIC_*` build args → non-root `next start -p 3004` runtime).
  It is a Markdown file, not an actual `Dockerfile` — it was never materialized
  into `apps/tech-pwa/Dockerfile`, and Stage 2 of its parent task
  (`infra/add-ssh/F5_7_Containerize_TechPWA_Staged.md`) was never executed
  (confirmed: no image was ever built — `apps/tech-pwa/Dockerfile` doesn't
  exist, and `docker-compose.prod.yml` has no `tech-pwa` service, see §­3
  Compose findings below).
- No monorepo/pnpm-workspace obstacle: `apps/tech-pwa` sits at
  `apps/tech-pwa` per `pnpm-workspace.yaml`'s `apps/*` glob, same as every
  containerized app; `turbo prune @medcal/tech-pwa --docker` is the same
  mechanism already proven for `web`/`portal`/`api`.
- No asset-loss risk: `.dockerignore`'s single `/public` exclusion is
  root-anchored only (its own comment explicitly calls this out), so
  `apps/tech-pwa/public/` (icons, manifest, `offline.html`, logos) is included
  in the Docker build context, same as `apps/web/public` and
  `apps/portal/public` today.
- No dependency/build issue found: `firebase` and `@tanstack/react-query` are
  ordinary npm packages with no native build step; `sharp` (devDependency
  only) is the one native-binary package in tech-pwa's tree, but per §2 it is
  never invoked at build or runtime — it would simply be installed and unused,
  the same non-blocking situation `apps/portal`'s image already tolerates for
  its own devDependencies.
- `docker-compose.prod.yml`'s own top-of-file comment still says explicitly:
  *"apps/tech-pwa is intentionally not included yet — containerize it when its
  own implementation reaches the appropriate stage... not merely for
  symmetry."* That comment has not been updated; the file has no `tech-pwa`
  service block.

**Verdict rationale:** nothing in `apps/tech-pwa`'s actual code blocks
containerization — its shape is materially simpler than `apps/portal`'s (no
host-based routing, no server-side calls to other services, fewer build args).
"PARTIAL" reflects that the Dockerfile/Compose/Nginx artifacts are drafted but
not real yet, not that anything needs to be redesigned.

## 4. Production Topology Recommendation

```
Internet
   |
<hostname-to-be-decided>.kalibrasimedika.co.id   (see §0 — customer.* vs technician.*)
   |
 Nginx  (HTTP→HTTPS redirect, ACME challenge location, HTTPS reverse proxy)
   |
 127.0.0.1:3004  (host-only bind, matches existing web/web-api/api/portal pattern)
   |
medcal-tech-pwa  (new Compose service, medcal_net bridge network)
   |
apps/tech-pwa  (next start -p 3004, browser calls apps/api directly for all data)
```

This mirrors every existing service's topology exactly (Nginx → 127.0.0.1-only
host port → container on `medcal_net`) with one simplification: unlike `api`,
`tech-pwa` needs no `extra_hosts`/`host.docker.internal` (no DB access) and
unlike `web-api`→`api`, no `depends_on` (no container-to-container call — every
call to `apps/api` originates in the visitor's browser).

## 5. Required Repository Changes

*Audit only — nothing below has been implemented.*

- **Dockerfile:** create `apps/tech-pwa/Dockerfile`. A ready-to-adapt draft
  already exists at `infra/technician-pwa-certs/dockerfile.md`; it needs no
  architectural change, only confirmation of the final build-arg list against
  whatever the resolved §0 decision requires.
- **Compose:** append a `tech-pwa` service block to `docker-compose.prod.yml`.
  A ready-to-adapt draft exists at
  `infra/technician-pwa-certs/appended after portal-before-networks.md`
  (service name `tech-pwa`, `container_name: medcal-tech-pwa`, image
  `medcal-tech-pwa:latest`, `127.0.0.1:3004:3004`, `medcal_net` only, no
  `env_file`, no `depends_on`, healthcheck against `/`). Update the file's own
  header comment (currently states tech-pwa is deliberately excluded) as part
  of the same change.
- **Environment:** no new environment *variable names* are required beyond
  what `.env.production.example` already documents for `apps/portal`'s shared
  Firebase block (`NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_API_URL`) — see §7 for
  the one required *value* change (`TRUSTED_ORIGINS`).
- **Application config:** none. `next.config.js` needs no change; no
  `output: "standalone"` migration is required (consistent with every other
  app in this repo).
- **Authentication/origin:** no application code change — Better Auth's
  `trustedOrigins` and `crossSubDomainCookies` are both environment-driven
  (see §7), not hardcoded per app.
- **Dependency/package changes:** none identified.
- **Secondary, unrelated-to-tech-pwa finding surfaced while reading
  `.env.production.example` for this audit:** past its structured production
  section (roughly the first 146 lines), the file contains a second, unmarked
  block that re-declares many of the same variable names with dev-style
  (`localhost`) defaults, and several of those values are literal
  secret-shaped strings rather than placeholders (an internal-service secret,
  a reCAPTCHA key pair, a database password) — not reproduced here per this
  audit's instruction not to surface secret values. Whether these are inert
  dev-only leftovers or something that needs rotating cannot be determined
  from static inspection alone; flagged as worth a deliberate look, since a
  file literally named "production example" containing two conflicting
  sections is an easy way for an operator to copy the wrong block into the
  real `.env.production`.

## 6. Required VPS Changes

*Audit only — nothing below has been implemented.*

- **Docker/Compose:** run `docker compose --env-file .env.production -f
  docker-compose.prod.yml build tech-pwa` (never a bare `docker compose
  build`, per the file's own documented `.env` vs `.env.production` trap),
  then bring the new service up — only after the Dockerfile/Compose changes
  in §5 are actually committed and reviewed.
- **Nginx:** install a new server block for whichever hostname §0 resolves
  to. If `technician.kalibrasimedika.co.id` is the answer, the file already
  exists and is directly usable: `infra/nginx/technician.kalibrasimedika.co.id.conf.example`
  (proxies to `127.0.0.1:3004`, standard headers, no WebSocket
  upgrade/`client_max_body_size` override needed — matches §2's findings that
  tech-pwa has no WS usage and no direct-upload endpoint). If
  `customer.kalibrasimedika.co.id` is the answer, a new file with the same
  shape but a different `server_name`/cert path is needed — and it would then
  collide with whatever `apps/customer-portal` also needs at that hostname,
  which is the core of the §0 decision. No existing server block is disturbed
  by adding a new one — every existing `.conf.example` in this repo already
  documents "does not modify any existing server block" and that discipline
  applies identically here.
- **SSL:** neither `technician.*` nor `customer.*` is covered by any existing
  certificate — this VPS's existing setup uses one dedicated Let's Encrypt
  cert per subdomain (confirmed from every `infra/nginx/*.conf.example`'s
  `ssl_certificate .../live/<exact-subdomain>/...` path), no wildcard cert in
  use anywhere. A new `certbot --nginx -d <chosen-hostname>` run is required,
  following the exact same flow already used for `api.*`/`apps.*`/root.
- **DNS:** an A record (and matching AAAA if this VPS is dual-stack — not
  confirmed by this audit) for whichever hostname is chosen, pointing at the
  same VPS IP the existing MedCal subdomains use.
  `infra/add-ssh/F5_7_Containerize_TechPWA_Staged.md` asserts, from a prior
  session, that the `technician.kalibrasimedika.co.id` A record "already
  exists" — this audit has no way to independently verify live DNS state from
  within the repository, so that claim is reported as-is, not confirmed.
  `customer.kalibrasimedika.co.id`'s DNS status is not documented anywhere in
  this repository.
- **Firewall/port:** no new inbound port is needed — `3004` is bound to
  `127.0.0.1` only (Nginx-only reachability), identical posture to every
  existing MedCal container; no UFW change required beyond what already
  permits 80/443, which the existing sites already need.

## 7. Security / Isolation Findings

- **No database access:** `apps/tech-pwa` has no `DATABASE_URL` anywhere in
  its source or env reads (confirmed by grep). Unlike `apps/api`, it needs no
  `extra_hosts: host.docker.internal:host-gateway` and no path to native
  PostgreSQL.
- **No internal-service access:** the container itself makes zero outbound
  calls — every request to `apps/api` happens in the visitor's browser. No
  `depends_on`, no service-to-service secret (`INTERNAL_API_SECRET`,
  `CHAT_SESSION_TOKEN_SECRET`) is relevant to this app.
- **No filesystem/volume requirement:** unlike `apps/api` (which bind-mounts
  `MEDCAL_FILES_DIR` for uploaded certificate/evidence files), `tech-pwa` has
  no file-storage dependency — evidence photos captured in its Identity
  Correction wizard are uploaded straight from the browser to `apps/api`, not
  through this container.
- **No Docker socket, no privileged capability, no `0.0.0.0` bind:** nothing
  in the draft artifacts or in tech-pwa's own requirements calls for any of
  these; the recommended Compose block in §5 follows the same
  `127.0.0.1:<port>:<port>`-only convention already enforced for all four
  existing app containers.
- **Firebase Admin / service-account credentials must never reach this
  container** — only the public `NEXT_PUBLIC_FIREBASE_*` Web config and VAPID
  key. This is already explicitly called out in the draft Dockerfile's own
  comments and is consistent with how `apps/portal`'s image is built today.
- **Net effect:** `apps/tech-pwa` is, if anything, a *more* isolated frontend
  than `apps/portal` (no host-based routing logic to get wrong, no
  server-side fan-out). No isolation gap was found; the container needs
  exactly the same minimal network reachability (`medcal_net`, one
  host-loopback port for Nginx) that `web`/`portal` already have and nothing
  more.

## 8. Findings

```
BLOCKER
```

1. **Domain/application mismatch (§0).** The task's premise —
   `customer.kalibrasimedika.co.id → apps/tech-pwa` — contradicts the
   repository's own committed, already-implemented architecture, in which
   `customer.kalibrasimedika.co.id` is `apps/customer-portal`'s domain
   (coded, tested, and documented across eight planning docs) and
   `apps/tech-pwa` was independently already planned for
   `technician.kalibrasimedika.co.id` (Nginx template, `TRUSTED_ORIGINS`
   entry, and a full staged Dockerfile/Compose draft already exist for that
   pairing). A decision on the actual intended target app/hostname is
   required before any repository, VPS, DNS, or SSL change proceeds — this
   is not a technical blocker inside `apps/tech-pwa` itself, but it
   determines every subsequent step below.

```
REQUIRED
```
*(all of the following apply once the §0 decision is made, unchanged in
substance regardless of the hostname chosen)*

2. Create `apps/tech-pwa/Dockerfile` (draft exists, §3/§5).
3. Add the `tech-pwa` service block to `docker-compose.prod.yml` (draft
   exists, §5).
4. Add/confirm real `NEXT_PUBLIC_FIREBASE_*` + `NEXT_PUBLIC_FIREBASE_VAPID_KEY`
   values in the real (untracked, VPS-only) `.env.production` (names already
   documented; no values present, correctly, in the example file).
5. Add the chosen hostname's origin to production `TRUSTED_ORIGINS` — today
   it contains `technician.*` but not `customer.*`, and would need whichever
   one §0 resolves to (both Better Auth's `trustedOrigins` check and NestJS's
   `app.enableCors()`/the chat Socket.IO gateway's CORS all read this same
   variable — a missing entry hard-blocks sign-in from the new origin).
6. Create the Nginx server-block file for the chosen hostname (`technician.*`
   already has one ready to use; `customer.*` would need a new one — see §6).
7. Issue a new Let's Encrypt certificate via Certbot for the chosen hostname
   — neither hostname is covered by any existing cert (§6).
8. Confirm/create the DNS A record for the chosen hostname (§6) —
   independently unverifiable from this repo.

```
RECOMMENDED
```

9. Clean up `.env.production.example`'s duplicate/legacy second block (§5) so
   an operator can't accidentally copy dev-style values (including
   secret-shaped literals) into a real production `.env.production`.
10. Once a real Dockerfile/Compose change is applied for `tech-pwa`, retire
    the now-superseded staged proposal documents
    (`infra/add-ssh/F5_7_Containerize_TechPWA_Staged.md`,
    `infra/technician-pwa-certs/*.md`) or clearly mark them historical, so the
    repo doesn't carry two parallel "proposed but never applied" drafts for
    the same app going forward.

```
NO ACTION
```

11. Port allocation — `3004` is free on the host; no collision with
    `3001`/`3002`/`3003`/`3010` (or `3005`, `apps/customer-portal`'s own dev
    port).
12. WebSocket support — not needed; confirmed no usage anywhere in
    `apps/tech-pwa/src`.
13. Direct database or internal-service access — not needed; confirmed none
    in source.
14. `COOKIE_DOMAIN` — already correctly scoped to `.kalibrasimedika.co.id`,
    which covers any future subdomain (including whichever one §0 resolves
    to) with no change required.
15. Monorepo/pnpm-workspace compatibility — no obstacle; `turbo prune
    @medcal/tech-pwa --docker` uses the same proven mechanism as every
    containerized app.

## 9. Implementation Sequence

A safe order, **starting only after §0's domain/app decision is made**:

```
0. Decision
   - Confirm which app is intended at customer.kalibrasimedika.co.id
     (apps/customer-portal, per existing code/docs, or apps/tech-pwa,
     per this task's premise). Confirm apps/tech-pwa's actual target
     hostname if it is not customer.*.

Repository
   1. Create apps/tech-pwa/Dockerfile (adapt the existing draft).
   2. Append the tech-pwa service block to docker-compose.prod.yml;
      update that file's header comment.
   3. Update .env.production.example: add the resolved hostname's origin
      to the documented TRUSTED_ORIGINS example value (still a template,
      no real secret).
   4. Create the Nginx example config file for the resolved hostname
      under infra/nginx/ (reuse technician.*'s file directly if that is
      the resolved hostname).

VPS
   5. Fill in real NEXT_PUBLIC_FIREBASE_* / VAPID values and the resolved
      hostname's TRUSTED_ORIGINS entry in the real .env.production.
   6. Build the image: docker compose --env-file .env.production
      -f docker-compose.prod.yml build tech-pwa.
   7. Start the container alone first (docker compose ... up -d tech-pwa)
      and verify its healthcheck passes on 127.0.0.1:3004 before touching
      Nginx — same discipline already used for the other four services.

DNS
   8. Confirm (or create) the A record for the resolved hostname, pointing
      at the existing VPS IP.

SSL
   9. Copy the Nginx config to sites-available, symlink to sites-enabled,
      run `certbot --nginx -d <hostname>`, `nginx -t`, then
      `systemctl reload nginx` (reload, never restart).

Deployment
   10. With DNS resolving and the cert issued, confirm HTTPS access to the
       new hostname end-to-end (sign-in, a representative job/measurement
       page, FCM permission prompt).

Validation
   11. Confirm no regression on the four existing domains
       (kalibrasimedika.co.id, api.*, apps.*, and technician.* if that
       hostname is already live for something else) — same reload,
       different sites, no restart.
   12. Confirm session cookies work across the new hostname (COOKIE_DOMAIN
       is already subdomain-wide, so this should need no further change —
       verify rather than assume).

Rollback
   13. Compose: `docker compose -f docker-compose.prod.yml stop tech-pwa`
       (or `rm`) — no other service is affected, since tech-pwa has no
       `depends_on` relationship in either direction.
   14. Nginx: remove/disable the new sites-enabled symlink and
       `systemctl reload nginx` — every existing site's own config is
       untouched, so this is a clean, isolated revert.
   15. DNS/SSL: no rollback action needed unless the record/cert must be
       removed entirely; leaving them in place with the container stopped
       is safe (Nginx will simply 502 on that one hostname).
```

## 10. Final Verdict

```
NOT READY FOR CONTAINERIZATION
```

Not because of anything wrong with `apps/tech-pwa` itself — on pure Docker/
Compose/Nginx/env-auth merits it is **PARTIAL** and one of the easiest apps in
this monorepo to containerize, with most of the mechanical work already
drafted. The verdict is "NOT READY" because of the concrete, non-technical
blocker in §0: this task's target domain, `customer.kalibrasimedika.co.id`,
is already the repository's established, coded, documented production domain
for a different app (`apps/customer-portal`), and `apps/tech-pwa` was itself
already independently planned for a different domain
(`technician.kalibrasimedika.co.id`). Implementing this task's literal request
as written would very likely deploy the wrong application to a
customer-facing production hostname. **Resolve which app actually belongs at
`customer.kalibrasimedika.co.id` before any Dockerfile, Compose, Nginx, DNS,
or SSL change is made** — once that is confirmed, every remaining item in
§5–§9 is straightforward, low-risk, and largely already drafted.
