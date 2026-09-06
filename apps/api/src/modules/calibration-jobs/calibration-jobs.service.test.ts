import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from "@nestjs/common";
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
import { identityCorrectionFileOwnerPolicy } from "./identity-correction-file-owner-policy";

const UNAVAILABLE_SIGNATURES = {
  TECHNICIAN: { status: "UNAVAILABLE" as const, unavailableReason: "n/a in test" },
  CUSTOMER: { status: "UNAVAILABLE" as const, unavailableReason: "n/a in test" },
};

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
          "IDENTITY_CORRECTION_BA",
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
async function startedWorkOrderJobs(
  companyId: string,
  opts?: {
    qty?: number;
    serviceMode?: "SEND_TO_LAB" | "ON_SITE";
    /** Runs after WorkOrder creation, before technician assignment + start (e.g. to set up equipment). */
    beforeStart?: (ctx: { workOrderId: string; deviceTypeId: string }) => Promise<void>;
  },
) {
  await ensureNonPpnTax(companyId);
  const customer = await createTestCustomer(companyId);
  const deviceTypeId = await createDeviceTypeId();
  const request = await calibrationRequestsService.create(companyId, {
    customerId: customer.id,
    serviceMode: opts?.serviceMode ?? "SEND_TO_LAB",
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

  if (opts?.beforeStart) {
    await opts.beforeStart({ workOrderId: workOrder.id, deviceTypeId });
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

describe("CalibrationJobsService — start (Mulai Kalibrasi)", () => {
  it("moves a PENDING job to IN_PROGRESS and stamps startedAt", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const job = jobs[0]!;
    expect(job.status).toBe("PENDING");
    expect(job.startedAt).toBeNull();

    const before = Date.now();
    const started = await calibrationJobsService.start(realCompanyId, job.id);

    expect(started.status).toBe("IN_PROGRESS");
    expect(started.startedAt).not.toBeNull();
    expect(started.startedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("does not touch sibling jobs", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId, { qty: 3 });
    await calibrationJobsService.start(realCompanyId, jobs[1]!.id);

    const after = await prisma.calibrationJob.findMany({
      where: { id: { in: jobs.map((j) => j.id) } },
      orderBy: { unitOrdinal: "asc" },
    });
    expect(after.map((j) => j.status)).toEqual(["PENDING", "IN_PROGRESS", "PENDING"]);
    expect(after.map((j) => j.startedAt === null)).toEqual([true, false, true]);
  });

  it("rejects starting an already-started job with CALIBRATION_JOB_ALREADY_STARTED", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    await calibrationJobsService.start(realCompanyId, jobs[0]!.id);

    await expect(calibrationJobsService.start(realCompanyId, jobs[0]!.id)).rejects.toMatchObject({
      response: { code: "CALIBRATION_JOB_ALREADY_STARTED" },
    });
  });

  it("rejects starting a job that has advanced past PENDING", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: { status: "SUBMITTED" },
    });

    await expect(calibrationJobsService.start(realCompanyId, jobs[0]!.id)).rejects.toMatchObject({
      response: { code: "CALIBRATION_JOB_ALREADY_STARTED" },
    });
  });

  it("unblocks reference-equipment recording (CALIBRATION_JOB_NOT_STARTED gate)", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId, { serviceMode: "ON_SITE" });

    await expect(
      calibrationJobsService.replaceReferenceEquipmentUsed(
        realCompanyId,
        jobs[0]!.id,
        staffUserId,
        "TECHNICIAN",
        { items: [] },
      ),
    ).rejects.toMatchObject({ response: { code: "CALIBRATION_JOB_NOT_STARTED" } });

    await calibrationJobsService.start(realCompanyId, jobs[0]!.id);

    // Empty set is now accepted (job has started, nothing to validate).
    await expect(
      calibrationJobsService.replaceReferenceEquipmentUsed(
        realCompanyId,
        jobs[0]!.id,
        staffUserId,
        "TECHNICIAN",
        { items: [] },
      ),
    ).resolves.toEqual([]);
  });

  it("company-scoping: cannot start a job from another company", async () => {
    const otherCompanyId = `S${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Foreign Start Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);
    const { jobs } = await startedWorkOrderJobs(otherCompanyId);

    await expect(calibrationJobsService.start(realCompanyId, jobs[0]!.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("CalibrationJobsService — Identity Correction (device identity)", () => {
  it("submit creates a BA + one signature per role atomically (first-time resolution)", async () => {
    const { jobs, customerId, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    const device = await devicesService.create(realCompanyId, {
      customerId,
      deviceTypeId,
      serialNumber: "SN-BAI-1",
    });

    const result = await calibrationJobsService.submitIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      tech.id,
      {
        reason: "On-site identification",
        newDeviceId: device.id,
        signatures: UNAVAILABLE_SIGNATURES,
      },
    );

    expect(result.deviceTypeValidated).toBe(true);
    expect(result.correction.number).toMatch(/^BAI\/\d{4}\//);
    expect(result.correction.status).toBe("PENDING_REVIEW");
    expect(result.correction.signatures).toHaveLength(2);
    expect(result.correction.signatures.map((s) => s.signerRole).sort()).toEqual([
      "CUSTOMER",
      "TECHNICIAN",
    ]);
    // Not written through to the job until approval.
    const job = await calibrationJobsService.findOne(realCompanyId, jobs[0]!.id);
    expect(job.deviceId).toBeNull();
  });

  it("rejects a submit that changes nothing", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");

    await expect(
      calibrationJobsService.submitIdentityCorrection(realCompanyId, jobs[0]!.id, tech.id, {
        reason: "x",
        newSerial: null,
        signatures: UNAVAILABLE_SIGNATURES,
      }),
    ).rejects.toMatchObject({ response: { code: "IDENTITY_CORRECTION_NO_CHANGE" } });
  });

  it("rejects a submit when the identity gate is locked", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: { status: "ACCEPTED_BY_QA" },
    });

    await expect(
      calibrationJobsService.submitIdentityCorrection(realCompanyId, jobs[0]!.id, tech.id, {
        reason: "x",
        newSerial: "SN-NEW",
        signatures: UNAVAILABLE_SIGNATURES,
      }),
    ).rejects.toMatchObject({ response: { code: "CALIBRATION_JOB_IDENTITY_GATE_LOCKED" } });
  });

  it("rejects a second pending BA for the same job", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    await calibrationJobsService.submitIdentityCorrection(realCompanyId, jobs[0]!.id, tech.id, {
      reason: "first",
      newSerial: "SN-A",
      signatures: UNAVAILABLE_SIGNATURES,
    });

    await expect(
      calibrationJobsService.submitIdentityCorrection(realCompanyId, jobs[0]!.id, tech.id, {
        reason: "second",
        newSerial: "SN-B",
        signatures: UNAVAILABLE_SIGNATURES,
      }),
    ).rejects.toMatchObject({ response: { code: "IDENTITY_CORRECTION_ALREADY_PENDING" } });
  });

  it("rejects a device whose DeviceType does not match the job", async () => {
    const { jobs, customerId } = await startedWorkOrderJobs(realCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    const otherDeviceTypeId = await createDeviceTypeId();
    const device = await devicesService.create(realCompanyId, {
      customerId,
      deviceTypeId: otherDeviceTypeId,
    });

    await expect(
      calibrationJobsService.submitIdentityCorrection(realCompanyId, jobs[0]!.id, tech.id, {
        reason: "x",
        newDeviceId: device.id,
        signatures: UNAVAILABLE_SIGNATURES,
      }),
    ).rejects.toMatchObject({ response: { code: "DEVICE_TYPE_MISMATCH" } });
  });

  it("rejects a device owned by a different customer", async () => {
    const { jobs, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    const otherCustomer = await createTestCustomer(realCompanyId);
    const device = await devicesService.create(realCompanyId, {
      customerId: otherCustomer.id,
      deviceTypeId,
    });

    await expect(
      calibrationJobsService.submitIdentityCorrection(realCompanyId, jobs[0]!.id, tech.id, {
        reason: "x",
        newDeviceId: device.id,
        signatures: UNAVAILABLE_SIGNATURES,
      }),
    ).rejects.toMatchObject({ response: { code: "DEVICE_CUSTOMER_MISMATCH" } });
  });

  it("approve binds the device and writes serial + AKD/AKL through to the job", async () => {
    const { jobs, customerId, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    const device = await devicesService.create(realCompanyId, { customerId, deviceTypeId });

    const { correction } = await calibrationJobsService.submitIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      tech.id,
      {
        reason: "full identity",
        newDeviceId: device.id,
        newSerial: "SN-OBS-9",
        newAkdAkl: "AKL 12345",
        signatures: UNAVAILABLE_SIGNATURES,
      },
    );

    const result = await calibrationJobsService.decideIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      correction.id,
      manager.id,
      { decision: "APPROVE" },
    );

    expect(result.correction.status).toBe("APPROVED");
    expect(result.correction.decidedByUserId).toBe(manager.id);
    expect(result.job.deviceId).toBe(device.id);
    expect(result.job.technicianObservedSerial).toBe("SN-OBS-9");
    expect(result.job.technicianObservedAkdAkl).toBe("AKL 12345");
  });

  it("approve reopens the AKD/AKL gate when the corrected value changes a previously-APPROVED gate", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: {
        akdAklApprovalStatus: "APPROVED",
        akdAklApprovedByUserId: manager.id,
        akdAklApprovedAt: new Date(),
        technicianObservedAkdAkl: "OLD-AKL",
      },
    });

    const { correction } = await calibrationJobsService.submitIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      tech.id,
      { reason: "wrong NIE", newAkdAkl: "NEW-AKL", signatures: UNAVAILABLE_SIGNATURES },
    );
    const result = await calibrationJobsService.decideIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      correction.id,
      manager.id,
      { decision: "APPROVE" },
    );

    expect(result.correction.akdAklGateReopened).toBe(true);
    expect(result.job.akdAklApprovalStatus).toBe("PENDING_REVIEW");
    expect(result.job.akdAklApprovedByUserId).toBeNull();
    expect(result.job.technicianObservedAkdAkl).toBe("NEW-AKL");
  });

  it("approve does NOT reopen the gate when AKD/AKL is not part of the correction", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: {
        akdAklApprovalStatus: "APPROVED",
        akdAklApprovedByUserId: manager.id,
        akdAklApprovedAt: new Date(),
      },
    });

    const { correction } = await calibrationJobsService.submitIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      tech.id,
      { reason: "serial only", newSerial: "SN-ONLY", signatures: UNAVAILABLE_SIGNATURES },
    );
    const result = await calibrationJobsService.decideIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      correction.id,
      manager.id,
      { decision: "APPROVE" },
    );

    expect(result.correction.akdAklGateReopened).toBe(false);
    expect(result.job.akdAklApprovalStatus).toBe("APPROVED");
  });

  it("approve opens the gate from NOT_REQUIRED when the corrected value mismatches the customer declaration", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: { customerDeclaredAkdAkl: "AKL-DECLARED" },
    });

    const { correction } = await calibrationJobsService.submitIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      tech.id,
      { reason: "first NIE", newAkdAkl: "AKL-OBSERVED", signatures: UNAVAILABLE_SIGNATURES },
    );
    const result = await calibrationJobsService.decideIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      correction.id,
      manager.id,
      { decision: "APPROVE" },
    );

    expect(result.correction.akdAklGateReopened).toBe(true);
    expect(result.job.akdAklApprovalStatus).toBe("PENDING_REVIEW");
    expect(result.job.technicianObservedAkdAkl).toBe("AKL-OBSERVED");
  });

  it("approve opens the gate (Q2) — job starts NOT_REQUIRED, correction sets observed ≠ declared", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: { customerDeclaredAkdAkl: "AKL-2022-02-BM" },
    });
    expect(jobs[0]!.akdAklApprovalStatus).toBe("NOT_REQUIRED");

    const { correction } = await calibrationJobsService.submitIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      tech.id,
      { reason: "label reads different NIE", newAkdAkl: "AKL91849201", signatures: UNAVAILABLE_SIGNATURES },
    );
    const result = await calibrationJobsService.decideIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      correction.id,
      manager.id,
      { decision: "APPROVE" },
    );

    expect(result.job.akdAklApprovalStatus).toBe("PENDING_REVIEW");
    expect(result.job.technicianObservedAkdAkl).toBe("AKL91849201");
    expect(result.job.akdAklApprovedByUserId).toBeNull();
    expect(result.correction.akdAklGateReopened).toBe(true);
  });

  it("approve does NOT open the gate when the corrected value equals the customer declaration", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: { customerDeclaredAkdAkl: "AKL-MATCHES" },
    });

    const { correction } = await calibrationJobsService.submitIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      tech.id,
      { reason: "confirming declared NIE", newAkdAkl: "AKL-MATCHES", signatures: UNAVAILABLE_SIGNATURES },
    );
    const result = await calibrationJobsService.decideIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      correction.id,
      manager.id,
      { decision: "APPROVE" },
    );

    expect(result.correction.akdAklGateReopened).toBe(false);
    expect(result.job.akdAklApprovalStatus).toBe("NOT_REQUIRED");
    expect(result.job.technicianObservedAkdAkl).toBe("AKL-MATCHES");
  });

  it("approve unwinds a PENDING_REVIEW gate to NOT_REQUIRED when a later correction resolves the mismatch", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: {
        akdAklApprovalStatus: "PENDING_REVIEW",
        customerDeclaredAkdAkl: "AKL-DECLARED",
        technicianObservedAkdAkl: "AKL-WRONG",
      },
    });

    const { correction } = await calibrationJobsService.submitIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      tech.id,
      { reason: "re-read label; matches declaration", newAkdAkl: "AKL-DECLARED", signatures: UNAVAILABLE_SIGNATURES },
    );
    const result = await calibrationJobsService.decideIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      correction.id,
      manager.id,
      { decision: "APPROVE" },
    );

    expect(result.correction.akdAklGateReopened).toBe(false);
    expect(result.job.akdAklApprovalStatus).toBe("NOT_REQUIRED");
    expect(result.job.technicianObservedAkdAkl).toBe("AKL-DECLARED");
  });

  it("rejects approve when a SIGNED signature has no uploaded image", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");

    const { correction } = await calibrationJobsService.submitIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      tech.id,
      {
        reason: "signed but no image",
        newSerial: "SN-SIGNED",
        signatures: {
          TECHNICIAN: { status: "SIGNED", signerName: "Tech A" },
          CUSTOMER: { status: "SIGNED", signerName: "Cust B" },
        },
      },
    );

    await expect(
      calibrationJobsService.decideIdentityCorrection(
        realCompanyId,
        jobs[0]!.id,
        correction.id,
        manager.id,
        { decision: "APPROVE" },
      ),
    ).rejects.toMatchObject({
      response: { code: "IDENTITY_CORRECTION_SIGNATURE_IMAGE_MISSING" },
    });
  });

  it("approves once the BA sheet's photo is uploaded — one photo covers both signed signers", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");

    const { correction } = await calibrationJobsService.submitIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      tech.id,
      {
        reason: "signed with photo",
        newSerial: "SN-SIGNED-PHOTO",
        signatures: {
          TECHNICIAN: { status: "SIGNED", signerName: "Tech A" },
          CUSTOMER: { status: "SIGNED", signerName: "Cust B" },
        },
      },
    );

    // One photo, owned by the correction — not by either signature.
    await prisma.fileObject.create({
      data: {
        companyId: realCompanyId,
        ownerType: "IDENTITY_CORRECTION",
        ownerId: correction.id,
        storageKey: `test/${randomUUID()}`,
        mimeType: "image/png",
      },
    });

    const result = await calibrationJobsService.decideIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      correction.id,
      manager.id,
      { decision: "APPROVE" },
    );

    expect(result.correction.status).toBe("APPROVED");
  });

  it("reject makes no writes to the job and keeps the BA number", async () => {
    const { jobs, customerId, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    const device = await devicesService.create(realCompanyId, { customerId, deviceTypeId });

    const { correction } = await calibrationJobsService.submitIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      tech.id,
      { reason: "not sure", newDeviceId: device.id, signatures: UNAVAILABLE_SIGNATURES },
    );

    const result = await calibrationJobsService.decideIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      correction.id,
      manager.id,
      { decision: "REJECT", decisionNote: "identity unconfirmed" },
    );

    expect(result.correction.status).toBe("REJECTED");
    expect(result.correction.number).toBe(correction.number);
    expect(result.job.deviceId).toBeNull();
  });

  it("rejects deciding an already-decided BA", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    const { correction } = await calibrationJobsService.submitIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      tech.id,
      { reason: "x", newSerial: "SN-Z", signatures: UNAVAILABLE_SIGNATURES },
    );
    await calibrationJobsService.decideIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      correction.id,
      manager.id,
      { decision: "REJECT", decisionNote: "no" },
    );

    await expect(
      calibrationJobsService.decideIdentityCorrection(
        realCompanyId,
        jobs[0]!.id,
        correction.id,
        manager.id,
        { decision: "APPROVE" },
      ),
    ).rejects.toMatchObject({ response: { code: "IDENTITY_CORRECTION_ALREADY_DECIDED" } });
  });

  it("company-scoping: cannot submit against a job from another company", async () => {
    const otherCompanyId = `S${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Foreign IC Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);
    const { jobs } = await startedWorkOrderJobs(otherCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");

    await expect(
      calibrationJobsService.submitIdentityCorrection(realCompanyId, jobs[0]!.id, tech.id, {
        reason: "x",
        newSerial: "SN",
        signatures: UNAVAILABLE_SIGNATURES,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("the removed assign-device path throws a typed 410", () => {
    expect(() => calibrationJobsService.assignDeviceRemoved()).toThrow(GoneException);
    try {
      calibrationJobsService.assignDeviceRemoved();
    } catch (err) {
      expect(err).toMatchObject({ response: { code: "ASSIGN_DEVICE_ENDPOINT_REMOVED" } });
    }
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

describe("CalibrationJobsService — Reference Equipment Used", () => {
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
    overrides: { isActive?: boolean } = {},
  ) {
    const unit = await prisma.equipment.create({
      data: {
        companyId: realCompanyId,
        equipmentTypeId,
        code: `EQU-${randomUUID().slice(0, 8).toUpperCase()}`,
        brand: "Fluke Biomedical",
        model: "ESA620",
        serialNumber: randomUUID().slice(0, 8),
        isActive: overrides.isActive ?? true,
      },
    });
    createdEquipmentIds.push(unit.id);
    return unit;
  }

  async function createCalibrationRecord(
    equipmentId: string,
    overrides: {
      status?: "DRAFT" | "CONFIRMED";
      acceptedForUse?: boolean;
      validFrom?: Date;
      validUntil?: Date;
      calibrationDate?: Date;
    } = {},
  ) {
    return prisma.equipmentCalibrationRecord.create({
      data: {
        companyId: realCompanyId,
        equipmentId,
        calibrationDate: overrides.calibrationDate ?? new Date("2026-01-01T00:00:00.000Z"),
        validFrom: overrides.validFrom ?? new Date("2026-01-01T00:00:00.000Z"),
        validUntil: overrides.validUntil ?? new Date("2027-01-01T00:00:00.000Z"),
        status: overrides.status ?? "CONFIRMED",
        acceptedForUse: overrides.acceptedForUse ?? true,
      },
    });
  }

  async function requireEquipmentType(deviceTypeId: string, equipmentTypeId: string) {
    const requirement = await prisma.deviceTypeEquipmentRequirement.create({
      data: { deviceTypeId, equipmentTypeId, sortOrder: 10 },
    });
    createdRequirementIds.push(requirement.id);
    return requirement;
  }

  /** ON_SITE job whose WorkOrder already carries the given confirmed Equipment units, job.startedAt set. */
  async function onSiteJobWithEquipmentUnits(
    unitSpecs: Array<{
      calibrationOverrides?: Parameters<typeof createCalibrationRecord>[1];
      skipCalibrationRecord?: boolean;
    }>,
    options?: { qty?: number },
  ) {
    const equipmentType = await createEquipmentType("Electrical Safety Analyzer");
    const units = [];
    for (const spec of unitSpecs) {
      const unit = await createEquipmentUnit(equipmentType.id);
      if (!spec.skipCalibrationRecord) {
        await createCalibrationRecord(unit.id, spec.calibrationOverrides);
      }
      units.push(unit);
    }

    const { workOrder, jobs } = await startedWorkOrderJobs(realCompanyId, {
      qty: options?.qty,
      serviceMode: "ON_SITE",
      beforeStart: async ({ workOrderId, deviceTypeId }) => {
        await requireEquipmentType(deviceTypeId, equipmentType.id);
        await workOrdersService.replaceEquipment(realCompanyId, workOrderId, {
          equipment: units.map((unit) => ({
            equipmentId: unit.id,
            equipmentTypeId: equipmentType.id,
          })),
        });
        await workOrdersService.confirmEquipment(realCompanyId, workOrderId);
      },
    });

    await prisma.calibrationJob.updateMany({
      where: { id: { in: jobs.map((job) => job.id) } },
      data: { startedAt: new Date() },
    });
    const startedJobs = await prisma.calibrationJob.findMany({
      where: { id: { in: jobs.map((job) => job.id) } },
      orderBy: { unitOrdinal: "asc" },
    });

    return { workOrder, jobs: startedJobs, equipmentType, units };
  }

  async function onSiteJobWithConfirmedEquipment(
    calibrationOverrides?: Parameters<typeof createCalibrationRecord>[1],
  ) {
    const { workOrder, jobs, equipmentType, units } = await onSiteJobWithEquipmentUnits([
      { calibrationOverrides },
    ]);
    return { workOrder, jobs, equipmentType, unit: units[0]! };
  }

  afterAll(async () => {
    await prisma.jobReferenceEquipmentUsed.deleteMany({
      where: { equipmentId: { in: createdEquipmentIds } },
    });
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

  it("replaces the full set with valid, confirmed equipment", async () => {
    const { jobs, unit } = await onSiteJobWithConfirmedEquipment();

    const result = await calibrationJobsService.replaceReferenceEquipmentUsed(
      realCompanyId,
      jobs[0]!.id,
      staffUserId,
      "TECHNICIAN",
      { items: [{ equipmentId: unit.id }] },
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.equipment.id).toBe(unit.id);
    expect(result[0]!.validityOverridden).toBe(false);
    expect(result[0]!.equipmentCalibrationRecordId).not.toBeNull();

    const refetched = await calibrationJobsService.listReferenceEquipmentUsed(
      realCompanyId,
      jobs[0]!.id,
    );
    expect(refetched).toHaveLength(1);
  });

  it("rejects equipment not confirmed on the job's WorkOrder", async () => {
    const { jobs } = await onSiteJobWithConfirmedEquipment();
    const strangerType = await createEquipmentType("Unrelated Type");
    const stranger = await createEquipmentUnit(strangerType.id);
    await createCalibrationRecord(stranger.id);

    await expect(
      calibrationJobsService.replaceReferenceEquipmentUsed(
        realCompanyId,
        jobs[0]!.id,
        staffUserId,
        "TECHNICIAN",
        { items: [{ equipmentId: stranger.id }] },
      ),
    ).rejects.toMatchObject({ response: { code: "EQUIPMENT_NOT_CONFIRMED_ON_WORK_ORDER" } });
  });

  it("rejects an equipment unit deactivated after being confirmed on the WorkOrder", async () => {
    const { jobs, unit } = await onSiteJobWithConfirmedEquipment();
    await prisma.equipment.update({ where: { id: unit.id }, data: { isActive: false } });

    await expect(
      calibrationJobsService.replaceReferenceEquipmentUsed(
        realCompanyId,
        jobs[0]!.id,
        staffUserId,
        "TECHNICIAN",
        { items: [{ equipmentId: unit.id }] },
      ),
    ).rejects.toMatchObject({ response: { code: "EQUIPMENT_INACTIVE" } });
  });

  it("rejects an equipment type no longer required for the job's device type", async () => {
    const { jobs, unit, equipmentType } = await onSiteJobWithConfirmedEquipment();
    // Simulate master data changing after the WorkOrder's equipment was confirmed.
    await prisma.deviceTypeEquipmentRequirement.deleteMany({
      where: { equipmentTypeId: equipmentType.id },
    });

    await expect(
      calibrationJobsService.replaceReferenceEquipmentUsed(
        realCompanyId,
        jobs[0]!.id,
        staffUserId,
        "TECHNICIAN",
        { items: [{ equipmentId: unit.id }] },
      ),
    ).rejects.toMatchObject({ response: { code: "EQUIPMENT_TYPE_NOT_REQUIRED_FOR_DEVICE" } });
  });

  it.each([
    ["EXPIRED", { validUntil: new Date("2020-01-01T00:00:00.000Z") }, false],
    ["NOT_ACCEPTED_FOR_USE", { acceptedForUse: false }, false],
    ["NO_RECORD", undefined, true],
  ] as const)(
    "rejects invalid calibration (%s) without an override",
    async (expectedStatus, calibrationOverrides, skipCalibrationRecord) => {
      const { jobs, units } = await onSiteJobWithEquipmentUnits([
        { calibrationOverrides, skipCalibrationRecord },
      ]);

      await expect(
        calibrationJobsService.replaceReferenceEquipmentUsed(
          realCompanyId,
          jobs[0]!.id,
          staffUserId,
          "TECHNICIAN",
          { items: [{ equipmentId: units[0]!.id }] },
        ),
      ).rejects.toMatchObject({
        response: { code: "EQUIPMENT_CALIBRATION_INVALID", validityStatus: expectedStatus },
      });
    },
  );

  it("records successfully with a TECHNICIAN_MANAGER override, populating actor/reason/timestamp", async () => {
    const { jobs, unit } = await onSiteJobWithConfirmedEquipment({
      validUntil: new Date("2020-01-01T00:00:00.000Z"),
    });
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");

    const before = Date.now();
    const result = await calibrationJobsService.replaceReferenceEquipmentUsed(
      realCompanyId,
      jobs[0]!.id,
      manager.id,
      "TECHNICIAN_MANAGER",
      {
        items: [
          { equipmentId: unit.id, override: { reason: "Certificate expired, unit visually OK" } },
        ],
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.validityOverridden).toBe(true);
    expect(result[0]!.overrideReason).toBe("Certificate expired, unit visually OK");
    expect(result[0]!.overriddenBy?.id).toBe(manager.id);
    expect(result[0]!.overriddenAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("rejects an override attempt from a TECHNICIAN (lacks overrideReferenceEquipmentValidity)", async () => {
    const { jobs, unit } = await onSiteJobWithConfirmedEquipment({
      validUntil: new Date("2020-01-01T00:00:00.000Z"),
    });

    await expect(
      calibrationJobsService.replaceReferenceEquipmentUsed(
        realCompanyId,
        jobs[0]!.id,
        staffUserId,
        "TECHNICIAN",
        { items: [{ equipmentId: unit.id, override: { reason: "trying anyway" } }] },
      ),
    ).rejects.toMatchObject({ response: { code: "FORBIDDEN" } });
  });

  it("rejects a duplicate equipmentId in the payload", async () => {
    const { jobs, unit } = await onSiteJobWithConfirmedEquipment();

    await expect(
      calibrationJobsService.replaceReferenceEquipmentUsed(
        realCompanyId,
        jobs[0]!.id,
        staffUserId,
        "TECHNICIAN",
        { items: [{ equipmentId: unit.id }, { equipmentId: unit.id }] },
      ),
    ).rejects.toMatchObject({ response: { code: "DUPLICATE_JOB_REFERENCE_EQUIPMENT" } });
  });

  it("rejects recording before the job has started", async () => {
    const { jobs, unit } = await onSiteJobWithConfirmedEquipment();
    await prisma.calibrationJob.update({ where: { id: jobs[0]!.id }, data: { startedAt: null } });

    await expect(
      calibrationJobsService.replaceReferenceEquipmentUsed(
        realCompanyId,
        jobs[0]!.id,
        staffUserId,
        "TECHNICIAN",
        { items: [{ equipmentId: unit.id }] },
      ),
    ).rejects.toMatchObject({ response: { code: "CALIBRATION_JOB_NOT_STARTED" } });
  });

  it("rejects recording once the job has advanced past SUBMITTED", async () => {
    const { jobs, unit } = await onSiteJobWithConfirmedEquipment();
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: { status: "SUBMITTED" },
    });

    await expect(
      calibrationJobsService.replaceReferenceEquipmentUsed(
        realCompanyId,
        jobs[0]!.id,
        staffUserId,
        "TECHNICIAN",
        { items: [{ equipmentId: unit.id }] },
      ),
    ).rejects.toMatchObject({ response: { code: "CALIBRATION_JOB_REFERENCE_EQUIPMENT_LOCKED" } });
  });

  it("company-scoping: cannot record on a job from another company", async () => {
    const otherCompanyId = `S${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Foreign Equip Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);
    const { jobs } = await startedWorkOrderJobs(otherCompanyId);

    await expect(
      calibrationJobsService.replaceReferenceEquipmentUsed(
        realCompanyId,
        jobs[0]!.id,
        staffUserId,
        "TECHNICIAN",
        { items: [] },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("candidate listing precomputes validity for both a valid and an invalid unit", async () => {
    const { jobs, units } = await onSiteJobWithEquipmentUnits([
      {},
      { calibrationOverrides: { validUntil: new Date("2020-01-01T00:00:00.000Z") } },
    ]);

    const candidates = await calibrationJobsService.getReferenceEquipmentCandidates(
      realCompanyId,
      jobs[0]!.id,
    );

    expect(candidates).toHaveLength(2);
    const byId = new Map(candidates.map((c) => [c.equipmentId, c]));
    expect(byId.get(units[0]!.id)?.validity.status).toBe("VALID");
    expect(byId.get(units[1]!.id)?.validity.status).toBe("EXPIRED");
    expect(candidates.every((c) => c.requiredForDeviceType)).toBe(true);
  });

  it("candidate listing excludes a confirmed unit whose type is not wired to the job's device type", async () => {
    const { jobs, units } = await onSiteJobWithEquipmentUnits([{}]);

    // A unit confirmed on the WorkOrder but of a type never wired to the
    // DeviceType (no DeviceTypeEquipmentRequirement) — the save-time rule
    // rejects it, so the picker must not offer it.
    const strayType = await createEquipmentType("Thermometer 12 channel");
    const strayUnit = await createEquipmentUnit(strayType.id);
    await createCalibrationRecord(strayUnit.id);
    await prisma.workOrderEquipment.create({
      data: {
        companyId: realCompanyId,
        workOrderId: jobs[0]!.workOrderId,
        equipmentId: strayUnit.id,
        equipmentTypeId: strayType.id,
        sortOrder: 999,
      },
    });

    const candidates = await calibrationJobsService.getReferenceEquipmentCandidates(
      realCompanyId,
      jobs[0]!.id,
    );

    expect(candidates.map((c) => c.equipmentId)).toEqual([units[0]!.id]);
  });

  describe("needsReferenceEquipmentReview (list flag)", () => {
    async function listRow(workOrderId: string, jobId: string) {
      const res = await calibrationJobsService.findAll(realCompanyId, { workOrderId }, staffUserId);
      return res.data.find((row) => row.id === jobId)!;
    }

    it("is false when every required unit's calibration is valid", async () => {
      const { workOrder, jobs } = await onSiteJobWithConfirmedEquipment();
      expect((await listRow(workOrder.id, jobs[0]!.id)).needsReferenceEquipmentReview).toBe(false);
    });

    it("is true when a required unit is expired and not yet overridden", async () => {
      const { workOrder, jobs } = await onSiteJobWithConfirmedEquipment({
        validUntil: new Date("2020-01-01T00:00:00.000Z"),
      });
      expect((await listRow(workOrder.id, jobs[0]!.id)).needsReferenceEquipmentReview).toBe(true);
    });

    it("is true when a required unit has no calibration record", async () => {
      const { workOrder, jobs } = await onSiteJobWithEquipmentUnits([
        { skipCalibrationRecord: true },
      ]);
      expect((await listRow(workOrder.id, jobs[0]!.id)).needsReferenceEquipmentReview).toBe(true);
    });

    it("clears once a TECHNICIAN_MANAGER records the unit with an override", async () => {
      const { workOrder, jobs, unit } = await onSiteJobWithConfirmedEquipment({
        validUntil: new Date("2020-01-01T00:00:00.000Z"),
      });
      const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");

      expect((await listRow(workOrder.id, jobs[0]!.id)).needsReferenceEquipmentReview).toBe(true);

      await calibrationJobsService.replaceReferenceEquipmentUsed(
        realCompanyId,
        jobs[0]!.id,
        manager.id,
        "TECHNICIAN_MANAGER",
        {
          items: [{ equipmentId: unit.id, override: { reason: "Cert expired, unit visually OK" } }],
        },
      );

      expect((await listRow(workOrder.id, jobs[0]!.id)).needsReferenceEquipmentReview).toBe(false);
    });

    it("ignores an expired unit whose type is not required for the job's device type", async () => {
      const { workOrder, jobs } = await onSiteJobWithEquipmentUnits([{}]);
      const strayType = await createEquipmentType("Uncalibrated stray type");
      const strayUnit = await createEquipmentUnit(strayType.id);
      await createCalibrationRecord(strayUnit.id, {
        validUntil: new Date("2020-01-01T00:00:00.000Z"),
      });
      await prisma.workOrderEquipment.create({
        data: {
          companyId: realCompanyId,
          workOrderId: workOrder.id,
          equipmentId: strayUnit.id,
          equipmentTypeId: strayType.id,
          sortOrder: 998,
        },
      });

      expect((await listRow(workOrder.id, jobs[0]!.id)).needsReferenceEquipmentReview).toBe(false);
    });

    it("feeds the grouped list's actionSignals + actionNeededCount", async () => {
      const { workOrder, jobs } = await onSiteJobWithConfirmedEquipment({
        validUntil: new Date("2020-01-01T00:00:00.000Z"),
      });

      const res = await calibrationJobsService.findAllGroupedByWorkOrder(
        realCompanyId,
        { workOrderId: workOrder.id },
        staffUserId,
      );
      const group = res.data[0]!;
      expect(group.actionNeededCount).toBe(1);
      expect(
        group.jobs.find((j) => j.id === jobs[0]!.id)!.actionSignals.referenceEquipmentNeedsApproval,
      ).toBe(true);
    });
  });
});

describe("CalibrationJobsService — list", () => {
  it("lists company jobs and filters by workOrderId + akdAklApprovalStatus", async () => {
    const { workOrder, jobs } = await startedWorkOrderJobs(realCompanyId, { qty: 2 });
    await calibrationJobsService.escalateIdentity(realCompanyId, jobs[0]!.id, {});

    const byWo = await calibrationJobsService.findAll(
      realCompanyId,
      { workOrderId: workOrder.id },
      staffUserId,
    );
    expect(byWo.total).toBe(2);
    expect(byWo.data.every((j) => j.workOrderId === workOrder.id)).toBe(true);

    const pending = await calibrationJobsService.findAll(
      realCompanyId,
      { workOrderId: workOrder.id, akdAklApprovalStatus: "PENDING_REVIEW" },
      staffUserId,
    );
    expect(pending.total).toBe(1);
    expect(pending.data[0]!.id).toBe(jobs[0]!.id);
  });

  it("surfaces the most-recent Identity Correction on each row", async () => {
    const { workOrder, jobs } = await startedWorkOrderJobs(realCompanyId, { qty: 2 });
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    await calibrationJobsService.submitIdentityCorrection(realCompanyId, jobs[0]!.id, tech.id, {
      reason: "wrong serial on the sheet",
      newSerial: "SN-CORRECTED",
      signatures: UNAVAILABLE_SIGNATURES,
    });

    const res = await calibrationJobsService.findAll(
      realCompanyId,
      { workOrderId: workOrder.id },
      staffUserId,
    );
    const withCorrection = res.data.find((j) => j.id === jobs[0]!.id);
    const without = res.data.find((j) => j.id === jobs[1]!.id);
    expect(withCorrection!.identityCorrections).toHaveLength(1);
    expect(withCorrection!.identityCorrections[0]!.status).toBe("PENDING_REVIEW");
    expect(without!.identityCorrections).toEqual([]);
  });

  it("company-scopes the list", async () => {
    const otherCompanyId = `S${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Foreign List Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);
    const { workOrder } = await startedWorkOrderJobs(otherCompanyId);

    const res = await calibrationJobsService.findAll(
      realCompanyId,
      { workOrderId: workOrder.id },
      staffUserId,
    );
    expect(res.total).toBe(0);
  });

  it("exposes actionSignals on every row (both false by default)", async () => {
    const { workOrder, jobs } = await startedWorkOrderJobs(realCompanyId);
    const res = await calibrationJobsService.findAll(
      realCompanyId,
      { workOrderId: workOrder.id },
      staffUserId,
    );
    const row = res.data.find((j) => j.id === jobs[0]!.id)!;
    expect(row.actionSignals).toEqual({
      identityCorrectionPending: false,
      referenceEquipmentNeedsApproval: false,
    });
  });
});

describe("CalibrationJobsService — findAllGroupedByWorkOrder (SPK grouping)", () => {
  it("groups jobs under their WorkOrder and paginates by WorkOrder", async () => {
    const a = await startedWorkOrderJobs(realCompanyId, { qty: 3 });
    const b = await startedWorkOrderJobs(realCompanyId, { qty: 2 });

    const all = await calibrationJobsService.findAllGroupedByWorkOrder(
      realCompanyId,
      {},
      staffUserId,
    );
    const groupA = all.data.find((g) => g.workOrder.id === a.workOrder.id)!;
    const groupB = all.data.find((g) => g.workOrder.id === b.workOrder.id)!;
    expect(groupA.jobCount).toBe(3);
    expect(groupA.jobs).toHaveLength(3);
    expect(groupB.jobCount).toBe(2);
    expect(groupA.jobs.every((j) => j.workOrderId === a.workOrder.id)).toBe(true);

    const firstPage = await calibrationJobsService.findAllGroupedByWorkOrder(
      realCompanyId,
      { pageSize: 1 },
      staffUserId,
    );
    expect(firstPage.data).toHaveLength(1);
    expect(firstPage.pageSize).toBe(1);
    expect(firstPage.total).toBe(all.total); // total = WorkOrder count, not job count
    expect(firstPage.totalPages).toBe(all.total);
  });

  it("aggregates actionNeededCount from child jobs' action signals", async () => {
    const { workOrder, jobs } = await startedWorkOrderJobs(realCompanyId, { qty: 3 });
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    await calibrationJobsService.submitIdentityCorrection(realCompanyId, jobs[0]!.id, tech.id, {
      reason: "wrong serial on the sheet",
      newSerial: "SN-GROUPED-1",
      signatures: UNAVAILABLE_SIGNATURES,
    });

    const res = await calibrationJobsService.findAllGroupedByWorkOrder(
      realCompanyId,
      { workOrderId: workOrder.id },
      staffUserId,
    );
    const group = res.data[0]!;
    expect(group.actionNeededCount).toBe(1);
    const flagged = group.jobs.find((j) => j.id === jobs[0]!.id)!;
    expect(flagged.actionSignals.identityCorrectionPending).toBe(true);
    expect(group.jobs.filter((j) => j.actionSignals.identityCorrectionPending)).toHaveLength(1);
  });

  it("company-scopes the grouped list", async () => {
    const otherCompanyId = `S${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Foreign Grouped Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);
    const { workOrder } = await startedWorkOrderJobs(otherCompanyId);

    const res = await calibrationJobsService.findAllGroupedByWorkOrder(
      realCompanyId,
      { workOrderId: workOrder.id },
      staffUserId,
    );
    expect(res.total).toBe(0);
    expect(res.data).toEqual([]);
  });
});

describe("CalibrationJobsService — list, assignedToMe (technician scope)", () => {
  /** The technician `startedWorkOrderJobs` assigns to the work order. */
  async function assignedTechnicianId(workOrderId: string): Promise<string> {
    const assignment = await prisma.workOrderAssignment.findFirst({
      where: { workOrderId },
      select: { technicianUserId: true },
    });
    return assignment!.technicianUserId;
  }

  it("returns only jobs on work orders the caller is assigned to", async () => {
    const mine = await startedWorkOrderJobs(realCompanyId, { qty: 2 });
    const theirs = await startedWorkOrderJobs(realCompanyId);
    const me = await assignedTechnicianId(mine.workOrder.id);

    const res = await calibrationJobsService.findAll(realCompanyId, { assignedToMe: true }, me);

    expect(res.total).toBe(2);
    expect(res.data.every((j) => j.workOrderId === mine.workOrder.id)).toBe(true);
    expect(res.data.some((j) => j.workOrderId === theirs.workOrder.id)).toBe(false);
  });

  it("includes workOrder.customer.name for technician list grouping", async () => {
    const { workOrder, customerId } = await startedWorkOrderJobs(realCompanyId, { qty: 1 });
    const me = await assignedTechnicianId(workOrder.id);
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { name: true },
    });

    const res = await calibrationJobsService.findAll(realCompanyId, { assignedToMe: true }, me);

    expect(res.data[0]!.workOrder.customerId).toBe(customerId);
    expect(res.data[0]!.workOrder.customer).toEqual({ id: customerId, name: customer.name });
  });

  it("combines with status / akdAklApprovalStatus filters", async () => {
    const { workOrder, jobs } = await startedWorkOrderJobs(realCompanyId, { qty: 2 });
    const me = await assignedTechnicianId(workOrder.id);
    await calibrationJobsService.escalateIdentity(realCompanyId, jobs[0]!.id, {});

    const pending = await calibrationJobsService.findAll(
      realCompanyId,
      { assignedToMe: true, akdAklApprovalStatus: "PENDING_REVIEW" },
      me,
    );
    expect(pending.total).toBe(1);
    expect(pending.data[0]!.id).toBe(jobs[0]!.id);

    const inProgress = await calibrationJobsService.findAll(
      realCompanyId,
      { assignedToMe: true, status: "PENDING" },
      me,
    );
    expect(inProgress.data.every((j) => j.status === "PENDING")).toBe(true);
    expect(inProgress.data.every((j) => j.workOrderId === workOrder.id)).toBe(true);
  });

  it("returns an empty list (not an error) for a technician with no assignments", async () => {
    await startedWorkOrderJobs(realCompanyId);
    const loner = await makeMember(realCompanyId, "TECHNICIAN");

    const res = await calibrationJobsService.findAll(
      realCompanyId,
      { assignedToMe: true },
      loner.id,
    );
    expect(res.total).toBe(0);
    expect(res.data).toEqual([]);
  });

  it("still company-scopes when assignedToMe is set", async () => {
    const otherCompanyId = `S${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Foreign AssignedToMe Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);
    const foreign = await startedWorkOrderJobs(otherCompanyId);
    const foreignTech = await assignedTechnicianId(foreign.workOrder.id);

    // The foreign technician's id, queried against the real company, sees nothing.
    const res = await calibrationJobsService.findAll(
      realCompanyId,
      { assignedToMe: true },
      foreignTech,
    );
    expect(res.total).toBe(0);
  });

  it("omitting assignedToMe is unchanged — returns jobs regardless of assignment", async () => {
    const { workOrder } = await startedWorkOrderJobs(realCompanyId, { qty: 2 });
    const stranger = await makeMember(realCompanyId, "TECHNICIAN");

    const res = await calibrationJobsService.findAll(
      realCompanyId,
      { workOrderId: workOrder.id },
      stranger.id,
    );
    expect(res.total).toBe(2);
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

  it("allows a TECHNICIAN through the start endpoint", async () => {
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    getSessionMock.mockResolvedValueOnce({ user: { id: tech.id, email: "start-t@x.co" } });

    await expect(guard.canActivate(contextFor("start"))).resolves.toBe(true);
  });

  it("allows a TECHNICIAN_MANAGER through the start endpoint", async () => {
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    getSessionMock.mockResolvedValueOnce({ user: { id: manager.id, email: "start-m@x.co" } });

    await expect(guard.canActivate(contextFor("start"))).resolves.toBe(true);
  });

  it("blocks a FINANCE user from the start endpoint (403)", async () => {
    const finance = await makeMember(realCompanyId, "FINANCE");
    getSessionMock.mockResolvedValueOnce({ user: { id: finance.id, email: "start-f@x.co" } });

    await expect(guard.canActivate(contextFor("start"))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows a TECHNICIAN to escalate", async () => {
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    getSessionMock.mockResolvedValueOnce({ user: { id: tech.id, email: "t2@x.co" } });

    await expect(guard.canActivate(contextFor("escalateIdentity"))).resolves.toBe(true);
  });

  it("allows a TECHNICIAN to submit an identity correction", async () => {
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    getSessionMock.mockResolvedValueOnce({ user: { id: tech.id, email: "t3@x.co" } });

    await expect(guard.canActivate(contextFor("submitIdentityCorrection"))).resolves.toBe(true);
  });

  it("blocks a TECHNICIAN from deciding an identity correction (403)", async () => {
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    getSessionMock.mockResolvedValueOnce({ user: { id: tech.id, email: "t4@x.co" } });

    await expect(guard.canActivate(contextFor("decideIdentityCorrection"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("allows a TECHNICIAN_MANAGER to decide an identity correction", async () => {
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    getSessionMock.mockResolvedValueOnce({ user: { id: manager.id, email: "m2@x.co" } });

    await expect(guard.canActivate(contextFor("decideIdentityCorrection"))).resolves.toBe(true);
  });

  it("blocks a FINANCE user from submitting an identity correction (403)", async () => {
    const finance = await makeMember(realCompanyId, "FINANCE");
    getSessionMock.mockResolvedValueOnce({ user: { id: finance.id, email: "f@x.co" } });

    await expect(guard.canActivate(contextFor("submitIdentityCorrection"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("allows a TECHNICIAN to record reference equipment used", async () => {
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    getSessionMock.mockResolvedValueOnce({ user: { id: tech.id, email: "req-t@x.co" } });

    await expect(guard.canActivate(contextFor("replaceReferenceEquipmentUsed"))).resolves.toBe(
      true,
    );
  });

  it("allows a TECHNICIAN_MANAGER to record reference equipment used", async () => {
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    getSessionMock.mockResolvedValueOnce({ user: { id: manager.id, email: "req-m@x.co" } });

    await expect(guard.canActivate(contextFor("replaceReferenceEquipmentUsed"))).resolves.toBe(
      true,
    );
  });

  it("blocks a FINANCE user from recording reference equipment used (403)", async () => {
    const finance = await makeMember(realCompanyId, "FINANCE");
    getSessionMock.mockResolvedValueOnce({ user: { id: finance.id, email: "req-f@x.co" } });

    await expect(
      guard.canActivate(contextFor("replaceReferenceEquipmentUsed")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("identityCorrectionFileOwnerPolicy", () => {
  it("resolves an existing correction as unlocked while PENDING_REVIEW, locked once decided", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    const { correction } = await calibrationJobsService.submitIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      tech.id,
      { reason: "policy test", newSerial: "SN-POLICY", signatures: UNAVAILABLE_SIGNATURES },
    );

    expect(
      await identityCorrectionFileOwnerPolicy.resolveOwner(realCompanyId, correction.id),
    ).toEqual({ exists: true, locked: false });

    expect(
      await identityCorrectionFileOwnerPolicy.resolveOwner("SOME-OTHER-CO", correction.id),
    ).toEqual({ exists: false, locked: false });

    await calibrationJobsService.decideIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      correction.id,
      manager.id,
      { decision: "REJECT", decisionNote: "no" },
    );

    expect(
      await identityCorrectionFileOwnerPolicy.resolveOwner(realCompanyId, correction.id),
    ).toEqual({ exists: true, locked: true });
  });

  it("uses the calibrationJob permission and submitIdentityCorrection write action", () => {
    expect(identityCorrectionFileOwnerPolicy.ownerType).toBe("IDENTITY_CORRECTION");
    expect(identityCorrectionFileOwnerPolicy.permissionResource).toBe("calibrationJob");
    expect(identityCorrectionFileOwnerPolicy.writeAction).toBe("submitIdentityCorrection");
  });
});
