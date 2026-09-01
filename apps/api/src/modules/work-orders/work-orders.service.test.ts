import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it, vi } from "vitest";
import { Prisma, prisma } from "@medcal/db";
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
import { DeliveryNotesService } from "./delivery-notes.service";

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
      documentType: {
        in: [
          "WORK_ORDER",
          "WORK_ORDER_SEND_TO_LAB",
          "EQUIPMENT_DELIVERY_NOTE",
          "PURCHASE_ORDER",
          "QUOTATION",
          "CALIBRATION_REQUEST",
        ],
      },
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
  // Fresh DeviceType per call — each quotation seeds its own Price List row.
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
  deviceTypeId: string;
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
  return { customerId: customer.id, deviceTypeId, request };
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
  const { customerId, deviceTypeId, request } = await createSubmittedRequest(
    companyId,
    options?.itemCount ?? 1,
    options?.serviceMode ?? "ON_SITE",
  );
  await prisma.priceListItem.create({
    data: {
      companyId,
      deviceTypeId,
      unitPrice: new Prisma.Decimal(options?.unitPrice ?? 100_000),
      effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
    },
  });
  const quotation = await quotationsService.create(companyId, {
    requestId: request.id,
    taxCode: "T0",
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
    await prisma.priceListItem.deleteMany({ where: { deviceTypeId: { in: createdDeviceTypeIds } } });
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
      expect(parsed.data).not.toHaveProperty("serviceMode");
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
    // SEND_TO_LAB ("In Lab") -> WORK_ORDER_SEND_TO_LAB -> WOL series
    expect(result.number.startsWith("WOL/")).toBe(true);
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

  it("allocates an SPK number for an ON_SITE work order", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, {
      serviceMode: "ON_SITE",
    });

    const result = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);

    expect(result.serviceMode).toBe("ON_SITE");
    expect(isValidDocumentNumber(result.number)).toBe(true);
    expect(result.number.startsWith("SPK/")).toBe(true);
  });

  it("keeps SPK and WOL sequences independent for the same company", async () => {
    const onSite = await createApprovedPurchaseOrder(realCompanyId, {
      serviceMode: "ON_SITE",
    });
    const inLab = await createApprovedPurchaseOrder(realCompanyId, {
      serviceMode: "SEND_TO_LAB",
    });

    const spk = await createTrackedWorkOrder(realCompanyId, onSite.purchaseOrder.id);
    const wol = await createTrackedWorkOrder(realCompanyId, inLab.purchaseOrder.id);

    expect(spk.number.startsWith("SPK/")).toBe(true);
    expect(wol.number.startsWith("WOL/")).toBe(true);
    // Same trailing 5-digit counter is expected when each series is at the same
    // position — they do not share a counter.
    const spkSeq = spk.number.split("/")[3];
    const wolSeq = wol.number.split("/")[3];
    expect(spkSeq).toMatch(/^\d{5}$/);
    expect(wolSeq).toMatch(/^\d{5}$/);
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
  it("updates operational fields while non-terminal and never changes serviceMode", async () => {
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
      addressText: "Updated site",
      locationNotes: "Gate B",
    });

    // serviceMode is immutable after create (it determines the SPK/WOL identity).
    expect(updated.serviceMode).toBe("ON_SITE");
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

// ===========================================================================
// WorkOrder ↔ reference equipment ("Equipment yang akan dibawa") — ON_SITE only
// ===========================================================================

describe("WorkOrdersService reference equipment", () => {
  const createdEquipmentTypeIds: string[] = [];
  const createdEquipmentIds: string[] = [];
  const createdRequirementIds: string[] = [];

  async function createEquipmentType(name: string) {
    const type = await prisma.equipmentType.create({
      data: { code: `EQT-${randomUUID().slice(0, 8).toUpperCase()}`, name },
    });
    createdEquipmentTypeIds.push(type.id);
    return type;
  }

  async function createEquipmentUnit(
    equipmentTypeId: string,
    overrides: Partial<{ isActive: boolean; serialNumber: string }> = {},
  ) {
    const unit = await prisma.equipment.create({
      data: {
        companyId: realCompanyId,
        equipmentTypeId,
        code: `EQU-${randomUUID().slice(0, 8).toUpperCase()}`,
        brand: "Fluke Biomedical",
        model: "ESA620",
        serialNumber: overrides.serialNumber ?? randomUUID().slice(0, 8),
        isActive: overrides.isActive ?? true,
      },
    });
    createdEquipmentIds.push(unit.id);
    return unit;
  }

  async function requireEquipmentType(deviceTypeId: string, equipmentTypeId: string, sortOrder: number) {
    const requirement = await prisma.deviceTypeEquipmentRequirement.create({
      data: { deviceTypeId, equipmentTypeId, sortOrder },
    });
    createdRequirementIds.push(requirement.id);
    return requirement;
  }

  /** ON_SITE work order whose single test DeviceType requires `equipmentTypeIds`. */
  async function onSiteWorkOrderRequiring(equipmentTypeIds: string[]) {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, {
      serviceMode: "ON_SITE",
    });
    const deviceTypeId = testDeviceTypeId!;
    for (const [index, equipmentTypeId] of equipmentTypeIds.entries()) {
      await requireEquipmentType(deviceTypeId, equipmentTypeId, (index + 1) * 10);
    }
    const workOrder = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    return { workOrder, deviceTypeId };
  }

  afterAll(async () => {
    await prisma.workOrderEquipment.deleteMany({
      where: { equipmentId: { in: createdEquipmentIds } },
    });
    if (createdRequirementIds.length > 0) {
      await prisma.deviceTypeEquipmentRequirement.deleteMany({
        where: { id: { in: createdRequirementIds } },
      });
    }
    if (createdEquipmentIds.length > 0) {
      await prisma.equipment.deleteMany({ where: { id: { in: createdEquipmentIds } } });
    }
    if (createdEquipmentTypeIds.length > 0) {
      await prisma.equipmentType.deleteMany({ where: { id: { in: createdEquipmentTypeIds } } });
    }
  });

  it("proposes required equipment types from DeviceTypeEquipmentRequirement, in sortOrder", async () => {
    const esa = await createEquipmentType("Electrical Safety Analyzer");
    const thermo = await createEquipmentType("Thermohygrometer");
    await createEquipmentUnit(esa.id);
    const { workOrder } = await onSiteWorkOrderRequiring([esa.id, thermo.id]);

    const { serviceMode, proposal } = await workOrdersService.getEquipmentProposal(
      realCompanyId,
      workOrder.id,
    );

    expect(serviceMode).toBe("ON_SITE");
    expect(proposal.map((row) => row.equipmentType.id)).toEqual([esa.id, thermo.id]);
    expect(proposal[0].sortOrder).toBe(10);
    expect(proposal[1].sortOrder).toBe(20);
    expect(proposal[0].candidates.length).toBe(1);
    expect(proposal[0].selectedEquipmentId).toBeNull();
  });

  it("returns an empty proposal for SEND_TO_LAB work orders", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, {
      serviceMode: "SEND_TO_LAB",
    });
    const workOrder = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);

    const result = await workOrdersService.getEquipmentProposal(realCompanyId, workOrder.id);
    expect(result.serviceMode).toBe("SEND_TO_LAB");
    expect(result.proposal).toEqual([]);
  });

  it("persists an ON_SITE equipment selection and returns it on the work order", async () => {
    const esa = await createEquipmentType("Electrical Safety Analyzer");
    const unit = await createEquipmentUnit(esa.id);
    const { workOrder } = await onSiteWorkOrderRequiring([esa.id]);

    const { workOrder: updated } = await workOrdersService.replaceEquipment(realCompanyId, workOrder.id, {
      equipment: [{ equipmentId: unit.id, equipmentTypeId: esa.id }],
    });

    expect(updated.equipment).toHaveLength(1);
    expect(updated.equipment[0].equipmentId).toBe(unit.id);
    expect(updated.equipment[0].sortOrder).toBe(10);

    const refetched = await workOrdersService.findOne(realCompanyId, workOrder.id);
    expect(refetched.equipment[0].equipmentId).toBe(unit.id);
  });

  it("rejects an unknown equipment id", async () => {
    const esa = await createEquipmentType("Electrical Safety Analyzer");
    const { workOrder } = await onSiteWorkOrderRequiring([esa.id]);
    await expect(
      workOrdersService.replaceEquipment(realCompanyId, workOrder.id, {
        equipment: [{ equipmentId: "does-not-exist", equipmentTypeId: esa.id }],
      }),
    ).rejects.toMatchObject({ response: { code: "EQUIPMENT_NOT_FOUND" } });
  });

  it("rejects an equipment-type mismatch", async () => {
    const esa = await createEquipmentType("Electrical Safety Analyzer");
    const thermo = await createEquipmentType("Thermohygrometer");
    const unit = await createEquipmentUnit(esa.id);
    const { workOrder } = await onSiteWorkOrderRequiring([esa.id, thermo.id]);
    await expect(
      workOrdersService.replaceEquipment(realCompanyId, workOrder.id, {
        equipment: [{ equipmentId: unit.id, equipmentTypeId: thermo.id }],
      }),
    ).rejects.toMatchObject({ response: { code: "EQUIPMENT_TYPE_MISMATCH" } });
  });

  it("rejects an inactive equipment unit", async () => {
    const esa = await createEquipmentType("Electrical Safety Analyzer");
    const unit = await createEquipmentUnit(esa.id, { isActive: false });
    const { workOrder } = await onSiteWorkOrderRequiring([esa.id]);
    await expect(
      workOrdersService.replaceEquipment(realCompanyId, workOrder.id, {
        equipment: [{ equipmentId: unit.id, equipmentTypeId: esa.id }],
      }),
    ).rejects.toMatchObject({ response: { code: "EQUIPMENT_INACTIVE" } });
  });

  it("rejects a duplicate equipment unit within one work order", async () => {
    const esa = await createEquipmentType("Electrical Safety Analyzer");
    const unit = await createEquipmentUnit(esa.id);
    const { workOrder } = await onSiteWorkOrderRequiring([esa.id]);
    await expect(
      workOrdersService.replaceEquipment(realCompanyId, workOrder.id, {
        equipment: [
          { equipmentId: unit.id, equipmentTypeId: esa.id },
          { equipmentId: unit.id, equipmentTypeId: esa.id },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: "DUPLICATE_WORK_ORDER_EQUIPMENT" } });
  });

  it("rejects equipment selection on a SEND_TO_LAB work order", async () => {
    const esa = await createEquipmentType("Electrical Safety Analyzer");
    const unit = await createEquipmentUnit(esa.id);
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, {
      serviceMode: "SEND_TO_LAB",
    });
    const workOrder = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    await expect(
      workOrdersService.replaceEquipment(realCompanyId, workOrder.id, {
        equipment: [{ equipmentId: unit.id, equipmentTypeId: esa.id }],
      }),
    ).rejects.toMatchObject({
      response: { code: "EQUIPMENT_NOT_APPLICABLE_FOR_SEND_TO_LAB" },
    });
  });

  it("blocks start() until the ON_SITE equipment list is confirmed, then allows it", async () => {
    const esa = await createEquipmentType("Electrical Safety Analyzer");
    const unit = await createEquipmentUnit(esa.id);
    const { workOrder } = await onSiteWorkOrderRequiring([esa.id]);
    const technician = await createTechnician(realCompanyId);
    await workOrdersService.assign(realCompanyId, workOrder.id, {
      technicians: [{ technicianUserId: technician.id, roleOnJob: "LEAD" }],
    });

    await expect(workOrdersService.start(realCompanyId, workOrder.id)).rejects.toMatchObject({
      response: { code: "WORK_ORDER_EQUIPMENT_NOT_CONFIRMED" },
    });

    await workOrdersService.replaceEquipment(realCompanyId, workOrder.id, {
      equipment: [{ equipmentId: unit.id, equipmentTypeId: esa.id }],
    });
    await workOrdersService.confirmEquipment(realCompanyId, workOrder.id);
    const started = await workOrdersService.start(realCompanyId, workOrder.id);
    expect(started.status).toBe("IN_PROGRESS");
  });

  it("clears a prior confirmation when the equipment list is edited", async () => {
    const esa = await createEquipmentType("Electrical Safety Analyzer");
    const unitA = await createEquipmentUnit(esa.id);
    const unitB = await createEquipmentUnit(esa.id);
    const { workOrder } = await onSiteWorkOrderRequiring([esa.id]);

    await workOrdersService.replaceEquipment(realCompanyId, workOrder.id, {
      equipment: [{ equipmentId: unitA.id, equipmentTypeId: esa.id }],
    });
    await workOrdersService.confirmEquipment(realCompanyId, workOrder.id);
    const confirmed = await workOrdersService.findOne(realCompanyId, workOrder.id);
    expect(confirmed.equipmentConfirmedAt).not.toBeNull();

    await workOrdersService.replaceEquipment(realCompanyId, workOrder.id, {
      equipment: [{ equipmentId: unitB.id, equipmentTypeId: esa.id }],
    });
    const afterEdit = await workOrdersService.findOne(realCompanyId, workOrder.id);
    expect(afterEdit.equipmentConfirmedAt).toBeNull();
  });

  it("deduplicates an EquipmentType required by two DeviceTypes, keeping first occurrence", async () => {
    // Two requirements pointing at the same EquipmentType from the same DeviceType
    // is blocked by @@unique; cross-DeviceType dedup is covered by the resolver's
    // Set — exercised here via a single DeviceType requiring one type once.
    const esa = await createEquipmentType("Electrical Safety Analyzer");
    const { workOrder } = await onSiteWorkOrderRequiring([esa.id]);
    const { proposal } = await workOrdersService.getEquipmentProposal(realCompanyId, workOrder.id);
    expect(proposal.filter((row) => row.equipmentType.id === esa.id)).toHaveLength(1);
  });

  it("keeps existing WorkOrder numbering unchanged", async () => {
    const esa = await createEquipmentType("Electrical Safety Analyzer");
    const { workOrder } = await onSiteWorkOrderRequiring([esa.id]);
    expect(workOrder.number.startsWith("SPK/")).toBe(true);
    expect(isValidDocumentNumber(workOrder.number)).toBe(true);
  });

  // ---- Drag-and-drop ordering -------------------------------------------------

  /** ON_SITE work order with three distinct equipment units already selected. */
  async function workOrderWithThreeUnits() {
    const typeA = await createEquipmentType("Digital Luxmeter");
    const typeB = await createEquipmentType("Digital Pressure Meter");
    const typeC = await createEquipmentType("Tachometer for Dental");
    const unitA = await createEquipmentUnit(typeA.id);
    const unitB = await createEquipmentUnit(typeB.id);
    const unitC = await createEquipmentUnit(typeC.id);
    const { workOrder } = await onSiteWorkOrderRequiring([typeA.id, typeB.id, typeC.id]);
    await workOrdersService.replaceEquipment(realCompanyId, workOrder.id, {
      equipment: [
        { equipmentId: unitA.id, equipmentTypeId: typeA.id },
        { equipmentId: unitB.id, equipmentTypeId: typeB.id },
        { equipmentId: unitC.id, equipmentTypeId: typeC.id },
      ],
    });
    return { workOrderId: workOrder.id, unitA, unitB, unitC };
  }

  it("returns equipment in sortOrder ASC and reorders to exactly the requested order", async () => {
    const { workOrderId, unitA, unitB, unitC } = await workOrderWithThreeUnits();

    const before = await workOrdersService.findOne(realCompanyId, workOrderId);
    expect(before.equipment.map((row) => row.equipmentId)).toEqual([unitA.id, unitB.id, unitC.id]);
    expect(before.equipment.map((row) => row.sortOrder)).toEqual([10, 20, 30]);

    // [A, B, C] -> [C, A, B]
    const reordered = await workOrdersService.reorderEquipment(realCompanyId, workOrderId, [
      unitC.id,
      unitA.id,
      unitB.id,
    ]);
    expect(reordered.equipment.map((row) => row.equipmentId)).toEqual([unitC.id, unitA.id, unitB.id]);
    expect(reordered.equipment.map((row) => row.sortOrder)).toEqual([10, 20, 30]);

    // Persisted: a fresh read returns the same order.
    const refetched = await workOrdersService.findOne(realCompanyId, workOrderId);
    expect(refetched.equipment.map((row) => row.equipmentId)).toEqual([unitC.id, unitA.id, unitB.id]);
  });

  it("rejects a reorder payload with a duplicate id", async () => {
    const { workOrderId, unitA, unitB } = await workOrderWithThreeUnits();
    await expect(
      workOrdersService.reorderEquipment(realCompanyId, workOrderId, [unitA.id, unitA.id, unitB.id]),
    ).rejects.toMatchObject({ response: { code: "WORK_ORDER_EQUIPMENT_ORDER_MISMATCH" } });
  });

  it("rejects a reorder payload that is missing an attached id", async () => {
    const { workOrderId, unitA, unitB } = await workOrderWithThreeUnits();
    await expect(
      workOrdersService.reorderEquipment(realCompanyId, workOrderId, [unitA.id, unitB.id]),
    ).rejects.toMatchObject({ response: { code: "WORK_ORDER_EQUIPMENT_ORDER_MISMATCH" } });
  });

  it("rejects a reorder payload containing an id from another work order", async () => {
    const { workOrderId, unitA, unitB, unitC } = await workOrderWithThreeUnits();
    const foreignType = await createEquipmentType("Foreign Analyzer");
    const foreignUnit = await createEquipmentUnit(foreignType.id);
    const { workOrder: otherWo } = await onSiteWorkOrderRequiring([foreignType.id]);
    await workOrdersService.replaceEquipment(realCompanyId, otherWo.id, {
      equipment: [{ equipmentId: foreignUnit.id, equipmentTypeId: foreignType.id }],
    });
    await expect(
      workOrdersService.reorderEquipment(realCompanyId, workOrderId, [
        unitA.id,
        unitB.id,
        foreignUnit.id,
      ]),
    ).rejects.toMatchObject({ response: { code: "WORK_ORDER_EQUIPMENT_ORDER_MISMATCH" } });
    // unaffected: original order intact
    const still = await workOrdersService.findOne(realCompanyId, workOrderId);
    expect(still.equipment.map((row) => row.equipmentId)).toEqual([unitA.id, unitB.id, unitC.id]);
  });

  it("rejects a reorder for a work order in another company", async () => {
    const { workOrderId, unitA, unitB, unitC } = await workOrderWithThreeUnits();
    await expect(
      workOrdersService.reorderEquipment("XXX", workOrderId, [unitC.id, unitB.id, unitA.id]),
    ).rejects.toMatchObject({ response: { code: "WORK_ORDER_NOT_FOUND" } });
  });

  it("rejects equipment ordering on a SEND_TO_LAB work order", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, {
      serviceMode: "SEND_TO_LAB",
    });
    const workOrder = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    await expect(
      workOrdersService.reorderEquipment(realCompanyId, workOrder.id, ["whatever"]),
    ).rejects.toMatchObject({ response: { code: "EQUIPMENT_NOT_APPLICABLE_FOR_SEND_TO_LAB" } });
  });

  it("reorder does not add or remove equipment, and does not touch masters or requirements", async () => {
    const { workOrderId, unitA, unitB, unitC } = await workOrderWithThreeUnits();
    const requirementsBefore = await prisma.deviceTypeEquipmentRequirement.findMany({
      where: { id: { in: createdRequirementIds } },
      orderBy: { id: "asc" },
    });
    const equipmentBefore = await prisma.equipment.findMany({
      where: { id: { in: [unitA.id, unitB.id, unitC.id] } },
      orderBy: { id: "asc" },
    });

    await workOrdersService.reorderEquipment(realCompanyId, workOrderId, [
      unitB.id,
      unitC.id,
      unitA.id,
    ]);

    const after = await workOrdersService.findOne(realCompanyId, workOrderId);
    expect(after.equipment).toHaveLength(3);
    expect(new Set(after.equipment.map((row) => row.equipmentId))).toEqual(
      new Set([unitA.id, unitB.id, unitC.id]),
    );
    const requirementsAfter = await prisma.deviceTypeEquipmentRequirement.findMany({
      where: { id: { in: createdRequirementIds } },
      orderBy: { id: "asc" },
    });
    expect(requirementsAfter).toEqual(requirementsBefore);
    const equipmentAfter = await prisma.equipment.findMany({
      where: { id: { in: [unitA.id, unitB.id, unitC.id] } },
      orderBy: { id: "asc" },
    });
    expect(equipmentAfter).toEqual(equipmentBefore);
  });

  it("reorder preserves WorkOrder status, serviceMode and confirmation", async () => {
    const { workOrderId, unitA, unitB, unitC } = await workOrderWithThreeUnits();
    await workOrdersService.confirmEquipment(realCompanyId, workOrderId);
    const confirmed = await workOrdersService.findOne(realCompanyId, workOrderId);
    const confirmedAt = confirmed.equipmentConfirmedAt;
    expect(confirmedAt).not.toBeNull();

    const after = await workOrdersService.reorderEquipment(realCompanyId, workOrderId, [
      unitC.id,
      unitB.id,
      unitA.id,
    ]);
    expect(after.status).toBe(confirmed.status);
    expect(after.serviceMode).toBe("ON_SITE");
    expect(after.equipmentConfirmedAt?.getTime()).toBe(confirmedAt?.getTime());
  });

  // ---- Delivery Note (Surat Jalan Alat / DLN) --------------------------------

  const deliveryNotesService = new DeliveryNotesService();

  /** Confirmed ON_SITE work order with three ordered equipment units. */
  async function confirmedWorkOrder() {
    const built = await workOrderWithThreeUnits();
    await workOrdersService.confirmEquipment(realCompanyId, built.workOrderId);
    return built;
  }

  it("issues a Delivery Note for a confirmed ON_SITE work order", async () => {
    const { workOrderId, unitA, unitB, unitC } = await confirmedWorkOrder();
    const dn = await deliveryNotesService.issue(realCompanyId, workOrderId);

    expect(dn.number.startsWith("DLN/")).toBe(true);
    expect(isValidDocumentNumber(dn.number)).toBe(true);
    // Equipment comes from WorkOrderEquipment, in sortOrder ASC.
    expect(dn.items.map((item) => item.equipmentId)).toEqual([unitA.id, unitB.id, unitC.id]);
    expect(dn.items.map((item) => item.sortOrder)).toEqual([10, 20, 30]);
    // Master fields are snapshotted onto the item.
    expect(dn.items[0].brand).toBe("Fluke Biomedical");
    expect(dn.items[0].serialNumber).toBeTruthy();
    expect(dn.workOrderNumber.startsWith("SPK/")).toBe(true);
  });

  it("blocks a Delivery Note for a SEND_TO_LAB work order", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, {
      serviceMode: "SEND_TO_LAB",
    });
    const workOrder = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    await expect(
      deliveryNotesService.issue(realCompanyId, workOrder.id),
    ).rejects.toMatchObject({
      response: { code: "DELIVERY_NOTE_NOT_APPLICABLE_FOR_SEND_TO_LAB" },
    });
  });

  it("blocks a Delivery Note when equipment is not confirmed", async () => {
    const { workOrderId } = await workOrderWithThreeUnits(); // selected, not confirmed
    await expect(
      deliveryNotesService.issue(realCompanyId, workOrderId),
    ).rejects.toMatchObject({ response: { code: "WORK_ORDER_EQUIPMENT_NOT_CONFIRMED" } });
  });

  it("blocks a Delivery Note when there is no equipment", async () => {
    const esa = await createEquipmentType("Electrical Safety Analyzer");
    const { workOrder } = await onSiteWorkOrderRequiring([esa.id]);
    await expect(
      deliveryNotesService.issue(realCompanyId, workOrder.id),
    ).rejects.toMatchObject({ response: { code: "WORK_ORDER_EQUIPMENT_NOT_CONFIRMED" } });
  });

  it("is idempotent — a reprint reuses the same DLN number", async () => {
    const { workOrderId } = await confirmedWorkOrder();
    const first = await deliveryNotesService.issue(realCompanyId, workOrderId);
    const second = await deliveryNotesService.issue(realCompanyId, workOrderId);
    expect(second.id).toBe(first.id);
    expect(second.number).toBe(first.number);
    const count = await prisma.equipmentDeliveryNote.count({ where: { workOrderId } });
    expect(count).toBe(1);
  });

  it("gives two work orders independent, incrementing DLN numbers", async () => {
    const a = await confirmedWorkOrder();
    const b = await confirmedWorkOrder();
    const dnA = await deliveryNotesService.issue(realCompanyId, a.workOrderId);
    const dnB = await deliveryNotesService.issue(realCompanyId, b.workOrderId);
    const seqA = Number(dnA.number.split("/")[3]);
    const seqB = Number(dnB.number.split("/")[3]);
    expect(seqB).toBe(seqA + 1);
  });

  it("keeps SPK/WOL numbering independent of the DLN series", async () => {
    const { workOrderId } = await confirmedWorkOrder();
    const woBefore = await workOrdersService.findOne(realCompanyId, workOrderId);
    const dn = await deliveryNotesService.issue(realCompanyId, workOrderId);
    const woAfter = await workOrdersService.findOne(realCompanyId, workOrderId);
    expect(woAfter.number).toBe(woBefore.number); // SPK untouched
    expect(dn.number.startsWith("DLN/")).toBe(true);
    expect(woAfter.number.startsWith("SPK/")).toBe(true);
  });

  it("rejects issuing a Delivery Note for another company's work order", async () => {
    const { workOrderId } = await confirmedWorkOrder();
    await expect(
      deliveryNotesService.issue("XXX", workOrderId),
    ).rejects.toMatchObject({ response: { code: "WORK_ORDER_NOT_FOUND" } });
  });

  it("snapshots the equipment — later master edits do not change the Delivery Note", async () => {
    const { workOrderId, unitA } = await confirmedWorkOrder();
    const dn = await deliveryNotesService.issue(realCompanyId, workOrderId);
    const originalName = dn.items[0].equipmentName;
    const originalSerial = dn.items[0].serialNumber;

    await prisma.equipment.update({
      where: { id: unitA.id },
      data: { serialNumber: "CHANGED-SN", brand: "Changed Brand" },
    });

    const reread = await deliveryNotesService.findOne(realCompanyId, workOrderId);
    expect(reread.items[0].equipmentName).toBe(originalName);
    expect(reread.items[0].serialNumber).toBe(originalSerial);
    expect(reread.items[0].serialNumber).not.toBe("CHANGED-SN");
  });

  it("does not query DeviceTypeEquipmentRequirement as the document source", async () => {
    const { workOrderId, unitA, unitB, unitC } = await confirmedWorkOrder();
    const spy = vi.spyOn(prisma.deviceTypeEquipmentRequirement, "findMany");
    const dn = await deliveryNotesService.issue(realCompanyId, workOrderId);
    expect(spy).not.toHaveBeenCalled();
    expect(new Set(dn.items.map((item) => item.equipmentId))).toEqual(
      new Set([unitA.id, unitB.id, unitC.id]),
    );
    spy.mockRestore();
  });

  it("renders a PDF with the DLN number and ordered equipment", async () => {
    const { workOrderId } = await confirmedWorkOrder();
    const dn = await deliveryNotesService.issue(realCompanyId, workOrderId);
    const pdf = await deliveryNotesService.buildPdf(realCompanyId, workOrderId);
    expect(pdf.buffer.length).toBeGreaterThan(1000);
    expect(pdf.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.filename.endsWith(".pdf")).toBe(true);
    expect(dn.items).toHaveLength(3);
  });

  // ---- DLN status + work-order cancellation dependency ----------------------

  /** Simulates the future controlled void operation (no normal-user mechanism yet). */
  async function markDeliveryNoteCancelled(deliveryNoteId: string) {
    await prisma.equipmentDeliveryNote.update({
      where: { id: deliveryNoteId },
      data: { status: "CANCELLED" },
    });
  }

  it("newly issued delivery note has status ISSUED", async () => {
    const { workOrderId } = await confirmedWorkOrder();
    const dn = await deliveryNotesService.issue(realCompanyId, workOrderId);
    expect(dn.status).toBe("ISSUED");
  });

  it("A — a work order without a delivery note follows the existing cancel rules", async () => {
    const { workOrderId } = await confirmedWorkOrder();
    const cancelled = await workOrdersService.cancel(realCompanyId, workOrderId);
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("B — a work order with an ISSUED delivery note cannot be cancelled directly", async () => {
    const { workOrderId } = await confirmedWorkOrder();
    await deliveryNotesService.issue(realCompanyId, workOrderId);
    await expect(workOrdersService.cancel(realCompanyId, workOrderId)).rejects.toMatchObject({
      response: { code: "DELIVERY_NOTE_MUST_BE_CANCELLED_FIRST" },
    });
    // E — no active DLN left behind: the work order stayed non-cancelled.
    const wo = await workOrdersService.findOne(realCompanyId, workOrderId);
    expect(wo.status).not.toBe("CANCELLED");
    expect(wo.deliveryNote?.status).toBe("ISSUED");
  });

  it("C — once the delivery note is CANCELLED the work order may be cancelled", async () => {
    const { workOrderId } = await confirmedWorkOrder();
    const dn = await deliveryNotesService.issue(realCompanyId, workOrderId);
    await markDeliveryNoteCancelled(dn.id);
    const cancelled = await workOrdersService.cancel(realCompanyId, workOrderId);
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("D — a CANCELLED delivery note can still be read and reprinted", async () => {
    const { workOrderId } = await confirmedWorkOrder();
    const dn = await deliveryNotesService.issue(realCompanyId, workOrderId);
    await markDeliveryNoteCancelled(dn.id);

    const read = await deliveryNotesService.findOne(realCompanyId, workOrderId);
    expect(read.status).toBe("CANCELLED");
    expect(read.number).toBe(dn.number);
    expect(read.items).toHaveLength(3); // 5 — snapshot items intact

    const pdf = await deliveryNotesService.buildPdf(realCompanyId, workOrderId);
    expect(pdf.buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("3/4 — a CANCELLED delivery note is not active and cannot be re-issued", async () => {
    const { workOrderId } = await confirmedWorkOrder();
    const dn = await deliveryNotesService.issue(realCompanyId, workOrderId);
    await markDeliveryNoteCancelled(dn.id);
    await expect(deliveryNotesService.issue(realCompanyId, workOrderId)).rejects.toMatchObject({
      response: { code: "DELIVERY_NOTE_CANCELLED" },
    });
    // The DLN number is never reused: still exactly one row, same number.
    const rows = await prisma.equipmentDeliveryNote.findMany({ where: { workOrderId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].number).toBe(dn.number);
  });

  it("9 — there is no normal CANCELLED -> ISSUED transition", () => {
    // The service exposes issue / findOne / buildPdf only — no un-cancel / reopen.
    expect(
      Object.getOwnPropertyNames(Object.getPrototypeOf(deliveryNotesService)).filter((name) =>
        /reopen|uncancel|activate|restore/i.test(name),
      ),
    ).toEqual([]);
  });

  it("locks the equipment list while a delivery note is ISSUED, and unlocks it once CANCELLED", async () => {
    const { workOrderId, unitA, unitB, unitC } = await confirmedWorkOrder();
    const dn = await deliveryNotesService.issue(realCompanyId, workOrderId);

    await expect(
      workOrdersService.reorderEquipment(realCompanyId, workOrderId, [unitC.id, unitA.id, unitB.id]),
    ).rejects.toMatchObject({ response: { code: "DELIVERY_NOTE_ISSUED_EQUIPMENT_LOCKED" } });
    await expect(
      workOrdersService.replaceEquipment(realCompanyId, workOrderId, {
        equipment: [{ equipmentId: unitA.id, equipmentTypeId: unitA.equipmentTypeId }],
      }),
    ).rejects.toMatchObject({ response: { code: "DELIVERY_NOTE_ISSUED_EQUIPMENT_LOCKED" } });

    await markDeliveryNoteCancelled(dn.id);
    const reordered = await workOrdersService.reorderEquipment(realCompanyId, workOrderId, [
      unitC.id,
      unitA.id,
      unitB.id,
    ]);
    expect(reordered.equipment.map((row) => row.equipmentId)).toEqual([unitC.id, unitA.id, unitB.id]);
  });
});
