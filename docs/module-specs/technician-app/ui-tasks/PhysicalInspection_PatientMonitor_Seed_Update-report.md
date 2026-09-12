# Physical Inspection — PATIENT_MONITOR Seed Update Report

**Date:** 2026-09-11  
**Mode:** IMPLEMENTATION (seed source + focused tests only)  
**Database mutation:** NONE (seed not executed)

---

## 1. Existing BSM DeviceType code

`BED_SIDE_MONITOR` (name: "Bed Side Monitor") — from `packages/db/prisma/seed-device-types.ts`.

Not `BSM`. Calibration parameter codes use a `BSM_` prefix, but the DeviceType code is `BED_SIDE_MONITOR`.

## 2. Existing PATIENT_MONITOR DeviceType code

`PATIENT_MONITOR` (name: "Patient Monitor") — already present in `seed-device-types.ts`.

Prior state in Physical Inspection seed: intentional zero (`PHYSICAL_CHECK_INTENTIONAL_ZERO_DEVICE_TYPE_CODES`).

## 3. Existing BSM item count

**BSM item count: 5**

| # | code | name | sortOrder |
|---|------|------|-----------|
| 1 | `BED_SIDE_MONITOR_PHYSICAL_001` | Badan / Permukaan | 10 |
| 2 | `BED_SIDE_MONITOR_PHYSICAL_002` | Kotak kontak alat | 20 |
| 3 | `BED_SIDE_MONITOR_PHYSICAL_003` | Kabel catu utama | 30 |
| 4 | `BED_SIDE_MONITOR_PHYSICAL_004` | Tombol, Saklar dan pengaman | 40 |
| 5 | `BED_SIDE_MONITOR_PHYSICAL_005` | Tampilan dan indikator | 50 |

`isActive` is not a seed-row field; upsert always sets `isActive: true` (unchanged for BSM and PM).

## 4. PATIENT_MONITOR item count

**PATIENT_MONITOR proposed / final item count: 5**

Baseline was 246 → **251** (= 246 + 5).  
DeviceTypes with items: 44 → **45**.

## 5. Exact BSM → PATIENT_MONITOR mapping

| BED_SIDE_MONITOR code | PATIENT_MONITOR code | name | inspectionLimit | sortOrder | isActive |
|-----------------------|----------------------|------|-----------------|-----------|----------|
| `BED_SIDE_MONITOR_PHYSICAL_001` | `PATIENT_MONITOR_PHYSICAL_001` | Badan / Permukaan | *(identical)* | 10 | true |
| `BED_SIDE_MONITOR_PHYSICAL_002` | `PATIENT_MONITOR_PHYSICAL_002` | Kotak kontak alat | *(identical)* | 20 | true |
| `BED_SIDE_MONITOR_PHYSICAL_003` | `PATIENT_MONITOR_PHYSICAL_003` | Kabel catu utama | *(identical)* | 30 | true |
| `BED_SIDE_MONITOR_PHYSICAL_004` | `PATIENT_MONITOR_PHYSICAL_004` | Tombol, Saklar dan pengaman | *(identical)* | 40 | true |
| `BED_SIDE_MONITOR_PHYSICAL_005` | `PATIENT_MONITOR_PHYSICAL_005` | Tampilan dan indikator | *(identical)* | 50 | true |

## 6. Codes generated for PATIENT_MONITOR

Convention used (repo actual): `<DEVICE_TYPE_CODE>_PHYSICAL_NNN` with zero-padded 3-digit sequence starting at `001`.

- `PATIENT_MONITOR_PHYSICAL_001`
- `PATIENT_MONITOR_PHYSICAL_002`
- `PATIENT_MONITOR_PHYSICAL_003`
- `PATIENT_MONITOR_PHYSICAL_004`
- `PATIENT_MONITOR_PHYSICAL_005`

BSM codes were **not** reused.

## 7. Names preserved

Yes — exact string copy from BED_SIDE_MONITOR (no normalize / translate / wording fix).

## 8. inspectionLimit preserved

Yes — exact string copy from BED_SIDE_MONITOR.

## 9. sortOrder preserved

Yes — 10, 20, 30, 40, 50 (same relative order).

## 10. isActive preserved

Yes — upsert `create`/`update` still sets `isActive: true` for all seeded rows (same as BSM).

## 11. Idempotency behavior

Unchanged: upsert on `@@unique([deviceTypeId, code])` via `deviceTypeId_code`.

- First run: creates 5 PATIENT_MONITOR rows (when seed is later executed).
- Second run: updates same rows; no duplicates.

## 12. Tests

Updated `packages/db/src/testing/seed-physical-check-items.test.ts`:

- Baseline 251 / 45
- ELECTRIC_BEDS remains 0
- PATIENT_MONITOR present with 5 items
- Parity assertion: same name / inspectionLimit / sortOrder as BED_SIDE_MONITOR; different DeviceType + codes
- BED_SIDE_MONITOR checklist snapshot unchanged
- Dry-run only (no DB upsert)

Also updated read-only verifier expectations in `verify-physical-check-items-seed.ts` (still not executed against DB in this task).

## 13. Database mutation status

**NONE.** Seed script was not run. No Prisma migrate. No prod/dev DB writes.

## 14. Files changed

| File | Change |
|------|--------|
| `packages/db/prisma/seed-physical-check-items.ts` | +5 PATIENT_MONITOR rows; counts 251/45; remove PM from intentional zeros; dry-run log |
| `packages/db/prisma/verify-physical-check-items-seed.ts` | ELECTRIC_BEDS=0 only; PM expected = BSM count |
| `packages/db/src/testing/seed-physical-check-items.test.ts` | counts + BSM↔PM parity tests |
| `docs/claude/plans/technician-app/ui-tasks/PhysicalInspection_PatientMonitor_Seed_Update-report.md` | this report |

## 15. Any deviation

- Spec example used `BSM_PHYSICAL_010` / sort steps of 10 with codes like `_010`; repo convention is `BED_SIDE_MONITOR_PHYSICAL_001` and `sortOrder` 10/20/… — followed **repository** convention.
- Spec example DeviceType label “BSM” maps to actual code `BED_SIDE_MONITOR`.
- PATIENT_MONITOR removed from intentional-zero list (required by business lock). ELECTRIC_BEDS still intentional zero.
- Comment in seed notes PATIENT_MONITOR is copied from BED_SIDE_MONITOR; wording of checklist items themselves untouched.

---

## FINAL VERDICT

**PASS**
