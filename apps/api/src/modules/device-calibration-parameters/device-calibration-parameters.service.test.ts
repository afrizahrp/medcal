import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import {
  deviceCalibrationParameterCopySchema,
  deviceCalibrationParameterCreateSchema,
} from "@medcal/shared";
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

function uniqueSlug() {
  return `P${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

async function createDeviceType() {
  const category = await prisma.deviceCategory.create({
    data: { code: `DVCAT-TEST-${uniqueSlug()}`, name: "Test Category" },
  });
  createdCategoryIds.push(category.id);
  const deviceType = await prisma.deviceType.create({
    data: {
      categoryId: category.id,
      code: `DVTP-TEST-${uniqueSlug()}`,
      name: "Blood Pressure Monitor",
    },
  });
  createdTypeIds.push(deviceType.id);
  return deviceType;
}

async function createCapabilityItem() {
  const capability = await capabilitiesService.create({ name: `Test Capability ${uniqueSlug()}` });
  createdCapabilityIds.push(capability.id);
  const item = await capabilitiesService.createItem(capability.id, { name: "Systolic Pressure" });
  createdItemIds.push(item.id);
  return { capability, item };
}

async function createUom() {
  const uom = await prisma.uom.create({
    data: {
      code: `UOM-TEST-${uniqueSlug()}`,
      name: "Millimetre of mercury",
      symbol: "mmHg",
      category: "PRESSURE",
    },
  });
  createdUomIds.push(uom.id);
  return uom;
}

/** Base create payload — `code` is system-issued, never supplied. */
function baseInput(deviceTypeId: string, capabilityItemId: string, uomId: string, name: string) {
  return { deviceTypeId, capabilityItemId, uomId, name };
}

afterAll(async () => {
  if (createdParameterIds.length > 0) {
    await prisma.deviceCalibrationParameter.deleteMany({ where: { id: { in: createdParameterIds } } });
  }
  await prisma.deviceCalibrationParameter.deleteMany({
    where: { deviceTypeId: { in: createdTypeIds } },
  });
  if (createdItemIds.length > 0) {
    await prisma.deviceCapabilityItem.deleteMany({ where: { id: { in: createdItemIds } } });
  }
  if (createdCapabilityIds.length > 0) {
    await prisma.deviceCapabilityItem.deleteMany({
      where: { capabilityId: { in: createdCapabilityIds } },
    });
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
  it("requires deviceTypeId, name, capabilityItemId, and uomId — and does not accept code", () => {
    expect(deviceCalibrationParameterCreateSchema.safeParse({}).success).toBe(false);
    expect(
      deviceCalibrationParameterCreateSchema.safeParse({
        deviceTypeId: "type-1",
        capabilityItemId: "item-1",
        name: "Named",
      }).success,
    ).toBe(false); // missing uomId
    const parsed = deviceCalibrationParameterCreateSchema.parse({
      deviceTypeId: "type-1",
      capabilityItemId: "item-1",
      name: "Named",
      uomId: "uom-1",
      code: "HACK",
    });
    expect("code" in parsed).toBe(false);
  });
});

describe("DeviceCalibrationParametersService.create", () => {
  it("creates a parameter with a system-issued DCP- code", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();

    const parameter = await service.create(
      baseInput(deviceType.id, item.id, uom.id, "Reference Value"),
    );
    createdParameterIds.push(parameter.id);

    expect(parameter.code).toMatch(/^DCP-\d{4,}$/);
    expect(parameter.name).toBe("Reference Value");
    expect(parameter.deviceType.name).toBe("Blood Pressure Monitor");
    expect(parameter.capabilityItem.name).toBe("Systolic Pressure");
    expect(parameter.uom?.symbol).toBe("mmHg");
    expect(parameter.toleranceMin).toBeNull();
  });

  it("allocates strictly increasing codes", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();
    const a = await service.create(baseInput(deviceType.id, item.id, uom.id, "One"));
    const b = await service.create(baseInput(deviceType.id, item.id, uom.id, "Two"));
    createdParameterIds.push(a.id, b.id);
    expect(Number(b.code.slice(4))).toBeGreaterThan(Number(a.code.slice(4)));
  });

  it("stores a nominal-plus-minus tolerance as computed min and max", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();
    const parameter = await service.create({
      ...baseInput(deviceType.id, item.id, uom.id, "Room Temperature"),
      toleranceMin: 19,
      toleranceMax: 31,
      toleranceNote: "25 ± 6°C",
    });
    createdParameterIds.push(parameter.id);
    expect(Number(parameter.toleranceMin)).toBe(19);
    expect(Number(parameter.toleranceMax)).toBe(31);
  });

  it("rejects a duplicate parameter name for the same device type and capability item", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();
    const first = await service.create(baseInput(deviceType.id, item.id, uom.id, "Indicated"));
    createdParameterIds.push(first.id);

    await expect(
      service.create(baseInput(deviceType.id, item.id, uom.id, "indicated")),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("allows the same parameter name under a different device type", async () => {
    const firstType = await createDeviceType();
    const secondType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();

    const a = await service.create(baseInput(firstType.id, item.id, uom.id, "Shared"));
    const b = await service.create(baseInput(secondType.id, item.id, uom.id, "Shared"));
    createdParameterIds.push(a.id, b.id);
    expect(b.code).not.toBe(a.code);
    expect(b.deviceTypeId).toBe(secondType.id);
  });

  it("allows the same name under a different capability item of the same device type", async () => {
    const deviceType = await createDeviceType();
    const first = await createCapabilityItem();
    const second = await createCapabilityItem();
    const uom = await createUom();

    const a = await service.create(baseInput(deviceType.id, first.item.id, uom.id, "Shared"));
    const b = await service.create(baseInput(deviceType.id, second.item.id, uom.id, "Shared"));
    createdParameterIds.push(a.id, b.id);
    expect(b.capabilityItemId).toBe(second.item.id);
  });

  it("rejects an unknown deviceTypeId / capabilityItemId / uomId", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();

    await expect(
      service.create(baseInput("missing", item.id, uom.id, "A")),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(baseInput(deviceType.id, "missing", uom.id, "B")),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(baseInput(deviceType.id, item.id, "missing", "C")),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("deviceCalibrationParameterCopySchema", () => {
  it("requires sourceDeviceTypeId, targetDeviceTypeId, and a non-empty parameterIds", () => {
    expect(deviceCalibrationParameterCopySchema.safeParse({}).success).toBe(false);
    expect(
      deviceCalibrationParameterCopySchema.safeParse({
        sourceDeviceTypeId: "a",
        targetDeviceTypeId: "b",
        parameterIds: [],
      }).success,
    ).toBe(false);
  });

  it("rejects sourceDeviceTypeId equal to targetDeviceTypeId", () => {
    expect(
      deviceCalibrationParameterCopySchema.safeParse({
        sourceDeviceTypeId: "same",
        targetDeviceTypeId: "same",
        parameterIds: ["p1"],
      }).success,
    ).toBe(false);
  });
});

describe("DeviceCalibrationParametersService.copy", () => {
  it("copies parameters onto another device type, reusing the same capabilityItemId and allocating a new code", async () => {
    const source = await createDeviceType();
    const target = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();
    const marker = uniqueSlug();
    const a = await service.create({
      ...baseInput(source.id, item.id, uom.id, `${marker} Alpha`),
      toleranceMin: 1,
      toleranceMax: 9,
      toleranceNote: "note",
      decimalPlaces: 2,
    });
    const b = await service.create(baseInput(source.id, item.id, uom.id, `${marker} Beta`));
    createdParameterIds.push(a.id, b.id);

    const result = await service.copy({
      sourceDeviceTypeId: source.id,
      targetDeviceTypeId: target.id,
      parameterIds: [a.id, b.id],
    });
    createdParameterIds.push(...result.created.map((row) => row.id));

    expect(result.skippedDuplicateName).toEqual([]);
    expect(result.skippedUnsupportedEntryStyle).toEqual([]);
    expect(result.created).toHaveLength(2);

    const copiedAlpha = await service.findOne(
      result.created.find((row) => row.name === `${marker} Alpha`)!.id,
    );
    expect(copiedAlpha.deviceTypeId).toBe(target.id);
    expect(copiedAlpha.capabilityItemId).toBe(item.id);
    expect(copiedAlpha.code).not.toBe(a.code);
    expect(Number(copiedAlpha.toleranceMin)).toBe(1);
    expect(Number(copiedAlpha.toleranceMax)).toBe(9);
    expect(copiedAlpha.decimalPlaces).toBe(2);
    expect(copiedAlpha.isActive).toBe(true);
  });

  it("skips a row whose name already exists under the same capability item on the target", async () => {
    const source = await createDeviceType();
    const target = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();
    const marker = uniqueSlug();
    const sourceParam = await service.create(baseInput(source.id, item.id, uom.id, `${marker} Dup`));
    const targetParam = await service.create(baseInput(target.id, item.id, uom.id, `${marker} Dup`));
    createdParameterIds.push(sourceParam.id, targetParam.id);

    const result = await service.copy({
      sourceDeviceTypeId: source.id,
      targetDeviceTypeId: target.id,
      parameterIds: [sourceParam.id],
    });

    expect(result.created).toEqual([]);
    expect(result.skippedDuplicateName).toEqual([{ sourceParameterId: sourceParam.id, name: `${marker} Dup` }]);
  });

  it("skips a row whose entryStyle or valueType the create path can't express", async () => {
    const source = await createDeviceType();
    const target = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();
    const marker = uniqueSlug();

    const loggerSummary = await prisma.deviceCalibrationParameter.create({
      data: {
        deviceTypeId: source.id,
        capabilityItemId: item.id,
        code: `DCP-TEST-${uniqueSlug()}`,
        name: `${marker} Logger`,
        uomId: uom.id,
        entryStyle: "LOGGER_SUMMARY",
      },
    });
    const nonNumber = await prisma.deviceCalibrationParameter.create({
      data: {
        deviceTypeId: source.id,
        capabilityItemId: item.id,
        code: `DCP-TEST-${uniqueSlug()}`,
        name: `${marker} Text`,
        uomId: uom.id,
        valueType: "TEXT",
      },
    });
    createdParameterIds.push(loggerSummary.id, nonNumber.id);

    const result = await service.copy({
      sourceDeviceTypeId: source.id,
      targetDeviceTypeId: target.id,
      parameterIds: [loggerSummary.id, nonNumber.id],
    });

    expect(result.created).toEqual([]);
    expect(result.skippedDuplicateName).toEqual([]);
    expect(result.skippedUnsupportedEntryStyle).toEqual([
      { sourceParameterId: loggerSummary.id, name: `${marker} Logger`, entryStyle: "LOGGER_SUMMARY", valueType: "NUMBER" },
      { sourceParameterId: nonNumber.id, name: `${marker} Text`, entryStyle: "DIRECT_REPLICATES", valueType: "TEXT" },
    ]);
  });

  it("separates created / skippedDuplicateName / skippedUnsupportedEntryStyle in one mixed request", async () => {
    const source = await createDeviceType();
    const target = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();
    const marker = uniqueSlug();

    const ok = await service.create(baseInput(source.id, item.id, uom.id, `${marker} Ok`));
    const dupSource = await service.create(baseInput(source.id, item.id, uom.id, `${marker} Dup2`));
    const dupTarget = await service.create(baseInput(target.id, item.id, uom.id, `${marker} Dup2`));
    const unsupported = await prisma.deviceCalibrationParameter.create({
      data: {
        deviceTypeId: source.id,
        capabilityItemId: item.id,
        code: `DCP-TEST-${uniqueSlug()}`,
        name: `${marker} Unsupported`,
        uomId: uom.id,
        entryStyle: "LOGGER_SUMMARY",
      },
    });
    createdParameterIds.push(ok.id, dupSource.id, dupTarget.id, unsupported.id);

    const result = await service.copy({
      sourceDeviceTypeId: source.id,
      targetDeviceTypeId: target.id,
      parameterIds: [ok.id, dupSource.id, unsupported.id],
    });
    createdParameterIds.push(...result.created.map((row) => row.id));

    expect(result.created.map((row) => row.name)).toEqual([`${marker} Ok`]);
    expect(result.skippedDuplicateName).toEqual([{ sourceParameterId: dupSource.id, name: `${marker} Dup2` }]);
    expect(result.skippedUnsupportedEntryStyle).toEqual([
      { sourceParameterId: unsupported.id, name: `${marker} Unsupported`, entryStyle: "LOGGER_SUMMARY", valueType: "NUMBER" },
    ]);
  });

  it("creates a DeviceTypeCapabilityOrder row when the target never had this capability", async () => {
    const source = await createDeviceType();
    const target = await createDeviceType();
    const { capability, item } = await createCapabilityItem();
    const uom = await createUom();
    const marker = uniqueSlug();
    const sourceParam = await service.create(baseInput(source.id, item.id, uom.id, `${marker} New`));
    createdParameterIds.push(sourceParam.id);

    const before = await prisma.deviceTypeCapabilityOrder.findUnique({
      where: { deviceTypeId_capabilityId: { deviceTypeId: target.id, capabilityId: capability.id } },
    });
    expect(before).toBeNull();

    const result = await service.copy({
      sourceDeviceTypeId: source.id,
      targetDeviceTypeId: target.id,
      parameterIds: [sourceParam.id],
    });
    createdParameterIds.push(...result.created.map((row) => row.id));

    const after = await prisma.deviceTypeCapabilityOrder.findUnique({
      where: { deviceTypeId_capabilityId: { deviceTypeId: target.id, capabilityId: capability.id } },
    });
    expect(after).not.toBeNull();
  });

  it("rejects a parameterId that does not belong to sourceDeviceTypeId", async () => {
    const source = await createDeviceType();
    const target = await createDeviceType();
    const otherType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();
    const foreign = await service.create(baseInput(otherType.id, item.id, uom.id, "Foreign"));
    createdParameterIds.push(foreign.id);

    await expect(
      service.copy({
        sourceDeviceTypeId: source.id,
        targetDeviceTypeId: target.id,
        parameterIds: [foreign.id],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an unknown sourceDeviceTypeId or targetDeviceTypeId", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();
    const param = await service.create(baseInput(deviceType.id, item.id, uom.id, "X"));
    createdParameterIds.push(param.id);

    await expect(
      service.copy({
        sourceDeviceTypeId: "missing",
        targetDeviceTypeId: deviceType.id,
        parameterIds: [param.id],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.copy({
        sourceDeviceTypeId: deviceType.id,
        targetDeviceTypeId: "missing",
        parameterIds: [param.id],
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
    const created = await service.create({
      ...baseInput(deviceType.id, item.id, uom.id, `Indicated ${uniqueSlug()}`),
      description: "Test parameter",
    });
    createdParameterIds.push(created.id);

    const byCode = await service.findAll({ search: created.code, page: 1, pageSize: 10 });
    expect(byCode.data.some((row) => row.id === created.id)).toBe(true);

    const byItemName = await service.findAll({ search: "Systolic Pressure", page: 1, pageSize: 100 });
    expect(byItemName.data.some((row) => row.id === created.id)).toBe(true);

    const byDeviceType = await service.findAll({ deviceTypeId: deviceType.id, page: 1, pageSize: 10 });
    expect(byDeviceType.data.some((row) => row.id === created.id)).toBe(true);

    const excludedType = await service.findAll({ deviceTypeId: otherType.id, page: 1, pageSize: 10 });
    expect(excludedType.data.some((row) => row.id === created.id)).toBe(false);

    const byCapability = await service.findAll({ capabilityId: capability.id, page: 1, pageSize: 10 });
    expect(byCapability.data.some((row) => row.id === created.id)).toBe(true);

    const byItem = await service.findAll({ capabilityItemId: item.id, page: 1, pageSize: 10 });
    expect(byItem.data.some((row) => row.id === created.id)).toBe(true);

    const byUom = await service.findAll({ uomId: uom.id, page: 1, pageSize: 10 });
    expect(byUom.data.some((row) => row.id === created.id)).toBe(true);

    const found = await service.findOne(created.id);
    expect(found.name).toBe(created.name);

    const updated = await service.update(created.id, {
      name: `Indicated Updated ${uniqueSlug()}`,
      deviceTypeId: otherType.id,
      capabilityItemId: other.item.id,
      uomId: otherUom.id,
    });
    expect(updated.deviceTypeId).toBe(otherType.id);
    expect(updated.capabilityItemId).toBe(other.item.id);
    expect(updated.code).toBe(created.code);

    const removed = await service.remove(created.id);
    expect(removed.id).toBe(created.id);
    createdParameterIds.splice(createdParameterIds.indexOf(created.id), 1);

    await expect(service.findOne(created.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects update of unknown id", async () => {
    await expect(service.findOne("missing-dcp-id")).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.update("missing-dcp-id", { name: "Nope" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects renaming onto an existing name for the same device type and capability item", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();
    const first = await service.create(baseInput(deviceType.id, item.id, uom.id, "First"));
    const second = await service.create(baseInput(deviceType.id, item.id, uom.id, "Second"));
    createdParameterIds.push(first.id, second.id);

    await expect(service.update(second.id, { name: "First" })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe("DeviceCalibrationParametersService — decimalPlaces", () => {
  it("persists decimalPlaces on create and clears it on update", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();
    const parameter = await service.create({
      ...baseInput(deviceType.id, item.id, uom.id, "Mean"),
      decimalPlaces: 5,
    });
    createdParameterIds.push(parameter.id);
    expect(parameter.decimalPlaces).toBe(5);

    const cleared = await service.update(parameter.id, { decimalPlaces: null });
    expect(cleared.decimalPlaces).toBeNull();
  });

  it("rejects decimalPlaces outside 0..10 at the schema layer", () => {
    const base = {
      deviceTypeId: "type-1",
      capabilityItemId: "item-1",
      name: "Named",
      uomId: "uom-1",
    };
    expect(deviceCalibrationParameterCreateSchema.safeParse({ ...base, decimalPlaces: 11 }).success).toBe(false);
    expect(deviceCalibrationParameterCreateSchema.safeParse({ ...base, decimalPlaces: 5 }).success).toBe(true);
  });
});

describe("DeviceCalibrationParametersService.findAllGroupedByDeviceType", () => {
  it("groups parameters under their device type and honours search", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();
    const marker = uniqueSlug();
    const a = await service.create(baseInput(deviceType.id, item.id, uom.id, `Grouped ${marker} A`));
    const b = await service.create(baseInput(deviceType.id, item.id, uom.id, `Grouped ${marker} B`));
    createdParameterIds.push(a.id, b.id);

    const grouped = await service.findAllGroupedByDeviceType({ search: marker });
    const group = grouped.data.find((g) => g.deviceType.id === deviceType.id);
    expect(group?.count).toBe(2);
    expect(group?.categoryName).toBe("Test Category");
    expect(grouped.totalParameters).toBe(2);
  });

  it("groups parameters by capability and orders both levels by persisted sortOrder", async () => {
    const deviceType = await createDeviceType();
    const uom = await createUom();
    const marker = uniqueSlug();

    // Names chosen so alphabetical order is the REVERSE of creation order.
    const zCap = await capabilitiesService.create({ name: `Z env ${marker}` });
    const aCap = await capabilitiesService.create({ name: `A safety ${marker}` });
    createdCapabilityIds.push(zCap.id, aCap.id);
    const zItem = await capabilitiesService.createItem(zCap.id, { name: "Z Item" });
    const aItem = await capabilitiesService.createItem(aCap.id, { name: "A Item" });
    createdItemIds.push(zItem.id, aItem.id);

    const p1 = await service.create(baseInput(deviceType.id, zItem.id, uom.id, `${marker} zzz first`));
    const p2 = await service.create(baseInput(deviceType.id, zItem.id, uom.id, `${marker} aaa second`));
    const p3 = await service.create(baseInput(deviceType.id, aItem.id, uom.id, `${marker} mmm third`));
    createdParameterIds.push(p1.id, p2.id, p3.id);

    const grouped = await service.findAllGroupedByDeviceType({ search: marker });
    const group = grouped.data.find((g) => g.deviceType.id === deviceType.id)!;

    // Capabilities in creation order (zCap, aCap) — not alphabetical (aCap, zCap).
    expect(group.capabilities.map((c) => c.capability.id)).toEqual([zCap.id, aCap.id]);
    // Parameters inside a capability in creation order — not alphabetical.
    expect(group.capabilities[0].parameters.map((p) => p.id)).toEqual([p1.id, p2.id]);
    // Flat list is the concatenation of the ordered capability groups.
    expect(group.parameters.map((p) => p.id)).toEqual([p1.id, p2.id, p3.id]);
  });
});

describe("DeviceCalibrationParametersService — reorderCapabilities / reorderParameters", () => {
  async function seedTwoCapabilities() {
    const deviceType = await createDeviceType();
    const uom = await createUom();
    const marker = uniqueSlug();
    const capA = await capabilitiesService.create({ name: `Cap A ${marker}` });
    const capB = await capabilitiesService.create({ name: `Cap B ${marker}` });
    createdCapabilityIds.push(capA.id, capB.id);
    const itemA = await capabilitiesService.createItem(capA.id, { name: "Item A" });
    const itemB = await capabilitiesService.createItem(capB.id, { name: "Item B" });
    createdItemIds.push(itemA.id, itemB.id);
    const a1 = await service.create(baseInput(deviceType.id, itemA.id, uom.id, `${marker} A1`));
    const a2 = await service.create(baseInput(deviceType.id, itemA.id, uom.id, `${marker} A2`));
    const a3 = await service.create(baseInput(deviceType.id, itemA.id, uom.id, `${marker} A3`));
    const b1 = await service.create(baseInput(deviceType.id, itemB.id, uom.id, `${marker} B1`));
    createdParameterIds.push(a1.id, a2.id, a3.id, b1.id);
    return { deviceType, uom, marker, capA, capB, itemA, itemB, a1, a2, a3, b1 };
  }

  function group(grouped: Awaited<ReturnType<typeof service.findAllGroupedByDeviceType>>, id: string) {
    return grouped.data.find((g) => g.deviceType.id === id)!;
  }

  it("persists a new capability order for the device type", async () => {
    const { deviceType, marker, capA, capB } = await seedTwoCapabilities();
    await service.reorderCapabilities(deviceType.id, [capB.id, capA.id]);
    const g = group(await service.findAllGroupedByDeviceType({ search: marker }), deviceType.id);
    expect(g.capabilities.map((c) => c.capability.id)).toEqual([capB.id, capA.id]);
  });

  it("persists a new parameter order within a capability", async () => {
    const { deviceType, marker, capA, a1, a2, a3 } = await seedTwoCapabilities();
    await service.reorderParameters(deviceType.id, capA.id, [a3.id, a1.id, a2.id]);
    const g = group(await service.findAllGroupedByDeviceType({ search: marker }), deviceType.id);
    const capAGroup = g.capabilities.find((c) => c.capability.id === capA.id)!;
    expect(capAGroup.parameters.map((p) => p.id)).toEqual([a3.id, a1.id, a2.id]);
  });

  it("survives a re-read (order is DB-backed, not in-memory)", async () => {
    const { deviceType, marker, capA, capB, a1, a2, a3 } = await seedTwoCapabilities();
    await service.reorderCapabilities(deviceType.id, [capB.id, capA.id]);
    await service.reorderParameters(deviceType.id, capA.id, [a2.id, a3.id, a1.id]);
    const first = group(await service.findAllGroupedByDeviceType({ search: marker }), deviceType.id);
    const second = group(await service.findAllGroupedByDeviceType({ search: marker }), deviceType.id);
    expect(first.parameters.map((p) => p.id)).toEqual(second.parameters.map((p) => p.id));
    expect(second.capabilities.map((c) => c.capability.id)).toEqual([capB.id, capA.id]);
  });

  it("rejects a capability id from another device type", async () => {
    const first = await seedTwoCapabilities();
    const second = await seedTwoCapabilities();
    await expect(
      service.reorderCapabilities(first.deviceType.id, [first.capA.id, second.capB.id]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a parameter id from another capability", async () => {
    const { deviceType, capA, a1, a2, a3, b1 } = await seedTwoCapabilities();
    await expect(
      service.reorderParameters(deviceType.id, capA.id, [a1.id, a2.id, a3.id, b1.id]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an incomplete or duplicated id list", async () => {
    const { deviceType, capA, a1, a2 } = await seedTwoCapabilities();
    await expect(
      service.reorderParameters(deviceType.id, capA.id, [a1.id, a2.id]),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.reorderParameters(deviceType.id, capA.id, [a1.id, a1.id, a2.id]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("appends a newly added capability to the end of the order", async () => {
    const { deviceType, uom, marker, capA, capB } = await seedTwoCapabilities();
    await service.reorderCapabilities(deviceType.id, [capB.id, capA.id]);
    const capC = await capabilitiesService.create({ name: `Cap C ${marker}` });
    createdCapabilityIds.push(capC.id);
    const itemC = await capabilitiesService.createItem(capC.id, { name: "Item C" });
    createdItemIds.push(itemC.id);
    const c1 = await service.create(baseInput(deviceType.id, itemC.id, uom.id, `${marker} C1`));
    createdParameterIds.push(c1.id);
    const g = group(await service.findAllGroupedByDeviceType({ search: marker }), deviceType.id);
    expect(g.capabilities.map((c) => c.capability.id)).toEqual([capB.id, capA.id, capC.id]);
  });

  it("appends a newly added parameter to the end of its capability", async () => {
    const { deviceType, uom, marker, capA, itemA, a1, a2, a3 } = await seedTwoCapabilities();
    await service.reorderParameters(deviceType.id, capA.id, [a3.id, a2.id, a1.id]);
    const a4 = await service.create(baseInput(deviceType.id, itemA.id, uom.id, `${marker} A4`));
    createdParameterIds.push(a4.id);
    const g = group(await service.findAllGroupedByDeviceType({ search: marker }), deviceType.id);
    const capAGroup = g.capabilities.find((c) => c.capability.id === capA.id)!;
    expect(capAGroup.parameters.map((p) => p.id)).toEqual([a3.id, a2.id, a1.id, a4.id]);
  });

  it("keeps a deterministic order after a delete (sortOrder gaps are allowed)", async () => {
    const { deviceType, marker, capA, a1, a2, a3 } = await seedTwoCapabilities();
    await service.reorderParameters(deviceType.id, capA.id, [a1.id, a2.id, a3.id]);
    await service.remove(a2.id);
    createdParameterIds.splice(createdParameterIds.indexOf(a2.id), 1);
    const g = group(await service.findAllGroupedByDeviceType({ search: marker }), deviceType.id);
    const capAGroup = g.capabilities.find((c) => c.capability.id === capA.id)!;
    expect(capAGroup.parameters.map((p) => p.id)).toEqual([a1.id, a3.id]);
  });

  it("Bed Side Monitor: reorder produces the manual worksheet sequence", async () => {
    const deviceType = await createDeviceType();
    const uom = await createUom();
    const marker = uniqueSlug();
    const capabilityNames = [
      "Pengukuran Kondisi Lingkungan",
      "Pemeriksaan Kondisi Fisik dan Fungsi",
      "Pengukuran Keselamatan Listrik",
      "Kinerja Peralatan",
    ];
    const caps: { id: string; itemId: string }[] = [];
    for (const name of capabilityNames) {
      const capability = await capabilitiesService.create({ name: `${name} ${marker}` });
      createdCapabilityIds.push(capability.id);
      const item = await capabilitiesService.createItem(capability.id, { name: `${name} item` });
      createdItemIds.push(item.id);
      caps.push({ id: capability.id, itemId: item.id });
    }

    const electricalParamNames = [
      "Resistansi Pembumian Protektif",
      "Resistansi Isolasi",
      "Arus Bocor Peralatan",
      "Arus Bocor bagian yang diaplikasikan",
    ];
    const electricalIds: Record<string, string> = {};
    for (const i of [3, 1, 0, 2]) {
      // scrambled insert order
      const row = await service.create(
        baseInput(deviceType.id, caps[2].itemId, uom.id, `${electricalParamNames[i]} ${marker}`),
      );
      createdParameterIds.push(row.id);
      electricalIds[electricalParamNames[i]] = row.id;
    }
    for (const idx of [0, 1, 3]) {
      const row = await service.create(
        baseInput(deviceType.id, caps[idx].itemId, uom.id, `placeholder ${idx} ${marker}`),
      );
      createdParameterIds.push(row.id);
    }

    await service.reorderCapabilities(
      deviceType.id,
      caps.map((c) => c.id),
    );
    await service.reorderParameters(
      deviceType.id,
      caps[2].id,
      electricalParamNames.map((name) => electricalIds[name]),
    );

    const g = group(await service.findAllGroupedByDeviceType({ search: marker }), deviceType.id);
    expect(g.capabilities.map((c) => c.capability.name)).toEqual(
      capabilityNames.map((name) => `${name} ${marker}`),
    );
    const electrical = g.capabilities.find((c) => c.capability.id === caps[2].id)!;
    expect(electrical.parameters.map((p) => p.name)).toEqual(
      electricalParamNames.map((name) => `${name} ${marker}`),
    );
  });
});

describe("DeviceCapabilitiesService.removeItem with calibration parameters", () => {
  it("rejects deleting a capability item that still has calibration parameters", async () => {
    const deviceType = await createDeviceType();
    const { capability, item } = await createCapabilityItem();
    const uom = await createUom();
    const parameter = await service.create(
      baseInput(deviceType.id, item.id, uom.id, "Blocked Delete"),
    );
    createdParameterIds.push(parameter.id);

    await expect(capabilitiesService.removeItem(capability.id, item.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

// ── Phase 4A (Gap A) — logical-test grouping on the catalog row ──────────────
// Presentation metadata only: it never reaches MeasurementResult. A parameter is
// either fully grouped or fully standalone, and two parameters of one device type
// may not claim the same position in the same logical test.

describe("deviceCalibrationParameterCreateSchema — logical test grouping", () => {
  const base = {
    deviceTypeId: "dt-1",
    capabilityItemId: "ci-1",
    uomId: "uom-1",
    name: "Reproduksibilitas kV",
  };

  it("accepts a fully declared pair", () => {
    const parsed = deviceCalibrationParameterCreateSchema.safeParse({
      ...base,
      logicalTestKey: "dxray-repro",
      logicalTestSequence: 1,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a payload with no grouping at all (legacy shape)", () => {
    expect(deviceCalibrationParameterCreateSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a key without a sequence", () => {
    const parsed = deviceCalibrationParameterCreateSchema.safeParse({
      ...base,
      logicalTestKey: "dxray-repro",
      logicalTestSequence: null,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a sequence without a key", () => {
    const parsed = deviceCalibrationParameterCreateSchema.safeParse({
      ...base,
      logicalTestKey: null,
      logicalTestSequence: 2,
    });
    expect(parsed.success).toBe(false);
  });

  it("coerces an empty key to null so a blank form field means standalone", () => {
    const parsed = deviceCalibrationParameterCreateSchema.safeParse({
      ...base,
      logicalTestKey: "   ",
      logicalTestSequence: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.logicalTestKey).toBeNull();
      expect(parsed.data.logicalTestSequence).toBeNull();
    }
  });

  it("rejects a sequence below 1", () => {
    const parsed = deviceCalibrationParameterCreateSchema.safeParse({
      ...base,
      logicalTestKey: "dxray-repro",
      logicalTestSequence: 0,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("DeviceCalibrationParametersService — logical test grouping", () => {
  it("persists the pair on create and leaves it NULL when not supplied", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();

    const grouped = await service.create({
      ...baseInput(deviceType.id, item.id, uom.id, "Reproduksibilitas kV"),
      logicalTestKey: "dxray-repro",
      logicalTestSequence: 1,
    });
    createdParameterIds.push(grouped.id);
    const standalone = await service.create(
      baseInput(deviceType.id, item.id, uom.id, "Kolimasi"),
    );
    createdParameterIds.push(standalone.id);

    expect(grouped.logicalTestKey).toBe("dxray-repro");
    expect(grouped.logicalTestSequence).toBe(1);
    expect(standalone.logicalTestKey).toBeNull();
    expect(standalone.logicalTestSequence).toBeNull();
  });

  it("rejects a half-declared pair on create", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();

    await expect(
      service.create({
        ...baseInput(deviceType.id, item.id, uom.id, "Half declared"),
        logicalTestKey: "dxray-repro",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects two parameters claiming the same position in the same logical test", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();

    const first = await service.create({
      ...baseInput(deviceType.id, item.id, uom.id, "Reproduksibilitas kV"),
      logicalTestKey: "dxray-repro",
      logicalTestSequence: 1,
    });
    createdParameterIds.push(first.id);

    await expect(
      service.create({
        ...baseInput(deviceType.id, item.id, uom.id, "Reproduksibilitas s"),
        logicalTestKey: "dxray-repro",
        logicalTestSequence: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("allows the same logical test position under a different device type", async () => {
    const typeA = await createDeviceType();
    const typeB = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();

    const a = await service.create({
      ...baseInput(typeA.id, item.id, uom.id, "Reproduksibilitas kV"),
      logicalTestKey: "dxray-repro",
      logicalTestSequence: 1,
    });
    createdParameterIds.push(a.id);
    const b = await service.create({
      ...baseInput(typeB.id, item.id, uom.id, "Reproduksibilitas kV"),
      logicalTestKey: "dxray-repro",
      logicalTestSequence: 1,
    });
    createdParameterIds.push(b.id);

    expect(b.logicalTestSequence).toBe(1);
  });

  it("clears the grouping on update when both halves are set to null", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();

    const created = await service.create({
      ...baseInput(deviceType.id, item.id, uom.id, "Reproduksibilitas mGy"),
      logicalTestKey: "dxray-repro",
      logicalTestSequence: 3,
    });
    createdParameterIds.push(created.id);

    const cleared = await service.update(created.id, {
      logicalTestKey: null,
      logicalTestSequence: null,
    });
    expect(cleared.logicalTestKey).toBeNull();
    expect(cleared.logicalTestSequence).toBeNull();
  });

  it("rejects an update that would leave only one half of the pair set", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();

    const created = await service.create({
      ...baseInput(deviceType.id, item.id, uom.id, "Reproduksibilitas s"),
      logicalTestKey: "dxray-repro",
      logicalTestSequence: 2,
    });
    createdParameterIds.push(created.id);

    await expect(
      service.update(created.id, { logicalTestSequence: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("does not carry the grouping through copy — the copied row lands standalone", async () => {
    const source = await createDeviceType();
    const target = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();

    const created = await service.create({
      ...baseInput(source.id, item.id, uom.id, "Reproduksibilitas kV"),
      logicalTestKey: "dxray-repro",
      logicalTestSequence: 1,
    });
    createdParameterIds.push(created.id);

    const result = await service.copy({
      sourceDeviceTypeId: source.id,
      targetDeviceTypeId: target.id,
      parameterIds: [created.id],
    });
    expect(result.created).toHaveLength(1);

    const copied = await prisma.deviceCalibrationParameter.findUniqueOrThrow({
      where: { id: result.created[0]!.id },
    });
    expect(copied.logicalTestKey).toBeNull();
    expect(copied.logicalTestSequence).toBeNull();
  });
});


// ── Phase 4B (Gap B) — derived / aggregate measurements, B1 minimum ─────────
// entryStyle DERIVED + descriptive-only `derivation`. No formula engine, no
// automatic calculation — a derived value is still an ordinary
// DeviceCalibrationParameter / MeasurementResult, distinguished only by its
// catalog entryStyle. `derivation` is validated purely as a shape (an object
// with a single `description` string); its CONTENT is never interpreted.

describe("deviceCalibrationParameterCreateSchema — entryStyle / derivation", () => {
  const base = {
    deviceTypeId: "dt-1",
    capabilityItemId: "ci-1",
    uomId: "uom-1",
    name: "Selisih Suhu",
  };

  it("accepts entryStyle DIRECT_REPLICATES and DERIVED", () => {
    expect(
      deviceCalibrationParameterCreateSchema.safeParse({ ...base, entryStyle: "DIRECT_REPLICATES" })
        .success,
    ).toBe(true);
    expect(
      deviceCalibrationParameterCreateSchema.safeParse({ ...base, entryStyle: "DERIVED" }).success,
    ).toBe(true);
  });

  it("omits entryStyle entirely (still valid, service defaults to DIRECT_REPLICATES)", () => {
    expect(deviceCalibrationParameterCreateSchema.safeParse(base).success).toBe(true);
  });

  it("rejects LOGGER_SUMMARY (not settable through the API)", () => {
    const parsed = deviceCalibrationParameterCreateSchema.safeParse({
      ...base,
      entryStyle: "LOGGER_SUMMARY",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a derivation note shaped as an object with a description", () => {
    const parsed = deviceCalibrationParameterCreateSchema.safeParse({
      ...base,
      entryStyle: "DERIVED",
      derivation: { description: "Difference between S1 and S3" },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.derivation).toEqual({ description: "Difference between S1 and S3" });
    }
  });

  it("rejects a derivation with an unknown key (not a formula language)", () => {
    const parsed = deviceCalibrationParameterCreateSchema.safeParse({
      ...base,
      entryStyle: "DERIVED",
      derivation: { description: "x", formula: "S1 - S3" },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a derivation missing description", () => {
    const parsed = deviceCalibrationParameterCreateSchema.safeParse({
      ...base,
      entryStyle: "DERIVED",
      derivation: {},
    });
    expect(parsed.success).toBe(false);
  });

  it("coerces null/omitted derivation to null", () => {
    const parsed = deviceCalibrationParameterCreateSchema.safeParse({
      ...base,
      derivation: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.derivation).toBeNull();
  });
});

describe("DeviceCalibrationParametersService - entryStyle / derivation", () => {
  it("defaults entryStyle to DIRECT_REPLICATES and derivation to null when omitted", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();

    const created = await service.create(baseInput(deviceType.id, item.id, uom.id, "Suhu Chamber"));
    createdParameterIds.push(created.id);

    expect(created.entryStyle).toBe("DIRECT_REPLICATES");
    expect(created.derivation).toBeNull();
  });

  it("persists entryStyle DERIVED with a derivation note", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();

    const created = await service.create({
      ...baseInput(deviceType.id, item.id, uom.id, "Selisih Suhu"),
      entryStyle: "DERIVED",
      derivation: { description: "Difference between S1 and S3" },
    });
    createdParameterIds.push(created.id);

    expect(created.entryStyle).toBe("DERIVED");
    expect(created.derivation).toEqual({ description: "Difference between S1 and S3" });
  });

  it("allows DERIVED with no derivation note at all", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();

    const created = await service.create({
      ...baseInput(deviceType.id, item.id, uom.id, "Rasio Pembesaran"),
      entryStyle: "DERIVED",
    });
    createdParameterIds.push(created.id);

    expect(created.entryStyle).toBe("DERIVED");
    expect(created.derivation).toBeNull();
  });

  it("rejects a derivation note on a non-DERIVED (default) parameter", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();

    await expect(
      service.create({
        ...baseInput(deviceType.id, item.id, uom.id, "Suhu"),
        derivation: { description: "should not be allowed here" },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a derivation note explicitly paired with entryStyle DIRECT_REPLICATES", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();

    await expect(
      service.create({
        ...baseInput(deviceType.id, item.id, uom.id, "Suhu"),
        entryStyle: "DIRECT_REPLICATES",
        derivation: { description: "should not be allowed here" },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("flips an existing parameter from DIRECT_REPLICATES to DERIVED with a note", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();

    const created = await service.create(
      baseInput(deviceType.id, item.id, uom.id, "Selisih Waktu"),
    );
    createdParameterIds.push(created.id);

    const updated = await service.update(created.id, {
      entryStyle: "DERIVED",
      derivation: { description: "Difference between two timestamps" },
    });

    expect(updated.entryStyle).toBe("DERIVED");
    expect(updated.derivation).toEqual({ description: "Difference between two timestamps" });
  });

  it("clears the derivation note while staying DERIVED", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();

    const created = await service.create({
      ...baseInput(deviceType.id, item.id, uom.id, "Rasio"),
      entryStyle: "DERIVED",
      derivation: { description: "initial note" },
    });
    createdParameterIds.push(created.id);

    const updated = await service.update(created.id, { derivation: null });

    expect(updated.entryStyle).toBe("DERIVED");
    expect(updated.derivation).toBeNull();
  });

  it("rejects flipping back to DIRECT_REPLICATES while leaving a stale derivation note in place", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();

    const created = await service.create({
      ...baseInput(deviceType.id, item.id, uom.id, "Selisih Tekanan"),
      entryStyle: "DERIVED",
      derivation: { description: "initial note" },
    });
    createdParameterIds.push(created.id);

    await expect(
      service.update(created.id, { entryStyle: "DIRECT_REPLICATES" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("allows flipping back to DIRECT_REPLICATES when the note is cleared in the same request", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();

    const created = await service.create({
      ...baseInput(deviceType.id, item.id, uom.id, "Selisih Tekanan 2"),
      entryStyle: "DERIVED",
      derivation: { description: "initial note" },
    });
    createdParameterIds.push(created.id);

    const updated = await service.update(created.id, {
      entryStyle: "DIRECT_REPLICATES",
      derivation: null,
    });

    expect(updated.entryStyle).toBe("DIRECT_REPLICATES");
    expect(updated.derivation).toBeNull();
  });

  it("leaves entryStyle and derivation untouched when an unrelated field is updated", async () => {
    const deviceType = await createDeviceType();
    const { item } = await createCapabilityItem();
    const uom = await createUom();

    const created = await service.create({
      ...baseInput(deviceType.id, item.id, uom.id, "Selisih Berat"),
      entryStyle: "DERIVED",
      derivation: { description: "kept as-is" },
    });
    createdParameterIds.push(created.id);

    const updated = await service.update(created.id, { toleranceNote: "+/- 2" });

    expect(updated.entryStyle).toBe("DERIVED");
    expect(updated.derivation).toEqual({ description: "kept as-is" });
    expect(updated.toleranceNote).toBe("+/- 2");
  });
});
