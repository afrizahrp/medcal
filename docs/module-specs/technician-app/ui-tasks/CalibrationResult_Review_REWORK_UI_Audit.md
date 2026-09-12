# Calibration Result Review — REWORK UI Audit

**Date:** 2026-09-10  
**Mode:** AUDIT ONLY — tidak ada implementasi, tidak ada perubahan kode  
**Backend:** REWORK PASS ([CalibrationResult_Review_REWORK_Backend-report.md](./CalibrationResult_Review_REWORK_Backend-report.md))  
**Desain terkunci:** [CalibrationResult_Review_Lifecycle_Design.md](../../../domain-decisions/CalibrationResult_Review_Lifecycle_Design.md)  
**Happy path UI (jangan diubah):** [CalibrationResult_Review_HappyPath_Stage3-report.md](./CalibrationResult_Review_HappyPath_Stage3-report.md)

Option A terkunci: tulis `MeasurementResult` hanya jika `CalibrationJob.status === IN_PROGRESS`. `REWORK` bukan state editable. Resume (`REWORK → IN_PROGRESS`) adalah gerbang.

---

## 1. STATUS

**READY WITH GAPS**

Backend REWORK dan kontrak Zod/capability sudah cukup untuk di-wire ke UI. Tidak ada konflik desain dengan lifecycle terkunci. Tidak ada Prisma/enum/tabel baru yang diperlukan.

Yang belum ada di UI:

- Hook/tombol Resume (`POST /calibration-jobs/:id/resume`)
- Tolak + notes wajib di Portal `QualityReviewPanel`
- Tampilan catatan REJECT ke teknisi
- Visibilitas section pengukuran saat `REWORK` (sering hilang karena filter `currentAttempt`)

Happy path Kirim → Setujui → Selesai **jangan di-refactor**.

---

## 2. EXISTING UI MAP

### Tech-PWA

| Permukaan | Path |
|---|---|
| Job detail | `apps/tech-pwa/src/app/jobs/[id]/page.tsx` |
| Header, sticky actions, `MeasurementsSection` | `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx` |
| List + badge status | `apps/tech-pwa/src/app/jobs/jobs-ui.tsx` |
| Job / submit / complete hooks | `apps/tech-pwa/src/app/jobs/[id]/use-job-query.ts` |
| Measurement list | `apps/tech-pwa/src/app/jobs/[id]/measurements/page.tsx` |
| Parameter / grid entry | `apps/tech-pwa/src/app/jobs/[id]/measurements/[parameterId]/page.tsx`, `measurement-grid.tsx` |
| Measurement queries | `apps/tech-pwa/src/app/jobs/[id]/measurements/use-measurements-query.ts` |
| Types (`REWORK`, `reviews`, `currentAttempt`) | `apps/tech-pwa/src/lib/calibration/types.ts` |
| Review helpers | `apps/tech-pwa/src/lib/calibration/quality-review.ts` |
| Lock Option A (UI) | `apps/tech-pwa/src/lib/calibration/measurement.ts` (`canRecordMeasurement`) |
| Queue “selesai” | `apps/tech-pwa/src/lib/calibration/job-display.ts` (`isJobDone` = hanya `ACCEPTED_BY_QA`) |
| Error copy | `apps/tech-pwa/src/lib/api-errors.ts` |
| Sticky bar | `apps/tech-pwa/src/components/layout/sticky-action-bar.tsx` |
| Tes helper | `apps/tech-pwa/src/lib/calibration/quality-review.test.ts`, `measurement.test.ts` |

Tidak ada: `useResumeAfterRework`, pemakaian `calibrationJobResumeAfterRework`, cabang UI untuk notes REJECT.

### Portal / MT

| Permukaan | Path |
|---|---|
| Job detail, `QualityReviewPanel`, `CorrectionCard`, `RejectDialog` | `apps/portal/src/app/management/calibration-jobs/[id]/page.tsx` |
| List, badge, hint “Menunggu review” | `apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx` |
| Hooks termasuk `useDecideQualityReview` | `apps/portal/src/app/management/calibration-jobs/use-calibration-jobs-query.ts` |
| Review / error helpers | `apps/portal/src/app/management/calibration-jobs/calibration-job-utils.ts` |
| Tes helper | `apps/portal/src/app/management/calibration-jobs/calibration-job-utils.test.ts` |
| Label Permission Management | `apps/portal/src/app/management/permission-management/page.tsx` |

