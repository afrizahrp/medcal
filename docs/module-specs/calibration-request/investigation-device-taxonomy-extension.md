# Investigation: Extending Device Taxonomy to Full technician-docs.zip Coverage

## Summary

`docs/technician-docs/` contains exactly 50 `.docx` files. Of these, 27 map to already-modeled `DeviceType`s (as expected), 2 are the flagged mislabeled files (`LK Otoscope.docx`, `LK Phaco Emulsifikasi.docx` — both **confirmed mismatched**, see Task D), and the remaining **21 files cover genuinely new device types**, not ~22 as the brief estimated and not the exact 26-name list in the brief — the actual list needed two corrections (see Task A intro).

Of these 21 new device types: **11 can fully reuse existing `DeviceCapability`/`DeviceCapabilityItem` rows** (Infusion Pump, Centrifuge, Centrifuge Refrigerator, Rotator, Mikroskop Laboratorium, Suction Pump-family duplicates aside, Nebulizer-family already covered), **~13 need at least one new capability** (Audiometer, Auto Chemistry Analyzer, Autoclave, Bio Safety Cabinet, CPAP, Dental Unit, Dental X-Ray, Electro Accupunture, light-source family [Examination Lamp/Head Lamp Medik/Lampu Operasi/Laryngoskop], Fetal Doppler, Hematologi Analyzer, pH Meter, Phototherapy, Spirometer), and **3 device types (Auto Chemistry Analyzer, Hematologi Analyzer, pH Meter) have free-form/dynamic parameter lists that do not fit the existing structured capability-catalog model well** — same risk pattern flagged in prior work, now confirmed to extend beyond Hematology/Chemistry.

For Task B, the 9 existing `DeviceCategory` values **cannot** reasonably home all 21 new device types without stretching definitions; **4 new category groupings are proposed**: Laboratory & Diagnostic Equipment, Dental Equipment, Medical Lighting, and Audiology/Physiological Testing (folding CPAP into Respiratory & Oxygen, EST into a therapy grouping — see Task B for full reasoning).

Task C found the seeded `DeviceCalibrationParameter` tolerances for the 27 already-covered device types were **already backfilled directly from `technician-docs/` content** (not the older 30-document set), per `backfill-device-calibration-parameter-tolerances.ts`. Comparing the OLDER `Penilaian Kemampuan` source against `technician-docs/` directly (the real two-source comparison) surfaced **two concrete discrepancies**: (1) Blood Pressure Monitor NIBP tolerance changed from **± 8 mmHg** (old) to **± 5 mmHg** (new/seeded), and (2) Baby Incubator's "Waktu Pemulihan Lonjakan Suhu" (temperature recovery time) has an explicit tolerance of **≤ 15 menit** in the OLD source that is **entirely missing** from the `technician-docs/` version — which explains why the seeded `INCU_RECOVERY_TIME` row is the sole `unresolved` (null) tolerance in the whole 242-row set. No other missing-document gaps beyond the known Ventilator gap were found among the 27.

Task D confirms both flagged files are mislabeled: `LK Otoscope.docx` contains a pure light-source test (Spectral Chromometer, Intensitas Cahaya/Color Temperature/CRI) identical in structure to the Examination Lamp/Lampu Operasi/Laryngoskop/Head Lamp Medik family, with no otoscope-specific content (no funnel/speculum/illumination-at-tip test). `LK Phaco Emulsifikasi.docx` contains a pure vacuum/suction test (Digital Pressure Meter, "Kalibrasi daya hisap", ± 10%) structurally identical to `LK Suction Pump.docx`, with no phaco-emulsification-specific content (no ultrasonic power/frequency/stroke parameters). Both device types already have separate, correctly-labeled LK documents elsewhere in the corpus, making these two files redundant/erroneous duplicates rather than genuine new device-type sources.

---

## Task A — Capability Reuse vs. New Capability Needed (per new device type)

**Correction to the brief's device list**: The brief named 26 devices as the "~22 new" set. Two of those names, `LK Otoscope.docx` and `LK Phaco Emulsifikasi.docx`, are addressed separately under Task D (they are not new device types — they are mislabeled duplicates). Two additional device types exist in `technician-docs/` that were **not** in the brief's list and should be added to the candidate set: **Blanket Warmer** and **Thermohygrometer** (the latter is itself a calibrated reference instrument, not just equipment used to calibrate other devices — it has its own LK with a climatic-chamber performance test). Net: **21 genuinely new device types** (24 named minus Otoscope/Phaco, plus Blanket Warmer and Thermohygrometer).

