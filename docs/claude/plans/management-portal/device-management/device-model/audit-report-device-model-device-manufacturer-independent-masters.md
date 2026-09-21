# Audit Report: DeviceModel / DeviceManufacturer Independent Masters Refactor

Audit only. No schema, migration, backend, frontend, API, query hook, or test changes were made as part of this task.

---

# 1. Executive Summary

`DeviceModel` currently exists as a **child of `DeviceType`**: it holds a required `deviceTypeId` foreign key, a plain `manufacturer` String field, and a `model` String field, unique together as `@@unique([deviceTypeId, manufacturer, model])`. `DeviceManufacturer` does not exist as an entity anywhere in the codebase. `DeviceType` is already a fully independent master (its own CRUD, RBAC, system-issued `code`, and nine other models hold required FKs to it).

The critical fact shaping this whole audit: **`DeviceModel` currently has zero downstream consumers.** No other Prisma model has a foreign key to `DeviceModel.id`, and no backend or frontend code outside the `device-models` module itself reads or writes a `DeviceModel` relation. `manufacturer` likewise lives in exactly one place — the `DeviceModel` module — and was **deliberately deferred** as its own master in the original implementation spec (`Cursor Prompt — Implement DeviceModel.md`), not an oversight: *"Alasannya: kebutuhan untuk menjadikan Manufacturer sebagai master entity belum dikonfirmasi dan belum diperlukan untuk phase ini"* ("the need for Manufacturer to become its own master entity has not been confirmed and is not yet required for this phase").

This means the refactor is low-risk from a cross-domain-regression standpoint (nothing else in Device, SPK/WO, requisition, quotation, calibration, portal, tech-pwa, or reports/PDF references `DeviceModel` or `manufacturer` today), but it also means there is **no existing consumer evidence** to confirm what the post-refactor relationship shape should be. That question is the single most important open decision in this report (Section 6/7/11) — the task explicitly forbids guessing it.

The established "independent master" pattern in this codebase (UOM, DeviceCategory, DeviceType) is well-documented and consistent enough to fully determine RBAC, pagination, search, filtering, and CRUD conventions for a new `DeviceManufacturer` master (Section 4) — no new pattern needs to be invented.

---

# 2. DeviceModel Dependency Map

**Prisma (`packages/db/prisma/schema.prisma`):**

```prisma
// Product/model master under a DeviceType — manufacturer is a plain string
// this phase (not a DeviceManufacturer entity). Unique per
// (deviceTypeId, manufacturer, model); the same model name may exist under
// a different DeviceType. Do not FK Device to this model yet.
model DeviceModel {
  id           String   @id @default(cuid())
  deviceTypeId String
  manufacturer String
  model        String
  description  String?
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  deviceType DeviceType @relation(fields: [deviceTypeId], references: [id])

  @@unique([deviceTypeId, manufacturer, model])
  @@index([deviceTypeId])
  @@index([isActive])
}
```

The comment itself is load-bearing: the original author already anticipated this exact refactor ("Do not FK Device to this model **yet**").

- **`DeviceModel.deviceTypeId → DeviceType.id`**: required, no `onDelete` override (defaults to `Restrict`). This is the only relation `DeviceModel` currently participates in.
- **No model anywhere has a `deviceModelId` field or a relation typed `DeviceModel`.** Confirmed by direct schema grep — zero matches. `DeviceModel` is an orphan/leaf master.
- **Backend**: fully self-contained in `apps/api/src/modules/device-models/` (`device-models.service.ts`, `.controller.ts`, `.module.ts`, `.service.test.ts`).
- **Frontend**: fully self-contained in `apps/portal/src/app/management/device-models/` (`page.tsx`, `device-models-page-client.tsx`, `device-models-ui.tsx`, `device-model-form-fields.tsx`, `use-device-models-query.ts`, `new/page.tsx`, `[id]/page.tsx`).
- **Only external reference found**: `apps/portal/src/app/management/permission-management/page.tsx` has a `RESOURCE_LABELS` entry `deviceModel: "Device Model"` for the RBAC label list — a UI string, not a data dependency.
- **Naming collision to flag explicitly**: several PDF/report DTOs use a field literally named `deviceModel` (`apps/api/src/modules/calibration-jobs/kontrol-alat-pdf.ts`, `lk-result-pdf.ts`, `kontrol-alat.service.ts`, `lk-download.service.ts`), but it is populated from `Device.model` (a free-text string on the `Device` record), **not** a relation to the `DeviceModel` master. This is a pure naming coincidence and must not be confused with the entity being refactored here.

