import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { Prisma, prisma } from "@medcal/db";
import { isValidDocumentNumber } from "@medcal/db";
import { purchaseOrderCreateSchema, purchaseOrderUpdateSchema } from "@medcal/shared";
import { CalibrationRequestsService } from "../calibration-requests/calibration-requests.service";
import { QuotationsService } from "../quotations/quotations.service";
import { PurchaseOrdersService } from "./purchase-orders.service";

const purchaseOrdersService = new PurchaseOrdersService();
const quotationsService = new QuotationsService();
const requestsService = new CalibrationRequestsService();
const realCompanyId = "PKM";
const staffUserId = "po-staff-user";
const createdPurchaseOrderIds: string[] = [];
const createdQuotationIds: string[] = [];
const createdCalibrationRequestIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdCompanyIds: string[] = [];
const createdDeviceTypeIds: string[] = [];
const createdDeviceCategoryIds: string[] = [];
const createdTaxIds: string[] = [];
let testDeviceTypeId: string | undefined;

async function cleanupPurchaseOrders() {
  if (createdPurchaseOrderIds.length > 0) {
    await prisma.purchaseOrder.deleteMany({ where: { id: { in: createdPurchaseOrderIds } } });
  }
  if (createdQuotationIds.length > 0) {
    await prisma.purchaseOrder.deleteMany({ where: { quotationId: { in: createdQuotationIds } } });
  }
}

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
      documentType: { in: ["PURCHASE_ORDER", "QUOTATION", "CALIBRATION_REQUEST"] },
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
  // A fresh DeviceType per call so each quotation gets its own Price List row
  // without effective-window collisions.
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

async function createSubmittedRequest(
  companyId: string,
  itemCount = 1,
): Promise<{
  customerId: string;
  deviceTypeId: string;
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
  return { customerId: customer.id, deviceTypeId, request };
}

async function seedPrice(companyId: string, deviceTypeId: string, unitPrice: number) {
  await prisma.priceListItem.create({
    data: {
      companyId,
      deviceTypeId,
      unitPrice: new Prisma.Decimal(unitPrice),
      effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
    },
  });
}

async function createQuotation(
  companyId: string,
  options?: {
    itemCount?: number;
    unitPrice?: number;
    taxCode?: string;
    headerDiscountAmount?: number;
    itemDiscountAmount?: number;
  },
) {
  await ensureNonPpnTax(companyId);
  const { customerId, deviceTypeId, request } = await createSubmittedRequest(
    companyId,
    options?.itemCount ?? 1,
  );
  await seedPrice(companyId, deviceTypeId, options?.unitPrice ?? 100_000);
  const quotation = await quotationsService.create(companyId, {
    requestId: request.id,
    taxCode: options?.taxCode ?? "T0",
    headerDiscountAmount: options?.headerDiscountAmount,
    ...(options?.itemDiscountAmount !== undefined
      ? {
          items: request.items.map((item) => ({
            requestItemId: item.id,
            discountAmount: options.itemDiscountAmount,
          })),
        }
      : {}),
  });
  createdQuotationIds.push(quotation.id);
  return { customerId, request, quotation };
}

async function approveQuotation(
  companyId: string,
  quotationId: string,
): Promise<Awaited<ReturnType<QuotationsService["approve"]>>> {
  await quotationsService.send(companyId, quotationId);
  return quotationsService.approve(companyId, quotationId, staffUserId);
}

async function createApprovedQuotation(
  companyId: string,
  options?: Parameters<typeof createQuotation>[1],
) {
  const created = await createQuotation(companyId, options);
  const quotation = await approveQuotation(companyId, created.quotation.id);
  return { ...created, quotation };
}

function customerPoInput(quotationId: string, poNumber?: string) {
  return {
    quotationId,
    customerPoNumber: poNumber ?? `CPO-${randomUUID().slice(0, 8).toUpperCase()}`,
    customerPoDate: new Date("2026-08-15T00:00:00.000Z"),
  };
}

