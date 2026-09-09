# Diagnosis + rencana — `CalibrationJob.currentAttempt` pada transisi REWORK

**Date:** 2026-09-09
**Mode:** Stage 1 — PROPOSE ONLY. Tidak ada kode, schema, migrasi, atau data yang diubah.
**Pemicu:** review desain Stage B (2026-09-09) — guard dan stamp `attemptNumber` sudah ada, increment `currentAttempt` tidak terlihat.
**Sumber desain terkunci:** [MeasurementResult_Stage1_Design_Finalization.md](../MeasurementResult_Stage1_Design_Finalization.md) §6–§7.
**HARD STOP** setelah laporan ini — review + persetujuan wajib sebelum Stage 2 (implementasi).

---

## 0. TL;DR

| # | Pertanyaan | Jawaban |
|---|---|---|
| 1 | Di mana `SUBMITTED → REWORK` terjadi? | **Tidak di mana pun.** Tidak ada use-case submit, rework, atau accept-QA. Satu-satunya transisi status produksi adalah `PENDING → IN_PROGRESS` (`CalibrationJobsService.start`). |
| 2 | Lock bergantung pada apa? | **Job-level saja.** `MeasurementResult` **tidak punya** `submittedAt`. Guard: `status ∈ {SUBMITTED, ACCEPTED_BY_QA}` **atau** `CalibrationJob.submittedAt !== null`, plus `row.attemptNumber < job.currentAttempt`. |
| 3 | `submittedAt` di-reset saat REWORK? | Tidak bisa dinilai dari runtime — transisi itu belum ada. `submittedAt` **tidak pernah ditulis** oleh service produksi (hanya di-set di tes). |
| 4 | Apakah gap increment membuka edit baris lama *hari ini*? | **Tidak, belum.** Tidak ada jalur API yang mensubmit atau mengembalikan job, jadi siklus "submitted lalu dibuka lagi" tidak bisa terjadi lewat produk. |
| 5 | Apakah gap tetap nyata? | **Ya, sebagai lubang desain yang belum dibangun** — bukan bug runtime yang sedang dieksploitasi. Increment harus lahir **bersama** handler transisi, dalam transaksi yang sama, plus penanganan `submittedAt` (lihat §3 dan §5). Tanpa itu, saat QA/rework akhirnya dilive, aturan "submitted rows never edited" pecah atau attempt baru tidak bisa ditulis. |

---

## 1. Diagnosis

### 1.1 State machine `CalibrationJob.status` — apa yang benar-benar ada

Enum hidup (`PENDING | IN_PROGRESS | SUBMITTED | REWORK | ACCEPTED_BY_QA`) tidak berubah sejak init.

**Write status di aplikasi (bukan tes):**

| Lokasi | Transisi | Efek samping |
|---|---|---|
| [`calibration-jobs.service.ts`](../../../apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts) `start()` ~baris 483–498 | `PENDING → IN_PROGRESS` | Stempel `startedAt`. Tidak menyentuh `currentAttempt` / `submittedAt`. |
| Controller | `POST /calibration-jobs/:id/start` | Satu-satunya endpoint ubah status job. |

Tidak ada `POST .../submit`, `.../rework`, `.../accept`, atau `PATCH` generik untuk `status`. Tidak ada modul `QualityReview` di `apps/api` (model Prisma ada di `schema.prisma` ~2236; **nol** service/controller/import aplikasi).

Komentar `start()` sendiri menyatakan fase submit-for-review / QA "designed separately alongside MeasurementResult and may later absorb this action." Fase itu **belum dikerjakan**.

Portal hanya mewarnai badge `REWORK` ([`calibration-jobs-ui.tsx`](../../../apps/portal/src/app/management/calibration-jobs/calibration-jobs-ui.tsx) ~189). Tidak ada aksi status.

Tes yang men-set `status: "SUBMITTED"` / `"ACCEPTED_BY_QA"` / `"REWORK"` melakukannya lewat `prisma.calibrationJob.update` langsung — itu fixture, bukan jalur produksi.

**Kesimpulan Step 1.1:** increment tidak "ketinggalan di handler yang sudah ada". Handler yang dirancang sebagai *satu-satunya momen increment* **belum ada**.

