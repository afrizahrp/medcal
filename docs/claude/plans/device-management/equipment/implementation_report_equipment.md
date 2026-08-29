# Implementation Report — Equipment Type & Device Type Equipment Requirement (Phase 1)

**Date:** 2026-08-29
**Author:** afriza.hrp@gmail.com (via Claude Code)
**Source brief:** `docs/claude/plans/device-management/equipment/prompt1-Equipment Type & Device Type Eq.md`
**Audit:** `docs/claude/plans/device-management/equipment/implementation_report_equipment_audit.md`
**Status:** ✅ IMPLEMENTED & VERIFIED against the local dev DB (`localhost:5432/pkmdb`).

## Terminology (used consistently below)

| Term | Meaning | Implemented here? |
|---|---|---|
| **Equipment Type** | The catalog *type/category* of a calibration tool (e.g. "Electrical Safety Analyzer"). No serial number. | ✅ `EquipmentType` |
| **Required Equipment** | "Calibrating this Device Type normally requires this Equipment Type." Master configuration. | ✅ `DeviceTypeEquipmentRequirement` |
| **Physical Equipment** | A specific physical unit (brand/model/serial). | ❌ Phase 2 — not implemented |
| **Actually Used Equipment** | The reference unit recorded on a CalibrationJob's LK. | ❌ (`JobReferenceEquipmentUsed` untouched — Phase 2 link deferred) |

---

## 1. Final schema

`packages/db/prisma/schema.prisma` — two new models, one new back-relation on `DeviceType`. Nothing else changed.

```prisma
model EquipmentType {
  id          String   @id @default(cuid())
  code        String   @unique
  name        String
  description String?
  category    String?          // free-text grouping hint — nullable string, NOT an enum
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deviceRequirements DeviceTypeEquipmentRequirement[]
  @@index([isActive])
}

model DeviceTypeEquipmentRequirement {
  id              String   @id @default(cuid())
  deviceTypeId    String
  equipmentTypeId String
  notes           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deviceType    DeviceType    @relation(fields: [deviceTypeId], references: [id])
  equipmentType EquipmentType @relation(fields: [equipmentTypeId], references: [id])
  @@unique([deviceTypeId, equipmentTypeId])
  @@index([deviceTypeId])
  @@index([equipmentTypeId])
}

// DeviceType gains:  equipmentRequirements DeviceTypeEquipmentRequirement[]
```

**Deliberately absent from `EquipmentType`** (per brief): `serialNumber`, `assetTag`,
`calibrationDueDate`, unit `status`, `location`, ownership. **Absent from the requirement**:
quantity, mandatory/optional flag, priority, lifecycle. Convention matches `Uom` /
`DeviceCapability` / `DeviceCategory` (global master, `code @unique`, `isActive`, admin CRUD).

## 2. Migration

`packages/db/prisma/migrations/20260829030000_add_equipment_type_and_device_type_equipment_requirement/migration.sql`

- `CREATE TABLE "EquipmentType"` + `CREATE TABLE "DeviceTypeEquipmentRequirement"`
- Indexes: `EquipmentType_code_key` (unique), `EquipmentType_isActive_idx`,
  `DeviceTypeEquipmentRequirement_deviceTypeId_idx`,
  `DeviceTypeEquipmentRequirement_equipmentTypeId_idx`,
  `DeviceTypeEquipmentRequirement_deviceTypeId_equipmentTypeId_key` (unique).
