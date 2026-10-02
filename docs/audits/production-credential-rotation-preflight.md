# Production Credential Rotation — Preflight (read-only)

| | |
|---|---|
| **Date** | 2026-10-02 |
| **Mode** | READ-ONLY. No rotation, no production change, no source change, no commit/push |
| **Secrets** | **No credential values appear in this report.** Only variable names, lengths, shapes and commit hashes |
| **Predecessor** | `docs/audits/lead-contact-message-remediation-f03-f04.md` (F-04) |
| **Evidence limit** | VPS runtime inspection was **NOT possible** (see §2.3). All "production" statements are therefore from repository files + prior-session docs, and are capped at **PROBABLE** or **UNKNOWN** |

Classification: **CONFIRMED** = verified directly from repo files/git (or production runtime, where stated) · **PROBABLE** = strong evidence, not verified on production · **UNKNOWN** = insufficient evidence.

---

## 1. Executive Summary

- **Production credential dependencies are NOT fully known.** The *wiring* (which service reads which variable, and from which file) is CONFIRMED from `docker-compose.prod.yml` and source. The *values* in the VPS's `.env.production` are **UNKNOWN**, because SSH access from this session was refused (`Permission denied (publickey,password)` for `afriza@168.231.119.205`; no further attempts were made).
- **Definitely require rotation (exposure is CONFIRMED; production use unverified, so treat as live):**
  1. `INTERNAL_API_SECRET` — real-like (64 chars) value in public-reachable git history.
  2. reCAPTCHA **secret** key — real-like (40 chars) value in git history.
  3. PostgreSQL password(s) in the committed production-style URL (`host.docker.internal` → DB `pkmdb`, role `postgres` — the superuser role) and the dev/compose password.
- **Rotation required if the accounts exist anywhere beyond a throwaway dev DB:** the six `trial-mh-*` passwords (production use UNKNOWN).
- **Firebase service account: NOT a real credential** (CONFIRMED by inspection; see §4.5). No Firebase rotation is indicated by the repo.
- **Not exposed (placeholders in git):** `BETTER_AUTH_SECRET`, `CHAT_SESSION_TOKEN_SECRET`. Their *production* values are UNKNOWN — must be verified not to be the `change-me…` placeholders.
- **Can rotation safely begin?** Not yet. First do the read-only VPS verification in §7 (compare fingerprints of the VPS values to the exposed ones, and confirm DB role/consumers). Rotating blind is risky for the DB password and `INTERNAL_API_SECRET`, which break the site if mis-sequenced.
- Repository history was not rewritten; removing values from HEAD does not un-expose them.

---

## 2. Production Architecture

### 2.1 Confirmed from files (`docker-compose.prod.yml`, `infra/nginx/*.example`, Dockerfiles)

```
Internet
  ↓
nginx (host)                         [config = *.conf.example only; live config NOT inspected → PROBABLE]
  ├─ kalibrasimedika.co.id            → medcal-web          127.0.0.1:3010 → 3000   (build args only, no env_file)
  ├─ kalibrasimedika.co.id/public/*   → medcal-web-api      127.0.0.1:3002          (env_file .env.production)
  │                                        └─ HTTP + x-internal-secret ─→ medcal-api
  ├─ api.kalibrasimedika.co.id        → medcal-api          127.0.0.1:3001          (env_file .env.production)
  │                                        └─ TCP via host.docker.internal (host-gateway) ─→ native PostgreSQL on VPS host :5432
  ├─ apps.kalibrasimedika.co.id       → medcal-portal       127.0.0.1:3003          (env_file .env.production + build args)
  ├─ technician.kalibrasimedika.co.id → medcal-tech-pwa     127.0.0.1:3004          (build args only)
  └─ customer.kalibrasimedika.co.id   → medcal-customer-portal 127.0.0.1:3005       (build args only)
```

- Compose project `medcal`, network `medcal_net`, all ports bound to 127.0.0.1. **CONFIRMED (file)**.
- PostgreSQL is **native on the VPS host, not containerized, not managed**. **CONFIRMED (file comments)**; actual instance/version **UNKNOWN**.
- Other VPS tenants seen in docs (PM2 apps, `mssql2019`) are out of scope and not part of Medcal.
- No systemd units, PM2 ecosystem file or deploy script for Medcal exist in the repo (`scripts/` holds only `backup-medcal.sh` and `sql/`). **CONFIRMED (absence in repo)**; whether anything of the kind exists *on the VPS* is **UNKNOWN**.

