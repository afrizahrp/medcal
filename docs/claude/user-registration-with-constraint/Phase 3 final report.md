Phase 3 final report
Files changed:

packages/shared/src/utils/index.ts — resolveRegistrationContext(origin).
apps/api/src/modules/whitelist/registration-gate.ts — getRegistrationRejectionReasonForContext; removed the now-dead origin-blind isRegistrationAllowed/getRegistrationRejectionReason exports (nothing called them once both hooks became context-aware).
apps/api/src/modules/whitelist/registration-origin.hook.ts (new) — @BeforeHook("/sign-up/email").
apps/api/src/modules/whitelist/registration-gate.hook.ts — 2A fix: @BeforeCreate("user") is now context-aware too, reading Origin off the second argument (getCurrentAuthContext()'s ALS-backed result, forwarded by @thallesp/nestjs-better-auth) instead of re-applying the old origin-blind rule.
packages/auth/src/index.ts — added hooks: {}.
whitelist.module.ts — registered RegistrationOriginHook.
bootstrap-superadmin.ts — explicit apps.* Origin header, derived from TRUSTED_ORIGINS rather than hardcoded.
registration-gate.integration.test.ts — restructured; the 2A gating test is the first describe block in the file.
chat-socket-auth.precedence.test.ts, chat.gateway.security.test.ts — admin-signup helpers now pass an apps.* Origin header (they create company-domain+whitelisted accounts, which now require it).
Test results (all against real Postgres — reachable in this sandbox once DATABASE_URL was passed explicitly; vitest.setup.ts has a pre-existing import-order bug where its top-level @medcal/auth import is hoisted ahead of its own process.loadEnvFile call, unrelated to this change, not fixed here since it wasn't in scope):

Suite Result
2A gating test (customer@company-domain via portal.*, isolated run first, asserts a real User row) PASS — proves the ALS context does survive into databaseHooks.create.before, confirming the static analysis from the review
Full registration-gate.integration.test.ts (16 tests) 16 passed
whitelist.service.test.ts + chat-socket-auth.precedence.test.ts 8 passed
chat.gateway.security.test.ts (22 tests) 21 passed, 1 failed — a 5s-timeout WebSocket room-isolation test; reproduced identically on unmodified main (verified via git stash), so pre-existing/environment-flaky, not caused by this change
@medcal/shared (21 tests, incl. resolveRegistrationContext) 21 passed
pnpm typecheck — shared, auth, api clean
bootstrap-superadmin.ts Refused to run past its pre-existing "SUPERADMIN already exists" guard (this dev DB already has one for COMPANY_ID=PKM) — didn't touch that data. Verified separately: the appsOrigin derivation resolves correctly against the real .env (http://apps.localhost:3003), and the identical signUpEmail({ headers: Origin }) call shape is already proven by the passing integration tests.
Privilege boundary confirmation: users.service.ts's INTERNAL_STAFF_DOMAIN_REQUIRED guard and CompanyRoleGuard were not touched. Both registration hooks still only ever create a bare User row (zero UserMembership) — asserted explicitly in the gating test and the "allows external Gmail" test.

Operational follow-up flagged once, as agreed (2C, out of scope for this change): portal.kalibrasimedika.co.id has no DNS/nginx config in the currently-approved production topology, and the nginx configs I reviewed are labeled "proposed, not yet applied." The Origin-based design works regardless of when that's provisioned, but the CUSTOMER_PORTAL path can't be exercised against real production traffic until it is.
