Audit & Desain PurchaseOrder / PurchaseOrderItem

Ringkasan Eksekutif

EXISTING FACT: Repository belum memiliki model PurchaseOrder (grep nol match di schema/kode). Alur terdokumentasi dan terimplementasi di schema saat ini: CalibrationRequest → Quotation → WorkOrder → CalibrationJob → Certificate → Invoice.

DESIGN RECOMMENDATION: Sisipkan PurchaseOrder antara quotation yang disetujui customer dan WorkOrder (SPK). PO adalah customer purchase order (nomor dokumen dari rumah sakit), bukan procurement internal. Billing tetap via Certificate; PO tidak masuk billable path.

flowchart TD
CR[CalibrationRequest]
Q[Quotation approved]
PO[PurchaseOrder NEW]
WO[WorkOrder SPK]
CJ[CalibrationJob]
CERT[Certificate]
INV[Invoice]

CR --> Q
Q --> PO
PO --> WO
WO --> CJ
CJ --> CERT
CERT --> INV

Bagian 1 — EXISTING FACTS (Audit Repository)

1.1 Entitas yang diaudit

Entitas

Lokasi

Temuan kunci

Customer

[packages/db/prisma/schema.prisma](packages/db/prisma/schema.prisma) L742–770

companyId, name, legalName, taxId (NPWP), address, status. Relasi ke requests, quotations, workOrders, invoices. Tidak ada relasi PO.

CalibrationRequest

L819–840

customerId, optional leadId, serviceMode, status (DRAFT→FULFILLED). 1:N ke items & quotations.

CalibrationRequestItem

L842–855

deviceId wajib, optional notes. Di-link dari QuotationItem.requestItemId.

Quotation

L878–907

Header finansial: subtotal, taxId?, taxAmount?, totalAmount, currency. Approval: approvedAt, customerApprovedAt. Optional requestId. Tidak ada field diskon.

QuotationItem

L909–928

deviceId?, requestItemId?, tariffId?, description, qty (18,4), unitPrice, lineTotal. Tidak ada diskon per line.

Tax

L1108–1123

Master taxCode, taxRate (5,4), description, isActive. Dipakai Quotation & Invoice. Belum dipakai PO.

WorkOrder

L930–956

quotationId required, customerId, number (unique/company), lokasi via addressText/geoLat/geoLng/locationNotes, serviceMode, status. 1:N jobs & assignments. Tidak ada FK ke PO.

WorkOrderAssignment

L958–971

technicianUserId, roleOnJob (LEAD/ASSIST).

CalibrationJob

L977–998

workOrderId + deviceId, @@unique([workOrderId, deviceId]). Tidak ada FK langsung ke Quotation/Request/PO.

Device

L794–817

Milik customer; dipakai di request items, quotation items, jobs, certificates.

Invoice / InvoiceItem

L1125–1185

Header sama pola Quotation (subtotal, taxId, taxAmount, totalAmount). Line item: snapshot description, qty?, unitPrice?, amount (bukan lineTotal). Billable via InvoiceCertificate → Certificate.

PurchaseOrder

—

Tidak ada.

1.2 Pola finansial existing

Uang: @db.Decimal(18, 2); qty: @db.Decimal(18, 4); tax rate master: @db.Decimal(5, 4).

Header tax: FK taxId + snapshot taxAmount (Quotation, Invoice).

Line total naming: lineTotal (QuotationItem) vs amount (InvoiceItem).

Diskon tidak ada di seluruh schema.

Invoice line = snapshot historis saat create; tidak live-reference quotation.

1.3 Relasi & aturan existing yang relevan

Quotation.requestId? → optional link ke CalibrationRequest.

QuotationItem.requestItemId? → traceability ke request item.

WorkOrder.quotationId required — dokumentasi [docs/cursor/entity-catalog.md](../../architecture/entity-catalog.md) & [docs/ERD/overview.md](../../architecture/ERD/overview.md) mensyaratkan quotation approved sebelum WO.

Quotation → WorkOrder = 1:N (multi-SP K dari satu quotation).

CalibrationJob = 1 device per job (unique constraint).

