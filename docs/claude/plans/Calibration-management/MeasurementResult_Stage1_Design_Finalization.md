# STAGE 1 — MeasurementResult Design Finalization

**Date:** 2026-09-07
**Mode:** Design / proposal only. **No migration was run. No `.ts` service / controller / UI /
schema file was modified.** The Prisma blocks below are a *proposal for review*, not applied. A
throwaway read-only query script was used against local `pkmdb` to confirm counts, then deleted
(not added to the repo).
**Predecessor:** `MeasurementResult_Stage1_Schema_State_Verification.md` (same folder) — read first;
it establishes the live schema state, the 08-27 Pattern A/B/C/D classification, and gaps
G1–G4 / F2 / D1 / H1 / H2. All decisions from the 2026-09-07 review session are treated as **LOCKED**
and are not re-litigated here.
**HARD STOP:** review + approval required before any Stage 2 implementation.

---

## 0. TL;DR

| # | Item | Outcome |
|---|---|---|
| 1 | Draft Prisma schema | §3 — `CalibrationTestPoint` (new) + `MeasurementResult` (restructured, same table name), enums `MeasurementDirection` + `MeasurementEntryKind`, natural-key unique constraint, reverse-relation edits, migration notes. |
| 2 | Pattern walkthroughs | §4 — real catalog codes: `DUNIT_ILLUMINANCE` (A), `BSM_SYSTOLIC` (B), `DUNIT_HP_SPEED_LOW/HIGH` + `ACLV_STER_TEMP_121/134` (C), `BBR_STORAGE_TEMP` / `SUCT_VACUUM_GAUGE` / `BSC_HEPA_LEAK` / `VENT_IE_RATIO` (D). |
| 3 | Pattern C needs no entry-model handling | §5 — **Confirmed.** Verified against the 8 split rows in `fix-collapsed-pattern-c-parameters.ts`. Each split row is a self-contained Pattern-A/B parameter; the optional test-point tolerance-override fields cover only the residual un-split cases (`SUCT_MAX_VACUUM`, `INCU_AIR_TEMP`). |
| 4 | "Locked after submit" enforcement | §7 — **Service-layer guard, primary and sufficient.** Consistent with the existing `IDENTITY_LOCKED_JOB_STATUSES` / `REFERENCE_EQUIPMENT_LOCKED_JOB_STATUSES` pattern in `calibration-jobs.service.ts`. Optional DB trigger noted as future defense-in-depth, not required for Stage 2. |
| 5 | `attemptNumber` placement | §6 — **Both.** `MeasurementResult.attemptNumber` (required — it is a named component of the locked natural key) **+** `CalibrationJob.currentAttempt` (the counter; the REWORK transition is the single well-defined increment moment). |
| 6 | `decimalPlaces = 0` placeholder count | §2 — **486 of 489 rows** carry the `0` placeholder (the other 3 are the non-NUMBER rows, `decimalPlaces = NULL` by design). **0 rows** have an accurate per-parameter value. Named **blocking prerequisite** — not fixed here. |
| 7 | Deferred / open items | §9 — G4, H1, H2 / 79 note-only rows, D1, full offline-sync, Excel export detail, AI-assisted QualityReview. |

---

## 1. What this design does and does not touch

**Adds:**
- One new model: `CalibrationTestPoint` (optional master-level child of `DeviceCalibrationParameter`).
- Two new enums: `MeasurementDirection`, `MeasurementEntryKind`.
- One new field on `CalibrationJob`: `currentAttempt Int @default(1)`.
- Reverse-relation fields on `DeviceCalibrationParameter`, `User`, `FileObject`, `Uom`
  (Prisma requires the back-reference to be declared).

**Restructures (same table name `MeasurementResult`, 0 rows, no runtime — safe):**
- Drops `payloadJson Json` and `summaryJson Json?`.
- Adds typed columns: required FK `deviceCalibrationParameterId` (closes **F2**), optional FK
  `calibrationTestPointId`, `replicateIndex`, `attemptNumber`, `direction`, `measuredValue`,
  `referenceValue`, `measuredBool`, `measuredText`, `uomId`, `isWithinTolerance`,
  `effectiveToleranceMin/Max`, `appliedNominalValue`, `attachmentFileObjectId`, `entryKind`,
  `recordedByUserId`, `note`, `updatedAt`.
- Adds the natural-key unique constraint.

**Does not touch:** `DeviceCalibrationParameter` field semantics (only a reverse relation is
added), `QualityReview` (G4 — separate), `Certificate`, `JobReferenceEquipmentUsed`,
`CalibrationJobStatus` enum (no `CANCELLED` — D1 unrelated), any tolerance data, `decimalPlaces`
values, the 79 note-only rows.

---

## 2. Blocking prerequisite — `decimalPlaces` backfill (decision #7)

Queried against local `pkmdb`, 2026-09-07:

| Metric | Count |
|---|---:|
| `DeviceCalibrationParameter` total | **489** |
| `valueType = NUMBER` | 486 |
| `decimalPlaces = 0` (the uniform placeholder) | **486** |
| `decimalPlaces` NULL (the 2 RATIO + 1 BOOLEAN rows — correct, non-NUMBER) | 3 |
| `decimalPlaces > 0` (i.e. a real, verified per-parameter value) | **0** |

**Every measurable parameter in the catalog currently declares `0` decimal places.** This is the
uniform safe placeholder written by migration `20260829020000`, not verified data (confirmed by the
predecessor report §2.4 and by the `> 0` count being zero).

**Why this blocks accurate measurement entry (named dependency, NOT fixed in this task):**

