# Lead / Contact Message — Remediation F-03 + F-04

| | |
|---|---|
| **Date** | 2026-10-02 |
| **Audit reference** | `docs/audits/lead-contact-message-flow-audit.md` (HEAD `b8b7cff`) |
| **Scope** | F-03 (public intake unhandled-async failures) and F-04 (credential exposure in tracked files) only |
| **Secrets** | **No credential values appear in this report.** Only variable names, categories, lengths and commit hashes are cited |

---

## 1. F-03 Status — public intake crash / unhandled async failure

### Root cause (CONFIRMED against source)
1. `ContactMessagesService.create` and `ChatSessionsService.createSession` start `notifyNewContactMessage(...)` fire-and-forget (`void …`) **after** the message is committed. That method awaited a Prisma lookup and `NotificationDispatchService.sendToCompanyRecipients` with no try/catch, and no caller attached `.catch`. Any rejection (DB error during the lookup, recipient/token lookup failure) was an **unhandled promise rejection**; no `unhandledRejection` handler exists in `apps/api`, so on Node ≥ 15 the default behavior is to terminate the process.
2. `verifyRecaptcha` (`apps/web-api/src/recaptcha.ts`) called `fetch` to Google with no try/catch, no timeout, and was `await`ed inside four async Express 4 handlers (`/public/contact-messages`, `/public/web-chat`, `/public/whatsapp-lead`, `/public/chat-sessions`). Express 4 does not catch async rejections: a Google network failure left the request hanging and produced an unhandled rejection in the public web-api process.

### Exact failure mode before
- Notification failure after a successful write → unhandled rejection in `apps/api` (process-crash risk; data already committed, but the API process could terminate).
- Google/network failure during reCAPTCHA → hanging request + unhandled rejection in `apps/web-api` (process-crash risk on the public intake edge).

### Behavior after
- `ContactMessagesService.notifyNewContactMessage` now **never rejects**: failures are caught and logged via the Nest `Logger` (`logger.error`, with messageId, stack). Because both fire-and-forget call sites (`contact-messages.service.ts` `create()` and `chat-sessions.service.ts` `createSession()`) call this single method, both are covered without touching call sites. Recipient selection, permission semantics, payload and schema are unchanged. Success responses and persistence are unaffected by notification outcome.
- `verifyRecaptcha` now distinguishes:
  - **verification rejected** (token invalid / wrong action / low score / missing secret / non-OK HTTP from Google) → returns `false` (unchanged) → **HTTP 400** `CAPTCHA verification failed` (unchanged);
  - **verification request failed** (network error, 5 s timeout via `AbortSignal.timeout`, unreadable body) → throws `RecaptchaUnavailableError` → new `checkCaptcha()` gate returns **HTTP 503** `CAPTCHA verification unavailable, please try again shortly`, logged server-side.
  It **never** treats a failure as a pass (fail-closed preserved).
- The four public handlers use the new `checkCaptcha()` (`apps/web-api/src/captcha-gate.ts`), which cannot throw for reCAPTCHA transport failures, so no handler can produce an unhandled rejection from this step. Upstream-API forwarding already had try/catch (502) and is unchanged.

### Files changed (F-03)
- `apps/api/src/modules/contact-messages/contact-messages.service.ts` — `Logger`; `notifyNewContactMessage` wraps `dispatchNewContactMessageNotification` in try/catch.
- `apps/web-api/src/recaptcha.ts` — `RecaptchaUnavailableError`, try/catch + timeout around the Google request.
- `apps/web-api/src/captcha-gate.ts` (new) — `checkCaptcha()` mapping rejected → 400, unavailable → 503.
- `apps/web-api/src/index.ts` — four handlers call `checkCaptcha`.

### Tests added / updated
- `apps/api/.../contact-messages.notification-failure.test.ts` (new, real Postgres like sibling tests): **Case A** notification success → persisted + dispatch invoked, nothing logged; **Case B** dispatch rejects → message still persisted, success result, error logged once, no `unhandledRejection`; **Case B′** DB error during the notification lookup → contained, message persisted.
- `apps/api/.../contact-messages.push.test.ts` (updated): new test "never rejects when dispatch fails". Also fixed a **pre-existing test-isolation bug** (reproduced on unmodified HEAD): the module-level prisma mock's call recorded by the first test leaked into the "no-ops when dispatch service is not injected" assertion; added `mockReset()` in `beforeEach`. No assertion was weakened.
- `apps/web-api/src/captcha-gate.test.ts` (new): pass; **Case C** rejected → 400, no unhandled rejection; **Case D** network failure / unreadable body / timeout → controlled 503, never `ok`, no unhandled rejection; missing secret still fails closed as 400.
- `apps/web-api/src/recaptcha.test.ts` (updated): network failure throws `RecaptchaUnavailableError` (existing cases unchanged).

