# Calibration Result Review — REWORK UI Implementation Report

**Date:** 2026-09-10  
**Scope:** Tech-PWA + Portal UI only. Backend REWORK tidak diubah.  
**Audit:** [CalibrationResult_Review_REWORK_UI_Audit.md](./CalibrationResult_Review_REWORK_UI_Audit.md)  
**Backend:** [CalibrationResult_Review_REWORK_Backend-report.md](./CalibrationResult_Review_REWORK_Backend-report.md)  
**Desain terkunci:** [CalibrationResult_Review_Lifecycle_Design.md](./CalibrationResult_Review_Lifecycle_Design.md)

---

## 1. STATUS

**PASS WITH NOTES**

Gap UI dari audit sudah di-wire ke implementasi existing (hook, StickyActionBar, QualityReviewPanel, RejectDialog pattern, helper status).

Happy-path helper Kirim / Setujui / Selesai tetap hijau. Typecheck Tech-PWA dan Portal PASS.

Catatan: E2E manual di browser **belum dijalankan** (dev server / sesi login tidak tersedia di sesi ini). Checklist ada di bagian 15.

Tidak ada stop-condition yang terpicu:

- Kontrak `POST /calibration-jobs/:id/resume` sesuai backend.
- Option A tetap: tulis pengukuran hanya `IN_PROGRESS`; REWORK locked.
- Identity Correction tidak diubah (hanya reuse pola `RejectDialog`).
- Tidak ada Prisma migration / enum / tabel / framework koreksi baru.

---

## 2. Files changed

### Tech-PWA

| File | Perubahan |
|---|---|
| `apps/tech-pwa/src/app/jobs/[id]/use-job-query.ts` | `useResumeAfterRework` → `POST .../resume`, invalidate `["jobs"]` + `["job", id]` |
| `apps/tech-pwa/src/app/jobs/[id]/page.tsx` | Resume action, visibilitas section REWORK, footer StickyActionBar |
| `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx` | `ResumeAfterReworkAction` (“Lanjutkan perbaikan”); `JobHeaderBlock` notes REJECT |
| `apps/tech-pwa/src/lib/calibration/quality-review.ts` | `shouldShowRejectionFeedback`, `canResumeAfterRework`, `canShowResumeAfterRework` |
| `apps/tech-pwa/src/lib/calibration/quality-review.test.ts` | Mapping stale REJECT, Resume capability, Kirim/Selesai |
| `apps/tech-pwa/src/lib/calibration/measurement.ts` | `shouldShowMeasurementSection` (REWORK tetap terlihat, tidak editable) |
| `apps/tech-pwa/src/lib/calibration/measurement.test.ts` | Visibilitas vs lock REWORK |
| `apps/tech-pwa/src/lib/api-errors.ts` | Kode Resume / Option A / notes REJECT |

### Portal

| File | Perubahan |
|---|---|
| `apps/portal/src/app/management/calibration-jobs/[id]/page.tsx` | Tolak + dialog notes; tampilan REJECT pada REWORK; filter attempt tabel |
| `apps/portal/src/app/management/calibration-jobs/calibration-job-utils.ts` | Rejection feedback, display attempt, `toQualityReviewRejectInput`, error codes |
| `apps/portal/src/app/management/calibration-jobs/calibration-job-utils.test.ts` | Tes mapping + notes + decide gate |
| `apps/portal/src/app/management/permission-management/page.tsx` | Label `resumeAfterRework` |

Tidak diubah: backend, Prisma, Identity Correction domain, JobHandOff, `jobs-ui.tsx` (list sudah memakai `isAwaitingQualityReview`).

---

## 3. Tech-PWA changes

- Resume di footer job detail, pola tombol sama dengan Kirim (tanpa dialog).
- Capability: `calibrationJobResumeAfterRework` **dan** `status === REWORK`. Bukan nama role.
- Saat REWORK: badge **Perbaikan**; catatan MT (`Catatan keputusan`); **Hasil Pengukuran** tetap terlihat dan **terkunci**; copy kunci existing dipertahankan.
- Kirim / Selesai tidak tampil saat REWORK (`canSubmitForReview` / `canCompleteJob` false).
- Setelah Resume: status `IN_PROGRESS` → editor pengukuran existing hidup sendiri (`canRecordMeasurement`).
- Setelah resubmit: `SUBMITTED` + latest `REJECTED` → **Menunggu Review**, bukan Ditolak aktif.

---

## 4. Portal changes

- `QualityReviewPanel`: **Tolak** di samping **Setujui** yang sudah ada (Setujui tidak di-refactor semantiknya).
- Dialog notes wajib, label **Catatan keputusan**, confirm **Tolak**, `disabled={!note.trim()}`.
- Payload: `{ decision: "REJECT", notes }` via `useDecideQualityReview` yang sudah ada.
- Setelah REJECT: refetch job + hasil; badge job REWORK; notes terlihat; decide hilang (`canDecideQualityReview` false).
- Tabel hasil saat REWORK memakai attempt tertolak (`currentAttempt - 1`) agar tidak kosong. Bukan history attempt penuh.
- Permission Management: label `resumeAfterRework`.

