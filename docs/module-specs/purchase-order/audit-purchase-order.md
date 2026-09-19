# PurchaseOrder Readiness Audit

**Mode:** read-only. Tidak ada perubahan schema, migrasi, atau implementasi.

**Tanggal audit:** 27 Agustus 2026

**Sumber kebenaran:** repository saat ini. Dokumen audit Quotation 26 Agustus 2026 (`Quotation/Audit_CalibrationRequest_Quotation_Domain_Contract.md`) **usang** pada klaim “modul Quotation belum ada” dan tidak dipakai sebagai fakta implementasi.

**Scope:** kesiapan implementasi modul backend PurchaseOrder, dinilai dari kontrak CalibrationRequest + Quotation yang sudah hidup, plus schema/perencanaan PO yang sudah ada.

---

## 1. Executive Summary

**Verdict: YELLOW** — PurchaseOrder **boleh diimplementasi setelah keputusan bisnis yang spesifik**, bukan setelah perbaikan fondasi schema yang merusak.

Fondasi yang sudah cukup:

- `CalibrationRequest` 1:1 `Quotation` sudah di schema, API, tes, dan Portal.
- Quotation bisa mencapai `APPROVED` (prasyarat perencanaan PO).
- Model `PurchaseOrder` / `PurchaseOrderItem`, numbering `PUR`, dan catalog ACL `purchaseOrder` sudah ada.
- `WorkOrder.purchaseOrderId` sudah ada (nullable). **B4 tidak memblokir PO**; B4 memblokir **modul WorkOrder**.

Yang belum aman jika diabaikan:

- Schema PO **1:N** ke Quotation; perencanaan minta **satu PO aktif per quotation** di app-layer — belum dikunci di DB.
- `taxCode` + `taxRateSnapshot` **wajib** di PO, sementara tax Quotation **opsional** dan Portal **tidak mengisi tax**.
- Status CalibrationRequest / Quotation **tidak tersinkron** setelah reject/cancel → dead-end 1:1.
- Aturan copy item (subset, qty, diskon, `deviceId` master) **belum eksplisit di kode**.

Tidak ada blocker fondasi yang membuat implementasi PO mustahil.

Kardinalitas Quotation **tidak dibuka kembali**. Kontrak MVP tetap:

```text
CalibrationRequest 1 ─── 1 Quotation
```

---

## 2. Current Schema

Sumber: `packages/db/prisma/schema.prisma`

### 2.1 CalibrationRequest

```prisma
model CalibrationRequest {
  id            String
  companyId     String
  customerId    String
  number        String
  leadId        String?
  serviceMode   ServiceMode
  expectedDate  DateTime?  @db.Date
  /// @deprecated Use expectedDate
  desiredScheduleNote String?
  status        CalibrationRequestStatus @default(DRAFT)
  notes         String?
  items         CalibrationRequestItem[]
  quotation     Quotation?

  @@unique([companyId, number])
}

model CalibrationRequestItem {
  deviceTypeId String          // FK DeviceType
  deviceId     String          // free-text, BUKAN FK Device
  quotationItems QuotationItem[]
}
```

Enum aktual:

```text
CalibrationRequestStatus: DRAFT | SUBMITTED | IN_QUOTATION | CANCELLED | FULFILLED
```

Tidak ada field lokasi (`addressText` / geo). `serviceMode` hanya di header CalibrationRequest (dan nanti WorkOrder), **bukan** di Quotation atau PurchaseOrder.

### 2.2 Quotation

```prisma
model Quotation {
  requestId          String  @unique          // wajib, 1:1
  status             QuotationStatus @default(DRAFT)
  taxId              String?                  // FK Tax, opsional
  subtotal           Decimal @db.Decimal(18, 2)
  taxAmount          Decimal? @db.Decimal(18, 2)
  totalAmount        Decimal @db.Decimal(18, 2)
  currency           String  @default("IDR")
  approvedAt         DateTime?
  approvedByUserId   String?
  customerApprovedAt DateTime?
  items              QuotationItem[]
  purchaseOrders     PurchaseOrder[]          // 1:N di schema
}

model QuotationItem {
  deviceId      String?     // FK Device, opsional
  requestItemId String?     // FK CalibrationRequestItem, opsional di schema
  tariffId      String?
  description   String
  qty           Decimal @default(1) @db.Decimal(18, 4)
  unitPrice     Decimal @db.Decimal(18, 2)
  lineTotal     Decimal @db.Decimal(18, 2)
}
```

