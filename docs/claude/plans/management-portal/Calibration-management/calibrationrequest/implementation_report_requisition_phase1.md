# MEDCAL — Requisition Phase 1 Implementation Report

**Requisition Device Data Refinement**
Date: 2026-08-29
Scope: `CalibrationRequest` / `CalibrationRequestItem` only. Additive schema + data refinement.

---

## 1. Business Context

At the Requisition stage MEDCAL records **what the customer requested**, in the
customer's own terms. The customer may or may not provide a device identifier —
a clinic that does not run an asset register simply has none. The real physical
MEDCAL `Device` identity is only established later, on site, during the
`CalibrationJob` workflow.

This phase makes the Requisition item able to hold:

- the customer's **own name** for the equipment (`customerDeviceName`)
- the customer's **model** designation (`model`)
- a customer **device/inventory identifier** that is now **optional** (`deviceId`)

while keeping the mapped MEDCAL `DeviceType` (`deviceTypeId`) required and
unchanged.

Explicitly **not** in this phase: DeviceTypeAlias, Excel import, fuzzy matching,
quantity, Price List, Quotation / Work Order / CalibrationJob changes.

---

## 2. Before / After Schema

### Before

```prisma
model CalibrationRequestItem {
  id           String   @id @default(cuid())
  companyId    String
  requestId    String
  deviceTypeId String
  /// Customer-provided physical device identifier (free-text). Not a FK to Device.
  deviceId     String            // REQUIRED (NOT NULL)
  notes        String?
  createdAt    DateTime @default(now())
  ...
}
```

### After

```prisma
model CalibrationRequestItem {
  id           String   @id @default(cuid())
  companyId    String
  requestId    String
  deviceTypeId String
  /// Customer's original terminology / name for the equipment, preserved verbatim
  /// (e.g. "Tensimeter Digital" while the mapped DeviceType is "Sphygmomanometer").
  customerDeviceName String?      // NEW, nullable
  /// Customer-provided equipment model designation, if available (free-text).
  model        String?            // NEW, nullable
  /// Customer-provided physical device identifier (free-text). Not a FK to Device,
  /// and intentionally NULLABLE — a missing customer Device ID is a valid business
  /// state. Never store a fake placeholder. NOT the CalibrationJob Device.id.
  deviceId     String?            // CHANGED: String -> String?
  notes        String?
  createdAt    DateTime @default(now())
  ...
}
```

No columns dropped or renamed. No index changes. `deviceTypeId` FK to
`DeviceType` unchanged and still `RESTRICT`.

---

## 3. Device ID Semantics

`CalibrationRequestItem.deviceId` is a **customer-provided free-text identifier**
(inventory tag / asset number as the customer refers to it). It is:

- **NOT** a foreign key to `Device` (the FK was already removed in migration
  `20260826120000`; confirmed still absent).
- **Intentionally nullable.** A missing customer Device ID is a valid business
  state and is stored as SQL `NULL`.
- **Never** auto-filled with `"000"`, `"-"`, `"N/A"`, `"UNKNOWN"` or any other
  placeholder. The API coerces an empty/blank submission to `NULL`.
- **NOT** the future `CalibrationJob.deviceId` (`→ Device.id`). That physical
  device identity is assigned later in the technician workflow and is out of
  scope here. No conversion/linking mechanism was added.

---

## 4. Customer Device Name Semantics

`customerDeviceName` preserves the customer's original wording verbatim, e.g.
customer says "Tensimeter Digital" → `customerDeviceName = "Tensimeter Digital"`
while `deviceType` is the official MEDCAL master "Sphygmomanometer". Nullable and
optional. No alias table, no automatic matching, no fuzzy matching in this phase
— the user still selects `DeviceType` manually. Alias/mapping is deferred to the
Excel Import phase.

---

## 5. Model Semantics

`model` is customer-provided equipment model text (e.g. `AB-123`). Plain
nullable `String`, following the existing MEDCAL optional-text convention
(`Device.model`, `EquipmentType.category` etc.). It is **not** a relation to any
Model master and must not be confused with `DeviceType`, `EquipmentType`,
`Device.id`, or `Equipment.id`.

---

## 6. Existing Data Inspection

Inspected `pkmdb` (local) before migration:

| Metric | Value |
| --- | --- |
| Total `CalibrationRequestItem` rows | **3** |
| Rows with a non-empty `deviceId` | 3 |
| Rows with empty / null `deviceId` | 0 |
| Distinct `deviceId` values | 3 |
| Placeholder values detected (`000`, `-`, `N/A`, `UNKNOWN`, …) | **none** |
| Sample values | `PMT-19381=AXVER`, `BPM-019XC-1KD1`, `OMT-011-A192-193-WX` |

All three existing values are genuine customer identifiers. **No data was
rewritten.** No placeholder normalization was performed (and none is needed).
`customerDeviceName` and `model` are `NULL` for all pre-existing rows.

---

## 7. Migration

One additive migration:

```
packages/db/prisma/migrations/
  20260829102845_add_customer_device_name_model_nullable_device_id_to_calibration_request_item/
    migration.sql
```

```sql
-- AlterTable
ALTER TABLE "CalibrationRequestItem" ADD COLUMN     "customerDeviceName" TEXT,
ADD COLUMN     "model" TEXT,
ALTER COLUMN "deviceId" DROP NOT NULL;
```

- Applied to **local `pkmdb` only** via `prisma migrate dev`.
- `prisma migrate status` → "Database schema is up to date" (46 migrations).
- Post-migration column check confirms: `deviceId` `is_nullable = YES`;
  `customerDeviceName` and `model` present as nullable `text`.
- **Not** deployed to production.
- Fully reversible in principle (drop 2 columns, re-add NOT NULL) but no
  down-migration is generated by Prisma by convention.

---

## 8. API Changes

### `packages/shared/src/schemas/index.ts` — `calibrationRequestItemInputSchema`

```ts
const calibrationRequestItemInputSchema = z.object({
  deviceTypeId: z.string().min(1),                       // unchanged — REQUIRED
  customerDeviceName: z.string().trim().max(200).optional(),  // NEW
  model: z.string().trim().max(120).optional(),               // NEW
  deviceId: z.string().trim().max(120).optional(),            // CHANGED: was z.string().min(1)
  notes: z.string().max(1000).optional(),               // unchanged
});
```

Used by both `calibrationRequestCreateSchema` and `calibrationRequestUpdateSchema`
(no other change to those wrappers). No new endpoints. Response shape gains two
nullable string fields (`customerDeviceName`, `model`) and `deviceId` may now be
`null`.

### `apps/api/src/modules/calibration-requests/calibration-requests.service.ts`

`create()` and `update()` item mapping now writes the new fields and coerces
blank strings to `null`:

```ts
data: input.items.map((item) => ({
  companyId,
  requestId,
  deviceTypeId: item.deviceTypeId,
  customerDeviceName: item.customerDeviceName || null,
  model: item.model || null,
  deviceId: item.deviceId || null,
  notes: item.notes,
})),
```

Validation unchanged otherwise: `deviceTypeId` still validated against
`DeviceType` via `assertDeviceTypesExist`; no `Device` lookup by `deviceId`;
customer/lead/company checks untouched. RBAC (`@RequirePermission`,
`CompanyRoleGuard`), company scoping, and status rules all unchanged.

### Downstream null-safety type widening (necessary, non-behavioural)

Because Prisma now types `CalibrationRequestItem.deviceId` as `string | null`,
four hand-written type annotations that mirror it had to widen to
`string | null` so the API/portal typecheck stays green. **No logic changed** —
every consumer already null-guards (`?? "—"`, `if (deviceId)`):

- `apps/api/src/modules/work-orders/work-order-pdf.ts`
- `apps/api/src/modules/quotations/quotation-pdf.ts`
- `apps/api/src/modules/purchase-orders/purchase-order-pdf.ts`
- `apps/portal/src/app/management/quotations/quotations-ui.tsx` (`itemsFromRequest`
  helper param + `deviceIdLabel` now `?? "—"`)

---

## 9. UI Changes

### `apps/portal/.../calibration-requests/new/page.tsx` and `[id]/edit/page.tsx`

Per device row, the fields are now:

```
Device Type *          (unchanged — required, DeviceTypeItemSelect)
Nama Alat Customer      (new — optional, max 200)
Model                   (new — optional, max 120)
Device ID  (opsional)   (label lost its red asterisk; placeholder:
                         "Kosongkan jika customer tidak memberikan")
Notes                   (unchanged)
```

- `ItemInput` gained `customerDeviceName` and `model`; `emptyItem()` /
  `emptyItemInput()` updated; edit page hydrates the new fields from the
  loaded request (`item.customerDeviceName ?? ""`, `item.model ?? ""`,
  `item.deviceId ?? ""`).
