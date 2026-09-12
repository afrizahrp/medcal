/**
 * Seeds DeviceType ↔ EquipmentType pairings (DeviceTypeEquipmentRequirement)
 * from Section A "A. Daftar Alat yang Digunakan" of the PKM technician
 * calibration worksheets in docs/technician-docs/*.docx.
 *
 * SOURCE OF TRUTH = Section A only. No pairing is inferred from calibration
 * knowledge, tolerance tables, or any other worksheet section. Each list below
 * is the verbatim Section-A equipment list of one worksheet, in source order,
 * with intra-list duplicates removed. Equipment wording is preserved exactly
 * (incl. source typos "Particel Counter", "Spectral Chromometer",
 * "Digital Thermohygrometer (refrence)").
 *
 * The DeviceTypeEquipmentRequirement model has NO ordering column and a
 * @@unique([deviceTypeId, equipmentTypeId]) constraint — the seed uses
 * createMany({ skipDuplicates: true }) so it is idempotent, adds only missing
 * pairings, and never deletes or modifies existing ones. `notes` is left null.
 *
 * Worksheet titles are matched to the canonical DeviceType master by name
 * (case-insensitive), with a small set of confident title-variant aliases
 * (e.g. "Sphygmomanometer" → "Sphygmomanometers"). Worksheets with no
 * confident DeviceType match, or an ambiguous one, are NOT seeded — see the
 * report: docs/module-specs/device-management/equipment/implementation_report_devicetype_equipment_pairing_seed.md
 *
 * Run manually: pnpm --filter @medcal/db run seed:device-type-equipment-requirements
 */
import { prisma } from "../src/index";

interface PairingSeedRow {
  /** Canonical DeviceType.name (see WORKSHEET_TO_DEVICETYPE for title→canonical). */
  deviceType: string;
  /** Section-A "Nama Alat" values, source order, dedup'd. Must resolve to EquipmentType.name. */
  equipmentTypes: string[];
}

// Confident worksheet-title → canonical DeviceType.name aliases (case-insensitive keys).
// Only unambiguous variants (plural / spelling / language). Ambiguous titles are
// deliberately absent so they are skipped, not guessed.
const WORKSHEET_TITLE_ALIASES: Record<string, string> = {
  "blood bank refrigerator": "Blood Bank Refrigerators",
  electrocardiograph: "Electrocardiographs",
  "nebulizer ultrasonic": "Ultrasonic Nebulizers",
  "oksigen concentrator": "Oxygen Concentrators",
  "pulse oxymeter": "Pulse Oximeters",
  "resusitator paru dan neopuff": "Resuscitators (Pulmonary)",
  sphygmomanometer: "Sphygmomanometers",
  sterilisator: "Sterillizer (Sterillisator)",
};

// NOT seeded (reported only):
//  - Ambiguous DeviceType (2+ plausible canonical targets):
//      "Cold Chain, Vaccine Refrigerator"  (Coald Chain | Kulkas Vaksin)
//      "Kelistrikan"                        (Electric Beds (kelistrikan))
//  - No canonical DeviceType exists:
//      Auto Chemistry Analyzer, Hematologi Analyzer, Otoscope,
//      Phaco Emulsifikasi, Thermohygrometer (worksheet), pH Meter

