# PHASE 4B — DERIVED / AGGREGATE MEASUREMENTS

## IMPLEMENTATION REPORT

**Tanggal:** 2026-09-19
**Scope:** Gap B dari Report 08 §3 — nilai turunan / agregat, arsitektur minimum **B1 saja**
**Status:** Implemented

Sumber:

- `08 phase-4-measurement-domain-architecture-20260918.md` (baseline arsitektur, §3)
- `09 phase-4a-multiple-measured-quantities-implementation-20260918.md` (Phase 4A — sudah diterima, tidak diubah)
- `PHASE 4B — DERIVED or AGGREGATE MEASUREMENTS.md` (instruksi implementasi)
- Rules diterapkan: `.claude/rules/architecture.md`, `.claude/rules/implementation-scope.md`, `.claude/rules/testing.md`

---

## 1. Ringkasan

Menambahkan nilai enum `DERIVED` pada `CalibrationParameterEntryStyle` dan kolom `derivation Json?` (deskriptif murni) pada `DeviceCalibrationParameter`. Nilai turunan (ΔT Autoclave, rasio pembesaran Mikroskop) tetap diketik manual oleh teknisi dan tersimpan sebagai `MeasurementResult` biasa — dibedakan hanya oleh `entryStyle` parameter induknya.

**Tidak ada:** mesin formula, parser ekspresi, evaluasi otomatis, penghitungan otomatis, graf dependensi, entitas `MeasurementQuantity` baru, `JobApplicableParameter`, parameter snapshot, perubahan natural key `MeasurementResult`, perubahan `CalibrationTestPoint`/`JobCalibrationTestPoint`, perubahan `replicateIndex`/`direction`/`referenceValue`, atau rumus tebakan untuk ΔT2/ΔT3 Autoclave — itu tetap pertanyaan bisnis terbuka, tidak dijawab di sini.

---

## 2. Files Changed

| Layer | File | Perubahan |
|---|---|---|
| Schema | `packages/db/prisma/schema.prisma` | + nilai enum `DERIVED`; + `derivation Json?` pada `DeviceCalibrationParameter` |
| Migrasi | `packages/db/prisma/migrations/20260919090000_add_derived_entry_style_and_derivation_metadata/migration.sql` | Baru — additive only |
| Backend | `apps/api/src/modules/device-calibration-parameters/device-calibration-parameters.service.ts` | + `assertDerivationValidForEntryStyle`; `create()`/`update()` menerima & memvalidasi `entryStyle`/`derivation` (validasi baris gabungan pada update, mengikuti pola `logicalTestKey`/`logicalTestSequence` Phase 4A); `copy()` tidak diubah (sudah melewati baris non-`DIRECT_REPLICATES`, jadi DERIVED otomatis tidak ikut tersalin) |
| Backend | `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` | Filter kelayakan `listMeasurementParameters` diperluas menjadi `entryStyle: { in: ["DIRECT_REPLICATES", "DERIVED"] }`; filter `assertMeasurementsCompleteForSubmit` **sengaja tidak diubah** (didokumentasikan di kode) |
| Shared DTO | `packages/shared/src/schemas/index.ts` | `DEVICE_CALIBRATION_PARAMETER_ENTRY_STYLE_VALUES` (subset API-settable: `DIRECT_REPLICATES`, `DERIVED` — `LOGGER_SUMMARY` tetap script-only); `optionalDerivation` (objek `.strict()`, hanya `{ description: string }`) |
| Portal | `device-calibration-parameter-form-fields.tsx` | Select "Cara pengisian" + field catatan "Diturunkan dari", validasi, payload builder, error mapping, mekanisme `entryStyleLocked` |
| Portal | `device-calibration-parameters-ui.tsx` | Tipe diperluas; badge DERIVED pada daftar |
| Portal | `new/page.tsx`, `[id]/page.tsx` | Inisialisasi/hidrasi form, wiring `entryStyleLocked`, tampilan detail |
| Tests | `device-calibration-parameters.service.test.ts` (+21), `calibration-jobs.service.test.ts` (+5) | Baru, semua lulus |
| Tech-PWA | — | **Nol perubahan** — lihat §6 |
| LK/PDF | — | **Nol perubahan** — lihat §7 |

