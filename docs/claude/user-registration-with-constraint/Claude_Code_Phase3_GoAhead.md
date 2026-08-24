# PHASE 3 GO-AHEAD — with conditions

2A, 2B, 2C reviewed and accepted. Proceed with implementation, with these
conditions folded in:

## Condition on 2A (contingency, not just the fix)

Implement the context-aware `@BeforeCreate` fix as you proposed (reading
`context.headers.get("origin")` via the ALS-backed `getCurrentAuthContext()`
accessor, fail-closed to `ORIGIN_NOT_ALLOWED` if that context is ever absent).

Before anything else in Phase 3, run the end-to-end double-gate test first,
in isolation, against a real Postgres instance:
`customer@<company-domain>` via `portal.*` origin → assert a `User` row is
actually created (not just that no error was thrown).

- If it **passes**: continue with the rest of Phase 3 as scoped.
- If it **fails**: stop. Do not attempt an alternative propagation mechanism
  on your own (e.g. don't fall back to a marker flag, a store, or re-deriving
  context some other way) without reporting back first. Report exactly where
  the ALS context was lost (which hop/async boundary) and propose options —
  I'll decide the fallback approach, since it may reopen the store-vs-stateless
  tradeoff from the original audit.

## Note on 2B

No code change required. Separately (not part of this implementation): confirm
whether `assignMembership()` already has an admin-facing UI/API entry point, or
is currently only reachable as a service method — this is informational, not a
blocker, and doesn't need to happen in this phase.

## Note on 2C (infra, not code)

Your finding that (a) the nginx configs are labeled "proposed, not yet
applied" and (b) `portal.*` has no DNS/config in the current approved
production topology is noted and accepted as out of scope for this code
change. Flag it once, plainly, in your final Phase 3 report as an
operational follow-up item — don't let it block or expand this implementation.
The `Origin`-based design is approved regardless of when `portal.*` is
actually provisioned.

## Then proceed with the rest of Phase 3 exactly as scoped previously:
registration-origin.hook.ts, hooks: {} config, bootstrap-superadmin.ts header,
full test matrix (including the double-gate test as the first/gating test),
typecheck, and the final report (files changed, test results, confirmation
CompanyRoleGuard / privilege boundary untouched).
