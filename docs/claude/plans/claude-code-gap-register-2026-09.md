# Gap Register Sistem — 2026-09-12

Dokumen ini mencakup SELURUH modul sistem MedCal (Calibration Management),
bukan hanya MeasurementResult. Setiap klaim di bawah diverifikasi ke
kode/schema aktual pada 2026-09-12 (bukan disalin mentah dari dokumen
lama) kecuali ditandai "belum diverifikasi ulang" secara eksplisit.

**Batasan investigasi**: sesi ini tidak memiliki akses SSH/DB langsung ke
VPS production. Bukti terakhir bahwa database production benar-benar
live adalah verifikasi manual oleh Afriza pada 2026-08-27 (query SQL
langsung di Postgres native VPS). Dokumentasi terbaru (audit
containerization) menyatakan stack Docker baru (`docker-compose.prod.yml`,
4 app: api/web-api/web/portal) sudah tervalidasi lokal tapi **belum
di-cutover ke VPS**; aplikasi yang benar-benar melayani traffic hari ini
kemungkinan masih berjalan di bawah PM2 di luar repo ini. **Status deploy
hari ini (2026-09-12) TIDAK diverifikasi ulang dalam investigasi ini** —
ditandai eksplisit di setiap sub-bagian yang relevan.

**Catatan keamanan (di luar scope investigasi ini, sudah disampaikan
langsung ke Afriza)**: `.env.production.example` di root repo berisi
nilai yang terlihat seperti kredensial database asli, bukan placeholder
seperti bagian lain file tersebut — perlu diperiksa/dirotasi terpisah.

---

## Ringkasan

- **Total gap tercatat**: 47 (34 technical, 13 business — beberapa item
  beririsan keduanya dan dihitung sekali di kategori dominan)
- **Prioritas Tinggi**: 9
- **Prioritas Sedang**: 21
- **Prioritas Rendah**: 17
- **Modul dengan runtime penuh** (schema+service+API+UI ada): CalibrationRequest, Quotation, PurchaseOrder, WorkOrder, CalibrationJob, MeasurementResult
- **Modul schema-only / belum dibangun sama sekali**: Certificate, Invoice, Payment (+ InvoiceItem, InvoiceCertificate, CreditNote, ReminderEvent)
- **Temuan penting yang mengoreksi asumsi lama**: REWORK lifecycle
  (submitForReview/returnForRework/resumeAfterRework) **sudah dibangun**
  penuh sejak 2026-09-10; Physical condition checklist **sudah dibangun**
  (backend+tech-pwa) tapi seed data master 246 item belum dieksekusi;
  BA (Berita Acara) Identity Correction didesain sebagai foto lembar
  fisik, bukan PDF ter-generate sistem — jadi "belum selesai" di catatan
  lama adalah salah paham, bukan gap.

---

## Per Modul

### CalibrationRequest

**Runtime**: penuh — schema (`CalibrationRequest`, `CalibrationRequestItem`,
`schema.prisma:1470,1510`), service
(`apps/api/src/modules/calibration-requests/calibration-requests.service.ts`
+ `calibration-request-import.service.ts`), API (8 route termasuk
import preview/confirm, submit, cancel), UI Portal lengkap (list, detail,
edit, new, import CSV). Tidak ada UI tech-pwa (memang tidak relevan —
modul customer/admin).

**Technical gap**:
- TODO nyata di kode: `calibration-requests.service.ts:205` — aturan
  bisnis edit-permission belum dikonfirmasi, saat ini hanya izinkan edit
  saat status DRAFT ("safest interpretation").
- TODO nyata di kode: `calibration-requests.service.ts:314` — transisi
  status ke `IN_QUOTATION` belum di-wire dari modul Quotation (worked
  around: hanya DRAFT→SUBMITTED dan apapun→CANCELLED yang jalan).

**Business gap**:
- B1: field mana yang boleh diedit setelah status bukan DRAFT — belum
  ada keputusan resmi, implementasi saat ini "DRAFT-only" adalah asumsi
  aman sementara.
- B2: siapa/apa yang men-trigger transisi `SUBMITTED → IN_QUOTATION` —
  otomatis saat Quotation dibuat, atau manual? Belum diputuskan.
- AKD/AKL/NIE (Nomor Izin Edar) hanya Phase 1: field nullable,
  self-declared customer di `CalibrationRequestItem`. Belum ada:
  `Device.akdAklNumber` di master, laporan peringatan dini lintas
  WO→PO→Quotation→Requisition, snapshot terverifikasi teknisi di level
  CalibrationJob, workflow approval/gate TECHNICIAN_MANAGER, state
  `NOT_APPLICABLE`/`EXCEPTION_PENDING`.

---

### Quotation

**Runtime**: penuh — schema (`Quotation`, `QuotationItem`,
`schema.prisma:1610,1645`), service + PDF generator, API 9 route
(termasuk preview, send, approve, reject, cancel), UI Portal lengkap
termasuk compose email pengiriman quotation.

**Technical gap**:
- `ServiceTariff` model — dormant, hanya dipakai sebagai satu validasi
  `count()` di `quotations.service.ts:179`, tidak ada controller/module,
  tidak dikonsumsi UI manapun. Efektif stub, bukan master data yang
  benar-benar dikelola (kontras dengan `PriceListItem` yang punya CRUD
  admin penuh).
- Bug qty hardcode `"1"` yang mengabaikan quantity asli requisition —
  **sudah diperbaiki** di Price List Phase 1 (2026-08-30), dicatat di
  bagian "sudah selesai" di bawah.
- C2 (dari HANDOFF lama): `PurchaseOrder` pakai `taxCode`+`taxRateSnapshot`
  (Decimal snapshot) sementara Quotation/Invoice pakai `taxId` FK — pola
  tidak konsisten, belum ada keputusan apakah ini sengaja atau perlu
  diselaraskan.

