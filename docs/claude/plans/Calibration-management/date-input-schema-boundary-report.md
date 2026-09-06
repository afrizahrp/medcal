# Stage 2 Report: Eliminate `asWireDate` at the Schema Boundary

Status: **complete, not deployed** (hard stop as instructed).
Date: 2026-09-06.

## Outcome

`asWireDate` is **gone from the codebase** — no cast, no `as never`, nowhere. The
compiler now reflects reality: request-body date fields type as `string`, the
service layer still sees `Date`, and the two are separate types instead of one
type with a lie painted over it.

## 1. Every `asWireDate` call site (all safe)

15 call sites in 6 files. For each, the returned value flows **directly into a
request-payload object literal** that is immediately `JSON.stringify`-ed by the
mutation hook — no intermediate variable, no method call, no comparison, no
formatting. **No risky sites.**

| # | File:line | Context | Verdict |
|---|---|---|---|
| 1 | `work-orders/work-order-form-utils.ts:123` | `scheduledStart` in `buildWorkOrderCreatePayload` return | safe — direct pass-through |
| 2 | `work-orders/work-order-form-utils.ts:124` | `scheduledEnd` in `buildWorkOrderCreatePayload` return | safe |
| 3 | `work-orders/work-order-form-utils.ts:142` | `scheduledStart` in `buildWorkOrderUpdatePayload` return | safe |
| 4 | `work-orders/work-order-form-utils.ts:143` | `scheduledEnd` in `buildWorkOrderUpdatePayload` return | safe |
| 5 | `purchase-orders/purchase-order-form-utils.ts:75` | `customerPoDate` in `buildPurchaseOrderCreatePayload` return | safe |
| 6 | `purchase-orders/purchase-order-form-utils.ts:88` | `customerPoDate` in `buildPurchaseOrderUpdatePayload` return | safe |
| 7 | `quotations/new/page.tsx:199` | `validUntil` in inline `createMutation.mutateAsync({…})` | safe |
| 8 | `quotations/[id]/edit/page.tsx:168` | `validUntil` in inline `updateMutation.mutateAsync({ input: {…} })` | safe |
| 9 | `price-list-items/price-list-items-page-client.tsx:167` | `effectiveFrom` in inline `createMutation.mutateAsync` | safe |
| 10 | `price-list-items/price-list-items-page-client.tsx:168` | `effectiveUntil` in inline `createMutation.mutateAsync` | safe |
| 11 | `price-list-items/price-list-items-page-client.tsx:203` | `effectiveFrom` in inline `updateMutation.mutateAsync` | safe |
| 12 | `price-list-items/price-list-items-page-client.tsx:204` | `effectiveUntil` in inline `updateMutation.mutateAsync` | safe |
| 13 | `calibration-requests/new/page.tsx:135` | `expectedDate` in inline `createMutation.mutateAsync` | safe |
| 14 | `calibration-requests/[id]/edit/page.tsx:244` | `expectedDate` in inline `updateMutation.mutateAsync({ input: {…} })` | safe |
| 15 | `calibration-requests/import/import-page-client.tsx:154` | `expectedDate` in inline `confirmMutation.mutateAsync` conditional spread | safe |

## 2. Why `z.input<>` alone was not enough — and what actually fixed it

The task suggested switching builder return types from `z.infer` (= `z.output`)
to `z.input`. That does not work against **Zod 3.25.76**, where
`class ZodDate extends ZodType<Date, ZodDateDef, Date>` — the third generic
(Input) is `Date`, so `z.input<>` of a `z.coerce.date()` field is **also `Date`**.

The mismatch had to be fixed in the schema. New shared codec:

```ts
// packages/shared/src/schemas/index.ts
export const wireDate = z.union([z.string(), z.date()]).pipe(z.coerce.date());
```

