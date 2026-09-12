# 2. Golden Example Mapping — Bed Side Monitor

**Sumber evidence:** `docs\technician-docs\measurement-results\Bed Side Monitor.xlsx`, sheet `Input Data` (dibuka read-only, password `1004`, lihat [00-README.md](00-README.md)). Cross-referensi: `LK Bed Side Monitor.docx` (analisis Task 1) dan seed `DeviceType.code = BED_SIDE_MONITOR`.

## 2.1 A. Pendataan Administrasi (Excel, sel aktual)

| Field LK/Excel | Nilai contoh (Excel) | Field MedCal | Status |
|---|---|---|---|
| No. Sertifikat | `S.638` | `KontrolAlat.certificateNumber` (In Lab manual) / `Certificate.number` (resmi) | Ada, terpisah lifecycle |
| No. Alat | *(kosong di contoh)* | `Device.code` (DVC-000001, auto-generated) | Ada — beda semantik: Excel "No. Alat" nampaknya no. inventaris pelanggan, MedCal `Device.code` adalah kode internal MedCal |
| Nama Alat | `Bed Side Monitor (Patient Monitor)` | `DeviceType.name` | Ada (derived) |
| Merek | `BIPMED` | `Device.brand` | Ada |
| Pemilik | `PT. Bumi Indah Putra` | `Customer.name` via `WorkOrder.customer` | Ada |
| Model/Tipe | `BPM-301-02` | `Device.model` | Ada |
| Ruangan | `Lab Bipmed` | `Device.locationText` | Ada di schema, belum dipakai di PDF Kontrol Alat |
| No. Seri | `BPM2-VII260003` | `Device.serialNumber` / `CalibrationJob.technicianObservedSerial` | Ada |
| Tgl. Terima | `2026-07-28` | `CalibrationJob.startedAt` (derived) | Ada |
| Tgl. Kalibrasi | `2026-07-28` (sama dengan Tgl. Terima) | `CalibrationJob.startedAt` | Sama field — konsisten dengan temuan Excel |
| Kapasitas | *(kosong)* | `KontrolAlat.capacity` (free text) | Ada — tapi hanya untuk SEND_TO_LAB (`KontrolAlat` 1:1 hanya utk `serviceMode=SEND_TO_LAB`) |
| Resolusi | `1` | — | **TIDAK ADA field dedicated** di schema manapun |
| Petugas Kalibrasi | `Farras Zuhdi` | `WorkOrderAssignment` → `User` | Ada di schema, TIDAK dipakai di `kontrol-alat-pdf.ts` |
| Entri data oleh | *(tidak ada di Excel BSM ini)* | `MeasurementResult.recordedByUserId` / `PhysicalCheckResult.recordedByUserId` | Ada per-baris hasil |

## 2.2 B. Daftar Alat yang Digunakan (aktual, dari Excel)

| No | Nama Alat | Merk | Type/Model | No. Seri |
|---|---|---|---|---|
| 1 | Vital Signs Simulator | Fluke Biomedical | Prosim8 | 6668072 |
| 2 | Electrical Safety Analyzer | Fluke Biomedical | ESA612 | 6579027 |
| 3 | Thermohygrometer | Taffware | HTC-1 | TH-04 |

Model MedCal: `JobReferenceEquipmentUsed` (FK ke `Equipment` + `EquipmentCalibrationRecord`, per job) — lihat [06-equipment-reference-mapping.md](06-equipment-reference-mapping.md) untuk detail required-vs-used.

## 2.3 C. Pengukuran Kondisi Lingkungan (aktual, dari Excel)