const PAIRINGS: PairingSeedRow[] = [
  { deviceType: "Audiometer", equipmentTypes: ["Sound Level Meter", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Autoclave", equipmentTypes: ["Data Logger Hi Temperature", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Baby Incubator", equipmentTypes: ["Incubator Analyzer", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Bed Side Monitor", equipmentTypes: ["Vital Signs Simulator", "Electrical Safety Analyzer", "Thermohygrometer"] },
  {
    deviceType: "Bio Safety Cabinet",
    equipmentTypes: ["Particel Counter", "Lux Meter", "Sound Level Meter", "Anemometer", "UV Light Meter", "Electrical Safety Analyzer", "Thermohygrometer"],
  },
  { deviceType: "Blanket Warmer", equipmentTypes: ["Thermometer 12 channel", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Blood Bank Refrigerators", equipmentTypes: ["Thermometer 12 channel", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Blood Pressure Monitor", equipmentTypes: ["Vital Signs Simulator", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Centrifuge", equipmentTypes: ["Digital Tachometer", "Digital Stopwatch", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Centrifuge Refrigerator", equipmentTypes: ["Digital Tachometer", "Digital Stopwatch", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "CPAP", equipmentTypes: ["Gas Flow Analyzer", "Electrical Safety Analyzer", "Thermohygrometer"] },
  {
    deviceType: "Dental Unit",
    equipmentTypes: ["Tachometer for Dental", "Digital Luxmeter", "Digital Pressure Meter", "Electrical Safety Analyzer", "Thermohygrometer"],
  },
  {
    deviceType: "Dental X-Ray",
    equipmentTypes: ["Multimeter", "Electrical Safety Analyzer", "Thermohygrometer", "Waterpass", "Meteran"],
  },
  {
    deviceType: "Electro Accupunture (EST)",
    equipmentTypes: ["Resistance Box", "Oscilloscope", "Digital Stopwatch", "Electrical Safety Analyzer", "Thermohygrometer"],
  },
  { deviceType: "Electrocardiographs", equipmentTypes: ["ECG Simulator", "Mistar Baja", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Examination Lamp", equipmentTypes: ["Spectral Chromometer", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Fetal Doppler", equipmentTypes: ["Fetal Heart Rate Simulator", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Flow meter", equipmentTypes: ["Gas Flow Analyzer", "Thermohygrometer"] },
  { deviceType: "Head Lamp Medik", equipmentTypes: ["Spectral Chromometer", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Humidifier", equipmentTypes: ["Thermometer 12 Channel (PT-100)", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Infant Warmer", equipmentTypes: ["Incubator Analyzer", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Infusion Pump", equipmentTypes: ["Infusion Device Analyzer", "Electrical Safety Analyzer", "Thermohygrometer"] },
  {
    deviceType: "Laminar Air Flow",
    equipmentTypes: ["Particel Counter", "Lux Meter", "Sound Level Meter", "Anemometer", "UV Light Meter", "Electrical Safety Analyzer", "Thermohygrometer"],
  },
  { deviceType: "Lampu Operasi", equipmentTypes: ["Spectral Chromometer", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Laryngoskop", equipmentTypes: ["Spectral Chromometer", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Medical Freezer", equipmentTypes: ["Thermometer 12 channel", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Medical Refrigerator", equipmentTypes: ["Thermometer 12 channel", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Mikroskop Laboratorium", equipmentTypes: ["Objektif Mikrometer", "Okuler Mikrometer", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Nebulizer Compressor", equipmentTypes: ["Gas Flow Analyzer", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Oven", equipmentTypes: ["Thermometer 12 channel", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Oxygen Concentrators", equipmentTypes: ["Gas Flow Analyzer", "Thermohygrometer"] },
  { deviceType: "Phototherapy", equipmentTypes: ["Phototherapy Radiometer", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Platelet Agitator Incubator", equipmentTypes: ["Thermometer 12 channel", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Pulse Oximeters", equipmentTypes: ["Vital Signs Simulator", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Resuscitators (Pulmonary)", equipmentTypes: ["Digital Pressure Meter", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Rotator", equipmentTypes: ["Digital Tachometer", "Digital Stopwatch", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Sphygmomanometers", equipmentTypes: ["Digital Pressure Meter", "Digital Stopwatch", "Thermohygrometer"] },
  { deviceType: "Spirometer", equipmentTypes: ["Syringe Calibrator 3L", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Sterillizer (Sterillisator)", equipmentTypes: ["Thermometer 12 channel", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Suction Pump", equipmentTypes: ["Digital Pressure Meter", "Digital Stopwatch", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Syringe Pump", equipmentTypes: ["Infusion Device Analyzer", "Electrical Safety Analyzer", "Thermohygrometer"] },
  { deviceType: "Ultrasonic Nebulizers", equipmentTypes: ["Gas Flow Analyzer", "Electrical Safety Analyzer", "Thermohygrometer"] },
];

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

async function seed() {
  const deviceTypes = await prisma.deviceType.findMany({ select: { id: true, name: true } });
  const equipmentTypes = await prisma.equipmentType.findMany({ select: { id: true, name: true } });
  const dtByName = new Map(deviceTypes.map((d) => [norm(d.name), d]));
  const etByName = new Map(equipmentTypes.map((e) => [norm(e.name), e]));

  const data: { deviceTypeId: string; equipmentTypeId: string }[] = [];
  const missingDeviceType: string[] = [];
  const missingEquipmentType: string[] = [];

  for (const row of PAIRINGS) {
    const canonical =
      dtByName.get(norm(row.deviceType)) ??
      (WORKSHEET_TITLE_ALIASES[norm(row.deviceType)]
        ? dtByName.get(norm(WORKSHEET_TITLE_ALIASES[norm(row.deviceType)]))
        : undefined);
    if (!canonical) {
      missingDeviceType.push(row.deviceType);
      continue;
    }
    for (const etName of row.equipmentTypes) {
      const et = etByName.get(norm(etName));
      if (!et) {
        missingEquipmentType.push(`${row.deviceType} :: "${etName}"`);
        continue;
      }
      data.push({ deviceTypeId: canonical.id, equipmentTypeId: et.id });
    }
  }

  // Idempotent: unique([deviceTypeId, equipmentTypeId]) + skipDuplicates.
  const before = await prisma.deviceTypeEquipmentRequirement.count();
  const result = await prisma.deviceTypeEquipmentRequirement.createMany({
    data,
    skipDuplicates: true,
  });
  const after = await prisma.deviceTypeEquipmentRequirement.count();

  console.log(`[seed] DeviceType ↔ EquipmentType pairings (Section A)`);
  console.log(`[seed] pairing rows resolved from worksheets: ${data.length}`);
  console.log(`[seed] existing before: ${before}`);
  console.log(`[seed] createMany inserted (skipDuplicates): ${result.count}`);
  console.log(`[seed] total after: ${after}`);
  if (missingDeviceType.length) {
    console.log(`[seed] DeviceType not found (skipped): ${missingDeviceType.length}`);
    [...new Set(missingDeviceType)].forEach((s) => console.log(`         · ${s}`));
  }
  if (missingEquipmentType.length) {
    console.log(`[seed] EquipmentType not found (skipped): ${missingEquipmentType.length}`);
    missingEquipmentType.forEach((s) => console.log(`         · ${s}`));
  }

  await prisma.$disconnect();
}

seed().catch((error) => {
  console.error("[seed] Failed:", error);
  process.exit(1);
});
