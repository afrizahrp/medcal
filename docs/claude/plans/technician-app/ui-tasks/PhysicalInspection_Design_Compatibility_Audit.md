# Physical Inspection Design Compatibility Audit

**Date:** 2026-09-10  
**Mode:** READ-ONLY / AUDIT ONLY — no schema, enum, migration, seed, API, UI, permission, or test changes  
**Inputs:**

- `docs/claude/plans/technician-app/ui-tasks/MeasurementResult_Domain_Decision_Review.md` (locked domain)
- `docs/claude/plans/Calibration-management/measurement-results/MeasurementResult-physical-qualitative-design-proposal.md` (Claude Option **1A**)

**Scope of this audit:** only **physical inspection** (`DevicePhysicalCheckItem` + `PhysicalCheckResult`). Claude’s other items (chip wording, HEPA UI, smoke TEXT, Display/Standar, Awal/Akhir, pH Status, dual-class leakage) are **MeasurementResult / UI** concerns and must not be folded into PhysicalCheckResult.

---

## 1. Executive Summary

Claude’s **Option 1A is architecturally correct for this codebase** and **agrees with the locked domain boundary**: pemeriksaan fisik **di luar** MeasurementResult.

Alasannya di kode, bukan teori:

- `DeviceCalibrationParameter` **wajib** `capabilityItemId` (`schema.prisma` `DeviceCalibrationParameter`). Item fisik LK bukan kapabilitas ukur.
- `MeasurementResult.deviceCalibrationParameterId` **REQUIRED** (komentar F2). Hybrid 1C akan melemahkan invariant itu.
- `isWithinTolerance` + chip `passFailChip()` (`apps/tech-pwa/src/lib/calibration/measurement.ts`) memetakan boolean ke **Sesuai / Tidak sesuai**. Memasukkan Baik ke kolom itu, atau membiarkan NULL → **Perlu telaah**, **melanggar** keputusan domain yang sudah dikunci.
- Tidak ada model checklist/inspeksi fisik di Prisma. Grep katalog: nihil.

**PhysicalCheckResult terpisah memang perlu.** Bukan untuk menambah tabel, melainkan agar tidak merusak MeasurementResult.

Proposal 1A **belum siap design-lock**. Ia menuliskan dua entitas dan `attemptNumber`, tetapi **tidak** mengunci:

- guard lifecycle yang sama dengan `assertMeasurementRowEditable` (hanya `IN_PROGRESS`);
- `companyId`, naming FK, snapshot prosa;
- action RBAC baru vs reuse `recordMeasurement`;
- master per-DeviceType vs global;
- copy-forward pada attempt baru;
- completeness / pengaruh ke submit / MT / laik.

**OVERALL: READY WITH GAPS.**

Analog terdekat di repo:

| Analog | Reuse apa | Jangan reuse apa |
|---|---|---|
| `DeviceCalibrationParameter` per `deviceTypeId` | Catalog per jenis alat + `code`/`name`/`sortOrder`/`isActive` | `capabilityItemId`, UoM, tolerance, `valueType` |
| `MeasurementResult` | Job child, `attemptNumber`, lock IN_PROGRESS, `recordedByUserId`, natural key, list-all-attempts / UI filter current | `isWithinTolerance`, test point, replicate, direction |
| `JobReferenceEquipmentUsed` | Job child terpisah, section UI terpisah, action RBAC sendiri | Unique tanpa attempt; lock hanya SUBMITTED/ACCEPTED (REWORK masih bisa tulis) |
| `DeviceTypeEquipmentRequirement` | Join DeviceType × global type | Hanya cocok jika master fisik **global**; repo kalibrasi parameter **tidak** memakai pola itu |

---

## 2. Existing MedCal Architecture

Backbone ukur (jangan diubah):

```
DeviceType
  DeviceCalibrationParameter  (wajib DeviceCapabilityItem)
    CalibrationTestPoint?
      MeasurementResult  (wajib parameter FK; attemptNumber; natural key)
CalibrationJob.status / currentAttempt / submittedAt / startedAt
QualityReview  (APPROVE | REJECT) — bukan Telaah LK
```

