import { randomUUID } from "node:crypto";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { isValidDocumentNumber } from "@medcal/db";
import { CalibrationRequestsService } from "./calibration-requests.service";

const service = new CalibrationRequestsService();
const realCompanyId = "PKM";
const createdCalibrationRequestIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdDeviceIds: string[] = [];
const createdCompanyIds: string[] = [];
const createdDeviceTypeIds: string[] = [];
const createdDeviceCategoryIds: string[] = [];
let testDeviceTypeId: string | undefined;

async function cleanupCalibrationRequests(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.calibrationRequestItem.deleteMany({
    where: { requestId: { in: ids } },
  });
  await prisma.calibrationRequest.deleteMany({ where: { id: { in: ids } } });
}

async function cleanupDevices(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.device.deleteMany({ where: { id: { in: ids } } });
}

async function cleanupCustomers(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.customerContact.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
}

async function cleanupSequences(companyId: string) {
  await prisma.documentNumberSequence.deleteMany({
    where: { companyId, documentType: "CALIBRATION_REQUEST" },
  });
}

async function createTestCustomer(companyId: string, name?: string) {
  const customer = await prisma.customer.create({
    data: {
      companyId,
      number: `CUS/TEST/${randomUUID().slice(0, 8)}`,
      name: name ?? `Test Customer ${randomUUID().slice(0, 6)}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

async function getTestDeviceTypeId(): Promise<string> {
  if (testDeviceTypeId) return testDeviceTypeId;
  const category = await prisma.deviceCategory.create({
    data: {
      code: `C${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      name: "Test Category",
    },
  });
  createdDeviceCategoryIds.push(category.id);
  const deviceType = await prisma.deviceType.create({
    data: {
      categoryId: category.id,
      code: `T${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      name: "Test Device Type",
    },
  });
  createdDeviceTypeIds.push(deviceType.id);
  testDeviceTypeId = deviceType.id;
  return deviceType.id;
}

async function createTestDevice(companyId: string, customerId: string) {
  const device = await prisma.device.create({
    data: {
      companyId,
      customerId,
      deviceTypeId: await getTestDeviceTypeId(),
      brand: "Test Brand",
      model: `Model ${randomUUID().slice(0, 6)}`,
      serialNumber: `SN-${randomUUID().slice(0, 8)}`,
    },
  });
  createdDeviceIds.push(device.id);
  return device;
}

afterAll(async () => {
  await cleanupCalibrationRequests(createdCalibrationRequestIds);
  await cleanupDevices(createdDeviceIds);
  if (createdDeviceTypeIds.length > 0) {
    await prisma.deviceType.deleteMany({ where: { id: { in: createdDeviceTypeIds } } });
  }
  if (createdDeviceCategoryIds.length > 0) {
    await prisma.deviceCategory.deleteMany({ where: { id: { in: createdDeviceCategoryIds } } });
  }
  await cleanupCustomers(createdCustomerIds);
  await cleanupSequences(realCompanyId);
  for (const companyId of createdCompanyIds) {
    await cleanupSequences(companyId);
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  }
});

describe("CalibrationRequestsService.create", () => {
  it("creates CalibrationRequest with items and allocates REQ number", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const device = await createTestDevice(realCompanyId, customer.id);

    const result = await service.create(realCompanyId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceId: device.id, notes: "Test notes" }],
    });
    createdCalibrationRequestIds.push(result.id);

    expect(result.customerId).toBe(customer.id);
    expect(result.serviceMode).toBe("ON_SITE");
    expect(result.status).toBe("DRAFT");
    expect(isValidDocumentNumber(result.number)).toBe(true);
    expect(result.number.startsWith("CRQ/")).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.deviceId).toBe(device.id);
    expect(result.items[0]?.notes).toBe("Test notes");
  });

  it("creates CalibrationRequest with multiple items and expectedDate", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const device1 = await createTestDevice(realCompanyId, customer.id);
    const device2 = await createTestDevice(realCompanyId, customer.id);

    const expectedDate = new Date("2026-12-01");
    const result = await service.create(realCompanyId, {
      customerId: customer.id,
      serviceMode: "SEND_TO_LAB",
      expectedDate,
      notes: "Urgent calibration",
      items: [
        { deviceId: device1.id, notes: "Item 1" },
        { deviceId: device2.id, notes: "Item 2" },
      ],
    });
    createdCalibrationRequestIds.push(result.id);

    expect(result.items).toHaveLength(2);
    expect(result.serviceMode).toBe("SEND_TO_LAB");
    expect(result.expectedDate).toEqual(expectedDate);
    expect(result.notes).toBe("Urgent calibration");
  });

  it("creates CalibrationRequest without expectedDate", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const device = await createTestDevice(realCompanyId, customer.id);

    const result = await service.create(realCompanyId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceId: device.id }],
    });
    createdCalibrationRequestIds.push(result.id);

    expect(result.expectedDate).toBeNull();
  });

  it("rejects creation with non-existent customer", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const device = await createTestDevice(realCompanyId, customer.id);

    await expect(
      service.create(realCompanyId, {
        customerId: "non-existent-id",
        serviceMode: "ON_SITE",
        items: [{ deviceId: device.id }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects creation with non-existent device", async () => {
    const customer = await createTestCustomer(realCompanyId);

    await expect(
      service.create(realCompanyId, {
        customerId: customer.id,
        serviceMode: "ON_SITE",
        items: [{ deviceId: "non-existent-device" }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("CalibrationRequestsService tenant isolation", () => {
  it("throws NotFoundException when accessing a CalibrationRequest from another company", async () => {
    const otherCompanyId = `G${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Foreign Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);

    const customer = await createTestCustomer(otherCompanyId);
    const device = await createTestDevice(otherCompanyId, customer.id);

    await cleanupSequences(otherCompanyId);
    const foreign = await service.create(otherCompanyId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceId: device.id }],
    });
    createdCalibrationRequestIds.push(foreign.id);

    await expect(service.findOne(realCompanyId, foreign.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("scopes list results to the given companyId", async () => {
    const otherCompanyId = `H${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "List Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);

    const customer = await createTestCustomer(otherCompanyId);
    const device = await createTestDevice(otherCompanyId, customer.id);

    await cleanupSequences(otherCompanyId);
    const foreign = await service.create(otherCompanyId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceId: device.id }],
    });
    createdCalibrationRequestIds.push(foreign.id);

    const result = await service.findAll(realCompanyId, { search: foreign.number });
    expect(result.data.some((r) => r.id === foreign.id)).toBe(false);
  });
});

describe("CalibrationRequestsService.update", () => {
  it("updates calibration request fields while in DRAFT status", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const device = await createTestDevice(realCompanyId, customer.id);

    const created = await service.create(realCompanyId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceId: device.id }],
    });
    createdCalibrationRequestIds.push(created.id);

    const expectedDate = new Date("2026-12-15");
    const updated = await service.update(realCompanyId, created.id, {
      serviceMode: "SEND_TO_LAB",
      notes: "Updated notes",
      expectedDate,
    });

    expect(updated.serviceMode).toBe("SEND_TO_LAB");
    expect(updated.notes).toBe("Updated notes");
    expect(updated.expectedDate).toEqual(expectedDate);
  });

  it("updates expectedDate to null", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const device = await createTestDevice(realCompanyId, customer.id);

    const expectedDate = new Date("2026-12-20");
    const created = await service.create(realCompanyId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      expectedDate,
      items: [{ deviceId: device.id }],
    });
    createdCalibrationRequestIds.push(created.id);

    expect(created.expectedDate).toEqual(expectedDate);

    const updated = await service.update(realCompanyId, created.id, {
      expectedDate: null,
    });

    expect(updated.expectedDate).toBeNull();
  });

  it("updates items by replacing them", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const device1 = await createTestDevice(realCompanyId, customer.id);
    const device2 = await createTestDevice(realCompanyId, customer.id);

    const created = await service.create(realCompanyId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceId: device1.id, notes: "Original" }],
    });
    createdCalibrationRequestIds.push(created.id);

    const updated = await service.update(realCompanyId, created.id, {
      items: [
        { deviceId: device1.id, notes: "Updated" },
        { deviceId: device2.id, notes: "New item" },
      ],
    });

    expect(updated.items).toHaveLength(2);
    expect(updated.items.find((i) => i.deviceId === device1.id)?.notes).toBe("Updated");
    expect(updated.items.find((i) => i.deviceId === device2.id)?.notes).toBe("New item");
  });

  it("rejects update when status is not DRAFT", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const device = await createTestDevice(realCompanyId, customer.id);

    const created = await service.create(realCompanyId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceId: device.id }],
    });
    createdCalibrationRequestIds.push(created.id);

    await service.submit(realCompanyId, created.id);

    await expect(
      service.update(realCompanyId, created.id, { notes: "Should fail" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("CalibrationRequestsService.cancel", () => {
  it("cancels a DRAFT calibration request", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const device = await createTestDevice(realCompanyId, customer.id);

    const created = await service.create(realCompanyId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceId: device.id }],
    });
    createdCalibrationRequestIds.push(created.id);

    const cancelled = await service.cancel(realCompanyId, created.id);
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("cancels a SUBMITTED calibration request", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const device = await createTestDevice(realCompanyId, customer.id);

    const created = await service.create(realCompanyId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceId: device.id }],
    });
    createdCalibrationRequestIds.push(created.id);

    await service.submit(realCompanyId, created.id);
    const cancelled = await service.cancel(realCompanyId, created.id);
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("rejects cancelling an already cancelled request", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const device = await createTestDevice(realCompanyId, customer.id);

    const created = await service.create(realCompanyId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceId: device.id }],
    });
    createdCalibrationRequestIds.push(created.id);

    await service.cancel(realCompanyId, created.id);

    await expect(service.cancel(realCompanyId, created.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("CalibrationRequestsService.submit", () => {
  it("submits a DRAFT calibration request", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const device = await createTestDevice(realCompanyId, customer.id);

    const created = await service.create(realCompanyId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceId: device.id }],
    });
    createdCalibrationRequestIds.push(created.id);

    const submitted = await service.submit(realCompanyId, created.id);
    expect(submitted.status).toBe("SUBMITTED");
  });

  it("rejects submitting a non-DRAFT request", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const device = await createTestDevice(realCompanyId, customer.id);

    const created = await service.create(realCompanyId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceId: device.id }],
    });
    createdCalibrationRequestIds.push(created.id);

    await service.submit(realCompanyId, created.id);

    await expect(service.submit(realCompanyId, created.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("CalibrationRequestsService numbering", () => {
  it("uses DocumentNumberService with company-scoped sequence", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const device1 = await createTestDevice(realCompanyId, customer.id);
    const device2 = await createTestDevice(realCompanyId, customer.id);

    const first = await service.create(realCompanyId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceId: device1.id }],
    });
    createdCalibrationRequestIds.push(first.id);

    const second = await service.create(realCompanyId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceId: device2.id }],
    });
    createdCalibrationRequestIds.push(second.id);

    const firstSeq = Number(first.number.split("/").pop());
    const secondSeq = Number(second.number.split("/").pop());
    expect(secondSeq).toBeGreaterThan(firstSeq);
    expect(first.number.slice(0, 15)).toBe(second.number.slice(0, 15));
  });
});

describe("CalibrationRequestsService transaction rollback", () => {
  it("rolls back fully if item creation fails (device from another company)", async () => {
    const otherCompanyId = `I${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Other Device Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);

    const otherCustomer = await createTestCustomer(otherCompanyId);
    const otherDevice = await createTestDevice(otherCompanyId, otherCustomer.id);

    const customer = await createTestCustomer(realCompanyId);

    const countBefore = await prisma.calibrationRequest.count({
      where: { companyId: realCompanyId },
    });

    await expect(
      service.create(realCompanyId, {
        customerId: customer.id,
        serviceMode: "ON_SITE",
        items: [{ deviceId: otherDevice.id }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const countAfter = await prisma.calibrationRequest.count({
      where: { companyId: realCompanyId },
    });
    expect(countAfter).toBe(countBefore);
  });
});
