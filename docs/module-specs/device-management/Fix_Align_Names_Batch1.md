# FIX — Selaraskan Nama Item & Parameter dengan LK Asli (Batch 1 dari 4)

## Mode
Tugas IMPLEMENTASI: update field `name` (HANYA `name`) di `DeviceCapabilityItem` dan
`DeviceCalibrationParameter`, TAPI dibatasi HANYA untuk baris yang terkait dengan `DeviceType`
di 3 kategori berikut: **Patient Monitoring, Respiratory & Oxygen, Resuscitation**. JANGAN
sentuh baris untuk device type di kategori lain — itu akan dikerjakan di batch terpisah
(2, 3, 4) supaya tiap batch bisa direview sendiri-sendiri.

JANGAN ubah `code`, `toleranceMin`/`toleranceMax`/`toleranceNote`, `uomId`, `valueType`,
`deviceTypeId`, `capabilityItemId`, atau field lain apapun — HANYA `name`. Jangan ubah
`DeviceCategory` atau `DeviceCapability` — itu sudah selesai di Phase 1 (Batch 0).

## Konteks — sudah dikerjakan sebelumnya

Phase 1 sudah selesai: `DeviceCategory` (13 baris) dan `DeviceCapability` (30 baris) sudah
diselaraskan ke Bahasa Indonesia. Task ini (Batch 1 dari total 4 batch) melanjutkan ke level
lebih detail: `DeviceCapabilityItem` (98 baris total, hanya sebagian yang masuk batch ini) dan
`DeviceCalibrationParameter` (489 baris total, hanya sebagian yang masuk batch ini).

Sebelumnya (di task lain) semua 50 dokumen LK di `docs/technician-docs/` sudah pernah
diekstrak jadi teks — kalau ekstraksi itu masih tersedia/bisa dipakai ulang, silakan gunakan
supaya tidak perlu ekstrak dari nol; kalau tidak yakin masih valid, ekstrak ulang untuk
memastikan akurat.

## PENTING — prinsip yang sama seperti Phase 1, ulangi di sini

Tujuan BUKAN "terjemahkan semua ke Bahasa Indonesia." Tujuannya: **nama yang tampil di sistem
harus PERSIS sama dengan istilah yang tertulis di dokumen LK asli** yang sudah biasa dipegang
teknisi. Istilah medis yang di LK memang ditulis Inggris/campuran (Heart Rate, NIBP, SPO2,
Systole, Diastole, dll) itu WAJAR dan HARUS dipertahankan apa adanya — JANGAN dipaksa
"diindonesiakan." Yang perlu diperbaiki adalah kebalikannya: kalau nama tersimpan dalam istilah
Inggris/teknis buatan sendiri PADAHAL LK aslinya menulis istilah Indonesia, itu yang dikoreksi
ke istilah Indonesia sesuai LK. Cocokkan ke sumber asli, jangan menerjemahkan bebas.

## Step 0 — Persiapan

1. **Konfirmasi target database**: pastikan koneksi menunjuk ke `pkmdb` lokal
   (`localhost:5432`, via `.env`) — BUKAN Docker/staging/production. Kalau ragu, berhenti dan
   tanya dulu.
2. Query `DeviceType` untuk mendapatkan daftar persis device type yang masuk 3 kategori batch
   ini (`Patient Monitoring`, `Respiratory & Oxygen`, `Resuscitation` — cocokkan by relasi ke
   `DeviceCategory`, bukan menebak nama device type). Laporkan daftar lengkapnya sebelum
   lanjut, supaya jelas cakupan batch ini persis device type apa saja.
3. Dari daftar device type itu, kumpulkan semua `DeviceCapabilityItem` (via
   `DeviceCalibrationParameter.capabilityItemId` yang terhubung ke device type-device type
   tersebut — ingat `DeviceCapabilityItem` itu tabel global/reusable, jadi HANYA update baris
   item yang benar-benar dipakai oleh device type di batch ini, jangan sentuh item yang juga
   dipakai device type di batch lain meski secara teknis "boleh" — untuk batch ini cukup fokus
   ke bagian yang relevan, batch lain akan menangani device type-nya masing-masing) dan semua
   `DeviceCalibrationParameter` yang `deviceTypeId`-nya masuk daftar batch ini.
