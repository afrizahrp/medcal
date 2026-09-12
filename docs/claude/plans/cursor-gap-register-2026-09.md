# MedCal — System-Wide Gap Audit

**Tanggal Audit:** 12 September 2026  
**Metode:** Read-only repository analysis — kode, skema, test, konfigurasi  
**Sumber:** Repository `d:\medcal` (monorepo), Prisma schema, 98 test files, 7 PDF generators, semua module NestJS

---

## 1. Executive Summary

### Overall System Maturity

MedCal adalah sistem kalibrasi medis yang sudah matang secara arsitektur dan relatif maju secara implementasi. Rantai operasional inti (Requisition → Quotation → PO → Work Order → Calibration Job → Kontrol Alat → QA Review) sudah terimplementasi end-to-end dengan business rules yang enforced di backend. State machine untuk CalibrationJob adalah yang paling solid, termasuk gate Kontrol Alat untuk SEND_TO_LAB.

### Major Strengths

1. **Domain model solid** — 72 model Prisma mencerminkan real-world process dengan baik; relasi, lifecycle, dan cardinality umumnya benar
2. **Gate Kontrol Alat diimplementasi dengan benar** — `workExecuted === true` + dua signature (ADMINISTRATION + TECHNICAL_OFFICER) sebagai hard gate sebelum `CalibrationJob.start()` untuk SEND_TO_LAB
3. **Document numbering terpusat dan atomic** — `DocumentNumberService` menggunakan Postgres upsert `ON CONFLICT DO UPDATE RETURNING` per transaction; prefix sudah benar (KAL, WOL, SPK, dll.)
4. **Security baseline baik** — company isolation via env `COMPANY_ID`, semua endpoint bisnis di-guard, tidak ada cross-company leak untuk data transactional
5. **Test coverage kuat untuk domain kalibrasi** — state machine CalibrationJob, Kontrol Alat gate, rework cycle, concurrent numbering semuanya diuji
6. **PDF generation sudah ada** untuk semua dokumen operasional utama (SPK, WOL, DLN, BAI, Kontrol Alat, Quotation, PO)

### Major Weaknesses

1. **Certificate module tidak ada** — model DB siap tapi zero API/UI/issuance flow; end-to-end chain tidak komplit
2. **Billing module tidak ada** — Invoice/Payment/CreditNote hanya schema; PKM tidak bisa tagih via sistem
3. **WorkOrder.done() tidak memverifikasi job completion** — WO bisa DONE dengan jobs masih PENDING
4. **submitForReview() tanpa completeness gate** — teknisi bisa submit job tanpa measurement apapun
5. **tech-pwa belum di production Docker Compose** — teknisi tidak bisa deploy PWA ke production
6. **Historical calibration data: tidak ada import strategy** — hanya Excel import untuk requisition baru
7. **Customer portal adalah skeleton** — customers tidak bisa melihat status pekerjaan atau sertifikat

### Jumlah Temuan

| Priority | Count |
|----------|-------|
| P0 — Blocker | **0** |
| P1 — High | **9** |
| P2 — Medium | **14** |
| P3 — Low/Future | **12** |

### Production Readiness Assessment

Sistem **sudah bisa dioperasikan** untuk alur utama (from Requisition to QA Approved). Namun sistem **belum lengkap** untuk PKM yang ingin fully digital — certificate issuance, billing, dan customer portal masih manual atau tidak ada. Tech-PWA untuk teknisi juga belum bisa di-deploy ke production.

**Verdict: READY WITH P1 FIXES** (khususnya P1-01 dan P1-04 sebagai prerequisite production deployment)

---

## 2. Business Process Coverage

| # | Process | Status | Gap | Priority |
|---|---------|--------|-----|----------|
| 1 | Customer Management | 🟢 Complete | — | — |
| 2 | Device Master (catalog, type, alias, model, capability, parameter) | 🟢 Complete | — | — |
| 3 | Physical Check Item Catalog | 🟢 Complete | 251 items, 45 device types seeded | — |
| 4 | Calibration Parameter Catalog | 🟢 Complete | ~242 params, test points seeded | — |
| 5 | Service Tariff & Price List | 🟢 Complete | — | — |
| 6 | Requisition (Calibration Request) | 🟢 Complete | Excel import tersedia | — |
| 7 | Quotation | 🟡 Partial | EXPIRED tidak diimplementasi; approve bisa dari DRAFT | P2 |
| 8 | Purchase Order | 🟡 Partial | RECEIVED/CONFIRMED/FULFILLED dead enum; hanya DRAFT/APPROVED/CANCELLED di API | P2 |
| 9 | Work Order (General) | 🟡 Partial | done() tidak cek job completion | P1 |
| 10 | SPK (ON_SITE WO) | 🟢 Complete | PDF mencetak nomor SPK | — |
| 11 | WOL (SEND_TO_LAB WO) | 🟡 Partial | PDF **tidak mencetak** nomor WOL di body | P1 |
| 12 | Surat Jalan Alat (DLN) | 🟢 Complete | Snapshot-based, immutable | — |
| 13 | Calibration Job Lifecycle | 🟢 Complete | Semua transisi enforced | — |
| 14 | Kontrol Alat (In Lab intake) | 🟢 Complete | Gate benar, 1:1 per job, PDF F.MU.08 dengan KAL/... | — |
| 15 | Physical Inspection | 🟢 Complete | Input di tech-pwa, view di portal | — |
| 16 | Measurement / Calibration Result | 🟡 Partial | submitForReview() tanpa completeness gate | P1 |
| 17 | Quality Review / MT Approval | 🟡 Partial | Tidak ada dedicated MT inbox; APPROVE tidak auto-advance ke ACCEPTED_BY_QA | P2 |
| 18 | Certificate Issuance | 🔴 Missing/Broken | Model ada; zero API/UI/lifecycle; no. sertifikat manual free-text | P1 |
| 19 | Document Numbering (centralized) | 🟢 Complete | Atomic, transactional, prefix benar | — |
| 20 | Users / Membership / RBAC | 🟢 Complete | Better Auth + RolePermission + guard | — |
| 21 | File / Attachment Handling | 🟢 Complete | Upload, polymorphic owner, checksum | — |
| 22 | Portal (Management) | 🟡 Partial | Certificate & Billing module tidak ada | P1 |
| 23 | Technician PWA | 🟡 Partial | Tidak di prod Docker Compose | P1 |
| 24 | PDF / Documents | 🟡 Partial | WOL body tanpa nomor; lihat §13 | P1 |
| 25 | API Architecture | 🟢 Complete | NestJS modular, consistent | — |
| 26 | Database | 🟡 Partial | companyId tanpa FK di child tables (gap E3) | P2 |
| 27 | Background Jobs / Sync | 🔴 Not Implemented | ReminderEvent schema ada; tidak ada scheduler | P3 |
| 28 | Historical Data Import | 🔴 Not Implemented | Hanya Excel requisition baru, bukan historical jobs | P1 |
| 29 | Audit Trail | 🔴 Not Implemented | Tidak ada change log / event sourcing | P2 |
| 30 | Reporting / Dashboard | 🔴 Not Implemented | — | P3 |
| 31 | Error Handling & Validation | 🟢 Complete | Zod + NestJS exception patterns konsisten | — |
| 32 | Multi-company / Tenant Isolation | 🟡 Partial | Single-tenant per process; by design | — |
| 33 | Billing / Invoice / Payment | 🔴 Missing | Schema siap; zero API/UI | P1 |
| 34 | Customer Portal | 🔴 Missing | Skeleton only — auth shell, no features | P1 |

