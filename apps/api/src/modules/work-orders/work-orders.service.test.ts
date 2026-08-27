import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@medcal/db";
import { isValidDocumentNumber } from "@medcal/db";
import {
  workOrderAssignSchema,
  workOrderCreateSchema,
  workOrderUpdateSchema,
} from "@medcal/shared";
import { CalibrationRequestsService } from "../calibration-requests/calibration-requests.service";
import { QuotationsService } from "../quotations/quotations.service";
import { PurchaseOrdersService } from "../purchase-orders/purchase-orders.service";
import { WorkOrdersService } from "./work-orders.service";

const workOrdersService = new WorkOrdersService();
const purchaseOrdersService = new PurchaseOrdersService();
const quotationsService = new QuotationsService();
const requestsService = new CalibrationRequestsService();
const realCompanyId = "PKM";
const staffUserId = "wo-staff-user";
const createdWorkOrderIds: string[] = [];
const createdPurchaseOrderIds: string[] = [];
const createdQuotationIds: string[] = [];
const createdCalibrationRequestIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdCompanyIds: string[] = [];
const createdDeviceTypeIds: string[] = [];
const createdDeviceCategoryIds: string[] = [];
const createdTaxIds: string[] = [];
const createdUserIds: string[] = [];
let testDeviceTypeId: string | undefined;

async function cleanupWorkOrders() {
  if (createdWorkOrderIds.length > 0) {
    await prisma.workOrder.deleteMany({ where: { id: { in: createdWorkOrderIds } } });
  }
}

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
      documentType: { in: ["WORK_ORDER", "PURCHASE_ORDER", "QUOTATION", "CALIBRATION_REQUEST"] },
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