- `z.input<wireDate>` = `string | Date` → a client's `string` type-checks with **no cast**.
- `z.output<wireDate>` / `z.infer` = `Date` → the service layer is unchanged.
- Runtime coercion is `new Date(value)` — identical to the `z.coerce.date()` it
  replaces for every value a client or an API test actually sends (a `YYYY-MM-DD`
  string, a full-ISO string, or a `Date`). The only inputs it newly rejects are
  bare `number` / `boolean` / `null`-for-a-required-field — none of which any
  client or test uses, and none of which JSON can even carry as a non-string.

### Schema fields changed (`z.coerce.date()` → `wireDate`)

| Schema | Field(s) |
|---|---|
| `calibrationRequestCreateSchema` | `expectedDate` |
| `calibrationRequestUpdateSchema` | `expectedDate` |
| `calibrationRequestImportConfirmSchema` | `expectedDate` |
| `quotationCreateSchema` | `validUntil` |
| `quotationUpdateSchema` | `validUntil` |
| `purchaseOrderCreateSchema` | `customerPoDate` |
| `purchaseOrderUpdateSchema` | `customerPoDate` |
| `workOrderNullableDate` (→ `workOrderCreateSchema` / `workOrderUpdateSchema`) | `scheduledStart`, `scheduledEnd` |
| `priceListItemCreateSchema` | `effectiveFrom`, `effectiveUntil` |
| `priceListItemUpdateSchema` | `effectiveFrom`, `effectiveUntil` |
| `equipmentCalibrationRecordCreateSchema` | `calibrationDate`, `validFrom`, `validUntil` |
| `equipmentCalibrationRecordUpdateSchema` | `calibrationDate`, `validFrom`, `validUntil` |

**Left untouched** (unrelated to the date-input work): `priceListItemResolveQuerySchema.date`
(a GET query param, no builder, no `asWireDate`) and every other `z.coerce.date()`
/ `z.coerce.number()` in the file.

### New exported types (`z.input`, for clients)

Each affected schema keeps its `z.infer`-based `*Input` type (post-parse, `Date` —
unchanged, still used by the API services) and gains a `z.input`-based `*Body`
type (request wire shape, date fields `string | Date`):

`CalibrationRequestCreateBody`, `CalibrationRequestUpdateBody`,
`CalibrationRequestImportConfirmBody`, `QuotationCreateBody`, `QuotationUpdateBody`,
`PurchaseOrderCreateBody`, `PurchaseOrderUpdateBody`, `WorkOrderCreateBody`,
`WorkOrderUpdateBody`, `PriceListItemCreateBody`, `PriceListItemUpdateBody`,
`EquipmentCalibrationRecordCreateBody`, `EquipmentCalibrationRecordUpdateBody`.

### Portal changes

- **`asWireDate` deleted** from `apps/portal/src/lib/date-utils.ts`.
- Mutation hooks switched their `mutationFn` param type `*Input` → `*Body`
  (`use-calibration-requests-query.ts`, `use-purchase-orders-query.ts`,
  `use-quotations-query.ts`, `use-price-list-items-query.ts`,
  `use-work-orders-query.ts`, `use-equipment-calibration-records-query.ts`).
- Payload builders switched their return type `*Input` → `*Body` and drop the
  cast: `customerPoDate: asWireDate(x)` → `customerPoDate: x`;
  `scheduledStart: asWireDate(fromScheduleDateValue(x))` →
  `scheduledStart: fromScheduleDateValue(x)`
  (`purchase-order-form-utils.ts`, `work-order-form-utils.ts`).
- Inline `mutateAsync` payloads drop the cast:
  `validUntil: x ? asWireDate(x) : null` → `validUntil: x || null`, etc.
  (`quotations/new` + `[id]/edit`, `price-list-items-page-client`,
  `calibration-requests/new` + `[id]/edit` + `import`).

### Additionally (same anti-pattern, same consolidation work — not an `asWireDate` site)