### 2.2 Environment source map (§3 of the task, Phase 2)

| Service | Runtime env source | Build-time source | Confirmed? |
|---|---|---|---|
| api | `env_file: .env.production` | none (Dockerfile sets only `NODE_ENV`) | YES (file) / values UNKNOWN |
| web-api | `env_file: .env.production` (same file) | none | YES (file) / values UNKNOWN |
| portal | `env_file: .env.production` | `NEXT_PUBLIC_*` build args via `--env-file .env.production` | YES (file) / values UNKNOWN |
| web | none | `NEXT_PUBLIC_API_URL`, `_WEB_API_URL`, `_RECAPTCHA_SITE_KEY`, `_CUSTOMER_PORTAL_URL` build args | YES (file) |
| tech-pwa | none (no secrets at runtime) | `NEXT_PUBLIC_*` build args | YES (file) |
| customer-portal | none | `NEXT_PUBLIC_API_URL` build arg | YES (file) |
| Worker | no separate worker service in compose | — | YES (absence) |

Key properties (CONFIRMED from compose): api and web-api share **one** file, so `INTERNAL_API_SECRET` and `CHAT_SESSION_TOKEN_SECRET` are identical by construction. `env_file` is read when the container is **created**.

Location of `.env.production` on the VPS (path, permissions, whether `.env` also exists beside it): **UNKNOWN**.

### 2.3 VPS access attempt

One non-interactive, read-only attempt (`ssh -o BatchMode=yes afriza@168.231.119.205`, running only `hostname`, `whoami`, `docker ps` with a name/status/ports format, and a home listing) was **refused at authentication**. The host/user were taken from prior-session transcripts. No other host, user or credential was tried. Nothing on the VPS was read or changed.

---

## 3. Credential Dependency Matrix

### 3.1 INTERNAL_API_SECRET

```
Credential: INTERNAL_API_SECRET
Production present: PROBABLE (api rejects every internal request if unset — guard fails closed; web-api silently sends "" if unset)
Producer/sender: apps/web-api/src/index.ts:32 (read once at process start), sent as `x-internal-secret` on 4 forwarded routes (lines ~179, 221, 265, 313)
Validator: apps/api/src/common/guards/internal-service.guard.ts:23 (reads process.env at each request; strict !== compare; also fail-closed if unset)
Guarded features: contact-messages and chat-sessions intake (InternalServiceGuard used by contact-messages + chat-sessions controllers)
Consumers: web-api (sender), api (validator) — both from the same .env.production
Rotation impact: public Contact Form, WhatsApp lead, Chat session creation (via web-api) return 5xx/401 until both processes hold the new value. Authenticated portal/tech-pwa traffic is NOT affected
Restart required: YES — both containers must be RE-CREATED (env_file is not re-read by `docker restart`)
Simultaneous update: YES — single file edit + recreate of both; mismatch window = failures on public intake only
Rollback: YES (restore old line + recreate)
```
Exposure: CONFIRMED (git `4796b7f` 2026-08-16, `0465963` 2026-08-20; real-like, 64 chars). Match to production: **UNKNOWN**.

### 3.2 reCAPTCHA

```
Secret (RECAPTCHA_SECRET_KEY)
  Backend verifier: apps/web-api/src/recaptcha.ts:33 (runtime env). api also receives it via the shared env_file but does not read it (no reference in apps/api/src)
  Production present: PROBABLE (fails closed with HTTP 400 if unset)
Site key (NEXT_PUBLIC_RECAPTCHA_SITE_KEY)
  Frontend consumer: apps/web only; baked into the client bundle at `next build` via compose build arg. Not a secret
Pairing: site key and secret must belong to the same Google key pair — CONFIRMED by design; actual pairing in production UNKNOWN
Match to exposed value: UNKNOWN (cannot read VPS file)
```
- Rotating the **secret only** → backend only: edit `.env.production`, recreate **web-api**; no web rebuild.
- If Google requires a **new key pair** (PROBABLE — reCAPTCHA admin does not offer an independent "reset secret" for an existing key; verify in the console) → new site key too → **rebuild + redeploy `web`** (build arg) **and** recreate web-api, done together or the old/new keys mismatch and every form submit returns 400.
- Google-side action: YES (console; not performed). Affected: web + web-api only. portal/tech-pwa/customer-portal do not use it (`apps/portal` has no reCAPTCHA usage per the env template; not re-verified by grep here).
- During a mismatch: contact form / WhatsApp lead / chat-session creation rejected (400), no data loss, fail-closed.