async function createSubmittedRequest(
  companyId: string,
  itemCount = 1,
  serviceMode: "ON_SITE" | "SEND_TO_LAB" = "ON_SITE",
): Promise<{
  customerId: string;
  request: Awaited<ReturnType<CalibrationRequestsService["submit"]>>;
}> {
  const customer = await createTestCustomer(companyId);
  const deviceTypeId = await getTestDeviceTypeId();
  const created = await requestsService.create(companyId, {
    customerId: customer.id,
    serviceMode,
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

async function createQuotation(
  companyId: string,
  options?: {
    itemCount?: number;
    unitPrice?: number;
    serviceMode?: "ON_SITE" | "SEND_TO_LAB";
  },
) {
  await ensureNonPpnTax(companyId);
  const { customerId, request } = await createSubmittedRequest(
    companyId,
    options?.itemCount ?? 1,
    options?.serviceMode ?? "ON_SITE",
  );
  const quotation = await quotationsService.create(companyId, {
    requestId: request.id,
    taxCode: "T0",
    items: quotationItemsFor(request, options?.unitPrice ?? 100_000),
  });
  createdQuotationIds.push(quotation.id);
  return { customerId, request, quotation };
}

async function createApprovedQuotation(
  companyId: string,
  options?: Parameters<typeof createQuotation>[1],
) {
  const created = await createQuotation(companyId, options);
  await quotationsService.send(companyId, created.quotation.id);
  const quotation = await quotationsService.approve(companyId, created.quotation.id, staffUserId);
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
  const { customerId, request, quotation } = await createApprovedQuotation(companyId, options);
  const created = await purchaseOrdersService.create(companyId, customerPoInput(quotation.id));
  createdPurchaseOrderIds.push(created.id);
  const purchaseOrder = await purchaseOrdersService.approve(companyId, created.id, staffUserId);
  return { customerId, request, quotation, purchaseOrder };
}

async function createTechnician(companyId: string) {
  const user = await prisma.user.create({
    data: {
      email: `wo-tech-${randomUUID().slice(0, 8)}@kalibrasimedika.co.id`,
      name: "WO Technician",
      status: "ACTIVE",
    },
  });
  createdUserIds.push(user.id);
  await prisma.userMembership.create({
    data: { userId: user.id, companyId, role: "TECHNICIAN", isDefault: false },
  });
  return user;
}

async function createTrackedWorkOrder(
  companyId: string,
  purchaseOrderId: string,
  extra?: Omit<import("@medcal/shared").WorkOrderCreateInput, "purchaseOrderId">,
) {
  const created = await workOrdersService.create(companyId, {
    purchaseOrderId,
    ...extra,
  });
  createdWorkOrderIds.push(created.id);
  return created;
}

afterAll(async () => {
  await cleanupWorkOrders();
  await cleanupPurchaseOrders();
  if (createdTaxIds.length > 0) {
    await prisma.tax.deleteMany({ where: { id: { in: createdTaxIds } } });
  }
  await cleanupQuotations(createdQuotationIds);
  await cleanupCalibrationRequests(createdCalibrationRequestIds);
  if (createdDeviceTypeIds.length > 0) {
    await prisma.deviceType.deleteMany({ where: { id: { in: createdDeviceTypeIds } } });
  }
  if (createdDeviceCategoryIds.length > 0) {
    await prisma.deviceCategory.deleteMany({ where: { id: { in: createdDeviceCategoryIds } } });
  }
  await cleanupCustomers(createdCustomerIds);
  if (createdUserIds.length > 0) {
    await prisma.userMembership.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await cleanupSequences(realCompanyId);
  for (const companyId of createdCompanyIds) {
    await cleanupSequences(companyId);
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  }
});

describe("workOrderCreateSchema", () => {
  it("accepts purchaseOrderId and optional operational fields", () => {
    const parsed = workOrderCreateSchema.safeParse({
      purchaseOrderId: "po-1",
      addressText: "Lab PKM",
      scheduledStart: "2026-09-01T00:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a missing purchaseOrderId", () => {
    expect(workOrderCreateSchema.safeParse({ addressText: "Lab" }).success).toBe(false);
  });

  it("does not treat client commercial or source fields as required inputs", () => {
    const parsed = workOrderCreateSchema.safeParse({
      purchaseOrderId: "po-1",
      companyId: "XXX",
      customerId: "cust-1",
      quotationId: "quo-1",
      items: [{ qty: 9 }],
      quantity: 9,
      unitPrice: 1,
      taxCode: "T1",
      totalAmount: 999,
      currency: "USD",
      number: "SPK/FAKE",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("companyId");
      expect(parsed.data).not.toHaveProperty("customerId");
      expect(parsed.data).not.toHaveProperty("quotationId");
      expect(parsed.data).not.toHaveProperty("items");
      expect(parsed.data).not.toHaveProperty("quantity");
      expect(parsed.data).not.toHaveProperty("unitPrice");
      expect(parsed.data).not.toHaveProperty("taxCode");
      expect(parsed.data).not.toHaveProperty("totalAmount");
      expect(parsed.data).not.toHaveProperty("currency");
      expect(parsed.data).not.toHaveProperty("number");
    }
  });
});

describe("workOrderUpdateSchema", () => {
  it("rejects source and commercial fields as update inputs", () => {
    const parsed = workOrderUpdateSchema.safeParse({
      purchaseOrderId: "other-po",
      quotationId: "other-quotation",
      customerId: "other-customer",
      number: "SPK/HACK",
      serviceMode: "SEND_TO_LAB",
      addressText: "New site",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("purchaseOrderId");
      expect(parsed.data).not.toHaveProperty("quotationId");
      expect(parsed.data).not.toHaveProperty("customerId");
      expect(parsed.data).not.toHaveProperty("number");
      expect(parsed.data.serviceMode).toBe("SEND_TO_LAB");
      expect(parsed.data.addressText).toBe("New site");
    }
  });
});

describe("workOrderAssignSchema", () => {
  it("requires at least one technician", () => {
    expect(workOrderAssignSchema.safeParse({ technicians: [] }).success).toBe(false);
    expect(
      workOrderAssignSchema.safeParse({
        technicians: [{ technicianUserId: "user-1", roleOnJob: "LEAD" }],
      }).success,
    ).toBe(true);
  });
});

describe("WorkOrdersService.create", () => {
  it("creates a PLANNED WorkOrder snapshot from an APPROVED purchase order", async () => {
    const { customerId, request, quotation, purchaseOrder } = await createApprovedPurchaseOrder(
      realCompanyId,
      { itemCount: 2, serviceMode: "SEND_TO_LAB" },
    );

    const result = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id, {
      addressText: "RS Example",
      locationNotes: "Lantai 2",
    });

    expect(result.companyId).toBe(realCompanyId);
    expect(result.customerId).toBe(customerId);
    expect(result.purchaseOrderId).toBe(purchaseOrder.id);
    expect(result.quotationId).toBe(quotation.id);
    expect(result.status).toBe("PLANNED");
    expect(result.serviceMode).toBe("SEND_TO_LAB");
    expect(result.serviceMode).toBe(request.serviceMode);
    expect(isValidDocumentNumber(result.number)).toBe(true);
    expect(result.number.startsWith("SPK/")).toBe(true);
    expect(result.addressText).toBe("RS Example");
    expect(result.locationNotes).toBe("Lantai 2");
    expect(result.items).toHaveLength(purchaseOrder.items.length);
    expect(result.items.map((item) => item.purchaseOrderItemId).sort()).toEqual(
      purchaseOrder.items.map((item) => item.id).sort(),
    );
    for (const item of result.items) {
      const source = purchaseOrder.items.find((row) => row.id === item.purchaseOrderItemId);
      expect(source).toBeDefined();
      expect(Number(item.qty)).toBe(Number(source?.qty));
      expect(item.description).toBe(source?.description);
      expect(item.purchaseOrderItemId).toBe(source?.id);
      expect(item.purchaseOrderItem.quotationItemId).toBe(source?.quotationItemId);
      expect(item.purchaseOrderItem.quotationItem.requestItem?.deviceId).toMatch(/^DEV-/);
      expect(item.purchaseOrderItem.deviceId).toBeNull();
    }
    expect(result.quotation.request?.id).toBe(request.id);

    const jobs = await prisma.calibrationJob.count({ where: { workOrderId: result.id } });
    expect(jobs).toBe(0);
    const allocationPointers = await prisma.purchaseOrderItem.count({
      where: { purchaseOrderId: purchaseOrder.id, workOrderId: { not: null } },
    });
    expect(allocationPointers).toBe(0);
  });

  it("rejects a missing purchase order", async () => {
    try {
      await workOrdersService.create(realCompanyId, { purchaseOrderId: "missing-po" });
      expect.fail("expected PURCHASE_ORDER_NOT_FOUND");
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toEqual(
        expect.objectContaining({ code: "PURCHASE_ORDER_NOT_FOUND" }),
      );
    }
  });

  it("rejects a DRAFT purchase order", async () => {
    const { quotation } = await createApprovedQuotation(realCompanyId);
    const draft = await purchaseOrdersService.create(realCompanyId, customerPoInput(quotation.id));
    createdPurchaseOrderIds.push(draft.id);

    try {
      await workOrdersService.create(realCompanyId, { purchaseOrderId: draft.id });
      expect.fail("expected INVALID_STATUS_FOR_WORK_ORDER");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "INVALID_STATUS_FOR_WORK_ORDER" }),
      );
    }
  });

  it("rejects a CANCELLED purchase order", async () => {
    const { quotation } = await createApprovedQuotation(realCompanyId);
    const draft = await purchaseOrdersService.create(realCompanyId, customerPoInput(quotation.id));
    createdPurchaseOrderIds.push(draft.id);
    await purchaseOrdersService.cancel(realCompanyId, draft.id);

    try {
      await workOrdersService.create(realCompanyId, { purchaseOrderId: draft.id });
      expect.fail("expected INVALID_STATUS_FOR_WORK_ORDER");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "INVALID_STATUS_FOR_WORK_ORDER" }),
      );
    }
  });

  it("rejects creation from a purchase order belonging to another company", async () => {
    const otherCompanyId = `S${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Foreign WO Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);
    await cleanupSequences(otherCompanyId);

    const { purchaseOrder } = await createApprovedPurchaseOrder(otherCompanyId);

    try {
      await workOrdersService.create(realCompanyId, { purchaseOrderId: purchaseOrder.id });
      expect.fail("expected PURCHASE_ORDER_NOT_FOUND");
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toEqual(
        expect.objectContaining({ code: "PURCHASE_ORDER_NOT_FOUND" }),
      );
    }
  });

  it("rejects a second active WorkOrder for the same purchase order", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const first = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);

    try {
      await workOrdersService.create(realCompanyId, { purchaseOrderId: purchaseOrder.id });
      expect.fail("expected DUPLICATE_ACTIVE_WORK_ORDER");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toEqual(
        expect.objectContaining({
          code: "DUPLICATE_ACTIVE_WORK_ORDER",
          workOrderId: first.id,
        }),
      );
    }

    const count = await prisma.workOrder.count({ where: { purchaseOrderId: purchaseOrder.id } });
    expect(count).toBe(1);
  });

  it("does not create CalibrationJob rows", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    expect(await prisma.calibrationJob.count({ where: { workOrderId: created.id } })).toBe(0);
  });
});

describe("WorkOrdersService cancelled WorkOrder slot", () => {
  it("allows a replacement WorkOrder after CANCELLED and keeps the historical row", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, { itemCount: 2 });
    const first = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    const cancelled = await workOrdersService.cancel(realCompanyId, first.id);
    expect(cancelled.status).toBe("CANCELLED");

    const second = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    expect(second.status).toBe("PLANNED");
    expect(second.id).not.toBe(first.id);
    expect(second.purchaseOrderId).toBe(purchaseOrder.id);
    expect(second.items).toHaveLength(2);

    const stillCancelled = await prisma.workOrder.findFirstOrThrow({ where: { id: first.id } });
    expect(stillCancelled.status).toBe("CANCELLED");
    expect(await prisma.workOrderItem.count({ where: { workOrderId: first.id } })).toBe(2);
    expect(await prisma.workOrder.count({ where: { purchaseOrderId: purchaseOrder.id } })).toBe(2);
  });
});

describe("WorkOrdersService.findOne / findAll", () => {
  it("lists and loads company-scoped WorkOrders with source relations", async () => {
    const { purchaseOrder, quotation } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);

    const listed = await workOrdersService.findAll(realCompanyId, { search: created.number });
    expect(listed.data.some((row) => row.id === created.id)).toBe(true);

    const loaded = await workOrdersService.findOne(realCompanyId, created.id);
    expect(loaded.purchaseOrder?.number).toBe(purchaseOrder.number);
    expect(loaded.quotation.number).toBe(quotation.number);
    expect(loaded.quotation.request).toBeTruthy();
    expect(loaded.items.length).toBeGreaterThan(0);
  });

  it("throws NotFoundException when accessing a WorkOrder from another company", async () => {
    const otherCompanyId = `W${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Other WO Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);
    await cleanupSequences(otherCompanyId);

    const { purchaseOrder } = await createApprovedPurchaseOrder(otherCompanyId);
    const created = await createTrackedWorkOrder(otherCompanyId, purchaseOrder.id);

    try {
      await workOrdersService.findOne(realCompanyId, created.id);
      expect.fail("expected WORK_ORDER_NOT_FOUND");
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toEqual(
        expect.objectContaining({ code: "WORK_ORDER_NOT_FOUND" }),
      );
    }
  });
});

describe("WorkOrdersService.update", () => {
  it("updates operational fields and serviceMode while non-terminal", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, {
      serviceMode: "ON_SITE",
    });
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    const sourceNumber = created.number;
    const sourcePoId = created.purchaseOrderId;
    const sourceCustomerId = created.customerId;
    const sourceQuotationId = created.quotationId;
    const sourceQty = Number(created.items[0]?.qty);

    const updated = await workOrdersService.update(realCompanyId, created.id, {
      serviceMode: "SEND_TO_LAB",
      addressText: "Updated site",
      locationNotes: "Gate B",
    });

    expect(updated.serviceMode).toBe("SEND_TO_LAB");
    expect(updated.addressText).toBe("Updated site");
    expect(updated.locationNotes).toBe("Gate B");
    expect(updated.number).toBe(sourceNumber);
    expect(updated.purchaseOrderId).toBe(sourcePoId);
    expect(updated.customerId).toBe(sourceCustomerId);
    expect(updated.quotationId).toBe(sourceQuotationId);
    expect(Number(updated.items[0]?.qty)).toBe(sourceQty);
  });

  it("rejects update when status is DONE", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    const technician = await createTechnician(realCompanyId);
    await workOrdersService.assign(realCompanyId, created.id, {
      technicians: [{ technicianUserId: technician.id }],
    });
    await workOrdersService.start(realCompanyId, created.id);
    await workOrdersService.done(realCompanyId, created.id);

    try {
      await workOrdersService.update(realCompanyId, created.id, { addressText: "locked" });
      expect.fail("expected INVALID_STATUS_FOR_UPDATE");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "INVALID_STATUS_FOR_UPDATE" }),
      );
    }
  });

  it("rejects update when status is CANCELLED", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    await workOrdersService.cancel(realCompanyId, created.id);

    try {
      await workOrdersService.update(realCompanyId, created.id, { addressText: "locked" });
      expect.fail("expected INVALID_STATUS_FOR_UPDATE");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "INVALID_STATUS_FOR_UPDATE" }),
      );
    }
  });
});

