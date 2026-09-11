# CalibrationJobDetail — Measurement Normal Value Audit

**Mode:** READ-ONLY / AUDIT / INVESTIGATE ONLY  
**Scope:** Display Measurement Result + Normal/Reference Value from Device Calibration Parameters  
**Target UI:** `CalibrationJobDetailPage` → Hasil Pengukuran (`QualityReviewPanel`)  
**Date:** 2026-09-11  
**Status:** Audit complete — no implementation in this document

---

## 1. Executive Summary

Data yang dibutuhkan untuk menampilkan **Hasil + Satuan + Nilai Normal/Acuan** di portal **sudah ada di wire API** hari ini.

- `GET /calibration-jobs/:id/measurement-parameters` sudah mengirim `uom`, `toleranceMin` / `toleranceMax` / `toleranceNote`, `decimalPlaces`, dan (GRID) bound per test point di dalam `capabilityGroups` / `parameters` / `gridParameters`.
- `GET /calibration-jobs/:id/measurement-results` mengembalikan **full Prisma `MeasurementResult`**, termasuk snapshot `effectiveToleranceMin` / `effectiveToleranceMax`, `isWithinTolerance`, dan `appliedNominalValue`.
- Portal hanya **mempersempit tipe TypeScript** dan **belum merender** kolom Satuan / Nilai Normal / status.

**Sumber “Nilai Normal” yang benar secara domain (sejajar evaluasi):**  
`MeasurementResult.effectiveToleranceMin` + `effectiveToleranceMax` — bukan Alat Referensi, bukan `appliedNominalValue`, bukan `referenceValue`.

### Final verdict

**`FRONTEND-ONLY READY`**

---

## 2. Current MeasurementResult data flow

```
CalibrationJobDetailPage
  apps/portal/src/app/management/calibration-jobs/[id]/page.tsx
    │
    ├─ useMeasurementParameters(jobId)
    │    GET /calibration-jobs/:id/measurement-parameters
    │    → CalibrationJobsService.listMeasurementParameters
    │
    ├─ useMeasurementResults(jobId)
    │    GET /calibration-jobs/:id/measurement-results
    │    → MeasurementResultsService.list
    │
    └─ QualityReviewPanel (inline di page.tsx)
         join hasil ↔ parameter by deviceCalibrationParameterId
         group by capabilityName
         order via capabilityGroups
```

| Lapisan | Lokasi |
|---|---|
| UI | `QualityReviewPanel` di `apps/portal/.../calibration-jobs/[id]/page.tsx` (~L1179+) |
| Hooks / types | `apps/portal/.../use-measurement-results-query.ts` |
| API controller | `calibration-jobs.controller` → `listMeasurementParameters` / `listMeasurementResults` |
| Catalog service | `calibration-jobs.service.ts` (`listMeasurementParameters`, DTO summaries) |
| Results service | `measurement-results.service.ts` (`list` → full row) |
| Tolerance engine | `measurement-tolerance.ts` (`resolveEffectiveTolerance`, `computeIsWithinTolerance`) |
| Prisma models | `DeviceCalibrationParameter` → `CalibrationTestPoint?` → `MeasurementResult` |

### Fields currently consumed by portal UI

| Field | Digunakan? |
|---|---|
| Parameter `name` | Ya |
| Test point `settingLabel` | Ya (suffix pada nama) |
| `replicateIndex` | Ya |
| `measuredValue` / `measuredText` / `measuredBool` | Ya (kolom “Nilai”) |
| `attemptNumber` (filter current attempt) | Ya |
| `capabilityName` + `capabilityGroups` order | Ya (grouping) |
| `uom` | **Tidak** |
| `toleranceMin` / `Max` / `Note` | **Tidak** |
| `effectiveToleranceMin` / `Max` | **Tidak** (tipe portal juga tidak mendeklarasikan) |
| `isWithinTolerance` | **Tidak** (tipe portal juga tidak mendeklarasikan) |

Tabel UI saat ini: **Parameter | Replicate | Nilai**.

---

## 3. DeviceCalibrationParameter data flow

```
DeviceCalibrationParameter
  ├── uom (Uom?) via uomId
  ├── capabilityItem → DeviceCapability
  ├── testPoints: CalibrationTestPoint[]
  └── measurementResults: MeasurementResult[]
```

Identitas parameter pada hasil:

```
MeasurementResult.deviceCalibrationParameterId  →  DeviceCalibrationParameter  (REQUIRED)
MeasurementResult.calibrationTestPointId       →  CalibrationTestPoint?       (NULL = DIRECT / Pattern A)
```

Tidak ada jalur terpisah melalui Reference Equipment.

---

## 4. Exact available fields

### 4.1 `DeviceCalibrationParameter` (Prisma — exact names)

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | |
| `deviceTypeId` | `String` | |
| `capabilityItemId` | `String` | |
| `code` | `String` | |
| `name` | `String` | |
| `description` | `String?` | |
| `valueType` | `CalibrationValueType` | default `NUMBER` |
| `uomId` | `String?` | FK ke `Uom` |
| `toleranceMin` | `Decimal?` `@db.Decimal(18, 4)` | |
| `toleranceMax` | `Decimal?` `@db.Decimal(18, 4)` | |
| `toleranceNote` | `String?` | free-text LK |
| `decimalPlaces` | `Int?` | meaningful for NUMBER |
| `sortOrder` | `Int` | |
| `isActive` | `Boolean` | |
| `entryStyle` | `CalibrationParameterEntryStyle` | default `DIRECT_REPLICATES` |

**Tidak ada field `nominal` pada `DeviceCalibrationParameter`.**  
Nominal/setpoint hidup di `CalibrationTestPoint.settingValue` dan/atau di-snapshot sebagai `MeasurementResult.appliedNominalValue`.

### 4.2 `CalibrationTestPoint` (exact names)

| Field | Type | Notes |
|---|---|---|
| `sequence` | `Int` | 1-based order |
| `settingLabel` | `String` | display label |
| `settingValue` | `Decimal?` | nominal/setpoint; NULL = generic slot |
| `toleranceMin` | `Decimal?` | per-point override; NULL = inherit |
| `toleranceMax` | `Decimal?` | per-point override; NULL = inherit |
| `toleranceNote` | `String?` | per-point note override |

### 4.3 `MeasurementResult` — reading + evaluation snapshot

| Field | Meaning for this audit |
|---|---|
| `measuredValue` / `measuredBool` / `measuredText` | **Hasil Pengukuran** |
| `referenceValue` | Bacaan alat referensi independen — **bukan** Nilai Normal |
| `uomId` | Override satuan per entry (Pattern D); NULL = pakai parameter UOM |
| `effectiveToleranceMin` / `effectiveToleranceMax` | Snapshot bound efektif — **kandidat utama Nilai Normal** |
| `appliedNominalValue` | Nominal dipakai resolve ± / setpoint — **bukan** “Nilai Normal” |
| `isWithinTolerance` | `true` → Sesuai; `false` → Tidak sesuai; `null` → tidak dievaluasi otomatis |

### 4.4 Wire: `MeasurementParameterSummary` (API)

Sudah di-select dan di-serialize:

- `id`, `code`, `name`
- `decimalPlaces`
- `uom: { code, symbol } | null`
- `toleranceMin`, `toleranceMax`, `toleranceNote` (Decimal → string)
- `capabilityName`, `capabilityItemName`
- GRID: `testPoints[]` dengan `id`, `sequence`, `settingLabel`, `settingValue`, `toleranceMin`, `toleranceMax`, `toleranceNote`

### 4.5 Wire: measurement-results list

`MeasurementResultsService.list` mengembalikan **full `MeasurementResult` row** (Decimal → JSON string via Prisma/decimal.js). Portal type `PortalMeasurementResult` hanya mendeklarasikan subset — field lain **ada di JSON runtime**.

### 4.6 Portal type gap (penting)

`PortalMeasurementParameter` saat ini **tidak** mendeklarasikan `decimalPlaces`, `toleranceMin`, `toleranceMax`, `toleranceNote`.  
`PortalMeasurementResult` saat ini **tidak** mendeklarasikan `isWithinTolerance`, `effectiveToleranceMin`, `effectiveToleranceMax`, `appliedNominalValue`, `uomId`, `referenceValue`.

Tech-pwa mirror types (`TechMeasurementParameter`, `TechMeasurementResult`) sudah lengkap — bukti bahwa wire shape sudah mapan.

---

## 5. Exact source of UOM

| Priority | Source | Field |
|---|---|---|
| Default display | Parameter catalog | `DeviceCalibrationParameter.uom.symbol` via `measurement-parameters` → `uom.symbol` |
| Rare override | Result row | `MeasurementResult.uomId` (list tidak include nested `uom` object) |

