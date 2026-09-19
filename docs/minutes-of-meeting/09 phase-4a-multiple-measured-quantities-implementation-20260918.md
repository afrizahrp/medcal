# PHASE 4A — MULTIPLE MEASURED QUANTITIES

## IMPLEMENTATION REPORT

**Tanggal:** 2026-09-18
**Scope:** Gap A dari Report 08 — beberapa besaran terukur dalam satu logical test
**Arsitektur digunakan:** A3 (Report 08 §2.4) — pemecahan parameter + metadata pengelompokan katalog
**Status:** Implemented

Sumber:

- `08 phase-4-measurement-domain-architecture-20260918.md` (baseline arsitektur)
- `PHASE 4A — MULTIPLE MEASURED QUANTITIES.md` (instruksi implementasi)

---

## 1. Ringkasan

Menambahkan dua kolom nullable pada `DeviceCalibrationParameter` — `logicalTestKey` dan `logicalTestSequence` — sebagai metadata katalog/penyajian murni. Setiap besaran terukur (kV, waktu eksposur, mGy pada satu eksposur Dental X-Ray; stage dan okuler pada satu pembesaran Mikroskop) tetap menjadi baris `DeviceCalibrationParameter` sendiri dengan satuan, toleransi, dan verdict masing-masing — mengikuti pola yang sudah dipakai sistem (`_KANAN/_KIRI`, `_ON/_OFF`). Kedua kolom baru hanya menyatakan "parameter-parameter ini satu logical test, dicetak dalam urutan ini".

**Tidak diubah:** natural key `MeasurementResult`, `CalibrationTestPoint`, `JobCalibrationTestPoint`, semantik `replicateIndex`/`direction`/`referenceValue`, arsitektur toleransi, dan arsitektur completeness. A3 terbukti cukup — tidak ada blocker yang memaksa perubahan identitas `MeasurementResult`.

---

## 2. Files Changed

| Layer | File | Perubahan |
|---|---|---|
| Schema | `packages/db/prisma/schema.prisma` | + `logicalTestKey String?`, `logicalTestSequence Int?` pada `DeviceCalibrationParameter`; `@@unique([deviceTypeId, logicalTestKey, logicalTestSequence])`; index tambahan |
| Migrasi | `packages/db/prisma/migrations/20260918180000_add_logical_test_grouping_to_calibration_parameter/migration.sql` | Baru — additive only |
| Backend | `apps/api/src/modules/calibration-jobs/logical-test-grouping.ts` | Baru — helper murni `orderByLogicalTest` / `groupByLogicalTest` |
| Backend | `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` | Select + type + summary diperluas; `parameters`, `gridParameters`, dan tiap `capabilityGroups[].parameters` diurutkan lewat helper |
| Backend | `apps/api/src/modules/calibration-jobs/lk-measurement-mapping.ts` | `CapabilityParameterForLk` diperluas; baris LK diurutkan lewat helper yang sama |
| Backend | `apps/api/src/modules/calibration-jobs/lk-download.service.ts` | Select + forward dua field baru ke mapper |
| Backend | `apps/api/src/modules/device-calibration-parameters/device-calibration-parameters.service.ts` | `create`/`update` memvalidasi pasangan (`assertLogicalTestPair`) dan keunikan urutan (`assertUniqueLogicalTestSequence`); `copy` sengaja **tidak** membawa grouping ke target |
| Shared DTO | `packages/shared/src/schemas/index.ts` | `logicalTestKey`/`logicalTestSequence` pada skema create & update + `refineLogicalTestPair` |
| Portal | `device-calibration-parameter-form-fields.tsx`, `new/page.tsx`, `[id]/page.tsx`, `device-calibration-parameters-ui.tsx` | Field form baru, validasi, payload builder, tampilan detail, error mapping, helper `formatLogicalTest` |
| Tech-PWA | `apps/tech-pwa/src/lib/calibration/measurement.ts` | Mirror dua field pada `TechMeasurementParameter` (kontrak saja — tidak perlu perubahan renderer) |

**Tests (baru, semua lulus):**

| File | Jumlah tes baru |
|---|---|
| `logical-test-grouping.test.ts` | 12 |
| `lk-measurement-mapping.test.ts` | +6 |
| `calibration-jobs.service.test.ts` | +3 (integrasi) |
| `device-calibration-parameters.service.test.ts` | +14 |

---

## 3. Schema Changes

```prisma
model DeviceCalibrationParameter {
  ...
  entryStyle          CalibrationParameterEntryStyle @default(DIRECT_REPLICATES)
  logicalTestKey       String?
  logicalTestSequence  Int?
  ...
  @@unique([deviceTypeId, capabilityItemId, code])
  @@unique([deviceTypeId, logicalTestKey, logicalTestSequence])
  @@index([deviceTypeId, logicalTestKey])
}
```

- Kedua kolom **nullable**, default `NULL` — setiap baris lama otomatis `(NULL, NULL)` = parameter berdiri sendiri, perilaku identik sebelum Phase 4A.
- Unique constraint `(deviceTypeId, logicalTestKey, logicalTestSequence)`: Postgres memperlakukan `NULL` sebagai *distinct*, sehingga baris ungrouped tidak pernah saling bentrok — hanya duplikasi posisi yang benar-benar dideklarasikan yang ditolak.
- Dua CHECK constraint di level DB: pasangan harus lengkap berdua atau kosong berdua; `logicalTestSequence >= 1`.

---

## 4. Migration

`20260918120000...` → tidak disentuh. Migrasi baru murni `ALTER TABLE ADD COLUMN` (2×) + 2 `CHECK` + 1 index + 1 unique index. Tidak ada `UPDATE`, tidak ada backfill, tidak menyentuh `CalibrationTestPoint`, `JobCalibrationTestPoint`, atau `MeasurementResult`.

