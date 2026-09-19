# FORENSIC AUDIT — SELURUH LK vs MEDCAL CALIBRATION MEASUREMENT MODEL

**Tanggal:** 2026-09-18
**Lingkup:** READ-ONLY forensic audit atas seluruh dokumen Lembar Kerja di `docs/technician-docs/Lembar-Kerja`, dibandingkan dengan model pengukuran Medcal.
**Status:** AUDIT ONLY — tidak ada source, schema, migrasi, seed, API, Portal, Tech-PWA, PDF generator, tes, atau database yang diubah.
**Pemicu:** persiapan Portal CRUD untuk `CalibrationTestPoint`.

Dokumen ini adalah kelanjutan dari:

- `01 phase-1-named-measurement-points-dynamic-replication-20260918.md`
- `02 phase-1.5-test-point-snapshot-design-20260918.md`
- `03 phase-1.5-data-impact-audit-20260918.md`
- `04 phase-1.5-option2-architecture-plan-20260918.md`
- `05 mom-9-pdf-document-codes-20260918.md`

---

## Metodologi

Ekstraksi programatik read-only: `zipfile` membuka `.docx`, `word/document.xml` di-parse dengan `xml.etree`, mempertahankan **struktur tabel** termasuk `w:gridSpan` (merge horizontal) dan `w:vMerge` (merge vertikal), plus paragraf di luar tabel. Tidak mengandalkan plain-text extraction.

Konfirmasi ambiguitas memakai workbook hasil pengukuran terisi di `docs/technician-docs/measurement-results` (file terenkripsi OLE, dibuka read-only via `msoffcrypto` + `openpyxl`, sheet `Input Data`).

Artefak ekstraksi hanya ditulis ke scratchpad sesi di luar repo. Tidak ada file dibuat di dalam repository selain laporan ini.

---

## 1. Executive Summary

- **50 LK diperiksa** — seluruhnya `.docx`, tidak ada subfolder, tidak ada PDF/XLSX di direktori LK.
- **11 struktur pengukuran berbeda** ditemukan (§3).
- **Ya — ada struktur multi-point di luar `Awal`/`Akhir` dan `L-N`/`L-G`/`N-G`.** Yang signifikan: posisi spasial (`Posisi A/B/C`, `Titik ukur 1–4/M`, `T1–T5`), kanal/sisi (`Earphone Kanan`/`Kiri`), state kondisi (`Lampu ON/OFF`, `Noise ON/OFF`, `Background`/`Didalam kompartemen`), setpoint komposit multi-kolom (Dental X-Ray `kV`+`mA`+`s`; Thermohygrometer suhu+RH), pasangan Reference-vs-UUT, dan arah naik/turun di luar Sphygmomanometer.
- **Ada struktur yang belum tertangani** — tetapi mayoritas adalah **gap katalog dan gap UI entry, bukan gap model**. Hanya **dua** yang benar-benar tidak terwakili oleh `CalibrationTestPoint` (§6): satu baris LK dengan **beberapa besaran terukur berbeda**, dan **nilai turunan/agregat** bertoleransi sendiri yang diketik teknisi.
- **`CalibrationTestPoint` cukup sebagai model generik untuk titik ukur bernama.** Jawaban Part 11 = **B**.

---

## 2. LK Inventory

50 file `.docx`, seluruhnya berbagi kerangka identik: identitas alat → daftar alat standar → **Pengukuran Kondisi Lingkungan** → pemeriksaan fisik → **Pengukuran Keselamatan Listrik** → **Hasil Pengukuran Kinerja Alat** → Telaah Teknis.

Tidak ada penanda versi/revisi di dalam dokumen mana pun, sehingga status "official vs older/reference" **tidak dapat ditentukan** untuk seluruh korpus — tidak ada bukti internal yang membedakannya. Ini dicatat sebagai keterbatasan audit, bukan temuan.

