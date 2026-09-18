# Phase 1 Implementation Report

## Generic Named Measurement Points + Dynamic Replication

**Tanggal:** 2026-09-18  
**Scope:** Backend + Tech-PWA measurement behavior only  
**Status:** Implemented (Tech-PWA). Schema/API tidak diubah.

---

# 1. Implementation Summary

Phase 1 membuat Tech-PWA merender **titik ukur bernama dari data** (`CalibrationTestPoint.settingLabel`) dan **pengulangan dinamis** (satu slot awal + tombol “+ Tambah ulangan”).

Asumsi hard-code jumlah ulangan dihapus:

- tidak ada default 5
- tidak ada default 3
- tidak ada prefix `VENT_` / `AUD_`
- tidak ada kelengkapan “wajib 5 bacaan”

Backend, Prisma, API, RBAC, PDF/LK, dan Symbol Picker **tidak diubah**. Natural key hasil pengukuran tetap:

```
parameter + test point? + replicateIndex + attempt + direction
```

---

# 2. Files Changed

| File | Mengapa | Apa yang berubah |
|---|---|---|
| `apps/tech-pwa/src/lib/calibration/measurement.ts` | Sumber hard-code 5/3 dan logika complete | Hapus `DEFAULT_REPLICATE_COUNT`, `THREE_REPLICATE_PREFIXES`, `expectedReplicateCount`. Tambah `visibleReplicateCount`. `parameterEntryStatus` / `gridEntryStatus` diubah sesuai aturan Phase 1. |
| `apps/tech-pwa/src/lib/calibration/measurement.test.ts` | Tes harus mengikuti aturan baru | Tes Awal/Akhir complete/incomplete, 10 ulangan, tanpa special-case VENT_/AUD_. |
| `apps/tech-pwa/src/app/jobs/[id]/measurements/[parameterId]/page.tsx` | Pattern A memaksa 5 baris | Mulai 1 ulangan; “Tambah ulangan” tetap; teks I–V dihapus. |
| `apps/tech-pwa/src/app/jobs/[id]/measurements/measurement-grid.tsx` | Pattern B memaksa 5/3 kolom | Mulai 1 kolom; header “Titik ukur”; baris memakai `settingLabel`; “Tambah ulangan” tetap. |
| `apps/tech-pwa/src/app/jobs/[id]/measurements/measurements-ui.tsx` | Chip status memakai expected count | `gridEntryStatus` memakai id test point dari API. |
| `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx` | Ringkasan job sama | Status Pattern B berbasis titik wajib, bukan n×5. |

Tidak ada perubahan di auth, RBAC, FCM, quotation, requisition, PDF/LK, atau Prisma.

---

# 3. Data Model Impact

**Tidak ada perubahan Prisma schema.**  
**Tidak ada migrasi.**

Model yang dipakai (sudah ada sebelumnya):

- `DeviceCalibrationParameter`
- `CalibrationTestPoint` (`settingLabel`, `settingValue`, override toleransi, `isActive`)
- `MeasurementResult.calibrationTestPointId` (nullable)
- `MeasurementResult.replicateIndex` (≥ 1, tanpa max di DB)

Tidak ditambahkan:

- `expectedReplicateCount`
- enum / field `RANGE`
- `isRequired` pada test point

Aturan Phase 1: **test point aktif = titik wajib**.

---

# 4. Backend/API Changes

**Tidak ada perubahan backend/API.**

Kontrak yang sudah ada tetap dipakai:

- `GET /calibration-jobs/:id/measurement-parameters`  
  mengembalikan `gridParameters[].testPoints[]` berisi `id`, `sequence`, `settingLabel`, `settingValue`, toleransi
- `POST .../measurement-results` dan `.../batch`  
  menerima `calibrationTestPointId`, `replicateIndex`, `measuredValue` / `measuredText`, `direction`

Validasi yang sudah benar dibiarkan:

- `replicateIndex >= 1`
- tidak ada max artifisial
- test point harus milik parameter (`CALIBRATION_TEST_POINT_PARAMETER_MISMATCH`)
- authorization / RBAC tidak disentuh

---

# 5. Tech-PWA Changes

## Named measurement points

Jika parameter punya `CalibrationTestPoint` aktif, Tech-PWA merender **baris berlabel dari data**, bukan “Ulangan 1 / Ulangan 2”.

Contoh (label dari API, bukan hard-code):

```
Suhu
  Awal   [ input ]
  Akhir  [ input ]
  + Tambah ulangan
```

Device masa depan dengan `Low` / `Nominal` / `High` akan tampil otomatis tanpa ubah kode frontend.

## Repetition

- Slot awal: **satu** ulangan per konteks (`visibleReplicateCount`)
- Pertumbuhan: `max(1, max replicateIndex tersimpan) + extra dari tombol`
- “+ Tambah ulangan” tetap ada (Pattern A: baris; Pattern B: kolom)
- Boleh lebih dari 5 (diuji sampai 10 di unit test)

Ini **inisialisasi UI**, bukan aturan bisnis “harus N bacaan”.

## Completion / status

**Dengan test point aktif:**

```
COMPLETE =
  setiap CalibrationTestPoint aktif
  punya ≥ 1 MeasurementResult terisi
  pada attempt berjalan
```

| Awal | Akhir | Status |
|---|---|---|
| 25.1 | (kosong) | incomplete |
| 25.1 | 25.8 | complete |