**Business gap**:
- Price List (dasar harga Quotation) belum mendukung: pricing per mode
  layanan (ON_SITE vs SEND_TO_LAB), pricing per parameter, pricing
  khusus per customer/kontrak, tiered/quantity-break pricing, job
  auto-expire quotation, audit trail override harga manual
  (`isPriceOverridden`/`overriddenBy` tidak pernah ditambahkan).
  Nasib model `ServiceTariff` yang dormant juga belum diputuskan
  (dibiarkan, dihapus, atau diaktifkan).
- Tidak ada kolom `priceListItemId` di `QuotationItem` untuk traceability
  harga yang dipakai.

---

### PurchaseOrder (PO)

**Runtime**: penuh — schema (`PurchaseOrder`, `PurchaseOrderItem`,
`schema.prisma:1672,1708`), service + PDF generator, API 7 route
(approve, cancel, pdf), UI Portal lengkap.

**Technical gap**: tidak ada TODO/FIXME ditemukan di kode modul ini.

**Business gap** (dari audit PO 2026-08-27, beberapa sudah diresolusi
pragmatis untuk MVP):
- D7: apakah pembatalan CalibrationRequest harus diblokir jika sudah
  ada Quotation/PO yang approved — belum diputuskan.
- Alur pembuatan WorkOrder otomatis saat PO di-approve — **belum
  diimplementasikan** (WorkOrder tetap dibuat manual terpisah).
- Compose email PO ke customer, e-signature customer, approval via
  WhatsApp — semua **belum diimplementasikan**; `customerApprovedAt`
  saat ini di-stamp oleh staf internal, bukan hasil approval customer
  yang sebenarnya (tidak ada flow customer-facing approval).
- Catatan operasional: seed `seed:menu` perlu dijalankan ulang di setiap
  environment baru (bukan gap desain, tapi catatan deployment).
- Status PO disederhanakan untuk MVP jadi DRAFT→APPROVED→CANCELLED saja
  (tanpa RECEIVED/CONFIRMED/FULFILLED yang sempat diusulkan) — sudah
  final, bukan gap terbuka, dicatat di bagian "sudah selesai".

---

### WorkOrder

**Runtime**: penuh — schema (`WorkOrder` + 6 model terkait termasuk
`WorkOrderAssignment`, `WorkOrderEquipment`, `EquipmentDeliveryNote`),
service + 2 varian PDF (SPK/WOL), API terluas kedua (equipment proposal,
confirm, request-review, accessories, assign, start, done, cancel), UI
Portal lengkap dengan section khusus equipment & delivery note.

**Technical gap**:
- O-5 / **BLOCKER bersama CalibrationJob**: `CalibrationJob.deviceId`
  adalah FK wajib ke master `Device`, tapi rantai identitas bisnis
  (`CalibrationRequestItem.deviceId`) berbasis free-text dan tidak
  reliable sampai ke row `Device` yang benar. Perbaikan yang
  direkomendasikan (relax FK, key job by `purchaseOrderItemId`)
  **belum diimplementasikan** — flagged eksplisit sebagai blocker di
  audit 2026-08-31, statusnya masih sama hari ini.
- O-7: tidak ada field `cancelledAt`/`cancelledBy`/reason saat WorkOrder
  dibatalkan — gap audit trail.
- O-4: SPK/WOL tidak punya kolom blok tanda tangan.
- Placeholder-by-design (bukan bug) di
  `work-order-pdf-spk.ts:25` — field dicetak kosong bila data tak
  tersedia, ini sengaja.

**Business gap**:
- O-8: satuan quantity WorkOrder/Job — utuh (unit) vs desimal — belum
  diputuskan.
- O-10: RBAC — hanya role ADMIN yang boleh create/assign/cancel
  WorkOrder. TECHNICIAN bahkan tidak punya `workOrder:read` untuk
  melihat SPK miliknya sendiri (mereka melihat lewat CalibrationJob) —
  perlu keputusan apakah ini disengaja atau perlu diperluas.
- Kepemilikan/lifecycle "dokumen teknisi kedua" (Surat Jalan untuk
  On-Site, tanda terima untuk In-Lab) sempat tidak jelas — **sudah
  diresolusi** lewat modul Delivery Note (lihat bawah), dicatat di
  bagian "sudah selesai".

---

### CalibrationJob

**Runtime**: penuh, dan merupakan modul paling kompleks — mencakup
`CalibrationJob`, `KontrolAlat` (+accessory/signature), `CalibrationTestPoint`,
`MeasurementResult`, `PhysicalCheckResult`, `JobEvidence`,
`JobReferenceEquipmentUsed`, `IdentityCorrection` (+signature),
`QualityReview`. ~35 route di controller, UI Portal (back-office) +
tech-pwa (teknisi lapangan) lengkap termasuk wizard Identity Correction.

**Technical gap**:
- `CalibrationJobStatus` **tidak punya value CANCELLED** — workaround
  saat ini adalah menghapus row job secara langsung. Masih terbuka
  sejak 2026-09-07.
- Semantik `WorkOrderStatus.TECHNICALLY_DONE` vs `CLOSED` tidak
  terdokumentasi — berpotensi ambigu bagi pengembang berikutnya.
- **`JobEvidence` dan `CustomerSignature`**: model schema ADA (dan
  relasinya ke `CalibrationJob` ada), tapi **nol consumer** di seluruh
  apps/api, apps/portal, apps/tech-pwa — tidak ada fitur upload foto
  evidence maupun capture tanda tangan customer di level job yang benar-
  benar berjalan, walau `FileOwnerType.JOB_EVIDENCE` dan `SIGNATURE`
  ada di enum. Ini schema yang dibangun mendahului fitur yang belum
  pernah di-wire.
- Validasi "certificate-mandatory-before-CONFIRMED" untuk reference
  equipment yang dipakai — belum ditegakkan di kode.