| File | Device/Instrument | Measurement Sections (kinerja) | Notes |
|---|---|---|---|
| LK Audiometer.docx | Audiometer | Linieritas dB Pure Tone; Frekuensi Respon | 3 level: Earphone Kanan/Kiri × Hz × dB; I–III |
| LK Auto Chemistry Analyzer.docx | Auto Chemistry Analyzer | 27 analyte rows | Parameter open-ended; I–V |
| LK Autoclave.docx | Autoclave | Suhu Chamber (S1/S2/S3 + ΔT1–ΔT3); Suhu Sterilisasi; Waktu Sterilisasi | ΔT = kolom turunan dengan toleransi sendiri |
| LK Baby Incubator.docx | Baby Incubator | Suhu TM/T5 + T1–T4 × 32/36 °C; Overshoot/Matras/Air velocity/Noise/RH; Suhu kulit; Sensor suhu kulit | Ada kolom "Selisih Standar dengan UUT" (turunan) |
| LK Bed Side Monitor.docx | Bed Side Monitor | HR; Respirasi; SpO2; NIBP (Systole/Mean/Diastole × 7 tekanan) | I–V |
| LK Bio Safety Cabinet.docx | Bio Safety Cabinet | Particle (Posisi 1–4); Downflow (A/B/C, I–IX); Inflow (A/B); Lighting ON/OFF; Sound ON/OFF; UV; Smoke pattern; HEPA Pass/Fail | Baris agregat Acceptance/Average/Min/Max/K-factor |
| LK Blanket Warmer.docx | Blanket Warmer | Proteksi suhu tinggi (I–III); Kalibrasi suhu 33/35/40 °C | Setting suhu tertinggi dikosongkan |
| LK Blood Bank Refrigerator.docx | Blood Bank Refrigerator | Data ke-1..30 × T1–T9 | Logger 12-channel, dilampirkan |
| LK Blood Pressure Monitor.docx | Blood Pressure Monitor | NIBP × 6 tekanan + kolom `Setting standar (bpm)` | Setting sekunder |
| LK CPAP.docx | CPAP | Konsentrasi O2; Laju aliran | Kondisi flowmeter 5 L/min sebagai catatan |
| LK Centrifuge Refrigerator.docx | Centrifuge Refrigerator | Kecepatan Min/Med/Max; Waktu; Suhu 30 × T1–T9 | |
| LK Centrifuge.docx | Centrifuge | Kecepatan Min/Med/Max; Waktu putar | |
| LK Cold Chain, Vaccine Refrigerator.docx | Vaccine Refrigerator | Data ke-1..30 × T1–T9 | |
| LK Dental Unit.docx | Dental Unit | Handpiece Low/High Speed; Tekanan; Illuminance @70 cm; Semprot udara; Daya hisap | Low/High = named points |
| LK Dental X-Ray.docx | Dental X-Ray | Kolimasi; kV; Waktu penyinaran Rendah/Sedang/Tinggi; Linearitas; Reproduksibilitas; HVL | Setting komposit kV+mA+s; reproduksibilitas = 3 besaran/baris |
| LK Electro Accupunture (EST).docx | Electro Stimulator | Frekuensi; Intensitas; Pulse duration; Waktu | Kondisi tetap ditulis sebagai prosa di atas tabel |
| LK Electrocardiograph.docx | ECG | Amplitudo; Laju rekaman; Detak jantung; Sinusoida; EKG normal | Kolom "hasil yang didapat" = nilai antara |
| LK Examination Lamp.docx | Examination Lamp | Intensitas/CCT/CRI | I–V |
| LK Fetal Doppler.docx | Fetal Doppler | Detak jantung 30–210 bpm | |
| LK Flow Meter.docx | Flow Meter | Laju aliran 3–15 L/min | Tanpa bagian keselamatan listrik |
| LK Head Lamp Medik.docx | Head Lamp | Intensitas/CCT/CRI | |
| LK Hematologi Analyzer.docx | Hematology Analyzer | 9 analyte rows | Parameter open-ended |
| LK Humidifier.docx | Humidifier | Akurasi suhu 35/37; Suhu maksimum 40 | |
| LK Infant Warmer.docx | Infant Warmer | Suhu matras; Suhu (pengukuran ke-1..5 @36 °C); Akurasi suhu kulit | "Pengukuran ke-" = ulangan sebagai baris |
| LK Infusion Pump.docx | Infusion Pump | Occlusion; Laju aliran | |
| LK Kelistrikan.docx | (lintas-alat) | Hanya Pengujian Kinerja = 4 parameter listrik | Bukan tipe alat — lihat §6.4 |
| LK Laminar Air Flow.docx | Laminar Air Flow | Particle (Posisi 1–4); Airflow (A/B); Lighting; Sound Background/Compartment; UV | |
| LK Lampu Operasi.docx | Operating Lamp | Intensitas/CCT/CRI | I–III |
| LK Laryngoskop.docx | Laryngoscope | Intensitas/CCT/CRI | |
| LK Medical Freezer.docx | Medical Freezer | Data ke-1..8 × T1–T9 | |
| LK Medical Refrigerator.docx | Medical Refrigerator | Data ke-1..8 × T1–T9 | |
| LK Mikroskop Laboratorium.docx | Laboratory Microscope | Pembesaran 4x; 10x; Nilai Ratio | Stage + Okuler + Hasil (turunan) dalam satu baris |
| LK Nebulizer Compressor.docx | Nebulizer Compressor | Laju aliran gas @Max | |
| LK Nebulizer Ultrasonic.docx | Nebulizer Ultrasonic | Laju aliran gas @Max | |
| LK Oksigen Concentrator.docx | Oxygen Concentrator | Laju aliran; Konsentrasi O2 @4 lpm | |
| LK Otoscope.docx | Otoscope | Intensitas/CCT/CRI | |
| LK Oven.docx | Oven | Data ke-1..8 × T1–T9 | |
| LK Phaco Emulsifikasi.docx | Phaco Emulsification | Daya hisap: 6 slot × (Pengukuran 1/2/3 × Naik/Turun) | Struktur identik Suction Pump |
| LK Phototherapy.docx | Phototherapy | Spectral irradiance × Titik Ukur 1,2,3,4,M | "M" = titik kelima — lihat §6.4 |
| LK Platelet Agitator Incubator.docx | Platelet Agitator | Data ke-1..8 × T1–T9 | |
| LK Pulse Oxymeter.docx | Pulse Oximeter | HR; SpO2 | I–VI (bukan I–V) |
| LK Resusitator Paru dan Neopuff.docx | Resuscitator | Tekanan maksimum; Akurasi tekanan 10–65 | |
| LK Rotator.docx | Rotator | Kecepatan Min/Med/Max; Waktu putar | |
| LK Sphygmomanometer.docx | Sphygmomanometer | Uji kebocoran; Laju buang cepat; Akurasi tekanan naik/turun ×3 | Uji kebocoran = nilai turunan (setting − standar) |
| LK Spirometer.docx | Spirometer | FVC 0,5 / 3 liter | |
| LK Sterilisator.docx | Sterilisator kering | Data ke-1..8 × T1–T9 | |
| LK Suction Pump.docx | Suction Pump | Akurasi vacuum 6 slot × (Pengukuran 1/2/3 × Naik/Turun); Max Vacuum Low/Med/High; Waktu | Tabel konversi satuan = referensi, bukan input |
| LK Syringe Pump.docx | Syringe Pump | Occlusion; Laju aliran | |
| LK Thermohygrometer.docx | Thermohygrometer | Suhu: 4 setpoint × (tabel Reference dan tabel UUT); RH: Naik/Turun × 4 setpoint × (Reference dan UUT) | Setting chamber 2-dimensi |
| LK pH Meter.docx | pH Meter | Assay pH × Result 1–3 + Range + Status | Lot code buffer = metadata |

---

## 3. Measurement Structure Catalog

### A. Pattern A — Single Measurement + Repetition

Satu parameter, satu identitas, kolom I…N sebagai ulangan.

