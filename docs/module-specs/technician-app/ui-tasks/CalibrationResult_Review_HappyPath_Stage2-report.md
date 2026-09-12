# IMPLEMENTATION REPORT — Calibration Result Review Happy Path (Stage 2)

**Date:** 2026-09-09  
**Status:** Stage 2 complete (backend happy path only)  
**Desain terkunci:** [CalibrationResult_Review_Lifecycle_Design.md](../../../domain-decisions/CalibrationResult_Review_Lifecycle_Design.md)

Tidak ada migrasi Prisma. Tidak ada perubahan Identity Correction. Cabang REJECT / REWORK **tidak** diimplementasi.

---

## 0. Scope yang dikerjakan vs ditunda

### Dikerjakan

```
IN_PROGRESS
  → SUBMITTED                    (teknisi submitForReview)
  → SUBMITTED + QualityReview APPROVED  (MT quality-decision APPROVE)
  → ACCEPTED_BY_QA               (teknisi complete)
```

### Sengaja ditunda (desain §D.2–D.3 / brief Stage 2)

- REJECT / `returnForRework` / `REWORK`
- `resumeAfterRework` / increment `currentAttempt`
- loop koreksi teknisi + resubmit setelah tolak
- UI Portal/Tech-PWA (tombol submit / approve / complete, CorrectionCard)
- kelengkapan pengukuran, PASS/FAIL, signature, PDF, sertifikat, notifikasi
- gating `WorkOrder.DONE`
- enum `CLOSED` / `REVISION_REQUIRED` / tabel koreksi baru

---

## A. Files changed

| File | Perubahan |
|---|---|
| `packages/auth/src/access-control.ts` | Catalog: `submitForReview`, `decideQualityReview`; komentar `recordMeasurement` = teknisi saja. `complete` sudah ada. |
| `packages/auth/src/me-types.ts` | Capabilities: `calibrationJobSubmitForReview`, `calibrationJobDecideQualityReview`, `calibrationJobComplete`. |
| `apps/api/src/modules/me/me.controller.ts` | Proyeksi ketiga capability ke `GET /me`. |
| `packages/db/prisma/seed-role-permissions.ts` | Grant baru + **hapus** `TECHNICIAN_MANAGER` + `recordMeasurement`. |
| `packages/db/prisma/backfill-quality-review-happy-path-permissions.ts` | **Baru.** Upsert grant + delete grant MT tulis pengukuran. |
| `packages/db/prisma/backfill-measurement-result-permissions.ts` | Tidak lagi meng-grant `recordMeasurement` ke MT (aman jika di-re-run). |
| `packages/db/package.json` | Script `backfill:quality-review-happy-path-permissions`. |
| `packages/shared/src/schemas/index.ts` | `qualityReviewDecisionSchema` — `decision: "APPROVE"` saja. |
| `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` | `submitForReview`, `decideQualityReview`, `complete`; include `reviews` take 1. |
| `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts` | Tiga route baru. |
| `apps/api/src/modules/calibration-jobs/measurement-results.service.ts` | Komentar izin: MT bukan editor. |
| `apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts` | Suite happy path + RBAC. |
| `apps/api/src/modules/calibration-jobs/measurement-results.service.test.ts` | Editor tes = TECHNICIAN; guard MT ditolak. |
| `apps/portal/src/app/management/permission-management/page.tsx` | Label `submitForReview` / `decideQualityReview`. |

Identity Correction (service, controller, schema BA, wizard Tech-PWA, Portal CorrectionCard): **tidak disentuh.**

---

## B. Backend / API

