# Physical Inspection — Final Design Lock Audit

**Tanggal:** 2026-09-10  
**Mode:** READ-ONLY / AUDIT ONLY — tidak ada perubahan schema, migrasi, API, UI, permission, test, atau Identity Correction  
**Input:** keputusan bisnis yang sudah LOCKED + bukti di repository MedCal  
**Dokumen pendahulu:** `docs/claude/plans/technician-app/ui-tasks/PhysicalInspection_Design_Compatibility_Audit.md`

---

## Executive Summary

Desain Physical Inspection **kompatibel** dengan arsitektur MedCal saat ini dan **tidak bertabrakan** dengan happy path, REWORK, MeasurementResult, atau Identity Correction.

Alasan utamanya:

- Tidak ada model checklist/inspeksi fisik di Prisma. `BAIK` / `TIDAK_BAIK` tidak muncul di luar dokumen audit lama.
- `DeviceCalibrationParameter` **wajib** `capabilityItemId`. Memasukkan inspeksi fisik ke situ akan merusak invariant MeasurementResult.
- `MeasurementResult.deviceCalibrationParameterId` **REQUIRED**. Hybrid ke MeasurementResult tidak sah terhadap keputusan domain yang sudah dikunci.
- Child job yang sudah ada (`JobEvidence`, `JobReferenceEquipmentUsed`, `QualityReview`, `IdentityCorrection`) membuktikan pola “konsep LK lain = tabel lain”.
- Lifecycle yang dikunci (`IN_PROGRESS` only, no copy-forward, REJECT +1 attempt, resume tidak +1) **identik** dengan `assertMeasurementRowEditable` + `decideQualityReview` + `resumeAfterRework`, bukan dengan lock `JobReferenceEquipmentUsed`.
- `submitForReview` **tidak** mengecek kelengkapan MeasurementResult. Tidak menambah submit gate untuk fisik **selaras** dengan kode hari ini.
- `decideQualityReview` **tidak** membaca hasil ukur. TIDAK_BAIK tidak memblokir MT **selaras** dengan kode hari ini.

Analog terdekat yang harus ditiru:

| Analog | Reuse | Jangan reuse |
|---|---|---|
| `DeviceCalibrationParameter` per `deviceTypeId` | Catalog per jenis alat + `code`/`name`/`sortOrder`/`isActive` + unique `(deviceTypeId, code)` | `capabilityItemId`, UoM, tolerance, `valueType`, `entryStyle` |
| `MeasurementResult` | Job child, `attemptNumber`, lock `IN_PROGRESS`, `recordedByUserId`, list semua attempt, UI filter current | `isWithinTolerance`, test point, replicate, direction, `recordMeasurement` |
| `JobReferenceEquipmentUsed` | Section/route UI terpisah + action RBAC sendiri | Unique tanpa attempt; lock hanya SUBMITTED/ACCEPTED (REWORK masih bisa tulis); MT boleh write |

**Verdict: READY WITH BUSINESS DECISIONS.**

Bukan `READY TO IMPLEMENT`: masih ada keputusan yang mengubah kolom schema atau kontrak write (snapshot `inspectionLimit`, perilaku master `isActive` pada write baru, batch vs individual, slot UI persis).  
Bukan `NOT READY`: pemisahan domain, master per-DeviceType, attempt, lifecycle, RBAC konseptual, no-submit-gate, dan no-MT-auto-block sudah terkunci dan cocok dengan repo.

---

## Locked Decisions Verification

Setiap keputusan terkunci dicek terhadap repo. Tidak ada yang ditolak.

