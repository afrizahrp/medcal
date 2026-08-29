# Implementation Report — Phase 2A: Physical Equipment Master

**Date:** 2026-08-29
**Author:** afriza.hrp@gmail.com (via Claude Code)
**Source brief:** "MEDCAL — Phase 2A Implementation / Physical Equipment Master" (pasted task)
**Approved audit:** `docs/claude/plans/device-management/equipment/implementation_report_equipment_phase2a_audit.md`
**Status:** ✅ IMPLEMENTED & VERIFIED against the local dev DB (`localhost:5432/pkmdb`).

> **Phase 2A implements only the physical Equipment master.**
>
> **No calibration validity, EquipmentCalibrationRecord, WorkOrderEquipment, Technician App
> equipment assignment, Surat Jalan, inventory, or conflict detection was implemented.**

### Guardrail check — no conflict with the approved audit

The implemented `Equipment` model matches the audit's §20 "Phase 2A scope" exactly:
company-scoped, `code` as primary identity with `@@unique([companyId, code])`, nullable
non-unique `serialNumber`, `isActive` boolean, `notes?`, FK to `EquipmentType`
(`ON DELETE RESTRICT`), **no validity / calibration / certificate / ownership / location /
maintenance / inventory fields**. Nothing in this implementation contradicts the approved
architecture.

---

## 1. Final Equipment schema

`packages/db/prisma/schema.prisma` — one new model, two back-relations (`Company.equipment`,
`EquipmentType.equipment`). Nothing else changed.

```prisma
model Equipment {
  id              String   @id @default(cuid())
  companyId       String
  equipmentTypeId String
  code            String
  brand           String?
  model           String?
  serialNumber    String?
  isActive        Boolean  @default(true)
  notes           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  company       Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)
  equipmentType EquipmentType @relation(fields: [equipmentTypeId], references: [id])

  @@unique([companyId, code])
  @@index([companyId, isActive])
  @@index([companyId, serialNumber])
  @@index([equipmentTypeId])
}
```

Conventions followed (from `Device` + `EquipmentType`):
- `id` cuid, `createdAt`/`updatedAt` timestamps.
- `companyId` **required**; FK `ON DELETE Cascade` (matches `Device.company`).
- `equipmentTypeId` FK `ON DELETE RESTRICT ON UPDATE CASCADE` (matches
  `DeviceTypeEquipmentRequirement.equipmentType` / `Device.deviceType`).
- **Identity = `code`, unique per company** (`@@unique([companyId, code])`) — the audit's
  §7 recommendation. `code` is NOT global-unique (different companies may reuse a code).
- `serialNumber` **nullable and NOT unique** (matches `Device.serialNumber` — indexed
  `@@index([companyId, serialNumber])`, no unique constraint). No per-EquipmentType serial
  uniqueness was added (audit §7: only if business data requires it — it does not yet;
  flagged as an open question).
- `isActive` boolean — same lifecycle as `EquipmentType` / `Device` (audit §13).

**Deliberately absent:** `calibrationDueDate`, `calibrationDate`, `calibrationStatus`,
`certificateNumber`, `calibrationCertificate`, `calibrationProvider`, `ownership`,
`location`/`custodyUserId`, any maintenance or inventory field, `equipmentModelId`. Per
brief §2/§14/§16/§17 and audit §6.

## 2. Migration

`packages/db/prisma/migrations/20260829040000_add_equipment/migration.sql`

- `CREATE TABLE "Equipment"` (10 columns + PK).
- Indexes: `Equipment_companyId_isActive_idx`, `Equipment_companyId_serialNumber_idx`,
  `Equipment_equipmentTypeId_idx`, `Equipment_companyId_code_key` (unique).
- FKs: `Equipment_companyId_fkey` → `Company` (`ON DELETE CASCADE`),
  `Equipment_equipmentTypeId_fkey` → `EquipmentType` (`ON DELETE RESTRICT`).
- **Purely additive** — no existing table or column touched, no data modified, no
  destructive statement.

Environment verified as the confirmed **local dev DB** before applying
(`prisma migrate status` → `PostgreSQL database "pkmdb" … at "localhost:5432"`). Applied via
`prisma migrate deploy` (43 → 44 migrations). `prisma generate` regenerated the TS client
(the Windows engine-binary rename hit a benign `EPERM` from a running dev process — same
version, no functional impact; the generated client types — `EquipmentDelegate`,
`EquipmentGetPayload`, `EquipmentWhereInput`, etc. — were written and verified). Production
applies it later via `prisma migrate deploy` in the existing Docker Compose flow.

## 3. API / service

New files in `apps/api/src/modules/equipment/` (module already existed from Phase 1; the
`EquipmentController` / `EquipmentService` were added to it):