---

## 5. Resume implementation

- Hook: `useResumeAfterRework` — `POST /calibration-jobs/:id/resume`.
- Invalidate sama dengan submit/complete: `["jobs"]`, `["job", id]` (key pengukuran di bawah `["job", id, …]` ikut tersapu).
- Tidak ada polling baru. MT REJECT → REWORK tetap lewat poll job 6s yang sudah ada.
- Copy: **Lanjutkan perbaikan** / pending **Melanjutkan…**. Bukan “Mulai Kalibrasi”, bukan “Resume”.

---

## 6. Reject implementation

- Handler terpisah `handleRejectQualityReview`; `handleApproveQualityReview` tetap `{ decision: "APPROVE" }`.
- Notes dikirim hanya jika `trim()` non-kosong (`toQualityReviewRejectInput`).
- `RejectDialog` mendapat `confirmLabel` opsional (default `"Reject"`) agar dialog BA tidak berubah copy. Quality memakai `"Tolak"`.
- Domain Identity Correction tidak dipakai (tidak ada record BA, tidak ada wizard).

---

## 7. REWORK state presentation

| Permukaan | Perilaku |
|---|---|
| Tech-PWA header | `JobStatusBadge` Perbaikan + reviewer / tanggal / **Catatan keputusan** jika latest QR REJECTED |
| Tech-PWA footer | **Lanjutkan perbaikan** jika capability resume |
| Tech-PWA pengukuran | Section terlihat, `entryOpen={canRecordMeasurement}` false, copy kunci REWORK |
| Portal header | `JobStatusBadge` Rework (label existing Portal) |
| Portal panel | Notes REJECT; Setujui/Tolak tidak tampil |

---

## 8. Stale QualityReview handling

Mapping memakai **`job.status` + `reviews[0]`**, bukan `decision === REJECT` saja.

| Job status | Latest QR | UI |
|---|---|---|
| SUBMITTED | (kosong) | Menunggu Review |
| SUBMITTED | REJECTED | Menunggu Review — siklus baru; **tidak** tampilkan notes/badge Ditolak aktif |
| SUBMITTED | APPROVED | Disetujui → Selesai |
| REWORK | REJECTED | Perbaikan + notes |
| IN_PROGRESS | REJECTED | Koreksi berjalan; notes boleh tetap terlihat |
| ACCEPTED_BY_QA | APPROVED | Terminal / Diterima QA |

Helper: `shouldShowRejectionFeedback` = REJECTED **dan** (REWORK atau IN_PROGRESS).

---

## 9. Measurement section visibility handling

Masalah audit: setelah REJECT, `currentAttempt` sudah N+1 tanpa baris → section hilang.

Perbaikan: `shouldShowMeasurementSection` true jika capability record **dan** (`IN_PROGRESS` **atau** `REWORK` **atau** ada baris current attempt).

Editability terpisah: `canRecordMeasurement` tetap hanya `IN_PROGRESS && startedAt`. REWORK **bukan** editor.

Copy kunci: *“Job dikembalikan untuk perbaikan — mulai ulang attempt sebelum mencatat hasil.”*

---

## 10. Permission / capability handling

| Aksi | Flag | Gate status |
|---|---|---|
| Resume | `calibrationJobResumeAfterRework` | `REWORK` |
| Kirim | `calibrationJobSubmitForReview` | `IN_PROGRESS` + started |
| Selesai | `calibrationJobComplete` | `SUBMITTED` + latest APPROVED |
| Catat | `calibrationJobRecordMeasurement` | write hanya `IN_PROGRESS` |
| Setujui / Tolak | `calibrationJobDecideQualityReview` | `SUBMITTED` && !latest APPROVED |

Tidak ada cabang `if (role === "TECHNICIAN")`.

---

## 11. Query invalidation / refetch

| Transisi | Mekanisme |
|---|---|
| Resume | invalidate `["jobs"]` + `["job", id]` (pengukuran ikut) |
| Kirim / Selesai | invalidate existing, tidak diubah |
| MT REJECT / APPROVE | mutate + `query.refetch()` + `measurementResults.refetch()` (sama seperti approve happy path) |
| MT REJECT → teknisi melihat REWORK | poll job 6s existing |
| Portal list | poll existing |

Tidak ada polling baru, tidak ada kenaikan interval, tidak ada duplicate query key.

---

## 12. Tests executed and results

**Tech-PWA** (`pnpm --filter @medcal/tech-pwa test`): **3 files, 40 tests, PASS**

Mencakup:

- Resume hanya dengan capability + REWORK
- Section pengukuran visible + locked di REWORK
- Copy kunci REWORK
- Kirim / Selesai tidak tersedia di REWORK
- SUBMITTED + REJECTED = Menunggu Review, bukan rejection aktif
- SUBMITTED + APPROVED = Selesai
- ACCEPTED_BY_QA terminal
- Setelah Resume / IN_PROGRESS: Kirim tersedia; `canRecordMeasurement` true