| # | Keputusan terkunci | Status vs repo | Bukti |
|---|---|---|---|
| 1 | Domain terpisah dari MeasurementResult | **CONFIRMED compatible** | `DeviceCalibrationParameter.capabilityItemId` required (`packages/db/prisma/schema.prisma` model `DeviceCalibrationParameter`). `MeasurementResult.deviceCalibrationParameterId` REQUIRED (komentar F2). Tidak ada model PhysicalCheck*. |
| 2 | Master per-DeviceType, 0..n item | **CONFIRMED analog** | `DeviceCalibrationParameter.deviceTypeId` + `@@unique([deviceTypeId, capabilityItemId, code])`. `listMeasurementParameters` mengembalikan array kosong jika DeviceType tidak punya parameter eligible. |
| 3 | `DevicePhysicalCheckItem` fields + unique `(deviceTypeId, code)` | **CONFIRMED analog** | Pola catalog: `code`, `name`, `sortOrder`, `isActive` pada `DeviceCalibrationParameter`. `inspectionLimit` analog prosa `toleranceNote`, **bukan** `toleranceMin`/`toleranceMax`. DeviceType **tidak** punya `companyId` (komentar “global master”). |
| 4 | `PhysicalCheckResult` fields + verdict BAIK/TIDAK_BAIK | **CONFIRMED analog + additive enum** | Job child: `companyId`, `calibrationJobId`, `attemptNumber`, `note`, `recordedByUserId`, `recordedAt`, `createdAt`, `updatedAt` pada `MeasurementResult`. Enum baru tidak bentrok dengan `CalibrationJobStatus` / `ReviewDecision` / `CalibrationValueType`. |
| 5 | Note opsional untuk BAIK dan TIDAK_BAIK | **CONFIRMED analog** | `MeasurementResult.note String?`. Zod `note` nullable (`measurementResultCreateSchema`). Tidak ada “note required on fail” di service ukur. |
| 6 | Attempt mengikuti job; no copy-forward; attempt lama immutable | **CONFIRMED analog** | `resumeAfterRework` tidak menyalin MeasurementResult. `assertMeasurementRowEditable` menolak `attemptNumber < currentAttempt` (`MEASUREMENT_ATTEMPT_SUPERSEDED`). |
| 7 | Write hanya `IN_PROGRESS`; REJECT +1 sekali; resume tidak +1 | **CONFIRMED analog** | Guard ukur: PENDING/REWORK/SUBMITTED/ACCEPTED ditolak. `decideQualityReview` REJECT: `currentAttempt: { increment: 1 }` sekali. Resume: hanya `status: "IN_PROGRESS"`. |
| 8 | Permission sendiri `recordPhysicalCheck`; Technician write; MT read | **CONFIRMED analog, action belum ada** | `recordMeasurement` TECHNICIAN only; MT di-revoke. `recordReferenceEquipmentUsed` **jangan** ditiru (MT boleh write). `recordPhysicalCheck` **belum** ada di `permissionCatalog`. |
| 9 | Completeness fisik tidak wajib untuk Kirim | **CONFIRMED compatible** | `submitForReview` hanya cek status + `startedAt`. UI: `canSubmitForReview` “Completeness / PASS-FAIL are not gated here”. |
| 10 | TIDAK_BAIK tidak memblokir MT approve | **CONFIRMED compatible** | `decideQualityReview` tidak membaca MeasurementResult. Portal Setujui/Tolak independen dari nilai ukur. |
| 11 | UI terpisah dari Hasil Pengukuran; bukan di dalam `capabilityGroups` | **CONFIRMED analog** | Job detail: section `Alat Referensi Digunakan` terpisah dari `Hasil Pengukuran`. `capabilityGroups` hanya dari `listMeasurementParameters` (NUMBER DIRECT/GRID). |

Tidak ada keputusan terkunci yang memaksa mengubah MeasurementResult, QualityReview, Identity Correction, atau lifecycle CalibrationJob.

---

## Schema Compatibility

### Yang ada hari ini

Backbone:

```
DeviceType  (global, no companyId)
  └── DeviceCalibrationParameter[]  (wajib capabilityItemId)
        └── CalibrationTestPoint?
              └── MeasurementResult  (wajib parameter FK; attemptNumber)
CalibrationJob
  ├── MeasurementResult
  ├── JobEvidence
  ├── JobReferenceEquipmentUsed
  ├── CustomerSignature
  ├── QualityReview
  └── IdentityCorrection
```

`CalibrationJob` **tidak** punya relasi Company di Prisma; `companyId` adalah String + index. `MeasurementResult.companyId` dikomentari secara eksplisit: *“bare String, no FK — matches the project child-table convention (gap E3)”*. `JobEvidence`, `JobReferenceEquipmentUsed`, `QualityReview`, `IdentityCorrection` mengikuti pola yang sama.

### Tidak ada representasi parsial Physical Inspection

