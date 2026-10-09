# Quotation Requirements — Implementation Report

**Date:** 2026-10-09
**Basis:** `quotation-requirements-audit-report.md` (Revision 2) and `quotation-requirements-implementation-plan.md` (Revision 2, incl. §12 deviations).
**Written for:** the Medcal lead / reviewers.

## 1. What was changed

### Schema and migration — `20261008000000_quotation_date_discount_pricing_mode_additional_items`
- Enums `CustomerPricingMode {STANDARD, MANUAL}`, `DiscountInputMode {AMOUNT, PERCENT}`.
- `Customer.pricingMode` (default `STANDARD`).
- `Quotation` / `QuotationHistory`: `quotationDate` (`@db.Date`, **NOT NULL**), `headerDiscountPercent` (`Decimal(7,4)`), `headerDiscountInputMode`.
- `PurchaseOrder` / `PurchaseOrderHistory`: `headerDiscountPercent`, `headerDiscountInputMode`.
- New tables: `AdditionalItemType`, `QuotationAdditionalItem`, `QuotationAdditionalItemHistory`, `PurchaseOrderAdditionalItem`, `PurchaseOrderAdditionalItemHistory`; CHECKs (`qty > 0`, `unitPrice > 0`, `discountAmount >= 0`, header percent `0..100`).
- **Backfill (deterministic):** `quotationDate = ((createdAt AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date`; history rows copy their parent quotation's date; `headerDiscountPercent = ROUND(amount / subtotal × 100, 4)` for rows with a discount; `SET NOT NULL` after the backfill. No NULL fallback exists in code.
- No applied migration was edited. A pre-existing, unrelated index-name drift (`DeviceCalibrationParameter_deviceTypeId_logicalTestK_key`) was left alone and deliberately not included.

### Quotation date
- Optional `quotationDate` on create/preview/PATCH; default = today in Asia/Jakarta; future dates rejected (`QUOTATION_DATE_IN_FUTURE`); `validUntil >= quotationDate` (`VALID_UNTIL_BEFORE_QUOTATION_DATE`).
- Document number follows `quotationDate` (`issuedAt = quotationDate`); Price List lookup follows `quotationDate`; preview uses the same date (preview == create).
- DRAFT date edit: number re-issued only if the year/month changes; lines are **not** repriced. SENT/APPROVED: not editable; revise never changes it.
- `createdAt` untouched. `approvedAt` / `customerApprovedAt` remain actual event times.
- PDF "Tanggal", PDF/email filename, list "Tanggal" column (now date, sortable by `quotationDate`, default list sort), detail page and compose text use `quotationDate` (UTC-pinned formatting).
- `AuditLog` `QUOTATION_BACKDATED` for a create/DRAFT date change earlier than today.

### Customer pricing mode
- `STANDARD`: unchanged Price List resolution (by quotation date). `MANUAL`: the resolver is not called; every line is `pricePending` with `unitPrice 0`, so the existing send/approve gate and DRAFT PATCH price entry apply unchanged. Preview returns `pricingMode`; New-Quotation shows a MANUAL notice.
- Customer create/update API + form (Pricing select). `AuditLog` `CUSTOMER_PRICING_MODE_CHANGE` when the mode really changes.
- No customer price table, no `Quotation.pricingBasis`.

### Discount (header level)
- One shared function `resolveHeaderDiscount` (`packages/shared`, exact BigInt cents arithmetic, half-up) used by API and portal. The client sends **only the field typed**; both-fields payloads are rejected (`DISCOUNT_FIELDS_CONFLICT`). The persisted `headerDiscountInputMode` is re-applied to the new subtotal when lines change (PATCH/revise), so a 10% discount stays 10%.
- Errors: `INVALID_HEADER_DISCOUNT`, `INVALID_HEADER_DISCOUNT_PERCENT`, `HEADER_DISCOUNT_EXCEEDS_SUBTOTAL`.
- **Formula (unchanged order):** `lineTotal = round(qty×unitPrice) − lineDiscount` (calibration + additional) → `subtotal = Σ` → header discount on the **combined** subtotal → `net` → tax (exclusive: `round(net×rate)`; inclusive: `round(net×rate/(1+rate))`) → total. One header tax applies to everything, additional items included; no per-line tax was introduced.
- PO copies amount, percent and mode verbatim; both PDFs print "Discount (10%)" when a percent is recorded. Per-line discounts remain amount-only.