**For contrast — DeviceType's actual fan-out** (9 models with required FKs, none related to `DeviceModel`):

| Model | FK field | onDelete |
|---|---|---|
| `DeviceModel` | `deviceTypeId` | Restrict (default) |
| `DeviceTypeAlias` | `deviceTypeId` | Cascade |
| `DeviceTypeEquipmentRequirement` | `deviceTypeId` | Restrict (default) |
| `DeviceCalibrationParameter` | `deviceTypeId` | Restrict (default) |
| `DeviceTypeCapabilityOrder` | `deviceTypeId` | Cascade |
| `DevicePhysicalCheckItem` | `deviceTypeId` | Restrict (default) |
| `Device` | `deviceTypeId` | Restrict (explicit in migration SQL) |
| `CalibrationRequestItem` | `deviceTypeId` | Restrict (default) |
| `PriceListItem` | `deviceTypeId` | Restrict (default) |

`CalibrationRequestItemHistory.deviceTypeId` also exists but as a **non-FK snapshot column** (documented in-schema as intentionally not a live relation, same treatment as its `sourceItemId` field).

`DeviceType` also blocks its own deletion when `DeviceModel` rows reference it:
```ts
// apps/api/src/modules/device-types/device-types.service.ts:139-143
const modelCount = await prisma.deviceModel.count({ where: { deviceTypeId: id } });
// ... code: "DEVICE_TYPE_HAS_MODELS"
```
This guard must continue to work (or be deliberately re-evaluated) after the refactor if `DeviceModel` keeps a `deviceTypeId` relation.

---

# 3. Manufacturer Usage Map

**A. Actual master/entity**: none exists. Confirmed by repo-wide search (`apps/`, `packages/`, `docs/`) for `DeviceManufacturer`, `manufacturerId`, and related terms — the only hits are a schema comment on `DeviceModel` and three planning docs, all describing the *absence* of this entity, never a partial implementation.

**B. Free-text field**: `DeviceModel.manufacturer` (`String`, required, `maxLength 150`) is the only place `manufacturer` is persisted anywhere in the system.

**C. UI-only value**: rendered/edited purely as a plain `<Input>`:
```tsx
// apps/portal/src/app/management/device-models/device-model-form-fields.tsx
<label htmlFor="manufacturer">Manufacturer <span className="text-red-500">*</span></label>
<Input id="manufacturer" value={value.manufacturer} onChange={(e) => onChange("manufacturer", e.target.value)}
  placeholder="Masukkan merek alat" maxLength={150} required />
```
Also appears as a sortable table column, search target (`"Cari manufacturer, model, atau device name…"`), and detail-view field in `device-models-ui.tsx` and `[id]/page.tsx` — always as plain text, never a dropdown.

**D. Hardcoded lists**: none found. The original spec doc explicitly instructed against seeding example manufacturers ("Jangan membuat: Omron, Mindray, Nihon Kohden, GE — sebagai seed hanya berdasarkan contoh prompt ini"), and no `seed-device-models.ts` file or npm script exists. The only manufacturer strings anywhere in the repo are inline test fixtures:
- `apps/api/src/modules/device-models/device-models.service.test.ts` — e.g. `"Omron"`, `"Mindray"`, `"SharedCo"`, `"FirstCo"`, used to test the composite unique constraint including a case-insensitivity check (`"Omron"` vs `"omron"` under the same type/model expected to collide).
- `apps/api/src/modules/device-types/device-types.service.test.ts:130` — one fixture row (`manufacturer: "TestCo"`) used only to test the DeviceType-delete-blocked-by-models guard.

**Backend touch points** (validation + service, both confirmed as the *only* backend files that ever touch `.manufacturer`):
- `packages/shared/src/schemas/index.ts` — `manufacturer: z.string().trim().min(1).max(150)` (create), `.optional()` (update).
- `apps/api/src/modules/device-models/device-models.service.ts` — `assertUniqueCombination()` (case-insensitive equality check), create payload, case-insensitive `contains` search filter, update payload with combination-changed re-check.