**Di mana physical inspection muat:** sibling **job-scoped result** di bawah `CalibrationJob`, dikatalog per `DeviceType`, **bukan** di bawah `DeviceCapability` / `DeviceCalibrationParameter`.

`CalibrationJob` sudah punya child selain MeasurementResult: `JobEvidence`, `JobReferenceEquipmentUsed`, `CustomerSignature`, `QualityReview`, `IdentityCorrection`. Pola “konsep LK lain = tabel lain” sudah dipakai untuk daftar alat acuan.

Komentar `backfill-calibration-ordering.ts` menyebut urutan LK “environmental → physical/function check → electrical → performance”, tetapi **seed parameter tidak berisi item fisik**. Itu dokumentasi urutan kapabilitas ukur, bukan bukti bahwa fisik sudah ada di catalog.

**Apakah DevicePhysicalCheckItem konsep catalog baru?**  
**Ya.** Tidak ada catalog existing yang bisa mewakilinya tanpa melanggar batas MeasurementResult yang terkunci.

Memaksa ke `DeviceCalibrationParameter`:

- memerlukan `DeviceCapability` / `DeviceCapabilityItem` palsu (“physical check”) yang LK tidak punya sebagai kapabilitas kalibrasi;
- mengisi `uomId`, `decimalPlaces`, `entryStyle`, `replicateIndex`, `direction` sebagai kolom mati;
- menarik baris ke `listMeasurementParameters` / `capabilityGroups` / `anyFail` kecuali difilter terus-menerus.

---

## 3. Existing Checklist / Qualitative Patterns

Pencarian di schema, API, shared, Tech-PWA, Portal, permissions:

| Candidate | Apa adanya | Cocok untuk fisik? |
|---|---|---|
| `MeasurementResult.measuredBool` | HEPA Pass/Fail kinerja (`schema.prisma` komentar eksplisit) | **Tidak.** Domain lock: Pass ≠ Baik. |
| `MeasurementResult.measuredText` | TEXT / rasio literal; engine → `isWithinTolerance` null | **Tidak.** Baik/Tidak Baik adalah pilihan tetap, bukan narasi bebas; chip NULL = Perlu telaah. |
| `CalibrationValueType.BOOLEAN` / `TEXT` | Bentuk nilai **ukur** | **Tidak** untuk inspeksi fisik. |
| `JobEvidence` | Foto + caption | **Tidak.** Bukan checklist. |
| `JobReferenceEquipmentUsed` | Pemilihan unit standar | Pola **struktural** (job child terpisah), bukan semantik inspeksi. |
| `QualityReview.notes` / `decision` | MT APPROVE/REJECT | **Bukan** Telaah, **bukan** fisik. |
| `IdentityCorrection` | Identitas perangkat | Tidak. |
| EquipmentCalibrationRecord `result` string | Kalibrasi alat acuan | Tidak. |
| Checklist / inspection item model | **Tidak ada** | — |

**Kesimpulan:** tidak ada konsep checklist kualitatif yang bisa di-reuse untuk Baik/Tidak Baik. Yang bisa di-reuse adalah **pola** MeasurementResult (attempt + lock) dan **pola** JobReferenceEquipmentUsed (modul terpisah + permission terpisah + UI section terpisah).

---

## 4. Claude Proposal Validation

### 4.1 DevicePhysicalCheckItem

Claude: `deviceTypeId`, `code`, `name`, `inspectionLimit`, `sortOrder`, `isActive`.

| Field / pilihan | Verdict | Alasan dari kode / domain |
|---|---|---|
| `deviceTypeId` | **KEEP** (jika master per-DeviceType) | `DeviceCalibrationParameter.deviceTypeId` adalah pola catalog kalibrasi. Item fisik 3–9 per jenis alat; Kelistrikan 0 item = nol baris, natural. |
| FK `DeviceCapability` / `DeviceCapabilityItem` | **REMOVE** (jangan ditambah) | Parameter ukur wajib capability item. Fisik bukan kapabilitas ukur. |
| Global master + join | **NEEDS BUSINESS DECISION** | Lihat §7. Repo **tidak** menormalisasi “Suhu Ruangan” jadi satu master global; ia menduplikasi `*_ROOM_TEMP` per DeviceType. |
| `inspectionLimit` sebagai prosa | **KEEP** | LK “Batas Pemeriksaan” bukan angka. `toleranceNote` dibaca `parseToleranceNote()` — jangan ditumpangi. |
| `sortOrder` | **KEEP** | Sama `DeviceCalibrationParameter.sortOrder` / `DeviceTypeEquipmentRequirement.sortOrder`. |
| `isActive` | **KEEP** | Pola catalog aktif di seluruh master. |
| `code` unique per DeviceType | **KEEP** (jika per-type) | Analog `@@unique([deviceTypeId, capabilityItemId, code])` tanpa capability. |
| Equivalent existing | **Tidak ada** | — |

