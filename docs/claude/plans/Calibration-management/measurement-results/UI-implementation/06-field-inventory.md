# 6. Consolidated Field Inventory (Phase 6)

Field label menggunakan terminologi persis dari dokumen asli (tidak dinormalisasi).

| Field | Appears In | Source Type | Structured? | Notes |
|---|---|---|---|---|
| Kode Dokumen | Semua 50 file (header) | teks paragraf di header XML | Ya (regex-extractable) | Format `F.MT.LK.01.XX`; 1 file (Thermohygrometer) kodenya tidak lengkap |
| Nama Alat / judul pengujian | Semua 50 file (header) | teks paragraf | Ya | Penulisan device beragam ("Pengujian X" vs "Kalibrasi X") |
| Edisi/Revisi, Tanggal Edisi, Tanggal Revisi | Semua 50 file (header) | teks paragraf | Ya (regex) | 3 gelombang tanggal edisi teramati |
| Halaman X dari Y | Semua 50 file (header) | teks statis | Ya (regex) | Statis, bukan field dinamis |
| No. sertifikat | Semua 50 file | label + blank di tabel | Ya (tabel) | Selalu kosong (template) |
| Nama Alat: / No.alat: / Merk: / Pemilik: / Model/tipe: / Ruangan: / No.seri: / Tgl. Terima: / Kapasitas: / Tgl. Kalibrasi: / Resolusi: | Semua 50 file | label + blank di tabel identitas | Ya (tabel) | Blok identik di semua file |
| Daftar Alat yang Digunakan (No, Nama Alat, Merk, Type/Model, No. Seri) | Semua 50 file | tabel | Ya | Baris terisi nama alat standar, jumlah baris 2–7 tergantung alat |
| Pengukuran Kondisi Lingkungan (Suhu, Kelembaban, Tegangan Input) | Semua 50 file | tabel | Ya | Nilai toleransi bervariasi per alat |
| Pemerikasaan Kondisi Fisik dan Fungsi Komponen Alat (Parameter, Batas Pemeriksaan, Keterangan, Baik/Tidak Baik) | Semua 50 file | tabel | Ya | 4–9 baris tergantung alat; sebagian item spesifik alat |
| Pengukuran Keselamatan Listrik (Tipe bagian, Kelas Proteksi, Hubungan Utama) | Hampir semua file (tidak semua device relevan) | tabel | Ya | Konsisten strukturnya di file yang punya bagian ini |
| Resistansi Pembumian Protektif / Resistansi Isolasi / Arus Bocor Peralatan / Arus bocor bagian yang diaplikasikan | File dengan listrik AC | tabel | Ya | Satuan & ambang batas konsisten |
| Hasil Pengukuran Kinerja Alat (device-specific) | Semua 50 file, isi sangat bervariasi | tabel (multi sub-tabel) | Sebagian ya, sebagian butuh parsing khusus per device | **Tidak bisa digeneralisasi** — field/kolom/satuan berbeda per jenis alat |
| Telaah Teknis (Kondisi Alat 10 / Keselamatan Listrik 40 / Kinerja Peralatan 50) | Semua 50 file | tabel | Ya | Skema skor berbobot total 100 |
| Kesimpulan Telaah Teknis Kalibrasi | Semua 50 file | teks pilihan (checkbox-like) | Ya | Dua opsi tetap |
| Petugas Kalibrasi / Entri data oleh | Semua 50 file | teks + blank | Ya (posisi tetap) | Tidak ada gambar tanda tangan di template kosong ini |
| Gambar diagram titik ukur ("Gambar 1. Posisi Titik ...") | Sebagian file (mis. Bio Safety Cabinet, Baby Incubator) | embedded image | Tidak (gambar statis) | Bagian dari template, bukan data yang diisi per kalibrasi |
| Logo perusahaan | Semua 50 file | embedded image (header) | Tidak (gambar statis) | Identik byte-for-byte di semua file |

> Catatan penting: tabel ini **tidak memetakan field ke model database MedCal apapun** — sesuai instruksi task, ini hanya inventaris field yang benar-benar ada pada dokumen LK.
