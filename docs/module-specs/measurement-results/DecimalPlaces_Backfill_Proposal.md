# STAGE 1 — Extract & Propose `decimalPlaces` per DeviceCalibrationParameter

**Date:** 2026-09-08
**Mode:** READ-ONLY analysis + this proposal + a **draft, un-executed** backfill script.
**No backfill was run. No schema, migration, or application file was modified.**

A throwaway read-only script dumped the 491 active `DeviceCalibrationParameter` rows from local
`pkmdb` (code, name, valueType, uom, tolerance*, decimalPlaces, and every `CalibrationTestPoint`
setpoint) — then it was deleted, not committed. The 50 LK worksheets were text-extracted from
`docs/technician-docs/Lembar-Kerja/*.docx` into a scratch dir for inspection.

**HARD STOP** — review this report + `packages/db/prisma/backfill-decimal-places.ts` before
Stage 2 (apply the backfill).

---

## 1. Summary

| Metric | Count |
|---|---:|
| Active `DeviceCalibrationParameter` rows | 491 |
| `valueType = NUMBER` (in scope) | **488** |
| `valueType != NUMBER` (`decimalPlaces` stays NULL) | 3 — `VENT_IE_RATIO`, `MICRO_MAG_RATIO` (RATIO), `BSC_HEPA_LEAK` (BOOLEAN) |
| NUMBER rows currently at the `0` placeholder | 488 |
| NUMBER rows with a real per-parameter value today | 0 |

### Proposed `decimalPlaces` distribution (488 NUMBER rows)

| Proposed dp | Rows |
|---:|---:|
| 0 | 179 |
| 1 | 246 |
| 2 | 63 |

### Confidence / evidence basis

| Evidence class | Rows | Meaning |
|---|---:|---|
| setpoint-grounded | 22 | the worksheet's printed setpoint sweep fixes the precision (decimal setpoints → that dp; all-integer sweep → 0 dp) |
| per-parameter override | 19 | a hand-written rule for a specific parameter whose unit convention is misleading (sub-second times, airflow m/s, FVC volume, …) |
| unit-convention fallback | 447 | **no worksheet evidence** — proposal derives from the unit + the numeric precision of the stated tolerance |

| Confidence | Rows |
|---|---:|
| high | 57 |
| medium | 261 |
| low | **170** |

309 of the 488 rows change from `0`; 179 are confirmed / proposed to stay `0`.

---

## 2. Corpus reality — the evidence the task expected mostly does not exist

The task's evidence priority order assumed the worksheets contain (1) real recorded readings and
(2) reference-instrument resolutions. **Neither is present in this corpus:**

- **All 50 `LK *.docx` are blank templates.** Every measurement table prints the *setpoint*
  column and empty `I…V` trial cells. There is not a single technician-entered reading like
  `78.5` or `121.34` anywhere. (The stray numbers that survive tag-stripping — e.g. `37465 46355`
  in the Bed Side Monitor physical-inspection table — are serialized checkbox/date field state,
  not measurements.)