### 3.3 PostgreSQL

```
Production DB credential:
  Host: host.docker.internal:5432 → native PostgreSQL on VPS host (CONFIRMED in compose/template; managed DB: NO per files)
  DB name / role: the committed production-style URL (894c7ad, 2026-09-05) used DB `pkmdb` and role `postgres` (the superuser).
                  A second, dev-style URL used role `pkmdb` / DB `medcal` @ localhost.  → PROBABLE that prod uses one of these shapes; UNKNOWN which
  Password present: PROBABLE (api cannot boot without DATABASE_URL — packages/db/Prisma)
  Source: .env.production on the VPS → env_file of api (and portal, web-api, see below)
  Matches exposed Git credential: UNKNOWN
Consumers:
  api            — CONFIRMED (Prisma, DATABASE_URL)
  portal         — receives DATABASE_URL through the shared env_file; whether it uses it: UNKNOWN (not traced; Next.js server code may import @medcal/db)
  web-api        — receives DATABASE_URL through the shared env_file; doc says "zero DB access" (not re-verified here)
  backup job     — scripts/backup-medcal.sh (credential source not inspected → UNKNOWN; see Open Questions)
  Other VPS tenants on the same Postgres instance: UNKNOWN
Dev compose: docker-compose.yml (local Postgres, POSTGRES_USER `afriza`, DB `pkmdb`) is a SEPARATE dev credential — CONFIRMED by file. The prod example's DB name `pkmdb` equals the dev compose DB name, so name alone does not distinguish them.
```
Exposure: CONFIRMED (`894c7ad`, `0465963`, plus `3af90d6`, `d624f15`, `19c54e7` for the compose/doc password). Do **not** change in this task.

### 3.4 Trial credentials

- Six users `trial-mh-tech-1..4`, `trial-mh-manager-1..2`, emails under `@medcal.test` (seed `lib.ts`, `set-trial-credentials.ts`). Scripts run via `tsx --env-file=../../.env` (the **dev** `.env`) — CONFIRMED.
- `lib.ts` comment explicitly anticipates "a demo/VPS database" via `TRIAL_CUSTOMER_ID`, so the same seed *could* have been run against a VPS DB — **UNKNOWN** whether it was.
- `@medcal.test` is not a deliverable domain, so these are not real-person accounts. But they are valid Better Auth credential accounts with manager/technician memberships, and sign-in works wherever they exist.
- Classification: **development/seed (PROBABLE); production presence UNKNOWN.**
- `ROTATION REQUIRED: PROBABLE` — only needed if the accounts exist in the production DB; the safe path regardless is "disable or reset all six". Cannot be answered without a read-only DB query on the VPS (`SELECT id, status FROM "User" WHERE id LIKE 'trial-mh-%'`; password hashes must not be selected).

### 3.5 Firebase service account (§7 of task)

- `docs/cursor/plan/FCM/fcm_phase1_implementation_report.md:377` is a `FIREBASE_SERVICE_ACCOUNT_JSON=` line, 317 chars total (value 287 chars). It parses as JSON with all 10 standard service-account keys **but** the value is shaped like an example: placeholder tokens (`...`/`<…>`/`example`-style) are present, and a real `private_key` alone is ~1600+ chars, which cannot fit inside 287 chars.
- Verdict: **CONFIRMED placeholder / documentation-only**. Not a real credential. Introduced once, in commit `d0b84d1` (`feat(api): add FCM token infrastructure`); `git log --all -S"BEGIN PRIVATE KEY"` finds no other commit. Only one tree file matches the private-key marker.
- Production use: the *real* `FIREBASE_SERVICE_ACCOUNT_JSON` is read by `packages/notifications/src/push/firebase-admin.ts:27` in api; if unset, push silently disables (logged error). Whether production has a real one in `.env.production`: UNKNOWN. It is **not** in git → no exposure-driven rotation.
- Caveat: nothing outside the repo (e.g. chat logs, CI) was scanned.