afterAll(async () => {
  await cleanupPurchaseOrders();
  if (createdTaxIds.length > 0) {
    await prisma.tax.deleteMany({ where: { id: { in: createdTaxIds } } });
  }
  await cleanupQuotations(createdQuotationIds);
  await cleanupCalibrationRequests(createdCalibrationRequestIds);
  if (createdDeviceTypeIds.length > 0) {
    await prisma.priceListItem.deleteMany({ where: { deviceTypeId: { in: createdDeviceTypeIds } } });
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

describe("purchaseOrderCreateSchema", () => {
  it("accepts quotationId, customerPoNumber, and customerPoDate", () => {
    const parsed = purchaseOrderCreateSchema.safeParse({
      quotationId: "quo-1",
      customerPoNumber: "PO/RS/001",
      customerPoDate: "2026-08-15",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a missing quotationId", () => {
    expect(
      purchaseOrderCreateSchema.safeParse({
        customerPoNumber: "PO/RS/001",
        customerPoDate: "2026-08-15",
      }).success,
    ).toBe(false);
  });

  it("rejects a missing customerPoNumber", () => {
    expect(
      purchaseOrderCreateSchema.safeParse({
        quotationId: "quo-1",
        customerPoDate: "2026-08-15",
      }).success,
    ).toBe(false);
  });

  it("does not treat client commercial fields as required inputs", () => {
    const parsed = purchaseOrderCreateSchema.safeParse({
      quotationId: "quo-1",
      customerPoNumber: "PO/RS/001",
      customerPoDate: "2026-08-15",
      items: [{ description: "ignored" }],
      unitPrice: 1,
      taxCode: "T1",
      totalAmount: 999,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("items");
      expect(parsed.data).not.toHaveProperty("unitPrice");
      expect(parsed.data).not.toHaveProperty("taxCode");
      expect(parsed.data).not.toHaveProperty("totalAmount");
      expect(parsed.data).not.toHaveProperty("companyId");
      expect(parsed.data).not.toHaveProperty("customerId");
    }
  });
});

describe("purchaseOrderUpdateSchema", () => {
  it("rejects quotationId as an update field", () => {
    const parsed = purchaseOrderUpdateSchema.safeParse({
      quotationId: "other-quotation",
      customerPoNumber: "PO/RS/002",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("quotationId");
    }
  });
});

describe("PurchaseOrdersService.create", () => {
  it("creates a DRAFT PO snapshot from an APPROVED quotation", async () => {
    await ensureTestTax({
      taxCode: "T1",
      taxRate: 0.11,
      isExclude: true,
      description: "PPN 11%",
    });
    const { customerId, quotation } = await createApprovedQuotation(realCompanyId, {
      itemCount: 2,
      unitPrice: 100_000,
      taxCode: "T1",
      headerDiscountAmount: 10_000,
      itemDiscountAmount: 5_000,
    });
    const input = customerPoInput(quotation.id);

    const result = await purchaseOrdersService.create(realCompanyId, input);
    createdPurchaseOrderIds.push(result.id);

    expect(result.companyId).toBe(realCompanyId);
    expect(result.customerId).toBe(customerId);
    expect(result.quotationId).toBe(quotation.id);
    expect(result.status).toBe("DRAFT");
    expect(isValidDocumentNumber(result.number)).toBe(true);
    expect(result.number.startsWith("PUR/")).toBe(true);
    expect(result.customerPoNumber).toBe(input.customerPoNumber);
    expect(result.customerPoDate).toEqual(input.customerPoDate);
    expect(Number(result.subtotal)).toBe(Number(quotation.subtotal));
    expect(Number(result.headerDiscountAmount)).toBe(Number(quotation.headerDiscountAmount));
    expect(result.taxCode).toBe(quotation.taxCode);
    expect(Number(result.taxRate)).toBe(Number(quotation.taxRate));
    expect(Number(result.taxAmount)).toBe(Number(quotation.taxAmount));
    expect(Number(result.totalAmount)).toBe(Number(quotation.totalAmount));
    expect(result.currency).toBe(quotation.currency);
    expect(result.items).toHaveLength(quotation.items.length);
    expect(result).not.toHaveProperty("taxId");
    expect(result).not.toHaveProperty("taxRateSnapshot");

    const quotationItemsById = new Map(quotation.items.map((item) => [item.id, item]));
    for (const item of result.items) {
      const source = quotationItemsById.get(item.quotationItemId);
      expect(source).toBeDefined();
      expect(item.description).toBe(source!.description);
      expect(Number(item.qty)).toBe(Number(source!.qty));
      expect(Number(item.unitPrice)).toBe(Number(source!.unitPrice));
      expect(Number(item.discountAmount)).toBe(Number(source!.discountAmount));
      expect(Number(item.lineTotal)).toBe(Number(source!.lineTotal));
      expect(item).not.toHaveProperty("taxCode");
      expect(item).not.toHaveProperty("taxRate");
      expect(item).not.toHaveProperty("taxAmount");
    }
  });

  it("snapshots T0 when the quotation is Non PPN", async () => {
    const { quotation } = await createApprovedQuotation(realCompanyId, { unitPrice: 80_000 });
    expect(quotation.taxCode).toBe("T0");
    expect(Number(quotation.taxAmount)).toBe(0);

    const result = await purchaseOrdersService.create(realCompanyId, customerPoInput(quotation.id));
    createdPurchaseOrderIds.push(result.id);

    expect(result.taxCode).toBe("T0");
    expect(Number(result.taxRate)).toBe(0);
    expect(Number(result.taxAmount)).toBe(0);
    expect(Number(result.totalAmount)).toBe(Number(quotation.totalAmount));
  });

  it("rejects creation from a DRAFT quotation", async () => {
    const { quotation } = await createQuotation(realCompanyId);
    expect(quotation.status).toBe("DRAFT");

    try {
      await purchaseOrdersService.create(realCompanyId, customerPoInput(quotation.id));
      expect.fail("expected INVALID_STATUS_FOR_PURCHASE_ORDER");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "INVALID_STATUS_FOR_PURCHASE_ORDER" }),
      );
    }
  });

  it("rejects creation from a SENT quotation", async () => {
    const { quotation } = await createQuotation(realCompanyId);
    await quotationsService.send(realCompanyId, quotation.id);

    try {
      await purchaseOrdersService.create(realCompanyId, customerPoInput(quotation.id));
      expect.fail("expected INVALID_STATUS_FOR_PURCHASE_ORDER");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "INVALID_STATUS_FOR_PURCHASE_ORDER" }),
      );
    }
  });

  it("rejects creation from a REJECTED quotation", async () => {
    const { quotation } = await createQuotation(realCompanyId);
    await quotationsService.send(realCompanyId, quotation.id);
    await quotationsService.reject(realCompanyId, quotation.id);

    try {
      await purchaseOrdersService.create(realCompanyId, customerPoInput(quotation.id));
      expect.fail("expected INVALID_STATUS_FOR_PURCHASE_ORDER");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "INVALID_STATUS_FOR_PURCHASE_ORDER" }),
      );
    }
  });

  it("rejects creation from a CANCELLED quotation", async () => {
    const { quotation } = await createQuotation(realCompanyId);
    await quotationsService.cancel(realCompanyId, quotation.id);

    try {
      await purchaseOrdersService.create(realCompanyId, customerPoInput(quotation.id));
      expect.fail("expected INVALID_STATUS_FOR_PURCHASE_ORDER");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "INVALID_STATUS_FOR_PURCHASE_ORDER" }),
      );
    }
  });

  it("rejects creation from an EXPIRED quotation", async () => {
    const { quotation } = await createQuotation(realCompanyId);
    await prisma.quotation.update({
      where: { id: quotation.id },
      data: { status: "EXPIRED" },
    });

    try {
      await purchaseOrdersService.create(realCompanyId, customerPoInput(quotation.id));
      expect.fail("expected INVALID_STATUS_FOR_PURCHASE_ORDER");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "INVALID_STATUS_FOR_PURCHASE_ORDER" }),
      );
    }
  });

  it("rejects creation when customerApprovedAt is missing", async () => {
    const { quotation } = await createApprovedQuotation(realCompanyId);
    await prisma.quotation.update({
      where: { id: quotation.id },
      data: { customerApprovedAt: null },
    });

    try {
      await purchaseOrdersService.create(realCompanyId, customerPoInput(quotation.id));
      expect.fail("expected QUOTATION_NOT_CUSTOMER_APPROVED");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "QUOTATION_NOT_CUSTOMER_APPROVED" }),
      );
    }
  });

  it("rejects a missing quotation without revealing other companies", async () => {
    try {
      await purchaseOrdersService.create(realCompanyId, customerPoInput("non-existent-quotation"));
      expect.fail("expected QUOTATION_NOT_FOUND");
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toEqual(
        expect.objectContaining({ code: "QUOTATION_NOT_FOUND" }),
      );
    }
  });

  it("rejects creation from a quotation belonging to another company", async () => {
    const otherCompanyId = `S${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Foreign PO Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);
    await cleanupSequences(otherCompanyId);

    const { quotation } = await createApprovedQuotation(otherCompanyId);

    try {
      await purchaseOrdersService.create(realCompanyId, customerPoInput(quotation.id));
      expect.fail("expected QUOTATION_NOT_FOUND");
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toEqual(
        expect.objectContaining({ code: "QUOTATION_NOT_FOUND" }),
      );
    }
  });

  it("rejects a second active PO for the same quotation", async () => {
    const { quotation } = await createApprovedQuotation(realCompanyId);
    const first = await purchaseOrdersService.create(
      realCompanyId,
      customerPoInput(quotation.id),
    );
    createdPurchaseOrderIds.push(first.id);

    try {
      await purchaseOrdersService.create(realCompanyId, customerPoInput(quotation.id));
      expect.fail("expected DUPLICATE_ACTIVE_PO_FOR_QUOTATION");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toEqual(
        expect.objectContaining({
          code: "DUPLICATE_ACTIVE_PO_FOR_QUOTATION",
          purchaseOrderId: first.id,
        }),
      );
    }

    const count = await prisma.purchaseOrder.count({ where: { quotationId: quotation.id } });
    expect(count).toBe(1);
  });
});

describe("PurchaseOrdersService cancelled PO slot", () => {
  it("allows a new PO after the previous PO for the same quotation is CANCELLED", async () => {
    const { quotation } = await createApprovedQuotation(realCompanyId);
    const first = await purchaseOrdersService.create(
      realCompanyId,
      customerPoInput(quotation.id, `CPO-A-${randomUUID().slice(0, 6)}`),
    );
    createdPurchaseOrderIds.push(first.id);

    const cancelled = await purchaseOrdersService.cancel(realCompanyId, first.id);
    expect(cancelled.status).toBe("CANCELLED");

    const second = await purchaseOrdersService.create(
      realCompanyId,
      customerPoInput(quotation.id, `CPO-B-${randomUUID().slice(0, 6)}`),
    );
    createdPurchaseOrderIds.push(second.id);

    expect(second.status).toBe("DRAFT");
    expect(second.quotationId).toBe(quotation.id);
    expect(second.id).not.toBe(first.id);

    const stillCancelled = await prisma.purchaseOrder.findFirstOrThrow({
      where: { id: first.id },
    });
    expect(stillCancelled.status).toBe("CANCELLED");
  });
});

describe("PurchaseOrdersService.findAll / findOne", () => {
  it("lists purchase orders for a quotationId filter", async () => {
    const { quotation } = await createApprovedQuotation(realCompanyId);
    const created = await purchaseOrdersService.create(
      realCompanyId,
      customerPoInput(quotation.id),
    );
    createdPurchaseOrderIds.push(created.id);

    const result = await purchaseOrdersService.findAll(realCompanyId, {
      quotationId: quotation.id,
    });
    expect(result.data.some((row) => row.id === created.id)).toBe(true);
    expect(result.data.every((row) => row.quotationId === quotation.id)).toBe(true);
  });

  it("returns a purchase order by id with items", async () => {
    const { quotation } = await createApprovedQuotation(realCompanyId);
    const created = await purchaseOrdersService.create(
      realCompanyId,
      customerPoInput(quotation.id),
    );
    createdPurchaseOrderIds.push(created.id);

    const found = await purchaseOrdersService.findOne(realCompanyId, created.id);
    expect(found.id).toBe(created.id);
    expect(found.items).toHaveLength(1);
  });

  it("throws NotFoundException for a missing PO", async () => {
    try {
      await purchaseOrdersService.findOne(realCompanyId, "missing-po");
      expect.fail("expected PURCHASE_ORDER_NOT_FOUND");
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toEqual(
        expect.objectContaining({ code: "PURCHASE_ORDER_NOT_FOUND" }),
      );
    }
  });
});

describe("PurchaseOrdersService tenant isolation", () => {
  it("throws NotFoundException when accessing a PO from another company", async () => {
    const otherCompanyId = `T${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "List PO Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);
    await cleanupSequences(otherCompanyId);

    const { quotation } = await createApprovedQuotation(otherCompanyId);
    const foreign = await purchaseOrdersService.create(
      otherCompanyId,
      customerPoInput(quotation.id),
    );
    createdPurchaseOrderIds.push(foreign.id);

    await expect(
      purchaseOrdersService.findOne(realCompanyId, foreign.id),
    ).rejects.toBeInstanceOf(NotFoundException);

    const listed = await purchaseOrdersService.findAll(realCompanyId, {
      search: foreign.number,
    });
    expect(listed.data.some((row) => row.id === foreign.id)).toBe(false);
  });
});