---

## 3. P0 — Blockers

**Tidak ada P0 yang ditemukan.**

Sistem tidak memiliki security hole yang dapat mengakibatkan data corruption antar-tenant, privilege escalation yang tidak disengaja, atau state yang tidak bisa dipulihkan secara fundamental. Semua risiko yang ditemukan berada di level P1 atau di bawah.

---

## 4. P1 — High Priority

*(Harus diperbaiki sebelum sistem dianggap production-ready untuk workflow terkait)*

| ID | Area | Finding | Evidence | Business Impact | Technical Impact | Recommendation |
|----|------|---------|----------|-----------------|------------------|----------------|
| **P1-01** | Certificate | Module Certificate tidak ada: tidak ada controller, service, PDF generator, atau lifecycle DRAFT→ISSUED. `KontrolAlat.certificateNumber` adalah manual free-text; bukan entitas Certificate resmi. `CertificateStatus` enum dan model ada di schema tapi tidak digunakan di runtime. | `apps/api/src/modules/` — tidak ada folder `certificates`. `prisma.certificate.count` hanya dipakai di `devices.service` sebagai delete guard. | PKM tidak bisa menerbitkan sertifikat kalibrasi secara digital. End-to-end chain terhenti di QA Approved. Customer tidak punya bukti kalibrasi resmi dari sistem. | `Certificate` model dan `DocumentType.CERTIFICATE` (prefix `CER`) sudah siap, tapi tidak pernah diinisiasi. `billingStatus` (UNBILLED/BILLABLE/INVOICED) tidak bisa di-drive tanpa issuance. | Buat `certificates` module dengan: issue (DRAFT→ISSUED), revoke, PDF generator, nomor `CER/...` via `DocumentNumberService`. |
| **P1-02** | Work Order | `WorkOrder.done()` tidak memverifikasi bahwa semua CalibrationJob sudah `ACCEPTED_BY_QA`. WO bisa di-mark DONE dengan jobs masih `PENDING` atau `IN_PROGRESS`. | `ALLOWED_TRANSITIONS = { IN_PROGRESS: ["DONE"] }` tanpa job completion check di `work-orders.service.ts`. Dikonfirmasi di audit: *"hanya transition table — tidak cek job completion."* | WO dapat di-tutup sebelum semua kalibrasi selesai. Laporan "WO DONE" tidak akurat. Billing/certificate bisa di-generate dari WO yang belum tuntas. | Inkonsistensi state antara WO dan CalibrationJobs anak. | Tambah precondition di `done()`: semua `CalibrationJob` milik WO harus `ACCEPTED_BY_QA` sebelum WO boleh `DONE`. |
| **P1-03** | Calibration Job | `submitForReview()` tidak memiliki completeness gate. Teknisi bisa submit job untuk QA tanpa satu pun measurement result atau physical check result yang tercatat. | `submitForReview()` hanya cek `status === IN_PROGRESS` dan `startedAt !== null`. Tidak ada validasi minimal measurement/physical check entries. Dikonfirmasi dari kode. | MT akan menerima job submission yang kosong. Tidak ada cara sistem untuk menolak job yang genuinely belum dikerjakan. QA review menjadi tidak bermakna. | Missing domain invariant: submitted job = completed job, by business definition. | Tambah minimal validation di `submitForReview()`: setidaknya ada ≥1 `MeasurementResult` dan semua required `PhysicalCheckResult` terisi. Atau buat system flag "measurement_complete" yang MT bisa lihat. |
| **P1-04** | tech-pwa | Technician PWA tidak dimasukkan dalam `docker-compose.prod.yml`. Nginx config (`technician.kalibrasimedika.co.id.conf.example`) sudah direncanakan, tapi tidak ada container tech-pwa di production stack. | `docker-compose.prod.yml` — services: `api`, `web-api`, `web`, `portal` saja. Komentar baris 17–19: sengaja belum include. `infra/nginx/technician.*.conf.example` ada tapi proposed/not applied. | Teknisi tidak bisa mengakses aplikasi PWA di production. Seluruh workflow teknisi (job start, Kontrol Alat, measurement, physical check) tidak bisa dioperasikan via production deployment. | Kontradiksi antara nginx config yang sudah ada dan compose stack yang tidak include service. | Tambahkan `tech-pwa` service ke `docker-compose.prod.yml` dan apply nginx config. |
| **P1-05** | Historical Data | Tidak ada import strategy untuk historical calibration data. `CalibrationRequest` Excel import hanya membuat requisition baru (bukan historical jobs/certificates). Tidak ada SQL import script. | `calibration-request-import.service.ts` — parse xlsx, create `CalibrationRequest` baru. `scripts/sql/` — wipe dan inspect scripts, bukan import. Docs di `kontrol-alat-implementation-planning-report.md` mengakui: *"import historis kalibrasi: tidak ada di repo."* | PKM tidak bisa memigrasikan riwayat kalibrasi pelanggan ke sistem. Historical device calibration history kosong. Customer tidak bisa melihat riwayat alat mereka. | Data PKM yang sudah ada tidak akan terhubung ke sistem digital. | Desain dan implementasi import historis: minimal `CalibrationJob` (ACCEPTED_BY_QA) + `Certificate` (ISSUED) + tanggal + `certificateNumber` + device reference, tanpa memaksa workflow commercial. |
| **P1-06** | Billing / Invoice | Modul Invoice/Payment/CreditNote tidak ada di API dan Portal. Schema siap (model `Invoice`, `Payment`, `CreditNote`, `InvoiceCertificate`, enum `InvoiceStatus`, `CreditNoteStatus`, prefix `INV`/`CRN`). | Tidak ada folder `apps/api/src/modules/invoices`. Tidak ada halaman `/invoices` di portal. `DocumentType.INVOICE` ada di enum tapi `DocumentNumberService.allocate` untuk INVOICE tidak pernah dipanggil. | PKM tidak bisa membuat tagihan kepada customer dari dalam sistem. Revenue tracking tidak ada. Sertifikat yang sudah issued tidak terhubung ke billing. | Schema billing sudah punya `Certificate.billingStatus` (UNBILLED/BILLABLE/INVOICED) yang tidak pernah berubah. `InvoiceCertificate` join table tidak pernah terisi. | Buat `invoices` module. Prioritaskan: Certificate → Invoice linkage dan basic Invoice issuance. |
| **P1-07** | Customer Portal | Customer portal adalah skeleton — hanya auth shell (`/client/page.tsx` dengan komentar "F6 foundation only, business modules land later"). Customer tidak bisa melihat status job, sertifikat, atau history. | `apps/portal/src/app/client/page.tsx` — minimal layout. Tidak ada routes `/client/jobs`, `/client/certificates`, `/client/work-orders`. | Customer tidak bisa self-serve. Semua status update harus dikomunikasikan manual oleh CS/admin. Nilai portal sebagai B2B self-service tidak ada. | `CustomerUserLink` model dan `CUSTOMER` role sudah ada. API foundation tersedia. | Implementasikan minimal customer portal: list WO, status job, view certificate (jika certificate module selesai). |
| **P1-08** | PDF — WOL | PDF WOL (Formulir Work Order, F.MU.07) tidak mencetak nomor WOL di body dokumen. `workOrder.number` (`WOL/...`) hanya dipakai sebagai filename. SPK (ON_SITE) sudah benar mencetak nomor. | `work-order-pdf-wol.ts` line 96–112: section header hanya "FORMULIR / Work Order" + meta F.MU.07. Tidak ada baris `doc.text(workOrder.number, ...)` di body. Bandingkan `work-order-pdf-spk.ts` line 74: `doc.text(\`Nomor: ${workOrder.number}\`, left, y)`. | Dokumen WOL yang dicetak tidak memiliki nomor identifikasi resmi. Tidak bisa digunakan sebagai dokumen legal yang dapat diverifikasi. Inkonsisten dengan SPK. | Nomor sudah dialokasi (WOL/...) tapi tidak ditampilkan. | Tambahkan baris nomor dokumen di body PDF WOL, konsisten dengan format SPK. |
| **P1-09** | Quality Review | Setelah MT melakukan `decideQualityReview(APPROVE)`, job status tetap `SUBMITTED`. MT harus melakukan aksi terpisah `complete()` untuk mengubah status menjadi `ACCEPTED_BY_QA`. Ini adalah dua-langkah yang tidak intuitif dan tidak ada di domain requirement. | `decideQualityReview(APPROVE)` → hanya create `QualityReview` record dengan `status APPROVED`. `complete()` → cek ada QualityReview APPROVED, lalu set `ACCEPTED_BY_QA`. Dikonfirmasi dari kode: *"Job tetap SUBMITTED — tidak auto-complete."* | MT harus melakukan dua aksi terpisah (Approve → Complete) yang terasa seperti redundansi. Risk bahwa operator "lupa" melakukan complete() sehingga job tergantung di SUBMITTED padahal sudah di-approve. | State `SUBMITTED + ada APPROVED QualityReview` adalah limbo state yang tidak merepresentasikan kondisi bisnis yang jelas. | Merge `complete()` ke dalam `decideQualityReview(APPROVE)`: saat approve → langsung `ACCEPTED_BY_QA`. Hapus `complete()` sebagai endpoint terpisah, atau jadikan internal helper. |

