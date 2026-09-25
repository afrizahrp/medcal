# Customer Portal MVP — Isolated Application Implementation Plan

**Status:** PLAN ONLY. No code, config, schema, Docker, Nginx, DNS, or VPS changes were
made producing this document (v2 revision). This file remains the sole permitted
repository modification.
**Audited:** 2026-09-25, `d:\medcal` (main branch).
**Revision note (v2):** supersedes the v1 anonymous-token-access model. Per
`docs/claude/plans/customer-portal/Task — Revise Customer Portal MVP Plan.md` (locked
product decision) and
`docs/claude/plans/customer-portal/Audit_Customer_Portal_Auth_Shared_AuthPackage.md`,
**Customer Portal access is now authenticated**: self-service registration + manual
internal approval, gated by an explicit User↔Customer relationship. QR is a deep
link, never a credential. Every statement in v1 implying anonymous/token-only access
is replaced below.

---

## 1. Executive Summary

Build `apps/customer-portal` as a new, fully isolated Next.js application (modeled on
`apps/tech-pwa`'s minimal, middleware-free shape), reusing the shared `@medcal/auth`
foundation for real customer authentication. Customers self-register and sign in once;
a QR code on a certificate is a deep link into a specific certificate page, not a
bearer credential. Before a customer can see certificate data, two things must be
true: (1) they have an authenticated session, and (2) the system can prove that
session's `User` is linked, via internal approval, to the `Customer` record that owns
the requested certificate.

The good news, confirmed by direct audit: **the entire post-signup approval state
machine already exists and works end-to-end today** — unrestricted customer
self-signup, a `403 ACCOUNT_PENDING` contract on `/me`, a waiting-room UI pattern
(`PendingAuthorization`), and a working staff approve action
(`GET /users/without-membership` + `POST /users/:id/memberships`). None of that needs
to be invented. What's genuinely new is narrower than it first sounds: wiring the
existing-but-unused `CustomerUserLink` table into that approval action, and a new
certificate-authorization check that uses it.

## 2. Existing Architecture Reference

Carried forward, not re-derived:

- `apps/portal` serves `apps.*` (management) and `portal.*` (`/client`, F6 skeleton)
  via host-prefix rewrite; F6 is complete/locked. `/client` is explicitly **not** the
  implementation target (§3).
- `apps/tech-pwa` is the structural reference: separate app, port 3004, no
  middleware/proxy, `@medcal/ui`/`@medcal/auth`/`@medcal/shared` shared packages.
- `Certificate.verificationToken` (`String? @unique`) exists, unused by any app code.
- `@medcal/auth` (Better Auth, hosted in `apps/api`): cookie-based sessions,
  `crossSubDomainCookies` via `COOKIE_DOMAIN`, `trustedOrigins` via env,
  `emailAndPassword` auth, no OAuth. `CUSTOMER` is a **live, exercised role** — used
  in `users.service.ts`, `menu.controller.ts`'s `CUSTOMER` application, a dedicated
  `customerDashboard:read` permission, and `apps/portal/src/app/client/layout.tsx`
  already calls `useNav("CUSTOMER", ...)` end-to-end.
- `AuthProvider` (`@medcal/auth/client`) is app-agnostic — `apps/portal` and
  `apps/tech-pwa` both wrap children in it identically, with a client-side
  `onNeedsSignIn` redirect to `/sign-in`. No return-to/deep-link capture exists in
  either today (confirmed gap, new work — see §6).
- `CustomerUserLink` (`userId` + `customerId`, unique, indexed) exists in the schema
  and is migrated into the database, but has **zero consumers anywhere in `apps/api`
  or `apps/portal`** — a known, previously-documented gap
  (`docs/claude/plans/claude-code-gap-register-2026-09.md`), not a fresh discovery.
- `UserStatus` enum is `INVITED | ACTIVE | DISABLED` — there is no `PENDING` status
  value. "Pending approval" is represented structurally: a `User` can exist with **no
  `UserMembership` row**, and that absence *is* the pending state.
- `EmailWhitelist`/`registration-gate.ts` is a **pre**-registration gate for
  `INTERNAL_STAFF` signups only. For `CUSTOMER_PORTAL` origin, it explicitly returns
  `null` (no restriction) — **customer self-signup is already unrestricted today**;
  this mechanism is correctly out of scope to extend, per the audit.
- The approval mechanism already built and working: `GET /users/without-membership`
  lists users with no membership; `POST /users/:id/memberships` (assigns a
  `UserMembership` with a role, `CUSTOMER` included) is the staff approval action;
  `apps/portal/src/app/management/users/assign/page.tsx` is the existing (generic,
  all-roles) staff UI for it. Server side, `MeController.getMe` returns
  `403 { code: "ACCOUNT_PENDING" }` when no active membership exists;
  `apps/portal/src/components/pending-authorization.tsx` renders the waiting-room UI
  for that code, with a recheck button and sign-out escape hatch.
- Cross-subdomain SSO for a new `customer.*` app is config-only
  (`COOKIE_DOMAIN` + `TRUSTED_ORIGINS`), no code change.

## 3. Why Isolated App

Unchanged from v1: independent deploy lifecycle, no host-based routing needed
(tech-pwa has none), smaller blast radius for the highest-risk (internet-facing)
surface, no accidental inheritance of Management Portal's own session/role
assumptions. Isolation is now *more* important, not less, because Customer Portal
will hold real customer session state — a bug there must not be able to reach
Management Portal's process/container.

## 4. `tech-pwa` Pattern Analysis

Unchanged from v1 (see prior audit): no Dockerfile exists anywhere in the repo yet
(not even for `apps/portal`, despite compose referencing one); no middleware/proxy in
tech-pwa; `AuthProvider` + `QueryClientProvider` wrapper pattern is directly reusable;
env loaded via `dotenv` in `next.config.js` since Next only auto-loads its own app
dir's `.env`. One addition: tech-pwa's `sign-in`/`sign-in/register` pages
(`apps/tech-pwa/src/app/sign-in/*`) are now a **direct structural template** for
Customer Portal's own sign-in/sign-up pages (previously irrelevant when the MVP had no
auth).

