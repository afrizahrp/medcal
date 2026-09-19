# IMPLEMENT (STAGED) — F5.7: Containerize apps/tech-pwa (Production)

## Mode
This task has TWO stages with a HARD STOP between them. Do NOT proceed past Stage 1 without
explicit user confirmation in this conversation. This continues the F5 (domain topology / env
wiring) work already documented in `docs/Architecture/02-foundation-implementation-plan.md` and
`docs/Deployment/`. Follow the exact discipline already established there — do not deviate.

**Scope lock:** this task containerizes `apps/tech-pwa` for production ONLY. Do NOT touch
`apps/api`, `apps/web`, `apps/web-api`, or `apps/portal`'s existing Docker configuration. Do NOT
modify native PostgreSQL config. Do NOT modify, reload, or restart the live Nginx instance —
prepare an example config file only, exactly as `infra/nginx/api.kalibrasimedika.co.id.conf.example`
already does for `apps/api` (a plan the operator applies manually, not a deployed change). Do NOT
run Certbot. Do NOT touch the other 5 existing containers (`medcal-portal`, `medcal-web-api`,
`medcal-web`, `medcal-api`, `mssql2019`) or the existing PM2-supervised applications
(`bip-frontend`, `bis-frontend`, `bumiindah--backend-7000`, `dashboard-backend`,
`dashboard-frontend`, `staging-app`, `sync-app`) — these are explicitly out of scope per the
"observed, not touched" principle already applied throughout F5.

## Background — confirmed facts (do not re-verify, already established this session)

1. `apps/tech-pwa/Dockerfile` does not exist yet — confirmed live on the VPS.
2. `docker-compose.prod.yml` explicitly and intentionally excludes `tech-pwa` — its own header
   comment says containerize "when its own implementation reaches the appropriate stage." That
   stage has now been reached: tech-pwa has a complete foundation (mobile-first shell, offline
   app-shell service worker, install manifest/icons), job list/detail, AKD/AKL escalation, the
   full Identity Correction submit wizard (camera capture, correct single-photo-per-BA model),
   and Reference Equipment Used recording — all typechecked and functionally reviewed across
   several staged implementation passes.
3. `apps/portal/Dockerfile` is the closest template: same monorepo (`turbo prune`), same
   Next.js version, same need for `NEXT_PUBLIC_*` build-time inlining (Firebase config + VAPID
   key, since `tech-pwa` also uses FCM), same non-root runtime user pattern from
   `apps/api/Dockerfile`.
4. `tech-pwa`'s dev port is 3004 (`next dev -p 3004` / `next start -p 3004`, confirmed in
   `package.json`). No port collision with existing services (3001 api, 3002 web-api, 3003
   portal, 3010 web, 1433 mssql2019).
5. DNS record for `technician.kalibrasimedika.co.id` already exists (A record → VPS IP). SSL
   cert does NOT exist yet for this subdomain — correctly not requested yet, since nothing
   answers on that port/proxy path until this task's container exists.
6. `docker-compose.prod.yml`'s existing convention: `127.0.0.1:<port>:<port>` only, never
   `0.0.0.0` — containers are reachable from Nginx on the same host, never directly from the
   Internet. Follow this exactly for `tech-pwa`.
7. `tech-pwa` does NOT need direct database access (it only calls `apps/api` over HTTP from the
   browser) — no `DATABASE_URL`, no `host.docker.internal`/`extra_hosts` entry needed for this
   service, unlike `api`.

## Stage 1 — Investigate and propose (no files written yet)

1. Read `apps/portal/Dockerfile` in full — this is the direct template.
2. Read `.env.production.example` in full — confirm exactly which `NEXT_PUBLIC_FIREBASE_*` /
   `NEXT_PUBLIC_API_URL` values already exist there (portal already needs them) and whether
   `tech-pwa` needs the identical set or a subset. Confirm whether any tech-pwa-specific env var
   exists that isn't already in the template (re-check `apps/tech-pwa/src/lib/fcm/` and any
   `.env.example` entries specific to that app).
