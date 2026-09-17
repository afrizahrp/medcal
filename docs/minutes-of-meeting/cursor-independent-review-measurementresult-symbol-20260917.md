# Independent Review — MeasurementResult Symbol Support

**Mode:** READ-ONLY / AUDIT ONLY  
**Date:** 2026-09-17  
**Source audited:** [`docs/claude/plans/Calibration-management/investigation-6a-symbol-valuetype.md`](../claude/plans/Calibration-management/investigation-6a-symbol-valuetype.md)  
**Scope:** Verifikasi independen apakah kesimpulan Stage 1 benar-benar didukung kode repository saat ini.

**Tidak ada perubahan kode, schema, migration, commit, atau push.**

---

## Executive Verdict

**CONFIRMED WITH CORRECTIONS**

Sebagian besar kesimpulan audit Stage 1 **benar dan didukung kode**:

- `MeasurementResult` sudah punya `measuredValue` + `measuredText`
- `calibrationValueType` tidak ada; field aktual adalah `valueType`
- Dukungan simbol harus **per-reading**, bukan klasifikasi parameter `SYMBOL`
- Mengubah parameter ke `TEXT` berbahaya (filter tech-pwa + verdict)
- `isWithinTolerance` sudah `NULL` jika `measuredValue` `NULL`
- Symbol picker sudah di-mount di tech-pwa, tetapi tidak kompatibel dengan `type="number"`
- Bug LK PDF (`formatMeasuredValue` mengabaikan `measuredText` untuk `NUMBER`) terkonfirmasi dan memang terpisah

**Koreksi utama:** klaim ringkas bahwa perubahan minimal Stage B cukup dengan:

```text
type="text"
inputMode="decimal"
```

sambil “mempertahankan validasi JS dan persistence yang ada” **tidak cukup** untuk mendukung penyimpanan simbol end-to-end.

Alasan:

1. Validasi frontend (`validateMeasuredValue`) menolak nilai non-numerik dan men-disable tombol Simpan.
2. Wire type tech-pwa (`MeasurementBatchItem` / `MeasurementUpdateInput`) hanya membawa `measuredValue`.
3. Draft hydrate / dirty-compare / entry-status hanya melihat `measuredValue`, bukan `measuredText`.

Laporan penuh Stage 1 sebenarnya sudah menyebut gap wire-type/routing/status (Option 1, poin 2–4). Yang oversimplified adalah ringkasan kesimpulan #7 yang menempatkan ganti `type` saja sebagai “minimal Stage B” untuk symbol support.

---

## 1. MeasurementResult Storage

**Verdict:** CONFIRMED

**Evidence:**

- Prisma model `MeasurementResult` sudah nullable multi-typed:
  - `measuredValue Decimal? @db.Decimal(18, 6)`
  - `measuredText String?`
  - Lokasi: `packages/db/prisma/schema.prisma` (~2254–2270)
- Zod create/update sudah menerima `measuredText`:
  - `measuredText: z.string().trim().max(500).nullable().optional()`
  - Lokasi: `packages/shared/src/schemas/index.ts` (~955, ~984)
  - `measuredValue` lewat `measurementDecimalInput` hanya menerima angka / null (regex `/^-?\d+(\.\d+)?$/`)
- Write service sudah persist `measuredText` pada create / batch / update:
  - `apps/api/src/modules/calibration-jobs/measurement-results.service.ts` (~185, ~250, ~321)
- Portal review sudah menampilkan fallback ke `measuredText`:
  - `apps/portal/src/app/management/calibration-jobs/[id]/page.tsx` (~1847–1849)

**Relevant files:**

- `packages/db/prisma/schema.prisma`
- `packages/shared/src/schemas/index.ts`
- `apps/api/src/modules/calibration-jobs/measurement-results.service.ts`
- `apps/portal/src/app/management/calibration-jobs/[id]/page.tsx`
- `apps/portal/src/app/management/calibration-jobs/use-measurement-results-query.ts`

**Conclusion:**

