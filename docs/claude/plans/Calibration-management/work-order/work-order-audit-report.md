Saya akan mulai dari file audit SQL yang terlampir, lalu menelusuri kode dan skema work-order agar temuan bisa dicocokkan dengan domain yang ada.

File audit sudah saya baca. Berikutnya saya cek schema Prisma, modul backend, permission, dan pola dokumen yang sudah ada.

Schema dan dokumen perencanaan sudah terlihat. Saya lanjut ke model Prisma, modul PO/Quotation, permission, dan numbering.

Schema WorkOrder sudah jelas. Saya lanjut ke kontrak PO/Quotation yang sudah dikunci, permission, dan apakah modul WO sudah ada.

Saya sudah menelusuri schema, modul PO/Quotation/CalibrationRequest, permission, numbering, menu, dan migrasi. Berikut hasil audit read-only.

READ-ONLY AUDIT — WorkOrder Domain & Implementation Readiness
Mode: read-only. Tidak ada perubahan file, migrasi, atau implementasi.
Source of truth: repository saat ini, bukan dokumen perencanaan yang sudah kedaluwarsa.

1. Verdict
   NOT READY FOR IMPLEMENTATION
   Baseline teknis sudah ada (model Prisma, prefix SPK, catalog permission, relasi ke PO/Quotation/Job). Yang belum cukup: kontrak domain MVP. Beberapa keputusan masih UNRESOLVED dan akan menentukan bentuk API, schema constraint, dan UI. Mengimplementasikan sekarang berarti menebak cardinality, source document, item selection, dan status machine.

PurchaseOrder sendiri sudah siap dipakai sebagai kontrak hulu. Jangan mengubahnya.

2. Apa yang sudah ada vs apa yang belum dibangun
   Lapisan Status
   Prisma WorkOrder, WorkOrderAssignment, CalibrationJob
   Ada
   Modul API apps/api/src/modules/work-orders/
   Tidak ada
   Zod/shared schema WorkOrder
   Tidak ada
   Portal UI / route /work-orders
   Tidak ada
   Menu seed WorkOrder
   Tidak ada
   Seed RolePermission untuk workOrder
   Tidak ada
   MeCapabilities workOrder
   Tidak ada
   Tes modul WorkOrder
   Tidak ada
   Hulu yang sudah hidup dan jangan didesain ulang:

CalibrationRequest 1∶1 Quotation (Quotation.requestId unique)
Quotation APPROVED + customerApprovedAt → create PO
PO = snapshot komersial Quotation
PO workflow: DRAFT → APPROVED, DRAFT → CANCELLED, APPROVED tidak boleh CANCELLED
Approve PO tidak membuat WorkOrder (tes eksplisit workOrderCount === 0) 3. Model WorkOrder saat ini (LOCKED / EVIDENCED)

schema.prisma
Lines 1232-1262
model WorkOrder {
id String @id @default(cuid())
companyId String
quotationId String
purchaseOrderId String?
customerId String
number String
serviceMode ServiceMode
addressText String?
geoLat Float?
geoLng Float?
locationNotes String?
scheduledStart DateTime?
scheduledEnd DateTime?
status WorkOrderStatus @default(PLANNED)
...
quotation Quotation @relation(...)
purchaseOrder PurchaseOrder? @relation(..., onDelete: SetNull)
customer Customer @relation(..., onDelete: Cascade)
assignments WorkOrderAssignment[]
jobs CalibrationJob[]
purchaseOrderItems PurchaseOrderItem[]
@@unique([companyId, number])
}
Field operasional (bukan komersial): serviceMode, lokasi (addressText, geo, locationNotes), jadwal (scheduledStart/scheduledEnd), status, number.

Tidak ada di header WO: qty, price, discount, tax, currency, total, notes komersial, approvedAt.

Tidak ada model WorkOrderItem. Item “milik WO” hanya lewat PurchaseOrderItem.workOrderId.

Enum status (sejak init, tidak berubah):

PLANNED → ASSIGNED → IN_PROGRESS → TECHNICALLY_DONE → CLOSED
↘ CANCELLED (dari enum, transisi tidak di-enforce)
Bukan DRAFT / APPROVED / COMPLETED. Jangan menambahkan status itu hanya karena terdengar masuk akal.