3. Propose the new `apps/tech-pwa/Dockerfile` — multi-stage `turbo prune @medcal/tech-pwa --docker`
   build, `NEXT_PUBLIC_*` as build args (mirroring `portal`'s exact args list, minus anything
   portal-only), non-root runtime user, `EXPOSE 3004`.
4. Propose the new `tech-pwa` service block to append to `docker-compose.prod.yml`, matching the
   existing services' shape exactly: `build.context`/`dockerfile`/`args`, `image:
   medcal-tech-pwa:latest`, `container_name: medcal-tech-pwa`, `restart: unless-stopped`,
   `ports: "127.0.0.1:3004:3004"`, `networks: [medcal_net]`, healthcheck against `/` or a
   suitable route, and state explicitly whether any `depends_on` is warranted (recommend: none,
   same reasoning as `portal` — tech-pwa's calls to `api` originate from the visitor's browser,
   not from this container).
5. Propose the `.env.production.example` additions/confirmations needed for `tech-pwa` (likely:
   confirm `NEXT_PUBLIC_API_URL` already covers it, add nothing new if portal's existing
   Firebase block is shared/identical — state clearly whether tech-pwa uses the SAME Firebase
   project/app as portal or needs its own `NEXT_PUBLIC_FIREBASE_APP_ID` — check the actual FCM
   setup code in both apps to confirm rather than assuming).
6. Propose the Nginx example config file
   `infra/nginx/technician.kalibrasimedika.co.id.conf.example`, mirroring
   `api.kalibrasimedika.co.id.conf.example`'s exact structure (HTTP→HTTPS redirect + Certbot
   ACME-challenge location + HTTPS block, proxying to `127.0.0.1:3004`) — a plan document only,
   not applied. State the same manual install sequence documented in the existing example file
   (start container first, copy to `sites-available`, symlink, `certbot --nginx`, `nginx -t`,
   `reload` not `restart`).
7. Present the full proposal (Dockerfile content, compose service block, env additions, Nginx
   example) and STOP. Ask for explicit approval before Stage 2.

## Stage 2 — Implement and verify (ONLY after explicit user approval)

1. Create the approved `apps/tech-pwa/Dockerfile`.
2. Append the approved service block to `docker-compose.prod.yml`.
3. Update `.env.production.example` with the approved additions (template only — no real
   secrets).
4. Create the approved `infra/nginx/technician.kalibrasimedika.co.id.conf.example` — file only,
   do NOT copy it into `sites-available`, do NOT run `nginx -t`, do NOT reload Nginx, do NOT run
   Certbot. That remains a manual operator step, exactly as it was for `apps/api`.
5. Build the image: `docker compose --env-file .env.production -f docker-compose.prod.yml build tech-pwa`
   (per the file's own documented warning: never a bare `docker compose build`, and always with
   `--env-file .env.production` explicitly, since the repo's dev `.env` would otherwise be
   picked up and bake localhost values into the production build).
6. Verify the image built successfully and report its size.
7. Do NOT start the container yet in this task unless explicitly told to in this conversation —
   building and verifying the image is the deliverable; starting it (and the subsequent Nginx/
   SSL steps) is a separate confirmed action, matching how `apps/api`'s F5.2 was verified via a
   standalone `docker run` before ever being brought up through Compose on a real target.
8. Report `git status` — list exactly which files changed/were created.

## Output / final message format

**After Stage 1:** present the full Dockerfile content, the compose service block, the env
file diff, and the Nginx example config content. End with an explicit request for approval to
proceed to Stage 2.

**After Stage 2 (only if reached):** confirm exactly which files were created/changed, the
build result (success/failure, image size), and explicitly state that the container was NOT
started and Nginx/Certbot were NOT touched — those remain separate, explicitly-confirmed next
steps.
