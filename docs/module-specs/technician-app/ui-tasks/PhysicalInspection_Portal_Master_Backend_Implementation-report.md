# Physical Inspection Portal Master Backend — Implementation Report

**Date:** 2026-09-10  
**Scope:** Backend + shared Zod + RBAC + `/me` + role/menu seeds + tests  
**Portal UI:** not implemented (next task)

---

## A. Status

**PASS WITH NOTES**

Master API, Zod, RBAC, `/me` flags, additive seeds, and tests are in place. No Prisma migration. No seed executed by the implementer (test harness `prepare-test-db` upserts role/menu fixtures as usual). Notes below cover code-generation strategy and one adjacent menu `order` shift.

---

## B. Files created / changed

### Created

| Path |
|---|
| `apps/api/src/modules/device-physical-check-items/device-physical-check-items.controller.ts` |
| `apps/api/src/modules/device-physical-check-items/device-physical-check-items.service.ts` |
| `apps/api/src/modules/device-physical-check-items/device-physical-check-items.module.ts` |
| `apps/api/src/modules/device-physical-check-items/device-physical-check-items.service.test.ts` |
| `docs/claude/plans/technician-app/ui-tasks/PhysicalInspection_Portal_Master_Backend_Implementation-report.md` |

### Changed

| Path | Change |
|---|---|
| `packages/shared/src/schemas/index.ts` | DevicePhysicalCheckItem Zod schemas/types |
| `packages/auth/src/access-control.ts` | Resource `devicePhysicalCheckItem` catalog |
| `packages/auth/src/me-types.ts` | Four `/me` capability flags |
| `packages/auth/src/access-control.test.ts` | Fixture grants + permission tests |
| `packages/auth/src/auth-provider.test.tsx` | Capability fixture fields |
| `apps/api/src/modules/me/me.controller.ts` | Expose new capabilities |
| `apps/api/src/app.module.ts` | Register `DevicePhysicalCheckItemsModule` |
| `packages/db/prisma/seed-role-permissions.ts` | ADMIN CRUD grants (additive) |
| `packages/db/prisma/seed-menu.ts` | Physical Inspection leaf + Reference Equipment `order` 5→6 |

### Not changed

- Prisma schema / migrations  
- `DeviceCalibrationParameter*` implementation  
- Tech-PWA / `PhysicalCheckResultsService` job endpoints  
- `seed-physical-check-items.ts` dataset  
- Portal UI routes/components  

---

## C. Existing patterns inspected

- `device-calibration-parameters` controller/service/module/tests  
- `device-type-equipment-requirements` (flat DeviceType → items reorder)  
- `packages/shared` Zod for CP + equipment requirements  
- `packages/auth` access-control + me-types  
- `me.controller.ts` capability mapping  
- `seed-role-permissions.ts`, `seed-menu.ts`  
- `MasterCodeService` / `master-code-config.ts`  
- Seeded Physical Inspection codes (`*_PHYSICAL_NNN`)  
- `DevicePhysicalCheckItem` / `PhysicalCheckResult` Prisma models  

---

## D. Exact patterns reused

| Pattern | Source |
|---|---|
| Dedicated Nest module + CompanyRoleGuard + `@RequirePermission` | CP |
| Zod `safeParse` → BadRequestException + stable `code` | CP |
| Grouped list: fetch matching rows → group by DeviceType → paginate groups | CP / equipment-requirements |
| Category name enrichment for page slice | CP |
| Soft `isActive` + hard DELETE API | CP |
| Delete blocked when transactional FK references exist | devices / equipment (`*_IN_USE`) |
| One-level reorder, full id-set, multiples of 10, mismatch reject | equipment-requirements |
| ADMIN-only master CRUD in role seed | CP |
| Menu leaf under Device Management with `viewResource` / `viewAction: read` | CP |
| `/me` camelCase capability flags | CP |

---

## E. API endpoints created

Base: `/device-physical-check-items`

| Method | Path | Permission |
|---|---|---|
| GET | `/grouped` | `devicePhysicalCheckItem:read` |
| GET | `/` | `devicePhysicalCheckItem:read` (flat list, optional) |
| GET | `/:id` | `devicePhysicalCheckItem:read` |
| POST | `/` | `devicePhysicalCheckItem:create` |
| PATCH | `/:id` | `devicePhysicalCheckItem:update` |
| DELETE | `/:id` | `devicePhysicalCheckItem:delete` |
| PATCH | `/device-types/:deviceTypeId/item-order` | `devicePhysicalCheckItem:update` |

