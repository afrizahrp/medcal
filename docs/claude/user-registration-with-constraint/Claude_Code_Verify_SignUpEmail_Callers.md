# PHASE 3 FOLLOW-UP — Verify all signUpEmail callers, then add a regression guard

## Step 1 — Full-tree audit (read-only)

Run and paste the raw output — don't summarize it away:

```
grep -rn "signUpEmail" --include="*.ts" --include="*.tsx" .
```

Also check for any indirect call paths that might not literally say
`signUpEmail` (e.g. a wrapper function, a fixture factory used across tests,
a seed script that calls a shared helper):

```
grep -rln "sign-up/email" --include="*.ts" .
grep -rn "authClient.signUp" --include="*.ts" --include="*.tsx" .
```

## Step 2 — Classify every result

For each call site found, state explicitly:

1. File + line.
2. Does it ever get called with a company-domain email (`@kalibrasimedika.co.id`)?
   - If yes: does it already pass an explicit `Origin`/`headers` argument that
     resolves to `INTERNAL_STAFF` context? Quote the exact header value used.
   - If no (only ever non-company-domain emails, e.g. test fixtures using
     `@example.com`/`@test.com`): confirm this explicitly — don't assume from
     the file name, check the actual email string(s) used.
3. If a company-domain call site is found WITHOUT the required Origin header,
   that's a live bug this change introduced — fix it as part of this task
   (add the header), not as a separate follow-up.

Produce a table: file | company-domain email used? | Origin header present? | action taken.

## Step 3 — Turn this into a regression guard, not a one-time check

A manual grep today doesn't stop someone adding a new `signUpEmail` call site
six months from now without the header, silently reintroducing the fail-closed
rejection bug for that one path. Add one of the following (pick whichever is
cheaper to maintain in this codebase, state which and why):

- **Option A (preferred if feasible quickly):** a single integration test that
  enumerates every known call site's expected behavior in one place — e.g. a
  small table-driven test asserting that every helper/fixture in the repo
  that creates a company-domain user via `signUpEmail` succeeds only when
  the Origin header is present, and fails closed when it's stripped. This
  turns "did we remember to update every caller" into something CI actually
  checks going forward.
- **Option B:** a lightweight custom lint rule / grep-based CI check (e.g. a
  small script run in CI) that fails the build if `signUpEmail` or
  `authClient.signUp` is called anywhere without an accompanying
  Origin-resolution call nearby — even a naive heuristic here is better than
  nothing, since the failure mode (silent fail-closed rejection) is easy to
  miss in review.
- If neither is practical right now, say so explicitly and propose what
  documentation/comment should go directly above `resolveRegistrationContext`
  and `getRegistrationRejectionReasonForContext` warning future callers of
  `signUpEmail` about this requirement, as a lower bar than an automated guard.

## Step 4 — Report

Summarize: full call-site table from Step 2, what was fixed (if anything),
and which guard-rail option from Step 3 was implemented (or why none was),
with a pointer to the new test/CI check if one was added.
