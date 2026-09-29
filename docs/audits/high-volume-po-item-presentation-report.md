# High-Volume PO Item Presentation — Implementation Report

Status: implemented in the portal UI. Authenticated visual check of the live
trial page was not completed (sign-in gate).

## 1. Current implementation

The item list is rendered by `PurchaseOrderSnapshot` in
`apps/portal/src/app/management/purchase-orders/purchase-orders-ui.tsx`.
PO detail (`apps/portal/src/app/management/purchase-orders/[id]/page.tsx`)
passes `snapshotLinesFromPurchaseOrder(purchaseOrder)` from
`GET /purchase-orders/:id`.

The same component is also used on PO create, PO edit, and
`/work-orders/new`. Those callers do not pass `collapseItems`, so their
tables stay expanded.

The table itself is presentational. It does not select items for allocation
or Work Order creation. `PurchaseOrderWorkOrderSection` was not edited.

Radix Accordion is already the portal disclosure (`components/ui/accordion.tsx`),
used by leads and by calibration-job detail section headers
(`border-t border-slate-100`, `px-0 py-3`, `hover:no-underline`).

## 2. UX problem

Every active line was a full row: description, equipment name, type, id, qty,
unit price, discount, and line total. The heading was only `Items (N)`.
On the trial PO that is 56 rows. Quantity sum and the commercial total sat
after that list, so the operator had to scroll the whole document to see
the scale of the PO.

## 3. Chosen solution

PO detail only sets `collapseItems`. The item table is wrapped in the existing
Radix accordion, closed by default. The trigger follows the calibration-job
section header and reads:

`Items (56) · 406 units` plus `View all items` (chevron on the right).

Open state replaces that affordance with `Hide items` and shows the same
table columns as before, in the same array order. No pagination, search, or
filter.

Tax lines and `QuotationTotals` stay outside the accordion, so the PO total
remains visible without opening 56 rows. That total is commercial summary,
not one of the long rows.

Keyboard: the trigger is the Radix button (`aria-expanded`). State is
uncontrolled and not persisted; a reload returns to the summary.

## 4. Data preservation

Read-only query of the trial PO `cmukxeo2v005tcz0kww36ydnn` after the UI
change (the UI does not write):

| Field | Value |
|---|---|
| Status | APPROVED |
| Active items | 56 |
| Sum of item qty | 406 |
| Subtotal | 170980020 |
| Header discount | 0 |
| Tax | 0 |
| Total | 170980020 |

The table still maps `description`, `deviceName`, `deviceTypeName`,
`deviceId`, `qty`, `unitPrice`, `discountAmount`, and `lineTotal` with the
existing formatters. The summary quantity is `sum(moneyNumber(qty))` for
display only.

A static render test of the React tree was not kept. Portal Vitest is
configured with `jsx: preserve` and cannot import this `.tsx` module. That
failure is the existing test runner setup, not a data change. Vitest config
was not modified.

## 5. Work Order isolation

Unchanged:

- `Plan WOL/SPK` still links to `/purchase-orders/:id/plan-wol`
- `Create Work Order` still links to `/work-orders/new?purchaseOrderId=`
- `canOfferLegacyWorkOrderShortcut`, allocation, and `WorkOrdersService.create`
  were not edited
- `CalibrationRequest.serviceMode`, SPK, and WOL resolution were not edited

The detail page diff is the single prop `collapseItems` on
`PurchaseOrderSnapshot`.

## 6. Files changed

- `apps/portal/src/app/management/purchase-orders/purchase-orders-ui.tsx`
- `apps/portal/src/app/management/purchase-orders/[id]/page.tsx`
- `docs/audits/high-volume-po-item-presentation-report.md`

No API, schema, fixture, or Work Order file was changed.

## 7. Tests

`apps/portal`:

`npx vitest run src/app/management/purchase-orders/purchase-order-form-utils.test.ts src/app/management/work-orders/work-order-form-utils.test.ts`

Result: 2 files, 40 tests, all passed.

These tests cover purchase-order form rules and the legacy Work Order
shortcut predicate. They do not render the detail page. They were run to
confirm this UI change did not disturb those modules.

## 8. Visual verification

Not completed on the live 56-item page.

`http://localhost:3003/purchase-orders/cmukxeo2v005tcz0kww36ydnn` redirects to
`/sign-in`. The browser session used for this check has no portal login.
`/management/purchase-orders/...` 404s because the host rewrite already
prefixes `/management`.

What was confirmed without the signed-in page:

- default path is the closed accordion, not 56 expanded rows
- expanded markup is the previous table, not a second grid
- Work Order section source is untouched
- trial row count and money totals in the database match the known trial scale

A signed-in pass is still required to judge spacing, the Work Order section
beside the summary, and horizontal overflow on the real layout.
