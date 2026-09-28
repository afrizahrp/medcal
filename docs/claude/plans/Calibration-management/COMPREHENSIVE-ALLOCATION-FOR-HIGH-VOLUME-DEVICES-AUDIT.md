# AUDIT BRIEF
## Target Operational Execution Architecture — High-Volume PO

### Status
**AUDIT ONLY — DO NOT IMPLEMENT**

---

## 1. CONTEXT

Medcal saat ini memiliki workflow Calibration yang sudah berjalan secara nyata.

Trial RS Minto Hardjo digunakan sebagai concrete high-volume scenario:

- 1 PO
- 56 PO items
- 406 total devices
- real CalibrationRequest → Quotation → PO → WorkOrder → CalibrationJobs
- real technician execution
- real BAI / equipment identification workflow
- real Identity Correction workflow
- real measurement workflow
- real QA/review workflow

Current architecture secara intentional membatasi satu active WorkOrder untuk satu PO.

Kebutuhan operational scale menunjukkan bahwa satu PO dapat membutuhkan beberapa operational workload/WOL/SPK yang dikerjakan secara paralel.

Contoh target scenario:

```text
PO RS Minto Hardjo
406 devices

        PO
         │
    operational
      planning
         │
   ┌─────┼─────┬─────┐
   │     │     │     │
 WOL-01 WOL-02 WOL-03 WOL-04
   │     │     │     │
  MT   Tech A Tech B Tech C

Pembagian di atas hanya contoh untuk menjelaskan kebutuhan.

Jangan mengasumsikan bahwa struktur tersebut adalah target design.

Audit harus menentukan bagaimana architecture yang tepat seharusnya dibentuk berdasarkan codebase existing dan requirement di bawah.

2. AUDIT OBJECTIVE

Audit secara komprehensif bagaimana Medcal dapat mendukung:

Satu PO dengan jumlah device besar dapat dikerjakan melalui beberapa operational workload secara paralel, sementara PO tetap menjadi commercial/customer-facing aggregate dan seluruh mandatory calibration control tetap berjalan.

Audit harus menjawab:

Bagaimana workload PO seharusnya dibagi?
Apa unit/domain boundary yang tepat?
Bagaimana satu PO dapat menghasilkan beberapa WOL/SPK jika memang diperlukan?
Bagaimana technician assignment bekerja?
Bagaimana CalibrationJob tetap memiliki ownership yang jelas?
Bagaimana measurement completion menjadi gate sebelum review?
Bagaimana QA/review tetap mandatory?
Bagaimana PO-level progress dihitung?
Bagaimana customer melihat progress PO?
Bagaimana architecture tetap scalable untuk 1.000–4.000+ jobs?
3. IMPORTANT WORKFLOW CONSTRAINTS

Pertahankan behavior existing berikut kecuali audit menemukan alasan architecture yang kuat untuk mengubahnya.

BAI / Identity / Equipment

BAI, Identity Correction, dan identifikasi alat/reference yang digunakan untuk kalibrasi tetap merupakan mandatory workflow.

Namun:

approval tersebut bukan blocker untuk technician mulai mengerjakan calibration job.

Jangan mendesain sistem yang menunggu reviewer tersedia sebelum technician dapat bekerja.

Measurement Completion

Ini adalah execution gate utama.

Satu CalibrationJob hanya dapat dikirim untuk review apabila:

seluruh measurement point yang diwajibkan untuk job tersebut telah selesai.

Contoh:

CalibrationJob
├── Point 1 ✓
├── Point 2 ✓
├── Point 3 ✓
├── Point 4 ✗
└── Point 5 ✓

Job belum dapat submit untuk review.

Setelah seluruh point selesai:

All measurement points complete
            ↓
      Submit for Review
            ↓
          QA
            ↓
      Accept / Reject

Audit harus memverifikasi bagaimana invariant ini saat ini diterapkan.

QA

QA/review tetap mandatory.

Namun QA adalah downstream stage dari execution.

Technician dapat mengerjakan banyak job secara paralel tanpa harus menunggu QA tersedia.

Contoh:

406 jobs
   ↓
260 jobs measurement complete
   ↓
260 jobs masuk review queue
   ↓
QA memproses sesuai kapasitas

Jangan menjadikan QA availability sebagai prerequisite untuk memulai execution.

4. CURRENT ARCHITECTURE AUDIT

Trace implementation aktual pada:

PurchaseOrder
PurchaseOrderItem
WorkOrder
WorkOrderItem
CalibrationJob
technician assignment
calibration measurement
BAI
Identity Correction
equipment/reference identification
QA/review
Certificate
EquipmentDeliveryNote / DLN
document numbering
progress calculation
customer-facing progress, jika sudah tersedia

Untuk setiap bagian identifikasi:

current data model
relationship
database constraint/invariant
service behavior
API behavior
UI behavior
dependency terhadap WorkOrder
compatibility dengan multi-workload PO

Jangan menyimpulkan hanya dari nama model.
Trace implementation aktual.

5. OPERATIONAL WORKLOAD / ALLOCATION

Audit bagaimana PO dengan banyak device seharusnya dibagi menjadi workload operasional.

Jangan mengasumsikan harus menggunakan entity bernama Allocation.

Evaluasi secara netral apakah kebutuhan tersebut lebih tepat direpresentasikan dengan:

existing WorkOrder;
entity allocation/planning baru;
extension terhadap existing model;
atau model lain.

Audit harus menentukan domain boundary yang paling tepat, bukan sekadar membuat entity baru.

Harus dapat menjawab:

apa yang sebenarnya dibagi?
PO item?
quantity?
individual device/unit?
workload?
kombinasi beberapa item?
kapan pembagian terjadi?
apakah pembagian dapat disimpan sebagai draft?
kapan menjadi operational commitment?
bagaimana remaining/unallocated work direpresentasikan?
bagaimana mencegah over-allocation?
bagaimana mencegah duplicate ownership?
bagaimana perubahan pembagian ditangani?

Gunakan Minto Hardjo 406 devices sebagai concrete test case.

6. WORKORDER / WOL / SPK

Audit current assumption:

1 PO → 1 active WorkOrder

Tentukan apa yang harus berubah jika:

1 PO → N operational WorkOrders

Analisis:

WorkOrder relationship terhadap PO
WorkOrderItem
quantity
CalibrationJob ownership
technician assignment
lifecycle
completion
cancellation
replacement
revision
reapproval
fan-out

Secara khusus pastikan apakah workload dapat dibentuk sebelum CalibrationJob dibuat, sehingga tidak diperlukan pemindahan job setelah fan-out.

7. TECHNICIAN EXECUTION

Audit apakah WorkOrder dapat menjadi operational execution boundary.

Contoh:

WOL-01 → Technician A
WOL-02 → Technician B
WOL-03 → Technician C

Tentukan:

apakah existing assignment model cukup;
apakah satu workload dapat memiliki beberapa technician;
bagaimana technician melihat workload;
bagaimana workload dipantau Management;
apakah perlu perubahan assignment model.

Jangan melakukan audit RBAC umum.

Hanya bahas access scope yang diperlukan agar actor dapat melihat dan menjalankan workload yang menjadi tanggung jawabnya.

8. PO PROGRESS

PO tetap menjadi aggregate.

Audit bagaimana progress PO seharusnya dihitung apabila terdapat banyak operational workload.

Gunakan contoh:

PO = 406

WOL A = 110
WOL B = 100
WOL C = 96
WOL D = 100

Progress harus dapat merepresentasikan setidaknya perbedaan antara:

belum dikerjakan;
sedang dikerjakan;
measurement complete;
submitted for review;
QA accepted;
certificate available;
final completed.

Tentukan:

source of truth;
aggregation mechanism;
query/performance implications;
apakah progress dapat dihitung tanpa loading seluruh CalibrationJobs.
9. CUSTOMER-FACING PROGRESS

Ini requirement utama.

Customer tetap melihat satu PO, walaupun secara internal PO memiliki banyak workload/WOL.

Customer-facing experience harus berorientasi pada:

Customer
   ↓
PO
   ↓
Overall Progress
   ↓
Device/Job Detail (jika applicable)
   ↓
Certificate / Result

Customer tidak perlu memahami internal:

technician allocation;
workload distribution;
internal QA assignment;
internal WOL structure,

kecuali existing product requirement menunjukkan sebaliknya.

Audit harus menentukan:

apa yang menjadi customer-facing source of truth;
bagaimana internal states dipetakan ke customer-facing states;
bagaimana partial completion ditampilkan;
bagaimana QA/review mempengaruhi customer progress;
bagaimana certificate availability mempengaruhi progress;
kapan PO dianggap selesai dari perspektif customer.
10. NUMBERING

Audit implementasi aktual document numbering.

Jangan berasumsi bahwa sequence 3 digit bermasalah.

Tentukan:

scope sequence;
uniqueness;
reset behavior;
year/company/document-type scope;
maximum sequence;
relationship antara PO dan WOL/SPK.

Evaluasi apakah hierarchy sebaiknya direpresentasikan melalui database relationship daripada encoded document number.

11. DLN

Audit current EquipmentDeliveryNote.

Pastikan definisi domainnya berdasarkan implementation aktual.

Tentukan apakah current DLN:

merupakan outbound reference/equipment document;
merupakan customer result/return document;
atau memiliki fungsi lain.

Kemudian analisis dampaknya jika satu PO memiliki beberapa WOL.

Jangan mencampurkan DLN equipment dengan hypothetical customer result document.

12. REVISION / CANCELLATION / REALLOCATION

Audit lifecycle setelah workload dibuat.

Minimal:

Before execution
allocation/planning revision
quantity change
technician reassignment
After WOL creation
cancellation
replacement
partial completion
After execution
rework
QA rejection
reapproval

Tentukan apakah CalibrationJob perlu dipindahkan antar workload.

Jika bisa dihindari, jelaskan bagaimana architecture mencegah kebutuhan tersebut.

13. SCALABILITY

Gunakan scenario:

Minto Hardjo = 406 jobs
future hospital = 1.000+ jobs
multi-hospital scenario = 4.000+ jobs

Audit:

PO detail queries
WorkOrder queries
CalibrationJob queries
progress aggregation
fan-out
QA queue
customer progress
pagination
eager loading
N+1
transaction size
bulk operations

Audit sebelumnya menemukan potential scalability issues.

Validasi kembali apakah issue tersebut tetap relevan dalam target architecture.

14. TARGET ARCHITECTURE

Setelah memahami current architecture dan requirement, buat target architecture yang evidence-based.

Jangan mulai dari schema.

Mulai dari:

Commercial PO
      ↓
Operational Planning
      ↓
Operational Workload
      ↓
Technician Execution
      ↓
Measurement Completion
      ↓
QA
      ↓
Certificate
      ↓
PO Completion
      ↓
Customer Progress

Kemudian tentukan domain/entity relationship yang diperlukan.

15. REQUIRED INVARIANTS

Identifikasi invariant yang harus dipertahankan.

Minimal evaluasi:

PO quantity tidak boleh teralokasi lebih dari quantity yang dipesan.
Satu CalibrationJob tidak boleh memiliki multiple operational owners.
Measurement point harus complete sebelum job dapat submit untuk review.
Mandatory BAI/Identity/equipment workflow tidak boleh dibypass.
QA tetap mandatory.
PO tidak boleh complete sebelum seluruh required downstream process selesai.
Customer progress harus konsisten dengan source of truth internal.

Tambahkan invariant lain yang ditemukan dari codebase.

16. MANDATORY Minto Hardjo WALKTHROUGH

Audit harus memberikan walkthrough konkret:

PO Minto Hardjo
406 devices
56 items

Tunjukkan secara konseptual:

PO approved
operational planning
workload distribution
technician assignment
job creation/fan-out
technician execution
measurement completion
submit for review
QA
certificate
PO progress
customer-facing progress
final PO completion

Gunakan angka konkret.

Tidak perlu memaksakan angka pembagian tertentu jika audit menemukan pembagian tersebut tidak merepresentasikan target architecture.

17. AUDIT OUTPUT

WAJIB menghasilkan:

docs/audits/target-operational-execution-architecture-audit.md

Report minimal:

Executive Summary
Current Architecture
Existing Constraints
Requirements & Invariants
Operational Workload Analysis
WOL/SPK Architecture
Technician Execution
Measurement Completion Gate
QA/Review Flow
PO Progress
Customer-facing Progress
Numbering
DLN
Revision/Cancellation/Reallocation
Scalability
Target Architecture
Data Model Impact
Service/API Impact
UI/UX Impact
Migration/Compatibility Considerations
Open Questions
Implementation Phases
Minto Hardjo 406-unit Walkthrough
Final Architecture Diagram

Setiap kesimpulan penting harus dapat ditelusuri ke:

file;
model;
service;
API;
UI;
database constraint;
atau code location

yang menjadi evidence.

18. IMPORTANT
DO NOT IMPLEMENT.

Jangan:

modify schema;
modify migration;
modify API;
modify service;
modify UI;
modify production code;
membuat mock workflow;
membuat fake data;
bypass mandatory approval;
bypass QA;
membuat bulk approval hanya untuk mempercepat trial;
mengunci desain pada entity Allocation sebelum audit selesai.

Audit terlebih dahulu.

Jika evidence codebase tidak cukup untuk menentukan sesuatu:

tandai sebagai OPEN QUESTION.

Jangan mengarang asumsi.

FINAL AUDIT QUESTION

Jawab secara eksplisit:

Bagaimana Medcal dapat mendukung satu high-volume PO yang dikerjakan melalui beberapa operational workloads secara paralel, tanpa kehilangan control atas measurement completeness, mandatory BAI/Identity/equipment workflow, QA, certificate, PO-level progress, dan customer-facing progress?

Dan secara khusus:

Apa perubahan architecture minimum yang diperlukan agar model tersebut scalable untuk scenario 406 → 1.000 → 4.000+ CalibrationJobs?

Sekali lagi:

AUDIT ONLY. DO NOT IMPLEMENT.


Ini lebih tepat untuk tahap sekarang karena **Claude Code diberi problem space dan constraint, bukan solusi yang sudah kita pilih**.

Setelah report keluar, baru kita lihat apakah hasil audit mengarah ke `Allocation` sebag