## 5. Proposed `apps/customer-portal` Structure

```text
apps/customer-portal/
├── package.json                    # @medcal/customer-portal, port 3005
├── next.config.js                  # dotenv root .env, transpilePackages: ["@medcal/ui","@medcal/shared","@medcal/auth"]
├── tsconfig.json                   # extends @medcal/typescript-config/nextjs.json
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── providers.tsx           # AuthProvider (onNeedsSignIn → /sign-in?returnTo=), QueryClientProvider
│   │   ├── page.tsx                 # minimal landing/help
│   │   ├── sign-in/
│   │   │   ├── page.tsx             # modeled on apps/tech-pwa/src/app/sign-in/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── pending-approval/
│   │   │   └── page.tsx             # this app's own waiting-room UI, mirroring apps/portal's
│   │   │                            #   pending-authorization.tsx CONTRACT (403 ACCOUNT_PENDING),
│   │   │                            #   not a cross-app import (apps stay isolated)
│   │   └── certificate/[token]/
│   │       └── page.tsx             # requires session; authorization enforced server-side
│   └── lib/
│       └── certificate-client.ts    # apiFetch-style wrapper calling apps/api DIRECTLY
│                                     #   (credentials:"include"), same pattern as portal/tech-pwa —
│                                     #   NOT apps/web-api's anonymous /public/* edge (see §7)
└── public/                          # minimal — no PWA manifest/SW/icons needed for MVP
```

## 6. Authentication Boundary

**Decision: Customer Portal is authenticated, using `@medcal/auth` as-is.** This
replaces v1's "no authentication" decision entirely.

**Registration:** self-service, no invite requirement, reusing the existing
unrestricted `CUSTOMER_PORTAL`-origin path in `registration-gate.ts` — confirmed no
whitelist check applies to customer signups today. **One genuine open question**
(§17): that gate presumably keys off the calling app's declared origin/context; it has
only ever been exercised by `apps/portal`'s customer-facing surface. Whether a brand
new app (`apps/customer-portal`) correctly reports `CUSTOMER_PORTAL` origin to Better
Auth needs verification at implementation time, not assumed.

**Pending approval — reuse, don't rebuild:** a signed-up `User` with no
`UserMembership` already gets `403 { code: "ACCOUNT_PENDING" }` from `GET /me`
(`apps/api/src/modules/me/me.controller.ts`), enforced consistently by
`CompanyRoleGuard` on every other guarded route. Customer Portal's own
`pending-approval` page (§5) should render on that same code, following
`apps/portal/src/components/pending-authorization.tsx`'s pattern (recheck + sign-out),
re-implemented in the new app (not imported across the app boundary — isolation, §3).

