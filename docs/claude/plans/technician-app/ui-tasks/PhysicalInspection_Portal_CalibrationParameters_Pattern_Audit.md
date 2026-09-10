# Physical Inspection Portal — Calibration Parameters Pattern Audit

**Mode:** READ-ONLY / AUDIT ONLY  
**Date:** 2026-09-10  
**Source of truth:** existing Portal implementation of Calibration Parameters  
**Target use:** technical pattern/reference for future Portal  
`Device Management → Physical Inspection` (master: `DevicePhysicalCheckItem` only)

---

## 1. Executive Summary

The Portal page at `/device-calibration-parameters` is a **DeviceType-grouped expandable table**. Child rows (capabilities + parameters) are **eager-loaded** in `GET /device-calibration-parameters/grouped`. Expand/collapse is multi-row, seeded from `?expanded=`, with React state as source of truth and `history.replaceState` for URL sync. Search and status filter live in the URL (debounced). CRUD uses **full-page routes** (`/new`, `/[id]`), not modals. Reorder uses `@dnd-kit` with optimistic React Query updates. Soft status uses `isActive`; hard delete exists in the API but is **not exposed** in the Portal UI.

For Physical Inspection Portal master management, **safely reuse** the page architecture (DeviceType group → expand → item list → add/edit → sortOrder → isActive → React Query → RBAC shape → Portal chrome). **Do not reuse** Capability hierarchy, UOM/tolerance/decimal, test points, measurement domain, or the Tech execution permission `calibrationJobRecordPhysicalCheck`.

**Verdict: READY WITH GAPS** — the Calibration Parameters UI pattern is clear enough to mirror; Physical Inspection still lacks master CRUD API, management RBAC resource, and menu entry.

---

## 2. Exact Calibration Parameters route

| Item | Value |
|---|---|
| Browser URL | `/device-calibration-parameters` |
| Route file | `apps/portal/src/app/management/device-calibration-parameters/page.tsx` |
| Host rewrite | `apps/portal/src/proxy.ts` rewrites to `/{management\|client}` + pathname |
| Menu | `packages/db/prisma/seed-menu.ts` → code `device-management.calibration-parameters`, parent `device-management`, label “Calibration Parameters”, `viewResource: "deviceCalibrationParameter"` |
| Nested routes | `/device-calibration-parameters/new`, `/device-calibration-parameters/[id]` |

---

## 3. Exact files / components

| Area | Path | Primary symbol(s) |
|---|---|---|
| A. Route/page | `apps/portal/src/app/management/device-calibration-parameters/page.tsx` | `DeviceCalibrationParametersPage` |
| B. Page-level client | `.../device-calibration-parameters-page-client.tsx` | `DeviceCalibrationParametersPageClient`, `syncExpandedToUrl` |
| C. List/table | `.../device-calibration-parameters-ui.tsx` | `DeviceTypeParameterTable` |
| D. Expanded Device Name | same | parent `<tr>` + `ChildRows` |
| E. Parameter row | same | `SortableParameterRow` |
| F. Search/filter | same + page-client | `DeviceCalibrationParameterSearchBar` |
| G. Expand/collapse state | page-client | `manuallyExpanded`, `expandedIds`, `toggle` |
| H. Create UI | `.../new/page.tsx` | `NewDeviceCalibrationParameterPage` |
| I. Edit UI | `.../[id]/page.tsx` | `DeviceCalibrationParameterDetailPage` |
| J. Delete/deactivate | API only / edit form | `DELETE` → `service.remove`; Portal uses `isActive` on update |
| K. Drag/reorder | UI + hooks + helper | `ChildRows`, `SortableCapabilityHeaderRow`, `reorderIds`, reorder mutations |
| L. Query hooks | `.../use-device-calibration-parameters-query.ts` | `useDeviceCalibrationParameterGroups`, `useDeviceCalibrationParameter` |
| M. Mutation hooks | same | `useCreateDeviceCalibrationParameter`, `useUpdateDeviceCalibrationParameter`, `useReorderDeviceCalibrationCapabilities`, `useReorderDeviceCalibrationParameters` |
| N. Types | `device-calibration-parameters-ui.tsx` | `DeviceCalibrationParameterRow`, `DeviceCalibrationParameterGroupRow`, `DeviceCalibrationParameterGroupedResponse`, etc. |
| O. Zod/shared | `packages/shared/src/schemas/index.ts` | `deviceCalibrationParameterCreateSchema`, `Update`, `ListQuery`, `GroupedQuery`, capability/parameter order schemas |
| P. Permissions | `@medcal/auth` + `apps/api/src/modules/me/me.controller.ts` | `deviceCalibrationParameter{Read,Create,Update,Delete}` |
| Q. Error handling | form-fields + pages | `formatDeviceCalibrationParameterApiError`, `isForbidden`, `AccessDenied` |
| R. Loading/empty | page-client + UI | “Memuat…”, `DeviceCalibrationParameterEmptyState` |
| S. Toast/notification | — | **None** — inline red/green text only |
| T. Modal/drawer | — | **None** — full-page forms |

