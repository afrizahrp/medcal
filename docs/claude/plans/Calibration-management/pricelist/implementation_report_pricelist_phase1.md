# MEDCAL — Price List / Tariff — Phase 1 Implementation Report

**Date:** 2026-08-30
**Scope delivered:** DeviceType-keyed Price List master + automatic tariff resolution
during Requisition → Quotation generation + the QTY-propagation bug fix.
**Locked rules honoured:** BR-01 … BR-14 (see §16).

---

## 1. Implementation Summary

| Area | What changed |
|---|---|
| Schema | New `PriceListItem` model; new `QuotationItem.pricePending` boolean |
| Migration | `20260830120000_add_price_list_item_and_quotation_price_pending` (additive only) |
| Shared | `priceListItem*` zod schemas + types; `quotationCreateSchema` no longer accepts per-line `unitPrice` / `qty` |
| API | New `price-list-items` module (CRUD + `resolve` + overlap guard); `QuotationsService.create` now **generates** lines with server-side Price List lookup; `send`/`approve` blocked while any line is `pricePending` |
| RBAC | New `priceListItem` resource (`read/create/update/delete`), granted to ADMIN in seed; `me` capabilities + access-control test fixture updated |
| Menu | `calibration-management.price-list` nav entry → `/price-list-items` |
| Portal | New Price List management screen; quotation "new" page reworked to **generate-then-edit** (read-only item preview); `itemsFromRequest` now carries requisition `qty` |
| Tests | New `price-list-items.service.test.ts` (14); rewritten `quotations.service.test.ts` (37) incl. the realistic 5/3/2 scenario; PO + WO test helpers updated to seed a Price List row |

Dormant `ServiceTariff` was **left completely untouched** (see §9).

---

## 2. Schema Changes (`packages/db/prisma/schema.prisma`)

```prisma
model PriceListItem {
  id             String    @id @default(cuid())
  companyId      String
  deviceTypeId   String
  unitPrice      Decimal   @db.Decimal(18, 2)   // tax-exclusive
  currency       String    @default("IDR")
  effectiveFrom  DateTime  @db.Date
  effectiveUntil DateTime? @db.Date
  isActive       Boolean   @default(true)
  notes          String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  company    Company    @relation(fields: [companyId], references: [id], onDelete: Cascade)
  deviceType DeviceType @relation(fields: [deviceTypeId], references: [id])   // onDelete: Restrict
  @@unique([companyId, deviceTypeId, effectiveFrom])
  @@index([companyId, deviceTypeId, effectiveFrom])
  @@index([companyId, isActive])
}

model QuotationItem {
  // …existing fields unchanged…
  pricePending   Boolean  @default(false)   // NEW
}
```

Back-relations added: `Company.priceListItems`, `DeviceType.priceListItems`.

**Migration** — additive, safe: `CREATE TABLE "PriceListItem"` + 3 indexes + 2 FKs, and
`ALTER TABLE "QuotationItem" ADD COLUMN "pricePending" BOOLEAN NOT NULL DEFAULT false`.
No existing column/table was dropped or rewritten. Applied to the dev DB with
`prisma migrate deploy`; `prisma migrate status` → *Database schema is up to date*.

**Money is `Decimal(18,2)`; quantities/rates unchanged. No floating point.**

---

## 3. Price List Model & Service (`apps/api/src/modules/price-list-items/`)

- `price-list-items.service.ts` — `create / findAll / findOne / update / remove / resolve`
  + exported `resolveActivePriceListItem(client, companyId, deviceTypeId, onDate)` used by
  the quotations service (accepts a transaction client).
- `price-list-items.controller.ts` — `POST / GET / GET :id / PATCH :id / DELETE :id`
  + `GET /price-list-items/resolve?deviceTypeId=&date=` (guarded by `quotation:read`, for
  the portal preview). All company-scoped via `@CompanyId()`; per-verb `@RequirePermission`.
- `price-list-items.module.ts` — registered in `apps/api/src/app.module.ts`.

Validation (BR / §9 of the spec):
- `unitPrice` must be `> 0` (service guard `INVALID_PRICE` + zod `.positive()`).
- DeviceType must exist (`DEVICE_TYPE_NOT_FOUND`).
- `effectiveUntil >= effectiveFrom` (`INVALID_EFFECTIVE_RANGE`).
- Exact-date duplicate → `@@unique` → `DUPLICATE_PRICE_LIST_ITEM` (409).
- **No overlapping active window** for the same `(companyId, deviceTypeId)` →
  `PRICE_LIST_OVERLAP` (409). Inactive rows are ignored by the overlap check.
