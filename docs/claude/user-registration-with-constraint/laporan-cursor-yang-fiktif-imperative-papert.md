# Origin-Aware Registration Policy (Staff vs Customer)

## Context

The business requires two different registration policies on the same shared Better Auth instance:

- **Internal Staff** (`apps.kalibrasimedika.co.id`): email must be `@kalibrasimedika.co.id` **and** have an ACTIVE `EmailWhitelist` entry. Any other domain must be rejected at sign-up.
- **Customer Portal** (`portal.kalibrasimedika.co.id`): any email domain is allowed, **including** `@kalibrasimedika.co.id` — whitelist must never apply here.

A prior Cursor agent produced an "implementation report" claiming this was already built via an Origin→`RegistrationContext`→store→hook pipeline (`registration-context.ts/.store.ts/.hook.ts`). That report is fictional relative to this repository: the code was written and then modified further while the user had only asked for a read-only *audit*, and the user rolled all of it back. Verified via `git log --all` on every claimed file/path and a full-tree `grep` — none of it exists in history, on `main`, or on the other local worktree branch.

**What actually exists today** (`apps/api/src/modules/whitelist/registration-gate.ts` + `registration-gate.hook.ts`, wired via `@BeforeCreate("user")` into `packages/auth/src/index.ts`'s `databaseHooks`) is a single **global, Origin-blind** rule:

- company domain → require ACTIVE whitelist, else reject
- any other domain → always allow, no whitelist check

This has two concrete bugs relative to the business requirement:
1. A **real customer** registering via `portal.*` with a `@kalibrasimedika.co.id` email is wrongly **rejected** (`NOT_WHITELISTED`) — the whitelist check fires unconditionally regardless of which portal the signup came through.
2. A **non-company-domain visitor** registering via `apps.*` (e.g. `attacker@gmail.com`) is wrongly **allowed** to create a `User` row — harmless for privilege (no `UserMembership`/role is ever attached at sign-up; `users.service.ts`'s `INTERNAL_STAFF_DOMAIN_REQUIRED` guard independently blocks any later role grant to a non-company-domain user), but doesn't match the stated "reject at registration" requirement for the staff entry point.

The fix is to make the registration gate **Origin-aware**, without reintroducing any of the rolled-back store/hook machinery. `UserMembership.role` remains the actual privilege boundary and is untouched by this change.

## Technical approach (verified against installed packages, not assumed)

`@thallesp/nestjs-better-auth@2.7.0` provides `@Hook()` + `@BeforeHook(path)`, which wires directly into Better Auth's own `hooks.before` (`createAuthMiddleware`) — this fires **before** the route handler processes the request, with access to Better Auth's own middleware `ctx` object: `ctx.path`, `ctx.body` (parsed request body — `email`, `password`, `name` for `/sign-up/email`), and `ctx.headers` (a `Headers` instance — confirmed by grepping `better-auth`'s own `origin-check.mjs`, which reads `headers.get("origin")` the same way, and `session-store.mjs`, which reads `ctx.headers?.get("cookie")`).

This means the **entire Origin+domain+whitelist decision can be made in one place, in one synchronous pass, with no store, no second hook, and no cross-hook state**:

```
@Hook()
class RegistrationOriginHook {
  @BeforeHook("/sign-up/email")
  async beforeSignUp(ctx) {
    const origin = ctx.headers?.get("origin") ?? "";
    const email = ctx.body?.email ?? "";
    const context = resolveRegistrationContext(origin); // "INTERNAL_STAFF" | "CUSTOMER_PORTAL" | null
    const reason = await getRegistrationRejectionReason(email, context);
    if (reason) throw new APIError("FORBIDDEN", { code: `REGISTRATION_${reason}`, message: ... });
  }
}
```

This requires `hooks: {}` to be added to `packages/auth/src/index.ts`'s `betterAuth(...)` config (parallel to the existing `databaseHooks: {}`, which the library already requires for `@DatabaseHook`/`@BeforeCreate` — confirmed in `AuthModule.onModuleInit`, which throws `"Detected @Hook providers but Better Auth 'hooks' are not configured"` if omitted).

The existing `@BeforeCreate("user")` hook in `registration-gate.hook.ts` (wired via `databaseHooks`) is kept **unchanged**, as a defense-in-depth backstop for any future non-`/sign-up/email` path that creates a `User` (e.g. an OAuth/social sign-up added later) — it still enforces the origin-blind "company domain requires whitelist" rule, same as today. The new `@BeforeHook` is the one that becomes Origin/context-aware; it runs earlier and will catch the two bug scenarios before the `@BeforeCreate` hook is even reached.

## Files to change

- **`packages/shared/src/utils/index.ts`** (or a new small file re-exported from here) — add `resolveRegistrationContext(origin: string): "INTERNAL_STAFF" | "CUSTOMER_PORTAL" | null`, a pure function matching `apps.*`/`http://apps.localhost:*` → `INTERNAL_STAFF`, `portal.*`/`http://portal.localhost:*` → `CUSTOMER_PORTAL`, else `null`. Include a `DEV_DEFAULT_HOST_GROUP`-style dev fallback consistent with `apps/portal/src/proxy.ts`'s existing `management`/`client` fallback logic, so local dev without subdomains still works. No store, no class, just a function — reuses the existing `COMPANY_EMAIL_DOMAIN`/`isAllowedRegistrationDomain` helpers already in this file.
- **`apps/api/src/modules/whitelist/registration-gate.ts`** — extend `evaluateRegistration`/`getRegistrationRejectionReason`/`isRegistrationAllowed` to accept a `context: "INTERNAL_STAFF" | "CUSTOMER_PORTAL" | null` parameter:
  - `context === "CUSTOMER_PORTAL"` → always allow (skip whitelist, even for company domain) — fixes bug 1.
  - `context === "INTERNAL_STAFF"` → non-company domain rejects immediately (`INVALID_DOMAIN`); company domain still requires ACTIVE whitelist — fixes bug 2.
  - `context === null` (unrecognized/missing Origin) → reject fail-closed with a distinct reason (`ORIGIN_NOT_ALLOWED`), matching the precedent named in the (fictional) report but implemented as a plain branch, not a stored state.
  - Keep the existing exported signatures usable with `context` optional/defaulted, since `registration-gate.hook.ts`'s `@BeforeCreate("user")` backstop has no reliable Origin and should keep doing the origin-blind company-domain+whitelist check it does today (pass `context: null` is wrong here — instead keep a separate origin-blind path or default context to "unknown but still enforce base whitelist rule"; the two callers have different needs, so the cleanest shape is two thin functions sharing one internal `evaluateDomainWhitelist(email)` helper, with the new context-aware wrapper only used by the new `@BeforeHook`).
- **`apps/api/src/modules/whitelist/registration-gate.hook.ts`** — unchanged (still the origin-blind `@BeforeCreate("user")` backstop).
- **New file** `apps/api/src/modules/whitelist/registration-origin.hook.ts` — the `@Hook()` / `@BeforeHook("/sign-up/email")` class described above.
- **`apps/api/src/modules/whitelist/whitelist.module.ts`** — register the new hook class as a provider (same pattern as `RegistrationGateHook` today).
- **`packages/auth/src/index.ts`** — add `hooks: {}` to the `betterAuth(...)` call.
- **`apps/api/src/modules/whitelist/registration-gate.integration.test.ts`** — extend with the Origin-aware matrix (see below), including a request built with an `Origin` header via `auth.api.signUpEmail({ body, headers })` or equivalent test harness call the existing tests already use for `TRUSTED_ORIGINS`-scoped calls.
- **`apps/api/src/bootstrap-superadmin.ts`** — its `auth.api.signUpEmail(...)` call must pass an explicit `Origin: http://apps.localhost:3003` header (prod: the real `apps.*` origin) so the bootstrap script goes through the same `INTERNAL_STAFF` path as a real staff signup, rather than being special-cased in the gate. Decided explicitly with the user rather than defaulting missing-Origin callers to staff context, to keep the fail-closed guarantee intact for every other unrecognized-Origin caller.
- **No other file** needs to change — `users.service.ts`, `whitelist.service.ts`, `company-role.guard.ts`, `proxy.ts`, the register page UI, and the database schema are all untouched.

## Test matrix to add

| Origin | Email | Whitelist | Expected |
|---|---|---|---|
| `apps.*` | `staff@kalibrasimedika.co.id` | ACTIVE | ALLOW |
| `apps.*` | `staff@gmail.com` | — | REJECT `INVALID_DOMAIN` (bug 2 fix) |
| `apps.*` | `staff@kalibrasimedika.co.id` | none | REJECT `NOT_WHITELISTED` |
| `portal.*` | `customer@gmail.com` | — | ALLOW |
| `portal.*` | `user@kalibrasimedika.co.id` | none | ALLOW (bug 1 fix — the regression test that would fail against today's code) |
| unrecognized/missing Origin | any | — | REJECT `ORIGIN_NOT_ALLOWED` |
| `apps.*` + spoofed request body claiming `portal` context | `staff@gmail.com` | — | REJECT (body field, if any, must be ignored — context comes only from `ctx.headers`) |

Also assert, for at least one allowed case per context, that zero `UserMembership` rows are created at sign-up (unchanged invariant).

## Verification

- `pnpm --filter @medcal/shared test` — new `resolveRegistrationContext` unit tests.
- `pnpm --filter @medcal/api test registration-gate` — extended integration matrix above (real Postgres, same pattern as existing tests — no mocking).
- `pnpm --filter @medcal/api run bootstrap:superadmin -- --email=... --password=...` sanity check still works after adding the explicit `Origin: http://apps.localhost:3003` header to its `signUpEmail` call.
- Manual: `http://apps.localhost:3003/sign-in/register` and `http://portal.localhost:3003/sign-in/register` against the local dev stack, confirming the two bug scenarios are fixed and the previously-passing cases still pass.
- `pnpm typecheck` across `shared`, `api`, `auth`.
