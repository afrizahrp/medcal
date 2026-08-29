# MEDCAL Phase 2 — Excel Import + DeviceType Alias: AUDIT & SIMULATION

## Context

Phase 1 (Requisition Device Data Refinement) is complete: `CalibrationRequestItem`
now has `customerDeviceName?`, `model?`, `deviceId?` (nullable), and still **no
`qty`**. The next capability the business wants is bulk device entry from a
customer Excel file (`Nama Alat | Model | Qty | Device ID`) plus a `DeviceTypeAlias`
concept so customer terminology ("Tensimeter") maps to the official master
("Sphygmomanometer").

Before building anything we must settle the **domain grain**: what one
`CalibrationRequestItem` represents, and therefore how Excel `Qty` should be
handled. The guardrail: *Qty in Excel ≠ `CalibrationRequestItem.qty`; Customer
Device ID ≠ `Device.id`.*

**This task produces one audit/simulation document. No code, schema, migration,
API, UI, RBAC, seed, or DB change.**

### Confirmed direction (user)

- **Qty**: report **firmly recommends Option B** (explode Qty=N → N device-granular
  rows, no `qty` column); A and C documented as rejected alternatives.
- **Phase 3 (section 20)**: **high-level outline only** — no detailed design sketch.
- **DeviceTypeAlias**: report **recommends it and bundles it with the Excel
  importer** (same implementation phase); minimal schema shown.

## Deliverable

Create `docs/claude/plans/Calibration-management/calibrationrequest/implementation_report_excel_import_alias_audit.md`
with the 20 sections listed in the prompt. Core content is already established by
the exploration below — execution is mostly transcription + building the
simulation tables.

---

## Exploration findings (established — go straight into the report)

### Current schema grain (packages/db/prisma/schema.prisma)

| Model | qty field | Key constraint | Grain |
|---|---|---|---|
| `CalibrationRequestItem` (1219–1246) | **none** | `@@index` only, no `@@unique` | ambiguous — "one customer equipment entry"; in the manual flow, one-per-device |
| `QuotationItem` (1305–1326) | `qty Decimal @default(1) @db.Decimal(18,4)` | `requestItemId` nullable FK, **no `@@unique`** | commercial/priced line |
| `PurchaseOrderItem` (1364–1391) | `qty Decimal @default(1)` | `@@unique([purchaseOrderId, quotationItemId])` | 1:1 copy of quotation item |
| `WorkOrderItem` (1429–1446) | `qty Decimal @default(1)` | `@@unique([workOrderId, purchaseOrderItemId])`; no device field | 1:1 snapshot of PO item |
| `CalibrationJob` (1467–1492) | none (implicit 1) | **`@@unique([workOrderId, deviceId])`**, `deviceId` REQUIRED FK → `Device.id` | strictly one job per physical Device |

- **`assertFullScopeItems()`** (apps/api/src/modules/quotations/quotations.service.ts:191–218):
  enforces a **strict bijection** — every `CalibrationRequestItem` of the request
  appears **exactly once** among quotation items (no dup → `DUPLICATE_REQUEST_ITEM`;
  no missing / unknown → `QUOTATION_SCOPE_MISMATCH`). App-level only; DB does not
  enforce it. Re-run on quotation `update()` (line 455).
- **`buildItemRows()`** (lines 220–253): quotation `qty` is **entered fresh**
  (`z.coerce.number().int().positive().optional()`, default `1` via `DEFAULT_QTY`);
  nothing is copied from the request item (there is no qty to copy). `description`
  also entered fresh.
- **PO → WO**: `purchaseOrderItem.createMany` and `workOrderItem.createMany` are
  **pure 1:1 copies**, `qty` copied verbatim, **no explode logic anywhere**
  (purchase-orders.service.ts:159–173, work-orders.service.ts:217–225).
- **CalibrationJob**: **no code anywhere creates one** — no `calibration-jobs`
  module; work-order tests assert zero jobs are created. `CalibrationJob.deviceId`
  needs a real `Device.id`; **no code creates a `Device` from a
  `CalibrationRequestItem` or `WorkOrderItem`**. The device-identity bridge is
  unimplemented. WorkOrder is the current end of the built chain.

### Alias / master data

- **No alias / synonym / normalized-name pattern exists anywhere** in schema or
  services.
- `DeviceType` (916–935): **global** (no `companyId`), `code` **globally unique**,
  **`name` NOT unique**. Same convention: `DeviceCategory`, `Uom`, `EquipmentType`,
  `DeviceModel` — all global.
