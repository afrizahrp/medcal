1. Executive Verdict
   The Cursor "implementation report" describes code that does not exist in this repository. I verified via git log across all files/branches/history and grep across the full tree: there is no registration-context.ts, .store.ts, .hook.ts, no Origin→context resolution, no per-hostname copy on the register page, and registration-gate.ts has never had a context parameter in its history. Either the report describes unmerged/reverted work, or it describes a plan that was never actually applied. Treat the entire "Cursor Implementation Report" as aspirational, not as current state.

What actually exists today is much simpler than either prompt assumes: one global, context-blind registration rule (company domain → requires whitelist; every other domain → unrestricted), and a completely separate, domain-gated authorization step (membership/role assignment) that already does most of the job the prompts are asking for.

Recommendation: Option B — separate entry points (already structurally present via apps/portal/src/proxy.ts's host-based rewrite), shared Better Auth, and registration policy enforced by pushing Origin through the existing NestJS request pipeline as a real HTTP request property — not by resurrecting the Origin→email-keyed-context-store machinery. No database change required.

2. Current Architecture (verified against actual code)

Browser
↓
apps.kalibrasimedika.co.id OR portal.kalibrasimedika.co.id
↓
apps/portal (ONE Next.js app) — proxy.ts rewrites by Host prefix
→ apps.* → /management/*
→ portal.* → /client/*
→ /sign-in, /sign-in/register → EXCLUDED from rewrite (shared, host-agnostic page)
↓
authClient.signUp.email() → POST /api/auth/sign-up/email (apps/api, single endpoint)
↓
Better Auth (packages/auth/src/index.ts) — trustedOrigins validated, requireEmailVerification: false
↓
databaseHooks.user.create.before → RegistrationGateHook (apps/api/.../registration-gate.hook.ts)
↓
registration-gate.ts: evaluateRegistration(email)

- domain === kalibrasimedika.co.id → require EmailWhitelist.status === ACTIVE, else REJECT
- any other domain → ALLOW, no whitelist check
  ↓
  User row created — ZERO UserMembership rows (confirmed by registration-gate.integration.test.ts)
  ↓
  [separate, later step] Admin assigns UserMembership + role (users.service.ts)
- role !== "CUSTOMER" && email domain !== company domain → THROW INTERNAL_STAFF_DOMAIN_REQUIRED
  ↓
  CompanyRoleGuard (apps/api/.../company-role.guard.ts) — session + ACTIVE membership + permission catalog
  Key facts:

Registration and authorization are already decoupled in this codebase. Sign-up only ever creates a User; membership/role is a distinct, admin-driven, already domain-gated step.
There is no Origin/hostname signal read anywhere in the registration path today. The single registration-gate.ts rule applies identically regardless of which subdomain the request came from.
apps/portal/src/proxy.ts already does hostname→route-group rewriting (apps.* → /management, portal.* → /client) — but it explicitly excludes /sign-in* from that rewrite, so both hostnames currently render the exact same register page/component (apps/portal/src/app/sign-in/register/page.tsx), with no copy difference, no context-awareness.
TRUSTED_ORIGINS in .env/.env.production.example already enumerates apps._, portal._ (and technician.* in prod) explicitly, and COOKIE_DOMAIN=".kalibrasimedika.co.id" in prod shares the session cookie across all subdomains — this is the existing "shared Better Auth core" the prompts want. 3. Problems With Current Architecture
Today's single global rule does not implement the stated business requirement at all:

Scenario Business requirement What the current code actually does
Customer registers via portal.* with @kalibrasimedika.co.id ALLOW REJECT (NOT_WHITELISTED) unless whitelisted — bug
Staff registers via apps.* with staff@gmail.com REJECT ALLOW (a User row is created, just with no membership) — bug relative to the "reject at registration" framing, though harmless for privilege since no role is ever attached
So the real problem isn't "too much accidental complexity from forcing two policies through one page" (that's the Cursor report's problem, which isn't in this repo) — the real problem is the one rule that exists is domain-blind to context and actively violates half the stated requirements. There is currently zero unnecessary machinery to remove; there is a missing discriminator to add.

4. Security Analysis
   Origin as a security boundary — verdict: acceptable for registration policy, unacceptable for authorization.

Better Auth already validates Origin against trustedOrigins before any handler runs — a request with a non-whitelisted/spoofed Origin is rejected by Better Auth itself, not by application code. So "Origin is spoofable" is true only in the sense that an attacker can send Origin: https://apps.kalibrasimedika.co.id from curl — Better Auth will accept that as long as the value matches a trusted origin string, regardless of who's actually sending it.
Consequence: anyone can curl sign-up/email with Origin: https://apps.kalibrasimedika.co.id and a gmail.com address. If registration policy alone decided staff-vs-customer, that request would be evaluated as "staff intent" and correctly rejected on domain grounds (good) — but if it used a whitelisted company-domain email, it would be evaluated as staff and allowed through, same as going through the real UI. This is not a privilege escalation — it still only creates a User row with zero membership/role.
The actual privilege boundary is, and should remain, UserMembership.role. That is assigned only by an authenticated admin action (users.service.ts), already re-checks isAllowedRegistrationDomain independently of whatever happened at sign-up, and is protected by CompanyRoleGuard (session + ACTIVE membership + permission catalog). No sign-up-time signal (Origin, context, form field) can ever grant a role. This is the correct authorization boundary regardless of what registration policy does.
Threat scenarios:

Scenario 1 (customer, gmail, via portal) → ALLOW. ✅ matches today's code path (external domain, no whitelist check).
Scenario 2 (attacker@gmail.com via apps.*) → today: ALLOWED to create a User, but this is not "internal access" — no membership, INTERNAL_STAFF_DOMAIN_REQUIRED blocks any future role grant. Still, this doesn't match the stated requirement ("REJECT" at registration), which is the gap to fix.
Scenario 3 (direct API call, spoofed Origin/Host/body/context) → cannot obtain a role or internal membership under any design, because that boundary is enforced independently at membership-assignment time and never trusts sign-up-time signals. Account creation (a User row with no privileges) is a materially different, much lower-severity outcome than privilege escalation — the two must not be conflated in the writeup, matching Section 8's instruction.
Scenario 4 (customer registers with company-domain email via portal) → today: REJECTED (bug). Must become ALLOW once Origin-aware policy exists.
Scenario 5 (customer → staff via membership/role/invite/email-change/account-linking/admin action) → the only path is the admin-driven users.service.ts assignment flow, which already independently re-validates isAllowedRegistrationDomain at assignment time — so even if a customer's email were later changed or an admin acted carelessly, granting a non-CUSTOMER role to a non-company-domain user throws INTERNAL_STAFF_DOMAIN_REQUIRED. This is correctly defense-in-depth and doesn't depend on registration-time context at all. 5. Architecture Options
Option Security Complexity Maintainability Scalability Recommendation
A — Origin→RegistrationContext machinery (as described in the report) Adequate but adds a spoofable signal into a new stateful store keyed by email (race/retry/multi-instance risk) for no security benefit over B High — 5 new/changed files, context store, double-check Poor — six new concepts a new developer must learn to answer "why does staff reject gmail" Poor — a 3rd/4th context multiplies the same machinery Do not build (matches nothing in the actual repo anyway)
B — Read Origin/Host directly in the existing gate, no context store Equal to A, without the stateful stash Low — one new parameter threaded through 2 existing files High — policy lives exactly where the rest of registration policy already lives Good — new contexts are new if branches, not new subsystems Recommended
C — Separate /staff-sign-up / /customer-sign-up endpoints No security benefit over B; Better Auth's sign-up route isn't designed to be duplicated cleanly Higher — duplicated Better Auth wiring or custom routing in front of it Worse — two endpoints to keep behaviorally identical for password/verification/reset Poor Not justified
D — Signed invitation/token for staff registration Strongest, but changes the business process (self-serve staff signup) which isn't what's requested Adds token issuance/verification lifecycle Only worth it if staff onboarding becomes invite-only Neutral Future hardening, not now 6. Recommended Architecture
Do not resurrect the Origin→RegistrationContext→store→hook pipeline. Instead:

Keep one Better Auth endpoint, one User/Account/Session/password/verification/reset implementation — already true and correct.
Keep apps.* / portal.* as the entry points — already true via proxy.ts and TRUSTED_ORIGINS.
Read the request's Origin (or Host) header directly inside registration-gate.hook.ts, where NestJS already gives you the raw request, and pass it as a plain parameter into registration-gate.ts's existing evaluateRegistration(email, context) — no AsyncLocalStorage, no email-keyed store, no second lookup. Better Auth's BeforeCreate("user") hook in this codebase's @thallesp/nestjs-better-auth integration receives the created-user payload; the Origin header must be read from the enclosing request at the point the hook fires. (This needs verifying whether NestJS's request-scoped DI or an interceptor is required to make the header available inside the hook — this is the one piece of the current architecture worth double-checking before implementation, since it's exactly the problem the original report says it hit with ALS.) If request-scoped access to headers proves awkward inside @BeforeCreate, the safe fallback is validating Origin before calling auth.api.signUpEmail (e.g., in a thin NestJS controller/middleware in front of Better Auth) rather than inside the DB hook — still no context store.
Un-restrict company-domain email on the Customer entry point — this is the one behavior change actually required to satisfy the stated business rule, and it's a one-line branch, not new infrastructure.
Leave users.service.ts's INTERNAL_STAFF_DOMAIN_REQUIRED guard exactly as-is — it's the real privilege boundary and needs no changes.
Answering Section 16's 12 questions directly:

Separate pages? Not required to change — they're already served from apps._/portal._, just currently identical in content; adding host-aware copy (as the phantom report claimed to do) is cosmetic and optional.
Separate routes? No — same /sign-up/email.
Different hostnames? Already true (apps._/portal._), no change.
One Better Auth instance? Yes, unchanged.
Shared Better Auth endpoint? Yes, unchanged.
Registration endpoints separated? No.
EmailWhitelist enforced? At the registration gate, company-domain-only, unchanged — but now scoped so it never fires for customer-portal-context requests with a company-domain email.
Staff authorization enforced? At membership/role assignment (users.service.ts), unchanged — already correct.
Customer authorization enforced? Implicitly — CUSTOMER role is exempt from the domain check, unchanged.
Is Origin→RegistrationContext still necessary as a store/hook subsystem? No — a plain function parameter suffices.
Is registration-context.store necessary? No such file exists; do not create it.
Database schema change? None required. 7. Target Architecture Diagram

                         SHARED AUTH CORE
                            Better Auth
                     (packages/auth/src/index.ts)
                                 │
                  ┌──────────────┴──────────────┐
                  │                             │
           apps.kalibrasi...             portal.kalibrasi...
           (TRUSTED_ORIGINS)              (TRUSTED_ORIGINS)
                  │                             │
        Sign-up/email (Origin read          Sign-up/email (Origin read
        in registration-gate.hook.ts)       in registration-gate.hook.ts)
                  │                             │
        registration-gate.ts:               registration-gate.ts:
        domain === company                  domain === company
          → require EmailWhitelist ACTIVE      → ALLOW unconditionally
        domain !== company → REJECT          domain !== company → ALLOW
                  │                             │
                  └──────────────┬──────────────┘
                                 │
                            User (no role yet)
                                 │
                 users.service.ts: assign UserMembership + role
                 (INTERNAL_STAFF_DOMAIN_REQUIRED re-check — unchanged)
                                 │
                          CompanyRoleGuard
                     (session + membership + permission)

8. Existing "Cursor Changes" — KEEP/SIMPLIFY/REPLACE/REMOVE
None of these files exist in the repository, so there is nothing to act on. For the record, evaluating the design as described in the report:

Component (as described, not found in repo) Verdict
registration-context.ts (Origin→context resolver, pure function) KEEP the idea, REPLACE the location — fold into registration-gate.ts as a parameter, don't ship a separate module.
registration-context.store.ts (email-keyed stash surviving Better Auth's transaction) REMOVE the idea entirely. Confirmed root cause it was working around (ALS not propagating through Better Auth's runWithTransaction) is real, but the fix is to read the header earlier/synchronously, not to introduce a global mutable store keyed by unconfirmed email — exactly the concurrency/retry/multi-instance risk Section 11 of the prompt asks about, and correctly so.
registration-context.hook.ts REMOVE — folded into existing registration-gate.hook.ts.
registration-gate.ts context-awareness KEEP as a plan, implement fresh — this file already exists and is the right place for the new context/Origin parameter.
registration-gate.hook.ts origin check KEEP as a plan, implement fresh — same file, add Origin extraction. 9. Implementation Plan (NOT executed)
Phase 1 — Preparation

Confirm the exact mechanism to read the incoming Origin/Host header inside @BeforeCreate("user") given @thallesp/nestjs-better-auth's hook signature — this is the one open technical question (the report's ALS problem was real; verify whether NestJS REQUEST-scoped injection or a Better Auth before hook on signUpEmail itself is the cleaner fix).
Confirm production TRUSTED_ORIGINS list is authoritative for the apps/portal/technician split (already is, per .env.production.example).
Phase 2 — Authentication Entry Points

No route changes required. Optional: add host-aware copy to apps/portal/src/app/sign-in/register/page.tsx (cosmetic only, not a security control).
Phase 3 — Registration Policy

Extend evaluateRegistration in registration-gate.ts to accept a context: "INTERNAL_STAFF" | "CUSTOMER_PORTAL" (or raw Origin string) parameter.
Company-domain + INTERNAL_STAFF → require whitelist (unchanged rule, now scoped).
Company-domain + CUSTOMER_PORTAL → ALLOW (the actual behavior fix).
Any domain + missing/unrecognized context → decide fail-open-as-customer vs fail-closed; recommend fail-closed with a clear error code, matching the report's REGISTRATION_ORIGIN_NOT_ALLOWED precedent conceptually (but implemented without a store).
Phase 4 — Better Auth

No config changes to betterAuth() itself; databaseHooks: {} stays as-is (already required scaffolding).
Phase 5 — Remove/Simplify Context Machinery

N/A — nothing to remove, it was never added.
Phase 6 — Authorization

No changes — users.service.ts domain guard already correct and independent.
Phase 7 — Testing

Extend registration-gate.integration.test.ts with the Origin-aware matrix (Section 19 below).
Add a test asserting customer-portal + company-domain email is now ALLOWED (currently would fail against today's code — this is the regression test proving the bug fix).
Phase 8 — Manual Verification

http://apps.localhost:3003/sign-in/register: gmail → reject; company domain, no whitelist → reject; company domain, whitelisted → allow.
http://portal.localhost:3003/sign-in/register: gmail → allow; company domain, no whitelist → allow (currently broken). 10. Test Plan / Matrix
Entry Point (Origin) Email Whitelist Expected Current code result
apps.* staff@kalibrasimedika.co.id ACTIVE ALLOW ALLOW ✅
apps.* staff@gmail.com N/A REJECT ALLOW ❌ (needs Origin-awareness)
apps.* staff@othercompany.com N/A REJECT ALLOW ❌
apps.* staff@kalibrasimedika.co.id NONE REJECT REJECT ✅
portal.* customer@gmail.com N/A ALLOW ALLOW ✅
portal.* customer@othercompany.com N/A ALLOW ALLOW ✅
portal.* user@kalibrasimedika.co.id NONE ALLOW REJECT ❌ (the core bug)
Additional cases: direct API call with spoofed Origin (still only yields a User, never a role — assert zero UserMembership rows); manipulated registrationContext body field (must be ignored — server derives context from Origin only, never trusts body); concurrent registration (no shared mutable store, so no race condition to test against by design); multi-instance (stateless per-request Origin read, no cross-instance state needed).

11. Final Architecture Decision

ARCHITECTURE DECISION:
Keep apps._/portal._ as shared-Better-Auth entry points with registration policy read directly from the trusted Origin header inside the existing registration-gate (no separate context-store/hook subsystem), and fix the one real bug — that today's single global rule wrongly blocks customer-portal signups using a company-domain email and wrongly allows non-company-domain staff signups to create a User at all — while leaving the already-correct, domain-gated membership/role assignment in users.service.ts as the sole privilege-escalation boundary, untouched.
No code was modified. Awaiting your approval before implementing.
