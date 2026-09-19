# Implementation Report — PurchaseOrder Module (Backend + Portal UI MVP)

**Date:** 2026-08-27  
**Scope:** PurchaseOrder sebagai snapshot Quotation APPROVED, Portal UI mengikuti pola CalibrationRequest / Quotation, PDF Print, dan percepatan approve Quotation.

**Sumber kebenaran:** repository saat ini (`packages/db/prisma/schema.prisma`, API, Portal).

---

## Summary

PurchaseOrder MVP sudah diimplementasi end-to-end.

PO **bukan** editor komersial kedua. Nilai harga, qty, diskon, tax, dan total **disalin dari Quotation** di server. Klien hanya mengirim field PO:

- `quotationId`
- `customerPoNumber`
- `customerPoDate`
- `notes`

Alur bisnis yang dikunci:

```text
APPROVED Quotation (+ customerApprovedAt)
        ↓
     Create PO  →  DRAFT
        ↓
     APPROVED

Alternatif:
DRAFT → CANCELLED

Tidak diizinkan:
APPROVED → CANCELLED
APPROVED → DRAFT
CANCELLED → *
```

Satu PO **aktif** (`status ≠ CANCELLED`) per quotation. Setelah PO CANCELLED, quotation yang sama boleh membuat PO baru.

WorkOrder **tidak** dibuat saat PO di-approve. Email compose PO **tidak** diimplementasi.

---

## Domain Contract (Locked)

### Source

Hanya quotation dengan:

- `status = APPROVED`
- `customerApprovedAt IS NOT NULL`

Backend tetap otoritatif. UI tidak boleh melewati aturan ini.

### Editable (PO-specific)

| Field | Create | Update (DRAFT only) |
|-------|--------|---------------------|
| `customerPoNumber` | yes | yes |
| `customerPoDate` | yes | yes |
| `notes` | yes | yes |

### Read-only snapshot (dari Quotation)

`customer`, `quotation`, items, `qty`, `unitPrice`, item `discountAmount`, `subtotal`, `headerDiscountAmount`, `taxCode`, `taxRate`, `taxAmount`, `totalAmount`, `currency`

### Tax

Header-level saja. Tidak ada tax per item.

- Field: `taxCode`, `taxRate`, `taxAmount` — **NOT NULL** pada Quotation dan PO
- **T0** = Non PPN (rate 0), bukan NULL
- PO menyalin tax quotation apa adanya (tidak dihitung ulang)

### Discount

Dua level, keduanya snapshot:

- Item: kolom Discount + Line Total
- Header: Header Discount pada ringkasan

Tidak ada kontrol persen di UI PO.

### Numbering

- Internal PO Number: `PUR/YYYY/MM/NNNNN` via `DocumentNumberService`
- Customer PO No: `customerPoNumber` (nomor PO milik customer)
- Unique customer PO: `(companyId, customerId, customerPoNumber)`

### Audit approve PO

Schema **tidak** punya `approvedAt` / `approvedByUserId` pada PurchaseOrder.

Approve memakai field yang sudah ada:

- `confirmedAt`
- `confirmedByUserId`

---

## Schema & Migrations

### Enum `PurchaseOrderStatus` (schema)

```text
DRAFT | APPROVED | RECEIVED | CONFIRMED | FULFILLED | CANCELLED
```

API / Zod / Portal MVP hanya memakai **DRAFT | APPROVED | CANCELLED**. Nilai lama di DB tidak dihapus.

### Migrasi terkait PO / tax

| Migration | Isi |
|-----------|-----|
| `20260823143000_add_purchase_order` | Model PO awal |
| `20260823154000_purchase_order_customer_po_date_required` | `customerPoDate` wajib |
| `20260827120000_purchase_order_approved_and_nullable_tax` | Enum `APPROVED`; tax PO sempat nullable |
| `20260827130000_quotation_po_tax_required` | Tax Quotation + PO **NOT NULL**; T0 = Non PPN |

---

## Files Created / Changed

### Backend — PurchaseOrder module

**Created**

