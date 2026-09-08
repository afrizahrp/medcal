# STAGE 1 — CalibrationTestPoint Seed Extraction from LK Worksheets

**Date:** 2026-09-08
**Mode:** READ-ONLY analysis + a reviewable proposal. **No seed was run. No schema, migration, or
application file was modified.** A throwaway read-only query script was used against local `pkmdb`
to dump the 489-row catalog, then deleted (not committed).
**Predecessor context:**
- `MeasurementResult_Stage1_Design_Finalization.md` §3.2 / §4.2 / §4.4 (the `CalibrationTestPoint`
  model + the four patterns) — LOCKED.
- `docs/claude/plans/management-portal/device-management/devicecalibrationparameters/investigation_report_measurement_Pattern_Classification.md`
  (the 2026-08-27 A/B/C/D classification) — the pattern assignments below reconcile with it.
- `packages/db/prisma/fix-collapsed-pattern-c-parameters.ts` (the 7→15 Pattern C split).

**Output of this task:**
1. This report.
2. `packages/db/prisma/seed-calibration-test-points.ts` — a **draft seed script, NOT run.**

**HARD STOP** — review this report + the seed script before Stage 2 (apply the seed).

> **Update 2026-09-08 (Stage 2 applied):** the §3 ambiguities A1 / A2 / A3 were resolved and the
> seed was applied to local `pkmdb`. A1 → `AUD_PURE_TONE_LINEARITY` / `AUD_FREQUENCY_RESPONSE` were
> split into `_KANAN` / `_KIRI` `DeviceCalibrationParameter` rows (originals deactivated), so the
> two folded 14-/8-point entries below became four undoubled 7-/7-/4-/4-point entries. A2 / A3 kept
> as drafted. **Final applied state: 40 parameters, 191 `CalibrationTestPoint` rows.** See
> `CalibrationTestPoint_Seed_Stage2_Report.md`. The tables below are the pre-split Stage-1 proposal,
> left as the extraction record.

---

## 0. Source corpus (verified, not assumed)

`docs/technician-docs/Lembar-Kerja/` — **50 `.docx` LK worksheets**, one per device type
(`LK Audiometer.docx` … `LK pH Meter.docx`). Same corpus used by the 08-27 classification and the
tolerance backfill. Text extracted per-worksheet via `unzip -p … word/document.xml` + tag strip.

**Catalog:** `DeviceCalibrationParameter` dumped live from `pkmdb` on 2026-09-08 — **489 rows**,
51 device-type codes. Matches the design doc §2 count.

**One worksheet per device type** — so there is no within-device-type multi-sample cross-check to
perform (the task's "multiple Bed Side Monitor worksheets from different jobs" scenario does not
exist in this corpus). Cross-device consistency is checked in §4.

---

## 1. Summary statistics

| Metric | Count |
|---|---:|
| Catalog rows examined | **489** |
| Rows requiring `CalibrationTestPoint` children (seeded by the draft) | **39** |
| Total `CalibrationTestPoint` rows the draft would create | **191** |
| — Pattern B (numeric sweep, inherit tolerance) | 160 rows across 32 params |
| — Pattern D fixed-slot (named slots, inherit tolerance) | 12 rows across 4 params |
| — Pattern D generic-slot (ordinal slots, `settingValue` NULL) | 6 rows across 1 param |
| — Override cases (per-point `toleranceMin/Max` SET) | 13 rows across 2 params |
| Rows checked and **explicitly excluded** (no test points) | 450 |
| Parameters that plausibly need test points but **cannot be seeded** (no usable LK data) | **19** (see §5) |

### Breakdown by pattern — parameters seeded

| Pattern | Params | Test points | Notes |
|---|---:|---:|---|
| B | 32 | 160 | tolerance override left NULL → inherits parent's `toleranceNote` `± delta` |
| D-fixed | 4 | 12 | `CENT_SPEED`, `CRFR_SPEED`, `ROT_SPEED`, `DXRAY_EXPOSURE_TIME` |
| D-generic | 1 | 6 | `SUCT_VACUUM_GAUGE` |
| override | 2 | 13 | `SUCT_MAX_VACUUM` (3), `INCU_AIR_TEMP` (10) |
| **Total** | **39** | **191** | |