Ya — `MeasurementResult` **sudah bisa** persist pembacaan simbol/teks non-numerik lewat `measuredText` **tanpa perubahan schema**. Gap bukan di storage/API, melainkan di jalur entry tech-pwa yang belum menulis `measuredText`.

---

## 2. Parameter valueType

**Verdict:** CONFIRMED

**Evidence:**

- Grep kode produksi untuk `calibrationValueType`: **0 match** (hanya muncul di dokumen MoM / investigation).
- Field klasifikasi aktual: `DeviceCalibrationParameter.valueType`
- Enum: `CalibrationValueType { NUMBER, RATIO, TEXT, BOOLEAN }`
  - `packages/db/prisma/schema.prisma` (~398–403, ~1379)
- Tidak ada nilai enum `SYMBOL`.
- Seed: hampir semua `NUMBER`; ada `RATIO` / `BOOLEAN`; `TEXT` didefinisikan tetapi tidak dipakai di seed katalog utama.

**Relevant files:**

- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/20260826100000_add_valuetype_and_optional_uom_to_device_calibration_parameter/migration.sql`
- `packages/db/prisma/seed-device-calibration-parameters.ts`
- `packages/db/prisma/seed-device-taxonomy-extension-parameters.ts`

**Conclusion:**

Field yang benar adalah `valueType`, bukan `calibrationValueType`. Menambah `SYMBOL` ke klasifikasi parameter **tidak diperlukan** untuk menyimpan simbol per-reading.

---

## 3. Per-parameter vs Per-reading

**Verdict:** CONFIRMED

**Evidence:**

- Endpoint daftar parameter teknisi hard-filter `valueType: "NUMBER"`:
  - `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` (~1549, ~1560)
  - Parameter yang diubah ke `TEXT` / non-`NUMBER` **hilang** dari layar entry Pattern A/B.
- Tolerance engine:
  - `valueType === "TEXT"` → `computeIsWithinTolerance` selalu `null`
  - Lokasi: `apps/api/src/modules/calibration-jobs/measurement-tolerance.ts` (~240)
  - Akibat: semua pembacaan numerik normal pada parameter itu kehilangan verdict otomatis.

**Relevant files:**

- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts`
- `apps/api/src/modules/calibration-jobs/measurement-tolerance.ts`

**Conclusion:**

Klaim audit sebelumnya benar: mengubah parameter ke `TEXT`/`SYMBOL` berbahaya. Dukungan simbol harus **per reading** pada parameter `NUMBER` biasa (`measuredValue = NULL` + `measuredText = "..."`), bukan reclassification master catalog.

---

## 4. Tolerance / Verdict

**Verdict:** CONFIRMED

**Evidence:**

```ts
// measurement-tolerance.ts ~236-252
export function computeIsWithinTolerance(input: WithinToleranceInput): boolean | null {
  if (input.valueType === "BOOLEAN") {
    return input.measuredBool ?? null;
  }
  if (input.valueType === "TEXT") return null;

  const value = toDecimal(input.measuredValue);
  if (value === null) return null;
  // ... compare bounds ...
}
```

- `measuredText` **tidak dibaca** sama sekali oleh tolerance engine.
- Service memanggil compute tanpa `measuredText`:
  - `measurement-results.service.ts` (~163–169)
- UI chip tech-pwa: `null` → label **"Perlu telaah"**
  - `apps/tech-pwa/src/lib/calibration/measurement.ts` (~338–346)

**Relevant files:**

- `apps/api/src/modules/calibration-jobs/measurement-tolerance.ts`
- `apps/api/src/modules/calibration-jobs/measurement-results.service.ts`
- `apps/tech-pwa/src/lib/calibration/measurement.ts`

**Conclusion:**

Untuk `measuredValue = NULL` + `measuredText` non-null pada parameter `NUMBER`, sistem secara alami masuk jalur `isWithinTolerance = NULL` / human review. Tidak perlu ubah logic tolerance untuk Stage B.

---

## 5. Symbol Picker

**Verdict:** CONFIRMED

**Evidence:**