Pencarian `PhysicalCheck` / `physical inspection` / `BAIK` / `TIDAK_BAIK` di schema, API, shared, Tech-PWA, Portal: **nihil** di runtime. Satu-satunya hit adalah dokumen audit lama.

Kandidat yang **bukan** inspeksi fisik:

| Kandidat | Mengapa bukan |
|---|---|
| `MeasurementResult.measuredBool` | HEPA Pass/Fail kinerja (`BSC_HEPA_LEAK` di `seed-device-taxonomy-extension-parameters.ts`) |
| `MeasurementResult.measuredText` | TEXT/RATIO literal; chip NULL = “Perlu telaah” |
| `CalibrationValueType.BOOLEAN` / `TEXT` | Bentuk nilai **ukur** |
| `JobEvidence` | Foto + caption |
| `JobReferenceEquipmentUsed` | Pemilihan unit standar; unique `(calibrationJobId, equipmentId)` **tanpa** attempt |
| `QualityReview.decision` | MT APPROVE/REJECT, bukan Telaah LK fisik |
| `IdentityCorrection` | Identitas perangkat |
| Komentar `backfill-calibration-ordering.ts` “physical/function check” | Urutan kapabilitas ukur LK, **bukan** catalog item fisik |

### Kompatibilitas model yang diusulkan

**DevicePhysicalCheckItem** (catalog global, child `DeviceType`):

- Additive pada `DeviceType` (`physicalCheckItems DevicePhysicalCheckItem[]`) — tidak merusak relasi existing.
- Unique `(deviceTypeId, code)` lebih sederhana daripada parameter (`deviceTypeId, capabilityItemId, code`) karena tidak ada capability.
- `onDelete` catalog → result: analog MeasurementResult memakai **Restrict** pada `deviceCalibrationParameterId`.
- `createdAt`/`updatedAt`/`id` tidak disebut di keputusan terkunci, tetapi **konvensi catalog** di seluruh schema.

**PhysicalCheckResult** (job instance):

- Additive pada `CalibrationJob`.
- Natural key analog yang **terimplikasi** oleh “satu verdict per item per attempt”:  
  `(calibrationJobId, devicePhysicalCheckItemId, attemptNumber)`  
  Tidak perlu `replicateIndex` / `direction` / test point / `NULLS NOT DISTINCT`.
- FK job: `onDelete: Cascade` seperti MeasurementResult.
- FK catalog: `onDelete: Restrict`.
- Enum Prisma baru (mis. `PhysicalCheckVerdict { BAIK TIDAK_BAIK }`) additive; jangan reuse `CalibrationValueType` atau `ReviewDecision`.

**Tidak ada konflik migrasi** dengan tabel existing. Implementasi = dua model baru + relasi + enum, tanpa alter kolom MeasurementResult.

### Koreksi terhadap audit sebelumnya

Audit lama menyatakan create MeasurementResult menolak parameter yang bukan milik DeviceType job. **Itu tidak terbukti di kode.** `MeasurementResultsService.loadCatalog` hanya cek parameter/test-point exist + test-point belongs to parameter. **Tidak** cek `parameter.deviceTypeId === job device type` dan **tidak** cek `isActive`.

Implikasi untuk Physical Inspection: validasi `item.deviceTypeId === resolveJobDeviceTypeId(job)` **harus ditambahkan di service fisik**; jangan mengasumsikan analog ukur sudah melakukannya.

`resolveJobDeviceTypeId` (`calibration-jobs.service.ts`): `calibrationRequestItem.deviceTypeId` lalu fallback PO-item. Bisa `null` → catalog ukur mengembalikan array kosong. Fisik harus memperlakukan DeviceType unresolved sama: tidak ada item, bukan error schema.

---

## Lifecycle & REWORK Compatibility

Guard ukur (`apps/api/src/modules/calibration-jobs/measurement-results.service.ts` `assertMeasurementRowEditable`):

1. `attemptNumber < currentAttempt` → immutable (`MEASUREMENT_ATTEMPT_SUPERSEDED`)
2. status `SUBMITTED` \| `ACCEPTED_BY_QA` **atau** `submittedAt != null` → lock (`MEASUREMENT_JOB_SUBMITTED`)
3. status **harus** `IN_PROGRESS` (PENDING dan **REWORK** ditolak)
4. create juga `startedAt != null` (`CALIBRATION_JOB_NOT_STARTED`)