describe("PurchaseOrdersService.update", () => {
  it("updates customer PO fields while DRAFT and does not change the quotation source", async () => {
    const { quotation } = await createApprovedQuotation(realCompanyId);
    const created = await purchaseOrdersService.create(
      realCompanyId,
      customerPoInput(quotation.id),
    );
    createdPurchaseOrderIds.push(created.id);

    const nextPoDate = new Date("2026-09-01T00:00:00.000Z");
    const updated = await purchaseOrdersService.update(realCompanyId, created.id, {
      customerPoNumber: `CPO-UPD-${randomUUID().slice(0, 6)}`,
      customerPoDate: nextPoDate,
      notes: "Verified hardcopy",
    });

    expect(updated.quotationId).toBe(quotation.id);
    expect(updated.customerPoDate).toEqual(nextPoDate);
    expect(updated.notes).toBe("Verified hardcopy");
    expect(Number(updated.totalAmount)).toBe(Number(created.totalAmount));
    expect(Number(updated.subtotal)).toBe(Number(created.subtotal));
  });

  it("rejects update when status is APPROVED", async () => {
    const { quotation } = await createApprovedQuotation(realCompanyId);
    const created = await purchaseOrdersService.create(
      realCompanyId,
      customerPoInput(quotation.id),
    );
    createdPurchaseOrderIds.push(created.id);
    await purchaseOrdersService.approve(realCompanyId, created.id, staffUserId);

    await expect(
      purchaseOrdersService.update(realCompanyId, created.id, { notes: "locked" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects update when status is CANCELLED", async () => {
    const { quotation } = await createApprovedQuotation(realCompanyId);
    const created = await purchaseOrdersService.create(
      realCompanyId,
      customerPoInput(quotation.id),
    );
    createdPurchaseOrderIds.push(created.id);
    await purchaseOrdersService.cancel(realCompanyId, created.id);

    await expect(
      purchaseOrdersService.update(realCompanyId, created.id, { notes: "locked" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("PurchaseOrdersService.approve", () => {
  it("approves a DRAFT purchase order without changing the quotation", async () => {
    const { quotation } = await createApprovedQuotation(realCompanyId);
    const created = await purchaseOrdersService.create(
      realCompanyId,
      customerPoInput(quotation.id),
    );
    createdPurchaseOrderIds.push(created.id);

    const approved = await purchaseOrdersService.approve(
      realCompanyId,
      created.id,
      staffUserId,
    );

    expect(approved.status).toBe("APPROVED");
    expect(approved.confirmedByUserId).toBe(staffUserId);
    expect(approved.confirmedAt).toBeInstanceOf(Date);

    const source = await prisma.quotation.findFirstOrThrow({ where: { id: quotation.id } });
    expect(source.status).toBe("APPROVED");
    const workOrderCount = await prisma.workOrder.count({
      where: { purchaseOrderId: created.id },
    });
    expect(workOrderCount).toBe(0);
  });

  it("rejects approving an already APPROVED purchase order", async () => {
    const { quotation } = await createApprovedQuotation(realCompanyId);
    const created = await purchaseOrdersService.create(
      realCompanyId,
      customerPoInput(quotation.id),
    );
    createdPurchaseOrderIds.push(created.id);
    await purchaseOrdersService.approve(realCompanyId, created.id, staffUserId);

    try {
      await purchaseOrdersService.approve(realCompanyId, created.id, staffUserId);
      expect.fail("expected INVALID_STATUS_FOR_APPROVE");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "INVALID_STATUS_FOR_APPROVE" }),
      );
    }
  });

  it("rejects approving a CANCELLED purchase order", async () => {
    const { quotation } = await createApprovedQuotation(realCompanyId);
    const created = await purchaseOrdersService.create(
      realCompanyId,
      customerPoInput(quotation.id),
    );
    createdPurchaseOrderIds.push(created.id);
    await purchaseOrdersService.cancel(realCompanyId, created.id);

    try {
      await purchaseOrdersService.approve(realCompanyId, created.id, staffUserId);
      expect.fail("expected INVALID_STATUS_FOR_APPROVE");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "INVALID_STATUS_FOR_APPROVE" }),
      );
    }
  });
});

describe("PurchaseOrdersService.cancel", () => {
  it("cancels a DRAFT purchase order without deleting the row", async () => {
    const { quotation } = await createApprovedQuotation(realCompanyId);
    const created = await purchaseOrdersService.create(
      realCompanyId,
      customerPoInput(quotation.id),
    );
    createdPurchaseOrderIds.push(created.id);

    const cancelled = await purchaseOrdersService.cancel(realCompanyId, created.id);
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.id).toBe(created.id);

    const persisted = await prisma.purchaseOrder.findFirstOrThrow({ where: { id: created.id } });
    expect(persisted.status).toBe("CANCELLED");
  });

  it("rejects cancelling an APPROVED purchase order", async () => {
    const { quotation } = await createApprovedQuotation(realCompanyId);
    const created = await purchaseOrdersService.create(
      realCompanyId,
      customerPoInput(quotation.id),
    );
    createdPurchaseOrderIds.push(created.id);
    await purchaseOrdersService.approve(realCompanyId, created.id, staffUserId);

    try {
      await purchaseOrdersService.cancel(realCompanyId, created.id);
      expect.fail("expected CANNOT_CANCEL_APPROVED");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "CANNOT_CANCEL_APPROVED" }),
      );
    }
  });

  it("rejects cancelling an already cancelled purchase order", async () => {
    const { quotation } = await createApprovedQuotation(realCompanyId);
    const created = await purchaseOrdersService.create(
      realCompanyId,
      customerPoInput(quotation.id),
    );
    createdPurchaseOrderIds.push(created.id);
    await purchaseOrdersService.cancel(realCompanyId, created.id);

    try {
      await purchaseOrdersService.cancel(realCompanyId, created.id);
      expect.fail("expected ALREADY_CANCELLED");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "ALREADY_CANCELLED" }),
      );
    }
  });
});

