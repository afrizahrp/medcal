# Physical Inspection — Tech-PWA UI Implementation Report

**Tanggal:** 2026-09-10  
**Mode:** IMPLEMENTATION (Tech-PWA only)  
**Audit kontrak:** [PhysicalInspection_TechPWA_UI_Insertion_Audit.md](./PhysicalInspection_TechPWA_UI_Insertion_Audit.md)  
**Scope:** UI Tech-PWA end-to-end untuk Physical Inspection. Backend/schema/lifecycle/permission **tidak diubah**.

---

## 1. STATUS

**PASS WITH NOTES**

Physical Inspection UI Tech-PWA sudah diimplementasi sesuai audit:

- `PhysicalCheckSection` di Job Detail antara Alat Referensi dan Hasil Pengukuran
- Route flat `/jobs/[id]/physical-check`
- Catalog + results dari backend; filter `attemptNumber === job.currentAttempt`
- Verdict `BAIK` / `TIDAK_BAIK` + note opsional
- Save: batch POST (baru) + PATCH (ubah); StickyActionBar `Simpan`
- Lock mirror Measurement (`IN_PROGRESS` saja; REWORK visible+locked; Resume → editable blank)
- Permission `calibrationJobRecordPhysicalCheck`
- Unit tests / typecheck / build PASS
- Tidak ada perubahan backend / domain MeasurementResult / capabilityGroups
- Tidak ada completeness gate / PASS-FAIL job / auto-REWORK

**Catatan:** Verifikasi browser E2E **tidak dijalankan** di sesi ini (tidak ada sesi login Tech-PWA yang siap dipakai). Checklist manual ada di bagian N.

---

## A. Files created / changed

### Created

| File | Peran |
|---|---|
| `apps/tech-pwa/src/lib/calibration/physical-check.ts` | Types + lock helpers + status/chip + save-plan |
| `apps/tech-pwa/src/lib/calibration/physical-check.test.ts` | Unit tests kontrak UI |
| `apps/tech-pwa/src/app/jobs/[id]/physical-check/page.tsx` | Entry page flat |
| `apps/tech-pwa/src/app/jobs/[id]/physical-check/physical-check-ui.tsx` | Card item + status row |
| `apps/tech-pwa/src/app/jobs/[id]/physical-check/use-physical-check-query.ts` | React Query hooks |
| `docs/claude/plans/technician-app/ui-tasks/PhysicalInspection_TechPWA_UI_Implementation-report.md` | Laporan ini |

### Changed

| File | Perubahan |
|---|---|
| `apps/tech-pwa/src/app/jobs/[id]/page.tsx` | Wire `PhysicalCheckSection` + queries |
| `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx` | Tambah `PhysicalCheckSection` |
| `apps/tech-pwa/src/lib/api-errors.ts` | Pesan error code Physical Inspection |

### Not changed (disengaja)

- Prisma / migrations / seed PhysicalCheckItem
- API Physical Inspection / lifecycle / QualityReview / permissions
- Measurement UI / `capabilityGroups` / Identity Correction / JobHandOff
- Portal Physical Inspection

---

## B. Existing patterns reused

| Pola | Sumber |
|---|---|
| Section summary + dedicated route | `ReferenceEquipmentSection`, `MeasurementsSection` |
| Lock / REWORK visibility | `measurement.ts` (`canRecord*`, `*LockedReason`, `shouldShow*Section`) |
| Query key `["job", id, …]` + invalidate | `use-measurements-query.ts` |
| Draft lokal + Simpan StickyActionBar | measurement parameter entry |
| Radio + textarea | Identity Correction / escalate note (`maxLength={2000}`) |
| Loading / Error / Empty | `LoadingState`, `ErrorState`, `EmptyState`, `ErrorBanner` |
| Permission gate “Aksi tidak tersedia.” | reference-equipment / measurements pages |

**Tidak di-reuse sebagai domain:** `PassFailChip` (“Sesuai/Tidak sesuai”), `capabilityGroups`, `canRecordReferenceEquipment` (lock REWORK berbeda).

---

## C. Job Detail insertion point

Urutan render:

1. … ApprovalStatusSection  
2. **ReferenceEquipmentSection** (`Alat Referensi Digunakan`)  
3. **PhysicalCheckSection** (`Pemeriksaan Fisik`) ← NEW  
4. **MeasurementsSection** (`Hasil Pengukuran`)  
5. CorrectionsListSection  

---

## D. Route implemented

`/jobs/[id]/physical-check` → `apps/tech-pwa/src/app/jobs/[id]/physical-check/page.tsx`

Tidak ada nested `/physical-check/[itemId]` (v1 flat list).

Build Next.js mengonfirmasi route:

`ƒ /jobs/[id]/physical-check`

---

## E. API endpoints consumed

| Method | Path | Penggunaan |
|---|---|---|
| GET | `/calibration-jobs/:id/physical-check-items` | Catalog (urutan API) |
| GET | `/calibration-jobs/:id/physical-check-results` | Semua attempt; UI filter current |
| POST | `/calibration-jobs/:id/physical-check-results/batch` | Create baris baru |
| PATCH | `/calibration-jobs/:id/physical-check-results/:resultId` | Update verdict/note |

DELETE **tidak** diekspos di UI v1.

---

## F. UI structure

### Job Detail — `PhysicalCheckSection`

- Judul: `Pemeriksaan Fisik`
- Ringkasan chip `n/total` / `Selesai` / `Ada TIDAK BAIK` (bukan PASS/FAIL job)
- Per item: chip `BAIK` / `TIDAK BAIK` / `Belum`
- Link `Catat Pemeriksaan Fisik` saat editable
- Locked reason saat REWORK / SUBMITTED / belum mulai
- Empty copy bila catalog 0 item