**Confirmed absence elsewhere**: repo-wide case-insensitive grep across all of `apps/` found zero `manufacturer` references outside the `device-models` module — not in `Device`, SPK/WO (`work-orders`), requisition (`calibration-requests`), quotation (`quotations`), calibration jobs, portal pages generally, tech-pwa, or PDF/report generation code.

---

# 4. Existing Master Pattern

**Reference implementations**: UOM (`apps/api/src/modules/uoms/`, `apps/portal/src/app/management/uoms/`) and DeviceType (`apps/api/src/modules/device-types/`, `apps/portal/src/app/management/device-types/`) — DeviceType is the closer structural analog since it has full CRUD (incl. delete) and a parent relation, matching what `DeviceManufacturer` and the refactored `DeviceModel` will need.

**RBAC**
- Permission catalog: `packages/auth/src/access-control.ts` — per-resource action arrays, e.g. `uom: ["read", "create", "update"]` (no delete), `deviceType: [...]`/`deviceModel: [...]` (full CRUD incl. delete).
- Enforcement: every controller method decorated `@UseGuards(CompanyRoleGuard)` at class level + `@RequirePermission("<resource>", "<action>")` at method level (`apps/api/src/common/guards/company-role.guard.ts`, `apps/api/src/common/decorators/require-permission.decorator.ts`).
- Permissions are DB-driven (`RolePermission` table) via an in-memory cache (`loadRolePermissionCache()`/`hasPermission()`), seeded in `packages/db/prisma/seed-role-permissions.ts` and surfaced to the frontend as booleans via `GET /me` (`apps/api/src/modules/me/me.controller.ts`, e.g. `uomRead`, `deviceModelCreate`).
- Frontend gating: `useAuthz()` (`packages/auth/src/auth-provider.tsx`) exposes `capabilities.*` booleans, checked before rendering action buttons and again inside save/delete handlers.
- Menu entries keyed by `viewResource` in `packages/db/prisma/seed-menu.ts`.

**Pagination**
- No modals anywhere in this codebase for master data — full-page navigation: list page → `/new` create page → `/[id]` detail page with an inline "editing" toggle (not a separate edit route/modal).
- `PaginationBar` (`apps/portal/src/app/management/leads/leads-ui.tsx`, re-exported by feature UI files) driven by `usePaginationSync` (`apps/portal/src/hooks/use-pagination-sync.ts`).
- `PAGE_SIZE_OPTIONS = [10, 20, 50]`; default page size **10**. Page/pageSize/sort/search are all URL-synced (`useUrlQueryState`); a stale page number is clamped to `totalPages` with a dismissable "view adjusted" banner.
- API response shape: `{ data, page, pageSize, total, totalPages }`.

**Search + debounce**
- `useDebouncedValue` (`apps/portal/src/hooks/use-debounced-value.ts`), used at **500ms**: `useDebouncedValue(searchInput, 500)`.
- Debounced value commits to the URL `search` param only when changed; `page` resets to 1 (`undefined`) on every new search.
- Backend applies case-insensitive `contains` filtering across the relevant text columns (e.g. `code`/`name`/`symbol` for UOM; `manufacturer`/`model` for DeviceModel today).

**Active/inactive filter**
- `isActive Boolean @default(true)` + `@@index([isActive])` on every master.
- List query schema: `isActive: z.string().transform(v => v === "true").optional()`.
- Frontend `<select>` with `"Semua status"` / `"Aktif"` / `"Nonaktif"` options — most fully realized today in `DeviceModel`'s own filter bar (`device-models-ui.tsx`), which is the best UI reference even though UOM's filter bar doesn't currently expose this filter.
- Status rendered via a per-master badge component (`UomStatusBadge`, `DeviceTypeStatusBadge`, `DeviceModelStatusBadge`) — identical emerald/slate styling, one component per master.