### 1.2 Mekanisme lock — persis apa adanya

`MeasurementResult` tidak punya kolom `submittedAt`. Field itu hanya di `CalibrationJob` (`DateTime?`).

Guard hidup ([`measurement-results.service.ts`](../../../apps/api/src/modules/calibration-jobs/measurement-results.service.ts) `assertMeasurementRowEditable`, §7.1 diterapkan):

```
1. row.attemptNumber < job.currentAttempt
     → MEASUREMENT_ATTEMPT_SUPERSEDED
2. job.status ∈ {SUBMITTED, ACCEPTED_BY_QA}  OR  job.submittedAt !== null
     → MEASUREMENT_JOB_SUBMITTED
```

Dipanggil di **setiap** create / batch / update / delete. Create/batch menstempel `attemptNumber = job.currentAttempt` lalu menjalankan guard seolah-olah row itu attempt berjalan.

Catatan yang mudah terlewat:

- `REWORK` **tidak** masuk `MEASUREMENT_LOCKED_JOB_STATUSES`. Status itu sendiri tidak mengunci.
- `assertJobStarted` hanya cek `startedAt !== null`, **bukan** `status === IN_PROGRESS`. API akan mengizinkan write pada job `REWORK` jika `submittedAt` null.
- tech-pwa (di luar scope perbaikan, tetapi relevan untuk diagnosis) mengunci UI pada `REWORK` (`measurementLockedReason`: "mulai ulang attempt sebelum mencatat") dan hanya mengizinkan entry saat `IN_PROGRESS`.
- Tes eksplisit: `IN_PROGRESS` + `submittedAt` terisi → write **ditolak**, meski status tidak terkunci. Jadi `submittedAt !== null` adalah sabuk pengaman independen, sesuai §7.1.

Tidak ada lock per-row di `MeasurementResult`. Histori attempt lama hanya aman jika `currentAttempt` sudah lebih besar dari `attemptNumber` mereka, atau jika job-level lock (`status` / `submittedAt`) masih aktif.

### 1.3 Apakah celah edit baris lama sudah terbuka?

**Hari ini: tidak.** Alasan:

1. Tidak ada service yang mengisi `submittedAt`.
2. Tidak ada service yang memindahkan job ke `SUBMITTED` atau `REWORK`.
3. Job lapangan yang `IN_PROGRESS` + `submittedAt = null` + `currentAttempt = 1` adalah keadaan normal attempt pertama — barisnya *memang* boleh diedit.
4. Excel export MeasurementResult belum ada. Tolerance engine tidak membaca `attemptNumber`.

**Saat transisi REWORK nanti dilive, tanpa increment, celahnya tergantung pasangan `status` + `submittedAt`:**

| Cara resume yang dibangun | Increment tidak ada | Akibat |
|---|---|---|
| Status `REWORK` atau `IN_PROGRESS`, **`submittedAt` tetap terisi** | Guard klausul 2 menolak **semua** write | Baris lama aman, tetapi attempt baru **tidak bisa dicatat**. Over-lock, bukan under-lock. |
| Status `IN_PROGRESS`, **`submittedAt` di-null-kan**, `currentAttempt` tetap 1 | Guard klausul 1 gagal (1 `<` 1 salah); klausul 2 gagal (`submittedAt` null) | **Baris attempt 1 editable lagi.** Ini pelanggaran langsung "submitted rows never edited" yang dikhawatirkan brief. |
| Status `REWORK`, `submittedAt` di-null-kan, counter tetap 1 | API mengizinkan write (lihat `assertJobStarted`); UI tech-pwa masih mengunci | Lubang API jika klien memanggil endpoint langsung. |

Jadi asumsi Stage B "baris lama terlihat sebagai attempt aktif" **benar hanya jika** resume mengosongkan `submittedAt` (atau tidak pernah mengisinya) **tanpa** menaikkan counter. Itu skenario resume yang paling masuk akal agar teknisi bisa menulis lagi — justru karena tes mengunci `IN_PROGRESS` + `submittedAt` terisi.

**Temuan tambahan — ketegangan desain §6 vs §7.1 (bukan perubahan aturan lock):**