---

## 2. Per-parameter extraction detail

`seq` = worksheet order (1-based). `value` = `settingValue` (NULL where the worksheet gives no
concrete numeric target). Tolerance override column: **NULL** = inherit parent (Pattern B norm).

### 2.1 Pattern B — numeric setpoint sweep, shared tolerance (inherit)

| Param code | Device | Setpoints (worksheet order) | n | Parent tol. | LK source section |
|---|---|---|---:|---|---|
| `AUD_PURE_TONE_LINEARITY` | Audiometer | 80/70/60/50/40/30/20 dB **× {Kanan, Kiri}** | 14 | ± 1 dB | "Linieritas dB Pure Tone" (1000 Hz, I–III) |
| `AUD_FREQUENCY_RESPONSE` | Audiometer | 250/500/6000/8000 Hz **× {Kanan, Kiri}** | 8 | ± 2 % | "Frekuensi Respon / Tanggap" (80/90 dB, I–III) |
| `BSM_HEART_RATE` | Bed Side Monitor | 30/60/120/180 BPM | 4 | ± 5 bpm | "Kalibrasi Heart Rate" (I–V) |
| `BSM_RESP_RATE` | Bed Side Monitor | 15/30/60/120 BrPM | 4 | ± 3 BrPM | "Kalibrasi Respirasi" (I–V) |
| `BSM_SPO2` | Bed Side Monitor | 98/93/92/85/90/70/88 %SpO2 | 7 | ± 3 % | "Kalibrasi Saturasi Oxygen" (I–V) |
| `BSM_SYSTOLIC` | Bed Side Monitor | 120/150/200/250/60/80/100 mmHg | 7 | ± 5 mmHg | "Kalibrasi NIBP" Systole (7 triples) |
| `BSM_MAP` | Bed Side Monitor | 93/116/166/215/40/60/76 mmHg | 7 | ± 5 mmHg | "Kalibrasi NIBP" Mean |
| `BSM_DIASTOLIC` | Bed Side Monitor | 80/100/150/195/30/50/65 mmHg | 7 | ± 5 mmHg | "Kalibrasi NIBP" Diastole |
| `BPM_SYSTOLIC` | Blood Pressure Monitor | 60/80/100/120/150/200 mmHg | 6 | ± 5 mmHg | "Kalibrasi NIBP" Systole (6 triples, standar 60–80 bpm) |
| `BPM_MAP` | Blood Pressure Monitor | 40/60/76/93/116/166 mmHg | 6 | ± 5 mmHg | "Kalibrasi NIBP" Mean |
| `BPM_DIASTOLIC` | Blood Pressure Monitor | 30/50/65/80/100/150 mmHg | 6 | ± 5 mmHg | "Kalibrasi NIBP" Diastole |
| `PULSEOX_HEART_RATE` | Pulse Oximeter | 30/60/120/180 BPM | 4 | ± 5 bpm | "Kalibrasi Heart Rate" (I–VI) |
| `PULSEOX_SPO2` | Pulse Oximeter | 98/93/92/85/90/70/88/90 %SpO2 | 8 | ± 4 % | "Kalibrasi Saturasi Oxygen" (I–VI) — **90 appears twice** (see §3) |
| `FDOP_HR_ACCURACY` | Fetal Doppler | 30/60/90/120/150/180/210 BPM | 7 | ± 5 bpm | "Kalibrasi Detak Jantung Bayi" (I–V) |
| `FM_FLOW_RATE` | Flow Meter | 3/5/7/9/11/13/15 L/min | 7 | ± 20 % | "Flow / Laju aliran" (I–V) |
| `BLNW_TEMP_CALIBRATION` | Blanket Warmer | 33/35/40 °C | 3 | ± 3 °C | "Kalibrasi suhu" (I–V) |
| `HUM_TEMP_ACCURACY` | Humidifier | 35/37 °C | 2 | ± 1 °c | "Akurasi Suhu" (I–V) — borderline 2-point |
| `CPAP_CONCENTRATION` | CPAP | 21/60 % | 2 | ± 3 % | "Pengukuran Konsentrasi Oksigen" (flowmeter 5 L/min, I–V) |
| `CPAP_FLOW_RATE` | CPAP | 3/5/10/13/15 L/min | 5 | ± 20 % | "Pengukuran Laju Aliran" (I–V) |
| `EST_FREQUENCY` | Electro Accup. (EST) | 80/120/200 Hz | 3 | ± 10 % | "Frekuensi" (I 20 mA, PD 0,2 ms; I–V) |
| `EST_INTENSITY` | Electro Accup. (EST) | 10/20/30/40 mA | 4 | ± 20 % | "Intensitas Terapi" (80 Hz, PD 0,2 ms; I–V) |
| `EST_PULSE_DURATION` | Electro Accup. (EST) | 0,1/0,2/0,3 ms | 3 | ± 10 % | "Pulse Duration" (80 Hz, 20 mA; I–V) |
| `ECG_AMPLITUDE` | Electrocardiograph | 5/10/20 mm/mV (gain) | 3 | ± 5 % | "Pengukuran Amplitudo" (2 Hz 1,0 mV, 25 mm/s; I–V) |
| `ECG_REC_SPEED` | Electrocardiograph | 25/50 mm/s | 2 | ± 5 % | "Laju Rekaman" (2 mV 120 bpm; I–V) |
| `ECG_HR_CAL` | Electrocardiograph | 60/90/120 bpm | 3 | ± 5 bpm | "Kalibrasi Detak Jantung" (2 mV; I–V) |
| `INFUS_FLOW_RATE` | Infusion Pump | 10/50/100/150/300 ml/jam | 5 | ± 10 % | "Kalibrasi Laju aliran" (I–V) |
| `SYR_FLOW_RATE` | Syringe Pump | 10/25/50/75/100 ml/jam | 5 | ± 10 % | "Kalibrasi Laju aliran" (I–V) |
| `O2CON_FLOW_RATE` | Oxygen Concentrator | 2/3/5/7/9 lpm | 5 | ± 20 % | "Laju aliran gas flowmeter" (I–V) |
| `RESUS_P_PRESSURE_ACC` | Resuscitator (Pulmonary) | 10/20/30/40/65 cmH2O | 5 | ± 20 % | "Kalibrasi akurasi tekanan resuscitator" (I–V) |
| `SPIRO_FVC` | Spirometer | 0,5/3 liter | 2 | ± 3 % | "Akurasi Total Volume FVC" (I–V) |
| `SPHYG_PRESSURE_ACC` | Sphygmomanometer | 0/50/100/150/200/250 mmHg | 6 | ± 4 mmHg (U95 ≤ MPE) | "Pengukuran akurasi tekanan" — each pt **naik & turun** → `direction` UP/DOWN |

