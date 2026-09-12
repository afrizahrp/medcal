# REWORK Lifecycle Audit

**Date:** 2026-09-10  
**Mode:** AUDIT / INVESTIGATE ONLY — tidak ada perubahan kode, migrasi, atau data  
**Status:** READY WITH GAPS  
**Brief:** `D:\medcal\docs\claude\plans\technician-app\ui-tasks\audit-reworks-on-techPWA.md`  
**Desain terkunci:** `D:\medcal\docs\claude\plans\technician-app\ui-tasks\CalibrationResult_Review_Lifecycle_Design.md`  
**Happy path (jangan diubah):** `CalibrationResult_Review_HappyPath_Stage2-report.md` + `CalibrationResult_Review_HappyPath_Stage3-report.md`

Workspace yang diaudit: `D:\medcal` (git repo). Laporan ini ditulis ke `J:\medcal\docs\claude\plans\technician-app\ui-tasks` sesuai permintaan.

---

## 1. Executive Verdict

**READY WITH GAPS** — arsitektur existing sudah mendukung siklus REWORK pre-approval tanpa model, enum, atau tabel baru. Yang belum ada adalah wiring transisi REJECT/resume, kontrak Zod, izin `resumeAfterRework`, dan UI.

Bukan **READY**: REJECT sengaja ditolak di Zod/controller; tidak ada `resume`; `currentAttempt` tidak pernah di-increment di produksi; Tech-PWA/Portal belum menampilkan feedback REJECT.

Bukan **BLOCKED**: tidak ada masalah fundamental di schema. `CalibrationJobStatus.REWORK`, `currentAttempt`, `submittedAt` nullable, natural key `MeasurementResult` (termasuk `attemptNumber`), relasi `QualityReview[]`, dan guard immutability sudah ada.

Happy path berikut sudah aligned dan **tidak boleh diubah** oleh implementasi REWORK nanti:

```
IN_PROGRESS → submitForReview → SUBMITTED → MT APPROVE → SUBMITTED + QualityReview APPROVED → technician complete → ACCEPTED_BY_QA
```

---

## 2. Current Lifecycle Found

Lifecycle yang **benar-benar hidup** di kode produksi:

```
PENDING
  │ start()
  ▼
IN_PROGRESS
  │ submitForReview()
  ▼
SUBMITTED 🔒  (submittedAt terisi; MeasurementResult terkunci)
  │
  ├─ MT APPROVE → QualityReview APPROVED; job tetap SUBMITTED
  │                    │ complete()
  │                    ▼
  │               ACCEPTED_BY_QA
  │
  └─ MT REJECT → ditolak di Zod
                 code: INVALID_QUALITY_REVIEW_DECISION
                 job tetap SUBMITTED; tidak ada QualityReview
```

Sumber:

| Method | File | Perilaku aktual |
|---|---|---|
| `start` | `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` L703–719 | Hanya `PENDING → IN_PROGRESS`; conflict jika `startedAt !== null` atau `status !== PENDING` |
| `submitForReview` | same file L726–755 | Hanya dari `IN_PROGRESS`; `updateMany` where `status: IN_PROGRESS`; stamp `submittedAt`; komentar L724: REJECT/REWORK not handled here |
| `decideQualityReview` | same file L761–802 | Hanya `SUBMITTED`; create QR `APPROVE`/`APPROVED`; job **tidak** berubah; **bukan** `$transaction` |
| `complete` | same file L808–849 | `SUBMITTED` + latest QR APPROVED → `ACCEPTED_BY_QA`; `updateMany` optimistic |
| Controller REJECT | `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts` L133–149 | Body di-parse `qualityReviewDecisionSchema`; REJECT gagal sebelum service |
| Tes penunda | `apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts` L1976–1989 | `"rejects REJECT on the quality-decision route (REWORK deferred)"` |

`REWORK` ada di enum Prisma, label Tech-PWA (`"Perbaikan"`), badge Portal, dan filter list. **Tidak ada transisi service produksi** ke atau dari `REWORK`.

Asumsi linear tersembunyi: `submitForReview` menolak status selain `IN_PROGRESS` dengan `CALIBRATION_JOB_NOT_IN_PROGRESS`. Submit langsung dari `REWORK` (tanpa resume) akan gagal — sesuai desain (resume adalah gerbang).

---

## 3. Target REWORK Lifecycle

Terkunci sebagai **PRE-APPROVAL correction cycle**. Bukan post-approval correction. Bukan JobHandOff.