### Additional items
- `AdditionalItemType` catalog (module `additional-item-types`, CRUD without delete, deactivate instead) + portal page `/additional-item-types` + menu entry. Governed by existing `priceListItem` permissions; the list endpoint accepts `quotation:read`.
- `QuotationAdditionalItem` snapshot lines: create, DRAFT PATCH (full replace), revise (desired set by `id`; consumed rows are frozen — changed ⇒ retired + replacement, removed ⇒ retired; unconsumed ⇒ update/delete after the history snapshot). Complete history snapshots.
- `PurchaseOrderAdditionalItem`: copied at PO create and reconciled by PO revise (history snapshot first). The PO never reads additional items from the quotation after the copy.
- **They stop at the PO:** no `PurchaseOrderItem`, allocation, `WorkOrderItem`, `CalibrationJob`, or PO-progress effect. `allocation.ts`, `work-order-source.ts`, `fanOutCalibrationJobs`, `po-progress.ts`, WO revise and shared SPK were not modified. `WorkOrderItemAccessory` is not used. No customer-eligibility model.
- UI: "Additional / Biaya Tambahan" switch + inline row editor on New, Edit and Revise; read-only tables on quotation detail, history dialog and PO detail; PDF sections on quotation and PO.

## 2. Verification actually run

| Check | Result |
|---|---|
| Migration on a scratch DB with legacy rows (Jakarta boundary 18:30 UTC → 2026-10-01, 16:59:59 UTC → 2026-09-30; percent backfill; NOT NULL) | verified; `migrate diff` after apply shows only the pre-existing unrelated rename |
| `@medcal/shared` Vitest | 10 files / 86 tests passed |
| `@medcal/db` Vitest (with `TEST_DATABASE_URL`) | 6 files / 68 tests passed |
| `@medcal/portal` Vitest | 26 files / 314 tests passed |
| `@medcal/api` Vitest — touched modules (quotations, customers, purchase-orders, dashboard, price-list-items) | 9 files / 233 tests passed |
| `@medcal/api` Vitest — **full suite, first run** | 74 files passed / 5 failed; 1653 passed / 30 failed / 1683 |
| Re-run of the failed files in isolation | calibration-jobs, certificate, chat-gateway: **pass** (the first-run failures were 5 s timeouts while my portal suite ran concurrently, plus one cascaded assertion). **3 files still fail** — see §3 |
| Typecheck: shared, db, api, portal (`tsc --noEmit`) | all clean |
| Build: `@medcal/portal` (`next build`), `@medcal/api` (`tsc -p`) | both succeeded |

New tests: `packages/shared/.../quotation-discount.test.ts` (18); `apps/api/.../quotation-commercial.service.test.ts` (49 + the pricing-mode audit assertion) covering backdating, numbering by date, price lookup by date, preview parity, audit, DRAFT date edit, history, PDF, backfill expression, NOT NULL; STANDARD vs MANUAL incl. send/approve gate; discount in both directions, decimals, rounding, zero, invalid, source switching, tax order, revise, PO copy; catalog; additional items (snapshot, validation, totals, revise, PO copy, PO revise, **no PurchaseOrderItem / WorkOrderItem / allocation / CalibrationJob / PO-progress effect**, PDFs); portal `quotation-totals.test.ts` (14) and customer payload tests; PDF label/filename tests.

The full API suite was **not** re-run end to end after the final two edits (customer audit row, one test fixture); the touched-module run above covers them.

## 3. Known failures and limitations

