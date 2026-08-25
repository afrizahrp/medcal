/**
 * Seeds DeviceCategory + the 35 confirmed Kemenkes DeviceType rows.
 * Taxonomy is an internal domain grouping — DeviceType.name is source-locked.
 * Pending-review items are intentionally not seeded.
 * Run manually: pnpm --filter @medcal/db run seed:device-types
 */
import { prisma } from "../src/index";

interface CategorySeedRow {
  code: string;
  name: string;
  description: string;
}

interface TypeSeedRow {
  categoryCode: string;
  code: string;
  name: string;
}

const CATEGORIES: CategorySeedRow[] = [
  {
    code: "PATIENT_MONITORING",
    name: "Patient Monitoring",
    description: "Vital-sign and bedside monitoring, including ECG and oximetry.",
  },
  {
    code: "RESPIRATORY_OXYGEN",
    name: "Respiratory & Oxygen",
    description: "Ventilation, oxygen delivery, humidification, nebulization, and gas flow.",
  },
  {
    code: "NEONATAL_INFANT_CARE",
    name: "Neonatal & Infant Care",
    description: "Incubators and warmers used primarily for neonates and infants.",
  },
  {
    code: "RESUSCITATION",
    name: "Resuscitation",
    description: "Cardiac and pulmonary resuscitators.",
  },
  {
    code: "SUCTION_FLUID",
    name: "Suction & Fluid Management",
    description: "Surgical aspirators, suction regulators, and suction-tagged pumps.",
  },
  {
    code: "STERILIZATION",
    name: "Sterilization",
    description: "Sterilizers and medical ovens used for sterilization or drying.",
  },
  {
    code: "TEMPERATURE_THERAPY",
    name: "Temperature Therapy",
    description: "Adult warming and therapeutic heating devices (not cold-chain storage).",
  },
  {
    code: "COLD_CHAIN_STORAGE",
    name: "Cold Chain & Storage",
    description: "Medical refrigerators, freezers, and vaccine/blood-bank cold storage.",
  },
  {
    code: "PATIENT_CARE",
    name: "Patient Care",
    description: "Patient-support equipment whose primary capability is electrical/mechanical care.",
  },
];

/**
 * Exactly 35 confirmed Kemenkes DeviceTypes. Names are copied from
 * Sertifikat Standar PT Presisi Kalibrasi Medika and must not be renamed.
 *
 * Ambiguous mappings (documented):
 * - Oxymeter monitor → Patient Monitoring: source spelling kept; same domain as Pulse Oximeters.
 * - Cardiac Output Units / Electrocardiographs / Ambulatory ECG → Patient Monitoring:
 *   cardiac measurement/monitoring rather than a separate 3-item Cardiology category.
 * - Sphygmomanometers → Patient Monitoring: blood-pressure measurement, alongside Blood Pressure Monitor.
 * - Humidifier → Respiratory & Oxygen: airway humidification, not neonatal warming.
 * - Regulators (Air, O2, Suction [except tracheal]) → Respiratory & Oxygen:
 *   primary listed functions are Air/O2; suction is secondary.
 * - Radiant Warmer → Neonatal & Infant Care: unmarked (non-Adult) warmer in the Kemenkes list.
 * - Radiant Warmers (Adult) → Temperature Therapy: explicitly adult, not neonatal.
 * - Breast Pumps (suction) → Suction & Fluid Management: source name tags suction/vacuum.
 * - Oven → Sterilization: medical oven in this capability list is sterilizer/drying, not cold chain.
 * - Paraffin Baths → Temperature Therapy: therapeutic heating, not storage.
 * - Coald Chain → Cold Chain & Storage: source spelling kept in `name`; code uses COALD_CHAIN.
 * - Electric Beds (kelistrikan) → Patient Care: electrical safety of a care bed, not monitoring.
 */
