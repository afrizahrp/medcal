# MEDCAL — Phase 2 Audit & Simulation

## Excel Import + DeviceType Alias

**Status:** AUDIT + SIMULATION ONLY. No schema, migration, API, UI, RBAC, seed, or
DB change is made or proposed for immediate implementation.
**Date:** 2026-08-29
**Prerequisite:** Phase 1 (Requisition Device Data Refinement) — complete.
**Companion docs:** `implementation_report_requisition_device_alias_audit.md`,
`implementation_report_requisition_phase1.md`.

**Guardrail for this audit:** Excel `Qty` ≠ `CalibrationRequestItem.qty`.
Customer Device ID ≠ `Device.id`. The correct domain grain must be established
before any field is added.

---

## 1. Current Architecture

The requisition is the first document in the commercial chain and is created by
internal portal users on behalf of a customer:

```
CalibrationRequest ──< CalibrationRequestItem          (device lines)
      │ 1:1  (Quotation.requestId @unique + explicit duplicate guard)
      ▼
Quotation ──< QuotationItem                            (priced lines; qty: Decimal)
      │      assertFullScopeItems(): strict 1:1 bijection
      │      CalibrationRequestItem ↔ QuotationItem
      ▼
PurchaseOrder ──< PurchaseOrderItem                    (1:1 copy of quotation item)
      │
      ▼
WorkOrder ──< WorkOrderItem                            (1:1 snapshot of PO item; no device field)
      │
      ▼
CalibrationJob                                         (deviceId REQUIRED FK → Device.id;
                                                        @@unique([workOrderId, deviceId]))
```

Module layout (`apps/api/src/modules/`): `calibration-requests`, `quotations`,
`purchase-orders`, `work-orders`, `device-types`, `devices`, `files`, … There is
**no `calibration-jobs` module** — `WorkOrder` is the current end of the
implemented chain.

**Two grains coexist in the domain:**

| Grain | Model | Cardinality unit |
| --- | --- | --- |
| Commercial / priced line | `QuotationItem` (and PO/WO items downstream) | a line, with a numeric `qty` |
| Physical execution | `CalibrationJob` | exactly one job per physical `Device` |

The requisition currently sits above both and its grain is **not enforced** — see
§3.

---

## 2. Current Prisma Schema (packages/db/prisma/schema.prisma)

### `CalibrationRequestItem` — line 1219

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String cuid PK | |
| `companyId` | String | |
| `requestId` | String | FK → `CalibrationRequest` (onDelete Cascade) |
| `deviceTypeId` | String | **REQUIRED** FK → `DeviceType` |
| `customerDeviceName` | String? | Phase 1 — verbatim customer wording |
| `model` | String? | Phase 1 — customer-provided model text |
| `deviceId` | String? | Phase 1 — customer free-text identifier, **NOT** a FK to `Device` |
| `notes` | String? | |
| `createdAt` | DateTime | no `updatedAt` |

- **No `qty` field.**
- Relations: `request`, `deviceType`, `quotationItems QuotationItem[]`.
- Indexes: `@@index([requestId])`, `@@index([deviceTypeId])`. **No `@@unique`.**

### `QuotationItem` — line 1305

`id`, `companyId`, `quotationId`, `deviceId String?`, `requestItemId String?`
(**nullable FK**), `tariffId String?`, `description String`,
**`qty Decimal @default(1) @db.Decimal(18,4)`**, `unitPrice`, `discountAmount`,
`lineTotal`, `createdAt`. Only `@@index([quotationId])` — **no `@@unique` on
`requestItemId`** (the 1:1 rule is application-level only).

### `PurchaseOrderItem` — line 1364

`quotationItemId String` (required), **`qty Decimal @default(1)`**, `deviceId
String?`, `status PurchaseOrderItemStatus @default(OPEN)`, …
`@@unique([purchaseOrderId, quotationItemId])`.

### `WorkOrder` — line 1393 / `WorkOrderItem` — line 1431

`WorkOrderItem`: `workOrderId`, `purchaseOrderItemId`, `description`,
**`qty Decimal @default(1)`**, `createdAt`. **No `deviceId` / `deviceTypeId` /
price fields.** `@@unique([workOrderId, purchaseOrderItemId])`. Doc comment:
*"Operational snapshot of a PurchaseOrderItem. MVP copies every PO item 1:1.
Quantity and source identity are immutable after create."*