| Method | Route | Permission | Company scoping |
|---|---|---|---|
| POST | `/equipment` | `equipment:create` | `companyId` from `@CompanyId()` decorator, injected into `data` |
| GET | `/equipment` | `equipment:read` | `where: { companyId, ... }` — always |
| GET | `/equipment/:id` | `equipment:read` | `findFirst({ where: { id, companyId } })` → `404 EQUIPMENT_NOT_FOUND` if not in company |
| PATCH | `/equipment/:id` | `equipment:update` | `findOne(companyId, id)` first — cross-company update is a `404` |
| DELETE | `/equipment/:id` | `equipment:delete` | same — cross-company delete is a `404` |

- List query: `search`, `equipmentTypeId`, `isActive`, `sortBy` ∈ `{createdAt, code}`,
  `sortDir`, `page`, `pageSize` — standard MEDCAL list response
  `{ data, page, pageSize, total, totalPages }`.
- Response includes `equipmentType { id, code, name, category }` (relation, **not**
  denormalised onto `Equipment` — brief §11).
- `create` / `update` validate `equipmentTypeId` exists (`400 EQUIPMENT_TYPE_NOT_FOUND`)
  and `code` is unique within the company (`409 DUPLICATE_EQUIPMENT_CODE`, DB
  `@@unique` + service pre-check).
- String fields trimmed; empty strings coerced to `null` via `emptyToNull` (the exact
  helper `DevicesService` uses).
- `remove` is a plain delete — Phase 2A `Equipment` has no downstream references yet
  (`JobReferenceEquipmentUsed.equipmentId`, `WorkOrderEquipment`,
  `EquipmentCalibrationRecord` are all future). The UI offers `isActive=false` soft-retire
  as the normal path.

Controller / service mirror `DevicesController` / `DevicesService` (company-scoped master)
combined with the Phase 1 `equipment-types` module shape. No new CRUD architecture.

Module registration: `EquipmentController` + `EquipmentService` added to the existing
`EquipmentModule` (`apps/api/src/modules/equipment/equipment.module.ts`); `EquipmentModule`
is already imported in `app.module.ts`.

## 4. Validation (`packages/shared/src/schemas/index.ts`)

| Field | Rule |
|---|---|
| `equipmentTypeId` | required, `string().min(1)` |
| `code` | required, `string().trim().min(1).max(64)` — uniqueness enforced service+DB, per company |
| `brand` | optional, `string().trim().max(150)` (nullable on update) |
| `model` | optional, `string().trim().max(150)` (nullable on update) |
| `serialNumber` | optional, `string().trim().max(100)` (nullable on update) — **no uniqueness** |
| `notes` | optional, `string().trim().max(500)` (nullable on update) |
| `isActive` | optional boolean |
| list `isActive` query | `"true"` → `true` string transform (same pattern as `deviceCategoryListQuerySchema`) |

`equipmentCreateSchema`, `equipmentListQuerySchema`, `EQUIPMENT_SORTABLE_FIELDS`,
`equipmentUpdateSchema` + inferred types, exported via `@medcal/shared`.

## 5. RBAC

**No existing RBAC was changed.** One new resource added following the exact Phase 1
convention:

- `packages/auth/src/access-control.ts`: `equipment: ["read", "create", "update", "delete"]`
  added to the catalog.
- `packages/db/prisma/seed-role-permissions.ts`: ADMIN granted
  `equipment:read/create/update/delete` (SUPERADMIN bypasses; other roles unchanged).
  Re-seeded → **101** `RolePermission` rows (was 97).
- `packages/auth/src/me-types.ts` + `apps/api/src/modules/me/me.controller.ts`: 4 new
  `equipmentRead/Create/Update/Delete` capability flags on `GET /me`.
- Guards / middleware / permission semantics untouched. `EquipmentController` uses the same
  `@UseGuards(CompanyRoleGuard)` + `@RequirePermission("equipment", ...)` + `@CompanyId()`
  pattern as `DevicesController`, `EquipmentTypesController`.

Regression: `permissions` + `menu` module tests pass (39 total with `devices`), confirming
the catalog addition is safe.

## 6. UI

New feature folder `apps/portal/src/app/management/equipment-units/` (route
`/equipment-units`), reusing existing design-system primitives (`Surface`, `PageHeader`,
`Input`, `Button`, `Badge`, `PaginationBar`, `selectClassName`) — mirrors the Phase 1
`equipment-types` screens.

- `page.tsx` / `equipment-units-page-client.tsx` — list: single search box + flat table
  `Kode | Equipment Type | Merek | Model | No. Seri | Status | Edit` + `PaginationBar`.
  Gated on `capabilities.equipmentRead`.