- `DeviceModel` (1071–1084): child of `DeviceType`, `@@unique([deviceTypeId,
  manufacturer, model])` — the structural template for a `DeviceTypeAlias`.
- `CalibrationRequestItem.customerDeviceName` already stores the verbatim customer
  wording; the `deviceTypeId` mapping is supplied directly by the client and only
  existence-checked (`assertDeviceTypesExist`).

### DeviceType master API (apps/api/src/modules/device-types/)

- `POST/GET/GET :id/PATCH/DELETE /device-types`, guarded by `CompanyRoleGuard` +
  `@RequirePermission("deviceType", <action>)`.
- RBAC catalog: `deviceType: ["read","create","update","delete"]`
  (packages/auth/src/access-control.ts:58); ADMIN full, CUSTOMER_SERVICE read-only.
- `remove()` already blocks delete when referenced by `calibrationRequestItem`
  (`DEVICE_TYPE_HAS_CALIBRATION_REQUESTS`).
- List `search` matches `code` OR `name` (case-insensitive contains).

### Excel / file import

- **No spreadsheet import exists.** No `xlsx` / `exceljs` / `papaparse` / `csv-parse`
  dependency. No preview/confirm batch flow.
- Only file machinery: `FileInterceptor` single binary upload for evidence/docs
  (apps/api/src/modules/files/) — no content parsing.
- `FileOwnerType` enum already has an unused `REQUEST_ATTACHMENT` value (schema:263)
  — available for storing a raw uploaded Excel against a `CalibrationRequest.id`
  with no new enum.
- `DocumentType` enum already has `CALIBRATION_REQUEST` for numbering.

---

## Recommended position for the report

### Qty → **Option B: explode on import** (do NOT add a `qty` column)

One Excel row of `Qty = N` becomes **N `CalibrationRequestItem` rows**, each
carrying the same `customerDeviceName` / `model` / matched `deviceTypeId`, and
`deviceId` = the customer's per-unit ID or `NULL`.

Rationale:
1. The execution grain (`CalibrationJob`, `@@unique([workOrderId, deviceId])`) is
   **immutably device-granular**. Making the requisition device-granular aligns the
   **whole chain** to one grain and removes the 1→N fan-out from the still-unbuilt
   WorkOrder→Job seam (it becomes a clean 1:1: WorkOrderItem → 1 Device → 1 Job).
2. `assertFullScopeItems` bijection is preserved with **zero changes**.
3. Respects the guardrail — Excel `Qty` becomes **row multiplicity**, never a stored
   scalar.
4. Each row is the natural anchor for the future physical `Device` identity,
   per-unit notes, and per-unit customer Device ID.
5. Simplest reliable path; no new abstractions.

**Option A** (one row per Excel row) rejected: `Qty` has nowhere to live without a
new column; can't carry per-unit Device IDs; pushes an undesigned number-based
1→N fan-out into the WorkOrder→Job seam.

**Option C** (`CalibrationRequestLine` layer above `CalibrationRequestItem`)
rejected: duplicates what `QuotationItem` (priced line + numeric qty) already
provides one step later; new model + sync + UI cost; the architecture does not
justify it.

### Where Qty "lives" without a column

- Import **preview** column (user-visible, editable before commit).
- Post-commit: **count of sibling rows** sharing `(customerDeviceName, model,
  deviceTypeId)` in the request — derivable.
- Verbatim audit record: the **raw uploaded file** via `FileObject` +
  `FileOwnerType.REQUEST_ATTACHMENT` (existing enum value). Open decision D7.

### DeviceTypeAlias → **recommended, minimal, bundled with the importer**

```
DeviceTypeAlias {
  id, deviceTypeId FK -> DeviceType,
  alias String,               // as entered (display)
  normalizedAlias String,     // lower + trim + collapse-internal-whitespace
  isActive Boolean @default(true),
  createdAt, updatedAt
  @@unique([normalizedAlias])  // GLOBAL — one alias -> at most one DeviceType
  @@index([deviceTypeId])
}
```

- Global (mirrors `DeviceType`). Match **only** on `normalizedAlias` (case-insensitive
  by construction).
- `@@unique([normalizedAlias])` makes "same alias → two DeviceTypes" **impossible**;
  ambiguous terms simply get no alias and fall to manual mapping. **Do not** build
  multi-target alias resolution.
