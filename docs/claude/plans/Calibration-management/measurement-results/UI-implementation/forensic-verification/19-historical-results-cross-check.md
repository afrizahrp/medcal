# 19. Cross-Check Tambahan — `D:\result-historical.xlsx`

**Sumber baru** yang diberikan user setelah laporan utama (00–18) selesai: `D:\result-historical.xlsx`, dideskripsikan user sebagai "hasil dari kalibrasi sebelumnya yg sudah dipisahkan ke beberapa sheets".

## 19.1 Fakta File

- Path: `D:\result-historical.xlsx` (di luar folder `D:\medcal`, tidak bagian dari repo).
- Signature: `50 4B 03 04` (ZIP/OOXML biasa) — **TIDAK terenkripsi**, berbeda dari 66 file di `docs\technician-docs\measurement-results\` yang butuh password `1004`.
- Dibuka read-only via `openpyxl`; tidak ada file disalin ke luar `%TEMP%`, temp script dihapus setelah analisis.
- 5 sheet, masing-masing 1 hasil kalibrasi nyata (bukan template kosong):

| Sheet | Nama Alat (dari isi) | No. Sertifikat | Baris data |
|---|---|---|---|
| `audiometer` | Audiometer (Sibelsound 400) | S.562 | A1:K91 |
| `cold-chain-vaccine-refrigerator` | Vaccine Refrigerator (BBLO-101-3D) | S.287 | B1:AE103 |
| `blood-bank-refrigerator` | Blood Bank Refrigerator (BBLO-101-3D) | S.201 | B1:AE103 |
| `bedside-monitor` | Bed Side Monitor (BPM-301-02) | S.638 | A1:K120 |
| `baby-incubator` | Incubator Transport (BIC-104-TR) | S.631 | B1:AE105 |

`bedside-monitor` dan `baby-incubator` adalah golden example **ketiga** untuk device type yang sama yang sudah dianalisis di [02](02-bed-side-monitor-mapping.md)/[03](03-baby-incubator-mapping.md) (job/sertifikat berbeda: S.638/S.631 di sini vs data lain sebelumnya) — dipakai sebagai **konfirmasi independen kedua**, bukan device baru. `audiometer`, `cold-chain-vaccine-refrigerator`, dan `blood-bank-refrigerator` adalah **device type yang belum pernah dicek** di laporan 00–18.

## 19.2 Dampak pada Gap yang Sudah Dilaporkan

### Gap #5 — SpO2 BSM: **RESOLVED, berpihak ke 8 titik**

[14-gap-classification.md](14-gap-classification.md) baris #5 melaporkan ambiguitas: golden example lama (`Bed Side Monitor.xlsx`) hanya punya 7 baris SpO2, sedangkan audit internal 2026-09-08 & seed (`BSM_SPO2`) punya 8 titik `[98, 93, 92, 85, 90, 70, 88, 90]`.

Sheet `bedside-monitor` di `result-historical.xlsx` (baris 83–90, kolom B) berisi **8 baris**: `98, 93, 92, 85, 90, 70, 88, 90` — cocok **persis** dengan `BSM_SPO2` di `seed-calibration-test-points.ts` (termasuk duplikasi nilai `90` di titik terakhir).

**Kesimpulan:** Desain 8-titik di seed sudah benar. Golden example lama yang hanya 7 baris kemungkinan besar adalah kesalahan input teknisi (baris terakhir tidak terisi), bukan kesalahan model data. Gap #5 diturunkan dari kategori **B (Business Rule Ambiguity)** menjadi **A (Already Correct)** — tidak perlu keputusan bisnis lagi, cukup baseline dianggap 8 titik.

### Gap #1 — Resistansi Isolasi `"OR"` sebagai teks: **dikonfirmasi ulang, confidence naik**

Kelima sheet (audiometer, cold-chain, blood-bank, bedside-monitor, baby-incubator) — **5 dari 5** — mencatat baris "Resistansi Isolasi (MΩ)" dengan nilai literal teks `'OR'` (bukan angka), persis seperti temuan di [09 §9.3](09-environmental-electrical-safety-mapping.md) yang sebelumnya hanya berdasar 2 contoh. Ini bukan kasus khusus BSM — ini pola yang konsisten di semua device type yang diperiksa sampai saat ini. Gap #1 tetap **C (Implementation Gap)**, tapi evidence-nya kini jauh lebih kuat (5/5 sample, bukan 1/2).

## 19.3 Temuan Baru — Device Type yang Belum Dicek Sebelumnya

Struktur LK untuk `audiometer`, `cold-chain-vaccine-refrigerator`, dan `blood-bank-refrigerator` di-cross-check terhadap kode seed (`seed-device-types.ts`, `seed-device-taxonomy-extension-parameters.ts`, `seed-physical-check-items.ts`, `seed-device-calibration-parameters.ts`, `seed-calibration-test-points.ts`).

### 19.3.1 AUDIOMETER — cocok

- `DeviceType.code = "AUDIOMETER"` ada (`seed-device-types.ts` baris 189).
- 6 physical check item di Excel (Badan Permukaan, Kotak kontak, Kabel catu utama, Tombol/Saklar/pengaman, Tampilan indikator, Earphone) **cocok 1:1** dengan `AUDIOMETER_PHYSICAL_001`..`006` di `seed-physical-check-items.ts` (nama & urutan sama, teks `inspectionLimit` sama persis).
- Parameter kinerja "Linieritas dB Pure Tone" (Earphone Kanan/Kiri × 7 setpoint: 80,70,60,50,40,30,20 dB, toleransi ± 1 dB) cocok dengan `AUD_PURE_TONE_LINEARITY_KANAN`/`_KIRI` di `seed-calibration-test-points.ts` (`sweep([80,70,60,50,40,30,20], "dB")`).
- Environmental & electrical safety (Suhu/RH/Tegangan, Resistansi pembumian ≤0.3Ω, Isolasi >2MΩ, Arus bocor ≤500µA) cocok dengan `envElecID("AUDIOMETER", ...)` di `seed-device-taxonomy-extension-parameters.ts` baris 221–229.
- **Catatan:** Excel tidak menampilkan section "Frekuensi Respon / Tanggap" (`AUD_FREQUENCY_RESPONSE_*`) — konsisten dengan catatan yang sudah ada di seed ("2026-09-08 measurement-results/Audiometer.xlsx contains Pure Tone Linearity only — frequency-response sweep NOT present in filled file"). Bukan gap baru, sudah terdokumentasi tim.

**Verdict AUDIOMETER: sudah dipetakan dengan baik, tidak ada gap baru ditemukan dari sample ini.**

### 19.3.2 BLOOD_BANK_REFRIGERATORS — cocok, dengan satu catatan struktur data

- `DeviceType.code = "BLOOD_BANK_REFRIGERATORS"` ada (baris 160).
- 5 physical check item cocok 1:1 dengan `BLOOD_BANK_REFRIGERATORS_PHYSICAL_001`..`005`.
- Environmental & electrical safety cocok dengan pola generik yang sama (5/5 device sekarang mengikuti pola identik: Suhu/RH/Tegangan lalu 3 baris keselamatan listrik).
- Parameter kinerja "Data Pengukuran" (30 siklus pengukuran × 9 posisi sensor + 1 kolom "Pembacaan indikator UUT") cocok secara konsep dengan `BBR_STORAGE_TEMP` (`STORAGE_TEMPERATURE_UNIFORMITY`, "Keseragaman Suhu Penyimpanan multi-titik T1–T9") yang di skema memakai `entryStyle = LOGGER_SUMMARY` (lihat `schema.prisma` baris ~1367–1372: LOGGER_SUMMARY = ringkasan min/max + attachment file logger, BUKAN 270 titik data individual yang disimpan sebagai `MeasurementResult` terpisah).
  - **Ini bukan gap** — arsitektur `LOGGER_SUMMARY` + `FileOwnerType.MEASUREMENT_RESULT` (attachment PDF/CSV 12-channel thermometer) sudah didesain persis untuk kasus data logger bervolume tinggi seperti ini. Tabel 30×9 di Excel adalah representasi mentah data logger, bukan sesuatu yang perlu di-generate ulang oleh LK dinamis — cukup direferensikan sebagai attachment.

**Verdict BLOOD_BANK_REFRIGERATORS: sudah dipetakan dengan baik, arsitektur LOGGER_SUMMARY terbukti relevan/tervalidasi oleh sample ini.**

### 19.3.3 `cold-chain-vaccine-refrigerator` — GAP BARU (ambiguitas nama sheet vs 2 DeviceType berbeda)

Ini satu-satunya temuan baru yang perlu **STOP & report** (sesuai aturan task), bukan diselesaikan sendiri:

- Nama sheet Excel: `cold-chain-vaccine-refrigerator`. Isinya: "Nama Alat: Vaccine Refrigerator", Model `BBLO-101-3D` — **identik strukturnya** (physical check items, parameter kode, bahkan No. Seri `BBLO22-III250003`) dengan sheet `blood-bank-refrigerator` di file yang sama, hanya beda "Nama Alat" dan No. Sertifikat.
- Di seed MedCal, ada **DUA** `DeviceType` yang relevan dan **berbeda**:
  - `COLD_CHAIN` (kode `CCHAIN_STORAGE_TEMP`, toleransi 2–10°C)
  - `KULKAS_VAKSIN` (kode `KVAK_STORAGE_TEMP`, toleransi 2–10°C, nama Indonesia = "Kulkas Vaksin")
- Kedua DeviceType ini punya `DevicePhysicalCheckItem` yang **identik teksnya** (`COLD_CHAIN_PHYSICAL_001..005` sama persis dengan `KULKAS_VAKSIN_PHYSICAL_001..005`), dan `seed-physical-check-items.ts` baris 1823 bahkan punya guard eksplisit: `if (!deviceTypes.has("COLD_CHAIN") || !deviceTypes.has("KULKAS_VAKSIN")) throw new Error(...)` — mengonfirmasi tim sendiri sudah menyadari kedua DeviceType ini "berpasangan"/tumpang tindih tapi sengaja dipisah.
- **Tidak ada evidence di repo (kode, seed, atau dokumentasi) yang menentukan sheet "Vaccine Refrigerator" ini harus dipetakan ke `COLD_CHAIN` atau ke `KULKAS_VAKSIN`.** Nama "vaccine refrigerator" secara harfiah lebih dekat ke `KULKAS_VAKSIN` ("Kulkas Vaksin" = Vaccine Refrigerator dalam bahasa Indonesia), tapi ini adalah **tebakan berbasis penamaan**, bukan bukti dari kode.

**Klasifikasi: Gap #19 (baru) — Kategori B (Business Rule Ambiguity).** Tidak diselesaikan di sini sesuai aturan task ("jangan menebak mapping device type, definisikan sebagai gap dan laporkan"). Menambahkan baris baru ke [14-gap-classification.md](14-gap-classification.md).

## 19.4 Field yang Tervalidasi Ulang (bukan gap, hanya konfirmasi)

- `Kapasitas` sebagai field administratif kosong di 3 dari 5 sheet baru (audiometer, bedside-monitor) tapi terisi `"2-8°C"` di kedua sheet cold-chain/blood-bank — konsisten dengan Gap #13 yang sudah dilaporkan (field ini spesifik untuk device penyimpanan/refrigerator, hanya tersedia via `KontrolAlat.capacity` yang 1:1 dengan job `SEND_TO_LAB`). Tidak ada informasi baru, hanya menguatkan gap yang sudah ada.
- Struktur "Tipe bagian yang diaplikasikan / Kelas proteksi / Hubungan utama" (Gap #2) muncul identik di **kelima** sheet — menguatkan (bukan mengubah) klasifikasi gap tersebut.

## 19.5 Ringkasan Perubahan pada Laporan Utama

| Item | Sebelum | Sesudah cross-check ini |
|---|---|---|
| Gap #5 (SpO2 BSM) | Kategori B, ambigu 7 vs 8 titik | **Kategori A** — 8 titik terkonfirmasi oleh 2 sumber independen |
| Gap #1 (Resistansi Isolasi teks "OR") | Evidence dari 2 device | Evidence dari **5 device**, confidence naik, kategori tetap C |
| AUDIOMETER, BLOOD_BANK_REFRIGERATORS | Belum pernah dicek | **Sudah dipetakan, tidak ada gap baru** — arsitektur generik terbukti berlaku juga di device family lain (bukan hanya 2 golden example awal) |
| Gap baru | — | **Gap #19**: ambiguitas mapping sheet "vaccine refrigerator" → `COLD_CHAIN` vs `KULKAS_VAKSIN` (Kategori B) |

**Dampak pada Verdict Eksekutif:** Tidak berubah dari 🟡 YELLOW — cross-check ini justru **menaikkan confidence** pada arsitektur generik (kini tervalidasi di 5 device type, bukan 2), sambil menambah 1 gap ambiguitas penamaan yang kecil scope-nya (tidak menyentuh kelayakan struktural).
