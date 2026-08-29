import { randomUUID } from "node:crypto";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { EquipmentService } from "./equipment.service";

const service = new EquipmentService();
const realCompanyId = "PKM";

function uniqueCode() {
  return `EQ${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}
function companyId() {
  return `C${randomUUID().replace(/[^A-Z0-9]/gi, "").slice(0, 2).toUpperCase()}`;
}

let equipmentTypeAId: string;
let equipmentTypeBId: string;
const createdEquipmentIds: string[] = [];
const createdEquipmentTypeIds: string[] = [];
const createdCompanyIds: string[] = [];

beforeAll(async () => {
  const [etA, etB] = await Promise.all([
    prisma.equipmentType.create({ data: { code: uniqueCode(), name: "Eq Electrical Safety Analyzer" } }),
    prisma.equipmentType.create({ data: { code: uniqueCode(), name: "Eq Vital Signs Simulator" } }),
  ]);
  equipmentTypeAId = etA.id;
  equipmentTypeBId = etB.id;
  createdEquipmentTypeIds.push(etA.id, etB.id);
});

afterAll(async () => {
  if (createdEquipmentIds.length > 0) {
    await prisma.equipment.deleteMany({ where: { id: { in: createdEquipmentIds } } });
  }
  if (createdEquipmentTypeIds.length > 0) {
    await prisma.equipment.deleteMany({
      where: { equipmentTypeId: { in: createdEquipmentTypeIds } },
    });
    await prisma.equipmentType.deleteMany({ where: { id: { in: createdEquipmentTypeIds } } });
  }
  for (const id of createdCompanyIds) {
    await prisma.company.delete({ where: { id } }).catch(() => undefined);
  }
});

describe("EquipmentService.create", () => {
  it("creates a physical equipment unit linked to an EquipmentType, serialNumber nullable", async () => {
    const code = uniqueCode();
    const created = await service.create(realCompanyId, {
      equipmentTypeId: equipmentTypeAId,
      code,
      brand: "Fluke",
      model: "ESA620",
      // no serialNumber
      notes: "Lab unit",
    });
    createdEquipmentIds.push(created.id);

    expect(created.companyId).toBe(realCompanyId);
    expect(created.code).toBe(code);
    expect(created.equipmentType.id).toBe(equipmentTypeAId);
    expect(created.serialNumber).toBeNull();
    expect(created.isActive).toBe(true);
  });

  it("rejects an unknown equipmentTypeId", async () => {
    await expect(
      service.create(realCompanyId, { equipmentTypeId: "missing", code: uniqueCode() }),
    ).rejects.toBeInstanceOf(Error);
  });

  it("rejects a duplicate code within the same company", async () => {
    const code = uniqueCode();
    const first = await service.create(realCompanyId, { equipmentTypeId: equipmentTypeAId, code });
    createdEquipmentIds.push(first.id);

    await expect(
      service.create(realCompanyId, { equipmentTypeId: equipmentTypeBId, code }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("allows the same code in a different company (company-scoped uniqueness)", async () => {
    const otherCompanyId = companyId();
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Eq Other Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);

    const code = uniqueCode();
    const a = await service.create(realCompanyId, { equipmentTypeId: equipmentTypeAId, code });
    const b = await service.create(otherCompanyId, { equipmentTypeId: equipmentTypeAId, code });
    createdEquipmentIds.push(a.id, b.id);

    expect(a.code).toBe(b.code);
    expect(a.companyId).not.toBe(b.companyId);
  });
});

describe("EquipmentService.findAll / findOne / update / remove", () => {
  it("lists (company-scoped), searches, reads, updates, deactivates, deletes", async () => {
    const code = uniqueCode();
    const created = await service.create(realCompanyId, {
      equipmentTypeId: equipmentTypeBId,
      code,
      serialNumber: "SN-XYZ-1",
    });
    createdEquipmentIds.push(created.id);

    const bySerial = await service.findAll(realCompanyId, {
      search: "SN-XYZ-1",
      page: 1,
      pageSize: 10,
    });
    expect(bySerial.data.some((r) => r.id === created.id)).toBe(true);

    const found = await service.findOne(realCompanyId, created.id);
    expect(found.code).toBe(code);

    const updated = await service.update(realCompanyId, created.id, {
      brand: "TFA",
      isActive: false,
    });
    expect(updated.brand).toBe("TFA");
    expect(updated.isActive).toBe(false);

    const removed = await service.remove(realCompanyId, created.id);
    expect(removed.id).toBe(created.id);
    createdEquipmentIds.splice(createdEquipmentIds.indexOf(created.id), 1);
    await expect(service.findOne(realCompanyId, created.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("does not expose or mutate equipment from another company", async () => {
    const otherCompanyId = companyId();
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Eq Foreign Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);

    const foreign = await service.create(otherCompanyId, {
      equipmentTypeId: equipmentTypeAId,
      code: uniqueCode(),
    });
    createdEquipmentIds.push(foreign.id);

    const listed = await service.findAll(realCompanyId, { page: 1, pageSize: 100 });
    expect(listed.data.some((r) => r.id === foreign.id)).toBe(false);

    await expect(service.findOne(realCompanyId, foreign.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.update(realCompanyId, foreign.id, { brand: "hijack" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