- Client validation relaxed: a row is valid with just `deviceTypeId`. The error
  message changed from *"Setiap device wajib memiliki Device Type dan Device
  ID."* to *"Setiap device wajib memiliki Device Type."*
- Blank `customerDeviceName` / `model` / `deviceId` are sent as `undefined`
  (→ stored `NULL`).
- Section helper text updated to state the three fields are optional.

### `apps/portal/.../calibration-requests/[id]/page.tsx` (detail)

Each device card now shows, when present, `Customer name: …` and `Model: …`, and
renders the Device ID as:

```
Device ID: <value>            when provided
Device ID: Not provided       (muted) when null   ← no "000"
```

### `apps/portal/.../calibration-requests/calibration-requests-ui.tsx`

`CalibrationRequestItem` interface: added `customerDeviceName: string | null`
and `model: string | null`; `deviceId` widened to `string | null`.

No alias UI, no Excel import UI, no page redesign. Existing MEDCAL form/card
patterns followed.

---

## 10. Tests

`apps/api/src/modules/calibration-requests/calibration-requests.service.test.ts`
— added / updated:

Schema (`calibrationRequestCreateSchema items`):
1. accepts an item with **no `deviceId`** (only `deviceTypeId` + `customerDeviceName`)
2. accepts `customerDeviceName` + `model` (and empty-string `deviceId`)
3. renamed "required string" test → "free-text string" (still asserts it is not a lookup key)
4. existing "rejects missing `deviceTypeId`" (null / absent / empty) retained — `deviceTypeId` still required

Service (`CalibrationRequestsService.create`):
5. persists a **null `deviceId`** plus `customerDeviceName` + `model`
6. stores an **empty-string `deviceId` as `null`** (no placeholder)
7. still accepts a customer-provided free-text `deviceId`

Service (`CalibrationRequestsService.update`):
8. replaces items with `customerDeviceName` / `model` and a cleared (`null`) `deviceId`

Retained unchanged and still exercised: existing create/list/get/update/submit/
cancel happy paths, `DEVICE_TYPE_NOT_FOUND`, transaction rollback, document
numbering, and the two **tenant-isolation** tests (`findOne` / `findAll` scoped
by `companyId`).

No tests added for Excel Import / Alias / Qty (out of scope).

---

## 11. Verification

| Check | Result |
| --- | --- |
| `prisma validate` | ✅ "The schema is valid" |
| `prisma migrate dev` (local `pkmdb`) | ✅ migration `20260829102845_…` created & applied |
| `prisma migrate status` | ✅ "Database schema is up to date" (46 migrations) |
| Post-migration column inspection | ✅ `deviceId` nullable; `customerDeviceName`, `model` added |
| Existing data integrity | ✅ 3 rows intact, values unchanged |
| `prisma generate` | ✅ Prisma Client v6.19.3 regenerated |
| `@medcal/shared` typecheck | ✅ clean |
| `@medcal/api` typecheck | ✅ clean |
| `@medcal/api` build (`tsc -p`) | ✅ clean |
| `@medcal/api` tests (`vitest run calibration-requests`) | ✅ **28 passed** (incl. 8 new/updated) |
| `@medcal/portal` typecheck (`src/`) | ✅ no errors in `src/` |

### Notes on running the API tests

`vitest.setup.ts` primes env via `process.loadEnvFile("../../.env")`. In this
environment that call does not populate `process.env.DATABASE_URL` before the
Prisma client's first query, so **every** API test suite (not just this one)
fails at `beforeAll` with *"Environment variable not found: DATABASE_URL"* — a
pre-existing infra issue, reproduced on the untouched `quotations.service.test.ts`.
Workaround used for verification: export `DATABASE_URL` in the shell first —

```
$env:DATABASE_URL="postgresql://postgres:Afrbyu12@localhost:5432/pkmdb?schema=public"
pnpm --filter @medcal/api exec vitest run calibration-requests
```

With that, all 28 tests pass. Fixing `vitest.setup.ts` is out of scope for this
phase.

### Notes on the portal typecheck

`pnpm --filter @medcal/portal typecheck` reports ~10 `TS1005 / TS1109 / TS1161`
errors — **all** in `.next/dev/types/routes.d.ts` (a Next.js dev-server
generated file, caught mid-write while `pnpm dev` runs). Zero errors in
`apps/portal/src/`. Re-run with the dev server stopped for a fully green result.