1. **Entry validation.** The technician-app entry field for a NUMBER parameter should constrain /
   round input to the parameter's precision (Bed Side Monitor pressures ≈ 5 dp, Tensimeter ≈ 1 dp,
   lux meters 0 dp). With every row at `0`, the UI would either reject valid fractional readings or
   silently truncate them.
2. **`isWithinTolerance` is computed from raw values (locked rule) — but the raw value still has to
   be *captured* at the instrument's real resolution.** A reading truncated to `0` dp at entry time
   is permanently lossy; no downstream recomputation can recover it.
3. **Excel export (decision #8)** must render each value at its correct significant figures; a
   uniform `0` produces a misleading certificate-grade document.

**Design assumption for Stage 2:** `MeasurementResult.measuredValue` is stored at `Decimal(18,6)`
(headroom well beyond any plausible `decimalPlaces`), and the entry UI reads
`parameter.decimalPlaces` for input formatting. The design is correct *once the backfill lands*;
the backfill itself is separate scope and is a hard precondition for the entry UI to be trustworthy.

---

## 3. Draft Prisma schema (PROPOSAL — not applied)

### 3.1 New enums

```prisma
/// Ramp facet for Pattern D paired up/down sweeps (Suction Pump vacuum-gauge
/// accuracy "Naik | Turun"; Sphygmomanometer pressure accuracy "naik & turun").
/// NONE is the default and covers every non-ramp reading, so the value is always
/// non-null and can safely participate in the natural-key unique constraint
/// (a nullable column there would be defeated by Postgres NULL-distinctness).
enum MeasurementDirection {
  NONE
  UP   // naik
  DOWN // turun
}

/// Discriminates a directly-typed reading from a summary row that stands in for
/// an attached data-logger export (Pattern D spatial/temporal uniformity — the
/// fridge / freezer / oven / sterilizer rows, where 9 sensors x 30 timepoints
/// are never typed into the worksheet). Drives Excel-export grouping.
enum MeasurementEntryKind {
  DIRECT_READING
  LOGGER_SUMMARY
}
```

### 3.2 `CalibrationTestPoint` (new)

```prisma
/// Optional master-level child of DeviceCalibrationParameter. Created ONLY for
/// Pattern B parameters (a fixed "Setting Simulator / Setting UUT / Setting
/// Standar" sweep with one shared tolerance) and the fixed-slot flavour of
/// Pattern D (generic ordinal points whose numeric value the technician chooses
/// on-site — settingValue NULL, settingLabel "Titik ukur 1"). Pattern A and
/// note-only parameters have NO test points; their MeasurementResult rows carry
/// calibrationTestPointId = NULL.
///
/// toleranceMin/Max/Note are an OPTIONAL PER-POINT OVERRIDE: NULL = inherit the
/// parent DeviceCalibrationParameter's bounds (the Pattern B norm). They exist
/// for the residual un-split Pattern C / dual-class cases (SUCT_MAX_VACUUM,
/// INCU_AIR_TEMP) and any future per-analyte analyzer lists, so those never need
/// to explode into separate DeviceCalibrationParameter rows.
model CalibrationTestPoint {
  id                           String  @id @default(cuid())
  deviceCalibrationParameterId String

  /// Stable display / worksheet order within the parameter. 1-based.
  sequence     Int
  /// Human label always shown on the worksheet ("80 dB", "121 C cycle",
  /// "Posisi A", "Titik ukur 1"). Required.
  settingLabel String
  /// The nominal setting/target the technician dials in. NULL for the Pattern D
  /// "generic ordinal slot" case where the value is chosen per unit at
  /// measurement time (then recorded on MeasurementResult.appliedNominalValue).
  settingValue Decimal? @db.Decimal(18, 4)

  /// Optional per-point tolerance override. NULL = inherit parent parameter.
  toleranceMin  Decimal? @db.Decimal(18, 4)
  toleranceMax  Decimal? @db.Decimal(18, 4)
  toleranceNote String?

  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  parameter          DeviceCalibrationParameter @relation(fields: [deviceCalibrationParameterId], references: [id], onDelete: Cascade)
  measurementResults MeasurementResult[]

  @@unique([deviceCalibrationParameterId, sequence])
  @@unique([deviceCalibrationParameterId, settingLabel])
  @@index([deviceCalibrationParameterId])
}
```

### 3.3 `MeasurementResult` (restructured — same table name)

```prisma
/// One measured reading (or one logger-summary row) for one parameter, at one
/// test point, for one replicate trial, on one revision attempt, in one ramp
/// direction. payloadJson / summaryJson are removed. The table had 0 rows and no
/// runtime, so the migration drops+adds columns with no backfill.
model MeasurementResult {
  id        String @id @default(cuid())
  companyId String // bare String, no FK — matches the project child-table convention (gap E3)

  // ── Natural / composite key (offline-sync readiness, decision #3) ──────────
  calibrationJobId             String
  /// REQUIRED FK — closes the long-standing F2 gap.
  deviceCalibrationParameterId String
  /// NULL for Pattern A and note-only parameters (no fixed test points).
  calibrationTestPointId       String?
  /// 1-based trial number (LK columns I, II, III, ...). 1 when the worksheet has
  /// a single measurement column, or for a LOGGER_SUMMARY row.
  replicateIndex               Int
  /// Revision cycle. Mirrors CalibrationJob.currentAttempt at write time. Old
  /// attempts' rows are never edited or deleted (decision #4).
  attemptNumber                Int
  /// Ramp facet. NONE for all non-ramp readings (the overwhelming majority).
  direction                    MeasurementDirection @default(NONE)

  // ── The reading ──────────────────────────────────────────────────────────
  entryKind      MeasurementEntryKind @default(DIRECT_READING)
  /// Raw measured value exactly as entered — full precision, NEVER rounded.
  /// isWithinTolerance is computed from THIS (locked project rule). NULL for
  /// BOOLEAN / TEXT readings and for a LOGGER_SUMMARY that only carries an
  /// attachment.
  measuredValue  Decimal? @db.Decimal(18, 6)
  /// Paired reference-standard reading at the same point, when the standard is
  /// an independent instrument read alongside the UUT (Pattern D thermohygrometer
  /// ref-vs-UUT tables). NULL when the "standard" is the implicit simulator
  /// setting (Pattern B) — that value lives in appliedNominalValue instead.
  referenceValue Decimal? @db.Decimal(18, 6)
  /// Qualitative reading for valueType = BOOLEAN (BSC HEPA/ULPA leak Pass/Fail).
  measuredBool   Boolean?
  /// Literal reading for valueType = TEXT, and the human form of a RATIO
  /// ("1:2.0"). measuredValue still holds the numeric form for RATIO math.
  measuredText   String?
  /// Per-entry unit override (Pattern D "unit chosen per UUT"). NULL = use the
  /// parameter's uom.
  uomId          String?

  // ── Evaluation (computed at entry time, then stored) ─────────────────────
  /// TRUE / FALSE from raw measuredValue vs the effective tolerance.
  /// NULL = "cannot be evaluated automatically" — no computable tolerance
  /// (null bounds AND no parseable "+/- delta" note). Deliberate; judged
  /// holistically by a human at QualityReview (G4). Never a forced guess,
  /// never false-by-default. No manual-override field is added here (decision #6).
  isWithinTolerance     Boolean?
  /// Snapshot of the bounds actually applied, frozen so a later edit to the
  /// master catalog never silently rewrites a submitted reading's verdict.
  effectiveToleranceMin Decimal? @db.Decimal(18, 4)
  effectiveToleranceMax Decimal? @db.Decimal(18, 4)
  /// The nominal/setpoint used to resolve a note-only "+/- delta" tolerance into
  /// concrete bounds (Pattern B: effectiveMin = nominal - delta, etc.). Also the
  /// home for the technician-chosen value in the Pattern D generic-slot case.
  appliedNominalValue   Decimal? @db.Decimal(18, 4)

  // ── Pattern D logger fallback ───────────────────────────────────────────
  /// The attached data-logger export (12-channel thermometer PDF/CSV) backing a
  /// LOGGER_SUMMARY row. Polymorphic-free typed FK to FileObject. A new
  /// FileOwnerType.MEASUREMENT_RESULT value is added alongside (see §3.5).
  attachmentFileObjectId String?

  // ── Provenance ─────────────────────────────────────────────────────────
  /// Who entered the reading. Nullable only to tolerate offline rows that sync
  /// before the actor is resolved; the write path sets it.
  recordedByUserId String?
  note             String?
  recordedAt       DateTime @default(now())
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  calibrationJob CalibrationJob             @relation(fields: [calibrationJobId], references: [id], onDelete: Cascade)
  parameter      DeviceCalibrationParameter @relation(fields: [deviceCalibrationParameterId], references: [id], onDelete: Restrict)
  testPoint      CalibrationTestPoint?      @relation(fields: [calibrationTestPointId], references: [id], onDelete: Restrict)
  uom            Uom?                       @relation(fields: [uomId], references: [id])
  recordedBy     User?                      @relation("MeasurementResultRecordedBy", fields: [recordedByUserId], references: [id])
  attachmentFile FileObject?                @relation("MeasurementResultAttachment", fields: [attachmentFileObjectId], references: [id])

  // Natural key (decision #3) + the direction facet (see §3.4 for the caveat).
  @@unique([calibrationJobId, deviceCalibrationParameterId, calibrationTestPointId, replicateIndex, attemptNumber, direction], name: "measurement_natural_key")
  @@index([calibrationJobId])
  @@index([calibrationJobId, attemptNumber])
  @@index([deviceCalibrationParameterId])
  @@index([calibrationTestPointId])
  @@index([companyId])
  @@index([attachmentFileObjectId])
}
```

### 3.4 Natural key — two review flags

**(a) `direction` is a 6th key component beyond the 5 named in decision #3.**
The locked tuple is `calibrationJobId + deviceCalibrationParameterId + calibrationTestPointId +
replicateIndex + attemptNumber`. Without `direction`, the two readings of a paired up/down ramp at
the same setpoint and replicate (Pattern D `SUCT_VACUUM_GAUGE`; Pattern B `SPHYG_PRESSURE_ACC`
"naik & turun") collide. `direction` is added with a **non-null `NONE` default**, so it never
weakens the constraint for the 95%+ of rows that are not ramps. **Flagging for explicit sign-off**
since it extends the locked key.

**(b) `calibrationTestPointId` is nullable, and Postgres treats NULLs as distinct.**
For Pattern A (test point = NULL), a bare Prisma `@@unique` would *not* stop a duplicate
`(job, param, NULL, 1, 1, NONE)`. Two options, recommend the first:

1. **Hand-write the constraint as `UNIQUE NULLS NOT DISTINCT` in the migration SQL** (Postgres ≥ 15
   — confirm the `pkmdb` server version before Stage 2; local + VPS are both believed ≥ 15). The
   Prisma `@@unique` block stays as the documented intent; the generated migration is edited to add
   `NULLS NOT DISTINCT`.
2. Fallback if the server is < 15: a generated non-null column
   `testPointKey String` = `COALESCE(calibrationTestPointId, '~none~')` and unique on that instead.

### 3.5 Edits to existing models (Prisma back-references — required)

```prisma
// DeviceCalibrationParameter  (add two reverse relations, no semantic change)
  testPoints         CalibrationTestPoint[]
  measurementResults MeasurementResult[]

// CalibrationJob  (add the attempt counter; `results MeasurementResult[]` already exists)
  /// Current revision attempt. Starts at 1. Incremented by exactly 1 in the
  /// SUBMITTED -> REWORK transition service method — the single well-defined
  /// moment (see §6). Never decremented.
  currentAttempt Int @default(1)

// User
  measurementResultsRecorded MeasurementResult[] @relation("MeasurementResultRecordedBy")

// FileObject
  measurementAttachments MeasurementResult[] @relation("MeasurementResultAttachment")

// Uom
  measurementResults MeasurementResult[]

// enum FileOwnerType  (add one value — mirrors the IDENTITY_CORRECTION precedent)
  MEASUREMENT_RESULT
```

### 3.6 Migration notes

- `MeasurementResult` has **0 rows and no runtime** (predecessor report §1.2, §7.2) →
  the migration `DROP COLUMN payloadJson, summaryJson` and adds all new columns with **no
  backfill**. Nothing depends on the old shape.
- One `ALTER TYPE "FileOwnerType" ADD VALUE 'MEASUREMENT_RESULT'` (must be its own migration /
  outside a transaction, per Postgres enum rules — the repo already has this pattern).
- `CalibrationTestPoint` starts empty; its rows are authored by a follow-up seed
  (`seed-calibration-test-points.ts`, Stage 2+) driven off the LK worksheets, **only** for the
  Pattern B / fixed-slot-D parameters.
- `CalibrationJob.currentAttempt Int @default(1)` — the default backfills the 6 trial rows to `1`.
- Recommend a CHECK: `replicateIndex >= 1`, `attemptNumber >= 1`, `CalibrationTestPoint.sequence >= 1`.

---

## 4. Pattern walkthroughs (real catalog codes)

Values below queried from `pkmdb` on 2026-09-07. "Full calibration of that parameter" = the rows
written for one unit, one attempt (`attemptNumber = 1`).

### 4.1 Pattern A — `DUNIT_ILLUMINANCE`

Dental Unit · "Illuminance (Jarak 70 cm)" · `valueType NUMBER` · `toleranceMin 15000`,
`toleranceMax NULL` · `toleranceNote ">15.000 lux"` · `uom LUX` · trials I–V.

**`CalibrationTestPoint`:** *none* — Pattern A has no fixed setting points.

**`MeasurementResult`:** 5 rows.

| replicateIndex | testPointId | direction | measuredValue | appliedNominal | effTolMin / Max | isWithinTolerance |
|---:|---|---|---:|---|---|---|
| 1 | NULL | NONE | 16200 | NULL | 15000 / NULL | true |
| 2 | NULL | NONE | 15980 | NULL | 15000 / NULL | true |
| 3 | NULL | NONE | 16050 | NULL | 15000 / NULL | true |
| 4 | NULL | NONE | 16110 | NULL | 15000 / NULL | true |
| 5 | NULL | NONE | 14920 | NULL | 15000 / NULL | **false** |

All rows: `deviceCalibrationParameterId → DUNIT_ILLUMINANCE`, `entryKind DIRECT_READING`,
`referenceValue NULL` (the lux meter is the implicit standard), `uomId NULL` (inherits LUX).
Evaluation: `measuredValue >= 15000` (lower-bound-only). No aggregate/mean row is stored — the
mean is a display concern computed from the 5 raw rows.

### 4.2 Pattern B — `BSM_SYSTOLIC`

Bed Side Monitor · "Systole" (NIBP) · `valueType NUMBER` · `toleranceMin/Max NULL` ·
`toleranceNote "± 5 mmHg"` · `uom MMHG`. LK Bed Side Monitor's NIBP section sweeps 7 systolic
setpoints (the systole column of the 7 pressure triples in the worksheet). Illustrative setpoints
below — **exact values come from the LK worksheet and are what the test-point seed will encode.**

**`CalibrationTestPoint`:** 7 rows (tolerance override left NULL → inherit "± 5 mmHg" from the
parameter).

| sequence | settingLabel | settingValue | tolerance override |
|---:|---|---:|---|
| 1 | "60 mmHg" | 60 | NULL (inherit) |
| 2 | "80 mmHg" | 80 | NULL |
| 3 | "100 mmHg" | 100 | NULL |
| 4 | "150 mmHg" | 150 | NULL |
| 5 | "200 mmHg" | 200 | NULL |
| 6 | "250 mmHg" | 250 | NULL |
| 7 | "280 mmHg" | 280 | NULL |

**`MeasurementResult`:** one row per test point (LK NIBP has a single measurement column per
setpoint → `replicateIndex = 1`). Example readings:

| testPoint | replicateIndex | direction | measuredValue | appliedNominal | effTolMin / Max | isWithinTolerance |
|---|---:|---|---:|---:|---|---|
| 60 mmHg  | 1 | NONE | 62  | 60  | 55 / 65   | true |
| 80 mmHg  | 1 | NONE | 84  | 80  | 75 / 85   | true |
| 100 mmHg | 1 | NONE | 107 | 100 | 95 / 105  | **false** |
| 150 mmHg | 1 | NONE | 148 | 150 | 145 / 155 | true |
| 200 mmHg | 1 | NONE | 199 | 200 | 195 / 205 | true |
| 250 mmHg | 1 | NONE | 246 | 250 | 245 / 255 | true |
| 280 mmHg | 1 | NONE | 277 | 280 | 275 / 285 | true |

**Note-only tolerance resolution (this is how the 79 note-only rows work):** at entry the service
parses `± 5 mmHg` from `parameter.toleranceNote` → delta = 5; `appliedNominalValue` = the test
point's `settingValue` (60); `effectiveToleranceMin/Max` = 55 / 65 are computed and **stored** on
the row; `isWithinTolerance` = `|measuredValue − 60| ≤ 5`. Master parameter bounds stay NULL — the
concrete window only exists per reading, which is exactly why it is snapshotted onto the row.

(If a `BSM` NIBP worksheet turns out to record I–III replicates per setpoint, the shape is
identical with `replicateIndex` 1–3 → 21 rows; `BPM_*` NIBP does exactly this.)

### 4.3 Pattern C — `DUNIT_HP_SPEED_LOW` / `DUNIT_HP_SPEED_HIGH` and `ACLV_STER_TEMP_121` / `_134`

Pattern C is resolved **at the catalog level** — the variants are already separate
`DeviceCalibrationParameter` rows, each with its own structured bounds. Verified from `pkmdb`:

| code | name | toleranceMin | toleranceMax | toleranceNote |
|---|---|---:|---:|---|
| `DUNIT_HP_SPEED_LOW`  | Kecepatan Putar Handpiece (Low Speed)  | 5000   | 11000 | "5000 rpm-11.000 rpm" |
| `DUNIT_HP_SPEED_HIGH` | Kecepatan Putar Handpiece (High Speed) | 250000 | NULL  | ">250.000 rpm" |
| `ACLV_STER_TEMP_121`  | Suhu Sterilisasi (siklus 121 °C)       | 121    | 124   | "121 °C ~ 124 °C" |
| `ACLV_STER_TEMP_134`  | Suhu Sterilisasi (siklus 134 °C)       | 134    | 137   | "134 °C ~137 °C" |

At the entry model each is **just a Pattern A parameter**:

- `DUNIT_HP_SPEED_LOW` full calibration → `CalibrationTestPoint`: none; `MeasurementResult`: 5 rows
  (trials I–V), `calibrationTestPointId NULL`, `effectiveToleranceMin/Max` = 5000 / 11000,
  `isWithinTolerance` = `5000 ≤ v ≤ 11000`.
- `DUNIT_HP_SPEED_HIGH` full calibration → same, `effectiveToleranceMin/Max` = 250000 / NULL,
  `isWithinTolerance` = `v ≥ 250000`.
- `ACLV_STER_TEMP_121` → 5 rows, bounds 121 / 124. `ACLV_STER_TEMP_134` → 5 rows, bounds 134 / 137.
  (These may instead be Pattern B if the autoclave worksheet sweeps chamber setpoints — same shape,
  a handful of test points.)

**No special entry-model handling for Pattern C.** See §5 for the full confirmation.

### 4.4 Pattern D — four sub-shapes

#### 4.4a Spatial/temporal uniformity via external logger — `BBR_STORAGE_TEMP`

Blood Bank Refrigerator · "Keseragaman Suhu Penyimpanan (multi-titik T1–T9, 2–8 °C)" ·
`toleranceMin 2`, `toleranceMax 8` · `toleranceNote "Setting suhu 2 ˚C - 8 ˚C; Variasi suhu = 1°C
~ 9°C"` · `uom DEG_C`. The real grid (9 sensors × 30 timepoints) lives in an attached 12-channel
logger export and is never typed in.

**`CalibrationTestPoint`:** *none*.

**`MeasurementResult`:** 2 summary rows (`entryKind LOGGER_SUMMARY`), plus the attachment.

| replicateIndex | note | measuredValue | effTolMin / Max | isWithinTolerance | attachmentFileObjectId |
|---:|---|---:|---|---|---|
| 1 | "min across all sensors/timepoints" | 3.1 | 2 / 8 | true | `<logger-export.pdf>` |
| 2 | "max across all sensors/timepoints" | 7.6 | 2 / 8 | true | `<logger-export.pdf>` |

Job-level verdict = AND of the summary rows. `attachmentFileObjectId` uses the new
`FileOwnerType.MEASUREMENT_RESULT`. (Alternative single-row shape — `measuredValue` = observed
spread against a spread limit — is equally supported; the min/max pair is recommended because it
maps cleanly to the 2–8 band and to the Excel export.) The same shape covers `KVAK_STORAGE_TEMP`,
`CCHAIN_STORAGE_TEMP`, `MREF_STORAGE_TEMP`, `MFRZ_STORAGE_TEMP`, `OVEN_TEMP`, `STER_TEMP`,
`CRFR_STORAGE_TEMP`, `PLT_STORAGE_TEMP`.

#### 4.4b Paired up/down ramp, technician-chosen setpoints — `SUCT_VACUUM_GAUGE`

Suction Pump · "Akurasi Vacuum Gauge" · `toleranceMin/Max NULL` · `toleranceNote "± 10%"` ·
`uom MMHG`. LK: rows 1–6 where the technician picks the vacuum setting per unit; each row has
"Pengukuran 1 / 2 / 3", each split into "Naik | Turun".

**`CalibrationTestPoint`:** 6 **generic ordinal** rows — `settingValue NULL`, label "Titik ukur N".
These are unit-agnostic protocol slots; the actual mmHg is chosen on-site and recorded per reading.

| sequence | settingLabel | settingValue |
|---:|---|---|
| 1 | "Titik ukur 1 (dipilih teknisi)" | NULL |
| … | … | NULL |
| 6 | "Titik ukur 6 (dipilih teknisi)" | NULL |

**`MeasurementResult`:** 6 slots × 3 replicates × 2 directions = **36 rows**. Example for slot 1
(technician chose 100 mmHg):

| testPoint | replicateIndex | direction | measuredValue | appliedNominal | effTolMin / Max | isWithinTolerance |
|---|---:|---|---:|---:|---|---|
| Titik ukur 1 | 1 | UP   | 103 | 100 | 90 / 110 | true |
| Titik ukur 1 | 1 | DOWN | 108 | 100 | 90 / 110 | true |
| Titik ukur 1 | 2 | UP   | 101 | 100 | 90 / 110 | true |
| Titik ukur 1 | 2 | DOWN | 112 | 100 | 90 / 110 | **false** |
| Titik ukur 1 | 3 | UP   | 99  | 100 | 90 / 110 | true |
| Titik ukur 1 | 3 | DOWN | 107 | 100 | 90 / 110 | true |

`appliedNominalValue` = the chosen setpoint (100); delta parsed from `"± 10%"` → ±10 mmHg;
`direction` distinguishes the Naik / Turun reading and is what keeps the natural key unique.
`uomId` may be set per row if the unit differs per UUT.

#### 4.4c Qualitative pass/fail — `BSC_HEPA_LEAK`

Bio Safety Cabinet · "Pengukuran Kebocoran Hepa / Ulpa Filter" · `valueType BOOLEAN` ·
`toleranceNote "Pass / Fail"` · `uom NULL`.

**`CalibrationTestPoint`:** *none*.

**`MeasurementResult`:** 1 row — `measuredBool = true`, `measuredValue NULL`, `measuredText NULL`,
`effectiveToleranceMin/Max NULL`, `isWithinTolerance = measuredBool` (i.e. `true` = pass). For
BOOLEAN parameters `isWithinTolerance` simply mirrors `measuredBool`; it is never NULL for a
recorded BOOLEAN reading.

#### 4.4d Ratio — `VENT_IE_RATIO`

Ventilator · "Pengukuran I : E Ratio" · `valueType RATIO` · `toleranceNote "± 10 %"` · `uom NULL` ·
`decimalPlaces NULL`.

**`CalibrationTestPoint`:** typically none (or a small sweep of I:E settings → same as Pattern B).

**`MeasurementResult`:** one row per setting/replicate — `measuredText = "1:2.1"` (human form),
`measuredValue = 0.476` (numeric form for math), `appliedNominalValue = 0.5` (declared 1:2),
delta from `"± 10 %"` → `effectiveToleranceMin/Max` = 0.45 / 0.55, `isWithinTolerance =
0.45 ≤ 0.476 ≤ 0.55` → true.

#### 4.4e Paired reference-vs-UUT (not in the 489 today — design validation only)

Thermohygrometer is excluded from the current catalog. When added, its ref-vs-UUT tables map to:
`measuredValue` = UUT reading, `referenceValue` = the standard's reading at the same point,
`direction` = UP/DOWN for the humidity naik/turun sweep, test points = the climatic-chamber
setpoints. **No schema change needed** — `referenceValue` + `direction` already cover it.

---

## 5. Confirmation — Pattern C needs no entry-model handling (verified against the 8 split rows)

The 2026-08-27 `fix-collapsed-pattern-c-parameters.ts` deleted 7 collapsed rows and inserted 15
correctly-split replacements (net +8). Checked each against `pkmdb`:

| Split parent | Resulting rows | Each row's bounds | Self-contained? |
|---|---|---|---|
| `ACLV_CHAMBER_TEMP` | `_DT1` / `_DT2` / `_DT3` | pm(2) / pm(5) / pm(2) | yes — 3 Pattern-A params (derived ΔT) |
| `ACLV_STER_TEMP` | `_121` / `_134` | range(121,124) / range(134,137) | yes |
| `ACLV_STER_TIME` | `_121` / `_134` | minOnly(15) / minOnly(3) | yes |
| `BSC_LIGHT_INTENSITY` | `_ON` / `_OFF` | minOnly(450) / maxOnly(160) | yes |
| `BSC_SOUND_LEVEL` | `_ON` / `_OFF` | maxOnly(70) / maxOnly(60) | yes |
| `LAF_SOUND_LEVEL` | `_BACKGROUND` / `_COMPARTMENT` | maxOnly(55) / maxOnly(65) | yes |
| `DXRAY_HVL` | `_70KV` / `_80KV` | minOnly(1.5) / minOnly(2.3) | yes |

Plus the two already-correct splits confirmed by the classification doc: `DUNIT_HP_SPEED_LOW/HIGH`
(§4.3) and `DXRAY_COLLIMATION_LENGTH/DIAMETER`.

**Every split row is a plain `DeviceCalibrationParameter` with its own `toleranceMin/Max/Note`.**
At the entry model each behaves exactly like Pattern A (or Pattern B if it has a setpoint sweep):
`MeasurementResult` rows point at the parameter, `calibrationTestPointId` is NULL (or a handful of
inherit-tolerance test points), and `effectiveToleranceMin/Max` snapshot the parameter's own
bounds. **No discriminator, no variant column, no special case in the write path.**

**Why the `CalibrationTestPoint` tolerance-override fields still earn their place:** two catalog
rows were deliberately *not* split and remain multi-tolerance —

- `SUCT_MAX_VACUUM` — Low `<150` / Medium `150–450` / High `>450` mmHg, `toleranceNote` carries all
  three + *"isi salah satu sesuai dengan UUT"* (one class applies per unit). `toleranceMin/Max NULL`.
- `INCU_AIR_TEMP` — two tolerance classes in one row (`± 1.5 °C` for TM/T5, `± 0.8 °C` for T1–T4
  relative to the running mean).

Rather than force these into more `DeviceCalibrationParameter` rows, Stage 2+ can attach
`CalibrationTestPoint` children with per-point `toleranceMin/Max` set (override, not inherit).
Same mechanism absorbs any future per-analyte analyzer lists (C10/C11) without exploding the
parameter count. This is the only reason the override columns exist; **nothing in the current 489
requires them at launch.**

---

## 6. `attemptNumber` — exact placement and semantics (decision #4)

**Recommendation: put it in BOTH places, with distinct roles.**

| Field | Where | Role |
|---|---|---|
| `attemptNumber` | `MeasurementResult` (required `Int`) | Per-row stamp. **Forced by decision #3** — the natural/sync key names `attemptNumber` explicitly, so it must physically be on the row (an offline client keys rows locally without joining to the job). Also lets "attempt 1's readings" stay queryable forever after the job has moved on. |
| `currentAttempt` | `CalibrationJob` (`Int @default(1)`) | The counter and the **single well-defined increment moment**. |

**Why not only on `CalibrationJob`:** the key needs it on the row; and if rows were only
"implicitly whatever was current when written", you could never re-open a superseded attempt's data
without ambiguity, and the offline sync key would be incomplete.

**Why not only on `MeasurementResult`:** you need one authoritative place that says "the next
reading belongs to attempt N", and one transition that bumps it, or two technicians (or two offline
devices) re-measuring after a REWORK could disagree on the number.