### 2.2 Pattern D — fixed named slots (`settingValue` NULL, inherit tolerance)

| Param code | Device | Slots | n | Parent tol. | LK source |
|---|---|---|---:|---|---|
| `CENT_SPEED` | Centrifuge | Min / Med / Max | 3 | ± 10 % | "Kalibrasi Kecepatan Putar" (rpm; I–V) |
| `CRFR_SPEED` | Centrifuge Refrigerator | Min / Med / Max | 3 | ± 10 % | "Kalibrasi Kecepatan Putar" (rpm; I–V) |
| `ROT_SPEED` | Rotator | Min / Med / Max | 3 | ± 10 % | "Kalibrasi Kecepatan Putar" (rpm; I–V) |
| `DXRAY_EXPOSURE_TIME` | Dental X-Ray | Rendah / Sedang / Tinggi | 3 | ± 10 % | "Akurasi Waktu Penyinaran" (kV 70, mA 10) |

The actual rpm / seconds behind each slot is read off the UUT on-site (→
`MeasurementResult.appliedNominalValue`).

### 2.3 Pattern D — generic ordinal slots (`settingValue` NULL)

| Param code | Device | Slots | n | Parent tol. | LK source |
|---|---|---|---:|---|---|
| `SUCT_VACUUM_GAUGE` | Suction Pump | "Titik ukur 1…6 (dipilih teknisi)" | 6 | ± 10 % | "Akurasi Vacuum Gauge" — rows 1–6, "isi setting sesuai UUT"; Pengukuran 1/2/3 × Naik/Turun |

