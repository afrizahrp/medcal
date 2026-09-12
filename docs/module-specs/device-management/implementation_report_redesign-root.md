# Implementation Report — Redesign Device Calibration Parameter & Decimal Precision

**Date:** 2026-08-29
**Author:** afriza.hrp@gmail.com (via Claude Code)
**Source brief:** `docs/claude/plans/device-management/devicecalibrationparameters/after-meeting-20260828/Redesign_DeviceCalibrationParameter_DecimalPlaces.md`
**Status:** ✅ **IMPLEMENTED & VERIFIED (2026-08-29).** Phase 1 audit, Phase 2 data model + migration, Phase 3 UI/UX redesign, API, and validation are all done and tested against the confirmed local dev DB (`localhost:5432/pkmdb`). Scope held: no Tariff / Equipment / Inventory / Technician App / Measurement Entry / Quotation / Invoice work.

### What was done (summary)

| Area | Result |
|---|---|
| Schema | `DeviceCalibrationParameter.decimalPlaces Int?` added + `CHECK (0..10)` |
| Migration | 2 migrations applied to **local dev DB** (`20260829010628_add_decimalplaces_...` then `20260829020000_set_decimalplaces_uniform_default_zero`) — 489/489 rows preserved; 486 NUMBER rows backfilled to a uniform **`decimalPlaces = 0`**; 3 non-NUMBER rows left `NULL` |
| API | `decimalPlaces` wired through create/update + new paginated `GET /device-calibration-parameters/grouped` (Device-Type-grouped browse, standard MEDCAL list response) |
| Validation | Zod `int 0..10 nullable`; service guard rejects `decimalPlaces` on non-NUMBER (`INVALID_DECIMAL_PLACES_FOR_VALUE_TYPE`); DB CHECK |
| UI | List → search + expandable/collapsible table grouped by Device Type (Capability/Item/UOM filters removed); create form keeps `capabilityItemId` linkage (device-type-scoped); **edit form hierarchy is read-only breadcrumb** per §6.3; Decimal Places field + detail row added |
| Tests | 21/21 module unit tests pass (6 new, incl. Device-Type-level pagination); shared 21/21; portal + api builds pass |
| Deferred | Accurate per-parameter `decimalPlaces` values (beyond the uniform `0`) — **NOT done, follow-up task** (§11) |

Sections 1–7 below describe the audit and the design; sections 8–9 record what was actually changed and tested.

---

## 1. Audit findings

### 1.1 Data model as it exists today

`packages/db/prisma/schema.prisma`:

```
model DeviceType (line 908)
  id, categoryId, code (unique), name, description, isActive
  └─ calibrationParameters DeviceCalibrationParameter[]

model DeviceCapability (line 953)
  id, code (unique), name, description
  └─ items DeviceCapabilityItem[]

model DeviceCapabilityItem (line 964)
  id, capabilityId, code, name, description
  @@unique([capabilityId, code])
  └─ calibrationParameters DeviceCalibrationParameter[]

model DeviceCalibrationParameter (line 987)
  id
  deviceTypeId       → DeviceType        (required FK)
  capabilityItemId   → DeviceCapabilityItem (required FK)
  code               String
  name               String
  description        String?
  valueType          CalibrationValueType @default(NUMBER)   -- enum: NUMBER | RATIO | TEXT | BOOLEAN
  uomId              String?  → Uom       (nullable FK, ON DELETE SET NULL)
  toleranceMin       Decimal? @db.Decimal(18, 4)
  toleranceMax       Decimal? @db.Decimal(18, 4)
  toleranceNote      String?
  createdAt, updatedAt
  @@unique([deviceTypeId, capabilityItemId, code])
  @@index([deviceTypeId]) @@index([capabilityItemId]) @@index([uomId])
```

**Relationship confirmed exactly as the brief describes:**
`DeviceType → (has many) DeviceCalibrationParameter`, and each `DeviceCalibrationParameter` is linked to exactly one `DeviceCapabilityItem`, which belongs to exactly one `DeviceCapability`. `uomId` is nullable (made optional in migration `20260826100000`). There is **no separate `CalibrationParameter` model** — `DeviceCalibrationParameter` is the single master entity.

### 1.2 Migrations touching this table (chronological)

| Migration | Effect |
|---|---|
| `20260826070000_add_device_calibration_parameter` | Creates the table |
| `20260826080000_add_devicetype_to_device_calibration_parameter` | Adds `deviceTypeId` |
| `20260826100000_add_valuetype_and_optional_uom_to_device_calibration_parameter` | Adds `valueType` enum (default `NUMBER`), makes `uomId` nullable |
| `20260826180000_add_limit_to_device_calibration_parameter` | (superseded) added limit fields |
| `20260826190000_replace_limit_fields_with_tolerance_fields_on_device_calibration_parameter` | Replaces limit fields with `toleranceMin/Max/Note` |

Migration provider: **postgresql** (`migrations/migration_lock.toml`). Convention: timestamped folder `YYYYMMDDHHMMSS_snake_case_name/migration.sql`, hand-authored SQL with `-- CreateEnum` / `-- AlterTable` comment headers.

### 1.3 API / service / repository layer