- §6: `CalibrationJob.submittedAt` "continues to hold the most-recent submission time."
- §7.1 + tes: `submittedAt !== null` mengunci write bahkan saat `IN_PROGRESS`.
- Jika increment saja yang ditambahkan dan `submittedAt` dibiarkan terisi, attempt N+1 tidak bisa ditulis.

Increment **dan** siklus hidup `submittedAt` harus dirancang bersama. Mengosongkan `submittedAt` saat attempt baru dibuka **bukan** mengubah aturan lock ("kalau terisi, kunci") — itu mereset flag job-level supaya attempt *berjalan* bisa ditulis. Baris lama tetap beku lewat `attemptNumber < currentAttempt`. Brief: "Tidak mengubah aturan lock `submittedAt` yang sudah dikunci" — aturan itu tetap; yang diusulkan adalah *kapan flag diisi/dikosongkan* di handler yang belum ada.

### 1.4 Konsumen `currentAttempt` / `attemptNumber`

Tidak ada penulis `currentAttempt` di aplikasi. Satu-satunya `UPDATE` kolom itu adalah default migrasi `DEFAULT 1` (`20260908025400_*`).

| Konsumen | Peran | Asumsi |
|---|---|---|
| `assertMeasurementRowEditable` | Bekukan row lama | Counter akurat → row lama `attemptNumber < current` |
| `MeasurementResultsService.create` / `createMany` | Stempel `attemptNumber = job.currentAttempt` | Counter = nomor attempt yang sedang diisi |
| `loadJob` / `loadRowForWrite` | Select `currentAttempt`, `submittedAt`, `status` | — |
| List `measurement-results` | Order by `attemptNumber` | Histori semua attempt, tidak memfilter |
| tech-pwa list/detail/job-detail | Filter `row.attemptNumber === job.currentAttempt` | Counter akurat → grid/list hanya attempt berjalan |
| tech-pwa `TechCalibrationJob.currentAttempt` | Mirror payload job | Skalar sudah ada di GET job |
| Tes guard | Fixture `currentAttempt: 2` | Mensimulasikan dunia *setelah* increment |

**Tidak membaca field ini:** `measurement-tolerance.ts`, QualityReview (tidak ada kode), Excel export (belum ada), Portal (badge status saja).

Tidak ada konsumen tersembunyi yang akan pecah jika increment ditambahkan di handler baru. Yang akan pecah jika *lupa* increment: filter tech-pwa (menampilkan baris attempt 1 sebagai "berjalan") dan guard SUPERSEDED (tidak pernah menembak).

### 1.5 Inkonsistensi dokumen tentang *kapan* increment

Perlu diselesaikan di Stage 2, bukan diabaikan:

| Sumber | Momen increment |
|---|---|
| `schema.prisma` komentar `currentAttempt` | `SUBMITTED → REWORK` |
| Brief tugas ini | `SUBMITTED → REWORK` |
| Design §6 body (blok ASCII) | `SUBMITTED → IN_PROGRESS` ("technician resumes"), increment dalam tx yang sama |
| Design §7.1 create | `job.status IN (IN_PROGRESS)` |
| tech-pwa | `REWORK` terkunci; entry hanya `IN_PROGRESS` |

Keduanya tidak bisa benar bersamaan tanpa langkah kedua. Rekomendasi di §5.

---

## 2. Audit data (pkmdb) — dari kode, belum query hidup

MeasurementResult + `currentAttempt` live sejak migrasi 2026-09-08. Transisi REWORK tidak ada di API → **kontaminasi lewat produk tidak mungkin**.

Tidak dijalankan query hidup di Stage 1 ini (propose-only, tanpa akses operasional yang dijamin). Stage 2 **wajib** audit read-only sebelum menulis apa pun:

```
-- sebaran
SELECT status, "currentAttempt", COUNT(*) FROM "CalibrationJob" GROUP BY 1, 2;

SELECT COUNT(*) FROM "CalibrationJob" WHERE status = 'REWORK';
SELECT COUNT(*) FROM "CalibrationJob" WHERE "currentAttempt" > 1;
SELECT COUNT(*) FROM "MeasurementResult" WHERE "attemptNumber" > 1;
SELECT COUNT(*) FROM "QualityReview";
```

