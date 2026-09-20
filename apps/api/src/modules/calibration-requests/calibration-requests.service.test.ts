import { randomUUID } from "node:crypto";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, prisma } from "@medcal/db";
import { isValidDocumentNumber } from "@medcal/db";
import { calibrationRequestCreateSchema } from "@medcal/shared";
import { QuotationsService } from "../quotations/quotations.service";
import { CalibrationRequestsService } from "./calibration-requests.service";

const service = new CalibrationRequestsService();
const quotationsService = new QuotationsService();
const createdQuotationIds: string[] = [];
const createdTaxIds: string[] = [];
const createdPriceListItemIds: string[] = [];
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
  if (createdQuotationIds.length > 0) {
    await prisma.quotationItem.deleteMany({ where: { quotationId: { in: createdQuotationIds } } });
    await prisma.quotation.deleteMany({ where: { id: { in: createdQuotationIds } } });
  }
  if (createdPriceListItemIds.length > 0) {
    await prisma.priceListItem.deleteMany({ where: { id: { in: createdPriceListItemIds } } });
  }
  if (createdTaxIds.length > 0) {
    await prisma.tax.deleteMany({ where: { id: { in: createdTaxIds } } });
  }
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

// =============================================================================
// MOM #1 — Transaction Revision + Immutable History
// =============================================================================

async function ensureNonPpnTax() {
  const existing = await prisma.tax.findUnique({
    where: { companyId_taxCode: { companyId: realCompanyId, taxCode: "T0" } },
  });
  if (existing) return existing;
  const tax = await prisma.tax.create({
    data: { companyId: realCompanyId, taxCode: "T0", taxRate: 0, isExclude: false, description: "Non PPN" },
  });
  createdTaxIds.push(tax.id);
  return tax;
}

async function seedPrice(deviceTypeId: string, unitPrice: number) {
  const effectiveFrom = new Date("2020-01-01T00:00:00.000Z");
  const row = await prisma.priceListItem.upsert({
    where: { companyId_deviceTypeId_effectiveFrom: { companyId: realCompanyId, deviceTypeId, effectiveFrom } },
    create: { companyId: realCompanyId, deviceTypeId, unitPrice: new Prisma.Decimal(unitPrice), effectiveFrom },
    update: { unitPrice: new Prisma.Decimal(unitPrice) },
  });
  createdPriceListItemIds.push(row.id);
  return row;
}

/** Generates a real Quotation from the request, so its item becomes "consumed". */
async function consumeRequestIntoQuotation(requestId: string, deviceTypeId: string) {
  await ensureNonPpnTax();
  await seedPrice(deviceTypeId, 100_000);
  const quotation = await quotationsService.create(realCompanyId, { requestId, taxCode: "T0" });
  createdQuotationIds.push(quotation.id);
  return quotation;
}