Migrasi 1:1: `packages/db/prisma/migrations/20260826210000_quotation_requestid_unique/migration.sql`

- `requestId` NOT NULL + unique
- FK `ON DELETE RESTRICT`

Enum aktual:

```text
QuotationStatus: DRAFT | SENT | APPROVED | REJECTED | EXPIRED | CANCELLED
```

Tidak ada diskon di header atau line Quotation.

### 2.3 PurchaseOrder (schema ada, modul belum ada)

```prisma
model PurchaseOrder {
  companyId            String @db.Char(3)
  customerId           String
  quotationId          String                 // required, TIDAK unique
  number               String
  customerPoNumber     String
  customerPoDate       DateTime               // required
  status               PurchaseOrderStatus @default(DRAFT)
  subtotal             Decimal @db.Decimal(18, 2)
  headerDiscountAmount Decimal @default(0) @db.Decimal(18, 2)
  taxCode              String                 // required, BUKAN taxId FK
  taxRateSnapshot      Decimal @db.Decimal(5, 4)
  taxAmount            Decimal @db.Decimal(18, 2)
  totalAmount          Decimal @db.Decimal(18, 2)
  currency             String @default("IDR")
  receivedAt           DateTime?
  confirmedAt          DateTime?
  confirmedByUserId    String?
  notes                String?

  @@unique([companyId, number])
  @@unique([companyId, customerId, customerPoNumber])
  @@index([quotationId])
}

model PurchaseOrderItem {
  quotationItemId String                      // required
  deviceId        String?
  tariffId        String?
  description     String
  qty             Decimal @default(1) @db.Decimal(18, 4)
  unitPrice       Decimal @db.Decimal(18, 2)
  discountAmount  Decimal @default(0) @db.Decimal(18, 2)
  lineTotal       Decimal @db.Decimal(18, 2)
  workOrderId     String?
  status          PurchaseOrderItemStatus @default(OPEN)

  @@unique([purchaseOrderId, quotationItemId])
}
```

Enum aktual:

```text
PurchaseOrderStatus:     DRAFT | RECEIVED | CONFIRMED | FULFILLED | CANCELLED
PurchaseOrderItemStatus: OPEN | ALLOCATED | FULFILLED | CANCELLED
```

`customerPoDate` diwajibkan oleh migrasi `packages/db/prisma/migrations/20260823154000_purchase_order_customer_po_date_required/migration.sql`.

### 2.4 WorkOrder / CalibrationJob (downstream)

```prisma
model WorkOrder {
  quotationId     String           // tetap required
  purchaseOrderId String?          // sudah ada, nullable, onDelete SetNull
}

model CalibrationJob {
  purchaseOrderItemId String?      // sudah ada, nullable
  @@unique([workOrderId, deviceId])
}
```

### 2.5 Verifikasi temuan historis

| Klaim lama | Status sekarang | Bukti |
|---|---|---|
| PurchaseOrder ada di schema | Benar | `schema.prisma` model `PurchaseOrder` |
| PO memakai `taxCode` + `taxRateSnapshot`, bukan `taxId` | Benar | field required, tidak ada relasi `Tax` |
| Partial fulfillment di Job/Certificate, bukan status PO | Benar di schema | tidak ada `IN_FULFILLMENT` / `PARTIALLY_FULFILLED` |
| B4: WorkOrder tanpa `purchaseOrderId` | **Usang** | `purchaseOrderId String?` sudah ada; `quotationId` tetap required |

### 2.6 Delete behavior yang relevan ke PO

| Relasi | onDelete | Implikasi |
|---|---|---|
| Quotation → CalibrationRequest | Restrict | CR tidak bisa dihapus jika punya quotation |
| PurchaseOrder → Quotation | Restrict | Quotation tidak bisa dihapus jika punya PO |
| PurchaseOrderItem → QuotationItem | Restrict | QuotationItem tidak bisa dihapus jika sudah masuk PO |
| PurchaseOrderItem → PurchaseOrder | Cascade | hapus PO menghapus items |
| WorkOrder → PurchaseOrder | SetNull | hapus PO tidak menghapus WO |
| CalibrationJob → PurchaseOrderItem | SetNull | hapus PO item tidak menghapus job |

