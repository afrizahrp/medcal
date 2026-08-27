# FIX — Selesaikan Nama Ventilator (Sumber Cadangan) + Cek Ulang Code-Branching

## Mode
Tugas kecil, dua bagian independen:
1. Selesaikan penyelarasan nama untuk `VENTILATOR` yang tertunda di Batch 1 (field `name`
   saja, sama seperti batch sebelumnya).
2. Verifikasi retroaktif: pastikan tidak ada logika kode yang bergantung pada nilai `name`
   Inggris lama, mencakup SEMUA perubahan yang sudah dilakukan sejauh ini (Phase 1 + Batch 1),
   bukan cuma perubahan baru di task ini.

JANGAN ubah `code`, tolerance, `uomId`, `valueType`, FK, atau tabel lain di luar yang
disebutkan.

## Bagian 1 — Nama Ventilator

Batch 1 melaporkan tidak menemukan `LK Ventilator` di `docs/technician-docs/`, jadi
`VENTILATION_PERFORMANCE` capability items dan `VENTILATOR` performance parameters
(`VENT_TIDAL_VOLUME`, `VENT_MINUTE_VOLUME`, `VENT_RESP_RATE`, `VENT_INSP_TIME`,
`VENT_EXP_TIME`, `VENT_PPEAK`, `VENT_PEEP`, `VENT_FIO2`, `VENT_IE_RATIO`, dan 9 item
capability terkait) masih dalam Bahasa Inggris.

**Ini sudah pernah terjadi sebelumnya dan sudah ada solusinya**: waktu backfill toleransi
(task G1), sumber yang sama juga tidak ditemukan di `docs/technician-docs/`, dan solusinya
adalah memakai sumber cadangan yang sudah terverifikasi:
`docs/legal_n_competency/Penilaian Kemampuan.zip` → folder `Penilaian Kemampuan/Ventilator/`
→ `LK Ventilator Transport.pdf`. Toleransi Ventilator yang sudah tersimpan sekarang (misal
`VENT_TIDAL_VOLUME`, `VENT_IE_RATIO` dengan `valueType=RATIO`) SUDAH berasal dari dokumen PDF
ini — jadi dokumennya pasti ada dan bisa dipakai lagi untuk ambil istilah nama yang benar.

1. Buka `LK Ventilator Transport.pdf` dari sumber cadangan di atas.
2. Baca literal istilah yang dipakai untuk tiap parameter performa (Tidal Volume, Minute
   Volume, Respiration Rate, I:E Ratio, Inspiratory/Expiratory Time, PEEP, Peak Inspiratory
   Pressure, FiO2).
3. Ikuti prinsip yang sama seperti batch-batch sebelumnya: cocokkan ke istilah literal LK
   (Indonesia atau Inggris/campuran, apapun yang tertulis di situ) — jangan menerjemahkan
   bebas.
4. Update `name` di `DeviceCapabilityItem` (item-item `VENTILATION_PERFORMANCE`) dan
   `DeviceCalibrationParameter` (baris performa `VENTILATOR`) sesuai temuan.
5. Catat di laporan bahwa sumber untuk Ventilator ini adalah dokumen cadangan (bukan
   `technician-docs/`), sama seperti dicatat di laporan G1 dulu — supaya jejaknya konsisten.

## Bagian 2 — Verifikasi retroaktif: code-branching check

Cek SELURUH codebase (`apps/api`, `apps/portal`, `apps/tech-pwa`, dan package lain yang
relevan) untuk logika yang membandingkan/bergantung pada NILAI STRING `name` dari
`DeviceCategory`, `DeviceCapability`, `DeviceCapabilityItem`, atau `DeviceCalibrationParameter`
(misal kode seperti `if (x.name === "Electrical Safety")` atau logika serupa yang
mencocokkan string nama, BUKAN `code`). Ini penting dicek ulang mencakup SEMUA baris yang
sudah diubah sejauh ini (13 kategori + 30 kemampuan dari Phase 1, 26 item + 133 parameter dari
Batch 1), bukan cuma perubahan baru di task ini — supaya tidak ada bug tersembunyi yang lolos
dari pengecekan batch-batch sebelumnya.

Kalau ditemukan kode yang bergantung pada nilai `name` lama (bukan `code`), laporkan dengan
jelas lokasinya (file + baris) — JANGAN diperbaiki di task ini kalau perbaikannya butuh
perubahan logika/scope di luar yang sudah disepakati, cukup laporkan supaya bisa diputuskan
terpisah. Kalau ternyata butuh perbaikan kecil dan jelas amannya (misal cuma typo referensi),
boleh diperbaiki tapi jelaskan detail di laporan.

## Step 0 — Konfirmasi target database
Sama seperti semua task sebelumnya: pastikan `pkmdb` lokal (`localhost:5432`), bukan
Docker/staging/production.

## Step Sinkronisasi Seed
Update seed script yang relevan untuk mencerminkan nama Ventilator yang baru (kemungkinan di
`seed-device-calibration-parameters.ts` dan/atau `seed-device-capabilities.ts`, sesuaikan
dengan struktur aktual). Jalankan ulang seed sebagai verifikasi, konfirmasi 0 selisih dengan
database.

## Verifikasi
1. Jumlah baris `DeviceCapabilityItem` (98) dan `DeviceCalibrationParameter` (489) tidak
   berubah.
2. Field selain `name` tidak berubah pada baris Ventilator yang disentuh.
3. Hasil pengecekan code-branching (Bagian 2) dilaporkan lengkap.
4. `typecheck`/`build` sesuai skrip proyek.

## Output
Laporkan: target database, nama Ventilator sebelum→sesudah lengkap dengan kutipan sumber PDF,
hasil code-branching check (temuan atau konfirmasi bersih) untuk SEMUA perubahan sejauh ini
(bukan cuma Ventilator), konfirmasi sinkronisasi seed, dan hasil typecheck/build.