4. Catat baseline (jumlah baris dan isi `name` saat ini) sebelum ada perubahan.

## Step 1 — Verifikasi dan perbaiki nama, satu per satu

Untuk setiap baris `DeviceCapabilityItem` dan `DeviceCalibrationParameter` dalam cakupan batch
ini:
1. Temukan dokumen LK sumber di `docs/technician-docs/` yang sesuai (berdasarkan device type
   terkait).
2. Baca literal teks di tabel LK untuk parameter/item tersebut.
3. Bandingkan dengan `name` yang tersimpan sekarang — kalau sudah cocok (termasuk kalau LK
   memang pakai istilah Inggris/campuran), JANGAN diubah. Kalau tidak cocok, perbaiki sesuai
   istilah LK.
4. Untuk `DeviceCapabilityItem` yang dipakai oleh LEBIH DARI SATU device type (misal
   `ELECTRICAL_SAFETY` items dipakai hampir semua device) — pastikan nama yang dipilih
   konsisten dan wajar untuk semua device type yang memakainya, bukan cuma cocok untuk satu
   device type di batch ini saja (item ini nanti juga akan "dilihat lagi" secara tidak
   langsung di batch lain karena dipakai device type lain, tapi baris `DeviceCapabilityItem`
   itu sendiri cukup diperbaiki sekali sekarang, tidak perlu diulang di batch berikutnya).
5. Untuk baris tanpa padanan literal 1:1 di LK, gunakan istilah konsisten dengan gaya bahasa
   LK secara umum — bukan tebakan bebas. Kalau genuinely ambigu, JANGAN ditebak — masukkan ke
   daftar terpisah untuk diputuskan manusia.

## Step 2 — Sinkronkan seed script

Update file seed script sumber yang relevan (kemungkinan `seed-device-capability-items.ts`
dan `seed-device-calibration-parameters.ts` + `backfill-device-calibration-parameter-
tolerances.ts` jika nama didefinisikan di situ — sesuaikan dengan struktur aktual di
`packages/db/prisma/`) supaya nilai `name` di kode seed juga ikut diperbarui untuk baris-baris
yang berubah di batch ini. Setelah update, jalankan seed sebagai verifikasi (bukan untuk apply
ulang, tapi memastikan hasilnya cocok dengan database saat ini, tidak ada selisih).

## Step 3 — Verifikasi

1. Konfirmasi jumlah baris di `DeviceCapabilityItem` (98) dan `DeviceCalibrationParameter`
   (489) tidak berubah sama sekali — task ini cuma update `name`, bukan tambah/hapus baris.
2. Konfirmasi field selain `name` di semua baris yang disentuh **tidak berubah**.
3. Konfirmasi baris di luar cakupan batch 1 (device type di kategori lain) **sama sekali tidak
   tersentuh**.
4. Jalankan typecheck/lint/build sesuai skrip proyek.

## Output

Laporkan:
- Konfirmasi target database (connection string tanpa password).
- Daftar device type yang masuk cakupan batch 1 (dari Step 0.2).
- Untuk `DeviceCapabilityItem`: HANYA baris yang berubah — nama lama → nama baru + kutipan
  sumber LK.
- Untuk `DeviceCalibrationParameter`: HANYA baris yang berubah — nama lama → nama baru +
  kutipan sumber LK.
- Baris yang tidak bisa dipastikan (ambigu) — daftar terpisah, jangan ditebak.
- Konfirmasi jumlah baris tidak berubah, field lain tidak tersentuh, batch lain tidak
  tersentuh.
- Konfirmasi file seed sudah disinkronkan dan hasil re-run cocok dengan database.
- Hasil typecheck/lint/build.
