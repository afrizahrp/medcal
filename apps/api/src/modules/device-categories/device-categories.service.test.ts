import { randomUUID } from "node:crypto";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { deviceCategoryCreateSchema, deviceCategoryUpdateSchema } from "@medcal/shared";
import { DeviceCategoriesService } from "./device-categories.service";

const service = new DeviceCategoriesService();
const createdIds: string[] = [];

function uniqueSlug() {
  return `T${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

afterAll(async () => {
  if (createdIds.length > 0) {
    await prisma.deviceType.deleteMany({ where: { categoryId: { in: createdIds } } });
    await prisma.deviceCategory.deleteMany({ where: { id: { in: createdIds } } });
  }
});

describe("deviceCategoryCreateSchema / deviceCategoryUpdateSchema", () => {
  it("does not accept a code on create — it is system-issued", () => {
    const parsed = deviceCategoryCreateSchema.parse({ name: "X", code: "HACK-001" });
    expect("code" in parsed).toBe(false);
  });
  it("strips a code on update — code is immutable", () => {
    const parsed = deviceCategoryUpdateSchema.parse({ name: "X", code: "HACK-001" });
    expect("code" in parsed).toBe(false);
  });
});

describe("DeviceCategoriesService.create", () => {
  it("creates a device category with a system-issued DVCAT- code", async () => {
    const category = await service.create({
      name: "Test Patient Monitoring",
      description: "Vital-sign monitors",
    });
    createdIds.push(category.id);

    expect(category.code).toMatch(/^DVCAT-\d{3,}$/);
    expect(category.name).toBe("Test Patient Monitoring");
    expect(category.description).toBe("Vital-sign monitors");
    expect(category.isActive).toBe(true);
  });

  it("allocates strictly increasing codes", async () => {
    const a = await service.create({ name: "First" });
    const b = await service.create({ name: "Second" });
    createdIds.push(a.id, b.id);
    expect(Number(b.code.slice(6))).toBeGreaterThan(Number(a.code.slice(6)));
  });
});

describe("DeviceCategoriesService.findAll / findOne / update / remove", () => {
  it("lists, reads, updates, and deletes a device category", async () => {
    const created = await service.create({ name: `Respiratory ${uniqueSlug()}` });
    createdIds.push(created.id);

    const listed = await service.findAll({ search: created.code, page: 1, pageSize: 10 });
    expect(listed.data.some((row) => row.id === created.id)).toBe(true);

    const found = await service.findOne(created.id);
    expect(found.code).toBe(created.code);

    const updated = await service.update(created.id, { name: "Respiratory & Oxygen", isActive: false });
    expect(updated.name).toBe("Respiratory & Oxygen");
    expect(updated.isActive).toBe(false);
    expect(updated.code).toBe(created.code);

    const removed = await service.remove(created.id);
    expect(removed.id).toBe(created.id);
    createdIds.splice(createdIds.indexOf(created.id), 1);

    await expect(service.findOne(created.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects update of unknown id", async () => {
    await expect(service.findOne("missing-device-category-id")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.update("missing-device-category-id", { name: "Nope" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects delete when the category still has device types", async () => {
    const category = await service.create({ name: "With Types" });
    createdIds.push(category.id);
    const type = await prisma.deviceType.create({
      data: {
        categoryId: category.id,
        code: `DVTP-TEST-${uniqueSlug()}`,
        name: "Child Type",
      },
    });

    await expect(service.remove(category.id)).rejects.toBeInstanceOf(BadRequestException);

    await prisma.deviceType.delete({ where: { id: type.id } });
  });
});