**CRUD**
- Create: `/<feature>/new` page → `useCreate<Feature>()` mutation → `router.push('/<feature>/${row.id}')`.
- Edit: `/<feature>/[id]` page toggles a local `editing` boolean, swapping a read-only `<dl>` for the same `*FormFields` component used on create; Cancel restores original values via a `resetForm()` closure.
- Delete: **no hard-delete UI exists for any master today**, including DeviceType/DeviceModel even though their controllers expose `DELETE` routes with RBAC — only the `isActive` toggle inside the edit form is wired up in the portal. This is a pre-existing pattern gap, not something introduced by or required to fix for this refactor.

**API / query hook conventions**
- No shared/central hooks package — hooks are colocated per-feature: `apps/portal/src/app/management/<feature>/use-<feature>-query.ts`.
- Consistent shape across UOM, DeviceType, and DeviceModel: `<FEATURE>_QUERY_KEY` constant, `use<Features>(params)` list hook (query key includes every filter param), `use<Feature>(id)` detail hook (`enabled: Boolean(id)`), `useCreate<Feature>()` and `useUpdate<Feature>()` mutations that invalidate the list key and seed/invalidate the detail key. No delete hook exists for any of the three today.
- Validation: single shared file `packages/shared/src/schemas/index.ts` holds all Create/Update/ListQuery Zod schemas per domain, each list schema extending a common `baseListQuerySchema` (`search`, `sortBy`, `sortDir`, `page`, `pageSize`); a `*_SORTABLE_FIELDS` tuple is declared alongside each domain's schemas.

**Dependent-dropdown precedent** (no DeviceType→Model cascade exists today; this is the closest analog to copy): Capability → Capability Item in Device Calibration Parameters —
```ts
// apps/portal/src/app/management/device-capabilities/use-device-capabilities-query.ts
export function useDeviceCapabilityItems(capabilityId: string | undefined) {
  return useQuery({
    queryKey: [DEVICE_CAPABILITY_ITEMS_QUERY_KEY, capabilityId],
    queryFn: () => apiFetch<DeviceCapabilityItemRow[]>(`/device-capabilities/${capabilityId}/items`),
    enabled: Boolean(capabilityId),
  });
}
```
```tsx
// device-calibration-parameter-form-fields.tsx
onSelect={(id) => { onChange("capabilityId", id); onChange("capabilityItemId", ""); }}
<ComboboxField id="capabilityItemId" disabled={!value.capabilityId || capabilityItemsLoading}
  placeholder={value.capabilityId ? "Pilih capability item" : "Pilih capability dulu"} ... />
```

**Naming note**: `DeviceType` is labeled **"Device Name"** everywhere in user-facing UI and RBAC copy (`RESOURCE_LABELS.deviceType = "Device Name"`). Any new `DeviceManufacturer` label must be chosen to avoid confusion with "Device Name" and "Device Model" in the sidebar/permission-management screen (see Open Questions, §11).

---

# 5. Data/Migration Impact

No production database access was available for this audit; the analysis below is based strictly on schema, migrations, seed files, and test fixtures, per the task's explicit instruction not to invent record counts or data conditions.

- **No seed data exists for `DeviceModel`** — there is no `seed-device-models.ts` file and no corresponding script in `packages/db/package.json`. The original implementation spec explicitly forbade seeding fictitious manufacturer/model data. Any real `DeviceModel` rows in a live environment would have been created by end users through the UI, not by this codebase's seed layer.
- **The composite unique constraint has never changed.** It was created in migration `20260826040000_add_device_model` and is untouched through the latest migration (`20260920100000_mom1_revision_scope_isactive`). `isActive` was added later (`20260831130000_add_isactive_device_masters`) but did not touch the unique index.
- **Case-insensitivity is enforced only at the service layer** (`assertUniqueCombination`), not the database (no `citext`, no functional/lower() index). This means duplicate manufacturer strings differing only by case could theoretically exist if any row was ever inserted outside the service layer (e.g. a direct SQL script or a future import path) — this cannot be confirmed or ruled out without querying the real database.
- **`DeviceModel.id` is referenced by nothing else** (Section 2), so existing IDs can be trivially preserved during the refactor — there is no downstream FK that would need remapping.
- **Recommended migration shape** (standard expand-and-contract, to be executed only after Section 6/7 decisions are made and against real data in each environment):
  1. Create `DeviceManufacturer` table.
  2. Populate it from `SELECT DISTINCT manufacturer FROM "DeviceModel"` (dedupe/casing policy is an open question — Section 11).
  3. Add a nullable `manufacturerId` column to `DeviceModel`.
  4. Backfill `manufacturerId` by matching each row's `manufacturer` string to the corresponding new `DeviceManufacturer` row.
  5. Only after backfill is verified: make `manufacturerId` `NOT NULL`, drop the `manufacturer` column, and replace the unique index.
