import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@medcal/db";
import type { MembershipRole, PurchaseOrderStatus, WorkOrderStatus } from "@medcal/db";
import { dashboardSummaryResponseSchema } from "@medcal/shared";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
vi.mock("@medcal/auth", async () => {
  const actual = await vi.importActual<typeof import("@medcal/auth")>("@medcal/auth");
  return { ...actual, auth: { api: { getSession: getSessionMock } } };
});

const service = new DashboardService();
const controller = new DashboardController(service);
const companyIds: string[] = [];
const userIds: string[] = [];

const DAY = "2026-09-27";
const INSIDE_JAKARTA_DAY = new Date("2026-09-26T23:30:00.000Z");
const BEFORE_JAKARTA_DAY = new Date("2026-09-26T16:30:00.000Z");
const NEXT_JAKARTA_MIDNIGHT = new Date("2026-09-27T17:00:00.000Z");

afterAll(async () => {
  for (const companyId of companyIds) {
    await wipeCompany(companyId);
  }
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

describe("DashboardService metrics", () => {
  it("counts current-state cards with their exact status filters", async () => {
    const companyId = await createCompany();
    const customer = await createCustomer(companyId);
    const { quotation } = await commercialBase(companyId, customer.id);
    const activePo = await createPurchaseOrder(companyId, customer.id, quotation.id, "APPROVED");
    const donePo = await createPurchaseOrder(companyId, customer.id, quotation.id, "APPROVED");
    const cancelledPo = await createPurchaseOrder(companyId, customer.id, quotation.id, "APPROVED");

    await createWorkOrder(companyId, customer.id, quotation.id, activePo.id, "PLANNED");
    const assigned = await createWorkOrder(companyId, customer.id, quotation.id, donePo.id, "ASSIGNED");
    await createWorkOrder(companyId, customer.id, quotation.id, cancelledPo.id, "CANCELLED");
    await createWorkOrder(
      companyId,
      customer.id,
      quotation.id,
      (await createPurchaseOrder(companyId, customer.id, quotation.id, "APPROVED")).id,
      "DONE",
    );

    await createJob(companyId, assigned.id, "PENDING");
    await createJob(companyId, assigned.id, "IN_PROGRESS", 2);
    await createJob(companyId, assigned.id, "SUBMITTED", 3);
    await createJob(companyId, assigned.id, "REWORK", 4);
    await createJob(companyId, assigned.id, "ACCEPTED_BY_QA", 5);
    const cancelledWo = await prisma.workOrder.findFirstOrThrow({
      where: { companyId, status: "CANCELLED" },
    });
    await createJob(companyId, cancelledWo.id, "PENDING", 1);

    await prisma.quotation.update({ where: { id: quotation.id }, data: { status: "DRAFT" } });
    const sent = await commercialBase(companyId, customer.id);
    await prisma.quotation.update({ where: { id: sent.quotation.id }, data: { status: "SENT" } });
    const approved = await commercialBase(companyId, customer.id);
    await prisma.quotation.update({
      where: { id: approved.quotation.id },
      data: { status: "APPROVED" },
    });

    const summary = await service.managementSummary(companyId, {
      period: "custom",
      from: DAY,
      to: DAY,
    });

    expect(summary.currentState).toEqual({
      activeWorkOrders: 2,
      jobsAwaitingAction: 5,
      quotationsPendingApproval: 2,
    });
  });

  it("counts only APPROVED purchase orders by confirmedAt in Asia/Jakarta", async () => {
    const companyId = await createCompany();
    const customer = await createCustomer(companyId);
    const other = await createCustomer(companyId);
    const { quotation } = await commercialBase(companyId, customer.id);
    const otherQuote = await commercialBase(companyId, other.id);

    await createPurchaseOrder(companyId, customer.id, quotation.id, "APPROVED", INSIDE_JAKARTA_DAY);
    await createPurchaseOrder(companyId, customer.id, quotation.id, "APPROVED", BEFORE_JAKARTA_DAY);
    await createPurchaseOrder(companyId, customer.id, quotation.id, "APPROVED", NEXT_JAKARTA_MIDNIGHT);
    await createPurchaseOrder(companyId, customer.id, quotation.id, "DRAFT", INSIDE_JAKARTA_DAY);
    await createPurchaseOrder(companyId, customer.id, quotation.id, "CANCELLED", INSIDE_JAKARTA_DAY);
    await createPurchaseOrder(companyId, other.id, otherQuote.quotation.id, "APPROVED", INSIDE_JAKARTA_DAY);

    const summary = await service.managementSummary(companyId, {
      period: "custom",
      from: DAY,
      to: DAY,
      customerId: customer.id,
    });

    expect(summary.period.customerPO.total).toBe(1);
    expect(summary.period.range.timezone).toBe("Asia/Jakarta");
  });

  it("buckets Calibrated by the APPROVED review timestamp, not an earlier rejection or job.updatedAt", async () => {
    const companyId = await createCompany();
    const customer = await createCustomer(companyId);
    const reviewer = await createUser();
    const { quotation } = await commercialBase(companyId, customer.id);
    const po = await createPurchaseOrder(companyId, customer.id, quotation.id, "APPROVED");
    const workOrder = await createWorkOrder(companyId, customer.id, quotation.id, po.id, "IN_PROGRESS");
    const accepted = await createJob(companyId, workOrder.id, "ACCEPTED_BY_QA");
    const notCompleted = await createJob(companyId, workOrder.id, "SUBMITTED", 2);
    const rejectedAt = new Date("2026-01-14T02:30:00.000Z");
    const approvedAt = new Date("2026-01-15T02:30:00.000Z");

    await prisma.qualityReview.create({
      data: {
        companyId,
        calibrationJobId: accepted.id,
        reviewerUserId: reviewer.id,
        decision: "REJECT",
        status: "REJECTED",
        reviewedAt: rejectedAt,
      },
    });
    await prisma.qualityReview.create({
      data: {
        companyId,
        calibrationJobId: accepted.id,
        reviewerUserId: reviewer.id,
        decision: "APPROVE",
        status: "APPROVED",
        reviewedAt: approvedAt,
      },
    });
    await prisma.qualityReview.create({
      data: {
        companyId,
        calibrationJobId: notCompleted.id,
        reviewerUserId: reviewer.id,
        decision: "APPROVE",
        status: "APPROVED",
        reviewedAt: approvedAt,
      },
    });

    const inDay = await service.managementSummary(companyId, {
      period: "custom",
      from: "2026-01-15",
      to: "2026-01-15",
    });
    const previousDay = await service.managementSummary(companyId, {
      period: "custom",
      from: "2026-01-14",
      to: "2026-01-14",
    });

    expect(inDay.period.calibrated.total).toBe(1);
    expect(previousDay.period.calibrated.total).toBe(0);
    const hit = inDay.period.calibrated.trend.find((point) => point.count === 1);
    expect(hit?.label).toBe("09:00");
  });

  it("does not count ordered quantity until CalibrationJob rows exist", async () => {
    const companyId = await createCompany();
    const customer = await createCustomer(companyId);
    const { quotation } = await commercialBase(companyId, customer.id);
    const quotationItem = await prisma.quotationItem.create({
      data: {
        companyId,
        quotationId: quotation.id,
        description: "Three units",
        qty: 3,
        unitPrice: 1,
        lineTotal: 3,
      },
    });
    const po = await createPurchaseOrder(companyId, customer.id, quotation.id, "APPROVED", INSIDE_JAKARTA_DAY);
    const poItem = await prisma.purchaseOrderItem.create({
      data: {
        companyId,
        purchaseOrderId: po.id,
        quotationItemId: quotationItem.id,
        description: "Three units",
        qty: 3,
        unitPrice: 1,
        lineTotal: 3,
      },
    });
    const planned = await createWorkOrder(companyId, customer.id, quotation.id, po.id, "PLANNED");
    await prisma.workOrderItem.create({
      data: {
        companyId,
        workOrderId: planned.id,
        purchaseOrderItemId: poItem.id,
        description: "Three units",
        qty: 3,
      },
    });

    const beforeStart = await service.managementSummary(companyId, {
      period: "custom",
      from: DAY,
      to: DAY,
    });
    expect(beforeStart.period.volume.total).toBe(0);

    await prisma.calibrationJob.createMany({
      data: [1, 2, 3].map((unitOrdinal) => ({
        companyId,
        workOrderId: planned.id,
        purchaseOrderItemId: poItem.id,
        unitOrdinal,
        unitTotal: 3,
        status: "PENDING" as const,
        createdAt: INSIDE_JAKARTA_DAY,
      })),
    });

    const afterFanOut = await service.managementSummary(companyId, {
      period: "custom",
      from: DAY,
      to: DAY,
    });
    expect(afterFanOut.period.volume.total).toBe(3);
  });

  it("reports 17 approved POs and 409 physical units for one customer, and financial cards stay 0", async () => {
    const companyId = await createCompany();
    const customer = await createCustomer(companyId, "Large Hospital");
    const { quotation } = await commercialBase(companyId, customer.id);
    const qtys = Array.from({ length: 56 }, (_, index) => 7 + (index < 17 ? 1 : 0));
    expect(qtys.reduce((sum, qty) => sum + qty, 0)).toBe(409);

    const quotationItems = await prisma.$transaction(
      qtys.map((qty, index) =>
        prisma.quotationItem.create({
          data: {
            companyId,
            quotationId: quotation.id,
            description: `Line ${index + 1}`,
            qty,
            unitPrice: 1,
            lineTotal: qty,
          },
        }),
      ),
    );

    const purchaseOrders = [];
    for (let index = 0; index < 17; index += 1) {
      purchaseOrders.push(
        await createPurchaseOrder(
          companyId,
          customer.id,
          quotation.id,
          "APPROVED",
          INSIDE_JAKARTA_DAY,
          `PO-${index + 1}`,
        ),
      );
    }
    await createPurchaseOrder(companyId, customer.id, quotation.id, "DRAFT", INSIDE_JAKARTA_DAY, "DRAFT-EXTRA");
    await createPurchaseOrder(
      companyId,
      customer.id,
      quotation.id,
      "CANCELLED",
      INSIDE_JAKARTA_DAY,
      "CANCELLED-EXTRA",
    );

    const itemOwner = quotationItems.map((_, index) => (index < 48 ? Math.floor(index / 3) : 16));
    const purchaseOrderItems = await prisma.$transaction(
      quotationItems.map((item, index) =>
        prisma.purchaseOrderItem.create({
          data: {
            companyId,
            purchaseOrderId: purchaseOrders[itemOwner[index]!]!.id,
            quotationItemId: item.id,
            description: item.description,
            qty: qtys[index]!,
            unitPrice: 1,
            lineTotal: qtys[index]!,
          },
        }),
      ),
    );

    const workOrders = [];
    for (let index = 0; index < purchaseOrders.length; index += 1) {
      workOrders.push(
        await createWorkOrder(
          companyId,
          customer.id,
          quotation.id,
          purchaseOrders[index]!.id,
          "IN_PROGRESS",
          `WO-${index + 1}`,
        ),
      );
    }
    const workOrderByPo = new Map(workOrders.map((workOrder) => [workOrder.purchaseOrderId, workOrder]));

    await prisma.workOrderItem.createMany({
      data: purchaseOrderItems.map((item) => ({
        companyId,
        workOrderId: workOrderByPo.get(item.purchaseOrderId)!.id,
        purchaseOrderItemId: item.id,
        description: item.description,
        qty: item.qty,
      })),
    });

    const jobs = purchaseOrderItems.flatMap((item) => {
      const qty = Number(item.qty.toString());
      const workOrderId = workOrderByPo.get(item.purchaseOrderId)!.id;
      return Array.from({ length: qty }, (_, ordinal) => ({
        companyId,
        workOrderId,
        purchaseOrderItemId: item.id,
        unitOrdinal: ordinal + 1,
        unitTotal: qty,
        status: "PENDING" as const,
        createdAt: INSIDE_JAKARTA_DAY,
      }));
    });
    expect(jobs).toHaveLength(409);
    await prisma.calibrationJob.createMany({ data: jobs });

    await prisma.invoice.create({
      data: {
        companyId,
        customerId: customer.id,
        number: `INV/${randomUUID().slice(0, 8)}`,
        status: "ISSUED",
        subtotal: 999999,
        totalAmount: 999999,
      },
    });

    const summary = await service.managementSummary(companyId, {
      period: "custom",
      from: DAY,
      to: DAY,
      customerId: customer.id,
    });

    expect(summary.period.customerPO.total).toBe(17);
    expect(summary.period.volume.total).toBe(409);
    expect(summary.financial).toEqual({
      revenue: 0,
      outstandingInvoiceValue: 0,
      unavailableReason: expect.any(String),
    });
    expect(dashboardSummaryResponseSchema.parse(summary).financial.revenue).toBe(0);
  });

  it("rejects an unknown period and an unknown customer", async () => {
    await expect(
      controller.managementSummary("PKM", { period: "fortnight" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.managementSummary("PKM", { period: "custom" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const companyId = await createCompany();
    await expect(
      service.managementSummary(companyId, {
        period: "month",
        customerId: "missing-customer",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("GET /dashboard/management-summary authorization", () => {
  const guard = new CompanyRoleGuard(new Reflector());
  const guardCompanyId = process.env.COMPANY_ID ?? "PKM";

  function contextFor() {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
      getHandler: () => DashboardController.prototype.managementSummary,
      getClass: () => DashboardController,
    } as never;
  }

  it.each(["SUPERVISOR", "GENERAL_MANAGER", "ADMIN", "SUPERADMIN"] as const)(
    "allows %s",
    async (role) => {
      const user = await createUser(role);
      await prisma.userMembership.create({
        data: { userId: user.id, companyId: guardCompanyId, role },
      });
      getSessionMock.mockResolvedValueOnce({ user: { id: user.id, email: user.email } });
      await expect(guard.canActivate(contextFor())).resolves.toBe(true);
    },
  );

  it("rejects CUSTOMER", async () => {
    const user = await createUser("CUSTOMER");
    await prisma.userMembership.create({
      data: { userId: user.id, companyId: guardCompanyId, role: "CUSTOMER" },
    });
    getSessionMock.mockResolvedValueOnce({ user: { id: user.id, email: user.email } });
    await expect(guard.canActivate(contextFor())).rejects.toBeInstanceOf(ForbiddenException);
  });
});

async function createCompany(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const id = randomCompanyId();
    const existing = await prisma.company.findUnique({ where: { id }, select: { id: true } });
    if (existing) continue;
    await prisma.company.create({ data: { id, name: `Dash ${id}`, status: "ACTIVE" } });
    companyIds.push(id);
    return id;
  }
  throw new Error("Could not allocate a company id");
}

function randomCompanyId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from({ length: 3 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(
    "",
  );
}

async function createCustomer(companyId: string, name = "Dashboard Customer") {
  return prisma.customer.create({
    data: {
      companyId,
      number: `CUS/${randomUUID().slice(0, 8)}`,
      name,
    },
  });
}

async function createUser(role: MembershipRole = "ADMIN") {
  const user = await prisma.user.create({
    data: {
      email: `dash-${randomUUID().slice(0, 10)}@x.co`,
      name: role.slice(0, 50),
      status: "ACTIVE",
    },
  });
  userIds.push(user.id);
  return user;
}

async function commercialBase(companyId: string, customerId: string) {
  const request = await prisma.calibrationRequest.create({
    data: {
      companyId,
      customerId,
      number: `REQ/${randomUUID().slice(0, 8)}`,
      serviceMode: "ON_SITE",
    },
  });
  const quotation = await prisma.quotation.create({
    data: {
      companyId,
      customerId,
      requestId: request.id,
      number: `QUO/${randomUUID().slice(0, 8)}`,
      subtotal: 0,
      taxCode: "T0",
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 0,
    },
  });
  return { request, quotation };
}

async function createPurchaseOrder(
  companyId: string,
  customerId: string,
  quotationId: string,
  status: PurchaseOrderStatus,
  confirmedAt: Date | null = null,
  customerPoNumber = randomUUID().slice(0, 12),
) {
  return prisma.purchaseOrder.create({
    data: {
      companyId,
      customerId,
      quotationId,
      number: `PO/${randomUUID().slice(0, 8)}`,
      customerPoNumber,
      customerPoDate: new Date("2026-06-01T00:00:00.000Z"),
      status,
      confirmedAt,
      subtotal: 0,
      taxCode: "T0",
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 0,
    },
  });
}

async function createWorkOrder(
  companyId: string,
  customerId: string,
  quotationId: string,
  purchaseOrderId: string,
  status: WorkOrderStatus,
  number = `WO/${randomUUID().slice(0, 8)}`,
) {
  return prisma.workOrder.create({
    data: {
      companyId,
      customerId,
      quotationId,
      purchaseOrderId,
      number,
      serviceMode: "ON_SITE",
      status,
    },
  });
}

async function createJob(
  companyId: string,
  workOrderId: string,
  status: "PENDING" | "IN_PROGRESS" | "SUBMITTED" | "REWORK" | "ACCEPTED_BY_QA",
  unitOrdinal = 1,
) {
  return prisma.calibrationJob.create({
    data: {
      companyId,
      workOrderId,
      unitOrdinal,
      unitTotal: unitOrdinal,
      status,
      createdAt: INSIDE_JAKARTA_DAY,
    },
  });
}

async function wipeCompany(companyId: string) {
  await prisma.qualityReview.deleteMany({ where: { companyId } });
  await prisma.calibrationJob.deleteMany({ where: { companyId } });
  await prisma.workOrderItem.deleteMany({ where: { companyId } });
  await prisma.workOrder.deleteMany({ where: { companyId } });
  await prisma.purchaseOrderItem.deleteMany({ where: { companyId } });
  await prisma.purchaseOrder.deleteMany({ where: { companyId } });
  await prisma.quotationItem.deleteMany({ where: { companyId } });
  await prisma.quotation.deleteMany({ where: { companyId } });
  await prisma.calibrationRequestItem.deleteMany({ where: { companyId } });
  await prisma.calibrationRequest.deleteMany({ where: { companyId } });
  await prisma.invoice.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
}
