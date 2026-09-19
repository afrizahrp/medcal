# PHASE 4C — PORTAL CRUD: CALIBRATION TEST POINTS / NAMED MEASUREMENT POINTS

## IMPLEMENTATION REPORT

**Tanggal:** 2026-09-19
**Scope:** Portal CRUD (Create/Edit/Reorder/Activate-Deactivate, tanpa delete destruktif) untuk `CalibrationTestPoint`, embedded pada halaman detail Device Calibration Parameter yang sudah ada.
**Status:** Implemented

Sumber:

- Skema Prisma dan implementasi existing `CalibrationTestPoint` + `JobCalibrationTestPoint`
- `09 phase-4a-multiple-measured-quantities-implementation-20260918.md` (Phase 4A — sudah diterima, tidak dibuka ulang)
- `10 phase-4b-derived-aggregate-measurements-implementation-20260919.md` (Phase 4B — sudah diterima, tidak dibuka ulang)
- `PHASE 4C-PORTAL CRUD — CALIBRATION TEST POINTS or NAMED MEASUREMENT POINTS.md` (instruksi awal + refinement UI inline)
- Rules diterapkan: `.claude/rules/architecture.md`, `.claude/rules/implementation-scope.md`, `.claude/rules/testing.md`

---

## 1. Ringkasan

Menambahkan CRUD Portal untuk `CalibrationTestPoint` (titik ukur bernama: Awal/Akhir, L-N/L-G/N-G, Posisi A/B/C, T1–T5, dst.) langsung **embedded** di halaman `Management → Device Calibration Parameters → Parameter Detail/Edit` yang sudah ada — bukan halaman CRUD terpisah. Mekanisme generik sepenuhnya: tidak ada hardcode per device type, per kode parameter, atau per label titik ukur.

**Tidak ada delete destruktif.** Lifecycle titik ukur hanya lewat `isActive` (Aktifkan/Nonaktifkan), sesuai arsitektur yang sudah ada — job historis mereferensikan master `CalibrationTestPoint`, dan job yang sudah start memakai snapshot `JobCalibrationTestPoint` sendiri.

**Tidak ada migrasi** — schema `CalibrationTestPoint` sudah punya seluruh field yang dibutuhkan (`settingLabel`, `settingValue`, `sequence`, `toleranceMin/Max/Note`, `isActive`).

**Tidak ada model titik-bernama kedua, tidak ada permission baru, tidak ada perubahan Tech-PWA/PDF-LK, tidak ada redesain Phase 4A/4B.**

---

## 2. Files Changed

| Layer | File | Perubahan |
|---|---|---|
| Backend | `apps/api/src/modules/device-calibration-parameters/device-calibration-parameters.service.ts` | + `findTestPoints`, `createTestPoint`, `updateTestPoint`, `reorderTestPoints` (+ `findTestPoint` ownership-scoped lookup, `assertUniqueTestPointLabel`, `assertSequenceAvailable`); reuse `findOne`/`assertSameSet` yang sudah ada di class yang sama |
| Backend | `apps/api/src/modules/device-calibration-parameters/device-calibration-parameters.controller.ts` | + 4 route nested `:id/test-points`, mengikuti persis pola `device-capabilities.controller.ts` `:id/items` |
| Shared DTO | `packages/shared/src/schemas/index.ts` | `calibrationTestPointCreateSchema`, `calibrationTestPointUpdateSchema` (tanpa `sequence` — reorder saja), `calibrationTestPointReorderSchema` |
| Portal | `device-calibration-parameters/[id]/page.tsx` | + section "Titik Ukur" embedded (Surface kedua) |
| Portal | `calibration-test-point-form-fields.tsx` (baru) | Komponen React form |
| Portal | `calibration-test-point-form-utils.ts` (baru) | Logika murni (validate/build payload/format error) — dipisah dari `.tsx` agar bisa di-unit-test tanpa transform JSX |
| Portal | `calibration-test-point-ordering.ts` (baru) | `moveAdjacent()` — logika murni swap posisi berdekatan |
| Portal | `use-calibration-test-points-query.ts` (baru) | React Query hooks: list/create/update/reorder |
| Tests | `device-calibration-parameters.service.test.ts` (+26), `calibration-jobs.service.test.ts` (+1), `calibration-test-point-form-utils.test.ts` (+19, baru), `calibration-test-point-ordering.test.ts` (+8, baru) | Semua lulus |
| Tech-PWA | — | **Nol perubahan** |
| LK/PDF | — | **Nol perubahan** |