- This audit cannot execute or simulate this migration — it must be run and verified against the actual database in each target environment before being finalized.

---

# 6. Target Architecture

**Current:**
```
DeviceModel
├── deviceTypeId  (FK → DeviceType, required)
├── manufacturer  (String)
└── model         (String)
```

**Target, per the task's stated principle** (`DeviceType`, `DeviceManufacturer`, `DeviceModel` all independent masters — but the task explicitly forbids assuming `DeviceModel → DeviceManufacturer` or `DeviceModel → DeviceType` by default):
```
DeviceType           (independent master — unchanged)
DeviceManufacturer   (new independent master — manufacturer-only attributes)
DeviceModel          (independent master — model-only attributes)
```

**The open question this audit cannot resolve from evidence alone**: "independent master" in this codebase's existing usage (see `DeviceCalibrationParameter`, `DevicePhysicalCheckItem`, `DeviceTypeEquipmentRequirement` — all "independent masters" with their own CRUD/RBAC/lifecycle that *still* hold a required `deviceTypeId` FK) does **not** mean "zero relations to other masters." It means each has its own independent CRUD lifecycle, RBAC, and identity. Under that established precedent, the direct, minimal-change interpretation is:

```
DeviceModel
├── deviceTypeId     (FK → DeviceType, unchanged)
├── manufacturerId   (FK → DeviceManufacturer, replaces the manufacturer string)
└── model            (String, unchanged)
```

This is the evidence-supported option because **the `DeviceModel` module's own list/filter/detail screens are the only actual consumer of `deviceTypeId` today**, and they rely on it to scope and display "Device Type" per model. No other consumer (`Device`, `CalibrationRequestItem`, etc.) currently needs or references `DeviceModel` at all — they use free-text `brand`/`model` alongside their own independent `deviceTypeId`.

The alternative reading — `DeviceModel` holding **zero** FK to `DeviceType`/`DeviceManufacturer`, with some other entity (e.g. `Device`) owning a three-way association (`deviceTypeId` + `deviceManufacturerId` + `deviceModelId`) — has **no supporting evidence today**: `Device` does not reference `DeviceModel` in any form, only free-text `brand`/`model` strings. Adopting this reading would mean introducing a brand-new requirement (wiring `Device` to `DeviceModel`) that is out of scope for "make existing masters independent" and was explicitly deferred in the original `Device` migration work.

**Recommendation**: retain `deviceTypeId` and add `manufacturerId` on `DeviceModel` (first diagram above), unless the business explicitly confirms a different consumer requirement. This is flagged as an explicit decision point in Section 11 rather than assumed, per the task's instruction.

---

# 7. Uniqueness Strategy

**Current**: `@@unique([deviceTypeId, manufacturer, model])`, unchanged since creation, case-insensitive only at the service layer.

**If the Section 6 recommendation is adopted** (DeviceModel keeps `deviceTypeId` + gains `manufacturerId`), the direct successor is:
```prisma
@@unique([deviceTypeId, manufacturerId, model])
```
This is the same *shape* as today, only the manufacturer key changes from a string to an FK id — and it preserves the original spec's explicit warning against assuming `model` alone must be globally unique ("Jangan membuat asumsi bahwa `model` saja harus globally unique"), which existing test fixtures confirm is a real business rule (the same model name legitimately exists under different `DeviceType`s in the test suite).

**If `DeviceModel` is instead fully decoupled from `DeviceType`/`DeviceManufacturer`** (the alternative reading in Section 6), there is **no evidence in the repository to determine the correct uniqueness rule** — it would depend entirely on the not-yet-specified consumer relationship. This is flagged as an open decision, not guessed.

**`DeviceManufacturer` itself** should have its own uniqueness on `name` (case-insensitive dedupe at the service layer, matching the `DeviceModel`/`UOM` precedent) — no evidence was found that manufacturers need a system-issued `code` the way `DeviceType`/`DeviceCategory` do (flagged in Section 11).

