# Rangkuman Gap yang Perlu Dikonfirmasi ke User/Stakeholder

Dokumen ini merangkum semua keputusan bisnis/domain yang masih terbuka dari seluruh proses
audit dan implementasi sejauh ini — dipisahkan dari keputusan teknis murni (pola kode,
migration, dsb) yang sudah kami putuskan sendiri. Setiap item di bawah butuh konfirmasi dari
orang yang punya otoritas bisnis/domain expertise (bisa kamu sendiri, tim lab kalibrasi, atau
manajemen), bukan keputusan yang bisa diselesaikan lewat coding lagi.

---

## A. Device Management & Calibration Parameter (paling banyak, paling perlu expert kalibrasi)

### A1. Representasi I:E Ratio (Ventilator)
`I:E Ratio` (misal "1:2", "1:3") tidak cocok dengan model `uomId` yang wajib diisi angka +
satuan fisik biasa. Perlu diputuskan: (a) buat `Uom` dimensionless khusus untuk rasio, (b)
keluarkan parameter ini dari `DeviceCalibrationParameter` untuk sementara, atau (c) cara lain
sesuai standar industri kalibrasi yang kamu tahu. **Status: belum diputuskan, saat ini
di-exclude dari seed data.**

### A2. 8 Device Type resmi (Kemenkes) tanpa dokumen LK
`Ambulatory ECG`, `Aspirators (Suction)`, `Cardiac Output Units`, `Oxygen-Air Proportioners`,
`Radiant Warmers (Adult)`, `Regulators (Air/O2/Suction)`, `Regulators (Low-Volume Suction)`,
`Paraffin Baths` — semua diakui Kemenkes tapi **tidak ada LK/lembar kerja** yang bisa dijadikan
dasar parameter kalibrasi. Perlu dikonfirmasi: apakah memang belum pernah dibuatkan LK-nya
(perlu dibuat dulu oleh tim teknis), atau LK-nya ada tapi belum di-upload/belum saya terima?

### A3. 8 Device Type ekstra (ada LK, tidak masuk 35 resmi Kemenkes)
`Autoclave`, `Centrifuge`, `Infuse Pump`, `Mikroskop`, `Syringe Pump`, `Timbangan Bayi`,
`Timbangan Dewasa`, `USG` — punya LK lengkap dan jelas ditangani perusahaan, tapi di luar
cakupan 35 item resmi. Keputusan: apakah perlu ditambahkan ke `DeviceType`/`DeviceCategory`
(mungkin butuh kategori baru, misal "Laboratory Equipment", "Imaging")? Kalau ya, kategori apa
yang tepat untuk masing-masing?

### A4. Review taksonomi `DeviceCapability`/`DeviceCapabilityItem` (21 capability, 66 item)
Saya susun ini dari 30 dokumen LK, tapi saya bukan ahli kalibrasi. Butuh tim teknis mengecek:
- Apakah pengelompokan sudah masuk akal secara praktik lab (misal: `Breast Pump` masuk kategori
  `Suction & Fluid Management` bersama `Aspirator` — saya asumsikan ini karena metode
  kalibrasinya sama-sama vacuum gauge, bukan karena fungsi klinisnya sama)?
- Apakah ada item yang seharusnya dipecah lebih detail, atau digabung?
- Apakah penamaan/istilah teknis yang saya pakai sudah sesuai istilah yang biasa dipakai
  tim kalibrasi kalian?

### A5. Kemungkinan duplikasi konsep dari daftar resmi Kemenkes
`Pulse Oximeters` vs `Oxymeter Monitor`, dan `Bed Side Monitor` vs `Patient Monitor` — di
daftar resmi keduanya item terpisah, tapi mungkin akan bikin bingung staff saat memilih di UI
karena namanya mirip. Perlu dikonfirmasi: memang dua alat berbeda, atau salah satu bisa
digabung/di-deprecate?