---

## 3. Schema Changes

```prisma
enum CalibrationParameterEntryStyle {
  DIRECT_REPLICATES
  LOGGER_SUMMARY
  DERIVED
}

model DeviceCalibrationParameter {
  ...
  derivation Json?   // deskriptif murni, mis. { "description": "..." }
}
```

Kedua perubahan additive dan backward compatible: setiap baris lama tetap `entryStyle = DIRECT_REPLICATES` (default kolom tidak berubah) dan `derivation = NULL`.

---

## 4. Migration

`20260919090000_add_derived_entry_style_and_derivation_metadata`:

- `ALTER TYPE "CalibrationParameterEntryStyle" ADD VALUE 'DERIVED'` — dibungkus `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`, idempoten, mengikuti preseden migrasi enum-add yang sudah ada di repo.
- `ALTER TABLE "DeviceCalibrationParameter" ADD COLUMN "derivation" JSONB` — nullable, tanpa default.

**Tidak ada backfill.** Diterapkan ke dev DB (`pkmdb`) dan test DB (`pkmdb_test`) via `prisma migrate deploy`, diverifikasi read-only setelahnya:

```
{
  "total": 493,
  "derived": 0,
  "withDerivation": 0,
  "byStyle": [
    { "entryStyle": "LOGGER_SUMMARY", "_count": 9 },
    { "entryStyle": "DIRECT_REPLICATES", "_count": 484 }
  ],
  "measurementResults": 52,
  "resultsWithNullTestPoint": 52
}
```

493 parameter existing tidak berubah, 0 baris DERIVED (mekanisme saja, tidak ada katalog diisi sesuai §11 instruksi), 9 `LOGGER_SUMMARY` / 484 `DIRECT_REPLICATES` utuh, 52 `MeasurementResult` historis utuh dengan seluruhnya tetap `calibrationTestPointId = NULL`.

---

## 5. API/DTO Changes

- `POST`/`PATCH /device-calibration-parameters` menerima `entryStyle` (opsional, default `DIRECT_REPLICATES`) dan `derivation` (opsional, hanya bentuk `{ description: string }`, `.strict()` menolak kunci lain).
- Error baru: `INVALID_DERIVATION_FOR_ENTRY_STYLE` — `derivation` hanya sah bila `entryStyle = DERIVED`, divalidasi terhadap **baris gabungan** saat update (PATCH yang hanya mengubah salah satu dari `entryStyle`/`derivation` tetap diperiksa konsistensinya terhadap nilai existing yang tidak disentuh).
- `listMeasurementParameters`: DERIVED kini ikut masuk `parameters`/`gridParameters`/`capabilityGroups`. `entryStyle` sendiri tetap murni filter — tidak pernah dikirim ke wire, sama seperti pengecualian `LOGGER_SUMMARY` sebelumnya.
- `assertMeasurementsCompleteForSubmit`: **sengaja tidak diubah** — DERIVED tetap opsional saat submit, karena Report 08 §9.B.7 meninggalkan "apakah nilai turunan wajib menggerbangi submit?" sebagai pertanyaan bisnis terbuka.

---

## 6. Portal Changes

Select "Cara pengisian" (Terukur langsung / Nilai turunan) + field teks "Diturunkan dari (catatan)" yang hanya muncul saat DERIVED dipilih — teks bebas, bukan formula builder, tidak menyiratkan penghitungan otomatis. Badge `DERIVED` ditambahkan di daftar parameter (mengikuti pola badge `valueType` yang sudah ada).

**Temuan yang tidak eksplisit diminta brief, ditangani sebagai pencegahan regresi:** baris yang saat ini `LOGGER_SUMMARY` (9 baris di katalog) dirender read-only pada kontrol Cara Pengisian, dan payload update **mengecualikan** `entryStyle`/`derivation` sepenuhnya untuk baris itu. Tanpa penjagaan ini, pola "selalu sertakan field di payload" yang dipakai field lain akan menurunkan diam-diam parameter `LOGGER_SUMMARY` menjadi `DIRECT_REPLICATES` hanya karena mengedit field tak terkait (mis. toleransi).

