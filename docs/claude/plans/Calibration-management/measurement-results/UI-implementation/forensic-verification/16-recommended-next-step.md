# 16. Recommended Next Implementation Step (TIDAK DIKODE)

> Rekomendasi urutan kerja untuk tim, murni sebagai saran — bukan instruksi eksekusi dan TIDAK ada kode yang ditulis di audit ini.

1. **Selesaikan business rule Telaah Teknis** (gap #9, [10](10-technical-review-mapping.md)) — ini satu-satunya dimensi berstatus **NO** di [13](13-dynamic-lk-feasibility-per-section.md). Tanpa keputusan bisnis soal formula skor 10/40/50, tidak ada jumlah kode yang bisa menyelesaikannya.
2. **Putuskan representasi metadata konfigurasi listrik** (Tipe bagian diaplikasikan, Kelas Proteksi, Hubungan Utama) — apakah ini atribut `Device`, `DeviceType`, atau `DeviceModel`? (gap #2).
3. **Putuskan `valueType` untuk Resistansi Isolasi** — ubah ke `TEXT`, atau tambah encoding khusus untuk nilai "OR" di bawah `NUMBER`? (gap #1).
4. **Klarifikasi representasi 3-sub-reading Tegangan Input** dengan tim yang paham `measurement-results.service.ts`/data live (gap #4) — kemungkinan sudah terselesaikan di kode yang tidak sempat diperiksa detail di audit ini (`CalibrationTestPoint` untuk `INPUT_VOLTAGE`?) — **perlu 1 sesi verifikasi kode/data tambahan**, bukan asumsi.
5. **Rekonsiliasi jumlah titik SpO2 BSM** (7 vs 8, gap #5) — bandingkan lebih banyak sampel Excel `Bed Side Monitor.xlsx`-sejenis atau tanya tim lab.
6. **Baru setelah (1)–(5) diputuskan**: mulai desain generator LK generik sesuai [15-recommended-architecture.md](15-recommended-architecture.md) — dengan golden example BSM & Baby Incubator sebagai acceptance test pertama (karena keduanya sudah dipetakan lengkap di audit ini).
7. **Evaluasi kebutuhan snapshot tambahan** (§11) — apakah bisnis butuh LK regenerasi identik-historis bertahun-tahun kemudian, atau cukup "LK digenerate sekali saja segera setelah MT approve dan disimpan sebagai file final"? Jawaban ini menentukan apakah snapshot label/decimalPlaces/urutan section perlu ditambahkan SEKARANG atau bisa ditunda (kategori E).

Rekomendasi TIDAK termasuk memutuskan sendiri jawaban dari langkah 1–4 dan 7 di atas — itu adalah keputusan bisnis/produk yang di luar kewenangan audit read-only ini.