Per slot: 3 replicates × 2 directions = 6 `MeasurementResult` rows. Chosen mmHg →
`appliedNominalValue`; unit may vary per UUT (`mmHg/…` header) → per-row `uomId`.

### 2.4 Override cases — per-point `toleranceMin/Max` SET (do NOT inherit)

**`SUCT_MAX_VACUUM`** — Suction Pump, "Maximum Vacuum" table. "isi salah satu sesuai dengan UUT"
(exactly one class applies per unit). `settingValue` NULL (rated class, not a setpoint).

| seq | settingLabel | toleranceMin | toleranceMax | toleranceNote |
|---:|---|---:|---:|---|
| 1 | Low Vacuum | NULL | 150 | `< 150 mmHg` |
| 2 | Medium Vacuum | 150 | 450 | `150 mmHg – 450 mmHg` |
| 3 | High Vacuum | 450 | NULL | `> 450 mmHg` |

**`INCU_AIR_TEMP`** — Baby Incubator, "Kalibrasi Pengontrol Suhu dan Keseragaman Suhu Inkubator".
5 sensors (TM/T5, T1, T2, T3, T4) × 2 settings (32 °C, 36 °C), trials I–V. Two tolerance classes:

| seq | settingLabel | value | tolMin | tolMax | toleranceNote |
|---:|---|---:|---:|---:|---|
| 1 | TM/T5 — Setting 32 °C | 32 | −1.5 | 1.5 | `± 1.5 °C terhadap setting` |
| 2 | TM/T5 — Setting 36 °C | 36 | −1.5 | 1.5 | `± 1.5 °C terhadap setting` |
| 3 | T1 — Setting 32 °C | 32 | −0.8 | 0.8 | `± 0.8 °C terhadap rata-rata TM (T5)` |
| 4 | T1 — Setting 36 °C | 36 | −0.8 | 0.8 | ” |
| 5–6 | T2 — Setting 32 / 36 °C | 32 / 36 | −0.8 | 0.8 | ” |
| 7–8 | T3 — Setting 32 / 36 °C | 32 / 36 | −0.8 | 0.8 | ” |
| 9–10 | T4 — Setting 32 / 36 °C | 32 / 36 | −0.8 | 0.8 | ” |

---

## 3. Flagged ambiguities / decisions the reviewer must make

| # | Param(s) | Issue | Draft's choice | Alternative |
|---|---|---|---|---|
| A1 | `AUD_PURE_TONE_LINEARITY`, `AUD_FREQUENCY_RESPONSE` | Worksheet has a second categorical dimension **Earphone Kanan / Kiri** with no facet on `MeasurementResult`. | Fold ear into `settingLabel` → 14 + 8 points. | Split into `_LEFT` / `_RIGHT` `DeviceCalibrationParameter` rows (then 7 + 4 points, no fold). The 08-27 doc §5.2 explicitly leaves this open. |
| A2 | `INCU_AIR_TEMP` | Is the 32 °C / 36 °C setting a test-point dimension or an entry-UI sweep handled separately? | 10 points (sensor × setting), each with the sensor's tolerance override. | 5 points (sensor only); entry UI sweeps 32/36 like a Pattern B parent. |
| A3 | `PULSEOX_SPO2` | Setpoint **90 %SpO2 appears twice** (rows 5 and 8). `@@unique(parameter, settingLabel)` forbids duplicate labels. | Labels disambiguated: `90 %SpO2 (titik 5)`, `90 %SpO2 (titik 8)`. Confirm the worksheet is not a typo. | Treat as one point + an extra replicate (7 points). |
| A4 | `DXRAY_DOSE_LINEARITY` | "Linearitas Pengukuran — Minimal setting 2 pengaturan" — 2+ technician-chosen exposure settings, ± 10 %. Could be a 2-slot generic-D. | **Not seeded** — "minimal 2" is a floor, not a fixed count; treated as replicates for now. | Seed 2 generic ordinal slots like `SUCT_VACUUM_GAUGE`. |
| A5 | `ACLV_CHAMBER_TEMP_DT1/2/3` | "Setting UUT (°C) 121 / 134" in one cell — is ΔT measured once, or once per cycle (2 points each)? | **Not seeded** — treated as a single derived reading per split row. | 2 points each (`121 °C cycle`, `134 °C cycle`) if the autoclave is run at both. |
| A6 | `SPHYG_PRESSURE_ACC`, `SUCT_VACUUM_GAUGE` | `direction` (naik/turun) is the 6th natural-key component flagged for sign-off in the design doc §3.4(a). | Test points encode the setpoint only; direction lives on `MeasurementResult`. | (design decision, not a seed decision) |
| A7 | `BSM_*` NIBP | Worksheet shows I–V replicate columns for the NIBP tables too (design doc §4.2 guessed a single column). | No impact on test points (setpoints only). Note for the reading model: NIBP is I–V, not single. | — |