Ekspektasi: semua `currentAttempt = 1`, nol `REWORK`, nol `attemptNumber > 1`, nol `QualityReview`. Jika itu yang muncul → **tidak perlu migrasi data**. Jika ada baris manual/SQL ad-hoc (`status = REWORK` atau `currentAttempt > 1` tanpa pasangan row), tangani kasus per kasus di Stage 2, jangan backfill buta.

---

## 3. Rencana perbaikan (proposal, belum implementasi)

### 3.1 Di service mana increment terjadi

**Tempat:** `CalibrationJobsService` — file yang sama dengan `start()`, bukan `MeasurementResultsService`.

Alasan: momen increment adalah transisi *job*, bukan write pengukuran. `start()` sudah pola "load → assert → `prisma.calibrationJob.update` → `findOne`". Handler baru mengikuti itu.

**Dua metode baru** (nama bisa disesuaikan, semantik dikunci):

1. **`submitForReview`** — `IN_PROGRESS → SUBMITTED`
   - Satu transaksi: `status = SUBMITTED`, `submittedAt = now()`.
   - `currentAttempt` **tidak** berubah.
   - Setelah ini, guard klausul 2 mengunci semua write (termasuk attempt berjalan). Sesuai decision #5.

2. **`returnForRework`** — `SUBMITTED → REWORK` — **momen increment**
   - Satu transaksi, atomic:
     - `status = REWORK`
     - `currentAttempt = { increment: 1 }` (Prisma increment, bukan baca-ubah-tulis di JS)
     - **`submittedAt = null`** — reset flag job-level agar attempt baru bisa ditulis setelah resume; aturan lock tidak berubah
   - Idealnya mencatat `QualityReview` (`decision = REJECT`, `reviewedAt = now`) dalam tx yang sama — desain §6 memakai itu sebagai audit "kapan attempt N dibounce". Jika QualityReview belum siap sebagai modul, flag sebagai follow-up; **jangan tunda increment** hanya karena itu.

3. **`resumeAfterRework`** — `REWORK → IN_PROGRESS`
   - Satu transaksi: `status = IN_PROGRESS`.
   - **Tidak** increment lagi.
   - `submittedAt` sudah null dari langkah 2.
   - Ini yang membuka entry tech-pwa yang sudah ada (`canRecordMeasurement`). Bukan tombol "Mulai attempt baru" baru — hanya transisi status yang UI itu sudah nantikan. Implementasi **endpoint** ini masuk Stage 2 backend; merancang/membangun tombol PWA **tetap di luar scope** (Stage B E9).

`ACCEPTED_BY_QA` (`SUBMITTED → ACCEPTED_BY_QA`) disebut agar state machine lengkap; tidak menaikkan counter, tidak mengosongkan `submittedAt`. Boleh menyusul PR yang sama atau terpisah — bukan blocker increment.

Semua update job di atas memakai `update` dengan `where: { id, status: <from> }` (optimistic) atau cek-status-lalu-update dalam transaksi, supaya dua klik REWORK tidak menaikkan counter dua kali.

### 3.2 `submittedAt` — tanpa mengubah aturan lock

Aturan terkunci tetap:

- `submittedAt !== null` → tidak ada write MeasurementResult.
- Tidak ada bypass, termasuk `TECHNICIAN_MANAGER`.

Siklus hidup yang diusulkan (baru, karena handler belum ada):

```
IN_PROGRESS, attempt N, submittedAt null     → tulis attempt N
       │ submitForReview
       ▼
SUBMITTED, attempt N, submittedAt terisi     → semua write kunci
       │ returnForRework   (currentAttempt N → N+1, submittedAt null)
       ▼
REWORK, attempt N+1, submittedAt null        → API: create attempt N+1 diizinkan;
       │                                       UI tech-pwa masih kunci sampai resume
       │ resumeAfterRework
       ▼
IN_PROGRESS, attempt N+1, submittedAt null   → tulis attempt N+1
                                               row attempt N: SUPERSEDED
```

Ini merekonsiliasi §6 (increment pada bounce), komentar schema (`SUBMITTED → REWORK`), §7.1 (create saat `IN_PROGRESS`), dan UI yang sudah mengunci `REWORK`.

