# REWORK Backend Implementation Report

**Date:** 2026-09-10  
**Scope:** Backend only. UI Portal / Tech-PWA tidak diubah.

## 1. Status

**PASS**

Happy path APPROVE/complete tetap utuh. Cabang REWORK (REJECT atomik, resume, gerbang tulis Option A) hidup di API.

## 2. Files Changed

- `packages/auth/src/access-control.ts` — catalog `resumeAfterRework`
- `packages/auth/src/me-types.ts` — `calibrationJobResumeAfterRework`
- `apps/api/src/modules/me/me.controller.ts` — flag `/me`
- `packages/shared/src/schemas/index.ts` — `qualityReviewDecisionSchema` APPROVE | REJECT
- `packages/db/prisma/seed-role-permissions.ts` — grant Tech `resumeAfterRework`
- `packages/db/prisma/backfill-rework-resume-permissions.ts` — backfill idempotent (baru)
- `packages/db/package.json` — script `backfill:rework-resume-permissions`
- `packages/db/scripts/prepare-test-db.mjs` — jalankan backfill di pretest
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` — REJECT TX + `resumeAfterRework`
- `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts` — `POST :id/resume`
- `apps/api/src/modules/calibration-jobs/measurement-results.service.ts` — Option A: write hanya `IN_PROGRESS`
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts`
- `apps/api/src/modules/calibration-jobs/measurement-results.service.test.ts`

Tidak ada file UI Portal/Tech-PWA. Tidak ada file Identity Correction. Tidak ada Prisma migration.

## 3. Lifecycle Implemented

```
IN_PROGRESS
  → submitForReview
SUBMITTED
  → REJECT (atomic)
REWORK  (submittedAt null, currentAttempt N+1, QR REJECTED)
  → resumeAfterRework
IN_PROGRESS  (currentAttempt tidak naik)
  → create/update MeasurementResult attempt baru
  → submitForReview
SUBMITTED
  → APPROVE  (job tetap SUBMITTED, submittedAt tetap, currentAttempt tidak berubah)
  → complete
ACCEPTED_BY_QA
```

Siklus REJECT boleh berulang sebelum APPROVE.

## 4. Option A Enforcement

Guard `assertMeasurementRowEditable` sekarang menolak write kecuali `status === IN_PROGRESS`, setelah cek superseded + SUBMITTED/`submittedAt`.

| Status | Write |
|---|---|
| `REWORK` + `submittedAt` null | **DENIED** `MEASUREMENT_JOB_NOT_IN_PROGRESS` |
| `PENDING` | **DENIED** (`CALIBRATION_JOB_NOT_STARTED` pada create; guard `MEASUREMENT_JOB_NOT_IN_PROGRESS` jika sampai ke editable check) |
| `IN_PROGRESS` | **ALLOWED** (attempt berjalan) |
| `SUBMITTED` / `ACCEPTED_BY_QA` / `submittedAt` terisi | **DENIED** `MEASUREMENT_JOB_SUBMITTED` (tidak diubah) |

Resume adalah gerbang backend: `REWORK → IN_PROGRESS` baru membuka write. Bukan mengandalkan UI.

## 5. Attempt Behavior

- REJECT: `currentAttempt` `{ increment: 1 }` di `updateMany` where `status: SUBMITTED`. Concurrent REJECT: hanya satu yang `count === 1`.
- RESUME: tidak increment.
- `MeasurementResult.create` tetap stamp `job.currentAttempt` (bukan dari client).
- Attempt lama: `attemptNumber < currentAttempt` → `MEASUREMENT_ATTEMPT_SUPERSEDED` (tetap, termasuk PATCH/DELETE by ID saat REWORK maupun setelah resume).

## 6. QualityReview

- REJECT: baris baru `decision=REJECT`, `status=REJECTED`, `notes` wajib, `reviewerUserId` = MT, `reviewedAt` terisi. Tidak meng-update baris lama.
- APPROVE: semantik lama — job `SUBMITTED`, `submittedAt` tetap, `currentAttempt` tidak berubah.
- Multi-cycle: tes menyimpan 3 baris (REJECT, REJECT, APPROVE); notes baris pertama tidak berubah.
- `QualityReview.attemptNumber` tidak ditambah. Latest tetap `createdAt desc take: 1`.

## 7. RBAC

| Action | TECHNICIAN | TECHNICIAN_MANAGER |
|---|---|---|
| `recordMeasurement` | ya | tidak |
| `submitForReview` | ya | tidak |
| `resumeAfterRework` | ya | tidak |
| `complete` | ya | tidak |
| `decideQualityReview` | tidak | ya |

Tidak ada permission `returnForRework`. SUPERADMIN bypass `hasPermission` tidak diubah.

## 8. Tests

Perintah (focused, tanpa pretest kedua kali pada re-run):

```
pnpm --filter @medcal/api test -- src/modules/calibration-jobs/calibration-jobs.service.test.ts src/modules/calibration-jobs/measurement-results.service.test.ts
```

Hasil run pertama (termasuk pretest seed + backfill):

- **140 passed / 2 failed / 142 total** (2 file)
- 2 gagal **bukan** tes REWORK: `company-scopes the grouped list` dan `still company-scopes when assignedToMe is set` — collision `company.id` 2-char UUID (`S` + slice). Pre-existing flake, tidak disentuh.

Focused re-run (`-t "quality review|REWORK|assertMeasurementRowEditable|RBAC"`):

- **50 passed / 92 skipped**
- Happy path regression (submit / APPROVE / complete / lock) hijau
- REWORK, multi-cycle, immutability, measurement gate, RBAC resume, concurrency REJECT/resume hijau

Typecheck: `pnpm --filter @medcal/api typecheck` PASS; `@medcal/shared` dan `@medcal/auth` `tsc --noEmit` PASS.

## 9. Migration

**NO Prisma migration.** Schema existing sudah berisi `REWORK`, `currentAttempt`, `submittedAt`, `attemptNumber`, `QualityReview`.

Permission: seed + `pnpm --filter @medcal/db run backfill:rework-resume-permissions` (idempotent).

## 10. Out-of-Scope Confirmation

- JobHandOff: tidak ada / tidak disentuh
- Post-approval correction: tidak diimplementasi
- Identity Correction: tidak diubah
- UI Portal REJECT / Tech-PWA REWORK: tidak diubah
- PASS/FAIL, completeness, signature, PDF, certificate, FCM, WorkOrder DONE, G4: tidak disentuh

## 11. Known Limitations

1. Race concurrent **APPROVE** (dua QR APPROVED) tetap seperti happy path lama — tidak diperkuat, agar semantik APPROVE tidak di-refactor.
2. `GET /calibration-jobs/:id/quality-reviews` tidak ditambah; latest tetap `reviews[0]` pada GET job.
3. Identity / reference-equipment lock set masih `SUBMITTED | ACCEPTED_BY_QA` (REWORK tidak mengunci domain itu). Di luar scope Option A pengukuran.
4. Dua tes company-scope 2-char id flake di file test yang sama; tidak terkait REWORK.
5. UI teknisi/MT belum menampilkan Resume / Tolak — sengaja; task ini backend only.