`QualityReviewPanel` eksplisit APPROVE only (komentar: “no Tolak / REJECT”). `RejectDialog` hanya dipakai Identity Correction.

### Shared / auth / API (kontrak, bukan perubahan UI domain)

| Item | Path |
|---|---|
| `qualityReviewDecisionSchema` `APPROVE \| REJECT` | `packages/shared/src/schemas/index.ts` |
| `calibrationJobResumeAfterRework` | `packages/auth/src/me-types.ts`, `apps/api/src/modules/me/me.controller.ts` |
| `POST :id/resume` | `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts` |
| GET job `reviews` `orderBy createdAt desc, take: 1` | `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` (`calibrationJobInclude`) |

---

## 3. BACKEND → UI CONTRACT MAP

| Backend | Frontend sekarang | Gap |
|---|---|---|
| `CalibrationJob.status` | Badge, gate Kirim/Selesai, lock pengukuran | Resume belum di-wire |
| `submittedAt` | Ada di tipe; lock UI memakai **status**, bukan `submittedAt` | NONE (selaras Option A) |
| `currentAttempt` | Filter `attemptNumber === currentAttempt` | Saat REWORK counter sudah N+1 → grid/section kosong |
| `reviews[0]` | `latestQualityReview` = `reviews[0]` | Cukup v1 jika dikombinasi dengan `status` |
| `QualityReview.status` / `decision` / `notes` | Dipakai hanya jika latest **APPROVED** | REJECT notes tidak ditampil |
| `POST /calibration-jobs/:id/submit` | `useSubmitForReview` | NONE |
| `POST /calibration-jobs/:id/quality-decision` | `useDecideQualityReview` + tipe `QualityReviewDecisionInput` | Portal hanya mengirim `APPROVE` |
| `POST /calibration-jobs/:id/complete` | `useCompleteJob` | NONE |
| `POST /calibration-jobs/:id/resume` | **Tidak ada hook/method typed di Tech-PWA atau Portal** | **UI implementation gap** |
| `calibrationJobResumeAfterRework` | Ada di `/me` | Tidak dipakai UI |
| `calibrationJobDecideQualityReview` | Portal Setujui | Tolak belum |

Jangan infer izin dari nama role. Ikuti capability flags.

---

## 4. TECH-PWA REWORK GAPS

### Perilaku target vs aktual

| State | Aktual | Gap |
|---|---|---|
| **REWORK** | Badge `"Perbaikan"` (oranye). `canRecordMeasurement` false. Copy kunci sudah ada. | Tidak ada Resume. Footer StickyActionBar tidak menyala (hanya start / escalate / BA / Kirim / Selesai). |
| **REWORK + latest QR REJECTED** | `reviews[0]` = REJECTED | `JobHeaderBlock` hanya merender notes jika `approved`. Feedback MT tidak terlihat. |
| **IN_PROGRESS setelah Resume** | Entry + Kirim existing akan hidup sendiri | Perlu hook Resume + invalidate. Notes REJECT tetap tidak tampil (masih berguna). |
| **SUBMITTED setelah resubmit** | `isAwaitingQualityReview` = SUBMITTED && !latest APPROVED → **true** meski `reviews[0]` masih REJECTED | Jangan tampilkan REJECT sebagai keputusan siklus ini; badge harus “Menunggu Review”. |
| **SUBMITTED + APPROVED** | Badge Disetujui, notes, **Selesai** | Jangan diubah |

### Gap visibilitas section (HIGH)

`page.tsx` `showRecordMeasurement`:

```
capability recordMeasurement &&
(status === IN_PROGRESS || ada baris currentAttempt)
```

Setelah REJECT, `currentAttempt` sudah N+1 dan belum ada baris baru → section **Hasil Pengukuran** (termasuk copy kunci dan link Catat) **hilang** dari job detail.

