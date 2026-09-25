# Audit — Customer Portal Authentication via Shared `@medcal/auth`

**Status:** AUDIT ONLY. No code, schema, or config was changed. This document does not
revise `Customer_Portal_MVP_Isolated_Implementation_Plan.md` — it supplies the
findings needed to revise it.
**Audited:** 2026-09-25, `d:\medcal` (main branch).

## Direct Answer

**The `@medcal/auth` mechanism itself already supports authenticated `CUSTOMER`
users — this is proven, working, live code, not a gap.** But the specific
authorization link the new design needs — *"this authenticated `User` belongs to
`Customer` X, therefore may access `Certificate` Y"* — is **not implemented anywhere**.
The schema table for it exists and is migrated into the database, but has zero
consumers: no service writes to it, no guard reads it, no registration flow populates
it. This is a known, already-documented gap elsewhere in the repo, not something this
audit discovered fresh.

Concretely: reuse `@medcal/auth` as-is for session/identity (yes, fully supported).
Build new authorization code for the Customer-Portal-specific "which Customer does
this session belong to" check (not optional — nothing today answers that question).

## 1. `@medcal/auth` — mechanism, identity model, reusability

**Server setup** (`packages/auth/src/index.ts`): Better Auth, hosted in-process
inside `apps/api` (no separate auth service). Cookie-based sessions (Better Auth
default, no custom token strategy). `trustedOrigins` is a comma-split env var
(`TRUSTED_ORIGINS`), not hardcoded. `crossSubDomainCookies` activates when
`COOKIE_DOMAIN` is set (prod: `.kalibrasimedika.co.id`, shared today across
`apps.*`/`portal.*`/`technician.*`). `emailAndPassword` auth enabled
(`requireEmailVerification: false`), no OAuth/social providers. No `rateLimit` block
configured on Better Auth itself. Better Auth's own `admin` plugin is deliberately
**not** used — role authority lives entirely in `UserMembership.role`, not Better
Auth's built-in role field.

**Identity model** (`packages/db/prisma/schema.prisma`): standard Better Auth tables
— `User` (line 538, explicitly "locked" per its own schema comment), `Session`,
`Account`, `Verification` — all generic, with no staff-only assumption baked into
`User` itself. Authorization is layered on separately via `UserMembership` (userId +
companyId + `role: MembershipRole`, unique per user/company pair) — this is the
existing "User belongs to Company X with Role Y" pattern, and it's the shape any new
customer-authorization mechanism should mirror (see §2).

**`CUSTOMER` role — already live, not dead code.** `AUTH_ROLES` in
`packages/auth/src/index.ts` includes `CUSTOMER` alongside staff roles, and it's
actively exercised in real code, not just declared:
- `apps/api/src/modules/users/users.service.ts` special-cases `CUSTOMER` to skip the
  internal-staff-email-domain check during membership assignment.
- `apps/api/src/modules/menu/menu.controller.ts` defines a distinct `"CUSTOMER"`
  application value in its menu-registry enum (alongside `"MANAGEMENT"`,
  `"TECHNICIAN"`).
- `packages/auth/src/access-control.ts` defines a dedicated `customerDashboard:read`
  permission, documented as intentionally separate from `managementDashboard:read`
  "because the Management-app Dashboard and Customer-app Dashboard have different,
  non-overlapping role sets."
- **`apps/portal/src/app/client/layout.tsx` already calls `useNav("CUSTOMER", ...)`**
  — i.e., the "F6 skeleton" `/client` section of Portal (explicitly *not* the
  implementation target per the isolated-app decision) already exercises the full
  CUSTOMER-role stack end-to-end: auth session → membership role → menu/nav
  filtering. This is real, working proof the mechanism functions, even though its UI
  is a skeleton.

