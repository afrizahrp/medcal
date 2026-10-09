# Quotation Requirements — Implementation Plan (Revision 2 — Final Decisions)

**Status:** Approved scope; implemented — see `docs/audits/quotation-requirements-implementation-report.md` for results and the "Deviations from this plan" section at the end of this file. Source of truth: `docs/audits/quotation-requirements-audit-report.md` (Revision 2).
**Governing rules:**

> **Update 2026-10-10:** additional items no longer carry a per-line discount, gained an optional second multiplier (`multiplier` + `multiplierLabel`; `lineTotal = unitPrice × qty × (multiplier ?? 1)`), and the totals list each additional cost by name. See §5 of `quotation-requirements-implementation-report.md`. Where this document mentions an additional-item `discountAmount` or a single "Additional Cost" total, the addendum prevails.

 `.claude/rules/*` — implement only this scope; never edit an applied migration; Vitest through the repo's pnpm environment; full relevant suites + typecheck (+ build) before completion; no filtered test output.

## 1. Objectives
1. Explicit, NOT NULL `quotationDate` driving number, Price-List lookup and printed date.
2. `Customer.pricingMode` STANDARD | MANUAL.
3. Header discount with bidirectional percent ↔ amount, deterministic and persisted with its input source.
4. Commercial additional items: catalog → quotation snapshot → PO snapshot → STOP.

Out of scope (reported at the end): customer price lists, customer eligibility, per-line tax, `pricingBasis`, Requisition/PO business dates, invoicing of additional items, automated EXPIRED, per-line percent discounts.

## 2. Schema (one migration: `20261008000000_quotation_date_discount_pricing_mode_additional_items`)
| Model | Change |
|---|---|
| enums | `CustomerPricingMode {STANDARD, MANUAL}`, `DiscountInputMode {AMOUNT, PERCENT}` |
| `Customer` | `pricingMode CustomerPricingMode @default(STANDARD)` |
| `Quotation` | `quotationDate DateTime @db.Date` (NOT NULL, backfilled), `headerDiscountPercent Decimal(7,4) @default(0)`, `headerDiscountInputMode DiscountInputMode @default(AMOUNT)`; relation `additionalItems` |
| `QuotationHistory` | same three columns (+ relation `additionalItems`) |
| `PurchaseOrder` / `PurchaseOrderHistory` | `headerDiscountPercent`, `headerDiscountInputMode`; relation `additionalItems` |
| `AdditionalItemType` | new (see audit §6.2) |
| `QuotationAdditionalItem` / `…History` | new |
| `PurchaseOrderAdditionalItem` / `…History` | new |

Migration order: create enums → add columns → backfill `quotationDate` (`((createdAt AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date`; history rows from parent quotation) → `SET NOT NULL` → backfill `headerDiscountPercent = CASE WHEN subtotal > 0 THEN ROUND(headerDiscountAmount / subtotal × 100, 4) ELSE 0 END` on the four header tables → create new tables, FKs, indexes, CHECKs. FKs: items → quotation/PO `Cascade`; `additionalItemTypeId` `Restrict`; `quotationAdditionalItemId` `Restrict`; unique `(purchaseOrderId, quotationAdditionalItemId)`. New models declare `updatedByUserId` (+ relation) where the audit extension expects it.

## 3. Shared package
- `utils/quotation-discount.ts`: `resolveHeaderDiscount` (integer/BigInt cents; rules in audit §5) + `roundMoney` helpers + tests with the vectors in §9.
- `schemas/index.ts`: `quotationCreateSchema`/`quotationPreviewSchema`/`quotationUpdateSchema`/`quotationReviseSchema` — `quotationDate` (create/preview/update), `headerDiscountPercent` + `headerDiscountAmount` (at most one → refine `DISCOUNT_FIELDS_CONFLICT`; percent 0–100), `additionalItems[]` (create/update: `{additionalItemTypeId, description?, qty, unitPrice?, discountAmount?, notes?}`; revise: plus optional `id`); `customerCreateSchema`/`customerUpdateSchema` `pricingMode`; `additionalItemType*` create/update/list schemas + sortable fields.