Untuk eligibility portal Hasil Pengukuran (NUMBER + `DIRECT_REPLICATES` saja): tampilkan **`param.uom?.symbol`**.

**Jangan** memperkenalkan field unit baru.  
`MeasurementResult` tidak menyimpan string satuan sendiri — hanya optional `uomId`.

---

## 6. Exact source of Normal / Reference range

Konsep yang diminta: **nilai normal/acuan dari Device Calibration Parameter / effective tolerance** — bukan Reference Equipment.

| Opsi | Sumber exact | Cocok sebagai “Nilai Normal”? |
|---|---|---|
| **A** | `toleranceMin` + `toleranceMax` (parameter) | Ya untuk DIRECT ber-bound tetap (contoh 20–30) |
| **B** | `toleranceNote` | Ya sebagai teks LK; tech-pwa `toleranceText` **mengutamakan note** |
| **C** | Nominal ± delta | Nominal = `settingValue` / `appliedNominalValue`; range hasil resolve = **effective** bounds |
| **D** | Test-point override / effective | Ya; masuk priority chain |

### Recommended display source (for rows next to Hasil)

1. **Primary:** `MeasurementResult.effectiveToleranceMin` + `effectiveToleranceMax`  
   — bound yang benar-benar dipakai `computeIsWithinTolerance` pada write time.
2. **Fallback display:** format dari catalog parameter/TP (`toleranceNote` atau min–max) bila effective null.
3. **Do not** label `appliedNominalValue` as “Nilai Normal”.
4. **Do not** use Alat Referensi / `referenceValue`.

Example formats: `20–30`, `≥ 15000`, `≤ 40`, or verbatim note text.

---

## 7. Effective tolerance resolution

From `apps/api/src/modules/calibration-jobs/measurement-tolerance.ts`:

### Priority (`resolveEffectiveTolerance`)

1. Test-point `toleranceMin`/`Max` (either non-null) → source `TEST_POINT_OVERRIDE`
2. Parameter `toleranceMin`/`Max` → source `PARAMETER_BOUNDS`
3. Parse `toleranceNote` (test-point note first, then parameter):
   - `± delta` / `± N%` + nominal → computed min/max
   - `Min : x; Max : y` / leading `≥`/`≤` → explicit bounds  
   → source `NOTE`
4. Else → both bounds null, source `NONE` → `isWithinTolerance` stays `null`

### `computeIsWithinTolerance`

- `BOOLEAN`: mirrors `measuredBool` (`true` = pass)
- `TEXT`: always `null`
- `NUMBER` / `RATIO`: compare raw `measuredValue` to effective min/max (one-sided bounds supported)

### Snapshot rule (locked)

Resolved bounds + `appliedNominalValue` are **written onto the MeasurementResult row** and **never recomputed** from a later-edited master catalog.

---

## 8. TestPoint implications

| Pattern | `calibrationTestPointId` | Normal range behavior |
|---|---|---|
| DIRECT (Pattern A) | `null` | Usually parameter-level bounds/note; same for all replicates |
| GRID (Pattern B) | set | May differ per test point (override or ± from `settingValue`) |

Showing only `parameter.toleranceMin/Max` for every GRID row **can be wrong** when:

- the test point has its own `toleranceMin`/`Max`, or
- the parameter is note-only `±` and effective range depends on that point’s `settingValue`.

`MeasurementResult.effectiveToleranceMin/Max` already resolves this per reading.

`appliedNominalValue` may equal the test point `settingValue` (or a technician-supplied generic-slot value). That is the **setpoint**, not the acceptance range.

---

## 9. DIRECT vs GRID implications

| | DIRECT | GRID |
|---|---|---|
| Locked tree | Capability → Parameter → Results | Capability → Parameter → TestPoint → Results |
| Nilai Normal | Typically identical across replicates | May differ per test point; repeat per result row from effective/TP data |
| Current portal label | Parameter name | `Name · settingLabel` |

**Do not change** GRID structure, capability/parameter/test-point/replicate ordering, or DIRECT/GRID semantics.

Existing `capabilityGroups` already nests GRID `testPoints` with per-point tolerance fields. No grouping change required for this display.

---

## 10. Replicate implications

Multiple `MeasurementResult` rows share the same parameter (and the same test point when GRID).

For a given `(parameterId, testPointId?, attemptNumber)` group, `resolveEffectiveTolerance` inputs are the same → **effective range is the same across replicates**.

