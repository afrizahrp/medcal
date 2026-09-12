# STAGE A — tech-pwa Measurement Entry: Skeleton + Pattern A Only — Implementation Report

**Date:** 2026-09-08
**Scope:** tech-pwa measurement entry for **Pattern A** parameters only
(`valueType = NUMBER`, active, **no `CalibrationTestPoint` children**,
`entryKind = DIRECT_READING`). Pattern B grids and Pattern D
(logger-summary / generic-slot / boolean / ratio) are **not** in this stage.

**HARD STOP after this — await review before Stage B (Pattern B grid UI).**

---

## 0. TL;DR

| # | Item | Outcome |
|---|---|---|
| 1 | Genuine API gap found + filled | tech-pwa had **no way** to enumerate a job's parameters (the job payload doesn't carry the resolved `deviceTypeId`). Added **one read-only endpoint** `GET /calibration-jobs/:id/measurement-parameters` + one `MeCapabilities` flag. Flagged here, not silent. §1. |
| 2 | Pattern A query | `deviceCalibrationParameter` where `{ deviceTypeId: <resolved>, isActive: true, valueType: "NUMBER", testPoints: { none: {} } }`, ordered `sortOrder → name`. Confirmed against live `pkmdb`: **448** Pattern A rows catalog-wide; `DUNIT_ILLUMINANCE` correctly included; the one live IN_PROGRESS job (Bed Side Monitor) resolves to its **7** environment / electrical-safety rows, correctly excluding the HR/RESP/SpO₂/NIBP Pattern B rows. §2. |
| 3 | "Expected replicate count" | **Nothing structural exists** — not on `DeviceCalibrationParameter`, not on `CalibrationTestPoint`. No field invented. Entry UI seeds **5 rows** (the LK "I–V" convention) with a **"+ Tambah ulangan"** affordance. Known soft spot. §3. |
| 4 | Entry point | `MeasurementsSection` on the job-detail screen (mirrors `ReferenceEquipmentSection` placement), visible while `status = IN_PROGRESS` (or read-only later if readings exist). Per-parameter list with `n/5 diisi` / `Selesai` / `Ada tidak sesuai` status. Link **"Catat Hasil Pengukuran"**. §4. |
| 5 | Per-parameter screen | `/jobs/:id/measurements/:parameterId` — N numeric rows, `decimalPlaces`-aware (reads the field; `0` today → whole numbers), pass/fail chip per saved row from `isWithinTolerance` in the write response (no 2nd round-trip), add-replicate, batch-create new + PATCH edits. §4. |
| 6 | Lock | `status ∈ {SUBMITTED, ACCEPTED_BY_QA}` or superseded attempt → read-only with an inline amber notice; mirrors `MEASUREMENT_LOCKED_JOB_STATUSES` and the guard's `MEASUREMENT_JOB_SUBMITTED` / `MEASUREMENT_ATTEMPT_SUPERSEDED` codes. §5. |
| 7 | Polling | **None added.** Measurement entry is single-technician data entry; the job-detail page already polls the job (6s) so a Portal-side submit/QA lock still surfaces there. §6. |
| 8 | Tests | tech-pwa: **19** new pure-logic assertions (`measurement.test.ts`) — formatting, tolerance text, pass/fail chip, lock helpers, entry-status fold. api: **1** new service test (Pattern A resolution + exclusions). Full runs green. §7. |
| 9 | Typecheck | `@medcal/api`, `@medcal/portal`, `@medcal/web-api`, `@medcal/auth`, `@medcal/shared` clean. `@medcal/tech-pwa` clean **except one pre-existing** `logo.png` module error in `auth-card.tsx` (unrelated, present on `main`). §7. |

---

## 1. API additions (the genuine gap — flagged, not silent)

The task said *"No API/schema changes expected — flag if a genuine gap surfaces (e.g., missing endpoint)."* One surfaced and is unavoidable:

**`TechCalibrationJob` / the job payload never exposes the resolved DeviceType.**
It carries `device: { id, code, serialNumber }` (the *bound physical* device, often
still null on-site), never the *commercial-chain* `deviceTypeId` that
`resolveJobDeviceTypeId()` computes server-side. So the client cannot run the
Pattern A query itself.

### 1.1 New endpoint — `GET /calibration-jobs/:id/measurement-parameters`

- `@RequirePermission("calibrationJob", "read")` — the same read-level grant every
  other GET on this controller uses (`reference-equipment-candidates`,
  `identity-corrections`, …). No new read permission.
