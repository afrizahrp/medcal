# 8. PDF Generation Feasibility (Phase 8)

## Option A — Populate existing DOCX template → convert to PDF

- **Kelebihan**: Fidelitas visual tertinggi (memakai layout, font, logo, tabel asli by design); tidak perlu menggambar ulang tabel kompleks/merge cell; template sudah punya 1 theme XML konsisten di semua 50 file, cocok untuk automasi berbasis templating (mis. `docxtpl`/Jinja placeholder di dalam DOCX, lalu render ke DOCX terisi, lalu convert ke PDF via LibreOffice headless atau layanan konversi).
- **Kekurangan**: Perlu menyisipkan placeholder/tag templating ke 50 file (mengubah template — **di luar scope task ini**, hanya dicatat sebagai langkah masa depan); proses convert DOCX→PDF butuh dependency eksternal (LibreOffice/Word/API konversi) yang perlu disiapkan di infrastruktur backend.
- **Fidelitas ke LK asli**: Sangat tinggi — karena filenya adalah aslinya, hanya field-nya diisi.
- **Kompleksitas maintenance**: Sedang — 50 template harus di-maintain/disinkronkan jika desain LK resmi berubah revisi (`Edisi/Revisi`); tapi tidak perlu coding ulang layout per device.
- **Kesesuaian untuk banyak layout**: Baik — karena base skeleton sama, hanya bagian tengah yang beda, effort templating didominasi 1x untuk 90% dokumen + penyesuaian kecil per grup device.

## Option B — Existing template → convert to PDF tanpa isi data terprogram (semi-manual)

- **Kelebihan**: Paling sederhana secara teknis (hanya export/convert).
- **Kekurangan**: Tidak menyelesaikan kebutuhan mengisi data dari `CalibrationJob` secara otomatis — tidak relevan sebagai solusi produksi.
- **Fidelitas**: Sempurna (dokumen asli tanpa perubahan) tapi tidak ada data terisi — tidak memenuhi tujuan akhir (LK PDF hasil kalibrasi).

## Option C — Recreate LK layout programmatically (mis. pakai library PDF seperti pdf-lib/pdfmake dari nol)

- **Kelebihan**: Kontrol penuh dari kode (tanpa dependency konversi DOCX→PDF eksternal); mudah diversi-kontrol sebagai kode.
- **Kekurangan**: Risiko fidelitas rendah — harus mereplikasi manual seluruh merge-cell/tabel kompleks (9–92 merge marker per file), font/tema, dan terutama **50 varian "Hasil Pengukuran Kinerja Alat"** yang sangat berbeda strukturnya per alat; effort implementasi & maintenance sangat besar; risiko drift visual dari LK asli tinggi tanpa QA manual berulang.
- **Fidelitas ke LK asli**: Rendah–sedang tergantung effort; **tidak realistis mengklaim "pixel-perfect"** berdasarkan bukti kompleksitas template (banyak merge cell dan sub-tabel unik per device).
- **Kompleksitas maintenance**: Tinggi — 50 layout kode manual perlu disesuaikan tiap kali ada 1 device baru atau revisi template resmi.

## Option D — Hybrid: DOCX template + templating engine, per grup layout yang identik

- Bisa memanfaatkan temuan bahwa 5 grup device (Refrigerasi, Sentrifugal, Pompa Infus, Optik Sederhana, Nebulizer — lihat [04-layouts.md](04-layouts.md)) punya struktur identik — namun ini murni observasi, evaluasi implementasi detail di luar scope task ini.

> **Catatan fidelitas**: Karena LK asli memakai tabel kompleks dengan puluhan merge cell dan sub-tabel unik per alat, klaim "pixel-perfect" **tidak didukung bukti** kecuali menggunakan pendekatan Option A (populate file asli). Opsi lain punya risiko fidelitas visual yang nyata dan tidak dijamin oleh bukti forensik ini.

## Recommended Approach (Phase 10)

**Rekomendasi: Option A** — populate template DOCX asli (per jenis alat, 50 file) dengan data dari sistem, lalu convert ke PDF menggunakan converter DOCX→PDF (mis. LibreOffice headless atau layanan konversi setara), sebagai satu-satunya pendekatan yang didukung penuh oleh bukti forensik (struktur XML konsisten, 1 theme, layout dasar identik) sekaligus memenuhi syarat "LK PDF harus semirip mungkin dengan LK asli".

Ini murni rekomendasi arah, **BUKAN implementasi** — task analisis ini tidak membangun generator PDF/konversi XML apapun.
