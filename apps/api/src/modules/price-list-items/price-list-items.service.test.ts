import { randomUUID } from "node:crypto";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { PriceListItemsService } from "./price-list-items.service";

const service = new PriceListItemsService();
const companyId = "PKM";

const createdPriceListItemIds: string[] = [];
const createdDeviceTypeIds: string[] = [];
const createdDeviceCategoryIds: string[] = [];
const createdCompanyIds: string[] = [];

function rand() {
  return randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
}

async function makeDeviceType(): Promise<string> {
  const category = await prisma.deviceCategory.create({
    data: { code: `C${rand()}`, name: "PLI Test Category" },
  });
  createdDeviceCategoryIds.push(category.id);
  const deviceType = await prisma.deviceType.create({
    data: { categoryId: category.id, code: `T${rand()}`, name: `PLI Device ${rand()}` },
  });
  createdDeviceTypeIds.push(deviceType.id);
  return deviceType.id;
}

function track<T extends { id: string }>(row: T): T {
  createdPriceListItemIds.push(row.id);
  return row;
}

afterAll(async () => {
  if (createdPriceListItemIds.length > 0) {
    await prisma.priceListItem.deleteMany({ where: { id: { in: createdPriceListItemIds } } });
  }
  if (createdDeviceTypeIds.length > 0) {
    await prisma.priceListItem.deleteMany({ where: { deviceTypeId: { in: createdDeviceTypeIds } } });
    await prisma.deviceType.deleteMany({ where: { id: { in: createdDeviceTypeIds } } });
  }
  if (createdDeviceCategoryIds.length > 0) {
    await prisma.deviceCategory.deleteMany({ where: { id: { in: createdDeviceCategoryIds } } });
  }
  for (const id of createdCompanyIds) {
    await prisma.priceListItem.deleteMany({ where: { companyId: id } });
    await prisma.company.delete({ where: { id } }).catch(() => undefined);
  }
});

describe("PriceListItemsService.create (test 1 / 7)", () => {
  it("creates a tariff for a valid DeviceType", async () => {
    const deviceTypeId = await makeDeviceType();
    const row = track(
      await service.create(companyId, {
        deviceTypeId,
        unitPrice: 100_000,
        effectiveFrom: new Date("2026-01-01"),
      }),
    );
    expect(row.companyId).toBe(companyId);
    expect(Number(row.unitPrice)).toBe(100_000);
    expect(row.currency).toBe("IDR");
    expect(row.isActive).toBe(true);
    expect(row.deviceType.id).toBe(deviceTypeId);
  });

  it("rejects a non-positive price", async () => {
    const deviceTypeId = await makeDeviceType();
    await expect(
      service.create(companyId, { deviceTypeId, unitPrice: 0, effectiveFrom: new Date("2026-01-01") }),
    ).rejects.toBeDefined();
  });

  it("rejects an unknown DeviceType", async () => {
    await expect(
      service.create(companyId, {
        deviceTypeId: "does-not-exist",
        unitPrice: 1000,
        effectiveFrom: new Date("2026-01-01"),
      }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "DEVICE_TYPE_NOT_FOUND" }) });
  });

  it("rejects effectiveUntil before effectiveFrom", async () => {
    const deviceTypeId = await makeDeviceType();
    await expect(
      service.create(companyId, {
        deviceTypeId,
        unitPrice: 1000,
        effectiveFrom: new Date("2026-06-01"),
        effectiveUntil: new Date("2026-01-01"),
      }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "INVALID_EFFECTIVE_RANGE" }) });
  });
});