- Implementasi: `packages/ui/src/symbol-picker/` (`GlobalSymbolPicker.tsx`, `insert-symbol.ts`, dll.)
- Mount tech-pwa: `apps/tech-pwa/src/components/global-symbol-picker-host.tsx` lewat `providers.tsx` (semua route kecuali sign-in)
- Mount portal: juga global via portal providers
- Kompatibilitas input:
  - `"number"` ada di `SKIP_INPUT_TYPES`
  - `isCompatibleInputType` hanya true untuk `type === "text"`
  - Lokasi: `packages/ui/src/symbol-picker/insert-symbol.ts` (~3–31)

**Relevant files:**

- `packages/ui/src/symbol-picker/insert-symbol.ts`
- `packages/ui/src/symbol-picker/GlobalSymbolPicker.tsx`
- `apps/tech-pwa/src/components/global-symbol-picker-host.tsx`
- `apps/tech-pwa/src/app/providers.tsx`

**Conclusion:**

Picker tersedia di tech-pwa, tetapi **tidak bisa insert normal** ke field measurement karena `type="number"`. Mengubah ke `type="text"` membuat picker kompatibel. Perubahan picker sendiri **tidak diperlukan**.

Catatan: kompatibilitas picker ≠ keberhasilan persist simbol (lihat bagian 6–7).

---

## 6. Measurement Entry Screens

Hanya ada **dua** layar/komponen entry teknisi untuk `MeasurementResult`. Portal hanya display (bukan entry).

### A. Pattern A — daftar ulangan

- **File:** `apps/tech-pwa/src/app/jobs/[id]/measurements/[parameterId]/page.tsx`
- **Current input:** `type="number"`, `inputMode="decimal"`, `step=measuredValueInputStep(dp)` (~292–294)
- **Current validation:** `validateMeasuredValue` / `validateMeasuredValuePrecision` (shape numerik + `decimalPlaces`); Simpan disabled jika invalid (~193–197, ~245)
- **Current payload behavior:**
  - create batch: `{ deviceCalibrationParameterId, replicateIndex, measuredValue }`
  - update: `{ measuredValue }`
  - draft hydrate dari `existing.measuredValue` saja (~177)
- **Required change:**
  - `type="text"` + `inputMode="decimal"`
  - routing: numeric → `measuredValue` (+ `measuredText: null`); non-numeric → `measuredText` (+ `measuredValue: null`)
  - longgarkan gate submit agar simbol non-empty tidak dianggap invalid
  - hydrate draft dari `measuredValue ?? measuredText ?? ""`

### B. Pattern B — grid titik uji

- **File:** `apps/tech-pwa/src/app/jobs/[id]/measurements/measurement-grid.tsx`
- **Current input:** sama (`type="number"`, `inputMode="decimal"`) (~253–255)
- **Current validation:** sama seperti Pattern A (~111–122)
- **Current payload behavior:** sama; plus `calibrationTestPointId` / `direction` (~123–137)
- **Required change:** sama seperti Pattern A

### Shared helpers / wire types

- **File:** `apps/tech-pwa/src/lib/calibration/measurement.ts`
  - `MeasurementBatchItem` / `MeasurementUpdateInput` hanya `measuredValue` (~156–167)
  - `parameterEntryStatus` / `gridEntryStatus` menghitung filled hanya dari `measuredValue` (~366, ~388)
  - Display read-only memakai `formatMeasuredValue(existing?.measuredValue)` — simbol tidak tampil

**Jawaban kritis:**

Jika hanya mengubah:

```text
type="number"  →  type="text" + inputMode="decimal"
```

maka kode **belum** membedakan:

- numeric reading → `measuredValue`
- symbol/text reading → `measuredText`

Perubahan minimal tambahan yang wajib:

1. Perluas wire types agar bisa mengirim `measuredText`
2. Split nilai draft saat build payload
3. Izinkan simbol di validasi submit (tanpa menghapus validasi numerik untuk angka)
4. Hydrate + entry-status mempertimbangkan `measuredText`

---

## 7. End-to-End Persistence