Lock **berbeda** dari `REFERENCE_EQUIPMENT_LOCKED_JOB_STATUSES` = `{SUBMITTED, ACCEPTED_BY_QA}` — reference equipment **masih bisa ditulis di REWORK**.

Keputusan terkunci #7 **wajib meniru MeasurementResult**, bukan JobReferenceEquipmentUsed.

| Status | Write PhysicalCheckResult (terkunci) | Cocok dengan guard ukur? |
|---|---|---|
| PENDING | Tidak | Ya |
| IN_PROGRESS | Ya (current attempt) | Ya |
| SUBMITTED | Tidak | Ya |
| REWORK | Tidak | Ya |
| ACCEPTED_BY_QA | Tidak | Ya |

Happy path (`apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts`):

- `submitForReview`: `IN_PROGRESS` → `SUBMITTED` + `submittedAt`. Tidak membaca hasil ukur. Tidak ada gate fisik yang harus ditambah.
- `decideQualityReview` APPROVE: buat `QualityReview`; job tetap SUBMITTED; tidak menulis MeasurementResult.
- `decideQualityReview` REJECT: atomik SUBMITTED → REWORK, `submittedAt` null, `currentAttempt += 1` **sekali**, notes wajib.
- `resumeAfterRework`: REWORK → IN_PROGRESS; **tidak** increment attempt; **tidak** menyalin result.

Tidak ada konflik dengan Identity Correction (jalur `deviceId` / serial / AKD-AKL, orthogonal).

**Risiko implementasi:** menyalin lock reference equipment secara tidak sengaja akan mengizinkan tulis fisik saat REWORK — itu **melanggar** keputusan terkunci #7.

---

## Attempt Semantics

`CalibrationJob.currentAttempt` default 1; increment **hanya** di REJECT (`calibration-jobs.service.ts`). Resume tidak mengubah angka.