### `CalibrationJob` — line 1467

`workOrderId`, `purchaseOrderItemId String?`, **`deviceId String` (REQUIRED) —
`device Device @relation(...)` required FK to `Device.id`**, `status`, `startedAt`,
`submittedAt`. **`@@unique([workOrderId, deviceId])`** (line 1489) — one job per
(WorkOrder, Device). No `qty` (implicit 1).

### `DeviceType` — line 916

**Global** (no `companyId`). `code String @unique` (globally unique). **`name` is
NOT unique.** `categoryId` required FK → `DeviceCategory`. Same global convention:
`DeviceCategory`, `Uom`, `EquipmentType`, `DeviceModel`.

### `DeviceModel` — line 1071

Child of `DeviceType`, no `code`, `@@unique([deviceTypeId, manufacturer, model])`.
Structural template for a future `DeviceTypeAlias`.

### Relevant enums

- `DocumentType` (line 218) already has `CALIBRATION_REQUEST`.
- `FileOwnerType` (line 259) already has an **unused `REQUEST_ATTACHMENT`** value.

### `qty` summary

`qty` exists on **`QuotationItem`, `PurchaseOrderItem`, `WorkOrderItem`** — all
`Decimal @default(1) @db.Decimal(18,4)`. It does **not** exist on
`CalibrationRequestItem` or `CalibrationJob`.

---

## 3. Current Requisition Grain

**What does one `CalibrationRequestItem` represent today?** The schema does not
say. It is best described as **"one customer equipment entry"**:

- It carries a device *type* (`deviceTypeId`), the customer's *name* for it
  (`customerDeviceName`), a *model*, and optionally *one* customer identifier
  (`deviceId`).
- Nothing forces it to be one-physical-device. A user could already type
  "Tensimeter" once and mean five units — the row would still be valid.
- In the current **manual** portal flow the convention is *one row per device*
  (each row has its own Device ID field), but that is UI habit, not a constraint.

There is **no quantity** at this layer. The first place a quantity appears is
`QuotationItem.qty`, and it is **entered fresh** by the quotation author
(§13) — nothing is carried forward from the requisition, because there is nothing
to carry.

**Conclusion:** the requisition grain is currently *undefined/ambiguous*. Phase 2
must pick one, and the only two consistent choices are:

- **line grain** — one row = one customer line, needs a `qty`; or
- **device grain** — one row = one physical device, `qty` is row multiplicity.

§16 and §18 show why **device grain** is the correct choice.

---

## 4. Current Downstream Grain

| Step | Code | Behaviour |
| --- | --- | --- |
| Quotation create | `quotations.service.ts` `create()` + `assertFullScopeItems()` (191–218) + `buildItemRows()` (220–253) | **Strict 1:1 bijection**: every `CalibrationRequestItem` of the request must appear **exactly once** among quotation items — no duplicates (`DUPLICATE_REQUEST_ITEM`), no missing/unknown (`QUOTATION_SCOPE_MISMATCH`). `qty` per line is entered fresh (default 1). Re-checked on quotation `update()`. |
| PO create | `purchase-orders.service.ts` (159–173) | `purchaseOrderItem.createMany` — pure **1:1 copy** of quotation items; `deviceId`, `qty`, `unitPrice`, `lineTotal` copied verbatim. |
| WorkOrder create | `work-orders.service.ts` (217–225) | `workOrderItem.createMany` — pure **1:1 copy** of PO items; `description` and `qty` copied verbatim. **No explode logic anywhere in the codebase.** |
| CalibrationJob | — | **No code creates a `CalibrationJob`.** No jobs module. Work-order tests explicitly assert zero jobs are created. |

**The device-identity bridge is unimplemented.** `CalibrationJob.deviceId` is a
required FK to a real `Device`. The only code that creates `Device` rows is
`DevicesService.create()` (`devices.service.ts:71`, explicit master-data entry).
**No code creates a `Device` from a `CalibrationRequestItem` or a
`WorkOrderItem`.** The schema comment on `CalibrationRequestItem.deviceId` states
it is *"NOT the future CalibrationJob Device.id (that physical identity is
assigned later, on site, by the technician)."*

