import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { DeviceTypeEquipmentRequirementsService } from "./device-type-equipment-requirements.service";

const service = new DeviceTypeEquipmentRequirementsService();

function uniqueCode() {
  return `ER${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

let categoryId: string;
let deviceTypeAId: string;
let deviceTypeBId: string;
let equipmentTypeAId: string;
let equipmentTypeBId: string;
const createdRequirementIds: string[] = [];

beforeAll(async () => {
  const category = await prisma.deviceCategory.create({
    data: { code: uniqueCode(), name: "Req Test Category" },
  });
  categoryId = category.id;
  const [dtA, dtB] = await Promise.all([
    prisma.deviceType.create({
      data: { categoryId, code: uniqueCode(), name: "Req Bed Side Monitor" },
    }),
    prisma.deviceType.create({
      data: { categoryId, code: uniqueCode(), name: "Req Dental Unit" },
    }),
  ]);
  deviceTypeAId = dtA.id;
  deviceTypeBId = dtB.id;
  const [etA, etB] = await Promise.all([
    prisma.equipmentType.create({
      data: { code: uniqueCode(), name: "Req Vital Signs Simulator" },
    }),
    prisma.equipmentType.create({
      data: { code: uniqueCode(), name: "Req Electrical Safety Analyzer" },
    }),
  ]);
  equipmentTypeAId = etA.id;
  equipmentTypeBId = etB.id;
});

afterAll(async () => {
  await prisma.deviceTypeEquipmentRequirement.deleteMany({
    where: { deviceTypeId: { in: [deviceTypeAId, deviceTypeBId] } },
  });
  await prisma.equipmentType.deleteMany({
    where: { id: { in: [equipmentTypeAId, equipmentTypeBId] } },
  });
  await prisma.deviceType.deleteMany({ where: { categoryId } });
  await prisma.deviceCategory.deleteMany({ where: { id: categoryId } });
});

describe("DeviceTypeEquipmentRequirementsService", () => {
  it("creates a requirement and rejects duplicates on (deviceTypeId, equipmentTypeId)", async () => {
    const created = await service.create({
      deviceTypeId: deviceTypeAId,
      equipmentTypeId: equipmentTypeAId,
      notes: "Required for vital signs",
    });
    createdRequirementIds.push(created.id);
    expect(created.deviceType.id).toBe(deviceTypeAId);
    expect(created.equipmentType.id).toBe(equipmentTypeAId);
    expect(created.notes).toBe("Required for vital signs");

    await expect(
      service.create({ deviceTypeId: deviceTypeAId, equipmentTypeId: equipmentTypeAId }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects unknown device type or equipment type", async () => {
    await expect(
      service.create({ deviceTypeId: "missing", equipmentTypeId: equipmentTypeAId }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create({ deviceTypeId: deviceTypeAId, equipmentTypeId: "missing" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("updates notes and removes a requirement", async () => {
    const created = await service.create({
      deviceTypeId: deviceTypeBId,
      equipmentTypeId: equipmentTypeBId,
    });
    const updated = await service.update(created.id, { notes: "Electrical safety tests" });
    expect(updated.notes).toBe("Electrical safety tests");

    const removed = await service.remove(created.id);
    expect(removed.id).toBe(created.id);
    await expect(service.findOne(created.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("groups requirements by device type and paginates at the group level", async () => {
    // deviceTypeA already has 1 requirement from the first test; add a second.
    const second = await service.create({
      deviceTypeId: deviceTypeAId,
      equipmentTypeId: equipmentTypeBId,
    });
    createdRequirementIds.push(second.id);

    const grouped = await service.findAllGroupedByDeviceType({ search: "Req Bed Side Monitor" });
    const group = grouped.data.find((g) => g.deviceType.id === deviceTypeAId);
    expect(group).toBeDefined();
    expect(group?.count).toBe(2);
    expect(group?.requirements).toHaveLength(2);
    expect(grouped.total).toBe(grouped.data.length);
    expect(grouped.totalRequirements).toBeGreaterThanOrEqual(2);
  });
});