For each, "Environmental Conditions" (room temp/humidity/voltage) and "Electrical Safety" (earth resistance, insulation resistance, leakage currents) are present in nearly every LK and always reuse the existing `ENVIRONMENTAL_CONDITIONS` / `ELECTRICAL_SAFETY` capabilities — this is not repeated per-device below; only the performance-test section is discussed.

### Audiometer
Measures: dB Pure Tone Linearity (multiple frequencies at fixed dB, ± 1 dB), Frequency Response (± 2%), plus a physical/electrical-safety section. No existing capability matches — needs a new **`AUDIOMETRIC_PERFORMANCE`** capability with items `PURE_TONE_LINEARITY`, `FREQUENCY_RESPONSE`. The test structure (per-earphone, per-frequency grid) is more structured/tabular than free-form, so it fits the model reasonably well, though item cardinality is higher than most existing capabilities.

### Auto Chemistry Analyzer
Measures a long list (~24) of named clinical-chemistry analytes (ALT, Albumin, ALP, Amylase, AST, Bilirubin, blood gases, Calcium, Chloride, Cholesterol, Creatinine, Glucose, etc.), each with its own tolerance, sourced from the analyzer's control/reference certificate. The document explicitly instructs: *"Jika pada UUT tidak ada parameter sesuai yang diatas maka ambil parameter sesuai yang ada pada uut ... Jangan lupa tulis nama parameter uut pada kolom parameter jika berbeda"* — i.e., technicians substitute in whatever analyte list the actual instrument's control certificate specifies, with the certificate's own tolerance. **This does not fit the structured capability-item model** — the parameter set is dynamically instrument-dependent, not a fixed catalog. Confirms the earlier-flagged risk explicitly for this device type.