```
IN_PROGRESS, attempt N, submittedAt null
    │ Teknisi → Kirim (submitForReview)
    ▼
SUBMITTED 🔒, attempt N, submittedAt terisi
    │ MT review
    │
    ├──── APPROVE ────→ SUBMITTED + QualityReview APPROVED
    │                         │ Teknisi → Selesai (complete)
    │                         ▼
    │                    ACCEPTED_BY_QA
    │
    └──── REJECT ─────→ REWORK
                            │ status REWORK
                            │ currentAttempt = N+1 (increment tepat sekali)
                            │ submittedAt = null
                            │ QualityReview REJECTED + notes wajib
                            │
                            │ Teknisi → Resume (resumeAfterRework)
                            ▼
                        IN_PROGRESS, attempt N+1, submittedAt null
                            │ koreksi MeasurementResult attempt baru
                            │ Kirim (submitForReview yang sama)
                            ▼
                         SUBMITTED, attempt N+1
                            │
                            └→ MT review lagi (APPROVE atau REJECT lagi)
```

Siklus yang sama boleh berulang berkali-kali sebelum APPROVE.

Aturan bisnis yang dikunci (jangan diubah diam-diam):

1. REWORK hanya untuk penolakan MT **sebelum** approval.
2. MT adalah reviewer, **bukan** editor `MeasurementResult`.
3. Feedback MT hanya di `QualityReview.notes`.
4. Increment `currentAttempt` **hanya** pada `SUBMITTED → REWORK`.
5. Resume **tidak** increment; hanya `REWORK → IN_PROGRESS`.
6. Attempt lama immutable; attempt baru = baris baru.
7. QualityReview append-only; jangan overwrite.
8. Tidak menambah enum/tabel/framework koreksi generik.
9. Identity Correction dan JobHandOff tidak disentuh.

---

## 4. Gap Analysis

| Area | Current State | Target | Gap | Severity |
| --- | --- | --- | --- | --- |
| Schema Prisma | Enum `REWORK`; `currentAttempt`; `submittedAt?`; QR 1:N; natural key termasuk `attemptNumber` | Sama | Tidak ada blocker schema | NONE |
| Backend REJECT | Zod `decision: z.literal("APPROVE")` (`packages/shared/src/schemas/index.ts` L846–849); service hanya create APPROVED | REJECT → QR REJECTED + notes wajib + status REWORK + `submittedAt = null` + increment +1, satu transaksi | Cabang REJECT belum ada | BLOCKER |
| Backend resume | Route/method tidak ada | `POST /calibration-jobs/:id/resume` → `REWORK → IN_PROGRESS` | Handler + route + permission | BLOCKER |
| Attempt increment | Tidak ada writer produksi; komentar schema L1920–1923 menunggu service | Increment hanya di REJECT | Wiring | BLOCKER |
| Measurement lock API | Guard `attemptNumber < currentAttempt` + status/`submittedAt`; `REWORK` **tidak** di lock set | Sama (desain D) | Tidak ada | NONE |
| QualityReview siklus | Latest = `createdAt desc take: 1`; decide cek *any* APPROVED | Satu keputusan per window SUBMITTED; banyak REJECT lalu satu APPROVE | `createdAt` cukup v1 jika REJECT atomic; tidak ada FK attempt | LOW |
| Concurrent double APPROVE | Check-then-create tanpa TX/unique | Decide aman | Race pre-existing | MEDIUM |
| RBAC resume | Catalog punya submit/decide/complete; **tidak ada** `resumeAfterRework` | Tech-only `resumeAfterRework` | Catalog + seed + backfill + `me` flag | HIGH |
| Tech-PWA REWORK | Badge + copy kunci; tidak ada Resume; notes REJECT tidak ditampil; `showRecordMeasurement` bisa menyembunyikan section | Resume + notes MT + entry setelah IN_PROGRESS | UI wiring + visibilitas section | HIGH |
| Portal REJECT | `QualityReviewPanel` hanya Setujui (komentar L996) | Tolak + catatan wajib | Tombol + dialog + handler | HIGH |
| Helpers awaiting | `SUBMITTED && !APPROVED` | Setelah resubmit, antrian MT hidup lagi | Sudah benar (QR lama REJECTED ≠ APPROVED) | NONE |
| Identity/ref-eq di REWORK | Lock set hanya `SUBMITTED` + `ACCEPTED_BY_QA` | Desain REWORK tidak mengubah IC | Ref-eq/IC writable saat REWORK; inkonsisten dengan kunci pengukuran UI | MEDIUM |
| GET quality-reviews | Tidak ada; GET job embed `reviews[0]` | Kontrak D.7 menyebut GET history | Tidak wajib v1 jika latest cukup | LOW |
| Prisma migration | Kolom/enum sudah ada | Tidak menambah enum/tabel | Tidak perlu | NONE |
| Data produksi | Tidak terlihat dari kode | Tidak ada baris ad-hoc `REWORK` / `currentAttempt > 1` | Perlu query lingkungan sebelum implement | LOW (proses) |