| Parameter | Awal | Akhir | Toleransi (LK) | Kode `DeviceCalibrationParameter` |
|---|---|---|---|---|
| Suhu (°C) | 28.1 | 28.8 | 25 ± 5 °C | `BSM_ROOM_TEMP` |
| RH (%) | 46 | 44 | 50% ± 20% | `BSM_ROOM_HUMIDITY` |
| Tegangan L-N (Vac) | 225.3 | — | ± 10% Vac | `BSM_INPUT_VOLTAGE` |
| Tegangan L-G (Vac) | 226 | — | — | (sub-reading `INPUT_VOLTAGE` yang sama) |
| Tegangan N-G (Vac) | 0.6 | — | — | (sub-reading `INPUT_VOLTAGE` yang sama) |

**Catatan struktur:** LK/Excel punya 1 baris "Tegangan" dengan 3 sub-baris (L-N/L-G/N-G), tapi katalog `DeviceCalibrationParameter` hanya punya **1 baris** `INPUT_VOLTAGE` per DeviceType (tidak dipecah 3). Bagaimana 3 nilai L-N/L-G/N-G direpresentasikan (3 `MeasurementResult` row dengan `replicateIndex` berbeda? 3 `CalibrationTestPoint`? atau hanya 1 nilai yang disimpan?) **tidak bisa ditegaskan dari skema saja** — perlu bukti tambahan dari `measurement-results.service.ts` test/data nyata. Ini dicatat sebagai **gap B (Business Rule Ambiguity)**, bukan diasumsikan.

## 2.4 D. Pemeriksaan Fisik dan Fungsi Alat (aktual, dari Excel)

Excel mencatat verdict sebagai angka `1` di kolom "Baik" (bukan literal string "Baik"/"Tidak Baik") — representasi radio-button khas Excel. Semua 5 item bernilai "Baik" pada contoh ini. Kolom Excel: `Bagian Alat | Keterangan | Hasil Pengamatan` — **beda label** dari LK docx resmi (`No. | Parameter | Batas Pemeriksaan | Keterangan`), namun isi/urutan item identik.

| # | Item (Excel & LK docx, identik) | Verdict (Excel) |
|---|---|---|
| 1 | Badan Permukaan / Badan / Permukaan | Baik |
| 2 | Kotak kontak alat | Baik |
| 3 | Kabel catu utama | Baik |
| 4 | Tombol, Saklar dan pengaman | Baik |
| 5 | Tampilan dan indikator | Baik |

Model MedCal: `PhysicalCheckResult.verdict` (enum `BAIK` / `TIDAK_BAIK`) — pemetaan boolean/enum konsisten dengan struktur Excel (angka 1 = pilihan "Baik" dipilih). Katalog `DevicePhysicalCheckItem` untuk `BED_SIDE_MONITOR` di seed **cocok kata demi kata** dengan LK docx (bukan dengan wording Excel, yang kebetulan identik untuk device ini).

## 2.5 E. Pengukuran Keselamatan Listrik (aktual, dari Excel)

| Parameter | Terukur | Ambang Batas | Kode parameter |
|---|---|---|---|
| Resistansi Pembumian Protektif | 0.07 Ω | ≤ 0,3 Ω | `BSM_EARTH_RESISTANCE` |
| Resistansi Isolasi | `OR` (teks, bukan angka) | > 2 MΩ | `BSM_INSULATION_RESISTANCE` |
| Arus Bocor Peralatan | 0.1 µA | ≤ 500 µA | `BSM_EQUIP_LEAKAGE` |
| Arus Bocor Bagian Diaplikasikan | 0 µA | ≤ 50 µA | `BSM_APPLIED_LEAKAGE` |

Metadata konfigurasi alat: Tipe bagian diaplikasikan = `B`, Kelas proteksi = `I`, Hubungan utama = `DPS`. Tidak ditemukan field/model dedicated untuk metadata ini (bukan `MeasurementResult`, bukan kolom `CalibrationJob`) — lihat [09-environmental-electrical-safety-mapping.md](09-environmental-electrical-safety-mapping.md) untuk gap detail (khususnya nilai teks `OR` vs `valueType = NUMBER`).

## 2.6 F. Pengukuran Kinerja Alat (aktual, dari Excel) — cocok penuh dengan seed