describe("WorkOrdersService status transitions", () => {
  it("allows PLANNED → ASSIGNED", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    const technician = await createTechnician(realCompanyId);
    const assigned = await workOrdersService.assign(realCompanyId, created.id, {
      technicians: [{ technicianUserId: technician.id, roleOnJob: "LEAD" }],
    });
    expect(assigned.status).toBe("ASSIGNED");
    expect(assigned.assignments).toHaveLength(1);
    expect(assigned.assignments[0]?.technicianUserId).toBe(technician.id);
  });

  it("allows PLANNED → CANCELLED", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    const cancelled = await workOrdersService.cancel(realCompanyId, created.id);
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.id).toBe(created.id);
  });

  it("allows ASSIGNED → IN_PROGRESS", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    const technician = await createTechnician(realCompanyId);
    await workOrdersService.assign(realCompanyId, created.id, {
      technicians: [{ technicianUserId: technician.id }],
    });
    const started = await workOrdersService.start(realCompanyId, created.id);
    expect(started.status).toBe("IN_PROGRESS");
  });

  it("allows ASSIGNED → CANCELLED", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    const technician = await createTechnician(realCompanyId);
    await workOrdersService.assign(realCompanyId, created.id, {
      technicians: [{ technicianUserId: technician.id }],
    });
    const cancelled = await workOrdersService.cancel(realCompanyId, created.id);
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("allows IN_PROGRESS → DONE without creating CalibrationJob", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    const technician = await createTechnician(realCompanyId);
    await workOrdersService.assign(realCompanyId, created.id, {
      technicians: [{ technicianUserId: technician.id }],
    });
    await workOrdersService.start(realCompanyId, created.id);
    const done = await workOrdersService.done(realCompanyId, created.id);
    expect(done.status).toBe("DONE");
    expect(await prisma.calibrationJob.count({ where: { workOrderId: created.id } })).toBe(0);
  });

  it("allows IN_PROGRESS → CANCELLED", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    const technician = await createTechnician(realCompanyId);
    await workOrdersService.assign(realCompanyId, created.id, {
      technicians: [{ technicianUserId: technician.id }],
    });
    await workOrdersService.start(realCompanyId, created.id);
    const cancelled = await workOrdersService.cancel(realCompanyId, created.id);
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("rejects PLANNED → IN_PROGRESS", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    try {
      await workOrdersService.start(realCompanyId, created.id);
      expect.fail("expected INVALID_STATUS_TRANSITION");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({
          code: "INVALID_STATUS_TRANSITION",
          from: "PLANNED",
          to: "IN_PROGRESS",
        }),
      );
    }
  });

  it("rejects PLANNED → DONE", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    try {
      await workOrdersService.done(realCompanyId, created.id);
      expect.fail("expected INVALID_STATUS_TRANSITION");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({
          code: "INVALID_STATUS_TRANSITION",
          from: "PLANNED",
          to: "DONE",
        }),
      );
    }
  });

  it("rejects ASSIGNED → DONE", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    const technician = await createTechnician(realCompanyId);
    await workOrdersService.assign(realCompanyId, created.id, {
      technicians: [{ technicianUserId: technician.id }],
    });
    try {
      await workOrdersService.done(realCompanyId, created.id);
      expect.fail("expected INVALID_STATUS_TRANSITION");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({
          code: "INVALID_STATUS_TRANSITION",
          from: "ASSIGNED",
          to: "DONE",
        }),
      );
    }
  });

  it("rejects DONE → CANCELLED and any other DONE transition", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    const technician = await createTechnician(realCompanyId);
    await workOrdersService.assign(realCompanyId, created.id, {
      technicians: [{ technicianUserId: technician.id }],
    });
    await workOrdersService.start(realCompanyId, created.id);
    await workOrdersService.done(realCompanyId, created.id);

    try {
      await workOrdersService.cancel(realCompanyId, created.id);
      expect.fail("expected INVALID_STATUS_TRANSITION");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({
          code: "INVALID_STATUS_TRANSITION",
          from: "DONE",
          to: "CANCELLED",
        }),
      );
    }

    try {
      await workOrdersService.assign(realCompanyId, created.id, {
        technicians: [{ technicianUserId: technician.id }],
      });
      expect.fail("expected INVALID_STATUS_TRANSITION");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "INVALID_STATUS_TRANSITION", from: "DONE" }),
      );
    }

    try {
      await workOrdersService.start(realCompanyId, created.id);
      expect.fail("expected INVALID_STATUS_TRANSITION");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "INVALID_STATUS_TRANSITION", from: "DONE" }),
      );
    }
  });

  it("rejects CANCELLED → any state", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    await workOrdersService.cancel(realCompanyId, created.id);
    const technician = await createTechnician(realCompanyId);

    try {
      await workOrdersService.cancel(realCompanyId, created.id);
      expect.fail("expected ALREADY_CANCELLED");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "ALREADY_CANCELLED" }),
      );
    }

    try {
      await workOrdersService.assign(realCompanyId, created.id, {
        technicians: [{ technicianUserId: technician.id }],
      });
      expect.fail("expected INVALID_STATUS_TRANSITION");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "INVALID_STATUS_TRANSITION", from: "CANCELLED" }),
      );
    }

    try {
      await workOrdersService.start(realCompanyId, created.id);
      expect.fail("expected INVALID_STATUS_TRANSITION");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "INVALID_STATUS_TRANSITION", from: "CANCELLED" }),
      );
    }

    try {
      await workOrdersService.done(realCompanyId, created.id);
      expect.fail("expected INVALID_STATUS_TRANSITION");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "INVALID_STATUS_TRANSITION", from: "CANCELLED" }),
      );
    }
  });

  it("rejects assignment of a user who is not an active company member", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    try {
      await workOrdersService.assign(realCompanyId, created.id, {
        technicians: [{ technicianUserId: "missing-user" }],
      });
      expect.fail("expected INVALID_WORK_ORDER_ASSIGNEE");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "INVALID_WORK_ORDER_ASSIGNEE" }),
      );
    }
  });
});

