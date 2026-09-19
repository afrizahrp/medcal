# Phase 1.5 follow-up — Architecture plan (OPTION 2 / OPTION 4)

Tanggal: 2026-09-18  
Sumber: `phase-1.5-data-impact-audit-20260918.md` + penelusuran kode.  
**Tidak ada perubahan aplikasi pada dokumen ini.**

Legend:

| Label | Arti |
|---|---|
| **FACT** | Schema, kode, atau audit DB |
| **OBSERVATION** | Dampak yang mengikuti fakta |
| **DESIGN DECISION** | Keputusan yang sudah di-lock di prompt Phase 1.5 follow-up |
| **RECOMMENDATION** | Usulan; **belum** disetujui |

---

## 1. Current architecture

**FACT.** Nama model katalog adalah `DeviceCalibrationParameter`, bukan `CalibrationParameter`.

Alur pola pengukuran:

- Pattern A: `NUMBER` + `DIRECT_REPLICATES` + aktif + **nol** `CalibrationTestPoint` → API `parameters[]`.
- Pattern B: sama, tetapi **punya ≥1 test point aktif** → API `gridParameters[]` + daftar `testPoints` live.
- `LOGGER_SUMMARY` dan `SUCT_VACUUM_GAUGE` dikecualikan dari grid (allowlist).

**FACT.** `CalibrationTestPoint` adalah anak **katalog** (`deviceCalibrationParameterId`). Tidak ada tabel/kolom yang menyimpan salinan test point per `CalibrationJob`.

**FACT.** Snapshot yang sudah ada di job/result:

- Identitas alat di `CalibrationJob` (nama/AKD declared).
- Toleransi efektif di `MeasurementResult` (`effectiveToleranceMin/Max`, `appliedNominalValue`).
- `PhysicalCheckResult.inspectionLimitSnapshot`.

**FACT.** Tidak ada `catalogVersion`, `jobTestPoint`, atau filter `CalibrationTestPoint.createdAt` vs `CalibrationJob.createdAt`.

**DESIGN DECISION (locked):** schema tidak ditambah enum RANGE; snapshot/versioning **tidak** diimplementasikan tanpa approval terpisah.

---

## 2. Actual data flow

```
DeviceType
  → DeviceCalibrationParameter (katalog live)
      → CalibrationTestPoint (katalog live, opsional)
CalibrationJob (resolve deviceTypeId)
  → GET .../measurement-parameters  (baca katalog live → Pattern A vs B)
  → MeasurementResult (FK parameter wajib; FK test point nullable)
      → Tech-PWA list + entry (A: baris ulangan; B: grid titik × ulangan)
      → Portal quality review (daftar result + label TP dari katalog live)
      → LK PDF (template BSM env hard-coded; renderer generik juga baca katalog live)
```

**FACT.** `listMeasurementParameters` membagi A/B dengan query Prisma `testPoints: { none: {} }` vs `testPoints: { some: { isActive: true } }` pada **saat request**, tanpa mempertimbangkan usia job atau kapan test point dibuat.

**FACT.** Write path `MeasurementResultsService.loadCatalog` menerima `calibrationTestPointId` null **atau** id yang harus milik parameter itu. Tidak ada keharusan “parameter Pattern B wajib kirim test point”.

---

## 3. Files involved

| Peran | File |
|---|---|
| Schema | `packages/db/prisma/schema.prisma` |
| Migrasi TP | `packages/db/prisma/migrations/20260908025400_restructure_measurement_result_and_add_test_point/migration.sql` |
| Seed TP | `packages/db/prisma/seed-calibration-test-points.ts` (env **dieksklusi**) |
| Pattern A/B API | `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` |
| Submit | sama, `submitForReview` |
| Write result | `apps/api/src/modules/calibration-jobs/measurement-results.service.ts` |
| Toleransi | `measurement-tolerance.ts` |
| PDF BSM | `lk-templates/bed-side-monitor.ts`, `lk-template-data.ts` |
| PDF generik | `lk-download.service.ts` `buildCapabilitySections` |
| Tech-PWA | `measurement.ts`, `[parameterId]/page.tsx`, `measurement-grid.tsx`, `measurements/page.tsx`, `job-detail-ui.tsx` |
| Portal review | `apps/portal/.../calibration-jobs/[id]/page.tsx` |

---

## 4. Current behavior

**FACT (hari ini, tanpa seed env):**

- `BSM_ROOM_TEMP` / `_ROOM_HUMIDITY` / `_INPUT_VOLTAGE` tidak punya TP → Pattern A.
- Job `cmu0qm039001prv0ng7lp0fmv`: 2 hasil `BSM_ROOM_TEMP` NULL TP **dapat** ditampilkan dan diedit sebagai ulangan.
- Completeness UI Pattern A: ≥1 bacaan terisi. Pattern B: setiap **id** TP aktif punya ≥1 bacaan.
- Completeness **bukan** gate backend.