- `apps/api/src/modules/purchase-orders/purchase-orders.module.ts`
- `apps/api/src/modules/purchase-orders/purchase-orders.controller.ts`
- `apps/api/src/modules/purchase-orders/purchase-orders.service.ts`
- `apps/api/src/modules/purchase-orders/purchase-orders.service.test.ts`
- `apps/api/src/modules/purchase-orders/purchase-order-pdf.ts`
- `apps/api/src/modules/purchase-orders/purchase-order-pdf.test.ts`

**Changed**

- `apps/api/src/app.module.ts` — import `PurchaseOrdersModule`
- `packages/shared/src/schemas/index.ts` — Zod create/update/list
- `packages/db/prisma/seed-role-permissions.ts` — grant ADMIN `purchaseOrder:*`
- `packages/auth/src/access-control.ts` — catalog sudah memuat `purchaseOrder`

### Tax required (Quotation + PO)

**Changed**

- `apps/api/src/modules/quotations/quotations.service.ts` — `taxCode` wajib; `resolveDocumentTax`
- `apps/api/src/modules/quotations/quotations.service.test.ts`
- Schema / migrasi tax NOT NULL di atas

### Portal — PurchaseOrder UI

**Created**

- `apps/portal/src/app/management/purchase-orders/page.tsx`
- `apps/portal/src/app/management/purchase-orders/purchase-orders-page-client.tsx`
- `apps/portal/src/app/management/purchase-orders/purchase-orders-ui.tsx`
- `apps/portal/src/app/management/purchase-orders/purchase-order-form-fields.tsx`
- `apps/portal/src/app/management/purchase-orders/purchase-order-form-utils.ts`
- `apps/portal/src/app/management/purchase-orders/purchase-order-form-utils.test.ts`
- `apps/portal/src/app/management/purchase-orders/use-purchase-orders-query.ts`
- `apps/portal/src/app/management/purchase-orders/new/page.tsx`
- `apps/portal/src/app/management/purchase-orders/[id]/page.tsx`
- `apps/portal/src/app/management/purchase-orders/[id]/edit/page.tsx`

**Changed**

- `apps/portal/src/app/management/quotations/[id]/page.tsx` — Create/View PO; Approve Quotation dari DRAFT/SENT; dialog lock
- `apps/portal/src/app/management/quotations/quotations-ui.tsx` — pesan error approve
- `apps/portal/src/app/management/permission-management/page.tsx` — label `purchaseOrder`
- `apps/api/src/modules/me/me.controller.ts` — capabilities PO
- `packages/auth/src/me-types.ts`
- `packages/auth/src/auth-provider.test.tsx`
- `packages/db/prisma/seed-menu.ts` — menu Calibration Management → Purchase Order

---

## API Routes

Prefix: `/purchase-orders`  
Guard: `CompanyRoleGuard` + `@RequirePermission`  
`companyId` dari server, tidak dari body klien.

| Method | Path | Permission | Keterangan |
|--------|------|------------|------------|
| POST | `/purchase-orders` | `purchaseOrder:create` | Snapshot dari quotation |
| GET | `/purchase-orders` | `purchaseOrder:read` | List + search/filter/pagination |
| GET | `/purchase-orders/:id/pdf` | `purchaseOrder:read` | PDF (sebelum `:id`) |
| GET | `/purchase-orders/:id` | `purchaseOrder:read` | Detail |
| PATCH | `/purchase-orders/:id` | `purchaseOrder:update` | DRAFT only; field PO saja |
| POST | `/purchase-orders/:id/approve` | `purchaseOrder:approve` | DRAFT → APPROVED |
| POST | `/purchase-orders/:id/cancel` | `purchaseOrder:cancel` | DRAFT → CANCELLED |

### Create body (klien)

```json
{
  "quotationId": "...",
  "customerPoNumber": "PO-CUST-2026-0815",
  "customerPoDate": "2026-08-15T00:00:00.000Z",
  "notes": null
}
```

**Tidak** diterima: `companyId`, `customerId`, items, qty, harga, diskon, tax, totals.

### Error codes (utama)