## 4. Backend
**Quotations (`quotations.service.ts`)**
1. Helpers: `todayInBusinessZone()`; `assertQuotationDate`; shared-function–backed `resolveDiscountSpec(existing?, input)`; `computeHeaderTotals` takes the discount spec and returns `{subtotal, amount, percent, mode, tax…}`; subtotal = active items + active additional items.
2. `create`: load request customer's `pricingMode`; `quotationDate` default today; number allocated with `issuedAt = quotationDate`; `buildGeneratedRows(…, onDate = quotationDate, pricingMode)` (MANUAL ⇒ no resolver call, `pricePending`); build additional rows (snapshot from type, price default); totals; persist date, percent, mode; `QUOTATION_BACKDATED` audit when backdated; `validUntil ≥ quotationDate`.
3. `preview`: accepts `quotationDate`; returns `pricingMode`.
4. `update` (DRAFT): optional `quotationDate` (re-allocate number only if year/month changed; backdated audit), discount spec, `additionalItems` full replace; totals recomputed over both sets.
5. `revise`: history gets `quotationDate`, percent, mode, additional items; additional desired-set reconciliation (consumed ⇒ retire/replace; unconsumed ⇒ update/delete); discount spec reapplied to new subtotal; `QUOTATION_REVISE` audit metadata gains `additionalItemCount`.
6. `quotationInclude`: active `additionalItems` ordered by `createdAt`.
7. `quotation-pdf.ts`: "Tanggal" and filename from `quotationDate` (UTC-pinned), "Biaya Tambahan" section, discount label with percent.

**Purchase orders**: `create` copies additional items + percent + mode; `revise` reconciles `PurchaseOrderAdditionalItem`, history includes them, scope guard includes them; `purchaseOrderInclude` adds `additionalItems`; `purchase-order-pdf.ts` adds the section and discount label. **No change** to `allocation.ts`, `work-order-source.ts`, `fanOutCalibrationJobs`, `po-progress.ts`, WO revise, shared SPK.

**Customers**: `pricingMode` on create/update/response (service already spreads parsed input — verify).
**New module `additional-item-types`**: service (CRUD, no hard delete, search/sort/paginate), controller (`priceListItem` permissions), module; registered in `app.module.ts`.

## 5. Frontend (portal)
- `quotation-discount` usage: `QuotationTotals` gets Percent + Amount inputs (source tracked via `headerDiscountInputMode`); `previewTotals` takes a discount spec + additional rows and uses the shared function.
- `QuotationFormValue`: `quotationDate`, discount `{mode, percent, amount}` (source value stored as typed string), `additionalItems[]`.
- New `quotation-additional-items.tsx` (switch + row editor) used by new/edit/revise.
- `new/page.tsx`, `[id]/edit/page.tsx`, revise dialog in `[id]/page.tsx`: date field (`max` = today), discount, additional items, payload; MANUAL notice on New; detail page shows date/additional/percent.
- `quotations-ui.tsx`: types, list "Tanggal" = `quotationDate`, filename/email use `quotationDate`, error-message map for new codes.
- PO UI: `purchase-orders-ui.tsx` types, PO detail shows additional items and percent label; PO totals component unchanged otherwise.
- Customer form: pricing mode select (+ utils/tests).
- New catalog page `/additional-item-types` (list, create/edit dialog, activate/deactivate) + `seed-menu.ts` entry + `useAdditionalItemTypes` hook.

## 6. Validation summary
Date ≤ today(Jakarta); `validUntil ≥ quotationDate`; discount value ≥ 0, percent ≤ 100, amount ≤ subtotal, never both fields; additional: type active + same company + mode applicable at add, qty int > 0, unitPrice > 0, discount ≤ gross, only DRAFT PATCH/create or revise; consumed rows frozen.

## 7. History / revision behaviour
Quotation revise snapshots header (incl. date, percent, mode) + items + additional items before change. PO revise snapshots header + items + additional items. Number never changes on revise.