const TYPES: TypeSeedRow[] = [
  // Patient Monitoring
  { categoryCode: "PATIENT_MONITORING", code: "BLOOD_PRESSURE_MONITOR", name: "Blood Pressure Monitor" },
  { categoryCode: "PATIENT_MONITORING", code: "PULSE_OXIMETERS", name: "Pulse Oximeters" },
  { categoryCode: "PATIENT_MONITORING", code: "OXYMETER_MONITOR", name: "Oxymeter monitor" },
  { categoryCode: "PATIENT_MONITORING", code: "AMBULATORY_ECG", name: "Ambulatory ECG" },
  { categoryCode: "PATIENT_MONITORING", code: "CARDIAC_OUTPUT_UNITS", name: "Cardiac Output Units (heart rate)" },
  { categoryCode: "PATIENT_MONITORING", code: "ELECTROCARDIOGRAPHS", name: "Electrocardiographs" },
  { categoryCode: "PATIENT_MONITORING", code: "SPHYGMOMANOMETERS", name: "Sphygmomanometers" },
  { categoryCode: "PATIENT_MONITORING", code: "BED_SIDE_MONITOR", name: "Bed Side Monitor" },
  { categoryCode: "PATIENT_MONITORING", code: "PATIENT_MONITOR", name: "Patient Monitor" },

  // Respiratory & Oxygen
  { categoryCode: "RESPIRATORY_OXYGEN", code: "HUMIDIFIER", name: "Humidifier" },
  { categoryCode: "RESPIRATORY_OXYGEN", code: "VENTILATOR", name: "Ventilator" },
  { categoryCode: "RESPIRATORY_OXYGEN", code: "OXYGEN_AIR_PROPORTIONERS", name: "Oxygen-Air Proportioners" },
  { categoryCode: "RESPIRATORY_OXYGEN", code: "REGULATORS_AIR_O2_SUCTION", name: "Regulators (Air, O2, Suction [except tracheal])" },
  { categoryCode: "RESPIRATORY_OXYGEN", code: "OXYGEN_CONCENTRATORS", name: "Oxygen Concentrators" },
  { categoryCode: "RESPIRATORY_OXYGEN", code: "ULTRASONIC_NEBULIZERS", name: "Ultrasonic Nebulizers" },
  { categoryCode: "RESPIRATORY_OXYGEN", code: "NEBULIZER_COMPRESSOR", name: "Nebulizer Compressor" },
  { categoryCode: "RESPIRATORY_OXYGEN", code: "FLOW_METER", name: "Flow meter" },

  // Neonatal & Infant Care
  { categoryCode: "NEONATAL_INFANT_CARE", code: "BABY_INCUBATOR", name: "Baby Incubator" },
  { categoryCode: "NEONATAL_INFANT_CARE", code: "INFANT_WARMER", name: "Infant Warmer" },
  { categoryCode: "NEONATAL_INFANT_CARE", code: "RADIANT_WARMER", name: "Radiant Warmer" },

  // Resuscitation
  { categoryCode: "RESUSCITATION", code: "RESUSCITATORS_CARDIAC", name: "Resuscitators (Cardiac)" },
  { categoryCode: "RESUSCITATION", code: "RESUSCITATORS_PULMONARY", name: "Resuscitators (Pulmonary)" },

  // Suction & Fluid Management
  { categoryCode: "SUCTION_FLUID", code: "ASPIRATORS_SUCTION", name: "Aspirators (Surgical, Thoracic, and Uterine)/ Suction" },
  { categoryCode: "SUCTION_FLUID", code: "BREAST_PUMPS", name: "Breast Pumps (suction)" },
  { categoryCode: "SUCTION_FLUID", code: "REGULATORS_LOW_VOLUME_SUCTION", name: "Regulators (Low-Volume Suction)" },

  // Sterilization
  { categoryCode: "STERILIZATION", code: "STERILLIZER", name: "Sterillizer (Sterillisator)" },
  { categoryCode: "STERILIZATION", code: "OVEN", name: "Oven" },

  // Temperature Therapy
  { categoryCode: "TEMPERATURE_THERAPY", code: "RADIANT_WARMERS_ADULT", name: "Radiant Warmers (Adult)" },
  { categoryCode: "TEMPERATURE_THERAPY", code: "PARAFFIN_BATHS", name: "Paraffin Baths" },

  // Cold Chain & Storage
  { categoryCode: "COLD_CHAIN_STORAGE", code: "BLOOD_BANK_REFRIGERATORS", name: "Blood Bank Refrigerators" },
  { categoryCode: "COLD_CHAIN_STORAGE", code: "KULKAS_VAKSIN", name: "Kulkas Vaksin" },
  { categoryCode: "COLD_CHAIN_STORAGE", code: "COALD_CHAIN", name: "Coald Chain" },
  { categoryCode: "COLD_CHAIN_STORAGE", code: "MEDICAL_REFRIGERATOR", name: "Medical Refrigerator" },
  { categoryCode: "COLD_CHAIN_STORAGE", code: "MEDICAL_FREEZER", name: "Medical Freezer" },

  // Patient Care
  { categoryCode: "PATIENT_CARE", code: "ELECTRIC_BEDS", name: "Electric Beds (kelistrikan)" },
];

async function seedDeviceTypes() {
  if (TYPES.length !== 35) {
    throw new Error(`[seed] Expected 35 DeviceType rows, got ${TYPES.length}`);
  }

  const categoryIdByCode = new Map<string, string>();

  for (const row of CATEGORIES) {
    const category = await prisma.deviceCategory.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        name: row.name,
        description: row.description,
        isActive: true,
      },
      update: {
        name: row.name,
        description: row.description,
      },
    });
    categoryIdByCode.set(row.code, category.id);
  }

  for (const row of TYPES) {
    const categoryId = categoryIdByCode.get(row.categoryCode);
    if (!categoryId) {
      throw new Error(`[seed] Unknown categoryCode ${row.categoryCode} for type ${row.code}`);
    }
    await prisma.deviceType.upsert({
      where: { code: row.code },
      create: {
        categoryId,
        code: row.code,
        name: row.name,
        isActive: true,
      },
      update: {
        categoryId,
        name: row.name,
      },
    });
  }

  console.log(`[seed] ${CATEGORIES.length} DeviceCategory rows upserted.`);
  console.log(`[seed] ${TYPES.length} DeviceType rows upserted.`);
  await prisma.$disconnect();
}

seedDeviceTypes().catch((error) => {
  console.error("[seed] Failed:", error);
  process.exit(1);
});