The `prisma generate` EPERM lock from the running dev server (encountered
earlier) cleared on its own; the generate then succeeded.

---

## 12. Known Limitations

- `prisma generate` and the typecheck/build/test steps that depend on it were
  not run in this session (dev server file lock — section 11).
- Downstream **portal** response-DTO mirrors in the Quotation / PurchaseOrder /
  WorkOrder modules still annotate `requestItem.deviceId` as `string` (not
  `string | null`). They compile fine because every consumer already
  null-guards, and those modules were deliberately left untouched per scope.
  They should be widened to `string | null` when those modules are next
  revised.
- No backfill / cleanup of placeholder `deviceId` values was done — there are
  none in local data, but production has not been inspected (production
  deployment is out of scope for this phase).
- `customerDeviceName` is free text with no matching/normalization — by design;
  matching arrives with the Excel Import + Alias phase.

---

## 13. Deferred Scope (NOT implemented)

Confirmed **not** touched / created in this phase:

- ❌ `DeviceTypeAlias` model, alias CRUD, alias UI
- ❌ Excel Import — upload, parse, preview, mapping, commit
- ❌ Fuzzy / automatic DeviceType matching
- ❌ Quantity / `qty` field, qty-explosion logic
- ❌ `matchedBy` / `mappingConfidence` / `sourceType` traceability fields
- ❌ Price List
- ❌ Quotation schema / behavior / `QuotationItem`
- ❌ PurchaseOrder / Work Order / `WorkOrderAssignment` / Surat Jalan
- ❌ `CalibrationJob` / `JobReferenceEquipmentUsed`
- ❌ `Device` / `DeviceType` master (name, code, relations)
- ❌ Device registration from the technician app / `Device.id` linking
- ❌ `WorkOrderEquipment`
- ❌ RBAC / permissions / company-isolation architecture

The current chain is unchanged:

```
Requisition → Quotation → Work Order → Surat Jalan → Technician On Site
→ actual physical Device identification → CalibrationJob
```

---

## Final Response Summary

1. **What changed:** `CalibrationRequestItem` gained `customerDeviceName` and
   `model` (nullable), and `deviceId` became nullable. API zod schema, service
   create/update mapping, portal new/edit forms and detail view updated.
   Focused regression tests added. Four downstream type annotations widened to
   `string | null` for null-safety (no behaviour change).
2. **Schema changes:** `+customerDeviceName String?`, `+model String?`,
   `deviceId String → String?`. No drops/renames, no index changes.
3. **Migration:** `20260829102845_add_customer_device_name_model_nullable_device_id_to_calibration_request_item`
   — additive, applied to local `pkmdb` only, not production.
4. **Existing data:** 3 rows, all with real `deviceId` values, zero placeholders,
   nothing rewritten.
5. **API changes:** shared item schema (`deviceId` optional; `customerDeviceName`
   / `model` added), service writes new fields and coerces blanks to `null`. No
   new endpoints, no RBAC change.
6. **UI changes:** "Nama Alat Customer" + "Model" inputs added; Device ID marked
   optional (asterisk removed); detail view shows customer name / model and
   "Not provided" instead of a placeholder.
7. **Tests:** 8 added/updated (null `deviceId`, blank→null, new fields on
   create + update, `deviceTypeId` still required); isolation + existing flows
   retained.
8. **Verification:** `prisma validate` ✅, migration applied & DB columns
   confirmed ✅, `prisma generate` ✅, `@medcal/api` typecheck ✅, `@medcal/api`
   build ✅, `@medcal/shared` typecheck ✅, **28/28 calibration-requests tests
   pass** ✅ (with `DATABASE_URL` exported — see §11 for the pre-existing
   `vitest.setup.ts` env issue). Portal `src/` typecheck clean; the only portal
   errors are in the dev-server-generated `.next/dev/types/routes.d.ts`.
9. **Unexpected architectural issue:** none in the requisition model. Confirmed
   `CalibrationJob` creation code does not yet exist, so the free-text
   `deviceId` → physical `Device` seam remains unbuilt (already noted in the
   prior audit; nothing here depends on it).
10. **Explicit confirmation:** Excel Import, DeviceTypeAlias, Qty / Price List,
    Quotation, Work Order, and CalibrationJob were **NOT** implemented or
    modified.
