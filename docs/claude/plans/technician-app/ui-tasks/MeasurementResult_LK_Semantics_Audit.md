# MeasurementResult LK Semantics Audit

**Date:** 2026-09-10  
**Mode:** ANALYSIS ONLY — no code, schema, enum, API, UI, or test changes  
**Source of truth:** `D:\medcal\docs\technician-docs\Lembar-Kerja` (50 blank `.docx` templates)  
**Extraction method:** unzip `word/document.xml` (+ footnotes) and strip Word tags, preserving table cell/row boundaries  

This report recovers **what the technician is expected to record** from the original LK, before deciding how MeasurementResult should represent qualitative results. Terminology is preserved from the LK. **“Baik / Tidak Baik” is not treated as PASS/FAIL** unless the LK itself prints that equivalence (it does not).

---

## 1. Source Documents Reviewed

All 50 worksheets in the folder were extracted and read. File names:

| # | File | Notes from this read |
|---|---|---|
| 1 | `LK Audiometer.docx` | Earphone Kanan/Kiri; I–III |
| 2 | `LK Auto Chemistry Analyzer.docx` | Free-form analyte list; control certificate |
| 3 | `LK Autoclave.docx` | Derived ΔT; dual cycle 121/134 |
| 4 | `LK Baby Incubator.docx` | Display UUT + hasil standar; dual tolerance classes |
| 5 | `LK Bed Side Monitor.docx` | Canonical env + fisik + listrik + grid I–V |
| 6 | `LK Bio Safety Cabinet.docx` | Smoke observation + HEPA `Pass / Fail` |
| 7 | `LK Blanket Warmer.docx` | Logger listed; numeric temp sweep |
| 8 | `LK Blood Bank Refrigerator.docx` | T1–T9 × 30; lampiran logger |
| 9 | `LK Blood Pressure Monitor.docx` | NIBP grid; Telaah 10/40/60 |
| 10 | `LK Centrifuge.docx` | Min/Med/Max rpm |
| 11 | `LK Centrifuge Refrigerator.docx` | Speed + logger temp section |
| 12 | `LK Cold Chain, Vaccine Refrigerator.docx` | Same logger template as BBR |
| 13 | `LK CPAP.docx` | Concentration + flow |
| 14 | `LK Dental Unit.docx` | Distinct Low/High speed bands |
| 15 | `LK Dental X-Ray.docx` | Collimation split; HVL 70/80 kV |
| 16 | `LK Electro Accupunture (EST).docx` | Covariates held constant |
| 17 | `LK Electrocardiograph.docx` | Multiple sub-tables |
| 18 | `LK Examination Lamp.docx` | Intensitas / CCT / CRI |
| 19 | `LK Fetal Doppler.docx` | FHR sweep |
| 20 | `LK Flow Meter.docx` | **No** listrik; Telaah 20/80 |
| 21 | `LK Head Lamp Medik.docx` | Physical item: Battery box |
| 22 | `LK Hematologi Analyzer.docx` | Free-form analytes; ± SD / % |
| 23 | `LK Humidifier.docx` | Max temp + accuracy |
| 24 | `LK Infant Warmer.docx` | Spatial T1–T5 + display vs standar |
| 25 | `LK Infusion Pump.docx` | Extra header field `Channel` |
| 26 | `LK Kelistrikan.docx` | **No** kinerja device; **no** Telaah poin; 5-tier categorical |
| 27 | `LK Laminar Air Flow.docx` | Particle / downflow / lux / sound / UV |
| 28 | `LK Lampu Operasi.docx` | Lighting family |
| 29 | `LK Laryngoskop.docx` | Lighting family |
| 30 | `LK Medical Freezer.docx` | Logger T1–T9 × 30 |
| 31 | `LK Medical Refrigerator.docx` | Logger T1–T9 × 30 |
| 32 | `LK Mikroskop Laboratorium.docx` | Stage/okuler + **calculated ratio** |
| 33 | `LK Nebulizer Compressor.docx` | Flow min-only |
| 34 | `LK Nebulizer Ultrasonic.docx` | Flow range |
| 35 | `LK Oksigen Concentrator.docx` | **No** listrik; Telaah 20/80 |
| 36 | `LK Otoscope.docx` | Lighting family; Intensitas toleransi `-` |
| 37 | `LK Oven.docx` | Logger T1–T9 × 30 |
| 38 | `LK pH Meter.docx` | **No** listrik; Result 1–3 + **Status**; Telaah lists “Keselamatan Listrik 90” |
| 39 | `LK Phaco Emulsifikasi.docx` | Vacuum Naik/Turun — same shape as Suction Gauge |
| 40 | `LK Phototherapy.docx` | Irradiance grid titik 1–4/M |
| 41 | `LK Platelet Agitator Incubator.docx` | Logger T1–T9 × 30 |
| 42 | `LK Pulse Oxymeter.docx` | HR + SpO2; I–VI |
| 43 | `LK Resusitator Paru dan Neopuff.docx` | Pressure accuracy + max pressure |
| 44 | `LK Rotator.docx` | Min/Med/Max |
| 45 | `LK Sphygmomanometer.docx` | **No** listrik; leak (derived); naik/turun; U95 ≤ MPE |
| 46 | `LK Spirometer.docx` | FVC 0,5 / 3 liter |
| 47 | `LK Sterilisator.docx` | Logger T1–T9 × 30 |
| 48 | `LK Suction Pump.docx` | Free setting + Naik/Turun; Max Vacuum class; conversion table (not data) |
| 49 | `LK Syringe Pump.docx` | Channel header like Infusion |
| 50 | `LK Thermohygrometer.docx` | **No** listrik; paired **Refrence** vs UUT; Naik/Turun RH |