### 4.2 PhysicalCheckResult

| Field (Claude) | Verdict | Alasan |
|---|---|---|
| `calibrationJobId` | **KEEP** | Semua hasil job-scoped; `onDelete: Cascade` seperti MeasurementResult. |
| `itemId` | **CHANGE** | Samakan ke `devicePhysicalCheckItemId` (gaya `deviceCalibrationParameterId`). Restrict delete catalog seperti parameter. |
| `attemptNumber` | **KEEP** | MeasurementResult: mirror `CalibrationJob.currentAttempt` at write; attempt lama immutable (`assertMeasurementRowEditable`). JobReferenceEquipmentUsed **tidak** punya ini — **jangan** ikut pola itu. |
| `verdict` BAIK / TIDAK_BAIK | **KEEP** | Field dedicated, **bukan** `isWithinTolerance` / `measuredBool`. Wording LK. Enum Prisma baru **hanya jika implementasi kelak**; bukan `CalibrationValueType`. |
| `note` | **KEEP** (opsional) | MeasurementResult punya `note` opsional. Wajib saat TIDAK_BAIK = **BUSINESS DECISION REQUIRED** (LK tidak mewajibkan). |
| `recordedBy` | **CHANGE** | Kode memakai `recordedByUserId` (`MeasurementResult`). Nullable di schema, diisi write path. |
| `recordedAt` | **KEEP** | Sama MeasurementResult. |
| *(tidak di Claude)* `companyId` | **KEEP** (tambah) | `MeasurementResult.companyId` bare String, list/filter company-scoped. |
| *(tidak di Claude)* `createdAt` / `updatedAt` | **KEEP** (tambah) | Konvensi child table. |
| `replicateIndex` / `direction` / test point | **REMOVE** | LK: satu Keterangan per item. Natural key cukup tanpa diskriminator extra. |
| `isWithinTolerance` | **REMOVE** | Bukan evaluasi toleransi. |
| Snapshot `inspectionLimit` | **NEEDS BUSINESS DECISION** | MeasurementResult **mem-snapshot** bounds agar edit catalog tidak mengubah baris lama. Prosa Batas Pemeriksaan punya risiko yang sama. |

---

## 5. Lifecycle Compatibility

Guard MeasurementResult (`measurement-results.service.ts` `assertMeasurementRowEditable`):

1. `attemptNumber < currentAttempt` → immutable (`MEASUREMENT_ATTEMPT_SUPERSEDED`)
2. status `SUBMITTED` \| `ACCEPTED_BY_QA` **atau** `submittedAt != null` → lock
3. status **harus** `IN_PROGRESS` (PENDING dan **REWORK** ditolak; resume adalah write gate)
4. create juga butuh `startedAt != null`

Ini **bukan** set lock JobReferenceEquipmentUsed (`REFERENCE_EQUIPMENT_LOCKED_JOB_STATUSES` = SUBMITTED + ACCEPTED_BY_QA saja) yang **masih mengizinkan tulis di REWORK**.

PhysicalCheckResult **harus meniru MeasurementResult**, bukan reference equipment. Jangan lifecycle kedua.

| Status | Create/Update PhysicalCheckResult? |
|---|---|
| PENDING | **Tidak** (belum started / bukan IN_PROGRESS) |
| IN_PROGRESS | **Ya** (current attempt only) |
| SUBMITTED | **Tidak** (terkunci) |
| REWORK | **Tidak** (tunggu `resumeAfterRework`) |
| ACCEPTED_BY_QA | **Tidak** |

Jawaban 10 pertanyaan:

1. Create/update hanya IN_PROGRESS? **Ya — reuse guard yang sama.**  
2. SUBMITTED mengunci? **Ya.**  
3. REWORK mengunci? **Ya** (beda dari JobReferenceEquipmentUsed).  
4. RESUME membuka tulis? **Ya** — `resumeAfterRework` tidak increment attempt, hanya REWORK → IN_PROGRESS (`calibration-jobs.service.ts`).  
5. REJECT increment attempt hasil fisik? **Tidak secara terpisah.** `decideQualityReview` REJECT sudah `currentAttempt += 1` sekali. Baris fisik attempt baru memakai angka itu saat ditulis.  
6. Simpan `attemptNumber`? **Ya.**  
7. Attempt lama immutable? **Ya** — sama keputusan MeasurementResult #4.  
8. MT edit PhysicalCheckResult? **Tidak.** Sama `recordMeasurement`: TECHNICIAN only; MT lewat `decideQualityReview`.  
9. MT “review” fisik lewat QualityReview? **Read-only di Portal, seperti pengukuran.** QualityReview **tidak** mereferensi baris ukur hari ini; jangan redesign.  
10. Approval mengubah hasil fisik? **Tidak.** APPROVE tidak menulis MeasurementResult; jangan menulis PhysicalCheckResult.

`submitForReview` **tidak** mengecek kelengkapan MeasurementResult. Physical **jangan** jadi syarat submit kecuali **BUSINESS DECISION REQUIRED**.

---

## 6. Attempt / Rework Compatibility

Skenario:

- Attempt 1: A = BAIK, B = TIDAK_BAIK → submit → MT REJECT (`currentAttempt` 1→2).  
- Resume → IN_PROGRESS, attempt tetap 2.  
- Attempt 2: B dikoreksi BAIK → submit → APPROVE.

**Yang didukung kode MeasurementResult hari ini:** baris attempt 1 **tetap ada**, tidak diedit, tidak dihapus. UI Tech-PWA memfilter `row.attemptNumber !== job.currentAttempt` (`measurements/page.tsx`). Portal memfilter attempt tampilan (`qualityReviewDisplayAttempt`). List API mengembalikan **semua** attempt.

Jika PhysicalCheckResult mengikuti itu:

- DB menyimpan attempt 1 (A BAIK, B TIDAK_BAIK) **dan** attempt 2 (apa pun yang ditulis teknisi).  
- Visibility historis attempt 1: **teknisi UI current-only**; Portal current-attempt untuk keputusan. Melihat attempt lama = pola yang sama dengan pengukuran (list API punya semua baris; UI belum menonjolkan riwayat).

**Copy-forward A=BAIK ke attempt 2?**  
`resumeAfterRework` **tidak** menyalin MeasurementResult. Attempt baru mulai kosong sampai teknisi menulis lagi.

Untuk fisik: apakah semua item harus diisi ulang, atau A tersalin? **BUSINESS DECISION REQUIRED.** LK tidak bilang. Kode existing mendukung “kosong sampai diisi”, bukan auto-copy.

Jangan putuskan kebijakan “harus terlihat di UI riwayat” di luar filter current-attempt yang sudah ada — itu **BUSINESS DECISION REQUIRED** untuk UI, bukan untuk menyimpan kedua attempt.

---

## 7. Master Data Analysis

Claude menanyakan global master + join vs duplikat per DeviceType.

Pola aktual:

- **`DeviceCalibrationParameter`:** duplikat per DeviceType (`BPM_ROOM_TEMP` vs `BSM_ROOM_TEMP`), nama mirip, **bukan** master global “Suhu”.
- **`EquipmentType` + `DeviceTypeEquipmentRequirement`:** type global, join per DeviceType, karena alat acuan **memang** tipe bersama.
- **`DeviceTypeAlias`:** normalisasi ejaan **jenis alat** untuk import, bukan item inspeksi.

Nama fisik berulang (`Kotak kontak alat` / `Kotak Kontak Alat` / `Tusuk kontak alat`) **dan** Batas Pemeriksaan bisa beda per LK. Satu `inspectionLimit` global akan meratakan prosa yang LK bedakan, atau join table tetap membawa limit per type — pada titik itu join **adalah** item per type.