---

## 5. P2 — Medium Priority

| ID | Area | Finding | Evidence | Business Impact | Technical Impact | Recommendation |
|----|------|---------|----------|-----------------|------------------|----------------|
| **P2-01** | Quotation | `approve()` bisa dipanggil dari status `DRAFT` (tanpa melalui `SENT`). Business step "send to customer for approval" bisa di-skip. | `quotations.service.ts` approve: cek `no pending prices` saja, tidak cek `status === SENT`. | Quotation bisa di-approve tanpa pernah dikirim ke customer. Record approval tidak mencerminkan customer agreement yang actual. | Ad-hoc if chains, bukan transition table seperti WO. | Tambah `status === SENT` as required precondition untuk `approve()`. |
| **P2-02** | Quotation / PO | Multiple "dead" enum values: `QuotationStatus.EXPIRED`, `PurchaseOrderStatus.RECEIVED`, `CONFIRMED`, `FULFILLED`. Nilai ini tidak pernah di-set oleh API manapun. | `quotations.service.ts`: tidak ada transition ke `EXPIRED`. `purchase-orders.service.ts`: hanya DRAFT/APPROVED/CANCELLED. | Tampilan status di UI bisa bingungkan jika enum values muncul di dropdown/filter. Technical debt yang akan menyulitkan developer baru. | Schema dan enum tidak mencerminkan actual API behavior. | Hapus enum values yang dead, atau dokumentasikan eksplisit sebagai "reserved for future use" dengan `assertMvpStatus`-like guard. |
| **P2-03** | Quality Review MT | Tidak ada dedicated "Quality Review Inbox" atau list halaman untuk MT. MT harus menemukan job SUBMITTED secara manual dari `/calibration-jobs` yang sudah difilter. | Portal `/calibration-jobs` adalah satu halaman flat; tidak ada `/quality-review` atau `?status=SUBMITTED` shortcut. QualityReview embedded di job detail. | MT tidak punya workspace yang efisien. Jika volume job tinggi, sulit menemukan job yang menunggu review. Operasional tidak scalable. | Fitur ada tapi UX tidak efisien untuk role yang memiliki dedicated function. | Tambah halaman/section "Menunggu Review" untuk role TECHNICIAN_MANAGER: filter `status = SUBMITTED`, sorted by `submittedAt`. |
| **P2-04** | Data Model | `companyId` tanpa FK constraint di banyak child tables (gap E3): `CalibrationJob`, `KontrolAlat`, `KontrolAlatSignature`, `MeasurementResult`, `PhysicalCheckResult`, `QualityReview`, `IdentityCorrection`, `ChatMessage`, `CustomerContact`, dan lainnya. | Komentar schema: *"bare String, no FK — matches the project child-table convention (gap E3)"*. Dikonfirmasi di `MeasurementResult`, `PhysicalCheckResult`. | Jika data di-insert langsung ke DB (seed, script, migration), bisa masuk `companyId` yang tidak valid. Drift tenant possible in multi-company future. | Untuk single-tenant deployment, risiko minimal karena `companyId` selalu dari env. Tapi konvensi yang tidak konsisten. | Dokumentasikan ini sebagai accepted technical debt. Jika pindah ke multi-tenant, tambah FK ke Company. |
| **P2-05** | Audit Trail | Tidak ada audit log / change history untuk entitas kritis (WO status changes, Job decisions, Certificate issuance, Identity corrections). | Tidak ada `AuditLog` model di schema. Tidak ada event sourcing. Tidak ada middleware logging yang merekam mutations. IdentityCorrection memiliki field `prev*/new*` sebagai point-in-time snapshot tapi bukan log. | Jika ada dispute tentang kapan suatu perubahan dilakukan atau siapa yang melakukannya, tidak ada trail. Compliance risk untuk lab kalibrasi. | N/A | Implementasikan minimal audit log: entity type, entity id, action, userId, timestamp, before/after values untuk transitions kritis (status changes, approval decisions). |
| **P2-06** | RBAC Auth | `AUTH_ROLES` list di `packages/auth/src/index.ts` tidak sinkron dengan `MembershipRole` enum di Prisma — missing `TECHNICIAN_MANAGER` dan `CUSTOMER_SERVICE`. | Tidak diverifikasi dari kode secara langsung, tapi dilaporkan di security audit. | Jika ada kode yang iterates `AUTH_ROLES` untuk validasi, 2 role tersebut akan di-miss. | Drift antara auth package dan DB enum. | Sinkronkan `AUTH_ROLES` dengan `MembershipRole` Prisma enum. |
| **P2-07** | Security | `InternalServiceGuard` menggunakan perbandingan string biasa (`!==`) untuk secret validation, bukan `crypto.timingSafeEqual`. | `apps/api/src/common/guards/internal-service.guard.ts` baris 19-36: `!==` comparison. | Timing side-channel attack secara teoritis mungkin jika secret di-probe dari network. Risiko rendah jika internal network, tapi bukan best practice. | Tidak ada konstant-time comparison. | Ganti dengan `crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided))`. |
| **P2-08** | Testing | Tidak ada test HTTP 403 untuk controller Quotation, PO, WorkOrder, CalibrationRequest. RBAC hanya diuji via unit `hasPermission`, bukan end-to-end HTTP. | `access-control.test.ts` — unit test permission matrix. Tidak ada `quotations.controller.test.ts`, `purchase-orders.controller.test.ts`, dll. CalibrationJob punya 403 tests. | Jika ada bug di guard integration untuk controller tersebut, tidak akan terdeteksi. | Inconsistency dalam testing depth antar modul. | Tambah minimal controller-level test dengan unauthorized session → 403, untuk Quotation, PO, WorkOrder. |
| **P2-09** | Testing | `DocumentNumberService` tidak memiliki test untuk rollback behavior (jika transaksi rollback, apakah sequence gap terjadi dengan benar tanpa duplikasi). `MasterCodeService` sudah punya test ini. | `document-number.service.test.ts` — test format, year reset, concurrent uniqueness. Tidak ada rollback test. `master-code` sudah punya. | Race condition atau rollback bisa menghasilkan gap sequence — ini acceptable behavior, tapi tidak terdokumentasi lewat test. | Konsistensi testing antara `MasterCode` dan `DocumentNumber`. | Tambah test: allocate dalam txn yang rollback → next allocate menghasilkan nomor valid (bukan crash). |
| **P2-10** | PDF — KontrolAlat | Bagian "II. Kaji Ulang Permintaan" di PDF Kontrol Alat membaca **live** `WorkOrder` data (bukan snapshot). Jika WO request review diupdate setelah KontrolAlat selesai, PDF akan berubah isi. | `kontrol-alat-pdf.ts` baris 122-130: data dari `workOrder` langsung (included dalam build query). Berbeda dengan Surat Jalan Alat yang memakai snapshot. | Dokumen yang sudah di-print dan di-tanda-tangani bisa berbeda isinya dengan yang di-generate ulang kemudian. Inkonsistensi dokumen legal. | KontrolAlat sendiri sudah punya snapshot accessories, tapi request review data bukan snapshot. | Pertimbangkan snapshot request review state ke KontrolAlat saat dokumen selesai (status terkunci). |
| **P2-11** | Deployment | Tidak ada connection pooler (PgBouncer/Prisma Accelerate) untuk `DATABASE_URL`. Prisma membuka koneksi per-request/module. | `.env.example` dan `.env.production.example`: `DATABASE_URL` adalah URL PostgreSQL biasa, tanpa `?pgbouncer=true` atau connection limit params. | Pada volume tinggi, connection pool exhaustion mungkin terjadi. NestJS + Prisma dengan default pool size bisa bottleneck. | Risiko rendah pada volume PKM kecil, tapi perlu diperhatikan saat scale. | Tambahkan `connection_limit` di DATABASE_URL atau setup PgBouncer. Minimal dokumentasikan pool size default. |
| **P2-12** | Observability | Tidak ada structured logging atau error tracking (Sentry/Datadog). Health check ada (`/health`), tapi tidak ada instrumen untuk production errors. | `health.controller.ts` ada. Tidak ada Sentry SDK, tidak ada structured logger integration di `main.ts`. | Error di production akan sulit di-debug. MTTR tinggi untuk issue yang tidak terreproducing di dev. | N/A | Tambahkan minimal error tracking (Sentry), dan structured logging dengan request correlation ID. |
| **P2-13** | WO / CalibrationJob | `CalibrationJob.startedAt` dipakai untuk dua hal: "Tgl Terima Alat" dan "Tgl Kalibrasi" di Kontrol Alat PDF. Keduanya memakai nilai yang sama. | `kontrol-alat-pdf.ts` baris 127-128: `["Tgl. Terima Alat", formatDate(job.startedAt)]`, `["Tgl. Kalibrasi", formatDate(job.startedAt)]`. Domain baseline menyatakan: *"Tgl Terima Alat = CalibrationJob.startedAt, Tgl Kalibrasi = CalibrationJob.startedAt"* — jadi ini by design. | Dua tanggal berbeda secara bisnis (kapan alat diterima vs kapan kalibrasi dimulai) bisa berbeda di lapangan. | Tidak ada field terpisah untuk distinguishing kedua tanggal. | Business decision: apakah Tgl Terima Alat perlu field tersendiri? Jika ya, tambah `receivedAt` ke CalibrationJob atau KontrolAlat. |
| **P2-14** | Portal | Tidak ada "Quality Review Inbox" untuk MT. Tidak ada filtering `SUBMITTED` jobs yang efisien di portal. Tidak ada notifikasi push ketika job di-submit untuk review. | Tech-pwa dan portal sama-sama tidak mengirim FCM notification saat `submitForReview()`. `FCMToken` model dan firebase-admin tersedia. | MT tidak tahu ada job yang menunggu review kecuali secara aktif membuka portal dan scroll. Delay review. | FCM infrastructure ada tapi tidak di-wire ke business events. | Wire FCM notification ke `submitForReview()` dan `decideQualityReview(REJECT)` untuk alert MT / Teknisi. |

