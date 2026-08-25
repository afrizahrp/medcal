import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { DeviceModelsService } from "./device-models.service";

const service = new DeviceModelsService();
const createdModelIds: string[] = [];
const createdTypeIds: string[] = [];
const createdCategoryIds: string[] = [];

function uniqueCode() {
  return `M${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

async function createType() {
  const category = await prisma.deviceCategory.create({
    data: { code: uniqueCode(), name: "Test Category" },
  });
  createdCategoryIds.push(category.id);
  const deviceType = await prisma.deviceType.create({
    data: {
      categoryId: category.id,
      code: uniqueCode(),
      name: "Blood Pressure Monitor",
    },
  });
  createdTypeIds.push(deviceType.id);
  return deviceType;
}

afterAll(async () => {
  if (createdModelIds.length > 0) {
    await prisma.deviceModel.deleteMany({ where: { id: { in: createdModelIds } } });
  }
  if (createdTypeIds.length > 0) {
    await prisma.deviceType.deleteMany({ where: { id: { in: createdTypeIds } } });
  }
  if (createdCategoryIds.length > 0) {
    await prisma.deviceCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
  }
});

describe("DeviceModelsService.create", () => {
  it("creates a device model linked to a device type", async () => {
    const deviceType = await createType();
    const modelName = uniqueCode();
    const deviceModel = await service.create({
      deviceTypeId: deviceType.id,
      manufacturer: "Omron",
      model: modelName,
    });
    createdModelIds.push(deviceModel.id);

    expect(deviceModel.manufacturer).toBe("Omron");
    expect(deviceModel.model).toBe(modelName);
    expect(deviceModel.deviceTypeId).toBe(deviceType.id);
    expect(deviceModel.deviceType.name).toBe("Blood Pressure Monitor");
  });

  it("rejects duplicate manufacturer+model under the same device type", async () => {
    const deviceType = await createType();
    const modelName = uniqueCode();
    const first = await service.create({
      deviceTypeId: deviceType.id,
      manufacturer: "Omron",
      model: modelName,
    });
    createdModelIds.push(first.id);

    await expect(
      service.create({
        deviceTypeId: deviceType.id,
        manufacturer: "omron",
        model: modelName,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("allows the same manufacturer+model under a different device type", async () => {
    const firstType = await createType();
    const secondType = await createType();
    const modelName = uniqueCode();

    const first = await service.create({
      deviceTypeId: firstType.id,
      manufacturer: "SharedCo",
      model: modelName,
    });
    const second = await service.create({
      deviceTypeId: secondType.id,
      manufacturer: "SharedCo",
      model: modelName,
    });
    createdModelIds.push(first.id, second.id);

    expect(second.deviceTypeId).toBe(secondType.id);
    expect(second.model).toBe(modelName);
  });

  it("rejects an unknown deviceTypeId", async () => {
    await expect(
      service.create({
        deviceTypeId: "missing-device-type-id",
        manufacturer: "Orphan",
        model: uniqueCode(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("DeviceModelsService.findAll / findOne / update / remove", () => {
  it("lists, filters by device type, searches, reads, updates, and deletes a device model", async () => {
    const deviceType = await createType();
    const other = await createType();
    const modelName = uniqueCode();
    const created = await service.create({
      deviceTypeId: deviceType.id,
      manufacturer: "Mindray",
      model: modelName,
      description: "Test model",
    });
    createdModelIds.push(created.id);

    const listed = await service.findAll({ search: modelName, page: 1, pageSize: 10 });
    expect(listed.data.some((row) => row.id === created.id)).toBe(true);

    const byTypeName = await service.findAll({
      search: "Blood Pressure Monitor",
      page: 1,
      pageSize: 100,
    });
    expect(byTypeName.data.some((row) => row.id === created.id)).toBe(true);

    const filtered = await service.findAll({ deviceTypeId: deviceType.id, page: 1, pageSize: 10 });
    expect(filtered.data.some((row) => row.id === created.id)).toBe(true);

    const excluded = await service.findAll({ deviceTypeId: other.id, page: 1, pageSize: 10 });
    expect(excluded.data.some((row) => row.id === created.id)).toBe(false);

    const found = await service.findOne(created.id);
    expect(found.model).toBe(modelName);

    const updated = await service.update(created.id, {
      manufacturer: "Mindray Updated",
      description: "Updated description",
      deviceTypeId: other.id,
    });
    expect(updated.manufacturer).toBe("Mindray Updated");
    expect(updated.description).toBe("Updated description");
    expect(updated.deviceTypeId).toBe(other.id);

    const removed = await service.remove(created.id);
    expect(removed.id).toBe(created.id);
    createdModelIds.splice(createdModelIds.indexOf(created.id), 1);

    await expect(service.findOne(created.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects update of unknown id", async () => {
    await expect(service.findOne("missing-device-model-id")).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.update("missing-device-model-id", { manufacturer: "Nope" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects updating onto an existing manufacturer+model combination", async () => {
    const deviceType = await createType();
    const first = await service.create({
      deviceTypeId: deviceType.id,
      manufacturer: "FirstCo",
      model: uniqueCode(),
    });
    const second = await service.create({
      deviceTypeId: deviceType.id,
      manufacturer: "SecondCo",
      model: uniqueCode(),
    });
    createdModelIds.push(first.id, second.id);

    await expect(
      service.update(second.id, { manufacturer: first.manufacturer, model: first.model }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
