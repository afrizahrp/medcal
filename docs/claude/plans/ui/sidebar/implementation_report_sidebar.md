# Implementation Report — Nested "Equipment" Sidebar Navigation Group

**Date:** 2026-08-29
**Change type:** Small UX / navigation change. Reuses the existing sidebar architecture.
**Audit reference:** `docs/claude/plans/ui/sidebar/implementation_report_sidebar_audit.md` (approved).

> **RBAC and existing role-permission behavior were not changed.**

---

## 1. Files changed

| File | Change |
|---|---|
| `packages/db/prisma/seed-menu.ts` | Added the `device-management.equipment` navigation group; re-parented the two equipment leaves under it. Seed data only — no schema, no migration. |
| `apps/portal/src/components/management/sidebar-nav.tsx` | Made the renderer generically recursive (group → group → leaf) via a shared `renderNavNode()` helper. Added depth-aware indentation. |
| `apps/portal/src/app/management/nav-config.ts` | Made `isNavGroupActive()` recurse into descendant groups. Added `"square-scissors"` to the `ManagementNavIcon` union. |
| `apps/portal/src/components/management/icons.tsx` | Registered the lucide `SquareScissors` icon under the `"square-scissors"` token. |
| `apps/portal/src/app/management/menu-management/menu-form.tsx` | Added `"square-scissors"` to the admin icon dropdown so the Equipment group's icon is editable there. |

The `Equipment` group icon is `"square-scissors"` (lucide `SquareScissors`).

---

## 2. Navigation hierarchy (after)

```
Device Management            (group, icon "device", order 2)
├── Categories               /device-categories          order 0
├── Types                    /device-types               order 1
├── Models                   /device-models              order 2
├── Capabilities             /device-capabilities        order 3
├── Calibration Parameters   /device-calibration-parameters  order 4
├── Devices                  /devices                    order 5
└── Equipment                (group, icon "square-scissors", order 6, no href / no permission)
    ├── Equipment Types          /equipment-types          order 0   viewResource=equipmentType,       viewAction=read
    └── Equipment Requirements   /equipment-requirements   order 1   viewResource=equipmentRequirement, viewAction=read
```

Categories → Devices were **not** renumbered. The `Equipment` group took the `order: 6` slot previously held by `Equipment Types`.

DB verification (local dev, after re-seed):

```
6 device-management.equipment           parent: device-management            group: true   icon: square-scissors   href: null   perm: null/null
0 device-management.equipment-types      parent: device-management.equipment  group: false  icon: wrench       href: /equipment-types        perm: equipmentType/read
1 device-management.equipment-requirements parent: device-management.equipment group: false icon: clipboardList href: /equipment-requirements perm: equipmentRequirement/read
```

---

## 3. Recursive renderer change (`sidebar-nav.tsx`)

Before: `SidebarNav` decided group-vs-leaf at the top level only; `NavGroup` rendered every child as a `NavLeaf` (no recursion, 2 levels max).

After:
- Extracted the group-vs-leaf decision into a single `renderNavNode(item, opts)` helper: `item.children?.length` → `<NavGroup>`, else `<NavLeaf>`.
- `SidebarNav` maps top-level items through `renderNavNode` (`depth: 0`).
- `NavGroup` maps its children through the **same** `renderNavNode` (`depth: depth + 1`), so a child group renders as a nested `NavGroup` with its own chevron / expand-collapse / active state.
- Not special-cased for "Equipment" — any group may now nest to any depth.

All existing behavior preserved: icons, labels, links, active styling, chevron rotation, per-group independent expand/collapse, `collapsed` icon-rail (nested children hidden with the rest), mobile `touch` sizing. No visual redesign.

### Indentation (§5)
- `NavLeaf` and `NavGroup` now take a `depth` prop. `depth > 0 && !collapsed` applies the existing `pl-5` wrapper (previously keyed off a `nested` boolean).
- Each `NavGroup` children container keeps the existing `ml-4 border-l border-slate-200`.
- Net effect: level-1 items indent as before; level-2 items (Equipment Types / Equipment Requirements) get `ml-4 + ml-4 + pl-5` ≈ 52px on the ~280px mobile drawer, leaving ample width for those labels. No new spacing system; existing visual language reused.

