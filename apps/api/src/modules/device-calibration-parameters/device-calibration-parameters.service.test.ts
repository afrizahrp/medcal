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
    expect(parameter.uom?.symbol).toBe("mmHg");
    expect(parameter.toleranceMin).toBeNull();
    expect(parameter.toleranceMax).toBeNull();
    expect(parameter.toleranceNote).toBeNull();
  });

  it("stores a nominal-plus-minus tolerance as computed min and max", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();
    const parameter = await service.create({
      deviceTypeId: deviceType.id,
      capabilityItemId: item.id,
      code: uniqueCode(),
      name: "Room Temperature",
      uomId: uom.id,
      toleranceMin: 19,
      toleranceMax: 31,
      toleranceNote: "25 ± 6°C",
    });
    createdParameterIds.push(parameter.id);

    expect(Number(parameter.toleranceMin)).toBe(19);
    expect(Number(parameter.toleranceMax)).toBe(31);
    expect(parameter.toleranceNote).toBe("25 ± 6°C");
  });

  it("stores an upper-bound-only tolerance with min left null", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();
    const parameter = await service.create({
      deviceTypeId: deviceType.id,
      capabilityItemId: item.id,
      code: uniqueCode(),
      name: "Equipment Leakage Current",
      uomId: uom.id,
      toleranceMax: 500,
      toleranceNote: "≤500 µA",
    });
    createdParameterIds.push(parameter.id);

    expect(parameter.toleranceMin).toBeNull();
    expect(Number(parameter.toleranceMax)).toBe(500);
    expect(parameter.toleranceNote).toBe("≤500 µA");
  });

  it("rejects a create payload whose min is greater than max", () => {
    expect(
      deviceCalibrationParameterCreateSchema.safeParse({
        deviceTypeId: "type-1",
        capabilityItemId: "item-1",
        code: "CODE",
        name: "Named",
        uomId: "uom-1",
        toleranceMin: 10,
        toleranceMax: 5,
      }).success,
    ).toBe(false);
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

    const withTolerance = await service.update(created.id, {
      toleranceMin: 90,
      toleranceMax: null,
      toleranceNote: "≥90%",
    });
    expect(Number(withTolerance.toleranceMin)).toBe(90);
    expect(withTolerance.toleranceMax).toBeNull();
    expect(withTolerance.toleranceNote).toBe("≥90%");

    const clearedTolerance = await service.update(created.id, {
      toleranceMin: null,
      toleranceMax: null,
      toleranceNote: null,
    });
    expect(clearedTolerance.toleranceMin).toBeNull();
    expect(clearedTolerance.toleranceMax).toBeNull();
    expect(clearedTolerance.toleranceNote).toBeNull();

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

describe("DeviceCalibrationParametersService — decimalPlaces", () => {
  it("persists decimalPlaces on create and returns it from the API", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();
    const parameter = await service.create({
      deviceTypeId: deviceType.id,
      capabilityItemId: item.id,
      code: uniqueCode(),
      name: "Mean",
      uomId: uom.id,
      decimalPlaces: 5,
    });
    createdParameterIds.push(parameter.id);
    expect(parameter.decimalPlaces).toBe(5);

    const found = await service.findOne(parameter.id);
    expect(found.decimalPlaces).toBe(5);
  });

  it("defaults decimalPlaces to null when omitted and updates/clears it", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();
    const parameter = await service.create({
      deviceTypeId: deviceType.id,
      capabilityItemId: item.id,
      code: uniqueCode(),
      name: "Systole",
      uomId: uom.id,
    });
    createdParameterIds.push(parameter.id);
    expect(parameter.decimalPlaces).toBeNull();

    const set = await service.update(parameter.id, { decimalPlaces: 1 });
    expect(set.decimalPlaces).toBe(1);

    const cleared = await service.update(parameter.id, { decimalPlaces: null });
    expect(cleared.decimalPlaces).toBeNull();
  });

  it("rejects decimalPlaces on a non-NUMBER parameter", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();
    const parameter = await service.create({
      deviceTypeId: deviceType.id,
      capabilityItemId: item.id,
      code: uniqueCode(),
      name: "Ratio Param",
      uomId: uom.id,
    });
    createdParameterIds.push(parameter.id);
    await prisma.deviceCalibrationParameter.update({
      where: { id: parameter.id },
      data: { valueType: "RATIO" },
    });

    await expect(service.update(parameter.id, { decimalPlaces: 3 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects decimalPlaces outside 0..10 at the schema layer", () => {
    const base = {
      deviceTypeId: "type-1",
      capabilityItemId: "item-1",
      code: "CODE",
      name: "Named",
      uomId: "uom-1",
    };
    expect(deviceCalibrationParameterCreateSchema.safeParse({ ...base, decimalPlaces: 11 }).success).toBe(
      false,
    );
    expect(deviceCalibrationParameterCreateSchema.safeParse({ ...base, decimalPlaces: -1 }).success).toBe(
      false,
    );
    expect(deviceCalibrationParameterCreateSchema.safeParse({ ...base, decimalPlaces: 2.5 }).success).toBe(
      false,
    );
    expect(deviceCalibrationParameterCreateSchema.safeParse({ ...base, decimalPlaces: 5 }).success).toBe(
      true,
    );
  });
});

describe("DeviceCalibrationParametersService.findAllGroupedByDeviceType", () => {
  it("groups parameters under their device type and honours search", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();
    const marker = uniqueCode();
    const a = await service.create({
      deviceTypeId: deviceType.id,
      capabilityItemId: item.id,
      code: uniqueCode(),
      name: `Grouped ${marker} A`,
      uomId: uom.id,
      decimalPlaces: 2,
    });
    const b = await service.create({
      deviceTypeId: deviceType.id,
      capabilityItemId: item.id,
      code: uniqueCode(),
      name: `Grouped ${marker} B`,
      uomId: uom.id,
    });
    createdParameterIds.push(a.id, b.id);

    const grouped = await service.findAllGroupedByDeviceType({ search: marker });
    const group = grouped.data.find((g) => g.deviceType.id === deviceType.id);
    expect(group).toBeDefined();
    expect(group?.count).toBe(2);
    expect(group?.categoryName).toBe("Test Category");
    expect(group?.parameters.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
    expect(grouped.totalParameters).toBe(2);
    expect(grouped.totalDeviceTypes).toBe(1);
    expect(grouped.total).toBe(1);
    expect(grouped.page).toBe(1);
    expect(grouped.totalPages).toBe(1);
  });

  it("groups a device type's parameters by Capability, then sorts by name within each Capability", async () => {
    const deviceType = await createDeviceType();
    const uom = await createUom();
    const marker = uniqueCode();

    // Two capabilities whose case-insensitive name order is: "alpha env" < "zeta safety"
    const envCap = await capabilitiesService.create({ code: uniqueCode(), name: `alpha env ${marker}` });
    const safetyCap = await capabilitiesService.create({
      code: uniqueCode(),
      name: `Zeta safety ${marker}`,
    });
    createdCapabilityIds.push(envCap.id, safetyCap.id);
    const envItem = await capabilitiesService.createItem(envCap.id, {
      code: uniqueCode(),
      name: "Env Item",
    });
    const safetyItem = await capabilitiesService.createItem(safetyCap.id, {
      code: uniqueCode(),
      name: "Safety Item",
    });
    createdItemIds.push(envItem.id, safetyItem.id);

    // Insert interleaved and in non-alphabetical order to prove sorting, not insertion order.
    const specs = [
      { item: safetyItem.id, name: `${marker} Resistansi Isolasi` },
      { item: envItem.id, name: `${marker} Kelembaban` },
      { item: safetyItem.id, name: `${marker} Arus Bocor Peralatan` },
      { item: envItem.id, name: `${marker} Suhu` },
      { item: safetyItem.id, name: `${marker} arus bocor bagian` },
    ];
    for (const spec of specs) {
      const row = await service.create({
        deviceTypeId: deviceType.id,
        capabilityItemId: spec.item,
        code: uniqueCode(),
        name: spec.name,
        uomId: uom.id,
      });
      createdParameterIds.push(row.id);
    }

    const grouped = await service.findAllGroupedByDeviceType({ search: marker });
    const group = grouped.data.find((g) => g.deviceType.id === deviceType.id);
    expect(group).toBeDefined();
    const params = group!.parameters;

    // 1 + 2: same-capability parameters are contiguous (not scattered).
    const capNames = params.map((p) => p.capabilityItem.capability.name);
    const firstSafety = capNames.indexOf(safetyCap.name);
    const lastSafety = capNames.lastIndexOf(safetyCap.name);
    expect(lastSafety - firstSafety).toBe(2); // 3 safety params, all adjacent

    // 3: Capability order is deterministic ascending by name; within each,
    // parameters sorted ascending (case-insensitive).
    expect(params.map((p) => p.name)).toEqual([
      `${marker} Kelembaban`,
      `${marker} Suhu`,
      `${marker} arus bocor bagian`,
      `${marker} Arus Bocor Peralatan`,
      `${marker} Resistansi Isolasi`,
    ]);

    // 4: sorting did not mutate any display text.
    expect(params.find((p) => p.name.endsWith("arus bocor bagian"))?.name).toBe(
      `${marker} arus bocor bagian`,
    );
  });

  it("paginates at the Device-Type level, keeping each group's parameters together", async () => {
    const marker = uniqueCode();
    const uom = await createUom();
    // 3 device types, each with 2 parameters, all matched by `marker`.
    for (let t = 0; t < 3; t++) {
      const deviceType = await createDeviceType();
      const { item } = await createCapabilityItem();
      for (let p = 0; p < 2; p++) {
        const row = await service.create({
          deviceTypeId: deviceType.id,
          capabilityItemId: item.id,
          code: uniqueCode(),
          name: `Paged ${marker} ${t}-${p}`,
          uomId: uom.id,
        });
        createdParameterIds.push(row.id);
      }
    }

    const page1 = await service.findAllGroupedByDeviceType({ search: marker, page: 1, pageSize: 2 });
    expect(page1.total).toBe(3);
    expect(page1.totalPages).toBe(2);
    expect(page1.data).toHaveLength(2);
    expect(page1.totalParameters).toBe(6);
    // no group is split — every group on the page has all its parameters
    for (const group of page1.data) expect(group.parameters).toHaveLength(group.count);

    const page2 = await service.findAllGroupedByDeviceType({ search: marker, page: 2, pageSize: 2 });
    expect(page2.data).toHaveLength(1);
    const idsPage1 = page1.data.map((g) => g.deviceType.id);
    expect(idsPage1).not.toContain(page2.data[0].deviceType.id);
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
