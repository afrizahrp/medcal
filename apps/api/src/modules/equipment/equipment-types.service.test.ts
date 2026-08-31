import { randomUUID } from "node:crypto";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { equipmentTypeCreateSchema, equipmentTypeUpdateSchema } from "@medcal/shared";
import { EquipmentTypesService } from "./equipment-types.service";

const service = new EquipmentTypesService();
const createdEquipmentTypeIds: string[] = [];
const createdDeviceCategoryIds: string[] = [];

function uniqueSlug() {
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
    await prisma.deviceType.deleteMany({ where: { categoryId: { in: createdDeviceCategoryIds } } });
    await prisma.deviceCategory.deleteMany({ where: { id: { in: createdDeviceCategoryIds } } });
  }
});

describe("equipmentTypeCreateSchema / equipmentTypeUpdateSchema", () => {
  it("does not accept a code on create", () => {
    const parsed = equipmentTypeCreateSchema.parse({ name: "X", code: "HACK" });
    expect("code" in parsed).toBe(false);
  });
  it("strips a code on update", () => {
    const parsed = equipmentTypeUpdateSchema.parse({ name: "X", code: "HACK" });
    expect("code" in parsed).toBe(false);
  });
});

describe("EquipmentTypesService.create", () => {
  it("creates an equipment type with a system-issued EQTP- code", async () => {
    const created = await service.create({
      name: "Electrical Safety Analyzer",
      description: "Electrical safety tests",
      category: "Analyzer",
    });
    createdEquipmentTypeIds.push(created.id);

    expect(created.code).toMatch(/^EQTP-\d{3,}$/);
    expect(created.name).toBe("Electrical Safety Analyzer");
    expect(created.category).toBe("Analyzer");
    expect(created.isActive).toBe(true);
  });

  it("allocates strictly increasing codes", async () => {
    const a = await service.create({ name: "First" });
    const b = await service.create({ name: "Second" });
    createdEquipmentTypeIds.push(a.id, b.id);
    expect(Number(b.code.slice(5))).toBeGreaterThan(Number(a.code.slice(5)));
  });
});

describe("EquipmentTypesService.findAll / findOne / update / remove", () => {
  it("lists, reads, updates, and deletes an equipment type", async () => {
    const created = await service.create({ name: `Thermohygrometer ${uniqueSlug()}` });
    createdEquipmentTypeIds.push(created.id);

    const listed = await service.findAll({ search: created.code, page: 1, pageSize: 10 });
    expect(listed.data.some((row) => row.id === created.id)).toBe(true);

    const found = await service.findOne(created.id);
    expect(found.code).toBe(created.code);

    const updated = await service.update(created.id, {
      name: "Thermo-Hygrometer",
      category: "Environment",
      isActive: false,
    });
    expect(updated.name).toBe("Thermo-Hygrometer");
    expect(updated.category).toBe("Environment");
    expect(updated.isActive).toBe(false);
    expect(updated.code).toBe(created.code);

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
    const equipmentType = await service.create({ name: `Still Required ${uniqueSlug()}` });
    createdEquipmentTypeIds.push(equipmentType.id);

    const category = await prisma.deviceCategory.create({
      data: { code: `DVCAT-TEST-${uniqueSlug()}`, name: "Eq Test Category" },
    });
    createdDeviceCategoryIds.push(category.id);
    const deviceType = await prisma.deviceType.create({
      data: { categoryId: category.id, code: `DVTP-TEST-${uniqueSlug()}`, name: "Eq Test Device Type" },
    });
    const requirement = await prisma.deviceTypeEquipmentRequirement.create({
      data: { deviceTypeId: deviceType.id, equipmentTypeId: equipmentType.id },
    });

    await expect(service.remove(equipmentType.id)).rejects.toBeInstanceOf(BadRequestException);

    await prisma.deviceTypeEquipmentRequirement.delete({ where: { id: requirement.id } });
  });
});
