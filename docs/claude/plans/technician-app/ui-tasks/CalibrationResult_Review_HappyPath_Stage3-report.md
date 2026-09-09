# IMPLEMENTATION REPORT — Calibration Result Review Happy Path (Stage 3)

**Date:** 2026-09-09  
**Status:** Stage 3 complete (UI / end-to-end happy path)  
**Desain terkunci:** [CalibrationResult_Review_Lifecycle_Design.md](./CalibrationResult_Review_Lifecycle_Design.md)  
**Backend Stage 2:** [CalibrationResult_Review_HappyPath_Stage2-report.md](./CalibrationResult_Review_HappyPath_Stage2-report.md)

Tidak ada perubahan backend Stage 2. Tidak ada perubahan Identity Correction. REJECT / REWORK **tidak** diimplementasi.

---

## 0. Identifikasi pola (sebelum kode)

### 1. Pola Identity Correction yang dipakai ulang

| Permukaan | Pola existing | Dipakai untuk |
|---|---|---|
| Tech-PWA submit | `StickyActionBar` + `Button` langsung (tanpa dialog konfirmasi) di `identity-correction/review/page.tsx` | Submit hasil kalibrasi |
| Tech-PWA action slot | Footer job detail (`Mulai Kalibrasi`, `Eskalasi AKD/AKL`, `Ajukan Koreksi Identitas`) | `Kirim` + `Selesai` |
| Tech-PWA error | `ErrorBanner` + `formatApiError` (halaman review BA); error di bawah tombol (`StartCalibrationAction`) | Measurements = ErrorBanner; job detail = di bawah tombol |
| Tech-PWA status | `IDENTITY_CORRECTION_STATUS_LABELS`: `"Menunggu Review"` / `"Disetujui"`; `SectionRow` `"Diputuskan oleh"` | Badge + detail approve MT |
| Portal decide | `CorrectionCard`: tombol **Setujui** langsung (tanpa Tolak pada Stage 3); label `"Catatan keputusan"` | Approve hasil |
| Portal antrian | `ChildActionHint label="Menunggu review"` | Job `SUBMITTED` belum APPROVED |
| Portal inspect | GET `calibrationJob:read` (bukan PATCH pengukuran) | Tabel read-only hasil |

Identity Correction **tidak diubah**. Polaritas BA tetap: teknisi usul, MT decide BA.

### 2. Teks submit yang dipakai ulang (persis)

Dari `apps/tech-pwa/src/app/jobs/[id]/identity-correction/review/page.tsx`:

```
{pending ? "Mengirim…" : "Kirim"}
```

**Bukan** `"Ajukan Koreksi Identitas"` (itu aksi masuk wizard BA, makna bisnis berbeda).  
**Bukan** `"Kirim ke MT"` / `"Submit ke MT"` / `"Kirim Hasil ke MT"`.

### 3. Lokasi Tech-PWA — submit teknisi

1. **Halaman Hasil Pengukuran** — `apps/tech-pwa/src/app/jobs/[id]/measurements/page.tsx` (tempat entry selesai; pola footer sama dengan langkah Kirim BA).
2. **Detail job** — `StickyActionBar` di `apps/tech-pwa/src/app/jobs/[id]/page.tsx` (slot aksi alur yang sudah ada).

Syarat tampil: `calibrationJobSubmitForReview` **dan** `IN_PROGRESS` + `startedAt != null`.

### 4. Lokasi Portal — approve MT

`apps/portal/src/app/management/calibration-jobs/[id]/page.tsx`  
Section **Hasil Pengukuran** (judul existing Tech-PWA), panel decide meniru `CorrectionCard` (**Setujui** saja).

Daftar: hint `"Menunggu review"` pada baris job `SUBMITTED` tanpa QualityReview APPROVED.

### 5. Helper / komponen yang dipakai ulang

- `StickyActionBar`, `Button`, `ErrorBanner`, `StartCalibrationAction` (pola loading/error)
- `IDENTITY_CORRECTION_STATUS_LABELS` / `IdentityCorrectionStatusBadge`
- `ChildActionHint`, `DetailField`, `CorrectionCard` decide chrome (**Setujui**, `"Catatan keputusan"`)
- Lock pengukuran existing: `canRecordMeasurement` / `measurementLockedReason` (`"Job sudah dikirim — hasil pengukuran terkunci."`)
- Endpoints Stage 2: `POST .../submit`, `POST .../quality-decision`, `POST .../complete`
- GET job `reviews[0]`

Tombol complete **tidak** ada padanan BA. Dipakai kata existing di area pengukuran: **"Selesai"** (`measurements-ui.tsx` / `job-detail-ui.tsx`). Bukan `"CLOSED"`, bukan `"Mark as Done"` (itu Work Order).

### 6. File yang diubah (minimal)

Tech-PWA: `types.ts`, `quality-review.ts` (+ tes), `job-display.ts` (+ tes), `api-errors.ts`, `use-job-query.ts`, `page.tsx`, `job-detail-ui.tsx`, `measurements/page.tsx`, `jobs-ui.tsx`.