| Method | Path | Permission | Efek |
|---|---|---|---|
| POST | `/calibration-jobs/:id/submit` | `submitForReview` | `IN_PROGRESS` → `SUBMITTED`, `submittedAt = now()`. `currentAttempt` tidak berubah. |
| POST | `/calibration-jobs/:id/quality-decision` | `decideQualityReview` | Body `{ decision: "APPROVE", notes?: string }`. Membuat `QualityReview`. Job **tetap** `SUBMITTED`. |
| POST | `/calibration-jobs/:id/complete` | `complete` | Hanya jika `SUBMITTED` **dan** QualityReview terbaru `APPROVED`. → `ACCEPTED_BY_QA`. |
| GET | `/calibration-jobs/:id` | `read` | Payload job sekarang menyertakan `reviews[0]` (QR terbaru) agar klien bisa melihat “MT sudah approve”. |

Konkurensi: `submit` / `complete` memakai `updateMany` dengan `where.status` sumber. Double-submit / double-complete / double-approve ditolak.

Kode error:

| Kode | Kapan |
|---|---|
| `CALIBRATION_JOB_ALREADY_SUBMITTED` | Submit ulang dari `SUBMITTED` / `ACCEPTED_BY_QA` |
| `CALIBRATION_JOB_NOT_IN_PROGRESS` | Submit dari status bukan `IN_PROGRESS` |
| `CALIBRATION_JOB_NOT_SUBMITTED` | Approve/complete dari status salah |
| `QUALITY_REVIEW_ALREADY_APPROVED` | Approve kedua |
| `QUALITY_REVIEW_NOT_APPROVED` | Complete sebelum MT approve |
| `CALIBRATION_JOB_ALREADY_COMPLETED` | Complete kedua |
| `INVALID_QUALITY_REVIEW_DECISION` | Body bukan `{ decision: "APPROVE" }` (termasuk `REJECT`) |
| `MEASUREMENT_JOB_SUBMITTED` | Guard existing setelah submit / setelah `ACCEPTED_BY_QA` |

Lock pengukuran **tidak diubah**: tetap `status ∈ {SUBMITTED, ACCEPTED_BY_QA}` atau `submittedAt !== null`.

---

## C. Permission changes

| Action | TECHNICIAN | TECHNICIAN_MANAGER |
|---|---|---|
| `recordMeasurement` | ya | **dicabut** |
| `submitForReview` | ya | tidak |
| `complete` | ya | tidak |
| `decideQualityReview` | tidak | ya |

ADMIN / SUPERVISOR / FINANCE: bukan approver (mirror Identity Correction). SUPERADMIN tetap bypass.

**Produksi / pkmdb yang sudah di-seed:**

```
pnpm --filter @medcal/db run backfill:quality-review-happy-path-permissions
```

Idempotent. Seed `seed-role-permissions.ts` juga `deleteMany` grant MT `recordMeasurement` jika masih ada.

---

## D. QualityReview behavior

- **Tidak** dibuat saat teknisi submit (`reviewerUserId` wajib di schema).
- Dibuat **saat MT decide APPROVE**:
  - `status = APPROVED`
  - `decision = APPROVE`
  - `reviewerUserId` = user MT
  - `reviewedAt = now()`
  - `notes` opsional
- Tidak menulis `MeasurementResult`.
- `QualityReviewStatus.PENDING` tidak dipakai di Stage 2.
- Relasi 1:N existing; GET job mengambil baris terbaru (`orderBy createdAt desc`, `take: 1`).

---

## E. State transitions implemented

```
PENDING
  └── start (sudah ada) ──► IN_PROGRESS
                              └── submitForReview ──► SUBMITTED  (submittedAt terisi, hasil terkunci)
                                    └── quality-decision APPROVE
                                          job tetap SUBMITTED
                                          QualityReview APPROVED
                                          └── complete ──► ACCEPTED_BY_QA  (terminal)
```

`currentAttempt` tetap 1 sepanjang happy path.

---

## F. Tests added / passed

Perintah:

```
pnpm --filter @medcal/api test -- src/modules/calibration-jobs/calibration-jobs.service.test.ts src/modules/calibration-jobs/measurement-results.service.test.ts
```

**Hasil:** 2 file, **130 passed** (2026-09-09).

Cakupan happy path (sesuai brief):