Ulangan tambahan bersifat opsional; tidak membuat “harus isi semua kolom”.

**Tanpa test point (Pattern A):**

- Selesai jika ada ≥ 1 bacaan
- Tidak wajib lima ulangan
- Submit job **tidak** diubah (entry status vs eligibility submit tetap terpisah)

## “+ Tambah Pengulangan”

Tombol dan mekanisme `extraRows` / `extraCols` dipertahankan.

---

# 6. Hard-coded Logic Removed

| Item | Lokasi lama |
|---|---|
| `DEFAULT_REPLICATE_COUNT = 5` | `measurement.ts`, Pattern A page |
| `THREE_REPLICATE_PREFIXES = ["VENT_", "AUD_"]` | `measurement.ts` |
| `expectedReplicateCount(code)` → 3 atau 5 | helper + grid + list + job detail |
| complete = filled ≥ 5 | `parameterEntryStatus` |
| complete = points × expected × directions | `gridEntryStatus` |
| Teks “Standar lembar kerja mencatat 5 ulangan (I–V)” | Pattern A page |
| Teks “mencatat {expected} ulangan” | Pattern B grid |

**Dipertahankan (bukan jumlah ulangan):**

- `usesDirection("SPHYG_PRESSURE_ACC")` untuk Naik/Turun

---

# 7. RBAC/Auth Regression Check

- [x] Tidak ada perubahan authentication / login / session / JWT
- [x] Tidak ada perubahan guard / middleware
- [x] Tidak ada perubahan RBAC / roles / permissions
- [x] Tidak ada perubahan UserMembership
- [x] Tidak ada permission baru / dihapus
- [x] Tidak ada perubahan FCM / notifikasi / service worker

---

# 8. Existing Pattern Regression Check

| Area | Verifikasi |
|---|---|
| Pattern A | Satu slot + Tambah ulangan; payload `replicateIndex` tanpa test point |
| Pattern B | Grid titik × ulangan; `calibrationTestPointId` tetap dikirim |
| Direction | Baris Naik/Turun tetap jika `usesDirection` |
| Symbol | `validateMeasuredDraft` / Symbol Picker tidak diubah |
| Toleransi | Engine backend tidak diubah |
| Save/load | Batch create + PATCH nilai; dirty cell sama |
| Attempt | Filter `attemptNumber === currentAttempt` sama |

**Perubahan status yang disengaja:** chip “Selesai” pada Pattern B muncul setelah setiap titik punya ≥ 1 bacaan, **bukan** setelah 5 kolom penuh.

---

# 9. Tests Executed

```
pnpm --filter @medcal/tech-pwa test
```

- 6 file tes
- 88 tes lulus

```
pnpm --filter @medcal/tech-pwa typecheck
```

- `tsc --noEmit` lulus

Cakupan tes Phase 1:

1. Parameter tanpa test point: 1 bacaan cukup; tidak mengasumsikan 5
2. Dua titik (Awal/Akhir): incomplete jika salah satu kosong
3. Dua titik terisi: complete
4. Label/id generik (Low/High) tanpa hard-code nama
5. 10 ulangan tetap valid
6. `VENT_` / `AUD_` tidak lagi mengubah jumlah ulangan
7. Symbol tetap dihitung sebagai terisi
8. Direction helper Sphyg tidak diubah

---

# 10. Known Limitations / Deferred Work

Sengaja **di luar Phase 1**:

| Item | Alasan |
|---|---|
| LK/PDF rendering | Template I–V tidak disentuh |
| Admin CRUD test point | Katalog test point masih seed/DB |
| Seed Awal/Akhir / L-N/L-G/N-G | Tidak ditambah agar parameter env tidak pindah ke Pattern B tanpa backfill hasil lama |
| Historical backfill `testPointId = NULL` | Keputusan data terpisah |
| Mathematical RANGE | Bukan requirement |
| `isRequired` per test point | Phase 1: aktif = wajib |
| Gate `submitForReview` | Entry status vs submit tetap terpisah |
| `expectedReplicateCount` di katalog | Dilarang untuk Phase 1 |

**Catatan operasional:** UI titik bernama (Awal/Akhir, L-N, …) muncul di lapangan **setelah** baris `CalibrationTestPoint` ada di katalog. Renderer sudah generik; tidak perlu ubah kode Tech-PWA untuk label baru.

---

# 11. Git Diff Summary

File yang termasuk implementasi ini (hanya `apps/tech-pwa`):

- `src/lib/calibration/measurement.ts`
- `src/lib/calibration/measurement.test.ts`
- `src/app/jobs/[id]/measurements/[parameterId]/page.tsx`
- `src/app/jobs/[id]/measurements/measurement-grid.tsx`
- `src/app/jobs/[id]/measurements/measurements-ui.tsx`
- `src/app/jobs/[id]/job-detail-ui.tsx`

**Tidak ada** perubahan di:

- auth / authz / RBAC / roles / permissions / UserMembership
- FCM / notification
- quotation / requisition
- PDF/LK
- document numbering
- Moderate/Strict mode
- Prisma schema / migrations

---

## Prinsip yang diikuti

```
Konfigurasi / data
        ↓
CalibrationTestPoint + replicateIndex
        ↓
Renderer Tech-PWA generik
        ↓
MeasurementResult
```

Bukan: kode per device, per kode parameter, per label, atau jumlah ulangan hard-code.