### A6. Prefix nomor dokumen untuk Invoice/Certificate/CreditNote
Cursor memilih `INV`, `CER`, `CRN` — sudah cukup standar, tapi belum ada konfirmasi eksplisit
dari kamu. Kalau sudah oke, tidak perlu tindakan; kalau mau diganti (misal `SRT` untuk
Certificate/Sertifikat mengikuti pola Bahasa Indonesia seperti `SPK` untuk WorkOrder), perlu
disampaikan sebelum dipakai di data produksi.

### A7. Backfill `DeviceModel` (merek/tipe alat)
Sengaja ditunda karena butuh inventarisasi nyata merek/model alat yang biasa ditangani. Perlu
diputuskan: kapan dan dari sumber apa data ini akan disiapkan (histori kerja, daftar device
customer yang sudah pernah dikalibrasi, dll)?

### A8. Konfirmasi 2 file LK yang kemungkinan salah label
✅ **SUDAH TERJAWAB.** Sudah dicek langsung isinya:
- File **"Otoscope"** ternyata isinya tes lampu (cahaya), sama persis dengan tes untuk lampu
  periksa lainnya. **Bukan alat "Otoscope" beneran** — ini file salah nama saja, isinya duplikat
  dari alat lampu yang sudah ada dokumennya sendiri. Tidak perlu dianggap sebagai jenis alat
  baru.
- File **"Phaco Emulsifikasi"** ternyata isinya tes alat suction/vacuum biasa, sama persis
  dengan tes untuk Suction Pump. **Bukan alat "Phaco Emulsifikasi" beneran** (alat itu untuk
  operasi katarak, seharusnya ada tes khusus kekuatan ultrasonik-nya, tapi tidak ada sama
  sekali di file ini). Ini juga file salah nama, isinya duplikat dari Suction Pump.

**Tidak perlu tindakan dari kamu** — dua "alat" ini tidak perlu dimasukkan ke sistem sebagai
jenis alat terpisah, karena memang bukan alat sungguhan yang beda, cuma nama file yang salah
taruh isi.

### A9. Cakupan device type ternyata lebih luas dari perkiraan
Setelah dicek ulang lebih teliti: ada **21 jenis alat baru** (bukan 22 seperti dugaan awal, ada
sedikit koreksi) yang belum dimasukkan ke sistem. Detail lengkapnya di item A12 di bawah.

---

## H. TEMUAN BARU — Perlu Perhatian Segera (dari pengecekan mendalam ke 50 dokumen LK asli)

### 🔴 H1 (PALING MENDESAK). Angka toleransi Tekanan Darah (NIBP) — beda antara dokumen lama dan baru

Ditemukan: dokumen LK **lama** untuk Blood Pressure Monitor bilang toleransi pengukuran
tekanan darah itu **±8 mmHg**. Tapi dokumen LK **terbaru** (yang jadi acuan sistem sekarang)
bilang **±5 mmHg** — jauh lebih ketat.

**Kenapa ini penting**: angka ±5 mmHg ini **sudah kepakai** di sistem sekarang untuk menilai
alat Blood Pressure Monitor, Bed Side Monitor, dan Patient Monitor (karena ketiganya
sama-sama mengukur tekanan darah). Kalau ternyata ±5 mmHg ini salah ketik atau dokumen yang
belum final, semua penilaian "lolos/tidak lolos" untuk tekanan darah di sistem bisa jadi
terlalu ketat dari yang seharusnya.

**Pertanyaan buat kamu**: Yang benar itu ±5 mmHg atau ±8 mmHg? Ini perlu dicek ke SOP resmi
kalibrasi tekanan darah kalian, atau ditanyakan ke penanggung jawab dokumen LK — apakah memang
sengaja diperketat, atau ini salah tulis waktu dokumen direvisi.

### 🔴 H2 (MENDESAK). Baby Incubator — satu item pengecekan "hilang" dari dokumen baru

