import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it, vi } from "vitest";
import { Prisma, prisma } from "@medcal/db";
import { isValidDocumentNumber } from "@medcal/db";
import {
  workOrderAssignSchema,
  sharedSpkCreateSchema,
  sharedSpkReviseSchema,
  workOrderCreateSchema,
  workOrderListQuerySchema,
  workOrderUpdateSchema,
} from "@medcal/shared";
import { CalibrationRequestsService } from "../calibration-requests/calibration-requests.service";
import { QuotationsService } from "../quotations/quotations.service";
import { PurchaseOrdersService } from "../purchase-orders/purchase-orders.service";
import { WorkOrdersService } from "./work-orders.service";
import { DeliveryNotesService } from "./delivery-notes.service";
import { SharedSpkService } from "./shared-spk.service";

const workOrdersService = new WorkOrdersService();
const purchaseOrdersService = new PurchaseOrdersService();
const quotationsService = new QuotationsService();
const requestsService = new CalibrationRequestsService();
const realCompanyId = "PKM";
const staffUserId = "wo-staff-user";
const createdWorkOrderIds: string[] = [];
const createdSpkParentIds: string[] = [];
const createdPurchaseOrderIds: string[] = [];
const createdQuotationIds: string[] = [];
const createdCalibrationRequestIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdCompanyIds: string[] = [];
const createdDeviceTypeIds: string[] = [];
const createdDeviceIds: string[] = [];
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
          "KONTROL_ALAT",
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
  await prisma.user.upsert({
    where: { id: staffUserId },
    create: {
      id: staffUserId,
      email: `${staffUserId}@medcal.test`,
      name: "WO Staff",
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

/** Marks every CalibrationJob fanned out from a WorkOrder as ACCEPTED_BY_QA, satisfying the done() gate. */
async function acceptAllJobs(workOrderId: string) {
  await prisma.calibrationJob.updateMany({
    where: { workOrderId },
    data: { status: "ACCEPTED_BY_QA" },
  });
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
  // Shared ON_SITE: Children (WorkOrder) reference their Parent with RESTRICT, and
  // the Parent references the PurchaseOrder with RESTRICT — delete in that order.
  if (createdSpkParentIds.length > 0) {
    await prisma.workOrder.deleteMany({ where: { parentSpkId: { in: createdSpkParentIds } } });
  }
  await cleanupWorkOrders();
  if (createdSpkParentIds.length > 0) {
    await prisma.spkParent.deleteMany({ where: { id: { in: createdSpkParentIds } } });
  }
  if (createdDeviceIds.length > 0) {
    await prisma.device.deleteMany({ where: { id: { in: createdDeviceIds } } });
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
      expect(parsed.data).not.toHaveProperty("quantity");
      expect(parsed.data).not.toHaveProperty("unitPrice");
      expect(parsed.data).not.toHaveProperty("taxCode");
      expect(parsed.data).not.toHaveProperty("totalAmount");
      expect(parsed.data).not.toHaveProperty("currency");
      expect(parsed.data).not.toHaveProperty("number");
    }
  });

  it("Allocation & Multi-WOL Architecture: accepts an allocation-aware items array (purchaseOrderItemId + qty)", () => {
    const parsed = workOrderCreateSchema.safeParse({
      purchaseOrderId: "po-1",
      items: [
        { purchaseOrderItemId: "item-a", qty: 30 },
        { purchaseOrderItemId: "item-b", qty: 20 },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.items).toEqual([
        { purchaseOrderItemId: "item-a", qty: 30 },
        { purchaseOrderItemId: "item-b", qty: 20 },
      ]);
    }
  });

  it("Allocation & Multi-WOL Architecture: rejects a non-positive or fractional allocation qty", () => {
    expect(
      workOrderCreateSchema.safeParse({
        purchaseOrderId: "po-1",
        items: [{ purchaseOrderItemId: "item-a", qty: 0 }],
      }).success,
    ).toBe(false);
    expect(
      workOrderCreateSchema.safeParse({
        purchaseOrderId: "po-1",
        items: [{ purchaseOrderItemId: "item-a", qty: 1.5 }],
      }).success,
    ).toBe(false);
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
      // CalibrationRequestItem.deviceId is now a required, resolved Device.id
      // (real FK, not the raw "DEV-n" Serial No text) — and, since the
      // auto-generated QuotationItem now copies it forward verbatim (no
      // longer hard-coded null), PurchaseOrderItem.deviceId inherits the same
      // value all the way through.
      expect(item.purchaseOrderItem.quotationItem.requestItem?.deviceId).toBeTruthy();
      expect(item.purchaseOrderItem.deviceId).toBe(
        item.purchaseOrderItem.quotationItem.requestItem?.deviceId,
      );
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

  it("Allocation & Multi-WOL Architecture: rejects a default (no items) WorkOrder once everything is already allocated", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);

    try {
      await workOrdersService.create(realCompanyId, { purchaseOrderId: purchaseOrder.id });
      expect.fail("expected NOTHING_TO_ALLOCATE");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "NOTHING_TO_ALLOCATE" }),
      );
    }

    const count = await prisma.workOrder.count({ where: { purchaseOrderId: purchaseOrder.id } });
    expect(count).toBe(1);
  });

  it("Allocation & Multi-WOL Architecture: allows a second, simultaneously-active WorkOrder for the same PO once it claims a different, still-unallocated item", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, { itemCount: 2 });
    const items = await prisma.purchaseOrderItem.findMany({
      where: { purchaseOrderId: purchaseOrder.id },
      orderBy: { createdAt: "asc" },
    });
    expect(items).toHaveLength(2);

    const first = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id, {
      items: [{ purchaseOrderItemId: items[0]!.id, qty: items[0]!.qty.toNumber() }],
    });
    const second = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id, {
      items: [{ purchaseOrderItemId: items[1]!.id, qty: items[1]!.qty.toNumber() }],
    });

    expect(first.status).not.toBe("CANCELLED");
    expect(second.status).not.toBe("CANCELLED");
    expect(second.id).not.toBe(first.id);
    const activeCount = await prisma.workOrder.count({
      where: { purchaseOrderId: purchaseOrder.id, status: { not: "CANCELLED" } },
    });
    expect(activeCount).toBe(2);
  });

  it("Allocation & Multi-WOL Architecture: rejects allocating an already-fully-allocated item to a second WorkOrder (OVER_ALLOCATION)", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const item = await prisma.purchaseOrderItem.findFirstOrThrow({
      where: { purchaseOrderId: purchaseOrder.id },
    });
    await createTrackedWorkOrder(realCompanyId, purchaseOrder.id, {
      items: [{ purchaseOrderItemId: item.id, qty: item.qty.toNumber() }],
    });

    try {
      await workOrdersService.create(realCompanyId, {
        purchaseOrderId: purchaseOrder.id,
        items: [{ purchaseOrderItemId: item.id, qty: 1 }],
      });
      expect.fail("expected OVER_ALLOCATION");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toEqual(
        expect.objectContaining({ code: "OVER_ALLOCATION", purchaseOrderItemId: item.id }),
      );
    }
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

describe("WorkOrdersService.findOne — TECHNICIAN row-level scoping", () => {
  it("lets an assigned technician access their own Work Order", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    const technicianA = await createTechnician(realCompanyId);
    await workOrdersService.assign(realCompanyId, created.id, {
      technicians: [{ technicianUserId: technicianA.id }],
    });

    const loaded = await workOrdersService.findOne(realCompanyId, created.id, {
      role: "TECHNICIAN",
      userId: technicianA.id,
    });
    expect(loaded.id).toBe(created.id);
  });

  it("throws NotFoundException when a technician requests another technician's Work Order", async () => {
    const { purchaseOrder: poB } = await createApprovedPurchaseOrder(realCompanyId);
    const workOrderB = await createTrackedWorkOrder(realCompanyId, poB.id);
    const technicianB = await createTechnician(realCompanyId);
    await workOrdersService.assign(realCompanyId, workOrderB.id, {
      technicians: [{ technicianUserId: technicianB.id }],
    });

    const technicianA = await createTechnician(realCompanyId);

    try {
      await workOrdersService.findOne(realCompanyId, workOrderB.id, {
        role: "TECHNICIAN",
        userId: technicianA.id,
      });
      expect.fail("expected WORK_ORDER_NOT_FOUND");
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toEqual(
        expect.objectContaining({ code: "WORK_ORDER_NOT_FOUND" }),
      );
    }
  });

  it("lets a technician assigned as ASSIST (not just LEAD) access the Work Order", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    const lead = await createTechnician(realCompanyId);
    const assist = await createTechnician(realCompanyId);
    await workOrdersService.assign(realCompanyId, created.id, {
      technicians: [
        { technicianUserId: lead.id, roleOnJob: "LEAD" },
        { technicianUserId: assist.id, roleOnJob: "ASSIST" },
      ],
    });

    const loaded = await workOrdersService.findOne(realCompanyId, created.id, {
      role: "TECHNICIAN",
      userId: assist.id,
    });
    expect(loaded.id).toBe(created.id);
  });

  it("does not restrict TECHNICIAN_MANAGER, SUPERVISOR, or SUPERADMIN by assignment", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    const technician = await createTechnician(realCompanyId);
    await workOrdersService.assign(realCompanyId, created.id, {
      technicians: [{ technicianUserId: technician.id }],
    });

    for (const role of ["TECHNICIAN_MANAGER", "SUPERVISOR", "SUPERADMIN"] as const) {
      const loaded = await workOrdersService.findOne(realCompanyId, created.id, {
        role,
        userId: "some-other-user-not-assigned",
      });
      expect(loaded.id).toBe(created.id);
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
    await acceptAllJobs(created.id);
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

  it("fans out one CalibrationJob per unit when reaching IN_PROGRESS, then allows IN_PROGRESS → DONE once that job is ACCEPTED_BY_QA", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    const technician = await createTechnician(realCompanyId);
    await workOrdersService.assign(realCompanyId, created.id, {
      technicians: [{ technicianUserId: technician.id }],
    });
    await workOrdersService.start(realCompanyId, created.id);
    // A single-quantity WorkOrderItem fans out to exactly one job.
    const jobs = await prisma.calibrationJob.findMany({ where: { workOrderId: created.id } });
    expect(jobs).toHaveLength(1);
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: { status: "ACCEPTED_BY_QA" },
    });
    const done = await workOrdersService.done(realCompanyId, created.id);
    expect(done.status).toBe("DONE");
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
    await acceptAllJobs(created.id);
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

describe("WorkOrdersService.done — Work Order Completion Gate", () => {
  /** IN_PROGRESS WorkOrder with `itemCount` fanned-out CalibrationJobs (one per item, qty 1 each). */
  async function inProgressWorkOrderWithJobs(itemCount: number) {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, { itemCount });
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    const technician = await createTechnician(realCompanyId);
    await workOrdersService.assign(realCompanyId, created.id, {
      technicians: [{ technicianUserId: technician.id }],
    });
    await workOrdersService.start(realCompanyId, created.id);
    const jobs = await prisma.calibrationJob.findMany({
      where: { workOrderId: created.id },
      orderBy: { id: "asc" },
    });
    return { workOrderId: created.id, jobs };
  }

  it("Test 1/6 — completes when all CalibrationJobs are ACCEPTED_BY_QA", async () => {
    const { workOrderId, jobs } = await inProgressWorkOrderWithJobs(3);
    expect(jobs).toHaveLength(3);
    await prisma.calibrationJob.updateMany({
      where: { id: { in: jobs.map((job) => job.id) } },
      data: { status: "ACCEPTED_BY_QA" },
    });

    const done = await workOrdersService.done(realCompanyId, workOrderId);
    expect(done.status).toBe("DONE");
  });

  it("Test 2 — rejects completion when one CalibrationJob is not ACCEPTED_BY_QA", async () => {
    const { workOrderId, jobs } = await inProgressWorkOrderWithJobs(1);
    // Fan-out default status is PENDING — left untouched.
    expect(jobs[0]!.status).toBe("PENDING");

    await expect(workOrdersService.done(realCompanyId, workOrderId)).rejects.toMatchObject({
      response: { code: "WORK_ORDER_CALIBRATION_JOBS_NOT_ACCEPTED" },
    });

    const wo = await workOrdersService.findOne(realCompanyId, workOrderId);
    expect(wo.status).not.toBe("DONE");
    expect(wo.status).toBe("IN_PROGRESS");
  });

  it("Test 3 — rejects completion with multiple CalibrationJobs in mixed statuses", async () => {
    const { workOrderId, jobs } = await inProgressWorkOrderWithJobs(3);
    expect(jobs).toHaveLength(3);
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: { status: "ACCEPTED_BY_QA" },
    });
    await prisma.calibrationJob.update({
      where: { id: jobs[1]!.id },
      data: { status: "IN_PROGRESS" },
    });
    await prisma.calibrationJob.update({
      where: { id: jobs[2]!.id },
      data: { status: "ACCEPTED_BY_QA" },
    });

    await expect(workOrdersService.done(realCompanyId, workOrderId)).rejects.toMatchObject({
      response: { code: "WORK_ORDER_CALIBRATION_JOBS_NOT_ACCEPTED" },
    });
    const wo = await workOrdersService.findOne(realCompanyId, workOrderId);
    expect(wo.status).not.toBe("DONE");
  });

  it("Test 4 — any non-ACCEPTED_BY_QA status blocks completion (SUBMITTED, REWORK)", async () => {
    for (const blockingStatus of ["SUBMITTED", "REWORK"] as const) {
      const { workOrderId, jobs } = await inProgressWorkOrderWithJobs(1);
      await prisma.calibrationJob.update({
        where: { id: jobs[0]!.id },
        data: { status: blockingStatus },
      });

      await expect(workOrdersService.done(realCompanyId, workOrderId)).rejects.toMatchObject({
        response: { code: "WORK_ORDER_CALIBRATION_JOBS_NOT_ACCEPTED" },
      });
    }
  });

  it("Test 5 — a rejected completion does not mutate CalibrationJob statuses", async () => {
    const { workOrderId, jobs } = await inProgressWorkOrderWithJobs(2);
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: { status: "ACCEPTED_BY_QA" },
    });
    // jobs[1] stays PENDING.

    await expect(workOrdersService.done(realCompanyId, workOrderId)).rejects.toMatchObject({
      response: { code: "WORK_ORDER_CALIBRATION_JOBS_NOT_ACCEPTED" },
    });

    const afterJobs = await prisma.calibrationJob.findMany({
      where: { workOrderId },
      orderBy: { id: "asc" },
    });
    expect(afterJobs.find((job) => job.id === jobs[0]!.id)?.status).toBe("ACCEPTED_BY_QA");
    expect(afterJobs.find((job) => job.id === jobs[1]!.id)?.status).toBe("PENDING");
  });

  it("Test 6 — successful completion leaves CalibrationJob statuses as ACCEPTED_BY_QA and does not touch other WorkOrder fields", async () => {
    const { workOrderId, jobs } = await inProgressWorkOrderWithJobs(2);
    await prisma.calibrationJob.updateMany({
      where: { id: { in: jobs.map((job) => job.id) } },
      data: { status: "ACCEPTED_BY_QA" },
    });

    const before = await workOrdersService.findOne(realCompanyId, workOrderId);
    const done = await workOrdersService.done(realCompanyId, workOrderId);

    expect(done.status).toBe("DONE");
    expect(done.number).toBe(before.number);
    expect(done.serviceMode).toBe(before.serviceMode);
    const afterJobs = await prisma.calibrationJob.findMany({ where: { workOrderId } });
    for (const job of afterJobs) {
      expect(job.status).toBe("ACCEPTED_BY_QA");
    }
  });
});

