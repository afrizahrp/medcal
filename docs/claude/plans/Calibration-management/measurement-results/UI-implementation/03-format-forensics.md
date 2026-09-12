# 3. Format Forensics — Struktur DOCX/OOXML (Phase 3)

Karena seluruh file berformat DOCX, seluruh phase ini berfokus pada struktur Office Open XML (tidak ada DOC/PDF/XLSX di folder untuk dianalisis).

## Struktur ZIP internal

Setiap file DOCX memiliki:

- `word/document.xml` — ada di semua 50 file.
- `word/styles.xml` — ada di semua 50 file; **6 varian hash berbeda** (35 file memakai satu varian dominan yang sama persis; 9 file memakai varian dominan lain; sisanya masing-masing 1–3 file dengan varian sedikit berbeda — indikasi styles diedit ulang seiring waktu, bukan indikasi layout berbeda).
- `word/numbering.xml` — ada di semua 50 file, 26 varian hash (bervariasi karena daftar bernomor berbeda isi per device — tidak signifikan secara layout).
- `word/theme/theme1.xml` — **identik (1 hash) di seluruh 50 file** → tema warna/font korporat sama persis di semua template.
- `word/settings.xml` — 50 hash berbeda (satu per file) — normal, berisi rsid/docId unik per dokumen, tidak bermakna struktural.
- `word/header*.xml` dan `word/footer*.xml` — 1 header + 1 footer di 49 file; **`LK Laryngoskop.docx` memiliki 3 header + 3 footer** (header1/footer1 kosong, header2 berisi konten sebenarnya, header3/footer3 kosong) — pola umum Word untuk "different first page"/"even page" yang tidak dipakai isinya; kontennya sama secara fungsional dengan file lain.
- `word/media/*` — 0–3 gambar per file (jpeg/png; 1 file — Baby Incubator — juga punya `.wdp`, Windows Media Photo, fallback format yang otomatis dibuat Word untuk gambar tertentu).

## Page setup (`sectPr` / `pgSz` / `pgMar`)

Seluruh 50 file punya **1 section**, ukuran halaman **11906 x 16838 twips = A4 (210mm x 297mm)**, **orientasi portrait** (atribut `orient` tidak diset = default portrait) — **100% konsisten** di semua file, tidak ada file landscape atau ukuran custom.

## Tabel & merged cell

Setiap file memakai banyak tabel gaya Word (`w:tbl`) dengan sel gabung (`gridSpan`/`vMerge`) — jumlah marker merge berkisar **9–92 per file**. Struktur baris pada blok-blok awal (identitas, alat yang digunakan, kondisi lingkungan, pemeriksaan fisik, keselamatan listrik) **identik row-count-nya di hampir semua file** (pola `[6, 4, 6, 7/8/9, 4, 5, ...]`), mengonfirmasi blok-blok ini adalah bagian template yang sama — hanya blok "Hasil Pengukuran Kinerja Alat" di tengah yang panjangnya berbeda-beda per alat.

## Gambar / logo

Satu file JPEG identik (hash sama, 59,221 byte) muncul di **seluruh 50 file** — ini adalah **logo perusahaan di header**, dipakai ulang persis di semua template. Gambar lain (PNG) sebagian dipakai ulang untuk grup alat sejenis:

- Satu PNG (14,322 B) dipakai di 7 file grup refrigerator/freezer/oven/sterilisator.
- Satu PNG (2,045 B) dipakai di 2 file grup Bio Safety Cabinet-terkait.
- Sisanya unik per file (Baby Incubator, Dental X-Ray, Infant Warmer, Phototherapy) — semuanya adalah **diagram titik ukur/posisi pengujian** (misalnya "Gambar 1. Posisi Titik Uji Particle Counter", "Gambar 1. Posisi Titik Ukur"), bukan foto alat aktual.

## Text box / field / placeholder

Tidak ditemukan indikasi text box terpisah (semua konten ada dalam paragraf/tabel biasa `w:p`/`w:tbl`). Tidak ditemukan Word merge-field (`MERGEFIELD`) atau content control (`w:sdt`) — seluruh "placeholder" berupa garis kosong/spasi setelah label teks biasa (misalnya `"Awal : ␣␣␣␣␣␣␣␣ °C"`), bukan field yang bisa diisi otomatis oleh Word.

> **UNKNOWN**: apakah ada content control tersembunyi yang tidak tertangkap regex `w:sdt` tidak bisa dipastikan tanpa membuka file langsung di Word — namun pencarian pada `document.xml` seluruh file tidak menunjukkan tag `w:sdt`.