**Not in folder:** `LK Ventilator.docx`. Corpus sebelumnya memakai Excel terisi, bukan template LK ini.

**Corpus nature:** semua 50 adalah **template kosong**. Tidak ada pembacaan teknisi terisi. Angka `37465…` di sel fisik adalah state field Word (checkbox), bukan hasil ukur.

**Dua file yang isinya tidak sesuai nama (tetap dibaca apa adanya):**

- `LK Otoscope.docx` — uji sumber cahaya (Intensitas / CCT / CRI), bukan otoskop klinis.
- `LK Phaco Emulsifikasi.docx` — uji tekanan vakum Naik/Turun, bukan daya ultrasonik phaco.

---

## 2. Executive Summary

LK **tidak** merekam satu jenis “hasil” saja. Teknisi mengisi **beberapa kelas data yang berbeda**, di bagian yang berbeda, dengan wording yang berbeda.

Kelas yang muncul di corpus:

1. **Identitas / konteks pekerjaan** (teks, tanggal, kapasitas, resolusi) — bukan hasil kalibrasi kinerja.
2. **Daftar Alat yang Digunakan** (merk/tipe/no. seri standar) — identitas alat acuan, bukan MeasurementResult.
3. **Kondisi lingkungan** — angka Suhu/RH **Awal** dan **Akhir**, kadang **Tegangan Input** L-N/L-G/N-G, dibanding kolom **Toleransi**.
4. **Pemeriksaan kondisi fisik dan fungsi** — per item, pilihan **Baik** / **Tidak Baik**.
5. **Klasifikasi kelistrikan** — pilihan **B / BF / CF**, **I / II / Baterai**, **DPS / NPS / PIE**.
6. **Pembacaan keselamatan listrik** — angka **Terukur** vs **Ambang Batas**.
7. **Hasil pengukuran kinerja** — mayoritas **angka** (sering I–V, kadang grid setting), dibanding **Toleransi**; plus beberapa bentuk lain (lihat §4–§8).
8. **Pengamatan kualitatif kinerja** — hanya BSC smoke pattern dan HEPA **Pass / Fail**.
9. **Telaah Teknis** — skor kategori dengan **Baik** / **Tidak Baik**, lalu **Kesimpulan** **Baik dan laik untuk digunakan** / **Tidak baik dan tidak laik untuk digunakan**.
10. **Pengecualian Kelistrikan** — **Penilaian Secara Menyeluruh** lima kalimat kategori, bukan poin Telaah.

**Temuan wording yang penting untuk MeasurementResult:**

- LK **tidak** memakai **“Sesuai / Tidak Sesuai”** sebagai label hasil ukur. “Sesuai” hanya muncul di prosa instruksi (contoh: sekering “sesuai dengan spesifikasi”, “isi setting sesuai UUT”).
- **Baik / Tidak Baik** dipakai untuk **pemeriksaan fisik** dan untuk **Telaah Teknis** (hasil pengamatan per kategori), **bukan** untuk sel angka Heart Rate / NIBP / arus bocor.
- **Pass / Fail** hanya tercetak pada **Pengukuran Kebocoran Hepa / Ulpa Filter** (BSC).
- **Tidak ada** pilihan tercetak **Berfungsi / Tidak Berfungsi**, **Ada / Tidak Ada**, **Yes / No**, atau **Sesuai / Tidak Sesuai** sebagai hasil item.
- Smoke test BSC memakai prosa pengamatan (**deteksi adanya turbelensi atau tidak**, **Masuk kompartemen atau tidak**, **Keluar kopartemen atau tidak**) — **bukan** checkbox Baik dan **bukan** Pass/Fail.
- LK **tidak** menyatakan rumus yang mengubah satu sel angka menjadi Telaah, atau yang mengubah Telaah menjadi kesimpulan laik. Hubungan itu **tidak tertulis**.

Sistem saat ini mengevaluasi **MeasurementResult.isWithinTolerance** (NUMBER/RATIO vs bounds; BOOLEAN = `measuredBool`; TEXT = null) dan UI Tech-PWA memetakan boolean itu ke **“Sesuai / Tidak sesuai”**. Itu **label sistem**, bukan wording LK untuk sel ukur.

---

## 3. Complete Result-Type Inventory

Tabel ini adalah **inventaris semantik**. Baris “universal” berlaku pada hampir semua LK; baris kinerja diringkas per **pola**, karena mengulang setiap setpoint I–V tidak menambah jenis hasil.