Item "Waktu Pemulihan Suhu" (setelah alat dibuka lalu ditutup lagi, berapa lama suhunya balik
normal) — di dokumen lama ada angka batasnya: **maksimal 15 menit**. Tapi di dokumen baru,
judul bagiannya masih menyebut item ini, **tapi baris angkanya sudah tidak ada** di tabel.

**Kenapa ini penting**: ini kemungkinan besar cuma **kesalahan waktu dokumen direvisi**
(baris kehapus tidak sengaja), bukan keputusan sengaja menghilangkan pengecekan ini. Karena
baris ini kosong, sistem sekarang tidak bisa menilai lolos/tidak untuk item ini sama sekali.

**Pertanyaan buat kamu**: Apakah item "Waktu Pemulihan Suhu" untuk Baby Incubator ini memang
masih perlu dicek (dan angkanya tetap 15 menit), atau memang sudah tidak relevan lagi dan
sengaja dihapus? Kalau masih perlu, saya bisa masukkan angka 15 menit itu ke sistem.

### H3. Alat-alat baru yang perlu ditambahkan ke sistem
✅ **SELESAI.** Bukan 21 seperti perkiraan awal, tapi **24 jenis alat baru** berhasil
ditambahkan (koreksi dari perkiraan saya sebelumnya — beberapa alat yang saya kira "satu
kelompok" ternyata beberapa alat terpisah, misal 4 jenis lampu medis dan Infusion
Pump/Syringe Pump yang punya dokumen sendiri-sendiri). Detail:
- 4 kategori baru: Laboratory & Diagnostic Equipment, Dental Equipment, Medical Lighting,
  Audiology & Physiological Testing.
- 9 cara penilaian (capability) baru ditambahkan untuk alat yang belum ada pola
  pengukurannya (tes pendengaran, tes udara bersih ruangan, unit gigi, X-ray, terapi
  listrik, sumber cahaya, detak jantung janin, radiasi cahaya fototerapi, volume pernapasan).
- 12 satuan ukur (Uom) baru ditambahkan (lux, bar, dBA, kV, dll) — **termasuk temuan penting**:
  ternyata kode "RPM" yang sudah ada di sistem itu artinya "napas per menit" (dipakai di
  Ventilator), BUKAN "putaran per menit". Kalau tidak ketahuan, alat seperti Centrifuge/Rotator
  bisa salah pakai satuan. Sudah dipisah jadi kode baru `REV_MIN` khusus untuk putaran mesin.
- Data 27 alat lama (242 baris) **tidak disentuh sama sekali** — dicek dan dikonfirmasi aman.
- **Phototherapy** (alat terapi sinar untuk bayi kuning) tidak ada arahan eksplisit soal
  kategorinya di laporan investigasi — sistem menempatkannya di kategori "Neonatal & Infant
  Care" sebagai keputusan otonom (masuk akal secara klinis). Belum ada penolakan dari kamu,
  jadi dianggap diterima — kabari kalau ternyata perlu dipindah kategori lain.

Yang **sengaja belum dimasukkan** (masih menunggu H4, H5): Auto Chemistry Analyzer,
Hematologi Analyzer, pH Meter, Thermohygrometer, dan (memang bukan alat sungguhan)
Otoscope, Phaco Emulsifikasi.

### H4. 3 alat laboratorium butuh cara kerja yang beda total

**Auto Chemistry Analyzer**, **Hematologi Analyzer**, dan **pH Meter** ternyata tidak bisa
diperlakukan sama seperti alat lain. Alasannya: daftar parameter yang diukur dan batas
toleransinya itu **berubah-ubah tergantung reagen/larutan kontrol yang dipakai saat itu** —
bukan daftar tetap seperti alat lain (misal tensimeter selalu cek Systolic/Diastolic/MAP,
tapi alat kimia darah bisa cek puluhan parameter berbeda tergantung apa yang lagi dites).