---

# 8. File-Level Change Plan

**1. Prisma / Schema** (`packages/db/prisma/schema.prisma`)
- Add `model DeviceManufacturer { id, name, description?, isActive, createdAt, updatedAt, models DeviceModel[] }`, mirroring the `DeviceCategory`/`DeviceType` shape (global, no `companyId`, `isActive` + index). **Required.**
- Modify `DeviceModel`: replace `manufacturer String` with `manufacturerId String` + `manufacturer DeviceManufacturer @relation(fields: [manufacturerId], references: [id])`; update the unique constraint to `@@unique([deviceTypeId, manufacturerId, model])`; add `@@index([manufacturerId])`. **Required, pending Section 6 decision.**
- Remove/update the now-stale doc-comment above `DeviceModel` (currently states manufacturer is intentionally a plain string "this phase"). **Required.**

**2. Migration** (`packages/db/prisma/migrations/`)
- New migration: create `DeviceManufacturer` table. **Required.**
- New migration(s): add nullable `manufacturerId` to `DeviceModel`, backfill from distinct `manufacturer` values, then enforce `NOT NULL` + drop `manufacturer` column + swap the unique index, per the expand/contract sequence in Section 5. **Required**, must be split into safe steps and verified against real data in each environment before the contract step runs.

**3. Backend** (`apps/api/src/modules/`)
- New module `device-manufacturers/` (`.service.ts`, `.controller.ts`, `.module.ts`, `.service.test.ts`) mirroring `uoms/` or `device-types/`. **Required.**
- `device-models/device-models.service.ts`: replace manufacturer-string logic with `manufacturerId` FK validation (`assertDeviceManufacturerExists`, analogous to the existing `assertDeviceTypeExists`), update `assertUniqueCombination` to key on `manufacturerId`, update the search filter to search the related `manufacturer.name`, add `manufacturer: { select: {...} }` to reads' `include`. **Required.**
- `device-models/device-models.controller.ts`: no route-shape change expected; request/response DTOs change `manufacturer` → `manufacturerId`. **Required.**
- `app.module.ts`: register the new `DeviceManufacturersModule`. **Required.**

**4. Validation** (`packages/shared/src/schemas/index.ts`)
- Add `deviceManufacturerCreateSchema`, `deviceManufacturerUpdateSchema`, `deviceManufacturerListQuerySchema`, `DEVICE_MANUFACTURER_SORTABLE_FIELDS`, mirroring `uomCreateSchema`/`deviceTypeCreateSchema`. **Required.**
- Update `deviceModelCreateSchema`/`deviceModelUpdateSchema`: `manufacturer: z.string()...` → `manufacturerId: z.string().min(1)`. **Required.**
- Re-evaluate `DEVICE_MODEL_SORTABLE_FIELDS` (currently includes `"manufacturer"` as a plain-column sort) — sorting by a relation field may need query-layer support the existing `resolveSortOrder` helper doesn't yet have. **Required to check during implementation, not urgent for this audit.**

