import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { DeviceCapabilitiesService } from "./device-capabilities.service";

const service = new DeviceCapabilitiesService();
const createdCapabilityIds: string[] = [];
const createdItemIds: string[] = [];

function uniqueCode() {
  return `C${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

afterAll(async () => {
  if (createdItemIds.length > 0) {
    await prisma.deviceCapabilityItem.deleteMany({ where: { id: { in: createdItemIds } } });
  }
  if (createdCapabilityIds.length > 0) {
    await prisma.deviceCapability.deleteMany({ where: { id: { in: createdCapabilityIds } } });
  }
});

describe("DeviceCapabilitiesService.create", () => {
  it("creates a device capability with required fields", async () => {
    const code = uniqueCode();
    const capability = await service.create({
      code,
      name: "Non-Invasive Blood Pressure",
      description: "NIBP function",
    });
    createdCapabilityIds.push(capability.id);

    expect(capability.code).toBe(code);
    expect(capability.name).toBe("Non-Invasive Blood Pressure");
    expect(capability.description).toBe("NIBP function");
    expect(capability.items).toEqual([]);
  });

  it("rejects duplicate code", async () => {
    const code = uniqueCode();
    const first = await service.create({ code, name: "First" });
    createdCapabilityIds.push(first.id);

    await expect(service.create({ code, name: "Second" })).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("DeviceCapabilitiesService.findAll / findOne / update / remove", () => {
  it("lists with itemCount, reads, updates, and deletes a device capability", async () => {
    const code = uniqueCode();
    const created = await service.create({ code, name: "Oxygen Saturation" });
    createdCapabilityIds.push(created.id);

    const listed = await service.findAll({ search: code, page: 1, pageSize: 10 });
    const listedRow = listed.data.find((row) => row.id === created.id);
    expect(listedRow).toBeDefined();
    expect(listedRow?.itemCount).toBe(0);

    const found = await service.findOne(created.id);
    expect(found.code).toBe(code);
    expect(found.items).toEqual([]);

    const updated = await service.update(created.id, {
      name: "Oxygen Saturation Updated",
      description: "Updated description",
    });
    expect(updated.name).toBe("Oxygen Saturation Updated");
    expect(updated.description).toBe("Updated description");

    const removed = await service.remove(created.id);
    expect(removed.id).toBe(created.id);
    createdCapabilityIds.splice(createdCapabilityIds.indexOf(created.id), 1);

    await expect(service.findOne(created.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects update of unknown id", async () => {
    await expect(service.findOne("missing-device-capability-id")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.update("missing-device-capability-id", { name: "Nope" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects updating code onto an existing one", async () => {
    const first = await service.create({ code: uniqueCode(), name: "First" });
    const second = await service.create({ code: uniqueCode(), name: "Second" });
    createdCapabilityIds.push(first.id, second.id);

    await expect(service.update(second.id, { code: first.code })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("rejects deleting a capability that still has items", async () => {
    const capability = await service.create({ code: uniqueCode(), name: "With Items" });
    createdCapabilityIds.push(capability.id);
    const item = await service.createItem(capability.id, { code: uniqueCode(), name: "Systolic" });
    createdItemIds.push(item.id);

    await expect(service.remove(capability.id)).rejects.toBeInstanceOf(BadRequestException);

    const listed = await service.findAll({ search: capability.code, page: 1, pageSize: 10 });
    expect(listed.data.find((row) => row.id === capability.id)?.itemCount).toBe(1);
  });
});

describe("DeviceCapabilitiesService capability items", () => {
  it("creates, lists, updates, and deletes an item under a capability", async () => {
    const capability = await service.create({ code: uniqueCode(), name: "ECG" });
    createdCapabilityIds.push(capability.id);

    const code = uniqueCode();
    const created = await service.createItem(capability.id, {
      code,
      name: "Heart Rate",
      description: "HR",
    });
    createdItemIds.push(created.id);

    expect(created.capabilityId).toBe(capability.id);
    expect(created.code).toBe(code);
    expect(created.name).toBe("Heart Rate");

    const listed = await service.findItems(capability.id);
    expect(listed.some((row) => row.id === created.id)).toBe(true);

    const withItems = await service.findOne(capability.id);
    expect(withItems.items.some((row) => row.id === created.id)).toBe(true);

    const updated = await service.updateItem(capability.id, created.id, {
      name: "Heart Rate Updated",
      description: "Updated HR",
    });
    expect(updated.name).toBe("Heart Rate Updated");
    expect(updated.description).toBe("Updated HR");

    const removed = await service.removeItem(capability.id, created.id);
    expect(removed.id).toBe(created.id);
    createdItemIds.splice(createdItemIds.indexOf(created.id), 1);

    const afterDelete = await service.findItems(capability.id);
    expect(afterDelete.some((row) => row.id === created.id)).toBe(false);
  });

  it("rejects duplicate item code within the same capability", async () => {
    const capability = await service.create({ code: uniqueCode(), name: "NIBP" });
    createdCapabilityIds.push(capability.id);
    const code = uniqueCode();
    const first = await service.createItem(capability.id, { code, name: "Systolic" });
    createdItemIds.push(first.id);

    await expect(
      service.createItem(capability.id, { code, name: "Systolic Duplicate" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("allows the same item code under a different capability", async () => {
    const firstCapability = await service.create({ code: uniqueCode(), name: "NIBP" });
    const secondCapability = await service.create({ code: uniqueCode(), name: "SpO2" });
    createdCapabilityIds.push(firstCapability.id, secondCapability.id);

    const sharedCode = uniqueCode();
    const first = await service.createItem(firstCapability.id, { code: sharedCode, name: "One" });
    const second = await service.createItem(secondCapability.id, { code: sharedCode, name: "Two" });
    createdItemIds.push(first.id, second.id);

    expect(second.code).toBe(sharedCode);
    expect(second.capabilityId).toBe(secondCapability.id);
  });

  it("rejects item operations on unknown capability or item", async () => {
    await expect(
      service.createItem("missing-capability-id", { code: uniqueCode(), name: "Orphan" }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const capability = await service.create({ code: uniqueCode(), name: "Parent" });
    createdCapabilityIds.push(capability.id);

    await expect(
      service.updateItem(capability.id, "missing-item-id", { name: "Nope" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.removeItem(capability.id, "missing-item-id")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects updating an item code onto an existing one in the same capability", async () => {
    const capability = await service.create({ code: uniqueCode(), name: "Parent" });
    createdCapabilityIds.push(capability.id);
    const first = await service.createItem(capability.id, { code: uniqueCode(), name: "First" });
    const second = await service.createItem(capability.id, { code: uniqueCode(), name: "Second" });
    createdItemIds.push(first.id, second.id);

    await expect(
      service.updateItem(capability.id, second.id, { code: first.code }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