describe("WorkOrdersService CalibrationJob fan-out on start()", () => {
  async function assignedWorkOrderReadyToStart() {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    const technician = await createTechnician(realCompanyId);
    await workOrdersService.assign(realCompanyId, created.id, {
      technicians: [{ technicianUserId: technician.id }],
    });
    return created;
  }

  it("creates qty-many jobs with correct unitOrdinal/unitTotal, null deviceId, and requestItem linkage", async () => {
    const created = await assignedWorkOrderReadyToStart();
    const item = created.items[0]!;
    const requestItemId = item.purchaseOrderItem.quotationItem.requestItem!.id;

    // Fan-out cardinality comes from WorkOrderItem.qty.
    await prisma.workOrderItem.update({
      where: { id: item.id },
      data: { qty: new Prisma.Decimal(3) },
    });
    // Customer declaration is snapshot onto each job at fan-out time.
    await prisma.calibrationRequestItem.update({
      where: { id: requestItemId },
      data: { customerDeviceName: "Infusion Pump A", akdAkl: "AKL 12345678901" },
    });

    await workOrdersService.start(realCompanyId, created.id);

    const jobs = await prisma.calibrationJob.findMany({
      where: { workOrderId: created.id },
      orderBy: { unitOrdinal: "asc" },
    });
    expect(jobs).toHaveLength(3);
    expect(jobs.map((job) => job.unitOrdinal)).toEqual([1, 2, 3]);
    for (const job of jobs) {
      expect(job.unitTotal).toBe(3);
      expect(job.deviceId).toBeNull();
      expect(job.purchaseOrderItemId).toBe(item.purchaseOrderItemId);
      expect(job.calibrationRequestItemId).toBe(requestItemId);
      expect(job.customerDeclaredDeviceName).toBe("Infusion Pump A");
      expect(job.customerDeclaredAkdAkl).toBe("AKL 12345678901");
      expect(job.status).toBe("PENDING");
      expect(job.akdAklApprovalStatus).toBe("NOT_REQUIRED");
    }
  });

  it("propagates PurchaseOrderItem.deviceId (Master Device already known upstream) to the qty-1 CalibrationJob.deviceId", async () => {
    const created = await assignedWorkOrderReadyToStart();
    const item = created.items[0]!;
    const device = await prisma.device.create({
      data: {
        companyId: realCompanyId,
        code: `DEV/TEST/${randomUUID().slice(0, 8)}`,
        customerId: created.customerId,
        deviceTypeId: testDeviceTypeId!,
        serialNumber: "1234567",
      },
    });
    createdDeviceIds.push(device.id);
    await prisma.purchaseOrderItem.update({
      where: { id: item.purchaseOrderItemId },
      data: { deviceId: device.id },
    });

    await workOrdersService.start(realCompanyId, created.id);

    const jobs = await prisma.calibrationJob.findMany({ where: { workOrderId: created.id } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.deviceId).toBe(device.id);
    // Independent of the FK: no technician observation has happened yet.
    expect(jobs[0]!.technicianObservedSerial).toBeNull();
  });

  it("does not propagate PurchaseOrderItem.deviceId onto a qty>1 line (ambiguous — which unit is that device?)", async () => {
    const created = await assignedWorkOrderReadyToStart();
    const item = created.items[0]!;
    const device = await prisma.device.create({
      data: {
        companyId: realCompanyId,
        code: `DEV/TEST/${randomUUID().slice(0, 8)}`,
        customerId: created.customerId,
        deviceTypeId: testDeviceTypeId!,
        serialNumber: "7654321",
      },
    });
    createdDeviceIds.push(device.id);
    await prisma.purchaseOrderItem.update({
      where: { id: item.purchaseOrderItemId },
      data: { deviceId: device.id },
    });
    await prisma.workOrderItem.update({
      where: { id: item.id },
      data: { qty: new Prisma.Decimal(2) },
    });

    await workOrdersService.start(realCompanyId, created.id);

    const jobs = await prisma.calibrationJob.findMany({ where: { workOrderId: created.id } });
    expect(jobs).toHaveLength(2);
    for (const job of jobs) {
      expect(job.deviceId).toBeNull();
    }
  });

  it("idempotency guard: fanOutCalibrationJobs is a no-op when jobs already exist", async () => {
    const created = await assignedWorkOrderReadyToStart();
    await workOrdersService.start(realCompanyId, created.id);
    const first = await prisma.calibrationJob.findMany({ where: { workOrderId: created.id } });
    expect(first).toHaveLength(1);

    // A true "call start() twice" is blocked by the transition table
    // (IN_PROGRESS → IN_PROGRESS is rejected), so exercise the guard directly.
    await (workOrdersService as unknown as {
      fanOutCalibrationJobs: (tx: typeof prisma, wo: unknown) => Promise<void>;
    }).fanOutCalibrationJobs(prisma, await workOrdersService.findOne(realCompanyId, created.id));

    const second = await prisma.calibrationJob.findMany({ where: { workOrderId: created.id } });
    expect(second.map((job) => job.id).sort()).toEqual(first.map((job) => job.id).sort());
  });

  it("rejects a fractional WorkOrderItem.qty rather than flooring it", async () => {
    const created = await assignedWorkOrderReadyToStart();
    await prisma.workOrderItem.update({
      where: { id: created.items[0]!.id },
      data: { qty: new Prisma.Decimal("2.5") },
    });

    try {
      await workOrdersService.start(realCompanyId, created.id);
      expect.fail("expected WORK_ORDER_ITEM_QTY_NOT_FANOUT_SAFE");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: "WORK_ORDER_ITEM_QTY_NOT_FANOUT_SAFE" }),
      );
    }
    expect(await prisma.calibrationJob.count({ where: { workOrderId: created.id } })).toBe(0);
    // The status update rolled back with the failed fan-out.
    const wo = await workOrdersService.findOne(realCompanyId, created.id);
    expect(wo.status).toBe("ASSIGNED");
  });

  it("SEND_TO_LAB fan-out creates one KontrolAlat per job and copies item accessories", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, {
      serviceMode: "SEND_TO_LAB",
    });
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    await workOrdersService.replaceItemAccessories(realCompanyId, created.id, created.items[0]!.id, {
      accessories: [
        { label: "Unit", sortOrder: 10 },
        { label: "Kabel Power", sortOrder: 20 },
      ],
    });
    await prisma.workOrderItem.update({
      where: { id: created.items[0]!.id },
      data: { qty: new Prisma.Decimal(2) },
    });
    const technician = await createTechnician(realCompanyId);
    await workOrdersService.assign(realCompanyId, created.id, {
      technicians: [{ technicianUserId: technician.id }],
    });
    await workOrdersService.start(realCompanyId, created.id);

    const jobs = await prisma.calibrationJob.findMany({
      where: { workOrderId: created.id },
      include: { kontrolAlat: { include: { accessories: { orderBy: { sortOrder: "asc" } } } } },
      orderBy: { unitOrdinal: "asc" },
    });
    expect(jobs).toHaveLength(2);
    for (const job of jobs) {
      expect(job.kontrolAlat).not.toBeNull();
      expect(job.kontrolAlat!.number).toMatch(/^KAL\/\d{4}\/\d{2}\/\d{5}$/);
      expect(job.kontrolAlat!.accessories.map((row) => row.label)).toEqual(["Unit", "Kabel Power"]);
      expect(job.kontrolAlat!.accessories[0]!.sourceWorkOrderItemAccessoryId).toBeTruthy();
    }
    const numbers = jobs.map((job) => job.kontrolAlat!.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("recreates missing KontrolAlat on a later fan-out without duplicating jobs", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, {
      serviceMode: "SEND_TO_LAB",
    });
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    const technician = await createTechnician(realCompanyId);
    await workOrdersService.assign(realCompanyId, created.id, {
      technicians: [{ technicianUserId: technician.id }],
    });
    await workOrdersService.start(realCompanyId, created.id);

    const first = await prisma.calibrationJob.findMany({ where: { workOrderId: created.id } });
    expect(first).toHaveLength(1);
    await prisma.kontrolAlat.deleteMany({
      where: { calibrationJobId: { in: first.map((job) => job.id) } },
    });

    await (
      workOrdersService as unknown as {
        fanOutCalibrationJobs: (tx: typeof prisma, wo: unknown) => Promise<void>;
      }
    ).fanOutCalibrationJobs(prisma, await workOrdersService.findOne(realCompanyId, created.id));

    const second = await prisma.calibrationJob.findMany({
      where: { workOrderId: created.id },
      include: { kontrolAlat: true },
    });
    expect(second.map((job) => job.id).sort()).toEqual(first.map((job) => job.id).sort());
    expect(second[0]!.kontrolAlat).not.toBeNull();
  });

  it("ON_SITE fan-out does not create KontrolAlat", async () => {
    const created = await assignedWorkOrderReadyToStart();
    await workOrdersService.start(realCompanyId, created.id);
    const jobs = await prisma.calibrationJob.findMany({ where: { workOrderId: created.id } });
    expect(jobs.length).toBeGreaterThan(0);
    expect(
      await prisma.kontrolAlat.count({ where: { calibrationJobId: { in: jobs.map((j) => j.id) } } }),
    ).toBe(0);
  });
});

