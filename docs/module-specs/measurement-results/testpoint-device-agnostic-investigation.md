# Investigation: Apakah settingValue CalibrationTestPoint Device-Agnostic atau Device-Specific per Capability?

Date: 2026-09-10 (report captured 2026-09-11)
Mode: READ-ONLY — no schema/code/seed changes.

## Pertanyaan

Untuk capability/parameter yang sama secara klinis tapi muncul di lebih
dari satu DeviceType (mis. Heart Rate ada di Bed Side Monitor DAN Pulse
Oximeter) — apakah titik ujinya (`settingValue`, jumlah titik) identik
antar device, atau berbeda? Jawaban ini menentukan apakah endpoint
"copy CalibrationTestPoint" (fase 2 dari fitur copy-paste parameter)
layak dibangun sebagai copy langsung, atau harus tetap manual / lewat
review.

## Method

Direkonstruksi rantai DeviceType → DeviceCapabilityItem →
DeviceCalibrationParameter → CalibrationTestPoint dari seed files, lalu
di-cross-check terhadap dua sumber primer independen:

1. Template LK kosong (`docs/technician-docs/Lembar-Kerja/*.docx`).
2. Data Excel kalibrasi terisi nyata (`docs/technician-docs/measurement-results/*.xlsx`,
   password `1004`, sheet `Input Data`) — dibuka dengan `msoffcrypto-tool`
   + `openpyxl` (Python 3.13).

Ketiga sumber (kode seed, template kosong, data Excel nyata) saling
konsisten di setiap titik overlap.

## Step 1 — Grup ditemukan (capabilityItem code sama, DeviceType berbeda)

| Capability item | Capability | Device types | Parameter codes |
|---|---|---|---|
| `HEART_RATE` | VITAL_SIGNS_MONITORING | BED_SIDE_MONITOR, PULSE_OXIMETERS, OXYMETER_MONITOR, PATIENT_MONITOR | `BSM_HEART_RATE`, `PULSEOX_HEART_RATE`, `OXYM_HEART_RATE`, `PM_HEART_RATE` |
| `SPO2_ACCURACY` | VITAL_SIGNS_MONITORING | sama 4 device | `BSM_SPO2`, `PULSEOX_SPO2`, `OXYM_SPO2`, `PM_SPO2` |
| `RESPIRATION_RATE` | VITAL_SIGNS_MONITORING | BED_SIDE_MONITOR, PATIENT_MONITOR | `BSM_RESP_RATE`, `PM_RESP_RATE` |
| `SYSTOLIC/DIASTOLIC/MEAN_ARTERIAL_PRESSURE` (NIBP) | NIBP | BLOOD_PRESSURE_MONITOR, BED_SIDE_MONITOR, PATIENT_MONITOR | `BPM_*`, `BSM_*`, `PM_*` |
| `WARMER_TEMPERATURE_CALIBRATION` | WARMER_SURFACE_TEMPERATURE | INFANT_WARMER, RADIANT_WARMER, BLANKET_WARMER | `IW_TEMP_CALIBRATION`, `RW_TEMP_CALIBRATION`, `BLNW_TEMP_CALIBRATION` |

Related-but-deliberately-separate (different capabilityItemCode, same
clinical word "heart rate"): `ECG_HR_CAL` (Electrocardiograph),
`FDOP_HR_ACCURACY` (Fetal Doppler) — kept apart in the catalog design
itself, reinforcing that "same word" ≠ "same points".

Of the five true groups, only **BSM/PULSEOX (Heart Rate, SpO2)** and
**BSM/BPM (NIBP)** currently have seeded `CalibrationTestPoint` rows.
`OXYM_*`, `PM_*`, `IW_TEMP_CALIBRATION`, `RW_TEMP_CALIBRATION` exist in
the catalog (with tolerance metadata) but have zero seeded test points —
exactly the gap the copy-paste feature is meant to close.

## Step 2/3 — Value comparison (seed + blank template + real filled Excel)

### Group A: Heart Rate — BSM vs PULSEOX → **SAMA**

Identical 4-point array (30, 60, 120, 180 bpm), identical order,
identical tolerance (± 5 bpm). Confirmed in seed + template + real Excel
for both devices.

### Group B: SpO2 — BSM vs PULSEOX → **SAMA (settingValue) / tolerance differs**

Identical 8-point array (98, 93, 92, 85, 90, 70, 88, 90 — including the
duplicated 90 at position 8), identical order. Tolerance differs by
device: BSM ± 3 %, PulseOx ± 4 %. Tolerance lives on the parent
`DeviceCalibrationParameter` (toleranceNote), not on `CalibrationTestPoint`
(all point rows have `toleranceMin/Max = NULL`, inheriting the parent) —
so this difference doesn't corrupt a settingValue-only copy, but must not
be forgotten if per-point tolerance overrides are ever introduced.