---

## 5. Historical-data behavior

**FACT.** 52/54 result `calibrationTestPointId` NULL. Makna: ulangan tanpa nama.

**DESIGN DECISION (locked):** OPTION 4 — tidak force-map, tidak infer `replicateIndex` → Awal/Akhir/L-N, tidak rewrite result, tidak membuat TP palsu hanya untuk menempel data lama.

**OBSERVATION.** UI **saat ini** menampilkan data historis env karena parameter masih Pattern A. Masalah “grid menyembunyikan NULL” **laten**: muncul **hanya jika** katalog mendapat TP aktif.

**RECOMMENDATION (belum di-lock):** jika suatu hari parameter pindah ke Pattern B, tampilkan hasil NULL sebagai blok “ulangan historis” terpisah (read-only atau tetap Pattern A untuk job lama), tanpa mengisi `calibrationTestPointId`. Itu solusi UI terkecil; **bukan** snapshot katalog.

---

## 6. Named-test-point behavior

**DESIGN DECISION (locked):** titik bernama = baris `CalibrationTestPoint` dengan `settingLabel` + `sequence` (contoh `Awal`, `Akhir`, `L-N`). Bukan enum. Konfigurasi katalog eksplisit untuk job **baru** (OPTION 2).

**FACT.** Label itu **belum ada** di DB. Seed saat ini tidak membuatnya.

**OBSERVATION.** Menambah baris katalog itu **cukup secara schema**, tetapi **langsung** mengubah Pattern B untuk **semua** job tipe alat itu, termasuk `IN_PROGRESS`.

---

## 7. Existing-job impact

**FACT.** Satu job aktif terdampak jika env di-seed sekarang: `cmu0qm039001prv0ng7lp0fmv` (`IN_PROGRESS`, 2× `BSM_ROOM_TEMP` NULL).

**OBSERVATION.** Tanpa isolasi per job:

1. Parameter pindah ke `gridParameters`.
2. Tech-PWA merender `MeasurementGridEntry` saja; `existingRows` NULL tidak dipakai.
3. Grid skip `calibrationTestPointId === null`.
4. Chip Pattern B: incomplete sampai teknisi mengisi Awal/Akhir baru (baris **baru**, natural key berbeda).
5. Dua makna bisa hidup berdampingan: ulangan historis NULL + titik bernama baru.

**DESIGN DECISION (locked):** dampak itu **tidak acceptable** tanpa desain eksplisit. Snapshot **jangan** diimplementasikan diam-diam.

---

## 8. PDF impact

**FACT.** `drawEnvironment` di LK BSM mencetak sel Awal/Akhir/L-N/L-G/N-G **kosong**; `firstValue` di-`void`. Komentar kode: tidak ada mapping schema.

**FACT.** Kinerja BSM memakai `replicatesFor(..., 5)` per setpoint (kolom I–V), terpisah dari env.

**FACT.** `buildCapabilitySections` (PDF hasil generik) juga membaca `testPoints` **live**. Jika katalog dapat TP, grouping result memakai kunci `parameterId:testPointId`; result NULL masuk bucket `:none`, sementara baris PDF per titik memakai `parameterId:tp.id` — **historis NULL tidak terisi ke sel titik bernama**.

**DESIGN DECISION (locked):** jangan ubah layout LK; jangan isi sel dengan tebakan `replicateIndex`.

---

## 9. submitForReview impact

**FACT.** Gate: status `IN_PROGRESS` + `startedAt` + alat acuan resolved. Tidak ada cek kelengkapan titik ukur atau jumlah ulangan.

**DESIGN DECISION (locked):** jangan ubah workflow ini diam-diam.

**RECOMMENDATION:** gate completeness Pattern B (semua TP aktif terisi) adalah keputusan produk terpisah, setelah OPTION 2 punya mekanisme job-scope.

---

## 10. Identified architectural gap(s)

**GAP 1 — katalog live vs OPTION 2 (utama).**  
OPTION 2 (“hanya job baru”) **tidak bisa** dijalankan hanya dengan INSERT `CalibrationTestPoint`. API/UI/PDF/completeness semua membaca katalog **sekarang**.

Mekanisme yang **belum** ada dan **belum** di-approve:

- snapshot TP per job, atau
- versi katalog, atau
- filter `testPoint.createdAt <= job.createdAt` / `>` cutoff, atau
- freeze Pattern A untuk job yang sudah punya result NULL pada parameter itu.