---

## 4. Cross-check — consistency across worksheets

Same conceptual parameter appearing on more than one worksheet:

| Concept | Worksheets | Consistent? |
|---|---|---|
| Heart-rate simulator sweep | BSM (30/60/120/180), Pulse Oximeter (30/60/120/180), ECG (60/90/120), Fetal Doppler (30/60/90/120/150/180/210) | **Device-appropriate, not identical.** BSM ≡ Pulse Oximeter. ECG uses a 3-point cardiac range; Fetal Doppler a 7-point fetal range. No conflict. |
| SpO2 simulator sweep | BSM (7 pts, ± 3 %), Pulse Oximeter (8 pts incl. dup 90, ± 4 %) | **Differ by design** — different tolerance, Pulse Oximeter adds a point. Flagged (A3) is the intra-worksheet duplicate, not an inter-worksheet conflict. |
| NIBP triples | BSM (7 triples, up to 250/215/195), BPM (6 triples, up to 200/166/150) | **Differ by design** — BSM is a full patient monitor, BPM a spot NIBP device. Consistent with the 08-27 doc. |
| Rotation-speed slots | Centrifuge / Centrifuge Refrigerator / Rotator — all "Min / Med / Max", ± 10 % | **Identical.** |
| Rotation-time | Centrifuge / Centrifuge Refrigerator / Rotator — all single setpoint "300 detik", ± 10 % | **Identical, single point → no test points** (Pattern A). |
| Flow-rate sweeps | Flow Meter (3–15 by 2), CPAP (3/5/10/13/15), O2 Concentrator (2/3/5/7/9), Infusion (10–300), Syringe (10–100) | Each device its own sweep — no shared concept to conflict. |
| Vacuum accuracy | Suction Pump (`SUCT_VACUUM_GAUGE`, 6 generic slots) vs Breast Pump (`BREASTP_VACUUM_GAUGE`, no worksheet) | Breast Pump catalog row mirrors Suction Pump; **no `LK Breast Pump.docx` exists** → see §5. |

**No inconsistency requiring a pick-one decision was found.** The apparent differences (SpO2
tolerance, NIBP range) are legitimate per-device differences already reflected in the catalog.

---

## 5. Gaps — parameters that plausibly need test points but were NOT seeded

Flagged, **not guessed**. Each has a Pattern-B-shaped catalog row but no usable setpoint data in
the corpus.