**Supporting Portal utilities / UI**

- `apps/portal/src/components/management/page-header.tsx` → `PageHeader`
- `apps/portal/src/components/access-denied.tsx` → `AccessDenied`
- `apps/portal/src/hooks/use-debounced-value.ts`
- `apps/portal/src/hooks/use-url-query-state.ts`
- `apps/portal/src/hooks/use-pagination-sync.ts`
- `apps/portal/src/components/ui/{button,input,badge,view-adjusted-banner}.tsx`
- Ordering helper + test: `device-calibration-parameter-ordering.ts`, `device-calibration-parameter-ordering.test.ts`
- Form fields: `device-calibration-parameter-form-fields.tsx`

**API**

- `apps/api/src/modules/device-calibration-parameters/device-calibration-parameters.controller.ts`
- `apps/api/src/modules/device-calibration-parameters/device-calibration-parameters.service.ts`
- `apps/api/src/modules/device-calibration-parameters/device-calibration-parameters.module.ts`
- Tests: `device-calibration-parameters.service.test.ts`

**Prisma**

- `DeviceCalibrationParameter`, `DeviceTypeCapabilityOrder` in `packages/db/prisma/schema.prisma`

---

## 4. Page architecture

```
page.tsx (Suspense fallback “Memuat…”)
  └─ DeviceCalibrationParametersPageClient
       ├─ useAuthz → gate deviceCalibrationParameterRead
       ├─ useUrlQueryState(["search","isActive","page","pageSize"])
       ├─ expand: React Set + history.replaceState(?expanded=)
       ├─ useDeviceCalibrationParameterGroups → GET /grouped
       ├─ PageHeader + Create button (if Create)
       └─ Surface
            ├─ SearchBar + status select
            ├─ result count line
            ├─ DeviceTypeParameterTable
            │    ├─ parent row: Device Name / Kategori / Jumlah
            │    └─ ChildRows when expanded
            │         ├─ Capability header rows (sortable)
            │         ├─ Parameter rows (sortable)
            │         └─ “Tambah parameter…” link (if Create)
            └─ PaginationBar (DeviceType-level)
```

Create and edit are **separate pages**, not drawers/modals.

---

## 5. Device Name grouping implementation

Implemented in `DeviceCalibrationParametersService.findAllGroupedByDeviceType`.

| Question | Exact behavior |
|---|---|
| Server vs frontend grouping? | **Server-side** |
| Grouping key | `deviceType.id` |
| DeviceType ID used? | Yes |
| DeviceType code used? | Present in payload (`deviceType.code`); **display uses `name`** |
| How Device Name displayed? | `group.deviceType.name` |
| How Category obtained? | After page slice: load `deviceType.category.name` → `categoryName` |
| Parameter count | `group.count` = matching parameters in that DeviceType group |
| Expanded in URL? | Yes (`?expanded=`), but React state is source of truth |
| Is `expanded=<id>` real? | Yes — comma-separated DeviceType IDs; seed on mount; synced via `replaceState` |
| Load one DeviceType or all? | Fetch **all matching parameters**, group by DeviceType, then **paginate groups** |
| Search effect on groups | Server filters parameters; a DeviceType appears only if it has ≥1 match |
| Search effect on expanded | While searching, **all groups on the current page auto-expand** |

