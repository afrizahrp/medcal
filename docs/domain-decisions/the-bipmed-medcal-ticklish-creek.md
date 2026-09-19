# Foundation Plan — Dependency-Order Correction + Start F1

## Context

The Foundation Implementation Plan (`docs/Architecture/02-foundation-implementation-plan.md`) was approved, but the user caught a sequencing flaw: F2 (`EmailWhitelist`) was ordered before RBAC, which would have required a temporary/stub permission check — exactly the kind of throwaway scaffolding the project's locked KISS principle avoids. Corrected order, no architecture change:

1. F1 — FCMToken schema correction (unchanged, still isolated/first)
2. F2 — Better Auth (was F3)
3. F3 — RBAC + `companyId` enforcement (was F4)
4. F4 — EmailWhitelist + registration gate (was F2) — now built directly against real RBAC, no stub permission
5. F5 — Domain/cookie/CORS/`trustedOrigins`/env wiring (unchanged)
6. F6 — Mobile-first UI foundation (unchanged)

No research needed — this is a reorder of an already-approved plan plus starting the first (unaffected) implementation step.

## Changes

1. Edit `docs/Architecture/02-foundation-implementation-plan.md` §3 "Foundation work items" to reflect the new order above (renumber F2–F4, update the one cross-reference in old-F2 that said "Depends on: F4 (RBAC)" — it now simply follows F3 directly, no forward dependency/stub needed). Leave §1, §2, §4, §5, §6 content otherwise intact — only the ordering and the dependency note change.
2. Implement F1: in `packages/db/prisma/schema.prisma`, rename the `PushSubscription` model to `FCMToken`:
   - Replace `endpoint`, `p256dh`, `auth` fields with `token String @unique`, `deviceType String`, `isActive Boolean @default(true)`, `lastUsedAt DateTime?`.
   - Rename the `@@unique([endpoint])` to `@@unique([token])`.
   - Rename relation fields `Company.pushSubscriptions` → `Company.fcmTokens` and `User.pushSubscriptions` → `User.fcmTokens`, updating the `PushSubscription` type references to `FCMToken` in both models.
   - Keep the `PushApp` enum as-is (unaffected).
   - Run `prisma format` (via `pnpm --filter @medcal/db format`) to normalize; do not run `migrate dev` (no DATABASE_URL/db assumed available yet) unless a local Postgres is confirmed running — check `docker compose ps` first and only run migrate if the container is up, otherwise leave the schema edit as the deliverable.

## Verification

- `pnpm --filter @medcal/db exec prisma validate` (or `format`) to confirm the schema is syntactically valid after the rename.
- Grep `packages/db/prisma/schema.prisma` for `PushSubscription`/`endpoint`/`p256dh` to confirm zero remaining references.
- Grep the rest of the repo (`apps/`, `packages/` excluding `docs/`) for `PushSubscription` to confirm no other code references the old model name (expected: none, since no app code consumes it yet).

Stop after F1 is implemented and verified — F2 (Better Auth) is a separate, larger unit of work not started in this turn unless the user asks to continue.