---

## 3. PurchaseOrder ↔ Quotation Contract

```text
Current schema:
  Quotation 1 ─── N PurchaseOrder
  quotationId required, indexed, NOT unique
  onDelete: Restrict

Planning contract:
  PO selalu berasal dari quotation yang sudah disetujui customer
  (status = APPROVED dan customerApprovedAt terisi)
  Schema boleh 1:N; app-layer: satu quotation approved = satu PO non-cancelled
  Sumber: Audit and design Purchase Order.md bagian C + “App-Layer Rules”

MVP interpretation:
  CalibrationRequest 1:1 Quotation sudah locked.
  Satu request, satu quotation, satu jalur ke PO.
  Revisi quotation sebagai record terpisah TIDAK didukung.

Conflict?:
  YA antara dokumentasi vs schema pada kardinalitas —
  tetapi ini keputusan app-layer yang sudah direncanakan,
  bukan kontradiksi yang membuat implementasi mustahil.
  Belum ada unique constraint yang mencegah dua PO aktif dari satu quotation.
```

Dampak 1:1 CalibrationRequest ↔ Quotation: jika quotation `REJECTED` atau `CANCELLED`, **tidak bisa** membuat quotation kedua. PO untuk request itu tidak akan pernah ada kecuali prasyarat PO dilonggarkan (tidak disarankan).

Bukti 1:1 yang sudah ditegakkan:

- Schema: `Quotation.requestId String @unique`
- Service: `ConflictException` `DUPLICATE_QUOTATION_FOR_REQUEST`
- Tes: `rejects a second quotation for the same CalibrationRequest`
- Tes: `enforces one quotation per request at the database unique constraint`
- Portal: halaman new quotation menolak jika quotation sudah ada

---

## 4. PurchaseOrder Item Contract

Rantai aktual:

```text
CalibrationRequestItem (deviceTypeId + deviceId teks)
        ↓ wajib di API Quotation (full-scope, 1:1 per request item)
QuotationItem (requestItemId, description, qty, unitPrice, lineTotal)
        ↓ schema PO
PurchaseOrderItem (quotationItemId wajib; requestItemId TIDAK disimpan)
```

| Pertanyaan | Bukti | Status |
|---|---|---|
| Referensi? | `quotationItemId`, `deviceId?`, `tariffId?`, `workOrderId?` | Jelas |
| Snapshot? | `description`, `qty`, `unitPrice`, `discountAmount`, `lineTotal` | Jelas |
| `requestItemId` di PO? | Tidak; derive via `quotationItem.requestItemId` | Sesuai desain |
| Boleh edit di PO? | Planning: description boleh beda teks customer PO | Qty/harga **UNDEFINED** |
| Qty PO ≠ qty quotation? | Tidak ada aturan di kode atau kontrak terkunci | **UNDEFINED** |
| Qty PO > qty quotation? | Tidak ada aturan | **UNDEFINED** |
| Partial fulfillment di qty PO? | Planning: no split qty across WO; tracking di Job/Certificate | Item status `OPEN → ALLOCATED → FULFILLED` ada |
| Hanya item quotation? | `quotationItemId` required + unique per PO | Ya di schema |
| Boleh omit item quotation? | Unique per PO mengizinkan subset; planning create: “copy lines dari QuotationItem” | **UNDEFINED** (full copy vs subset) |

### 4.1 Gap dari Quotation yang hidup

API Quotation (`apps/api/src/modules/quotations/quotations.service.ts`):

- `assertFullScopeItems` mewajibkan setiap `CalibrationRequestItem` muncul tepat sekali.
- Schema `QuotationItem.requestItemId` tetap nullable — invariant hanya di service, bukan di DB.
- Tidak ada `@@unique([quotationId, requestItemId])`.

Portal Quotation (`apps/portal/src/app/management/quotations/new/page.tsx`):