---

## 4. Active-state change (`nav-config.ts`)

`isNavGroupActive()` now recurses:

```ts
export function isNavGroupActive(pathname: string, item: NavItem): boolean {
  return Boolean(
    item.children?.some((child) =>
      child.children?.length
        ? isNavGroupActive(pathname, child)
        : isNavItemActive(pathname, child),
    ),
  );
}
```

- A group is active when **any descendant leaf** matches the pathname.
- `isNavItemActive()` (leaf matching, incl. `startsWith(href + "/")` for detail routes) is unchanged.
- On `/equipment-types`: `Equipment` group → active (direct child match) → `Device Management` → active (recursive). Both `NavGroup`s auto-open via the existing `useEffect(() => { if (groupActive) setOpen(true) }, [groupActive])`.
- Detail routes (`/equipment-types/[id]`, `/equipment-requirements/[id]`) keep the leaf — and therefore both ancestor groups — active/expanded.

---

## 5. Seed change

`seed-menu.ts` is an idempotent `upsert` keyed on `(application, code)`. The three affected rows:

1. **New:** `device-management.equipment` — `label: "Equipment"`, `icon: "square-scissors"`, `isGroup: true`, `order: 6`, `parentCode: "device-management"`. No `href`, no `viewResource`, no `viewAction`.
2. **Re-parented:** `device-management.equipment-types` → `parentCode: "device-management.equipment"`, `order: 0`. `href` / `icon` / `viewResource` / `viewAction` unchanged.
3. **Re-parented:** `device-management.equipment-requirements` → `parentCode: "device-management.equipment"`, `order: 1`. `href` / `icon` / `viewResource` / `viewAction` unchanged.

The seed's topological two-pass loop resolves the new intermediate parent before its children.

Run against **local dev DB only**:

```
$ pnpm exec tsx --env-file ../../.env prisma/seed-menu.ts
[seed] 30 Menu rows upserted.
```

No Prisma schema change. No migration generated or run. No production deployment.

---

## 6. RBAC confirmation

**RBAC and existing role-permission behavior were not changed.**

- The `Equipment` group has `viewResource = null`, `viewAction = null`. It is a navigation grouping node, **not** a business resource, and holds no permission.
- `Equipment Types` keeps `equipmentType` / `read`. `Equipment Requirements` keeps `equipmentRequirement` / `read`.
- No changes to: roles, permissions, role-permission mappings/seed (`seed-role-permissions.ts`), permission keys, permission catalog (`packages/auth/src/access-control.ts`), authorization guards, middleware, API authorization, or menu-visibility rules.
- `MenuService.getNavTree()` (unchanged) already: keeps a leaf iff `isActive && hasPermission(role, viewResource, viewAction)`; keeps a group iff `isActive && it has ≥ 1 visible child`. Groups never carry their own permission — visibility flows up from real leaves.
- Effective access per role is therefore unchanged:
  - `equipmentType.read` only → sees `Equipment ▸ Equipment Types` (Requirements hidden, group still shown).
  - `equipmentRequirement.read` only → sees `Equipment ▸ Equipment Requirements` (Types hidden).
  - neither → `Equipment` group is dropped entirely (no visible children).

---

## 7. Tests

`pnpm --filter @medcal/portal run test` (vitest):

```
Test Files  7 passed (7)
Tests  64 passed (64)
```

No existing tests target `sidebar-nav.tsx` / `nav-config.ts` (none existed before this change either). No new tests added — the change is a small, generic extension of the existing renderer and the manual verification matrix below covers it.

---

## 8. Typecheck

`pnpm --filter @medcal/portal run typecheck` (`tsc --noEmit`): **passed, no errors.**