---

## 4. Git History Correlation

| Credential | In Git history | Current production | Match | Rotation |
|---|---|---|---|---|
| INTERNAL_API_SECRET | YES (real-like, 64 ch; `4796b7f`, `0465963`) | UNKNOWN (PROBABLE present) | UNKNOWN | **YES** (exposed) |
| reCAPTCHA secret | YES (real-like, 40 ch; same commits) | UNKNOWN (PROBABLE present) | UNKNOWN | **YES** (exposed) |
| PostgreSQL password (prod-style URL, role `postgres`) | YES (`894c7ad`, `0465963`) | UNKNOWN | UNKNOWN | **YES** (exposed) |
| PostgreSQL password (dev/compose) | YES (5 commits) | UNKNOWN (dev only per files) | UNKNOWN | YES for any DB where valid |
| Trial passwords (6) | YES (`d6dfed6`) | UNKNOWN | UNKNOWN | PROBABLE (if present in prod DB) |
| Firebase service account | NO real key (placeholder in `d0b84d1`) | UNKNOWN | N/A | NO |
| BETTER_AUTH_SECRET | NO (`change-me…` placeholder, len 37) | UNKNOWN | N/A | NO from repo evidence; **verify prod ≠ placeholder** |
| CHAT_SESSION_TOKEN_SECRET | NO (`change-me…` placeholder) | UNKNOWN | N/A | NO from repo evidence; **verify prod ≠ placeholder** |

Reachability: all commits are on `origin` (GitHub, visibility UNKNOWN) plus 7 other remote branches (per F-04 report). Local `.env` (dev) matched the exposed INTERNAL_API_SECRET / reCAPTCHA / compose DB values by fingerprint (per F-04 report; not re-run here). **That proves dev reuse, not production reuse.** Because the prod template says "do not reuse any development secret", reuse in production is not assumed — it is UNKNOWN, and the exposed values must be treated as live.

---

## 5. Rotation Blast Radius

| Credential | Affected services | Affected features | Downtime | Restart | Atomic multi-service? | External action | Rollback |
|---|---|---|---|---|---|---|---|
| INTERNAL_API_SECRET | web-api, api | Public contact form, WhatsApp lead, chat-session creation | Brief partial (public intake only), seconds if recreated together | YES, **recreate** both | YES (one env file) | none | YES |
| reCAPTCHA secret | web-api (+ web if site key changes) | Contact form / lead / chat creation | none for secret-only; web rebuild = brief web restart | web-api recreate; web rebuild if site key changes | Only if key pair changes | YES — Google reCAPTCHA admin | YES (old key stays valid until deleted — UNKNOWN) |
| PostgreSQL password | api, portal(?), web-api(?), backup job(?), any other DB client | Entire platform (API, auth, management portal) | **Yes, brief full outage** during recreate | YES, recreate all consumers | **Effectively YES** — DB `ALTER ROLE` and `.env.production` must flip together | none (but `pg_hba`/other tenants on the same server: UNKNOWN) | YES (`ALTER ROLE` back + old env) |
| Trial passwords | none (data only) | trial logins | none | NO | NO | none | n/a |
| Firebase service account | — | — | — | — | — | — | — |

If the `postgres` **superuser** is the production application role (per `894c7ad`), rotating it can also break anything else on the VPS that connects as `postgres` (other apps, `scripts/backup-medcal.sh`, admin tooling): **UNKNOWN — requires runtime verification.** A dedicated least-privilege role for Medcal would be a better end state, but that is a design change outside this audit.

---

## 6. Required Manual Actions (none performed)

### Confirmed required
1. Treat `INTERNAL_API_SECRET`, reCAPTCHA secret and the committed PostgreSQL password(s) as compromised and rotate them (exposure CONFIRMED in git history).
2. Make the repo's exposure decision: private/public status of the GitHub repo and its 7 other branches (UNKNOWN); optional history rewrite is a separate, destructive decision.

### Probably required
3. Disable/reset the six trial accounts wherever they exist (esp. if ever seeded on the VPS DB).
4. Rotate production DB password for whichever role `.env.production` actually uses; check whether it is the `postgres` superuser.