- Service: `CalibrationJobsService.listMeasurementParameters(companyId, jobId)`
  → `findOne` (404s if missing) → `resolveJobDeviceTypeId(job)` (the existing
  private helper, unchanged) → the Pattern A query.
- Response:
  ```ts
  { deviceType: { id, name } | null,        // null → chain unresolved
    parameters: {
      id, code, name, decimalPlaces,        // decimalPlaces passed through verbatim
      uom: { code, symbol } | null,
      toleranceMin, toleranceMax, toleranceNote,   // Decimal → string, API-wide convention
      capabilityName, capabilityItemName } [] }
  ```
- Purely additive; mirrors `getReferenceEquipmentCandidates` in shape and placement.

### 1.2 New capability flag — `calibrationJobRecordMeasurement`

`MeCapabilities` had flags for every other calibration action but not this one
(the RBAC action `calibrationJob:recordMeasurement` was defined in Stage 2b and
granted to TECHNICIAN + TECHNICIAN_MANAGER; only the `/me` projection was
missing). Added one line to `me-types.ts` and one `hasPermission(...)` line to
`me.controller.ts`, identical to the 9 neighbouring flags. `TechCalibrationJob`
also gained `currentAttempt: number` and `submittedAt: string | null` — **not an
API change**, those scalars are already in the `/calibration-jobs/:id` payload
(`Prisma.CalibrationJobGetPayload` includes all scalars); the local mirror just
now declares them.

**No schema change. No migration. No service-behaviour change** beyond the new
read method.

---

## 2. Pattern A identification — confirmed against the live catalog

Query (`listMeasurementParameters`):

```ts
prisma.deviceCalibrationParameter.findMany({
  where: { deviceTypeId, isActive: true, valueType: "NUMBER", testPoints: { none: {} } },
  orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
})
```

Live `pkmdb` spot-checks (read-only throwaway script, not committed):

| Check | Result |
|---|---|
| Active `NUMBER` params, catalog-wide | 488 |
| — with ≥1 `CalibrationTestPoint` (Pattern B/D-fixed) | 40 |
| — **Pattern A** (0 test points) | **448** |
| `DUNIT_ILLUMINANCE` | `NUMBER`, active, 0 test points, `toleranceMin 15000`, `toleranceNote ">15.000 lux"`, uom `LUX` → **correctly Pattern A** |
| Job `cmtpek2120016pd0njc3qbw5m` (SPK/2026/09/00001, Bed Side Monitor, `IN_PROGRESS`) | resolves to **7** params: `BSM_ROOM_TEMP`, `BSM_ROOM_HUMIDITY`, `BSM_INPUT_VOLTAGE`, `BSM_EARTH_RESISTANCE`, `BSM_INSULATION_RESISTANCE`, `BSM_EQUIP_LEAKAGE`, `BSM_APPLIED_LEAKAGE`. `BSM_HEART_RATE` / `BSM_SYSTOLIC` / … correctly **excluded** (they carry test points). |

### Known caveat — Ventilator (and other not-yet-seeded Pattern B rows)

`VENT_TIDAL_VOLUME`, `VENT_MINUTE_VOLUME`, … are conceptually Pattern B (setpoint
sweeps) but their `CalibrationTestPoint` rows are **not seeded yet** (the LK
worksheet is a PDF, deferred — see `CalibrationTestPoint_Seed_Stage2_Report.md`).
Until seeded they satisfy the *structural* Pattern A predicate and will appear on
this screen as direct readings. This is the task's stated contract
("if it has test points … skip it") working as designed — the moment those test
points land, the params move to Stage B automatically and drop off this screen.
**Flagged, not worked around.**

---

## 3. "Expected replicate count" decision

**Investigated:** there is no structural replicate-count anywhere.
- `MeasurementResult.replicateIndex` is `1..N` free-form.
- `DeviceCalibrationParameter` — no such field (checked the schema + the
  DecimalPlaces redesign that last touched it).
- `CalibrationTestPoint` — none (checked the Stage 2a model).
- The LK worksheets imply it only by the "I–V" trial columns.

**Decision:** no new schema field. `DEFAULT_REPLICATE_COUNT = 5` in
`lib/calibration/measurement.ts`; the entry screen renders
`max(5, existing max replicateIndex)` rows plus a **"+ Tambah ulangan"** button,
so a parameter that genuinely needs 3 or 8 is never blocked. `parameterEntryStatus`
reports `filled / total` where `total` grows past 5 if more replicates exist.
**Known soft spot** — a real per-parameter count is future data work, not a Stage A gate.