### a. Kalibrasi Heart Rate (kode `BSM_HEART_RATE`, UOM `BPM`)

| Setting (BPM) | I | II | III | IV | V | Toleransi |
|---|---|---|---|---|---|---|
| 30 | 30 | 29 | 30 | 30 | 30 | ± 5 bpm |
| 60 | 60 | 60 | 60 | 60 | 60 | |
| 120 | 120 | 120 | 120 | 120 | 120 | |
| 180 | 180 | 180 | 180 | 180 | 180 | |

### b. Kalibrasi Respirasi (kode `BSM_RESP_RATE`, UOM Excel: `BrPM`; UOM seed: `RPM` — **beda label**)

| Setting (BrPM) | I | II | III | IV | V | Toleransi |
|---|---|---|---|---|---|---|
| 15 | 15 | 15 | 15 | 15 | 15 | ± 3 BrPM |
| 30 | 30 | 30 | 30 | 30 | 30 | |
| 60 | 60 | 60 | 60 | 60 | 60 | |
| 120 | 119 | 120 | 120 | 119 | 120 | |

### c. Kalibrasi SpO2 (kode `BSM_SPO2`) — 7 titik di Excel & LK docx ini, BUKAN 8 titik

| Setting (SPO2) | I | II | III | IV | V | Toleransi |
|---|---|---|---|---|---|---|
| 98 | 98 | 98 | 98 | 98 | 98 | ± 3% SpO2 |
| 93 | 94 | 94 | 94 | 94 | 94 | |
| 92 | 94 | 94 | 94 | 94 | 94 | |
| 85 | 88 | 88 | 88 | 88 | 88 | |
| 90 | 92 | 92 | 92 | 92 | 92 | |
| 70 | 77 | 77 | 77 | 77 | 77 | |
| 88 | 90 | 90 | 90 | 90 | 90 | |

**Catatan:** audit internal sebelumnya (`calibration-results-cross-check.md`) mencatat `BSM_SPO2` seharusnya **8 titik** (duplikasi 90) berdasarkan sampel *lain*; file BSM golden example yang diverifikasi di sini menunjukkan **7 titik** tanpa duplikasi. Ini adalah **gap B (Business Rule Ambiguity)** — dua sumber evidence berbeda soal jumlah titik SpO2; TIDAK diselesaikan di audit ini.

### d. Kalibrasi NIBP (kode `BSM_SYSTOLIC` / `BSM_DIASTOLIC` / `BSM_MAP`, UOM `MMHG`) — 7 triple Systole/Mean/Diastole

| Setting Systole/Mean/Diastole | Toleransi |
|---|---|
| 120/93/80 | ± 5 mmHg |
| 150/116/100 | |
| 200/166/150 | |
| 250/215/195 | |
| 60/40/30 | |
| 80/60/50 | |
| 100/76/65 | |

Semua kode parameter kinerja BSM (`BSM_HEART_RATE`, `BSM_RESP_RATE`, `BSM_SPO2`, `BSM_SYSTOLIC`, `BSM_DIASTOLIC`, `BSM_MAP`) sudah ada di `seed-device-calibration-parameters.ts` (baris ~1547–1587), masing-masing sebagai `DeviceCalibrationParameter` biasa di bawah `DeviceType.code = BED_SIDE_MONITOR` — **tidak ada logic khusus per device**, murni data katalog generik.

## 2.7 Kesimpulan Bed Side Monitor

Seluruh section LK (A–F) memiliki jalur data di MedCal. Gap yang teridentifikasi murni pada: (1) representasi 3-sub-reading Tegangan Input, (2) jumlah titik SpO2 tidak konsisten antar sumber evidence, (3) field "Resolusi" tidak ada, (4) `valueType=NUMBER` vs nilai teks "OR" untuk Resistansi Isolasi. Tidak ada gap arsitektural besar (tidak butuh model/tabel baru untuk BSM secara spesifik).