- `equipment-unit-form-fields.tsx` — **Equipment Type** `<select>` (from the existing
  `EquipmentType` master, active only — no inline EquipmentType creation), **Code**
  (required), Brand, Model, Serial Number, Notes (all optional). Payload builders +
  `formatEquipmentUnitApiError` (maps `DUPLICATE_EQUIPMENT_CODE`, `EQUIPMENT_NOT_FOUND`,
  `EQUIPMENT_TYPE_NOT_FOUND`, …).
- `new/page.tsx` — create; gated on `equipmentCreate`.
- `[id]/page.tsx` — view / edit / activate-deactivate (status `<select>` in edit mode,
  same as Device Category) / delete (standard `confirm()` dialog); gated on
  `equipmentRead` / `equipmentUpdate` / `equipmentDelete`.
- `use-equipment-units-query.ts` — TanStack Query hooks (list/one/create/update/delete) +
  `useEquipmentTypeOptions` (fetches `/equipment-types?isActive=true&pageSize=100`).

Equipment Type is shown via the relation (`row.equipmentType.name` / `.code`), never stored
on `Equipment` (brief §11).

## 7. Search

`GET /equipment?search=` matches (`contains`, case-insensitive, server-side): `code`,
`brand`, `model`, `serialNumber`, and the related `equipmentType` `name` / `code` — the
fields that identify a physical unit (brief §8). No filter system beyond the single search
box (matches the other master pages).

## 8. Pagination

Reuses `PaginationBar` (from `leads-ui`) unchanged — same page-size selector,
"Halaman X dari Y · Total: N unit" line, Sebelumnya/Berikutnya, `page`/`pageSize` URL-query
conventions, default page size 10. No new pagination mechanism.

## 9. CRUD

Create ✅ · List/search ✅ · Get by id ✅ · Update ✅ · Activate/deactivate ✅ (edit-form
status select — the existing `Device`/`DeviceCategory` pattern) · Delete ✅. Equipment Type
selection from the existing master ✅. Duplicate `code` within a company rejected by DB
unique + service `409` ✅.

## 10. Company scoping

Every service method takes `companyId` (from `@CompanyId()`) and filters on it:
- `findAll` — `where: { companyId, ... }` always.
- `findOne` / `update` / `remove` — `findFirst({ where: { id, companyId } })`; a row from
  another company is a `404`, never leaked or mutated.
- `create` — `companyId` injected into `data`, never taken from the request body.
- Uniqueness check is `where: { companyId, code }` — scoped, so the same `code` is allowed
  in different companies.

Covered by tests (see §11): cross-company list isolation, cross-company `findOne`/`update`
→ `NotFoundException`, same-`code`-different-company allowed.

## 11. Tests

`apps/api/src/modules/equipment/equipment.service.test.ts` (hits the real local Postgres,
same as the other master-data module tests) — **7 tests, all pass**:

| Test | Asserts |
|---|---|
| create unit | `EquipmentType` relation resolves, `companyId` set, `serialNumber` NULL when omitted, `isActive` default true |
| unknown `equipmentTypeId` | rejected |
| duplicate `code` same company | `ConflictException` (`DUPLICATE_EQUIPMENT_CODE`) |
| same `code` different company | allowed (company-scoped uniqueness) |
| list / search (by serial) / read / update / deactivate / delete | full round-trip; `findOne` after delete → `NotFoundException` |
| cross-company isolation | `findAll` excludes foreign rows; `findOne` / `update` on a foreign id → `NotFoundException` |

Migration success + `EquipmentType → Equipment` relation + `unique(companyId, code)` +
nullable `serialNumber` are all exercised by these tests.

| Suite | Result |
|---|---|
| `src/modules/equipment` (equipment-types, requirements, **equipment**) | ✅ 3 files |
| `src/modules/equipment` + `src/modules/me` | ✅ **5 files, 42 tests pass** |
| `src/modules/permissions` + `src/modules/menu` + `src/modules/devices` | ✅ **39 pass** (RBAC catalog + company-scoping patterns — no regression) |
| `@medcal/shared` | ✅ 21/21 |
| `@medcal/auth` | ✅ 47/47 |

Pre-existing unrelated failures (emails/imap, push-tokens) not run / not caused by this change.

## 12. Typecheck

| Package | Result |
|---|---|
| `@medcal/shared` | ✅ |
| `@medcal/auth` | ✅ |
| `@medcal/api` | ✅ |
| `@medcal/portal` | ✅ |

## 13. Build

| Build | Result |
|---|---|
| `pnpm --filter @medcal/api build` (`tsc`) | ✅ |
| `pnpm --filter @medcal/portal build` (Next.js) | ✅ Compiled successfully — `/management/equipment-units`, `/management/equipment-units/[id]`, `/management/equipment-units/new` all render |
| `prisma migrate deploy` on local `pkmdb` | ✅ `Equipment` table created; no existing table/data touched |
| `seed:role-permissions` / `seed:menu` re-run | ✅ 101 / 31 rows upserted |