Deep-link `/jobs/:id/measurements` masih menampilkan banner kunci (`measurementLockedReason` untuk REWORK). Parameter entry memakai `editable = canRecordMeasurement(job)` — selaras Option A.

### Option A (UI)

Sudah benar di helper:

- `canRecordMeasurement` = `status === IN_PROGRESS && startedAt !== null`
- REWORK → false
- Copy: *“Job dikembalikan untuk perbaikan — mulai ulang attempt sebelum mencatat hasil.”*

Jangan andalkan UI sebagai satu-satunya gerbang; backend sudah menolak write. UI harus mencerminkan itu + memaksa Resume.

### Attempt UI

Tidak wajib menampilkan history attempt lama. Filter current attempt sudah ada. Jangan tambah UI noise. Satu-satunya konsekuensi yang harus diatasi: section tidak boleh hilang saat REWORK dengan attempt baru masih kosong.

### List

`jobs-ui.tsx` `UnitRow`: badge status REWORK ada; cue quality hanya awaiting / approved. Tidak ada “Ditolak” untuk hasil. `isJobDone` tidak menganggap REWORK selesai — antrian tetap terbuka. OK.

---

## 5. PORTAL REWORK GAPS

| Item | Aktual | Target | Gap |
|---|---|---|---|
| Setujui | `handleApproveQualityReview` → `{ decision: "APPROVE" }` | Pertahankan | NONE (jangan redesign) |
| Tolak | Tidak ada | `RejectDialog` pattern + `{ decision: "REJECT", notes }` | HIGH |
| Notes wajib | — | `!note.trim()` disable confirm (pola BA) | HIGH |
| Setelah REJECT | Badge job `REWORK` di header | Tampilkan dikembalikan + notes | Panel tidak render REJECTED |
| Tabel hasil | Filter `attemptNumber === currentAttempt` | MT perlu melihat yang baru saja ditolak dan/atau attempt berjalan | Saat REWORK tabel kosong |
| Antrian list | `isAwaitingQualityReview` + hint “Menunggu review” | Setelah REJECT, hint hilang (bukan SUBMITTED); badge Rework | NONE untuk antrian decide |
| Error fallback approve | “Gagal memproses keputusan BA.” | Copy hasil, bukan BA | LOW |

`canDecideQualityReview` = SUBMITTED && !latest APPROVED. Setelah resubmit (latest masih REJECTED) decide **true** — benar. Setelah APPROVE, decide false — benar.

Jangan ubah `CorrectionCard` Identity Correction. Reuse `RejectDialog` sebagai **pola** (props title/description/onSubmit), bukan domain BA.

---

## 6. QUALITY REVIEW / STALE REVIEW ANALYSIS

GET job mengembalikan **satu** review terbaru (`createdAt desc`, `take: 1`). Tidak ada `attemptNumber` di QualityReview (terkunci v1). Ordering API **cukup**.

Frontend memakai `reviews[0]` sebagai latest. Itu benar **jika** dikombinasi dengan `job.status`:

| Job status | Latest QR | Arti UI |
|---|---|---|
| SUBMITTED | (kosong) | Menunggu Review — siklus pertama |
| SUBMITTED | REJECTED | Menunggu Review — **siklus baru**, bukan “masih ditolak” |
| SUBMITTED | APPROVED | Disetujui → Selesai |
| REWORK | REJECTED | Perbaikan; tampilkan notes REJECT |
| IN_PROGRESS | REJECTED | Koreksi berjalan; notes REJECT boleh tetap terlihat |
| ACCEPTED_BY_QA | APPROVED | Terminal |

`isAwaitingQualityReview` / `canCompleteJob` / `canDecideQualityReview` **sudah** memakai rumus ini untuk awaiting/complete. Gap hanya **presentasi** notes/badge REJECT.

Risiko stale jika implementasi nanti menampilkan “Ditolak” setiap kali `latest.decision === REJECT` tanpa cek status — setelah resubmit teknisi akan melihat Ditolak + Menunggu Review bersamaan. Laporkan sebagai aturan mapping, jangan dipecahkan di audit ini.

Multi-cycle REJECT → REJECT → APPROVE: setelah APPROVE, `reviews[0]` = APPROVED; REJECT lama tidak ter-embed. UI tidak akan menampilkan REJECT lama sebagai keputusan aktif **selama** hanya membaca `reviews[0]`.