**Net:** downstream of the WorkOrder the domain is **immutably device-granular**
(one job per `Device`, enforced by `@@unique([workOrderId, deviceId])`). Upstream
(Requisition → Quotation → PO → WO) is line-granular with a numeric `qty` from the
quotation onward. The join between the two — turning a line of `qty = N` into N
`Device` rows and N jobs — has no home and no code.

---

## 5. Device ID Findings

| Question | Finding |
| --- | --- |
| Nullable? | **Yes** (Phase 1). `String?` at DB, `.optional()` in zod, optional in the UI. |
| A FK to `Device`? | **No** — deliberately. Free-text customer inventory/asset tag. |
| Should it stay nullable? | **Yes.** A missing customer Device ID is a valid business state; the technician assigns the real physical identity later. |
| Downstream impact of `NULL`? | Minimal in built code — WorkOrder PDF already renders `"—"`; quotation build ignores it. `CalibrationJob` needs a real `Device` but that step is unbuilt. |
| Excel `Device ID` column | Maps directly to `deviceId`. Empty cell → `NULL`, never a placeholder. |

---

## 6. Customer Device Name Findings

`customerDeviceName` (Phase 1) preserves the customer's original wording verbatim
(e.g. "Tensimeter Digital") independent of the mapped `DeviceType`
("Sphygmomanometer"). It is stored as-is and never overwritten by the master name.
It is **the** field that lets MEDCAL answer *"what exactly did the customer
submit?"* For Excel import it holds the `Nama Alat` cell verbatim. Keep it
separate — no change needed.

---

## 7. Model Findings

`model` (Phase 1) is customer-provided model text (e.g. "AB-123"). Plain nullable
`String`, not a relation to `DeviceModel` or any master. For Excel import it holds
the `Model` cell verbatim. Keep it separate — no change needed. Open question:
whether `Model` is required or optional in the Excel template (**D9**).

---

## 8. Qty Findings

- `CalibrationRequestItem` has **no `qty`** and must not gain one (see §15, §18).
- `qty` first appears at `QuotationItem` (`Decimal @default(1)`), entered fresh,
  and is copied 1:1 to PO and WO items.
- `CalibrationJob` has no `qty` — it is inherently one-per-device.
- Excel `Qty = N` therefore has two candidate meanings: (A) a line quantity to be
  stored as a number, or (B) an instruction to create N device rows. §16 shows B
  is the only interpretation consistent with the existing downstream grain.
- **Where Qty lives under the recommendation (B):** as *row multiplicity* — the
  count of sibling `CalibrationRequestItem` rows sharing
  `(customerDeviceName, model, deviceTypeId)` within a request. Optionally, the
  raw uploaded Excel file is retained via `FileObject` +
  `FileOwnerType.REQUEST_ATTACHMENT` as the verbatim audit record (**D7**). **No
  scalar `qty` column is added.**

---

## 9. Alias Findings

- **No alias / synonym / "also known as" / normalized-name pattern exists
  anywhere** in the schema or services. `DeviceType.code` is upper-cased on input
  but that is coercion, not a lookup table.
- `DeviceType` is **global**, `code` globally unique, **`name` not unique**.
- The `DeviceModel` child model (`@@unique([deviceTypeId, …])`) is the structural
  template for an alias child model.
- `CalibrationRequestItem.customerDeviceName` already captures the customer's term
  per requisition; an alias table would additionally make that term
  *machine-matchable* for import.

**Recommendation — `DeviceTypeAlias` is the simplest safe solution and should be
built together with the Excel importer** (it has no other consumer; manual
requisition entry uses the `DeviceType` selector directly). Minimal viable model:

```prisma
model DeviceTypeAlias {
  id              String   @id @default(cuid())
  deviceTypeId    String
  alias           String                       // as entered — for display
  normalizedAlias String                       // lower(trim(collapse-internal-whitespace(alias)))
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deviceType      DeviceType @relation(fields: [deviceTypeId], references: [id])
  @@unique([normalizedAlias])                   // GLOBAL — one alias → at most one DeviceType
  @@index([deviceTypeId])
}
```

