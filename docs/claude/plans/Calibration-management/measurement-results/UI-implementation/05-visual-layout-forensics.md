# 5. Visual / Layout Forensics (Phase 4 & 6)

## Header (identik pada seluruh file, hanya teks device yang berubah)

- Logo perusahaan (gambar JPEG sama di semua file).
- Label "Formulir".
- "Kode Dokumen: F.MT.LK.01.XX" (nomor urut unik per alat, mis. `F.MT.LK.01.50` untuk Otoscope, `F.MT.LK.01.001` untuk Kelistrikan, `F.MT.LK.01.9A`/`F.MT.LK.01.9B` untuk Nebulizer, `F.MT.LK.01.11ABC` untuk Suction Pump — beberapa punya sufiks huruf; satu file — Thermohygrometer — kode dokumennya tampak belum lengkap: `F.MT.LK.01.` tanpa angka, kemungkinan human error saat pengisian template).
- "Lembar Kerja" / "Lembar Kerja Kalibrasi" (penulisan sedikit berbeda antar file, mis. Autoclave pakai "Lembar Kerja Kalibrasi" sedangkan Otoscope pakai "Lembar Kerja" + baris "Pengujian Otoscope" terpisah — variasi kata, dipertahankan sesuai aslinya).
- "Pengujian \<Nama Alat\>" atau "Kalibrasi \<Nama Alat\>" — judul alat spesifik, penulisan device name persis sesuai dokumen (contoh: "Pengujian Layngoscope Light" — perhatikan penulisan "Layngoscope" bukan "Laryngoscope", dipertahankan sesuai aslinya).
- "Edisi / Revisi: 01 / 00" (atau /01, /02) — revisi bervariasi, ada 3 gelombang tanggal edisi yang teramati: `13-01-2025`, `05-05-2025`, `10-04-2026` — menunjukkan template ditambah/direvisi bertahap.
- "Tanggal Edisi:" dan "Tanggal Revisi:" (banyak masih "-").
- "Halaman: X dari Y" — Y bervariasi 2–4 halaman tergantung panjang bagian "Hasil Pengukuran Kinerja Alat".

## Customer / Device Identity (label persis sama di semua file)

`No. sertifikat :`, `Nama Alat:`, `No.alat:`, `Merk:`, `Pemilik:`, `Model/tipe:`, `Ruangan:`, `No.seri:`, `Tgl. Terima:`, `Kapasitas:`, `Tgl. Kalibrasi:`, `Resolusi:`

## Calibration Information

- Tabel "Daftar Alat yang Digunakan" — kolom: `No`, `Nama Alat`, `Merk`, `Type/Model`, `No. Seri` — baris terisi nama alat standar/referensi yang relevan untuk device tersebut (mis. "Electrical Safety Analyzer", "Thermohygrometer" selalu ada; alat lain seperti "Spectral Chromometer", "Incubator Analyzer", "Particel Counter", "Lux Meter", "Sound Level Meter", "Anemometer", "UV Light Meter", "Data Logger Hi Temperature" muncul sesuai kebutuhan device).
- Tabel "Pengukuran Kondisi Lingkungan" — kolom `Kondisi Ruangan` / `Terukur` / `Toleransi`; baris: `Suhu (°C)` (Awal/Akhir), `Kelembaban / RH (%)` (Awal/Akhir), `Tegangan Input` (`L-N`, `L-G`, `N-G` dalam Vac) — nilai toleransi bervariasi sedikit per alat (contoh: `25 ± 6 °C` vs `25 ± 5 °C` vs `10 - 40 °C`).

## Measurement Section — "Hasil Pengukuran Kinerja Alat" (bagian PALING variatif)

Ini satu-satunya bagian yang benar-benar spesifik per jenis alat. Contoh keragaman:

