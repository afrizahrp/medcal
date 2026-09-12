# 3. Golden Example Mapping — Baby Incubator

**Sumber evidence:** `docs\technician-docs\measurement-results\Baby Incubator.xlsx`, sheet `Input Data` (dibuka read-only, password `1004`). Cross-referensi: `LK Baby Incubator.docx` (analisis Task 1) dan seed `DeviceType.code = BABY_INCUBATOR`.

**Catatan identitas:** "Nama Alat" pada contoh Excel ini terisi `Incubator Transport` (bukan "Baby Incubator") — file `Baby Incubator.xlsx` faktanya berisi data kalibrasi unit **Incubator Transport**. Kode model MedCal (`BABY_INCUBATOR`) tetap dipakai sebagai acuan DeviceType karena nama file & struktur worksheet menunjukkan device family yang sama; ini dicatat sebagai observasi, tidak diselaraskan/dinormalisasi.

## 3.1 A. Pendataan Administrasi

| Field LK/Excel | Nilai contoh (Excel) | Field MedCal | Status |
|---|---|---|---|
| No. Sertifikat | `S.631` | `KontrolAlat.certificateNumber` / `Certificate.number` | Ada |
| No. Alat | *(kosong)* | `Device.code` | Ada, beda semantik (lihat BSM) |
| Nama Alat | `Incubator Transport` | `DeviceType.name` | Ada (derived) |
| Merek | `BIPMED` | `Device.brand` | Ada |
| Pemilik | `PT. Bumi Indah Putra` | `Customer.name` | Ada |
| Model/Tipe | `BIC-104-TR` | `Device.model` | Ada |
| Ruangan | `Lab Kalibrasi` | `Device.locationText` | Ada di schema, belum dipakai di PDF |
| No. Seri | `BICB3-VII260018` | `Device.serialNumber` | Ada |
| Tgl. Terima | `2026-07-21` | `CalibrationJob.startedAt` | Ada |
| Tgl. Kalibrasi | `2026-07-21` | `CalibrationJob.startedAt` (field sama) | Ada |
| Kapasitas | *(kosong)* | `KontrolAlat.capacity` | Ada, hanya untuk SEND_TO_LAB |
| Resolusi | `0.1 °C` | — | **TIDAK ADA** field dedicated |
| **"Berlaku Sampai"** (`2027-07-21`) | — | — | **Field EXTRA yang tidak ada di LK docx Baby Incubator maupun di skema MedCal manapun** — kemungkinan validitas sertifikat kalibrasi alat (mirip `Certificate.validUntil`, tapi itu untuk device UUT bukan alat referensi). Dicatat sebagai temuan, tidak diinvestigasi lebih jauh (di luar scope tanpa bukti tambahan). |
| Petugas Kalibrasi | `Eliza Novianti` | `WorkOrderAssignment` → `User` | Ada di schema, tidak dipakai di PDF Kontrol Alat |

## 3.2 B. Daftar Alat yang Digunakan (aktual)

| No | Nama Alat | Merk | Type/Model | No. Seri |
|---|---|---|---|---|
| 1 | Incubator Analyzer | Fluke Biomedical | INCU II | 64230003 |
| 3 | Electrical Safety Analyzer | Fluke Biomedical | ESA612 | 6579027 |
| 4 | Thermohygrometer | Taffware | HTC-1 | TH-04 |

**Catatan:** penomoran `No` melompat dari 1 → 3 → 4 (tidak ada baris "2") — kemungkinan baris kosong yang tidak terisi teknisi. Dilaporkan sebagai-adanya, bukan dikoreksi.

## 3.3 C. Pengukuran Kondisi Lingkungan

| Parameter | Awal | Akhir | Toleransi | Kode parameter |
|---|---|---|---|---|
| Suhu (°C) | 28.5 | 28.5 | 25 ± 5 °C | `INCU_ROOM_TEMP` |
| RH (%) | 47 | 47 | 50% ± 20% | `INCU_ROOM_HUMIDITY` |
| Tegangan L-N (Vac) | 230 | — | 220 ± 10% Vac | `INCU_INPUT_VOLTAGE` |
| Tegangan L-G (Vac) | 229.3 | — | — | (sub-reading sama) |
| Tegangan N-G (Vac) | 1.1 | — | — | (sub-reading sama) |

