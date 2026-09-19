Review Handoff MeasurementResult Stage A (tanpa ubah file)

Sumber: docs/cursor/HANDOFF_MeasurementResult_Stage_A_for_Cursor.md. Ini bukan rencana implementasi. Tidak ada usulan patch.

Verdict

Handoff layak dipakai sebagai konteks Stage A, dengan tiga koreksi wajib sebelum kerja UI:

Backend Stage 2a–2c sudah di-commit (handoff salah di sini).

Daftar endpoint Stage 2c tidak cukup untuk task #1 (identifikasi Pattern A) — klien tidak bisa query Prisma.

Filter valueType = NUMBER + tanpa CalibrationTestPoint bukan “hanya Pattern A”: parameter logger-summary Pattern D ikut lolos.

Sisa klaim schema/service/RBAC/lock/decimalPlaces/replicate-count terverifikasi.

Yang benar (FACT)

CalibrationTestPoint, MeasurementResult restruktur, enum NONE/UP/DOWN + DIRECT_READING/LOGGER_SUMMARY, FileOwnerType.MEASUREMENT_RESULT, CalibrationJob.currentAttempt, CHECK >= 1, unique natural key + NULLS NOT DISTINCT di SQL migrasi — semua ada di packages/db/prisma/schema.prisma dan migrasi 20260908025400_*.

Service + guard + CRUD + MEASUREMENT_DUPLICATE_ENTRY (409) + RBAC calibrationJob:recordMeasurement — ada di apps/api/src/modules/calibration-jobs/measurement-results.service.ts.

Lima endpoint di tabel §3.3 ada, nested di :id (bukan :jobId).

Zod schemas di packages/shared/src/schemas/index.ts; update hanya subset editable.

Tidak ada field expectedReplicateCount / trialCount di mana pun. Default UI 5 + “tambah ulangan” adalah keputusan yang tepat.

decimalPlaces ada (Int?); jangan di-hardcode 0.

Seed script + Audiometer split ada. Laporan seed: 40 parameter, 191 row — angka handoff benar; dokumen ekstraksi lama (“39”) sudah dikoreksi.

Pola lock API: attemptNumber < currentAttempt → MEASUREMENT_ATTEMPT_SUPERSEDED; status ∈ {SUBMITTED, ACCEPTED_BY_QA} atau submittedAt !== null → MEASUREMENT_JOB_SUBMITTED. Role-blind.

Transisi SUBMITTED → REWORK (increment currentAttempt) memang belum ada.

Commit backend yang sudah ada (handoff §3 mengklaim sebaliknya):

b8abd0a Stage 2a schema

c8b07bc Stage 2b service

97d6411 Stage 2c HTTP

4c868e7 seed + Audiometer split

Discrepancy / path salah

Klaim handoff

Kenyataan

“nothing has been committed to git yet”

Backend sudah 4 commit. Yang belum commit adalah WIP Stage A di working tree.

Baca desain di …/measurement-results/MeasurementResult_Stage1_Design_Finalization.md

File sebenarnya: docs/claude/plans/Calibration-management/MeasurementResult_Stage1_Design_Finalization.md

Spec Stage A hanya satu file

Ada duplikat: docs/claude/plans/Calibration-management/measurement-results/STAGE A tech-pwa Measurement Entry Skeleton_Pattern A Only.md dan salinan di UI-implementation/

“486 NUMBER-type … decimalPlaces = 0”

Angka dari desain 489-row. Setelah split Audiometer: 493 total / 491 aktif. Placeholder 0 tetap interim yang diterima; hitungan persis sedikit stale, bukan blocker.

Seed extraction “DRAFT — NOT YET RUN” di header script

Stale comment. Laporan Stage 2 menyatakan seed sudah dijalankan di pkmdb (191 row, idempotent).

Deploy VPS: tidak bisa diverifikasi dari repo (tetap hipotesis).

Gap yang handoff understate (penting untuk Stage A)

1. Tidak ada endpoint katalog — task #1 tidak bisa dilakukan dari tech-pwa

Task: “query DeviceCalibrationParameter filtered by job’s deviceTypeId…”. Tech-pwa hanya punya apiFetch. Tabel §3.3 tidak punya GET katalog.

Resolusi device type di API sudah ada dan harus dipakai, bukan diulang di klien:

private resolveJobDeviceTypeId(job: CalibrationJobDetail): string | null {
return (
job.calibrationRequestItem?.deviceTypeId ??
job.purchaseOrderItem?.quotationItem?.requestItem?.deviceTypeId ??
null
);
}

Handoff sendiri bilang: flag gap, jangan diam-diam menambah scope. Ini gap asli. Working tree sudah berisi GET /calibration-jobs/:id/measurement-parameters (belum di tabel handoff). Itu keputusan yang benar secara teknis, tetapi melanggar huruf “No API/schema changes expected” — harus di-flag di laporan Stage A, bukan diserap diam-diam.

2. Filter Pattern A membocorkan Pattern D logger-summary

Query yang diinstruksikan: isActive + valueType = NUMBER + testPoints: none.

Yang sengaja ikut (benar): Pattern C hasil split — desain mengunci mereka “berperilaku seperti A”.