## 14. Files changed

```
packages/db/prisma/schema.prisma                                   +~35  Equipment model + Company.equipment + EquipmentType.equipment back-relations
packages/db/prisma/migrations/20260829040000_add_equipment/migration.sql   NEW  CREATE TABLE + 3 indexes + 1 unique + 2 FKs (additive only)
packages/db/prisma/seed-role-permissions.ts                        +4    ADMIN grants for equipment
packages/db/prisma/seed-menu.ts                                    +11   device-management.equipment-units leaf (under existing Equipment sub-group)
packages/shared/src/schemas/index.ts                              +48   equipment* Zod schemas/types + EQUIPMENT_SORTABLE_FIELDS
packages/auth/src/access-control.ts                                +2    equipment resource in the catalog
packages/auth/src/me-types.ts                                      +4    4 capability flags
apps/api/src/modules/me/me.controller.ts                           +4    4 hasPermission() lines
apps/api/src/modules/equipment/equipment.service.ts               NEW   company-scoped CRUD
apps/api/src/modules/equipment/equipment.controller.ts            NEW   /equipment, @CompanyId()
apps/api/src/modules/equipment/equipment.module.ts                +~8   register EquipmentController/Service alongside the Phase 1 controllers
apps/api/src/modules/equipment/equipment.service.test.ts          NEW   7 tests
apps/portal/src/app/management/equipment-units/                    NEW   page, page-client, ui, form-fields, query hook, new/page, [id]/page
```

Not changed: `Device`, `DeviceType`, `EquipmentType`, `DeviceTypeEquipmentRequirement`,
`CalibrationJob`, `JobReferenceEquipmentUsed`, `WorkOrder`, `WorkOrderAssignment` (only
`Company` and `EquipmentType` gained a back-relation field, no column). No seed data for
`Equipment` (admin enters it — brief §11 of the audit / "no fabricated data" policy).
`app.module.ts` unchanged (`EquipmentModule` was already registered in Phase 1).

## 15. Assumptions

1. `localhost:5432/pkmdb` is the confirmed local dev DB (verified via `migrate status`
   before applying).
2. `code` is the primary human identity of a physical unit and is **required**; it is
   unique **per company**, not globally (audit §7).
3. `serialNumber` is optional and **not** uniqueness-constrained (audit §7 — no business
   data yet supports a rule; the per-EquipmentType partial-unique idea is deferred as an
   open question).
4. `isActive` boolean is sufficient lifecycle for 2A; richer status (`OUT_FOR_CALIBRATION`,
   `RETIRED`, …) is a future concern (audit §13).
5. Equipment Type in the create/edit form is selected from the existing `EquipmentType`
   master (active types only); **no** inline EquipmentType creation (not an established
   MEDCAL pattern).
6. `Equipment` is PKM-owned (company-scoped, no ownership column) — ownership remains an
   open business question (audit §12).
7. `remove` is a hard delete because no downstream reference exists yet; the UI nudges
   toward `isActive=false`. Once Phase 2B FKs land, `remove` should gain a reference guard.

## 16. Deferred Phase 2B items (explicitly NOT implemented)

- `EquipmentCalibrationRecord` (calibration date, valid-until, cert number, provider,
  result, notes) — current validity to be **derived** from records, never stored on
  `Equipment`.
- `FileOwnerType.EQUIPMENT_CALIBRATION_CERTIFICATE` + calibration-certificate document
  upload (depends on generic `FileObject` upload infra — a separate prerequisite).
- `JobReferenceEquipmentUsed.equipmentId` nullable FK (keeping the free-text
  `equipmentName`/`brand`/`model`/`serialNumber` as a permanent LK snapshot).
- The validity rule (`calibration job date ≤ equipment valid-until`) as a service-layer
  warning; the authoritative "calibration job date" definition on `CalibrationJob`.
- `WorkOrderEquipment` (assignment / "to bring", WorkOrder grain, optional
  `calibrationJobId?`); equipment conflict / availability warnings off `WorkOrder`
  schedule overlap.
- Technician App equipment pick / "actual used" capture; Surat Jalan.
- Ownership discriminator; location / custody; rich `EquipmentStatus` enum; `EquipmentModel`
  tier; parameter-level equipment suitability.
- Any inventory / procurement / valuation / depreciation / maintenance.

---

**Phase 2A implements only the physical Equipment master.** The future architecture remains
`Equipment → EquipmentCalibrationRecord[]` (Phase 2B) → `WorkOrderEquipment` (later) →
`CalibrationJob` → `JobReferenceEquipmentUsed` (later nullable `equipmentId`).
