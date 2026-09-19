# MEDCAL — Price List / Tariff
## Phase 0: Price List Architecture Audit + Business Rule Discovery

**Status:** AUDIT ONLY — no code, schema, migration, data, RBAC, or UI was changed.
**Date:** 2026-08-30
**Primary scope:** `CalibrationRequest → CalibrationRequestItem → Quotation → QuotationItem`
**Secondary (verification only):** `Quotation → PO → WO → Invoice`

---

## 1. Executive Summary

MEDCAL has **no Price List / Tariff mechanism in use today**. Quotation unit prices are
**100% hand-keyed** by the user on the quotation form. A dormant `ServiceTariff` model
exists in the schema (since the very first migration) but has **no service, controller,
CRUD, seed data, RBAC resource, or UI**, and its `unitPrice` is **never read** by any code
path. `QuotationItem.tariffId` is a nullable column the portal never sends.

The commercial chain is already well-formed for introducing a Price List:

- **Grain is correct.** The system prices at **DeviceType-line grain with an aggregate
  `qty`** — one requisition line (`Sphygmomanometer, qty 5`) becomes one quotation line
  (`qty 5 × unitPrice`), enforced by a strict 1:1 bijection (`assertFullScopeItems`).
- **Snapshot behavior already exists.** `QuotationItem.unitPrice` is a stored `Decimal(18,2)`
  written verbatim from the request payload and never re-derived — exactly the
  "master vs. transaction snapshot" separation a Price List needs.
- **Downstream already consumes the quotation result.** `PurchaseOrderItem` copies
  `qty / unitPrice / discountAmount / lineTotal` directly from `QuotationItem`.
  `WorkOrderItem` carries no money at all. No Invoice module is implemented.
- **A single calculation engine exists** in `quotations.service.ts` (per-line
  `qty × unitPrice − discount`, header-level tax via the `Tax` master, `ROUND_HALF_UP`
  to 2 dp). A Price List must reuse it, not duplicate it.

**What is missing:** any link from `DeviceType` to a price; any automatic price lookup on
quotation creation; effective-dating / versioning of prices; a price-change audit trail;
and — a latent bug — the quotation form **hard-codes line `qty` to `1`** and ignores
`CalibrationRequestItem.qty`.

**Recommended architecture:** a new **`PriceListItem`** master keyed by
`(companyId, deviceTypeId, effectiveFrom)` with `unitPrice`, nullable `effectiveUntil`,
and `isActive`; consumed **only** at quotation-item seeding time to pre-fill
`QuotationItem.unitPrice` (which remains the immutable snapshot). Service-mode and
parameter-level pricing are **not justified by current evidence** and are left as open
business decisions.

---

## 2. Current Requisition → Quotation Architecture

### 2.1 Creation path (manual, always from a requisition)

| Step | Evidence |
|---|---|
| Entry point is the requisition detail page only | `apps/portal/src/app/management/calibration-requests/[id]/page.tsx:101-105` — button shown when `capabilities.quotationCreate && status ∈ {SUBMITTED, IN_QUOTATION} && !existingQuotation`; links to `/quotations/new?requestId=…` (`:238`) |
| New-quotation page refuses to render without `requestId` | `apps/portal/src/app/management/quotations/new/page.tsx:78-98` ("Quotation hanya dapat dibuat dari Requisition.") |
| Form items pre-seeded from requisition items | `new/page.tsx:67-72` → `itemsFromRequest()` in `quotations-ui.tsx:415-431` |
| User must type every `unitPrice` before submit | `new/page.tsx:182-185`; `quotation-form-fields.tsx:209-219` (free `<input type="number" min="0">`) |
| API create | `POST /quotations` → `QuotationsController.create` (`quotations.controller.ts:37-52`) → `QuotationsService.create` (`quotations.service.ts:257-359`) |
| No automatic/event-driven creation | grep: no job, hook, or cron creates a `Quotation` |

### 2.2 Server-side guards in `create()` (`quotations.service.ts:257-359`)

1. Load `CalibrationRequest` by `id + companyId`, `include: { items: true }` (`259-268`).
2. Require request status ∈ `{SUBMITTED, IN_QUOTATION}` (`QUOTABLE_REQUEST_STATUSES`,
   line 21; check `270-279`, `INVALID_STATUS_FOR_QUOTATION`).
3. Reject if any quotation already exists for the request (`281-291`,
   `DUPLICATE_QUOTATION_FOR_REQUEST`) — also enforced by `Quotation.requestId @unique`
   (schema `1306`). **This check is status-agnostic**: a CANCELLED quotation still blocks
   re-quoting.
4. `assertFullScopeItems(tx, request.id, input.items)` — see §4.3.
5. `assertTariffsExist` (`154-170`) — if a `tariffId` is present, only verifies it exists
   in the company. **`ServiceTariff.unitPrice` is never read.**
6. `assertDevicesBelongToCustomer` (`172-189`) — validates any `deviceId` (FK→`Device`)
   belongs to the customer.
7. `resolveDocumentTax` (`137-152`) — resolves `input.taxCode` against the active `Tax` row.
8. Allocate document number (`DocumentNumberService.allocate`, `306-313`).
9. `buildItemRows` + `computeHeaderTotals`, then `quotation.create` + `quotationItem.createMany`.
10. Side effect: if request was `SUBMITTED`, bump to `IN_QUOTATION` (`347-352`).

### 2.3 Downstream (verification only)

```
Quotation ──1:1 lines──▶ PurchaseOrder
  PurchaseOrderItem copies qty/unitPrice/discountAmount/lineTotal FROM QuotationItem
      (apps/api/src/modules/purchase-orders/purchase-orders.service.ts:160-172)
    └─▶ WorkOrder / WorkOrderItem  — description + qty only, NO money (schema 1462-1477)
    └─▶ Invoice / InvoiceItem      — schema exists (1710-1719) but NO invoice module implemented
```

