# Audit: Validasi Model Titik Ukur × Pengulangan

**Tanggal:** 2026-09-18  
**Mode:** READ-ONLY — tidak ada kode, skema, migrasi, API, atau UI yang diubah.  
**Scope:** Validasi arsitektur sebelum implementasi Generic Calibration Parameter Input Mode  
**Referensi sebelumnya:** Audit forensik Device Calibration Parameter + Tech-PWA (range / repetition)

---

## Legenda bukti

| Tag | Arti |
|---|---|
| **Fakta** | Ditemukan di kode / skema / dokumen |
| **Inferensi** | Kesimpulan arsitektur dari bukti |
| **Rekomendasi** | Usulan teknis, belum implementasi |
| **Keputusan produk (FINAL)** | Verdict yang tidak dibuka ulang |

---

## Keputusan produk yang FINAL (tidak dibuka ulang)

1. **Titik ukur wajib:** Jika parameter dikonfigurasi dengan titik ukur bernama (mis. Awal/Akhir, L-N/L-G/N-G, Low/High), **semua** titik yang dikonfigurasi sebagai wajib harus terisi. Teknisi tidak boleh menyelesaikan set pengukuran dengan salah satu titik kosong. Validasi harus **data-driven**, bukan `if label === "Awal"`.
2. **Pengulangan tidak hard-code:** Jangan hard-code default 5 atau 3, atau logic `VENT_` / `AUD_` / kode parameter. Mekanisme **“Tambah ulangan”** yang sudah ada harus tetap tersedia. Device boleh butuh kurang dari 5, tepat 5, atau lebih dari 5.

---

## Pertanyaan arsitektur yang dijawab

> Bagaimana titik ukur wajib dan pengulangan dinamis direpresentasikan agar device masa depan dapat mengonfigurasi pola ukurnya sendiri tanpa ubah kode aplikasi?

**Jawaban singkat:**

- **Titik ukur** = baris `CalibrationTestPoint` (label dari data: `settingLabel`; setpoint opsional: `settingValue`).
- **Wajib isi** = setiap test point **aktif** pada parameter itu (tanpa enum Awal/Akhir/RANGE). Gate kelengkapan: tiap test point aktif punya ≥ 1 `MeasurementResult` terisi (`measuredValue` atau `measuredText`) untuk attempt berjalan.
- **Pengulangan** = `MeasurementResult.replicateIndex` (≥ 1, tanpa max di DB/API). UI “Tambah ulangan” menambah index berikutnya.
- **Jangan** pakai default 5/3 di kode sebagai aturan bisnis.
- **Jangan** menambah enum `RANGE` — Awal/Akhir adalah dua titik bernama, bukan semantik matematis min/max/delta.

```
DeviceCalibrationParameter
  └── CalibrationTestPoint[]     // titik ukur; aktif = wajib isi (v1)
MeasurementResult
  ├── calibrationTestPointId?    // null hanya jika parameter memang tanpa titik
  └── replicateIndex             // pengulangan dinamis ≥ 1, tanpa max katalog
```

---

# A. Validated Domain Model

## A.1 Dua dimensi: Titik Ukur × Pengulangan

**Fakta.** Natural key `MeasurementResult` sudah:

```
(job, parameter, testPoint?, replicateIndex, attemptNumber, direction)
```

| Contoh | Titik ukur | Pengulangan | Representasi tanpa hard-code |
|---|---|---|---|
| Suhu Awal / Akhir | 2 test point, label data | 1 bacaan cukup; boleh tambah | `CalibrationTestPoint` + `replicateIndex` |
| Tegangan L-N / L-G / N-G | 3 test point | sama | sama |
| Heart Rate 30/60/120/180 BPM | 4 test point + `settingValue` | teknisi isi 1..N | sudah Pattern B |
| Device baru / unknown | N test point sembarang | N ulangan dinamis | hanya data katalog |

**Fakta.** Cross product TestPoint × Replicate **sudah sah** di database. Contoh seed: Min / Med / Max × I–V pada `CENT_SPEED` (`packages/db/prisma/seed-calibration-test-points.ts`).

**Rekomendasi.** Model yang dipertimbangkan valid **jika**:

1. Titik ukur = anak `CalibrationTestPoint` (bukan `replicateIndex` 1=Awal, 2=Akhir).
2. Pengulangan = `replicateIndex` dinamis.
3. `expectedReplicateCount` **tidak** dipakai sebagai aturan bisnis “harus N kolom” atau default sistem 5.

## A.2 Cross product (bahkan jika LK saat ini tidak butuh)

**Fakta.** Model data mendukung:

```
Temperature
  Start × 3 ulangan
  End   × 3 ulangan
```

Tanpa perubahan skema natural key. Grid Pattern B hari ini sudah merender titik × ulangan × (opsional) direction.

**Inferensi.** Aman untuk mendukung secara struktural; tidak perlu diimplementasikan untuk section lingkungan BSM sampai ada kebutuhan.

---

# B. Expected Replicate Count Semantics

## B.1 Audit hard-code yang ada

**Fakta.** Field katalog `expectedReplicateCount` **tidak ada** di Prisma. Semua angka 5/3 hanya di frontend Tech-PWA.

| Lokasi | Perilaku | Klasifikasi |
|---|---|---|
| `apps/tech-pwa/src/lib/calibration/measurement.ts` L251–268 | Komentar eksplisit: *tidak ada* expected count di katalog; UI seed I–V; job “never blocked”. `DEFAULT_REPLICATE_COUNT = 5`; prefix `VENT_` / `AUD_` → 3 | **Asumsi UI + artefak historis.** Angka 3 untuk VENT/AUD **bukan** rule backend; seed mencatat Excel ventilator memakai I–III |
| `expectedReplicateCount(code)` | `code.startsWith("VENT_"\|"AUD_")` | **Dilarang** oleh verdict produk |
| Pattern A `measurements/[parameterId]/page.tsx` | `rowCount = max(5, maxIndex) + extraRows`; tombol “+ Tambah ulangan” | UI seed 5, dinamis di atasnya |
| Pattern B `measurement-grid.tsx` | `colCount = max(expected, maxIndex) + extraCols`; “+ Tambah ulangan” | sama |
| `parameterEntryStatus` / `gridEntryStatus` | `total = max(default, maxIndex)` → “complete” butuh 5 (atau 3) | **Asumsi UI yang menyamar sebagai kelengkapan** |
| Zod `replicateIndex` | `.int().min(1)` saja | **tidak ada max** |
| SQL `MeasurementResult_replicateIndex_positive` | `CHECK (replicateIndex >= 1)` | **tidak ada max** |
| `submitForReview` | tidak cek kelengkapan pengukuran | **fakta** — gate wajib titik belum ada |
| LK template BSM | `replicatesFor(..., 5)` untuk kolom I–V kinerja | layout dokumen BSM, bukan aturan katalog |
| Seed Pulse Ox | LK menyebut I–**VI** | bukti bahwa 5 **bukan** universal |

## B.2 Makna NULL jika field ditambahkan

| Opsi | Penilaian |
|---|---|
| A. NULL = default replikasi sistem (mis. 5) | **Tolak** — melanjutkan hard-code tersembunyi |
| B. NULL = ulangan teknisi / tanpa kuota | **Cocok** dengan “Tambah ulangan” + verdict produk |
| C. NULL = legacy only | Boleh sebagai catatan migrasi, bukan semantik jangka panjang |
| D. Jangan tambah field | **Rekomendasi terbersih** untuk v1 |

## B.3 Rekomendasi semantik

**Rekomendasi:**

- **Tidak wajib** menambah `expectedReplicateCount` untuk v1.
- Kelengkapan **bukan** “isi N ulangan”.
- Kelengkapan **adalah** “setiap test point wajib terisi ≥ 1 bacaan”.
- UI: mulai 1 slot kosong per titik (bukan 5); “Tambah ulangan” menaikkan `replicateIndex`.
- Jika nanti butuh “tampilkan N kolom kosong seperti LK kinerja”, itu field **presentasi** opsional terpisah (mis. `initialReplicateSlots`), nullable, default **1 atau 0**, **bukan** 5 di kode, **bukan** syarat submit.

## B.4 Kepemilikan konfigurasi

**Rekomendasi:** Jika suatu saat field presentasi jumlah kolom awal ditambahkan, pemiliknya adalah **`DeviceCalibrationParameter`**, bukan:

| Bukan di | Alasan |
|---|---|
| `Device` (instance) | Pola milik jenis prosedur / katalog, bukan serial unit |
| `DeviceType` saja | Terlalu kasar; parameter berbeda dalam satu DeviceType punya pola berbeda |
| `DeviceCapabilityItem` | Global; tidak semua DeviceType memakai item yang sama dengan slot yang sama |
| `CalibrationTestPoint` | R sama untuk semua titik satu parameter (grid hari ini) |
| `MeasurementResult` | Hasil, bukan konfigurasi |
| Tech-PWA hard-code | Melanggar verdict produk |

**Replikasi tidak di-own oleh `CalibrationTestPoint`.** Satu R (atau dinamika ulangan) per parameter induk.

---

# C. CalibrationTestPoint Semantics

## C.1 Apakah cukup generik?

**Fakta.** Model punya:

- `settingLabel` (wajib, unique per parameter)
- `settingValue` (opsional Decimal)
- override toleransi opsional (`toleranceMin` / `toleranceMax` / `toleranceNote`; NULL = warisi induk)
- `sequence`, `isActive`

Sudah dipakai untuk:

- setpoint numerik Pattern B (`"30 BPM"`, `settingValue: 30`)
- slot bernama Pattern D (`Min` / `Med` / `Max`, `Rendah` / `Sedang` / `Tinggi`)
- slot generik (`Titik ukur N`)

**Rekomendasi.** Cukup untuk Awal, Akhir, L-N, L-G, N-G, Low, Nominal, High, dan label masa depan. **Tanpa** enum label. **Tanpa** field baru untuk semantik titik.

`settingLabel` + `settingValue` sudah cukup. Jangan menambah field sebelum ada gap nyata.

## C.2 Titik ukur wajib (data-driven)

**Keputusan produk (FINAL):** semua titik yang dikonfigurasi wajib harus terisi; jangan hard-code label.

| Opsi | Keterangan |
|---|---|
| **1. Semua `CalibrationTestPoint` aktif = wajib** | Tanpa kolom baru. `isActive` sudah ada; API sudah filter `isActive: true`. **Rekomendasi v1.** |
| 2. Tambah `isRequired` generik | Hanya jika nanti ada slot opsional di dalam parameter yang sama. |

**Validasi:** loop test point aktif → pastikan ada reading terisi. Bukan:

```ts
if (label === "Awal") ...
if (label === "Akhir") ...
```

Parameter lingkungan contoh (konfigurasi data, bukan logika app):

- Suhu: 2 child aktif → keduanya wajib.
- Tegangan: 3 child aktif → ketiganya wajib.
- Parameter tanpa child: tidak ada himpunan titik wajib; ulangan tetap dinamis; jangan memaksa 5.

---

# D. ReplicateIndex Semantics

## D.1 Arti domain

| Bukan | Adalah |
|---|---|
| `attemptNumber` (siklus REWORK / revisi) | Ulangan **pada titik yang sama** (atau pada parameter jika `calibrationTestPointId` NULL) |
| `direction` UP / DOWN | Facet terpisah di natural key |
| “satu-satunya bacaan parameter” | 1-based trial number (LK kolom I, II, III, …) |

## D.2 Pemakaian lintas lapisan

| Lapisan | Perilaku |
|---|---|
| Schema / DB | `Int` ≥ 1; bagian natural key; tanpa upper bound |
| Backend create/batch | Menerima `replicateIndex` dari client; tidak membatasi max |
| Toleransi | Dievaluasi **per row**; tidak agregat antar index |
| Tech-PWA Pattern A | Index = “Ulangan {n}”; Tambah ulangan = +1 row |
| Tech-PWA Pattern B | Index = kolom grid; Tambah ulangan = +1 kolom |
| Portal QA | Kolom “Pengulangan” = angka index |
| PDF BSM kinerja | Mengisi kolom I–V dari index 1–5; index > 5 tidak muat geometri template (batasan layout, bukan constraint DB) |
| PDF env BSM | Saat ini **tidak** mengisi Awal/Akhir dari hasil |

## D.3 Tabrakan semantik yang harus dihindari

