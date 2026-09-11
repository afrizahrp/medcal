import { randomUUID } from "node:crypto";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { isValidDocumentNumber } from "@medcal/db";
import { calibrationRequestCreateSchema } from "@medcal/shared";
import { CalibrationRequestsService } from "./calibration-requests.service";

const service = new CalibrationRequestsService();
const realCompanyId = "PKM";
const createdCalibrationRequestIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdCompanyIds: string[] = [];
const createdDeviceTypeIds: string[] = [];
const createdDeviceCategoryIds: string[] = [];
const createdUserIds: string[] = [];
let testDeviceTypeId: string | undefined;
let testUserId: string;

async function getTestUserId(): Promise<string> {
  if (testUserId) return testUserId;
  const user = await prisma.user.create({
    data: {
      email: `crq-${randomUUID().slice(0, 10)}@x.co`,
      name: "CRQ Test User",
      status: "ACTIVE",
    },
  });
  createdUserIds.push(user.id);
  testUserId = user.id;
  return testUserId;
}

async function cleanupCalibrationRequests(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.calibrationRequestItem.deleteMany({
    where: { requestId: { in: ids } },
  });
  await prisma.calibrationRequest.deleteMany({ where: { id: { in: ids } } });
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

beforeAll(async () => {
  await getTestUserId();
});

afterAll(async () => {
  await cleanupCalibrationRequests(createdCalibrationRequestIds);
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
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});

describe("calibrationRequestCreateSchema items", () => {
  it("accepts a valid item with deviceTypeId and string deviceId", () => {
    const parsed = calibrationRequestCreateSchema.safeParse({
      customerId: "cust-1",
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId: "type-1", deviceId: "BPM-001", notes: "Annual" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a missing deviceTypeId", () => {
    expect(
      calibrationRequestCreateSchema.safeParse({
        customerId: "cust-1",
        serviceMode: "ON_SITE",
        items: [{ deviceId: "BPM-001" }],
      }).success,
    ).toBe(false);
    expect(
      calibrationRequestCreateSchema.safeParse({
        customerId: "cust-1",
        serviceMode: "ON_SITE",
        items: [{ deviceTypeId: null, deviceId: "BPM-001" }],
      }).success,
    ).toBe(false);
    expect(
      calibrationRequestCreateSchema.safeParse({
        customerId: "cust-1",
        serviceMode: "ON_SITE",
        items: [{ deviceTypeId: "", deviceId: "BPM-001" }],
      }).success,
    ).toBe(false);
  });

  it("treats deviceId as a free-text string, not a Device lookup key", () => {
    const parsed = calibrationRequestCreateSchema.safeParse({
      customerId: "cust-1",
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId: "type-1", deviceId: "BPM-001" }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.items[0]?.deviceId).toBe("BPM-001");
    }
  });

  it("accepts an item with no deviceId (customer did not provide one)", () => {
    const parsed = calibrationRequestCreateSchema.safeParse({
      customerId: "cust-1",
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId: "type-1", customerDeviceName: "Tensimeter Digital" }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.items[0]?.deviceId).toBeUndefined();
      expect(parsed.data.items[0]?.customerDeviceName).toBe("Tensimeter Digital");
    }
  });

  it("accepts customerDeviceName and model", () => {
    const parsed = calibrationRequestCreateSchema.safeParse({
      customerId: "cust-1",
      serviceMode: "ON_SITE",
      items: [
        {
          deviceTypeId: "type-1",
          customerDeviceName: "Tensimeter",
          model: "AB-123",
          deviceId: "",
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.items[0]?.model).toBe("AB-123");
      expect(parsed.data.items[0]?.deviceId).toBe("");
    }
  });

  it("accepts an optional positive-integer qty and rejects non-positive / non-integer", () => {
    expect(
      calibrationRequestCreateSchema.safeParse({
        customerId: "c",
        serviceMode: "ON_SITE",
        items: [{ deviceTypeId: "t", qty: 7 }],
      }).success,
    ).toBe(true);
    expect(
      calibrationRequestCreateSchema.safeParse({
        customerId: "c",
        serviceMode: "ON_SITE",
        items: [{ deviceTypeId: "t", qty: 0 }],
      }).success,
    ).toBe(false);
    expect(
      calibrationRequestCreateSchema.safeParse({
        customerId: "c",
        serviceMode: "ON_SITE",
        items: [{ deviceTypeId: "t", qty: 1.5 }],
      }).success,
    ).toBe(false);
  });
});

describe("CalibrationRequestsService.create", () => {
  it("creates CalibrationRequest with items and allocates REQ number", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();

    const result = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, deviceId: "BPM-001", notes: "Test notes" }],
    });
    createdCalibrationRequestIds.push(result.id);

    expect(result.customerId).toBe(customer.id);
    expect(result.serviceMode).toBe("ON_SITE");
    expect(result.status).toBe("DRAFT");
    expect(isValidDocumentNumber(result.number)).toBe(true);
    expect(result.number.startsWith("CRQ/")).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.deviceTypeId).toBe(deviceTypeId);
    expect(result.items[0]?.deviceId).toBe("BPM-001");
    expect(result.items[0]?.notes).toBe("Test notes");
    expect(result.items[0]?.deviceType.name).toBe("Test Device Type");
    expect(result.createdByUserId).toBe(testUserId);
    expect(result.updatedByUserId).toBeNull();
  });

  it("creates CalibrationRequest with multiple items and expectedDate", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();

    const expectedDate = new Date("2026-12-01");
    const result = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "SEND_TO_LAB",
      expectedDate,
      notes: "Urgent calibration",
      items: [
        { deviceTypeId, deviceId: "BPM-001", notes: "Item 1" },
        { deviceTypeId, deviceId: "PM-002", notes: "Item 2" },
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
    const deviceTypeId = await getTestDeviceTypeId();

    const result = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, deviceId: "BPM-001" }],
    });
    createdCalibrationRequestIds.push(result.id);

    expect(result.expectedDate).toBeNull();
  });

  it("rejects creation with non-existent customer", async () => {
    const deviceTypeId = await getTestDeviceTypeId();

    await expect(
      service.create(realCompanyId, testUserId, {
        customerId: "non-existent-id",
        serviceMode: "ON_SITE",
        items: [{ deviceTypeId, deviceId: "BPM-001" }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects creation with a non-existent deviceTypeId", async () => {
    const customer = await createTestCustomer(realCompanyId);

    try {
      await service.create(realCompanyId, testUserId, {
        customerId: customer.id,
        serviceMode: "ON_SITE",
        items: [{ deviceTypeId: "non-existent-device-type", deviceId: "BPM-001" }],
      });
      expect.fail("expected DEVICE_TYPE_NOT_FOUND");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "DEVICE_TYPE_NOT_FOUND" }),
      );
    }
  });

  it("persists a null deviceId plus customerDeviceName and model", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();

    const result = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [
        { deviceTypeId, customerDeviceName: "Tensimeter Digital", model: "AB-123" },
      ],
    });
    createdCalibrationRequestIds.push(result.id);

    expect(result.items[0]?.deviceId).toBeNull();
    expect(result.items[0]?.customerDeviceName).toBe("Tensimeter Digital");
    expect(result.items[0]?.model).toBe("AB-123");
  });

  it("defaults item qty to 1 and persists an explicit aggregate qty", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();

    const result = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [
        { deviceTypeId, deviceId: "A-1" }, // no qty → default
        { deviceTypeId, customerDeviceName: "Bedside monitor", qty: 3 },
      ],
    });
    createdCalibrationRequestIds.push(result.id);

    expect(result.items).toHaveLength(2);
    expect(result.items.find((i) => i.deviceId === "A-1")?.qty).toBe(1);
    expect(result.items.find((i) => i.customerDeviceName === "Bedside monitor")?.qty).toBe(3);
  });

  it("stores an empty-string deviceId as null (no placeholder)", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();

    const result = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, deviceId: "", customerDeviceName: "Tensimeter" }],
    });
    createdCalibrationRequestIds.push(result.id);

    expect(result.items[0]?.deviceId).toBeNull();
  });

  it("still accepts a customer-provided free-text deviceId", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();

    const result = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, deviceId: "BSM-001" }],
    });
    createdCalibrationRequestIds.push(result.id);

    expect(result.items[0]?.deviceId).toBe("BSM-001");
  });

  it("does not look up Device master by deviceId", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();

    const result = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, deviceId: "non-existent-device" }],
    });
    createdCalibrationRequestIds.push(result.id);

    expect(result.items[0]?.deviceId).toBe("non-existent-device");
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
    const deviceTypeId = await getTestDeviceTypeId();

    await cleanupSequences(otherCompanyId);
    const foreign = await service.create(otherCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, deviceId: "BPM-001" }],
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
    const deviceTypeId = await getTestDeviceTypeId();

    await cleanupSequences(otherCompanyId);
    const foreign = await service.create(otherCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, deviceId: "BPM-001" }],
    });
    createdCalibrationRequestIds.push(foreign.id);

    const result = await service.findAll(realCompanyId, { search: foreign.number });
    expect(result.data.some((r) => r.id === foreign.id)).toBe(false);
  });
});

