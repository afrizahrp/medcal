# 9. Risks / Unknowns (Phase 9)

- **Placeholder belum ada** — 50 file adalah blank template murni (teks label + blank), tidak ada merge-field/content-control (`w:sdt`) yang bisa langsung dipakai binding data — proses templating di masa depan perlu menyisipkan tag/placeholder ke dalam `word/document.xml` masing-masing file (di luar scope task ini).
- **Bagian "Hasil Pengukuran Kinerja Alat" sangat bervariasi** — tidak ada skema kolom/baris universal; setiap jenis alat mungkin butuh mapping data terpisah — device-type mapping ke field database **tidak bisa ditentukan hanya dari file LK** (sesuai instruksi, tidak diasumsikan).
- **Merge cell & tabel kompleks** (9–92 marker per file) — berisiko pecah/berubah jika di-generate ulang programatik tanpa hati-hati.
- **Dependency konversi DOCX→PDF** — solusi Option A butuh komponen eksternal (LibreOffice/Word Automation/API) yang perlu tersedia di lingkungan backend (bukan native Node.js/TypeScript) — pertimbangan infrastruktur di luar scope analisis ini.
- **1 file (Thermohygrometer)** memiliki Kode Dokumen tidak lengkap (`F.MT.LK.01.` tanpa angka) — kemungkinan human error pada dokumen sumber, dicatat sebagai anomali, tidak diperbaiki (sesuai instruksi tidak mengubah file asli).
- **1 file (Laryngoskop)** memiliki struktur header/footer ganda (3 masing-masing) — secara fungsional konten sama, tapi automasi ekstraksi teks header perlu menangani kasus ini secara khusus (header aktif bisa di index ke-2, bukan ke-1).
- **Font** — tidak diverifikasi apakah font yang dipakai (dari `styles.xml`/`theme1.xml`) tersedia di server converter (font substitution bisa mengubah tampilan saat convert ke PDF) — **UNKNOWN**, perlu pengujian langsung saat implementasi nanti.
- **Approval MT/QA terpisah** tidak terlihat eksplisit di template LK ini (hanya "Petugas Kalibrasi"/"Entri data oleh") — **UNKNOWN** apakah proses approval MT terjadi di luar dokumen LK; tidak bisa dipastikan dari file ini saja.
- **Revisi template berjalan** (3 gelombang tanggal edisi + 6 varian `styles.xml`) menunjukkan template LK aktif direvisi dari waktu ke waktu — solusi masa depan perlu strategi versioning template.