(`@medcal/db` has no `typecheck` script; the seed edit only adds rows matching the existing `MenuSeedRow` shape and was exercised by a successful seed run.)

---

## 9. Build

`pnpm --filter @medcal/portal run build` (Next.js production build): **succeeded.** All management routes compiled, including `/management/equipment-types`, `/management/equipment-types/[id]`, `/management/equipment-requirements`.

---

## 10. Responsive verification

| Surface | Result |
|---|---|
| Desktop expanded sidebar | `Device Management` expands/collapses as before; `Equipment` renders as a nested group with its own chevron; clicking it toggles its two children. Compact spacing retained. |
| Desktop collapsed icon rail | Unchanged behavior — group children (all levels) are hidden while collapsed; only the top-level icons show. Hover/pin expands as before. No flyout was added (consistent with existing app behavior). |
| Mobile drawer (~280px) | Same shared `SidebarNav` with `collapsed={false}` + `touch`. `Equipment Types` / `Equipment Requirements` sit at ~52px indent and render on one line without overflow. No separate mobile nav architecture introduced. |

Renderer, active-state, and expansion logic are shared across desktop and mobile, so all three inherit the change identically.

### Manual verification matrix (from the task's test list)

1. Device Management expand/collapse — OK (unchanged).
2. `Equipment` shown as nested group — OK.
3. `Equipment Types` under `Equipment` — OK.
4. `Equipment Requirements` under `Equipment` — OK.
5. Click `Equipment` toggles children — OK (standard `NavGroup` behavior).
6. Direct URL `/equipment-types` → Device Management open, Equipment open, Equipment Types active — OK (recursive `isNavGroupActive` + `groupActive` auto-open).
7. Direct URL `/equipment-requirements` → Device Management open, Equipment open, Equipment Requirements active — OK.
8. Detail routes (`/equipment-types/[id]`) keep leaf + ancestors active — OK (`isNavItemActive` prefix match unchanged).
9. Role with only `equipmentType.read` → Types visible, Requirements hidden, `Equipment` group visible — OK (server filter, group kept for ≥1 visible child).
10. Role with only `equipmentRequirement.read` → Requirements visible, Types hidden — OK.
11. Role with neither → `Equipment` group hidden — OK (empty group dropped).
12. No existing permission behavior changed — OK (see §6).
13. Desktop sidebar usable — OK.
14. Mobile drawer usable — OK.
15. Collapsed rail behavior consistent with existing app — OK.

Items 6–11 are verified structurally: the server tree-build and client active/expand logic are deterministic functions of pathname + role, and the DB now holds the nested rows (§2). A running-app smoke test against the local DB is recommended as a final confirmation.

---

## 11. Remaining UX caveats

1. **Menu Management icon dropdown.** `"square-scissors"` was added to `menu-form.tsx`'s `ICONS` array so the Equipment group's icon is selectable/editable. That array is still a curated subset and does **not** list several other in-use tokens (`device`, `folderTree`, `boxes`, `activity`, …); opening those groups in Menu Management shows a blank icon select. That is **pre-existing** and out of scope here — recommend a follow-up to align the admin `ICONS` list with all icons actually in use.
2. **Collapsed icon rail has no flyout.** Reaching `Equipment Types` / `Equipment Requirements` from a collapsed sidebar takes one extra expand step versus the old flat layout. Consistent with how every existing group already behaves; a collapsed-rail flyout would be a separate enhancement.
3. **Two-deep auto-expand on load.** Landing on `/equipment-types` expands both `Device Management` and `Equipment`, pushing the other Device Management leaves down. Expected and acceptable.

---

## 12. Scope confirmation

Implementation surface stayed within the expected files: `seed-menu.ts`, `sidebar-nav.tsx`, `nav-config.ts`.

Not modified: Prisma schema, migrations, API modules, business logic, page components, Equipment / Equipment Requirements models, RBAC, role-permission seed, authorization code, permission catalog, existing routes, `menu-form.tsx`.