- **LK Examination Lamp / Head Lamp / Lampu Operasi / Laryngoskop / Otoscope, Tabel 7** — `Intensitas Cahaya`, `Color Temperature`, `Color Rendering Index` × I–V (atau I–III). Tiga parameter independen, bukan titik ukur.
- **LK Flow Meter Tabel 5, LK Spirometer Tabel 7** — sweep setpoint tanpa dimensi lain.
- **LK Infant Warmer Tabel 8** — kolom `Pengukuran ke- 1..5` pada setting tunggal 36 °C: ulangan yang digambar sebagai **baris**, bukan kolom. Tetap Pattern A + replicate.

### B. Named Measurement Points

- **Lingkungan — seluruh 50 LK, Tabel 3** — `Suhu`: `Awal`/`Akhir`; `Kelembaban/RH`: `Awal`/`Akhir`; `Tegangan Input`: `L-N`/`L-G`/`N-G`. Seragam di semua LK; hanya angka toleransi yang berbeda (BPM 25 ± 6 °C; Kelistrikan 10–40 °C; ACA/CPAP 21 ± 5 °C).
- **LK Centrifuge / Centrifuge Refrigerator / Rotator, Tabel 7** — `Kecepatan Putar`: `Min`/`Med`/`Max` (settingValue dipilih per unit).
- **LK Suction Pump Tabel 8** — `Maximum Vacuum`: `Low`/`Medium`/`High Vacuum`, ambang berbeda.
- **LK Dental Unit Tabel 7** — `Kecepatan Putar Handpiece`: `Low Speed`/`High Speed`, toleransi berbeda.
- **LK Bio Safety Cabinet Tabel 8/10, LK Laminar Air Flow Tabel 8** — `Downflow`/`Inflow`/`Airflow Velocity`: `Posisi A`/`B`/`C`.
- **LK Bio Safety Cabinet Tabel 7, LK Laminar Air Flow Tabel 7** — `Particle Counter`: `Posisi 1`–`4`.
- **LK Phototherapy Tabel 7** — `Spectral Irradiance`: `Titik Ukur 1`,`2`,`3`,`4`,`M` — lima titik (konfirmasi §6.4).
- **LK Baby Incubator Tabel 7** — `Temperatur udara`: `TM/T5`,`T1`–`T4` × setting `32`/`36` °C, dengan **dua kelas toleransi** (± 1,5 °C untuk TM/T5 terhadap setting; ± 0,8 °C untuk T1–T4 terhadap rata-rata TM).
- **LK Audiometer Tabel 7/8** — hierarki **tiga** level: `Earphone Kanan`/`Kiri` → frekuensi (`1000 Hz` / `80–90 dB`) → setpoint dB atau Hz.
- **LK Bed Side Monitor Tabel 10, LK Blood Pressure Monitor Tabel 7** — NIBP: `Systole`/`Mean`/`Diastole` × 7 (BSM) atau 6 (BPM) kelompok tekanan.

### C. Direction-Based Measurements

- **LK Sphygmomanometer Tabel 7** — setpoint 0–250 mmHg × (`naik`/`turun`) × 3 pasang.
- **LK Suction Pump Tabel 7** — 6 slot × `Pengukuran 1/2/3` × `Naik`/`Turun`; header dua tingkat.
- **LK Phaco Emulsifikasi Tabel 7** — struktur **identik** dengan Suction Pump.
- **LK Thermohygrometer Tabel 7/8** — RH: `Naik` (40→70 %RH) lalu `Turun` (70→40 %RH), masing-masing 4 setpoint.

Klasifikasi Part 7: keempatnya adalah **arah pada titik yang sama** (kategori 2), bukan titik terpisah — setpoint identik, hanya jalur pendekatan berbeda. Model yang benar tetap `MeasurementResult.direction`, **bukan** `CalibrationTestPoint`.

### D. Condition-Based Measurements

- **LK Bio Safety Cabinet Tabel 12/13** — `Lampu ON`/`OFF` (≥450 / ≤160 lux); `Noise ON`/`OFF` (≤70 / ≤60 dBA).
- **LK Laminar Air Flow Tabel 10** — `Sound Level`: `Background` / `Didalam kompartemen`.
- **LK Autoclave Tabel 8/9** — `Suhu Sterilisasi` dan `Waktu Sterilisasi` per siklus `121 °C` / `134 °C`.
- **LK Dental X-Ray Tabel 10** — `Waktu Penyinaran`: `Rendah`/`Sedang`/`Tinggi` pada kV/mA tetap.
- **LK Dental X-Ray Tabel 13** — HVL pada `70 kV` / `80 kV`.
- **LK EST Tabel 7/8/9** — kondisi tetap (`Intensitas: 20 mA`, `Pulse Duration: 0,2 ms`) sebagai **prosa di atas tabel**. Metode, bukan titik ukur.

Ambang berbeda per state → klasifikasi **A (parameter independen)**, bukan B.

### E. Setpoint-Based Measurements

- Mayoritas tabel kinerja: satu kolom `Setting UUT`/`Setting Simulator`/`Setting Standar` + sweep nilai + I…N ulangan.
- **Setpoint komposit (multi-kolom)** — Dental X-Ray Tabel 8/11/12/13: `kV` + `mA` + `s`. Thermohygrometer Tabel 7/8: `Suhu` + `Kelembaban`. ECG Tabel 8–11: `Setting Simulator` + `Setting UUT`. BPM Tabel 7: `Setting Simulator (mmHg)` + `Setting standar (bpm)`.
- **Setpoint kosong (dipilih teknisi)** — Suction Pump Tabel 7 dan Phaco Tabel 7 (`*isi setting sesuai UUT`, satuan juga dipilih); Blanket Warmer Tabel 7.

### F. Other / Ambiguous