| Design question | Answer |
| --- | --- |
| Global or company-scoped? | **Global**, mirroring `DeviceType`. |
| Normalization | `normalizedAlias` = lowercase + trim + collapse internal whitespace. Match **only** on `normalizedAlias`. |
| Case-insensitive? | Yes, by construction (`normalizedAlias`). |
| Same alias → two DeviceTypes? | **Impossible** — `@@unique([normalizedAlias])` is global. Ambiguous terms simply get no alias and fall to manual mapping. Do **not** build multi-target alias resolution. |
| Active/inactive? | `isActive` flag; the matcher ignores inactive aliases but they are retained for history. |
| Collision with a `DeviceType.name`? | Optionally reject creating an alias equal to an existing type name under a different type. |
| Curation | Existing `device-types` module + existing `deviceType` RBAC (`read/create/update/delete`), or a dedicated permission (**D8**). |

---

## 10. Excel Import Findings

- **No spreadsheet-import infrastructure exists.** No `xlsx` / `exceljs` /
  `papaparse` / `csv-parse` dependency anywhere. No preview/staging/confirm batch
  flow. Every chain-creation endpoint is single-shot atomic JSON.
- The only file machinery is `FileInterceptor` (single binary upload for
  evidence/documents, `apps/api/src/modules/files/`) — no content parsing.
- So Excel import is **greenfield** on every axis: parser library, multipart
  endpoint, staging/preview model, commit endpoint, preview UI.

**The proposed flow fits, but forces a two-phase design the current API lacks:**

```
POST /calibration-requests/import/preview   (multipart; parser lib e.g. exceljs)
   → parse rows → validate (Nama Alat required, Qty > 0) → match DeviceType
   → return preview payload           ← NOTHING is persisted

POST /calibration-requests/import/commit    (JSON: the reviewed / mapped rows)
   → reject if any row still UNMATCHED
   → reuse CalibrationRequestsService.create() (already does assertDeviceTypesExist + createMany)
```

The commit phase **reuses the existing `create` transaction**; the new work is
parsing + matching + the preview payload + the preview/mapping UI. Qty explosion
(§18) happens at parse time.

**Matching sequence:**

1. exact `DeviceType.name` (normalized) → `NAME`
2. exact `DeviceTypeAlias.normalizedAlias` → `ALIAS`
3. else → `UNMATCHED` — user must map before commit is allowed

Fuzzy matching may appear in the preview **as an assist only** (a highlighted
suggestion); it must **never** auto-commit an uncertain match (**D10**).

**Preview must expose** enough to catch mistakes:

| Excel Name | Model | Qty | Device ID(s) | Matched DeviceType | Match Method | Status | Warnings |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tensimeter | AB-123 | 5 | — | Sphygmomanometer | ALIAS | ✓ | — |
| Patient Monitor | PM-5 | 1 | PM-001 | Bed Side Monitor | ALIAS | ✓ | — |
| Ventilator | V-9 | 2 | — | ? | — | UNMATCHED | pick a DeviceType |

---

## 11. Simulation Dataset

Conceptual only — **nothing is inserted into the database.**

### A. Original Excel

| # | Nama Alat | Model | Qty | Device ID |
| --- | --- | --- | --- | --- |
| 1 | Tensimeter | AB-123 | 5 | *(blank)* |
| 2 | Bed Side Monitor | BSM-501 | 3 | BSM001 |
| 3 | Dental Unit | DU-100 | 2 | DU001 |
| 4 | Tensimeter Digital | AB-123 | 2 | *(blank)* |
| 5 | Patient Monitor | PM-5 | 1 | PM-001 |

### Assumed master data

- **DeviceTypes:** `Sphygmomanometer`, `Bed Side Monitor`, `Dental Unit`.
- **Aliases:**
  - `Sphygmomanometer` ← `Tensimeter`, `Tensimeter Digital`
  - `Bed Side Monitor` ← `Patient Monitor`

> **Simulation caveat.** The prompt's §16 DeviceType list includes `Dental Unit`;
> its §5 alias list does not mention it. This simulation treats `Dental Unit` as a
> present DeviceType, so row 3 matches by exact **name**. If `Dental Unit` were
> absent from the master, row 3 would be `UNMATCHED` and require user mapping —
> which is exactly the safe behaviour the design intends.

---

## 12. Matching Simulation

| # | Excel `Nama Alat` | normalized | Step that matches | Matched DeviceType | Method | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Tensimeter | `tensimeter` | 2 — alias | Sphygmomanometer | `ALIAS` | ✓ matched |
| 2 | Bed Side Monitor | `bed side monitor` | 1 — exact name | Bed Side Monitor | `NAME` | ✓ matched |
| 3 | Dental Unit | `dental unit` | 1 — exact name | Dental Unit | `NAME` | ✓ matched |
| 4 | Tensimeter Digital | `tensimeter digital` | 2 — alias | Sphygmomanometer | `ALIAS` | ✓ matched |
| 5 | Patient Monitor | `patient monitor` | 2 — alias | Bed Side Monitor | `ALIAS` | ✓ matched |