| LK Section | Parameter/Test Item | Technician Input | Type | Exact LK Result/Wording | Tolerance? | Compliance Meaning | Notes |
|---|---|---|---|---|---|---|---|
| Header | No. sertifikat, Nama Alat, Merk, Model/tipe, No.seri, Kapasitas, Resolusi, No.alat, Pemilik, Ruangan, Tgl. Terima, Tgl. Kalibrasi | Isi teks/tanggal/angka identitas | TEXT / OTHER | (blank fill-in) | Tidak | Tidak ada verdict di header | Infusion/Syringe menambah `Channel` |
| Daftar Alat yang Digunakan | Nama Alat / Merk / Type/Model / No. Seri (1–7 baris) | Isi identitas standar yang dipakai | TEXT | (blank) | Tidak | Bukan hasil UUT | Ada di **50/50** |
| Pengukuran Kondisi Lingkungan | Suhu (°C) | **Awal** dan **Akhir** angka °C | NUMBER | `Awal : … °C` / `Akhir : … °C` | Ya, kolom Toleransi (contoh `25 ± 5 °C`, `25 ± 6 °C`, `10 - 40 °C`, `15 °C - 30 °C`) | LK menaruh Toleransi di samping; **tidak** menulis “jika di luar maka …”) | Dua pembacaan, bukan I–V |
| Pengukuran Kondisi Lingkungan | Kelembaban / RH (%) | Awal dan Akhir % | NUMBER | sama | Ya (contoh `55 % ± 20 % RH`, `15 % - 85 % RH`, `55 % ± 10 % RH`) | Sama: batas tercetak, aturan gagal tidak tercetak | |
| Pengukuran Kondisi Lingkungan | Tegangan Input L-N, L-G, N-G | Angka Vac per kaki | NUMBER | `L-N : … Vac` dst. | Ya, biasanya `220 ± 10% Volt` (satu sel untuk tiga kaki) | Tidak dijelmakan ke PASS | **Absen** di Flow Meter, Oksigen Concentrator, pH Meter, Sphygmomanometer, Thermohygrometer |
| Pemerikasaan Kondisi Fisik dan Fungsi Komponen Alat | Item perangkat-spesifik (lihat §6) | Pilih satu dari dua | ENUM/CHOICE | **Baik** / **Tidak Baik** | Tidak (ada **Batas Pemeriksaan** berupa prosa, bukan angka) | LK tidak menghubungkan item ini ke Telaah secara rumus | Ada di **49/50** (tidak di Kelistrikan). 3–9 item per alat |
| Pengukuran Keselamatan Listrik | Tipe bagian yang diaplikasikan | Pilih | ENUM/CHOICE | **B** / **BF** / **CF** | Tidak | Klasifikasi, bukan Terukur | Form field Word |
| Pengukuran Keselamatan Listrik | Kelas Proteksi | Pilih | ENUM/CHOICE | **I** / **II** / **Baterai** | Tidak | Dipakai LK untuk membedakan ambang arus bocor di beberapa alat | |
| Pengukuran Keselamatan Listrik | Hubungan Utama | Pilih | ENUM/CHOICE | **DPS** / **NPS** / **PIE** | Tidak | Catatan definisi tercetak | |
| Pengukuran Keselamatan Listrik | Resistansi Pembumian Protektif | Angka + satuan Ω | NUMBER | kolom **Terukur** | Ya, **Ambang Batas** `≤ 0,3 Ω` | Bandingkan ke ambang; tidak ada label Sesuai | Mayoritas LK listrik |
| Pengukuran Keselamatan Listrik | Resistansi Isolasi | Angka MΩ | NUMBER | Terukur | Ya, `> 2 MΩ` | Sama | |
| Pengukuran Keselamatan Listrik | Arus Bocor Peralatan | Angka µA | NUMBER | Terukur | Ya; kadang satu ambang `≤ 500 µA` / `≤ 100 µA`; kadang **Kelas I ≤ 500 µA / Kelas II ≤ 100 µA** | LK tidak menulis cara pilih kelas otomatis | Dual-class = ambiguitas |
| Pengukuran Keselamatan Listrik | Arus bocor bagian yang diaplikasikan | Angka µA | NUMBER | Terukur | Ya (`≤ 50 µA` atau `≤ 500 µA`) | Catatan: *Tidak dilakukan jika baterai*; *Diuji ketika UUT ke pasien* | Boleh tidak diisi — aturan kapan wajib tidak formal |
| Hasil Pengukuran Kinerja Alat | Sweep setting × ulangan (HR, SpO2, NIBP, flow, dll.) | Angka per sel I–V (atau I–III / I–VI / I–IX) | NUMBER | **Hasil Pengukuran** (satuan di header) | Ya, sel **Toleransi** bersama (`± N`, `± N%`, min/max) | Batas ada; **tidak** ada kolom Baik/Pass per sel | Pola mayoritas |
| Hasil Pengukuran Kinerja Alat | Pola A: satu target, ulangan | Angka I–V | NUMBER | Hasil Pengukuran / Terukur | Ya (≤, ≥, rentang) | Sama | Contoh Dental illuminance `>15.000 lux` |
| Hasil Pengukuran Kinerja Alat | Display UUT vs Hasil Pengukuran Standar | **Dua** angka (display + standar) di baris yang sama | NUMBER | `Display UUT` dan `Hasil Pengukuran Standar` | Ya, pada standar atau pada keduanya — **tidak selalu jelas** | Lihat ambiguitas Baby Incubator / BSC | |
| Hasil Pengukuran Kinerja Alat | Paired refrence vs UUT (Thermohygrometer) | Angka di tabel **Pembacaan Refrence** dan tabel UUT terpisah | NUMBER | nama kolom tabel | **Tidak ada toleransi tercetak** pada tabel suhu/RH | Tidak bisa auto-compliance dari LK | Naik/Turun untuk RH |
| Hasil Pengukuran Kinerja Alat | Naik / Turun | Angka per arah | NUMBER | header **Naik** / **Turun** atau **naik** / **turun** | Ya (vacuum ±10%; sphyg ±4 mmHg + U95) | Per sel arah; agregat tidak ditulis | Sphyg, Suction, Phaco, Thermo RH |
| Hasil Pengukuran Kinerja Alat | Slot kualitatif Min/Med/Max, Rendah/Sedang/Tinggi | Setting dipilih + angka hasil | ENUM/CHOICE + NUMBER | label setting tercetak; hasil angka | Ya, satu ±% bersama | Setting bukan hasil | Centrifuge, Rotator, Dental X-Ray time |
| Hasil Pengukuran Kinerja Alat | Maximum Vacuum (Suction) | Isi **salah satu** kelas + angka | NUMBER + ENUM | Low / Medium / High; `*isi salah satu sesuai dengan UUT` | Ya, tiga **Ambang Batas** berbeda | Klasifikasi rated class, bukan tiga tes wajib | |
| Hasil Pengukuran Kinerja Alat | Setting bebas (Suction/Phaco gauge) | Teknisi menulis setting UUT + hasil | NUMBER | `*isi setting sesuai UUT`; satuan `mmHg/…` | Ya `± 10%` | Nominal dipilih di lapangan | |
| Hasil Pengukuran Kinerja Alat | Analyte list (Chemistry / Hematologi) | Nama boleh diganti; angka I–V; toleransi boleh dari sertifikat control | NUMBER + TEXT | `Hasil pembacaan UUT`; note ganti parameter | Ya, per analit **berbeda**; atau dari sertifikat | Daftar tidak tetap | |
| Hasil Pengukuran Kinerja Alat | pH Meter Assay | Result 1, 2, 3 + **Status** | NUMBER + OTHER | `Result 1/2/3`, `Status`, `Range ±0,05` | Ya `±0,05` | **Status tidak diisi pilihan tercetak** | Buffer + Lot Code = setting/referensi |
| Hasil Pengukuran Kinerja Alat | Mikroskop 4x / 10x | Stage terbaca, okuler, **Hasil (Nilai stage / Okuler)** | NUMBER + calculated | rumus di header kolom | Ya `± 5%` | Hasil kolom ketiga adalah hitungan | |
| Hasil Pengukuran Kinerja Alat | Nilai Ratio Pembesaran | 4x, 10x, **Objektif 4x / Objektif 10x** | NUMBER (ratio) | kolom rasio | Ya `± 5%` | Derived | |
| Hasil Pengukuran Kinerja Alat | Autoclave ΔT | Penunjukan S1/S2/S3 lalu ΔT | NUMBER (calculated) | `ΔT1 = S1 – S2` dst. | Ya `± 2 °C` / `± 5 °C` | Derived | Setting 121/134 di satu sel `121 / 134` |
| Hasil Pengukuran Kinerja Alat | Logger cold-storage | Indikator UUT + (standar **tidak diketik**); 30 baris Data ke × T1–T9 | NUMBER + lampiran | `Pembacaan indikator UUT`; note lampiran 12 channel | Ya, `Variasi suhu = …` / `± °C` | Hasil standar di **belakang LK**, bukan sel | |
| Hasil Pengukuran Kinerja Alat | Sphyg leak | Satu angka “dalam 1 menit” | NUMBER (derived) | note: **nilai yang dimasukan di hasil ukur adalah setting – pembacaan standar** | Ya `≤ 15 mmHg / 1 menit` | Bukan raw pressure | |
| Hasil Pengukuran Kinerja Alat | Sphyg rapid deflation | Tekanan akhir + **Waktu terukur (detik)** | NUMBER | waktu | Ya `≤ 10 detik` | Awal 260 / akhir 15 tercetak | |
| Hasil Pengukuran Kinerja Alat | BSC Particle Count | Angka per posisi 1–4 | NUMBER | Hasil Pengukuran Standar | Ya `0,5 ≤ 100 particle` | Posisi, bukan I–V | |
| Hasil Pengukuran Kinerja Alat | BSC Downflow / Inflow | Angka I–IX × posisi; **Average / Min / Max / K factor** | NUMBER + calculated | Acceptance EN/NSF % dari rata-rata | Ya min/max **dan** % rata-rata | Dua kriteria sekaligus | |
| Hasil Pengukuran Kinerja Alat | BSC Lighting / Sound | Angka; Lampu ON/OFF, Noise ON/OFF | NUMBER | Hasil Pengukuran Standar | Ya, **beda** per ON/OFF | Satu tabel dua ambang | |
| Hasil Pengukuran Kinerja Alat | BSC UV | Angka | NUMBER | | Ya `≥ 40 µw / cm2` | | |
| Hasil Pengukuran Kinerja Alat | BSC Uji pola aliran udara asap | Pengamatan (bukan angka) | TEXT / BOOLEAN / OTHER | **deteksi adanya turbelensi atau tidak**; **Masuk kompartemen atau tidak**; **Keluar kopartemen atau tidak** | Tidak numerik; kriteria prosa | Kualitatif; **bukan** Baik dan **bukan** Pass/Fail | Beberapa tes; form field rusak di XML |
| Hasil Pengukuran Kinerja Alat | BSC Hepa / Ulpa Filter | Pilih | ENUM/CHOICE | **Pass / Fail** | Tidak numerik | Satu baris `Seluruh hepa`; note foto jika bocor | Satu-satunya Pass/Fail tercetak |
| Hasil Pengukuran Kinerja Alat | Otoscope Intensitas Cahaya | Angka I–III | NUMBER | | Toleransi sel **`-`** | LK tidak memberi batas | |
| Tabel Konversi (Suction) | PSI, Bar, … | **Tidak diisi** | OTHER | dokumentasi | — | Bukan hasil | |
| Telaah Teknis | Kondisi Alat / Keselamatan Listrik / Kinerja Peralatan | Pilih Baik atau Tidak Baik per baris; bobot angka tercetak | ENUM/CHOICE | **Baik** / **Tidak Baik** | Bobot 10/40/50 (varian ada) | **Hasil Pengamatan** kategori; rumus total **tidak** tertulis | 49/50 kecuali Kelistrikan |
| Kesimpulan Telaah Teknis Kalibrasi | Kesimpulan keseluruhan | Pilih satu | ENUM/CHOICE | **Baik dan laik untuk digunakan** / **Tidak baik dan tidak laik untuk digunakan** | Tidak | Kesimpulan LK; **tidak** disebut PASS/FAIL | |
| Penilaian Secara Menyeluruh (Kelistrikan saja) | Risiko/keselamatan instalasi | Pilih satu dari lima | ENUM/CHOICE | lihat §5 | Tidak | Mengganti Telaah poin | |
| Sign-off | Petugas Kalibrasi / Entri data oleh | Nama | TEXT | | Tidak | Dua peran | 50/50 |

