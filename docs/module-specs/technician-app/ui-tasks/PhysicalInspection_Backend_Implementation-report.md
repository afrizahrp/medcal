# Physical Inspection — Backend Implementation Report

**Tanggal:** 2026-09-10  
**Scope:** BACKEND ONLY — tidak ada Tech-PWA UI, Portal Physical Inspection UI, atau master-management UI.

---

## 1. Scope

Domain baru **Physical Inspection** diimplementasikan sebagai child terpisah dari `MeasurementResult`:

```
DeviceType
  └── DevicePhysicalCheckItem[]     (catalog per jenis alat; 0..N valid)
        └── PhysicalCheckResult[]   (verdict BAIK / TIDAK_BAIK per attempt)
```

Cakupan yang dikerjakan:

- Prisma enum + dua model + migrasi
- Service, controller nested di `CalibrationJob`, Zod shared schemas
- RBAC `calibrationJob:recordPhysicalCheck` (TECHNICIAN write; MT read-only)
- Guard lifecycle mengikuti `MeasurementResult` (`IN_PROGRESS` only, no copy-forward)
- Tes backend A–I sesuai desain terkunci

Tidak diubah: `MeasurementResult`, tolerance engine, `submitForReview`, `decideQualityReview`, `resumeAfterRework`, `complete`, QualityReview schema, Identity Correction, JobHandOff, Tech-PWA, completeness gating.

Perubahan Portal satu baris: label `ACTION_LABELS.recordPhysicalCheck` — wajib oleh arsitektur RBAC yang sudah ada, bukan UI inspeksi fisik.

---

## 2. Schema Changes

Additive only.

| Artefak | Perubahan |
|---|---|
| `enum PhysicalCheckVerdict` | `BAIK`, `TIDAK_BAIK` — enum baru, tidak reuse `CalibrationValueType` / `ReviewDecision` |
| `model DevicePhysicalCheckItem` | Catalog global child `DeviceType` |
| `model PhysicalCheckResult` | Job child, natural key per attempt |
| `DeviceType.physicalCheckItems` | Relasi baru |
| `CalibrationJob.physicalCheckResults` | Relasi baru |
| `User.physicalCheckResultsRecorded` | Relasi `PhysicalCheckResultRecordedBy` |

`MeasurementResult` **tidak** diubah (kolom, unique, relasi, onDelete tetap). `prisma format` sempat merapikan alignment `DeviceCalibrationParameter`; alignment itu dikembalikan agar diff schema hanya additive.

---

## 3. Migration

`packages/db/prisma/migrations/20260910120000_add_physical_inspection/migration.sql`

Isi:

- `CREATE TYPE "PhysicalCheckVerdict"`
- `CREATE TABLE "DevicePhysicalCheckItem"` + unique `(deviceTypeId, code)` + index `deviceTypeId`, `isActive`
- `CREATE TABLE "PhysicalCheckResult"` + unique `physical_check_natural_key` `(calibrationJobId, devicePhysicalCheckItemId, attemptNumber)`
- FK job: `ON DELETE CASCADE`
- FK catalog item: `ON DELETE RESTRICT`
- FK `recordedByUserId`: `ON DELETE SET NULL` (nullable, analog `MeasurementResult`)
- FK `DevicePhysicalCheckItem.deviceTypeId`: `ON DELETE RESTRICT`

Tidak ada `ALTER` pada `MeasurementResult`.

Validasi:

- `npx prisma validate` → schema valid
- `npx prisma generate` → Prisma Client v6.19.3
- `prisma migrate deploy` pada `pkmdb_test` → `20260910120000_add_physical_inspection` applied
- `prisma migrate diff --from-url $TEST_DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script` → `-- This is an empty migration.`

---

## 4. DevicePhysicalCheckItem

Per-`DeviceType`, tanpa `companyId`, tanpa inheritance, tanpa fallback global.

| Field | Aturan |
|---|---|
| `code` / `name` | Wajib; unique `(deviceTypeId, code)` |
| `inspectionLimit` | Prosa LK "Batas Pemeriksaan", bukan numeric tolerance |
| `sortOrder` | Urutan tampilan (`default 0`) |
| `isActive` | `true` = boleh dipakai untuk **NEW** result; `false` menolak write baru |
| `createdAt` / `updatedAt` / `id` | Konvensi catalog repo (`cuid()`, timestamps) |

