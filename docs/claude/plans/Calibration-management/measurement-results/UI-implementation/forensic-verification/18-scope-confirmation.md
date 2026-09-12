# 18. Scope Confirmation

## Yang TIDAK Dimodifikasi (Dikonfirmasi)

- [x] `apps/api` — tidak ada file yang diedit
- [x] `apps/portal` — tidak ada file yang diedit
- [x] `apps/tech-pwa` — tidak ada file yang diedit
- [x] `packages/shared` — tidak ada file yang diedit
- [x] `packages/db/prisma/schema.prisma` — tidak ada perubahan skema
- [x] Migrasi database — tidak ada migrasi baru dibuat/dijalankan
- [x] Database (data) — tidak ada koneksi database dilakukan; seluruh analisis dari kode sumber (file `.ts`) dan file Excel, bukan query live DB
- [x] File test (`*.test.ts`) — tidak ada yang diedit
- [x] File config (`package.json`, `tsconfig`, Docker, dll.) — tidak ada yang diedit
- [x] File LK docx resmi di `docs/technician-docs/Lembar-Kerja/` — tidak diubah/di-rename
- [x] File Excel golden example (`Bed Side Monitor.xlsx`, `Baby Incubator.xlsx`) — dibuka **read-only**; TIDAK ditulis ulang; salinan hasil dekripsi HANYA disimpan sementara di `%TEMP%` (luar repo) dan **sudah dihapus** setelah analisis selesai (dikonfirmasi via pengecekan direktori temp)
- [x] Data `DeviceCapability`/`DeviceCalibrationParameter`/dsb — tidak ada baris yang dibuat/diubah/dihapus (tidak ada koneksi database)

## Yang TIDAK Diimplementasikan (Sesuai Batasan Task)

- [x] Tidak ada generator PDF LK yang dibangun
- [x] Tidak ada perbaikan kode untuk gap yang ditemukan (§14 Gap Classification) — semua dilaporkan, tidak diperbaiki
- [x] Tidak ada field/model baru dibuat untuk menutup gap (mis. field `Resolusi`, metadata konfigurasi listrik)
- [x] Tidak ada business rule baru diciptakan untuk formula skor Telaah Teknis — dilaporkan sebagai HARD STOP, bukan diasumsikan

## Yang TIDAK Diciptakan/Ditebak (Sesuai Batasan Task)

- [x] Tidak ada mapping device-type baru yang diciptakan
- [x] Tidak ada field "required" yang diasumsikan tanpa evidence kode
- [x] Terminologi asli LK (termasuk typo seperti "Batas caitan", "Pemerikasaan") dipertahankan verbatim di seluruh laporan, tidak dinormalisasi
- [x] Perbedaan wording antara LK docx, seed katalog, dan Results Excel dilaporkan sebagai-adanya (lihat [03 §3.4](03-baby-incubator-mapping.md)), tidak diselaraskan

## Satu-Satunya File Baru yang Dibuat

- Folder `docs/claude/plans/Calibration-management/measurement-results/UI-implementation/forensic-verification/` berisi 18 file markdown laporan ini — sesuai permintaan eksplisit format laporan dari task, ditempatkan berdampingan dengan laporan forensik LK folder sebelumnya (Task 1) untuk kemudahan navigasi. Ini adalah **dokumentasi**, bukan kode aplikasi.

## Password Excel

- Password `1004` dipakai untuk membuka `Bed Side Monitor.xlsx` dan `Baby Incubator.xlsx` — password ini **BUKAN ditemukan lewat brute-force/cracking**, melainkan **sudah terdokumentasi secara terbuka** di `docs/module-specs/measurement-results/calibration-results-cross-check.md` (audit internal tim, 2026-09-08), sebuah dokumen yang SUDAH ADA di repo sebelum audit ini dimulai. Klaim task bahwa file "tidak memiliki password" tidak akurat — dilaporkan sebagai discrepancy di [00-README.md](00-README.md), bukan disembunyikan.
