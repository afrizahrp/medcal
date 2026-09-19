# Report: Align Display Names with LK Source Terminology

**Date:** 2026-08-27
**Scope:** `name` field only, across `DeviceCategory`, `DeviceCapability`, `DeviceCapabilityItem`,
`DeviceCalibrationParameter`. No `code`, tolerance, `uomId`, `valueType`, `deviceTypeId`,
`capabilityItemId`, schema, or migration changes.
**Status:** **Phase 1 complete** (DeviceCategory + DeviceCapability). Phase 2
(DeviceCapabilityItem + DeviceCalibrationParameter — one-by-one LK verification) **not yet
started** — to be done in device-family batches per the agreed plan.

---

## Step 0 — Target database & baseline

**Connection used:** `postgresql://postgres:***@localhost:5432/pkmdb?schema=public`
(from `d:/medcal/.env`, line 2 — the local native Postgres `pkmdb` on `localhost:5432`).
Not Docker, not staging/production. Confirmed before any write.

**Row counts (current, live DB) — unchanged before/after Phase 1:**

| Table | Count |
|---|---|
| `DeviceCategory` | 13 |
| `DeviceCapability` | 30 |
| `DeviceCapabilityItem` | 98 |
| `DeviceCalibrationParameter` | 489 |

(The 489 already reflects the recent 7-row Pattern C split, `481 → 489`.)

Baseline `name` values for all 4 tables were dumped to JSON before changes.

---

## Step 1 — DeviceCategory (13/13 rows) — before → after

Applied the proposed Indonesian names verbatim (matched by `code`, not position).
All 13 changed.

| code | before | after |
|---|---|---|
| `PATIENT_MONITORING` | Patient Monitoring | Pemantauan Pasien |
| `RESPIRATORY_OXYGEN` | Respiratory & Oxygen | Alat Pernapasan & Oksigen |
| `NEONATAL_INFANT_CARE` | Neonatal & Infant Care | Perawatan Bayi & Neonatal |
| `RESUSCITATION` | Resuscitation | Resusitasi |
| `SUCTION_FLUID` | Suction & Fluid Management | Suction & Pengelolaan Cairan |
| `STERILIZATION` | Sterilization | Sterilisasi |
| `TEMPERATURE_THERAPY` | Temperature Therapy | Terapi Suhu |
| `COLD_CHAIN_STORAGE` | Cold Chain & Storage | Penyimpanan Dingin (Cold Chain) |
| `PATIENT_CARE` | Patient Care | Perawatan Pasien |
| `LABORATORY_DIAGNOSTIC` | Laboratory & Diagnostic Equipment | Alat Laboratorium & Diagnostik |
| `DENTAL_EQUIPMENT` | Dental Equipment | Alat Kedokteran Gigi |
| `MEDICAL_LIGHTING` | Medical Lighting | Pencahayaan Medis |
| `AUDIOLOGY_PHYSIOLOGICAL` | Audiology & Physiological Testing | Audiologi & Uji Fisiologi |

---

## Step 2 — DeviceCapability (30/30 rows) — before → after

Applied the proposed Indonesian names verbatim (matched by `code`). All 30 changed.

| code | before | after |
|---|---|---|
| `ENVIRONMENTAL_CONDITIONS` | Environmental Conditions | Kondisi Lingkungan |
| `ELECTRICAL_SAFETY` | Electrical Safety | Keselamatan Listrik |
| `NIBP` | Non-Invasive Blood Pressure | Tekanan Darah Non-Invasif (NIBP) |
| `VITAL_SIGNS_MONITORING` | Vital Signs Monitoring | Pemantauan Tanda Vital |
| `ECG_PERFORMANCE` | ECG Performance | Kinerja Elektrokardiografi (EKG) |
| `NIBP_LEAK_TEST` | NIBP Cuff/Manometer Leak & Deflation | Uji Kebocoran Manset NIBP |
| `VENTILATION_PERFORMANCE` | Ventilation Performance | Kinerja Ventilasi |
| `RESUSCITATOR_PRESSURE` | Resuscitator Pressure | Tekanan Resusitator |
| `TEMPERATURE_CHAMBER_STERILIZATION` | Sterilization Chamber Temperature | Suhu Ruang Sterilisasi |
| `TEMPERATURE_COLD_STORAGE` | Cold Storage Temperature Uniformity | Suhu Penyimpanan Dingin |
| `INCUBATOR_ENVIRONMENT` | Incubator Environment | Lingkungan Inkubator |
| `WARMER_SURFACE_TEMPERATURE` | Warmer Surface Temperature | Suhu Permukaan Alat Penghangat |
| `HUMIDIFIER_TEMPERATURE` | Humidifier Temperature | Suhu Humidifier |
| `VACUUM_SUCTION` | Vacuum / Suction Performance | Kinerja Vakum/Suction |
| `ROTATIONAL_SPEED` | Rotational Speed & Timing | Kecepatan Putar |
| `INFUSION_FLOW` | Infusion Flow Performance | Laju Aliran Infus |
| `OPTICAL_MAGNIFICATION` | Optical Magnification | Pembesaran Optik |
| `GAS_FLOW_RATE` | Gas Flow Rate | Laju Aliran Gas |
| `OXYGEN_CONCENTRATION` | Oxygen Concentration | Konsentrasi Oksigen |
| `ULTRASOUND_IMAGING` | Ultrasound Imaging Performance | Pencitraan Ultrasonografi (USG) |
| `MASS_WEIGHING` | Mass Weighing Performance | Penimbangan Massa |
| `AUDIOMETRIC_PERFORMANCE` | Audiometric Performance | Kinerja Audiometri |
| `CLEAN_AIR_CONTAINMENT` | Clean Air Containment | Kebersihan & Kontainmen Udara |
| `DENTAL_UNIT_PERFORMANCE` | Dental Unit Performance | Kinerja Unit Gigi |
| `XRAY_PERFORMANCE` | X-Ray Performance | Kinerja Sinar-X |
| `ELECTROTHERAPY_STIMULATION` | Electrotherapy Stimulation | Stimulasi Elektroterapi |
| `LIGHT_SOURCE_PERFORMANCE` | Light Source Performance | Kinerja Sumber Cahaya |
| `FETAL_HEART_RATE` | Fetal Heart Rate | Detak Jantung Janin |
| `SPECTRAL_IRRADIANCE` | Spectral Irradiance | Iradiansi Spektral (Fototerapi) |
| `SPIROMETRY_VOLUME_ACCURACY` | Spirometry Volume Accuracy | Akurasi Volume Spirometri |