describe("PriceListItemsService — duplicate / overlap prevention (test 3)", () => {
  it("rejects a second tariff with the same effectiveFrom for the same key", async () => {
    const deviceTypeId = await makeDeviceType();
    track(
      await service.create(companyId, {
        deviceTypeId,
        unitPrice: 100_000,
        effectiveFrom: new Date("2026-01-01"),
      }),
    );
    await expect(
      service.create(companyId, {
        deviceTypeId,
        unitPrice: 120_000,
        effectiveFrom: new Date("2026-01-01"),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects an overlapping active window for the same key", async () => {
    const deviceTypeId = await makeDeviceType();
    track(
      await service.create(companyId, {
        deviceTypeId,
        unitPrice: 100_000,
        effectiveFrom: new Date("2026-01-01"),
        effectiveUntil: new Date("2026-06-30"),
      }),
    );
    await expect(
      service.create(companyId, {
        deviceTypeId,
        unitPrice: 130_000,
        effectiveFrom: new Date("2026-06-01"), // overlaps Jan–Jun window
      }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "PRICE_LIST_OVERLAP" }) });
  });

  it("allows a non-overlapping successor window", async () => {
    const deviceTypeId = await makeDeviceType();
    track(
      await service.create(companyId, {
        deviceTypeId,
        unitPrice: 100_000,
        effectiveFrom: new Date("2026-01-01"),
        effectiveUntil: new Date("2026-06-30"),
      }),
    );
    const next = track(
      await service.create(companyId, {
        deviceTypeId,
        unitPrice: 130_000,
        effectiveFrom: new Date("2026-07-01"),
      }),
    );
    expect(Number(next.unitPrice)).toBe(130_000);
  });

  it("ignores inactive rows when checking overlap", async () => {
    const deviceTypeId = await makeDeviceType();
    const first = track(
      await service.create(companyId, {
        deviceTypeId,
        unitPrice: 100_000,
        effectiveFrom: new Date("2026-01-01"),
      }),
    );
    await service.update(companyId, first.id, { isActive: false });
    // A new active tariff whose window overlaps the now-inactive one is allowed.
    const replacement = track(
      await service.create(companyId, {
        deviceTypeId,
        unitPrice: 150_000,
        effectiveFrom: new Date("2026-02-01"),
      }),
    );
    expect(replacement.isActive).toBe(true);
  });
});

describe("PriceListItemsService.resolve (tests 4 / 5 / 6)", () => {
  it("selects the tariff active on the given date, and keeps history resolvable", async () => {
    const deviceTypeId = await makeDeviceType();
    track(
      await service.create(companyId, {
        deviceTypeId,
        unitPrice: 100_000,
        effectiveFrom: new Date("2026-01-01"),
        effectiveUntil: new Date("2026-08-31"),
      }),
    );
    track(
      await service.create(companyId, {
        deviceTypeId,
        unitPrice: 120_000,
        effectiveFrom: new Date("2026-09-01"),
      }),
    );

    const aug = await service.resolve(companyId, deviceTypeId, new Date("2026-08-25"));
    expect(Number(aug?.unitPrice)).toBe(100_000);

    const sep = await service.resolve(companyId, deviceTypeId, new Date("2026-09-05"));
    expect(Number(sep?.unitPrice)).toBe(120_000);

    // historical date still resolves to the historical tariff
    const stillAug = await service.resolve(companyId, deviceTypeId, new Date("2026-08-25"));
    expect(Number(stillAug?.unitPrice)).toBe(100_000);
  });

  it("returns null when no active tariff covers the date", async () => {
    const deviceTypeId = await makeDeviceType();
    track(
      await service.create(companyId, {
        deviceTypeId,
        unitPrice: 100_000,
        effectiveFrom: new Date("2026-09-01"),
      }),
    );
    const before = await service.resolve(companyId, deviceTypeId, new Date("2026-01-01"));
    expect(before).toBeNull();
  });

  it("does not select an inactive tariff", async () => {
    const deviceTypeId = await makeDeviceType();
    const row = track(
      await service.create(companyId, {
        deviceTypeId,
        unitPrice: 100_000,
        effectiveFrom: new Date("2026-01-01"),
      }),
    );
    await service.update(companyId, row.id, { isActive: false });
    const resolved = await service.resolve(companyId, deviceTypeId, new Date("2026-06-01"));
    expect(resolved).toBeNull();
  });
});

describe("PriceListItemsService — company isolation (test 2)", () => {
  it("resolve is scoped to the company and findOne rejects a foreign row", async () => {
    const otherCompanyId = `P${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({ data: { id: otherCompanyId, name: "PLI Foreign", status: "ACTIVE" } });
    createdCompanyIds.push(otherCompanyId);

    const deviceTypeId = await makeDeviceType();
    const foreign = await service.create(otherCompanyId, {
      deviceTypeId,
      unitPrice: 555_000,
      effectiveFrom: new Date("2026-01-01"),
    });

    const resolvedForPkm = await service.resolve(companyId, deviceTypeId, new Date("2026-06-01"));
    expect(resolvedForPkm).toBeNull();

    await expect(service.findOne(companyId, foreign.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("PriceListItemsService.update / remove", () => {
  it("updates the unit price in place (new-row policy is a UI/service convention, not enforced here)", async () => {
    const deviceTypeId = await makeDeviceType();
    const row = track(
      await service.create(companyId, {
        deviceTypeId,
        unitPrice: 100_000,
        effectiveFrom: new Date("2026-01-01"),
      }),
    );
    const updated = await service.update(companyId, row.id, { unitPrice: 111_000 });
    expect(Number(updated.unitPrice)).toBe(111_000);
  });

  it("deletes a tariff", async () => {
    const deviceTypeId = await makeDeviceType();
    const row = await service.create(companyId, {
      deviceTypeId,
      unitPrice: 100_000,
      effectiveFrom: new Date("2026-01-01"),
    });
    await service.remove(companyId, row.id);
    await expect(service.findOne(companyId, row.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