---

## 3. Migration

**Tidak diperlukan.** Diverifikasi terhadap schema sebelum implementasi: `CalibrationTestPoint` sudah memuat seluruh field yang dibutuhkan scope ini.

---

## 4. Backend API

```
GET   /device-calibration-parameters/:id/test-points              — list (aktif + nonaktif)
POST  /device-calibration-parameters/:id/test-points               — create
PATCH /device-calibration-parameters/:id/test-points/reorder       — reorder satu set penuh
PATCH /device-calibration-parameters/:id/test-points/:testPointId  — edit / toggle isActive
```

Tidak ada route `DELETE` sama sekali — nonaktifkan adalah satu-satunya mekanisme lifecycle.

**Reorder** memakai transaksi dua fase (tulis ke offset sementara, lalu ke posisi final) untuk menghindari collision transien pada unique constraint `(deviceCalibrationParameterId, sequence)` saat swap berdekatan (mis. menukar #1 dan #2 head-on). `testPointIds` harus berupa set lengkap (aktif + nonaktif) milik parameter itu — mismatch ditolak (`CALIBRATION_TEST_POINT_ORDER_MISMATCH`), mengikuti pola `assertSameSet` yang sudah dipakai untuk reorder capability/parameter.

**Ownership** ditegakkan dengan menyaring setiap lookup ke `(id, deviceCalibrationParameterId)` — id dari parameter lain menghasilkan 404 `CALIBRATION_TEST_POINT_NOT_FOUND`, bukan bocor keberadaan resource di scope lain.

---

## 5. DTO/Validation

`settingLabel` wajib (1–150 karakter), `sequence` integer positif (hanya saat create; auto-append `max(sequence)+1` bila tidak diisi), rentang toleransi divalidasi lewat `refineToleranceBounds` yang sudah ada. Duplikasi `settingLabel` (case-insensitive) dan duplikasi `sequence` eksplisit ditolak sebagai `ConflictException` sebelum insert — pola pre-check yang sama dengan `assertUniqueName` di file yang sama, bukan menerjemahkan P2002 setelah gagal.

`sequence` **sengaja tidak** ada di skema update — perubahan urutan hanya lewat endpoint reorder khusus, karena update satu baris berisiko collision transien pada unique constraint.

---

## 6. Portal UI Changes — **Embedded Portal UI implemented: YES**

**Lokasi:** `apps/portal/src/app/management/device-calibration-parameters/[id]/page.tsx` — Surface kedua di bawah kartu parameter yang sudah ada, halaman yang sama, tanpa navigasi.

- **Create UX:** "+ Tambah Titik Ukur" membuka form inline (mengikuti pola Capability Items yang sudah ada — codebase ini tidak punya komponen dialog/modal sama sekali, jadi inline-in-card adalah konvensi yang sudah mapan, bukan sesuatu yang saya ciptakan).
- **Edit UX:** klik "Edit" menukar baris itu menjadi form inline yang sama; daftar ter-update lewat invalidasi query saat save; pengguna tidak pernah meninggalkan halaman.
- **Reorder UX:** tombol ▲/▼ per baris (bukan drag-and-drop — list saudara parameter/capability memang sudah memakai `@dnd-kit`, tapi brief secara eksplisit mengizinkan "move up/down controls" sebagai alternatif sah, dan tabel dengan inline-edit-per-baris tidak berpadu baik dengan drag handle).
- **Activate/Deactivate UX:** satu klik tombol per baris, toggle `isActive` lewat PATCH yang sama dengan edit; tidak ada tombol delete di mana pun pada UI.
- **State handling:** loading ("Memuat titik ukur…"), empty ("Tidak ada titik ukur" / "Parameter ini belum memiliki titik ukur bernama."), populated (tabel), mutation-pending (tombol disable + "Saving…"), mutation-error (teks merah khusus section, dipetakan lewat `formatCalibrationTestPointApiError`), mutation-success (konfirmasi khusus section).
- Form parameter existing (Surface atas, field Phase 4A `logicalTestKey`/`logicalTestSequence`, field Phase 4B `entryStyle`/`derivation`) **tidak disentuh** — blok terpisah, state terpisah.

---

## 7. Permission/Authorization

Menggunakan ulang resource permission `deviceCalibrationParameter` yang sudah ada (`create`/`read`/`update`) — **nol tipe permission baru, nol perubahan seed RBAC.** Portal menggerbangi tombol dengan flag `capabilities.deviceCalibrationParameterCreate`/`Update` yang sudah di-resolve di halaman yang sama.

---

## 8. Tech-PWA Changes

**Tidak ada.** Nol file disentuh. Kontrak `GET /device-calibration-parameters/:id` dan `listMeasurementParameters` tidak berubah (test point berada di endpoint terpisah). Dikonfirmasi lewat suite Tech-PWA yang lulus penuh tanpa modifikasi (109/109) dan typecheck bersih.

---

## 9. PDF/LK Changes

**Tidak ada.** Nol file disentuh.

---

## 10. Tests Executed / Results

| Suite | Hasil |
|---|---|
| `device-calibration-parameters.service.test.ts` | **91/91 lulus** (65 pra-eksisting + 26 baru) |
| `calibration-jobs.service.test.ts` | **174/174 lulus** (173 + 1 tes baru immutabilitas snapshot) |
| Sapuan relevan gabungan (+`device-capabilities`) | **480/480 lulus** |
| `calibration-test-point-form-utils.test.ts` (baru) | **19/19 lulus** |
| `calibration-test-point-ordering.test.ts` (baru) | **8/8 lulus** |
| Portal full suite | **221/221 lulus** |
| Tech-PWA full suite | **109/109 lulus**, tidak berubah |

Cakupan sesuai §17 brief: list/create/update/reorder/activate-deactivate, kegagalan validasi, penolakan ownership (id lintas parameter), field toleransi round-trip, persistensi titik nonaktif, **dan yang paling kritis** — mengedit/mereorder/menonaktifkan/menambah titik pada parameter master **setelah** sebuah job sudah start, tidak mengubah snapshot `JobCalibrationTestPoint` job itu sama sekali (byte-for-byte identik, diverifikasi lewat tes khusus).

---

## 11. Typecheck

shared ✅ · api ✅ · portal ✅ · tech-pwa ✅ — semua bersih.

---

## 12. Build

`@medcal/api` (`tsc -p tsconfig.json`) ✅ · `@medcal/portal` (`next build`) ✅, termasuk `/management/device-calibration-parameters/[id]` sebagai dynamic route yang berhasil dikompilasi.

Verifikasi tambahan terhadap dev DB (`pkmdb`) sebelum vs sesudah implementasi backend: 213 test point, 92 baris snapshot `JobCalibrationTestPoint`, 52 `MeasurementResult` (seluruhnya tetap `calibrationTestPointId = NULL`), 493 parameter — **seluruhnya identik**, membuktikan tidak ada operasi CRUD yang tidak sengaja tereksekusi terhadap data produksi selama pengembangan (semua tes berjalan di `pkmdb_test` yang terisolasi).

---

## 13. Remaining Limitations

- Tidak ada tes rendering komponen (React Testing Library) — codebase ini nol memakai RTL di mana pun dalam Portal. Saya mengikuti konvensi testing pure-logic-only yang sudah mapan, dengan memisahkan logika ke modul `.ts` polos (`calibration-test-point-form-utils.ts`) khusus agar bisa diuji, mengikuti pola `device-calibration-parameter-ordering.ts` yang sudah ada.
- Reorder bersifat satu-list-penuh-sekaligus lewat tombol swap berdekatan, bukan drag-and-drop bebas.

---

## 14. Konfirmasi Eksplisit

- ✅ Tidak ada data historis yang diubah — diverifikasi terhadap dev DB sebelum/sesudah (213 test point, 92 job snapshot, 52 result, 493 parameter — tidak berubah)
- ✅ Tidak ada `JobCalibrationTestPoint` yang diubah — tes regresi khusus membuktikannya byte-for-byte, mencakup edit/reorder/nonaktifkan/tambah-setelah-start
- ✅ Tidak ada `MeasurementResult` yang diubah
- ✅ Tidak ada delete destruktif yang diperkenalkan
- ✅ Tidak ada model titik-bernama baru — `CalibrationTestPoint` tetap satu-satunya
- ✅ Tidak ada redesain Phase 4A — perilaku `logicalTestKey`/`logicalTestSequence` diverifikasi utuh lewat tes khusus
- ✅ Tidak ada redesain Phase 4B — perilaku `entryStyle`/`derivation` diverifikasi utuh lewat tes khusus
- ✅ Tidak ada perluasan scope