Tidak ada: `capabilityItemId`, `toleranceMin`/`Max`, `uom`, `valueType`, `entryStyle`, `testPoint`, `replicateIndex`, `direction`.

DeviceType dengan 0 item **valid**. GET catalog mengembalikan `[]`.

---

## 5. PhysicalCheckResult

Natural key: `(calibrationJobId, devicePhysicalCheckItemId, attemptNumber)`.

| Field | Sumber |
|---|---|
| `companyId` | Server, dari scope job (bare String, no Company FK) |
| `attemptNumber` | Server, `job.currentAttempt` |
| `verdict` | Client: `BAIK` \| `TIDAK_BAIK` |
| `note` | Client, opsional (nullable) |
| `inspectionLimitSnapshot` | Server, copy `item.inspectionLimit` saat create |
| `recordedByUserId` / `recordedAt` | Server, di-stamp ulang pada PATCH |

Tidak ada replicate / direction / test point / tolerance / `isWithinTolerance`.

`GET` results menyertakan `devicePhysicalCheckItem` (id, code, name, inspectionLimit, sortOrder, isActive, deviceTypeId) agar UI membedakan item tanpa menghitung "Sesuai/Tidak sesuai".

---

## 6. API

Nested di `CalibrationJobsController` (`:id` = job), mengikuti gaya MeasurementResult.

| Method | Path | Permission |
|---|---|---|
| GET | `/calibration-jobs/:id/physical-check-items` | `calibrationJob:read` |
| GET | `/calibration-jobs/:id/physical-check-results` | `calibrationJob:read` |
| POST | `/calibration-jobs/:id/physical-check-results` | `recordPhysicalCheck` |
| POST | `/calibration-jobs/:id/physical-check-results/batch` | `recordPhysicalCheck` |
| PATCH | `/calibration-jobs/:id/physical-check-results/:resultId` | `recordPhysicalCheck` |
| DELETE | `/calibration-jobs/:id/physical-check-results/:resultId` | `recordPhysicalCheck` |

Batch: create-many (bukan replace-all), max 200, tidak menghapus baris yang tidak dikirim. Duplicate natural key → `PHYSICAL_CHECK_DUPLICATE_ENTRY` (rollback transaksi).

---

## 7. Validation

Zod (`packages/shared`): client hanya `devicePhysicalCheckItemId`, `verdict`, `note`. Field server-controlled **tidak** ada di schema (Zod strip unknown keys).

Service (lebih ketat dari MeasurementResult hari ini):

| Kondisi | Kode |
|---|---|
| Job tidak ada / beda company | `CALIBRATION_JOB_NOT_FOUND` |
| `startedAt` null | `CALIBRATION_JOB_NOT_STARTED` |
| DeviceType job tidak ter-resolve (write) | `PHYSICAL_CHECK_DEVICE_TYPE_UNRESOLVED` |
| Item DeviceType ≠ DeviceType job | `PHYSICAL_CHECK_DEVICE_TYPE_MISMATCH` |
| Item `isActive = false` (NEW write) | `PHYSICAL_CHECK_ITEM_INACTIVE` |
| Item tidak ada | `PHYSICAL_CHECK_ITEM_NOT_FOUND` |
| Verdict ilegal (controller) | `INVALID_PHYSICAL_CHECK_RESULT` |
| Duplicate natural key | `PHYSICAL_CHECK_DUPLICATE_ENTRY` |
| Attempt lama | `PHYSICAL_CHECK_ATTEMPT_SUPERSEDED` |
| SUBMITTED / `submittedAt` set | `PHYSICAL_CHECK_JOB_SUBMITTED` |
| Bukan `IN_PROGRESS` (PENDING / REWORK) | `PHYSICAL_CHECK_JOB_NOT_IN_PROGRESS` |

Resolusi DeviceType = `calibrationRequestItem.deviceTypeId` lalu fallback PO-item (konvensi `resolveJobDeviceTypeId`). Tidak mengarang DeviceType baru.

GET catalog: DeviceType unresolved atau 0 item → `[]` (bukan error schema).

PATCH current-attempt **tidak** menolak item yang kemudian di-nonaktifkan (hanya NEW write yang cek `isActive`). Snapshot tidak ditulis ulang.