- **Tidak mengirim** `deviceId` (FK Device), `tariffId`, atau `taxId`.
- Yang tampil adalah `requestItem.deviceId` (teks CalibrationRequest).

Akibat untuk copy-on-create PO:

- `deviceId` hampir selalu `null`
- `tariffId` hampir selalu `null`
- tax harus diisi terpisah (lihat §6)

Planning: line dengan `deviceId` menghasilkan satu CalibrationJob. Tanpa Device master di quotation, spawn job di WorkOrder akan lemah. Ini **bukan blocker PO**, tetapi harus disadari: linking Device adalah pekerjaan PO atau WO, bukan sesuatu yang sudah siap dari quotation Portal.

---

## 5. PurchaseOrder Status / Workflow

Enum aktual schema (bukan usulan perencanaan):

```text
DRAFT | RECEIVED | CONFIRMED | FULFILLED | CANCELLED
```

Dokumen `Audit and design Purchase Order.md` bagian 3 mengusulkan tambahan `IN_FULFILLMENT` dan `PARTIALLY_FULFILLED`. Bagian H / line 462 dokumen yang sama menyatakan partial tracking cukup di CalibrationJob/Certificate. **Schema sudah memilih sisi “tidak perlu status partial di header PO”.** HANDOFF (`HANDOFF_Context_For_ChatGPT.md` §3) menerima enum yang lebih sederhana.

Tidak ada transisi PO di kode aplikasi. Tabel di bawah **hanya** dari schema + perencanaan; sel yang tidak didukung bukti ditandai UNDEFINED.

| Current State | Allowed Action | Next State | Actor | Evidence |
|---|---|---|---|---|
| (none) | create dari Quotation | DRAFT | staff | Planning app-layer; belum ada kode |
| DRAFT | receive? | RECEIVED | UNDEFINED | Field `receivedAt` ada; transisi operasional tidak dikunci |
| RECEIVED | confirm | CONFIRMED | staff (`confirmedByUserId`) | Planning: freeze amount saat confirm |
| CONFIRMED | (WO planning) | — | | Bukan scope PO MVP untuk men-set FULFILLED otomatis |
| * | fulfill | FULFILLED | UNDEFINED | Auto dari semua item FULFILLED vs manual? |
| DRAFT / RECEIVED / ? | cancel | CANCELLED | staff (`purchaseOrder:cancel`) | Apakah CONFIRMED boleh di-cancel? UNDEFINED |
| CONFIRMED | create WorkOrder | — | | Modul WorkOrder, bukan PO |

ACL sudah punya `purchaseOrder:approve`. Mapping ke status `CONFIRMED` vs `RECEIVED` **belum didefinisikan**. Quotation memakai `quotation:approve` untuk SENT → APPROVED; jangan mengasumsikan PO identik.

### 5.1 Workflow Quotation yang sudah hidup (input PO)

Sumber: `quotations.controller.ts` + `quotations.service.ts` + tes.

```text
DRAFT  → SENT | CANCELLED | (edit)
SENT   → APPROVED | REJECTED | CANCELLED
APPROVED → terminal untuk cancel; freeze komersial
REJECTED / CANCELLED / EXPIRED → tidak ada transisi lanjut di kode
```

- `EXPIRED` ada di enum dan badge Portal; **tidak ada** job/endpoint expire.
- `validUntil` disimpan, **tidak dicek** saat send/approve. Sesuai keputusan UI: tidak ada otomasi EXPIRED.
- `approve()` mengisi `approvedAt`, `approvedByUserId`, **dan** `customerApprovedAt` dengan timestamp yang sama. Tidak ada portal customer. Planning “APPROVED + customerApprovedAt terisi” **selalu terpenuhi** setelah approve staf.

### 5.2 Workflow CalibrationRequest yang sudah hidup

Sumber: `calibration-requests.service.ts` + tes.

```text
create → DRAFT
DRAFT → SUBMITTED          (POST /calibration-requests/:id/submit)
SUBMITTED → IN_QUOTATION   (di-set QuotationsService.create, bukan modul CR)
* → CANCELLED              kecuali sudah CANCELLED atau FULFILLED
→ FULFILLED                tidak pernah di-set
```