---

## 6. P3 — Low / Future

| ID | Area | Finding | Evidence | Recommendation |
|----|------|---------|----------|----------------|
| **P3-01** | Certificate | `Certificate.verificationToken` untuk public verification portal tidak diimplementasi. Field ada di schema. | `verificationToken String? @unique` di schema. | Implementasi public QR/token verification setelah certificate module selesai. |
| **P3-02** | Quotation | `EXPIRED` status tidak pernah di-set. Tidak ada background job yang expire quotations. | Tidak ada scheduler di system; ReminderEvent juga tidak punya scheduler. | Implementasi cron/scheduler untuk auto-expire quotation setelah `validUntil`. |
| **P3-03** | Notification | `ReminderEvent` model ada (email, push, WhatsApp untuk certificate renewal reminder) tapi tidak ada scheduler atau trigger. | Model `ReminderEvent` dengan fields: `scheduledFor`, `sentAt`, `status` (SCHEDULED/SENT/FAILED/CANCELLED). | Tambah background job infrastructure (Bull/Agenda/node-cron). |
| **P3-04** | PDF — SPK | Jabatan teknisi di SPK PDF hardcoded sebagai `"Teknisi"`. Tidak ada field `title/jabatan` di `User` atau `UserMembership`. | `work-order-pdf-spk.ts` — documented gap: *"jabatan teknisi hardcode 'Teknisi'"*. | Tambah optional `title` field ke UserMembership, atau Company settings untuk default technician title. |
| **P3-05** | Accessory | Tidak ada master/template accessory. User mengisi manual setiap kali. Belum ada default accessory set per device type. | Domain baseline mengkonfirmasi: *"Belum ada master/template accessory."* | Future: buat `DeviceTypeDefaultAccessory` master yang di-snapshot ke `WorkOrderItemAccessory` saat WO item dibuat. |
| **P3-06** | Signature | Mekanisme signature saat ini hanya `signerName + signedAt`. Actual signature image/biometric adalah future. | `KontrolAlatSignature`: `signerName String`, `signedAt DateTime?`. Domain baseline: *"signature mechanism adalah future consideration."* | Implementasikan signature pad atau e-signature integration di future sprint. |
| **P3-07** | Customer Portal | Customer tidak bisa self-register, melihat job status, atau download sertifikat dari portal. `CustomerUserLink` tersedia. | `/client` route adalah skeleton. | Implement customer self-service portal setelah certificate module selesai. |
| **P3-08** | Multi-company | System adalah single-tenant per process. Jika PKM ingin multi-company dalam satu deployment, architecture perlu redesign. | `companyId = env.COMPANY_ID` di semua guards. Masters (device types, UOM, menu) adalah global/shared. | Document explicitly bahwa multi-company perlu row-level security redesign. Future architecture concern. |
| **P3-09** | Reporting | Tidak ada reporting, analytics, atau dashboard bisnis. | Tidak ada halaman `/reports` atau `/dashboard` di portal. | Future: revenue summary, job completion rate, equipment utilization, turnaround time. |
| **P3-10** | Seed Orchestration | Tidak ada single seed entrypoint. ~14 seed scripts dijalankan manual terpisah. | `packages/db/package.json` — banyak `seed:*` scripts. Tidak ada `seed:all` atau ordered orchestration. | Buat `seed:all` script dengan urutan dependency yang benar (UOM sebelum parameters, device types sebelum parameters, dll.). |
| **P3-11** | Equipment Delivery Note | `EquipmentDeliveryNoteItem.equipmentId` sengaja tanpa FK (snapshot design). Namun tidak ada cara untuk melihat WO mana yang menggunakan equipment tertentu dari delivery note perspective. | By design — DLN adalah immutable snapshot. | Acceptable. Document bahwa lookup harus via `WorkOrderEquipment` bukan DLN item. |
| **P3-12** | Tech-PWA | Tech-PWA tidak ada di `docker-compose.prod.yml`. Terpisah dari P1-04 — ini tentang tidak adanya image build pipeline untuk tech-pwa di CI. | Hanya 4 Dockerfile: api, web-api, web, portal. Tech-pwa punya `next.config.js` tapi tidak ada Dockerfile di `apps/tech-pwa`. | Tambah `apps/tech-pwa/Dockerfile` (konsisten dengan portal) dan include di compose prod. |

