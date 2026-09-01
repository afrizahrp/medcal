# DeviceType ↔ EquipmentType Pairing — Seed from Technician Worksheets (Section A only)

**Date:** 2026-08-30
**Author:** afriza.hrp@gmail.com (via Claude Code)
**Scope:** Populate `DeviceTypeEquipmentRequirement` (the DeviceType ↔ EquipmentType
pairing shown in the portal as *Reference Equipment ▸ Requirements*) **only** from
Section A **"A. Daftar Alat yang Digunakan"** of the PKM technician calibration
worksheets. Data-seed only.

> ### Confirmation of untouched areas
> No Prisma schema change, no migration, no API / service / controller / portal / UI /
> RBAC change. **`DeviceType` master, `EquipmentType` master, Calibration Parameters,
> `DeviceCalibrationParameter`, Price List, Quotation, Requisition, Work Order, and every
> unrelated seed were not touched.** No existing pairing was deleted or modified. The only
> runtime effect is 141 new rows in `DeviceTypeEquipmentRequirement`.

---

## 1. Files inspected

- `D:\medcal\docs\technician-docs\*.docx` — 50 worksheets (Section A only).
- `packages/db/prisma/schema.prisma` — `DeviceTypeEquipmentRequirement` model
  (`deviceTypeId`, `equipmentTypeId`, `notes String?`, `@@unique([deviceTypeId, equipmentTypeId])`,
  **no ordering column**).
- Existing seeds: `seed-device-types.ts` (59 `DeviceType` rows + its own out-of-scope notes),
  `seed-reference-equipment-types.ts` (37 `EquipmentType` rows — the catalog seeded in the
  prior task), `seed-uoms.ts` (convention reference).
