# Menu & Permission Architecture — Pre-Implementation Forensic Audit

**READ-ONLY AUDIT REPORT — NO CODE, SCHEMA, OR CONFIG WAS MODIFIED.**

This is not an implementation plan. Per the audit brief, this document is the final deliverable. Nothing described below has been built; nothing should be built without a separate, explicit go-ahead informed by §15/§16 of this report.

---

## 1. Audit Verdict

**GREEN** (with prerequisites) — the documented architecture direction is sound and matches the repo's actual RBAC baseline. No implementation should start yet because several product decisions listed in §15 are still open, but there is no architectural contradiction, no evidence of a second RBAC system being introduced, and no evidence the locked G1–G5 baseline would need to change.

Rationale: the repo confirms (a) RBAC is real, consistent, and already covers users/whitelist/membership; (b) menu/navigation code today is 100% static, client-side, UX-only, and explicitly documented as non-authoritative in its own source comments; (c) no legacy `sys_Menu`/`sys_MenuPermission` tables exist anywhere in the schema or code — only in planning docs; (d) the docs' own v2 architecture review already reaches the same "hybrid: DB-backed menu *definitions*, RBAC-derived *visibility*, no Role→Menu table" conclusion that this audit independently supports from repo evidence.

---

## 2. Documentation vs Repository

**Agreements (docs match code):**
- `UserMembership.role` (`MembershipRole` enum) is the sole role-carrying model — confirmed in `packages/db/prisma/schema.prisma:34-41, 342-356`. No `User.role` exists. Matches G1/G2 locks.
- Guard behavior matches the final-audit's G3/G5 table: `CompanyRoleGuard`, `me.controller.ts`, `chat-socket-auth.ts` all check `user.status === "ACTIVE"` (not merely `!== "DISABLED"`) — confirms `g5-implementation-report.md` was actually applied, resolving the earlier documented contradiction (see below).
- Permission catalog strings match exactly: `contactMessage:read`, `whitelist:manage`, `lead:read/update`, `chat:read/reply/close`, `users:read/manage`, `membership:manage` in `packages/auth/src/access-control.ts`.
- SUPERVISOR/TECHNICIAN/FINANCE/CUSTOMER still resolve to `ac.newRole({})` (zero permissions) — matches docs' explicit "product decision, not a defect" framing.
- No `Menu`/`MenuPermission` Prisma model, no menu API endpoint, no `sys_Menu`-style table — matches both menu-permission docs' findings exactly.
- `nav-config.ts` (management and client) is static, role-array-filtered (`filterNavByRole` / inline `.filter`), and both carry the identical inline comment that this is "UX only" and `CompanyRoleGuard` is the real boundary — matches docs verbatim.
- No branch scoping anywhere (schema header comment: "No branchId (Company only)") — matches docs' rejection of `sys_Menu`/`sys_MenuPermission`'s `branch_id` column.