**Portal** (`pnpm --filter @medcal/portal test`): **15 files, 146 tests, PASS**

Mencakup:

- Decide tetap hanya SUBMITTED belum APPROVED (regresi Setujui)
- Tolak/decide tidak tersedia di REWORK / IN_PROGRESS
- `toQualityReviewRejectInput`: kosong / whitespace ditolak; notes valid → `{ decision: "REJECT", notes }`
- SUBMITTED + REJECTED = awaiting siklus baru
- Display attempt REWORK = N−1
- Error codes termasuk `QUALITY_REVIEW_NOTES_REQUIRED`, `CALIBRATION_JOB_NOT_IN_REWORK`

Tidak ada tes Identity Correction yang diubah. Tidak ada tes backend yang dijalankan di tugas ini.

---

## 13. Typecheck results

| App | Command | Result |
|---|---|---|
| Tech-PWA | `pnpm --filter @medcal/tech-pwa typecheck` | PASS (`tsc --noEmit`) |
| Portal | `pnpm --filter @medcal/portal typecheck` | PASS (`tsc --noEmit`) |

---

## 14. Happy-path regression results

Diverifikasi lewat helper existing (tidak di-refactor semantiknya):

1. **Kirim** — `canSubmitForReview` hanya IN_PROGRESS + started. PASS
2. **Lock setelah submit** — `canRecordMeasurement` false pada SUBMITTED; copy terkunci existing. PASS
3. **Menunggu Review** — `isAwaitingQualityReview` = SUBMITTED && !APPROVED. PASS
4. **Setujui** — handler APPROVE tidak diubah; `canDecideQualityReview` false setelah APPROVED. PASS
5. **Disetujui** — `JobHeaderBlock` / panel APPROVED existing. PASS
6. **Selesai** — `canCompleteJob` = SUBMITTED + APPROVED. PASS
7. **complete → ACCEPTED_BY_QA** — `isJobDone` tetap hanya ACCEPTED_BY_QA; complete mutation tidak diubah. PASS

Live click-through browser tidak dijalankan (lihat catatan STATUS).

---

## 15. Manual E2E checklist / results

**Hasil:** belum dijalankan di browser. Gunakan checklist berikut.

### A. Happy path regresi

1. Teknisi buka job IN_PROGRESS.
2. Isi pengukuran.
3. Klik **Kirim**.
4. Job menjadi SUBMITTED.
5. Pengukuran terkunci.
6. Portal MT melihat **Menunggu Review**.
7. MT klik **Setujui**.
8. Teknisi melihat **Disetujui**.
9. Teknisi klik **Selesai**.
10. Job menjadi ACCEPTED_BY_QA.

### B. REWORK

1. Teknisi isi pengukuran → **Kirim** → SUBMITTED.
2. MT buka job → **Tolak**.
3. Dialog muncul; notes kosong / spasi tidak bisa confirm.
4. MT isi catatan → confirm.
5. Job REWORK / **Perbaikan**.
6. Teknisi melihat catatan; pengukuran terkunci; **Lanjutkan perbaikan**.
7. Resume → IN_PROGRESS; pengukuran editable.
8. Koreksi → **Kirim** → SUBMITTED.
9. UI **Menunggu Review**; REJECT lama **bukan** keputusan aktif.
10. MT **Setujui** → teknisi **Disetujui** → **Selesai** → ACCEPTED_BY_QA.

### C. Option A (API)

Saat job REWORK, tulis MeasurementResult langsung harus ditolak backend (`MEASUREMENT_JOB_NOT_IN_PROGRESS`). UI sudah menampilkan locked state tanpa mengandalkan tes ini.

### D. Multi-cycle

REJECT → Resume → Kirim → REJECT → Resume → Kirim → APPROVE → Selesai.

Periksa: tidak ada Resume ganda; attempt tidak naik saat Resume; notes lama tidak jadi keputusan aktif setelah resubmit.

---

## 16. Explicit confirmation — NOT changed

| Domain | Status |
|---|---|
| Backend REWORK (transition, guard MeasurementResult, currentAttempt, QualityReview, RBAC API) | **Tidak diubah** |
| Happy-path semantics (Kirim / Setujui / Selesai / copy) | **Tidak diubah** |
| Identity Correction (schema, wizard, BA workflow) | **Tidak diubah** (hanya reuse pola dialog) |
| JobHandOff | **Tidak diubah** |
| Post-approval correction | **Tidak diubah** |
| Prisma schema / migration | **Tidak diubah** |
| Generic correction framework / MeasurementCorrection / REQUEST_CHANGES / QualityReview.attemptNumber | **Tidak dibuat** |
| PASS/FAIL, completeness, signature, PDF, certificate, FCM, WorkOrder DONE, G4 | **Tidak diubah** |