describe("WorkOrdersService.buildPdf", () => {
  it("returns a PDF without changing work order status", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);

    const pdf = await workOrdersService.buildPdf(realCompanyId, created.id);
    expect(pdf.filename).toMatch(/^PKM-SPK-\d{8}-\d{5}\.pdf$/);
    expect(pdf.buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.buffer.length).toBeGreaterThan(100);
    const pdfLatin1 = pdf.buffer.toString("latin1");
    expect(pdfLatin1).toContain("/Subtype /Image");

    const after = await prisma.workOrder.findFirstOrThrow({ where: { id: created.id } });
    expect(after.status).toBe("PLANNED");
  });
});

describe("WorkOrdersService numbering", () => {
  it("uses DocumentNumberService with company-scoped SPK sequence", async () => {
    const firstCtx = await createApprovedPurchaseOrder(realCompanyId);
    const first = await createTrackedWorkOrder(realCompanyId, firstCtx.purchaseOrder.id);
    const secondCtx = await createApprovedPurchaseOrder(realCompanyId);
    const second = await createTrackedWorkOrder(realCompanyId, secondCtx.purchaseOrder.id);

    const firstSeq = Number(first.number.split("/").pop());
    const secondSeq = Number(second.number.split("/").pop());
    expect(secondSeq).toBeGreaterThan(firstSeq);
    expect(first.number.slice(0, 15)).toBe(second.number.slice(0, 15));
    expect(first.number.startsWith("SPK/")).toBe(true);
  });
});

