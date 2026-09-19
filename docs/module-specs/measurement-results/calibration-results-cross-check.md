# STAGE 1 — Cross-Check MeasurementResult Against Real calibration-results

**Date:** 2026-09-08
**Mode:** Evidence extraction from 66 password-protected Excel files
(`docs/technician-docs/measurement-results/*.xlsx`, password `1004`).
Sheet actually used: **`Input Data`** (not `Sheet1` — see §0).
**HARD STOP on this document itself is lifted** by the 2026-09-08 follow-up
that applies seed/backfill corrections in a later stage. This file remains the
read-only evidence record.

Source of prior design: 50 blank LK `.docx` templates. This is the first
ground-truth pass against filled field worksheets.

---

## 0. Sheet1 is the wrong sheet

| Fact | Count |
|---|---:|
| Files | **66** |
| Encrypted OLE (`D0 CF 11 E0`), opened with password `1004` | 66 |
| Files that contain a sheet named `Sheet1` | **3** |
| — Bed Side Monitor `Sheet1` used range | 1×1 empty |
| — Infant Warmer `Sheet1` | 91×34, not the LK form |
| — Suction Pump `Sheet1` | 11×13 vacuum-conversion scratch |
| Files whose real LK is `Input Data` / `input data` / `input` | **66** |

All analysis below is from the input sheet. Using only `Sheet1` would have
produced an empty study.

---

## 1. File → catalog coverage

### 1.1 Usable mapping (43 files → 42 catalog `DeviceType`s)

Ventilator infant + transport collapse to one catalog type (`VENTILATOR`).
`Cold Chain, Vaccine Refrigerator.xlsx` maps to `KULKAS_VAKSIN` (Nama Alat =
Vaccine Refrigerator), not to a separate `COLD_CHAIN` row.

**42 / 51** catalog types that already have `DeviceCalibrationParameter` rows
have a usable filled Excel (**82%**).

### 1.2 Catalog types with **no** usable Excel (9 / 51 = 18%)

`BREAST_PUMPS`, `COLD_CHAIN`, `DENTAL_XRAY`, `ELECTRIC_BEDS`, `LAMPU_OPERASI`,
`OXYMETER_MONITOR`, `PATIENT_MONITOR`, `RADIANT_WARMER`, `RESUSCITATORS_CARDIAC`.

### 1.3 Excel files **outside** the current parameter catalog (23 / 66 = 35%)

Auto Chemistry Analyzer, Defibrilator (4 variants), Echocardiograph, GCU/HB,
Hematologi Analyzer, Kelistrikan, Light Cure, Mikropipet, Otoscope, Phaco
Emulsifikasi, Thermohygrometer (+ kulkas), Thermometer Ear/IR, Thermometer
klinik, Timbangan (analytic / bayi / dewasa), Uji Fungsi Fisik,
Ultrasonograph, Urine Analyzer.

`seed-device-taxonomy-extension-parameters.ts` already marks several of these
**out of scope** (Auto Chemistry, Hematologi, Thermohygrometer, Otoscope, Phaco).

### 1.4 Identity-corrupt files — do not use as evidence

| File | Title | Nama Alat |
|---|---|---|
| `Mikropipet.xlsx` | Lembar Kerja Kalibrasi Mikropipet | **Baby Incubator** |
| `Kelistrikan.xlsx` | Pengujian Keselamatan Listrik | **Hematologi Analyzer** |
| `Suction Pump.xlsx` | leftover title “PHACO EMULSIFIKASI” | Suction Pump (content is suction — **usable**) |

---

## 2. decimalPlaces from real recorded values

Placeholder catalog: every NUMBER row still `decimalPlaces = 0`.
The earlier `DecimalPlaces_Backfill_Proposal.md` was convention-only because
the `.docx` corpus was blank.

### 2.1 Shared env / electrical (across files that have those blocks)

| Measurement | n samples | Dominant dp | vs old proposal |
|---|---:|---:|---|
| Earth resistance | 48 | **3** (0,231; 0,176) | was 2 — **correct to 3** |
| Equipment leakage µA | 48 | **1** | was 1 low-confidence — **confirmed** |
| Insulation MΩ | ~48 | text **`OR`**, not a number | 0 stays |
| Room temperature | 161 | **1** | confirmed |
| RH | 164 | **0** | confirmed |
| Voltage L-N | 49 | **1** | confirmed |

Outlier: Fetal Doppler earth `0,0254` → **4 dp** on that row only.

### 2.2 Kinerja (2 019 numeric replicate cells)

Distribution: 0 dp 1232 · 1 dp 559 · 2 dp 186 · 3 dp 42.

Setpoint integer **does not** imply reading integer:

| Parameter (examples) | Setpoint | Recorded | dp |
|---|---|---|---:|
| `INFUS_FLOW_RATE` | 10 | 10,171 | **3** |
| `AUD_PURE_TONE_LINEARITY_*` | 80 dB | 80,3 | **1** |
| `CPAP_CONCENTRATION` | 21 | 21,25 | **2** |
| `CPAP_FLOW_RATE` | 5 | 5,32 | **2** |
| `INCU_AIR_TEMP` | 32 | 32,14 | **2** |
| `SPHYG_PRESSURE_ACC` | 50 | 50,3 | **1** |
| `BSM_HEART_RATE` / NIBP / SpO₂ | integer | integer | **0** |