Downstream documents **do not** and **cannot** look up the Price List — see §17.

---

## 3. Prisma Schema Findings

Source: `packages/db/prisma/schema.prisma`.

### 3.1 `CalibrationRequest` (1210–1242)

- `serviceMode ServiceMode` — **required, no default** (1216). Origin of service mode.
- `expectedDate DateTime? @db.Date` (canonical scheduling); `desiredScheduleNote` deprecated.
- `status CalibrationRequestStatus @default(DRAFT)` — `DRAFT, SUBMITTED, IN_QUOTATION,
  CANCELLED, FULFILLED` (enum 107–113).
- `quotation Quotation?` — 1:0..1 back-relation.
- **No monetary fields.**

### 3.2 `CalibrationRequestItem` (1244–1277)

```
deviceTypeId       String            // required FK → DeviceType
customerDeviceName String?           // customer's verbatim wording, preserved
model              String?           // free text, not a Model FK
deviceId           String?           // customer's free-text physical id, NOT a FK, nullable-valid
qty                Int   @default(1) // CHECK qty >= 1 (migration 20260829175600)
notes              String?
createdAt          DateTime @default(now())   // NOTE: no updatedAt
quotationItems     QuotationItem[]
```

- **Grain:** one row per requested device line. `qty` is an **`Int` aggregate count**
  (Excel import stores the spreadsheet Qty here; manual "+ Requisition" entry adds one row
  per device with `qty` = 1). **Not exploded into N rows.**
- **No `unitPrice`, no `amount`, no Decimal/money field.**

### 3.3 `ServiceTariff` (1283–1299) — the dormant stub

```
id        String   @id @default(cuid())
companyId String
code      String
name      String
unitPrice Decimal  @db.Decimal(18, 2)
currency  String   @default("IDR")
isActive  Boolean  @default(true)
createdAt / updatedAt
company            Company @relation(..., onDelete: Cascade)
items              QuotationItem[]
purchaseOrderItems PurchaseOrderItem[]
@@unique([companyId, code])
```

- Flat `code → unitPrice` catalog, **per company**.
- **No `deviceTypeId`** — nothing connects a tariff to a DeviceType, parameter, service
  mode, or customer.
- **No `effectiveFrom` / `effectiveUntil`** — no historical or scheduled pricing.
- **No versioning / status enum** — only an `isActive` toggle; edits mutate in place.
- Present since `20260813063336_init_better_auth_fcmtoken`. **No `ServiceTariff` service,
  controller, module, seed, RBAC resource, or portal UI exists.**

### 3.4 `Quotation` (1301–1334)

```
requestId            String  @unique           // 1:1 with CalibrationRequest
source               QuotationSource @default(PORTAL)
status               QuotationStatus @default(DRAFT)
validUntil           DateTime?                  // quote expiry only; never auto-checked
subtotal             Decimal @db.Decimal(18,2)
headerDiscountAmount Decimal @default(0) @db.Decimal(18,2)
taxCode              String                     // snapshot string, NOT an FK to Tax
taxRate              Decimal @db.Decimal(5,4)   // snapshot
taxAmount            Decimal @db.Decimal(18,2)
totalAmount          Decimal @db.Decimal(18,2)
currency             String  @default("IDR")    // defaulted, never read by logic
approvedAt / approvedByUserId (String?, no relation) / customerApprovedAt
@@unique([companyId, number]); @@index([companyId, status]); @@index([companyId, taxCode])
```

### 3.5 `QuotationItem` (1336–1357)

```
deviceId       String?   // FK → Device  (customer's registered device; portal never sends it)
requestItemId  String?   // FK → CalibrationRequestItem  (always sent via API today)
tariffId       String?   // FK → ServiceTariff  (portal never sends it)
description    String
qty            Decimal @default(1) @db.Decimal(18,4)
unitPrice      Decimal @db.Decimal(18,2)
discountAmount Decimal @default(0) @db.Decimal(18,2)
lineTotal      Decimal @db.Decimal(18,2)
createdAt      DateTime @default(now())   // NOTE: no updatedAt
@@index([quotationId])
```

- **Grain:** one priced line per quotation, optionally traceable to
  `requestItemId` / `deviceId` / `tariffId` (all nullable at the DB level).
- **No per-line tax** (tax is header-only). **No audit columns.**

### 3.6 Other relevant models

| Model | Lines | Notes |
|---|---|---|
| `DeviceType` | 916–936 | Global master, `code @unique`, `isActive`. **No price field.** |
| `DeviceTypeAlias` | 946–960 | Global; `normalizedAlias @unique` ⇒ one alias → at most one DeviceType. Used **only** by Excel import matching. |
| `DeviceCalibrationParameter` | 1151–1180 | `toleranceMin/Max Decimal(18,4)` (metrology), `decimalPlaces Int?`. **No money field.** |
| `Customer` | 840–874 | No default currency, no price tier, no payment terms, no customer-group field. |
| `Company` | 310–345 | `id @db.Char(3)`; `settingsJson Json?` is the only config hook; no currency column. |
| `Tax` | 1648–1663 | `taxCode`, `taxRate Decimal(5,4)`, `isActive`, `isExclude Boolean @default(false)`. `@@unique([companyId, taxCode])`. No effective dating. |
| `DocumentNumberSequence` | 347–361 | Per `(companyId, documentType, year)`; `QUOTATION` → prefix `QUO`, format `QUO/YYYY/MM/NNNNN`. |
| `PurchaseOrderItem` | 1395–1422 | Own `unitPrice/discountAmount/lineTotal` snapshot; `quotationItemId` required. |
| `WorkOrderItem` | 1462–1477 | `description` + `qty` only — **no money**. |
| `InvoiceItem` | 1710–1719 | `qty Decimal?`, `unitPrice Decimal?`, `amount Decimal` — schema only, no module. |

