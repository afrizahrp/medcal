import { randomUUID } from "node:crypto";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { UomsService } from "./uoms.service";

const service = new UomsService();
const createdIds: string[] = [];

function uniqueCode() {
  return `T${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

afterAll(async () => {
  if (createdIds.length > 0) {
    await prisma.uom.deleteMany({ where: { id: { in: createdIds } } });
  }
});

describe("UomsService.create", () => {
  it("creates a UOM with required fields", async () => {
    const code = uniqueCode();
    const uom = await service.create({
      code,
      name: "Test Millimeter of Mercury",
      symbol: "mmHg",
      category: "PRESSURE",
    });
    createdIds.push(uom.id);

    expect(uom.code).toBe(code);
    expect(uom.name).toBe("Test Millimeter of Mercury");
    expect(uom.symbol).toBe("mmHg");
    expect(uom.category).toBe("PRESSURE");
    expect(uom.isActive).toBe(true);
  });

  it("rejects duplicate code", async () => {
    const code = uniqueCode();
    const first = await service.create({
      code,
      name: "First",
      symbol: "x",
      category: "OTHER",
    });
    createdIds.push(first.id);

    await expect(
      service.create({
        code,
        name: "Second",
        symbol: "y",
        category: "OTHER",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("UomsService.findAll / findOne / update", () => {
  it("lists, reads, and updates a UOM", async () => {
    const code = uniqueCode();
    const created = await service.create({
      code,
      name: "Degree Celsius",
      symbol: "°C",
      category: "TEMPERATURE",
    });
    createdIds.push(created.id);

    const listed = await service.findAll({ search: code, page: 1, pageSize: 10 });
    expect(listed.data.some((row) => row.id === created.id)).toBe(true);
    expect(listed.page).toBe(1);

    const found = await service.findOne(created.id);
    expect(found.code).toBe(code);

    const updated = await service.update(created.id, { name: "Celsius", isActive: false });
    expect(updated.name).toBe("Celsius");
    expect(updated.isActive).toBe(false);
  });

  it("rejects update of unknown id", async () => {
    await expect(service.findOne("missing-uom-id")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update("missing-uom-id", { name: "Nope" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects updating code onto an existing one", async () => {
    const first = await service.create({
      code: uniqueCode(),
      name: "First",
      symbol: "a",
      category: "OTHER",
    });
    const second = await service.create({
      code: uniqueCode(),
      name: "Second",
      symbol: "b",
      category: "OTHER",
    });
    createdIds.push(first.id, second.id);

    await expect(service.update(second.id, { code: first.code })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