---

## 7. Business Decisions Still Open

*(Hanya genuine open decisions — locked decisions tidak di-reopen)*

| ID | Topic | Why Decision Needed | Options | Recommendation |
|----|-------|---------------------|---------|----------------|
| **BD-01** | Tgl Terima Alat vs Tgl Kalibrasi | Saat ini keduanya = `CalibrationJob.startedAt`. Di lapangan, alat bisa diterima di hari berbeda dari hari kalibrasi dimulai. Ini gap antara paper form dan digital. | A) Tetap sama (by design, simplify) / B) Tambah `KontrolAlat.receivedAt` yang diisi manual / C) Tambah `CalibrationJob.receivedAt` | Jika PKM selalu terima dan langsung kalibrasi di hari yang sama → opsi A cukup. Jika tidak → opsi B lebih natural karena KontrolAlat adalah intake artifact. |
| **BD-02** | No. Sertifikat di Kontrol Alat | Saat ini `KontrolAlat.certificateNumber` adalah free-text manual setelah MT APPROVE. Jika Certificate module diimplementasikan (P1-01), apakah no. sertifikat di-generate otomatis dengan `CER/...` atau masih manual? | A) Manual tetap (fleksibel, sesuai paper process) / B) Otomatis dari `DocumentNumberService` saat Certificate issued / C) Hybrid: bisa override | Jika Certificate module dibangun, sebaiknya gunakan otomatis dari `CER/...` sequence. Free-text menjadi fallback override only. |
| **BD-03** | Apakah submitForReview() perlu completeness gate? | Domain baseline tidak menyebutkan explicit requirement. Apakah MT bisa review job yang tidak lengkap, dan menolaknya lewat rework? Atau sistem harus prevent submit sama sekali? | A) Gate: minimal 1 measurement + semua physical checks wajib / B) Soft warning (bisa tetap submit) / C) Tidak ada gate, MT yang responsible | Dari sisi operational integrity, soft warning lebih pragmatis daripada hard gate jika ada edge cases. Tapi P1-03 tetap merekomendasikan minimal gate. |
| **BD-04** | Historical Calibration Import Strategy | Bagaimana cara memasukkan data kalibrasi historis (jobs, sertifikat, device history) ke sistem tanpa memaksa workflow commercial modern? | A) Direct import via SQL/script ke CalibrationJob (ACCEPTED_BY_QA) + Certificate (ISSUED) tanpa WO / B) Buat "Legacy Work Order" minimal / C) Historical data tetap di sistem lama, hanya forward-reference | A adalah yang paling bersih sesuai domain doc planning report yang sudah ada. Perlu field `isHistorical` atau `source` untuk distinguishing. |

---

## 8. Domain / Data Model Findings

### Kekuatan

- Model secara umum merepresentasikan real-world PKM process dengan baik
- `CalibrationJob` 1:1 per physical device/unit sudah benar
- `KontrolAlat` 1:1 per `CalibrationJob` (SEND_TO_LAB only) sudah benar dan di-enforce
- Snapshot pattern sudah digunakan dengan baik: `EquipmentDeliveryNoteItem` (snapshot immutable), `KontrolAlatAccessory` (copy dari WO item), identity snapshots di `CalibrationJob`
- Partial unique constraint untuk WO aktif (`purchaseOrderId` hanya satu WO non-CANCELLED)

### Issues

**E1 — companyId tanpa FK (gap E3 by design)**
Child tables (`CalibrationJob`, `KontrolAlat`, `MeasurementResult`, `PhysicalCheckResult`, `QualityReview`, dll.) menyimpan `companyId` sebagai plain String tanpa FK ke `Company`. Ini documented design choice tapi berarti DB tidak enforce tenant isolation pada level constraint. Acceptable untuk single-tenant.

**E2 — Certificate.deviceId wajib tapi CalibrationJob.deviceId nullable**
Jika Certificate module diimplementasikan, ada risk: sebuah job bisa di-ACCEPTED_BY_QA tanpa `deviceId` (nullable), tapi `Certificate` membutuhkan `deviceId`. Perlu validation saat certificate issue.

**E3 — Dead enum values mengotori schema**
`PurchaseOrderStatus.RECEIVED/CONFIRMED/FULFILLED`, `QuotationStatus.EXPIRED`, `WorkOrderStatus.TECHNICALLY_DONE/CLOSED` tidak dipakai di runtime. Schema tidak mencerminkan actual business rules.

**E4 — `CalibrationRequest.desiredScheduleNote` deprecated**
Field dengan komentar `// deprecated` di schema. Tidak ada migration untuk remove.

**E5 — EquipmentDeliveryNoteItem.equipmentId tanpa FK (by design)**
Snapshot design — sengaja. Tidak ada orphan risk karena data di-copy saat issuance. ✓ Acceptable.

**E6 — `Certificate.supersedesCertificateId` self-reference**
Ada di schema untuk revoke/supersede chain, tapi tidak ada lifecycle code yang menggunakan ini.

---

## 9. Workflow / State Machine Findings

### Calibration Job — Paling Solid