Example (supported by current data):

| Parameter | Replicate | Hasil | Satuan | Nilai Normal |
|---|---|---|---|---|
| Suhu Ruangan | 1 | 25.1 | °C | 20–30 |
| Suhu Ruangan | 2 | 29.1 | °C | 20–30 |
| Suhu Ruangan | 3 | 20.0 | °C | 20–30 |

Safe to repeat the same normal range on each replicate row.

---

## 11. Existing capabilityGroups support

Conceptual structure (LOCKED — do not change):

```
DeviceCapability
  → DeviceCalibrationParameter
      → CalibrationTestPoint (GRID only; empty on DIRECT)
          → MeasurementResult (joined client-side from results API)
```

### Already present on `capabilityGroups[].parameters[]`

| Field | Present? |
|---|---|
| `uom` | Yes |
| `toleranceMin` | Yes |
| `toleranceMax` | Yes |
| `toleranceNote` | Yes |
| `decimalPlaces` | Yes |
| `kind` (`DIRECT` \| `GRID`) | Yes |
| `testPoints` (+ TP tolerances) | Yes (empty array on DIRECT) |
| Measurement results | **No** — separate endpoint by design |

### Portal usage today

- `capabilityGroups` used **only for capability sort order**
- Parameter list built from `parameters` + `gridParameters` (same scalar fields as grouped parameters)

### Smallest “missing” piece

**UI consumption + TypeScript type widening** — not missing backend data, not a new read-model field.

---

## 12. Frontend changes required (do not implement here)

### Exact component

`QualityReviewPanel` in:

`apps/portal/src/app/management/calibration-jobs/[id]/page.tsx`

### Exact types file

`apps/portal/src/app/management/calibration-jobs/use-measurement-results-query.ts`

Widen toward the existing tech-pwa / API shapes:

- `PortalMeasurementParameter`: add `decimalPlaces`, `toleranceMin`, `toleranceMax`, `toleranceNote`; widen `testPoints` with optional tolerance/settingValue fields
- `PortalMeasurementResult`: add at least `isWithinTolerance`, `effectiveToleranceMin`, `effectiveToleranceMax` (and optionally `appliedNominalValue`, `uomId`, `referenceValue` if needed later)

### Exact fields to consume

| Column | Source |
|---|---|
| Parameter | `param.name` (+ TP `settingLabel` as today) |
| Replicate | `row.replicateIndex` |
| Hasil | `row.measuredValue` / `measuredText` / `measuredBool` |
| Satuan | `param.uom?.symbol` |
| Nilai Normal | format(`row.effectiveToleranceMin/Max`) with catalog fallback |
| Status (optional) | `row.isWithinTolerance` → Sesuai / Tidak sesuai / neutral |

### API response change?

**None required.**

### Frontend type change?

**Yes — additive type alignment only** (reflect fields already on the wire).

### Existing helper reference (tech-pwa)

- `toleranceText(...)` — prefers `toleranceNote`, else formats min/max + unit
- `passFailChip(isWithinTolerance)` — Sesuai / Tidak sesuai / unknown

These can be mirrored locally in portal; they are not a hard dependency.

---

## 13. Backend changes required

### Case classification

**CASE A:** All required data already exists in the current response.

→ **Frontend-only implementation is sufficient.**

| Possible case | Applies? |
|---|---|
| A — already on wire | **Yes** |
| B — exists in backend, missing from response | No |
| C — needs backend resolution for display | No (already snapshotted on write) |
| D — cannot derive from Device Calibration data | No |

No Prisma change, no migration, no tolerance-engine change, no `MeasurementResult` model change, no `capabilityGroups` structure change.

---

## 14. Recommended UI structure

Conceptual (layout not final):

```
Parameter | Replicate | Hasil | Satuan | Nilai Normal | (optional Status)
```

Validated against the audit example:

| Parameter | Replicate | Hasil | Satuan | Nilai Normal |
|---|---|---|---|---|
| Suhu Ruangan | 1 | 25.1 | °C | 20–30 |
| Suhu Ruangan | 2 | 29.1 | °C | 20–30 |
| Suhu Ruangan | 3 | 20.0 | °C | 20–30 |

### Product choice before implementation (not a data blocker)

