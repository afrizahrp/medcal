import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { DeviceTypeAliasesService } from "./device-type-aliases.service";

const service = new DeviceTypeAliasesService();

// Alias normalizedAlias is GLOBALLY unique — suffix every literal so the suite
// never collides with real seed/UI-created aliases or with a parallel run.
const TAG = randomUUID().slice(0, 8);

const createdAliasIds: string[] = [];
const createdDeviceTypeIds: string[] = [];
const createdDeviceCategoryIds: string[] = [];

async function makeDeviceType(name: string): Promise<string> {
  const category = await prisma.deviceCategory.create({
    data: { code: `C${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`, name: "Alias Test Cat" },
  });
  createdDeviceCategoryIds.push(category.id);
  const dt = await prisma.deviceType.create({
    data: {
      categoryId: category.id,
      code: `T${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`,
      name,
    },
  });
  createdDeviceTypeIds.push(dt.id);
  return dt.id;
}

afterAll(async () => {
  if (createdAliasIds.length > 0) {
    await prisma.deviceTypeAlias.deleteMany({ where: { id: { in: createdAliasIds } } });
  }
  await prisma.deviceTypeAlias.deleteMany({ where: { deviceTypeId: { in: createdDeviceTypeIds } } });
  if (createdDeviceTypeIds.length > 0) {
    await prisma.deviceType.deleteMany({ where: { id: { in: createdDeviceTypeIds } } });
  }
  if (createdDeviceCategoryIds.length > 0) {
    await prisma.deviceCategory.deleteMany({ where: { id: { in: createdDeviceCategoryIds } } });
  }
});

describe("DeviceTypeAliasesService", () => {
  it("creates an alias and stores a normalized matching key", async () => {
    const deviceTypeId = await makeDeviceType(`Sphygmomanometer ${randomUUID().slice(0, 4)}`);
    const created = await service.create({ deviceTypeId, alias: `  Tensimeter ${TAG}  ` });
    createdAliasIds.push(created.id);

    expect(created.alias).toBe(`Tensimeter ${TAG}`);
    expect(created.normalizedAlias).toBe(`tensimeter ${TAG.toLowerCase()}`);
    expect(created.isActive).toBe(true);
    expect(created.deviceType.id).toBe(deviceTypeId);
  });

  it("normalizes case and whitespace to the same key", async () => {
    const deviceTypeId = await makeDeviceType(`BP Monitor ${randomUUID().slice(0, 4)}`);
    const a = await service.create({ deviceTypeId, alias: `Blood   Pressure Monitor ${TAG}` });
    createdAliasIds.push(a.id);
    expect(a.normalizedAlias).toBe(`blood pressure monitor ${TAG.toLowerCase()}`);
  });

  it("rejects a duplicate normalized alias mapping to a different device type", async () => {
    const dt1 = await makeDeviceType(`Type A ${randomUUID().slice(0, 4)}`);
    const dt2 = await makeDeviceType(`Type B ${randomUUID().slice(0, 4)}`);
    const first = await service.create({ deviceTypeId: dt1, alias: `Shared Term ${TAG}` });
    createdAliasIds.push(first.id);

    await expect(
      service.create({ deviceTypeId: dt2, alias: `  SHARED   term ${TAG.toUpperCase()} ` }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects an alias for a non-existent device type", async () => {
    await expect(
      service.create({ deviceTypeId: "does-not-exist", alias: "Whatever" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("updates alias text and re-checks normalized uniqueness", async () => {
    const deviceTypeId = await makeDeviceType(`Type C ${randomUUID().slice(0, 4)}`);
    const created = await service.create({ deviceTypeId, alias: `Original Term ${TAG}` });
    createdAliasIds.push(created.id);

    const updated = await service.update(created.id, { alias: `Renamed Term ${TAG}` });
    expect(updated.normalizedAlias).toBe(`renamed term ${TAG.toLowerCase()}`);
  });

  it("supports deactivating and reactivating an alias", async () => {
    const deviceTypeId = await makeDeviceType(`Type D ${randomUUID().slice(0, 4)}`);
    const created = await service.create({ deviceTypeId, alias: `Toggle Term ${TAG}` });
    createdAliasIds.push(created.id);

    const off = await service.update(created.id, { isActive: false });
    expect(off.isActive).toBe(false);
    const on = await service.update(created.id, { isActive: true });
    expect(on.isActive).toBe(true);
  });

  it("filters list results by deviceTypeId and isActive", async () => {
    const deviceTypeId = await makeDeviceType(`Type E ${randomUUID().slice(0, 4)}`);
    const x = await service.create({
      deviceTypeId,
      alias: `List Term ${TAG} ${randomUUID().slice(0, 6)}`,
    });
    createdAliasIds.push(x.id);
    await service.update(x.id, { isActive: false });

    const activeOnly = await service.findAll({ deviceTypeId, isActive: true });
    expect(activeOnly.data.some((r) => r.id === x.id)).toBe(false);
    const inactiveOnly = await service.findAll({ deviceTypeId, isActive: false });
    expect(inactiveOnly.data.some((r) => r.id === x.id)).toBe(true);
  });

  it("throws NotFound for an unknown id", async () => {
    await expect(service.findOne("nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});
