# Implementation Report — Requisition-side AKD/AKL/NIE Data Foundation

**Date:** 2026-09-02
**Scope:** Phase 1 (Requisition-side only) of the AKD/AKL/NIE regulatory-identity
traceability design.
**Status:** ✅ Shipped
**Related design docs:**
- `docs/claude/plans/1 d-medcal-docs-claude-plans-technician-a-graceful-summit.md`
- `docs/claude/plans/2 medcal-akd-akl-traceability-followup-null-not-dead-end.md`
- `docs/claude/plans/3 medcal-akd-akl-traceability-curious-journal.md`
- `docs/claude/plans/4 medcal-akd-akl-final-identity-control-audit.md`
- `docs/claude/plans/5 medcal-akd-akl-alignment-and-revised-plan.md`
- `docs/claude/plans/Implement ONLY the Requisition-side NIE data foundation.md` (the executed prompt)

---

## 1. Objective

Medical-device identity has **three distinct concepts** in MedCal:

| # | Concept | Field | Meaning |
|---|---------|-------|---------|
| 1 | System identity | `Device.code` | MedCal's own catalog identity |
| 2 | Physical device identity | `Device.serialNumber` | The unit's serial |
| 3 | **Distribution-permit identity** | **AKD / AKL / NIE** (Nomor Izin Edar) | Kemenkes medical-device marketing authorization |

At the **Requisition** stage the customer may or may not know the AKD/AKL/NIE.
Therefore the value stored here is **nullable customer-declared data**, *not* a
technical verification. The authoritative, technician-verified snapshot will
later live on `CalibrationJob` (not modelled yet — deliberately out of scope).

This phase implements **only** the Requisition-side data foundation:

- Nullable customer-declared AKD/AKL/NIE + a declaration-status enum on the
  Requisition line.
- Portal form input (create / edit) + detail display.
- Basic, non-regulatory validation.
- No changes to Quotation / PO / WO / DLN / CalibrationJob.
- No AuditLog, approval workflow, `NOT_APPLICABLE`, `EXCEPTION_PENDING`,
  Identity Correction, or Technician App work.

---

## 2. Data model changes

### 2.1 New enum

```prisma
/// Status of the customer's AKD/AKL/NIE (Nomor Izin Edar — medical-device
/// distribution permit) declaration for a Requisition line. This captures ONLY
/// what the customer stated at intake — it is never technical verification.
/// The authoritative, technician-verified value is snapshotted later on
/// CalibrationJob (not modelled yet). NULL `akdAkl` is a valid state and must
/// never be treated as NOT_APPLICABLE.
enum AkdAklDeclaration {
  NOT_PROVIDED            // customer not asked / has not answered yet (default)
  CUSTOMER_DECLARED_NONE  // customer explicitly stated the device has no AKD/AKL/NIE
  CUSTOMER_PROVIDED       // customer supplied a value (stored in `akdAkl`)
}
```

### 2.2 New fields on `CalibrationRequestItem`

```prisma
model CalibrationRequestItem {
  // …existing…
  qty                Int      @default(1)

  /// Customer-declared AKD/AKL/NIE (Nomor Izin Edar) for this device, verbatim
  /// and free-text. Intentionally NULLABLE — the customer often does not know it
  /// at Requisition stage. This is a declaration only, NOT technical
  /// verification; the authoritative value is captured later on CalibrationJob.
  /// Never store a placeholder ("-" / "N/A"); use `akdAklDeclaration` to record
  /// "customer says there is none".
  akdAkl             String?

  /// Provenance of `akdAkl` — see the AkdAklDeclaration enum.
  akdAklDeclaration  AkdAklDeclaration @default(NOT_PROVIDED)

  notes              String?
  createdAt          DateTime @default(now())
  // …existing…
}
```

**Why the Requisition *item* (not the Requisition header):** each
`CalibrationRequestItem` is one device line; AKD/AKL/NIE is a per-device permit,
so it belongs on the line, next to `deviceId`, `model`, `serialNumber`-analogues.

### 2.3 Migration

`packages/db/prisma/migrations/20260902024739_add_akd_akl_declaration_to_calibration_request_item/migration.sql`

```sql
-- CreateEnum
CREATE TYPE "AkdAklDeclaration" AS ENUM ('NOT_PROVIDED', 'CUSTOMER_DECLARED_NONE', 'CUSTOMER_PROVIDED');

-- AlterTable
ALTER TABLE "CalibrationRequestItem" ADD COLUMN     "akdAkl" TEXT,
ADD COLUMN     "akdAklDeclaration" "AkdAklDeclaration" NOT NULL DEFAULT 'NOT_PROVIDED';
```

- Additive only. `akdAkl` is nullable; `akdAklDeclaration` is `NOT NULL DEFAULT
  'NOT_PROVIDED'`, so all existing rows backfill to `NOT_PROVIDED` automatically.
- No data migration, no destructive change.

---

## 3. API / validation changes

