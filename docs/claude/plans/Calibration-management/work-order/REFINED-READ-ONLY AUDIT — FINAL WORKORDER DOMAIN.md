READ-ONLY AUDIT — FINAL WORKORDER DOMAIN & IMPLEMENTATION READINESS

Lakukan SECOND-PASS READ-ONLY AUDIT terhadap domain WorkOrder berdasarkan kondisi repository saat ini.

JANGAN mengubah file apa pun.
JANGAN membuat migration.
JANGAN membuat atau mengubah code.
JANGAN melakukan implementasi WorkOrder.
JANGAN melakukan cleanup/refactor.

Tujuan audit ini hanya satu:

> Memastikan apakah WorkOrder sekarang sudah memiliki baseline MVP yang cukup jelas untuk mulai diimplementasikan, berdasarkan keputusan domain yang sudah LOCKED di bawah ini.

Gunakan repository saat ini sebagai source of truth. Inspect actual Prisma schema, existing backend modules, shared schemas, permissions, seed, migrations, tests, Portal patterns, dan dokumentasi yang relevan.

Lifecycle yang harus diaudit:

CalibrationRequest
↓
Quotation
↓
PurchaseOrder
↓
WorkOrder
↓
CalibrationJob

KEPUTUSAN DOMAIN YANG SUDAH LOCKED — JANGAN DIBUKA KEMBALI

1. SOURCE

WorkOrder hanya boleh dibuat dari:

PurchaseOrder.status = APPROVED

Tidak ada WorkOrder standalone tanpa PurchaseOrder.

PO yang menjadi source harus merupakan PO yang valid/aktif sesuai existing PO contract.

Jangan mengubah contract PurchaseOrder.

---

2. CARDINALITY

Untuk MVP:

1 PurchaseOrder → 1 WorkOrder

Satu PurchaseOrder tidak boleh memiliki lebih dari satu active/current WorkOrder.

Jangan implementasikan:

- 1 PO → multiple WorkOrder
- split PO menjadi beberapa WorkOrder
- multiple WorkOrder untuk subset item
- partial WorkOrder allocation

---

3. ITEM SCOPE

Satu WorkOrder mewakili SELURUH PurchaseOrder.

Semua PurchaseOrderItem masuk ke WorkOrder.

Tidak ada item selection pada saat membuat WorkOrder.

Tidak ada:

- subset item
- split quantity
- partial allocation
- allocation engine

Untuk MVP:

PurchaseOrder
↓
seluruh PurchaseOrderItem
↓
1 WorkOrder

---

4. DEVICE SOURCE

JANGAN menggunakan Device master sebagai business source of truth.

PKM tidak memiliki Device master sebagai sumber bisnis utama.

Device information untuk WorkOrder/CalibrationJob berasal dari:

PurchaseOrderItem.deviceId

Dan `PurchaseOrderItem.deviceId` seharusnya merupakan hasil snapshot dari Quotation yang sebelumnya berasal dari CalibrationRequest.

Expected conceptual chain:

CalibrationRequestItem.deviceId
↓
QuotationItem.deviceId
↓
PurchaseOrderItem.deviceId
↓
WorkOrder / CalibrationJob

IMPORTANT:

Audit actual schema untuk memastikan apakah chain tersebut benar-benar dapat berjalan.

Jika `CalibrationJob.deviceId` saat ini merupakan FK wajib ke `Device`, sementara PKM tidak menggunakan Device master sebagai business source, identifikasi exact schema conflict.

JANGAN:

- membuat Device master prerequisite;
- otomatis membuat Device record;
- mengubah free-text/device reference menjadi Device master;
- membuat workaround diam-diam.

Jika existing FK membuat CalibrationJob tidak dapat menggunakan device dari PurchaseOrderItem secara langsung, tandai sebagai:

BLOCKER

dan jelaskan minimum change yang diperlukan.

Jangan melakukan perubahan tersebut sekarang.

---

5. WORKORDER STATUS

Status vocabulary MVP harus menggunakan:

PLANNED
ASSIGNED
IN_PROGRESS
DONE
CANCELLED

Tidak ada:

- DRAFT
- APPROVED
- TECHNICALLY_DONE
- COMPLETED
- CLOSED