describe("PurchaseOrdersService snapshot integrity", () => {
  it("keeps PO commercial values after the source quotation is mutated", async () => {
    await ensureTestTax({
      taxCode: "T1",
      taxRate: 0.11,
      isExclude: true,
      description: "PPN 11%",
    });
    const { quotation } = await createApprovedQuotation(realCompanyId, {
      unitPrice: 100_000,
      taxCode: "T1",
      headerDiscountAmount: 10_000,
      itemDiscountAmount: 5_000,
    });
    const created = await purchaseOrdersService.create(
      realCompanyId,
      customerPoInput(quotation.id),
    );
    createdPurchaseOrderIds.push(created.id);

    const snapshot = {
      subtotal: Number(created.subtotal),
      headerDiscountAmount: Number(created.headerDiscountAmount),
      taxCode: created.taxCode,
      taxRate: Number(created.taxRate),
      taxAmount: Number(created.taxAmount),
      totalAmount: Number(created.totalAmount),
      itemDiscountAmount: Number(created.items[0]?.discountAmount),
      itemUnitPrice: Number(created.items[0]?.unitPrice),
      itemLineTotal: Number(created.items[0]?.lineTotal),
    };

    await prisma.quotation.update({
      where: { id: quotation.id },
      data: {
        subtotal: 1,
        headerDiscountAmount: 0,
        taxCode: "T0",
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 1,
      },
    });
    await prisma.quotationItem.update({
      where: { id: quotation.items[0]!.id },
      data: {
        unitPrice: 1,
        discountAmount: 0,
        lineTotal: 1,
      },
    });

    const reread = await purchaseOrdersService.findOne(realCompanyId, created.id);
    expect(Number(reread.subtotal)).toBe(snapshot.subtotal);
    expect(Number(reread.headerDiscountAmount)).toBe(snapshot.headerDiscountAmount);
    expect(reread.taxCode).toBe(snapshot.taxCode);
    expect(Number(reread.taxRate)).toBe(snapshot.taxRate);
    expect(Number(reread.taxAmount)).toBe(snapshot.taxAmount);
    expect(Number(reread.totalAmount)).toBe(snapshot.totalAmount);
    expect(Number(reread.items[0]?.discountAmount)).toBe(snapshot.itemDiscountAmount);
    expect(Number(reread.items[0]?.unitPrice)).toBe(snapshot.itemUnitPrice);
    expect(Number(reread.items[0]?.lineTotal)).toBe(snapshot.itemLineTotal);
  });
});

