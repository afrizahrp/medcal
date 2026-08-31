import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import {
  deviceCapabilityCreateSchema,
  deviceCapabilityItemCreateSchema,
} from "@medcal/shared";
import { DeviceCapabilitiesService } from "./device-capabilities.service";

const service = new DeviceCapabilitiesService();
const createdCapabilityIds: string[] = [];
const createdItemIds: string[] = [];

function uniq() {
  return randomUUID().slice(0, 8);
}

afterAll(async () => {
  if (createdItemIds.length > 0) {
    await prisma.deviceCapabilityItem.deleteMany({ where: { id: { in: createdItemIds } } });
  }
  if (createdCapabilityIds.length > 0) {
    await prisma.deviceCapabilityItem.deleteMany({
      where: { capabilityId: { in: createdCapabilityIds } },
    });
    await prisma.deviceCapability.deleteMany({ where: { id: { in: createdCapabilityIds } } });
  }
});

describe("schemas", () => {
  it("device capability create does not accept a code", () => {
    const parsed = deviceCapabilityCreateSchema.parse({ name: "X", code: "HACK" });
    expect("code" in parsed).toBe(false);
  });
  it("capability item create has no code field at all", () => {
    const parsed = deviceCapabilityItemCreateSchema.parse({ name: "X", code: "HACK" });
    expect("code" in parsed).toBe(false);
  });
});

describe("DeviceCapabilitiesService.create", () => {
  it("creates a device capability with a system-issued DVCAP- code", async () => {
    const capability = await service.create({
      name: `Non-Invasive Blood Pressure ${uniq()}`,
      description: "NIBP function",
    });
    createdCapabilityIds.push(capability.id);

    expect(capability.code).toMatch(/^DVCAP-\d{3,}$/);
    expect(capability.description).toBe("NIBP function");
    expect(capability.items).toEqual([]);
  });

  it("allocates strictly increasing codes", async () => {
    const a = await service.create({ name: `First ${uniq()}` });
    const b = await service.create({ name: `Second ${uniq()}` });
    createdCapabilityIds.push(a.id, b.id);
    expect(Number(b.code.slice(6))).toBeGreaterThan(Number(a.code.slice(6)));
  });
});

describe("DeviceCapabilitiesService.findAll / findOne / update / remove", () => {
  it("lists with itemCount, reads, updates, and deletes a device capability", async () => {
    const created = await service.create({ name: `Oxygen Saturation ${uniq()}` });
    createdCapabilityIds.push(created.id);

    const listed = await service.findAll({ search: created.code, page: 1, pageSize: 10 });
    expect(listed.data.find((row) => row.id === created.id)?.itemCount).toBe(0);

    const found = await service.findOne(created.id);
    expect(found.code).toBe(created.code);

    const updated = await service.update(created.id, {
      name: `Oxygen Saturation Updated ${uniq()}`,
      description: "Updated description",
    });
    expect(updated.description).toBe("Updated description");
    expect(updated.code).toBe(created.code);

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

  it("rejects deleting a capability that still has items", async () => {
    const capability = await service.create({ name: `With Items ${uniq()}` });
    createdCapabilityIds.push(capability.id);
    const item = await service.createItem(capability.id, { name: "Systolic" });
    createdItemIds.push(item.id);

    await expect(service.remove(capability.id)).rejects.toBeInstanceOf(BadRequestException);

    const listed = await service.findAll({ search: capability.code, page: 1, pageSize: 10 });
    expect(listed.data.find((row) => row.id === capability.id)?.itemCount).toBe(1);
  });
});

describe("DeviceCapabilitiesService capability items (CUID + name only, no code)", () => {
  it("creates, lists, updates, and deletes an item under a capability", async () => {
    const capability = await service.create({ name: `ECG ${uniq()}` });
    createdCapabilityIds.push(capability.id);

    const created = await service.createItem(capability.id, {
      name: "Heart Rate",
      description: "HR",
    });
    createdItemIds.push(created.id);

    expect(created.capabilityId).toBe(capability.id);
    expect(created.name).toBe("Heart Rate");
    expect("code" in created).toBe(false);

    const listed = await service.findItems(capability.id);
    expect(listed.some((row) => row.id === created.id)).toBe(true);

    const withItems = await service.findOne(capability.id);
    expect(withItems.items.some((row) => row.id === created.id)).toBe(true);

    const updated = await service.updateItem(capability.id, created.id, {
      name: "Heart Rate Updated",
      description: "Updated HR",
    });
    expect(updated.name).toBe("Heart Rate Updated");

    const removed = await service.removeItem(capability.id, created.id);
    expect(removed.id).toBe(created.id);
    createdItemIds.splice(createdItemIds.indexOf(created.id), 1);

    const afterDelete = await service.findItems(capability.id);
    expect(afterDelete.some((row) => row.id === created.id)).toBe(false);
  });

  it("rejects a duplicate item name within the same capability", async () => {
    const capability = await service.create({ name: `NIBP ${uniq()}` });
    createdCapabilityIds.push(capability.id);
    const first = await service.createItem(capability.id, { name: "Systolic" });
    createdItemIds.push(first.id);

    await expect(
      service.createItem(capability.id, { name: "systolic" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("allows the same item name under a different capability", async () => {
    const a = await service.create({ name: `NIBP ${uniq()}` });
    const b = await service.create({ name: `SpO2 ${uniq()}` });
    createdCapabilityIds.push(a.id, b.id);

    const i1 = await service.createItem(a.id, { name: "Shared Name" });
    const i2 = await service.createItem(b.id, { name: "Shared Name" });
    createdItemIds.push(i1.id, i2.id);

    expect(i2.capabilityId).toBe(b.id);
  });

  it("rejects item operations on unknown capability or item", async () => {
    await expect(
      service.createItem("missing-capability-id", { name: "Orphan" }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const capability = await service.create({ name: `Parent ${uniq()}` });
    createdCapabilityIds.push(capability.id);

    await expect(
      service.updateItem(capability.id, "missing-item-id", { name: "Nope" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.removeItem(capability.id, "missing-item-id")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects renaming an item onto an existing name in the same capability", async () => {
    const capability = await service.create({ name: `Parent ${uniq()}` });
    createdCapabilityIds.push(capability.id);
    const first = await service.createItem(capability.id, { name: "First" });
    const second = await service.createItem(capability.id, { name: "Second" });
    createdItemIds.push(first.id, second.id);

    await expect(
      service.updateItem(capability.id, second.id, { name: "First" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