---

## 4. Numeric Measurement Patterns

### 4.1 Lingkungan (bukan I–V)

Teknisi menuliskan **Awal** dan **Akhir** untuk suhu dan RH. Tegangan (jika ada) tiga kaki. Toleransi tercetak di kolom kanan. **Tidak** ada ulangan I–V. **Tidak** ada label Baik pada sel ini.

Variasi toleransi yang benar-benar tercetak (contoh): `25 ± 5 °C`, `25 ± 6 °C`, `10 - 40 °C`, `15 °C - 30 °C`, `55 % ± 20 % RH`, `15 % - 85 % RH`, `55 % ± 10 % RH`, `220 ± 10% Volt`.

### 4.2 Keselamatan listrik — Terukur vs Ambang Batas

Satu angka per parameter (bukan grid). Ambang berbentuk `≤`, `>`, atau **dua kelas**. Catatan boleh tidak uji applied-part.

### 4.3 Kinerja — satu target + ulangan (Pola A)

Contoh: Dental Unit illuminance I–V, `>15.000 lux`; Nebulizer compressor `≥ 4 lpm`; Sphyg leak satu setting 250 mmHg.

### 4.4 Kinerja — setting sweep, satu toleransi (Pola B)

Contoh BSM Heart Rate setting 30/60/120/180, kolom I–V, `± 5 bpm`. NIBP tiga kolom Systole/Mean/Diastole. Audiometer Kanan/Kiri.