**Pertanyaan buat kamu**: apakah untuk 3 alat ini kita perlu bikin cara kerja khusus di sistem
(staff bisa input nama parameter + batas toleransi secara manual per kalibrasi, bukan pilih
dari daftar tetap)? Ini bukan pekerjaan kecil, perlu didiskusikan desainnya dulu — jadi untuk
sekarang, 3 alat ini **belum akan dimasukkan ke sistem**, ditunda sampai ada keputusan.

### H5. Thermohygrometer — masuk kategori apa?

Alat ini agak unik — dia bukan alat yang dipakai ke pasien, tapi alat **referensi/pembanding**
yang dipakai teknisi untuk mengecek suhu-kelembaban ruangan saat kalibrasi alat lain. Karena
sifatnya beda dari alat-alat lain di sistem, perlu diputuskan masuk kategori apa.

**Pertanyaan buat kamu**: apakah Thermohygrometer ini perlu masuk sistem sebagai alat yang
juga dikalibrasi & punya sertifikat sendiri (kalau iya, saya usulkan kategori baru khusus
"Alat Referensi/Instrumen Ukur"), atau alat ini di luar cakupan sistem (cuma alat kerja
internal, tidak perlu tercatat)?

### H6. Sanity-check kecil: toleransi cahaya Laryngoskop kelihatan aneh

Batas kecerahan cahaya untuk Laryngoskop di dokumen sama persis dengan batas untuk Lampu
Operasi (40.000-160.000 lux) — angka ini jauh lebih terang dari wajarnya alat genggam kecil
seperti laryngoskop. Kemungkinan ini **salah copy-paste** waktu dokumennya dibuat (nomor
Lampu Operasi ketiban ke Laryngoskop tanpa disesuaikan).

**Pertanyaan buat kamu**: bisa tolong dicek ke tim kalibrasi, apakah angka ini memang benar
untuk Laryngoskop, atau memang salah copy dari Lampu Operasi? Tidak menghalangi alat ini
dimasukkan ke sistem sekarang (saya tetap masukkan apa adanya dari dokumen), tapi perlu
dikoreksi belakangan kalau memang salah.



## G. Desain Penyimpanan Hasil Pengukuran Teknisi (baru, dari investigasi 50 dokumen LK)

*(Area baru yang ditemukan lewat investigasi mendalam terhadap seluruh `technician-docs.zip`
— lihat `investigation-lk-vs-measurement-schema.md` untuk detail lengkap dan opsi desain.
Ini bukan pertanyaan yang bisa dijawab "ya/tidak" singkat — perlu diskusi desain, tapi
keputusan arahnya tetap butuh sign-off dari kamu/tim sebelum diimplementasikan.)*

### G1. Field toleransi belum ada sama sekali di `DeviceCalibrationParameter`
✅ **SELESAI.** `toleranceMin`/`toleranceMax` (Decimal) + `toleranceNote` (teks asli dari LK)
sudah ditambahkan dan **242 dari 242 baris berhasil di-backfill** dari dokumen sumber asli.
Detail penting:
- 88 baris dapat min+max, 26 cuma min, 83 cuma max, 45 tidak dapat keduanya (bukan kegagalan
  — lihat penjelasan di bawah), 241/242 punya `toleranceNote` terisi.
- Cuma **1 baris gagal di-resolve**: `INCU_RECOVERY_TIME` (tabel di LK ada judulnya, tapi
  baris toleransinya memang kosong di dokumen asli).
- **Penting**: `technician-docs.zip` (sumber utama 50 dokumen) ternyata **tidak punya LK
  Ventilator**. Semua baris `VENTILATOR` (termasuk `VENT_IE_RATIO`) diambil dari sumber
  cadangan: `docs/legal_n_competency/Penilaian Kemampuan.zip`. Ini sudah dicatat jelas di
  laporan implementasi untuk keperluan audit trail.