- Curated via the existing device-types module + `deviceType` RBAC (open decision D8).
- Build it **with** the importer — it has no other consumer (manual entry uses the
  DeviceType selector directly).

### Matching sequence

1. exact `DeviceType.name` (normalized) → `NAME`
2. exact `DeviceTypeAlias.normalizedAlias` → `ALIAS`
3. else → `UNMATCHED` (user must map before commit)

Fuzzy matching: **preview-only assist** (highlighted suggestion), **never
auto-commits**. Open decision D10.

### Preview → Confirm → Create (two-phase)

- `POST /calibration-requests/import/preview` — multipart (`FileInterceptor` + a
  parser lib, e.g. `exceljs`); parse → validate → match → return preview rows;
  **persists nothing**.
- `POST /calibration-requests/import/commit` — JSON, reviewed rows (every row now
  has a resolved `deviceTypeId`); rejects if any `UNMATCHED`; **reuses
  `CalibrationRequestsService.create`** (already does `assertDeviceTypesExist` +
  `createMany`). Explosion (Option B) happens at parse/commit.

Preview columns: Excel Name · Model · Qty · Device ID(s) · Matched DeviceType ·
Match Method · Status · Warnings.

---

## Simulation to build in the report

Dataset (conceptual — not inserted):

| # | Nama Alat | Model | Qty | Device ID |
|---|---|---|---|---|
| 1 | Tensimeter | AB-123 | 5 | *(blank)* |
| 2 | Bed Side Monitor | BSM-501 | 3 | BSM001 |
| 3 | Dental Unit | DU-100 | 2 | DU001 |
| 4 | Tensimeter Digital | AB-123 | 2 | *(blank)* |
| 5 | Patient Monitor | PM-5 | 1 | PM-001 |

Master: DeviceTypes `Sphygmomanometer`, `Bed Side Monitor`, `Dental Unit`.
Aliases: `Sphygmomanometer` ← {Tensimeter, Tensimeter Digital}; `Bed Side Monitor`
← {Patient Monitor}.

Report must show:
- **B. Matching result** — per row: matched DeviceType + method (`ALIAS` for rows
  1,4,5; `NAME` for rows 2,3). Note row 5 "Patient Monitor" → `Bed Side Monitor`
  via alias (illustrates alias doing real work). Note "Dental Unit" master is
  absent from the simulation's DeviceType list in the prompt's §16 vs present in
  §5 — treat as present per §16 assumption; if truly absent → `UNMATCHED`. Flag
  this as a simulation caveat.
- **C. Option A result** — 5 `CalibrationRequestItem` rows (one per Excel row);
  Qty 5/3/2/2/1 unrepresentable → lost or shoved into notes; downstream: quotation
  author manually sets `QuotationItem.qty`; WorkOrderItem qty>1 with no per-unit
  anchor; Job fan-out undefined.
- **D. Option B result** — 5+3+2+2+1 = **13 `CalibrationRequestItem` rows**; table
  showing each row's `customerDeviceName` / `model` / `deviceId` / `deviceTypeId`;
  e.g. the 5 "Tensimeter" rows all `customerDeviceName="Tensimeter"`,
  `model="AB-123"`, `deviceId=NULL`, `deviceType=Sphygmomanometer`.
- **E. Downstream** for each option: # QuotationItems (13, each qty 1, bijection
  holds) → # PO items (13) → # WO items (13) → # CalibrationJobs (13, once the
  Device bridge exists) — vs Option A's 5 lines with numeric qty and an undefined
  job fan-out.
- **Edge cases** (§10/§11) as an explicit ambiguity table:
  - A `5 | blank` → 5 rows, all `deviceId=NULL`. OK.
  - B `5 | TEN-001` → **ambiguous**: apply to row 1 only (default), rows 2–5 NULL,
    preview warns "Qty 5, 1 Device ID". Business decision D1.
  - C `5 | TEN-001,…,TEN-005` → 5 rows, one ID each — **only if** delimiter-split
    is supported. Business decision D2.
  - D `5 | blank` (no IDs at all) → 5 rows NULL. OK.
  - E `5 | one ID` → same as B.
  - Count mismatch (IDs ≠ Qty) → preview warning, never silent.
- **"What happens later"**: when the technician is on site, each device-granular
  row becomes (via the future, unbuilt WorkOrder→Job step) one `Device` row + one
  `CalibrationJob`; the free-text `deviceId` / `customerDeviceName` are the
  technician's reconciliation hints, not the identity.

