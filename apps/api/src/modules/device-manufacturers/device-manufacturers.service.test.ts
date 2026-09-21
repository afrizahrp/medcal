import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { DeviceManufacturersService } from "./device-manufacturers.service";

const service = new DeviceManufacturersService();
const createdManufacturerIds: string[] = [];
const createdModelIds: string[] = [];

function uniqueName(prefix = "Brand") {
  return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

afterAll(async () => {
  if (createdModelIds.length > 0) {
    await prisma.deviceModel.deleteMany({ where: { id: { in: createdModelIds } } });
  }
  if (createdManufacturerIds.length > 0) {
    await prisma.deviceManufacturer.deleteMany({ where: { id: { in: createdManufacturerIds } } });
  }
});

describe("DeviceManufacturersService.create", () => {
  it("creates a device manufacturer with a system-issued MFR- code", async () => {
    const name = uniqueName();
    const manufacturer = await service.create({ name });
    createdManufacturerIds.push(manufacturer.id);

    expect(manufacturer.code).toMatch(/^MFR-\d{6,}$/);
    expect(manufacturer.name).toBe(name);
    expect(manufacturer.isActive).toBe(true);
  });

  it("allocates strictly increasing codes", async () => {
    const a = await service.create({ name: uniqueName() });
    const b = await service.create({ name: uniqueName() });
    createdManufacturerIds.push(a.id, b.id);
    expect(Number(b.code.slice(4))).toBeGreaterThan(Number(a.code.slice(4)));
  });

  it("rejects a duplicate name case-insensitively", async () => {
    const name = uniqueName();
    const first = await service.create({ name });
    createdManufacturerIds.push(first.id);

    await expect(service.create({ name: name.toLowerCase() })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe("DeviceManufacturersService.findAll / findOne / update / remove", () => {
  it("lists, searches, reads, updates, and deletes a device manufacturer", async () => {
    const created = await service.create({ name: uniqueName(), description: "Test brand" });
    createdManufacturerIds.push(created.id);

    const listed = await service.findAll({ search: created.code, page: 1, pageSize: 10 });
    expect(listed.data.some((row) => row.id === created.id)).toBe(true);

    const found = await service.findOne(created.id);
    expect(found.code).toBe(created.code);

    const updated = await service.update(created.id, {
      name: uniqueName("Updated"),
      isActive: false,
    });
    expect(updated.isActive).toBe(false);
    expect(updated.code).toBe(created.code);

    const removed = await service.remove(created.id);
    expect(removed.id).toBe(created.id);
    createdManufacturerIds.splice(createdManufacturerIds.indexOf(created.id), 1);

    await expect(service.findOne(created.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects update/find of unknown id", async () => {
    await expect(service.findOne("missing-manufacturer-id")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.update("missing-manufacturer-id", { name: "Nope" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects delete when the manufacturer still has device models", async () => {
    const manufacturer = await service.create({ name: uniqueName() });
    createdManufacturerIds.push(manufacturer.id);

    const model = await prisma.deviceModel.create({
      data: {
        code: `MOD-TEST-${uniqueName()}`,
        manufacturerId: manufacturer.id,
        model: uniqueName("Model"),
      },
    });
    createdModelIds.push(model.id);

    await expect(service.remove(manufacturer.id)).rejects.toBeInstanceOf(BadRequestException);
  });
});