- 1 permission RBAC basi: `me.controller.ts:199` masih mengecek
  `calibrationJob:assignDevice`, padahal action ini sudah dihapus dari
  katalog (`access-control.ts`) dan seed-nya sudah dibackfill-hapus.
  Selalu bernilai `false`, dan field hasilnya (`calibrationJobAssignDevice`)
  tidak dibaca oleh frontend manapun — dead code kecil, bukan risiko
  keamanan (rute lama sudah jadi 410 Gone).

**Business gap — Reference Equipment traceability** (10 pertanyaan dari
audit Phase 2A, belum satupun diputuskan resmi):
kepemilikan alat referensi (milik PKM vs pinjam/milik customer), tanggal
otoritatif untuk validitas kalibrasi saat dipakai di job (`asOf` di
`resolveCalibrationValidity` tidak pernah di-wire ke tanggal job
sebenarnya), warning vs block bila kalibrasi alat referensi kadaluarsa,
kosakata hasil kalibrasi ("result" masih free-text, belum enum),
penanganan hasil out-of-tolerance, siapa yang berwenang menerima unit
baru, masa retensi bukti, proses unit rusak/keluar-servis, pengecekan
antara (intermediate checks), traceability level-parameter, entitas
provider kalibrasi eksternal, tracking custody/lokasi alat, dan kit/sub-
komponen. Juga 6 worksheet alat referensi belum bisa dipasangkan ke
DeviceType manapun (Auto Chemistry Analyzer, Hematologi Analyzer,
Otoscope, Phaco Emulsifikasi, pH Meter, Thermohygrometer) dan 3 klaster
duplikat berpotensi (Thermohygrometer, Thermometer 12-channel,
Lux/Luxmeter) belum diverifikasi.

**Identity Correction** (bagian dari CalibrationJob):
- Model **BA (Berita Acara) tidak pernah didesain sebagai PDF ter-
  generate sistem** — desainnya adalah foto lembar fisik yang sudah
  ditandatangani, diupload sebagai `FileObject` biasa. Catatan lama
  "BA PDF generation initiated, belum selesai" adalah **salah paham**,
  bukan gap yang perlu ditutup.
- Batas ukuran file foto tanda tangan: **10 MiB**, dikonfirmasi langsung
  di kode (`identity-correction-file-owner-policy.ts:27`), bukan 25 MiB
  seperti sempat dipertanyakan. (25 MB adalah `client_max_body_size`
  nginx terluar; 20 MiB cap global aplikasi; 10 MiB adalah kebijakan
  spesifik tipe file ini, sama dengan kebijakan PDF equipment-calibration-
  record.)
- Model foto tanda tangan sempat salah desain (satu foto per
  penandatangan) dan dikoreksi di tengah sesi 2026-09-05 menjadi satu
  foto untuk seluruh lembar fisik, dimiliki oleh record `IdentityCorrection`
  itu sendiri — sudah final, dicatat di "sudah selesai".

---

### MeasurementResult

**Runtime**: penuh (schema `CalibrationTestPoint`+`MeasurementResult`,
service dengan tolerance-resolution engine, API 5 route, UI tech-pwa +
Portal).

**4 HARD STOP dari brief Afriza — status terverifikasi ulang**:
1. **~20 tipe device Excel belum di taxonomy** — masih terbuka,
   terkonfirmasi via `unscoped-calibration-results-catalog-extraction.md`
   (2026-09-08): Auto Chemistry Analyzer, Defibrillator (4 varian),
   Echocardiograph, GCU/HB, Hematologi Analyzer, Light Cure, Otoscope
   (isi sebenarnya Laryngoscope — data corrupt judul), Phaco Emulsifikasi,
   Thermohygrometer (+varian), Thermometer Ear/IR, Thermometer Klinik,
   Timbangan (3 varian), USG, Urine Analyzer.
2. **Ventilator PIF/PEF belum ada parameter code** — masih terbuka.
   Excel punya tabel peak inspiratory/expiratory flow tapi tidak ada
   kapabilitas/parameter code untuk itu di catalog (per
   `calibration-results-five-steps-implementation-report.md`). Catatan
   tambahan: tidak ada LK resmi untuk Ventilator sama sekali — seluruh
   test point Ventilator yang sudah diseed (8 parameter, 213 baris)
   berasal dari sumber fallback (`LK Ventilator Transport.pdf`), dan
   `VENT_IE_RATIO` secara eksplisit **tidak ikut diseed** karena datanya
   berupa serial Excel yang rusak (mis. `0,04375` bukan `1:2`).
3. **decimalPlaces masih 0** — **angka berubah dari 81 menjadi 488** baris
   NUMBER masih di placeholder 0 (per `DecimalPlaces_Backfill_Proposal.md`,
   2026-09-08, berbasis 491 parameter aktif). Dari 488 itu, 179 diusulkan
   **tetap** 0 (memang tanpa nilai desimal — mis. RATIO/BOOLEAN atau
   parameter tanpa presisi tercatat), 309 diusulkan berubah ke nilai
   presisi tertentu. **Proposal ini baru diterapkan di database lokal
   (pkmdb), belum diterapkan ke production.**
4. **Status deploy VPS** — tidak diverifikasi ulang langsung dalam
   investigasi ini (lihat catatan pembuka dokumen). Bukti terakhir: DB
   production dikonfirmasi live 2026-08-27 via query manual Afriza;
   seluruh pekerjaan Stage 1/2/2a/2b/2c/CalibrationTestPoint seeding/
   Physical Inspection/REWORK di atas tanggal itu **eksplisit dicatat
   sebagai "applied to local pkmdb only, not deployed to VPS"** di setiap
   implementation report yang menyebutnya. Artinya seluruh redesign
   MeasurementResult (skema baru, tolerance engine, REWORK lifecycle,
   Physical Inspection) **kemungkinan besar belum ada di production**
   sampai dikonfirmasi ulang secara manual — ini risiko tinggi karena
   berarti gap antara apa yang "sudah selesai" secara kode vs apa yang
   benar-benar dipakai teknisi di lapangan hari ini bisa signifikan.