**GAP 2 — UI laten NULL vs Pattern B.**  
Grid tidak menampilkan result tanpa TP. Hari ini tidak pecah untuk env; pecah setelah seed.

**GAP 3 — PDF env vs katalog.**  
Bahkan jika job baru punya TP `Awal`/`L-N`, template BSM **tidak** mengikat `settingLabel` ke sel. Isi sel bernama adalah pekerjaan PDF terpisah (di luar task ini).

**GAP 4 — completeness hanya UI.**  
submitForReview tidak menegakkan Pattern B.

**Bukan gap:** schema `settingLabel`/`sequence` sudah cukup untuk semantik titik bernama. `replicateIndex` sudah cukup untuk ulangan.

---

## 11. Recommended minimal implementation

**RECOMMENDATION — Phase B task ini: tidak mengubah kode aplikasi.**

Alasan: setiap perubahan yang “mengaktifkan” titik bernama (seed) atau yang “mengisolasi job lama” (snapshot / createdAt / dual-renderer) **memerlukan keputusan yang belum di-lock**. STOP condition berlaku.

Yang **boleh** dilakukan nanti, setelah approval terpisah (urutan usulan, bukan implementasi):

1. **Jangan seed** `Awal`/`Akhir`/`L-N` sampai ada aturan job-scope.
2. Tetapkan satu mekanisme OPTION 2 (perlu keputusan — bagian STOP di bawah).
3. Baru seed katalog eksplisit (daftar code + label + sequence).
4. Opsional: UI “historis tanpa titik ukur” agar NULL tidak hilang jika job lama tetap melihat Pattern B.
5. PDF env mapping `settingLabel` → sel: task terpisah, hanya untuk result yang **sudah** punya TP, bukan tebakan historis.
6. submitForReview: task terpisah.

**Bukan rekomendasi:** backfill, OPTION 3, enum, migrasi schema untuk RANGE.

---

## 12. Files that would be changed

Jika (kelak) OPTION 2 + seed disetujui, kandidat **minimal** (belum dikerjakan):

| File | Alasan |
|---|---|
| `calibration-jobs.service.ts` `listMeasurementParameters` | Isolasi job lama vs katalog baru (**perlu desain**) |
| Tes `calibration-jobs.service.test.ts` | Perilaku A/B per job |
| `seed-calibration-test-points.ts` | Baris katalog eksplisit env (**setelah** isolasi) |
| Tech-PWA entry page / list / `measurement.ts` | Tampilkan result NULL di samping grid (**jika** job lama tetap B) |

---

## 13. Files that should NOT be changed (task ini)

- Prisma schema / migrasi baru
- Semua `MeasurementResult` / job di DB
- `submitForReview`
- `lk-templates/bed-side-monitor.ts` layout
- Inferensi `replicateIndex` di mana pun
- Portal quality review (kecuali ikut desain OPTION 2 nanti)
- Modul WO/quotation/RBAC/FCM

---

## Keputusan yang dibutuhkan sebelum coding (STOP)

Tidak di-lock oleh prompt; **wajib** dipilih sebelum seed atau filter API:

**D1. Mekanisme OPTION 2**

| Opsi | Efek | Catatan |
|---|---|---|
| A. Snapshot TP per job | Isolasi kuat | Schema/API baru; **dilarang** tanpa approval |
| B. Filter `createdAt` TP vs job | Tanpa tabel baru | Bukan snapshot penuh; TP yang di-edit/nonaktifkan tetap “live” |
| C. Jangan seed sampai semua job env selesai | Nol kode isolasi | Job `IN_PROGRESS` + PENDING tetap berisiko jika seed sebelum selesai |
| D. Seed sekarang + terima job lama jadi Pattern B | Melanggar OPTION 2 | Ditolak oleh lock |

**D2. Scope seed:** hanya `BSM_*` env, atau semua `*_ROOM_TEMP` / `*_ROOM_HUMIDITY` / `*_INPUT_VOLTAGE`.

**D3. Job `cmu0qm039001prv0ng7lp0fmv`:** tetap Pattern A sampai selesai, atau wajib isi titik bernama (tanpa mapping 2 ulangan lama).

**D4.** Completeness submit: tetap seperti sekarang, atau ditegakkan nanti.

**D5.** PDF env: tetap kosong sampai mapping `settingLabel` eksplisit.

---

## Phase B (task ini)

**NO CODE CHANGES.**  
Tidak ada seed, migrasi, backfill, snapshot, ubah PDF, atau ubah submitForReview.

Validasi yang dijalankan: penelusuran source (bukan tes regresi, karena tidak ada diff aplikasi).
