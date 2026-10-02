# Customer Feedback POST — Security Verification Audit

Status: read-only audit; this file is the only change made by this task.
Subject: `POST /customer/work-orders/:id/feedback` (first browser-originated mutation in the Customer Portal).
Companion: `docs/audits/customer-feedback-work-order-lifecycle-audit.md` (lifecycle/data-model; not repeated here).

Installed versions inspected: `better-auth` 1.6.27, `@thallesp/nestjs-better-auth` 2.7.0, `zod` ^3.24.2, Nest on the Express adapter.
Library paths below are inside `node_modules/.pnpm/…` (abbreviated to `better-auth/dist/…` and `nestjs-better-auth/dist/index.mjs`).
Library line numbers are approximate where I read a function body rather than a numbered excerpt; function names are exact.

Nothing was executed (no requests were sent, no tests run). Conclusions about browser behaviour (SameSite, CORS) are
derived from the configuration found in code plus the standard browser rules, and are labelled as inference where so.

---

## 1. Authentication / Session Verification

### 1.1 Mechanism (confirmed)

- **Better Auth, email + password, cookie session**, hosted in-process in `apps/api`
  (`packages/auth/src/index.ts:56-80`; `emailAndPassword.enabled: true`). No bearer/JWT plugin is configured.
- Browser calls use `apiFetch` with **`credentials: "include"`** and header `Content-Type: application/json`
  (`packages/shared/src/http/api-fetch.ts:20-25`). So the session cookie is the only credential.
- The Customer Portal app uses `@medcal/auth/client` (`apps/customer-portal/src/app/providers.tsx`, `lib/session.ts`).

### 1.2 Cookie attributes (confirmed by library code + repo config)

The repo sets **no** `advanced.defaultCookieAttributes` / `cookies` override
(`packages/auth/src/index.ts:67-74` only sets `crossSubDomainCookies`). So Better Auth defaults apply
(`better-auth/dist/cookies/index.mjs:21-35`):

| Attribute | Value | Source |
|---|---|---|
| HttpOnly | `true` | cookies/index.mjs:35 |
| SameSite | **`lax`** (explicit) | cookies/index.mjs:33 |
| Path | `/` | cookies/index.mjs:34 |
| Secure | `true` iff the base URL is https (also adds the `__Secure-` prefix) | cookies/index.mjs:21,32 |
| Domain | `COOKIE_DOMAIN` when set (`crossSubDomainCookies.enabled`), otherwise host-only | `packages/auth/src/index.ts:54,71-74` |

Deployment values: production `BETTER_AUTH_URL="https://api.kalibrasimedika.co.id"` and
`COOKIE_DOMAIN=".kalibrasimedika.co.id"` (`.env.production.example:52,62`) → Secure + HttpOnly + Lax, shared across
every `*.kalibrasimedika.co.id` subdomain. Local dev: `COOKIE_DOMAIN=""` → host-only cookie
(`.env.example:85`); the dev portal reaches the API through same-origin rewrites
(`apps/customer-portal/customer-portal-api-rewrites.js`, `/customer/:path*` → API).

### 1.3 How the API authenticates a customer request (confirmed)

Two independent layers, both session-cookie based:

1. **Global guard.** `AuthModule.forRoot({ auth, isGlobal: true })` (`apps/api/src/app.module.ts:42`) registers
   `AuthGuard` as `APP_GUARD` (`nestjs-better-auth/dist/index.mjs:953-956`, `disableGlobalAuthGuard` defaults false, `:81`).
   `AuthGuard.canActivate` calls `auth.api.getSession({ headers })`, and throws 401 when there is no session and the route is
   not `@Public/@Optional` (`:194-212`). No customer route is marked public/optional.
2. **Controller-level session read.** `sessionUserId()` re-reads the session and throws `UnauthorizedException`
   (`apps/api/src/modules/customer-portal/customer-portal.controller.ts:35-39`). The user id comes only from there.

Then `CustomerPortalService.requireCustomerId(userId)` (`customer-portal.service.ts:249-266`) requires: user `ACTIVE` →
`UserMembership` in `COMPANY_ID` → a `CustomerUserLink` whose customer belongs to that company; every failure is the same 403
`CUSTOMER_ACCESS_REQUIRED`. The customer id returned is the link's `customerId`; nothing client-supplied is used.

### 1.4 Would the future POST be authenticated the same way? — Yes

A new `@Post(":id/feedback")` on `CustomerWorkOrdersController` inherits (a) the global `AuthGuard`, and (b) the same
`sessionUserId()` + `requireCustomerId()` calls as every existing GET (`controller:56-96`). The module's own body parser
applies to all non-`/api/auth` routes (see §6/§7), and the global guard runs per-route regardless of method. No code path
distinguishes GET from POST for session handling.