---

## 7. POLLING / REFRESH ANALYSIS

| Transisi | Mekanisme | Cukup? |
|---|---|---|
| Tech: MT REJECT → REWORK | `useJobQuery(..., { poll: true })` 6s + focus | Ya |
| Tech: Resume → IN_PROGRESS | Belum ada mutation | Perlu invalidate pola submit (`["jobs"]`, `["job", id]`) |
| Tech: Kirim → SUBMITTED | `useSubmitForReview` invalidate | Ya |
| Tech: MT APPROVE | Poll 6s | Ya |
| Portal list SUBMITTED ↔ REWORK/APPROVED | `useCalibrationJobs` / grouped 6s | Ya |
| Portal **detail** | `useCalibrationJob` **tanpa** `refetchInterval` | Sama seperti happy path; refetch setelah mutate |

Measurement results **tidak** di-poll. Key di bawah `["job", id, …]`; invalidate `["job", id]` ikut menyapu (komentar `use-measurements-query.ts`). Hook Resume harus invalidate itu.

**Jangan** menambah polling baru kecuali terbukti perlu. Portal detail tanpa poll bukan blocker baru (approve happy path sudah begitu).

---

## 8. PERMISSION ANALYSIS

UI memakai capability dari `useAuthz()`, bukan nama role.

| Aksi | Flag | Visible sekarang |
|---|---|---|
| Catat hasil | `calibrationJobRecordMeasurement` | Ya |
| Kirim | `calibrationJobSubmitForReview` + `canSubmitForReview` | Ya |
| Selesai | `calibrationJobComplete` + `canCompleteJob` | Ya |
| Resume | `calibrationJobResumeAfterRework` | **Tidak dipakai** |
| Setujui / Tolak | `calibrationJobDecideQualityReview` + `canDecideQualityReview` | Hanya Setujui |

MT tidak punya `recordMeasurement` di seed; halaman measurements menolak tanpa capability. Konsisten.

Permission Management `ACTION_LABELS` belum memuat `resumeAfterRework` — LOW (admin label, bukan alur teknisi). Catalog API tetap akan menampilkan action mentah.

---

## 9. IDENTITY CORRECTION UI PATTERN REFERENCES

Reuse **pola perilaku**, bukan model/tabel BA. Jangan ubah Identity Correction.

| Pola | Lokasi | Dipakai untuk REWORK |
|---|---|---|
| Setujui + Tolak | `CorrectionCard` di `[id]/page.tsx` | Portal quality panel |
| Dialog notes wajib | `RejectDialog` (textarea “Catatan keputusan”, confirm `disabled={!note.trim()}`) | Body `{ decision: "REJECT", notes }` |
| Badge Ditolak / Disetujui / Menunggu Review | `IDENTITY_CORRECTION_STATUS_LABELS` + class badge | Tech-PWA header (sudah dipakai APPROVED/awaiting) |
| “Diputuskan oleh” / tanggal / notes | `JobHeaderBlock` (APPROVED), `CorrectionCard` decided block | Cabang REJECTED |
| StickyActionBar + Button langsung | Kirim / Selesai / Mulai Kalibrasi | Resume (tanpa dialog, seperti Kirim) |

Catatan copy BA: `RejectDialog` confirmLabel `"Reject"` (EN). Tombol kartu BA sudah **"Tolak"**. Untuk hasil, pakai **Tolak**.

Polaritas berbeda: BA = teknisi usul, MT apply/tolak. Hasil = teknisi kirim data, MT minta koreksi, teknisi yang mengubah nilai. Jangan campur domain.

---

## 10. EXACT FILES THAT WOULD NEED TO CHANGE

Implementasi berikutnya (bukan sekarang):

**Tech-PWA**

