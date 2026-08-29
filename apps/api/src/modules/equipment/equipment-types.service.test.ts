import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { EquipmentTypesService } from "./equipment-types.service";

const service = new EquipmentTypesService();
const createdEquipmentTypeIds: string[] = [];
const createdDeviceCategoryIds: string[] = [];

function uniqueCode() {
  return `EQT${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

afterAll(async () => {
  if (createdEquipmentTypeIds.length > 0) {
    await prisma.deviceTypeEquipmentRequirement.deleteMany({
      where: { equipmentTypeId: { in: createdEquipmentTypeIds } },
    });
    await prisma.equipmentType.deleteMany({ where: { id: { in: createdEquipmentTypeIds } } });
  }
  if (createdDeviceCategoryIds.length > 0) {
    await prisma.deviceType.deleteMany({
      where: { categoryId: { in: createdDeviceCategoryIds } },
    });
    await prisma.deviceCategory.deleteMany({ where: { id: { in: createdDeviceCategoryIds } } });
  }
});

describe("EquipmentTypesService.create", () => {
  it("creates an equipment type with optional category", async () => {
    const code = uniqueCode();
    const created = await service.create({
      code,
      name: "Electrical Safety Analyzer",
      description: "Electrical safety tests",
      category: "Analyzer",
    });
    createdEquipmentTypeIds.push(created.id);

    expect(created.code).toBe(code);
    expect(created.name).toBe("Electrical Safety Analyzer");
    expect(created.category).toBe("Analyzer");
    expect(created.isActive).toBe(true);
  });

  it("rejects duplicate code", async () => {
    const code = uniqueCode();
    const first = await service.create({ code, name: "First" });
    createdEquipmentTypeIds.push(first.id);

    await expect(service.create({ code, name: "Second" })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe("EquipmentTypesService.findAll / findOne / update / remove", () => {
  it("lists, reads, updates, and deletes an equipment type", async () => {
    const code = uniqueCode();
    const created = await service.create({ code, name: "Thermohygrometer" });
    createdEquipmentTypeIds.push(created.id);

    const listed = await service.findAll({ search: code, page: 1, pageSize: 10 });
    expect(listed.data.some((row) => row.id === created.id)).toBe(true);

    const found = await service.findOne(created.id);
    expect(found.code).toBe(code);

    const updated = await service.update(created.id, {
      name: "Thermo-Hygrometer",
      category: "Environment",
      isActive: false,
    });
    expect(updated.name).toBe("Thermo-Hygrometer");
    expect(updated.category).toBe("Environment");
    expect(updated.isActive).toBe(false);

    const removed = await service.remove(created.id);
    expect(removed.id).toBe(created.id);
    createdEquipmentTypeIds.splice(createdEquipmentTypeIds.indexOf(created.id), 1);

    await expect(service.findOne(created.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects update / read of unknown id", async () => {
    await expect(service.findOne("missing-equipment-type-id")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.update("missing-equipment-type-id", { name: "Nope" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects delete when the equipment type is still required by a device type", async () => {
    const equipmentType = await service.create({ code: uniqueCode(), name: "Still Required" });
    createdEquipmentTypeIds.push(equipmentType.id);

    const category = await prisma.deviceCategory.create({
      data: { code: uniqueCode(), name: "Eq Test Category" },
    });
    createdDeviceCategoryIds.push(category.id);
    const deviceType = await prisma.deviceType.create({
      data: { categoryId: category.id, code: uniqueCode(), name: "Eq Test Device Type" },
    });
    const requirement = await prisma.deviceTypeEquipmentRequirement.create({
      data: { deviceTypeId: deviceType.id, equipmentTypeId: equipmentType.id },
    });

    await expect(service.remove(equipmentType.id)).rejects.toBeInstanceOf(BadRequestException);

    await prisma.deviceTypeEquipmentRequirement.delete({ where: { id: requirement.id } });
  });
});