describe("PurchaseOrdersService numbering", () => {
  it("uses DocumentNumberService with company-scoped PUR sequence", async () => {
    const firstCtx = await createApprovedQuotation(realCompanyId);
    const first = await purchaseOrdersService.create(
      realCompanyId,
      customerPoInput(firstCtx.quotation.id),
    );
    createdPurchaseOrderIds.push(first.id);

    const secondCtx = await createApprovedQuotation(realCompanyId);
    const second = await purchaseOrdersService.create(
      realCompanyId,
      customerPoInput(secondCtx.quotation.id),
    );
    createdPurchaseOrderIds.push(second.id);

    const firstSeq = Number(first.number.split("/").pop());
    const secondSeq = Number(second.number.split("/").pop());
    expect(secondSeq).toBeGreaterThan(firstSeq);
    expect(first.number.slice(0, 15)).toBe(second.number.slice(0, 15));
    expect(first.number.startsWith("PUR/")).toBe(true);
  });
});

describe("PurchaseOrdersService.buildPdf", () => {
  it("returns a PDF without changing purchase order status", async () => {
    const { quotation } = await createApprovedQuotation(realCompanyId);
    const created = await purchaseOrdersService.create(
      realCompanyId,
      customerPoInput(quotation.id),
    );
    createdPurchaseOrderIds.push(created.id);

    const pdf = await purchaseOrdersService.buildPdf(realCompanyId, created.id);
    expect(pdf.filename).toMatch(/^PKM-PUR-\d{8}-\d{5}\.pdf$/);
    expect(pdf.buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.buffer.length).toBeGreaterThan(100);
    const pdfLatin1 = pdf.buffer.toString("latin1");
    expect(pdfLatin1).toContain("/Subtype /Image");

    const after = await prisma.purchaseOrder.findFirstOrThrow({ where: { id: created.id } });
    expect(after.status).toBe("DRAFT");
  });
});