- Company ownership enforced in `findOne` (`findFirst({ where: { id, companyId } })`).

---

## 4. Effective Dating

- A price change is a **new row** with a later `effectiveFrom` (append-only convention;
  the service does not mutate `effectiveFrom` of an active row for you — the UI "edit"
  only changes `unitPrice`/`isActive`, and creating an overlapping active row is rejected).
- `resolve(companyId, deviceTypeId, onDate)` selects
  `isActive = true AND effectiveFrom <= onDate AND (effectiveUntil IS NULL OR effectiveUntil >= onDate)`,
  ordered by `effectiveFrom DESC`, `take 1`. Dates are normalised to UTC date-only before
  comparison so a quote created on the tariff's last valid day still resolves.
- Historical tariffs remain fully queryable (`findAll`, and `resolve` for a past date).

---

## 5. Requisition → Quotation Flow (`apps/api/src/modules/quotations/quotations.service.ts`)

`POST /quotations` body is now `{ requestId, taxCode, source?, validUntil?,
headerDiscountAmount?, items? }`. `items` is **optional** and, when present, may only
carry `{ requestItemId, description?, discountAmount? }` — it can never set price or qty.

`QuotationsService.create` (inside the existing `$transaction`):

1. Load the `CalibrationRequest` + its items (+ `deviceType.name`).
2. Status gate (`SUBMITTED` / `IN_QUOTATION`) and one-quotation-per-request gate — unchanged.
3. If `items` supplied → `assertFullScopeItems` (unchanged 1:1 bijection guard) and collect
   description/discount overrides. If omitted → generate for every requisition item.
4. `issuedAt = new Date()` (the same value used for the QUO document number — the
   authoritative quotation date, BR-10). No new date concept introduced.
5. For each requisition item → `buildGeneratedRows`:
   - `qty` = `CalibrationRequestItem.qty` **verbatim** (BR-03).
   - `unitPrice` = `resolveActivePriceListItem(tx, companyId, item.deviceTypeId, issuedAt)`
     → snapshot into `QuotationItem.unitPrice`. If `null` → `unitPrice = 0`,
     `pricePending = true` (BR-11).
   - `description` = override ?? `deviceType.name`.
   - line amount via the **existing** `computeItemLine` (BR-13).
6. Header totals via the **existing** `computeHeaderTotals` (tax / discount / rounding
   untouched).
7. `Quotation` + `QuotationItem[]` created; request `SUBMITTED → IN_QUOTATION` (unchanged).

`send()` and `approve()` now call `assertNoPendingPrices(id)` → `400
QUOTATION_PRICE_NOT_CONFIGURED` if any line is `pricePending` (BR-11). `update()` (DRAFT
manual override, BR-12) still accepts a full per-line `unitPrice`; a line is re-flagged
`pricePending` only if the entered price is `<= 0`.

**Downstream unchanged:** `PurchaseOrderItem` still copies `qty/unitPrice/discountAmount/
lineTotal` from `QuotationItem`; `WorkOrderItem` still carries no money; no PO/WO/Invoice
code reads the Price List (BR-14).

---

## 6. Qty Propagation (the "QTY BUG")

- **Server:** `qty` is copied from `CalibrationRequestItem.qty` in `buildGeneratedRows` —
  never defaulted to 1 when a value exists.
- **Portal:** `itemsFromRequest` (`quotations-ui.tsx`) previously hard-coded `qty: "1"`;
  it now emits `String(item.qty)`.
- **Regression tests:** `quotations.service.test.ts` — *"requisition qty is copied exactly
  and NOT exploded into rows"* (qty 5 → one line, qty 5, lineTotal = 5 × unitPrice) and the
  5/3/2 scenario.

---

## 7. Price Lookup

Single lookup, **server-side, once**, at generation time (step 5 above), inside the create
transaction. `QuotationItem.unitPrice` is thereafter the source of truth: quotation
read / update / PDF / PO / WO never call the Price List. The portal "new quotation" preview
uses `GET /price-list-items/resolve` for display only.

---

## 8. Missing-Price Handling (BR-11)

