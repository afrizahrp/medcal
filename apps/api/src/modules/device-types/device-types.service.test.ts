import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { DeviceTypesService } from "./device-types.service";

const service = new DeviceTypesService();
const createdTypeIds: string[] = [];
const createdCategoryIds: string[] = [];

function uniqueCode() {
  return `T${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

async function createCategory() {
  const category = await prisma.deviceCategory.create({
    data: { code: uniqueCode(), name: "Test Category" },
  });
  createdCategoryIds.push(category.id);
  return category;
}

afterAll(async () => {
  if (createdTypeIds.length > 0) {
    await prisma.deviceModel.deleteMany({ where: { deviceTypeId: { in: createdTypeIds } } });
    await prisma.deviceType.deleteMany({ where: { id: { in: createdTypeIds } } });
  }
  if (createdCategoryIds.length > 0) {
    await prisma.deviceCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
  }
});

describe("DeviceTypesService.create", () => {
  it("creates a device type linked to a category", async () => {
    const category = await createCategory();
    const code = uniqueCode();
    const deviceType = await service.create({
      categoryId: category.id,
      code,
      name: "Blood Pressure Monitor",
    });
    createdTypeIds.push(deviceType.id);

    expect(deviceType.code).toBe(code);
    expect(deviceType.name).toBe("Blood Pressure Monitor");
    expect(deviceType.categoryId).toBe(category.id);
    expect(deviceType.category.code).toBe(category.code);
    expect(deviceType.isActive).toBe(true);
  });

  it("rejects duplicate code", async () => {
    const category = await createCategory();
    const code = uniqueCode();
    const first = await service.create({
      categoryId: category.id,
      code,
      name: "First",
    });
    createdTypeIds.push(first.id);

    await expect(
      service.create({ categoryId: category.id, code, name: "Second" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects an unknown categoryId", async () => {
    await expect(
      service.create({
        categoryId: "missing-category-id",
        code: uniqueCode(),
        name: "Orphan",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("DeviceTypesService.findAll / findOne / update / remove", () => {
  it("lists, filters by category, reads, updates, and deletes a device type", async () => {
    const category = await createCategory();
    const other = await createCategory();
    const code = uniqueCode();
    const created = await service.create({
      categoryId: category.id,
      code,
      name: "Ventilator",
    });
    createdTypeIds.push(created.id);

    const listed = await service.findAll({ search: code, page: 1, pageSize: 10 });
    expect(listed.data.some((row) => row.id === created.id)).toBe(true);

    const filtered = await service.findAll({ categoryId: category.id, page: 1, pageSize: 10 });
    expect(filtered.data.some((row) => row.id === created.id)).toBe(true);

    const excluded = await service.findAll({ categoryId: other.id, page: 1, pageSize: 10 });
    expect(excluded.data.some((row) => row.id === created.id)).toBe(false);

    const found = await service.findOne(created.id);
    expect(found.code).toBe(code);

    const updated = await service.update(created.id, {
      name: "Ventilator Updated",
      categoryId: other.id,
      isActive: false,
    });
    expect(updated.name).toBe("Ventilator Updated");
    expect(updated.categoryId).toBe(other.id);
    expect(updated.isActive).toBe(false);

    const removed = await service.remove(created.id);
    expect(removed.id).toBe(created.id);
    createdTypeIds.splice(createdTypeIds.indexOf(created.id), 1);

    await expect(service.findOne(created.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects update of unknown id", async () => {
    await expect(service.findOne("missing-device-type-id")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update("missing-device-type-id", { name: "Nope" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects updating code onto an existing one", async () => {
    const category = await createCategory();
    const first = await service.create({
      categoryId: category.id,
      code: uniqueCode(),
      name: "First",
    });
    const second = await service.create({
      categoryId: category.id,
      code: uniqueCode(),
      name: "Second",
    });
    createdTypeIds.push(first.id, second.id);

    await expect(service.update(second.id, { code: first.code })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("rejects delete when the device type still has device models", async () => {
    const category = await createCategory();
    const deviceType = await service.create({
      categoryId: category.id,
      code: uniqueCode(),
      name: "With Models",
    });
    createdTypeIds.push(deviceType.id);

    const model = await prisma.deviceModel.create({
      data: {
        deviceTypeId: deviceType.id,
        manufacturer: "TestCo",
        model: uniqueCode(),
      },
    });

    await expect(service.remove(deviceType.id)).rejects.toBeInstanceOf(BadRequestException);

    await prisma.deviceModel.delete({ where: { id: model.id } });
  });
});