**Ditolak:** increment di `SUBMITTED → IN_PROGRESS` satu langkah (ASCII §6). Itu meniadakan status `REWORK` yang sudah di enum, badge Portal, dan copy tech-pwa.

**Ditolak:** meninggalkan `submittedAt` terisi setelah REWORK. Bertentangan dengan kemampuan menulis attempt baru, kecuali aturan lock diubah — yang brief larang.

### 3.3 Migrasi data

Default: **tidak ada**, setelah audit §2 kosong.

Hanya jika audit menemukan job `REWORK` / `currentAttempt > 1` hasil suntingan manual: tulis skrip one-off terpisah, review per id. Jangan `UPDATE ... SET currentAttempt = currentAttempt + 1` massal.

### 3.4 Rencana tes

File: `calibration-jobs.service.test.ts` (transisi) + perluasan `measurement-results.service.test.ts` (guard lintas attempt).

Skenario wajib:

1. `IN_PROGRESS` → `submitForReview` → `status=SUBMITTED`, `submittedAt` non-null, `currentAttempt` tidak berubah.
2. Write (create/update/delete) setelah submit → `MEASUREMENT_JOB_SUBMITTED`.
3. `SUBMITTED → returnForRework` → `status=REWORK`, `currentAttempt = N+1`, `submittedAt = null`.
4. `returnForRework` pada job bukan `SUBMITTED` → 409/400, counter tidak bergerak.
5. `returnForRework` dua kali berurutan → yang kedua gagal (masih `REWORK`), counter hanya +1.
6. `REWORK → resumeAfterRework` → `IN_PROGRESS`, counter tetap N+1, `submittedAt` tetap null.
7. Create setelah resume → row baru `attemptNumber = 2`.
8. PATCH/DELETE row attempt 1 setelah resume → `MEASUREMENT_ATTEMPT_SUPERSEDED`; nilai terukur attempt 1 **identik** sebelum/sesudah.
9. Submit kedua → attempt 2 terkunci; attempt 1 tetap tidak berubah.
10. Tes regresi yang sudah ada (`IN_PROGRESS` + `submittedAt` terisi menolak write; Pattern A list parameters) tetap hijau.

Tidak menambah tes UI tech-pwa/Portal di Stage 2 ini.

### 3.5 Izin / HTTP (catatan field-level)

Belum ada action RBAC `submit` / `rework` / `resume` pada `calibrationJob` (yang ada: `read`, `start` implisit lewat update, identity, `recordMeasurement`, …). Stage 2 harus menambah action + grant (kemungkinan: teknisi `submit` + `resume`; manajer/QA `returnForRework` + `accept`). Detail grant mengikuti seed permission yang ada — dikunci saat implementasi, bukan di sini.

---

## 4. Di luar scope (tetap)

- tech-pwa / Portal UI, termasuk tombol "Mulai attempt baru" (Stage B §8 E9)
- Mengubah predikat lock `submittedAt !== null`
- LOGGER_SUMMARY, Pattern B grid, Excel export
- Deploy VPS
- Membangun modul QualityReview lengkap (disarankan tx yang sama jika murah; boleh menyusul)

---

## 5. Usulan yang diminta disetujui sebelum Stage 2

1. Membangun **tiga** transisi backend (`submitForReview`, `returnForRework`, `resumeAfterRework`), bukan menempel increment di `start()` atau di service pengukuran.
2. Increment **tepat satu** di `returnForRework` (`SUBMITTED → REWORK`), Prisma `increment: 1`, tx yang sama dengan ganti status.
3. `submittedAt = now()` pada submit; `submittedAt = null` pada rework. Aturan lock tidak berubah.
4. Audit read-only dulu; migrasi data hanya jika ada baris tercemar.
5. Tes siklus `submit → rework → resume → record attempt 2 → submit` dengan assert baris attempt 1 utuh.

---

## 6. HARD STOP

Laporan selesai. Tidak ada kode yang ditulis.

Tunggu persetujuan pada §5 sebelum Stage 2 (implementasi increment + tes + audit/migrasi jika perlu).
