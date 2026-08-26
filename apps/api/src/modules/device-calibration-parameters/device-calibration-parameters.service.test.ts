import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { deviceCalibrationParameterCreateSchema } from "@medcal/shared";
import { DeviceCalibrationParametersService } from "./device-calibration-parameters.service";
import { DeviceCapabilitiesService } from "../device-capabilities/device-capabilities.service";

const service = new DeviceCalibrationParametersService();
const capabilitiesService = new DeviceCapabilitiesService();
const createdParameterIds: string[] = [];
const createdItemIds: string[] = [];
const createdCapabilityIds: string[] = [];
const createdUomIds: string[] = [];
const createdTypeIds: string[] = [];
const createdCategoryIds: string[] = [];

function uniqueCode() {
  return `P${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

async function createDeviceType() {
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

async function createCapabilityItem() {
  const capability = await capabilitiesService.create({
    code: uniqueCode(),
    name: "Test Capability",
  });
  createdCapabilityIds.push(capability.id);
  const item = await capabilitiesService.createItem(capability.id, {
    code: uniqueCode(),
    name: "Systolic Pressure",
  });
  createdItemIds.push(item.id);
  return { capability, item };
}

async function createUom() {
  const uom = await prisma.uom.create({
    data: {
      code: uniqueCode(),
      name: "Millimetre of mercury",
      symbol: "mmHg",
      category: "PRESSURE",
    },
  });
  createdUomIds.push(uom.id);
  return uom;
}

afterAll(async () => {
  if (createdParameterIds.length > 0) {
    await prisma.deviceCalibrationParameter.deleteMany({
      where: { id: { in: createdParameterIds } },
    });
  }
  if (createdItemIds.length > 0) {
    await prisma.deviceCapabilityItem.deleteMany({ where: { id: { in: createdItemIds } } });
  }
  if (createdCapabilityIds.length > 0) {
    await prisma.deviceCapability.deleteMany({ where: { id: { in: createdCapabilityIds } } });
  }
  if (createdUomIds.length > 0) {
    await prisma.uom.deleteMany({ where: { id: { in: createdUomIds } } });
  }
  if (createdTypeIds.length > 0) {
    await prisma.deviceType.deleteMany({ where: { id: { in: createdTypeIds } } });
  }
  if (createdCategoryIds.length > 0) {
    await prisma.deviceCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
  }
});

describe("deviceCalibrationParameterCreateSchema", () => {
  it("requires deviceTypeId, code, name, capabilityItemId, and uomId", () => {
    expect(deviceCalibrationParameterCreateSchema.safeParse({}).success).toBe(false);
    expect(
      deviceCalibrationParameterCreateSchema.safeParse({
        capabilityItemId: "item-1",
        code: "CODE",
        name: "Named",
        uomId: "uom-1",
      }).success,
    ).toBe(false);
    expect(
      deviceCalibrationParameterCreateSchema.safeParse({
        deviceTypeId: "type-1",
        name: "Named",
        uomId: "uom-1",
      }).success,
    ).toBe(false);
    expect(
      deviceCalibrationParameterCreateSchema.safeParse({
        deviceTypeId: "type-1",
        capabilityItemId: "item-1",
        code: "CODE",
        uomId: "uom-1",
      }).success,
    ).toBe(false);
    expect(
      deviceCalibrationParameterCreateSchema.safeParse({
        deviceTypeId: "type-1",
        code: "CODE",
        name: "Named",
        uomId: "uom-1",
      }).success,
    ).toBe(false);
    expect(
      deviceCalibrationParameterCreateSchema.safeParse({
        deviceTypeId: "type-1",
        capabilityItemId: "item-1",
        code: "CODE",
        name: "Named",
      }).success,
    ).toBe(false);
    expect(
      deviceCalibrationParameterCreateSchema.safeParse({
        deviceTypeId: "type-1",
        capabilityItemId: "item-1",
        code: "code",
        name: "Named",
        uomId: "uom-1",
      }).data,
    ).toEqual({
      deviceTypeId: "type-1",
      capabilityItemId: "item-1",
      code: "CODE",
      name: "Named",
      uomId: "uom-1",
    });
  });
});

describe("DeviceCalibrationParametersService.create", () => {
  it("creates a calibration parameter linked to a device type, capability item, and UOM", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();
    const code = uniqueCode();

    const parameter = await service.create({
      deviceTypeId: deviceType.id,
      capabilityItemId: item.id,
      code,
      name: "Reference Value",
      uomId: uom.id,
    });
    createdParameterIds.push(parameter.id);

    expect(parameter.code).toBe(code);
    expect(parameter.name).toBe("Reference Value");
    expect(parameter.deviceTypeId).toBe(deviceType.id);
    expect(parameter.deviceType.name).toBe("Blood Pressure Monitor");
    expect(parameter.capabilityItemId).toBe(item.id);
    expect(parameter.capabilityItem.name).toBe("Systolic Pressure");
    expect(parameter.uomId).toBe(uom.id);
    expect(parameter.uom.symbol).toBe("mmHg");
  });

  it("rejects duplicate code under the same device type and capability item", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();
    const code = uniqueCode();
    const first = await service.create({
      deviceTypeId: deviceType.id,
      capabilityItemId: item.id,
      code,
      name: "First",
      uomId: uom.id,
    });
    createdParameterIds.push(first.id);

    await expect(
      service.create({
        deviceTypeId: deviceType.id,
        capabilityItemId: item.id,
        code,
        name: "Second",
        uomId: uom.id,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("allows the same capability item + code under a different device type", async () => {
    const firstType = await createDeviceType();
    const secondType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();
    const sharedCode = uniqueCode();

    const a = await service.create({
      deviceTypeId: firstType.id,
      capabilityItemId: item.id,
      code: sharedCode,
      name: "One",
      uomId: uom.id,
    });
    const b = await service.create({
      deviceTypeId: secondType.id,
      capabilityItemId: item.id,
      code: sharedCode,
      name: "Two",
      uomId: uom.id,
    });
    createdParameterIds.push(a.id, b.id);

    expect(b.code).toBe(sharedCode);
    expect(b.capabilityItemId).toBe(item.id);
    expect(b.deviceTypeId).toBe(secondType.id);
  });

  it("allows the same code under a different capability item of the same device type", async () => {
    const deviceType = await createDeviceType();
    const first = await createCapabilityItem();
    const second = await createCapabilityItem();
    const uom = await createUom();
    const sharedCode = uniqueCode();

    const a = await service.create({
      deviceTypeId: deviceType.id,
      capabilityItemId: first.item.id,
      code: sharedCode,
      name: "One",
      uomId: uom.id,
    });
    const b = await service.create({
      deviceTypeId: deviceType.id,
      capabilityItemId: second.item.id,
      code: sharedCode,
      name: "Two",
      uomId: uom.id,
    });
    createdParameterIds.push(a.id, b.id);

    expect(b.code).toBe(sharedCode);
    expect(b.capabilityItemId).toBe(second.item.id);
  });

  it("rejects an unknown deviceTypeId", async () => {
    const { item } = await createCapabilityItem();
    const uom = await createUom();
    await expect(
      service.create({
        deviceTypeId: "missing-device-type-id",
        capabilityItemId: item.id,
        code: uniqueCode(),
        name: "Orphan Type",
        uomId: uom.id,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an unknown capabilityItemId", async () => {
    const deviceType = await createDeviceType();
    const uom = await createUom();
    await expect(
      service.create({
        deviceTypeId: deviceType.id,
        capabilityItemId: "missing-capability-item-id",
        code: uniqueCode(),
        name: "Orphan",
        uomId: uom.id,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an unknown uomId", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    await expect(
      service.create({
        deviceTypeId: deviceType.id,
        capabilityItemId: item.id,
        code: uniqueCode(),
        name: "Orphan UOM",
        uomId: "missing-uom-id",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("DeviceCalibrationParametersService.findAll / findOne / update / remove", () => {
  it("lists, filters, searches, reads, updates, and deletes a calibration parameter", async () => {
    const deviceType = await createDeviceType();
    const otherType = await createDeviceType();
    const { capability, item } = await createCapabilityItem();
    const other = await createCapabilityItem();
    const uom = await createUom();
    const otherUom = await createUom();
    const code = uniqueCode();
    const created = await service.create({
      deviceTypeId: deviceType.id,
      capabilityItemId: item.id,
      code,
      name: "Indicated Value",
      description: "Test parameter",
      uomId: uom.id,
    });
    createdParameterIds.push(created.id);

    const listed = await service.findAll({ search: code, page: 1, pageSize: 10 });
    expect(listed.data.some((row) => row.id === created.id)).toBe(true);

    const byItemName = await service.findAll({
      search: "Systolic Pressure",
      page: 1,
      pageSize: 100,
    });
    expect(byItemName.data.some((row) => row.id === created.id)).toBe(true);

    const byDeviceType = await service.findAll({
      deviceTypeId: deviceType.id,
      page: 1,
      pageSize: 10,
    });
    expect(byDeviceType.data.some((row) => row.id === created.id)).toBe(true);

    const excludedType = await service.findAll({
      deviceTypeId: otherType.id,
      page: 1,
      pageSize: 10,
    });
    expect(excludedType.data.some((row) => row.id === created.id)).toBe(false);

    const byCapability = await service.findAll({
      capabilityId: capability.id,
      page: 1,
      pageSize: 10,
    });
    expect(byCapability.data.some((row) => row.id === created.id)).toBe(true);

    const excludedCapability = await service.findAll({
      capabilityId: other.capability.id,
      page: 1,
      pageSize: 10,
    });
    expect(excludedCapability.data.some((row) => row.id === created.id)).toBe(false);

    const byItem = await service.findAll({ capabilityItemId: item.id, page: 1, pageSize: 10 });
    expect(byItem.data.some((row) => row.id === created.id)).toBe(true);

    const byUom = await service.findAll({ uomId: uom.id, page: 1, pageSize: 10 });
    expect(byUom.data.some((row) => row.id === created.id)).toBe(true);

    const excludedUom = await service.findAll({ uomId: otherUom.id, page: 1, pageSize: 10 });
    expect(excludedUom.data.some((row) => row.id === created.id)).toBe(false);

    const found = await service.findOne(created.id);
    expect(found.name).toBe("Indicated Value");

    const updated = await service.update(created.id, {
      name: "Indicated Value Updated",
      description: "Updated description",
      deviceTypeId: otherType.id,
      capabilityItemId: other.item.id,
      uomId: otherUom.id,
    });
    expect(updated.name).toBe("Indicated Value Updated");
    expect(updated.description).toBe("Updated description");
    expect(updated.deviceTypeId).toBe(otherType.id);
    expect(updated.capabilityItemId).toBe(other.item.id);
    expect(updated.uomId).toBe(otherUom.id);

    const removed = await service.remove(created.id);
    expect(removed.id).toBe(created.id);
    createdParameterIds.splice(createdParameterIds.indexOf(created.id), 1);

    await expect(service.findOne(created.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects update of unknown id", async () => {
    await expect(service.findOne("missing-device-calibration-parameter-id")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.update("missing-device-calibration-parameter-id", { name: "Nope" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects updating onto an existing code for the same device type and capability item", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();
    const first = await service.create({
      deviceTypeId: deviceType.id,
      capabilityItemId: item.id,
      code: uniqueCode(),
      name: "First",
      uomId: uom.id,
    });
    const second = await service.create({
      deviceTypeId: deviceType.id,
      capabilityItemId: item.id,
      code: uniqueCode(),
      name: "Second",
      uomId: uom.id,
    });
    createdParameterIds.push(first.id, second.id);

    await expect(service.update(second.id, { code: first.code })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe("DeviceCapabilitiesService.removeItem with calibration parameters", () => {
  it("rejects deleting a capability item that still has calibration parameters", async () => {
    const deviceType = await createDeviceType();
    const { capability, item } = await createCapabilityItem();
    const uom = await createUom();
    const parameter = await service.create({
      deviceTypeId: deviceType.id,
      capabilityItemId: item.id,
      code: uniqueCode(),
      name: "Blocked Delete",
      uomId: uom.id,
    });
    createdParameterIds.push(parameter.id);

    await expect(capabilitiesService.removeItem(capability.id, item.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