**Failing tests unrelated to this work** (files and code I did not modify; not caused by the schema change by their error messages, but I did not run them against a clean baseline):
- `push-tokens/notification-dispatch.service.test.ts` (2): `push.resolvePushIconUrl is not a function`.
- `emails/imap-sync.service.test.ts` (5): `IMAP is not configured` (environment).
- `whitelist/registration-origin-callers.test.ts` (1): `apps/tech-pwa/.../register/page.tsx:31` lacks an Origin signal.

**Known limitations (accepted in the audit):**
- Backdating into another month/year yields non-chronological sequence numbers; a DRAFT date change that crosses a month re-issues the number (old sequence not reused) and does not reprice lines.
- Manual prices leave no override trace. Header discount applies to the combined subtotal incl. additional items; the Revise dialog does not edit the header discount (API supports it).
- A revised APPROVED quotation's total can exceed the customer-approved amount; there is no new approval step. PO totals are re-copied only when item or additional-item scope changes (existing semantics).
- `prisma generate` can fail with `EPERM` on Windows while any Node process (dev server, test run, Prisma Studio) holds the query-engine DLL; the client was generated successfully during this work.

**Not touched / environment notes:** the working tree also contains changes I did not make (`apps/customer-portal/*`, `pnpm-lock.yaml`, `certificate-panel.tsx`, `apps/customer-portal/public/pdfjs/`); they are not part of this change. The development database `pkmdb` was not migrated — apply the migration there with `pnpm db:migrate` / `migrate deploy` when ready, and run `pnpm --filter @medcal/db seed:menu` to register the new menu entry.

## 4. Out of scope / not implemented
Customer price lists, customer eligibility for additional items, per-line tax, `Quotation.pricingBasis`, Requisition/PO business dates, invoicing of additional items, automated `EXPIRED`, price-override tracking, per-line percent discounts, a discount editor in the Revise dialog.

---

## 5. Addendum (2026-10-10) — Additional Cost: itemised breakdown, multiplier, no line discount

Enhancement to §1 "Additional items". It **supersedes** the earlier statements that additional lines carry a per-line discount (audit §6, plan §4) and the single "Additional Cost" aggregate row in the totals.

### 5.1 Model chosen and why
Options weighed: (A) explicit `peopleCount` + `duration` fields; (B) generic `qty` + `multiplier` with labels; (C) catalog-defined calculation basis.
**Chosen: B, with the catalog deciding the shape.** Every additional line keeps its existing `qty` (labelled by `unitLabel`, e.g. "orang") and gains **one optional second multiplier** with its own label (`multiplier`, `multiplierLabel`, e.g. 2 "hari"). Why: it expresses "Rp100.000 × 3 orang × 2 hari" and also a plain "Rp150.000 × 1 paket" with the same two fields; irrelevant fields are simply absent (no forced "people/duration" on an admin fee); no domain-specific columns (A) and no rules engine (C beyond one label). The **catalog** gets one optional column `AdditionalItemType.multiplierLabel`: if set, the quotation row shows the second input and requires it; if null the row is a simple qty. The row never lets the user invent a structure, and the catalog stays a default source only — the label is **copied into the snapshot**, so a later catalog change cannot alter any quotation/PO/PDF.

### 5.2 Calculation (backend-authoritative)
`lineTotal = round2(unitPrice × qty × (multiplier ?? 1))`, computed in `QuotationsService` (create, DRAFT PATCH, revise) and persisted; the client can no longer send a line total or discount (unknown keys are stripped by the schema). Validation: `unitPrice > 0`; `qty` and `multiplier` positive whole numbers; multiplier **required** iff the line's snapshotted label exists (`ADDITIONAL_ITEM_MULTIPLIER_REQUIRED`) and **rejected** otherwise (`…_NOT_APPLICABLE`); computed amount must be > 0. On revise a row keeps *its own* snapshotted shape, not the current catalog's. DB CHECKs: multiplier `> 0`, and `multiplier`/`multiplierLabel` are both NULL or both set. The portal mirrors the formula only for the live form preview, through the same shared helpers (`additionalLineTotal`, `describeAdditionalCalculation` in `packages/shared`).
The **header discount is unchanged** (bidirectional percent/amount, applied to the combined subtotal): e.g. 600.000 + 300.000 = 900.000 → 10 % = 90.000 → 810.000 (when there are no calibration lines; with a 100.000 calibration line the same discount on 1.000.000 is 100.000 — both covered by tests).