No `PhysicalCheckResult` endpoints. Job-scoped Tech API unchanged:

`GET /calibration-jobs/:id/physical-check-items`

---

## F. Request / response contracts

### Grouped response

```ts
{
  data: Array<{
    deviceType: { id, code, name };
    categoryName: string | null;
    count: number;
    items: DevicePhysicalCheckItemWithRelations[]; // includes deviceType
  }>;
  page, pageSize, total, totalPages;
  totalItems, totalDeviceTypes;
}
```

Items ordered by `sortOrder` asc, then `name`. **No Capability nesting.**

### Create body

`{ deviceTypeId, name, inspectionLimit, isActive? }` — no `code`, no `sortOrder`.

### Update body

`{ name?, inspectionLimit?, isActive? }` — no `deviceTypeId`, no `code`.

### Reorder body

`{ itemIds: string[] }` — full set for that DeviceType.

---

## G. Zod schemas

In `packages/shared/src/schemas/index.ts`:

- `devicePhysicalCheckItemCreateSchema`
- `devicePhysicalCheckItemUpdateSchema`
- `devicePhysicalCheckItemListQuerySchema`
- `devicePhysicalCheckItemGroupedQuerySchema`
- `devicePhysicalCheckItemOrderSchema`
- `DEVICE_PHYSICAL_CHECK_ITEM_SORTABLE_FIELDS`

---

## H. RBAC resource / actions

Resource: **`devicePhysicalCheckItem`**  
Actions: **`read` | `create` | `update` | `delete`**

Registered in `packages/auth/src/access-control.ts` permission catalog.  
**Not** reusing `calibrationJob:recordPhysicalCheck`.

---

## I. `/me` capability flags

- `devicePhysicalCheckItemRead`
- `devicePhysicalCheckItemCreate`
- `devicePhysicalCheckItemUpdate`
- `devicePhysicalCheckItemDelete`

---

## J. Role permission seed changes

Additive ADMIN grants in `seed-role-permissions.ts` (idempotent upsert):

- `devicePhysicalCheckItem` × read/create/update/delete  

Existing grants unchanged. Seed **not** executed by this task author; test DB prepare may upsert fixtures.

---

## K. Menu seed changes

Added:

| Field | Value |
|---|---|
| code | `device-management.physical-inspection` |
| parent | `device-management` |
| label | `Physical Inspection` |
| href | `/device-physical-check-items` |
| icon | `clipboardList` (already in Portal icon map) |
| order | `5` |
| viewResource | `devicePhysicalCheckItem` |
| viewAction | `read` |

**Note:** Reference Equipment group `order` changed **5 → 6** so Physical Inspection sits after Calibration Parameters and before Reference Equipment. No other fields of that entry were changed (code/label/href/resource untouched).

---

## L. DeviceType grouping behavior

Server-side grouping key: `deviceType.id`.  
Pagination at DeviceType (parent) level.  
Eager item payload inside each group (no lazy expand fetch).

---

## M. Search / filter / pagination

Grouped query supports `search`, `isActive`, `page`, `pageSize`.

Search fields: item `code`/`name`/`inspectionLimit`, DeviceType `name`/`code`.  
**Not** capability / UOM / tolerance.

---

## N. CRUD behavior

- Create: asserts DeviceType exists; allocates code; appends `sortOrder`; default `isActive: true`.  
- Update: name / inspectionLimit / isActive only; DeviceType + code immutable.  
- Delete: hard delete if no `PhysicalCheckResult` rows; else `DEVICE_PHYSICAL_CHECK_ITEM_IN_USE`.  
- Detail: `GET /:id` with DeviceType relation.

---

## O. isActive behavior

- Create default `true`.  
- Update may set `false`.  
- Grouped/list filters honor `isActive`.  
- Tech job catalog still filters `isActive: true` (untouched).

---

## P. Ordering behavior

Single level: within DeviceType.  
Full `itemIds` set required; mismatch → `DEVICE_PHYSICAL_CHECK_ITEM_ORDER_MISMATCH`.  
Persisted as multiples of 10.  
No Capability order / `DeviceTypeCapabilityOrder`.

---

## Q. Code-generation strategy

**Not** `MasterCodeService` (`DCP-0001` style).

**Reason:** Existing 246 seeded rows use deterministic  
`<DEVICE_TYPE_CODE>_PHYSICAL_NNN`.  
Uniqueness is `@@unique([deviceTypeId, code])`.