Assignment: WorkOrderAssignment (technicianUserId, roleOnJob LEAD/ASSIST), unique (workOrderId, technicianUserId). companyId di assignment tanpa FK Company (pola yang sama dengan beberapa child table lain).

4. Rantai lifecycle aktual
   CalibrationRequest 1 ── 1 Quotation
   Quotation 1 ── N PurchaseOrder (API: 1 PO aktif per quotation)
   PurchaseOrder 1 ── N WorkOrder (schema; belum ada kode)
   WorkOrder 1 ── N CalibrationJob
   CalibrationJob N ── 1 WorkOrder (wajib)
   CalibrationJob N ── 1 PurchaseOrderItem (opsional)
   Satu CalibrationJob tidak bisa berasal dari beberapa WorkOrder (workOrderId wajib, singular).

5. Keputusan domain (dipilah)
   5.1 Source document WorkOrder
   Pertanyaan Klasifikasi Evidence
   purchaseOrderId sudah ada?
   LOCKED / EVIDENCED
   Ditambah migrasi 20260823143000_add_purchase_order. Nullable, onDelete: SetNull.
   quotationId masih wajib?
   LOCKED / EVIDENCED
   Sejak init. WO tidak bisa disimpan tanpa quotation.
   WO = snapshot PO atau live relation?
   LOCKED / EVIDENCED (bentuk saat ini)
   Live FK ke Quotation + PO opsional. Tidak ada kolom snapshot harga. Lokasi/jadwal hidup di WO.
   Source untuk data baru = PO APPROVED?
   UNRESOLVED
   Schema masih mengizinkan WO tanpa PO. Kode WO belum ada. Entity catalog/ERD masih menulis “approved quotation before WO” (dokumen stale, bukan kontrak PO terbaru).
   Boleh buat WO tanpa PO?
   UNRESOLVED
   Schema mengizinkan. Kontrak PO terbaru menempatkan WO setelah PO, tetapi tidak mengunci constraint.
   customerApprovedAt / approve Quotation relevan langsung ke WO?
   RECOMMENDED (tidak langsung)
   Sudah dikunci di gerbang PO. WO cukup percaya PO APPROVED. Jangan mengulang cek quotation di WO kecuali source WO tanpa PO dikunci.
   Makna domain purchaseOrderId yang paling jelas dari schema: “WO boleh diikat ke satu PO, tetapi Quotation tetap source of truth relasional yang wajib.” Itu bukan keputusan produk bahwa PO opsional untuk MVP — itu sisa transisi B4.

5.2 Data komersial di WO?
LOCKED / EVIDENCED: header WO tidak menyimpan qty/price/discount/tax/total/currency.

RECOMMENDED: biarkan komersial di PO (yang sudah snapshot dari Quotation). WO cukup referensi PO + alokasi item. Jangan menduplikasi angka ke WO.

UNRESOLVED: apakah perlu snapshot non-komersial tertentu (nama customer, alamat, serviceMode dari CR) vs selalu baca live. customerId dan serviceMode sudah didenormalisasi di WO; serviceMode CR dan WO bisa berbeda karena tidak ada sync.

5.3 Cardinality PurchaseOrder ↔ WorkOrder
Relasi Schema Kode
1 PO → N WO
Ya (PurchaseOrder.workOrders)
Belum ada
1 WO → 1 PO (max)
Ya (FK tunggal nullable)
Belum ada
1 WO dari banyak PO
Tidak mungkin tanpa ubah schema
—
LOCKED / EVIDENCED: satu WO tidak bisa berasal dari lebih dari satu PO.

UNRESOLVED (blocker MVP):

Apakah MVP = 1 PO → 1 WO (seluruh item), atau 1 PO → N WO (split lokasi/jadwal/subset item)?
Schema mendukung N WO dan alokasi subset via PurchaseOrderItem.workOrderId.
Field lokasi ada di WO, tidak di PO — ini mendukung argumen “1 SPK = 1 lokasi”, tetapi itu inferensi desain, bukan aturan ter-enforce.
Partial fulfillment:

Item PO punya OPEN | ALLOCATED | FULFILLED | CANCELLED + workOrderId?.
Header PO di Prisma masih punya RECEIVED | CONFIRMED | FULFILLED (legacy).
API/Zod/Portal PO hanya DRAFT | APPROVED | CANCELLED. Status item selalu OPEN saat create; tidak pernah diubah ke ALLOCATED.
Split qty satu PO item ke banyak SPK: planning lama menandai out of scope. Unique (purchaseOrderId, quotationItemId) + satu workOrderId per item = 1 item ≤ 1 WO.
LOCKED / EVIDENCED: 1 PO item tidak bisa dipecah ke beberapa WO lewat FK yang ada.

UNRESOLVED: apakah create WO wajib mengambil semua item OPEN, atau user memilih subset.

5.4 Hubungan ke item hulu
CalibrationRequestItem (deviceId = free-text, bukan FK Device)
↓ requestItemId
QuotationItem (deviceId? = FK Device opsional)
↓ quotationItemId (unique per PO)
PurchaseOrderItem (deviceId? opsional, workOrderId? opsional)
↓ workOrderId
WorkOrder (tidak punya baris item sendiri)
↓
CalibrationJob (deviceId WAJIB FK Device; purchaseOrderItemId opsional)
LOCKED / EVIDENCED:

Tidak ada WorkOrderItem.
Jejak audit item: CR item → QuotationItem → PurchaseOrderItem → (opsional) WO → CalibrationJob.
CalibrationJob unique (workOrderId, deviceId): satu device, satu job per WO.
UNRESOLVED (blocker untuk boundary WO → Job):

CalibrationJob.deviceId wajib ke master Device.
CalibrationRequestItem.deviceId bukan FK Device (tes: “does not look up Device master”).
QuotationItem.deviceId / PurchaseOrderItem.deviceId opsional.
PO menyalin deviceId dari quotation apa adanya; tidak menjamin Device sudah ada.
Tanpa keputusan “kapan Device master wajib ada”, create job dari WO tidak punya kontrak yang aman.

5.5 Satu CR → beberapa WO?
Jalur ter-enforce hari ini:

1 CR → 1 Quotation → 1 PO aktif → N WO (schema)
Jadi beberapa WO dari satu CR hanya mungkin lewat 1 PO → N WO, bukan lewat beberapa quotation.

UNRESOLVED: apakah N WO per PO diizinkan di MVP (lihat 5.3).

5.6 WorkOrder → CalibrationJob
LOCKED / EVIDENCED:

Job wajib punya workOrderId.
Satu WO → banyak job.
Satu job → tepat satu WO.
Job bukan dokumen bernomor (DocumentType tidak punya job).
purchaseOrderItemId di job opsional (onDelete: SetNull).
Status job: PENDING | IN_PROGRESS | SUBMITTED | REWORK | ACCEPTED_BY_QA. Tidak ada CANCELLED pada job.
UNRESOLVED:

Job dibuat otomatis saat WO dibuat, atau belakangan (modul CalibrationJob terpisah)?
Jika WO di-cancel setelah job ada: tidak ada status cancel job (sudah diketahui di audit lama; tetap gap).
OUT OF SCOPE: MeasurementEntry / MeasurementResult / Certificate / Invoice / Payment.

5.7 Status & transisi MVP
Status yang benar-benar ada: PLANNED, ASSIGNED, IN_PROGRESS, TECHNICALLY_DONE, CLOSED, CANCELLED. Default create = PLANNED.

Usulan DRAFT / APPROVED / COMPLETED:

DRAFT — tidak ada. Jangan ditambah dalam audit ini.
APPROVED — tidak ada di WO (itu status PO/Quotation).
IN_PROGRESS — ada.
COMPLETED — tidak ada; yang mendekati adalah TECHNICALLY_DONE lalu CLOSED.
CANCELLED — ada.
UNRESOLVED:

Semantik TECHNICALLY_DONE vs CLOSED (sudah diangkat di audit lama; belum ada kode/docs yang mengunci).
Apakah ASSIGNED wajib sebelum IN_PROGRESS, atau assignment opsional di MVP.
Apakah PLANNED boleh langsung CANCELLED.
Tidak ada state machine ter-enforce (sama seperti modul lain sebelum diimplementasi).
RECOMMENDED (bukan lock): untuk MVP, pakai enum yang ada; jangan meniru workflow komersial PO (DRAFT→APPROVED). WO adalah dokumen eksekusi. PLANNED ≈ “baru diterbitkan, belum jalan”. Jangan samakan dengan DRAFT PO yang masih bisa diedit field bisnis.