| Code | Arti |
|------|------|
| `INVALID_STATUS_FOR_PURCHASE_ORDER` | Quotation bukan APPROVED |
| `QUOTATION_NOT_CUSTOMER_APPROVED` | `customerApprovedAt` null |
| `QUOTATION_TAX_REQUIRED` | Tax quotation tidak lengkap |
| `DUPLICATE_ACTIVE_PO_FOR_QUOTATION` | Sudah ada PO aktif; response memuat `purchaseOrderId` |
| `DUPLICATE_CUSTOMER_PO_NUMBER` | Unique `(companyId, customerId, customerPoNumber)` |
| `INVALID_STATUS_FOR_UPDATE` | Bukan DRAFT |
| `INVALID_STATUS_FOR_APPROVE` | Bukan DRAFT |
| `CANNOT_CANCEL_APPROVED` | APPROVED tidak boleh di-cancel |
| `ALREADY_CANCELLED` | Sudah CANCELLED |
| `PURCHASE_ORDER_NOT_FOUND` | 404 company-scoped |

---

## Portal Routes

Rewrite host management: `/purchase-orders` → `apps/portal/src/app/management/purchase-orders`.

| Path | Halaman |
|------|---------|
| `/purchase-orders` | List |
| `/purchase-orders/new?quotationId=` | Create (hanya dari quotation) |
| `/purchase-orders/:id` | Detail + Print + aksi status |
| `/purchase-orders/:id/edit` | Edit DRAFT |

### List

Kolom: PO Number, Customer, Quotation, Customer PO No, Customer PO Date, Status, Total, Created At.

Search (nomor PO, Customer PO No, nama customer), filter status DRAFT/APPROVED/CANCELLED, pagination, loading/empty/error, `AccessDenied` tanpa `purchaseOrder:read`.

Tidak ada tombol New di list — create hanya dari detail Quotation (pola Quotation dari Requisition).

### Create form

Read-only: Quotation, Customer, snapshot items + tax + totals.  
Editable: Customer PO No, Customer PO Date, Notes.

Jika quotation sudah punya PO aktif → halaman “sudah ada” + tautan View.

### Detail actions (RBAC + status)

| Status | Edit | Approve | Cancel | Print |
|--------|------|---------|--------|-------|
| DRAFT | `purchaseOrder:update` | `purchaseOrder:approve` | `purchaseOrder:cancel` | `read` (halaman) |
| APPROVED | — (locked) | — | — | ya |
| CANCELLED | — (locked) | — | — | ya |

Dialog Approve PO:

- Title: `Approve this Purchase Order?`
- Description: `After approval, all PO fields will be locked.`

Dialog Cancel PO: tidak bisa di-undo; row tetap historis (tidak dihapus).

### PDF Print

Mengikuti pola Quotation:

- Portal: `GET /purchase-orders/:id/pdf` via `apiFetchBlob`, buka tab baru
- Letterhead + logo sama
- Judul **PURCHASE ORDER**
- Label terpisah: **PO Number** vs **Customer PO No**
- Snapshot items, header discount, tax header-level, totals
- Filename: `PKM-PUR-YYYYMMDD-NNNNN.pdf`

Email compose / kirim PDF otomatis **tidak** ada di sprint ini.

---

## Permissions (RBAC)

Catalog: `purchaseOrder: read | create | update | cancel | approve`

- Seed default: **ADMIN** mendapat kelima aksi
- **SUPERADMIN** bypass `hasPermission` (tidak memakai baris `RolePermission`)
- **CUSTOMER_SERVICE** tidak mendapat PO (default seed)
- UI visibility via GET `/me` capabilities (`purchaseOrderRead` dst.)
- Menu: `viewResource: purchaseOrder`, `viewAction: read`
- Otorisasi nyata tetap di backend (`RequirePermission`)

Grant bisa diubah di Permission Management tanpa deploy, kecuali SUPERADMIN yang selalu lolos.

---

## Quotation follow-up (alur approve dipersingkat)

Masalah: tombol Approve Quotation hanya muncul saat **SENT**, dan SENT di UI hanya terjadi setelah email terkirim. Alur terlalu panjang untuk membuat PO.

Perubahan:

- Backend: `QuotationsService.approve` menerima **DRAFT atau SENT**
- Portal: tombol Approve pada DRAFT dan SENT, tetap gated `quotationApprove`
- Dialog:

  - Title: `Approve this Quotation?`
  - Description: `After approval, all Quotation inputs will be locked.`

Reject tetap hanya SENT. Send/email tidak dihapus.

Saat approve, backend tetap mengisi `approvedAt`, `approvedByUserId`, dan `customerApprovedAt` (cap yang sama; customer portal approve belum ada).

