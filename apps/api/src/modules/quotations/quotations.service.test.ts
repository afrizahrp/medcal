import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { isValidDocumentNumber } from "@medcal/db";
import { quotationCreateSchema } from "@medcal/shared";
import { CalibrationRequestsService } from "../calibration-requests/calibration-requests.service";
import { QuotationsService } from "./quotations.service";

const quotationsService = new QuotationsService();
const requestsService = new CalibrationRequestsService();
const realCompanyId = "PKM";
const createdQuotationIds: string[] = [];
const createdCalibrationRequestIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdCompanyIds: string[] = [];
const createdDeviceTypeIds: string[] = [];
const createdDeviceCategoryIds: string[] = [];
const createdTaxIds: string[] = [];
const createdTariffIds: string[] = [];
const createdDeviceIds: string[] = [];
let testDeviceTypeId: string | undefined;

async function cleanupQuotations(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.quotationItem.deleteMany({ where: { quotationId: { in: ids } } });
  await prisma.quotation.deleteMany({ where: { id: { in: ids } } });
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
    where: {
      companyId,
      documentType: { in: ["QUOTATION", "CALIBRATION_REQUEST"] },
    },
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

async function createSubmittedRequest(
  companyId: string,
  itemCount = 1,
): Promise<{
  customerId: string;
  request: Awaited<ReturnType<CalibrationRequestsService["submit"]>>;
}> {
  const customer = await createTestCustomer(companyId);
  const deviceTypeId = await getTestDeviceTypeId();
  const created = await requestsService.create(companyId, {
    customerId: customer.id,
    serviceMode: "ON_SITE",
    items: Array.from({ length: itemCount }, (_, index) => ({
      deviceTypeId,
      deviceId: `DEV-${index + 1}`,
    })),
  });
  createdCalibrationRequestIds.push(created.id);
  const request = await requestsService.submit(companyId, created.id);
  return { customerId: customer.id, request };
}

function quotationItemsFor(
  request: Awaited<ReturnType<CalibrationRequestsService["submit"]>>,
  unitPrice = 100_000,
) {
  return request.items.map((item) => ({
    requestItemId: item.id,
    description: `Kalibrasi ${item.deviceId}`,
    qty: 1,
    unitPrice,
  }));
}

afterAll(async () => {
  await cleanupQuotations(createdQuotationIds);
  if (createdDeviceIds.length > 0) {
    await prisma.device.deleteMany({ where: { id: { in: createdDeviceIds } } });
  }
  if (createdTariffIds.length > 0) {
    await prisma.serviceTariff.deleteMany({ where: { id: { in: createdTariffIds } } });
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
});

describe("quotationCreateSchema", () => {
  it("accepts a valid payload with requestId and items", () => {
    const parsed = quotationCreateSchema.safeParse({
      requestId: "req-1",
      items: [{ requestItemId: "item-1", description: "Kalibrasi BPM", unitPrice: 150000 }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a missing requestId", () => {
    expect(
      quotationCreateSchema.safeParse({
        items: [{ requestItemId: "item-1", description: "Kalibrasi BPM", unitPrice: 150000 }],
      }).success,
    ).toBe(false);
  });

  it("rejects an empty items array", () => {
    expect(
      quotationCreateSchema.safeParse({
        requestId: "req-1",
        items: [],
      }).success,
    ).toBe(false);
  });

  it("rejects a negative unitPrice", () => {
    expect(
      quotationCreateSchema.safeParse({
        requestId: "req-1",
        items: [{ requestItemId: "item-1", description: "Kalibrasi BPM", unitPrice: -1 }],
      }).success,
    ).toBe(false);
  });
});

describe("QuotationsService.create", () => {
  it("creates Quotation with items, allocates QUO number, and links to CalibrationRequest", async () => {
    const { customerId, request } = await createSubmittedRequest(realCompanyId);

    const result = await quotationsService.create(realCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request, 150_000),
    });
    createdQuotationIds.push(result.id);

    expect(result.customerId).toBe(customerId);
    expect(result.requestId).toBe(request.id);
    expect(result.status).toBe("DRAFT");
    expect(result.source).toBe("PORTAL");
    expect(isValidDocumentNumber(result.number)).toBe(true);
    expect(result.number.startsWith("QUO/")).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.requestItemId).toBe(request.items[0]?.id);
    expect(result.items[0]?.description).toBe("Kalibrasi DEV-1");
    expect(Number(result.items[0]?.qty)).toBe(1);
    expect(Number(result.items[0]?.unitPrice)).toBe(150_000);
    expect(Number(result.items[0]?.lineTotal)).toBe(150_000);
    expect(Number(result.subtotal)).toBe(150_000);
    expect(result.taxAmount).toBeNull();
    expect(Number(result.totalAmount)).toBe(150_000);
  });

  it("moves CalibrationRequest from SUBMITTED to IN_QUOTATION on first quotation", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    expect(request.status).toBe("SUBMITTED");

    const result = await quotationsService.create(realCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request),
    });
    createdQuotationIds.push(result.id);

    const updatedRequest = await prisma.calibrationRequest.findFirstOrThrow({
      where: { id: request.id },
    });
    expect(updatedRequest.status).toBe("IN_QUOTATION");
  });

  it("creates Quotation with multiple items and computed totals", async () => {
    const { request } = await createSubmittedRequest(realCompanyId, 2);

    const result = await quotationsService.create(realCompanyId, {
      requestId: request.id,
      items: request.items.map((item, index) => ({
        requestItemId: item.id,
        description: `Item ${index + 1}`,
        qty: index + 1,
        unitPrice: 50_000,
      })),
    });
    createdQuotationIds.push(result.id);

    expect(result.items).toHaveLength(2);
    expect(Number(result.subtotal)).toBe(150_000);
    expect(Number(result.totalAmount)).toBe(150_000);
  });

  it("applies tax to header totals when taxId is provided", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    const tax = await prisma.tax.create({
      data: {
        companyId: realCompanyId,
        taxCode: `PPN${randomUUID().slice(0, 6).toUpperCase()}`,
        taxRate: 0.11,
        description: "PPN 11%",
      },
    });
    createdTaxIds.push(tax.id);

    const result = await quotationsService.create(realCompanyId, {
      requestId: request.id,
      taxId: tax.id,
      items: quotationItemsFor(request, 100_000),
    });
    createdQuotationIds.push(result.id);

    expect(Number(result.subtotal)).toBe(100_000);
    expect(Number(result.taxAmount)).toBe(11_000);
    expect(Number(result.totalAmount)).toBe(111_000);
  });

  it("rejects creation when CalibrationRequest is still DRAFT", async () => {
    const customer = await createTestCustomer(realCompanyId);
    const deviceTypeId = await getTestDeviceTypeId();
    const draft = await requestsService.create(realCompanyId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId, deviceId: "DEV-1" }],
    });
    createdCalibrationRequestIds.push(draft.id);

    try {
      await quotationsService.create(realCompanyId, {
        requestId: draft.id,
        items: quotationItemsFor(draft),
      });
      expect.fail("expected INVALID_STATUS_FOR_QUOTATION");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "INVALID_STATUS_FOR_QUOTATION" }),
      );
    }
  });

  it("rejects creation with a non-existent calibration request", async () => {
    try {
      await quotationsService.create(realCompanyId, {
        requestId: "non-existent-request",
        items: [{ requestItemId: "item-1", description: "X", unitPrice: 1 }],
      });
      expect.fail("expected CALIBRATION_REQUEST_NOT_FOUND");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "CALIBRATION_REQUEST_NOT_FOUND" }),
      );
    }
  });

  it("rejects creation that does not cover the full request scope", async () => {
    const { request } = await createSubmittedRequest(realCompanyId, 2);

    try {
      await quotationsService.create(realCompanyId, {
        requestId: request.id,
        items: [
          {
            requestItemId: request.items[0]!.id,
            description: "Subset only",
            unitPrice: 100_000,
          },
        ],
      });
      expect.fail("expected QUOTATION_SCOPE_MISMATCH");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "QUOTATION_SCOPE_MISMATCH" }),
      );
    }
  });

  it("rejects duplicate requestItemId on the same quotation", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);

    try {
      await quotationsService.create(realCompanyId, {
        requestId: request.id,
        items: [
          {
            requestItemId: request.items[0]!.id,
            description: "First",
            unitPrice: 100_000,
          },
          {
            requestItemId: request.items[0]!.id,
            description: "Duplicate",
            unitPrice: 100_000,
          },
        ],
      });
      expect.fail("expected DUPLICATE_REQUEST_ITEM");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "DUPLICATE_REQUEST_ITEM" }),
      );
    }
  });

  it("rejects a second quotation for the same CalibrationRequest", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);

    const first = await quotationsService.create(realCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request, 100_000),
    });
    createdQuotationIds.push(first.id);

    const countBefore = await prisma.quotation.count({
      where: { requestId: request.id },
    });
    expect(countBefore).toBe(1);

    try {
      await quotationsService.create(realCompanyId, {
        requestId: request.id,
        items: quotationItemsFor(request, 120_000),
      });
      expect.fail("expected DUPLICATE_QUOTATION_FOR_REQUEST");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toEqual(
        expect.objectContaining({
          code: "DUPLICATE_QUOTATION_FOR_REQUEST",
          quotationId: first.id,
        }),
      );
    }

    const countAfter = await prisma.quotation.count({
      where: { requestId: request.id },
    });
    expect(countAfter).toBe(1);

    const unchanged = await prisma.quotation.findFirstOrThrow({
      where: { id: first.id },
    });
    expect(Number(unchanged.subtotal)).toBe(100_000);
    expect(unchanged.number).toBe(first.number);
    expect(unchanged.status).toBe("DRAFT");
  });

  it("enforces one quotation per request at the database unique constraint", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);

    const first = await quotationsService.create(realCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request, 100_000),
    });
    createdQuotationIds.push(first.id);

    await expect(
      prisma.quotation.create({
        data: {
          companyId: realCompanyId,
          customerId: first.customerId,
          number: `QUO/TEST/${randomUUID().slice(0, 8)}`,
          requestId: request.id,
          subtotal: 1,
          totalAmount: 1,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const count = await prisma.quotation.count({ where: { requestId: request.id } });
    expect(count).toBe(1);
  });
});