**Implemented:** on create, allocate next  
`${deviceType.code}_PHYSICAL_${NNN}` (3-digit, max existing matching suffix + 1).  
Does not rename or rewrite seeded codes.

---

## R. Error codes

| Code | When |
|---|---|
| `INVALID_DEVICE_PHYSICAL_CHECK_ITEM` | Create Zod fail |
| `INVALID_DEVICE_PHYSICAL_CHECK_ITEM_UPDATE` | Update Zod fail |
| `INVALID_DEVICE_PHYSICAL_CHECK_ITEM_QUERY` | List/grouped Zod fail |
| `INVALID_DEVICE_PHYSICAL_CHECK_ITEM_ORDER` | Reorder Zod fail |
| `DEVICE_TYPE_NOT_FOUND` | Missing DeviceType |
| `DEVICE_PHYSICAL_CHECK_ITEM_NOT_FOUND` | Missing id |
| `DUPLICATE_DEVICE_PHYSICAL_CHECK_ITEM_CODE` | Unique conflict |
| `DEVICE_PHYSICAL_CHECK_ITEM_ORDER_MISMATCH` | Reorder set mismatch |
| `DEVICE_PHYSICAL_CHECK_ITEM_IN_USE` | Delete blocked by results |

---

## S. Tests + results

| Suite | Result |
|---|---|
| `device-physical-check-items.service.test.ts` + `device-calibration-parameters.service.test.ts` | **36 passed** |
| `packages/auth` `access-control.test.ts` | **44 passed** |
| Tech physical-check-results regression | run requested (see W) |

Coverage includes: schema, create, missing DeviceType, grouped search/filter/pagination, detail, update immutability, deactivate, reorder + mismatch, hard delete, optional IN_USE when a job exists, seeded-row compatibility when present.

---

## T. Typecheck + results

| Package | Result |
|---|---|
| `@medcal/shared` | pass (`tsc --noEmit`) |
| `@medcal/auth` | pass |
| `@medcal/api` | pass |

---

## U. Migration status

**NO PRISMA MIGRATION** — reused existing `DevicePhysicalCheckItem` model.

---

## V. Seed execution status

- Author did **not** run `seed-role-permissions`, `seed-menu`, or `seed-physical-check-items`.  
- Vitest `prepare-test-db` upserted role/menu fixtures in `pkmdb_test` as part of normal pretest (observed: RolePermission + Menu upsert logs).  
- Physical Inspection master dataset **not** regenerated.

---

## W. Regression results

- Calibration Parameters service tests: **pass** (bundled run, 36 tests with PI suite).  
- Auth access-control: **44 passed**.  
- Tech `physical-check-results.service.test.ts`: **38 passed** — job-scoped Physical Inspection API unchanged.

---

## X. Deviations from specification

1. **Code policy:** used seed-compatible `${deviceType.code}_PHYSICAL_NNN` instead of adding a new `MasterCodeService` entity — documented in Q.  
2. **Menu order:** Reference Equipment group `order` bumped 5→6 for recommended placement (adjacent order only).  
3. **Flat GET `/`:** also implemented (useful parity with CP; not required for browse UI).  
4. **IN_USE delete test:** attaches a `PhysicalCheckResult` to an existing `CalibrationJob` when one is present; soft-returns if the test DB has no jobs (guard still implemented in service).

---

## Y. Remaining gaps (next task)

- Portal UI under `/device-physical-check-items` (list/grouped, CRUD forms, DnD, React Query).  
- Running production/dev `seed:role-permissions` + `seed:menu` so ADMIN grants and menu appear outside test DB.  
- Optional: Portal nav icon typing if any static allow-list excludes `clipboardList` for this leaf (icon already mapped in `icons.tsx`).

---

## Final checklist (success criteria)

| Criterion | Status |
|---|---|
| Dedicated master API | ✓ |
| Reuse existing model | ✓ |
| No unnecessary migration | ✓ |
| CRUD / grouped / search / filter / pagination | ✓ |
| One-level sortOrder reorder | ✓ |
| isActive | ✓ |
| No Capability hierarchy | ✓ |
| No PhysicalCheckResult management API | ✓ |
| New RBAC resource (not Tech execution perm) | ✓ |
| `/me` flags | ✓ |
| Additive role + menu seeds | ✓ |
| Sibling of Calibration Parameters | ✓ |
| CP behavior unchanged | ✓ |
| No Portal UI | ✓ |
| No seed of 246 PI rows | ✓ |
| Typechecks pass | ✓ |
| Service/auth tests pass | ✓ |