**Client-side pattern is generic, not app-specific.** `apps/portal` and
`apps/tech-pwa`'s `providers.tsx` both wrap children in `<AuthProvider
onNeedsSignIn={...}>` from `@medcal/auth/client` inside their own
`QueryClientProvider`. `onNeedsSignIn` in both apps is the same shape: redirect to
`/sign-in` unless already on a public `/sign-in*` route. Nothing inside
`AuthProvider`/`auth-provider.tsx` itself hardcodes an app name, role, or origin — a
third app (`apps/customer-portal`) can copy this exact pattern with zero changes
required inside `@medcal/auth`.

**Caveat found, not confirmed resolved:** neither app's `onNeedsSignIn` was found to
capture or forward the original destination path as a return-to parameter — it's a
fixed redirect to `/sign-in`. The new requirement ("redirect to sign-in, then return
to the original certificate URL") is a deep-link/return-to pattern that does not
appear to exist today in either reference app. This needs to be designed as new
behavior on top of the existing `AuthProvider` callback, not assumed to already work.

**Cross-subdomain SSO — config-only, no code blocker.** In production,
`COOKIE_DOMAIN=".kalibrasimedika.co.id"` + adding a new `customer.kalibrasimedika.co.id`
origin to `TRUSTED_ORIGINS` is sufficient for Better Auth to accept and share the
session cookie with `apps.*`/`portal.*` — purely an env-var change, no code change.
The new app's `auth-client.ts`/`createAuthClient({ baseURL })` must still point at the
shared `apps/api` origin (same as portal/tech-pwa already do via
`NEXT_PUBLIC_API_URL`).

**Debt flagged, adjacent but relevant:** `AUTH_ROLES` (`packages/auth`) has drifted
from Prisma's `MembershipRole` enum — missing `TECHNICIAN_MANAGER`,
`CUSTOMER_SERVICE`, `GENERAL_MANAGER`. Not a blocker for Customer Portal, but worth
reconciling before adding more role-dependent logic on top.

## 2. Customer identity / authorization — what exists, what doesn't

**`Customer`** (`schema.prisma` line 1045) is a staff-managed CRM/business record —
`companyId`, `number`, `name`, `legalName`, `taxId`, `address`, `phone`, `email`
(free-text, not unique, not linked to Better Auth), plus domain relations
(`devices`, `certificates`, `workOrders`, etc.). It has **no built-in self-service
login concept** — today it is created/edited exclusively via staff,
`CompanyRoleGuard`-protected endpoints.

**A join table already exists, but is completely unused:** `CustomerUserLink`
(schema.prisma line 759):
```prisma
model CustomerUserLink {
  id         String   @id @default(cuid())
  userId     String
  customerId String
  createdAt  DateTime @default(now())

  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  customer Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)

  @@unique([userId, customerId])
  @@index([customerId])
}
```
- Migrated into the real database (present in migration
  `20260813063336_init_better_auth_fcmtoken`), and both `User.customerLinks` and
  `Customer.userLinks` back-relations exist.
- **Zero consumers anywhere in `apps/api/src`** — confirmed by repo-wide grep: no
  service creates a row, no guard reads it, no registration flow touches it. Its only
  other appearances are the schema, that one migration, and documentation.
- **This is an already-documented, known gap**, not a fresh discovery:
  `docs/cursor/entity-catalog.md` (line 169) lists it as "Portal user ↔ Customer...
  Ensure customer sees only their data" (i.e., intended purpose, unbuilt), and
  `docs/claude/plans/claude-code-gap-register-2026-09.md` (lines 512–515, 595)
  explicitly records: *"`CustomerUserLink` model schema ada tapi nol consumer di
  seluruh repo — flow linking user customer-portal ke record `Customer` belum pernah
  di-wire."*
- **It has no role column**, unlike `UserMembership.role` — it's existence-only
  (a user either is or isn't linked to a customer, with no permission gradation). If
  a customer account should ever have tiered access (e.g. an owner vs. a read-only
  contact), that would require either adding a role column here or a separate
  mechanism — not designed by this audit, flagged for the revised plan to decide.

**Existing staff-side precedent to mirror:** `CompanyRoleGuard`
(`apps/api/src/common/guards/company-role.guard.ts`) resolves the Better Auth
session, then does `prisma.userMembership.findUnique({ where: { userId_companyId:
{...} } } })` to get the caller's role for the fixed `COMPANY_ID` env value, and
injects `request.companyId`/`request.membershipRole`/`request.userId` onto the
request. A new `CustomerRoleGuard`-equivalent would need to do the analogous lookup —
`prisma.customerUserLink.findFirst({ where: { userId: session.user.id, customerId:
<from the requested Certificate's customerId> } })` (or similar) — to answer "does
this session's user have a link to the Customer that owns the requested
Certificate." **This guard, this query, and the registration-time flow that actually
creates `CustomerUserLink` rows all need to be designed and built — none of them
exist today.**

**No pre-existing customer self-registration flow was found** wired to
`CustomerUserLink`. The `docs/claude/user-registration-with-constraint/` and
`docs/cursor/plan/RBAC-userManagements/` "G4 Customer Self-Registration" documents
discuss customer-portal registration *constraints* (interacting with the staff
`EmailWhitelist`/`signUpEmail` gate), but none of those reports record actually
wiring `CustomerUserLink` into a guard, service, or registration flow — they address
the staff-registration side of the whitelist, not customer account provisioning.

## 3. What this means for the MVP plan

This audit does not revise
`Customer_Portal_MVP_Isolated_Implementation_Plan.md`, but the following points in it
need reconsideration once a revision is requested:

- §6 ("Authentication Boundary") currently assumes zero authentication for the MVP.
  That assumption is no longer a given — the intended product experience (signup/
  login once, QR as a deep link, not the auth mechanism) requires real
  authentication, and the mechanism to support it (`@medcal/auth`, `CUSTOMER` role,
  cross-subdomain cookies) is confirmed available and reusable as-is.
- New work not previously scoped: (a) a customer registration/login flow that creates
  `CustomerUserLink` rows (linking a Better Auth `User` to a `Customer` record) at
  signup or by staff invitation, (b) a `CustomerRoleGuard`-equivalent authorization
  check in `apps/api` resolving "does this session's user have a link to the Customer
  who owns this Certificate," (c) a return-to/deep-link redirect on top of the
  existing `AuthProvider` `onNeedsSignIn` callback so an unauthenticated QR scan can
  bounce through sign-in and land back on the original certificate URL.
- The public, anonymous `/public/certificates/:token` edge-endpoint design from §7 of
  the existing plan is not necessarily wrong — it may still be the right shape for the
  first hop (token → does a certificate exist, minimal public metadata) — but "view
  full certificate" would now gate on the authenticated-and-linked check above, not on
  token possession alone. This split (public token lookup vs. authenticated full
  access) is a design decision for the plan revision, not resolved here.
- Whether the *first-ever* link between a `User` and a `Customer` is self-service
  (customer signs up, claims their `Customer` record — needs a claim/verification
  mechanism to prevent claiming someone else's records) or staff-provisioned (staff
  invites a known contact) is unresolved and is the single biggest open product
  question raised by this audit — it directly determines how much new implementation
  work Phase 2/3 of the plan actually requires.
