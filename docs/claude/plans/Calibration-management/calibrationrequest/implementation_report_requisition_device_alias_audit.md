# MEDCAL — Requisition Device ID / Device Type Alias / Excel Import

## READ-ONLY AUDIT & DESIGN REVIEW

**Status:** Audit only. No schema, migration, API, UI, seed, RBAC, or data change is proposed for immediate implementation.
**Date:** 2026-08-29
**Scope:** `CalibrationRequest` / `CalibrationRequestItem` and the downstream chain
`CalibrationRequest → Quotation → PurchaseOrder → WorkOrder → CalibrationJob`.

---

## 1. Current Architecture

### 1.1 Module layout

| Layer | Location |
| --- | --- |
| DB schema | `packages/db/prisma/schema.prisma` |
| API (NestJS) | `apps/api/src/modules/calibration-requests/` (`.controller.ts`, `.service.ts`, `.module.ts`) |
| Shared contracts (zod) | `packages/shared/src/schemas/index.ts` (`// CalibrationRequest (D06)` section, lines ~284–342) |
| Portal UI | `apps/portal/src/app/management/calibration-requests/` (`new/`, `[id]/`, `[id]/edit/`, `calibration-requests-ui.tsx`) |

The requisition is the **first** document in the commercial chain. It is created internally by portal (management) users on behalf of a customer; it is not currently a customer-facing self-service form.

### 1.2 Domain chain and cardinality (as built today)

```
CalibrationRequest (1) ──< CalibrationRequestItem (N)      one item = one device-type line, free-text Device ID
        │ 1:1 (Quotation.requestId @unique)
        ▼
Quotation (1) ──< QuotationItem (N)                        requestItemId nullable FK; qty: Decimal @default(1)
        │                                                   assertFullScopeItems() enforces a strict 1:1 bijection
        │                                                   between CalibrationRequestItem and QuotationItem
        ▼
PurchaseOrder (1) ──< PurchaseOrderItem (N)                quotationItemId FK; qty copied
        │
        ▼
WorkOrder (1) ──< WorkOrderItem (N)                        "MVP copies every PO item 1:1"; qty immutable after create
        │
        ▼
CalibrationJob (N)                                         deviceId: REQUIRED FK → Device.id
                                                           @@unique([workOrderId, deviceId]) → one job per physical device
```

**Key structural fact:** downstream of the WorkOrder the domain becomes **device-granular** — `CalibrationJob` is keyed on a real `Device` row and is unique per `(workOrderId, deviceId)`. Upstream of that (Requisition → Quotation → PO → WorkOrder) the domain is **line-granular** with a numeric `qty` that only appears from `QuotationItem` onward.

### 1.3 The unbuilt seam

There is **no `CalibrationJob` creation code in the repository yet** (grep for `calibrationJob.create` across `apps/api/src` returns only unrelated matches). `WorkOrder` is the most recently implemented module. This means:

- The transition from a **line with a free-text `deviceId` string** to **N `CalibrationJob` rows each pointing at a real `Device.id`** is **not yet designed or implemented**.
- Any decision about Device ID nullability and Qty representation lands in that unbuilt seam. It cannot regress code that does not exist, but it *will* constrain it.

---

## 2. Current Prisma Schema Findings

### 2.1 `CalibrationRequestItem` (schema.prisma:1219–1235)

```prisma
model CalibrationRequestItem {
  id           String   @id @default(cuid())
  companyId    String
  requestId    String
  deviceTypeId String                       // REQUIRED FK → DeviceType.id
  /// Customer-provided physical device identifier (free-text). Not a FK to Device.
  deviceId     String                       // REQUIRED, plain String, NOT NULL
  notes        String?
  createdAt    DateTime @default(now())

  request        CalibrationRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  deviceType     DeviceType         @relation(fields: [deviceTypeId], references: [id])
  quotationItems QuotationItem[]

  @@index([requestId])
  @@index([deviceTypeId])
}
```

Findings:

1. **`customerDeviceName` — NOT represented.** The only device-descriptive fields are `deviceTypeId` (FK to master) and `deviceId` (free-text identifier). There is no field for the customer's original wording ("Tensimeter Digital"), and no `model` field.
2. **`deviceId` is NOT nullable.** It is `String` (NOT NULL). The zod contract reinforces this: `calibrationRequestItemInputSchema.deviceId = z.string().min(1)` (`packages/shared/src/schemas/index.ts:299`). The portal "New Requisition" form marks Device ID with a red asterisk and blocks submit unless every filled row has both `deviceTypeId` and `deviceId` (`apps/portal/.../new/page.tsx:104–113`).
3. **No `qty`.** One `CalibrationRequestItem` row = one device. Quantity does not exist at this layer.
4. **`deviceId` was historically a FK to `Device`.** Migration `20260826120000_add_devicetype_to_calibration_request_item` *drops* `CalibrationRequestItem_deviceId_fkey` and adds `deviceTypeId`. So the design deliberately moved from "Device ID = internal Device.id" to "Device ID = customer free-text string". The current architecture explicitly does **not** tie Device ID to `Device.id`. Documented intent: `docs/claude/plans/Calibration-management/calibrationrequest/Cursor Prompt — CalibrationRequestItem Device Type + Device ID.md`.

### 2.2 `DeviceType` (schema.prisma:916–935)

```prisma
model DeviceType {
  id          String   @id @default(cuid())
  categoryId  String
  code        String   @unique                 // global unique
  name        String                            // NOT unique
  ...
  isActive    Boolean  @default(true)
}
```

- **`DeviceType` is GLOBAL** — no `companyId`. Same convention as `DeviceCategory`, `Uom`, `DeviceCapability`, `EquipmentType`. It is shared master data across all companies (MEDCAL is effectively single-tenant "PKM" today but the schema is multi-company).
- `code` is globally unique; `name` is **not** unique and has no index.
- `DeviceType` is referenced by FK id from: `Device`, `DeviceModel`, `DeviceCalibrationParameter`, `CalibrationRequestItem`, `DeviceTypeEquipmentRequirement`.

### 2.3 Alias / synonym patterns already in the schema

**None.** There is no alias, synonym, "also known as", or normalized-name lookup anywhere in `schema.prisma`. The closest existing patterns:

| Pattern | Model | Relevance |
| --- | --- | --- |
| Child catalog under a DeviceType | `DeviceModel` (deviceTypeId, manufacturer, model, `@@unique([deviceTypeId, manufacturer, model])`) | Structural template for a `DeviceTypeAlias` child model |
| Free-text grouping hint kept as nullable String until a controlled vocabulary is confirmed | `EquipmentType.category`, `Device.category` | Precedent for "keep it a string, defer the enum" |
| Global master, unique `code`, `isActive` flag | `DeviceCategory`, `Uom`, `EquipmentType` | Convention a `DeviceTypeAlias` should follow (global, `isActive`) |

### 2.4 Qty representation across the chain

| Model | Qty field | Default | Notes |
| --- | --- | --- | --- |
| `CalibrationRequestItem` | *(none)* | — | one row = one device |
| `QuotationItem` | `qty Decimal @db.Decimal(18,4)` | `1` | entered at quotation time; `buildItemRows` uses `item.qty ?? DEFAULT_QTY` |
| `PurchaseOrderItem` | `qty Decimal @db.Decimal(18,4)` | `1` | copied from quotation item |
| `WorkOrderItem` | `qty Decimal @db.Decimal(18,4)` | `1` | "MVP copies every PO item 1:1", immutable after create |
| `CalibrationJob` | *(none — implicit 1)* | — | `@@unique([workOrderId, deviceId])`: exactly one job per device |

`assertFullScopeItems()` (`apps/api/src/modules/quotations/quotations.service.ts:191–218`) enforces that the set of `requestItemId`s on a quotation **exactly equals** the set of `CalibrationRequestItem` ids on the request — no duplicates, no omissions. **This is a hard 1:1 bijection between requisition items and quotation lines.** Any design that lets one requisition item carry `qty > 1` while a job is still needed per physical device must either (a) break this bijection, or (b) explode rows before the quotation is built.

---

## 3. Current Requisition → Quotation → Work Order Flow