- **Nilai turunan yang diisi teknisi** — Autoclave Tabel 7 (`ΔT1`/`ΔT2`/`ΔT3`, toleransi ±2/±5/±2 °C); Mikroskop Tabel 9 (rasio 4x/10x ± 5%); Baby Incubator Tabel 10 (`Selisih Standar dengan UUT`); Sphygmomanometer Tabel 5 (catatan eksplisit: "nilai yang dimasukan di hasil ukur adalah setting – pembacaan standar"); BSC Tabel 9/11 (`Acceptance`, `Average`, `Min`, `Max`, `K factor`).
- **Dua besaran berbeda dalam satu baris** — Dental X-Ray Tabel 12: satu baris berisi `kV`, `s`, **dan** `mGy`. Mikroskop Tabel 7/8: `Stage mikrometer` dan `Okuler mikrometer` + kolom `Hasil` turunan.
- **Pasangan Reference vs UUT** — Thermohygrometer Tabel 5 vs 6 dan Tabel 7 vs 8; BSC/LAF kolom `Display UUT` berdampingan `Hasil Pengukuran Standar`; 9 LK penyimpanan suhu: `Pembacaan indikator UUT` + `T1–T9`.
- **Grid logger** — 9 LK penyimpanan suhu: `Data ke 1..30` (atau 1..8) × `T1`–`T9`. Catatan LK: pembacaan standar terekam pada thermometer 12 channel dan dilampirkan; yang diisi manual hanya `Pembacaan indikator UUT`.
- **Parameter open-ended** — Auto Chemistry Analyzer Tabel 7 dan Hematologi Analyzer Tabel 7: daftar analyte hanya saran; teknisi menulis nama parameter UUT sendiri dan boleh memakai toleransi dari sertifikat kontrol.
- **Non-numerik** — BSC Tabel 15 (HEPA/ULPA `Pass / Fail`); BSC smoke pattern test (5 pengamatan naratif); pH Meter kolom `Status`; Kelistrikan 5 kategori penilaian menyeluruh.
- **Bukan input** — Suction Pump Tabel 9 (tabel konversi satuan), Baby Incubator gambar posisi titik ukur, seluruh tabel `Telaah Teknis` dan `Daftar Alat yang Digunakan`.

---

## 4. Complete Gap Matrix

"Current System" = `DeviceCalibrationParameter` + `CalibrationTestPoint` + `JobCalibrationTestPoint` + `MeasurementResult` + `replicateIndex`, sebagaimana ada di `packages/db/prisma/schema.prisma` dan disaring `listMeasurementParameters`.

| Device | Parameter | LK Structure | Classification | Current System | Gap |
|---|---|---|---|---|---|
| Semua 50 LK | Suhu ruangan | Awal / Akhir | B — named TP | Model YA; katalog hanya `BSM_*` | **Katalog** — 49 tipe lain masih Pattern A |
| Semua 50 LK | Kelembaban / RH | Awal / Akhir | B — named TP | Sama | **Katalog** |
| Semua 50 LK | Tegangan Input | L-N / L-G / N-G | B — named TP | Sama | **Katalog** |
| Semua 50 LK | 4 parameter keselamatan listrik | nilai tunggal | A | YA | Tidak ada |
| BSM / BPM | NIBP | Systole/Mean/Diastole × 6–7 tekanan | B — 2 dimensi | YA — 3 parameter × 7 TP | Tidak ada |
| BSM, Pulse Ox | HR, SpO2, Resp | setpoint sweep | B | YA | Tidak ada |
| Audiometer | Pure tone, Freq response | Kanan/Kiri × Hz × dB | B — 3 dimensi | YA — sisi difold ke kode `_KANAN`/`_KIRI` | Tidak ada (workaround terdokumentasi) |
| Baby Incubator | Temperatur udara | TM/T5,T1–T4 × 32/36 °C, 2 kelas toleransi | B — 2 dimensi | YA — 10 TP dengan override | Tidak ada; seed sendiri menandainya FLAGGED |
| Baby Incubator | Akurasi sensor kulit | Selisih Standar − UUT | D — turunan | Tidak ada | **Model** (§6.2) |
| BSC, LAF | Downflow / Inflow / Airflow | Posisi A/B/C | B — named TP | Model YA; **katalog 0 TP** | **Katalog** |
| BSC, LAF | Particle Counter | Posisi 1–4 | B — named TP | Model YA; katalog 0 TP | **Katalog** |
| BSC | Lighting, Sound | ON / OFF | A — parameter terpisah | YA — `_ON`/`_OFF` | Tidak ada |
| BSC | HEPA/ULPA leak | Pass / Fail | A, BOOLEAN | Schema YA (`measuredBool`); entry UI tidak | **UI** — filter `valueType: "NUMBER"` |
| BSC | Smoke pattern test | 5 pengamatan naratif | dokumen/telaah | TEXT ada; tidak di-entry | **UI** |
| BSC | Acceptance/Average/Min/Max/K factor | agregat | D — turunan | Tidak ada | **Model** (§6.2) |
| LAF | Sound level | Background / Compartment | A — parameter terpisah | YA — `_BACKGROUND`/`_COMPARTMENT` | Tidak ada |
| Phototherapy | Spectral irradiance | Titik Ukur 1–4, M | **B — 5 named TP** (§6.4) | 0 TP; seed menyebutnya replicate | **Katalog + klasifikasi seed salah** |
| Autoclave | Suhu chamber | S1,S2,S3 + ΔT1–ΔT3 | B (S) + D (ΔT) | S dipecah `_DT1/2/3`; ΔT tidak dihitung | **Model** (turunan) |
| Autoclave | Suhu / Waktu Sterilisasi | siklus 121 / 134 | A — parameter terpisah | YA — `_121`/`_134` | Tidak ada |
| Dental Unit | Kecepatan handpiece | Low / High Speed | A — toleransi beda | YA — `_LOW`/`_HIGH` | Tidak ada |
| Dental Unit | Illuminance | kondisi "Jarak 70 cm" | E — metode | YA (prosa toleransi) | Tidak ada |
| Dental X-Ray | kV, HVL, linearitas | setting komposit kV+mA+s | E — setpoint multi-komponen | `settingValue` = satu Decimal | **Model, terbatas** (§6.1) |
| Dental X-Ray | Reproduksibilitas | 1 baris → kV + s + mGy | multi-kuantitas | 1 result = 1 nilai | **Model** (§6.1) |
| Dental X-Ray | Waktu penyinaran | Rendah/Sedang/Tinggi | B — named TP | 0 TP (Pattern A) | **Katalog** |
| Sphygmomanometer | Akurasi tekanan | 6 setpoint × naik/turun ×3 | C — direction | YA penuh: TP + `direction` + replicate | Tidak ada |
| Sphygmomanometer | Uji kebocoran | setting − standar | D — turunan | Tidak ada | **Model** |
| Sphygmomanometer | Laju buang cepat | Tekanan Awal→Akhir, waktu terukur | E + A | Hanya waktu yang diukur | Tidak ada |
| Suction Pump | Akurasi vacuum gauge | 6 slot kosong × 3 ulangan × naik/turun | C + Pattern D | TP ada; kode **di-exclude dari grid**, `usesDirection` hanya SPHYG | **UI** (§5) |
| Suction Pump | Max vacuum | Low/Medium/High | B — named TP | YA — 3 TP dengan override | Tidak ada |
| Phaco | Daya hisap | identik Suction Pump | C + Pattern D | **Tidak ada parameter sama sekali** | **Katalog** |
| Thermohygrometer | Suhu, RH | setpoint × (Reference \|\| UUT); RH juga naik/turun | C + pasangan ref/UUT | `referenceValue` **ada di schema**; tipe alat excluded; UI tanpa field | **Katalog + UI** |
| Mikroskop | Pembesaran 4x / 10x | stage + okuler + hasil | multi-kuantitas + turunan | `MICRO_MAG_4X/10X` Pattern A tunggal | **Model** (§6.1/§6.2) |
| Mikroskop | Nilai Ratio | 4x / 10x | D — turunan lintas parameter | `valueType: RATIO` ada; tidak di-entry | **Model + UI** |
| 9 tipe penyimpanan suhu | Storage temp | 30 × T1–T9 + indikator UUT | Pattern D logger | YA — `LOGGER_SUMMARY` + attachment | Tidak ada |
| ACA, Hematologi | analyte list | daftar terbuka | A, katalog dinamis | Katalog statis; tipe alat excluded | **Katalog/produk** (§6.3) |
| pH Meter | Assay pH | Result 1–3 + Range + Status | A + replicate | Tipe alat excluded | **Katalog** |
| Infant Warmer | Suhu | "Pengukuran ke-" sebagai baris | C — repetisi | YA — `replicateIndex` | Tidak ada |
| ECG | Amplitudo, laju rekaman | "hasil yang didapat" = nilai antara | D/E | Tidak dimodelkan | Rendah — nilai tercetak |

