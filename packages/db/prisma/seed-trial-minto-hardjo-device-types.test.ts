import { describe, expect, it } from "vitest";
import { prisma } from "../src/index";
import {
  SYNTHETIC_CATEGORIES,
  SYNTHETIC_DEVICE_TYPES,
  seedTrialMintoHardjoDeviceTypes,
} from "./seed-trial-minto-hardjo-device-types";

/**
 * The shared vitest test database (packages/db/vitest.globalSetup.ts) starts
 * empty — it does NOT run seed-device-capabilities.ts / seed-uoms.ts. This
 * synthetic seed script deliberately REUSES two existing, global capability
 * items (Environmental Conditions / Suhu Ruangan, Electrical Safety /
 * Resistansi Pembumian Protektif) rather than creating its own, so this test
 * creates just those minimal prerequisite master-data rows itself — the same
 * ad-hoc local-helper convention already used throughout
 * apps/api/src/**\/*.test.ts, not a new shared factory abstraction.
 */
async function ensurePrerequisiteMasterData() {
  const envCapability = await prisma.deviceCapability.upsert({
    where: { code: "ENVIRONMENTAL_CONDITIONS" },
    create: { code: "ENVIRONMENTAL_CONDITIONS", name: "Kondisi Lingkungan" },
    update: {},
  });
  await prisma.deviceCapabilityItem.upsert({
    where: { capabilityId_name: { capabilityId: envCapability.id, name: "Suhu Ruangan" } },
    create: { capabilityId: envCapability.id, name: "Suhu Ruangan" },
    update: {},
  });

  const elecCapability = await prisma.deviceCapability.upsert({
    where: { code: "ELECTRICAL_SAFETY" },
    create: { code: "ELECTRICAL_SAFETY", name: "Keselamatan Listrik" },
    update: {},
  });
  await prisma.deviceCapabilityItem.upsert({
    where: { capabilityId_name: { capabilityId: elecCapability.id, name: "Resistansi Pembumian Protektif" } },
    create: { capabilityId: elecCapability.id, name: "Resistansi Pembumian Protektif" },
    update: {},
  });

  await prisma.uom.upsert({
    where: { code: "DEG_C" },
    create: { code: "DEG_C", name: "Degree Celsius", symbol: "°C", category: "TEMPERATURE" },
    update: {},
  });
  await prisma.uom.upsert({
    where: { code: "OHM" },
    create: { code: "OHM", name: "Ohm", symbol: "Ω", category: "ELECTRICAL" },
    update: {},
  });

  // The 9 existing DeviceCategory codes this seed reuses (RESUSCITATION,
  // SUCTION_FLUID, RESPIRATORY_OXYGEN, PATIENT_CARE, LABORATORY_DIAGNOSTIC).
  for (const code of ["RESUSCITATION", "SUCTION_FLUID", "RESPIRATORY_OXYGEN", "PATIENT_CARE", "LABORATORY_DIAGNOSTIC"]) {
    await prisma.deviceCategory.upsert({
      where: { code },
      create: { code, name: code },
      update: {},
    });
  }
}

describe("seedTrialMintoHardjoDeviceTypes", () => {
  it("creates exactly 37 DeviceTypes, 4 new categories, 74 calibration parameters", async () => {
    await ensurePrerequisiteMasterData();

    const manifest = await seedTrialMintoHardjoDeviceTypes();

    expect(manifest.deviceTypes).toHaveLength(SYNTHETIC_DEVICE_TYPES.length);
    expect(manifest.deviceTypes).toHaveLength(37);
    expect(manifest.categories).toHaveLength(SYNTHETIC_CATEGORIES.length);
    expect(manifest.categories).toHaveLength(4);
    expect(manifest.parameters).toHaveLength(37 * 2);

    const deviceTypeCodes = manifest.deviceTypes.map((d) => d.code);
    for (const code of deviceTypeCodes) {
      expect(code).toMatch(/^TRIAL_MH_/);
    }

    // Nothing existing was mutated: the 5 reused categories still resolve by
    // their original codes and are still isActive.
    const reused = await prisma.deviceCategory.findMany({
      where: { code: { in: ["RESUSCITATION", "SUCTION_FLUID", "RESPIRATORY_OXYGEN", "PATIENT_CARE", "LABORATORY_DIAGNOSTIC"] } },
    });
    expect(reused).toHaveLength(5);
    expect(reused.every((c) => c.isActive)).toBe(true);
  });

  it("is idempotent: running twice does not duplicate rows and reactivates deactivated ones", async () => {
    await ensurePrerequisiteMasterData();

    const first = await seedTrialMintoHardjoDeviceTypes();
    expect(first.deviceTypes).toHaveLength(37);

    // Simulate a prior reset: deactivate everything this seed created.
    await prisma.deviceCalibrationParameter.updateMany({
      where: { id: { in: first.parameters.map((p) => p.id) } },
      data: { isActive: false },
    });
    await prisma.deviceType.updateMany({
      where: { id: { in: first.deviceTypes.map((d) => d.id) } },
      data: { isActive: false },
    });
    await prisma.deviceCategory.updateMany({
      where: { id: { in: first.categories.map((c) => c.id) } },
      data: { isActive: false },
    });

    const second = await seedTrialMintoHardjoDeviceTypes();

    expect(second.deviceTypes).toHaveLength(37);
    expect(second.categories).toHaveLength(4);
    expect(second.parameters).toHaveLength(74);
    // Same ids reused (reactivated), not recreated.
    expect(new Set(second.deviceTypes.map((d) => d.id))).toEqual(new Set(first.deviceTypes.map((d) => d.id)));
    expect(new Set(second.parameters.map((p) => p.id))).toEqual(new Set(first.parameters.map((p) => p.id)));

    const totalDeviceTypeRows = await prisma.deviceType.count({ where: { code: { startsWith: "TRIAL_MH_" } } });
    expect(totalDeviceTypeRows).toBe(37);

    const reactivated = await prisma.deviceType.findMany({ where: { id: { in: second.deviceTypes.map((d) => d.id) } } });
    expect(reactivated.every((d) => d.isActive)).toBe(true);
  });
});
