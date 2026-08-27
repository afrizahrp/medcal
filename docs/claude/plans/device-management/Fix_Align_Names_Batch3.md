# FIX — Selaraskan Nama Item & Parameter dengan LK Asli (Batch 3 dari 4)

## Mode
Tugas IMPLEMENTASI: update field `name` (HANYA `name`) di `DeviceCapabilityItem` dan
`DeviceCalibrationParameter`, dibatasi HANYA untuk baris terkait `DeviceType` di 2 kategori:
**Suction & Fluid Management, Cold Chain & Storage**. JANGAN sentuh baris kategori lain
(Batch 1-2 sudah selesai; Batch 4 menyusul terpisah).

JANGAN ubah `code`, tolerance, `uomId`, `valueType`, FK, atau field lain apapun. Jangan ubah
`DeviceCategory`/`DeviceCapability` (selesai di Phase 1).

## Konteks

Phase 1, Batch 1 (+ Ventilator follow-up), dan Batch 2 sudah selesai — total 51
`DeviceCapabilityItem` dan 237 `DeviceCalibrationParameter` sudah diselaraskan sejauh ini.
Task ini melanjutkan ke 2 kategori berikutnya.

## PENTING — prinsip yang sama, ulangi di sini

Tujuan BUKAN "terjemahkan semua ke Bahasa Indonesia" — nama yang tampil harus PERSIS sama
dengan istilah di dokumen LK asli. Istilah medis yang di LK memang Inggris/campuran WAJIB
dipertahankan apa adanya. Cocokkan ke sumber asli, jangan menerjemahkan bebas. Kalau LK salah
ketik (typo) dan jelas typo (bukan istilah yang disengaja), boleh dikoreksi ke ejaan yang
benar — sama seperti keputusan "Expiratori"→"Expiratory" dan "Overshot"→"Overshoot" di batch
sebelumnya. Kalau ambigu, jangan ditebak — masukkan daftar terpisah untuk manusia.

## Catatan khusus batch ini — baca sebelum mulai

1. **Kemungkinan besar 2 device type di Suction & Fluid Management TIDAK punya baris
   parameter sama sekali**: `Aspirators (Surgical, Thoracic, and Uterine)/Suction` dan
   `Regulators (Low-Volume Suction)` — keduanya termasuk 8 device resmi Kemenkes yang sejak
   awal diketahui tidak punya dokumen LK (gap A2 di `Rangkuman_Gap_Konfirmasi_User.md`, sama
   seperti Paraffin Baths/Radiant Warmers Adult di Batch 2). Kalau memang kosong, itu bukan
   kegagalan — konfirmasi saja dan lanjut.
2. **`Breast Pumps` dan `Suction Pump` (kalau keduanya ada sebagai device type terpisah)
   kemungkinan berbagi SATU dokumen LK yang sama** (`LK Suction Pump.docx`) — ini sudah
   dikonfirmasi sejak kerja awal proyek. Kalau begitu, wajar keduanya punya nama parameter
   yang identik/mirip karena memang dari sumber yang sama — bukan berarti salah satu keliru.
3. **`SUCT_MAX_VACUUM` (kalau ada di baris Suction Pump) punya struktur KHUSUS yang SUDAH
   DIPUTUSKAN sebelumnya — JANGAN diubah strukturnya.** Baris ini sengaja punya 3 kelas
   toleransi (Low/Medium/High Vacuum) digabung dalam satu `toleranceNote`, karena satu unit
   suction pump cuma masuk SATU kelas (bukan diuji 3-3-nya seperti Dental Handpiece Low/High).
   Ini BUKAN kasus Pattern C yang perlu dipecah — sudah diputuskan tetap 1 baris. Task ini
   HANYA boleh menyentuh field `name`-nya (kalau memang perlu diselaraskan ke istilah LK),
   TIDAK BOLEH mengubah `toleranceMin`/`Max`/`Note` atau memecah jadi beberapa baris.

## Step 0 — Persiapan

1. Konfirmasi target database: `pkmdb` lokal (`localhost:5432`), bukan Docker/staging/prod.
   Berhenti dan tanya kalau ragu.
2. Query `DeviceType` untuk daftar persis device type di 2 kategori batch ini (via relasi ke
   `DeviceCategory`, bukan menebak nama). Laporkan daftar lengkapnya sebelum lanjut.
3. Dari daftar itu, kumpulkan semua `DeviceCapabilityItem` dan `DeviceCalibrationParameter`
   yang relevan (ikuti catatan khusus di atas soal 2 device type yang mungkin kosong).
4. Catat baseline jumlah baris dan isi `name` sebelum perubahan.

## Step 1 — Verifikasi dan perbaiki nama

Sama seperti batch sebelumnya: untuk tiap baris dalam cakupan, temukan dokumen LK sumber di
`docs/technician-docs/`, baca istilah literalnya, bandingkan dengan `name` tersimpan — ubah
kalau tidak cocok, biarkan kalau sudah cocok. Untuk item yang dipakai lintas kategori dan
sudah diperbaiki di batch sebelumnya (misal item environmental/electrical universal), tidak
perlu diulang. Baris ambigu/tanpa sumber jelas → jangan ditebak, masukkan daftar terpisah.

## Step 2 — Sinkronkan seed script

Update file seed script yang relevan (`seed-device-capabilities.ts`,
`seed-device-calibration-parameters.ts`, dan/atau `seed-device-taxonomy-extension-
parameters.ts` untuk device baru seperti Suction Pump — gunakan helper `envElecID()` yang
sudah dibuat di Batch 2 kalau relevan untuk baris env/electrical, jangan buat helper baru
yang duplikat). Jalankan ulang seed sebagai verifikasi, pastikan 0 selisih dengan database.

## Step 3 — Verifikasi

1. Jumlah baris `DeviceCapabilityItem` (98) dan `DeviceCalibrationParameter` (489, sudah
   termasuk +8 dari Pattern-C split) tidak berubah.
2. Field selain `name` tidak berubah pada baris yang disentuh — SECARA KHUSUS konfirmasi
   `SUCT_MAX_VACUUM` (kalau ada) tetap 1 baris dengan struktur toleransi yang sama persis
   seperti sebelumnya.
3. Baris di luar cakupan batch 3 (kategori lain) sama sekali tidak tersentuh.
4. `typecheck`/`build` sesuai skrip proyek.

## Output

Laporkan:
- Target database.
- Daftar device type per kategori batch 3, termasuk konfirmasi eksplisit device type mana
  yang tidak punya baris parameter (sesuai dugaan) dan mana yang ada.
- Baris `DeviceCapabilityItem` dan `DeviceCalibrationParameter` yang berubah — nama lama →
  baru + kutipan sumber.
- Konfirmasi eksplisit `SUCT_MAX_VACUUM` (kalau ada) tidak diubah strukturnya.
- Baris ambigu (daftar terpisah, tidak ditebak).
- Konfirmasi jumlah baris tidak berubah, field lain tidak tersentuh, batch lain tidak
  tersentuh, seed sinkron.
- Hasil typecheck/build.
