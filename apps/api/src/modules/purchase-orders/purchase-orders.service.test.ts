import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { Prisma, prisma } from "@medcal/db";
import { isValidDocumentNumber } from "@medcal/db";
import { purchaseOrderCreateSchema, purchaseOrderUpdateSchema } from "@medcal/shared";
import { CalibrationRequestsService } from "../calibration-requests/calibration-requests.service";
import { QuotationsService } from "../quotations/quotations.service";
import { WorkOrdersService } from "../work-orders/work-orders.service";
import { CalibrationJobsService } from "../calibration-jobs/calibration-jobs.service";
import { DevicesService } from "../devices/devices.service";
import type { FilesService } from "../files/files.service";
import { PurchaseOrdersService } from "./purchase-orders.service";

const purchaseOrdersService = new PurchaseOrdersService();
const quotationsService = new QuotationsService();
const requestsService = new CalibrationRequestsService();
const workOrdersService = new WorkOrdersService();
const calibrationJobsService = new CalibrationJobsService(
  undefined as unknown as FilesService,
  new DevicesService(),
);
const realCompanyId = "PKM";
const staffUserId = "po-staff-user";
const createdPurchaseOrderIds: string[] = [];
const createdWorkOrderIds: string[] = [];
const createdUserIds: string[] = [];
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
  await prisma.user.upsert({
    where: { id: staffUserId },
    create: {
      id: staffUserId,
      email: `${staffUserId}@medcal.test`,
      name: "PO Staff",
      status: "ACTIVE",
    },
    update: {},
  });
  const customer = await createTestCustomer(companyId);
  const deviceTypeId = await getTestDeviceTypeId();
  for (let index = 0; index < itemCount; index += 1) {
    await prisma.device.create({
      data: {
        companyId,
        customerId: customer.id,
        deviceTypeId,
        code: `DVC${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`,
        serialNumber: `DEV-${index + 1}`,
      },
    });
  }
  const created = await requestsService.create(companyId, staffUserId, {
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

async function createApprovedPurchaseOrder(
  companyId: string,
  options?: Parameters<typeof createQuotation>[1],
) {
  const created = await createQuotation(companyId, options);
  const quotation = await approveQuotation(companyId, created.quotation.id);
  const purchaseOrderDraft = await purchaseOrdersService.create(
    companyId,
    customerPoInput(quotation.id),
  );
  createdPurchaseOrderIds.push(purchaseOrderDraft.id);
  const purchaseOrder = await purchaseOrdersService.approve(
    companyId,
    purchaseOrderDraft.id,
    staffUserId,
  );
  return { ...created, quotation, purchaseOrder };
}

async function createTechnician(companyId: string) {
  const user = await prisma.user.create({
    data: {
      email: `po-tech-${randomUUID().slice(0, 8)}@kalibrasimedika.co.id`,
      name: "PO Technician",
      status: "ACTIVE",
    },
  });
  createdUserIds.push(user.id);
  await prisma.userMembership.create({
    data: { userId: user.id, companyId, role: "TECHNICIAN", isDefault: false },
  });
  return user;
}

async function createManager(companyId: string) {
  const user = await prisma.user.create({
    data: {
      email: `po-mgr-${randomUUID().slice(0, 8)}@kalibrasimedika.co.id`,
      name: "PO Manager",
      status: "ACTIVE",
    },
  });
  createdUserIds.push(user.id);
  await prisma.userMembership.create({
    data: { userId: user.id, companyId, role: "TECHNICIAN_MANAGER", isDefault: false },
  });
  return user;
}

/**
 * A single DIRECT_REPLICATES/NUMBER calibration parameter (default
 * entryStyle/valueType) on the given DeviceType — Phase 9's
 * measurement-completeness split needs at least one real, eligible
 * parameter to distinguish "in progress" (unfilled) from "measurement
 * complete" (filled), which a bare getTestDeviceTypeId() device type
 * (zero parameters) cannot exercise — an empty requirement set is
 * trivially always "complete".
 */
async function createCalibrationParameter(deviceTypeId: string) {
  const capability = await prisma.deviceCapability.create({
    data: { code: `CAP${randomUUID().slice(0, 8).toUpperCase()}`, name: "Test Capability" },
  });
  const item = await prisma.deviceCapabilityItem.create({
    data: { capabilityId: capability.id, name: "Test Item" },
  });
  return prisma.deviceCalibrationParameter.create({
    data: {
      deviceTypeId,
      capabilityItemId: item.id,
      code: `PRM${randomUUID().slice(0, 8).toUpperCase()}`,
      name: "Test Parameter",
    },
  });
}

/** Builds a full chain (Requisition -> Quotation -> PO -> WorkOrder) so the
 * cross-chain safety guard tests can put a WorkOrder into IN_PROGRESS. */
async function createWorkOrderFor(companyId: string, purchaseOrderId: string) {
  const workOrder = await workOrdersService.create(companyId, { purchaseOrderId });
  createdWorkOrderIds.push(workOrder.id);
  return workOrder;
}

afterAll(async () => {
  if (createdWorkOrderIds.length > 0) {
    // Allocation & Multi-WOL Architecture (Phase 9): some tests write real
    // Certificate/MeasurementResult/QualityReview rows against these jobs —
    // must be cleared before the CalibrationJob rows they reference.
    const jobIds = (
      await prisma.calibrationJob.findMany({
        where: { workOrderId: { in: createdWorkOrderIds } },
        select: { id: true },
      })
    ).map((job) => job.id);
    if (jobIds.length > 0) {
      await prisma.certificate.deleteMany({ where: { calibrationJobId: { in: jobIds } } });
      await prisma.measurementResult.deleteMany({ where: { calibrationJobId: { in: jobIds } } });
      await prisma.qualityReview.deleteMany({ where: { calibrationJobId: { in: jobIds } } });
    }
    await prisma.calibrationJob.deleteMany({ where: { workOrderId: { in: createdWorkOrderIds } } });
    await prisma.workOrderItem.deleteMany({ where: { workOrderId: { in: createdWorkOrderIds } } });
    await prisma.workOrder.deleteMany({ where: { id: { in: createdWorkOrderIds } } });
  }
  if (createdUserIds.length > 0) {
    await prisma.userMembership.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await cleanupPurchaseOrders();
  if (createdTaxIds.length > 0) {
    await prisma.tax.deleteMany({ where: { id: { in: createdTaxIds } } });
  }
  await cleanupQuotations(createdQuotationIds);
  await cleanupCalibrationRequests(createdCalibrationRequestIds);
  if (createdCustomerIds.length > 0) {
    // Devices created for Serial No resolution reference deviceType — clear
    // them (scoped to this file's own test customers) before deviceType cleanup.
    await prisma.device.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
  }
  if (createdDeviceTypeIds.length > 0) {
    await prisma.priceListItem.deleteMany({ where: { deviceTypeId: { in: createdDeviceTypeIds } } });
    // Allocation & Multi-WOL Architecture (Phase 9): calibration parameters
    // created for the measurement-completeness tests reference deviceType —
    // clear the whole chain (parameter -> capabilityItem -> capability)
    // before deviceType cleanup.
    const parameters = await prisma.deviceCalibrationParameter.findMany({
      where: { deviceTypeId: { in: createdDeviceTypeIds } },
      select: { id: true, capabilityItemId: true },
    });
    if (parameters.length > 0) {
      const capabilityItemIds = [...new Set(parameters.map((p) => p.capabilityItemId))];
      const capabilityItems = await prisma.deviceCapabilityItem.findMany({
        where: { id: { in: capabilityItemIds } },
        select: { capabilityId: true },
      });
      await prisma.deviceCalibrationParameter.deleteMany({
        where: { id: { in: parameters.map((p) => p.id) } },
      });
      await prisma.deviceCapabilityItem.deleteMany({ where: { id: { in: capabilityItemIds } } });
      await prisma.deviceCapability.deleteMany({
        where: { id: { in: [...new Set(capabilityItems.map((c) => c.capabilityId))] } },
      });
    }
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

// =============================================================================
// MOM #1 — Transaction Revision + Immutable History
// =============================================================================

describe("PurchaseOrdersService.revise", () => {
  it("rejects revise on a DRAFT purchase order", async () => {
    const { quotation } = await createApprovedQuotation(realCompanyId);
    const created = await purchaseOrdersService.create(realCompanyId, customerPoInput(quotation.id));
    createdPurchaseOrderIds.push(created.id);

    await expect(
      purchaseOrdersService.revise(realCompanyId, created.id, staffUserId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects revise when the quotation has no additional scope to pick up", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);

    await expect(
      purchaseOrdersService.revise(realCompanyId, purchaseOrder.id, staffUserId),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "NO_PENDING_SCOPE_CHANGE" }),
    });
  });

  it("1 -> 3: pulls the quotation's revised scope as an additive sibling PurchaseOrderItem, number stays stable", async () => {
    const { quotation, purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, {
      unitPrice: 100_000,
    });
    expect(purchaseOrder.items).toHaveLength(1);
    expect(Number(purchaseOrder.items[0]!.qty)).toBe(1);
    const originalPoItemId = purchaseOrder.items[0]!.id;

    // Grow the quotation's scope first (Quotation-level revision) — the item
    // is already consumed by this PO, so QuotationsService.revise() must add
    // an additive sibling QuotationItem rather than mutate in place.
    await quotationsService.revise(realCompanyId, quotation.id, staffUserId, {
      items: [
        {
          id: quotation.items[0]!.id,
          requestItemId: quotation.items[0]!.requestItemId!,
          unitPrice: Number(quotation.items[0]!.unitPrice),
          qty: 3,
        },
      ],
    });

    const revised = await purchaseOrdersService.revise(realCompanyId, purchaseOrder.id, staffUserId);

    expect(revised.number).toBe(purchaseOrder.number);
    expect(revised.items).toHaveLength(2);
    const originalRow = revised.items.find((item) => item.id === originalPoItemId)!;
    expect(Number(originalRow.qty)).toBe(1); // frozen — never mutated
    const siblingRow = revised.items.find((item) => item.id !== originalPoItemId)!;
    expect(Number(siblingRow.qty)).toBe(2); // delta only
    expect(Number(revised.totalAmount)).toBe(3 * 100_000);

    const history = await purchaseOrdersService.listHistory(realCompanyId, purchaseOrder.id);
    expect(history.map((h) => h.revisionNumber)).toEqual([1]);
    const rev1 = await purchaseOrdersService.getHistoryRevision(realCompanyId, purchaseOrder.id, 1);
    expect(rev1.items).toHaveLength(1); // pre-revision snapshot: only the original item
    expect(Number(rev1.items[0]!.qty)).toBe(1);

    // Calling revise() again immediately (no further quotation growth) is a no-op error.
    await expect(
      purchaseOrdersService.revise(realCompanyId, purchaseOrder.id, staffUserId),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "NO_PENDING_SCOPE_CHANGE" }),
    });
  });

  // ===========================================================================
  // MOM #1 — Final Revision Scope Design (active-scope pull reconciliation)
  // ===========================================================================

  it("retire: removing a consumed Quotation line already picked up by a WorkOrder sets PurchaseOrderItemStatus.CANCELLED (never a hard delete), preserving the other active item untouched", async () => {
    const { quotation, purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, {
      itemCount: 2,
    });
    expect(purchaseOrder.items).toHaveLength(2);
    const [itemA, itemB] = purchaseOrder.items;
    const workOrder = await createWorkOrderFor(realCompanyId, purchaseOrder.id);
    expect(workOrder.items).toHaveLength(2);

    // Remove itemA's Quotation line (unconsumed at the Quotation level is
    // impossible here — a PO already exists — so this exercises the
    // consumed-removal/retire path at the Quotation level too).
    const quotationItemA = quotation.items.find(
      (qi) => qi.id === itemA!.quotationItemId,
    )!;
    await quotationsService.revise(realCompanyId, quotation.id, staffUserId, {
      items: quotation.items
        .filter((qi) => qi.id !== quotationItemA.id)
        .map((qi) => ({
          id: qi.id,
          requestItemId: qi.requestItemId!,
          unitPrice: Number(qi.unitPrice),
          qty: Number(qi.qty),
        })),
    });

    const revised = await purchaseOrdersService.revise(realCompanyId, purchaseOrder.id, staffUserId);

    expect(revised.items).toHaveLength(1); // CANCELLED item filtered out of the active view
    expect(revised.items[0]!.id).toBe(itemB!.id);
    expect(Number(revised.items[0]!.qty)).toBe(Number(itemB!.qty)); // preserved, untouched

    const retiredRow = await prisma.purchaseOrderItem.findUniqueOrThrow({
      where: { id: itemA!.id },
    });
    expect(retiredRow.status).toBe("CANCELLED");
    expect(Number(retiredRow.qty)).toBe(Number(itemA!.qty)); // frozen — never mutated
  });

  it("cross-chain safety guard: retiring a consumed item is rejected once its WorkOrder has left PLANNED/ASSIGNED", async () => {
    // A second, independent PurchaseOrderItem (itemB) is kept active
    // throughout, purely so its WorkOrder has a second item and does not
    // trip an unrelated "empty document" guard anywhere.
    const { quotation, purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, {
      itemCount: 2,
    });
    const [itemA] = purchaseOrder.items;
    const workOrder = await createWorkOrderFor(realCompanyId, purchaseOrder.id);

    // Retire itemA's Quotation line WHILE the WorkOrder is still PLANNED —
    // safe at this point, so the guard correctly allows it here.
    const quotationItemA = quotation.items.find((qi) => qi.id === itemA!.quotationItemId)!;
    await quotationsService.revise(realCompanyId, quotation.id, staffUserId, {
      items: quotation.items
        .filter((qi) => qi.id !== quotationItemA.id)
        .map((qi) => ({
          id: qi.id,
          requestItemId: qi.requestItemId!,
          unitPrice: Number(qi.unitPrice),
          qty: Number(qi.qty),
        })),
    });

    // Now advance the WorkOrder past PLANNED/ASSIGNED BEFORE the PO-level
    // reconciliation has had a chance to run — the exact ordering the guard
    // exists to protect: PurchaseOrder.revise() has not yet retired itemA,
    // so its WorkOrderItem is still present when start() fans out jobs.
    const technician = await createTechnician(realCompanyId);
    await workOrdersService.assign(realCompanyId, workOrder.id, {
      technicians: [{ technicianUserId: technician.id, roleOnJob: "LEAD" }],
    });
    await workOrdersService.start(realCompanyId, workOrder.id);

    await expect(
      purchaseOrdersService.revise(realCompanyId, purchaseOrder.id, staffUserId),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "RETIREMENT_BLOCKED_BY_WORK_ORDER_PROGRESS" }),
    });

    // Rolled back completely: the PurchaseOrderItem must remain exactly as
    // it was (still OPEN, still active), not partially retired.
    const unchangedRow = await prisma.purchaseOrderItem.findUniqueOrThrow({
      where: { id: itemA!.id },
    });
    expect(unchangedRow.status).not.toBe("CANCELLED");
  });
});