1. **Create requisition** (`POST /calibration-requests`): validates customer in company, optional lead, asserts every `deviceTypeId` exists, allocates a document number (`DocumentNumberService`, type `CALIBRATION_REQUEST`), creates the request `DRAFT` + `createMany` items. Items require `deviceTypeId` + `deviceId`.
2. **Submit** (`POST /calibration-requests/:id/submit`): `DRAFT → SUBMITTED`. Edits allowed only while `DRAFT`.
3. **Create quotation** (`POST /quotations`): request must be in a quotable status; exactly one quotation per request (`Quotation.requestId @unique` + explicit `DUPLICATE_QUOTATION_FOR_REQUEST` guard); `assertFullScopeItems` forces full 1:1 coverage; each line gets `qty` (default 1), `unitPrice`, optional `tariffId`, optional `deviceId` (**this `deviceId` is `QuotationItem.deviceId` → `Device.id`, a real FK, and is nullable / optional**). `description` is free text supplied by the quotation author.
4. **PurchaseOrder / WorkOrder**: copy items 1:1, carrying `qty`. `WorkOrderItem` description and qty are snapshots.
5. **WorkOrder PDF** (`work-order-pdf.ts:127–131`) already handles a missing device identifier: `deviceIdentifier()` returns `line(requestItem.deviceId) ?? line(device?.serialNumber)` and prints `"—"` when both are absent. **The PDF layer is already null-safe for Device ID.**

Observations:

- The customer's original device wording is **never carried past the requisition**. Downstream documents show `DeviceType.name` + `QuotationItem.description` (author-written).
- `QuotationItem.deviceId` (real FK to `Device`) is already **nullable and optional** and unused in the common path — devices are typically not pre-registered.
- Nothing in the built chain consumes `CalibrationRequestItem.deviceId` except display (PDF) and tests.

---

## 4. Device ID Findings

| Question | Finding |
| --- | --- |
| Is Device ID currently nullable? | **No.** `String` NOT NULL at DB; `z.string().min(1)` in the contract; required in the UI. |
| Does a missing Device ID have a valid representation? | **Not today.** A user with no ID must type something. There is a real risk that production rows already contain placeholder junk (`-`, `0`, `000`, `N/A`). |
| Is Device ID a FK to `Device.id`? | **No** — and deliberately so. The FK was dropped in migration `20260826120000`. It is a customer-supplied free-text inventory/asset tag. |
| Downstream impact of `deviceId = NULL`? | **Minimal in built code.** Quotation build reads only `requestItemId`; WorkOrder PDF is already null-safe (`"—"`). `CalibrationJob` needs a real `Device` but that materialization step is unbuilt, so there is nothing to break. |
| Traceability impact? | Low. A null Device ID is *more* honest than a fake `"000"`. Audit questions ("what did the customer submit?") are better served by a real `customerDeviceName` (section 5) than by an overloaded Device ID. |

**Conclusion:** Device ID **should be nullable**. The current required constraint forces data falsification. Making it optional is a low-risk additive change (drop NOT NULL, relax zod to `.optional()` / `.nullable()`, make the UI field optional). The only pre-work is a one-time check/cleanup of existing placeholder values.

---

## 5. Customer Device Name Findings

| Question | Finding |
| --- | --- |
| Is `customerDeviceName` represented? | **No.** No field holds the customer's original wording. |
| Is there a `model` field on the requisition item? | **No.** (The Excel format in the requirements has a `Model` column with nowhere to land.) |
| Can `notes` absorb it? | Technically yes, but that is field abuse — `notes` is free-form instruction text ("annual calibration"), not structured data, and cannot be matched/searched reliably. |
| What is lost today? | Everything about how the customer described the device. Only the internal `DeviceType` selection survives. For manual entry this is acceptable (the user consciously picked the type); for Excel import it is **not** acceptable (requirement §3, §8: "Original customer name should not be lost"). |

**Conclusion:** A dedicated `customerDeviceName String?` field is the minimal, correct change. It is needed *before* Excel import can be built, and is harmless for the manual flow (nullable, optional). Whether to also add `model String?` is a smaller open question — recommended yes, since the initial Excel template has a Model column and Model is a natural disambiguator during matching.

---

## 6. DeviceType Alias Findings

### 6.1 Is `DeviceTypeAlias` the right design?

**It is a reasonable design, but it should not be built yet, and not in isolation.**

Arguments for a `DeviceTypeAlias` child model:
- Keeps the official `DeviceType.name` clean (requirement: do not rename the master).
- Gives Excel import a deterministic second matching pass (`exact name` → `exact alias`).
- Structurally identical to the existing `DeviceModel` child pattern — low architectural novelty.
- Global scope mirrors `DeviceType` cleanly.

Arguments against building it now:
- **No consumer exists.** Manual requisition entry has a `DeviceType` selector; the user picks the type directly. Aliases only pay off when something is doing *automated* matching — i.e. Excel import, which is not built.
- It adds a master-data surface (CRUD, seeding, admin UI, RBAC) that has to be maintained.
- The requirement explicitly says "the goal is NOT to design a sophisticated master-data system."

