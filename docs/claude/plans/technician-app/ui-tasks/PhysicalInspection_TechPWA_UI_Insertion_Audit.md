# Physical Inspection — Tech-PWA UI Insertion Point & Existing Pattern Audit

**Tanggal:** 2026-09-10  
**Mode:** READ-ONLY / AUDIT ONLY — tidak ada perubahan aplikasi, schema, API, seed, atau routing  
**Scope:** Menentukan titik sisip UI Tech-PWA dan pola existing untuk implementasi Physical Inspection di masa depan  
**Lokasi konvensi:** `docs/claude/plans/technician-app/ui-tasks/`

**Input terkait:**

- Backend Physical Inspection sudah lengkap (catalog + CRUD + batch + RBAC + lifecycle)
- Domain boundary terkunci: `DevicePhysicalCheckItem` → `PhysicalCheckResult` (bukan MeasurementResult)
- Dokumen pendahulu: `PhysicalInspection_Final_Design_Lock_Audit.md`, `PhysicalInspection_Backend_Implementation-report.md`, `PhysicalInspection_Design_Compatibility_Audit.md`

---

## 1. Executive Summary

Tech-PWA Job Detail sudah memakai pola **section ringkas di `/jobs/[id]` + halaman entry terpisah**. Alat Acuan (`ReferenceEquipmentSection` → `/reference-equipment`) dan Hasil Pengukuran (`MeasurementsSection` → `/measurements`) mengikuti pola itu. Physical Inspection harus mengikuti pola yang sama, **bukan** digabung ke `capabilityGroups` / measurements.

**Titik sisip:** section baru di Job Detail **antara** `ReferenceEquipmentSection` dan `MeasurementsSection`, dengan route entry `/jobs/[id]/physical-check`.

Backend, permission `calibrationJobRecordPhysicalCheck`, dan schema Zod sudah ada. Di Tech-PWA **belum ada** types/hooks/UI Physical Inspection (grep = 0 hit).

**Final Verdict: READY FOR IMPLEMENTATION**

---

## 2. Current Tech-PWA Job Detail Structure

| Lapisan | File | Peran |
|---|---|---|
| Route | `apps/tech-pwa/src/app/jobs/[id]/page.tsx` | Job Detail page |
| Section UI | `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx` | Section components |
| Layout shell | `Screen` + `StickyActionBar` | Header / footer sticky |
| Auth gate | `apps/tech-pwa/src/app/jobs/layout.tsx` | Session only |

**Urutan render di Job Detail hari ini:**

1. `JobHeaderBlock` (+ status / REWORK feedback)
2. `DeclaredIdentitySection`
3. `ObservedIdentitySection`
4. `AssignedDeviceSection`
5. `ApprovalStatusSection`
6. **`ReferenceEquipmentSection`** → link `/jobs/{id}/reference-equipment`
7. **`MeasurementsSection`** → link `/jobs/{id}/measurements`
8. `CorrectionsListSection`

**StickyActionBar** (footer Job Detail): Mulai Kalibrasi, Lanjutkan perbaikan, Kirim, Selesai, Eskalasi, Koreksi Identitas — **bukan** entry pengukuran/fisik.

**Sub-routes terkait:**

| Fitur | Route |
|---|---|
| Alat Acuan | `/jobs/[id]/reference-equipment` |
| Hasil Pengukuran list | `/jobs/[id]/measurements` |
| Entry per parameter | `/jobs/[id]/measurements/[parameterId]` |
| Identity Correction | `/jobs/[id]/identity-correction/...` |

**Hooks / data loaders Job Detail:**

- `useJobQuery(id, { poll: true })` — job + `currentAttempt` + status
- `useReferenceEquipmentUsed(id)`
- `useMeasurementParameters(id)` / `useMeasurementResults(id)`
- `useCorrectionsQuery(id, { poll: true })`
- Mutations: start / submit / resume / complete

**Types:** `TechCalibrationJob` di `apps/tech-pwa/src/lib/calibration/types.ts` (termasuk `currentAttempt`).

---

## 3. Exact Insertion Point

### A. Parent yang menampung section baru