---

## Duplicate Active PO

- UI: jika ada PO `status ≠ CANCELLED`, Create tidak ditawarkan; tampil View PO
- Jika hanya CANCELLED: Create PO baru diizinkan
- Jika backend mengembalikan `DUPLICATE_ACTIVE_PO_FOR_QUOTATION`: pesan jelas + tautan ke `purchaseOrderId`
- Tidak ada silent retry

---

## Navigation

Menu Calibration Management, order 3, icon `fileText`:

- code: `calibration-management.purchase-orders`
- href: `/purchase-orders`
- label: `Purchase Order`

Seed: `pnpm --filter @medcal/db run seed:menu`  
Sudah dijalankan di DB lokal pengembangan (26 menu rows). Environment lain perlu seed ulang agar item sidebar muncul.

---

## WorkOrder / out of scope

| Item | Status |
|------|--------|
| WorkOrder create on PO approve | **NOT IMPLEMENTED** |
| WorkOrder UI | **NOT IMPLEMENTED** |
| PO email compose | **NOT IMPLEMENTED** |
| Customer portal / e-sign / WhatsApp | **NOT IMPLEMENTED** |
| APPROVED → CANCELLED | **NOT ALLOWED** |

PO approval berakhir di `PurchaseOrder.status = APPROVED`.

---

## Tests & Verification

Portal tidak punya tes halaman RTL untuk Quotation; tes PO mengikuti pola helper (`customer-form-utils.test.ts`).

| Suite | Hasil |
|-------|--------|
| `purchase-order-form-utils.test.ts` | 15 tes (aksi status, eligibility, payload hanya field PO, tax label, duplicate active, cancelled tidak memblokir) |
| `@medcal/portal test` | 5 files, **45 passed**, 0 skipped (setelah UI MVP) |
| `@medcal/auth test` | **45 passed** (capabilities PO di ME fixtures) |
| `purchase-orders.service.test.ts` + `purchase-order-pdf.test.ts` | **34 passed** (create/update/approve/cancel, duplicate, tax snapshot, numbering PUR, PDF `%PDF` tanpa ubah status) |
| Quotation approve DRAFT | tes service diubah: DRAFT boleh di-approve |
| `@medcal/portal typecheck` | lulus |
| `@medcal/api typecheck` | lulus |
| `@medcal/portal build` | lulus; route PO termasuk PDF client |

Tidak ada tes yang di-skip lalu dilaporkan lulus.

---

## PurchaseOrder Portal MVP — Confirmation

```text
Source:     APPROVED Quotation only (customerApprovedAt wajib)
PO model:   Quotation snapshot
Editable:   customerPoNumber, customerPoDate, notes
Read-only:  customer, quotation, items, qty, unitPrice,
            item discount, subtotal, header discount,
            taxCode, taxRate, taxAmount, totalAmount, currency
Workflow:   DRAFT → APPROVED
            DRAFT → CANCELLED
APPROVED:   fully locked
APPROVED → CANCELLED: NOT ALLOWED
WorkOrder:  NOT IMPLEMENTED
PDF Print:  IMPLEMENTED (Portal detail, GET /purchase-orders/:id/pdf)
Email PO:   NOT IMPLEMENTED
```

---

## Unresolved / operasional

1. **Menu di environment lain** — jalankan `seed:menu` agar item sidebar Purchase Order muncul.
2. **`prisma generate` EPERM** — bisa gagal jika `pnpm dev` mengunci query engine; generate ulang setelah dev server berhenti.
3. **Customer approval terpisah** — `customerApprovedAt` masih diisi bersamaan dengan approve staf; belum ada portal customer.
4. **Status schema RECEIVED / CONFIRMED / FULFILLED** — tidak dipakai API/UI MVP; dibiarkan di enum DB.
5. **WorkOrder** — `WorkOrder.purchaseOrderId` sudah ada di schema, modul belum diimplementasi.

---

## Explicit non-goals (tetap berlaku)

- Tidak merancang ulang UI CalibrationRequest / Quotation
- Tidak membuat arsitektur API/UI kedua
- Tidak mengubah Quotation saat PO di-approve
- Tidak menghitung ulang harga/tax di PO
- Tidak menghapus PO CANCELLED