Response extras: `totalParameters`, `totalDeviceTypes`, standard `page` / `pageSize` / `total` / `totalPages` at DeviceType level.

---

## 6. Expand / collapse implementation

Source: `device-calibration-parameters-page-client.tsx`.

| Concern | Behavior |
|---|---|
| Initial state | Seed once from `useSearchParams().get("expanded")` → `Set` of IDs |
| URL sync | `syncExpandedToUrl` via `window.history.replaceState` |
| Why not `router.replace`? | Comment: collapsing last row to bare pathname does not reliably re-render `useSearchParams` in App Router |
| Source of truth | **React state** (`manuallyExpanded`), not URL |
| Multiple expanded | Yes |
| One expanded only? | No — multi-expand |
| Persistence across reload | Yes, via initial URL seed |
| Back/forward | `replaceState` does not create history entries; BF may not restore expand the way push would |
| Interaction with search | Search overrides: `expandedIds = all group.deviceType.id` on page; manual set ignored while searching |

**Sibling note:** Equipment Requirements puts `expanded` in `useUrlQueryState` (URL-as-truth). Calibration Parameters deliberately does not. Physical Inspection should pick one approach consciously.

---

## 7. Search / filter implementation

| Concern | Behavior |
|---|---|
| Input | Controlled local `searchInput` |
| Debounce | `useDebouncedValue(..., 400)` then commit to URL `search` and reset `page` |
| Server vs client filter | **Server** (`buildSearchWhere`) |
| Searchable fields | parameter `code`/`name`; deviceType `name`/`code`; capability item name; capability name/code; UOM name/code/symbol; `toleranceNote` |
| Status filter | select → URL `isActive=true|false` or omitted (“Semua status”) |
| Query params (list URL) | `search`, `isActive`, `page`, `pageSize` (+ `expanded` via replaceState) |
| Clear/reset | Empty state “Reset pencarian” clears search, isActive, page |
| Result count | `{totalDeviceTypes} Device Name dengan {totalParameters} parameter` |
| Pagination | DeviceType-level; default pageSize 10; `usePaginationSync` clamps out-of-range page |

---

## 8. CRUD implementation

### CREATE

1. Navigate to `/device-calibration-parameters/new` (optional `?deviceTypeId=`).
2. Client validation (deviceType, capabilityItem, name, UOM, tolerance/decimal helpers).
3. `POST /device-calibration-parameters` with Zod-validated body (`code` not accepted — system-issued).
4. On success: invalidate `["device-calibration-parameters"]`, set detail cache, show success text, `router.push` to `/[id]`.
5. Update style: **pessimistic** (await mutateAsync); Save disabled while pending.

Form: `DeviceCalibrationParameterFormFields` mode `"create"` with comboboxes for Device Type / Capability / Capability Item / UOM.

### EDIT

1. `/device-calibration-parameters/[id]` loads detail via `useDeviceCalibrationParameter`.
2. Read-only detail unless `deviceCalibrationParameterUpdate`.
3. Inline edit on same page (`editing` state); structural hierarchy locked in mode `"edit"`.
4. `PATCH /device-calibration-parameters/:id` including optional `isActive`.
5. On success: invalidate list + detail keys, refetch detail, exit edit mode, success text.
6. **Pessimistic**; no optimistic form patch.

### DELETE / DEACTIVATE

- Portal: **deactivate** by setting `isActive=false` on edit.
- API: hard `DELETE /:id` exists (`RequirePermission` delete) — **no Portal UI** calls it.
- List “Edit” link is always rendered for readers; update gate is on the detail page Edit button (list link is not capability-gated).

Duplicate prevention: server `assertUniqueName` + unique `(deviceTypeId, capabilityItemId, code)`; client maps `DUPLICATE_DEVICE_CALIBRATION_PARAMETER_CODE`.

---

## 9. Ordering / reorder implementation

Two persisted levels:

1. **Capability order per DeviceType** → model `DeviceTypeCapabilityOrder`  
   `PATCH /device-calibration-parameters/device-types/:deviceTypeId/capability-order`  
   body: `{ capabilityIds: string[] }` (full set, no mismatch)

2. **Parameter order within (deviceType, capability)** → `DeviceCalibrationParameter.sortOrder`  
   `PATCH /device-calibration-parameters/device-types/:deviceTypeId/capabilities/:capabilityId/parameter-order`  
   body: `{ parameterIds: string[] }` (full set)

Details:

- UI: `@dnd-kit` (`DndContext`, `SortableContext`, `useSortable`), activation distance 4.
- Helper: `reorderIds` / `sameOrder` in `device-calibration-parameter-ordering.ts`.
- Persist step: multiples of 10 (`ORDER_STEP`).
- Optimistic: rewrite all cached grouped queries; rollback snapshot on error; invalidate on settle.
- Permission: `deviceCalibrationParameterUpdate`.
- Cross-capability parameter drag rejected in UI (`activeData.capabilityId !== overData.capabilityId`).
- Create appends new parameter to end of its (deviceType, capability) scope.

**Physical Inspection:** only item-level `sortOrder` under a DeviceType applies. Capability reorder is **domain-specific to Calibration Parameters** and must not be copied.

---

## 10. Active / inactive implementation

| Concern | Behavior |
|---|---|
| Default on create | `isActive` DB default `true` |
| Newly created | Active |
| List visibility | Shown according to status filter (default: all) |
| Editing inactive | Allowed |
| Filtering | URL `isActive` |
| Soft vs hard | Portal soft via PATCH; hard delete API unused by UI |
| Transaction usage (calibration jobs) | Outside this page; for PI Tech path, `listItems` already filters `isActive: true` |

Status badge: `DeviceCalibrationParameterStatusBadge` — Aktif (emerald) / Nonaktif (secondary).

---

