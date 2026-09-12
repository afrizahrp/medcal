# 2. Template vs Sample Classification (Phase 2)

Seluruh 50 file **tergolong TEMPLATE (blank form)**, bukan contoh LK yang sudah terisi:

- Field identitas (Nama Alat, No. Alat, Merk, Pemilik, dst.) tidak berisi nilai — hanya label diikuti tempat kosong.
- Kolom "Terukur"/"Hasil Pengukuran"/tanggal pada tabel pengukuran tidak berisi angka.
- Tidak ada tanda tangan, stempel, atau nama teknisi terisi pada blok "Petugas Kalibrasi :" / "Entri data oleh :".
- Tidak ditemukan indikasi hasil scan (semua teks berasal dari XML terstruktur `word/document.xml`, bukan gambar hasil scan halaman penuh).

Tidak ditemukan file "completed LK examples", "scanned LK", "exported PDF", atau "reference documents/supporting files" di folder ini — seluruh isi folder adalah **satu set template kosong resmi**, satu per jenis alat, masing-masing dengan kode dokumen unik (`Kode Dokumen: F.MT.LK.01.XX`).

Tidak ditemukan file duplikat (setiap nama file & kode dokumen unik, kecuali baris "Kode Dokumen" pada `LK Laryngoskop.docx` yang berada di `header2.xml`, bukan `header1.xml` — lihat [03-format-forensics.md](03-format-forensics.md)).