- **Temuan penting untuk G2** (baca sebelum desain `MeasurementEntry`): 45 baris yang tidak
  dapat `toleranceMin`/`toleranceMax` itu BUKAN gap data — itu parameter yang toleransinya
  berbentuk *"±delta dari titik setting yang berubah-ubah"* (misal Systolic diuji di 7 titik
  tekanan berbeda 60-250 mmHg, masing-masing ±5mmHg). Di level master catalog, memang tidak
  ada satu window absolut yang bisa dihitung — nominalnya baru diketahui saat pengukuran nyata
  dilakukan. `toleranceNote` (yang menyimpan teks asli seperti "± 5 mmHg") jadi bahan baku
  untuk logika ini nanti di layer `MeasurementEntry`.
- Kasus class-dependent (misal leakage current beda untuk Class I/II) ditangani dengan
  menyimpan kasus umum secara numerik + detail lengkap di `toleranceNote` — simplifikasi yang
  diakui, bukan solusi struktural penuh (baris terdampak: `BSM_EQUIP_LEAKAGE`,
  `PM_EQUIP_LEAKAGE`, `ECG_EQUIP_LEAKAGE`, `BREASTP_EQUIP_LEAKAGE`, plus `INCU_AIR_TEMP` dan
  `BREASTP_MAX_VACUUM` yang punya kriteria multi-band).

### G2. Bagaimana menampung ~10 pola struktur data pengukuran yang berbeda
Data hasil pengukuran teknisi ternyata jauh lebih beragam bentuknya dari dugaan awal (grid
setting×replikasi, tabel performa ganda per device, data logger eksternal yang tidak dicatat
di LK, daftar parameter dinamis/tidak tetap namanya, nilai kualitatif tanpa angka, nilai
turunan/hitungan, tabel reference-vs-UUT berpasangan, dll). Laporan investigasi mengusulkan
model `MeasurementEntry` dengan sedikit field fleksibel + celah `Json` untuk kasus yang benar-
benar tidak beraturan. **Pertanyaan:** apakah pendekatan ini (structured core + JSON escape-
hatch) sesuai dengan yang kamu bayangkan, atau ada preferensi desain lain?

### G3. "Daftar Alat yang Digunakan" (referensi alat standar per job) belum punya tempat
Ini muncul di SEMUA 50 dokumen tanpa kecuali — daftar alat referensi (Vital Signs Simulator,
Electrical Safety Analyzer, dll beserta merek/model/serial) yang dipakai teknisi untuk job
tertentu. Ini gap yang paling jelas dan low-risk untuk diselesaikan (bentuknya tidak banyak
variasi antar device type) — kemungkinan besar cukup satu model baru sederhana. Tidak perlu
banyak diskusi, kemungkinan bisa langsung dieksekusi begitu kamu setuju.

### G4. Struktur skor "Telaah Teknis" bervariasi, termasuk 1 varian yang beda total
Skor umumnya 3 kategori berbobot (Kondisi Alat/Keselamatan Listrik/Kinerja Peralatan), tapi
bobotnya berubah-ubah (10/40/50 paling umum, tapi ada juga 10/40/60, 20/80, 10/90 tergantung
device). Satu dokumen (`LK Kelistrikan`, worksheet instalasi listrik generik, bukan device
spesifik) malah pakai skema klasifikasi 5-tingkat yang sama sekali berbeda (bukan skor
berbobot). **Pertanyaan:** apakah `LK Kelistrikan` ini memang alur kerja terpisah dari
kalibrasi device biasa (mungkin tidak perlu masuk ke `CalibrationJob` sama sekali), atau tetap
harus diakomodasi dalam sistem yang sama?



## B. Aturan Bisnis CalibrationRequest

