# Node Runtime Compatibility Spike — RESULT (2026-08-16)

**Empirically resolved: Node 20 is sufficient. No production Node upgrade required before Web Chat implementation.** Full result saved to `D:\medcal\docs\claude\lead-management\web-chat-node-runtime-spike.md`.

A temporary, isolated spike project (outside the repo, deleted after the test — confirmed via `git status`) built real `node:20-alpine` and `node:22-alpine` Docker images using the exact dependency versions pinned in `pnpm-lock.yaml`, and ran the actual mechanism the Web Chat design depends on: a real Socket.IO handshake carrying a genuine Better Auth session cookie, through a NestJS WS execution context, through `@thallesp/nestjs-better-auth`'s `AuthGuard`, through `better-auth`'s `getSession()`, into a guarded handler reading the authenticated identity.

**Result: PASS on both Node v20.20.2 (exact production match) and Node v22.23.2 — identical behavior, no runtime difference found.** The declared `engines: {node: ">=22.22.1"}` on `@thallesp/nestjs-better-auth@2.7.0` produced only an install-time warning on Node 20 (no `engine-strict` setting exists in this repo), never a runtime failure. Both open items from the earlier technical spike (Better Auth+Socket.IO feasibility, the untested WS-context code path) are now closed with empirical evidence, not inference. `apps/api/Dockerfile` stays on `node:20-alpine` — no change needed.

---

# (superseded) Original next-step framing, kept for record

**Scope, confirmed with the user:**

- Isolated, temporary spike project only — clearly marked SPIKE ONLY, removed after the test.
- Does NOT touch `apps/api/Dockerfile`, `package.json`, `pnpm-lock.yaml`, `docker-compose.prod.yml`, Prisma schema, or any production file.
- Does NOT build `ChatSession`/`ChatMessage`, the Chat UI, visitor auth, or the production `ChatGateway` — only the staff Better-Auth-via-WS-handshake mechanism, isolated.
- Test A: Node 20 Alpine. Test B: Node 22+ Alpine (prefer `22.22.1`+ per the dependency's own floor). Identical application logic between the two, only the base image changes.
- Produces a PASS/FAIL verdict per Node version, then a final A/B/C decision (Node 20 sufficient / Node 20 incompatible / inconclusive) with empirical evidence, not source-reading inference.

Proceeding to execute this now, outside plan mode, per explicit user approval.

---

# Production Node Compatibility Result (2026-08-16)

> **AUDIT ONLY. Nothing modified — no Node upgrade, no package.json edits, no Docker/PM2 changes.** Findings below are all VERIFIED FROM REPO (direct file reads), except where explicitly marked otherwise. Full copy also saved to `D:\medcal\docs\claude\lead-management\web-chat-node-compatibility-audit.md`.

**Status: 🟡 YELLOW — a real, confirmed version gap exists, but it is not proven to be a hard runtime blocker. Not RED (no evidence of an actual crash/incompatibility); not GREEN (the gap is real and unverified in either direction).**

## 1–2. What actually executes `apps/api` in production

`apps/api/Dockerfile` (read in full) — **production runs via Docker, not PM2 or any other runtime.** Explicit comment at the top of the file: "workspace packages... are consumed as raw TypeScript... Plain `node dist/main.js` cannot resolve those at runtime... This image runs the app through `tsx`." The final `runner` stage:

```dockerfile
FROM node:20-alpine AS base
...
FROM base AS runner
ENV NODE_ENV=production
...
CMD ["node_modules/.bin/tsx", "src/main.ts"]
```

No PM2 ecosystem file exists anywhere in the repo (`find . -iname "ecosystem*"` — zero matches). `docker-compose.prod.yml` (re-confirmed) builds this exact Dockerfile as its only service. **This directly confirms the user's stated production observation (`node -v` → `v20.20.2`)** — the base image is explicitly pinned `node:20-alpine`, not a floating `node:latest` or `node:22`.

## 3. Docker image Node version

`node:20-alpine` — pinned explicitly in `apps/api/Dockerfile` line 15 (`FROM node:20-alpine AS base`), used for all three build stages (`base`/`pruner`/`installer`/`runner` all derive from it). Not a range, not `>=20` — a fixed major version tag.

## 4. CI Node version

**No CI exists in this repository at all.** `find . -path "*/.github/workflows/*"` returns zero matches (re-confirmed from the earlier technical spike, still true). There is no CI pipeline to have a Node version opinion — this question doesn't apply to this repo today.

## 5. Root `package.json` engines

```json
"engines": { "node": ">=20" }
```

A floor, not a ceiling — technically satisfied by both Node 20.20.2 (current production) and Node 24.12.0 (current local dev). This field does not, by itself, prove Node 20 is _sufficient_ for every dependency — it's the repo's own stated minimum, and it predates `@thallesp/nestjs-better-auth`'s stricter requirement being introduced.

## 6. `apps/api/package.json` engines

**No `engines` field exists in `apps/api/package.json` at all.** Only the root `package.json` declares one; `apps/api` inherits no stricter or looser floor of its own.

## 7. Does pnpm enforce or only warn on engine mismatches?

**Warns only, does not block.** No `.npmrc` file exists anywhere in the repo root (`find . -maxdepth 2 -iname ".npmrc"` — zero matches), and `pnpm-workspace.yaml` contains no `engine-strict` setting either (its entire content is just the two workspace glob patterns). pnpm's own default for `engine-strict` is `false` — meaning `pnpm install --frozen-lockfile` (exactly what `apps/api/Dockerfile`'s `installer` stage runs) **will print a warning about the Node version mismatch but will not fail the build or the install.** This is a repo-config fact (absence of any strict setting), not an assumption about pnpm's general behavior.

## 8. Is `@thallesp/nestjs-better-auth@2.7.0` actually installed/resolved?

**Yes, confirmed resolved in `pnpm-lock.yaml`:**

```yaml
"@thallesp/nestjs-better-auth@2.7.0":
  resolution: { integrity: sha512-Grq74scQ... }
  engines: { node: ">=22.22.1" }
```

It is a real, already-installed dependency of `apps/api` (registered via `AuthModule.forRoot(...)` in `app.module.ts`, per the earlier technical spike) — this is not a hypothetical future addition, it is already load-bearing for today's `CompanyRoleGuard`/staff-auth flow, unrelated to whether Web Chat is ever built.

## 9. Any other dependency imposing a conflicting Node version?

Searched every non-`node_modules` `package.json` in the repo for an `engines` field: only the root `package.json` (`>=20`) declares one. No other first-party package (`apps/api`, `apps/web-api`, `apps/web`, `apps/portal`, any `packages/*`) declares its own `engines` field. Within `node_modules`, `@thallesp/nestjs-better-auth@2.7.0` is the only dependency found across the entire prior spike's lockfile search whose stated floor (`>=22.22.1`) exceeds the repo's own `>=20` floor — no second, independent conflict was found.

## 10. Is Node 20.20.2 currently technically supported by the installed dependency tree?

**Partially — one real gap, not a tree-wide incompatibility.** Every other dependency in the tree is satisfied by Node 20.20.2 (root floor is `>=20`, and no other package declares a stricter floor per §9). The one exception is `@thallesp/nestjs-better-auth@2.7.0`'s own `>=22.22.1` declaration. Because pnpm does not enforce engines (§7), `pnpm install --frozen-lockfile` on Node 20 (exactly what the production Docker build does today) **succeeds with a warning, not a failure** — the package installs regardless of the declared floor. Whether it then _behaves correctly at runtime_ on Node 20 is a separate question this audit cannot answer by reading source alone (see §11).

## 11. Is the `>=22.22.1` requirement advisory or a real compatibility requirement?

**Not resolvable with certainty from static code reading alone — flagged, not asserted either way.** Two things are true simultaneously and worth holding in tension:

- The specific WS-context code path read in full during the prior technical spike (`getRequestFromContext`, the `AuthGuard.canActivate` branch used for `CompanyRoleGuard` today) contains nothing that looks Node-22-specific — plain conditionals, a lazy `import()`, and calls into `better-auth`'s own headers helpers. Nothing in _that one code path_ explains the version floor.
- However, this audit did not read `@thallesp/nestjs-better-auth`'s **entire** package source (only the auth-guard portion relevant to the previous spike's question) — the `>=22.22.1` floor could reflect something used elsewhere in the package (a newer built-in API, a test/build-tooling requirement leaking into the published `engines` field, or genuinely a runtime feature used in a code path not yet read). This is a real gap in this audit's coverage, not something to guess past.
- **One piece of indirect evidence worth weighing:** this exact package version is _already_ a production dependency of `apps/api` today (via `AuthModule.forRoot`, powering the existing staff-auth flow, unrelated to WebSockets) — if production is currently live and that flow is working, that would be empirical evidence the `>=22.22.1` floor is conservative/advisory rather than a hard blocker for at least the parts of the package already in use. This audit found no repo-internal way to confirm whether production has actually been deployed and is currently serving live traffic — that's operational knowledge outside the repo, not something to assume.

## 12. Is upgrading production to Node ≥22.22.1 necessary before Web Chat implementation?