All 30 `code` values verified to match the live DB exactly before applying.

---

## Step 3 — DeviceCapabilityItem (98) & DeviceCalibrationParameter (489)

**Not started.** Requires per-row verification against the literal parameter text in the
50 LK worksheets in `docs/technician-docs/` (all extracted to plain text for the batch pass).
Will be reported as: only rows whose `name` actually changes, each with old → new and the LK
source quote; ambiguous rows listed separately for human decision.

---

## Step 4 — Seed script sync

Phase 1 was applied **through** the existing idempotent seeds (both already `upsert` with
`update: { name }`), so code and DB are in sync by construction:

- `packages/db/prisma/seed-device-types.ts` — `CATEGORIES[].name` (13 values) updated.
- `packages/db/prisma/seed-device-capabilities.ts` — `CAPABILITIES[].name` (30 values) updated.

Re-ran both seeds as verification:
```
[seed] 13 DeviceCategory rows upserted.
[seed] 59 DeviceType rows upserted.
[seed] 30 DeviceCapability rows upserted (table count: 30).
[seed] 98 DeviceCapabilityItem rows upserted (table count: 98).
```
A post-run DB dump diff vs. baseline shows **exactly** 13 Category + 30 Capability `name`
changes and **zero** other field changes anywhere (Item 0, Param 0, no adds/removes).

---

## Step 5 — Verification

| Check | Result |
|---|---|
| Row counts 4 tables (before → after) | 13/30/98/489 → 13/30/98/489 — unchanged |
| Fields other than `name` changed | none (dump diff: Category/Capability only `name`; Item & Param untouched) |
| `DeviceCapabilityItem` / `DeviceCalibrationParameter` names | untouched (Phase 2) |
| Code depending on English category/capability name strings | none — only a placeholder string in `device-category-form-fields.tsx`; no branching logic |
| `pnpm turbo run typecheck` | ✅ 10 successful / 10 total |
| `pnpm turbo run build` | ✅ 5 successful / 5 total (59s) |
| `prettier --check` on the 2 seed files | ⚠️ pre-existing style warnings (present before this change, CRLF/line-ending origin from the prior CommandPopover commit) — not introduced here; no formatting rewrite done to avoid a large unrelated diff |
| lint | project lint scripts are `echo … skipped` stubs (no real linter wired) |

> Working tree still contains the large pre-existing unrelated uncommitted work noted in the
> Pattern C report (CommandPopover refactor, deleted planning docs). Outside this task's scope.

---

## Files changed (Phase 1)

- `packages/db/prisma/seed-device-types.ts` — 13 `CATEGORIES[].name` values.
- `packages/db/prisma/seed-device-capabilities.ts` — 30 `CAPABILITIES[].name` values.

No new one-time correction script was needed (unlike the Pattern C split) — the change is a
pure `name` update that the existing seeds' `upsert.update` already carries.

---

## Next: Phase 2 plan

Work `DeviceCapabilityItem` + `DeviceCalibrationParameter` device-family by device-family
(≈51 device types / 50 LK docs), for each row:
1. locate the source LK doc + table row (via `deviceTypeId` / `capabilityItemId`);
2. read the literal "Parameter" text;
3. keep if already consistent with LK (incl. LK's own English/mixed terms like Heart Rate,
   NIBP, SPO2); rewrite only where the stored name is an invented English/technical term but
   LK writes Indonesian;
4. rows with no 1:1 LK match → separate "human decision" list, no guessing.
Then sync `seed-device-capabilities.ts` (`ITEMS[].name`),
`seed-device-calibration-parameters.ts`, and
`seed-device-taxonomy-extension-parameters.ts`, re-run seeds, re-verify, typecheck/build.