- Live DB: `DeviceType` (59), `EquipmentType` (37), `DeviceTypeEquipmentRequirement` (3
  pre-existing — Bed Side Monitor's 3).

## 2. Worksheets processed

**50 / 50.** Every worksheet's Section A table (`No | Nama Alat | Merk | Type/Model | No. Seri`)
was read; only the `Nama Alat` column was used. Extraction is byte-faithful to source
(equipment wording preserved verbatim, incl. typos `Particel Counter`,
`Spectral Chromometer`, `Digital Thermohygrometer (refrence)`). The `Merk` / `Type/Model` /
`No. Seri` columns are blank in every worksheet.

## 3. DeviceTypes matched → **42**

- **34** by exact (case/whitespace-insensitive) name match to the `DeviceType` master.
- **8** via confident title-variant aliases (plural / spelling / language only):

| Worksheet title | Canonical `DeviceType` |
|---|---|
| Blood Bank Refrigerator | Blood Bank Refrigerators |
| Electrocardiograph | Electrocardiographs |
| Nebulizer Ultrasonic | Ultrasonic Nebulizers |
| Oksigen Concentrator | Oxygen Concentrators |
| Pulse Oxymeter | Pulse Oximeters |
| Resusitator Paru dan Neopuff | Resuscitators (Pulmonary) |
| Sphygmomanometer | Sphygmomanometers |
| Sterilisator | Sterillizer (Sterillisator) |

## 4. DeviceTypes unmatched → **8** (no pairing created)

**Ambiguous** — 2+ plausible canonical `DeviceType` targets, so **not guessed, not paired**:

| Worksheet | Candidate `DeviceType`s | Section-A equipment (not paired) |
|---|---|---|
| Cold Chain, Vaccine Refrigerator | `Coald Chain` \| `Kulkas Vaksin` | Thermometer 12 channel, Electrical Safety Analyzer, Thermohygrometer |
| Kelistrikan | `Electric Beds (kelistrikan)` (worksheet is a generic electrical-safety template) | Electrical Safety Analyzer, Thermohygrometer |

**No canonical `DeviceType` exists** (these worksheets are also excluded from
`seed-device-types.ts` — "out of scope / free-form / mislabeled duplicates"):

| Worksheet | Section-A equipment (not paired) |
|---|---|
| Auto Chemistry Analyzer | Reagensia (cairan deluent dan lyse), Kontrol Standard / CRM, Electrical Safety Analyzer, Thermohygrometer |
| Hematologi Analyzer | Reagensia (cairan deluent dan lyse), Kontrol Standard / CRM, Electrical Safety Analyzer, Thermohygrometer |
| Otoscope | Spectral Chromometer, Electrical Safety Analyzer, Thermohygrometer |
| Phaco Emulsifikasi | Digital Pressure Meter, Electrical Safety Analyzer, Thermohygrometer |
| Thermohygrometer (worksheet) | Climatic Chamber, Digital Thermohygrometer (refrence), Thermohygrometer |
| pH Meter | Buffer Solution, Thermohygrometer |

## 5. EquipmentTypes matched → **all 168 source rows**

Every `Nama Alat` value across all 50 worksheets (168 raw rows) resolved to an existing
canonical `EquipmentType` — because the catalog was seeded from the same Section A source
in the prior task. Match is by case/whitespace-insensitive name.

## 6. EquipmentTypes unmatched → **0**

No `UNMATCHED EQUIPMENT`. No `EquipmentType` was created, auto-created, or modified by this
task.

## 7. Existing pairings

**3** before seeding — `Bed Side Monitor` → Vital Signs Simulator / Electrical Safety
Analyzer / Thermohygrometer. Left untouched (re-confirmed by the source worksheet).

## 8. New pairings inserted → **141**

From the 42 matched DeviceTypes: **144** Section-A pairings resolved, minus the 3 already
present → **141 inserted** via
`createMany({ data, skipDuplicates: true })` (respects `@@unique([deviceTypeId, equipmentTypeId])`).
`notes` left `null` on every row (Section A provides no note; 0 non-null `notes` after seed).

`DeviceTypeEquipmentRequirement` total: **3 → 144**.

Ordering: the seed lists each worksheet's equipment in **Section-A source order**, but the
model has **no ordering column**, so order is not persisted (no schema change was made to
add one, per scope). The portal currently renders these pairings by equipment-type name.

## 9. Ambiguous mappings

Listed in §4: `Cold Chain, Vaccine Refrigerator` and `Kelistrikan` — 2+ candidate
DeviceTypes each; deliberately **not** paired. The 8 confident aliases in §3 are
title-variant normalisations (plural/spelling/language), not semantic guesses.

## 10. Source rows intentionally skipped

- **All Section A rows of the 8 unmatched worksheets** (§4) — no confident/unambiguous
  `DeviceType`, so no pairing (24 equipment rows total). Their equipment names *do* exist as
  `EquipmentType` records; only the pairing is withheld.
- **Intra-worksheet duplicate equipment names** — none occurred (each Section A lists each
  tool once), but the seed dedups defensively per `(deviceType, equipmentType)`.
- **Nothing** from Sections B / C / D / E, calibration parameters, tolerance tables, or
  general knowledge was used.

## 11. Idempotency verification

| Run | Section-A pairings resolved | Existing before | Inserted (`skipDuplicates`) | Total after |
|---|---:|---:|---:|---:|
| 1st | 144 | 3 | **141** | 144 |
| 2nd | 144 | 144 | **0** | 144 |

Re-running creates nothing and changes nothing. ✅

### Full DB verification (before → after)

| Table | Before | After |
|---|---:|---:|
| `DeviceTypeEquipmentRequirement` | 3 | **144** (+141) |
| `DeviceType` | 59 | 59 (unchanged) |
| `EquipmentType` | 37 | 37 (unchanged) |
| `Equipment` | 1 | 1 (unchanged) |
| `Device` | 0 | 0 (unchanged) |
| `CalibrationRequest` | 4 | 4 (unchanged) |
| `PriceListItem` | 59 | 59 (unchanged) |
| `Quotation` | 1 | 1 (unchanged) |
| `WorkOrder` | 1 | 1 (unchanged) |
| `CalibrationJob` | 0 | 0 (unchanged) |

### Representative spot-checks vs. source Section A

| DeviceType | Seeded pairing (source order) | Source worksheet Section A |
|---|---|---|
| Bed Side Monitor | Vital Signs Simulator · Electrical Safety Analyzer · Thermohygrometer | `LK Bed Side Monitor.docx` — 1 VSS, 2 ESA, 3 Thermohygrometer ✅ |
| Audiometer | Sound Level Meter · Electrical Safety Analyzer · Thermohygrometer | `LK Audiometer.docx` ✅ |
| Autoclave | Data Logger Hi Temperature · Electrical Safety Analyzer · Thermohygrometer | `LK Autoclave.docx` ✅ |
| Bio Safety Cabinet | Particel Counter · Lux Meter · Sound Level Meter · Anemometer · UV Light Meter · Electrical Safety Analyzer · Thermohygrometer | `LK Bio Safety Cabinet.docx` (7 rows) ✅ |
| Dental X-Ray | Multimeter · Electrical Safety Analyzer · Thermohygrometer · Waterpass · Meteran | `LK Dental X-Ray.docx` (5 rows) ✅ |

## Final pairing report (42 DeviceTypes, 144 pairings)

| DeviceType | # | Equipment Types |
|---|---:|---|
| Audiometer | 3 | Electrical Safety Analyzer, Sound Level Meter, Thermohygrometer |
| Autoclave | 3 | Data Logger Hi Temperature, Electrical Safety Analyzer, Thermohygrometer |
| Baby Incubator | 3 | Electrical Safety Analyzer, Incubator Analyzer, Thermohygrometer |
| Bed Side Monitor | 3 | Electrical Safety Analyzer, Thermohygrometer, Vital Signs Simulator |
| Bio Safety Cabinet | 7 | Anemometer, Electrical Safety Analyzer, Lux Meter, Particel Counter, Sound Level Meter, Thermohygrometer, UV Light Meter |
| Blanket Warmer | 3 | Electrical Safety Analyzer, Thermohygrometer, Thermometer 12 channel |
| Blood Bank Refrigerators | 3 | Electrical Safety Analyzer, Thermohygrometer, Thermometer 12 channel |
| Blood Pressure Monitor | 3 | Electrical Safety Analyzer, Thermohygrometer, Vital Signs Simulator |
| Centrifuge | 4 | Digital Stopwatch, Digital Tachometer, Electrical Safety Analyzer, Thermohygrometer |
| Centrifuge Refrigerator | 4 | Digital Stopwatch, Digital Tachometer, Electrical Safety Analyzer, Thermohygrometer |
| CPAP | 3 | Electrical Safety Analyzer, Gas Flow Analyzer, Thermohygrometer |
| Dental Unit | 5 | Digital Luxmeter, Digital Pressure Meter, Electrical Safety Analyzer, Tachometer for Dental, Thermohygrometer |
| Dental X-Ray | 5 | Electrical Safety Analyzer, Meteran, Multimeter, Thermohygrometer, Waterpass |
| Electro Accupunture (EST) | 5 | Digital Stopwatch, Electrical Safety Analyzer, Oscilloscope, Resistance Box, Thermohygrometer |
| Electrocardiographs | 4 | ECG Simulator, Electrical Safety Analyzer, Mistar Baja, Thermohygrometer |
| Examination Lamp | 3 | Electrical Safety Analyzer, Spectral Chromometer, Thermohygrometer |
| Fetal Doppler | 3 | Electrical Safety Analyzer, Fetal Heart Rate Simulator, Thermohygrometer |
| Flow meter | 2 | Gas Flow Analyzer, Thermohygrometer |
| Head Lamp Medik | 3 | Electrical Safety Analyzer, Spectral Chromometer, Thermohygrometer |
| Humidifier | 3 | Electrical Safety Analyzer, Thermohygrometer, Thermometer 12 Channel (PT-100) |
| Infant Warmer | 3 | Electrical Safety Analyzer, Incubator Analyzer, Thermohygrometer |
| Infusion Pump | 3 | Electrical Safety Analyzer, Infusion Device Analyzer, Thermohygrometer |
| Laminar Air Flow | 7 | Anemometer, Electrical Safety Analyzer, Lux Meter, Particel Counter, Sound Level Meter, Thermohygrometer, UV Light Meter |
| Lampu Operasi | 3 | Electrical Safety Analyzer, Spectral Chromometer, Thermohygrometer |
| Laryngoskop | 3 | Electrical Safety Analyzer, Spectral Chromometer, Thermohygrometer |
| Medical Freezer | 3 | Electrical Safety Analyzer, Thermohygrometer, Thermometer 12 channel |
| Medical Refrigerator | 3 | Electrical Safety Analyzer, Thermohygrometer, Thermometer 12 channel |
| Mikroskop Laboratorium | 4 | Electrical Safety Analyzer, Objektif Mikrometer, Okuler Mikrometer, Thermohygrometer |
| Nebulizer Compressor | 3 | Electrical Safety Analyzer, Gas Flow Analyzer, Thermohygrometer |
| Oven | 3 | Electrical Safety Analyzer, Thermohygrometer, Thermometer 12 channel |
| Oxygen Concentrators | 2 | Gas Flow Analyzer, Thermohygrometer |
| Phototherapy | 3 | Electrical Safety Analyzer, Phototherapy Radiometer, Thermohygrometer |
| Platelet Agitator Incubator | 3 | Electrical Safety Analyzer, Thermohygrometer, Thermometer 12 channel |
| Pulse Oximeters | 3 | Electrical Safety Analyzer, Thermohygrometer, Vital Signs Simulator |
| Resuscitators (Pulmonary) | 3 | Digital Pressure Meter, Electrical Safety Analyzer, Thermohygrometer |
| Rotator | 4 | Digital Stopwatch, Digital Tachometer, Electrical Safety Analyzer, Thermohygrometer |
| Sphygmomanometers | 3 | Digital Pressure Meter, Digital Stopwatch, Thermohygrometer |
| Spirometer | 3 | Electrical Safety Analyzer, Syringe Calibrator 3L, Thermohygrometer |
| Sterillizer (Sterillisator) | 3 | Electrical Safety Analyzer, Thermohygrometer, Thermometer 12 channel |
| Suction Pump | 4 | Digital Pressure Meter, Digital Stopwatch, Electrical Safety Analyzer, Thermohygrometer |
| Syringe Pump | 3 | Electrical Safety Analyzer, Infusion Device Analyzer, Thermohygrometer |
| Ultrasonic Nebulizers | 3 | Electrical Safety Analyzer, Gas Flow Analyzer, Thermohygrometer |

## Files changed

**New:**
- `packages/db/prisma/seed-device-type-equipment-requirements.ts` — hardcoded 42-entry
  `PAIRINGS` list (worksheet DeviceType → Section-A equipment names, source order),
  runtime name-resolution, `createMany({ skipDuplicates: true })`, no update/delete.

**Modified:**
- `packages/db/package.json` — added `"seed:device-type-equipment-requirements"` script.

Run with: `pnpm --filter @medcal/db run seed:device-type-equipment-requirements`

## Open items for PKM

1. **2 ambiguous worksheets** — decide the canonical `DeviceType` for
   `Cold Chain, Vaccine Refrigerator` (`Coald Chain` vs `Kulkas Vaksin`) and `Kelistrikan`
   (→ `Electric Beds (kelistrikan)`?), then their pairings can be added manually or by a
   follow-up seed.
2. **6 worksheets with no `DeviceType`** — Auto Chemistry Analyzer, Hematologi Analyzer,
   Otoscope, Phaco Emulsifikasi, pH Meter, "Thermohygrometer" — a `DeviceType` must exist
   before their Section-A equipment can be paired.
3. **No ordering** is stored (model has no column). If PKM wants the portal to show
   equipment in Section-A order, that needs a schema addition (out of scope here).
4. The pairing carries the near-duplicate `EquipmentType`s as-seeded
   (`Thermometer 12 channel` vs `Thermometer 12 Channel (PT-100)`, `Lux Meter` vs
   `Digital Luxmeter`) — resolving those in the catalog will flow through to these pairings.
