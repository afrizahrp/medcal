/**
 * Seeds the UOM table with a starting set of calibration-relevant units.
 * This is not a final domain taxonomy — extend via admin CRUD as needed.
 * Run manually: pnpm --filter @medcal/db run seed:uoms
 */
import { prisma } from "../src/index";
import type { UomCategory } from "../src/index";

interface UomSeedRow {
  code: string;
  name: string;
  symbol: string;
  category: UomCategory;
}

const ROWS: UomSeedRow[] = [
  // Pressure
  { code: "MMHG", name: "Millimeter of Mercury", symbol: "mmHg", category: "PRESSURE" },
  { code: "KPA", name: "Kilopascal", symbol: "kPa", category: "PRESSURE" },
  { code: "MBAR", name: "Millibar", symbol: "mbar", category: "PRESSURE" },
  { code: "PSI", name: "Pound per Square Inch", symbol: "psi", category: "PRESSURE" },
  { code: "CMH2O", name: "Centimeter of Water", symbol: "cmH₂O", category: "PRESSURE" },

  // Temperature
  { code: "DEG_C", name: "Degree Celsius", symbol: "°C", category: "TEMPERATURE" },
  { code: "DEG_F", name: "Degree Fahrenheit", symbol: "°F", category: "TEMPERATURE" },
  { code: "KELVIN", name: "Kelvin", symbol: "K", category: "TEMPERATURE" },

  // Rate
  { code: "BPM", name: "Beats per Minute", symbol: "bpm", category: "RATE" },
  { code: "RPM", name: "Respirations per Minute", symbol: "rpm", category: "RATE" },
  { code: "HZ", name: "Hertz", symbol: "Hz", category: "RATE" },

  // Flow
  { code: "L_MIN", name: "Liter per Minute", symbol: "L/min", category: "FLOW" },
  { code: "ML_MIN", name: "Milliliter per Minute", symbol: "mL/min", category: "FLOW" },
  { code: "ML_H", name: "Milliliter per Hour", symbol: "mL/h", category: "FLOW" },

  // Percentage
  { code: "PERCENT", name: "Percent", symbol: "%", category: "PERCENTAGE" },
  { code: "SPO2", name: "Oxygen Saturation", symbol: "SpO₂%", category: "PERCENTAGE" },

  // Volume
  { code: "ML", name: "Milliliter", symbol: "mL", category: "VOLUME" },
  { code: "L", name: "Liter", symbol: "L", category: "VOLUME" },
  { code: "CC", name: "Cubic Centimeter", symbol: "cc", category: "VOLUME" },

  // Electrical
  { code: "V", name: "Volt", symbol: "V", category: "ELECTRICAL" },
  { code: "MV", name: "Millivolt", symbol: "mV", category: "ELECTRICAL" },
  { code: "MA", name: "Milliampere", symbol: "mA", category: "ELECTRICAL" },
  { code: "UA", name: "Microampere", symbol: "µA", category: "ELECTRICAL" },
  { code: "OHM", name: "Ohm", symbol: "Ω", category: "ELECTRICAL" },
  { code: "MOHM", name: "Megaohm", symbol: "MΩ", category: "ELECTRICAL" },

  // Time
  { code: "SEC", name: "Second", symbol: "s", category: "TIME" },
  { code: "MS", name: "Millisecond", symbol: "ms", category: "TIME" },
  { code: "MIN", name: "Minute", symbol: "min", category: "TIME" },

  // Mass
  { code: "G", name: "Gram", symbol: "g", category: "MASS" },
  { code: "KG", name: "Kilogram", symbol: "kg", category: "MASS" },

  // Length
  { code: "MM", name: "Millimeter", symbol: "mm", category: "LENGTH" },
  { code: "CM", name: "Centimeter", symbol: "cm", category: "LENGTH" },
  { code: "M", name: "Meter", symbol: "m", category: "LENGTH" },

  // Velocity / sound — no dedicated UomCategory; required by calibration-parameter seed
  { code: "M_S", name: "Meter per Second", symbol: "m/s", category: "OTHER" },
  { code: "DB", name: "Decibel", symbol: "dB", category: "OTHER" },
];

async function seedUoms() {
  for (const row of ROWS) {
    await prisma.uom.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        name: row.name,
        symbol: row.symbol,
        category: row.category,
        isActive: true,
      },
      update: {
        name: row.name,
        symbol: row.symbol,
        category: row.category,
      },
    });
  }

  console.log(`[seed] ${ROWS.length} UOM rows upserted.`);
  await prisma.$disconnect();
}

seedUoms().catch((error) => {
  console.error("[seed] Failed:", error);
  process.exit(1);
});