/**
 * A single PurchaseOrderItem at an arbitrary quantity (unlike
 * createApprovedPurchaseOrder's one-device-per-item helper, whose items are
 * always qty=1). Local to this describe block — mirrors the equivalent
 * helper in work-orders.service.test.ts.
 */
async function createApprovedPurchaseOrderWithSingleItemQty(companyId: string, qty: number) {
  await ensureNonPpnTax(companyId);
  const customer = await createTestCustomer(companyId);
  const deviceTypeId = await getTestDeviceTypeId();
  await seedPrice(companyId, deviceTypeId, 100_000);
  await prisma.user.upsert({
    where: { id: staffUserId },
    create: { id: staffUserId, email: `${staffUserId}@medcal.test`, name: "PO Staff", status: "ACTIVE" },
    update: {},
  });

  const request = await requestsService.create(companyId, staffUserId, {
    customerId: customer.id,
    serviceMode: "ON_SITE",
    items: [{ deviceTypeId, qty }],
  });
  createdCalibrationRequestIds.push(request.id);
  const submitted = await requestsService.submit(companyId, request.id);

  const quotation = await quotationsService.create(companyId, {
    requestId: submitted.id,
    taxCode: "T0",
  });
  createdQuotationIds.push(quotation.id);
  const approvedQuotation = await approveQuotation(companyId, quotation.id);

  const createdPo = await purchaseOrdersService.create(companyId, customerPoInput(approvedQuotation.id));
  createdPurchaseOrderIds.push(createdPo.id);
  const purchaseOrder = await purchaseOrdersService.approve(companyId, createdPo.id, staffUserId);
  return { customer, purchaseOrder, deviceTypeId };
}