```
PENDING → IN_PROGRESS: start()
  ✓ Gate: KontrolAlat.workExecuted === true (SEND_TO_LAB only)
  ✓ Gate: KontrolAlat.ADMINISTRATION signature signed
  ✓ Gate: KontrolAlat.TECHNICAL_OFFICER signature signed
  ✗ Missing: AKD/AKL approval status not checked (intentionally permissive)

IN_PROGRESS → SUBMITTED: submitForReview()
  ✓ status === IN_PROGRESS check
  ✗ Missing: No measurement completeness check
  ✗ Missing: No physical check completeness check

SUBMITTED → ACCEPTED_BY_QA: approve (P1-09: dua langkah)
  ✓ QualityReview APPROVED exists check
  ✗ Issue: Requires separate complete() call after approve

SUBMITTED → REWORK: reject()
  ✓ Notes required
  ✓ currentAttempt incremented
  ✓ Race condition handled

REWORK → IN_PROGRESS: resumeAfterRework()
  ✓ status === REWORK check
  ✓ Clean resume
```

### Work Order — Ada Gap Penting

```
IN_PROGRESS → DONE: done()
  ✓ Transition table enforced
  ✗ MISSING: No check that all CalibrationJobs are ACCEPTED_BY_QA
  RISK: WO dapat di-DONE dengan jobs masih PENDING/IN_PROGRESS
```

### Quotation — Loose Transition

```
DRAFT → APPROVED: approve()
  ✓ No pending prices check
  ✗ Missing: status === SENT precondition
  RISK: Customer approval step bisa di-skip
```

### Purchase Order — Dead States

```
API hanya: DRAFT → APPROVED, DRAFT → CANCELLED
RECEIVED/CONFIRMED/FULFILLED: enum ada, tidak bisa dicapai via API
```

### Problematic State yang Belum Direpresentasikan

| Situasi Bisnis | State Saat Ini | Masalah |
|----------------|----------------|---------|
| WO selesai tapi sertifikat belum dikeluarkan | `ACCEPTED_BY_QA` | Tidak ada state "pending certificate" |
| Sertifikat sudah dibuat, perlu di-deliver ke customer | Tidak ada | Delivery/handover tidak ada di model |
| Job di-ACCEPTED_BY_QA, sertifikat sudah ISSUED | No linkage | Certificate module belum ada |

---

## 10. Document & Numbering Audit

### Tabel Lengkap Dokumen Sistem

| Document | Business Meaning | Number Source | Prefix | Centralized? | Status |
|----------|-----------------|---------------|--------|--------------|--------|
| Customer | ID pelanggan | `DocumentNumberService` | `CUS` | ✅ Ya | Implemented |
| Calibration Request | Requisisi | `DocumentNumberService` | `CRQ` | ✅ Ya | Implemented |
| Quotation | Penawaran harga | `DocumentNumberService` | `QUO` | ✅ Ya | Implemented |
| Purchase Order | PO dari customer | `DocumentNumberService` | `PUR` | ✅ Ya | Implemented |
| Work Order (ON_SITE) | SPK | `DocumentNumberService` | `SPK` | ✅ Ya | Implemented |
| Work Order (SEND_TO_LAB) | WOL | `DocumentNumberService` | `WOL` | ✅ Ya | Implemented |
| Equipment Delivery Note | Surat Jalan Alat | `DocumentNumberService` | `DLN` | ✅ Ya | Implemented |
| Identity Correction BA | Berita Acara Koreksi | `DocumentNumberService` | `BAI` | ✅ Ya | Implemented |
| Kontrol Alat | Intake kalibrasi In Lab | `DocumentNumberService` | `KAL` | ✅ Ya | Implemented ✓ |
| Invoice | Tagihan | `DocumentNumberService` | `INV` | ✅ (ready) | **Belum di-wire** |
| Certificate | Sertifikat kalibrasi | `DocumentNumberService` | `CER` | ✅ (ready) | **Belum di-wire** |
| Credit Note | Nota kredit | `DocumentNumberService` | `CRN` | ✅ (ready) | **Belum di-wire** |
| `KontrolAlat.certificateNumber` | No. sertifikat paper | Manual free-text | — | ❌ Manual | **Bukan nomor sistem** |
| `EquipmentCalibrationRecord.certificateNumber` | Sertifikat alat referensi | Manual free-text | — | ❌ Manual | By design, eksternal |

### Temuan Kritis

**F.MU.08 — BENAR digunakan**: F.MU.08 hanya muncul sebagai "Kode Dokumen" formulir di header PDF Kontrol Alat, **bukan** sebagai nomor sistem. Nomor sistem yang tercetak adalah `KontrolAlat.number` (`KAL/...`). ✅ Correct.

**F.MU.07** — Muncul di PDF WOL header sebagai form code. Tidak mencetak nomor WOL di body. ⚠️ (lihat P1-08)

**SPK/WOL sebagai counter terpisah** — Benar: dua `DocumentType` berbeda, counter terpisah per tahun. ✅

**Atomicity** — `DocumentNumberService.allocate()` menggunakan `INSERT … ON CONFLICT DO UPDATE RETURNING` dalam satu statement. Caller wajib wrap dalam transaction (pola sudah konsisten di semua caller). ✅

---

## 11. Security / RBAC Findings

### Strengths (tidak perlu action)

- Semua endpoint bisnis memiliki `CompanyRoleGuard` + `@RequirePermission`
- Company isolation via `process.env.COMPANY_ID` — tidak bisa di-spoof dari client
- `findOne(companyId, id)` pattern di semua service → cross-company access → 404
- SUPERADMIN bypass di `hasPermission()` dengan protection: tidak bisa di-assign via API, hanya via bootstrap
- Internal endpoints (`/internal/*`) dilindungi `InternalServiceGuard` dengan shared secret
- DELETE operations semua di-protect dengan appropriate permissions
- File upload dilindungi dengan `FileOwnerPolicy`

### Issues

**SEC-01 — Non-constant-time secret comparison** (P2-07)
`InternalServiceGuard` menggunakan `!==` untuk secret comparison. Theoretical timing attack.

**SEC-02 — AUTH_ROLES list stale** (P2-06)
`TECHNICIAN_MANAGER` dan `CUSTOMER_SERVICE` tidak ada di `AUTH_ROLES` list di auth package.

**SEC-03 — SUPERADMIN akun bocor = full access**
By design, documented. Tapi jika credentials SUPERADMIN bocor, tidak ada 2FA, session management tambahan, atau IP restriction untuk limit damage. Acceptable untuk PKM scale, perlu awareness.

**SEC-04 — Master data global tanpa company isolation**
Device taxonomy, UOM, menu, email whitelist, RolePermission — shared di DB. Jika dalam satu proses ada multiple companies (hypothetical), semua bisa edit master data yang sama. By design untuk single-tenant. Dokumentasikan bahwa multi-tenant butuh redesign.

---

## 12. Portal / PWA Findings

### Portal (Management) — Functional Gaps

| Gap | Impact |
|-----|--------|
| Tidak ada halaman Certificate management | Certificate issuance tidak bisa dilakukan via sistem |
| Tidak ada halaman Invoice/Payment | Billing tidak bisa dilakukan via sistem |
| Tidak ada Quality Review inbox untuk MT | Efisiensi MT rendah pada volume tinggi |
| Push notification tidak di-wire ke business events | MT tidak aware ada job yang perlu direview |
| Portal customer skeleton | Customers tidak bisa self-serve |

