# High-Volume PO Detail UX + Work Order Plan CTA — Audit (HARD STOP)

Status: STOPPED before implementation.

No portal, API, schema, or fixture code was changed. This document records the
architecture audit and the hard-stop finding that blocks the requested CTA change.

## 1. Current architecture

### Page and components

- Route: `apps/portal/src/app/management/purchase-orders/[id]/page.tsx`
  (`PurchaseOrderDetailPage`).
- Item presentation is not a separate list component. It is
  `PurchaseOrderSnapshot` in
  `apps/portal/src/app/management/purchase-orders/purchase-orders-ui.tsx`,
  fed by `snapshotLinesFromPurchaseOrder()`.
- The same snapshot is also rendered on PO create, PO edit, and
  `/work-orders/new`. A presentation change inside `PurchaseOrderSnapshot`
  would therefore leak outside PO detail unless gated by a new prop used only
  on the detail page.
- Work Order section: `PurchaseOrderWorkOrderSection` in the same detail page.
  It is not shared with another route.

### API / data source

- PO body: `usePurchaseOrder` → `GET /purchase-orders/:id`
  (`purchaseOrderInclude` in `purchase-orders.service.ts`).
- Active items only (`status != CANCELLED`), with quotation item, request item,
  device type, tariff, and device. No pagination on this payload.
- Work Order cards: `usePurchaseOrderWorkOrders` →
  `GET /purchase-orders/:id/work-orders` (`getWorkOrderSummaries`). Lightweight
  summary only: id, number, status, serviceMode, createdAt, itemCount, totalQty.
- Planning screen data: `GET /purchase-orders/:id/allocation-summary`.

`purchaseOrderInclude.quotation.request` selects `{ number: true }` only.
`CalibrationRequest.serviceMode` is not on the PO detail payload.

### Existing actions on this page

When the viewer has `workOrderCreate` and the PO status is `APPROVED`:

| Control | When visible | Destination | What it submits |
|---|---|---|---|
| Plan WOL/SPK | Always (zero, one, or many Work Orders) | `/purchase-orders/:id/plan-wol` | One `WorkOrdersService.create({ purchaseOrderId, items })` per staged group. Explicit item/qty pairs. No address, geo, or schedule. |
| Create Work Order | Only when `canOfferLegacyWorkOrderShortcut` is true: no non-cancelled Work Order, query not loading, and the work-order read did not fail. Rendered twice in the same section: empty state, and the "all cancelled" dashed card. | `/work-orders/new?purchaseOrderId=` | `buildWorkOrderCreatePayload(...)` with address, geo, location notes, and schedule. `items` is omitted. |

`canOfferLegacyWorkOrderShortcut` lives in
`apps/portal/src/app/management/work-orders/work-order-form-utils.ts` and is
covered by `work-order-form-utils.test.ts`. Hiding the button with CSS would
leave both `<Link>` targets in this section. There is no third Create Work
Order control on the detail page. `/work-orders/new` itself still has a
submit button labelled Create Work Order; that page is outside this section.

### Service-location source of truth

Enum `ServiceMode` (`packages/db/prisma/schema.prisma`):

- `ON_SITE`
- `SEND_TO_LAB`

There is no `IN_LAB` value. The PDF label map
(`work-order-pdf-shared.ts`) displays `SEND_TO_LAB` as "In Lab".

Authoritative resolution at Work Order creation
(`work-orders.service.ts`, inside `create`):

```
purchaseOrder.quotation.request.serviceMode
  ON_SITE     → documentType WORK_ORDER            → number series SPK
  SEND_TO_LAB → documentType WORK_ORDER_SEND_TO_LAB → number series WOL
WorkOrder.serviceMode = request.serviceMode
```

The field is immutable after create. The client does not choose SPK vs WOL.

The current Minto Hardjo trial request was created with
`serviceMode = SEND_TO_LAB` (see
`docs/audits/high-volume-management-portal-trial-preparation-report.md`).
That PO therefore resolves to WOL, not SPK.

## 2. UX problem

`PurchaseOrderSnapshot` always renders every active line as a full table row:

- description
- customer device name when it differs from the description
- device type name
- device id
- qty, unit price, discount, line total

The heading is only `Items (N)`. Quantity sum and money total sit after the
table (`QuotationTotals`), so on a 56-line PO the operator scrolls through
roughly four text lines per item before the commercial total is visible.
Nothing is truncated by the API; the page is long because every commercial
line is expanded by default. The same renderer is correct for a short PO and
becomes a single uncontrolled column at 56 lines / 406 units.