## 8. Test plan (Vitest)
**Shared:** discount vectors (§9), schemas (`quotationDate`, conflicting discount fields, additional items).
**API – quotations:** backdated create (date stored, `createdAt` untouched); future date rejected; number year/month follow date (incl. previous-year counter); price lookup by `quotationDate` (old tariff window, before first tariff ⇒ pending); preview == create for a backdated date; `validUntil` rule; DRAFT date change (number kept / re-allocated); backdated audit; STANDARD vs MANUAL (no resolver call, pending lines, send/approve blocked, PATCH price then send OK); discount percent→amount, amount→percent, decimal percent, rounding half-up, zero, invalid (negative, >100 %, > subtotal), edit percent after amount and vice-versa, mode retained across PATCH/revise recompute, persisted reload; revise history snapshot includes date/discount/additional; additional items: create/update/revise, totals = lines + additional (exclusive & inclusive tax, header discount), snapshot immutability vs catalog edits, consumed retire/replace, rollback on invalid batch.
**API – PO:** create copies additional items + percent/mode and creates **no** PurchaseOrderItem/WorkOrderItem/CalibrationJob/allocation for them; PO unaffected by later quotation mutation until revise; PO revise adds/removes PO additional items with history; scope guard; PO totals parity.
**API – isolation:** WorkOrder create with a PO having additional items allocates/creates items only for calibration lines; `computePoProgress` totals unchanged (existing suites).
**API – catalog & customers:** CRUD, unique code, deactivate, company isolation; customer `pricingMode`.
**DB:** document-number/audit-extension suites remain green; migration validated by running it against a scratch DB (backfill assertions via SQL).
**Portal:** `previewTotals` + discount, quotation form utils, filename helper, customer form utils.

## 9. Reference vectors (shared discount function)
| subtotal | mode / input | amount | percent |
|---|---|---|---|
| 1 000 000 | PERCENT 10 | 100 000 | 10 |
| 1 000 000 | AMOUNT 100 000 | 100 000 | 10 |
| 1 000 000 | PERCENT 12.5 | 125 000 | 12.5 |
| 333 333 | PERCENT 10 | 33 333.30 | 10 |
| 1 000 000 | AMOUNT 333 333.33 | 333 333.33 | 33.3333 |
| 0 | AMOUNT 0 | 0 | 0 |
| 1 000 000 | PERCENT 100.0001 / AMOUNT 1 000 000.01 / negative | rejected | |

## 10. Sequence
1. Docs (this plan, audit) → 2. Prisma schema + migration (+ scratch-DB run, `prisma generate`) → 3. Shared (function, schemas, tests) → 4. API: quotations, PO, customers, catalog → 5. Portal → 6. Tests, typecheck, build → 7. Diff inspection → 8. Implementation report.

## 11. Acceptance criteria
**Quotation date** — backdating works; future rejected; number follows date; price lookup follows date; trial rows get deterministic Jakarta dates; `quotationDate` NOT NULL; `createdAt` unchanged by user input.
**Pricing mode** — STANDARD uses Price List; MANUAL never resolves it; manual price entry works; pending prices block send/approve.
**Discount** — percent→amount; amount→percent; both consistent; half-up rounding; persisted + reproducible; PO copies verbatim.
**Additional items** — manual add without eligibility; appear in totals/PDF/detail; copied to `PurchaseOrderAdditionalItem`; never create `PurchaseOrderItem`/`WorkOrderItem`/`CalibrationJob`/allocation; do not affect calibration volume; revise and PO snapshot integrity hold.
**Quality** — full Vitest suites for shared, db, api, portal green; typecheck and build green; no unrelated refactors; report states actual results.

---

## 12. Deviations from this plan (recorded during implementation)

Small, additive adjustments that the plan did not spell out; none changes a finalized decision.

1. **`quotationDate` added to `QUOTATION_SORTABLE_FIELDS`** and made the portal list's default sort/“Tanggal” column (possible now that the column is NOT NULL). The server's own fallback sort stays `createdAt`.
2. **`GET /quotations/:id` request include now also returns `serviceMode`** so the edit/revise forms can filter the catalog without another call.
3. **DB CHECKs on the header percent** (`0..100` on `Quotation` and `PurchaseOrder`) in addition to the planned additional-item CHECKs.
4. **Catalog list endpoint is readable with `quotation:read`** (maintenance stays on `priceListItem` create/update) — same precedent as `GET /price-list-items/resolve`; no new RBAC resource or seed.
5. **The Revise dialog edits additional items but not the header discount.** The API's revise accepts a discount change (and re-applies the stored mode otherwise); the dialog UI for it was not added (scope).
6. **`Quotation.request` select exposes `serviceMode`; `QuotationPreviewResult` exposes `pricingMode`.**
7. **`QuotationHistory.additionalItems` / `PurchaseOrderHistory.additionalItems`** are excluded from the list-summary types (summaries stay header-only, as for `items`).