### 3.1 Shared Zod schema — `packages/shared/src/schemas/index.ts`

New exported values/type:

```ts
export const akdAklDeclarationValues = [
  "NOT_PROVIDED",
  "CUSTOMER_DECLARED_NONE",
  "CUSTOMER_PROVIDED",
] as const;

export type AkdAklDeclaration = (typeof akdAklDeclarationValues)[number];
```

`calibrationRequestItemInputSchema` gained two optional fields plus a
`superRefine` consistency check:

```ts
akdAkl: z.string().trim().max(120).optional().transform((v) => (v ? v : undefined)),
akdAklDeclaration: z.enum(akdAklDeclarationValues).optional(),
// …
.superRefine((item, ctx) => {
  // Basic, non-regulatory consistency check for a customer-declared value.
  if (item.akdAklDeclaration === "CUSTOMER_PROVIDED" && !item.akdAkl) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["akdAkl"],
      message: "AKD/AKL/NIE wajib diisi ketika status = CUSTOMER_PROVIDED" });
  }
  if (item.akdAkl && item.akdAklDeclaration && item.akdAklDeclaration !== "CUSTOMER_PROVIDED") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["akdAklDeclaration"],
      message: "AKD/AKL/NIE hanya boleh diisi ketika status = CUSTOMER_PROVIDED" });
  }
});
```

**Validation is deliberately minimal:**

- Trim + max length (120).
- Empty string coerces to `undefined` (never a placeholder in the DB).
- Cross-field: a value requires `CUSTOMER_PROVIDED`; `CUSTOMER_PROVIDED` requires a value.
- **No** format/checksum validation of the NIE number itself.
- **No** Kemenkes / external-registry lookup.
- **No** inference of whether a device legally requires an NIE.

Both `calibrationRequestCreateSchema` and `calibrationRequestUpdateSchema` pick
up the new fields automatically via `z.array(calibrationRequestItemInputSchema)`.

### 3.2 Service — `apps/api/src/modules/calibration-requests/calibration-requests.service.ts`

`create()` and `update()` now persist both fields in their
`calibrationRequestItem.createMany` calls:

```ts
akdAkl: item.akdAkl || null,
akdAklDeclaration:
  item.akdAklDeclaration ?? (item.akdAkl ? "CUSTOMER_PROVIDED" : "NOT_PROVIDED"),
```

Default-derivation rule when the client omits `akdAklDeclaration`:
- value present → `CUSTOMER_PROVIDED`
- value absent → `NOT_PROVIDED`

`update()` keeps the existing "replace all items" semantics (delete + recreate
while status is `DRAFT`); the new fields flow through unchanged. The API response
returns raw Prisma `items` (no DTO mapping layer), so the new fields are exposed
to the portal automatically.

---

## 4. Excel import — intentionally unchanged

**Decision: the importer does NOT accept AKD/AKL/NIE.**

`apps/api/src/modules/calibration-requests/calibration-request-import.service.ts`

A spreadsheet row here is an **aggregate line**. `parseQty` accepts any positive
integer, and each row is persisted as **exactly one** `CalibrationRequestItem`
with `qty` = that number — it is never split into N rows. Consequently a single
row can represent multiple physical devices, and a single AKD/AKL/NIE cell
cannot reliably map to one permit per physical device.

Per the locked business decision, **no data rule was invented**. The importer:

- Leaves `akdAkl = NULL` and `akdAklDeclaration = NOT_PROVIDED` for every
  imported row.
- Preserves all current import behaviour (headers, matching, qty handling,
  confirm-creates-one-item-per-row).

A documentation comment was added at the top of the import service explaining
this limitation. AKD/AKL/NIE for imported requisitions is captured afterwards
per line via the manual Requisition edit form.

---

## 5. Portal UI changes

### 5.1 Shared UI module — `apps/portal/src/app/management/calibration-requests/calibration-requests-ui.tsx`

- `CalibrationRequestItem` row type gained `akdAkl: string | null` and
  `akdAklDeclaration: AkdAklDeclarationValue`.
- New exports:
  - `type AkdAklDeclarationValue`
  - `AKD_AKL_DECLARATION_OPTIONS: AkdAklDeclarationValue[]`
  - `AKD_AKL_DECLARATION_LABELS` (Indonesian labels):

| Value | Label |
|---|---|
| `NOT_PROVIDED` | "Belum diberikan customer" |
| `CUSTOMER_DECLARED_NONE` | "Customer menyatakan tidak ada" |
| `CUSTOMER_PROVIDED` | "Customer memberikan nomor" |

### 5.2 New Requisition form — `.../calibration-requests/new/page.tsx`

- `ItemInput` gained `akdAkl: string` and
  `akdAklDeclaration: AkdAklDeclarationValue` (default `NOT_PROVIDED`).