Severity **BLOCKER** di tabel ini = blocker **fitur REWORK**, bukan blocker model. Schema tidak memblokir.

---

## 5. Attempt / Immutability Analysis

### Perilaku hari ini

File: `apps/api/src/modules/calibration-jobs/measurement-results.service.ts`

```22:66:apps/api/src/modules/calibration-jobs/measurement-results.service.ts
export const MEASUREMENT_LOCKED_JOB_STATUSES = new Set<string>(["SUBMITTED", "ACCEPTED_BY_QA"]);
// ...
export function assertMeasurementRowEditable(job: GuardJob, row: { attemptNumber: number }): void {
  if (row.attemptNumber < job.currentAttempt) { /* MEASUREMENT_ATTEMPT_SUPERSEDED */ }
  if (MEASUREMENT_LOCKED_JOB_STATUSES.has(job.status) || job.submittedAt !== null) {
    /* MEASUREMENT_JOB_SUBMITTED */
  }
}
```

- Client **tidak** mengirim `attemptNumber` (Zod create tidak punya field itu; komentar shared L859).
- `create` / `createMany` stamp `attemptNumber: job.currentAttempt`.
- `update` / `remove` memuat row by ID lalu `assertMeasurementRowEditable(job, row)`.
- Unique `measurement_natural_key`: `[calibrationJobId, deviceCalibrationParameterId, calibrationTestPointId, replicateIndex, attemptNumber, direction]` + `NULLS NOT DISTINCT` di migrasi `20260908025400_...`.
- Immutability **bukan** trigger DB. Field `updatedAt` ada. Kontrak = guard aplikasi + unique key.

`assertJobStarted` hanya cek `startedAt !== null`, **bukan** `status === IN_PROGRESS`. Jadi API **akan mengizinkan write** pada job `REWORK` + `submittedAt = null` setelah increment. Ini **sengaja** di desain D: UI Tech-PWA yang mengunci sampai resume (`canRecordMeasurement` hanya `IN_PROGRESS`).

### Setelah REWORK (desain, belum kode)

| Saat | `currentAttempt` | Status | `submittedAt` | Write attempt N | Write attempt N+1 |
|---|---|---|---|---|---|
| SUBMITTED, sebelum REJECT | N | SUBMITTED | terisi | terkunci (status/`submittedAt`) | n/a |
| Baru REJECT | N+1 | REWORK | null | `MEASUREMENT_ATTEMPT_SUPERSEDED` | API izinkan; UI kunci sampai resume |
| Setelah resume | N+1 | IN_PROGRESS | null | superseded | diizinkan API + UI |
| Setelah resubmit | N+1 | SUBMITTED | terisi | superseded | terkunci |

### Jawaban pertanyaan brief D

- **Resume setelah REWORK saat `currentAttempt = N`:** belum ada method. Desain: pada REJECT counter **sudah** N+1; resume hanya ganti status. Resume yang increment lagi akan salah.
- **Bagaimana attempt N+1 tertulis?** Hanya jika increment terjadi di REJECT. Create selalu baca `job.currentAttempt`.
- **Bisakah attempt lama diedit?** Update/delete by ID → `MEASUREMENT_ATTEMPT_SUPERSEDED`. Tidak ada bypass role.
- **Lock check memakai apa?** **Keduanya:** `attemptNumber < currentAttempt` **dan** status/`submittedAt`.
- **Target ID attempt lama?** Tetap ditolak guard.
- **Race increment vs create:** dua REJECT concurrent tanpa `updateMany where status=SUBMITTED` bisa double-increment. Create di tengah REJECT bisa stamp attempt lama. REJECT harus atomik.

Cabang superseded **belum pernah fire di happy path** (`currentAttempt` selalu 1). Tes unit guard: `apps/api/src/modules/calibration-jobs/measurement-results.service.test.ts` L202–231.

---

## 6. QualityReview Analysis

### Model

`packages/db/prisma/schema.prisma` L2236–2254:

- `decision` `ReviewDecision?` (`APPROVE` \| `REJECT`)
- `status` `QualityReviewStatus` default `PENDING` — **PENDING tidak dipakai di v1**
- `reviewerUserId` **wajib**
- `notes` opsional di schema; wajib secara bisnis pada REJECT
- Relasi job `reviews QualityReview[]` — **tidak ada** `@@unique([calibrationJobId])`
- **Tidak ada** `attemptNumber` / `submissionId`

### Creation saat ini

Hanya di `decideQualityReview` L788–799: create on decide, langsung APPROVED. Tidak ada row PENDING saat submit. Sesuai desain C.2 (`reviewerUserId` wajib, jangan buat reviewer palsu saat submit).

### Multiple cycles

Schema **mengizinkan** banyak QR per job. Kode happy path mengasumsikan 0 atau 1 (komentar include L91–92). Duplicate sequential APPROVE diblokir secara **global** (`findFirst status: APPROVED`). Setelah REWORK, banyak REJECT + satu APPROVE **kompatibel dengan schema**, belum diimplementasi. Guard “already APPROVED” tetap valid sebagai terminal approval.

### Bagaimana sistem tahu latest QR = current submission?

**Hanya via `createdAt` order.**

1. `calibrationJobInclude.reviews` (`calibration-jobs.service.ts` L91–106): `orderBy: createdAt desc`, **`take: 1`**.
2. `complete` L825–828: `findFirst` urutan sama; harus APPROVED.
3. Tech-PWA/Portal: `latestQualityReview` = `job.reviews[0]`.

Tidak ada ikatan formal ke attempt N.

**Implikasi v1 (cukup jika disiplin cycle dijaga):**

| Skenario | Hasil |
|---|---|
| REJECT → resume → submit → APPROVE | Latest = APPROVE → `complete` OK |
| REJECT lagi | Latest = REJECT → `complete` gagal (benar) |
| Resubmit, QR terbaru masih REJECTED | `isAwaitingQualityReview` = SUBMITTED && !APPROVED → **true** (benar, antrian MT hidup) |
| Concurrent double APPROVE | `take: 1` arbitrary di antara dua APPROVED |

Desain C.3 mengunci korelasi ke attempt sebagai **urutan `createdAt`** untuk fase ini. Kolom `attemptNumber` di QR = perbaikan opsional nanti, **bukan** syarat v1.

### Pola Identity Correction (referensi perilaku saja)

`identityCorrectionDecisionSchema` (`packages/shared/src/schemas/index.ts` L822–834): `APPROVE | REJECT`, note wajib pada REJECT. APPROVE IC memakai `$transaction`. Quality APPROVE hari ini **tidak** dalam transaksi — cukup karena job tidak berubah. REJECT **harus** transaksi karena mengubah job + QR.

Jangan memakai tabel `IdentityCorrection` untuk hasil pengukuran.

---

## 7. RBAC Analysis

### Catalog

`packages/auth/src/access-control.ts` L121–146:

Ada: `recordMeasurement`, `submitForReview`, `decideQualityReview`, `complete`.  
Tidak ada: `resumeAfterRework`.  
Komentar L142: `decideQualityReview: TECHNICIAN_MANAGER APPROVE (REJECT/REWORK deferred)`.

### Seed

`packages/db/prisma/seed-role-permissions.ts` L182–185, L237–243:

| Action | TECHNICIAN | TECHNICIAN_MANAGER | Actual |
|---|---|---|---|
| `recordMeasurement` | ya | tidak (dicabut) | Match |
| `submitForReview` | ya | tidak | Match |
| `complete` | ya | tidak | Match |
| `decideQualityReview` | tidak | ya | Match |
| `resumeAfterRework` | ya (intended) | tidak | **Missing entirely** |

### Capabilities GET /me

`apps/api/src/modules/me/me.controller.ts` L203–215: flag `recordMeasurement`, `submitForReview`, `decideQualityReview`, `complete`. **Tidak ada** flag resume.

### Catatan di luar mismatch REWORK

- `start` tetap di TECHNICIAN **dan** TECHNICIAN_MANAGER (desain E.2: start/identity/ref-eq **tidak diubah**).
- SUPERADMIN bypass `hasPermission` — by design.
- Tes RBAC: `calibration-jobs.service.test.ts` ~L2128–2188 (MT diblokir submit/complete/recordMeasurement).

Izin MT menulis nilai ditegakkan di **RBAC** (`recordMeasurement` dicabut), bukan exception khusus di dalam `assertMeasurementRowEditable` (guard itu role-blind).

---

