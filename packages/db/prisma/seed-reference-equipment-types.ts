/**
 * Seeds the Reference Equipment Catalog (EquipmentType master) from
 * Section A ("A. Daftar Alat yang Digunakan") of the PKM technician
 * calibration worksheets in docs/technician-docs/*.docx.
 *
 * This is an INITIAL DATASET for PKM to manually verify against their own
 * records — NOT a finalised master. See the traceability report:
 *   docs/module-specs/device-management/equipment/implementation_report_reference_equipment_seed.md
 *
 * Rules honoured:
 *  - Only Section A "Nama Alat" values. Source wording (incl. typos such as
 *    "Particel Counter", "refrence", "Spectral Chromometer") is PRESERVED.
 *  - Deduplicated on exact (case/whitespace-normalised) name. NOT fuzzy-merged
 *    — near-duplicates are seeded separately and flagged in the report.
 *  - Existing EquipmentType rows are NEVER modified (match by case-insensitive
 *    name, then skip).
 *  - No physical Equipment units, no EquipmentRequirement links, no category /
 *    description invented (category is left null — it cannot be derived from
 *    Section A).
 *  - `code` follows the established MEDCAL master-data seed convention
 *    (UPPER_SNAKE_CASE — as used by seed-uoms.ts / seed-device-types.ts /
 *    seed-device-capabilities.ts). See report §"Code convention".
 *  - Idempotent: re-running creates nothing new and changes nothing.
 *
 * Run manually: pnpm --filter @medcal/db run seed:reference-equipment-types
 */
import { prisma } from "../src/index";

interface EquipmentTypeSeedRow {
  /** Exact "Nama Alat" as written in Section A (normalised whitespace only). */
  name: string;
  /** UPPER_SNAKE_CASE derived from `name` (MEDCAL master-data seed convention). */
  code: string;
}

// 34 NEW names. The 3 already-present names (Electrical Safety Analyzer,
// Thermohygrometer, Vital Signs Simulator) are deliberately NOT listed here;
// the name-match guard below is a belt-and-braces safety net.
const ROWS: EquipmentTypeSeedRow[] = [
  { name: "Anemometer", code: "ANEMOMETER" },
  { name: "Buffer Solution", code: "BUFFER_SOLUTION" },
  { name: "Climatic Chamber", code: "CLIMATIC_CHAMBER" },
  { name: "Data Logger Hi Temperature", code: "DATA_LOGGER_HI_TEMPERATURE" },
  { name: "Digital Luxmeter", code: "DIGITAL_LUXMETER" },
  { name: "Digital Pressure Meter", code: "DIGITAL_PRESSURE_METER" },
  { name: "Digital Stopwatch", code: "DIGITAL_STOPWATCH" },
  { name: "Digital Tachometer", code: "DIGITAL_TACHOMETER" },
  { name: "Digital Thermohygrometer (refrence)", code: "DIGITAL_THERMOHYGROMETER_REFRENCE" },
  { name: "ECG Simulator", code: "ECG_SIMULATOR" },
  { name: "Fetal Heart Rate Simulator", code: "FETAL_HEART_RATE_SIMULATOR" },
  { name: "Gas Flow Analyzer", code: "GAS_FLOW_ANALYZER" },
  { name: "Incubator Analyzer", code: "INCUBATOR_ANALYZER" },
  { name: "Infusion Device Analyzer", code: "INFUSION_DEVICE_ANALYZER" },
  { name: "Kontrol Standard / CRM", code: "KONTROL_STANDARD_CRM" },
  { name: "Lux Meter", code: "LUX_METER" },
  { name: "Meteran", code: "METERAN" },
  { name: "Mistar Baja", code: "MISTAR_BAJA" },
  { name: "Multimeter", code: "MULTIMETER" },
  { name: "Objektif Mikrometer", code: "OBJEKTIF_MIKROMETER" },
  { name: "Okuler Mikrometer", code: "OKULER_MIKROMETER" },
  { name: "Oscilloscope", code: "OSCILLOSCOPE" },
  { name: "Particel Counter", code: "PARTICEL_COUNTER" },
  { name: "Phototherapy Radiometer", code: "PHOTOTHERAPY_RADIOMETER" },
  { name: "Reagensia (cairan deluent dan lyse)", code: "REAGENSIA_CAIRAN_DELUENT_DAN_LYSE" },
  { name: "Resistance Box", code: "RESISTANCE_BOX" },
  { name: "Sound Level Meter", code: "SOUND_LEVEL_METER" },
  { name: "Spectral Chromometer", code: "SPECTRAL_CHROMOMETER" },
  { name: "Syringe Calibrator 3L", code: "SYRINGE_CALIBRATOR_3L" },
  { name: "Tachometer for Dental", code: "TACHOMETER_FOR_DENTAL" },
  { name: "Thermometer 12 channel", code: "THERMOMETER_12_CHANNEL" },
  { name: "Thermometer 12 Channel (PT-100)", code: "THERMOMETER_12_CHANNEL_PT_100" },
  { name: "UV Light Meter", code: "UV_LIGHT_METER" },
  { name: "Waterpass", code: "WATERPASS" },
];

async function seed() {
  const created: string[] = [];
  const skippedExistingName: string[] = [];
  const codeConflict: string[] = [];

  for (const row of ROWS) {
    const byName = await prisma.equipmentType.findFirst({
      where: { name: { equals: row.name, mode: "insensitive" } },
      select: { id: true, code: true, name: true },
    });
    if (byName) {
      skippedExistingName.push(`${row.name}  (existing code=${byName.code})`);
      continue;
    }
    const byCode = await prisma.equipmentType.findUnique({ where: { code: row.code } });
    if (byCode) {
      codeConflict.push(`${row.name}  ->  code ${row.code} already used by "${byCode.name}"`);
      continue;
    }
    await prisma.equipmentType.create({ data: { code: row.code, name: row.name } });
    created.push(`${row.code}  —  ${row.name}`);
  }

  console.log(`[seed] Reference Equipment Catalog (EquipmentType)`);
  console.log(`[seed] proposed rows: ${ROWS.length}`);
  console.log(`[seed] created: ${created.length}`);
  created.forEach((c) => console.log(`         + ${c}`));
  if (skippedExistingName.length) {
    console.log(`[seed] skipped (name already exists): ${skippedExistingName.length}`);
    skippedExistingName.forEach((s) => console.log(`         · ${s}`));
  }
  if (codeConflict.length) {
    console.log(`[seed] CODE CONFLICTS (not created — review): ${codeConflict.length}`);
    codeConflict.forEach((s) => console.log(`         ! ${s}`));
  }

  const total = await prisma.equipmentType.count();
  console.log(`[seed] EquipmentType total now: ${total}`);
  await prisma.$disconnect();
}

seed().catch((error) => {
  console.error("[seed] Failed:", error);
  process.exit(1);
});
