# Phase 2 — Isolated Customer Portal Foundation: Implementation Report

**Status:** IMPLEMENTED. Follows Phase 1 (`Implement CustomerUserLink apps.md`), which is
complete and verified.
**Scope:** `apps/customer-portal` application foundation — authentication, self-registration,
pending-authorization UX, and deep-link/return-to handling. Certificate API, QR, Docker,
Nginx, DNS, and all business features remain explicitly out of scope (see §8).

---

## 1. Audit Findings

Re-audited the actual current code (not assumed from prior sessions) before implementing:

- **`apps/tech-pwa`**: single-purpose Next.js app, no middleware/proxy, `AuthProvider` +
  `QueryClientProvider` wrapper in `providers.tsx`, root `.env` loaded via `dotenv` in
  `next.config.js` (Next only auto-loads its own app dir's env), `sign-in`/`sign-in/register`
  pages calling `signIn.email()`/`authClient.signUp.email()` directly. This is the structural
  template `apps/customer-portal` follows.
- **`apps/portal`**: same `AuthProvider` pattern (`PortalAuthProvider`); `src/app/client/layout.tsx`
  already proves the full `CUSTOMER`-role stack end-to-end via `useRequireSession()`'s
  four-state model (`loading | pending | forbidden | ready`) and
  `components/pending-authorization.tsx`'s waiting-room UX (triggered by `GET /me`'s
  `403 { code: "ACCOUNT_PENDING" }`).
- **`@medcal/auth`**: `AuthProvider`, `useAuth`, `useAuthz`, `useSession`, `signIn`, `signOut`,
  `authClient` are all app-agnostic — no hardcoded app name, role, or origin anywhere in
  `auth-provider.tsx`/`auth-client.ts`. Reusable as-is by a third app with zero package changes.
- **Phase 1's `CustomerUserLink` wiring**: confirmed still atomic — `UsersService.assignMembership`
  creates `UserMembership` and (when role is `CUSTOMER`) `CustomerUserLink` in the same
  transaction, with server-side `Customer` validation. Still zero other consumers.
- **New finding (not surfaced by any prior audit):** `resolveRegistrationContext`
  (`packages/shared/src/utils/index.ts`) only recognized the `apps.` and `portal.` host
  prefixes — mapping origins to `INTERNAL_STAFF`/`CUSTOMER_PORTAL` for the registration
  gate. A third app on its own subdomain (`customer.*`) was **unrecognized** and would have
  fail-closed with `REGISTRATION_ORIGIN_NOT_ALLOWED` in production. This was a genuine,
  concrete blocker for "customer self-registration must remain allowed," not a hypothetical.
- **New finding:** per the task's explicit instruction ("do not use the CUSTOMER role alone
  as proof of access to a specific Customer"), the existing `GET /me` contract has no way to
  distinguish "has an active membership" from "has a `CustomerUserLink`" — these are usually
  the same (Phase 1 creates both atomically) but not guaranteed (e.g. `PATCH
  /users/:id/memberships` can change a role to `CUSTOMER` without ever touching
  `CustomerUserLink`). A dedicated, narrow check was required.

## 2. Application Structure

```text
apps/customer-portal/                     (@medcal/customer-portal, port 3005)
├── package.json / next.config.js / tsconfig.json / tailwind.config.js / postcss.config.js
├── vitest.config.mts
├── public/logo.png                       (copied from apps/tech-pwa, shared brand asset)
└── src/
    ├── app/
    │   ├── layout.tsx                     RootLayout + Providers
    │   ├── providers.tsx                  AuthProvider + returnTo-capturing onNeedsSignIn
    │   ├── sign-in/
    │   │   ├── layout.tsx                 (auth-canvas chrome, same as tech-pwa)
    │   │   ├── page.tsx                   sign-in, honors ?returnTo=
    │   │   └── register/page.tsx          sign-up, honors ?returnTo=
    │   └── (app)/                         route group — everything gated by AuthGate
    │       ├── layout.tsx                 wraps children in <AuthGate>, header + sign-out
    │       ├── page.tsx                   minimal authenticated landing (no business data)
    │       └── certificate/[token]/page.tsx   placeholder only — no lookup, no data
    ├── components/
    │   ├── auth/auth-card.tsx             shared sign-in/register card chrome
    │   ├── auth-gate.tsx                  the 4/5-state authorization boundary
    │   ├── pending-approval.tsx           waiting-room UX (own copy, app is isolated)
    │   ├── access-denied.tsx
    │   └── sign-out-button.tsx
    └── lib/
        ├── return-to.ts (+ .test.ts)      open-redirect-safe returnTo sanitizer
        └── use-customer-link.ts           GET /me/customer-link query hook
```