Cancel CalibrationRequest **tidak** memeriksa status quotation. Cancel/reject quotation **sengaja tidak** mengubah status CalibrationRequest (tes eksplisit). Komentar TODO di `cancel()` yang masih bilang “Quotation module when it's implemented” **usang**.

---

## 6. Financial / Tax Model

### 6.1 Quotation (sudah jalan)

Sumber: `apps/api/src/modules/quotations/quotations.service.ts`

```text
lineTotal   = ROUND_HALF_UP(qty × unitPrice, 2)
subtotal    = sum(lineTotals) dibulatkan 2 desimal
taxAmount   = null jika tidak ada taxId
            = ROUND_HALF_UP(subtotal × tax.taxRate) jika ada taxId
totalAmount = subtotal, atau ROUND_HALF_UP(subtotal + taxAmount)
```

- Tidak ada diskon.
- `Tax.isExclude` ada di schema (`packages/db/prisma/migrations/20260823154800_tax_is_exclude/migration.sql`), **tidak dipakai** di kode.
- Tidak ada modul API Tax atau ServiceTariff. Quotation hanya `prisma.tax.findFirst` jika `taxId` dikirim.
- Portal quotation **tidak** memilih tax.

### 6.2 PurchaseOrder (schema saja)

Rumus perencanaan (`Audit and design Purchase Order.md` bagian F):

```text
grossLine    = qty × unitPrice
lineTotal    = grossLine − discountAmount
subtotal     = SUM(lineTotal)
taxableAmount = subtotal − headerDiscountAmount
taxAmount    = taxableAmount × taxRateSnapshot
totalAmount  = taxableAmount + taxAmount
```

- Diskon item + header ada di schema; Quotation tidak punya ekuivalen.
- `taxCode` + `taxRateSnapshot` **NOT NULL**. PO tanpa pajak **tidak bisa di-insert** tanpa nilai dummy.
- Tidak ada FK ke `Tax`. Snapshot historis disengaja (HANDOFF §3).
- Rounding PO **tidak terdokumentasi**. Quotation memakai `Prisma.Decimal.ROUND_HALF_UP` di kode, bukan di dokumen.

### 6.3 Konflik nyata

Quotation tanpa tax (jalur Portal saat ini) **tidak punya sumber** `taxCode` / `taxRateSnapshot` yang valid untuk insert PO.

Jangan redesign ke multi-currency. Sistem tetap IDR.

---

## 7. Numbering

Siap dipakai. Pola sama dengan CalibrationRequest (`CRQ`) dan Quotation (`QUO`).

| Artefak | Nilai | Bukti |
|---|---|---|
| `DocumentType.PURCHASE_ORDER` | ada | `schema.prisma` enum `DocumentType` |
| Prefix | `PUR` | `packages/db/src/document-number/document-type-prefix.ts` |
| Format | `PUR/YYYY/MM/NNNNN` | `format-document-number.ts` |
| Sequence | per `(companyId, documentType, year)` | `DocumentNumberSequence` |
| Unique number | `@@unique([companyId, number])` | schema PO |
| Mapping tabel | `PURCHASE_ORDER: "PurchaseOrder"` | `document-type-table.ts` |
| Typing mapping | `Record<DocumentType, string>` lengkap, bukan `Partial` | B1 sudah diperbaiki |
| Service | `DocumentNumberService.allocate` | belum dipanggil karena modul belum ada |

Duplikat nomor PO customer dicegah oleh `@@unique([companyId, customerId, customerPoNumber])`.

Jangan mengusulkan mekanisme numbering baru.

---

## 8. Authorization / Company Scoping

Pola yang harus diikuti (sudah benar di CalibrationRequest dan Quotation):

- `CompanyRoleGuard` → `companyId` dari `process.env.COMPANY_ID` + membership, **bukan** body/header klien
- `@CompanyId()` / `@UserId()`
- `@RequirePermission(resource, action)`

| Resource | Catalog (`access-control.ts`) | Seed ADMIN | Menu |
|---|---|---|---|
| `calibrationRequest` | read / create / update / cancel | ya | ya |
| `quotation` | read / create / update / cancel / approve | ya | ya |
| `purchaseOrder` | read / create / update / cancel / approve | **tidak** | **tidak** |