---

## 4. UI

### Job-detail section — `MeasurementsSection` (`job-detail-ui.tsx`)

Placed after `ReferenceEquipmentSection`, gated on
`capabilities.calibrationJobRecordMeasurement && (status === "IN_PROGRESS" || readings exist)`.
Renders a compact per-parameter list — name + status chip
(`n/5` · `Selesai` · `Ada tidak sesuai`) — then either the
**"Catat Hasil Pengukuran"** link (when `IN_PROGRESS` + started + device type
resolved + params exist) or the inline locked reason.

### List screen — `/jobs/:id/measurements` (`measurements/page.tsx`)

Full parameter list. Each row (`MeasurementParameterListRow`): name,
`capability › item` context, `Toleransi: <human text>` (from `toleranceNote`,
else resolved bounds), unit, and the entry-status chip. Empty/ës:
- device type unresolved → "Jenis alat belum dapat ditentukan. Hubungi kantor."
- 0 Pattern A params → "memakai grid titik uji / ringkasan logger — belum didukung".
- locked → amber notice, list still visible (read-only downstream).

### Per-parameter screen — `/jobs/:id/measurements/:parameterId` (`[parameterId]/page.tsx`)

- Header card: `capability › item`, tolerance text, unit, `Desimal: <dp>`.
- N rows, each: `Ulangan k` · numeric `<input type=number inputMode=decimal
  step=<derived from dp>>` · pass/fail chip (saved rows) or "belum disimpan".
- `decimalPlaces`-aware: `measuredValueInputStep(dp)` / `formatMeasuredValue(v, dp)`
  read `param.decimalPlaces ?? 0` — **never hardcoded**; correct automatically once
  the backfill lands. Read-only rows show `formatMeasuredValue`.
- **Save** (`Simpan pembacaan`): new rows → one `POST .../measurement-results/batch`;
  edited existing rows → `PATCH .../measurement-results/:id` each. Then `refetch`.
  Button disabled when nothing dirty or any dirty value fails
  `/^-?\d+(\.\d+)?$/`.
- Pass/fail chip uses `isWithinTolerance` straight from the write/list response —
  **no second round-trip** (`null` → neutral "Perlu telaah", judged at QA).
- **"+ Tambah ulangan"** appends a row.
- Locked → inputs replaced by static values + chips, no save button.

### Queries — `measurements/use-measurements-query.ts`

`useMeasurementParameters`, `useMeasurementResults` (GET),
`useCreateMeasurementBatch` (POST /batch), `useUpdateMeasurement` (PATCH).
Keys under `["job", id, "measurement-*"]` so the job-detail page's
`["job", id]` invalidations sweep them; the job-detail section and both
sub-screens **share** the cached queries (no double-fetch on navigation).

---

## 5. Lock behaviour

`lib/calibration/measurement.ts`:
`isMeasurementLocked` = `status ∈ {SUBMITTED, ACCEPTED_BY_QA}` (mirrors
`MEASUREMENT_LOCKED_JOB_STATUSES` in the service). `canRecordMeasurement` =
`status === "IN_PROGRESS" && startedAt !== null`. `measurementLockedReason`
returns a specific Indonesian string per blocked state (not started / submitted /
REWORK / other). The API error codes `MEASUREMENT_JOB_SUBMITTED`,
`MEASUREMENT_ATTEMPT_SUPERSEDED`, `MEASUREMENT_DUPLICATE_ENTRY`,
`INVALID_MEASUREMENT_RESULT*`, `MEASUREMENT_RESULT_NOT_FOUND` are mapped in
`lib/api-errors.ts` so a stale write shows a clear inline message, not a raw toast.

Superseded-attempt readings: the list screen and detail section filter
`row.attemptNumber === job.currentAttempt` and `calibrationTestPointId === null`,
so only the current attempt's Pattern A rows are shown/counted.

---

## 6. Polling — assessed, deliberately skipped

Measurement entry is single-technician data entry against rows keyed by
`(job, param, replicateIndex, attempt)` — no second person edits the same row.
The job-detail page already runs `useJobQuery(id, { poll: true })` (6s +
refetch-on-focus), so a Portal-side status change that locks entry surfaces in
the section within ~6s. Adding `refetchInterval` to the entry screens would be
reflexive; **not added**, per the task's guidance.

---

## 7. Tests & checks