describe("CalibrationRequestsService.update", () => {
  it("updates calibration request fields while in DRAFT status", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();

    const created = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, deviceId: "BPM-001" }],
    });
    createdCalibrationRequestIds.push(created.id);

    const expectedDate = new Date("2026-12-15");
    const updated = await service.update(realCompanyId, created.id, testUserId, {
      serviceMode: "SEND_TO_LAB",
      notes: "Updated notes",
      expectedDate,
    });

    expect(updated.serviceMode).toBe("SEND_TO_LAB");
    expect(updated.notes).toBe("Updated notes");
    expect(updated.expectedDate).toEqual(expectedDate);
    expect(updated.updatedByUserId).toBe(testUserId);
  });

  it("updates expectedDate to null", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();

    const expectedDate = new Date("2026-12-20");
    const created = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      expectedDate,
      items: [{ deviceTypeId, deviceId: "BPM-001" }],
    });
    createdCalibrationRequestIds.push(created.id);

    expect(created.expectedDate).toEqual(expectedDate);

    const updated = await service.update(realCompanyId, created.id, testUserId, {
      expectedDate: null,
    });

    expect(updated.expectedDate).toBeNull();
  });

  it("updates items by replacing them", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();

    const created = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, deviceId: "BPM-001", notes: "Original" }],
    });
    createdCalibrationRequestIds.push(created.id);

    const updated = await service.update(realCompanyId, created.id, testUserId, {
      items: [
        { deviceTypeId, deviceId: "BPM-001", notes: "Updated" },
        { deviceTypeId, deviceId: "PM-002", notes: "New item" },
      ],
    });

    expect(updated.items).toHaveLength(2);
    expect(updated.items.find((i) => i.deviceId === "BPM-001")?.notes).toBe("Updated");
    expect(updated.items.find((i) => i.deviceId === "PM-002")?.notes).toBe("New item");
  });

  it("replaces items with customerDeviceName/model and a cleared deviceId", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();

    const created = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, deviceId: "BPM-001" }],
    });
    createdCalibrationRequestIds.push(created.id);

    const updated = await service.update(realCompanyId, created.id, testUserId, {
      items: [
        { deviceTypeId, customerDeviceName: "Blood Pressure Monitor", model: "BSM-501" },
      ],
    });

    expect(updated.items).toHaveLength(1);
    expect(updated.items[0]?.deviceId).toBeNull();
    expect(updated.items[0]?.customerDeviceName).toBe("Blood Pressure Monitor");
    expect(updated.items[0]?.model).toBe("BSM-501");
  });

  it("rejects update when status is not DRAFT", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();

    const created = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, deviceId: "BPM-001" }],
    });
    createdCalibrationRequestIds.push(created.id);

    await service.submit(realCompanyId, created.id, testUserId);

    await expect(
      service.update(realCompanyId, created.id, testUserId, { notes: "Should fail" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("CalibrationRequestsService.cancel", () => {
  it("cancels a DRAFT calibration request", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();

    const created = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, deviceId: "BPM-001" }],
    });
    createdCalibrationRequestIds.push(created.id);

    const cancelled = await service.cancel(realCompanyId, created.id, testUserId);
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("cancels a SUBMITTED calibration request", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();

    const created = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, deviceId: "BPM-001" }],
    });
    createdCalibrationRequestIds.push(created.id);

    await service.submit(realCompanyId, created.id, testUserId);
    const cancelled = await service.cancel(realCompanyId, created.id, testUserId);
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("rejects cancelling an already cancelled request", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();

    const created = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, deviceId: "BPM-001" }],
    });
    createdCalibrationRequestIds.push(created.id);

    await service.cancel(realCompanyId, created.id, testUserId);

    await expect(service.cancel(realCompanyId, created.id, testUserId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("CalibrationRequestsService.submit", () => {
  it("submits a DRAFT calibration request", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();

    const created = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, deviceId: "BPM-001" }],
    });
    createdCalibrationRequestIds.push(created.id);

    const submitted = await service.submit(realCompanyId, created.id, testUserId);
    expect(submitted.status).toBe("SUBMITTED");
  });

  it("rejects submitting a non-DRAFT request", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();

    const created = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, deviceId: "BPM-001" }],
    });
    createdCalibrationRequestIds.push(created.id);

    await service.submit(realCompanyId, created.id, testUserId);

    await expect(service.submit(realCompanyId, created.id, testUserId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("CalibrationRequestsService numbering", () => {
  it("uses DocumentNumberService with company-scoped sequence", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();

    const first = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, deviceId: "BPM-001" }],
    });
    createdCalibrationRequestIds.push(first.id);

    const second = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, deviceId: "PM-002" }],
    });
    createdCalibrationRequestIds.push(second.id);

    const firstSeq = Number(first.number.split("/").pop());
    const secondSeq = Number(second.number.split("/").pop());
    expect(secondSeq).toBeGreaterThan(firstSeq);
    expect(first.number.slice(0, 15)).toBe(second.number.slice(0, 15));
  });
});

describe("CalibrationRequestsService transaction rollback", () => {
  it("rolls back fully if item creation fails (invalid deviceTypeId)", async () => {
    // Scope the count to this test's own fresh customer so requests created by
    // parallel test files for the shared "PKM" company cannot perturb it.
    const customer = await createTestCustomer(realCompanyId);

    await expect(
      service.create(realCompanyId, testUserId, {
        customerId: customer.id,
        serviceMode: "ON_SITE",
        items: [{ deviceTypeId: "missing-device-type-id", deviceId: "BPM-001" }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const countForCustomer = await prisma.calibrationRequest.count({
      where: { companyId: realCompanyId, customerId: customer.id },
    });
    expect(countForCustomer).toBe(0);
  });
});