Row 5 demonstrates the alias table doing real work: "Patient Monitor" is neither a
`DeviceType.name` nor an obvious substring of "Bed Side Monitor", yet it maps
deterministically via a curated alias. `customerDeviceName` still preserves
"Patient Monitor" verbatim.

---

## 13. Option A Simulation — one `CalibrationRequestItem` per Excel row

| Excel row | `customerDeviceName` | `model` | `deviceId` | `deviceTypeId` | Qty |
| --- | --- | --- | --- | --- | --- |
| 1 | Tensimeter | AB-123 | NULL | Sphygmomanometer | **5 — nowhere to store** |
| 2 | Bed Side Monitor | BSM-501 | BSM001 | Bed Side Monitor | **3 — nowhere to store** |
| 3 | Dental Unit | DU-100 | DU001 | Dental Unit | **2 — nowhere to store** |
| 4 | Tensimeter Digital | AB-123 | NULL | Sphygmomanometer | **2 — nowhere to store** |
| 5 | Patient Monitor | PM-5 | PM-001 | Bed Side Monitor | 1 |

**Rows created: 5.**

Consequences:

- **Qty is lost** unless a `qty` column is added to `CalibrationRequestItem`
  (rejected — §15) or it is smuggled into `notes` (data-quality abuse, not
  matchable).
- **Per-unit Device IDs cannot be represented** — row 2 has three units but one
  `deviceId` slot; edge case C (comma-separated IDs) has nowhere to go.
- **Downstream:** the quotation author must manually set `QuotationItem.qty` = 5/3/2/2/1
  on each of the 5 bijective lines. PO and WO items copy `qty > 1`. Then a
  `WorkOrderItem` with `qty = 5` must become **5 `Device` rows + 5
  `CalibrationJob` rows** — a 1→N fan-out driven by a bare number, in a seam that
  has no code and no design. Nothing anchors per-unit identity, per-unit notes, or
  per-unit customer IDs.

---

## 14. Option B Simulation — explode `Qty = N` into N `CalibrationRequestItem` rows

`5 + 3 + 2 + 2 + 1 = ` **13 `CalibrationRequestItem` rows.**

| Row | from Excel # | `customerDeviceName` | `model` | `deviceId` | `deviceTypeId` |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 | Tensimeter | AB-123 | NULL | Sphygmomanometer |
| 2 | 1 | Tensimeter | AB-123 | NULL | Sphygmomanometer |
| 3 | 1 | Tensimeter | AB-123 | NULL | Sphygmomanometer |
| 4 | 1 | Tensimeter | AB-123 | NULL | Sphygmomanometer |
| 5 | 1 | Tensimeter | AB-123 | NULL | Sphygmomanometer |
| 6 | 2 | Bed Side Monitor | BSM-501 | BSM001 *(row 1 only — see edge case B)* | Bed Side Monitor |
| 7 | 2 | Bed Side Monitor | BSM-501 | NULL | Bed Side Monitor |
| 8 | 2 | Bed Side Monitor | BSM-501 | NULL | Bed Side Monitor |
| 9 | 3 | Dental Unit | DU-100 | DU001 *(row 1 only)* | Dental Unit |
| 10 | 3 | Dental Unit | DU-100 | NULL | Dental Unit |
| 11 | 4 | Tensimeter Digital | AB-123 | NULL | Sphygmomanometer |
| 12 | 4 | Tensimeter Digital | AB-123 | NULL | Sphygmomanometer |
| 13 | 5 | Patient Monitor | PM-5 | PM-001 | Bed Side Monitor |

Notes:

- Every exploded row **preserves the customer's wording** (`customerDeviceName`)
  and `model`; only `deviceTypeId` is the mapped master value.
- Rows 6 and 9: the single Excel Device ID is placed on the **first** exploded row
  only; the rest are `NULL`, and the preview warns "Qty N, 1 Device ID" (edge case
  B, decision **D1**).
- No `qty` value is stored anywhere. The "quantity" for Excel row 1 is simply
  *"5 rows share (Tensimeter, AB-123, Sphygmomanometer)"*.