SUPERADMIN bypass tetap jalan. ADMIN **tidak** bisa memakai API PO sampai `packages/db/prisma/seed-role-permissions.ts` (dan menu) ditambah. Ini pekerjaan implementasi, bukan blocker schema.

`companyId` pada PurchaseOrder memakai `@db.Char(3)` (selaras `Company.id`). Quotation memakai `String` tanpa Char(3). Tidak memblokir.

Quotation `reject` dan `send` memakai `quotation:update`, bukan action khusus. PO boleh mengikuti pola yang sama kecuali `confirm` dipetakan ke `purchaseOrder:approve` — itu keputusan D6.

---

## 9. Partial Fulfillment

Kontrak aktual yang konsisten di schema:

- Header PO: all-or-nothing `FULFILLED` / `CANCELLED` (tanpa partial).
- Item PO: `OPEN | ALLOCATED | FULFILLED | CANCELLED` + `workOrderId?` (satu item ≤ satu WO).
- 1 PO → N WorkOrder (`WorkOrder.purchaseOrderId?`).
- 1 PO item → N CalibrationJob **dimungkinkan** (`CalibrationJob.purchaseOrderItemId?`), tetapi Job unique `(workOrderId, deviceId)`.
- Sertifikat/invoice parsial: `Certificate.billingStatus` — di luar PO.
- Split qty satu PO item ke banyak SPK: **out of scope** (planning).

Kontradiksi `IN_FULFILLMENT` / `PARTIALLY_FULFILLED` **masih ada di dokumen perencanaan**, bukan di schema. Jangan menambah enum saat implementasi PO.

Aturan “1 SPK = 1 customer + 1 location” adalah konsep **WorkOrder** (`addressText`, geo, `locationNotes`). PurchaseOrder **tidak** punya field lokasi. Jangan mengimpor asumsi lokasi ke header PO.

---

## 10. Downstream WorkOrder Contract

| | Sekarang |
|---|---|
| WO → Quotation | `quotationId` **required** |
| WO → PurchaseOrder | `purchaseOrderId` **optional** |
| B4 unresolved? | **Sebagian.** Kolom ada; belum wajib; `quotationId` belum “derived only” |
| PO implementation blocked by B4? | **Tidak.** PO bisa hidup tanpa mengubah WorkOrder |

Opsi A di planning (pertahankan `quotationId` required, isi dari `PO.quotationId`) **sudah kompatibel** dengan schema sekarang.

Pisahkan kesiapan:

```text
PO readiness:        YELLOW (keputusan domain, bukan B4)
WorkOrder readiness: belum — B4 residual + lokasi + assignment masih terbuka
```

Jangan mulai modul WorkOrder di sprint PO. Jangan ubah schema WorkOrder kecuali denormalisasi saat create WO nanti.

---

## 11. Migration Requirements

Untuk **MVP modul backend PO** yang mengikuti schema sekarang:

- **Tidak wajib migrasi.**

Migrasi **hanya** jika keputusan bisnis menolak schema:

| Keputusan | Jenis perubahan |
|---|---|
| Tax opsional seperti Quotation | constraint change: `taxCode` / `taxRateSnapshot` / `taxAmount` nullable, atau tambah `taxId` |
| 1:1 ketat Quotation ↔ PO | unique `quotationId`, atau unique parsial PO non-cancelled |
| Tambah `IN_FULFILLMENT` | enum change — **jangan**, kecuali keputusan C1 dibalik |
| `FileOwnerType.PURCHASE_ORDER` | additive, non-blocking |
| Seed permission / menu | data, bukan schema |

Tidak ada enum change, relation change, atau constraint change yang **wajib** sebelum mulai implementasi.

---

## 12. Findings

### Blocker for PO MVP

Tidak ada.

B4 historis **bukan** blocker PO. Pola tax snapshot yang berbeda dari Quotation/Invoice **bukan** defect fondasi jika diterima sebagai desain komitmen customer.

### Required Before Implementation