describe("QuotationsService tenant isolation", () => {
  it("throws NotFoundException when accessing a Quotation from another company", async () => {
    const otherCompanyId = `Q${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Foreign Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);

    await cleanupSequences(otherCompanyId);
    const { request } = await createSubmittedRequest(otherCompanyId);
    const foreign = await quotationsService.create(otherCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request),
    });
    createdQuotationIds.push(foreign.id);

    await expect(quotationsService.findOne(realCompanyId, foreign.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("scopes list results to the given companyId", async () => {
    const otherCompanyId = `R${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "List Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);

    await cleanupSequences(otherCompanyId);
    const { request } = await createSubmittedRequest(otherCompanyId);
    const foreign = await quotationsService.create(otherCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request),
    });
    createdQuotationIds.push(foreign.id);

    const result = await quotationsService.findAll(realCompanyId, { search: foreign.number });
    expect(result.data.some((row) => row.id === foreign.id)).toBe(false);
  });
});

describe("QuotationsService.findAll / findOne", () => {
  it("lists quotations for a requestId filter", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    const created = await quotationsService.create(realCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request),
    });
    createdQuotationIds.push(created.id);

    const result = await quotationsService.findAll(realCompanyId, { requestId: request.id });
    expect(result.data.some((row) => row.id === created.id)).toBe(true);
    expect(result.data.every((row) => row.requestId === request.id)).toBe(true);
  });

  it("returns a quotation by id with items", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    const created = await quotationsService.create(realCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request),
    });
    createdQuotationIds.push(created.id);

    const found = await quotationsService.findOne(realCompanyId, created.id);
    expect(found.id).toBe(created.id);
    expect(found.items).toHaveLength(1);
  });
});