- `apps/api/src/modules/device-calibration-parameters/`
  - `device-calibration-parameters.controller.ts` — REST controller, Zod `safeParse` on body/query, `@RequirePermission("deviceCalibrationParameter", ...)`.
  - `device-calibration-parameters.service.ts` — direct `prisma` access (no repository layer). CRUD + `assertDeviceTypeExists`, `assertCapabilityItemExists`, `assertUomExists`, `assertToleranceBounds`, `assertUniqueCode`.
  - `device-calibration-parameters.service.test.ts` — existing unit tests.
- **Notable gap:** the service `create`/`update` **do not read or write `valueType`** at all — `valueType` is only ever set by the seed script. `create` also hard-requires `uomId` (`assertUomExists(input.uomId)` with no null guard) even though the column and Zod schema are nullable. Not in scope to fix here, but relevant: any new field must be wired through **both** the Zod schema (`packages/shared`) **and** the service, or it silently won't persist.
- Validation lives in `packages/shared/src/schemas/index.ts` (lines 761–844): `deviceCalibrationParameterCreateSchema`, `deviceCalibrationParameterListQuerySchema`, `deviceCalibrationParameterUpdateSchema`, `DEVICE_CALIBRATION_PARAMETER_SORTABLE_FIELDS = ["createdAt","code","name"]`. Tolerance parsing via `optionalFiniteNumber` (coerces `""`/`null` → `null`).

### 1.4 Existing page / filters / forms

`apps/portal/src/app/management/device-calibration-parameters/`
- `page.tsx` → `device-calibration-parameters-page-client.tsx` — list screen.
- `device-calibration-parameters-ui.tsx` — `DeviceCalibrationParameterFilters` (search + **4 cascading `FilterCombobox` filters**: Device Type, Capability, Capability Item, UOM), `DeviceCalibrationParameterTable` (9-column wide table, `min-w-[1140px]`), empty state, pagination. Server-side pagination, default page size 10.
- `device-calibration-parameter-form-fields.tsx` — shared create/edit form. **3 independent top-level dropdowns**: Device Type, Capability, Capability Item (Item disabled until Capability chosen), then Code, Name, UOM, toleranceMin/Max/Note, description. Also exports `validateCalibrationToleranceForm`, `buildDeviceCalibrationParameterCreatePayload`, `buildDeviceCalibrationParameterUpdatePayload`.
- `new/page.tsx`, `[id]/page.tsx` — create and detail/edit screens. Edit screen (`[id]/page.tsx`) currently shows Device Type / Capability / Capability Item as **fully editable dropdowns** in edit mode; read-only `<dl>` in view mode.
- `use-device-calibration-parameters-query.ts` — TanStack Query hooks; `buildSearchParams` serialises `search, deviceTypeId, capabilityId, capabilityItemId, uomId, sortBy, sortDir, page, pageSize`.

### 1.5 Existing numeric precision / formatting logic

Only one place: `formatBound()` in `device-calibration-parameters-ui.tsx` (line 64) hard-codes `maximumFractionDigits: 4` for displaying tolerance bounds. There is **no per-parameter precision concept anywhere** in the codebase. No rounding/quantisation of stored values.

### 1.6 Existing measurement / result logic consuming DeviceCalibrationParameter

**None.** `grep` across `apps/api/src` for consumers outside the parameter module returns only `app.module.ts` (module registration). There is no Measurement, Result, Reading, or Technician-App entity referencing `DeviceCalibrationParameter` yet. → Adding `decimalPlaces` now has **zero downstream architectural conflict**; a future measurement-entry feature can read `parameter.decimalPlaces` directly.

### 1.7 Does decimal precision already exist under another name?

**No.** Searched: `decimalPlaces`, `decimal_places`, `precision`, `scale`, `fractionDigits`, `dp`, `rounding`. The only decimal-related artefacts are the `@db.Decimal(18,4)` column types and the display-only `maximumFractionDigits: 4`. No equivalent field exists — a new field is justified, no duplication risk.

---

## 2. Additional audit checks (explicitly required by brief)

### Check A — `valueType` interaction

Live query against `pkmdb` (`localhost:5432`) on 2026-08-29:

| valueType | rows |
|---|---:|
| `NUMBER` | 486 |
| `RATIO` | 2 |
| `BOOLEAN` | 1 |
| `TEXT` | 0 |
| **Total** | **489** |

(The brief expected "one known `RATIO` row — `VENT_IE_RATIO`"; there are actually **2** RATIO rows and **1** BOOLEAN row now. Seed comments reference `VENT_IE_RATIO` and a magnification-ratio parameter.)