**Approval action — reuse, then extend:** `POST /users/:id/memberships` (assign a
`UserMembership`, role `CUSTOMER`) already unblocks the pending state. This alone is
**necessary but not sufficient** — it proves the user may act as *a* customer, not
*which* `Customer` record they belong to. The approval flow must be extended to also
write a `CustomerUserLink` row at approval time. This means either (a) extending
`UsersService.assignMembership` to accept an optional `customerId` and create the link
transactionally when role is `CUSTOMER`, or (b) a companion endpoint called right
after membership assignment. Either way, the staff-facing approval screen needs a way
to pick *which* `Customer` record to link — the existing generic
`apps/portal/src/app/management/users/assign/page.tsx` has no such picker today. This
is genuinely new UI/API work, not a reuse (see §17 for the reuse-vs-dedicated-screen
decision).

**Return-to/deep-link — small, genuinely new:** neither `apps/portal` nor
`apps/tech-pwa`'s `onNeedsSignIn` preserves the original destination. Customer
Portal's `providers.tsx` needs its own `onNeedsSignIn` that appends
`?returnTo=<original path>` when redirecting to `/sign-in`, and the sign-in/sign-up
success handler must read and honor it (falling back to `/` if absent). This is
additive behavior on top of the existing generic `AuthProvider` callback — no change
inside `@medcal/auth` itself.

**Cross-subdomain cookies:** unchanged from the prior audit — adding the chosen
customer subdomain to `COOKIE_DOMAIN`'s implicit scope (already `.kalibrasimedika.co.id`
in prod) and to `TRUSTED_ORIGINS` is sufficient; no code change inside `@medcal/auth`.
Note this means a customer's session cookie is technically valid on `apps.*` too —
this is *safe*, not a gap, because authorization (role/membership, not session
possession) is what actually gates access, exactly as already proven by
`apps/portal/client`'s existing `CUSTOMER`-role nav today.

## 7. Certificate API Architecture

**This replaces v1's anonymous `@AllowAnonymous()` + `InternalServiceGuard` design
entirely.** Because the caller now has a real Better Auth session, the correct
precedent is **`apps/portal`/`apps/tech-pwa`'s direct-to-`apps/api` pattern**
(`apiFetch`, `credentials: "include"`), not `apps/web-api`'s anonymous public edge —
that edge exists specifically for *pre-auth* traffic (contact forms, chat leads), and
is architecturally the wrong layer once a session exists. `apps/web-api` likely has no
role in the authenticated certificate-lookup flow at all; this is a correction from
v1, not a detail.

```text
Customer Portal (apps/customer-portal, has @medcal/auth session cookie)
      │  GET /certificates/by-token/:token   (direct to apps/api, credentials: "include")
      ▼
apps/api
GET /certificates/by-token/:token
      │  1. Resolve Better Auth session → session.user.id (existing mechanism, no change)
      │  2. NEW: resolve session.user.id → CustomerUserLink rows → set of authorized customerIds
      │  3. Look up Certificate by verificationToken
      │  4. Compare Certificate.customerId against the authorized set
      │       match      → return data-minimized DTO + stream PDF
      │       no match   → same response shape as "not found" (see below — no enumeration signal)
      │       not found  → generic 404
      ▼
new CertificatesModule (controller + service + DTO)
  - resolves customerId set via a new guard/resolver mirroring CompanyRoleGuard's
    shape (session → join table → identity), but customer-scoped, not company-scoped
  - PDF bytes streamed server-side via pdfFileObjectId — never exposed to the client,
    same design principle as v1 (§ File/PDF access, unchanged)
```

**Why the same response for "not found" and "not yours":** an authenticated customer
is still an untrusted party with respect to *other* customers' data. If "not found"
and "belongs to someone else" returned different responses, an authenticated session
could be used to enumerate which tokens exist system-wide. Both cases must return an
identical, generic "certificate not accessible" response.

**DTO / data minimization:** unchanged in spirit from v1 — certificate number, status,
`issuedAt`, `validUntil`, device name/model, customer/company *name* only. No internal
IDs (`companyId`, `customerId`, `deviceId`, `calibrationJobId`, `pdfFileObjectId`), no
`MeasurementResult`/`CalibrationTestPoint` data.

**Still open (unchanged from v1):** no code currently generates `verificationToken`;
the actual certificate-issuance flow that creates `Certificate` rows was not pinned
down by either audit pass and must be located as the first step of implementation.

## 8. QR Architecture

Mechanically unchanged from v1 — a QR PNG buffer embedded via pdfkit's
`doc.image(buffer, ...)` (already proven safe with a `Buffer` in-repo via
`identity-correction-pdf.ts`), encoding
`https://customer.kalibrasimedika.co.id/certificate/<verificationToken>`. No QR
library exists yet (`qrcode` package needed as a new `apps/api` dependency).