### B1. Field apa yang masih boleh diedit setelah status bukan DRAFT?
Saat ini implementasi cuma mengizinkan edit selagi status DRAFT (interpretasi paling aman).
Perlu dikonfirmasi: apakah ada field tertentu yang tetap boleh diubah setelah statusnya maju
(misal catatan/notes), atau memang harus sepenuhnya terkunci?

### B2. Mekanisme transisi ke status IN_QUOTATION
Siapa/apa yang men-trigger perubahan status dari SUBMITTED ke IN_QUOTATION — otomatis saat
Quotation dibuat, atau manual oleh staff? Ini menentukan desain integrasi CalibrationRequest
↔ Quotation module nanti.

---

## C. Aturan Bisnis Purchase Order & Work Order

### C1. Kontradiksi dokumen: PurchaseOrderStatus butuh IN_FULFILLMENT/PARTIALLY_FULFILLED?
Planning doc `purchase-order.md` punya dua bagian yang saling bertentangan — satu bagian minta
status ini ada, bagian lain bilang tidak perlu karena partial tracking sudah cukup di level
CalibrationJob/Certificate. Implementasi saat ini ikut versi "tidak perlu". Perlu konfirmasi:
apakah dokumennya perlu direvisi supaya konsisten, dan apakah keputusan "tidak perlu" ini
benar final?

### C2. Pola tax PurchaseOrder (`taxCode` + snapshot) vs Quotation/Invoice (`taxId` FK)
Desain PO pakai snapshot (`taxCode` + `taxRateSnapshot`) demi preservasi historis, beda pola
dari Quotation/Invoice yang pakai FK langsung ke master Tax. Ini valid secara desain, tapi
perlu dikonfirmasi: apakah inkonsistensi pola ini disengaja/diterima, atau sebaiknya
diselaraskan supaya lebih mudah di-maintain ke depannya?

### C3. WorkOrder butuh `purchaseOrderId` (blocker B4)
Schema WorkOrder saat ini cuma punya `quotationId` wajib. Rencananya ditambah
`purchaseOrderId` wajib, dengan `quotationId` diturunkan dari situ. Perlu konfirmasi final
sebelum migration dijalankan — apakah pendekatan ini masih yang diinginkan?

---

## D. Status & State Machine yang Belum Terdefinisi

### D1. `CalibrationJobStatus` tidak punya status CANCELLED
Saat ini workaround-nya hapus row job kalau perlu dibatalkan. Perlu diputuskan: tambah status
`CANCELLED` eksplisit (lebih baik untuk audit trail), atau workaround ini diterima?

### D2. Arti `TECHNICALLY_DONE` vs `CLOSED` di WorkOrderStatus
Belum ada dokumentasi jelas beda semantiknya. Dugaan saya: `TECHNICALLY_DONE` = semua job
selesai tapi QA/invoicing belum, `CLOSED` = benar-benar tuntas. Perlu dikonfirmasi sebelum
modul WorkOrder mulai dibangun, supaya tim dev tidak salah pakai.

---

## E. Kebijakan Operasional/Finansial

### E1. Aturan pembulatan (rounding) untuk kalkulasi finansial
Belum ada dokumentasi eksplisit. Asumsi umum industri: `HALF_UP`, 2 desimal. Perlu konfirmasi
apakah ini sesuai kebijakan internal kalian, terutama untuk perhitungan pajak/diskon.

### E2. Idempotency untuk submit ganda (double-submit protection)
Saat ini belum ada mekanisme idempotency-key di endpoint pembuatan dokumen. Untuk Customer,
risikonya sudah dimitigasi lewat unique constraint (email/taxId). Untuk Quotation/PO/Invoice
nanti, perlu diputuskan: cukup dengan unique constraint juga, atau perlu idempotency-key
eksplisit dari awal (lebih aman tapi effort tambahan)?