The Stage 1 migration of the equipment calibration records panel had cast its
payloads with `as never` (worse than `asWireDate` — it erases all type checking
on the object). `equipment-calibration-records-panel.tsx`:
`toCreatePayload` / `toUpdatePayload` now return
`EquipmentCalibrationRecordCreateBody` / `…UpdateBody` with **no cast**, and the
unrelated `{ status: "CONFIRMED" } as never` lost its cast too (it is a valid
`…UpdateBody`).

## 3. `tsc --noEmit` — new errors after removing the cast?

**None.** Removing the cast surfaced **zero** type errors — no downstream code
was silently assuming a `Date` on these payloads (the portal only ever builds and
sends them; it never reads them back).

| Package | Result |
|---|---|
| `packages/shared` | **PASS** (exit 0) |
| `apps/api` | **PASS** (exit 0) — the API's `*Input` types are still `z.infer` (`Date`); services and their tests are untouched |
| `apps/portal` | **PASS** (exit 0) — no cast anywhere |

## 4. Test suites

| Package | Command | Result |
|---|---|---|
| `packages/shared` | `npx vitest run` | **PASS** — 5 files, 26 tests |
| `apps/portal` | `npx vitest run` | **PASS** — 15 files, 139 tests |
| `apps/api` | `npx vitest run` | **NOT RUN** — the suite is infra-gated: `TEST_DATABASE_URL` is not set in this environment and `packages/db`'s test-DB guard fails closed (`[test-db guard] TEST_DATABASE_URL is not set … refuse to run`). Pre-existing, unrelated to this change. |

**Compensating check for the API schema layer** (the only API-visible surface this
change touches): a standalone script parsed each affected schema with the exact
date inputs the API's `*.service.test.ts` files feed them —
`"2026-08-15"`, `"2026-09-01T00:00:00.000Z"`, `new Date("2026-12-01")`, `null`,
omitted — and asserted `z.output` is a `Date` at the identical instant and that
the `equipmentCalibrationRecordCreateSchema.superRefine` window check still fires.
**All 10 checks passed.**

## Files changed (Stage 2 delta)

- `packages/shared/src/schemas/index.ts` — `wireDate` codec; 18 `z.coerce.date()` occurrences (across 12 schemas) moved to `wireDate`; 13 new `*Body` types. The only `z.coerce.date()` left in a schema is `priceListItemResolveQuerySchema.date` (a GET query param, deliberately out of scope).
- `apps/portal/src/lib/date-utils.ts` — `asWireDate` removed.
- `apps/portal/src/app/management/calibration-requests/use-calibration-requests-query.ts`
- `apps/portal/src/app/management/calibration-requests/new/page.tsx`
- `apps/portal/src/app/management/calibration-requests/[id]/edit/page.tsx`
- `apps/portal/src/app/management/calibration-requests/import/import-page-client.tsx`
- `apps/portal/src/app/management/quotations/use-quotations-query.ts`
- `apps/portal/src/app/management/quotations/new/page.tsx`
- `apps/portal/src/app/management/quotations/[id]/edit/page.tsx`
- `apps/portal/src/app/management/purchase-orders/use-purchase-orders-query.ts`
- `apps/portal/src/app/management/purchase-orders/purchase-order-form-utils.ts`
- `apps/portal/src/app/management/price-list-items/use-price-list-items-query.ts`
- `apps/portal/src/app/management/price-list-items/price-list-items-page-client.tsx`
- `apps/portal/src/app/management/work-orders/use-work-orders-query.ts`
- `apps/portal/src/app/management/work-orders/work-order-form-utils.ts`
- `apps/portal/src/app/management/equipment-units/use-equipment-calibration-records-query.ts`
- `apps/portal/src/app/management/equipment-units/equipment-calibration-records-panel.tsx`
- `docs/claude/plans/Calibration-management/date-input-consolidation-report.md` — Stage 2 note added.

No Prisma schema / DB type change. No runtime behavior change for any value a client or test sends. Not deployed.
