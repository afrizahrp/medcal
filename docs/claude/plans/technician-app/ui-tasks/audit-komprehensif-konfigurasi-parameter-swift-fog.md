# Audit: Konfigurasi Parameter Kalibrasi L-N / L-G / N-G pada Bed Side Monitor (BSM)

## Context

Sertifikat S.638 (BSM BIPMED BPM-301-02, serial BPM2-VII260003) mencatat tiga
pembacaan tegangan pada bagian "Kondisi Ruangan": L-N = 225,3 Vac, L-G = 226,0
Vac, N-G = 0,6 Vac. Di UI teknisi, N-G dievaluasi **"Tidak sesuai"**. Tujuan
audit ini (read-only, tanpa implementasi) adalah menentukan akar penyebab
sebenarnya dengan membandingkan source code, database dev/local yang sedang
dipakai `pnpm dev`, dan seluruh isi PDF S.638 — lalu memetakan opsi desain dan
rekomendasi, tanpa mengeksekusi perubahan apa pun.

Investigasi dilakukan lewat dua eksplorasi paralel read-only: (1) source code
arsitektur parameter/tolerance/conformity, dan (2) query read-only ke
database dev (`pkmdb` di `localhost:5432`, dikonfirmasi lewat Prisma Client
milik proyek, tidak ada `INSERT/UPDATE/DELETE` yang dijalankan).

---

## 1. Existing Architecture / Data Flow

Model Prisma relevan (`packages/db/prisma/schema.prisma`):

| Model | Peran | Field tolerance |
|---|---|---|
| `DeviceCalibrationParameter` (baris 1401) | Parameter master/global, scoped ke `DeviceType` + `DeviceCapabilityItem`. **Tidak** ada `deviceModelId`/`companyId` — ada komentar eksplisit di schema: *"Do not FK DeviceModel or Device to these models this phase."* | `toleranceMin`, `toleranceMax`, `toleranceNote` (nullable) |
| `CalibrationTestPoint` (baris 2530) | Named measurement point, anak opsional dari satu `DeviceCalibrationParameter` | `toleranceMin/Max/Note` — didokumentasikan eksplisit di schema sebagai **"OPTIONAL PER-POINT OVERRIDE: NULL = inherit the parent DeviceCalibrationParameter's bounds"** |
| `JobCalibrationTestPoint` (baris 2565) | Snapshot beku satu `CalibrationTestPoint` pada saat job `start()` | Salinan `toleranceMin/Max/Note` |
| `MeasurementResult` (baris 2595) | Satu hasil ukur aktual | `effectiveToleranceMin/Max` (snapshot batas yang benar-benar dipakai, dibekukan agar edit katalog di masa depan tidak mengubah verdict yang sudah tersimpan), `isWithinTolerance` |

Mesin resolusi tolerance: `apps/api/src/modules/calibration-jobs/measurement-tolerance.ts`,
fungsi `resolveEffectiveTolerance()` (baris 146–214), urutan prioritas
(didokumentasikan baris 4–21):
1. `CalibrationTestPoint.toleranceMin/Max` jika terisi → pakai (override per-point).
2. else `DeviceCalibrationParameter.toleranceMin/Max` jika terisi → pakai (fallback parameter).
3. else parse pola `± delta` / `± N%` / `Min…Max` dari `toleranceNote`.
4. else tidak terselesaikan, bounds tetap NULL.

Dipanggil dari `apps/api/src/modules/calibration-jobs/measurement-results.service.ts`
(`create`, `createMany`, `update`). UI teknisi (`apps/tech-pwa/src/lib/calibration/measurement.ts`,
`passFailChip()`) **tidak menghitung ulang** tolerance — ia hanya menampilkan
`isWithinTolerance` yang sudah dihitung server sebagai "Sesuai"/"Tidak sesuai"/"Perlu telaah".