Gap struktural sama seperti BSM — lihat [02-bed-side-monitor-mapping.md §2.3](02-bed-side-monitor-mapping.md).

## 3.4 D. Pemeriksaan Fisik dan Fungsi Alat

Excel memiliki **9 item** — lebih banyak dari 5 item BSM, cocok jumlahnya dengan seed `seed-physical-check-items.ts` untuk `BABY_INCUBATOR` (9 item, `BABY_INCUBATOR_PHYSICAL_001`..`009`). **Namun ada perbedaan wording antara Excel dan katalog seed** (yang bersumber dari LK docx resmi):

| # | Nama di seed (= LK docx resmi) | Nama di Excel golden example | Sama? |
|---|---|---|---|
| 1 | Badan / Permukaan | Badan Permukaan | Ya (beda spasi saja) |
| 2 | Kotak kontak alat | Kotak kontak alat | Ya |
| 3 | Kabel catu utama (Line cord) | Kabel catu utama | Beda (Excel lebih singkat) |
| 4 | Tombol, Saklar dan kontrol | Tombol, saklar dan kontrol | Ya (beda kapitalisasi) |
| 5 | Sensor suhu kulit | **Sensor gawai** | **Beda** |
| 6 | Saringan udara | Saringan udara | Ya |
| 7 | Tampilan dan indicator | Tampilan indikator | Beda (urutan kata) |
| 8 | Batas cairan | **Batas caitan** (typo di Excel) | Beda (typo) |
| 9 | Matras | **Kasur/matras** | Beda |

**Tambahan:** Excel punya item "Sekering pengaman" (fuse) yang **tidak ada** dalam urutan seed 9-item di atas pada posisi ke-4 — kemungkinan seed dan Excel punya urutan/isi item yang sedikit berbeda. Ini adalah **evidence bahwa katalog `DevicePhysicalCheckItem` disalin dari LK docx TEMPLATE, bukan dari Results Excel** — konsisten dengan temuan Task 1 bahwa LK docx adalah sumber-of-truth desain, sementara Excel adalah data hasil lapangan yang bisa punya variasi kecil kata-kata teknisi/versi form berbeda. **Tidak dinormalisasi** — dilaporkan sesuai temuan.

Verdict semua item pada contoh ini: "Baik" (nilai `1` di kolom G).

## 3.5 E. Pengukuran Keselamatan Listrik

| Parameter | Terukur | Ambang Batas | Kode parameter |
|---|---|---|---|
| Resistansi Pembumian Protektif | 0.212 Ω | ≤ 0,3 Ω | `INCU_EARTH_RESISTANCE` |
| Resistansi Isolasi | `OR` (teks) | > 2 MΩ | `INCU_INSULATION_RESISTANCE` |
| Arus Bocor Peralatan | 0.1 µA | ≤ 500 µA | `INCU_EQUIP_LEAKAGE` |

**Catatan:** Baby Incubator Excel **tidak mencatat baris "Arus bocor bagian yang diaplikasikan"** (hanya 3 baris electrical safety, bukan 4 seperti BSM) — konsisten dengan catatan LK docx "*Tidak dilakukan jika catu daya menggunakan baterai / diuji ketika UUT berhubungan langsung ke pasien*" — baby incubator tidak punya applied part yang kontak langsung ke pasien dengan cara yang relevan, jadi baris ini kosong/dilewati. Katalog `INCU_APPLIED_LEAKAGE` tetap ADA di seed (tidak dihapus), hanya tidak diisi pada job ini — perilaku "parameter optional secara kontekstual" ini **tidak ada mekanisme eksplisit** di schema (tidak ada flag "N/A untuk device ini"); kekosongan hanya berarti tidak ada `MeasurementResult` row. Dicatat sebagai gap B.

## 3.6 F. Pengukuran Kinerja Alat — struktur PALING KOMPLEKS dari kedua golden example

### 1. Kalibrasi Suhu Udara (T1–T5), setting 32°C dan 36°C

