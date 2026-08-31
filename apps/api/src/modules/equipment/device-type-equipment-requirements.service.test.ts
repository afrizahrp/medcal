import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { DeviceTypeEquipmentRequirementsService } from "./device-type-equipment-requirements.service";

const service = new DeviceTypeEquipmentRequirementsService();

function uniqueCode() {
  return `ER${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

let categoryId: string;
let deviceTypeAId: string;
let deviceTypeBId: string;
let equipmentTypeAId: string;
let equipmentTypeBId: string;
const createdRequirementIds: string[] = [];
const extraEquipmentTypeIds: string[] = [];

beforeAll(async () => {
  const category = await prisma.deviceCategory.create({
    data: { code: uniqueCode(), name: "Req Test Category" },
  });
  categoryId = category.id;
  const [dtA, dtB] = await Promise.all([
    prisma.deviceType.create({
      data: { categoryId, code: uniqueCode(), name: "Req Bed Side Monitor" },
    }),
    prisma.deviceType.create({
      data: { categoryId, code: uniqueCode(), name: "Req Dental Unit" },
    }),
  ]);
  deviceTypeAId = dtA.id;
  deviceTypeBId = dtB.id;
  const [etA, etB] = await Promise.all([
    prisma.equipmentType.create({
      data: { code: uniqueCode(), name: "Req Vital Signs Simulator" },
    }),
    prisma.equipmentType.create({
      data: { code: uniqueCode(), name: "Req Electrical Safety Analyzer" },
    }),
  ]);
  equipmentTypeAId = etA.id;
  equipmentTypeBId = etB.id;
});

afterAll(async () => {
  await prisma.deviceTypeEquipmentRequirement.deleteMany({
    where: { deviceType: { categoryId } },
  });
  await prisma.equipmentType.deleteMany({
    where: { id: { in: [equipmentTypeAId, equipmentTypeBId, ...extraEquipmentTypeIds] } },
  });
  await prisma.deviceType.deleteMany({ where: { categoryId } });
  await prisma.deviceCategory.deleteMany({ where: { id: categoryId } });
});

describe("DeviceTypeEquipmentRequirementsService", () => {
  it("creates a requirement and rejects duplicates on (deviceTypeId, equipmentTypeId)", async () => {
    const created = await service.create({
      deviceTypeId: deviceTypeAId,
      equipmentTypeId: equipmentTypeAId,
      notes: "Required for vital signs",
    });
    createdRequirementIds.push(created.id);
    expect(created.deviceType.id).toBe(deviceTypeAId);
    expect(created.equipmentType.id).toBe(equipmentTypeAId);
    expect(created.notes).toBe("Required for vital signs");

    await expect(
      service.create({ deviceTypeId: deviceTypeAId, equipmentTypeId: equipmentTypeAId }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects unknown device type or equipment type", async () => {
    await expect(
      service.create({ deviceTypeId: "missing", equipmentTypeId: equipmentTypeAId }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create({ deviceTypeId: deviceTypeAId, equipmentTypeId: "missing" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("updates notes and removes a requirement", async () => {
    const created = await service.create({
      deviceTypeId: deviceTypeBId,
      equipmentTypeId: equipmentTypeBId,
    });
    const updated = await service.update(created.id, { notes: "Electrical safety tests" });
    expect(updated.notes).toBe("Electrical safety tests");

    const removed = await service.remove(created.id);
    expect(removed.id).toBe(created.id);
    await expect(service.findOne(created.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("groups requirements by device type and paginates at the group level", async () => {
    // deviceTypeA already has 1 requirement from the first test; add a second.
    const second = await service.create({
      deviceTypeId: deviceTypeAId,
      equipmentTypeId: equipmentTypeBId,
    });
    createdRequirementIds.push(second.id);

    const grouped = await service.findAllGroupedByDeviceType({ search: "Req Bed Side Monitor" });
    const group = grouped.data.find((g) => g.deviceType.id === deviceTypeAId);
    expect(group).toBeDefined();
    expect(group?.count).toBe(2);
    expect(group?.requirements).toHaveLength(2);
    expect(grouped.total).toBe(grouped.data.length);
    expect(grouped.totalRequirements).toBeGreaterThanOrEqual(2);
  });
});

describe("DeviceTypeEquipmentRequirementsService — sortOrder / reorder", () => {
  async function makeDeviceType(name: string) {
    const dt = await prisma.deviceType.create({
      data: { categoryId, code: uniqueCode(), name },
    });
    return dt.id;
  }

  async function makeEquipmentType(name: string) {
    const et = await prisma.equipmentType.create({ data: { code: uniqueCode(), name } });
    extraEquipmentTypeIds.push(et.id);
    return et.id;
  }

  async function names(deviceTypeId: string): Promise<string[]> {
    const rows = await service.findAll({ deviceTypeId });
    return rows.map((r) => r.equipmentType.name);
  }

  it("Test 1 — grouped read returns requirements in sortOrder order", async () => {
    const dt = await makeDeviceType("Ordering DT 1");
    const [a, b, c] = await Promise.all([
      makeEquipmentType("Ord A"),
      makeEquipmentType("Ord B"),
      makeEquipmentType("Ord C"),
    ]);
    const rA = await service.create({ deviceTypeId: dt, equipmentTypeId: a });
    const rB = await service.create({ deviceTypeId: dt, equipmentTypeId: b });
    const rC = await service.create({ deviceTypeId: dt, equipmentTypeId: c });

    // A=3, B=1, C=2  →  read order B, C, A
    await service.reorder(dt, [rB.id, rC.id, rA.id]);
    expect(await names(dt)).toEqual(["Ord B", "Ord C", "Ord A"]);
  });

  it("Test 2 — create appends to the end of the device type's order", async () => {
    const dt = await makeDeviceType("Ordering DT 2");
    const [a, b, c] = await Promise.all([
      makeEquipmentType("App A"),
      makeEquipmentType("App B"),
      makeEquipmentType("App C"),
    ]);
    const rA = await service.create({ deviceTypeId: dt, equipmentTypeId: a });
    const rB = await service.create({ deviceTypeId: dt, equipmentTypeId: b });
    const rC = await service.create({ deviceTypeId: dt, equipmentTypeId: c });
    expect(rA.sortOrder).toBeLessThan(rB.sortOrder);
    expect(rB.sortOrder).toBeLessThan(rC.sortOrder);
    expect(await names(dt)).toEqual(["App A", "App B", "App C"]);
  });

  it("Test 3 — reorder persists the exact requested order", async () => {
    const dt = await makeDeviceType("Ordering DT 3");
    const [a, b, c] = await Promise.all([
      makeEquipmentType("Re A"),
      makeEquipmentType("Re B"),
      makeEquipmentType("Re C"),
    ]);
    const rA = await service.create({ deviceTypeId: dt, equipmentTypeId: a });
    const rB = await service.create({ deviceTypeId: dt, equipmentTypeId: b });
    const rC = await service.create({ deviceTypeId: dt, equipmentTypeId: c });

    const out = await service.reorder(dt, [rC.id, rA.id, rB.id]);
    expect(out.map((r) => r.equipmentType.name)).toEqual(["Re C", "Re A", "Re B"]);
    expect(out.map((r) => r.sortOrder)).toEqual([10, 20, 30]);
  });

  it("Test 4 — a requirement from another device type cannot be reordered in", async () => {
    const dt1 = await makeDeviceType("Iso DT A");
    const dt2 = await makeDeviceType("Iso DT B");
    const [a, b] = await Promise.all([makeEquipmentType("Iso A"), makeEquipmentType("Iso B")]);
    const r1 = await service.create({ deviceTypeId: dt1, equipmentTypeId: a });
    const r2 = await service.create({ deviceTypeId: dt2, equipmentTypeId: b });

    await expect(service.reorder(dt1, [r1.id, r2.id])).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.reorder(dt1, [r2.id])).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.reorder(dt1, [r1.id, r1.id])).rejects.toBeInstanceOf(BadRequestException);
    // r2 stays under dt2, untouched.
    expect(await names(dt2)).toEqual(["Iso B"]);
  });

  it("Test 5 — repeating the same reorder is idempotent", async () => {
    const dt = await makeDeviceType("Idem DT");
    const [a, b, c] = await Promise.all([
      makeEquipmentType("Id A"),
      makeEquipmentType("Id B"),
      makeEquipmentType("Id C"),
    ]);
    const rA = await service.create({ deviceTypeId: dt, equipmentTypeId: a });
    const rB = await service.create({ deviceTypeId: dt, equipmentTypeId: b });
    const rC = await service.create({ deviceTypeId: dt, equipmentTypeId: c });

    const first = await service.reorder(dt, [rB.id, rC.id, rA.id]);
    const second = await service.reorder(dt, [rB.id, rC.id, rA.id]);
    expect(first.map((r) => [r.id, r.sortOrder])).toEqual(second.map((r) => [r.id, r.sortOrder]));
  });

  it("Dental Unit — reorder produces the manual worksheet sequence", async () => {
    const dt = await makeDeviceType("WS Dental Unit");
    const order = [
      "WS Tachometer for Dental",
      "WS Digital Luxmeter",
      "WS Digital Pressure Meter",
      "WS Electrical Safety Analyzer",
      "WS Thermohygrometer",
    ];
    // Create in a deliberately scrambled order.
    const scrambled = [order[3], order[0], order[4], order[2], order[1]];
    const idByName = new Map<string, string>();
    for (const name of scrambled) {
      const etId = await makeEquipmentType(name);
      const r = await service.create({ deviceTypeId: dt, equipmentTypeId: etId });
      idByName.set(name, r.id);
    }
    await service.reorder(
      dt,
      order.map((name) => idByName.get(name)!),
    );
    expect(await names(dt)).toEqual(order);
  });
});
