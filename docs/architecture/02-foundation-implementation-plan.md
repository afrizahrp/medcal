# Foundation Implementation Plan — medcal

**Status:** F1, F2, F3, and F4 implemented and verified. F5 (apps/api containerization + real-VPS deployment topology) implemented and verified for the apps/api slice; remaining F5 sub-items (other apps' containers, Nginx applied on the live VPS) intentionally not yet done — see §3 F5. F6 (application/UI foundation) implemented and verified — see §3 F6.
**Source of truth:** [BIPMED → MedCal Architecture Adoption Matrix](./01-bipmed-medcal-architecture-adoption-matrix.md) (FINAL, LOCKED) — Foundation roadmap line: "monorepo/package layout (done), Better Auth in `apps/api`, `EmailWhitelist` + registration gate, RBAC (role/permission/resource/action), `companyId` central enforcement, mobile-first UI guidelines, Docker Compose deployment (done), domain topology + cookie/CORS/`trustedOrigins` configuration, `packages/auth` dependency boundary."
**Repo audited:** `d:\medcal` as of 2026-08-13 (Fase 0 scaffold); F1/F2 implementation and verification completed 2026-08-13; F3 implementation and verification completed 2026-08-14; F4 implementation and verification completed 2026-08-14; first-SUPERADMIN bootstrap mechanism (F4 follow-up) added and verified 2026-08-14; F5 repo-only audit 2026-08-14; F5 real-VPS audit received and apps/api containerization implemented + verified 2026-08-14.

This document does not reopen, redesign, or add any architecture decision. Every gap below is closed by *implementing* the already-locked shape, not by re-deciding it.

---

## 0. Current Foundation Status

- **F1 (FCMToken schema correction) — COMPLETE**
- **F2 (Better Auth in `apps/api`) — COMPLETE**, verified end-to-end against real PostgreSQL
- **F3 (RBAC + `companyId` enforcement) — COMPLETE**, verified end-to-end against real PostgreSQL
- **F4 (`EmailWhitelist` + registration gate) — COMPLETE**, verified end-to-end against real PostgreSQL
- **F5 (domain topology / env wiring) — IN PROGRESS**: `apps/api` containerization + production env contract + Compose networking design + proposed Nginx integration DONE and verified against real Postgres via Docker; applying Nginx config on the live VPS and containerizing `web`/`web-api`/`portal`/`tech-pwa` remain not started (see §3 F5)
- **F6 (application/UI foundation) — COMPLETE**, verified end-to-end (sign-in/session/host-routing) against real PostgreSQL and a real browser (see §3 F6)

---

## 1. Repo audit vs. Foundation checklist

| Foundation item (locked) | Target (from matrix) | Actual repo state | Status |
|---|---|---|---|
| Monorepo/package layout | Turborepo/pnpm, `apps/{web,web-api,portal,tech-pwa,api}` + `packages/{shared,db,auth,notifications,config,ui}` | Present exactly as specified | Done |
| Docker Compose (local) | Postgres service for local dev | `docker-compose.yml` has `postgres` only | Done (local-dev scope only — see §3.4) |
| Better Auth in `apps/api` | Better Auth server hosted in-process, session-per-sign-in | `packages/auth/src/index.ts` configures `betterAuth()` with the Prisma adapter (`packages/db`); `apps/api` wires `@thallesp/nestjs-better-auth`'s `AuthModule` as a global module, with `AuthGuard` applied globally and `@AllowAnonymous()` used to opt routes out | **Done — F2 COMPLETE, verified** |
| Session validation bridge | `auth.api.getSession()` in-process via `@thallesp/nestjs-better-auth` | Present; verified via `GET /api/auth/get-session` returning the live session while valid and `null` after sign-out | **Done — F2 COMPLETE, verified** |
| `EmailWhitelist` registration gate | Prisma model + sign-up hook + `whitelist:manage` permission → `superadmin` | `EmailWhitelist` model + `EmailWhitelistStatus` enum live in `packages/db/prisma/schema.prisma` (migration `20260814073119_email_whitelist`); registration gated via `@DatabaseHook()`/`@BeforeCreate("user")` in `apps/api/src/modules/whitelist/registration-gate.hook.ts`; CRUD in `WhitelistModule`, restricted to `whitelist:manage` (granted to `SUPERADMIN` only) via the existing `CompanyRoleGuard`/`RequirePermission` pattern | **Done — F4 COMPLETE, verified** |
| RBAC (role/permission/resource/action) | Better Auth `admin` plugin + custom access-control statements; `companyId` filtering centralized in guards/interceptors | `UserMembership.role` is the sole operative role authority (not Better Auth's own `User.role` — no dual storage, no Prisma changes needed). `packages/auth/src/access-control.ts` defines the permission mechanism via Better Auth's `createAccessControl`/`role()` statement grammar (imported directly, not the `admin` plugin's runtime/endpoints). A minimal demonstration statement, `contactMessage:read`, proves the mechanism — not a complete product permission catalog | **Done — F3 COMPLETE, verified** |
| `companyId` central enforcement | Enforced via Nest guards/interceptors, not per-service ad hoc | Two guards, one per trust boundary: `InternalServiceGuard` (service-to-service `x-internal-secret` trust, unauthenticated — used by the existing `POST /internal/contact-messages`) and `CompanyRoleGuard` (session-based routes — resolves `companyId` only from the caller's own `UserMembership` for this deployment's bound `COMPANY_ID`, never from a client header/param). Demonstrated on `ContactMessagesModule`: the anonymous endpoint's inline checks were centralized into `InternalServiceGuard`, and a new authenticated `GET /contact-messages` endpoint exercises the full `CompanyRoleGuard` chain | **Done — F3 COMPLETE, verified** |
| Domain topology / cookie / CORS / `trustedOrigins` | Cookie scoped to `.kalibrasimedika.co.id`, `trustedOrigins` validation | `apps/api/src/main.ts` reads `TRUSTED_ORIGINS` and calls `app.enableCors({ origin, credentials: true })`; `packages/auth/src/index.ts` reads `COOKIE_DOMAIN` and sets `crossSubDomainCookies` accordingly (disabled for local dev, enabled with `.kalibrasimedika.co.id` in production). Verified locally: disallowed origins rejected, allowed dev origins accepted, cookies host-scoped (no `Domain=` attribute) with `COOKIE_DOMAIN=""`. Production cross-subdomain behavior against the real domain topology not yet verified | **Done for local dev — F2 COMPLETE, verified**; production topology verification pending (§F5) |
| `packages/auth` dependency boundary | `packages/auth` → `packages/db`, owns Better Auth tables | `package.json` dependency edges are correct (`@medcal/auth` → `@medcal/db`, `@medcal/shared`); Better Auth's `User`/`Session`/`Account`/`Verification` tables are live in `packages/db/prisma/schema.prisma`, reusing the existing domain-facing `User` model rather than a duplicate | **Done — F2 COMPLETE, verified** |
| Mobile-first UI guidelines | Applied to `apps/portal`/`apps/tech-pwa`/`apps/web` UI | `apps/portal`/`apps/tech-pwa` are default Next.js scaffolds (`layout.tsx`/`page.tsx` only) — no UI work has started yet, so nothing to conform or contradict | N/A yet — becomes relevant once UI work starts |

---

## 2. Contradiction found and resolved (F1 — COMPLETE)

**`packages/db/prisma/schema.prisma` previously carried a `PushSubscription` model using the native Web Push shape, not FCM. This has been corrected; the schema now defines `FCMToken` as shown below.**

```prisma
model FCMToken {
  id         String    @id @default(cuid())
  companyId  String
  userId     String
  token      String    @unique
  deviceType String
  app        PushApp
  isActive   Boolean   @default(true)
  lastUsedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  ...
}
```

This was the exact mismatch the Adoption Matrix already named and that `entity-catalog.md`/`docs/ERD/*` were already corrected for in a prior documentation-sync pass — the correction has now also been carried into the actual Prisma schema, which is the real source of truth for the database. `Company.fcmTokens` / `User.fcmTokens` relations reference this model.

**Locked decision:** FCM (Firebase Admin SDK + device token) is the confirmed push mechanism; native Web Push (`endpoint`/`p256dh`/`auth`) is explicitly dead/rejected.

**Fix applied (matches the lock, no new decision made):**
- Renamed `PushSubscription` → `FCMToken`.
- Replaced `endpoint` / `p256dh` / `auth` fields with `token` (`String @unique`), `deviceType` (`String`), `isActive` (`Boolean @default(true)`), `lastUsedAt` (`DateTime?`) — matching `entity-catalog.md` D18 and `docs/ERD/attributes.md`.
- Renamed the two relation fields (`Company.fcmTokens`, `User.fcmTokens`) to match.
- Applied as part of the same Prisma migration that introduced the Better Auth tables (see F2 below); `PushApp` enum was unaffected and kept as-is.

This was a data-model correction, not a new decision — it applies the FCM decision that was already locked and already reflected everywhere else in the docs.

---

## 3. Foundation work items (order)

### F1. Correct the `FCMToken` schema mismatch (§2) — COMPLETE
Applied. `PushSubscription` renamed to `FCMToken` with the FCM-token field shape, applied via Prisma migration, no orphaned references. See §2.

### F2. Better Auth server in `apps/api` — COMPLETE, verified end-to-end

**Implemented:**
- `packages/auth`: `betterAuth()` configured with the Prisma adapter (`packages/db`); `requireEmailVerification: false` per the locked decision (no email verification step enforced); `crossSubDomainCookies` driven by `COOKIE_DOMAIN` (disabled for local dev, enabled with the production domain when set).
- `apps/api`: `@thallesp/nestjs-better-auth`'s `AuthModule` registered globally (`AuthModule.forRoot({ auth, isGlobal: true })`) in `AppModule`, providing a global `AuthGuard`; `@AllowAnonymous()` used on `HealthController` and `ContactMessagesController` to opt those routes out of the session requirement.
- `apps/api/src/main.ts`: CORS wired from `TRUSTED_ORIGINS` (`app.enableCors({ origin, credentials: true })`), replacing the previous bare `app.enableCors()`.
- `packages/db/prisma/schema.prisma`: Better Auth's `User` (reusing the existing domain-facing model, not a duplicate), `Session`, `Account`, `Verification` tables added; migration `20260813063336_init_better_auth_fcmtoken` created and applied (same migration also carried the F1 `FCMToken` correction). `prisma migrate status` confirms schema up to date, no drift.
- RBAC (`admin` plugin, access-control statements) intentionally **not** included — sequenced as F3.

**Verified end-to-end against real PostgreSQL** (2026-08-13):
- `GET /health` → 200; `GET /api/auth/ok` → 200.
- Sign-up (`POST /api/auth/sign-up/email`) → 200; DB inspection confirmed exactly one `User` row (existing MedCal model, no duplicate/shadow model), one `Account` row (`providerId: credential`), one `Session` row, correctly linked by `userId`.
- Sign-in (`POST /api/auth/sign-in/email`) → 200, new session token issued.
- `GET /api/auth/get-session` with a valid cookie → 200, returns session + user.
- Sign-out (`POST /api/auth/sign-out`) → 200, clears `better-auth.session_token`/`session_data`/`dont_remember` cookies (`Max-Age=0`).
- `GET /api/auth/get-session` after sign-out → `null` (session correctly invalidated).
- CORS: disallowed origin → no `Access-Control-Allow-Origin` header (rejected); allowed dev origins (`localhost:3000`/`3003`/`3004`) → header reflected back, `Allow-Credentials: true`.
- Cookie config verified at the code level for local dev (`COOKIE_DOMAIN=""` → `crossSubDomainCookies.enabled: false`, host-scoped cookies, no `Domain=` attribute observed). Production cross-subdomain behavior against the real `kalibrasimedika.co.id` topology **not yet verified** — deferred to F5.
- EmailWhitelist enforcement intentionally not exercised (not yet implemented — F4).

**ContactMessage dependency-injection fix (found and fixed during F2 verification, not a Better Auth defect):**
- Root cause: `apps/api`'s dev runtime (`tsx`, esbuild-based) does not emit TypeScript's `design:paramtypes` decorator metadata (`emitDecoratorMetadata` is a `tsc`-only feature; esbuild has never implemented it). NestJS's constructor-based dependency injection relies on that metadata to resolve a parameter's type automatically. This left `ContactMessagesController`'s `this.service` as `undefined` at runtime despite standard, correctly-registered constructor injection — confirmed by probing `Reflect.getMetadata("design:paramtypes", ContactMessagesController)`, which returned `undefined`. `AuthModule`'s own injections were unaffected because `@thallesp/nestjs-better-auth` ships pre-compiled JS built with a compiler that does emit this metadata; only classes compiled locally by `tsx` are exposed to this constraint.
- Fix: explicit `@Inject(ContactMessagesService)` token added to the affected constructor parameter in `apps/api/src/modules/contact-messages/contact-messages.controller.ts` — the standard workaround for esbuild/swc-based dev runtimes. No module redesign, no build-tooling change, no repo-wide refactor.
- Verified: successful `POST /internal/contact-messages` (valid `x-internal-secret` + `x-company-id`) → 201, row confirmed written to the `ContactMessage` table against real PostgreSQL. Failure paths re-verified unchanged: missing `x-internal-secret` → 401 "Invalid internal secret"; missing `x-company-id` → 401 "Missing company id". `typecheck` and `build` both clean for `apps/api`.
- **Implication for future modules:** any new locally-authored Nest class using constructor injection may need the same explicit `@Inject(...)` token, not just type-based injection. This is a known implementation constraint of the current dev toolchain, not an architecture decision — `tsx`/build tooling is unchanged, and no repo-wide refactor has been done.

### F3. RBAC + `companyId` enforcement — COMPLETE, verified end-to-end

**Implemented:**
- **Role authority**: `UserMembership.role` (already existed from F2's schema) is the sole operative source of a user's role — Better Auth's own `admin` plugin/`User.role`/`banned` fields were deliberately **not** added, avoiding dual role storage. No Prisma migration was required for F3.
- **Permission mechanism**: `packages/auth/src/access-control.ts` uses Better Auth's `createAccessControl`/`role()` statement grammar directly (`better-auth/plugins/access`), not the `admin` plugin's runtime/endpoints. One minimal demonstration statement is defined — `contactMessage: ["read"]` — granted to `SUPERADMIN`/`ADMIN`, withheld from `SUPERVISOR`/`TECHNICIAN`/`FINANCE`/`CUSTOMER`. This is deliberately **not** a complete product permission catalog (none is locked anywhere in the docs) — just enough to prove the mechanism.
- **Centralized `companyId` enforcement**: two guards, split by trust boundary — `apps/api/src/common/guards/internal-service.guard.ts` (service-to-service `x-internal-secret` trust, no Better Auth session — the existing anonymous `POST /internal/contact-messages` path) and `apps/api/src/common/guards/company-role.guard.ts` (session-based routes — resolves `companyId` **only** from the caller's own `UserMembership` for this deployment's bound `COMPANY_ID` env var, never trusting a client-supplied header/param, per the Adoption Matrix's Do-Not-Copy register). Internal service trust and authenticated RBAC are intentionally kept as separate mechanisms, not one guard doing both.
- **Demonstrated on `ContactMessagesModule`** (as the F3 spec required): the existing anonymous endpoint's inline `x-internal-secret`/`x-company-id` checks were extracted into the reusable `InternalServiceGuard`; a new authenticated `GET /contact-messages` endpoint (`ContactMessagesQueryController`) was added specifically to exercise the full chain — session → `UserMembership.role` → permission → resource/action → `companyId` enforcement.
- Every new constructor-injected class (`CompanyRoleGuard`, both new controllers) uses explicit `@Inject(...)` tokens — the F2 finding that `tsx`/esbuild doesn't emit `design:paramtypes` metadata remains in effect and was applied proactively here rather than rediscovered.

**Verified end-to-end against real PostgreSQL** (2026-08-14):
- `GET /contact-messages` unauthenticated → 401.
- `GET /contact-messages` authenticated with `UserMembership.role = CUSTOMER` (not granted `contactMessage:read`) → 403.
- `GET /contact-messages` authenticated with `UserMembership.role = ADMIN` for `COMPANY_ID` → 200, rows correctly scoped to that `companyId`.
- `GET /contact-messages` authenticated as `SUPERADMIN` of a *different* company (a `UserMembership` row for a company other than `COMPANY_ID`) → 403 — proves isolation is structural (no membership found for `COMPANY_ID`), not merely a role-name check.
- Regression: `POST /internal/contact-messages` re-verified unchanged after the `InternalServiceGuard` refactor — missing secret → 401, missing company id → 401, valid → 201.
- `GET /health` → 200. `typecheck` and `build` both clean for `apps/api` and `packages/auth`.
- All test fixtures (test users, sessions, the extra cross-company `Company` row, `UserMembership` rows) cleaned up after verification.

### F4. `EmailWhitelist` model + registration gate — COMPLETE, verified end-to-end

**Implemented:**
- `packages/db/prisma/schema.prisma`: `EmailWhitelist` model — `email` (`@unique`), `status` (`EmailWhitelistStatus` enum: `ACTIVE`/`REVOKED`, matching the repo's existing enum-per-model convention), `createdBy`/`createdAt`, `revokedBy`/`revokedAt` audit fields (explicit FK relations to `User`, following the `ContactMessage.confirmedByUserId`/`QualityReview.reviewerUserId` convention), no `companyId` (standalone, per the lock). Entries are reusable, not consumed — a `REVOKED` row still exists but no longer authorizes registration. Migration `20260814073119_email_whitelist` created and applied; `prisma migrate status` confirms schema up to date, no drift.
- `packages/shared`: `normalizeEmail()` added (trim + lowercase) — the single canonical normalizer used on both the whitelist-write path and the registration-gate lookup path, so the two can never drift into different casing/trim rules.
- `packages/auth/src/access-control.ts`: extended the existing F3 statement/role maps with `whitelist: ["manage"]`, granted to `SUPERADMIN` only (unlike `contactMessage:read`, which both `SUPERADMIN` and `ADMIN` hold) — no new role, no new permission table, same mechanism as F3.
- `apps/api/src/modules/whitelist/`: new `WhitelistModule` — `WhitelistService` (create/findAll/revoke), `WhitelistController` (`GET/POST /whitelist`, `POST /whitelist/:id/revoke`), guarded by the existing `CompanyRoleGuard` + `@RequirePermission("whitelist", "manage")` pattern built in F3 (used here purely for its role/permission resolution — `EmailWhitelist` itself has no `companyId` to scope by).
- **Registration gate**: `apps/api/src/modules/whitelist/registration-gate.hook.ts` — `@DatabaseHook()` class decorator + `@BeforeCreate("user")` method decorator (from `@thallesp/nestjs-better-auth`), which intercepts Better Auth's `databaseHooks.user.create.before` for *any* `User`-row creation, not just the current email/password sign-up route. Normalizes the incoming email and looks up `EmailWhitelist`; returns `false` (blocking creation) unless a matching `ACTIVE` row exists.
- **Critical wiring detail**: `packages/auth/src/index.ts` now sets `databaseHooks: {}` on the `betterAuth()` config. `@thallesp/nestjs-better-auth` only wires `@DatabaseHook()` providers if this key is present at all on the Better Auth config — omitting it makes the library silently skip hook registration (only a console warning, no error), which would make the registration gate a no-op. This isn't documented in the library's public types; found by reading its source directly.

**Verified end-to-end against real PostgreSQL** (2026-08-14):
- `GET /whitelist` unauthenticated → 401.
- `GET /whitelist` authenticated as `ADMIN` (no `whitelist:manage`) → 403.
- `GET /whitelist` authenticated as `SUPERADMIN` → 200.
- `POST /whitelist` → 201.
- Duplicate entry submitted with different casing/whitespace (normalized to the same email) → 409, a clean structured error, not a raw 500.
- `POST /whitelist/:id/revoke` → `status` becomes `REVOKED`, `revokedBy`/`revokedAt` populated.
- Sign-up with a non-whitelisted email → rejected (`FAILED_TO_CREATE_USER`); confirmed via direct DB query that **zero** `User` rows were created (the hook blocks before the transaction, not after).
- Sign-up with a since-revoked email → still rejected (the gate checks `status === "ACTIVE"`, not mere row existence).
- Sign-up with an active whitelisted email → succeeds exactly as F2's already-verified flow.
- Regression: `GET /health`, `GET /api/auth/ok`, `GET /contact-messages` (401 unauthenticated, 200 for `ADMIN` — F3's `contactMessage:read` unaffected by the new `whitelist:manage` statement), `POST /internal/contact-messages` all re-verified unchanged.
- `typecheck` and `build` clean for `apps/api`, `packages/auth`, and `packages/shared`.
- All test fixtures (bootstrap user, test accounts, sessions, whitelist entries, contact message) cleaned up after verification.

**F4 amendment — company-domain registration lock (2026-08-14, locked business rule, not UI-only):**
- New locked rule: registration additionally requires the normalized email's domain to equal `kalibrasimedika.co.id` **and** have a matching `ACTIVE` `EmailWhitelist` entry — both conditions, not either.
- `packages/shared`: added `COMPANY_EMAIL_DOMAIN` constant and `isAllowedRegistrationDomain(email)`, built on the existing `emailDomain()` helper (single-`@`-split, exact-match comparison) — deliberately not a substring/`endsWith` check, so `user@kalibrasimedika.co.id.evil.com` and `user@evilkalibrasimedika.co.id` are both structurally rejected rather than merely happening to fail a naive pattern.
- `apps/api/src/modules/whitelist/registration-gate.ts` (new): extracted the gate's logic — `isRegistrationAllowed(email)` — out of the `@DatabaseHook()` class into a plain, directly testable async function (domain check first, then the unchanged `EmailWhitelist` lookup). `registration-gate.hook.ts` now just calls it; no change to the `@DatabaseHook()`/`@BeforeCreate("user")` wiring itself.
- `EmailWhitelist` mechanism itself is unchanged: same `normalizeEmail()`, same `ACTIVE`/`REVOKED` semantics, same `whitelist:manage` permission, same `SUPERADMIN`-only grant.
- **Tests added** (no test framework existed in the repo before this; added `vitest` as a minimal devDependency in `packages/shared` and `apps/api`, plus a `test` script/turbo task, following the same `typecheck` script convention already used everywhere):
  - `packages/shared/src/utils/registration-domain.test.ts` — 6 pure unit tests for `isAllowedRegistrationDomain` (valid domain, mixed-case/whitespace, gmail rejection, subdomain-suffix trick, prefix trick, multiple-`@` malformed input). No DB needed.
  - `apps/api/src/modules/whitelist/registration-gate.integration.test.ts` — 7 tests against real PostgreSQL (same DB/env as the rest of this project's verification, no mocking): ACTIVE+company-domain → allowed; no whitelist entry → rejected; REVOKED → rejected; non-company domain with an otherwise-matching `ACTIVE` entry → rejected; subdomain-suffix trick with a matching `ACTIVE` entry → rejected; mixed-case/whitespace normalization → still matches.
  - "Zero orphan `User` rows on rejection" is verified via the existing manual DB-query approach (consistent with F1–F4's established verification style), not a vitest test — asserting that, since it's really about the live `@DatabaseHook()`/Better Auth wiring end-to-end, not the pure gate function.
- **Verified end-to-end against real PostgreSQL** (2026-08-14): valid `@kalibrasimedika.co.id` + `ACTIVE` whitelist → sign-up succeeds; `gmail.com` → rejected; `kalibrasimedika.co.id.evil.com` → rejected; company-domain with no whitelist entry → rejected; all three rejections confirmed to leave **zero** `User` rows via direct DB query. Regression: `GET /health`, `GET /api/auth/ok`, `POST /internal/contact-messages` unchanged. `pnpm --filter @medcal/shared run test` (6/6 pass) and `pnpm --filter @medcal/api run test` (7/7 pass); `typecheck`/`build` clean for `apps/api` and `packages/shared`.

**F4 amendment — first-SUPERADMIN bootstrap (2026-08-14, operational follow-up, not a new architecture decision):**
- **Problem**: the F4 registration gate (company-domain lock + `ACTIVE` `EmailWhitelist`) plus `whitelist:manage` being `SUPERADMIN`-only created a genuine circular dependency — no path existed to create the very first production account, since granting the first whitelist entry requires a `SUPERADMIN` who doesn't yet exist.
- **Investigated and rejected**: reimplementing Better Auth's password hashing (Prisma seed script, manual SQL/runbook) — both touch security-sensitive code outside Better Auth's own tested path. Also rejected: an env-var-driven auto-create-on-boot mechanism — runs automatically and silently on every boot, closest thing to a standing backdoor, explicitly avoided.
- **Schema change**: `EmailWhitelist.createdBy` changed from required to nullable (migration `20260814082752_email_whitelist_created_by_nullable`). `NULL` is reserved exclusively for the one-time bootstrap-created entry and means "created by the bootstrap process, not by a user" — chosen over inventing a fake "system" `User` row, which would have fabricated a non-existent identity in a table the domain model treats as real, login-capable people. Every entry created through the normal `whitelist:manage` flow (`WhitelistService.create`, still typed with a required `createdBy: string` parameter) continues to require and persist a real user id — this schema loosening only affects the bootstrap's own direct-Prisma insert, not the API path.
- **Mechanism**: `apps/api/src/bootstrap-superadmin.ts`, run manually via `pnpm --filter @medcal/api run bootstrap:superadmin -- --email=... --password=... --name=...`. Never wired into `main.ts`/automatic startup — a separate, explicitly-invoked entry point. Key finding from investigation: in this repo, `databaseHooks.user.create.before` is only *wired* when `@thallesp/nestjs-better-auth`'s `AuthModule.onModuleInit()` runs (it mutates the `databaseHooks: {}` object `packages/auth/src/index.ts` passes to `betterAuth()`) — a bare script calling `auth.api.signUpEmail()` without booting Nest would skip the gate entirely, not enforce it. The bootstrap script instead uses `NestFactory.createApplicationContext(AppModule, { logger: false })` (no `.listen()`, no HTTP port) so the real hook is live, meaning the bootstrap's own account creation is validated by the exact same, unmodified F4 gate as every other user — not a bypass, not a re-implementation.
- **Sequence**: refuse to proceed if any `UserMembership` with role `SUPERADMIN` already exists for `COMPANY_ID` → upsert the target email's `EmailWhitelist` entry (`ACTIVE`, `createdBy: null`) → call `auth.api.signUpEmail()` (creates `User`/`Account`/`Session` through Better Auth's own code, real password hash) → create the `UserMembership` (`role: SUPERADMIN`) directly via Prisma (no membership-management endpoint exists yet). Resumable: if a prior run got partway through (e.g. `User` created but the membership grant failed), re-running detects what already exists via `prisma.user.findUnique`/`prisma.userMembership.findUnique` and only performs the remaining step(s), rather than erroring or duplicating anything.
- No credential is hardcoded anywhere — email/password/name are supplied as CLI arguments at invocation time only, never persisted to `.env` or committed config.
- **Verified against the real dev database** (2026-08-14): fresh bootstrap created `User`/`Account`(`providerId: credential`)/`Session` rows and the `SUPERADMIN` `UserMembership`, with the `EmailWhitelist` entry's `createdBy` correctly `null`; signing in with the bootstrapped credentials succeeded via the real `/api/auth/sign-in/email` endpoint (proving the password hash is genuinely valid, not just an inserted row) and the resulting session had working `whitelist:manage` access (`GET /whitelist` → 200). Re-running the command against the now-populated database refused with a clear message and exit code 1, with zero side effects (confirmed via DB query — no rows created for the second attempted email). Normal registration re-verified unchanged: non-company domain and company-domain-without-whitelist both still rejected with zero orphaned `User` rows. Regression (`/health`, `/api/auth/ok`, `/internal/contact-messages`) unchanged. `typecheck`/`build` clean; `pnpm --filter @medcal/shared run test` (6/6) and `pnpm --filter @medcal/api run test` (7/7) both pass. All bootstrap test fixtures cleaned up after verification; the `bootstrap-superadmin.ts` script itself remains in the repo as the ongoing mechanism for future environments/deployments.
- **Incidental fix**: discovered and fixed a pre-existing gap where `apps/api`'s `build` compiled `*.test.ts` files into `dist/`, causing `vitest` to pick up both the source and compiled-CommonJS copies and fail. Fixed via `apps/api/tsconfig.json`'s `exclude` and `vitest.config.mts`'s `test.include`, both scoped to `src/**/*.test.ts`.

### F5. Domain topology / env wiring — IN PROGRESS (VPS-verified infrastructure)

**F5.0 — repo-only audit (2026-08-14), superseded by real VPS facts below.** The repo-only pass found: no Dockerfiles anywhere, `docker-compose.yml`'s local Postgres service unused by actual dev (native Windows service is), no reverse-proxy config in-repo, and flagged three genuine decisions (Compose-Postgres fate, containerization sequencing, reverse-proxy ownership) as unresolvable from the repo alone. All three are now resolved by the real VPS audit below — see "Decisions resolved" further down.

**Real VPS audit (2026-08-14):** Ubuntu 24.04.4 LTS, KVM, 15 GB RAM (~9.8 GB available), 193 GB disk (~14% used). Docker already installed/running, currently hosting exactly one container (`mssql2019`, `mcr.microsoft.com/mssql/server:2019-latest`, published `0.0.0.0:1433`). PostgreSQL installed natively (not containerized). Nginx is the live reverse proxy on :80/:443 with Let's Encrypt/Certbot already in use. PM2 already supervises 7 existing applications (`bip-frontend`, `bis-frontend`, `bumiindah--backend-7000`, `dashboard-backend`, `dashboard-frontend`, `staging-app`, `sync-app`) routed by Nginx: `bipmed.co.id`/`www.bipmed.co.id`→`:3000`, `bumiindah.co.id`/`www.bumiindah.co.id`→`:3100`, `apps.bumiindah.co.id`→`:5000`, `restweb.bumiindah.co.id`→`:7000`, `rest.bumiindah.co.id`→`:8000`. UFW is active; `80`/`443` allowed, `3000`/`3100`/`5000`/`7000` denied externally. **Observed, not touched:** `5432/tcp` and `8000/tcp` are both explicitly UFW-allowed from Anywhere — pre-existing VPS security posture, recorded here as a finding, not modified by F5.

**Decisions resolved by the VPS audit (no longer open):**
- *Reverse-proxy ownership* — Nginx already exists, is active, and is shared with `bipmed`/`bumiindah`. MedCal integrates into it; no second reverse proxy (Traefik/Caddy) is introduced.
- *Postgres duplication* — native PostgreSQL is existing **production** VPS infrastructure too, not just a local-dev artifact. MedCal's production Compose stack therefore does **not** run its own Postgres container (would collide with the native instance on port 5432 and duplicate "pkmdb"-shaped data) — it connects to the native instance from the container via the Docker bridge gateway. `docker-compose.yml` (local dev, Windows) is unchanged and unrelated to this.
- *Containerization sequencing* — `apps/api` only, for now. `web`/`web-api`/`portal`/`tech-pwa` are containerized later, when their own implementation reaches that stage — not for symmetry.

**F5.2 — `apps/api/Dockerfile` (production image):** Multi-stage build using `turbo prune @medcal/api --docker` to shrink the monorepo to just what `apps/api` needs, then `pnpm install --frozen-lockfile` and `pnpm --filter=@medcal/db run generate` (run inside the Linux/Alpine build stage so Prisma's default `binaryTargets: ["native"]` produces the correct Linux engine, not the Windows one already present in the dev machine's `node_modules` — no `schema.prisma` change needed). Runs as a non-root user, `EXPOSE 3001`.
  - **Runtime-model finding, addressed rather than hidden:** none of the workspace packages (`@medcal/db`, `@medcal/auth`, `@medcal/shared`, `@medcal/config`, `@medcal/notifications`) have ever had a `build` script — each `package.json`'s `"main"` points straight at `./src/index.ts`. Verified directly: running `node dist/main.js` (the `apps/api` `start` script's target) throws `ERR_MODULE_NOT_FOUND` resolving `packages/auth/src/access-control` — plain Node cannot resolve extensionless workspace-package imports the way `tsc`/`tsx` do. This is a pre-existing gap in the build pipeline (`turbo.json` already declares a `^build`-dependent `build` task with `dist/**` outputs, implying per-package builds were intended but never added), not something introduced by F5. Rather than wiring `tsc` builds into five packages just to containerize one app, the production image runs the app the same way local dev already does — via `tsx` (`CMD ["node_modules/.bin/tsx", "src/main.ts"]`) — which is already proven correct across F1–F4's verification history. Documented here as a deliberate, smallest-footprint choice: the image is slightly larger than a fully-compiled one (ships `tsx`/`typescript` as runtime deps), and completing the five-package `tsc` build pipeline remains a legitimate **Later** hardening item, not a blocker.

**F5.3 — production environment contract:** `.env.production.example` (root) — template only, no real values, mirrors `.env.example`'s shape but with production-only entries: `DATABASE_URL` targets `host.docker.internal` (not `localhost`, which inside a container means the container itself), `API_URL`/`BETTER_AUTH_URL` set to `https://api.kalibrasimedika.co.id`, `TRUSTED_ORIGINS` set to the four real production subdomains, `COOKIE_DOMAIN=".kalibrasimedika.co.id"`. Explicitly documents a **manual prerequisite this file does not perform**: native PostgreSQL's `listen_addresses`/`pg_hba.conf` must permit connections from the Docker bridge network — a change to existing native Postgres config, which F5 deliberately does not make automatically (constraint: don't modify existing Postgres config unless explicitly requested). `BETTER_AUTH_SECRET`/`INTERNAL_API_SECRET` are placeholders instructing the operator to generate fresh production values — never a reused dev secret, never committed.

**F5.4 — Docker networking:** `docker-compose.prod.yml` (root, new file, separate from local-dev `docker-compose.yml`) — explicit Compose project `name: medcal` and `container_name: medcal-api` (no collision with the existing `mssql2019` container or any future one), its own `medcal_net` bridge network (not the default bridge), `extra_hosts: host.docker.internal:host-gateway` (Linux Docker has no automatic `host.docker.internal` the way Docker Desktop does — this makes the native-Postgres reachability from F5.3 actually work), and `ports: "127.0.0.1:3001:3001"` — bound to loopback only, never `0.0.0.0`, so the container is reachable from Nginx on the same host but not directly from the Internet. No Postgres service in this file (see "Decisions resolved" above). `web-api`/`web`/`portal`/`tech-pwa` intentionally absent — added when containerized in a later pass.

**F5.5 — Nginx integration plan (not applied):** `infra/nginx/api.kalibrasimedika.co.id.conf.example` — a complete, ready-to-review server block (HTTP→HTTPS redirect + Certbot ACME-challenge location + HTTPS block with WS-upgrade headers, since `api.*` serves both REST and the Chat WebSocket gateway from one origin per the locked topology) proxying to `127.0.0.1:3001`. Explicitly a plan, not a deployed change — the file documents its own manual install sequence (start the container first, copy into `sites-available`, symlink to `sites-enabled`, run the existing `certbot --nginx` flow, `nginx -t`, then `reload` not `restart`) and explicitly lists the five existing routes it must not disturb. Nothing in this repo edits, reloads, or restarts the live Nginx instance.

**F5.6 — Verification (2026-08-14, against the real dev database, `pkmdb`):**
- `docker build -f apps/api/Dockerfile -t medcal-api .` — succeeded (`turbo prune` → `pnpm install --frozen-lockfile` → `pnpm --filter=@medcal/db run generate` → non-root runtime image).
- Container started with `DATABASE_URL` pointed at `host.docker.internal` (via `--add-host host.docker.internal:host-gateway`, the same mechanism `docker-compose.prod.yml` configures) against the real native `pkmdb` database — Nest boot log confirms `AuthModule`, `ContactMessagesModule`, `WhitelistModule` all initialized and every route mapped, no connection errors.
- `GET /health` → 200. `GET /api/auth/ok` → 200.
- `GET /contact-messages` unauthenticated → 401. `GET /whitelist` unauthenticated → 401. `POST /internal/contact-messages` without `x-internal-secret` → 401 — F3/F4 guard behavior unchanged inside the container.
- Sign-up with a non-whitelisted `gmail.com` address → 400 `FAILED_TO_CREATE_USER` — F4's domain+whitelist gate active inside the container, not bypassed.
- Sign-up with a freshly-whitelisted `@kalibrasimedika.co.id` address → 200, real `User`/`Account`/`Session` rows created via `auth.api.signUpEmail()` exactly as in every prior F1–F4 verification round; confirmed via the container's own Prisma client, then cleaned up (test `User`/`Account`/`Session`/`EmailWhitelist` rows deleted, zero left behind).
- Regression: `pnpm --filter @medcal/api run typecheck` clean; `pnpm --filter @medcal/api run test` (7/7) and `pnpm --filter @medcal/shared run test` (6/6) both pass, unchanged from F4.
- Test container/network (`medcal-api-test`, `medcal_net_test`) torn down after verification — nothing left running. `docker-compose.prod.yml` was not brought up (needs the real `.env.production` and the real VPS's native-Postgres reachability prerequisite from F5.3, neither of which exist on this dev machine) — the equivalent `docker run` invocation above exercises the same image, network-bridging approach (`host.docker.internal`/`host-gateway`), and port-publish pattern (`127.0.0.1:<port>`) that the Compose file uses, so this is a full functional verification of the image itself, not merely a syntax check.
- **Not verified (genuinely cannot be, from this dev machine):** the actual VPS's Nginx integration, Let's Encrypt cert issuance, UFW behavior, and native-Postgres-from-Docker-bridge reachability on the real VPS — those require the real VPS and are out of this repo's/session's reach; `infra/nginx/api.kalibrasimedika.co.id.conf.example` and the `.env.production.example` prerequisite note exist specifically so the operator can execute and confirm those steps on the VPS itself.

**Explicitly out of scope for this pass (per VPS-audit instructions):** no Kubernetes, no second reverse proxy, no PM2 migration, no PostgreSQL migration, no firewall changes, no existing Nginx route changes, no containerizing `web`/`web-api`/`portal`/`tech-pwa` yet, no PWA manifest/service worker, no host-based routing code, no F6.

`packages/config`'s `COMPANY_ID`/cookie-domain/`trustedOrigins`/per-app-base-URL schema (already implemented in F2/F3, see §1 table) is consumed as-is by the production env contract above — no change to `packages/config` itself was needed for F5.

### F6. Application/UI foundation — COMPLETE, verified 2026-08-14

**Objective:** structural readiness for MVP feature work on `apps/web` (audit only), `apps/portal` (host-routed management/customer surfaces), and `apps/tech-pwa` — sign-in, session, role-aware nav, host-based routing, API client boundary. No business modules; no new RBAC/auth system; no `packages/ui` extraction without evidence.

**Audit findings:** `apps/web` was already complete (contact-form → `web-api` integration correct, no changes needed). `apps/portal`/`apps/tech-pwa` were Fase-0 stubs with no `@medcal/auth` dependency, no middleware, no API client. `packages/auth/src/index.ts` exported only the server `betterAuth()` config — no client subpath existed. No endpoint exposed `UserMembership.role` to a caller about themselves (`CompanyRoleGuard` looks it up per-request but never returns it). `apps/tech-pwa/public/manifest.webmanifest` had empty `icons: []`; no service worker existed anywhere.

**Decisions implemented (all additive, none reopen F1–F5):**
- **`GET /me`** (`apps/api/src/modules/me/`) — new, small, session-only endpoint (global `AuthGuard`, no `@RequirePermission`) reusing `CompanyRoleGuard`'s exact `getSession()` → `UserMembership` lookup pattern. Returns `{ user, membership: { role, companyId } }`. No new DB model, no change to `packages/auth`/`access-control.ts`/cookies/CORS.
- **`packages/auth/src/client.ts`** — new Better Auth React client subpath (`createAuthClient` from `better-auth/react`), exposed via a `package.json` `exports` map (`"."` unchanged/server-only, `"./client"` browser-safe) so client components never bundle `@medcal/db`/Prisma. Server config (`src/index.ts`) untouched.
- **`packages/shared/src/http/api-fetch.ts`** — shared `apiFetch`/`ApiError`/`isUnauthorized`/`isForbidden` helper (genuinely shared: both portal and tech-pwa need identical `NEXT_PUBLIC_API_URL` + `credentials:"include"` + 401/403 handling). Unit-tested.
- **`apps/portal/src/proxy.ts`** (Next.js 16 renamed `middleware.ts` → `proxy.ts` on the framework's own deprecation notice) — reads the `Host` header, rewrites `apps.*` → `/management`, `portal.*` → `/client`, with a `DEV_DEFAULT_HOST_GROUP` fallback for plain `localhost:3003`. Implements the Adoption Matrix's locked "Option A" (one codebase, two hostnames) using real path segments (`app/management/`, `app/client/`) as rewrite targets — parenthesized route groups are invisible to the URL and cannot be rewrite targets.
- **Client-side session gating**, not SSR cookie-forwarding: `useRequireSession()` (`lib/use-require-session.ts` in both portal and tech-pwa) uses `useSession()` + a client-side `apiFetch("/me")` call. This was a genuine correction made during verification — see "Finding" below.
- **RBAC stays UX-only**: per-app `nav-config.ts` filters nav items by role, explicitly commented as non-authoritative. No frontend permission catalog. All real enforcement remains `CompanyRoleGuard` in `apps/api`.
- **`apps/tech-pwa`**: sign-in/session/sign-out skeleton (same pattern as portal, no host routing needed), `viewport`/`theme-color` metadata added for installability. Real icon assets (192×192/512×512 PNG) remain a design-asset dependency — not fabricated. Service worker explicitly deferred (no offline requirement exists).
- **`packages/ui`** — left deferred (unchanged 4-line `cx()` stub). No components exist in portal/tech-pwa yet to justify extraction.
- **Pre-existing gap fixed (Foundation-blocking, not F6-scope-creep):** Next.js only auto-loads `.env` from its own app directory, not the monorepo root, so `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WEB_API_URL` were never actually reaching any Next.js app in dev (`apps/web` included). Fixed by loading the root `.env` explicitly at the top of each app's `next.config.js` via `dotenv` (no-op in production, which sets real env vars directly).
- **Pre-existing gap fixed:** `packages/config` was missing `@types/node`, breaking `pnpm turbo run typecheck` repo-wide (same one-line gap already present/fixed in `packages/shared`).

**Finding during verification — dev cross-subdomain cookies do not work, by design:** dev's `COOKIE_DOMAIN=""` (host-scoped cookies) means a browser navigating to `apps.localhost:3003` never receives the session cookie issued by `apps/api`'s own origin — only production's `crossSubDomainCookies`/`.kalibrasimedika.co.id` sharing makes that work (already flagged as unverified-until-real-deployment in §5). An initial SSR-layout design (forwarding the incoming request's cookies server-side) was therefore replaced with client-side session checking (`useSession()` + browser `apiFetch`), which works correctly cross-origin via CORS+credentials in both dev and prod, and fits the "UX only" principle since real enforcement never depended on it. Separately, real cross-*-localhost-subdomain* browser testing surfaced that Chrome's SameSite=Lax cookie policy blocks the session cookie on cross-site `fetch` even when CORS allows the origin (`apps.localhost` and plain `localhost` are different "sites" per the public-suffix algorithm) — this is a dev-only browser policy limitation, not a bug, and mirrors the already-documented "production cross-subdomain cookie behavior not yet verified" gap. `TRUSTED_ORIGINS` was extended with `http://apps.localhost:3003`/`http://portal.localhost:3003` regardless, since CORS trust is necessary (if not sufficient) for the dev-subdomain strategy.

**Verification (2026-08-14, against the real dev database, `pkmdb`):**
- `pnpm turbo run typecheck --continue`: 9/10 packages pass, including every F6-touched package (`@medcal/auth`, `@medcal/shared`, `@medcal/config`, `@medcal/portal`, `@medcal/tech-pwa`, `@medcal/api`, `@medcal/web`). The one failure (`@medcal/web-api` — `@medcal/notifications` missing an exported member) is pre-existing, confirmed via `git status` to be untouched by this pass, and out of F6 scope (WhatsApp/notifications business logic).
- `pnpm turbo run test --continue`: all pass (`@medcal/api` 7/7, `@medcal/shared` 9/9, including the new `apiFetch` classification tests).
- `pnpm turbo run build --continue`: `apps/web`, `apps/portal`, `apps/tech-pwa`, `apps/api` all succeed; `apps/web-api` fails on the same pre-existing, unrelated error.
- `GET /me`: 401 with no session; 403 with a valid session but no `UserMembership`; 200 with real `{ user, membership: { role, companyId } }` once granted — exercised against a throwaway whitelisted test account, cleaned up (zero rows left behind), matching F4's verification style.
- Host-based routing: `curl -H "Host: apps.localhost:3003"` / `"Host: portal.localhost:3003"` / no-Host-override against `apps/portal` dev server all return the correct route (307 → `/sign-in` unauthenticated; `x-middleware-rewrite` header confirms `/management` vs `/client` target).
- **Full browser end-to-end** (headless Chrome via `puppeteer-core`, ad hoc, not a repo dependency): sign in via the real `/sign-in` form on `http://localhost:3003` → lands on `/` (rewritten to `/management`) showing the real signed-in user's email and `ADMIN` role → sign out → redirected to `/sign-in` → session confirmed gone on revisit. Regression: `apps/api`'s `/health`, `/contact-messages` (401), `/whitelist` (401), `/internal/contact-messages` (401 without secret) all unchanged.
- No regression to F1–F5: all of the above re-verified green after F6 changes.

**Remaining / deferred (explicitly, not blockers):**
- Real icon assets for `apps/tech-pwa`'s manifest (design-asset dependency).
- Service worker for `apps/tech-pwa` (no offline requirement exists yet).
- Production cross-subdomain cookie behavior against the real `kalibrasimedika.co.id` topology — still unverified from a dev machine (unchanged from F5's note); the client-side session-check design means this only affects whether `apps.*`/`portal.*` share a session seamlessly in production, not whether the mechanism itself is sound (proven end-to-end on same-site `localhost`).
- `packages/ui` stays deferred until a second real MVP feature needs a shared component.
- No architecture redesign performed or required — every F6 decision implements an already-locked shape or fills a structural gap (client Better Auth access, `/me`, dev env loading) with no contradiction to the Adoption Matrix.

---

## 4. Explicitly out of scope for this Foundation pass

Per the locked matrix's Phase column, do **not** build yet: `ChatSession`/`ChatMessage`/`ChatSessionToken` (MVP, not Foundation), FCM *send* logic beyond token storage (MVP), WhatsApp handoff (MVP), MFA (Later), host-based route-group split for `apps.*` vs `portal.*` (Foundation-adjacent but only needed once `apps/portal` UI work starts).

---

## 5. Verification plan

**F1/F2 — done, verified 2026-08-13 (see §2, §3):**
- ✅ `prisma migrate dev` succeeded after the `FCMToken` rename, no orphaned references; `prisma migrate status` reports schema up to date, no drift.
- ✅ `apps/api` boots with `AuthModule` registered; `GET /health` stays green.
- ✅ Full Better Auth session lifecycle verified against real PostgreSQL: sign-up → sign-in → get-session → sign-out → session invalidated.
- ✅ CORS/`trustedOrigins` verified for local dev origins; cookie-domain config verified at the code level.

**F3 — done, verified 2026-08-14 (see §3):**
- ✅ Guard smoke test: unauthenticated request → 401; authenticated request lacking the required permission (`CUSTOMER` role) → 403.
- ✅ `companyId` isolation smoke test: a `SUPERADMIN` session scoped to a different company cannot read `COMPANY_ID`'s `ContactMessage` rows through `CompanyRoleGuard` → 403.
- ✅ Authorized request (`ADMIN` role, correct `companyId`) → 200, correctly scoped data.
- ✅ Regression: existing anonymous `POST /internal/contact-messages` behavior unchanged after the `InternalServiceGuard` refactor.

**F4 — done, verified 2026-08-14 (see §3):**
- ✅ `whitelist:manage`-gated endpoints reject a `superadmin`-less session (401 unauthenticated, 403 for `ADMIN`) and succeed for `SUPERADMIN` (200/201).
- ✅ Duplicate whitelist entry (case/whitespace-normalized) → 409, not a raw 500.
- ✅ Registration blocked for non-whitelisted and revoked emails, with zero orphaned `User` rows; succeeds for active whitelisted emails.
- ✅ `prisma migrate status` clean after migration `20260814073119_email_whitelist`; F1/F2/F3 regressions all re-verified green.

**F6 — done, verified 2026-08-14 (see §3):**
- ✅ `GET /me`: 401 (no session) / 403 (session, no membership) / 200 (real role+companyId), against real PostgreSQL.
- ✅ Host-based routing: correct route (`/management` vs `/client`) per `Host` header, verified via curl and the `x-middleware-rewrite` response header.
- ✅ Full browser E2E (headless Chrome): sign-in form → session → role-aware dashboard → sign-out → session cleared.
- ✅ `pnpm turbo run typecheck/test/build --continue`: all F6-touched packages pass; the one pre-existing unrelated failure (`@medcal/web-api`) confirmed untouched by this pass.
- ✅ Regression: F1–F5 `apps/api` endpoints (`/health`, `/contact-messages`, `/whitelist`, `/internal/contact-messages`) unchanged.

**F5+ — not yet started:**
- Production cross-subdomain cookie behavior against the real `kalibrasimedika.co.id` topology (deferred to F5; F6's client-side session-check design does not depend on this working in dev, only in production).

---

## 6. Summary for reporting

- **F1 — COMPLETE:** the `PushSubscription`/FCM schema contradiction described in §2 has been resolved — `FCMToken` is live in `packages/db/prisma/schema.prisma`, migrated, no orphaned references.
- **F2 — COMPLETE, PASS:** Better Auth is running in-process in `apps/api`, backed by the existing `User` model with no duplicate/shadow model, verified end-to-end (sign-up/sign-in/session/logout) against real PostgreSQL. A pre-existing, unrelated `ContactMessage` dependency-injection defect was found and fixed during verification (§3, F2 note) — root cause was a `tsx`/esbuild tooling limitation, not a Better Auth or architecture issue.
- **F3 — COMPLETE, PASS:** `UserMembership.role` is the sole operative role authority; Better Auth's `createAccessControl`/`role()` statements provide the permission mechanism; `companyId` enforcement is centralized through two guards split by trust boundary (`InternalServiceGuard` for internal service trust, `CompanyRoleGuard` for authenticated RBAC — the two are kept deliberately separate). `contactMessage:read` is a minimal demonstration permission, not a complete product catalog. No Prisma migration was required. The F2 `tsx`/esbuild explicit-`@Inject()` constraint was applied proactively to every new class in F3.
- **F4 — COMPLETE, PASS:** `EmailWhitelist` (with `EmailWhitelistStatus`, reusable/not-consumed entries, full audit trail, no `companyId`) is live and migrated. `whitelist:manage` extends F3's existing access-control mechanism — granted to `SUPERADMIN` only, no new role or permission table. Registration is gated via `@DatabaseHook()`/`@BeforeCreate("user")`, which required adding `databaseHooks: {}` to the Better Auth config for `@thallesp/nestjs-better-auth` to wire the hook at all (an undocumented library requirement found by reading its source). Full verification (401/403/200/201/409, zero-orphan blocked registration, revoked-email rejection, F1–F3 regressions) all green against real PostgreSQL.
- **F6 — COMPLETE, PASS:** `apps/portal`/`apps/tech-pwa` now have working sign-in/session/sign-out via a new Better Auth client subpath (`@medcal/auth/client`) and a new `GET /me` endpoint (session + `UserMembership` lookup, reusing `CompanyRoleGuard`'s exact pattern — no new DB model). `apps/portal` implements the locked "one codebase, host-routed" design via `proxy.ts` (Next.js 16's renamed `middleware.ts`). RBAC stays UX-only (per-app `nav-config.ts`, no frontend permission catalog). `packages/ui` stays deferred. Verification found session-checking had to be client-side, not SSR (dev's host-scoped cookies don't cross `apps.portal`'s own origin), and fixed two pre-existing, F6-unrelated gaps blocking clean verification (`NEXT_PUBLIC_*` env vars never loading in Next.js dev; `packages/config` missing `@types/node`). Full sign-in→session→role-aware-nav→sign-out cycle verified in a real headless-Chrome browser session against real PostgreSQL; zero regression to F1–F5.
- **No architecture redesign performed or required anywhere** — every gap closed (F1–F4, F6) implements an already-locked shape; the one remaining item (F5's Nginx/containerization rollout on the live VPS) is "not yet started," not "contradicts the lock."

**Dependency-order note:** F4 (`EmailWhitelist`) is sequenced after F3 (RBAC), which is now real, so its `whitelist:manage` permission check will be a genuine permission check from the start — no temporary/stub permission is ever introduced.