---

## 15. Option C Assessment — a separate request-line layer

```
CalibrationRequest ──< CalibrationRequestLine (customerDeviceName, model, qty, deviceId?)
                             └──< CalibrationRequestItem (device-granular)
```

**Rejected.** Reasons:

- It **duplicates `QuotationItem`**, which already is exactly "a priced line with a
  numeric `qty`" — one step later in the same chain. Adding
  `CalibrationRequestLine` creates a second line-with-qty concept that must be kept
  in sync with the item rows on every edit.
- New model + relations + migration + portal UI for both levels + explosion +
  re-collapse logic — significant complexity for no capability that Option B
  plus the existing `QuotationItem` does not already provide.
- The prompt's own instruction: recommend C only if the architecture *clearly
  justifies* it. It does not — downstream is already firmly device-granular
  (`CalibrationJob @@unique([workOrderId, deviceId])`), so the requisition should
  simply adopt that same grain.

Option C would only become interesting if MEDCAL later needed the requisition
itself (not the quotation) to be the system of record for line-level commercial
grouping — which is not a current requirement.

---

## 16. Downstream Consequences

### Under Option A (5 rows, numeric qty)

| Step | Result |
| --- | --- |
| QuotationItem | 5 lines; author manually keys `qty` 5/3/2/2/1; bijection holds |
| PurchaseOrderItem | 5 lines, `qty` copied |
| WorkOrderItem | 5 lines, `qty` copied (values 5/3/2/2/1) |
| CalibrationJob | **Undefined.** A `WorkOrderItem` of `qty = 5` must yield 5 `Device` + 5 `CalibrationJob` rows. No code, no design, no per-unit anchor. |

### Under Option B (13 rows, qty = row multiplicity)

| Step | Result |
| --- | --- |
| QuotationItem | **13 lines**, each `qty = 1`; `assertFullScopeItems` bijection holds with **zero code changes** |
| PurchaseOrderItem | 13 lines |
| WorkOrderItem | 13 lines, each `qty = 1` |
| CalibrationJob | 13 jobs — a clean **1:1** (each `WorkOrderItem` → 1 `Device` → 1 `CalibrationJob`), once the device-materialization step is built. No fan-out. |

### What happens later (both options)

When the technician is on site, each device-granular unit is reconciled to a real
physical `Device` (a new `Device` row, or a match to an existing one), and one
`CalibrationJob` is created per `Device`. The free-text `deviceId` and
`customerDeviceName` are the technician's **reconciliation hints**, never the
identity. Under Option B this mapping is 1 row → 1 device → 1 job; under Option A
it is 1 row → N devices → N jobs with N undefined.

**This is the decisive finding:** Option B makes the whole chain one grain and
turns the unbuilt WorkOrder→Job seam into a trivial 1:1; Option A pushes an
undesigned numeric fan-out into that seam and loses per-unit data on the way.

---

## 17. Risks

| # | Risk | Severity | Mitigation |
| --- | --- | --- | --- |
| R1 | **Bijection coupling.** `assertFullScopeItems` hard-codes 1:1 requisition-item ↔ quotation-line. If sales later demands a single "×N" priced quotation line, that check must be reworked. | High | Lock the requisition grain to *device* now (Option B). A "×N" quotation line is a separate future decision (**D5**) that would require changing `assertFullScopeItems` first — do not pre-build it. |
| R2 | **The WorkOrder→CalibrationJob device-materialization seam is still unbuilt.** Every Phase-2 decision writes constraints into it. | High | Option B reduces the seam to 1:1. The seam's own design (who/when creates `Device` rows, how free-text `deviceId` reconciles) is out of scope here and must be designed before the `CalibrationJob` module. |
| R3 | **Large Qty** (e.g. `Qty = 200`) → 200 requisition + 200 quotation + 200 PO + 200 WO rows. | Medium | Import preview caps / warns above a threshold (**D3**). |
| R4 | **Excel parsing fragility** — header variants ("Nama Alat" vs "Nama alat"), trailing spaces, Device IDs losing leading zeros when Excel stores them as numbers, `Qty` as "5 unit", merged cells, empty trailing rows. | Medium | Ship a strict downloadable template; validate every cell; reject/flag rather than guess. |
| R5 | **Alias normalization collisions** — e.g. "Monitor" proposed as an alias for two types. | Medium | `@@unique([normalizedAlias])` blocks it at write time; the curation UI must surface a clear "already an alias of X" error. |
| R6 | **No duplicate detection** — re-uploading the same file, or a row duplicating an existing requisition item, creates duplicates silently. | Medium | Define behaviour (**D4**) — at minimum warn on re-upload of an identical file hash. |
| R7 | **Global alias in a multi-company schema** — one company's alias curation affects all companies. | Low | Acceptable now (single operational company "PKM"); revisit if true multi-tenant master data becomes real. |
| R8 | **Scope creep** — `matchedBy`, fuzzy matching, `DeviceModel` linkage, per-company aliases all sit one step away. | Medium | Hold to: `DeviceTypeAlias` (global, single-target) + two-phase importer + Option B explosion. Nothing else. |