### Portal — UX Issues (Minor, Cosmetic)

| Issue | Priority |
|-------|----------|
| WO creation hanya bisa dari PO detail page, tidak ada standalone WO creation | P3 — by design |
| Tidak ada bulk action (misal approve semua Kontrol Alat accessories) | P3 |
| Tidak ada sorting/filter yang persistent per user | P3 |

### Tech-PWA — Functional Gaps

| Gap | Impact |
|-----|--------|
| Tidak di production Docker Compose | Teknisi tidak bisa akses di production (P1-04) |
| Tidak ada Dockerfile | Belum bisa build image untuk deployment |

### Tech-PWA — Implemented Correctly

- Kontrol Alat form lengkap (WOL only)
- Physical check input
- Measurement entry per parameter
- Identity correction wizard dengan photo + dual signatures
- Reference equipment
- Job start/submit/complete actions

---

## 13. PDF / Document Findings

| PDF | Nomor di Body? | F.MU.## sebagai nomor? | Snapshot? | Issues |
|-----|---------------|----------------------|-----------|--------|
| SPK | ✅ `SPK/...` tercetak | Tidak | Partial (tidak ada data lock) | Jabatan teknisi hardcode |
| WOL | ❌ Nomor WOL tidak di body | F.MU.07 hanya kode formulir | Partial | **Nomor WOL missing** (P1-08) |
| DLN (Surat Jalan) | ✅ `DLN/...` tercetak | Tidak | ✅ Full snapshot | Robust — dokumen tidak berubah |
| Kontrol Alat | ✅ `KAL/...` tercetak sebagai No. Dokumen | F.MU.08 hanya kode formulir | Partial | Request review baca live WO (P2-10) |
| BAI (Koreksi Identitas) | ✅ `BAI/...` tercetak | Tidak | Partial | Label "Ref. SPK" padahal bisa WOL |
| Quotation | ✅ `QUO/...` tercetak | Tidak | Partial | Rendah |
| PO | ✅ `PUR/...` tercetak | Tidak | Partial | Rendah |
| Certificate | ❌ Tidak ada PDF | — | — | **Module tidak ada** (P1-01) |

**Critical Finding — BAI PDF label**: `identity-correction-pdf.ts` menampilkan `Ref. SPK ${job.workOrder.number}` padahal WO bisa bertipe WOL (SEND_TO_LAB). Label "Ref. SPK" misleading untuk WOL jobs. Minor but incorrect.

---

## 14. Historical Data Readiness

| Aspek | Status | Keterangan |
|-------|--------|-----------|
| Historical data model | 🟡 Partial | `CalibrationJob` bisa menyimpan historical data jika dibuat langsung (tanpa WO). Tapi tidak ada `isHistorical` flag atau `source` field. |
| Import strategy | 🔴 Not Implemented | Tidak ada script atau API untuk import historical jobs/certificates |
| Differentiation dari modern workflow | 🔴 Not Implemented | Tidak ada cara membedakan historical record dari workflow modern |
| Customer/device mapping aman? | 🟢 Yes | Device dan Customer model sudah ada; historical bisa reference existing |
| Historical certificate reference | 🟡 Partial | `KontrolAlat.certificateNumber` bisa diisi dengan no. sertifikat lama, tapi bukan entity Certificate |
| Historical results preservation | 🔴 Not Implemented | MeasurementResult membutuhkan `CalibrationJob` yang terhubung ke WO. Direct historical insert perlu bypass WO requirement. |
| Forced into new workflow | 🟢 Safe | Domain doc planning sudah mengunci: jangan buat fake Requisition/Quotation/PO/WO untuk historical data |

**Kesimpulan**: Historical data bisa diimport via direct DB insert ke `CalibrationJob` (ACCEPTED_BY_QA) + `Certificate` (ISSUED) tanpa WO, tapi tidak ada tooling atau defined process untuk ini. BD-04 adalah open decision.

---

## 15. Testing / Quality Gaps

### Coverage Summary

| Area | Coverage | Quality |
|------|----------|---------|
| CalibrationJob lifecycle | ✅ Excellent | Happy + negative + race conditions |
| KontrolAlat gate | ✅ Excellent | Semua signature scenarios |
| WorkOrder transitions | ✅ Good | Negative paths ada |
| Document numbering (concurrent) | ✅ Good | 25 concurrent tested |
| Quotation lifecycle | 🟡 Partial | Missing: `reject()`, negative `approve()`, `send non-DRAFT` |
| PO lifecycle | 🟡 Partial | Missing: RBAC 403 |
| RBAC HTTP 403 | 🟡 Partial | Hanya CalibrationJob yang kuat |
| Certificate issuance | ❌ None | Module tidak ada |
| Billing | ❌ None | Module tidak ada |
| Document numbering (rollback) | 🟡 Partial | Missing rollback scenario |
| Customer portal | ❌ None | Skeleton only |
| Tech-PWA | 🟡 Minimal | Util helpers only |
| Performance / load | ❌ None | Tidak ada load test |

### Critical Missing Tests

| Test | Risk Level |
|------|-----------|
| `QuotationService.reject()` happy + negative | Medium |
| `QuotationService.approve()` from non-SENT | Medium |
| Controller RBAC 403 untuk Quotation / PO / WO | Medium |
| `DocumentNumber` rollback behavior | Low |
| `WorkOrder.done()` tanpa completed jobs | High (terkait P1-02) |
| `submitForReview()` tanpa measurements | High (terkait P1-03) |
| Certificate issuance (saat module selesai) | High |

---

## 16. Technical Debt

### Dangerous Debt (perlu action)

| Debt | Why Dangerous | Priority |
|------|--------------|----------|
| `WorkOrder.done()` tanpa job completion check | Business state inconsistency, bisa mislead reporting/billing | P1-02 |
| `submitForReview()` tanpa completeness gate | QA review atas job kosong | P1-03 |
| Certificate module missing | End-to-end chain tidak komplit | P1-01 |

### Manageable Debt (monitor, tidak blocking)

| Debt | Keterangan |
|------|-----------|
| `companyId` tanpa FK di child tables (gap E3) | Documented, acceptable untuk single-tenant |
| Dead enum values (PO RECEIVED, etc.) | Tidak menyebabkan runtime error |
| `AUTH_ROLES` stale | Tidak dipakai di guard critical path |
| Non-constant-time secret comparison | Risiko rendah di internal network |
| `desiredScheduleNote` field deprecated di schema | Field masih di DB, tidak breaking |
| Tidak ada connection pooler | Risiko kecil di volume PKM |

### Future Refactoring (tidak urgent)

| Refactoring | Keterangan |
|-------------|-----------|
| Quotation transition ke tabel ALLOWED_TRANSITIONS | Konsistensi dengan WorkOrder |
| Remove dead enum values dari schema | Memerlukan migration |
| Seed orchestration dengan `seed:all` | Developer experience |
| Quotation `EXPIRED` implementasi dengan scheduler | Feature, bukan debt |
| Signatory data di Company settings | Replace hardcoded "Teknisi" di SPK |

---

## 17. Recommended Remediation Roadmap

### Phase A — Core Business Completeness (P1)

*(Prerequisite: harus selesai sebelum PKM fully operational)*