**Not proven necessary, but not safely ruled out either — this is the honest answer, not a hedge.** The specific mechanism the Web Chat design depends on (the WS-context branch of `AuthGuard`) was read in full and contains nothing Node-22-specific. Combined with the fact that the same package is already running in production today (§11) for a different code path, there is a real basis to believe Node 20.20.2 is likely sufficient. But "likely sufficient based on reading one code path" is not the same as "confirmed sufficient" — and the previous technical spike already flagged (as its own risk #1) that the WS-context branch has never actually been exercised in this codebase at all, on any Node version. That gap is independent of and compounds this one.

## 13. Smallest safe upgrade path (if needed) — not performed, described only

If empirical testing (§ Recommendation below) reveals an actual Node-20 incompatibility:

- Target: Node `22.22.1` or later (matching `@thallesp/nestjs-better-auth`'s own stated floor exactly, not an arbitrary newer version).
- Files that would need changing: `apps/api/Dockerfile` line 15 (`FROM node:20-alpine` → `FROM node:22-alpine`), and re-validation that `node:22-alpine` has the same `libc6-compat`/`openssl` package availability the Dockerfile already installs (`RUN apk add --no-cache libc6-compat openssl`) — Alpine package availability can shift between major tags, worth a real build-and-boot test, not assumed.
- Root `package.json` `engines.node` could be tightened from `>=20` to `>=22.22.1` to make the floor honest repo-wide, though this is optional (advisory either way, per §7).
- What needs testing: a full `docker build` + container boot + smoke test of the existing (pre-Web-Chat) staff-auth flow on the new base image, before any Web Chat-specific code is layered on top — isolates whether the base image change itself is safe, independent of anything new being built.

## Recommendation

Do not upgrade Node speculatively. Instead, resolve §11/§12's uncertainty empirically, cheaply, and before committing to full Web Chat implementation: build the minimal real `ChatGateway` spike already recommended as the technical spike's first implementation step (technical spike §9/§10, below) **on the current Node 20.20.2-equivalent environment** (e.g. `node:20-alpine` locally, or directly against a Node 20 install) rather than only on local dev's Node 24.12.0. If the WS-context `AuthGuard` path works correctly under Node 20, §11/§12's uncertainty is closed cheaply and no upgrade is needed. If it fails specifically on Node 20 and succeeds on Node 22+, that failure is direct, unambiguous evidence an upgrade is required — far cheaper to discover this from one small gateway spike than from a full implementation.

## Blocking?

**NO.** Nothing here blocks starting implementation. It does change what "done" looks like for the technical spike's already-recommended first step (build a minimal gateway) — that step should now specifically be run against Node 20, not just local dev's Node 24, so it answers this question as a side effect rather than needing a second dedicated verification pass later.

### Can Web Chat implementation safely proceed while production remains on Node 20.20.2?

**Yes, with one condition attached, not unconditionally.** Implementation work itself (schema, gateway code, UI) can proceed immediately — nothing here blocks starting. But the specific first-step gateway spike recommended by the prior technical spike must be validated against Node 20 (not just local dev's Node 24) before that spike is considered "passed" and before building further layers (persistence, UI) on top of the auth mechanism it validates. This is a sequencing condition on how the first step is verified, not a blocker on starting work.

---

# Technical Spike Result — Better Auth + Socket.IO + Public WebSocket Routing (2026-08-16)

> **AUDIT/SPIKE ONLY. No production files modified, no dependencies installed, no code executed.** All findings below are from direct reads of installed package source (`node_modules`), lockfile contents, and repo config — distinguished explicitly as VERIFIED FROM REPO vs. requires actual experimentation. Full copy also saved to `D:\medcal\docs\claude\lead-management\web-chat-technical-spike.md`.

## 1. Better Auth + Socket.IO

**Status: 🟡 YELLOW — mechanically sound, evidenced by the installed library's own code, but unexercised in this repo. Not RED (no fundamental incompatibility found); not GREEN (nothing has actually been run).**

**Recommendation:** proceed with a NestJS `@WebSocketGateway()` in `apps/api` guarded by `@thallesp/nestjs-better-auth`'s existing `AuthGuard`. Do not build a second/parallel auth mechanism.

**Evidence from current repository (all VERIFIED FROM REPO, i.e. read directly from installed package source, not external docs):**

- `apps/api/src/common/guards/company-role.guard.ts` calls `auth.api.getSession({ headers: fromNodeHeaders(request.headers) })`. Read directly from `better-auth@1.6.27`'s own type/impl files: `fromNodeHeaders` takes a plain `IncomingHttpHeaders` object and the `getSession` endpoint takes a `Headers`-shaped input — **neither depends on an Express `Request` object**, only on a headers map. A Socket.IO handshake's `socket.handshake.headers` is exactly such a map (copied straight from the underlying HTTP Upgrade request).
- The already-installed `@thallesp/nestjs-better-auth@2.7.0` (pinned in `apps/api/package.json`, not a hypothetical) ships this in its own `dist/index.mjs`:
  ```js
  async function getRequestFromContext(context) {
    const contextType = context.getType();
    if (contextType === "ws") {
      return context.switchToWs().getClient();
    }
    return context.switchToHttp().getRequest();
  }
  // inside AuthGuard.canActivate:
  const request = await getRequestFromContext(context);
  const session = await this.options.auth.api.getSession({
    headers: fromNodeHeaders(
      request.headers || request?.handshake?.headers || [],
    ),
  });
  ```
  This is the exact library this repo already depends on, already branching on a NestJS WS execution context, already falling back to `client.handshake.headers`, already calling the same `getSession` call `CompanyRoleGuard` uses today. Its own type docstring states "Supports HTTP, GraphQL and WebSocket execution contexts." This is the strongest single piece of evidence for feasibility — it comes from code already sitting in this repo's `node_modules`, not from Better Auth's general documentation.
- Cookie reachability: in dev, apps/api's session cookie is host-scoped to `localhost:3001` (`COOKIE_DOMAIN=""`); a Socket.IO client connecting directly to that same origin carries the cookie under ordinary same-origin rules — the identical mechanism the portal's `credentials:"include"` fetches already rely on today. In production, `COOKIE_DOMAIN=".kalibrasimedika.co.id"` means the cookie is shared across every `*.kalibrasimedika.co.id` subdomain automatically, which (per §2 below) is exactly where the WS gateway will live.

**Required implementation change (non-blocking, standard additions):**

- Add `@nestjs/websockets` and `@nestjs/platform-socket.io` as real dependencies — **currently only present as declared-but-unsatisfied optional peer dependencies** of `@nestjs/core` and `@thallesp/nestjs-better-auth`; neither is actually installed anywhere in the repo today (confirmed by direct `node_modules` search and `pnpm-lock.yaml` inspection — zero resolved packages for `socket.io`, `ws`, `@nestjs/websockets`, `@nestjs/platform-socket.io`).
- Add Socket.IO's own `cors: { origin, credentials }` config to the gateway when built — this is separate from Nest's HTTP-level `app.enableCors()` and does not exist yet for any WS context (none exists at all today). Reuse the existing `parseTrustedOrigins(process.env.TRUSTED_ORIGINS)` helper already used by `main.ts`'s HTTP CORS setup, rather than inventing a second parsing path.
- **Node engine mismatch, flagged not resolved:** `@thallesp/nestjs-better-auth@2.7.0` declares `"engines": {"node": ">=22.22.1"}`, stricter than this repo's root `"engines": {"node": ">=20"}`. Local dev here runs Node v24.12.0 (satisfies both), so nothing breaks today, but this must be confirmed against whatever Node version actually runs in CI/production before relying on it — not something this spike can resolve by reading code alone.
- **The WS-context branch itself is unexercised** — no `@WebSocketGateway()` exists anywhere in `apps/api/src` today, so this code path has never actually run in this codebase. Reading the library's source proves it _should_ work; it does not prove it _does_ work end-to-end (e.g., whether `switchToWs().getClient()` returns a socket whose `handshake.headers.cookie` is actually populated the way expected once Socket.IO's own CORS/credentials options are layered on top). A small real gateway + a real browser/client connection is the only way to close this gap — recommended as the very first implementation step, not deferred to the end.

## 2. Public WebSocket Routing

**Status: 🟢 GREEN — already solved by existing (proposed, not-yet-applied) infrastructure, not something that needs to be built.**

**Recommendation:** do **not** build a WebSocket proxy inside `apps/web-api`. Serve the chat gateway directly from `apps/api`, reachable at its own dedicated subdomain (`api.kalibrasimedika.co.id`), fronted by Nginx exactly the way REST traffic to `apps/api` already is.

**Current infrastructure evidence (VERIFIED FROM REPO):**

- `infra/nginx/api.kalibrasimedika.co.id.conf.example` — a template file, explicitly labeled "PROPOSED... NOT YET APPLIED," but its content already answers this question. Quoting its own comment directly: **"apps/api serves both REST and the Chat WebSocket gateway from the same origin (locked topology) — Upgrade/Connection headers are required for the WS path to work through the proxy, not just REST."** Someone already made and recorded this decision before this spike began. The config block already forwards `Upgrade`/`Connection` headers correctly:
  ```nginx
  location / {
      proxy_pass http://127.0.0.1:3001;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      ...
  }
  ```
- `docker-compose.prod.yml` — `apps/api` is published as `127.0.0.1:3001:3001` (loopback only, never `0.0.0.0`) with an explicit comment: "reachable from Nginx on the same host but not directly from the Internet." This boundary is **unchanged** by adding a WS gateway — Nginx remains the sole public entry point for `apps/api`, for both REST and WS alike, exactly as already designed.
- `apps/web-api` has **no deployment artifact of any kind** in the repo (no Dockerfile, no compose service, no nginx block) — its own production topology is undetermined/deferred, which independently confirms it is not the intended host for a chat WS proxy; building one there now would mean building proxy infrastructure for an app whose own deployment story doesn't exist yet, solving a problem the repo has already solved differently.
- `apps/web-api/src/index.ts` has zero proxy-capable code today: `app.listen()`'s return value (the underlying `http.Server`, needed to hook the `upgrade` event) is discarded, and no proxy library (`http-proxy-middleware` or otherwise) is a dependency. Building a WS proxy there would mean adding new infrastructure to solve a problem Nginx already solves for `apps/api` directly.

**Architecture comparison (per the three requested):**

|                                     | A. Browser→web-api→proxy→api                                                             | B. Browser→direct public ingress→api (via Nginx)                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Security                            | New proxy code = new attack surface; apps/api boundary unchanged either way              | apps/api boundary unchanged; Nginx is the same trusted front door already used for REST                             |
| Complexity                          | Requires building/maintaining a WS proxy in Express (net-new code, net-new failure mode) | Zero new code — reuses the Nginx template already written for this exact purpose                                    |
| Ops burden                          | web-api needs its own deploy story built first (doesn't exist yet)                       | Nginx block already drafted; only needs the VPS operator to apply it (manual, documented steps already in the file) |
| Consistency with existing decisions | Contradicts the repo's own recorded "locked topology" comment                            | Matches it exactly                                                                                                  |
| Cookie/CORS                         | Adds a second-hop origin, complicating cookie/CORS reasoning                             | Single origin (`api.kalibrasimedika.co.id`), same cookie-domain rules already relied on for REST                    |

**Recommendation: Architecture B.** Not chosen for ease of implementation — chosen because it's what the repository's own infrastructure already declares as the intended design, it doesn't require building anything new in `apps/web-api` (an app with no production deployment story yet), and it preserves the exact security boundary (`apps/api` never directly Internet-facing) that already protects REST traffic today.

**Required infra/code change:**

- Code: none beyond building the gateway itself in `apps/api` (§1) — no new proxy code needed anywhere.
- Infra: apply `infra/nginx/api.kalibrasimedika.co.id.conf.example` (already written, marked "not yet applied" — a VPS-operator action, the file itself documents the exact install steps).
- Config: add Socket.IO's own CORS allowlist to the future gateway (§1) — the public web (`kalibrasimedika.co.id`) and portal (`apps.*`/`portal.*`) origins need to be in it, same list already used for `TRUSTED_ORIGINS`.

## 3. Recommended Final Topology

```
                 Visitor browser                    Staff browser (portal)
                        │                                    │
         wss://api.kalibrasimedika.co.id         wss://api.kalibrasimedika.co.id
                        │                                    │
                        └──────────────┬─────────────────────┘
                                       Nginx (TLS termination,
                                       Upgrade/Connection header
                                       forwarding — already templated)
                                        │
                                proxy_pass http://127.0.0.1:3001
                                        │
                              ┌─────────▼─────────┐
                              │     apps/api        │
                              │   (NestJS, 127.0.0.1 only,
                              │    never public directly)
                              │                     │
                              │  REST controllers    │
                              │  ChatGateway (Socket.IO,
                              │    new @WebSocketGateway) │
                              │  Better Auth          │
                              │  Prisma → Postgres    │
                              └─────────────────────┘

apps/web-api remains unchanged: still only handles the two existing
HTTP creation-boundary routes (/public/contact-messages,
/public/web-chat → soon /public/chat-sessions), still fetch()-forwards
to apps/api's internal REST routes, still not part of the WS path at all.
```

## 4. Authentication Flow — Staff

```
Portal browser (apps.kalibrasimedika.co.id / portal.kalibrasimedika.co.id)
  → Socket.IO client connects to wss://api.kalibrasimedika.co.id
  → browser attaches Better Auth session cookie automatically
    (same-origin-to-cookie-domain rules — cookie domain is
    .kalibrasimedika.co.id in prod, covers this subdomain)
  → Nginx forwards the Upgrade request unchanged (headers intact)
  → apps/api's ChatGateway, guarded by @thallesp/nestjs-better-auth's
    AuthGuard (ws-context branch, §1) extracts session via
    auth.api.getSession({ headers: fromNodeHeaders(socket.handshake.headers) })
  → session → UserMembership lookup (companyId from process.env.COMPANY_ID,
    same derivation CompanyRoleGuard already uses — never client-supplied)
  → new `chat` RBAC permission check (mirrors lead:["read","update"]'s
    per-verb pattern, exact action set flagged as unresolved in the
    correction audit's §13)
  → connection accepted, socket joins company-scoped room
```

## 5. Visitor Authentication Flow

```
Visitor browser (kalibrasimedika.co.id)
  → POST /public/chat-sessions (apps/web-api, unchanged CAPTCHA/rate-limit
    boundary, per the correction audit §7) → apps/api creates ChatSession +
    ContactMessage → apps/api sets a signed, HttpOnly, Secure, SameSite=Lax
    ChatSessionToken cookie, domain .kalibrasimedika.co.id in prod
  → Socket.IO client connects to wss://api.kalibrasimedika.co.id
  → browser attaches the ChatSessionToken cookie automatically (same
    cookie-domain mechanism as the staff flow, §4 — the two token types are
    symmetric in how they reach the gateway, asymmetric in what they prove)
  → ChatGateway's visitor-namespace guard verifies the signed token
    (not Better Auth — a separate, purpose-built check), derives sessionId
    from the token's own payload — NEVER from a client-supplied "join"
    argument (this is the exact fix for Bumiindah's core flaw, per the
    correction audit §1/§10)
  → connection accepted, socket joins session_<id> room only
```

## 6. Authorization Model

- **Handshake-time:** both flows above — session/token validated once, at connection.
- **Per-event (recommended, not yet implemented anywhere):** re-check company/permission scope on the events that matter — a staff socket sending a reply or closing a conversation should re-verify the target `ChatSession.companyId` matches the connected user's own company on every such event, not rely solely on the handshake-time check, since a socket can remain open across a session expiry or a staff permission change. A visitor socket's every `send_message` event should re-derive `sessionId` from the token already validated at handshake (never trust a client-supplied session id in the event payload either).
- **Tenant/company resolution:** unchanged from the rest of the system — exclusively server-derived from `process.env.COMPANY_ID`, never a client-supplied field, at both handshake and per-event checks.
- **Not resolved by this spike (flagged, not silently assumed):** what happens when a staff member's Better Auth session expires while their socket stays open. Nothing in the current stack auto-invalidates an open WS connection when the underlying HTTP session expires — this needs either a periodic re-validation timer or an explicit "accept until disconnect" v1 tradeoff, and that's a design decision for the implementation phase, not something this spike can resolve by reading code.

## 7. Required Dependencies

**Already installed:**

- `better-auth@1.6.27`, `@thallesp/nestjs-better-auth@2.7.0` (with the WS-context branch already present, §1).
- `@nestjs/core@11.1.28`, `@nestjs/platform-express@11.1.28`.

**Must be added:**

- `@nestjs/websockets`, `@nestjs/platform-socket.io` — currently unsatisfied optional peer dependencies, need to become real dependencies.
- (implicitly, as `@nestjs/platform-socket.io`'s own dependency) `socket.io` server package.
- `socket.io-client` in `apps/web` and `apps/portal` (neither currently has any WS client).

**Not required:**

- `http-proxy-middleware`, `ws` (raw), or any proxy library in `apps/web-api` — Architecture B (§2) means `apps/web-api` needs no changes for WS at all.
- Redis/any distributed adapter — single-process `apps/api` deployment (confirmed by `docker-compose.prod.yml`, one `api` service, no horizontal scaling config anywhere in the repo) means Socket.IO's default in-memory adapter is sufficient; revisit only if `apps/api` is ever scaled to multiple instances.

## 8. Production Changes Required Before Web Chat Implementation

### Code

- Add the two NestJS WS packages (§7) to `apps/api`.
- Build `ChatGateway` in `apps/api` with two guarded namespaces (staff via `AuthGuard`'s ws-context path, visitor via a new `ChatSessionToken` verifier) — per the correction audit's §6/§7/§12 implementation scope, unchanged by this spike.
- Add Socket.IO's own CORS config to the gateway (§1).

### Infrastructure

- Apply `infra/nginx/api.kalibrasimedika.co.id.conf.example` (VPS-operator action, already documented in the file itself — not automated by this repo).
- Confirm the actual CI/production Node version satisfies `@thallesp/nestjs-better-auth`'s `>=22.22.1` floor (§1) — currently unconfirmed against the repo's own stated `>=20` floor.

### Configuration / Environment Variables

- None new required beyond what's already templated (`TRUSTED_ORIGINS`, `COOKIE_DOMAIN` already cover the WS gateway's needs since it lives on `apps/api`'s existing origin) — reuse, don't duplicate.

### Security

- Build the `ChatSessionToken` signing/verification helper (correction audit §4/§6) — not yet designed in detail, only its shape (signed, HttpOnly, Secure, SameSite=Lax) is locked.
- Decide the mid-connection session-expiry behavior (§6) before shipping, not after.
- New `chat` RBAC resource/action set in `packages/auth/src/access-control.ts` — exact actions still flagged unresolved (correction audit §13, item 7).

## 9. Risks (real, repo-discovered — not hypothetical)

1. **The WS-context branch in `@thallesp/nestjs-better-auth` has never been exercised in this codebase.** Reading its source proves the mechanism should work; only building a real gateway and connecting a real client proves it does. Recommended as the literal first step of implementation, before any UI or Prisma model work.
2. **Node engine mismatch** (`@thallesp/nestjs-better-auth` wants `>=22.22.1`, repo states `>=20`) — needs confirming against actual deploy/CI Node version, not assumed compatible just because local dev happens to satisfy it.
3. **Nginx config is not yet applied** — a real, outstanding manual VPS step, not something this repo's tooling does automatically. Chat cannot go live in production until this is done, independent of any code readiness.
4. **`apps/web-api`'s own production deployment doesn't exist yet at all** — irrelevant to the WS path (§2), but worth naming since two of the correction audit's earlier files (`public-web-chat-schema.ts` route wiring) live there and will eventually need their own deploy story regardless of chat.

Not flagged as risks (no evidence found for them, not invented): distributed rate-limiting need, Redis/multi-instance scaling, CDN/WAF interaction with WS — none of these have any basis in the current single-VPS, single-`apps/api`-instance deployment evidenced by the repo.

## 10. Final Recommendation

**Proceed to Web Chat implementation with the architecture above — Architecture B (direct-to-`apps/api` via the already-templated Nginx block), staff auth via `@thallesp/nestjs-better-auth`'s existing WS-context `AuthGuard` path, visitor auth via a new signed `ChatSessionToken`.** This is not a vague "it depends" — both open questions from the correction audit (§13 items 1 and 3) are resolved by direct evidence, not preference.

**BLOCKING** (must happen before implementation starts, not during):

- None. Both major uncertainties resolved GREEN/mechanically-sound. There is no fundamental architectural blocker.

**NON-BLOCKING but must happen before this ships to production** (can proceed with implementation now, resolve these in parallel or before the production cutover specifically):

- Build and empirically verify a minimal real gateway (§9 risk 1) — first implementation step, not a pre-implementation gate.
- Confirm production Node version against the `>=22.22.1` requirement (§9 risk 2).
- Apply the Nginx config (§9 risk 3) — an ops task with no code dependency, can happen in parallel with implementation.
- Resolve the mid-connection session-expiry design decision (§6, §8) before writing the guard's final version — small design decision, not a spike blocker.

### Can we safely proceed to Web Chat implementation with the current architecture?

**Yes.** Prerequisites before starting: none blocking. Recommended first implementation step specifically: build the minimal `ChatGateway` + staff `AuthGuard` wiring in isolation first (§9 risk 1) to empirically confirm the WS-context session validation actually works end-to-end, before building out `ChatSession`/`ChatMessage` persistence or any UI on top of it — this closes the one real unproven assumption cheaply, before more is built on top of it.

---

# Web Chat Real-Time Architecture — Correction Audit (2026-08-16)

> **AUDIT ONLY. NO CODE CHANGES.** Supersedes the single-shot-form framing of the Web Chat sections below (kept further down for historical record) with a corrected, real-time conversational-chat architecture. Verified against `d:\medcal` (current repo state) and `D:\website-bumiindah` (workspace pulling in `client-bip-website`, `client-bis-website`, `server-bumiindah-website`, plus the adjacent `D:\bi-erp\server-bi-erp` and `D:\bi-erp\easy-app`, which together form the live Bumiindah chat system). Full copy also saved to `D:\medcal\docs\claude\lead-management\web-chat-realtime-architecture-audit.md`.

## Corrected product requirement

MedCal Web Chat is a real-time, human-to-human conversation — not a form. Visitor provides `name`+`email`+first `message` → a `ChatSession` is created → the first message is persisted → staff sees it in the admin app → staff replies → visitor sees the reply live → conversation continues. The earlier "no ChatSession/ChatMessage/realtime" decision is superseded. Field constraints are unchanged: still exactly `name`/`email`/`message`, still no phone/organizationName/topicId, still `getFrom=CHAT_PERSON`, still no AI/human mode — this correction is about _transport and persistence_, not about reopening the low-commitment product framing.

---

## 1. Bumiindah Chat Architecture (as found in the repo, not the screenshot)

The "one product" is actually **three services sharing one Prisma/Postgres schema**, bridged by plain HTTP calls — not one coherent system:

- `server-bumiindah-website` (Express, visitor-facing) — its own raw **`ws`** WebSocket server (`src/websocket/secureChatWebSocketServer.ts`, path `/ws`), custom JSON protocol.
- `server-bi-erp` (NestJS, admin-facing, the real backend behind `apps.bumiindah.co.id`) — **Socket.IO** via `@nestjs/platform-socket.io` (`src/chat/chat.gateway.ts`), namespace `/chat`.
- `easy-app` (Next.js admin dashboard) — `socket.io-client` + a custom JWT bearer/refresh auth flow (not Better Auth).

These two backends do **not** share a socket layer — a visitor's WS message and its appearance on the admin dashboard are two separate hops through the DB plus HTTP-forwarding calls (`fcmNotificationService.forwardNewMessage`, `/admin/typing`, `/customer/typing`). This bifurcated-transport pattern is a structural weakness, not a feature — flagged below as explicitly **DO NOT COPY**.

**Data model** (`server-bumiindah-website/prisma/schema.prisma`):

- `ChatSession { id, status(PENDING/ASSIGNED/CLOSED), mode(AI_ONLY/AI_WITH_HUMAN/HUMAN_ONLY), topicId, assignedTo, name/company, firstHumanReplyAt/firstAiReplyAt/closedAt, company_id, createdAt/updatedAt }` — `id` is **client-generated** (`chat_<timestamp>_<rand>` from the website, or a real `uuidv4()` on the NestJS create path — inconsistent even within Bumiindah itself).
- `ChatMessage { id, sessionId, chatStatus(PENDING/SENT/READ/REPLIED/CLOSED), role(USER/PIC/AI), senderId, content, createdAt, createdBy }`.
- Plus `ChatHistory` (AI Q&A log), `ChatAssignment`, `ChatAuditLog`, `ChatIPTracking`, `ChatTopic`, `ChatPICAssigned` — support tables, mostly AI/assignment/audit machinery MedCal doesn't need.

**Security findings — significant, must inform the "do not copy" list:**

- **No signed visitor session token anywhere.** The frontend does `localStorage.setItem('chat_session_id', generateSessionId())` (`session-utils.ts`) and that same client-chosen string _is_ the DB primary key and the sole access credential. **Knowledge of the session id is the only thing gating `GET /api/chat/history/:sessionId`** (`chatController.ts:getChatHistory` — `prisma.chatSession.findUnique({ where: { id: sessionId } })`, **no ownership check at all**). Anyone who obtains/guesses a session id can read that visitor's full transcript.
- The NestJS side does check `company_id` (tenant-level, not per-conversation) but that value is caller-supplied via query param — not derived server-side the way MedCal's own guards do it.
- Every chat route on the NestJS admin backend — including admin-only actions (`assign`, `mark-read`, `mode`, `close`) — is decorated `@Public()` (`chat.controller.ts`), so the app's own global `JwtAuthGuard` **never runs for chat at all**. Authorization is enforced only at the `easy-app` UI layer (redirect-on-401), not at the API. This is a real security antipattern, not an MVP shortcut worth emulating.
- Socket.IO's `handleConnection` auto-joins **every** connecting socket into `admin_room` with zero auth check.
- "Online" presence is fake: `isOnline: session.status !== 'CLOSED'` (`useChatQueries.ts`) — not tied to an actual live connection.
- No message ordering guarantee beyond `createdAt` + `orderBy: asc` (no sequence number); no idempotency/dedup mechanism at all (every send is a bare `create()`).

**Real-time mechanics worth learning from (not copying wholesale):**

- DB-write-before-broadcast (`prisma.chatMessage.create()` happens before the socket emit) — correct pattern, worth keeping.
- Client-side reconnect: `ws.onclose` → `setTimeout(..., 2000)` retry; server pings every 30s, drops idle >120s. Socket.IO admin client uses built-in exponential backoff.
- Unread count = `chatMessage.count({ role: USER, chatStatus: PENDING })`, admin list polls every 10s (TanStack Query `refetchInterval`) _in addition to_ the Socket.IO push — belt-and-suspenders, reasonable.
- AI/human hybrid mode (`ChatMode` enum, OpenAI-backed auto-replies, PIC takeover) — **explicitly out of scope for MedCal** per the standing hard constraint; not evaluated further.

---

## 2. MedCal Current Architecture

**The just-built "Web Chat" is a single-shot form, confirmed by direct code read — not a chat:**

- `apps/web/src/components/web-chat-bubble.tsx`: one POST, static success text, `values` reset to empty after submit, **no session id, no thread, no memory of a prior submission** — reopening the bubble always starts fresh.
- `apps/web-api/src/index.ts` `/public/web-chat`: validates → CAPTCHA (`webchat_submit` action) → forwards once to `apps/api`'s `POST internal/contact-messages` with `getFrom: "CHAT_PERSON"` hardcoded after the spread → proxies the response back. One request, one response, done. No streaming.
- `apps/web-api/src/public-web-chat-schema.ts`: `{name, email, message, captchaToken}` only — confirms the locked field constraint is already correctly implemented and doesn't need to change.

**ContactMessage/Lead pipeline (confirmed unchanged, channel-agnostic, correct as-is):**

- `ContactMessagesService.create()` (`apps/api/src/modules/contact-messages/contact-messages.service.ts`) does Customer-email-dedup, then Lead identity matching (`lead-matching.ts` — phone+org+email only, `getFrom` never read), then creates the `ContactMessage` row. This logic must not change.
- `grep` for `ChatSession`/`ChatMessage` across the entire repo: **zero matches**. Confirmed greenfield.

**No realtime infrastructure exists anywhere in the monorepo:** a repo-wide grep for `socket.io|websocket|server-sent-events|eventsource|\bws\b|long-polling|@nestjs/websockets|@nestjs/platform-socket` across `apps/*` and `packages/*` returns **zero matches**. This is the first realtime feature in this codebase.

**Portal (`apps/portal`) has no live-data mechanism today either** — Lead Inbox (`management/leads/page.tsx`) is fetch-on-mount + fetch-after-mutation only, no polling interval, no SWR/React Query, no socket client. Adding chat will be the portal's first push-based UI.

**Auth boundaries (unchanged, must be respected by the new design):**

- `CompanyRoleGuard` (Better Auth session + `UserMembership` lookup) for staff; `InternalServiceGuard` (shared-secret header) for `web-api → api` service calls. Both derive `companyId` **exclusively** from `process.env.COMPANY_ID` — never client input. Neither guard currently has a concept of an _anonymous authenticated visitor_ — that's a genuine gap the new design must fill, not paper over.
- `apps/api` is NestJS with **no** `@nestjs/websockets`/`@nestjs/platform-socket.io`/`ws` installed today — realtime transport is a net-new dependency either way.
- RBAC catalog (`packages/auth/src/access-control.ts`) is minimal and per-verb (`contactMessage:["read"]`, `lead:["read","update"]`, `whitelist:["manage"]`) — a new `chat` resource would follow the same narrow pattern.
- CAPTCHA (`verifyRecaptcha`, action-scoped, fails closed) and two independent per-route `express-rate-limit` instances (`contactFormLimiter`, `webChatLimiter`) exist only at the web-api edge, only guarding the initial POST — neither concept maps directly onto a persistent connection sending many messages; the new design must decide where CAPTCHA moves to (session creation only) and how per-message abuse is throttled once connected.

---

## 3. Architecture Comparison

| Concern                   | Bumiindah                                                | MedCal today                                                                 | Implication                                                                                                   |
| ------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Chat session id           | Client-generated, IS the auth credential                 | N/A (no chat exists)                                                         | MedCal must not repeat this — session id must not double as authorization                                     |
| Visitor session security  | None — localStorage string only                          | N/A                                                                          | MedCal already has a locked answer for this (see §6) — must actually use it                                   |
| Real-time transport       | Two transports (raw `ws` + Socket.IO), HTTP-bridged      | None                                                                         | MedCal should pick **one** transport, co-located with the existing NestJS app — avoid Bumiindah's bifurcation |
| Admin auth on chat routes | Decorated `@Public()` everywhere — not actually enforced | `CompanyRoleGuard` enforced on every Lead/ContactMessage route               | MedCal must actually enforce auth on chat admin routes/gateway handlers, unlike Bumiindah                     |
| Presence indicator        | Fake (ticket-status-based, not connection-based)         | N/A (already decided against in the first-pass Web Chat review)              | Reaffirms the earlier decision — now with concrete evidence of why a fake indicator is a bad idea             |
| Message ordering          | `createdAt` only, no sequence                            | N/A                                                                          | MedCal can cheaply do better (see §6)                                                                         |
| Dedup/idempotency         | None                                                     | N/A                                                                          | MedCal can cheaply do better (see §6)                                                                         |
| Company/tenant scoping    | Client-supplied `company_id` query param                 | Exclusively server-derived from `process.env.COMPANY_ID`, never client input | MedCal's existing pattern is already stricter — must carry it forward unchanged into the chat gateway         |
| AI mode                   | Hybrid AI/human, mode switching                          | Explicitly forbidden by product decision                                     | Not evaluated further, confirmed out of scope                                                                 |

---

## 4. Recommended MedCal Real-Time Architecture (minimum viable)

- **Transport: Socket.IO via `@nestjs/platform-socket.io`, gateway lives inside `apps/api`** (the existing NestJS app — one process, one Prisma connection, one deployment unit), not a second standalone `ws` server. Avoids Bumiindah's two-transport-bridged-by-HTTP mistake.
- **Public reachability:** `apps/api`'s internal port is documented today as intentionally not publicly network-reachable (the entire `InternalServiceGuard` trust model rests on this). The chat gateway must not silently break that boundary. Recommended default: `apps/web-api` (the public edge) proxies the WebSocket upgrade through to `apps/api`'s gateway (e.g. `http-proxy-middleware` with `ws:true`), keeping `apps/api` off the public network exactly as today. This is flagged as needing infra/ops sign-off in §13, not silently assumed.
- **Visitor session security:** a signed, `HttpOnly`, `Secure`, `SameSite=Lax` cookie-based `ChatSessionToken`, issued by `apps/api` at session creation, scoped to the shared parent domain — **this is not new; it's the design already locked in `docs/claude/lead-management/final-before-locked.md`** during the original Lead Inbox review ("a signed, opaque ChatSessionToken issued by apps/api... revocable/expirable, not authentication") which was deferred at the time as "MVP, not Foundation." That deferral is now lifted. The DB row id (`ChatSession.id`) stays an opaque `cuid()` but is never itself the authorization check — the signed cookie is. This directly fixes Bumiindah's core flaw (session-id-as-credential).
- **Message ordering:** add a lightweight `seq Int @default(autoincrement())` on `ChatMessage`, ordered by `seq` not `createdAt` — cheap, removes Bumiindah's same-millisecond ambiguity.
- **Duplicate-submission prevention:** client mints a UUID per outgoing message (`clientMessageId`); `@@unique([sessionId, clientMessageId])` on `ChatMessage` — a resend after a dropped ack is a no-op, not a duplicate row. Bumiindah has no equivalent.
- **Persistence:** DB-write-before-broadcast (`prisma.chatMessage.create()` then `server.to(room).emit(...)`) — same correct order Bumiindah already uses, worth keeping.
- **Reconnect:** Socket.IO's built-in exponential-backoff client reconnect (cookie is sent automatically on the handshake, no localStorage needed) + a REST `GET` history-fetch-on-reconnect as the correctness backstop, so a client that missed events while disconnected resyncs from persisted state rather than relying purely on live delivery.
- **Admin auth:** the existing Better Auth session cookie (already same-origin with `apps/api`) validated at the Socket.IO handshake, plus a real permission check (new `chat` RBAC resource, §9) enforced on every admin-facing gateway handler — explicitly not Bumiindah's `@Public()`-everywhere pattern.
- **Admin UI:** conversation list → selected conversation → message history → composer, in `apps/portal` (new page under `management/`), using `socket.io-client` (new dependency, none exists in the portal today). Visitor identity (`name`/`email`) shown immediately from `ChatSession`, never a "Customer N" placeholder — MedCal already has the identity at session-creation time, unlike Bumiindah's model where names arrive mid-conversation.
- **Visitor UI:** the current bubble's visual chrome (fixed position, Popover shell, brand styling) is retained; its internal state machine changes from "one-shot form" to a session-aware thread (see §9).
- **No presence indicator, no typing indicators, no AI/human mode** — all explicitly excluded from this minimum architecture (presence per the original locked decision, reinforced by Bumiindah's fake-presence evidence; typing indicators as a non-essential nice-to-have deferred past MVP; AI mode per the hard product constraint).

---

## 5. ContactMessage / Lead Integration

**Recommended relationship: `ChatSession` optionally references one `ContactMessage`, created exactly once, at session-creation time — not once per chat message.**

```
ChatSession (1) ──contactMessageId──> ContactMessage (the lead-intake entry point)
     │
     └── ChatMessage (N)   — the actual conversation transcript
```

Why this shape and not the reverse (ContactMessage referencing ChatSession, or one ContactMessage per chat message):

- **Lead matching must keep running exactly once per conversation**, against the visitor's declared identity (`name`+`email`) at the moment they start chatting — not re-run or re-triggered by every subsequent message. Making `ChatSession` the thing that owns a single `contactMessageId` preserves the already-correct, already-tested "STRONG/POSSIBLE/NONE decided once" behavior with zero changes to `ContactMessagesService`/`lead-matching.ts`.
- **`ContactMessage` stays channel-agnostic**, as it already is today (§2) — it should not need to know a live conversation exists behind it. It remains exactly what it already is: a snapshot lead-intake record, now with one specific instance additionally referenced by a `ChatSession`.
- **Lead Inbox / Needs Review must not be flooded** with one row per chat message — only the conversation's opening message enters that pipeline, matching the existing MVP's "first-touch" mental model.
- Staff working a Lead in Lead Detail should be able to jump to the live transcript if the linked `ContactMessage` came from a chat: additive UI only (a "Lihat percakapan →" link when `ContactMessage.chatSessionId`/`ChatSession.contactMessageId` is set), no change to the existing Lead Detail timeline logic.

The very first message the visitor types is therefore used twice, for two different purposes, without duplicating data: it becomes `ContactMessage.message` (lead-intake pipeline, unchanged) **and** the first row in `ChatSession.messages` (conversation transcript, new) — created in the same request that establishes the session.

---

## 6. Data Model Proposal (proposal only — not implemented)

```prisma
enum ChatSessionStatus { OPEN CLOSED }
enum ChatSenderType    { VISITOR STAFF }

model ChatSession {
  id               String            @id @default(cuid())
  companyId        String
  visitorName      String
  visitorEmail     String
  status           ChatSessionStatus @default(OPEN)
  contactMessageId String?           @unique   // the one Lead-pipeline entry point, set at creation
  lastMessageAt    DateTime?
  closedAt         DateTime?
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt

  company        Company         @relation(fields: [companyId], references: [id], onDelete: Cascade)
  contactMessage ContactMessage? @relation(fields: [contactMessageId], references: [id])
  messages       ChatMessage[]

  @@index([companyId, status, lastMessageAt])
}

model ChatMessage {
  id              String      @id @default(cuid())
  sessionId       String
  seq             Int         @default(autoincrement())  // ordering, cheap fix vs. Bumiindah's createdAt-only approach
  senderType      ChatSenderType
  senderUserId    String?                                    // set when senderType = STAFF
  clientMessageId String?                                    // idempotency key from the sending client
  body            String
  createdAt       DateTime       @default(now())

  session ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@unique([sessionId, clientMessageId])
  @@index([sessionId, seq])
}
```

Deliberately **not** proposed (Bumiindah has these, MedCal doesn't need them for a minimum viable human-only chat): `ChatMode`/AI fields, `ChatHistory` (AI Q&A log), `ChatAssignment`/`ChatPICAssigned` (Lead assignment is already deferred — no reason for chat to have it first), `ChatAuditLog`, `ChatIPTracking`, `ChatTopic` (topic is already excluded from Web Chat's intake fields).

The visitor-security token (`ChatSessionToken`, §4) is **not** a DB model — it's a signed cookie value (e.g. HMAC over `{sessionId, expiry}` with a server secret), validated at connection time, never persisted as its own table row (consistent with the original locked design's "revocable/expirable... not authentication" framing — a stateless signed token needs no storage).

---

## 7. API / Transport Proposal (proposal only — not implemented)

- `POST /public/chat-sessions` (apps/web-api, new — sibling of today's `/public/web-chat`) — reuses `publicWebChatSchema`'s validation shape, reuses `webChatLimiter`-style dedicated rate limiter, reuses `verifyRecaptcha(token, "webchat_submit")` at this one creation boundary only. Forwards to a new `apps/api` internal endpoint that, in one transaction, creates the `ContactMessage` (existing `ContactMessagesService.create`, unchanged, `getFrom: "CHAT_PERSON"` still hardcoded after the spread) **and** the `ChatSession` + first `ChatMessage`, then sets the signed `ChatSessionToken` cookie on the response.
- `GET /public/chat-sessions/current` or equivalent (apps/web-api → apps/api) — reconnect/history-resync path: validates the `ChatSessionToken` cookie, returns the session + message history, used on page reload and on WS reconnect.
- **WS gateway** (`apps/api`, new `ChatGateway`): visitor namespace validates the `ChatSessionToken` cookie at handshake (no Better Auth session — visitors are anonymous); staff namespace validates the existing Better Auth session + a new `chat:read`/`chat:reply` permission (§9). Both join a `session_<id>` room; staff additionally joins a company-scoped `company_<id>_chat` room for the live conversation list.
- Public reachability of the gateway: proxied through `apps/web-api`, per §4 — flagged for infra confirmation in §13.

---

## 8. Security Model

- **Visitor session authorization:** signed `ChatSessionToken` cookie, not a guessable/client-chosen id (directly fixes Bumiindah's worst flaw, §1).
- **Tenant isolation:** unchanged — `companyId` resolved exclusively from `process.env.COMPANY_ID` server-side, at both the session-creation REST call and the WS handshake; never accepted from any client-supplied field (unlike Bumiindah's client-supplied `company_id` query param).
- **CAPTCHA:** enforced once, at `POST /public/chat-sessions` (session creation), action-scoped (`webchat_submit`, unchanged), fails closed — matches today's implementation exactly for this one boundary. Per-message CAPTCHA inside an open connection is not proposed (not how reCAPTCHA v3 is meant to be used) — abuse _within_ an open connection is instead handled by:
- **Per-connection message-rate limiting:** a lightweight in-gateway limit (e.g. N messages per M seconds per socket) — a new, WS-specific mechanism, since `express-rate-limit` only covers HTTP routes.
- **Admin authorization:** every admin-facing gateway handler and REST route must actually enforce the guard/permission check — explicitly not Bumiindah's `@Public()`-on-everything pattern (§1, §3). New `chat` RBAC resource (§9), no blanket `manage`.
- **Internal API exposure:** unchanged — `apps/api`'s internal routes stay off the public network; the WS gateway's public reachability goes through the `web-api` proxy (§4), preserving the existing boundary rather than punching a new hole in it.
- **Duplicate/replay:** `clientMessageId` uniqueness constraint (§6) — a resend after a dropped ack or a reconnect-triggered replay is idempotent, unlike Bumiindah (§1).
- **Message length:** recommend the same 2000-char cap already enforced on the first message (`publicWebChatSchema`) applied to subsequent in-thread messages too, for consistency — flagged as confirmable, not silently asserted, in §13.

---

## 9. UX Flow

**Visitor states:** `CLOSED → OPEN (no active session → name/email/message start form) → SESSION_CREATING → CONNECTED (thread + composer, live via WS) → SENDING → RECEIVING (admin reply appended live) → DISCONNECTED (reconnecting banner) → RECONNECTING → SERVER_ERROR → SESSION_CLOSED (staff closed it; visitor may start a new one)`. On mount, if a valid `ChatSessionToken` cookie exists for a non-closed session, skip the start form entirely and go straight to `CONNECTED` (fetch history via REST, then attach WS) — this is the direct fix for today's "reopening always starts fresh" gap (§2).

**Admin states/flow:** conversation list (company-scoped, `OPEN` first, unread-aware) → select a conversation → identity shown immediately (`visitorName`/`visitorEmail`, no placeholder) → message history → composer → send (WS, DB-write-before-broadcast) → optionally close the conversation.

Explicitly **not** in the minimum viable set: typing indicators, presence/online dot, AI mode, session assignment/ownership (mirrors Lead's own deferred assignment, §13).

---

## 10. Bumiindah Features — Reuse vs. Adapt vs. Reject

**REUSE (pattern, not code):**

- `ChatSession` → many `ChatMessage` domain shape.
- DB-write-before-broadcast persistence order.
- Reconnect-with-backoff client behavior.
- Company-scoped conversation list with an unread count derived from message state.

**ADAPT (same idea, done more safely):**

- Session identity → signed cookie token instead of a client-chosen/guessable id (§4, §8).
- Single real-time transport co-located with the existing NestJS app, instead of two bridged transports (§4).
- Ordering → add a `seq` column instead of relying on `createdAt` alone (§6).
- Idempotency → add `clientMessageId` uniqueness, which Bumiindah has none of (§6, §8).
- Unread/read state → same concept, scoped to MedCal's existing `ContactStatus`-adjacent conventions rather than a new bespoke enum sprawl.

**DO NOT COPY:**

- Client-generated session id doubling as the access credential.
- `@Public()` on every admin chat route (auth not actually enforced at the API layer).
- Two independent realtime servers bridged by HTTP polling/webhooks.
- Fake presence indicator (ticket-status, not connection-based).
- AI/human mode switching (`ChatMode` enum) — forbidden by MedCal's own product constraint regardless of Bumiindah's implementation quality.
- `ChatAuditLog`/`ChatIPTracking`/`ChatPICAssigned`/`ChatAssignment` support tables — no evidenced MedCal need for any of them at MVP.
- Custom hand-rolled JWT auth for the admin dashboard — MedCal already has Better Auth, no reason to diverge.

---

## 11. Migration From the Current (Incorrect) Implementation

**RETAIN as-is:**

- Field constraints: `name`/`email`/`message` only, no phone/organizationName/topicId — unaffected by this correction.
- `getFrom: "CHAT_PERSON"` hardcoded server-side after the spread, `InternalServiceGuard`/company-scoping pattern — unchanged, now the entry point fires once per `ChatSession` instead of once per submission (same call, different trigger point).
- `publicWebChatSchema`'s validation shape — becomes the validator for the new `POST /public/chat-sessions` creation payload.
- CAPTCHA-at-creation-boundary pattern and the dedicated `webChatLimiter`-style rate limiter — both still needed, just retargeted to the session-creation endpoint.
- The bubble's visual chrome: fixed position/z-index/mount-point in `layout.tsx`, `brand` token styling, the Base UI `Popover` shell.

**MUST BE REPLACED:**

- The core interaction model: today's single fire-and-forget POST-and-done must become a two-part flow — create session (REST, once) + persistent live connection (WS, ongoing).
- `web-chat-bubble.tsx`'s internal state (`values` reset on success, no persisted identifier, static confirmation-only success branch) — replaced by the session-aware state machine in §9.
- `POST /public/web-chat`'s "complete in one call" semantics — becomes `POST /public/chat-sessions`, which starts a session rather than closing out an interaction.

**MUST BE EXTENDED (net new, not replacing anything):**

- `ChatSession`/`ChatMessage` Prisma models + migration (§6).
- `apps/api` `ChatGateway` module (§7).
- WS proxy at `apps/web-api` or an infra-level routing decision (§4, flagged in §13).
- Admin chat UI in `apps/portal` (§4, §9).
- New `chat` RBAC resource (§9... see also §13 for the exact action set, not yet decided).
- Reconnect/history-resync REST endpoint (§7).

**EVENTUALLY REMOVED** (once the above lands): the current single-shot handler's "one POST = one complete interaction" code path in `apps/web-api/src/index.ts`'s `/public/web-chat` route (its validation/CAPTCHA/rate-limit scaffolding is retained, just re-wired onto the new session-creation route) and the bubble's static success-only UI branch.

---

## 12. Implementation Scope (proposed, for a future implementation phase — not this one)

- `packages/db/prisma/schema.prisma` — add `ChatSession`/`ChatMessage`/enums, new migration.
- `apps/api/src/modules/chat/` (new module) — `chat.gateway.ts`, `chat.service.ts`, `chat.controller.ts` (REST: create session, get history).
- `apps/api/src/common/` — visitor `ChatSessionToken` issuing/verification helper (signed cookie), new guard for the WS visitor namespace.
- `packages/auth/src/access-control.ts` — new `chat` resource.
- `apps/web-api/src/` — new `public-chat-session-schema.ts` (adapted from `public-web-chat-schema.ts`), new `/public/chat-sessions` route + dedicated rate limiter, WS proxy wiring.
- `apps/web/src/components/web-chat-bubble.tsx` — rewritten state machine, `socket.io-client` added as a new dependency.
- `apps/portal/` — new `management/chat`-equivalent admin page(s), `socket.io-client` added as a new dependency, an additive link from Lead Detail to a linked `ChatSession`.
- `packages/shared/src/schemas/` — new Zod schemas for session-create and WS message payloads.

---

## 13. Risks / Open Decisions (must be resolved before implementation)

1. **WS public reachability** — proxy through `apps/web-api` (recommended default, §4) vs. a direct infra-level ingress rule to `apps/api`'s gateway port. This is partly an ops/networking decision, not purely code; needs sign-off from whoever manages deployment.
2. **Session ownership/assignment** — should a `ChatSession` be claimable/assignable to a specific staff member (mirroring Lead's `assignedToUserId`, itself deferred in the original Lead Inbox review), or stay a shared inbox for MVP? Recommend deferring for consistency, but this is a product call, not a technical one.
3. **Better Auth session validation inside a Socket.IO handshake** — technically unverified by this audit; `apps/api` uses `@thallesp/nestjs-better-auth`, and whether its session-reading helper works cleanly at WS-handshake time (vs. only in an HTTP request context) needs a small technical spike before implementation starts.
4. **`express-rate-limit`'s in-memory (non-distributed) store** — acceptable at current scale for gating session _creation_, but flag if `apps/web-api` ever runs multiple instances, since the store wouldn't be shared.
5. **Conversation retention/auto-close policy** — not specified anywhere; needs a product decision (e.g. auto-close after N days idle) before implementation, not something to invent silently.
6. **In-thread message length cap** — recommend reusing the existing 2000-char limit for consistency; needs explicit confirmation, not assumed.
7. **Exact `chat` RBAC action set** — `chat:["read","reply"]` is a reasonable per-verb guess mirroring `lead`'s pattern, but not yet confirmed against a concrete route list the way `lead:["read","update"]` was derived from an actual finished endpoint set.

**This audit defines the architecture sufficiently to scope a future implementation plan — it is not itself a green light to implement.** Items 1, 2, 3, and 5 above are genuine open decisions (infra, product, and one technical spike) that should be resolved before any implementation phase begins.

---

# Web Chat Floating Bubble — Design Review

> Review-only. No code, schema, or files modified. Verified against current repo state (`d:\medcal`) as of 2026-08-16: `apps/web` (marketing site), `apps/web-api` (public edge API), `apps/api` (`ContactMessage` pipeline), `docs/claude/lead-management/`, `docs/Architecture/`. Full copy also saved to `D:\medcal\docs\claude\lead-management\web-chat-bubble-design-review.md`.
>
> Lead Inbox v1 (matching, STRONG/POSSIBLE/NONE, Needs Review, Attach/Create New, Lead Detail) is stable and **not** revisited here.

---

## Context

Lead Inbox v1 is done. The next gap is the visitor-facing entry point: MedCal's public website has no way for a visitor to start a conversation today — the WhatsApp FAB is intentionally disabled, and the only contact surface is the full `/kontak` page form. The goal is a lightweight floating "Web Chat" bubble that funnels into the _existing_ `ContactMessage` pipeline (via `getFrom=CHAT_PERSON`) exactly the way the Contact Form already does via `getFrom=CONTACTFORM` — not a new realtime chat platform. BIPMED's floating-bubble screenshot is the UX reference for the _interaction pattern only_ (closed bubble → click → open panel), not for literal visuals, copy, or a promise of realtime human availability, which MedCal's current backend cannot support.

---

## Correction to stated premise

The prompt states "The Web Chat backend flow already exists and ultimately creates a ContactMessage with source WEBCHAT." Verified against code: this is **not yet true**. `GetMessageFrom.CHAT_PERSON` (and `CHAT_AI`) exist only as unused Prisma enum values — no controller, service, or `apps/web-api` route anywhere sets `getFrom: "CHAT_PERSON"` today. The only channel that actually writes `ContactMessage` rows end-to-end is the Contact Form (`CONTACTFORM`), via `apps/web/src/app/kontak/kontak-form.tsx` → `apps/web-api`'s `publicContactFormSchema` (hardcodes `getFrom` server-side, strips any client-supplied value) → `POST internal/contact-messages` → `apps/api`'s `ContactMessagesService`. This is good news, not a blocker: it means Web Chat's backend is a **small, well-precedented addition** (mirror the same public-schema-hardcodes-getFrom pattern with `getFrom="CHAT_PERSON"`), not a gap to explain away — but the "already exists" framing should be corrected before implementation is scoped.

---

## 1. Recommended UX

A **floating message composer**, not a live conversational thread. Given no `ChatSession`/`ChatMessage` model exists and building one is explicitly out of scope (locked: "MVP, not Foundation" per `docs/Architecture/02-foundation-implementation-plan.md`), v1 "Web Chat" is structurally a compact, chat-styled single-shot form: visitor fills identity + message once, submits, gets a confirmation — no message history, no back-and-forth in-panel, no read receipts. The BIPMED-style bubble affordance (closed pill in the corner, opens a panel) is appropriate and worth adopting; the implied promise of an ongoing live chat is not, and must be avoided in copy and visual design so the UI doesn't over-promise relative to what actually happens (a message gets queued for staff, same as the Contact Form).

## 2. Closed State

- **Position:** `fixed bottom-5 right-4` (`sm:bottom-6 right-6`) — same slot the disabled `WhatsAppFab` already occupies in `apps/web/src/app/layout.tsx`, so there's exactly one floating affordance, never two competing bubbles.
- **Shape/size:** `h-14 w-14` rounded-full icon button, consistent with the existing FAB precedent, OR a slightly wider pill (icon + short label) if a label is desired — see wording below. A pill is more honest than an icon-only circle, since "chat" icons alone tend to visitors expect live chat.
- **Icon:** a message/chat-bubble glyph (lucide `MessageCircle` — `components.json` already configures lucide as the icon set), not a WhatsApp-branded glyph.
- **Color:** use the theme's `brand` token (e.g. `bg-brand-600` hover `bg-brand-700`), not a raw hex — the WA FAB's `bg-[#25D366]` is a one-off, not a pattern worth repeating.
- **Label:** see §4.
- **Availability indicator:** **not recommended as a colored "online" dot** — see §5.
- **Hover (desktop):** subtle scale/shadow lift, label tooltip if icon-only.
- **Behavior:** identical across desktop and mobile — fixed corner position, tap/click opens the panel. No separate mobile-only closed-state variant is needed.

## 3. Open State

- **Panel size (desktop):** a compact card anchored above the bubble, roughly `360–400px` wide, height capped (`max-h-[560px]` or similar) — not full-viewport. This is a form-in-a-panel, not a docked chat app.
- **Header:** short title + close (×) button. No agent avatar/name (implies a specific human is present — not accurate for v1).
- **Title:** see §4 wording.
- **Supporting text:** one line setting expectation honestly, e.g. "Kirim pesan Anda, tim kami akan membalas melalui email atau telepon." This does the job the green dot would otherwise falsely imply.
- **Form fields:** reuse the same field set and validation as `kontak-form.tsx` — `name`, `email`, `phone` (optional), `organizationName` (optional), `message`. `topicId` is likely unnecessary in a lightweight chat context (adds friction) — recommend omitting it for v1 and letting staff triage via the message body, but this is a judgment call, not a hard requirement.
- **Composer:** single multi-line textarea + submit button — not a chat-log input bar, since there's no thread to append to.
- **Close/minimize:** × closes the panel; closing does not discard a filled-but-unsubmitted draft abruptly without at least a lightweight confirmation, but no persistence layer (no ChatSession) means a page refresh will lose the draft — acceptable for v1, should be a known limitation, not silently glossed over.
- **Success state:** replace the form with a confirmation message (mirrors `kontak-form.tsx`'s inline `role="status"` pattern) — "Terkirim! Tim kami akan segera menghubungi Anda." (identical copy already proven elsewhere on the site) — then auto-collapse the bubble back to closed after a short delay or on next explicit close.
- **Error state:** inline error text in the panel (validation) or a generic submit-failed message (server/network) — same `role="status"` pattern, distinct visual treatment (e.g. red-toned text) since `kontak-form.tsx` currently uses the same neutral color for both success and error, which this widget should improve on rather than copy verbatim.

## 4. Wording

Recommend **"Chat dengan kami"** for the closed-state label/bubble tooltip and open-panel title. Reasoning: "Buka percakapan" (BIPMED) implies an ongoing conversation thread MedCal's v1 doesn't have; "Konsultasi" reads as a sales/lead-gen CTA (matches the B2B instinct to sound consultative, but risks feeling salesy per the constraint to avoid that); "Chat dengan kami" is neutral, already-used-register Indonesian (consistent with existing site copy tone in `kontak-form.tsx`), and accurately describes "send us a message" without promising realtime back-and-forth.

## 5. Availability Indicator

**Not recommended as a green "online now" dot.** Nothing in the current or planned v1 architecture supports real human presence detection — no staff-online signal exists anywhere in the codebase, and Lead Inbox v1 explicitly deferred assignment/ownership (Decision 3). A colored presence dot would be a UI claim with no backing system, i.e. misleading. Recommended alternative: a short, honest expectation-setting line instead of an indicator — e.g. "Biasanya membalas dalam 1 hari kerja" (or whatever real SLA the business wants to commit to) placed in the open-panel supporting text (§3), not as a persistent badge on the closed bubble. If the business later wants a true presence signal, that requires the deferred `ChatSession`/staff-presence work and should not be faked now with a static green dot.

## 6. Existing Implementation Reuse

**Reuse as-is:**

- The `ContactMessage` creation pipeline end-to-end: `apps/web-api`'s public-schema-hardcodes-`getFrom` pattern (`publicContactFormSchema` in `apps/web-api/src/public-contact-form-schema.ts` is the direct template — add a sibling schema, e.g. `publicWebChatSchema`, that hardcodes `getFrom: "CHAT_PERSON"`), forwarding to the same `POST internal/contact-messages` → `ContactMessagesService.create()` in `apps/api`. This already runs Lead identity matching (STRONG/POSSIBLE/NONE) — Web Chat messages get that behavior for free, no new logic needed.
- reCAPTCHA v3 flow already implemented in `kontak-form.tsx` (`grecaptcha.execute(...)`) — same token-fetch-and-submit pattern applies to the chat composer's submit handler.
- The inline `role="status"` success/error text pattern from `kontak-form.tsx`.
- Tailwind theme tokens (`brand`, `ink`) already defined in `apps/web/tailwind.config.js` — no new design tokens needed.
- The FAB's fixed-position/z-index/mount-point pattern (`apps/web/src/app/layout.tsx`, same slot as the commented-out `WhatsAppFab`).

**Do NOT rebuild / do NOT introduce:**

- `ChatSession`, `ChatMessage`, or any new DB table — v1 has no message thread to persist.
- WebSocket/realtime transport, presence system, typing indicators.
- Any AI/human mode concept, mode selector, or bot persona (hard constraint, already excluded above by construction — the composer only ever does one thing: submit a `ContactMessage`).
- A new design-system/component library buildout — `packages/ui` is effectively empty and shadcn in `apps/web` has only one primitive (`accordion.tsx`); the chat panel can be hand-built with existing Tailwind tokens without pulling in Dialog/Sheet primitives that don't exist yet, unless Cursor judges a portal/overlay dependency (e.g. `@radix-ui/react-dialog` for focus-trap correctness) is worth adding — that's an implementation-time call, not a design-review blocker.

## 7. Mobile Behavior

- **Viewport constraints:** on small screens the panel should expand to near-full-width with safe margins (e.g. `inset-x-4`) rather than a fixed `360px` card, capped at a reasonable height (e.g. `max-h-[75vh]`) so it never fully occludes the page.
- **Keyboard:** when the on-screen keyboard opens (textarea focus), the panel must remain scrollable/reachable — avoid fixed-height layouts that push the submit button off-screen; test with `100dvh`-aware sizing rather than `100vh`.
- **Safe area:** respect `env(safe-area-inset-bottom)` for the closed bubble's bottom offset on notched devices, consistent with the existing FAB's `bottom-5`/`bottom-6` pattern (should adopt safe-area padding if it doesn't already).
- **Obstruction:** ensure the closed bubble doesn't overlap any site's own fixed bottom UI (checked: no other fixed bottom elements exist on `apps/web` today besides the FAB slot itself, so no conflict currently).

## 8. Accessibility

- Closed bubble: real `<button>` (or `<a>`-with-`role="button"` only if truly navigating) with `aria-label="Chat dengan kami"` (matches `WhatsAppFab`'s existing `aria-label` precedent), minimum 44×44px touch target (the existing `h-14 w-14` already satisfies this).
- Panel open: move focus into the panel (first focusable field or the close button) on open; on close (× or Escape), return focus to the bubble trigger.
- Keyboard: full form must be operable via Tab/Shift+Tab; Escape closes the panel; Enter submits from the textarea only via the button (avoid accidental submit-on-Enter in a multi-line textarea).
- `aria-live="polite"` (or the existing `role="status"`) region for success/error messages so screen readers announce the result.
- Contrast: reuse existing `ink`/`brand` tokens, which are presumably already tuned for contrast elsewhere on the site — no new colors to separately audit beyond the success/error distinction called out in §3.

## 9. UX States

CLOSED → OPEN (panel visible, form focused) → SUBMITTING (button disabled, "Mengirim…" label, matching `kontak-form.tsx`'s existing `pending` pattern) → one of:

- SUCCESS (form replaced by confirmation text, auto-return to CLOSED after a short delay or explicit close)
- VALIDATION ERROR (inline, per-field or summary, panel stays OPEN)
- SERVER ERROR (inline generic message, panel stays OPEN, form values preserved so the visitor doesn't retype)
- RECAPTCHA ERROR (same inline error slot as SERVER ERROR — recommend not exposing recaptcha-specific detail to the visitor, mirror whatever generic-failure wording `kontak-form.tsx` already uses for consistency)

## 10. WhatsApp

Confirmed: `WhatsAppFab` (`apps/web/src/components/whatsapp-fab.tsx`) stays commented out / disabled. Not re-enabled, not referenced, not combined with the new bubble. Out of scope for this task, per explicit instruction.

## 11. Implementation Scope (for later handoff to Cursor)

Minimal file list, not a build plan:

- `apps/web/src/components/web-chat-bubble.tsx` (new) — closed/open UI, states.
- `apps/web/src/app/layout.tsx` — mount point (same slot as the commented `<WhatsAppFab />`).
- `apps/web-api/src/public-web-chat-schema.ts` (new, sibling of `public-contact-form-schema.ts`) — hardcodes `getFrom: "CHAT_PERSON"`.
- `apps/web-api` route file (sibling of wherever `/public/contact-messages` is currently routed) — new `/public/web-chat` (or reuse `/public/contact-messages` with a fixed `getFrom` — implementation-time call) forwarding to the same `apps/api` internal endpoint.
- No changes anywhere in `apps/api`, `packages/db` schema, RBAC, Lead matching, or Lead Inbox — this channel flows through the existing pipeline unchanged.

## 12. Open Questions

None block finalizing this design. One judgment call worth flagging, not blocking: whether to include `topicId` in the chat composer (§3) — recommended to omit for v1 friction reasons, but confirm before handoff if the business wants topic-routing parity with the Contact Form.

---

# Lead Inbox Design Review (prior phase — stable, not revisited)

> Review-only. No code, schema, migrations, or files modified. Verified directly against the current repository state (`d:\medcal`) as of 2026-08-16 — schema file, migration history, `apps/api` application code, RBAC catalog, and locked documentation (`docs/claude/lead-management/lead-inbox.md`, `docs/claude/lead-management/final-before-locked.md`, `docs/Architecture/01-bipmed-medcal-architecture-adoption-matrix.md`). Distinguishes **CURRENT CODE** from **DOCUMENTED INTENT** throughout, per your instruction not to assume docs are newer than the schema.
>
> **All decisions confirmed 2026-08-16.** Decision 1 (Lead → 1:N aggregate) = **YES**; Decision 2 (identity field placement) = **Option B, denormalized snapshot on Lead**; Decision 3 (assignment in scope for v1) = **NO, deferred**; Decision 4 (unread tracking via `ContactStatus`) = **YES**; Decision 5 (RBAC granularity) = **Option B, per-verb**; identity-matching auto-attach on STRONG MATCH = **YES**; matching scope = **exact normalized fields only, no fuzzy matching**. Every section below reflects the final, fully-locked design — nothing remains open.
>
> Full copy of this review also saved to `D:\medcal\docs\claude\lead-management\lead-inbox-design-review.md`.

---

## 1. Current State

**Lead — schema only, zero application code.**

```prisma
model Lead {
  id               String     @id @default(cuid())
  companyId        String
  contactMessageId String?    @unique
  status           LeadStatus @default(NEW)
  assignedToUserId String?
  customerId       String?
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt

  company             Company              @relation(fields: [companyId], references: [id], onDelete: Cascade)
  contactMessage      ContactMessage?      @relation(fields: [contactMessageId], references: [id])
  assignedTo          User?                @relation("LeadAssignee", fields: [assignedToUserId], references: [id])
  customer            Customer?            @relation(fields: [customerId], references: [id])
  calibrationRequests CalibrationRequest[]

  @@index([companyId, status])
}
```

- `contactMessageId` is `@unique` → **hard 1:1 cap today**, not 1:N.
- No identity fields on `Lead` itself (no name/email/phone/org) — identity lives entirely on `ContactMessage`.
- No `apps/api/src/modules/lead*` directory exists. Confirmed via full-repo grep: zero controllers, zero services, zero endpoints touch `Lead`. It is pure schema.

**ContactMessage — real, evolved past the last audit's snapshot.**

```prisma
model ContactMessage {
  id                String         @id @default(cuid())
  companyId         String
  getFrom           GetMessageFrom @default(CONTACTFORM)
  status            ContactStatus  @default(PENDING)
  subject           String?
  topicId           Int?
  message           String
  name              String
  email             String
  phone             String?
  organizationName  String?
  utmJson           Json?
  matchStatus       MatchStatus    @default(NONE)
  matchedCustomerId String?
  confirmedByUserId String?
  confirmedAt       DateTime?
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt

  company         Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)
  matchedCustomer Customer?     @relation("ContactMatchCandidate", fields: [matchedCustomerId], references: [id])
  lead            Lead?
  confirmedBy     User?         @relation("MatchConfirmer", fields: [confirmedByUserId], references: [id])
  topic           ContactTopic? @relation(fields: [topicId], references: [id], onDelete: SetNull)

  @@index([companyId, createdAt])
  @@index([companyId, email])
  @@index([companyId, status])
  @@index([companyId, getFrom])
}
```

- **`topicId` is no longer orphaned.** `docs/claude/lead-management/lead-inbox.md` (Decision 6) flagged it as an "orphaned Int, no model" — that was true when the doc was written, but the Contact Form implementation work since then added a real `ContactTopic` model with a proper FK (`onDelete: SetNull`). **This decision is already resolved by code, superseding the doc.**
- `matchStatus`/`matchedCustomerId`/`confirmedByUserId`/`confirmedAt` genuinely exist in both `schema.prisma` and the applied `init` migration — not aspirational.
- `ContactMessagesService.create()` **already runs identity-matching logic today**, but only for **ContactMessage → Customer** dedup, not ContactMessage → Lead: exact email match against `CustomerContact` → `matchStatus = EXACT_EMAIL`; non-public-domain suffix match → `matchStatus = DOMAIN_CANDIDATE`; otherwise `NONE`. This is real, running code — the closest existing precedent for any matching logic in the system, and it only compares **email**, never phone/name/organization.
- `confirmedByUserId`/`confirmedAt` are write targets with no writer yet — no confirm/merge endpoint exists in `apps/api`. The fields are provisioned but the "mandatory admin confirmation before merge" step from the locked Adoption Matrix rule is not implemented.
- `ContactMessage.lead` is the implicit inverse of `Lead.contactMessageId` — no separate FK column lives on `ContactMessage` itself.

**ContactTopic — real, global, already shipped.**

```prisma
model ContactTopic {
  id        Int      @id @default(autoincrement())
  name      String   @unique
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  messages ContactMessage[]

  @@index([isActive])
}
```

No `companyId` — intentionally global lookup data, seeded once, no admin CRUD by design.

**Customer — real, unrelated matching logic lives outside it (no dedicated module).**

```prisma
model Customer {
  id, companyId, name, legalName?, taxId?, address?, status: CustomerStatus @default(ACTIVE)
  contacts CustomerContact[], userLinks CustomerUserLink[], devices Device[]
  leads Lead[], matchedMessages ContactMessage[] @relation("ContactMatchCandidate")
  calibrationRequests, quotations, workOrders, certificates, invoices, creditNotes, reminderEvents, fileObjects
  @@index([companyId, status])
  @@index([companyId, name])
}
```

No `apps/api/src/modules/customer*` exists — `Customer` is Prisma-model-only. The email-matching logic that does exist is inline in `ContactMessagesService`, not a reusable `CustomerService.findByEmail()`-style method.

**Enums (current code):**

```prisma
enum LeadStatus     { NEW, CONTACTED, QUALIFIED, REJECTED, CONVERTED }
enum ContactStatus  { PENDING, READ, REPLIED, CLOSED }
enum GetMessageFrom { CONTACTFORM, WHATSAPP, CHAT_AI, CHAT_PERSON, EMAIL }
```

`MatchStatus` also exists (values observed in service logic: `NONE` default, `DOMAIN_CANDIDATE`, `EXACT_EMAIL`) — a third, distinct status axis from the two above.

**API surface today (apps/api):**

- `POST internal/contact-messages` — `@AllowAnonymous() + InternalServiceGuard`, `companyId` from `@CompanyId()` decorator (`process.env.COMPANY_ID` only, never client input).
- `GET contact-messages` — `@RequirePermission("contactMessage","read") + CompanyRoleGuard`, `service.findAll(companyId)` = **unpaginated, unfiltered, unsearched `findMany` ordered by `createdAt desc`.** No list controls exist at all today.
- `GET contact-topics` — `@AllowAnonymous()`, public reference data.
- No mutation endpoints exist for `ContactMessage.status`, no confirm/merge endpoint, no Lead endpoints whatsoever.

**RBAC catalog (`packages/auth/src/access-control.ts`):** only two resources are defined —

```
contactMessage: ["read"]
whitelist: ["manage"]
```

`SUPERADMIN` → both; `ADMIN` → `contactMessage:read`; everyone else → neither. **There is zero `lead:*` permission scaffolding today.**

**Guards:** `CompanyRoleGuard` derives `companyId` from the session's `UserMembership` (never client input); `InternalServiceGuard` derives it from `process.env.COMPANY_ID` and validates a shared secret header, explicitly documented as having removed a prior client-supplied `x-company-id` header as an "unnecessary trust surface." Both are already correct for this design — no changes needed here.

**Assignment/PIC:** no concept exists anywhere in application code. `Lead.assignedToUserId` is schema-only, unused. No `WorkOrderAssignment`-style dedicated table exists for Lead.

**Unread tracking:** none beyond `ContactStatus` itself — no per-user read table, no `isRead`/`readAt` field.

**Web Chat:** `ChatSession`/`ChatMessage`/`ChatTopic` do not exist anywhere in the schema (confirmed by full-file grep — zero matches). This is 100% future work, not partially built.

---

## 2. Locked Decisions

Pulled from `docs/claude/lead-management/lead-inbox.md` §9 and `docs/Architecture/01-bipmed-medcal-architecture-adoption-matrix.md`, cross-checked against current code:

| #   | Decision                                                                                                                                            | Status                                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Lead as 1:N multi-channel aggregate vs. today's 1:1 (`contactMessageId @unique`)                                                                    | **CONFIRMED 2026-08-16 — YES, reverse to 1:N** (§3 Option B)                                                                                                                                     |
| 2   | Where the prospect's organization name (and other identity fields) lives long-term                                                                  | **CONFIRMED 2026-08-16 — Option B, denormalized snapshot on `Lead`**, source-of-truth stays on `ContactMessage`                                                                                  |
| 3   | Whether `Lead.assignedToUserId` (ownership) is in scope for v1                                                                                      | **CONFIRMED 2026-08-16 — NO, deferred past v1**                                                                                                                                                  |
| 4   | Whether unread/new tracking is in scope for v1                                                                                                      | **CONFIRMED 2026-08-16 — YES, reuse `ContactStatus.PENDING→READ`**                                                                                                                               |
| 5   | RBAC granularity for Lead (`lead:read/update/assign` vs. single `lead:manage`)                                                                      | **CONFIRMED 2026-08-16 — Option B, per-verb** (`lead:read`, `lead:update`; no `lead:assign` in v1 per Decision 3)                                                                                |
| 6   | `topicId` — drop or build a real Topic table                                                                                                        | **RESOLVED by code, not docs** — `ContactTopic` shipped with a real FK since the doc was written                                                                                                 |
| 7   | Internal-trust pattern for future inbound-channel webhooks                                                                                          | Adjacent, out of scope for Lead Inbox itself                                                                                                                                                     |
| —   | Web Chat is MVP, human-only, no AI mode, no `mode` field                                                                                            | **LOCKED** (Adoption Matrix + `final-before-locked.md`)                                                                                                                                          |
| —   | Chat expressing service intent links to/creates `ContactMessage` with `getFrom=CHAT_PERSON`                                                         | **LOCKED** (Adoption Matrix, "per MedCal's own already-locked D04 rule")                                                                                                                         |
| —   | Visitor/anonymous chat identity: no durable Better Auth anon user; a narrowly scoped, revocable, non-authenticating signed chat-session cookie only | **LOCKED** (`final-before-locked.md`, explicit and detailed)                                                                                                                                     |
| —   | Lead/Customer dedup: email-domain match + mandatory admin confirmation before merge, no silent auto-merge                                           | **LOCKED** (Adoption Matrix) — **partially implemented**: the matching computation exists (`matchStatus`), the confirmation step does not (no endpoint writes `confirmedByUserId`/`confirmedAt`) |

---

## 3. Proposed Lead Aggregate

Given Decision 1 is open and the schema is currently 1:1, three shapes were evaluated:

**Option A — reverse the relation, keep identity on ContactMessage only.**
`ContactMessage.leadId String?` (FK to `Lead`, replacing the current `Lead.contactMessageId @unique`). `Lead` gains no new fields beyond what it has. Lead's own row stays a thin aggregate root — pure status/assignment/customer-link — with all identity (`name`/`email`/`phone`/`organizationName`) read by joining to whichever `ContactMessage` rows are attached. Cheapest schema change (one FK direction flip), matches Decision 2's "keep on ContactMessage" branch.

**Option B — reverse the relation, promote a denormalized identity snapshot onto Lead.**
Same FK flip as A, plus `Lead.name`/`Lead.phone`/`Lead.organizationName`/`Lead.email` populated at Lead-creation time from the first `ContactMessage`, used as the inbox list's display source of truth (cheap to query, no join needed for the list view) while individual `ContactMessage` rows retain their own values as the historical record of what was actually submitted on each interaction. Matches Decision 2's "promote a copy" branch, which the docs already lean toward.

**Confirmed: Option B.** The Lead Inbox MVP (§5 below) is fundamentally a list view — a denormalized identity snapshot on `Lead` avoids an N+1 join on every inbox render and matches how BIPMED's own (single-channel) inbox worked, per the earlier reference audit. The historical/audit trail still lives correctly on each `ContactMessage`, so nothing is lost — only a display-convenience copy is added. `Lead.name`/`Lead.email`/`Lead.phone`/`Lead.organizationName` are populated from the first `ContactMessage` at Lead-creation time (§7 item 2).

---

## 4. Identity Matching

**This is explicitly the least-evidenced area.** The only existing precedent in the codebase is `ContactMessagesService.create()`'s Customer-dedup logic, and it is narrow: **email only** (exact match, or public-domain-excluded suffix match), no phone, no name, no organization. There is no existing phone-normalization, no fuzzy-name comparison, nothing that resembles the "phone + organization + name" tiered model your prompt hypothesizes. Nothing in `docs/claude/lead-management/lead-inbox.md` or the Adoption Matrix specifies attach rules for ContactMessage→Lead — only the separate ContactMessage→Customer dedup rule is locked.

Given that, here is a proposed tiered matching design, offered as a **starting hypothesis for your confirmation, not a locked rule**:

- **Normalize before comparing:** phone (strip formatting to a canonical `+62...` digit string — the form currently collects raw strings like `"08xx-xxxx-xxxx"` with zero normalization applied anywhere today), email (lowercase, trim), organization name (lowercase, trim, collapse whitespace — no stemming/fuzzy matching for MVP).
- **Exact match only for MVP** on every field compared (confirmed 2026-08-16 — no fuzzy/similarity matching). Nothing in the repo today does fuzzy string comparison, and introducing it would be new infrastructure disproportionate to an MVP inbox.
- **STRONG MATCH** — normalized phone matches AND normalized organization matches → auto-attach to that Lead.
- **POSSIBLE MATCH** — normalized phone matches but organization doesn't (or vice versa), or email matches but neither phone nor org does → do not auto-attach; flag on the new `ContactMessage` (or surface in the inbox) as "possible duplicate of Lead #X," require a staff click to confirm/attach.
- **NO MATCH** — nothing matches → create a new `Lead`.
- **Multiple candidates match** → do not auto-attach to any; always fall into POSSIBLE MATCH with all candidates listed, require staff to pick one or create new.

This mirrors the already-locked Customer dedup philosophy ("no silent auto-merge... mandatory admin confirmation") extended one layer earlier, which is the one real precedent this codebase has for identity-matching risk tolerance.

**Confirmed 2026-08-16** — the tiered design above is locked as-is: STRONG MATCH auto-attaches, POSSIBLE MATCH requires staff confirmation, NO MATCH creates a new Lead, exact-normalized-match only (no fuzzy matching). See §10 for the final record.

---

## 5. Lead Inbox MVP

Reviewing the field list against what's actually populated today:

| Field            | Justified?                     | Note                                                   |
| ---------------- | ------------------------------ | ------------------------------------------------------ |
| Date             | Yes                            | `ContactMessage.createdAt` / proposed `Lead.createdAt` |
| Name             | Yes                            | Real field, populated on every submission              |
| Email            | Yes                            | Real field, required on the form                       |
| Phone            | Yes                            | Real field, optional on the form                       |
| Prospect Company | Yes                            | `organizationName`, optional                           |
| Topic            | Yes                            | Real FK now (`ContactTopic`), resolved per §2          |
| Source           | Yes                            | `getFrom` enum, already populated correctly            |
| Lead Status      | Yes                            | `LeadStatus` enum exists, unused today                 |
| Assigned PIC     | **Deferred (Decision 3 = No)** | Not in v1 — no assign endpoint, no column consumed     |
| Unread indicator | **Yes (Decision 4 = Yes)**     | Reuses `ContactStatus.PENDING→READ`, no new field      |
| Last interaction | **Yes (Decision 1 = Yes)**     | Meaningful now that Lead is confirmed 1:N              |

**Proposed MVP shape** (small, matches the "keep it deliberately small" instruction):

- **List:** paginated (cursor or offset — either is fine, no existing pagination pattern elsewhere in `apps/api` to match against, so this is a free choice), server-side search on name/email/phone/organization (simple `ILIKE`, no full-text search infra needed), filters on `LeadStatus` + `getFrom` (source) + `ContactTopic`, sort by `createdAt` (newest first, default) — no other sort justified for MVP.
- **Detail view:** the Lead's identity snapshot + its attached `ContactMessage`(s) as a simple reverse-chronological timeline (trivial under Option B's schema; a single row under today's 1:1 schema).
- **Read/unread:** in scope (Decision 4 = Yes). Reuses `ContactStatus.PENDING→READ` exactly as it already exists (matches BIPMED's own confirmed manual-only behavior) — no new field needed.
- **Status transitions:** `LeadStatus` (`NEW→CONTACTED→QUALIFIED→REJECTED|CONVERTED`) is staff-driven via a dropdown/action, no auto-transitions — consistent with how `ContactStatus` already behaves in the reference comparison (manual only, no auto-READ-on-open).
- **Assignment:** deferred (Decision 3 = No). No assign dropdown, no `PATCH .../assign` endpoint, no `lead:assign` permission in v1 — `Lead.assignedToUserId` stays unused, revisit post-MVP once notification/ownership semantics are designed.

Explicitly **not proposed**, matching your instruction and consistent with the absence of any evidence for them in the repo: tags, priority, deal value, scoring, pipeline stages beyond `LeadStatus`, generic "activity" abstraction.

---

## 6. Web Chat Relationship

The locked direction (`final-before-locked.md`, Adoption Matrix) is: `ChatSession` → many `ChatMessage`, human-only, no AI mode, no `mode` field; a chat expressing service intent creates/links a `ContactMessage` with `getFrom=CHAT_PERSON`. **None of this exists in the schema yet** — confirmed by full-file grep, zero `Chat*` models present.

This relationship is **sufficient for the Lead Inbox design as scoped**, on one condition: Lead Inbox must be built against `ContactMessage` as the unified interaction record (per your explicit standing principle), not against `ChatSession` directly. Once `ChatSession`/`ChatMessage` are eventually built, a chat-originated `ContactMessage(getFrom=CHAT_PERSON)` should flow through the exact same Lead-matching logic proposed in §4 — no separate chat-specific matching path is justified, since `ContactMessage` is already the deliberate convergence point for all channels. This is a reason to build the Lead↔ContactMessage relationship (§3) generically now, so Web Chat has nothing special to integrate with later beyond emitting a normal `ContactMessage` row.

No part of this review proposes building `ChatSession`/`ChatMessage` — that remains explicitly future/out-of-scope work, consistent with your instructions.

---

## 7. Required Schema Changes

Only changes with a stated reason — nothing speculative:

1. **`ContactMessage.leadId String?` replacing `Lead.contactMessageId String? @unique`** (FK direction reversed, uniqueness removed) — required now that Decision 1 = Yes (Option B, §3). _Why:_ the current unique constraint is what structurally caps Lead at 1:1; there is no way to represent multi-channel aggregation without this change.
2. **`Lead.name`, `Lead.email`, `Lead.phone`, `Lead.organizationName`** (denormalized snapshot, all nullable except perhaps name) — _Why:_ avoids an N+1 join for the inbox list view; implements Decision 2 (confirmed Option B).
3. **Normalized-phone column** (e.g. `ContactMessage.phoneNormalized String?`, computed at write time) — _Why:_ the matching design in §4 requires comparing normalized values; storing it avoids re-normalizing on every match query. A normalized-organization comparison value (lowercase/trim/collapse-whitespace) can be computed inline at query time rather than stored, since it's a simple deterministic transform of `organizationName`, not a fixed-format field like phone.
4. **Index to support Lead Inbox search/filter** — e.g. `@@index([companyId, status])` on `Lead` already exists; would additionally want something like `@@index([companyId, createdAt])` to support the default sort, mirroring the pattern already used on `ContactMessage`. _Why:_ consistent with existing indexing conventions in this schema (every list-shaped query in this codebase already has a matching companyId-scoped index).
5. **`Lead.assignedToUserId`** — already exists, no schema change needed. **Deferred (Decision 3 = No)** — not wired to application code in v1.
6. No new field is proposed for unread tracking — reusing `ContactMessage.status` (`ContactStatus`) is sufficient (Decision 4 = Yes, §5); a new field is not justified by evidence.

Nothing else. No new tables (no separate "match candidate" table, no "assignment history" table) — none are justified by the current evidence or by the "avoid speculative abstractions" instruction.

---

## 8. Required API Changes

**Existing, reusable as-is:** `GET contact-topics`, `CompanyRoleGuard`, `InternalServiceGuard`, the `contactMessageCreateSchema` Zod pattern, the `@RequirePermission` decorator pattern.

**New, minimum set for Lead Inbox:**

- `GET leads` — paginated, search (name/email/phone/organizationName), filter (`status`, `getFrom`, `topicId`), sort by `createdAt`. Mirrors the shape `contact-messages`' `findAll` should have had but doesn't — this is also an opportunity to note `ContactMessagesService.findAll()` itself has no pagination/search/filter today, a pre-existing gap this work would otherwise need to solve twice.
- `GET leads/:id` — detail + attached `ContactMessage` timeline (real 1:N under the now-confirmed Decision 1 schema change).
- `PATCH leads/:id/status` — `LeadStatus` transition, staff-driven.
- `PATCH leads/:id/assign` — **deferred, not built in v1** (Decision 3 = No).
- `PATCH contact-messages/:id/status` — mark `PENDING→READ` etc., needed now that Decision 4 = Yes.
- The create path (`ContactMessagesService.create`) needs the §4 matching logic added — this is a service-layer change to an existing method, not a new endpoint.

No confirm/merge endpoint for Customer dedup is proposed here — that's the separately-locked, separately-unimplemented Customer conversion flow, out of this review's scope per your instructions (§5: "Do NOT invent automatic customer conversion").

---

## 9. Security / RBAC

No `lead:*` permission exists today — `packages/auth/src/access-control.ts` defines only `contactMessage:["read"]` and `whitelist:["manage"]`. Building Lead Inbox requires **at minimum** a `read` action on a new `lead` resource, gated the same way `contactMessage:read` is today (`CompanyRoleGuard`, session/membership-derived `companyId`, never client input — this pattern is already correct and should be reused unchanged).

**Confirmed 2026-08-16 — Decision 5: Option B, per-verb.** `packages/auth/src/access-control.ts` gains a `lead` resource with `["read", "update"]` actions (no `assign` in v1, per Decision 3). This matches how `contactMessage` was already scoped (single `read` action, granted only where a real endpoint exists) rather than a blanket `manage` — adding exactly as many actions as there are mutating endpoints in v1 (`GET leads`/`GET leads/:id` → `read`; `PATCH leads/:id/status` → `update`).

No new guard type is needed — `CompanyRoleGuard` already does exactly the tenant-isolation job Lead Inbox needs, and `InternalServiceGuard`'s pattern (shared secret, `companyId` from `process.env` only) is already correct for any future inbound-channel write path.

---

## 10. Decisions — Final Record (all confirmed 2026-08-16)

**Decision 1 — Lead as multi-channel aggregate.** **Option B: reverse to 1:N** (`ContactMessage.leadId`, per §3). Matches the stated design principle ("One Lead may have MANY ContactMessages"); schema change is small and additive (one FK direction flip, no data loss).

**Decision 2 — Where prospect identity fields live.** **Option B: denormalized snapshot copy on `Lead`** (§3), source-of-truth stays on `ContactMessage`. Avoids N+1 joins on the inbox list.

**Decision 3 — Is Lead assignment (`assignedToUserId`) in scope for v1?** **Option B: deferred.** Lead Inbox v1 is read + status-only; no `PATCH leads/:id/assign` endpoint, no `lead:assign` permission, `Lead.assignedToUserId` stays unused for v1 (§5, §7 item 5, §8, §9 all reflect this).

**Decision 4 — Is unread/new tracking in scope for v1?** **Option A: yes.** Reuses `ContactStatus.PENDING→READ` as the unread signal (§5, §7 item 6) — free, no schema change required.

**Decision 5 — RBAC granularity.** **Option B: per-verb** (`lead:read`, `lead:update`; no `lead:assign` in v1 per Decision 3) — matches how `contactMessage` was already scoped (§9).

**Identity matching auto-attach behavior.** **Option A:** STRONG MATCH (normalized phone + organization both match) auto-attaches to the existing `Lead`; POSSIBLE MATCH always requires staff confirmation; NO MATCH creates a new `Lead`. Honors the locked "no silent auto-merge" principle for the genuinely ambiguous case.

**Field normalization scope for matching.** **Option A: exact match only** on normalized phone/email/organization (§4) — no fuzzy/similarity matching in v1. Consistent with the existing (email-only) matching precedent in `ContactMessagesService`; no fuzzy-matching infrastructure exists anywhere in this codebase today.

Nothing remains open. This section is a record of what was decided, not a request.

---

## 11. Recommended Implementation Order

A dependency-ordered sequence. All decisions (§10) are confirmed — this is now ready to execute once you give the go-ahead to move from review into implementation.

1. **Schema migration** — reverse the Lead↔ContactMessage relation (§7 item 1), add the identity snapshot fields `Lead.name/email/phone/organizationName` (§7 item 2), add `ContactMessage.phoneNormalized` (§7 item 3), add the supporting index (§7 item 4).
2. **RBAC catalog** — add the `lead` resource with `["read", "update"]` actions (§9), before any Lead endpoint exists to gate.
3. **Lead module (apps/api)** — `LeadsController`/`LeadsService`, `GET leads` (list, search, filter, paginate), `GET leads/:id` (detail + timeline), `PATCH leads/:id/status`. No assign endpoint in v1. Reuse `CompanyRoleGuard` unchanged.
4. **Matching logic in `ContactMessagesService.create`** — implement the §4 tiered comparison, write `leadId` on STRONG MATCH, otherwise flag POSSIBLE/create new Lead. Sequenced after the Lead module exists so it has something to attach to.
5. **`PATCH contact-messages/:id/status`** — needed for the confirmed unread-via-`ContactStatus` mechanism (§5).
6. **Lead Inbox UI** — list/detail/filters/search per §5 (no assignment UI in v1), built last since it's the only piece with no backend dependency risk once steps 1–5 exist.

Deferred, revisit post-MVP: Lead assignment (`assignedToUserId` wiring, `PATCH .../assign`, `lead:assign` permission) — Decision 3.

Web Chat (`ChatSession`/`ChatMessage`) and the Customer-merge confirmation endpoint remain explicitly out of this sequence — both are separately scoped, not-yet-designed work per your instructions.