MeasurementResult: `attemptNumber` di-stamp `job.currentAttempt` pada create. Attempt lama tidak diedit/dihapus (komentar schema decision #4).

Skenario terkunci:

- Attempt 1: Body/Power Cable/Fuse = BAIK → submit → MT REJECT (`currentAttempt` 1→2).
- Resume → IN_PROGRESS, attempt tetap 2.
- Attempt 2: baris fisik **kosong** sampai teknisi menulis ulang. No copy-forward.

Ini **sudah** perilaku MeasurementResult. UI Tech-PWA memfilter `row.attemptNumber !== job.currentAttempt` (`apps/tech-pwa/src/app/jobs/[id]/measurements/page.tsx`, `apps/tech-pwa/src/app/jobs/[id]/page.tsx`). List API mengembalikan **semua** attempt (`measurements.list`).

Portal: `qualityReviewDisplayAttempt` (`apps/portal/src/app/management/calibration-jobs/calibration-job-utils.ts`) menampilkan attempt `current-1` saat status REWORK (karena attempt baru belum punya baris), selain itu `currentAttempt`.

Tidak ada copy-forward di `resumeAfterRework`. Keputusan #6 **selaras** dengan kode, bukan kebijakan baru yang bertentangan.

---

## RBAC Compatibility

Catalog aksi (`packages/auth/src/access-control.ts` `permissionCatalog.calibrationJob`):

- Ada: `read`, `start`, `recordMeasurement`, `recordReferenceEquipmentUsed`, `submitForReview`, `decideQualityReview`, `resumeAfterRework`, …
- **Tidak ada:** `recordPhysicalCheck`

Seed (`packages/db/prisma/seed-role-permissions.ts`):

- TECHNICIAN: `recordMeasurement`, `submitForReview`, `resumeAfterRework`, `complete`
- TECHNICIAN_MANAGER: `decideQualityReview`; **revoke** `recordMeasurement`
- Keduanya: `calibrationJob:read`
- TECHNICIAN_MANAGER **boleh** `recordReferenceEquipmentUsed` — analog yang **salah** untuk fisik

Pola menambah aksi (wajib diikuti saat implementasi, bukan sekarang):

1. Tambah string ke `permissionCatalog.calibrationJob`
2. Seed grant TECHNICIAN
3. `MeController` capability flag + `packages/auth/src/me-types.ts`
4. Label Portal `apps/portal/src/app/management/permission-management/page.tsx` (`ACTION_LABELS`)
5. `@RequirePermission("calibrationJob", "recordPhysicalCheck")` pada write
6. GET memakai `calibrationJob:read` (seperti `GET measurement-results`)

Nama `recordPhysicalCheck` **secara konseptual terkunci** (keputusan #8) dan cocok dengan konvensi camelCase `recordMeasurement` / `recordReferenceEquipmentUsed`. Itu **bukan** BDR tersisa.

Read MT: `calibrationJob:read` sudah dimiliki TECHNICIAN_MANAGER. Tidak perlu action `readPhysicalCheck` terpisah kecuali produk memintanya — analog ukur tidak memisahkan read.

Tech-PWA: section pengukuran hanya tampil jika `calibrationJobRecordMeasurement` (`shouldShowMeasurementSection` di `apps/tech-pwa/src/lib/calibration/measurement.ts`). MT di Tech-PWA **tidak** melihat Hasil Pengukuran. Review MT ada di Portal. Fisik harus mengikuti itu: write di PWA untuk teknisi; read-only di Portal untuk MT.

Master CRUD analog: `deviceCalibrationParameter:read/create/update/delete` + halaman Portal `apps/portal/src/app/management/device-calibration-parameters/`. Resource master fisik **belum** dikunci. Itu urusan implementasi catalog, bukan write-path job.

---

## API Compatibility

Konvensi nested-under-job (`apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts`):

| MeasurementResult | Reference equipment |
|---|---|
| `GET :id/measurement-parameters` (`read`) | `GET :id/reference-equipment-candidates` (`read`) |
| `GET :id/measurement-results` (`read`, semua attempt) | `GET :id/reference-equipment-used` (`read`) |
| `POST :id/measurement-results` | — |
| `POST :id/measurement-results/batch` (create-many, **bukan upsert**) | `PUT :id/reference-equipment-used` (**replace-all**) |
| `PATCH :id/measurement-results/:measurementId` | — |
| `DELETE :id/measurement-results/:measurementId` | — |
| Permission: `recordMeasurement` | Permission: `recordReferenceEquipmentUsed` |

Zod shared: `packages/shared/src/schemas/index.ts` (`measurementResultCreateSchema`, batch max 200, update hanya field nilai).

Tech-PWA measurements memakai query terpisah (`apps/tech-pwa/src/app/jobs/[id]/measurements/use-measurements-query.ts`), tidak embed wajib di GET job.

Physical inspection **belum** punya route/schema. Analog cukup untuk **bentuk** (nested job + GET catalog + GET results + write terpisah + jangan panggil `computeIsWithinTolerance`). **Bentuk persis** (path, upsert vs create+patch, batch-only) **belum terkunci** — lihat Unresolved Decisions.

Validasi yang harus ada di service fisik (dari analog + keputusan):

- Company-scope `findFirst({ id, companyId })`
- Guard copy `assertMeasurementRowEditable` + `startedAt`
- Stamp `attemptNumber = job.currentAttempt`, `recordedByUserId`, `companyId`
- Item ∈ DeviceType job (ini **lebih ketat** daripada MeasurementResult hari ini)
- Unique natural key → conflict code analog `MEASUREMENT_DUPLICATE_ENTRY`

---

## Tech-PWA Compatibility

Struktur job detail (`apps/tech-pwa/src/app/jobs/[id]/page.tsx` + `job-detail-ui.tsx`):

1. Header / identitas
2. **Alat Referensi Digunakan** — section + route `/jobs/[id]/reference-equipment`
3. **Hasil Pengukuran** — section + route `/jobs/[id]/measurements` (+ `/measurements/[parameterId]`)
4. Identity Corrections

`MeasurementsSection` grouping **hanya** `capabilityGroups`. Keputusan #11 (jangan masuk ke situ) **selaras**.

Pola UI yang bisa ditiru tanpa menaruh fisik di dalam pengukuran:

- Section baru di job detail (sejajar alat acuan / hasil ukur)
- Route sendiri analog `/reference-equipment` atau `/measurements`

Entry ukur: `canRecordMeasurement` = `IN_PROGRESS && startedAt`. REWORK menampilkan section terkunci (`shouldShowMeasurementSection`) dengan alasan “mulai ulang attempt”. Submit Kirim ada di halaman measurements, **bukan** dari kelengkapan fisik.

Empty-state ukur:

- DeviceType unresolved → `EmptyState` “Jenis alat belum dapat ditentukan”
- Nol parameter eligible → “Tidak ada parameter pengukuran yang didukung”

Kirim: `canSubmitForReview` (`apps/tech-pwa/src/lib/calibration/quality-review.ts`) tidak membaca hasil. Menambah fisik tanpa submit gate **tidak** merusak halaman measurements.

Chip `passFailChip()` / `isWithinTolerance` (`apps/tech-pwa/src/lib/calibration/measurement.ts`) memetakan boolean ke Sesuai/Tidak sesuai. Verdict BAIK/TIDAK_BAIK **tidak boleh** memakai chip itu.

---

## Portal Compatibility

Halaman job (`apps/portal/src/app/management/calibration-jobs/[id]/page.tsx`): accordion **Alat Referensi yang Digunakan** lalu **Hasil Pengukuran** (`QualityReviewPanel`) lalu Identity Corrections.

`QualityReviewPanel`:

- Tabel Parameter / Replicate / Nilai
- Filter `qualityReviewDisplayAttempt`
- **Tidak** menampilkan `isWithinTolerance`
- Setujui/Tolak memakai `decideQualityReview`; tidak membaca baris ukur

Pola read-only yang benar: blok **terpisah** “Pemeriksaan fisik” di samping (bukan di dalam) tabel pengukuran. Jangan ubah schema `QualityReview`. Jangan auto-REJECT dari TIDAK_BAIK.

Portal **boleh** menulis alat acuan (MT punya `recordReferenceEquipmentUsed`). Portal **tidak** menulis MeasurementResult. Fisik harus seperti pengukuran: MT read-only.

Label permission `recordPhysicalCheck` belum ada di `ACTION_LABELS`.

Master analog: CRUD `device-calibration-parameters`. Belum ada halaman Physical Check Item.

---

## Unresolved Decisions

Hanya item yang **benar-benar belum terkunci** oleh keputusan bisnis atau konvensi unik di repo. Tidak mengisi gap dengan keputusan baru.

### Masih BUSINESS DECISION REQUIRED

| # | Item | Mengapa masih terbuka | Dampak jika ditunda |
|---|---|---|---|
| U1 | **`inspectionLimit` snapshot vs live master** | MeasurementResult men-snapshot `effectiveToleranceMin/Max` karena verdict **dihitung**. Verdict fisik **dipilih teknisi**, bukan dihitung dari prosa Batas Pemeriksaan. Analog **lemah**. Field terkunci `PhysicalCheckResult` **tidak** memuat snapshot. | Mengubah kolom schema. Jika catalog diedit, hasil historis bisa berubah teks batas. |
| U2 | **Batch-only vs batch + individual update** | Dua analog: MeasurementResult = POST + POST `/batch` (create, bukan upsert) + PATCH + DELETE. JobReferenceEquipmentUsed = PUT replace-all. Checklist 3–9 item cocok ke keduanya. Tidak dikunci. | Kontrak API + UX entry (satu-satu vs simpan semua). |
| U3 | **Slot UI persis** (sebelum/sesudah pengukuran; section saja vs route sendiri) | Yang dikunci hanya: terpisah dari Hasil Pengukuran, bukan di `capabilityGroups`. Urutan LK (`backfill-calibration-ordering.ts`) = lingkungan → fisik → listrik → kinerja, tetapi UI ukur mencampur env/listrik/kinerja sebagai parameter. Analog job detail: alat acuan dulu, lalu pengukuran. | Tidak mengubah schema. Mengubah struktur halaman PWA/Portal. |
| U4 | **Master `isActive=false` pada write baru** | `listMeasurementParameters` memfilter `isActive: true`. `loadCatalog` write **tidak** cek `isActive`. Baris lama tetap hidup via Restrict. Analog **inkonsisten**. | Aturan validasi write + apakah item nonaktif masih muncul di attempt baru. |

### Bukan BDR — sudah ditentukan oleh lock atau konvensi unik repo

| Item yang ditanyakan | Status | Alasan |
|---|---|---|
| Exact API shape | **Analog cukup, kontrak belum ditulis** | Nested-under-job + GET catalog + GET all-attempts + write permission terpisah. Nama path persis (`physical-check-results` vs lain) adalah detail implementasi, bukan keputusan bisnis domain. Tetap harus dipilih saat implementasi; tidak mengubah model konseptual. |
| Historical attempt visibility | **Analog unik** | List API semua attempt; Tech-PWA current-only; Portal `qualityReviewDisplayAttempt`. Keputusan #6 mengunci immutability historis, bukan history viewer baru. Viewer riwayat = BDR **hanya jika** produk ingin berbeda dari pengukuran. |
| Empty-state DeviceType 0 item | **Analog unik** | Ukur menampilkan empty state, bukan error. Keputusan #2 secara eksplisit mengizinkan nol item. |
| Ad-hoc inspection items | **RESOLVED by lock** | Master `DevicePhysicalCheckItem` per-DeviceType. Tech-PWA tidak bisa membuat `DeviceCalibrationParameter`. Item ad-hoc akan menentang master terkunci. |
| Exact permission/action naming | **RESOLVED by lock** | Konseptual `recordPhysicalCheck` pada `calibrationJob`. Cocok camelCase catalog. Read = `calibrationJob:read`. |
| `companyId` / FK conventions | **RESOLVED by convention** | Catalog DeviceType-level: **tanpa** `companyId`. Result: `companyId` bare String, `calibrationJobId` Cascade, catalog FK Restrict, index `companyId`. Jangan FK `Company` di child result (MeasurementResult sengaja tanpa itu). |

### Bukan BDR — di luar Physical Inspection

- Telaah, laik, 5-tier, HEPA, smoke, engine toleransi, Identity Correction, Post-Approval Correction.
- Isi seed item per DeviceType (Body / Power Cable / Fuse, dll.) adalah **data catalog**, bukan schema lock. Nol item adalah state sah.

---

## Implementation Blockers

Tidak ada blocker arsitektur yang membuat desain **tidak bisa** diimplementasikan. Yang ada adalah **prakondisi implementasi** dan **keputusan schema yang masih terbuka**.

**Bukan blocker (diharapkan belum ada):**

- Model Prisma `DevicePhysicalCheckItem` / `PhysicalCheckResult`
- Enum `PhysicalCheckVerdict`
- Action `recordPhysicalCheck` di catalog/seed/`/me`
- Route API / Zod / Tech-PWA / Portal section
- Seed/CRUD master (nol item sah)

**Harus diputuskan sebelum freeze schema (U1, U4):**

- Apakah `PhysicalCheckResult` menyimpan salinan `inspectionLimit`?
- Apakah write baru boleh merujuk item `isActive=false`?

**Harus dipilih saat desain API/UI (U2, U3), tidak memblokir mulai schema jika default analog dipakai — tetapi audit ini tidak mengunci default itu:**

- Create+PATCH+batch vs replace-all
- Posisi section / route

**Jebakan implementasi (bukan BDR):**

- Jangan reuse `recordMeasurement`
- Jangan reuse lock reference equipment (REWORK writable)
- Jangan taruh di `capabilityGroups`
- Jangan panggil `computeIsWithinTolerance` / chip Sesuai
- Jangan asumsi MeasurementResult sudah memvalidasi DeviceType pada create — service fisik harus memvalidasi sendiri
- Jangan ubah Identity Correction, QualityReview schema, atau `submitForReview` completeness
- Jangan copy-forward pada resume

---

## Final Verdict

**READY WITH BUSINESS DECISIONS**

Desain terkunci **cukup dan kompatibel** untuk implementasi domain terpisah (`DevicePhysicalCheckItem` + `PhysicalCheckResult`) tanpa merusak MeasurementResult, happy path, REWORK, RBAC pengukuran, atau Identity Correction.

Implementasi schema penuh **belum** boleh dianggap terkunci sampai U1 (snapshot `inspectionLimit`) dan U4 (inactive master pada write) diputuskan secara eksplisit. U2 dan U3 tidak memblokir model konseptual, tetapi masih BUSINESS DECISION REQUIRED untuk kontrak API dan penempatan UI.

**NO CODE WAS MODIFIED.** File ini satu-satunya artefak.
