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
Ditemukan dari investigasi 50 dokumen `technician-docs.zip`:
- `LK Otoscope.docx` — isinya ternyata tes sumber cahaya (Intensitas Cahaya, Color Temperature,
  Color Rendering Index), cocoknya untuk keluarga alat Examination Lamp/Head Lamp/Lampu
  Operasi/Laryngoskop, bukan tes khusus otoscope.
- `LK Phaco Emulsifikasi.docx` — isinya ternyata tes vacuum/suction (pembacaan Naik/Turun),
  strukturnya identik dengan `LK Suction Pump.docx`, bukan tes khusus alat phaco-emulsifikasi
  (ultrasound power/flow/vacuum).

**Pertanyaan:** Apakah kedua file ini memang salah label/salah taruh konten saat dokumentasi
dibuat, atau ada penjelasan lain? Ini perlu dikonfirmasi sebelum kedua file ini dipakai sebagai
dasar seed parameter kalibrasi untuk Otoscope atau Phaco Emulsifikasi.

### A9. Cakupan device type ternyata lebih luas dari perkiraan (~49, bukan 35)
`technician-docs.zip` (50 dokumen) ternyata jauh lebih lengkap dari `Penilaian_Kemampuan.zip`
(30 dokumen) yang jadi basis kerja sebelumnya. Ada ~22 device type nyata yang belum punya
parameter kalibrasi ter-seed sama sekali: Audiometer, Auto Chemistry Analyzer, Autoclave, Bio
Safety Cabinet, Centrifuge/Centrifuge Refrigerator, CPAP, Dental Unit, Dental X-Ray, Electro
Accupunture, Examination Lamp, Fetal Doppler, Head Lamp Medik, Hematologi Analyzer, Infusion
Pump, Laminar Air Flow, Lampu Operasi, Laryngoskop, Mikroskop Laboratorium, pH Meter,
Phototherapy, Platelet Agitator Incubator, Rotator, Spirometer, Suction Pump, Syringe Pump.

**Pertanyaan:** Apakah semua ~22 device type ini memang aktif ditangani perusahaan (perlu
diprioritaskan untuk di-seed), atau ada beberapa yang sebenarnya sudah tidak aktif/jarang
dipakai (bisa ditunda lebih lama)?

---

## G. Desain Penyimpanan Hasil Pengukuran Teknisi (baru, dari investigasi 50 dokumen LK)

*(Area baru yang ditemukan lewat investigasi mendalam terhadap seluruh `technician-docs.zip`
— lihat `investigation-lk-vs-measurement-schema.md` untuk detail lengkap dan opsi desain.
Ini bukan pertanyaan yang bisa dijawab "ya/tidak" singkat — perlu diskusi desain, tapi
keputusan arahnya tetap butuh sign-off dari kamu/tim sebelum diimplementasikan.)*

### G1. Field toleransi belum ada sama sekali di `DeviceCalibrationParameter`
Ini gap paling mendasar — katalog 242 baris yang sudah kita bangun tidak punya tempat
menyimpan ambang batas pass/fail (misal "≤500µA"), padahal setiap LK selalu memasangkan
parameter dengan toleransinya. Sebelumnya ini sengaja tidak dimasukkan karena dianggap
spekulatif — sekarang sudah ada bukti nyata dari 50 dokumen bahwa ini memang dibutuhkan.
**Rekomendasi saya: tambahkan field ini ke master catalog** (bukan ditunda ke layer hasil
pengukuran), karena toleransi itu konstanta per device-type+parameter, bukan sesuatu yang
berubah-ubah per pengukuran individual. Perlu konfirmasi kamu sebelum saya siapkan prompt
migration untuk ini.

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

1. **F1** (Device.deviceTypeId) — ✅ sudah selesai dieksekusi dan terverifikasi.
2. **G1** (field toleransi di DeviceCalibrationParameter) — paling mendesak sekarang, karena
   ini fondasi yang harus ada sebelum layer hasil pengukuran teknisi bisa mulai dirancang.
3. **C3** (WorkOrder butuh purchaseOrderId) — memblokir modul WorkOrder (Blocker B4).
4. **G3** (JobReferenceEquipmentUsed) — low-risk, bisa dieksekusi cepat begitu disetujui.
5. **A1** (I:E Ratio) — ✅ sudah diputuskan dan diimplementasikan (`valueType` enum).
6. **G2, G4** (desain MeasurementEntry, struktur skor Telaah Teknis) — perlu diskusi desain
   lebih dulu, tidak seurgent G1/G3 tapi tetap memblokir modul CalibrationJob/Tech-PWA.
7. **A8** (konfirmasi 2 file LK salah label) — cepat dijawab, tapi sebaiknya sebelum dipakai
   untuk seeding parameter Otoscope/Phaco Emulsifikasi.
8. **A9** (prioritas 22 device type tambahan) — bisa dikerjakan paralel, tidak memblokir apa-apa.
9. Sisanya (B1, B2, C1, C2, D1, D2, E1-E3, A2-A3, A5-A7, F2) — penting tapi tidak
   memblokir pekerjaan yang sedang berjalan saat ini, bisa dikonfirmasi paralel.
