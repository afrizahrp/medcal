# Implementation Report: Portal Date-Input Consolidation

Status: **complete, not deployed** (hard stop as instructed).
Date: 2026-09-06.

> **Stage 2 update (2026-09-06):** `asWireDate` has been removed. The payload
> builder types now derive from `z.input<Schema>` (a new `*Body` type per
> schema) and the `z.coerce.date()` request-body fields were replaced with a
> `wireDate` codec (`string` in, `Date` out). No cast remains anywhere. See
> `date-input-schema-boundary-report.md`.

## What was built

### Task 1 — shared helpers + component

**`apps/portal/src/lib/date-utils.ts`** (new) — the single source of truth. Extends the
former `equipment-calibration-record-date-utils.ts` (now deleted) and drops the
Popover/Calendar-specific parts:

| Helper | Purpose |
|---|---|
| `isLeapYear` / `daysInMonth` / `isRealCalendarDate` | Real calendar validation. `(y%4===0 && y%100!==0) \|\| y%400===0`; rejects 31/02, 31/04, 31/06, 31/09, 31/11, 29/02 in non-leap years. |
| `parseDateOnly` | `YYYY-MM-DD[...]` → local `Date` via `new Date(y, m-1, d)`. Never `new Date("YYYY-MM-DD")`. Returns `undefined` for malformed/impossible input. |
| `toDateInputValue` | API ISO/instant → `YYYY-MM-DD` form state. |
| `fmtDateOnly` / `isoToDisplay` | → `dd/MM/yyyy` display. |
| `toDateOnlyString` / `todayDateOnly` | `Date`/now → `YYYY-MM-DD`. |
| `fmtTimestampDay` | instants (`acceptedAt`, `issuedAt`) → local `dd/MM/yyyy`. |
| `maskDateInput` | free-typed digits → `dd/mm/yyyy` with auto-`/` (trailing slash suppressed while deleting, so backspace is not trapped). |
| `displayToIso` | `dd/mm/yyyy` → `YYYY-MM-DD`, or `null` if incomplete/invalid. |
| `validateDisplayDate` | inline error string (`"Format tanggal harus dd/mm/yyyy"`, `"Tanggal tidak valid"`, `"Tanggal wajib diisi"`) or `null`. |
| `isCalibrationValidityWindowOk` | unchanged cross-field rule (validFrom/calibrationDate ≤ validUntil). |
| `asWireDate` | **compile-time cast only**: returns the `YYYY-MM-DD` string typed as the `Date` that the API's `z.coerce.date()` payload types infer. Runtime value stays the plain string. |

**`apps/portal/src/components/ui/date-field.tsx`** (new) — `<DateField>`:

- Keyboard-only `<input type="text" inputMode="numeric" maxLength={10}>`, placeholder `dd/mm/yyyy`,
  input mask via `maskDateInput`.
- State and `onChange` payload are **always `YYYY-MM-DD` strings** (or `""`). No `Date` objects.
- Real calendar validation; inline red error text + `aria-invalid`/`aria-describedby`. Never
  auto-corrects.
- Props: `value`, `onChange`, `label`, `id`, `name`, `required`, `disabled`, `placeholder`,
  `error` (external/cross-field), `min`, `max` (inclusive `YYYY-MM-DD` bounds), `className`,
  `aria-label`.
- Decorative (non-interactive) calendar glyph inside the field.
- `required` surfaces its message only after blur; format/validity errors surface as soon as
  something unparseable is typed.

### Task 2 — all 8 input locations migrated

