# Laporan Forensik Folder LK — Ringkasan & Indeks

Sumber yang dianalisis: `D:\medcal\docs\technician-docs\Lembar-Kerja`

Laporan ini adalah hasil analisis **read-only** (inventaris & forensik format). Tidak ada file kode, skema, database, atau file LK asli yang diubah. Script Python temporer yang dipakai untuk inspeksi dibuat di `%TEMP%` (di luar repo) dan sudah dihapus setelah analisis selesai.

## Daftar Isi

1. [File Inventory & Format Distribution](01-file-inventory.md) — Phase 1
2. [Template vs Sample Classification](02-classification.md) — Phase 2
3. [Format Forensics (Struktur DOCX/OOXML)](03-format-forensics.md) — Phase 3
4. [Distinct LK Layouts](04-layouts.md) — Phase 5
5. [Visual / Layout Forensics](05-visual-layout-forensics.md) — Phase 4 & 6
6. [Consolidated Field Inventory](06-field-inventory.md) — Phase 6
7. [XML / Conversion Feasibility](07-xml-feasibility.md) — Phase 7
8. [PDF Generation Feasibility](08-pdf-generation-feasibility.md) — Phase 8
9. [Risks / Unknowns](09-risks-unknowns.md) — Phase 9
10. [Reference Templates](10-reference-templates.md) — Phase 12
11. [Scope Confirmation](11-scope-confirmation.md) — Phase 13

## Executive Summary

- **Jumlah file LK**: 50 file, semua berformat `.docx` (Office Open XML, dikonfirmasi via signature `PK\x03\x04`/ZIP — bukan file DOC biner atau hasil scan yang diberi nama `.docx`).
- **Jumlah layout LK yang berbeda secara nyata**: **Efektif 1 (satu) layout/kerangka dasar** ("LK master template") yang digunakan untuk seluruh 50 jenis alat. Variasi antar file hanya terjadi pada bagian tengah "Hasil Pengukuran Kinerja Alat" (spesifik per jenis alat) dan jumlah baris "Pemerikasaan Kondisi Fisik" — bukan perbedaan layout/struktur dokumen secara keseluruhan.
- **Arah teknis yang direkomendasikan**: **Populate template DOCX asli** (Option A pada Phase 8) menggunakan library seperti `docxtpl`/OOXML templating, lalu convert-to-PDF (LibreOffice headless atau layanan konversi), BUKAN membangun ulang layout secara programatik dari nol. Ini memberi fidelitas tertinggi terhadap LK asli dengan usaha paling realistis, mengingat template sudah sangat konsisten dan sudah terstruktur XML.

Lihat [08-pdf-generation-feasibility.md](08-pdf-generation-feasibility.md) untuk perbandingan opsi lengkap dan [11-scope-confirmation.md](11-scope-confirmation.md) untuk konfirmasi bahwa tidak ada perubahan apapun dibuat pada codebase MedCal atau file LK asli.