describe("QuotationsService.update", () => {
  it("updates quotation fields and recomputes totals while in DRAFT", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    const created = await quotationsService.create(realCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request, 100_000),
    });
    createdQuotationIds.push(created.id);

    const validUntil = new Date("2026-12-31");
    const updated = await quotationsService.update(realCompanyId, created.id, {
      source: "PHONE",
      validUntil,
      items: quotationItemsFor(request, 200_000),
    });

    expect(updated.source).toBe("PHONE");
    expect(updated.validUntil).toEqual(validUntil);
    expect(Number(updated.subtotal)).toBe(200_000);
    expect(Number(updated.totalAmount)).toBe(200_000);
  });

  it("clears tax when taxId is set to null", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    const tax = await prisma.tax.create({
      data: {
        companyId: realCompanyId,
        taxCode: `CLR${randomUUID().slice(0, 6).toUpperCase()}`,
        taxRate: 0.11,
        description: "PPN",
      },
    });
    createdTaxIds.push(tax.id);

    const created = await quotationsService.create(realCompanyId, {
      requestId: request.id,
      taxId: tax.id,
      items: quotationItemsFor(request, 100_000),
    });
    createdQuotationIds.push(created.id);
    expect(Number(created.taxAmount)).toBe(11_000);

    const updated = await quotationsService.update(realCompanyId, created.id, { taxId: null });
    expect(updated.taxId).toBeNull();
    expect(updated.taxAmount).toBeNull();
    expect(Number(updated.totalAmount)).toBe(100_000);
  });

  it("rejects update when status is not DRAFT", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    const created = await quotationsService.create(realCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request),
    });
    createdQuotationIds.push(created.id);
    await quotationsService.send(realCompanyId, created.id);

    await expect(
      quotationsService.update(realCompanyId, created.id, { source: "WHATSAPP" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("QuotationsService.send", () => {
  it("sends a DRAFT quotation", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    const created = await quotationsService.create(realCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request),
    });
    createdQuotationIds.push(created.id);

    const sent = await quotationsService.send(realCompanyId, created.id);
    expect(sent.status).toBe("SENT");
  });

  it("rejects sending a non-DRAFT quotation", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    const created = await quotationsService.create(realCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request),
    });
    createdQuotationIds.push(created.id);
    await quotationsService.send(realCompanyId, created.id);

    await expect(quotationsService.send(realCompanyId, created.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("QuotationsService.approve", () => {
  it("approves a SENT quotation and records timestamps", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    const created = await quotationsService.create(realCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request),
    });
    createdQuotationIds.push(created.id);
    await quotationsService.send(realCompanyId, created.id);

    const userId = `user-${randomUUID().slice(0, 8)}`;
    const approved = await quotationsService.approve(realCompanyId, created.id, userId);

    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedByUserId).toBe(userId);
    expect(approved.approvedAt).toBeInstanceOf(Date);
    expect(approved.customerApprovedAt).toBeInstanceOf(Date);
  });

  it("rejects approving a DRAFT quotation", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    const created = await quotationsService.create(realCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request),
    });
    createdQuotationIds.push(created.id);

    await expect(
      quotationsService.approve(realCompanyId, created.id, "user-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("QuotationsService.reject", () => {
  it("rejects a SENT quotation without changing CalibrationRequest status", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    const created = await quotationsService.create(realCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request),
    });
    createdQuotationIds.push(created.id);
    await quotationsService.send(realCompanyId, created.id);

    const rejected = await quotationsService.reject(realCompanyId, created.id);
    expect(rejected.status).toBe("REJECTED");

    const cr = await prisma.calibrationRequest.findFirstOrThrow({
      where: { id: request.id },
    });
    expect(cr.status).toBe("IN_QUOTATION");
  });
});

