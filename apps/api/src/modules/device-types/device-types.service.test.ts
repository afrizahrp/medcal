import { randomUUID } from "node:crypto";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { deviceTypeCreateSchema, deviceTypeUpdateSchema } from "@medcal/shared";
import { DeviceTypesService } from "./device-types.service";

const service = new DeviceTypesService();
const createdTypeIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdCustomerIds: string[] = [];

function uniqueSlug() {
  return `T${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

async function createCategory() {
  const category = await prisma.deviceCategory.create({
    data: { code: `DVCAT-TEST-${uniqueSlug()}`, name: "Test Category" },
  });
  createdCategoryIds.push(category.id);
  return category;
}

afterAll(async () => {
  if (createdTypeIds.length > 0) {
    await prisma.device.deleteMany({ where: { deviceTypeId: { in: createdTypeIds } } });
    await prisma.deviceModel.deleteMany({ where: { deviceTypeId: { in: createdTypeIds } } });
    await prisma.deviceType.deleteMany({ where: { id: { in: createdTypeIds } } });
  }
  if (createdCustomerIds.length > 0) {
    await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  }
  if (createdCategoryIds.length > 0) {
    await prisma.deviceCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
  }
});

describe("deviceTypeCreateSchema / deviceTypeUpdateSchema", () => {
  it("does not accept a code on create", () => {
    const parsed = deviceTypeCreateSchema.parse({ categoryId: "c1", name: "X", code: "HACK" });
    expect("code" in parsed).toBe(false);
  });
  it("strips a code on update", () => {
    const parsed = deviceTypeUpdateSchema.parse({ name: "X", code: "HACK" });
    expect("code" in parsed).toBe(false);
  });
});

describe("DeviceTypesService.create", () => {
  it("creates a device type with a system-issued DVTP- code", async () => {
    const category = await createCategory();
    const deviceType = await service.create({
      categoryId: category.id,
      name: "Blood Pressure Monitor",
    });
    createdTypeIds.push(deviceType.id);

    expect(deviceType.code).toMatch(/^DVTP-\d{3,}$/);
    expect(deviceType.name).toBe("Blood Pressure Monitor");
    expect(deviceType.categoryId).toBe(category.id);
    expect(deviceType.category.code).toBe(category.code);
    expect(deviceType.isActive).toBe(true);
  });

  it("allocates strictly increasing codes", async () => {
    const category = await createCategory();
    const a = await service.create({ categoryId: category.id, name: "First" });
    const b = await service.create({ categoryId: category.id, name: "Second" });
    createdTypeIds.push(a.id, b.id);
    expect(Number(b.code.slice(5))).toBeGreaterThan(Number(a.code.slice(5)));
  });

  it("rejects an unknown categoryId", async () => {
    await expect(
      service.create({ categoryId: "missing-category-id", name: "Orphan" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("DeviceTypesService.findAll / findOne / update / remove", () => {
  it("lists, filters by category, reads, updates, and deletes a device type", async () => {
    const category = await createCategory();
    const other = await createCategory();
    const created = await service.create({ categoryId: category.id, name: "Ventilator" });
    createdTypeIds.push(created.id);

    const listed = await service.findAll({ search: created.code, page: 1, pageSize: 10 });
    expect(listed.data.some((row) => row.id === created.id)).toBe(true);

    const filtered = await service.findAll({ categoryId: category.id, page: 1, pageSize: 10 });
    expect(filtered.data.some((row) => row.id === created.id)).toBe(true);

    const excluded = await service.findAll({ categoryId: other.id, page: 1, pageSize: 10 });
    expect(excluded.data.some((row) => row.id === created.id)).toBe(false);

    const found = await service.findOne(created.id);
    expect(found.code).toBe(created.code);

    const updated = await service.update(created.id, {
      name: "Ventilator Updated",
      categoryId: other.id,
      isActive: false,
    });
    expect(updated.name).toBe("Ventilator Updated");
    expect(updated.categoryId).toBe(other.id);
    expect(updated.isActive).toBe(false);
    expect(updated.code).toBe(created.code);

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

  it("rejects delete when the device type still has device models", async () => {
    const category = await createCategory();
    const deviceType = await service.create({ categoryId: category.id, name: "With Models" });
    createdTypeIds.push(deviceType.id);

    const model = await prisma.deviceModel.create({
      data: { deviceTypeId: deviceType.id, manufacturer: "TestCo", model: uniqueSlug() },
    });

    await expect(service.remove(deviceType.id)).rejects.toBeInstanceOf(BadRequestException);

    await prisma.deviceModel.delete({ where: { id: model.id } });
  });

  it("rejects delete when the device type still has devices", async () => {
    const category = await createCategory();
    const deviceType = await service.create({ categoryId: category.id, name: "With Devices" });
    createdTypeIds.push(deviceType.id);

    const customer = await prisma.customer.create({
      data: {
        companyId: "PKM",
        number: `CUS/TEST/${randomUUID().slice(0, 8)}`,
        name: `DeviceType delete ${randomUUID().slice(0, 6)}`,
      },
    });
    createdCustomerIds.push(customer.id);
    const device = await prisma.device.create({
      data: {
        companyId: "PKM",
        code: `DVC-TEST-${randomUUID().slice(0, 8)}`,
        customerId: customer.id,
        deviceTypeId: deviceType.id,
      },
    });

    await expect(service.remove(deviceType.id)).rejects.toBeInstanceOf(BadRequestException);

    await prisma.device.delete({ where: { id: device.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  });
});