Ulangan **tidak selalu 5**: I–III (Audiometer, Autoclave ster temp, Otoscope), I–V (mayoritas), I–VI (Pulse Ox, Thermo), I–IX (BSC velocity).

### 4.5 Kinerja — varian dengan ambang berbeda (Pola C)

Contoh: Autoclave 121 → `121 °C ~ 124 °C` vs 134 → `134 °C ~137 °C`; BSC Lampu ON `≥ 450 lux` vs OFF `≤ 160 lux`; Suction Max Vacuum tiga pita.

### 4.6 Angka yang dihitung atau diturunkan

- Mikroskop: `Hasil (Nilai stage / Okuler)`; rasio 4x/10x.
- Autoclave: `ΔT1 = S1 – S2`, `ΔT2 = S1 – S3`, `ΔT3 = S1 – S3` (ΔT2 dan ΔT3 **sama rumus S1–S3** di LK — ambiguitas).
- Sphyg leak: **setting − pembacaan standar**.
- BSC: Average, Min, Max, K factor; acceptance `EN : 20% x rata-rata` / `NSF : 25% x rata-rata`.
- Infant/BSC/Baby Incubator: kolom Display UUT **dan** hasil standar.

### 4.7 Logger — angka tidak lengkap di LK

Cold chain / BBR / Medical fridge-freezer / Oven / Sterilisator / Platelet / (Centrifuge Refrigerator temp): 30 × T1–T9. Note persis: **“untuk pembacaan standar sudah terekam pada thermometer 12 channel, hasilnya akan dilampirkan pada dibelakang LK”**. Teknisi masih punya kolom **Pembacaan indikator UUT**.

### 4.8 Nominal / setting yang tercetak vs yang diisi

- Tercetak: angka setting simulator/UUT (HR 30, buffer pH, 36 °C).
- Diisi teknisi: Min/Med/Max aktual rpm; `isi setting sesuai UUT`; Lot Code buffer; `Setting nilai control pada UUT sesuai dengan sertifikat control`.
- Bukan hasil: tabel konversi satuan Suction.

---

## 5. Qualitative / Boolean / Choice Result Patterns

### 5.1 Baik / Tidak Baik — fisik

Setiap baris “Pemerikasaan Kondisi Fisik…” punya kolom **Keterangan** dengan dua pilihan **Baik** dan **Tidak Baik**. Ini **bukan** hasil ukur numerik.

### 5.2 Baik / Tidak Baik — Telaah Teknis

Tabel **Hasil Pengamatan** dengan kolom **Baik** dan **Tidak Baik** untuk:

- Kondisi Alat (bobot 10, atau 20 pada Flow/Oksigen)
- Keselamatan Listrik (40, atau 90 pada pH meskipun bagian listrik absen — inkonsistensi template)
- Kinerja Peralatan (50, atau 60 BPM/Blanket, atau 80 Flow/Oksigen, atau 90 Sphyg/Thermo)

LK **tidak** menulis cara mengisi Baik dari kumpulan sel I–V.

### 5.3 Kesimpulan laik

**Baik dan laik untuk digunakan**  
**Tidak baik dan tidak laik untuk digunakan**

Tidak disebut Pass/Fail. Tidak disebut Sesuai.

### 5.4 Pass / Fail

Hanya: **Pengukuran Kebocoran Hepa / Ulpa Filter** → `Seluruh hepa` → **`Pass /  Fail`**. Note: foto titik bocor.

### 5.5 Smoke pattern (BSC) — pengamatan, wording sendiri

Bukan Baik, bukan Pass/Fail. Prosa + prompt:

- deteksi adanya turbelensi atau tidak
- Masuk kompartemen atau tidak
- Keluar kopartemen atau tidak

XML form field rusak; **pilihan eksak (ya/tidak vs checkbox)** tidak bisa dipastikan dari template.

### 5.6 Klasifikasi listrik

**B / BF / CF**, **I / II / Baterai**, **DPS / NPS / PIE**.

### 5.7 Kelistrikan — lima kategori (bukan Telaah)

Tercetak persis:

1. Aman tidak terjadi penyimpangan
2. Terdeksi tidak aman atau terjadi penyimpangan fungsional
3. Tidak ada resiko langsung, terdeteksi penyimpangan mungkin akan diperbaiki dalam waktu dekat
4. Peralatan tidak diijinkan operasional hingga penyimpangan diperbaiki/dikoreksi
5. Peralatan tidak memenuhi-disarankan modifikasi / pertukaran komponen / ditarik dari layanan

### 5.8 pH Status

Kolom **Status** kosong — **tidak** ada Baik, Pass, atau Sesuai tercetak. Tidak bisa disimpulkan dari LK apa yang diisi.

### 5.9 Yang **tidak** ditemukan sebagai hasil pilihan

- Sesuai / Tidak Sesuai (sebagai hasil)
- Berfungsi / Tidak Berfungsi (hanya di prosa Batas Pemeriksaan)
- Ada / Tidak Ada (sebagai pasangan hasil)
- Yes / No

---

## 6. Inspection / Condition Result Patterns

Bagian judul persis (typo LK dipertahankan): **Pemerikasaan Kondisi Fisik dan Fungsi Komponen Alat**.

Struktur tetap: No. | Parameter | Batas Pemeriksaan | Keterangan (Baik / Tidak Baik).

**Batas Pemeriksaan** adalah instruksi visual/fungsi (bersih, tidak longgar, isolasi tidak terkelupas, tampilan berfungsi), **bukan** toleransi angka.

Item yang tercetak (nama LK, termasuk variasi ejaan):

Badan / Permukaan; Badan dan permukaan alat; Kotak kontak alat / Kotak Kontak Alat / Tusuk kontak alat; Kabel catu utama (Line cord / line cord); Tombol, Saklar dan pengaman / kontrol / control; Tampilan dan indikator / indicator; Sekering Pengaman; Kondisi Fungsi; Katup dan control; Baterai; Baterai/Charger; Battery box; Charging socket; Periksa kondisi charger; Alarm dan system interlock (dan typo “dsan”); System interlock gas; Lensa okuler; Lensa Objective; Earphone; Filter; Gauge/tabung; Balon tensi; Manset; Pengaturan titik 0; Matras; Sensor suhu kulit; Control panel; Indicator; Label; Lampu; Kelengkapan alat; Konektor; Kabel tranduser; Kompresor; Kompresor / pompa; Motor/pompa penghisap; Saringan udara; Selang dan konektor; Selang utama sumber gas; Selang-selang; Batas cairan; Pengaman; Roda dan pengunci; Sistem/System pengunci pergerakan; System pengunci dan penyeimbang; Mekanisme pergerakan.

**Kelistrikan:** bagian fisik ini **tidak ada**.

---

## 7. Reference / Nominal / Setting Values

| Bentuk di LK | Apa yang diisi teknisi | Bukan |
|---|---|---|
| Setting Simulator / Setting UUT / Setting Standar tercetak | Hasil ukur di kolom I… | Setting itu sendiri (sudah tercetak) |
| Display UUT | Angka yang ditunjukkan UUT | Kadang di samping hasil standar |
| Pembacaan Refrence Thermohygrometer | Angka alat acuan | UUT (tabel terpisah) |
| Hasil Pengukuran Standar | Angka alat standar | Display |
| Daftar Alat yang Digunakan | Identitas standar | Pembacaan |
| Buffer Solution / Lot Code | Identitas bahan acuan | Hasil pH |
| Sertifikat control (analyzer) | Setting/toleransi dari luar LK | Daftar tetap |
| Setting 121 / 134 (satu sel Autoclave chamber) | Pilih siklus + S1/S2/S3 | |
| Min/Med/Max, Rendah/Sedang/Tinggi | Pilih slot + ukur | |
| `isi setting sesuai UUT` | Nominal on-site | |
| Tabel konversi | Tidak diisi | Dokumentasi |

`referenceValue` di skema saat ini selaras dengan **pasangan standar vs UUT**. `appliedNominalValue` selaras dengan setting tercetak / dipilih. LK sering menuntut **keduanya** (display + standar) di baris yang sama — itu **dua pembacaan**, bukan satu `measuredValue`.

---

## 8. Replicate / Test Point Behavior

| Shape | LK | Satu hasil atau banyak |
|---|---|---|
| I, II, III, IV, V | Mayoritas kinerja | **Per ulangan**; rata-rata **tidak** diminta kecuali BSC velocity acceptance |
| I–III | Audiometer, Autoclave ster, lampu otoscope | Per ulangan |
| I–VI | Pulse Ox, Thermo | Per ulangan |
| I–IX | BSC downflow/inflow | Per ulangan × posisi |
| Posisi 1–4 | Particle, phototherapy titik | Per posisi |
| Posisi A/B/C | BSC/LAF velocity | Per posisi |
| Sensor T1–T9 × Data ke 1–30 | Logger | Grid; standar dilampirkan |
| Sensor TM/T5, T1–T4 × 32 & 36 °C × I–V | Baby Incubator | Per sel; toleransi beda TM vs T1–T4 |
| T5, T1–T4 × pengukuran ke 1–5 | Infant Warmer | Per titik × ulangan |
| Naik/Turun | Sphyg, Suction, Phaco, Thermo RH | Per arah |
| Earphone Kanan/Kiri | Audiometer | Dua blok tabel |
| Lingkungan Awal/Akhir | Semua | Dua, bukan I–V |
| Listrik Terukur | Mayoritas | **Tunggal** per parameter |
| Fisik Baik/Tidak Baik | 49 LK | **Tunggal** per item |
| HEPA Pass/Fail | BSC | **Tunggal** (`Seluruh hepa`) |
| Telaah | 49 LK | **Tunggal** per kategori + satu kesimpulan |

