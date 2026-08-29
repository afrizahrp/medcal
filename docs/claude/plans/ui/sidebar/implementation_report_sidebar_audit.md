# Sidebar Navigation Audit — Grouping "Equipment Types" + "Equipment Requirements" under an "Equipment" parent

**Status:** INSPECTION / AUDIT ONLY — no code, schema, data, RBAC, or configuration was modified.
**Date:** 2026-08-29
**Scope:** MEDCAL Management portal sidebar (`apps/portal` management shell). RBAC / role-permission behavior is explicitly out of scope and untouched.

---

## 1. Current sidebar architecture

The Management sidebar is **data-driven from the database**, not hard-coded in the frontend.

```
DB: Menu table  ──(GET /menu/nav?application=MANAGEMENT)──▶  MenuService.getNavTree()
     │                                                          (permission-filters + builds tree)
     ▼
apps/portal  useNav("MANAGEMENT")  ──▶  NavItem[]  ──▶  ManagementShell
     │
     ├─▶ ManagementSidebar  (desktop, lg:+)   ─▶ SidebarNav
     └─▶ MobileDrawer       (< lg)            ─▶ SidebarNav
```

- **Source of truth:** `Menu` rows (`packages/db/prisma/schema.prisma` model `Menu`, lines 468–493). Seeded by `packages/db/prisma/seed-menu.ts`.
- **Server assembly:** [`MenuService.getNavTree()`](apps/api/src/modules/menu/menu.service.ts#L167-L199) reads all `Menu` rows for the application, groups them by `parentId`, and **recursively** builds a tree. A leaf is kept iff `isActive && hasPermission(role, viewResource, viewAction)`. A group is kept iff `isActive && it has ≥ 1 visible child`. Groups never carry their own permission — visibility only flows up from real leaves.
- **Endpoint:** [`GET /menu/nav`](apps/api/src/modules/menu/menu.controller.ts#L63-L98) — intentionally not `@RequirePermission`-gated; it does an inline session + ACTIVE-membership check and returns the caller's own permission-filtered tree.
- **Client fetch:** [`useNav()`](apps/portal/src/lib/use-nav.ts) — React Query, `queryKey: ["nav", application]`, maps API nodes → `NavItem`.
- **Client render:** [`SidebarNav`](apps/portal/src/components/management/sidebar-nav.tsx) is shared by both desktop and mobile.

### Active-state / route matching
[`apps/portal/src/app/management/nav-config.ts`](apps/portal/src/app/management/nav-config.ts):
- `isNavItemActive(pathname, item)` — leaf is active when `pathname === item.href` or `pathname.startsWith(item.href + "/")`. Returns `false` for any item that has `children`.
- `isNavGroupActive(pathname, item)` — `true` when **any direct child** leaf is active. **Only inspects one level of `children`** (`item.children?.some(child => isNavItemActive(...))`).

### Expand / collapse state
- Per-group open state lives in `NavGroup` local component state: `const [open, setOpen] = useState(groupActive)` + `useEffect(() => { if (groupActive) setOpen(true) }, [groupActive])` (sidebar-nav.tsx:102-107). Groups are **independent** — opening one never closes another.
- **Group expansion is NOT persisted.** Only the whole-sidebar collapse toggle is persisted, via `localStorage` key `medcal.management.sidebarCollapsed` ([`shell-state.ts`](apps/portal/src/components/management/shell-state.ts)).
- Whole-sidebar collapse/hover/pin is managed in [`ManagementShell`](apps/portal/src/components/management/management-shell.tsx) (`collapsed`, `hoverExpanded`, `pinnedExpanded`).

### Icons
Fixed string union `ManagementNavIcon` in `nav-config.ts` (lines 1–25) → resolved by the `NavIcon` switch in [`icons.tsx`](apps/portal/src/components/management/icons.tsx#L240-L301). Some are local hand-drawn SVGs, some are `lucide-react` (`Wrench`, `ClipboardList`, `FolderTree`, `Tags`, `Boxes`, `Activity`, `SlidersHorizontal`, `Cpu`, `Gauge`, …). The DB `icon` column is a free string; unknown values render nothing.

### Responsive / mobile
- **Desktop (`lg` ≥ 1024px):** [`ManagementSidebar`](apps/portal/src/components/management/sidebar.tsx) — `fixed`, width toggles between `w-sidebar-collapsed` (icon rail) and `w-sidebar-expanded`. Hover expands as an overlay unless pinned.
- **Mobile / tablet (< 1024px):** [`MobileDrawer`](apps/portal/src/components/management/mobile-drawer.tsx) — off-canvas `dialog`, `max-w-[min(280px,85vw)]`, focus-trapped, body scroll-locked, `SidebarNav` rendered with `collapsed={false}` and `touch` (larger tap targets, `min-h-11`).
- Both use the **same `SidebarNav`**, so any nesting change applies to both automatically.

### Permission / authorization handling
- All filtering happens **server-side** in `getNavTree()` using `hasPermission(role, resource, action)` from `@medcal/auth`. The client receives an already-filtered tree and does **no** permission checks.
- Groups have `viewResource = null`, `viewAction = null` and are dropped when they have no visible children.

---

## 2. Relevant files / components

| Concern | File |
|---|---|
| Menu DB model | `packages/db/prisma/schema.prisma` (`model Menu`, L468–493) |
| Menu seed (current nav content) | `packages/db/prisma/seed-menu.ts` |
| Server tree build + permission filter | `apps/api/src/modules/menu/menu.service.ts` (`getNavTree`, L167–199) |
| Nav endpoint | `apps/api/src/modules/menu/menu.controller.ts` (`getNav`, L63–98) |
| Admin CRUD for menus | `apps/portal/src/app/management/menu-management/menu-form.tsx` + `page.tsx` |
| Client fetch | `apps/portal/src/lib/use-nav.ts` |
| NavItem type + active logic | `apps/portal/src/app/management/nav-config.ts` |
| Shell (collapse/hover/pin, mobile open) | `apps/portal/src/components/management/management-shell.tsx` |
| Desktop sidebar chrome | `apps/portal/src/components/management/sidebar.tsx` |
| Mobile drawer | `apps/portal/src/components/management/mobile-drawer.tsx` |
| **Nav renderer (the key file)** | `apps/portal/src/components/management/sidebar-nav.tsx` |
| Collapse persistence | `apps/portal/src/components/management/shell-state.ts` |
| Icon registry | `apps/portal/src/components/management/icons.tsx` |
| Layout wiring | `apps/portal/src/app/management/layout.tsx` |

---

## 3. Existing multi-level navigation pattern

### What the data layer supports
- `Menu.parentId` is a self-relation (`MenuHierarchy`). There is **no depth limit** in the schema.
- `MenuService.getNavTree()`'s `build(parentId)` helper is **fully recursive** — it already supports arbitrary depth server-side.
- `assertValidParent()` (menu.service.ts:218-255) only requires that the parent `isGroup === true` and belongs to the same application, plus a circular-reference guard. **A group nested inside another group is permitted by the API and by the admin UI** (`menu-form.tsx` "Parent (group)" dropdown lists every `isGroup` row).

### What the render layer supports
**Only two levels.** [`SidebarNav`](apps/portal/src/components/management/sidebar-nav.tsx):
- Top level: for each item, if `item.children?.length` → render `<NavGroup>`, else `<NavLeaf>`.
- `<NavGroup>` renders its children with `children.map(child => <NavLeaf ... nested />)` — **always `NavLeaf`, never another `NavGroup`, no recursion.**

Consequence if a 3rd level were seeded today (`Device Management ▸ Equipment ▸ Equipment Types`):
- `Equipment` would be handed to `NavLeaf`. `NavLeaf` renders a `<Link href={item.href}>` — but a group node has `href: ""` (see `getNavTree` sets `href: null` → `toNavItem` maps to `""`). Result: a dead link to `""` (current page), no chevron, and **its `Equipment Types` / `Equipment Requirements` grandchildren would not render at all.**
- `isNavGroupActive` would also not light up `Device Management` when `/equipment-types` is open, because it only checks direct children (the `Equipment` group node, which `isNavItemActive` returns `false` for).

### Existing convention (every section today)
Exactly **one level of groups**, and **every group contains only leaves**:

```
Dashboard                         (root leaf)
Leads ▸            Messages | Web Chat | Email
Device Management ▸ Categories | Types | Models | Capabilities | Calibration Parameters | Devices | Equipment Types | Equipment Requirements
Calibration Management ▸ Customer | Requisition | Quotation | Purchase Order | Work Order
User Management ▸  User | Whitelist | Permission
System Setting ▸   Menu | Tax | UOM
```

**There is no existing 3-level example anywhere in the codebase.** The recursive capability exists in the data model and the API, but has never been exercised by the renderer.

---

## 4. Current Device Management navigation structure

Group row: `code: "device-management"`, `label: "Device Management"`, `icon: "device"`, `order: 2`, `isGroup: true`, no href/permission. (`seed-menu.ts` L89–96)

| Label | code | href / route | icon | viewResource | viewAction | order | Parent |
|---|---|---|---|---|---|---|---|
| Categories | `device-management.categories` | `/device-categories` | `folderTree` | `deviceCategory` | `read` | 0 | device-management |
| Types | `device-management.types` | `/device-types` | `tags` | `deviceType` | `read` | 1 | device-management |
| Models | `device-management.models` | `/device-models` | `boxes` | `deviceModel` | `read` | 2 | device-management |
| Capabilities | `device-management.capabilities` | `/device-capabilities` | `activity` | `deviceCapability` | `read` | 3 | device-management |
| Calibration Parameters | `device-management.calibration-parameters` | `/device-calibration-parameters` | `slidersHorizontal` | `deviceCalibrationParameter` | `read` | 4 | device-management |
| Devices | `device-management.devices` | `/devices` | `cpu` | `device` | `read` | 5 | device-management |
| **Equipment Types** | `device-management.equipment-types` | `/equipment-types` | `wrench` | `equipmentType` | `read` | 6 | device-management |
| **Equipment Requirements** | `device-management.equipment-requirements` | `/equipment-requirements` | `clipboardList` | `equipmentRequirement` | `read` | 7 | device-management |

- **Generated from data** (Menu table via seed), not hard-coded.
- **Active-state:** each leaf lights up (`bg-brand-50 font-medium text-brand-800`) when the path matches `href` (exact or prefixed). Detail routes like `/equipment-types/[id]` keep "Equipment Types" active via the `startsWith(href + "/")` rule.
- **All permission-controlled** — each has a `viewResource`/`viewAction` pair; server drops the leaf if the role lacks it.
- Corresponding pages exist under `apps/portal/src/app/management/equipment-types/` and `.../equipment-requirements/`.

---

## 5. Current Calibration Management navigation structure

Group row: `code: "calibration-management"`, `label: "Calibration Management"`, `icon: "gauge"`, `order: 3`, `isGroup: true`. (`seed-menu.ts` L189–196)

| Label | code | href | icon | viewResource | viewAction | order |
|---|---|---|---|---|---|---|
| Customer | `calibration-management.customers` | `/customers` | `customer` | `customer` | `read` | 0 |
| Requisition | `calibration-management.calibration-requests` | `/calibration-requests` | `clipboardList` | `calibrationRequest` | `read` | 1 |
| Quotation | `calibration-management.quotations` | `/quotations` | `messageSquareQuote` | `quotation` | `read` | 2 |
| Purchase Order | `calibration-management.purchase-orders` | `/purchase-orders` | `fileText` | `purchaseOrder` | `read` | 3 |
| Work Order | `calibration-management.work-orders` | `/work-orders` | `wrench` | `workOrder` | `read` | 4 |

**It is a single-level parent group, identical in shape to Device Management** — group → leaves only, no sub-groups. This is the established convention; introducing a sub-group only under Device Management would be the *first* 3-level branch in the app. That is acceptable as long as the renderer is made generically recursive (so the pattern is reusable), not special-cased for Equipment.

---

## 6. Active / expanded state behavior

| Question | Behavior today |
|---|---|
| Parent menus expanded by default? | **No.** `NavGroup` opens only if `isNavGroupActive` (a direct child route is the current path). Otherwise collapsed. |
| Does opening one parent collapse another? | **No.** Each `NavGroup` has independent local state. |
| Is expansion state persisted? | **No.** Only the whole-sidebar collapse toggle persists (`localStorage: medcal.management.sidebarCollapsed`). |
| Does route navigation auto-expand ancestors? | **Yes, for one level.** `groupActive` recomputes on every `usePathname()` change; `useEffect` forces `setOpen(true)`. It does **not** currently propagate to a grandparent. |
| After page refresh? | Group re-opens correctly because `groupActive` is derived from `pathname` on mount. Sidebar collapsed/expanded restored from `localStorage`. Non-active groups start closed. |
| Direct URL entry to `/equipment-types`? | Today: "Equipment Types" leaf is active, "Device Management" auto-expands. |

### What the proposed structure needs, and whether it works without special-case logic

Target: navigate directly to `/equipment-types` →
1. **Device Management expanded** — needs `isNavGroupActive` to check descendants recursively (currently one level). ❌ not automatic today.
2. **Equipment expanded** — needs `NavGroup` to render nested `NavGroup` and each to self-open on `groupActive`. ❌ renderer doesn't recurse today.
3. **Equipment Types marked active** — `isNavItemActive` already works for any leaf regardless of nesting depth. ✅
4. **Correct active styling preserved** — `NavLeaf` styling is depth-independent. ✅ (indentation aside)

**Conclusion:** items 3–4 already work; items 1–2 require a **small generic recursion change** in `sidebar-nav.tsx` and `nav-config.ts` — not a new mechanism, not Equipment-specific branching.

---

## 7. Responsive behavior

- Desktop and mobile render the **same `SidebarNav`**; nesting logic is shared.
- **Collapsed desktop rail:** `NavGroup` with `collapsed` shows only the icon, `showChildren = !collapsed && open` → children hidden. There is **no flyout / popover** for collapsed groups today — this is already true for existing groups, so an "Equipment" sub-group inherits the same limitation (children only reachable when the rail is expanded/hovered/pinned).
- **Mobile drawer:** width `min(280px, 85vw)`. Current nesting indent = `NavGroup` children get `pl-5` on the leaf wrapper **plus** `ml-4` + `border-l` on the child container. A **third** level would stack another `pl-5`/`ml-4`, leaving roughly ~200px for label text on a 280px drawer — tight but workable for short labels ("Equipment Types", "Equipment Requirements"). Worth a visual check.
- No tablet-specific breakpoint — anything `< 1024px` is the drawer.
- `touch` mode adds `min-h-11 py-2.5` to leaves; nested leaves already receive this.

**Constraint:** deeper indentation on the 280px mobile drawer is the only real responsive risk; no layout break is expected.

---

## 8. Can the existing multi-level pattern support the proposed structure?

| Layer | Supports `Device Mgmt ▸ Equipment ▸ {Types, Requirements}` as-is? | Notes |
|---|---|---|
| DB schema (`Menu.parentId`) | ✅ Yes | Self-relation, no depth limit. No migration needed. |
| Menu API (`create`/`update` + `assertValidParent`) | ✅ Yes | Group-under-group already allowed. |
| `MenuService.getNavTree()` | ✅ Yes | `build()` is already recursive; emits nested `children`. |
| Admin UI (`menu-form.tsx`) | ✅ Yes | Parent dropdown lists all groups; can parent a group to a group. |
| Permission filtering | ✅ Yes | "Equipment" group has no permission; drops automatically if both children hidden. Children keep `equipmentType` / `equipmentRequirement` perms. |
| **Client renderer `SidebarNav` / `NavGroup`** | ❌ **No** | Renders children as `NavLeaf` only — no nested `NavGroup`, no recursion. |
| **`nav-config.ts` `isNavGroupActive`** | ❌ **No** | Checks direct children only — grandparent won't auto-expand. |

**Bottom line:** the architecture is 90% there. The data model, API, admin tooling, and permission model need **zero changes**. Only the presentational renderer needs a small, generic recursion upgrade.

---

## 9. Recommended minimal implementation approach

**Reuse the existing pattern. Do not build a new sidebar.** Two small, generic changes plus one data change:

### A. Data (seed only — no schema, no migration)
In `packages/db/prisma/seed-menu.ts`, within the Device Management block:
1. Add one group row:
   `code: "device-management.equipment"`, `parentCode: "device-management"`, `label: "Equipment"`, `icon: <see §10>`, `order: 6`, `isGroup: true`. (No href / viewResource / viewAction — it is a navigation group only.)
2. Re-parent the two existing rows:
   - `device-management.equipment-types` → `parentCode: "device-management.equipment"`, `order: 0` (keep `href`, `icon`, `viewResource: equipmentType`, `viewAction: read` **unchanged**).
   - `device-management.equipment-requirements` → `parentCode: "device-management.equipment"`, `order: 1` (keep everything else **unchanged**).
3. `Devices` stays `order: 5`; `Equipment` group takes `order: 6`. No renumbering of the earlier items needed.
4. Run `pnpm --filter @medcal/db run seed:menu` against each environment (the seed is idempotent `upsert` by `application_code`). This is a **data** change, not a schema change.

   > Alternatively, the same three edits can be made entirely through the **Menu Management** admin UI with no code change at all — create the "Equipment" group, then edit each of the two menu rows to set its parent. Recommended to still encode it in `seed-menu.ts` so fresh environments match.

### B. Renderer — make `NavGroup` recursive (`sidebar-nav.tsx`)
- In `NavGroup`, when a child has `child.children?.length`, render a nested `<NavGroup>` instead of `<NavLeaf>` (extract the "group vs leaf" decision already in `SidebarNav` into a small shared `renderNavNode()` and call it for children too).
- Add a `depth` prop so indentation is applied consistently (e.g. reuse the existing `pl-5` / `ml-4 border-l` treatment per level, or cap visual indent at depth 2 to protect the mobile drawer).
- Keep `collapsed` handling: nested groups, like top groups, simply don't show children when the rail is collapsed.

### C. Active detection — make it recurse (`nav-config.ts`)
- Change `isNavGroupActive` to walk descendants recursively:
  `item.children?.some(child => isNavItemActive(pathname, child) || isNavGroupActive(pathname, child))`.
- This makes `Device Management` light up / auto-expand when `/equipment-types` or `/equipment-requirements` is the active route, and `Equipment` auto-expands too (its own `groupActive` becomes true).

### D. No RBAC changes
- The "Equipment" group carries **no** `viewResource`/`viewAction`. It is not a permission/resource.
- `getNavTree()` already drops an empty group, so a role with neither `equipmentType.read` nor `equipmentRequirement.read` simply won't see "Equipment". A role with only one sees "Equipment" with a single child. **No permission catalog, role-permission mapping, guard, or middleware change.**

### Estimated change surface
~2 frontend files (`sidebar-nav.tsx`, `nav-config.ts`) + 1 seed file (`seed-menu.ts`) + re-run seed. No API, no Prisma schema, no page components, no business logic.

---

## 10. Potential UX concerns

1. **Collapsed-rail reachability.** When the desktop sidebar is collapsed to icons, group children (existing behavior) are hidden with no flyout. "Equipment Types" / "Equipment Requirements" become one extra click deeper (expand rail → expand Device Management → expand Equipment). Existing groups already have the first part of this problem; nesting adds one level. Consider whether a collapsed-rail flyout is worth doing separately (out of scope here).
2. **Two-deep auto-expand on load.** Landing on `/equipment-types` will expand *both* Device Management and Equipment, pushing other Device Management leaves (Categories…Devices) down. Acceptable, but the group is visually "pre-opened".
3. **Mobile drawer indentation.** Third-level items get double indentation on a ≤280px drawer. Mitigate by capping indent depth at level 2 (visual only) or slightly reducing per-level `pl`/`ml`.
4. **Icon redundancy.** "Equipment Types" currently uses `wrench`; "Work Order" also uses `wrench`. If "Equipment" (the new parent) also takes `wrench` there would be three wrenches. See icon recommendation below.
5. **First 3-level branch in the app.** Slight inconsistency with Calibration/User/System groups which stay 2-level. Low risk as long as the renderer change is generic (any group can now nest) rather than a special case.
6. **`order` uniqueness.** `assertOrderAvailable` enforces unique `order` among siblings. The seed must not collide (`Devices`=5, `Equipment` group=6; children `0`,`1` under the new parent). The idempotent `upsert` handles re-parenting cleanly.
7. **Chevron affordance.** `NavGroup` shows a chevron; nested group will too — good, consistent with the parent.

### Icon recommendation
- **Reuse the existing icon convention** — do not introduce a new SVG. `lucide-react` is already a dependency and several nav icons come from it.
- Give **"Equipment" its own parent icon** (parents currently all have icons: `device`, `gauge`, `users`, `settings`, `leads`).
- Best fit from what's already wired in `NavIcon`: **`boxes`** (currently only used by "Models") or **`wrench`**. To avoid the triple-wrench issue, prefer a distinct existing token. If a cleaner semantic match is wanted later (e.g. lucide `HardHat` / `Container`), that is a one-line addition to the `ManagementNavIcon` union + `NavIcon` switch + the admin `ICONS` list — but **not now**, per scope.
- The children keep their current icons (`wrench`, `clipboardList`) unchanged.
- Note: the admin `menu-form.tsx` `ICONS` array is a *subset* (13 entries) and does not list `device`, `boxes`, `folderTree`, etc. The seed uses the fuller set freely. If the "Equipment" icon should be editable via the admin UI, its token must be added to that `ICONS` array — otherwise seed-only is fine.

---

## 11. Files that would need to change (proposed implementation — NOT done here)

| File | Change | Type |
|---|---|---|
| `packages/db/prisma/seed-menu.ts` | Add `device-management.equipment` group row; set `parentCode` of the two equipment rows to it; adjust their `order`. | Data/seed |
| _(DB)_ | Re-run `seed:menu` per environment (idempotent upsert). Optionally do the same via Menu Management admin UI instead. | Data |
| `apps/portal/src/components/management/sidebar-nav.tsx` | Render nested `NavGroup` for children that have `children`; add `depth`-aware indentation. | Frontend render |
| `apps/portal/src/app/management/nav-config.ts` | Make `isNavGroupActive` recurse into descendant groups. | Frontend logic |
| `apps/portal/src/app/management/menu-management/menu-form.tsx` | _Only if_ the "Equipment" icon token must be admin-editable — add it to the `ICONS` array. Optional. | Frontend (optional) |

**No changes to:** Prisma schema, migrations, `menu.service.ts`, `menu.controller.ts`, permission catalog (`packages/auth/src/access-control.ts`), `seed-role-permissions.ts`, any `equipment-types/` or `equipment-requirements/` page component, API modules, or business logic.

---

## 12. Confirmation — nothing was modified

This task was inspection only. During this audit:

- **No** source files were edited.
- **No** Prisma schema or migration changes.
- **No** database writes, seeds, or migrations were run.
- **No** API, controller, service, or guard changes.
- **No** RBAC / role / permission / permission-mapping / authorization / menu-visibility changes.
- **No** Equipment / Equipment Requirements models or Device Management data changes.
- **No** page component or business-logic changes.
- **No** configuration changes.

The only file created is this report:
`docs/claude/plans/ui/sidebar/implementation_report_sidebar_audit.md`.

**Awaiting review before any implementation proceeds.**