**What changes is the meaning of the URL, not its construction.** The token is now
explicitly a **locator, not a credential** — visiting it never grants access by
itself:

```text
Certificate QR
      │
      ▼
customer.kalibrasimedika.co.id/certificate/<token>
      │
      ├── Authenticated + authorized (CustomerUserLink match) → certificate shown
      ├── Authenticated, NOT authorized (different customer)  → generic "not accessible"
      ├── Not authenticated                                    → redirect to
      │       /sign-in?returnTo=/certificate/<token>
      │       → sign in (or sign up → pending-approval wait if new) →
      │       → return to /certificate/<token> → authorization check runs
      └── Invalid/unknown token                                 → generic "not accessible"
```

This substantially changes the token-leakage risk calculus from v1: a leaked/shared
QR image or URL is no longer directly exploitable — the server-side authorization
check runs on every access, regardless of who possesses the link. Entropy still
matters (to prevent trivial cross-customer probing, see §13), but the token is no
longer the sole security boundary.

## 9. Public Website Entry Point

New in v2 — not present in v1. Located, not modified:

- Nav CTA: `apps/web/src/components/site-header.tsx` renders `<SectionCta
  variant="nav" />`; label/link logic lives in
  `apps/web/src/components/section-cta.tsx` (`CTA_LABEL = "Konsultasikan Kebutuhan
  Anda"`, plain Next.js `<Link href="/kontak">` via a `PrimaryCtaLink` helper — no
  design-system button component, no hardcoded external URL today).
- The hero-section CTA with the same current label lives separately in
  `apps/web/src/components/hero.tsx` (via `SectionCta variant="actions"`) — per the
  locked decision, this one is **unaffected**; only the nav instance changes.
- No existing precedent for linking to a different `*.kalibrasimedika.co.id`
  subdomain exists in `apps/web`. The closest pattern to follow for a configurable,
  non-hardcoded target URL is `apps/web/src/components/whatsapp-identity-dialog.tsx`,
  which reads `process.env.NEXT_PUBLIC_WEB_API_URL` rather than hardcoding a backend
  origin — the same approach (a `NEXT_PUBLIC_CUSTOMER_PORTAL_URL`-style env var)
  should be used for the new "Masuk" link's target rather than a hardcoded string.

**Planning only** — implementation would change the nav variant's label/href in
`section-cta.tsx` (or add a distinct nav-only CTA slot), not touched in this pass.

## 10. Docker/Container Architecture

Unchanged from v1: no Dockerfile exists anywhere in the repo today (genuine first for
this repo, not a copy of an existing file); proposed shape follows
`infra/add-ssh/F5_7_Containerize_TechPWA_Staged.md` Stage 1 (multi-stage `turbo
prune`, `NEXT_PUBLIC_*` build args, non-root user, `EXPOSE 3005`, wget-based
healthcheck). Port 3005 remains the next free slot (3001 api, 3002 web-api, 3003
portal, 3004 tech-pwa reserved, 3010 web). Env surface is slightly larger than v1's
"no-auth" assumption: `NEXT_PUBLIC_API_URL` (direct-to-api calls, §7) replaces v1's
`NEXT_PUBLIC_WEB_API_URL`-only assumption; no new secrets are needed since
`@medcal/auth`'s existing Better Auth session mechanism is reused as-is.

## 11. Nginx/Domain Architecture

Unchanged from v1: `customer.kalibrasimedika.co.id` is the pattern-consistent working
candidate (final decision still open, §17); `infra/nginx/technician.kalibrasimedika.co.id.conf.example`
remains the correct template (single upstream, no path-splitting, no WebSocket need,
`Host` header not load-bearing since Customer Portal does no host-based routing). No
change to this section's content from the authentication revision — nginx doesn't need
to know anything about the auth model.

## 12. `infra/add-ssh` / VPS Preparation

Unchanged from v1: repeat the `F5_7_Containerize_TechPWA_Staged.md` two-stage
(propose → approve → build-only) discipline as a new, not-yet-created
`infra/add-ssh/F5_x_Containerize_CustomerPortal_Staged.md` at implementation time.
Same explicit split of Repository / VPS / DNS / Nginx change categories as v1 — the
auth model change doesn't affect infrastructure staging discipline.

## 13. MVP Scope

**Must Have**
- `apps/customer-portal` application
- `@medcal/auth` integration (self-service sign-up/sign-in)
- Customer pending-approval state (reusing the `ACCOUNT_PENDING` contract)
- Internal manual approval flow (reusing `without-membership` + `assignMembership`,
  extended to also create `CustomerUserLink`)