| Device type | Param codes | Why not seeded | Suggested resolution |
|---|---|---|---|
| **VENTILATOR** | `VENT_TIDAL_VOLUME`, `VENT_MINUTE_VOLUME`, `VENT_RESP_RATE`, `VENT_INSP_TIME`, `VENT_EXP_TIME`, `VENT_PEEP`, `VENT_PPEAK`, `VENT_FIO2`, `VENT_IE_RATIO` | **No `LK Ventilator.docx` in the corpus.** The tolerance backfill sourced ventilator rows from `docs/legal_n_competency/Penilaian Kemambuan.zip → LK Ventilator Transport.pdf` (see `backfill-device-calibration-parameter-tolerances.ts` header). | Extract that PDF in a follow-up; seed then. `VENT_IE_RATIO` is RATIO — likely no test points. |
| **PATIENT_MONITOR** | `PM_HEART_RATE`, `PM_RESP_RATE`, `PM_SPO2`, `PM_SYSTOLIC`, `PM_MAP`, `PM_DIASTOLIC` | No `LK Patient Monitor.docx`. Catalog row shape is identical to `BSM_*`. | After review, mirror the `BSM_*` test points (same worksheet family). |
| **OXYMETER_MONITOR** | `OXYM_HEART_RATE`, `OXYM_SPO2` | No `LK Oxymeter Monitor.docx`. Identical to `PULSEOX_*`. | Mirror `PULSEOX_*` after review. |
| **BREAST_PUMPS** | `BREASTP_VACUUM_GAUGE`, `BREASTP_MAX_VACUUM` | No `LK Breast Pump.docx`. Rows mirror `SUCT_VACUUM_GAUGE` / `SUCT_MAX_VACUUM`. | Mirror the Suction Pump seeds after review. |
| **RESUSCITATORS_CARDIAC** | `RESUS_C_PRESSURE_ACC` | `LK Resusitator Paru dan Neopuff.docx` is the pulmonary worksheet; it contains no cardiac-specific pressure sweep, and there is no separate cardiac worksheet. | Confirm the cardiac resuscitator uses the same 10/20/30/40/65 cmH2O sweep, then mirror `RESUS_P_PRESSURE_ACC`. |

If A1 is resolved as "keep one parameter", these are the only gaps. If PM/OXYM/BREASTP mirroring is
approved, that adds **6 + 2 + ~9 = ~17** more parameters and roughly **80–90** more test points.

---

## 6. "Checked, excluded" — parameters that correctly get NO test points

Not silently skipped. Grouped by reason.

### 6.1 Environment + electrical-safety rows (every device type, ~7 each)
`*_ROOM_TEMP`, `*_ROOM_HUMIDITY`, `*_INPUT_VOLTAGE`, `*_EARTH_RESISTANCE`,
`*_INSULATION_RESISTANCE`, `*_EQUIP_LEAKAGE`, `*_APPLIED_LEAKAGE` — Pattern A, one fixed
tolerance, no setpoint sweep. **~330 rows.**

### 6.2 Pattern A single-target performance rows (no sweep)
`DUNIT_ILLUMINANCE`, `DUNIT_HP_PRESSURE`, `DUNIT_AIR_SPRAY`, `DUNIT_SUCTION`,
`DUNIT_HP_SPEED_LOW`, `DUNIT_HP_SPEED_HIGH`, `EXLMP_INTENSITY/CCT/CRI`, `HLAMP_INTENSITY/CCT/CRI`,
`LOP_INTENSITY/CCT/CRI`, `LARYN_INTENSITY/CCT/CRI`, `NCOMP_FLOW_RATE`, `UNEB_FLOW_RATE`,
`INFUS_OCCLUSION`, `SYR_OCCLUSION`, `O2CON_CONCENTRATION`, `HUM_TEMP_ACCURACY` *(has 35/37 — see
note)*, `HUM_MAX_TEMP`, `BLNW_HIGH_TEMP`, `SPHYG_LEAK_TEST`, `SPHYG_DEFLATION`,
`SUCT_TIME_MAX_VACUUM`, `CENT_TIME`, `CRFR_TIME`, `ROT_TIME`, `EST_TIMER`, `ECG_SINUSOID_TEST`,
`ECG_NORMAL_TEST`, `DXRAY_KV_ACCURACY`, `DXRAY_DOSE_LINEARITY` (A4), `DXRAY_REPRODUCIBILITY`,
`MICRO_MAG_4X`, `MICRO_MAG_10X`, `PHOTO_IRRADIANCE` *(titik ukur 1–4/M are spatial replicate
positions sharing one limit — design doc §3.2: replicates, not test points)*, `IW_TEMP_CALIBRATION`,
`RW_TEMP_CALIBRATION`, `IW_MAX_MATTRESS_TEMP`, `RW_MAX_MATTRESS_TEMP`, `INCU_OVERSHOOT_TEMP`,
`INCU_MATTRESS_TEMP`, `INCU_AIR_VELOCITY`, `INCU_NOISE_LEVEL`, `INCU_SKIN_TEMP_SENSOR`,
`INCU_RECOVERY_TIME`, `BSC_PARTICLE_COUNT`, `BSC_DOWNFLOW`, `BSC_INFLOW`, `BSC_UV_RADIATION`,
`LAF_PARTICLE_COUNT`, `LAF_DOWNFLOW`, `LAF_LIGHT_INTENSITY`, `LAF_UV_RADIATION`,
`RESUS_P_MAX_PRESSURE`, `RESUS_C_MAX_PRESSURE`, `AUD_EARTH_RESISTANCE` etc.