### Autoclave
Measures Suhu Chamber (chamber temp, multi-sensor deltas, ± 2°C/± 5°C/± 2°C), Suhu Sterilisasi (sterilization temp bands: 121°C ~124°C, 134°C~137°C), Waktu Sterilisasi (≥ 15 min at 121°C, ≥ 3 min at 134°C). This maps directly onto the existing **`TEMPERATURE_CHAMBER_STERILIZATION`** capability (`CHAMBER_TEMPERATURE`, `STERILIZATION_TEMPERATURE`, `STERILIZATION_TIME`) — full reuse, no new capability needed. (Note: `CHAMBER_TEMPERATURE` currently has no `ITEM_CAPABILITY_BY_CODE` mapping row visible in the tolerance backfill for STERILLIZER/OVEN's chamber-temp sub-item — only a generic multi-point suhu chamber structure appears; this is a minor structural nuance worth checking during actual seeding, not a blocker.)

### Bio Safety Cabinet
Measures Particle Counter (0.5 µm, ≤ 100 particles), Downflow/Inflow Velocity (m/s, device-specific ranges), Lighting (≥ 450/≤ 160 lux for ON/OFF), Sound Level (≤ 70/60 dBA), UV Radiation (≥ 40 µW/cm²), plus qualitative smoke-pattern airflow tests and a HEPA/ULPA leak test (Pass/Fail). No existing capability covers particle counts, airflow velocity, or HEPA integrity. Needs a new **`CLEAN_AIR_CONTAINMENT`** capability with items `PARTICLE_COUNT`, `DOWNFLOW_VELOCITY`, `INFLOW_VELOCITY`, `LIGHT_INTENSITY`, `SOUND_LEVEL`, `UV_RADIATION`, `HEPA_LEAK_TEST`. (Laminar Air Flow, below, shares most of this same set.)

### Centrifuge
Measures Kalibrasi Kecepatan Putar (rotation speed, Min/Med/Max, ± 10%) and Kalibrasi Waktu Putar (rotation time, ± 10%), plus an optional multi-point compartment temperature table (± 3°C) for refrigerated units. **Fully reuses `ROTATIONAL_SPEED`** (`ROTATION_SPEED_ACCURACY`, `ROTATION_TIME_ACCURACY`). No new capability needed for the core test.

### Centrifuge Refrigerator
Identical rotation-speed/rotation-time test to Centrifuge, plus the multi-point compartment temperature table (18+ points, ± 3°C, setting per device's usage range). Rotation portion reuses `ROTATIONAL_SPEED`; the temperature portion reuses **`TEMPERATURE_COLD_STORAGE`** (`STORAGE_TEMPERATURE_UNIFORMITY`). Full reuse across two existing capabilities — no new capability needed.

### CPAP
Measures Pengukuran Konsentrasi Oksigen (± 3%) and Pengukuran Laju Aliran (± 20%). This is structurally identical to Oksigen Concentrator's test and **fully reuses `OXYGEN_CONCENTRATION`** (`OXYGEN_CONCENTRATION_ACCURACY`) and **`GAS_FLOW_RATE`** (`FLOW_RATE_ACCURACY`). No new capability needed. (Electrical-safety leakage thresholds differ slightly from Oksigen Concentrator's — ≤100/50 µA vs. others — but that's a per-DeviceType tolerance value, not a capability-model issue.)

### Dental Unit
Measures Kecepatan Putar Handpiece (Low Speed 5,000–11,000 rpm; High Speed >250,000 rpm), Tekanan Handpiece (3.0–4.0 bar), Illuminance (>15,000 lux at 70cm), Tekanan Semprot Udara (spray air pressure, 250–500 mmHg), Daya Hisap (suction, −150 to −450 mmHg). No single existing capability covers this multi-parameter dental-specific bundle (rotational handpiece speed + air/spray pressure + suction + illuminance together). Needs a new **`DENTAL_UNIT_PERFORMANCE`** capability with items `HANDPIECE_SPEED_LOW`, `HANDPIECE_SPEED_HIGH`, `HANDPIECE_PRESSURE`, `LIGHT_ILLUMINANCE`, `AIR_SPRAY_PRESSURE`, `SUCTION_PRESSURE`. (Handpiece speed could arguably reuse `ROTATIONAL_SPEED`, and suction could reuse `VACUUM_SUCTION`, but the document bundles all of these as one coherent "Hasil Pengukuran Kinerja Alat" table for a single device — a design call for whoever seeds this.)

### Dental X-Ray
Measures Uji Kolimasi (collimation: length ≥200mm, diameter ≤60mm), Akurasi Tegangan Tinggi/kV (± 6%), Akurasi Waktu Penyinaran (± 10%), Linearitas Pengukuran/dose linearity (± 10%), Reproduksibilitas Keluaran Sinar-X (± 10%, CV ≤0.05), Half Value Layer/HVL (mmAl thresholds by kV). This is classic diagnostic-X-ray QA testing with no existing analog. Needs a new **`XRAY_PERFORMANCE`** capability with items `COLLIMATION_ACCURACY`, `KV_ACCURACY`, `EXPOSURE_TIME_ACCURACY`, `DOSE_LINEARITY`, `OUTPUT_REPRODUCIBILITY`, `HALF_VALUE_LAYER`.

### Electro Accupunture (EST)
Measures Frekuensi (± 10%, 80/120/200 Hz), Intensitas Terapi (± 20%, 10–40 mA), Pulse Duration (± 10%, 0.1–0.3 ms), Waktu/timer (± 10%, 300 detik). No existing capability. Needs a new **`ELECTROTHERAPY_STIMULATION`** capability with items `STIMULATION_FREQUENCY`, `STIMULATION_INTENSITY`, `PULSE_DURATION`, `TREATMENT_TIMER`.

### Examination Lamp / Head Lamp Medik / Lampu Operasi / Laryngoskop (light-source family)
All four measure the same three-parameter bundle: Intensitas Cahaya (illuminance), Color Temperature (°K), Color Rendering Index (Ra), using a Spectral Chromometer. **Tolerances differ meaningfully by device**: Examination Lamp/Head Lamp Medik use >1,000 lux / 3,000–6,700°K / 85–100 Ra; Lampu Operasi and (curiously) Laryngoskop both use 40,000–160,000 lux / 3,000–6,700°K / 85–100 Ra (a surgical-lamp-level illuminance range that seems too high for a laryngoscope — flagged as worth a human sanity-check, since it looks like the Lampu Operasi template's numbers may have been copy-pasted into the Laryngoskop LK without adjustment; not confirmed as an error, just noted since it's an unusually high tolerance for a handheld diagnostic light). No existing capability covers illuminance/color-temperature/CRI. Needs a new **`LIGHT_SOURCE_PERFORMANCE`** capability with items `LIGHT_INTENSITY`, `COLOR_TEMPERATURE`, `COLOR_RENDERING_INDEX`, reused across all four device types with per-DeviceType tolerance overrides.

### Fetal Doppler
Measures Kalibrasi Detak Jantung Bayi (fetal heart rate, ± 5 bpm across 30–210 bpm range) using a Fetal Heart Rate Simulator. Conceptually close to `VITAL_SIGNS_MONITORING.HEART_RATE` but that item is scoped to adult/patient monitors' HR reading, and Fetal Doppler's test is structured as a multi-point sweep with its own device (not shared instrumentation). Recommend a new **`FETAL_HEART_RATE`** capability with item `FETAL_HR_ACCURACY` rather than overloading `VITAL_SIGNS_MONITORING`, to keep the item semantics precise — though reusing `VITAL_SIGNS_MONITORING.HEART_RATE` is a defensible alternative if cross-device querying by "heart rate accuracy" is desired.

### Hematologi Analyzer
Same free-form pattern as Auto Chemistry Analyzer: fixed named parameters (WBC differentiation ± 3SD, Erythrocyte count ± 6%, Hematocrit ± 6%, Hemoglobin ± 7%, Leukocyte count ± 15%, Platelet count ± 25%, Fibrinogen ± 20%, PTT ± 15%, PT ± 15%) but with the identical "substitute UUT's own parameter name and use the certificate's tolerance" instruction as Auto Chemistry Analyzer. **Same free-form-model-fit risk** — confirmed here as well, not just theoretical.

### Infusion Pump / Syringe Pump
Measures Pengujian Occlusion (< 20 psi) and Kalibrasi Laju Aliran/flow rate (± 10%, multiple ml/jam settings). **Fully reuses the existing `INFUSION_FLOW`** capability (`OCCLUSION_TEST`, `FLOW_RATE_CALIBRATION`) exactly as the seed comments predicted — confirms the "don't assume new capability without checking existing catalog" guidance from the brief. No new capability needed for either device type.

### Laminar Air Flow
Nearly identical structure to Bio Safety Cabinet: Particle Counter (0.5 µm, ≤ 100 particles), Airflow Velocity (downflow, 0.25–0.50 m/s), Lighting (≥ 750 lux), Sound Level (Background ≤ 55 dBA, in-compartment ≤ 65 dBA), UV Radiation (≥ 40 µW/cm²). Reuses the same proposed **`CLEAN_AIR_CONTAINMENT`** capability as Bio Safety Cabinet (minus the HEPA leak test and smoke-pattern tests, which BSC has and LAF's document does not show).

### Mikroskop Laboratorium
Measures Pembesaran Objektif 4x/10x and Nilai Ratio Pembesaran (all ± 5%). **Fully reuses the existing `OPTICAL_MAGNIFICATION`** capability (`MAGNIFICATION_4X`, `MAGNIFICATION_10X`, `MAGNIFICATION_RATIO`) exactly — full match, no new capability needed.

### pH Meter
Measures pH assay results against a Buffer Solution certificate (± 0.05 for two lot-code buffer values), with a much shorter physical-check section (no electrical safety section at all — battery-only device). This is the **most free-form** of the three lab-analyzer-style devices: tolerance and even the number of test points depend entirely on which buffer solution lot is used. No existing capability fits (`OPTICAL_MAGNIFICATION`, `VITAL_SIGNS_MONITORING`, etc. are irrelevant). Needs a new **`PH_ASSAY_ACCURACY`** capability, but note this is a case where a rigid item-catalog model may be a poor fit — worth flagging to a human for a "certificate-referenced tolerance" design pattern rather than fixed items.

### Phototherapy
Measures Pengujian Keluaran Spectral Irradiance (≥ 8 µW/cm²/nm) at multiple lamp positions (1–4, M) using a Phototherapy Radiometer. No existing capability matches (it's spectral irradiance, not illuminance/lux like the light-source family above). Needs a new **`SPECTRAL_IRRADIANCE`** capability with item `SPECTRAL_IRRADIANCE_ACCURACY`.

### Platelet Agitator Incubator
Measures a 30-point compartment temperature table (± 1.5°C, setting 20–24°C) — structurally identical to Centrifuge Refrigerator's/Cold Chain's temperature-uniformity test. **Fully reuses `TEMPERATURE_COLD_STORAGE`** (`STORAGE_TEMPERATURE_UNIFORMITY`). No new capability needed.

### Rotator
Identical rotation-speed/rotation-time performance section to Centrifuge (same tolerances: ± 10% speed, ± 10% time). **Fully reuses `ROTATIONAL_SPEED`**. No new capability needed — confirms Rotator and Centrifuge are functionally near-duplicates from a capability-modeling perspective, though they remain distinct device types per Kemenkes taxonomy conventions elsewhere in this schema.

### Spirometer
Measures Pengukuran Akurasi Total Volume FVC (Forced Vital Capacity, ± 3% at 0.5L and 3L settings) using a Syringe Calibrator 3L. This is a well-structured, fixed-parameter test (not free-form like Audiometer's frequency sweep, but also not matching an existing capability). Needs a new **`SPIROMETRY_VOLUME_ACCURACY`** capability with item `FVC_VOLUME_ACCURACY`. Unlike Audiometer, Spirometer's test is simple (2 data points) and clearly fits the structured model well — the earlier concern about Audiometer/Spirometer needing free-form treatment does **not** apply to Spirometer; it is well-suited to the existing catalog pattern, just needs one new capability/item pair.

### Suction Pump / (Breast Pumps, already modeled)
Measures Akurasi Vacuum Gauge (± 10%), Maximum Vacuum (Low/Medium/High mmHg bands), Waktu Yang Dibutuhkan Saat Daya Hisap Maksimum (≤ 15 detik). **Fully reuses the existing `VACUUM_SUCTION`** capability (`VACUUM_GAUGE_ACCURACY`, `MAXIMUM_VACUUM`, `TIME_TO_MAX_VACUUM`) exactly as designed. No new capability needed. (Suction Pump itself has no `DeviceType` yet, unlike Breast Pumps which already shares this capability.)

### Blanket Warmer (not in brief's list — found during recon)
Measures Pengujian proteksi suhu tinggi (high-temp protection, < 53°C ± 3°C) and Kalibrasi suhu (temperature calibration at 33/35/40°C, ± 3°C). This is structurally close to **`WARMER_SURFACE_TEMPERATURE`** (used for Infant Warmer) but Blanket Warmer's test is a general compartment/surface temperature check rather than mattress-surface-specific. Recommend reusing `WARMER_SURFACE_TEMPERATURE` with its existing items, or adding a `HIGH_TEMP_PROTECTION` item to it — no wholly new capability needed.

### Thermohygrometer (not in brief's list — found during recon)
Measures a climatic-chamber performance test: Suhu (temperature accuracy across 20/25/30/35°C at 50% RH) and Kelembaban (humidity accuracy across 40/50/60/70% RH rising and falling, at 25°C), against a reference Digital Thermohygrometer inside a Climatic Chamber. No existing capability covers a temperature/humidity *reference-instrument* accuracy test (as distinct from `ENVIRONMENTAL_CONDITIONS`, which just records ambient room conditions during another device's calibration). Needs a new **`THERMOHYGROMETER_ACCURACY`** capability with items `TEMPERATURE_ACCURACY_MULTIPOINT`, `HUMIDITY_ACCURACY_MULTIPOINT`.

---

## Task B — Proposed DeviceCategory Changes

The 9 existing categories (Patient Monitoring, Respiratory & Oxygen, Neonatal & Infant Care, Resuscitation, Suction & Fluid Management, Sterilization, Temperature Therapy, Cold Chain & Storage, Patient Care) are function-based groupings built around the original 35 Kemenkes-recognized types. None of them cleanly fit laboratory analyzers, dental equipment, medical lighting, or audiology devices. Proposed new categories, following the same function-based (occasionally calibration-method-based) reasoning used for the original 9:

- **Laboratory & Diagnostic Equipment** — for Auto Chemistry Analyzer, Hematologi Analyzer, Mikroskop Laboratorium, pH Meter, Centrifuge, Centrifuge Refrigerator, Rotator, Platelet Agitator Incubator, Bio Safety Cabinet, Laminar Air Flow. Rationale: shared function is *in-vitro/laboratory sample processing and analysis*, distinct from patient-contact monitoring or therapy devices. (Bio Safety Cabinet and Laminar Air Flow are borderline — they're containment/cleanroom equipment, not analyzers — but they overwhelmingly appear in laboratory settings per their LK content, and the calibration-method overlap with the rest of this group, plus no other category fitting, favors grouping them here over inventing a single-purpose "Cleanroom Equipment" category for just two device types.)
- **Dental Equipment** — for Dental Unit, Dental X-Ray. Rationale: dedicated dental-practice equipment with dental-specific test protocols (handpiece speed, collimation for intraoral X-ray) not shared with any general-medical category.
- **Medical Lighting** — for Examination Lamp, Head Lamp Medik, Lampu Operasi, Laryngoskop (light-source portion; laryngoscope is arguably borderline since it's a laryngeal visualization instrument, but its LK tests only its light source, which is the calibratable function). Rationale: shared calibration method (illuminance/color-temperature/CRI via spectral chromometer) is the unifying thread — same reasoning style as how the original 9 categories occasionally group by calibration method (e.g., Sterilization groups by shared thermal-chamber test method).
- **Audiology & Physiological Testing** — for Audiometer, Spirometer, Fetal Doppler. Rationale: patient-function diagnostic testing instruments that are neither monitoring (continuous vital signs) nor therapy devices — they measure a specific physiological parameter (hearing threshold, lung volume, fetal heart rate) in a single-session diagnostic test.

Devices that fit **existing** categories without needing a new one:
- **CPAP** → Respiratory & Oxygen (identical function/test to Oxygen Concentrator, already in this category).
- **Autoclave** → Sterilization (identical function/test to Sterillizer/Oven, already in this category).
- **Infusion Pump, Syringe Pump, Suction Pump** → Suction & Fluid Management (Suction Pump obviously; Infusion/Syringe Pump fit this category's existing "fluid management" framing better than inventing a separate "Infusion Therapy" category, especially since `INFUSION_FLOW` capability is already scoped here via Breast Pumps' sibling devices).
- **Blanket Warmer** → Temperature Therapy (adult warming device, same reasoning as Radiant Warmers (Adult) and Paraffin Baths already in this category).
- **Thermohygrometer** → this one doesn't fit any category well since it's a *reference instrument* rather than patient-care equipment; recommend either a new **Reference & Test Equipment** category (if the system intends to track calibration of its own measurement tools) or excluding it from the patient-care taxonomy entirely as an out-of-scope internal tool — a decision for a human, not resolved here.
- **Electro Accupunture (EST)** → could fit Patient Care (electrical/mechanical patient-support framing) but is arguably a therapy device; no existing category cleanly fits electrotherapy. If a fifth new category is wanted, **Physical/Electro-Therapy** could house EST alongside Blanket Warmer and Paraffin Baths, but this investigation recommends keeping EST as a single-device exception under Patient Care rather than inventing a category for one device, pending a human decision.

---

## Task C — Cross-Check Findings (27 already-covered device types)

### Coverage confirmation
All 27 already-modeled device types with `DeviceCalibrationParameter` rows **do** have a corresponding LK document in `docs/technician-docs/`, except the already-known **Ventilator** gap. No additional missing-document gaps were found among the 27 during this investigation (spot-checked plus the mapping review: Blood Pressure Monitor, Pulse Oximeters/Oxymeter Monitor via `LK Pulse Oxymeter.docx`, Electrocardiographs, Sphygmomanometers, Bed Side Monitor/Patient Monitor via `LK Bed Side Monitor.docx`, Humidifier, Oxygen Concentrators, Ultrasonic/Compressor Nebulizers, Flow Meter, Baby Incubator, Infant Warmer/Radiant Warmer via `LK Infant Warmer.docx`, Resuscitators (Cardiac/Pulmonary) via `LK Resusitator Paru dan Neopuff.docx`, Breast Pumps via `LK Suction Pump.docx`-family, Sterillizer, Oven, Blood Bank Refrigerators, Kulkas Vaksin/Coald Chain via `LK Cold Chain, Vaccine Refrigerator.docx`, Medical Refrigerator, Medical Freezer, Electric Beds via `LK Kelistrikan.docx` — all present).

### Important structural finding: seeded tolerances are already sourced from technician-docs
`packages/db/prisma/backfill-device-calibration-parameter-tolerances.ts` (dated 2026-08-26, the most recent work referenced in the brief) cites `.docx` filenames throughout its source comments (e.g. `// LK Baby Incubator.docx`, `// LK Sphygmomanometer.docx — no voltage/electrical-safety section`) and was verified line-by-line against the actual `technician-docs/` content for Blood Pressure Monitor, Sphygmomanometer, Electrocardiograph, Baby Incubator, Sterilisator, Oven, and Nebulizer Compressor — **every tolerance value matched exactly**. This means the *tolerances* in the current seed were already sourced from `technician-docs/`, not the older 30-document set (only the `DeviceCapability`/`DeviceCapabilityItem` catalog structure itself was originally built from the older `Penilaian_Kemampuan.zip`, per that seed file's own header comment). Consequently, the meaningful two-source comparison for Task C is `technician-docs/` vs. the **older** `docs/legal_n_competency/Penilaian Kemampuan/` PDFs directly — not seed-vs-technician-docs, since those already agree.

### Discrepancies found between the OLD source and technician-docs (evidence quoted)

**1. Blood Pressure Monitor — NIBP tolerance changed from ± 8 mmHg to ± 5 mmHg.**

Old source (`docs/legal_n_competency/Penilaian Kemampuan/Blood Pressure Monitor/LK Blood Pressure Monitor.pdf`, Kode Dokumen F.MT.LK.01.4, Edisi/Revisi 01/01):
> "1. Kalibrasi NIBP ... Toleransi: **± 8 mmHg**"

New source (`docs/technician-docs/LK Blood Pressure Monitor.docx`):
> "Kalibrasi NIBP ... Toleransi ± 5 mmHg"

The seeded value (`NIBP_PM5` in `backfill-device-calibration-parameter-tolerances.ts`, "± 5 mmHg") matches the **new** source, not the old one. This is a genuine, material tolerance change between document revisions — worth flagging for a human to confirm whether the ± 5 mmHg figure is an intentional tightening or a possible drafting error, since ± 8 mmHg is a more conventional NIBP accuracy spec.

**2. Baby Incubator — "Waktu Pemulihan Lonjakan Suhu" (temperature recovery time) tolerance exists in the OLD source but is missing entirely from technician-docs.**

Old source (`.../Baby Incubator/LK Baby Incubator.pdf`, F.MT.LK.01.1):
> "2. Overshot Temperature, Waktu Pemulihan Lonjakan Suhu, Suhu Matras, Kecepatan Udara, Kebisingan dan Kelembaban
> | Waktu Pemulihan Lonjakan Suhu | Tc (T1) | 32 ke 36ºC | | **≤ 15 menit** |"

New source (`docs/technician-docs/LK Baby Incubator.docx`) has the identically-named section header ("Overshot Temperature, Waktu Pemulihan Lonjakan Suhu, Suhu Matras, Kecepatan Udara, Kebisingan dan Kelembaban") but the actual table rows only contain Overshot Temperature, Suhu Matras, Kecepatan Udara, Kebisingan, and Kelembaban — **the "Waktu Pemulihan Lonjakan Suhu" row itself was dropped from the table**, even though it's still named in the section title.

This directly explains why `INCU_RECOVERY_TIME` is the **only** `unresolved` (null toleranceMin/Max/Note) row among all 242 seeded `DeviceCalibrationParameter` entries (confirmed via `grep` — `unresolved` appears exactly once in the backfill file, at that row). The old source provides a ready value (**≤ 15 menit**) that could resolve this gap, though a human should confirm whether the old source's Recovery Time spec is still applicable given the sensor-numbering also changed between versions (see below) before using it.

**3. Baby Incubator — sensor point relabeling (structural, not a tolerance discrepancy).** The old source's main/reference air-temperature sensor is called `Tc/T1` with secondary sensors `T2, T3, T4, T5`; the new source's main sensor is called `TM/T5` with secondary sensors `T1, T2, T3, T4`. The tolerances themselves (± 1.5°C main, ± 0.8°C secondary-vs-main) are unchanged, but the sensor identifiers were renumbered/relabeled between the two document revisions. Also: old source says "Kebisingan ... ≤ 60 dB" vs. new source "Kebisingan ... ≤ 60 dBA" (same numeric value, unit label made more precise — not a material discrepancy, just noted for completeness).

**Devices confirmed to match exactly** (no discrepancy found): Sphygmomanometer (leak test, deflation rate, pressure accuracy all identical), Electrocardiograph (amplitude, recording speed, heart rate, sinusoidal/normal signal tests all identical, including the two-tier leakage-current table), Sterilisator (chamber temp ± 3°C identical), Oven (chamber temp ± 3°C identical), Nebulizer Compressor (flow rate ≥ 4 lpm identical).

---

## Task D — Mislabeled File Resolution

### `LK Otoscope.docx` — **confirmed mismatched**
Full document content: environmental conditions, physical/electrical safety checks (using a "Spectral Chromometer" as the primary reference instrument — not an otoscope-specific tool), then a "Hasil Pengukuran Kinerja Alat" section testing exactly three parameters: Intensitas Cahaya (illuminance, tolerance recorded as "-", i.e. no numeric bound set), Color Temperature (3,000–6,700°K), Color Rendering Index (85–100 Ra). This is **structurally and numerically identical** to `LK Examination Lamp.docx`, `LK Head Lamp Medik.docx`, and `LK Lampu Operasi.docx`/`LK Laryngoskop.docx`'s light-source test. There is no otoscope-specific content anywhere in the document — no speculum/funnel test, no tip-illumination-at-distance test, no magnification test. This confirms the earlier flag: the file's actual content belongs to the "light source" test family, not to a device-specific otoscope calibration protocol.

Implication: **Examination Lamp already has its own separate, correctly-labeled LK document** (`LK Examination Lamp.docx`), so `LK Otoscope.docx` is a redundant/erroneous duplicate of that family's test rather than the sole source for any content — it can be treated as evidence that "Otoscope" is not a genuine additional device type needing its own `DeviceType`/`DeviceCapability` entries; its content is already covered by the light-source family.

### `LK Phaco Emulsifikasi.docx` — **confirmed mismatched**
Full document content: environmental conditions (identical to Suction Pump's, "19–31°C" / "35–75% RH"), physical/electrical safety checks including "Sistem pengunci pergerakan" and "Filter" checks (verbatim identical wording to `LK Suction Pump.docx`'s corresponding rows), then a "Kalibrasi daya hisap" (suction power calibration) performance section using a Digital Pressure Meter, tolerance ± 10%. This is the same core vacuum-gauge-accuracy test as `LK Suction Pump.docx`'s "Akurasi Vacuum Gauge" section (same table structure: mmHg reading rising/falling across up to 6 settings, ± 10% tolerance) — though `LK Phaco Emulsifikasi.docx` is missing Suction Pump's additional "Maximum Vacuum" band test and "Waktu Yang Dibutuhkan Saat Daya Hisap Maksimum" (time-to-max-vacuum, ≤ 15 detik) sub-tests. There is no phaco-emulsification-specific content anywhere — no ultrasonic power/frequency, stroke length, or irrigation/aspiration balance parameters that a real phacoemulsification machine calibration would require.

Implication: **Suction Pump already has its own separate, correctly-labeled LK document** (`LK Suction Pump.docx`, which is itself one of the ~21 new device types identified in Task A, not yet modeled as a `DeviceType`). `LK Phaco Emulsifikasi.docx` is a redundant/erroneous partial duplicate of that suction test — it should not be treated as evidence that "Phaco Emulsifikasi" needs its own `DeviceType`/`DeviceCapability` entries; whatever content it does contain is already (and more completely) covered by Suction Pump's own document.

---

## Recommended Next Steps (not implemented — for a future task)

1. **Correct the device-type list**: treat Otoscope and Phaco Emulsifikasi as non-entities (mislabeled duplicates, not new device types); add Blanket Warmer and Thermohygrometer to the "new device type" candidate set that the brief's list missed. Net candidate list: 21 new device types, not ~22/26.
2. **Add new `DeviceCapability` rows** (grounded in Task A evidence): `AUDIOMETRIC_PERFORMANCE`, `CLEAN_AIR_CONTAINMENT`, `DENTAL_UNIT_PERFORMANCE`, `XRAY_PERFORMANCE`, `ELECTROTHERAPY_STIMULATION`, `LIGHT_SOURCE_PERFORMANCE`, `FETAL_HEART_RATE` (or reuse `VITAL_SIGNS_MONITORING.HEART_RATE` — needs a human call), `PH_ASSAY_ACCURACY`, `SPECTRAL_IRRADIANCE`, `SPIROMETRY_VOLUME_ACCURACY`, `THERMOHYGROMETER_ACCURACY` — each with the item lists proposed per-device above.
3. **Flag, don't model, the free-form devices**: Auto Chemistry Analyzer, Hematologi Analyzer, and pH Meter should probably NOT get a fixed `DeviceCapabilityItem` catalog the way other devices do — recommend a design discussion about a "certificate-referenced tolerance" pattern (e.g., a parameter-name/tolerance pair entered per-calibration rather than a fixed item catalog) before seeding these three.
4. **Add new `DeviceCategory` rows**: Laboratory & Diagnostic Equipment, Dental Equipment, Medical Lighting, Audiology & Physiological Testing — with the device assignments listed in Task B. Get a human decision on Thermohygrometer (new "Reference & Test Equipment" category vs. out-of-scope) and EST (new "Physical/Electro-Therapy" category vs. folded into Patient Care as a single-device exception).
5. **Resolve the two Task C discrepancies with a human before backfilling further tolerances**: confirm whether Blood Pressure Monitor's NIBP tolerance should be ± 5 mmHg (current seed/new source) or ± 8 mmHg (old source), and whether Baby Incubator's `INCU_RECOVERY_TIME` should be backfilled to ≤ 15 menit using the old source's value (noting the sensor-relabeling caveat).
6. **Seed the 21 new `DeviceType` rows** under the categories above once Task B's category questions are resolved, then seed their `DeviceCalibrationParameter` rows using the (mostly reused) capability items identified in Task A.
7. Double-check the unusually high Laryngoskop illuminance tolerance (40,000–160,000 lux, same as Lampu Operasi) against a domain expert before seeding it as-is — it may be a copy-paste artifact in the source document itself, not a taxonomy issue.