## 8. API / Service Impact

Controller: `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts`

| Designed contract | Exists? | Permission | Perilaku sekarang |
|---|---|---|---|
| `POST /calibration-jobs/:id/submit` | Ya L124–130 | `submitForReview` | Compatible; reuse |
| `POST /calibration-jobs/:id/quality-decision` | Ya L133–149 | `decideQualityReview` | Hanya `{ decision: "APPROVE", notes? }` |
| `POST /calibration-jobs/:id/resume` | **Tidak** | `resumeAfterRework` | — |
| `POST /calibration-jobs/:id/complete` | Ya L152–158 | `complete` | Compatible; latest APPROVED tetap benar setelah multi-cycle |
| Measurement CRUD | Ya L348–427 | `read` / `recordMeasurement` | Tidak perlu path baru |
| `GET .../quality-reviews` | **Tidak** | `read` | GET job sudah embed `reviews[0]` |

Zod: `packages/shared/src/schemas/index.ts` L842–849 — komentar eksplisit REJECT ditunda.

File yang **nanti** perlu diubah (bukan sekarang):

| Area | Path |
|---|---|
| Decide REJECT + resume | `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` |
| Route resume | `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts` |
| Schema decide | `packages/shared/src/schemas/index.ts` |
| RBAC | `packages/auth/src/access-control.ts`, `packages/db/prisma/seed-role-permissions.ts`, backfill, `apps/api/src/modules/me/me.controller.ts` |
| Tes | `apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts` — tes L1976 **harus dibalik** menjadi REJECT sukses |

Jangan sentuh: handler Identity Correction, MeasurementResult schema, JobHandOff (tidak ada di `apps/`).

---

## 9. Tech-PWA Impact

### Per status setelah Happy Path

| Status | Badge | Measurement | Aksi primer | QualityReview ke teknisi |
|---|---|---|---|---|
| `IN_PROGRESS` | "Berlangsung" | `canRecordMeasurement` true; "Catat Hasil Pengukuran" | `SubmitForReviewAction` **"Kirim"** | Tidak ada |
| `SUBMITTED` tanpa approval | "Terkirim" + "Menunggu Review" | Terkunci: *"Job sudah dikirim — hasil pengukuran terkunci."* | Tidak ada Kirim/Selesai | Notes tidak ditampil |
| `SUBMITTED` + APPROVED | "Terkirim" + "Disetujui" | Tetap terkunci | `CompleteJobAction` **"Selesai"** | Reviewer, tanggal, `review.notes` |
| `REWORK` | "Perbaikan" (oranye) | Terkunci khusus REWORK | **Tidak ada Resume** | **Feedback REJECT tidak ditampil** |

### Yang sudah ada (reuse)

- Label `"Perbaikan"`: `apps/tech-pwa/src/lib/calibration/types.ts` L19
- Badge oranye: `apps/tech-pwa/src/app/jobs/jobs-ui.tsx` L38, L60
- Copy kunci persis (`measurement.ts` L213–214):  
  **"Job dikembalikan untuk perbaikan — mulai ulang attempt sebelum mencatat hasil."**
- `canRecordMeasurement`: hanya `IN_PROGRESS && startedAt` (`measurement.ts` L194–199) — gerbang produk resume
- Filter tampilan `attemptNumber === currentAttempt` (`jobs/[id]/page.tsx` L113–114)
- Pola sticky: `StartCalibrationAction` / `SubmitForReviewAction` / `CompleteJobAction` di `job-detail-ui.tsx`

### Gap wajib

1. **Tidak ada tombol/hook resume.** `StartCalibrationAction` hanya `PENDING` (`page.tsx` L90). Jangan reuse "Mulai Kalibrasi" untuk resume.
2. **`JobHeaderBlock` hanya render notes jika `approved`** (`job-detail-ui.tsx` L72–79). Saat REWORK, latest QR = REJECTED → teknisi tidak melihat catatan MT.
3. **`showRecordMeasurement` (`page.tsx` L123–127)** butuh `IN_PROGRESS` **atau** ada row current attempt. Setelah REJECT, `currentAttempt` naik, map kosong, status `REWORK` → **section pengukuran (termasuk pesan kunci) bisa hilang**.
4. **Alat referensi:** `REWORK` tidak di lock set (`reference-equipment.ts` L97–111). `canRecordReferenceEquipment` bisa true saat REWORK — inkonsisten dengan measurement gate. Observasi; jangan ubah IC/ref-eq kecuali diputuskan terpisah.
5. Attempt-aware editing: **parsial** (filter read-path ada; tidak ada UI history attempt lama; gate write hanya status).