Header **Resolusi** on the LK is filled (0,1 / 0,01 / 0,005 / 1) and is a
useful secondary signal; primary evidence is the recorded cell.

---

## 3. CalibrationTestPoint seed vs real setpoints

### 3.1 Confirms (no seed change)

`BSM_HEART_RATE` 30/60/120/180 · `BSM_RESP_RATE` 15/30/60/120 · BSM NIBP 7
triples · `PULSEOX_HEART_RATE` · `PULSEOX_SPO2` 8 points with duplicated 90 ·
`BPM_*` 6 triples · `FDOP_HR_ACCURACY` 30…210 · `FM_FLOW_RATE` 3/5/7/9/11/13/15
· `HUM_TEMP_ACCURACY` 35/37 · `CPAP_CONCENTRATION` 21/60 · `CPAP_FLOW_RATE`
3/5/10/13/15 · `EST_FREQUENCY` 80/120/200 · `INFUS_FLOW_RATE`
10/50/100/150/300 · `SPHYG_PRESSURE_ACC` 0/50/100/150/200/250 naik/turun ·
`CENT_SPEED` / `ROT_SPEED` Min/Med/Max · Suction 6 generic slots.

### 3.2 Corrects

| Code | Seeded | Real | Action |
|---|---|---|---|
| `BSM_SPO2` | 7 points, no trailing 90 | **8 points**, 90 duplicated (same as Pulse Ox) | add 8th point |
| `AUD_FREQUENCY_RESPONSE_*` | 250/500/6000/8000 Hz | **table absent** from this filled Audiometer file | do **not** invent a correction; flag unverified |
| Audiometer replicates | I–V implied by Stage A default | **I–III** | UI note, not a seed value change |

### 3.3 New seed candidate (was deferred)

`VENTILATOR` — two filled files (infant + transport). Pattern B tables with
**I–III** replicates. Catalog rows exist (`VENT_TIDAL_VOLUME` … `VENT_FIO2`)
but **zero** `CalibrationTestPoint` children. Peak inspiratory/expiratory
**flow** tables exist in Excel and have **no** catalog parameter.

---

## 4. Pattern classification / `entryStyle`

### 4.1 LOGGER_SUMMARY — classification stands; practice is richer

7–8 fridge/oven/sterilizer files contain a **30 timepoint × 9 sensor** grid
typed into the LK (BBR, Vaccine Refrigerator, Medical Fridge/Freezer, Oven,
Sterilisator, Platelet, plus Centrifuge Refrigerator compartment temp).

`entryStyle = LOGGER_SUMMARY` remains the correct Stage A exclusion. Stage C
must decide: min/max + attachment (design) vs transcribing the 30×9 grid
(field practice).

### 4.2 Pattern A spot-check

Dental Unit illuminance / handpiece / spray: single parameter, I–V, no
setpoint sweep — correctly Pattern A. Env/electrical blocks are Pattern A.

### 4.3 Pattern B

Confirmed on BSM, BPM, Pulse Ox, infus, CPAP, flowmeter, EST, ECG, etc.

---

## 5. Expected replicate count

Roman-numeral headers across 66 files:

| Pattern | Header count |
|---|---:|
| I–V (5) | 56 |
| I–III (3) | 52 |
| I–VI (6) | 9 (thermohygrometer, out of catalog) |
| I–IV / I–VII | 1 / 1 (BSC) |
| Naik/turun × 3 | Sphyg, Suction, Phaco |
| 30 timepoints | logger family |

**5 is the mode for many Pattern A/B tables, not a universal law.** Audiometer
and Ventilator use 3. Do not add an `expectedReplicateCount` column in this
stage; Stage A default 5 + “tambah ulangan” stays, with the soft-spot now
evidenced.

---

## 6. Structurally new (blank templates did not show)

- Work sheet = Input Data, not Sheet1.
- Insulation recorded as `OR`.
- Infus occlusion table alongside flow (already `INFUS_OCCLUSION` Pattern A).
- Ventilator I:E setting cells sometimes store Excel time serials (`0,04375`)
  instead of `1:2`.
- Telaah teknis G/H (10/40/50) on Ventilator — QualityReview, not MeasurementResult.
- Resolusi UUT filled.

---

## 7. Findings summary

### Confirms

Sweep values for the majority of already-seeded Pattern B parameters; logger
rows are not I–V; Pattern A dental/electrical; RH 0 dp, room temp 1 dp,
voltage 1 dp, leakage 1 dp.

### Corrects

`BSM_SPO2` +1 point; earth **3 dp**; infus/CPAP/audiometer reading precision ≠
setpoint precision; replicate 3 vs 5 on some types.

### New evidence

~2 019 kinerja values + env/electrical cells; 42 catalog types now
high-confidence for `decimalPlaces`.

### New gaps

~20 Excel device types with no catalog; Audiometer frequency-response
unverified; Ventilator peak-flow parameters missing; identity-corrupt files;
Stage C logger grid vs summary.

---

## 8. What this document does *not* do

No schema change, no seed/backfill application. Those are the sequential
follow-up stages recorded in
`calibration-results-five-steps-implementation-report.md`.
