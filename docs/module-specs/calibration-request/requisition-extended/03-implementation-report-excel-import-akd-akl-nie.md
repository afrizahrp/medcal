# Implementation Report — Requisition Excel Import: AKD/AKL/NIE Support

**Date:** 2026-09-02
**Scope:** Extend the existing Requisition Excel import/template to carry the
already-shipped `CalibrationRequestItem.akdAkl` / `akdAklDeclaration` fields.
**Status:** ✅ Shipped

> **Correction 2026-09-02:** the initial version rejected a `Qty > 1` row that
> carried an AKD/AKL/NIE value. Per the locked business rule, AKD/AKL/NIE at
> Requisition is an **optional customer declaration** and a customer may supply
> it even for an aggregate (`Qty > 1`) row. The `Qty > 1` restriction has been
> removed from every layer (parser, shared Zod, confirm guard, tests, template
> guide text, list-page tooltip). Sections below reflect the corrected behavior.
**Follows:** `01-implementation-report-akd-akl-nie-requisition-foundation.md`,
`02-data-structure-and-api-contract-reference.md`

---

## 1. Template changes

`apps/api/src/generate-requisition-template.ts` → regenerated
`apps/portal/public/medcal-requisition-template.xlsx`.

### Sheet "Data Alat"

| Before | After |
|---|---|
| `Nama Alat · Model · Qty · Device ID` | `Nama Alat · Model · Qty · Device ID · **AKD/AKL/NIE**` |

- New **`AKD/AKL/NIE`** column appended at the end (width 24) — existing column
  order and keys unchanged, so old files still import.
- Example rows updated: the "Dental Unit" example carries a sample
  `AKD/AKL/NIE` value; the other examples leave the cell blank.
- The example-cleanup note merge range widened `A:D` → `A:E`.

### Sheet "Petunjuk" (instructions)

Added two lines:

- **Kolom:** `• AKD/AKL/NIE: OPSIONAL. Nomor Izin Edar yang diberikan customer
  (maks. 120 karakter). Boleh diisi untuk Qty berapa pun. Kosongkan jika
  customer belum memberikan.`
- **Aturan penting:** `• AKD/AKL/NIE yang diisi adalah deklarasi customer, bukan
  hasil verifikasi teknis per unit fisik. Verifikasi final per unit dilakukan
  kemudian oleh Teknisi.`

### Importer header aliases

`HEADER_ALIASES.akdAkl` accepts (case-insensitive, whitespace-collapsed):
`akd/akl/nie`, `akd / akl / nie`, `akd/akl / nie`, `akd / akl/nie`,
`akd akl nie`, `akd/akl`, `akd / akl`, `nie`, `no izin edar`, `nomor izin edar`.
The column is **optional** — a workbook without it imports exactly as before.

---

## 2. Import validation behavior

Parsing helper `parseAkdAkl()` trims the cell; empty → `null`; > 120 chars →
row error `AKD/AKL/NIE maksimal 120 karakter`.

| Cell | Qty | Result |
|---|---|---|
| empty | any | valid → `akdAkl = NULL`, `akdAklDeclaration = NOT_PROVIDED` |
| non-empty | any (`1` or `> 1`) | valid → `akdAkl = <value>`, `akdAklDeclaration = CUSTOMER_PROVIDED` (derived in `CalibrationRequestsService.create`) |
| > 120 chars | any | row error `AKD/AKL/NIE maksimal 120 karakter` |

**There is no Qty-based restriction.** AKD/AKL/NIE is an optional customer
declaration; a customer may declare it even for an aggregate (`Qty > 1`) row.
The stored value is *not* the verified per-physical-device value — the Technician
resolves that later at CalibrationJob. Aggregate rows are still never split.

`confirm()` passes `akdAkl` through to `CalibrationRequestsService.create`,
which derives the declaration (`value ⇒ CUSTOMER_PROVIDED`,
`empty ⇒ NOT_PROVIDED`). No new write path, no transaction change.

---

## 3. Changed files

```
apps/api/src/generate-requisition-template.ts
apps/portal/public/medcal-requisition-template.xlsx                              (regenerated)
apps/api/src/modules/calibration-requests/calibration-request-import.service.ts
apps/api/src/modules/calibration-requests/calibration-requests.service.ts        (confirm() item mapping: pass akdAkl)
apps/api/src/modules/calibration-requests/calibration-request-import.service.test.ts
packages/shared/src/schemas/index.ts   (CalibrationRequestImportPreviewRow.akdAkl; confirm-row schema akdAkl field)
apps/portal/src/app/management/calibration-requests/import/import-page-client.tsx   (preview column + confirm payload)
apps/portal/src/app/management/calibration-requests/calibration-requests-page-client.tsx   (list-page import tooltip)
```

> Note: `apps/portal/src/app/management/users/*.tsx`,
> `.../permission-management/page.tsx`, `next-env.d.ts`, and `*.tsbuildinfo`
> also show as modified in the working tree — these are **pre-existing
> uncommitted changes** (`TECHNICIAN_MANAGER` label follow-ups + Next.js build
> artifacts), **not** part of this change.

### Explicitly NOT modified
CalibrationJob · Device master · Quotation / PO / WO / DLN · AuditLog ·
approval workflow · Identity Correction · Technician App.

---

## 4. Test results

| Suite | Command | Result |
|---|---|---|
| Requisition + import combined | `pnpm --filter @medcal/api test -- calibration-request` | ✅ **49/49** |
| Shared | `pnpm --filter @medcal/shared test` | ✅ **21/21** |
| Typecheck | `pnpm --filter @medcal/shared --filter @medcal/api --filter @medcal/portal --filter @medcal/web-api typecheck` | ✅ pass |
| Build | `pnpm --filter @medcal/shared --filter @medcal/api --filter @medcal/portal build` | ✅ pass |
| Template regen | `pnpm --filter @medcal/api run template:requisition` | ✅ wrote `medcal-requisition-template.xlsx` |

Tests in `calibration-request-import.service.test.ts` covering AKD/AKL/NIE:

1. Empty cell → `akdAkl` null, no error (Qty 1 and Qty 4).
2. A value is carried on the preview row regardless of Qty (Qty 1 and Qty 3), no error.
3. Value over 120 characters → row error.
4. Column absent → backward compatible (`akdAkl` null, no error).
5. Confirm: persists `akdAkl` + `akdAklDeclaration = CUSTOMER_PROVIDED` for a
   Qty 5 row; an empty Qty 4 row stays `NOT_PROVIDED`.
6. Confirm: accepts a Qty 3 row carrying a value → item stored with
   `CUSTOMER_PROVIDED`.