| # | File(s) | Before | After |
|---|---|---|---|
| 1 | `calibration-requests/import/import-page-client.tsx` | native `<input type="date">` | `<DateField label="Expected Date">`; payload `asWireDate(expectedDate)` |
| 2 | `equipment-units/equipment-calibration-records-panel.tsx` | local `DateField` (Popover+Calendar) | shared `<DateField>` ×3; local component + duplicated utils removed; import now `@/lib/date-utils` |
| 3 | `calibration-requests/new/page.tsx` | Popover+Calendar, `PPP`, `Date` state | `<DateField label="Expected Date" min={todayDateOnly()}>`; state `string`; payload `asWireDate` |
| 4 | `calibration-requests/[id]/edit/page.tsx` | Popover+Calendar, `PPP`, `Date` state, label **"Desired Schedule"** | `<DateField label="Expected Date">` (**label standardized**); state `string`; `parseExpectedDate` removed |
| 5 | `purchase-orders/purchase-order-form-fields.tsx` + `new` + `[id]/edit` + `purchase-order-form-utils.ts` | Popover+Calendar, `PPP`, `Date` | `<DateField label="Customer PO Date">`; `PurchaseOrderFormValue.customerPoDate: string`; builders take/emit `string`; `dateOpen` props removed; `parseCustomerPoDate` removed |
| 6 | `quotations/quotation-form-fields.tsx` + `new` + `[id]/edit` | Popover+Calendar, `PPP`, `Date`, clear-button | `<DateField label="Valid Until">`; `QuotationFormValue.validUntil: string`; `dateOpen` props removed; `parseValidUntil` removed |
| 7 | `price-list-items/price-list-items-page-client.tsx` | local `DateField` (copy) + local `parseDateOnly`/`fmtDate`/`toDateOnlyString` | shared `<DateField>` ×4; local component + helpers removed; display via `fmtDateOnly`; payloads `asWireDate` |
| 8 | `work-orders/work-order-form-fields.tsx` + `work-order-form-utils.ts` + `[id]/edit` + `[id]/page.tsx` + `work-orders-ui.tsx` | native `<input type="datetime-local">` ×2 | `<DateField>` ×2 (**date-only** — see decision below); `toDatetimeLocalValue`→`toScheduleDateValue`, `fromDatetimeLocalValue`→`fromScheduleDateValue`; list/detail display `formatDateTime`→`fmtDateOnly` for the schedule fields |

No `Prisma` schema, API contract, or `packages/shared` payload type was changed. `z.coerce.date()`
already coerces the `YYYY-MM-DD` wire string server-side, and `@db.Date` stores it without the
local-midnight timezone shift that a serialized local `Date` introduced (the prior bug).

### Task 3 — tests

- **`apps/portal/src/lib/date-utils.test.ts`** (new, 25 cases): leap year / month lengths;
  `isRealCalendarDate` rejects 31/02, 31/04/06/09/11, 29/02/2025; `maskDateInput("31022026")` →
  `"31/02/2026"`; `maskDateInput("29022024")` → `"29/02/2024"`; trailing-slash-while-typing and
  no-trap-while-deleting; `displayToIso`/`isoToDisplay` round-trip (`"2026-03-01"` ↔ `"01/03/2026"`,
  edit to `15/03/2026` → `"2026-03-15"`); `31/02/2026` and `29/02/2025` rejected; `29/02/2024`
  accepted; `validateDisplayDate` messages; `isCalibrationValidityWindowOk` (validFrom ≤ validUntil,
  incl. missing-date rejection) migrated intact.
- **`purchase-order-form-utils.test.ts`** updated: builders now assert `YYYY-MM-DD` strings and
  `not.toBeInstanceOf(Date)`; `validatePurchaseOrderForm` covers the empty-date branch.
- **`work-order-form-utils.test.ts`** updated: create payload asserts date-only wire strings;
  new `toScheduleDateValue` drops time-of-day; `validateWorkOrderOperationalForm` rejects end-before-start.
- **`equipment-calibration-record-date-utils.test.ts`** deleted (its coverage moved to
  `date-utils.test.ts`).

> Component-level DOM tests were **not** added: the portal has no `jsdom` / `@testing-library`
> setup and its convention (matching `apps/api`, `apps/tech-pwa`) is pure-`.ts` unit tests.
> All mask / parse / validate logic lives in `date-utils.ts` and is covered there; `<DateField>`
> is a thin wrapper over those pure functions.

## `datetime-local` decision for WorkOrder — **migrated to date-only `<DateField>`**

`scheduledStart` / `scheduledEnd` are date-only in business meaning. Evidence in the code:

| Consumer | Evidence | Granularity used |
|---|---|---|
| SPK PDF | `work-order-pdf-spk.ts:147` — `formatDate(workOrder.scheduledStart ?? workOrder.createdAt)` under the label "Tanggal". Uses `formatDate` (day/month/year), **not** `formatDateTime`. | date |
| Equipment calibration validity | `work-order-equipment.ts:188` / `work-orders.service.ts:293,641,743` — `const asOf = scheduledStart ?? new Date()`, compared against `@db.Date` calibration windows. | date |
| Delivery note | `delivery-notes.service.ts:93` — `issuedAt = workOrder.scheduledStart ?? new Date()` (a fallback default for a timestamp field). | date part only; fallback |
| `scheduledEnd` | Only ever used for display and the `end ≥ start` form check. **Zero** downstream business logic. | — |
| tech-pwa (technician app) | No reference to `scheduledStart`/`scheduledEnd` anywhere. | — |

No dispatch, routing, reminder, or scheduling logic reads the time-of-day. The Prisma column
stays `DateTime?` (no schema change); the client now sends `YYYY-MM-DD`, `z.coerce.date()` stores
it at UTC midnight, and portal display switched from `formatDateTime` (`"1 September 2026, 00.00"`)
to `fmtDateOnly` (`"01/09/2026"`). Legacy rows that carry a real time-of-day have it dropped to the
date part on reload (`toScheduleDateValue`), which is acceptable per the task ("sourcing the current
value's date part only").

## Verification

| Check | Command | Result |
|---|---|---|
| Typecheck (portal) | `npx tsc --noEmit` (in `apps/portal`) | **PASS** (exit 0) |
| Unit tests (portal) | `npx vitest run` (in `apps/portal`) | **PASS** — 15 files, 139 tests |
| `date-utils.test.ts` alone | `npx vitest run src/lib/date-utils.test.ts` | **PASS** — 25 tests |
| Other apps | — | **NOT RUN** — no files changed in `apps/api`, `packages/shared`, `apps/tech-pwa`, `apps/web`; the wire change is client-only and `z.coerce.date()` already accepts the string. |
| Build / deploy | — | **NOT RUN** (hard stop). |

## Files changed

New:
- `apps/portal/src/lib/date-utils.ts`
- `apps/portal/src/lib/date-utils.test.ts`
- `apps/portal/src/components/ui/date-field.tsx`

Deleted:
- `apps/portal/src/app/management/equipment-units/equipment-calibration-record-date-utils.ts`
- `apps/portal/src/app/management/equipment-units/equipment-calibration-record-date-utils.test.ts`

Modified (21):
- `apps/portal/src/app/management/calibration-requests/import/import-page-client.tsx`
- `apps/portal/src/app/management/calibration-requests/new/page.tsx`
- `apps/portal/src/app/management/calibration-requests/[id]/edit/page.tsx`
- `apps/portal/src/app/management/equipment-units/equipment-calibration-records-panel.tsx`
- `apps/portal/src/app/management/purchase-orders/purchase-order-form-fields.tsx`
- `apps/portal/src/app/management/purchase-orders/purchase-order-form-utils.ts`
- `apps/portal/src/app/management/purchase-orders/purchase-order-form-utils.test.ts`
- `apps/portal/src/app/management/purchase-orders/new/page.tsx`
- `apps/portal/src/app/management/purchase-orders/[id]/edit/page.tsx`
- `apps/portal/src/app/management/quotations/quotation-form-fields.tsx`
- `apps/portal/src/app/management/quotations/new/page.tsx`
- `apps/portal/src/app/management/quotations/[id]/edit/page.tsx`
- `apps/portal/src/app/management/price-list-items/price-list-items-page-client.tsx`
- `apps/portal/src/app/management/work-orders/work-order-form-fields.tsx`
- `apps/portal/src/app/management/work-orders/work-order-form-utils.ts`
- `apps/portal/src/app/management/work-orders/work-order-form-utils.test.ts`
- `apps/portal/src/app/management/work-orders/[id]/edit/page.tsx`
- `apps/portal/src/app/management/work-orders/[id]/page.tsx`
- `apps/portal/src/app/management/work-orders/work-orders-ui.tsx`

(`.env.example`, `.env.production.example` were already modified before this task — untouched here.)

## Not done (out of scope, as instructed)

- Dashboard filter / calendar-popover (month+year granularity) — untouched.
- Display-only formatter consolidation (`quotations-ui.formatDate` etc.) beyond the WorkOrder
  schedule fields — left as-is.
- No deploy.
