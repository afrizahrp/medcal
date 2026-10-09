# Quotation Requirements — Audit Report (Revision 2 — Final Decisions)

**Status:** Revised against the finalized business decisions of 2026-10-08. Supersedes Revision 1 (which listed options and open questions that are now closed). Implementation follows `docs/audits/quotation-requirements-implementation-plan.md`; the outcome is recorded in `docs/audits/quotation-requirements-implementation-report.md`.
**Written for:** the Medcal lead and implementers.

> **Update 2026-10-10:** additional items no longer carry a per-line discount, gained an optional second multiplier (`multiplier` + `multiplierLabel`; `lineTotal = unitPrice × qty × (multiplier ?? 1)`), and the totals list each additional cost by name. See §5 of `quotation-requirements-implementation-report.md`. Where this document mentions an additional-item `discountAmount` or a single "Additional Cost" total, the addendum prevails.


Labels: **[FOUND]** verified in code · **[INFERRED]** drawn from findings · **[DECIDED]** finalized business decision · **[DESIGN]** resulting design.

---

## 1. Executive Summary

| # | Topic | Final decision → design |
|---|---|---|
| A | Quotation date | Explicit `Quotation.quotationDate` (`@db.Date`, **NOT NULL**). `createdAt` stays the audit timestamp. Existing rows are backfilled from `createdAt` as the **Asia/Jakarta** calendar date. Number, Price-List lookup, printed date and PDF name follow `quotationDate`. No NULL fallback anywhere. |
| B | Customer pricing | **`Customer.pricingMode` enum `STANDARD | MANUAL`.** MANUAL = the Price List is not consulted; lines are created `pricePending` and the user types the price. No customer price table, no `Quotation.pricingBasis`. |
| C | Quotation discount | Header discount persists **both** `headerDiscountPercent` and `headerDiscountAmount` plus the **input source** (`headerDiscountInputMode`). One field is the input, the other is derived by one deterministic function shared by API and portal. |
| D | Additional items | `AdditionalItemType` (catalog) → `QuotationAdditionalItem` (snapshot) → `PurchaseOrderAdditionalItem` (snapshot) → **STOP**. Never `PurchaseOrderItem`/`WorkOrderItem`/`CalibrationJob`/allocation. User decides per quotation; no customer eligibility model. |
| E | Tax / totals | Existing single header tax applies to the whole commercial total, additional items included. One header discount applies to the same combined subtotal. |

All schema changes are additive plus one controlled backfill. No applied migration is edited.

---

## 2. Current Architecture Findings (preserved from Revision 1) [FOUND]