**Rekomendasi audit (bukan lock produk):** ikuti **per-DeviceType** seperti parameter kalibrasi. **Jangan** buat global master hanya karena nama berulang. Variasi ejaan = baris catalog terpisah (atau diseragamkan saat seed — itu keputusan data, bukan skema join).

Jika produk nanti ingin satu ID lintas type: itu kerja normalisasi baru, tidak ada di repo.

---

## 8. Data Invariants

MeasurementResult yang relevan:

- `companyId` + `calibrationJobId`
- `deviceCalibrationParameterId` required
- unique `(job, parameter, testPoint, replicate, attempt, direction)` NULLS NOT DISTINCT
- `attemptNumber >= 1`
- write stamp `attemptNumber = job.currentAttempt`
- lock seperti §5
- `recordedByUserId` di write path

Untuk PhysicalCheckResult, bukti LK = **satu verdict per item per lembar**. Diskriminator extra tidak ada.

Natural key yang **cukup:**

`(calibrationJobId, devicePhysicalCheckItemId, attemptNumber)`

Syarat: item catalog terikat DeviceType job (validasi service: item.deviceTypeId === resolved job device type). Analog: create MeasurementResult menolak parameter yang bukan milik job.

Jangan tambah replicate/direction tanpa use case.

Item catalog `isActive = false` tidak boleh dipilih untuk write baru; baris lama tetap by FK Restrict.

---

## 9. RBAC Analysis

Hari ini (`seed-role-permissions.ts`, `access-control.ts`):

| Role | Measurement | Reference equipment | Quality review |
|---|---|---|---|
| TECHNICIAN | `recordMeasurement` write; `submitForReview`; `resumeAfterRework` | `recordReferenceEquipmentUsed` | tidak decide |
| TECHNICIAN_MANAGER | **tidak** `recordMeasurement` (di-revoke) | **boleh** record + override validity | `decideQualityReview` |
| Keduanya | `calibrationJob:read` (list hasil) | read via job | — |

MT **bukan** inspector. Fisik harus mengikuti **pengukuran**, bukan reference equipment (di mana MT boleh merekam).

| Aktor | Physical write? | Physical read? | Submit? |
|---|---|---|---|
| TECHNICIAN | Ya, IN_PROGRESS | Ya | `submitForReview` yang sudah ada — **tanpa** syarat fisik kecuali dikunci bisnis |
| TECHNICIAN_MANAGER | **Tidak** | Ya (`read`) | Tidak sebagai inspector |
| MT decide | Tidak mengubah baris fisik | Boleh lihat di Portal | APPROVE/REJECT tidak mereferensi fisik |

**Permission baru?** Pola repo: `recordMeasurement` **hanya** MeasurementResult; `recordReferenceEquipmentUsed` terpisah. Mencampur fisik ke `recordMeasurement` membuat catalog permission berbohong.

**TECHNICAL GAP / design:** action baru mis. `recordPhysicalCheck` pada resource `calibrationJob`, grant TECHNICIAN only — **saat implementasi**. Jangan ubah permission sekarang. Jangan beri MT write.

---

## 10. API / Service Analysis

MeasurementResult surface (`calibration-jobs.controller.ts`):

- `GET :id/measurement-results` — `read` — semua attempt
- `POST` / `POST .../batch` / `PATCH` / `DELETE` — `recordMeasurement` + guard

Minimum analog (konseptual, tidak diimplementasikan):

- `GET` catalog item untuk DeviceType job (atau embed di job detail)
- `GET` results job (semua attempt; UI filter current)
- `PUT`/`POST` batch upsert current attempt (checklist 3–9 item — batch lebih cocok daripada 9 POST)
- `PATCH` satu item
- Guard: copy `assertMeasurementRowEditable` + `startedAt`
- Validasi item ∈ DeviceType job
- Stamp `attemptNumber`, `recordedByUserId`, `companyId`

Tidak perlu embed wajib di GET job jika Polar seperti measurements: query terpisah. Tech-PWA measurements sudah query terpisah (`use-measurements-query.ts`).

Jangan panggil engine `computeIsWithinTolerance`.

---

## 11. UI Placement Analysis

Arsitektur sekarang:

- Job detail: section **Alat acuan** (link `/reference-equipment`) terpisah dari **Hasil Pengukuran** (`job-detail-ui.tsx` `MeasurementsSection`).
- Hasil Pengukuran: grouping **`capabilityGroups`** dari `listMeasurementParameters` (hanya NUMBER DIRECT/GRID).
- Entry: `/jobs/[id]/measurements` dan `/measurements/[parameterId]`.
- Submit ada di halaman measurements (`canSubmitForReview`), **bukan** dari kelengkapan fisik (tidak ada).

Domain lock: fisik **bukan** capability section di dalam MeasurementResult.

**Placement yang selaras arsitektur:**

- Section **terpisah** di job detail (sejajar alat acuan / hasil ukur), **bukan** di dalam `capabilityGroups`.
- Route sendiri (mis. analog `/reference-equipment`) **atau** halaman checklist sebelum/sesudah measurements — **jangan** menaruh Baik/Tidak Baik di grid angka.
- Urutan LK: lingkungan → **fisik** → listrik → kinerja. UI ukur saat ini mencampur env/listrik/kinerja sebagai parameter. Menyisipkan fisik ke list itu akan terlihat seperti capability. **Jangan.**

Exact slot (sebelum vs sesudah pengukuran) = **BUSINESS DECISION REQUIRED** / UX. Yang dikunci audit: **bukan** di dalam grouping MeasurementResult.

---

## 12. QualityReview Compatibility

Portal (`[id]/page.tsx`): tabel Parameter / Replicate / Nilai; filter attempt; **tanpa** `isWithinTolerance`. Setujui/Tolak **tidak** membaca MeasurementResult (`decideQualityReview`).

**Reuse:** pola read-only “tampilkan hasil current attempt”.

**Jangan ubah schema QualityReview.**

Future implementation (bukan sekarang):

- Blok baca-saja “Pemeriksaan fisik” di samping hasil ukur.
- Notes item jika ada.
- Attempt lama: sama dengan pengukuran (tidak ditonjolkan kecuali produk minta).
- APPROVE/REJECT **tidak** wajib mereferensi fisik.

Apakah TIDAK_BAIK memblokir approve: **BUSINESS DECISION REQUIRED**; kode dan LK **tidak** mendukung auto-block.

---

## 13. Business Decisions Required

Tidak boleh diisi diam-diam:

1. **Global physical master vs per-DeviceType** — audit condong per-DeviceType (§7); tetap keputusan produk.
2. **Note wajib jika TIDAK_BAIK** — LK tidak mewajibkan.
3. **Apakah setiap REWORK attempt mengisi ulang seluruh checklist** vs copy-forward item yang tidak berubah — resume tidak menyalin MeasurementResult.
4. **Visibility UI attempt fisik lama** — DB boleh menyimpan keduanya; UI current-only seperti pengukuran.
5. **Wajib lengkap sebelum submit** — `submitForReview` tidak mengecek pengukuran.
6. **TIDAK_BAIK vs MT approve** — QualityReview tidak membaca hasil ukur.
7. **TIDAK_BAIK vs laik** — laik belum dimodel; domain lock: jangan rumus.
8. **Partial completion** — MeasurementResult mengizinkan subset.
9. **inspectionLimit immutable catalog vs snapshot di result** — analog snapshot tolerance.
10. **Ad-hoc item oleh teknisi** — catalog kalibrasi tidak mengizinkan parameter ad-hoc di Tech-PWA; LK fisik adalah daftar tetap per jenis alat. Audit: **jangan** ad-hoc kecuali dikunci terpisah.
11. **Permission:** action baru vs reuse `recordMeasurement`.
12. **Label UI** Baik/Tidak Baik vs chip Sesuai (harus terpisah; Claude §2).
13. **HEPA/smoke** tetap MeasurementResult — jangan masuk PhysicalCheckResult.

---

## 14. Claude Proposal Scorecard

