import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, prisma } from "@medcal/db";
import type { MembershipRole } from "@medcal/db";
import { CalibrationRequestsService } from "../calibration-requests/calibration-requests.service";
import { QuotationsService } from "../quotations/quotations.service";
import { PurchaseOrdersService } from "../purchase-orders/purchase-orders.service";
import { WorkOrdersService } from "../work-orders/work-orders.service";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { DevicesService } from "../devices/devices.service";
import { CalibrationJobsController } from "./calibration-jobs.controller";
import { CalibrationJobsService } from "./calibration-jobs.service";

// Only the Better Auth session boundary is mocked; hasPermission stays real,
// backed by the RolePermission cache primed in vitest.setup.ts.
const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
vi.mock("@medcal/auth", async () => {
  const actual = await vi.importActual<typeof import("@medcal/auth")>("@medcal/auth");
  return { ...actual, auth: { api: { getSession: getSessionMock } } };
});

const calibrationJobsService = new CalibrationJobsService();
const devicesService = new DevicesService();
const calibrationRequestsService = new CalibrationRequestsService();
const quotationsService = new QuotationsService();
const purchaseOrdersService = new PurchaseOrdersService();
const workOrdersService = new WorkOrdersService();

const realCompanyId = "PKM";
const staffUserId = "cj-staff-user";

const createdWorkOrderIds: string[] = [];
const createdQuotationIds: string[] = [];
const createdCalibrationRequestIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdCompanyIds: string[] = [];
const createdDeviceTypeIds: string[] = [];
const createdDeviceCategoryIds: string[] = [];
const createdTaxIds: string[] = [];
const createdUserIds: string[] = [];
const createdMembershipKeys: Array<{ userId: string; companyId: string }> = [];

async function cleanupSequences(companyId: string) {
  await prisma.documentNumberSequence.deleteMany({
    where: {
      companyId,
      documentType: {
        in: [
          "WORK_ORDER",
          "WORK_ORDER_SEND_TO_LAB",
          "PURCHASE_ORDER",
          "QUOTATION",
          "CALIBRATION_REQUEST",
        ],
      },
    },
  });
}

async function ensureNonPpnTax(companyId: string) {
  const existing = await prisma.tax.findUnique({
    where: { companyId_taxCode: { companyId, taxCode: "T0" } },
  });
  if (existing) return existing;
  const tax = await prisma.tax.create({
    data: { companyId, taxCode: "T0", taxRate: 0, isExclude: false, description: "Non PPN" },
  });
  createdTaxIds.push(tax.id);
  return tax;
}