Yang ikut padahal out of scope: baris NUMBER tanpa test point, by design untuk LOGGER_SUMMARY + lampiran, misalnya BBR_STORAGE_TEMP, KVAK_STORAGE_TEMP, CCHAIN_STORAGE_TEMP, MREF_STORAGE_TEMP, MFRZ_STORAGE_TEMP, OVEN_TEMP, STER_TEMP, CRFR_STORAGE_TEMP, PLT_STORAGE_TEMP (CalibrationTestPoint_Seed_Extraction.md §6.4).

BOOLEAN/RATIO (BSC_HEPA_LEAK, VENT_IE_RATIO, …) terfilter valueType. Generic/fixed-slot Pattern D punya CalibrationTestPoint jadi terfilter. Logger-summary tidak.

Handoff menulis “skip jika bukan NUMBER tanpa test point” — itu filter mekanis, bukan definisi Pattern A. Tanpa denylist / capabilityItem / kode eksplisit, teknisi fridge/oven akan melihat UI ulangan I–V yang salah.

Spot-check DUNIT_ILLUMINANCE tetap valid untuk Pattern A, tetapi tidak membuktikan filter tidak bocor.

3. Capability /me tidak disebut

Permission server ada. Gate UI tech-pwa mengikuti pola capabilities?.calibrationJobRecordReferenceEquipmentUsed. Tanpa calibrationJobRecordMeasurement di MeCapabilities + /me, tombol tidak bisa di-gate sama seperti aksi lain. Working tree sudah menambah field ini; handoff tidak menyebutkannya.

GET /calibration-jobs/:id sudah mengembalikan currentAttempt (scalar Prisma pada CalibrationJobDetail). Tipe klien TechCalibrationJob perlu field itu — gap tipe, bukan gap API.

4. Placement CTA ambigu

“Ajukan Koreksi Identitas” = footer sticky. “Catat alat referensi” = link in-section. Analog yang lebih dekat untuk pengukuran adalah section + link (seperti alat referensi), bukan footer. Handoff menyamakan keduanya.

5. Lock UI vs lock API

Handoff: “bukan IN_PROGRESS → read-only”, dan mapping ke MEASUREMENT_JOB_SUBMITTED / MEASUREMENT_ATTEMPT_SUPERSEDED.

API tidak mengunci REWORK lewat status; ia mengunci lewat submittedAt !== null dan attempt yang lebih kecil. Karena transisi REWORK belum dibangun, penyederhanaan IN_PROGRESS cukup untuk sekarang. Pesan MEASUREMENT_ATTEMPT_SUPERSEDED belum bisa terjadi di produksi sampai REWORK ada — boleh disiapkan, jangan dianggap alur hidup.

Pola existing tech-pwa lebih sering startedAt !== null daripada status === IN_PROGRESS (alat referensi). Keduanya hampir sama setelah “Mulai Kalibrasi”; bedanya hanya PENDING-tanpa-start vs IN_PROGRESS.

6. Polling

Asumsi “single technician, jangan poll refleksif” masuk akal. Job detail sudah poll: true (6s) untuk keputusan Portal. Layar entry pengukuran tidak perlu LIVE_REFRESH. Jangan meniru list jobs secara membabi buta.

Konteks workspace (bukan isi handoff)

Working tree sudah berisi WIP Stage A (uncommitted): route /jobs/[id]/measurements, helper apps/tech-pwa/src/lib/calibration/measurement.ts, section di job detail, endpoint katalog, capability /me. Handoff menulis Stage A seolah tugas yang belum mulai.

Implikasi untuk review ini: jangan anggap repo = “backend selesai, UI kosong”. Jangan juga menganggap WIP itu approved — ia belum di-commit dan masih bisa menyimpang dari scope (terutama kebocoran logger-summary).

Testing yang handoff minta — catatan

Suite API: regresi harus dibanding baseline 5–6 tes infra (IMAP, push, chat-gateway, scan lintas-app). Domain kalibrasi yang gagal = regresi nyata.

Tech-pwa: typecheck + vitest run; tes murni untuk chip/format decimalPlaces sesuai permintaan. Saat ini hanya apps/tech-pwa/src/lib/calibration/job-display.test.ts yang committed; measurement.test.ts ada di WIP.

Manual: butuh job IN_PROGRESS bertipe alat Pattern A. DUNIT_ILLUMINANCE adalah Dental Unit — tidak otomatis ada di data lokal.

Apa yang boleh dipercaya tanpa relitigasi

Scope Stage A = NUMBER + tanpa test point + DIRECT_READING (setelah kebocoran logger-summary ditangani).

Jangan invent field replicate count.

Jangan hardcode decimalPlaces.

Batch POST untuk baris baru, PATCH untuk baris tersimpan, GET untuk reopen.

HARD STOP sebelum Stage B.

Decimal JSON = string ("100"), bukan number.

Tidak ada langkah file/patch dari review ini. Keputusan yang perlu dikunci sebelum implementasi (atau sebelum meriview WIP) hanya: bagaimana mengeksklusi logger-summary dari daftar Stage A, dan apakah GET …/measurement-parameters dianggap gap yang diizinkan.