5.8 Trigger bisnis: kapan WO boleh dibuat
Pertanyaan Klasifikasi Evidence
PO approve otomatis buat WO?
LOCKED / EVIDENCED: tidak
purchase-orders.service.ts + tes workOrderCount === 0. Laporan implementasi PO mengunci ini.
Hanya dari PO APPROVED?
UNRESOLVED
Masuk akal setelah kontrak PO, tetapi schema tidak memaksa purchaseOrderId.
Manual vs otomatis?
RECOMMENDED: manual
Approve PO sengaja tidak side-effect WO. Pola CR→Quotation dan Quotation→PO juga manual create.
WO harus ada sebelum CalibrationJob?
LOCKED / EVIDENCED
CalibrationJob.workOrderId NOT NULL.
Quotation approval sebagai prasyarat langsung WO?
UNRESOLVED jika WO tanpa PO masih diizinkan; RECOMMENDED tidak jika source = PO APPROVED.
receivedAt / CONFIRMED / planning “WO dari PO CONFIRMED” adalah legacy desain. Implementasi PO memakai confirmedAt/confirmedByUserId sebagai audit approve, status = APPROVED. Jangan menghidupkan CONFIRMED sebagai gerbang WO.

6. Boundary WorkOrder vs CalibrationJob
   WorkOrder CalibrationJob
   SPK bernomor (SPK/YYYY/MM/NNNNN)
   Internal, tanpa nomor dokumen
   1 customer, lokasi, jadwal, teknisi
   1 device di bawah satu WO
   Status operasional SPK
   Status eksekusi lapangan + QA
   Bukan SoR billing
   Certificate (downstream) yang billable
   RECOMMENDED: modul WO MVP = terbitkan SPK, ikat ke PO, alokasi item, lokasi/jadwal, (opsional) assignment. Jangan memasukkan pengukuran, evidence, signature, certificate.

Assignment ada di schema + permission workOrder:assign. Apakah assignment masuk MVP WO atau menyusul bersama technician PWA: UNRESOLVED (schema siap, produk belum dikunci).

7. Pola backend yang applicable (jangan diimplementasi sekarang)
   Pola CR / Quotation / PO yang harus diikuti jika WO dikerjakan:

Aspek Pola terkunci Applicable untuk WO?
Module + controller + service
Ya
Ya
CompanyRoleGuard + @RequirePermission
Ya
Ya
companyId dari server, bukan body
Ya
Ya
Zod di @medcal/shared
Ya
Ya
DocumentNumberService.allocate dalam transaksi
Ya
Ya (WORK_ORDER sudah terdaftar)
Status transition di service + error code
Ya
Ya, setelah transisi dikunci
List: search/sort/page
Ya
Ya
Tes service dengan Prisma nyata
Ya
Ya
PDF
Quotation + PO punya
UNRESOLVED (kebutuhan bisnis, bukan blocker domain)
Snapshot vs editor
PO tidak mengedit harga
WO tidak boleh jadi editor komersial kedua
Permission catalog sudah ada:

workOrder: read, create, update, cancel, assign
Bandingkan minimum dengan hulu:

CR: read/create/update/cancel
Quotation: + approve
PO: + approve
WO: assign menggantikan approve — cocok dengan enum ASSIGNED, bukan approve komersial.
Seed: ADMIN punya CR/Quotation/PO; tidak punya workOrder:*. CUSTOMER_SERVICE sengaja tidak sampai PO/WO. GET /me tidak mengekspos capability workOrder.

RECOMMENDED nanti: seed ADMIN workOrder:read/create/update/cancel/assign (dan SUPERVISOR jika produk menghendaki dispatcher). Jangan meng-grant ke CUSTOMER_SERVICE tanpa keputusan baru.

8. Document numbering
   LOCKED / EVIDENCED:

Nilai
DocumentType
WORK_ORDER
Prefix
SPK
Table mapping
WorkOrder
Format
SPK/YYYY/MM/NNNNN (UTC)
Unique
(companyId, number)
Tidak perlu konfigurasi numbering baru. Sequence service sudah siap; yang belum adalah pemanggilan dari modul WO.