**Proposed handling:** `decimalPlaces` is **nullable** and only meaningful for `valueType = NUMBER`. Migration backfills a uniform `decimalPlaces` **only for `NUMBER` rows** (initially `2`, then revised to `0` in follow-up migration `20260829020000` at the product owner's request); `RATIO` / `TEXT` / `BOOLEAN` rows keep `decimalPlaces = NULL`. Validation (see §6) rejects a non-null `decimalPlaces` on a non-`NUMBER` parameter and rejects create/update that sets `valueType` away from `NUMBER` while leaving `decimalPlaces` populated. The edit UI hides/disables the Decimal Places field unless `valueType === "NUMBER"`.

### Check B — column precision conflict (`toleranceMin` / `toleranceMax` are `Decimal(18,4)`)

Live query: of **410 rows** with a non-null tolerance bound, the **maximum number of fractional digits actually stored today is 2**. No existing value is anywhere near the 4-digit column limit, so **there is no silent-truncation happening now**.

**Analysis:** `decimalPlaces` as defined by the business rule describes the precision of the **measured calibration result** — a field that **does not exist yet**. It does **not** retroactively require more capacity in `toleranceMin/Max`, because:
1. Today's tolerance data uses ≤ 2 dp.
2. `Decimal(18,4)` already holds 4 dp; a parameter needing a *result* precision of 5 dp does not imply its *tolerance bounds* need 5 dp (bounds are typically coarser than the reading).

**Decision required from you (flagged, not silently resolved):** If, during the later accurate-values backfill, any parameter turns out to need tolerance **bounds** expressed to 5+ dp (e.g. a leakage-current limit like `0.00005`), then `toleranceMin/Max` must be widened (`Decimal(18,6)` or similar) in a **separate migration** at that time. **This report does NOT widen the tolerance columns** — current data does not warrant it, and widening now would be speculative. Recommendation: leave `Decimal(18,4)`; revisit only if the backfill surfaces a real 5-dp bound.

---

## 3. Database target — CONFIRMED

The product owner confirmed on 2026-08-29 that `.env` `DATABASE_URL` → `postgresql://…@localhost:5432/pkmdb?schema=public` **is the local native development PostgreSQL database**. Production migrations are applied separately during deployment via the production Docker Compose workflow and `prisma migrate deploy` — `prisma migrate dev` is **not** run against production.

The migrations were applied to this local dev DB only (see §3a / §8).

### 3a. Migrations performed

```
$ prisma migrate dev  (DATABASE_URL = localhost:5432/pkmdb)
Applying migration `20260829010628_add_decimalplaces_to_device_calibration_parameter`
Applying migration `20260829020000_set_decimalplaces_uniform_default_zero`
The following migration(s) have been applied.
Your database is now in sync with your schema.
$ prisma generate  → Prisma Client regenerated (v6.19.3)
```

Two migrations were applied (the first seeded `2` as the uniform default; the
product owner then asked for `0`, so a follow-up migration
`20260829020000_set_decimalplaces_uniform_default_zero` revised it):

```sql
-- 20260829020000_set_decimalplaces_uniform_default_zero
UPDATE "DeviceCalibrationParameter"
  SET "decimalPlaces" = 0
  WHERE "valueType" = 'NUMBER' AND "decimalPlaces" = 2;
```

Post-migration verification query against `pkmdb`:

| valueType | decimalPlaces | rows |
|---|---|---:|
| NUMBER | 0 | 486 |
| RATIO | NULL | 2 |
| BOOLEAN | NULL | 1 |
| **Total** | | **489** (unchanged from pre-migration) |

No rows deleted, no existing column altered, no parameter definition changed.

---

## 4. Proposed data model change (minimal)

Add **one nullable column** to `DeviceCalibrationParameter`. Nothing else changes. `decimalPlaces` stays on the parameter — **never** on `DeviceType`.

```prisma
model DeviceCalibrationParameter {
  // ...existing fields unchanged...
  toleranceNote    String?
  decimalPlaces    Int?     // digits after the decimal point for NUMBER results; NULL for RATIO/TEXT/BOOLEAN or unset
  createdAt        DateTime @default(now())
  // ...
}
```

Rationale for `Int?` (nullable, no DB default):
- Nullable cleanly represents "not applicable" (non-NUMBER). Existing NUMBER rows are backfilled to a uniform `0` by migration (accurate values are the deferred follow-up).
- No DB-level `DEFAULT` clause — the backfill value is set explicitly by migration, so it can be revised by a follow-up migration (as it was: `2` → `0`).
- `Int` (not `SmallInt`) matches the project's existing convention of plain scalar types; a CHECK constraint (`decimalPlaces BETWEEN 0 AND 10`) is added in the migration to bound it.

### Migration SQL (as applied)

`packages/db/prisma/migrations/20260829010628_add_decimalplaces_to_device_calibration_parameter/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "DeviceCalibrationParameter" ADD COLUMN "decimalPlaces" INTEGER;

-- Bound the value (0..10) without forcing a default
ALTER TABLE "DeviceCalibrationParameter"
  ADD CONSTRAINT "DeviceCalibrationParameter_decimalPlaces_range"
  CHECK ("decimalPlaces" IS NULL OR ("decimalPlaces" >= 0 AND "decimalPlaces" <= 10));

-- Backfill ONE SAFE UNIFORM DEFAULT for existing NUMBER rows only.
UPDATE "DeviceCalibrationParameter"
  SET "decimalPlaces" = 2
  WHERE "valueType" = 'NUMBER' AND "decimalPlaces" IS NULL;
```

`packages/db/prisma/migrations/20260829020000_set_decimalplaces_uniform_default_zero/migration.sql` (follow-up, per product-owner request):

```sql
-- Revise the uniform decimalPlaces backfill from 2 to 0 for all NUMBER rows.
-- Accurate per-parameter values remain a separate follow-up task.
UPDATE "DeviceCalibrationParameter"
  SET "decimalPlaces" = 0
  WHERE "valueType" = 'NUMBER' AND "decimalPlaces" = 2;
```

**Preservation:** only `ADD COLUMN` + `UPDATE`s. No row deleted, no existing column altered, no parameter definition changed. Final state: 486 NUMBER rows → `decimalPlaces = 0`; 3 non-NUMBER rows → `NULL`.

**Note on the two migrations:** migration `20260829010628` had already been applied to the local dev DB before the `0` decision, so rather than editing an applied migration (checksum drift) a small follow-up migration was added. Both run in order on production's first `prisma migrate deploy` — net result is `0`, no intermediate state is user-visible. A future consolidation could fold them if desired before production, but it isn't required.

---

## 5. Proposed API / service changes

**`packages/shared/src/schemas/index.ts`**
- `deviceCalibrationParameterCreateSchema`: add `decimalPlaces: z.preprocess(<coerce ""/null → null>, z.number().int().min(0).max(10).nullable().optional())`.
- `deviceCalibrationParameterUpdateSchema`: same field, optional.
- New `superRefine`: if `decimalPlaces != null` then the effective `valueType` must be `NUMBER` (create: `valueType` isn't in the payload today and defaults to NUMBER server-side, so this mainly guards future use; update: cross-check against the loaded row in the service).
- `DEVICE_CALIBRATION_PARAMETER_SORTABLE_FIELDS`: unchanged (no need to sort by decimalPlaces).

**`device-calibration-parameters.service.ts`**
- `create`: pass `decimalPlaces: input.decimalPlaces ?? null` into `prisma.create`.
- `update`: `...(input.decimalPlaces !== undefined ? { decimalPlaces: input.decimalPlaces } : {})`.
- New guard `assertDecimalPlacesValidForValueType(decimalPlaces, valueType)` → `BadRequestException({ code: "INVALID_DECIMAL_PLACES_FOR_VALUE_TYPE" })` when `decimalPlaces != null && valueType !== "NUMBER"`. Called in `create` and `update` (update resolves `valueType` from the existing row).
- `parameterInclude` / `DeviceCalibrationParameterWithRelations`: `decimalPlaces` is a scalar on the base model, so it's already returned — no include change.

**Response shape:** `decimalPlaces` appears automatically in every existing endpoint's JSON once the column exists and Prisma client is regenerated.

---

## 6. UI/UX changes (implemented)

### 6.1 List / browse view — Expandable / Collapsible Table Grouped by Device Type

The old page (`DeviceCalibrationParameterFilters` — 4 cascading comboboxes — + a flat 1140px `DeviceCalibrationParameterTable`) is replaced by **one screen**: a single search box plus an **expandable / collapsible table grouped by Device Type**. This is a real `<table>` (multiple `<tbody>` sections, one per Device Type), not a card-style accordion.

```
[ Cari device type atau parameter… ]

DEVICE TYPE              KATEGORI            JUMLAH
──────────────────────────────────────────────────────────────────────
▾ Bed Side Monitor       Pemantauan Pasien   13 parameter
   Capability                       Parameter        UOM   Decimal  Tolerance        ⋯
   Keselamatan Listrik              Arus Bocor …     µA       2      ≤ 50 µA          Edit
   Tekanan Darah Non-Invasif (NIBP) Diastole         mmHg     2      ± 5 mmHg         Edit
   Pemantauan Tanda Vital           Heart Rate       bpm      2      ± 5 bpm          Edit
   …
▸ Dental Unit            Peralatan Gigi      8 parameter
▸ Tensimeter             …                   6 parameter
```

- **Only Device Type rows expand/collapse.** There is exactly one expandable level — `Device Type → its Calibration Parameters`. Capability is **not** a nested expandable level; it is a plain column on each child row.
- **Parent row** = Device Type only: `Device Type | Kategori (device category name) | N parameter`. A Device Type whose parameters span multiple Capabilities (e.g. Bed Side Monitor → Keselamatan Listrik + NIBP + Pemantauan Tanda Vital) is **not** forced into a single Capability — the parent row just represents the Device Type; Capability lives in the child rows.
- **Child rows** (shown when expanded): `Capability | Parameter | UOM | Decimal | Tolerance | Action(Edit)`. Non-NUMBER parameters show a small `RATIO`/`BOOLEAN` badge next to the name. No existing parameter information was dropped — full detail (code, description, value type, etc.) remains on the View/Edit screen.
- **Endpoint:** new `GET /device-calibration-parameters/grouped?search=&page=&pageSize=` returns `{ data: { deviceType, categoryName, count, parameters[] }[], page, pageSize, total, totalPages, totalParameters, totalDeviceTypes }` — the **standard MEDCAL list response shape**. Server-side search (`search` param) matches device type name/code + parameter name/code + capability/UOM/tolerance-note, against the **current live `name` values** (Indonesian + kept-English).
- **Pagination — reuses the existing MEDCAL pattern exactly** (`PaginationBar` from `leads-ui`: "Baris per halaman [10]" selector, "Halaman X dari Y · Total: N device type", Sebelumnya / Berikutnya; same `page`/`pageSize` URL-query conventions; default page size 10). **Pagination is applied at the Device-Type (parent-row) level** — the service fetches all matching parameters, groups them, then slices the *groups*. A Device Type and **all** of its parameters always stay together on one page; children are never split across pages. `total` / `totalPages` are the device-type-group counts (what drives the page navigation); the secondary line "`489 parameter dalam 51 device type`" shows the parameter and device-type totals across the whole result.
- **Expansion behaviour:** nothing expanded by default (avoids an unnecessarily long page). Expanded Device Type ids are kept in the URL (`?expanded=`). When a search is active, every Device Type on the current (already search-filtered) page is auto-expanded so matches are visible without manual clicks (§7 of the brief).
- Uses existing design-system primitives only (`Surface`, `PageHeader`, `Input`+`Search`, `Badge`, `Button`, `PaginationBar`, `cn`, lucide `ChevronRight`/`ChevronDown`). No new visual language; no new pagination mechanism; no pagination inside a Device Type.

### 6.2 Create form — **DeviceCapabilityItem linkage PRESERVED (not simplified away)**

`decimalPlaces` is added as a numeric field. The Capability → Capability Item selection **stays** — it is a required FK. Simplification applied only to *presentation*:
- Device Type is prefilled (`?deviceTypeId=`) from the "Tambah parameter untuk …" link in the expanded Device Type row (still changeable).
- Capability and Capability Item pickers are **auto-scoped to the chosen Device Type** (query `DeviceCapabilityItem`s already linked to that Device Type's existing parameters, plus a "show all" escape hatch), instead of two unrelated global dropdowns.
- The underlying `capabilityItemId` is still selected and still POSTed. `buildDeviceCalibrationParameterCreatePayload` gains `...(dp !== "" ? { decimalPlaces: Number(dp) } : {})`.

**A create flow that cannot set `capabilityItemId` is explicitly NOT part of this design.**

### 6.3 Edit form — Capability context — **DECIDED: READ-ONLY** (confirmed 2026-08-29)

**Current behaviour (audited):** `[id]/page.tsx` in *edit* mode renders Device Type / Capability / Capability Item as **editable comboboxes** (`DeviceCalibrationParameterFormFields` is shared with create). View mode is read-only.

**Decision (product owner):** In edit mode, **Device Type, Capability, and Capability Item are all read-only**, shown as a single clear breadcrumb:

```
Bed Side Monitor › Vital Signs › Heart Rate
```

MEDCAL's first user experience deliberately does **not** let users alter the structural hierarchy while editing a parameter — users should first become familiar with the existing MEDCAL structure. **No re-parenting workflow and no "Change capability link" toggle** at this stage; if a real re-parenting need emerges from actual usage it will be designed separately.

Editable in edit mode (the parameter's own attributes only): **Code, Name, UOM, Tolerance (min/max/note), Decimal Places, Description.**

**Implementation approach:** the shared `DeviceCalibrationParameterFormFields` gains a `mode: "create" | "edit"` prop. In `edit` mode it renders the Device Type / Capability / Capability Item section as the read-only breadcrumb instead of the three comboboxes; `deviceTypeId` / `capabilityId` / `capabilityItemId` remain in form state (update payload and unique triplet unchanged) but are not user-editable. `create` mode keeps the device-type-scoped pickers from §6.2.

The edit form gains a **`Decimal Places`** number input (min 0, max 10), shown only when `valueType === "NUMBER"`, with helper text *"Jumlah digit di belakang koma untuk hasil pengukuran parameter ini (0–10)."* and a value-neutral placeholder `0–10` (changed from `mis. 5` after review, so the empty-state hint doesn't imply a specific number while every backfilled row reads `0`).

### 6.4 Search — verified against current live `name` values

`GET /device-calibration-parameters/grouped?search=` runs a Postgres `contains` / `mode: "insensitive"` `OR` across: parameter `code` + `name`, `deviceType` `name` + `code`, `capabilityItem` `name`/`code` + its `capability.name`, `uom` `name`/`code`/`symbol`, and `toleranceNote`. Verified against data read fresh from `pkmdb` on 2026-08-29:

- `search="Heart Rate"` (kept-English) → 4 device types / 4 params; Bed Side Monitor first, its `Heart Rate` row shown.
- `search="keselamatan listrik"` (Indonesian) → 48 device types / 192 params.
- `search="tensimeter"` (device type) → returns the Tensimeter group with all its parameters.

Every Device Type on the current page is auto-expanded when a search is active so matches are visible without a manual click.

### 6.6 Pagination — existing MEDCAL pattern kept

The redesigned page reuses `PaginationBar` (from `leads-ui`) unchanged — same "Baris per halaman [10]" selector, same "Halaman X dari Y · Total: N device type" line, same Sebelumnya / Berikutnya buttons, same `page`/`pageSize` URL-query conventions, same `PAGE_SIZE_OPTIONS`. No new pagination mechanism was introduced.

**Granularity: Device-Type (parent-row) level.** Because parameter-level pagination would split one Device Type's child rows across pages, the service groups *all* matching parameters first, then paginates the *groups*. Verified: `pageSize=10` over 51 device types → 6 pages, and `Audiometer` (9 params) appears with all 9 params loaded on its page — no group is ever split. The parameter total (489) and device-type total (51) are shown in the secondary "`… parameter dalam … device type`" line.

### 6.5 Files changed (portal) — see §8 for the full list

- `device-calibration-parameters-ui.tsx` — `DeviceCalibrationParameterSearchBar` + `DeviceTypeParameterTable` (expandable/collapsible `<table>`, one `<tbody>` per Device Type; parent row Device Type / Kategori / Jumlah; child rows Capability / Parameter / UOM / Decimal / Tolerance / Edit) + `formatDecimalPlaces`; re-exports `PaginationBar`; removed `FilterCombobox` / `DeviceCalibrationParameterFilters` / old flat `DeviceCalibrationParameterTable`.
- `device-calibration-parameters-page-client.tsx` — grouped data + expand/collapse state + `PaginationBar`; URL state = `search`, `expanded`, `page`, `pageSize`.
- `use-device-calibration-parameters-query.ts` — `useDeviceCalibrationParameterGroups({ search, page, pageSize })`.
- `device-calibration-parameter-form-fields.tsx` — `mode` prop, read-only breadcrumb in edit, `decimalPlaces` input + validation + payloads + error copy.
- `new/page.tsx` — `mode="create"`, prefill `deviceTypeId` from `?deviceTypeId=`.
- `[id]/page.tsx` — `mode="edit"` + `valueType`, Decimal Places detail row, `decimalPlaces` in form mapping.

---

## 7. Validation changes

| Layer | Rule |
|---|---|
| Zod (`packages/shared`) | `decimalPlaces` optional, integer, `0 ≤ n ≤ 10`, nullable; `""`/`null` coerced to `null`. Cross-field: non-null `decimalPlaces` ⇒ NUMBER. |
| Service | `assertDecimalPlacesValidForValueType()` — rejects non-null `decimalPlaces` on non-NUMBER rows (`INVALID_DECIMAL_PLACES_FOR_VALUE_TYPE`). |
| DB | `CHECK ("decimalPlaces" IS NULL OR 0..10)`. |
| Portal form | `validateCalibrationToleranceForm`-style guard: empty ⇒ omit; non-integer or out-of-range ⇒ inline error "Decimal places harus bilangan bulat 0–10". Field hidden unless `valueType === "NUMBER"`. |
| Error copy | `formatDeviceCalibrationParameterApiError`: map `INVALID_DECIMAL_PLACES_FOR_VALUE_TYPE` → "Decimal places hanya berlaku untuk parameter bertipe NUMBER." |

---

## 8. Files changed (actual)

```
packages/db/prisma/schema.prisma                                                    +5   decimalPlaces Int? + comment
packages/db/prisma/migrations/20260829010628_add_decimalplaces_to_device_calibration_parameter/migration.sql   NEW  ADD COLUMN + CHECK + backfill (uniform 2)
packages/db/prisma/migrations/20260829020000_set_decimalplaces_uniform_default_zero/migration.sql              NEW  revise uniform backfill 2 -> 0 for NUMBER rows
packages/shared/src/schemas/index.ts                                                +35  optionalDecimalPlaces preprocessor; decimalPlaces on create+update schemas; deviceCalibrationParameterGroupedQuerySchema (search + page + pageSize)
apps/api/.../device-calibration-parameters.service.ts                               ~+135/-58  buildSearchWhere() helper; assertDecimalPlacesValidForValueType(); decimalPlaces in create/update; findAllGroupedByDeviceType() — group, then paginate groups; per-group categoryName lookup; grouped result types w/ page/pageSize/total/totalPages
apps/api/.../device-calibration-parameters.controller.ts                            +16  GET /grouped (declared before GET /:id)
apps/api/.../device-calibration-parameters.service.test.ts                          +160 6 new tests (decimalPlaces persist/default/clear/guard/schema-range; grouped + Device-Type-level pagination keeps groups intact)
apps/portal/.../device-calibration-parameters-ui.tsx                                rewrite  removed FilterCombobox/Filters/Table; added SearchBar, DeviceTypeParameterTable (expandable/collapsible, grouped by Device Type), formatDecimalPlaces; re-exports PaginationBar
apps/portal/.../device-calibration-parameters-page-client.tsx                       rewrite  grouped expandable-table view + PaginationBar; URL state = search + expanded + page + pageSize
apps/portal/.../device-calibration-parameter-form-fields.tsx                        +203/-... mode "create"|"edit"; read-only breadcrumb in edit; Decimal Places input; validate + build payload + error copy
apps/portal/.../use-device-calibration-parameters-query.ts                          +22  useDeviceCalibrationParameterGroups({ search, page, pageSize })
apps/portal/.../new/page.tsx                                                        +10  mode="create"; prefill deviceTypeId from ?deviceTypeId=
apps/portal/.../[id]/page.tsx                                                       +14  mode="edit" + valueType; Decimal places detail row; decimalPlaces in emptyForm/formFromRow
(regenerated) node_modules/.prisma/client + @medcal/db types
```

Seed scripts — **not changed**; they may optionally set `decimalPlaces` later during the accurate-values task.
The legacy `GET /device-calibration-parameters` paginated list endpoint and its `useDeviceCalibrationParameters` hook are **left in place** (still used by nothing in the new UI, but harmless and available for API consumers); only the list *page* was redesigned.

---

## 9. Tests / checks executed

**Audit-phase live-DB checks** (`pkmdb`):

| Check | Result |
|---|---|
| `groupBy valueType` | 486 NUMBER / 2 RATIO / 1 BOOLEAN / 0 TEXT (489 total) |
| tolerance precision scan (410 rows) | max 2 fractional digits in use → no truncation, no column-widening needed |
| device-type coverage | 51 of 59 device types have ≥1 parameter |
| `name` sample | mixed ID/EN confirmed; `contains`/`insensitive` search covers both |
| grep for existing precision field / measurement consumers | none — new field justified, no downstream conflict |

**Post-implementation checks:**

| Check | Result |
|---|---|
| `prisma migrate dev` on local `pkmdb` | ✅ applied; DB in sync |
| Row preservation | ✅ 489 before → 489 after; after both migrations 486 NUMBER → `dp=0`, 3 non-NUMBER → `NULL` |
| Follow-up migration `20260829020000` | ✅ applied to local `pkmdb`; `groupBy` confirms 486 NUMBER rows now `decimalPlaces = 0` |
| `pnpm --filter @medcal/shared typecheck` | ✅ pass |
| `pnpm --filter @medcal/api typecheck` | ✅ pass |
| `pnpm --filter @medcal/portal typecheck` | ✅ pass |
| `pnpm --filter @medcal/api build` (`tsc`) | ✅ pass |
| `pnpm --filter @medcal/portal build` (Next.js) | ✅ Compiled successfully; the 3 param routes render |
| `@medcal/shared` vitest | ✅ 21/21 pass |
| device-calibration-parameters vitest (module) | ✅ 21/21 pass (6 new: dp persist / default-null / update+clear / non-NUMBER guard / schema range 0..10; grouped-by-device-type; **Device-Type-level pagination keeps each group's parameters together**) |
| Full `@medcal/api` vitest | 586 pass / **8 fail** — all 8 in unrelated modules (`emails/imap-sync`, `push-tokens/notification-dispatch`, `contact-messages/push`); pre-existing, caused by a stale `@medcal/notifications` build in the local env (`push.resolvePushIconUrl is not a function`). Not touched by this change. |
| Runtime smoke: `findAllGroupedByDeviceType({page,pageSize})` | ✅ `pageSize=10` → `total=51`, `totalPages=6`, `totalParameters=489`, 10 groups/page; page 2 has 10 distinct groups; `Audiometer` (count 9) loads all 9 params on its page — **no group split** |
| Runtime smoke: search + pagination | ✅ `"keselamatan listrik"` → `total=48`, `totalPages=5`, `totalParameters=192` (Indonesian); `"Heart Rate"` → 4 params / 4 device types, Bed Side Monitor first (kept-English) |
| Pagination pattern | ✅ reuses `PaginationBar` from `leads-ui` unchanged (page-size selector, "Halaman X dari Y · Total: N device type", Sebelumnya/Berikutnya); `page`/`pageSize` URL-query conventions; no new mechanism |
| Grouping check (multi-capability device type) | ✅ Bed Side Monitor's parameters span Keselamatan Listrik + NIBP + Pemantauan Tanda Vital — parent row shows only the Device Type; capability is per child row (no forced single capability) |
| API JSON shape | ✅ `decimalPlaces` returned by findOne / grouped; grouped payload = `{ deviceType, categoryName, count, parameters[] }[]` |
| List UI form | ✅ real `<table>` with one `<tbody>` per Device Type + parent/child `<tr>` rows (not a card accordion); verified in Next.js production build |
| Edit-mode read-only | ✅ `mode="edit"` renders the `Device Type › Capability › Capability Item` breadcrumb ("Konteks (tidak dapat diubah)"); the 3 hierarchy comboboxes are not rendered; only Code/Name/UOM/Tolerance/Decimal Places/Description editable |

---

## 10. Assumptions

1. `localhost:5432/pkmdb` in `.env` is the local native dev DB — **confirmed by product owner** 2026-08-29.
2. A uniform default for existing NUMBER rows is acceptable as a structural placeholder (brief Phase 2). Value applied: **`0`** (initially `2`, revised to `0` at the product owner's request via a follow-up migration).
3. `0..10` is a sufficient range for `decimalPlaces` (business examples cite 1 and 5); enforced by Zod + DB CHECK.
4. A dedicated `GET /device-calibration-parameters/grouped` endpoint returns the standard MEDCAL list response, **paginated at the Device-Type level** so groups stay coherent. The service loads all matching parameters per request to build correct groups before slicing — acceptable at 489 rows; if the parameter count grows very large this is the place to optimise (e.g. a two-query approach: page the device-type ids, then fetch only those groups' parameters).
5. Device Type / Capability / Capability Item are read-only (breadcrumb) in the *edit* form — **confirmed** by product owner 2026-08-29; no re-parenting workflow at this stage (§6.3).
6. `RATIO`/`TEXT`/`BOOLEAN` parameters legitimately have no decimal precision and `NULL` is the correct representation.

---

## 11. Remaining concerns before moving to Tariff / Equipment

1. **Accurate per-parameter `decimalPlaces` values are NOT done.** This task delivers only the *structure* (column, migration, validation, UI to view/edit). Populating real values (Bed Side Monitor = 5, Tensimeter = 1, …) by re-verifying against the ~50 LK source documents is a **separate, larger follow-up** — comparable to the tolerance-backfill effort — and is **explicitly deferred**. Do not treat the uniform `decimalPlaces = 0` on every NUMBER row as "correct data."
2. **Tolerance column precision (§2B)** — left at `Decimal(18,4)`. If the accurate-values backfill surfaces any parameter whose tolerance *bounds* need 5+ dp, a follow-up migration to widen `toleranceMin/Max` is required. Flagged, not silently resolved.
3. **`valueType` is not settable via the API** (only via seed). If NUMBER↔RATIO reclassification becomes a real need, the create/update path must be extended — out of scope here but worth noting since `decimalPlaces` validity depends on `valueType`.
4. **Edit-form re-parenting workflow** (§6.3) — *resolved*: intentionally not built now. Device Type / Capability / Capability Item are read-only in edit. Revisit only if real usage surfaces a re-parenting need.
5. **Measurement / Technician App** — deliberately untouched. The design leaves `parameter.decimalPlaces` trivially consumable by a future measurement-entry feature (no consumers exist today). No hard-coded `if deviceType == …` rules introduced anywhere.

---

## 12. Deliverable checklist (per brief §DELIVERABLE)

1. **Audit** — §1, §2 (A: valueType 486 NUMBER / 2 RATIO / 1 BOOLEAN / 0 TEXT; B: no current tolerance-precision conflict, columns left at `Decimal(18,4)`, conflict path flagged).
2. **Data model changes** — §4: one nullable `decimalPlaces Int?` + `CHECK (0..10)`; nothing else; not on `DeviceType`.
3. **Migration** — §3a: `20260829010628_add_decimalplaces_...` + follow-up `20260829020000_set_decimalplaces_uniform_default_zero`, both applied to **local dev DB `pkmdb`** (product-owner-confirmed). Uniform default **`0`** on the 486 existing NUMBER rows (first migration set `2`, follow-up revised to `0`), `NULL` for the 3 non-NUMBER rows; 489/489 rows preserved.
4. **API/service changes** — §5, §8: `decimalPlaces` through create/update; `assertDecimalPlacesValidForValueType`; new `GET /device-calibration-parameters/grouped`.
5. **UI/UX changes** —
   - **Create form: `DeviceCapabilityItem` linkage PRESERVED** — the Capability + Capability Item pickers still exist and `capabilityItemId` is still required & POSTed; only presentation simplified (device-type prefilled from the expanded Device Type row via `?deviceTypeId=`). Not simplified away.
   - **Edit form: hierarchy is READ-ONLY** — Device Type / Capability / Capability Item shown as a `A › B › C` breadcrumb ("Konteks (tidak dapat diubah)"); the three combobox editors are not rendered in `mode="edit"`. Only Code, Name, UOM, Tolerance (min/max/note), Decimal Places, Description are editable. No re-parenting workflow / no "Change capability link" toggle (per product-owner decision §6.3 — deliberate for MEDCAL's first user experience).
   - **List/browse: redesigned as an Expandable / Collapsible Table Grouped by Device Type** — one screen, one search box (device type OR parameter). Real `<table>`, one `<tbody>` per Device Type (not a card accordion). Parent row: `Device Type | Kategori | N parameter`, chevron toggles expand/collapse (only Device Type expands — no nested Capability level). Child rows: `Capability | Parameter | UOM | Decimal | Tolerance | Edit`. Capability / Capability Item / UOM removed as top-level filters. Nothing expanded by default; searching auto-expands every matched Device Type on the page. Search verified against **current live `name` values** (Indonesian + kept-English).
   - **Pagination: existing MEDCAL pattern kept** (`PaginationBar`, page-size selector, "Halaman X dari Y · Total: N device type", `page`/`pageSize` query conventions) — paginated at the Device-Type (parent-row) level so a Device Type and all its parameters stay on one page; children are never split (§6.6).
6. **Validation changes** — §7: Zod `int 0..10 nullable`; portal inline check "Decimal places harus bilangan bulat 0–10"; service `INVALID_DECIMAL_PLACES_FOR_VALUE_TYPE`; DB CHECK.
7. **Files changed** — §8.
8. **Tests/checks** — §9 (21/21 module, 21/21 shared, builds pass; 8 unrelated pre-existing api failures noted).
9. **Assumptions** — §10.
10. **Remaining concern / deferred confirmation** — §11. **Confirmed: accurate per-parameter `decimalPlaces` values (beyond the uniform `0`) are a follow-up task and were NOT done here.**

## 13. Done / not done

**Done:** structure (field + CHECK), 2 migrations on local dev DB (uniform default backfilled, then revised `2` → `0`), API + paginated grouped endpoint (per-group `categoryName`, standard MEDCAL list response), Zod + service + DB validation, list page rebuilt as an Expandable / Collapsible Table Grouped by Device Type with the existing `PaginationBar` at the Device-Type level, create form (linkage preserved) + edit form (hierarchy read-only breadcrumb) + Decimal Places field, unit tests, typecheck + build.

**Not done (by design / deferred):**
- Accurate per-parameter decimal values from the 50 LK worksheets — separate follow-up.
- Tolerance column widening — not needed now; revisit only if a 5-dp *bound* appears.
- Measurement Entry / Technician App consumption of `decimalPlaces` — left architecturally ready, not built.
- Tariff / Equipment / Inventory / Quotation / Invoice / scheduling — untouched, out of scope.