**Test-seam note (Cases C/D):** `apps/web-api/src/index.ts` calls `app.listen()` on import and no HTTP test client is installed, so the four route handlers are not exercised end-to-end. Cases C and D are proven at the `checkCaptcha` seam; the handlers' use of it is a uniform four-line pattern (reviewable in the diff). "No persistence on rejection" holds structurally (handler returns before the upstream `fetch`).

### Validation results
See §5 (populated with actual Vitest output summaries).

### Not changed / residual (F-03)
- `publishContactMessageCreated(...)` (synchronous in-process emit after commit) is not wrapped; a throwing listener would still surface in the request. Not part of notification dispatch; left untouched (Socket.IO is out of scope).
- `LeadsService.assignToUser` awaits dispatch inline (not public intake) — unchanged.
- No process-level `unhandledRejection` handler was added (would be a behavior policy change beyond scope).
- Non-OK HTTP from Google (e.g., 5xx) is still reported as "rejected" (400) to preserve the existing, tested semantics; only transport-level failures map to 503.

---

## 2. F-04 Status — credential exposure

### Affected file categories (CONFIRMED)
| Category | Files | Credential type (names only) |
|---|---|---|
| Tracked env examples | `.env.example`, `.env.production.example` | `DATABASE_URL` / `TEST_DATABASE_URL` embedded DB passwords (several distinct, incl. a production-style `host.docker.internal` URL), `INTERNAL_API_SECRET`, `RECAPTCHA_SECRET_KEY` |
| Dev compose | `docker-compose.yml` | literal `POSTGRES_PASSWORD` |
| Docs | two tracked `docs/claude/…` reports (requisition phase-1 report; signUpEmail verification report) | the same literal DB password (quoted in examples/commands) |
| Scripts | `apps/api/scripts/trial-minto-hardjo/set-trial-credentials.ts` | hard-coded trial-account login passwords (6 trial users) |

Verified **against the local, git-ignored `.env`**: the `INTERNAL_API_SECRET`, `RECAPTCHA_SECRET_KEY` and the compose DB password that were committed are the **same values the developer environment actually uses** (fingerprint comparison only; nothing printed). They must therefore be treated as live, not sample values. Whether any of them is also used on the production VPS is **UNKNOWN**; assume yes.

### Remediation applied to the working tree
- `.env.example` / `.env.production.example`: all `DATABASE_URL`, `TEST_DATABASE_URL`, `INTERNAL_API_SECRET`, `RECAPTCHA_SECRET_KEY` and `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` values replaced with safe placeholders (`postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public`, `<generate-a-new-secret>`, `<obtain-from-google-recaptcha-admin>`). Pre-existing dev placeholders (`change-me…`, `<generate-…>`) were left as-is. Files remain useful as variable catalogs.
- `docker-compose.yml`: `POSTGRES_PASSWORD` now `${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}` (developers must define it in their git-ignored `.env`; compose fails fast with a message otherwise).
- Two docs: the literal password replaced with `<REDACTED>`.
- `set-trial-credentials.ts`: passwords removed from source; now read from the `TRIAL_CREDENTIALS_JSON` environment variable (JSON object of `userId → password`); script fails with a clear error if unset.

### Tracking status (CONFIRMED)
- `git ls-files` tracks only `.env.example` and `.env.production.example`. `.env`, `.env.production`, `.env.local` are ignored (`.gitignore:20,29,21`); `.env.production` is not tracked and was never tracked (no other `.env*` path appears anywhere in `git log --all`). No deployment step reads credentials from the examples (`docker-compose.prod.yml` uses `env_file: .env.production`).

### Git history exposure (CONFIRMED)
- The `INTERNAL_API_SECRET` and `RECAPTCHA_SECRET_KEY` values were first committed in **`4796b7f` (2026-08-16)** and again in **`0465963` (2026-08-20)**.
- The production-style DB password (first `DATABASE_URL` in `.env.production.example`) was committed in **`894c7ad` (2026-09-05)**; the password in the second (dev-block) `DATABASE_URL` in **`0465963` (2026-08-20)**. (The `TEST_DATABASE_URL` values used placeholder-style passwords.)
- The compose/doc DB password appears in **`3af90d6` (2026-08-14), `d624f15` (2026-08-24), `0465963`, `19c54e7` (2026-08-30), `894c7ad`**.
- The trial passwords were committed in `d6dfed6` (script history; exact date in git log).
- All of these commits are reachable from `origin` (`main` is in sync with `origin/main`, plus 7 other remote branches). Remote: `github.com` (repository visibility **UNKNOWN**).
- **History was NOT rewritten** (out of scope and destructive). Editing HEAD does not un-expose these values.

### Current tree status
- Working tree no longer contains the 5 identified production/dev secret values anywhere (fingerprint re-scan of the whole tree: no matches). Generic scan for private keys / cloud tokens (`BEGIN … PRIVATE KEY`, `AIza…`, `ghp_`, `sk-`, `AKIA…`, `xox…`) found **one hit**: `docs/cursor/plan/FCM/fcm_phase1_implementation_report.md:377`, a `FIREBASE_SERVICE_ACCOUNT_JSON=…` line. This is FCM material (out of scope); an attempt to inspect it further was blocked by the environment, so it is **UNVERIFIED whether it is a real service-account key or an example**. **Action for owner: inspect that line; if it is a real key, revoke/rotate it in Firebase and redact the doc.** It was not modified.