- Customer ↔ User authorization relationship (`CustomerUserLink`, newly wired)
- Authenticated, server-side-authorized certificate access
- QR certificate deep link
- Return-to-after-authentication flow
- Certificate viewing/access (PDF)
- Production customer domain, HTTPS
- Basic abuse protection (rate limiting, tuned for an authenticated-but-untrusted
  caller — see §13 Security)

**Reuse**
- `@medcal/auth`, `@medcal/shared`, `@medcal/ui`
- `registration-gate.ts`'s existing unrestricted `CUSTOMER_PORTAL` signup path
  (no change needed there)
- `GET /users/without-membership` + `POST /users/:id/memberships` + `403
  ACCOUNT_PENDING` + `PendingAuthorization`-pattern waiting room
- `apiFetch`-style direct-to-`apps/api` client pattern (portal/tech-pwa precedent)
- Existing PDF/pdfkit and file-storage infrastructure
- Existing deployment/staging discipline (`F5_7` two-stage pattern)

**Explicitly NOT MVP**
Customer dashboard, calibration progress, customer history, feedback, notifications,
customer plan, advanced engagement features, Google Drive integration.

## 14. Security Considerations

**Token security:** unchanged mechanics (entropy, generation, exposure in QR — see
§8), but the *consequence* of leakage is now bounded — a token alone never grants
access. The remaining risk is cross-customer probing by an authenticated session
(guessing tokens to learn what exists) — mitigated by returning an identical response
for "not found" and "not yours" (§7), plus rate limiting.

**Public/authenticated endpoint:** rate limiting still applies (reuse `apps/web-api`'s
existing limiter pattern conceptually, or an equivalent on `apps/api` directly since
this route no longer goes through `web-api`), now scoped per-session/per-user rather
than purely per-IP, since the caller is identified.

**Certificate access:** enforced by the DTO shape (§7, no internal IDs) and by the
server-side `CustomerUserLink`/`Certificate.customerId` match — never a UI-only check.

**Application isolation:** Customer Portal has its own `@medcal/auth` wiring, entirely
separate from Management Portal's. Shared session cookie scope (if `COOKIE_DOMAIN` is
shared) is safe because *authorization*, not session possession, gates every route —
a customer-role session hitting a management route is blocked by `CompanyRoleGuard`'s
role/permission check exactly as it is today for `apps/portal/client`.

**File/PDF access:** unchanged from v1 — PDF bytes stream server-side via
`pdfFileObjectId`, never exposed as an id/URL to the client; now additionally gated
behind the authorization check before any streaming begins.

