# 4. Distinct LK Layouts (Phase 5)

**Estimasi jumlah layout LK yang benar-benar berbeda secara struktural: 1 kerangka dasar (base skeleton), dengan variasi lokal.**

Grouping berdasarkan struktur tabel **persis sama** (jumlah tabel + jumlah baris + jumlah sel per baris) menghasilkan beberapa sub-grup identik:

- **Grup Refrigerasi/Termal (6 file identik strukturnya)**: `LK Blood Bank Refrigerator`, `LK Cold Chain, Vaccine Refrigerator`, `LK Medical Freezer`, `LK Medical Refrigerator`, `LK Oven`, `LK Sterilisator` — 9 tabel, struktur baris identik persis, juga berbagi gambar PNG yang sama.
- **Grup Sentrifugal (2 file)**: `LK Centrifuge`, `LK Rotator` — 10 tabel, struktur identik.
- **Grup Pompa Infus (2 file)**: `LK Infusion Pump`, `LK Syringe Pump` — 10 tabel, struktur identik.
- **Grup Optik Sederhana (2 file)**: `LK Laryngoskop`, `LK Otoscope` — 9 tabel, struktur identik.
- **Grup Nebulizer (2 file)**: `LK Nebulizer Compressor`, `LK Nebulizer Ultrasonic` — 9 tabel, struktur identik.
- **34 file lainnya**: masing-masing punya struktur tabel unik (karena bagian "Hasil Pengukuran Kinerja Alat" berbeda jumlah baris/sub-tabel per jenis alat), TAPI blok header/identitas/lingkungan/fisik/keselamatan-listrik/telaah-teknis/tanda-tangan **tetap sama** di semuanya.

## Distribusi jumlah tabel per file

| Jumlah tabel | Jumlah file |
|---|---|
| 6 | 1 |
| 7 | 2 |
| 8 | 1 |
| 9 | 23 |
| 10 | 11 |
| 11 | 4 |
| 12 | 4 |
| 13 | 2 |
| 15 | 1 |
| 17 | 1 |

Karena blok pembuka (identitas alat, daftar alat pembanding, kondisi lingkungan, pemeriksaan fisik, keselamatan listrik) dan blok penutup (telaah teknis, kesimpulan, tanda tangan) **selalu sama kata-per-kata** di 49 dari 50 file (Laryngoskop hanya beda posisi header/footer, bukan isi), perbedaan antar 50 file **bukan** perbedaan "layout" dalam arti desain visual/struktural, melainkan perbedaan **konten spesifik-alat** pada satu bagian tengah dokumen (jumlah parameter ukur, jumlah titik uji, satuan, dan judul sub-tabel).

> Device-type mapping (mis. field mana yang wajib untuk device tertentu, atau kategori alat mana yang "seharusnya" pakai layout mana) **tidak bisa ditentukan secara pasti hanya dari nama file** — pengelompokan di atas murni berdasarkan kesamaan struktur XML yang terukur, bukan asumsi kategori alat.