| Fix | Why | Dependency | Affected Module | Priority |
|-----|-----|-----------|-----------------|----------|
| **A1: WorkOrder.done() + job completion check** | WO tidak boleh DONE sebelum semua jobs ACCEPTED_BY_QA | None | `work-orders.service.ts` | P1-02 |
| **A2: submitForReview() completeness gate** | Job submission harus meaningful | BD-03 decision | `calibration-jobs.service.ts` | P1-03 |
| **A3: Merge approve + complete di Quality Review** | Eliminate unnecessary two-step MT flow | None | `calibration-jobs.service.ts` | P1-09 |
| **A4: WOL PDF nomor di body** | Dokumen harus identifiable | None | `work-order-pdf-wol.ts` | P1-08 |
| **A5: tech-pwa Dockerfile + prod compose** | Teknisi tidak bisa deploy | None | `apps/tech-pwa/Dockerfile`, `docker-compose.prod.yml` | P1-04 |

### Phase B — Certificate & End-to-End Chain (P1)

*(Core business value: PKM bisa issue sertifikat digital)*

| Fix | Why | Dependency | Affected Module | Priority |
|-----|-----|-----------|-----------------|----------|
| **B1: Certificate module** | Issuance DRAFT→ISSUED, CER numbering, PDF generator | A3 (ACCEPTED_BY_QA trigger), BD-02 decision | New `certificates` module | P1-01 |
| **B2: Wire CER number ke KontrolAlat** | Setelah B1, replace free-text `certificateNumber` dengan reference ke Certificate entity | B1 | `kontrol-alat.service.ts`, `kontrol-alat-pdf.ts` | P1-01 dependent |

### Phase C — Billing Foundation (P1)

*(Revenue tracking)*

| Fix | Why | Dependency | Affected Module | Priority |
|-----|-----|-----------|-----------------|----------|
| **C1: Invoice module** | Certificate→Invoice linkage, Invoice issuance, Payment tracking | B1 (Certificate) | New `invoices` module | P1-06 |

### Phase D — Operational Completeness (P1-P2)

| Fix | Why | Dependency | Affected Module | Priority |
|-----|-----|-----------|-----------------|----------|
| **D1: Historical data import** | Onboard PKM existing data | BD-04 decision, B1 (Certificate) | New import script / service | P1-05 |
| **D2: MT Quality Review inbox** | Operational efficiency | B1 | Portal `/quality-review` route | P2-03 |
| **D3: FCM notification untuk job events** | MT awareness, technician notification | A3 | `calibration-jobs.service.ts` + FCM | P2-14 |
| **D4: AUTH_ROLES sync** | Prevent drift | None | `packages/auth/src/index.ts` | P2-06 |
| **D5: Constant-time secret comparison** | Security hygiene | None | `internal-service.guard.ts` | P2-07 |

### Phase E — UX & Quality (P2-P3)

| Fix | Why | Dependency | Affected Module | Priority |
|-----|-----|-----------|-----------------|----------|
| **E1: Quotation approve precondition** | Enforce business step | None | `quotations.service.ts` | P2-01 |
| **E2: Controller 403 tests** | Testing completeness | None | Test files | P2-08 |
| **E3: DocumentNumber rollback test** | Test parity dengan MasterCode | None | `document-number.service.test.ts` | P2-09 |
| **E4: Customer portal features** | Customer self-service | B1 (for certificates) | `apps/portal/src/app/client/` | P1-07 |
| **E5: Observability (Sentry + structured logging)** | Production debug | None | `apps/api/src/main.ts` | P2-12 |
| **E6: BAI PDF label fix** | Ref WOL bukan SPK | None | `identity-correction-pdf.ts` | P2 minor |

### Phase F — Future Architecture (P3)

- Scheduler/background jobs untuk expiry, reminders
- Certificate public verification via QR/token
- Actual signature mechanism
- Reporting/dashboard
- Accessory master templates

---

## 18. What NOT to Fix Yet

Hal-hal berikut **tidak perlu** diperbaiki dalam near-term karena intentionally out of scope, premature, atau tidak proporsional dengan risiko:

| Item | Alasan |
|------|--------|
| **Multi-company support** | Single-tenant adalah design sah; redesign multi-tenant butuh architecture overhaul yang tidak proporsional untuk PKM |
| **`companyId` FK di semua child tables** | Documented gap E3, acceptable single-tenant, FK migration berisiko di production dengan data existing |
| **Remove dead enum values** | Destructive migration tidak worth risiko sekarang; cukup document dan handle di code |
| **Connection pooler (PgBouncer)** | Volume PKM kecil; tidak ada evidence bottleneck saat ini |
| **Comprehensive e2e HTTP tests** | Prioritas lebih rendah dari functional gaps; service layer tests sudah cover critical paths |
| **Email notification untuk setiap workflow event** | IMAP/SMTP infrastructure ada; implementasi event-driven email adalah future feature |
| **Signature pad / biometric** | Explicitly future consideration per domain baseline |
| **Quotation `EXPIRED` background job** | Scheduler infrastructure belum ada; feature bisa wait |
| **Reporting/analytics** | No immediate operational need; nice-to-have untuk management |
| **Customer portal full features** | Blocked by Certificate module; implement setelah Phase B |
| **Company signatory settings di Company model** | Minor cosmetic (hardcode "Teknisi"), rendah operational impact |
| **`desiredScheduleNote` schema cleanup** | Non-breaking deprecated field; cleanup bisa dilakukan saat ada migration lain |

---

## 19. Final Verdict

### READY WITH P1 FIXES

**Alasan:**

Sistem MedCal sudah memiliki foundasi yang solid dan benar untuk core operational chain PKM kalibrasi. State machine CalibrationJob terimplementasi dengan baik. Kontrol Alat sebagai intake/readiness artifact untuk SEND_TO_LAB sudah correct dengan dual-signature gate. Document numbering terpusat, atomic, dan menggunakan prefix yang benar. Security baseline acceptable untuk single-tenant PKM. Test coverage untuk domain kalibrasi (job, Kontrol Alat, rework, concurrent numbering) kuat.

**Sistem TIDAK bisa dianggap production-ready saat ini karena:**

1. **P1-01 (Certificate module)** — Chain operasional berhenti di "QA Approved". PKM tidak punya mekanisme digital untuk issue sertifikat resmi. Ini adalah deliverable utama PKM kepada customer.

2. **P1-02 (WorkOrder.done() gap)** — WO bisa di-close dengan jobs yang belum selesai. Ini adalah business logic error yang akan menyebabkan misleading records.

3. **P1-04 (tech-pwa tidak di prod)** — Teknisi tidak bisa menggunakan aplikasi PWA di production. Workflow teknisi tidak bisa dioperasikan.

4. **P1-08 (WOL tanpa nomor di PDF)** — Dokumen WOL yang dicetak tidak ter-identifikasi, tidak bisa digunakan sebagai dokumen kerja yang sah.

**Setelah Phase A dan sebagian Phase B selesai**, sistem akan siap untuk operational use dengan manual certificate workaround. Setelah Phase B lengkap (Certificate module), sistem sudah bisa di-claim sebagai fully digital end-to-end PKM system.

**P0 count: 0. Tidak ada blocker yang bersifat keamanan kritis atau data corruption.**

---

*Audit selesai. Tidak ada kode yang diubah, tidak ada schema yang dimodifikasi, tidak ada migration yang dibuat.*