**New process risk, not a code concern:** at approval time, staff must correctly
select *which* `Customer` record to link a newly approved user to. A wrong selection
is a real, direct data-exposure risk (wrong customer sees another's certificates) —
this argues for a deliberate, careful approval-screen design (e.g. requiring an exact
match confirmation), not just "reuse the generic assign screen as-is." Flagged as a
UX/process decision for implementation, not resolved here.

## 15. Implementation Phases

### Phase 1 — Customer Portal application foundation
Scaffold per §5. **Files:** `apps/customer-portal/{package.json,next.config.js,tsconfig.json,src/app/layout.tsx,src/app/page.tsx}`. **Dependencies:** none (workspace glob auto-registers). **Acceptance:** app builds/typechecks/runs on port 3005. **Risks:** none — mirrors tech-pwa exactly.

### Phase 2 — Customer authentication
`providers.tsx` (`AuthProvider` + `returnTo`-aware `onNeedsSignIn`), sign-in/sign-up pages modeled on `apps/tech-pwa/src/app/sign-in/*`. **Files:** `apps/customer-portal/src/app/{providers.tsx,sign-in/page.tsx,sign-in/register/page.tsx}`. **Dependencies:** Phase 1. **Acceptance:** a new user can sign up and sign in against real `apps/api`; `GET /me` returns `403 ACCOUNT_PENDING` for the fresh account. **Risks:** unverified whether `registration-gate.ts` correctly attributes `CUSTOMER_PORTAL` origin to a brand-new calling app (§17) — verify first, before building UI around it.

### Phase 3 — Customer registration approval
Extend `UsersService.assignMembership` (or add a companion action) to create a `CustomerUserLink` row when approving a `CUSTOMER`-role membership; extend or duplicate the staff approval screen with a `Customer` picker. **Files:** `apps/api/src/modules/users/{users.service.ts,users.controller.ts}`, `apps/portal/src/app/management/users/assign/page.tsx` (or a new customer-specific screen). **Dependencies:** none beyond existing code — can start Day 1, in parallel with Phase 2. **Acceptance:** staff can approve a pending customer user and link them to a specific `Customer`; `CustomerUserLink` row is created correctly; the approved user's `/me` call succeeds. **Risks:** highest-uncertainty item in the whole plan — first-ever consumer of `CustomerUserLink`, and the Customer-picker UX decision (§14) needs to be made, not assumed.

### Phase 4 — Customer authorization
New guard/resolver in `apps/api` mirroring `CompanyRoleGuard`'s shape: session → `CustomerUserLink` rows → authorized `customerId` set. **Files:** `apps/api/src/common/guards/customer-role.guard.ts` (or equivalent), consumed by Phase 5's controller. **Dependencies:** Phase 3. **Acceptance:** a unit/integration test proves an authenticated user with a `CustomerUserLink` to Customer A cannot resolve access to Customer B's data. **Risks:** low once Phase 3's shape is settled.

### Phase 5 — Certificate API
`CertificatesModule` (controller/service/DTO), authenticated route (not `@AllowAnonymous()`), consumes Phase 4's authorization resolver, looks up by `verificationToken`, applies the "identical response for not-found vs not-yours" rule (§7), streams PDF. **Files:** `apps/api/src/modules/certificates/*`, `apps/api/src/app.module.ts`, plus locating/extending the real certificate-issuance flow for token generation (location unconfirmed — first implementation step). **Dependencies:** Phase 4. **Acceptance:** authorized access returns the correct minimized DTO + PDF; unauthorized/not-found both return the same generic response; a burst test confirms rate limiting engages. **Risks:** issuance-flow location still unknown (carried over from v1).

### Phase 6 — Certificate UI + return-to flow
`certificate/[token]/page.tsx`, `pending-approval/page.tsx`, `returnTo` capture/honor logic in the sign-in flow. **Dependencies:** Phases 1, 2, 5. **Acceptance:** an unauthenticated visit to a certificate URL round-trips through sign-in (and pending-approval wait, if applicable) and lands back on the original certificate — verified manually end-to-end against a real dev-seeded scenario. **Risks:** UX decision on PDF viewing (inline vs. download) still open, same as v1.

### Phase 7 — QR integration
`qrcode` dependency added to `apps/api`; QR buffer embedded into the existing certificate PDF-generation code path (location TBD, sibling to `kontrol-alat-pdf.ts`). **Dependencies:** Phase 5 (token must exist). **Acceptance:** a freshly generated certificate PDF's QR resolves to the correct deep-link URL. **Risks:** low — `doc.image()` Buffer support already proven in-repo.

### Phase 8 — Docker/production deployment
New Dockerfile + compose service block, per §10. **Dependencies:** Phase 1. **Acceptance:** image builds and the container passes its healthcheck. **Risks:** genuine repo-wide first (no existing Dockerfile to copy) — budget real iteration time.

### Phase 9 — Nginx/DNS/HTTPS
`.conf.example` file + external DNS request, then the explicit, separately-approved VPS deployment step. **Dependencies:** Phase 8 + externally provisioned DNS. **Acceptance:** the production URL resolves correctly over HTTPS. **Risks:** DNS turnaround time is external/unscheduled (§17).

### Phase 10 — End-to-end verification
Full scan test covering: fresh unauthenticated scan → sign-up → pending wait → approval → return to certificate → correct render; plus a negative test confirming Customer A cannot view Customer B's certificate even with a valid token. **Dependencies:** all prior phases. **Acceptance:** both the golden path and the cross-customer-denial path pass in production.

## 16. Revised 5-Day Critical Path

Meeting target: 2026-09-28/09-30 (today: 2026-09-25).

**Honest schedule-risk flag, stated explicitly per the task's own instruction not to
hide this:** v1's 5-day estimate was built around an anonymous-access model with no
new authorization code. This revision adds real new-code items — `CustomerUserLink`
wiring (Phase 3), a new authorization guard (Phase 4), and an approval-screen UX
decision (§14) — that were not in v1's scope. This is a materially larger MVP than
before, not a relabeling of the same one. The 5-day window is tighter as a result;
treat Phase 3 in particular as the schedule's critical constraint, not a routine item.

**Critical path (cannot be cut):**
1. **Day 1, in parallel:** Phase 3 design/start (highest uncertainty — start
   immediately), Phase 2 (mostly reuse, lower risk), Phase 1 (trivial), and the DNS
   request (§17 — external, unscheduled turnaround, kick off immediately regardless of
   code readiness).
2. Phase 4 → Phase 5, sequentially, once Phase 3's `CustomerUserLink`-write shape is
   settled.
3. Phase 6 and Phase 7 in parallel, once Phases 2/5 are stable.
4. Phase 8 (Docker) — start as soon as Phase 1 is stable, don't wait for 6/7.
5. Phase 9 — as soon as Phase 8's image exists and DNS has propagated.
6. Phase 10 — last, same day as go-live, must include the cross-customer-denial test,
   not just the happy path.

**Can be deferred:**
- A dedicated, polished Customer-picker approval UI — the generic
  `management/users/assign` screen can be extended minimally first (e.g. a plain text
  `customerId` field) rather than building a searchable picker; polish later.
- CAPTCHA/advanced abuse protection beyond basic rate limiting.
- Everything already excluded in §13 (dashboard, history, notifications, etc.).

**Do not defer:** any part of the auth/approval/authorization chain — per the locked
decision, this is core MVP, not a future enhancement.

## 17. Acceptance Criteria

**Authentication**
- Customer can self-register; existing `registration-gate.ts` unrestricted path is
  confirmed to apply to the new app.
- Customer can sign in; session persists without repeated logins.
- `@medcal/auth` is reused as-is, no parallel auth system introduced.

**Approval**
- A newly registered customer cannot access certificate/customer data before
  approval.
- Staff can approve using the existing `assignMembership`-based action, extended to
  also create a `CustomerUserLink`.
- An approved customer is linked to the *correct* `Customer` record.
- A pending customer sees the waiting-room state, not an error or blank page.

**Authorization**
- Customer A, authenticated, cannot access Customer B's certificate — verified by an
  explicit negative test, not assumed.
- Certificate access is decided server-side; no client/UI-only check.
- Possessing a valid `verificationToken` alone is insufficient without a matching
  `CustomerUserLink`.

**QR**
- QR opens the correct certificate deep link.
- An unauthenticated scan redirects to sign-in/sign-up and returns to the original
  certificate URL after authentication (and after approval, if the account was new).
- Authorization is checked before any certificate data is returned.

**Isolation**
- Customer Portal remains independently deployable; stopping it doesn't affect
  Management Portal, and vice versa.
- No Management Portal route, session assumption, or authorization logic is
  accidentally inherited.

## 18. Risks / Open Questions

Per the locked decisions, the following are **not** reopened: isolated
`apps/customer-portal`; shared `@medcal/auth`; self-service registration + manual
approval; authenticated portal; QR as deep link; server-side authorization before
access; nav CTA becomes "Masuk"; hero CTA unchanged.

Genuinely unresolved:

1. **Does `registration-gate.ts` correctly attribute `CUSTOMER_PORTAL` origin when
   the caller is a brand-new app** (rather than `apps/portal`, the only app that has
   ever exercised this path)? Needs verification as the first step of Phase 2, not an
   assumption.
2. **Exact implementation point for `CustomerUserLink` writes** — extend
   `assignMembership` directly, or a separate companion call — and the staff-side
   Customer-picker UX (reuse the generic assign screen minimally vs. a dedicated
   screen). Product/design decision, not purely technical.
3. **Exact certificate-issuance flow location** for wiring `verificationToken`
   generation — unresolved since v1, still not pinned down by either audit pass.
4. **Final production customer domain** — `customer.kalibrasimedika.co.id` is the
   pattern-consistent candidate; final choice is a business/marketing decision.
5. **DNS/SSL timing** — entirely external/manual per the repo's own established
   pattern; direct schedule risk against the 28–30/09 target.
6. **Whether already-issued certificates require retroactive token
   generation/backfill** — unresolved since v1; a business decision, not addressed
   here (and not "historical data backfill" scope unless explicitly required).

## 19. Files Expected to Change

Consolidated from the phases above — no file listed here is created or modified by
this planning pass:

- **New app:** `apps/customer-portal/**` (package.json, next.config.js, tsconfig.json,
  `src/app/{layout,providers,page,sign-in/*,pending-approval,certificate/[token]}.tsx`,
  `src/lib/certificate-client.ts`, `Dockerfile`).
- **`apps/api`:** new `src/modules/certificates/*` (module/controller/service/DTO);
  new/extended `src/common/guards/*` (customer authorization resolver); extended
  `src/modules/users/{users.service.ts,users.controller.ts}` (`CustomerUserLink`
  write path); `src/app.module.ts` (register new module); `package.json` (new
  `qrcode` dependency); the certificate PDF-generation file (location TBD) for QR
  embedding; the certificate-issuance flow (location TBD) for token generation.
- **`apps/portal`:** `src/app/management/users/assign/page.tsx` (extended, or a new
  sibling customer-approval screen).
- **`apps/web`:** `src/components/section-cta.tsx`/`site-header.tsx` (new "Masuk" nav
  entry point) — identified in §9, not modified in this pass.
- **Root/infra:** `docker-compose.prod.yml` (new `customer-portal` service block),
  `.env.production.example` (new `NEXT_PUBLIC_*`/customer-domain additions to
  `TRUSTED_ORIGINS`), `infra/nginx/customer.kalibrasimedika.co.id.conf.example` (new,
  file only), `infra/add-ssh/F5_x_Containerize_CustomerPortal_Staged.md` (new staging
  doc, at implementation time).

---

## Final Output

### Architecture Decision

Customer Portal is a fully isolated application that reuses the shared `@medcal/auth`
authentication foundation. Customers self-register and authenticate once, but
customer data access remains gated by manual internal approval and an explicit User ↔
Customer relationship. QR codes act as deep links to certificates, not as
authentication credentials. Certificate access requires both an authenticated
customer session and server-side authorization that the certificate belongs to the
customer's authorized Customer context.

### Critical Path

Day 1 in parallel: `CustomerUserLink`/approval wiring (Phase 3, highest uncertainty),
customer auth (Phase 2), app foundation (Phase 1), DNS request (external, unscheduled
turnaround). Then: authorization guard → certificate API → certificate UI + QR
(parallel) → Docker → Nginx/DNS → end-to-end verification including the
cross-customer-denial test. See §16.

### Infrastructure Dependencies

- **DNS:** new A record for the chosen customer subdomain → VPS IP (manual, external,
  request immediately).
- **Nginx:** new `.conf.example` following the `technician.*` template; actual
  install/certbot/reload remains a separate, explicitly-approved VPS step.
- **Docker:** new Dockerfile (genuine first for this repo) + new compose service on
  port 3005.
- **VPS:** `docker compose up -d customer-portal`, nginx symlink, `certbot`, reload —
  manual, separately approved, never bundled with code merges.
- **SSL:** via certbot, only after the container is live behind the proxy.
- **SSH/add-ssh:** new two-stage staged doc following the `F5_7` precedent.
- **Environment variables:** `NEXT_PUBLIC_API_URL` (direct-to-api calls, replacing
  v1's web-api-only assumption); the new customer subdomain added to
  `TRUSTED_ORIGINS`; no new secrets required — `@medcal/auth`'s existing session
  mechanism is reused unchanged. `INTERNAL_API_SECRET`/web-api forwarding is likely
  **not** needed for this flow at all (correction from v1 — that mechanism was for
  the now-superseded anonymous design).

### Security Decision

**Possession of a QR/code/token alone is insufficient to access a certificate.**
Access requires an authenticated `@medcal/auth` session *and* a server-side check
that the session's `User` is linked, via `CustomerUserLink` (established only through
manual internal approval), to the `Customer` that owns the requested certificate. A
leaked or shared QR/URL is not directly exploitable by someone without that
authorization link.

### Open Questions

See §18 — origin-attribution verification for a new app, exact `CustomerUserLink`
write point and approval-screen UX, certificate-issuance flow location, final domain,
DNS/SSL timing, and retroactive backfill for already-issued certificates.

### Ready for Implementation?

**YES, WITH PREREQUISITES** — a heavier set than v1's.

Concrete reasons:
- The authentication and approval *mechanisms* are already built and proven
  end-to-end (registration gate, `ACCOUNT_PENDING` contract, waiting-room UI, staff
  approval action) — this substantially de-risks the plan compared to building auth
  from scratch.
- The genuinely new work is narrow but load-bearing: wiring `CustomerUserLink` into
  the approval flow (Phase 3) and a new customer-authorization resolver (Phase 4).
  Both must be designed carefully — get these wrong and the security decision above
  doesn't hold.
- Two prerequisites should be resolved before Phase 3 coding starts: the
  Customer-picker UX for approval (§18.2), and confirming origin-attribution for a
  new calling app (§18.1).
- The 5-day timeline is now genuinely tight, not comfortable — schedule review with
  the team on Phase 3's scope is recommended before committing to the 28–30/09 date.
- DNS turnaround remains the one fully external dependency threatening the timeline
  regardless of engineering pace — request it today.