Portal: `calibration-jobs-ui.tsx`, `calibration-job-utils.ts` (+ tes), `use-calibration-jobs-query.ts`, `use-measurement-results-query.ts` (baru, GET only), `[id]/page.tsx`.

---

## A. Files changed

### Tech-PWA

| File | Perubahan |
|---|---|
| `apps/tech-pwa/src/lib/calibration/types.ts` | `reviews[]` (`TechQualityReview`) |
| `apps/tech-pwa/src/lib/calibration/quality-review.ts` | **Baru.** `canSubmitForReview`, `isAwaitingQualityReview`, `canCompleteJob`, … |
| `apps/tech-pwa/src/lib/calibration/quality-review.test.ts` | **Baru.** |
| `apps/tech-pwa/src/lib/calibration/job-display.ts` | `isJobDone` = hanya `ACCEPTED_BY_QA` |
| `apps/tech-pwa/src/lib/calibration/job-display.test.ts` | SUBMITTED bukan done |
| `apps/tech-pwa/src/lib/api-errors.ts` | Kode Stage 2 |
| `apps/tech-pwa/src/app/jobs/[id]/use-job-query.ts` | `useSubmitForReview`, `useCompleteJob` |
| `apps/tech-pwa/src/app/jobs/[id]/page.tsx` | Kirim + Selesai di footer |
| `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx` | Badge review, `SubmitForReviewAction`, `CompleteJobAction` |
| `apps/tech-pwa/src/app/jobs/[id]/measurements/page.tsx` | Footer **Kirim** |
| `apps/tech-pwa/src/app/jobs/jobs-ui.tsx` | Badge Menunggu Review / Disetujui di antrian |

### Portal

| File | Perubahan |
|---|---|
| `apps/portal/.../calibration-jobs-ui.tsx` | `reviews`, `currentAttempt`; hint `"Menunggu review"` |
| `apps/portal/.../calibration-job-utils.ts` | Helper review + peta error |
| `apps/portal/.../calibration-job-utils.test.ts` | Tes helper + kode error |
| `apps/portal/.../use-calibration-jobs-query.ts` | `useDecideQualityReview` |
| `apps/portal/.../use-measurement-results-query.ts` | **Baru.** GET parameters + results saja |
| `apps/portal/.../calibration-jobs/[id]/page.tsx` | Panel Hasil Pengukuran + **Setujui** |

Identity Correction (wizard, CorrectionCard Tolak, backend BA): **tidak disentuh.**  
API Stage 2: **tidak diubah.**

---

## B. Identity Correction UI pattern reused

- Submit teknisi: `StickyActionBar` + klik langsung **Kirim** / **Mengirim…** (sama seperti langkah 5/5 BA).
- Refresh: invalidate `["jobs"]` + `["job", id]` (sama `useStartCalibration` / `useSubmitIdentityCorrection`).
- Status: label BA `"Menunggu Review"` / `"Disetujui"`; baris `"Diputuskan oleh"` / `"Tanggal"`.
- Portal: chrome `CorrectionCard` untuk decide (**Setujui** + `"Catatan keputusan"`); **tanpa** tombol Tolak pada panel hasil.
- Izin: capability flag, tombol tidak dirender jika grant tidak ada.
- Antrian Portal: `ChildActionHint` `"Menunggu review"` (teks existing, huruf r kecil).

---

## C. Exact submit button wording reused

```
{pending ? "Mengirim…" : "Kirim"}
```

Tidak ada `"Kirim ke MT"`.

Complete (bukan aksi BA): **Selesai**.

MT: **Setujui** (teks `CorrectionCard` persis, termasuk ikon `Check`).

---

## D. Tech-PWA submit implementation

- Capability: `calibrationJobSubmitForReview`.
- Gate UI: `canSubmitForReview` → `status === "IN_PROGRESS" && startedAt != null`.
- Endpoint: `POST /calibration-jobs/:id/submit`.
- Sukses: invalidate query; dari halaman pengukuran `router.replace` ke detail job.
- Setelah submit: status **Terkirim** (`SUBMITTED`); `measurementLockedReason` menampilkan lock existing; **Selesai** tidak tampil sampai `reviews[0].status === "APPROVED"`.
- Tidak ada validasi kelengkapan / PASS-FAIL di UI (backend Stage 2 tidak mensyaratkannya).

---

## E. Portal MT approve implementation

- Capability: `calibrationJobDecideQualityReview`.
- Terlihat sebagai menunggu review: daftar (hint) + detail (badge `PENDING_REVIEW` / form Setujui).
- Inspect: GET `/measurement-parameters` + `/measurement-results` (permission `calibrationJob:read`). Tabel **read-only**. Tidak ada PATCH/POST pengukuran.
- Approve: `POST /calibration-jobs/:id/quality-decision` body `{ decision: "APPROVE", notes? }`.
- QualityReview dibuat backend. UI tidak create QR langsung.
- Sukses: `"Disetujui."` (label status existing).
- **Tidak ada** Tolak / REJECT / REWORK / CorrectionCard hasil / REQUEST CHANGES.

---

## F. Tech-PWA approval / complete implementation