`JobDetailPage` di `apps/tech-pwa/src/app/jobs/[id]/page.tsx`, dengan section component baru di `job-detail-ui.tsx` (sejajar `ReferenceEquipmentSection` / `MeasurementsSection`).

### B. Posisi relatif

**Antara Alat Referensi dan Hasil Pengukuran:**

```
Alat Referensi Digunakan
→ Pemeriksaan Fisik          ← NEW
→ Hasil Pengukuran
```

Sesuai boundary domain terkunci dan urutan yang diinginkan:

```
Calibration Job
├── Alat Acuan
├── Pemeriksaan Fisik
└── Hasil Pengukuran
```

### C. Pola visual yang di-reuse

Mirror **`ReferenceEquipmentSection` + `MeasurementsSection`**:

- `Section` title
- ringkasan status (chip `n/total` / BAIK–TIDAK_BAIK)
- link “Catat …” saat editable
- teks locked reason saat REWORK / SUBMITTED

### D. Komponen dedicated?

**Ya, perlu komponen baru.** Jangan reuse `MeasurementsSection` / `capabilityGroups` / `PassFailChip` (“Sesuai/Tidak sesuai”).

Usulan struktur masa depan (belum diimplementasi):

- `PhysicalCheckSection` di `job-detail-ui.tsx`
- `physical-check/page.tsx` + `physical-check-ui.tsx`
- `use-physical-check-query.ts`
- `lib/calibration/physical-check.ts` (types + lock helpers)

### Jawaban ringkas audit (A–D)

| # | Jawaban |
|---|---|
| A | `page.tsx` Job Detail + section baru di `job-detail-ui.tsx` |
| B | Antara Alat Referensi dan Hasil Pengukuran |
| C | Ya — pola section + link entry seperti Alat Acuan / Hasil Pengukuran |
| D | Ya — komponen dedicated; jangan masuk measurements |

---

## 4. Existing UI Patterns Inspected

| Area | Temuan | Relevansi Physical Inspection |
|---|---|---|
| **A. Hasil Pengukuran** | List card → nested entry; batch create + PATCH; filter `attemptNumber === currentAttempt`; lock = Measurement (`IN_PROGRESS` only; REWORK locked) | **Analog lifecycle & write** terdekat |
| **B. Alat Acuan** | Section + route; card list + checkbox; full-set PUT; lock beda (REWORK masih bisa tulis) | **Analog section/route**; **jangan** tiru lock/write |
| **C. Identity Correction** | Wizard multi-step; radio device; textarea | Radio / textarea reusable |
| **D. Verdict controls** | `PassFailChip` = Sesuai/Tidak sesuai dari `isWithinTolerance` | **Jangan reuse label/semantik**; reuse **gaya chip** saja |
| **E. Notes** | Measurement `note` **tidak** di UI; textarea di escalate / ref-equip override / signature | Note PI → pola textarea escalate (`maxLength={2000}`) |
| **F. Locked/read-only** | Banner amber + disable StickyActionBar save | Mirror measurement |
| **G. REWORK → Resume** | Section visible+locked; CTA “Lanjutkan perbaikan” di Job Detail footer | Mirror `shouldShowMeasurementSection` / `measurementLockedReason` |
| **H. Loading/error/empty** | `LoadingState` / `ErrorState` / `EmptyState` / “Aksi tidak tersedia.” | Mirror apa adanya |

---

## 5. Recommended Component Reuse

| Komponen | Path |
|---|---|
| `Screen` | `components/layout/screen.tsx` |
| `StickyActionBar` | `components/layout/sticky-action-bar.tsx` |
| `Section`, `SectionRow` | `components/ui/section.tsx` |
| `Button`, `LinkButton` | `components/ui/button.tsx` |
| `Badge` | `components/ui/badge.tsx` |
| `LoadingState`, `ErrorState`, `EmptyState` | `components/ui/state-views.tsx` |
| `ErrorBanner` | `components/feedback/error-banner.tsx` |
| `JobHeaderBlock` | `job-detail-ui.tsx` |
| `useJobQuery`, `useSubmitForReview`, `useResumeAfterRework` | `use-job-query.ts` |
| `useAuthz` → `capabilities.calibrationJobRecordPhysicalCheck` | `@medcal/auth/client` |
| `formatApiError` | `lib/api-errors.ts` |
| Zod types | `@medcal/shared` (`physicalCheckResult*Schema`, `PHYSICAL_CHECK_VERDICT_VALUES`) |