describe("PurchaseOrdersService.getAllocationSummary — Phase 7 (Plan WOL/SPK UI)", () => {
  it("reports full remaining quantity and no allocations when nothing has claimed the PO yet", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, { itemCount: 2 });

    const summary = await purchaseOrdersService.getAllocationSummary(
      realCompanyId,
      purchaseOrder.id,
    );

    expect(summary.purchaseOrderId).toBe(purchaseOrder.id);
    expect(summary.items).toHaveLength(2);
    for (const item of summary.items) {
      expect(item.allocatedQty).toBe(0);
      expect(item.remainingQty).toBe(item.qty);
      expect(item.allocations).toHaveLength(0);
    }
  });

  it("reflects a whole-item allocation: allocatedQty = qty, remainingQty = 0, one allocation row referencing the WorkOrder", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, { itemCount: 1 });
    const workOrder = await createWorkOrderFor(realCompanyId, purchaseOrder.id);

    const summary = await purchaseOrdersService.getAllocationSummary(
      realCompanyId,
      purchaseOrder.id,
    );

    expect(summary.items).toHaveLength(1);
    const [item] = summary.items;
    expect(item!.allocatedQty).toBe(item!.qty);
    expect(item!.remainingQty).toBe(0);
    expect(item!.allocations).toHaveLength(1);
    expect(item!.allocations[0]).toMatchObject({
      workOrderId: workOrder.id,
      workOrderNumber: workOrder.number,
      qty: item!.qty,
    });
  });

  it("reflects a partial allocation across two sibling WorkOrders", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrderWithSingleItemQty(
      realCompanyId,
      100,
    );
    const item = await prisma.purchaseOrderItem.findFirstOrThrow({
      where: { purchaseOrderId: purchaseOrder.id },
    });

    const woA = await workOrdersService.create(realCompanyId, {
      purchaseOrderId: purchaseOrder.id,
      items: [{ purchaseOrderItemId: item.id, qty: 40 }],
    });
    createdWorkOrderIds.push(woA.id);
    const woB = await workOrdersService.create(realCompanyId, {
      purchaseOrderId: purchaseOrder.id,
      items: [{ purchaseOrderItemId: item.id, qty: 30 }],
    });
    createdWorkOrderIds.push(woB.id);

    const summary = await purchaseOrdersService.getAllocationSummary(
      realCompanyId,
      purchaseOrder.id,
    );
    const [summaryItem] = summary.items;
    expect(summaryItem!.qty).toBe(100);
    expect(summaryItem!.allocatedQty).toBe(70);
    expect(summaryItem!.remainingQty).toBe(30);
    expect(summaryItem!.allocations.map((a) => a.workOrderId).sort()).toEqual(
      [woA.id, woB.id].sort(),
    );
  });

  it("excludes CANCELLED allocations from allocatedQty and includes their released quantity in remainingQty", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, { itemCount: 1 });
    const workOrder = await createWorkOrderFor(realCompanyId, purchaseOrder.id);
    await workOrdersService.cancel(realCompanyId, workOrder.id);

    const summary = await purchaseOrdersService.getAllocationSummary(
      realCompanyId,
      purchaseOrder.id,
    );
    const [item] = summary.items;
    expect(item!.allocatedQty).toBe(0);
    expect(item!.remainingQty).toBe(item!.qty);
    expect(item!.allocations).toHaveLength(0);
  });
});