## 11. API endpoints

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/device-calibration-parameters/grouped` | read | Browse UI primary |
| GET | `/device-calibration-parameters` | read | Flat list (legacy hook exists; browse UI does not use) |
| GET | `/device-calibration-parameters/:id` | read | Detail/edit |
| POST | `/device-calibration-parameters` | create | Auto code via `MasterCodeService` |
| PATCH | `/device-calibration-parameters/:id` | update | May include `isActive` |
| DELETE | `/device-calibration-parameters/:id` | delete | Hard delete; unused by Portal UI |
| PATCH | `.../device-types/:deviceTypeId/capability-order` | update | Capability reorder |
| PATCH | `.../device-types/:deviceTypeId/capabilities/:capabilityId/parameter-order` | update | Parameter reorder |

Controller: Zod `safeParse` → `BadRequestException` with codes like `INVALID_DEVICE_CALIBRATION_PARAMETER`.

---

## 12. Query / mutation hooks

File: `use-device-calibration-parameters-query.ts`  
Library: **TanStack React Query** (`@tanstack/react-query`) via `apiFetch`.

| Hook | Role |
|---|---|
| `useDeviceCalibrationParameterGroups` | Browse grouped list |
| `useDeviceCalibrationParameters` | Flat list (available, not used by current browse page) |
| `useDeviceCalibrationParameter` | Detail by id |
| `useCreateDeviceCalibrationParameter` | POST + invalidate |
| `useUpdateDeviceCalibrationParameter` | PATCH + invalidate |
| `useReorderDeviceCalibrationCapabilities` | Optimistic capability reorder |
| `useReorderDeviceCalibrationParameters` | Optimistic parameter reorder |

Eager vs lazy expanded rows: **eager** — expanded content is already in the group payload; no per-expand fetch.

---

## 13. Query keys / cache invalidation

Constant: `DEVICE_CALIBRATION_PARAMETERS_QUERY_KEY = "device-calibration-parameters"`

Exact keys:

- `["device-calibration-parameters", "grouped", trimmedSearch, isActive, page, pageSize]`
- `["device-calibration-parameters", id]`
- Flat list key includes search, deviceTypeId, capabilityId, capabilityItemId, uomId, isActive, sortBy, sortDir, page, pageSize

Invalidation:

- Create/update/reorder settle: `invalidateQueries({ queryKey: ["device-calibration-parameters"] })`
- Create also `setQueryData([..., row.id], row)`
- Reorder: `cancelQueries` + `setQueriesData` on `["device-calibration-parameters","grouped"]`, rollback on error

`placeholderData: (previous) => previous` on list/grouped. No custom `staleTime`.

---

## 14. Permission / RBAC

| Action | Backend | Capability flag | UI gate |
|---|---|---|---|
| View | `@RequirePermission("deviceCalibrationParameter","read")` | `deviceCalibrationParameterRead` | `AccessDenied` on list/detail |
| Create | `... create` | `deviceCalibrationParameterCreate` | Header button + “Tambah parameter” + `/new` page |
| Edit | `... update` | `deviceCalibrationParameterUpdate` | Detail Edit button; submit early-return |
| Reorder | `... update` | same Update | Drag handles when `canReorder` |
| Delete | `... delete` | `deviceCalibrationParameterDelete` | Not used in Portal UI |

Seeded for ADMIN in `packages/db/prisma/seed-role-permissions.ts`.  
Exposed on `/me` via `apps/api/src/modules/me/me.controller.ts` → `packages/auth/src/me-types.ts`.

**Physical Inspection note**

- Existing: `calibrationJob` / `recordPhysicalCheck` → flag `calibrationJobRecordPhysicalCheck` (TECHNICIAN execution only).
- That permission must **not** gate Portal master management.
- Portal master needs a **separate** management resource (pattern like `deviceCalibrationParameter` CRUD), which does **not** exist yet for `DevicePhysicalCheckItem`.

---

## 15. Validation / Zod

Shared (`packages/shared/src/schemas/index.ts`):

- `deviceCalibrationParameterCreateSchema` — deviceTypeId, capabilityItemId, name, uomId, optional tolerance/decimal/description; no `code`
- `deviceCalibrationParameterUpdateSchema` — partial + optional `isActive`
- `deviceCalibrationParameterListQuerySchema` / `GroupedQuerySchema`
- Order schemas: full id arrays

Client helpers in `device-calibration-parameter-form-fields.tsx`:

- `validateCalibrationToleranceForm`
- `buildDeviceCalibrationParameterCreatePayload` / `UpdatePayload`
- `formatDeviceCalibrationParameterApiError` (maps API `code`s)

---

## 16. Loading / error / empty states

| State | Pattern |
|---|---|
| Page loading | `<p>Memuat…</p>` |
| Suspense fallback | same |
| Fetching (background) | Surface `opacity-70` |
| Empty (no data) | `DeviceCalibrationParameterEmptyState` |
| Empty (search/filter) | different copy + “Reset pencarian” |
| API error | red text: “Gagal memuat daftar Calibration Parameter.” |
| Permission denied | `AccessDenied` (capability or `isForbidden(query.error)`) |
| Detail 404 | dedicated PageHeader + message |
| Validation error | red text above form |
| Mutation error | mapped API message |
| Reorder error | fixed Indonesian rollback message |
| Success | emerald inline text (no toast) |
| Expanded-row loading | **N/A** (eager data) |

---

## 17. URL / query-param behavior

| Param | Mechanism | Effect |
|---|---|---|
| `search` | `useUrlQueryState` | Server filter |
| `isActive` | `useUrlQueryState` | Server filter |
| `page` | `useUrlQueryState` | DeviceType pagination |
| `pageSize` | `useUrlQueryState` | Default 10 omitted from URL |
| `expanded` | `history.replaceState` + one-time seed | View-only expand IDs (comma-separated DeviceType ids) |
| `deviceTypeId` | only on `/new` | Prefill create form |

No modal routes. Official expand behavior: **yes**, `?expanded=` is intentional and documented in code comments.

---

## 18. UI component / design-system reuse

Reusable / shared pieces used by this page:

- `PageHeader` (title + breadcrumb)
- `Surface`, `PaginationBar`, `selectClassName` (re-exported from leads UI patterns)
- `Button`, `Input`, `Badge`
- Lucide: `Plus`, `Search`, `ChevronDown`/`ChevronRight`, `GripVertical`, `Save`, `Check`, `ChevronsUpDown`
- `CommandPopover` / `CommandItem` on forms
- `ViewAdjustedBanner` for pagination clamp
- `AccessDenied`
- Table: bordered slate, uppercase header tracking, expandable parent row
- Form layout classes: `deviceCalibrationParameterFormPageClass` (max-w ~1000px), surface, actions border-t

No toast system on this feature. No drawer/modal.

---

## 19. Calibration Parameter → Physical Inspection mapping table

| Calibration Parameter Pattern | Physical Inspection Candidate | Classification |
|---|---|---|
| Device Name grouping by `deviceType.id` | DeviceType grouping | **SAFE TO REUSE** |
| Expand/collapse + `?expanded=` | Expand/collapse | **REUSE PATTERN BUT DIFFERENT DOMAIN LOGIC** (choose URL strategy) |
| Search debounce + URL sync | Search name/code/inspectionLimit | **SAFE TO REUSE** (fields differ) |
| Status `isActive` filter | `isActive` filter | **SAFE TO REUSE** |
| Parameter list under group | Flat `DevicePhysicalCheckItem` list | **REUSE UI ONLY** (no Capability layer) |
| Capability section headers / reorder | — | **DO NOT REUSE** |
| Add via `/new` full page | Add master item | **SAFE TO REUSE** |
| Edit via `/[id]` full page | Edit master item | **SAFE TO REUSE** |
| Status badge Aktif/Nonaktif | `isActive` | **SAFE TO REUSE** |
| Parameter `sortOrder` DnD + optimistic | Item `sortOrder` per DeviceType | **REUSE PATTERN BUT DIFFERENT DOMAIN LOGIC** |
| Capability order API / `DeviceTypeCapabilityOrder` | — | **DO NOT REUSE** |
| UOM / Decimal / Tolerance columns & fields | — | **DO NOT REUSE** |
| React Query key + invalidate prefix | New query key namespace | **SAFE TO REUSE** |
| RBAC resource CRUD flags + `useAuthz` | New management resource (TBD) | **REUSE PATTERN BUT DIFFERENT DOMAIN LOGIC** |
| `calibrationJobRecordPhysicalCheck` | Tech result recording only | **DO NOT REUSE** |
| Portal managing `PhysicalCheckResult` | — | **DO NOT REUSE** |
| PageHeader / Surface / table chrome | Same Portal look | **SAFE TO REUSE** |
| Inline success/error (no toast) | Same feedback style | **SAFE TO REUSE** |
| Hard DELETE exposed in UI | Prefer deactivate like CP | **REUSE PATTERN BUT DIFFERENT DOMAIN LOGIC** |

**Closer sibling for flat children:** Equipment Requirements (`apps/portal/src/app/management/equipment-requirements/`) — DeviceType groups with item reorder and no Capability hierarchy.

---

## 20. Concepts that MUST NOT be reused

Verified from schema, service, and Portal UI — do **not** carry into Physical Inspection Portal master:

| Concept | Why |
|---|---|
| Capability / CapabilityItem grouping | PI catalog is flat under DeviceType (`DevicePhysicalCheckItem` has no capability FK) |
| `DeviceTypeCapabilityOrder` | CP-only ordering of shared capabilities |
| UOM | Not on `DevicePhysicalCheckItem` |
| Decimal places | Measurement NUMBER formatting only |
| Tolerance min/max/note | Measurement acceptance bounds; PI uses prose `inspectionLimit` |
| `valueType` / `entryStyle` | Calibration parameter entry models |
| `CalibrationTestPoint` | Measurement grid children |
| Replicate / direction | MeasurementResult natural key |
| `MeasurementResult` / `isWithinTolerance` | Separate measurement domain |
| Wiring into `DeviceCalibrationParameter` APIs/models | Explicitly forbidden by domain separation |
| Managing `PhysicalCheckResult` in Portal master UI | Results are job/attempt technician artifacts |
| Using `calibrationJobRecordPhysicalCheck` for master CRUD | Execution permission, not Device Management master |

---

## 21. Recommended Physical Inspection Portal implementation pattern

1. **Browse page** mirror CP structure: DeviceType parent rows → expand → **flat** item rows showing `name`, `code`, `inspectionLimit`, status (`isActive`), Edit; optional drag handle for `sortOrder`.
2. **CRUD** as full-page create/edit (or a deliberate simpler inline/panel pattern like Equipment Requirements — but still not modal-by-default unless product asks). Prefer CP full-page for consistency with other Device Management masters that edit rich fields.
3. **Reorder** one level only: full ordered id list per `deviceTypeId`, optimistic React Query, rollback message — **do not** invent Capability sections.
4. **Active/inactive** soft-toggle on edit; keep inactive visible in master list with filter; Tech job catalog continues to use `isActive: true` only.
5. **Permissions**: new management resource (e.g. patterned after `deviceCalibrationParameter` read/create/update/delete) — never reuse Tech `recordPhysicalCheck`.
6. **Prerequisites before Portal UI:** master API module + Zod schemas + me capability flags + role seed + menu entry under Device Management.
7. **Do not** change Prisma fields of `DevicePhysicalCheckItem` / `PhysicalCheckResult` for this UI work unless a separate backend task requires it.

---

## 22. Expected files likely to change (future implementation — not this audit)

When implementing (separate task):

**Portal (new)**

- `apps/portal/src/app/management/device-physical-check-items/` (or agreed route name)
  - `page.tsx`, `*-page-client.tsx`, `*-ui.tsx`, `use-*-query.ts`, `new/page.tsx`, `[id]/page.tsx`, ordering helper/tests

**API (new)**

- `apps/api/src/modules/device-physical-check-items/` controller/service/module

**Shared / auth / seeds**

- Zod schemas in `packages/shared`
- `me-types.ts` + `me.controller.ts` capability flags
- `seed-role-permissions.ts`, `seed-menu.ts`

**Must not change for pattern mirror**

- Existing Calibration Parameters Portal/API
- Tech PWA physical-check result UI/routes (except if master code/name display needs read-only updates later)
- Wiring PI master into `DeviceCalibrationParameter`

---

## 23. Risks / gaps

1. **No master CRUD API** for `DevicePhysicalCheckItem` today — only job-scoped `GET /calibration-jobs/:id/physical-check-items` (active items for a job’s DeviceType).
2. **No management RBAC resource** for PI master (`devicePhysicalCheckItem` read/create/update/delete not seeded).
3. **No Device Management menu** entry for Physical Inspection.
4. Expand URL strategy inconsistent across siblings (CP `replaceState` vs Equipment Requirements `useUrlQueryState`) — need an explicit choice.
5. List “Edit” link in CP is not Update-gated (detail is) — decide whether PI should be stricter.
6. Grouped CP loads all matching parameters then paginates DeviceTypes in memory — fine for master volumes; watch scale.
7. CP auto-issues `code` via MasterCodeService; PI `code` is unique per DeviceType — auto vs manual code policy still a product/backend decision outside this UI pattern audit.
8. Equipment Requirements may be a better structural twin for flat children; CP remains the requested visual/UX reference for Device Management grouping.

---

## 24. Final Verdict

**READY WITH GAPS**

The existing Calibration Parameters Portal implementation provides a sufficiently clear pattern for:

- DeviceType grouping  
- expand/collapse  
- search/filter  
- CRUD full-page lifecycle  
- ordering UI/optimistic cache  
- active/inactive  
- RBAC capability shape  
- React Query keys/invalidation  
- Portal UI structure/chrome  

Gaps that block “start Portal UI only” without prior work:

- master API for `DevicePhysicalCheckItem`  
- management permissions + `/me` flags  
- menu entry  

Physical Inspection must mirror the **shell and interaction pattern**, not the Capability / UOM / tolerance / measurement domain model, and must not manage `PhysicalCheckResult` in this Portal master surface.