- Two FKs to `DeviceType` / `EquipmentType`, `ON DELETE RESTRICT ON UPDATE CASCADE`
  (matches `DeviceCalibrationParameter`'s FK convention).
- **Purely additive** — no existing table or column touched, no data modified, no destructive statement.

Applied to local dev DB via `prisma migrate deploy` (42 → 43 migrations, all applied).
`prisma generate` regenerated the client (the Windows engine-binary rename hit a benign
`EPERM` from a running dev process; the generated TS client — delegates + `GetPayload`
types — was written and verified). Production applies it later via `prisma migrate deploy`
in the existing Docker Compose flow.

## 3. API

New module `apps/api/src/modules/equipment/` (registered in `app.module.ts`):

### `EquipmentType` — `/equipment-types` (resource `equipmentType`)
| Method | Route | Permission | Notes |
|---|---|---|---|
| POST | `/equipment-types` | `equipmentType:create` | duplicate `code` → `409 DUPLICATE_EQUIPMENT_TYPE_CODE` |
| GET | `/equipment-types` | `equipmentType:read` | `search` (code/name/category), `isActive`, `sortBy` ∈ {createdAt,code,name}, `page`/`pageSize` — standard MEDCAL list response |
| GET | `/equipment-types/:id` | `equipmentType:read` | `404 EQUIPMENT_TYPE_NOT_FOUND` |
| PATCH | `/equipment-types/:id` | `equipmentType:update` | code/name/description/category/isActive |
| DELETE | `/equipment-types/:id` | `equipmentType:delete` | blocked with `400 EQUIPMENT_TYPE_HAS_REQUIREMENTS` while any requirement references it |

### `DeviceTypeEquipmentRequirement` — `/device-type-equipment-requirements` (resource `equipmentRequirement`)
| Method | Route | Permission | Notes |
|---|---|---|---|
| GET | `/device-type-equipment-requirements/grouped` | `equipmentRequirement:read` | `{ data: [{ deviceType, categoryName, count, requirements[] }], page, pageSize, total, totalPages, totalRequirements, totalDeviceTypes }` — **paginated at the Device-Type group level**, a Device Type and all its requirements always stay on one page (same approach as the calibration-parameter grouped endpoint) |
| GET | `/device-type-equipment-requirements` | `equipmentRequirement:read` | flat list, optional `deviceTypeId` / `equipmentTypeId` filter |
| POST | `/device-type-equipment-requirements` | `equipmentRequirement:create` | validates both FKs exist (`400 DEVICE_TYPE_NOT_FOUND` / `EQUIPMENT_TYPE_NOT_FOUND`); duplicate `(deviceTypeId, equipmentTypeId)` → `409 DUPLICATE_EQUIPMENT_REQUIREMENT` (DB unique + service guard) |
| PATCH | `/device-type-equipment-requirements/:id` | `equipmentRequirement:update` | `notes` only |
| DELETE | `/device-type-equipment-requirements/:id` | `equipmentRequirement:delete` | remove a requirement |

Controllers `safeParse` Zod schemas from `@medcal/shared` and use
`@RequirePermission` + `CompanyRoleGuard` — identical to every other master-data module.

**Deriving the required list** (documented, not built as a copy): given a `CalibrationJob`,
its required equipment = `deviceTypeEquipmentRequirement WHERE deviceTypeId = job.device.deviceTypeId`.
No snapshot on `WorkOrder` / `CalibrationJob`, no `WorkOrderEquipment` table (Phase 2).

### Permissions & bootstrap
- `packages/auth/src/access-control.ts`: added resources `equipmentType` and
  `equipmentRequirement`, each `["read","create","update","delete"]`.
- `packages/db/prisma/seed-role-permissions.ts`: ADMIN granted all 8 new actions
  (SUPERADMIN bypasses). Re-seeded → 97 rows.
- `apps/api/src/modules/me/me.controller.ts` + `packages/auth/src/me-types.ts`: 8 new
  `equipmentType*` / `equipmentRequirement*` capability flags on `GET /me`.
- `packages/db/prisma/seed-menu.ts`: two MANAGEMENT leaves under the existing
  **Device Management** group — `Equipment Types` (`/equipment-types`, order 6) and
  `Equipment Requirements` (`/equipment-requirements`, order 7). Re-seeded → 29 rows.

## 4. UI

All portal screens reuse existing design-system primitives (`Surface`, `PageHeader`,
`Input`, `Button`, `Badge`, `PaginationBar`, `selectClassName`, lucide icons) — no new
CRUD architecture, no new pagination mechanism.

### `apps/portal/src/app/management/equipment-types/` — Equipment Type master
Mirrors the Device Category screens exactly:
- `page.tsx` / `equipment-types-page-client.tsx` — list: search box (code/name/category) +
  flat table (Kode, Nama, Kategori, Deskripsi, Status, Edit) + `PaginationBar`.
- `equipment-type-form-fields.tsx` — Code, Name, **Category (nullable free-text)**,
  Description. Copy states plainly that Equipment Type is a *type*, not a physical unit.
- `new/page.tsx` — create. `[id]/page.tsx` — view / edit / activate-deactivate / delete,
  with the standard `confirm()` dialog and mapped error copy
  (`EQUIPMENT_TYPE_HAS_REQUIREMENTS` → friendly message).
- `use-equipment-types-query.ts` — TanStack Query hooks (list/one/create/update/delete).

### `apps/portal/src/app/management/equipment-requirements/` — Device Type → Required Equipment
Mirrors the Device Calibration Parameters **Expandable / Collapsible Table Grouped by
Device Type** (real `<table>`, one `<tbody>` per Device Type — not a card accordion):
- Parent row: `Device Type | Kategori | N equipment`, chevron toggles expand/collapse.
  **Only Device Type is expandable — one level, no nested Capability/Equipment tree.**
- Child rows: `Equipment Type | Catatan | Hapus`.
- Per-group inline **add row** (visible with `equipmentRequirement:create`): a select of
  active Equipment Types *not already required for that Device Type* + a notes input + Add.
- Top-of-page **"Tambah kebutuhan"** panel (Device Type picker + Equipment Type picker +
  notes) to add the first requirement for a Device Type that has none yet — such Device
  Types don't appear in the grouped list until they have ≥1 requirement.
- `use-equipment-requirements-query.ts` — grouped query, active-equipment-type options
  query, create/delete mutations. Device-type options reuse the existing
  `useDeviceTypes` hook.

## 5. Pagination

Reuses `PaginationBar` (from `leads-ui`) unchanged on both screens — same page-size
selector, "Halaman X dari Y · Total: N …" line, Sebelumnya/Berikutnya, `page`/`pageSize`
URL-query conventions, default page size 10.

- **Equipment Types**: standard row-level pagination.
- **Equipment Requirements**: pagination at the **Device-Type (parent-row) level** — the
  service loads all matching requirements, groups by Device Type, then slices the *groups*.
  A Device Type and all its requirement rows always stay together on one page; children are
  never split. `total`/`totalPages` are group counts; a secondary line shows
  `{totalDeviceTypes} device type dengan {totalRequirements} kebutuhan equipment`.

## 6. Search

- **Equipment Types**: `search` matches `code` / `name` / `category` (`contains`,
  case-insensitive), server-side.
- **Equipment Requirements grouped**: `search` matches requirement `notes`, `deviceType`
  name/code, and `equipmentType` name/code/category. When a search is active, every Device
  Type on the (already-filtered) page is **auto-expanded** so matches are visible without a
  manual click — same behaviour as the calibration-parameter screen. URL state:
  `search`, `expanded`, `page`, `pageSize`.

## 7. CRUD

- Create Equipment Type ✅ · Edit Equipment Type ✅ · Activate/deactivate ✅ (edit form
  status select, same as Device Category) · Delete Equipment Type ✅ (blocked while
  required by any Device Type).
- Add requirement (EquipmentType → DeviceType) ✅ · Remove requirement ✅ · Edit notes ✅
  (API `PATCH`; UI currently exposes add/remove — notes are set at add time).
- Duplicate prevention: DB `@@unique([deviceTypeId, equipmentTypeId])` **and** a service
  pre-check returning `409 DUPLICATE_EQUIPMENT_REQUIREMENT`.

## 8. Tests

`apps/api/src/modules/equipment/*.service.test.ts` (hit the real local Postgres, same as
the other master-data module tests):

- `equipment-types.service.test.ts` (5 tests): create w/ category, duplicate-code reject,
  list/read/update/delete round-trip, unknown-id rejects, **delete blocked while a
  requirement references it**.
- `device-type-equipment-requirements.service.test.ts` (4 tests): create + duplicate
  `(deviceTypeId, equipmentTypeId)` reject, unknown device/equipment type reject, notes
  update + remove, **grouped-by-Device-Type with group-level counts**.

Results (with `DATABASE_URL` set to local `pkmdb`):

| Suite | Result |
|---|---|
| `src/modules/equipment` | ✅ 2 files, **9/9 pass** |
| `src/modules/me` `src/modules/equipment` `src/modules/device-categories` `src/modules/device-calibration-parameters` | ✅ 6 files, **63/63 pass** (no regression) |
| `src/modules/permissions` `src/modules/menu` | ✅ **29/29 pass** (access-control catalog change safe) |
| `@medcal/shared` | ✅ 21/21 |
| `@medcal/auth` | ✅ 47/47 |

## 9. Build / typecheck

| Check | Result |
|---|---|
| `pnpm --filter @medcal/shared typecheck` | ✅ |
| `pnpm --filter @medcal/auth typecheck` | ✅ |
| `pnpm --filter @medcal/api typecheck` | ✅ |
| `pnpm --filter @medcal/portal typecheck` | ✅ |
| `pnpm --filter @medcal/api build` (`tsc`) | ✅ |
| `pnpm --filter @medcal/portal build` (Next.js) | ✅ Compiled successfully — `/management/equipment-types`, `/management/equipment-types/[id]`, `/management/equipment-types/new`, `/management/equipment-requirements` all render |
| `prisma migrate deploy` on local `pkmdb` | ✅ applied; `EquipmentType` + `DeviceTypeEquipmentRequirement` tables created, empty; no existing table touched |
| `seed:role-permissions` / `seed:menu` re-run | ✅ 97 / 29 rows upserted |

## 10. Files changed

```
packages/db/prisma/schema.prisma                                              +~45  EquipmentType, DeviceTypeEquipmentRequirement, DeviceType back-relation
packages/db/prisma/migrations/20260829030000_.../migration.sql                NEW   2 CREATE TABLE + indexes + 2 FKs (additive only)
packages/db/prisma/seed-role-permissions.ts                                   +8    ADMIN grants for equipmentType/equipmentRequirement
packages/db/prisma/seed-menu.ts                                               +22   2 Device Management leaves
packages/shared/src/schemas/index.ts                                          +75   equipmentType* + deviceTypeEquipmentRequirement* Zod schemas/types + SORTABLE_FIELDS + grouped query
packages/auth/src/access-control.ts                                           +5    2 new resources in the catalog
packages/auth/src/me-types.ts                                                 +8    8 capability flags
apps/api/src/app.module.ts                                                    +2    import + register EquipmentModule
apps/api/src/modules/me/me.controller.ts                                      +8    8 hasPermission() capability lines
apps/api/src/modules/equipment/equipment-types.service.ts                     NEW
apps/api/src/modules/equipment/equipment-types.controller.ts                  NEW
apps/api/src/modules/equipment/device-type-equipment-requirements.service.ts  NEW
apps/api/src/modules/equipment/device-type-equipment-requirements.controller.ts NEW
apps/api/src/modules/equipment/equipment.module.ts                            NEW
apps/api/src/modules/equipment/equipment-types.service.test.ts                NEW   5 tests
apps/api/src/modules/equipment/device-type-equipment-requirements.service.test.ts NEW  4 tests
apps/portal/src/app/management/equipment-types/                               NEW   page, page-client, ui, form-fields, query hook, new/page, [id]/page
apps/portal/src/app/management/equipment-requirements/                        NEW   page, page-client, ui, query hook
```

Not changed: `DeviceType`, `Device`, `DeviceCalibrationParameter`, `CalibrationJob`,
`JobReferenceEquipmentUsed`, `WorkOrder`, `WorkOrderAssignment` (only `DeviceType` gained a
back-relation field, no column). No seed data for `EquipmentType` (admin enters it).

## 11. Assumptions

1. `localhost:5432/pkmdb` is the local dev DB (confirmed in prior sessions).
2. `EquipmentType.category` stays a **nullable free-text string** — the audit's open
   question about a controlled vocabulary is unresolved, so no enum/taxonomy was invented.
3. A requirement is a plain relationship — **no** mandatory/optional, quantity, priority,
   or lifecycle (brief §10; none were needed to implement the feature).
4. Requirements are removed by requirement `id` (`DELETE /:id`); the grouped list only
   surfaces Device Types that already have ≥1 requirement, so the page also provides a
   top-level "Tambah kebutuhan" panel with a Device Type picker for the empty case.
5. `EquipmentType` is global (no `companyId`), like `Uom` — equipment kinds don't vary by
   company; physical instances (Phase 2) would be company-scoped.
6. `notes` is captured at add time; changing it is possible via the API `PATCH` but the UI
   currently exposes add/remove only (re-add to change). Can be surfaced later if needed.

## 12. Deferred Phase 2 items (explicitly NOT implemented)

- `Equipment` **physical instance** model (brand/model/serial/assetTag/status).
- `WorkOrderEquipment` / `EquipmentAssignment` — assigning a physical unit to a Work Order.
- `equipmentId` / `equipmentTypeId` on `JobReferenceEquipmentUsed` — linking "Actually Used
  Equipment" to the catalog (table left exactly as-is).
- `EquipmentCalibrationRecord` / calibration-validity tracking of reference equipment
  (the "was the equipment's calibration valid on the job date?" audit question).
- Conflict detection / scheduling / availability / resource allocation.
- Surat Jalan, inventory, stock, procurement, valuation, maintenance.
- Snapshotting the required list onto `WorkOrder` / `CalibrationJob` (it stays derived).