describe("PurchaseOrdersService.getWorkOrderSummaries — Phase 8 (PO Detail multi-WorkOrder view)", () => {
  it("returns an empty array for a PO with zero WorkOrders", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const summaries = await purchaseOrdersService.getWorkOrderSummaries(
      realCompanyId,
      purchaseOrder.id,
    );
    expect(summaries).toEqual([]);
  });

  it("returns one summary for a PO with one WorkOrder, with the correct item/qty totals", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, { itemCount: 2 });
    const workOrder = await createWorkOrderFor(realCompanyId, purchaseOrder.id);

    const summaries = await purchaseOrdersService.getWorkOrderSummaries(
      realCompanyId,
      purchaseOrder.id,
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      id: workOrder.id,
      number: workOrder.number,
      status: "PLANNED",
      itemCount: 2,
    });
    expect(summaries[0]!.totalQty).toBe(2); // itemCount:2 fixture = qty 1 each
  });

  it("returns multiple simultaneously active WorkOrders, never duplicated, each with its own item/qty totals (Allocation & Multi-WOL Architecture)", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrderWithSingleItemQty(
      realCompanyId,
      100,
    );
    const item = await prisma.purchaseOrderItem.findFirstOrThrow({
      where: { purchaseOrderId: purchaseOrder.id },
    });
    const woA = await workOrdersService.create(realCompanyId, {
      purchaseOrderId: purchaseOrder.id,
      items: [{ purchaseOrderItemId: item.id, qty: 40 }],
    });
    createdWorkOrderIds.push(woA.id);
    const woB = await workOrdersService.create(realCompanyId, {
      purchaseOrderId: purchaseOrder.id,
      items: [{ purchaseOrderItemId: item.id, qty: 30 }],
    });
    createdWorkOrderIds.push(woB.id);

    const summaries = await purchaseOrdersService.getWorkOrderSummaries(
      realCompanyId,
      purchaseOrder.id,
    );
    expect(summaries).toHaveLength(2);
    expect(new Set(summaries.map((s) => s.id))).toEqual(new Set([woA.id, woB.id]));
    const byId = new Map(summaries.map((s) => [s.id, s]));
    expect(byId.get(woA.id)).toMatchObject({ itemCount: 1, totalQty: 40 });
    expect(byId.get(woB.id)).toMatchObject({ itemCount: 1, totalQty: 30 });
  });

  it("keeps a cancelled WorkOrder visible and distinguishable, never silently hidden", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const workOrder = await createWorkOrderFor(realCompanyId, purchaseOrder.id);
    await workOrdersService.cancel(realCompanyId, workOrder.id);

    const summaries = await purchaseOrdersService.getWorkOrderSummaries(
      realCompanyId,
      purchaseOrder.id,
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ id: workOrder.id, status: "CANCELLED" });
  });

  it("does not query or depend on CalibrationJob data (bounded by WorkOrderItem count only)", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, { itemCount: 1 });
    const workOrder = await createWorkOrderFor(realCompanyId, purchaseOrder.id);
    const technician = await createTechnician(realCompanyId);
    await workOrdersService.assign(realCompanyId, workOrder.id, {
      technicians: [{ technicianUserId: technician.id, roleOnJob: "LEAD" }],
    });
    await workOrdersService.start(realCompanyId, workOrder.id);
    expect(await prisma.calibrationJob.count({ where: { workOrderId: workOrder.id } })).toBe(1);

    // Summary must still report the WorkOrderItem-derived totals (1 item,
    // qty 1) regardless of how many CalibrationJobs exist underneath it.
    const summaries = await purchaseOrdersService.getWorkOrderSummaries(
      realCompanyId,
      purchaseOrder.id,
    );
    expect(summaries[0]).toMatchObject({ itemCount: 1, totalQty: 1, status: "IN_PROGRESS" });
  });
});