The item table is read-only. It does not drive allocation math. Allocation
uses `PurchaseOrderItem` rows and `allocation-summary`, not this table.

## 3. Chosen solution

Not implemented. See §8.

If the CTA hard stop is cleared, the smallest presentation change that matches
the portal is a detail-page-only collapse around the existing snapshot table,
using the existing Radix accordion (`apps/portal/src/components/ui/accordion.tsx`,
already used by leads and calibration-job detail):

- Summary always visible: item count, summed quantity, and the existing total.
- Full table (every column already rendered today) behind an accessible
  accordion trigger, keyboard-operable, default closed on this page only.
- No new pagination, no API change, no change to qty/price/discount/totals.
- PO create, PO edit, and `/work-orders/new` keep the current expanded table
  unless a later task says otherwise.

A threshold special-cased to 56 items was rejected. Collapsing only this trial
PO was rejected.

## 4. Work Order CTA change

Not implemented.

### Current

- `Plan WOL/SPK` → multi-group allocation planner.
- `Create Work Order` → legacy single-document form that claims every
  remaining quantity because `items` is omitted
  (`resolveAllocationPlan` in `apps/api/src/modules/work-orders/allocation.ts`).

### Requested

- One control, `Create Plan`, into the existing planner.
- `ON_SITE` → SPK, in-lab → WOL, from domain data.

### Why this was not applied

These are different business processes, not two labels on one flow.

1. Plan stages explicit `(purchaseOrderItemId, qty)` groups and can create
   several Work Orders. It does not collect address, coordinates, location
   notes, or schedule. For 56 items the operator must add each line by hand.
2. Create Work Order omits `items`. The server then claims every active item's
   remaining quantity in one Work Order and stores the operational fields.
   The form still refuses to open when any non-cancelled Work Order exists
   (`findActiveWorkOrder` on `/work-orders/new`). The detail page only links
   there when that shortcut would not dead-end.

Removing the second control from this page would drop the only entry, from
an approved PO with zero Work Orders, to "claim everything left, with
schedule and address". The planner does not replace that behavior. The route
`/work-orders/new` would remain, but its empty-state copy tells the operator
to use Create Work Order from the PO.

Service location itself is reliable on the server. It is not reliable as a
label on this page today, because `GET /purchase-orders/:id` does not return
`request.serviceMode`. Showing `Create Plan · SPK` or `Create Plan · WOL`
without a new read (request GET the new-Work-Order page already uses, or
adding `serviceMode` to the existing request select) would be a guess.
Adding that select field was not done; it is a response-shape change and was
not required once implementation stopped.

The trial PO is `SEND_TO_LAB`, which the server maps to WOL. An `ON_SITE`
twin of this 56-item PO was not created, so both document types were not
exercised in the browser.

## 5. Files changed

- `docs/audits/high-volume-po-detail-ux-work-order-cta-audit.md` (this file)

No application source, test, schema, or fixture file was modified.

## 6. Tests

No suite was run. Behavior was not changed, so a green or red run would not
distinguish a regression from this task.

Manual and high-volume browser checks were not run, for the same reason.

## 7. Regression assessment

No existing behavior outside this scope changed, because no behavior changed
at all.

## 8. Hard stop

Implementation stopped on condition 1, with condition 3 as the consequence:

1. `Plan WOL/SPK` and `Create Work Order` are different processes.
3. Removing `Create Work Order` from this page removes a workflow the planner
   does not provide: one Work Order for all remaining quantity, plus
   operational fields, and only while no active Work Order exists.

Conditions that were checked and did not independently stop the item-presentation
idea:

2. Service location is determined by `CalibrationRequest.serviceMode`. The PO
   detail JSON simply does not include it.
4. The snapshot table is presentational. Allocation does not read it.
5. A collapse on the detail page does not require an API or schema change.
   Labelling the button SPK vs WOL does require a read the page does not have.
6. `calibration-job/[id]` is not involved.
7. The CTA change is local to `PurchaseOrderWorkOrderSection`, but it is the
   wrong change until the two flows are reconciled. The item collapse can stay
   inside the detail page plus an optional prop on `PurchaseOrderSnapshot`.

Do not hide Create Work Order, do not relabel Plan WOL/SPK to Create Plan, and
do not invent an `IN_LAB` mode, until there is an explicit decision about what
happens to the claim-all-remaining operational form.
