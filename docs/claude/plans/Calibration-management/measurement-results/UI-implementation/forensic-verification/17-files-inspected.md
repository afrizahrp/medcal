# 17. Files Inspected

## 17.1 Prisma Schema & Seed/Backfill Scripts (read-only)

- `D:\medcal\packages\db\prisma\schema.prisma` (bagian model `DeviceType`, `DeviceTypeAlias`, `EquipmentType`, `Equipment`, `EquipmentCalibrationRecord`, `DeviceTypeEquipmentRequirement`, `DeviceModel`, `DeviceCapability`, `DeviceCapabilityItem`, `DeviceCalibrationParameter`, `DeviceTypeCapabilityOrder`, `DevicePhysicalCheckItem`, `Device`, `CalibrationRequest`, `CalibrationJob`, `KontrolAlat`, `KontrolAlatAccessory`, `KontrolAlatSignature`, `CalibrationTestPoint`, `MeasurementResult`, `PhysicalCheckResult`, `JobEvidence`, `JobReferenceEquipmentUsed`, `CustomerSignature`, `IdentityCorrection`, `IdentityCorrectionSignature`, `QualityReview`, `Certificate`, enum-enum terkait)
- `D:\medcal\packages\db\prisma\seed-device-capabilities.ts`
- `D:\medcal\packages\db\prisma\seed-device-calibration-parameters.ts`
- `D:\medcal\packages\db\prisma\seed-device-taxonomy-extension-parameters.ts`
- `D:\medcal\packages\db\prisma\seed-physical-check-items.ts`
- `D:\medcal\packages\db\prisma\seed-calibration-test-points.ts`
- `D:\medcal\packages\db\prisma\seed-device-type-equipment-requirements.ts` (nama file, tidak dibaca detail)
- `D:\medcal\packages\db\prisma\backfill-decimal-places-from-results.ts`
- `D:\medcal\packages\db\prisma\backfill-device-calibration-parameter-tolerances.ts`
- `D:\medcal\packages\db\prisma\backfill-calibration-ordering.ts` (nama file, tidak dibaca detail)

## 17.2 Modul `apps/api` (read-only)

- `apps/api/src/modules/device-capabilities/device-capabilities.service.ts`, `.controller.ts`, `.module.ts`
- `apps/api/src/modules/device-calibration-parameters/device-calibration-parameters.service.ts`, `.controller.ts`, `.service.test.ts`
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts`, `.controller.ts`, `.service.test.ts`
- `apps/api/src/modules/calibration-jobs/measurement-results.service.ts`
- `apps/api/src/modules/calibration-jobs/physical-check-results.service.ts`
- `apps/api/src/modules/calibration-jobs/job-reference-equipment.ts`
- `apps/api/src/modules/calibration-jobs/kontrol-alat.service.ts`, `kontrol-alat-pdf.ts`
- `apps/api/src/modules/calibration-jobs/identity-correction-pdf.ts`, `identity-correction-file-owner-policy.ts`
- `apps/api/src/modules/calibration-jobs/measurement-tolerance.ts`
- `apps/api/src/modules/work-orders/work-orders.service.ts` (fan-out logic)
- `apps/api/src/modules/equipment-calibration-records/*` (nama file, ringkasan via subagent)
- `packages/shared/src/utils/measured-value-decimal-places.ts`
- `packages/shared/src/schemas/index.ts` (bagian `deviceCapability*Schema`, `deviceCalibrationParameter*Schema`)

## 17.3 Modul `apps/portal` dan `apps/tech-pwa` (read-only, via subagent)

- `apps/portal/src/app/management/device-capabilities/*`
- `apps/portal/src/app/management/device-calibration-parameters/*`
- `apps/portal/src/app/management/calibration-jobs/[id]/page.tsx`, `use-measurement-results-query.ts`
- `apps/tech-pwa/src/lib/calibration/measurement.ts`
- `apps/tech-pwa/src/app/jobs/[id]/measurements/*`
- `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx`, `page.tsx`

## 17.4 Dokumentasi Internal Terkait (read-only)

- `docs/module-specs/measurement-results/calibration-results-cross-check.md` — audit internal 2026-09-08, sumber password `1004` dan banyak temuan cross-check yang dikonfirmasi ulang di audit ini
- `docs/module-specs/measurement-results/calibration-results-five-steps-implementation-report.md` (nama file, tidak dibaca detail)

## 17.5 File LK Template DOCX (read-only, dari Task 1 sebelumnya, di-cross-reference ulang)

- `docs/technician-docs/Lembar-Kerja/LK Bed Side Monitor.docx` (dump ulang teks lengkap di audit ini)
- `docs/technician-docs/Lembar-Kerja/LK Baby Incubator.docx` (dump dari Task 1)

## 17.6 File Excel Golden Example (read-only, dibuka dengan password terdokumentasi)

- `docs/technician-docs/measurement-results/Bed Side Monitor.xlsx` (sheet `Input Data`, password `1004`)
- `docs/technician-docs/measurement-results/Baby Incubator.xlsx` (sheet `Input Data`, password `1004`)

## 17.7 File yang DICARI tapi TIDAK DITEMUKAN

- `D:\medcal\results.xlsx` — tidak ada di path manapun di repo (dikonfirmasi via glob rekursif `**/results.xlsx` dari root `D:\medcal`)