**Jangan reuse sebagai domain:**

- `MeasurementsSection` / `capabilityGroups`
- `PassFailChip` label Sesuai/Tidak sesuai
- `canRecordReferenceEquipment` (lock REWORK berbeda)
- `calibrationJobRecordMeasurement`

---

## 6. Recommended Route

| Layer | Route | Alasan |
|---|---|---|
| Summary | tetap di `/jobs/[id]` | Sama alat acuan & pengukuran |
| Entry | **`/jobs/[id]/physical-check`** | Satu flat list catalog (bukan nested per-item seperti measurements) |

Tidak perlu `/physical-check/[itemId]` untuk v1: item per DeviceType biasanya sedikit; entry di satu halaman seperti reference-equipment lebih konsisten.

**Temuan routing:**

- Alat Acuan **punya** route sendiri
- Hasil Pengukuran **punya** route sendiri (+ nested parameter)
- Job Detail **bukan** tab; memakai **section inline + subroute**
- Physical Inspection harus mengikuti pola section + subroute yang sama

---

## 7. Data Fetching Pattern

- Job ID: `useParams<{ id: string }>()`
- Library: **TanStack React Query** + `apiFetch`
- Key convention: `["job", id, …]` agar invalidasi `["job", id]` ikut sweep
- Job detail: `useJobQuery(id, { poll: true })` → `status`, `currentAttempt`, `startedAt`
- Capability: `capabilities?.calibrationJobRecordPhysicalCheck`
- Closest twin: `apps/tech-pwa/src/app/jobs/[id]/measurements/use-measurements-query.ts`

**Query yang perlu ditambah (konseptual):**

```
GET /calibration-jobs/:id/physical-check-items   → catalog (active items for job DeviceType)
GET /calibration-jobs/:id/physical-check-results → semua attempt; UI filter currentAttempt
```

GET catalog/results memakai `calibrationJob:read` (MT boleh baca).

Tidak ada polling khusus untuk entry measurement; job detail sudah poll job. Physical Inspection boleh sama (no poll pada items/results).

---

## 8. Data Mutation Pattern

Mirror **Hasil Pengukuran**, bukan Alat Acuan:

| Operasi | Endpoint | Kapan |
|---|---|---|
| Create banyak | `POST .../physical-check-results/batch` | baris baru (belum ada result) |
| Update | `PATCH .../physical-check-results/:resultId` | ubah `verdict` / `note` |
| Create satu | `POST .../physical-check-results` | opsional; batch cukup |
| Delete | `DELETE ...` | **tidak dipakai di UI ukur**; v1 boleh diabaikan |

Alur UI yang direkomendasikan:

1. Draft lokal di entry page
2. Tombol Simpan di `StickyActionBar`
3. `POST .../batch` untuk item baru
4. `PATCH` per result yang berubah
5. Invalidate `["job", id]` / refetch results

Natural key backend: `(calibrationJobId, devicePhysicalCheckItemId, attemptNumber)` — duplikat → `PHYSICAL_CHECK_DUPLICATE_ENTRY`.

Body create (Zod shared):

- `devicePhysicalCheckItemId`
- `verdict`: `BAIK` \| `TIDAK_BAIK`
- `note?` nullable max 2000

Body update: minimal satu dari `verdict` / `note`.

---

## 9. UI State Matrix

| Job status | Section visible? | Entry editable? | Catatan UI existing |
|---|---|---|---|
| PENDING | opsional / locked | Tidak | “Job belum dimulai…” |
| IN_PROGRESS | Ya (capability) | Ya | Entry terbuka |
| SUBMITTED | Ya jika capability / ada rows | Tidak | “Job sudah dikirim…” |
| REWORK | Ya (locked) | Tidak | “Lanjutkan perbaikan” di Job Detail footer |
| IN_PROGRESS setelah RESUME | Ya | Ya | `currentAttempt` sama; tanpa copy-forward |
| ACCEPTED_BY_QA | Ya jika rows/capability | Tidak | Terminal lock |