**REWORK/currentAttempt (submitForReview/returnForRework/resumeAfterRework)**
— **catatan lama sudah usang. Ini SUDAH dibangun penuh** (backend
2026-09-10, UI tech-pwa "Lanjutkan perbaikan" + Portal "Tolak" dialog
sama hari). Lifecycle terkunci: `QualityReview` dibuat saat keputusan
(bukan saat submit), REJECT increment `currentAttempt` + reset
`submittedAt`, APPROVE tidak otomatis lompat ke `ACCEPTED_BY_QA` (perlu
aksi `complete` terpisah), permission `recordMeasurement` **dicabut dari
TECHNICIAN_MANAGER** (MT jadi review-only). 140 test lulus, 2 gagal
flaky tidak terkait REWORK.

**Physical condition checklist (Baik/Tidak Baik)** — **sudah dibangun**
backend (`DevicePhysicalCheckItem`+`PhysicalCheckResult`, RBAC
`recordPhysicalCheck`) dan UI tech-pwa (2026-09-10), TAPI:
- **Seed data master (246 item, 44 DeviceType) belum pernah dijalankan**
  — draft sudah direview (`READY_FOR_REVIEW`) tapi script seed tidak
  pernah dibuat/dieksekusi. Artinya fitur ini secara teknis "ada" tapi
  **tidak bisa dipakai untuk device manapun** sampai seed dijalankan.
  Ini gap teknis prioritas tinggi karena fitur terlihat selesai di
  laporan tapi non-fungsional di lapangan.
- 6 worksheet LK tidak match ke DeviceType manapun (sama daftarnya
  dengan poin Reference Equipment di atas), `PATIENT_MONITOR` tidak
  punya sumber LK sama sekali.
- Portal UI Physical Inspection berstatus "PASS WITH NOTES" — verifikasi
  browser/E2E belum selesai (server dev sempat down saat sesi
  verifikasi).
- `inspectionLimit` saat ini wajib diisi di form karena skema Zod
  mengunci `min(1)` — keputusan bisnis apakah field ini harus optional
  belum diambil.

**Telaah Teknis (5-tier Kelistrikan)**:
- Belum ada model terpisah untuk scoring terstruktur "Telaah Teknis".
  `QualityReview` saat ini hanya punya `decision`/`status`/catatan bebas.
- `LK Kelistrikan.docx` punya struktur unik: bukan physical-check
  Baik/Tidak Baik biasa, melainkan **klasifikasi risiko 5-tingkat**
  ("Penilaian Secara Menyeluruh" — dari "aman, tidak ada penyimpangan"
  sampai "disarankan modifikasi") — beda total dari skema bobot 3-kategori
  (10/40/50, 10/40/60, 20/80, 10/90 — bobot tidak konsisten antar
  dokumen) yang dipakai device lain. Belum ada keputusan desain.

**Wording "Sesuai/Tidak sesuai" vs LK, dual-class leakage, VENT_IE_RATIO,
logger 30×9, identity-corrupt files** — semua terkonfirmasi masih relevan:
- "Sesuai/Tidak sesuai" adalah label pass/fail `MeasurementResult`
  (`passFailChip()`), sengaja **tidak dipakai ulang** oleh Physical
  Inspection (yang pakai Baik/Tidak Baik) — sudah final by design.
- Dual-class leakage current (Class I ≤500µA vs Class II ≤100µA) dan
  kasus serupa (`INCU_AIR_TEMP` 2 tolerance by posisi sensor,
  `BREASTP_MAX_VACUUM` 3 band Low/Medium/High) — ditangani dengan
  menyimpan kasus umum/Class-I secara numerik, detail lengkap di
  `toleranceNote` teks bebas. Berfungsi tapi bukan solusi terstruktur.