Mekanisme override per-point ini **bukan hipotesis** — sudah dipakai untuk
parameter lain (dikutip di doc-comment schema: `SUCT_MAX_VACUUM`, `INCU_AIR_TEMP`)
dan sudah punya UI admin-nya di Portal
(`apps/portal/.../calibration-test-point-form-fields.tsx:83-116`, field
"Toleransi Minimum"/"Toleransi Maksimum" per test point).

Tidak ditemukan model `JobApplicableParameter` atau mekanisme snapshot
parameter lain di mana pun dalam codebase — invariant Phase 4 ("No
JobApplicableParameter unless explicitly approved", "No parameter snapshot
unless explicitly approved") **masih utuh**.

---

## 2. Konfigurasi Aktual BSM dari Database (live dev DB, read-only)

Untuk `DeviceType` **Bed Side Monitor** (`code: BED_SIDE_MONITOR`), hanya ada
**satu** `DeviceCalibrationParameter` yang mencakup L-N/L-G/N-G sekaligus:

```
code:          BSM_INPUT_VOLTAGE
name:          "Tegangan Input"
capabilityItem:"Tegangan Input (L-N/L-G/N-G)"  (capability: ENVIRONMENTAL_CONDITIONS)
toleranceMin:  198
toleranceMax:  242
toleranceNote: "220 ± 10% Volt"
uom:           V
entryStyle:    DIRECT_REPLICATES
testPoints:    []   ← KOSONG di database dev saat ini
```

**Catatan penting — discrepancy source code vs database:**
`packages/db/prisma/seed-calibration-test-points.ts:529-535` sebenarnya SUDAH
mendefinisikan 3 `CalibrationTestPoint` (L-N, L-G, N-G) untuk
`BSM_INPUT_VOLTAGE` lewat helper `namedSlots(["L-N", "L-G", "N-G"])` — tapi
query langsung ke database dev menunjukkan `testPoints: []` (nol baris).
Artinya seed ini **belum pernah dijalankan** terhadap database dev yang
sekarang dipakai `pnpm dev`, atau datanya sempat direset. Ini bukan bug desain
— ini adalah gap antara kode yang sudah ditulis dan state database lokal saat
ini. Perlu klarifikasi tim sebelum langkah implementasi apa pun (lihat bagian
"Open Question").

Job/sertifikat S.638 (serial `BPM2-VII260003`) **tidak ada** di database dev
ini — `Device` count = 0, `Certificate` count = 0 (dicari dengan berbagai
variasi nomor sertifikat, serial, dan brand "BIPMED", semua nihil). Database
ini punya 5 `CalibrationJob` seed generik (`deviceId = null`) dan 52
`MeasurementResult`. Mekanisme yang sama tetap teramati langsung: setiap
`MeasurementResult` untuk parameter `*_INPUT_VOLTAGE` apa pun (mis.
`BPM_INPUT_VOLTAGE`, `MREF_INPUT_VOLTAGE`) di semua replicate membawa
`effectiveToleranceMin=198`/`effectiveToleranceMax=242` yang identik,
termasuk satu pembacaan `175` yang langsung ditandai `isWithinTolerance:false`.
Ini mengonfirmasi: parameter tanpa `CalibrationTestPoint` anak akan
mencap satu tolerance tunggal ke SEMUA replicate reading di bawahnya, apa pun
makna fisik replicate itu (L-N, L-G, atau N-G).

---

## 3. Bagaimana Tolerance Inheritance Bekerja (desain vs realita data)

**Desain (sesuai schema + seed script):** parameter boleh punya
`CalibrationTestPoint` anak bernama; tiap anak boleh override tolerance-nya
sendiri; NULL pada anak berarti inherit dari tolerance parameter induk.
Ini persis mekanisme yang seharusnya menangani kasus L-N/L-G/N-G.

**Realita di database dev saat ini:** untuk `BSM_INPUT_VOLTAGE` — dan
identik untuk **48 baris** `DeviceCalibrationParameter` lain di seluruh
katalog device type yang berbagi capability item "Tegangan Input
(L-N/L-G/N-G)" — tidak ada `CalibrationTestPoint` anak sama sekali. Karena
tidak ada struktur sub-point yang membedakan L-N/L-G/N-G, setiap reading yang
dicatat di bawah satu parameter ini otomatis mewarisi SATU tolerance band
(198–242V) yang sebenarnya hanya bermakna untuk L-N.

---

## 4. Mengapa N-G = 0,6 Menjadi "Tidak Sesuai"

Penyebab langsung: N-G dicatat sebagai replicate/reading biasa di bawah satu
parameter `BSM_INPUT_VOLTAGE` yang membawa tolerance 198–242V (220V ± 10%,
dimaksudkan untuk L-N). Nilai 0,6V jauh di luar rentang itu →
`isWithinTolerance = false` → UI menampilkan "Tidak sesuai".

**Ini BUKAN bug pada algoritma resolusi tolerance.** `resolveEffectiveTolerance()`
bekerja persis sesuai desainnya: fallback ke tolerance parameter saat tidak
ada override per-point. Masalahnya adalah **gap konfigurasi/data**: L-N, L-G,
N-G adalah tiga besaran fisik berbeda (L-N ≈ 225V, L-G ≈ 226V — mirip L-N,
N-G ≈ 0–1V — mendekati nol) yang saat ini digabung jadi satu parameter dengan
satu tolerance band, padahal lembar kerja sumber tidak memperlakukan
ketiganya secara sama.

---

## 5. Apakah Behavior Ini Sesuai dengan Kebutuhan Dokumen S.638?

**Tidak sesuai.** Bukti dari PDF (berlaku di semua versi LK — halaman 1, 7,
10-11, 51-53):

- Pada tabel "C. Pengukuran Kondisi Lingkungan", baris "Tegangan" punya tiga
  sub-baris L-N / L-G / N-G. Kolom **Toleransi** hanya terisi "± 10 %Vac"
  yang secara kontekstual melekat pada baris L-N. Baris L-G dan N-G di tabel
  yang sama **tidak punya angka toleransi** — ini adalah desain asli lembar
  kerja, bukan kelalaian input data kalibrasi: L-G dan N-G memang tidak
  dimaksudkan untuk dievaluasi pass/fail terhadap ±10% dari 220V.
- Pada Sertifikat Kalibrasi resmi (halaman 60-67), "Sumber Tegangan L-N:
  225,3 Vac" hanya muncul di Bagian B "Kondisi Ruangan" sebagai catatan
  kondisi lingkungan/administratif — **bukan** di Bagian E "Pengukuran
  Keselamatan Listrik" atau Bagian F "Pengukuran Kinerja" yang memuat
  parameter-parameter yang benar-benar dinilai pass/fail (Resistansi
  Pembumian, Resistansi Isolasi, Arus Bocor, Heart Rate, Respirasi, SpO2,
  NIBP). L-G dan N-G bahkan tidak muncul sama sekali di sertifikat akhir.

**Kesimpulan:** L-N/L-G/N-G pada dasarnya adalah pembacaan lingkungan/
informatif, dan hanya L-N yang punya target toleransi numerik eksplisit di
dokumen sumber. Memperlakukan N-G (dan L-G) seolah tunduk pada target ±10%
yang sama seperti L-N, lalu menampilkannya sebagai "Tidak sesuai" layaknya
uji conformity yang digradasi, tidak sejalan dengan maksud dokumen.

---

## 6. Dampak terhadap Device/Model Lain

**Sistemik, bukan spesifik BSM.** 48 baris `DeviceCalibrationParameter` di
hampir seluruh device type katalog (Audiometer, Autoclave, Blood Pressure
Monitor, CPAP, ECG, Infant Warmer, Patient Monitor, Ventilator, dst.) berbagi
pola identik: satu baris per device type, masing-masing membawa
`toleranceMin=198`/`toleranceMax=242`/`toleranceNote="220 ± 10% Volt"` untuk
capability item "Tegangan Input (L-N/L-G/N-G)", dan (dikonfirmasi lewat
query) **nol** `CalibrationTestPoint` anak untuk semuanya.

- Mengubah baris BSM saja **tidak** langsung memengaruhi 47 baris lain
  (masing-masing punya id independen, tidak ada relasi shared row).
- Namun gap arsitektural yang sama (satu parameter, satu tolerance, tiga
  sub-reading berbeda fisik) ada secara identik di seluruh katalog. Perbaikan
  struktural apa pun (mengisi `CalibrationTestPoint` dengan override
  per-point) perlu diterapkan per device type — baik satu per satu maupun
  lewat backfill script berulang — agar cacat yang sama tidak tertinggal di
  47 device type lainnya yang memakai capability item ini.

---

## 7. Opsi Desain dan Trade-off

**A. Shared/master parameter tanpa perubahan (status quo)**
Tetap satu parameter, satu tolerance untuk L-N/L-G/N-G.
*Trade-off:* paling sederhana (tanpa perubahan schema/data), tapi
melanggengkan "Tidak sesuai" palsu pada N-G (dan kemungkinan L-G) di setiap
device type yang memakai capability item ini — tidak sesuai bukti S.638.

**B. Device/model-specific configuration**
Memberi setiap `DeviceModel` salinan parameter tegangannya sendiri.
*Trade-off:* **tidak didukung arsitektur saat ini** — `DeviceModel` secara
eksplisit TIDAK punya FK ke `DeviceCalibrationParameter` (ada komentar di
schema: "Do not FK DeviceModel or Device to these models this phase"). Juga
tidak relevan dengan akar masalah — perbedaan L-N vs N-G adalah soal
**identitas titik ukur** (measurement point), bukan soal model/brand alat
yang diuji. Menambah scoping per-model adalah perubahan arsitektur besar yang
tidak proporsional terhadap gap yang ada, dan berisiko melanggar invariant
Phase 4 ("preserve existing architectural invariants", "No JobApplicableParameter
unless explicitly approved").

**C. Isi override `CalibrationTestPoint` untuk L-G/N-G (dan opsional L-N)**
Memakai mekanisme per-point override yang **sudah ada, sudah dibangun penuh,
dan sudah terhubung** (field nullable `toleranceMin/Max/Note` di
`CalibrationTestPoint`, sudah dibaca lebih dulu oleh `resolveEffectiveTolerance()`,
sudah punya UI admin di Portal).
*Trade-off:* murni perubahan **data** (seed/backfill script + eksekusi ke DB
target), tanpa perubahan schema atau service-layer code; sejalan dengan
preseden yang sudah dipakai untuk `SUCT_MAX_VACUUM`/`INCU_AIR_TEMP`; scoped
tepat ke titik yang memang butuh perlakuan beda. Memerlukan: (i) memastikan 3
`CalibrationTestPoint` (L-N, L-G, N-G) benar-benar ada di bawah
`BSM_INPUT_VOLTAGE` (menjalankan/mengonfirmasi seed yang sudah ditulis di
`seed-calibration-test-points.ts`), lalu (ii) menetapkan tolerance yang tepat
untuk L-G/N-G (perlu keputusan bisnis eksplisit — lihat Open Question),
sambil L-N tetap inherit atau di-override eksplisit ke 220±10%. Harus
diterapkan per device type ke 48 baris yang berpola sama (atau subset yang
memang relevan).

---

## 8. Rekomendasi

**Opsi C** adalah satu-satunya opsi yang konsisten dengan:
- Arsitektur yang ada (invariant terjaga: `CalibrationTestPoint`, tolerance
  architecture tidak berubah, tidak ada `JobApplicableParameter`/parameter
  snapshot baru).
- Bukti di S.638 (hanya L-N yang punya target toleransi numerik eksplisit di
  dokumen sumber).
- Preseden yang sudah ada (`SUCT_MAX_VACUUM`/`INCU_AIR_TEMP` sudah memakai
  mekanisme persis ini).

Opsi ini **tidak memerlukan perubahan schema Prisma maupun service-layer
code** — hanya konfigurasi data (baris test point + field tolerance-nya),
lewat UI admin Portal yang sudah ada atau backfill script terarah serupa
`backfill-device-calibration-parameter-tolerances.ts`.

---

## 9. Perubahan yang Benar-benar Diperlukan vs Tidak

**Diperlukan** (jika/ketika diputuskan untuk diimplementasikan — di luar
scope audit ini):
- Data: pastikan 3 `CalibrationTestPoint` (L-N, L-G, N-G) ada di bawah
  `BSM_INPUT_VOLTAGE` — kode seed-nya sudah ditulis, tinggal dikonfirmasi/
  dijalankan terhadap DB target.
- Data: set `toleranceMin/Max/Note` pada test point L-G dan N-G sesuai
  keputusan bisnis yang perlu dikonfirmasi lebih dulu.
- Kemungkinan perlu direplikasi ke sebagian/seluruh 47 device type lain yang
  berbagi pola sama, tergantung apakah mereka juga punya sub-reading
  L-N/L-G/N-G dengan masalah serupa.

**TIDAK diperlukan:**
- Perubahan schema Prisma (field yang dibutuhkan sudah ada).
- Perubahan `resolveEffectiveTolerance()` atau service layer lain (logic
  sudah benar — hanya kekurangan data).
- Penambahan device/model-scoping baru atau `JobApplicableParameter`
  (di luar scope, berisiko melanggar invariant Phase 4).
- Migration schema baru.

---

## Open Question — Perlu Klarifikasi Sebelum Implementasi

1. **Discrepancy seed vs DB:** `seed-calibration-test-points.ts` sudah
   mendefinisikan 3 test point (L-N/L-G/N-G) untuk BSM, tapi database dev
   yang dipakai `pnpm dev` saat ini menunjukkan `testPoints: []` (kosong).
   Apakah seed ini memang belum pernah dijalankan di lingkungan ini, atau
   sempat direset? Ini perlu dipastikan tim sebelum melangkah lebih jauh,
   karena menentukan apakah langkah pertama cukup "jalankan seed yang sudah
   ada" atau perlu penyesuaian lain.
2. **Aturan bisnis untuk N-G dan L-G:** apakah keduanya memang seharusnya
   tanpa toleransi numerik (informational only / tidak dievaluasi pass-fail
   sama sekali), atau punya ambang batasnya sendiri (misal N-G ≤ 1 Vac)?
   Dokumen S.638 tidak secara eksplisit menyatakan nilai ambang untuk L-G/N-G,
   hanya menunjukkan bahwa keduanya tidak memakai ±10% milik L-N.

---

## Verifikasi Audit Ini

Semua temuan berbasis:
- Baca langsung `packages/db/prisma/schema.prisma` (model & baris yang
  dikutip di atas).
- Baca langsung `apps/api/src/modules/calibration-jobs/measurement-tolerance.ts`
  dan `measurement-results.service.ts`.
- Baca langsung `apps/tech-pwa/src/lib/calibration/measurement.ts` dan
  halaman UI pengukuran terkait.
- Baca langsung `packages/db/prisma/seed-device-calibration-parameters.ts`,
  `seed-calibration-test-points.ts`, `backfill-device-calibration-parameter-tolerances.ts`.
- Query read-only langsung ke database dev (`pkmdb`) via Prisma Client milik
  proyek — tidak ada tulis/insert/update/delete/migration/seed dijalankan.
- Seluruh 67 halaman PDF S.638 (LK, laporan, sertifikat, uncertainty
  worksheet) yang dilampirkan di percakapan.

Tidak ada perubahan kode, schema, migration, seed, atau data yang dilakukan
selama audit ini.