---

## Report section → source map

| Report section | Source |
|---|---|
| 1–4 Current architecture / schema / grain (req + downstream) | this file's "Exploration findings" |
| 5–8 Device ID / customerDeviceName / model / Qty findings | Phase 1 report + grain table + guardrail |
| 9 Alias findings | "Alias / master data" + "DeviceTypeAlias" recommendation |
| 10 Excel import findings | "Excel / file import" |
| 11–15 Simulation (dataset, matching, A, B, C assessment) | "Simulation to build" |
| 16 Downstream consequences | grain table + `assertFullScopeItems` + unbuilt Job seam |
| 17 Risks | list below |
| 18 Recommended architecture | "Recommended position" |
| 19 Open business decisions | D1–D10 below |
| 20 Proposed next implementation phase | "Proposed Phase 3" below |

### Risks (section 17)
- **R1** Bijection coupling: a future "×N single priced quotation line" demand
  forces a rework of `assertFullScopeItems`. Explode defers, doesn't eliminate.
- **R2** WorkOrder→CalibrationJob device-materialization seam still unbuilt; Option
  B makes it 1:1 but the seam design (who/when creates `Device` rows, how free-text
  `deviceId` reconciles) is out of scope.
- **R3** Large Qty (e.g. 200) → 200 requisition + 200 quotation rows. Preview needs
  a cap / warning.
- **R4** Excel parsing robustness: header variants, trailing spaces, Device IDs
  losing leading zeros when Excel types them as numbers, "5 unit" in Qty, merged
  cells. Needs a strict template + validation.
- **R5** Alias normalization collisions (e.g. "Monitor" for two types) — blocked by
  the unique constraint; curator needs a clear error.
- **R6** No duplicate-detection rule today (re-upload, or a row duplicating an
  existing requisition item).
- **R7** Global alias in a multi-company schema — one company's curation affects
  all. Acceptable now (single operational company).

### Open business decisions (section 19)
- **D1** Qty=N with one Device ID → apply to row 1 only? (recommended)
- **D2** Comma / newline-split Device IDs in one cell — supported in v1? which delimiter?
- **D3** Max Qty per row / max rows per import.
- **D4** Duplicate-row / re-upload behaviour.
- **D5** Should a quotation ever collapse identical request items into one "×N"
  priced line? (governs whether explode is safe long-term)
- **D6** Record `matchedBy` enum on `CalibrationRequestItem` for audit, or rely on
  `customerDeviceName` + raw file?
- **D7** Store the raw uploaded Excel (`FileObject` + `REQUEST_ATTACHMENT`)?
- **D8** Alias curation ownership — reuse `deviceType` permissions or a new one?
- **D9** Is `Model` optional or required in the Excel template?
- **D10** Fuzzy matching in the v1 preview, or strict name/alias only?

### Proposed Phase 3 — implementation (section 20, outline only)
1. **Schema** (additive): `DeviceTypeAlias` model; optionally a `matchedBy` enum on
   `CalibrationRequestItem` (pending D6).
2. **Alias master**: service + CRUD under the device-types module, `deviceType`
   RBAC, seed a starter alias set.
3. **Import API**: `POST /calibration-requests/import/preview` (multipart,
   `FileInterceptor` + `exceljs`) and `POST /calibration-requests/import/commit`
   (JSON, reviewed rows, reuses `CalibrationRequestsService.create`). Qty explodes
   at parse.
4. **Portal**: "Import from Excel" action — template download, upload, preview /
   mapping table, resolve `UNMATCHED`, commit.
5. **Tests**: parser, matcher (name / alias / unmatched), explode arithmetic,
   commit reuses `create` + `assertDeviceTypesExist`, preview persists nothing,
   edge-case warnings.
Still deferred after Phase 3: `qty` column, `CalibrationRequestLine`, any
Quotation / WorkOrder / CalibrationJob change, fuzzy auto-commit, the Device
materialization seam.

---

## Verification

This deliverable is a document. "Done" = the report file exists at the path above,
contains all 20 sections, the simulation shows concrete row counts for Options A
and B (13 rows under B for the given dataset) with downstream tables, the
edge-case ambiguity table is present, and section 18 answers the 10 recommendation
questions. No build/test/DB step applies. Cross-check every schema/line citation
against `packages/db/prisma/schema.prisma` and the two service files before
finalising.