9. Portal navigation
   Menu Calibration Management saat ini: Customer → Requisition → Quotation → Purchase Order. Tidak ada item Work Order / SPK.

apps/portal tidak berisi route atau string work-order / WorkOrder.

10. Migration history & legacy
    Migrasi Dampak WO
    20260813063336_init_...
    Tabel WO: quotationId wajib, status enum lengkap, assignment, job. Tanpa PO.
    20260823133000_add_document_numbering
    Enum WORK_ORDER
    20260823143000_add_purchase_order
    WorkOrder.purchaseOrderId?; PurchaseOrderItem.workOrderId?; CalibrationJob.purchaseOrderItemId?
    20260827120000_purchase_order_approved_...
    Enum PO APPROVED (bukan perubahan WO)
    Legacy yang tetap di schema (jangan dibersihkan di audit ini):

PurchaseOrderStatus: RECEIVED, CONFIRMED, FULFILLED tidak dipakai API PO.
WorkOrder.quotationId wajib meski PO sudah disisipkan.
WorkOrder.purchaseOrderId nullable + onDelete: SetNull — WO bisa “lepas” dari PO jika PO dihapus (PO sendiri onDelete: Restrict dari quotation; WO yang SetNull).
Entity catalog D09 dan ERD overview stale: masih “Quotation approved before WO”, tanpa PO.
CalibrationRequestStatus.FULFILLED ada di enum/UI tetapi tidak pernah di-set oleh service mana pun. OUT OF SCOPE untuk WO, kecuali nanti dikunci sebagai efek samping close WO.

WorkOrder.companyId bertipe String, sedangkan PurchaseOrder.companyId @db.Char(3). Tidak memblokir, tetapi inkonsisten.

11. Kontrak hulu yang tidak boleh diubah
    Sudah dikunci oleh implementasi PO — WO harus duduk di atas ini:

APPROVED Quotation + customerApprovedAt
→ Create PO (DRAFT, snapshot)
→ APPROVED (confirmedAt / confirmedByUserId)
→ CANCELLED hanya dari DRAFT
Setelah APPROVED, field PO terkunci.
Satu PO aktif per quotation.
Approve PO ≠ create WorkOrder. 12. Keputusan yang harus dikunci sebelum implementasi
Tanpa kelima ini, implementasi akan merancang sambil jalan:

Source dokumen baru
Apakah purchaseOrderId wajib untuk WO baru, dan quotationId hanya diisi dari PO.quotationId? Atau WO tanpa PO tetap sah?

Cardinality MVP
1 PO = 1 WO (seluruh item) vs 1 PO = N WO (subset / lokasi). Schema mendukung yang kedua; produk belum memilih.

Item selection
Wajib semua item OPEN, atau pilih subset + set PurchaseOrderItem.workOrderId + status ALLOCATED?

Device master untuk Job
Kapan Device wajib ada relatif ke WO/Job, mengingat CR memakai deviceId bebas teks dan PO deviceId opsional?

Status machine MVP
Transisi yang diizinkan dari enum yang sudah ada, termasuk arti TECHNICALLY_DONE vs CLOSED, dan apakah assign termasuk MVP.

Keputusan yang tidak perlu dibuka lagi: komersial di PO; numbering SPK; job anak dari WO; 1 job = 1 device = 1 WO; approve PO tidak auto-create WO; jangan menambah DRAFT/APPROVED/COMPLETED ke WO hanya untuk meniru PO.

13. Kesimpulan konkret
    WorkOrder belum siap diimplementasikan sebagai modul MVP.

Yang sudah cukup: kerangka schema, numbering, catalog permission, dan kontrak hulu PO. Yang belum cukup: keputusan apakah SPK adalah turunan wajib dari PO APPROVED, apakah satu PO boleh dipecah jadi beberapa SPK, bagaimana item dan Device masuk ke CalibrationJob, dan status mana yang dipakai di MVP.

Setelah kelima keputusan di bagian 12 dikunci, implementasi bisa mengikuti pola PurchaseOrder (module, guard, Zod, numbering, transaksi, tes) tanpa mengubah CR/Quotation/PO.