### 3.7 Monetary conventions (universal)

- Money → `Decimal @db.Decimal(18,2)`; tax rate → `Decimal @db.Decimal(5,4)`;
  quantities → `Decimal @db.Decimal(18,4)` (except `CalibrationRequestItem.qty` = `Int`).
- **No `Float` / untyped money anywhere.** `currency` is a free string defaulting to `"IDR"`.
- No global money/currency utility — helpers live in `quotations.service.ts` (§16).

### 3.8 Status / numbering / versioning fields

- `QuotationStatus`: `DRAFT, SENT, APPROVED, REJECTED, EXPIRED, CANCELLED` (created `DRAFT`).
- **No `revision` / `version` / `supersededBy`** on any commercial document.
- Master-data lifecycle precedent: ubiquitous `isActive Boolean @default(true)`
  (`DeviceCategory`, `DeviceType`, `DeviceTypeAlias`, `EquipmentType`, `Equipment`,
  `ServiceTariff`, `Uom`, `Tax`). One DRAFT/CONFIRMED immutability precedent:
  `EquipmentCalibrationRecordStatus` (1025–1028) — CONFIRMED rows are locked, corrections
  become a new record. **No effective-dating on any master today.**

---

## 4. Current Quotation Pricing Behavior

### 4.1 Price origin — manual entry only

- `quotationItemInputSchema` (`packages/shared/src/schemas/index.ts:376-384`):
  `unitPrice: quotationDecimalSchema.nonnegative()` — **required from the client**;
  `tariffId` optional; `qty: z.coerce.number().int().positive().optional()`.
- `buildItemRows` (`quotations.service.ts:220-253`): `unitPrice: toDecimal(item.unitPrice)`
  — **verbatim**. No lookup, no default, no tariff dereference.
- Round-trip identity proven by `quotations.service.test.ts:312`
  (`input 150000 → result 150000`).
- The portal form seeds `unitPrice: ""` for every line (`quotations-ui.tsx:426`); the user
  types each value.

### 4.2 Snapshot semantics — already correct

- `QuotationItem.unitPrice` is a stored column, written once at create.
- On `update()` (DRAFT only), items are `deleteMany` + `createMany` from the new payload
  (`quotations.service.ts:468-471`) — still a snapshot of the submitted values, never a
  recompute against any master.
- Once status leaves `DRAFT`, the quotation is fully frozen (`update()` throws
  `INVALID_STATUS_FOR_UPDATE`, `:444`). ⇒ **historical prices are inherently preserved.**

### 4.3 `assertFullScopeItems()` (`quotations.service.ts:191-218`) — verbatim

```ts
async function assertFullScopeItems(tx, requestId, items): Promise<void> {
  const requestItems = await tx.calibrationRequestItem.findMany({
    where: { requestId }, select: { id: true },
  });
  const requestItemIds = new Set(requestItems.map((i) => i.id));
  const inputIds = items.map((i) => i.requestItemId);

  if (new Set(inputIds).size !== inputIds.length)
    throw new BadRequestException({ code: "DUPLICATE_REQUEST_ITEM", ... });

  const missingFromInput = [...requestItemIds].filter((id) => !inputIds.includes(id));
  const unknownInInput  = inputIds.filter((id) => !requestItemIds.has(id));
  if (missingFromInput.length > 0 || unknownInInput.length > 0)
    throw new BadRequestException({ code: "QUOTATION_SCOPE_MISMATCH", ... });
}
```

Called from `create()` (`:293`) and `update()` (`:455`). **Assumptions it enforces:**

1. Every quotation line carries a `requestItemId` (dereferenced unconditionally).
2. The mapping requisition-item → quotation-line is **injective** (no duplicates).
3. The mapping is **total & surjective** — the set of `requestItemId`s on the quotation
   must equal the *entire* set of `CalibrationRequestItem.id` for the request.
4. ⇒ **QuotationItem count == CalibrationRequestItem count, 1:1 by id.** Partial quotes,
   extra ad-hoc lines, line merges, and line splits are all impossible through the API.

### 4.4 Answers to the §6 questions (code evidence)