| Preference | When to use |
|---|---|
| **Effective snapshot** (`effectiveToleranceMin/Max`) | Best match to evaluation / Quality Review of recorded results |
| **Catalog note** (`toleranceNote` first, like tech-pwa entry) | Best match to LK worksheet wording |

Both are available without API changes. Recommendation for Hasil Pengukuran review: **prefer effective snapshot**, fall back to catalog text when snapshot bounds are null.

---

## 15. Risks / edge cases

| Risk | Detail |
|---|---|
| Catalog vs snapshot drift | After master catalog edit, live `tolerance*` may differ from historical `effective*`. For reviewing recorded results, prefer snapshot. |
| Note-only ± without nominal | Effective bounds null → show “—” or raw note; `isWithinTolerance` null |
| Multi-rule notes (multiple distinct ±) | Parser returns null → not auto-evaluable |
| BOOLEAN / TEXT / RATIO / LOGGER_SUMMARY | Outside current `measurement-parameters` eligibility for this UI path (`NUMBER` + `DIRECT_REPLICATES` only; LOGGER excluded) |
| Portal type gap | Easy to assume data is missing when it is only undeclared in TS |
| Concept confusion | `appliedNominalValue`, `referenceValue`, Alat Referensi ≠ Nilai Normal |
| One-sided bounds | Format as `≥ min` or `≤ max`, not a forced range |
| GRID per-point variance | Do not assume parameter-level range for every GRID row |

### “Tidak sesuai” compatibility

Locked semantic (do not change):

- `isWithinTolerance === true` → Sesuai  
- `isWithinTolerance === false` → Tidak sesuai  
- `null` → not automatically evaluated  

Showing **Hasil | Nilai Normal** is presentation only. It must **not**:

- invent new PASS/FAIL rules
- change submit / approve / complete
- alter QualityReview / REWORK / JobHandOff / Identity Correction

Portal currently does **not** render the Sesuai/Tidak sesuai chip; adding it later remains compatible.

---

## 16. Files inspected

| File | Why |
|---|---|
| `apps/portal/src/app/management/calibration-jobs/[id]/page.tsx` | `QualityReviewPanel` current render |
| `apps/portal/src/app/management/calibration-jobs/use-measurement-results-query.ts` | Portal hooks + narrowed types |
| `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` | `listMeasurementParameters`, DTO, select, capabilityGroups builder |
| `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts` | Endpoint wiring |
| `apps/api/src/modules/calibration-jobs/measurement-results.service.ts` | create/list + snapshot write path |
| `apps/api/src/modules/calibration-jobs/measurement-tolerance.ts` | `resolveEffectiveTolerance`, `computeIsWithinTolerance`, note parsing |
| `packages/db/prisma/schema.prisma` | `DeviceCalibrationParameter`, `CalibrationTestPoint`, `MeasurementResult` |
| `apps/tech-pwa/src/lib/calibration/measurement.ts` | Full wire types, `toleranceText`, pass/fail chip |
| MeasurementResult Stage1 / Stage2c design docs | Snapshot + serialization semantics |

---

## 17. Final verdict

# FRONTEND-ONLY READY

### Why

1. UOM + configured tolerances already ship on `measurement-parameters` / `capabilityGroups`.
2. Effective normal bounds already ship on every `measurement-results` row as `effectiveToleranceMin` / `effectiveToleranceMax`.
3. Minimum work is portal type alignment + `QualityReviewPanel` columns.
4. No backend read-model change, domain gap, or data-model change is required for the requested lab-style display.

### Explicit non-goals preserved (LOCKED)

- `capabilityGroups` structure and ordering
- DIRECT / GRID semantics
- `MeasurementResult` model
- Physical Inspection, QualityReview rules, REWORK, JobHandOff, Identity Correction
- Tolerance engine behavior
- Reference Equipment as a source of “Nilai Normal”

### Conceptual mapping (locked for implementers)

```
Hasil Pengukuran     = MeasurementResult measured* fields
Nilai Normal/Acuan   = effectiveToleranceMin/Max (primary); catalog tolerance*/note (fallback)
Satuan               = DeviceCalibrationParameter.uom.symbol
Nilai Nominal        = appliedNominalValue / testPoint.settingValue (NOT “Nilai Normal”)
Alat Referensi       = JobReferenceEquipmentUsed / referenceValue (OUT OF SCOPE)
isWithinTolerance    = existing Sesuai / Tidak sesuai evaluation (unchanged)
```

---

*End of audit. Implement nothing from this document until a separate implementation task is opened.*