> `HUM_MAX_TEMP` (single setpoint 40 °C) is excluded; `HUM_TEMP_ACCURACY` (35/37 °C) **is** seeded
> as a 2-point Pattern B sweep in §2.1 — drop it if the reviewer prefers (impact: 2 rows).

### 6.3 The 8 already-split Pattern C pairs (each self-contained Pattern A)
`ACLV_STER_TEMP_121/134`, `ACLV_STER_TIME_121/134`, `ACLV_CHAMBER_TEMP_DT1/2/3` (A5),
`BSC_LIGHT_INTENSITY_ON/OFF`, `BSC_SOUND_LEVEL_ON/OFF`,
`LAF_SOUND_LEVEL_BACKGROUND/COMPARTMENT`, `DXRAY_HVL_70KV/80KV`,
`DXRAY_COLLIMATION_LENGTH/DIAMETER`. Each row already carries its own structured `toleranceMin/Max`
and is measured at a single point → Pattern A mechanics, `calibrationTestPointId = NULL`.

### 6.4 Pattern D logger-summary storage-temperature rows (no test points by design §4.4a)
`BBR_STORAGE_TEMP`, `KVAK_STORAGE_TEMP`, `CCHAIN_STORAGE_TEMP`, `MREF_STORAGE_TEMP`,
`MFRZ_STORAGE_TEMP`, `OVEN_TEMP`, `STER_TEMP`, `CRFR_STORAGE_TEMP`, `PLT_STORAGE_TEMP` — the
9-sensor × 30-timepoint grid lives in an attached 12-channel logger export; `MeasurementResult`
stores `LOGGER_SUMMARY` min/max rows + the attachment.

### 6.5 BOOLEAN / RATIO
`BSC_HEPA_LEAK` (BOOLEAN — Pass/Fail), `MICRO_MAG_RATIO` (RATIO), `VENT_IE_RATIO` (RATIO). No test
points.

---

## 7. Draft seed script

`packages/db/prisma/seed-calibration-test-points.ts` — **written, NOT run.**

- Follows the existing convention (`import { prisma } from "../src/index"`, resolve parameter by
  `code` via `findFirst`, structured `Bounds`-style helpers, explicit expected counts, summary
  log line, `process.exit(1)` on error — mirrors `fix-collapsed-pattern-c-parameters.ts`).
- **Idempotent:** per parameter, inserts only the `sequence` values not already present; a clean
  re-run is a no-op.
- Each parameter block carries a `source:` string naming the LK worksheet + section, and a
  `notes:` string for the flagged cases.
- Planned effect: **39 parameters, 191 `CalibrationTestPoint` rows.**
- Run command (Stage 2, AFTER approval):
  ```
  pnpm --filter @medcal/db generate
  pnpm --filter @medcal/db exec tsx --env-file ../../.env prisma/seed-calibration-test-points.ts
  ```

---

## 8. HARD STOP

No seed was executed. No schema, migration, or application file changed. The only files written are
this report and the draft `seed-calibration-test-points.ts`. Await review of the §3 ambiguities and
the §5 gaps before Stage 2.