### Unknown / requires verification
5. Whether VPS `.env.production` values match the exposed ones (fingerprint compare on the VPS, never print).
6. Whether `BETTER_AUTH_SECRET` / `CHAT_SESSION_TOKEN_SECRET` in production are real (not `change-me…`). If placeholder → rotating `BETTER_AUTH_SECRET` **invalidates all sessions** (signing key); `CHAT_SESSION_TOKEN_SECRET` invalidates visitor chat cookies.
7. Whether portal/web-api actually use `DATABASE_URL` (matters for restart set).
8. Whether `FIREBASE_SERVICE_ACCOUNT_JSON` is set in production, and whether that key was ever shared outside git.
9. Credential used by `scripts/backup-medcal.sh`, plus SMTP/IMAP (`IMAP_PASS`/`SMTP_PASS` appear as bare keys in the template: CONFIRMED not leaked in the template; production values UNKNOWN).

### Read-only VPS checks to run first (safe; do not print values)
- `docker ps --format '{{.Names}} {{.Status}}'`; `docker compose -p medcal ps`.
- For each var: `grep -c '^VAR=' .env.production` (presence only); length via `awk -F= '/^VAR=/{print length($2)}'`; compare **SHA-256 fingerprint** of the value against the fingerprint of the exposed git value, computed locally (e.g. first 8 hex chars on both sides).
- Redacted `DATABASE_URL` metadata only (`sed -E 's#(://[^:]+):[^@]*@#\1:[REDACTED]@#'`).
- `psql` role list from the DB (`\du`) and `pg_stat_activity` distinct `usename, application_name` to find every DB client.
- Do **not** run `env`, `printenv`, `docker inspect` or `docker compose config` unfiltered (they print secrets).

---

## 7. Recommended Rotation Order (analysis only)

Do §6's read-only verification first. Then, lowest blast radius first:

1. **Trial accounts** — disable/reset via the updated script with new `TRIAL_CREDENTIALS_JSON`, or deactivate. No restart.
2. **reCAPTCHA** — create new key pair in Google admin; update `RECAPTCHA_SECRET_KEY` (+ `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` build arg) → recreate web-api and rebuild+recreate web together → verify a contact-form submission (2xx, not 400) → delete the old key in Google.
3. **INTERNAL_API_SECRET** — generate new (`openssl rand -hex 32`) → one edit in `.env.production` → recreate **api and web-api together** → verify a public chat-session creation / contact submit via web-api succeeds and an old-secret request returns 401 → check container logs/health.
4. **PostgreSQL** (last, highest risk) — take a DB dump (`backup-medcal.sh`); identify all consumers; then `ALTER ROLE … PASSWORD …` ↔ update `.env.production` ↔ recreate api (+ every other confirmed consumer, backup job, other tenants) in one maintenance window → verify `/health`, a login and a DB read → keep the old password rollback ready until verified.
5. (If found placeholder) `BETTER_AUTH_SECRET` / `CHAT_SESSION_TOKEN_SECRET` — schedule off-hours; expect forced re-login.

Always `docker compose --env-file .env.production -f docker-compose.prod.yml up -d --force-recreate <svc>` (per the compose file's own warning); `docker restart` does **not** reload `env_file`.

---

## 8. Open Questions

1. Which SSH user/key (or console) should be used for read-only VPS verification? The key in `~/.ssh` and `afriza@168.231.119.205` were refused.
2. Is the GitHub repository private, and have any forks/clones/CI logs seen the history?
3. Which PostgreSQL role is Medcal's production role, and what else connects as it?
4. Did the trial seed ever run against the VPS database?
5. `.env.production.example` still contains a second, appended dev-style block (duplicate keys such as `DATABASE_URL`, `INTERNAL_API_SECRET`; a note that some dev placeholders remain). If anyone copied that file wholesale to the VPS, the **last** duplicate wins in `env_file` parsing — worth checking which value is effective. (Noted only; not changed.)

---

## 9. Safety Attestations

- No production change; the single SSH attempt failed at authentication.
- No source/schema/migration change; no commit; no push. Only this report file was added.
- Existing uncommitted work-order / PO / schema changes (34 entries in `git status --short` at start) were not touched.
