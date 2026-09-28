/**
 * Minto Hardjo High-Volume Calibration Trial — synthetic master data.
 *
 * Creates the 37 `TRIAL_MH_*` DeviceType rows the trial's SYNTHETIC-tier Excel
 * rows resolve to (see `packages/db/fixtures/trial-minto-hardjo/device-type-mapping.ts`),
 * each assigned to the closest fitting existing `DeviceCategory`, with four new
 * categories added only where nothing existing genuinely fits (Ophthalmology /
 * Medical Imaging / Physiotherapy / Measurement Instruments — the audit
 * confirmed none of the 13 existing categories cover these domains).
 *
 * Every DeviceType gets exactly 2 `DeviceCalibrationParameter` rows (Pattern A,
 * `entryStyle: DIRECT_REPLICATES` default, `valueType: NUMBER` default) under
 * two EXISTING, reused DeviceCapabilityItem rows that are already present on
 * nearly every real LK worksheet (Environmental Conditions / Suhu Ruangan, and
 * Electrical Safety / Resistansi Pembumian Protektif — see
 * seed-device-capabilities.ts). No new DeviceCapability/DeviceCapabilityItem is
 * created, and no existing DeviceCategory/DeviceType/DeviceCapability/
 * DeviceCalibrationParameter/DeviceTypeAlias row is edited — minimum-viable,
 * semantically plausible, per the approved plan §A.6/§C.3.
 *
 * Idempotent by design: every row is upserted by its unique `code`, so running
 * this twice (or once after `reset-trial-minto-hardjo` deactivated everything)
 * never duplicates rows — it reactivates (`isActive: true`) what's already
 * there. It is NOT itself the trial-transaction idempotency guard (that lives
 * in `apps/api/scripts/trial-minto-hardjo/seed.ts`); this file only manages
 * master data, which the project's soft-delete convention allows to be
 * reactivated safely.
 *
 * Run manually: pnpm --filter @medcal/db run seed:trial-minto-hardjo-device-types
 */
import { prisma } from "../src/index";

export interface SyntheticCategorySeedRow {
  code: string;
  name: string;
  description: string;
}

export interface SyntheticDeviceTypeSeedRow {
  code: string;
  name: string;
  /** Either a new TRIAL_MH_* category code (this file) or an existing one (reused, never edited). */
  categoryCode: string;
}

export const SYNTHETIC_CATEGORIES: readonly SyntheticCategorySeedRow[] = [
  {
    code: "TRIAL_MH_OPHTHALMOLOGY",
    name: "Oftalmologi (Trial)",
    description:
      "Trial-only synthetic category: ophthalmic diagnostic instruments. No existing category covers optics/ophthalmology.",
  },
  {
    code: "TRIAL_MH_MEDICAL_IMAGING",
    name: "Pencitraan Medis (Trial)",
    description:
      "Trial-only synthetic category: general X-ray and ultrasound imaging beyond Dental X-Ray, which is dental-specific.",
  },
  {
    code: "TRIAL_MH_PHYSIOTHERAPY",
    name: "Fisioterapi (Trial)",
    description:
      "Trial-only synthetic category: physiotherapy/rehabilitation energy-delivery devices. No existing physiotherapy category.",
  },
  {
    code: "TRIAL_MH_MEASUREMENT_INSTRUMENTS",
    name: "Instrumen Ukur Umum (Trial)",
    description:
      "Trial-only synthetic category: general weighing scales and environmental measurement instruments.",
  },
];