**Trace:**

```text
Technician input
  → frontend draft state (string)
  → validateMeasuredValue (numeric-only hari ini)
  → API payload { measuredValue } saja
  → Zod measurementResultCreate/UpdateSchema
  → measurement-results.service (persist measuredValue + measuredText)
  → Prisma MeasurementResult
  → Portal review (measuredValue ?? measuredText)
  → LK PDF formatMeasuredValue (NUMBER mengabaikan measuredText)
```

| Segmen | Symbol support hari ini |
| --- | --- |
| Input UI tech-pwa | TIDAK (`type="number"` + validasi numerik) |
| Payload tech-pwa | TIDAK (tidak kirim `measuredText`) |
| Zod / API validation | YA (jika client mengirim `measuredText`) |
| Service / Prisma write | YA |
| Portal review display | YA (fallback) |
| Tech-pwa re-edit / display | TIDAK (hanya load `measuredValue`) |
| LK PDF untuk `NUMBER` | TIDAK (`measuredText` diabaikan) |

**Kesimpulan:**

Symbol support **sudah bekerja** dari API → DB → Portal, jika payload dikirim benar. Symbol support **belum bekerja** dari technician entry UI. Perubahan terkecil untuk Stage B ada di frontend tech-pwa (input + routing payload + validasi/status), bukan schema/API/tolerance.

---

## 8. LK PDF Issue

**Verdict:** CONFIRMED

**Evidence:**

```ts
// lk-download.service.ts ~581-597
export function formatMeasuredValue(...): string | null {
  if (valueType === "BOOLEAN") { /* ... */ }
  if (valueType === "TEXT" || valueType === "RATIO") {
    if (row.measuredText) return row.measuredText;
    // ...
  }
  const num = toNum(row.measuredValue);
  if (num === null) return null;
  return decimalPlaces != null ? num.toFixed(decimalPlaces) : String(num);
}
```

- Untuk `NUMBER`, hanya `measuredValue` yang diformat.
- Simbol di `measuredText` + `measuredValue = null` → hasil `null` → cell bisa jadi `"—"` / terfilter.

**Relevant files:**

- `apps/api/src/modules/calibration-jobs/lk-download.service.ts` (~515, ~581–597)
- `apps/api/src/modules/calibration-jobs/lk-download.service.test.ts` (contoh TEXT `"OR"`)

**Conclusion:**

Issue nyata. Simbol yang tersimpan pada parameter `NUMBER` hilang di sertifikat LK. Ini **terpisah** dari perubahan input Stage B dan tetap OUT OF SCOPE kecuali disetujui terpisah.

---

## Minimal Implementation Recommendation

Jika tujuan Stage B = **benar-benar bisa input & persist simbol** (bukan hanya field yang picker-compatible):

1. **Prisma schema perlu diubah?** Tidak
2. **Migration perlu diubah?** Tidak
3. **`valueType` perlu diubah?** Tidak
4. **Backend API perlu diubah?** Tidak (sudah menerima `measuredText`)
5. **Measurement tolerance logic perlu diubah?** Tidak
6. **Symbol picker perlu diubah?** Tidak
7. **File frontend yang perlu dimodifikasi:**
   - `apps/tech-pwa/src/app/jobs/[id]/measurements/[parameterId]/page.tsx`
   - `apps/tech-pwa/src/app/jobs/[id]/measurements/measurement-grid.tsx`
   - `apps/tech-pwa/src/lib/calibration/measurement.ts`
   - `apps/tech-pwa/src/lib/calibration/measurement.test.ts` (dan test terkait bila ada)
8. **Tests yang diperlukan:**
   - Unit: split numeric → `measuredValue` vs non-numeric → `measuredText`
   - Unit: validasi menerima simbol tanpa menolak angka valid
   - Unit: entry-status menghitung baris `measuredText` sebagai filled
   - Regression: perilaku numerik existing tetap lulus
   - Jangan ubah / jangan “fix” tes LK di Stage B

**Peringatan terhadap ringkasan Stage B yang terlalu sempit:**