async function assignAndStartWorkOrder(companyId: string, workOrderId: string, technicianId: string) {
  await workOrdersService.assign(companyId, workOrderId, {
    technicians: [{ technicianUserId: technicianId, roleOnJob: "LEAD" }],
  });
  return workOrdersService.start(companyId, workOrderId);
}

function bucketSumExcludingCancelled(buckets: {
  unallocated: number;
  allocatedNotStarted: number;
  inProgress: number;
  measurementComplete: number;
  submitted: number;
  qaAccepted: number;
  certificateIssued: number;
}): number {
  return (
    buckets.unallocated +
    buckets.allocatedNotStarted +
    buckets.inProgress +
    buckets.measurementComplete +
    buckets.submitted +
    buckets.qaAccepted +
    buckets.certificateIssued
  );
}

describe("PurchaseOrdersService.getProgress — Phase 9 (PO Progress)", () => {
  it("throws NotFoundException for a PO that does not exist", async () => {
    await expect(
      purchaseOrdersService.getProgress(realCompanyId, "missing-po-id"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("a PO with zero WorkOrders reports everything as unallocated and is not complete", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, { itemCount: 2 });
    const progress = await purchaseOrdersService.getProgress(realCompanyId, purchaseOrder.id);
    expect(progress.totalQty).toBe(2);
    expect(progress.buckets.unallocated).toBe(2);
    expect(
      bucketSumExcludingCancelled(progress.buckets) - progress.buckets.unallocated,
    ).toBe(0);
    expect(progress.buckets.cancelled).toBe(0);
    expect(progress.isComplete).toBe(false);
  });

  it("an allocated WorkOrder that hasn't started yet (pre-fan-out) is reported as allocatedNotStarted", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, { itemCount: 1 });
    await createWorkOrderFor(realCompanyId, purchaseOrder.id); // PLANNED, never started
    const progress = await purchaseOrdersService.getProgress(realCompanyId, purchaseOrder.id);
    expect(progress.buckets.unallocated).toBe(0);
    expect(progress.buckets.allocatedNotStarted).toBe(1);
    expect(progress.isComplete).toBe(false);
  });

  it("a freshly fanned-out PENDING job is mapped into allocatedNotStarted (documented mapping), not inProgress", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, { itemCount: 1 });
    const wo = await createWorkOrderFor(realCompanyId, purchaseOrder.id);
    const tech = await createTechnician(realCompanyId);
    await assignAndStartWorkOrder(realCompanyId, wo.id, tech.id); // fans out 1 PENDING job

    const progress = await purchaseOrdersService.getProgress(realCompanyId, purchaseOrder.id);
    expect(progress.buckets.allocatedNotStarted).toBe(1);
    expect(progress.buckets.inProgress).toBe(0);
  });

  it("an IN_PROGRESS job with an unfilled calibration parameter is reported as inProgress, not measurementComplete", async () => {
    const { purchaseOrder, deviceTypeId } = await createApprovedPurchaseOrderWithSingleItemQty(
      realCompanyId,
      1,
    );
    await createCalibrationParameter(deviceTypeId);
    const wo = await createWorkOrderFor(realCompanyId, purchaseOrder.id);
    const tech = await createTechnician(realCompanyId);
    await assignAndStartWorkOrder(realCompanyId, wo.id, tech.id);
    const job = await prisma.calibrationJob.findFirstOrThrow({ where: { workOrderId: wo.id } });
    await calibrationJobsService.start(realCompanyId, job.id);

    const progress = await purchaseOrdersService.getProgress(realCompanyId, purchaseOrder.id);
    expect(progress.buckets.inProgress).toBe(1);
    expect(progress.buckets.measurementComplete).toBe(0);
  });

  it("an IN_PROGRESS job with its calibration parameter filled is reported as measurementComplete", async () => {
    const { purchaseOrder, deviceTypeId } = await createApprovedPurchaseOrderWithSingleItemQty(
      realCompanyId,
      1,
    );
    const param = await createCalibrationParameter(deviceTypeId);
    const wo = await createWorkOrderFor(realCompanyId, purchaseOrder.id);
    const tech = await createTechnician(realCompanyId);
    await assignAndStartWorkOrder(realCompanyId, wo.id, tech.id);
    const job = await prisma.calibrationJob.findFirstOrThrow({ where: { workOrderId: wo.id } });
    await calibrationJobsService.start(realCompanyId, job.id);
    await prisma.measurementResult.create({
      data: {
        companyId: realCompanyId,
        calibrationJobId: job.id,
        deviceCalibrationParameterId: param.id,
        replicateIndex: 1,
        attemptNumber: 1,
        measuredValue: 10,
        measuredText: null,
      },
    });

    const progress = await purchaseOrdersService.getProgress(realCompanyId, purchaseOrder.id);
    expect(progress.buckets.inProgress).toBe(0);
    expect(progress.buckets.measurementComplete).toBe(1);
  });

  it("a SUBMITTED job is reported as submitted", async () => {
    // Bare device type (getTestDeviceTypeId, zero parameters) — an empty
    // requirement set is trivially measurement-complete, so this job can be
    // submitted immediately, isolating the SUBMITTED bucket specifically.
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, { itemCount: 1 });
    const wo = await createWorkOrderFor(realCompanyId, purchaseOrder.id);
    const tech = await createTechnician(realCompanyId);
    await assignAndStartWorkOrder(realCompanyId, wo.id, tech.id);
    const job = await prisma.calibrationJob.findFirstOrThrow({ where: { workOrderId: wo.id } });
    await calibrationJobsService.start(realCompanyId, job.id);
    await calibrationJobsService.submitForReview(realCompanyId, job.id);

    const progress = await purchaseOrdersService.getProgress(realCompanyId, purchaseOrder.id);
    expect(progress.buckets.submitted).toBe(1);
  });

  it("an ACCEPTED_BY_QA job with no issued certificate is reported as qaAccepted, and the PO is not complete", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, { itemCount: 1 });
    const wo = await createWorkOrderFor(realCompanyId, purchaseOrder.id);
    const tech = await createTechnician(realCompanyId);
    const manager = await createManager(realCompanyId);
    await assignAndStartWorkOrder(realCompanyId, wo.id, tech.id);
    const job = await prisma.calibrationJob.findFirstOrThrow({ where: { workOrderId: wo.id } });
    await calibrationJobsService.start(realCompanyId, job.id);
    await calibrationJobsService.submitForReview(realCompanyId, job.id);
    await calibrationJobsService.decideQualityReview(realCompanyId, job.id, manager.id, {
      decision: "APPROVE",
    });
    await calibrationJobsService.complete(realCompanyId, job.id);

    const progress = await purchaseOrdersService.getProgress(realCompanyId, purchaseOrder.id);
    expect(progress.buckets.qaAccepted).toBe(1);
    expect(progress.buckets.certificateIssued).toBe(0);
    expect(progress.isComplete).toBe(false);
  });

  it("an ACCEPTED_BY_QA job with an ISSUED certificate is reported as certificateIssued, and the PO becomes complete", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, { itemCount: 1 });
    const wo = await createWorkOrderFor(realCompanyId, purchaseOrder.id);
    const tech = await createTechnician(realCompanyId);
    const manager = await createManager(realCompanyId);
    await assignAndStartWorkOrder(realCompanyId, wo.id, tech.id);
    const job = await prisma.calibrationJob.findFirstOrThrow({ where: { workOrderId: wo.id } });
    await calibrationJobsService.start(realCompanyId, job.id);
    await calibrationJobsService.submitForReview(realCompanyId, job.id);
    await calibrationJobsService.decideQualityReview(realCompanyId, job.id, manager.id, {
      decision: "APPROVE",
    });
    await calibrationJobsService.complete(realCompanyId, job.id);

    // Certificate issuance is a separate, unmodified subsystem (Phase 9 does
    // not touch it) — seed a realistic ISSUED row directly, matching its
    // real shape, rather than re-exercising the file-upload HTTP path.
    const device = await prisma.device.findFirstOrThrow({
      where: { customerId: purchaseOrder.customerId },
    });
    await prisma.calibrationJob.update({ where: { id: job.id }, data: { deviceId: device.id } });
    await prisma.certificate.create({
      data: {
        companyId: realCompanyId,
        customerId: purchaseOrder.customerId,
        deviceId: device.id,
        calibrationJobId: job.id,
        number: `CER/TEST/${randomUUID().slice(0, 8).toUpperCase()}`,
        status: "ISSUED",
      },
    });

    const progress = await purchaseOrdersService.getProgress(realCompanyId, purchaseOrder.id);
    expect(progress.buckets.qaAccepted).toBe(0);
    expect(progress.buckets.certificateIssued).toBe(1);
    expect(progress.isComplete).toBe(true);
  });

  it("REGRESSION: jobs under a CANCELLED WorkOrder never count toward progress and never block completion — released quantity flows through a replacement WorkOrder instead", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrderWithSingleItemQty(realCompanyId, 40);
    const item = await prisma.purchaseOrderItem.findFirstOrThrow({
      where: { purchaseOrderId: purchaseOrder.id },
    });
    const tech = await createTechnician(realCompanyId);

    const woA = await workOrdersService.create(realCompanyId, {
      purchaseOrderId: purchaseOrder.id,
      items: [{ purchaseOrderItemId: item.id, qty: 40 }],
    });
    createdWorkOrderIds.push(woA.id);
    await assignAndStartWorkOrder(realCompanyId, woA.id, tech.id); // 40 PENDING jobs

    let progress = await purchaseOrdersService.getProgress(realCompanyId, purchaseOrder.id);
    expect(progress.buckets.allocatedNotStarted).toBe(40);
    expect(progress.buckets.unallocated).toBe(0);

    await workOrdersService.cancel(realCompanyId, woA.id);

    progress = await purchaseOrdersService.getProgress(realCompanyId, purchaseOrder.id);
    // The 40 orphaned jobs under the now-CANCELLED WorkOrder must be
    // completely invisible to buckets 1–7 — released back to unallocated,
    // never counted as still "allocated" or "in progress".
    expect(progress.buckets.unallocated).toBe(40);
    expect(progress.buckets.allocatedNotStarted).toBe(0);
    expect(progress.buckets.cancelled).toBe(40);
    expect(bucketSumExcludingCancelled(progress.buckets)).toBe(40);
    expect(progress.isComplete).toBe(false);

    // Reallocate the released 40 into a brand-new, replacement WorkOrder —
    // the intentional cancel-and-replace lifecycle (architecture clarification).
    const woB = await workOrdersService.create(realCompanyId, {
      purchaseOrderId: purchaseOrder.id,
      items: [{ purchaseOrderItemId: item.id, qty: 40 }],
    });
    createdWorkOrderIds.push(woB.id);
    await assignAndStartWorkOrder(realCompanyId, woB.id, tech.id); // 40 fresh PENDING jobs

    progress = await purchaseOrdersService.getProgress(realCompanyId, purchaseOrder.id);
    expect(progress.buckets.unallocated).toBe(0);
    expect(progress.buckets.allocatedNotStarted).toBe(40); // WOL B's jobs only
    expect(progress.buckets.cancelled).toBe(40); // WOL A's orphans — still separately visible, unaffected
    // The critical assertion: never 80. WOL A's 40 orphaned jobs must never
    // be double-counted alongside WOL B's 40 fresh ones.
    expect(bucketSumExcludingCancelled(progress.buckets)).toBe(40);
  });

  it("quantity aggregation across two simultaneously active sibling WorkOrders combines correctly without merging identity", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrderWithSingleItemQty(realCompanyId, 70);
    const item = await prisma.purchaseOrderItem.findFirstOrThrow({
      where: { purchaseOrderId: purchaseOrder.id },
    });
    const tech = await createTechnician(realCompanyId);

    const woA = await workOrdersService.create(realCompanyId, {
      purchaseOrderId: purchaseOrder.id,
      items: [{ purchaseOrderItemId: item.id, qty: 40 }],
    });
    createdWorkOrderIds.push(woA.id);
    await assignAndStartWorkOrder(realCompanyId, woA.id, tech.id); // 40 PENDING

    const woB = await workOrdersService.create(realCompanyId, {
      purchaseOrderId: purchaseOrder.id,
      items: [{ purchaseOrderItemId: item.id, qty: 30 }],
    });
    createdWorkOrderIds.push(woB.id);
    // WOL B is deliberately left PLANNED (never started), to prove the
    // pre-fan-out allocatedNotStarted path aggregates correctly alongside
    // WOL A's post-fan-out (PENDING-job) allocatedNotStarted contribution.

    const progress = await purchaseOrdersService.getProgress(realCompanyId, purchaseOrder.id);
    expect(progress.totalQty).toBe(70);
    expect(progress.buckets.unallocated).toBe(0);
    expect(progress.buckets.allocatedNotStarted).toBe(70); // 40 (WOL A jobs) + 30 (WOL B pre-fan-out)
  });

  it("buckets 1-7 always sum to the PO's total ordered quantity; bucket 8 (cancelled) is reported separately", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, { itemCount: 3 });
    const progress = await purchaseOrdersService.getProgress(realCompanyId, purchaseOrder.id);
    expect(bucketSumExcludingCancelled(progress.buckets)).toBe(progress.totalQty);
  });
});