describe("QuotationsService.cancel", () => {
  it("cancels a DRAFT quotation", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    const created = await quotationsService.create(realCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request),
    });
    createdQuotationIds.push(created.id);

    const cancelled = await quotationsService.cancel(realCompanyId, created.id);
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("cancels a SENT quotation", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    const created = await quotationsService.create(realCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request),
    });
    createdQuotationIds.push(created.id);
    await quotationsService.send(realCompanyId, created.id);

    const cancelled = await quotationsService.cancel(realCompanyId, created.id);
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("rejects cancelling an already cancelled quotation", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    const created = await quotationsService.create(realCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request),
    });
    createdQuotationIds.push(created.id);
    await quotationsService.cancel(realCompanyId, created.id);

    await expect(quotationsService.cancel(realCompanyId, created.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects cancelling an approved quotation", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    const created = await quotationsService.create(realCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request),
    });
    createdQuotationIds.push(created.id);
    await quotationsService.send(realCompanyId, created.id);
    await quotationsService.approve(realCompanyId, created.id, "user-1");

    try {
      await quotationsService.cancel(realCompanyId, created.id);
      expect.fail("expected CANNOT_CANCEL_APPROVED");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "CANNOT_CANCEL_APPROVED" }),
      );
    }
  });
});

describe("QuotationsService numbering", () => {
  it("uses DocumentNumberService with company-scoped sequence", async () => {
    const firstCtx = await createSubmittedRequest(realCompanyId);
    const first = await quotationsService.create(realCompanyId, {
      requestId: firstCtx.request.id,
      items: quotationItemsFor(firstCtx.request),
    });
    createdQuotationIds.push(first.id);

    const secondCtx = await createSubmittedRequest(realCompanyId);
    const second = await quotationsService.create(realCompanyId, {
      requestId: secondCtx.request.id,
      items: quotationItemsFor(secondCtx.request),
    });
    createdQuotationIds.push(second.id);

    const firstSeq = Number(first.number.split("/").pop());
    const secondSeq = Number(second.number.split("/").pop());
    expect(secondSeq).toBeGreaterThan(firstSeq);
    expect(first.number.slice(0, 15)).toBe(second.number.slice(0, 15));
  });
});

describe("QuotationsService transaction rollback", () => {
  it("rolls back fully if item creation fails (scope mismatch)", async () => {
    const { request } = await createSubmittedRequest(realCompanyId, 2);
    const countBefore = await prisma.quotation.count({
      where: { companyId: realCompanyId },
    });

    await expect(
      quotationsService.create(realCompanyId, {
        requestId: request.id,
        items: [
          {
            requestItemId: request.items[0]!.id,
            description: "Incomplete",
            unitPrice: 100_000,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const countAfter = await prisma.quotation.count({
      where: { companyId: realCompanyId },
    });
    expect(countAfter).toBe(countBefore);

    const cr = await prisma.calibrationRequest.findFirstOrThrow({
      where: { id: request.id },
    });
    expect(cr.status).toBe("SUBMITTED");
  });
});