describe("WorkOrdersService transaction", () => {
  it("rolls back WorkOrder creation when WorkOrderItem snapshot fails", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const originalTransaction = prisma.$transaction.bind(prisma);
    const spy = vi.spyOn(prisma, "$transaction").mockImplementationOnce(((
      fn: Parameters<typeof prisma.$transaction>[0],
    ) =>
      originalTransaction(async (tx) => {
        const origCreateMany = tx.workOrderItem.createMany.bind(tx.workOrderItem);
        tx.workOrderItem.createMany = (async (
          args: Parameters<typeof tx.workOrderItem.createMany>[0],
        ) => {
          await origCreateMany(args);
          throw new Error("forced WorkOrderItem failure");
        }) as typeof tx.workOrderItem.createMany;
        return (fn as (client: typeof tx) => Promise<unknown>)(tx);
      })) as typeof prisma.$transaction);

    await expect(
      workOrdersService.create(realCompanyId, { purchaseOrderId: purchaseOrder.id }),
    ).rejects.toThrow("forced WorkOrderItem failure");

    spy.mockRestore();
    expect(await prisma.workOrder.count({ where: { purchaseOrderId: purchaseOrder.id } })).toBe(0);
    expect(
      await prisma.workOrderItem.count({
        where: { purchaseOrderItem: { purchaseOrderId: purchaseOrder.id } },
      }),
    ).toBe(0);
  });
});
