# FIX — Selaraskan Semua Nama Tampilan dengan Istilah Asli di Dokumen LK

## Mode
Tugas IMPLEMENTASI: update field `name` (dan HANYA field `name`) di 4 tabel:
`DeviceCategory`, `DeviceCapability`, `DeviceCapabilityItem`, `DeviceCalibrationParameter`.
JANGAN ubah `code`, `toleranceMin`/`toleranceMax`/`toleranceNote`, `uomId`, `valueType`,
`deviceTypeId`, `capabilityItemId`, atau field lain apapun — HANYA field `name`. Jangan ubah
schema, migration, atau tabel lain di luar 4 tabel ini.

## PENTING — pahami tujuan sebenarnya sebelum mulai

Tujuan tugas ini BUKAN "terjemahkan semua ke Bahasa Indonesia." Tujuannya: **pastikan setiap
nama yang tampil di sistem PERSIS sama dengan istilah yang tertulis di dokumen LK asli** yang
sudah biasa dipegang teknisi kalibrasi sehari-hari — supaya tidak ada jarak antara yang mereka
lihat di kertas kerja vs di layar aplikasi.

Contoh penting: LK Bed Side Monitor menulis "Kalibrasi Heart Rate" (bukan "Kalibrasi Detak
Jantung") — jadi kalau ternyata di database sekarang tersimpan "Heart Rate" (Inggris), itu
JANGAN diubah jadi "Detak Jantung," karena itu sudah cocok dengan istilah asli LK. Istilah
medis yang di LK memang ditulis dalam Bahasa Inggris/campuran (Heart Rate, NIBP, SPO2, Systole,
Diastole, dll) itu WAJAR dan HARUS dipertahankan seperti itu — jangan dipaksa
"diindonesiakan." Yang perlu diperbaiki adalah kebalikannya: kalau ada nama yang sekarang
tersimpan dalam istilah Inggris/teknis PADAHAL LK aslinya menulis istilah Indonesia (misal LK
menulis "Resistansi Pembumian Protektif" tapi sistem menyimpan "Protective Earth Resistance"),
itu yang harus dikoreksi ke istilah Indonesia sesuai LK.

**Prinsip: cocokkan ke sumber asli, jangan menerjemahkan bebas.** Untuk setiap baris, cari
kalimat/istilah PERSIS yang dipakai di tabel LK terkait, dan pakai itu (atau bentuk yang wajar
dari situ) — bukan hasil terjemahan Google Translate atau tebakan sendiri.

## Cakupan per tabel — beda perlakuan

### 1. DeviceCategory (13 baris) dan DeviceCapability (30 baris)
Kategori dan Kemampuan Pengukuran ini adalah **pengelompokan buatan sistem sendiri** — bukan
judul section yang persis ada di satu dokumen LK manapun (tidak ada LK yang punya bab berjudul
"Patient Monitoring"). Untuk 2 tabel ini, gunakan usulan nama Indonesia berikut sebagai
titik awal (boleh disesuaikan kalau kamu menemukan istilah yang lebih pas/konsisten dengan
bahasa yang dipakai di LK secara umum, tapi tidak perlu dicocokkan ke satu dokumen spesifik):

**DeviceCategory** (`code` → `name` baru):
- Patient Monitoring → Pemantauan Pasien
- Respiratory & Oxygen → Alat Pernapasan & Oksigen
- Neonatal & Infant Care → Perawatan Bayi & Neonatal
- Resuscitation → Resusitasi
- Suction & Fluid Management → Suction & Pengelolaan Cairan
- Sterilization → Sterilisasi
- Temperature Therapy → Terapi Suhu
- Cold Chain & Storage → Penyimpanan Dingin (Cold Chain)
- Patient Care → Perawatan Pasien
- Laboratory & Diagnostic Equipment → Alat Laboratorium & Diagnostik
- Dental Equipment → Alat Kedokteran Gigi
- Medical Lighting → Pencahayaan Medis
- Audiology & Physiological Testing → Audiologi & Uji Fisiologi

**DeviceCapability** (`code` → `name` baru):
- ENVIRONMENTAL_CONDITIONS → Kondisi Lingkungan
- ELECTRICAL_SAFETY → Keselamatan Listrik
- NIBP → Tekanan Darah Non-Invasif (NIBP)
- VITAL_SIGNS_MONITORING → Pemantauan Tanda Vital
- ECG_PERFORMANCE → Kinerja Elektrokardiografi (EKG)
- NIBP_LEAK_TEST → Uji Kebocoran Manset NIBP
- VENTILATION_PERFORMANCE → Kinerja Ventilasi
- RESUSCITATOR_PRESSURE → Tekanan Resusitator
- TEMPERATURE_CHAMBER_STERILIZATION → Suhu Ruang Sterilisasi
- TEMPERATURE_COLD_STORAGE → Suhu Penyimpanan Dingin
- INCUBATOR_ENVIRONMENT → Lingkungan Inkubator
- WARMER_SURFACE_TEMPERATURE → Suhu Permukaan Alat Penghangat
- HUMIDIFIER_TEMPERATURE → Suhu Humidifier
- VACUUM_SUCTION → Kinerja Vakum/Suction
- ROTATIONAL_SPEED → Kecepatan Putar
- INFUSION_FLOW → Laju Aliran Infus
- OPTICAL_MAGNIFICATION → Pembesaran Optik
- GAS_FLOW_RATE → Laju Aliran Gas
- OXYGEN_CONCENTRATION → Konsentrasi Oksigen
- ULTRASOUND_IMAGING → Pencitraan Ultrasonografi (USG)
- MASS_WEIGHING → Penimbangan Massa
- AUDIOMETRIC_PERFORMANCE → Kinerja Audiometri
- CLEAN_AIR_CONTAINMENT → Kebersihan & Kontainmen Udara
- DENTAL_UNIT_PERFORMANCE → Kinerja Unit Gigi
- XRAY_PERFORMANCE → Kinerja Sinar-X
- ELECTROTHERAPY_STIMULATION → Stimulasi Elektroterapi
- LIGHT_SOURCE_PERFORMANCE → Kinerja Sumber Cahaya
- FETAL_HEART_RATE → Detak Jantung Janin
- SPECTRAL_IRRADIANCE → Iradiansi Spektral (Fototerapi)
- SPIROMETRY_VOLUME_ACCURACY → Akurasi Volume Spirometri

Sebelum menerapkan daftar di atas, verifikasi dulu code-nya masih sama persis dengan yang ada
di database sekarang (mungkin ada penyesuaian kecil sejak terakhir dicatat) — cocokkan
berdasarkan `code`, bukan urutan/posisi.

### 2. DeviceCapabilityItem (98 baris) dan DeviceCalibrationParameter (jumlah saat ini, ~481+)
Untuk 2 tabel ini, JANGAN pakai daftar terjemahan siap pakai — WAJIB verifikasi satu per satu
ke dokumen sumbernya di `docs/technician-docs/`:

1. Untuk setiap baris, identifikasi dokumen LK dan baris tabel yang menjadi sumber asli baris
   ini (biasanya bisa ditelusuri dari `deviceTypeId`/`capabilityItemId` yang terhubung ke
   parameter tersebut, dan histori seeding sebelumnya kalau membantu).
2. Baca literal teks di tabel LK untuk parameter tersebut (kolom "Parameter" atau judul baris
   terkait).
3. Bandingkan dengan `name` yang tersimpan sekarang:
   - Kalau SUDAH cocok/konsisten dengan istilah LK (termasuk kalau LK-nya sendiri memang
     pakai istilah Inggris/campuran seperti "Heart Rate," "NIBP," "SPO2") — JANGAN diubah.
   - Kalau TIDAK cocok (LK pakai istilah Indonesia tapi sistem menyimpan versi Inggris hasil
     terjemahan/istilah teknis buatan sendiri) — perbaiki `name` supaya sesuai literal istilah
     LK.
4. Untuk baris yang tidak punya padanan literal 1:1 di LK (misal karena disusun dari beberapa
   sumber atau merupakan hasil generalisasi), gunakan istilah yang konsisten dengan gaya
   bahasa LK secara umum (dominan Bahasa Indonesia, dengan istilah medis Inggris/campuran
   dipertahankan apa adanya) — bukan tebakan bebas.

## Step 0 — Persiapan

1. Konfirmasi jumlah baris saat ini di keempat tabel (jangan asumsikan dari laporan lama —
   sudah ada perbaikan 7 baris Pattern C baru-baru ini yang mungkin mengubah jumlah).
2. Baca field `name` seluruh 4 tabel saat ini sebagai baseline "sebelum".

## Step 1-2 — Terapkan sesuai pembagian di atas

(Lihat cakupan per tabel di atas.)

## Step 3 — Verifikasi

1. Konfirmasi jumlah baris di 4 tabel tidak berubah (tugas ini cuma UPDATE field `name`,
   bukan tambah/hapus baris).
2. Konfirmasi field lain (code, tolerance, uomId, valueType, dst) di semua baris **tidak
   berubah sama sekali** — cuma `name` yang boleh berubah.
3. Jalankan typecheck/lint/build sesuai skrip proyek.
4. Cek UI Portal untuk beberapa halaman terkait (Categories, Capabilities, Calibration
   Parameters) — pastikan tidak ada yang crash karena perubahan teks (harusnya aman karena
   cuma ganti isi string, tapi konfirmasi).

## Output

Laporkan:
- Untuk `DeviceCategory` dan `DeviceCapability`: tabel sebelum/sesudah lengkap (semua 13 + 30
  baris, meski tidak berubah semua).
- Untuk `DeviceCapabilityItem` dan `DeviceCalibrationParameter`: HANYA baris yang benar-benar
  berubah namanya (jangan list semua ~579 baris kalau sebagian besar tidak berubah) — untuk
  setiap yang berubah, tampilkan: nama lama → nama baru, dan kutipan teks sumber LK yang jadi
  dasar perubahan.
- Baris yang tidak bisa dipastikan sumbernya (ambigu, tidak ketemu di LK manapun) — jangan
  ditebak, masukkan ke daftar terpisah untuk diputuskan manusia.
- Konfirmasi jumlah baris tidak berubah di 4 tabel, dan field selain `name` tidak tersentuh.
- Hasil typecheck/lint/build.