**Discrepancies / stale documentation:**
- `forensic-audit-user-management-rbac.md` (first audit) is **not a clean point-in-time snapshot** — its §15 was edited in place after later G2–G5 decisions landed, per the implementation report's own changelog. Anyone reading it today without also reading `final-forensic-audit-user-management-rbac.md` would get a partially-mutated document. **Recommendation: treat `final-forensic-audit-user-management-rbac.md` as sole authoritative history; the first audit doc should ideally be marked superseded/deprecated rather than silently mutated.**
- `implementation-report-user-management.md` §11.1 claims "status `INVITED` akan diblock oleh guard" — this was **false at the time it was written** (the guard at that point only checked `!== "DISABLED"`, per `g5-decision-impact-audit.md` §3.7's own explicit correction). It only became true after `g5-implementation-report.md` landed. Current repo code confirms the claim is now true, so this is resolved in practice, but the docs contain a documented-and-acknowledged internal contradiction between two files. No action needed beyond awareness.
- Menu architecture recommendation was **reversed** between the two menu docs: v1 (`forensic-audit-menu-permission.md`) recommends pure hardcoded config (Option A); v2 (`architecture-review-menu-permission-v2.md`) recommends DB-backed menu *definitions* + RBAC-derived visibility (Hybrid), driven by a new "ops must edit menu without deploy" + multi-application requirement that wasn't part of v1's evidence base. **This is the currently governing recommendation** — v1 should be read as historical context only, not current guidance.
- v2 introduces an `application` scope (`MANAGEMENT | TECHNICIAN | CALIBRATION | CUSTOMER`) that v2 itself states "belum ada di repo" (does not exist in repo yet) — confirmed by this audit's own repo read (§8 below). This is a proposed future concept, not a current gap in existing code.
- G1/G2 gate labels ("G1", "G2") are not traceable in source-code comments the way G3/G4/G5 are — G1/G2 behavior is implemented (registration-vs-provisioning split; SUPERADMIN bootstrap-only) but only labeled in prose/doc comments, not tagged inline in the guard/service code itself. Minor traceability gap, not a functional one.

**Unresolved contradictions:** none that affect the menu-permission decision. The only unresolved item is a genuine open product decision, not a doc/code conflict: whether Calibration Management is a module inside MANAGEMENT (per the current audit brief) or could ever be a separate application surface (v2 doc raised this as unverified, but the brief for *this* audit explicitly resolves it — Calibration is inside MANAGEMENT).

---

## 3. Current RBAC Baseline (relevant to Menu Permission)

- **Auth:** Better Auth, in-process inside `apps/api` (`packages/auth/src/index.ts`). No `admin`/`organization` plugin registered — role authority lives solely in `UserMembership.role`.
- **Role model:** `MembershipRole` enum (`SUPERADMIN, ADMIN, SUPERVISOR, TECHNICIAN, FINANCE, CUSTOMER`), one role per user per company (`@@unique([userId, companyId])` on `UserMembership`).
- **Permission catalog:** `packages/auth/src/access-control.ts` — Better Auth `createAccessControl`, resource:action strings (`resource: ["action1","action2"]`), `roleStatements` maps each role to a static grant set, `hasPermission(role, resource, action)` is the sole exported check — pure, synchronous, no DB access.
- **Enforcement:** `CompanyRoleGuard` (`apps/api/src/common/guards/company-role.guard.ts`) — opt-in per route via `@RequirePermission(resource, action)` decorator; resolves session → membership (by `{userId, companyId}` with `companyId` from `process.env.COMPANY_ID`, never client input) → requires `user.status === "ACTIVE"` → calls `hasPermission`. Routes without the decorator are **not** checked by this guard (relies on a separate global `AuthGuard` for basic 401s only).
- **Tenant scope:** single `COMPANY_ID` env var per deployment — effectively single-tenant-per-process. No branch scoping exists anywhere in the schema.
- **G1–G5 lifecycle:** all locked and, per this audit's cross-check, actually implemented in current code (registration≠provisioning, SUPERADMIN bootstrap-only, ACTIVE+membership required for any access, domain-conditional whitelist gate for company-domain signups).

**This baseline is treated as LOCKED for this audit**, per the brief. Nothing found in the repo suggests it needs to change to support Menu Permission.

---

## 4. Current Menu Implementation

- **No backend menu system exists.** No `Menu`/`MenuPermission` Prisma model, no menu API/controller, no menu-related guard. `GET /me` returns only `{ user, membership: { role, companyId } }` — no permission list, no menu payload.
- **Frontend is 100% static config**, two independent files: `apps/portal/src/app/management/nav-config.ts` and `apps/portal/src/app/client/nav-config.ts`. Each `NavItem` carries `label, href, icon, roles: MembershipRole[]`, optional nested `children`.
- **Filtering is role-inclusion only**, not permission-based: `filterNavByRole` (management) does `item.roles.includes(role)`; the client surface does the same via an inline `.filter(...)` — **two separate, independently-maintained implementations of the same idea**, not shared code.
- **Dashboard is not special-cased.** It is a normal `NavItem` with an explicit (broad) `roles` array, filtered through the exact same mechanism as every other item — confirmed no hardcoded "always show Dashboard" branch anywhere in `layout.tsx`, `management-shell.tsx`, or `sidebar-nav.tsx`. This already satisfies the brief's §9 requirement in principle, though it's driven by role lists, not resource:action permissions — see §7 gap below.
- **Application surfaces today:** `apps/portal` is one Next.js app, split into "Management" and "Customer" purely by hostname (`apps.*` vs `portal.*`) via `proxy.ts` rewriting `/*` → `/management/*` or `/client/*`. This is documented in-code as "UX/routing split only — RBAC enforcement stays server-side." There is no first-class `application` concept in the data model or API. "Technician" is a wholly separate, nearly-empty app (`apps/tech-pwa`) with no nav config at all yet.
- **No 403 page / no route-level guard.** The only place unauthorized access is handled is a shared "Forbidden" block in each surface's `layout.tsx`, which fires only when the user has **no valid session/membership at all** (401/403 from `/me`). A user who *is* authenticated but lacks permission for a specific page (e.g., manually typing a hidden URL) hits no guard — the page renders its shell, then its data-fetch call gets a generic 403 from the backend, and the page shows a generic inline error string. No redirect-to-Dashboard, but also no purpose-built 403 UI — it's a silently degraded page state, not the standard 401-vs-403-distinguished UX the brief asks about.

---

## 5. Dynamic Menu Architecture Assessment

The product requirement ("menu must eventually be editable by ops without a deploy") is not satisfiable by the current static-array design, because there is no persistence layer for menu structure at all today — every change requires a code change and deploy.

A DB-backed **menu registry** (definitions only — label, route, icon, parent/child, ordering, enabled flag, stable code, application scope, an associated `viewPermission` reference) is architecturally sound *as an addition*, because:
- It does not need to touch `UserMembership`, `hasPermission`, or `CompanyRoleGuard` at all — those stay exactly as they are.
- Visibility can still be computed the same way it is today (`hasPermission(role, resource, action)`), just with the `resource`/`action` pair sourced from a DB row instead of a hardcoded array element.
- It is a strict superset of current capability — nothing about it requires re-deriving how the backend decides what a role can *do*.

This matches the docs' own v2 conclusion (Hybrid) and is not contradicted by anything found in the repo.

---

## 6. Permission Architecture Assessment

The existing `resource: action[]` catalog (`packages/auth/src/access-control.ts`) already generalizes cleanly to the brief's example CRUD + business-action list (`calibrationJob:read/update/assign/submit/post/approve`, `certificate:print`, `report:export`) — it is the same shape as the resource/action pairs already in use (`chat:read/reply/close`, `users:read/manage`). No structural change to the catalog mechanism is needed; it just needs new resource/action entries added when those modules are built (not now — out of scope for this audit and explicitly not to be created).

One real gap for future work: `require-permission.decorator.ts` types `resource`/`action` as loose `string`, not narrowed to `keyof typeof ac.statements` — a typo'd permission string currently compiles fine and just always denies at runtime. This is a pre-existing type-safety gap, unrelated to menu work, worth noting but out of scope to fix here.

---

## 7. Menu → Permission Assessment

**Correct relationship, confirmed by repo evidence:** Menu is a pure navigation/config concern; **visibility should be `hasPermission(role, resource, action)` against the existing catalog**, not a new `Role → Menu` table and not a CRUD-flag table per menu row.

Today's `NavItem.roles: MembershipRole[]` is a *role*-based proxy for what should really be a *permission*-based check — it works today because the app is small and 1:1 role↔page mapping happens to hold, but it already diverges from the actual authorization source of truth (`access-control.ts`), which is why the menu docs flag mismatches like S2/S3 in `forensic-audit-menu-permission.md` (dashboard links to `/leads`/`/chat` shown to roles with `{}` permissions; Update-Status UI shown to ADMIN who lacks `users:manage`). This is a real, present-day drift between the two filtering mechanisms, not a hypothetical future risk.

**Recommended target relationship** (matches v2 doc, and this audit's own reading of the code): each leaf menu item carries one `(resource, action)` pair; visibility = `hasPermission(membership.role, resource, action)`; parent/group items are visible if any child is visible. No `Role → Menu` table, no per-menu CRUD-flag table.

---

## 8. Multi-Application Assessment

Current repo reality: Management and Customer are **one codebase**, split by hostname at the edge (`apps/portal/src/proxy.ts`), not a first-class `application` field anywhere in the data model or session payload. Technician is a **separate, nearly-empty app** (`apps/tech-pwa`) with no nav/menu concept implemented yet. There is no `application` enum, table, or concept in the schema today — confirmed by grep across `packages/db/prisma/schema.prisma` and all of `apps/`/`packages/`.

For the target model (Management / Technician / Customer, Calibration inside Management), an `application` scope needs to exist *somewhere* once a DB menu registry is introduced, so that Technician and Customer menus don't leak Management items and vice versa. Given the current split is hostname-driven and RBAC-enforcement-agnostic (the hostname split is explicitly documented as "not authorization"), the natural fit is a **stable code/enum on the menu registry row** (`application: 'MANAGEMENT' | 'TECHNICIAN' | 'CUSTOMER'`), read at the application layer to select which menu subtree to serve — not host-derived (hostnames can change, and `tech-pwa` is a different deployable entirely, so host-derived logic wouldn't unify cleanly across all three surfaces). This is a recommendation for a future decision, not something to implement now.

**Customer must not be a filtered view of Management's menu** — confirmed structurally straightforward today since Customer already has its own separate `nav-config.ts` file and its own `layout.tsx`; a DB registry should preserve this separation via the `application` scope rather than deriving Customer's menu by filtering Management's tree.

---

## 9. Tenant / Company / Branch Assessment

- **Company:** the whole backend is single-tenant-per-deployment via `process.env.COMPANY_ID`, never client-supplied. If a menu registry is introduced, it does not need a `companyId` column for authorization purposes — the deployment itself is already company-scoped. (It might still want one for auditing/seeding-per-environment reasons, but that's a data-management choice, not an authorization requirement.)
- **Branch:** does not exist anywhere in the current data model (explicit schema comment: "No branchId (Company only)"). No evidence branch-level menu scoping is needed; the legacy `sys_Menu`/`sys_MenuPermission` `branch_id` columns have no corresponding concept to attach to today.

---

## 10. Frontend Authorization / Capability Assessment

Today, the client receives only `membership.role` — no permission list, no menu, no capability data (`GET /me` payload confirmed minimal). For **menu visibility**, this is currently sufficient in principle since role-based filtering is happening client-side (though drifting from the real permission catalog, per §7).

For the brief's distinction between **menu visibility** and **action-level capability** (Edit/Assign/Submit/Approve buttons inside a page), the current architecture has **no client-safe capability signal at all** — pages either don't check anything client-side (buttons render unconditionally, backend 403s on the actual mutation) or duplicate role logic ad hoc. This is a genuine gap for future Calibration-module UX (showing/hiding an Approve button, for example), but backend authorization already covers the security requirement — a missing capability signal is a UX polish gap, not a security gap.

The two architecturally sound options evident from the codebase's own patterns: (a) a server-filtered navigation/capability payload analogous to today's `/me` (extend it, or add a `/nav` endpoint per v2 doc's §10 proposal) that returns already-permission-checked menu + optionally a same-shape "capabilities for this page" list; or (b) exposing a minimal, server-computed, client-safe `permissions: string[]` array in the session payload for the frontend to consult directly rather than re-deriving role logic per-component. Either avoids exposing the raw `roleStatements` object. No implementation recommendation is made here beyond noting both are consistent with "menu visibility is not the security boundary."

---

## 11. Backend Security Assessment

No weakening found or implied by the proposed direction. `CompanyRoleGuard`, `@RequirePermission`, `hasPermission`, `UserMembership.role`, `ACTIVE`+membership enforcement, and `COMPANY_ID` resolution are all confirmed intact and would remain the sole enforcement path under a DB-backed menu registry, since the registry's job (per §5/§7) is only to supply `(resource, action)` pairs for lookup — it never becomes a parallel gate.

One pre-existing (not menu-related) footgun worth flagging: `CompanyRoleGuard` allows any route through unconditionally if `@RequirePermission` metadata is absent (opt-in, not deny-by-default). This means a future endpoint added without the decorator is unguarded by this layer (though still behind the base session `AuthGuard`). Not a menu-permission defect — a general guard-usage discipline risk, already flagged in the docs (S7 in `forensic-audit-menu-permission.md`).

No evidence of URL bypass, role spoofing, or tenant leakage risk introduced by anything reviewed — the client never supplies `companyId`, and role is always re-resolved server-side from `UserMembership`, never trusted from client state.

---

## 12. Legacy Model Assessment

Confirmed no `sys_Menu`/`sys_MenuPermission` equivalent exists in the current schema or code — these are reference-only concepts from a prior system, present only in planning docs.

| Legacy concept | Verdict |
|---|---|
| `sys_Menu.parent_id`/hierarchy | KEEP (concept) — needed for grouped nav either way |
| `sys_Menu.label/href/icon` | KEEP (concept) |
| `sys_Menu.module_id`/`menu_type` | MODIFY → maps to future `application` scope + leaf/group distinction |
| `sys_Menu.company_id`/`branch_id` | REMOVE — no branch concept exists; company is deployment-scoped, not per-row |
| `sys_MenuPermission.can_view` | REPLACE — use `hasPermission(role, resource, 'read')` via existing catalog |
| `sys_MenuPermission.can_create/edit/delete/print/approve` | REMOVE as menu-row columns — these are action permissions, not menu properties; belong in `access-control.ts` resource:action catalog, decoupled from any menu row |
| `sys_MenuPermission.userCompanyRole_id` | REPLACE → `UserMembership.role` + `hasPermission`, not a new join table |
| `sys_MenuPermission.company_id`/`branch_id` | REMOVE — same reasoning as above |

**Menu + CRUD flags + Role would duplicate authorization logic** — confirmed risk. If a menu row carried `can_edit`/`can_approve` flags per role, that would become a second, unsynchronized permission system running alongside `access-control.ts`, exactly the failure mode the brief warns against in §11 and §3. The repo evidence (today's role-array drift in `nav-config.ts` vs the real permission catalog, per §7) already shows early symptoms of this kind of drift at a smaller scale — a strong argument for consolidating on a single `(resource, action)` reference per menu row rather than reintroducing CRUD flags.

---

## 13. Risks / Gaps

**HIGH**
- None identified that block or complicate menu-permission planning.

**MEDIUM**
- Menu visibility (`NavItem.roles`) and real authorization (`access-control.ts` `hasPermission`) are two independently-maintained sources of truth today, already causing observable drift (dashboard links shown to roles with zero permissions; Update-Status UI shown to a role lacking `users:manage`). This is the core problem the proposed permission-derived-visibility model would fix, and its persistence today is evidence *for*, not against, that direction.
- No distinguishable 403 UX for "authenticated but not authorized" on manual URL entry — currently a generic inline error string, not a dedicated 403 state. Worth resolving alongside menu work since a permission-derived menu makes "hidden but reachable by URL" pages more systematic, not less.

**LOW**
- Two independent nav-filtering implementations (`filterNavByRole` for management, inline `.filter` for client) instead of one shared function — minor duplication, not a security issue.
- `require-permission.decorator.ts` resource/action typed as loose `string`, allowing typo'd permissions to silently always-deny rather than fail at compile time.
- `CompanyRoleGuard`'s opt-in (not deny-by-default) design for `@RequirePermission` — a route without the decorator isn't checked by this guard.

**INFORMATIONAL**
- `apps/tech-pwa` has no nav/menu concept implemented at all yet — any future Technician menu work starts from zero, not from an existing pattern to extend.
- G1/G2 gate labels aren't traceable via source-comment grep the way G3–G5 are — documentation-traceability nit, not a functional gap.
- `forensic-audit-user-management-rbac.md` is a mutated historical document (its §15 was edited after later decisions landed) — reading it in isolation could mislead; `final-forensic-audit-user-management-rbac.md` is authoritative.

---

## 14. Architecture Decision

Recommended target (matches the docs' own v2 conclusion, independently corroborated by repo evidence):

- **Menu = DB-backed registry** of definitions only (application scope, parent/child, label, route, icon, order, enabled flag, stable code, one `(resource, action)` reference per leaf, audit fields). Ops-editable later, seeded from code initially.
- **Permission = unchanged.** Existing `access-control.ts` catalog + `hasPermission` remains the single source of truth for both action authorization and menu visibility.
- **No `Role → Menu` table. No CRUD flags on menu rows. No second RBAC system.**
- **Application scope** = a stable code/enum on each menu row (`MANAGEMENT | TECHNICIAN | CUSTOMER`), not host-derived, not a new relational entity unless a real need for per-application metadata beyond a code emerges.
- **Company/branch scope on menu rows: not needed** — company is deployment-scoped already; branch doesn't exist in the model.
- **Backend remains the authority.** Any future menu-serving endpoint (e.g. `GET /nav?application=...`) must itself call `hasPermission` server-side before returning nodes — it is a convenience/consistency layer, not a new place trust originates.

---

## 15. Implementation Prerequisites (unresolved product decisions)

These must be decided before any coding begins — none are answered by the repo or existing docs:

1. Who may edit the menu registry: SUPERADMIN only (current stated decision) vs. eventually ADMIN — and if a future permission is needed for this, what its `(resource, action)` pair should be. **Do not create it yet** per the brief.
2. Whether Dashboard's `viewPermission` should be a real existing permission (if one applies) or a deliberately-always-true check that still routes through the same code path — needs a decision that doesn't special-case Dashboard structurally.
3. Whether `application` needs any metadata beyond a stable code (e.g., a display name, host mapping) or is purely a menu-row scope value.
4. Whether Calibration Management's future permissions (`calibrationJob:*`, `certificate:print`, `report:export`) get defined now as placeholders or only when that module is actually built (recommend: only when built, per YAGNI and the brief's own instruction not to create permissions now).
5. Whether the frontend gets a dedicated `/nav` (or similar) server-filtered endpoint, or continues client-side filtering against a delivered permission/menu payload — an implementation-detail decision for the coding phase, not an architectural one.
6. Whether the drift identified in §7/§13 (nav roles vs. real permission catalog) should be fixed as part of the same effort that introduces the DB registry, or treated as a separate, smaller pre-cleanup — a sequencing decision for the user.

---

## 16. Implementation Boundary

**MAY be implemented later** (once §15 decisions are made and explicitly authorized):
- A DB-backed Menu registry table (definitions only, no permission logic).
- A menu-serving mechanism (API endpoint or equivalent) that composes existing `hasPermission` checks server-side.
- Replacing `NavItem.roles` role-array filtering with permission-derived filtering, reusing the existing `access-control.ts` catalog.
- A dedicated 403 UI state distinguishing "not authenticated" from "authenticated, not authorized."
- Future `application` scoping once Technician/Customer surfaces need it.

**MUST NOT be changed**, now or as part of menu work, without a separate explicit decision:
- Better Auth configuration, `UserMembership`, `UserMembership.role`.
- `createAccessControl` mechanism, `hasPermission`, the existing permission catalog's resource/action shape.
- `CompanyRoleGuard`, `@RequirePermission`.
- `COMPANY_ID` tenant resolution.
- G1–G5 authorization behavior/lifecycle.
- No second RBAC system, no `Role → Menu` table, no `UserMenuPermission`/`MenuRole`, no CRUD-flag-per-menu-row table.

**This turn ends with the audit report above. Nothing has been implemented.**
