import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { isValidDocumentNumber } from "@medcal/db";
import {
  quotationCreateSchema,
  quotationUpdateSchema,
  type QuotationCreateInput,
} from "@medcal/shared";
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

async function ensureTestTax(
  input: {
    taxCode: string;
    taxRate: number;
    isExclude: boolean;
    description: string;
  },
  companyId = realCompanyId,
) {
  const existing = await prisma.tax.findUnique({
    where: { companyId_taxCode: { companyId, taxCode: input.taxCode } },
  });
  if (existing) {
    return prisma.tax.update({
      where: { id: existing.id },
      data: {
        taxRate: input.taxRate,
        isExclude: input.isExclude,
        description: input.description,
        isActive: true,
      },
    });
  }
  const tax = await prisma.tax.create({
    data: {
      companyId,
      taxCode: input.taxCode,
      taxRate: input.taxRate,
      isExclude: input.isExclude,
      description: input.description,
    },
  });
  createdTaxIds.push(tax.id);
  return tax;
}

async function ensureNonPpnTax(companyId = realCompanyId) {
  return ensureTestTax(
    {
      taxCode: "T0",
      taxRate: 0,
      isExclude: false,
      description: "Non PPN",
    },
    companyId,
  );
}

async function createQuoted(
  companyId: string,
  input: Omit<QuotationCreateInput, "taxCode"> & { taxCode?: string },
) {
  await ensureNonPpnTax(companyId);
  return quotationsService.create(companyId, {
    ...input,
    taxCode: input.taxCode ?? "T0",
  });
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
      taxCode: "T0",
      items: [{ requestItemId: "item-1", description: "Kalibrasi BPM", unitPrice: 150000 }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a missing taxCode", () => {
    expect(
      quotationCreateSchema.safeParse({
        requestId: "req-1",
        items: [{ requestItemId: "item-1", description: "Kalibrasi BPM", unitPrice: 150000 }],
      }).success,
    ).toBe(false);
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

  it("rejects a decimal qty", () => {
    expect(
      quotationCreateSchema.safeParse({
        requestId: "req-1",
        items: [
          { requestItemId: "item-1", description: "Kalibrasi BPM", qty: 1.5, unitPrice: 150000 },
        ],
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

  it("rejects a negative item discountAmount", () => {
    expect(
      quotationCreateSchema.safeParse({
        requestId: "req-1",
        items: [
          {
            requestItemId: "item-1",
            description: "Kalibrasi BPM",
            unitPrice: 100000,
            discountAmount: -1,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects a negative headerDiscountAmount", () => {
    expect(
      quotationCreateSchema.safeParse({
        requestId: "req-1",
        headerDiscountAmount: -1,
        items: [{ requestItemId: "item-1", description: "Kalibrasi BPM", unitPrice: 100000 }],
      }).success,
    ).toBe(false);
  });
});

describe("QuotationsService.create", () => {
  it("creates Quotation with items, allocates QUO number, and links to CalibrationRequest", async () => {
    const { customerId, request } = await createSubmittedRequest(realCompanyId);

    const result = await createQuoted(realCompanyId, {
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
    expect(Number(result.items[0]?.discountAmount)).toBe(0);
    expect(Number(result.items[0]?.lineTotal)).toBe(150_000);
    expect(Number(result.subtotal)).toBe(150_000);
    expect(Number(result.headerDiscountAmount)).toBe(0);
    expect(result.taxCode).toBe("T0");
    expect(Number(result.taxRate)).toBe(0);
    expect(Number(result.taxAmount)).toBe(0);
    expect(Number(result.totalAmount)).toBe(150_000);
  });

  it("moves CalibrationRequest from SUBMITTED to IN_QUOTATION on first quotation", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    expect(request.status).toBe("SUBMITTED");

    const result = await createQuoted(realCompanyId, {
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

    const result = await createQuoted(realCompanyId, {
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

  it("applies exclusive tax at document header when isExclude is true", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    await ensureTestTax({
      taxCode: "T1",
      taxRate: 0.11,
      description: "PPN 11%",
      isExclude: true,
    });

    const result = await createQuoted(realCompanyId, {
      requestId: request.id,
      taxCode: "T1",
      items: quotationItemsFor(request, 100_000),
    });
    createdQuotationIds.push(result.id);

    expect(result.taxCode).toBe("T1");
    expect(Number(result.taxRate)).toBe(0.11);
    expect(Number(result.subtotal)).toBe(100_000);
    expect(Number(result.taxAmount)).toBe(11_000);
    expect(Number(result.totalAmount)).toBe(111_000);
    expect(result).not.toHaveProperty("taxId");
    expect(result).not.toHaveProperty("taxRateSnapshot");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty("taxCode");
    expect(result.items[0]).not.toHaveProperty("taxRate");
    expect(result.items[0]).not.toHaveProperty("taxAmount");
  });

  it("applies inclusive tax at document header when isExclude is false", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    await ensureTestTax({
      taxCode: "T2",
      taxRate: 0.11,
      description: "PPN 11%",
      isExclude: false,
    });

    const result = await createQuoted(realCompanyId, {
      requestId: request.id,
      taxCode: "T2",
      items: quotationItemsFor(request, 111_000),
    });
    createdQuotationIds.push(result.id);

    expect(result.taxCode).toBe("T2");
    expect(Number(result.taxRate)).toBe(0.11);
    expect(Number(result.subtotal)).toBe(111_000);
    expect(Number(result.taxAmount)).toBe(11_000);
    expect(Number(result.totalAmount)).toBe(111_000);
    expect(result).not.toHaveProperty("taxId");
    expect(result.items[0]).not.toHaveProperty("taxCode");
    expect(result.items[0]).not.toHaveProperty("taxRate");
  });

  it("applies zero-rate tax T0 with taxAmount 0", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    await ensureTestTax({
      taxCode: "T0",
      taxRate: 0,
      description: "Non PPN",
      isExclude: false,
    });

    const result = await createQuoted(realCompanyId, {
      requestId: request.id,
      taxCode: "T0",
      items: quotationItemsFor(request, 100_000),
    });
    createdQuotationIds.push(result.id);

    expect(result.taxCode).toBe("T0");
    expect(Number(result.taxRate)).toBe(0);
    expect(Number(result.taxAmount)).toBe(0);
    expect(Number(result.totalAmount)).toBe(100_000);
    expect(result).not.toHaveProperty("taxId");
    expect(result.items[0]).not.toHaveProperty("taxCode");
    expect(result.items[0]).not.toHaveProperty("taxRate");
  });

  it("rejects a nonexistent taxCode", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    try {
      await createQuoted(realCompanyId, {
        requestId: request.id,
        taxCode: "NOPE",
        items: quotationItemsFor(request, 100_000),
      });
      expect.fail("expected TAX_NOT_FOUND");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "TAX_NOT_FOUND" }),
      );
    }
  });

  it("rejects an inactive taxCode", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    const tax = await prisma.tax.create({
      data: {
        companyId: realCompanyId,
        taxCode: `IN${randomUUID().slice(0, 6).toUpperCase()}`,
        taxRate: 0.11,
        description: "Inactive PPN",
        isExclude: true,
        isActive: false,
      },
    });
    createdTaxIds.push(tax.id);

    try {
      await createQuoted(realCompanyId, {
        requestId: request.id,
        taxCode: tax.taxCode,
        items: quotationItemsFor(request, 100_000),
      });
      expect.fail("expected TAX_NOT_FOUND");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "TAX_NOT_FOUND" }),
      );
    }
  });

  it("applies item-level discountAmount to lineTotal", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);

    const result = await createQuoted(realCompanyId, {
      requestId: request.id,
      items: request.items.map((item) => ({
        requestItemId: item.id,
        description: `Kalibrasi ${item.deviceId}`,
        qty: 2,
        unitPrice: 100_000,
        discountAmount: 20_000,
      })),
    });
    createdQuotationIds.push(result.id);

    expect(Number(result.items[0]?.discountAmount)).toBe(20_000);
    expect(Number(result.items[0]?.lineTotal)).toBe(180_000);
    expect(Number(result.subtotal)).toBe(180_000);
    expect(Number(result.headerDiscountAmount)).toBe(0);
    expect(Number(result.totalAmount)).toBe(180_000);
    expect(result.items[0]).not.toHaveProperty("taxCode");
    expect(result.items[0]).not.toHaveProperty("taxAmount");
  });

  it("sums multiple item discounts into subtotal", async () => {
    const { request } = await createSubmittedRequest(realCompanyId, 2);

    const result = await createQuoted(realCompanyId, {
      requestId: request.id,
      items: request.items.map((item, index) => ({
        requestItemId: item.id,
        description: `Item ${index + 1}`,
        qty: 1,
        unitPrice: 100_000,
        discountAmount: index === 0 ? 10_000 : 25_000,
      })),
    });
    createdQuotationIds.push(result.id);

    expect(Number(result.subtotal)).toBe(165_000);
    expect(Number(result.totalAmount)).toBe(165_000);
  });

  it("applies headerDiscountAmount after item discounts", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);

    const result = await createQuoted(realCompanyId, {
      requestId: request.id,
      headerDiscountAmount: 30_000,
      items: quotationItemsFor(request, 100_000),
    });
    createdQuotationIds.push(result.id);

    expect(Number(result.subtotal)).toBe(100_000);
    expect(Number(result.headerDiscountAmount)).toBe(30_000);
    expect(Number(result.totalAmount)).toBe(70_000);
  });

  it("applies item discount then header discount then exclusive tax", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    await ensureTestTax({
      taxCode: "T1",
      taxRate: 0.11,
      description: "PPN 11%",
      isExclude: true,
    });

    const result = await createQuoted(realCompanyId, {
      requestId: request.id,
      taxCode: "T1",
      headerDiscountAmount: 30_000,
      items: request.items.map((item) => ({
        requestItemId: item.id,
        description: `Kalibrasi ${item.deviceId}`,
        qty: 2,
        unitPrice: 100_000,
        discountAmount: 20_000,
      })),
    });
    createdQuotationIds.push(result.id);

    expect(Number(result.items[0]?.lineTotal)).toBe(180_000);
    expect(Number(result.subtotal)).toBe(180_000);
    expect(Number(result.headerDiscountAmount)).toBe(30_000);
    expect(Number(result.taxAmount)).toBe(16_500);
    expect(Number(result.totalAmount)).toBe(166_500);
  });

  it("applies item discount then header discount then inclusive tax", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    await ensureTestTax({
      taxCode: "T2",
      taxRate: 0.11,
      description: "PPN 11%",
      isExclude: false,
    });

    const result = await createQuoted(realCompanyId, {
      requestId: request.id,
      taxCode: "T2",
      headerDiscountAmount: 39_000,
      items: request.items.map((item) => ({
        requestItemId: item.id,
        description: `Kalibrasi ${item.deviceId}`,
        qty: 2,
        unitPrice: 80_000,
        discountAmount: 10_000,
      })),
    });
    createdQuotationIds.push(result.id);

    expect(Number(result.items[0]?.lineTotal)).toBe(150_000);
    expect(Number(result.subtotal)).toBe(150_000);
    expect(Number(result.headerDiscountAmount)).toBe(39_000);
    expect(Number(result.taxAmount)).toBe(11_000);
    expect(Number(result.totalAmount)).toBe(111_000);
  });

  it("keeps taxAmount 0 for T0 after discounts", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    await ensureTestTax({
      taxCode: "T0",
      taxRate: 0,
      description: "Non PPN",
      isExclude: false,
    });

    const result = await createQuoted(realCompanyId, {
      requestId: request.id,
      taxCode: "T0",
      headerDiscountAmount: 30_000,
      items: request.items.map((item) => ({
        requestItemId: item.id,
        description: `Kalibrasi ${item.deviceId}`,
        qty: 2,
        unitPrice: 100_000,
        discountAmount: 20_000,
      })),
    });
    createdQuotationIds.push(result.id);

    expect(Number(result.taxAmount)).toBe(0);
    expect(Number(result.totalAmount)).toBe(150_000);
  });

  it("rejects a negative item discountAmount", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);

    try {
      await createQuoted(realCompanyId, {
        requestId: request.id,
        items: request.items.map((item) => ({
          requestItemId: item.id,
          description: `Kalibrasi ${item.deviceId}`,
          qty: 1,
          unitPrice: 100_000,
          discountAmount: -1,
        })),
      });
      expect.fail("expected INVALID_ITEM_DISCOUNT");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "INVALID_ITEM_DISCOUNT" }),
      );
    }
  });

  it("rejects item discount greater than gross line amount", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);

    try {
      await createQuoted(realCompanyId, {
        requestId: request.id,
        items: request.items.map((item) => ({
          requestItemId: item.id,
          description: `Kalibrasi ${item.deviceId}`,
          qty: 1,
          unitPrice: 100_000,
          discountAmount: 100_001,
        })),
      });
      expect.fail("expected ITEM_DISCOUNT_EXCEEDS_GROSS");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "ITEM_DISCOUNT_EXCEEDS_GROSS" }),
      );
    }
  });

  it("rejects a negative headerDiscountAmount", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);

    try {
      await createQuoted(realCompanyId, {
        requestId: request.id,
        headerDiscountAmount: -1,
        items: quotationItemsFor(request, 100_000),
      });
      expect.fail("expected INVALID_HEADER_DISCOUNT");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "INVALID_HEADER_DISCOUNT" }),
      );
    }
  });

  it("rejects headerDiscountAmount greater than subtotal", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);

    try {
      await createQuoted(realCompanyId, {
        requestId: request.id,
        headerDiscountAmount: 100_001,
        items: quotationItemsFor(request, 100_000),
      });
      expect.fail("expected HEADER_DISCOUNT_EXCEEDS_SUBTOTAL");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "HEADER_DISCOUNT_EXCEEDS_SUBTOTAL" }),
      );
    }
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
      await createQuoted(realCompanyId, {
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
      await createQuoted(realCompanyId, {
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
      await createQuoted(realCompanyId, {
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
      await createQuoted(realCompanyId, {
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

    const first = await createQuoted(realCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request, 100_000),
    });
    createdQuotationIds.push(first.id);

    const countBefore = await prisma.quotation.count({
      where: { requestId: request.id },
    });
    expect(countBefore).toBe(1);

    try {
      await createQuoted(realCompanyId, {
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

    const first = await createQuoted(realCompanyId, {
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
          taxCode: "T0",
          taxRate: 0,
          taxAmount: 0,
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
    const foreign = await createQuoted(otherCompanyId, {
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
    const foreign = await createQuoted(otherCompanyId, {
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
    const created = await createQuoted(realCompanyId, {
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
    const created = await createQuoted(realCompanyId, {
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
    const created = await createQuoted(realCompanyId, {
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
    expect(Number(updated.headerDiscountAmount)).toBe(0);
    expect(Number(updated.totalAmount)).toBe(200_000);
  });

  it("updates headerDiscountAmount and recomputes totals", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    const created = await createQuoted(realCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request, 100_000),
    });
    createdQuotationIds.push(created.id);

    const updated = await quotationsService.update(realCompanyId, created.id, {
      headerDiscountAmount: 20_000,
    });

    expect(Number(updated.subtotal)).toBe(100_000);
    expect(Number(updated.headerDiscountAmount)).toBe(20_000);
    expect(Number(updated.totalAmount)).toBe(80_000);
  });

  it("does not allow clearing taxCode to null", () => {
    expect(quotationUpdateSchema.safeParse({ taxCode: null }).success).toBe(false);
  });

  it("can change tax from T1 to T0 while DRAFT", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    await ensureTestTax({
      taxCode: "T1",
      taxRate: 0.11,
      description: "PPN 11%",
      isExclude: true,
    });
    const created = await createQuoted(realCompanyId, {
      requestId: request.id,
      taxCode: "T1",
      items: quotationItemsFor(request, 100_000),
    });
    createdQuotationIds.push(created.id);
    expect(Number(created.taxAmount)).toBe(11_000);

    const updated = await quotationsService.update(realCompanyId, created.id, { taxCode: "T0" });
    expect(updated.taxCode).toBe("T0");
    expect(Number(updated.taxRate)).toBe(0);
    expect(Number(updated.taxAmount)).toBe(0);
    expect(Number(updated.totalAmount)).toBe(100_000);
  });

  it("rejects update when status is not DRAFT", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    const created = await createQuoted(realCompanyId, {
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
    const created = await createQuoted(realCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request),
    });
    createdQuotationIds.push(created.id);

    const sent = await quotationsService.send(realCompanyId, created.id);
    expect(sent.status).toBe("SENT");
  });

  it("rejects sending a non-DRAFT quotation", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    const created = await createQuoted(realCompanyId, {
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
    const created = await createQuoted(realCompanyId, {
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

  it("approves a DRAFT quotation without requiring send", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    const created = await createQuoted(realCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request),
    });
    createdQuotationIds.push(created.id);

    const userId = `user-${randomUUID().slice(0, 8)}`;
    const approved = await quotationsService.approve(realCompanyId, created.id, userId);

    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedByUserId).toBe(userId);
    expect(approved.approvedAt).toBeInstanceOf(Date);
    expect(approved.customerApprovedAt).toBeInstanceOf(Date);
  });
});

describe("QuotationsService.reject", () => {
  it("rejects a SENT quotation without changing CalibrationRequest status", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    const created = await createQuoted(realCompanyId, {
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
    const created = await createQuoted(realCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request),
    });
    createdQuotationIds.push(created.id);

    const cancelled = await quotationsService.cancel(realCompanyId, created.id);
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("cancels a SENT quotation", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    const created = await createQuoted(realCompanyId, {
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
    const created = await createQuoted(realCompanyId, {
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
    const created = await createQuoted(realCompanyId, {
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
    const first = await createQuoted(realCompanyId, {
      requestId: firstCtx.request.id,
      items: quotationItemsFor(firstCtx.request),
    });
    createdQuotationIds.push(first.id);

    const secondCtx = await createSubmittedRequest(realCompanyId);
    const second = await createQuoted(realCompanyId, {
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

    await expect(
      createQuoted(realCompanyId, {
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

    // Scoped to this request so parallel writers on "PKM" can't perturb it.
    const countAfter = await prisma.quotation.count({
      where: { requestId: request.id },
    });
    expect(countAfter).toBe(0);

    const cr = await prisma.calibrationRequest.findFirstOrThrow({
      where: { id: request.id },
    });
    expect(cr.status).toBe("SUBMITTED");
  });
});

describe("QuotationsService.buildPdf", () => {
  it("returns a PDF without changing quotation status", async () => {
    const { request } = await createSubmittedRequest(realCompanyId);
    const created = await createQuoted(realCompanyId, {
      requestId: request.id,
      items: quotationItemsFor(request, 150_000),
    });
    createdQuotationIds.push(created.id);

    const pdf = await quotationsService.buildPdf(realCompanyId, created.id);
    expect(pdf.filename).toMatch(/^PKM-QUO-\d{8}-\d{5}\.pdf$/);
    expect(pdf.buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.buffer.length).toBeGreaterThan(100);
    const pdfLatin1 = pdf.buffer.toString("latin1");
    expect(pdfLatin1).toContain("/Subtype /Image");

    const after = await prisma.quotation.findFirstOrThrow({ where: { id: created.id } });
    expect(after.status).toBe("DRAFT");
  });
});