**Jangan** memakai `replicateIndex` 1/2 sebagai Awal/Akhir. Itu **titik ukur** (`CalibrationTestPoint`), bukan ulangan.

## D.4 Perilaku “Tambah ulangan” (bukti penting)

**Fakta:**

- Pattern A: `extraRows` state → menambah baris.
- Pattern B: `extraCols` state → menambah kolom.
- Tidak ada maksimum di frontend atau backend.
- Save: hanya cell yang terisi / dirty yang dikirim (partial save OK).
- Status “complete” saat ini mengasumsikan total = max(5 atau 3, maxIndex) — ini **salah arah** terhadap verdict produk dan harus diganti menjadi “semua titik wajib terisi”.

---

# E. RANGE Requirement Analysis

**Keputusan produk (FINAL) + bukti audit:**

- Awal / Akhir adalah **dua titik ukur bernama**, bukan batas matematis range.
- Tidak ada bukti di LK / kode bahwa sistem harus menghitung min, max, delta, span, lower/upper bound dari pasangan Awal–Akhir.
- Engine toleransi menilai **per bacaan** terhadap bounds parameter (atau override per test point).
- `LOGGER_SUMMARY` min/max adalah pola **logger penyimpanan**, bukan Awal/Akhir sesi kalibrasi.

**Rekomendasi:** **Jangan** memperkenalkan enum / mode `RANGE` ke domain model. Kebutuhan saat ini = **A (titik ukur) + B (pengulangan)**. Tidak ada kebutuhan terkonfirmasi untuk **C (range matematis)**.

Pisahkan konsep:

| Konsep | Contoh | Dibutuhkan sekarang? |
|---|---|---|
| A. Measurement Point | Awal/Akhir, L-N/L-G/N-G, Min/Med/Max | **Ya** |
| B. Replication | Pengulangan 1, 2, 3, … | **Ya** (dinamis) |
| C. Mathematical Range | lower/upper/span/delta | **Tidak** (tidak ada bukti) |

---

# F. Backward Compatibility

| Aspek | Perilaku yang diusulkan |
|---|---|
| Parameter tanpa test point | Tetap valid; UI berhenti seed 5 ulangan → 1 slot + Tambah ulangan (**perubahan UX sadar**, sesuai verdict) |
| Pattern B existing | Tetap; sumber “expected columns” diganti dari prefix kode ke `1 + max(tersimpan) + extra` |
| Hasil lama `calibrationTestPointId = NULL` | Tidak otomatis jadi Awal/Akhir. Backfill = keputusan implementasi terpisah |
| API create/batch | Kontrak sudah mendukung `calibrationTestPointId` + `replicateIndex` |
| `submitForReview` hari ini | **Tidak** menolak pengukuran kosong — gate wajib titik **belum ada** dan harus ditambahkan agar verdict produk tegak |
| Copy parameter portal | Saat ini **tidak** menyalin test point — risiko jika admin mengandalkan copy untuk env |

---

# G. Remaining Risks

1. Template PDF BSM tetap 5 kolom untuk kinerja — itu layout dokumen, bukan alasan mempertahankan hard-code 5 di Tech-PWA.
2. Pulse Ox I–VI vs template 5 kolom: renderer generik vs template kaku.
3. Tanpa gate di `submitForReview`, teknisi tetap bisa kirim job dengan Awal kosong — melanggar verdict produk.
4. Memberi test point ke parameter lingkungan **tanpa** mengubah UI Pattern B akan memunculkan grid 2×5 / 3×5 — ubah renderer harus bersamaan atau lebih dulu.
5. Copy parameter tidak menyalin child test point.
6. `usesDirection("SPHYG_PRESSURE_ACC")` masih hard-code kode — di luar scope wajib, tetapi pola anti-pattern yang sama.
7. Data hasil lingkungan live dengan `testPointId = NULL` belum diaudit jumlahnya — backfill bisa rumit.

---

# H. Final Recommendation

**Setujui model dua dimensi. Tolak RANGE. Tolak memakai replicateIndex sebagai saluran.**

```
DeviceCalibrationParameter
  └── CalibrationTestPoint[]     // titik ukur; aktif = wajib isi (v1)
MeasurementResult
  ├── calibrationTestPointId?
  └── replicateIndex             // pengulangan dinamis ≥ 1, tanpa max
```

