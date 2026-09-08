# Unscoped calibration-results types — catalog extraction (Step 5)

**Date:** 2026-09-08
**Mode:** Inventory only. **No `DeviceType` / `DeviceCalibrationParameter` rows
were inserted.** `seed-device-taxonomy-extension-parameters.ts` already lists
Auto Chemistry Analyzer, Hematologi Analyzer, Thermohygrometer, Otoscope, and
Phaco as **out of scope**. Inventing ~150 parameter codes without a capability
map would violate that lock.

Evidence: `Input Data` of `docs/technician-docs/measurement-results/*.xlsx`.

---

## Decision

These 23 files (≈20 product families) are **catalog gaps**, not silent seed
candidates. Env/electrical blocks that exist can reuse the shared
`envElecID()` pattern *after* DeviceType + capability items are designed.

Corrupt / unusable as catalog source:

| File | Why |
|---|---|
| `Mikropipet.xlsx` | Title mikropipet, Nama Alat = Baby Incubator |
| `Kelistrikan.xlsx` | Electrical-safety-only LK; Nama Alat = Hematologi Analyzer |
| `Uji Fungsi Fisik.xlsx` | Nama Alat = Laser Ndyag |
| `Defibrilator.xlsx` | Title is “dengan ECG”; Nama Alat parser hit “Pemilik :” (layout) |

---

## Per-file kinerja shape

| File | Recommended future `DeviceType` | Earth block | Kinerja sections seen |
|---|---|---|---|
| Auto Chemistry Analyzer | `AUTO_CHEMISTRY_ANALYZER` | yes | numeric panel (no named sweep labels in extract) |
| Defibrilator | `DEFIBRILLATOR` | yes | Sync; charge-to-max-energy time; output energy (J) |
| Defibrilator dengan ECG | `DEFIBRILLATOR` + ECG | yes | + Heart Rate |
| Defibrilator dengan SPO2 | `DEFIBRILLATOR` + SpO₂ | yes | + HR + SpO₂ |
| Defibrilator dengan Pasien Monitor | `DEFIBRILLATOR` + PM | yes | + HR + Resp + SpO₂ |
| Echocardiograph | `ECHOCARDIOGRAPH` | yes | 12-lead visual; HR; amplitude; record speed; dead zone; axial/lateral res; vertical/horizontal distance |
| Ultrasonograph (USG) | `ULTRASONOGRAPH` | yes | Dead zone; axial/lateral; penetration; vertical/horizontal distance |
| GCU,HB | `GLUCOSE_METER` | no | Kinerja block present, few labels |
| Hematologi Analyzer | `HEMATOLOGY_ANALYZER` | yes | Numeric panel (7.7 / 4.63 / 38.9 / 13.5 — CBC-like) |
| Urine Analyzer | `URINE_ANALYZER` | yes | Kinerja block, few labels |
| Light Cure | `LIGHT_CURE` | no | Spectral irradiance |
| Otoscope | *(title is Laryngoscope Light)* | yes | Illuminance-like 95.x — **identity clash with LARYNGOSKOP** |
| Phaco Emulsifikasi | `PHACO` | yes | Daya hisap + naik/turun (suction-like) |
| Thermohygrometer | `THERMOHYGROMETER` | no | Suhu I–VI; RH I–VI; naik/turun |
| Thermohygrometer Kulkas | `THERMOHYGROMETER` variant | no | same shape |
| Thermometer Ear / IR | `IR_THERMOMETER` | no | 35.1 / 36.9 / 41.1 °C (1 dp) |
| Thermometer Klinik | `CLINICAL_THERMOMETER` | no | 34.9–42.2 °C (1 dp) |
| Timbangan Analytic | `ANALYTICAL_BALANCE` | no | Repeatability; 299.97 (2 dp) |
| Timbangan Bayi | `BABY_SCALE` | no | Repeatability (title leftover “Dewasa”) |
| Timbangan Dewasa | `ADULT_SCALE` | no | Repeatability |

Four defibrillator workbooks are **variants of one family**, not four unrelated
types — needs a taxonomy decision (one type + optional modules vs four types)
before any seed.

---

## Remaining gap (this step)

- No new `DeviceType` rows.
- No new `DeviceCalibrationParameter` rows.
- No `CalibrationTestPoint` for these families.
- Follow-up: design DeviceType (+ aliases), then env/elec via `envElecID`, then
  Pattern A/B/D from the section list above — same staged HARD STOP as the
  original 24-type extension.