`isJobDone` **hanya** `ACCEPTED_BY_QA`. SUBMITTED tetap open di antrian (`belum selesai`).

| Keadaan | UI teknisi |
|---|---|
| `SUBMITTED` + belum APPROVED | Badge **Menunggu Review**. Tidak ada Selesai. Pengukuran terkunci. |
| `SUBMITTED` + `reviews[0]` APPROVED | Badge **Disetujui**, `Diputuskan oleh`, catatan. Tombol **Selesai** jika `calibrationJobComplete`. |
| `ACCEPTED_BY_QA` | Status **Diterima QA**. Terminal. |

Complete: `POST /calibration-jobs/:id/complete` hanya jika `canCompleteJob` (SUBMITTED + APPROVED).

Poll 6s di detail job: approve MT muncul tanpa reload manual.

---

## G. Permission-aware behavior

| Aksi | Capability | Tanpa grant |
|---|---|---|
| Kirim | `calibrationJobSubmitForReview` | Tombol tidak dirender |
| Setujui | `calibrationJobDecideQualityReview` | Hanya badge Menunggu Review; tidak ada Setujui |
| Selesai | `calibrationJobComplete` | Tombol tidak dirender |

Teknisi tidak mendapat `decideQualityReview` (Stage 2). MT tidak mendapat `submitForReview` / `complete` / `recordMeasurement`. Guard 403 backend tetap berlaku jika dipanggil langsung.

---

## H. Tests / build / verification

| Cek | Hasil |
|---|---|
| `pnpm --filter @medcal/tech-pwa test` | 3 files, **34 passed** |
| `pnpm --filter @medcal/portal test` | 15 files, **141 passed** |
| `pnpm --filter @medcal/tech-pwa typecheck` | exit 0 |
| `pnpm --filter @medcal/portal typecheck` | exit 0 |

Verifikasi browser end-to-end **tidak dijalankan di sesi ini** (tidak ada browser automation). Alur 1–19 di brief perlu diklik manual:

1. Job `IN_PROGRESS` → isi/cek pengukuran → **Kirim** → `SUBMITTED` + lock.
2. Portal MT: hint menunggu review → inspect nilai → **Setujui** → QR APPROVED, nilai tidak berubah.
3. Tech-PWA: **Disetujui** → **Selesai** → `ACCEPTED_BY_QA`.

Duplikat aksi: error backend existing (`CALIBRATION_JOB_ALREADY_SUBMITTED`, `QUALITY_REVIEW_ALREADY_APPROVED`, `CALIBRATION_JOB_ALREADY_COMPLETED`) dipetakan di `formatApiError` / `formatCalibrationJobApiError`.

---

## I. Confirmation: MT cannot edit MeasurementResult

Portal `use-measurement-results-query.ts` hanya GET. `QualityReviewPanel` tidak punya input nilai. Tidak ada pemanggilan PATCH/POST `/measurement-results`. Grant MT `recordMeasurement` sudah dicabut di Stage 2.

---

## J. Confirmation: REJECT / REWORK was NOT implemented

- Tidak ada tombol Tolak pada panel hasil.
- Tidak ada `decision: "REJECT"` dari UI hasil.
- Tidak ada `resumeAfterRework`, increment attempt, CorrectionCard hasil, atau UI resubmit setelah tolak.
- Tombol **Tolak** yang masih ada hanya milik **Identity Correction BA** (tidak diubah).

---

## K. Future gaps discovered but intentionally deferred

| Gap | Alasan ditunda |
|---|---|
| `actionSignals.qualityReviewPending` | Daftar grouped **tidak** menaikkan `"N perlu tindakan"` untuk job menunggu review hasil. Hint ada di child row + filter status SUBMITTED. Extensible di `calibration-job-action-signals.ts`; tidak diubah agar backend Stage 2 tetap terkunci. |
| REJECT / REWORK / resume / attempt+ | Fase berikutnya per desain §D.2–D.3 |
| Validasi kelengkapan / PASS-FAIL / tolerance | Brief Stage 3 |
| Tanda tangan MT, tanda tangan pelanggan, PDF, sertifikat, FCM | Brief Stage 3 |
| Gating `WorkOrder.DONE` | Brief Stage 3 |
| Poll pada Portal job detail | Existing: list poll 6s; detail refetch setelah aksi. MT yang sudah membuka detail sebelum teknisi Kirim perlu refresh/kembali dari list. |
| Complete wording | Tidak ada padanan BA; **"Selesai"** dari chip pengukuran, bukan string permission `"Complete"` |

---

## Alur yang dihubungkan (happy path)

```
TECHNICIAN (Tech-PWA)
  Measurement Result
  → Kirim                    POST /submit
  → SUBMITTED / measurement locked
  → (Menunggu Review)

MT (Portal)
  inspect Hasil Pengukuran (read-only)
  → Setujui                  POST /quality-decision { decision: "APPROVE" }
  → QualityReview APPROVED   (job tetap SUBMITTED)

TECHNICIAN (Tech-PWA)
  melihat Disetujui
  → Selesai                  POST /complete
  → ACCEPTED_BY_QA
```