### E3. `companyId` tanpa foreign key di beberapa tabel child
`QuotationItem`, `InvoiceItem`, `Payment`, `WorkOrderAssignment`, `CalibrationRequestItem`
punya `companyId` tapi tidak di-FK ke `Company` — integritas datanya bergantung pada
aplikasi, bukan dijamin database. Untuk sistem single-tenant seperti sekarang, risikonya
rendah. Perlu konfirmasi: diterima sebagai risiko yang bisa ditoleransi untuk MVP, atau mau
diperbaiki sekarang?

---

## F. Keputusan Arsitektur yang Sudah Diputuskan Tapi Belum Dieksekusi

*(Bukan butuh keputusan baru — cuma perlu dikonfirmasi ulang bahwa keputusan sebelumnya masih
berlaku sebelum benar-benar dieksekusi, karena sempat tertunda beberapa lama.)*

### F1. `Device.deviceTypeId` — FK wajib ke katalog `DeviceType`
Sudah diputuskan (Opsi A: `deviceTypeId` wajib, `brand`/`model` tetap teks bebas sebagai
fallback), tapi migration-nya **belum pernah dieksekusi/dibuatkan prompt Cursor-nya**. Perlu
dikonfirmasi masih sesuai keinginan sebelum dijalankan.

### F2. Linkage `MeasurementResult` ↔ `DeviceCalibrationParameter`
Belum ada rancangan sama sekali — baru sebatas "disadari sebagai gap". Perlu direncanakan
sebelum modul CalibrationJob/Tech-PWA mulai dibangun, supaya hasil pengukuran teknisi di
lapangan bisa tervalidasi terhadap katalog parameter yang sudah dibangun, bukan cuma JSON
bebas format.

---

## Ringkasan Prioritas

Kalau harus diurutkan mana yang paling mendesak dikonfirmasi duluan (karena memblokir
pekerjaan berikutnya):

1. **🔴 H1** (toleransi NIBP ±5 vs ±8 mmHg) — **PALING MENDESAK**, data ini sudah dipakai
   sistem sekarang, perlu konfirmasi cepat apakah benar.
2. **🔴 H2** (Baby Incubator waktu pemulihan suhu hilang) — mendesak, tapi tidak separah H1
   karena cuma bikin 1 item tidak bisa dinilai (bukan salah nilai).
3. **F1** (Device.deviceTypeId) — ✅ sudah selesai dieksekusi dan terverifikasi.
4. **G1** (field toleransi di DeviceCalibrationParameter) — ✅ sudah selesai, 242/242 baris
   ter-backfill, 1 baris tidak bisa di-resolve (`INCU_RECOVERY_TIME`, wajar — lihat H2).
5. **H3** (24 alat baru) — ✅ selesai, sudah masuk sistem lengkap dengan toleransinya.
6. **G3** (JobReferenceEquipmentUsed) — ✅ selesai (schema saja, CRUD/UI menyusul saat modul
   CalibrationJob dibangun).
7. **C3** (WorkOrder butuh purchaseOrderId) — memblokir modul WorkOrder (Blocker B4).
8. **A1** (I:E Ratio) — ✅ sudah diputuskan dan diimplementasikan (`valueType` enum).
9. **H4** (3 alat lab butuh cara kerja beda) — perlu keputusan desain dulu, ditunda.
10. **H5** (Thermohygrometer masuk kategori apa) — perlu keputusan cepat, tidak rumit.
11. **H6** (cek toleransi Laryngoskop) — tidak menghalangi apa-apa, bisa dicek belakangan.
12. **G2, G4** (desain MeasurementEntry, struktur skor Telaah Teknis) — perlu diskusi desain
    lebih dulu, tidak seurgent G3 tapi tetap memblokir modul CalibrationJob/Tech-PWA.
13. Sisanya (B1, B2, C1, C2, D1, D2, E1-E3, A2-A3, A5-A7, F2) — penting tapi tidak
    memblokir pekerjaan yang sedang berjalan saat ini, bisa dikonfirmasi paralel.