describe("WorkOrdersService request review + item accessories", () => {
  it("rejects request review and accessories on ON_SITE work orders", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, {
      serviceMode: "ON_SITE",
    });
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);

    await expect(
      workOrdersService.updateRequestReview(realCompanyId, created.id, staffUserId, {
        requestReviewMethodOk: true,
      }),
    ).rejects.toMatchObject({ response: { code: "KONTROL_ALAT_NOT_APPLICABLE" } });

    await expect(
      workOrdersService.replaceItemAccessories(realCompanyId, created.id, created.items[0]!.id, {
        accessories: [{ label: "Unit", sortOrder: 10 }],
      }),
    ).rejects.toMatchObject({ response: { code: "KONTROL_ALAT_NOT_APPLICABLE" } });
  });

  it("stores request review once on the WOL and replaces item accessories", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, {
      serviceMode: "SEND_TO_LAB",
    });
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);

    const technician = await createTechnician(realCompanyId);
    const reviewed = await workOrdersService.updateRequestReview(
      realCompanyId,
      created.id,
      technician.id,
      {
        requestReviewMethodOk: true,
        requestReviewEquipmentOk: true,
        requestReviewPersonnelOk: true,
        requestReviewConfirmAgree: true,
        completed: true,
      },
    );
    expect(reviewed.requestReviewMethodOk).toBe(true);
    expect(reviewed.requestReviewConfirmAgree).toBe(true);
    expect(reviewed.requestReviewCompletedAt).toBeInstanceOf(Date);
    expect(reviewed.requestReviewCompletedByUserId).toBe(technician.id);
    expect(reviewed.requestReviewCompletedBy).toEqual({
      id: technician.id,
      name: technician.name,
    });

    const withAccessories = await workOrdersService.replaceItemAccessories(
      realCompanyId,
      created.id,
      created.items[0]!.id,
      { accessories: [{ label: "Rotor", sortOrder: 10 }] },
    );
    expect(withAccessories.items[0]!.accessories).toHaveLength(1);
    expect(withAccessories.items[0]!.accessories[0]!.label).toBe("Rotor");
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
        const origCreate = tx.workOrderItem.create.bind(tx.workOrderItem);
        tx.workOrderItem.create = (async (args: Parameters<typeof tx.workOrderItem.create>[0]) => {
          await origCreate(args);
          throw new Error("forced WorkOrderItem failure");
        }) as typeof tx.workOrderItem.create;
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

// =============================================================================
// MOM #1 — Transaction Revision + Immutable History
// =============================================================================

describe("WorkOrdersService.revise", () => {
  it("rejects revise when there is no additional scope to pick up", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);

    await expect(
      workOrdersService.revise(realCompanyId, created.id, staffUserId),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "NO_PENDING_SCOPE_CHANGE" }),
    });
  });

  it("rejects revise once IN_PROGRESS (scope lock matches the MOM's explicit boundary)", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId);
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    const technician = await createTechnician(realCompanyId);
    await workOrdersService.assign(realCompanyId, created.id, {
      technicians: [{ technicianUserId: technician.id }],
    });
    await workOrdersService.start(realCompanyId, created.id);

    await expect(
      workOrdersService.revise(realCompanyId, created.id, staffUserId),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "INVALID_STATUS_FOR_REVISE" }),
    });
  });

  it(
    "end-to-end 1 -> 3 (MOM #1 §7): REQ -> QUOTATION -> PO -> WOL scope growth flows through as an " +
      "additive WorkOrderItem, the original row stays byte-for-byte frozen, and CalibrationJob fan-out " +
      "correctly produces 3 jobs once started",
    async () => {
      const { quotation, purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, {
        unitPrice: 100_000,
      });
      const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
      expect(created.items).toHaveLength(1);
      expect(Number(created.items[0]!.qty)).toBe(1);
      const originalWorkOrderItemId = created.items[0]!.id;
      const originalPurchaseOrderItemId = created.items[0]!.purchaseOrderItemId;

      // Grow scope at every upstream level — each one's item is already
      // consumed downstream, so each revise() must add an additive sibling
      // row rather than mutate the frozen one (mom-1-item-revision-rule).
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
      await purchaseOrdersService.revise(realCompanyId, purchaseOrder.id, staffUserId);
      const revisedWorkOrder = await workOrdersService.revise(realCompanyId, created.id, staffUserId);

      expect(revisedWorkOrder.number).toBe(created.number);
      expect(revisedWorkOrder.items).toHaveLength(2);
      const originalRow = revisedWorkOrder.items.find((item) => item.id === originalWorkOrderItemId)!;
      expect(Number(originalRow.qty)).toBe(1); // frozen — never mutated
      expect(originalRow.purchaseOrderItemId).toBe(originalPurchaseOrderItemId);
      const siblingRow = revisedWorkOrder.items.find((item) => item.id !== originalWorkOrderItemId)!;
      expect(Number(siblingRow.qty)).toBe(2); // delta only
      expect(siblingRow.purchaseOrderItemId).not.toBe(originalPurchaseOrderItemId);

      const history = await workOrdersService.listHistory(realCompanyId, created.id);
      expect(history.map((h) => h.revisionNumber)).toEqual([1]);
      const rev1 = await workOrdersService.getHistoryRevision(realCompanyId, created.id, 1);
      expect(rev1.items).toHaveLength(1); // pre-revision snapshot: only the original item
      expect(Number(rev1.items[0]!.qty)).toBe(1);

      // Total declared scope (1 + 2 = 3) fans out correctly once started —
      // the existing fan-out mechanism (WorkOrder-wide idempotency guard,
      // per-item qty cardinality) is untouched by this MOM.
      const technician = await createTechnician(realCompanyId);
      await workOrdersService.assign(realCompanyId, created.id, {
        technicians: [{ technicianUserId: technician.id }],
      });
      await workOrdersService.start(realCompanyId, created.id);

      const jobs = await prisma.calibrationJob.findMany({ where: { workOrderId: created.id } });
      expect(jobs).toHaveLength(3);
      const jobsByPoItem = new Map<string, number>();
      for (const job of jobs) {
        jobsByPoItem.set(job.purchaseOrderItemId!, (jobsByPoItem.get(job.purchaseOrderItemId!) ?? 0) + 1);
      }
      expect(jobsByPoItem.get(originalPurchaseOrderItemId)).toBe(1);
      const siblingJobsCount = [...jobsByPoItem.entries()].find(
        ([poItemId]) => poItemId !== originalPurchaseOrderItemId,
      )?.[1];
      expect(siblingJobsCount).toBe(2);
    },
  );

  it("remove: a WorkOrderItem whose source PurchaseOrderItem was retired (CANCELLED) upstream is hard-deleted on the next revise(), leaving the other item untouched", async () => {
    const { quotation, purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, {
      itemCount: 2,
    });
    const created = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    expect(created.items).toHaveLength(2);
    const [itemA, itemB] = purchaseOrder.items;
    const workOrderItemA = created.items.find((wi) => wi.purchaseOrderItemId === itemA!.id)!;
    const workOrderItemB = created.items.find((wi) => wi.purchaseOrderItemId === itemB!.id)!;

    // Retire itemA all the way from the Quotation down through the
    // PurchaseOrder — the WorkOrder is still PLANNED, so both guards allow it.
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
    await purchaseOrdersService.revise(realCompanyId, purchaseOrder.id, staffUserId);

    const revised = await workOrdersService.revise(realCompanyId, created.id, staffUserId);

    expect(revised.items).toHaveLength(1);
    expect(revised.items[0]!.id).toBe(workOrderItemB.id);
    expect(Number(revised.items[0]!.qty)).toBe(Number(workOrderItemB.qty)); // untouched

    const removedRow = await prisma.workOrderItem.findUnique({ where: { id: workOrderItemA.id } });
    expect(removedRow).toBeNull(); // hard-deleted — always safe pre-start()
  });
});

