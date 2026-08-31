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