| UI state | Pola existing |
|---|---|
| Loading | `LoadingState` |
| API error | `ErrorState` + retry |
| Empty catalog (0 items) | `EmptyState` seperti pengukuran |
| DeviceType unresolved | catalog API → `[]`; pesan analog “jenis alat belum ditentukan” |
| Missing results | chip `n/total` / “belum diisi” — **bukan** submit gate |
| Permission denied | “Aksi tidak tersedia.” + Kembali |

**Tidak** menambah completeness gate ke Kirim (`canSubmitForReview` tetap status-only).

Helpers yang harus di-mirror dari `measurement.ts` (bukan reference-equipment):

- `canRecordPhysicalCheck(job)` → `status === "IN_PROGRESS" && startedAt !== null`
- `physicalCheckLockedReason(job)` — termasuk pesan REWORK
- `shouldShowPhysicalCheckSection(...)` — tetap tampil di REWORK meski attempt baru kosong

---

## 10. API ↔ UI Field Mapping

### DevicePhysicalCheckItem (catalog)

| Field | UI |
|---|---|
| `id` | internal key / POST body |
| `code` | internal / debug |
| `name` | **displayed** (Parameter) |
| `inspectionLimit` | **displayed** (Batas Pemeriksaan) — sumber utama UI |
| `sortOrder` | order list |
| `isActive` | catalog GET already `isActive: true` |

### PhysicalCheckResult

| Field | UI |
|---|---|
| `id` | PATCH/DELETE key |
| `devicePhysicalCheckItemId` | join ke catalog |
| `attemptNumber` | filter `=== job.currentAttempt` |
| `verdict` | **editable** BAIK / TIDAK_BAIK |
| `note` | **editable**, opsional (max 2000) |
| `inspectionLimitSnapshot` | **internal / read-only historical**; **jangan** gantikan master `inspectionLimit` di UI awal |
| `recordedByUserId` | internal / opsional meta |
| `recordedAt` | internal / opsional meta |
| nested `devicePhysicalCheckItem` | convenience dari API include |

---

## 11. Responsive Layout Findings

- Tech-PWA mobile-first: `min-h-11`, card list, `StickyActionBar` + `pb-safe-b`
- **Table** hanya di measurement grid (`overflow-x-auto`) — cocok untuk kolom banyak, **bukan** checklist 2 pilihan
- Nama panjang / batas panjang: pola card (`truncate` / wrap) seperti `MeasurementParameterListRow`
- Sticky footer sudah ada di entry pages (reference-equipment, measurement parameter)

**Rekomendasi struktur entry (berdasarkan pola existing, bukan preferensi bebas):**

- **Vertical card/list** (bukan tabel desktop No \| Parameter \| Batas \| Kondisi sebagai layout primer)
- Per item: `name`, `inspectionLimit`, kontrol BAIK / TIDAK_BAIK (radio atau dua tombol setara radio), textarea `note` opsional
- Summary Job Detail: list ringkas + chip status (mirror `MeasurementStatusRow`)

Tabel konseptual di desain LK tetap valid sebagai **model data**, tetapi implementasi visual harus mengikuti card/list mobile Tech-PWA.

---

## 12. Permission Findings

| Capability | Peran | UI |
|---|---|---|
| `calibrationJobRecordPhysicalCheck` | TECHNICIAN write | gate entry + mutations |
| `calibrationJob:read` | termasuk MT | GET items/results |
| MT | read-only | tidak boleh write Physical Inspection |

Sudah ada di:

- `packages/auth/src/access-control.ts` (`recordPhysicalCheck`)
- `packages/auth/src/me-types.ts` (`calibrationJobRecordPhysicalCheck`)
- seed / backfill role permissions

Tech-PWA **belum** membaca flag ini di mana pun.

Controller backend:

- GET items/results → `calibrationJob:read`
- POST/PATCH/DELETE → `calibrationJob:recordPhysicalCheck`

---

## 13. Business Rules That MUST NOT Be Added