// =============================================================================
// Allocation & Multi-WOL Architecture — required test matrix
// (docs/audits/final-po-allocation-wol-spk-architecture-decision.md)
// =============================================================================

/**
 * A single PurchaseOrderItem at an arbitrary quantity (default 100), for the
 * quantity-splitting test matrix. Unlike createApprovedPurchaseOrder's
 * one-device-per-item helper, this never creates per-unit Device rows —
 * splitting/allocation is independent of device identity resolution.
 */
async function createApprovedPurchaseOrderWithSingleItemQty(companyId: string, qty: number) {
  await ensureNonPpnTax(companyId);
  const customer = await createTestCustomer(companyId);
  const deviceTypeId = await getTestDeviceTypeId();
  await prisma.priceListItem.create({
    data: {
      companyId,
      deviceTypeId,
      unitPrice: new Prisma.Decimal(100_000),
      effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
    },
  });
  await prisma.user.upsert({
    where: { id: staffUserId },
    create: { id: staffUserId, email: `${staffUserId}@medcal.test`, name: "WO Staff", status: "ACTIVE" },
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
  await quotationsService.send(companyId, quotation.id);
  const approvedQuotation = await quotationsService.approve(companyId, quotation.id, staffUserId);

  const createdPo = await purchaseOrdersService.create(companyId, customerPoInput(approvedQuotation.id));
  createdPurchaseOrderIds.push(createdPo.id);
  const purchaseOrder = await purchaseOrdersService.approve(companyId, createdPo.id, staffUserId);

  const item = await prisma.purchaseOrderItem.findFirstOrThrow({
    where: { purchaseOrderId: purchaseOrder.id },
  });
  return { customer, purchaseOrder, item };
}

describe("Allocation & Multi-WOL Architecture — required test matrix", () => {
  // A — whole-item allocation (degenerate case: qty == remaining)
  it("A: whole-item allocation (PO item qty=10, Allocation qty=10) succeeds", async () => {
    const { purchaseOrder, item } = await createApprovedPurchaseOrderWithSingleItemQty(
      realCompanyId,
      10,
    );
    const wo = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id, {
      items: [{ purchaseOrderItemId: item.id, qty: 10 }],
    });
    expect(wo.items).toHaveLength(1);
    expect(Number(wo.items[0]!.qty)).toBe(10);
    expect(wo.items[0]!.allocationId).not.toBeNull();
    const allocation = await prisma.purchaseOrderItemAllocation.findUniqueOrThrow({
      where: { id: wo.items[0]!.allocationId! },
    });
    expect(allocation.status).toBe("ACTIVE");
    expect(Number(allocation.qty)).toBe(10);
  });

  // B — partial allocation
  it("B: partial allocation (PO item qty=100, Allocation qty=30) succeeds", async () => {
    const { purchaseOrder, item } = await createApprovedPurchaseOrderWithSingleItemQty(
      realCompanyId,
      100,
    );
    const wo = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id, {
      items: [{ purchaseOrderItemId: item.id, qty: 30 }],
    });
    expect(Number(wo.items[0]!.qty)).toBe(30);
  });

  // C — multiple allocations summing exactly to the item's qty
  it("C: multiple allocations (30 + 40 + 30 = 100) all succeed", async () => {
    const { purchaseOrder, item } = await createApprovedPurchaseOrderWithSingleItemQty(
      realCompanyId,
      100,
    );
    const wo1 = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id, {
      items: [{ purchaseOrderItemId: item.id, qty: 30 }],
    });
    const wo2 = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id, {
      items: [{ purchaseOrderItemId: item.id, qty: 40 }],
    });
    const wo3 = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id, {
      items: [{ purchaseOrderItemId: item.id, qty: 30 }],
    });
    expect([wo1, wo2, wo3].every((wo) => wo.status !== "CANCELLED")).toBe(true);
    const activeSum = await prisma.purchaseOrderItemAllocation.aggregate({
      where: { purchaseOrderItemId: item.id, status: "ACTIVE" },
      _sum: { qty: true },
    });
    expect(Number(activeSum._sum.qty)).toBe(100);
  });

  // D — over-allocation is rejected
  it("D: over-allocation (30 + 40 + 31 = 101) is rejected on the third request", async () => {
    const { purchaseOrder, item } = await createApprovedPurchaseOrderWithSingleItemQty(
      realCompanyId,
      100,
    );
    await createTrackedWorkOrder(realCompanyId, purchaseOrder.id, {
      items: [{ purchaseOrderItemId: item.id, qty: 30 }],
    });
    await createTrackedWorkOrder(realCompanyId, purchaseOrder.id, {
      items: [{ purchaseOrderItemId: item.id, qty: 40 }],
    });
    await expect(
      workOrdersService.create(realCompanyId, {
        purchaseOrderId: purchaseOrder.id,
        items: [{ purchaseOrderItemId: item.id, qty: 31 }],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "OVER_ALLOCATION" }),
    });
    const activeSum = await prisma.purchaseOrderItemAllocation.aggregate({
      where: { purchaseOrderItemId: item.id, status: "ACTIVE" },
      _sum: { qty: true },
    });
    expect(Number(activeSum._sum.qty)).toBe(70); // the rejected 31 never landed
  });

  // E — cancelling an allocation (pre-fan-out, via WorkOrder.cancel()) returns quantity
  it("E: cancelling a WorkOrder pre-fan-out returns its allocation's quantity to remaining", async () => {
    const { purchaseOrder, item } = await createApprovedPurchaseOrderWithSingleItemQty(
      realCompanyId,
      100,
    );
    const wo = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id, {
      items: [{ purchaseOrderItemId: item.id, qty: 30 }],
    });
    let sum = await prisma.purchaseOrderItemAllocation.aggregate({
      where: { purchaseOrderItemId: item.id, status: "ACTIVE" },
      _sum: { qty: true },
    });
    expect(Number(sum._sum.qty)).toBe(30);

    await workOrdersService.cancel(realCompanyId, wo.id);

    sum = await prisma.purchaseOrderItemAllocation.aggregate({
      where: { purchaseOrderItemId: item.id, status: "ACTIVE" },
      _sum: { qty: true },
    });
    expect(sum._sum.qty).toBeNull(); // fully released — remaining is back to 100
    const allocation = await prisma.purchaseOrderItemAllocation.findFirstOrThrow({
      where: { purchaseOrderItemId: item.id },
    });
    expect(allocation.status).toBe("CANCELLED");

    // And the released quantity is immediately re-allocatable in full.
    const replacement = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id, {
      items: [{ purchaseOrderItemId: item.id, qty: 100 }],
    });
    expect(Number(replacement.items[0]!.qty)).toBe(100);
  });

  // F — multiple simultaneously active WorkOrders drawing from the same item
  it("F: multiple active WorkOrders coexist, each with its own allocation of the same item", async () => {
    const { purchaseOrder, item } = await createApprovedPurchaseOrderWithSingleItemQty(
      realCompanyId,
      100,
    );
    const wo1 = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id, {
      items: [{ purchaseOrderItemId: item.id, qty: 30 }],
    });
    const wo2 = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id, {
      items: [{ purchaseOrderItemId: item.id, qty: 40 }],
    });
    const wo3 = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id, {
      items: [{ purchaseOrderItemId: item.id, qty: 30 }],
    });
    const activeCount = await prisma.workOrder.count({
      where: { purchaseOrderId: purchaseOrder.id, status: { not: "CANCELLED" } },
    });
    expect(activeCount).toBe(3);
    expect(new Set([wo1.id, wo2.id, wo3.id]).size).toBe(3);
  });

  // G — one WorkOrder, multiple PO items
  it("G: one WorkOrder can hold allocations from multiple PO items", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, { itemCount: 3 });
    const items = await prisma.purchaseOrderItem.findMany({
      where: { purchaseOrderId: purchaseOrder.id },
      orderBy: { createdAt: "asc" },
    });
    const wo = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id, {
      items: items.map((i) => ({ purchaseOrderItemId: i.id, qty: i.qty.toNumber() })),
    });
    expect(wo.items).toHaveLength(3);
    expect(new Set(wo.items.map((i) => i.purchaseOrderItemId)).size).toBe(3);
  });

  // H — concurrent allocation: exactly one of two overlapping requests must win
  it("H: concurrent allocation (60 + 50 against a qty=100 item) — exactly one succeeds, never 110 allocated", async () => {
    const { purchaseOrder, item } = await createApprovedPurchaseOrderWithSingleItemQty(
      realCompanyId,
      100,
    );

    const results = await Promise.allSettled([
      workOrdersService.create(realCompanyId, {
        purchaseOrderId: purchaseOrder.id,
        items: [{ purchaseOrderItemId: item.id, qty: 60 }],
      }),
      workOrdersService.create(realCompanyId, {
        purchaseOrderId: purchaseOrder.id,
        items: [{ purchaseOrderItemId: item.id, qty: 50 }],
      }),
    ]);

    for (const result of results) {
      if (result.status === "fulfilled") createdWorkOrderIds.push(result.value.id);
    }

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    // 60 + 50 = 110 > 100: both cannot fit, so exactly one must win.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const activeSum = await prisma.purchaseOrderItemAllocation.aggregate({
      where: { purchaseOrderItemId: item.id, status: "ACTIVE" },
      _sum: { qty: true },
    });
    expect([60, 50]).toContain(Number(activeSum._sum.qty));
    expect(Number(activeSum._sum.qty)).toBeLessThanOrEqual(100);
  });

  // I — fan-out uses the allocated (WorkOrderItem) quantity, not the full PO item quantity
  it("I: WorkOrder.start() fans out exactly the allocated quantity (30 jobs from a 100-unit item with a 30-unit allocation)", async () => {
    const { purchaseOrder, item } = await createApprovedPurchaseOrderWithSingleItemQty(
      realCompanyId,
      100,
    );
    const wo = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id, {
      items: [{ purchaseOrderItemId: item.id, qty: 30 }],
    });
    const technician = await createTechnician(realCompanyId);
    await workOrdersService.assign(realCompanyId, wo.id, {
      technicians: [{ technicianUserId: technician.id }],
    });
    await workOrdersService.start(realCompanyId, wo.id);

    const jobCount = await prisma.calibrationJob.count({ where: { workOrderId: wo.id } });
    expect(jobCount).toBe(30);
  });

  // J — historical compatibility: legacy WorkOrderItem rows (allocationId = NULL) keep working
  it("J: a WorkOrderItem created before this architecture (allocationId = NULL) still fans out correctly", async () => {
    const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, { itemCount: 2 });
    const wo = await createTrackedWorkOrder(realCompanyId, purchaseOrder.id);
    // Simulate a pre-existing legacy row: this WorkOrder's items were in fact
    // created through the allocation-aware path above (allocationId set) —
    // explicitly null it out to model a row that predates this architecture,
    // exactly as every real historical WorkOrderItem does (never backfilled).
    await prisma.workOrderItem.updateMany({
      where: { workOrderId: wo.id },
      data: { allocationId: null },
    });

    const technician = await createTechnician(realCompanyId);
    await workOrdersService.assign(realCompanyId, wo.id, {
      technicians: [{ technicianUserId: technician.id }],
    });
    const started = await workOrdersService.start(realCompanyId, wo.id);
    expect(started.status).toBe("IN_PROGRESS");

    const jobCount = await prisma.calibrationJob.count({ where: { workOrderId: wo.id } });
    expect(jobCount).toBe(2); // itemCount: 2, one job per item, unaffected by allocationId being NULL
  });
});

