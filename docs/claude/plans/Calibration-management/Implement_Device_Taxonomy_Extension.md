# IMPLEMENT — Add New Device Categories, Capabilities, and Device Types (from taxonomy investigation)

## Mode
IMPLEMENTATION task: schema additions (new enum-like reference rows, not structural schema
changes) + seed data. Scoped to `DeviceCategory`, `DeviceCapability`, `DeviceCapabilityItem`,
`DeviceType`, and (only for the new device types listed below) `DeviceCalibrationParameter`.
Do NOT touch `Device`, `CalibrationJob`, `MeasurementResult`, `JobEvidence`, `QualityReview`,
or any lifecycle module. Do NOT modify any of the 27 already-modeled device types' existing
data (categories, capabilities, or their 242 `DeviceCalibrationParameter` rows) — this task
only ADDS new rows for new device types, it does not touch existing ones.

## Source of truth

Read `D:\medcal\docs\claude\plans\Calibration-management\investigation-device-taxonomy-extension.md`
in full first — it contains the complete evidence-grounded analysis (per-device-type
measurements, proposed capabilities/items, proposed categories, with citations back to the
actual LK documents in `docs/technician-docs/`) that this task implements. Do not re-derive
the taxonomy yourself from scratch — the investigation already did that work; your job is to
implement what it recommends, re-verifying against the live schema/source docs as you go
(don't blindly trust the report's field names without confirming they match current
conventions).

## Explicitly OUT OF SCOPE for this task — do not implement these

1. **The 3 "free-form" lab analyzer device types**: Auto Chemistry Analyzer, Hematologi
   Analyzer, pH Meter. Their parameter lists are dynamic/certificate-dependent and don't fit
   the fixed-catalog model — a separate design task is needed first. Do not create `DeviceType`
   or `DeviceCalibrationParameter` rows for these three. (You MAY still note their existence if
   convenient, but do not seed calibration parameters for them.)
2. **Thermohygrometer**: its `DeviceCategory` placement is still pending a decision from the
   project owner (whether it belongs in the patient-care device taxonomy at all, or needs a
   new "Reference & Test Equipment" category, or is out of scope entirely). Do not create a
   `DeviceType` row for it in this task.
3. **`Otoscope` and `Phaco Emulsifikasi`**: confirmed to be mislabeled duplicate files, not
   real distinct device types (their content actually belongs to the light-source family and
   Suction Pump respectively, both of which already have their own correct LK documents). Do
   NOT create `DeviceType` entries for "Otoscope" or "Phaco Emulsifikasi" — they are not real
   device types.
4. **Do not touch existing data for Blood Pressure Monitor's NIBP tolerance or Baby
   Incubator's `INCU_RECOVERY_TIME` row** — both are flagged as pending a human decision
   (see the project's `Rangkuman_Gap_Konfirmasi_User.md`, items H1 and H2) and must not be
   modified by this task.
5. **`Electro Accupunture (EST)`'s category placement**: the investigation recommends keeping
   it as a single-device exception under the existing `Patient Care` category rather than
   inventing a new category for one device — follow that recommendation (do not create a new
   category just for EST).

## Step 0 — Inspect before implementing

1. Confirm current row counts: `DeviceCategory` (expect 9), `DeviceType` (expect 35),
   `DeviceCapability` (expect 21), `DeviceCapabilityItem` (expect 66),
   `DeviceCalibrationParameter` (expect 242). Report actual counts found.
2. Re-verify the current exact schema for all four models directly from `schema.prisma`.
3. Confirm the seeding mechanism/pattern used for the original `DeviceCategory`/`DeviceType`
   and `DeviceCapability`/`DeviceCapabilityItem`/`DeviceCalibrationParameter` seeds, and follow
   the same idempotent (upsert-based) approach — must be safe to run more than once.

## Step 1 — Add new DeviceCategory rows

Per the investigation report's Task B, add these new categories (verify names/reasoning
against the report, adjust only if you find a clear inconsistency when cross-checking against
the actual source documents):
- **Laboratory & Diagnostic Equipment**
- **Dental Equipment**
- **Medical Lighting**
- **Audiology & Physiological Testing**

Do NOT add a category for Thermohygrometer or a new category for EST (see "Out of Scope"
above).

## Step 2 — Add new DeviceCapability + DeviceCapabilityItem rows