Billing SoR = Certificate only; partial invoice didukung via pemilihan certificate(s) ke Invoice.

Tax master baru ditambahkan via migration [packages/db/prisma/migrations/20260823045950_add_tax_master/migration.sql](packages/db/prisma/migrations/20260823045950_add_tax_master/migration.sql) — belum applied ke PO.

Tidak ada implementasi API/service untuk domain komersial (greenfield).

1.4 Konflik dengan workflow baru (locked)

Aturan bisnis baru

Konflik dengan existing

PO baru setelah quotation approved

WO saat ini langsung ke Quotation, lewati PO

1 PO → N WorkOrders

WO parent saat ini = Quotation, bukan PO

1 PO Item → max 1 SPK

Tidak ada entitas line-level allocation

Diskon item + header di PO

Field diskon belum ada di mana pun

PO ≠ CalibrationRequest

Aman — request tetap upstream, tidak perlu reinterpretasi

Bagian 2 — DESIGN RECOMMENDATIONS (Jawaban A–J)

A. Apa yang harus dimuat PurchaseOrder?

Identitas & scope

id, companyId, customerId — ikuti pola multi-tenant existing.

quotationId required — PO selalu berasal dari quotation yang sudah disetujui customer (customerApprovedAt / status = APPROVED).

number — nomor PO internal MedCal (registry), unique per company (mirip WorkOrder.number, Invoice.number).

customerPoNumber — nomor PO dari customer (dokumen RS/klien); unique per (companyId, customerId, customerPoNumber) disarankan.

customerPoDate? — tanggal dokumen PO customer.

Status & lifecycle

Enum baru PurchaseOrderStatus, contoh: DRAFT | RECEIVED | CONFIRMED | IN_FULFILLMENT | PARTIALLY_FULFILLED | FULFILLED | CANCELLED.

receivedAt?, confirmedAt?, confirmedByUserId? — audit penerimaan PO.

notes?.

Finansial (header snapshot)

subtotal — jumlah line setelah diskon item.

headerDiscountAmount — diskon global/header (default 0).

taxableAmount — optional stored computed field, atau dihitung app-layer: subtotal - headerDiscountAmount.

taxId?, taxAmount?, totalAmount, currency — reuse pola Quotation/Invoice.

taxRateSnapshot? — rekomendasi tambahan untuk preservasi historis jika master Tax berubah (Quotation belum punya ini; PO sebaiknya punya karena PO = dokumen komitmen customer).

Relasi keluar

items PurchaseOrderItem[]

workOrders WorkOrder[] (1 PO → N WO)

Tidak perlu di header PO

requestId — derive via quotation.requestId.

Duplikasi serviceMode — tetap di WorkOrder (eksekusi per lokasi/jadwal).

B. Apa yang harus dimuat PurchaseOrderItem?

Traceability

purchaseOrderId, companyId.

quotationItemId required — lihat jawaban D.

deviceId? — lihat jawaban E.

tariffId? — optional copy dari QuotationItem (audit pricing source, bukan live price lookup).

Deskripsi & kuantitas

description — snapshot dari quotation line (bisa diedit saat PO dicatat jika customer PO berbeda teks).

qty — @db.Decimal(18, 4), default 1.

Finansial per line (snapshot)

unitPrice — harga satuan saat PO dicatat.

discountAmount — diskon per item (default 0); OUT OF SCOPE: persentase diskon kompleks / multi-tier.

lineTotal — hasil akhir line setelah diskon item (= qty \* unitPrice - discountAmount, stored).

Alokasi ke SPK

workOrderId? — nullable; di-set saat item dialokasikan ke satu WorkOrder.

status enum item: OPEN | ALLOCATED | FULFILLED | CANCELLED — memudahkan query fulfillment tanpa join berat.

Tidak perlu

requestItemId langsung — derive via quotationItem.requestItemId.

Partial qty split across WO — explicitly out of scope.

C. Referensi ke entitas existing