Hanya ganti `type="text"` sambil mempertahankan validasi numerik keras = picker bisa insert, tetapi **Simpan tetap diblok**. Itu bukan dukungan simbol end-to-end.

---

## Risks / Hidden Dependencies

Hal yang ringkasan audit sebelumnya kurang ditegaskan (sebagian sudah ada di laporan penuh Option 1):

1. **Numeric parsing / validation gate** — `validateMeasuredValue` menolak simbol sebelum API.
2. **Empty string handling** — empty tidak disimpan; perilaku clear-row tidak otomatis ada.
3. **Null handling sibling fields** — saat ganti angka↔simbol harus men-null field sibling agar tidak menyisakan nilai lama.
4. **Form submission** — tombol Simpan disabled pada `hasInvalid`.
5. **Edit mode hydrate** — draft hanya dari `measuredValue`; simbol tersimpan via API tampil kosong saat re-open.
6. **Mobile keyboard** — `inputMode="decimal"` tetap keypad numerik; simbol masuk lewat picker (bukan keyboard) — acceptable.
7. **API coercion** — mengirim simbol di `measuredValue` akan gagal Zod; harus lewat `measuredText`.
8. **Entry status** — `parameterEntryStatus` / `gridEntryStatus` tidak menghitung `measuredText`.
9. **Semantic overload** — `measuredText` didokumentasikan untuk TEXT/RATIO; dipakai juga sebagai slot simbol NUMBER. Acceptable secara teknis, perlu kesadaran produk.
10. **LK PDF** — bug tersembunyi tetap ada setelah Stage B input selesai.

---

## Recommended Stage 2 Plan

1. Ubah kedua input entry (`page.tsx` Pattern A + `measurement-grid.tsx` Pattern B) menjadi `type="text"` `inputMode="decimal"`.
2. Tambah helper split: numeric shape → `{ measuredValue, measuredText: null }`; selain itu → `{ measuredValue: null, measuredText }`.
3. Perluas `MeasurementBatchItem` / `MeasurementUpdateInput` agar mendukung `measuredText` opsional.
4. Sesuaikan gate submit: angka tetap divalidasi precision; non-numerik non-empty diizinkan sebagai simbol (trim, max 500 mengikuti Zod).
5. Hydrate draft dari `measuredValue ?? measuredText ?? ""`; dirty-compare mempertimbangkan keduanya.
6. Update `parameterEntryStatus` / `gridEntryStatus` agar `measuredText` dihitung sebagai filled.
7. Update unit tests tech-pwa.
8. Jangan sentuh: Prisma schema, migration, `valueType`, tolerance/verdict, LK PDF.

---

## Scope Boundary

Berikut tetap **OUT OF SCOPE** untuk implementasi Stage B yang mengikuti review ini:

- Prisma schema changes
- migrations
- new `SYMBOL` parameter `valueType`
- tolerance redesign
- verdict redesign
- LK PDF fix
- unrelated workflow changes

---

## Ringkasan Putusan per Klaim Audit Sebelumnya

| # | Klaim Stage 1 | Putusan review |
| --- | --- | --- |
| 1 | Storage/API/Portal sudah support `measuredText` | CONFIRMED |
| 2 | Tidak ada `calibrationValueType`; field = `valueType` | CONFIRMED |
| 3 | Symbol support per-reading, bukan `SYMBOL` parameter | CONFIRMED |
| 4 | Ubah parameter ke TEXT/SYMBOL berbahaya | CONFIRMED |
| 5 | `isWithinTolerance` NULL jika `measuredValue` NULL | CONFIRMED |
| 6 | Picker ada; `type="number"` menghalangi insert | CONFIRMED |
| 7 | Minimal Stage B = hanya ganti `type` + jaga validasi/persistence existing | PARTIALLY CONFIRMED / OVERSIMPLIFIED |
| 8 | Bug LK PDF NUMBER mengabaikan `measuredText`; out of scope | CONFIRMED |

---

NO CODE WAS MODIFIED.  
STOP AFTER THE REVIEW.