| Dimensi | Score | Catatan |
|---|---|---|
| DOMAIN FIT | **PASS** | 1A selaras lock: fisik di luar MeasurementResult; bukan 1B/1C. |
| ARCHITECTURE FIT | **PASS WITH GAPS** | Sibling job-child benar; kurang companyId, FK naming, guard, deviceType check, snapshot. |
| LIFECYCLE FIT | **PASS WITH GAPS** | `attemptNumber` benar; tidak menuliskan IN_PROGRESS-only / REWORK lock / MT no-write. Risiko tertukar dengan lock JobReferenceEquipmentUsed. |
| DATA MODEL FIT | **PASS WITH GAPS** | Dua tabel cukup; master global vs per-type terbuka; unique key cukup. |
| RBAC FIT | **PASS WITH GAPS** | Tidak dibahas. Harus meniru measurement (TECHNICIAN write), bukan reference equipment. |
| UI FIT | **PASS WITH GAPS** | Implicit terpisah dari `anyFail`; tidak menempatkan di job detail vs capability grouping. |

**OVERALL: READY WITH GAPS**

Bukan READY FOR DESIGN LOCK sampai §13 (minimal 1, 3, 5, 11) dikunci.  
Bukan NOT READY: arah 1A benar; 1B/1C ditolak.

---

## 15. Minimum Recommended Design

Konseptual saja — **bukan** schema/kode:

**DevicePhysicalCheckItem** (catalog, no companyId)

- `deviceTypeId`
- `code`, `name`
- `inspectionLimit` (prosa Batas Pemeriksaan)
- `sortOrder`, `isActive`
- unique `(deviceTypeId, code)`

**PhysicalCheckResult** (job instance)

- `companyId`, `calibrationJobId`
- `devicePhysicalCheckItemId`
- `attemptNumber` (stamp `job.currentAttempt`)
- `verdict`: BAIK | TIDAK_BAIK
- `note` opsional
- `recordedByUserId`, `recordedAt`
- unique `(calibrationJobId, devicePhysicalCheckItemId, attemptNumber)`

**Perilaku reuse:**

- Guard identik `assertMeasurementRowEditable` + `startedAt`
- List semua attempt; UI default current attempt
- Batch write current attempt
- Catalog list by job DeviceType; 0 item jika tidak ada (Kelistrikan)
- Permission write TECHNICIAN; MT `read` only
- UI section/route terpisah dari Hasil Pengukuran capability grouping
- Portal read-only later; QualityReview tidak diubah

**Tidak termasuk minimum:** Telaah, laik, 5-tier, klasifikasi B/BF/CF, HEPA, smoke, engine toleransi, copy-forward otomatis, submit gate, global item master.

---

## 16. What Must NOT Change

- MeasurementResult (kolom, FK, natural key, engine)
- CalibrationValueType
- Measurement tolerance engine (`measurement-tolerance.ts`)
- CalibrationJob lifecycle (`PENDING` → `IN_PROGRESS` → `SUBMITTED` → `ACCEPTED_BY_QA` / `REWORK`)
- REWORK (`currentAttempt` +1 hanya di REJECT; RESUME tidak increment)
- QualityReview schema / decide semantics
- Identity Correction
- JobHandOff
- Post-Approval Correction
- `submitForReview` completeness (tetap tidak membaca hasil, kecuali keputusan bisnis **baru** — jangan diam-diam)
- Generic “Result Type” lintas lapisan
- Memasukkan fisik ke `capabilityGroups` / `isWithinTolerance` / chip Sesuai

---

## 17. Final Recommendation

1. **Ya — PhysicalCheckResult terpisah perlu** dan **kompatibel** dengan arsitektur MedCal.  
2. **Jangan** 1B/1C.  
3. **Tiru MeasurementResult** untuk attempt + lock IN_PROGRESS, **bukan** JobReferenceEquipmentUsed.  
4. **Catalog per DeviceType** adalah default yang sesuai repo; global master tidak diwajibkan oleh pola existing.  
5. **Kunci gap §13 sebelum implementasi.**  
6. Claude dokumen §2–§8 (chip, HEPA, smoke, dll.) **bukan** bagian desain fisik; jangan dicampur ke sprint PhysicalCheck.

**Is a separate PhysicalCheckResult really necessary?**  
**Yes.** Tidak ada struktur existing yang jujur tanpa melanggar batas MeasurementResult yang terkunci.

**NO CODE WAS MODIFIED.** File ini satu-satunya artefak.