**Test-harness caveat (confirmed):** the existing HTTP tests build a *minimal* Nest module with only the two controllers
(`customer-portal.service.test.ts:324-332`), `vi.spyOn(auth.api, "getSession")`, no `AuthModule`, no `enableCors`, no custom body
parser (default `NestFactory.create` parser). They therefore prove controller + service behaviour, **not** the production
guard/CORS/body-parser wiring.

---

## 2. Better Auth `trustedOrigins` — does it protect custom NestJS routes?

**Answer: No. It does not enforce Origin validation on `/customer/*` (or any non-`/api/auth` route).**

Trace:

1. `trustedOrigins` is set from `TRUSTED_ORIGINS` (`packages/auth/src/index.ts:60`).
2. Better Auth's origin/CSRF check is `originCheckMiddleware` (`better-auth/dist/api/middlewares/origin-check.mjs`), registered
   as a **router middleware on Better Auth's own endpoint router** (`better-auth/dist/api/index.mjs:152-160`, `routerMiddleware: [{ path: "/**", middleware: originCheckMiddleware }, …]`,
   with `basePath` taken from `BETTER_AUTH_URL`). It runs only for requests dispatched through that router, and returns
   early for `GET/HEAD/OPTIONS`. For other methods, `validateOrigin` requires, when a `cookie` header is present, an
   `Origin` (or `Referer`) header that matches `trustedOrigins`, else 403 `MISSING_OR_NULL_ORIGIN` / `INVALID_ORIGIN`.
3. The Nest integration only hands requests to Better Auth when the path matches the auth base path:
   `authHandler` → `if (!matchesBasePath(req, this.basePath)) { next(); return; }`
   (`nestjs-better-auth/dist/index.mjs:877-883`; `basePath` default `/api/auth`, `:789-791`; `matchesBasePath :659-662`).
   Any other path (including `/customer/work-orders/:id/feedback`) goes to Nest controllers and **never enters the Better
   Auth router**, so `originCheckMiddleware` never runs on it.
4. The only other use of `trustedOrigins` by the integration is CORS: `httpAdapter.enableCors({ origin: trustedOrigins, methods: ["GET","POST","PUT","DELETE"], credentials: true })`
   (`:846-852`) — that is a browser read-permission mechanism, not a request filter (see §4).
5. Searched for another origin check: `apps/api/src` contains no global middleware, guard, or interceptor that validates
   `Origin`/`Referer`/`Sec-Fetch-Site`. The only `Origin`-reading code is the registration hook for `/sign-up/email`
   (`apps/api/src/modules/whitelist/registration-origin.hook.ts`), which is a Better Auth hook, scoped to that endpoint
   and used for staff-vs-customer policy, not CSRF. `common/guards` contains `company-role.guard.ts` and
   `internal-service.guard.ts` only.

Conclusion (confirmed by code): `trustedOrigins` does **not** give the custom POST any Origin enforcement.

---

## 3. CSRF Verification

### 3.1 What exists

| Mechanism | Present for the future POST? | Evidence |
|---|---|---|
| CSRF token (double-submit/synchronizer) | No | none in `apps/api/src`, `packages/auth/src`, `packages/shared/src/http` |
| Framework CSRF middleware (csurf/helmet-csrf) | No | not in `apps/api/package.json` deps; `main.ts` registers none |
| Origin/Referer check on custom routes | **No** (§2) | — |
| Better Auth CSRF/Origin check | Only `/api/auth/*` | §2 |
| Fetch-Metadata (`Sec-Fetch-Site`) check on custom routes | No | — |
| **SameSite=Lax on the session cookie** | **Yes** | cookies/index.mjs:33 |
| **CORS preflight for JSON POST** | **Yes, for cross-origin browsers** | `apiFetch` always sends `Content-Type: application/json` (api-fetch.ts:24); `main.ts:20-23` `enableCors` |
| JSON-only body parsing | Yes (default `express.json`, `express.urlencoded`) | nestjs-better-auth `SkipBodyParsingMiddleware` `:663-701` |

### 3.2 Can an attacker-controlled website make a customer's browser send an authenticated POST?

Reasoning from the actual configuration (browser rules = inference; config = confirmed):