1. Teknisi submit `IN_PROGRESS` → `SUBMITTED`, `submittedAt` terisi.
2. `MeasurementResult` terkunci setelah submit.
3. MT approve membuat QualityReview APPROVED.
4. Approve **tidak** mengubah nilai pengukuran.
5. Approve **tidak** memindahkan job ke `ACCEPTED_BY_QA`.
6. Complete sebelum approve ditolak (`QUALITY_REVIEW_NOT_APPROVED`).
7. Complete setelah approve → `ACCEPTED_BY_QA`.
8. Setelah terminal, pengukuran tetap terkunci.
9. Double-submit / duplicate approve / duplicate complete ditolak.
10. Payload `REJECT` ditolak Zod; job tetap `SUBMITTED`, tidak ada QR.
11. Guard: teknisi boleh submit+complete, tidak boleh decide; MT boleh decide, tidak boleh submit/complete/`recordMeasurement`; ADMIN/FINANCE ditolak dari aksi baru.

Tes pengukuran yang sebelumnya memakai `TECHNICIAN_MANAGER` sebagai editor diubah ke `TECHNICIAN` agar tidak mengesankan MT boleh menulis nilai.

---

## G. Verifikasi MT tidak mengedit MeasurementResult

1. RBAC: grant `recordMeasurement` untuk `TECHNICIAN_MANAGER` dihapus.
2. `@RequirePermission("calibrationJob", "recordMeasurement")` pada create/update/delete — guard tes menolak MT.
3. `decideQualityReview` hanya `qualityReview.create` — tidak ada `measurementResult.update`.
4. Tes happy path: setelah approve, `measuredValue` tetap 50, `recordedByUserId` tetap teknisi.

Tidak ada exception role di dalam `assertMeasurementRowEditable` (tetap role-blind pada lock status). Larangan MT = RBAC.

---

## H. Konfirmasi: REWORK / REJECT TIDAK diimplementasi

- Tidak ada method `returnForRework` / `resumeAfterRework`.
- Tidak ada increment `currentAttempt`.
- Zod quality-decision: `z.literal("APPROVE")` saja.
- Tidak ada CorrectionCard / UI koreksi untuk alur ini.
- Identity Correction BA tidak diubah.

---

## I. Blockers / future gaps

**Blocker happy path:** tidak ada.

**Gap non-blocking (fase berikutnya, jangan ditarik ke Stage 2):**

| Gap | Catatan |
|---|---|
| UI Tech-PWA submit / complete | Capability `GET /me` sudah ada; tombol belum. |
| UI Portal MT approve | Endpoint `quality-decision` siap; kartu review belum. |
| `isJobDone` di Tech-PWA | Masih menganggap `SUBMITTED` = selesai. Setelah UI, perlu QR APPROVED vs menunggu MT. |
| REJECT → REWORK → resume | Desain Stage 1 §D.2–D.3; belum kode. |
| Kelengkapan / PASS-FAIL / parameter wajib | Tidak divalidasi di submit. |
| Tanda tangan MT, PDF, Certificate, FCM | Di luar brief. |
| Gating `WorkOrder.DONE` | WO masih bisa `done` tanpa job `ACCEPTED_BY_QA`. |
| DB produksi | Jalankan backfill izin di atas. |

---

## Audit trail happy path (tanpa AuditLog baru)

| Peristiwa | Jejak |
|---|---|
| Teknisi submit | `CalibrationJob.status = SUBMITTED`, `submittedAt` |
| MT approve | `QualityReview` APPROVED (`reviewerUserId`, `reviewedAt`, `notes?`) |
| Teknisi close | `status = ACCEPTED_BY_QA` |
| Siapa isi hasil | `MeasurementResult.recordedByUserId` / `recordedAt` |

---

## HARD STOP berikutnya

Stage 2 backend happy path selesai. Jangan lanjut REJECT/REWORK atau UI penuh sampai diminta eksplisit.