### Group C: NIBP (Sys/MAP/Dia) — BSM vs BPM → **BEDA**

BSM has 7 points, BPM has 6. BPM's 6 triples are a reordered *subset* of
BSM's; BSM has one extra high-pressure triple (250/215/195, measured "at
heart rate 90 BPM" per the worksheet) that BPM never measures. Count,
order, and content all differ — a blind copy would either drop a
required BSM point or introduce an unvalidated point on BPM.

### Group D (unseeded, strong indirect evidence): PM_* and OXYM_*

`backfill-device-calibration-parameter-tolerances.ts` comments explicitly
tie PM_* tolerance notes to `LK Bed Side Monitor.docx (shared with
PATIENT_MONITOR)` and OXYM_* to `LK Pulse Oxymeter.docx (shared with
OXYMETER_MONITOR)`. No separate LK/Excel exists for Patient Monitor or
Oxymeter Monitor — the real BSM Excel's device-name field is literally
filled in as "Bed Side Monitor (Patient Monitor)". All PM_* tolerance
notes are byte-identical to BSM_*'s. **Likely SAMA, but numerically
unverified** — zero CalibrationTestPoint rows exist yet for
PATIENT_MONITOR or OXYMETER_MONITOR.

### Group E (unseeded): Warmer Temperature Calibration

`IW_TEMP_CALIBRATION` (Infant Warmer) and `RW_TEMP_CALIBRATION` (Radiant
Warmer) share an identical tolerance note (single 36 °C setpoint, ± 2 °C)
— **likely SAMA, unverified** (no seeded test points for either).
`BLNW_TEMP_CALIBRATION` (Blanket Warmer, adult use) shares the same
capabilityItemCode but has a 3-point sweep [33, 35, 40] °C at ± 3 °C — a
different device population (adult vs neonatal). **BEDA** relative to
IW/RW.

## Step 4 — Classification summary

| Group | Classification | Basis |
|---|---|---|
| Heart Rate: BSM ↔ PULSEOX | **SAMA** | Identical 4-point array/order/tolerance across seed, template, real Excel |
| SpO2: BSM ↔ PULSEOX | **SAMA** (settingValue only) | Identical 8-point array/order; tolerance differs but lives on parent parameter |
| NIBP: BSM ↔ BPM | **BEDA** | Different count (7 vs 6), order, and content — BSM has an unmatched high-range triple |
| Heart Rate/SpO2/Resp/NIBP: BSM ↔ PATIENT_MONITOR | **Unverified — likely SAMA** | Zero test points seeded for PM; identical tolerance notes; shared real worksheet |
| Heart Rate/SpO2: PULSEOX ↔ OXYMETER_MONITOR | **Unverified — likely SAMA** | Zero test points seeded for OXYM; shared source worksheet confirmed by comment |
| Warmer temp: INFANT_WARMER ↔ RADIANT_WARMER | **Unverified — likely SAMA** | Zero test points seeded; identical tolerance note implies identical single setpoint |
| Warmer temp: (IW/RW) ↔ BLANKET_WARMER | **BEDA** | Different population (neonatal vs adult), tolerance, point count, and values |

## Recommendation

Blind-copy is not uniformly safe — some device-type pairs within the same
named capability are proven identical, others are proven different, and
the UI cannot tell them apart from the capability name alone. The feature
should pre-fill the target's CalibrationTestPoint rows from the source as
a **suggested draft, with a mandatory review/edit screen before save** —
never auto-commit. NIBP (BSM↔BPM) and Warmer Temperature (Blanket vs
Infant/Radiant) must not be offered as blind-copy candidates.

## Key file paths referenced

- `packages/db/prisma/seed-device-calibration-parameters.ts`
- `packages/db/prisma/seed-calibration-test-points.ts`
- `packages/db/prisma/seed-device-types.ts`
- `packages/db/prisma/seed-device-taxonomy-extension-parameters.ts`
- `packages/db/prisma/backfill-device-calibration-parameter-tolerances.ts`
- `docs/technician-docs/Lembar-Kerja/LK Bed Side Monitor.docx`
- `docs/technician-docs/Lembar-Kerja/LK Pulse Oxymeter.docx`
- `docs/technician-docs/Lembar-Kerja/LK Blood Pressure Monitor.docx`
- `docs/technician-docs/measurement-results/Bed Side Monitor.xlsx`
- `docs/technician-docs/measurement-results/Pulse Oximeter.xlsx`
- `docs/technician-docs/measurement-results/Blood Pressure Monitor.xlsx`
- `docs/claude/plans/Calibration-management/measurement-results/calibration-results-cross-check.md` (§3.1/3.2)
