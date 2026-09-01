# Reference Equipment Catalog — Seed from Technician Worksheets (Section A only)

**Date:** 2026-08-30
**Author:** afriza.hrp@gmail.com (via Claude Code)
**Scope:** Populate the `EquipmentType` master (Reference Equipment ▸ Catalog) from
Section A **"A. Daftar Alat yang Digunakan"** of the PKM technician calibration
worksheets. Initial dataset for PKM manual verification — **not** a finalised master.

> ### Explicit confirmation of untouched areas
> No Prisma schema change, no migration, no API / service / controller / UI / RBAC change.
> **No physical `Equipment` (unit) records created. No `DeviceTypeEquipmentRequirement`
> (requirement) records created.** No `DeviceType`, `Device`, `CalibrationRequest`,
> `PriceListItem`, `Quotation`, `WorkOrder`, `CalibrationJob`, or
> `EquipmentCalibrationRecord` row was created, modified, or deleted. The 3 pre-existing
> `EquipmentType` rows were **not modified** (verified field-by-field, below).
> Only new `EquipmentType` rows were inserted, plus one seed script + one `package.json`
> script entry.

---

## 1. Source directory

`D:\medcal\docs\technician-docs\` — flat, no subdirectories.

## 2. Number of DOCX files scanned

**50** `*.docx` files (`LK *.docx`). Non-DOCX content (`*.pdf`, images) was ignored per
scope. (Two `.pdf` files appear as deleted in `git status` — they are prior working-tree
state, unrelated to this task; only `.docx` was read.)

## 3. Number containing Section A

**50 / 50.** Every worksheet contains the `A. Daftar Alat yang Digunakan` table with the
header `No | Nama Alat | Merk | Type/Model | No. Seri`. In **every** document the
`Merk` / `Type/Model` / `No. Seri` columns are **blank** (these are empty worksheet
templates) — so there was no unit-level data (brand / model / serial) to accidentally
convert into physical `Equipment` records.

## 4. Total Section A rows

**168** raw `Nama Alat` rows extracted across the 50 documents (each document lists 2–7
reference tools; every document lists `Thermohygrometer`, and 45 also list
`Electrical Safety Analyzer`).

## 5. Unique extracted names

**37** unique canonical names after whitespace normalisation only (trim + collapse
repeated whitespace). Each of the 37 has **exactly one** exact source spelling — there
were **no** hidden case/whitespace variants merged.

Source wording was **preserved verbatim**, including apparent typos:
`Particel Counter`, `Digital Thermohygrometer (refrence)`, `Spectral Chromometer`,
`Reagensia (cairan deluent dan lyse)` — none were "corrected".

## 6. Existing matches (classified `EXISTING_MATCH` — skipped, untouched)

Matched by case-insensitive `name` against the 3 pre-existing `EquipmentType` rows:

| Source name | Existing row (unchanged) | Source docs |
|---|---|---|
| Electrical Safety Analyzer | `code="ELECTRICAL SAFETY ANALYZER"`, `category="Analyzer"` | 45 |
| Thermohygrometer | `code="THERMOHYGROMETER"`, `category="Lingkungan"` | 50 |
| Vital Signs Simulator | `code="VITAL_SIGNS_SIMULATOR"`, `category="Simulator"` | 3 |

These were **not** seeded and **not** modified (their `code` / `category` / `isActive`
are byte-for-byte identical before and after — see §11).

## 7. New records (seeded)

**34** new `EquipmentType` rows created. `name` = exact Section-A wording;
`code` = `UPPER_SNAKE_CASE` (see "Code convention" below); `category` = **null**
(not derivable from Section A — not invented); `description` = null; `isActive` = true.

| # | code | name | ×docs |
|---|---|---|---|
| 1 | `ANEMOMETER` | Anemometer | 2 |
| 2 | `BUFFER_SOLUTION` | Buffer Solution | 1 |
| 3 | `CLIMATIC_CHAMBER` | Climatic Chamber | 1 |
| 4 | `DATA_LOGGER_HI_TEMPERATURE` | Data Logger Hi Temperature | 1 |
| 5 | `DIGITAL_LUXMETER` | Digital Luxmeter | 1 |
| 6 | `DIGITAL_PRESSURE_METER` | Digital Pressure Meter | 5 |
| 7 | `DIGITAL_STOPWATCH` | Digital Stopwatch | 6 |
| 8 | `DIGITAL_TACHOMETER` | Digital Tachometer | 3 |
| 9 | `DIGITAL_THERMOHYGROMETER_REFRENCE` | Digital Thermohygrometer (refrence) | 1 |
| 10 | `ECG_SIMULATOR` | ECG Simulator | 1 |
| 11 | `FETAL_HEART_RATE_SIMULATOR` | Fetal Heart Rate Simulator | 1 |
| 12 | `GAS_FLOW_ANALYZER` | Gas Flow Analyzer | 5 |
| 13 | `INCUBATOR_ANALYZER` | Incubator Analyzer | 2 |
| 14 | `INFUSION_DEVICE_ANALYZER` | Infusion Device Analyzer | 2 |
| 15 | `KONTROL_STANDARD_CRM` | Kontrol Standard / CRM | 2 |
| 16 | `LUX_METER` | Lux Meter | 2 |
| 17 | `METERAN` | Meteran | 1 |
| 18 | `MISTAR_BAJA` | Mistar Baja | 1 |
| 19 | `MULTIMETER` | Multimeter | 1 |
| 20 | `OBJEKTIF_MIKROMETER` | Objektif Mikrometer | 1 |
| 21 | `OKULER_MIKROMETER` | Okuler Mikrometer | 1 |
| 22 | `OSCILLOSCOPE` | Oscilloscope | 1 |
| 23 | `PARTICEL_COUNTER` | Particel Counter | 2 |
| 24 | `PHOTOTHERAPY_RADIOMETER` | Phototherapy Radiometer | 1 |
| 25 | `REAGENSIA_CAIRAN_DELUENT_DAN_LYSE` | Reagensia (cairan deluent dan lyse) | 2 |
| 26 | `RESISTANCE_BOX` | Resistance Box | 1 |
| 27 | `SOUND_LEVEL_METER` | Sound Level Meter | 3 |
| 28 | `SPECTRAL_CHROMOMETER` | Spectral Chromometer | 5 |
| 29 | `SYRINGE_CALIBRATOR_3L` | Syringe Calibrator 3L | 1 |
| 30 | `TACHOMETER_FOR_DENTAL` | Tachometer for Dental | 1 |
| 31 | `THERMOMETER_12_CHANNEL` | Thermometer 12 channel | 8 |
| 32 | `THERMOMETER_12_CHANNEL_PT_100` | Thermometer 12 Channel (PT-100) | 1 |
| 33 | `UV_LIGHT_METER` | UV Light Meter | 2 |
| 34 | `WATERPASS` | Waterpass | 1 |

### Code convention (the one derivation decision — flagged for PKM)

`code` was derived as `UPPER_SNAKE_CASE` — uppercase, each run of non-alphanumeric
characters → `_`, trimmed. This is the **established MEDCAL master-data seed convention**
(`seed-uoms.ts` → `DEG_C`, `L_MIN`; `seed-device-types.ts` / `seed-device-categories`
→ `PATIENT_MONITORING`, `RESPIRATORY_OXYGEN`), and it matches 1 of the 3 pre-existing
`EquipmentType` rows (`VITAL_SIGNS_SIMULATOR`) and the Phase-1 create-form placeholder
(`ELECTRICAL_SAFETY_ANALYZER`).

**Ambiguity flagged:** the other 2 pre-existing rows use **upper-case-with-spaces**
(`ELECTRICAL SAFETY ANALYZER`, `THERMOHYGROMETER`) — these were hand-typed through the
portal UI (which only upper-cases input), not produced by a seed. There is therefore a
small inconsistency in the *existing data*, though not in the MEDCAL *seed* convention.
The seed did **not** touch those rows. If PKM prefers a different `code` style for the
catalog, the codes of the 34 new rows can be changed later (they carry no business data);
the seed matches on `name`, so a code rename will not cause a re-insert.

## 8. Possible duplicates / ambiguities (seeded separately — NOT merged — PKM to review)

Per the rules, near-duplicates were **kept separate** and are listed here for PKM
master-data classification. **Nothing was silently merged.**

| Cluster | Members (all present in the catalog) | Note |
|---|---|---|
| Thermohygrometer family | `Thermohygrometer` (existing) · `Digital Thermohygrometer (refrence)` (new, ×1, `LK Thermohygrometer.docx`) | "refrence" is a source typo. May or may not be the same tool as the plain `Thermohygrometer`. |
| Thermometer 12-channel | `Thermometer 12 channel` (new, ×8) · `Thermometer 12 Channel (PT-100)` (new, ×1, `LK Humidifier.docx`) | Differ by casing and a `(PT-100)` sensor-type suffix. |
| Lux / illuminance meter | `Lux Meter` (new, ×2) · `Digital Luxmeter` (new, ×1, `LK Dental Unit.docx`) | Different wording; possibly the same instrument type. |

Additional items that "look strange" and are reported **without** removal or
re-classification (per rule 17 — *"Found in Section A; requires PKM master-data
classification"*):

- `Reagensia (cairan deluent dan lyse)` — consumable/reagent, listed in Section A of
  `LK Auto Chemistry Analyzer.docx` and `LK Hematologi Analyzer.docx`.
- `Kontrol Standard / CRM` — control material / certified reference material, same 2 docs.
- `Buffer Solution` — `LK pH Meter.docx`.
- `Spectral Chromometer` (×5) — likely a spelling of "colorimeter / chroma meter";
  preserved as written.
- `Particel Counter` (×2) — likely "Particle Counter"; preserved as written.
- `Meteran`, `Mistar Baja`, `Waterpass` — simple measuring tools (tape measure, steel
  ruler, spirit level) listed alongside the electronic references.

## 9. Seeded records

**34 created**, `EquipmentType` total **3 → 37**. Re-running the seed a second time:
**0 created, 34 skipped ("name already exists")** — idempotent.

## 10. Source-document traceability

Every seeded name maps to at least one worksheet. Full mapping:

| EquipmentType | Found in |
|---|---|
| Anemometer | LK Bio Safety Cabinet, LK Laminar Air Flow |
| Buffer Solution | LK pH Meter |
| Climatic Chamber | LK Thermohygrometer |
| Data Logger Hi Temperature | LK Autoclave |
| Digital Luxmeter | LK Dental Unit |
| Digital Pressure Meter | LK Dental Unit, LK Phaco Emulsifikasi, LK Resusitator Paru dan Neopuff, LK Sphygmomanometer, LK Suction Pump |
| Digital Stopwatch | LK Centrifuge Refrigerator, LK Centrifuge, LK Electro Accupunture (EST), LK Rotator, LK Sphygmomanometer, LK Suction Pump |
| Digital Tachometer | LK Centrifuge Refrigerator, LK Centrifuge, LK Rotator |
| Digital Thermohygrometer (refrence) | LK Thermohygrometer |
| ECG Simulator | LK Electrocardiograph |
| Fetal Heart Rate Simulator | LK Fetal Doppler |
| Gas Flow Analyzer | LK CPAP, LK Flow Meter, LK Nebulizer Compressor, LK Nebulizer Ultrasonic, LK Oksigen Concentrator |
| Incubator Analyzer | LK Baby Incubator, LK Infant Warmer |
| Infusion Device Analyzer | LK Infusion Pump, LK Syringe Pump |
| Kontrol Standard / CRM | LK Auto Chemistry Analyzer, LK Hematologi Analyzer |
| Lux Meter | LK Bio Safety Cabinet, LK Laminar Air Flow |
| Meteran | LK Dental X-Ray |
| Mistar Baja | LK Electrocardiograph |
| Multimeter | LK Dental X-Ray |
| Objektif Mikrometer | LK Mikroskop Laboratorium |
| Okuler Mikrometer | LK Mikroskop Laboratorium |
| Oscilloscope | LK Electro Accupunture (EST) |
| Particel Counter | LK Bio Safety Cabinet, LK Laminar Air Flow |
| Phototherapy Radiometer | LK Phototherapy |
| Reagensia (cairan deluent dan lyse) | LK Auto Chemistry Analyzer, LK Hematologi Analyzer |
| Resistance Box | LK Electro Accupunture (EST) |
| Sound Level Meter | LK Audiometer, LK Bio Safety Cabinet, LK Laminar Air Flow |
| Spectral Chromometer | LK Examination Lamp, LK Head Lamp Medik, LK Lampu Operasi, LK Laryngoskop, LK Otoscope |
| Syringe Calibrator 3L | LK Spirometer |
| Tachometer for Dental | LK Dental Unit |
| Thermometer 12 channel | LK Blanket Warmer, LK Blood Bank Refrigerator, LK Cold Chain Vaccine Refrigerator, LK Medical Freezer, LK Medical Refrigerator, LK Oven, LK Platelet Agitator Incubator, LK Sterilisator |
| Thermometer 12 Channel (PT-100) | LK Humidifier |
| UV Light Meter | LK Bio Safety Cabinet, LK Laminar Air Flow |
| Waterpass | LK Dental X-Ray |

Existing (not seeded) for completeness:

| EquipmentType | Found in |
|---|---|
| Electrical Safety Analyzer | 45 worksheets (all except LK Flow Meter, LK Oksigen Concentrator, LK Sphygmomanometer, LK Thermohygrometer, LK pH Meter) |
| Thermohygrometer | all 50 worksheets |
| Vital Signs Simulator | LK Bed Side Monitor, LK Blood Pressure Monitor, LK Pulse Oxymeter |

## 11. Verification

DB state captured immediately **before** and **after** the seed (local dev DB
`localhost:5432/pkmdb`):

| Table | Before | After |
|---|---:|---:|
| `EquipmentType` | 3 | **37** (+34) |
| `Equipment` (units) | 1 | **1** (unchanged) |
| `DeviceTypeEquipmentRequirement` | 3 | **3** (unchanged) |
| `DeviceType` | 59 | **59** (unchanged) |
| `Device` | 0 | **0** (unchanged) |
| `CalibrationRequest` | 4 | **4** (unchanged) |
| `PriceListItem` | 59 | **59** (unchanged) |
| `Quotation` | 1 | **1** (unchanged) |
| `WorkOrder` | 1 | **1** (unchanged) |
| `CalibrationJob` | 0 | **0** (unchanged) |
| `EquipmentCalibrationRecord` | 1 | **1** (unchanged) |

Pre-existing `EquipmentType` rows after the seed — identical to before:
- `ELECTRICAL SAFETY ANALYZER` | Electrical Safety Analyzer | category `"Analyzer"` | isActive true
- `THERMOHYGROMETER` | Thermohygrometer | category `"Lingkungan"` | isActive true
- `VITAL_SIGNS_SIMULATOR` | Vital Signs Simulator | category `"Simulator"` | isActive true

Checklist:

- [x] Every proposed NEW `EquipmentType` exists (34/34).
- [x] No duplicate `EquipmentType` created (each `name` unique; each `code` unique; 2nd run created 0).
- [x] Existing `EquipmentType` records not modified.
- [x] No `Equipment` physical units created.
- [x] No `DeviceTypeEquipmentRequirement` records created.
- [x] No `DeviceType` / `Device` records modified.
- [x] No `CalibrationRequest` / `PriceListItem` / `Quotation` / `WorkOrder` / `CalibrationJob` data modified.
- [x] No Prisma schema modified. No migration created.
- [x] Dry-run performed (extraction + classification, zero DB writes) before any INSERT.
- [x] Seed is idempotent.

## 12. Files changed

**New:**
- `packages/db/prisma/seed-reference-equipment-types.ts` — the seed (hardcoded `ROWS`
  array of the 34 new names/codes, `findFirst`-by-name guard, `create`; no `update`/`delete`).

**Modified:**
- `packages/db/package.json` — added `"seed:reference-equipment-types"` script entry
  (`tsx --env-file ../../.env prisma/seed-reference-equipment-types.ts`).

**Not committed to the repo (analysis only, kept in the session scratchpad):** the DOCX
Section-A extractor and the classification helper. The seed itself carries the final
hardcoded list, matching every other MEDCAL seed script.

Run with: `pnpm --filter @medcal/db run seed:reference-equipment-types`

## 13. Confirmation of untouched areas

See the boxed statement at the top. Additionally: no API, controller, service, DTO/Zod
schema, RBAC catalog, `access-control.ts`, `seed-role-permissions.ts`, `seed-menu.ts`
(for this task), UI, or route was changed. The only runtime effect is 34 new rows in
`EquipmentType`.

---

## Open items for PKM (before this catalog is treated as final)

1. **`code` style** for the 34 new rows — `UPPER_SNAKE_CASE` was used (MEDCAL seed
   convention); 2 pre-existing rows use upper-case-with-spaces. Decide the canonical style
   and, if changing, rename the new rows' codes (no business data attached).
2. **`category`** — left `null` for all 34 (cannot be derived from Section A). The 3
   existing rows have hand-assigned categories (`Analyzer` / `Lingkungan` / `Simulator`);
   PKM to classify the rest.
3. **Possible-duplicate clusters** (§8) — decide whether `Digital Thermohygrometer (refrence)`,
   `Thermometer 12 Channel (PT-100)`, `Digital Luxmeter` are distinct catalog entries or
   should be folded into `Thermohygrometer` / `Thermometer 12 channel` / `Lux Meter`.
4. **Non-instrument entries** — `Reagensia (cairan deluent dan lyse)`, `Kontrol Standard / CRM`,
   `Buffer Solution`: confirm they belong in the Reference Equipment Catalog or should be
   moved to a consumables/materials concept (not designed yet).
5. **Source typos** — `Particel Counter`, `Spectral Chromometer`, `Digital Thermohygrometer
   (refrence)`: preserved verbatim; PKM to decide whether to correct the worksheets and
   re-seed, or fix the catalog names directly.
6. **`Tachometer for Dental` vs `Digital Tachometer`** — likely related; PKM to confirm.