LK **tidak** menulis: “lulus jika semua ulangan di dalam toleransi”, “lulus jika rata-rata…”, atau “satu sel gagal menggagalkan alat” — kecuali BSC yang menyebut Average/Min/Max dan EN/NSF % rata-rata untuk velocity.

---

## 9. Current System vs LK Gap Analysis

Kriteria: **LK explicitly requires it** vs dukungan sistem **sekarang** (tanpa mengubah apa pun).

| Kebutuhan yang terlihat di LK | Status |
|---|---|
| Angka kinerja vs toleransi `±` / min / max / `≤` / `≥` | **LK explicitly requires it.** **Current system supports it** (NUMBER/RATIO + `isWithinTolerance` at write). Tech-PWA hanya listing **NUMBER** DIRECT/GRID. |
| Ulangan I–n sebagai baris terpisah | **LK explicitly requires it.** **Current system supports it** (`replicateIndex`). |
| Test point / setting sweep | **LK explicitly requires it.** **Current system supports it** (`CalibrationTestPoint`). |
| Naik/Turun | **LK explicitly requires it.** **Current system supports it** (`direction` UP/DOWN). |
| BOOLEAN Pass/Fail (HEPA) | **LK explicitly requires it** (hanya BSC HEPA). **Current system partially supports it**: backend `measuredBool` + `isWithinTolerance = measuredBool`; Tech-PWA **tidak** menampilkan BOOLEAN. |
| TEXT tanpa evaluasi | Engine: TEXT → `isWithinTolerance` null. LK punya prosa smoke / Status tanpa enum — **Current system partially supports it** (bisa simpan teks; UI tidak). |
| Label hasil ukur **Sesuai / Tidak sesuai** | **Tidak** di LK untuk sel ukur. **Current system supports it** sebagai mapping UI dari `isWithinTolerance`. **Mismatch wording.** |
| Pemeriksaan fisik Baik / Tidak Baik | **LK explicitly requires it** (49 dokumen). **Current system does not support it** sebagai MeasurementResult/catalog item. |
| Telaah Baik/Tidak Baik + kesimpulan laik | **LK explicitly requires it.** **Current system does not support it** pada MeasurementResult. `QualityReview` = APPROVE/REJECT, bukan tabel Telaah. |
| Penilaian 5-tier Kelistrikan | **LK explicitly requires it** (1 dokumen). **Current system does not support it.** |
| Lingkungan Awal **dan** Akhir | **LK explicitly requires it.** **Current system partially supports it**: parameter lingkungan NUMBER ada, **bukan** pasangan Awal/Akhir. |
| Display UUT **dan** hasil standar pada baris yang sama | **LK explicitly requires it** (BSC, Baby Incubator, Infant Warmer, LAF). **Current system partially supports it**: `measuredValue` + `referenceValue` ada; UI entry belum mengekspresikan dua kolom LK. |
| Ref vs UUT tabel terpisah (Thermo) | **LK explicitly requires it.** **Current system partially supports it** (`referenceValue` designed for this); tidak di UI; Thermo tidak di catalog lengkap. |
| Nilai hitungan (ΔT, rasio, leak = setting − standar, average) | **LK explicitly requires it.** **Current system does not support it** sebagai rumus; teknisi harus mengetik hasil jadi sebagai NUMBER. |
| Logger 30×T1–T9 + lampiran | **LK explicitly requires it.** **Current system partially supports it** (`LOGGER_SUMMARY`, attachment); Stage C / UI belum. |
| Analyte list dinamis + toleransi dari sertifikat | **LK explicitly requires it.** **Current system does not support it.** |
| Dual-class leakage Kelas I/II | **LK explicitly requires it** (beberapa LK). **Current system partially supports it**: satu max ter-seed; baris Kelas II di note tidak dipakai. |
| Ambang `> 2 MΩ` vs perbandingan inklusif | **LK explicitly requires** `>`. **Current system** membandingkan `≥` jika di-store sebagai min. **Mismatch kemungkinan.** |
| `± 3 % SPO2` sebagai poin vs persen | **LK wording** `± 3 % SPO2`. Parser sistem: PERCENT_DELTA. **Tidak dikunci oleh LK.** |
| Completeness wajib semua sel | **Not defined by LK.** Sistem: tidak ada gate backend. |
| Job PASS/FAIL dari satu sel OOT | **Not defined by LK.** Sistem: tidak ada. |
| Mapping isWithinTolerance → Telaah Kinerja | **Not defined by LK.** Sistem: tidak ada. |

---

## 10. Business Rules Explicitly Supported by LK

Hanya yang **tertulis** di dokumen:

1. Teknisi mengisi identitas UUT, tanggal, resolusi/kapasitas (dan Channel jika pompa).
2. Setiap pekerjaan mencatat **Daftar Alat yang Digunakan** (merk, tipe, no. seri).
3. Kondisi ruang: suhu dan RH **Awal** dan **Akhir**, dengan toleransi tercetak; tegangan jika bagian itu ada.
4. Pemeriksaan fisik: setiap item **Baik** atau **Tidak Baik**, mengikuti Batas Pemeriksaan prosa.
5. Jika ada bagian listrik: pilih tipe/kelas/hubungan; isi Terukur; bandingkan ke Ambang Batas tercetak; applied-part boleh dilewati menurut catatan baterai/pasien.
6. Kinerja: isi sel kosong sesuai tabel (ulangan, posisi, setting, arah) dengan satuan header.
7. Di mana tertulis `*isi salah satu sesuai dengan UUT` / `*isi setting sesuai UUT`, hanya slot yang relevan yang diisi.
8. Analyzer: parameter/toleransi **boleh** diganti dari sertifikat control, dengan bukti.
9. Sphyg leak: nilai yang dimasukkan adalah **setting − pembacaan standar**.
10. Cold-storage: pembacaan standar **dilampirkan**, tidak diketik di grid.
11. Mikroskop: kolom hasil memakai **stage / okuler**; rasio 4x/10x.
12. Autoclave: ΔT dihitung dari S1/S2/S3; siklus 121 dan 134 punya ambang waktu/suhu sendiri.
13. BSC HEPA: **Pass / Fail**; foto jika bocor.
14. BSC smoke: pengamatan menurut prosedur tercetak.
15. Telaah (bukan Kelistrikan): kategori dengan **Baik / Tidak Baik** dan bobot tercetak; kesimpulan **laik / tidak laik**.
16. Kelistrikan: pilih salah satu dari lima kalimat **Penilaian Secara Menyeluruh**.
17. Dua tanda tangan: **Petugas Kalibrasi** dan **Entri data oleh**.