erDiagram
Customer ||--o{ PurchaseOrder : issues
Quotation ||--o{ PurchaseOrder : "spawns after approve"
PurchaseOrder ||--o{ PurchaseOrderItem : lines
QuotationItem ||--o{ PurchaseOrderItem : "traceability"
Device ||--o{ PurchaseOrderItem : "optional per line"
ServiceTariff ||--o{ PurchaseOrderItem : "optional audit"
Tax ||--o{ PurchaseOrder : taxId
PurchaseOrder ||--o{ WorkOrder : "1 to N"
WorkOrder ||--o{ PurchaseOrderItem : "allocates"
WorkOrder ||--o{ CalibrationJob : executes
PurchaseOrderItem ||--o| CalibrationJob : "recommended optional FK"

FK

Cardinality

Wajib?

PO → Company

N:1

Ya

PO → Customer

N:1

Ya

PO → Quotation

N:1

Ya (satu PO dari satu quotation approved)

PO → Tax

N:1

Optional (sama Quotation)

POItem → PO

N:1

Ya

POItem → QuotationItem

N:1

Ya

POItem → Device

N:1

Optional (strongly recommended untuk line perangkat)

POItem → ServiceTariff

N:1

Optional

POItem → WorkOrder

N:1

Optional (max one — rule 7)

WO → PO

N:1

Ya (rekomendasi wajib untuk flow baru)

WO → Quotation

N:1

Pertahankan denormalized / backward compat

CalibrationJob → POItem

N:1

Optional tapi direkomendasikan

Cardinality Quotation → PO: Rekomendasikan 1:1 untuk PO aktif (enforce app-layer: satu quotation approved hanya satu PO non-cancelled). Schema boleh 1:N jika revisi PO di masa depan.

D. Apakah quotationItemId dipertahankan?

Ya — wajib di PurchaseOrderItem.

Alasan:

Rantai audit: CalibrationRequestItem ← QuotationItem ← PurchaseOrderItem → WorkOrder → CalibrationJob → Certificate → InvoiceItem.

PO adalah snapshot komitmen customer; quotation tetap dokumen penawaran internal.

Menghindari duplikasi konsep line-item di tiga tempat tanpa link.

Constraint disarankan: @@unique([purchaseOrderId, quotationItemId]) — satu quotation line maksimal satu PO line.

E. Apakah deviceId dipertahankan langsung?

Ya — optional FK, strongly recommended untuk line kalibrasi per perangkat.

Alasan (existing pattern):

QuotationItem.deviceId? sudah ada; CalibrationRequestItem.deviceId wajib.

CalibrationJob unique pada (workOrderId, deviceId) — mapping SPK membutuhkan device.

Snapshot FK memungkinkan validasi: device PO item harus match device job saat WO di-plan.

Aturan app-layer:

Line dengan deviceId → menghasilkan tepat satu CalibrationJob per SPK (qty=1 tipikal).

Line tanpa device (mis. biaya visit) → tidak spawn CalibrationJob; bisa tetap di PO untuk nilai kontrak, fulfillment non-job.

F. Representasi qty, harga, diskon, tax, subtotal, total

Ikuti konvensi existing + perluas untuk diskon (rule 12).

Per item (PurchaseOrderItem):

grossLine = qty \* unitPrice
lineTotal = grossLine - discountAmount // stored

Header (PurchaseOrder):

subtotal = SUM(lineTotal) // stored
taxableAmount = subtotal - headerDiscountAmount // computed or stored
taxAmount = taxableAmount \* taxRateSnapshot // stored at PO confirm
totalAmount = taxableAmount + taxAmount // stored

Tax:

taxId → FK ke master [Tax](packages/db/prisma/schema.prisma).

taxRateSnapshot → copy Tax.taxRate saat PO dikonfirmasi.

taxAmount → stored snapshot (sama pola Quotation/Invoice).

Naming consistency:

Gunakan lineTotal di POItem (selaras QuotationItem), bukan amount (reserved untuk InvoiceItem snapshot).

Diskon — OUT OF SCOPE now: persentase diskon, diskon bertingkat, alokasi diskon header pro-rata ke line.

G. Preservasi nilai finansial historis

Prinsip: PO = dokumen komitmen; semua angka disimpan saat PO CONFIRMED, tidak di-recalculate dari Quotation/Tax master afterward.

Field

Strategi

unitPrice, discountAmount, lineTotal

Snapshot per item saat create/confirm PO

description

Snapshot teks

subtotal, headerDiscountAmount, taxAmount, totalAmount

Snapshot header

taxId

FK referensi + taxRateSnapshot

currency

Snapshot (default IDR, dari quotation)

QuotationItem / Quotation

Tetap immutable setelah PO confirmed (app rule)

Invoice

Tetap snapshot terpisah via Certificate saat billing

Quotation tidak perlu field diskon sekarang — diskon hidup di PO layer sesuai rule 12.

H. Mapping PO Item → WorkOrder / CalibrationJob

Alur operasional yang direkomendasikan:

Quotation APPROVED → buat PurchaseOrder + copy lines dari QuotationItem.

PO CONFIRMED → siap di-plan SPK.

User buat WorkOrder dari PO → pilih subset PurchaseOrderItem (same customerId, one location).

Set PurchaseOrderItem.workOrderId + status ALLOCATED (rule 7: max one WO).

Saat WO dibuat, spawn CalibrationJob per item yang punya deviceId:

Prefer: set CalibrationJob.purchaseOrderItemId (FK baru, optional) untuk traceability eksplisit.

Fallback match: (workOrderId, deviceId) jika FK tidak ditambahkan.

Job partial completion & partial invoice — tidak butuh perubahan PO; tetap via job/certificate status (rules 9–10).

Cardinality check vs business rules:

Rule

Mekanisme schema

1 PO → N WO

WorkOrder.purchaseOrderId

1 PO Item → max 1 SPK

PurchaseOrderItem.workOrderId? (single FK)

No partial qty split

qty entire line goes to one WO; no split table

Partial job completion

CalibrationJob.status existing

Partial invoice

Certificate + InvoiceCertificate existing

I. Field/model existing yang bisa reuse

Reuse

Cara

Tax master

taxId + taxAmount + optional taxRateSnapshot

ServiceTariff

Optional tariffId on POItem (copied from QuotationItem)

Customer, Device, Company

FK langsung

Quotation / QuotationItem

Parent + line traceability; copy-on-create PO

WorkOrder location fields

Tetap di WO (addressText, geo, locationNotes) — rule 6

CalibrationJob uniqueness

(workOrderId, deviceId) — tidak perlu konsep job baru

Certificate → Invoice

Tidak diubah

Decimal conventions

18,2 / 18,4 / 5,4

FileObject

Tambah PURCHASE_ORDER ke FileOwnerType untuk scan PO customer (reuse vault pattern)

Jangan buat duplikat:

Jangan reinterpret CalibrationRequest sebagai PO.

Jangan buat TaxCode terpisah — gunakan Tax.

Jangan buat billable join PO → Invoice (Certificate tetap SoR).

J. Konflik schema & implikasi migrasi (rencana, tidak dieksekusi)

Perubahan schema terkait (fase implementasi berikutnya):

Tambah PurchaseOrder, PurchaseOrderItem, enum status.

Ubah WorkOrder: tambah purchaseOrderId String (required untuk data baru).

Keputusan WorkOrder.quotationId:

Opsi A (recommended): tetap required, di-populate dari PO.quotationId — minim breaking change, query existing tetap jalan.

Opsi B: jadikan optional, derive via PO — lebih bersih tapi breaking.

Opsional: CalibrationJob.purchaseOrderItemId untuk traceability eksplisit.

Extend Tax: relasi purchaseOrders PurchaseOrder[].

Extend Customer, Company, Quotation: relasi balik ke PO.

Extend FileOwnerType: PURCHASE_ORDER.

Dokumentasi: update [docs/cursor/entity-catalog.md](../../architecture/entity-catalog.md) & ERD — sisipkan PO antara Quotation dan WorkOrder.

Migrasi data (jika ada WO produksi nanti):

Backfill PurchaseOrder sintetis per quotationId yang sudah punya WO, atau

Flag legacy WO dengan purchaseOrderId = null + migration script.

Tidak perlu migrasi Tax — master sudah ada; cukup tambah FK PO → Tax.

Index disarankan:

PurchaseOrder: (companyId, status), (quotationId), unique (companyId, number), unique (companyId, customerId, customerPoNumber).

PurchaseOrderItem: (purchaseOrderId), (workOrderId), unique (purchaseOrderId, quotationItemId).

Bagian 3 — Proposed Prisma Models (TIDAK DITERAPKAN)

enum PurchaseOrderStatus {
DRAFT
RECEIVED
CONFIRMED
IN_FULFILLMENT
PARTIALLY_FULFILLED
FULFILLED
CANCELLED
}

enum PurchaseOrderItemStatus {
OPEN
ALLOCATED
FULFILLED
CANCELLED
}

model PurchaseOrder {
id String @id @default(cuid())
companyId String
customerId String
quotationId String
number String
customerPoNumber String
customerPoDate DateTime?
status PurchaseOrderStatus @default(DRAFT)
subtotal Decimal @db.Decimal(18, 2)
headerDiscountAmount Decimal @default(0) @db.Decimal(18, 2)
taxId String?
taxRateSnapshot Decimal? @db.Decimal(5, 4)
taxAmount Decimal? @db.Decimal(18, 2)
totalAmount Decimal @db.Decimal(18, 2)
currency String @default("IDR")
receivedAt DateTime?
confirmedAt DateTime?
confirmedByUserId String?
notes String?
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt

company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
customer Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
quotation Quotation @relation(fields: [quotationId], references: [id])
tax Tax? @relation(fields: [taxId], references: [id])
items PurchaseOrderItem[]
workOrders WorkOrder[]

@@unique([companyId, number])
@@unique([companyId, customerId, customerPoNumber])
@@index([companyId, status])
@@index([quotationId])
@@index([taxId])
}

model PurchaseOrderItem {
id String @id @default(cuid())
companyId String
purchaseOrderId String
quotationItemId String
deviceId String?
tariffId String?
description String
qty Decimal @default(1) @db.Decimal(18, 4)
unitPrice Decimal @db.Decimal(18, 2)
discountAmount Decimal @default(0) @db.Decimal(18, 2)
lineTotal Decimal @db.Decimal(18, 2)
workOrderId String?
status PurchaseOrderItemStatus @default(OPEN)
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt

purchaseOrder PurchaseOrder @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
quotationItem QuotationItem @relation(fields: [quotationItemId], references: [id])
device Device? @relation(fields: [deviceId], references: [id])
tariff ServiceTariff? @relation(fields: [tariffId], references: [id])
workOrder WorkOrder? @relation(fields: [workOrderId], references: [id])
calibrationJobs CalibrationJob[]

@@unique([purchaseOrderId, quotationItemId])
@@index([purchaseOrderId])
@@index([workOrderId])
}

Perubahan pendamping (referensi, bukan bagian apply sekarang):

// WorkOrder — tambahan
purchaseOrderId String
purchaseOrder PurchaseOrder @relation(...)
// quotationId tetap ada (denormalized dari PO.quotationId)

// CalibrationJob — tambahan optional
purchaseOrderItemId String?
purchaseOrderItem PurchaseOrderItem? @relation(...)

// Tax — relasi balik
purchaseOrders PurchaseOrder[]

// FileOwnerType — tambahan
PURCHASE_ORDER

Bagian 4 — App-Layer Rules (bukan schema, tapi locked dengan desain)

PO hanya dibuat jika Quotation.status = APPROVED dan customerApprovedAt terisi.

PurchaseOrder.customerId harus sama dengan Quotation.customerId.

Saat confirm PO, recalculate & freeze semua amount fields.

WorkOrder hanya dibuat dari PO CONFIRMED; WorkOrder.customerId = PO.customerId.

Assign PO item ke WO hanya jika item OPEN dan workOrderId IS NULL.

Satu PO item tidak boleh ALLOCATED ke lebih dari satu WO (FK tunggal + app check).

CalibrationJob device harus match PurchaseOrderItem.deviceId bila FK item diset.

Billing tetap: Certificate issued → Invoice; PO tidak jadi billable SoR.

Out of Scope (confirmed)

Partial qty allocation satu PO item ke banyak SPK

Diskon persentase / pro-rata header discount ke lines

PO procurement internal / supplier domain

API, UI, migration files

Perubahan jalur Invoice/Certificate