---

## 8. Lifecycle / REWORK

Guard `assertPhysicalCheckRowEditable` meniru perilaku `assertMeasurementRowEditable`, **bukan** lock `JobReferenceEquipmentUsed`.

| Status | Write PhysicalCheckResult |
|---|---|
| PENDING | Ditolak |
| IN_PROGRESS + `startedAt` | Diizinkan (attempt berjalan) |
| SUBMITTED | Ditolak |
| REWORK | Ditolak (harus `resumeAfterRework` dulu) |
| ACCEPTED_BY_QA | Ditolak |

Attempt:

- `submitForReview` / `decideQualityReview` / `resumeAfterRework` **tidak** diubah
- REJECT menaikkan `currentAttempt` sekali (implementasi existing)
- RESUME: REWORK → IN_PROGRESS, attempt **tidak** naik
- Attempt 2 mulai kosong — tidak ada copy-forward
- Attempt 1 immutable (PATCH/DELETE → `PHYSICAL_CHECK_ATTEMPT_SUPERSEDED`)

`submitForReview` tetap tidak mengecek kelengkapan fisik (sengaja, sementara).

---

## 9. RBAC

Permission baru: `calibrationJob:recordPhysicalCheck`.

| Role | Write fisik | Read fisik | `recordMeasurement` |
|---|---|---|---|
| TECHNICIAN | granted | via `read` | granted (tidak diubah) |
| TECHNICIAN_MANAGER | **tidak** granted | via `read` | **tidak** granted (tidak diubah) |

Wiring:

1. `permissionCatalog.calibrationJob` + `"recordPhysicalCheck"`
2. Seed TECHNICIAN + revoke defensif MT (idempotent)
3. `backfill-physical-check-permissions.ts` + script `backfill:physical-check-permissions`
4. `MeCapabilities.calibrationJobRecordPhysicalCheck` + `GET /me`
5. Label Portal `ACTION_LABELS.recordPhysicalCheck = "Record Physical Check"`
6. `@RequirePermission("calibrationJob", "recordPhysicalCheck")` pada write

Tidak restore MT `recordMeasurement`.

---

## 10. Snapshot Semantics

Pada create/batch, server menyalin `DevicePhysicalCheckItem.inspectionLimit` → `inspectionLimitSnapshot`.

Jika master diedit setelah itu:

- GET historical / current result tetap menampilkan snapshot lama
- PATCH verdict/note **tidak** menulis ulang snapshot

Tidak ada recalculation, tidak ada tolerance engine.

---

## 11. Tests

File baru:

- `apps/api/src/modules/calibration-jobs/physical-check-results.service.test.ts` — 38 cases (catalog, create, validation, lifecycle, attempt/REWORK, batch, snapshot, submit-tanpa-completeness, controller, RBAC)
- `packages/shared/src/schemas/physical-check-result.test.ts` — 8 cases (verdict, note, strip server fields, batch, update refine)
- `permissions.service.test.ts` — SUPERADMIN catalog mencakup `recordPhysicalCheck`

Cakupan vs desain:

| ID | Isi | Status |
|---|---|---|
| A Catalog | DeviceType benar; 0 item → `[]`; unresolved → `[]` | PASS |
| B Create | IN_PROGRESS, BAIK, TIDAK_BAIK, note opsional, snapshot + attempt + company + user stamp | PASS |
| C Validation | wrong DeviceType, inactive, invalid verdict | PASS |
| D Lifecycle | PENDING / IN_PROGRESS / SUBMITTED / REWORK / ACCEPTED_BY_QA | PASS |
| E Attempt | REJECT +1, RESUME no +1, attempt 2 kosong, attempt 1 immutable | PASS |
| F Batch | valid, duplicate key rollback, mixed invalid, stamp server, no copy-forward, no delete-missing | PASS |
| G RBAC | Tech write, MT no write, MT read, `recordMeasurement` unchanged | PASS |
| H Snapshot | master berubah, snapshot lama tetap | PASS |
| I Regression | lihat §12 | PASS |

---

## 12. Regression Verification

Perintah dan hasil:

| Perintah | Hasil |
|---|---|
| `npx prisma validate` (packages/db, `DATABASE_URL` dari `.env`) | schema valid |
| `npx prisma generate` | Prisma Client generated |
| `pnpm --filter @medcal/db exec tsc --noEmit` | exit 0 |
| `pnpm --filter @medcal/shared typecheck` | exit 0 |
| `pnpm --filter @medcal/auth typecheck` | exit 0 |
| `pnpm --filter @medcal/api typecheck` | exit 0 |
| `pnpm --filter @medcal/shared test -- src/schemas/physical-check-result.test.ts` | 8 passed |
| `pnpm --filter @medcal/db run prepare-test-db` (via api pretest) | migrasi applied; 134 RolePermission; backfill physical-check upserted |
| `pnpm --filter @medcal/api test -- physical-check-results + measurement-results + calibration-jobs.service.test.ts` | **180 passed** (3 files) |
| `permissions.service.test.ts` (run sebelumnya dalam batch 4 file) | passed |
| `prisma migrate diff` test DB vs schema | empty |

Happy path + REWORK existing (`calibration-jobs.service.test.ts`) dan MeasurementResult (`measurement-results.service.test.ts`) tetap hijau. `submitForReview` / `decideQualityReview` / `resumeAfterRework` tidak dimodifikasi.

---

## 13. Files Changed

**Baru**

- `packages/db/prisma/migrations/20260910120000_add_physical_inspection/migration.sql`
- `packages/db/prisma/backfill-physical-check-permissions.ts`
- `apps/api/src/modules/calibration-jobs/physical-check-results.service.ts`
- `apps/api/src/modules/calibration-jobs/physical-check-results.service.test.ts`
- `packages/shared/src/schemas/physical-check-result.test.ts`
- `docs/claude/plans/technician-app/ui-tasks/PhysicalInspection_Backend_Implementation-report.md`

**Diubah**

- `packages/db/prisma/schema.prisma` — enum + dua model + relasi
- `packages/db/prisma/seed-role-permissions.ts`
- `packages/db/package.json` — script backfill
- `packages/db/scripts/prepare-test-db.mjs`
- `packages/auth/src/access-control.ts`
- `packages/auth/src/me-types.ts`
- `packages/shared/src/schemas/index.ts`
- `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts`
- `apps/api/src/modules/calibration-jobs/calibration-jobs.module.ts`
- `apps/api/src/modules/me/me.controller.ts`
- `apps/api/src/modules/permissions/permissions.service.test.ts`
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts` — argumen constructor ke-3
- `apps/api/src/modules/calibration-jobs/measurement-results.service.test.ts` — argumen constructor ke-3
- `apps/portal/src/app/management/permission-management/page.tsx` — label RBAC saja

Tidak ada perubahan Tech-PWA, QualityReview, Identity Correction, atau service MeasurementResult.

---

## 14. Deferred Items

Sengaja tidak dikerjakan (sesuai desain terkunci):

1. Seed master LK per DeviceType (keputusan 1–11 tetap; seed tidak diinventarisasi di task ini)
2. UI Tech-PWA / Portal untuk inspeksi fisik
3. Master-management UI `DevicePhysicalCheckItem`
4. Completeness gate pada `submitForReview`
5. Auto-REJECT / block APPROVE dari `TIDAK_BAIK`
6. Domain terpisah physical vs function
7. PATIENT_MONITOR / ELECTRIC_BEDS seed
8. Telaah "Kondisi Alat (10)"
9. Browser E2E
10. Perubahan QualityReview / Identity Correction / JobHandOff / Post-Approval Correction
11. PASS/FAIL CalibrationJob / final laik

---

## 15. Final Verdict

**PASS WITH NOTES**

Backend Physical Inspection memenuhi desain terkunci: domain terpisah, catalog per-DeviceType, snapshot `inspectionLimit`, natural key per attempt, write hanya `IN_PROGRESS`, no copy-forward, RBAC sendiri, tanpa tolerance engine dan tanpa submit gate.

Catatan:

1. Seed master LK tidak diimplementasikan (§24 — data kandidat tidak dijadikan seed di task ini; tes memakai fixture deterministik).
2. Satu baris label di Permission Management Portal diperlukan oleh arsitektur RBAC; bukan UI inspeksi fisik.
3. GET catalog mengembalikan `[]` jika DeviceType job tidak ter-resolve; write menolak dengan `PHYSICAL_CHECK_DEVICE_TYPE_UNRESOLVED`.
