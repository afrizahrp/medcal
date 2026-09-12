# 7. XML / Conversion Feasibility (Phase 7)

1. **File berbasis XML asli**: seluruh 50 file DOCX — karena format DOCX = ZIP berisi XML (`word/document.xml`, dst). Tidak ada file PDF/DOC/XLSX di folder ini yang perlu dibandingkan.
2. **File yang bukan XML asli**: tidak ada (0 file DOC biner, 0 PDF, 0 XLSX).
3. **Bisa layout direkonstruksi reliable dari XML yang diekstrak?** Ya, untuk **blok tetap** (header/footer, identitas, lingkungan, fisik, keselamatan listrik, telaah teknis, tanda tangan) — struktur `w:tbl`/`w:tr`/`w:tc` + `sectPr` cukup untuk merekonstruksi tabel & tata letak halaman A4 portrait secara presisi karena ini adalah OOXML asli (bukan hasil scan/rasterisasi). Untuk blok **"Hasil Pengukuran Kinerja Alat"**, struktur XML juga tersedia lengkap, tapi isinya unik per file sehingga generalisasi butuh mapping per jenis alat (di luar scope task ini).
4. **Format paling mudah dipakai sebagai template masa depan?** DOCX itu sendiri — karena sudah terstruktur XML, punya styling/tema konsisten (1 theme dipakai di semua file), dan bisa di-populate ulang menggunakan variabel/placeholder tanpa membangun ulang tata letak.
5. **Pendekatan yang lebih baik**:
   - **Populate existing document template** — direkomendasikan (lihat [08-pdf-generation-feasibility.md](08-pdf-generation-feasibility.md), Option A) karena template sudah final secara visual dan konsisten, tinggal mengganti teks placeholder dengan nilai dari sistem.
   - **Convert template ke PDF langsung tanpa isi data** — tidak relevan sendirian (perlu isi data juga).
   - **Generate PDF langsung dari nol (programatik)** — risiko tinggi karena harus mereplikasi tabel kompleks, merge cell, dan sub-tabel spesifik per 50 jenis alat secara manual.