---

## 18. Recommended Architecture

**Adopt device grain for the requisition. Explode Excel `Qty = N` into N
`CalibrationRequestItem` rows at import time. Do not add a `qty` column. Build
`DeviceTypeAlias` (global, single-target) together with a two-phase Excel
importer.**

Answers to the ten questions:

| # | Question | Answer |
| --- | --- | --- |
| 1 | Should Device ID remain nullable? | **Yes.** Keep `deviceId String?`. A missing customer Device ID is a valid state; physical identity is assigned later on site. |
| 2 | Should `customerDeviceName` remain separate? | **Yes.** It is the verbatim record of what the customer submitted; the alias/matching layer must never overwrite it. |
| 3 | Should `model` remain separate? | **Yes.** Plain nullable text, no master relation. |
| 4 | Is `DeviceTypeAlias` recommended? | **Yes** — it is the simplest safe solution. Global, `normalizedAlias`, `@@unique([normalizedAlias])` so one alias can never map to two types; ambiguous terms get no alias and fall to manual mapping. |
| 5 | Implement aliases together with Excel import? | **Yes.** Same implementation phase. Aliases have no other consumer — manual requisition entry uses the `DeviceType` selector directly. |
| 6 | Should Excel import use Preview → Confirm? | **Yes**, mandatory. `POST …/import/preview` (multipart, persists nothing) → user resolves every `UNMATCHED` → `POST …/import/commit` (JSON, reuses `CalibrationRequestsService.create`). |
| 7 | Should Qty explode into `CalibrationRequestItem`s? | **Yes (Option B).** `Qty = N` → N device-granular rows, each preserving `customerDeviceName` / `model` / mapped `deviceTypeId`. |
| 8 | Should Qty be added to the schema? | **No.** No `qty` column on `CalibrationRequestItem`. |
| 9 | If not, where does Qty live? | As **row multiplicity** (count of sibling rows sharing `customerDeviceName` + `model` + `deviceTypeId`), visible/editable in the import preview; optionally the raw uploaded Excel is retained via `FileObject` + `FileOwnerType.REQUEST_ATTACHMENT` as the verbatim audit record (**D7**). |
| 10 | Simplest architecture that preserves customer info without breaking downstream grain | Option B explosion + `DeviceTypeAlias` (global, single-target) + two-phase import endpoints whose commit reuses the existing `create` transaction. **Zero changes** to `assertFullScopeItems`, `QuotationItem`, PO, WorkOrder, or `CalibrationJob`. |

### Edge cases — Device ID × Qty (from §10 / §11 of the prompt)

| Case | Excel | Handling | Decision |
| --- | --- | --- | --- |
| A | `Tensimeter \| AB-123 \| 5 \| blank` | 5 rows, all `deviceId = NULL`. Valid. | — |
| B | `Tensimeter \| AB-123 \| 5 \| TEN-001` | **Ambiguous.** Default: `TEN-001` on row 1 only, rows 2–5 `NULL`; preview warns "Qty 5 but only 1 Device ID". Never auto-replicate the ID to all 5. | **D1** |
| C | `Tensimeter \| AB-123 \| 5 \| TEN-001,TEN-002,…,TEN-005` | 5 rows, one ID each — **only if** delimiter-split is a supported v1 feature. | **D2** |
| D | `Tensimeter \| AB-123 \| 5 \| blank` (customer has no identifiers) | Same as A — 5 rows, all `NULL`. Valid. | — |
| E | `Tensimeter \| AB-123 \| 5 \| only one identifier` | Same as B. | **D1** |
| — | IDs provided ≠ Qty | Preview **warning**, never a silent decision. | — |