- `apps/tech-pwa/src/app/jobs/[id]/use-job-query.ts` — `useResumeAfterRework`
- `apps/tech-pwa/src/app/jobs/[id]/page.tsx` — aksi Resume, visibilitas section REWORK, footer
- `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx` — `ResumeAction`; `JobHeaderBlock` notes REJECT
- `apps/tech-pwa/src/lib/calibration/quality-review.ts` — helper REWORK / latest REJECTED (jika perlu)
- `apps/tech-pwa/src/lib/calibration/quality-review.test.ts`
- `apps/tech-pwa/src/lib/api-errors.ts` — `CALIBRATION_JOB_NOT_IN_REWORK`, `CALIBRATION_JOB_ALREADY_RESUMED`, `MEASUREMENT_JOB_NOT_IN_PROGRESS`, opsional `QUALITY_REVIEW_NOTES_REQUIRED`
- Opsional: `apps/tech-pwa/src/app/jobs/jobs-ui.tsx` cue list

Measurements list/entry: **reuse**; tidak perlu alur editor kedua. Mungkin hanya copy/banner jika Resume harus terlihat di measurements (opsional; aksi utama di job detail).

**Portal**

- `apps/portal/src/app/management/calibration-jobs/[id]/page.tsx` — Tolak pada `QualityReviewPanel`, handler REJECT, tampilan REWORK/notes
- `apps/portal/src/app/management/calibration-jobs/calibration-job-utils.ts` — mapping error + helper tampilan jika perlu
- `apps/portal/src/app/management/calibration-jobs/calibration-job-utils.test.ts`
- Ringan: `apps/portal/src/app/management/permission-management/page.tsx` label `resumeAfterRework`

`useDecideQualityReview` sudah menerima `QualityReviewDecisionInput`; cukup kirim `REJECT` + notes. Tidak wajib hook baru di Portal.

---

## 11. FILES THAT MUST NOT CHANGE

- Backend REWORK: `calibration-jobs.service.ts` transisi, measurement guard Option A, Prisma schema, enum
- Identity Correction: wizard Tech-PWA, `CorrectionCard` domain BA, PDF BA, schema/tabel `IdentityCorrection`
- Semantik happy path: APPROVE tetap SUBMITTED; `complete` → `ACCEPTED_BY_QA`; copy **Kirim** / **Selesai**
- JobHandOff, post-approval correction, PASS/FAIL, completeness/tolerance redesign, signature/PDF/certificate/FCM, WorkOrder DONE
- Jangan buat `MeasurementCorrection`, framework koreksi generik, `REQUEST_CHANGES`, kolom `QualityReview.attemptNumber`

---

## 12. PROPOSED IMPLEMENTATION ORDER

1. Helper review (Tech-PWA + Portal jika perlu): REWORK + latest REJECTED; resubmit tetap awaiting, bukan “Ditolak”.
2. Tech-PWA: hook Resume + capability `calibrationJobResumeAfterRework` + `ResumeAction` di `StickyActionBar`.
3. Tampilkan notes REJECT di `JobHeaderBlock` (status REWORK / IN_PROGRESS dengan latest REJECTED).
4. Perbaiki `showRecordMeasurement` agar REWORK tetap terlihat (kunci + Resume) tanpa membuka edit.
5. Portal: Tolak + `RejectDialog` pattern pada `QualityReviewPanel`; Setujui tetap.
6. Pertimbangkan tampilan attempt tertolak di Portal saat status REWORK (bukan history UI penuh).
7. Copy error resume/REJECT; tes helper; E2E manual.
8. Jangan sentuh happy path Setujui/Selesai kecuali regresi.

---

## 13. TEST PLAN

**Helper (unit)**

- `canRecordMeasurement(REWORK)` false; `measurementLockedReason(REWORK)` memuat “perbaikan”
- SUBMITTED + latest REJECTED = awaiting, bukan complete, bukan approved badge
- SUBMITTED + APPROVED = complete
- REWORK + REJECTED ≠ awaiting, ≠ complete
- Resume helper: hanya `status === REWORK` (jika ditambah)

**Tech-PWA**

- Capability Resume false → tombol tidak tampil
- REWORK: tidak ada Kirim/Selesai; tidak ada link Catat editable
- Setelah Resume (mock/job status IN_PROGRESS): Kirim muncul, entry terbuka

**Portal**

- `canDecideQualityReview` hanya SUBMITTED tanpa APPROVED
- REJECT tanpa notes ditolak di UI (dialog disabled)
- Setujui regresi: body APPROVE, notes opsional

