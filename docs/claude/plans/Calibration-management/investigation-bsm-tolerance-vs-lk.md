# Verification: BSM DeviceCalibrationParameter/CalibrationTestPoint vs Real LK Worksheet

**Scope:** DeviceType = Bed Side Monitor (BSM) only. Read-only verification — no schema, code,
seed, or migration files were modified as part of this task.

## Source Document Check

The source document was located as an attachment to this task, `LK Bed Side Monitor.pdf`
(3 pages, formulir code F.MT.LK.01.3, edisi 01/01, 13-01-2025). It was read directly in full
(all sections, all tables) rather than assumed from a file path.

Independent reading, section by section:

- **Section B — Kondisi Lingkungan:** Suhu 25 ± 5 °C; Kelembaban/RH 55% ± 20% RH; Tegangan Input
  L-N 220 ± 10% Volt.
- **Section D — Keselamatan Listrik:** Resistansi Pembumian Protektif ≤ 0,3 Ω; Resistansi
  Isolasi > 2 MΩ; Arus Bocor Peralatan — Kelas I ≤ 500 µA, Kelas II ≤ 100 µA; Arus Bocor Bagian
  yang Diaplikasikan ≤ 50 µA.
- **Section E.1 — Heart Rate:** setpoints 30, 60, 120, 180 BPM; tolerance ± 5 bpm; 5 replicates
  (kolom I–V).
- **Section E.2 — Respirasi:** setpoints 15, 30, 60, 120 BrPM; tolerance ± 3 BrPM; 5 replicates.
- **Section E.3 — Saturasi Oxygen (SPO2):** setpoints, in document row order: 98, 93, 92, 85, 90,
  70, 88 — **exactly 7 rows**, no repeated value; tolerance ± 3% SPO2; 5 replicates.
- **Section E.4 — NIBP:** 7 setpoint groups (Systole/Mean/Diastole per group): 120/93/80,
  150/116/100, 200/166/150, 250/215/195, 60/40/30, 80/60/50, 100/76/65; tolerance ± 5 mmHg;
  5 replicates. Explicit note: measured at Heart Rate 65 BPM for all groups except the
  250/215/195 group, which uses Heart Rate 90 BPM.

**Comparison against the task's ground-truth table:** every value above matches the ground-truth
table given in the task exactly — no discrepancy found in numbers, units, ± framing, Kelas I/II
split, or point counts. In particular, this independent reading confirms the ground-truth
transcription is accurate, and confirms the real LK source document has **7** SPO2 points (98,
93, 92, 85, 90, 70, 88), not 8, and no duplicate 90.

## Live Schema Fields

From `packages/db/prisma/schema.prisma`, read directly:

**`DeviceCalibrationParameter`** (lines 1402–1498), tolerance/threshold-relevant fields:

```prisma
model DeviceCalibrationParameter {
  id                     String                         @id @default(cuid())
  deviceTypeId           String
  capabilityItemId       String
  code                   String
  name                   String
  description            String?
  valueType              CalibrationValueType           @default(NUMBER)
  uomId                  String?
  toleranceMin           Decimal?                       @db.Decimal(18, 4)
  toleranceMax           Decimal?                       @db.Decimal(18, 4)
  toleranceMinInclusive  Boolean                        @default(true)
  toleranceMaxInclusive  Boolean                        @default(true)
  toleranceNote          String?
  decimalPlaces          Int?
  sortOrder              Int                            @default(0)
  isActive               Boolean                        @default(true)
  entryStyle             CalibrationParameterEntryStyle @default(DIRECT_REPLICATES)
  allowsRepeatedReadings Boolean                        @default(true)
  logicalTestKey         String?
  logicalTestSequence    Int?
  derivation             Json?
  createdAt              DateTime                       @default(now())
  updatedAt              DateTime                       @updatedAt

  deviceType     DeviceType           @relation(fields: [deviceTypeId], references: [id])
  capabilityItem DeviceCapabilityItem @relation(fields: [capabilityItemId], references: [id])
  uom            Uom?                 @relation(fields: [uomId], references: [id])

  testPoints         CalibrationTestPoint[]
  measurementResults MeasurementResult[]
  jobTestPoints      JobCalibrationTestPoint[]

  @@unique([deviceTypeId, capabilityItemId, code])
  @@unique([deviceTypeId, logicalTestKey, logicalTestSequence])
  @@index([deviceTypeId])
  @@index([capabilityItemId])
  @@index([uomId])
  @@index([isActive])
  @@index([deviceTypeId, logicalTestKey])
}
```

**`CalibrationTestPoint`** (lines 2538–2574), setpoint-relevant fields:

```prisma
model CalibrationTestPoint {
  id                           String @id @default(cuid())
  deviceCalibrationParameterId String

  sequence     Int
  settingLabel String
  settingValue Decimal? @db.Decimal(18, 4)

  toleranceMin           Decimal? @db.Decimal(18, 4)
  toleranceMax           Decimal? @db.Decimal(18, 4)
  toleranceMinInclusive  Boolean  @default(true)
  toleranceMaxInclusive  Boolean  @default(true)
  toleranceNote          String?

  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  parameter          DeviceCalibrationParameter @relation(fields: [deviceCalibrationParameterId], references: [id], onDelete: Cascade)
  measurementResults MeasurementResult[]
  jobSnapshots       JobCalibrationTestPoint[]

  @@unique([deviceCalibrationParameterId, sequence])
  @@unique([deviceCalibrationParameterId, settingLabel])
  @@index([deviceCalibrationParameterId])
}
```

Notes on the model: there is no dedicated field for a two-tier threshold (e.g. "Kelas I / Kelas
II"); such splits can only be encoded as free text in `toleranceNote`, with `toleranceMin`/
`toleranceMax` holding one representative numeric bound. There is also no explicit
"replicate count" field on either model — the LK worksheet's 5 replicate columns (I–V) are not
stored as a count anywhere in these two tables (this is a pre-existing modeling characteristic,
not something introduced or changed here).

## Current BSM Data in DB (raw)

Queried directly against local `pkmdb` via `./scripts/sql/psql.ps1` (read-only `SELECT`
statements only, joined through `DeviceType.code = 'BED_SIDE_MONITOR'`).

### `DeviceCalibrationParameter` rows (13 total)

| code | name | valueType | uom | toleranceMin | toleranceMax | Min incl. | Max incl. | toleranceNote | decimalPlaces | isActive |
|---|---|---|---|---|---|---|---|---|---|---|
| BSM_EARTH_RESISTANCE | Resistansi Pembumian Protektif | NUMBER | OHM | — | 0.3000 | t | t | ≤ 0,3 Ω | 3 | t |
| BSM_HEART_RATE | Heart Rate | NUMBER | BPM | -5.0000 | 5.0000 | t | t | ± 5 bpm | 0 | t |
| BSM_ROOM_TEMP | Suhu Ruangan | NUMBER | DEG_C | 20.0000 | 30.0000 | t | t | 25 ± 5 °C | 1 | t |
| BSM_SYSTOLIC | Systole | NUMBER | MMHG | -5.0000 | 5.0000 | t | t | ± 5 mmHg | 0 | t |
| BSM_INSULATION_RESISTANCE | Resistansi Isolasi | NUMBER | MOHM | 2.0000 | — | f | t | > 2 MΩ | 0 | t |
| BSM_MAP | Mean | NUMBER | MMHG | -5.0000 | 5.0000 | t | t | ± 5 mmHg | 0 | t |
| BSM_RESP_RATE | Respirasi | NUMBER | RPM | — | — | t | t | ± 3 BrPM | 0 | t |
| BSM_ROOM_HUMIDITY | Kelembaban / RH | NUMBER | PERCENT | 35.0000 | 75.0000 | t | t | 55 % ± 20 % RH | 0 | t |
| BSM_DIASTOLIC | Diastole | NUMBER | MMHG | -5.0000 | 5.0000 | t | t | ± 5 mmHg | 0 | t |
| BSM_EQUIP_LEAKAGE | Arus Bocor Peralatan | NUMBER | UA | — | 500.0000 | t | t | Kelas I ≤ 500 µA / Kelas II ≤ 100 µA | 1 | t |
| BSM_INPUT_VOLTAGE | Tegangan Input | NUMBER | V | — | — | t | t | 220 ± 10% Volt | 1 | t |
| BSM_SPO2 | Saturasi Oxygen (SPO2) | NUMBER | SPO2 | — | — | t | t | ± 3 % SPO2 | 0 | t |
| BSM_APPLIED_LEAKAGE | Arus Bocor Bagian yang Diaplikasikan | NUMBER | UA | — | 50.0000 | t | t | ≤ 50 µA | 1 | t |

### `CalibrationTestPoint` rows (44 total)

| parameter_code | sequence | settingLabel | settingValue | isActive |
|---|---|---|---|---|
| BSM_DIASTOLIC | 1–7 | 80, 100, 150, 195, 30, 50, 65 mmHg | (matching) | t (all) |
| BSM_HEART_RATE | 1–4 | 30, 60, 120, 180 BPM | (matching) | t (all) |
| BSM_INPUT_VOLTAGE | 1–3 | L-N (tol. 198.0000–242.0000), L-G, N-G | — | t (all) |
| BSM_MAP | 1–7 | 93, 116, 166, 215, 40, 60, 76 mmHg | (matching) | t (all) |
| BSM_RESP_RATE | 1–4 | 15, 30, 60, 120 BrPM | (matching) | t (all) |
| BSM_ROOM_HUMIDITY | 1–2 | Awal, Akhir | — | t (all) |
| BSM_ROOM_TEMP | 1–2 | Akhir, Awal | — | t (all) |
| **BSM_SPO2** | **1–8** | 98, 93, 92, 85, "90 %SpO2 (titik 5)", 70, 88, "90 %SpO2 (titik 8)" | 98,93,92,85,90,70,88,90 | **t,t,t,t,t,t,t, FALSE (seq 8)** |
| BSM_SYSTOLIC | 1–7 | 120, 150, 200, 250, 60, 80, 100 mmHg | (matching) | t (all) |

(Full raw psql output retained in session; table above is the complete row set, condensed for
rows with straightforward matching setpoint sequences.)

## Comparison — Parameter by Parameter

| LK Parameter | Verdict | Detail |
|---|---|---|
| Suhu (Temperature) | **MATCH** | `BSM_ROOM_TEMP`: toleranceMin 20, toleranceMax 30, note "25 ± 5 °C" = 25±5°C. Correct. |
| Kelembaban / RH | **MATCH** | `BSM_ROOM_HUMIDITY`: toleranceMin 35, toleranceMax 75, note "55 % ± 20 % RH" = 55±20%. Correct. |
| Tegangan Input (L-N) | **MATCH** | `BSM_INPUT_VOLTAGE` note "220 ± 10% Volt"; the L-N test point itself carries toleranceMin 198.0000 / toleranceMax 242.0000, i.e. 220±10% = 198–242. Correct. |
| Resistansi Pembumian Protektif | **MATCH** | `BSM_EARTH_RESISTANCE`: toleranceMax 0.3, note "≤ 0,3 Ω". Correct. |
| Resistansi Isolasi | **MATCH** | `BSM_INSULATION_RESISTANCE`: toleranceMin 2.0 (exclusive, `toleranceMinInclusive = f`), note "> 2 MΩ". Correct — strict `>` matches the LK's `>` (not `≥`). |
| Arus Bocor Peralatan (Kelas I & II) | **MATCH (as text note; numeric field only carries one tier)** | `BSM_EQUIP_LEAKAGE`: toleranceMax 500.0000, note "Kelas I ≤ 500 µA / Kelas II ≤ 100 µA". The Kelas I bound (500 µA) is the one captured numerically; the Kelas II bound (100 µA) exists only as text in `toleranceNote`, not as a second numeric field — this is a schema-shape limitation (no dual-tier column exists), not a value error. Both numbers are present and correct in the note. |
| Arus Bocor Bagian yang Diaplikasikan | **MATCH** | `BSM_APPLIED_LEAKAGE`: toleranceMax 50.0000, note "≤ 50 µA". Correct. |
| Heart Rate | **MATCH** | `BSM_HEART_RATE` tolerance ± 5 (note "± 5 bpm"); test points 30/60/120/180 BPM, sequence 1–4. Correct. |
| Respirasi | **MATCH** | `BSM_RESP_RATE` note "± 3 BrPM"; test points 15/30/60/120 BrPM, sequence 1–4. Correct. (Parameter-level toleranceMin/Max are NULL — the ±3 value lives only in the text note here, unlike Heart Rate which has numeric -5/5. Inconsistent field usage across parameters, but the stated tolerance text itself is correct.) |
| SpO2 | **MISMATCH (point count)** | See dedicated section below. |
| NIBP — Systole | **MATCH** | `BSM_SYSTOLIC` tolerance -5/5 (note "± 5 mmHg"); test points 120/150/200/250/60/80/100 mmHg, sequence 1–7, matching LK order and values. Correct. |
| NIBP — Mean | **MATCH** | `BSM_MAP` tolerance -5/5; test points 93/116/166/215/40/60/76 mmHg, sequence 1–7. Correct. |
| NIBP — Diastole | **MATCH** | `BSM_DIASTOLIC` tolerance -5/5; test points 80/100/150/195/30/50/65 mmHg, sequence 1–7. Correct. |

Every parameter above is **MATCH** except SpO2, which has a point-count discrepancy detailed
next. No parameter was **NOT FOUND** — all 13 catalog rows resolve to a plausible LK section.

## SpO2 Point-Count Finding (7 vs 8)

**Current DB state:** `BSM_SPO2` has **8** `CalibrationTestPoint` rows (sequence 1–8):

| sequence | settingLabel | settingValue | isActive |
|---|---|---|---|
| 1 | 98 %SpO2 | 98 | true |
| 2 | 93 %SpO2 | 93 | true |
| 3 | 92 %SpO2 | 92 | true |
| 4 | 85 %SpO2 | 85 | true |
| 5 | 90 %SpO2 (titik 5) | 90 | true |
| 6 | 70 %SpO2 | 70 | true |
| 7 | 88 %SpO2 | 88 | true |
| 8 | 90 %SpO2 (titik 8) | 90 | **false** |

So there are 8 rows on record, but only **7 are currently active** (sequence 8 has
`isActive = false`) — the set of *active* points (98, 93, 92, 85, 90, 70, 88) exactly matches the
LK PDF's 7 points, in the same order. The 8th row (a duplicate 90, "titik 8") exists in the table
but is soft-deactivated.

**Source-code seed definition:** `packages/db/prisma/seed-calibration-test-points.ts:132–144`
still defines all 8 points in its `testPoints` array (`[98, 93, 92, 85, 90, 70, 88, 90]`), with an
inline comment dated 2026-09-08 stating that a *different* document —
`measurement-results/Bed Side Monitor.xlsx` (a filled measurement-results workbook, not the blank
LK template PDF used as this task's ground truth) — was observed to contain 8 rows with 90
appearing twice, "same shape as PULSEOX_SPO2" (a different DeviceType, Pulse Oximeter). The seed
script itself does not show an explicit `isActive: false` override for the 8th point in the
excerpt read; the live DB's `isActive = false` on sequence 8 was not traced to a specific script
in this task (not investigated further — out of scope for a read-only check).

**Corroborating history:** `docs/claude/plans/Calibration-management/measurement-results/UI-implementation/forensic-verification/02-bed-side-monitor-mapping.md:84` records BSM_SPO2 as
7 points (98/93/92/85/90/70/88) with no duplicate — i.e. an earlier forensic-verification pass
also concluded 7 points, matching the LK PDF and the currently-active DB rows. Git log on the
seed file shows the 8-point definition was introduced later than the original 7-point extraction,
via a commit citing the filled Excel workbook as evidence for adding the trailing duplicate 90.

**Summary of the finding (per task's request — reporting only, no decision made here):**
- LK worksheet (this task's designated ground truth): **7 points**, no duplicate.
- DB active rows: **7 points**, no duplicate — matches the LK.
- DB total rows (including inactive): **8**, with row 8 (duplicate 90, "titik 8") present but
  deactivated.
- The 8th point's justification traces to a different source document (a filled
  measurement-results Excel file) than the LK PDF, and remains **unconfirmed against the LK
  worksheet** used as ground truth in this task.
- Whether the inactive 8th row should be deleted, kept inactive, or reactivated is **not decided
  here** — flagged for a separate decision.

## Notes / Anomalies

- **Inconsistent tolerance-field usage within BSM itself:** some parameters store their ± bound
  numerically in `toleranceMin`/`toleranceMax` (e.g. `BSM_HEART_RATE`: -5/5, `BSM_SYSTOLIC`,
  `BSM_MAP`, `BSM_DIASTOLIC`), while others leave those fields NULL and rely solely on the text
  `toleranceNote` (e.g. `BSM_RESP_RATE`, `BSM_INPUT_VOLTAGE`, `BSM_SPO2`). All the *values* are
  correct per the LK either way, but the storage pattern is not uniform across BSM's own
  parameter set. Reporting as observed; not a value mismatch, and no fix attempted here per task
  scope.
- **BSM_INPUT_VOLTAGE** has no parameter-level `toleranceMin`/`toleranceMax` (both NULL), but its
  child test point "L-N" carries the numeric 198.0000–242.0000 bound directly — consistent with
  the model's documented per-point tolerance-override mechanism, and the LK's tolerance value
  (220±10%) is captured correctly at that level.
- **BSM_EQUIP_LEAKAGE** two-tier Kelas I/II threshold is fully captured as text but only
  partially as structured data (Kelas I numeric, Kelas II text-only) — a pre-existing schema
  shape limitation, noted for awareness, not flagged as a value error.
- No parameters or test points outside BSM were queried or touched, per task scope.

---

**Confirmation:** This task was verification/reporting only. No `schema.prisma`, migration,
seed, or application code file was modified. No database write (INSERT/UPDATE/DELETE) was
executed — only `SELECT` queries were run against local `pkmdb`. The only file created or
modified by this task is this report.