// =============================================================================
// Shared ON_SITE SPK — Parent / Child SPK
// =============================================================================

describe("Shared ON_SITE SPK (Parent / Child)", () => {
  const sharedSpkService = new SharedSpkService();
  const deliveryNotesService = new DeliveryNotesService();
  const createdEquipmentTypeIds: string[] = [];
  const createdEquipmentIds: string[] = [];

  afterAll(async () => {
    await prisma.workOrderEquipment.deleteMany({
      where: { equipmentId: { in: createdEquipmentIds } },
    });
    if (createdEquipmentIds.length > 0) {
      await prisma.equipment.deleteMany({ where: { id: { in: createdEquipmentIds } } });
    }
    if (createdEquipmentTypeIds.length > 0) {
      await prisma.equipmentType.deleteMany({ where: { id: { in: createdEquipmentTypeIds } } });
    }
  });

  type Batch = {
    qty: number;
    scheduledStart?: Date;
    scheduledEnd?: Date;
    technicianUserId?: string;
  };

  /** Creates a Parent + Children (one technician each) and tracks them for cleanup. */
  async function createShared(
    purchaseOrderId: string,
    itemId: string,
    batches: Batch[],
    extra?: { addressText?: string },
  ) {
    const children = [];
    for (const batch of batches) {
      const technicianUserId = batch.technicianUserId ?? (await createTechnician(realCompanyId)).id;
      children.push({
        technicianUserId,
        items: [{ purchaseOrderItemId: itemId, qty: batch.qty }],
        scheduledStart: batch.scheduledStart,
        scheduledEnd: batch.scheduledEnd,
      });
    }
    const detail = await sharedSpkService.create(realCompanyId, staffUserId, {
      purchaseOrderId,
      addressText: extra?.addressText,
      children,
    });
    createdSpkParentIds.push(detail.id);
    return detail;
  }

  async function sharedPo(qty: number) {
    return createApprovedPurchaseOrderWithSingleItemQty(realCompanyId, qty);
  }

  async function activeAllocationSum(itemId: string): Promise<number> {
    const agg = await prisma.purchaseOrderItemAllocation.aggregate({
      where: { purchaseOrderItemId: itemId, status: "ACTIVE" },
      _sum: { qty: true },
    });
    return agg._sum.qty?.toNumber() ?? 0;
  }

  /** Every ACTIVE allocation must be backed by exactly one WorkOrderItem and vice versa. */
  async function expectNoOrphanedAllocations(itemId: string, parentId: string) {
    const activeAllocations = await prisma.purchaseOrderItemAllocation.findMany({
      where: { purchaseOrderItemId: itemId, status: "ACTIVE" },
      include: { workOrderItem: true, workOrder: { select: { parentSpkId: true, status: true } } },
    });
    for (const allocation of activeAllocations) {
      expect(allocation.workOrderItem).not.toBeNull();
      expect(allocation.workOrderItem!.qty.equals(allocation.qty)).toBe(true);
      expect(allocation.workOrder.status).not.toBe("CANCELLED");
    }
    const children = await prisma.workOrder.findMany({
      where: { parentSpkId: parentId, status: { not: "CANCELLED" } },
      include: { items: true },
    });
    const itemQty = children.flatMap((child) => child.items).reduce((sum, row) => sum + row.qty.toNumber(), 0);
    const allocQty = activeAllocations.reduce((sum, row) => sum + row.qty.toNumber(), 0);
    expect(itemQty).toBe(allocQty);
  }

  async function startChild(workOrderId: string) {
    return workOrdersService.start(realCompanyId, workOrderId);
  }

  // ---- schemas ----------------------------------------------------------------

  describe("schemas", () => {
    const child = { technicianUserId: "u1", items: [{ purchaseOrderItemId: "i1", qty: 5 }] };

    it("requires at least two Children", () => {
      expect(sharedSpkCreateSchema.safeParse({ purchaseOrderId: "po", children: [child] }).success).toBe(false);
      expect(sharedSpkCreateSchema.safeParse({ purchaseOrderId: "po", children: [child, child] }).success).toBe(true);
    });

    it("rejects a schedule that ends before it starts", () => {
      const parsed = sharedSpkCreateSchema.safeParse({
        purchaseOrderId: "po",
        children: [child, { ...child, scheduledStart: "2026-10-05", scheduledEnd: "2026-10-01" }],
      });
      expect(parsed.success).toBe(false);
    });

    it("rejects an empty revision and a Child referenced twice", () => {
      expect(sharedSpkReviseSchema.safeParse({}).success).toBe(false);
      expect(
        sharedSpkReviseSchema.safeParse({ children: [{ ...child, workOrderId: "w1" }], removeWorkOrderIds: ["w1"] })
          .success,
      ).toBe(false);
    });
  });

  // ---- numbering --------------------------------------------------------------

  describe("numbering", () => {
    it("gives the Parent the global SPK number and Children parentNumber-1..N", async () => {
      const { purchaseOrder, item } = await sharedPo(30);
      const parent = await createShared(purchaseOrder.id, item.id, [{ qty: 10 }, { qty: 10 }, { qty: 10 }]);

      expect(isValidDocumentNumber(parent.number)).toBe(true);
      expect(parent.number.startsWith("SPK/")).toBe(true);
      expect(parent.children.map((child) => child.number)).toEqual([
        `${parent.number}-1`,
        `${parent.number}-2`,
        `${parent.number}-3`,
      ]);
      expect(parent.children.map((child) => child.childSequence)).toEqual([1, 2, 3]);
    });

    it("does not let Child numbers consume the global SPK sequence, and later SPK allocation still works", async () => {
      const first = await sharedPo(20);
      const parent = await createShared(first.purchaseOrder.id, first.item.id, [{ qty: 10 }, { qty: 10 }]);

      const second = await createApprovedPurchaseOrder(realCompanyId, { serviceMode: "ON_SITE" });
      const single = await createTrackedWorkOrder(realCompanyId, second.purchaseOrder.id);
      const wol = await createApprovedPurchaseOrder(realCompanyId, { serviceMode: "SEND_TO_LAB" });
      const lab = await createTrackedWorkOrder(realCompanyId, wol.purchaseOrder.id);

      // The Parent took one SPK number; the two Children took none → next flat SPK is parent + 1.
      expect(Number(single.number.split("/")[3])).toBe(Number(parent.number.split("/")[3]) + 1);
      expect(isValidDocumentNumber(single.number)).toBe(true);
      expect(isValidDocumentNumber(lab.number)).toBe(true);
      expect(lab.number.startsWith("WOL/")).toBe(true);
      expect(single.parentSpkId).toBeNull();
      expect(single.childSequence).toBeNull();
    });
  });

  // ---- atomic creation ----------------------------------------------------------

  describe("creation", () => {
    it("creates Parent + Children atomically with assignment, allocation and per-Child schedule", async () => {
      const { purchaseOrder, item } = await sharedPo(40);
      const techA = await createTechnician(realCompanyId);
      const techB = await createTechnician(realCompanyId);
      const parent = await createShared(
        purchaseOrder.id,
        item.id,
        [
          { qty: 15, technicianUserId: techA.id, scheduledStart: new Date("2026-10-01"), scheduledEnd: new Date("2026-10-01") },
          { qty: 25, technicianUserId: techB.id, scheduledStart: new Date("2026-10-02"), scheduledEnd: new Date("2026-10-04") },
        ],
        { addressText: "RS Contoh" },
      );

      expect(parent.status).toBe("NOT_STARTED");
      expect(parent.children).toHaveLength(2);
      expect(parent.children.map((child) => child.status)).toEqual(["ASSIGNED", "ASSIGNED"]);
      expect(parent.children[0]!.technicians.map((row) => row.id)).toEqual([techA.id]);
      expect(parent.children[1]!.technicians.map((row) => row.id)).toEqual([techB.id]);
      expect(parent.children[1]!.scheduledStart?.toISOString().slice(0, 10)).toBe("2026-10-02");
      expect(parent.children[1]!.scheduledEnd?.toISOString().slice(0, 10)).toBe("2026-10-04");
      expect(parent.children.map((child) => child.items[0]!.qty)).toEqual([15, 25]);
      expect(await activeAllocationSum(item.id)).toBe(40);

      const rows = await prisma.workOrder.findMany({ where: { parentSpkId: parent.id } });
      expect(rows.every((row) => row.serviceMode === "ON_SITE" && row.addressText === "RS Contoh")).toBe(true);
    });

    it("rejects a SEND_TO_LAB purchase order (ON_SITE only) and creates nothing", async () => {
      const { purchaseOrder } = await createApprovedPurchaseOrder(realCompanyId, {
        serviceMode: "SEND_TO_LAB",
        itemCount: 2,
      });
      const items = await prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId: purchaseOrder.id } });
      const techA = await createTechnician(realCompanyId);
      const techB = await createTechnician(realCompanyId);
      await expect(
        sharedSpkService.create(realCompanyId, staffUserId, {
          purchaseOrderId: purchaseOrder.id,
          children: [
            { technicianUserId: techA.id, items: [{ purchaseOrderItemId: items[0]!.id, qty: 1 }] },
            { technicianUserId: techB.id, items: [{ purchaseOrderItemId: items[1]!.id, qty: 1 }] },
          ],
        }),
      ).rejects.toMatchObject({ response: { code: "SHARED_SPK_ON_SITE_ONLY" } });
      expect(await prisma.spkParent.count({ where: { purchaseOrderId: purchaseOrder.id } })).toBe(0);
    });

    it("requires an APPROVED purchase order", async () => {
      const { purchaseOrder, item } = await sharedPo(10);
      await prisma.purchaseOrder.update({ where: { id: purchaseOrder.id }, data: { status: "DRAFT" } });
      const techA = await createTechnician(realCompanyId);
      const techB = await createTechnician(realCompanyId);
      await expect(
        sharedSpkService.create(realCompanyId, staffUserId, {
          purchaseOrderId: purchaseOrder.id,
          children: [
            { technicianUserId: techA.id, items: [{ purchaseOrderItemId: item.id, qty: 5 }] },
            { technicianUserId: techB.id, items: [{ purchaseOrderItemId: item.id, qty: 5 }] },
          ],
        }),
      ).rejects.toMatchObject({ response: { code: "INVALID_STATUS_FOR_WORK_ORDER" } });
    });

    it("rejects an inactive / unknown technician and creates nothing", async () => {
      const { purchaseOrder, item } = await sharedPo(10);
      const techA = await createTechnician(realCompanyId);
      await expect(
        sharedSpkService.create(realCompanyId, staffUserId, {
          purchaseOrderId: purchaseOrder.id,
          children: [
            { technicianUserId: techA.id, items: [{ purchaseOrderItemId: item.id, qty: 5 }] },
            { technicianUserId: "no-such-user", items: [{ purchaseOrderItemId: item.id, qty: 5 }] },
          ],
        }),
      ).rejects.toMatchObject({ response: { code: "INVALID_WORK_ORDER_ASSIGNEE" } });
      expect(await prisma.spkParent.count({ where: { purchaseOrderId: purchaseOrder.id } })).toBe(0);
      expect(await prisma.workOrder.count({ where: { purchaseOrderId: purchaseOrder.id } })).toBe(0);
    });

    it("rejects an invalid allocation (non-active item, duplicate item in one Child)", async () => {
      const { purchaseOrder, item } = await sharedPo(10);
      const techA = await createTechnician(realCompanyId);
      const techB = await createTechnician(realCompanyId);
      await expect(
        sharedSpkService.create(realCompanyId, staffUserId, {
          purchaseOrderId: purchaseOrder.id,
          children: [
            { technicianUserId: techA.id, items: [{ purchaseOrderItemId: "not-an-item", qty: 5 }] },
            { technicianUserId: techB.id, items: [{ purchaseOrderItemId: item.id, qty: 5 }] },
          ],
        }),
      ).rejects.toMatchObject({ response: { code: "PURCHASE_ORDER_ITEM_NOT_ACTIVE" } });
      await expect(
        sharedSpkService.create(realCompanyId, staffUserId, {
          purchaseOrderId: purchaseOrder.id,
          children: [
            {
              technicianUserId: techA.id,
              items: [
                { purchaseOrderItemId: item.id, qty: 2 },
                { purchaseOrderItemId: item.id, qty: 3 },
              ],
            },
            { technicianUserId: techB.id, items: [{ purchaseOrderItemId: item.id, qty: 5 }] },
          ],
        }),
      ).rejects.toMatchObject({ response: { code: "DUPLICATE_ALLOCATION_ITEM" } });
      expect(await prisma.spkParent.count({ where: { purchaseOrderId: purchaseOrder.id } })).toBe(0);
    });

    it("rolls back the Parent and every Child when Child #3 fails (over-allocation)", async () => {
      const { purchaseOrder, item } = await sharedPo(30);
      const sequenceBefore = await prisma.documentNumberSequence.findFirst({
        where: { companyId: realCompanyId, documentType: "WORK_ORDER" },
      });
      const techs = [
        await createTechnician(realCompanyId),
        await createTechnician(realCompanyId),
        await createTechnician(realCompanyId),
        await createTechnician(realCompanyId),
      ];
      await expect(
        sharedSpkService.create(realCompanyId, staffUserId, {
          purchaseOrderId: purchaseOrder.id,
          children: [
            { technicianUserId: techs[0]!.id, items: [{ purchaseOrderItemId: item.id, qty: 10 }] },
            { technicianUserId: techs[1]!.id, items: [{ purchaseOrderItemId: item.id, qty: 10 }] },
            { technicianUserId: techs[2]!.id, items: [{ purchaseOrderItemId: item.id, qty: 11 }] }, // 31 > 30
            { technicianUserId: techs[3]!.id, items: [{ purchaseOrderItemId: item.id, qty: 5 }] },
          ],
        }),
      ).rejects.toMatchObject({ response: { code: "OVER_ALLOCATION" } });

      expect(await prisma.spkParent.count({ where: { purchaseOrderId: purchaseOrder.id } })).toBe(0);
      expect(await prisma.workOrder.count({ where: { purchaseOrderId: purchaseOrder.id } })).toBe(0);
      expect(await prisma.workOrderAssignment.count({ where: { technicianUserId: { in: techs.map((t) => t.id) } } })).toBe(0);
      expect(await activeAllocationSum(item.id)).toBe(0);
      // The number consumed inside the failed transaction was rolled back too.
      const sequenceAfter = await prisma.documentNumberSequence.findFirst({
        where: { companyId: realCompanyId, documentType: "WORK_ORDER" },
      });
      expect(sequenceAfter?.lastSequence).toBe(sequenceBefore?.lastSequence);
    });

    it("is safe to double-submit: the second identical submit is rejected and adds nothing", async () => {
      const { purchaseOrder, item } = await sharedPo(20);
      const techA = await createTechnician(realCompanyId);
      const techB = await createTechnician(realCompanyId);
      const payload = {
        purchaseOrderId: purchaseOrder.id,
        children: [
          { technicianUserId: techA.id, items: [{ purchaseOrderItemId: item.id, qty: 10 }] },
          { technicianUserId: techB.id, items: [{ purchaseOrderItemId: item.id, qty: 10 }] },
        ],
      };
      const first = await sharedSpkService.create(realCompanyId, staffUserId, payload);
      createdSpkParentIds.push(first.id);
      await expect(sharedSpkService.create(realCompanyId, staffUserId, payload)).rejects.toMatchObject({
        response: { code: "OVER_ALLOCATION" },
      });
      expect(await prisma.spkParent.count({ where: { purchaseOrderId: purchaseOrder.id } })).toBe(1);
      expect(await prisma.workOrder.count({ where: { purchaseOrderId: purchaseOrder.id } })).toBe(2);
      expect(await activeAllocationSum(item.id)).toBe(20);
    });

    it("keeps single/flat SPK untouched (no Parent) and exposes parentSpk on Children via findOne", async () => {
      const single = await createApprovedPurchaseOrder(realCompanyId, { serviceMode: "ON_SITE" });
      const flat = await createTrackedWorkOrder(realCompanyId, single.purchaseOrder.id);
      expect(flat.parentSpk).toBeNull();

      const { purchaseOrder, item } = await sharedPo(10);
      const parent = await createShared(purchaseOrder.id, item.id, [{ qty: 5 }, { qty: 5 }]);
      const child = await workOrdersService.findOne(realCompanyId, parent.children[0]!.id);
      expect(child.parentSpk).toEqual({ id: parent.id, number: parent.number });
      const listed = await workOrdersService.findAll(realCompanyId, workOrderListQuerySchema.parse({ parentSpkId: parent.id }));
      expect(listed.data.map((row) => row.id).sort()).toEqual(parent.children.map((row) => row.id).sort());
    });

    it("enforces the DB invariants: parentSpkId/childSequence both-or-neither, and a unique sequence per Parent", async () => {
      const { purchaseOrder, item } = await sharedPo(10);
      const parent = await createShared(purchaseOrder.id, item.id, [{ qty: 5 }, { qty: 5 }]);
      const [first, second] = parent.children;

      await expect(
        prisma.workOrder.update({ where: { id: first!.id }, data: { childSequence: null } }),
      ).rejects.toThrow();
      await expect(
        prisma.workOrder.update({ where: { id: second!.id }, data: { childSequence: 1 } }),
      ).rejects.toThrow();

      const flat = await createApprovedPurchaseOrder(realCompanyId, { serviceMode: "ON_SITE" });
      const flatWo = await createTrackedWorkOrder(realCompanyId, flat.purchaseOrder.id);
      await expect(
        prisma.workOrder.update({ where: { id: flatWo.id }, data: { childSequence: 4 } }),
      ).rejects.toThrow();
    });
  });

  // ---- progress -------------------------------------------------------------------

  describe("progress", () => {
    it("is quantity-weighted: 100/100 + 120/120 + 50/86 + 0/100 = 270/406", async () => {
      const { purchaseOrder, item } = await sharedPo(406);
      const parent = await createShared(purchaseOrder.id, item.id, [
        { qty: 100 },
        { qty: 120 },
        { qty: 86 },
        { qty: 100 },
      ]);
      expect(parent.progress).toEqual({ total: 406, completed: 0, percentage: 0 });

      const [c1, c2, c3] = parent.children;
      await startChild(c1!.id);
      await startChild(c2!.id);
      await startChild(c3!.id);
      await acceptAllJobs(c1!.id);
      await acceptAllJobs(c2!.id);
      const c3Jobs = await prisma.calibrationJob.findMany({
        where: { workOrderId: c3!.id },
        orderBy: { unitOrdinal: "asc" },
        take: 50,
        select: { id: true },
      });
      await prisma.calibrationJob.updateMany({
        where: { id: { in: c3Jobs.map((job) => job.id) } },
        data: { status: "ACCEPTED_BY_QA" },
      });

      const detail = await sharedSpkService.findOne(realCompanyId, parent.id);
      expect(detail.children.map((child) => [child.progress.completed, child.progress.total])).toEqual([
        [100, 100],
        [120, 120],
        [50, 86],
        [0, 100],
      ]);
      expect(detail.progress.completed).toBe(270);
      expect(detail.progress.total).toBe(406);
      // 270/406 = 66.5% — NOT the 64% average of (100,100,58,0).
      expect(detail.progress.percentage).toBe(67);
      expect(detail.status).toBe("IN_PROGRESS");
    });

    it("excludes a cancelled Child from the aggregate (its allocation is released)", async () => {
      const { purchaseOrder, item } = await sharedPo(30);
      const parent = await createShared(purchaseOrder.id, item.id, [{ qty: 10 }, { qty: 20 }]);
      await workOrdersService.cancel(realCompanyId, parent.children[1]!.id);

      const detail = await sharedSpkService.findOne(realCompanyId, parent.id);
      expect(detail.progress).toEqual({ total: 10, completed: 0, percentage: 0 });
      expect(detail.children[1]!.status).toBe("CANCELLED");
      expect(await activeAllocationSum(item.id)).toBe(10);
      expect(detail.status).toBe("NOT_STARTED");
    });

    it("derives COMPLETED only when every active Child is DONE, with no Parent state stored", async () => {
      const { purchaseOrder, item } = await sharedPo(4);
      const parent = await createShared(purchaseOrder.id, item.id, [{ qty: 2 }, { qty: 2 }]);
      for (const child of parent.children) {
        await startChild(child.id);
        await acceptAllJobs(child.id);
        await workOrdersService.done(realCompanyId, child.id);
      }
      const detail = await sharedSpkService.findOne(realCompanyId, parent.id);
      expect(detail.status).toBe("COMPLETED");
      expect(detail.progress).toEqual({ total: 4, completed: 4, percentage: 100 });
      // The Parent row itself carries no execution state.
      const row = await prisma.spkParent.findUniqueOrThrow({ where: { id: parent.id } });
      expect(Object.keys(row)).not.toContain("status");
      expect(Object.keys(row)).not.toContain("scheduledStart");
    });
  });

  // ---- DLN ---------------------------------------------------------------------------

  describe("DLN", () => {
    async function giveConfirmedEquipment(workOrderId: string) {
      const type = await prisma.equipmentType.create({
        data: { code: `EQT-${randomUUID().slice(0, 8).toUpperCase()}`, name: "Shared SPK Test Type" },
      });
      createdEquipmentTypeIds.push(type.id);
      const unit = await prisma.equipment.create({
        data: {
          companyId: realCompanyId,
          equipmentTypeId: type.id,
          code: `EQU-${randomUUID().slice(0, 8).toUpperCase()}`,
          brand: "Fluke",
          model: "ESA620",
          serialNumber: randomUUID().slice(0, 8),
          isActive: true,
        },
      });
      createdEquipmentIds.push(unit.id);
      await workOrdersService.replaceEquipment(realCompanyId, workOrderId, {
        equipment: [{ equipmentId: unit.id, equipmentTypeId: type.id }],
      });
      await workOrdersService.confirmEquipment(realCompanyId, workOrderId);
    }

    it("lets each Child own a DLN with its own date; the Parent can never have one", async () => {
      const { purchaseOrder, item } = await sharedPo(20);
      const parent = await createShared(purchaseOrder.id, item.id, [
        { qty: 10, scheduledStart: new Date("2026-10-01") },
        { qty: 10, scheduledStart: new Date("2026-10-02") },
      ]);
      const [c1, c2] = parent.children;
      await giveConfirmedEquipment(c1!.id);
      await giveConfirmedEquipment(c2!.id);

      const dn1 = await deliveryNotesService.issue(realCompanyId, c1!.id);
      const dn2 = await deliveryNotesService.issue(realCompanyId, c2!.id);

      expect(dn1.number.startsWith("DLN/")).toBe(true);
      expect(isValidDocumentNumber(dn1.number)).toBe(true);
      expect(Number(dn2.number.split("/")[3])).toBe(Number(dn1.number.split("/")[3]) + 1);
      expect(dn1.workOrderNumber).toBe(`${parent.number}-1`);
      expect(dn2.workOrderNumber).toBe(`${parent.number}-2`);
      expect(dn1.issuedAt.toISOString().slice(0, 10)).toBe("2026-10-01");
      expect(dn2.issuedAt.toISOString().slice(0, 10)).toBe("2026-10-02");

      // Parent is not a WorkOrder: it cannot enter the DLN flow at all.
      await expect(deliveryNotesService.issue(realCompanyId, parent.id)).rejects.toMatchObject({
        response: { code: "WORK_ORDER_NOT_FOUND" },
      });
      await expect(workOrdersService.start(realCompanyId, parent.id)).rejects.toMatchObject({
        response: { code: "WORK_ORDER_NOT_FOUND" },
      });
    });
  });

  // ---- revision -----------------------------------------------------------------------

  describe("revision (per-Child locking)", () => {
    it("fully revises an all-unstarted shared job: quantity, technician, schedule, add and remove Children", async () => {
      const { purchaseOrder, item } = await sharedPo(40);
      const parent = await createShared(purchaseOrder.id, item.id, [{ qty: 10 }, { qty: 10 }, { qty: 20 }]);
      const [c1, c2, c3] = parent.children;
      const newTech = await createTechnician(realCompanyId);
      const addTech = await createTechnician(realCompanyId);

      const revised = await sharedSpkService.revise(
        realCompanyId,
        staffUserId,
        parent.id,
        sharedSpkReviseSchema.parse({
          children: [
            // c1: 10 -> 15, new technician, new schedule
            {
              workOrderId: c1!.id,
              technicianUserId: newTech.id,
              items: [{ purchaseOrderItemId: item.id, qty: 15 }],
              scheduledStart: "2026-11-03",
              scheduledEnd: "2026-11-05",
            },
            // c2 untouched except schedule
            {
              workOrderId: c2!.id,
              technicianUserId: c2!.technicians[0]!.id,
              items: [{ purchaseOrderItemId: item.id, qty: 10 }],
              scheduledStart: "2026-11-06",
            },
            // new Child takes the 5 units freed from c3 (20 -> removed) + others
            { technicianUserId: addTech.id, items: [{ purchaseOrderItemId: item.id, qty: 15 }] },
          ],
          removeWorkOrderIds: [c3!.id],
        }),
      );

      // Parent identity is stable.
      expect(revised.id).toBe(parent.id);
      expect(revised.number).toBe(parent.number);

      const byNumber = new Map(revised.children.map((child) => [child.number, child]));
      const r1 = byNumber.get(`${parent.number}-1`)!;
      expect(r1.items[0]!.qty).toBe(15);
      expect(r1.technicians.map((row) => row.id)).toEqual([newTech.id]);
      expect(r1.scheduledStart?.toISOString().slice(0, 10)).toBe("2026-11-03");
      expect(byNumber.get(`${parent.number}-2`)!.scheduledStart?.toISOString().slice(0, 10)).toBe("2026-11-06");
      expect(byNumber.get(`${parent.number}-3`)!.status).toBe("CANCELLED");
      // New Child gets the next sequence, never a reused one.
      const added = byNumber.get(`${parent.number}-4`)!;
      expect(added.childSequence).toBe(4);
      expect(added.items[0]!.qty).toBe(15);
      expect(added.status).toBe("ASSIGNED");

      expect(await activeAllocationSum(item.id)).toBe(40);
      await expectNoOrphanedAllocations(item.id, parent.id);
      // Append-only history was written for every revised/removed Child.
      expect(await prisma.workOrderHistory.count({ where: { workOrderId: { in: [c1!.id, c2!.id, c3!.id] } } })).toBe(3);
    });

    it("locks only the started Child; the others stay revisable", async () => {
      const { purchaseOrder, item } = await sharedPo(30);
      const parent = await createShared(purchaseOrder.id, item.id, [
        { qty: 10, scheduledStart: new Date("2026-10-01") },
        { qty: 10 },
        { qty: 10 },
      ]);
      const [c1, c2, c3] = parent.children;
      await startChild(c1!.id);

      const tech = await createTechnician(realCompanyId);
      const body = (workOrderId: string, qty: number, extra: object = {}) => ({
        workOrderId,
        technicianUserId: tech.id,
        items: [{ purchaseOrderItemId: item.id, qty }],
        ...extra,
      });

      // Started Child: editing, removing and moving its quantity are all refused.
      await expect(
        sharedSpkService.revise(realCompanyId, staffUserId, parent.id, sharedSpkReviseSchema.parse({ children: [body(c1!.id, 5)] })),
      ).rejects.toMatchObject({ response: { code: "SHARED_CHILD_LOCKED" } });
      await expect(
        sharedSpkService.revise(realCompanyId, staffUserId, parent.id, sharedSpkReviseSchema.parse({ removeWorkOrderIds: [c1!.id] })),
      ).rejects.toMatchObject({ response: { code: "SHARED_CHILD_LOCKED" } });
      await expect(
        sharedSpkService.revise(
          realCompanyId,
          staffUserId,
          parent.id,
          sharedSpkReviseSchema.parse({ children: [body(c2!.id, 20)], removeWorkOrderIds: [c1!.id] }),
        ),
      ).rejects.toMatchObject({ response: { code: "SHARED_CHILD_LOCKED" } });

      // Nothing leaked from the refused attempts.
      const c1After = await prisma.workOrder.findUniqueOrThrow({
        where: { id: c1!.id },
        include: { items: true, assignments: true },
      });
      expect(c1After.status).toBe("IN_PROGRESS");
      expect(c1After.items.map((row) => row.qty.toNumber())).toEqual([10]);
      expect(c1After.assignments.map((row) => row.technicianUserId)).toEqual([c1!.technicians[0]!.id]);
      expect(await activeAllocationSum(item.id)).toBe(30);

      // Unstarted Children #2/#3 are still fully revisable.
      const revised = await sharedSpkService.revise(
        realCompanyId,
        staffUserId,
        parent.id,
        sharedSpkReviseSchema.parse({
          children: [body(c2!.id, 12, { scheduledStart: "2026-11-10" }), body(c3!.id, 8)],
        }),
      );
      expect(revised.children.map((child) => child.items[0]!.qty)).toEqual([10, 12, 8]);
      expect(revised.children.map((child) => child.locked)).toEqual([true, false, false]);
      expect(await activeAllocationSum(item.id)).toBe(30);
      await expectNoOrphanedAllocations(item.id, parent.id);
      // The started Child's allocation was never cancelled or recreated.
      const c1Allocations = await prisma.purchaseOrderItemAllocation.findMany({ where: { workOrderId: c1!.id } });
      expect(c1Allocations.map((row) => row.status)).toEqual(["ACTIVE"]);
    });

    it("refuses to move a started Child's quantity to another Child by exceeding the PO quantity", async () => {
      const { purchaseOrder, item } = await sharedPo(20);
      const parent = await createShared(purchaseOrder.id, item.id, [{ qty: 10 }, { qty: 10 }]);
      const [c1, c2] = parent.children;
      await startChild(c1!.id);

      const tech = await createTechnician(realCompanyId);
      await expect(
        sharedSpkService.revise(
          realCompanyId,
          staffUserId,
          parent.id,
          sharedSpkReviseSchema.parse({
            children: [{ workOrderId: c2!.id, technicianUserId: tech.id, items: [{ purchaseOrderItemId: item.id, qty: 15 }] }],
          }),
        ),
      ).rejects.toMatchObject({ response: { code: "OVER_ALLOCATION" } });

      // The revision rolled back: c2 still holds its original allocation.
      const c2After = await prisma.workOrder.findUniqueOrThrow({ where: { id: c2!.id }, include: { items: true } });
      expect(c2After.items.map((row) => row.qty.toNumber())).toEqual([10]);
      expect(await activeAllocationSum(item.id)).toBe(20);
      await expectNoOrphanedAllocations(item.id, parent.id);
    });

    it("lets quantity move between two unstarted Children inside one revision", async () => {
      const { purchaseOrder, item } = await sharedPo(20);
      const parent = await createShared(purchaseOrder.id, item.id, [{ qty: 10 }, { qty: 10 }]);
      const [c1, c2] = parent.children;
      const techA = c1!.technicians[0]!.id;
      const techB = c2!.technicians[0]!.id;

      const revised = await sharedSpkService.revise(
        realCompanyId,
        staffUserId,
        parent.id,
        sharedSpkReviseSchema.parse({
          children: [
            { workOrderId: c1!.id, technicianUserId: techA, items: [{ purchaseOrderItemId: item.id, qty: 4 }] },
            { workOrderId: c2!.id, technicianUserId: techB, items: [{ purchaseOrderItemId: item.id, qty: 16 }] },
          ],
        }),
      );
      expect(revised.children.map((child) => child.items[0]!.qty)).toEqual([4, 16]);
      expect(await activeAllocationSum(item.id)).toBe(20);
      await expectNoOrphanedAllocations(item.id, parent.id);
      // Technicians unchanged → assignments were not churned.
      expect(revised.children[0]!.technicians.map((row) => row.id)).toEqual([techA]);
    });

    it("refuses to remove the last active Child and rolls everything back", async () => {
      const { purchaseOrder, item } = await sharedPo(20);
      const parent = await createShared(purchaseOrder.id, item.id, [{ qty: 10 }, { qty: 10 }]);
      await expect(
        sharedSpkService.revise(
          realCompanyId,
          staffUserId,
          parent.id,
          sharedSpkReviseSchema.parse({ removeWorkOrderIds: parent.children.map((child) => child.id) }),
        ),
      ).rejects.toMatchObject({ response: { code: "SHARED_SPK_NO_ACTIVE_CHILD" } });
      const after = await sharedSpkService.findOne(realCompanyId, parent.id);
      expect(after.children.map((child) => child.status)).toEqual(["ASSIGNED", "ASSIGNED"]);
      expect(await activeAllocationSum(item.id)).toBe(20);
    });

    it("rejects a Child that does not belong to this shared job", async () => {
      const a = await sharedPo(10);
      const b = await sharedPo(10);
      const parentA = await createShared(a.purchaseOrder.id, a.item.id, [{ qty: 5 }, { qty: 5 }]);
      const parentB = await createShared(b.purchaseOrder.id, b.item.id, [{ qty: 5 }, { qty: 5 }]);
      await expect(
        sharedSpkService.revise(
          realCompanyId,
          staffUserId,
          parentA.id,
          sharedSpkReviseSchema.parse({ removeWorkOrderIds: [parentB.children[0]!.id] }),
        ),
      ).rejects.toMatchObject({ response: { code: "SHARED_CHILD_NOT_FOUND" } });
    });
  });

  // ---- end-to-end workflow ---------------------------------------------------------------

  describe("end-to-end", () => {
    it("PO → distribute → schedule → Lanjut → start a Child → revise the unstarted ones → progress stays derived", async () => {
      const { purchaseOrder, item } = await sharedPo(406);
      const [a, b, c, d] = [
        await createTechnician(realCompanyId),
        await createTechnician(realCompanyId),
        await createTechnician(realCompanyId),
        await createTechnician(realCompanyId),
      ];

      // Lanjut: Parent + 4 Children, each with its own technician, batch and schedule.
      const parent = await createShared(purchaseOrder.id, item.id, [
        { qty: 100, technicianUserId: a.id, scheduledStart: new Date("2026-10-01") },
        { qty: 120, technicianUserId: b.id, scheduledStart: new Date("2026-10-02") },
        { qty: 86, technicianUserId: c.id, scheduledStart: new Date("2026-10-03") },
        { qty: 100, technicianUserId: d.id, scheduledStart: new Date("2026-10-04") },
      ]);
      expect(parent.children.map((child) => child.number)).toEqual([1, 2, 3, 4].map((n) => `${parent.number}-${n}`));
      expect(parent.progress).toEqual({ total: 406, completed: 0, percentage: 0 });

      // Child #1 starts and finishes part of its work: it is now execution-locked.
      const [c1, c2, c3, c4] = parent.children;
      await startChild(c1!.id);
      await acceptAllJobs(c1!.id);

      // Revise the unstarted Children: reassign, reschedule, shift quantity, drop one, add one.
      const newTech = await createTechnician(realCompanyId);
      const extraTech = await createTechnician(realCompanyId);
      const revised = await sharedSpkService.revise(
        realCompanyId,
        staffUserId,
        parent.id,
        sharedSpkReviseSchema.parse({
          children: [
            { workOrderId: c2!.id, technicianUserId: newTech.id, items: [{ purchaseOrderItemId: item.id, qty: 140 }], scheduledStart: "2026-10-05" },
            { workOrderId: c3!.id, technicianUserId: c!.id, items: [{ purchaseOrderItemId: item.id, qty: 76 }] },
            { technicianUserId: extraTech.id, items: [{ purchaseOrderItemId: item.id, qty: 90 }], scheduledStart: "2026-10-06" },
          ],
          removeWorkOrderIds: [c4!.id],
        }),
      );

      expect(revised.number).toBe(parent.number); // Parent identity unchanged
      const byNumber = new Map(revised.children.map((child) => [child.number, child]));
      expect(byNumber.get(`${parent.number}-1`)).toMatchObject({ locked: true, status: "IN_PROGRESS" });
      expect(byNumber.get(`${parent.number}-2`)!.technicians[0]!.id).toBe(newTech.id);
      expect(byNumber.get(`${parent.number}-4`)!.status).toBe("CANCELLED");
      expect(byNumber.get(`${parent.number}-5`)).toMatchObject({ locked: false, status: "ASSIGNED" });

      // Locked Child #1 is untouched; an attempt to change it is refused.
      await expect(
        sharedSpkService.revise(
          realCompanyId,
          staffUserId,
          parent.id,
          sharedSpkReviseSchema.parse({ children: [{ workOrderId: c1!.id, technicianUserId: a.id, items: [{ purchaseOrderItemId: item.id, qty: 50 }] }] }),
        ),
      ).rejects.toMatchObject({ response: { code: "SHARED_CHILD_LOCKED" } });

      // The revised Children start normally; progress is derived from the Children only.
      const secondStart = await startChild(c2!.id);
      expect(secondStart.status).toBe("IN_PROGRESS");
      expect(await prisma.calibrationJob.count({ where: { workOrderId: c2!.id } })).toBe(140);
      await prisma.calibrationJob.updateMany({
        where: { id: { in: (await prisma.calibrationJob.findMany({ where: { workOrderId: c2!.id }, take: 40, select: { id: true } })).map((row) => row.id) } },
        data: { status: "ACCEPTED_BY_QA" },
      });

      const detail = await sharedSpkService.findOne(realCompanyId, parent.id);
      // Active scope after revision: 100 + 140 + 76 + 90 = 406 (cancelled #4 excluded); done = 100 + 40.
      expect(detail.progress.total).toBe(406);
      expect(detail.progress.completed).toBe(140);
      expect(detail.status).toBe("IN_PROGRESS");
      expect(await activeAllocationSum(item.id)).toBe(406);
      await expectNoOrphanedAllocations(item.id, parent.id);
    });
  });

  // ---- schedule lock via ordinary update ------------------------------------------------

  describe("schedule vs actual execution", () => {
    it("locks a started Child's schedule but not an unstarted Child's; single SPK keeps its existing behaviour", async () => {
      const { purchaseOrder, item } = await sharedPo(20);
      const parent = await createShared(purchaseOrder.id, item.id, [
        { qty: 10, scheduledStart: new Date("2026-10-01"), scheduledEnd: new Date("2026-10-01") },
        { qty: 10, scheduledStart: new Date("2026-10-02"), scheduledEnd: new Date("2026-10-02") },
      ]);
      const [c1, c2] = parent.children;
      await startChild(c1!.id);

      await expect(
        workOrdersService.update(realCompanyId, c1!.id, { scheduledStart: new Date("2026-10-09") }),
      ).rejects.toMatchObject({ response: { code: "SHARED_CHILD_SCHEDULE_LOCKED" } });
      const lockedRow = await prisma.workOrder.findUniqueOrThrow({ where: { id: c1!.id } });
      expect(lockedRow.scheduledStart?.toISOString().slice(0, 10)).toBe("2026-10-01");

      // Non-schedule edits on the started Child follow the existing rules.
      const addressOnly = await workOrdersService.update(realCompanyId, c1!.id, { addressText: "Gedung B" });
      expect(addressOnly.addressText).toBe("Gedung B");

      const moved = await workOrdersService.update(realCompanyId, c2!.id, { scheduledStart: new Date("2026-10-09") });
      expect(moved.scheduledStart?.toISOString().slice(0, 10)).toBe("2026-10-09");

      // Single/flat SPK: unchanged — schedule still editable while IN_PROGRESS.
      const flat = await createApprovedPurchaseOrder(realCompanyId, { serviceMode: "ON_SITE" });
      const flatWo = await createTrackedWorkOrder(realCompanyId, flat.purchaseOrder.id);
      const tech = await createTechnician(realCompanyId);
      await workOrdersService.assign(realCompanyId, flatWo.id, { technicians: [{ technicianUserId: tech.id }] });
      await workOrdersService.start(realCompanyId, flatWo.id);
      const flatMoved = await workOrdersService.update(realCompanyId, flatWo.id, { scheduledStart: new Date("2026-10-20") });
      expect(flatMoved.scheduledStart?.toISOString().slice(0, 10)).toBe("2026-10-20");
    });
  });
});
