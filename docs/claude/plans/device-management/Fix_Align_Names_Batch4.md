# FIX — Selaraskan Nama Item & Parameter dengan LK Asli (Batch 4 dari 4 — TERAKHIR)

## Mode
Tugas IMPLEMENTASI: update field `name` (HANYA `name`) di `DeviceCapabilityItem` dan
`DeviceCalibrationParameter`, dibatasi HANYA untuk baris terkait `DeviceType` di 4 kategori:
**Laboratory & Diagnostic Equipment, Dental Equipment, Medical Lighting, Audiology &
Physiological Testing**. Ini batch TERAKHIR — setelah ini seluruh katalog seharusnya sudah
diselaraskan (kecuali beberapa yang memang sengaja dikecualikan, lihat catatan di bawah).

JANGAN ubah `code`, tolerance, `uomId`, `valueType`, FK, atau field lain apapun. Jangan ubah
`DeviceCategory`/`DeviceCapability` (selesai di Phase 1).

## Konteks

Phase 1, Batch 1 (+ Ventilator), Batch 2, dan Batch 3 sudah selesai — total 56
`DeviceCapabilityItem` dan 313 `DeviceCalibrationParameter` sudah diselaraskan sejauh ini.
Task ini menyelesaikan sisanya.

## PENTING — prinsip yang sama, ulangi di sini

Tujuan BUKAN "terjemahkan semua ke Bahasa Indonesia" — nama yang tampil harus PERSIS sama
dengan istilah di dokumen LK asli. Istilah medis Inggris/campuran di LK WAJIB dipertahankan
apa adanya. Cocokkan ke sumber asli, jangan menerjemahkan bebas. Typo jelas di LK boleh
dikoreksi ke ejaan benar (pola dari batch-batch sebelumnya). Kalau ambigu, jangan ditebak.

## Catatan khusus batch ini

1. **`Dental Unit` dan `Dental X-Ray` punya baris hasil SPLIT dari perbaikan Pattern C**
   (`DUNIT_HP_SPEED_LOW`/`_HIGH`, `DXRAY_HVL_70KV`/`_80KV`). Verifikasi terhadap struktur
   TERKINI (query database dulu), jangan asumsikan struktur lama.
2. **JANGAN buat baris untuk device type berikut — mereka SENGAJA tidak ada di sistem**
   (bukan bug, jangan dicari-cari dokumennya):
   - `Auto Chemistry Analyzer`, `Hematologi Analyzer`, `pH Meter` — parameter dinamis, masih
     menunggu keputusan desain terpisah (item H4).
   - `Thermohygrometer` — kategori penempatannya masih menunggu keputusan (item H5).
   - `Otoscope`, `Phaco Emulsifikasi` — bukan device type sungguhan, sudah dikonfirmasi cuma
     dokumen salah label (isinya duplikat device lain).
   Kalau salah satu nama ini muncul di query `DeviceType`, laporkan sebagai temuan aneh — itu
   berarti ada yang berubah sejak catatan terakhir, bukan sesuatu yang harus diproses begitu
   saja.
3. Device type persis di 4 kategori ini TIDAK saya pastikan satu-satu di sini — **query
   database langsung** (Step 0.2) untuk daftar yang akurat, seperti batch-batch sebelumnya.

## Step 0 — Persiapan

1. Konfirmasi target database: `pkmdb` lokal (`localhost:5432`), bukan Docker/staging/prod.
   Berhenti dan tanya kalau ragu.
2. Query `DeviceType` untuk daftar persis device type di 4 kategori batch ini. Laporkan
   daftar lengkapnya sebelum lanjut, dan bandingkan dengan daftar "jangan diproses" di catatan
   khusus poin 2 — konfirmasi tidak ada yang tumpang tindih secara keliru.
3. Kumpulkan semua `DeviceCapabilityItem` dan `DeviceCalibrationParameter` relevan.
4. Catat baseline jumlah baris dan isi `name` sebelum perubahan.

## Step 1 — Verifikasi dan perbaiki nama

Sama seperti batch-batch sebelumnya: temukan dokumen LK sumber di `docs/technician-docs/`,
baca istilah literalnya, bandingkan dan perbaiki kalau perlu. Item lintas kategori yang sudah
diperbaiki sebelumnya tidak perlu diulang. Baris ambigu → daftar terpisah, jangan ditebak.

## Step 2 — Sinkronkan seed script

Update file seed script yang relevan, reuse helper `envElecID()` yang sudah ada untuk baris
env/electrical (jangan buat helper baru). Jalankan ulang seed sebagai verifikasi, pastikan 0
selisih dengan database.

## Step 3 — Verifikasi

1. Jumlah baris `DeviceCapabilityItem` (98) dan `DeviceCalibrationParameter` (489) tidak
   berubah.
2. Field selain `name` tidak berubah pada baris yang disentuh — khusus konfirmasi baris hasil
   split Dental Unit/Dental X-Ray tetap strukturnya sama.
3. Baris di luar cakupan batch 4 tidak tersentuh.
4. `typecheck`/`build` sesuai skrip proyek.
5. **Karena ini batch terakhir**: lakukan sapuan akhir — cek apakah masih ada baris `name`
   (di 4 tabel: Category/Capability/Item/Parameter) yang tersisa dalam Bahasa Inggris murni
   TANPA alasan (bukan istilah LK asli yang memang Inggris) di SELURUH tabel, bukan cuma batch
   ini — laporkan kalau ketemu sisa yang terlewat dari batch manapun.

## Output

Laporkan:
- Target database.
- Daftar device type per kategori batch 4, dan konfirmasi tidak ada tumpang tindih dengan
  daftar "sengaja dikecualikan".
- Baris yang berubah (item + parameter) — nama lama → baru + kutipan sumber, termasuk
  perhatian khusus ke baris hasil split Dental Unit/Dental X-Ray.
- Baris ambigu (daftar terpisah).
- Hasil sapuan akhir (Step 3.5) — ringkasan apakah seluruh katalog (di luar pengecualian yang
  sudah diketahui) sudah 100% selaras, atau masih ada sisa yang perlu batch tambahan.
- Konfirmasi jumlah baris tidak berubah, field lain tidak tersentuh, seed sinkron.
- Hasil typecheck/build.
- Ringkasan total keseluruhan 4 batch (jumlah item + parameter yang berubah dari Phase 1
  sampai Batch 4).