- **Otoscope/Laryngoskop**: "Intensitas Cahaya", "Color Temperature", "Color Rendering Index" — kolom `Parameter`/`Pembacaan Standar`/`Toleransi`, titik uji `I/II/III`.
- **Autoclave**: 3 sub-tabel — "Suhu Chamber" (S1/S2/S3, ΔT), "Suhu Sterilisasi" (titik I/II/III), "Waktu Sterilisasi" — kolom `Setting UUT`/`Penunjukan Standar`/`Toleransi`.
- **Bio Safety Cabinet**: 6 sub-tabel — "Pengujian Particle Counter", "Pengujian Downflow", "Pengujian Inflow Velocity", "Pengukuran Nilai Intesitas Cahaya (Lighting)", "Pengukuran Sound Level", "Pengukuran Radiasi UV", "Pengukuran Kebocoran Hepa/Ulpa Filter", plus tes kualitatif pola asap ("smoke pattern test") dengan istilah unik "deteksi adanya turbelensi atau tidak" (dipertahankan sesuai typo aslinya).
- **Baby Incubator**: 5 sub-tabel — "Kalibrasi Pengontrol Suhu dan Keseragaman Suhu Inkubator" (T1–T5), "Overshot Temperature, Waktu Pemulihan Lonjakan Suhu, Suhu Matras, Kecepatan Udara, Kebisingan dan Kelembaban", "Kalibrasi Penunjukan Suhu Kulit dan Suhu Kontrol", "Kalibrasi Sensor Suhu Kulit".
- **Kelistrikan** (paling sederhana): tidak ada sub-tabel measurement khusus, langsung lanjut ke "Penilaian Secara Menyeluruh" dengan 5 kategori penilaian kualitatif (mis. "Aman tidak terjadi penyimpangan", "Peralatan tidak diijinkan operasional hingga penyimpangan diperbaiki/dikoreksi").

> Karena sangat bervariasi, **tidak bisa diasumsikan struktur kolom/baris section ini seragam** — setiap jenis alat berpotensi punya jumlah kolom, satuan, dan jumlah titik uji yang unik.

## Inspection / Function Section

- Judul persis: **"Pemerikasaan Kondisi Fisik dan Fungsi Komponen Alat"** (perhatikan salah eja "Pemerikasaan" — dipertahankan sesuai aslinya, bukan "Pemeriksaan").
- Kolom: `No.`, `Parameter`, `Batas Pemeriksaan`, `Keterangan` dengan pilihan `Baik` / `Tidak Baik`.
- Item umum (4–9 baris tergantung alat): "Badan / Permukaan", "Kotak kontak alat"/"Tusuk kontak alat", "Kabel catu utama", "Tombol, saklar dan kontrol", "Tampilan dan indikator", dan item khusus alat (mis. Baby Incubator menambahkan "Sensor suhu kulit", "Saringan udara", "Batas cairan", "Matras"; Bio Safety Cabinet menambahkan "Sekering Pengaman").
- Section "Pengukuran Keselamatan Listrik" — `Tipe bagian yang diaplikasikan` (pilihan `B`/`BF`/`CF`), `Kelas Proteksi` (`I`/`II`/`Baterai`), `Hubungan Utama` (`DPS`/`NPS`/`PIE` — dengan catatan definisi masing-masing kode).
- Tabel pengukuran kuantitatif keselamatan listrik: `No.`/`Parameter`/`Terukur`/`Ambang Batas` → `Resistansi Pembumian Protektif (Ω, ≤ 0,3 Ω)`, `Resistansi Isolasi (MΩ, > 2 MΩ)`, `Arus Bocor Peralatan (µA, ≤ 500 µA)`, `Arus bocor bagian yang diaplikasikan (µA, ≤ 500 µA)` — konsisten persis di semua file yang punya kelistrikan.

## Signatures / Approval

- **"Telaah Teknis"** — tabel `No`/`Parameter`/`Hasil Pengamatan` (`Baik`/`Tidak Baik`) untuk 3 kategori berbobot: `Kondisi Alat (10)`, `Keselamatan Listrik (40)`, `Kinerja Peralatan (50)` — total bobot 100, mengindikasikan skema skoring/rekapitulasi.
- **"Kesimpulan Telaah Teknis Kalibrasi"** — dua opsi: `Baik dan laik untuk digunakan` / `Tidak baik dan tidak laik untuk digunakan`.
- **"Petugas Kalibrasi :"** dan **"Entri data oleh :"** — blok nama/tanda tangan, tidak ada gambar tanda tangan tertanam (semua file adalah blank template, jadi tidak ada gambar tanda tangan atau stempel yang perlu dianalisis).
- **Tidak ditemukan** blok approval MT/QA terpisah secara eksplisit dalam template ini (hanya "Petugas Kalibrasi" dan "Entri data oleh") — **UNKNOWN**: apakah approval MT terjadi di luar dokumen ini (mis. di sistem lain) tidak bisa dipastikan hanya dari file LK.

## Footer

- Teks tetap: `"This document is confidential and proprietary of PT. Presisi Kalibrasi Medika"` (muncul di 49 file; kosong pada footer1/footer3 Laryngoskop karena alasan teknis Word "different first page" yang dijelaskan di [03-format-forensics.md](03-format-forensics.md), footer2 Laryngoskop tetap berisi teks yang sama).
- Tidak ada nomor halaman otomatis terdeteksi sebagai field Word (`PAGE`/`NUMPAGES`) dalam teks yang diekstrak — nomor halaman "Halaman: X dari Y" tampak sebagai teks statis di **header**, bukan footer, dan bukan field dinamis Word.