---

## 5. Existing Code Special Cases

| # | Lokasi | Isi | Kenapa ada | Sesuai LK? | Bisa generik lewat TP? | Enterable di Tech-PWA? |
|---|---|---|---|---|---|---|
| 1 | `apps/tech-pwa/src/lib/calibration/measurement.ts:447` `DIRECTION_PARAMETER_CODES = new Set(["SPHYG_PRESSURE_ACC"])` | allowlist kode yang merender baris Naik/Turun | Sphygmomanometer satu-satunya yang disadari punya naik/turun | **Sebagian** — Suction Pump, Phaco, Thermohygrometer RH juga | Tidak — arah adalah facet `MeasurementResult.direction`, dan itu benar | **Tidak** untuk Suction/Phaco/Thermohygro |
| 2 | `apps/api/src/modules/calibration-jobs/measurement-completeness.ts:10` + filter sama di `listMeasurementParameters` | `SUCT_VACUUM_GAUGE` dikeluarkan dari grid | setpoint dipilih per unit + butuh naik/turun; grid tidak mendukung | Ya | TP sudah ada (6 slot, `settingValue` NULL); yang kurang UI | **Tidak** |
| 3 | `calibration-jobs.service.ts` filter `valueType: "NUMBER"` | BOOLEAN/RATIO/TEXT tidak pernah masuk `parameters`/`gridParameters` | entry UI hanya menangani angka | Bertentangan dengan BSC (Pass/Fail) dan Mikroskop (ratio) | Tidak relevan — ini soal valueType | **Tidak** |
| 4 | filter `entryStyle: "DIRECT_REPLICATES"` | 9 parameter `LOGGER_SUMMARY` dikeluarkan | grid 30×9 tidak diisi manual; lampiran logger | Ya — catatan LK eksplisit | Tidak perlu | **Tidak** (by design, Stage C) |
| 5 | `packages/db/prisma/fix-collapsed-audiometer-parameters.ts` | sisi earphone difold ke **kode parameter** | komentar skrip: "MeasurementResult has no 'ear' facet" | Ya | Tidak tanpa menggandakan TP dan kehilangan pemisahan seri | Ya, setelah split |
| 6 | `fix-collapsed-pattern-c-parameters.ts` + seed: `ACLV_STER_TIME_121/134`, `BSC_LIGHT_INTENSITY_ON/OFF`, `BSC_SOUND_LEVEL_ON/OFF`, `LAF_SOUND_LEVEL_BACKGROUND/COMPARTMENT`, `DXRAY_HVL_70KV/80KV`, `DXRAY_COLLIMATION_LENGTH/DIAMETER`, `DUNIT_HP_SPEED_LOW/HIGH` | kondisi/state difold ke kode parameter | ambang batas berbeda per state | Ya | Bisa — tapi split lebih tepat | Ya |
| 7 | `seed-device-taxonomy-extension-parameters.ts:1300` `EXCLUDED_TYPE_CODES` = ACA, Hematologi, pH Meter, **Thermohygrometer**, Otoscope, **Phaco** | 6 tipe alat tanpa parameter sama sekali | tidak dijelaskan di skrip | LK-nya ada dan berisi tabel pengukuran nyata; workbook terisi membuktikan kalibrasi benar dilakukan | — | **Tidak** |
| 8 | `seed-calibration-test-points.ts:421` `INCU_AIR_TEMP` — 10 TP (5 sensor × 2 setting), ditandai `FLAGGED` | dua dimensi difold jadi satu daftar TP | Ya | Ya, dengan perkalian dimensi | Ya |
| 9 | `CalibrationTestPoint_Seed_Extraction.md:228` — `PHOTO_IRRADIANCE` diklasifikasikan "replicates, not test points" | Titik ukur 1–4/M dianggap ulangan spasial | **SALAH** — dibantah data terisi (§6.4) | Ya — seharusnya 5 TP | Saat ini ulangan anonim |
| 10 | `MeasurementResult.referenceValue` ada di schema dan ditulis API (`measurement-results.service.ts:184`) | untuk tabel ref-vs-UUT Thermohygrometer | Ya | — | **Tidak ada input di Tech-PWA** — nol penggunaan di `apps/tech-pwa/src/app` |
| 11 | `lk-templates/bed-side-monitor.ts` `drawEnvironment` mencetak sel Awal/Akhir/L-N kosong; `replicatesFor(..., 5)` | LK BSM punya layout tetap I–V | Ya | — | Mapping `settingLabel` → sel belum ada (out of scope L11) |