- **`Resolusi :` is a blank fill-in field** on every worksheet (it is the *UUT's* resolution, to
  be recorded on site — not the reference instrument's).
- **`Daftar Alat yang Digunakan`** lists the reference instruments by name only (`Vital Signs
  Simulator`, `Electrical Safety Analyzer`, `Thermohygrometer`, …) with **no resolution column
  and no values** — again a blank template.

So evidence priorities #1 (recorded readings) and #2 (instrument resolution) yield nothing.
What remains:

1. **Setpoint precision** (priority #4 in the task) — the fixed values printed in the sweep
   tables, already extracted into `seed-calibration-test-points.ts`. Decimal setpoints
   (`EST_PULSE_DURATION` 0.1/0.2/0.3 ms; `SPIRO_FVC` 0.5/3 L) are direct evidence; an all-integer
   sweep (NIBP mmHg, HR bpm, SpO₂ %, frequency Hz) is good evidence of `0` dp for that reading.
2. **Tolerance-note precision** — if the acceptance limit is written `± 0.8 °C` or `≤ 0,3 Ω`, the
   reading is recorded to at least that precision. Used as a secondary signal, capped at 2 dp,
   and never allowed to override a high-confidence "0 dp" unit convention (e.g. the
   Sphygmomanometer `U95 maksimum 1,5 mmHg` is measurement *uncertainty*, not reading precision —
   `SPHYG_PRESSURE_ACC` stays 0).
3. **Unit convention** (priority #3, the task's flagged fallback) — applied to the remaining 447
   rows. Every one is listed with its rationale in §4 and the low-confidence subset is called out
   separately in §5.

---

## 3. Method

For each NUMBER row, `proposed = ` the first that applies:

1. **decimal setpoint** → `max(decimal digits in any setpoint)`, confidence **high**.
2. **all-integer setpoint sweep** (≥ 2 numeric setpoints) where the unit convention is also 0 →
   `0`, confidence **high**.
3. **per-parameter override** (§ table below) for units whose plain convention misleads.
4. **tolerance precision** — digits after the decimal in `toleranceMin/Max/Note` (≤ 2), if
   greater than the convention and the convention isn't high-confidence-0 → that many dp,
   confidence **medium** (or **low** if the base unit convention was low).
5. **unit convention** (§4) → its `(dp, confidence)`.

### Unit-convention table

| uom | dp | confidence | rationale |
|---|---:|---|---|
| MMHG | 0 | high | NIBP / vacuum pressures — integer setpoints (BSM, BPM, Sphyg, Suction), tol ± 4–5 mmHg |
| SPO2 | 0 | high | SpO₂ % — integer simulator setpoints |
| BPM | 0 | high | heart-rate simulator — integer setpoints, ± 5 bpm |
| RPM (resp) | 0 | high | respiration rate — integer, ± 3 BrPM |
| REV_MIN | 0 | high | rotational speed in thousands of rpm, ± 10 % |
| HZ | 0 | high | frequency — integer setpoints (audiometer, EST) |
| LUX | 0 | high | illuminance in thousands of lux (`> 15000 lux`) |
| PARTICLE | 0 | high | particle counts are integers |
| DB / DBA | 0 | medium | dB / A-weighted noise — integer dB setpoints, `≤ 60` limits |
| RA | 0 | medium | colour-rendering index reported as an integer |
| PERCENT | 0 | medium | RH / FiO₂ / O₂ concentration — integer readings |
| CMH2O | 0 | medium | resuscitator / ventilator pressures — integer setpoints, ± 20 % |
| ML | 0 | medium | tidal volume in mL — integer |
| MA | 0 | medium | EST therapy current — integer setpoints 10/20/30/40 mA |
| DEG_C | 1 | medium | temperature — reference thermometer/logger resolution 0.1 °C; tolerances written to 0.1 °C |
| KELVIN | 1 | low | temperature family (a few rows carry uom KELVIN) — treat as °C precision |
| V | 1 | medium | mains 220 V ± 10 % — analyser reads 0.1 V |
| OHM | 2 | medium | protective-earth `≤ 0,3 Ω` — analyser reads 0.01 Ω |
| MOHM | 0 | low | insulation `> 2 MΩ` — usually whole / over-range |
| UA | 1 | low | leakage current µA — often integer, analyser can report 0.1 µA |
| L_MIN | 1 | medium | gas / flow rate — flow analyser reads 0.1 L/min |
| ML_H | 1 | low | infusion / syringe pump flow — reads 0.1 mL/h |
| L | 2 | low | minute volume — small values |
| MV | 1 | medium | ECG signal amplitude — worksheet shows `1,0 mV` |
| MM | 1 | low | ECG amplitude/speed, collimation length |
| MMAL | 1 | medium | HVL in mmAl — worksheet shows `1,5` / `2,3 mmAl` |
| MS | 2 | medium | pulse duration — setpoints 0.1–0.3 ms |
| SEC | 1 | low | time in seconds — mixed; see per-code overrides |
| MIN | 0 | low | recovery / sterilization time in minutes — integer |
| M_S | 2 | high | air velocity — `≤ 0.35 m/s`; BSC/LAF setpoints 0.25 / 0.40 / 0.50 m/s |
| UM | 2 | low | micrometer-scale (microscope) — worksheet shows `0,01 mm` |
| MGY | 2 | low | radiation dose |
| KV | 1 | low | tube voltage |
| UW_CM2 / _NM | 1 | low | phototherapy irradiance |
| BAR / PSI / KPA | 1 | low | pressure |
| MBAR | 0 | low | pressure |

### Per-parameter overrides

| pattern | dp | conf | why |
|---|---:|---|---|
| `*EXPOSURE_TIME` (Dental X-ray) | 2 | medium | sub-second exposure |
| `VENT_INSP_TIME`, `VENT_EXP_TIME` | 2 | medium | ~1 s times |
| `EST_PULSE_DURATION` | 2 | medium | setpoints 0.1–0.3 ms |
| `*AIR_VELOCITY`, `BSC/LAF *DOWNFLOW/INFLOW` | 2 | high | airflow m/s |
| `SPHYG_DEFLATION`, `*TIME_MAX_VACUUM`, `CENT/CRFR/ROT_TIME`, `*TIMER`, `INCU_RECOVERY_TIME` | 0 | medium | whole-second/minute elapsed time |
| `SPIRO_FVC` | 2 | medium | volume, setpoints 0.5 / 3 L |
| `INCU_SKIN_TEMP_SENSOR` | 2 | medium | match `≤ 0,3 °C` |
| `INCU_AIR_TEMP` | 1 | medium | tolerances ± 1.5 / ± 0.8 °C |

---

## 4. Per-parameter proposal (all 488 NUMBER rows, grouped by device type)

`current` is the `0` placeholder for every row. Non-NUMBER rows are shown with `proposed = NULL`.

### AUDIOMETER

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `AUD_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `AUD_PURE_TONE_LINEARITY_KANAN` | Linieritas dB Pure Tone (Earphone Kanan) | DB | NUMBER | 0 | 0 | worksheet setpoint sweep is all-integer (["80","70","60","50","40","30","20"]) — confirms 0 dp | high |
| `AUD_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `AUD_PURE_TONE_LINEARITY_KIRI` | Linieritas dB Pure Tone (Earphone Kiri) | DB | NUMBER | 0 | 0 | worksheet setpoint sweep is all-integer (["80","70","60","50","40","30","20"]) — confirms 0 dp | high |
| `AUD_FREQUENCY_RESPONSE_KANAN` | Frekuensi Respon / Tanggap (Earphone Kanan) | HZ | NUMBER | 0 | 0 | worksheet setpoint sweep is all-integer (["250","500","6000","8000"]) — confirms 0 dp | high |
| `AUD_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `AUD_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `AUD_FREQUENCY_RESPONSE_KIRI` | Frekuensi Respon / Tanggap (Earphone Kiri) | HZ | NUMBER | 0 | 0 | worksheet setpoint sweep is all-integer (["250","500","6000","8000"]) — confirms 0 dp | high |
| `AUD_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `AUD_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `AUD_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### AUTOCLAVE

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `ACLV_CHAMBER_TEMP_DT1` | Suhu Chamber ΔT1 (S1 – S2) | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `ACLV_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `ACLV_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `ACLV_CHAMBER_TEMP_DT2` | Suhu Chamber ΔT2 (S1 – S3) | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `ACLV_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `ACLV_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `ACLV_CHAMBER_TEMP_DT3` | Suhu Chamber ΔT3 (S1 – S3) | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `ACLV_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `ACLV_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `ACLV_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `ACLV_STER_TEMP_121` | Suhu Sterilisasi (siklus 121 °C) | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `ACLV_STER_TEMP_134` | Suhu Sterilisasi (siklus 134 °C) | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `ACLV_STER_TIME_121` | Waktu Sterilisasi (siklus 121 °C) | MIN | NUMBER | 0 | 0 | unit-convention fallback — recovery/sterilization time in minutes — integer | low |
| `ACLV_STER_TIME_134` | Waktu Sterilisasi (siklus 134 °C) | MIN | NUMBER | 0 | 0 | unit-convention fallback — recovery/sterilization time in minutes — integer | low |

### BABY_INCUBATOR

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `INCU_AIR_TEMP` | Kalibrasi Pengontrol Suhu dan Keseragaman Suhu Inkubator | DEG_C | NUMBER | 0 | 1 | per-parameter override — incubator air temp — tolerances ±1.5 / ±0.8 °C | medium |
| `INCU_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `INCU_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `INCU_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `INCU_OVERSHOOT_TEMP` | Overshoot Temperature | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `INCU_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `INCU_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `INCU_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `INCU_RECOVERY_TIME` | Waktu Pemulihan Lonjakan Suhu | MIN | NUMBER | 0 | 0 | per-parameter override — elapsed-time reading (deflation / rotation / recovery) — integer seconds/minutes | medium |
| `INCU_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `INCU_MATTRESS_TEMP` | Suhu Matras | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `INCU_AIR_VELOCITY` | Kecepatan Udara Dalam Kompartemen | M_S | NUMBER | 0 | 2 | per-parameter override — airflow velocity in m/s — 2 dp per worksheet setpoints | high |
| `INCU_NOISE_LEVEL` | Kebisingan Kompartemen | DB | NUMBER | 0 | 0 | unit-convention fallback — sound/level in dB — integer dB setpoints, ≤60 limits | medium |
| `INCU_SKIN_TEMP_SENSOR` | Kalibrasi Sensor Suhu Kulit | DEG_C | NUMBER | 0 | 2 | per-parameter override — skin-sensor match ≤ 0,3 °C — 2 dp | medium |

### BED_SIDE_MONITOR

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `BSM_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `BSM_HEART_RATE` | Heart Rate | BPM | NUMBER | 0 | 0 | worksheet setpoint sweep is all-integer (["30","60","120","180"]) — confirms 0 dp | high |
| `BSM_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `BSM_SYSTOLIC` | Systole | MMHG | NUMBER | 0 | 0 | worksheet setpoint sweep is all-integer (["120","150","200","250","60","80","100"]) — confirms 0 dp | high |
| `BSM_DIASTOLIC` | Diastole | MMHG | NUMBER | 0 | 0 | worksheet setpoint sweep is all-integer (["80","100","150","195","30","50","65"]) — confirms 0 dp | high |
| `BSM_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `BSM_RESP_RATE` | Respirasi | RPM | NUMBER | 0 | 0 | worksheet setpoint sweep is all-integer (["15","30","60","120"]) — confirms 0 dp | high |
| `BSM_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `BSM_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `BSM_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `BSM_MAP` | Mean | MMHG | NUMBER | 0 | 0 | worksheet setpoint sweep is all-integer (["93","116","166","215","40","60","76"]) — confirms 0 dp | high |
| `BSM_SPO2` | Saturasi Oxygen (SPO2) | SPO2 | NUMBER | 0 | 0 | worksheet setpoint sweep is all-integer (["98","93","92","85","90","70","88"]) — confirms 0 dp | high |
| `BSM_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### BIO_SAFETY_CABINET

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `BSC_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `BSC_PARTICLE_COUNT` | Pengujian Particle Counter | PARTICLE | NUMBER | 0 | 0 | unit-convention fallback — particle counts are integers | high |
| `BSC_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `BSC_DOWNFLOW` | Pengujian Downflow | M_S | NUMBER | 0 | 2 | per-parameter override — airflow velocity in m/s — 2 dp per worksheet setpoints | high |
| `BSC_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `BSC_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `BSC_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `BSC_INFLOW` | Pengujian Inflow Velocity | M_S | NUMBER | 0 | 2 | per-parameter override — airflow velocity in m/s — 2 dp per worksheet setpoints | high |
| `BSC_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `BSC_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `BSC_UV_RADIATION` | Pengukuran Radiasi UV | UW_CM2 | NUMBER | 0 | 1 | unit-convention fallback — phototherapy irradiance — 1 dp | low |
| `BSC_HEPA_LEAK` | Pengukuran Kebocoran Hepa / Ulpa Filter | — | BOOLEAN | NULL | NULL | non-NUMBER — decimalPlaces stays NULL | n/a |
| `BSC_LIGHT_INTENSITY_ON` | Pengukuran Nilai Intensitas Cahaya (Lampu ON) | LUX | NUMBER | 0 | 0 | unit-convention fallback — illuminance in the thousands of lux | high |
| `BSC_LIGHT_INTENSITY_OFF` | Pengukuran Nilai Intensitas Cahaya (Lampu OFF) | LUX | NUMBER | 0 | 0 | unit-convention fallback — illuminance in the thousands of lux | high |
| `BSC_SOUND_LEVEL_ON` | Pengukuran Sound Level (Noise ON) | DBA | NUMBER | 0 | 0 | unit-convention fallback — A-weighted noise ≤60 dBA — integer | medium |
| `BSC_SOUND_LEVEL_OFF` | Pengukuran Sound Level (Noise OFF) | DBA | NUMBER | 0 | 0 | unit-convention fallback — A-weighted noise ≤60 dBA — integer | medium |

### BLANKET_WARMER

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `BLNW_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `BLNW_HIGH_TEMP` | Pengujian Proteksi Suhu Tinggi | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `BLNW_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `BLNW_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `BLNW_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `BLNW_TEMP_CALIBRATION` | Kalibrasi Suhu | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `BLNW_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `BLNW_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `BLNW_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### BLOOD_BANK_REFRIGERATORS

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `BBR_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `BBR_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `BBR_STORAGE_TEMP` | Keseragaman Suhu Penyimpanan (multi-titik T1–T9, 2–8 °C) | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `BBR_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `BBR_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `BBR_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `BBR_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `BBR_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### BLOOD_PRESSURE_MONITOR

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `BPM_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `BPM_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `BPM_SYSTOLIC` | Systole | MMHG | NUMBER | 0 | 0 | worksheet setpoint sweep is all-integer (["60","80","100","120","150","200"]) — confirms 0 dp | high |
| `BPM_DIASTOLIC` | Diastole | MMHG | NUMBER | 0 | 0 | worksheet setpoint sweep is all-integer (["30","50","65","80","100","150"]) — confirms 0 dp | high |
| `BPM_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `BPM_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `BPM_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `BPM_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `BPM_MAP` | Mean | MMHG | NUMBER | 0 | 0 | worksheet setpoint sweep is all-integer (["40","60","76","93","116","166"]) — confirms 0 dp | high |
| `BPM_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### BREAST_PUMPS

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `BREASTP_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `BREASTP_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `BREASTP_VACUUM_GAUGE` | Akurasi Vacuum Gauge | MMHG | NUMBER | 0 | 0 | unit-convention fallback — NIBP/vacuum pressures — integer setpoints across BSM/BPM/Sphyg/Suction, tolerance ±4–5 mmHg | high |
| `BREASTP_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `BREASTP_MAX_VACUUM` | Maximum Vacuum | MMHG | NUMBER | 0 | 0 | unit-convention fallback — NIBP/vacuum pressures — integer setpoints across BSM/BPM/Sphyg/Suction, tolerance ±4–5 mmHg | high |
| `BREASTP_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `BREASTP_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `BREASTP_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `BREASTP_TIME_MAX_VACUUM` | Waktu Yang Dibutuhkan Saat Daya Hisap Maksimum | SEC | NUMBER | 0 | 0 | per-parameter override — elapsed-time reading (deflation / rotation / recovery) — integer seconds/minutes | medium |
| `BREASTP_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### CENTRIFUGE

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `CENT_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `CENT_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `CENT_SPEED` | Kalibrasi Kecepatan Putar | REV_MIN | NUMBER | 0 | 0 | unit-convention fallback — rotational speed in the thousands of rpm, ±10 % | high |
| `CENT_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `CENT_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `CENT_TIME` | Kalibrasi Waktu Putar | SEC | NUMBER | 0 | 0 | per-parameter override — elapsed-time reading (deflation / rotation / recovery) — integer seconds/minutes | medium |
| `CENT_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `CENT_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `CENT_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### CENTRIFUGE_REFRIGERATOR

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `CRFR_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `CRFR_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `CRFR_SPEED` | Kalibrasi Kecepatan Putar | REV_MIN | NUMBER | 0 | 0 | unit-convention fallback — rotational speed in the thousands of rpm, ±10 % | high |
| `CRFR_STORAGE_TEMP` | Keseragaman Suhu Penyimpanan (multi-titik T1–T9) | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `CRFR_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `CRFR_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `CRFR_TIME` | Kalibrasi Waktu Putar | SEC | NUMBER | 0 | 0 | per-parameter override — elapsed-time reading (deflation / rotation / recovery) — integer seconds/minutes | medium |
| `CRFR_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `CRFR_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `CRFR_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### COLD_CHAIN

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `CCHAIN_EARTH_RESISTANCE` | Protective Earth Resistance | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `CCHAIN_ROOM_TEMP` | Room Temperature | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `CCHAIN_STORAGE_TEMP` | Storage Temperature Uniformity (multi-point, 2-10C) | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `CCHAIN_INSULATION_RESISTANCE` | Insulation Resistance | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `CCHAIN_ROOM_HUMIDITY` | Room Humidity | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `CCHAIN_EQUIP_LEAKAGE` | Equipment Leakage Current | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `CCHAIN_INPUT_VOLTAGE` | Input Voltage | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `CCHAIN_APPLIED_LEAKAGE` | Applied Part Leakage Current | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### CPAP

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `CPAP_CONCENTRATION` | Konsentrasi Oksigen | PERCENT | NUMBER | 0 | 0 | worksheet setpoint sweep is all-integer (["21","60"]) — confirms 0 dp | high |
| `CPAP_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `CPAP_FLOW_RATE` | Laju Aliran Gas | L_MIN | NUMBER | 0 | 1 | unit-convention fallback — gas/flow rate — flow analyser reads to 0.1 L/min; integer setpoints | medium |
| `CPAP_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `CPAP_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `CPAP_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `CPAP_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `CPAP_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `CPAP_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### DENTAL_UNIT

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `DUNIT_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `DUNIT_HP_SPEED_LOW` | Kecepatan Putar Handpiece (Low Speed) | REV_MIN | NUMBER | 0 | 0 | unit-convention fallback — rotational speed in the thousands of rpm, ±10 % | high |
| `DUNIT_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `DUNIT_HP_SPEED_HIGH` | Kecepatan Putar Handpiece (High Speed) | REV_MIN | NUMBER | 0 | 0 | unit-convention fallback — rotational speed in the thousands of rpm, ±10 % | high |
| `DUNIT_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `DUNIT_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `DUNIT_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `DUNIT_HP_PRESSURE` | Tekanan Handpiece | BAR | NUMBER | 0 | 1 | unit-convention fallback — pressure in bar — 1 dp | low |
| `DUNIT_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `DUNIT_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `DUNIT_ILLUMINANCE` | Illuminance (Jarak 70 cm) | LUX | NUMBER | 0 | 0 | unit-convention fallback — illuminance in the thousands of lux | high |
| `DUNIT_AIR_SPRAY` | Tekanan Semprot Udara | MMHG | NUMBER | 0 | 0 | unit-convention fallback — NIBP/vacuum pressures — integer setpoints across BSM/BPM/Sphyg/Suction, tolerance ±4–5 mmHg | high |
| `DUNIT_SUCTION` | Daya Hisap | MMHG | NUMBER | 0 | 0 | unit-convention fallback — NIBP/vacuum pressures — integer setpoints across BSM/BPM/Sphyg/Suction, tolerance ±4–5 mmHg | high |

### DENTAL_XRAY

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `DXRAY_COLLIMATION_LENGTH` | Uji Kolimasi (Panjang) | MM | NUMBER | 0 | 1 | unit-convention fallback — ECG amplitude/speed, collimation — 1 dp | low |
| `DXRAY_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `DXRAY_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `DXRAY_COLLIMATION_DIAMETER` | Uji Kolimasi (Diameter) | MM | NUMBER | 0 | 1 | unit-convention fallback — ECG amplitude/speed, collimation — 1 dp | low |
| `DXRAY_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `DXRAY_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `DXRAY_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `DXRAY_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `DXRAY_KV_ACCURACY` | Akurasi Tegangan Tinggi (kV) | KV | NUMBER | 0 | 1 | unit-convention fallback — tube voltage — convention 1 dp | low |
| `DXRAY_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `DXRAY_EXPOSURE_TIME` | Akurasi Waktu Penyinaran | SEC | NUMBER | 0 | 2 | per-parameter override — dental X-ray exposure — sub-second, 2 dp | medium |
| `DXRAY_DOSE_LINEARITY` | Linearitas Pengukuran | MGY | NUMBER | 0 | 2 | unit-convention fallback — radiation dose — 2 dp | low |
| `DXRAY_REPRODUCIBILITY` | Reproduksibilitas Keluaran Sinar-X | MGY | NUMBER | 0 | 2 | unit-convention fallback — radiation dose — 2 dp | low |
| `DXRAY_HVL_70KV` | Pengujian Half Value Layer (HVL) (70 kV) | MMAL | NUMBER | 0 | 1 | unit-convention fallback — HVL in mmAl — worksheet shows 1.5 / 2.3 mmAl | medium |
| `DXRAY_HVL_80KV` | Pengujian Half Value Layer (HVL) (80 kV) | MMAL | NUMBER | 0 | 1 | unit-convention fallback — HVL in mmAl — worksheet shows 1.5 / 2.3 mmAl | medium |

### ELECTRIC_BEDS

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `EBED_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `EBED_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `EBED_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `EBED_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `EBED_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `EBED_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `EBED_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### ELECTROCARDIOGRAPHS

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `ECG_AMPLITUDE` | Pengukuran Amplitudo | MM | NUMBER | 0 | 1 | unit-convention fallback — ECG amplitude/speed, collimation — 1 dp | low |
| `ECG_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `ECG_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `ECG_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `ECG_REC_SPEED` | Laju Rekaman | MM | NUMBER | 0 | 1 | unit-convention fallback — ECG amplitude/speed, collimation — 1 dp | low |
| `ECG_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `ECG_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `ECG_HR_CAL` | Kalibrasi Detak Jantung | BPM | NUMBER | 0 | 0 | worksheet setpoint sweep is all-integer (["60","90","120"]) — confirms 0 dp | high |
| `ECG_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `ECG_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `ECG_SINUSOID_TEST` | Uji Sinyal Sinusoida | MM | NUMBER | 0 | 1 | unit-convention fallback — ECG amplitude/speed, collimation — 1 dp | low |
| `ECG_NORMAL_TEST` | Uji Sinyal EKG Normal | MM | NUMBER | 0 | 1 | unit-convention fallback — ECG amplitude/speed, collimation — 1 dp | low |

### ELECTRO_ACCUPUNTURE

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `EST_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `EST_FREQUENCY` | Frekuensi | HZ | NUMBER | 0 | 0 | worksheet setpoint sweep is all-integer (["80","120","200"]) — confirms 0 dp | high |
| `EST_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `EST_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `EST_INTENSITY` | Intensitas Terapi | MA | NUMBER | 0 | 0 | worksheet setpoint sweep is all-integer (["10","20","30","40"]) — confirms 0 dp | high |
| `EST_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `EST_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `EST_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `EST_PULSE_DURATION` | Pulse Duration | MS | NUMBER | 0 | 2 | per-parameter override — setpoints 0.1 / 0.2 / 0.3 ms | medium |
| `EST_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `EST_TIMER` | Waktu | SEC | NUMBER | 0 | 0 | per-parameter override — elapsed-time reading (deflation / rotation / recovery) — integer seconds/minutes | medium |

### EXAMINATION_LAMP

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `EXLMP_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `EXLMP_INTENSITY` | Intensitas Cahaya | LUX | NUMBER | 0 | 0 | unit-convention fallback — illuminance in the thousands of lux | high |
| `EXLMP_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `EXLMP_CCT` | Color Temperature | KELVIN | NUMBER | 0 | 1 | unit-convention fallback — temperature family (stored as KELVIN uom) — treat as °C precision | low |
| `EXLMP_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `EXLMP_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `EXLMP_CRI` | Color Rendering Index | RA | NUMBER | 0 | 0 | unit-convention fallback — colour-rendering index reported as an integer (≥ limit) | medium |
| `EXLMP_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `EXLMP_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `EXLMP_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### FETAL_DOPPLER

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `FDOP_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `FDOP_HR_ACCURACY` | Kalibrasi Detak Jantung Bayi | BPM | NUMBER | 0 | 0 | worksheet setpoint sweep is all-integer (["30","60","90","120","150","180","210"]) — confirms 0 dp | high |
| `FDOP_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `FDOP_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `FDOP_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `FDOP_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `FDOP_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `FDOP_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### FLOW_METER

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `FM_FLOW_RATE` | Laju Aliran Gas | L_MIN | NUMBER | 0 | 1 | unit-convention fallback — gas/flow rate — flow analyser reads to 0.1 L/min; integer setpoints | medium |
| `FM_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `FM_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |

### HEAD_LAMP_MEDIK

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `HLAMP_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `HLAMP_INTENSITY` | Intensitas Cahaya | LUX | NUMBER | 0 | 0 | unit-convention fallback — illuminance in the thousands of lux | high |
| `HLAMP_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `HLAMP_CCT` | Color Temperature | KELVIN | NUMBER | 0 | 1 | unit-convention fallback — temperature family (stored as KELVIN uom) — treat as °C precision | low |
| `HLAMP_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `HLAMP_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `HLAMP_CRI` | Color Rendering Index | RA | NUMBER | 0 | 0 | unit-convention fallback — colour-rendering index reported as an integer (≥ limit) | medium |
| `HLAMP_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `HLAMP_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `HLAMP_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### HUMIDIFIER

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `HUM_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `HUM_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `HUM_TEMP_ACCURACY` | Akurasi Suhu | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `HUM_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `HUM_MAX_TEMP` | Suhu Maksimum | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `HUM_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `HUM_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `HUM_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `HUM_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### INFANT_WARMER

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `IW_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `IW_MAX_MATTRESS_TEMP` | Kalibrasi Suhu Maksimum pada Permukaan Matras | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `IW_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `IW_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `IW_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `IW_TEMP_CALIBRATION` | Kalibrasi Suhu | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `IW_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `IW_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `IW_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### INFUSION_PUMP

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `INFUS_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `INFUS_OCCLUSION` | Pengujian Occlusion/Pemampatan | PSI | NUMBER | 0 | 1 | unit-convention fallback — pressure in psi — 1 dp | low |
| `INFUS_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `INFUS_FLOW_RATE` | Kalibrasi Laju Aliran | ML_H | NUMBER | 0 | 1 | unit-convention fallback — infusion/syringe pump flow — reads to 0.1 mL/h | low |
| `INFUS_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `INFUS_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `INFUS_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `INFUS_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `INFUS_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### KULKAS_VAKSIN

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `KVAK_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `KVAK_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `KVAK_STORAGE_TEMP` | Keseragaman Suhu Penyimpanan (multi-titik T1–T9, 2–10 °C) | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `KVAK_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `KVAK_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `KVAK_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `KVAK_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `KVAK_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### LAMINAR_AIR_FLOW

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `LAF_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `LAF_PARTICLE_COUNT` | Pengujian Particle Counter | PARTICLE | NUMBER | 0 | 0 | unit-convention fallback — particle counts are integers | high |
| `LAF_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `LAF_DOWNFLOW` | Airflow Velocity | M_S | NUMBER | 0 | 2 | per-parameter override — airflow velocity in m/s — 2 dp per worksheet setpoints | high |
| `LAF_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `LAF_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `LAF_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `LAF_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `LAF_LIGHT_INTENSITY` | Pengukuran Nilai Intensitas Cahaya (Lighting) | LUX | NUMBER | 0 | 0 | unit-convention fallback — illuminance in the thousands of lux | high |
| `LAF_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `LAF_UV_RADIATION` | Pengukuran Radiasi UV | UW_CM2 | NUMBER | 0 | 1 | unit-convention fallback — phototherapy irradiance — 1 dp | low |
| `LAF_SOUND_LEVEL_BACKGROUND` | Pengukuran Sound Level (Background) | DBA | NUMBER | 0 | 0 | unit-convention fallback — A-weighted noise ≤60 dBA — integer | medium |
| `LAF_SOUND_LEVEL_COMPARTMENT` | Pengukuran Sound Level (Didalam Kompartemen) | DBA | NUMBER | 0 | 0 | unit-convention fallback — A-weighted noise ≤60 dBA — integer | medium |

### LAMPU_OPERASI

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `LOP_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `LOP_INTENSITY` | Intensitas Cahaya | LUX | NUMBER | 0 | 0 | unit-convention fallback — illuminance in the thousands of lux | high |
| `LOP_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `LOP_CCT` | Color Temperature | KELVIN | NUMBER | 0 | 1 | unit-convention fallback — temperature family (stored as KELVIN uom) — treat as °C precision | low |
| `LOP_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `LOP_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `LOP_CRI` | Color Rendering Index | RA | NUMBER | 0 | 0 | unit-convention fallback — colour-rendering index reported as an integer (≥ limit) | medium |
| `LOP_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `LOP_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `LOP_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### LARYNGOSKOP

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `LARYN_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `LARYN_INTENSITY` | Intensitas Cahaya | LUX | NUMBER | 0 | 0 | unit-convention fallback — illuminance in the thousands of lux | high |
| `LARYN_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `LARYN_CCT` | Color Temperature | KELVIN | NUMBER | 0 | 1 | unit-convention fallback — temperature family (stored as KELVIN uom) — treat as °C precision | low |
| `LARYN_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `LARYN_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `LARYN_CRI` | Color Rendering Index | RA | NUMBER | 0 | 0 | unit-convention fallback — colour-rendering index reported as an integer (≥ limit) | medium |
| `LARYN_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `LARYN_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `LARYN_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### MEDICAL_FREEZER

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `MFRZ_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `MFRZ_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `MFRZ_STORAGE_TEMP` | Keseragaman Suhu Penyimpanan (multi-titik T1–T9, −5 s/d −150 °C) | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `MFRZ_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `MFRZ_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `MFRZ_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `MFRZ_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `MFRZ_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### MEDICAL_REFRIGERATOR

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `MREF_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `MREF_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `MREF_STORAGE_TEMP` | Keseragaman Suhu Penyimpanan (multi-titik T1–T9, 2–8 °C) | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `MREF_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `MREF_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `MREF_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `MREF_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `MREF_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### MIKROSKOP_LABORATORIUM

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `MICRO_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `MICRO_MAG_4X` | Pembesaran Objektif 4x | UM | NUMBER | 0 | 2 | unit-convention fallback — micrometer-scale (microscope) — worksheet shows 0.01 mm | low |
| `MICRO_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `MICRO_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `MICRO_MAG_10X` | Pembesaran Objektif 10x | UM | NUMBER | 0 | 2 | unit-convention fallback — micrometer-scale (microscope) — worksheet shows 0.01 mm | low |
| `MICRO_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `MICRO_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `MICRO_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `MICRO_MAG_RATIO` | Nilai Ratio Pembesaran | — | RATIO | NULL | NULL | non-NUMBER — decimalPlaces stays NULL | n/a |
| `MICRO_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### NEBULIZER_COMPRESSOR

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `NCOMP_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `NCOMP_FLOW_RATE` | Laju Aliran Gas | L_MIN | NUMBER | 0 | 1 | unit-convention fallback — gas/flow rate — flow analyser reads to 0.1 L/min; integer setpoints | medium |
| `NCOMP_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `NCOMP_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `NCOMP_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `NCOMP_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `NCOMP_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `NCOMP_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### OVEN

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `OVEN_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `OVEN_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `OVEN_TEMP` | Suhu Pengeringan/Sterilisasi (multi-titik T1–T9) | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `OVEN_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `OVEN_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `OVEN_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `OVEN_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `OVEN_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### OXYGEN_CONCENTRATORS

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `O2CON_CONCENTRATION` | Konsentrasi Oksigen | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `O2CON_FLOW_RATE` | Laju Aliran Gas | L_MIN | NUMBER | 0 | 1 | unit-convention fallback — gas/flow rate — flow analyser reads to 0.1 L/min; integer setpoints | medium |
| `O2CON_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `O2CON_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |

### OXYMETER_MONITOR

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `OXYM_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `OXYM_HEART_RATE` | Heart Rate | BPM | NUMBER | 0 | 0 | unit-convention fallback — heart-rate simulator — integer setpoints, ±5 bpm | high |
| `OXYM_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `OXYM_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `OXYM_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `OXYM_SPO2` | Saturasi Oxygen (SPO2) | SPO2 | NUMBER | 0 | 0 | unit-convention fallback — SpO₂ % — integer simulator setpoints, ±3–4 % | high |
| `OXYM_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `OXYM_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `OXYM_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### PATIENT_MONITOR

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `PM_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `PM_HEART_RATE` | Heart Rate | BPM | NUMBER | 0 | 0 | unit-convention fallback — heart-rate simulator — integer setpoints, ±5 bpm | high |
| `PM_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `PM_SYSTOLIC` | Systole | MMHG | NUMBER | 0 | 0 | unit-convention fallback — NIBP/vacuum pressures — integer setpoints across BSM/BPM/Sphyg/Suction, tolerance ±4–5 mmHg | high |
| `PM_DIASTOLIC` | Diastole | MMHG | NUMBER | 0 | 0 | unit-convention fallback — NIBP/vacuum pressures — integer setpoints across BSM/BPM/Sphyg/Suction, tolerance ±4–5 mmHg | high |
| `PM_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `PM_RESP_RATE` | Respirasi | RPM | NUMBER | 0 | 0 | unit-convention fallback — respiration rate — integer, ±3 BrPM | high |
| `PM_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `PM_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `PM_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `PM_MAP` | Mean | MMHG | NUMBER | 0 | 0 | unit-convention fallback — NIBP/vacuum pressures — integer setpoints across BSM/BPM/Sphyg/Suction, tolerance ±4–5 mmHg | high |
| `PM_SPO2` | Saturasi Oxygen (SPO2) | SPO2 | NUMBER | 0 | 0 | unit-convention fallback — SpO₂ % — integer simulator setpoints, ±3–4 % | high |
| `PM_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### PHOTOTHERAPY

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `PHOTO_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `PHOTO_IRRADIANCE` | Pengujian Keluaran Spectral Irradiance | UW_CM2_NM | NUMBER | 0 | 1 | unit-convention fallback — phototherapy spectral irradiance — 1 dp | low |
| `PHOTO_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `PHOTO_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `PHOTO_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `PHOTO_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `PHOTO_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `PHOTO_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### PLATELET_AGITATOR_INCUBATOR

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `PLT_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `PLT_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `PLT_STORAGE_TEMP` | Keseragaman Suhu Penyimpanan (multi-titik T1–T9, 20–24 °C) | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `PLT_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `PLT_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `PLT_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `PLT_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `PLT_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### PULSE_OXIMETERS

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `PULSEOX_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `PULSEOX_HEART_RATE` | Heart Rate | BPM | NUMBER | 0 | 0 | worksheet setpoint sweep is all-integer (["30","60","120","180"]) — confirms 0 dp | high |
| `PULSEOX_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `PULSEOX_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `PULSEOX_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `PULSEOX_SPO2` | Saturasi Oxygen (SPO2) | SPO2 | NUMBER | 0 | 0 | worksheet setpoint sweep is all-integer (["98","93","92","85","90","70","88","90"]) — confirms 0 dp | high |
| `PULSEOX_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `PULSEOX_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `PULSEOX_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### RADIANT_WARMER

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `RW_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `RW_MAX_MATTRESS_TEMP` | Kalibrasi Suhu Maksimum pada Permukaan Matras | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `RW_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `RW_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `RW_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `RW_TEMP_CALIBRATION` | Kalibrasi Suhu | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `RW_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `RW_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `RW_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### RESUSCITATORS_CARDIAC

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `RESUS_C_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `RESUS_C_MAX_PRESSURE` | Nilai Tekanan Maksimum | CMH2O | NUMBER | 0 | 0 | unit-convention fallback — resuscitator / ventilator pressures — integer setpoints, ±20 % | medium |
| `RESUS_C_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `RESUS_C_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `RESUS_C_PRESSURE_ACC` | Kalibrasi Akurasi Tekanan Resuscitator | CMH2O | NUMBER | 0 | 0 | unit-convention fallback — resuscitator / ventilator pressures — integer setpoints, ±20 % | medium |
| `RESUS_C_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `RESUS_C_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `RESUS_C_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `RESUS_C_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### RESUSCITATORS_PULMONARY

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `RESUS_P_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `RESUS_P_MAX_PRESSURE` | Nilai Tekanan Maksimum | CMH2O | NUMBER | 0 | 0 | unit-convention fallback — resuscitator / ventilator pressures — integer setpoints, ±20 % | medium |
| `RESUS_P_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `RESUS_P_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `RESUS_P_PRESSURE_ACC` | Kalibrasi Akurasi Tekanan Resuscitator | CMH2O | NUMBER | 0 | 0 | worksheet setpoint sweep is all-integer (["10","20","30","40","65"]) — confirms 0 dp | high |
| `RESUS_P_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `RESUS_P_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `RESUS_P_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `RESUS_P_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### ROTATOR

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `ROT_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `ROT_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `ROT_SPEED` | Kalibrasi Kecepatan Putar | REV_MIN | NUMBER | 0 | 0 | unit-convention fallback — rotational speed in the thousands of rpm, ±10 % | high |
| `ROT_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `ROT_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `ROT_TIME` | Kalibrasi Waktu Putar | SEC | NUMBER | 0 | 0 | per-parameter override — elapsed-time reading (deflation / rotation / recovery) — integer seconds/minutes | medium |
| `ROT_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `ROT_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `ROT_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### SPHYGMOMANOMETERS

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `SPHYG_LEAK_TEST` | Uji Kebocoran | MMHG | NUMBER | 0 | 0 | unit-convention fallback — NIBP/vacuum pressures — integer setpoints across BSM/BPM/Sphyg/Suction, tolerance ±4–5 mmHg | high |
| `SPHYG_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `SPHYG_DEFLATION` | Laju Buang Cepat | SEC | NUMBER | 0 | 0 | per-parameter override — elapsed-time reading (deflation / rotation / recovery) — integer seconds/minutes | medium |
| `SPHYG_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `SPHYG_PRESSURE_ACC` | Pengukuran Akurasi Tekanan | MMHG | NUMBER | 0 | 0 | worksheet setpoint sweep is all-integer (["0","50","100","150","200","250"]) — confirms 0 dp | high |

### SPIROMETER

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `SPIRO_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `SPIRO_FVC` | Pengukuran Akurasi Total Volume Forced Vital Capacity (FVC) | L | NUMBER | 0 | 2 | per-parameter override — spirometer volume — setpoints 0.5 / 3 L | medium |
| `SPIRO_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `SPIRO_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `SPIRO_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `SPIRO_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `SPIRO_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `SPIRO_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### STERILLIZER

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `STER_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `STER_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `STER_TEMP` | Suhu Sterilisasi (multi-titik T1–T9) | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `STER_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `STER_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `STER_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `STER_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `STER_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### SUCTION_PUMP

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `SUCT_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `SUCT_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `SUCT_VACUUM_GAUGE` | Akurasi Vacuum Gauge | MMHG | NUMBER | 0 | 0 | unit-convention fallback — NIBP/vacuum pressures — integer setpoints across BSM/BPM/Sphyg/Suction, tolerance ±4–5 mmHg | high |
| `SUCT_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `SUCT_MAX_VACUUM` | Maximum Vacuum | MMHG | NUMBER | 0 | 0 | unit-convention fallback — NIBP/vacuum pressures — integer setpoints across BSM/BPM/Sphyg/Suction, tolerance ±4–5 mmHg | high |
| `SUCT_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `SUCT_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `SUCT_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `SUCT_TIME_MAX_VACUUM` | Waktu Yang Dibutuhkan Saat Daya Hisap Maksimum | SEC | NUMBER | 0 | 0 | per-parameter override — elapsed-time reading (deflation / rotation / recovery) — integer seconds/minutes | medium |
| `SUCT_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### SYRINGE_PUMP

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `SYR_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `SYR_OCCLUSION` | Pengujian Occlusion/Pemampatan | PSI | NUMBER | 0 | 1 | unit-convention fallback — pressure in psi — 1 dp | low |
| `SYR_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `SYR_FLOW_RATE` | Kalibrasi Laju Aliran | ML_H | NUMBER | 0 | 1 | unit-convention fallback — infusion/syringe pump flow — reads to 0.1 mL/h | low |
| `SYR_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `SYR_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `SYR_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `SYR_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `SYR_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### ULTRASONIC_NEBULIZERS

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `UNEB_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `UNEB_FLOW_RATE` | Laju Aliran Gas | L_MIN | NUMBER | 0 | 1 | unit-convention fallback — gas/flow rate — flow analyser reads to 0.1 L/min; integer setpoints | medium |
| `UNEB_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `UNEB_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `UNEB_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `UNEB_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `UNEB_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `UNEB_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |

### VENTILATOR

| code | name | uom | valueType | current | proposed | evidence source | confidence |
|---|---|---|---|---:|---:|---|---|
| `VENT_EARTH_RESISTANCE` | Resistansi Pembumian Protektif | OHM | NUMBER | 0 | 2 | unit-convention fallback — protective-earth resistance ≤ 0,3 Ω — small values, analyser reads to 0.01 Ω | medium |
| `VENT_ROOM_TEMP` | Suhu Ruangan | DEG_C | NUMBER | 0 | 1 | unit-convention fallback — temperature — reference thermometer/logger resolution 0.1 °C; tolerances stated to 0.1 °C | medium |
| `VENT_TIDAL_VOLUME` | Pengukuran Tidal Volume | ML | NUMBER | 0 | 0 | unit-convention fallback — tidal volume in mL — integer | medium |
| `VENT_INSULATION_RESISTANCE` | Resistansi Isolasi | MOHM | NUMBER | 0 | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range | low |
| `VENT_MINUTE_VOLUME` | Pengukuran Minute Volume | L | NUMBER | 0 | 2 | unit-convention fallback — minute volume — small values, 2 dp | low |
| `VENT_ROOM_HUMIDITY` | Kelembaban / RH | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |
| `VENT_EQUIP_LEAKAGE` | Arus Bocor Peralatan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `VENT_INPUT_VOLTAGE` | Tegangan Input | V | NUMBER | 0 | 1 | unit-convention fallback — mains voltage 220 V ±10 % — analyser reads to 0.1 V | medium |
| `VENT_RESP_RATE` | Pengukuran Respiration Rate | RPM | NUMBER | 0 | 0 | unit-convention fallback — respiration rate — integer, ±3 BrPM | high |
| `VENT_APPLIED_LEAKAGE` | Arus Bocor Bagian yang Diaplikasikan | UA | NUMBER | 0 | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA | low |
| `VENT_IE_RATIO` | Pengukuran I : E Ratio | — | RATIO | NULL | NULL | non-NUMBER — decimalPlaces stays NULL | n/a |
| `VENT_INSP_TIME` | Inspiratory Time (Ti) | SEC | NUMBER | 0 | 2 | per-parameter override — ventilator inspiratory/expiratory time ~1 s — 2 dp | medium |
| `VENT_EXP_TIME` | Expiratory Time (Te) | SEC | NUMBER | 0 | 2 | per-parameter override — ventilator inspiratory/expiratory time ~1 s — 2 dp | medium |
| `VENT_PEEP` | Pengukuran Positive End-Expiratory Pressure (PEEP) | CMH2O | NUMBER | 0 | 0 | unit-convention fallback — resuscitator / ventilator pressures — integer setpoints, ±20 % | medium |
| `VENT_PPEAK` | Peak Inspiratory Pressure (Ppeak) | CMH2O | NUMBER | 0 | 0 | unit-convention fallback — resuscitator / ventilator pressures — integer setpoints, ±20 % | medium |
| `VENT_FIO2` | Pengukuran FIO2 | PERCENT | NUMBER | 0 | 0 | unit-convention fallback — RH / FiO₂ / O₂ concentration — integer readings | medium |

---

## 5. Flagged — low-confidence, convention-only (170 rows, HUMAN SPOT-CHECK NEEDED)

Same treatment as the LK-gap parameters in the test-point extraction: **not guessed silently.**
Each of these has no worksheet setpoint evidence and only a weak unit convention. Dominated by the
electrical-safety block that repeats on almost every device type:

| uom | rows | proposed | note for the reviewer |
|---|---:|---:|---|
| UA (leakage current) | 96 | 1 | could be 0 if PKM records leakage as whole µA — one decision covers all 96 |
| MOHM (insulation resistance) | 48 | 0 | could be 1; usually over-range / whole — one decision covers all 48 |
| MM | 6 | 1 | ECG amplitude/speed, collimation length — check the ECG & Dental X-ray worksheets' gain columns |
| KELVIN | 4 | 1 | temperature rows stored with uom KELVIN — confirm these should mirror DEG_C = 1 |
| ML_H | 2 | 1 | infusion / syringe pump — confirm pump readout resolution |
| MIN | 2 | 0 | autoclave sterilization time — confirm whole minutes |
| MGY | 2 | 2 | dental X-ray dose |
| UW_CM2 / _NM | 3 | 1 | phototherapy irradiance meter resolution |
| PSI | 2 | 1 | dental unit air/water pressure |
| UM | 2 | 2 | microscope stage micrometer |
| KV | 1 | 1 | dental X-ray kV |
| BAR | 1 | 1 | dental unit high-pressure |
| L | 1 | 2 | ventilator minute volume |

Full list follows.

| code | device type | uom | proposed | rationale |
|---|---|---|---:|---|
| `AUD_INSULATION_RESISTANCE` | AUDIOMETER | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `AUD_EQUIP_LEAKAGE` | AUDIOMETER | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `AUD_APPLIED_LEAKAGE` | AUDIOMETER | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `ACLV_INSULATION_RESISTANCE` | AUTOCLAVE | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `ACLV_EQUIP_LEAKAGE` | AUTOCLAVE | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `ACLV_APPLIED_LEAKAGE` | AUTOCLAVE | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `ACLV_STER_TIME_121` | AUTOCLAVE | MIN | 0 | unit-convention fallback — recovery/sterilization time in minutes — integer |
| `ACLV_STER_TIME_134` | AUTOCLAVE | MIN | 0 | unit-convention fallback — recovery/sterilization time in minutes — integer |
| `INCU_INSULATION_RESISTANCE` | BABY_INCUBATOR | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `INCU_EQUIP_LEAKAGE` | BABY_INCUBATOR | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `INCU_APPLIED_LEAKAGE` | BABY_INCUBATOR | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `BSM_INSULATION_RESISTANCE` | BED_SIDE_MONITOR | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `BSM_EQUIP_LEAKAGE` | BED_SIDE_MONITOR | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `BSM_APPLIED_LEAKAGE` | BED_SIDE_MONITOR | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `BSC_INSULATION_RESISTANCE` | BIO_SAFETY_CABINET | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `BSC_EQUIP_LEAKAGE` | BIO_SAFETY_CABINET | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `BSC_APPLIED_LEAKAGE` | BIO_SAFETY_CABINET | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `BSC_UV_RADIATION` | BIO_SAFETY_CABINET | UW_CM2 | 1 | unit-convention fallback — phototherapy irradiance — 1 dp |
| `BLNW_INSULATION_RESISTANCE` | BLANKET_WARMER | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `BLNW_EQUIP_LEAKAGE` | BLANKET_WARMER | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `BLNW_APPLIED_LEAKAGE` | BLANKET_WARMER | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `BBR_INSULATION_RESISTANCE` | BLOOD_BANK_REFRIGERATORS | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `BBR_EQUIP_LEAKAGE` | BLOOD_BANK_REFRIGERATORS | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `BBR_APPLIED_LEAKAGE` | BLOOD_BANK_REFRIGERATORS | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `BPM_INSULATION_RESISTANCE` | BLOOD_PRESSURE_MONITOR | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `BPM_EQUIP_LEAKAGE` | BLOOD_PRESSURE_MONITOR | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `BPM_APPLIED_LEAKAGE` | BLOOD_PRESSURE_MONITOR | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `BREASTP_INSULATION_RESISTANCE` | BREAST_PUMPS | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `BREASTP_EQUIP_LEAKAGE` | BREAST_PUMPS | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `BREASTP_APPLIED_LEAKAGE` | BREAST_PUMPS | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `CENT_INSULATION_RESISTANCE` | CENTRIFUGE | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `CENT_EQUIP_LEAKAGE` | CENTRIFUGE | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `CENT_APPLIED_LEAKAGE` | CENTRIFUGE | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `CRFR_INSULATION_RESISTANCE` | CENTRIFUGE_REFRIGERATOR | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `CRFR_EQUIP_LEAKAGE` | CENTRIFUGE_REFRIGERATOR | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `CRFR_APPLIED_LEAKAGE` | CENTRIFUGE_REFRIGERATOR | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `CCHAIN_INSULATION_RESISTANCE` | COLD_CHAIN | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `CCHAIN_EQUIP_LEAKAGE` | COLD_CHAIN | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `CCHAIN_APPLIED_LEAKAGE` | COLD_CHAIN | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `CPAP_INSULATION_RESISTANCE` | CPAP | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `CPAP_EQUIP_LEAKAGE` | CPAP | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `CPAP_APPLIED_LEAKAGE` | CPAP | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `DUNIT_INSULATION_RESISTANCE` | DENTAL_UNIT | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `DUNIT_EQUIP_LEAKAGE` | DENTAL_UNIT | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `DUNIT_HP_PRESSURE` | DENTAL_UNIT | BAR | 1 | unit-convention fallback — pressure in bar — 1 dp |
| `DUNIT_APPLIED_LEAKAGE` | DENTAL_UNIT | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `DXRAY_COLLIMATION_LENGTH` | DENTAL_XRAY | MM | 1 | unit-convention fallback — ECG amplitude/speed, collimation — 1 dp |
| `DXRAY_COLLIMATION_DIAMETER` | DENTAL_XRAY | MM | 1 | unit-convention fallback — ECG amplitude/speed, collimation — 1 dp |
| `DXRAY_INSULATION_RESISTANCE` | DENTAL_XRAY | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `DXRAY_EQUIP_LEAKAGE` | DENTAL_XRAY | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `DXRAY_KV_ACCURACY` | DENTAL_XRAY | KV | 1 | unit-convention fallback — tube voltage — convention 1 dp |
| `DXRAY_APPLIED_LEAKAGE` | DENTAL_XRAY | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `DXRAY_DOSE_LINEARITY` | DENTAL_XRAY | MGY | 2 | unit-convention fallback — radiation dose — 2 dp |
| `DXRAY_REPRODUCIBILITY` | DENTAL_XRAY | MGY | 2 | unit-convention fallback — radiation dose — 2 dp |
| `EBED_INSULATION_RESISTANCE` | ELECTRIC_BEDS | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `EBED_EQUIP_LEAKAGE` | ELECTRIC_BEDS | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `EBED_APPLIED_LEAKAGE` | ELECTRIC_BEDS | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `EST_INSULATION_RESISTANCE` | ELECTRO_ACCUPUNTURE | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `EST_EQUIP_LEAKAGE` | ELECTRO_ACCUPUNTURE | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `EST_APPLIED_LEAKAGE` | ELECTRO_ACCUPUNTURE | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `ECG_AMPLITUDE` | ELECTROCARDIOGRAPHS | MM | 1 | unit-convention fallback — ECG amplitude/speed, collimation — 1 dp |
| `ECG_INSULATION_RESISTANCE` | ELECTROCARDIOGRAPHS | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `ECG_REC_SPEED` | ELECTROCARDIOGRAPHS | MM | 1 | unit-convention fallback — ECG amplitude/speed, collimation — 1 dp |
| `ECG_EQUIP_LEAKAGE` | ELECTROCARDIOGRAPHS | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `ECG_APPLIED_LEAKAGE` | ELECTROCARDIOGRAPHS | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `ECG_SINUSOID_TEST` | ELECTROCARDIOGRAPHS | MM | 1 | unit-convention fallback — ECG amplitude/speed, collimation — 1 dp |
| `ECG_NORMAL_TEST` | ELECTROCARDIOGRAPHS | MM | 1 | unit-convention fallback — ECG amplitude/speed, collimation — 1 dp |
| `EXLMP_CCT` | EXAMINATION_LAMP | KELVIN | 1 | unit-convention fallback — temperature family (stored as KELVIN uom) — treat as °C precision |
| `EXLMP_INSULATION_RESISTANCE` | EXAMINATION_LAMP | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `EXLMP_EQUIP_LEAKAGE` | EXAMINATION_LAMP | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `EXLMP_APPLIED_LEAKAGE` | EXAMINATION_LAMP | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `FDOP_INSULATION_RESISTANCE` | FETAL_DOPPLER | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `FDOP_EQUIP_LEAKAGE` | FETAL_DOPPLER | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `FDOP_APPLIED_LEAKAGE` | FETAL_DOPPLER | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `HLAMP_CCT` | HEAD_LAMP_MEDIK | KELVIN | 1 | unit-convention fallback — temperature family (stored as KELVIN uom) — treat as °C precision |
| `HLAMP_INSULATION_RESISTANCE` | HEAD_LAMP_MEDIK | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `HLAMP_EQUIP_LEAKAGE` | HEAD_LAMP_MEDIK | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `HLAMP_APPLIED_LEAKAGE` | HEAD_LAMP_MEDIK | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `HUM_INSULATION_RESISTANCE` | HUMIDIFIER | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `HUM_EQUIP_LEAKAGE` | HUMIDIFIER | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `HUM_APPLIED_LEAKAGE` | HUMIDIFIER | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `IW_INSULATION_RESISTANCE` | INFANT_WARMER | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `IW_EQUIP_LEAKAGE` | INFANT_WARMER | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `IW_APPLIED_LEAKAGE` | INFANT_WARMER | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `INFUS_OCCLUSION` | INFUSION_PUMP | PSI | 1 | unit-convention fallback — pressure in psi — 1 dp |
| `INFUS_FLOW_RATE` | INFUSION_PUMP | ML_H | 1 | unit-convention fallback — infusion/syringe pump flow — reads to 0.1 mL/h |
| `INFUS_INSULATION_RESISTANCE` | INFUSION_PUMP | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `INFUS_EQUIP_LEAKAGE` | INFUSION_PUMP | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `INFUS_APPLIED_LEAKAGE` | INFUSION_PUMP | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `KVAK_INSULATION_RESISTANCE` | KULKAS_VAKSIN | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `KVAK_EQUIP_LEAKAGE` | KULKAS_VAKSIN | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `KVAK_APPLIED_LEAKAGE` | KULKAS_VAKSIN | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `LAF_INSULATION_RESISTANCE` | LAMINAR_AIR_FLOW | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `LAF_EQUIP_LEAKAGE` | LAMINAR_AIR_FLOW | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `LAF_APPLIED_LEAKAGE` | LAMINAR_AIR_FLOW | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `LAF_UV_RADIATION` | LAMINAR_AIR_FLOW | UW_CM2 | 1 | unit-convention fallback — phototherapy irradiance — 1 dp |
| `LOP_CCT` | LAMPU_OPERASI | KELVIN | 1 | unit-convention fallback — temperature family (stored as KELVIN uom) — treat as °C precision |
| `LOP_INSULATION_RESISTANCE` | LAMPU_OPERASI | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `LOP_EQUIP_LEAKAGE` | LAMPU_OPERASI | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `LOP_APPLIED_LEAKAGE` | LAMPU_OPERASI | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `LARYN_CCT` | LARYNGOSKOP | KELVIN | 1 | unit-convention fallback — temperature family (stored as KELVIN uom) — treat as °C precision |
| `LARYN_INSULATION_RESISTANCE` | LARYNGOSKOP | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `LARYN_EQUIP_LEAKAGE` | LARYNGOSKOP | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `LARYN_APPLIED_LEAKAGE` | LARYNGOSKOP | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `MFRZ_INSULATION_RESISTANCE` | MEDICAL_FREEZER | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `MFRZ_EQUIP_LEAKAGE` | MEDICAL_FREEZER | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `MFRZ_APPLIED_LEAKAGE` | MEDICAL_FREEZER | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `MREF_INSULATION_RESISTANCE` | MEDICAL_REFRIGERATOR | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `MREF_EQUIP_LEAKAGE` | MEDICAL_REFRIGERATOR | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `MREF_APPLIED_LEAKAGE` | MEDICAL_REFRIGERATOR | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `MICRO_MAG_4X` | MIKROSKOP_LABORATORIUM | UM | 2 | unit-convention fallback — micrometer-scale (microscope) — worksheet shows 0.01 mm |
| `MICRO_INSULATION_RESISTANCE` | MIKROSKOP_LABORATORIUM | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `MICRO_MAG_10X` | MIKROSKOP_LABORATORIUM | UM | 2 | unit-convention fallback — micrometer-scale (microscope) — worksheet shows 0.01 mm |
| `MICRO_EQUIP_LEAKAGE` | MIKROSKOP_LABORATORIUM | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `MICRO_APPLIED_LEAKAGE` | MIKROSKOP_LABORATORIUM | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `NCOMP_INSULATION_RESISTANCE` | NEBULIZER_COMPRESSOR | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `NCOMP_EQUIP_LEAKAGE` | NEBULIZER_COMPRESSOR | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `NCOMP_APPLIED_LEAKAGE` | NEBULIZER_COMPRESSOR | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `OVEN_INSULATION_RESISTANCE` | OVEN | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `OVEN_EQUIP_LEAKAGE` | OVEN | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `OVEN_APPLIED_LEAKAGE` | OVEN | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `OXYM_INSULATION_RESISTANCE` | OXYMETER_MONITOR | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `OXYM_EQUIP_LEAKAGE` | OXYMETER_MONITOR | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `OXYM_APPLIED_LEAKAGE` | OXYMETER_MONITOR | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `PM_INSULATION_RESISTANCE` | PATIENT_MONITOR | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `PM_EQUIP_LEAKAGE` | PATIENT_MONITOR | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `PM_APPLIED_LEAKAGE` | PATIENT_MONITOR | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `PHOTO_IRRADIANCE` | PHOTOTHERAPY | UW_CM2_NM | 1 | unit-convention fallback — phototherapy spectral irradiance — 1 dp |
| `PHOTO_INSULATION_RESISTANCE` | PHOTOTHERAPY | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `PHOTO_EQUIP_LEAKAGE` | PHOTOTHERAPY | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `PHOTO_APPLIED_LEAKAGE` | PHOTOTHERAPY | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `PLT_INSULATION_RESISTANCE` | PLATELET_AGITATOR_INCUBATOR | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `PLT_EQUIP_LEAKAGE` | PLATELET_AGITATOR_INCUBATOR | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `PLT_APPLIED_LEAKAGE` | PLATELET_AGITATOR_INCUBATOR | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `PULSEOX_INSULATION_RESISTANCE` | PULSE_OXIMETERS | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `PULSEOX_EQUIP_LEAKAGE` | PULSE_OXIMETERS | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `PULSEOX_APPLIED_LEAKAGE` | PULSE_OXIMETERS | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `RW_INSULATION_RESISTANCE` | RADIANT_WARMER | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `RW_EQUIP_LEAKAGE` | RADIANT_WARMER | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `RW_APPLIED_LEAKAGE` | RADIANT_WARMER | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `RESUS_C_INSULATION_RESISTANCE` | RESUSCITATORS_CARDIAC | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `RESUS_C_EQUIP_LEAKAGE` | RESUSCITATORS_CARDIAC | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `RESUS_C_APPLIED_LEAKAGE` | RESUSCITATORS_CARDIAC | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `RESUS_P_INSULATION_RESISTANCE` | RESUSCITATORS_PULMONARY | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `RESUS_P_EQUIP_LEAKAGE` | RESUSCITATORS_PULMONARY | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `RESUS_P_APPLIED_LEAKAGE` | RESUSCITATORS_PULMONARY | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `ROT_INSULATION_RESISTANCE` | ROTATOR | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `ROT_EQUIP_LEAKAGE` | ROTATOR | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `ROT_APPLIED_LEAKAGE` | ROTATOR | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `SPIRO_INSULATION_RESISTANCE` | SPIROMETER | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `SPIRO_EQUIP_LEAKAGE` | SPIROMETER | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `SPIRO_APPLIED_LEAKAGE` | SPIROMETER | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `STER_INSULATION_RESISTANCE` | STERILLIZER | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `STER_EQUIP_LEAKAGE` | STERILLIZER | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `STER_APPLIED_LEAKAGE` | STERILLIZER | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `SUCT_INSULATION_RESISTANCE` | SUCTION_PUMP | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `SUCT_EQUIP_LEAKAGE` | SUCTION_PUMP | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `SUCT_APPLIED_LEAKAGE` | SUCTION_PUMP | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `SYR_OCCLUSION` | SYRINGE_PUMP | PSI | 1 | unit-convention fallback — pressure in psi — 1 dp |
| `SYR_FLOW_RATE` | SYRINGE_PUMP | ML_H | 1 | unit-convention fallback — infusion/syringe pump flow — reads to 0.1 mL/h |
| `SYR_INSULATION_RESISTANCE` | SYRINGE_PUMP | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `SYR_EQUIP_LEAKAGE` | SYRINGE_PUMP | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `SYR_APPLIED_LEAKAGE` | SYRINGE_PUMP | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `UNEB_INSULATION_RESISTANCE` | ULTRASONIC_NEBULIZERS | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `UNEB_EQUIP_LEAKAGE` | ULTRASONIC_NEBULIZERS | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `UNEB_APPLIED_LEAKAGE` | ULTRASONIC_NEBULIZERS | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `VENT_INSULATION_RESISTANCE` | VENTILATOR | MOHM | 0 | unit-convention fallback — insulation resistance > 2 MΩ — usually reported whole / over-range |
| `VENT_MINUTE_VOLUME` | VENTILATOR | L | 2 | unit-convention fallback — minute volume — small values, 2 dp |
| `VENT_EQUIP_LEAKAGE` | VENTILATOR | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |
| `VENT_APPLIED_LEAKAGE` | VENTILATOR | UA | 1 | unit-convention fallback — leakage current in µA — often integer but analyser reports 0.1 µA |

---

## 6. Setpoint-grounded rows (22) — highest confidence

| code | proposed | basis |
|---|---:|---|
| `EST_PULSE_DURATION` | 2 | setpoints 0.1 / 0.2 / 0.3 ms (decimal) |
| `SPIRO_FVC` | 2 | setpoints 0.5 / 3 L (decimal) + volume convention |
| `BSM_SYSTOLIC` `BSM_DIASTOLIC` `BSM_MAP` `BPM_SYSTOLIC` `BPM_DIASTOLIC` `BPM_MAP` `SPHYG_PRESSURE_ACC` | 0 | integer mmHg sweeps |
| `BSM_HEART_RATE` `ECG_HR_CAL` `FDOP_HR_ACCURACY` `PULSEOX_HEART_RATE` | 0 | integer bpm sweeps |
| `BSM_RESP_RATE` | 0 | integer BrPM sweep |
| `BSM_SPO2` `PULSEOX_SPO2` | 0 | integer % sweeps |
| `EST_FREQUENCY` `AUD_FREQUENCY_RESPONSE_KANAN` `AUD_FREQUENCY_RESPONSE_KIRI` | 0 | integer Hz sweeps |
| `AUD_PURE_TONE_LINEARITY_KANAN` `AUD_PURE_TONE_LINEARITY_KIRI` | 0 | integer dB sweeps |
| `EST_INTENSITY` | 0 | integer mA sweep |
| `CPAP_CONCENTRATION` | 0 | integer % sweep (21 / 60) |
| `RESUS_P_PRESSURE_ACC` | 0 | integer cmH₂O sweep |

---

## 7. Assumptions & decisions the reviewer should confirm

1. **Reading precision ≈ tolerance precision, capped at 2 dp.** No parameter is proposed above
   2 dp. The Redesign brief mentioned "Bed Side Monitor → 5 digits" as an *illustrative* example
   of the mechanism, not a measured fact; nothing in the corpus supports 5 dp for any NIBP
   parameter (integer mmHg sweep, ± 5 mmHg tolerance) — `BSM_*` NIBP is proposed at **0**. Flag if
   PKM genuinely records NIBP to 5 dp.
2. **`toleranceMin/Max` are `Decimal(18,4)`** — every proposed dp ≤ 2, so no tolerance column
   truncation risk from this proposal (the Redesign audit's "check B" concern does not bite here).
3. **DEG_C = 1 across the board** (77 rows). Chamber-uniformity / logger-summary temp rows
   (`*_STORAGE_TEMP`, `STER_TEMP`, `ACLV_*`) inherit the same 1 dp; confirm the 12-channel logger
   export isn't finer (0.01 °C) — if it is, those specific rows go to 2.
4. **The electrical-safety block is one decision, not 300.** `UA` (96), `MOHM` (48), `OHM` (48),
   `V` (48) repeat identically on every device type. Pick the precision once per unit and it
   applies everywhere.
5. **`INCU_AIR_TEMP` = 1** — kept consistent with its 10 test points (§A2 of the test-point
   extraction). Its per-point tolerances are ± 1.5 / ± 0.8 °C.
6. Non-NUMBER rows (`VENT_IE_RATIO`, `MICRO_MAG_RATIO`, `BSC_HEPA_LEAK`) are left `NULL` — not
   touched by the script.

---

## 8. Draft backfill script

`packages/db/prisma/backfill-decimal-places.ts` — **written, NOT run.**

- Mirrors the existing convention (`import { prisma } from "../src/index"`, resolve by `code`,
  explicit summary log, `process.exit(1)` on error — same shape as
  `backfill-device-calibration-parameter-tolerances.ts` / `seed-calibration-test-points.ts`).
- **Idempotent:** only updates NUMBER rows whose `decimalPlaces` is still `0` or `NULL`; a row a
  human has since set to a real value (`> 0`) is skipped. Clean re-run = no-op.
- **`MIN_CONFIDENCE` gate** (`high` | `medium` | `low`, default `medium`): lets the reviewer apply
  only the well-grounded rows first and leave the 170 low-confidence rows at `0` for a later
  spot-check pass — `MIN_CONFIDENCE=high` applies 57 rows, `medium` applies 318, `low` applies all
  488.
- Run command (Stage 2, AFTER approval):
  ```
  pnpm --filter @medcal/db generate
  MIN_CONFIDENCE=medium pnpm --filter @medcal/db exec tsx --env-file ../../.env prisma/backfill-decimal-places.ts
  ```

---

## 9. HARD STOP

No backfill executed. No schema, migration, or application file changed. The only files written
are this report and the draft `backfill-decimal-places.ts`. Await review of §5 (the 170
low-confidence rows) and §7 (assumptions) before Stage 2.
