# Node Runtime Compatibility Spike

> Empirical, execution-based spike. Not source-reading inference. A temporary, isolated project (outside `d:\medcal`, in the session scratchpad) built two Docker images — `node:20-alpine` and `node:22-alpine` — installing the exact dependency versions pinned in MedCal's own `pnpm-lock.yaml` (`@thallesp/nestjs-better-auth@2.7.0`, `better-auth@1.6.27`, `@nestjs/core@11.1.28`), and ran the real path the Web Chat design depends on: a Socket.IO handshake carrying a genuine Better Auth session cookie, through a NestJS WS execution context, through `@thallesp/nestjs-better-auth`'s `AuthGuard`, through `better-auth`'s `getSession()`, into a guarded `@SubscribeMessage` handler that reads the authenticated identity. The spike project and both Docker images were deleted after the test — no trace remains in `d:\medcal` (confirmed via `git status`).

## Node 20

- Docker image: `node:20-alpine`
- Actual Node version: **v20.20.2** (exact match to production's confirmed runtime)
- Install result: `npm install` succeeded, printed `EBADENGINE` warning for `@thallesp/nestjs-better-auth@2.7.0` (`required: >=22.22.1, current: v20.20.2`) — **warning only, did not fail the install**, confirming the earlier compatibility audit's prediction about pnpm/npm engine enforcement.
- Application boot: **succeeded**, clean Nest startup log, `AuthModule initialized BetterAuth on '/api/auth'`, no runtime exception.
- Socket.IO boot: **succeeded**, gateway registered (`SpikeGateway subscribed to the "ping" message`).
- WS handshake: **succeeded**, client connected using `extraHeaders: { Cookie: ... }`.
- Better Auth AuthGuard (WS context): **executed without error**.
- Session validation: **succeeded** — `getSession()` returned a real session from the cookie issued at sign-up.
- Authenticated user: **available inside the guarded handler** — `{ userId: "3GPutudutSpitEUf99q7eAz0hSWGyRjq", email: "spike-...@example.com" }`, matching the account created via `/api/auth/sign-up/email` moments earlier.
- **Result: PASS**

## Node 22+

- Docker image: `node:22-alpine`
- Actual Node version: **v22.23.2** (satisfies the dependency's own stated floor of `>=22.22.1`)
- Install result: `npm install` succeeded, **no `EBADENGINE` warning** (floor satisfied).
- Application boot: succeeded, identical log shape to Node 20.
- Socket.IO boot: succeeded.
- WS handshake: succeeded.
- Better Auth AuthGuard (WS context): executed without error.
- Session validation: succeeded.
- Authenticated user: available inside the guarded handler — `{ userId: "Tt2plHcoCLRJ61VltVFroSrejNbc8KZb", email: "spike-...@example.com" }`.
- **Result: PASS**

## Comparison

**No behavioral difference found.** Identical application code ran unmodified against both base images (only the Docker `NODE_TAG` build arg changed). Every step — sign-up, cookie issuance, WS handshake, `AuthGuard` execution, `getSession()` resolution, authenticated-identity delivery inside the handler — succeeded identically on both. The only observable difference between the two runs was the presence/absence of the `EBADENGINE` install-time warning, which is advisory (§ below) and did not correlate with any runtime behavior difference.

## Final Decision

### A. Node 20 is sufficient

**Empirical evidence:** the exact mechanism the Web Chat design depends on — `@thallesp/nestjs-better-auth`'s WS-context `AuthGuard` branch, calling `better-auth`'s real `getSession()` against a real signed session cookie, inside a real NestJS `@WebSocketGateway()` guarded `@SubscribeMessage` handler — was built, run, and **passed on Node v20.20.2**, the exact version confirmed running in production today. This is not an inference from reading source; it is an observed, reproducible runtime result. The declared `engines: {node: ">=22.22.1"}` on `@thallesp/nestjs-better-auth@2.7.0` did not manifest as an actual runtime incompatibility for the code path this feature needs — it produced an install-time warning only, consistent with the earlier compatibility audit's finding that pnpm/npm engine enforcement is advisory in this repo (no `engine-strict` setting exists anywhere).

**Recommendation: keep `apps/api`'s Docker image on Node 20.** No upgrade is required before Web Chat implementation on the evidence gathered. This does not rule out that some *other*, not-yet-built part of the eventual implementation could hit a genuine Node-22-only feature — but the specific, previously-flagged uncertainty (the WS-context auth mechanism itself) is now closed empirically, not speculatively.

## Important production rule — compliance confirmed

No production file was modified: `apps/api/Dockerfile`, `package.json`, `pnpm-lock.yaml`, `docker-compose.prod.yml`, and the Prisma schema were all read-only throughout this spike. The temporary spike project (`package.json`, `tsconfig.json`, `Dockerfile`, `src/main.ts`) lived entirely under the session's scratchpad directory, outside `d:\medcal`, and both Docker images (`medcal-spike-node20`, `medcal-spike-node22`) plus the project directory itself were deleted immediately after the test. `git status` in `d:\medcal` confirms no residual changes.

## Final Answer

**Can MedCal Web Chat proceed using the current `node:20-alpine` production image, or should the Docker runtime be upgraded to Node ≥22.22.1 before implementation continues?**

**Proceed on `node:20-alpine`. No upgrade required before implementation continues**, based on empirical evidence that the specific mechanism the design depends on (Better Auth session validation inside a Socket.IO/NestJS WS handshake, via `@thallesp/nestjs-better-auth`'s `AuthGuard`) runs correctly, without error, on the exact Node version already running in production. Both blocking items from the earlier technical spike (§9/§10 of the prior document) — Better Auth+Socket.IO feasibility and the untested WS-context code path — are now closed with runtime evidence rather than source-reading inference.
