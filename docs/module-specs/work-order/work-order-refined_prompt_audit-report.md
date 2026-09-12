Rantai device dan enum status sudah saya cocokkan dengan kontrak yang dikunci. Berikut second-pass audit — keputusan domain di prompt tidak dibuka kembali.

Second-pass audit — WorkOrder MVP readiness
Mode: read-only. Tidak ada perubahan file.
Source of truth: repository saat ini. Keputusan domain di prompt refine diperlakukan sebagai LOCKED dan tidak diuji ulang.

Verdict
READY FOR IMPLEMENTATION
Keputusan yang di audit pertama masih UNRESOLVED (source, cardinality, item scope, creation, commercial, vocabulary status) sudah dikunci. Modul WorkOrder dokumen (create dari PO APPROVED, 1∶1, seluruh item, status, assign, cancel) bisa mulai dikerjakan mengikuti pola PurchaseOrder.

Satu konflik schema bukan penghalang start WO, tetapi BLOCKER untuk CalibrationJob nanti. Jangan membuat job di dalam implementasi WO.

1. Source — LOCKED (domain) vs schema
   Domain (jangan dibuka): WO hanya dari PurchaseOrder.status = APPROVED. Tidak ada WO tanpa PO.

Fakta repository Label
WorkOrder.purchaseOrderId ada, nullable, onDelete: SetNull
LOCKED / EVIDENCED (sisa B4)
WorkOrder.quotationId wajib
LOCKED / EVIDENCED
Approve PO tidak membuat WO (workOrderCount === 0)
LOCKED / EVIDENCED — selaras keputusan creation
Schema masih mengizinkan WO tanpa PO
gap enforce, bukan keputusan domain baru
RECOMMENDED (implementasi, bukan reopen): service menolak create kecuali PO APPROVED, purchaseOrderId wajib diisi, quotationId dan customerId disalin dari PO. Jangan mengulang cek customerApprovedAt — itu sudah gerbang PO.

PO contract tidak boleh diubah.

2. Cardinality — LOCKED (domain) vs schema
   Domain: 1 PO → 1 WO aktif. Tidak ada split / subset / partial allocation.

Schema: PurchaseOrder.workOrders = 1∶N. Satu WO tidak bisa punya banyak PO (FK tunggal).

Tidak ada unique (purchaseOrderId) pada WO.

RECOMMENDED: jaga di aplikasi, pola yang sama dengan “1 PO aktif per quotation”:

Create ditolak jika sudah ada WO dengan purchaseOrderId itu dan status ≠ CANCELLED.
WO CANCELLED = histori; PO yang sama boleh dapat WO baru.
Jangan unique biasa di purchaseOrderId (itu memblokir recreate setelah cancel).
Partial unique index (purchaseOrderId WHERE status not cancelled) opsional nanti; bukan syarat start.
PurchaseOrderItem.workOrderId + status ALLOCATED adalah sisa desain alokasi parsial. Jangan dipakai sebagai engine subset di MVP.

3. Item scope — LOCKED (domain)
   Tidak ada WorkOrderItem. Item hidup di PurchaseOrderItem.

RECOMMENDED: WO = seluruh item PO lewat purchaseOrderId. Tidak ada UI pilih item. Tidak wajib menulis PurchaseOrderItem.workOrderId (itu berbau allocation). Baca item dari PO.

4. Device source — BLOCKER (untuk CalibrationJob, bukan untuk start WO)
   Domain (jangan dibuka): bukan Device master. Identitas bisnis dari rantai CR → Quotation → PO.

Rantai yang diharapkan prompt:

CalibrationRequestItem.deviceId (free-text)
↓
QuotationItem.deviceId
↓
PurchaseOrderItem.deviceId
↓
WorkOrder / CalibrationJob
Rantai aktual — rantai itu tidak berjalan:

Kolom Arti aktual
CalibrationRequestItem.deviceId
Free-text. Bukan FK Device. Komentar schema + tes: “does not look up Device master”.
QuotationItem.deviceId
FK opsional ke master Device. Portal create quotation tidak mengirim deviceId — hanya requestItemId.
Jejak bisnis di UI/PDF
quotationItem.requestItem.deviceId (free-text CR), bukan QuotationItem.deviceId
PurchaseOrderItem.deviceId
Salinan QuotationItem.deviceId (FK Device, biasanya null), bukan snapshot free-text CR
CalibrationJob.deviceId
Wajib FK ke Device
Unique job
(workOrderId, deviceId) = unique per Device master, bukan per identifier bisnis

schema.prisma
Lines 1075-1076
/// Customer-provided physical device identifier (free-text). Not a FK to Device.
deviceId String

schema.prisma
Lines 1283-1305
model CalibrationJob {
...
deviceId String
device Device @relation(...)
@@unique([workOrderId, deviceId])
}
BLOCKER (CalibrationJob): job tidak bisa memakai identifier bisnis dari PO/CR. PurchaseOrderItem.deviceId bukan free-text CR. Memaksa Device master, auto-create Device, atau diam-diam mengisi FK = dilarang oleh keputusan 4.