Diterapkan ke dev DB (`pkmdb`) via `prisma migrate deploy` dan diverifikasi read-only setelahnya:

```
{"parameters":493,"groupedParameters":0,"measurementResults":52,"resultsWithNullTestPoint":52}
```

493 parameter existing, 0 yang ter-grouping (belum ada data yang diisi — fitur ini menyiapkan mekanismenya saja), 52 measurement result historis tetap `calibrationTestPointId = NULL` tak tersentuh.

---

## 5. API Changes

- `MeasurementParameterSummary` (dan tipe turunannya di `gridParameters`/`capabilityGroups`) memuat `logicalTestKey: string | null` dan `logicalTestSequence: number | null`.
- `listMeasurementParameters`: array `parameters`, `gridParameters`, dan setiap `capabilityGroups[].parameters` sekarang melalui `orderByLogicalTest` — anggota satu logical test menjadi kontigu, terurut sesuai `logicalTestSequence`, muncul di posisi anggota pertamanya. Katalog tanpa grouping dikembalikan **persis** urutan sebelumnya (dibuktikan lewat tes).
- `buildCapabilitySections` (LK PDF generik, `lk-download.service.ts` → `lk-measurement-mapping.ts`): baris LK diurutkan dengan mekanisme yang sama sebelum di-render, sehingga besaran-besaran satu logical test tercetak berurutan di PDF.
- `POST /device-calibration-parameters` dan `PATCH /device-calibration-parameters/:id` menerima `logicalTestKey`/`logicalTestSequence`. Error baru: `INVALID_LOGICAL_TEST_GROUPING` (pasangan tidak lengkap), `DUPLICATE_LOGICAL_TEST_SEQUENCE` (posisi sudah dipakai parameter lain pada logical test yang sama di device type itu).
- `copy()` device-calibration-parameter **sengaja tidak** menyalin grouping — baris hasil copy selalu lahir standalone, sejalan dengan pola skip yang sudah ada untuk Pattern B/LOGGER_SUMMARY.

---

## 6. Portal Changes

Form parameter (create & edit) mendapat dua field baru: "Kunci uji gabungan" dan "Urutan dalam uji gabungan", dengan validasi klien (pasangan lengkap, urutan 1–100) dan error mapping untuk kedua kode error API baru. Halaman detail menampilkan status grouping (`"— (parameter berdiri sendiri)"` atau `"<key> — urutan <n>"`).

---

## 7. Tech-PWA Changes

Hanya kontrak tipe (`TechMeasurementParameter`) di-mirror. **Tidak ada perubahan renderer** — setiap besaran tetap parameter Pattern A/B biasa dengan replicate, toleransi, dan verdict sendiri; teknisi mengisinya seperti parameter lain mana pun. Ini konsisten dengan A3: identitas pengukuran tidak berubah.

---

## 8. LK/PDF Changes

`mapCapabilityMeasurementRows` (dipakai oleh PDF generik) mengurutkan parameter lewat `orderByLogicalTest` sebelum membangun baris. Bentuk baris, nilai, dan teks toleransi **tidak berubah** — hanya urutan kemunculannya. Template LK BSM (`bed-side-monitor.ts`) tidak disentuh sama sekali.

---

## 9. Tests Executed / Results

| Suite | Hasil |
|---|---|
| `logical-test-grouping.test.ts` | 12/12 lulus |
| `lk-measurement-mapping.test.ts` | 15/15 lulus (6 baru) |
| `calibration-jobs.service.test.ts` | 168/168 lulus (3 baru) |
| `device-calibration-parameters.service.test.ts` | 48/48 lulus (14 baru) |
| API full suite (`pnpm --filter @medcal/api test`) | 1206 tes: 1197 lulus, 9 gagal — **semua di modul chat/email/push-tokens/whitelist, nol referensi ke calibration/logicalTest**, kegagalan konfigurasi environment pra-eksisting |
| API typecheck (`tsc --noEmit`) | Bersih |
| Portal test suite | 194/194 lulus |
| Portal typecheck | Bersih |
| Tech-PWA test suite | 109/109 lulus |
| Tech-PWA typecheck | Bersih (2 fixture tes disesuaikan dengan field baru) |
| Shared typecheck | Bersih |
| Verifikasi data dev DB pasca-migrasi | 493 parameter, 0 grouped, 52 measurement result historis tetap `calibrationTestPointId = NULL` |

---

## 10. Remaining Limitations

- Belum ada parameter katalog yang benar-benar di-grouping — baris Dental X-Ray (`kV`/`s`/`mGy`) dan Mikroskop (`stage`/`eyepiece`) belum diisi datanya. Mekanisme sudah siap dipakai lewat Portal.
- `capabilityGroups` memakai shim `{id, logicalTestKey, logicalTestSequence, entry}` sebelum memanggil `orderByLogicalTest`, karena comparator `sortOrder` yang ada membungkus closure atas objek anonim yang tidak bisa dipakai ulang langsung. Fungsional setara, sedikit alokasi tambahan — dicatat untuk kejelasan, bukan blocker.
- `submitForReview`/completeness sengaja tidak disentuh, sesuai scope Gap A.
- Tidak ada blocker yang ditemukan terhadap arsitektur A3 — tidak perlu eskalasi ke opsi A2 (entitas kuantitas anak).

---

## 11. Non-Changes

Natural key `MeasurementResult`; `CalibrationTestPoint`; `JobCalibrationTestPoint`; `replicateIndex`; `direction`; `referenceValue`; arsitektur toleransi (`measurement-tolerance.ts`); `submitForReview`/completeness; layout template LK BSM; seluruh data historis (`MeasurementResult`, job, test point).