Setelah resume → `IN_PROGRESS`, entry + **"Kirim"** existing sudah cukup. Tidak perlu redesain grid.

---

## 10. Portal Impact

### Di mana MT melihat hasil

- Detail job, section hasil → `QualityReviewPanel`  
  `apps/portal/src/app/management/calibration-jobs/[id]/page.tsx` L429–438, L996–1107
- Tabel filter `row.attemptNumber === (currentAttempt ?? 1)` L1017–1026
- List hint "Menunggu review": `calibration-jobs-ui.tsx` L441–443
- Gate: `canDecideQualityReview` = `isAwaitingQualityReview` (`calibration-job-utils.ts` L96–101)

Setelah resubmit, QR terbaru masih REJECTED → `!isQualityReviewApproved` → decide **true**. Ini benar.

### APPROVE saat ini

- `handleApproveQualityReview` L238–251 → `useDecideQualityReview` → `POST .../quality-decision`
- UI: textarea "Catatan keputusan" (opsional) + tombol **"Setujui"** L1083–1104
- Komentar L996: `// Quality review (MT APPROVE only — no Tolak / REJECT)`

### Untuk REJECT

1. Perluas `qualityReviewDecisionSchema` (pola `identityCorrectionDecisionSchema`).
2. Service REJECT + side effect job (lihat §8).
3. UI: tombol **"Tolak"** + `RejectDialog` di samping Setujui pada `QualityReviewPanel`.

Pola siap pakai (jangan ubah Identity Correction):

| Elemen | Lokasi | Pola |
|---|---|---|
| `CorrectionCard` | same `page.tsx` L1112–1303 | Setujui + Tolak |
| `RejectDialog` | L1460–1504 | Catatan wajib; confirm disabled jika `!note.trim()` |

Setelah REJECT, `currentAttempt` sudah N+1. Panel yang filter current attempt akan terlihat **kosong** jika job REWORK dibuka. Antrian decide sudah tidak awaiting (status bukan SUBMITTED) — bukan blocker v1; jangan redesign grid history.

---

## 11. Transaction / Concurrency Risks

MT REJECT harus logis atomik:

1. Validate job `SUBMITTED`
2. Validate submission ini belum diputus (belum APPROVED; status masih SUBMITTED)
3. Create `QualityReview(REJECTED)` + notes wajib
4. `status = REWORK`
5. `submittedAt = null`
6. `currentAttempt` increment tepat sekali

Sekarang: hanya create APPROVED; job tidak berubah; **tanpa** `$transaction`.

**Bisa atomik** dengan pola yang sudah dipakai:

- `submitForReview` / `complete`: `updateMany` + expected status
- Identity Correction APPROVE: `prisma.$transaction`

Rekomendasi implementasi REJECT (bukan arsitektur baru):

```
prisma.$transaction:
  updateMany({
    where: { id, companyId, status: "SUBMITTED" },
    data: { status: "REWORK", submittedAt: null, currentAttempt: { increment: 1 } }
  })
  if count !== 1 → conflict
  create QualityReview REJECTED
```

| Skenario | Saat ini | Setelah REWORK (perlu) |
|---|---|---|
| Double submit | Blocked `updateMany` IN_PROGRESS | Sama setelah resume |
| Double complete | Blocked | Sama |
| Double APPROVE sequential | `QUALITY_REVIEW_ALREADY_APPROVED` | Tetap |
| Concurrent double APPROVE | Mungkin 2 QR | Perkuat opsional; jangan pecahkan happy path |
| Duplicate REJECT | N/A | `updateMany` status SUBMITTED |
| Double resume | N/A | `updateMany` status REWORK |
| Write teknisi vs REJECT | Lock via submittedAt/status | TX harus clear submittedAt + bump attempt bersama |

APPROVE happy path: job tetap SUBMITTED; tidak increment; tidak null `submittedAt`. Jangan digabung ke side-effect REJECT.

---

## 12. Migration / Data Risks

| Jenis | Diperlukan? |
|---|---|
| Prisma schema migration | **Tidak** — enum `REWORK` sejak init (`20260813063336_...`); `currentAttempt` sejak `20260908025400_...` |
| Data migration / backfill MeasurementResult | **Tidak**, jika produksi hanya happy path |
| Permission backfill | **Ya** (bukan schema) — `resumeAfterRework`; pola `backfill-quality-review-happy-path-permissions.ts` |