No `src/proxy.ts`/middleware — matches tech-pwa, not portal (no host-based routing needed).
No PWA manifest/service worker/FCM — explicitly out of MVP scope for this app.

## 3. Authentication

`@medcal/auth/client`'s `AuthProvider`/`signIn`/`authClient.signUp.email` are reused
**completely unmodified**. Two small, additive changes elsewhere were required to make
self-registration actually work for a third app (neither touches `@medcal/auth` itself):

1. **`packages/shared/src/utils/index.ts`** — added a `CUSTOMER_PORTAL_HOST_PREFIX =
   "customer."` mapping to `CUSTOMER_PORTAL`, alongside the existing `apps.`/`portal.`
   prefixes. Mirrors the existing pattern exactly; `apps.`/`portal.` behavior is unchanged.
2. **`.env` / `.env.example`** — added `http://localhost:3005` and
   `http://customer.localhost:3005` to `TRUSTED_ORIGINS`.

Both changes are proven correct by a **real** end-to-end test (not just the pure function):
two new cases in `registration-gate.integration.test.ts` call the actual
`auth.api.signUpEmail()` with `Origin: http://customer.localhost:3005` against real Postgres
and assert a real `User` row is created with zero memberships — the same pattern already
used to prove the `apps.`/`portal.` cases.

`apps/customer-portal/src/app/sign-in/register/page.tsx` calls `authClient.signUp.email()`
with no explicit `headers`/`origin` argument — this is correct and required: it's a real
browser call, and Origin is a forbidden header the browser sets automatically from the
page's real origin. Added to `registration-origin-callers.test.ts`'s `ALLOWLISTED_FILES`
with the same justification already used for `apps/portal`'s equivalent page.

## 4. Pending Authorization

`AuthGate` (`src/components/auth-gate.tsx`) is the single authorization boundary wrapping
every route except `/sign-in*`:

1. `bootstrapStatus === "loading"` → loading.
2. `bootstrapStatus === "forbidden"` (e.g. `ACCOUNT_DISABLED`) → access denied.
3. `bootstrapStatus === "pending"` (no active membership at all — fresh self-registration) →
   pending-approval screen.
4. `bootstrapStatus === "ready"` (has an active membership) → now independently checks
   `GET /me/customer-link` (new endpoint, `apps/api/src/modules/me/me.controller.ts`).
   No `customerId` → **still** the pending-approval screen — this is the concrete
   implementation of "do not use the CUSTOMER role alone as proof."
5. `ready` + `customerId` present → the only state that renders `children`.

`GET /me/customer-link` is deliberately independent of the existing, management-portal-shaped
`GET /me` capabilities payload (80+ permission booleans, irrelevant here). It requires only a
valid session (not an active membership), resolves
`prisma.customerUserLink.findFirst({ where: { userId, customer: { companyId } } })`, and
returns `{ customerId: string | null }`. Covered by 4 new tests, including one that
specifically proves a `CUSTOMER`-role membership with **no** link still returns `null`.

## 5. Deep-Link Return

`providers.tsx`'s `onNeedsSignIn` reads `window.location.pathname + search` (not
`useSearchParams`, to avoid a Suspense-boundary requirement in the provider itself),
sanitizes it, and redirects to `/sign-in?returnTo=<encoded>`. Both `sign-in/page.tsx` and
`sign-in/register/page.tsx` read it back via `useSearchParams()` (each wrapped in its own
`<Suspense>`) and `router.push()` to it on success.

**Open-redirect protection** — `src/lib/return-to.ts`'s `sanitizeReturnTo`: rejects anything
that doesn't start with exactly one `/` (blocks absolute URLs and bare schemes like
`javascript:`), rejects `//host` and `/\host` (protocol-relative tricks), rejects any value
containing `://` (defense in depth against smuggled schemes). Falls back to `/` on any
rejection or empty input. 8 unit tests cover the safe and unsafe cases.

**Bug found and fixed during real browser verification:** the "Sign up" / "Sign in" footer
links between the two auth pages originally used static hrefs (`/sign-in/register`,
`/sign-in`), silently dropping the `returnTo` param when a user clicked between them. Fixed
by computing the footer link with the param preserved on both pages.

## 6. Certificate Authorization Boundary

Not implemented (correctly out of scope) — but the architectural boundary is established:
future certificate routes must resolve `authenticated User → CustomerUserLink → Customer`
the same way `AuthGate`/`GET /me/customer-link` already do, never trusting the `CUSTOMER`
role alone. The `(app)/certificate/[token]/page.tsx` placeholder exists only to exercise the
deep-link mechanism above — it performs no lookup and exposes no certificate data (verified:
its rendered text is a static placeholder string, token is echoed unvalidated).

