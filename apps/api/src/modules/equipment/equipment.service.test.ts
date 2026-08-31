import { randomUUID } from "node:crypto";
import { NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { equipmentCreateSchema, equipmentUpdateSchema } from "@medcal/shared";
import { EquipmentService } from "./equipment.service";

const service = new EquipmentService();
const realCompanyId = "PKM";

function uniqueTypeCode() {
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
    prisma.equipmentType.create({
      data: { code: uniqueTypeCode(), name: "Eq Electrical Safety Analyzer" },
    }),
    prisma.equipmentType.create({
      data: { code: uniqueTypeCode(), name: "Eq Vital Signs Simulator" },
    }),
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
    await prisma.masterCodeSequence
      .deleteMany({ where: { scope: `EQUIPMENT#${id}` } })
      .catch(() => undefined);
    await prisma.company.delete({ where: { id } }).catch(() => undefined);
  }
});

describe("equipmentCreateSchema / equipmentUpdateSchema", () => {
  it("does not accept a code on create — it is system-issued", () => {
    const parsed = equipmentCreateSchema.parse({ equipmentTypeId: "et-1", code: "HACK-001" });
    expect("code" in parsed).toBe(false);
  });

  it("strips a code on update — code is immutable", () => {
    const parsed = equipmentUpdateSchema.parse({ brand: "x", code: "HACK-001" });
    expect("code" in parsed).toBe(false);
  });
});

describe("EquipmentService.create", () => {
  it("creates a unit with a system-issued EQU- code; serialNumber nullable", async () => {
    const created = await service.create(realCompanyId, {
      equipmentTypeId: equipmentTypeAId,
      brand: "Fluke",
      model: "ESA620",
      // no serialNumber
      notes: "Lab unit",
    });
    createdEquipmentIds.push(created.id);

    expect(created.companyId).toBe(realCompanyId);
    expect(created.code).toMatch(/^EQU-\d{6}$/);
    expect(created.equipmentType.id).toBe(equipmentTypeAId);
    expect(created.serialNumber).toBeNull();
    expect(created.isActive).toBe(true);
  });

  it("rejects an unknown equipmentTypeId", async () => {
    await expect(
      service.create(realCompanyId, { equipmentTypeId: "missing" }),
    ).rejects.toBeInstanceOf(Error);
  });

  it("allocates sequential codes within a company and independent sequences per company", async () => {
    const otherCompanyId = companyId();
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Eq Other Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);
    // Guard against a stale counter row from a prior crashed run (random 2-char ids collide).
    await prisma.masterCodeSequence.deleteMany({ where: { scope: `EQUIPMENT#${otherCompanyId}` } });

    const a1 = await service.create(realCompanyId, { equipmentTypeId: equipmentTypeAId });
    const a2 = await service.create(realCompanyId, { equipmentTypeId: equipmentTypeBId });
    const b1 = await service.create(otherCompanyId, { equipmentTypeId: equipmentTypeAId });
    createdEquipmentIds.push(a1.id, a2.id, b1.id);

    // Same company → strictly increasing (exact +1 is not guaranteed when other
    // test files share the realCompanyId counter under parallel execution).
    expect(a2.code).toMatch(/^EQU-\d{6}$/);
    expect(Number(a2.code.slice(4))).toBeGreaterThan(Number(a1.code.slice(4)));
    // Fresh company → its own independent sequence.
    expect(b1.code).toBe("EQU-000001");
    expect(a1.companyId).not.toBe(b1.companyId);
  });
});

describe("EquipmentService.findAll / findOne / update / remove", () => {
  it("lists (company-scoped), searches, reads, updates, deactivates, deletes", async () => {
    const created = await service.create(realCompanyId, {
      equipmentTypeId: equipmentTypeBId,
      serialNumber: "SN-XYZ-1",
    });
    createdEquipmentIds.push(created.id);

    const bySerial = await service.findAll(realCompanyId, {
      search: "SN-XYZ-1",
      page: 1,
      pageSize: 10,
    });
    expect(bySerial.data.some((r) => r.id === created.id)).toBe(true);

    const byCode = await service.findAll(realCompanyId, {
      search: created.code,
      page: 1,
      pageSize: 10,
    });
    expect(byCode.data.some((r) => r.id === created.id)).toBe(true);

    const found = await service.findOne(realCompanyId, created.id);
    expect(found.code).toBe(created.code);

    const updated = await service.update(realCompanyId, created.id, {
      brand: "TFA",
      isActive: false,
    });
    expect(updated.brand).toBe("TFA");
    expect(updated.isActive).toBe(false);
    expect(updated.code).toBe(created.code);

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