Per the investigation report's Task A, add the new capabilities and their items needed for
device types NOT already covered by existing capabilities. Based on the report, this includes
(verify exact codes/names against the report and existing naming conventions as you implement):
- `AUDIOMETRIC_PERFORMANCE` (Audiometer)
- `CLEAN_AIR_CONTAINMENT` (Bio Safety Cabinet, Laminar Air Flow)
- `DENTAL_UNIT_PERFORMANCE` (Dental Unit)
- `XRAY_PERFORMANCE` (Dental X-Ray)
- `ELECTROTHERAPY_STIMULATION` (Electro Accupunture)
- `LIGHT_SOURCE_PERFORMANCE` (Examination Lamp, Head Lamp Medik, Lampu Operasi, Laryngoskop)
- `FETAL_HEART_RATE` (Fetal Doppler) — the report notes reusing `VITAL_SIGNS_MONITORING.HEART_RATE`
  is a defensible alternative; default to creating the new dedicated capability as the
  report's primary recommendation, since it keeps item semantics precise, but note this
  choice explicitly in your report so it can be revisited.
- `SPECTRAL_IRRADIANCE` (Phototherapy)
- `SPIROMETRY_VOLUME_ACCURACY` (Spirometer)

Do NOT create capabilities for the 3 out-of-scope free-form devices or for Thermohygrometer.

For device types that fully reuse EXISTING capabilities (per the report: Autoclave →
`TEMPERATURE_CHAMBER_STERILIZATION`; Centrifuge/Centrifuge Refrigerator/Rotator →
`ROTATIONAL_SPEED` [+ `TEMPERATURE_COLD_STORAGE` for the refrigerated ones]; CPAP →
`OXYGEN_CONCENTRATION` + `GAS_FLOW_RATE`; Infusion Pump → `INFUSION_FLOW`; Mikroskop
Laboratorium → `OPTICAL_MAGNIFICATION`; Platelet Agitator Incubator → `TEMPERATURE_COLD_STORAGE`;
Suction Pump → `VACUUM_SUCTION`; Blanket Warmer → `WARMER_SURFACE_TEMPERATURE`) — do NOT create
duplicate capabilities, just reference the existing ones when seeding their
`DeviceCalibrationParameter` rows in Step 4.

## Step 3 — Add new DeviceType rows

Add `DeviceType` rows for all device types in scope (the 21 minus the 3 free-form minus
Thermohygrometer = 17 device types), each linked to the correct `DeviceCategory` from Step 1
or an existing one, per the report's Task B assignments. Follow the exact naming/code
convention used by the existing 35 `DeviceType` rows.

## Step 4 — Add DeviceCalibrationParameter rows for the 17 in-scope device types

For each of the 17 device types, seed their `DeviceCalibrationParameter` rows following the
same structure as the existing 242 (linking `deviceTypeId` + `capabilityItemId` + `code` +
`name` + `valueType` + `uomId` + `toleranceMin`/`toleranceMax`/`toleranceNote`), using the
actual values found in the investigation report (which cites the real LK documents) — verify
against `docs/technician-docs/` directly rather than only trusting the report's summary numbers,
same discipline as the original G1 backfill task.

Remember: nearly every device type also needs `ENVIRONMENTAL_CONDITIONS` and
`ELECTRICAL_SAFETY` parameter rows (reusing those existing capabilities), in addition to its
device-specific performance parameters — check each device's actual LK document for whether
it has these sections (some don't, e.g. battery-only/mechanical devices, per the pattern
already established for Sphygmomanometer/Flow Meter/Oxygen Concentrator).

For the **Laryngoskop** illuminance tolerance specifically (40,000-160,000 lux, flagged by the
investigation as a possible copy-paste artifact): seed it as-is from the source document (do
not silently "correct" it), but flag it prominently in your final report as needing human
review, per the investigation's recommendation.

## Step 5 — Verification

1. Report new row counts for all affected tables.
2. Confirm the 27 pre-existing device types' data is completely unchanged (spot-check a few
   `DeviceCalibrationParameter` rows for e.g. `BLOOD_PRESSURE_MONITOR` to confirm the tolerance
   values are untouched from before this task).
3. Confirm the 3 free-form devices, Thermohygrometer, Otoscope, and Phaco Emulsifikasi have NO
   new rows anywhere.
4. Run the seed a SECOND time — confirm idempotent (same row counts, no duplicates/errors).
5. Run typecheck/lint/build per the project's actual scripts.
6. Spot-check 3-5 of the new device types' parameters against literal source document text
   (quote the source next to what was seeded), same discipline as prior backfill tasks.

## Output

Report:
- Row counts before/after for all 5 affected tables.
- Confirmation the 27 existing device types' data is untouched.
- Confirmation the exclusions (3 free-form devices, Thermohygrometer, Otoscope, Phaco
  Emulsifikasi, EST's category, NIBP tolerance, INCU_RECOVERY_TIME) were all respected.
- List of new DeviceCategory, DeviceCapability/Item, DeviceType rows created.
- Spot-check results with source quotes.
- The Laryngoskop illuminance flag, repeated clearly for visibility.
- Idempotency proof (run 1 vs run 2 counts).
- Typecheck/lint/build results.