describe("CalibrationRequestsService.revise", () => {
  it("rejects revise while still DRAFT (use the normal edit action instead)", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();
    const created = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, qty: 1 }],
    });
    createdCalibrationRequestIds.push(created.id);

    await expect(
      service.revise(realCompanyId, created.id, testUserId, {
        items: [{ id: created.items[0]!.id, deviceTypeId, qty: 3 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects revise on a terminal (CANCELLED) request", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();
    const created = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, qty: 1 }],
    });
    createdCalibrationRequestIds.push(created.id);
    await service.submit(realCompanyId, created.id, testUserId);
    await service.cancel(realCompanyId, created.id, testUserId);

    await expect(
      service.revise(realCompanyId, created.id, testUserId, {
        items: [{ id: created.items[0]!.id, deviceTypeId, qty: 3 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("1 -> 3: grows qty in place before any Quotation exists, keeping the document number and item id stable", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();
    const created = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, qty: 1 }],
    });
    createdCalibrationRequestIds.push(created.id);
    const submitted = await service.submit(realCompanyId, created.id, testUserId);
    const originalItemId = submitted.items[0]!.id;

    const revised = await service.revise(realCompanyId, created.id, testUserId, {
      items: [{ id: originalItemId, deviceTypeId, qty: 3 }],
    });

    expect(revised.number).toBe(created.number);
    expect(revised.status).toBe("SUBMITTED");
    expect(revised.items).toHaveLength(1);
    expect(revised.items[0]!.id).toBe(originalItemId);
    expect(revised.items[0]!.qty).toBe(3);
  });

  it("history is a complete snapshot per revision (not a delta), preserved unchanged by later revisions, including a decrease (3 -> 2)", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();
    const created = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, qty: 1, notes: "first" }],
    });
    createdCalibrationRequestIds.push(created.id);
    const submitted = await service.submit(realCompanyId, created.id, testUserId);
    const itemId = submitted.items[0]!.id;

    await service.revise(realCompanyId, created.id, testUserId, {
      items: [{ id: itemId, deviceTypeId, qty: 3, notes: "second" }],
    });
    const final = await service.revise(realCompanyId, created.id, testUserId, {
      items: [{ id: itemId, deviceTypeId, qty: 2, notes: "third" }],
    });

    expect(final.number).toBe(created.number);
    expect(final.items[0]!.qty).toBe(2);

    const history = await service.listHistory(realCompanyId, created.id);
    expect(history.map((h) => h.revisionNumber).sort()).toEqual([1, 2]);

    const rev1 = await service.getHistoryRevision(realCompanyId, created.id, 1);
    expect(rev1.number).toBe(created.number);
    expect(rev1.items).toHaveLength(1);
    expect(rev1.items[0]!.qty).toBe(1);
    expect(rev1.items[0]!.notes).toBe("first"); // complete snapshot — item-level notes captured too

    const rev2 = await service.getHistoryRevision(realCompanyId, created.id, 2);
    expect(rev2.items).toHaveLength(1);
    expect(rev2.items[0]!.qty).toBe(3);

    // Re-reading revision 1 again after revision 2 was created must be unchanged.
    const rev1Again = await service.getHistoryRevision(realCompanyId, created.id, 1);
    expect(rev1Again.items[0]!.qty).toBe(1);
  });

  it("freezes an item once a Quotation has been generated from it, and adds an additive sibling row for growth instead of mutating it", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();
    const created = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, qty: 1 }],
    });
    createdCalibrationRequestIds.push(created.id);
    const submitted = await service.submit(realCompanyId, created.id, testUserId);
    const originalItemId = submitted.items[0]!.id;

    await consumeRequestIntoQuotation(created.id, deviceTypeId);

    const revised = await service.revise(realCompanyId, created.id, testUserId, {
      items: [{ id: originalItemId, deviceTypeId, qty: 3 }],
    });

    expect(revised.items).toHaveLength(2);
    const originalRow = revised.items.find((item) => item.id === originalItemId)!;
    expect(originalRow.qty).toBe(1); // frozen — never mutated
    const siblingRow = revised.items.find((item) => item.id !== originalItemId)!;
    expect(siblingRow.qty).toBe(2); // delta only
    expect(siblingRow.deviceTypeId).toBe(originalRow.deviceTypeId);
  });

  it("no-op: resubmitting the same qty on an already-consumed item changes nothing", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();
    const created = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, qty: 3 }],
    });
    createdCalibrationRequestIds.push(created.id);
    const submitted = await service.submit(realCompanyId, created.id, testUserId);
    const originalItemId = submitted.items[0]!.id;

    await consumeRequestIntoQuotation(created.id, deviceTypeId);

    const revised = await service.revise(realCompanyId, created.id, testUserId, {
      items: [{ id: originalItemId, deviceTypeId, qty: 3 }],
    });

    expect(revised.items).toHaveLength(1);
    expect(revised.items[0]!.id).toBe(originalItemId);
    expect(revised.items[0]!.qty).toBe(3);
  });

  it("MOM #1 Final Revision Scope Design: shrinking an already-consumed item retires the frozen row and adds a new active row with the full desired qty", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();
    const created = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, qty: 3 }],
    });
    createdCalibrationRequestIds.push(created.id);
    const submitted = await service.submit(realCompanyId, created.id, testUserId);
    const originalItemId = submitted.items[0]!.id;

    await consumeRequestIntoQuotation(created.id, deviceTypeId);

    const revised = await service.revise(realCompanyId, created.id, testUserId, {
      items: [{ id: originalItemId, deviceTypeId, qty: 2 }],
    });

    // The frozen row is retired (isActive: false), not deleted and not
    // mutated — it no longer appears in the current active item list.
    expect(revised.items).toHaveLength(1);
    expect(revised.items[0]!.id).not.toBe(originalItemId);
    expect(revised.items[0]!.qty).toBe(2);
    expect(revised.items[0]!.deviceTypeId).toBe(deviceTypeId);

    const retiredRow = await prisma.calibrationRequestItem.findUniqueOrThrow({
      where: { id: originalItemId },
    });
    expect(retiredRow.isActive).toBe(false);
    expect(retiredRow.qty).toBe(3); // frozen — never mutated
  });

  it("rolls back everything (no history, no item mutation) if any line in the batch is invalid", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();
    const created = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, qty: 1 }],
    });
    createdCalibrationRequestIds.push(created.id);
    const submitted = await service.submit(realCompanyId, created.id, testUserId);
    const originalItemId = submitted.items[0]!.id;

    await expect(
      service.revise(realCompanyId, created.id, testUserId, {
        items: [
          { id: originalItemId, deviceTypeId, qty: 3 },
          { deviceTypeId: "does-not-exist", qty: 1 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const historyAfter = await service.listHistory(realCompanyId, created.id);
    expect(historyAfter).toHaveLength(0);

    const requestAfter = await service.findOne(realCompanyId, created.id);
    expect(requestAfter.items).toHaveLength(1);
    expect(requestAfter.items[0]!.qty).toBe(1);
  });

  // ===========================================================================
  // MOM #1 — Final Revision Scope Design (desired-scope reconciliation)
  // ===========================================================================

  it("add: a genuinely new line (no id) is added alongside the unchanged existing line", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeA = await getTestDeviceTypeId();
    const category = await prisma.deviceCategory.create({
      data: { code: `C${randomUUID().slice(0, 8).toUpperCase()}`, name: "Test Category" },
    });
    createdDeviceCategoryIds.push(category.id);
    const otherDeviceType = await prisma.deviceType.create({
      data: {
        categoryId: category.id,
        code: `T${randomUUID().slice(0, 8).toUpperCase()}`,
        name: "Other Device Type",
      },
    });
    createdDeviceTypeIds.push(otherDeviceType.id);

    const created = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId: deviceTypeA, qty: 1 }],
    });
    createdCalibrationRequestIds.push(created.id);
    const submitted = await service.submit(realCompanyId, created.id, testUserId);
    const originalItemId = submitted.items[0]!.id;

    const revised = await service.revise(realCompanyId, created.id, testUserId, {
      items: [
        { id: originalItemId, deviceTypeId: deviceTypeA, qty: 1 },
        { deviceTypeId: otherDeviceType.id, qty: 1 },
      ],
    });

    expect(revised.items).toHaveLength(2);
    expect(revised.items.some((item) => item.id === originalItemId)).toBe(true);
    expect(revised.items.some((item) => item.deviceTypeId === otherDeviceType.id)).toBe(true);
  });

  it("remove (unconsumed): an item absent from the desired scope is hard-deleted, not retired", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();
    const created = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, qty: 1, notes: "keep" }, { deviceTypeId, qty: 2, notes: "drop" }],
    });
    createdCalibrationRequestIds.push(created.id);
    const submitted = await service.submit(realCompanyId, created.id, testUserId);
    const keepId = submitted.items.find((item) => item.notes === "keep")!.id;
    const dropId = submitted.items.find((item) => item.notes === "drop")!.id;

    const revised = await service.revise(realCompanyId, created.id, testUserId, {
      items: [{ id: keepId, deviceTypeId, qty: 1, notes: "keep" }],
    });

    expect(revised.items).toHaveLength(1);
    expect(revised.items[0]!.id).toBe(keepId);
    const dropped = await prisma.calibrationRequestItem.findUnique({ where: { id: dropId } });
    expect(dropped).toBeNull(); // hard-deleted, not merely retired
  });

  it("remove (consumed): an item absent from the desired scope is retired (isActive: false), never hard-deleted", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();
    const created = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, qty: 1 }],
    });
    createdCalibrationRequestIds.push(created.id);
    const submitted = await service.submit(realCompanyId, created.id, testUserId);
    const originalItemId = submitted.items[0]!.id;

    await consumeRequestIntoQuotation(created.id, deviceTypeId);

    const revised = await service.revise(realCompanyId, created.id, testUserId, {
      items: [],
    });

    expect(revised.items).toHaveLength(0);
    const retired = await prisma.calibrationRequestItem.findUniqueOrThrow({
      where: { id: originalItemId },
    });
    expect(retired.isActive).toBe(false);
    expect(retired.qty).toBe(1); // frozen — never mutated
  });

  it("replace (unconsumed): old device removed (hard delete) + new device added, in one revision", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeA = await getTestDeviceTypeId();
    const category = await prisma.deviceCategory.create({
      data: { code: `C${randomUUID().slice(0, 8).toUpperCase()}`, name: "Test Category" },
    });
    createdDeviceCategoryIds.push(category.id);
    const deviceTypeB = await prisma.deviceType.create({
      data: {
        categoryId: category.id,
        code: `T${randomUUID().slice(0, 8).toUpperCase()}`,
        name: "Replacement Device Type",
      },
    });
    createdDeviceTypeIds.push(deviceTypeB.id);

    const created = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId: deviceTypeA, qty: 1 }],
    });
    createdCalibrationRequestIds.push(created.id);
    const submitted = await service.submit(realCompanyId, created.id, testUserId);
    const originalItemId = submitted.items[0]!.id;

    const revised = await service.revise(realCompanyId, created.id, testUserId, {
      items: [{ deviceTypeId: deviceTypeB.id, qty: 1 }], // no id -> old id implicitly absent -> REMOVED
    });

    expect(revised.items).toHaveLength(1);
    expect(revised.items[0]!.deviceTypeId).toBe(deviceTypeB.id);
    expect(revised.items[0]!.id).not.toBe(originalItemId);
    const oldRow = await prisma.calibrationRequestItem.findUnique({ where: { id: originalItemId } });
    expect(oldRow).toBeNull(); // hard-deleted — was unconsumed
  });

  it("combined revision: add + remove + qty change all apply atomically in one call", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();
    const category = await prisma.deviceCategory.create({
      data: { code: `C${randomUUID().slice(0, 8).toUpperCase()}`, name: "Test Category" },
    });
    createdDeviceCategoryIds.push(category.id);
    const newDeviceType = await prisma.deviceType.create({
      data: {
        categoryId: category.id,
        code: `T${randomUUID().slice(0, 8).toUpperCase()}`,
        name: "Newly Added Device Type",
      },
    });
    createdDeviceTypeIds.push(newDeviceType.id);

    const created = await service.create(realCompanyId, testUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [
        { deviceTypeId, qty: 1, notes: "grow" },
        { deviceTypeId, qty: 1, notes: "remove-me" },
      ],
    });
    createdCalibrationRequestIds.push(created.id);
    const submitted = await service.submit(realCompanyId, created.id, testUserId);
    const growId = submitted.items.find((item) => item.notes === "grow")!.id;
    const removeId = submitted.items.find((item) => item.notes === "remove-me")!.id;

    const revised = await service.revise(realCompanyId, created.id, testUserId, {
      items: [
        { id: growId, deviceTypeId, qty: 5, notes: "grow" }, // QTY_CHANGED
        { deviceTypeId: newDeviceType.id, qty: 1 }, // ADDED
        // removeId omitted -> REMOVED
      ],
    });

    expect(revised.items).toHaveLength(2);
    const grown = revised.items.find((item) => item.id === growId)!;
    expect(grown.qty).toBe(5);
    expect(revised.items.some((item) => item.deviceTypeId === newDeviceType.id)).toBe(true);
    expect(revised.items.some((item) => item.id === removeId)).toBe(false);
    const removedRow = await prisma.calibrationRequestItem.findUnique({ where: { id: removeId } });
    expect(removedRow).toBeNull(); // unconsumed -> hard-deleted
  });
});