## 7. Files Changed

**New:** `apps/customer-portal/**` (full app, listed in §2).

**Modified:**
- `apps/api/src/modules/me/me.controller.ts` (+`.test.ts`) — new `GET /me/customer-link`.
- `packages/shared/src/utils/index.ts` (+`registration-context.test.ts`) — `customer.` host
  prefix.
- `apps/api/src/modules/whitelist/registration-gate.integration.test.ts` — 2 new real
  end-to-end cases for the `customer.*` origin; removed a now-stale comment.
- `apps/api/src/modules/whitelist/registration-origin-callers.test.ts` — allowlisted the new
  register page.
- `.env` / `.env.example` — `TRUSTED_ORIGINS` additions.

No changes to `apps/api`'s certificate/business modules, Docker, Nginx, DNS, or
`packages/auth` itself.

## 8. Tests

**Added:** 8 `sanitizeReturnTo` unit tests, 4 `MeController.getCustomerLink` tests, 2
`resolveRegistrationContext` `customer.*` tests, 2 real `auth.api.signUpEmail` integration
tests against Postgres.

**Executed:**
- `apps/api` (`me`, `users`, `whitelist` modules): **126/127 passed**. The 1 failure
  (`registration-origin-callers.test.ts` — `apps/tech-pwa/.../register/page.tsx`) is a
  **pre-existing, unrelated** gap (tech-pwa's own register page was never added to the
  allowlist) — confirmed present before this session via `git status` (file untouched) and
  by the fact it's a different file than anything modified here.
- `apps/portal`: **230/230 passed** (no regression).
- `apps/customer-portal`: **8/8 passed**.
- Typecheck: clean on `apps/api`, `apps/portal`, `apps/customer-portal`.
- `next build`: succeeds independently for `apps/customer-portal` (5 routes generated
  correctly: `/`, `/sign-in`, `/sign-in/register` static; `/certificate/[token]` dynamic).

**Real browser verification** (system Chrome via Playwright, both dev servers live,
`customer.localhost:3005` resolving correctly per RFC 6761): confirmed the full
unauthenticated-deep-link → redirect-with-`returnTo` → sign-up →
round-trip-back-to-`/certificate/ABC123` flow works correctly end-to-end, with the returnTo
bug (§5) found and fixed live. No certificate data present in the rendered DOM at any point
during the gated flow.

**One verification gap, found and diagnosed, not fixed (correctly out of this phase's
scope):** could not visually confirm the pending/authorized screens render in this dev
browser session. Root cause, fully diagnosed: modern Chrome never sends `SameSite=Lax`
cookies on cross-site `fetch()`/XHR (only top-level navigation), and `*.localhost`
subdomains vs. bare `localhost` are evaluated as different "sites" by Chrome's registrable-domain
algorithm. Verified via a controlled comparison test that this reproduces **identically**
on `apps/portal`'s own already-shipped dev setup (`portal.localhost:3003` → `localhost:3001`)
— it is a pre-existing characteristic of the shared dev cookie strategy
(`COOKIE_DOMAIN=""` in dev), not something this phase introduced, and it does not apply in
production, where `COOKIE_DOMAIN=".kalibrasimedika.co.id"` makes every subdomain genuinely
same-site. `AuthGate`'s state-derivation logic itself is a direct, low-risk port of
`apps/portal/client/layout.tsx`'s already-proven pattern and is additionally covered by the
passing `MeController.getCustomerLink` tests for its data source.

## 9. Scope Verification

**Not implemented**, confirmed via `git status` (no other files touched): certificate API,
certificate authorization endpoint, certificate lookup by `verificationToken`, QR generation,
QR/PDF embedding, Dockerfile, docker-compose, Nginx, DNS, SSL/ACME, VPS deployment, customer
dashboard, certificate history, progress tracking, feedback, customer plan, any new
`CustomerUserLink` schema/migration (Phase 1's schema was sufficient, untouched).

## 10. Readiness for Next Step

**Ready** for the next phase (certificate authorization + certificate deep-link/API), with
one flagged caveat: local dev-browser testing of the authenticated/pending UI states is
blocked by the pre-existing cross-`*.localhost` cookie limitation described in §8. This does
not block implementation — the underlying logic is verified by tests and code review, and the
limitation does not exist in production — but the team should be aware of it before relying
on manual dev-browser testing for the certificate phase's own verification, and may want to
decide on a dev-testing workaround (e.g. a local reverse proxy under one real hostname, or
accepting integration-test-level verification as sufficient for dev) before that phase begins.

Not proceeding beyond this scope without explicit instruction.