Minimum change nanti (jangan dikerjakan sekarang):

Jangan pakai CalibrationJob.deviceId → Device sebagai SoR bisnis.
SoR baris kerja = CalibrationJob.purchaseOrderItemId (wajib), identifier dibaca PO item → quotationItem → requestItem.deviceId.
CalibrationJob.deviceId (FK Device) dijadikan opsional atau dilepas; unique diganti ke (workOrderId, purchaseOrderItemId).
Untuk modul WO sekarang: tampilkan device seperti PDF PO: join ke requestItem.deviceId. Jangan buat CalibrationJob.

Ini bukan blocker start WO dokumen. Ini blocker modul Job berikutnya.

5. Status — domain LOCKED vs enum aktual
   Domain MVP:

PLANNED → ASSIGNED → IN_PROGRESS → DONE
PLANNED | ASSIGNED | IN_PROGRESS → CANCELLED
DONE = terminal (termasuk DONE → CANCELLED dilarang)
CANCELLED = terminal
Tidak ada DRAFT, APPROVED, TECHNICALLY_DONE, COMPLETED, CLOSED.

Enum Prisma (sejak init, tidak pernah diubah):

PLANNED | ASSIGNED | IN_PROGRESS | TECHNICALLY_DONE | CLOSED | CANCELLED
DONE tidak ada. Tidak ada kode transisi WO.

Status domain Di schema?
PLANNED, ASSIGNED, IN_PROGRESS, CANCELLED
Ya
DONE
Tidak
TECHNICALLY_DONE, CLOSED
Ada, legacy — jangan dipakai API MVP
RECOMMENDED (langkah pertama implementasi, seperti PO menambah APPROVED): migrasi ADD VALUE 'DONE'. API/Zod hanya PLANNED | ASSIGNED | IN_PROGRESS | DONE | CANCELLED. Biarkan TECHNICALLY_DONE / CLOSED di DB; jangan cleanup.

Bukan keputusan domain baru. Bukan alasan menunda start.

6. Creation — LOCKED / EVIDENCED
   Selaras keputusan: user “Create WorkOrder” dari PO APPROVED → WO PLANNED. Bukan side-effect approve PO.

Pola Portal yang sudah ada: tombol Create PO di quotation APPROVED.

7. Commercial data — LOCKED / EVIDENCED
   Header WO tidak punya qty, price, discount, tax, subtotal, total, currency. Tidak ada duplikasi komersial yang perlu dihapus.

customerId didenormalisasi (seperti PO). Bukan editor harga.

8. WorkOrder → CalibrationJob
   LOCKED / EVIDENCED: 1 WO → N Job; 1 Job → 1 WO (workOrderId wajib).

UNRESOLVED: kapan job dibuat (create WO / ASSIGNED / IN_PROGRESS / manual). Tidak ada kode.

RECOMMENDED untuk slice WO: jangan buat job. Boundary cukup: job nanti anak WO; device/job menunggu perbaikan schema di atas.

9. Data operasional
   Field Schema Evidence
   serviceMode
   wajib
   Ada. PO tidak punya; CR punya. RECOMMENDED: salin dari CR via PO.quotation.request saat create; boleh diedit selama bukan terminal.
   addressText, geoLat, geoLng, locationNotes
   opsional
   Ada, tidak dipakai kode. Operational.
   scheduledStart, scheduledEnd
   opsional
   Ada, tidak dipakai kode. Operational.
   notes
   tidak ada
   UNRESOLVED. Jangan menambah field. Cancel PO/CR juga tanpa reason.
   Assignment
   WorkOrderAssignment[]
   Ada.
   Tidak ada cancelledAt / cancelledBy / reason di WO.

10. Assignment
    LOCKED / EVIDENCED: model WorkOrderAssignment (N teknisi, LEAD/ASSIST, unique per user). Catalog punya workOrder:assign. Status ASSIGNED ada di enum dan di jalur domain.

RECOMMENDED MVP: aksi assign memakai model yang ada; masuk ASSIGNED jika ada ≥1 assignment. Beberapa assignee diizinkan schema.

UNRESOLVED: tidak ada tabel history assignment (hanya createdAt). Jangan invent model baru.

Jalur domain sudah PLANNED → ASSIGNED → IN_PROGRESS — jangan skip ASSIGNED.

11. Cancellation
    Tidak ada kode WO. Field audit cancel tidak ada.

RECOMMENDED: seperti PO — POST :id/cancel mengubah status saja. Tanpa reason/cancelledAt sampai ada evidence.

Aturan domain (PLANNED/ASSIGNED/IN_PROGRESS → CANCELLED; DONE tidak boleh) di-enforce di service.

12. Duplicate 1 PO → 1 WO aktif
    RECOMMENDED: guard aplikasi (lihat §2). Bukan unique constraint keras.

13. Document numbering — LOCKED / EVIDENCED
    Nilai aktual
    DocumentType
    WORK_ORDER
    Prefix
    SPK
    Format
    SPK/YYYY/MM/NNNNN (UTC)
    Table
    WorkOrder
    Unique
    (companyId, number)
    Tidak perlu konfigurasi baru.