### Entry page

Mobile-first vertical cards:

- Parameter (`name`)
- Batas Pemeriksaan (`inspectionLimit` dari catalog/master — bukan snapshot)
- Radio-style **BAIK** / **TIDAK BAIK**
- Textarea catatan opsional (max 2000)
- StickyActionBar: **Simpan** (hanya menyimpan PI; tidak submit job)

---

## G. Lifecycle / REWORK behavior

| Status | Section | Editable |
|---|---|---|
| PENDING | biasanya tidak (mirror measurement) | Tidak |
| IN_PROGRESS (+ startedAt) | Ya | Ya |
| SUBMITTED | Ya jika ada rows current attempt | Tidak |
| REWORK | Ya (tetap tampil walau attempt baru kosong) | Tidak |
| IN_PROGRESS setelah Resume | Ya | Ya (attempt blank) |
| ACCEPTED_BY_QA | Ya jika ada rows | Tidak |

Helpers: `canRecordPhysicalCheck`, `physicalCheckLockedReason`, `shouldShowPhysicalCheckSection`.

---

## H. Permission behavior

- Write UI / entry gated by `capabilities.calibrationJobRecordPhysicalCheck`
- Tanpa capability → “Aksi tidak tersedia.” + Kembali
- MT (tanpa recordPhysicalCheck) tidak mendapat kontrol tulis di Tech-PWA
- Tidak ada permission baru

---

## I. Attempt handling

- Source of truth: `job.currentAttempt` dari backend
- Display/edit: `filterCurrentAttemptResults(results, job.currentAttempt)`
- Tidak copy-forward attempt lama ke draft/save plan
- Attempt number tidak dibuat di frontend

---

## J. Save strategy

1. Load catalog + results  
2. Filter current attempt  
3. Draft lokal (`verdict` + `note`)  
4. `buildPhysicalCheckSavePlan` → creates + updates  
5. Batch POST lalu PATCH berurutan  
6. Invalidate `["job", id]` / refetch results  
7. Tombol disabled saat `saving` atau tidak ada perubahan  

Note opsional untuk BAIK dan TIDAK_BAIK; tidak ada rule “TIDAK_BAIK wajib alasan”.

---

## K. Tests executed + results

```
pnpm --filter @medcal/tech-pwa test
→ Test Files  4 passed (4)
→ Tests       55 passed (55)
```

Unit tests `physical-check.test.ts` mencakup:

- Catalog/status ordering semantics  
- Current vs old attempt filtering  
- BAIK / TIDAK_BAIK chips  
- Note optional  
- Batch create vs PATCH plan  
- Empty save plan (no duplicate write)  
- IN_PROGRESS editable; SUBMITTED / REWORK / ACCEPTED_BY_QA locked  
- Resume → editable  
- No copy-forward ke attempt baru  
- Zero-item catalog  

Tech-PWA tidak punya React Testing Library; kontrak UI diuji via helpers murni (sama konvensi measurement).

---

## L. Typecheck result

```
pnpm --filter @medcal/tech-pwa typecheck
→ tsc --noEmit  (exit 0)
```

---

## M. Build result

```
pnpm --filter @medcal/tech-pwa build
→ Compiled successfully
→ Route ƒ /jobs/[id]/physical-check hadir
→ exit 0
```

---

## N. Browser verification

**Tidak dijalankan** di sesi implementasi ini.

Checklist manual yang disarankan:

1. Buka Job dengan catalog Physical Inspection  
2. Job Detail: Alat Referensi → Pemeriksaan Fisik → Hasil Pengukuran  
3. Buka `/physical-check`  
4. Catalog ter-render sesuai urutan API  
5. Pilih BAIK / TIDAK BAIK + note opsional  
6. Simpan → reload → nilai persist  
7. Ringkasan Job Detail update  
8. SUBMITTED / REWORK terkunci  
9. Resume → attempt baru blank → isi & simpan tanpa copy-forward  

---

## O. Deviations from specification

1. **Empty catalog vs DeviceType unresolved:** API catalog mengembalikan `[]` untuk keduanya. UI memakai satu `EmptyState` (“Tidak ada item pemeriksaan fisik…”) tanpa membedakan unresolved — tidak mengubah backend.  
2. **Per-item chip labels:** selain ringkasan `n/total`, tiap baris Job Detail menampilkan `BAIK` / `TIDAK BAIK` / `Belum` (masih dalam semantik PI, bukan Sesuai/PASS).  
3. **Component tests React:** tidak ditambah (repo Tech-PWA hanya unit-test helpers); perilaku save/lock/attempt di-cover helper tests.

Tidak ada deviation domain / business rule.

---

## P. Remaining issues

- Browser E2E belum dijalankan  
- Portal Physical Inspection di luar scope  
- Historical previous-attempt display di entry page tidak ditampilkan sebagai data aktif (by design: current attempt only; tidak ada UI history viewer di v1)

---

## Success criteria checklist

| Kriteria | Status |
|---|---|
| PhysicalCheckSection posisi benar | PASS |
| Route `/physical-check` | PASS |
| Catalog dari backend | PASS |
| Current attempt filter | PASS |
| BAIK / TIDAK_BAIK + note opsional | PASS |
| Batch POST + PATCH | PASS |
| Simpan + invalidate | PASS |
| Lifecycle / REWORK / Resume / no copy-forward | PASS (unit) |
| Permission | PASS |
| Zero-item EmptyState | PASS |
| No completeness gate / PASS-FAIL / Measurement integration | PASS |
| No backend changes | PASS |
| Tests / typecheck / build | PASS |
| No DB mutation by this task | PASS |
| Browser E2E | NOT RUN |

**Final verdict: PASS WITH NOTES** (browser E2E pending)
