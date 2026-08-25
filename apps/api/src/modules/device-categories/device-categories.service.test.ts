import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { DeviceCategoriesService } from "./device-categories.service";

const service = new DeviceCategoriesService();
const createdIds: string[] = [];

function uniqueCode() {
  return `T${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

afterAll(async () => {
  if (createdIds.length > 0) {
    await prisma.deviceType.deleteMany({ where: { categoryId: { in: createdIds } } });
    await prisma.deviceCategory.deleteMany({ where: { id: { in: createdIds } } });
  }
});

describe("DeviceCategoriesService.create", () => {
  it("creates a device category with required fields", async () => {
    const code = uniqueCode();
    const category = await service.create({
      code,
      name: "Test Patient Monitoring",
      description: "Vital-sign monitors",
    });
    createdIds.push(category.id);

    expect(category.code).toBe(code);
    expect(category.name).toBe("Test Patient Monitoring");
    expect(category.description).toBe("Vital-sign monitors");
    expect(category.isActive).toBe(true);
  });

  it("rejects duplicate code", async () => {
    const code = uniqueCode();
    const first = await service.create({ code, name: "First" });
    createdIds.push(first.id);

    await expect(service.create({ code, name: "Second" })).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("DeviceCategoriesService.findAll / findOne / update / remove", () => {
  it("lists, reads, updates, and deletes a device category", async () => {
    const code = uniqueCode();
    const created = await service.create({ code, name: "Respiratory" });
    createdIds.push(created.id);

    const listed = await service.findAll({ search: code, page: 1, pageSize: 10 });
    expect(listed.data.some((row) => row.id === created.id)).toBe(true);

    const found = await service.findOne(created.id);
    expect(found.code).toBe(code);

    const updated = await service.update(created.id, { name: "Respiratory & Oxygen", isActive: false });
    expect(updated.name).toBe("Respiratory & Oxygen");
    expect(updated.isActive).toBe(false);

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

  it("rejects updating code onto an existing one", async () => {
    const first = await service.create({ code: uniqueCode(), name: "First" });
    const second = await service.create({ code: uniqueCode(), name: "Second" });
    createdIds.push(first.id, second.id);

    await expect(service.update(second.id, { code: first.code })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("rejects delete when the category still has device types", async () => {
    const category = await service.create({ code: uniqueCode(), name: "With Types" });
    createdIds.push(category.id);
    const type = await prisma.deviceType.create({
      data: {
        categoryId: category.id,
        code: uniqueCode(),
        name: "Child Type",
      },
    });

    await expect(service.remove(category.id)).rejects.toBeInstanceOf(BadRequestException);

    await prisma.deviceType.delete({ where: { id: type.id } });
  });
});