- **Attacker on an unrelated site** (e.g. `evil.example`): the session cookie is `SameSite=Lax` (explicit, so the
  browsers' "Lax+POST" grace period for cookies *without* an explicit attribute does not apply). Lax cookies are not sent on
  cross-site `fetch`/XHR/`<form method=POST>`/subresource requests. The request reaches the API **without** the cookie →
  global `AuthGuard` returns 401 → no feedback created. Even a JSON-bodied request would additionally need a CORS
  preflight, which `evil.example` fails (it is not in the allow-list, §4). **Not possible** under normal browser behaviour.
- **Attacker on a same-site sibling** (any origin under `kalibrasimedika.co.id` — the cookie is deliberately shared across
  subdomains via `COOKIE_DOMAIN`): browsers treat it as same-site, so the Lax cookie **is** sent. What then stops it:
  - If the sibling is in `TRUSTED_ORIGINS` (production list: root, `apps.`, `portal.`, `technician.`, `customer.`;
    `.env.production.example:56`) it passes CORS too, so **no technical barrier exists**; protection relies on those apps not
    having XSS. That is the same trust boundary that already holds for the staff apps.
  - If the sibling is *not* in `TRUSTED_ORIGINS` (e.g. a future unrelated subdomain), a JSON POST fails preflight. A
    "simple" cross-origin request (`text/plain`, or form-urlencoded) skips preflight and carries the cookie: the body of a
    `text/plain` request is not parsed by `express.json` (default `type: application/json`; inference from express defaults,
    not re-verified in `node_modules`), and a form-urlencoded body *is* parsed (urlencoded parser enabled, `extended: true`) but
    yields **string** values — so an `z.number().int()` schema that does **not** use `z.coerce` rejects `rating="5"`.
    Result: today's would-be implementation is accidentally safe against simple requests **only if** the schema stays strict
    about types and the content type isn't relied upon. This is a defence by luck of parsing, not by an origin check.
- **Browsers without SameSite support / non-browser clients:** an attacker needs the victim's cookie, so non-browser
  clients are irrelevant to CSRF.
- **Missing `Origin`:** nothing rejects it on this route (no Origin logic at all).

**Direct answer.** From an *unrelated* attacker-controlled website: **No**, and the barrier is browser cookie behaviour
(`SameSite=Lax`) plus CORS, not a server-side check. From a *same-site subdomain not in the allow-list*: a request with the
cookie can be sent, and the server has no Origin check; it fails only because JSON/number validation rejects the body.
That residual depends on (a) the cookie remaining explicitly Lax and `COOKIE_DOMAIN` staying scoped to the product's own
subdomains, (b) no `z.coerce`, (c) all sibling apps being XSS-free.

### 3.3 Assessment

There is **no explicit CSRF defence on custom routes**; effective protection is browser-enforced SameSite=Lax. Because the
mutation is low-impact (a one-time, immutable rating of the customer's own Work Order) this is arguably acceptable, but the
documented assumption should be recorded and an Origin check on mutating customer routes is the smallest explicit fix
(see §11 GAP).

---

## 4. CORS Verification

Configuration (confirmed):

- `apps/api/src/main.ts:20-23` — `app.enableCors({ origin: parseTrustedOrigins(process.env.TRUSTED_ORIGINS), credentials: true })`.
  Applied globally, before the module's own registration, via Nest's Express `enableCors` (immediate `app.use(cors(...))`;
  inference on ordering).
- `nestjs-better-auth/dist/index.mjs:846-852` additionally calls `enableCors` with `origin: trustedOrigins` (same list),
  `methods: ["GET","POST","PUT","DELETE"]`, `credentials: true`. Same origin list, so effective policy is identical for POST.
- Origins are an **array of explicit strings** — no wildcard, no regex. `TRUSTED_ORIGINS` in production:
  `https://kalibrasimedika.co.id, https://apps.…, https://portal.…, https://technician.…, https://customer.…`
  (`.env.production.example:56`). The Customer Portal origin `https://customer.kalibrasimedika.co.id` is explicitly present.
  Unset env → empty array → no origin allowed.
- Socket.IO gateway uses the same list (`chat.gateway.ts:65-70`) — not relevant to this POST.

Evaluation of `Origin` × `Access-Control-Allow-Origin` × `Access-Control-Allow-Credentials` × `Cookie` (the `cors` package
reflects the request origin only when it is in the list; behaviour of the package = inference):

| Request `Origin` | ACAO returned | ACAC | Browser outcome |
|---|---|---|---|
| `https://customer.kalibrasimedika.co.id` | same origin, `Vary: Origin` | `true` | Cookie sent (same-site), response readable |
| another listed origin (apps/portal/technician/root) | that origin | `true` | Allowed; cookie sent |
| unlisted origin | none | none | Preflight fails for JSON; response unreadable. **Does not stop a "simple" request from being sent/executed server-side** (CORS is not a firewall) |
| no `Origin` header (non-browser, or same-origin GET) | none needed | — | Request proceeds normally |

**No arbitrary origin can receive an authenticated *readable* response** (no wildcard, no reflection of unlisted origins).
CORS is global (not per-route). It provides read isolation and preflight gating; it does not by itself prevent a request
that carries cookies from executing, which is why §3 relies on SameSite.

---

## 5. Customer Ownership / IDOR Verification

Trace of the existing scoping (confirmed):

```
Better Auth session (cookie)           controller.sessionUserId()      controller:35-39
  → userId
requireCustomerId(userId)                                              service:249-266
  → User.status = ACTIVE
  → UserMembership(userId, COMPANY_ID) exists
  → CustomerUserLink{ userId, customer.companyId = COMPANY_ID } → customerId
findOwnedWorkOrder(userId, workOrderId)                                service:350-358
  → WorkOrder.findFirst({ id, companyId, customerId })  else 404 WORK_ORDER_NOT_FOUND
```

- The route param `:id` is only a lookup key; the ownership predicate `{ id, companyId, customerId }` is evaluated in one
  query. Customer A's session + Customer B's WO id → `findFirst` returns null → the same 404 body as for a non-existent id.
  This is asserted in existing tests: `customer-portal.service.test.ts` "returns the same 404 body for another customer's id and an unknown id"
  (HTTP `describe`, ~`:784`) and the service-level cross-customer test (`:481`).
- `userId` is taken from the session only. The existing controller ignores client-supplied `customerId` (test `:726`).
  A POST would not read `customerId` / `userId` / `customerUserId` from the body.
- A POST body schema should simply not contain those keys. `z.object` strips unknown keys by default (the repo uses
  `.strict()` in only 2 places in `packages/shared/src/schemas/index.ts`), so extra keys would be ignored, not honoured.
- **Sufficient for a mutation?** Yes for authorization. Two additions are needed for correctness, not scoping:
  eligibility must be re-evaluated **inside the write transaction** (the read in `findOwnedWorkOrder` is not a lock), and
  `customerId`/`companyId`/`submittedByUserId` stored on the row must come from the server-resolved scope.
- Residual notes: `companyId()` comes from `process.env.COMPANY_ID` (`service:242-246`) — single-tenant by design;
  `:id` is passed to Prisma as a parameter (no injection surface); ids are cuids but the control is the ownership query.

---

## 6. Duplicate Submission / Concurrency

- `UNIQUE(workOrderId)` is **sufficient as the correctness guarantee** for double-click, two tabs, and concurrent POSTs:
  Postgres serialises concurrent inserts on a unique index — the second insert blocks until the first commits, then fails with
  `P2002`. A pre-insert "does it exist?" read is only an optimisation (it is racy by itself).
- **Transaction handling (important, confirmed by repo precedent):** on Postgres a unique violation inside an interactive
  transaction aborts the whole transaction. `work-orders.service.ts:588-591` already documents and handles this
  ("trips with P2002 and Postgres aborts the whole transaction"). So the `P2002` must be caught **outside** the
  `$transaction` callback, and no `AuditLog` row from the losing request is committed (it rolls back with the feedback
  insert) — which is the desired "exactly one feedback ↔ exactly one audit row" property.
- Existing detection idioms: `isUniqueConstraintError` (`work-orders.service.ts:174-176`), inline
  `err.code === "P2002"` (`users.service.ts:329`), `uniqueViolationTarget` (`certificate.service.ts:88-93`).
- **Retry after network timeout:** the first request may have committed. The retry gets the unique violation. Recommended
  behaviour: `409 Conflict`, code `FEEDBACK_ALREADY_SUBMITTED`, with a body the UI can use to show the existing confirmation
  (e.g. `{ submitted: { rating, submittedAt } }` — the customer's own data). This matches `ConflictException({ code, message })`
  usage in `calibration-jobs.service.ts:1180,1202` and `certificate.service.ts:528`. Not treated as an error state by the UI.
- Eligibility lost between page render and POST → `409 FEEDBACK_NOT_ELIGIBLE` (distinct code).
- Client double-click: disable the submit button while pending (existing pattern: `opening` state in
  `work-orders/[id]/page.tsx:50,85`). This is UX, not a security control.
- `P2002` on a *different* target (should not exist) must not be reported as "already submitted"; check the target as
  `certificate.service.ts` does.

---

## 7. Input Validation

Existing repository convention (confirmed): **Zod schemas in `packages/shared/src/schemas/index.ts`, parsed manually in the
controller with `safeParse`**, failing with `BadRequestException({ message, code, issues: parsed.error.flatten() })`:

- Body example: `calibration-jobs.controller.ts:222-229` (`qualityReviewDecisionSchema.safeParse(rawBody ?? {})`,
  code `INVALID_QUALITY_REVIEW_DECISION`).
- Customer-portal example: `invalidQuery()` in `customer-portal.controller.ts:48-54`, code `INVALID_CUSTOMER_PORTAL_QUERY`.
- There is **no** `class-validator`, `ValidationPipe`, `useGlobalPipes` or `nestjs-zod` in `apps/api` (grep of `src` and `package.json`).
- String conventions: `z.string().trim().max(2000).optional()` for free-text notes (`qualityReviewDecisionSchema :1021-1025`,
  `calibrationJobEscalateIdentitySchema :777`); services normalise empty text to `null`
  (e.g. `calibration-jobs.service.ts:1360` `notes && notes.length > 0 ? notes : null`).
- Unknown keys: stripped by default `z.object` behaviour (only 2 `.strict()` in the schema file).
- Body size: `main.ts:16-18` sets `bodyParser: false` and the module installs `express.json` with default options
  (`resolveBodyParserOptions()` with no overrides, `nestjs-better-auth/dist/index.mjs:620-650,663-701`), so the default
  100 kb JSON limit applies (inference from express default; no limit configured in repo). Nginx allows 25 MB
  (`infra/nginx/api.kalibrasimedika.co.id.conf.example:70`), so the app limit is the effective one.
- HTML: the API does no input sanitisation. The only sanitiser is `apps/portal/src/lib/sanitize-html.ts` for rendering
  **emails** (the only `dangerouslySetInnerHTML` use besides JSON-LD, `apps/portal/.../email/[id]/page.tsx`).

Recommended pattern (consistent with the above, nothing new):

```ts
// packages/shared/src/schemas/index.ts  (naming following customerWorkOrderListQuerySchema)
export const customerFeedbackSubmitSchema = z.object({
  rating: z.number().int().min(1).max(5),          // NO z.coerce: form-encoded "5" must fail (see §3.2)
  comment: z.string().trim().max(2000).optional(), // service stores "" as null
});
```
Controller: `safeParse(rawBody ?? {})` → `BadRequestException({ message, code: "INVALID_CUSTOMER_FEEDBACK", issues })`.
Database: `CHECK (rating BETWEEN 1 AND 5)` as raw SQL in the migration (repo precedent: `20260829175600_add_calibration_request_item_qty_check`).
Storage/serialisation: plain text only; React escapes on render. If feedback is ever rendered into emails/PDF/`dangerouslySetInnerHTML`
(staff email view uses a sanitiser), it must be treated as untrusted. Also consider rejecting `\u0000` in `comment`
(PostgreSQL text cannot store NUL; would surface as a 500 — general Postgres knowledge, not tested here).

---

## 8. Rate Limiting

| Layer | Present? | Evidence |
|---|---|---|
| Nest global/route throttling | **No** | no `@nestjs/throttler` / throttle decorators in `apps/api/src` or `package.json` (grep returned nothing relevant) |
| Better Auth rate limiter | Yes, **only `/api/auth/*`**, and **only when `NODE_ENV=production`** | enabled via `options.rateLimit?.enabled ?? isProduction`, window 10 s / max 100 (`better-auth/dist/context/create-context.mjs:169-174`); invoked from the Better Auth router's `onRequest` (`api/index.mjs`, `onRequestRateLimit`) → not reached by custom routes (§2) |
| Reverse proxy | **No** | `infra/nginx/*.example` contain no `limit_req`; only `client_max_body_size 25m` |
| Infrastructure/CDN | Unknown (outside repo) | — |

The future POST is **not covered**. Actual risk assessment:
- Requires a valid, ACTIVE, linked customer session (one portal user per customer). No unauthenticated amplification.
- Data growth is **bounded by schema**: at most one row per eligible Work Order. Repeated POSTs after the first fail on the unique index.
- Remaining risk is request-rate cost (each request runs `requireCustomerId` + ownership query: a few indexed queries) — the same
  exposure every existing authenticated customer GET already has, with no limiter.
- Smallest appropriate protection for v1: **none beyond** the unique constraint, Zod `max(2000)` and the default 100 kb body cap.
  If a limiter is wanted later it belongs at nginx (`limit_req` on `/customer/`) rather than a new app dependency.

Related observation (not a POST gap): `main.ts` sets no `trust proxy`; Express `request.ip` behind nginx will be the proxy's
address, not the client's (grep `trust proxy|x-forwarded` in `apps/api/src` → none). Existing audit rows
(`CERTIFICATE_PDF_VIEWED_VIA_CUSTOMER_PORTAL`, `customer-portal.service.ts:614-630`) record `request.ip`
(`controller:41-46`), so their `ipAddress` is likely the proxy address in production (inference; depends on the container
network). Better Auth reads `x-forwarded-for` itself for its own limiter.

---

## 9. AuditLog Security

Model and writer (confirmed):
- `AuditLog` (`packages/db/prisma/schema.prisma:3324-3350`): required `companyId`, `action`, `outcome` (`SUCCESS|FAILURE`);
  optional `userId` (FK, `onDelete: SetNull`), `targetType`, `targetId`, `metadata` (Json), `ipAddress`, `userAgent`.
  Indexes: `(companyId, action, createdAt)`, `(targetType, targetId)`, `(userId)`.
- Writer: `recordAuditLog(input, client = prisma)` (`apps/api/src/modules/calibration-jobs/audit-log.ts:29-46`) — any server
  code can call it; there is no DB-level restriction on who writes. The `client` parameter accepts a transaction client; precedent
  for same-transaction audit: `certificate.service.ts:557-607` (`CERTIFICATE_ISSUED` written with `tx`).
- Customer-originated precedent: `CERTIFICATE_PDF_VIEWED_VIA_CUSTOMER_PORTAL` (`customer-portal.service.ts:614-630`) —
  `userId` = the customer user, `targetType: "Certificate"`, metadata with ids/number, `ipAddress`/`userAgent` from `requestContext(request)`
  (`controller:41-46`).
- Metadata convention: "Non-sensitive structured context … NEVER a password or other credential" (`schema.prisma:3336-3338`).

Recommended event representation:

| Field | Value |
|---|---|
| `action` | `CUSTOMER_FEEDBACK_SUBMITTED` (SCREAMING_SNAKE, matches `CERTIFICATE_*`; optionally `…_VIA_CUSTOMER_PORTAL` for symmetry with the PDF-view event) |
| `outcome` | `SUCCESS` |
| `userId` | session user (the customer user) |
| `companyId` | from `requireCustomerId` scope |
| `targetType` / `targetId` | `"CustomerFeedback"` / the new feedback id (same style as `Certificate` rows); `workOrderId` goes in metadata |
| `metadata` | `{ workOrderId, workOrderNumber, customerId, rating, hasComment }` — **not** the comment text |
| `ipAddress`, `userAgent` | `requestContext(request)`; note proxy-IP caveat (§8) |

Atomicity: create feedback and call `recordAuditLog(…, tx)` in the same `$transaction`; catch `P2002` outside it so a lost race writes no
audit row. No `FAILURE` audit rows for validation/ownership errors are needed (no existing customer-portal read does this).

---

## 10. Security Test Plan (to implement with the feature; none written here)

Harness note: reuse the `customer-portal.service.test.ts` pattern (real Postgres, `vi.spyOn(auth.api, "getSession")`, HTTP via `fetch`).
That harness uses **no AuthModule, no `enableCors`, and Nest's default body parser**, so Origin/CORS/body-parser behaviour cannot be
tested there. Origin/CORS cases need either an app built like `main.ts` (with `AuthModule`, `enableCors`, `bodyParser:false`)
or unit tests of whatever origin check is added.

### Authentication
| Case | Expected |
|---|---|
| POST without session | 401, no row, no audit |
| Customer A session, own eligible WO | 201, one row, one audit row |
| Disabled user / removed membership / no link | 403 `CUSTOMER_ACCESS_REQUIRED` (same body as GETs), no row |

### Ownership
| Case | Expected |
|---|---|
| A + A's WO | allowed |
| A + B's WO id | 404 identical body to a missing id; no row; no audit |
| Body contains `customerId` / `userId` / `customerUserId` / `workOrderId` of B | ignored (stripped); row uses server-resolved ids |

### Origin / CSRF (depends on the §11 decision)
| Case | Expected |
|---|---|
| `Origin: <customer portal origin>` + cookie | allowed |
| `Origin: https://evil.example` + cookie | **rejected 403, no row** (requires the Origin check; today it would only be stopped by Lax cookie / CORS) |
| No `Origin` and no `Referer`, with cookie | decide: reject (browser fetch POST always sends Origin) — recommended 403 |
| Cross-site simulated POST (`Content-Type: application/x-www-form-urlencoded` `rating=5`, and `text/plain`) | 400/403, **no row** (also proves `rating` is not coerced) |
| Cookie attributes in sign-in `Set-Cookie` (prod config) | `HttpOnly; SameSite=Lax; Secure` — guards the assumption in §3 |

### Input
| Case | Expected |
|---|---|
| `rating` 1, 5 | valid |
| 0, 6, -1, 1.5, `"5"`, `null`, missing | 400 `INVALID_CUSTOMER_FEEDBACK` |
| `comment` non-string (number/object/array) | 400 |
| `comment` 2001 chars | 400; 2000 OK |
| `comment` `""` / whitespace | stored `NULL` |
| `comment` containing `<script>` | stored verbatim as text (no execution contexts) |
| `comment` containing `\u0000` | 400 (if rule adopted), never a 500 |
| body `null`/non-JSON/array | 400 |
| body > 100 kb | 413 from the parser (not 500) |

### Duplicate
| Case | Expected |
|---|---|
| Same WO twice sequentially | 201 then 409 `FEEDBACK_ALREADY_SUBMITTED`; 1 row; 1 audit row |
| N concurrent POSTs (`Promise.all`) | exactly one 201, rest 409; 1 row, 1 audit row (no orphan audit row) |
| Retry after simulated lost response | 409 with `submitted` summary |
| Eligibility lost before POST (e.g. WO not completed, no available certificate) | 409 `FEEDBACK_NOT_ELIGIBLE` |

### Audit
| Case | Expected |
|---|---|
| Successful submit | exactly one `CustomerFeedback`, exactly one `AuditLog{action:"CUSTOMER_FEEDBACK_SUBMITTED", targetId: feedback.id}` with `userId`, `ipAddress`, `userAgent`, metadata without comment text |
| Forced failure after feedback insert (mock audit write to throw) | no feedback row either (rollback) |
| Failed validation / foreign WO | zero audit rows |

---

## 11. Security Readiness for Customer Feedback POST

### CONFIRMED SAFE
- Session identity is derived only from the Better Auth session cookie and re-read in the controller; no client-supplied
  `customerId`/`userId` is trusted by the existing customer controllers (`controller:35-39`, tests `:726`).
- Ownership resolution `session → CustomerUserLink → customerId → WorkOrder{id, companyId, customerId}`, with identical 404 for foreign vs missing ids (`service:249-266, 350-358`; tests `:481, :784`). A POST reusing `findOwnedWorkOrder` has no cross-customer path.
- CORS uses explicit string origins with `credentials: true`; no wildcard, no reflection of unlisted origins; the Customer Portal origin is listed in the production template (`main.ts:20-23`, `.env.production.example:56`).
- Session cookie is `HttpOnly`, `SameSite=Lax` (explicit), `Path=/`, and `Secure` under an https base URL (`better-auth/dist/cookies/index.mjs:21-35`; no overrides in `packages/auth/src/index.ts`).
- The DB-unique + catch-outside-transaction pattern for P2002 is already established in the codebase (`work-orders.service.ts:588-591`).
- Atomic feedback + `AuditLog` is supported by `recordAuditLog(input, tx)` with precedent (`certificate.service.ts:557-607`).

### PROTECTED BY EXISTING ARCHITECTURE
- **Authentication of the POST**: global `AuthGuard` (APP_GUARD) + controller `sessionUserId()` apply identically to POST as to GET.
- **Cross-site CSRF from unrelated websites**: blocked by `SameSite=Lax` (cookie not sent on cross-site POST) and, for JSON, by CORS preflight failing for unlisted origins. *Protection is browser-enforced, not server-enforced* (§3.2).
- **Input shape**: Zod strip-unknown + non-coercing number schema + default JSON parser type restrict what a cross-site simple request can inject.
- **Duplicate/concurrent submission**: the unique index serialises writers; the transaction rollback keeps audit and feedback consistent.
- **Data growth abuse**: at most one row per eligible WO per customer account.

### GAP / MUST FIX BEFORE POST
1. **No server-side Origin/Referer validation on custom routes.** `trustedOrigins` protects only `/api/auth/*` (§2). The cookie is shared across `*.kalibrasimedika.co.id` (same-site), so SameSite=Lax does not separate sibling subdomains. Smallest fix (not applied here): a guard/check on the mutating customer route(s) that requires `Origin` (fall back to `Referer`) to match `TRUSTED_ORIGINS`, rejecting 403 otherwise — reusing the existing env list and the 403 convention. Severity: low-to-medium given the mutation's low impact, but it is the only explicit CSRF control available and the assumption it replaces (Lax + no sibling XSS + non-coercing schema) is currently undocumented. If the team deliberately accepts the residual risk, record that acceptance in the implementation contract.
2. **The existing HTTP test harness cannot verify any of this** (no AuthModule/CORS/body parser). Tests for Origin and content-type behaviour need a production-like bootstrap (§10).

### NOT REQUIRED FOR V1
- CSRF tokens (double-submit / synchronizer) or a CSRF library — over-engineering relative to Lax cookies + an Origin check.
- An application-level rate limiter / `@nestjs/throttler` — exposure is authenticated, one-account-per-customer and row-bounded; nginx `limit_req` can be added operationally if ever needed.
- Replacing the validation approach (class-validator/ValidationPipe) — Zod + `safeParse` is the convention.
- HTML sanitisation of the comment on write — store plain text; sanitise only if later rendered as HTML.
- Failure-outcome audit rows for rejected requests.

### NEEDS IMPLEMENTATION DECISION
- Reject requests with **no** `Origin`/`Referer` (recommended for browser-only endpoint) or allow them (non-browser tooling).
- Origin check scope: only the new feedback route, all customer mutations (future-proof), or a reusable Nest guard — keep minimal.
- `409` body shape for duplicates (include `submitted` summary vs. code only) and whether an identical re-submit may return `200` idempotently.
- Reject `\u0000` in `comment`; maximum comment length (2000 follows repo convention).
- `.strict()` on the body schema (reject unknown keys) vs. repo-default strip.
- Whether to set `trust proxy` (or capture `X-Forwarded-For`) so audit `ipAddress` is the client's — affects all existing audit rows, so it is outside this feature.
- Whether `TRUSTED_ORIGINS` in production should keep the root marketing origin (`https://kalibrasimedika.co.id`) in the credentialed-CORS list for the API at all.

---

## Files Inspected

- `apps/api/src/main.ts`, `apps/api/src/app.module.ts`
- `packages/auth/src/index.ts`, `packages/shared/src/http/api-fetch.ts`
- `apps/api/src/modules/customer-portal/customer-portal.controller.ts`, `customer-portal.service.ts`, `customer-portal.service.test.ts` (harness + HTTP tests)
- `apps/api/src/modules/calibration-jobs/audit-log.ts`, `certificate.service.ts` (`:88-93, 528, 557-607`), `calibration-jobs.controller.ts` (`:205-235`), `calibration-jobs.service.ts` (`:1180, 1202, 1360`)
- `apps/api/src/modules/work-orders/work-orders.service.ts` (`:174-176, 580-600`), `users/users.service.ts` (`:329`)
- `apps/api/src/modules/whitelist/registration-origin.hook.ts`, `chat/chat.gateway.ts` (CORS block)
- `packages/shared/src/schemas/index.ts` (customer query schemas, `qualityReviewDecisionSchema`, `calibrationJobEscalateIdentitySchema`, `.strict()` count)
- `packages/db/prisma/schema.prisma` (`AuditLog :3324-3350`)
- `.env.example`, `.env.production.example`, `.env` (variable names/URLs only), `infra/nginx/api.kalibrasimedika.co.id.conf.example`, `customer.kalibrasimedika.co.id.conf.example`
- `apps/customer-portal/customer-portal-api-rewrites.js`
- `node_modules` (pnpm): `@thallesp/nestjs-better-auth@2.7.0/dist/index.mjs` (AuthGuard, `configure`, body parser, CORS), `better-auth@1.6.27/dist/api/middlewares/origin-check.mjs`, `dist/api/index.mjs` (router + middleware wiring), `dist/api/rate-limiter/index.mjs`, `dist/context/create-context.mjs`, `dist/cookies/index.mjs`
- Greps: `trust proxy|x-forwarded`, `throttl|rate.?limit`, `ValidationPipe|class-validator|nestjs-zod`, `sanitize|dangerouslySetInnerHTML`, `limit_req`

## Confirmed by code
- Cookie session via Better Auth; cookie defaults `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` on https, domain-shared in production.
- Better Auth's `originCheckMiddleware` lives in Better Auth's own router, and the Nest integration forwards only `/api/auth/*` to it; no other Origin/Referer/CSRF check exists in `apps/api`.
- CORS: global, explicit origin list from `TRUSTED_ORIGINS`, credentials on, Customer Portal origin in the production template.
- Ownership scoping chain and identical 404 bodies; existing tests cover GET variants.
- No Nest throttling, no nginx `limit_req`; Better Auth limiter is production-only and `/api/auth/*`-only.
- Validation convention is Zod + manual `safeParse` + `BadRequestException({ code, issues })`; no class-validator.
- `recordAuditLog` accepts a transaction client; customer-originated audit precedent exists.
- Test harness for customer HTTP tests does not include AuthModule, CORS or the production body parser.

## Architectural inference
- Cross-site POSTs from unrelated origins fail because Lax cookies are not sent and JSON preflight fails; same-site unlisted siblings are the residual case.
- Default body limit is 100 kb and `text/plain` is not JSON-parsed (Express defaults, not re-verified in `node_modules`); form-urlencoded values arrive as strings and fail a non-coercing schema.
- `cors` package behaviour for unlisted origins (no ACAO) and ordering of the two `enableCors` registrations.
- Audit `ipAddress` is probably the proxy address in production (no `trust proxy`).
- `\u0000` in text would cause a Postgres error (general Postgres knowledge).

## Still requiring verification / decision
- Real production values of `TRUSTED_ORIGINS`, `COOKIE_DOMAIN`, `BETTER_AUTH_URL`, `NODE_ENV` (only templates were read) and the deployed nginx config.
- Actual `Set-Cookie` headers from a production sign-in (to confirm Lax/Secure/Domain empirically).
- Whether any sibling subdomain under `kalibrasimedika.co.id` outside the repo can run attacker-influenced script.
- CDN/WAF rate limiting outside the repo.
- The decisions listed under "NEEDS IMPLEMENTATION DECISION".
