# FIX — Selaraskan Nama Item & Parameter dengan LK Asli (Batch 2 dari 4)

## Mode
Tugas IMPLEMENTASI: update field `name` (HANYA `name`) di `DeviceCapabilityItem` dan
`DeviceCalibrationParameter`, dibatasi HANYA untuk baris terkait `DeviceType` di 4 kategori:
**Neonatal & Infant Care, Temperature Therapy, Sterilization, Patient Care**. JANGAN sentuh
baris kategori lain (Batch 1 sudah selesai; Batch 3-4 menyusul terpisah).

JANGAN ubah `code`, tolerance, `uomId`, `valueType`, FK, atau field lain apapun. Jangan ubah
`DeviceCategory`/`DeviceCapability` (selesai di Phase 1).

## Konteks

Phase 1 (Category+Capability) dan Batch 1 (Patient Monitoring, Respiratory & Oxygen,
Resuscitation) sudah selesai — 26 `DeviceCapabilityItem` dan 133+ `DeviceCalibrationParameter`
sudah diselaraskan. Task ini melanjutkan ke 4 kategori berikutnya.

## PENTING — prinsip yang sama, ulangi di sini

Tujuan BUKAN "terjemahkan semua ke Bahasa Indonesia" — tujuannya nama yang tampil harus PERSIS
sama dengan istilah di dokumen LK asli. Istilah medis yang di LK memang Inggris/campuran (kalau
ada) WAJIB dipertahankan apa adanya, JANGAN dipaksa diindonesiakan. Cocokkan ke sumber asli,
jangan menerjemahkan bebas.

## Catatan khusus batch ini — baca sebelum mulai

1. **Temperature Therapy kemungkinan besar TIDAK punya baris `DeviceCalibrationParameter`
   sama sekali.** Kategori ini menaungi `Radiant Warmers (Adult)` dan `Paraffin Baths` — dua
   dari 8 device type resmi Kemenkes yang sejak audit awal proyek ini diketahui TIDAK punya
   dokumen LK sama sekali (gap yang belum tertutup, dicatat di
   `Rangkuman_Gap_Konfirmasi_User.md` item A2). Kalau memang kosong, itu BUKAN kegagalan
   task ini — cukup konfirmasi dan lanjut ke kategori lain, jangan buang waktu mencari
   dokumen yang memang belum ada.
2. **Autoclave (kategori Sterilization) baru saja mengalami perbaikan struktural** (task
   "split 7 collapsed Pattern C rows" — `ACLV_STER_TEMP` jadi `ACLV_STER_TEMP_121` +
   `ACLV_STER_TEMP_134`, dst). Pastikan verifikasi nama dilakukan terhadap baris-baris HASIL
   SPLIT yang sudah ada sekarang (query database dulu untuk lihat kondisi aktual), jangan
   asumsikan struktur lama yang sudah tidak ada.
3. **Electric Beds (kategori Patient Care)** kemungkinan cuma punya baris env+electrical
   safety tanpa item spesifik device (sudah dikonfirmasi begitu sejak awal — LK Kelistrikan
   untuknya memang cuma berisi itu). Kalau begitu, baris yang perlu dicek cuma yang sudah
   ditangani polanya di Batch 1 (item elektrikal universal) — verifikasi saja tidak ada yang
   terlewat, tidak perlu cari item performa khusus yang memang tidak ada.

## Step 0 — Persiapan

1. Konfirmasi target database: `pkmdb` lokal (`localhost:5432`), bukan Docker/staging/prod.
   Berhenti dan tanya kalau ragu.
2. Query `DeviceType` untuk daftar persis device type di 4 kategori batch ini (via relasi ke
   `DeviceCategory`, bukan menebak nama). Laporkan daftar lengkapnya sebelum lanjut.
3. Dari daftar itu, kumpulkan semua `DeviceCapabilityItem` dan `DeviceCalibrationParameter`
   yang relevan (ikuti catatan khusus di atas soal Temperature Therapy yang mungkin kosong).
4. Catat baseline jumlah baris dan isi `name` sebelum perubahan.

## Step 1 — Verifikasi dan perbaiki nama

Sama seperti Batch 1: untuk tiap baris dalam cakupan, temukan dokumen LK sumber di
`docs/technician-docs/`, baca istilah literalnya, bandingkan dengan `name` tersimpan — ubah
kalau tidak cocok, biarkan kalau sudah cocok (termasuk kalau memang Inggris/campuran di LK).
Untuk item yang dipakai lintas kategori dan sudah diperbaiki di Phase 1/Batch 1, tidak perlu
diulang. Baris ambigu/tanpa sumber jelas → jangan ditebak, masukkan daftar terpisah.

## Step 2 — Sinkronkan seed script

Update file seed script yang relevan (kemungkinan `seed-device-capabilities.ts`,
`seed-device-calibration-parameters.ts`, `seed-device-taxonomy-extension-parameters.ts` untuk
Autoclave — sesuaikan dengan struktur aktual). Jalankan ulang sebagai verifikasi, pastikan 0
selisih dengan database.

## Step 3 — Verifikasi

1. Jumlah baris `DeviceCapabilityItem` (98) dan `DeviceCalibrationParameter` (jumlah saat ini
   — cek dulu, mungkin sudah 489+8 dari perbaikan Pattern C) tidak berubah.
2. Field selain `name` tidak berubah pada baris yang disentuh.
3. Baris di luar cakupan batch 2 (kategori lain) sama sekali tidak tersentuh.
4. `typecheck`/`build` sesuai skrip proyek.

## Output

Laporkan:
- Target database.
- Daftar device type per kategori batch 2, termasuk konfirmasi eksplisit apakah Temperature
  Therapy benar-benar tidak punya baris parameter (sesuai dugaan) atau ternyata ada.
- Baris `DeviceCapabilityItem` dan `DeviceCalibrationParameter` yang berubah — nama lama →
  baru + kutipan sumber, khususnya untuk baris hasil split Autoclave.
- Baris ambigu (daftar terpisah, tidak ditebak).
- Konfirmasi jumlah baris tidak berubah, field lain tidak tersentuh, batch lain tidak
  tersentuh, seed sinkron.
- Hasil typecheck/build.