---

## 7. Tech-PWA Changes

**Tidak ada.** Renderer Tech-PWA tidak pernah bercabang berdasarkan `entryStyle` — pemilahan Pattern A/B selalu terjadi di server. Begitu API mengembalikan parameter DERIVED dalam array yang sama dengan `DIRECT_REPLICATES`, ia otomatis tampil sebagai field entri manual biasa, tanpa satu baris kode pun diubah. Dikonfirmasi lewat suite Tech-PWA yang lulus 100% tanpa modifikasi source.

---

## 8. LK/PDF Changes

**Tidak ada.** `buildCapabilitySections` (PDF generik) sudah menyeleksi seluruh parameter aktif tanpa filter `valueType`/`entryStyle` sama sekali — baris DERIVED otomatis mengalir sebagai baris biasa begitu `MeasurementResult`-nya ada. `LkResultPdfRow` (`label`/`value`/`toleranceText`) tidak memiliki slot alami untuk catatan deskriptif `derivation`; menambah satu berarti layout baru — dilarang eksplisit oleh brief — sehingga sengaja tidak ditambahkan. Template BSM tidak disentuh.

---

## 9. Tests Executed / Results

| Suite | Hasil |
|---|---|
| `device-calibration-parameters.service.test.ts` (focused) | **65/65 lulus** |
| `calibration-jobs.service.test.ts` (focused, seluruh file) | **173/173 lulus** |
| `lk-measurement-mapping.test.ts` + `lk-download.service.test.ts` + `measurement-results.service.test.ts` + `measurement-tolerance.test.ts` + `measurement-completeness.test.ts` | **115/115 lulus** |
| API full suite (`vitest run`) | **1218 lulus / 10 gagal**, 5 file — seluruhnya di `chat`, `emails`, `push-tokens`, `whitelist`, `contact-messages`. Dikonfirmasi tidak terkait: `git status` menunjukkan nol file di modul-modul itu tersentuh; kegagalan `chat-sessions.service.test.ts` direproduksi identik saat dijalankan terisolasi (isu timing/konfigurasi pra-eksisting, bukan akibat diff ini) |
| Portal full suite | **194/194 lulus** |
| Tech-PWA full suite | **109/109 lulus** |
| `tsc --noEmit` | shared, api, portal, tech-pwa — bersih semua |
| `pnpm --filter @medcal/api build` | Bersih |
| Verifikasi data dev DB pasca-migrasi | 493 parameter, 0 DERIVED, 52 measurement result historis utuh, seluruhnya tetap `calibrationTestPointId = NULL` |

---

## 10. Remaining Limitations

- Belum ada parameter katalog yang benar-benar dikonfigurasi DERIVED — mekanisme saja, sesuai §11 brief (Autoclave/katalog lain tidak disentuh untuk demonstrasi).
- `assertMeasurementsCompleteForSubmit` sengaja tidak mewajibkan DERIVED saat submit — keputusan bisnis di Report 08 §9.B.7 tidak diselesaikan di sini.

---

## 11. Konfirmasi Eksplisit

- ✅ Tidak ada mesin formula — `derivation` divalidasi `.strict()` hanya ke bentuk `{ description: string }`
- ✅ Tidak ada penghitungan otomatis — setiap nilai DERIVED ditulis lewat jalur `measurement-results.service.ts` yang sama seperti bacaan lain
- ✅ Tidak ada rumus tebakan — ΔT2/ΔT3 Autoclave tidak disentuh, tidak di-seed, tidak dikodekan
- ✅ Tidak ada perubahan identitas `MeasurementResult` — natural key utuh
- ✅ Tidak ada perubahan `CalibrationTestPoint`
- ✅ Tidak ada perubahan `JobCalibrationTestPoint`
- ✅ Tidak ada parameter snapshot
- ✅ Tidak ada `JobApplicableParameter`
- ✅ Tidak ada redesain Phase 4A — `logicalTestKey`/`logicalTestSequence` utuh, 35 tesnya tetap lulus tanpa modifikasi
