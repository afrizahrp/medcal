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
import { MeasurementResultsService } from "./measurement-results.service";
import { PhysicalCheckResultsService } from "./physical-check-results.service";
import { KontrolAlatService } from "./kontrol-alat.service";

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
const measurementResultsService = new MeasurementResultsService();
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
const createdCapabilityIds: string[] = [];
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
          "KONTROL_ALAT",
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
async function ensureStaffUser() {
  await prisma.user.upsert({
    where: { id: staffUserId },
    create: {
      id: staffUserId,
      email: `${staffUserId}@medcal.test`,
      name: "CJ Staff",
      status: "ACTIVE",
    },
    update: {},
  });
}

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
  await ensureStaffUser();
  const customer = await createTestCustomer(companyId);
  const deviceTypeId = await createDeviceTypeId();
  const request = await calibrationRequestsService.create(companyId, staffUserId, {
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

/** Fixture: WOL start-gate requires executed + dual-signed Kontrol Alat. */
async function completeKontrolAlatForStart(companyId: string, jobId: string) {
  const row = await prisma.kontrolAlat.findUniqueOrThrow({
    where: { calibrationJobId: jobId },
  });
  const signedAt = new Date();
  await prisma.$transaction([
    prisma.kontrolAlat.update({
      where: { id: row.id },
      data: { workExecuted: true, completedAt: signedAt },
    }),
    prisma.kontrolAlatSignature.upsert({
      where: {
        kontrolAlatId_signerKind: { kontrolAlatId: row.id, signerKind: "ADMINISTRATION" },
      },
      create: {
        companyId,
        kontrolAlatId: row.id,
        signerKind: "ADMINISTRATION",
        signerName: "Test Administrasi",
        signedAt,
      },
      update: { signedAt, signerName: "Test Administrasi" },
    }),
    prisma.kontrolAlatSignature.upsert({
      where: {
        kontrolAlatId_signerKind: { kontrolAlatId: row.id, signerKind: "TECHNICAL_OFFICER" },
      },
      create: {
        companyId,
        kontrolAlatId: row.id,
        signerKind: "TECHNICAL_OFFICER",
        signerName: "Test Petugas Teknis",
        signedAt,
      },
      update: { signedAt, signerName: "Test Petugas Teknis" },
    }),
  ]);
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
    await prisma.jobCalibrationTestPoint.deleteMany({
      where: { parameter: { deviceTypeId: { in: createdDeviceTypeIds } } },
    });
    await prisma.calibrationTestPoint.deleteMany({
      where: { parameter: { deviceTypeId: { in: createdDeviceTypeIds } } },
    });
    await prisma.deviceCalibrationParameter.deleteMany({
      where: { deviceTypeId: { in: createdDeviceTypeIds } },
    });
    await prisma.device.deleteMany({ where: { deviceTypeId: { in: createdDeviceTypeIds } } });
    await prisma.priceListItem.deleteMany({
      where: { deviceTypeId: { in: createdDeviceTypeIds } },
    });
    await prisma.deviceType.deleteMany({ where: { id: { in: createdDeviceTypeIds } } });
  }
  if (createdCapabilityIds.length > 0) {
    await prisma.deviceCapabilityItem.deleteMany({
      where: { capabilityId: { in: createdCapabilityIds } },
    });
    await prisma.deviceCapability.deleteMany({ where: { id: { in: createdCapabilityIds } } });
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
    await completeKontrolAlatForStart(realCompanyId, job.id);

    const before = Date.now();
    const started = await calibrationJobsService.start(realCompanyId, job.id);

    expect(started.status).toBe("IN_PROGRESS");
    expect(started.startedAt).not.toBeNull();
    expect(started.startedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    const frozen = await prisma.calibrationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(frozen.measurementTestPointsSnapshottedAt).not.toBeNull();
  });

  it("does not touch sibling jobs", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId, { qty: 3 });
    await completeKontrolAlatForStart(realCompanyId, jobs[1]!.id);
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
    await completeKontrolAlatForStart(realCompanyId, jobs[0]!.id);
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

describe("CalibrationJobsService — start Kontrol Alat gate", () => {
  it("allows ON_SITE start without a Kontrol Alat row", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId, { serviceMode: "ON_SITE" });
    const job = jobs[0]!;
    expect(await prisma.kontrolAlat.findUnique({ where: { calibrationJobId: job.id } })).toBeNull();

    const started = await calibrationJobsService.start(realCompanyId, job.id);
    expect(started.status).toBe("IN_PROGRESS");
    expect(started.startedAt).not.toBeNull();
  });

  it("rejects SEND_TO_LAB start when Kontrol Alat is unsigned", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    await expect(calibrationJobsService.start(realCompanyId, jobs[0]!.id)).rejects.toMatchObject({
      response: { code: "KONTROL_ALAT_INCOMPLETE" },
    });
  });

  it("rejects SEND_TO_LAB start when only one signature is present", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const row = await prisma.kontrolAlat.findUniqueOrThrow({
      where: { calibrationJobId: jobs[0]!.id },
    });
    await prisma.kontrolAlat.update({
      where: { id: row.id },
      data: { workExecuted: true },
    });
    await prisma.kontrolAlatSignature.create({
      data: {
        companyId: realCompanyId,
        kontrolAlatId: row.id,
        signerKind: "ADMINISTRATION",
        signerName: "Only Admin",
        signedAt: new Date(),
      },
    });

    await expect(calibrationJobsService.start(realCompanyId, jobs[0]!.id)).rejects.toMatchObject({
      response: { code: "KONTROL_ALAT_INCOMPLETE" },
    });
  });

  it("rejects SEND_TO_LAB start when workExecuted is still null", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const row = await prisma.kontrolAlat.findUniqueOrThrow({
      where: { calibrationJobId: jobs[0]!.id },
    });
    const signedAt = new Date();
    await prisma.kontrolAlatSignature.createMany({
      data: [
        {
          companyId: realCompanyId,
          kontrolAlatId: row.id,
          signerKind: "ADMINISTRATION",
          signerName: "Admin",
          signedAt,
        },
        {
          companyId: realCompanyId,
          kontrolAlatId: row.id,
          signerKind: "TECHNICAL_OFFICER",
          signerName: "Tech",
          signedAt,
        },
      ],
    });
    await prisma.kontrolAlat.update({
      where: { id: row.id },
      data: { completedAt: signedAt },
    });

    await expect(calibrationJobsService.start(realCompanyId, jobs[0]!.id)).rejects.toMatchObject({
      response: { code: "KONTROL_ALAT_INCOMPLETE" },
    });
  });

  it("rejects SEND_TO_LAB start when workExecuted is false", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const row = await prisma.kontrolAlat.findUniqueOrThrow({
      where: { calibrationJobId: jobs[0]!.id },
    });
    const signedAt = new Date();
    await prisma.kontrolAlat.update({
      where: { id: row.id },
      data: {
        workExecuted: false,
        notExecutedReason: "Alat tidak dikirim",
        completedAt: signedAt,
      },
    });
    await prisma.kontrolAlatSignature.createMany({
      data: [
        {
          companyId: realCompanyId,
          kontrolAlatId: row.id,
          signerKind: "ADMINISTRATION",
          signerName: "Admin",
          signedAt,
        },
        {
          companyId: realCompanyId,
          kontrolAlatId: row.id,
          signerKind: "TECHNICAL_OFFICER",
          signerName: "Tech",
          signedAt,
        },
      ],
    });

    await expect(calibrationJobsService.start(realCompanyId, jobs[0]!.id)).rejects.toMatchObject({
      response: { code: "KONTROL_ALAT_NOT_EXECUTED" },
    });
  });

  it("allows SEND_TO_LAB start without functionFinalOk or request review", async () => {
    const { jobs, workOrder } = await startedWorkOrderJobs(realCompanyId);
    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } });
    expect(wo.requestReviewCompletedAt).toBeNull();
    await completeKontrolAlatForStart(realCompanyId, jobs[0]!.id);
    const row = await prisma.kontrolAlat.findUniqueOrThrow({
      where: { calibrationJobId: jobs[0]!.id },
    });
    expect(row.functionFinalOk).toBeNull();

    const started = await calibrationJobsService.start(realCompanyId, jobs[0]!.id);
    expect(started.status).toBe("IN_PROGRESS");
  });

  it("rejects SEND_TO_LAB start when the Kontrol Alat row is missing", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    await prisma.kontrolAlat.delete({ where: { calibrationJobId: jobs[0]!.id } });

    await expect(calibrationJobsService.start(realCompanyId, jobs[0]!.id)).rejects.toMatchObject({
      response: { code: "KONTROL_ALAT_INCOMPLETE" },
    });
  });
});

describe("CalibrationJobsService — Identity Correction (device identity)", () => {
  it("submit creates a BA + one signature per role atomically", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");

    const result = await calibrationJobsService.submitIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      tech.id,
      {
        reason: "On-site identification",
        newBrand: "Mindray",
        newModel: "uMEC12",
        newSerial: "SN-BAI-1",
        signatures: UNAVAILABLE_SIGNATURES,
      },
    );

    expect(result.correction.number).toMatch(/^BAI\/\d{4}\//);
    expect(result.correction.status).toBe("PENDING_REVIEW");
    expect(result.correction.newBrand).toBe("Mindray");
    expect(result.correction.newModel).toBe("uMEC12");
    expect(result.correction.newSerial).toBe("SN-BAI-1");
    expect(result.correction.signatures).toHaveLength(2);
    expect(result.correction.signatures.map((s) => s.signerRole).sort()).toEqual([
      "CUSTOMER",
      "TECHNICIAN",
    ]);
    // Not written through to the job until approval.
    const job = await calibrationJobsService.findOne(realCompanyId, jobs[0]!.id);
    expect(job.technicianObservedBrand).toBeNull();
    expect(job.technicianObservedModel).toBeNull();
    expect(job.technicianObservedSerial).toBeNull();
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

  it("approve writes Brand/Model/Serial + AKD/AKL through to the job's observed identity", async () => {
    const { jobs, customerId, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    const device = await devicesService.create(realCompanyId, { customerId, deviceTypeId });
    // The WO/SPK assignment — locked from here on.
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: { deviceId: device.id },
    });

    const { correction } = await calibrationJobsService.submitIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      tech.id,
      {
        reason: "full identity",
        newBrand: "Mindray",
        newModel: "uMEC12",
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
    expect(result.job.technicianObservedBrand).toBe("Mindray");
    expect(result.job.technicianObservedModel).toBe("uMEC12");
    expect(result.job.technicianObservedSerial).toBe("SN-OBS-9");
    expect(result.job.technicianObservedAkdAkl).toBe("AKL 12345");
    // MoM #6: the Device assigned by the WO/SPK is never rebound by a BA.
    expect(result.job.deviceId).toBe(device.id);
    // ...and the master is NOT written at approval time.
    const master = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });
    expect(master.brand).toBeNull();
    expect(master.model).toBeNull();
    expect(master.serialNumber).toBeNull();
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
    expect(result.job.akdAklGateOpenedBy).toBe("AUTO_MISMATCH");
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

  it("approve unwinds an AUTO_MISMATCH PENDING_REVIEW gate to NOT_REQUIRED when a later correction resolves the mismatch", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: {
        akdAklApprovalStatus: "PENDING_REVIEW",
        akdAklGateOpenedBy: "AUTO_MISMATCH",
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
    expect(result.job.akdAklGateOpenedBy).toBeNull();
    expect(result.job.technicianObservedAkdAkl).toBe("AKL-DECLARED");
  });

  it("does NOT unwind a MANUAL_ESCALATION PENDING_REVIEW gate even when a later correction resolves the text mismatch", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");

    // Technician manually escalates (e.g. suspected forged document), recording
    // an observed value that already matches the declaration.
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: { customerDeclaredAkdAkl: "AKL-DECLARED" },
    });
    await calibrationJobsService.escalateIdentity(realCompanyId, jobs[0]!.id, {
      technicianObservedAkdAkl: "AKL-WRONG",
      reason: "dokumen izin edar diduga palsu",
    });
    const escalated = await prisma.calibrationJob.findUniqueOrThrow({ where: { id: jobs[0]!.id } });
    expect(escalated.akdAklApprovalStatus).toBe("PENDING_REVIEW");
    expect(escalated.akdAklGateOpenedBy).toBe("MANUAL_ESCALATION");

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

    // Gate stays open — the human concern still needs an explicit decision.
    expect(result.job.akdAklApprovalStatus).toBe("PENDING_REVIEW");
    expect(result.job.akdAklGateOpenedBy).toBe("MANUAL_ESCALATION");
    expect(result.job.technicianObservedAkdAkl).toBe("AKL-DECLARED");
  });

  it("clears akdAklGateOpenedBy when a manager explicitly decides a manually-escalated gate", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");

    await calibrationJobsService.escalateIdentity(realCompanyId, jobs[0]!.id, {
      reason: "perlu ditinjau manajer",
    });
    const escalated = await prisma.calibrationJob.findUniqueOrThrow({ where: { id: jobs[0]!.id } });
    expect(escalated.akdAklGateOpenedBy).toBe("MANUAL_ESCALATION");

    const approved = await calibrationJobsService.decideIdentity(
      realCompanyId,
      jobs[0]!.id,
      manager.id,
      { decision: "APPROVE", akdAklDecisionNote: "sudah diverifikasi" },
    );
    expect(approved.akdAklApprovalStatus).toBe("APPROVED");
    expect(approved.akdAklGateOpenedBy).toBeNull();

    // And a REJECT decision clears it too.
    const { jobs: jobs2 } = await startedWorkOrderJobs(realCompanyId);
    await calibrationJobsService.escalateIdentity(realCompanyId, jobs2[0]!.id, { reason: "x" });
    const rejected = await calibrationJobsService.decideIdentity(
      realCompanyId,
      jobs2[0]!.id,
      manager.id,
      { decision: "REJECT", akdAklDecisionNote: "ditolak" },
    );
    expect(rejected.akdAklApprovalStatus).toBe("REJECTED");
    expect(rejected.akdAklGateOpenedBy).toBeNull();
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

  it("reject makes no writes to the job or the master, and keeps the BA number", async () => {
    const { jobs, customerId, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    const device = await devicesService.create(realCompanyId, {
      customerId,
      deviceTypeId,
      brand: "Master Brand",
    });
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: { deviceId: device.id },
    });

    const { correction } = await calibrationJobsService.submitIdentityCorrection(
      realCompanyId,
      jobs[0]!.id,
      tech.id,
      { reason: "not sure", newBrand: "Wrong Brand", signatures: UNAVAILABLE_SIGNATURES },
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
    expect(result.job.technicianObservedBrand).toBeNull();
    expect(result.job.deviceId).toBe(device.id);
    const master = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });
    expect(master.brand).toBe("Master Brand");
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

});

