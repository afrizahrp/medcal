# DB-Driven Role → Permission Management

## Context

MedCal's authorization today is: `UserMembership.role` → static `roleStatements` object hardcoded in `packages/auth/src/access-control.ts` → `hasPermission(role, resource, action)` → `CompanyRoleGuard`/`@RequirePermission` (backend) and `MenuService.getNavTree` (sidebar visibility, via the already-implemented DB-backed Menu Registry). Changing what a role can do currently requires editing `access-control.ts` and redeploying.

The business requirement is that a SUPERADMIN must be able to change ROLE → PERMISSION assignments from a Management UI, with the change taking effect immediately in real backend authorization and real menu visibility — **no code change, no deploy, no manual SQL**.

A prior audit (`docs/claude/permissions/claude-code-mutable-catmull.md`) locked the Menu Registry design and explicitly listed `access-control.ts`/`hasPermission`/`roleStatements` as "must not change without a separate explicit decision." This task **is** that explicit decision — the audit's own conclusion was to consolidate on one `hasPermission` source, which is exactly what this implements (still one source, just DB-backed instead of code-backed). No architectural conflict exists between the docs and the current repo; the current repo confirms the audit's model exactly (verified by reading `access-control.ts`, `company-role.guard.ts`, `menu.service.ts`, `menu.controller.ts`, `packages/db/src/index.ts`, `apps/api/src/main.ts`, `app.module.ts` directly).

## Architecture Decision

**Permission catalog stays code-defined** (`ac`/`ac.statements` in `access-control.ts`). Reason: a new `(resource, action)` pair is only meaningful once some code actually checks it (a new `@RequirePermission(...)` call site) — a DB `Permission` table wouldn't remove the code+deploy dependency for catalog growth, it would just duplicate the code catalog as a second, driftable source. This matches the existing precedent: `permissionCatalog = ac.statements` is already exported read-only and already consumed by the Menu Management UI's resource/action picker.

**Role → Permission assignment becomes DB-driven** via a new `RolePermission` table (role, resource, action tuples). This is the only new authoritative data. `hasPermission` is rewritten to read from this table (via an in-memory cache, not a DB round-trip per call) instead of the static `roleStatements` object, which is deleted entirely — no dual-source compatibility layer, single clean cutover (small app, low risk).

**`hasPermission` stays synchronous**, same signature as today (`hasPermission(role, resource, action): boolean`). This is deliberate: converting it to `Promise<boolean>` would ripple into 8 call sites including a recursive tree-walk (`MenuService.getNavTree`) and a Socket.IO auth helper (`chat-socket-auth.ts`) where a missed `await` silently becomes an always-true security check. Instead:
- A module-level cache (`Map<MembershipRole, Set<"resource:action">>`) is loaded from `RolePermission` at API boot (`apps/api/src/main.ts`, before `app.listen`), so `hasPermission` never runs against an empty cache during real traffic.
- The Permission Management API's save endpoint calls `await refreshRolePermissionCache()` **after** its DB transaction commits and **before** returning the HTTP response — this gives read-your-writes consistency for the admin doing the save, stronger than any TTL, with zero code changes needed at any existing `hasPermission` call site.
- A defensive 60s `setInterval` self-heal refresh is added in `main.ts` as cheap insurance (not required for correctness).
- If the cache is somehow null (startup ordering bug), `hasPermission` fails closed (`return false`) for everyone except SUPERADMIN — never fails open.

**SUPERADMIN safety**: `hasPermission` hardcodes `if (role === "SUPERADMIN") return true` unconditionally, bypassing the DB entirely. SUPERADMIN gets **no rows** in `RolePermission` (nothing to seed, nothing to go stale as the catalog grows). The Permission Management API rejects `PUT /permissions/roles/SUPERADMIN` with 400, and `GET /permissions/roles/SUPERADMIN` synthesizes a full-catalog, `readOnly: true` response computed directly from `permissionCatalog`. The UI renders SUPERADMIN as a selectable-but-locked, fully-checked, non-editable role.

**Menu Registry needs zero code changes.** `MenuService.getNavTree` already calls `hasPermission(role, row.viewResource, row.viewAction)` — since `hasPermission`'s signature is unchanged, the new DB-driven grants flow through automatically. This is the concrete proof that there is exactly one authorization source of truth.

## Database Changes

**`packages/db/prisma/schema.prisma`** — new model, following the `Menu` model's exact audit-field convention:

```prisma
model RolePermission {
  id              String         @id @default(cuid())
  role            MembershipRole
  resource        String
  action          String
  createdByUserId String?
  updatedByUserId String?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  createdBy User? @relation("RolePermissionCreatedBy", fields: [createdByUserId], references: [id])
  updatedBy User? @relation("RolePermissionUpdatedBy", fields: [updatedByUserId], references: [id])

  @@unique([role, resource, action])
  @@index([role])
}
```

Add matching reverse relations on `model User` (mirroring the existing `MenuCreatedBy`/`MenuUpdatedBy` lines):
```prisma
createdRolePermissions RolePermission[] @relation("RolePermissionCreatedBy")
updatedRolePermissions RolePermission[] @relation("RolePermissionUpdatedBy")
```

No `isActive` flag (a missing row = not granted). No `companyId`/`branchId`/`applicationId` — matches the `Menu` model's precedent; deployment is company-scoped via `COMPANY_ID` env var, not per-row.

Generate migration: `pnpm --filter @medcal/db exec prisma migrate dev --name add_role_permission`.

**New seed** `packages/db/prisma/seed-role-permissions.ts` (mirrors `seed-menu.ts`'s upsert pattern): seeds `RolePermission` rows extracted **verbatim** from the current `roleStatements` object for ADMIN, SUPERVISOR, TECHNICIAN, FINANCE, CUSTOMER (SUPERADMIN excluded — see above), so effective behavior is preserved byte-for-byte at cutover. Then, as a clearly separate, commented block (not silently folded into "preserved behavior"):

```ts
// Business decision (2026-08-20): SUPERVISOR gains User Management
// (matching ADMIN's exact shape — read + membership manage, NOT
// users:manage, which only SUPERADMIN has today) and Email Whitelist management.
{ role: "SUPERVISOR", resource: "users", action: "read" }
{ role: "SUPERVISOR", resource: "membership", action: "manage" }
{ role: "SUPERVISOR", resource: "whitelist", action: "manage" }
```
(SUPERVISOR already has `managementDashboard:read` from the base preserved-behavior seed.)

Add `packages/db/package.json` script: `"seed:role-permissions": "tsx prisma/seed-role-permissions.ts"`.

## Authorization Changes

**`packages/auth/src/access-control.ts`**:
- Add `permission: ["manage"]` to the `ac = createAccessControl({...})` catalog (a genuinely new capability — the Permission Management API's own gate — requires this one code change, consistent with "catalog growth requires code").
- Delete the static `roleStatements` object entirely.
- Add:
  ```ts
  import { prisma } from "@medcal/db";

  let cache: Map<MembershipRole, Set<string>> | null = null;

  export async function loadRolePermissionCache(): Promise<void> {
    const rows = await prisma.rolePermission.findMany();
    const next = new Map<MembershipRole, Set<string>>();
    for (const row of rows) {
      const set = next.get(row.role) ?? new Set<string>();
      set.add(`${row.resource}:${row.action}`);
      next.set(row.role, set);
    }
    cache = next;
  }

  export async function refreshRolePermissionCache(): Promise<void> {
    await loadRolePermissionCache();
  }

  export function hasPermission(
    role: MembershipRole,
    resource: keyof typeof ac.statements,
    action: string,
  ): boolean {
    if (role === "SUPERADMIN") return true;
    if (!cache) return false; // fail closed — cache must be primed at boot
    return cache.get(role)?.has(`${resource}:${action}`) ?? false;
  }
  ```
- `permissionCatalog` export unchanged.

**`packages/auth/src/index.ts`**: re-export `loadRolePermissionCache`, `refreshRolePermissionCache`.

**`apps/api/src/main.ts`**: `await loadRolePermissionCache();` before `await app.listen(port)`, plus the defensive `setInterval(() => { void loadRolePermissionCache(); }, 60_000)`.

**`CompanyRoleGuard`, `@RequirePermission`, `MenuService.getNavTree`, `me.controller.ts`, `chat-socket-auth.ts`, `emails.service.ts`**: **zero changes** — all call `hasPermission(role, resource, action)` synchronously today and continue to do so; the function's behavior is now DB-backed underneath, transparently.

## Permission Management API

New module `apps/api/src/modules/permissions/` (`permissions.module.ts`, `permissions.controller.ts`, `permissions.service.ts`), registered in `app.module.ts` alongside `MenuModule`.

`@Controller("permissions")`, `@UseGuards(CompanyRoleGuard)`, class-level `@RequirePermission("permission", "manage")` (same shape as `WhitelistController`):

- `GET /permissions/catalog` — returns `permissionCatalog` (reused, same data the Menu Management picker already uses).
- `GET /permissions/roles` — all 6 roles with their current grants (SUPERADMIN synthesized as full-catalog + `readOnly: true`).
- `GET /permissions/roles/:role` — one role's grants (Zod-validated role enum).
- `PUT /permissions/roles/:role` — body `{ grants: {resource: string, action: string}[] }`:
  - 400 if `role === "SUPERADMIN"`.
  - 400 if any `{resource, action}` pair isn't in `permissionCatalog` (lists offending pairs).
  - Dedupe input.
  - Atomic replace: `prisma.$transaction([deleteMany({where:{role}}), createMany({data: grants, skipDuplicates: true})])`.
  - `await refreshRolePermissionCache()` after commit, before responding.
  - Returns the fresh grant list.

## Permission Management UX

New page `apps/portal/src/app/management/permission-management/page.tsx`, following `menu-management/page.tsx`'s existing `apiFetch`/`isForbidden`/`AccessDenied` pattern:
- Role `<select>` (6 roles; SUPERADMIN shown but locked/read-only, fully checked, no Save).
- Catalog loaded once from `GET /permissions/catalog`; grants loaded per role from `GET /permissions/roles/:role`.
- Grouped-by-resource checkbox grid (resource → its actions), with a small human-readable label map (Users, Email Whitelist, Dashboard, Leads, Chat, Email, Menu Management, Permission Management, Membership, Contact Messages, Customer Dashboard).
- Save → `PUT /permissions/roles/:role` with the full checked set; reload after save to confirm persisted state.

Menu Registry entry added via `packages/db/prisma/seed-menu.ts`: `code: "permission-management"`, `viewResource: "permission"`, `viewAction: "manage"`, so the page only appears in the sidebar for roles granted `permission:manage`.

Frontend icon plumbing: add `"permission"` to `ManagementNavIcon` in `apps/portal/src/app/management/nav-config.ts` and a matching case in `apps/portal/src/components/management/icons.tsx`.

## Supervisor Grants (final)

- `managementDashboard:read` (already had — Dashboard).
- `users:read` + `membership:manage` (new — matches ADMIN's existing User Management shape exactly; deliberately **not** `users:manage`, since ADMIN itself doesn't have it — only SUPERADMIN can enable/disable accounts).
- `whitelist:manage` (new — explicit requirement).

## Files Changed

- `packages/db/prisma/schema.prisma` — `RolePermission` model + `User` relations.
- `packages/db/prisma/seed-role-permissions.ts` — new, behavior-preserving seed + SUPERVISOR additions.
- `packages/db/prisma/seed-menu.ts` — add `permission-management` menu row.
- `packages/db/package.json` — add seed script.
- `packages/auth/src/access-control.ts` — delete `roleStatements`, add cache + DB-backed `hasPermission`, add `permission:manage` to catalog.
- `packages/auth/src/index.ts` — re-export cache functions.
- `apps/api/src/main.ts` — prime cache at boot + defensive refresh interval.
- `apps/api/src/app.module.ts` — register `PermissionsModule`.
- `apps/api/src/modules/permissions/*` — new module (controller, service, module, tests).
- `apps/portal/src/app/management/permission-management/page.tsx` — new UI.
- `apps/portal/src/app/management/nav-config.ts`, `apps/portal/src/components/management/icons.tsx` — new icon.
- `packages/auth/src/access-control.test.ts` — rewrite to seed the mocked/test DB and call `loadRolePermissionCache()` before assertions; preserve all existing assertions; add SUPERADMIN-bypass and SUPERVISOR-new-grants tests.

Untouched (per strict scope): authentication, User Registration, unrelated User Management/Email/FCM code, Menu Registry visual design, Zustand, Calibration/Technician/Customer Portal, Docker/nginx, deployment scripts.

## Verification

1. `pnpm --filter @medcal/db exec prisma migrate dev` — schema applies cleanly.
2. Run `seed:role-permissions` and `seed:menu` — confirm rows created.
3. `pnpm --filter @medcal/auth test` — `access-control.test.ts` passes with preserved behavior + new SUPERADMIN/SUPERVISOR assertions.
4. `pnpm --filter @medcal/api test` — new `permissions.service` tests (reject unknown pair, reject SUPERADMIN edit, atomic replace, dedupe) pass; existing guard/menu tests still pass unmodified.
5. Manual end-to-end (the mandatory acceptance test): start API+portal, log in as SUPERADMIN, open Permission Management, grant SUPERVISOR a permission it lacks (e.g. `lead:read`), save, confirm DB row exists, log in as SUPERVISOR, confirm the corresponding menu item appears and the route/API works; then revoke it, confirm the menu item disappears and the API returns 403.