### Rotation / revocation required — YES (manual actions; not performed)
Treat as **exposed** and rotate/revoke:
1. `INTERNAL_API_SECRET` (web-api ↔ api shared secret) — generate new, update both services' production env.
2. Google reCAPTCHA **secret key** — regenerate in the reCAPTCHA admin console (the site key is public by design, but its pair should be rotated together).
3. All PostgreSQL passwords that were committed (the dev `medcal`/compose user, the `postgres` and `pkmdb` roles referenced by the production example) — change on every database where they were or may be valid, especially the production VPS DB, and update `.env.production`.
4. Trial-account passwords (6 `trial-mh-*` users) — reset via the updated script with new values supplied through `TRIAL_CREDENTIALS_JSON`, or disable the accounts if the trial is over.
5. `BETTER_AUTH_SECRET` / `CHAT_SESSION_TOKEN_SECRET`: tracked values are placeholders (`change-me…`); **no rotation required from the repository evidence**, but verify the production values are not the placeholders (UNKNOWN).
6. Optional hardening: consider history rewrite (`git filter-repo`) + force-push coordination, and enabling GitHub secret scanning. Not done here.

---

## 3. Regression Check

- Public Contact Message / chat flow: **intact by construction and by tests** — `create()` persistence and Lead matching unchanged; response shape unchanged; the notification path is behaviorally identical on success (existing push-format tests pass). reCAPTCHA success path and 400 rejection semantics unchanged; only transport failure changed (hang/crash → 503).
- Not exercised end-to-end against a running web-api/API/Google (no runtime evidence): **UNKNOWN** in production.
- `docker-compose.yml` change affects local developers only: they must set `POSTGRES_PASSWORD` in `.env` (the committed value is gone). A pre-existing postgres volume keeps its old password; changing it requires `ALTER ROLE` or recreating the volume.

## 4. Remaining Work

> Email has been decided as a Lead Source, but F-01/F-02 implementation is intentionally deferred to the next task.

Next task (high level, **not implemented here**): `IMAP → Email normalization → Lead matching/creation → Contact Message/Lead association → notification → realtime/UI`. Also deferred: IMAP cursor + scheduler (F-02), idempotency, duplicate-Lead prevention, Socket.IO reconnect catch-up, RBAC alignment, `/leads` routing investigation, and all MEDIUM/LOW audit items.

## 5. Validation (actual results)

| Check | Result |
|---|---|
| `@medcal/web-api` Vitest (`vitest run src`; the package's bare `vitest run` also picks up stale compiled `dist/*.test.js` files, which fail with "Vitest cannot be imported in a CommonJS module" — **pre-existing**, unrelated) | **4/4 files passed, 28/28 tests passed** |
| `@medcal/api` Vitest, `src/modules/contact-messages` | **5/5 files passed, 58/58 tests passed** (incl. new notification-failure tests and fixed push test) |
| `@medcal/api` Vitest, **full suite** | **73 files passed / 4 failed; 1616 tests passed / 9 failed / 0 skipped** — see below |
| `tsc --noEmit` `@medcal/api` / `@medcal/web-api` | both exit 0 |
| Lint | package `lint` scripts are `echo "… skipped"` (no linter run) |
| Build | not run (no build-affecting config change; typecheck passed) |
| `git diff --check` (touched files) | clean |
| `git ls-files \| grep .env` | only `.env.example`, `.env.production.example` |

**Full-suite failures (9 tests, 4 files) — none in files touched by this work; reproduced deterministically when rerun in isolation:**
- `emails/imap-sync.service.test.ts` (5) — `HttpException: IMAP is not configured` (local environment/IMAP config; this task did not touch the emails module or IMAP env).
- `push-tokens/notification-dispatch.service.test.ts` (2) — `push.resolvePushIconUrl is not a function`: that test's `vi.mock("@medcal/notifications")` factory lacks `resolvePushIconUrl`, which the service calls. Service and test untouched here.
- `chat/chat.gateway.security.test.ts` (1) — 5 s timeout on the room-isolation test.
- `whitelist/registration-origin-callers.test.ts` (1) — `apps/tech-pwa/src/app/sign-in/register/page.tsx:31` has no Origin signal.
These were **not** verified against a clean HEAD checkout (the working tree holds other uncommitted work), so "pre-existing" is an inference from the failure causes, not a proven fact. Per project rules the task is therefore **not** claimed as "full suite green".

Runtime safety (no unhandled rejection / process stays alive) is demonstrated by tests that register a `process.on("unhandledRejection")` listener and assert it never fires; it was not exercised against a running deployment (**UNKNOWN** in production).