**Recommendation:** Approve the *concept*. Implement `DeviceTypeAlias` **together with** the Excel importer, not before. Until then, `customerDeviceName` + manual mapping in the import preview UI covers the same need with less standing infrastructure.

### 6.2 If/when built — design constraints

| Concern | Recommendation |
| --- | --- |
| Scope | Global (no `companyId`), mirroring `DeviceType`. |
| Shape | `DeviceTypeAlias { id, deviceTypeId FK, alias String, normalizedAlias String, isActive Boolean @default(true), createdAt }` |
| Normalization | `normalizedAlias` = `lower(trim(collapse-internal-whitespace(alias)))`. Store it; match on it. |
| Uniqueness | `@@unique([normalizedAlias])` **globally**. This makes "same alias → two DeviceTypes" **impossible by construction**. |
| Two DeviceTypes want the same alias | Forbidden by the unique constraint. The second one must choose a more specific alias, or the ambiguity is resolved by a human. Do **not** build multi-target alias resolution for MVP — it is exactly the "sophisticated master-data system" the requirement rules out. |
| Case sensitivity | Handled by `normalizedAlias`. Never match on raw `alias`. |
| Active/inactive | `isActive` flag; inactive aliases are ignored by the matcher but retained for history. |
| Collision with `DeviceType.name` | Optional: also index `lower(DeviceType.name)` and reject creating an alias equal to an existing type name under a *different* type. |

---

## 7. Excel Import Findings

### 7.1 Existing infrastructure

**There is no spreadsheet-import infrastructure anywhere in MEDCAL.** Grep across the repo for `xlsx | exceljs | SheetJS | papaparse` returns only one doc file, no code. There is:

- A generic `FilesModule` / `FileObject` (polymorphic `ownerType` / `ownerId`) — used for **evidence storage**, not parsing. It could store the uploaded source file but does not help parse it.
- No multipart/file-upload endpoint pattern in any module reviewed.
- No staging / preview / batch-confirm pattern. Every create endpoint (`calibration-requests`, `quotations`, `work-orders`) is single-shot and atomic.

So Excel import is **greenfield** on every axis: parsing library, upload endpoint, preview/staging model, confirm endpoint, and preview UI.

### 7.2 Fit of the proposed matching sequence

The proposed sequence (exact `DeviceType.name` → exact `DeviceTypeAlias.alias` → else mark unmatched, require user confirmation; fuzzy only as an assist, never auto-commit) is **sound and fits the architecture** — but it forces a **two-phase flow** the current API does not have:

```
Phase 1  POST .../import/preview   (multipart file)
         → parse rows
         → per row: validate (Nama Alat required, Qty > 0), attempt match
         → return a preview payload: [{ rowNo, customerDeviceName, model, qty, deviceId|null,
                                        matchStatus: EXACT_NAME | ALIAS | UNMATCHED | AMBIGUOUS,
                                        suggestedDeviceTypeId? }]
         → NOTHING persisted

Phase 2  POST .../import/commit    (the reviewed/mapped rows, every row now has a deviceTypeId)
         → reject if any row still UNMATCHED
         → create CalibrationRequest + items in one transaction (reuse existing create path)
```

The Phase 2 commit can largely **reuse the existing `CalibrationRequestsService.create` transaction** — it already does `assertDeviceTypesExist` + `createMany` items. The new work is Phase 1 (parse + match + preview) and the preview UI.

### 7.3 Field requirements Excel import imposes on the schema

| Excel column | Needs schema support | Status |
| --- | --- | --- |
| Nama Alat (required) | `customerDeviceName String?` | **missing** |
| Model (optional) | `model String?` | **missing** |
| Qty (required, > 0) | see section 8 | **missing / decision** |
| Device ID (optional, empty → NULL) | `deviceId String?` | **currently NOT NULL** |
| (derived) matched type | `deviceTypeId` | exists |
| (optional) how it matched | `matchedBy` enum | missing — see section 9 |

**Excel import cannot be built until at minimum `customerDeviceName` and nullable `deviceId` exist**, and the Qty decision (section 8) is made.

---

## 8. Qty Interpretation Findings

### 8.1 What one Excel row means — evidence from the domain model

Row: `Tensimeter | AB-123 | Qty 5 | (blank)`