| # | Question | Answer |
|---|---|---|
| 1 | Auto or manual? | **Manual**, always from a requisition (§2.1). |
| 2 | `deviceTypeId` transfer? | **Not stored** on `QuotationItem`. Read at display time via `requestItem.deviceType` join (`quotationInclude`, `quotations.service.ts:29-39`; PDF `:55-58`). |
| 3 | `customerDeviceName` transfer? | **Not transferred, not read anywhere** in the quotation module. |
| 4 | `model` transfer? | **Not transferred, not read.** |
| 5 | `qty` transfer? | **NOT carried.** `itemsFromRequest` hard-codes `qty: "1"` (`quotations-ui.tsx:425`); `CalibrationRequestItem.qty` is ignored. The user may then edit qty freely. Server accepts any positive integer. **← latent bug for Price List (see §6, Risks).** |
| 6 | Is `deviceId` relevant to quotation? | Not for pricing. `QuotationItem.deviceId` is a `Device` FK (different concept from the requisition's free-text `deviceId`); portal never sends it. |
| 7 | Can lines be manually added? | **No** — every line must match an existing `CalibrationRequestItem.id` (`QUOTATION_SCOPE_MISMATCH`). |
| 8 | Can lines be removed? | **No** — full-scope coverage is mandatory. |
| 9 | Can quotation qty differ from requisition qty? | **Yes, technically** — qty is a free field on the quotation form and is not validated against `CalibrationRequestItem.qty`. Today it always starts at 1 regardless of requisition qty. |
| 10 | Manual price entry? | **Yes — it is the only way.** Free numeric input per line; server accepts any `nonnegative()` decimal. |

---

## 5. Commercial Grain

**Confirmed intended flow:**

```
CalibrationRequestItem (deviceTypeId, qty = N)
  └─ 1:1 ─▶ QuotationItem (requestItemId, qty, unitPrice, discountAmount, lineTotal)
             lineTotal = money(qty × unitPrice) − discountAmount
```

- The commercial grain is **DeviceType line + aggregate qty**, not per physical unit.
- Physical device identity is **not** part of the commercial grain: it first becomes
  mandatory at `CalibrationJob.deviceId` (schema `1503`, `@@unique([workOrderId, deviceId])`),
  which is downstream of WO and untouched by pricing.
- ⇒ **A Price List can operate safely at DeviceType grain** without any change to
  `CalibrationRequestItem`, `QuotationItem`, or `CalibrationJob`.

---

## 6. Quantity Flow

**Intended:** `CalibrationRequestItem.qty → QuotationItem.qty`, one line, `amount = qty ×
unitPrice − discount`. Example: `Sphygmomanometer × 5 @ Rp100,000 → qty 5, amount Rp500,000`
(one line, not five).

**Current reality:**
- Math is correct: `computeGrossLine = money(qty.mul(unitPrice))` (`quotations.service.ts:63-65`),
  `lineTotal = gross − discount`.
- **But the qty value does not flow.** `itemsFromRequest` seeds `qty: "1"`
  (`quotations-ui.tsx:425`) and never reads `item.qty` from the requisition. `QuotationItem.qty`
  is `Decimal(18,4)` while the zod schema coerces to a positive **integer**
  (`schemas/index.ts:381`; test rejects `qty: 1.5` — `quotations.service.test.ts:250`).

**Finding:** the qty→qty link is **INFERRED (intended) but currently broken in the UI**.
Fixing `itemsFromRequest` to carry `CalibrationRequestItem.qty` is a prerequisite for a
meaningful auto-priced amount, but it is **out of scope for this audit phase** (it touches
`quotations-ui.tsx`).

---

## 7. DeviceType / Alias Relationship

- `DeviceTypeAlias` (global, no `companyId`) exists purely to map customer wording
  ("Tensimeter", "Blood Pressure Monitor") to the canonical `DeviceType`
  ("Sphygmomanometer") during **Excel import matching**
  (`apps/api/src/modules/calibration-requests/calibration-request-import.service.ts:221-368`).
- `normalizeDeviceTerm(v) = v.trim().toLowerCase().replace(/\s+/g, " ")`
  (`packages/shared/src/utils/index.ts:110`). Matcher tries canonical name → alias → fuzzy
  suggestion (never auto-assigned). Ambiguous aliases are impossible by construction
  (`@@unique([normalizedAlias])`).
- On a matched row: `deviceTypeId` = resolved canonical id; `customerDeviceName` = verbatim
  customer text (for display / traceability). Alias resolution exists **nowhere else**
  (manual requisition entry, quotation, WO all take `deviceTypeId` directly).

**Conceptual pricing flow:**

```
Customer wording ─▶ Alias / matching ─▶ canonical DeviceType.id ─▶ Price List lookup ─▶ QuotationItem.unitPrice
```

The Price List key **must be `DeviceType.id`**, never `customerDeviceName` and never the
alias. `DeviceTypeAlias` is a resolution helper, not a pricing entity.

---

## 8. Natural Pricing Key

| Candidate | Evidence in the repo | Assessment |
|---|---|---|
| **A. `DeviceType`** | `CalibrationRequestItem.deviceTypeId` is the **only** structured commercial identifier on a request line; every quotation/PO PDF prices per device-type line; `DeviceType` is a stable global master with `code @unique` | **RECOMMENDED base key.** MEDCAL has all the data now. |
| B. `DeviceType + ServiceMode` | `serviceMode` is required on `CalibrationRequest` (so it is known at quote time) but is **absent from `Quotation`** and never used commercially | **OPEN BUSINESS DECISION** — plausible (on-site travel cost vs. lab) but zero evidence it currently matters. Design the key so `serviceMode` can be added later as an optional dimension. |
| C. `DeviceType + CalibrationParameter` | No commercial evidence at all (see §9) | **NOT JUSTIFIED.** Defer. |
| D. `DeviceType + Customer` | No customer-pricing / contract / group-price concept anywhere in schema or code | **Future business decision.** Not now. |
| E. `DeviceType + Customer Category` | No customer-category / segment / tier field exists on `Customer` | **Not possible today.** |
| (F.) `DeviceType + Location/Region` | Only `WorkOrder` has geo/address; nothing at quote time | Not applicable. |

**Conclusion:** the natural key is **`(companyId, DeviceType.id)`**, with `effectiveFrom`
completing the identity of a specific tariff version.

---

## 9. Parameter-Level Pricing Analysis

- `DeviceType → DeviceCalibrationParameter[]` exists (e.g. Bed Side Monitor → Heart Rate,
  Respiration, SpO2…), but `DeviceCalibrationParameter` (schema 1151–1180) has **no money
  column** — only `toleranceMin/Max`, `toleranceNote`, `decimalPlaces`, `valueType`, `uomId`.
- No file under `apps/api/src/modules/device-calibration-parameters/` references
  price / tarif / tariff / rate / charge / biaya / harga / cost.
- Quotation, PO PDFs price at line ( = device-type) grain only. WO PDF has no pricing.
  No Invoice module.
- The redesign notes (`docs/claude/plans/device-management/devicecalibrationparameters/
  after-meeting-20260828/implementation_report_redesign.md`) treat parameters as a purely
  metrological concept.

**Finding:** **NOT DETERMINED FROM CURRENT SYSTEM** that pricing is anything other than
per-DeviceType.
**Recommendation (separate from finding):** price **per DeviceType (Option A)**. If the
business later needs parameter add-ons, model them as *additive* `PriceListItem` rows with
an optional `calibrationParameterId`, so the base-device tariff stays the default and the
1:1 line grain is preserved (a parameter charge would need a scope-model change — see Risks).

---

## 10. Service Mode Analysis

- `ServiceMode { ON_SITE, SEND_TO_LAB }` (schema 102–105).
- Set on `CalibrationRequest.serviceMode` at request creation
  (`calibration-requests.service.ts:100`), **required, no default**.
- **Not present on `Quotation` or `PurchaseOrder`.** Re-read from the request and
  snapshotted onto `WorkOrder.serviceMode` at WO creation
  (`work-orders.service.ts:206`, `serviceMode: request.serviceMode`).
- So service mode **is available at quotation time** (via the linked request) but the
  quotation neither stores nor uses it.

**Question — should tariff differ ON_SITE vs SEND_TO_LAB?**
**OPEN BUSINESS DECISION.** No evidence either way. Do not add service-mode pricing fields
in this phase. The recommended schema (§20) keeps the key extensible so a nullable
`serviceMode` column can be added to `PriceListItem` later without a data migration of
existing quotations.

---

## 11. Price List Scope

| Option | Evidence | Assessment |
|---|---|---|
| A. Global | `DeviceType` / `DeviceTypeAlias` / `EquipmentType` are global masters (no `companyId`) | Possible, but inconsistent with commercial masters. |
| **B. Company-specific** | `ServiceTariff` (`@@unique([companyId, code])`), `Tax` (`@@unique([companyId, taxCode])`), `Quotation`, `Customer` are all `companyId`-scoped | **RECOMMENDED** — matches every existing commercial master. |
| C. Customer-specific | No customer-pricing concept anywhere | **OPEN / future.** Not supported today. |
| D. Customer-group-specific | No customer-group / segment field on `Customer` | **Not possible today.** |

**Recommendation:** **company-specific** (`companyId` on `PriceListItem`), mirroring
`ServiceTariff` and `Tax`.

---

## 12. Effective Date / Versioning

**Requirement (from the brief):** a quotation created 2026-08-25 must use the Rp100,000
tariff; one created 2026-09-05 must use Rp120,000 — even after the master changes.

**Current state:** **no effective-dating on any master.** `ServiceTariff` edits mutate in
place; `Tax` likewise. The only date-range validity in the schema is on transactional /
evidence rows (`Quotation.validUntil`, `Certificate.validUntil`,
`EquipmentCalibrationRecord.validFrom/validUntil`), and `EquipmentCalibrationRecord` uses
an **append-only** model with a `DRAFT/CONFIRMED` lock (schema 1021–1039).

**Recommendation (RECOMMENDED, no existing precedent on masters):**
`PriceListItem` carries `effectiveFrom DateTime @db.Date` and `effectiveUntil DateTime?
@db.Date`. A price change = **a new row** with a new `effectiveFrom` (and the previous row's
`effectiveUntil` set), never an in-place edit of an active row — reusing the
`EquipmentCalibrationRecord` append-only precedent. Lookup selects the row where
`effectiveFrom <= quotationDate AND (effectiveUntil IS NULL OR effectiveUntil >= quotationDate)`
and `isActive`. `@@unique` on `(companyId, deviceTypeId, effectiveFrom)`; overlap
prevention is an application-level guard (no DB range type in use).

---

## 13. Quotation Price Snapshot

**HARD requirement:** Price List = master; `QuotationItem.unitPrice` = transaction
snapshot; a later master change must **not** alter an existing quotation.

**Verification — already satisfied:**
- `QuotationItem.unitPrice` is a stored `Decimal(18,2)`, written verbatim at create/update
  (`buildItemRows`, `quotations.service.ts:236-251`), never re-derived on read.
- `quotationInclude` fetches `tariff` **for display only** (`:33`) — the value shown/used is
  always the stored `unitPrice`.
- Post-`DRAFT` freeze prevents any recompute.

**Design rule for Phase 1:** the Price List lookup happens **exactly once**, at
quotation-item seeding (ideally server-side in `create()` / a dedicated "seed items"
endpoint, so the snapshot is authoritative rather than trusting the browser). After that,
**no code — quotation read, quotation update, PO, WO, Invoice — may re-read the Price List.**
Keep `tariffId` (and add a nullable `priceListItemId`) as *traceability* pointers, never as
the value source.

---

## 14. Missing Tariff Behavior

Scenario: requisition has `DeviceType = X, qty = 5` but no active tariff for X on the
quotation date.

| Option | Consequence |
|---|---|
| A. Block quotation creation | Bad — a CS user cannot record a phone/WA deal; contradicts the "every priced agreement must have a Quotation record" business lock (`docs/cursor/business-domain.md:535`). |
| B. Zero price | Dangerous — a Rp0 line can be sent/approved unnoticed. |
| C. "Price not configured" flag | Safe and visible. |
| D. Manual entry | Already the current behavior for every line. |
| E. Other | — |

**RECOMMENDED (not an existing requirement):** **C + D** — create the quotation with the
line present, `unitPrice` unset / flagged `PRICE_NOT_CONFIGURED`, and require a manual
`unitPrice > 0` on every line **before the quotation can transition `DRAFT → SENT`**. Do
**not** hard-block creation. This matches today's "user must type unit price" reality while
adding a guard rail. (Enforcement point would be `send()` in `quotations.service.ts:509`.)

---

## 15. Manual Price Override

- **Current:** `QuotationItem.unitPrice` is *always* manually entered; there is no "default"
  to override and **no audit trail** (`QuotationItem` has only `createdAt`; `update()` does
  `deleteMany + createMany`, destroying prior values; no `createdByUserId`, no history table).
- `Quotation` has `approvedByUserId / approvedAt / customerApprovedAt` only.

**Intended behavior:** Price List supplies the default `unitPrice`; a quotation user **may
override** it (the form already allows free entry).

**Audit implication (flagged, not implemented):** to later answer *"why did this quotation
use this price?"*, Phase 1 would need, on `QuotationItem`:
`priceListItemId` (snapshot pointer) + `listUnitPrice` (the default that was offered) +
`isPriceOverridden` + `overriddenByUserId` + `overriddenAt`. Optionally gate override with
a new RBAC action `quotation:override_price` — the DB-driven RBAC
(`packages/auth/src/access-control.ts:99`, `seed-role-permissions.ts`) supports adding an
action to the existing `quotation` resource with **no schema change**.
**None of this is added in this phase.**

---

## 16. Tax / Discount / Rounding

All in `apps/api/src/modules/quotations/quotations.service.ts:55-135` (server authoritative;
`quotations-ui.tsx:445-486` `previewTotals` mirrors it for display).

| Aspect | Behavior |
|---|---|
| Money helper | `money(v) = v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)`; `MONEY_DECIMAL_PLACES = 2` |
| Unit price basis | **Tax-exclusive** relative to the header tax; there is no per-line tax field |
| Per-line | `gross = money(qty × unitPrice)`; `discountAmount` is an **absolute amount** (0 ≤ d ≤ gross); `lineTotal = money(gross − discount)` |
| Header | `subtotal = money(Σ lineTotal)`; `headerDiscountAmount` absolute (0 ≤ h ≤ subtotal); `net = subtotal − headerDiscount` |
| Tax | Header-level, single `taxCode` resolved from the `Tax` master. rate 0 → tax 0, total = net. `isExclude` → `taxAmount = money(net × rate)`, total = net + tax. inclusive → `taxAmount = money(net × rate / (1 + rate))`, total = net |
| Currency | Hard-coded **IDR** (`Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" })` in `quotation-pdf.ts:73-79`); `currency` columns defaulted, never read by logic |
| Precision | money `Decimal(18,2)`, rate `Decimal(5,4)`, qty `Decimal(18,4)` |
| Rounding | `ROUND_HALF_UP` at every step |

**Rule for Phase 1:** the Price List provides only a **tax-exclusive `unitPrice`**. It must
**not** introduce a second calculation path — the existing `computeItemLine` /
`computeHeaderTotals` stay the single engine.

---

## 17. Limited Downstream Consumption Audit

**Question:** after a quotation exists, do PO / WO / Invoice consume the quotation's
commercial result rather than re-deriving from a Price List?

| Document | Evidence | Verdict |
|---|---|---|
| **PurchaseOrderItem** | `purchase-orders.service.ts:160-172` copies `quotationItemId`, `deviceId`, `tariffId`, `description`, **`qty`, `unitPrice`, `discountAmount`, `lineTotal` directly from the `QuotationItem`**. `PurchaseOrder` header re-runs the *same* `computeHeaderTotals` on those copied line totals. No Price List access. | ✅ Consumes quotation snapshot |
| **WorkOrderItem** | schema 1462–1477: `description` + `qty` only, "operational snapshot of a PurchaseOrderItem, 1:1". **No monetary field.** WO PDF has no price columns. | ✅ No pricing at all |
| **Invoice / InvoiceItem** | schema 1665–1719 exists; **no invoice/billing module implemented** (no service, controller, PDF). | N/A — nothing to audit yet |

**Conclusion:** the codebase **already** implements the intended direction
`Price List → Quotation → downstream consumes quotation`. There is **no** PO→PriceList,
WO→PriceList, or Invoice→PriceList path, and none should be added.

---

## 18. Auditability

**Already preserved on every quotation:**
`QuotationItem.unitPrice` / `qty` / `discountAmount` / `lineTotal` (immutable after DRAFT);
`Quotation.createdAt` (= issue date, used by PDF), `status`, `customerId`, `taxCode` +
`taxRate` snapshot, `approvedByUserId` / `approvedAt` / `customerApprovedAt`.

**Missing for "why this price?":**
no `QuotationItem.updatedAt`, no line-level history, no `createdByUserId`, no record of a
Price List version or effective date, no distinction between "list price offered" and
"final price", no override actor/timestamp. `update()` destroys prior line values.

**Future evidence to add (Phase 1, not now):** `QuotationItem.priceListItemId`,
`QuotationItem.priceListEffectiveFrom`, `QuotationItem.listUnitPrice`,
`isPriceOverridden` + `overriddenByUserId` + `overriddenAt`; append-only price-master rows.

---

## 19. Architecture Options

### Option A — DeviceType tariff *(recommended)*

```
PriceListItem
  id
  companyId          // company-scoped, like ServiceTariff / Tax
  deviceTypeId       // FK → DeviceType  (the natural key)
  unitPrice          Decimal @db.Decimal(18,2)   // tax-exclusive
  currency           String  @default("IDR")
  effectiveFrom      DateTime @db.Date
  effectiveUntil     DateTime? @db.Date
  isActive           Boolean @default(true)
  createdAt / updatedAt / createdByUserId
  @@unique([companyId, deviceTypeId, effectiveFrom])
  @@index([companyId, deviceTypeId, effectiveFrom])
```

- **Business fit:** matches the actual commercial grain (§5) and the only structured key
  available (§8). MEDCAL has the data today.
- **Schema complexity:** one new model, one FK, no change to `QuotationItem`
  (`tariffId` already exists; optionally add `priceListItemId` later).
- **Pricing flexibility:** effective-dated versions; per-company. Extensible: a nullable
  `serviceMode` or `calibrationParameterId` can be added later without touching existing
  quotations.
- **Quotation integration:** lookup once at item seeding → pre-fill `unitPrice`; reuse the
  existing calc engine.
- **Auditability:** effective-dated rows + the existing `unitPrice` snapshot answer
  "which tariff version".
- **Implementation complexity:** low–moderate (new master CRUD + RBAC resource + one
  lookup call + qty-flow fix).

### Option B — DeviceType + ServiceMode

As Option A plus a **required** `serviceMode` column and `@@unique([companyId,
deviceTypeId, serviceMode, effectiveFrom])`.

- **Fit:** only if the business confirms tariffs genuinely differ by mode.
- **Cost:** doubles master-data entry; `serviceMode` must be threaded into the lookup
  (available from the request). More rows, more maintenance.
- **Verdict:** adopt **only** on an explicit business decision (§10).

### Option C — Parameter-level pricing

`PriceListItem` keyed by `(companyId, deviceTypeId, calibrationParameterId, effectiveFrom)`,
or a base row + additive parameter rows.

- **Fit:** no evidence supports it (§9).
- **Cost:** breaks the 1:1 line grain — a quotation line would need to expand into
  base + parameter sub-lines, forcing a change to `assertFullScopeItems` and the
  `QuotationItem` model.
- **Verdict:** **rejected** for Phase 1; revisit only if a concrete business need appears.

---

## 20. Recommended Architecture

**Adopt Option A.**

- New model **`PriceListItem`**, `companyId`-scoped, keyed on `deviceTypeId` with
  `effectiveFrom` / nullable `effectiveUntil` and `isActive`. Price changes are **new rows**
  (append-only), never in-place edits of an active row.
- Keep the dormant **`ServiceTariff`** untouched (it can later serve non-device catalog
  lines, or be retired separately) — do not overload it with a `deviceTypeId`.
- **Lookup happens once**, server-side, when quotation items are first built from the
  requisition: for each `CalibrationRequestItem.deviceTypeId`, select the active
  `PriceListItem` as of the quotation's creation date and write its `unitPrice` into
  `QuotationItem.unitPrice`; store `priceListItemId` (+ `listUnitPrice`) for traceability.
- **`QuotationItem.unitPrice` remains the single source of truth** thereafter. No live
  lookups on read/update/PO/WO/Invoice.
- **Reuse** `computeItemLine` / `computeHeaderTotals` — no second engine.
- **Prerequisite (separate change, not this phase):** fix `itemsFromRequest`
  (`quotations-ui.tsx:415-431`) to seed `qty` from `CalibrationRequestItem.qty`.
- **Missing price:** flag the line `PRICE_NOT_CONFIGURED`, allow manual entry, block
  `DRAFT → SENT` until every line has `unitPrice > 0` (§14).
- **RBAC:** add a `priceListItem` resource (`read/create/update/delete`) to
  `access-control.ts` + seed baseline grants; optionally add `quotation:override_price`.
  No schema change to RBAC tables.

---

## 21. Draft Business Rules

| BR | Rule | Classification |
|---|---|---|
| BR-01 | A tariff is identified by **canonical `DeviceType.id` + `companyId`** (never `customerDeviceName`, never `DeviceTypeAlias`). `effectiveFrom` identifies the version. | **RECOMMENDED** |
| BR-02 | Price List is **company-specific** (`companyId`-scoped), like `ServiceTariff` and `Tax`. | **INFERRED** (from existing commercial masters) |
| BR-03 | **At most one active tariff per `(companyId, deviceTypeId[, serviceMode])` for any given date.** Overlap prevented at the application layer. | **RECOMMENDED** |
| BR-04 | Effective dating via `effectiveFrom` + nullable `effectiveUntil`. A quotation uses the tariff active on the **quotation creation date**. Price changes create a new row (append-only). | **RECOMMENDED** (no master precedent; append-only precedent = `EquipmentCalibrationRecord`) |
| BR-05 | An expired tariff (past `effectiveUntil`, or superseded) is treated as **"no active tariff"** → BR-06. No automated expiry job initially (consistent with `QuotationStatus.EXPIRED` never being automated). | **RECOMMENDED** |
| BR-06 | If no active tariff exists: create the quotation line with `unitPrice` unset, flag it `PRICE_NOT_CONFIGURED`, require manual entry, and **block `DRAFT → SENT`** until all lines have `unitPrice > 0`. Do not hard-block creation. | **RECOMMENDED** (not an existing requirement) |
| BR-07 | Quotation users **may override** the default `unitPrice` (the form already permits free entry). Optionally gate with `quotation:override_price` RBAC. | **RECOMMENDED / OPEN** |
| BR-08 | `QuotationItem.unitPrice` is a **transaction snapshot** — written once from the lookup/entry, immutable after `DRAFT`. A later Price List change never alters an existing quotation. | **EXISTING** (already true) |
| BR-09 | `amount = qty × unitPrice − discountAmount`; one line per requisition item; `qty` flows from `CalibrationRequestItem.qty` (currently hard-coded to 1 in the UI — a gap to fix). Qty is not exploded. | **EXISTING** (math) / **INFERRED** (qty flow) |
| BR-10 | Does service mode affect tariff? | **OPEN BUSINESS DECISION** |
| BR-11 | Does calibration parameter affect tariff? | **OPEN BUSINESS DECISION** — *NOT DETERMINED FROM CURRENT SYSTEM*; default assumption = No (per-DeviceType) |
| BR-12 | Customer-specific / contract / negotiated pricing supported? | **OPEN BUSINESS DECISION** — absent today |
| BR-13 | Currency = **IDR** (single-currency system; `currency` columns exist but are unused by logic). | **EXISTING** |
| BR-14 | Tax stays **header-level** via the `Tax` master (exclusive/inclusive per `Tax.isExclude`). Price List `unitPrice` is **tax-exclusive**. | **EXISTING** |
| BR-15 | Historical quotations are protected because `unitPrice` is a stored snapshot **and** the `DRAFT`-only edit freeze prevents changes after `SENT`. | **EXISTING** |

---

## 22. Open Business Decisions

1. **Service mode pricing** — do ON_SITE and SEND_TO_LAB tariffs differ? (BR-10)
2. **Parameter pricing** — is per-parameter or "base + parameter add-on" pricing ever
   required? (BR-11) — *NOT DETERMINED FROM CURRENT SYSTEM*.
3. **Customer-specific / contract pricing** — in scope at any point? (BR-12)
4. **Missing-price behavior** — confirm "soft block at SEND" (BR-06) vs. hard block at
   create vs. allow SEND with a warning.
5. **Override control** — should overriding the default price require a dedicated permission
   and an audit record?
6. **Quantity-break / tiered pricing** — not present; assumed out of scope — confirm.
7. **`ServiceTariff` disposition** — keep as a separate non-device catalog, fold into the
   new model, or retire?
8. **Lookup date basis** — quotation `createdAt` vs. an explicit "quotation issue date"
   vs. requisition date. (Recommended: quotation `createdAt`.)
9. **Should `QuotationStatus.EXPIRED` / tariff expiry ever be automated?**

---

## 23. Risks

- **Silent price drift** — the single biggest risk. If any future code performs a live
  Price List lookup on quotation *read* or *update* (or in PO/WO/Invoice), changing the
  master would retroactively alter issued quotations. Phase 1 must forbid this explicitly
  and lookup **exactly once** at seeding.
- **Broken qty flow** — shipping a Price List while `itemsFromRequest` still hard-codes
  `qty: "1"` (`quotations-ui.tsx:425`) makes every auto-priced amount wrong for multi-unit
  requisition lines. Fix the qty seed **before or with** the Price List work.
- **1:1 bijection rigidity** — `assertFullScopeItems` forces exactly one priced line per
  requisition item. Fine for DeviceType-grain pricing; blocks any "split by parameter"
  pricing without a scope-model change.
- **No revision path** — a wrong price on a `SENT` quotation can only be handled by
  `cancel`, which then permanently blocks re-quoting the requisition (`requestId @unique`
  + status-agnostic `DUPLICATE_QUOTATION_FOR_REQUEST`). Consider a re-quote/revision flow
  alongside Price List.
- **Client-trusted prices** — today the browser sends `unitPrice`. If the Price List seed
  is done client-side, users (or a tampered request) could submit arbitrary prices with no
  server check. Recommend server-side seeding + a server-side "not below list without
  override permission" guard.
- **No effective-date overlap constraint in the DB** — Postgres range/exclusion constraints
  aren't used elsewhere; overlap prevention will be application-level and must be tested.
- **Dormant `ServiceTariff`** — surfacing it inconsistently (some flows use it, some use
  the new model) would confuse users. Decide its disposition (§22.7) up front.
- **Multi-company `Company.id @db.Char(3)`** vs. `cuid()` elsewhere — `PriceListItem.companyId`
  must follow the `String` (non-Char) convention used by `Quotation.companyId`, not the
  `@db.Char(3)` used by `PurchaseOrder.companyId`. Minor, but a known inconsistency.

---

## 24. Deferred Items

Explicitly **out of scope** for Price List Phase 1 unless a business decision reopens them:

- `CalibrationJob` redesign / physical-device pricing.
- Parameter-level or add-on pricing.
- Customer-specific / customer-group / contract / negotiated pricing.
- Multi-currency support.
- Quantity-break / tiered / volume pricing.
- Invoice module and invoice-side pricing.
- Automated `QuotationStatus.EXPIRED` and automated tariff expiry.
- Any change to `CalibrationRequestItem`, `DeviceType`, `DeviceCalibrationParameter`,
  `DeviceTypeAlias`, PO, WO, `CalibrationJob`, or RBAC tables.
- Quotation revision / re-quote flow (related, but a separate design).

---

## Appendix — Files inspected (read-only; none modified)

- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/` (`20260813063336_init…`, `…add_document_numbering`,
  `…quotation_requestid_unique`, `…quotation_po_taxcode_taxrate`,
  `…quotation_discount_amounts`, `…quotation_po_tax_required`, `…add_tax_master`,
  `…tax_is_exclude`, `…add_device_type_alias`, `…add_qty_to_calibration_request_item`,
  `…add_calibration_request_item_qty_check`, device-type/parameter/work-order folders)
- `apps/api/src/modules/quotations/{quotations.service.ts, quotations.controller.ts,
  quotation-pdf.ts, quotations.service.test.ts, quotation-pdf.test.ts}`
- `packages/shared/src/schemas/index.ts` (§Quotation, lines 360–419), `packages/shared/src/utils/index.ts:110`
- `apps/portal/src/app/management/quotations/{new/page.tsx, [id]/edit/page.tsx,
  quotations-ui.tsx, quotation-form-fields.tsx}`
- `apps/portal/src/app/management/calibration-requests/[id]/page.tsx`
- `apps/api/src/modules/calibration-requests/{calibration-requests.service.ts,
  calibration-request-import.service.ts}`
- `apps/api/src/modules/purchase-orders/{purchase-orders.service.ts, purchase-order-pdf.ts}`
- `apps/api/src/modules/work-orders/{work-orders.service.ts, work-order-pdf.ts}`
- `packages/auth/src/access-control.ts`, `packages/db/prisma/seed-role-permissions.ts`,
  `apps/api/src/modules/me/me.controller.ts`
- `docs/cursor/business-domain.md`

**Confirmation: NO CODE CHANGED · NO SCHEMA CHANGED · NO DATA CHANGED · NO RBAC CHANGED.**