**5. RBAC**
- `packages/auth/src/access-control.ts`: add `deviceManufacturer: ["read", "create", "update", "delete"]` (full CRUD, matching `deviceType`/`deviceModel` rather than UOM's read/create/update-only). **Required.**
- `apps/api/src/modules/me/me.controller.ts`: add `deviceManufacturerRead/Create/Update/Delete` capability booleans. **Required.**
- `packages/db/prisma/seed-role-permissions.ts`: add ADMIN grants for `deviceManufacturer`. **Required.**
- `packages/db/prisma/seed-menu.ts`: add a menu entry (`viewResource: "deviceManufacturer"`). **Required.**
- `apps/portal/src/app/management/permission-management/page.tsx`: add a `deviceManufacturer` label to `RESOURCE_LABELS`, chosen to avoid collision with the existing "Device Name" (`deviceType`) and "Device Model" (`deviceModel`) labels. **Required.**

**6. Frontend — new DeviceManufacturer master** (mirrors `device-types/` file-for-file, full-page CRUD, no modal)
- `apps/portal/src/app/management/device-manufacturers/page.tsx`
- `.../device-manufacturers-page-client.tsx`
- `.../device-manufacturers-ui.tsx`
- `.../device-manufacturer-form-fields.tsx`
- `.../use-device-manufacturers-query.ts`
- `.../new/page.tsx`
- `.../[id]/page.tsx`

All **required**, all following the existing `device-types` pattern exactly.

**7. Frontend — DeviceModel updates**
- `device-model-form-fields.tsx`: replace the free-text manufacturer `<Input>` with a `ComboboxField` sourced from a new `useDeviceManufacturers()` hook, mirroring the existing `deviceTypeId` combobox in the same file. **Required.**
- `device-models-ui.tsx`: update the table column and search/filter bar to read the related manufacturer's `name`; adding a manufacturer filter dropdown alongside the existing DeviceType filter is **optional** (not required by current scope, a natural follow-on). **Column/type update required; new filter optional.**
- `[id]/page.tsx`: update detail view + edit form wiring for `manufacturerId`. **Required.**
- `new/page.tsx`: update payload/validation for `manufacturerId` instead of a manufacturer string. **Required.**
- `use-device-models-query.ts`: `DeviceModelRow.manufacturer` changes from a string to an object (e.g. `{ id, name }`); update the type and any consumers. **Required (type-level only).**

**8. Query hooks**: covered by items 6–7 above. `use-device-types-query.ts` is unaffected — DeviceType itself does not change.

**9–10. Forms / Tables**: covered by items 6–7.

**11. Consumers**: **none outside the `device-models`/`device-types` modules** — confirmed zero cross-domain consumers of `DeviceModel` or `manufacturer` (Sections 2–3). Only the one RBAC label-map line noted in item 5 is needed. No changes required to `Device`, SPK/WO, requisition, quotation, calibration jobs, portal pages elsewhere, tech-pwa, or PDF/report generation code.

**12. Tests**
- `device-models.service.test.ts`: replace `manufacturer: "Omron"`-style string fixtures with a created `DeviceManufacturer` row + `manufacturerId`; adapt the case-insensitive duplicate test (case-insensitivity now belongs to `DeviceManufacturer`'s own uniqueness check, not `DeviceModel`'s). **Required.**
- New `device-manufacturers.service.test.ts`, mirroring `device-types.service.test.ts`/UOM's test suite. **Required.**
- `device-types.service.test.ts:130`: update its `manufacturer: "TestCo"` fixture to use a `manufacturerId` once the field is renamed. **Required.**

**13. Seed/fixtures**: no seed script exists today for `DeviceModel`, by deliberate design, and none should be added for `DeviceManufacturer` either — preserves existing behavior per the Phase Continuity rule. The only seed-adjacent changes are the RBAC seed updates already listed in item 5.

---

# 9. Regression/Risk Areas

**HIGH RISK**
- The `DeviceModel` schema migration itself (`manufacturer` string → `manufacturerId` FK). This is the one genuinely destructive step: if production `DeviceModel` rows exist, the backfill must not lose or misassign data, and this audit had no database access to confirm actual row content or count.
- Anything outside this audit's visibility (e.g. raw SQL reports, BI tools, external integrations) that might query the `DeviceModel.manufacturer` column directly — not found within the scope audited (Prisma/backend/frontend), but not provable absent from the broader environment.

**MEDIUM RISK**
- The unique constraint change (`deviceTypeId, manufacturer, model` → `deviceTypeId, manufacturerId, model`): rows with manufacturer strings differing only by case (e.g. "Omron" vs "omron") would collide once both map to the same `DeviceManufacturer` row, if such duplicates exist in real data — unconfirmed without DB access.
- Test fixtures in `device-models.service.test.ts` and `device-types.service.test.ts` both reference `manufacturer` as a string literal and must be updated together, or the suite will fail to compile.
- `DEVICE_MODEL_SORTABLE_FIELDS` includes `"manufacturer"`; once it becomes a relation, sorting needs relation-aware query logic that the existing `resolveSortOrder` helper may not currently support — needs verification during implementation, not just a rename.

**LOW RISK**
- RBAC/menu/label additions — purely additive, follows the established pattern exactly, no existing behavior touched.
- The new `DeviceManufacturer` module/frontend — greenfield, nothing to regress.
- `DeviceType`, `UOM`, `Device`, SPK/WO, requisition, quotation, calibration jobs, portal pages elsewhere, tech-pwa, and PDF/report flows — confirmed zero references to `DeviceModel` or `manufacturer` today, so none of these are at risk from this refactor.
- `DeviceModel.id` preservation — since nothing references it today, existing IDs can be preserved with no downstream FK remapping required.

---

# 10. Implementation Sequence

1. Resolve the open decisions in Section 11 — target relationship shape (Section 6) and the resulting uniqueness rule (Section 7) — before writing any schema.
2. Prisma: add `DeviceManufacturer` model; add a nullable `manufacturerId` to `DeviceModel`, keeping `manufacturer` temporarily (migration 1).
3. Backfill: populate `DeviceManufacturer` from distinct `DeviceModel.manufacturer` values per the agreed dedupe policy; set `manufacturerId` accordingly (migration 2, run and verified against real data in each environment).
4. Prisma: enforce `manufacturerId NOT NULL`, drop the `manufacturer` column, apply the new unique constraint (migration 3, only after backfill is verified).
5. Backend: implement `DeviceManufacturersModule` (service/controller/module/tests), mirroring UOM/DeviceType.
6. Backend: update `DeviceModelsService`/`Controller` to use `manufacturerId`; update validation schemas.
7. RBAC: add `deviceManufacturer` permission entries, seed grants, and menu entry.
8. Frontend: build the `device-manufacturers` pages (list/new/detail), mirroring the `device-types` file set.
9. Frontend: update `device-model-form-fields.tsx`, `device-models-ui.tsx`, `[id]/page.tsx`, `new/page.tsx` to use `manufacturerId` + a `DeviceManufacturer` combobox.
10. Update/extend tests (`device-models.service.test.ts`, `device-types.service.test.ts`, new `device-manufacturers.service.test.ts`) and run the full relevant Vitest suite per the repo's testing rules.
11. Typecheck and build verification.
12. Manual smoke test: create a `DeviceManufacturer`, create a `DeviceModel` referencing it, verify list/filter/search/sort, verify RBAC gating, and verify the existing `DeviceType`-delete-blocked-by-models guard still works.

---

# 11. Open Questions / Decisions

1. **Target relationship shape (Section 6)**: should `DeviceModel` keep FK columns to `DeviceType` and gain one to `DeviceManufacturer` (the evidence-supported, minimal-change option — matches how `DeviceCalibrationParameter`/`DevicePhysicalCheckItem` remain "independent masters" while still holding a `deviceTypeId` FK), or must `DeviceModel` have zero relations to the other two masters, requiring some other entity (most likely `Device`) to own the three-way association? No current consumer needs the latter — `Device` today uses only free-text `brand`/`model`, not any master FK.
2. **Uniqueness rule (Section 7)**: directly depends on #1. If `DeviceModel` retains `deviceTypeId` + gains `manufacturerId`, `@@unique([deviceTypeId, manufacturerId, model])` is the direct successor. If `DeviceModel` is fully decoupled, the correct constraint cannot be determined from current evidence.
3. **Backfill/dedupe policy**: how should manufacturer strings that differ only by case or whitespace be handled when creating `DeviceManufacturer` rows from existing `DeviceModel` data? This must be checked against the real database (no access was available here) before the backfill migration runs.
4. **Does `DeviceManufacturer` need a system-generated `code`** (like `DeviceType`/`DeviceCategory` via `MasterCodeService`), or just a unique `name` (like a simpler master)? No business requirement for a manufacturer code was found in any spec document.
5. **Should a `DeviceType` ⇄ `DeviceManufacturer` cross-restriction exist** (e.g. only certain manufacturers valid for a given device type), or do they remain fully independent, with only `DeviceModel` (if it retains both FKs) bridging them? No existing UI/business rule requires this restriction today.
6. **UI label for `DeviceManufacturer`**: `DeviceType` is already labeled "Device Name" throughout the UI and RBAC screens. What should the new master's user-facing label be to avoid confusion with "Device Name" and "Device Model" in the sidebar and permission-management screen?

---

# 12. STOP

This audit is complete. No schema, migration, backend, frontend, API, query hook, or test changes were made. Implementation should proceed only after the Section 11 decisions are made, as a separate task.