export const SYNTHETIC_DEVICE_TYPES: readonly SyntheticDeviceTypeSeedRow[] = [
  // ── Reused existing categories ───────────────────────────────────────────
  { code: "TRIAL_MH_ANESTHESIA_VENTILATOR", name: "Anesthesia With Ventilator", categoryCode: "RESPIRATORY_OXYGEN" },
  { code: "TRIAL_MH_HFNC", name: "High Flow Nasal Cannula (HFNC)", categoryCode: "RESPIRATORY_OXYGEN" },

  { code: "TRIAL_MH_AED", name: "Automated External Defibrillator (AED)", categoryCode: "RESUSCITATION" },
  { code: "TRIAL_MH_DEFIBRILLATOR", name: "Defibrillator", categoryCode: "RESUSCITATION" },
  { code: "TRIAL_MH_ROTABLATOR", name: "Rotablator", categoryCode: "RESUSCITATION" },

  { code: "TRIAL_MH_CUSA", name: "CUSA (Cavitron Ultrasonic Surgical Aspirator)", categoryCode: "SUCTION_FLUID" },
  { code: "TRIAL_MH_WSD", name: "Water Seal Drainage Pump (WSD)", categoryCode: "SUCTION_FLUID" },

  { code: "TRIAL_MH_ESU", name: "Electrosurgical Unit (ESU)", categoryCode: "PATIENT_CARE" },
  { code: "TRIAL_MH_ENT_UNIT", name: "ENT Unit", categoryCode: "PATIENT_CARE" },
  { code: "TRIAL_MH_INJECTOR", name: "Injector", categoryCode: "PATIENT_CARE" },
  { code: "TRIAL_MH_LAPAROSCOPY", name: "Laparoscopy", categoryCode: "PATIENT_CARE" },
  { code: "TRIAL_MH_MICROSCOPE", name: "Microscope", categoryCode: "PATIENT_CARE" },
  { code: "TRIAL_MH_OPERATING_MICROSCOPE", name: "Operating Microscope", categoryCode: "PATIENT_CARE" },

  { code: "TRIAL_MH_WATER_BATH", name: "Water Bath", categoryCode: "LABORATORY_DIAGNOSTIC" },

  // ── New synthetic categories ─────────────────────────────────────────────
  { code: "TRIAL_MH_AUTO_KERATOMETER", name: "Auto Keratometer / Refractometers", categoryCode: "TRIAL_MH_OPHTHALMOLOGY" },
  { code: "TRIAL_MH_AUTO_REFRACTOMETER", name: "Auto Refractometers", categoryCode: "TRIAL_MH_OPHTHALMOLOGY" },
  { code: "TRIAL_MH_BIOMETRY", name: "Biometri", categoryCode: "TRIAL_MH_OPHTHALMOLOGY" },
  { code: "TRIAL_MH_LENSOMETER", name: "Lensometer Mata", categoryCode: "TRIAL_MH_OPHTHALMOLOGY" },
  { code: "TRIAL_MH_TONOMETER", name: "Tonometer", categoryCode: "TRIAL_MH_OPHTHALMOLOGY" },

  { code: "TRIAL_MH_DIGITAL_XRAY_DR_READER", name: "Digital X-Ray DR Reader", categoryCode: "TRIAL_MH_MEDICAL_IMAGING" },
  { code: "TRIAL_MH_XRAY_BMD", name: "X-Ray Bone Mineral Densitometri (BMD)", categoryCode: "TRIAL_MH_MEDICAL_IMAGING" },
  { code: "TRIAL_MH_XRAY_C_ARM", name: "X-Ray C-Arm", categoryCode: "TRIAL_MH_MEDICAL_IMAGING" },
  { code: "TRIAL_MH_XRAY_MOBILE", name: "X-Ray Mobile", categoryCode: "TRIAL_MH_MEDICAL_IMAGING" },
  { code: "TRIAL_MH_XRAY_MOBILE_FDR", name: "X-Ray Mobile FDR X-Air", categoryCode: "TRIAL_MH_MEDICAL_IMAGING" },
  { code: "TRIAL_MH_USG", name: "Ultrasonography (USG)", categoryCode: "TRIAL_MH_MEDICAL_IMAGING" },

  { code: "TRIAL_MH_CRYOTHERAPY", name: "Cryotherapy Unit", categoryCode: "TRIAL_MH_PHYSIOTHERAPY" },
  { code: "TRIAL_MH_ELECTROSTIMULATOR", name: "Electrostimulator / Tens", categoryCode: "TRIAL_MH_PHYSIOTHERAPY" },
  { code: "TRIAL_MH_INFRARED_THERAPY", name: "Infrared Standing / Mobile", categoryCode: "TRIAL_MH_PHYSIOTHERAPY" },
  { code: "TRIAL_MH_SHOCK_WAVE_THERAPY", name: "Shock Wave Therapy", categoryCode: "TRIAL_MH_PHYSIOTHERAPY" },
  { code: "TRIAL_MH_TRACTION", name: "Traction", categoryCode: "TRIAL_MH_PHYSIOTHERAPY" },
  { code: "TRIAL_MH_TREADMILL", name: "Treadmill", categoryCode: "TRIAL_MH_PHYSIOTHERAPY" },
  { code: "TRIAL_MH_ULTRASOUND_THERAPY", name: "Ultrasound Therapy", categoryCode: "TRIAL_MH_PHYSIOTHERAPY" },

  { code: "TRIAL_MH_THERMOHYGROMETER", name: "Thermohygrometer", categoryCode: "TRIAL_MH_MEASUREMENT_INSTRUMENTS" },
  { code: "TRIAL_MH_TIMBANGAN_BADAN_TINGGI", name: "Timbangan Badan + Tinggi", categoryCode: "TRIAL_MH_MEASUREMENT_INSTRUMENTS" },
  { code: "TRIAL_MH_TIMBANGAN_DEWASA_DIGITAL", name: "Timbangan Dewasa Digital", categoryCode: "TRIAL_MH_MEASUREMENT_INSTRUMENTS" },
  { code: "TRIAL_MH_TIMBANGAN_MASSA", name: "Timbangan Massa", categoryCode: "TRIAL_MH_MEASUREMENT_INSTRUMENTS" },
  { code: "TRIAL_MH_TIMBANGAN_OBAT", name: "Timbangan Obat", categoryCode: "TRIAL_MH_MEASUREMENT_INSTRUMENTS" },
];