`QuotationItem.pricePending` (new boolean). When generation finds no active tariff:
line is created (`unitPrice = 0`, `pricePending = true`), the quotation is still a normal
`DRAFT`, but `send`/`approve` throw `QUOTATION_PRICE_NOT_CONFIGURED` until every line has a
real price (entered via `PATCH`). No new status enum was added — a single boolean is the
smallest representation and the existing schema could not express the state otherwise
(this fork was confirmed with the product owner before implementation).

---

## 9. Quotation Snapshot & dormant ServiceTariff

- Snapshot: `QuotationItem.unitPrice` is written once and frozen after `DRAFT`
  (existing "commercial freeze"). Test *"later Price List changes do not touch the
  quotation"* deactivates the tariff + adds a new one and asserts the quotation's
  `unitPrice`/`subtotal` are unchanged.
- `ServiceTariff`: audit confirmed it is genuinely dormant (no service/controller/seed/RBAC/
  UI; `unitPrice` never read). It was **not** modified, extended, or deleted.
  `QuotationItem.tariffId` (its FK) is left as-is and remains unused by the portal.
  `PriceListItem` is a separate, additive model — the approved
  `DeviceType → PriceListItem → QuotationItem` direction.

---

## 10. RBAC

- `packages/auth/src/access-control.ts`: `priceListItem: ["read","create","update","delete"]`.
- `packages/auth/src/me-types.ts` + `apps/api/src/modules/me/me.controller.ts`: four
  `priceListItem*` capability booleans.
- `packages/db/prisma/seed-role-permissions.ts`: ADMIN granted all four (SUPERADMIN via
  bypass). Seed re-run against the dev DB (`113 RolePermission rows upserted`).
- `packages/auth/src/access-control.test.ts`: fixture rows + a new `describe` block —
  **50 auth tests pass**.
- No existing permission was modified or weakened.

---

## 11. UI

- **`/management/price-list-items`** — list + filters (search, device type, status),
  inline "add tariff" (DeviceType picker, unit price, effective-from/until, notes),
  per-row edit price / activate-deactivate / delete, pagination. Mirrors the
  `device-type-aliases` master-data pattern. Gated by `priceListItemRead` /
  `priceListItemCreate`. Menu entry under Calibration Management.
- **Quotation "new" page** — now generate-then-edit: item table is a **read-only preview**
  (device, description, requisition qty) with an explicit notice that tariffs are applied
  from the Price List and that unpriced lines block sending. Submit posts only the header
  (`requestId`, `taxCode`, `source`, `validUntil`, `headerDiscountAmount`); the operator
  adjusts prices afterwards on the DRAFT quotation's existing edit screen (unchanged).

---

## 12. Tests

### Price List — `price-list-items.service.test.ts` (14, all pass)
create / positive-price / unknown DeviceType / effective-range / exact-date duplicate /
active-window overlap / non-overlapping successor / inactive-ignored-in-overlap /
effective-date selection + history / no-active-tariff → null / inactive not selected /
company isolation (`resolve` scoped, `findOne` rejects foreign) / update price / delete.

### Requisition → Quotation — `quotations.service.test.ts` (37, all pass)
Includes the spec's numbered checks:

| # | Test |
|---|---|
| 8/9/10 | every requisition item → exactly one quotation item, full scope, no extras |
| 11/12 | qty copied exactly; qty 5 stays ONE row (`lineTotal = 5 × unitPrice`) |
| 13 | NULL customer Device ID does not block pricing |
| 14/15 | `customerDeviceName` "Tensimeter" / decoy alias-named DeviceType never used as key |
| 16 | effective-dated selection picks the tariff active on the quotation date |
| 17 | `unitPrice` is a snapshot — later Price List change leaves the quotation untouched |
| 19 | missing tariff → `pricePending` line, DRAFT ok, `send`+`approve` rejected, PATCH price then `send` ok |
| 20 | existing calc engine correct (qty × price − line disc − header disc + exclusive tax) |
| 21 | transaction rollback on scope-mismatch (no `Quotation` row, request stays `SUBMITTED`) |
| — | inactive tariff not selected; SUBMITTED→IN_QUOTATION; duplicate-quotation guard; tenant isolation |

### Regression — other suites re-run and green
- `purchase-orders.service.test.ts` and `work-orders.service.test.ts` helpers updated to
  seed a `PriceListItem` before generating a quotation — **all pass**.