async function createDeviceTypeId(): Promise<string> {
  const category = await prisma.deviceCategory.create({
    data: {
      code: `C${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      name: "CJ Test Category",
    },
  });
  createdDeviceCategoryIds.push(category.id);
  const deviceType = await prisma.deviceType.create({
    data: {
      categoryId: category.id,
      code: `T${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      name: "CJ Test Device Type",
    },
  });
  createdDeviceTypeIds.push(deviceType.id);
  return deviceType.id;
}

async function createTestCustomer(companyId: string) {
  const customer = await prisma.customer.create({
    data: {
      companyId,
      number: `CUS/CJ/${randomUUID().slice(0, 8)}`,
      name: `CJ Customer ${randomUUID().slice(0, 6)}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

async function makeMember(companyId: string, role: MembershipRole) {
  const user = await prisma.user.create({
    data: {
      email: `cj-${randomUUID().slice(0, 10)}@x.co`,
      name: `CJ ${role}`.slice(0, 50),
      status: "ACTIVE",
    },
  });
  createdUserIds.push(user.id);
  await prisma.userMembership.create({
    data: { userId: user.id, companyId, role, isDefault: false },
  });
  createdMembershipKeys.push({ userId: user.id, companyId });
  return user;
}

/** Build a WorkOrder that has reached IN_PROGRESS, fanning out its jobs. */
async function startedWorkOrderJobs(companyId: string, opts?: { qty?: number }) {
  await ensureNonPpnTax(companyId);
  const customer = await createTestCustomer(companyId);
  const deviceTypeId = await createDeviceTypeId();
  const request = await calibrationRequestsService.create(companyId, {
    customerId: customer.id,
    serviceMode: "SEND_TO_LAB",
    items: [{ deviceTypeId, deviceId: "DEV-1" }],
  });
  createdCalibrationRequestIds.push(request.id);
  await calibrationRequestsService.submit(companyId, request.id);
  await prisma.priceListItem.create({
    data: {
      companyId,
      deviceTypeId,
      unitPrice: new Prisma.Decimal(100_000),
      effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
    },
  });
  const quotation = await quotationsService.create(companyId, {
    requestId: request.id,
    taxCode: "T0",
  });
  createdQuotationIds.push(quotation.id);
  await quotationsService.send(companyId, quotation.id);
  await quotationsService.approve(companyId, quotation.id, staffUserId);
  const po = await purchaseOrdersService.create(companyId, {
    quotationId: quotation.id,
    customerPoNumber: `CPO-${randomUUID().slice(0, 8).toUpperCase()}`,
    customerPoDate: new Date("2026-08-15T00:00:00.000Z"),
  });
  await purchaseOrdersService.approve(companyId, po.id, staffUserId);
  const workOrder = await workOrdersService.create(companyId, { purchaseOrderId: po.id });
  createdWorkOrderIds.push(workOrder.id);

  if (opts?.qty && opts.qty !== 1) {
    await prisma.workOrderItem.update({
      where: { id: workOrder.items[0]!.id },
      data: { qty: new Prisma.Decimal(opts.qty) },
    });
  }

  const technician = await makeMember(companyId, "TECHNICIAN");
  await workOrdersService.assign(companyId, workOrder.id, {
    technicians: [{ technicianUserId: technician.id }],
  });
  await workOrdersService.start(companyId, workOrder.id);

  const jobs = await prisma.calibrationJob.findMany({
    where: { workOrderId: workOrder.id },
    orderBy: { unitOrdinal: "asc" },
  });
  return {
    workOrder,
    jobs,
    customerId: customer.id,
    deviceTypeId,
    requestItemId: workOrder.items[0]!.purchaseOrderItem.quotationItem.requestItem!.id,
  };
}

beforeAll(() => {
  process.env.COMPANY_ID = realCompanyId;
});

afterAll(async () => {
  if (createdWorkOrderIds.length > 0) {
    await prisma.workOrder.deleteMany({ where: { id: { in: createdWorkOrderIds } } });
  }
  if (createdQuotationIds.length > 0) {
    await prisma.purchaseOrder.deleteMany({ where: { quotationId: { in: createdQuotationIds } } });
    await prisma.quotationItem.deleteMany({ where: { quotationId: { in: createdQuotationIds } } });
    await prisma.quotation.deleteMany({ where: { id: { in: createdQuotationIds } } });
  }
  if (createdCalibrationRequestIds.length > 0) {
    await prisma.calibrationRequestItem.deleteMany({
      where: { requestId: { in: createdCalibrationRequestIds } },
    });
    await prisma.calibrationRequest.deleteMany({
      where: { id: { in: createdCalibrationRequestIds } },
    });
  }
  if (createdDeviceTypeIds.length > 0) {
    // Devices created by the device-assignment suite (jobs are already gone via
    // the WorkOrder cascade above) — must go before their DeviceType.
    await prisma.device.deleteMany({ where: { deviceTypeId: { in: createdDeviceTypeIds } } });
    await prisma.priceListItem.deleteMany({
      where: { deviceTypeId: { in: createdDeviceTypeIds } },
    });
    await prisma.deviceType.deleteMany({ where: { id: { in: createdDeviceTypeIds } } });
  }
  if (createdDeviceCategoryIds.length > 0) {
    await prisma.deviceCategory.deleteMany({ where: { id: { in: createdDeviceCategoryIds } } });
  }
  if (createdTaxIds.length > 0) {
    await prisma.tax.deleteMany({ where: { id: { in: createdTaxIds } } });
  }
  for (const key of createdMembershipKeys) {
    await prisma.userMembership.deleteMany({ where: key }).catch(() => undefined);
  }
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  for (const customerId of createdCustomerIds) {
    await prisma.customer.delete({ where: { id: customerId } }).catch(() => undefined);
  }
  await cleanupSequences(realCompanyId);
  for (const companyId of createdCompanyIds) {
    await cleanupSequences(companyId);
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  }
});

describe("CalibrationJobsService — AKD/AKL identity gate", () => {
  it("escalate moves NOT_REQUIRED → PENDING_REVIEW and records observed value + reason", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const job = jobs[0]!;
    expect(job.akdAklApprovalStatus).toBe("NOT_REQUIRED");

    const updated = await calibrationJobsService.escalateIdentity(realCompanyId, job.id, {
      technicianObservedAkdAkl: "",
      reason: "No AKL sticker on the unit",
    });

    expect(updated.akdAklApprovalStatus).toBe("PENDING_REVIEW");
    expect(updated.technicianObservedAkdAkl).toBe("");
    expect(updated.akdAklDecisionNote).toBe("No AKL sticker on the unit");
    expect(updated.akdAklApprovedByUserId).toBeNull();
  });

  it("does not touch sibling jobs when one unit is escalated", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId, { qty: 3 });
    await calibrationJobsService.escalateIdentity(realCompanyId, jobs[1]!.id, {});

    const after = await prisma.calibrationJob.findMany({
      where: { id: { in: jobs.map((j) => j.id) } },
      orderBy: { unitOrdinal: "asc" },
    });
    expect(after.map((j) => j.akdAklApprovalStatus)).toEqual([
      "NOT_REQUIRED",
      "PENDING_REVIEW",
      "NOT_REQUIRED",
    ]);
  });

  it("approve records APPROVED with actor + timestamp", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    await calibrationJobsService.escalateIdentity(realCompanyId, jobs[0]!.id, {});

    const before = Date.now();
    const decided = await calibrationJobsService.decideIdentity(
      realCompanyId,
      jobs[0]!.id,
      manager.id,
      { decision: "APPROVE" },
    );

    expect(decided.akdAklApprovalStatus).toBe("APPROVED");
    expect(decided.akdAklApprovedByUserId).toBe(manager.id);
    expect(decided.akdAklApprovedBy?.id).toBe(manager.id);
    expect(decided.akdAklApprovedAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("reject records REJECTED with the decision note", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    await calibrationJobsService.escalateIdentity(realCompanyId, jobs[0]!.id, {});

    const decided = await calibrationJobsService.decideIdentity(
      realCompanyId,
      jobs[0]!.id,
      manager.id,
      { decision: "REJECT", akdAklDecisionNote: "Customer must obtain an AKL first" },
    );

    expect(decided.akdAklApprovalStatus).toBe("REJECTED");
    expect(decided.akdAklDecisionNote).toBe("Customer must obtain an AKL first");
  });

  it("rejects an invalid transition (decide on a NOT_REQUIRED job)", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");

    await expect(
      calibrationJobsService.decideIdentity(realCompanyId, jobs[0]!.id, manager.id, {
        decision: "APPROVE",
      }),
    ).rejects.toMatchObject({ response: { code: "INVALID_AKD_AKL_TRANSITION" } });
  });

  it("allows REJECTED → PENDING_REVIEW re-escalation but not APPROVED → anything", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");

    await calibrationJobsService.escalateIdentity(realCompanyId, jobs[0]!.id, {});
    await calibrationJobsService.decideIdentity(realCompanyId, jobs[0]!.id, manager.id, {
      decision: "REJECT",
      akdAklDecisionNote: "no",
    });
    const reEscalated = await calibrationJobsService.escalateIdentity(
      realCompanyId,
      jobs[0]!.id,
      {},
    );
    expect(reEscalated.akdAklApprovalStatus).toBe("PENDING_REVIEW");

    await calibrationJobsService.decideIdentity(realCompanyId, jobs[0]!.id, manager.id, {
      decision: "APPROVE",
    });
    await expect(
      calibrationJobsService.escalateIdentity(realCompanyId, jobs[0]!.id, {}),
    ).rejects.toMatchObject({ response: { code: "INVALID_AKD_AKL_TRANSITION" } });
  });

  it("rejects the identity gate once the job status is past the bench", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: { status: "ACCEPTED_BY_QA" },
    });

    await expect(
      calibrationJobsService.escalateIdentity(realCompanyId, jobs[0]!.id, {}),
    ).rejects.toMatchObject({ response: { code: "CALIBRATION_JOB_IDENTITY_GATE_LOCKED" } });
  });

  it("company-scoping: cannot act on a job from another company", async () => {
    const otherCompanyId = `S${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Foreign CJ Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);
    const { jobs } = await startedWorkOrderJobs(otherCompanyId);

    await expect(
      calibrationJobsService.escalateIdentity(realCompanyId, jobs[0]!.id, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("CalibrationJobsService — physical device assignment", () => {
  it("assigns an existing device: deviceId set, DeviceType validated", async () => {
    const { jobs, customerId, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    const device = await devicesService.create(realCompanyId, {
      customerId,
      deviceTypeId,
      serialNumber: "SN-MATCH-1",
    });

    const result = await calibrationJobsService.assignDevice(realCompanyId, jobs[0]!.id, {
      deviceId: device.id,
    });

    expect(result.deviceTypeValidated).toBe(true);
    expect(result.job.deviceId).toBe(device.id);
    expect(result.job.device?.id).toBe(device.id);
  });

  it("rejects a device whose DeviceType does not match the job (hard error)", async () => {
    const { jobs, customerId } = await startedWorkOrderJobs(realCompanyId);
    const otherDeviceTypeId = await createDeviceTypeId();
    const device = await devicesService.create(realCompanyId, {
      customerId,
      deviceTypeId: otherDeviceTypeId,
    });

    await expect(
      calibrationJobsService.assignDevice(realCompanyId, jobs[0]!.id, { deviceId: device.id }),
    ).rejects.toMatchObject({ response: { code: "DEVICE_TYPE_MISMATCH" } });
  });

  it("rejects a device owned by a different customer", async () => {
    const { jobs, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    const otherCustomer = await createTestCustomer(realCompanyId);
    const device = await devicesService.create(realCompanyId, {
      customerId: otherCustomer.id,
      deviceTypeId,
    });

    await expect(
      calibrationJobsService.assignDevice(realCompanyId, jobs[0]!.id, { deviceId: device.id }),
    ).rejects.toMatchObject({ response: { code: "DEVICE_CUSTOMER_MISMATCH" } });
  });

  it("rejects assigning a device to a job that already has one", async () => {
    const { jobs, customerId, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    const first = await devicesService.create(realCompanyId, { customerId, deviceTypeId });
    const second = await devicesService.create(realCompanyId, { customerId, deviceTypeId });

    await calibrationJobsService.assignDevice(realCompanyId, jobs[0]!.id, { deviceId: first.id });

    await expect(
      calibrationJobsService.assignDevice(realCompanyId, jobs[0]!.id, { deviceId: second.id }),
    ).rejects.toMatchObject({ response: { code: "CALIBRATION_JOB_DEVICE_ALREADY_ASSIGNED" } });
  });

  it("rejects the same device on two jobs of one work order (@@unique backstop)", async () => {
    const { jobs, customerId, deviceTypeId } = await startedWorkOrderJobs(realCompanyId, {
      qty: 2,
    });
    const device = await devicesService.create(realCompanyId, { customerId, deviceTypeId });

    await calibrationJobsService.assignDevice(realCompanyId, jobs[0]!.id, { deviceId: device.id });

    await expect(
      calibrationJobsService.assignDevice(realCompanyId, jobs[1]!.id, { deviceId: device.id }),
    ).rejects.toMatchObject({ response: { code: "DEVICE_ALREADY_ASSIGNED_ON_WORK_ORDER" } });
  });

  it("cross-company: cannot assign a device id from another company", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const otherCompanyId = `S${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Foreign Dev Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);
    const foreignCustomer = await createTestCustomer(otherCompanyId);
    const foreignType = await createDeviceTypeId();
    const foreignDevice = await devicesService.create(otherCompanyId, {
      customerId: foreignCustomer.id,
      deviceTypeId: foreignType,
    });

    await expect(
      calibrationJobsService.assignDevice(realCompanyId, jobs[0]!.id, {
        deviceId: foreignDevice.id,
      }),
    ).rejects.toMatchObject({ response: { code: "DEVICE_NOT_FOUND" } });
  });

  it("cross-company: cannot assign to a job from another company", async () => {
    const otherCompanyId = `S${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Foreign Job Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);
    const { jobs } = await startedWorkOrderJobs(otherCompanyId);

    await expect(
      calibrationJobsService.assignDevice(realCompanyId, jobs[0]!.id, { deviceId: "whatever" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("register-and-assign: creates a Device row and binds it atomically", async () => {
    const { jobs, customerId, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: { technicianObservedSerial: "SN-OBSERVED-9" },
    });

    const result = await calibrationJobsService.registerDevice(realCompanyId, jobs[0]!.id, {
      brand: "Acme",
    });

    expect(result.deviceTypeValidated).toBe(true);
    expect(result.job.deviceId).toBeTruthy();
    const created = await prisma.device.findUniqueOrThrow({
      where: { id: result.job.deviceId! },
    });
    expect(created.customerId).toBe(customerId);
    expect(created.deviceTypeId).toBe(deviceTypeId);
    expect(created.brand).toBe("Acme");
    // serial prefilled from the job's technician-observed value
    expect(created.serialNumber).toBe("SN-OBSERVED-9");
  });

  it("register-and-assign: rejects a job that already has a device", async () => {
    const { jobs, customerId, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    const device = await devicesService.create(realCompanyId, { customerId, deviceTypeId });
    await calibrationJobsService.assignDevice(realCompanyId, jobs[0]!.id, { deviceId: device.id });

    await expect(
      calibrationJobsService.registerDevice(realCompanyId, jobs[0]!.id, {}),
    ).rejects.toMatchObject({ response: { code: "CALIBRATION_JOB_DEVICE_ALREADY_ASSIGNED" } });
  });

  it("device-candidates: scoped to the job's customer and device type", async () => {
    const { jobs, customerId, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    const match = await devicesService.create(realCompanyId, {
      customerId,
      deviceTypeId,
      serialNumber: "CAND-001",
    });
    const otherCustomer = await createTestCustomer(realCompanyId);
    await devicesService.create(realCompanyId, {
      customerId: otherCustomer.id,
      deviceTypeId,
      serialNumber: "CAND-002",
    });

    const candidates = await calibrationJobsService.findDeviceCandidates(
      realCompanyId,
      jobs[0]!.id,
      undefined,
    );
    const ids = candidates.map((d) => d.id);
    expect(ids).toContain(match.id);
    expect(candidates.every((d) => d.customerId === customerId)).toBe(true);
    expect(candidates.every((d) => d.deviceTypeId === deviceTypeId)).toBe(true);
  });
});

describe("CalibrationJobsService — list", () => {
  it("lists company jobs and filters by workOrderId + akdAklApprovalStatus", async () => {
    const { workOrder, jobs } = await startedWorkOrderJobs(realCompanyId, { qty: 2 });
    await calibrationJobsService.escalateIdentity(realCompanyId, jobs[0]!.id, {});

    const byWo = await calibrationJobsService.findAll(realCompanyId, {
      workOrderId: workOrder.id,
    });
    expect(byWo.total).toBe(2);
    expect(byWo.data.every((j) => j.workOrderId === workOrder.id)).toBe(true);

    const pending = await calibrationJobsService.findAll(realCompanyId, {
      workOrderId: workOrder.id,
      akdAklApprovalStatus: "PENDING_REVIEW",
    });
    expect(pending.total).toBe(1);
    expect(pending.data[0]!.id).toBe(jobs[0]!.id);
  });

  it("company-scopes the list", async () => {
    const otherCompanyId = `S${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Foreign List Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);
    const { workOrder } = await startedWorkOrderJobs(otherCompanyId);

    const res = await calibrationJobsService.findAll(realCompanyId, {
      workOrderId: workOrder.id,
    });
    expect(res.total).toBe(0);
  });
});

describe("CalibrationJobsController RBAC (guard chain)", () => {
  const guard = new CompanyRoleGuard(new Reflector());

  function contextFor(handlerName: keyof CalibrationJobsController) {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
      getHandler: () => CalibrationJobsController.prototype[handlerName],
      getClass: () => CalibrationJobsController,
    } as never;
  }

  it("blocks a TECHNICIAN from the approve/reject endpoint (403)", async () => {
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    getSessionMock.mockResolvedValueOnce({ user: { id: tech.id, email: "t@x.co" } });

    await expect(guard.canActivate(contextFor("decideIdentity"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("allows a TECHNICIAN_MANAGER through the approve/reject endpoint", async () => {
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    getSessionMock.mockResolvedValueOnce({ user: { id: manager.id, email: "m@x.co" } });

    await expect(guard.canActivate(contextFor("decideIdentity"))).resolves.toBe(true);
  });

  it("blocks a TECHNICIAN_MANAGER whose membership is in another company (403)", async () => {
    const otherCompanyId = `S${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Foreign Mgr Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);
    const foreignManager = await makeMember(otherCompanyId, "TECHNICIAN_MANAGER");
    getSessionMock.mockResolvedValueOnce({ user: { id: foreignManager.id, email: "fm@x.co" } });

    await expect(guard.canActivate(contextFor("decideIdentity"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("allows a TECHNICIAN through the list endpoint", async () => {
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    getSessionMock.mockResolvedValueOnce({ user: { id: tech.id, email: "tl@x.co" } });

    await expect(guard.canActivate(contextFor("list"))).resolves.toBe(true);
  });

  it("allows a TECHNICIAN to escalate", async () => {
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    getSessionMock.mockResolvedValueOnce({ user: { id: tech.id, email: "t2@x.co" } });

    await expect(guard.canActivate(contextFor("escalateIdentity"))).resolves.toBe(true);
  });

  it("allows a TECHNICIAN through the assign-device endpoint", async () => {
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    getSessionMock.mockResolvedValueOnce({ user: { id: tech.id, email: "t3@x.co" } });

    await expect(guard.canActivate(contextFor("assignDevice"))).resolves.toBe(true);
  });

  it("allows a TECHNICIAN through the register-device endpoint", async () => {
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    getSessionMock.mockResolvedValueOnce({ user: { id: tech.id, email: "t4@x.co" } });

    await expect(guard.canActivate(contextFor("registerDevice"))).resolves.toBe(true);
  });

  it("blocks a FINANCE user from the assign-device endpoint (403)", async () => {
    const finance = await makeMember(realCompanyId, "FINANCE");
    getSessionMock.mockResolvedValueOnce({ user: { id: finance.id, email: "f@x.co" } });

    await expect(guard.canActivate(contextFor("assignDevice"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