### 2.1 Chain and invariants
```
Customer → CalibrationRequest ─1:1─ Quotation
   Quotation ── QuotationItem[] (1:1 with active requisition items, "full scope")
   Quotation ── PurchaseOrder (APPROVED only) ── PurchaseOrderItem[] (copy of every active QuotationItem)
   PurchaseOrderItem ── PurchaseOrderItemAllocation ── WorkOrderItem ──(start)──▶ CalibrationJob × qty
```
- Quotation scope = requisition scope (`assertFullScopeItems`, revise requires `requestItemId`).
- Quotation money is an immutable snapshot (unit price from Price List or manual, never re-read).
- Only DRAFT is editable via PATCH; SENT/APPROVED change only via `revise` (MOM #1: complete append-only `QuotationHistory`/`QuotationItemHistory` snapshot first; unconsumed removal = hard delete; consumed removal = retire `isActive=false`).
- PO is a pull-based snapshot of the quotation (`create` copies header totals + active items; `revise` reconciles).
- Every `PurchaseOrderItem` is an allocatable calibration unit in ≥8 consumers (`work-order-source.ts`, `allocation.ts`, `fanOutCalibrationJobs`, WO revise, shared SPK, `po-progress.ts`, allocation summary, PO PDF). This is why additional items must never be `PurchaseOrderItem` rows.
- Device-lineage invariants (requisition item → … → CalibrationJob) and Phase-4 measurement invariants are untouched.

### 2.2 Date / numbering today
- There is no quotation date; `createdAt` doubles as the business date (PDF "Tanggal", filename, number year/month, Price List lookup via `issuedAt = new Date()`).
- Number `QUO/YYYY/MM/NNNNN` is built from `issuedAt` in UTC; counter per `(companyId, documentType, year)`. No production code parses number→date.
- `validUntil` is `DateTime?` (UTC midnight from a `YYYY-MM-DD` wire date), unvalidated, display-only; `QuotationStatus.EXPIRED` is never set by code.
- There is **no** `sentAt`; actual lifecycle timestamps are `approvedAt` / `customerApprovedAt` (both set to `now` on approve) and `createdAt`. They stay as they are.

### 2.3 Pricing today
- `PriceListItem` (company + DeviceType + effective window), resolved by the single `resolveActivePriceListItem`; missing → `unitPrice 0`, `pricePending = true`, which blocks `send` and `approve` (`assertNoPendingPrices`). DRAFT PATCH can set any price; a line is `pricePending` iff `unitPrice <= 0`.
- `Customer` has no pricing field.

### 2.4 Discount and totals today
- Per-line `discountAmount` (amount only) and **one header discount** `headerDiscountAmount` on `Quotation` (+`QuotationHistory`, `PurchaseOrder`, `PurchaseOrderHistory`).
- `computeHeaderTotals`: `subtotal = Σ lineTotal` (money, 2 dp, half-up) → `net = subtotal − headerDiscount` → tax on `net`: zero-rate ⇒ total = net; **exclusive** ⇒ `tax = money(net × rate)`, `total = net + tax`; **inclusive** ⇒ `tax = money(net × rate / (1+rate))`, `total = net`.
- Validation: header discount ≥ 0 and ≤ subtotal (`INVALID_HEADER_DISCOUNT`, `HEADER_DISCOUNT_EXCEEDS_SUBTOTAL`).
- PO copies `subtotal/headerDiscountAmount/tax*/totalAmount` verbatim from the quotation at create and at `revise`.
- Portal mirrors the math in `previewTotals` (unrounded floats) and edits the header discount through `QuotationTotals` (single amount input). PDFs print "Discount" as an amount.
- Precision conventions: money `Decimal(18,2)` half-up; tax rate `Decimal(5,4)`; qty `Decimal(18,4)` (UI enforces whole numbers).

### 2.5 SPK accessories (why not reused) [FOUND]
`WorkOrderItemAccessory` is a free-text UUT checklist (F.MU.07), SEND_TO_LAB only, delete-all-and-recreate, copied into `KontrolAlatAccessory`. No qty/price/unit/type/snapshot. It belongs to the physical-device workflow; commercial additional items share only the UI interaction idea (inline row editor), not the model.

---

## 3. Decision A — Quotation Date

**[DESIGN]**
- `Quotation.quotationDate DateTime @db.Date NOT NULL`; `QuotationHistory.quotationDate` likewise (snapshot parity, NOT NULL, backfilled from its parent quotation).
- **Migration/backfill (Asia/Jakarta):** add nullable → `UPDATE … SET quotationDate = ((createdAt AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date` → `SET NOT NULL`. `createdAt` is stored as UTC `timestamp(3)` (Prisma), hence the explicit two-step conversion. Deterministic and repeatable. No fallback code exists after migration. History rows copy the parent's `quotationDate` (a revision never changes it).
- **Create:** optional `quotationDate`, default = today in Asia/Jakarta (`BUSINESS_TIME_ZONE`). **Future dates are rejected** (`QUOTATION_DATE_IN_FUTURE`) — there is no existing rule permitting them and the requirement is backdating only. No lower bound.
- **Numbering follows `quotationDate`:** `DocumentNumberService.allocate({ issuedAt: quotationDate })`. A `@db.Date` value is UTC midnight, and QUOTATION numbers are built in UTC, so the printed year/month equal the document date. Consequence (accepted): backdating into a prior year uses that year's counter; sequence is no longer monotonic with calendar month.
- **DRAFT date edit:** allowed in DRAFT only (existing freeze). If the new date changes the number's year or month, a new number is allocated for the new period inside the same transaction (the DRAFT number has not been sent); otherwise the number is unchanged. SENT/APPROVED: not editable, and `revise` does not alter it. The old number's sequence is not reused (gaps are already tolerated).
- **Price lookup follows `quotationDate`:** `buildGeneratedRows` and `preview` pass it to `resolveActivePriceListItem`; preview == create is preserved. Editing the date on an existing DRAFT does **not** reprice lines (lines are already editable snapshots) — documented limitation.
- **`validUntil` ≥ `quotationDate`** when both present (create; PATCH when either is supplied).
- **Presentation:** PDF "Tanggal", PDF filename (`PKM-QUO-yyyymmdd-seq`), list "Tanggal" column (date, not relative time), detail page, email text use `quotationDate`. Date-only formatting is pinned to UTC so a server time zone cannot shift the day.
- **Audit:** a create (or DRAFT date change) with `quotationDate` earlier than today writes an `AuditLog` row (`QUOTATION_BACKDATED`, metadata `{ number, quotationDate, backdatedDays }`). `approvedAt`/`customerApprovedAt`/`createdAt` stay actual event times.
- **Impact on other documents:** PO/WO do not read the quotation date; `customerPoDate` remains user-entered with no cross-check (unchanged).

---

## 4. Decision B — `Customer.pricingMode`

**[DESIGN]** `enum CustomerPricingMode { STANDARD, MANUAL }`, `Customer.pricingMode` default `STANDARD` (existing customers keep today's behaviour with no data change). Enum rather than boolean so the model can evolve.

- STANDARD: unchanged — `resolveActivePriceListItem(company, deviceTypeId, quotationDate)`.
- MANUAL: `buildGeneratedRows` does **not** call the resolver; every line is `unitPrice 0`, `pricePending = true`. Existing machinery then does the rest: `send`/`approve` blocked until each line has a price; DRAFT PATCH accepts the typed prices; revise and PO flows are unchanged. The New-Quotation preview returns `pricingMode` so the screen can say "Customer ini menggunakan harga manual".
- Changing a customer's mode never re-prices existing quotations (snapshots).
- **Why no `CustomerPriceListItem`:** the business statement is that these customers do not use the standard list, not that stored negotiated rates exist. A rate table would be speculative. **Why no `Quotation.pricingBasis`:** no audit/reporting requirement demonstrates the need; the customer's mode is visible on the Customer, and the quotation's prices are snapshots.
- Known limitation (accepted): a manual price leaves no override record (BR-07 remains deferred).

---

## 5. Decision C — Bidirectional Header Discount

**[DESIGN]** Scope: the **quotation-level (header) discount**. Per-line `discountAmount` stays amount-only (the requirement concerns the quotation discount; line discounts and the double-entry UX would be scope expansion). Additional-item lines have the same per-line amount discount as calibration lines.

**Persisted (Quotation, QuotationHistory, PurchaseOrder, PurchaseOrderHistory):**
`headerDiscountAmount Decimal(18,2)` (existing), **`headerDiscountPercent Decimal(7,4)`**, **`headerDiscountInputMode` enum `AMOUNT | PERCENT`** (default `AMOUNT`).

**Why a persisted input mode:** "last edited field = input source, the other is calculated". When lines change later (price entered, revise), the server must know which field to hold fixed — otherwise a 10 % discount would silently turn into a fixed Rp value. The mode is that memory.

**One function, shared** (`packages/shared`, pure, integer-cent/BigInt arithmetic, used by API and portal so there is no duplicated rule):

```
resolveHeaderDiscount(subtotal, mode, value) → { amount, percent }
```
- base = **combined subtotal** (calibration lines + additional lines, after line discounts).
- `PERCENT`: `percent = round4(value)`; `amount = money_half_up(subtotal × percent / 100)`.
- `AMOUNT`: `amount = money(value)`; `percent = round4_half_up(amount / subtotal × 100)`; subtotal 0 ⇒ percent 0.
- Validation: value ≥ 0; percent ≤ 100 (`INVALID_HEADER_DISCOUNT_PERCENT`); amount ≤ subtotal (`HEADER_DISCOUNT_EXCEEDS_SUBTOTAL`); negative (`INVALID_HEADER_DISCOUNT`).
- **Consistency invariant:** mode `PERCENT` ⇒ `amount == money(subtotal × percent/100)` exactly; mode `AMOUNT` ⇒ `amount` is the exact input and `percent` is its 4-dp rendering (so a 4-dp percent may not round-trip to the same cents — by design the input field wins). Inconsistent pairs (e.g. 10 % with Rp150.000 on Rp1.000.000) cannot be produced by any API path because the client sends **only one** of the two fields; a payload containing both is rejected (`DISCOUNT_FIELDS_CONFLICT`).
- When the request omits both fields (revise/PATCH after line changes), the stored mode and its stored input value are re-applied to the **new** subtotal (percent mode recomputes the amount; amount mode recomputes the percent).

**Calculation order (documented as required):**
```
lineTotal_i      = money(qty × unitPrice) − lineDiscount        (calibration and additional lines alike)
subtotal         = Σ lineTotal_i over ACTIVE calibration + ACTIVE additional lines
headerDiscount   = resolveHeaderDiscount(subtotal, mode, value).amount
net              = subtotal − headerDiscount
tax              = 0 | money(net × rate) [exclusive] | money(net × rate / (1+rate)) [inclusive]
totalAmount      = net + tax [exclusive] | net [inclusive/zero-rate]
```
This is the existing order; only the subtotal's membership (adds additional lines) and the discount input are new.

**Flow audit:** create ✔ (resolve after rows generated) · PATCH ✔ · revise ✔ (history snapshot gains percent+mode) · preview (items only; totals are client-side from the same shared function) ✔ · quotation PDF ("Discount (10%)" label when percent > 0) ✔ · PO create/revise (copies amount+percent+mode verbatim; PO never recomputes) ✔ · PO PDF label ✔ · portal forms (`QuotationTotals` gets percent + amount inputs) ✔ · API DTOs (zod: at most one of the two) ✔ · migration backfills `percent = round(amount/subtotal×100, 4)` for existing quotations/POs/histories with mode `AMOUNT` ✔.

---

## 6. Decision D — Additional Items

### 6.1 Architecture
```
AdditionalItemType (catalog, reference/default source only)
        │ (reference for traceability; never read to compute money)
QuotationAdditionalItem   (snapshot, owned by Quotation)
        │ copy at PO create / PO revise
PurchaseOrderAdditionalItem (snapshot, owned by PurchaseOrder)
        ▼
      STOP    — no PurchaseOrderItem / WorkOrderItem / CalibrationJob / allocation
```
Separate models follow the repository's own precedent (`SpkParent` "deliberately NOT a WorkOrder"; `WorkOrderItemAccessory` "not WorkOrderEquipment"). Because additional items live in their own tables, **none** of the ≥8 PO-item consumers can see them; pipeline isolation is structural, not filter-based.

### 6.2 Models
- **`AdditionalItemType`** — `id, companyId, code, name, unitLabel, defaultUnitPrice?, serviceMode?, isActive, createdAt, updatedByUserId?, updatedAt`; unique `(companyId, code)`. Deactivated, never deleted. `serviceMode` (nullable = any) reuses the existing enum; the New-Quotation UI offers only types applicable to the requisition's mode.
- **`QuotationAdditionalItem`** — `id, companyId, quotationId (Cascade), additionalItemTypeId (Restrict), code, description, unitLabel, qty Decimal(18,4), unitPrice, discountAmount, lineTotal, notes?, isActive, createdAt, updatedByUserId?, updatedAt`. Snapshot: `code/description/unitLabel/qty/unitPrice/discountAmount/lineTotal/notes` are copied; historical quotations never read the catalog.
- **`QuotationAdditionalItemHistory`** (child of `QuotationHistory`, MOM #1 complete-snapshot contract).
- **`PurchaseOrderAdditionalItem`** — same snapshot fields + `quotationAdditionalItemId` (Restrict, unique per PO) + `additionalItemTypeId`. Copied from the quotation at PO create/revise; **never** read from the quotation afterwards.
- **`PurchaseOrderAdditionalItemHistory`** (child of `PurchaseOrderHistory`).
- DB CHECKs: `qty > 0`, `unitPrice > 0`, `discountAmount >= 0` on both live tables (precedent: `CalibrationRequestItem.qty ≥ 1`).

### 6.3 Why no customer eligibility model
The user decides per quotation whether to add an additional item; the same item may be used or omitted for the same customer on different quotations. Eligibility would encode a rule the business explicitly does not have. The catalog is only a reusable default source.

### 6.4 Lifecycle (no separate lifecycle invented)
- **Quotation DRAFT** — create/PATCH carry `additionalItems[]`; PATCH replaces the whole set (same as `items`; nothing can be consumed in DRAFT).
- **SENT/APPROVED** — only through `revise`; `additionalItems[]` is the complete desired set matched by row `id` (omitted array = unchanged). Unconsumed rows (no PO row refers to them): update in place or hard-delete after the history snapshot. **Consumed** rows (a `PurchaseOrderAdditionalItem` exists): frozen — unchanged ⇒ kept; changed ⇒ the old row is retired (`isActive=false`) and a new row carries the new values; removed ⇒ retired. Same freeze-and-retire rule as `QuotationItem`, kept uniform (a changed consumed row is "replace", never a delta sibling — simpler and unambiguous for a non-quantity-driven charge).
- **PO create** — copies active quotation additional items into `PurchaseOrderAdditionalItem`; header totals/discount copied as today (they already include them).
- **PO revise** (APPROVED/RECEIVED/CONFIRMED, pull-based, existing history snapshot first): adds PO rows for active quotation additional items not yet represented; deletes PO rows whose source was retired (nothing downstream consumes them; the history snapshot preserves them); then copies header totals. "Scope change" for the existing `NO_PENDING_SCOPE_CHANGE` guard now includes additional items. Totals-only changes still require a scope change, exactly as before.
- WorkOrder/SPK/CalibrationJob: not involved; `WorkOrder.revise`, allocation, fan-out and `computePoProgress` are untouched and their tests unchanged.

### 6.5 Validation
Type must exist in the company and be active when added (historical rows exempt); service-mode applicability checked at add time against the requisition; `qty` positive integer (matches UI/`formatQty`, DB allows decimals); `unitPrice > 0` (defaults to the catalog's `defaultUnitPrice` when omitted; error if neither — additional lines have no `pricePending` state); line discount ≤ gross; same rounding helpers; statuses as in 6.4.

### 6.6 Tax
**[FOUND]** The model has exactly one header tax; nothing in the code or domain shows mixed taxability, and the instruction is to follow the existing behaviour. Additional items therefore sit inside the same subtotal and the same tax computation. No per-line tax is introduced.

---

## 7. UX (final)

- **Quotation forms** (new, edit, revise dialog): a "Additional / Biaya Tambahan" switch (initial state = has rows; off ⇒ rows cleared with confirmation) reveals an inline row editor: type select (active catalog, filtered by requisition service mode), qty, unit (read-only from snapshot), unit price (prefilled from `defaultUnitPrice`, editable), line discount, notes; add/remove rows; totals update live through the shared discount function. Reuses existing `Input`/table styling; no new interaction pattern.
- **Discount block:** two inputs, "Discount %" and "Discount (Rp)"; editing one makes it the source and the other displays the derived value live; submit sends only the source field.
- **Detail/PDF pages:** "Biaya Tambahan" table in quotation detail and PDF, and in PO detail and PDF (from the PO's own rows).
- **Catalog admin page** (`/additional-item-types`) beside the Tariff page; governed by the existing `priceListItem` permission resource (it is a commercial price master), avoiding new RBAC seeds.
- **Customer form:** "Pricing mode" select (Standard / Manual).

---

## 8. Migration Implications
1. Create enums `CustomerPricingMode`, `DiscountInputMode`.
2. `Customer.pricingMode` default `STANDARD`.
3. `Quotation`/`QuotationHistory`: add `quotationDate` (nullable) → Jakarta backfill → `NOT NULL`; add `headerDiscountPercent` (default 0) + backfill, `headerDiscountInputMode` (default `AMOUNT`).
4. `PurchaseOrder`/`PurchaseOrderHistory`: `headerDiscountPercent` (+backfill), `headerDiscountInputMode`.
5. New tables: `AdditionalItemType`, `QuotationAdditionalItem`, `QuotationAdditionalItemHistory`, `PurchaseOrderAdditionalItem`, `PurchaseOrderAdditionalItemHistory` + CHECKs.
6. One new migration directory after `20261007000000_add_updated_by_audit_fields`. Reversible in structure (drop new tables/columns/enums); the backfill is data-derived from `createdAt`/existing amounts, so a rollback only drops columns. All models carry `updatedByUserId` where the audit extension requires it.

## 9. Risks / Limitations (remaining)
- Backdating into a prior year/month produces non-chronological sequence numbers (accepted).
- DRAFT date edit does not reprice; may change the DRAFT's number.
- Manual prices leave no override trace (BR-07 deferred).
- Header discount applies to the combined subtotal including additional items (existing single-discount semantics).
- Percent has 4 dp; an AMOUNT-sourced percent is a rounded rendering.
- Quotation totals can change after customer approval via revise (existing behaviour; no new approval step).
- `PurchaseOrder.revise` totals are still only re-copied when item or additional-item scope changes (existing semantics).
- Out of scope: Requisition/PO business dates, invoicing of additional items, per-line tax, customer price lists, customer eligibility, automated `EXPIRED`.