- Per device line: a **status `<select>`** ("AKD / AKL / NIE — Status
  (deklarasi customer)"). A free-text **"Nomor AKD / AKL / NIE"** `<Input>`
  appears only when status = `CUSTOMER_PROVIDED`.
- Submit payload sends `akdAkl` (trimmed, or `undefined`) and
  `akdAklDeclaration`.
- Field is never required; leaving the default is valid.

### 5.3 Edit Requisition form — `.../calibration-requests/[id]/edit/page.tsx`

- Same `ItemInput` additions + same UI block.
- `itemsFromRequest()` hydrates `akdAkl` / `akdAklDeclaration` from the server
  row (fallback `""` / `"NOT_PROVIDED"`).
- Editing is still gated to `DRAFT` status (unchanged behaviour).

### 5.4 Requisition detail page — `.../calibration-requests/[id]/page.tsx`

Each device line now shows a read line:

> **AKD/AKL/NIE (deklarasi customer):**
> - `CUSTOMER_PROVIDED` → the number (mono)
> - `CUSTOMER_DECLARED_NONE` → "Customer menyatakan tidak ada"
> - `NOT_PROVIDED` → "Belum diberikan"

### 5.5 `updateItem` type note

In both form pages `updateItem(index, field, value: string)` now casts the
spread result `as ItemInput` because `akdAklDeclaration` is a union type rather
than a plain string. No behavioural change.

---

## 6. Explicitly NOT done (scope guard)

| Area | Status |
|---|---|
| `Device.akdAklNumber` master field | ❌ not in this phase |
| Early-warning report over WO→POItem→QuoItem→RequestItem join | ❌ not in this phase |
| `CalibrationJob` verified/authoritative snapshot | ❌ not modelled |
| Independent NIE fields on Quotation / QuotationItem | ❌ none added |
| Independent NIE fields on PurchaseOrder / PurchaseOrderItem | ❌ none added |
| Independent NIE fields on WorkOrder | ❌ none added |
| Independent NIE fields on EquipmentDeliveryNote (DLN) | ❌ none added |
| Certificate snapshot from CalibrationJob | ❌ not in this phase |
| `AuditLog` | ❌ not implemented |
| Approval workflow / `TECHNICIAN_MANAGER` gate | ❌ not implemented |
| `NOT_APPLICABLE` approval / `EXCEPTION_PENDING` | ❌ not implemented |
| Device Identity Correction workflow | ❌ not implemented |
| Technician App changes | ❌ none |
| Excel import AKD/AKL/NIE support | ❌ intentionally excluded (qty > 1 ambiguity) |

Downstream visibility (read-through of the declared value on Quotation/PO/WO)
is a **later step** and will be a report/join, not stored duplicate fields.

---

## 7. Verification

| Check | Command | Result |
|---|---|---|
| Migration | `prisma migrate dev` | ✅ `20260902024739_add_akd_akl_declaration_to_calibration_request_item` applied |
| Prisma client | `prisma generate` | ✅ regenerated |
| Typecheck | `pnpm --filter @medcal/shared --filter @medcal/api --filter @medcal/portal --filter @medcal/web-api typecheck` | ✅ all pass |
| Build | `pnpm --filter @medcal/shared --filter @medcal/api --filter @medcal/portal build` | ✅ pass |
| API tests | `pnpm --filter @medcal/api test -- calibration-request` (service + import, 2 files) | ✅ 43/43 |
| Shared tests | `pnpm --filter @medcal/shared test` | ✅ 21/21 |

> Note: `@medcal/web` typecheck fails on a pre-existing, unrelated missing
> `@base-ui/react` module — not touched by this change.

---

## 8. Changed files

```
packages/db/prisma/schema.prisma
packages/db/prisma/migrations/20260902024739_add_akd_akl_declaration_to_calibration_request_item/migration.sql   (new)
packages/shared/src/schemas/index.ts
apps/api/src/modules/calibration-requests/calibration-requests.service.ts
apps/api/src/modules/calibration-requests/calibration-request-import.service.ts   (comment only)
apps/portal/src/app/management/calibration-requests/calibration-requests-ui.tsx
apps/portal/src/app/management/calibration-requests/new/page.tsx
apps/portal/src/app/management/calibration-requests/[id]/edit/page.tsx
apps/portal/src/app/management/calibration-requests/[id]/page.tsx
```

---

## 9. Follow-up (next phases, not started)

1. `Device.akdAklNumber` optional master field + backfill strategy.
2. Early-warning report: surface Requisition-declared AKD/AKL/NIE (and mismatch
   vs `Device`) along the WO→PO→Quotation→Requisition chain — **as a report over
   existing joins, not stored fields**.
3. `CalibrationJob` module: authoritative technician-confirmed AKD/AKL/NIE
   snapshot + execution gate at `PENDING → IN_PROGRESS` (mirrors
   `WorkOrder.start()` / `equipmentConfirmedAt`).
4. Certificate: snapshot from `CalibrationJob`.
5. Device Identity Correction workflow + `TECHNICIAN_MANAGER` approval + audit
   trail + evidence durability — co-designed with, and shipped no later than,
   the Technician App execution flow.