- PASS/FAIL equipment result
- Automatic job failure
- Automatic REWORK karena TIDAK_BAIK
- Approval blocking karena TIDAK_BAIK
- Completeness gate (fisik wajib sebelum Kirim)
- Final laik determination
- Telaah integration
- Electrical 5-tier assessment
- JobHandOff
- Post-approval correction
- New lifecycle status
- New permission
- New backend endpoint
- Copy-forward between attempts
- DeviceCalibrationParameter integration
- MeasurementResult integration
- capabilityGroups integration

Physical Inspection saat ini berarti:

`PhysicalCheckResult` → `verdict` BAIK / TIDAK_BAIK → optional `note`

Tidak lebih.

---

## 14. Proposed Future Implementation Structure

```
Job Detail (/jobs/[id])
  ReferenceEquipmentSection
  PhysicalCheckSection          ← NEW summary
  MeasurementsSection

/jobs/[id]/physical-check      ← NEW entry page
  JobHeaderBlock
  amber lock banner (jika locked)
  list cards: name + inspectionLimit + radio BAIK/TIDAK_BAIK + optional note
  StickyActionBar: Simpan
```

Lib helpers (mirror `lib/calibration/measurement.ts`):

- types: `TechPhysicalCheckItem`, `TechPhysicalCheckResult`
- `canRecordPhysicalCheck`
- `physicalCheckLockedReason`
- `shouldShowPhysicalCheckSection`
- status summary helper (filled/total; optional tone BAIK vs TIDAK_BAIK)

Query module (mirror `use-measurements-query.ts`):

- `usePhysicalCheckItems`
- `usePhysicalCheckResults`
- `useCreatePhysicalCheckBatch`
- `useUpdatePhysicalCheck`

---

## 15. Files likely to change during implementation

- `apps/tech-pwa/src/app/jobs/[id]/page.tsx`
- `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx`
- **New:** `apps/tech-pwa/src/app/jobs/[id]/physical-check/page.tsx`
- **New:** `apps/tech-pwa/src/app/jobs/[id]/physical-check/physical-check-ui.tsx`
- **New:** `apps/tech-pwa/src/app/jobs/[id]/physical-check/use-physical-check-query.ts`
- **New:** `apps/tech-pwa/src/lib/calibration/physical-check.ts` (+ unit tests)
- possibly `apps/tech-pwa/src/lib/api-errors.ts` jika error code PI perlu pesan ID

---

## 16. Files that MUST NOT change

- Prisma schema / migrations / seed master PhysicalCheckItem
- `apps/api/.../physical-check-results.service.ts` (kecuali bugfix terpisah)
- Measurement services / measurement UI / `capabilityGroups` wiring
- QualityReview / Identity Correction / `resumeAfterRework` lifecycle
- Portal Physical Inspection (di luar scope Tech-PWA task ini)
- Routing architecture lain di luar additive `/physical-check`
- Permission catalog (action sudah ada)

---

## 17. Risks / gaps / ambiguities

| Gap | Severity | Catatan |
|---|---|---|
| Belum ada kode PI di Tech-PWA | Expected | Greenfield di atas pola jelas |
| Tidak ada kontrol BAIK/TIDAK_BAIK existing | Low | Adapt radio identity-correction + chip tone (bukan PassFailChip label) |
| `MeasurementResult.note` tidak di UI | Low | Pakai pola textarea escalate / override |
| DELETE API vs UI | Low | Ukur tidak delete di UI; v1 sama |
| Note selalu vs hanya saat TIDAK_BAIK | Low | Domain: opsional untuk keduanya; jangan wajibkan note |
| DeviceType 0 item (mis. PATIENT_MONITOR, ELECTRIC_BEDS) | Low | EmptyState; ikuti pola pengukuran |
| Label section: “Alat Referensi Digunakan” vs “Alat Acuan” | Cosmetic | Ikuti copy existing di UI |
| Exact chip wording summary Job Detail | Low | Mirror `n/total` / tone; jangan invent PASS/FAIL job |

Tidak ada keputusan bisnis domain yang memblokir implementasi UI Tech-PWA.

---

## 18. Final Verdict

**READY FOR IMPLEMENTATION**

Insertion point, route, fetch/mutate, lock/REWORK, permission, dan field mapping sudah dapat ditentukan dari arsitektur Tech-PWA + kontrak backend yang ada, tanpa mengubah domain MeasurementResult dan tanpa menambah business rule baru.