**The increment moment (well-defined):** in the `SUBMITTED → REWORK` service transition (Stage 2
work, not built yet):

```
job.status:         SUBMITTED  -> IN_PROGRESS   (technician resumes)
job.currentAttempt: N          -> N + 1         (atomic, same tx)
```

New readings are written with `attemptNumber = job.currentAttempt` (= N+1). The attempt-N rows now
satisfy `attemptNumber < job.currentAttempt` and are **permanently frozen** (§7). They are never
edited or deleted (decision #4). `currentAttempt` is never decremented.

**Audit of when attempt N was submitted / bounced:** already covered without a new table —
`QualityReview` rows accumulate per job (`calibrationJobId` is deliberately *not* unique in the
live schema), so each REWORK is preceded by a `QualityReview` with `decision REJECT` +
`reviewedAt`. `CalibrationJob.submittedAt` continues to hold the most-recent submission time. If
per-attempt submission timestamps are later wanted as first-class data, that is a small additive
follow-up (`CalibrationJobAttempt` history table) and does not change this design — flagged, not
built.

---

## 7. "Locked after submit" enforcement (decision #5)

### 7.1 Recommendation — service-layer guard, primary and sufficient

Add to `calibration-jobs.service.ts`, next to the existing locked-state sets:

```ts
// Mirrors IDENTITY_LOCKED_JOB_STATUSES / REFERENCE_EQUIPMENT_LOCKED_JOB_STATUSES.
const MEASUREMENT_LOCKED_JOB_STATUSES = new Set<string>(["SUBMITTED", "ACCEPTED_BY_QA"]);

/**
 * A MeasurementResult row is immutable when EITHER:
 *  - it belongs to a superseded attempt (row.attemptNumber < job.currentAttempt), OR
 *  - the job's current attempt has been submitted (status in the locked set).
 * Role-independent — no bypass, including TECHNICIAN_MANAGER (decision #5).
 */
function assertMeasurementRowEditable(
  job: { status: string; currentAttempt: number; submittedAt: Date | null },
  row: { attemptNumber: number },
): void {
  if (row.attemptNumber < job.currentAttempt) {
    throw new BadRequestException({
      message: "This reading belongs to a superseded attempt and is immutable",
      code: "MEASUREMENT_ATTEMPT_SUPERSEDED",
      attemptNumber: row.attemptNumber,
      currentAttempt: job.currentAttempt,
    });
  }
  if (MEASUREMENT_LOCKED_JOB_STATUSES.has(job.status) || job.submittedAt !== null) {
    throw new BadRequestException({
      message: "Measurements are locked once the job attempt has been submitted",
      code: "MEASUREMENT_JOB_SUBMITTED",
      status: job.status,
    });
  }
}
```

Called at the top of **every** create / update / delete method for `MeasurementResult` (and any
bulk endpoint), after loading the job. Creation also requires `job.startedAt !== null` and
`job.status IN (IN_PROGRESS)` — reuse the existing `CALIBRATION_JOB_NOT_STARTED` guard.

Note the guard checks **both** `status ∈ {SUBMITTED, ACCEPTED_BY_QA}` **and** `submittedAt !== null`
— redundant by design, so the lock holds even if a future status is added or the REWORK path leaves
`submittedAt` populated. Decision #5's trigger ("the instant `submittedAt` is set") is honoured
literally by the second clause.

### 7.2 Why not a DB trigger / constraint (for now)

- The immutability boundary depends on **another row** (`CalibrationJob.status` / `currentAttempt`),
  which a `CHECK` constraint cannot see. Only a trigger could.
- The codebase currently has **zero triggers**; every locked-state rule (`IdentityCorrection`
  post-decision, `JobReferenceEquipmentUsed` post-submit, the AKD/AKL gate, WorkOrder status
  transitions) is enforced purely in the service layer with the exact `Set<string>` + `assert…()`
  pattern shown above. A trigger here would be an inconsistent one-off with its own migration,
  test, and operational surface.
- `MeasurementResult` has a single write path (the technician-app API); there is no second ingest
  route to worry about.

### 7.3 Optional future hardening (not Stage 2 scope)

If an auditor later requires a database-level guarantee, add a `BEFORE UPDATE OR DELETE` trigger on
`MeasurementResult` that re-derives the same predicate and raises. Recommended only if/when a
second write path (bulk import, data-fix script) appears. Flag, don't build.

### 7.4 Reference pattern checked

`IdentityCorrection` immutability is enforced exactly this way in
`calibration-jobs.service.ts`: `decideIdentityCorrection` rejects when
`correction.status !== "PENDING_REVIEW"` (`"Identity correction is already ${status}"`), and
`assertIdentityGateOpen(job.status)` blocks identity actions once `job.status ∈ {SUBMITTED,
ACCEPTED_BY_QA}` (`IDENTITY_LOCKED_JOB_STATUSES`). There is no separate "edit" endpoint for a
decided correction and no DB trigger — the service guard is the whole mechanism. The
`MeasurementResult` design copies this precedent.

---

## 8. `isWithinTolerance` semantics (decision #6) and Excel export (decisions #8–#9)

### 8.1 `isWithinTolerance`

- Computed from **raw `measuredValue`** only, never from a rounded/display value (locked rule).
- Effective tolerance = `testPoint.toleranceMin/Max` if the test point overrides, else
  `parameter.toleranceMin/Max`, else parse `parameter.toleranceNote` for a `± delta` /
  `≤ x` / `≥ x` pattern and combine with `appliedNominalValue`.
- **NULL** when none of the above yields a computable bound — the 1 fully-blank row
  (`INCU_RECOVERY_TIME`: no bounds, no note) and any note-only row whose note does not parse. NULL
  means "cannot be evaluated automatically", to be judged holistically by a human at QualityReview
  (G4). It is **never** `false` by default and **never** a guess.
- **No manual-override / manual-verdict field is added to `MeasurementResult`** (decision #6) — the
  holistic human judgement lives at QualityReview, which is out of scope here.
- `effectiveToleranceMin/Max` + `appliedNominalValue` are snapshotted onto the row so a later
  master-catalog edit never silently changes a submitted reading's verdict.

### 8.2 Excel export — nothing in this schema blocks it

Confirmed. Typed columns replace the JSON blob, so a structured export is a straight projection:
one sheet grouping `MeasurementResult` by `parameter.sortOrder` then `testPoint.sequence` then
`replicateIndex` / `direction`, columns for `measuredValue`, `referenceValue`,
`effectiveToleranceMin/Max`, `isWithinTolerance`, `note`, with `LOGGER_SUMMARY` rows rendered as a
sub-block linking the attachment. `entryKind` and `direction` exist specifically to make that
grouping clean. The export feature itself is **not designed here** (deferred, §9).

**Verification marker (decision #9):** the exporting user's name + timestamp should be **computed
at export time from the session**, not stored on `MeasurementResult`. Reasoning: it is a property
of *a download event*, not of the measurement data; multiple exports of the same job are normal
(draft review, re-issue) and each wants its own marker; storing "last exported by" on measurement
rows would be misleading audit data. **If** an audit trail of every export is later required, that
belongs in a dedicated `MeasurementExportLog` (job-scoped, append-only) — a separate follow-up,
not a field here. Flag, don't build.

---

## 9. Deferred / open items (each with why)

| Item | Status in this design | Why deferred / out of scope |
|---|---|---|
| **G4 — QualityReview scoring structure** ("Telaah Teknis" weighted categories, the `LK Kelistrikan` categorical outlier) | Untouched. `QualityReview` stays `decision` + `status` + free-text `notes`. | Separate model, separate design discussion. `MeasurementResult` feeds it (raw rows + NULL `isWithinTolerance` cases) but does not shape it. Building a scoring model now would couple two independent designs. |
| **H1 — NIBP tolerance ±5 vs ±8 mmHg** | Not resolved. Design stores whatever `toleranceNote` says (`± 5 mmHg` today) and snapshots the resolved bound per reading. | Master-data correctness question, not structural. Can be fixed by a one-line `toleranceNote` update on `BSM_*` / `BPM_*` / `PM_*` independently, any time, without touching this schema. |
| **H2 / the 79 note-only rows / `INCU_RECOVERY_TIME` blank row** | Handled by mechanism, not by fixing the data: note-only `± delta` rows resolve to concrete `effectiveToleranceMin/Max` per reading via `appliedNominalValue` (§4.2); truly unparseable rows get `isWithinTolerance = NULL` (§8.1). | Per decision #6, NULL is the correct deliberate state. Parsing-rule coverage and the missing `INCU_RECOVERY_TIME` limit (H2) are master-data / parser work, tracked separately. |
| **D1 — no `CANCELLED` `CalibrationJobStatus`** | Unrelated; enum untouched. | Job-lifecycle concern, not measurement capture. |
| **Full offline-sync** (local storage, service worker, conflict resolution, sync UI) | Only the **natural-key skeleton** is in scope: the `measurement_natural_key` unique tuple lets a future client identify a row without server auto-increment ordering. No sync engine, no client cache, no merge logic. | Explicitly deferred by decision #3. Designing the sync engine now would be speculative before the online entry path exists. |
| **Excel export feature** | Confirmed non-blocked (§8.2). Not designed. | Deferred to a follow-up task per decision #8. |
| **AI-assisted QualityReview** | Noted as a future idea only. | Depends on G4 and on a corpus of completed reviews that does not exist yet. |
| **`decimalPlaces` backfill** | Named blocking prerequisite (§2). Not performed here. | Separate scope (decision #7). The entry UI is not trustworthy until it lands, but the schema is designed correctly against the assumption that it will. |
| **`CalibrationTestPoint` seed** (Pattern B / fixed-slot-D rows from the LK worksheets) | Model defined; rows not authored. | Stage 2+ — needs a worksheet-by-worksheet pass to enumerate setpoints. |
| **Per-attempt submission-timestamp history** (`CalibrationJobAttempt`) | Not added. `QualityReview` rows + `CalibrationJob.submittedAt` cover the audit need today. | Additive follow-up if first-class per-attempt timestamps are later required (§6). |
| **`MeasurementExportLog`** (audit trail of every Excel download) | Not added. Marker computed at export time (§8.2). | Additive follow-up only if an export audit trail is required. |

---

## 10. HARD STOP

No migration was run. No application or schema file was modified. The Prisma blocks in §3 are a
proposal for review. Await approval before Stage 2 implementation.