Excel: kolom `Suhu Setting °C | Display UUT °C | Hasil Pengukuran Standar °C (I–V)`, 5 sensor (T1–T5), masing-masing 2 baris (setting 32 dan 36).

| Sensor | Setting | Display UUT | Std I | II | III | IV | V | Toleransi |
|---|---|---|---|---|---|---|---|---|
| T5 | 32 | 32 | 32.14 | 32.14 | 32.15 | 32.15 | 32.15 | ± 1,5 °C |
| T5 | 36 | 35.9 | 36.04 | 36.04 | 36.04 | 36.04 | 36.05 | |
| T1 | 32 | 32 | 32.64 | 32.65 | 32.65 | 32.65 | 32.65 | ± 0,8 °C terhadap T5 |
| T1 | 36 | 35.9 | 36.54 | 36.54 | 36.54 | 36.55 | 36.55 | |
| T2 | 32 | 32 | 32.61 | 32.61 | 32.61 | 32.61 | 32.61 | (toleransi sama dgn T1, tidak diulang di Excel) |
| T2 | 36 | 35.9 | 36.41 | 36.41 | 36.41 | 36.41 | 36.41 | |
| T3 | 32 | 32 | 32.24 | 32.24 | 32.24 | 32.24 | 32.24 | |
| T3 | 36 | 35.9 | 36.04 | 36.04 | 36.04 | 36.05 | 36.05 | |
| T4 | 32 | 32 | 32.24 | 32.24 | 32.24 | 32.24 | 32.24 | |
| T4 | 36 | 35.9 | 35.84 | 35.84 | 35.84 | 35.84 | 35.84 | |

Kode seed relevan: `INCU_AIR_TEMP` (`decimalPlaces = 2`, sesuai `backfill-decimal-places-from-results.ts` baris `INCU_AIR_TEMP: 2`).

**Konfirmasi struktur (ditemukan di `seed-calibration-test-points.ts` baris 420–445):** 5 sensor × 2 setpoint memang dimodelkan sebagai **10 `CalibrationTestPoint`** di bawah SATU `DeviceCalibrationParameter` (`INCU_AIR_TEMP`), dengan toleransi override per-titik (`toleranceMin/Max` berbeda untuk TM/T5 vs T1–T4):

```420:444:D:\medcal\packages\db\prisma\seed-calibration-test-points.ts
{
  code: "INCU_AIR_TEMP",
  device: "Baby Incubator",
  pattern: "override",
  source:
    'LK Baby Incubator.docx — "Kalibrasi Pengontrol Suhu dan Keseragaman Suhu Inkubator" (sensors TM/T5, T1–T4 × settings 32 & 36 °C, trials I–V)',
  notes:
    "Two tolerance classes: TM/T5 vs the setting = ± 1.5 °C; T1–T4 vs the running mean of TM = ± 0.8 °C. 5 sensors × 2 settings = 10 points. FLAGGED — a reviewer may prefer 5 points (sensor only) with the 32/36 setting handled as a separate entry-UI sweep.",
  testPoints: [
    ...(["TM/T5", "T1", "T2", "T3", "T4"] as const).flatMap((sensor, si) =>
      [32, 36].map((setpoint, pi) => {
        const isMean = sensor === "TM/T5";
        return {
          sequence: si * 2 + pi + 1,
          settingLabel: `${sensor} — Setting ${setpoint} °C`,
          settingValue: setpoint,
          toleranceMin: isMean ? -1.5 : -0.8,
          toleranceMax: isMean ? 1.5 : 0.8,
          toleranceNote: isMean
            ? "± 1.5 °C terhadap setting"
            : "± 0.8 °C terhadap rata-rata TM (T5)",
        };
      }),
    ),
  ],
},
```

**Penting:** komentar `notes` pada baris seed ini sendiri berisi kata **"FLAGGED"** — tim MedCal sendiri sudah mencatat ini sebagai keputusan desain terbuka ("a reviewer may prefer 5 points... instead"). Ini bukan temuan baru dari audit ini, melainkan **gap B (Business Rule Ambiguity) yang SUDAH diketahui dan didokumentasikan di kode oleh tim**, belum diputuskan/diselesaikan.

### 2. Overshoot / Suhu Matras / Kecepatan Udara / Kebisingan / Kelembaban