Khusus:

DONE = proses WorkOrder selesai.

DONE adalah terminal state.

CANCELLED = proses WorkOrder dihentikan/dibatalkan.

CANCELLED adalah terminal state.

Tidak ada CLOSED terpisah.

Tidak ada TECHNICALLY_DONE.

Expected lifecycle:

PLANNED
↓
ASSIGNED
↓
IN_PROGRESS
↓
DONE

Cancellation:

PLANNED → CANCELLED
ASSIGNED → CANCELLED
IN_PROGRESS → CANCELLED

Terminal:

DONE → tidak ada transition
CANCELLED → tidak ada transition

Secara khusus:

DONE → CANCELLED = NOT ALLOWED

CANCELLED → apa pun = NOT ALLOWED

Audit actual schema/code untuk memastikan transition mana yang sudah didukung dan mana yang belum.

Jangan mengubah enum/status sekarang.

---

6. CREATION

WorkOrder dibuat secara manual dari PurchaseOrder APPROVED.

JANGAN mengasumsikan PO approval otomatis membuat WorkOrder.

Expected flow:

PurchaseOrder APPROVED
↓
user memilih "Create WorkOrder"
↓
WorkOrder PLANNED

Do not implement automatic WorkOrder creation after PO approval.

---

7. COMMERCIAL DATA

WorkOrder bukan commercial document.

Commercial source tetap:

Quotation
↓
PurchaseOrder snapshot

WorkOrder tidak menjadi tempat renegosiasi.

JANGAN membuat WorkOrder sebagai editor untuk:

- unitPrice
- item discount
- header discount
- taxCode
- taxRate
- taxAmount
- subtotal
- totalAmount
- currency

Audit existing WorkOrder fields untuk memastikan apakah ada commercial duplication yang memang diperlukan oleh schema.

Jika ada, laporkan.

Jangan menghapusnya dalam audit.

---

8. WORKORDER → CALIBRATIONJOB

Audit actual schema dan code untuk menentukan boundary:

1 WorkOrder → N CalibrationJob

dan setiap CalibrationJob:

1 CalibrationJob → 1 WorkOrder

Jangan implementasikan CalibrationJob.

Tentukan apakah CalibrationJob dibuat:

- saat WorkOrder dibuat;
- saat WorkOrder ASSIGNED;
- saat WorkOrder IN_PROGRESS;
- atau melalui action manual.

Jika repository tidak memberikan evidence yang cukup, tandai:

UNRESOLVED

Jangan membuat keputusan hanya berdasarkan asumsi.

---

9. WORKORDER OPERATIONAL DATA

Audit actual WorkOrder fields dan tentukan status evidence untuk:

- serviceMode
- addressText
- geoLat
- geoLng
- locationNotes
- scheduledStart
- scheduledEnd
- assignments
- technician/assignee fields
- notes

Tentukan mana yang sudah jelas sebagai operational data dan mana yang belum.

Jangan menambah field baru.

---

10. ASSIGNMENT

Audit apakah ASSIGNED memang membutuhkan technician/assignee.

Tentukan berdasarkan actual schema/code:

- apakah assignment wajib sebelum IN_PROGRESS;
- apakah satu WorkOrder dapat memiliki satu atau beberapa assignee;
- apakah assignment history sudah tersedia;
- apakah assignment merupakan MVP requirement.

Jika belum cukup jelas:

UNRESOLVED

Jangan invent status atau model assignment baru.

---

11. CANCELLATION

Audit existing schema/code untuk memastikan cancellation behavior.

Locked domain rule:

PLANNED → CANCELLED
ASSIGNED → CANCELLED
IN_PROGRESS → CANCELLED

DONE → CANCELLED = NOT ALLOWED

CANCELLED = terminal

DONE = terminal

Tentukan apakah cancellation membutuhkan:

- reason
- notes
- cancelledAt
- cancelledBy

berdasarkan actual schema/code.

Jika belum ada evidence, tandai UNRESOLVED.

Jangan menambahkan field.

---

12. PO → WO DUPLICATE RULE

Audit cara paling aman untuk enforce:

1 PurchaseOrder → 1 active/current WorkOrder

Perhatikan bahwa:

- WorkOrder CANCELLED adalah historical record;
- jika domain mengizinkan pembuatan ulang WorkOrder setelah cancellation, constraint database tidak boleh secara tidak sengaja mencegahnya.

Jangan langsung menambahkan unique constraint.

Tentukan apakah existing schema sudah cukup atau membutuhkan partial unique index/application guard.

Hanya laporkan rekomendasi.

---

13. DOCUMENT NUMBER

Audit existing DocumentNumberService/configuration.

Periksa apakah WorkOrder sudah memiliki:

DocumentType = WORK_ORDER
Prefix = SPK

Expected format:

SPK/YYYY/MM/NNNNN

Jangan mengubah numbering.

Jika actual repository berbeda, laporkan actual value.

---

14. COMPANY SCOPING

Audit apakah WorkOrder mengikuti pattern:

CompanyRoleGuard
companyId dari authenticated context

`companyId` tidak boleh dipercaya dari client.

Semua WorkOrder lookup/create/update harus company-scoped.

Jangan mengubah authorization.

---

15. PERMISSIONS

Audit existing permission catalog dan seed.

Expected conceptual permissions:

workOrder:read
workOrder:create
workOrder:update
workOrder:cancel
workOrder:assign

Gunakan actual naming dari repository.

Tentukan apakah permission tersebut sudah ada dan apakah cukup untuk MVP.

Jangan mengubah permission.

---

16. BACKEND PATTERN

Bandingkan WorkOrder dengan implementation pattern yang sudah digunakan oleh:

CalibrationRequest
Quotation
PurchaseOrder

Audit apakah WorkOrder nantinya dapat mengikuti pola yang sama untuk:

- module
- controller
- service
- shared Zod schema
- CompanyRoleGuard
- permissions
- transactions
- status transitions
- error handling
- document numbering
- tests

Jangan implementasikan apa pun.

---

17. PORTAL

JANGAN membuat UI.

Hanya audit apakah contract WorkOrder nantinya cukup jelas untuk Portal.

Expected future flow secara konseptual:

PurchaseOrder APPROVED
↓
Create WorkOrder
↓
PLANNED
↓
ASSIGN / START / etc.
↓
DONE

Do not implement this flow.

---

18. MIGRATION HISTORY

Audit existing WorkOrder migrations.

Identifikasi:

- existing legacy statuses;
- legacy fields;
- existing relations;
- existing constraints;
- migration history yang dapat mempengaruhi implementasi.

Jangan cleanup legacy schema dalam audit ini.

---

19. IMPORTANT DISTINCTION

Untuk setiap temuan, gunakan salah satu label:

LOCKED / EVIDENCED
= sudah jelas dari current domain/code/schema

RECOMMENDED
= rekomendasi MVP berdasarkan evidence

UNRESOLVED
= repository belum cukup menjawab

BLOCKER
= menghalangi implementasi WorkOrder secara benar

Jangan mengubah UNRESOLVED menjadi keputusan hanya supaya audit terlihat lengkap.

Jangan membuka kembali keputusan yang sudah LOCKED di atas.

---

20. FINAL VERDICT

Pada akhir audit, berikan satu verdict:

READY FOR IMPLEMENTATION

atau:

NOT READY — DOMAIN DECISIONS REQUIRED

Jika NOT READY:

Tampilkan HANYA true blockers.

Untuk setiap blocker jelaskan:

1. masalah;
2. evidence dari repository;
3. pilihan yang tersedia;
4. rekomendasi MVP paling sederhana;
5. apakah berdampak ke schema, backend, atau UI.

Jangan memasukkan enhancement atau future features sebagai blocker.

---

21. FINAL PROPOSED MVP CONTRACT

Jika evidence sudah cukup, berikan proposed WorkOrder MVP contract secara ringkas:

Source
Cardinality
Creation trigger
Item scope
Device source
Snapshot/reference behavior
Status
Allowed transitions
Terminal states
Editable fields
Locked fields
Cancellation rule
Assignment
WorkOrder → CalibrationJob relationship
Permissions
Document numbering

Contract harus konsisten dengan keputusan yang sudah LOCKED.

Jangan implementasi.

Jangan membuat migration.

Jangan mengubah file apa pun.

READ-ONLY AUDIT ONLY.