describe("CalibrationJobsService — MoM #6 BAI lifecycle, master commit & LK identity", () => {
  async function inProgressJobWithDevice(opts?: {
    brand?: string;
    model?: string;
    serialNumber?: string;
  }) {
    const ctx = await startedWorkOrderJobs(realCompanyId);
    const jobId = ctx.jobs[0]!.id;
    await completeKontrolAlatForStart(realCompanyId, jobId);
    await calibrationJobsService.start(realCompanyId, jobId);
    // The Device the WO/SPK assigns to this job — locked from here on.
    const device = await devicesService.create(realCompanyId, {
      customerId: ctx.customerId,
      deviceTypeId: ctx.deviceTypeId,
      ...(opts?.brand !== undefined ? { brand: opts.brand } : {}),
      ...(opts?.model !== undefined ? { model: opts.model } : {}),
      ...(opts?.serialNumber !== undefined ? { serialNumber: opts.serialNumber } : {}),
    });
    await prisma.calibrationJob.update({ where: { id: jobId }, data: { deviceId: device.id } });
    return { ...ctx, jobId, device };
  }

  async function pendingCorrection(
    jobId: string,
    input: { newBrand?: string; newModel?: string; newSerial?: string },
  ) {
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    const { correction } = await calibrationJobsService.submitIdentityCorrection(
      realCompanyId,
      jobId,
      tech.id,
      { reason: "MoM6", signatures: UNAVAILABLE_SIGNATURES, ...input },
    );
    return correction;
  }

  // ── BAI lifecycle ──────────────────────────────────────────────────────────

  it("a pending BA does NOT block measurement recording", async () => {
    const { jobId, deviceTypeId } = await inProgressJobWithDevice();
    await pendingCorrection(jobId, { newSerial: "SN-PENDING" });
    const technician = await makeMember(realCompanyId, "TECHNICIAN");

    const capability = await prisma.deviceCapability.create({
      data: { code: `M6C${randomUUID().slice(0, 8)}`, name: "MoM6 Cap" },
    });
    createdCapabilityIds.push(capability.id);
    const item = await prisma.deviceCapabilityItem.create({
      data: { capabilityId: capability.id, name: "MoM6 Item" },
    });
    const param = await prisma.deviceCalibrationParameter.create({
      data: {
        deviceTypeId,
        capabilityItemId: item.id,
        code: `M6P${randomUUID().slice(0, 8).toUpperCase()}`,
        name: "MoM6 Param",
        valueType: "NUMBER",
        toleranceMin: 0,
        toleranceMax: 100,
      },
    });

    const row = await measurementResultsService.create(
      realCompanyId,
      {
        calibrationJobId: jobId,
        deviceCalibrationParameterId: param.id,
        replicateIndex: 1,
        measuredValue: 50,
      },
      technician.id,
    );
    expect(row.id).toBeTruthy();
  });

  it("a pending BA blocks submitForReview with IDENTITY_CORRECTION_UNRESOLVED", async () => {
    const { jobId } = await inProgressJobWithDevice();
    await pendingCorrection(jobId, { newSerial: "SN-BLOCK" });

    await expect(calibrationJobsService.submitForReview(realCompanyId, jobId)).rejects.toMatchObject(
      { response: { code: "IDENTITY_CORRECTION_UNRESOLVED" } },
    );

    const job = await calibrationJobsService.findOne(realCompanyId, jobId);
    expect(job.status).toBe("IN_PROGRESS");
    expect(job.submittedAt).toBeNull();
  });

  it("an APPROVED BA clears the submit gate", async () => {
    const { jobId } = await inProgressJobWithDevice();
    const correction = await pendingCorrection(jobId, { newSerial: "SN-OK" });
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    await calibrationJobsService.decideIdentityCorrection(
      realCompanyId,
      jobId,
      correction.id,
      manager.id,
      { decision: "APPROVE" },
    );

    const submitted = await calibrationJobsService.submitForReview(realCompanyId, jobId);
    expect(submitted.status).toBe("SUBMITTED");
  });

  it("a REJECTED BA also clears the submit gate", async () => {
    const { jobId } = await inProgressJobWithDevice();
    const correction = await pendingCorrection(jobId, { newSerial: "SN-NO" });
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    await calibrationJobsService.decideIdentityCorrection(
      realCompanyId,
      jobId,
      correction.id,
      manager.id,
      { decision: "REJECT", decisionNote: "not confirmed" },
    );

    const submitted = await calibrationJobsService.submitForReview(realCompanyId, jobId);
    expect(submitted.status).toBe("SUBMITTED");
  });

  it("a BA cannot be decided once the job is SUBMITTED (no post-submit workflow)", async () => {
    const { jobId } = await inProgressJobWithDevice();
    const correction = await pendingCorrection(jobId, { newSerial: "SN-LATE" });
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    // Forced directly: submitForReview would now refuse precisely because this
    // BA is pending, which is the behaviour the gate test above covers.
    await prisma.calibrationJob.update({ where: { id: jobId }, data: { status: "SUBMITTED" } });

    await expect(
      calibrationJobsService.decideIdentityCorrection(
        realCompanyId,
        jobId,
        correction.id,
        manager.id,
        { decision: "APPROVE" },
      ),
    ).rejects.toMatchObject({ response: { code: "CALIBRATION_JOB_IDENTITY_GATE_LOCKED" } });
  });

  it("a BA can never change CalibrationJob.deviceId", async () => {
    const { jobId, device } = await inProgressJobWithDevice();
    const correction = await pendingCorrection(jobId, {
      newBrand: "B",
      newModel: "M",
      newSerial: "S",
    });
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    const result = await calibrationJobsService.decideIdentityCorrection(
      realCompanyId,
      jobId,
      correction.id,
      manager.id,
      { decision: "APPROVE" },
    );
    expect(result.job.deviceId).toBe(device.id);
  });

  // ── Race condition invariant ───────────────────────────────────────────────

  it("INVARIANT: a BA racing a submit can never leave SUBMITTED + PENDING_REVIEW", async () => {
    const { jobId } = await inProgressJobWithDevice();
    const tech = await makeMember(realCompanyId, "TECHNICIAN");

    // Both start from the same pre-submit view of the job and race to commit.
    const results = await Promise.allSettled([
      calibrationJobsService.submitForReview(realCompanyId, jobId),
      calibrationJobsService.submitIdentityCorrection(realCompanyId, jobId, tech.id, {
        reason: "concurrent",
        newSerial: "SN-RACE",
        signatures: UNAVAILABLE_SIGNATURES,
      }),
    ]);

    const job = await prisma.calibrationJob.findUniqueOrThrow({ where: { id: jobId } });
    const pending = await prisma.identityCorrection.findFirst({
      where: { calibrationJobId: jobId, status: "PENDING_REVIEW" },
      select: { id: true },
    });

    // Whatever the interleaving, the forbidden combination must not exist.
    expect(job.status === "SUBMITTED" && pending !== null).toBe(false);
    // ...and at least one of the two operations was refused.
    expect(results.some((r) => r.status === "rejected")).toBe(true);
  });

  // ── ACCEPTED_BY_QA master commit ───────────────────────────────────────────

  async function approveThenComplete(jobId: string, correctionId: string | null) {
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    if (correctionId) {
      await calibrationJobsService.decideIdentityCorrection(
        realCompanyId,
        jobId,
        correctionId,
        manager.id,
        { decision: "APPROVE" },
      );
    }
    await calibrationJobsService.submitForReview(realCompanyId, jobId);
    await calibrationJobsService.decideQualityReview(realCompanyId, jobId, manager.id, {
      decision: "APPROVE",
    });
    return calibrationJobsService.complete(realCompanyId, jobId);
  }

  it("commits the approved observed identity to the Device master at ACCEPTED_BY_QA", async () => {
    const { jobId, device } = await inProgressJobWithDevice({
      brand: "Old Brand",
      model: "Old Model",
      serialNumber: "SN-OLD",
    });
    const correction = await pendingCorrection(jobId, {
      newBrand: "New Brand",
      newModel: "New Model",
      newSerial: "SN-NEW",
    });

    const completed = await approveThenComplete(jobId, correction.id);
    expect(completed.status).toBe("ACCEPTED_BY_QA");

    const master = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });
    expect(master.brand).toBe("New Brand");
    expect(master.model).toBe("New Model");
    expect(master.serialNumber).toBe("SN-NEW");
    // The Device row itself is never replaced.
    expect(master.id).toBe(device.id);
    expect(master.code).toBeTruthy();
    expect(completed.deviceId).toBe(device.id);
  });

  it("never overwrites a Device master field with a NULL observed value", async () => {
    const { jobId, device } = await inProgressJobWithDevice({
      brand: "Keep Brand",
      model: "Keep Model",
      serialNumber: "SN-KEEP",
    });
    // Only Brand is corrected — Model and Serial stay NULL on the job.
    const correction = await pendingCorrection(jobId, { newBrand: "Only Brand" });

    await approveThenComplete(jobId, correction.id);

    const master = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });
    expect(master.brand).toBe("Only Brand");
    expect(master.model).toBe("Keep Model");
    expect(master.serialNumber).toBe("SN-KEEP");
  });

  it("leaves the master untouched when the job observed nothing", async () => {
    const { jobId, device } = await inProgressJobWithDevice({
      brand: "Untouched",
      serialNumber: "SN-UNTOUCHED",
    });

    const completed = await approveThenComplete(jobId, null);

    expect(completed.status).toBe("ACCEPTED_BY_QA");
    const master = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });
    expect(master.brand).toBe("Untouched");
    expect(master.serialNumber).toBe("SN-UNTOUCHED");
  });

  it("rolls the ACCEPTED_BY_QA transition back when the master commit matches no row", async () => {
    const { jobId, device } = await inProgressJobWithDevice({ brand: "Rollback Brand" });
    const correction = await pendingCorrection(jobId, { newBrand: "Doomed Brand" });
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    await calibrationJobsService.decideIdentityCorrection(
      realCompanyId,
      jobId,
      correction.id,
      manager.id,
      { decision: "APPROVE" },
    );
    await calibrationJobsService.submitForReview(realCompanyId, jobId);
    await calibrationJobsService.decideQualityReview(realCompanyId, jobId, manager.id, {
      decision: "APPROVE",
    });

    // Move the Device into another company so the company-scoped master update
    // inside the transaction matches zero rows. Raw SQL because the FK to
    // Customer is not re-pointed — only the scope the update filters on.
    const foreignCompanyId = `R${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: foreignCompanyId, name: "Rollback Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(foreignCompanyId);
    await prisma.$executeRaw`UPDATE "Device" SET "companyId" = ${foreignCompanyId} WHERE "id" = ${device.id}`;
    try {
      await expect(calibrationJobsService.complete(realCompanyId, jobId)).rejects.toMatchObject({
        response: { code: "DEVICE_MASTER_COMMIT_FAILED" },
      });

      // The whole transaction rolled back: the job did NOT advance, so LK stays
      // unavailable and the master was never half-written.
      const job = await prisma.calibrationJob.findUniqueOrThrow({ where: { id: jobId } });
      expect(job.status).toBe("SUBMITTED");
      const master = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });
      expect(master.brand).toBe("Rollback Brand");
    } finally {
      await prisma.$executeRaw`UPDATE "Device" SET "companyId" = ${realCompanyId} WHERE "id" = ${device.id}`;
    }
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
    await prisma.jobReferenceEquipmentApprovalItem.deleteMany({
      where: { equipmentId: { in: createdEquipmentIds } },
    });
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
    "lets a technician save invalid calibration (%s) without making it usable",
    async (_expectedStatus, calibrationOverrides, skipCalibrationRecord) => {
      const { jobs, units } = await onSiteJobWithEquipmentUnits([
        { calibrationOverrides, skipCalibrationRecord },
      ]);

      const result = await calibrationJobsService.replaceReferenceEquipmentUsed(
        realCompanyId,
        jobs[0]!.id,
        staffUserId,
        "TECHNICIAN",
        { items: [{ equipmentId: units[0]!.id }] },
      );
      expect(result).toHaveLength(1);
      expect(result[0]!.validityOverridden).toBe(false);
      expect(result[0]!.overriddenByUserId).toBeNull();
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

    it("is false when a required WO unit is expired but not selected on the job", async () => {
      const { workOrder, jobs } = await onSiteJobWithConfirmedEquipment({
        validUntil: new Date("2020-01-01T00:00:00.000Z"),
      });
      expect((await listRow(workOrder.id, jobs[0]!.id)).needsReferenceEquipmentReview).toBe(false);
    });

    it("is true when a selected required unit is expired and not yet overridden", async () => {
      const { workOrder, jobs, unit } = await onSiteJobWithConfirmedEquipment({
        validUntil: new Date("2020-01-01T00:00:00.000Z"),
      });
      await calibrationJobsService.replaceReferenceEquipmentUsed(
        realCompanyId,
        jobs[0]!.id,
        staffUserId,
        "TECHNICIAN",
        { items: [{ equipmentId: unit.id }] },
      );
      expect((await listRow(workOrder.id, jobs[0]!.id)).needsReferenceEquipmentReview).toBe(true);
    });

    it("is true when a selected required unit has no calibration record", async () => {
      const { workOrder, jobs, units } = await onSiteJobWithEquipmentUnits([
        { skipCalibrationRecord: true },
      ]);
      await calibrationJobsService.replaceReferenceEquipmentUsed(
        realCompanyId,
        jobs[0]!.id,
        staffUserId,
        "TECHNICIAN",
        { items: [{ equipmentId: units[0]!.id }] },
      );
      expect((await listRow(workOrder.id, jobs[0]!.id)).needsReferenceEquipmentReview).toBe(true);
    });

    it("clears once a TECHNICIAN_MANAGER records the unit with an override", async () => {
      const { workOrder, jobs, unit } = await onSiteJobWithConfirmedEquipment({
        validUntil: new Date("2020-01-01T00:00:00.000Z"),
      });
      const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");

      await calibrationJobsService.replaceReferenceEquipmentUsed(
        realCompanyId,
        jobs[0]!.id,
        staffUserId,
        "TECHNICIAN",
        { items: [{ equipmentId: unit.id }] },
      );
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
      const { workOrder, jobs, unit } = await onSiteJobWithConfirmedEquipment({
        validUntil: new Date("2020-01-01T00:00:00.000Z"),
      });
      await calibrationJobsService.replaceReferenceEquipmentUsed(
        realCompanyId,
        jobs[0]!.id,
        staffUserId,
        "TECHNICIAN",
        { items: [{ equipmentId: unit.id }] },
      );

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

  describe("reference equipment approval workflow", () => {
    async function markInProgress(jobId: string) {
      await prisma.calibrationJob.update({
        where: { id: jobId },
        data: { status: "IN_PROGRESS" },
      });
    }

    it("does not change CalibrationJob.status when a technician requests approval", async () => {
      const { jobs, units } = await onSiteJobWithEquipmentUnits([
        {},
        { calibrationOverrides: { validUntil: new Date("2020-01-01T00:00:00.000Z") } },
      ]);
      const jobId = jobs[0]!.id;
      await markInProgress(jobId);
      const before = await prisma.calibrationJob.findUniqueOrThrow({
        where: { id: jobId },
        select: { status: true, submittedAt: true },
      });
      expect(before.status).toBe("IN_PROGRESS");
      expect(before.submittedAt).toBeNull();

      await calibrationJobsService.replaceReferenceEquipmentUsed(
        realCompanyId,
        jobId,
        staffUserId,
        "TECHNICIAN",
        { items: [{ equipmentId: units[0]!.id }, { equipmentId: units[1]!.id }] },
      );
      const tech = await makeMember(realCompanyId, "TECHNICIAN");
      const approval = await calibrationJobsService.submitReferenceEquipmentApproval(
        realCompanyId,
        jobId,
        tech.id,
      );

      expect(approval.status).toBe("PENDING_REVIEW");
      expect(approval.items.some((i) => i.requiresOverride)).toBe(true);
      const after = await prisma.calibrationJob.findUniqueOrThrow({
        where: { id: jobId },
        select: { status: true, submittedAt: true },
      });
      expect(after.status).toBe("IN_PROGRESS");
      expect(after.submittedAt).toBeNull();
    });

    it("blocks replace and submitForReview while approval is pending, then allows submit after MT approve", async () => {
      const { jobs, units } = await onSiteJobWithEquipmentUnits([
        {},
        { calibrationOverrides: { validUntil: new Date("2020-01-01T00:00:00.000Z") } },
      ]);
      const jobId = jobs[0]!.id;
      await markInProgress(jobId);
      await calibrationJobsService.replaceReferenceEquipmentUsed(
        realCompanyId,
        jobId,
        staffUserId,
        "TECHNICIAN",
        { items: [{ equipmentId: units[0]!.id }, { equipmentId: units[1]!.id }] },
      );
      const tech = await makeMember(realCompanyId, "TECHNICIAN");
      const approval = await calibrationJobsService.submitReferenceEquipmentApproval(
        realCompanyId,
        jobId,
        tech.id,
      );

      await expect(
        calibrationJobsService.replaceReferenceEquipmentUsed(
          realCompanyId,
          jobId,
          staffUserId,
          "TECHNICIAN",
          { items: [{ equipmentId: units[0]!.id }] },
        ),
      ).rejects.toMatchObject({
        response: { code: "REFERENCE_EQUIPMENT_APPROVAL_ALREADY_PENDING" },
      });
      await expect(calibrationJobsService.submitForReview(realCompanyId, jobId)).rejects.toMatchObject(
        { response: { code: "REFERENCE_EQUIPMENT_APPROVAL_UNRESOLVED" } },
      );
      const stillOpen = await prisma.calibrationJob.findUniqueOrThrow({
        where: { id: jobId },
        select: { status: true, submittedAt: true },
      });
      expect(stillOpen.status).toBe("IN_PROGRESS");
      expect(stillOpen.submittedAt).toBeNull();

      const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
      const decided = await calibrationJobsService.decideReferenceEquipmentApproval(
        realCompanyId,
        jobId,
        approval.id,
        manager.id,
        {
          decision: "APPROVE",
          items: [{ equipmentId: units[1]!.id, overrideReason: "Visual check OK" }],
        },
      );
      expect(decided.status).toBe("APPROVED");
      const used = await calibrationJobsService.listReferenceEquipmentUsed(realCompanyId, jobId);
      const invalidRow = used.find((row) => row.equipmentId === units[1]!.id)!;
      expect(invalidRow.validityOverridden).toBe(true);
      expect(invalidRow.overrideReason).toBe("Visual check OK");
      const validRow = used.find((row) => row.equipmentId === units[0]!.id)!;
      expect(validRow.validityOverridden).toBe(false);

      const submitted = await calibrationJobsService.submitForReview(realCompanyId, jobId);
      expect(submitted.status).toBe("SUBMITTED");
      expect(submitted.submittedAt).not.toBeNull();
    });

    it("does not block submitForReview for an invalid WO unit that was not selected", async () => {
      const { jobs } = await onSiteJobWithEquipmentUnits([
        {},
        { calibrationOverrides: { validUntil: new Date("2020-01-01T00:00:00.000Z") } },
      ]);
      await markInProgress(jobs[0]!.id);
      const submitted = await calibrationJobsService.submitForReview(realCompanyId, jobs[0]!.id);
      expect(submitted.status).toBe("SUBMITTED");
    });

    it("blocks submitForReview when invalid equipment is selected but not yet requested", async () => {
      const { jobs, units } = await onSiteJobWithEquipmentUnits([
        { calibrationOverrides: { validUntil: new Date("2020-01-01T00:00:00.000Z") } },
      ]);
      await markInProgress(jobs[0]!.id);
      await calibrationJobsService.replaceReferenceEquipmentUsed(
        realCompanyId,
        jobs[0]!.id,
        staffUserId,
        "TECHNICIAN",
        { items: [{ equipmentId: units[0]!.id }] },
      );
      await expect(
        calibrationJobsService.submitForReview(realCompanyId, jobs[0]!.id),
      ).rejects.toMatchObject({ response: { code: "REFERENCE_EQUIPMENT_APPROVAL_UNRESOLVED" } });
    });

    it("rejects an approval request when every selected unit is valid", async () => {
      const { jobs, unit } = await onSiteJobWithConfirmedEquipment();
      await calibrationJobsService.replaceReferenceEquipmentUsed(
        realCompanyId,
        jobs[0]!.id,
        staffUserId,
        "TECHNICIAN",
        { items: [{ equipmentId: unit.id }] },
      );
      const tech = await makeMember(realCompanyId, "TECHNICIAN");
      await expect(
        calibrationJobsService.submitReferenceEquipmentApproval(realCompanyId, jobs[0]!.id, tech.id),
      ).rejects.toMatchObject({ response: { code: "REFERENCE_EQUIPMENT_APPROVAL_NOT_REQUIRED" } });
    });

    it("requires overrideReason on every invalid line and decisionNote on REJECT", async () => {
      const { jobs, units } = await onSiteJobWithEquipmentUnits([
        { calibrationOverrides: { validUntil: new Date("2020-01-01T00:00:00.000Z") } },
      ]);
      await markInProgress(jobs[0]!.id);
      await calibrationJobsService.replaceReferenceEquipmentUsed(
        realCompanyId,
        jobs[0]!.id,
        staffUserId,
        "TECHNICIAN",
        { items: [{ equipmentId: units[0]!.id }] },
      );
      const tech = await makeMember(realCompanyId, "TECHNICIAN");
      const approval = await calibrationJobsService.submitReferenceEquipmentApproval(
        realCompanyId,
        jobs[0]!.id,
        tech.id,
      );
      const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
      await expect(
        calibrationJobsService.decideReferenceEquipmentApproval(
          realCompanyId,
          jobs[0]!.id,
          approval.id,
          manager.id,
          { decision: "APPROVE", items: [] },
        ),
      ).rejects.toMatchObject({
        response: { code: "INVALID_REFERENCE_EQUIPMENT_APPROVAL_DECISION" },
      });
      await expect(
        calibrationJobsService.decideReferenceEquipmentApproval(
          realCompanyId,
          jobs[0]!.id,
          approval.id,
          manager.id,
          { decision: "REJECT" },
        ),
      ).rejects.toMatchObject({
        response: { code: "INVALID_REFERENCE_EQUIPMENT_APPROVAL_DECISION" },
      });

      const rejected = await calibrationJobsService.decideReferenceEquipmentApproval(
        realCompanyId,
        jobs[0]!.id,
        approval.id,
        manager.id,
        { decision: "REJECT", decisionNote: "Gunakan alat cadangan" },
      );
      expect(rejected.status).toBe("REJECTED");
      const used = await calibrationJobsService.listReferenceEquipmentUsed(
        realCompanyId,
        jobs[0]!.id,
      );
      expect(used[0]!.validityOverridden).toBe(false);

      await calibrationJobsService.replaceReferenceEquipmentUsed(
        realCompanyId,
        jobs[0]!.id,
        staffUserId,
        "TECHNICIAN",
        { items: [{ equipmentId: units[0]!.id }] },
      );
      const second = await calibrationJobsService.submitReferenceEquipmentApproval(
        realCompanyId,
        jobs[0]!.id,
        tech.id,
      );
      expect(second.id).not.toBe(approval.id);
      expect(second.status).toBe("PENDING_REVIEW");
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

  it("exposes actionSignals on every row (all false before Mulai Kalibrasi)", async () => {
    const { workOrder, jobs } = await startedWorkOrderJobs(realCompanyId);
    const res = await calibrationJobsService.findAll(
      realCompanyId,
      { workOrderId: workOrder.id },
      staffUserId,
    );
    const row = res.data.find((j) => j.id === jobs[0]!.id)!;
    expect(row.startedAt).toBeNull();
    expect(row.actionSignals).toEqual({
      identityCorrectionPending: false,
      referenceEquipmentNeedsApproval: false,
      identityIncomplete: false,
    });
  });

  it("sets identityIncomplete after start when Device ID and Serial are both missing", async () => {
    const { workOrder, jobs } = await startedWorkOrderJobs(realCompanyId);
    await completeKontrolAlatForStart(realCompanyId, jobs[0]!.id);
    await calibrationJobsService.start(realCompanyId, jobs[0]!.id);

    const row = (
      await calibrationJobsService.findAll(
        realCompanyId,
        { workOrderId: workOrder.id },
        staffUserId,
      )
    ).data.find((j) => j.id === jobs[0]!.id)!;
    expect(row.deviceId).toBeNull();
    expect(row.technicianObservedSerial).toBeNull();
    expect(row.actionSignals.identityIncomplete).toBe(true);
  });

  it("sets identityIncomplete false when Device ID and observed Serial are both present after start", async () => {
    const { workOrder, jobs, customerId, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    await completeKontrolAlatForStart(realCompanyId, jobs[0]!.id);
    await calibrationJobsService.start(realCompanyId, jobs[0]!.id);
    const device = await devicesService.create(realCompanyId, {
      customerId,
      deviceTypeId,
      serialNumber: "SN-COMPLETE-1",
    });
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: { deviceId: device.id, technicianObservedSerial: "SN-COMPLETE-1" },
    });

    const row = (
      await calibrationJobsService.findAll(
        realCompanyId,
        { workOrderId: workOrder.id },
        staffUserId,
      )
    ).data.find((j) => j.id === jobs[0]!.id)!;
    expect(row.actionSignals.identityIncomplete).toBe(false);
  });

  it("sets identityIncomplete false when Device ID equals Serial (allowed)", async () => {
    const { workOrder, jobs, customerId, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    await completeKontrolAlatForStart(realCompanyId, jobs[0]!.id);
    await calibrationJobsService.start(realCompanyId, jobs[0]!.id);
    const device = await devicesService.create(realCompanyId, {
      customerId,
      deviceTypeId,
      serialNumber: "DVC-SAME",
    });
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: { deviceId: device.id, technicianObservedSerial: "DVC-SAME" },
    });

    const row = (
      await calibrationJobsService.findAll(
        realCompanyId,
        { workOrderId: workOrder.id },
        staffUserId,
      )
    ).data.find((j) => j.id === jobs[0]!.id)!;
    expect(row.actionSignals.identityIncomplete).toBe(false);
  });

  it("sets identityIncomplete true when only Device ID is missing after start", async () => {
    const { workOrder, jobs } = await startedWorkOrderJobs(realCompanyId);
    await completeKontrolAlatForStart(realCompanyId, jobs[0]!.id);
    await calibrationJobsService.start(realCompanyId, jobs[0]!.id);
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: { technicianObservedSerial: "SN-ONLY" },
    });
    const row = (
      await calibrationJobsService.findAll(
        realCompanyId,
        { workOrderId: workOrder.id },
        staffUserId,
      )
    ).data.find((j) => j.id === jobs[0]!.id)!;
    expect(row.deviceId).toBeNull();
    expect(row.actionSignals.identityIncomplete).toBe(true);
  });

  it("sets identityIncomplete true when only Serial is missing after start", async () => {
    const { workOrder, jobs, customerId, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    await completeKontrolAlatForStart(realCompanyId, jobs[0]!.id);
    await calibrationJobsService.start(realCompanyId, jobs[0]!.id);
    const device = await devicesService.create(realCompanyId, {
      customerId,
      deviceTypeId,
      serialNumber: "SN-BOUND",
    });
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: { deviceId: device.id, technicianObservedSerial: null },
    });
    const row = (
      await calibrationJobsService.findAll(
        realCompanyId,
        { workOrderId: workOrder.id },
        staffUserId,
      )
    ).data.find((j) => j.id === jobs[0]!.id)!;
    expect(row.deviceId).toBe(device.id);
    expect(row.technicianObservedSerial).toBeNull();
    expect(row.actionSignals.identityIncomplete).toBe(true);
  });

  it("does not block Mulai Kalibrasi when identity is incomplete (warning only)", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    await completeKontrolAlatForStart(realCompanyId, jobs[0]!.id);
    const started = await calibrationJobsService.start(realCompanyId, jobs[0]!.id);
    expect(started.status).toBe("IN_PROGRESS");
    expect(started.deviceId).toBeNull();
    const row = await calibrationJobsService.findOneRow(realCompanyId, jobs[0]!.id);
    expect(row.actionSignals.identityIncomplete).toBe(true);
  });

  it("clears identityIncomplete action signal once the identity gate is locked", async () => {
    const { workOrder, jobs } = await startedWorkOrderJobs(realCompanyId);
    await completeKontrolAlatForStart(realCompanyId, jobs[0]!.id);
    await calibrationJobsService.start(realCompanyId, jobs[0]!.id);
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });

    const row = await calibrationJobsService.findOneRow(realCompanyId, jobs[0]!.id);
    expect(row.deviceId).toBeNull();
    expect(row.technicianObservedSerial).toBeNull();
    expect(row.actionSignals.identityIncomplete).toBe(false);
    expect(row.actionSignals).toEqual({
      identityCorrectionPending: false,
      referenceEquipmentNeedsApproval: false,
      identityIncomplete: false,
    });

    const grouped = await calibrationJobsService.findAllGroupedByWorkOrder(
      realCompanyId,
      { workOrderId: workOrder.id },
      staffUserId,
    );
    expect(grouped.data[0]!.actionNeededCount).toBe(0);
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

  it("counts only the open-gate job when a sibling is locked-incomplete", async () => {
    const { workOrder, jobs } = await startedWorkOrderJobs(realCompanyId, { qty: 2 });
    await completeKontrolAlatForStart(realCompanyId, jobs[0]!.id);
    await completeKontrolAlatForStart(realCompanyId, jobs[1]!.id);
    await calibrationJobsService.start(realCompanyId, jobs[0]!.id);
    await calibrationJobsService.start(realCompanyId, jobs[1]!.id);
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });

    const res = await calibrationJobsService.findAllGroupedByWorkOrder(
      realCompanyId,
      { workOrderId: workOrder.id },
      staffUserId,
    );
    const group = res.data[0]!;
    expect(group.actionNeededCount).toBe(1);
    expect(group.jobs.find((j) => j.id === jobs[0]!.id)!.actionSignals.identityIncomplete).toBe(
      false,
    );
    expect(group.jobs.find((j) => j.id === jobs[1]!.id)!.actionSignals.identityIncomplete).toBe(
      true,
    );
  });

  it("counts zero when every child is locked-incomplete", async () => {
    const { workOrder, jobs } = await startedWorkOrderJobs(realCompanyId, { qty: 2 });
    await completeKontrolAlatForStart(realCompanyId, jobs[0]!.id);
    await completeKontrolAlatForStart(realCompanyId, jobs[1]!.id);
    await calibrationJobsService.start(realCompanyId, jobs[0]!.id);
    await calibrationJobsService.start(realCompanyId, jobs[1]!.id);
    await prisma.calibrationJob.updateMany({
      where: { id: { in: [jobs[0]!.id, jobs[1]!.id] } },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });

    const res = await calibrationJobsService.findAllGroupedByWorkOrder(
      realCompanyId,
      { workOrderId: workOrder.id },
      staffUserId,
    );
    expect(res.data[0]!.actionNeededCount).toBe(0);
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

describe("CalibrationJobsService — quality review happy path", () => {
  async function inProgressJob() {
    const ctx = await startedWorkOrderJobs(realCompanyId);
    await completeKontrolAlatForStart(realCompanyId, ctx.jobs[0]!.id);
    const started = await calibrationJobsService.start(realCompanyId, ctx.jobs[0]!.id);
    return { ...ctx, job: started };
  }

  async function recordSampleMeasurement(jobId: string, deviceTypeId: string, technicianId: string) {
    const capability = await prisma.deviceCapability.create({
      data: { code: `QRHP${randomUUID().slice(0, 8)}`, name: "QR Happy Path" },
    });
    createdCapabilityIds.push(capability.id);
    const item = await prisma.deviceCapabilityItem.create({
      data: { capabilityId: capability.id, name: "QR Item" },
    });
    const param = await prisma.deviceCalibrationParameter.create({
      data: {
        deviceTypeId,
        capabilityItemId: item.id,
        code: `QRP${randomUUID().slice(0, 8).toUpperCase()}`,
        name: "QR Param",
        valueType: "NUMBER",
        toleranceMin: 0,
        toleranceMax: 100,
      },
    });
    return measurementResultsService.create(
      realCompanyId,
      {
        calibrationJobId: jobId,
        deviceCalibrationParameterId: param.id,
        replicateIndex: 1,
        measuredValue: 50,
      },
      technicianId,
    );
  }

  it("technician submit moves IN_PROGRESS to SUBMITTED and stamps submittedAt", async () => {
    const { job } = await inProgressJob();
    const before = Date.now();
    const submitted = await calibrationJobsService.submitForReview(realCompanyId, job.id);

    expect(submitted.status).toBe("SUBMITTED");
    expect(submitted.submittedAt).not.toBeNull();
    expect(submitted.submittedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(submitted.currentAttempt).toBe(1);
    expect(submitted.reviews).toEqual([]);
  });

  it("locks MeasurementResult after submit", async () => {
    const { job, deviceTypeId } = await inProgressJob();
    const technician = await makeMember(realCompanyId, "TECHNICIAN");
    const row = await recordSampleMeasurement(job.id, deviceTypeId, technician.id);
    await calibrationJobsService.submitForReview(realCompanyId, job.id);

    await expect(
      measurementResultsService.update(realCompanyId, row.id, { measuredValue: 60 }, technician.id),
    ).rejects.toMatchObject({ response: { code: "MEASUREMENT_JOB_SUBMITTED" } });
    await expect(
      measurementResultsService.create(
        realCompanyId,
        {
          calibrationJobId: job.id,
          deviceCalibrationParameterId: row.deviceCalibrationParameterId,
          replicateIndex: 2,
          measuredValue: 61,
        },
        technician.id,
      ),
    ).rejects.toMatchObject({ response: { code: "MEASUREMENT_JOB_SUBMITTED" } });
  });

  it("MT approve creates QualityReview APPROVED, does not change job status or measurements", async () => {
    const { job, deviceTypeId } = await inProgressJob();
    const technician = await makeMember(realCompanyId, "TECHNICIAN");
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    const row = await recordSampleMeasurement(job.id, deviceTypeId, technician.id);
    const submitted = await calibrationJobsService.submitForReview(realCompanyId, job.id);
    const submittedAt = submitted.submittedAt!.getTime();

    const approved = await calibrationJobsService.decideQualityReview(
      realCompanyId,
      job.id,
      manager.id,
      { decision: "APPROVE", notes: "OK" },
    );

    expect(approved.status).toBe("SUBMITTED");
    expect(approved.submittedAt!.getTime()).toBe(submittedAt);
    expect(approved.currentAttempt).toBe(1);
    expect(approved.reviews).toHaveLength(1);
    expect(approved.reviews[0]!.status).toBe("APPROVED");
    expect(approved.reviews[0]!.decision).toBe("APPROVE");
    expect(approved.reviews[0]!.reviewerUserId).toBe(manager.id);
    expect(approved.reviews[0]!.notes).toBe("OK");
    expect(approved.reviews[0]!.reviewedAt).not.toBeNull();

    const after = await prisma.measurementResult.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.measuredValue?.toNumber()).toBe(50);
    expect(after.recordedByUserId).toBe(technician.id);
  });

  it("technician cannot complete before MT approval", async () => {
    const { job } = await inProgressJob();
    await calibrationJobsService.submitForReview(realCompanyId, job.id);

    await expect(calibrationJobsService.complete(realCompanyId, job.id)).rejects.toMatchObject({
      response: { code: "QUALITY_REVIEW_NOT_APPROVED" },
    });
  });

  it("technician complete after MT approve moves SUBMITTED to ACCEPTED_BY_QA", async () => {
    const { job } = await inProgressJob();
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    await calibrationJobsService.submitForReview(realCompanyId, job.id);
    await calibrationJobsService.decideQualityReview(realCompanyId, job.id, manager.id, {
      decision: "APPROVE",
    });

    const completed = await calibrationJobsService.complete(realCompanyId, job.id);
    expect(completed.status).toBe("ACCEPTED_BY_QA");
    expect(completed.submittedAt).not.toBeNull();
    expect(completed.currentAttempt).toBe(1);
    expect(completed.reviews[0]!.status).toBe("APPROVED");
  });

  it("keeps measurements locked after ACCEPTED_BY_QA", async () => {
    const { job, deviceTypeId } = await inProgressJob();
    const technician = await makeMember(realCompanyId, "TECHNICIAN");
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    const row = await recordSampleMeasurement(job.id, deviceTypeId, technician.id);
    await calibrationJobsService.submitForReview(realCompanyId, job.id);
    await calibrationJobsService.decideQualityReview(realCompanyId, job.id, manager.id, {
      decision: "APPROVE",
    });
    await calibrationJobsService.complete(realCompanyId, job.id);

    await expect(
      measurementResultsService.update(realCompanyId, row.id, { measuredValue: 70 }, technician.id),
    ).rejects.toMatchObject({ response: { code: "MEASUREMENT_JOB_SUBMITTED" } });
  });

  it("rejects double-submit, duplicate approve, and duplicate complete", async () => {
    const { job } = await inProgressJob();
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    await calibrationJobsService.submitForReview(realCompanyId, job.id);

    await expect(
      calibrationJobsService.submitForReview(realCompanyId, job.id),
    ).rejects.toMatchObject({ response: { code: "CALIBRATION_JOB_ALREADY_SUBMITTED" } });

    await calibrationJobsService.decideQualityReview(realCompanyId, job.id, manager.id, {
      decision: "APPROVE",
    });
    await expect(
      calibrationJobsService.decideQualityReview(realCompanyId, job.id, manager.id, {
        decision: "APPROVE",
      }),
    ).rejects.toMatchObject({ response: { code: "QUALITY_REVIEW_ALREADY_APPROVED" } });

    await calibrationJobsService.complete(realCompanyId, job.id);
    await expect(calibrationJobsService.complete(realCompanyId, job.id)).rejects.toMatchObject({
      response: { code: "CALIBRATION_JOB_ALREADY_COMPLETED" },
    });
  });

  it("rejects submit from PENDING and approve from IN_PROGRESS", async () => {
    const { jobs } = await startedWorkOrderJobs(realCompanyId);
    await expect(
      calibrationJobsService.submitForReview(realCompanyId, jobs[0]!.id),
    ).rejects.toMatchObject({ response: { code: "CALIBRATION_JOB_NOT_IN_PROGRESS" } });

    const { job } = await inProgressJob();
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    await expect(
      calibrationJobsService.decideQualityReview(realCompanyId, job.id, manager.id, {
        decision: "APPROVE",
      }),
    ).rejects.toMatchObject({ response: { code: "CALIBRATION_JOB_NOT_SUBMITTED" } });
  });

  it("MT reject on the quality-decision route moves SUBMITTED to REWORK", async () => {
    const { job } = await inProgressJob();
    await calibrationJobsService.submitForReview(realCompanyId, job.id);
    const controller = new CalibrationJobsController(
      calibrationJobsService,
      measurementResultsService,
      new PhysicalCheckResultsService(),
      new KontrolAlatService(),
    );
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    const rejected = await controller.decideQualityReview(realCompanyId, manager.id, job.id, {
      decision: "REJECT",
      notes: "NIBP perlu diukur ulang",
    });
    expect(rejected.status).toBe("REWORK");
    expect(rejected.submittedAt).toBeNull();
    expect(rejected.currentAttempt).toBe(2);
    expect(rejected.reviews).toHaveLength(1);
    expect(rejected.reviews[0]!.decision).toBe("REJECT");
    expect(rejected.reviews[0]!.status).toBe("REJECTED");
  });
});

describe("CalibrationJobsService — quality review REWORK lifecycle", () => {
  async function inProgressJob() {
    const { jobs, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    await completeKontrolAlatForStart(realCompanyId, jobs[0]!.id);
    const started = await calibrationJobsService.start(realCompanyId, jobs[0]!.id);
    return { job: started, deviceTypeId };
  }

  async function recordSampleMeasurement(jobId: string, deviceTypeId: string, technicianId: string) {
    const capability = await prisma.deviceCapability.create({
      data: { code: `QRRE${randomUUID().slice(0, 8)}`, name: "QR Rework" },
    });
    createdCapabilityIds.push(capability.id);
    const item = await prisma.deviceCapabilityItem.create({
      data: { capabilityId: capability.id, name: "QR Rework Item" },
    });
    const param = await prisma.deviceCalibrationParameter.create({
      data: {
        deviceTypeId,
        capabilityItemId: item.id,
        code: `QRR${randomUUID().slice(0, 8).toUpperCase()}`,
        name: "QR Rework Param",
        valueType: "NUMBER",
        toleranceMin: 0,
        toleranceMax: 100,
      },
    });
    return measurementResultsService.create(
      realCompanyId,
      {
        calibrationJobId: jobId,
        deviceCalibrationParameterId: param.id,
        replicateIndex: 1,
        measuredValue: 50,
      },
      technicianId,
    );
  }

  it("REJECT requires notes (controller Zod)", async () => {
    const { job } = await inProgressJob();
    await calibrationJobsService.submitForReview(realCompanyId, job.id);
    const controller = new CalibrationJobsController(
      calibrationJobsService,
      measurementResultsService,
      new PhysicalCheckResultsService(),
      new KontrolAlatService(),
    );
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    await expect(
      controller.decideQualityReview(realCompanyId, manager.id, job.id, { decision: "REJECT" }),
    ).rejects.toMatchObject({ response: { code: "INVALID_QUALITY_REVIEW_DECISION" } });
    await expect(
      controller.decideQualityReview(realCompanyId, manager.id, job.id, {
        decision: "REJECT",
        notes: "   ",
      }),
    ).rejects.toMatchObject({ response: { code: "INVALID_QUALITY_REVIEW_DECISION" } });
    const stillSubmitted = await calibrationJobsService.findOne(realCompanyId, job.id);
    expect(stillSubmitted.status).toBe("SUBMITTED");
    expect(stillSubmitted.reviews).toEqual([]);
  });

  it("REJECT creates QualityReview REJECTED, clears submittedAt, increments currentAttempt once", async () => {
    const { job, deviceTypeId } = await inProgressJob();
    const technician = await makeMember(realCompanyId, "TECHNICIAN");
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    const row = await recordSampleMeasurement(job.id, deviceTypeId, technician.id);
    const submitted = await calibrationJobsService.submitForReview(realCompanyId, job.id);

    const rejected = await calibrationJobsService.decideQualityReview(
      realCompanyId,
      job.id,
      manager.id,
      { decision: "REJECT", notes: "NIBP perlu diukur ulang" },
    );

    expect(rejected.status).toBe("REWORK");
    expect(rejected.submittedAt).toBeNull();
    expect(rejected.currentAttempt).toBe(submitted.currentAttempt + 1);
    expect(rejected.reviews).toHaveLength(1);
    expect(rejected.reviews[0]!.decision).toBe("REJECT");
    expect(rejected.reviews[0]!.status).toBe("REJECTED");
    expect(rejected.reviews[0]!.reviewerUserId).toBe(manager.id);
    expect(rejected.reviews[0]!.notes).toBe("NIBP perlu diukur ulang");
    expect(rejected.reviews[0]!.reviewedAt).not.toBeNull();

    const after = await prisma.measurementResult.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.measuredValue?.toNumber()).toBe(50);
    expect(after.attemptNumber).toBe(1);
  });

  it("REJECT from IN_PROGRESS is rejected; sequential double REJECT is rejected", async () => {
    const { job } = await inProgressJob();
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    await expect(
      calibrationJobsService.decideQualityReview(realCompanyId, job.id, manager.id, {
        decision: "REJECT",
        notes: "too early",
      }),
    ).rejects.toMatchObject({ response: { code: "CALIBRATION_JOB_NOT_SUBMITTED" } });

    await calibrationJobsService.submitForReview(realCompanyId, job.id);
    await calibrationJobsService.decideQualityReview(realCompanyId, job.id, manager.id, {
      decision: "REJECT",
      notes: "first reject",
    });
    await expect(
      calibrationJobsService.decideQualityReview(realCompanyId, job.id, manager.id, {
        decision: "REJECT",
        notes: "second reject",
      }),
    ).rejects.toMatchObject({ response: { code: "CALIBRATION_JOB_NOT_SUBMITTED" } });
    const after = await calibrationJobsService.findOne(realCompanyId, job.id);
    expect(after.status).toBe("REWORK");
    expect(after.currentAttempt).toBe(2);
  });

  it("resumeAfterRework moves REWORK to IN_PROGRESS without incrementing currentAttempt", async () => {
    const { job } = await inProgressJob();
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    await calibrationJobsService.submitForReview(realCompanyId, job.id);
    const rejected = await calibrationJobsService.decideQualityReview(
      realCompanyId,
      job.id,
      manager.id,
      { decision: "REJECT", notes: "fix NIBP" },
    );
    expect(rejected.currentAttempt).toBe(2);
    expect(rejected.startedAt).not.toBeNull();

    const resumed = await calibrationJobsService.resumeAfterRework(realCompanyId, job.id);
    expect(resumed.status).toBe("IN_PROGRESS");
    expect(resumed.currentAttempt).toBe(2);
    expect(resumed.submittedAt).toBeNull();
    expect(resumed.startedAt!.getTime()).toBe(rejected.startedAt!.getTime());
    expect(resumed.reviews[0]!.status).toBe("REJECTED");
  });

  it("resume from SUBMITTED is rejected; duplicate resume is rejected", async () => {
    const { job } = await inProgressJob();
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    await calibrationJobsService.submitForReview(realCompanyId, job.id);
    await expect(calibrationJobsService.resumeAfterRework(realCompanyId, job.id)).rejects.toMatchObject(
      { response: { code: "CALIBRATION_JOB_NOT_IN_REWORK" } },
    );

    await calibrationJobsService.decideQualityReview(realCompanyId, job.id, manager.id, {
      decision: "REJECT",
      notes: "fix",
    });
    await calibrationJobsService.resumeAfterRework(realCompanyId, job.id);
    await expect(calibrationJobsService.resumeAfterRework(realCompanyId, job.id)).rejects.toMatchObject(
      { response: { code: "CALIBRATION_JOB_NOT_IN_REWORK" } },
    );
  });

  it("REWORK cannot submitForReview or complete", async () => {
    const { job } = await inProgressJob();
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    await calibrationJobsService.submitForReview(realCompanyId, job.id);
    await calibrationJobsService.decideQualityReview(realCompanyId, job.id, manager.id, {
      decision: "REJECT",
      notes: "fix",
    });

    await expect(calibrationJobsService.submitForReview(realCompanyId, job.id)).rejects.toMatchObject({
      response: { code: "CALIBRATION_JOB_NOT_IN_PROGRESS" },
    });
    await expect(calibrationJobsService.complete(realCompanyId, job.id)).rejects.toMatchObject({
      response: { code: "CALIBRATION_JOB_NOT_SUBMITTED" },
    });
  });

  it("denies MeasurementResult create/update/delete while REWORK; allows create after resume on the new attempt", async () => {
    const { job, deviceTypeId } = await inProgressJob();
    const technician = await makeMember(realCompanyId, "TECHNICIAN");
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    const row = await recordSampleMeasurement(job.id, deviceTypeId, technician.id);
    await calibrationJobsService.submitForReview(realCompanyId, job.id);
    await calibrationJobsService.decideQualityReview(realCompanyId, job.id, manager.id, {
      decision: "REJECT",
      notes: "ukur ulang",
    });

    await expect(
      measurementResultsService.create(
        realCompanyId,
        {
          calibrationJobId: job.id,
          deviceCalibrationParameterId: row.deviceCalibrationParameterId,
          replicateIndex: 2,
          measuredValue: 55,
        },
        technician.id,
      ),
    ).rejects.toMatchObject({ response: { code: "MEASUREMENT_JOB_NOT_IN_PROGRESS" } });
    await expect(
      measurementResultsService.update(realCompanyId, row.id, { measuredValue: 60 }, technician.id),
    ).rejects.toMatchObject({ response: { code: "MEASUREMENT_ATTEMPT_SUPERSEDED" } });
    await expect(measurementResultsService.remove(realCompanyId, row.id)).rejects.toMatchObject({
      response: { code: "MEASUREMENT_ATTEMPT_SUPERSEDED" },
    });

    await calibrationJobsService.resumeAfterRework(realCompanyId, job.id);
    const attempt2 = await measurementResultsService.create(
      realCompanyId,
      {
        calibrationJobId: job.id,
        deviceCalibrationParameterId: row.deviceCalibrationParameterId,
        replicateIndex: 1,
        measuredValue: 52,
      },
      technician.id,
    );
    expect(attempt2.attemptNumber).toBe(2);

    await expect(
      measurementResultsService.update(realCompanyId, row.id, { measuredValue: 70 }, technician.id),
    ).rejects.toMatchObject({ response: { code: "MEASUREMENT_ATTEMPT_SUPERSEDED" } });
    await expect(measurementResultsService.remove(realCompanyId, row.id)).rejects.toMatchObject({
      response: { code: "MEASUREMENT_ATTEMPT_SUPERSEDED" },
    });

    await calibrationJobsService.submitForReview(realCompanyId, job.id);
    await expect(
      measurementResultsService.update(
        realCompanyId,
        attempt2.id,
        { measuredValue: 53 },
        technician.id,
      ),
    ).rejects.toMatchObject({ response: { code: "MEASUREMENT_JOB_SUBMITTED" } });
  });

  it("supports two REJECT cycles then APPROVE and complete; QualityReview history is append-only", async () => {
    const { job, deviceTypeId } = await inProgressJob();
    const technician = await makeMember(realCompanyId, "TECHNICIAN");
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    const first = await recordSampleMeasurement(job.id, deviceTypeId, technician.id);

    await calibrationJobsService.submitForReview(realCompanyId, job.id);
    const reject1 = await calibrationJobsService.decideQualityReview(
      realCompanyId,
      job.id,
      manager.id,
      { decision: "REJECT", notes: "NIBP perlu diukur ulang" },
    );
    const reject1Id = reject1.reviews[0]!.id;
    expect(reject1.currentAttempt).toBe(2);

    await calibrationJobsService.resumeAfterRework(realCompanyId, job.id);
    await measurementResultsService.create(
      realCompanyId,
      {
        calibrationJobId: job.id,
        deviceCalibrationParameterId: first.deviceCalibrationParameterId,
        replicateIndex: 1,
        measuredValue: 51,
      },
      technician.id,
    );
    await calibrationJobsService.submitForReview(realCompanyId, job.id);
    const reject2 = await calibrationJobsService.decideQualityReview(
      realCompanyId,
      job.id,
      manager.id,
      { decision: "REJECT", notes: "SpO2 perlu diperiksa" },
    );
    const reject2Id = reject2.reviews[0]!.id;
    expect(reject2.currentAttempt).toBe(3);
    expect(reject2Id).not.toBe(reject1Id);

    await calibrationJobsService.resumeAfterRework(realCompanyId, job.id);
    await measurementResultsService.create(
      realCompanyId,
      {
        calibrationJobId: job.id,
        deviceCalibrationParameterId: first.deviceCalibrationParameterId,
        replicateIndex: 1,
        measuredValue: 52,
      },
      technician.id,
    );
    await calibrationJobsService.submitForReview(realCompanyId, job.id);
    const approved = await calibrationJobsService.decideQualityReview(
      realCompanyId,
      job.id,
      manager.id,
      { decision: "APPROVE", notes: "OK" },
    );
    expect(approved.status).toBe("SUBMITTED");
    expect(approved.submittedAt).not.toBeNull();
    expect(approved.currentAttempt).toBe(3);
    expect(approved.reviews[0]!.status).toBe("APPROVED");

    const completed = await calibrationJobsService.complete(realCompanyId, job.id);
    expect(completed.status).toBe("ACCEPTED_BY_QA");
    expect(completed.currentAttempt).toBe(3);

    const history = await prisma.qualityReview.findMany({
      where: { companyId: realCompanyId, calibrationJobId: job.id },
      orderBy: { createdAt: "asc" },
    });
    expect(history).toHaveLength(3);
    expect(history.map((r) => r.decision)).toEqual(["REJECT", "REJECT", "APPROVE"]);
    expect(history.map((r) => r.notes)).toEqual([
      "NIBP perlu diukur ulang",
      "SpO2 perlu diperiksa",
      "OK",
    ]);
    expect(history[0]!.id).toBe(reject1Id);
    expect(history[1]!.id).toBe(reject2Id);
    expect(history[0]!.notes).toBe("NIBP perlu diukur ulang");
  });

  it("concurrent REJECT increments currentAttempt exactly once", async () => {
    const { job } = await inProgressJob();
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    await calibrationJobsService.submitForReview(realCompanyId, job.id);

    const results = await Promise.allSettled([
      calibrationJobsService.decideQualityReview(realCompanyId, job.id, manager.id, {
        decision: "REJECT",
        notes: "concurrent A",
      }),
      calibrationJobsService.decideQualityReview(realCompanyId, job.id, manager.id, {
        decision: "REJECT",
        notes: "concurrent B",
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const after = await calibrationJobsService.findOne(realCompanyId, job.id);
    expect(after.status).toBe("REWORK");
    expect(after.currentAttempt).toBe(2);
    const reviews = await prisma.qualityReview.count({
      where: { companyId: realCompanyId, calibrationJobId: job.id },
    });
    expect(reviews).toBe(1);
  });

  it("concurrent resume cannot both succeed", async () => {
    const { job } = await inProgressJob();
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    await calibrationJobsService.submitForReview(realCompanyId, job.id);
    await calibrationJobsService.decideQualityReview(realCompanyId, job.id, manager.id, {
      decision: "REJECT",
      notes: "fix",
    });

    const results = await Promise.allSettled([
      calibrationJobsService.resumeAfterRework(realCompanyId, job.id),
      calibrationJobsService.resumeAfterRework(realCompanyId, job.id),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const after = await calibrationJobsService.findOne(realCompanyId, job.id);
    expect(after.status).toBe("IN_PROGRESS");
    expect(after.currentAttempt).toBe(2);
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

    await expect(guard.canActivate(contextFor("replaceReferenceEquipmentUsed"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("allows a TECHNICIAN to submit a reference-equipment approval", async () => {
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    getSessionMock.mockResolvedValueOnce({ user: { id: tech.id, email: "rea-t@x.co" } });
    await expect(guard.canActivate(contextFor("submitReferenceEquipmentApproval"))).resolves.toBe(
      true,
    );
  });

  it("blocks a TECHNICIAN from deciding a reference-equipment approval (403)", async () => {
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    getSessionMock.mockResolvedValueOnce({ user: { id: tech.id, email: "rea-td@x.co" } });
    await expect(
      guard.canActivate(contextFor("decideReferenceEquipmentApproval")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows a TECHNICIAN_MANAGER to decide a reference-equipment approval", async () => {
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    getSessionMock.mockResolvedValueOnce({ user: { id: manager.id, email: "rea-m@x.co" } });
    await expect(guard.canActivate(contextFor("decideReferenceEquipmentApproval"))).resolves.toBe(
      true,
    );
  });

  it("blocks ADMIN from deciding a reference-equipment approval (403)", async () => {
    const admin = await makeMember(realCompanyId, "ADMIN");
    getSessionMock.mockResolvedValueOnce({ user: { id: admin.id, email: "rea-a@x.co" } });
    await expect(
      guard.canActivate(contextFor("decideReferenceEquipmentApproval")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows a TECHNICIAN to submit for review, resume after rework, and complete", async () => {
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    getSessionMock.mockResolvedValueOnce({ user: { id: tech.id, email: "sub-t@x.co" } });
    await expect(guard.canActivate(contextFor("submitForReview"))).resolves.toBe(true);
    getSessionMock.mockResolvedValueOnce({ user: { id: tech.id, email: "res-t@x.co" } });
    await expect(guard.canActivate(contextFor("resumeAfterRework"))).resolves.toBe(true);
    getSessionMock.mockResolvedValueOnce({ user: { id: tech.id, email: "sub-t@x.co" } });
    await expect(guard.canActivate(contextFor("complete"))).resolves.toBe(true);
  });

  it("blocks a TECHNICIAN from quality-decision (403)", async () => {
    const tech = await makeMember(realCompanyId, "TECHNICIAN");
    getSessionMock.mockResolvedValueOnce({ user: { id: tech.id, email: "qd-t@x.co" } });
    await expect(guard.canActivate(contextFor("decideQualityReview"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("allows a TECHNICIAN_MANAGER to decide quality review", async () => {
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    getSessionMock.mockResolvedValueOnce({ user: { id: manager.id, email: "qd-m@x.co" } });
    await expect(guard.canActivate(contextFor("decideQualityReview"))).resolves.toBe(true);
  });

  it("blocks a TECHNICIAN_MANAGER from submit, complete, resume, and recordMeasurement", async () => {
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    getSessionMock.mockResolvedValueOnce({ user: { id: manager.id, email: "mt-sub@x.co" } });
    await expect(guard.canActivate(contextFor("submitForReview"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    getSessionMock.mockResolvedValueOnce({ user: { id: manager.id, email: "mt-cmp@x.co" } });
    await expect(guard.canActivate(contextFor("complete"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    getSessionMock.mockResolvedValueOnce({ user: { id: manager.id, email: "mt-res@x.co" } });
    await expect(guard.canActivate(contextFor("resumeAfterRework"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    getSessionMock.mockResolvedValueOnce({ user: { id: manager.id, email: "mt-rec@x.co" } });
    await expect(guard.canActivate(contextFor("createMeasurementResult"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("blocks ADMIN from quality-decision (403)", async () => {
    const admin = await makeMember(realCompanyId, "ADMIN");
    getSessionMock.mockResolvedValueOnce({ user: { id: admin.id, email: "qd-a@x.co" } });
    await expect(guard.canActivate(contextFor("decideQualityReview"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("blocks FINANCE from submit / quality-decision / complete (403)", async () => {
    const finance = await makeMember(realCompanyId, "FINANCE");
    getSessionMock.mockResolvedValueOnce({ user: { id: finance.id, email: "f-sub@x.co" } });
    await expect(guard.canActivate(contextFor("submitForReview"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    getSessionMock.mockResolvedValueOnce({ user: { id: finance.id, email: "f-qd@x.co" } });
    await expect(guard.canActivate(contextFor("decideQualityReview"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    getSessionMock.mockResolvedValueOnce({ user: { id: finance.id, email: "f-cmp@x.co" } });
    await expect(guard.canActivate(contextFor("complete"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
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

describe("CalibrationJobsService — Measurement Parameters (Stage A, Pattern A)", () => {
  const createdCapabilityIds: string[] = [];
  const createdParamDeviceTypeIds: string[] = [];

  async function capabilityItem() {
    const capability = await prisma.deviceCapability.create({
      data: { code: `MPCAP-${randomUUID().slice(0, 8).toUpperCase()}`, name: "MP Capability" },
    });
    createdCapabilityIds.push(capability.id);
    const item = await prisma.deviceCapabilityItem.create({
      data: { capabilityId: capability.id, name: "MP Item" },
    });
    return item.id;
  }

  afterAll(async () => {
    if (createdParamDeviceTypeIds.length > 0) {
      await prisma.jobCalibrationTestPoint.deleteMany({
        where: { parameter: { deviceTypeId: { in: createdParamDeviceTypeIds } } },
      });
      await prisma.calibrationTestPoint.deleteMany({
        where: { parameter: { deviceTypeId: { in: createdParamDeviceTypeIds } } },
      });
      await prisma.deviceTypeCapabilityOrder.deleteMany({
        where: { deviceTypeId: { in: createdParamDeviceTypeIds } },
      });
      await prisma.deviceCalibrationParameter.deleteMany({
        where: { deviceTypeId: { in: createdParamDeviceTypeIds } },
      });
    }
    if (createdCapabilityIds.length > 0) {
      await prisma.deviceCapabilityItem.deleteMany({
        where: { capabilityId: { in: createdCapabilityIds } },
      });
      await prisma.deviceCapability.deleteMany({ where: { id: { in: createdCapabilityIds } } });
    }
  });

  it("returns only NUMBER, DIRECT_REPLICATES, active, test-point-free parameters for the job's resolved device type", async () => {
    const { jobs, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    createdParamDeviceTypeIds.push(deviceTypeId);
    const capabilityItemId = await capabilityItem();

    const base = { deviceTypeId, capabilityItemId };
    const patternA = await prisma.deviceCalibrationParameter.create({
      data: { ...base, code: "MP_A", name: "Illuminance", valueType: "NUMBER", toleranceMin: 15000, toleranceNote: ">15.000 lux", sortOrder: 10 },
    });
    // excluded: has a test point (Pattern B)
    const withPoint = await prisma.deviceCalibrationParameter.create({
      data: { ...base, code: "MP_B", name: "Sweep", valueType: "NUMBER", sortOrder: 20 },
    });
    await prisma.calibrationTestPoint.create({
      data: { deviceCalibrationParameterId: withPoint.id, sequence: 1, settingLabel: "10", settingValue: 10 },
    });
    // excluded: non-NUMBER
    await prisma.deviceCalibrationParameter.create({
      data: { ...base, code: "MP_R", name: "Ratio", valueType: "RATIO", uomId: null, sortOrder: 30 },
    });
    // excluded: inactive
    await prisma.deviceCalibrationParameter.create({
      data: { ...base, code: "MP_I", name: "Inactive", valueType: "NUMBER", isActive: false, sortOrder: 40 },
    });

    const result = await calibrationJobsService.listMeasurementParameters(realCompanyId, jobs[0]!.id);

    expect(result.deviceType?.id).toBe(deviceTypeId);
    expect(result.parameters.map((p) => p.code)).toEqual(["MP_A"]);
    expect(result.parameters[0]).toMatchObject({
      id: patternA.id,
      // decimalPlaces passes through verbatim — read, never defaulted here
      // (placeholder 0 in pkmdb; NULL for a freshly-created test row).
      decimalPlaces: null,
      toleranceMin: "15000",
      toleranceNote: ">15.000 lux",
      capabilityItemName: "MP Item",
      capabilityName: "MP Capability",
    });
    expect(result.gridParameters.map((p) => p.code)).toEqual(["MP_B"]);
    expect(result.gridParameters[0]?.testPoints).toEqual([
      expect.objectContaining({ sequence: 1, settingLabel: "10", settingValue: "10" }),
    ]);
    expect(result.capabilityGroups).toHaveLength(1);
    expect(result.capabilityGroups[0]?.parameters.map((p) => p.code)).toEqual(["MP_A", "MP_B"]);
    expect(result.capabilityGroups[0]?.parameters.map((p) => p.kind)).toEqual(["DIRECT", "GRID"]);
  });

  it("excludes NUMBER + active + zero-test-point rows whose entryStyle is LOGGER_SUMMARY", async () => {
    const { jobs, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    createdParamDeviceTypeIds.push(deviceTypeId);
    const capabilityItemId = await capabilityItem();
    const base = { deviceTypeId, capabilityItemId };

    const patternA = await prisma.deviceCalibrationParameter.create({
      data: { ...base, code: "MP_A2", name: "Illuminance", valueType: "NUMBER", sortOrder: 10 },
    });
    // BBR_STORAGE_TEMP-style leak: NUMBER, active, no CalibrationTestPoint
    // children — Stage A used to include this until entryStyle was added.
    await prisma.deviceCalibrationParameter.create({
      data: {
        ...base,
        code: "BBR_STORAGE_TEMP_STYLE",
        name: "Keseragaman Suhu Penyimpanan",
        valueType: "NUMBER",
        entryStyle: "LOGGER_SUMMARY",
        sortOrder: 20,
      },
    });

    const result = await calibrationJobsService.listMeasurementParameters(realCompanyId, jobs[0]!.id);

    expect(result.parameters.map((p) => p.code)).toEqual([patternA.code]);
    expect(result.parameters.some((p) => p.code === "BBR_STORAGE_TEMP_STYLE")).toBe(false);
    expect(result.gridParameters.some((p) => p.code === "BBR_STORAGE_TEMP_STYLE")).toBe(false);
    expect(
      result.capabilityGroups.flatMap((g) => g.parameters).some((p) => p.code === "BBR_STORAGE_TEMP_STYLE"),
    ).toBe(false);
  });

  it("puts Pattern B rows in gridParameters and keeps LOGGER_SUMMARY out even when they have test points", async () => {
    const { jobs, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    createdParamDeviceTypeIds.push(deviceTypeId);
    const capabilityItemId = await capabilityItem();
    const base = { deviceTypeId, capabilityItemId };

    const patternB = await prisma.deviceCalibrationParameter.create({
      data: { ...base, code: "MP_GRID", name: "Heart Rate", valueType: "NUMBER", sortOrder: 10 },
    });
    const tpA = await prisma.calibrationTestPoint.create({
      data: {
        deviceCalibrationParameterId: patternB.id,
        sequence: 1,
        settingLabel: "30 BPM",
        settingValue: 30,
      },
    });
    await prisma.calibrationTestPoint.create({
      data: {
        deviceCalibrationParameterId: patternB.id,
        sequence: 2,
        settingLabel: "60 BPM",
        settingValue: 60,
        isActive: false,
      },
    });

    const loggerWithPoint = await prisma.deviceCalibrationParameter.create({
      data: {
        ...base,
        code: "LOGGER_WITH_POINT",
        name: "Logger leak",
        valueType: "NUMBER",
        entryStyle: "LOGGER_SUMMARY",
        sortOrder: 20,
      },
    });
    await prisma.calibrationTestPoint.create({
      data: {
        deviceCalibrationParameterId: loggerWithPoint.id,
        sequence: 1,
        settingLabel: "T1",
        settingValue: 4,
      },
    });

    const suction = await prisma.deviceCalibrationParameter.create({
      data: {
        ...base,
        code: "SUCT_VACUUM_GAUGE",
        name: "Vacuum gauge",
        valueType: "NUMBER",
        sortOrder: 30,
      },
    });
    await prisma.calibrationTestPoint.create({
      data: {
        deviceCalibrationParameterId: suction.id,
        sequence: 1,
        settingLabel: "Titik ukur 1",
        settingValue: null,
      },
    });

    const result = await calibrationJobsService.listMeasurementParameters(realCompanyId, jobs[0]!.id);

    expect(result.parameters.map((p) => p.code)).toEqual([]);
    expect(result.gridParameters.map((p) => p.code)).toEqual(["MP_GRID"]);
    expect(result.gridParameters[0]?.testPoints).toEqual([
      expect.objectContaining({
        id: tpA.id,
        sequence: 1,
        settingLabel: "30 BPM",
        settingValue: "30",
      }),
    ]);
    expect(result.gridParameters.some((p) => p.code === "LOGGER_WITH_POINT")).toBe(false);
    expect(result.gridParameters.some((p) => p.code === "SUCT_VACUUM_GAUGE")).toBe(false);
    expect(result.capabilityGroups.map((g) => g.parameters.map((p) => p.code))).toEqual([["MP_GRID"]]);
    expect(result.capabilityGroups[0]?.parameters[0]?.kind).toBe("GRID");
  });

  it("groups by capability id/code with configured capability and parameter order, mixing DIRECT and GRID", async () => {
    const { jobs, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    createdParamDeviceTypeIds.push(deviceTypeId);

    // Names reverse the configured order so alphabetical grouping would fail.
    const laterCap = await prisma.deviceCapability.create({
      data: { code: `MPCAP-${randomUUID().slice(0, 8).toUpperCase()}`, name: "A Safety" },
    });
    const earlierCap = await prisma.deviceCapability.create({
      data: { code: `MPCAP-${randomUUID().slice(0, 8).toUpperCase()}`, name: "Z Environment" },
    });
    const sameNameA = await prisma.deviceCapability.create({
      data: { code: `MPCAP-${randomUUID().slice(0, 8).toUpperCase()}`, name: "Shared Label" },
    });
    const sameNameB = await prisma.deviceCapability.create({
      data: { code: `MPCAP-${randomUUID().slice(0, 8).toUpperCase()}`, name: "Shared Label" },
    });
    createdCapabilityIds.push(laterCap.id, earlierCap.id, sameNameA.id, sameNameB.id);

    const laterItem = await prisma.deviceCapabilityItem.create({
      data: { capabilityId: laterCap.id, name: "Safety Item" },
    });
    const earlierItem = await prisma.deviceCapabilityItem.create({
      data: { capabilityId: earlierCap.id, name: "Env Item" },
    });
    const sameItemA = await prisma.deviceCapabilityItem.create({
      data: { capabilityId: sameNameA.id, name: "Item A" },
    });
    const sameItemB = await prisma.deviceCapabilityItem.create({
      data: { capabilityId: sameNameB.id, name: "Item B" },
    });

    await prisma.deviceTypeCapabilityOrder.createMany({
      data: [
        { deviceTypeId, capabilityId: earlierCap.id, sortOrder: 10 },
        { deviceTypeId, capabilityId: laterCap.id, sortOrder: 20 },
        { deviceTypeId, capabilityId: sameNameA.id, sortOrder: 30 },
        { deviceTypeId, capabilityId: sameNameB.id, sortOrder: 40 },
      ],
    });

    const envGrid = await prisma.deviceCalibrationParameter.create({
      data: {
        deviceTypeId,
        capabilityItemId: earlierItem.id,
        code: "ENV_GRID",
        name: "Zebra Sweep",
        valueType: "NUMBER",
        sortOrder: 10,
      },
    });
    await prisma.calibrationTestPoint.create({
      data: {
        deviceCalibrationParameterId: envGrid.id,
        sequence: 2,
        settingLabel: "60",
        settingValue: 60,
      },
    });
    await prisma.calibrationTestPoint.create({
      data: {
        deviceCalibrationParameterId: envGrid.id,
        sequence: 1,
        settingLabel: "30",
        settingValue: 30,
      },
    });
    await prisma.deviceCalibrationParameter.create({
      data: {
        deviceTypeId,
        capabilityItemId: earlierItem.id,
        code: "ENV_DIRECT",
        name: "Alpha Suhu",
        valueType: "NUMBER",
        sortOrder: 20,
      },
    });
    await prisma.deviceCalibrationParameter.create({
      data: {
        deviceTypeId,
        capabilityItemId: laterItem.id,
        code: "SAFETY_DIRECT",
        name: "Resistansi Isolasi",
        valueType: "NUMBER",
        sortOrder: 10,
      },
    });
    const safetyGrid = await prisma.deviceCalibrationParameter.create({
      data: {
        deviceTypeId,
        capabilityItemId: laterItem.id,
        code: "SAFETY_GRID",
        name: "Heart Rate",
        valueType: "NUMBER",
        sortOrder: 20,
      },
    });
    await prisma.calibrationTestPoint.create({
      data: {
        deviceCalibrationParameterId: safetyGrid.id,
        sequence: 1,
        settingLabel: "30 BPM",
        settingValue: 30,
      },
    });
    await prisma.deviceCalibrationParameter.create({
      data: {
        deviceTypeId,
        capabilityItemId: sameItemA.id,
        code: "SHARED_A",
        name: "Param A",
        valueType: "NUMBER",
        sortOrder: 10,
      },
    });
    await prisma.deviceCalibrationParameter.create({
      data: {
        deviceTypeId,
        capabilityItemId: sameItemB.id,
        code: "SHARED_B",
        name: "Param B",
        valueType: "NUMBER",
        sortOrder: 10,
      },
    });
    await prisma.deviceCalibrationParameter.create({
      data: {
        deviceTypeId,
        capabilityItemId: earlierItem.id,
        code: "ENV_LOGGER",
        name: "Logger leak",
        valueType: "NUMBER",
        entryStyle: "LOGGER_SUMMARY",
        sortOrder: 30,
      },
    });

    const result = await calibrationJobsService.listMeasurementParameters(realCompanyId, jobs[0]!.id);

    expect(result.parameters.map((p) => p.code).sort()).toEqual(
      ["ENV_DIRECT", "SAFETY_DIRECT", "SHARED_A", "SHARED_B"].sort(),
    );
    expect(result.gridParameters.map((p) => p.code).sort()).toEqual(["ENV_GRID", "SAFETY_GRID"].sort());

    expect(result.capabilityGroups.map((g) => g.capability.id)).toEqual([
      earlierCap.id,
      laterCap.id,
      sameNameA.id,
      sameNameB.id,
    ]);
    expect(result.capabilityGroups.map((g) => g.capability.code)).toEqual([
      earlierCap.code,
      laterCap.code,
      sameNameA.code,
      sameNameB.code,
    ]);
    expect(result.capabilityGroups.map((g) => g.sortOrder)).toEqual([10, 20, 30, 40]);
    expect(result.capabilityGroups.filter((g) => g.capability.name === "Shared Label")).toHaveLength(2);

    expect(result.capabilityGroups[0]).toMatchObject({
      capability: { id: earlierCap.id, name: "Z Environment" },
      parameters: [
        { code: "ENV_GRID", kind: "GRID" },
        { code: "ENV_DIRECT", kind: "DIRECT" },
      ],
    });
    expect(result.capabilityGroups[0]?.parameters[0]?.testPoints.map((tp) => tp.sequence)).toEqual([1, 2]);
    expect(result.capabilityGroups[0]?.parameters[0]?.testPoints.map((tp) => tp.settingLabel)).toEqual(["30", "60"]);
    expect(result.capabilityGroups[0]?.parameters[1]?.testPoints).toEqual([]);

    expect(result.capabilityGroups[1]?.parameters.map((p) => ({ code: p.code, kind: p.kind }))).toEqual([
      { code: "SAFETY_DIRECT", kind: "DIRECT" },
      { code: "SAFETY_GRID", kind: "GRID" },
    ]);
    expect(result.capabilityGroups[2]?.parameters.map((p) => p.code)).toEqual(["SHARED_A"]);
    expect(result.capabilityGroups[3]?.parameters.map((p) => p.code)).toEqual(["SHARED_B"]);
    expect(result.capabilityGroups.flatMap((g) => g.parameters).some((p) => p.code === "ENV_LOGGER")).toBe(false);
  });
});

describe("CalibrationJobsService — JobCalibrationTestPoint snapshot", () => {
  const createdCapabilityIds: string[] = [];
  const createdParamDeviceTypeIds: string[] = [];

  async function capabilityItem() {
    const capability = await prisma.deviceCapability.create({
      data: { code: `SNAPCAP-${randomUUID().slice(0, 8).toUpperCase()}`, name: "Snap Capability" },
    });
    createdCapabilityIds.push(capability.id);
    const item = await prisma.deviceCapabilityItem.create({
      data: { capabilityId: capability.id, name: "Snap Item" },
    });
    return item.id;
  }

  afterAll(async () => {
    if (createdParamDeviceTypeIds.length > 0) {
      await prisma.jobCalibrationTestPoint.deleteMany({
        where: { parameter: { deviceTypeId: { in: createdParamDeviceTypeIds } } },
      });
      await prisma.calibrationTestPoint.deleteMany({
        where: { parameter: { deviceTypeId: { in: createdParamDeviceTypeIds } } },
      });
      await prisma.deviceTypeCapabilityOrder.deleteMany({
        where: { deviceTypeId: { in: createdParamDeviceTypeIds } },
      });
      await prisma.deviceCalibrationParameter.deleteMany({
        where: { deviceTypeId: { in: createdParamDeviceTypeIds } },
      });
    }
    if (createdCapabilityIds.length > 0) {
      await prisma.deviceCapabilityItem.deleteMany({
        where: { capabilityId: { in: createdCapabilityIds } },
      });
      await prisma.deviceCapability.deleteMany({ where: { id: { in: createdCapabilityIds } } });
    }
  });

  it("PENDING Pattern A catalog: start copies zero test points and lists Pattern A", async () => {
    const { jobs, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    createdParamDeviceTypeIds.push(deviceTypeId);
    const capabilityItemId = await capabilityItem();
    await prisma.deviceCalibrationParameter.create({
      data: {
        deviceTypeId,
        capabilityItemId,
        code: "SNAP_A",
        name: "Room temp",
        valueType: "NUMBER",
        sortOrder: 10,
      },
    });

    const pending = await calibrationJobsService.listMeasurementParameters(realCompanyId, jobs[0]!.id);
    expect(pending.parameters.map((p) => p.code)).toEqual(["SNAP_A"]);
    expect(pending.gridParameters).toEqual([]);

    await completeKontrolAlatForStart(realCompanyId, jobs[0]!.id);
    await calibrationJobsService.start(realCompanyId, jobs[0]!.id);

    const snaps = await prisma.jobCalibrationTestPoint.findMany({
      where: { calibrationJobId: jobs[0]!.id },
    });
    expect(snaps).toHaveLength(0);
    const job = await prisma.calibrationJob.findUniqueOrThrow({ where: { id: jobs[0]!.id } });
    expect(job.measurementTestPointsSnapshottedAt).not.toBeNull();

    const started = await calibrationJobsService.listMeasurementParameters(realCompanyId, jobs[0]!.id);
    expect(started.parameters.map((p) => p.code)).toEqual(["SNAP_A"]);
    expect(started.gridParameters).toEqual([]);
  });

  it("PENDING Pattern B catalog: start copies named test points", async () => {
    const { jobs, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    createdParamDeviceTypeIds.push(deviceTypeId);
    const capabilityItemId = await capabilityItem();
    const param = await prisma.deviceCalibrationParameter.create({
      data: {
        deviceTypeId,
        capabilityItemId,
        code: "SNAP_B",
        name: "Env",
        valueType: "NUMBER",
        sortOrder: 10,
      },
    });
    await prisma.calibrationTestPoint.createMany({
      data: [
        { deviceCalibrationParameterId: param.id, sequence: 1, settingLabel: "Awal" },
        { deviceCalibrationParameterId: param.id, sequence: 2, settingLabel: "Akhir" },
      ],
    });

    await completeKontrolAlatForStart(realCompanyId, jobs[0]!.id);
    await calibrationJobsService.start(realCompanyId, jobs[0]!.id);

    const snaps = await prisma.jobCalibrationTestPoint.findMany({
      where: { calibrationJobId: jobs[0]!.id },
      orderBy: { sequence: "asc" },
    });
    expect(snaps.map((s) => s.settingLabel)).toEqual(["Awal", "Akhir"]);

    const listed = await calibrationJobsService.listMeasurementParameters(realCompanyId, jobs[0]!.id);
    expect(listed.parameters).toEqual([]);
    expect(listed.gridParameters.map((p) => p.code)).toEqual(["SNAP_B"]);
    expect(listed.gridParameters[0]?.testPoints.map((tp) => tp.settingLabel)).toEqual(["Awal", "Akhir"]);
  });

  // ── Phase 4A (Gap A) — multiple measured quantities in one logical test ────
  // Catalog/presentation grouping only: each quantity stays its own parameter,
  // MeasurementResult identity is untouched, and an ungrouped catalog is
  // returned in exactly the order it had before.

  it("returns the quantities of one logical test contiguously and in declared order", async () => {
    const { jobs, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    createdParamDeviceTypeIds.push(deviceTypeId);
    const capabilityItemId = await capabilityItem();
    const base = { deviceTypeId, capabilityItemId, valueType: "NUMBER" as const };

    // sortOrder deliberately interleaves the logical test with unrelated rows,
    // and declares the quantities out of order, so contiguity + ordering can
    // only come from logicalTestKey/logicalTestSequence.
    await prisma.deviceCalibrationParameter.create({
      data: { ...base, code: "LT_FIRST", name: "Kolimasi", sortOrder: 10 },
    });
    await prisma.deviceCalibrationParameter.create({
      data: {
        ...base,
        code: "LT_MGY",
        name: "Reproduksibilitas mGy",
        sortOrder: 20,
        logicalTestKey: "dxray-repro",
        logicalTestSequence: 3,
      },
    });
    await prisma.deviceCalibrationParameter.create({
      data: { ...base, code: "LT_MID", name: "HVL", sortOrder: 30 },
    });
    await prisma.deviceCalibrationParameter.create({
      data: {
        ...base,
        code: "LT_KV",
        name: "Reproduksibilitas kV",
        sortOrder: 40,
        logicalTestKey: "dxray-repro",
        logicalTestSequence: 1,
      },
    });
    await prisma.deviceCalibrationParameter.create({
      data: {
        ...base,
        code: "LT_S",
        name: "Reproduksibilitas s",
        sortOrder: 50,
        logicalTestKey: "dxray-repro",
        logicalTestSequence: 2,
      },
    });

    const listed = await calibrationJobsService.listMeasurementParameters(realCompanyId, jobs[0]!.id);

    expect(listed.parameters.map((p) => p.code)).toEqual([
      "LT_FIRST",
      "LT_KV",
      "LT_S",
      "LT_MGY",
      "LT_MID",
    ]);
    expect(listed.capabilityGroups[0]?.parameters.map((p) => p.code)).toEqual([
      "LT_FIRST",
      "LT_KV",
      "LT_S",
      "LT_MGY",
      "LT_MID",
    ]);
    expect(listed.parameters.map((p) => p.logicalTestSequence)).toEqual([null, 1, 2, 3, null]);
    expect(listed.parameters[1]?.logicalTestKey).toBe("dxray-repro");
    expect(listed.parameters[0]?.logicalTestKey).toBeNull();
  });

  it("leaves a catalog with no logical-test metadata in its existing sortOrder", async () => {
    const { jobs, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    createdParamDeviceTypeIds.push(deviceTypeId);
    const capabilityItemId = await capabilityItem();
    const base = { deviceTypeId, capabilityItemId, valueType: "NUMBER" as const };

    await prisma.deviceCalibrationParameter.create({
      data: { ...base, code: "LG_1", name: "Suhu", sortOrder: 10 },
    });
    await prisma.deviceCalibrationParameter.create({
      data: { ...base, code: "LG_2", name: "RH", sortOrder: 20 },
    });
    await prisma.deviceCalibrationParameter.create({
      data: { ...base, code: "LG_3", name: "Tegangan", sortOrder: 30 },
    });

    const listed = await calibrationJobsService.listMeasurementParameters(realCompanyId, jobs[0]!.id);

    expect(listed.parameters.map((p) => p.code)).toEqual(["LG_1", "LG_2", "LG_3"]);
    expect(listed.parameters.map((p) => p.logicalTestKey)).toEqual([null, null, null]);
    expect(listed.parameters.map((p) => p.logicalTestSequence)).toEqual([null, null, null]);
  });

  it("groups Pattern B quantities without collapsing their own test points", async () => {
    const { jobs, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    createdParamDeviceTypeIds.push(deviceTypeId);
    const capabilityItemId = await capabilityItem();
    const base = { deviceTypeId, capabilityItemId, valueType: "NUMBER" as const };

    const eyepiece = await prisma.deviceCalibrationParameter.create({
      data: {
        ...base,
        code: "LT_OKULER",
        name: "Okuler",
        sortOrder: 20,
        logicalTestKey: "micro-4x",
        logicalTestSequence: 2,
      },
    });
    const stage = await prisma.deviceCalibrationParameter.create({
      data: {
        ...base,
        code: "LT_STAGE",
        name: "Stage",
        sortOrder: 10,
        logicalTestKey: "micro-4x",
        logicalTestSequence: 1,
      },
    });
    await prisma.calibrationTestPoint.createMany({
      data: [
        { deviceCalibrationParameterId: stage.id, sequence: 1, settingLabel: "10 µm" },
        { deviceCalibrationParameterId: eyepiece.id, sequence: 1, settingLabel: "10 µm" },
      ],
    });

    const listed = await calibrationJobsService.listMeasurementParameters(realCompanyId, jobs[0]!.id);

    // Both quantities are Pattern B; grouping orders them, test points survive.
    expect(listed.gridParameters.map((p) => p.code)).toEqual(["LT_STAGE", "LT_OKULER"]);
    expect(listed.gridParameters[0]?.testPoints.map((tp) => tp.settingLabel)).toEqual(["10 µm"]);
    expect(listed.gridParameters[1]?.testPoints.map((tp) => tp.settingLabel)).toEqual(["10 µm"]);
  });

  it("started job does not acquire a test point added to the master catalog later", async () => {
    const { jobs, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    createdParamDeviceTypeIds.push(deviceTypeId);
    const capabilityItemId = await capabilityItem();
    const param = await prisma.deviceCalibrationParameter.create({
      data: {
        deviceTypeId,
        capabilityItemId,
        code: "SNAP_LIVE",
        name: "HR",
        valueType: "NUMBER",
        sortOrder: 10,
      },
    });
    const first = await prisma.calibrationTestPoint.create({
      data: { deviceCalibrationParameterId: param.id, sequence: 1, settingLabel: "30 BPM", settingValue: 30 },
    });

    await completeKontrolAlatForStart(realCompanyId, jobs[0]!.id);
    await calibrationJobsService.start(realCompanyId, jobs[0]!.id);

    await prisma.calibrationTestPoint.create({
      data: { deviceCalibrationParameterId: param.id, sequence: 2, settingLabel: "60 BPM", settingValue: 60 },
    });
    await prisma.calibrationTestPoint.update({
      where: { id: first.id },
      data: { settingLabel: "30 BPM renamed", isActive: false },
    });

    const listed = await calibrationJobsService.listMeasurementParameters(realCompanyId, jobs[0]!.id);
    expect(listed.gridParameters[0]?.testPoints.map((tp) => tp.settingLabel)).toEqual(["30 BPM"]);
    expect(listed.gridParameters[0]?.testPoints.map((tp) => tp.id)).toEqual([first.id]);

    const snapCount = await prisma.jobCalibrationTestPoint.count({
      where: { calibrationJobId: jobs[0]!.id },
    });
    expect(snapCount).toBe(1);
  });

  it("duplicate start does not duplicate snapshot rows", async () => {
    const { jobs, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    createdParamDeviceTypeIds.push(deviceTypeId);
    const capabilityItemId = await capabilityItem();
    const param = await prisma.deviceCalibrationParameter.create({
      data: {
        deviceTypeId,
        capabilityItemId,
        code: "SNAP_DUP",
        name: "Dup",
        valueType: "NUMBER",
        sortOrder: 10,
      },
    });
    await prisma.calibrationTestPoint.create({
      data: { deviceCalibrationParameterId: param.id, sequence: 1, settingLabel: "Awal" },
    });
    await completeKontrolAlatForStart(realCompanyId, jobs[0]!.id);
    await calibrationJobsService.start(realCompanyId, jobs[0]!.id);
    await expect(calibrationJobsService.start(realCompanyId, jobs[0]!.id)).rejects.toMatchObject({
      response: { code: "CALIBRATION_JOB_ALREADY_STARTED" },
    });
    expect(
      await prisma.jobCalibrationTestPoint.count({ where: { calibrationJobId: jobs[0]!.id } }),
    ).toBe(1);
  });

  it("rolls back the job to PENDING if snapshot copy fails inside start()", async () => {
    const { jobs, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    createdParamDeviceTypeIds.push(deviceTypeId);
    const capabilityItemId = await capabilityItem();
    const param = await prisma.deviceCalibrationParameter.create({
      data: {
        deviceTypeId,
        capabilityItemId,
        code: "SNAP_TX",
        name: "Tx",
        valueType: "NUMBER",
        sortOrder: 10,
      },
    });
    await prisma.calibrationTestPoint.create({
      data: { deviceCalibrationParameterId: param.id, sequence: 1, settingLabel: "Awal" },
    });
    await completeKontrolAlatForStart(realCompanyId, jobs[0]!.id);
    const txSpy = vi.spyOn(prisma, "$transaction").mockImplementationOnce(async (arg) => {
      if (typeof arg !== "function") {
        throw new Error("expected interactive transaction");
      }
      return prisma.$transaction(async (tx) => {
        vi.spyOn(tx.jobCalibrationTestPoint, "createMany").mockRejectedValueOnce(new Error("copy failed"));
        return arg(tx);
      });
    });
    await expect(calibrationJobsService.start(realCompanyId, jobs[0]!.id)).rejects.toThrow("copy failed");
    txSpy.mockRestore();
    const job = await prisma.calibrationJob.findUniqueOrThrow({ where: { id: jobs[0]!.id } });
    expect(job.status).toBe("PENDING");
    expect(job.startedAt).toBeNull();
    expect(job.measurementTestPointsSnapshottedAt).toBeNull();
    expect(await prisma.jobCalibrationTestPoint.count({ where: { calibrationJobId: jobs[0]!.id } })).toBe(0);
  });

  it("resumeAfterRework does not rewrite the snapshot", async () => {
    const { jobs, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    createdParamDeviceTypeIds.push(deviceTypeId);
    const capabilityItemId = await capabilityItem();
    const param = await prisma.deviceCalibrationParameter.create({
      data: {
        deviceTypeId,
        capabilityItemId,
        code: "SNAP_RW",
        name: "Rework",
        valueType: "NUMBER",
        sortOrder: 10,
      },
    });
    await prisma.calibrationTestPoint.create({
      data: { deviceCalibrationParameterId: param.id, sequence: 1, settingLabel: "Awal" },
    });
    await completeKontrolAlatForStart(realCompanyId, jobs[0]!.id);
    await calibrationJobsService.start(realCompanyId, jobs[0]!.id);
    await prisma.calibrationTestPoint.create({
      data: { deviceCalibrationParameterId: param.id, sequence: 2, settingLabel: "Akhir" },
    });
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: { status: "REWORK" },
    });
    await calibrationJobsService.resumeAfterRework(realCompanyId, jobs[0]!.id);
    const snaps = await prisma.jobCalibrationTestPoint.findMany({
      where: { calibrationJobId: jobs[0]!.id },
    });
    expect(snaps.map((s) => s.settingLabel)).toEqual(["Awal"]);
  });

  // ── Phase 4B (Gap B) ── DERIVED participates in the same worksheet flow ──

  it("includes an active DERIVED parameter in Pattern A alongside DIRECT_REPLICATES", async () => {
    const { jobs, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    createdParamDeviceTypeIds.push(deviceTypeId);
    const capabilityItemId = await capabilityItem();
    const base = { deviceTypeId, capabilityItemId, valueType: "NUMBER" as const };

    await prisma.deviceCalibrationParameter.create({
      data: { ...base, code: "PH4B_DIRECT", name: "Suhu", sortOrder: 10 },
    });
    await prisma.deviceCalibrationParameter.create({
      data: {
        ...base,
        code: "PH4B_DERIVED",
        name: "Selisih Suhu",
        sortOrder: 20,
        entryStyle: "DERIVED",
        derivation: { description: "Difference between S1 and S3" },
      },
    });

    const listed = await calibrationJobsService.listMeasurementParameters(realCompanyId, jobs[0]!.id);

    expect(listed.parameters.map((p) => p.code)).toEqual(["PH4B_DIRECT", "PH4B_DERIVED"]);
  });

  it("still excludes LOGGER_SUMMARY once DERIVED is included", async () => {
    const { jobs, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    createdParamDeviceTypeIds.push(deviceTypeId);
    const capabilityItemId = await capabilityItem();
    const base = { deviceTypeId, capabilityItemId, valueType: "NUMBER" as const };

    await prisma.deviceCalibrationParameter.create({
      data: { ...base, code: "PH4B_DERIVED2", name: "Rasio", sortOrder: 10, entryStyle: "DERIVED" },
    });
    await prisma.deviceCalibrationParameter.create({
      data: {
        ...base,
        code: "PH4B_LOGGER",
        name: "Keseragaman Suhu",
        sortOrder: 20,
        entryStyle: "LOGGER_SUMMARY",
      },
    });

    const listed = await calibrationJobsService.listMeasurementParameters(realCompanyId, jobs[0]!.id);

    expect(listed.parameters.map((p) => p.code)).toEqual(["PH4B_DERIVED2"]);
    expect(listed.parameters.some((p) => p.code === "PH4B_LOGGER")).toBe(false);
  });

  it("puts a DERIVED parameter with active test points into gridParameters (Pattern B)", async () => {
    const { jobs, deviceTypeId } = await startedWorkOrderJobs(realCompanyId);
    createdParamDeviceTypeIds.push(deviceTypeId);
    const capabilityItemId = await capabilityItem();
    const param = await prisma.deviceCalibrationParameter.create({
      data: {
        deviceTypeId,
        capabilityItemId,
        code: "PH4B_DERIVED_GRID",
        name: "Selisih per titik",
        valueType: "NUMBER",
        sortOrder: 10,
        entryStyle: "DERIVED",
      },
    });
    await prisma.calibrationTestPoint.create({
      data: { deviceCalibrationParameterId: param.id, sequence: 1, settingLabel: "Titik 1" },
    });

    const listed = await calibrationJobsService.listMeasurementParameters(realCompanyId, jobs[0]!.id);

    expect(listed.gridParameters.map((p) => p.code)).toEqual(["PH4B_DERIVED_GRID"]);
    expect(listed.parameters.some((p) => p.code === "PH4B_DERIVED_GRID")).toBe(false);
  });
});

describe("CalibrationJobsService — submitForReview measurement completeness", () => {
  const createdParamDeviceTypeIds: string[] = [];

  async function capabilityItem() {
    const capability = await prisma.deviceCapability.create({
      data: { code: `CMPCAP-${randomUUID().slice(0, 8).toUpperCase()}`, name: "Cmp Capability" },
    });
    createdCapabilityIds.push(capability.id);
    const item = await prisma.deviceCapabilityItem.create({
      data: { capabilityId: capability.id, name: "Cmp Item" },
    });
    return item.id;
  }

  afterAll(async () => {
    if (createdParamDeviceTypeIds.length > 0) {
      await prisma.measurementResult.deleteMany({
        where: { parameter: { deviceTypeId: { in: createdParamDeviceTypeIds } } },
      });
      await prisma.jobCalibrationTestPoint.deleteMany({
        where: { parameter: { deviceTypeId: { in: createdParamDeviceTypeIds } } },
      });
      await prisma.calibrationTestPoint.deleteMany({
        where: { parameter: { deviceTypeId: { in: createdParamDeviceTypeIds } } },
      });
      await prisma.deviceCalibrationParameter.deleteMany({
        where: { deviceTypeId: { in: createdParamDeviceTypeIds } },
      });
    }
  });

  async function startJobWithParams(setup: (deviceTypeId: string) => Promise<void>) {
    const ctx = await startedWorkOrderJobs(realCompanyId);
    createdParamDeviceTypeIds.push(ctx.deviceTypeId);
    await setup(ctx.deviceTypeId);
    await completeKontrolAlatForStart(realCompanyId, ctx.jobs[0]!.id);
    const job = await calibrationJobsService.start(realCompanyId, ctx.jobs[0]!.id);
    const technician = await makeMember(realCompanyId, "TECHNICIAN");
    return { ...ctx, job, technician };
  }

  it("rejects Pattern A with zero filled results", async () => {
    const capabilityItemId = await capabilityItem();
    const ctx = await startJobWithParams(async (deviceTypeId) => {
      await prisma.deviceCalibrationParameter.create({
        data: {
          deviceTypeId,
          capabilityItemId,
          code: "CMP_A0",
          name: "Room temp",
          valueType: "NUMBER",
          sortOrder: 10,
        },
      });
    });
    await expect(calibrationJobsService.submitForReview(realCompanyId, ctx.job.id)).rejects.toMatchObject(
      { response: { code: "CALIBRATION_MEASUREMENTS_INCOMPLETE" } },
    );
  });

  it("allows Pattern A with one filled result (including fewer than 5 reps)", async () => {
    const capabilityItemId = await capabilityItem();
    const ctx = await startJobWithParams(async (deviceTypeId) => {
      await prisma.deviceCalibrationParameter.create({
        data: {
          deviceTypeId,
          capabilityItemId,
          code: "CMP_A1",
          name: "Room temp",
          valueType: "NUMBER",
          sortOrder: 10,
          toleranceMin: 0,
          toleranceMax: 100,
        },
      });
    });
    const param = await prisma.deviceCalibrationParameter.findFirstOrThrow({
      where: { deviceTypeId: ctx.deviceTypeId, code: "CMP_A1" },
    });
    await measurementResultsService.create(
      realCompanyId,
      {
        calibrationJobId: ctx.job.id,
        deviceCalibrationParameterId: param.id,
        replicateIndex: 1,
        measuredValue: 22,
      },
      ctx.technician.id,
    );
    const submitted = await calibrationJobsService.submitForReview(realCompanyId, ctx.job.id);
    expect(submitted.status).toBe("SUBMITTED");
  });

  it("rejects Pattern A when the only row is empty", async () => {
    const capabilityItemId = await capabilityItem();
    const ctx = await startJobWithParams(async (deviceTypeId) => {
      await prisma.deviceCalibrationParameter.create({
        data: {
          deviceTypeId,
          capabilityItemId,
          code: "CMP_AE",
          name: "Room temp",
          valueType: "NUMBER",
          sortOrder: 10,
        },
      });
    });
    const param = await prisma.deviceCalibrationParameter.findFirstOrThrow({
      where: { deviceTypeId: ctx.deviceTypeId, code: "CMP_AE" },
    });
    await prisma.measurementResult.create({
      data: {
        companyId: realCompanyId,
        calibrationJobId: ctx.job.id,
        deviceCalibrationParameterId: param.id,
        replicateIndex: 1,
        attemptNumber: 1,
        measuredValue: null,
        measuredText: null,
      },
    });
    await expect(calibrationJobsService.submitForReview(realCompanyId, ctx.job.id)).rejects.toMatchObject(
      { response: { code: "CALIBRATION_MEASUREMENTS_INCOMPLETE" } },
    );
  });

  it("rejects Pattern B when one named snapshot point is missing", async () => {
    const capabilityItemId = await capabilityItem();
    const ctx = await startJobWithParams(async (deviceTypeId) => {
      const param = await prisma.deviceCalibrationParameter.create({
        data: {
          deviceTypeId,
          capabilityItemId,
          code: "CMP_B_MISS",
          name: "Env",
          valueType: "NUMBER",
          sortOrder: 10,
          toleranceMin: 0,
          toleranceMax: 100,
        },
      });
      await prisma.calibrationTestPoint.createMany({
        data: [
          { deviceCalibrationParameterId: param.id, sequence: 1, settingLabel: "Awal" },
          { deviceCalibrationParameterId: param.id, sequence: 2, settingLabel: "Akhir" },
        ],
      });
    });
    const param = await prisma.deviceCalibrationParameter.findFirstOrThrow({
      where: { deviceTypeId: ctx.deviceTypeId, code: "CMP_B_MISS" },
    });
    const awal = await prisma.calibrationTestPoint.findFirstOrThrow({
      where: { deviceCalibrationParameterId: param.id, settingLabel: "Awal" },
    });
    await measurementResultsService.create(
      realCompanyId,
      {
        calibrationJobId: ctx.job.id,
        deviceCalibrationParameterId: param.id,
        calibrationTestPointId: awal.id,
        replicateIndex: 1,
        measuredValue: 25,
      },
      ctx.technician.id,
    );
    await expect(calibrationJobsService.submitForReview(realCompanyId, ctx.job.id)).rejects.toMatchObject({
      response: {
        code: "CALIBRATION_MEASUREMENTS_INCOMPLETE",
        details: {
          parameters: [{ parameterId: param.id, missingTestPointIds: [expect.any(String)] }],
        },
      },
    });
  });

  it("allows Pattern B when every snapshot point has at least one filled result", async () => {
    const capabilityItemId = await capabilityItem();
    const ctx = await startJobWithParams(async (deviceTypeId) => {
      const param = await prisma.deviceCalibrationParameter.create({
        data: {
          deviceTypeId,
          capabilityItemId,
          code: "CMP_B_OK",
          name: "Env",
          valueType: "NUMBER",
          sortOrder: 10,
          toleranceMin: 0,
          toleranceMax: 100,
        },
      });
      await prisma.calibrationTestPoint.createMany({
        data: [
          { deviceCalibrationParameterId: param.id, sequence: 1, settingLabel: "Awal" },
          { deviceCalibrationParameterId: param.id, sequence: 2, settingLabel: "Akhir" },
        ],
      });
    });
    const param = await prisma.deviceCalibrationParameter.findFirstOrThrow({
      where: { deviceTypeId: ctx.deviceTypeId, code: "CMP_B_OK" },
    });
    const points = await prisma.calibrationTestPoint.findMany({
      where: { deviceCalibrationParameterId: param.id },
      orderBy: { sequence: "asc" },
    });
    await measurementResultsService.create(
      realCompanyId,
      {
        calibrationJobId: ctx.job.id,
        deviceCalibrationParameterId: param.id,
        calibrationTestPointId: points[0]!.id,
        replicateIndex: 1,
        measuredValue: 25,
      },
      ctx.technician.id,
    );
    await measurementResultsService.create(
      realCompanyId,
      {
        calibrationJobId: ctx.job.id,
        deviceCalibrationParameterId: param.id,
        calibrationTestPointId: points[0]!.id,
        replicateIndex: 2,
        measuredValue: 25.1,
      },
      ctx.technician.id,
    );
    await measurementResultsService.create(
      realCompanyId,
      {
        calibrationJobId: ctx.job.id,
        deviceCalibrationParameterId: param.id,
        calibrationTestPointId: points[1]!.id,
        replicateIndex: 1,
        measuredValue: null,
        measuredText: "OL",
      },
      ctx.technician.id,
    );
    const submitted = await calibrationJobsService.submitForReview(realCompanyId, ctx.job.id);
    expect(submitted.status).toBe("SUBMITTED");
  });

  it("allows a filled result outside tolerance", async () => {
    const capabilityItemId = await capabilityItem();
    const ctx = await startJobWithParams(async (deviceTypeId) => {
      await prisma.deviceCalibrationParameter.create({
        data: {
          deviceTypeId,
          capabilityItemId,
          code: "CMP_FAIL",
          name: "HR",
          valueType: "NUMBER",
          sortOrder: 10,
          toleranceMin: 0,
          toleranceMax: 10,
        },
      });
    });
    const param = await prisma.deviceCalibrationParameter.findFirstOrThrow({
      where: { deviceTypeId: ctx.deviceTypeId, code: "CMP_FAIL" },
    });
    const row = await measurementResultsService.create(
      realCompanyId,
      {
        calibrationJobId: ctx.job.id,
        deviceCalibrationParameterId: param.id,
        replicateIndex: 1,
        measuredValue: 99,
      },
      ctx.technician.id,
    );
    expect(row.isWithinTolerance).toBe(false);
    const submitted = await calibrationJobsService.submitForReview(realCompanyId, ctx.job.id);
    expect(submitted.status).toBe("SUBMITTED");
  });

  it("does not let attempt 1 results complete attempt 2 after REWORK", async () => {
    const capabilityItemId = await capabilityItem();
    const ctx = await startJobWithParams(async (deviceTypeId) => {
      await prisma.deviceCalibrationParameter.create({
        data: {
          deviceTypeId,
          capabilityItemId,
          code: "CMP_RW",
          name: "Room temp",
          valueType: "NUMBER",
          sortOrder: 10,
          toleranceMin: 0,
          toleranceMax: 100,
        },
      });
    });
    const param = await prisma.deviceCalibrationParameter.findFirstOrThrow({
      where: { deviceTypeId: ctx.deviceTypeId, code: "CMP_RW" },
    });
    await measurementResultsService.create(
      realCompanyId,
      {
        calibrationJobId: ctx.job.id,
        deviceCalibrationParameterId: param.id,
        replicateIndex: 1,
        measuredValue: 22,
      },
      ctx.technician.id,
    );
    await calibrationJobsService.submitForReview(realCompanyId, ctx.job.id);
    const manager = await makeMember(realCompanyId, "TECHNICIAN_MANAGER");
    await calibrationJobsService.decideQualityReview(realCompanyId, ctx.job.id, manager.id, {
      decision: "REJECT",
      notes: "ulang",
    });
    await expect(calibrationJobsService.submitForReview(realCompanyId, ctx.job.id)).rejects.toMatchObject(
      { response: { code: "CALIBRATION_JOB_NOT_IN_PROGRESS" } },
    );
    await calibrationJobsService.resumeAfterRework(realCompanyId, ctx.job.id);
    await expect(calibrationJobsService.submitForReview(realCompanyId, ctx.job.id)).rejects.toMatchObject(
      { response: { code: "CALIBRATION_MEASUREMENTS_INCOMPLETE" } },
    );
    await measurementResultsService.create(
      realCompanyId,
      {
        calibrationJobId: ctx.job.id,
        deviceCalibrationParameterId: param.id,
        replicateIndex: 1,
        measuredValue: 23,
      },
      ctx.technician.id,
    );
    const submitted = await calibrationJobsService.submitForReview(realCompanyId, ctx.job.id);
    expect(submitted.status).toBe("SUBMITTED");
    expect(submitted.currentAttempt).toBe(2);
  });

  it("keeps zero-snapshot environment parameters as Pattern A (historical BSM shape)", async () => {
    const capabilityItemId = await capabilityItem();
    const ctx = await startJobWithParams(async (deviceTypeId) => {
      await prisma.deviceCalibrationParameter.create({
        data: {
          deviceTypeId,
          capabilityItemId,
          code: "BSM_ROOM_TEMP_HIST",
          name: "Suhu ruangan",
          valueType: "NUMBER",
          sortOrder: 10,
          toleranceMin: 0,
          toleranceMax: 50,
        },
      });
    });
    const snaps = await prisma.jobCalibrationTestPoint.count({
      where: { calibrationJobId: ctx.job.id },
    });
    expect(snaps).toBe(0);
    const param = await prisma.deviceCalibrationParameter.findFirstOrThrow({
      where: { deviceTypeId: ctx.deviceTypeId, code: "BSM_ROOM_TEMP_HIST" },
    });
    const row = await measurementResultsService.create(
      realCompanyId,
      {
        calibrationJobId: ctx.job.id,
        deviceCalibrationParameterId: param.id,
        replicateIndex: 1,
        measuredValue: 25.1,
      },
      ctx.technician.id,
    );
    expect(row.calibrationTestPointId).toBeNull();
    await prisma.calibrationTestPoint.create({
      data: { deviceCalibrationParameterId: param.id, sequence: 1, settingLabel: "Awal" },
    });
    const submitted = await calibrationJobsService.submitForReview(realCompanyId, ctx.job.id);
    expect(submitted.status).toBe("SUBMITTED");
    expect(row.calibrationTestPointId).toBeNull();
  });

  // ── Phase 4B (Gap B) ── a DERIVED parameter is optional at submit ──
  // (deliberately unchanged from before this phase — see Report 08 §9.B.7,
  // an explicitly open business question this phase does not resolve).

  it("does not require an empty DERIVED parameter before submit", async () => {
    const capabilityItemId = await capabilityItem();
    const ctx = await startJobWithParams(async (deviceTypeId) => {
      await prisma.deviceCalibrationParameter.create({
        data: {
          deviceTypeId,
          capabilityItemId,
          code: "PH4B_CMP_DIRECT",
          name: "Room temp",
          valueType: "NUMBER",
          sortOrder: 10,
        },
      });
      await prisma.deviceCalibrationParameter.create({
        data: {
          deviceTypeId,
          capabilityItemId,
          code: "PH4B_CMP_DERIVED",
          name: "Selisih suhu",
          valueType: "NUMBER",
          sortOrder: 20,
          entryStyle: "DERIVED",
        },
      });
    });
    const direct = await prisma.deviceCalibrationParameter.findFirstOrThrow({
      where: { deviceTypeId: ctx.deviceTypeId, code: "PH4B_CMP_DIRECT" },
    });
    await measurementResultsService.create(
      realCompanyId,
      {
        calibrationJobId: ctx.job.id,
        deviceCalibrationParameterId: direct.id,
        replicateIndex: 1,
        measuredValue: 22,
      },
      ctx.technician.id,
    );

    // PH4B_CMP_DERIVED has zero MeasurementResult rows and submit must still
    // succeed — it never entered eligibleParameterIds.
    const submitted = await calibrationJobsService.submitForReview(realCompanyId, ctx.job.id);
    expect(submitted.status).toBe("SUBMITTED");
  });

  it("accepts a manually typed DERIVED reading and still does not gate on it", async () => {
    const capabilityItemId = await capabilityItem();
    const ctx = await startJobWithParams(async (deviceTypeId) => {
      await prisma.deviceCalibrationParameter.create({
        data: {
          deviceTypeId,
          capabilityItemId,
          code: "PH4B_CMP_DIRECT2",
          name: "Room temp",
          valueType: "NUMBER",
          sortOrder: 10,
        },
      });
      await prisma.deviceCalibrationParameter.create({
        data: {
          deviceTypeId,
          capabilityItemId,
          code: "PH4B_CMP_DERIVED2",
          name: "Selisih suhu",
          valueType: "NUMBER",
          sortOrder: 20,
          entryStyle: "DERIVED",
          derivation: { description: "Difference between S1 and S3" },
        },
      });
    });
    const direct = await prisma.deviceCalibrationParameter.findFirstOrThrow({
      where: { deviceTypeId: ctx.deviceTypeId, code: "PH4B_CMP_DIRECT2" },
    });
    const derived = await prisma.deviceCalibrationParameter.findFirstOrThrow({
      where: { deviceTypeId: ctx.deviceTypeId, code: "PH4B_CMP_DERIVED2" },
    });
    await measurementResultsService.create(
      realCompanyId,
      {
        calibrationJobId: ctx.job.id,
        deviceCalibrationParameterId: direct.id,
        replicateIndex: 1,
        measuredValue: 22,
      },
      ctx.technician.id,
    );
    // The technician types the derived value in by hand — an ordinary
    // MeasurementResult write. No formula runs; nothing computes this.
    const derivedRow = await measurementResultsService.create(
      realCompanyId,
      {
        calibrationJobId: ctx.job.id,
        deviceCalibrationParameterId: derived.id,
        replicateIndex: 1,
        measuredValue: 0.3,
      },
      ctx.technician.id,
    );
    expect(derivedRow.measuredValue?.toString()).toBe("0.3");

    const submitted = await calibrationJobsService.submitForReview(realCompanyId, ctx.job.id);
    expect(submitted.status).toBe("SUBMITTED");
  });
});