// Reused, pre-existing, global capability items — present on nearly every real
// LK worksheet already (seed-device-capabilities.ts). Never edited here.
const REUSED_CAPABILITY_ITEMS = [
  { capabilityCode: "ENVIRONMENTAL_CONDITIONS", itemName: "Suhu Ruangan", paramSuffix: "ROOM_TEMP", uomCode: "DEG_C", toleranceMin: 18, toleranceMax: 30 },
  { capabilityCode: "ELECTRICAL_SAFETY", itemName: "Resistansi Pembumian Protektif", paramSuffix: "EARTH_RESISTANCE", uomCode: "OHM", toleranceMin: 0, toleranceMax: 0.2 },
] as const;

export interface SyntheticSeedManifest {
  categories: Array<{ id: string; code: string; created: boolean }>;
  deviceTypes: Array<{ id: string; code: string; name: string; categoryCode: string }>;
  parameters: Array<{ id: string; code: string; deviceTypeCode: string }>;
}

export async function seedTrialMintoHardjoDeviceTypes(): Promise<SyntheticSeedManifest> {
  const manifest: SyntheticSeedManifest = { categories: [], deviceTypes: [], parameters: [] };

  for (const cat of SYNTHETIC_CATEGORIES) {
    const existing = await prisma.deviceCategory.findUnique({ where: { code: cat.code } });
    const row = await prisma.deviceCategory.upsert({
      where: { code: cat.code },
      create: { code: cat.code, name: cat.name, description: cat.description, isActive: true },
      update: { isActive: true },
    });
    manifest.categories.push({ id: row.id, code: row.code, created: !existing });
  }

  const capabilityItemIds: Record<string, string> = {};
  for (const spec of REUSED_CAPABILITY_ITEMS) {
    const capability = await prisma.deviceCapability.findUniqueOrThrow({
      where: { code: spec.capabilityCode },
    });
    const item = await prisma.deviceCapabilityItem.findFirstOrThrow({
      where: { capabilityId: capability.id, name: spec.itemName },
    });
    capabilityItemIds[spec.paramSuffix] = item.id;
  }

  const uomIds: Record<string, string> = {};
  for (const spec of REUSED_CAPABILITY_ITEMS) {
    const uom = await prisma.uom.findUniqueOrThrow({ where: { code: spec.uomCode } });
    uomIds[spec.uomCode] = uom.id;
  }

  for (const dt of SYNTHETIC_DEVICE_TYPES) {
    const category = await prisma.deviceCategory.findUniqueOrThrow({
      where: { code: dt.categoryCode },
    });
    const deviceType = await prisma.deviceType.upsert({
      where: { code: dt.code },
      create: { code: dt.code, name: dt.name, categoryId: category.id, isActive: true },
      update: { isActive: true },
    });
    manifest.deviceTypes.push({
      id: deviceType.id,
      code: deviceType.code,
      name: deviceType.name,
      categoryCode: dt.categoryCode,
    });

    for (const spec of REUSED_CAPABILITY_ITEMS) {
      const paramCode = `${dt.code}_${spec.paramSuffix}`;
      const existingParam = await prisma.deviceCalibrationParameter.findFirst({
        where: { deviceTypeId: deviceType.id, capabilityItemId: capabilityItemIds[spec.paramSuffix]!, code: paramCode },
      });
      const param = existingParam
        ? await prisma.deviceCalibrationParameter.update({
            where: { id: existingParam.id },
            data: { isActive: true },
          })
        : await prisma.deviceCalibrationParameter.create({
            data: {
              deviceTypeId: deviceType.id,
              capabilityItemId: capabilityItemIds[spec.paramSuffix]!,
              code: paramCode,
              name: spec.itemName,
              valueType: "NUMBER",
              uomId: uomIds[spec.uomCode]!,
              toleranceMin: spec.toleranceMin,
              toleranceMax: spec.toleranceMax,
              decimalPlaces: 1,
              sortOrder: spec.paramSuffix === "ROOM_TEMP" ? 10 : 20,
              isActive: true,
            },
          });
      manifest.parameters.push({ id: param.id, code: param.code, deviceTypeCode: dt.code });
    }
  }

  return manifest;
}

async function main() {
  const manifest = await seedTrialMintoHardjoDeviceTypes();
  console.log(
    `[seed-trial-minto-hardjo-device-types] ${manifest.categories.length} categories, ` +
      `${manifest.deviceTypes.length} device types, ${manifest.parameters.length} calibration parameters.`,
  );
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
