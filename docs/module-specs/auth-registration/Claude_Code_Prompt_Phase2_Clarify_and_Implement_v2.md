# PHASE 2 PROMPT (v2) — FIX DESIGN BUG, THEN CLARIFY, VERIFY, IMPLEMENT
## Follow-up to: Architecture Review — Staff Auth vs Customer Portal

**CONTEXT**

The audit (audit-result.md) recommended Option B. Your follow-up design doc
("Origin-Aware Registration Policy") is a good technical improvement over the
original plan — using Better Auth's own `@Hook()` / `@BeforeHook("/sign-up/email")`
via `@thallesp/nestjs-better-auth`, reading `ctx.headers.get("origin")` directly
inside Better Auth's middleware, is cleaner than trying to thread NestJS
request-scoped DI into `@BeforeCreate`. Keep that part of the approach.

However, this design has **one critical bug** and **two gaps from the previous
round that are still open**. Fix/answer all three before writing any code.

Note: the "Cursor Implementation Report" this doc references was an experiment
made only in the working directory and never committed — fully discarded before
any commit. No git history exists for it and none should be expected. Its
absence is not evidence it was fabricated.

---

## PHASE 2A — FIX: Double-gate contradiction (must resolve before implementing)

Your design keeps `registration-gate.hook.ts`'s `@BeforeCreate("user")` hook
**unchanged** — still enforcing the old origin-blind rule ("company domain
always requires ACTIVE whitelist, no exceptions") — while the new
`@BeforeHook("/sign-up/email")` becomes context-aware and allows
`CUSTOMER_PORTAL` + company-domain email through.

Trace what actually happens for `customer@kalibrasimedika.co.id` signing up via
`portal.*`:

1. `@BeforeHook` runs first → context-aware → **ALLOWs** it (correct, this is
   the bug-1 fix).
2. Request proceeds to user creation → `@BeforeCreate("user")` backstop runs →
   still origin-blind → sees company domain, no whitelist entry → **REJECTs**
   it.

If both hooks fire in the same request pipeline for `/sign-up/email` (confirm
this — trace it, don't assume), then bug 1 is **not actually fixed**: the
backstop silently reintroduces it. Resolve this one of two ways, whichever
your trace shows is correct for this codebase, and state which you picked and why:

- **Option 1**: Make `@BeforeCreate`'s backstop context-aware too, using the
  same `context` value (if it's derivable at that point — confirm whether
  Better Auth's hook context/headers are accessible from
  `@thallesp/nestjs-better-auth`'s `@BeforeCreate` signature, or whether you'd
  need to pass it through some other mechanism).
- **Option 2**: If `@BeforeHook` reliably runs before `@BeforeCreate` for every
  `/sign-up/email` request and always short-circuits (throws) on reject, then
  narrow `@BeforeCreate`'s job to **only** cover paths that bypass
  `/sign-up/email` entirely (e.g. a hypothetical future OAuth/social sign-up) —
  and make it skip the company-domain-whitelist check when it can detect the
  request already passed through the `@BeforeHook` gate (e.g. a flag/marker),
  or simply confirm no such bypass path currently exists and downgrade
  `@BeforeCreate`'s check to a narrower invariant that doesn't re-reject valid
  `CUSTOMER_PORTAL` signups.

Write and run an integration test that specifically exercises
`customer@kalibrasimedika.co.id` via `portal.*` end-to-end (not just unit-testing
`evaluateRegistration` in isolation) to prove the two hooks don't contradict
each other. This is the single most important test in the whole matrix — it's
the one that silently fails if the double-gate issue isn't actually resolved.

---

## PHASE 2B — CLARIFY: Existing-user collision (still open from last round)

Not addressed in the design doc. Answer before implementing:

1. Does `User.email` have a unique constraint (confirm from actual schema)?
2. If `budi@kalibrasimedika.co.id` registers as a customer via `portal.*` first
   (creating a `User` with zero `UserMembership`), what happens when that same
   person needs to become internal staff later?
   - Does `users.service.ts` support granting `UserMembership` + staff role to
     an **existing** `User` row, without a second `sign-up/email` call?
   - Or would a second signup attempt fail on the unique constraint, with no
     admin path around it today?
3. If no such "upgrade existing user" path exists, propose (design only, don't
   implement in this phase) the smallest addition to `users.service.ts`,
   reusing the existing `isAllowedRegistrationDomain` / whitelist checks — no
   new privilege boundary.
4. State whether the reverse (staff-created `User` later wants a customer
   account under the same email) needs handling, or is out of scope, with
   reasoning.

---

## PHASE 2C — VERIFY: Origin header reliability in the actual deployed path
(still open — the design doc proved *how better-auth's own library code reads
the header*, which is necessary but not sufficient; it did not verify the
*infrastructure* question)

1. Trace the real request path in each environment (local dev, staging,
   production): browser → any reverse proxy / load balancer / CDN in front →
   Next.js `proxy.ts` → NestJS API. Identify every hop between the browser and
   the `@BeforeHook`.
2. Confirm whether `Origin` survives every hop unmodified in production. If
   there's a reverse proxy/CDN/LB in front of the API, check its actual config
   (not assumed defaults) for whether it strips, rewrites, or fails to forward
   the `Origin` header.
3. `proxy.ts` already routes on `Host`, not `Origin`. If there's any
   environment where `Origin` and `Host` could disagree for a legitimate
   request (e.g. `Origin` reflects the browser's tab origin, `Host` reflects
   what the proxy received — these are not always identical, especially for
   API calls made via `fetch()` with explicit base URLs), state which one this
   codebase should standardize on for registration context, and justify it
   from what you actually found in step 1–2, not from a general assumption
   that they're interchangeable.
4. If `Origin` is confirmed reliable end-to-end in all three environments,
   proceed with it as designed. If not, switch `resolveRegistrationContext` to
   read `Host` instead (`ctx.headers.get("host")`) for consistency with
   `proxy.ts`, and confirm `trustedOrigins`/CORS config doesn't depend on
   `Origin` being the discriminator elsewhere in a way that would break.

---

## PHASE 3 — IMPLEMENT (only after 2A, 2B, 2C are resolved and reviewed)

Once 2A is fixed (and proven with the end-to-end test), 2B is answered (and, if
needed, the upgrade-path addition is included in scope), and 2C's header choice
is confirmed, implement per the design doc with these corrections folded in:

1. `resolveRegistrationContext` — as designed, using whichever header 2C
   confirms.
2. `registration-gate.ts` — context-aware `evaluateRegistration`, as designed,
   PLUS whatever 2A's resolution requires so `@BeforeCreate` and `@BeforeHook`
   never contradict each other.
3. New `registration-origin.hook.ts` (`@BeforeHook("/sign-up/email")`) — as
   designed.
4. `hooks: {}` added to `betterAuth(...)` config — as designed.
5. `bootstrap-superadmin.ts` — explicit `Origin`/`Host` header on its
   `signUpEmail` call, matching whichever header 2C settled on — as designed.
6. If 2B requires it: smallest addition to `users.service.ts` for
   upgrade-existing-user-to-staff, reusing the existing domain/whitelist guard.
7. Full test matrix from the design doc, PLUS:
   - The end-to-end double-gate test from 2A.
   - The upgrade-path test from 2B, if implemented.
   - Assert zero `UserMembership` rows created at sign-up for every ALLOW case
     (unchanged invariant).
8. `users.service.ts`'s `INTERNAL_STAFF_DOMAIN_REQUIRED` guard and
   `CompanyRoleGuard` remain the sole privilege-escalation boundary — untouched
   except for the 2B addition if scoped in.
9. Run: `pnpm --filter @medcal/shared test`,
   `pnpm --filter @medcal/api test registration-gate`,
   `pnpm --filter @medcal/api run bootstrap:superadmin -- --email=... --password=...`,
   manual checks on both `apps.localhost` and `portal.localhost`, and
   `pnpm typecheck`.
10. Report back: files changed, full test results (including the 2A
    end-to-end test explicitly called out), and confirmation that
    `CompanyRoleGuard` / the privilege boundary was not weakened.

**DO NOT start Phase 3 (implementation) until 2A, 2B, and 2C are all answered
and I have reviewed them.**