1. **Prasyarat status quotation untuk create PO.** Planning: hanya `APPROVED` + `customerApprovedAt`. Kode Quotation mengisi keduanya saat approve. Kunci ini secara eksplisit: tolak DRAFT / SENT / REJECTED / EXPIRED / CANCELLED.

2. **Kardinalitas Quotation → PO.** Enforce app-layer: satu PO non-`CANCELLED` per `quotationId`. Unique DB opsional untuk MVP.

3. **Tax pada create PO.** `taxCode` / `taxRateSnapshot` wajib; Quotation/Portal sering tanpa tax. Pilih salah satu: (a) wajib pilih Tax master saat create PO, (b) izinkan snapshot 0 + kode sentinel, (c) migrasi nullable. Jangan diam-diam copy `null`.

4. **Copy item.** Full copy semua QuotationItem vs subset? Qty/harga boleh beda dari quotation? Diskon hanya di PO (schema mendukung; Quotation tidak punya)?

5. **State machine PO.** Arti `DRAFT` vs `RECEIVED` vs `CONFIRMED`; action mana yang memakai `purchaseOrder:approve`; apakah CONFIRMED boleh cancel; siapa yang men-set `FULFILLED`.

6. **Kopel status CalibrationRequest.** Apakah CR CANCELLED memblokir create PO? Apakah quotation APPROVED memblokir cancel CR?

7. **Seed** `purchaseOrder:*` untuk ADMIN (+ menu), mengikuti pola quotation.

### Safe to Implement

- Alokasi nomor `PUR` via `DocumentNumberService` di dalam `$transaction`
- `CompanyRoleGuard` + permission catalog (setelah seed)
- Header: `customerId` dari quotation, `quotationId` required, `customerPoNumber` + `customerPoDate` required
- Unique customer PO number
- Item wajib `quotationItemId`, unique per PO
- Snapshot finansial DECIMAL 18,2 / 18,4 / 5,4
- Currency IDR
- Single-tenant `companyId` server-side
- Tidak menambah status partial di header
- Tidak mengubah schema WorkOrder di sprint ini
- Tidak membuka 1:N quotation

### Non-Blocking / Later

- `EXPIRED` / enforcement `validUntil`
- `Tax.isExclude`
- API/UI Tax dan ServiceTariff
- `deviceId` master di form Quotation
- Unique DB `(quotationId, requestItemId)`
- `FileOwnerType.PURCHASE_ORDER`
- Idempotency-key (unique constraints cukup untuk MVP)
- CalibrationRequest `FULFILLED` (downstream)
- FK `companyId` pada beberapa child table
- Dokumentasi rounding
- TODO usang di `calibration-requests.service.ts`
- Inkonsistensi `companyId Char(3)` vs `String`
- Dead-end 1:1 setelah reject (proses operasional: buat CR baru)

---

## 13. Open Business Decisions

| ID | Keputusan | Default yang boleh dipakai jika ingin mulai tanpa rapat ulang | Risiko |
|---|---|---|---|
| D1 | PO hanya dari `APPROVED`? | Ya — sesuai planning; `customerApprovedAt` sudah terisi oleh `approve()` | Rendah |
| D2 | 1 PO aktif per quotation? | Ya, cek app-layer `status ≠ CANCELLED` | Duplikat jika lupa |
| D3 | Tax wajib vs opsional | Wajib isi Tax saat create PO (schema memaksa) | Quotation tanpa tax tetap bisa jadi PO berpajak |
| D4 | Full item copy? | Full copy, 1:1 QuotationItem | Tidak bisa PO parsial di header |
| D5 | Qty/harga editable? | Snapshot dari quotation; tidak edit setelah create kecuali DRAFT | UNDEFINED jika customer PO beda qty |
| D6 | DRAFT → RECEIVED → CONFIRMED | Create = DRAFT, atau langsung RECEIVED jika nomor PO customer sudah ada | Mapping permission `approve` |
| D7 | Cancel CR vs PO | Blokir cancel CR jika quotation APPROVED atau ada PO | Perilaku hari ini mengizinkan |

D3–D7 **bukan** fakta kontrak yang sudah ada di kode. Itu usulan implementasi agar sprint PO tidak berhenti di tengah jalan.

Duplikat creation hari ini:

- Nomor internal: unique `(companyId, number)` + sequence atomic
- Nomor PO customer: unique `(companyId, customerId, customerPoNumber)`
- Quotation: **tidak** unique; dua PO dari satu quotation **mungkin** sampai D2 ditegakkan di service
- Tidak ada idempotency-key — diterima untuk MVP (HANDOFF §3)

---

## 14. Recommended Implementation Scope

Ikuti pola Quotation secara bedah. Jangan mulai WorkOrder.

1. Zod di `packages/shared/src/schemas/index.ts` (create / update / list). Jangan terima `companyId` dari klien. `customerId` derive dari quotation.

2. `PurchaseOrdersModule` di `apps/api`:
   - `POST /` create dari `quotationId` + `customerPoNumber` + `customerPoDate` + items
   - `GET /` list, `GET /:id`
   - `PATCH /:id` hanya DRAFT
   - transisi: receive / confirm / cancel sesuai keputusan D6

3. Create di `prisma.$transaction`:
   - load quotation `companyId` + status `APPROVED`
   - cek belum ada PO non-cancelled untuk `quotationId` (D2)
   - `customerId` = `quotation.customerId`
   - allocate `DocumentType.PURCHASE_ORDER`
   - copy/snapshot items (D4/D5)
   - hitung totals (rumus §6.2) dengan `ROUND_HALF_UP` 2 desimal

4. Seed `purchaseOrder:read/create/update/cancel/approve` untuk ADMIN + menu Portal (UI boleh menyusul).

5. Tes: prasyarat status, duplikat quotation, unique `customerPoNumber`, isolasi company, rollback, numbering.

6. **Jangan:** implement WorkOrder, ubah enum PO, ubah kardinalitas Quotation, tambah revisi quotation, redesign tax menjadi multi-currency.

---

## 15. Final Verdict

```text
YELLOW — PurchaseOrder can proceed after specific decisions/fixes listed above.
```

Bukan GREEN karena D3 (tax wajib vs quotation tanpa tax), D4–D6 (item + workflow), dan D2 (duplikat PO) belum dikunci di kode.

Bukan RED karena tidak ada defect fondasi yang harus di-migrasi dulu agar PO mustahil diimplementasi dengan aman.

```text
READ-ONLY AUDIT ONLY — no source code or schema was modified.
```

---

## 16. Evidence Index

| Topik | Sumber |
|---|---|
| Schema CR / Quotation / PO / WO / Job / Tax | `packages/db/prisma/schema.prisma` |
| 1:1 CR–Quotation | `packages/db/prisma/migrations/20260826210000_quotation_requestid_unique/migration.sql`; `QuotationsService.create`; tes duplicate |
| Full-scope quotation | `assertFullScopeItems` di `apps/api/src/modules/quotations/quotations.service.ts` |
| Status CR `IN_QUOTATION` | `quotations.service.ts` create jika CR `SUBMITTED` |
| Approve mengisi kedua timestamp | `quotations.service.ts` `approve()` |
| Reject tidak ubah CR | tes `rejects a SENT quotation without changing CalibrationRequest status` |
| Cancel CR tanpa cek quotation | `apps/api/src/modules/calibration-requests/calibration-requests.service.ts` `cancel()` |
| Portal tanpa tax / device / tariff | `apps/portal/src/app/management/quotations/new/page.tsx`, `quotation-form-fields.tsx` |
| Numbering PO | `packages/db/src/document-number/document-type-prefix.ts`, `document-type-table.ts` |
| ACL vs seed | `packages/auth/src/access-control.ts` vs `packages/db/prisma/seed-role-permissions.ts` |
| Guard companyId | `apps/api/src/common/guards/company-role.guard.ts` |
| Desain PO | `docs/claude/plans/Calibration-management/Audit and design Purchase Order.md` |
| B4 / tax snapshot / partial | `docs/claude/plans/Calibration-management/HANDOFF_Context_For_ChatGPT.md` §3–4 |
| Prompt audit ini | `docs/claude/plans/Calibration-management/purchase-order/READ-ONLY AUDIT — PurchaseOrder Module.md` |
| Audit Quotation 26 Agu | **usang** — jangan diikuti untuk klaim “Quotation belum ada” |