**Jangan** menambah `expectedReplicateCount` sebagai aturan bisnis di v1.  
**Hapus** (pada tahap implementasi) `DEFAULT_REPLICATE_COUNT`, prefix `VENT_` / `AUD_`, dan logic complete berbasis n/5.

**Validasi:**

- Sebelum submit job (minimum): setiap `CalibrationTestPoint` aktif punya ≥ 1 reading terisi (`measuredValue` atau `measuredText` non-kosong) untuk attempt berjalan.
- Ulangan tambahan bersifat opsional.
- Incremental save per cell tetap boleh.
- Tidak ada logic berbasis string label titik.

---

# I. Implementation Prerequisites

**Belum diimplementasikan.** Jika model disetujui, urutan yang disarankan:

1. **Seed data** — tambah `CalibrationTestPoint` untuk parameter lingkungan yang di LK punya slot bernama (label dari data). Tanpa `if (code === "BSM_…")` di app logic.
2. **Tech-PWA renderer** — jika ada test point: N field berlabel; 1 slot ulangan awal + “Tambah ulangan”; status complete = semua titik aktif terisi, bukan n/5.
3. **Backend gate** — `submitForReview` menolak jika ada test point aktif tanpa reading (plus keputusan: apakah Simpan set parameter juga dikunci).
4. **PDF lingkungan** — isi sel dari `settingLabel` + hasil; hapus `void firstValue` di template BSM.
5. **Jangan** migrasi enum RANGE; **jangan** field `expectedReplicateCount` kecuali diputuskan sebagai seed UI presentasi terpisah.
6. **Backfill** hasil env lama (`testPointId` NULL) — keputusan terpisah setelah audit data live.

### Keputusan produk yang masih terbuka (bukan mengulang yang FINAL)

| # | Pertanyaan | Catatan |
|---|---|---|
| 1 | Gate wajib hanya di `submitForReview`, atau juga mengunci tombol Simpan set parameter? | Verdict wajib titik sudah final; **lokasi gate** belum |
| 2 | Apakah v1 cukup “semua test point aktif = wajib”, atau butuh `isRequired` segera? | Rekomendasi audit: v1 = semua aktif wajib |
| 3 | Kebijakan backfill hasil lingkungan historis | Bukan blocker model |

---

## Ringkasan eksekutif

| Topik | Verdict audit |
|---|---|
| Model Titik × Ulangan | **Valid** — sudah didukung skema |
| `CalibrationTestPoint` untuk Awal/L-N/Min/… | **Cukup** — `settingLabel` generik |
| Enum / mode RANGE | **Jangan diperkenalkan** |
| Hard-code 5 / 3 / VENT_ / AUD_ | **Artefak UI** — harus dihapus saat implementasi |
| `expectedReplicateCount` wajib di v1? | **Tidak** — kecuali nanti hanya untuk seed kolom UI |
| Titik wajib | **Data-driven** via test point aktif + gate submit |
| Tambah ulangan | **Pertahankan** — dinamis, tanpa max katalog |
| Cross product titik × ulangan | **Sudah aman** di natural key |

---

## File bukti utama (tidak diubah)

- `packages/db/prisma/schema.prisma` — `DeviceCalibrationParameter`, `CalibrationTestPoint`, `MeasurementResult`
- `packages/db/prisma/seed-calibration-test-points.ts`
- `packages/shared/src/schemas/index.ts` — `measurementResultCreateSchema`
- `apps/tech-pwa/src/lib/calibration/measurement.ts` — `DEFAULT_REPLICATE_COUNT`, `expectedReplicateCount`
- `apps/tech-pwa/src/app/jobs/[id]/measurements/[parameterId]/page.tsx`
- `apps/tech-pwa/src/app/jobs/[id]/measurements/measurement-grid.tsx`
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` — `listMeasurementParameters`, `submitForReview`
- `apps/api/src/modules/calibration-jobs/lk-templates/bed-side-monitor.ts` — `drawEnvironment`

---

**STOP.** Laporan ini hanya dokumentasi audit. Tidak ada implementasi yang dijalankan bersama penulisan file ini.