- `VENT_IE_RATIO`: representasi diselesaikan lewat enum baru
  `CalibrationValueType.RATIO`, tapi test point-nya sendiri **tidak ikut
  diseed** karena data sumber rusak (lihat HARD STOP #2).
- Logger 30×9 vs summary: 7-8 file kulkas/oven/sterilizer punya grid
  30 titik waktu × 9 sensor yang diketik manual di LK.
  `entryStyle = LOGGER_SUMMARY` tetap jadi pengecualian Stage A yang
  benar; keputusan UI Stage C (min/max+lampiran vs transkrip penuh
  grid) **belum diambil**.
- Identity-corrupt files: `Mikropipet.xlsx` (isi = Baby Incubator),
  `Kelistrikan.xlsx` (isi = Hematologi Analyzer), `Uji Fungsi Fisik.xlsx`
  (Nama Alat = Laser Ndyag) — semua tercatat, belum ada tindak lanjut
  data karena memang di luar scope (evidence corpus, bukan data
  produksi).

**Temuan tambahan dari verifikasi**:
- G2 (10 pola struktur data pengukuran berbeda) — masih terbuka.
  Investigasi `investigation-lk-vs-measurement-schema.md` menegaskan
  schema saat ini **tidak bisa merepresentasikan LK asli**:
  `DeviceCalibrationParameter` sama sekali tidak punya field
  tolerance/threshold, minimal 10 bentuk struktural berbeda ditemukan
  di 50 LK asli, dan 2 elemen struktural (alat referensi per-job,
  scoring Telaah Teknis) tidak punya rumah schema sama sekali (yang
  pertama sudah dibangun sebagai `JobReferenceEquipmentUsed` sejak
  dokumen itu ditulis; yang kedua masih terbuka, lihat di atas).
- Hanya 27 dari ~49 tipe device asli yang punya `DeviceCalibrationParameter`
  ter-seed — konsisten dengan HARD STOP #1.

---

### Certificate

**Runtime**: **schema-only, tidak dibangun sama sekali.**
- Schema ada penuh (`Certificate`, `schema.prisma:2496-2536` — termasuk
  status, billingStatus, verificationToken, rantai supersedes/
  supersededBy untuk revoke, link pdfFileObjectId, link invoice,
  reminder events).
- Service: **tidak ada** — nol file `certificate*.service.ts`.
- API: **tidak ada** controller/route. Satu-satunya sentuhan di seluruh
  `apps/api` adalah guard hapus di `devices.service.ts:206`
  (`prisma.certificate.count(...)` untuk cek sebelum delete Device).
- UI: **tidak ada** di Portal maupun tech-pwa.
- RBAC: permission `certificate: read, create, update, issue` terdaftar
  di katalog, tapi **nol enforcement point dan nol seeded RolePermission
  row** untuk role manapun — hanya SUPERADMIN (bypass hardcode) yang
  bisa lewat, dan tidak ada rute yang menggunakannya sama sekali.

**Kesimpulan**: ini adalah ujung rantai CalibrationJob→QualityReview yang
belum pernah disambung ke aksi nyata "terbitkan sertifikat". Business gap
utama: kapan/bagaimana job yang sudah APPROVED menjadi Certificate resmi
belum didesain sama sekali (di luar scope investigasi ini untuk
mengusulkan desainnya).

---

### Invoice

**Runtime**: **schema-only, tidak dibangun sama sekali.**
- Schema ada (`Invoice`, `InvoiceItem`, `InvoiceCertificate`,
  `schema.prisma:2562-2613`, plus `CreditNote:2654`, `ReminderEvent:2683`
  untuk dunning).
- Service/API: **nol** — grep "invoice" di seluruh `apps/api/src`
  menghasilkan nol match.
- UI: **tidak ada** di Portal/tech-pwa — satu-satunya referensi "invoice"
  di Portal adalah label string statis di halaman permission-management
  (`invoice: "Invoice"`, sekadar nama tampilan untuk picker permission,
  bukan fitur).
- RBAC: permission `invoice: read, create, update, void` terdaftar,
  nol enforcement, nol seed row — sama seperti Certificate.

**Kesimpulan**: tidak ada gap teknis "bug" karena memang tidak ada kode
untuk dievaluasi. Business gap: seluruh alur billing (bagaimana Invoice
dibuat dari Certificate/CalibrationJob, siapa yang approve, bagaimana
`CreditNote` dan `ReminderEvent`/dunning bekerja) belum diputuskan sama
sekali — modul ini murni scaffolding skema untuk pekerjaan masa depan.

---

### Payment

**Runtime**: **schema-only, tidak dibangun sama sekali.**
- Schema ada (`Payment`, `schema.prisma:2630-2652` — amount, method enum,
  paidAt, reference, notes, link ke Invoice).
- Service/API/UI: **nol** referensi di seluruh apps/api, apps/portal,
  apps/tech-pwa.
- RBAC: permission `payment: read, create, update, reconcile` terdaftar,
  nol enforcement, nol seed row.

**Kesimpulan**: sama seperti Invoice — murni scaffolding. Business gap:
metode pembayaran yang didukung, siapa yang mencatat, rekonsiliasi
dengan Invoice — semua belum diputuskan.

---

### Modul Pendukung

#### Identity Correction
(Detail lengkap di bagian CalibrationJob di atas — modul ini secara
schema/service/API adalah bagian dari `calibration-jobs` module, bukan
modul terpisah.) Ringkasan: **runtime penuh**, BA = foto bukan PDF
(bukan gap), file size 10 MiB (terverifikasi), model foto tanda tangan
sudah dikoreksi dan final.

#### AKD/AKL Escalation
Bagian dari CalibrationJob (`escalateIdentity`, `approveIdentity` RBAC
actions ada dan dipakai). Business gap terbuka: `Device.akdAklNumber`
di master belum ada, tidak ada laporan peringatan dini AKD/AKL kadaluarsa
lintas dokumen, tidak ada snapshot AKD/AKL terverifikasi teknisi di level
job, tidak ada `AuditLog` khusus, state `NOT_APPLICABLE`/`EXCEPTION_PENDING`
belum ada. Ada laporan `AkdAkl_AutoTransition_Mismatch_Report.md` yang
mengindikasikan ada ketidaksesuaian transisi otomatis — **belum
diverifikasi ulang isinya di pass investigasi ini** (file belum terbaca
penuh), direkomendasikan sebagai follow-up.

#### Reference Equipment
(Detail lengkap di bagian CalibrationJob.) Runtime penuh untuk data
master (`EquipmentType`, `Equipment`, `EquipmentCalibrationRecord`,
`DeviceTypeEquipmentRequirement`) dan pemakaian per-job
(`JobReferenceEquipmentUsed` dengan FK asli + override validity oleh
TECHNICIAN_MANAGER). 10 keputusan bisnis besar masih terbuka (lihat di
atas) — ini salah satu area dengan gap bisnis terbanyak yang belum
diambil keputusannya.

#### RBAC / Permission
Runtime penuh (`RolePermission` DB-driven, `access-control.ts` sebagai
katalog tunggal, `hasPermission()` sebagai satu-satunya titik enforcement,
SUPERADMIN bypass hardcode). Grep TODO/FIXME/HACK di seluruh apps/api,
apps/portal, apps/tech-pwa: **hanya 2 TODO nyata ditemukan** (keduanya
sudah dicatat di bagian CalibrationRequest), portal dan tech-pwa **nol**
TODO/FIXME/HACK.

Gap yang ditemukan:
- Permission `certificate`, `invoice`, `payment` terdaftar di katalog
  tapi nol enforcement & nol seed row (konsisten dengan status
  schema-only ketiga modul itu — bukan bug, hanya scaffolding
  mendahului fitur).
- 1 permission basi: `calibrationJob:assignDevice` masih dicek di
  `me.controller.ts:199` walau sudah dihapus dari katalog dan seed
  (lihat detail di CalibrationJob) — dead code, prioritas rendah.
- Tidak ditemukan drift lain: setiap `@RequirePermission(...)` decorator
  di seluruh controller cocok dengan katalog.

#### Notification
- **Email**: runtime penuh — `packages/notifications/src/email`,
  modul `apps/api/src/modules/emails` (termasuk IMAP sync, lead
  suggestion dari email), Portal punya UI mail-client penuh
  (inbox/sent/drafts/trash/compose).
- **WhatsApp**: ada implementasi di `packages/notifications/src/whatsapp`
  (ditemukan insidental, di luar yang ditanyakan, tapi relevan untuk
  konteks channel notifikasi yang tersedia).
- **FCM/push**: **masih skeleton**, bukan fitur end-to-end yang selesai.
  Ada plumbing (service worker, `FCMToken` model, endpoint push-tokens,
  `notification-dispatch.service.ts`), tapi per catatan sesi 2026-09-05
  status "🟡 in progress, belum dikonfirmasi selesai" untuk penanganan
  pesan error push. `running-tasks.md` juga mencatat kode error
  `IDENTITY_CORRECTION_*`/`FILE_*`/`DEVICE_*` belum di-mapping di
  tech-pwa. **Kesimpulan: FCM push masih deferred/belum production-ready**,
  sesuai catatan lama — dampaknya dikurangi karena Email dan WhatsApp
  sudah berfungsi sebagai channel notifikasi alternatif.

#### File / Storage
Runtime penuh untuk kebutuhan dasar: `FilesModule`
(`apps/api/src/modules/files`), `StorageDriver` interface dengan hanya
`local-disk.driver.ts` yang diimplementasi (S3/MinIO didesain-untuk via
interface tapi belum dibangun — komentar aspirational, bukan stub error).
Business gap dari audit file-infrastructure (belum diputuskan):
kepemilikan & jadwal backup (backup saat ini manual via
`scripts/backup-medcal.sh`, non-scheduled, tidak ada salinan off-site),
masa retensi sertifikat/dokumen, kebijakan amandemen setelah CONFIRMED,
ukuran file maksimum final per jenis dokumen, jenis file lain selain PDF,
multi-dokumen per kalibrasi, atribusi `uploadedByUserId` untuk file yang
dibuat sistem, verifikasi checksum saat download, konsistensi lintas
restore, virus scanning, lokasi/kuota storage VPS.

#### Auth
Runtime penuh, berbasis `@thallesp/nestjs-better-auth` (`AuthModule`),
guard `company-role.guard.ts`, package client bersama `packages/auth`.
Tidak ada TODO/FIXME ditemukan. Satu gap terkait: **`CustomerUserLink`
model schema ada tapi nol consumer di seluruh repo** — flow linking user
customer-portal ke record `Customer` belum pernah di-wire. Tidak jelas
apakah ini memang belum diprioritaskan atau terlewat.

#### Master Data (Device, DeviceType, Equipment, Customer)
Runtime penuh untuk seluruh model master data inti. Gap yang
terkonfirmasi:
- **`deviceId` auto-suggest dari serial number — dikonfirmasi sebagai
  gap nyata**, tidak ditemukan desain maupun implementasi di manapun.
  Yang ada hanyalah "Device Name Alias" (fuzzy-match nama device yang
  diketik customer ke `DeviceType`) dan pencarian device-candidates untuk
  Identity Correction — keduanya bukan serial-number-based suggestion.
  Investigasi terpisah (`investigation-deviceid-akdakl-nullability-flow.md`)
  menegaskan belum ada logika match-or-create/serial-lookup/deteksi
  duplikat sama sekali untuk kasus ini.
- Taxonomy tumbuh jadi 24 tipe device baru (bukan ~21/22 seperti
  estimasi awal) — 7 baris `DeviceCapabilityItem` yatim (Ultrasound,
  Timbangan) belum terhubung ke DeviceType manapun, keputusan
  (selesaikan seeding atau hapus) belum diambil.
- 8 tipe device resmi Kemenkes tidak punya LK sama sekali; 8 tipe
  device lain punya bukti LK nyata tapi tidak termasuk dalam daftar
  resmi 35 — keduanya masih terbuka sebagai keputusan taxonomy.
- Prefix nomor dokumen `INV`/`CER`/`CRN` dipilih sepihak oleh proses
  implementasi sebelumnya, belum dikonfirmasi eksplisit oleh Afriza —
  relevan kalau/ketika Invoice/Certificate akhirnya dibangun.

---

## Gap Prioritas Tinggi

| Modul | Nama Gap | Tipe | Dampak Bisnis | Risiko Teknis | Alasan |
|---|---|---|---|---|---|
| Certificate / Invoice / Payment | Seluruh ekor billing (terbit sertifikat → invoice → payment) belum dibangun sama sekali | Business + Technical | TINGGI — blocker roadmap (lab tidak bisa menagih/menerbitkan sertifikat resmi lewat sistem) | RENDAH (belum dibangun, belum ada risiko aktif) | Ini bagian akhir siklus bisnis inti yang sudah dijanjikan skema tapi nol implementasi; makin lama ditunda makin besar backlog & makin banyak proses manual di luar sistem |
| MeasurementResult | Deploy status: seluruh redesign (skema baru, tolerance engine, REWORK, Physical Inspection) tercatat "local pkmdb only" di setiap laporan sejak 2026-08-13, belum diverifikasi ulang ke VPS hari ini | Technical | TINGGI — risiko data/sertifikat salah bila teknisi lapangan masih pakai versi lama di production | TINGGI — kalau ternyata belum di-deploy, seluruh pekerjaan Sep 2026 tidak berdampak nyata ke operasional | Gap antara "selesai di kode" vs "dipakai di lapangan" adalah risiko operasional terbesar yang ditemukan di seluruh investigasi ini |
| MeasurementResult | Physical Inspection: fitur backend+UI sudah dibangun tapi seed data master 246 item belum pernah dijalankan | Technical | TINGGI — fitur yang "terlihat selesai" di laporan sebenarnya tidak bisa dipakai untuk device manapun | SEDANG (bukan bug aktif, tapi blocker fungsional total) | Tanpa seed, checklist kondisi fisik tidak muncul untuk device apapun — gap ini gampang tidak disadari karena kode & UI sudah "hijau" |
| CalibrationJob / WorkOrder | `CalibrationJob.deviceId` FK wajib ke Device master, padahal rantai identitas bisnis riil berbasis free-text yang tidak reliable | Technical | TINGGI — job bisa terikat ke record Device yang salah/tidak tepat | TINGGI — berpotensi data kalibrasi tersimpan di bawah identitas alat yang keliru | Sudah di-flag eksplisit sebagai blocker sejak 2026-08-31, perbaikan direkomendasikan tapi belum dikerjakan; menyangkut integritas data inti lab kalibrasi |
| MeasurementResult | ~20 tipe device dari Excel evidence belum ada di taxonomy (HARD STOP #1) | Business + Technical | TINGGI — parameter kalibrasi untuk device ini tidak bisa dicatat sama sekali di sistem | SEDANG (belum dibangun, bukan bug aktif) | 20 tipe device adalah porsi signifikan dari total ~49 tipe nyata — pekerjaan lab riil untuk device ini terpaksa di luar sistem |
| MeasurementResult | Ventilator PIF/PEF tidak ada parameter code, dan seluruh test point Ventilator berasal dari sumber fallback (bukan LK resmi) | Business + Technical | TINGGI — device Ventilator terkait keselamatan pasien langsung | SEDANG | Ketiadaan LK resmi + parameter kosong berarti hasil kalibrasi Ventilator berisiko tidak lengkap/akurat |
| MeasurementResult | H1: Diskrepansi toleransi NIBP (±8 mmHg dokumen lama vs ±5 mmHg yang live di sistem) belum dikonfirmasi | Business | TINGGI — toleransi yang salah = sertifikat kalibrasi salah untuk alat tekanan darah | RENDAH (sudah ada satu nilai berjalan di sistem, tinggal konfirmasi) | Menyangkut keselamatan pasien; harus dikonfirmasi ke tim kalibrasi sebelum makin banyak alat dikalibrasi dengan nilai yang belum tentu benar |
| Certificate / Invoice / Payment (RBAC) | Permission `certificate`/`invoice`/`payment` terdaftar di katalog tanpa satupun enforcement/seed row | Technical | SEDANG — bukan risiko aktif hari ini | RENDAH hari ini, tapi akan jadi TINGGI begitu modul dibangun tanpa RBAC direview ulang | Perlu direview bersamaan saat modul dibangun agar tidak ada permission "hantu" yang tidak jelas siapa pemiliknya |
| MeasurementResult | Telaah Teknis / 5-tier Kelistrikan — belum ada model scoring terstruktur, bobot penilaian tidak konsisten antar 50 dokumen LK | Business + Technical | TINGGI — kesimpulan akhir kalibrasi (lulus/tidak) untuk kategori ini tidak konsisten secara desain | SEDANG | Ini bagian dari kesimpulan resmi sertifikat kalibrasi; ketidakkonsistenan bobot penilaian antar device berisiko menghasilkan keputusan lulus/tidak yang tidak standar |

---

## Gap Prioritas Sedang

| Modul | Nama Gap | Tipe |
|---|---|---|
| MeasurementResult | H2: Baby Incubator `INCU_RECOVERY_TIME` — nilai batas hilang antar revisi dokumen, belum dikonfirmasi | Business |
| MeasurementResult | H6: Toleransi cahaya Laryngoskop identik dengan Lampu Operasi — dugaan copy-paste, belum diverifikasi tim kalibrasi | Business |
| MeasurementResult | G2: ~10 pola struktur data pengukuran berbeda, schema `DeviceCalibrationParameter` belum punya field tolerance/threshold | Technical |
| MeasurementResult | Logger 30×9 vs summary — keputusan UI Stage C (transkrip penuh vs min/max+lampiran) belum diambil | Business |
| MeasurementResult | 9 tipe device di catalog resmi tidak punya Excel evidence terisi (Breast Pumps, Cold Chain, Dental X-Ray, dll.) | Business |
| CalibrationJob | `JobEvidence` & `CustomerSignature` — schema ada, nol consumer; fitur upload evidence foto & tanda tangan customer di level job belum pernah di-wire | Technical |
| CalibrationJob / Reference Equipment | 10 keputusan bisnis belum diambil (kepemilikan alat, tanggal validitas otoritatif, warning vs block, dst.) | Business |
| CalibrationJob | `CalibrationJobStatus` tidak punya value CANCELLED, workaround hapus row langsung | Technical |
| CalibrationJob / AKD-AKL | `AkdAkl_AutoTransition_Mismatch_Report.md` mengindikasikan ketidaksesuaian transisi otomatis — belum diverifikasi ulang dalam pass ini | Technical |
| CalibrationJob / AKD-AKL | `Device.akdAklNumber` master field, laporan peringatan dini, snapshot terverifikasi teknisi, `AuditLog`, state NOT_APPLICABLE/EXCEPTION_PENDING — semua belum ada | Business |
| WorkOrder | `CalibrationJob.deviceId` blocker — lihat prioritas tinggi (baris duplikat referensi, dampak WorkOrder sisi assignment) | Technical |
| WorkOrder | Tidak ada `cancelledAt`/`cancelledBy`/reason saat WorkOrder dibatalkan | Technical |
| WorkOrder | RBAC: hanya ADMIN boleh create/assign/cancel; TECHNICIAN tidak punya `workOrder:read` untuk lihat SPK sendiri | Business |
| WorkOrder / Delivery Note | Tidak ada mekanisme void/reissue Delivery Note selain edit DB langsung | Technical |
| PO | D7: apakah pembatalan CalibrationRequest harus diblokir oleh Quotation/PO yang sudah approved | Business |
| PO | Alur auto-create WorkOrder saat PO approve, compose email PO, e-signature/approval WhatsApp customer — belum diimplementasikan | Business |
| Quotation | `ServiceTariff` dormant, nasibnya belum diputuskan; pola `taxCode+taxRateSnapshot` (PO) vs `taxId` FK (Quotation/Invoice) tidak konsisten | Technical |
| Quotation / Price List | Pricing per mode layanan, per parameter, per customer/kontrak, tiered, auto-expire quotation, audit trail override harga — semua belum ada | Business |
| Notification | FCM/push masih skeleton, penanganan pesan error belum dikonfirmasi selesai, kode error tertentu belum di-mapping tech-pwa | Technical |
| File/Storage | Kebijakan backup, retensi, amandemen, checksum-verify, virus scan, kuota VPS — semua belum diputuskan | Business |
| Master Data | 8 tipe device resmi tanpa LK; 8 tipe device dengan LK tapi di luar daftar resmi 35; 7 `DeviceCapabilityItem` yatim | Business |

---

## Gap Prioritas Rendah

| Modul | Nama Gap | Tipe |
|---|---|---|
| CalibrationJob (RBAC) | Permission basi `calibrationJob:assignDevice` masih dicek di `me.controller.ts:199`, selalu false, tidak dikonsumsi frontend | Technical |
| CalibrationRequest | TODO edit-permission rules belum dikonfirmasi (workaround DRAFT-only sudah aman) | Business |
| CalibrationRequest | TODO transisi `IN_QUOTATION` belum di-wire otomatis dari Quotation | Technical |
| WorkOrder | Placeholder cetak field kosong di SPK PDF (`work-order-pdf-spk.ts:25`) — memang sengaja, bukan bug | Technical |
| WorkOrder | Satuan quantity (utuh vs desimal) belum diputuskan | Business |
| WorkOrder | SPK/WOL tidak punya kolom blok tanda tangan | Business |
| Auth | `CustomerUserLink` model schema ada, nol consumer — flow linking user customer-portal belum di-wire | Technical |
| Master Data | Prefix nomor dokumen `INV`/`CER`/`CRN` belum dikonfirmasi eksplisit oleh Afriza | Business |
| Master Data | `deviceId` auto-suggest dari serial number belum dibangun/didesain | Business |
| File/Storage | S3/MinIO storage driver didesain-untuk (interface ada) tapi belum diimplementasi — hanya local-disk | Technical |
| Reference Equipment | 6 worksheet alat referensi tidak match ke DeviceType manapun; 2 worksheet ambigu belum dipasangkan; typo sumber data (Particel Counter, dll.) | Business |
| Notification | WhatsApp channel ada, di luar cakupan pertanyaan awal tapi relevan sebagai mitigasi FCM belum selesai | — (informational) |
| Ops/Security | `.env.production.example` berisi nilai yang terlihat seperti kredensial asli, bukan placeholder | Technical (ops, di luar scope perbaikan investigasi ini) |
| Quotation | Tidak ada kolom `priceListItemId` di `QuotationItem` untuk traceability harga | Technical |
| PO | Catatan operasional: `seed:menu` perlu dijalankan ulang tiap environment baru | Technical (ops) |
| Deployment | Tidak ada `prisma migrate deploy` otomatis di pipeline manapun — migrasi production selalu manual/out-of-band | Technical (ops) |
| Deployment | Stack Docker baru (`docker-compose.prod.yml`) tervalidasi lokal tapi belum di-cutover ke VPS; app lama kemungkinan masih jalan di PM2 di luar repo | Technical (ops) |

---

## Item Lama yang Ternyata Sudah Selesai / Tidak Relevan

- **REWORK/currentAttempt (submitForReview/returnForRework/resumeAfterRework)**
  — catatan lama bilang "belum ada endpoint". **Ini sudah dibangun
  penuh** (backend + UI Portal/tech-pwa) sejak 2026-09-10.
- **Physical condition checklist (Baik/Tidak Baik)** — catatan lama
  bilang "belum ada model". **Model dan runtime sudah dibangun**
  (backend+tech-pwa, 2026-09-10) — meski seed datanya belum dijalankan
  (lihat Prioritas Tinggi).
- **BA (Berita Acara) PDF generation "initiated, belum selesai"** —
  ini **salah paham dari awal**. BA tidak pernah didesain sebagai PDF
  ter-generate sistem; desainnya adalah foto lembar fisik yang
  ditandatangani, dan ini sudah berjalan sesuai desain.
- **Model foto tanda tangan Identity Correction** — sempat salah
  desain (satu foto per penandatangan), **sudah dikoreksi** (2026-09-05)
  jadi satu foto per lembar fisik, dimiliki record `IdentityCorrection`.
- **Ukuran file Identity Correction "10 MiB vs 25 MiB belum dikonfirmasi"**
  — **sudah terkonfirmasi**: 10 MiB, langsung dari kode.
- **decimalPlaces "81 baris masih 0"** — angka sudah berubah jadi 488
  baris (basis data parameter bertambah dari 242 ke 491) — bukan berarti
  gap bertambah, tapi perhitungannya perlu diperbarui, dan proposal
  perbaikannya (179 tetap 0, 309 berubah) sudah ada meski belum
  diterapkan ke production.
- **Status PO tanpa RECEIVED/CONFIRMED/FULFILLED** — sempat jadi
  perdebatan desain, sudah final diputuskan untuk MVP (DRAFT→APPROVED→
  CANCELLED saja).
- **Cardinality WorkOrder vs PO dan status vocabulary** — sempat
  "NOT READY" di audit pertama, sudah diresolusi di audit kedua dan
  diimplementasikan.
- **"Dokumen teknisi kedua" (Surat Jalan On-Site / tanda terima In-Lab)**
  — sempat tidak jelas nama/lifecycle-nya, **sudah dibangun penuh**
  sebagai modul Delivery Note (2026-09-01), termasuk layer prasyarat
  `WorkOrderEquipment`.
- **Bug qty hardcode "1" di form Quotation** yang mengabaikan quantity
  requisition asli — **sudah diperbaiki** di Price List Phase 1.
- **`Device.deviceTypeId` FK** — sempat pending, **sudah selesai**
  dikonfirmasi (per HANDOFF §5B/§10 dan verifikasi model saat ini).
