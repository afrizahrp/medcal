# Reference — Requisition AKD/AKL/NIE Data Structure & API Contract

**Date:** 2026-09-02
**Companion to:** `01-implementation-report-akd-akl-nie-requisition-foundation.md`
**Purpose:** single-page reference for the shape shipped in Phase 1.

---

## 1. Concept

AKD / AKL / NIE = **Nomor Izin Edar**, the Kemenkes medical-device marketing
authorization. It is a **third, independent identity** alongside `Device.code`
(system) and `Device.serialNumber` (physical unit).

At Requisition it is **customer-declared, nullable, non-authoritative**. The
verified value is captured later on `CalibrationJob` (not modelled yet).

`NULL` **≠** `NOT_APPLICABLE`. "The customer did not give us a number" and "the
device legally needs no number" are different states; only the former is
representable in Phase 1 (`NOT_PROVIDED` / `CUSTOMER_DECLARED_NONE`).

---

## 2. Persistent shape

### Enum `AkdAklDeclaration`

| Value | Meaning | `akdAkl` column |
|---|---|---|
| `NOT_PROVIDED` *(default)* | Not asked / not answered | `NULL` |
| `CUSTOMER_DECLARED_NONE` | Customer says the device has no permit | `NULL` |
| `CUSTOMER_PROVIDED` | Customer supplied a permit number | non-null string |

### `CalibrationRequestItem` (new columns only)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `akdAkl` | `TEXT` | ✅ yes | — | Verbatim free-text, ≤ 120 chars (enforced in Zod). No placeholder values. |
| `akdAklDeclaration` | `AkdAklDeclaration` | ❌ no | `NOT_PROVIDED` | Provenance of `akdAkl`. |

No other table changed.

---

## 3. API contract

### Item input (used by both create & update)

`packages/shared/src/schemas/index.ts` → `calibrationRequestItemInputSchema`

```jsonc
{
  "deviceTypeId": "…",          // required
  "customerDeviceName": "…",    // optional
  "model": "…",                 // optional
  "deviceId": "…",              // optional
  "qty": 1,                     // optional, default 1 server-side
  "akdAkl": "AKD 12345678901",  // optional — required iff akdAklDeclaration = CUSTOMER_PROVIDED
  "akdAklDeclaration": "CUSTOMER_PROVIDED", // optional — see derivation below
  "notes": "…"                  // optional
}
```

### Server-side default derivation (when `akdAklDeclaration` omitted)

| `akdAkl` sent? | Stored `akdAklDeclaration` |
|---|---|
| yes (non-empty) | `CUSTOMER_PROVIDED` |
| no / empty | `NOT_PROVIDED` |

### Validation rules (Zod `superRefine`)

| Rule | Message (id) |
|---|---|
| `akdAklDeclaration = CUSTOMER_PROVIDED` ⇒ `akdAkl` required | `AKD/AKL/NIE wajib diisi ketika status = CUSTOMER_PROVIDED` |
| `akdAkl` present ⇒ `akdAklDeclaration` must be `CUSTOMER_PROVIDED` (if declaration set) | `AKD/AKL/NIE hanya boleh diisi ketika status = CUSTOMER_PROVIDED` |
| `akdAkl` length | ≤ 120 chars, trimmed; empty → `undefined` |

**Not validated:** number format/checksum, existence in Kemenkes registry,
whether the device legally requires an NIE.

### Endpoints affected

| Endpoint | Change |
|---|---|
| `POST /calibration-requests` | Body `items[]` accepts `akdAkl` + `akdAklDeclaration`. |
| `PATCH /calibration-requests/:id` | Same (only while status `DRAFT`; items are replace-all). |
| `GET /calibration-requests` / `GET /calibration-requests/:id` | Response `items[]` now include `akdAkl` and `akdAklDeclaration` (raw Prisma passthrough). |
| `POST /calibration-requests/import/preview` & `/import/confirm` | **No change.** Imported rows get `NULL` / `NOT_PROVIDED`. |

---

## 4. Excel import behaviour (quantity > 1)

The import row model is **1 spreadsheet row → 1 `CalibrationRequestItem`**, with
the row's `Qty` stored as an aggregate (`qty` column). A row with `Qty = 5`
represents 5 physical devices in one item.

Because AKD/AKL/NIE is per physical device, one cell on a multi-unit row cannot
represent it unambiguously. Rather than invent a rule, the importer does **not**
read any AKD/AKL/NIE column; imported rows are created with
`akdAkl = NULL`, `akdAklDeclaration = NOT_PROVIDED`, and users fill the value
per line afterward via the Requisition edit form.

---

## 5. Portal UI surface

| Screen | Element |
|---|---|
| New Requisition (`/calibration-requests/new`) | Per device line: status `<select>` + conditional "Nomor AKD / AKL / NIE" text input (shown only for `CUSTOMER_PROVIDED`). |
| Edit Requisition (`/calibration-requests/[id]/edit`) | Same; hydrated from server; editable only while `DRAFT`. |
| Requisition detail (`/calibration-requests/[id]`) | Read line per device: number / "Customer menyatakan tidak ada" / "Belum diberikan". |

Label constants live in
`apps/portal/src/app/management/calibration-requests/calibration-requests-ui.tsx`
(`AKD_AKL_DECLARATION_OPTIONS`, `AKD_AKL_DECLARATION_LABELS`).

---

## 6. Downstream — confirmed untouched

No AKD/AKL/NIE field (authoritative or otherwise) exists on:

- `Quotation`, `QuotationItem`
- `PurchaseOrder`, `PurchaseOrderItem`
- `WorkOrder`
- `EquipmentDeliveryNote` (DLN)
- `CalibrationJob`

The single source in Phase 1 is `CalibrationRequestItem`.