---

## 11. Business Rules NOT Defined by LK

Jangan diisi asumsi industri:

- Apakah satu sel di luar Toleransi membuat **Kinerja Peralatan** = Tidak Baik.
- Apakah lingkungan di luar Toleransi menggagalkan kalibrasi atau hanya dicatat.
- Apakah satu item fisik Tidak Baik menggagalkan kesimpulan laik.
- Rumus poin Telaah (apakah 10+40+50 harus dijumlah, kapan Baik vs Tidak Baik).
- Equivalence **Baik** = Pass = Sesuai = laik.
- Apakah semua ulangan wajib terisi.
- Inclusive vs exclusive untuk `>` / `≥` / `≤`.
- SpO2 `%` sebagai persen reading vs percentage points.
- Baby Incubator: teknisi mengetik suhu absolut atau simpangan dari setting/mean.
- INCU dual class: nilai di sel vs rata-rata TM.
- Autoclave ΔT2 vs ΔT3 keduanya `S1 – S3`.
- Kelas I vs II mana yang berlaku untuk UUT ini.
- Isi kolom **Status** pH.
- Isi pasti smoke test (ya/tidak vs narasi).
- Otoscope intensitas dengan toleransi `-`.
- Thermo tanpa toleransi tercetak: bagaimana lulus.
- Hubungan Telaah dengan QualityReview APPROVE/REJECT.
- Ventilator (tidak ada LK di folder ini).
- Apakah Phaco/Otoscope template salah label harus diikuti apa adanya.

---

## 12. Recommended Questions to Lock Before Implementation

1. Apakah **MeasurementResult** hanya untuk **Hasil Pengukuran Kinerja + listrik + lingkungan**, atau juga **fisik Baik/Tidak Baik** dan **Telaah**?
2. Jika fisik/Telaah **bukan** MeasurementResult, model apa yang menampung **Baik / Tidak Baik** tanpa menormalkannya ke PASS/FAIL?
3. Bolehkah UI terus memakai **Sesuai / Tidak sesuai** untuk `isWithinTolerance`, padahal LK tidak memakai kata itu untuk sel ukur?
4. HEPA **Pass / Fail**: apakah `measuredBool` dengan true=Pass, dan apakah itu **boleh** ditampilkan sebagai Sesuai?
5. Smoke BSC: BOOLEAN, TEXT, atau ENUM dengan wording LK (`turbelensi atau tidak`, dll.)?
6. Satu baris LK dengan **Display UUT** + **Hasil Standar**: dua MeasurementResult, atau `measuredValue`+`referenceValue`?
7. Awal/Akhir lingkungan: dua replicate, dua parameter, atau `direction`/slot khusus?
8. Nilai **calculated**: teknisi mengetik hasil jadi, atau sistem menghitung (di luar scope happy path saat ini)?
9. Telaah vs `isWithinTolerance`: independen, atau ada aturan agregasi yang **belum ada di LK** dan harus diputus produk?
10. pH **Status** dan Otoscope `-`: tetap null / Perlu telaah, atau dikunci bisnis di luar LK?
11. Dual-class leakage dan analyzer dinamis: apakah masuk gelombang MeasurementResult kualitatif, atau ditunda?

---

## 13. Implementation Impact

**Jangan diimplementasikan sekarang.** Hanya dampak konsep:

- **`isWithinTolerance` + chip Sesuai/Tidak sesuai** menutupi **satu** kelas LK (angka vs toleransi) dengan **label yang bukan milik LK**. Memperluas itu ke Baik/Tidak Baik atau Pass/Fail akan mencampur semantik.
- **`CalibrationValueType.BOOLEAN`** cocok ke **HEPA Pass/Fail**, **bukan** otomatis ke fisik Baik/Tidak Baik (wording berbeda) dan **bukan** ke Telaah.
- **`measuredText`** (compliance null) lebih dekat ke Status/smoke/narasi daripada memaksa boolean.
- **`referenceValue` / `appliedNominalValue`** sudah mengarah ke pasangan standar/setting; LK sering butuh **display + standar + setting** sekaligus.
- **Telaah / kesimpulan laik / 5-tier Kelistrikan** adalah **lapisan keputusan**, bukan sel MeasurementResult. Mencampurkannya ke `isWithinTolerance` akan menyimpang dari LK.
- **Pemeriksaan fisik** adalah katalog item per jenis alat + ENUM Baik/Tidak Baik; itu **bukan** DeviceCalibrationParameter kinerja yang ada sekarang.
- Jangan sentuh Identity Correction, REWORK, JobHandOff, Post-Approval Correction, atau happy path angka yang sudah jalan, sampai pertanyaan §12 dikunci.

**NO CODE WAS MODIFIED.** File ini satu-satunya artefak. Schema, enum, API, UI, tes, seed, dan lifecycle tidak diubah.
