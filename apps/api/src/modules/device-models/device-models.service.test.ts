import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { DeviceModelsService } from "./device-models.service";

const service = new DeviceModelsService();
const createdModelIds: string[] = [];
const createdManufacturerIds: string[] = [];

function uniqueCode() {
  return `M${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

async function createManufacturer(name = "Omron") {
  const manufacturer = await prisma.deviceManufacturer.create({
    data: { code: `MFR-TEST-${uniqueCode()}`, name: `${name} ${uniqueCode()}` },
  });
  createdManufacturerIds.push(manufacturer.id);
  return manufacturer;
}

afterAll(async () => {
  if (createdModelIds.length > 0) {
    await prisma.deviceModel.deleteMany({ where: { id: { in: createdModelIds } } });
  }
  if (createdManufacturerIds.length > 0) {
    await prisma.deviceManufacturer.deleteMany({ where: { id: { in: createdManufacturerIds } } });
  }
});

describe("DeviceModelsService.create", () => {
  it("creates a device model linked to a manufacturer with a system-issued MOD- code", async () => {
    const manufacturer = await createManufacturer();
    const modelName = uniqueCode();
    const deviceModel = await service.create({
      manufacturerId: manufacturer.id,
      model: modelName,
    });
    createdModelIds.push(deviceModel.id);

    expect(deviceModel.code).toMatch(/^MOD-\d{6,}$/);
    expect(deviceModel.model).toBe(modelName);
    expect(deviceModel.manufacturerId).toBe(manufacturer.id);
    expect(deviceModel.manufacturer.id).toBe(manufacturer.id);
  });

  it("allocates strictly increasing codes", async () => {
    const manufacturer = await createManufacturer();
    const a = await service.create({ manufacturerId: manufacturer.id, model: uniqueCode() });
    const b = await service.create({ manufacturerId: manufacturer.id, model: uniqueCode() });
    createdModelIds.push(a.id, b.id);
    expect(Number(b.code.slice(4))).toBeGreaterThan(Number(a.code.slice(4)));
  });

  it("rejects duplicate model under the same manufacturer", async () => {
    const manufacturer = await createManufacturer();
    const modelName = uniqueCode();
    const first = await service.create({ manufacturerId: manufacturer.id, model: modelName });
    createdModelIds.push(first.id);

    await expect(
      service.create({ manufacturerId: manufacturer.id, model: modelName.toLowerCase() }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("allows the same model name under a different manufacturer", async () => {
    const firstManufacturer = await createManufacturer("FirstBrand");
    const secondManufacturer = await createManufacturer("SecondBrand");
    const modelName = uniqueCode();

    const first = await service.create({
      manufacturerId: firstManufacturer.id,
      model: modelName,
    });
    const second = await service.create({
      manufacturerId: secondManufacturer.id,
      model: modelName,
    });
    createdModelIds.push(first.id, second.id);

    expect(second.manufacturerId).toBe(secondManufacturer.id);
    expect(second.model).toBe(modelName);
  });

  it("rejects an unknown manufacturerId", async () => {
    await expect(
      service.create({ manufacturerId: "missing-manufacturer-id", model: uniqueCode() }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("DeviceModelsService.findAll / findOne / update / remove", () => {
  it("lists, filters by manufacturer, searches, reads, updates, and deletes a device model", async () => {
    const manufacturer = await createManufacturer("Mindray");
    const other = await createManufacturer("Other");
    const modelName = uniqueCode();
    const created = await service.create({
      manufacturerId: manufacturer.id,
      model: modelName,
      description: "Test model",
    });
    createdModelIds.push(created.id);

    const listed = await service.findAll({ search: modelName, page: 1, pageSize: 10 });
    expect(listed.data.some((row) => row.id === created.id)).toBe(true);

    const byManufacturerName = await service.findAll({
      search: manufacturer.name,
      page: 1,
      pageSize: 100,
    });
    expect(byManufacturerName.data.some((row) => row.id === created.id)).toBe(true);

    const byCode = await service.findAll({ search: created.code, page: 1, pageSize: 10 });
    expect(byCode.data.some((row) => row.id === created.id)).toBe(true);

    const filtered = await service.findAll({
      manufacturerId: manufacturer.id,
      page: 1,
      pageSize: 10,
    });
    expect(filtered.data.some((row) => row.id === created.id)).toBe(true);

    const excluded = await service.findAll({
      manufacturerId: other.id,
      page: 1,
      pageSize: 10,
    });
    expect(excluded.data.some((row) => row.id === created.id)).toBe(false);

    const found = await service.findOne(created.id);
    expect(found.model).toBe(modelName);

    const updated = await service.update(created.id, {
      description: "Updated description",
      manufacturerId: other.id,
    });
    expect(updated.description).toBe("Updated description");
    expect(updated.manufacturerId).toBe(other.id);
    expect(updated.code).toBe(created.code);

    const removed = await service.remove(created.id);
    expect(removed.id).toBe(created.id);
    createdModelIds.splice(createdModelIds.indexOf(created.id), 1);

    await expect(service.findOne(created.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects update of unknown id", async () => {
    await expect(service.findOne("missing-device-model-id")).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.update("missing-device-model-id", { model: "Nope" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects updating onto an existing model under the same manufacturer", async () => {
    const manufacturer = await createManufacturer();
    const first = await service.create({ manufacturerId: manufacturer.id, model: uniqueCode() });
    const second = await service.create({ manufacturerId: manufacturer.id, model: uniqueCode() });
    createdModelIds.push(first.id, second.id);

    await expect(
      service.update(second.id, { model: first.model }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