### 5.3 Schema / migration
Migration **`20261010000000_additional_item_multiplier_remove_line_discount`** (new; the applied `20261008…` and `20261009…` migrations are untouched): adds `AdditionalItemType.multiplierLabel`; adds `multiplier`/`multiplierLabel` and **drops `discountAmount`** on `QuotationAdditionalItem`, `PurchaseOrderAdditionalItem` and both history tables; CHECKs as above. Existing rows keep `qty`/`unitPrice`/`lineTotal` (equal to qty × unitPrice because no line discount was set) with multiplier NULL. A guard aborts the migration with a clear message if any additional-item row carries a non-zero line discount, instead of dropping data silently. Applied to the test DB; **not applied to the dev DB `pkmdb`** (run `pnpm db:migrate`).

### 5.4 UI / documents
- **Form row:** Harga satuan · Jumlah *{unit}* · (Jumlah *{multiplier label}* when the type has one) · Jumlah (amount) + the calculation text; **no discount field**.
- **Totals block (form, quotation detail, PO detail):** "Items", then **one row per additional cost by its own snapshot name** with its calculation underneath (e.g. "Biaya transport — Rp 100.000 × 3 orang × 2 hari — Rp 600.000"), then Subtotal / Discount / Tax / Total. No generic "Additional Cost" aggregate; nothing shown when there are no additional items.
- **Detail tables:** "Deskripsi / Perhitungan" + Line Total.
- **Quotation PDF and PO PDF:** "BIAYA TAMBAHAN" section lists each item (name, calculation, amount, notes) and the totals area lists "Items" + each additional item by name — all from snapshot columns, never the catalog.
- **Catalog page** and inline "new type" form: optional "Pengali ke-2" (e.g. *hari*); table column added. Code remains auto-generated (`ADC-nnn`).

### 5.5 Verification (actually run)
| Check | Result |
|---|---|
| `@medcal/api` Vitest — quotations, purchase-orders, customers, **work-orders** | 8 files / 360 tests passed |
| `@medcal/portal` Vitest (full) | 26 files / 322 tests passed |
| `@medcal/shared` Vitest (full) | 11 files / 92 tests passed |
| Typecheck shared, db, api, portal | clean |
| Build `@medcal/portal` (`next build`), `@medcal/api` | succeeded |
Tests added/updated: simple 100.000 × 1; 100.000 × 3 × 2 = 600.000; transport + lunch = 900.000 with 10 % header discount; client-supplied total/discount ignored; zero/negative/fractional multipliers rejected; multiplier required/not-applicable by type; catalog edits don't change quotation/history; revise keeps the row's snapshot shape; PO snapshot copy and PO-revise-only mutation, PO history; pipeline isolation (no PurchaseOrderItem/WorkOrderItem/allocation/CalibrationJob, PO progress unchanged); both PDFs render; shared calculation/description helpers; portal totals lines (each name listed, no "Additional Cost" aggregate), no discount in the payload.
Not re-run end to end after this change: the full API suite and the db suite (the db audit-extension test is unaffected: no new models).

### 5.6 Limitations / deviations
- The PDF content itself is asserted only as "renders a valid PDF"; the wording of the calculation is asserted through the shared `additionalCalculationText` helper that both PDFs use.
- A type's multiplier label is fixed by the catalog; to change the shape of an existing line, remove it and add it again (or change the catalog and re-add). There is deliberately no per-quotation structure editor.
- Multipliers are whole numbers (people, days/nights); fractional days are not supported.
- The Revise dialog still does not edit the header discount.