| Parameter | Setting UUT | Hasil | Toleransi | Kode parameter (seed capability item) |
|---|---|---|---|---|
| Overshoot temperature | 32°C ke 36°C | 0.71 | ≤ 2 °C | `OVERSHOOT_TEMPERATURE` |
| Suhu matras | 36°C | 32.35 | ≤ 40 °C | `MATTRESS_TEMPERATURE` |
| Kecepatan udara | 32°C ke 36°C | 0.1 | ≤ 0,35 m/detik | `AIR_VELOCITY` |
| Kebisingan | 36°C | 55.3 | ≤ 60 dB | `NOISE_LEVEL` |
| Kelembaban | suhu 36°C | 41.5 | 10%* | (tidak ada kode capability item eksplisit di seed capability — lihat catatan) |

**Catatan penting:** kelembaban dalam kompartemen inkubator ("Kelembaban" di F.2) **berbeda** dari `ROOM_HUMIDITY` (kelembaban ruangan di section C). Seed `seed-device-capabilities.ts` mendaftarkan capability `INCUBATOR_ENVIRONMENT` dengan item termasuk suhu udara/overshoot/matras/kecepatan udara/kebisingan/sensor kulit — **tidak terlihat item eksplisit untuk "Kelembaban Inkubator"** dalam grep sebelumnya; ini **kemungkinan gap seed (C — Implementation Gap)** atau item tersebut ada tapi belum ditemukan di grep terbatas — TIDAK dipastikan lebih jauh tanpa membaca seluruh file seed baris demi baris (di luar sampling yang dilakukan). Dilaporkan sebagai **unresolved, perlu verifikasi lanjutan**, bukan diklaim tidak ada.

### 3. Kalibrasi Sensor Temperatur Kulit — DUA sub-tabel berbeda toleransi

| Parameter | Setting | Display UUT | Selisih | Toleransi |
|---|---|---|---|---|
| Akurasi temperatur kulit bayi terhadap temperature kontrol | 36 | 36 | 0 | ≤ 0,7 °C |
| Akurasi Sensor Temperature (terhadap Standar) | 36 | *(kosong)* | — | ≤ 0,3 °C |

Kode seed: `INCU_SKIN_TEMP_SENSOR` (parameter tunggal di bawah capability item `SKIN_TEMPERATURE_SENSOR`, `uomCode: DEG_C`).

**Konfirmasi:** hasil pencarian di `seed-calibration-test-points.ts` untuk `INCU_SKIN_TEMP_SENSOR` / "skin" / "Kalibrasi Sensor Suhu Kulit` **tidak menghasilkan hasil apa pun** — parameter ini **tidak memiliki `CalibrationTestPoint` sama sekali** dalam seed saat ini. Artinya dua sub-tabel dengan toleransi berbeda (≤ 0,7°C vs ≤ 0,3°C) pada golden example Excel **belum punya representasi terstruktur** di katalog — hanya 1 parameter generik tanpa test point/override. Ini adalah **gap C (Implementation Gap)**, bukan sekadar ambiguitas bisnis — datanya jelas dari Excel, tapi katalog belum mengikuti strukturnya.

## 3.7 Kesimpulan Baby Incubator

Baby Incubator adalah golden example yang **jauh lebih kompleks** dari BSM: 5-sensor grid suhu dengan toleransi absolut vs relatif, item fisik dengan wording Excel-vs-seed yang lebih banyak berbeda, dan dua metode kalibrasi sensor kulit dengan toleransi berbeda. Fondasi model (`DeviceCapability` → item → parameter) tetap generik dan cukup ekspresif secara konsep, tetapi verifikasi detail apakah SEMUA nuansa struktural di atas (grid T1–T5, dua toleransi sensor kulit) sudah benar-benar tersedia sebagai `CalibrationTestPoint`/parameter terpisah di database **memerlukan query langsung ke data seed, bukan hanya baca kode** — di luar scope audit read-only berbasis kode ini tanpa akses database live. Dilaporkan sebagai gap yang perlu verifikasi lanjutan (kategori B/C, lihat [14-gap-classification.md](14-gap-classification.md)).
