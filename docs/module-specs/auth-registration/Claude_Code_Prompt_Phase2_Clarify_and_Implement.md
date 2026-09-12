# PHASE 2 PROMPT — CLARIFICATION, VERIFICATION, THEN IMPLEMENTATION
## Follow-up to: Architecture Review — Staff Auth vs Customer Portal

**CONTEXT**

The previous architecture audit (audit-result.md) is accepted as the basis for implementation, with recommendation **Option B**: no separate context-store/hook subsystem, registration policy read directly from a trusted request signal inside the existing `registration-gate.ts`.

Note: the "Cursor Implementation Report" referenced in the original audit prompt described an experiment that was made **only in the working directory and never committed** — it was fully discarded before any commit. Do not spend time searching git history for it; there is nothing there. Do not treat its absence as evidence the report was fabricated — it simply was never persisted.

Before implementing, you must close three specific gaps below. **Do not implement Phase 4 until Phases 2 and 3 are answered and I have reviewed them.**

---

## PHASE 2 — CLARIFY: Existing-user collision (staff ⇄ customer)

Business context (confirmed):

```text
apps.kalibrasimedika.co.id    = Internal Staff application
portal.kalibrasimedika.co.id  = Customer Portal application
```

Once Option B's fix is applied, a company-domain email (`@kalibrasimedika.co.id`) will be allowed to register as a **customer** via `portal.*` without a whitelist check. This creates a scenario that could not previously occur (today's global rule always rejects company-domain emails on ambiguous paths), so it needs an explicit answer:

1. If `budi@kalibrasimedika.co.id` registers first as a customer via `portal.*` (creating a `User` row with zero `UserMembership`), what happens when that same email is later meant to become internal staff?
   - Does Better Auth's `email` field have a unique constraint at the `User` level? Confirm from the actual schema.
   - Does `users.service.ts` (or any admin flow) currently support **granting `UserMembership` + staff role to an existing `User` row**, without going through `sign-up/email` again?
   - Or does the current design assume staff *must* go through `sign-up/email`, which would now fail with "email already exists" for anyone who registered as a customer first?
2. Trace and report the exact current behavior (not assumed) — attempt this read-only, either via code trace or an actual test in a local/dev environment, whichever is faster and safe.
3. If no "upgrade existing user to staff" path exists today, this is a **missing requirement**, not just an edge case. Propose (but do not implement yet) the smallest addition to `users.service.ts` that would let an admin attach `UserMembership` + role to an existing `User` row, still gated by the existing `isAllowedRegistrationDomain` / `INTERNAL_STAFF_DOMAIN_REQUIRED` check — no new privilege boundary, reuse the existing one.
4. Also confirm: is the reverse case possible/relevant? (Staff-created `User` later wants a customer-portal account — same email, different context.) State whether this needs handling or is out of scope, with reasoning.

Output this as a short written finding — current behavior, gap (if any), and proposed fix at the design level only.

---

## PHASE 3 — VERIFY: Host vs Origin consistency

The implementation plan proposes reading `Origin` (or `Host`) inside `registration-gate.hook.ts` to determine staff-vs-customer context. Meanwhile, `apps/portal/src/proxy.ts` already does its routing based on the **Host** header (`apps.*` → `/management`, `portal.*` → `/client`).

1. Confirm exactly which header(s) reach the NestJS API backend in each environment (local dev, staging, production) — trace the actual request path: browser → any reverse proxy / load balancer / CDN in front → Next.js `proxy.ts` → API.
2. Determine whether `Origin` and `Host` are guaranteed to agree for every legitimate request in this setup, or whether there's any hop (e.g. a proxy that rewrites one but not the other) where they could diverge.
3. **Decision rule to apply:** use the **same header `proxy.ts` already uses for routing** (i.e. `Host`) as the signal for `registration-gate.ts`'s context, unless you find a concrete reason `Origin` is more reliable in this codebase's actual request path. Justify whichever you pick with what you found in step 1–2, not from general assumptions about Better Auth or NestJS.
4. Confirm how this header will be reliably read inside `@BeforeCreate("user")`'s hook given `@thallesp/nestjs-better-auth`'s hook signature — this was flagged as an open question in the prior audit (Phase 1) and must be resolved with an actual working read, not just a plan, before Phase 4 starts.

---

## PHASE 4 — IMPLEMENT (only after Phase 2 and 3 findings are reviewed and approved)

Once I've reviewed and approved your Phase 2/3 findings, implement per the audit's Option B recommendation:

1. Extend `evaluateRegistration(email, context)` in `registration-gate.ts` to accept a `context: "INTERNAL_STAFF" | "CUSTOMER_PORTAL"` parameter, derived from the header determined in Phase 3 — no `AsyncLocalStorage`, no email-keyed store, no separate context module. Read the header synchronously at the point the hook fires.
2. Registration policy:
   - Company-domain + `INTERNAL_STAFF` → require `EmailWhitelist.status === ACTIVE` (unchanged rule, now correctly scoped).
   - Company-domain + `CUSTOMER_PORTAL` → **ALLOW** (this is the actual bug fix).
   - Any domain + `CUSTOMER_PORTAL` → ALLOW, unchanged.
   - Non-company-domain + `INTERNAL_STAFF` → REJECT (fixes the current bug where it wrongly creates a User row).
   - Missing/unrecognized context → REJECT (fail-closed), with a clear error code.
3. If Phase 2 found a missing "upgrade existing user to staff" path, implement the smallest version of it in `users.service.ts` now, reusing the existing domain guard — do not invent a new privilege boundary.
4. Leave `users.service.ts`'s `INTERNAL_STAFF_DOMAIN_REQUIRED` guard and `CompanyRoleGuard` untouched — they remain the sole privilege-escalation boundary.
5. No database schema changes unless Phase 2 explicitly requires one for the upgrade path (e.g. nothing beyond a new `UserMembership` row via the existing table).
6. Update/extend `registration-gate.integration.test.ts` with the full matrix below, plus a test for the Phase 2 upgrade path if implemented:

| Entry Point (context) | Email | Whitelist | Expected |
|---|---|---|---|
| INTERNAL_STAFF | staff@kalibrasimedika.co.id | ACTIVE | ALLOW |
| INTERNAL_STAFF | staff@gmail.com | N/A | REJECT |
| INTERNAL_STAFF | staff@othercompany.com | N/A | REJECT |
| INTERNAL_STAFF | staff@kalibrasimedika.co.id | NONE | REJECT |
| CUSTOMER_PORTAL | customer@gmail.com | N/A | ALLOW |
| CUSTOMER_PORTAL | customer@othercompany.com | N/A | ALLOW |
| CUSTOMER_PORTAL | user@kalibrasimedika.co.id | NONE | ALLOW (regression test — this is the bug fix) |
| (missing/unrecognized context) | any | any | REJECT |

Also add: direct API call with spoofed header (assert it can still only ever create a zero-membership `User`, never a role); manipulated body field claiming a context (must be ignored — context is derived from the header only, never trusted from body).

7. Report back with: files changed, test results, and confirmation that `users.service.ts` / `CompanyRoleGuard` were not modified (unless Phase 2 required the upgrade-path addition, in which case describe exactly what changed and why it doesn't introduce a new privilege path).

**DO NOT start Phase 4 until Phase 2 and Phase 3 findings have been presented and explicitly approved.**