Asumsi: produksi berisi data Happy Path (`currentAttempt = 1`, nol `REWORK`, nol `attemptNumber > 1`, QR hanya APPROVED atau kosong).

Audit kode **tidak bisa** melihat produksi. Sebelum implementasi, jalankan query read-only dari `docs/claude/plans/Calibration-management/measurement-results/attempt-increment-diagnosis.md` §2:

```sql
SELECT COUNT(*) FROM "CalibrationJob" WHERE status = 'REWORK';
-- plus currentAttempt > 1, attemptNumber > 1, QualityReview counts
```

Jika muncul baris ad-hoc: tangani kasus per kasus. **Jangan backfill buta.**

---

## 13. Required Changes for REWORK

Hanya yang genuinely required. **Belum diimplementasikan.**

### Backend

- Perluas `decideQualityReview`: cabang REJECT dalam transaksi; **jangan ubah semantik APPROVE** (job tetap SUBMITTED).
- Method baru `resumeAfterRework`: `REWORK → IN_PROGRESS`; tidak increment; `submittedAt` tetap null.
- Optimistic concurrency `updateMany` pada reject dan resume.
- Tes: balikkan tes L1976; tambah siklus multi-reject + regresi APPROVE/complete.

### Shared types/schemas

- `qualityReviewDecisionSchema`: `APPROVE | REJECT`; notes wajib REJECT (mirror identity). Body APPROVE existing tetap valid subset.

### Tech-PWA

- Action Resume (pola `StickyActionBar` existing; **bukan** "Mulai Kalibrasi").
- Tampilkan `QualityReview.notes` saat latest REJECTED / status REWORK.
- Perbaiki `showRecordMeasurement` / footer agar section atau aksi Resume tetap terlihat di REWORK.

### Portal

- Tombol Tolak + `RejectDialog` (catatan wajib) di `QualityReviewPanel`.
- Handler `decision: "REJECT"`.
- **Jangan ubah** `CorrectionCard` Identity Correction.

### Tests

Lihat §K di bawah. Jangan ditulis sekarang.

---

## 14. Explicitly NOT Required

Dikonfirmasi dari kode + desain terkunci — tetap out of scope:

| Item | Status |
|---|---|
| JobHandOff | Tidak ada di `apps/`; jangan diciptakan |
| Post-approval correction | Terpisah; REWORK hanya pre-approval |
| PASS/FAIL | Submit tidak gate completeness/PASS-FAIL |
| Tolerance / kelengkapan pengukuran | Di luar lifecycle |
| Signature MT / CustomerSignature | Ditunda |
| PDF / certificate | `Certificate.qualityReviewId` tidak di-wire |
| Notification / FCM | Tidak |
| WorkOrder DONE gating | `POST /work-orders/:id/done` tidak menunggu `ACCEPTED_BY_QA` (desain E.4) |
| Identity Correction changes | Hanya reuse pola decide / RejectDialog |
| Generic correction framework | Dilarang |
| Tabel `MeasurementCorrection` / `AuditLog` | Dilarang |
| Enum baru (`DRAFT`, `REVISION_REQUIRED`, `CLOSED`, `REQUEST_CHANGES`) | Dilarang |
| Kolom `attemptNumber` di QualityReview | Ditunda; `createdAt` v1 |
| Mengubah happy path APPROVE | Job tetap SUBMITTED sampai `complete` |

---

## 15. Recommended Implementation Order

Urutan terkecil yang aman (selaras desain Lifecycle §G + temuan audit):

1. Catalog + seed + backfill `resumeAfterRework` (jangan ubah grant happy path).
2. Zod decide: terima REJECT + notes wajib; APPROVE tetap valid.
3. Service REJECT atomic (`returnForRework` sebagai **cabang** decide, bukan permission terpisah).
4. Service `resumeAfterRework` + `POST :id/resume`.
5. Tes API siklus + regresi APPROVE/complete (termasuk membalik tes L1976).
6. Query read-only data hidup sebelum merge ke lingkungan yang punya data.
7. Portal: Tolak + RejectDialog di `QualityReviewPanel`.
8. Tech-PWA: Resume + notes REJECT + visibilitas section/footer REWORK.

Jangan gabungkan Identity Correction, completeness, atau post-approval ke PR ini.

---

## 16. Open Questions / Decisions

Hanya yang **tidak bisa** dijawab dari codebase:

1. **Data produksi** — apakah ada baris `status = REWORK` atau `currentAttempt > 1` ad-hoc? Perlu query lingkungan.
2. **Race double-APPROVE** — perkuat dalam PR REWORK yang sama, atau biarkan utang pre-existing? Bukan blocker model; menyentuh `decideQualityReview` berisiko ke happy path jika tidak hati-hati.
3. **Identity/ref-eq writable di REWORK** — by-product lock set existing. Menguncinya akan menyentuh IC/ref-eq (di luar brief). Default audit: **jangan ubah** kecuali product minta secara eksplisit.
4. **`GET /quality-reviews` history** — ada di kontrak desain D.7; runtime v1 cukup `reviews[0]`. Wajib satu PR dengan REJECT, atau follow-up?

Bukan pertanyaan terbuka (sudah dikunci desain): increment hanya di REJECT; resume tidak increment; MT tidak edit `measuredValue`; QR append-only; tidak ada tabel baru; APPROVE tidak langsung `ACCEPTED_BY_QA`.

---

## Appendix K — Test Gap (untuk implementasi nanti)

### Tes yang sudah ada

| Area | File | Cakupan |
|---|---|---|
| Measurement lock + copy REWORK | `apps/tech-pwa/src/lib/calibration/measurement.test.ts` L99–109 | `canRecordMeasurement`; `measurementLockedReason` `/perbaikan/` |
| Submit / complete gates | `apps/tech-pwa/src/lib/calibration/quality-review.test.ts` | `canSubmitForReview`, `canCompleteJob`, awaiting/approved |
| Job list “done” | `apps/tech-pwa/src/lib/calibration/job-display.test.ts` L60–63 | REWORK ≠ done |
| Portal helpers | `apps/portal/src/app/management/calibration-jobs/calibration-job-utils.test.ts` | awaiting; error codes happy path |
| API happy path | `apps/api/.../calibration-jobs.service.test.ts` ~L1835–1974 | submit → APPROVE → complete |
| API REJECT ditolak | same L1976–1989 | REJECT → `INVALID_QUALITY_REVIEW_DECISION` |
| Attempt immutability | `measurement-results.service.test.ts` L202–231 | superseded + SUBMITTED lock |
| RBAC | `calibration-jobs.service.test.ts` ~L2131–2181 | submit / quality-decision / complete |

### Tes yang harus ditambah nanti (jangan ditulis sekarang)

Happy path regresi:

1. `IN_PROGRESS → SUBMITTED`
2. `SUBMITTED → APPROVE`
3. `APPROVED → complete`

REWORK:

4. `SUBMITTED → REJECT → REWORK`
5. REJECT memerlukan notes
6. `REWORK → RESUME → IN_PROGRESS`
7. `currentAttempt` increment tepat sekali (pada REJECT, bukan resume)
8. Attempt lama immutable (`MEASUREMENT_ATTEMPT_SUPERSEDED`)
9. `MeasurementResult` baru memakai attempt baru
10. Teknisi bisa submit lagi
11. MT bisa reject lagi
12. Multiple REWORK cycles
13. Eventual APPROVE setelah REWORK
14. `complete` hanya setelah latest submission APPROVED
15. MT tidak bisa modify `MeasurementResult`
16. QualityReview lama tidak berubah (append-only)
17. Duplicate/concurrent reject ditolak aman

Plus: schema Zod REJECT+notes; RBAC `resumeAfterRework` Tech-only / MT tidak resume; helper Tech-PWA menampilkan notes REJECTED; Portal `canDecide` hanya SUBMITTED awaiting.

---

## Appendix — Pemetaan existing vs required vs opsional

| Item | Existing behavior | Required later | Optional later |
|---|---|---|---|
| Enum `REWORK` | Ya | Aktifkan transisi | — |
| `currentAttempt` | Field + stamp create | Increment di REJECT | — |
| Guard superseded | Ya | Dipakai setelah increment hidup | — |
| QR append-only schema | Ya | Create REJECTED | `attemptNumber` di QR |
| `submit` / `complete` routes | Ya | Reuse | — |
| `quality-decision` | APPROVE only | Terima REJECT | TX lebih ketat untuk APPROVE |
| `resume` | Tidak | Tambah | — |
| GET QR history | Tidak (`reviews[0]`) | Tidak wajib v1 | `GET .../quality-reviews` |
| Tech-PWA badge/lock copy | Ya | Resume + notes REJECT + visibilitas section | History attempt lama |
| Portal Setujui | Ya | Tolak + RejectDialog | Tampilkan attempt tertolak setelah increment |

Tidak ada arsitektur yang diinvent: enum, counter, natural key, dan guard sudah menunggu wiring.