- `packages/auth` (50), `packages/db` (14), `packages/shared` (21) — pass.
- `me` / `menu` / `calibration-requests` API suites — pass.

### Verification commands actually run
```
prisma migrate deploy            # applied 20260830120000_…
prisma migrate status            # "Database schema is up to date!"
prisma generate
pnpm --filter @medcal/shared run typecheck     # ok
pnpm --filter @medcal/auth   run typecheck      # ok
pnpm --filter @medcal/api    run typecheck      # ok
pnpm --filter @medcal/api    run build          # ok (tsc -p)
pnpm --filter portal         run typecheck      # ok
pnpm --filter portal         run build          # "✓ Compiled successfully", /management/price-list-items route emitted
vitest run  price-list-items / quotations / purchase-orders / work-orders   # 123 pass
vitest run  packages/auth                                                    # 50 pass
seed-role-permissions.ts / seed-menu.ts                                      # upserted
```

---

## 13. Realistic Scenario (executed as a test)

`quotations.service.test.ts` → *"realistic 5 / 3 / 2 scenario"*:

| Device | Price List | Req Qty | Quotation line |
|---|---|---|---|
| Sphygmomanometer | Rp100,000 | 5 | qty 5, unit 100,000, amount **500,000** |
| Bedside Monitor | Rp250,000 | 3 | amount **750,000** |
| Infusion Pump | Rp175,000 | 2 | amount **350,000** |

Result: **exactly 3 quotation lines**, `subtotal = totalAmount = Rp1,600,000` (T0 tax).
No Device / CalibrationJob rows created.

---

## 14. Regression Results

No new failures introduced. The full `apps/api` suite has **12 pre-existing failures**
(contact-message lead-matching, chat gateway security, emails imap-sync, push-tokens icon
helper) — confirmed identical on a clean `git stash` of this branch; they are unrelated to
Price List / Quotation / RBAC and were failing before this work.

---

## 15. Known Limitations

1. **Overlap check is application-level** (no Postgres exclusion constraint), so a
   concurrent double-insert of two overlapping active tariffs is theoretically possible
   under race; the `@@unique(companyId, deviceTypeId, effectiveFrom)` still blocks exact
   duplicates.
2. **No `priceListItemId` traceability column** on `QuotationItem` — which tariff row fed a
   line is not recorded (only the snapshot price + `pricePending`). Deferred per BR-12 /
   guardrail (no override-audit trail this phase).
3. **`update()` on a PriceListItem edits `unitPrice` in place.** The append-only "new row
   per change" policy is a workflow convention enforced only for the overlap case; the API
   still allows an in-place price edit (useful for fixing a typo before any quotation used
   it). Historical quotations are unaffected regardless because they hold snapshots.
4. **`resolve` preview endpoint** is per-DeviceType (one call per requisition line on the
   new-quotation page). Fine for typical requisition sizes; a batch endpoint was not added.
5. **Quotation "new" page** shows a zeroed totals block in preview mode (real prices are
   applied server-side on generate). The inline notice explains this.
6. `next build` and the API vitest run require `DATABASE_URL` in the environment (the repo
   convention loads it from root `.env`); unchanged by this work.

---

## 16. Deferred Business Decisions (unchanged from the audit)

- Service-mode pricing (ON_SITE vs SEND_TO_LAB) — **not implemented** (guardrail).
- Parameter-level pricing — **not implemented** (guardrail).
- Customer-specific / contract / group pricing — **not implemented** (guardrail).
- Quantity-break / tiered pricing — **not implemented** (guardrail).
- Automated `QuotationStatus.EXPIRED` / tariff-expiry job — out of scope.
- Manual-override audit fields (`listUnitPrice` / `isPriceOverridden` / `overriddenBy` /
  `overriddenAt`) — **not added** (BR-12).
- Retiring or repurposing `ServiceTariff` — left dormant, decision deferred.

---

## Guardrail Confirmation

No pricing was added to `Device`, `DeviceType`, `DeviceTypeAlias`, `DeviceCalibrationParameter`,
`CalibrationJob`, `WorkOrder`, or `Invoice`. The Price List is not a live dependency of
quotation display. PO / WO / Invoice do not query the Price List. Qty is never exploded;
one quotation line per requisition item. `Device.id` is not required for pricing. No
`CalibrationJob` is created. Requisition model and quotation full-scope validation are
unchanged. RBAC was extended additively, never weakened. Migration is additive.