**Jangan** tes Identity Correction sebagai bagian REWORK. Jangan ubah tes BA kecuali terpengaruh tidak sengaja (tidak seharusnya).

---

## 14. MANUAL E2E SCENARIO

### A. Happy path regresi

1. Teknisi: IN_PROGRESS → **Kirim** → SUBMITTED, pengukuran terkunci, “Menunggu Review”
2. MT: **Setujui** (notes opsional) → job tetap SUBMITTED, “Disetujui”
3. Teknisi: **Selesai** → `ACCEPTED_BY_QA`

Tidak boleh berubah.

### B. REWORK

1. Teknisi: Kirim
2. MT: **Tolak** + notes wajib → job **Perbaikan**
3. Teknisi: melihat notes; pengukuran **tidak** editable; ada **Resume** (capability)
4. Resume → IN_PROGRESS; isi/ubah pengukuran attempt baru
5. **Kirim** → SUBMITTED, “Menunggu Review” (bukan Disetujui, bukan Ditolak sebagai keputusan aktif)
6. MT: **Setujui** → Selesai → `ACCEPTED_BY_QA`

### C. Option A

Saat REWORK:

- UI tidak editable
- POST/PATCH/DELETE pengukuran ditolak backend (`MEASUREMENT_JOB_NOT_IN_PROGRESS` atau superseded untuk attempt lama)

### D. Multiple REWORK cycle

Attempt 1 REJECT → Resume → Attempt 2 REJECT → Resume → Attempt 3 APPROVE → complete.

Setelah resubmit attempt 2/3: UI tidak menampilkan notes REJECT lama sebagai keputusan **aktif** siklus SUBMITTED. Setelah APPROVE: Disetujui + Selesai. Notes REJECT tidak menimpa APPROVED.

---

## Copy (established vs usulan)

**Jangan ganti (sudah hidup):**

- **Kirim** / **Mengirim…**
- **Selesai**
- **Setujui** / **Tolak**
- **Menunggu Review** / **Disetujui** / **Ditolak**
- Status job REWORK: **Perbaikan**
- Kunci pengukuran REWORK: *“Job dikembalikan untuk perbaikan — mulai ulang attempt sebelum mencatat hasil.”*
- Label notes: **Catatan keputusan**

Jangan perkenalkan: “Kirim ke MT”, “Submit ke MT”, “Kirim Hasil ke MT”.

**Resume — belum ada tombol established.** Jangan reuse **Mulai Kalibrasi** (itu `PENDING → IN_PROGRESS`).

Usulan (bukan implementasi): **Lanjutkan perbaikan** — selaras badge Perbaikan. Alternatif lebih lemah: “Lanjutkan”.

Portal list label status REWORK saat ini **“Rework”** (EN), Tech-PWA **“Perbaikan”**. Bukan blocker; jangan harmonisasi dalam PR REWORK kecuali copy-edit kecil sadar.

---

## Responsive / konsistensi visual

Reuse, jangan redesign:

- Badge oranye REWORK sudah ada (PWA + Portal)
- `StickyActionBar` + `Button` fullWidth (pola Kirim/Selesai)
- Banner amber kunci di measurements page
- Portal `QualityReviewPanel` + pasangan tombol Setujui/Tolak seperti `CorrectionCard`
- Mobile: aksi di footer; notes di header job

---

## Observasi di luar scope (jangan dikerjakan di PR REWORK UI)

- Identity gate / alat referensi **tidak** terkunci pada `REWORK` (lock set hanya SUBMITTED + ACCEPTED_BY_QA). Sama seperti audit backend. Jangan ubah Identity Correction.
- Race concurrent APPROVE di backend tidak disentuh.
- `GET /quality-reviews` history tidak ada; `reviews[0]` cukup v1.

---

## Konflik desain?

**Tidak ada.** Backend increment pada REJECT (bukan resume) membuat `currentAttempt` naik sebelum teknisi menulis — itu terkunci. Konsekuensi UI (grid kosong saat REWORK) adalah gap tampilan, bukan alasan mengubah backend.

Jangan silently redesign lifecycle. Jangan pecahkan gap di audit ini.
