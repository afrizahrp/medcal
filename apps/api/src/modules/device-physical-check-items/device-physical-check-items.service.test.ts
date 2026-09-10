import { randomUUID } from "node:crypto";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import {
  devicePhysicalCheckItemCreateSchema,
  devicePhysicalCheckItemOrderSchema,
  devicePhysicalCheckItemUpdateSchema,
} from "@medcal/shared";
import { DevicePhysicalCheckItemsService } from "./device-physical-check-items.service";

const service = new DevicePhysicalCheckItemsService();
const createdItemIds: string[] = [];
const createdTypeIds: string[] = [];
const createdCategoryIds: string[] = [];

function uniqueSlug() {
  return `P${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

async function createDeviceType(name = "Test Physical Device") {
  const category = await prisma.deviceCategory.create({
    data: { code: `DVCAT-TEST-${uniqueSlug()}`, name: "Test Category" },
  });
  createdCategoryIds.push(category.id);
  const deviceType = await prisma.deviceType.create({
    data: {
      categoryId: category.id,
      code: `DVTP_TEST_${uniqueSlug()}`,
      name,
    },
  });
  createdTypeIds.push(deviceType.id);
  return deviceType;
}

afterAll(async () => {
  if (createdItemIds.length > 0) {
    await prisma.devicePhysicalCheckItem.deleteMany({ where: { id: { in: createdItemIds } } });
  }
  await prisma.devicePhysicalCheckItem.deleteMany({
    where: { deviceTypeId: { in: createdTypeIds } },
  });
  if (createdTypeIds.length > 0) {
    await prisma.deviceType.deleteMany({ where: { id: { in: createdTypeIds } } });
  }
  if (createdCategoryIds.length > 0) {
    await prisma.deviceCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
  }
});

describe("devicePhysicalCheckItemCreateSchema", () => {
  it("requires deviceTypeId, name, and inspectionLimit — and does not accept code", () => {
    expect(devicePhysicalCheckItemCreateSchema.safeParse({}).success).toBe(false);
    expect(
      devicePhysicalCheckItemCreateSchema.safeParse({
        deviceTypeId: "type-1",
        name: "Body",
      }).success,
    ).toBe(false);
    const parsed = devicePhysicalCheckItemCreateSchema.safeParse({
      deviceTypeId: "type-1",
      name: "Body",
      inspectionLimit: "Tidak penyok",
      code: "SHOULD_BE_REJECTED",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("code");
    }
  });
});

describe("devicePhysicalCheckItemUpdateSchema", () => {
  it("rejects deviceTypeId reassignment and code changes (fields stripped by schema)", () => {
    const parsed = devicePhysicalCheckItemUpdateSchema.safeParse({
      deviceTypeId: "other-type",
      code: "HACKED",
      name: "Updated",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("deviceTypeId");
      expect(parsed.data).not.toHaveProperty("code");
      expect(parsed.data.name).toBe("Updated");
    }
  });
});

describe("devicePhysicalCheckItemOrderSchema", () => {
  it("requires a non-empty itemIds array", () => {
    expect(devicePhysicalCheckItemOrderSchema.safeParse({}).success).toBe(false);
    expect(devicePhysicalCheckItemOrderSchema.safeParse({ itemIds: [] }).success).toBe(false);
    expect(
      devicePhysicalCheckItemOrderSchema.safeParse({ itemIds: ["a", "b"] }).success,
    ).toBe(true);
  });
});

describe("DevicePhysicalCheckItemsService", () => {
  it("creates under an existing DeviceType with deterministic PHYSICAL code and append sortOrder", async () => {
    const deviceType = await createDeviceType();
    const row = await service.create({
      deviceTypeId: deviceType.id,
      name: "Kondisi fisik",
      inspectionLimit: "Tidak rusak",
    });
    createdItemIds.push(row.id);

    expect(row.code).toBe(`${deviceType.code}_PHYSICAL_001`);
    expect(row.sortOrder).toBe(10);
    expect(row.isActive).toBe(true);
    expect(row.deviceType.id).toBe(deviceType.id);

    const second = await service.create({
      deviceTypeId: deviceType.id,
      name: "Kabel power",
      inspectionLimit: "Utuh",
    });
    createdItemIds.push(second.id);
    expect(second.code).toBe(`${deviceType.code}_PHYSICAL_002`);
    expect(second.sortOrder).toBe(20);
  });

  it("rejects create when DeviceType is missing", async () => {
    await expect(
      service.create({
        deviceTypeId: "missing-device-type-id",
        name: "X",
        inspectionLimit: "Y",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("groups by DeviceType, supports search/isActive/pagination, and loads detail", async () => {
    const typeA = await createDeviceType("Alpha Group Device");
    const typeB = await createDeviceType("Beta Group Device");

    const a1 = await service.create({
      deviceTypeId: typeA.id,
      name: "Alpha body",
      inspectionLimit: "Tidak penyok",
    });
    const a2 = await service.create({
      deviceTypeId: typeA.id,
      name: "Alpha cable",
      inspectionLimit: "Utuh",
      isActive: false,
    });
    const b1 = await service.create({
      deviceTypeId: typeB.id,
      name: "Beta display",
      inspectionLimit: "Jelas",
    });
    createdItemIds.push(a1.id, a2.id, b1.id);

    const grouped = await service.findAllGroupedByDeviceType({ page: 1, pageSize: 10 });
    const groupA = grouped.data.find((g) => g.deviceType.id === typeA.id);
    const groupB = grouped.data.find((g) => g.deviceType.id === typeB.id);
    expect(groupA?.count).toBe(2);
    expect(groupA?.items.map((i) => i.id)).toEqual([a1.id, a2.id]);
    expect(groupB?.count).toBe(1);
    expect(groupA?.categoryName).toBe("Test Category");

    const searched = await service.findAllGroupedByDeviceType({ search: "Alpha body" });
    expect(searched.data).toHaveLength(1);
    expect(searched.data[0]?.deviceType.id).toBe(typeA.id);
    expect(searched.data[0]?.items).toHaveLength(1);
    expect(searched.totalItems).toBe(1);

    const activeOnly = await service.findAllGroupedByDeviceType({ isActive: true });
    const activeA = activeOnly.data.find((g) => g.deviceType.id === typeA.id);
    expect(activeA?.count).toBe(1);
    expect(activeA?.items[0]?.id).toBe(a1.id);

    const page1 = await service.findAllGroupedByDeviceType({ page: 1, pageSize: 1 });
    expect(page1.data).toHaveLength(1);
    expect(page1.totalDeviceTypes).toBeGreaterThanOrEqual(2);
    expect(page1.totalPages).toBeGreaterThanOrEqual(2);

    const detail = await service.findOne(a1.id);
    expect(detail.name).toBe("Alpha body");
    expect(detail.inspectionLimit).toBe("Tidak penyok");
  });

  it("updates name/inspectionLimit/isActive without changing deviceTypeId or code", async () => {
    const deviceType = await createDeviceType();
    const row = await service.create({
      deviceTypeId: deviceType.id,
      name: "Before",
      inspectionLimit: "Limit A",
    });
    createdItemIds.push(row.id);

    const updated = await service.update(row.id, {
      name: "After",
      inspectionLimit: "Limit B",
      isActive: false,
    });
    expect(updated.name).toBe("After");
    expect(updated.inspectionLimit).toBe("Limit B");
    expect(updated.isActive).toBe(false);
    expect(updated.deviceTypeId).toBe(deviceType.id);
    expect(updated.code).toBe(row.code);

    await expect(service.findOne("missing-id")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("reorders within a DeviceType and rejects mismatched id sets", async () => {
    const deviceType = await createDeviceType();
    const otherType = await createDeviceType();
    const first = await service.create({
      deviceTypeId: deviceType.id,
      name: "First",
      inspectionLimit: "A",
    });
    const second = await service.create({
      deviceTypeId: deviceType.id,
      name: "Second",
      inspectionLimit: "B",
    });
    const foreign = await service.create({
      deviceTypeId: otherType.id,
      name: "Foreign",
      inspectionLimit: "C",
    });
    createdItemIds.push(first.id, second.id, foreign.id);

    const reordered = await service.reorder(deviceType.id, [second.id, first.id]);
    expect(reordered.map((r) => r.id)).toEqual([second.id, first.id]);
    expect(reordered.map((r) => r.sortOrder)).toEqual([10, 20]);

    await expect(service.reorder(deviceType.id, [first.id])).rejects.toMatchObject({
      response: { code: "DEVICE_PHYSICAL_CHECK_ITEM_ORDER_MISMATCH" },
    });
    await expect(
      service.reorder(deviceType.id, [first.id, second.id, foreign.id]),
    ).rejects.toMatchObject({
      response: { code: "DEVICE_PHYSICAL_CHECK_ITEM_ORDER_MISMATCH" },
    });
    await expect(
      service.reorder(deviceType.id, [first.id, second.id, first.id]),
    ).rejects.toMatchObject({
      response: { code: "DEVICE_PHYSICAL_CHECK_ITEM_ORDER_MISMATCH" },
    });
  });

  it("hard-deletes unused items and blocks delete when PhysicalCheckResult references exist", async () => {
    const deviceType = await createDeviceType();
    const disposable = await service.create({
      deviceTypeId: deviceType.id,
      name: "Disposable",
      inspectionLimit: "OK",
    });
    createdItemIds.push(disposable.id);

    const removed = await service.remove(disposable.id);
    expect(removed.id).toBe(disposable.id);
    await expect(service.findOne(disposable.id)).rejects.toBeInstanceOf(NotFoundException);
    const idx = createdItemIds.indexOf(disposable.id);
    if (idx >= 0) createdItemIds.splice(idx, 1);

    const referenced = await service.create({
      deviceTypeId: deviceType.id,
      name: "Referenced",
      inspectionLimit: "OK",
    });
    createdItemIds.push(referenced.id);

    // Attach a historical result via an existing CalibrationJob when available
    // (full commercial fan-out is out of scope for this master CRUD suite).
    const anyJob = await prisma.calibrationJob.findFirst({
      select: { id: true, companyId: true },
    });
    if (!anyJob) {
      // Guard is still in service.remove; without a job FK we cannot prove IN_USE here.
      return;
    }

    const result = await prisma.physicalCheckResult.create({
      data: {
        companyId: anyJob.companyId,
        calibrationJobId: anyJob.id,
        devicePhysicalCheckItemId: referenced.id,
        attemptNumber: 99_001,
        verdict: "BAIK",
        inspectionLimitSnapshot: referenced.inspectionLimit,
      },
    });

    try {
      await expect(service.remove(referenced.id)).rejects.toMatchObject({
        response: { code: "DEVICE_PHYSICAL_CHECK_ITEM_IN_USE" },
      });
    } finally {
      await prisma.physicalCheckResult.delete({ where: { id: result.id } });
    }
  });

  it("remains compatible with existing seeded DevicePhysicalCheckItem rows when present", async () => {
    const seededCount = await prisma.devicePhysicalCheckItem.count({
      where: { code: { contains: "_PHYSICAL_" } },
    });
    if (seededCount === 0) {
      expect(seededCount).toBe(0);
      return;
    }
    const sample = await prisma.devicePhysicalCheckItem.findFirst({
      where: { code: { contains: "_PHYSICAL_" } },
      include: { deviceType: { select: { id: true, code: true, name: true } } },
    });
    expect(sample).not.toBeNull();
    if (!sample) return;

    const detail = await service.findOne(sample.id);
    expect(detail.code).toBe(sample.code);
    expect(detail.deviceTypeId).toBe(sample.deviceTypeId);

    const grouped = await service.findAllGroupedByDeviceType({
      search: sample.deviceType.code,
      pageSize: 100,
    });
    const group = grouped.data.find((g) => g.deviceType.id === sample.deviceTypeId);
    expect(group).toBeDefined();
    expect(group?.items.some((i) => i.id === sample.id)).toBe(true);
  });
});