14. Company scoping
    Modul WO belum ada. Pola CR/Quotation/PO: CompanyRoleGuard, companyId dari COMPANY_ID + membership, @CompanyId(), lookup where: { id, companyId }.

RECOMMENDED: ikuti pola itu. WorkOrder.companyId = String; PO memakai @db.Char(3). Tidak memblokir.

15. Permissions
    Catalog aktual:

workOrder: read, create, update, cancel, assign
Cukup untuk MVP yang dikunci. Seed ADMIN belum meng-grant (hanya SUPERADMIN bypass). MeCapabilities dan menu belum ada.

Itu pekerjaan implementasi (seperti PO), bukan keputusan domain.

16. Pola backend — applicable
    Sama dengan PurchaseOrder: module, controller, Zod @medcal/shared, guard, transaksi + DocumentNumberService.allocate, transisi status + code error, tes Prisma.

PDF WO: tidak diminta kontrak; jangan jadi blocker.

17. Portal
    Belum ada menu/route. Kontrak cukup untuk UI:

PO APPROVED → Create WorkOrder → PLANNED
→ Assign → ASSIGNED → Start → IN_PROGRESS → Done
→ Cancel (kecuali DONE)
Jangan buat UI di audit ini.

18. Migration history (legacy, jangan dibersihkan)
    Migrasi Isi
    20260813063336_init_...
    WO + quotationId wajib; enum termasuk TECHNICALLY_DONE, CLOSED; assignment; job + FK Device
    20260823133000_add_document_numbering
    WORK_ORDER
    20260823143000_add_purchase_order
    purchaseOrderId?; PurchaseOrderItem.workOrderId?; CalibrationJob.purchaseOrderItemId?
    Legacy: quotationId wajib; purchaseOrderId nullable; status TECHNICALLY_DONE/CLOSED; item workOrderId untuk alokasi; PurchaseOrderStatus RECEIVED/CONFIRMED/FULFILLED (tidak dipakai API PO).

True blockers (hanya yang menghalangi implementasi yang benar)
Tidak ada blocker yang menahan start modul WorkOrder dokumen.

Satu blocker untuk slice berikutnya (CalibrationJob):

Masalah
Identifier perangkat bisnis = free-text CR; CalibrationJob.deviceId wajib ke master Device; PurchaseOrderItem.deviceId adalah FK Device (biasanya null), bukan snapshot CR.
Evidence
Schema + tes CR + Portal quotation tidak mengirim deviceId Device + PDF memakai requestItem.deviceId.
Pilihan
(a) Job SoR = purchaseOrderItemId, baca free-text via join; longgarkan/hapus FK Device; (b) langgar keputusan 4 (Device master) — dilarang; (c) auto-create Device — dilarang.
Rekomendasi
(a), saat modul Job, bukan sekarang.
Dampak
Schema (+ unique job). Bukan UI WO. Bukan create SPK.
Status DONE dan purchaseOrderId wajib = pekerjaan implementasi (migrasi/guard), analog PurchaseOrderStatus.APPROVED.

Proposed WorkOrder MVP contract
Kontrak
Source
Hanya PO APPROVED (aktif). quotationId/customerId dari PO.
Cardinality
1 PO → 1 WO dengan status ≠ CANCELLED. Setelah CANCELLED, PO boleh dapat WO baru.
Creation
Manual. Bukan otomatis dari approve PO. Create → PLANNED.
Item scope
Seluruh PurchaseOrderItem. Tanpa selection.
Device (tampilan WO)
Join item.quotationItem.requestItem.deviceId (+ deviceType). Bukan master Device.
Device (Job)
Di luar slice ini. Lihat BLOCKER di atas.
Snapshot vs live
Live FK ke PO (+ quotation wajib di schema). Operasional (serviceMode, lokasi, jadwal) di WO. Komersial tetap di PO.
Status API
PLANNED, ASSIGNED, IN_PROGRESS, DONE, CANCELLED
Transisi
PLANNED→ASSIGNED→IN_PROGRESS→DONE; PLANNED|ASSIGNED|IN_PROGRESS→CANCELLED
Terminal
DONE, CANCELLED. DONE→CANCELLED dilarang.
Editable (non-terminal)
serviceMode, lokasi, jadwal, assignment. Bukan field harga.
Locked
Sumber PO, angka komersial, item set.
Cancel
Status only; tanpa reason/cancelledAt (belum ada di schema).
Assignment
WorkOrderAssignment; wajib untuk ASSIGNED; 1..N teknisi.
WO → Job
1∶N di schema; jangan dibuat di modul WO.
Permissions
workOrder:read/create/update/cancel/assign
Numbering
SPK/YYYY/MM/NNNNN
Slice implementasi yang masuk akal: schema DONE + guard 1∶1 + API/Portal SPK. Bukan CalibrationJob. Bukan allocation engine. Bukan Device master.