### Quantity ↔ Device ID ambiguity (from §11 of the prompt) — stated explicitly

`Qty = 5`, `Device ID = TEN-001` could legitimately mean any of:

1. The customer has 5 units and provided the identifier of only one of them.
2. The customer entered "5" by mistake and this is really one device.
3. `TEN-001` identifies the *model* / a batch, not an individual unit.
4. Something site-specific we cannot infer.

**The system must not guess.** The importer's only safe move is: explode to 5
rows, attach the one ID to row 1, and surface the mismatch in the preview for a
human to resolve. Resolution rule is business decision **D1**.

---

## 19. Open Business Decisions

| # | Decision | Needed for |
| --- | --- | --- |
| D1 | `Qty = N` with fewer Device IDs than N → attach provided ID(s) to the first row(s), rest `NULL`? (recommended) | Import behaviour |
| D2 | Are comma/newline-separated Device IDs in a single cell supported in v1? Which delimiter? | Parser spec |
| D3 | Maximum `Qty` per row and maximum rows per import file. | Preview guardrails |
| D4 | Duplicate-row / identical-file re-upload behaviour (warn? block? allow?). | Import safety |
| D5 | Will a quotation ever collapse identical requisition items into one "×N" priced line? (governs whether Option B is safe long-term or `assertFullScopeItems` eventually changes) | Downstream grain |
| D6 | Record a `matchedBy` enum (`NAME` / `ALIAS` / `USER_MAPPING` / `MANUAL_ENTRY`) on `CalibrationRequestItem` for audit, or rely on `customerDeviceName` + the raw file? | Traceability |
| D7 | Store the raw uploaded Excel via `FileObject` + `FileOwnerType.REQUEST_ATTACHMENT`? | Audit record |
| D8 | Alias curation ownership — reuse `deviceType` RBAC permissions or mint a new permission? | RBAC |
| D9 | Is `Model` required or optional in the Excel template? | Template + validation |
| D10 | Fuzzy matching in the v1 preview (assist-only), or strict name/alias only for v1? | Matcher scope |

---

## 20. Proposed Next Implementation Phase (outline only)

**Phase 3 — one coordinated, mostly-additive change:**

1. **Schema (additive):** `DeviceTypeAlias` model (global, `@@unique([normalizedAlias])`).
   Optionally a `matchedBy` enum + column on `CalibrationRequestItem` (pending
   **D6**).
2. **Alias master:** service + CRUD endpoints under the existing `device-types`
   module, guarded by `deviceType` RBAC (or a new permission — **D8**); seed a
   starter alias set.
3. **Import API:** `POST /calibration-requests/import/preview` (multipart,
   `FileInterceptor` + a parser library such as `exceljs`) and
   `POST /calibration-requests/import/commit` (JSON, reviewed rows, reuses
   `CalibrationRequestsService.create` → `assertDeviceTypesExist` + `createMany`).
   `Qty` explodes to N rows at parse time.
4. **Portal:** an "Import from Excel" action on the requisition — downloadable
   template, file upload, preview / mapping table, resolve every `UNMATCHED`,
   commit.
5. **Tests:** parser (headers, blanks, number-typed IDs), matcher
   (name / alias / unmatched), explode arithmetic, commit reuses `create`, preview
   persists nothing, edge-case warnings (B/C/count-mismatch).

**Still deferred after Phase 3:** a `qty` column, `CalibrationRequestLine`, any
change to `Quotation` / `WorkOrder` / `CalibrationJob`, fuzzy auto-commit, and the
WorkOrder→`CalibrationJob` device-materialization seam.

---

## Final Guardrail Check

- Excel `Qty` is **not** mapped to a `CalibrationRequestItem.qty` field — it
  becomes row multiplicity via the Option B explosion.
- Customer `Device ID` is **not** mapped to `Device.id` — it stays free-text and
  nullable; the physical `Device` identity is assigned later, on site.
- The requisition grain is now defined: **one `CalibrationRequestItem` = one
  physical device the customer wants calibrated**, matching the immutable
  `CalibrationJob` grain downstream.
- No schema, migration, API, UI, RBAC, seed, database, or Requisition-behaviour
  change was made. `DeviceTypeAlias` and the Excel importer were **not** created.