### tech-pwa — `src/lib/calibration/measurement.test.ts` (new, 19 assertions)
`formatMeasuredValue` (dp-aware, null→0, blank→"—") · `measuredValueInputStep` ·
`isValidMeasuredValue` · `toleranceText` (note-first, bounds fallback, no-tol) ·
`passFailChip` (true/false/null → pass/fail/unknown) · `isMeasurementLocked` /
`canRecordMeasurement` / `measurementLockedReason` · `parameterEntryStatus`
(fold to `filled/total`, grows past the default, complete/anyFail).

```
apps/tech-pwa  vitest run → Test Files 2 passed, Tests 19 passed
apps/tech-pwa  tsc --noEmit → clean except src/components/auth/auth-card.tsx logo.png (pre-existing on main)
```

### api — `calibration-jobs.service.test.ts` (+1)
`"CalibrationJobsService — Measurement Parameters (Stage A, Pattern A)"` — creates a
Pattern A row + a test-point row + a RATIO row + an inactive row on one device
type; asserts only the Pattern A `code` comes back, in order, with
`toleranceMin/Note` and capability names passed through.

```
apps/api  vitest run src/modules/calibration-jobs src/modules/me → 164 passed (was 163)
turbo run typecheck → @medcal/api, @medcal/portal, @medcal/web-api + packages clean
```

### Manual verification — pending a running stack
The one live IN_PROGRESS job (Bed Side Monitor, SPK/2026/09/00001) was used to
confirm the **endpoint's query output** (7 correct params, Pattern B excluded).
A full click-through (enter values → chips → submit-lock) needs api + tech-pwa
dev servers + an authenticated technician session; not run here. The pass/fail
and formatting logic it exercises is covered by the pure-logic tests above.

---

## 8. Files

**New**
| File | Purpose |
|---|---|
| `apps/tech-pwa/src/lib/calibration/measurement.ts` | types + pure helpers |
| `apps/tech-pwa/src/lib/calibration/measurement.test.ts` | 19 assertions |
| `apps/tech-pwa/src/app/jobs/[id]/measurements/use-measurements-query.ts` | 4 hooks |
| `apps/tech-pwa/src/app/jobs/[id]/measurements/measurements-ui.tsx` | list-row + chip |
| `apps/tech-pwa/src/app/jobs/[id]/measurements/page.tsx` | list screen |
| `apps/tech-pwa/src/app/jobs/[id]/measurements/[parameterId]/page.tsx` | entry screen |

**Modified**
| File | Change |
|---|---|
| `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` | `+ MeasurementParameterSummary` / `JobMeasurementParametersResult` types, `+ listMeasurementParameters()` |
| `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts` | `+ GET :id/measurement-parameters` |
| `apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts` | `+ 1` describe block |
| `apps/api/src/modules/me/me.controller.ts` | `+ calibrationJobRecordMeasurement` projection |
| `packages/auth/src/me-types.ts` | `+ calibrationJobRecordMeasurement: boolean` |
| `apps/tech-pwa/src/lib/calibration/types.ts` | `+ submittedAt`, `+ currentAttempt` on `TechCalibrationJob` |
| `apps/tech-pwa/src/lib/api-errors.ts` | `+ 7` measurement error-code messages |
| `apps/tech-pwa/src/lib/calibration/job-display.test.ts` | test factory `+ submittedAt/currentAttempt` |
| `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx` | `+ MeasurementsSection` |
| `apps/tech-pwa/src/app/jobs/[id]/page.tsx` | wire section + queries |

---

## 9. Assumptions

1. Pattern A = the structural predicate (`NUMBER` + active + no test points), per
   the task. Not-yet-seeded Ventilator Pattern B rows transiently qualify (§2).
2. `resolveJobDeviceTypeId` (commercial chain: `calibrationRequestItem` →
   PO-item walk) is the right device-type source — the same one Identity
   Correction validation and reference-equipment candidates use.
3. 5 default replicates (LK "I–V"). Partial saves allowed — not every replicate
   must be filled to press Save.
4. `decimalPlaces = 0` placeholder is fine for now (round to whole numbers); the
   field is read, never hardcoded, so entry becomes correct once the backfill
   (separate task — `DecimalPlaces_Backfill_Proposal.md`) lands.
5. Section hidden for a plain FINANCE/CS viewer (capability-gated), unlike the
   always-visible reference-equipment list — acceptable for a skeleton.

## 10. HARD STOP

Await review before Stage B (Pattern B test-point grid UI).