---

## 6. Unsupported Structures

### 6.1 Satu baris LK → beberapa besaran terukur berbeda

- **LK**: Dental X-Ray (Tabel 12 "Reproduksibilitas Keluaran Sinar-X"); Mikroskop Laboratorium (Tabel 7/8).
- **Parameter**: `DXRAY_REPRODUCIBILITY`; `MICRO_MAG_4X` / `MICRO_MAG_10X`.
- **Struktur**: satu baris pengujian menghasilkan pembacaan `kV`, `s`, dan `mGy` sekaligus — satuan berbeda, tidak saling menggantikan. Mikroskop: `Stage mikrometer` dan `Okuler mikrometer` dua kolom terukur berdampingan.
- **Kenapa model sekarang tidak cukup**: `MeasurementResult` menyimpan **satu** `measuredValue` + satu `uomId`. `referenceValue` adalah pasangan referensi/UUT, bukan besaran kedua. `CalibrationTestPoint` memisahkan **titik**, bukan **besaran** — memakainya akan menamai "kV/s/mGy" sebagai titik ukur padahal ketiganya kuantitas berbeda dari satu eksposur. Mekanisme yang benar-benar dipakai sistem untuk kasus seperti ini adalah **pemecahan parameter** (§5 #5/#6).
- **Input nyata atau formatting?** **Input nyata** — sel kosong dan diisi teknisi.

Terkait: **setpoint komposit**. `CalibrationTestPoint.settingValue` adalah `Decimal?` tunggal. Dental X-Ray `70 kV / 10 mA / 0,x s` dan Thermohygrometer `25 °C + 50 %RH` adalah setpoint multi-komponen. Ini **bisa** dimuat sebagai teks di `settingLabel`, jadi bukan blocker — tapi komponennya lalu tidak dapat di-query atau dievaluasi numerik.

### 6.2 Nilai turunan / agregat yang ditulis teknisi

- **LK**: Autoclave (Tabel 7 — ΔT1/ΔT2/ΔT3); Mikroskop (Tabel 9 — rasio 4x/10x); Baby Incubator (Tabel 10 — Selisih Standar dengan UUT); Sphygmomanometer (Tabel 5 — hasil = setting − standar); Bio Safety Cabinet (Tabel 9/11 — Acceptance/Average/Min/Max/K factor).
- **Struktur**: sel dengan **toleransi sendiri**, nilainya berasal dari sel lain, bukan langsung dari alat standar.
- **Kenapa model sekarang tidak cukup**: tidak ada konsep parameter turunan maupun ekspresi. `MeasurementResult` tidak punya rujukan ke result lain. `CalibrationTestPoint` menamai titik, tidak menghitung apa pun.
- **Input nyata atau formatting?** **Input nyata.** Dikonfirmasi lapangan: di `Autoclave.xlsx` sel ΔT (G60–G62) bertipe numerik literal, **bukan formula** — teknisi mengetik hasil hitungannya sendiri.

### 6.3 Daftar parameter yang ditentukan teknisi saat pengukuran

- **LK**: Auto Chemistry Analyzer (Tabel 7), Hematologi Analyzer (Tabel 7).
- **Struktur**: daftar analyte hanya contoh. Catatan LK: ambil parameter sesuai yang ada pada UUT, tulis namanya sendiri, toleransi boleh dari sertifikat kontrol.
- **Kenapa model sekarang tidak cukup**: `DeviceCalibrationParameter` adalah katalog statis per `DeviceType`; `MeasurementResult.deviceCalibrationParameterId` **wajib**. Tidak ada jalur untuk parameter ad-hoc per job, dan tidak ada tempat menyimpan toleransi yang berasal dari sertifikat standar unit itu.
- **Input nyata atau formatting?** **Input nyata**, dan ini keputusan produk, bukan sekadar teknis.

### 6.4 Tiga ambiguitas — dikonfirmasi terhadap data lapangan terisi

Sumber: `docs/technician-docs/measurement-results`, sheet `Input Data`, dibuka read-only.

**(a) Phototherapy `Titik Ukur M` — TERJAWAB: titik ukur kelima, bukan mean.**
`Phototherapy Unit.xlsx` baris 66–70: titik 1–4 dan `M` masing-masing punya tiga pembacaan sendiri (I/II/III). Baris `M` = 13.12 / 13.55 / 13.45, seluruhnya angka literal (`data_type='n'`), **bukan formula**. Rata-rata titik 1–4 pada kolom I adalah 13.175 — tidak sama dengan 13.12. Kesimpulan: `M` adalah posisi fisik kelima. **Konsekuensi:** `PHOTO_IRRADIANCE` seharusnya Pattern B dengan 5 test point (`1`,`2`,`3`,`4`,`M`), dan klasifikasi "spatial replicate positions — replicates, not test points" di `CalibrationTestPoint_Seed_Extraction.md:228` **tidak didukung bukti**.

**(b) Autoclave ΔT2 vs ΔT3 — TETAP AMBIGUOUS, tetapi statusnya naik menjadi cacat template yang terkonfirmasi.**
`Autoclave.xlsx` F61/F62 mereproduksi verbatim `ΔT2 = S1 – S3` dan `ΔT3 = S1 – S3` — identik dengan LK kosong. Jadi ini **cacat template yang persisten**, bukan salah cetak satu kali. Data terisi tidak dapat membantah: S1=S2=S3=121,67 sehingga ketiga delta bernilai 0 (kasus degenerate). Dua formula identik dengan toleransi berbeda (±5 °C vs ±2 °C) secara logis mustahil; kandidat koreksi yang masuk akal adalah `ΔT3 = S2 – S3`, tetapi **tidak ada bukti dokumen maupun data** untuk itu. **Harus dikonfirmasi ke pemilik LK sebelum diseed — jangan ditebak.**
Dua temuan sampingan yang terkonfirmasi kuat di file yang sama: (i) sel ΔT adalah angka literal, bukan formula → nilai turunan memang diketik manual (§6.2); (ii) S1/S2/S3 ditulis sebagai **teks bebas dalam satu sel** (`'S1 = 121,67'`) → bahkan workbook resmi tidak memodelkan ketiganya sebagai nilai numerik terpisah.

**(c) LK Kelistrikan — TERJAWAB: bukan tipe alat.**
`Kelistrikan.xlsx` berjudul "LEMBAR KERJA PENGUJIAN KESELAMATAN LISTRIK" dengan `Nama Alat: Hematologi Analyzer` (No. Sertifikat S.444, PT. Innovasi Diagnostika). Ini adalah **layanan keselamatan-listrik-saja yang diterapkan ke alat apa pun** — dalam contoh ini ke salah satu tipe di `EXCLUDED_TYPE_CODES`. **Konsekuensi:** tidak perlu `DeviceType` "Kelistrikan"; yang dibutuhkan adalah cakupan layanan, bukan entri katalog alat.

### 6.5 Konfirmasi tambahan dari data lapangan

- **Thermohygrometer** (`Thermohygrometer.xlsx`) berisi kalibrasi terisi penuh: 4 setpoint suhu × 6 ulangan, dicatat **dua kali** — tabel `Pembacaan Refrence Thermohygrometer` dan tabel `Pembacaan UUT`, dengan nilai yang berbeda (mis. 25 °C: ref 25.01, UUT 25.00/25.40). Ini membuktikan `MeasurementResult.referenceValue` adalah model yang tepat, dan bahwa tipe alat ini menjalani kalibrasi nyata meski **belum punya satu pun parameter di katalog**.
- **Suction Pump** dan **Phaco Emulsifikasi** sama-sama terisi dengan 6 slot setpoint pilihan teknisi, satuan dipilih per unit (`mPa` / `kPa`), × `Naik`/`Turun` × 3 pengukuran — persis Pattern D + `direction`. Menguatkan gap UI (#2, #1) dan gap katalog Phaco.

---

## 7. CalibrationTestPoint Sufficiency

**Jawaban: B — cukup untuk named points, tidak cukup untuk dua struktur.**

`DeviceCalibrationParameter + CalibrationTestPoint + JobCalibrationTestPoint + MeasurementResult + replicateIndex` **dapat** merepresentasikan:

- Awal/Akhir, L-N/L-G/N-G
- Min/Med/Max, Low/Medium/High
- Posisi A/B/C, Posisi 1–4, Titik ukur N, T1–T5, dan Titik Ukur 1–4/M
- Sweep setpoint, termasuk setpoint kosong (`settingValue = NULL` + `appliedNominalValue`)
- Arah naik/turun, lewat `MeasurementResult.direction` — **bukan** lewat test point
- Ulangan I–N berapa pun, lewat `replicateIndex` dinamis
- Pasangan Reference/UUT, lewat `referenceValue`
- Grid logger, lewat `entryStyle = LOGGER_SUMMARY` + lampiran
- Pass/Fail dan RATIO, lewat `measuredBool` / `measuredText` (schema; UI belum)
- Dimensi kedua/ketiga (sisi, state, siklus), lewat **pemecahan parameter** — pola yang sudah dipakai konsisten dan terdokumentasi

**Tidak** dapat merepresentasikan:

1. Satu baris dengan beberapa besaran terukur berbeda (§6.1).
2. Nilai turunan/agregat dengan toleransi sendiri (§6.2).

Di luar itu, §6.3 (katalog parameter dinamis) adalah batasan `DeviceCalibrationParameter`, bukan `CalibrationTestPoint`.

**Catatan repetisi (Part 9):** tidak ada satu pun LK yang menuntut jumlah bacaan **tetap** sebagai syarat sistem. Kolom I–V (BSM, CPAP, Infusion), I–III (Audiometer, Autoclave, Lampu Operasi), I–VI (Pulse Oximeter, Thermohygrometer), dan I–IX (BSC Downflow) adalah **konvensi cetak lembar**, bukan aturan bisnis. `replicateIndex` dinamis **memadai**; tidak ada bukti LK yang membenarkan `expectedReplicateCount`.

---

## 8. Recommendations Before Portal CRUD

Tidak ada yang diimplementasikan di dokumen ini.

**Portal CRUD cukup mendukung lima field yang disebut** — `settingLabel`, `settingValue`, `sequence`, tolerance override (`toleranceMin`/`toleranceMax`/`toleranceNote`), dan `isActive`. Seluruh struktur named-point yang ditemukan (§3.B) sepenuhnya terwakili oleh kelima field itu. Tidak ada bukti LK yang menuntut konsep tambahan **pada level test point**.

Yang **tidak** boleh ditambahkan ke Portal CRUD atas dasar audit ini:

- Field arah pada test point — arah adalah facet `MeasurementResult.direction`; tiga LK tambahan yang punya naik/turun tidak mengubah itu.
- `expectedReplicateCount` — tidak ada bukti LK.
- Field "kuantitas kedua" atau "rumus turunan" pada test point — keduanya berada di level parameter, bukan test point.

Temuan yang terpisah dari Portal CRUD (bukan rekomendasi implementasi):

- `settingValue` tunggal tidak dapat menyimpan setpoint komposit secara terstruktur. Portal CRUD tetap bisa berjalan dengan menaruhnya di `settingLabel`; konsekuensinya komponen setpoint tidak bisa dievaluasi numerik.
- **Gap terbesar adalah katalog, bukan model**: 49 tipe alat belum punya TP lingkungan Awal/Akhir dan L-N/L-G/N-G; BSC/LAF belum punya TP posisi; Phototherapy belum punya 5 TP; Dental X-Ray belum punya TP Rendah/Sedang/Tinggi; 6 tipe alat belum punya parameter sama sekali padahal dua di antaranya (Thermohygrometer, Phaco) terbukti dikalibrasi di lapangan. Portal CRUD justru alat yang tepat untuk menutup sebagian gap ini — dengan tetap tunduk pada arsitektur snapshot terkunci: job yang sudah `start()` **tidak** berubah.
- **Gap terbesar kedua adalah UI entry, bukan model**: `direction` di luar `SPHYG_PRESSURE_ACC`, `SUCT_VACUUM_GAUGE` yang dikeluarkan dari grid, `referenceValue` tanpa input, dan filter `valueType: "NUMBER"` yang menyembunyikan BOOLEAN/RATIO/TEXT.
- **Satu koreksi klasifikasi**: `PHOTO_IRRADIANCE` di `CalibrationTestPoint_Seed_Extraction.md` §6.2 diklasifikasikan sebagai replicate; data lapangan membantahnya (§6.4a).
- **Satu hal yang wajib ditanyakan sebelum seed**: rumus `ΔT3` pada Autoclave (§6.4b).

---

## 9. Files Inspected

**LK (50, seluruhnya diekstrak paragraf + tabel):** Audiometer, Auto Chemistry Analyzer, Autoclave, Baby Incubator, Bed Side Monitor, Bio Safety Cabinet, Blanket Warmer, Blood Bank Refrigerator, Blood Pressure Monitor, CPAP, Centrifuge Refrigerator, Centrifuge, Cold Chain Vaccine Refrigerator, Dental Unit, Dental X-Ray, Electro Accupunture (EST), Electrocardiograph, Examination Lamp, Fetal Doppler, Flow Meter, Head Lamp Medik, Hematologi Analyzer, Humidifier, Infant Warmer, Infusion Pump, Kelistrikan, Laminar Air Flow, Lampu Operasi, Laryngoskop, Medical Freezer, Medical Refrigerator, Mikroskop Laboratorium, Nebulizer Compressor, Nebulizer Ultrasonic, Oksigen Concentrator, Otoscope, Oven, pH Meter, Phaco Emulsifikasi, Phototherapy, Platelet Agitator Incubator, Pulse Oxymeter, Resusitator Paru dan Neopuff, Rotator, Sphygmomanometer, Spirometer, Sterilisator, Suction Pump, Syringe Pump, Thermohygrometer.

**Workbook hasil pengukuran (6, read-only, untuk konfirmasi ambiguitas):** `Autoclave.xlsx`, `Phototherapy Unit.xlsx`, `Kelistrikan.xlsx`, `Thermohygrometer.xlsx`, `Suction Pump.xlsx`, `Phaco Emulsifikasi.xlsx`.

**Sumber Medcal:**

- `packages/db/prisma/schema.prisma` — `DeviceCalibrationParameter`, `CalibrationTestPoint`, `JobCalibrationTestPoint`, `MeasurementResult`, enum `CalibrationValueType` / `CalibrationParameterEntryStyle` / `MeasurementDirection` / `MeasurementEntryKind`
- `packages/db/prisma/seed-device-taxonomy-extension-parameters.ts`
- `packages/db/prisma/seed-device-calibration-parameters.ts`
- `packages/db/prisma/seed-calibration-test-points.ts`
- `packages/db/prisma/fix-collapsed-audiometer-parameters.ts`
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` (`listMeasurementParameters`)
- `apps/api/src/modules/calibration-jobs/measurement-results.service.ts`
- `apps/api/src/modules/calibration-jobs/measurement-completeness.ts`
- `apps/tech-pwa/src/lib/calibration/measurement.ts`
- `apps/tech-pwa/src/app/jobs/[id]/measurements/measurement-grid.tsx`
- `docs/claude/plans/Calibration-management/measurement-results/CalibrationTestPoint_Seed_Extraction.md` §6

---

## 10. Explicit Non-Changes

- **No source files modified** — tidak ada file di `apps/` atau `packages/` yang disentuh.
- **No schema modified** — `schema.prisma` hanya dibaca.
- **No migration** — tidak ada migrasi dibuat atau dijalankan.
- **No seed modified** — file seed hanya dibaca.
- **No API modified.**
- **No UI modified** — Portal dan Tech-PWA tidak disentuh.
- **No database modified** — tidak ada koneksi database yang dibuka sama sekali dalam audit ini; seluruh bukti berasal dari file `.docx`, `.xlsx`, dan source code.
- **No LK files modified** — `.docx` dibuka read-only via `zipfile.ZipFile(f)` tanpa mode tulis; `.xlsx` didekripsi ke salinan di scratchpad, file sumber tidak ditulis.
- Artefak ekstraksi sementara hanya ada di scratchpad sesi, di luar repository dan di luar direktori LK. Laporan markdown ini adalah satu-satunya file yang ditulis ke repo.