| | Option A — one row, `qty = 5` | Option B — five rows, `qty = 1` each |
| --- | --- | --- |
| `CalibrationRequestItem` | needs a new `qty Int` field | no schema change (5 rows) |
| Quotation bijection (`assertFullScopeItems`) | **breaks** — 1 request item but pricing/jobs need 5 units; the strict id-set equality check has no concept of qty fan-out | **holds** — 5 request items ↔ 5 quotation lines, unchanged |
| `QuotationItem.qty` | would carry the 5 | each line qty 1 (or merged later — but merge logic doesn't exist) |
| `CalibrationJob` (`@@unique([workOrderId, deviceId])`, one per `Device`) | still needs 5 `Device` rows + 5 jobs — the fan-out from qty=5 to 5 devices has **no home** in the current or planned code | naturally 5 → 5, each row already device-granular |
| Per-unit Device ID | one row can hold only one `deviceId`; the other 4 units lose theirs | each row holds its own `deviceId` (or NULL) |
| Downside | forces new qty-explosion logic somewhere between requisition and job — a seam that is currently empty and undesigned | 5 near-identical rows when devices are unnamed; noisier list UI; pricing may prefer a single "5 units" line |

### 8.2 Conclusion

**Option B (explode one Excel row of qty N into N `CalibrationRequestItem` rows) is more consistent with the existing domain model.** The chain is already device-granular at the job level and enforces a 1:1 requisition-item ↔ quotation-line bijection. Option A would require building a qty-fan-out mechanism in the exact seam (`WorkOrder → CalibrationJob`) that is currently unbuilt, and would break `assertFullScopeItems`.

**However, this is ultimately a business decision** and must be confirmed, because:
- Commercial preference: sales may want the quotation to show "Calibration – Sphygmomanometer ×5" as one priced line, not five.
- If the 5 units are physically identical and the customer gave no IDs, five rows are visual noise.

A defensible compromise if the business wants line-level qty on the *quotation* only: keep requisition Option B (explode), then let the quotation author **merge** identical request items into one priced line with `qty` — but that merge capability does not exist today and would also require reworking `assertFullScopeItems`. Not recommended for MVP.

**Recommended for MVP:** Option B, explode on import. No `qty` field on `CalibrationRequestItem`.

---

## 9. Traceability / Audit Findings

MEDCAL must be able to answer: "what did the customer submit?", "what type did we map it to?", "why?".

| Data need | Covered by | Verdict |
| --- | --- | --- |
| What the customer submitted | `customerDeviceName` (+ `model`, `deviceId`) | **needs the new field**; today only the mapped `DeviceType` survives |
| What we mapped it to | `deviceTypeId` (exists) | covered |
| Why we mapped it that way | `matchedBy` enum: `EXACT_NAME` / `ALIAS` / `USER_MAPPING` / `MANUAL_ENTRY` | **not needed yet** — only meaningful once automated matching (import + alias) exists. For manual entry, "why" = "a user picked it", which is self-evident and not worth a column. |
| Which alias matched | `matchedAliasId String?` (FK to `DeviceTypeAlias`) | defer with the importer |
| The raw uploaded file | `FileObject` with a new `ownerType` (e.g. `CALIBRATION_REQUEST_IMPORT`) | defer with the importer; nice-to-have for dispute resolution |

**Conclusion:** Add `customerDeviceName` now. Defer `matchedBy` / `matchedAliasId` until the importer is built; when added, `matchedBy` must be a Prisma enum, not a string (follow the `CalibrationValueType` precedent, not the `EquipmentType.category` precedent, because the value set is closed and drives logic).

---

## 10. Risks / Ambiguities

| # | Risk | Severity | Mitigation |
| --- | --- | --- | --- |
| R1 | Existing `CalibrationRequestItem` rows contain placeholder Device IDs (`-`, `000`, `N/A`) that are indistinguishable from real IDs | Medium | One-time query + report before relaxing the constraint; optionally normalize known placeholders to NULL in a data migration (needs sign-off — data change, out of audit scope) |
| R2 | The `CalibrationRequest.deviceId (string) → CalibrationJob.deviceId (Device FK)` materialization is **completely unbuilt**. Every decision here writes constraints into an undesigned seam | High | Design the WorkOrder→Job step explicitly before or alongside this work; do not let it be discovered ad hoc |
| R3 | `assertFullScopeItems` hard-codes a 1:1 requisition-item ↔ quotation-line bijection. Any future qty-on-requisition-item design silently breaks quotation creation | High | Lock Qty = Option B (explode); if Option A is ever chosen, `assertFullScopeItems` must be redesigned first |
| R4 | Global `DeviceTypeAlias` uniqueness vs. real-world ambiguity — a term like "monitor" legitimately maps to several types | Medium | MVP: forbid duplicates via `@@unique([normalizedAlias])`; ambiguous terms simply don't get an alias and fall to manual mapping |
| R5 | Alias normalization drift (case, whitespace, punctuation, Indonesian/English mix "Tensimeter" vs "Tensi meter") | Medium | Store and match only `normalizedAlias`; document the normalization function; fuzzy matching is assist-only and never auto-commits |
| R6 | Excel import as a new atomic-vs-staged flow diverges from every existing single-shot endpoint | Medium | Explicit two-phase preview/commit; reuse the existing `create` transaction for commit |
| R7 | `DeviceType` is global but MEDCAL is operationally single-company today — a future second company inherits another company's aliases | Low | Acceptable for MVP; revisit only if true multi-tenant master data becomes real |
| R8 | Scope creep: `model`, `DeviceModel` linkage, capability selection, fuzzy matching all sit one step away from this work | Medium | Hold the line: `customerDeviceName` + nullable `deviceId` + (deferred) alias table + importer. Nothing else. |

---

## 11. Recommended Minimal Architecture

**Phase 1 — now (unblocks the manual flow and prepares for import):**

1. `CalibrationRequestItem.deviceId` → **nullable** (`String?`). Relax the zod contract and the UI. `deviceTypeId` stays required.
2. Add `CalibrationRequestItem.customerDeviceName String?` — the customer's original wording, preserved verbatim.
3. Add `CalibrationRequestItem.model String?` — optional, matches the Excel template and aids future matching.
4. One-time audit of existing `deviceId` values for placeholder junk (report only; cleanup is a separate approved data task).

**Phase 2 — with the Excel importer (single coordinated change):**

5. `DeviceTypeAlias` global child model of `DeviceType` (design in section 6.2).
6. `matchedBy` enum + optional `matchedAliasId` on `CalibrationRequestItem`.
7. Two-phase import endpoints: `POST /calibration-requests/import/preview` (parse + match, no persistence) and `POST /calibration-requests/import/commit` (reuse `create` transaction).
8. Import preview / mapping UI (unmatched rows must be mapped before commit is allowed).
9. Qty = **explode** one Excel row of qty N into N items. No `qty` field on `CalibrationRequestItem`.

**Explicitly NOT in scope (either phase):**

- Any change to `Device`, `DeviceModel`, `DeviceCapability*`, `DeviceCalibrationParameter`, `Uom`.
- Any FK from `CalibrationRequestItem.deviceId` to `Device.id`.
- Multi-target alias resolution / alias priority / alias scoping per company.
- Fuzzy matching that auto-commits.
- Qty as a numeric field on the requisition item.
- Reworking `assertFullScopeItems` or the quotation bijection.

---

## 12. Proposed Schema Changes — DESIGN ONLY

> Not to be applied. Shown for review.

```prisma
model CalibrationRequestItem {
  id                 String   @id @default(cuid())
  companyId          String
  requestId          String
  deviceTypeId       String                          // unchanged — REQUIRED FK

  /// Customer's original device wording, preserved verbatim (e.g. "Tensimeter Digital").
  /// Nullable: not always known for legacy / manual rows.
  customerDeviceName String?                          // NEW

  /// Customer-provided model/type designation from the requisition or Excel "Model" column.
  model              String?                          // NEW (optional — open question 12.2)

  /// Customer-provided physical device identifier (free-text). Not a FK to Device.
  /// Now NULLABLE — a missing Device ID is a valid business state; never store "000".
  deviceId           String?                          // CHANGED: String -> String?

  notes              String?
  createdAt          DateTime @default(now())

  // ---- Phase 2 (with Excel importer) — NOT part of Phase 1 ----
  // matchedBy       DeviceTypeMatchSource?           // enum: EXACT_NAME | ALIAS | USER_MAPPING | MANUAL_ENTRY
  // matchedAliasId  String?                          // FK -> DeviceTypeAlias.id, nullable

  request        CalibrationRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  deviceType     DeviceType         @relation(fields: [deviceTypeId], references: [id])
  quotationItems QuotationItem[]

  @@index([requestId])
  @@index([deviceTypeId])
}

// ---- Phase 2 only ----
// model DeviceTypeAlias {
//   id              String   @id @default(cuid())
//   deviceTypeId    String
//   alias           String                           // display form, as entered
//   normalizedAlias String                           // lower(trim(collapse-ws(alias)))
//   isActive        Boolean  @default(true)
//   createdAt       DateTime @default(now())
//   updatedAt       DateTime @updatedAt
//   deviceType      DeviceType @relation(fields: [deviceTypeId], references: [id])
//   @@unique([normalizedAlias])                       // one alias -> at most one DeviceType, globally
//   @@index([deviceTypeId])
// }
//
// enum DeviceTypeMatchSource { EXACT_NAME  ALIAS  USER_MAPPING  MANUAL_ENTRY }
```

Migration notes (Phase 1):

- `ALTER TABLE "CalibrationRequestItem" ALTER COLUMN "deviceId" DROP NOT NULL;` — safe on any data.
- `ADD COLUMN "customerDeviceName" TEXT;` / `ADD COLUMN "model" TEXT;` — nullable, no backfill.
- No index changes.
- No destructive operation. Existing rows keep their current `deviceId` values (placeholder cleanup is a separate, approved task).

### 12.2 Open sub-question — `model` field

`model` is proposed as optional. If the business confirms Model is never meaningful at requisition time (it is captured later at `Device` / `DeviceModel` level), drop it and let the Excel `Model` column fold into `customerDeviceName` or `notes`. Recommended: keep it — it is cheap and the Excel template already has the column.

---

## 13. Proposed API Changes — DESIGN ONLY

**Phase 1:**

- `packages/shared/src/schemas/index.ts` — `calibrationRequestItemInputSchema`:
  - `deviceId: z.string().min(1)` → `deviceId: z.string().trim().min(1).max(120).optional()` (empty string coerced to `undefined` / NULL).
  - add `customerDeviceName: z.string().trim().min(1).max(200).optional()`.
  - add `model: z.string().trim().min(1).max(120).optional()`.
- `CalibrationRequestsService.create` / `.update` — pass the two new fields through the existing `createMany`. No new validation beyond what exists (`assertDeviceTypesExist` stays).
- No controller signature change; no new permission.

**Phase 2 (importer):**

- New controller routes on the existing `CalibrationRequestsController`:
  - `POST /calibration-requests/import/preview` — `@RequirePermission("calibrationRequest", "create")`, multipart, returns preview rows with `matchStatus`. No persistence.
  - `POST /calibration-requests/import/commit` — same permission, body = reviewed rows (every row carries a resolved `deviceTypeId`), returns the created `CalibrationRequest`. Rejects if any row unresolved. Reuses the `create` transaction.
- New `DeviceTypeAliasService` + admin CRUD under device-types module (global master), `@RequirePermission("deviceType", ...)` — reuse existing DeviceType permissions, do not mint new ones.
- Parsing library: pick one (`exceljs` is maintenance-friendly and dependency-light) — decision belongs to implementation, not this audit.

---

## 14. Proposed UI Flow — DESIGN ONLY

**Phase 1 — "New / Edit Requisition" (`apps/portal/.../calibration-requests/new`, `[id]/edit`):**

Per device row, following the existing card/`DeviceTypeItemSelect` pattern:

```
Device Type *          [ Blood Pressure Monitor  ▼ ]      (unchanged, required)
Customer Device Name   [ Tensimeter Digital        ]      (new, optional — "as the customer calls it")
Model                  [ AB-123                    ]      (new, optional)
Device ID              [ BPM-001                   ]      (label loses the red asterisk; placeholder "Optional")
Notes                  [ Annual calibration        ]
```

- Submit validation: only `deviceTypeId` is mandatory per filled row. Remove the "Setiap device wajib memiliki Device Type dan Device ID" rule; keep "Setiap device wajib memiliki Device Type".
- Empty Device ID sends `undefined`, stored as NULL. Never send `"-"` / `"000"`.

**Phase 2 — Excel import:**

```
[ Add Device ]   [ Import from Excel ]

Import from Excel:
  1. Download template (Nama Alat | Model | Qty | Device ID)
  2. Upload .xlsx  →  preview table:

     Row  Nama Alat          Model    Qty  Device ID  Matched Device Type        Status
     1    Tensimeter         AB-123   5    —          Sphygmomanometer (alias)   ✔ auto
     2    Bed Side Monitor   BSM-501  3    BSM001     Patient Monitor (name)     ✔ auto
     3    Dental Unit        DU-100   2    —          ⚠ pick one ▼               ✖ needs mapping

  3. Resolve all ✖ rows  →  [ Create Requisition ] (disabled while any row unresolved)
```

- Qty 5 on row 1 → 5 line items created (Option B).
- Every imported line keeps `customerDeviceName` = the "Nama Alat" cell verbatim.

---

## 15. Open Business Decisions

| # | Decision | Needed before |
| --- | --- | --- |
| D1 | **Confirm Device ID may be NULL** and that no placeholder is ever acceptable. | Phase 1 |
| D2 | **Placeholder cleanup:** should existing `deviceId` values like `-` / `000` / `N/A` be normalized to NULL in a data migration? (data change — separate approval) | Phase 1 (or defer) |
| D3 | **Keep `model` on the requisition item?** Yes/no. | Phase 1 |
| D4 | **Qty = Option B (explode to N rows).** Confirm the business accepts N near-identical rows and does not require a single priced "×N" quotation line at requisition time. | Phase 2 (design impact now) |
| D5 | **Approve `DeviceTypeAlias` as a global child model with a single-target unique constraint** (no ambiguous / multi-target aliases in MVP). | Phase 2 |
| D6 | **Alias administration owner:** who curates aliases — same role as DeviceType admin? | Phase 2 |
| D7 | **Fuzzy matching:** allowed as an assist in the preview (highlighted suggestion) but never auto-committed — confirm. | Phase 2 |
| D8 | **Design the `WorkOrder → CalibrationJob` seam** (how free-text `deviceId` + `DeviceType` become real `Device` rows + jobs). Independent of this audit but blocked-adjacent. | Before CalibrationJob module |
| D9 | Is the requisition ever going to be **customer self-service**? If yes, the matching-confidence UX and RBAC assumptions change. | Phase 2 |

---

## Concise Recommendation

**A. What SHOULD be implemented (Phase 1, low risk, additive):**
- Make `CalibrationRequestItem.deviceId` nullable (DB + zod + UI).
- Add `CalibrationRequestItem.customerDeviceName String?`.
- Add `CalibrationRequestItem.model String?` (pending D3).
- Audit existing `deviceId` values for placeholders (report).

**B. What should NOT be implemented yet:**
- `DeviceTypeAlias` in isolation — build it *with* the Excel importer, not before.
- `matchedBy` / `matchedAliasId` — defer to Phase 2; make `matchedBy` an enum when added.
- Any `qty` field on `CalibrationRequestItem`.
- Any FK from `deviceId` to `Device`.
- Fuzzy auto-matching, multi-target aliases, per-company alias scoping.
- Any change to `Device`, `DeviceModel`, capability/parameter models, `Quotation` bijection logic.

**C. Business decisions still needed:** D1–D9 above — most critically D1 (nullable Device ID), D4 (Qty = explode), D5 (alias model shape), and D8 (the unbuilt WorkOrder→Job seam).

**D. Is `DeviceTypeAlias` recommended?** Yes as a concept, no as a standalone next step. It is architecturally clean (mirrors `DeviceModel`), but it has zero consumers until Excel import exists. Ship it in the same change as the importer, global-scoped, with `@@unique([normalizedAlias])` so one alias can never map to two types.

**E. Should `customerDeviceName` be stored separately?** Yes. It is the single most important gap. Without it the customer's original wording is lost the moment a `DeviceType` is selected, and requirement §3/§8/§8-traceability cannot be met. It is a nullable, additive, zero-risk field.

**F. Should Device ID remain nullable?** It should *become* nullable. It is currently required, which forces users to invent fake identifiers. A NULL Device ID is a valid, honest business state; downstream code (quotation build, WorkOrder PDF) already tolerates its absence.

**G. How should Qty be represented?** By **exploding** one requested quantity of N into N `CalibrationRequestItem` rows (Option B). This matches the existing device-granular `CalibrationJob` model (`@@unique([workOrderId, deviceId])`) and the strict 1:1 requisition-item ↔ quotation-line bijection enforced by `assertFullScopeItems`. Adding a numeric `qty` to the requisition item would break that bijection and push an undesigned qty-fan-out into the WorkOrder→Job seam. Confirm with the business (D4) that per-unit rows are acceptable at requisition time.
